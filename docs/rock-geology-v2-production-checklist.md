# Rock Geology v2 — production checklist and approval gates

> **Status:** repository-only plan; Checkpoints 0–7 authorized; C8 references complete and one provider-assisted hoodoo process candidate awaits visual approval  
> **Date locked:** 2026-08-16  
> **Target:** ToonLab-owned deterministic offline rock/bedrock compiler, followed by a separate reversible ToonLab stylization stage  
> **Engine qualification target:** Unreal Engine 5.8 plus ToonLab's supported Three.js WebGPU/WebGL2 paths

This is the execution contract for replacing the current noise-led rock experiment
with a geology-led asset compiler. No later checkpoint may be called complete
until its automated gates pass, its evidence bundle is present, its known limits
are written down, and the developer has reviewed the checkpoint.

The goal is not to copy Megascans or to claim that synthetic geometry is a scan.
The goal is to make generated assets visually competitive with an appropriate
Megascans Raw/Nanite reference at the approved viewing distances, while providing
something a scan does not: deterministic recipes, continuous formation-scale
geology, controlled variation, and reversible stylization.

## 0. Non-negotiable product contract

- [x] Keep the implementation ToonLab-owned and offline-capable.
- [x] Adapt published methodology; do not import the whole `vibe3d` library.
- [x] Generate a physically and geologically plausible neutral source before
  applying any anime or painterly treatment.
- [x] Treat lithology, structural fabric, fracture history, weathering,
  environment, landform, and scale as separate inputs with compatibility rules.
- [x] Support individual props, outcrops, cliff modules, and coherent mountain
  formations. A mountain is not a boulder enlarged by 100x.
- [x] Treat user-entered physical dimensions as compiler inputs. Scaling outside
  a measured runtime envelope triggers deterministic recompile/rebake so joints,
  beds, grains, cavities, texel density, collision, and LOD error remain physical.
- [x] Make every random decision seedable and reproducible.
- [x] Keep generated outputs in the host asset pipeline; the npm package ships
  code and schemas, not a hidden library of baked assets.
- [x] Keep this work repository-only until its package, clean-consumer, visual,
  determinism, compatibility, and migration gates pass.
- [x] Preserve the current public `@call-me-sensei/toonlab/rockgen` contract
  unless a reviewed schema migration deliberately changes it.
- [ ] Do not describe an asset, family, or compiler as production-ready while
  any mandatory gate is red.

### What “Megascans/Unreal quality” means here

This phrase is an acceptance target, not marketing language. An accepted asset
must satisfy all of these independent bars:

1. **Geological read:** its large and medium forms are explained by the declared
   lithology, fabric, fracture sets, weathering, transport history, and landform.
2. **Silhouette:** it remains convincing without color or normal maps from all
   approved views, including the worst seed selected by the harness.
3. **Surface:** macro, meso, and micro detail occupy distinct frequency bands;
   the material does not use noisy color or normal detail to conceal weak shape.
4. **Technical integrity:** the source, render, fallback, collision, UV, bake,
   tangent, scale, pivot, bounds, and material contracts pass automated tests.
5. **Close inspection:** the approved production capture has no visible projection
   conflicts, seams, faceting accidents, texture swimming, mushy cavities, or
   unsupported overhangs at its declared minimum viewing distance.
6. **Scene use:** the asset survives repetition, rotation, burial, overlap,
   shadow, wetness, distance, and the qualified runtime scale envelope in a real
   composition. Larger or materially non-uniform resizing must be proven through
   the target-dimension compile path, not assumed safe on a fixed bake.
7. **Reference comparison:** in a normalized, provenance-safe A/B evaluation, the
   generated neutral asset is not rejected for silhouette, structure, or surface
   coherence against a scale- and lithology-matched Megascans reference.
8. **No false equivalence:** a result may be called “visually competitive at the
   qualified distance.” It may not be called a scan, scan-derived, or objectively
   equal to Megascans without a separately defined blinded evaluation supporting
   that statement.

Epic's current UE documentation is the external floor for engine readiness:
Nanite normally retains the original source triangles, the high-resolution
source can replace LOD0 for systems that benefit from it, and the fallback mesh
still matters for collision, ray tracing, light baking, and unsupported paths.
Fab exposes Megascans Low, Medium, High, and Raw quality tiers. ToonLab therefore
needs both a dense source and deliberately qualified fallback/collision outputs;
a pretty low-poly browser render is not enough.

## 1. Checkpoint evidence contract

Every checkpoint must create an immutable evidence folder at:

`artifacts/research/rock-geology-v2/checkpoint-NN-<slug>/`

The folder must contain all applicable items below. “N/A” requires a written
reason in `README.md`; silent omissions fail the checkpoint.

- [ ] `README.md`: objective, scope, result, exact limitations, and approval state.
- [ ] `manifest.json`: UTC timestamp, git commit/worktree status, platform,
  compiler version, schema version, seeds, settings, commands, output hashes,
  and links to every artifact.
- [ ] `automated-results.json`: pass/fail per gate, raw counts, thresholds, and
  failing asset/seed IDs. Do not reduce results to a single boolean.
- [ ] `commands.txt`: exact reproducible commands and environment assumptions.
- [ ] `changed-files.txt`: files owned by the checkpoint; unrelated dirty files
  are recorded but never overwritten or reverted.
- [ ] `known-issues.md`: every observed defect, suspected cause, deferral reason,
  affected family/seed, and owning future checkpoint.
- [ ] `captures/manifest.json`: camera transforms, projection, viewport, renderer,
  lighting rig, exposure, tone mapping, material mode, asset transform, readiness
  signals, stable-frame counts, triangle counts, and pixel occupancy.
- [ ] `captures/contact-sheet.png`: labeled like-for-like comparison.
- [ ] `captures/outliers.png`: worst results, not only hand-selected heroes.
- [ ] `captures/<family>-before-neutral.png`: current v1 baseline.
- [ ] `captures/<family>-v2-clay.png`: untextured v2 geometry.
- [ ] `captures/<family>-v2-realistic.png`: baked neutral v2 result.
- [ ] `captures/<family>-v2-stylized.png`: required only after the stylization
  checkpoint; never substitute it for the neutral result.
- [ ] `captures/<family>-reference.png` or a non-redistributable reference ID:
  same approximate scale, camera, and lighting. Licenses must permit the use.
- [ ] `approval.md`: `awaiting`, `approved`, `approved-with-recorded-debt`, or
  `rejected`, plus the developer's decision and date.

### Mandatory presentation at each approval stop

The checkpoint handoff must show, in this order:

1. the result in one sentence;
2. the contact sheet inline;
3. the worst-seed/outlier sheet inline;
4. the numeric gate table, including every failure;
5. the files changed and commands run;
6. known limitations and the next irreversible decision;
7. a request for approval before crossing that decision.

### Checkpoint isolation and rollback

- [ ] Record the starting commit, pre-existing dirty paths, and checkpoint-owned
  paths before making implementation changes.
- [ ] Keep checkpoint outputs append-only. An amended run receives a new run ID;
  it does not overwrite the evidence that caused a rejection.
- [ ] Do not use destructive worktree resets for rollback. Revert only the named
  checkpoint-owned edits with a reviewable patch while preserving unrelated work.
- [ ] A rejected checkpoint returns to its first failing stage. Later checkpoint
  work may not be used to patch over it.
- [ ] If a later discovery invalidates an approved gate, reopen that checkpoint,
  mark every dependent approval stale, and rerun them after the fix.
- [ ] Schema/artifact migrations retain fixtures for both forward migration and
  failure behavior; released recipe documents are never silently reinterpreted.

### Normalized visual comparison rubric

