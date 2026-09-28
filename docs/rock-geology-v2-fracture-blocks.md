# Rock Geology v2 — finite fractures and implicit blocks

> **Checkpoint:** 5 approved on 2026-08-16  
> **Boundary:** repository-only experimental compiler code; no public package export  
> **Units:** metres; world axes and chronology are inherited unchanged from approved C4

## Decision

Compile the frozen recipe fracture history and approved `StructuralFieldProgram`
into deterministic finite discontinuity panels, then partition the sampled parent
formation by cell connectivity across those panels. Store the resulting blocks as
content-addressed run-length cell sets with adjacency, support, material, and fabric
records.

This is a ToonLab-owned implementation informed by the registered DFN and implicit-
block literature. No dfnWorks or Paris implementation code was copied. The result
is an asset-generation structure model, not an observational fracture inversion,
flow simulation, or geomechanical stability solver.

## Fracture-network contract

- Each recipe set defines strike, dip, concentration, spacing, finite panel size,
  persistence, aperture, roughness, chronology event, and stable identifier.
- Orientation uses an exact inverse-CDF sample of the 3D von Mises–Fisher polar
  law. Plane normals are axial, so antipodal normals represent the same plane.
- Uniform, bounded lognormal, and bounded power-law sizes remain inside declared
  minima and maxima. The bounded power-law exponent is solved deterministically
  from the declared mean.
- Set spacing is evaluated along the authored mean normal. Bounded positional
  jitter prevents a mechanically perfect lattice without changing the set mean.
- Panels are finite rough ellipses. Roughness is deterministic multi-octave noise
  in panel coordinates; it is not an infinite world-space cutting plane.
- Fracture AABBs conservatively include possible younger-fault displacement. A
  deterministic flat BVH accelerates field, intersection, and block-face queries.
- Version 1 supports at most 512 panels per set. A denser request fails with
  `FRACTURE_SET_CAPACITY_EXCEEDED`; spacing is never silently changed.

The network compiler consumes only C2-authorized fracture-history fields, the
fracture seed namespace, and the approved C4 structural dependency. It does not
introduce a hidden authoring control.

## Chronology and structural interaction

- Later explicit faults are restored before an older panel is evaluated. The
  fault fixture restores 17.993417447 m, exactly matching the authored offset.
- A `deflects-along` relationship rotates a sampled panel 65% toward the evaluated
  local C4 fabric while retaining 35% of its authored discontinuity orientation.
  The fixture reduces mean fabric disagreement from 34.010725492° to 11.61781353°.
- An old panel terminated by a younger fracture set retains the side containing
  its center and is clipped on the opposite side wherever the younger finite panel
  has support. The hierarchy fixture retains 23 and rejects 61 interior samples,
  with 20 finite terminating intersections.
- Pre-erosion joints are rejected above their unconformity but retained below it:
  142/142 upper crossings reject and 109/109 lower crossings remain.
- Network intersection segments are clipped to both finite panels and the rounded
  parent formation. All analytic fixture endpoints remain inside the C4 envelope.

## Implicit block extraction

The version-1 compiler uses a fixed 28-cell longest-axis grid. This is compiler
version state, not a recipe parameter. Grid dimensions preserve target physical
aspect ratio.

1. C4 evaluates active parent cells in formation coordinates.
2. Every positive-axis neighboring-cell segment queries the fracture BVH and tests
   exact finite-panel intersection with chronology.
3. Unblocked neighbors join through deterministic union-find connectivity.
4. Connected components become blocks stored as run-length cell intervals.
5. Each block inherits material and fabric by evaluating C4 at its centroid.
6. Blocked faces create adjacency edges with area and fracture provenance.
7. Vertically relevant contacts create directed potential-support edges; bottom-
   band blocks are marked grounded.
8. Block AABBs receive a second flat BVH for point lookup.

The occupancy proof is exact for this sampled implicit partition: every active
cell belongs to exactly one component. It is not a continuous-volume or final-
surface convergence claim.

## Four analytic bases

