import { describe, test, expect } from "bun:test";
import { mergeResults, loadExistingResults, isRunSummary } from "./results.ts";

describe("mergeResults", () => {
  const existingResults = {
    runId: "test-model",
    timestamp: "2024-01-01T00:00:00Z",
    totalTests: 2,
    passed: 1,
    failed: 1,
    results: [
      { testCase: "test1", correct: true, latencyMs: 100, model: "test-model", timestamp: "", score: 0, output: "", expected: "" },
      { testCase: "test2", correct: false, latencyMs: 200, model: "test-model", timestamp: "", score: 0, output: "", expected: "" },
    ],
    modelStats: [{ model: "test-model", totalTests: 2, passed: 1, failed: 1, avgLatencyMs: 150, accuracy: 50 }],
  };

  const newResults = [
    { testCase: "test2", correct: true, latencyMs: 180, model: "test-model", timestamp: "", score: 0, output: "", expected: "" },
    { testCase: "test3", correct: true, latencyMs: 300, model: "test-model", timestamp: "", score: 0, output: "", expected: "" },
  ];

  test("merges results, updating existing test cases", () => {
    const merged = mergeResults(existingResults, newResults);
    expect(merged.results).toHaveLength(3);
    const test2 = merged.results.find(r => r.testCase === "test2");
    expect(test2?.correct).toBe(true);
  });

  test("calculates correct totals after merge", () => {
    const merged = mergeResults(existingResults, newResults);
    expect(merged.totalTests).toBe(3);
    expect(merged.passed).toBe(3);
    expect(merged.failed).toBe(0);
  });

  test("calculates average latency correctly", () => {
    const merged = mergeResults(existingResults, newResults);
    const avgLatency = merged.modelStats[0].avgLatencyMs;
    expect(avgLatency).toBe(Math.round((100 + 180 + 300) / 3));
  });
});

describe("loadExistingResults", () => {
  test("returns null for non-existent file", () => {
    const result = loadExistingResults("non-existent-model-xyz123");
    expect(result).toBeNull();
  });
});

describe("isRunSummary type guard", () => {
  test("returns true for valid RunSummary", () => {
    const valid: any = {
      runId: "test-run",
      timestamp: "2024-01-01T00:00:00Z",
      totalTests: 10,
      passed: 5,
      failed: 5,
      results: [],
      modelStats: []
    };
    expect(isRunSummary(valid)).toBe(true);
  });

  test("returns false for invalid objects", () => {
    expect(isRunSummary(null)).toBe(false);
    expect(isRunSummary({})).toBe(false);
    expect(isRunSummary({ runId: "test" })).toBe(false);
    expect(isRunSummary("string")).toBe(false);
    expect(isRunSummary(123)).toBe(false);
  });

  test("validates results array contains BenchmarkResult objects", () => {
    const withInvalidResults: any = {
      runId: "test",
      timestamp: "2024-01-01T00:00:00Z",
      totalTests: 1,
      passed: 0,
      failed: 1,
      results: [{ invalid: "data" }],
      modelStats: []
    };
    expect(isRunSummary(withInvalidResults)).toBe(false);
  });
});