The generated asset and the reference are randomized left/right and judged at
matched approximate dimensions, camera, light, exposure, and output resolution.
Each category is scored from 0 (failed) to 4 (reference-level for the declared
viewing distance). A hero result requires no category below 3, a median of at
least 3.5, and no unexplained gap larger than 0.5 versus the reference. Technical
gates remain binary and cannot be offset by a high visual score.

| Category | What is judged |
| --- | --- |
| Geological identity | Lithology/fabric/landform read and absence of contradictory features |
| Macro silhouette | Proportion, mass, balance, overhang/support, and recognizability |
| Meso structure | Beds, blocks, joints, ledges, folds, cavities, and causal hierarchy |
| Micro surface | Grain/pore/chip/flake detail at the qualified close distance |
| Material response | Albedo variation, roughness, normals, wetness, and plausible scale |
| Bake/integration | Seams, projection errors, tangents, mips, shading, and contact |
| Variation/reuse | Seed diversity without category drift or recognizable duplication |
| Scene performance | Read through shadow, distance, LOD/fallback, repetition, and context |

The evidence records the raw per-view scores and comments. A later checkpoint
must lock the benchmark assets, exact minimum viewing distances, screen coverage,
triangle/error tiers, texture/texel-density tiers, and runtime budgets before
those values are used as release claims; they will be measured from matched
references rather than invented in this document.

### Capture matrix

Every hero family and every formation-scale target uses fixed cameras and a
neutral scale reference. Camera framing may expand for a different asset scale,
but its intent and lens must remain stable.

| View | Purpose | Mandatory modes |
| --- | --- | --- |
| Hero three-quarter | Primary visual read | v1, clay, realistic, stylized, reference |
| Reverse three-quarter | Exposes back-side cheating and seams | clay, realistic |
| Side silhouette | Tests shape without surface distraction | clay |
| Close surface | Tests bake, joints, pores, grains, and seams | realistic, stylized |
| Top-down | Detects radial/repeating fields and implausible plan shape | clay, realistic |
| Ground/contact | Tests pivot, burial edge, undercut, and contact shadow | realistic |
| Wide/context | Tests scale and ecological/terrain fit | realistic, stylized |
| Flyover | Required for outcrop/formation scale | clay, realistic |

Each matrix is repeated under neutral overcast, strong raking light, and the
approved Call Me Sensei world light. A family cannot pass from only its most
flattering light or camera.

### Physical-dimension and scaling contract

The methodology supports arbitrary requested rock dimensions by regenerating the
asset at those dimensions; it does not promise arbitrary transform scaling of one
fixed mesh and texture set. A fixed bake enlarged by 2x has half its original
linear texel density, while non-uniform scaling also distorts grains, beds, joints,
pores, cavities, normals, collision, and silhouette. The initial runtime envelope
is deliberately provisional and must be replaced by measured per-family limits.

- [ ] `targetDimensionsMetres` is authoritative and participates in the recipe,
  cache, bake, collision, LOD, bounds, and manifest hashes.
- [ ] Geometry-, fracture-, weathering-, and material-frequency parameters live in
  geology-space metres; target dimensions change the sampled domain, not a final
  object-space stretch.
- [ ] Initial runtime hypothesis: uniform 0.75x–1.5x and maximum/minimum axis-scale
  ratio no greater than 1.2. It is not a shipping promise until the scale matrix
  qualifies it per family, quality tier, renderer, and minimum viewing distance.
- [ ] Runtime transforms outside a qualified envelope emit an actionable warning
  and offer deterministic recompile/rebake at the requested dimensions.
- [ ] In ToonLab, drag-resize may use a temporary transform preview, but release or
  explicit confirmation debounces into regenerate + rebake at the final dimensions.
  Save/export waits for, or explicitly declines, that rebuild; it never presents a
  temporary stretched preview as the authoritative generated asset.
- [ ] Exported assets are static. Unreal, Three.js, and other host scenes do not
  silently invoke ToonLab rebaking; exported metadata records generated dimensions,
  achieved texel density, and the qualified transform envelope so external tools
  can warn, while a new size is authored in ToonLab or its offline compiler.
- [ ] A future host-editor plugin may watch committed scale changes and orchestrate
  the same standalone compiler. It is optional, asynchronous, content-addressed,
  editor-time by default, and failure-safe: the last valid imported asset remains
  active until the replacement compile, bake, validation, and import all succeed.
- [ ] Host plugins contain no forked geology or bake implementation; they submit a
  versioned recipe/target-dimension request, surface progress/errors, and atomically
  adopt the validated result so ToonLab and host editors cannot drift semantically.
- [ ] Formation-scale resizing changes the formation recipe/chunk graph. Mountains,
  cliffs, sea stacks, towers, and column fields may not use prop-scale transforms
  as a substitute for generating the correct geological extent.
- [ ] Every scale test records actual dimensions, scale mode, texels per metre,
  feature-size error, silhouette error, topology, collision error, and LOD error.

## 2. Stop-work rules and acceptable shortcuts

### Stop work immediately when

- [ ] A topology failure appears after a checkpoint that declared topology
  locked: zero non-manifold edges, unintended boundary edges, degenerate faces,
  non-finite attributes, inconsistent winding, or self-intersections is required.
- [ ] A result changes when regenerated with the same normalized recipe, seed,
  compiler version, and quality tier.
- [ ] A material or reference has missing provenance or incompatible licensing.
- [ ] A later stage hides an earlier-stage defect—for example, a normal map hides
  bad silhouette, stylization hides bake seams, or scene dressing hides a module
  boundary.
- [ ] A proposed geology combination violates the compatibility matrix and is
  silently accepted instead of rejected or explicitly labeled fantastical.
- [ ] A family passes only after an unrecorded manual mesh edit.
- [ ] The test harness produces different camera, lighting, timing, or readiness
  conditions for “before” and “after.”
- [ ] Unreal import reports errors, produces a materially different fallback,
  changes scale/orientation, or drops a required map.
- [ ] Performance is measured before scene readiness, shader compilation, and
  streaming settle.

### Shortcuts that are allowed when recorded

- [ ] Port the mathematical idea from MIT-licensed research into idiomatic
  ToonLab code instead of retaining research application structure.
- [ ] Use coarse grids, reduced bake resolution, and fewer seeds during an
  explicitly labeled draft iteration; rerun the full production matrix before
  approval.
- [ ] Put detail below the qualified on-screen geometric frequency into normal,
  height, roughness, and albedo channels; retain silhouette- and parallax-critical
  detail in geometry.
- [ ] Use procedural or licensed reference assets only as private benchmarks;
  do not make ToonLab output dependent on them.
- [ ] Prove a basis set before expanding all recipes, provided no basis result is
  described as coverage of the full family catalog.
- [ ] Run the offline compiler on CPU first. GPU acceleration is a performance
  optimization and cannot precede deterministic correctness.

### Shortcuts that are never allowed

- [ ] Rebrand undirected FBM/domain-warp noise as geology.
- [ ] Scale a prop recipe to make a cliff or mountain.
- [ ] Use one global sine field for every sedimentary bed or karst ledge.
- [ ] Use infinite planar cracks where the recipe declares finite joints.
- [ ] Ignore unstable or rejected seeds and show only hand-picked outputs.
- [ ] Repair a mesh after generation without recording the repair and validating
  that it preserves material regions and formation seams.
- [ ] Treat a successful build, a single screenshot, or a passing average as
  visual approval.
- [ ] Publish a deep `src/` import or repository lab as the public package API.

## 3. Architecture to prove

```text
RockRecipe
  = lithology
  + primary fabric
  + fracture history
  + weathering/environment
  + landform
  + scale/formation coordinates
        |
        v
Geology fields
  material + hardness + porosity + bedding/foliation + finite discontinuities
        |
        v
Block/stability model
  bounded blocks + support graph + detachment + transported/deposited fragments
        |
        v
Topology-safe mesher
  dense source + render mesh + fallback LODs + collision + seam contract
        |
        v
Offline surface bake
  base color + normal + roughness + AO + height + semantic masks
        |
        +--------------------+
        |                    |
        v                    v
Neutral realistic asset   Reversible ToonLab stylization
```

