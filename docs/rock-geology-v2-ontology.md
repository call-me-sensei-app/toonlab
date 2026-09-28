# Rock Geology v2 — ontology, compatibility, and scale contract

> **Schema candidates:** `ontology.v1.json`, `compatibility.v1.json`, and
> `reference-index.v1.json` under `src/rockgen/experimental/geology-v2/`  
> **Status:** Checkpoint 1 candidate; repository-only and not a public API

## Coverage definition

“Every rock” cannot mean every named local unit, facies transition, mineral
assemblage, or weathering state. This schema instead covers every family and
formation mechanism frozen in the production checklist, provides aliases where
the checklist groups regional names, and fails closed when a requested
combination is not modeled. New lithologies extend the versioned data rather than
being approximated through a color swap.

The Checkpoint 1 candidate contains:

| Axis | Count | Coverage |
| --- | ---: | --- |
| Lithologies | 65 | 22 igneous, 26 sedimentary, 17 metamorphic |
| Required hero recipes | 65 | one structurally distinct neutral proof target per lithology |
| Fabrics/structures | 73 | crystalline, volcanic, sedimentary, clastic, metamorphic, contacts, and joint families |
| Processes | 37 | fracture, weathering, erosion, deposition, transport, and surface history |
| Environments | 14 | continental, alpine/glacial, coastal/fluvial/marine, volcanic, and hydrothermal settings |
| Landforms | 64 | props, outcrops, cliffs, coastal progressions, deposits, and formation/mountain targets |
| Scale classes | 4 | prop, outcrop, module, and formation |

### Lithology inventory

- **Intrusive/hypabyssal igneous:** granite, alkali granite, granodiorite,
  tonalite, syenite, diorite, gabbro, dolerite/diabase, pegmatite, peridotite,
  dunite, and anorthosite.
- **Extrusive/pyroclastic igneous:** basalt, andesite, dacite, rhyolite,
  obsidian/pitchstone, pumice, scoria, tuff, ignimbrite, and volcanic breccia.
- **Siliciclastic sedimentary:** conglomerate, sedimentary breccia, quartz
  arenite, arkose, lithic arenite, greywacke, siltstone, mudstone, claystone,
  and shale.
- **Carbonate/chemical/siliceous/organic sedimentary:** micritic, oolitic,
  fossiliferous, and reef limestone; dolostone, chalk, marl, travertine, tufa,
  chert/flint, gypsum, anhydrite, halite, ironstone, banded iron formation, and
  coal-bearing strata.
- **Metamorphic:** slate, phyllite, mica schist/schist, chlorite schist, gneiss,
  migmatite, marble, quartzite, amphibolite, granulite, hornfels, serpentinite,
  greenstone/metabasalt, blueschist, eclogite, metaconglomerate, and mylonite.

Each record has a class, subclass, causal tags, a distinct structural signature,
and one hero recipe that resolves to registered fabric, process, environment,
landform, and scale IDs. Those records define intended coverage; they are not yet
compiled production assets.

## Recipe model

The future recipe is a composition rather than a “rock type” dropdown followed by
noise:

```text
lithology + primary fabric + chronology + finite discontinuities
           + material properties + weathering/erosion/transport history
           + environment + landform + target dimensions + seed
```

The lithology supplies permissible material/fabric behavior. Chronology decides
which structures cut, terminate against, fold, or offset others. Process kernels
consume physical-scale fields such as hardness, porosity, cementation, fracture
persistence, exposure, drainage, salt, temperature cycles, and time. Landform and
scale decide whether the result is a detached prop, attached exposure, streamable
module, or coordinated formation.

## Scale and editor behavior

`targetDimensionsMetres` is authoritative. A 0.8 m granite boulder and an 8 m
granite corestone may share family intent and seed namespaces, but each is sampled,
meshed, unwrapped, baked, simplified, and collided at its own physical dimensions.
A mountain changes formation extent and chunk layout; it is never the 0.8 m asset
scaled 1,000 times.

Inside ToonLab:

1. dragging a resize control may show a cheap temporary transform;
2. commit/release schedules a debounced regenerate + rebake;
3. the editor retains the last valid result while work runs;
4. save/export waits for completion or requires the user to explicitly keep the
   previous valid asset;
5. undo/redo addresses recipe dimensions and resolves through the cache.

Outside ToonLab, a plain export is static. Its metadata records generated
dimensions, achieved texels per metre, compiler recipe identity, and a qualified
runtime transform envelope. Host transforms inside that envelope are ordinary
scene operations; outside it they may reduce texture density or distort geology.
The correct remedy is a new compile. A later Unreal/DCC editor plugin may automate
that request asynchronously, but it uses the same standalone compiler and never
changes a cooked/runtime build implicitly.

The provisional 0.75x–1.5x uniform envelope and 1.2 axis ratio are test inputs,
not quality promises. The exhaustive scale matrix must establish per-family and
per-tier values; any unqualified family defaults to recompile-only.

## Compatibility semantics

Every matrix cell resolves to one of four states:

- `valid`: supported by the declared geological history;
- `valid-but-uncommon`: possible, but requires explicit review and provenance;
- `invalid`: rejected in strict mode with an actionable reason;
- `fantastical-explicit-override`: allowed only with an author, reason, and
  non-physical output label; it never becomes geological evidence.

Selectors are data, not UI conditionals: selector alternatives are OR; fields
inside one selector are AND; `tagsAny` is OR within that field. Anything unmatched
is invalid. This gives complete, reproducible classification over five axes:

