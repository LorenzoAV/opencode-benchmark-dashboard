/**
 * Result guards, result merging, and on-disk result loading.
 * Reads the results directory through the shared naming and path helpers.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { BenchmarkResult, ModelStats, RunSummary } from "./types.ts";
import { RESULTS_DIR, sanitizeModelName } from "./utils.ts";

export function loadExistingResults(model: string): RunSummary | null {
  const sanitized = sanitizeModelName(model);
  const resultPath = join(RESULTS_DIR, `${sanitized}.json`);
  
  if (!existsSync(resultPath)) {
    return null;
  }

  const content = readFileSync(resultPath, "utf-8");
  try {
    const parsed = JSON.parse(content);
    if (isRunSummary(parsed)) {
      return parsed;
    } else {
      console.error(`❌ Invalid result format in ${resultPath}`);
      return null;
    }
  } catch (e) {
    console.error(`❌ Failed to parse ${resultPath}:`, e);
    return null;
  }
}

/**
 * Type guard for BenchmarkResult
 */
export function isBenchmarkResult(obj: any): obj is BenchmarkResult {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.testCase === "string" &&
    typeof obj.model === "string" &&
    typeof obj.latencyMs === "number" &&
    typeof obj.correct === "boolean" &&
    typeof obj.score === "number" &&
    typeof obj.output === "string" &&
    typeof obj.expected === "string" &&
    (obj.error === undefined || typeof obj.error === "string")
  );
}

/**
 * Type guard for RunSummary
 */
export function mergeResults(existing: RunSummary, newResults: BenchmarkResult[]): RunSummary {
  const resultsMap = new Map<string, BenchmarkResult>();
  
  for (const r of existing.results) {
    resultsMap.set(`${r.model}|${r.testCase}`, r);
  }
  
  for (const r of newResults) {
    resultsMap.set(`${r.model}|${r.testCase}`, r);
  }
  
  const mergedResults = Array.from(resultsMap.values());
  
  const passed = mergedResults.filter(r => r.correct).length;
  const failed = mergedResults.length - passed;
  
  const avgLatency = mergedResults.reduce((sum, r) => sum + r.latencyMs, 0) / mergedResults.length;
  
  const modelStats: ModelStats[] = [{
    model: existing.modelStats[0]?.model || newResults[0]?.model || "",
    totalTests: mergedResults.length,
    passed,
    failed,
    avgLatencyMs: Math.round(avgLatency),
    accuracy: Math.round((passed / mergedResults.length) * 100)
  }];

  return {
    ...existing,
    totalTests: mergedResults.length,
    passed,
    failed,
    results: mergedResults,
    modelStats
  };
}

export function isRunSummary(obj: any): obj is RunSummary {
  if (!obj || typeof obj !== "object") return false;
  return (
    typeof obj.runId === "string" &&
    typeof obj.timestamp === "string" &&
    typeof obj.totalTests === "number" &&
    typeof obj.passed === "number" &&
    typeof obj.failed === "number" &&
    Array.isArray(obj.results) &&
    obj.results.every(isBenchmarkResult) &&
    Array.isArray(obj.modelStats)
  );
}
