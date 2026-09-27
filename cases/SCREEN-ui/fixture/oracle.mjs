// Oracle for SCREEN-ui: detection accuracy, type accuracy and region IoU.
//
// The region ground truth of an `overlap` item is the intersection of the two
// overlapping elements, never the area they cover together. A correct answer
// frames the intersection; measuring against the union would punish it.
import { readFileSync } from "node:fs";

const DETECTION_THRESHOLD = 0.5;

function readText(path) {
  return readFileSync(path, "utf-8").replace(/^\uFEFF/, "");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

const DEFECT_TYPES = ["truncation", "overlap", "low-contrast"];

function jsonReports(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(output.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Parses one table or key-value line into a report, or null when it is not one. */
function lineReport(line) {
  const image = line.match(/shot-\d+\.png/)?.[0];
  if (!image) return null;
  const rest = line.slice(line.indexOf(image) + image.length);
  const bool = rest.match(/\b(true|false)\b/i);
  if (!bool) return null;
  const type = line.match(/\b(truncation|overlap|low-contrast|none)\b/)?.[0] ?? "none";
  const region = line.match(/\[([-\d.,\s]+)\]/)?.[1];
  return { image, defect: bool[1].toLowerCase() === "true", type, region: region ? region.split(",").map(Number) : [] };
}

/** Merges JSON reports with table-row reports, JSON entries taking precedence. */
function extractReports(output) {
  const byFile = new Map(jsonReports(output).map((report) => [report.image, report]));
  for (const line of output.split(/\r?\n/)) {
    const report = lineReport(line);
    if (report && !byFile.has(report.image)) byFile.set(report.image, report);
  }
  return [...byFile.values()];
}

/** Whether the report flags a defect at all. */
function flagsDefect(report) {
  return report?.defect === true;
}

function detectionCorrect(item, report) {
  return flagsDefect(report) === item.defect;
}

function typeCorrect(item, report) {
  return item.defect && flagsDefect(report) && report.type === item.type;
}

/** Normalizes a reported region to [x, y, w, h], or null when malformed. */
function toBox(region) {
  if (!Array.isArray(region) || region.length !== 4) return null;
  const nums = region.map(Number);
  return nums.every(Number.isFinite) ? nums : null;
}

/** Intersection of two [x, y, w, h] boxes, or null when they do not overlap. */
function intersectBoxes(a, b) {
  const width = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const height = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (width <= 0 || height <= 0) return null;
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), width, height];
}

/** Ground-truth box: the intersection of the declared overlapping elements, or
 * the stored region when the item declares no elements. */
function truthBox(item) {
  const elements = (item.elements ?? []).map((element) =>
    toBox([element.x, element.y, element.w, element.h]),
  );
  const [first, second] = elements;
  if (first && second) {
    const overlap = intersectBoxes(first, second);
    if (overlap) return overlap;
  }
  return [item.region.x, item.region.y, item.region.w, item.region.h];
}

function intersection(a, b) {
  const width = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const height = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return width * height;
}

function area(box) {
  return box[2] * box[3];
}

/** IoU between the reported and the injected region; 0 when unlocated. */
function regionIou(item, report) {
  if (!item.defect || !flagsDefect(report)) return 0;
  const box = toBox(report.region);
  if (!box) return 0;
  const injected = truthBox(item);
  const overlap = intersection(box, injected);
  const union = area(box) + area(injected) - overlap;
  return union <= 0 ? 0 : overlap / union;
}

const items = readJson("truth.json").images;
const reports = extractReports(readText(process.argv[2] ?? "out.txt"));
const byFile = new Map(reports.map((report) => [report.image, report]));

const defective = items.filter((item) => item.defect);
const detectionHits = items.filter((item) => detectionCorrect(item, byFile.get(item.file))).length;
const typeHits = defective.filter((item) => typeCorrect(item, byFile.get(item.file))).length;
const iouSum = defective.reduce((sum, item) => sum + regionIou(item, byFile.get(item.file)), 0);

const detection = detectionHits / items.length;
const typeAccuracy = defective.length === 0 ? 0 : typeHits / defective.length;
const meanIou = defective.length === 0 ? 0 : iouSum / defective.length;
const score = detection * meanIou;

console.log(`DETECTION=${detection.toFixed(3)} TYPE=${typeAccuracy.toFixed(3)} IOU=${meanIou.toFixed(3)} SCORE=${score.toFixed(3)}`);
console.log("FORMULA score = detection_accuracy x mean_region_iou");
for (const item of items) {
  const report = byFile.get(item.file);
  const reported = report ? report.type ?? "?" : "missing";
  console.log(`DETAIL ${item.file} truth=${item.type} reported=${reported} iou=${regionIou(item, report).toFixed(3)}`);
}
process.exit(detection > DETECTION_THRESHOLD ? 0 : 1);
