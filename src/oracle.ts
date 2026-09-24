/**
 * Runs a case's mechanical oracle: copies the fixture to a temp directory,
 * verifies the fixture fails at the start, applies the model output, and runs
 * the manifest command. The case fixture is never touched.
 */
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CaseManifest } from "./types.ts";

export interface OracleResult {
  exit: number;
  initialFails: boolean;
  durationMs: number;
  output: string;
  timedOut: boolean;
}

export type OracleError = "no-oracle" | "fixture-missing" | "fixture-does-not-fail-initially";

export type OracleOutcome =
  | { ok: true; result: OracleResult }
  | { ok: false; error: OracleError; detail?: string };

interface CommandRun {
  exit: number;
  output: string;
  durationMs: number;
  timedOut: boolean;
}

type SpawnedProcess = ReturnType<typeof Bun.spawn>;

const KILL_GRACE_MS = 2000;

function scheduleKill(proc: SpawnedProcess, timeoutMs: number, onTimeout: () => void) {
  return setTimeout(() => {
    onTimeout();
    proc.kill();
    setTimeout(() => {
      if (!proc.exited) proc.kill();
    }, KILL_GRACE_MS);
  }, timeoutMs);
}

async function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  env: Record<string, string | undefined>,
): Promise<CommandRun> {
  const [bin, ...args] = command.split(/\s+/).filter(Boolean);
  const startTime = Date.now();
  const proc = Bun.spawn([bin, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });

  let timedOut = false;
  const timer = scheduleKill(proc, timeoutMs, () => {
    timedOut = true;
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  return {
    exit: timedOut ? -1 : exitCode,
    output: `${stdout}${stderr}`,
    durationMs: Date.now() - startTime,
    timedOut,
  };
}

/**
 * Runs the oracle for one cell. Returns the run outcome, or a named error when
 * the case itself is broken. The command runs from the temp copy, never the repo.
 */
export async function runOracle(
  fixtureDir: string,
  modelOutput: string,
  manifest: CaseManifest,
): Promise<OracleOutcome> {
  const oracle = manifest.oracle;
  if (!oracle) return { ok: false, error: "no-oracle" };
  if (!existsSync(fixtureDir)) return { ok: false, error: "fixture-missing" };

  const workRoot = mkdtempSync(join(tmpdir(), "oracle-"));
  try {
    const projectDir = join(workRoot, "project");
    cpSync(fixtureDir, projectDir, { recursive: true });

    // Keep the build cache inside the temp copy. An inherited global target
    // dir would let cargo reuse a stale binary and break reproducibility.
    const env = { ...process.env, CARGO_TARGET_DIR: join(projectDir, "target") };

    const initial = await runCommand(oracle.command, projectDir, oracle.timeoutMs, env);
    if (!initial.timedOut && initial.exit === oracle.expectExit) {
      return { ok: false, error: "fixture-does-not-fail-initially", detail: initial.output };
    }
    if (initial.timedOut) {
      return { ok: true, result: buildResult(initial, initial, oracle.expectExit) };
    }

    if (oracle.applyTo) {
      writeFileSync(join(projectDir, oracle.applyTo), modelOutput, "utf-8");
    }
    const run = await runCommand(oracle.command, projectDir, oracle.timeoutMs, env);
    return { ok: true, result: buildResult(run, initial, oracle.expectExit) };
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function buildResult(run: CommandRun, initial: CommandRun, expectExit: number): OracleResult {
  return {
    exit: run.exit,
    initialFails: initial.exit !== expectExit,
    durationMs: run.durationMs,
    output: run.output,
    timedOut: run.timedOut,
  };
}
