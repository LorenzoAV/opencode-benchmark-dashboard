# SCREEN-ui — el caso de visión del `screener`

Estado: **QAD** (decisión del operador, 2026-09-27). No se invierte más en el
caso. Queda definido para que quien lo retome lo entienda sin arqueología.

## Qué testea

Seis capturas de una consola simple, 960 por 600, generadas por script. Tres
están limpias. Tres llevan un defecto visual inyectado cada una, de un tipo
distinto: `truncation`, `overlap` y `low-contrast`. El sujeto recibe las seis
imágenes y reporta, por imagen, si hay defecto, de qué tipo, y en qué región
(`[x, y, w, h]` normalizado). El ground truth vive aparte y el sujeto no lo ve.

## Cómo mide

El oráculo imprime una línea por imagen y una nota que es el producto de dos
cuentas:

- `DETECTION` — fracción de imágenes con la detección correcta: hay o no hay
  defecto.
- `TYPE` — fracción de las tres defectuosas con el tipo correcto.
- `IOU` — media de la IoU de la región reportada contra la región ground truth,
  sólo sobre las defectuosas.
- `SCORE = DETECTION × IOU`.

El código de salida es 0 cuando `DETECTION` supera el umbral de 0.5
(`DETECTION_THRESHOLD` en `fixture/oracle.mjs`). El `IOU` no gatea: sólo
alimenta la nota.

### La región ground truth del solapamiento

Para `overlap`, la región ground truth es **la intersección de los dos paneles**
que el caso dibuja, no el área que los dos paneles cubren juntos. Los paneles
son DETAILS (600, 360, 240, 150) y CHART (740, 430, 200, 120); su intersección
es (740, 430, 100, 80), normalizada `0.771, 0.717, 0.104, 0.133`. Una respuesta
correcta enmarca la intersección; medir contra la unión castigaría esa respuesta.
`truth.json` declara los dos paneles en `elements` y `oracle.mjs` calcula la
intersección a partir de ellos.

## Artefactos

- `case.json` — el manifiesto: el comando del oráculo, el `cwd`, el presupuesto.
- `prompt.md` — la instrucción al sujeto.
- `generate-fixtures.ps1` — genera las seis capturas y `truth.json`. Declara los
  dos paneles del solapamiento y calcula su intersección.
- `fixture/shot-01.png` .. `shot-06.png` — las capturas.
- `fixture/truth.json` — el ground truth: imagen, si hay defecto, tipo y región.
  Para `overlap` agrega `elements`, los dos paneles. El sujeto no lo ve.
- `fixture/oracle.mjs` — la medida.
- `fixture/oracle.test.mjs` — los tests del oráculo (la región del solapamiento,
  la respuesta correcta y la coherencia entre `region` y `elements`).

## Cómo se corre

Suelto, desde `fixture/`: `node oracle.mjs out.txt`, con la respuesta del sujeto
en `out.txt`. Por el arnés de visión, desde la raíz del repo:
`node bench-screen.mjs [repeticiones] [registro]`.

## Usos futuros

- Es el banco de visión del `screener` y el único caso de rol con rango
  inter-modelo real.
- Verificar un modelo con visión antes de asignarlo al `screener`; hoy el modelo
  configurado no ve.
- Re-correrlo cuando se suba el tamaño de muestra o entre un modelo nuevo con
  visión.
- Control de regresión de la regla de la región del solapamiento.

## Límites conocidos

- La muestra son tres capturas defectuosas.
- Los defectos son sintéticos, generados por script.
- El `IOU` queda subvaluado si el sujeto enmarca el panel entero en vez de la
  intersección, que es lo que el caso exige.
