/**
 * Pure rubric evaluation. No network, no disk, no model.
 *
 * RubricCriterion carries only `id`, `weight` and `signal`, so `id` doubles as
 * the signal's target: the seeded defect id for `defect-id`, the literal quote
 * for `quote-present`, and the expected verdict for `verdict-match`.
 * `citation-reachable` only extracts and counts URLs; the grid calls them.
 * `judge` is left pending for the judge to score later.
 */
import type { CaseRubric, RubricCriterion, RubricSignal } from "./types.ts";

export interface CriterionResult {
  id: string;
  signal: RubricSignal;
  weight: number;
  score: number | null;
  pending: boolean;
  evidence: string[];
}

export interface RubricEvaluation {
  criteria: CriterionResult[];
  defectsFound: string[];
  defectsMissing: string[];
  urls: string[];
  weightedScore: number;
  pending: string[];
}

const URL_PATTERN = /https?:\/\/[^\s)\]>"'<>]+/g;
const VERDICT_PATTERN = /verdict\s*[:\-]\s*([A-Za-z0-9_\-]+)/i;

/** Extracts unique URLs from the text. It never calls them. */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, ""))));
}

/** Reads the verdict a reviewer declares, e.g. `Verdict: fail`. */
export function extractVerdict(text: string): string | null {
  const match = text.match(VERDICT_PATTERN);
  return match ? match[1] : null;
}

function evaluateCriterion(text: string, criterion: RubricCriterion, urls: string[]): CriterionResult {
  const base = { id: criterion.id, signal: criterion.signal, weight: criterion.weight };

  if (criterion.signal === "judge") {
    return { ...base, score: null, pending: true, evidence: [] };
  }
  if (criterion.signal === "defect-id") {
    const found = text.includes(criterion.id);
    return { ...base, score: found ? 1 : 0, pending: false, evidence: found ? [criterion.id] : [] };
  }
  if (criterion.signal === "citation-reachable") {
    return { ...base, score: urls.length > 0 ? 1 : 0, pending: false, evidence: urls };
  }
  if (criterion.signal === "quote-present") {
    const present = text.includes(criterion.id);
    return { ...base, score: present ? 1 : 0, pending: false, evidence: present ? [criterion.id] : [] };
  }

  const declared = extractVerdict(text);
  const matched = declared !== null && declared.toLowerCase() === criterion.id.toLowerCase();
  return { ...base, score: matched ? 1 : 0, pending: false, evidence: declared ? [declared] : [] };
}

export function evaluateRubric(text: string, rubric: CaseRubric): RubricEvaluation {
  const urls = extractUrls(text);
  const criteria = rubric.criteria.map((criterion) => evaluateCriterion(text, criterion, urls));
  const scored = criteria.filter((criterion) => !criterion.pending);
  const totalWeight = scored.reduce((sum, criterion) => sum + criterion.weight, 0);
  const weightedScore = totalWeight > 0
    ? scored.reduce((sum, criterion) => sum + (criterion.score ?? 0) * criterion.weight, 0) / totalWeight
    : 0;

  const defects = criteria.filter((criterion) => criterion.signal === "defect-id");
  return {
    criteria,
    defectsFound: defects.filter((criterion) => criterion.score === 1).map((criterion) => criterion.id),
    defectsMissing: defects.filter((criterion) => criterion.score === 0).map((criterion) => criterion.id),
    urls,
    weightedScore,
    pending: criteria.filter((criterion) => criterion.pending).map((criterion) => criterion.id),
  };
}
