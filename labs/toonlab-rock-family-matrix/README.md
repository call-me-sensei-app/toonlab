# ToonLab Rock Family Bake Matrix

> Repository-only qualification lab. This is not a public package API.

This lab renders a controlled before/after comparison for every current
Rockgen preset plus the constrained jointed-granite vertical slice. Both sides
use the same low mesh, camera, transform, lighting, and geology palette:

- **Before** uses the low mesh and its low-frequency vertex normals only.
- **After** adds the ToonLab-compiled object normal, height, AO, curvature,
  semantic-region, and coverage pages.

Generate the visual artifacts with:

```bash
node scripts/compile-rock-family-matrix.mjs --seed 11 --atlas 384 --mesh 42
```

Then open:

```text
/labs/toonlab-rock-family-matrix/?family=cliff-wall&seed=11&look=compare&view=hero
```

The six-chart atlas is expected to reject some concave or multi-surface
formations. A rendered comparison is evidence that the family was tested, not
evidence that it passed; check `manifest.acceptance` and the matrix report.

The consolidated contact sheet is generated at
`artifacts/research/toonlab-rock-family-matrix/captures/family-comparison-contact-sheet.png`.
See [the compiler results](../toonlab-realistic-boulder/RESULTS.md) for the
three-seed acceptance matrix and the sandstone-specific conclusion.
