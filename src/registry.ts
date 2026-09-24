/**
 * Pure core of the cell registry: cell keys, JSONL serialization, summaries.
 * Disk access lives in separate functions so the core stays pure.
 */
import { appendFileSync, existsSync, readFileSync } from "fs";
import type { CellKey } from "./types.ts";

export interface RegistryCell extends CellKey {
  role: string;
}

export interface OracleOutcome {
  command: string;
  exit: number;
  durationMs: number;
}

export interface RegistryResult {
  correct: boolean;
  score: number;
  oracle?: OracleOutcome;
  refused?: boolean;
  reason?: string;
}

export interface RegistryUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costSource: string;
}

export interface RegistryEngine {
  commit: string;
  opencodeVersion: string;
}

export interface RegistryRecord {
  runId: string;
  startedAt: string;
  cell: RegistryCell;
  result: RegistryResult;
  usage: RegistryUsage;
  latencyMs: number;
  providerFailureClass: string | null;
  engine: RegistryEngine;
}

export interface RegistryReadResult {
  records: RegistryRecord[];
  skipped: number;
}

export interface AxisSummary {
  key: string;
  total: number;
  correct: number;
  refused: number;
  avgLatencyMs: number;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface RegistrySummary {
  byModel: AxisSummary[];
  byVariant: AxisSummary[];
  byEffort: AxisSummary[];
}

/** A refused cell is marked inside its result, so the line keeps the design shape. */
export function refusedResult(reason: string): RegistryResult {
  return { correct: false, score: 0, refused: true, reason };
}

export function isRefusedRecord(record: RegistryRecord): boolean {
  return record.result.refused === true;
}

/** Builds a collision-free key from the five axes of a cell. */
export function buildCellKey(cell: CellKey): string {
  return JSON.stringify([cell.model, cell.variant, cell.effort, cell.case, cell.repetition]);
}

export function serializeRegistryLine(record: RegistryRecord): string {
  return JSON.stringify(record);
}

function isRegistryCell(value: unknown): value is RegistryCell {
  const cell = value as Record<string, unknown>;
  return (
    !!cell &&
    typeof cell === "object" &&
    typeof cell.model === "string" &&
    typeof cell.variant === "string" &&
    typeof cell.effort === "string" &&
    typeof cell.role === "string" &&
    typeof cell.case === "string" &&
    typeof cell.repetition === "number"
  );
}

function isRegistryResult(value: unknown): value is RegistryResult {
  const result = value as Record<string, unknown>;
  return (
    !!result &&
    typeof result === "object" &&
    typeof result.correct === "boolean" &&
    typeof result.score === "number"
  );
}

function isRegistryUsage(value: unknown): value is RegistryUsage {
  const usage = value as Record<string, unknown>;
  return (
    !!usage &&
    typeof usage === "object" &&
    typeof usage.tokensIn === "number" &&
    typeof usage.tokensOut === "number" &&
    typeof usage.costUsd === "number" &&
    typeof usage.costSource === "string"
  );
}

function isRegistryEngine(value: unknown): value is RegistryEngine {
  const engine = value as Record<string, unknown>;
  return (
    !!engine &&
    typeof engine === "object" &&
    typeof engine.commit === "string" &&
    typeof engine.opencodeVersion === "string"
  );
}

function isRegistryRecord(value: unknown): value is RegistryRecord {
  const record = value as Record<string, unknown>;
  return (
    !!record &&
    typeof record === "object" &&
    typeof record.runId === "string" &&
    typeof record.startedAt === "string" &&
    isRegistryCell(record.cell) &&
    isRegistryResult(record.result) &&
    isRegistryUsage(record.usage) &&
    typeof record.latencyMs === "number" &&
    (record.providerFailureClass === null || typeof record.providerFailureClass === "string") &&
    isRegistryEngine(record.engine)
  );
}

/** Parses JSONL content, skipping malformed lines and counting them. */
export function parseRegistryLines(content: string): RegistryReadResult {
  const records: RegistryRecord[] = [];
  let skipped = 0;

  for (const line of content.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line);
      if (isRegistryRecord(parsed)) {
        records.push(parsed);
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return { records, skipped };
}

function summarizeByAxis(
  records: RegistryRecord[],
  axisOf: (cell: RegistryCell) => string,
): AxisSummary[] {
  const groups = new Map<string, RegistryRecord[]>();
  for (const record of records) {
    const key = axisOf(record.cell);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  return Array.from(groups.entries()).map(([key, group]) => summarizeGroup(key, group));
}

function summarizeGroup(key: string, group: RegistryRecord[]): AxisSummary {
  const latencySum = group.reduce((sum, record) => sum + record.latencyMs, 0);
  return {
    key,
    total: group.length,
    correct: group.filter((record) => record.result.correct).length,
    refused: group.filter(isRefusedRecord).length,
    avgLatencyMs: Math.round(latencySum / group.length),
    totalCostUsd: group.reduce((sum, record) => sum + record.usage.costUsd, 0),
    totalTokensIn: group.reduce((sum, record) => sum + record.usage.tokensIn, 0),
    totalTokensOut: group.reduce((sum, record) => sum + record.usage.tokensOut, 0),
  };
}

export function summarizeRegistry(records: RegistryRecord[]): RegistrySummary {
  return {
    byModel: summarizeByAxis(records, (cell) => cell.model),
    byVariant: summarizeByAxis(records, (cell) => cell.variant),
    byEffort: summarizeByAxis(records, (cell) => cell.effort),
  };
}

export function appendRegistryLine(filePath: string, record: RegistryRecord): void {
  appendFileSync(filePath, serializeRegistryLine(record) + "\n", "utf-8");
}

export function readRegistryFile(filePath: string): RegistryReadResult {
  if (!existsSync(filePath)) {
    return { records: [], skipped: 0 };
  }
  return parseRegistryLines(readFileSync(filePath, "utf-8"));
}
