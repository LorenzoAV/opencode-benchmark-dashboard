export interface TestCase {
  id: string;
  prompt: string;
  expected: string;
  language?: string;
}

export interface BenchmarkConfig {
  testCases: TestCase[];
  timeout: number;
  evaluatorModel?: string;
  verification?: {
    caseSensitive?: boolean;
  };
}

export interface LLMVerification {
  verifiedBy: string;
  timestamp: string;
  correct: boolean;
  score: number;
  reasoning: string;
}

export interface BenchmarkResult {
  timestamp: string;
  model: string;
  testCase: string;
  latencyMs: number;
  correct: boolean;
  score: number;
  output: string;
  expected: string;
  error?: string;
  llmVerification?: LLMVerification;
  variant?: string;
  effort?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  costSource?: string;
  providerFailureClass?: string | null;
}

export interface CaseOracle {
  command: string;
  cwd: string;
  expectExit: number;
  initialFails: boolean;
  timeoutMs: number;
  maxOutputTokens: number;
}

export type RubricSignal =
  | "defect-id"
  | "verdict-match"
  | "citation-reachable"
  | "quote-present"
  | "judge";

export interface RubricCriterion {
  id: string;
  weight: number;
  signal: RubricSignal;
}

export interface CaseRubric {
  criteria: RubricCriterion[];
  anchorRef: string;
}

export interface CaseBudget {
  maxOutputTokens: number;
  maxCostUsd: number;
}

export interface CaseManifest {
  id: string;
  role: string;
  prompt: string;
  oracle?: CaseOracle;
  rubric?: CaseRubric;
  budget: CaseBudget;
}

export interface CellKey {
  model: string;
  variant: string;
  effort: string;
  case: string;
  repetition: number;
}

export interface RunSummary {
  runId: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: BenchmarkResult[];
  modelStats: ModelStats[];
}

export interface ModelStats {
  model: string;
  totalTests: number;
  passed: number;
  failed: number;
  avgLatencyMs: number;
  accuracy: number;
}

export interface DashboardData {
  runs: RunSummary[];
  models: string[];
  testCases: string[];
}

export interface ModelResult {
  testCase: string;
  latencyMs: number;
  correct: boolean;
  score: number;
  timestamp: string;
  prompt?: string;
}
