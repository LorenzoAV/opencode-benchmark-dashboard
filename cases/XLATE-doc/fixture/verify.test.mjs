// Tests for the XLATE-doc oracle: the gate must clear the measured chrF floor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const HALF_TRANSLATION = `## Correr el banco de pruebas

The test bench measures model latency. Antes de arrancar, exportá el
token de sesión y confirmá que existe el archivo registryPath. The server
configuration lives in \`config/benchmark.json\`.

El runner reintenta una celda cuando el proveedor responde con un error de
sobrecarga. The retry uses applyTo and rewrites the subject's output. The oracle
makeOracle runs outside the session, so the model never sees it.

\`\`\`js
const oracle = makeOracle(effects)
const result = await oracle(fixtureDir, modelOutput, manifest)
\`\`\`

El registro se apila en results/registry-agents.jsonl. The official guide is at
https://opencode.ai/docs/benchmarks and the service status at
https://status.opencode.ai. Para una corrida limpia, borrá el directorio target
antes de empezar.
`;

/** Runs the oracle over a translation and returns its exit status and stdout. */
function runOracle(output) {
  const dir = mkdtempSync(join(tmpdir(), "verify-xlate-"));
  try {
    const outPath = join(dir, "out.txt");
    writeFileSync(outPath, output);
    return spawnSync(process.execPath, [join(here, "verify.mjs"), outPath], {
      cwd: here,
      encoding: "utf-8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a translation below the measured floor is rejected", () => {
  const half = runOracle(HALF_TRANSLATION);
  assert.match(half.stdout, /PRESERVATION=1\.000/);
  assert.match(half.stdout, /CHRF2plus=0\.725/);
  assert.equal(half.status, 1);

  const reference = readFileSync(join(here, "referencia.en.md"), "utf-8");
  assert.equal(runOracle(reference).status, 0);
});
