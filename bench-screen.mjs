// Runs SCREEN-ui against the live bench server for image-capable models.
// Usage: node bench-screen.mjs [repetitions] [registryPath]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createOpencodeClient } from "@opencode-ai/sdk";

const require = createRequire(import.meta.url);
const { runBenchRun } = require("C:/Users/LorEnterprise/.config/opencode/support/bench-runner.js");

import { runRepetitions } from "./bench-cells.mjs";

const BASE_URL = "http://127.0.0.1:4096";
const CASE_DIR = "C:/Users/LorEnterprise/dev/opencode-benchmark-dashboard/cases/SCREEN-ui";
const DEFAULT_REGISTRY = "C:/Users/LorEnterprise/dev/opencode-benchmark-dashboard/results/registry-agents.jsonl";
const AGENT = "screener";
// BENCH_MODELS overrides the single default model with a comma-separated list.
const MODELS = (process.env.BENCH_MODELS ?? "opencode-go/deepseek-v4.1-flash")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const TIMEOUT_MS = 300000;

const REPETITIONS = Number(process.argv[2] ?? 3);
const REGISTRY_PATH = process.argv[3] ?? DEFAULT_REGISTRY;

function registryLines() {
  try {
    return readFileSync(REGISTRY_PATH, "utf-8").split(/\r?\n/).filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/** Pulls the oracle metrics line out of a registry record. */
function metricsOf(line) {
  try {
    const record = JSON.parse(line);
    const output = record.result?.oracle?.output ?? "";
    const match = output.match(/DETECTION=([\d.]+) TYPE=([\d.]+) IOU=([\d.]+) SCORE=([\d.]+)/);
    return {
      exit: record.result?.oracle?.exit,
      latencyMs: record.latencyMs,
      failureClass: record.providerFailureClass,
      detection: match?.[1] ?? "n/a",
      type: match?.[2] ?? "n/a",
      iou: match?.[3] ?? "n/a",
      score: match?.[4] ?? "n/a",
    };
  } catch {
    return null;
  }
}

async function preflight() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    return response.status;
  } catch (error) {
    return `unreachable: ${error.message}`;
  }
}

async function runCell(client, args) {
  const { model, repetition } = args;
  const before = registryLines().length;
  try {
    await runBenchRun(client, args);
  } catch (error) {
    console.log(`ERROR\tmodel=${model}\trep=${repetition}\t${error.message ?? String(error)}`);
    return;
  }
  const lines = registryLines();
  const metrics = lines.length > before ? metricsOf(lines[lines.length - 1]) : null;
  const fields = [
    `exit=${metrics?.exit}`,
    `detection=${metrics?.detection}`,
    `type=${metrics?.type}`,
    `iou=${metrics?.iou}`,
    `score=${metrics?.score}`,
    `latency=${metrics?.latencyMs}`,
    `class=${metrics?.failureClass}`,
  ];
  console.log(`CELL\tmodel=${model}\trep=${repetition}\t${fields.join("\t")}`);
  if (lines.length > before) console.log(`RAW\t${lines[lines.length - 1]}`);
}

const status = await preflight();
if (typeof status !== "number") {
  console.log(`SERVER\t${status}`);
  process.exit(1);
}
console.log(`SERVER\tstatus=${status}\tregistry=${REGISTRY_PATH}\treps=${REPETITIONS}`);

const client = createOpencodeClient({ baseUrl: BASE_URL });
const baseArgs = { agent: AGENT, caseDir: CASE_DIR, registryPath: REGISTRY_PATH, timeoutMs: TIMEOUT_MS };
for (const model of MODELS) {
  await runRepetitions(runCell, client, { ...baseArgs, model }, REPETITIONS);
}
