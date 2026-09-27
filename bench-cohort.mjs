// Runs a named cohort of groq models against the live bench server on port 4096.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createOpencodeClient } from "@opencode-ai/sdk";

const require = createRequire(import.meta.url);
const { runBenchRun } = require("C:/Users/LorEnterprise/.config/opencode/support/bench-runner.js");

import { runRepetitions, resolveRepetitions } from "./bench-cells.mjs";

const BASE_URL = "http://127.0.0.1:4096";
const CASE_DIR = "C:/Users/LorEnterprise/dev/opencode-benchmark-dashboard/cases/PROBE-ready";
const REGISTRY_PATH = "C:/Users/LorEnterprise/dev/opencode-benchmark-dashboard/results/registry.jsonl";
const TIMEOUT_MS = 300000;

const DEFAULT_MODELS = [
  "groq/openai/gpt-oss-120b",
  "groq/openai/gpt-oss-20b",
  "groq/openai/gpt-oss-safeguard-20b",
  "groq/qwen/qwen3.8-27b",
  "groq/qwen/qwen3.6-27b",
  "groq/llama-3.3-70b-versatile",
];

/** Resolves the model list: CLI args win, then BENCH_MODELS, then the default cohort. */
function resolveModels() {
  const fromArgv = process.argv.slice(2).filter((value) => value.length > 0);
  if (fromArgv.length > 0) return fromArgv;
  const fromEnv = (process.env.BENCH_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return DEFAULT_MODELS;
}

const MODELS = resolveModels();

function registryLineCount() {
  return readFileSync(REGISTRY_PATH, "utf-8").split(/\r?\n/).filter((line) => line.length > 0).length;
}

function pick(object, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function formatField(value) {
  return value === undefined || value === null ? "null" : String(value);
}

function report(model, returnedJson, rawLine) {
  const parsed = JSON.parse(returnedJson);
  const record = parsed?.cell ? parsed : parsed?.record ?? {};
  const fields = [
    ["model", record.cell?.model ?? model],
    ["latencyMs", pick(record, ["latencyMs"])],
    ["providerFailureClass", pick(record, ["providerFailureClass"])],
    ["providerFailureReason", pick(record, ["providerFailureReason"])],
    ["providerFailureMessage", pick(record, ["providerFailureMessage"])],
    ["result.correct", pick(record, ["result", "correct"])],
    ["result.oracle.exit", pick(record, ["result", "oracle", "exit"])],
    ["usage.tokensIn", pick(record, ["usage", "tokensIn"])],
    ["usage.tokensOut", pick(record, ["usage", "tokensOut"])],
  ];
  console.log(`ROW\t${fields.map(([key, value]) => `${key}=${formatField(value)}`).join("\t")}`);
  console.log(`RAW\t${rawLine === null ? "(no registry line)" : rawLine}`);
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
  const before = registryLineCount();
  let returnedJson;
  try {
    returnedJson = await runBenchRun(client, args);
  } catch (error) {
    returnedJson = JSON.stringify({ error: error.message ?? String(error) });
  }
  const lines = readFileSync(REGISTRY_PATH, "utf-8").split(/\r?\n/).filter((line) => line.length > 0);
  const newLines = lines.slice(before);
  report(args.model, returnedJson, newLines.length > 0 ? newLines[newLines.length - 1] : null);
}

const status = await preflight();
if (typeof status !== "number") {
  console.log(`SERVER\t${status}`);
  process.exit(1);
}
console.log(`SERVER\tstatus=${status}`);

const client = createOpencodeClient({ baseUrl: BASE_URL });
const repetitions = resolveRepetitions(process.env);
const baseArgs = { caseDir: CASE_DIR, registryPath: REGISTRY_PATH, timeoutMs: TIMEOUT_MS };

for (const model of MODELS) {
  await runRepetitions(runCell, client, { ...baseArgs, model }, repetitions);
}

const batchSize = MODELS.length * repetitions;
const firstLine = readFileSync(REGISTRY_PATH, "utf-8").split(/\r?\n/).filter((line) => line.length > 0).slice(-batchSize);
const firstRecord = firstLine.length > 0 ? JSON.parse(firstLine[0]) : {};
console.log(`BUDGET\tfirstCellModel=${pick(firstRecord, ["cell", "model"]) ?? "none"}\ttokensIn=${pick(firstRecord, ["usage", "tokensIn"]) ?? "none"}\tgroqCap=8000`);
