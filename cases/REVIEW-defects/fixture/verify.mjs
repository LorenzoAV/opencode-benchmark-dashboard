// Oracle for REVIEW-defects: recall and precision of an injected-defect review.
import { readFileSync } from "node:fs";

const THRESHOLD_FALLBACK = 0.6;
const COLON_KEY = /([\w./\\-]+\.(?:ts|js|tsx|jsx))\s*[:#]\s*(\d+)/gi;
const WORD_KEY = /([\w./\\-]+\.(?:ts|js|tsx|jsx))[^\n]{0,12}?\blines?\s+(\d+)/gi;

const output = readFileSync(process.argv[2] ?? "out.txt", "utf-8");
const groundTruth = JSON.parse(readFileSync("expected.json", "utf-8"));
const reportLines = output.split(/\r?\n/);

/** Returns the final path segment of a file reference. */
function baseName(filePath) {
  return filePath.split(/[\\/]/).pop();
}

/** Builds the canonical basename:line key for a location. */
function keyFor(file, line) {
  return `${baseName(file)}:${line}`;
}

/** Extracts every basename:line key a report line references. */
function collectKeys(reportLine) {
  const keys = [];
  for (const match of reportLine.matchAll(COLON_KEY)) keys.push(keyFor(match[1], match[2]));
  for (const match of reportLine.matchAll(WORD_KEY)) keys.push(keyFor(match[1], match[2]));
  return keys;
}

/** Whether the report line locates this defect's file and line. */
function lineLocates(reportLine, defect) {
  return collectKeys(reportLine).includes(keyFor(defect.file, defect.line));
}

/** Whether the report line names this defect by keyword. */
function lineNames(reportLine, defect) {
  const lowered = reportLine.toLowerCase();
  return defect.keywords.some((keyword) => lowered.includes(keyword));
}

/** A defect is found when one report line locates it and names it. */
function defectFound(defect) {
  return reportLines.some((reportLine) => lineLocates(reportLine, defect) && lineNames(reportLine, defect));
}

const defects = groundTruth.defects;
const threshold = groundTruth.f1Threshold ?? THRESHOLD_FALLBACK;
const foundIds = defects.filter(defectFound).map((defect) => defect.id);
const injectedKeys = new Set(defects.map((defect) => keyFor(defect.file, defect.line)));
const reportedKeys = new Set(reportLines.flatMap(collectKeys));
const truePositives = [...reportedKeys].filter((key) => injectedKeys.has(key)).length;
const falsePositives = reportedKeys.size - truePositives;
const recall = foundIds.length / defects.length;
const precision = reportedKeys.size === 0 ? 0 : truePositives / reportedKeys.size;
const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

console.log(`RECALL=${recall.toFixed(3)} PRECISION=${precision.toFixed(3)} F1=${f1.toFixed(3)}`);
console.log(`FOUND=${foundIds.join(",") || "none"}`);
console.log(`TP=${truePositives} FP=${falsePositives} REPORTED=${reportedKeys.size}/${injectedKeys.size}`);
process.exit(f1 >= threshold ? 0 : 1);
