// Oracle for SECURITY-vectors: recall and precision of an injected-vulnerability audit.
import { readFileSync } from "node:fs";

const THRESHOLD_FALLBACK = 0.6;
const FILE_EXT = "ts|js|tsx|jsx|mjs|py";
const COLON_KEY = new RegExp(`([\\w./\\\\-]+\\.(?:${FILE_EXT}))\\s*[:#]\\s*(\\d+)`, "gi");
const WORD_KEY = new RegExp(`([\\w./\\\\-]+\\.(?:${FILE_EXT}))[^\\n]{0,12}?\\blines?\\s+(\\d+)`, "gi");

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

/** Whether the report line locates this vulnerability's file and line. */
function lineLocates(reportLine, vuln) {
  return collectKeys(reportLine).includes(keyFor(vuln.file, vuln.line));
}

/** Whether the report line names this vulnerability by keyword. */
function lineNames(reportLine, vuln) {
  const lowered = reportLine.toLowerCase();
  return vuln.keywords.some((keyword) => lowered.includes(keyword));
}

/** A vulnerability is found when one report line locates it and names it. */
function vulnFound(vuln) {
  return reportLines.some((reportLine) => lineLocates(reportLine, vuln) && lineNames(reportLine, vuln));
}

/** Safe division that maps a zero denominator to zero. */
function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Harmonic mean of precision and recall, zero when both are zero. */
function f1Of(precision, recall) {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

const vulns = groundTruth.vulnerabilities;
const threshold = groundTruth.f1Threshold ?? THRESHOLD_FALLBACK;
const foundIds = vulns.filter(vulnFound).map((vuln) => vuln.id);
const injectedKeys = new Set(vulns.map((vuln) => keyFor(vuln.file, vuln.line)));
const reportedKeys = new Set(reportLines.flatMap(collectKeys));
const truePositives = [...reportedKeys].filter((key) => injectedKeys.has(key)).length;
const falsePositives = reportedKeys.size - truePositives;
const recall = ratio(foundIds.length, vulns.length);
const precision = ratio(truePositives, reportedKeys.size);
const f1 = f1Of(precision, recall);

console.log(`RECALL=${recall.toFixed(3)} PRECISION=${precision.toFixed(3)} F1=${f1.toFixed(3)}`);
console.log(`FOUND=${foundIds.join(",") || "none"}`);
console.log(`TP=${truePositives} FP=${falsePositives} REPORTED=${reportedKeys.size}/${injectedKeys.size}`);
process.exit(f1 >= threshold ? 0 : 1);
