// Shared cell loop for the bench drivers: carries the repetition into the runner.

/** Number of repetitions from the environment, defaulting to one. */
export function resolveRepetitions(env = {}) {
  const parsed = Number(env.BENCH_REPETITIONS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Runs one cell per repetition, forwarding the repetition index to the runner. */
export async function runRepetitions(runner, client, baseArgs, repetitions) {
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    await runner(client, { ...baseArgs, repetition });
  }
}
