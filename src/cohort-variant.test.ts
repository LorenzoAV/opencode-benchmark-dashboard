import { describe, test, expect } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { COHORT_VARIANT, cohortAgentName, sharedVariantDir } from "./cohort-variant.ts";
import { materializeVariant } from "./agent-factory.ts";

const MODELS = [
  "opencode/big-pickle",
  "zai/glm-4.7-flash",
  "kilo/nvidia/nemotron-3.5-lightning:free",
  "groq/openai/gpt-oss-20b",
];

describe("cohortAgentName", () => {
  test("prefixes the sanitized model name with base-", () => {
    expect(cohortAgentName("opencode/big-pickle")).toBe("base-opencode-big-pickle");
  });

  test("is stable and uses only valid filename characters", () => {
    const model = "kilo/nvidia/nemotron-3.5-lightning:free";
    const name = cohortAgentName(model);
    expect(name).toBe(cohortAgentName(model));
    expect(/^[a-zA-Z0-9._-]+$/.test(name)).toBe(true);
  });
});

describe("sharedVariantDir", () => {
  test("returns the single directory that holds the whole cohort", () => {
    expect(sharedVariantDir("C:/base")).toBe(join("C:/base", COHORT_VARIANT));
  });
});

describe("the shared cohort directory", () => {
  test("holds one agent file per model, not one directory per model", () => {
    const baseDir = mkdtempSync(join(tmpdir(), "cohort-variant-test-"));
    try {
      for (const model of MODELS) {
        materializeVariant({
          agentName: cohortAgentName(model),
          variant: COHORT_VARIANT,
          variantText: `variant for ${model}`,
          baseDir,
          model,
          permission: {},
        });
      }

      const sharedDir = sharedVariantDir(baseDir);
      expect(readdirSync(sharedDir)).toEqual(["agent"]);
      expect(readdirSync(join(sharedDir, "agent")).length).toBe(MODELS.length);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
