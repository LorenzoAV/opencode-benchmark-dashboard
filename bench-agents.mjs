// Runs the agent matrix for the XLATE-es-en case against the live bench server on port 4096.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createOpencodeClient } from "@opencode-ai/sdk";

const require = createRequire(import.meta.url);
const { runBenchRun } = require("C:/Users/LorEnterprise/.config/opencode/support/bench-runner.js");

import { runRepetitions, resolveRepetitions } from "./bench-cells.mjs";

const BASE_URL = "http://127.0.0.1:4096";
const CASE_DIR = "C:/Users/LorEnterprise/dev/opencode-benchmark-dashboard/cases/XLATE-es-en";
const REGISTRY_PATH = "C:/Users/LorEnterprise/dev/opencode-benchmark-dashboard/results/registry-agents.jsonl";
const TIMEOUT_MS = 300000;
const MODELS = ["zai/glm-4.7-flash", "opencode/big-pickle", "opencode-go/deepseek-v4.1-flash"];
const MATRIX = [
  ["translator", MODELS],
  ["coder", MODELS],
  ["scribe", MODELS],
];

function registryLines() {
  try {
    return readFileSync(REGISTRY_PATH, "utf-8").split(/\r?\n/).filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function pick(object, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function reportCell(index, agent, model, line) {
  let record = {};
  try {
    record = JSON.parse(line);
  } catch {
    record = {};
  }
  const fields = [
    ["latencyMs", pick(record, ["latencyMs"])],
    ["providerFailureClass", pick(record, ["providerFailureClass"])],
    ["providerFailureReason", pick(record, ["providerFailureReason"])],
    ["result.correct", pick(record, ["result", "correct"])],
    ["result.oracle.exit", pick(record, ["result", "oracle", "exit"])],
    ["result.reason", pick(record, ["result", "reason"])],
    ["usage.tokensIn", pick(record, ["usage", "tokensIn"])],
    ["usage.tokensOut", pick(record, ["usage", "tokensOut"])],
  ];
  const flat = fields.map(([key, value]) => `${key}=${value === undefined || value === null ? "null" : value}`);
  console.log(`CELL\t${index}\tagent=${agent}\tmodel=${model}\t${flat.join("\t")}`);
  console.log(`RAW\t${line ?? "(no registry line)"}`);
}

async function preflight() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    return response.status;
  } catch (error) {
    return `unreachable: ${error.message}`;
  }
}

const status = await preflight();
if (typeof status !== "number") {
  console.log(`SERVER\t${status}`);
  process.exit(1);
}
console.log(`SERVER\tstatus=${status}`);

const client = createOpencodeClient({ baseUrl: BASE_URL });
let index = 0;

async function runCell(client, args) {
  index += 1;
  const { agent, model } = args;
  const before = registryLines().length;
  try {
    await runBenchRun(client, args);
  } catch (error) {
    console.log(`ERROR\t${index}\tagent=${agent}\tmodel=${model}\t${error.message ?? String(error)}`);
  }
  const lines = registryLines();
  reportCell(index, agent, model, lines.length > before ? lines[lines.length - 1] : null);
}

const repetitions = resolveRepetitions(process.env);
const baseArgs = { caseDir: CASE_DIR, registryPath: REGISTRY_PATH, timeoutMs: TIMEOUT_MS };

for (const [agent, models] of MATRIX) {
  for (const model of models) {
    await runRepetitions(runCell, client, { ...baseArgs, agent, model }, repetitions);
  }
}
