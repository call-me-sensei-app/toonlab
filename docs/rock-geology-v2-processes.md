# Rock Geology v2 — process, stability, and transport stage

> **Checkpoint:** 6 approved on 2026-08-16<br>
> **Schema:** `toonlab/rock-process-field-program` v1 and
> `toonlab/rock-process-stage-output` v1<br>
> **Boundary:** repository-only experiment; no public package export

## Decision

Checkpoint 6 turns the approved C4 structural field and exact matching C5 finite
fracture/block output into a deterministic, erosion-only process field. The stage
models causal visual relationships, not predictive geomorphology or continuum
rock mechanics. It is intended to provide a sound macro/meso source for the C7
high-to-low bake, not a finished Megascans-equivalent asset by itself.

The compiler rejects a C4 or C5 dependency compiled from any other canonical
recipe. Its program and output are content-addressed. Negative signed distance is
retained rock; geological time may remove or detach material but may never add it
back or grow beyond the approved parent formation.

## Compiled inputs and environmental fields

`compileProcessFieldProgram` consumes only versioned recipe values already frozen
by C2: physical dimensions, lithology, landform, environment, material properties,
process list, exposure time, moisture, salt, thermal and freeze-thaw cycles, water
routing, transport distance, source lineage, and the weathering/transport seeds.
Kernel constants are compiler-version policy rather than hidden recipe inputs.

The evaluator composes these bounded formation-space fields:

- surface, corner, top, and wind exposure;
- deterministic non-periodic drainage channels and runoff;
- moisture and salt availability;
- finite-fracture proximity and infiltration;
- temperature-cycle and freeze-thaw intensity;
- hardness, porosity, permeability, cementation, and declared weathering
  susceptibility;
- fabric/contact weakness inherited from C4;
- normalized exposure time.

Infiltration increases with moisture, permeability, porosity, and finite-fracture
proximity. Bond weakening increases with infiltration and lower hardness or
cementation. Differential erosion therefore changes when material or fabric
changes; the noise terms only vary bounded spatial expression and cannot select a
process or override the declared geology.

## Process kernels

Kernels execute in recipe order. A later kernel receives accumulated prior
damage, which makes chronology materially observable and is why the combined-order
fixture must not hash or sample identically when reordered.

| Kernel | Causal visual rule in v1 | Deliberate limit |
| --- | --- | --- |
| Spheroidal | Exposure and corner-biased recession rounds jointed blocks | No chemical mineral solver |
| Exfoliation | Top/exposure-biased shell recession under pressure release | No stress tensor/FEM |
| Freeze-thaw | Moisture and cycle intensity widen finite C5 fractures | No transient pore-pressure solve |
| Thermal/salt | Thermal exposure and salt/moisture drive granular recession | No crystal-growth mechanics |
| Tafoni | Salt/moisture-conditioned, surface-breaching bounded cavities | Macro cavities only before C7 |
| Karst | Runoff, moisture, infiltration, and soluble-rock weakness drive rills/solution cavities | No groundwater conduit simulation |
| Marine | Sea-level band abrasion and undercut on exposed faces | One compiler sea-level prior |
| Fluvial | Runoff-driven rounding plus bounded top-surface potholes | No CFD or sediment-flow solve |
| Aeolian | Wind-exposure recession and bounded face fluting/deflation | No particle trajectory solver |
| Glacial | Directional abrasion/plucking with a subdued striation signal | Striations are intentionally below repeated-band scale |

A seed-varied superellipsoid intersection gives the process stage a recognizable
erosional silhouette while retaining landform class: spheroidal/corestone forms
may round strongly, freeze-thaw remains more blocky, and attached cliffs/walls
remain angular. This intersection is always erosion-only. It is not a substitute
for C8 family-specific form authoring or C9 formation-scale landform synthesis.

## Stability, detachment, and mass accounting

The C5 support graph supplies potential block contacts. C6 reduces each contact by
the retained fractions of both blocks and local bond strength. It then performs a
deterministic reachability solve from ground-contact blocks. A retained block with
no viable path to ground is detached and transferred to the transport inventory;
it is never silently deleted.

The stage classifies every active C5 cell exactly once as retained, directly
eroded, or detached. Their counts and physical cell volumes must sum to the parent
with zero cell residual. This is exact for the approved C5 sampled grid, not a
claim of continuous-volume convergence. The reachability model is an explicit
asset-generation approximation, not a factor-of-safety calculation, FEM, or a
replacement for engineering geotechnical analysis.

## Transport and source lineage

Detached blocks become transport pieces with immutable source block, formation,
lithology, and fabric IDs. Transport distance, medium, hardness, and source shape
control abrasion loss and increased roundness. Deterministic size rank controls
runout, cross-slope placement, burial, and imbrication. Deposited pieces must have
ground support and non-negative support height.

The talus fixture is deliberately partitioned by three spanning finite joint
families. It currently produces nine detached pieces from a 111-block quartzite
source, nine sorting ranks, and four imbrication angles. Input volume equals
deposited volume plus abrasion loss within floating-point tolerance.

## Verification and visual evidence

The definitive C6 audit runs 1,240 checks:

- 65/65 catalog families and 1,040 fixed-seed family programs;
- ten isolated causal kernels and ten selected-mesher clay pairs;
- monotonic time sampling and order-sensitive combined kernels;
- material and fabric controls;
- exact cell mass accounting and zero floating components after stability;
- independent raw-versus-stable field sampling: all 203 detached fixture cells
  removed and all 82,612 retained fixture cells unchanged;
- topology audit of every causal mesh;
- source-preserving transport plus multi-piece talus sorting and imbrication;
- repeated content-hash determinism.

The capture bundle contains 173 hashed PNGs: all 65 family before/after pairs,
ten causal before/after pairs, a five-time sequence, drainage, stability, mass,
source-to-talus diagnostics, and a metric-selected eight-family outlier board.
Every pair reuses its camera, bounds, neutral material, and light; only normalized
geological time changes.

## Research adaptation boundary

The stage independently adapts bounded implicit-feature concepts from the pinned
Paris terrain work and the infiltration/bond/detachment decomposition described
in the pinned Mateos thesis implementation. The latter's documented incomplete
stability implementation was not adopted as sufficient; ToonLab uses its own C5
support-graph reachability and exact cell accounting. No external source code,
mesh, scan, texture, or media was copied into this implementation.

## Non-claims and next decision

C6 does not establish final microdetail, texture/material realism, production UVs,
bake fidelity, collision/LOD quality, Unreal import, formation-scale mountains, or
Megascans parity. The family sheets prove that all catalog recipes compile through
the same causal stage; many still look intentionally similar in neutral clay
because family-specific mesostructure and surface identity are C8–C10 work.

Approval freezes the two C6 schema/version contracts and allows C7 to bake these
process-generated sources. Rejection must identify a causal kernel, family/seed,
stability/transport case, topology result, or visible process artifact; C7 remains
blocked until C6 is approved.
