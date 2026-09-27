// Tests for the REVIEW-defects oracle: the gate must count precision, not only recall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(here, "expected.json"), "utf-8"));
const DECOY_LINES = 13;

/** One report line: locate the defect and name it, so the oracle counts it found. */
function foundLine(defect) {
  return `${defect.file}:${defect.line} ${defect.keywords[0]}`;
}

/** Report lines that locate lines no defect occupies, to spend precision. */
function decoyLines(file, count) {
  return Array.from({ length: count }, (_, offset) => `${file}:${100 + offset} unrelated`);
}

/** Runs the oracle over a report and returns its exit status and stdout. */
function runOracle(report) {
  const dir = mkdtempSync(join(tmpdir(), "verify-review-"));
  try {
    const reportPath = join(dir, "report.txt");
    writeFileSync(reportPath, report);
    return spawnSync(process.execPath, [join(here, "verify.mjs"), reportPath], {
      cwd: here,
      encoding: "utf-8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a high-recall, low-precision report is rejected", () => {
  const defects = expected.defects;
  const report = [...defects.map(foundLine), ...decoyLines(defects[0].file, DECOY_LINES)].join("\n");
  const result = runOracle(report);

  assert.match(result.stdout, /RECALL=1\.000/);
  assert.match(result.stdout, /PRECISION=0\.278/);
  assert.equal(result.status, 1);
});

test("a report that finds every defect without noise is accepted", () => {
  const report = expected.defects.map(foundLine).join("\n");
  const result = runOracle(report);

  assert.match(result.stdout, /F1=1\.000/);
  assert.equal(result.status, 0);
});
