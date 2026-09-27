# Review six UI screenshots

Six screenshots of a console interface are attached, in this order:

- `shot-01.png`
- `shot-02.png`
- `shot-03.png`
- `shot-04.png`
- `shot-05.png`
- `shot-06.png`

Review each screenshot for visual defects. A defect is exactly one of:

- `truncation` — a text or element is cut off at the edge of its container.
- `overlap` — two elements are drawn on top of each other.
- `low-contrast` — text is rendered with too little contrast against its background.

Only the injected defect above counts. Ignore cosmetic preferences.

For each screenshot, report:

- whether it has a defect,
- the defect type (`truncation`, `overlap`, `low-contrast`, or `none`),
- the region of the defect as normalized coordinates `[x, y, w, h]`, each in
  `0..1` relative to the image (origin top-left). For a clean image use
  `[0, 0, 0, 0]`.

Return only a JSON array with one object per image, in the order above, with
exactly these keys: `image`, `defect` (boolean), `type` (string), `region`
(array of four numbers). Say nothing else: no table, no markdown, no code
fence, no prose. The first character of your reply must be `[` and the last
must be `]`.

Example:

```json
[
  { "image": "shot-01.png", "defect": false, "type": "none", "region": [0, 0, 0, 0] },
  { "image": "shot-02.png", "defect": true, "type": "truncation", "region": [0.067, 0.253, 0.367, 0.04] }
]
```
