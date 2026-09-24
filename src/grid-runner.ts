/**
 * The grid runner: runs the allowed cells with every side effect injected.
 * Tests inject the functions, so they touch neither network nor disk.
 */
import type { CellKey } from "./types.ts";
import type { RegistryEngine, RegistryRecord, RegistryResult } from "./registry.ts";
import { refusedResult } from "./registry.ts";

export interface AgentSuccess {
  output: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costSource: string;
}

export type AgentOutcome = { ok: true; result: AgentSuccess } | { ok: false; error: string };

export interface OracleSuccess {
  command: string;
  exit: number;
  durationMs: number;
  initialFails: boolean;
  output: string;
  timedOut: boolean;
}

export type OracleOutcome = { ok: true; result: OracleSuccess } | { ok: false; error: string };

export interface CellRunnerDeps {
  runId: string;
  engine: RegistryEngine;
  roleOf: (cell: CellKey) => string;
  expectedExitOf: (cell: CellKey) => number;
  materialize: (cell: CellKey) => { configDir: string; agentName: string };
  runAgent: (cell: CellKey, configDir: string, agentName: string) => Promise<AgentOutcome>;
  runOracle: (cell: CellKey, modelOutput: string) => Promise<OracleOutcome>;
  appendRecord: (record: RegistryRecord) => void;
  now?: () => string;
}

function refusedRecord(cell: CellKey, deps: CellRunnerDeps, startedAt: string, reason: string): RegistryRecord {
  return {
    runId: deps.runId,
    startedAt,
    cell: { ...cell, role: deps.roleOf(cell) },
    result: refusedResult(reason),
    usage: { tokensIn: 0, tokensOut: 0, costUsd: 0, costSource: "none" },
    latencyMs: 0,
    providerFailureClass: null,
    engine: deps.engine,
  };
}

function completedRecord(
  cell: CellKey,
  deps: CellRunnerDeps,
  startedAt: string,
  latencyMs: number,
  agent: AgentSuccess,
  oracle: OracleSuccess,
  expectedExit: number,
): RegistryRecord {
  const correct = oracle.exit === expectedExit;
  const result: RegistryResult = {
    correct,
    score: correct ? 1 : 0,
    oracle: { command: oracle.command, exit: oracle.exit, durationMs: oracle.durationMs },
  };
  return {
    runId: deps.runId,
    startedAt,
    cell: { ...cell, role: deps.roleOf(cell) },
    result,
    usage: {
      tokensIn: agent.tokensIn,
      tokensOut: agent.tokensOut,
      costUsd: agent.costUsd,
      costSource: agent.costSource,
    },
    latencyMs,
    providerFailureClass: null,
    engine: deps.engine,
  };
}

/**
 * Runs each allowed cell. A factory or oracle error refuses the cell with that
 * reason; no cell is recorded as a success without a real agent run.
 */
export async function runCells(cells: CellKey[], deps: CellRunnerDeps): Promise<RegistryRecord[]> {
  const records: RegistryRecord[] = [];
  const now = deps.now ?? (() => new Date().toISOString());

  for (const cell of cells) {
    const startedAt = now();
    const { configDir, agentName } = deps.materialize(cell);
    const startTime = Date.now();
    const agentOutcome = await deps.runAgent(cell, configDir, agentName);
    const latencyMs = Date.now() - startTime;

    if (!agentOutcome.ok) {
      const record = refusedRecord(cell, deps, startedAt, agentOutcome.error);
      deps.appendRecord(record);
      records.push(record);
      continue;
    }

    const oracleOutcome = await deps.runOracle(cell, agentOutcome.result.output);
    if (!oracleOutcome.ok) {
      const record = refusedRecord(cell, deps, startedAt, oracleOutcome.error);
      deps.appendRecord(record);
      records.push(record);
      continue;
    }

    const record = completedRecord(
      cell,
      deps,
      startedAt,
      latencyMs,
      agentOutcome.result,
      oracleOutcome.result,
      deps.expectedExitOf(cell),
    );
    deps.appendRecord(record);
    records.push(record);
  }

  return records;
}
