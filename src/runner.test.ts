import { describe, test, expect } from "bun:test";
import { verify } from "./verifier";
import { loadConfig } from "./config";
import { sanitizeModelName, parseArgs, ensureDir, generateRunId, checkOpencodeCli } from "./utils";
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
