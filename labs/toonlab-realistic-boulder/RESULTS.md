# ToonLab High-to-Low Rock Compiler — Qualification Results

> Repository-only result. No public package support is claimed.

Date: 2026-08-16

## Outcome

The ToonLab-owned high-to-low compiler is implemented and the methodology
generalizes across the current Rockgen preset set. Generalization does not mean
that every family is production-ready: structural and unwrap gates correctly
block several existing meshes.

The compiler now owns:

- ToonLab QEF surface-nets handoff;
- deterministic six-chart UV atlas generation for convex/near-convex assets;
- detailed-surface tracing;
- object-space normal, signed height, AO, signed curvature, semantic-region,
  and coverage pages;
- PNG + JSON artifact output with content hashes and provenance;
- family gates, bake gates, deterministic verification, and visual evidence;
- realistic and restrained stylized material interpretations of the same bake.

The tuned `jointed-granite-boulder-v1` seeds 11, 29, and 53 pass at 10–12k
triangles with 1024² bakes, 100% detailed-surface hit rate, zero atlas
projection conflicts, one closed component, and no non-manifold edges. Seed 47
was rejected at the same mesh resolution because it produced two non-manifold
edges; this is the intended seed-rejection behavior.

The result is a credible procedural game rock and a substantial improvement
over the unbaked mesh. It is not yet scan parity: the palette remains procedural
and close inspection is softer and less materially varied than a high-quality
photogrammetry asset.

## Every-family matrix

All 16 families were compiled for three seeds at the structural qualification
resolution, then seed 11 was compiled at 384² and captured in before/after,
close, and stylized views. The test therefore includes 48 deterministic family
bakes and 48 fresh rendered plates.

The three-seed structural result was:

- Fully accepted at that test resolution: Boulder, River Boulder, Karst Spire,
  and Shard Monolith.
- Accepted for some seeds/resolutions: Jointed Granite Boulder, Sea Stack,
  Low-Poly Boulder, and Mossy Boulder.
- Blocked for all three structural seeds: Granite Block, Basalt Columns, Cliff
  Wall, Eroded Mesa, Canyon Ridge, Column Arch, Cliff Face, and Scree Cluster.

Most blocked families contain a small number of genuine non-manifold edges from
ambiguous surface-nets cells. Eroded Mesa, Canyon Ridge, and Column Arch also
exceed the six-chart projection-overlap limit. These are compiler input/unwrap
failures, not evidence that high-to-low baking is inappropriate for those rock
types.

## Sandstone answer

Sandstone uses the same compiler successfully: the detailed profile adds
bedding seams and granular relief, and the packed pages render as expected.
The current Cliff Wall, Eroded Mesa, and Canyon Ridge assets are not yet
qualified because of low-mesh non-manifold edges; the larger two also need a
real chart unwrap. The geology method is proven, while the current asset path
still has named engineering blockers.

## Required next work

1. Resolve ambiguous QEF/surface-nets cells or add a conservative topology
   repair step with volume and boundary preservation tests.
2. Replace the six-chart atlas with a chart unwrap for concave, arched, and
   multi-surface formations.
3. Tune dedicated production profiles for sandstone, limestone, basalt,
   river stone, and metamorphic rock against real geological references.
4. Add LOD bake inheritance and a compact binary artifact before considering
   a public Rockgen export.

Evidence:

- `artifacts/research/toonlab-realistic-boulder/captures/`
- `artifacts/research/toonlab-rock-family-matrix/captures/`
- `artifacts/research/toonlab-rock-family-matrix/qualification.json`

