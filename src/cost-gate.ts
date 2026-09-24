/**
 * Pure cost estimator and pre-run gate for a single benchmark cell.
 * No network, no spawn, no disk: only arithmetic over a catalog entry.
 */

/** Catalog entry fields the estimator needs. Prices are dollars per million tokens. */
export interface ModelCostEntry {
  route: string;
  costSource: string;
  costPerMillion: {
    input: number | null;
    output: number | null;
    cacheRead?: number | null;
    cacheWrite?: number | null;
  };
}

/** Input sizes of the cell under estimation, in characters. */
export interface CellCostBudget {
  maxOutputTokens: number;
  promptChars: number;
  fixtureChars: number;
}

/** Outcome of the gate. Never a bare boolean: the rule that decided is named. */
export interface CostDecision {
  allowed: boolean;
  reason: CostReason;
}

export type CostReason =
  | "route-free"
  | "cost-source-unknown"
  | "cost-undeclared"
  | "cell-cap-exceeded"
  | "output-price-unauthorized"
  | "allowed";

const CHARACTERS_PER_TOKEN = 4;
const TOKENS_PER_MILLION = 1_000_000;
const OUTPUT_PRICE_AUTHORIZATION_THRESHOLD_USD = 15;

function hasDeclaredUnitCost(entry: ModelCostEntry): boolean {
  return entry.costPerMillion.input !== null && entry.costPerMillion.output !== null;
}

function estimatedInputTokens(caseBudget: CellCostBudget): number {
  const characters = caseBudget.promptChars + caseBudget.fixtureChars;
  return Math.ceil(characters / CHARACTERS_PER_TOKEN);
}

/**
 * Estimates the dollar cost of running one cell `reps` times.
 * cacheRead and cacheWrite are optional: null means undeclared, not zero,
 * and neither enters the estimate.
 */
export function estimateCellCost(
  entry: ModelCostEntry,
  caseBudget: CellCostBudget,
  reps: number,
): number {
  const tokensIn = estimatedInputTokens(caseBudget);
  const tokensOut = caseBudget.maxOutputTokens;

  const costIn = (tokensIn / TOKENS_PER_MILLION) * (entry.costPerMillion.input ?? 0);
  const costOut = (tokensOut / TOKENS_PER_MILLION) * (entry.costPerMillion.output ?? 0);

  return (costIn + costOut) * reps;
}

/**
 * Decides whether a cell may run. Rules apply in order: free always passes;
 * an unknown cost source fails; an undeclared unit price fails; an estimate
 * above the cap fails; an output price above the authorization threshold
 * fails without written authorization.
 */
export function allowCell(
  entry: ModelCostEntry,
  caseBudget: CellCostBudget,
  reps: number,
  cellCap: number,
  hasAuthorization: boolean,
): CostDecision {
  if (entry.route === "free") {
    return { allowed: true, reason: "route-free" };
  }
  if (entry.costSource === "unknown") {
    return { allowed: false, reason: "cost-source-unknown" };
  }
  if (!hasDeclaredUnitCost(entry)) {
    return { allowed: false, reason: "cost-undeclared" };
  }
  if (estimateCellCost(entry, caseBudget, reps) > cellCap) {
    return { allowed: false, reason: "cell-cap-exceeded" };
  }
  if (
    entry.costPerMillion.output! > OUTPUT_PRICE_AUTHORIZATION_THRESHOLD_USD &&
    !hasAuthorization
  ) {
    return { allowed: false, reason: "output-price-unauthorized" };
  }
  return { allowed: true, reason: "allowed" };
}
