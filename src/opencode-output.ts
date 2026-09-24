/**
 * Pure parser for the JSONL events of `opencode run --format json`.
 * No disk, no spawn, no exceptions: absent usage stays null, never invented.
 */

export interface OpencodeUsage {
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  costSource: string | null;
}

export interface OpencodeJsonResult {
  output: string;
  usage: OpencodeUsage;
}

interface EventUsage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

function parseEventLine(line: string): any | null {
  if (line.trim().length === 0) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function textFromEvent(event: any): string | null {
  const part = event?.part;
  if (event?.type === "text" && part && typeof part.text === "string") return part.text;
  return null;
}

function usageFromEvent(event: any): EventUsage | null {
  const part = event?.part;
  if (event?.type !== "step_finish" || !part?.tokens) return null;
  return {
    tokensIn: typeof part.tokens.input === "number" ? part.tokens.input : 0,
    tokensOut: typeof part.tokens.output === "number" ? part.tokens.output : 0,
    costUsd: typeof part.cost === "number" ? part.cost : null,
  };
}

/**
 * Parses the JSONL events of `opencode run --format json`. Reconstructs the
 * assistant text and reads usage from step_finish events. Absent usage stays
 * null: it is never invented.
 */
export function parseOpencodeJsonOutput(stdout: string): OpencodeJsonResult {
  const texts: string[] = [];
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let costUsd: number | null = null;

  for (const line of stdout.split(/\r?\n/)) {
    const event = parseEventLine(line);
    if (!event) continue;
    const text = textFromEvent(event);
    if (text !== null) texts.push(text);
    const usage = usageFromEvent(event);
    if (!usage) continue;
    tokensIn = (tokensIn ?? 0) + usage.tokensIn;
    tokensOut = (tokensOut ?? 0) + usage.tokensOut;
    if (usage.costUsd !== null) costUsd = (costUsd ?? 0) + usage.costUsd;
  }

  return {
    output: texts.join("\n"),
    usage: { tokensIn, tokensOut, costUsd, costSource: costUsd === null ? null : "provider" },
  };
}
