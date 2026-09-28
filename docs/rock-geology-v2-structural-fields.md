# Rock Geology v2 — structural field design

> **Checkpoint:** 4 approved on 2026-08-16  
> **Boundary:** repository-only experimental compiler code; no public package export  
> **Units:** metres and SI material properties

## Decision

Compile the frozen `RockRecipe` structure-stage inputs into an immutable,
content-addressed `StructuralFieldProgram`, then evaluate that program entirely
from global world coordinates. The program is disposable cache data; the recipe
remains authoritative.

This implements a compact asset-generation analogue of time-aware implicit
geological modelling. It is informed by the published LoopStructural and GemPy
method descriptions, but no code, interpolation engine, or inversion stack was
copied. It is not an observational geology solver and must not be described as
one.

## Coordinate and orientation contract

- World axes are `+X` east, `+Y` up, and `+Z` north.
- Azimuth is clockwise from north.
- Strike/dip uses the right-hand rule: dip direction is strike + 90 degrees.
- A frame stores orthonormal strike, down-dip, and normal vectors plus a global
  metre origin.
- Chunk/module and LOD evaluators receive world points; no chunk-local seed,
  origin, or resolution enters the structural field.
- Orientation values that violate the right-hand rule by more than 0.5 degrees
  are rejected instead of silently rotated.

This is why independently created evaluators produce exact equality on the
6,724 sampled points of adjacent 200 m chunk boundaries and on 5,324 shared LOD
points.

## Program contents

The compiler records:

- finite rounded formation bounds;
- a primary formation frame and sedimentary/metamorphic fabric frame;
- deterministic non-periodic unit thicknesses and contact roughness;
- finite Gaussian fold warps;
- finite fault frames, offsets, slip vectors, affected event identifiers, and
  compact-support displacement profiles;
- erosional unconformity surface and independently oriented younger package;
- bounded vein, dyke, and sill sheets plus explicit termination surfaces;
- chronology operations sorted by event order;
- base physical material values and deterministic unit-level variations.

The program and source recipe each carry a SHA-256 content identity. The field
constructor rejects mutated or version-mismatched programs.

## Field evaluation

### Layers and contacts

Sedimentary and metamorphic stacks are finite volumes. Layer thickness samples
are deterministic, bounded by the recipe's minimum/mean/maximum distribution,
and indexed in both directions from the formation origin. Contacts receive
multi-octave aperiodic lattice roughness in the global fabric frame. Massive
igneous units remain a single domain; flow-banded igneous units receive a finite
band stack.

The 5 km periodicity fixture contains 29 finite layers, no repeated four- through
eight-layer thickness window, no exact sampled spatial period, and a strongest
long-lag correlation of -0.566 at 1,765 m (below the absolute 0.72 gate).

### Folds

A fold is a localized cosine-Gaussian displacement of the pre-deformation
stratigraphic coordinate. Its amplitude and half-width are finite, so it does not
tile the world. The analytic shale fixture produces a 69.66-degree difference
between opposed limb normals.

### Faults and chronology

When an older field is sampled, later faults are restored newest-first. A fault
only restores event identifiers connected by an explicit `offsets` relationship.
Displacement is limited by compact support along finite fault length and height;
outside support it is exactly zero. The analytic center-offset fixture restores
50.608307151 m with less than 1e-9 m error.

Chronology also controls intrusive cross-cutting. A younger fault restores an
older dyke, while a declared `terminates-at` relationship clips a sheet at its
contact. An unconformity chooses the older package below its erosional surface
and the independently oriented younger package above, so older contacts terminate
rather than passing decoratively through it. A combined fixture also restores an
erosion surface when a later explicit fault offsets it.

### Material and fabric fields

Every sample returns hardness, porosity, permeability, cementation, and derived
weathering susceptibility. Unit variation stays within physical schema ranges.
The evaluator also returns one class-specific fabric record:

- sedimentary: unit/contact distance and bedding phase;
- metamorphic: foliation phase, contact distance, and lineation coordinate;
- igneous: massive-domain noise or flow-band phase.

All 65 ontology lithologies compile and pass 27 three-dimensional sample probes,
range checks, and independent-repeat determinism. The coverage is 22 igneous,
26 sedimentary, and 17 metamorphic families.

## C4 authoring correction

The structural compiler audit found that the C2 hero helper declared folded
fabric for shale and banded iron formation without an explicit deformation node,
and mapped mylonite `faulting` to a generic weathering event. The helper now:

- inserts an ordered deformation event for folded hero fabrics;
- maps `faulting` to deformation;
- emits an explicit `offsets` edge from the affected formation.

This is a schema-compatible authoring correction, not a silent compiler repair.
The complete C2 1,034-check contract suite was rerun and remains approved with
updated content hashes.

## Deliberate limitations

- C4 validates internal geological structure, not a final rock silhouette.
- Finite fracture networks and block extraction begin at C5.
- Weathering, erosion mass balance, detachment, stability, and transport begin
  at C6; C4 only produces the material susceptibility inputs they require.
- Dense source meshing and surface bakes are later checkpoints.
- The C4 neutral-clay images are structural block diagrams, not realistic rocks
  and not evidence of Megascans parity.
- Schema v1 provides one primary host contact frame. Multi-contact observational
  interpolation and arbitrary user-picked termination surfaces require a future,
  reviewed schema extension rather than an undeclared stage input.

## Reproduction

```sh
node scripts/verify-rock-geology-v2-contract.mjs
node scripts/verify-rock-geology-v2-structure.mjs
node scripts/capture-rock-geology-v2-structure.mjs \
  artifacts/research/rock-geology-v2/checkpoint-04-structural-fields
```

The developer approved C4 on 2026-08-16 and authorized C5. C5 must consume this
frozen version-1 program rather than silently changing its coordinates or
chronology semantics.
