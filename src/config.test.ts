import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadCaseManifest, loadCase } from "./config.ts";
import type { CaseManifest } from "./types.ts";

const manifest: CaseManifest = {
  id: "CODING-typescript-rust",
  role: "coder",
  prompt: "Fix the failing test",
  oracle: {
    command: "cargo test",
    cwd: ".",
    expectExit: 0,
    initialFails: true,
    timeoutMs: 60000,
    maxOutputTokens: 8000,
  },
  budget: { maxOutputTokens: 8000, maxCostUsd: 2 },
};

describe("case manifest loader", () => {
  let workDir: string;
  let casesDir: string;
  let promptsDir: string;
  let answersDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), "config-test-"));
    casesDir = join(workDir, "cases");
    promptsDir = join(workDir, "prompts");
    answersDir = join(workDir, "prompts-answers");

    mkdirSync(join(casesDir, "with-manifest"), { recursive: true });
    writeFileSync(join(casesDir, "with-manifest", "case.json"), JSON.stringify(manifest));

    mkdirSync(join(casesDir, "malformed"), { recursive: true });
    writeFileSync(join(casesDir, "malformed", "case.json"), "{ not json");

    mkdirSync(join(casesDir, "invalid"), { recursive: true });
    writeFileSync(join(casesDir, "invalid", "case.json"), JSON.stringify({ id: 1 }));

    mkdirSync(promptsDir, { recursive: true });
    mkdirSync(answersDir, { recursive: true });
    writeFileSync(join(promptsDir, "only-prompt.txt"), "do the thing");
    writeFileSync(join(answersDir, "only-prompt.txt"), "expected thing");
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  test("loads a case with a manifest and its fields", () => {
    const result = loadCaseManifest(join(casesDir, "with-manifest"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.id).toBe("CODING-typescript-rust");
    expect(result.manifest.role).toBe("coder");
    expect(result.manifest.oracle?.command).toBe("cargo test");
    expect(result.manifest.budget.maxOutputTokens).toBe(8000);
  });

  test("loadCase prefers the manifest when it is present", () => {
    const loaded = loadCase("with-manifest", { casesDir, promptsDir, answersDir });
    expect(loaded.kind).toBe("manifest");
    if (loaded.kind !== "manifest") return;
    expect(loaded.manifest.role).toBe("coder");
  });

  test("falls back to the old prompt loader when there is no manifest", () => {
    const loaded = loadCase("only-prompt", { casesDir, promptsDir, answersDir });
    expect(loaded.kind).toBe("prompt");
    if (loaded.kind !== "prompt") return;
    expect(loaded.testCase.id).toBe("only-prompt");
    expect(loaded.testCase.prompt).toBe("do the thing");
    expect(loaded.testCase.expected).toBe("expected thing");
  });

  test("reports a missing manifest by name", () => {
    const result = loadCaseManifest(join(casesDir, "only-prompt"));
    expect(result).toEqual({
      ok: false,
      error: "manifest-not-found",
      path: join(casesDir, "only-prompt", "case.json"),
    });
  });

  test("a malformed manifest returns a named error, not an exception", () => {
    expect(() => loadCaseManifest(join(casesDir, "malformed"))).not.toThrow();
    const result = loadCaseManifest(join(casesDir, "malformed"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("manifest-malformed");
  });

  test("an invalid manifest shape returns a named error", () => {
    const result = loadCaseManifest(join(casesDir, "invalid"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("manifest-invalid");
  });

  test("loadCase reports a missing case when neither source has it", () => {
    const loaded = loadCase("nowhere", { casesDir, promptsDir, answersDir });
    expect(loaded.kind).toBe("missing");
  });
});
