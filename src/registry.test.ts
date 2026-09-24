import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildCellKey,
  serializeRegistryLine,
  parseRegistryLines,
  summarizeRegistry,
  appendRegistryLine,
  readRegistryFile,
  refusedResult,
  isRefusedRecord,
} from "./registry.ts";
import type { RegistryRecord } from "./registry.ts";

function makeRecord(overrides: Partial<RegistryRecord> = {}): RegistryRecord {
  const base: RegistryRecord = {
    runId: "run-1",
    startedAt: "2026-09-24T12:00:00Z",
    cell: {
      model: "nvidia/nemotron",
      variant: "base",
      effort: "default",
      role: "coder",
      case: "CODING-typescript-rust",
      repetition: 1,
    },
    result: { correct: true, score: 1, oracle: { command: "cargo test", exit: 0, durationMs: 4200 } },
    usage: { tokensIn: 1234, tokensOut: 567, costUsd: 0.0012, costSource: "provider" },
    latencyMs: 43210,
    providerFailureClass: null,
    engine: { commit: "42b3e10", opencodeVersion: "1.0.0" },
  };
  return {
    ...base,
    ...overrides,
    cell: { ...base.cell, ...(overrides.cell ?? {}) },
    result: { ...base.result, ...(overrides.result ?? {}) },
    usage: { ...base.usage, ...(overrides.usage ?? {}) },
  };
}

describe("buildCellKey", () => {
  test("two cells of the same model with different variants do not collide", () => {
    const base = makeRecord().cell;
    const baseKey = buildCellKey(base);
    const otherKey = buildCellKey({ ...base, variant: "strict" });
    expect(baseKey).not.toBe(otherKey);
  });

  test("cells that differ only by repetition do not collide", () => {
    const base = makeRecord().cell;
    expect(buildCellKey(base)).not.toBe(buildCellKey({ ...base, repetition: 2 }));
  });

  test("identical axes produce the same key", () => {
    const cell = makeRecord().cell;
    expect(buildCellKey(cell)).toBe(buildCellKey({ ...cell }));
  });
});

describe("serializeRegistryLine", () => {
  test("carries the shape of the design", () => {
    const line = serializeRegistryLine(makeRecord());
    const parsed = JSON.parse(line);
    expect(parsed.runId).toBe("run-1");
    expect(parsed.startedAt).toBe("2026-09-24T12:00:00Z");
    expect(parsed.cell.model).toBe("nvidia/nemotron");
    expect(parsed.result.correct).toBe(true);
    expect(parsed.usage.tokensOut).toBe(567);
    expect(parsed.latencyMs).toBe(43210);
    expect(parsed.providerFailureClass).toBeNull();
    expect(parsed.engine.commit).toBe("42b3e10");
  });

  test("a refused run is distinguishable from a run", () => {
    const ran = makeRecord();
    const refused = makeRecord({ result: refusedResult("cell-cap-exceeded") });
    expect(isRefusedRecord(ran)).toBe(false);
    expect(isRefusedRecord(refused)).toBe(true);
    expect(JSON.parse(serializeRegistryLine(refused)).result.refused).toBe(true);
  });
});

describe("parseRegistryLines", () => {
  test("skips and counts a malformed line without breaking the read", () => {
    const good = serializeRegistryLine(makeRecord());
    const content = [good, "{ not json", JSON.stringify({ nope: true }), good].join("\n");
    const parsed = parseRegistryLines(content);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.skipped).toBe(2);
  });

  test("ignores blank lines without counting them as malformed", () => {
    const good = serializeRegistryLine(makeRecord());
    const parsed = parseRegistryLines(`${good}\n\n   \n`);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.skipped).toBe(0);
  });
});

describe("summarizeRegistry", () => {
  const records = [
    makeRecord({
      cell: { model: "a", variant: "base", effort: "default", role: "coder", case: "c1", repetition: 1 },
    }),
    makeRecord({
      cell: { model: "a", variant: "strict", effort: "medium", role: "coder", case: "c1", repetition: 1 },
      usage: { tokensIn: 10, tokensOut: 20, costUsd: 0.5, costSource: "provider" },
      result: { correct: false, score: 0 },
      latencyMs: 1000,
    }),
    makeRecord({
      cell: { model: "b", variant: "base", effort: "default", role: "coder", case: "c1", repetition: 1 },
      usage: { tokensIn: 5, tokensOut: 5, costUsd: 0.25, costSource: "provider" },
      latencyMs: 3000,
    }),
  ];

  test("groups by model axis", () => {
    const summary = summarizeRegistry(records);
    const keys = summary.byModel.map((entry) => entry.key).sort();
    expect(keys).toEqual(["a", "b"]);
    const modelA = summary.byModel.find((entry) => entry.key === "a")!;
    expect(modelA.total).toBe(2);
    expect(modelA.correct).toBe(1);
    expect(modelA.totalCostUsd).toBeCloseTo(0.5012, 6);
  });

  test("groups by variant axis", () => {
    const summary = summarizeRegistry(records);
    const keys = summary.byVariant.map((entry) => entry.key).sort();
    expect(keys).toEqual(["base", "strict"]);
    expect(summary.byVariant.find((entry) => entry.key === "strict")!.total).toBe(1);
  });

  test("groups by effort axis", () => {
    const summary = summarizeRegistry(records);
    const keys = summary.byEffort.map((entry) => entry.key).sort();
    expect(keys).toEqual(["default", "medium"]);
    expect(summary.byEffort.find((entry) => entry.key === "medium")!.total).toBe(1);
  });

  test("counts refused records on their axis", () => {
    const withRefused = [
      ...records,
      makeRecord({
        cell: { model: "a", variant: "base", effort: "default", role: "coder", case: "c2", repetition: 1 },
        result: refusedResult("output-price-unauthorized"),
      }),
    ];
    const summary = summarizeRegistry(withRefused);
    expect(summary.byModel.find((entry) => entry.key === "a")!.refused).toBe(1);
  });
});

describe("registry file access", () => {
  let workDir: string;
  let filePath: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "registry-test-"));
    filePath = join(workDir, "cells.jsonl");
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  test("writes and reads back records from a temporary file outside the repo", () => {
    expect(filePath.startsWith(tmpdir())).toBe(true);
    expect(filePath.includes("opencode-benchmark-dashboard")).toBe(false);

    appendRegistryLine(filePath, makeRecord({ runId: "run-a" }));
    appendRegistryLine(filePath, makeRecord({ runId: "run-b" }));

    expect(existsSync(filePath)).toBe(true);
    const parsed = readRegistryFile(filePath);
    expect(parsed.records.map((record) => record.runId)).toEqual(["run-a", "run-b"]);
    expect(parsed.skipped).toBe(0);
  });

  test("returns an empty read for a missing file", () => {
    const parsed = readRegistryFile(join(workDir, "absent.jsonl"));
    expect(parsed.records).toHaveLength(0);
    expect(parsed.skipped).toBe(0);
  });
});
