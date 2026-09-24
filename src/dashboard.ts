import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import type { RunSummary, DashboardData, ModelResult, LLMVerification } from "./types.ts";
import { sanitizeModelName } from "./utils.ts";
import { readRegistryFile, summarizeRegistry } from "./registry.ts";

const RESULTS_DIR = resolve("./results");
const REGISTRY_PATH = resolve("./results/registry.jsonl");
const PUBLIC_DIR = resolve("./public");
const PROMPTS_DIR = resolve("./prompts");
const PORT = 3000;

function loadPrompt(testCase: string): string | null {
  const promptPath = join(PROMPTS_DIR, `${testCase}.txt`);
  if (!existsSync(promptPath)) {
    return null;
  }
  return readFileSync(promptPath, "utf-8").trim();
}

function getLatencyMs(result: RunSummary["results"][0]): number {
  if (result.latencyMs && result.latencyMs > 0) {
    return result.latencyMs;
  }
  return 0;
}

interface ModelData {
  model: string;
  runs: RunSummary[];
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  avgLatency: number;
  accuracy: number;
  allResults: (ModelResult & { output: string; expected: string; verification?: LLMVerification })[];
}

function loadAllRuns(): DashboardData {
  const runs: RunSummary[] = [];
  const models = new Set<string>();
  const testCases = new Set<string>();

  if (!existsSync(RESULTS_DIR)) {
    return { runs: [], models: [], testCases: [] };
  }

  const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"));
  
  for (const file of files) {
    try {
      const content = readFileSync(join(RESULTS_DIR, file), "utf-8");
      const run: RunSummary = JSON.parse(content);
      runs.push(run);
      
      if (run.modelStats && run.modelStats.length > 0) {
        for (const stat of run.modelStats) {
          models.add(stat.model);
        }
      } else if (run.results) {
        for (const result of run.results) {
          if (result.model) {
            models.add(result.model);
          }
        }
      }
      
      if (run.results) {
        for (const result of run.results) {
          testCases.add(result.testCase);
        }
      }
    } catch (e) {
      console.error(`Error loading ${file}:`, e);
    }
  }

  runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    runs,
    models: Array.from(models).sort(),
    testCases: Array.from(testCases).sort()
  };
}

function loadModelData(): Map<string, ModelData> {
  const modelMap = new Map<string, ModelData>();

  if (!existsSync(RESULTS_DIR)) {
    return modelMap;
  }

  const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"));
  
  for (const file of files) {
    try {
      const content = readFileSync(join(RESULTS_DIR, file), "utf-8");
      const run: RunSummary = JSON.parse(content);
      
      if (run.modelStats && run.modelStats.length > 0) {
        for (const stat of run.modelStats) {
          if (!modelMap.has(stat.model)) {
            modelMap.set(stat.model, {
              model: stat.model,
              runs: [],
              totalTests: 0,
              totalPassed: 0,
              totalFailed: 0,
              avgLatency: 0,
              accuracy: 0,
              allResults: []
            });
          }
          
          const modelData = modelMap.get(stat.model)!;
          modelData.runs.push(run);
          modelData.totalTests += stat.totalTests;
          modelData.totalPassed += stat.passed;
          modelData.totalFailed += stat.failed;
          modelData.avgLatency += stat.avgLatencyMs * stat.totalTests;
          
            for (const result of run.results) {
              if (result.model === stat.model) {
                const isCorrect = result.llmVerification ? result.llmVerification.correct : result.correct;
                const finalScore = result.llmVerification ? result.llmVerification.score : result.score;
                const latency = getLatencyMs(result);
                const prompt = loadPrompt(result.testCase);
                modelData.allResults.push({
                  testCase: result.testCase,
                  latencyMs: latency,
                  correct: isCorrect,
                  score: finalScore,
                  timestamp: result.timestamp,
                  output: result.output,
                  expected: result.expected,
                  verification: result.llmVerification,
                  prompt: prompt || undefined
                });
              }
            }
        }
      } else if (run.results) {
        for (const result of run.results) {
          const modelName = result.model;
          if (!modelName) continue;
          
          if (!modelMap.has(modelName)) {
            modelMap.set(modelName, {
              model: modelName,
              runs: [],
              totalTests: 0,
              totalPassed: 0,
              totalFailed: 0,
              avgLatency: 0,
              accuracy: 0,
              allResults: []
            });
          }
          
          const modelData = modelMap.get(modelName)!;
          modelData.runs.push(run);
          modelData.totalTests += 1;
          
          const isCorrect = result.llmVerification ? result.llmVerification.correct : result.correct;
          const finalScore = result.llmVerification ? result.llmVerification.score : result.score;
          
          if (isCorrect) {
            modelData.totalPassed += 1;
          } else {
            modelData.totalFailed += 1;
          }
          const latency = getLatencyMs(result);
          modelData.avgLatency += latency;
          
          const prompt = loadPrompt(result.testCase);
          modelData.allResults.push({
            testCase: result.testCase,
            latencyMs: latency,
            correct: isCorrect,
            score: finalScore,
            timestamp: result.timestamp,
            output: result.output,
            expected: result.expected,
            verification: result.llmVerification,
            prompt: prompt || undefined
          });
        }
      }
    } catch (e) {
      console.error(`Error loading ${file}:`, e);
    }
  }

  for (const [model, data] of modelMap) {
    if (data.runs.length > 0) {
      data.avgLatency = Math.round(data.avgLatency / data.totalTests);
      const llmPassed = data.allResults.filter(r => r.correct).length;
      data.totalPassed = llmPassed;
      data.totalFailed = data.allResults.length - llmPassed;
      data.accuracy = Math.round((llmPassed / data.allResults.length) * 100);
    }
  }

  return modelMap;
}

function loadRegistry() {
  const { records, skipped } = readRegistryFile(REGISTRY_PATH);
  return { records, summary: summarizeRegistry(records), skipped };
}

function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'svg': 'image/svg+xml',
  };
  return types[ext || ''] || 'text/plain';
}

function serveStaticFile(urlPath: string): Response | null {
  let filePath: string;
  
  if (urlPath === '/' || urlPath === '/index.html') {
    filePath = join(PUBLIC_DIR, 'index.html');
  } else {
    filePath = join(PUBLIC_DIR, urlPath);
  }
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  const content = readFileSync(filePath);
  const contentType = getContentType(filePath);
  
  return new Response(content, {
    headers: { "Content-Type": contentType }
  });
}

async function startDashboard() {
  const data = loadAllRuns();
  const modelData = loadModelData();
  
  const server = Bun.serve({
    port: PORT,
    fetch(req) {
      const url = new URL(req.url);
      
      const staticResponse = serveStaticFile(url.pathname);
      if (staticResponse) {
        return staticResponse;
      }
      
      if (url.pathname === "/api/runs") {
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      if (url.pathname === "/api/models") {
        return new Response(JSON.stringify(Object.fromEntries(modelData)), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      if (url.pathname === "/api/registry") {
        return new Response(JSON.stringify(loadRegistry()), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      if (url.pathname === "/api/refresh") {
        const freshData = loadAllRuns();
        const freshModelData = loadModelData();
        return new Response(JSON.stringify({ runs: freshData, models: Object.fromEntries(freshModelData) }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      return new Response("Not Found", { status: 404 });
    }
  });

  console.log(`\n📊 Dashboard running at http://localhost:${PORT}/`);
  console.log("Press Ctrl+C to stop\n");
}

startDashboard();
