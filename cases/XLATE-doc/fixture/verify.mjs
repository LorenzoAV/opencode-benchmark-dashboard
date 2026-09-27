// Oracle for XLATE-doc: literal preservation ratio and chrF++ against a human reference.
import { readFileSync } from "node:fs";

const PRESERVATION_TARGET = 1.0;
const CHRF_THRESHOLD = 0.77;
const CHAR_ORDER = 6;
const WORD_ORDER = 2;
const BETA = 2;
const PUNCTUATION = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const FENCE = /```[^\n]*\n([\s\S]*?)```/g;
const INLINE_CODE = /`([^`\n]+)`/g;
const URL = /https?:\/\/[^\s<>()"']+/g;
const CAMEL_CASE = /\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g;

const output = readFileSync(process.argv[2] ?? "out.txt", "utf-8");
const source = readFileSync("segmento.md", "utf-8");
const reference = readFileSync("referencia.en.md", "utf-8");

/** Returns capture group 1 of every match of a global regex. */
function captureAll(regex, text) {
  return [...text.matchAll(regex)].map((match) => match[1]);
}

/** Strips fenced blocks and inline code so prose identifiers stay isolated. */
function withoutCode(text) {
  return text.replace(FENCE, " ").replace(INLINE_CODE, " ");
}

/** Collects the literals the role forbids translating: URLs, code, identifiers. */
function extractLiterals(text) {
  const urls = [...text.matchAll(URL)].map((match) => match[0].replace(/[.,;:]+$/, ""));
  const blockLines = captureAll(FENCE, text)
    .flatMap((block) => block.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean);
  const inline = captureAll(INLINE_CODE, text);
  const identifiers = withoutCode(text.replace(URL, " ")).match(CAMEL_CASE) ?? [];
  return [...new Set([...urls, ...blockLines, ...inline, ...identifiers])];
}

/** Ratio 0..1 of literals that appear byte-for-byte in the produced text. */
function preservationRatio(literals, produced) {
  const normalized = produced.replace(/\r\n/g, "\n");
  const kept = literals.filter((literal) => normalized.includes(literal));
  return literals.length === 0 ? 1 : kept.length / literals.length;
}

/** Splits a word's leading or trailing punctuation, mirroring sacrebleu's chrF tokenizer. */
function splitWord(word) {
  if (word.length === 1) return [word];
  if (PUNCTUATION.has(word[word.length - 1])) return [word.slice(0, -1), word.slice(-1)];
  if (PUNCTUATION.has(word[0])) return [word[0], word.slice(1)];
  return [word];
}

/** Tokenizes a segment into words with punctuation separated out. */
function removePunctuation(sentence) {
  return sentence.split(/\s+/).filter(Boolean).flatMap(splitWord);
}

/** Counts every character n-gram of one order, whitespace stripped by default. */
function charNgrams(text, order) {
  const line = text.split(/\s+/).join("");
  const counts = new Map();
  for (let i = 0; i + order <= line.length; i += 1) {
    const gram = line.slice(i, i + order);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Counts every word n-gram of one order from a token list. */
function wordNgrams(tokens, order) {
  const counts = new Map();
  for (let i = 0; i + order <= tokens.length; i += 1) {
    const gram = tokens.slice(i, i + order).join(" ");
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** Builds the chrF++ counters: orders 1..6 on characters, then 1..2 on words. */
function countersFor(text) {
  const counters = [];
  for (let n = 1; n <= CHAR_ORDER; n += 1) counters.push(charNgrams(text, n));
  const tokens = removePunctuation(text);
  for (let n = 1; n <= WORD_ORDER; n += 1) counters.push(wordNgrams(tokens, n));
  return counters;
}

/** [hypothesis count, reference count, match count] for one n-gram order. */
function matchStatistics(hypothesis, referenceCounts) {
  let hypothesisCount = 0;
  let matchCount = 0;
  for (const [gram, count] of hypothesis) {
    hypothesisCount += count;
    matchCount += Math.min(count, referenceCounts.get(gram) ?? 0);
  }
  let referenceCount = 0;
  for (const count of referenceCounts.values()) referenceCount += count;
  return [referenceCounts.size === 0 ? 0 : hypothesisCount, referenceCount, matchCount];
}

/** chrF++ F-beta with effective-order smoothing, matching sacrebleu's default. */
function chrfPlusPlus(hypothesis, referenceCounts) {
  const factor = BETA ** 2;
  let avgPrecision = 0;
  let avgRecall = 0;
  let effectiveOrder = 0;
  for (let i = 0; i < hypothesis.length; i += 1) {
    const [hyp, ref, match] = matchStatistics(hypothesis[i], referenceCounts[i]);
    if (hyp > 0 && ref > 0) {
      avgPrecision += match / hyp;
      avgRecall += match / ref;
      effectiveOrder += 1;
    }
  }
  if (effectiveOrder === 0) return 0;
  avgPrecision /= effectiveOrder;
  avgRecall /= effectiveOrder;
  if (avgPrecision + avgRecall === 0) return 0;
  const fScore = (1 + factor) * avgPrecision * avgRecall;
  return fScore / (factor * avgPrecision + avgRecall);
}

const literals = extractLiterals(source);
const preservation = preservationRatio(literals, output);
const chrf = chrfPlusPlus(countersFor(output), countersFor(reference));
const note = preservation * chrf;
const passed = preservation >= PRESERVATION_TARGET && chrf >= CHRF_THRESHOLD;

console.log(`PRESERVATION=${preservation.toFixed(3)} LITERALS=${literals.length}`);
console.log(`CHRF2plus=${chrf.toFixed(3)} THRESHOLD=${CHRF_THRESHOLD.toFixed(2)}`);
console.log(`NOTE=${note.toFixed(3)} = preservation * chrf`);
process.exit(passed ? 0 : 1);