The four approval fixtures intentionally use finite panels larger than their
24–36 m parent domains so the review isolates joint-set geometry. Their tips are
still finite outside the parent; separate fixtures visibly exercise tips and
chronological termination.

| Basis | Sets | Panels | Blocks | Contacts | Sampled occupancy |
| --- | ---: | ---: | ---: | ---: | ---: |
| Equidimensional | 3 | 12 | 125 | 346 | 21,952 / 21,952 |
| Rhombohedral | 3 | 19 | 149 | 579 | 21,952 / 21,952 |
| Polyhedral | 4 | 20 | 237 | 887 | 20,384 / 20,384 |
| Tabular | 1 | 12 | 13 | 15 | 12,096 / 12,096 |

All four have zero gap cells, zero overlap cells, zero sampled-volume residual,
valid graph references, and complete material/fabric inheritance. The automated
blind classifier receives geometry and set orientations, never the fixture name,
and sorts all four correctly.

## Statistical and catalog verification

- 2,346 automated checks pass with zero failures.
- All 65 ontology lithologies are covered: 22 igneous, 26 sedimentary, and 17
  metamorphic.
- Each family runs 32 independent seed sets, for 2,080 family/seed sets total.
- Every individual seed set passes size support, aperture/roughness support,
  spacing, vMF mean confidence, and analytic vMF tail gates.
- Each family also runs a representative 14-cell block diagnostic for occupancy
  and inheritance. The four analytic bases run the fixed production C5 grid of 28.
- Three independent 16,384-sample distribution tests cover uniform, lognormal,
  and power-law laws.
- 384 BVH queries have zero fracture false negatives; sampled block point lookup
  has zero mismatches.
- Repeated full basis compiles have identical content hashes.

## Research adaptation boundary

- LANL dfnWorks/DFNGen, pinned in the C1 source register at
  `ad811c027dd725083f9ab3bd81145e584efba7d2`, supplies statistical concepts only:
  finite families, vMF orientation, truncated sizes, persistence, aperture, and
  accepted/rejected statistics. Its LGPL code, flow, transport, and meshing stack
  are not dependencies and were not copied.
- Paris et al. “Modeling Rocky Scenery Using Implicit Blocks,” source revision
  `b91965b3011ed269cbc3a051b00c9b284aaa2e36`, informs the four block categories,
  fracture-constrained components, and spatial concepts. ToonLab does not copy its
  implementation, constants, replication scheme, or treat its visual assembly as
  stability proof.
- Approved C4 supplies the actual formation coordinates, fabric, faults,
  unconformities, materials, and chronology. C5 does not replace or silently
  reinterpret that frozen dependency.

## Deliberate limitations

- C5 creates discontinuities and block topology, not a realistic rock surface.
- Aperture is currently a separating surface; C6 owns material loss, open cracks,
  detachment, weathering, and mass accounting.
- The support graph describes possible support through contacts. Stability and
  removal of unsupported blocks are C6 gates.
- The 28-cell block grid is sufficient for this structural checkpoint, not a final
  bake resolution. Later source meshing must converge against the selected C3
  mesher and C7 bake requirements.
- Family heroes use the C2 default authored set count. C5 proves every family can
  compile and partition correctly; family-specific multi-set visual qualification
  belongs to C8–C10.
- Statistics are controlled generative priors, not site-calibrated field surveys.
- C5 is not evidence of a finished spire, cliff, boulder, mountain, Unreal asset,
  or Megascans-quality parity.

## Reproduction

```sh
node scripts/verify-rock-geology-v2-contract.mjs
node scripts/verify-rock-geology-v2-structure.mjs
node scripts/verify-rock-geology-v2-fractures.mjs
node scripts/capture-rock-geology-v2-fractures.mjs \
  artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks
node scripts/finalize-rock-geology-v2-fracture-evidence.mjs
```

C5 was approved on 2026-08-16. C6 must consume the frozen version-1 fracture and
block programs rather than silently changing their statistics, chronology,
connectivity, or coordinate semantics.
