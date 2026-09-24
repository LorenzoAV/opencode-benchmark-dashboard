/**
 * Materializes a prompt variant as a temporary opencode agent and runs one case
 * against it through the opencode server API. The global opencode config is
 * never written: only a temporary variant directory is created.
 *
 * The CLI `opencode run --agent <subagent>` is forbidden here: it rejects the
 * subagent mode, warns, and runs the default agent with exit 0. The server API
 * accepts subagents, and this module verifies the agent is registered before
 * sending a prompt.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";

export const DEFAULT_CONFIG_FILE = join(homedir(), ".config", "opencode", "opencode.jsonc");
export const DEFAULT_AGENTS_DIR = join(homedir(), ".config", "opencode", "agents");
const DEFAULT_SERVER_TIMEOUT_MS = 30000;

export interface AgentDefinition {
  name: string;
  model: string;
  permission: Record<string, unknown>;
  description: string;
  basePrompt: string;
}

export interface MaterializeVariantOptions {
  agentName: string;
  variant: string;
  variantText: string;
  baseDir: string;
  model: string;
  permission: Record<string, unknown>;
  description?: string;
}

export interface RunAgentCaseOptions {
  agentName: string;
  variantConfigDir: string;
  prompt: string;
  timeoutMs?: number;
}

export interface AgentRunResult {
  output: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costSource: string;
}

export type AgentRunError =
  | "variant-missing"
  | "server-start-failed"
  | "agent-not-registered"
  | "variant-not-loaded"
  | "prompt-failed";

export type AgentRunOutcome =
  | { ok: true; result: AgentRunResult }
  | { ok: false; error: AgentRunError; detail?: string };

/** Removes JSONC comments without touching `//` inside strings (e.g. URLs). */
export function stripJsonComments(text: string): string {
  return text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, str) => str ?? "");
}

/** Reads the real agent's model and permission. Returns null when not found. */
export function loadAgentDefinition(
  agentName: string,
  configFile: string = DEFAULT_CONFIG_FILE,
  agentsDir: string = DEFAULT_AGENTS_DIR,
): AgentDefinition | null {
  if (!existsSync(configFile)) return null;

  let config: any;
  try {
    config = JSON.parse(stripJsonComments(readFileSync(configFile, "utf-8")));
  } catch {
    return null;
  }

  const entry = config?.agent?.[agentName];
  if (!entry) return null;

  const agentFile = join(agentsDir, `${agentName}.md`);
  return {
    name: agentName,
    model: entry.model,
    permission: entry.permission ?? {},
    description: entry.description ?? "",
    basePrompt: existsSync(agentFile) ? readFileSync(agentFile, "utf-8") : "",
  };
}

/** The config directory a variant is materialized into. */
export function variantConfigDir(baseDir: string, variant: string): string {
  return join(baseDir, variant);
}

/** The agent markdown path inside a variant config directory. */
export function variantAgentPath(configDir: string, agentName: string): string {
  return join(configDir, "agent", `${agentName}.md`);
}

function yamlScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "null";
  return JSON.stringify(String(value));
}

function yamlLines(value: Record<string, unknown>, indent: number): string[] {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const [key, val] of Object.entries(value)) {
    const keyText = JSON.stringify(key);
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      lines.push(`${pad}${keyText}:`);
      lines.push(...yamlLines(val as Record<string, unknown>, indent + 2));
    } else {
      lines.push(`${pad}${keyText}: ${yamlScalar(val)}`);
    }
  }
  return lines;
}

/** Renders the temp agent markdown: frontmatter plus the variant body. */
export function renderAgentMarkdown(options: MaterializeVariantOptions): string {
  const frontmatter: Record<string, unknown> = {
    description: options.description ?? `Benchmark variant "${options.variant}" of agent "${options.agentName}"`,
    mode: "subagent",
    model: options.model,
    permission: options.permission,
  };
  return ["---", ...yamlLines(frontmatter, 0), "---", "", options.variantText, ""].join("\n");
}

/** Writes `<baseDir>/<variant>/agent/<agentName>.md`. Returns the config dir. */
export function materializeVariant(options: MaterializeVariantOptions): string {
  const configDir = variantConfigDir(options.baseDir, options.variant);
  mkdirSync(join(configDir, "agent"), { recursive: true });
  writeFileSync(variantAgentPath(configDir, options.agentName), renderAgentMarkdown(options), "utf-8");
  return configDir;
}

async function withConfigDir<T>(configDir: string, action: () => Promise<T>): Promise<T> {
  const previous = process.env.OPENCODE_CONFIG_DIR;
  process.env.OPENCODE_CONFIG_DIR = configDir;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_CONFIG_DIR;
    else process.env.OPENCODE_CONFIG_DIR = previous;
  }
}

async function startVariantServer(configDir: string, timeoutMs: number): Promise<{ url: string; close(): void } | null> {
  try {
    return await withConfigDir(configDir, () =>
      createOpencodeServer({ hostname: "127.0.0.1", port: 0, timeout: timeoutMs }),
    );
  } catch {
    return null;
  }
}

function textFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
}

/** The markdown body after the closing frontmatter fence. */
export function extractAgentBody(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== "---") return markdown.trim();
  const end = lines.indexOf("---", 1);
  if (end === -1) return markdown.trim();
  return lines.slice(end + 1).join("\n").trim();
}

/**
 * Runs one case against the materialized agent. Returns a named error rather
 * than a successful result whenever the requested agent cannot be measured.
 */
export async function runAgentCase(options: RunAgentCaseOptions): Promise<AgentRunOutcome> {
  const agentFile = variantAgentPath(options.variantConfigDir, options.agentName);
  if (!existsSync(agentFile)) {
    return { ok: false, error: "variant-missing", detail: agentFile };
  }

  const server = await startVariantServer(options.variantConfigDir, options.timeoutMs ?? DEFAULT_SERVER_TIMEOUT_MS);
  if (!server) return { ok: false, error: "server-start-failed", detail: options.variantConfigDir };

  try {
    const client = createOpencodeClient({ baseUrl: server.url });
    const agents = await client.app.agents();
    const registered = agents.data?.find((agent) => agent.name === options.agentName);
    if (!registered) {
      return { ok: false, error: "agent-not-registered", detail: options.agentName };
    }
    const body = extractAgentBody(readFileSync(agentFile, "utf-8"));
    if (body.length > 0 && !registered.prompt?.includes(body)) {
      return { ok: false, error: "variant-not-loaded", detail: options.agentName };
    }

    const created = await client.session.create({ body: { title: `bench ${options.agentName}` } });
    if (created.error || !created.data) {
      return { ok: false, error: "prompt-failed", detail: "session-create" };
    }

    const prompted = await client.session.prompt({
      path: { id: created.data.id },
      body: { agent: options.agentName, parts: [{ type: "text", text: options.prompt }] },
    });
    if (prompted.error || !prompted.data) {
      return { ok: false, error: "prompt-failed", detail: JSON.stringify(prompted.error) };
    }

    const { info, parts } = prompted.data;
    return {
      ok: true,
      result: {
        output: textFromParts(parts),
        tokensIn: info.tokens.input,
        tokensOut: info.tokens.output,
        costUsd: info.cost,
        costSource: "provider",
      },
    };
  } finally {
    server.close();
  }
}
