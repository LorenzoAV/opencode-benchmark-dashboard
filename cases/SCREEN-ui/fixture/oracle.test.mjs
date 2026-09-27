// Tests for the SCREEN-ui oracle: the overlap ground truth is the intersection
// of the two overlapping elements, so a correct answer is not punished by IoU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const oracle = join(here, "oracle.mjs");
const realTruth = JSON.parse(readFileSync(join(here, "truth.json"), "utf-8").replace(/^\uFEFF/, ""));

// The two panels the overlap variant draws, normalized x, y, w, h.
const DETAILS = { x: 0.625, y: 0.6, w: 0.25, h: 0.25 };
const CHART = { x: 0.771, y: 0.717, w: 0.208, h: 0.2 };
// The intersection of the two panels is the ground truth. The area the two
// panels cover together (their union) is what a panel-framing answer reports,
// and is not the ground truth.
const INTERSECTION = [0.771, 0.717, 0.104, 0.133];
const UNION = [0.625, 0.6, 0.354, 0.317];

/** Runs the oracle over a truth and an answer in a throwaway directory. */
function runOracle(truth, answer) {
  const dir = mkdtempSync(join(tmpdir(), "oracle-screen-"));
  try {
    writeFileSync(join(dir, "truth.json"), JSON.stringify(truth));
    writeFileSync(join(dir, "out.txt"), answer);
    return spawnSync(process.execPath, [oracle, "out.txt"], { cwd: dir, encoding: "utf-8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A fully correct answer that reports `overlapRegion` for shot-04. */
function correctAnswer(overlapRegion) {
  const region = (item) => {
    if (item.file === "shot-04.png") return overlapRegion;
    if (item.region === null) return [0, 0, 0, 0];
    return [item.region.x, item.region.y, item.region.w, item.region.h];
  };
  const reports = realTruth.images.map((item) => ({
    image: item.file,
    defect: item.defect,
    type: item.type,
    region: region(item),
  }));
  return JSON.stringify(reports);
}

test("the overlap ground truth is the intersection, not the union of the panels", () => {
  const truth = JSON.parse(JSON.stringify(realTruth));
  const shot = truth.images.find((item) => item.file === "shot-04.png");
  shot.elements = [DETAILS, CHART];
  shot.region = { x: UNION[0], y: UNION[1], w: UNION[2], h: UNION[3] };

  const result = runOracle(truth, correctAnswer(INTERSECTION));

  assert.match(result.stdout, /DETAIL shot-04\.png truth=overlap reported=overlap iou=1\.000/);
});

test("a correct answer that frames the intersection is not punished", () => {
  const result = runOracle(realTruth, correctAnswer(INTERSECTION));

  assert.match(result.stdout, /IOU=1\.000/);
  assert.equal(result.status, 0);
});

test("the stored overlap region is the intersection of the declared elements", () => {
  const shot = realTruth.images.find((item) => item.file === "shot-04.png");
  const [a, b] = shot.elements.map((element) => [element.x, element.y, element.w, element.h]);
  const x = Math.max(a[0], b[0]);
  const y = Math.max(a[1], b[1]);
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - x;
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - y;
  const round3 = (value) => Math.round(value * 1000) / 1000;

  assert.deepEqual(
    [shot.region.x, shot.region.y, shot.region.w, shot.region.h],
    [round3(x), round3(y), round3(w), round3(h)],
  );
});
