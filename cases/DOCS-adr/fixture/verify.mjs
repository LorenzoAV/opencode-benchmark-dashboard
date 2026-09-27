// Oracle for DOCS-adr: MADR structural fields and lexical similarity to a reference.
import { readFileSync } from "node:fs";
import { structureFields, structureFraction } from "./madr.mjs";
import { cosineText } from "./similarity.mjs";

const CONTENT_THRESHOLD_FALLBACK = 0.72;
const EXPECTED_PATH = "expected.json";
const REFERENCE_PATH = "referencia/0004-adoptar-madr.md";
const ENTRY_START = /<<<\s*ENTRADA_ADR\s*>>>/i;
const ENTRY_END = /<<<\s*FIN_ENTRADA_ADR\s*>>>/i;
const INDEX_START = /<<<\s*INDICE\s*>>>/i;
const INDEX_END = /<<<\s*FIN_INDICE\s*>>>/i;

/** Text between the two markers, or empty when either is absent. */
function between(text, start, end) {
  const at = text.search(start);
  if (at === -1) return "";
  const afterStart = text.slice(at + text.slice(at).match(start)[0].length);
  const stop = afterStart.search(end);
  return (stop === -1 ? afterStart : afterStart.slice(0, stop)).trim();
}

function missingNames(fields) {
  return Object.entries(fields).filter(([, present]) => !present).map(([name]) => name);
}

function fieldReport(fields) {
  return Object.entries(fields).map(([name, present]) => `${name}=${present ? 1 : 0}`).join(" ");
}

/** Reads the calibrated content threshold from the fixture's expected.json. */
function contentThreshold() {
  const expected = JSON.parse(readFileSync(EXPECTED_PATH, "utf-8"));
  return expected.contentThreshold ?? CONTENT_THRESHOLD_FALLBACK;
}

function main() {
  const output = readFileSync(process.argv[2] ?? "out.txt", "utf-8");
  const entry = between(output, ENTRY_START, ENTRY_END) || output;
  const index = between(output, INDEX_START, INDEX_END);
  const reference = readFileSync(REFERENCE_PATH, "utf-8");
  const threshold = contentThreshold();
  const fields = structureFields(entry, index);
  const structure = structureFraction(fields);
  const content = cosineText(entry, reference);
  const missing = missingNames(fields);
  const note = structure * content;
  console.log(`STRUCTURE=${structure.toFixed(3)} MISSING=${missing.length === 0 ? "none" : missing.join(",")}`);
  console.log(`CONTENT=${content.toFixed(3)} THRESHOLD=${threshold.toFixed(2)}`);
  console.log(`NOTE=${note.toFixed(3)} = structure * content`);
  console.log(`FIELDS ${fieldReport(fields)}`);
  return structure === 1 && content >= threshold ? 0 : 1;
}

process.exit(main());
