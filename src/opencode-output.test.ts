import { describe, test, expect } from "bun:test";
import { parseOpencodeJsonOutput } from "./opencode-output.ts";

/**
 * Verbatim stdout captured from:
 *   opencode run --format json -m opencode/big-pickle "Reply with the single word: pong"
 * Three events: step_start, text ("pong"), step_finish (tokens + cost).
 */
const OBSERVED_STDOUT = [
  '{"type":"step_start","timestamp":1790234722664,"sessionID":"ses_f2db22420ffeuSVA80ezLzOilj","part":{"id":"prt_0d24e01650010K1LYsNs7mU8I2","messageID":"msg_0d24de155001TcjJeYVogGBTxu","sessionID":"ses_f2db22420ffeuSVA80ezLzOilj","type":"step-start"}}',
  '{"type":"text","timestamp":1790234723282,"sessionID":"ses_f2db22420ffeuSVA80ezLzOilj","part":{"id":"prt_0d24e037b0010481ITSx5or06u","messageID":"msg_0d24de155001TcjJeYVogGBTxu","sessionID":"ses_f2db22420ffeuSVA80ezLzOilj","type":"text","text":"pong","time":{"start":1790234723195,"end":1790234723227}}}',
  '{"type":"step_finish","timestamp":1790234723282,"sessionID":"ses_f2db22420ffeuSVA80ezLzOilj","part":{"id":"prt_0d24e03a10019e29jipO8zu8Ik","reason":"stop","messageID":"msg_0d24de155001TcjJeYVogGBTxu","sessionID":"ses_f2db22420ffeuSVA80ezLzOilj","type":"step-finish","tokens":{"total":17232,"input":17218,"output":3,"reasoning":11,"cache":{"write":0,"read":0}},"cost":0}}',
].join("\n");

describe("parseOpencodeJsonOutput", () => {
  test("reconstructs the assistant text from the observed text event", () => {
    expect(parseOpencodeJsonOutput(OBSERVED_STDOUT).output).toBe("pong");
  });

  test("reads input and output tokens from the observed step_finish event", () => {
    const { usage } = parseOpencodeJsonOutput(OBSERVED_STDOUT);
    expect(usage.tokensIn).toBe(17218);
    expect(usage.tokensOut).toBe(3);
  });

  test("reads the provider-reported cost and marks its source", () => {
    const { usage } = parseOpencodeJsonOutput(OBSERVED_STDOUT);
    expect(usage.costUsd).toBe(0);
    expect(usage.costSource).toBe("provider");
  });

  test("leaves usage empty when the events carry no step_finish", () => {
    const textOnly = OBSERVED_STDOUT.split("\n").slice(0, 2).join("\n");
    const { usage } = parseOpencodeJsonOutput(textOnly);
    expect(usage.tokensIn).toBeNull();
    expect(usage.tokensOut).toBeNull();
    expect(usage.costUsd).toBeNull();
    expect(usage.costSource).toBeNull();
  });

  test("ignores malformed lines without throwing", () => {
    const noisy = `${OBSERVED_STDOUT}\nnot json\n\n`;
    expect(parseOpencodeJsonOutput(noisy).output).toBe("pong");
  });

  test("returns empty output for empty input", () => {
    expect(parseOpencodeJsonOutput("").output).toBe("");
  });

  test("is pure: empty input returns an empty result without throwing", () => {
    let result: ReturnType<typeof parseOpencodeJsonOutput> | undefined;
    expect(() => {
      result = parseOpencodeJsonOutput("");
    }).not.toThrow();
    expect(result!.output).toBe("");
    expect(result!.usage.tokensIn).toBeNull();
    expect(result!.usage.costSource).toBeNull();
  });
});
