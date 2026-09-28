# Rock Realism Proof — Results

Date: 2026-08-16

## Verdict

The methodology is worth adapting; the Vibe3D implementation should not be
imported wholesale yet.

The complete compiled control produces a convincing realistic granite read at
hero and gameplay distance. The field-only version does not: it exposes noisy,
faceted surface detail even when rendered through Vibe3D's own extractor. The
same field through ToonLab's current QEF surface-nets extractor has matching
connectivity and nearly the same silhouette. That makes the high-to-low bake
and material response—not a uniquely superior mesher—the decisive quality
step.

## Observations

| Test | Result | Consequence |
| --- | --- | --- |
| Vibe field + Vibe extractor | Macro form works; raw surface is visibly procedural | Field alone is not the target asset |
| Vibe field + ToonLab extractor | Same triangle connectivity and silhouette class | Keep ToonLab's extractor |
| Vibe compiled seed 1 | Convincing granite at mid distance; 7,816 triangles | Complete pipeline proves the concept |
| Compiled close view | Much stronger relief, lichen, and fracture read; repetition/softness remains visible | “Megascans-like” is fair at gameplay distance, not scan parity in close inspection |
| Compiled seeds 2 and 3 | Material quality survives, but prow/arch shapes require deliberate art direction | Do not treat arbitrary seeds as production-ready boulders |

All three structural seeds were deterministic, single-component, closed, and
free of degenerate triangles or non-finite vertices. The field extractor did
report 6–29 non-manifold edges depending on the seed, so topology cleanup
remains an explicit compiler responsibility.

## Recommended ToonLab adaptation

1. Retain the geology-authored signed-distance field and ToonLab's existing QEF
   extractor for the game mesh.
2. Add an offline high-resolution evaluation and UV bake that outputs
   object-space normal, height, AO, curvature, and semantic region masks.
3. Feed those pages into a smaller ToonLab-owned rock material, then apply
   stylization after the realistic shape and surface pass is accepted.
4. Validate families separately (boulder, slab, arch, cliff) and reject seeds
   that do not satisfy that family's silhouette and grounding rules.

The capture manifest and PNG evidence live under
`artifacts/research/rock-realism-poc/captures/`. The large upstream controls are
deliberately disposable and remain under gitignored
`assets-local/labs/rock-realism-poc/`.