| Matrix | Cells in Checkpoint 1 |
| --- | ---: |
| Lithology × fabric | 4,745 |
| Lithology × process | 2,405 |
| Lithology × landform | 4,160 |
| Environment × landform | 896 |
| Landform × scale | 256 |
| **Total** | **12,462** |

The matrix is deliberately restrictive. For example, sedimentary bedding does
not appear on granite because a horizontal-line control was raised; cooling
columns require a cooling-capable body and boundary; karst requires soluble
carbonate, water routing, exposure, and time; a sea stack requires a coastal
history; transported rounding requires detachment; talus inherits a source; and
arches/overhangs require a support result or an explicit artistic override.

Twelve contextual rules each contain at least one accepting and one rejecting
fixture. The verifier evaluates every fixture, every hero recipe, every profile
membership, every source/reference ID, and every matrix axis. Adding a new fabric,
process, environment, or landform without classifying it turns the gate red.

## Glossary and units

| Term | Meaning in ToonLab | Unit/representation |
| --- | --- | --- |
| Lithology | Rock material/classification, not shape or color alone | stable ontology ID |
| Primary fabric | Texture/arrangement formed with the rock, such as bedding, grains, vesicles, or flow bands | stable IDs plus formation-local fields |
| Secondary structure | Feature formed later, such as joints, faults, veins, folds, cleavage, or foliation | chronology node plus geometry/statistics |
| Formation | Continuous geological domain from which props/modules/exposures may be cut | formation ID and local coordinates, metres |
| Geology space | Right-handed formation-local coordinates; placement Y-up does not imply horizontal beds | metres; transform stored explicitly |
| Target dimensions | Physical output bounds requested by the author | XYZ metres, all positive |
| Scale class | Intended extent/use category | prop 0.05–5 m; outcrop 5–50 m; module 10–200 m; formation 0.2–5 km |
| Runtime scale envelope | Transform range qualified without rebuilding a fixed asset | dimensionless per-axis values plus max/min ratio |
| Strike | Compass azimuth of a horizontal line on a plane | degrees in [0, 360) |
| Dip | Downward angle of a geological plane | degrees in [0, 90] plus dip direction |
| Discontinuity | Joint, fault, bedding parting, cleavage, or other mechanical break | typed finite surface |
| Fracture set | Statistical family of finite discontinuities | stable ID and seed namespace |
| Spacing | Normal distance between adjacent discontinuities in a set | metres |
| Persistence | Finite trace/extent of a discontinuity | metres or bounded size distribution |
| Aperture | Separation between discontinuity walls | metres |
| Roughness | Wall relief controlling visual form and mechanical response | metres plus dimensionless statistic |
| Infill | Material occupying an aperture | material ID and thickness in metres |
| Orientation spread | Dispersion around a mean strike/dip | von Mises–Fisher concentration or documented equivalent |
| Bedding | Primary stratification of deposited material | bounded surfaces and thickness distribution in metres |
| Lamination | Bedding thinner than the recipe's bed threshold | metres; never a universal sine texture |
| Cleavage/foliation | Metamorphic planar fabric, distinct from sedimentary bedding | finite field with orientation and spacing in metres |
| Cooling columns | Polygonal joints propagating normal to cooling boundaries | cell size/length in metres and boundary field |
| Chronology | Ordered/cross-cutting history of deposition, intrusion, metamorphism, fracture, weathering, and transport | acyclic graph with stable node IDs |
| Hardness | Relative resistance consumed by erosion/damage kernels | calibrated dimensionless [0, 1] in the initial visual model |
| Porosity | Void fraction of material | dimensionless [0, 1] |
| Permeability | Ease of fluid transmission | square metres when physical data exists; explicitly normalized approximation otherwise |
| Cementation | Relative grain/clast binding | calibrated dimensionless [0, 1] |
| Exposure | Surface accessibility to a process | dimensionless [0, 1] plus orientation/context |
| Weathering time | Duration supplied to a process approximation | years |
| Detachment | Transition from supported parent rock to a named free component | graph event with volume/mass accounting |
| Transport distance | Path length after detachment | metres |
| Sorting | Size/density ordering in a deposit | distribution parameters and dimensionless score |
| Imbrication | Preferred overlap/orientation of transported clasts | degrees plus orientation spread |
| Landform | Geomorphic context and history, not a mesh preset | stable ontology ID |
| Component | Intentionally separate connected output piece | stable ID, parent/source lineage, volume in m³ |
| Chunk/module | Streamable crop of a common formation | formation coordinates and seam contract |
| Dense source | Highest qualified geometric source used for derivation/baking | triangle count and geometric error in metres |
| Render/fallback/collision | Separately derived and separately qualified outputs | triangle counts, error in metres/pixels, role IDs |
| Texel density | Linear texture sampling at the authored size | pixels per metre (px/m) |
| Minimum viewing distance | Closest distance at which a tier is approved | metres and resulting screen coverage |
| Seed namespace | Stable random stream assigned to one compiler stage | unsigned integer/hash; isolated per stage |
| Repair | Recorded post-extraction change, never a silent validity substitute | operation log and before/after audits |

## Extension rule

A new named family is accepted only when it adds a distinct causal signature,
hero recipe, compatibility classifications, claim-strength/source records,
accept/reject fixtures where needed, reference plan, and later full seed/scale
evidence. A new name pointing at an existing geometry with different color does
not increase coverage.
