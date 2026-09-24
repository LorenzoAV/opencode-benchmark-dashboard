import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { loadCaseManifest } from "./src/config.ts";
import { loadAgentDefinition, materializeVariant, runAgentCase, startVariantServer } from "./src/agent-factory.ts";
import { COHORT_VARIANT, cohortAgentName, sharedVariantDir } from "./src/cohort-variant.ts";
import { runOracle } from "./src/oracle.ts";
import { appendRegistryLine } from "./src/registry.ts";
import type { RegistryRecord } from "./src/registry.ts";
import { buildCells, filterCells } from "./src/grid.ts";
import { runCells } from "./src/grid-runner.ts";
import type { AgentOutcome, OracleOutcome } from "./src/grid-runner.ts";
import { refusedResult } from "./src/registry.ts";

const COHORT = process.env.BENCH_COHORT?.split(",").map((s) => s.trim()).filter(Boolean) ?? [
  "opencode/big-pickle",
  "zai/glm-4.7-flash",
  "opencode/nemotron-3.5-lightning-free",
  "kilo/nvidia/nemotron-3.5-lightning:free",
  "groq/openai/gpt-oss-20b",
  "opencode/ling-3.0-flash-fin-free",
  "opencode/mimo-v2.6-flash-free",
  "opencode/muse-spark-1.2-contributor-free",
  "opencode/muse-spark-1.3-contributor-free",
  "opencode/nemotron-3-ultra-free",
  "opencode/space-bunny-free",
  "zai/glm-4.5-flash",
];

const CATALOG = "C:/Users/LorEnterprise/.config/opencode/model-catalog.json";
const catalog = JSON.parse(readFileSync(CATALOG, "utf-8"));
const entryOf = (model: string) => catalog.models.find((m: any) => m.id === model);

const caseDir = resolve("./cases/CODING-typescript-rust");
const fixtureDir = join(caseDir, "fixture");
const manifestResult = loadCaseManifest(caseDir);
if (!manifestResult.ok) throw new Error("manifest: " + manifestResult.error);
const manifest = manifestResult.manifest;
const prompt = readFileSync(join(caseDir, "prompt.md"), "utf-8");
const def = loadAgentDefinition("coder");
if (!def) throw new Error("coder agent definition not found");

const promptChars = prompt.length;
const fixtureChars = ["Cargo.toml", "src/lib.rs", "tests/longer.rs"]
  .reduce((s, f) => s + readFileSync(join(fixtureDir, f), "utf-8").length, 0);
const budget = { maxOutputTokens: 4000, promptChars, fixtureChars };

const commit = execSync("git rev-parse --short HEAD").toString().trim();
const runId = process.env.BENCH_RUN_ID ?? `cohort-free-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}`;
const REGISTRY = resolve("./results/registry.jsonl");
const baseDir = mkdtempSync(join(tmpdir(), "cohort-"));
const expectedExit = manifest.oracle!.expectExit;
const AGENT_TIMEOUT_MS = 240000;
const SERVER_TIMEOUT_MS = 30000;

const sharedDir = sharedVariantDir(baseDir);
for (const model of COHORT) {
  materializeVariant({
    agentName: cohortAgentName(model),
    variant: COHORT_VARIANT,
    variantText: def.basePrompt,
    baseDir,
    model,
    permission: def.permission,
    description: `bench base ${model}`,
  });
}

const cells = buildCells({ models: COHORT, variants: ["base"], efforts: ["default"], cases: [manifest.id], repetitions: [1] });
const filtered = filterCells(cells, {
  ladder: [{ name: "1", cellCap: 0.1, requiresAuthorization: false }],
  stageOf: () => "1",
  entryOf,
  budgetOf: () => budget,
  hasAuthorization: () => false,
});
console.log("cells:", cells.length, "allowed:", filtered.allowed.length, "refused:", JSON.stringify(filtered.refused));

for (const refused of filtered.refused) {
  const record: RegistryRecord = {
    runId, startedAt: new Date().toISOString(),
    cell: { ...refused.cell, role: manifest.role },
    result: refusedResult(refused.reason),
    usage: { tokensIn: 0, tokensOut: 0, costUsd: 0, costSource: "none" },
    latencyMs: 0, providerFailureClass: null,
    engine: { commit, opencodeVersion: "1.18.32" },
  };
  appendRegistryLine(REGISTRY, record);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("agent-timeout")), ms))]);
}

const server = await startVariantServer(sharedDir, SERVER_TIMEOUT_MS);
if (!server) {
  rmSync(baseDir, { recursive: true, force: true });
  throw new Error("shared server failed to start");
}

try {
  const results: RegistryRecord[] = await runCells(filtered.allowed, {
    runId,
    engine: { commit, opencodeVersion: "1.18.32" },
    roleOf: () => manifest.role,
    expectedExitOf: () => expectedExit,
    materialize: (cell) => ({ configDir: sharedDir, agentName: cohortAgentName(cell.model) }),
    runAgent: async (cell, configDir, agentName): Promise<AgentOutcome> => {
      try {
        const outcome = await withTimeout(
          runAgentCase({ agentName, variantConfigDir: configDir, prompt, server }),
          AGENT_TIMEOUT_MS,
        );
        return outcome.ok
          ? { ok: true, result: { ...outcome.result } }
          : { ok: false, error: outcome.error };
      } catch (e: any) {
        return { ok: false, error: e.message ?? String(e) };
      }
    },
    runOracle: async (cell, modelOutput): Promise<OracleOutcome> => {
      const outcome = await runOracle(fixtureDir, modelOutput, manifest);
      return outcome.ok
        ? { ok: true, result: { command: manifest.oracle!.command, ...outcome.result } }
        : { ok: false, error: outcome.error };
    },
    appendRecord: (record) => {
      appendRegistryLine(REGISTRY, record);
      const status = record.result.refused ? "REFUSED " + record.result.reason : record.result.correct ? "PASS" : "FAIL";
      console.log(`${record.cell.model}\t${status}\tin=${record.usage.tokensIn}\tout=${record.usage.tokensOut}\tcost=$${record.usage.costUsd}\t${record.latencyMs}ms`);
    },
  });

  console.log("---");
  console.log("ran:", results.length);
  const totalCost = results.reduce((s, r) => s + r.usage.costUsd, 0);
  const passed = results.filter((r) => r.result.correct).length;
  const refusedCount = results.filter((r) => r.result.refused).length;
  console.log("passed:", passed, "refused:", refusedCount, "totalCost: $" + totalCost.toFixed(6));
} finally {
  server.close();
  rmSync(baseDir, { recursive: true, force: true });
}
