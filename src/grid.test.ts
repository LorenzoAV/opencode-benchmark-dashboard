import { describe, test, expect } from "bun:test";
import { buildCells, filterCells } from "./grid.ts";
import type { LadderStage } from "./grid.ts";
import { runCells } from "./grid-runner.ts";
import type { CellRunnerDeps } from "./grid-runner.ts";
import type { ModelCostEntry, CellCostBudget } from "./cost-gate.ts";
import type { RegistryRecord } from "./registry.ts";
import type { CellKey } from "./types.ts";

const budget: CellCostBudget = { maxOutputTokens: 1_000_000, promptChars: 4_000_000, fixtureChars: 0 };
const cheapBudget: CellCostBudget = { maxOutputTokens: 1000, promptChars: 400, fixtureChars: 0 };

const paidEntry: ModelCostEntry = { route: "paid-other", costSource: "registry", costPerMillion: { input: 1, output: 1 } };
const freeEntry: ModelCostEntry = { route: "free", costSource: "registry", costPerMillion: { input: null, output: null } };
const priceyEntry: ModelCostEntry = { route: "paid-other", costSource: "registry", costPerMillion: { input: 1, output: 20 } };

describe("buildCells", () => {
  test("produces the cartesian product with the right size", () => {
    const cells = buildCells({
      models: ["a", "b"],
      variants: ["base", "strict"],
      efforts: ["default"],
      cases: ["c1"],
      repetitions: [1, 2],
    });
    expect(cells).toHaveLength(2 * 2 * 1 * 1 * 2);
  });

  test("keeps a stable, model-major order", () => {
    const cells = buildCells({
      models: ["a", "b"],
      variants: ["base", "strict"],
      efforts: ["default"],
      cases: ["c1"],
      repetitions: [1],
    });
    expect(cells.map((cell) => `${cell.model}/${cell.variant}`)).toEqual([
      "a/base",
      "a/strict",
      "b/base",
      "b/strict",
    ]);
  });
});

describe("filterCells", () => {
  const ladder: LadderStage[] = [
    { name: "1", cellCap: 0.1, requiresAuthorization: false },
    { name: "2", cellCap: 1.0, requiresAuthorization: false },
  ];

  test("refuses a high-output cell without authorization, with its reason", () => {
    const cells = buildCells({ models: ["c"], variants: ["1"], efforts: ["default"], cases: ["c1"], repetitions: [1] });
    const result = filterCells(cells, {
      ladder: [{ name: "1", cellCap: 2.0, requiresAuthorization: false }],
      stageOf: (cell) => cell.variant,
      entryOf: () => priceyEntry,
      budgetOf: () => cheapBudget,
      hasAuthorization: () => false,
    });
    expect(result.allowed).toHaveLength(0);
    expect(result.refused).toEqual([{ cell: cells[0], reason: "output-price-unauthorized" }]);
  });

  test("refuses an estimate above the cap, with its reason", () => {
    const cells = buildCells({ models: ["a"], variants: ["1"], efforts: ["default"], cases: ["c1"], repetitions: [1] });
    const result = filterCells(cells, {
      ladder,
      stageOf: (cell) => cell.variant,
      entryOf: () => paidEntry,
      budgetOf: () => budget,
      hasAuthorization: () => false,
    });
    expect(result.refused).toEqual([{ cell: cells[0], reason: "cell-cap-exceeded" }]);
  });

  test("blocks a model that did not survive the previous stage", () => {
    const cells = buildCells({ models: ["a", "b"], variants: ["1", "2"], efforts: ["default"], cases: ["c1"], repetitions: [1] });
    const result = filterCells(cells, {
      ladder,
      stageOf: (cell) => cell.variant,
      entryOf: (model) => (model === "a" ? paidEntry : freeEntry),
      budgetOf: () => budget,
      hasAuthorization: () => false,
    });

    expect(result.allowed.map((cell) => `${cell.model}/${cell.variant}`)).toEqual(["b/1", "b/2"]);
    expect(result.refused).toEqual([
      { cell: cells[0], reason: "cell-cap-exceeded" },
      { cell: cells[1], reason: "ladder-blocked" },
    ]);
  });
});

describe("runCells", () => {
  const cell: CellKey = { model: "m", variant: "base", effort: "default", case: "c1", repetition: 1 };

  function makeDeps(overrides: Partial<CellRunnerDeps> = {}): { deps: CellRunnerDeps; written: RegistryRecord[] } {
    const written: RegistryRecord[] = [];
    const deps: CellRunnerDeps = {
      runId: "run-1",
      engine: { commit: "test", opencodeVersion: "test" },
      roleOf: () => "coder",
      expectedExitOf: () => 0,
      materialize: () => ({ configDir: "C:/tmp/variant", agentName: "coder" }),
      runAgent: async () => ({ ok: true, result: { output: "pong", tokensIn: 10, tokensOut: 2, costUsd: 0, costSource: "provider" } }),
      runOracle: async () => ({ ok: true, result: { command: "cargo test", exit: 0, durationMs: 12, initialFails: true, output: "ok", timedOut: false } }),
      appendRecord: (record) => written.push(record),
      now: () => "2026-09-24T00:00:00Z",
      ...overrides,
    };
    return { deps, written };
  }

  test("a running cell writes its completed line to the registry", async () => {
    const { deps, written } = makeDeps();
    const records = await runCells([cell], deps);
    expect(records).toHaveLength(1);
    expect(written).toHaveLength(1);
    expect(written[0].result.correct).toBe(true);
    expect(written[0].usage.tokensIn).toBe(10);
    expect(written[0].result.oracle?.command).toBe("cargo test");
    expect(written[0].cell.role).toBe("coder");
  });

  test("a factory error leaves the cell refused with that reason", async () => {
    const { deps, written } = makeDeps({ runAgent: async () => ({ ok: false, error: "variant-missing" }) });
    const records = await runCells([cell], deps);
    expect(records[0].result.refused).toBe(true);
    expect(records[0].result.reason).toBe("variant-missing");
    expect(written[0].result.correct).toBe(false);
  });

  test("an oracle error leaves the cell refused with that reason", async () => {
    const { deps } = makeDeps({ runOracle: async () => ({ ok: false, error: "fixture-does-not-fail-initially" }) });
    const records = await runCells([cell], deps);
    expect(records[0].result.refused).toBe(true);
    expect(records[0].result.reason).toBe("fixture-does-not-fail-initially");
  });
});
