# Rock geology v2 — C7 high-to-low bake compiler

> **Status:** repository-only approved C7 contract  
> **Compiler:** `toonlab/rock-geology-bake-compiler` `2.0.0-c7.1`  
> **Scope:** one neutral-realistic production granodiorite boulder plus compiler adversarial fixtures

C7 converts approved C4/C5/C6 procedural geology into separately named dense,
render, fallback, and collision geometry, then bakes a deterministic neutral PBR
surface. It does not expose a public package API and it does not claim family
generalization, Unreal readiness, scan provenance, or Megascans equivalence.

The optional C8 provider/template adapter does not change this authority. A
repaired provider mesh may enter as an admitted dense/detail donor only after the
ToonLab control cage and semantic landmarks reassert family identity. See
`docs/rock-geology-v2-provider-template-bridge.md`.

## Locked compiler behavior

- Dense source, render mesh, three fallback meshes, and collision source are
  independently sampled from one physical field and content-hashed.
- Connected signed-axis UV islands split automatically when their projection
  overlaps, then pack with scale-selected density and deterministic gutters.
- Every covered texel uses a symmetric projection cage. All bracketed roots are
  enumerated and the root nearest the low surface wins, preventing first-hit
  errors on thin, concave, and stacked surfaces.
- Float32 intermediates retain tangent normal, AO, height, curvature, and
  roughness before RGBA8 evidence export.
- Provider-assisted assets keep two different height products: `HeightMicro` is
  bounded material/surface relief; `HeightResidual` is the signed geometric
  source-to-LOD difference. They are never aliases or substitutes.
- For unrelated source/target topology, the Blender adapter bakes source position,
  target position, target object normal, and coverage into the same low UV0, then
  evaluates `dot(sourcePosition - targetPosition, targetNormal)`. Miss and clipping
  rates are measured and fail closed.
- Base color is sRGB and lighting-free. Normal, AO/roughness/height,
  cavity/curvature, material/fabric/deposition, fracture, and
  weathering/exposure/wetness pages are linear.
- Production mips stop at the last level with at least two gutter texels. The
  2048² prop therefore qualifies levels 0–4 and clamps below 128² rather than
  generating unsafe cross-chart 64²-to-1² levels.
- Prop/outcrop assets use a single atlas when they meet measured density.
  Module/formation targets route to the versioned UDIM/virtual-texture policy;
  actual formation tiles are a C9 deliverable.

## Production proof

The fixed proof is a 2.0 × 1.4 × 1.2 m granodiorite boulder at a 0.66 m minimum
view distance. The scale policy requested and received a 2048² atlas.

| Measurement | Result |
| --- | ---: |
| Dense / render triangles | 19,500 / 12,820 |
| Fallback triangles | 8,412 / 5,460 / 3,248 |
| Collision triangles | 1,868 |
| Topology/self-intersection failures | 0 / 0 across all six roles |
| Render-to-dense Hausdorff | 12.14 mm, 20 mm limit |
| Render silhouette error | 1 px, 3 px limit |
| Atlas occupied texels | 1,890,395 |
| High-source hits | 1,890,395 / 1,890,395 |
| UV/projection conflicts or flips | 0 / 0 |
| Achieved / required density | 460.98 / 246 px/m |
| Qualified mip chain | levels 0–4, 32-texel base gutter |
| Repeated bundle SHA-256 | identical |

The full machine report is
`artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler/automated-results.json`.

## Boundary to later checkpoints

C8 must prove the compiler across the eight basis families and required seed
population. C9 owns coherent cliffs, spires, stacks, modules, and mountains.
C11 owns reversible stylization. C12 owns GLB export and actual Unreal 5.8
normal/tangent/material/collision import tests. Nothing in C7 changes those gates.

The hoodoo adapter calibration produced a 2K signed residual with zero clipped
texels and a 0.0503% projection-miss fraction using a ±8 mm encoding. That is
pilot evidence for the adapter, not a retroactive completion of C8–C12.