### Assembly modes

- [ ] **Coherent bedrock formation:** a shared continuous volume with one
  formation coordinate system; required for ridges, folded mountains, cliffs,
  fault scarps, canyon walls, and karst massifs.
- [ ] **Fractured outcrop modules:** approximately 10–200 m reusable slabs,
  wedges, pillars, ledges, and crowns cut from the coherent parent geology.
  Each carries `formationId` and `geologyTransform` so dip, strike, contacts,
  faults, and material phase remain continuous across modules.
- [ ] **Deposited/transported assembly:** talus, scree, rockfall, moraine, river,
  beach, and debris fields whose shapes and orientation derive from source rock,
  transport, size sorting, slope, and stability rather than simple scatter.

The steeply dipping mountain in the supplied video is a mandatory formation
target: large slab/wedge modules, common strike and dip, cross-joints that stop
at or interact with bedding, broken crowns, supported overhangs, and coherent
talus. It must read as one eroded bedrock system rather than a pile of repeated
rock props.

## 4. Technical acceptance gates

Thresholds below are release floors. A checkpoint may set a tighter family-
specific limit but may not relax one without developer approval and evidence.

### Determinism and schema

- [ ] Canonical recipe serialization has a version and explicit units.
- [x] Same recipe + seed + compiler version + quality tier produces identical
  content hashes on repeated runs on the supported platform.
- [ ] Every random stream has a named namespace so adding a detail stage does
  not reshuffle unrelated geology.
- [ ] Defaults are explicit, normalized, range-checked, and migration-tested.
- [ ] Unknown fields and incompatible combinations fail closed in strict mode.
- [ ] The manifest includes source-recipe hash and all derived asset hashes.

### Geometry and topology

- [x] 0 non-finite vertices, normals, tangents, UVs, colors, or indices.
- [x] 0 zero-area/degenerate triangles.
- [x] 0 non-manifold edges or vertices.
- [x] 0 unintended boundary edges; terrain/module cut faces are capped or carry
  an explicit, machine-checked seam contract.
- [x] 0 inconsistent face winding and 0 inverted closed components.
- [x] 0 self-intersections at the audit tolerance selected by asset scale.
- [x] Intended disconnected pieces are named components, not accidental islands.
- [x] No component falls below the configured physical/render size threshold.
- [x] Triangle aspect, minimum edge, and sliver distributions meet tier budgets.
- [x] Normals preserve intentional creases and remain stable across seam splits.
- [x] High/low/fallback meshes remain within the allowed Hausdorff and silhouette
  errors at the declared minimum viewing distance.

### UV and bake

- [x] 0 unintended overlapping UV charts and 0 flipped charts.
- [x] Every rendered triangle has finite UV coverage and adequate padding at all
  generated mip levels.
- [x] Covered-texel high-surface hit rate is 100%; misses fail rather than receive
  a plausible filler color.
- [x] Unintended multi-surface projection conflicts are 0; intentional stacked
  surfaces use disambiguated charts/cages and are reported separately.
- [x] Tangent basis and +Y normal convention match the declared glTF/Unreal
  tangent-frame contract. Actual GLB/Unreal round-trip import remains a C12 gate.
- [x] Linear/sRGB flags are correct per channel.
- [x] Source bake retains high-precision intermediates; platform compression is
  a separate, measured export stage.
- [x] Required neutral outputs: base color, tangent-space normal, roughness, AO,
  height/displacement, cavity/curvature, and semantic geology masks.
- [x] No lighting, cast shadow, or AO is painted irreversibly into base color.
- [x] Texel density is selected from asset dimensions and minimum view distance,
  not a single arbitrary texture size.
- [x] Dilation, mips, anisotropic viewing, and UV seams pass the close-view test.

### Asset/runtime contract

- [ ] Units are meters in ToonLab; Unreal import is exactly 100 cm per meter.
- [ ] `targetDimensionsMetres` is preserved exactly through compile, export, and
  Unreal import; runtime scale eligibility is explicit asset metadata.
- [ ] ToonLab resize preview, resize commit/rebuild, save-during-rebuild, cancel,
  undo/redo, cache reuse, and export-during-rebuild have deterministic tests.
- [ ] Optional host-editor auto-rebake integrations are capability-negotiated and
  never implied by a plain exported GLB/static mesh; cooked/runtime builds do not
  require or silently launch the offline compiler.
- [ ] Up/forward axes, handedness, transforms, pivot, bounds, and ground contact
  are round-trip tested.
- [x] Dense source, render mesh, fallback mesh/LODs, and collision source are
  separately named and compiler-qualified. Nanite/simple-vs-complex UE policy
  remains a C12 gate.
- [ ] Material slots and semantic masks have stable IDs.
- [ ] glTF/GLB export and Unreal import preserve normals, tangents, UVs, material
  roles, dimensions, and hierarchy.
- [ ] Browser runtime never compiles production high-resolution geology during a
  frame; generation is an offline bake operation.
- [ ] Non-Nanite/WebGL2 fallback is visually and operationally valid.
- [ ] Repeated modules support instancing without exposing identical visible
  silhouette, crop, seam, or material phase.
- [ ] Direct transform scaling outside the qualified uniform/axis-ratio envelope
  is rejected or routed to recompile/rebake; it never silently lowers texel density
  or stretches geology-space detail.

### Visual and geological validity

- [ ] An untextured clay review confirms macro and meso form before baking.
- [ ] Bedding, foliation, columns, joints, faults, and erosion each follow the
  recipe's coordinate system rather than world Y unless geology requires it.
- [ ] Discontinuities have finite extent, spacing, persistence, orientation
  distribution, termination/intersection behavior, and aperture.
- [ ] Differential erosion follows hardness, porosity, permeability, exposure,
  drainage, and environment fields.
- [ ] Detached blocks are supported before failure and accumulate plausibly
  after failure; floating or load-bearing-by-nothing blocks fail.
- [ ] Sedimentary ledges do not repeat with obviously periodic spacing.
- [ ] Columnar basalt is polygonal in plan, varies along the column, and supports
  colonnade/entablature transitions where declared; it is not a bundle of smooth
  cylinders.
- [ ] Karst solution features follow carbonate fabric, fractures, runoff, and
  exposure; horizontal lines occur only when bedding/solution history explains
  them.
- [ ] Sea stacks show a plausible parent coastline, joint control, marine notch,
  wave/salt exposure, and collapse history—not generic vertical noise.
- [ ] Large cliffs and mountains maintain geological continuity across module
  boundaries, scale changes, LODs, and material projection.

### Performance and storage

- [ ] Budgets are recorded per quality tier and asset scale before optimization.
- [ ] Compiler peak memory, wall time, output size, triangle count, chart count,
  and texture bytes are measured per asset.
- [ ] UE tests record Nanite triangles/clusters, fallback triangles, import/build
  time, disk size, resident texture behavior, draw calls/instances, frame time,
  shadow cost, and collision cost.
- [ ] ToonLab tests record WebGPU and TSL WebGL2 frame times after warm-up,
  drawable/triangle stability, memory where exposed, and shader/console errors.
- [ ] Optimization may not change geology statistics or cross a visual error gate.

## 5. Geological family catalog

“Every rock” is not a finite set: geology contains local facies, mixed units,
and transitional forms. Coverage is therefore defined as every named family
below, plus a versioned extension mechanism. Every row must have at least one
mandatory hero recipe, and every recipe must be tested across the seed and scale
matrix in section 7. Adding a name without distinct structure/material behavior
does not count as coverage.

