/**
 * Naming and layout of the shared cohort config directory: one agent per model,
 * all under a single directory, so the whole run needs one server.
 */
import { join } from "path";
import { sanitizeModelName } from "./utils.ts";

/** The variant name of the single directory that holds every cohort agent. */
export const COHORT_VARIANT = "cohort";

/** The agent name for a model: base- plus the sanitized model name. */
export function cohortAgentName(model: string): string {
  return `base-${sanitizeModelName(model)}`;
}

/** The config directory shared by every cell of the cohort. */
export function sharedVariantDir(baseDir: string): string {
  return join(baseDir, COHORT_VARIANT);
}
