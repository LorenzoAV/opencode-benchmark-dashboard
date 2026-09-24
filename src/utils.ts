import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { parseOpencodeJsonOutput } from "./opencode-output.ts";
import { validateModelName } from "./compare.ts";

export const SOLUTIONS_DIR = resolve("./solutions");
export const RESULTS_DIR = resolve("./results");

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function sanitizeModelName(model: string): string {
  return model
    .replace(/[^a-zA-Z0-9]/g, (match) => {
      if (match === "/" || match === ":" || match === "-") return "-";
      if (match === ".") return "-";
      return "_";
    })
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateRunId(): string {
  return `run_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOpencodeResult {
  output: string;
  error?: string;
  latencyMs?: number;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  costSource?: string | null;
}

export async function runOpencode(
  prompt: string,
  model: string,
  timeout: number
): Promise<RunOpencodeResult> {
  // Validate model name to prevent command injection
  if (!validateModelName(model)) {
    return { output: "", error: `Invalid model name: ${model}` };
  }

  try {
    const startTime = Date.now();
    const proc = Bun.spawn(["opencode", "run", "--format", "json", "--model", model, prompt], {
      env: { ...process.env, OPENCODE_MODEL: model },
      stdout: "pipe",
      stderr: "pipe"
    });

    let killed = false;
    const timeoutPromise = new Promise<{ output: string; error: string; latencyMs: number }>((_, reject) => {
      setTimeout(() => {
        killed = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.exited) proc.kill("SIGKILL");
        }, 5000);
        reject({ output: "", error: "Timeout", latencyMs: Date.now() - startTime });
      }, timeout);
    });

    const outputPromise = (async (): Promise<RunOpencodeResult> => {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      const latencyMs = Date.now() - startTime;
      const parsed = parseOpencodeJsonOutput(stdout);
      
      if (killed) {
        return { output: "", error: "Timeout", latencyMs };
      }
      
      const hasError = stderr.includes("Error:") || stderr.includes("error:") || exitCode !== 0;
      if (!hasError) {
        return { output: parsed.output, error: undefined, latencyMs, ...parsed.usage };
      } else {
        return { output: parsed.output, error: stderr || `Exit code: ${exitCode}`, latencyMs, ...parsed.usage };
      }
    })();

    return await Promise.race([outputPromise, timeoutPromise]);
  } catch (e: any) {
    return { output: "", error: e.message || String(e), latencyMs: 0 };
  }
}

export interface ArgsResult {
  model?: string;
  testCase?: string;
  timeout?: number;
}

export function parseArgs(args: string[]): ArgsResult {
  const result: ArgsResult = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" || args[i] === "--model") {
      result.model = args[i + 1];
      i++;
    } else if (args[i] === "-t" || args[i] === "--test") {
      result.testCase = args[i + 1];
      i++;
    } else if (args[i] === "-o" || args[i] === "--timeout") {
      result.timeout = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return result;
}

export async function checkOpencodeCli(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "opencode"], { stdout: "pipe" });
    const output = await new Response(proc.stdout).text();
    return output.trim().length > 0;
  } catch {
    return false;
  }
}
