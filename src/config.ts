import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join, basename } from "path";
import type { BenchmarkConfig, CaseManifest, TestCase } from "./types.ts";

const PROMPTS_DIR = resolve("./prompts");
const ANSWERS_DIR = resolve("./prompts-answers");
const CASES_DIR = resolve("./cases");

interface RawBenchmarkConfig {
  timeout?: number;
  evaluatorModel?: string;
  verification?: {
    caseSensitive?: boolean;
  };
}

function loadTestCasesFromFiles(): TestCase[] {
  if (!existsSync(PROMPTS_DIR)) {
    console.warn(`Prompts directory not found: ${PROMPTS_DIR}`);
    return [];
  }

  const promptFiles = readdirSync(PROMPTS_DIR).filter(f => f.endsWith(".txt"));
  const testCases: TestCase[] = [];

  for (const file of promptFiles) {
    const id = basename(file, ".txt");
    const promptPath = join(PROMPTS_DIR, file);
    const answerPath = join(ANSWERS_DIR, file);

    const prompt = readFileSync(promptPath, "utf-8").trim();
    const expected = existsSync(answerPath) 
      ? readFileSync(answerPath, "utf-8").trim() 
      : "";

    testCases.push({
      id,
      prompt,
      expected,
      language: "python"
    });
  }

  return testCases;
}

export interface CaseLoadError {
  ok: false;
  error: "manifest-not-found" | "manifest-malformed" | "manifest-invalid";
  path: string;
}

export interface CaseLoadSuccess {
  ok: true;
  manifest: CaseManifest;
}

export type CaseLoadResult = CaseLoadSuccess | CaseLoadError;

export type LoadedCase =
  | { id: string; kind: "manifest"; manifest: CaseManifest }
  | { id: string; kind: "prompt"; testCase: TestCase }
  | { id: string; kind: "missing" };

export interface CaseDirs {
  casesDir?: string;
  promptsDir?: string;
  answersDir?: string;
}

function isValidManifest(value: any): value is CaseManifest {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    typeof value.prompt === "string" &&
    value.budget &&
    typeof value.budget === "object" &&
    typeof value.budget.maxOutputTokens === "number" &&
    typeof value.budget.maxCostUsd === "number"
  );
}

/** Loads cases/<id>/case.json. Returns a named error instead of throwing. */
export function loadCaseManifest(caseDir: string): CaseLoadResult {
  const manifestPath = join(caseDir, "case.json");
  if (!existsSync(manifestPath)) {
    return { ok: false, error: "manifest-not-found", path: manifestPath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return { ok: false, error: "manifest-malformed", path: manifestPath };
  }

  if (!isValidManifest(parsed)) {
    return { ok: false, error: "manifest-invalid", path: manifestPath };
  }
  return { ok: true, manifest: parsed };
}

function loadTestCaseById(id: string, promptsDir: string, answersDir: string): TestCase | null {
  const promptPath = join(promptsDir, `${id}.txt`);
  if (!existsSync(promptPath)) {
    return null;
  }
  const answerPath = join(answersDir, `${id}.txt`);
  return {
    id,
    prompt: readFileSync(promptPath, "utf-8").trim(),
    expected: existsSync(answerPath) ? readFileSync(answerPath, "utf-8").trim() : "",
    language: "python"
  };
}

/** Prefers a case manifest; falls back to the prompt pair loader of prompts/. */
export function loadCase(id: string, dirs: CaseDirs = {}): LoadedCase {
  const casesDir = dirs.casesDir ?? CASES_DIR;
  const promptsDir = dirs.promptsDir ?? PROMPTS_DIR;
  const answersDir = dirs.answersDir ?? ANSWERS_DIR;

  const manifestResult = loadCaseManifest(join(casesDir, id));
  if (manifestResult.ok) {
    return { id, kind: "manifest", manifest: manifestResult.manifest };
  }

  const testCase = loadTestCaseById(id, promptsDir, answersDir);
  if (testCase) {
    return { id, kind: "prompt", testCase };
  }
  return { id, kind: "missing" };
}

export function loadConfig(configPath?: string): BenchmarkConfig {
  const path = configPath || resolve("./config/benchmark.json");
  
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  let jsonConfig: RawBenchmarkConfig;
  try {
    const content = readFileSync(path, "utf-8");
    jsonConfig = JSON.parse(content);
  } catch (e: any) {
    throw new Error(`Failed to parse config file ${path}: ${e.message}`);
  }

  if (!jsonConfig.timeout || typeof jsonConfig.timeout !== "number") {
    jsonConfig.timeout = 300000;
    console.warn("⚠️  Config missing timeout, using default: 300000ms");
  }

  const testCases = loadTestCasesFromFiles();

  return {
    timeout: jsonConfig.timeout!,
    evaluatorModel: jsonConfig.evaluatorModel,
    verification: jsonConfig.verification ?? { caseSensitive: false },
    testCases
  };
}
