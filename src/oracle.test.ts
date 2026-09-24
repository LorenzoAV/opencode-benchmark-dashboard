import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { runOracle } from "./oracle.ts";
import { loadCaseManifest } from "./config.ts";
import type { CaseManifest } from "./types.ts";

const FIXTURE_DIR = resolve("./cases/CODING-typescript-rust/fixture");
const CASE_DIR = resolve("./cases/CODING-typescript-rust");

const CORRECT_OUTPUT = `pub fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() {
        a
    } else {
        b
    }
}
`;

const INCORRECT_OUTPUT = `pub fn longer<'a>(a: &'a str, _b: &'a str) -> &'a str {
    a
}
`;

function loadManifest(): CaseManifest {
  const result = loadCaseManifest(CASE_DIR);
  if (!result.ok) throw new Error(`manifest unavailable: ${result.error}`);
  return result.manifest;
}

let passingFixtureDir: string;

beforeAll(() => {
  passingFixtureDir = mkdtempSync(join(tmpdir(), "oracle-passing-"));
  writeFileSync(
    join(passingFixtureDir, "Cargo.toml"),
    `[package]\nname = "oracle-passing-fixture"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
  );
  mkdirSync(join(passingFixtureDir, "src"), { recursive: true });
  writeFileSync(
    join(passingFixtureDir, "src", "lib.rs"),
    `pub fn ok() -> i32 { 42 }\n\n#[test]\nfn passes() { assert_eq!(ok(), 42); }\n`,
  );
});

afterAll(() => {
  rmSync(passingFixtureDir, { recursive: true, force: true });
});

function manifestWith(command: string, timeoutMs: number): CaseManifest {
  return {
    id: "synthetic",
    role: "coder",
    prompt: "",
    oracle: {
      command,
      cwd: "fixture",
      applyTo: "src/lib.rs",
      expectExit: 0,
      initialFails: true,
      timeoutMs,
      maxOutputTokens: 1000,
    },
    budget: { maxOutputTokens: 1000, maxCostUsd: 0.01 },
  };
}

describe("runOracle", () => {
  const manifest = loadManifest();

  test("the real fixture fails at the start", async () => {
    const outcome = await runOracle(FIXTURE_DIR, CORRECT_OUTPUT, manifest);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.initialFails).toBe(true);
  });

  test("a correct output makes the fixture test pass", async () => {
    const outcome = await runOracle(FIXTURE_DIR, CORRECT_OUTPUT, manifest);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.exit).toBe(0);
    expect(outcome.result.timedOut).toBe(false);
  });

  test("an incorrect output leaves the fixture test failing", async () => {
    const outcome = await runOracle(FIXTURE_DIR, INCORRECT_OUTPUT, manifest);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.exit).not.toBe(0);
  });

  test("a fixture that already passes returns a named error", async () => {
    const outcome = await runOracle(passingFixtureDir, "", manifestWith("cargo test", 120000));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBe("fixture-does-not-fail-initially");
  });

  test("a command over the timeout is killed and marked", async () => {
    const outcome = await runOracle(passingFixtureDir, "", manifestWith("ping -n 6 127.0.0.1", 500));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.timedOut).toBe(true);
  });
});