### Intrusive and hypabyssal igneous

- [ ] Granite: massive, jointed block, tor, corestone, exfoliation dome, batholith cliff.
- [ ] Alkali granite/syenite: coarse crystalline, jointed, rounded weathering.
- [ ] Granodiorite/tonalite: massive to jointed, mixed grain contrast.
- [ ] Diorite: blocky jointed and granular weathering.
- [ ] Gabbro: massive dark crystalline, coarse block fracture.
- [ ] Dolerite/diabase: dyke, sill, blocky and locally columnar forms.
- [ ] Pegmatite: very coarse crystal domains and resistant veins/dykes.
- [ ] Peridotite/dunite: massive ultramafic with serpentinized fracture variants.
- [ ] Anorthosite: massive, coarse crystalline, glacially exposed variant.

### Extrusive and pyroclastic igneous

- [ ] Basalt: massive flow, columnar colonnade, entablature, platy flow top,
  vesicular/amygdaloidal, pillow basalt, sea-cliff and talus variants.
- [ ] Andesite: porphyritic blocky lava, volcanic spine, jointed cliff.
- [ ] Dacite: blocky dome, spine, flow-banded variant.
- [ ] Rhyolite: flow-banded, jointed dome, welded-looking coherent flow.
- [ ] Obsidian/pitchstone: glassy mass with conchoidal fracture and flow banding.
- [ ] Pumice: highly porous light clasts; intact and deposited variants.
- [ ] Scoria: vesicular clinker, cinder, agglutinated/spatter variant.
- [ ] Tuff: bedded ash, massive tuff, weathered tuff cliff and hoodoo.
- [ ] Ignimbrite/welded tuff: eutaxitic/flattened-clast fabric and columnar cliff.
- [ ] Volcanic breccia/agglomerate: angular to bomb-rich clast-supported mass.

### Siliciclastic sedimentary

- [ ] Conglomerate: rounded clast-supported and matrix-supported variants.
- [ ] Sedimentary breccia: angular clast-supported and matrix-supported variants.
- [ ] Quartz arenite sandstone: massive, thick bedded, thin bedded, cross-bedded,
  tafoni, arch, hoodoo, canyon wall, mesa/butte, and dipping-ridge variants.
- [ ] Arkose: feldspathic grain weathering and blocky/cross-bedded variants.
- [ ] Lithic arenite/greywacke: poorly sorted beds and resistant turbidite ledges.
- [ ] Siltstone: thin bedding, blocky/friable differential erosion.
- [ ] Mudstone/claystone: massive to laminated, gullied and slaking variants.
- [ ] Shale: fissile, laminated, slope-forming, folded, and faulted variants.

### Carbonate, chemical, siliceous, and organic sedimentary

- [ ] Limestone: micritic, oolitic, fossiliferous, reefal, thin bedded, massive,
  pavement, tower karst, pinnacle/spire, cave mouth, arch, and sea-stack variants.
- [ ] Dolostone: blocky, bedded, vuggy, and karst variants distinct from limestone.
- [ ] Chalk: soft massive/bedded white cliff, flint-bearing and sea-cliff variants.
- [ ] Marl: alternating competent/weak beds and slope/ledge morphology.
- [ ] Travertine/tufa: laminated, terraced, porous, cavity-rich precipitate forms.
- [ ] Chert/flint: nodules, beds, sharp conchoidal fragments, resistant ledges.
- [ ] Gypsum/anhydrite: bedded evaporite, dissolution and badlands variants.
- [ ] Halite/evaporite crust: crystalline/bedded/dissolution forms where appropriate.
- [ ] Ironstone/banded iron formation: resistant iron-rich beds and banded cliffs.
- [ ] Coal-bearing strata: coal seams within host sediment, never a generic black rock.

### Metamorphic

- [ ] Slate: planar cleavage chips, slabs, folded/faulted outcrop.
- [ ] Phyllite: wavy foliation, fine sheen, slabby fracture.
- [ ] Schist: mica/chlorite variants, strong foliation, crenulation, block/slab talus.
- [ ] Gneiss: compositional banding, folds, boudins, jointed massif.
- [ ] Migmatite: folded light/dark domains and irregular leucosome networks.
- [ ] Marble: massive crystalline, veined, solution-weathered cliff/boulder.
- [ ] Quartzite: massive resistant ledges, jointed blocks, talus and ridge.
- [ ] Amphibolite: massive to foliated dark resistant blocks.
- [ ] Granulite: massive/banded high-grade crystalline form.
- [ ] Hornfels: fine, hard, massive splintery contact-metamorphic form.
- [ ] Serpentinite: slickensided/sheared, blocky, oxidation and vein variants.
- [ ] Greenstone/metabasalt: massive/foliated and pillow-remnant variants.
- [ ] Blueschist/eclogite: foliated or massive high-pressure variants with explicit
  material-domain handling; no color-only distinction.

### Structural and fabric library

- [ ] Massive, granular, porphyritic, glassy, vesicular/amygdaloidal, pillow,
  pyroclastic, and flow-banded fabrics.
- [ ] Laminated, fissile, thin/medium/thick/very-thick bedding, graded bedding,
  planar/cross bedding, channel geometry, ripple surfaces, nodules/concretions,
  clast- and matrix-supported fabrics.
- [ ] Horizontal and dipping beds, variable strike/dip, folds, overturned limbs,
  unconformities, faults, drag, offsets, veins/dykes/sills, and contacts.
- [ ] Slaty cleavage, phyllitic/schistose foliation, gneissic banding, lineation,
  crenulation, boudinage, and migmatitic folding.
- [ ] Tabular, orthogonal, rhombohedral, polyhedral, sheet/exfoliation, cooling
  column, irregular, and fault-related joint networks.

### Weathering, erosion, and transport library

- [ ] Spheroidal weathering, corestones, grus, granular disintegration.
- [ ] Exfoliation/sheeting and pressure-release domes/slabs.
- [ ] Freeze-thaw wedging, crack propagation, block detachment, rockfall.
- [ ] Thermal stress, salt crystallization, case hardening, tafoni/honeycomb.
- [ ] Differential erosion by hardness, cement, bed thickness, and fracture density.
- [ ] Carbonate dissolution: karren, grikes, clints, pits, runnels, pinnacles,
  cavities, cave mouths, tower karst, and collapse debris.
- [ ] Fluvial abrasion, potholing, undercut, channel exposure, rounding and sorting.
- [ ] Marine abrasion, wave notch, salt exposure, stack/arch/stump progression.
- [ ] Wind abrasion/deflation and desert varnish as separate shape/surface effects.
- [ ] Glacial plucking, abrasion, striation, erratics, moraine and frost-shattered talus.
- [ ] Downslope transport: angular talus/scree, size sorting, imbrication, burial.
- [ ] River transport: sub-rounded to rounded pebbles/cobbles/boulders, imbrication.
- [ ] Beach transport: rounded cobble/shingle, wet/dry and tide-zone variants.

### Landform and scale library

- [ ] Pebble, cobble, boulder, slab, block, shard, monolith, corestone, erratic.
- [ ] Tor, dome, fin, blade, pinnacle, pillar, spire, hoodoo, pavement.
- [ ] Ledge, bench, wall, cliff, overhang, cave mouth, arch, natural bridge.
- [ ] Sea cliff, sea cave, arch, stack, and stump stages.
- [ ] Canyon wall, gorge, escarpment, fault scarp, mesa, butte, badlands.
- [ ] Dyke, sill, volcanic neck/plug, lava dome, column field.
- [ ] Scree/talus fan, rockfall deposit, moraine, boulder field, river bar, beach ridge.
- [ ] Stratified ridge, folded ridge, shattered alpine ridge, exfoliation massif,
  volcanic massif, karst tower field, and video-style modular bedrock mountain.

