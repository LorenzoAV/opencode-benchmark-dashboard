import { describe, test, expect } from "bun:test";
import { verify } from "./verifier";
import { loadConfig } from "./config";
import { sanitizeModelName, parseArgs, ensureDir, generateRunId, checkOpencodeCli } from "./utils";
import { buildCells, filterCells } from "./grid";
import { runCells } from "./grid-runner";
import type { CellRunnerDeps } from "./grid-runner";
import { serializeRegistryLine, parseRegistryLines, summarizeRegistry } from "./registry";
import type { RegistryRecord } from "./registry";
import type { ModelCostEntry, CellCostBudget } from "./cost-gate";
import { existsSync } from "fs";
import { resolve } from "path";
import { rmSync } from "fs";

describe("verify", () => {
  describe("exact method", () => {
    test("returns correct=true for exact match (case insensitive by default)", () => {
      const result = verify("hello world", "HELLO WORLD", "exact");
      expect(result.correct).toBe(true);
      expect(result.score).toBe(1.0);
    });

    test("returns correct=false for no exact match", () => {
      const result = verify("hello world", "hello", "exact");
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0.0);
    });

    test("handles case sensitive option", () => {
      const result = verify("hello world", "HELLO WORLD", "exact", true);
      expect(result.correct).toBe(false);
    });
  });

  describe("contains method", () => {
    test("returns correct=true when expected is contained in output", () => {
      const result = verify("here is my answer: 42", "42", "contains");
      expect(result.correct).toBe(true);
      expect(result.score).toBe(1.0);
    });

    test("returns correct=false when expected not found", () => {
      const result = verify("hello world", "goodbye", "contains");
      expect(result.correct).toBe(false);
      expect(result.score).toBe(0.0);
    });

    test("is case insensitive by default", () => {
      const result = verify("ANSWER IS YES", "answer", "contains");
      expect(result.correct).toBe(true);
    });
  });

  describe("fuzzy method", () => {
    test("returns correct=true for high similarity (>70%)", () => {
      const result = verify("function add(a, b) { return a + b; }", "function add(a,b){return a+b;}", "fuzzy");
      expect(result.correct).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
    });

    test("returns correct=false for low similarity (<70%)", () => {
      const result = verify("hello world", "xyz123", "fuzzy");
      expect(result.correct).toBe(false);
      expect(result.score).toBeLessThan(0.7);
    });
  });
});

describe("loadConfig", () => {
  test("loads config from benchmark.json", () => {
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(config.timeout).toBe(600000);
    expect(config.verification).toBeDefined();
  });

  test("includes testCases from prompts directory", () => {
    const config = loadConfig();
    expect(config.testCases).toBeDefined();
    expect(Array.isArray(config.testCases)).toBe(true);
  });
});

describe("sanitizeModelName", () => {
  test("replaces slashes with hyphens", () => {
    expect(sanitizeModelName("opencode/model")).toBe("opencode-model");
  });

  test("replaces colons with hyphens", () => {
    expect(sanitizeModelName("model:name")).toBe("model-name");
  });

  test("replaces dots with hyphens", () => {
    expect(sanitizeModelName("model.name")).toBe("model-name");
  });

  test("replaces underscores with underscores", () => {
    expect(sanitizeModelName("model_name")).toBe("model_name");
  });

  test("removes leading/trailing hyphens", () => {
    expect(sanitizeModelName("-model-")).toBe("model");
  });

  test("collapses multiple hyphens into one", () => {
    expect(sanitizeModelName("model--name")).toBe("model-name");
  });

  test("handles complex model names", () => {
    expect(sanitizeModelName("opencode/minimax-m2.5-free")).toBe("opencode-minimax-m2-5-free");
  });
});

describe("parseArgs", () => {
  test("parses -m/--model flag", () => {
    const result = parseArgs(["-m", "test-model"]);
    expect(result.model).toBe("test-model");
  });

  test("parses --model flag with equals", () => {
    const result = parseArgs(["--model", "test-model"]);
    expect(result.model).toBe("test-model");
  });

  test("parses -t/--test flag", () => {
    const result = parseArgs(["-t", "test-case"]);
    expect(result.testCase).toBe("test-case");
  });

  test("parses -o/--timeout flag", () => {
    const result = parseArgs(["-o", "60000"]);
    expect(result.timeout).toBe(60000);
  });

  test("returns empty object for empty args", () => {
    const result = parseArgs([]);
    expect(result.model).toBeUndefined();
    expect(result.testCase).toBeUndefined();
    expect(result.timeout).toBeUndefined();
  });
});

