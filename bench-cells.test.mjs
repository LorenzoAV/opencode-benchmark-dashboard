// Tests for the shared cell loop that carries the repetition into the runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepetitions, resolveRepetitions } from "./bench-cells.mjs";

test("runRepetitions forwards each repetition index to the runner", async () => {
  const seen = [];
  const runner = async (_client, args) => {
    seen.push(args.repetition);
  };
  await runRepetitions(runner, {}, { model: "m" }, 3);
  assert.deepEqual(seen, [1, 2, 3]);
});

test("runRepetitions passes the repetition beside the base args", async () => {
  let captured;
  const runner = async (_client, args) => {
    captured = args;
  };
  await runRepetitions(runner, {}, { model: "m", timeoutMs: 5 }, 1);
  assert.deepEqual(captured, { model: "m", timeoutMs: 5, repetition: 1 });
});

test("resolveRepetitions defaults to one", () => {
  assert.equal(resolveRepetitions({}), 1);
});

test("resolveRepetitions reads a positive integer from the environment", () => {
  assert.equal(resolveRepetitions({ BENCH_REPETITIONS: "2" }), 2);
});

test("resolveRepetitions rejects a non-positive value", () => {
  assert.equal(resolveRepetitions({ BENCH_REPETITIONS: "0" }), 1);
});