## 6. Compatibility matrix requirements

The recipe system must distinguish **valid**, **valid but uncommon**, **invalid**,
and **fantastical/explicit override**. At minimum it must encode these rules:

- [ ] Bedding belongs to deposited/stratified units; intrusive granite does not
  acquire sedimentary beds because a “horizontal lines” slider is high.
- [ ] Flow banding and cooling joints belong to appropriate volcanic/intrusive
  histories and have a physically meaningful orientation relationship.
- [ ] Columnar jointing requires a cooling body and produces joint-normal columns;
  column geometry responds to cooling boundaries rather than always world Y.
- [ ] Slaty cleavage, schistosity, and gneissic banding are distinct metamorphic
  fabrics with separate spacing and fracture response.
- [ ] Cross-bedding is bounded inside sedimentary sets and truncated at bed contacts.
- [ ] Fractures may cut, terminate at, deflect along, or offset fabrics according
  to chronological relationships stored in the recipe.
- [ ] Carbonate karst requires soluble material, water routing, exposure, and time.
- [ ] Tafoni probability depends on porosity/cement, salt/moisture, exposure, and scale.
- [ ] Transport rounding cannot affect an attached cliff as though it were a river pebble.
- [ ] Talus lithology, block fabric, and joint faces inherit the source outcrop.
- [ ] Sea-stack and arch forms require coastal exposure/history unless explicitly
  marked as a fantastical art-directed override.
- [ ] Stable arches/overhangs require support/stability checks or a recorded
  non-physical art override.

Validation tests must cover every allowed transition and every rejected
combination. UI controls must disable or explain incompatible choices rather
than silently coercing them.

## 7. Test population and statistical coverage

### Per named recipe

- [ ] **32 draft seeds** at reduced mesh/bake tier for topology, bounds, component,
  geology-statistic, determinism, and gross silhouette screening.
- [ ] **8 production seeds** at final dense source, render, fallback, collision,
  and bake tiers under the complete automated gate.
- [ ] **4 hero seeds** selected before viewing final beauty renders: median,
  challenging, extreme-valid, and worst-passing seed.
- [ ] Boundary-value recipes for every numeric control at min, max, default, and
  just-inside/just-outside validation ranges.
- [ ] Pairwise constrained coverage across lithology, fabric, fracture set,
  weathering, environment, landform, and scale, with invalid pairs asserted.
- [ ] Repeated-run hashes for at least 3 seeds per supported platform/runtime.
- [ ] Dimension compile matrix at geologically valid 0.25x, 0.5x, 1x, 2x, and 4x
  target extents, with the same normalized recipe intent but freshly generated
  structure, bake, collision, and LODs at every target.
- [ ] Runtime-transform matrix at 0.5x, 0.75x, 1x, 1.5x, and 2x uniform scale plus
  2:1, 4:1, and 1:2 axis cases. Values outside the provisional envelope are
  expected to warn/reject until independently qualified, not to pass by default.

### Per family

- [ ] Prop scale: 0.05–5 m as geologically appropriate.
- [ ] Outcrop scale: 5–50 m.
- [ ] Module scale: 10–200 m where applicable.
- [ ] Formation scale: 0.2–5 km where applicable; generated as coordinated chunks,
  not a single browser mesh.
- [ ] Neutral/clay, realistic baked, and later stylized visual matrices.
- [ ] Hero, reverse, side, close, top-down, ground, wide, and flyover views as applicable.
- [ ] Neutral overcast, raking light, and Call Me Sensei world light.
- [ ] Dry baseline plus relevant wet, snow, moss/lichen, salt, or oxidation state;
  these are surface layers and may not change underlying geology silently.
- [ ] Repetition scene with at least 20 placements and automated duplicate-
  silhouette/material-phase detection.
- [ ] Formation continuity scene with adjoining chunks and seam heat maps.

### Aggregation rules

- [ ] A family passes only when every mandatory production seed passes every
  technical gate and the worst-passing hero is visually approved.
- [ ] Report pass rate, worst case, percentile distributions, and per-seed failures;
  averages never erase a defect.
- [ ] A renderer or platform passes only when every required family passes there.
- [ ] Flaky capture, non-deterministic hash, or unresolved console error is a failure.
- [ ] Any waived defect is attached to the exact family/seed/output and cannot be
  converted into an unqualified green status.

## 8. Checkpoint plan

### Checkpoint 0 — specification and benchmark lock (this document)

**Deliverables**

- [x] Product boundary, architecture, quality definition, family catalog,
  test load, stop-work rules, and checkpoint sequence documented.
- [x] Existing experimental baseline audited without claiming production readiness.
- [x] Current Unreal/Fab expectations checked against official UE 5.8 documentation.
- [x] Developer approved this execution contract on 2026-08-16.

**Gate:** no compiler implementation begins before approval.

### Checkpoint 1 — provenance, research, and ontology lock

**Implement/review**

- [x] Create a source register containing paper, repository, exact version/commit,
  license, algorithm adapted, code copied (normally none), and attribution duty.
- [x] Inspect `vibe3d` rock generation at a pinned commit and record concepts worth
  adapting versus code/dependencies that must not enter ToonLab.
- [x] Convert the family catalog into versioned lithology, fabric, weathering,
  environment, landform, and scale schemas.
- [x] Create the first full compatibility matrix and a glossary with units.
- [x] Select provenance-safe real-world and Megascans/Fab comparison references.
  Do not commit or redistribute restricted source media.
- [x] Record which geological claims are empirical, approximated, or purely artistic.
- [x] Freeze the provisional physical-dimension/scale contract and record why the
  `vibe3d` world-space density idea does not make a fixed bake scale invariant.

**Automated gate**

- [x] Every source has an auditable license/provenance status.
- [x] Every family maps to distinct required fields and hero recipes.
- [x] Every compatibility rule has accept/reject tests.
- [x] No external code is added before license review.

**Evidence:** source register, ontology tables, compatibility heat map, recipe
count, invalid-pair test results, and a reference board.

**Approval decision:** ontology and research basis are complete enough to freeze
schema v1.

### Checkpoint 2 — deterministic recipe and compiler skeleton

**Implement**

- [x] `RockRecipe` schema with explicit SI units, normalized ranges, chronology,
  quality tier, seed namespaces, `formationId`, `geologyTransform`, and
  authoritative `targetDimensionsMetres`.
- [x] Versioned serialization/deserialization and migrations.
- [x] Compiler stage graph with immutable inputs/outputs and content-addressed cache.
- [x] Structured errors and strict validation; no silent repair or coercion.
- [x] Manifest format for dense source, render, fallback, collision, bake, and style outputs.
- [x] CLI/harness that can run one recipe, a family, or the entire matrix offline.

**Gate**

- [x] Canonical JSON round-trip is lossless.
- [x] Fixed recipes regenerate identical hashes.
- [x] Random-stage isolation tests pass.
- [x] Invalid geology fails with actionable messages.
- [x] Cache invalidation changes only downstream affected stages.
- [x] Changing target dimensions invalidates every physical-scale-dependent stage,
  while a repeated target-dimension compile produces identical hashes.

**Evidence:** schema/API review, determinism table, migration fixtures, dependency
graph, CLI transcript, and deliberately invalid examples.

**Approval decision:** freeze the compiler contract before implementing geology.

### Checkpoint 3 — topology-safe mesher bake-off and lock

The existing QEF Surface Nets experiment is not accepted: current qualification
contains non-manifold and degenerate output. Compare at least the corrected
MC33 family and Manifold Dual Contouring against the current implementation on
the same scalar fields.

**Implement/test**

- [x] Common scalar-field sampler and mesher adapter.
- [x] Surface Nets baseline, corrected MC33 candidate, and Manifold Dual
  Contouring candidate, each with identical audit output.
