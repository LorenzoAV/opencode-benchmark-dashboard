/**
 * The grid core: builds cells from the axes and filters them by the cost ladder
 * and the cost gate. Pure: no network, no disk, no model.
 */
import type { CellKey } from "./types.ts";
import type { ModelCostEntry, CellCostBudget } from "./cost-gate.ts";
import { allowCell } from "./cost-gate.ts";

export interface GridAxes {
  models: string[];
  variants: string[];
  efforts: string[];
  cases: string[];
  repetitions: number[];
}

/** Cartesian product of the five axes, model-major, in a stable order. */
export function buildCells(axes: GridAxes): CellKey[] {
  const cells: CellKey[] = [];
  for (const model of axes.models) {
    for (const variant of axes.variants) {
      for (const effort of axes.efforts) {
        for (const caseId of axes.cases) {
          for (const repetition of axes.repetitions) {
            cells.push({ model, variant, effort, case: caseId, repetition });
          }
        }
      }
    }
  }
  return cells;
}

export interface LadderStage {
  name: string;
  cellCap: number;
  requiresAuthorization: boolean;
}

export interface RefusedCell {
  cell: CellKey;
  reason: string;
}

export interface FilterCellsOptions {
  ladder: LadderStage[];
  stageOf: (cell: CellKey) => string;
  entryOf: (model: string) => ModelCostEntry | undefined;
  budgetOf: (caseId: string) => CellCostBudget;
  hasAuthorization: (model: string, stage: string) => boolean;
}

export interface FilterResult {
  allowed: CellKey[];
  refused: RefusedCell[];
}

function refusalReason(cell: CellKey, stage: LadderStage, options: FilterCellsOptions): string | null {
  const authorized = options.hasAuthorization(cell.model, stage.name);
  if (stage.requiresAuthorization && !authorized) {
    return "stage-authorization-required";
  }
  const entry = options.entryOf(cell.model);
  if (!entry) return "catalog-missing";
  const decision = allowCell(entry, options.budgetOf(cell.case), cell.repetition, stage.cellCap, authorized);
  return decision.allowed ? null : decision.reason;
}

/**
 * Applies the cost gate per stage. The ladder is cumulative: a model that fails
 * a stage is refused on every later stage, never silently advanced.
 */
export function filterCells(cells: CellKey[], options: FilterCellsOptions): FilterResult {
  const allowed: CellKey[] = [];
  const refused: RefusedCell[] = [];
  const failedStages = new Map<string, number[]>();

  options.ladder.forEach((stage, stageIndex) => {
    const stageCells = cells.filter((cell) => options.stageOf(cell) === stage.name);
    for (const cell of stageCells) {
      const priorFailures = failedStages.get(cell.model) ?? [];
      if (priorFailures.some((index) => index < stageIndex)) {
        refused.push({ cell, reason: "ladder-blocked" });
        continue;
      }
      const reason = refusalReason(cell, stage, options);
      if (reason) {
        refused.push({ cell, reason });
        failedStages.set(cell.model, [...priorFailures, stageIndex]);
      } else {
        allowed.push(cell);
      }
    }
  });

  return { allowed, refused };
}
