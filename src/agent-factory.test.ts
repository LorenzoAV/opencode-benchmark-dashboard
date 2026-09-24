import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  stripJsonComments,
  loadAgentDefinition,
  variantConfigDir,
  variantAgentPath,
  materializeVariant,
  extractAgentBody,
  runAgentCase,
} from "./agent-factory.ts";

const CONFIG_JSONC = `{
  // Global providers — the URL below must survive comment stripping
  "provider": {
    "zai": { "options": { "baseURL": "https://api.z.ai/api/paas/v4" } }
  },
  "agent": {
    "coder": {
      "description": "Implements changes with tests",
      "mode": "subagent",
      "model": "opencode/big-pickle",
      "prompt": "{file:~/.config/opencode/agents/coder.md}",
      "permission": {
        "read": "allow",
        "edit": "ask",
        "bash": { "*": "ask", "git *": "ask" }
      }
    }
  }
}
`;

let workDir: string;
let configFile: string;
let agentsDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "agent-factory-test-"));
  configFile = join(workDir, "opencode.jsonc");
  agentsDir = join(workDir, "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(configFile, CONFIG_JSONC);
  writeFileSync(join(agentsDir, "coder.md"), "BASE PROMPT");
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("stripJsonComments", () => {
  test("removes comments but preserves // inside strings", () => {
    const input = '{ "url": "https://api.z.ai/api/paas/v4", // trailing\n "a": 1 }';
    const stripped = stripJsonComments(input);
    expect(stripped).toContain('"https://api.z.ai/api/paas/v4"');
    expect(stripped).not.toContain("trailing");
    expect(JSON.parse(stripped).a).toBe(1);
  });
});

describe("loadAgentDefinition", () => {
  test("reads model and permission from the real agent config", () => {
    const def = loadAgentDefinition("coder", configFile, agentsDir);
    expect(def).not.toBeNull();
    expect(def!.model).toBe("opencode/big-pickle");
    expect(def!.description).toBe("Implements changes with tests");
    expect((def!.permission as any).read).toBe("allow");
    expect((def!.permission as any).bash["*"]).toBe("ask");
  });

  test("reads the base prompt from the agent markdown file", () => {
    expect(loadAgentDefinition("coder", configFile, agentsDir)!.basePrompt).toBe("BASE PROMPT");
  });

  test("returns null for an unknown agent", () => {
    expect(loadAgentDefinition("nobody", configFile, agentsDir)).toBeNull();
  });
});

describe("variant paths", () => {
  test("builds the config directory and the agent markdown path", () => {
    const configDir = variantConfigDir("C:/base", "strict");
    expect(configDir).toBe(join("C:/base", "strict"));
    expect(variantAgentPath(configDir, "coder")).toBe(join("C:/base", "strict", "agent", "coder.md"));
  });
});

describe("materializeVariant", () => {
  test("writes frontmatter with the real model and permission, and the variant body", () => {
    const baseDir = join(workDir, "variants");
    const def = loadAgentDefinition("coder", configFile, agentsDir)!;
    const configDir = materializeVariant({
      agentName: "coder",
      variant: "base",
      variantText: "You are the base variant.",
      baseDir,
      model: def.model,
      permission: def.permission,
      description: def.description,
    });

    expect(configDir).toBe(variantConfigDir(baseDir, "base"));
    const written = readFileSync(variantAgentPath(configDir, "coder"), "utf-8");
    expect(written.startsWith("---\n")).toBe(true);
    expect(written).toContain('"mode": "subagent"');
    expect(written).toContain('"model": "opencode/big-pickle"');
    expect(written).toContain('"description": "Implements changes with tests"');
    expect(written).toContain('"read": "allow"');
    expect(written).toContain('"*": "ask"');
    expect(written.endsWith("You are the base variant.\n")).toBe(true);
  });
});

describe("extractAgentBody", () => {
  test("returns the body after the closing frontmatter fence", () => {
    const markdown = '---\n"mode": "subagent"\n---\n\nVariant body here.\n';
    expect(extractAgentBody(markdown)).toBe("Variant body here.");
  });

  test("returns the whole text when there is no frontmatter", () => {
    expect(extractAgentBody("just a body")).toBe("just a body");
  });
});

describe("runAgentCase", () => {
  test("returns a named error when the variant agent file is missing", async () => {
    const outcome = await runAgentCase({
      agentName: "coder",
      variantConfigDir: join(workDir, "does-not-exist"),
      prompt: "hello",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBe("variant-missing");
  });
});