- [x] Ambiguous-cell, saddle, thin sheet, near-touching surface, sharp crease,
  cavity, nested component, chunk seam, and extreme-scale fixtures.
- [x] Self-intersection, winding, manifold, boundary, sliver, and Hausdorff audits.
- [x] Adaptive/chunked extraction and crack-free seam test.
- [x] Feature-preserving normal/crease policy.

**Gate**

- [x] Chosen mesher produces 0 topology failures across all adversarial fixtures,
  32 seeds of every existing experimental family, and a resolution sweep.
- [x] Cross-chunk boundaries are bit-compatible or use a proven stitching contract.
- [x] Quality/performance tradeoff and license are written down.
- [x] No downstream family work proceeds with a mesher that fails this gate.

**Evidence:** three-way metric table, adversarial contact sheet, topology heat maps,
resolution convergence plots, timings, memory, and selected design record.

**Approval decision:** select and freeze the production mesher.

### Checkpoint 4 — structural geology fields

**Implement**

- [x] Material, hardness, porosity/permeability, cementation, and weathering-
  susceptibility fields.
- [x] Finite layer volumes with thickness distributions and non-periodic contacts.
- [x] Strike/dip, folds, unconformities, faults/offsets, veins, dykes, and sills.
- [x] Sedimentary, igneous, and metamorphic fabric evaluators.
- [x] Formation coordinates shared across arbitrary modules and LODs.
- [x] Chronology graph controlling cross-cutting and termination relationships.

**Gate**

- [x] Analytic fixtures match expected orientations, offsets, and terminations.
- [x] Adjacent 200 m chunks agree along every shared sample boundary.
- [x] No visible global periodicity across the largest test formation.
- [x] Unsupported combinations fail through the compatibility matrix.

**Evidence:** field slices, orientation glyphs, contact/fault cross-sections,
chunk-seam heat maps, and clay renders of bedded/folded/faulted basis forms.

**Approval decision:** geological structure reads correctly before fracturing.

### Checkpoint 5 — finite fracture network and block extraction

Adapt finite discontinuity concepts—orientation families, persistence, spacing,
size distributions, terminations, and intersections—rather than carving endless
planes through noise.

**Implement**

- [x] Deterministic DFN sets using strike/dip and controlled orientation spread.
- [x] Truncated power-law/lognormal size, spacing, aperture, roughness, and persistence.
- [x] Joint hierarchy and chronology with bedding/fault interaction.
- [x] Equidimensional, rhombohedral, polyhedral, and tabular implicit blocks.
- [x] Block adjacency/support graph and material/fabric inheritance.
- [x] Efficient spatial index for field and block queries.

**Gate**

- [x] Generated statistics fall within configured confidence bands for every seed set.
- [x] Finite joints visibly terminate and obey chronology.
- [x] Extracted blocks tile/occupy the parent volume within tolerance without
  unintended gaps or overlaps.
- [x] Shape classes remain distinguishable in a blind clay-render sort.

**Evidence:** stereonets/orientation plots, length/spacing/persistence histograms,
block graph views, fracture-intersection heat maps, and four basis contact sheets.

**Approval decision:** fractures and blocks look structural, not decorative.

### Checkpoint 6 — weathering, erosion, stability, and transport

**Implement**

- [x] Exposure, drainage/runoff, moisture/salt, temperature-cycle, and time fields.
- [x] Hardness/porosity/cement-controlled differential erosion.
- [x] Water infiltration, bond weakening, detachment, and support/stability test.
- [x] Spheroidal, exfoliation, freeze-thaw, thermal/salt, tafoni, karst, marine,
  fluvial, aeolian, and glacial kernels.
- [x] Transport rounding/abrasion and slope/water deposition with sorting and imbrication.
- [x] Talus/source-outcrop lineage and stable deposited assemblies.

**Gate**

- [x] Zero unsupported floating components after the stability stage.
- [x] Weathering follows the declared fabric/material and changes predictably with time.
- [x] Mass-loss and detached-volume accounting close within numeric tolerance.
- [x] Transported pieces retain source lithology/fabric while changing edge/shape statistics.
- [x] Each kernel passes a before/after causal fixture; combined kernels pass order tests.

**Evidence:** time sequence, support graph, drainage overlay, detached-volume chart,
before/after clay sheets, and source-to-talus lineage visualization.

**Approval decision:** process-generated forms are plausible before surface detail.

### Checkpoint 7 — high-to-low bake compiler v2

**Implement**

- [x] Dense source and render/fallback/collision derivation.
- [x] Production unwrap/packing or virtual-texture/UDIM policy by asset scale.
- [x] Projection cages/disambiguation for thin, concave, and stacked surfaces.
- [x] High-precision base color, normal, roughness, AO, height, cavity/curvature,
  material/fabric, exposure, wetness, and deposition masks.
- [x] Mip-safe dilation, tangent validation, color-space metadata, and channel packing.
- [x] Asset-size/minimum-view-distance texel-density policy.
- [x] Target-dimension recompiles select atlas/virtual-texture resolution from
  surface area and viewing contract; every exported asset records achieved px/m.

**Gate**

- [x] All C7-owned UV/bake gates in section 4 pass at production resolution;
  actual GLB/Unreal round-trip remains explicitly owned by C12.
- [x] Close, grazing-angle, and mip-chain renders show no seam or projection defects.
- [x] Render/fallback silhouettes remain within declared pixel/Hausdorff error.
- [x] Repeated bake hashes are identical.

**Evidence:** UV density/overlap heat maps, cage diagnostics, per-channel sheets,
mip/grazing contact sheet, geometry error maps, timings, and output sizes.

**Approval decision:** neutral realistic assets can be trusted before family rollout.

### Checkpoint 8 — basis-family proof

The optional provider/template bridge is documented in
`docs/rock-geology-v2-provider-template-bridge.md`. It does not replace C0–C7:
the ToonLab control cage, semantic landmarks, admitted evidence, family recipe,
and C7 bake compiler remain authoritative. H3.1 geometry and provenance-bound
surface scans are optional donors that must pass repair and admission gates.

The first hoodoo candidate now proves the mechanical round trip: H3.1 3.1 input,
one-component watertight repair, editable semantic template, deterministic and
manual-edit-compatible rebake, independent 4K PBR plus micro-height, separate 2K
signed geometric residual, 180k/60k/20k/6k visual LODs, 500-triangle collision,
and byte-audited GLBs. It passes technical and before/after-improvement gates.
It does **not** yet prove Megascans equivalence or C8 family generalization.

The basis set must span the major formation mechanisms before multiplying recipes:

- [ ] Jointed/exfoliating granite boulder and tor.
- [ ] Cross-bedded/differentially eroded sandstone cliff and arch.
- [ ] Columnar/entablature basalt outcrop.
- [ ] Bedded limestone karst spire/cave form.
- [ ] Fissile shale or slate slope/outcrop.
- [ ] Foliated/folded gneiss or schist outcrop.
- [ ] Clast-supported conglomerate or volcanic breccia.
- [ ] Transported river boulder plus inherited talus/scree assembly.

**Gate**

- [x] Exact source-bound six-view references pass visual and rights/source audits
  for all 100 catalogued subtypes.
- [x] One provider-assisted hoodoo process candidate passes topology, editable
  round-trip, bake, signed-residual, LOD, collision, and GLB gates.
- [ ] Developer accepts the hoodoo visual baseline for representative production.
- [ ] A representative multi-family calibration proves which families need H3.1,
  which can use ToonLab-only construction, and the per-family LOD/material presets.
- [ ] Every basis recipe passes 32 draft, 8 production, and 4 hero seed rules.
- [ ] A geology review can identify the intended class from clay structure alone
  above the predeclared success threshold.
