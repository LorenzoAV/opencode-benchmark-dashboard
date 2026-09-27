// Tests for the DOCS-adr oracle: the gate must weigh content, not only the template.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const INDEX = `# Registro de decisiones

| Número | Título | Estado | Fecha | Archivo |
|---|---|---|---|---|
| 1 | Adoptar Markdown | Aceptada | 2026-03-04 | [0001-adoptar-markdown.md](0001-adoptar-markdown.md) |
| 2 | Usar Git | Aceptada | 2026-03-11 | [0002-usar-git.md](0002-usar-git.md) |
| 3 | Fijar Node 20 | Aceptada | 2026-04-02 | [0003-node-20.md](0003-node-20.md) |
| 4 | Registrar decisiones | Aceptada | 2026-05-12 | [0004-registrar-decisiones.md](0004-registrar-decisiones.md) |
`;

const FILLER_ENTRY = `# 4. Registrar decisiones

- **Estado:** Aceptada
- **Fecha:** 2026-05-12

## Contexto

Antes las decisiones se anotaban en una hoja suelta y se perdían los motivos.

## Decisión

Usar un archivo por decisión con sus secciones y mantener el índice al día.

## Consecuencias

Hay más trabajo de mantenimiento y el historial queda en el repositorio.`;

/** Wraps one entry and the index in the markers the prompt asks for. */
function oracleOutput(entry) {
  return `<<<ENTRADA_ADR>>>\n${entry}\n<<<FIN_ENTRADA_ADR>>>\n<<<INDICE>>>\n${INDEX}<<<FIN_INDICE>>>\n`;
}

/** Runs the oracle over an output and returns its exit status and stdout. */
function runOracle(output) {
  const dir = mkdtempSync(join(tmpdir(), "verify-docs-"));
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

test("a sectioned ADR with no matching content is rejected", () => {
  const filler = runOracle(oracleOutput(FILLER_ENTRY));
  assert.match(filler.stdout, /STRUCTURE=1\.000/);
  assert.match(filler.stdout, /CONTENT=0\.476/);
  assert.equal(filler.status, 1);

  const reference = readFileSync(join(here, "referencia", "0004-adoptar-madr.md"), "utf-8");
  assert.equal(runOracle(oracleOutput(reference)).status, 0);
});
