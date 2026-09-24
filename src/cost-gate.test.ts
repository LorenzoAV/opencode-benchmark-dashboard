import { describe, test, expect } from "bun:test";
import { estimateCellCost, allowCell } from "./cost-gate.ts";
import type { ModelCostEntry, CellCostBudget } from "./cost-gate.ts";

function makeEntry(overrides: Partial<ModelCostEntry> = {}): ModelCostEntry {
  return {
    route: "paid-other",
    costSource: "registry",
    costPerMillion: { input: 1, output: 1, cacheRead: null, cacheWrite: null },
    ...overrides,
  };
}

const budget: CellCostBudget = {
  maxOutputTokens: 1000,
  promptChars: 400,
  fixtureChars: 400,
};

describe("estimateCellCost", () => {
  test("splits prompt plus fixture characters by four for input tokens", () => {
    const entry = makeEntry({ costPerMillion: { input: 2, output: 0 } });
    // (400 + 400) / 4 = 200 input tokens; 200 / 1e6 * 2 = 0.0004
    expect(estimateCellCost(entry, budget, 1)).toBeCloseTo(0.0004, 10);
  });

  test("uses maxOutputTokens for output tokens", () => {
    const entry = makeEntry({ costPerMillion: { input: 0, output: 3 } });
    // 1000 / 1e6 * 3 = 0.003
    expect(estimateCellCost(entry, budget, 1)).toBeCloseTo(0.003, 10);
  });

  test("multiplies the whole estimate by the repetitions", () => {
    const entry = makeEntry({ costPerMillion: { input: 1, output: 1 } });
    expect(estimateCellCost(entry, budget, 3)).toBeCloseTo(
      estimateCellCost(entry, budget, 1) * 3,
      10,
    );
  });

  test("does not break when cacheWrite is null", () => {
    const entry = makeEntry({
      costPerMillion: { input: 1, output: 1, cacheRead: null, cacheWrite: null },
    });
    expect(Number.isFinite(estimateCellCost(entry, budget, 1))).toBe(true);
  });

  test("treats an undeclared cache price as not part of the estimate", () => {
    const declared = makeEntry({
      costPerMillion: { input: 1, output: 1, cacheRead: 0.2, cacheWrite: 5 },
    });
    const undeclared = makeEntry({
      costPerMillion: { input: 1, output: 1, cacheRead: null, cacheWrite: null },
    });
    expect(estimateCellCost(declared, budget, 1)).toBeCloseTo(
      estimateCellCost(undeclared, budget, 1),
      10,
    );
  });
});

describe("allowCell", () => {
  test("always allows a free route and names the rule", () => {
    const entry = makeEntry({
      route: "free",
      costSource: "unknown",
      costPerMillion: { input: null, output: null },
    });
    expect(allowCell(entry, budget, 1, 2, false)).toEqual({
      allowed: true,
      reason: "route-free",
    });
  });

  test("refuses an unknown cost source and names the rule", () => {
    const entry = makeEntry({ costSource: "unknown" });
    expect(allowCell(entry, budget, 1, 2, false)).toEqual({
      allowed: false,
      reason: "cost-source-unknown",
    });
  });

  test("refuses a paid entry with undeclared unit cost and names the rule", () => {
    const entry = makeEntry({ costPerMillion: { input: null, output: null } });
    expect(allowCell(entry, budget, 1, 2, false)).toEqual({
      allowed: false,
      reason: "cost-undeclared",
    });
  });

  test("refuses a high-output price without authorization and names the rule", () => {
    const entry = makeEntry({ costPerMillion: { input: 1, output: 20 } });
    expect(allowCell(entry, budget, 1, 2, false)).toEqual({
      allowed: false,
      reason: "output-price-unauthorized",
    });
  });

  test("allows a high-output price when authorized", () => {
    const entry = makeEntry({ costPerMillion: { input: 1, output: 20 } });
    expect(allowCell(entry, budget, 1, 2, true).allowed).toBe(true);
  });

  test("allows an estimate under the cap", () => {
    const entry = makeEntry({ costPerMillion: { input: 1, output: 1 } });
    const expensiveBudget: CellCostBudget = {
      maxOutputTokens: 1_000_000,
      promptChars: 4_000_000,
      fixtureChars: 0,
    };
    // tokensIn 1e6 * 1 + tokensOut 1e6 * 1 = 2.00 USD
    expect(allowCell(entry, expensiveBudget, 1, 3, false)).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  test("refuses an estimate above the cap and names the rule", () => {
    const entry = makeEntry({ costPerMillion: { input: 1, output: 1 } });
    const expensiveBudget: CellCostBudget = {
      maxOutputTokens: 1_000_000,
      promptChars: 4_000_000,
      fixtureChars: 0,
    };
    expect(allowCell(entry, expensiveBudget, 1, 1, false)).toEqual({
      allowed: false,
      reason: "cell-cap-exceeded",
    });
  });

  test("multiplies repetitions before comparing against the cap", () => {
    const entry = makeEntry({ costPerMillion: { input: 1, output: 1 } });
    const oneRep: CellCostBudget = {
      maxOutputTokens: 1_000_000,
      promptChars: 4_000_000,
      fixtureChars: 0,
    };
    // one repetition costs 2.00 USD, three cost 6.00 USD
    expect(allowCell(entry, oneRep, 1, 3, false).allowed).toBe(true);
    expect(allowCell(entry, oneRep, 3, 3, false)).toEqual({
      allowed: false,
      reason: "cell-cap-exceeded",
    });
  });
});