- [ ] Every current v1 defect has an explicit resolved/remaining disposition.
- [ ] Neutral realistic A/B board is approved without ToonLab stylization.

**Evidence:** before/clay/realistic/reference comparisons for all views, outlier
board, complete technical table, and reviewer confusion matrix.

**Approval decision:** the methodology generalizes beyond one good boulder. A
technically valid provider bridge is not itself that approval.

### Checkpoint 9 — outcrop, cliff, and mountain formation proof

> **Sequencing correction, 2026-08-17:** the repository-only parent-field,
> chunk, seam, and streaming substrate may be prepared before C8 finishes, but
> C9 is parked and may not be called complete until the representative C8
> calibration pack is integrated as real modules, landmarks, source blocks, and
> baked detail. The current neutral clay board is infrastructure evidence only.

**Implement**

- [x] Formation-scale domain/chunk graph and deterministic streaming coordinates.
- [x] 10–200 m slab, wedge, ledge, crown, pillar, buttress, and talus modules cut
  from a common formation volume.
- [x] Seam-aware crops, buried backs/bases, sockets/overlap zones, and no exposed
  terrain/module gaps.
- [x] Formation-aware materials and masks without texture-phase resets.
- [x] Infrastructure-only video-target steeply dipping stratified ridge/mountain.
- [x] Infrastructure-only folded ridge, fault scarp, shattered alpine ridge, exfoliation massif,
  volcanic massif, and karst tower field targets.

The checked items above prove only the formation substrate in
`checkpoint-09-formations`. They do not satisfy the C9 gate without finished C8
inputs and their actual high-to-low bakes.

**Gate**

- [ ] Shared strike/dip, contacts, faults, fractures, and material phase remain
  continuous across every neighboring module.
- [ ] No module repetition is detectable in the approved gameplay/flyover path.
- [ ] Overhangs/crowns pass stability or declare a reviewed art override.
- [ ] Talus derives from source blocks and accumulates consistently with slope.
- [ ] Top-down, flyover, base-of-cliff, silhouette, and gameplay views pass.
- [ ] Formation-scale performance and streaming budgets pass in UE and ToonLab.

**Evidence:** supplied-video reference board, formation field slices, module
exploded view, seam heat map, camera-path video, top-down/flyover/contact sheets,
and performance trace.

**Approval decision:** large mountains are a first-class output, not prop assembly.

### Checkpoint 10 — full family rollout

**Implement/test**

- [ ] Complete every unchecked item in the family, fabric, weathering, transport,
  and landform catalog.
- [ ] Add recipe-specific validators and expected statistical envelopes.
- [ ] Run the full seed/scale/lighting/camera/platform matrix.
- [ ] Produce one family index with status, recipe count, known limits, evidence,
  and regeneration command.

**Gate**

- [ ] 100% of mandatory recipes pass all technical gates.
- [ ] 100% have before/clay/realistic/reference evidence and worst-seed evidence.
- [ ] No family is represented by a color/material swap alone.
- [ ] No accepted recipe relies on undocumented manual edits.

**Evidence:** master family contact sheets grouped by geology, failure-free result
JSON, parameter coverage report, and per-family evidence links.

**Approval decision:** family breadth is sufficient to close geology v2 scope.

### Checkpoint 11 — reversible ToonLab stylization

**Implement**

- [ ] Apply stylization after neutral bake through stable semantic geology masks.
- [ ] Preserve macro silhouette, structural edges, source normal/height information,
  material identity, wetness, moss/lichen, and shadow behavior.
- [ ] Add controlled value grouping, hue shift, detail compression/exaggeration,
  edge/cavity treatment, and distance response through `rock-shader`/style runtime.
- [ ] Make neutral ↔ styled toggling exact and reversible.
- [ ] Maintain Call Me Sensei shared sun, probe, cloud shadow, fog, and post contracts.

**Gate**

- [ ] Neutral output remains independently accessible and unchanged.
- [ ] Toggle-off restores exact pre-style state.
- [ ] Stylization improves the approved art-direction score without reducing
  geological identification, topology, bake, or LOD scores.
- [ ] WebGPU and TSL WebGL2 outputs pass multi-view review.

**Evidence:** neutral/stylized side-by-side for every family, domain-isolation
captures, pixel/color-distance probes for regression, and exact restoration hashes.

**Approval decision:** approve the ToonLab look separately from realistic quality.

### Checkpoint 12 — Unreal Engine 5.8 integration

**Implement/test**

- [ ] Deterministic export/import route into
  `StylizedExploration/StylizedExploration.uproject`.
- [ ] Nanite build from dense source where appropriate.
- [ ] Fallback mesh/LOD and collision policy per asset scale/use.
- [ ] Material instance/channel import, texture compression, virtual-texture/UDIM
  decision, and scale/pivot metadata.
- [ ] Automated or scripted validation map with representative props, outcrops,
  mountains, repetition, shadows, Lumen/ray-tracing fallback, and collision.

**Gate**

- [ ] UE reports no import, Nanite, material, collision, or map errors.
- [ ] Dimensions and orientation match source exactly.
- [ ] Nanite and fallback views are both inspected; fallback mismatch remains
  inside the declared visual/collision error.
- [ ] Target frame, memory, disk, texture-streaming, shadow, and collision budgets pass.
- [ ] Packaged/cooked build resolves every asset without editor-only dependencies.

**Evidence:** UE import manifests/logs, Static Mesh/Nanite/fallback diagnostics,
collision and UV views, Lumen/shadow comparisons, gameplay/flyover captures,
performance trace, and packaged-build smoke result.

**Approval decision:** engine-quality target is demonstrated in the target engine.

### Checkpoint 13 — exhaustive regression and adversarial qualification

**Run**

- [ ] Full family matrix at production settings.
- [ ] Resolution, scale, extreme-parameter, chunk-boundary, cache, cancellation,
  invalid-input, and corrupted-artifact tests.
- [ ] Complete dimension-compile and runtime-transform matrices, including shrink,
  enlargement, mirrored input rejection, and strong non-uniform axis stress.
- [ ] Determinism across repeated processes and supported platform/runtime variants.
- [ ] Clean consumer using only public package imports.
- [ ] Long scene with many instances, camera traversal, LOD/streaming transitions,
  shadow/time changes, and device loss/recovery where supported.
- [ ] Separate adversarial review focused on finding defects and category confusion.

**Gate**

- [ ] Zero unexpected failures, flaky tests, console errors, missing artifacts,
  topology defects, bake defects, or undocumented visual outliers.
- [ ] Every shipping family has a measured runtime scale envelope; out-of-envelope
  user resizing demonstrably warns and routes to recompile/rebake.
- [ ] Approved baselines change only with a reviewed reason and replacement evidence.
- [ ] Performance distributions meet budgets; no family passes by averaging away
  a pathological seed.

**Evidence:** complete CI/local logs, aggregate and worst-case tables, regression
diff boards, outlier sheet, clean-consumer transcript, and adversarial findings.

**Approval decision:** release candidate may enter API/documentation review.

### Checkpoint 14 — public API, documentation, packaging, and release gate

**Implement/review**

- [ ] Public exports, type declarations, schema versions, migrations, examples,
  docs, and skills describe only qualified behavior.
- [ ] Package contains no generated research artifacts, restricted references, or
  accidental heavy dependencies.
- [ ] Recipe/API examples regenerate their documented hashes.
- [ ] Migration, backward-compatibility, deprecation, and rollback plans are written.
- [ ] Release notes distinguish neutral geology generation from rock stylization.

**Gate**

- [ ] `npm run verify:rockgen`
- [ ] `npm run verify:skills`
- [ ] `npm run verify:docs`
- [ ] `npm run verify:package`
- [ ] `npm run verify:release`
- [ ] `npm pack --dry-run`
- [ ] Install tarball into a clean consumer and rerun public-import visual smoke tests.
- [ ] Final family, UE, ToonLab, provenance, performance, and known-limit reports
  are all green and linked.