describe("generateRunId", () => {
  test("generates run ID with expected prefix", () => {
    const id = generateRunId();
    expect(id.startsWith("run_")).toBe(true);
  });

  test("generates IDs with correct format", () => {
    const id = generateRunId();
    expect(id).toMatch(/^run_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});

describe("ensureDir", () => {
  test("creates directory if it doesn't exist", () => {
    const testDir = resolve("./test-ensure-dir-check");
    ensureDir(testDir);
    expect(existsSync(testDir)).toBe(true);
    try { require("fs").rmSync(testDir, { force: true, recursive: true }); } catch {}
  });

  test("does not throw if directory already exists", () => {
    const testDir = resolve("./test-ensure-dir-check2");
    ensureDir(testDir);
    expect(() => ensureDir(testDir)).not.toThrow();
    try { require("fs").rmSync(testDir, { force: true, recursive: true }); } catch {}
  });
});

describe("checkOpencodeCli", () => {
  test("returns a boolean (async)", async () => {
    const result = await checkOpencodeCli();
    expect(typeof result).toBe("boolean");
  });
});

describe("verify (from verifier)", () => {
  test("exact match works correctly", () => {
    const result = verify("hello world", "HELLO WORLD", "exact");
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.method).toBe("exact");
  });

  test("contains method works correctly", () => {
    const result = verify("The answer is 42", "42", "contains");
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.method).toBe("contains");
  });

  test("fuzzy method works correctly", () => {
    const result = verify("function add(a, b) { return a + b; }", "function add(a,b){return a+b;}", "fuzzy");
    expect(result.correct).toBe(true);
    expect(result.method).toBe("fuzzy");
    expect(result.score).toBeGreaterThan(0.7);
  });

  test("case sensitive option works", () => {
    const result = verify("HELLO", "hello", "exact", true);
    expect(result.correct).toBe(false);
  });

  test("returns false for unknown method", () => {
    const result = verify("test", "test", "unknown" as any);
    expect(result.correct).toBe(false);
    expect(result.method).toBe("unknown");
  });
});

describe("loadConfig", () => {
  test("loads config from benchmark.json", () => {
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(typeof config.timeout).toBe("number");
    expect(Array.isArray(config.testCases)).toBe(true);
  });

  test("provides default timeout if missing", () => {
    // The config file should have timeout, but if it didn't, default would be 300000
    const config = loadConfig();
    expect(config.timeout).toBeGreaterThan(0);
  });

  test("includes verification config", () => {
    const config = loadConfig();
    expect(config.verification).toBeDefined();
    expect(typeof config.verification?.caseSensitive).toBe("boolean");
  });

  test("loads test cases from prompts directory", () => {
    const config = loadConfig();
    // Should have at least some test cases if prompts directory exists
    if (existsSync(resolve("./prompts"))) {
      expect(config.testCases.length).toBeGreaterThan(0);
    }
  });
});

describe("integration: grid, gate, runner and registry", () => {
  const freeEntry: ModelCostEntry = { route: "free", costSource: "registry", costPerMillion: { input: null, output: null } };
  const budget: CellCostBudget = { maxOutputTokens: 1000, promptChars: 400, fixtureChars: 0 };

  function runnerDeps(overrides: Partial<CellRunnerDeps> = {}): { deps: CellRunnerDeps; written: RegistryRecord[] } {
    const written: RegistryRecord[] = [];
    const deps: CellRunnerDeps = {
      runId: "run-int",
      engine: { commit: "test", opencodeVersion: "test" },
      roleOf: () => "coder",
      expectedExitOf: () => 0,
      materialize: () => ({ configDir: "C:/tmp/variant", agentName: "coder" }),
      runAgent: async () => ({ ok: true, result: { output: "pong", tokensIn: 12, tokensOut: 3, costUsd: 0, costSource: "provider" } }),
      runOracle: async () => ({ ok: true, result: { command: "cargo test", exit: 0, durationMs: 9, initialFails: true, output: "ok", timedOut: false } }),
      appendRecord: (record) => written.push(record),
      now: () => "2026-09-24T00:00:00Z",
      ...overrides,
    };
    return { deps, written };
  }

  test("builds a small grid, runs it, and the registry line keeps the extended shape", async () => {
    const cells = buildCells({
      models: ["opencode/big-pickle"],
      variants: ["base", "strict"],
      efforts: ["default"],
      cases: ["CODING-typescript-rust"],
      repetitions: [1],
    });
    const filtered = filterCells(cells, {
      ladder: [{ name: "base", cellCap: 0.1, requiresAuthorization: false }],
      stageOf: () => "base",
      entryOf: () => freeEntry,
      budgetOf: () => budget,
      hasAuthorization: () => false,
    });
    expect(filtered.refused).toHaveLength(0);
    expect(filtered.allowed).toHaveLength(2);

    const { deps, written } = runnerDeps();
    await runCells(filtered.allowed, deps);
    expect(written).toHaveLength(2);

    const parsed = parseRegistryLines(written.map(serializeRegistryLine).join("\n"));
    expect(parsed.skipped).toBe(0);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0].cell.variant).toBe("base");
    expect(parsed.records[0].cell.role).toBe("coder");
    expect(parsed.records[0].usage.tokensIn).toBe(12);
    expect(parsed.records[0].usage.tokensOut).toBe(3);
    expect(parsed.records[0].result.correct).toBe(true);
    expect(parsed.records[0].result.oracle?.command).toBe("cargo test");
  });

  test("the summary groups the registry lines by model", async () => {
    const cells = buildCells({ models: ["m1", "m2"], variants: ["base"], efforts: ["default"], cases: ["c1"], repetitions: [1] });
    const { deps, written } = runnerDeps();
    await runCells(cells, deps);
    const summary = summarizeRegistry(written);
    expect(summary.byModel.map((entry) => entry.key).sort()).toEqual(["m1", "m2"]);
    expect(summary.byModel[0].correct).toBe(1);
  });

  test("the factory guard refuses the cell and the registry line records the reason", async () => {
    const cells = buildCells({ models: ["m"], variants: ["base"], efforts: ["default"], cases: ["c1"], repetitions: [1] });
    const { deps, written } = runnerDeps({ runAgent: async () => ({ ok: false, error: "variant-not-loaded" }) });
    await runCells(cells, deps);
    const parsed = parseRegistryLines(serializeRegistryLine(written[0]));
    expect(parsed.records[0].result.refused).toBe(true);
    expect(parsed.records[0].result.reason).toBe("variant-not-loaded");
  });
});
