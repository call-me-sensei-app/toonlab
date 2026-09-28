# Rock Geology v2 — Checkpoint 3 Mesher Selection Record

> **Decision status:** approved and frozen 2026-08-16  
> **Candidate:** ToonLab Manifold Dual Contouring  
> **Scope:** repository-only offline geology-v2 compiler experiment; no public package export

## Decision

Select the ToonLab-owned Manifold Dual Contouring implementation as the
production candidate for the geology-v2 offline compiler. Keep the pinned Vega
MC33 v5.5 implementation as an external correctness reference, not a bundled
dependency. Retain the current QEF Surface Nets extractor only as a frozen
failure baseline.

The developer approved this decision and authorized Checkpoint 4 with: “Ok.
Then go ahead and continue with checkpoint 4.” It does not claim that the current rock fields are
geologically realistic, bake-ready, or Megascans-equivalent.

## Why this candidate

All nine adversarial fields pass the same boundary, manifold-edge,
vertex-fan, winding, degenerate, duplicate, self-intersection, sliver, component,
and symmetric sampled-Hausdorff audits. The candidate also passes:

- topology-safe adaptive simplification on all nine fixtures;
- an independently extracted 64-chunk seam proof with zero missing triangles,
  zero extra triangles, and zero IEEE-754 vertex-bit mismatches;
- a 16-family × 32-seed matrix at resolution 24: 512 meshes, 1,026,816
  triangles, and zero topology failures;
- 36 adversarial and 64 existing-family resolution-sweep meshes at resolutions
  16, 24, 32, and 40, with zero topology failures;
- repeated content-hash determinism checks; and
- a render-only crease-normal split that leaves the indexed topology source
  bit-identical.

MC33 is the stronger trilinear surface-fitting reference in this bake-off. Its
mean worst-case sampled Hausdorff error is 0.0465 cells versus 0.1680 cells for
the ToonLab MDC candidate, and it runs about twice as fast on the nine small
fixtures. MDC is selected because ToonLab needs owned QEF feature placement,
multiple vertices per cell, topology-qualified adaptive clustering, and a
deterministic chunk/seam contract for fractured and sharp geological forms.
The scalar-fidelity cost is explicit and must remain measured at later bake and
silhouette gates.

## Implemented contract

### Shared input

- Float64 scalar samples on one cubic world-space lattice.
- Negative values mean inside.
- All candidates receive identical coordinates and values.
- Exact zero samples use one deterministic symbolic outside epsilon.

### Uniform MDC

- Each active cube face is resolved with a shared asymptotic-decider determinant
  and deterministic tie rule.
- Boundary connections are assembled into closed cycles; every cycle receives
  its own QEF vertex, so one cell may contain multiple surface components.
- Hermite intersections and normals are accumulated in a fixed order and solved
  with a deterministic symmetric eigensolver and bounded pseudoinverse.
- Constrained fallback mass points are clamped to a scale-relative symbolic cell
  inset to prevent coincident dual vertices and zero-area faces.
- Rare parallel abstract dual edges are represented as distinct paths through
  deterministic face-contour split vertices. Split polygons triangulate from a
  split vertex so triangulation cannot recreate the collapsed endpoint chord.

### Adaptive MDC

The bottom-up collapse criterion follows the sufficient test described by
Schaefer, Ju, and Warren: `Euler(Sv) = 1` and every parent-cell face has either
zero or two intersections. QEF error is a separate geometry rejection. Synthetic
parallel-edge split vertices are never clustered because they carry an indexed-
mesh topology distinction.

The paper explicitly notes that Manifold Dual Contouring can still
self-intersect. Therefore self-intersection auditing remains a hard gate for
every generated mesh; the method name is not treated as a proof by itself.

### Chunks and seams

Chunks are independently extracted with a two-cell halo. The chunk containing a
quad's anchor cell owns it. Component keys weld the emitted result. The proof
compares both the triangle-key multiset and IEEE-754 vertex bits against
monolithic extraction; visual seam inspection is supplemental only.

### Normals

The indexed source mesh remains the topology authority. A render-only derivative
duplicates vertices across dihedral crease clusters and emits unit-length
area-weighted normals. Normal splitting cannot modify source indices or positions.

## Bake-off summary

| Candidate | 9-fixture extraction | Mean worst Hausdorff | Topology failures | Role |
| --- | ---: | ---: | ---: | --- |
| Existing QEF Surface Nets | 34.8 ms | 0.1578 cells | 59 | rejected baseline |
| Vega MC33 v5.5 | 72.1 ms | 0.0465 cells | 0 | external correctness reference |
| ToonLab Manifold Dual Contouring | 144.2 ms | 0.1680 cells | 0 | selected production candidate |

Timing covers extraction only on the recorded Apple M4 Pro environment; audit
time is excluded. These small fixtures are not production throughput budgets.

## Sliver policy at this checkpoint

The audit reports triangles below 0.5 degrees; it does not silently discard them.
The 512-mesh matrix contains 365 warnings out of 1,026,816 triangles (0.03555%).
The aggregate C3 warning budget is 0.1%, and the per-family concentration budget
is 0.2%; the worst family is 0.1061%. Degenerate and zero-area triangles remain a
hard zero-tolerance failure and are zero.

This is a mesher-selection budget, not a final render-mesh waiver. Checkpoint 7
must either eliminate these warnings during controlled remeshing or qualify the
result against UV, bake-cage, tangent, and close-view error limits.

## License and provenance

- ToonLab MDC code is a clean repository implementation from the method
  description in Schaefer, Ju, and Warren, [Manifold Dual
  Contouring](https://doi.org/10.1109/TVCG.2007.1012). No paper implementation
  source was copied.
- The corrected-MC33 reference is `dvega68/MC33_c_header-only` v5.5 at commit
  `eef8f8f4d70527af74b988869e34f887ef9ed7ba`, MIT licensed. Its header remains
  outside ToonLab; the repository contains only an input/output adapter.
- The 2019 corrected MC33 reference is Vega et al., [Marching Cubes 33: Edge
  Cases, Ambiguities and Practical
  Implementation](https://jcgt.org/published/0008/03/01/).
- `Lin20/isosurface` was reviewed only as a methodology cross-check and rejected
  as a dependency because its own documentation says the implementations are not
  fully paper-compliant.

## Known limits carried forward

- The evidence qualifies topology and mesher behavior, not geological process
  fields. Structure, fractures, erosion, stability, sediment transport, and the
  full rock-family catalog begin at later checkpoints.
- Current performance and determinism evidence is from one macOS/arm64 platform.
- MC33 has materially better trilinear fitting in this bake-off; MDC's QEF feature
  advantage must be re-earned at later silhouette and bake comparisons.
- Every new family, field operator, resolution tier, chunk policy, and adaptive
  threshold must rerun the same topology audits. The selected algorithm is not a
  blanket exemption.
- The neutral-clay captures expose meshing behavior only. They do not constitute
  a visual realism approval.

## Approval consequence

Approval freezes this mesher contract for Checkpoint 4. Changes to sign policy,
face deciders, QEF solve order, parallel-edge representation, triangulation,
chunk ownership, or adaptive criteria must invalidate downstream geometry caches
and rerun Checkpoint 3 evidence.