**Evidence:** release-candidate manifest, package listing, verification transcripts,
clean-consumer output, final contact sheets, and signed approval record.

**Approval decision:** explicit developer approval is required before calling the
compiler supported or changing public product claims.

## 9. Current baseline: what is already proven and what is not

The repository's `toonlab-high-to-low-v1` experiment is useful evidence, not a
foundation we can promote unchanged.

| Existing family status | Families |
| --- | --- |
| Fully accepted across the three current test seeds | boulder, river-boulder, karst-spire, shard-monolith |
| Partially accepted | jointed-granite-boulder, sea-stack, lowpoly-boulder, mossy-boulder |
| Rejected | granite-boulder, basalt-columns, cliff-wall, eroded-mesa, canyon-ridge, column-arch, cliff-face, scree-cluster |

The matrix currently tests only 16 appearance/landform labels and three seeds,
with mixed resolutions and a six-chart projection bake. Rejected or partial
outputs include non-manifold edges, degenerate faces, and projection conflict.
The current generic gate even allows projection conflict up to 2.5%, which is
not acceptable for geology v2. The promising renders prove that high-to-low
baking materially helps appearance; they do not prove geological correctness,
topology robustness, family breadth, mountain construction, or scan-level closeup.

Baseline evidence:

- `artifacts/research/toonlab-rock-family-matrix/qualification.json`
- `artifacts/research/toonlab-rock-family-matrix/captures/family-comparison-contact-sheet.png`
- `labs/toonlab-realistic-boulder/RESULTS.md`
- `src/rockgen/experimental/realisticRockCompiler.js`
- `src/rockgen/experimental/meshAudit.js`

## 10. Method sources validated in Checkpoint 1

These sources guide methodology. Their exact revisions, use boundaries, license
status, and reject decisions are locked in the Checkpoint 1 source register; no
external implementation was copied.

- Axel Paris et al., **Terrain Amplification with Implicit 3D Features**:
  implicit geological strata, karst/cave features, sea erosion, construction
  trees, and spatial acceleration. The authors provide an MIT research reimplementation.
  <https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/paris2019.pdf>
- Axel Paris et al., **Modeling Rocky Scenery Using Implicit Blocks**:
  equidimensional, rhombohedral, polyhedral, and tabular fracture-constrained
  block construction. The accompanying reimplementation is MIT licensed but
  explicitly omits some paper features.
  <https://aparis69.github.io/public_html/projects/paris2020_Blocks.html>
- LANL **dfnWorks/DFNGen**: finite fracture families, orientation distributions,
  persistence/density, and truncated size distributions. Use the statistical
  concepts; do not import its flow/transport suite into ToonLab.
  <https://dfnworks.lanl.gov/dfngen.html>
- Diego Mateos Arlanzón, **Simulation of Mechanical Weathering for Modeling
  Rocky Terrains**: fracture graphs, water infiltration, bond damage, and block
  detachment. Its own known limitation—no full stability computation—must not
  be inherited. The repository is MIT licensed.
  <https://github.com/dimateos/UPC-MIRI-TFM-erosion>
- Schaefer et al., **Manifold Dual Contouring**: candidate topology-preserving
  mesher for the Checkpoint 3 bake-off.
  <https://doi.org/10.1109/TVCG.2007.1012>
- Vega et al., **Marching Cubes 33: Edge Cases, Ambiguities and Practical
  Implementation**: corrected face/interior tests and current MC33 reference.
  <https://jcgt.org/published/0008/03/01/>
- Custodio et al., **Practical considerations on Marching Cubes 33 topological
  correctness**: historical implementation reference only; not assumed correct
  where the later Vega analysis identifies defects.
  <https://www.sci.utah.edu/~etiene/pdf/mc33.pdf>
- Grose et al., **LoopStructural 1.0: time-aware geological modelling** and
  **Realistic modelling of faults in LoopStructural**: time-ordered implicit
  scalar fields, structural frames, finite displacement support, and restoration
  before evaluating older features. ToonLab uses the method descriptions only.
  <https://gmd.copernicus.org/articles/14/3915/2021/>
- de la Varga et al., **GemPy 1.0**: cross-check for implicit contact/orientation
  fields and fault/unconformity semantics; no inversion stack or code dependency.
  <https://gmd.copernicus.org/articles/12/1/2019/>
- British Geological Survey **Rock Classification Scheme** and discontinuity
  terminology: ontology and field naming.
  <https://www.bgs.ac.uk/technologies/bgs-rock-classification-scheme/>
- US National Park Service **Columnar Jointing**: cooling-fracture morphology
  reference for basalt qualification.
  <https://www.nps.gov/subjects/volcanoes/columnar-jointing.htm>
- Epic **Nanite Virtualized Geometry**, **Nanite Technical Details**, **Virtual
  Texturing**, **Fab/Megascans quality tiers**, and **Valley of the Ancient**:
  current engine/content benchmark and integration requirements.
  <https://dev.epicgames.com/documentation/unreal-engine/nanite-virtualized-geometry-in-unreal-engine>

## 11. Checkpoint approval ledger

| Checkpoint | State | Developer decision | Evidence |
| --- | --- | --- | --- |
| 0. Specification and benchmark lock | **Authorized** | Proceed, 2026-08-16 | This document + existing baseline matrix |
| 1. Provenance, research, ontology | **Authorized** | Proceed, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-01-research-ontology/` |
| 2. Recipe/compiler contract | **Authorized** | Proceed, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-02-recipe-compiler-contract/` |
| 3. Topology-safe mesher | **Authorized** | Proceed, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-03-topology-mesher/` |
| 4. Structural geology fields | **Authorized** | Proceed, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-04-structural-fields/` |
| 5. Finite fractures/blocks | **Authorized** | Approved, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks/` |
| 6. Weathering/stability/transport | **Authorized** | Approved, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-06-processes/` |
| 7. High-to-low bake v2 | **Authorized** | Approved, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler/` |
| 8. Basis-family proof | **In progress** | Authorized, 2026-08-16 | `artifacts/research/rock-geology-v2/checkpoint-08-basis-families/` |
| 9. Outcrop/cliff/mountain proof | **Parked after substrate proof** | Await representative C8 calibration pack | `artifacts/research/rock-geology-v2/checkpoint-09-formations/` |
| 10. Full family rollout | **Planned, blocked** | Tor process/visual gate before fanout | `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/` |
| 11. Reversible stylization | **Representative technical slice passed; approval open** | Four LOD semantic masks, exact neutral restoration, WebGPU/WebGL2 six-view, and shared sun/sky/cloud/shadow/ground/post proofs pass; developer art review and the future full catalog remain open | `artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/` |
| 12. Unreal Engine 5.8 integration | Not started | — | — |
| 13. Exhaustive regression | Not started | — | — |
| 14. Public release gate | Not started | — | — |

## 12. Checkpoint 0 approval questions

Approval of Checkpoint 0 confirms all of the following:

- [x] The neutral, geologically plausible compiler is the product foundation;
  stylization cannot be used to earn the neutral quality gate.
- [x] The extensive versioned family catalog above is the required geology v2 scope.
- [x] The video-style mountain and the six other formation targets are mandatory.
- [x] The test population and worst-case rules are acceptable even though they
  make this a substantial production program rather than a quick shader tweak.
- [x] The topology mesher is selected by evidence at Checkpoint 3, not by preserving
  the current Surface Nets implementation.
- [x] “Megascans-quality” will mean visually competitive at declared distances
  under normalized comparison—not an unsupported claim of scan equivalence.
- [x] Work pauses for developer review at each checkpoint before the next major
  irreversible decision.
