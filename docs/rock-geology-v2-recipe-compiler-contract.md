# Rock geology v2 — recipe and compiler contract

> **Checkpoint:** 2 candidate, awaiting developer approval  
> **Scope:** repository-only, Node-based offline compiler contract  
> **Not claimed:** generated geometry, topology, texture bake, neutral realism,
> Unreal readiness, public package support, or Megascans-equivalent quality

## Outcome

Checkpoint 2 freezes the deterministic boundary that later geology, meshing,
baking, collision, LOD, and style implementations must obey. It deliberately
does not preserve the permissive behavior of the existing public rock document:
geology v2 rejects unknown fields, wrong JSON types, non-finite values, invalid
ranges, ambiguous chronology, and incompatible geology. It never clamps, parses,
sorts, substitutes, or repairs an authored value during validation.

The authoritative implementation is repository-only under
`src/rockgen/experimental/geology-v2/`. `src/.npmignore` excludes the complete
`rockgen/experimental/` tree from the npm tarball. No `package.json` export,
public type, runtime entry point, or generated asset dependency has been added.

## RockRecipe v1

The machine-readable schema is
`src/rockgen/experimental/geology-v2/rock-recipe.schema.v1.json`; executable
semantic validation is in `recipe.node.js`. JSON Schema covers closed object
shapes and scalar ranges. The executable validator additionally checks ontology
membership, compatibility matrices, class-required fields, chronology graph
acyclicity/order, fracture-to-chronology references, target-dimension scale
ranges, and the contextual geology rules frozen at Checkpoint 1.

All fields are explicit. The 26 top-level fields include:

- identity: schema version, recipe ID, formation ID, optional host lithology;
- geology: lithology, fabrics, processes, environment, landform, and scale;
- physical extent: authoritative `targetDimensionsMetres`;
- formation coordinates: origin in metres plus strike, dip, and dip direction in
  degrees through `geologyTransform`;
- material inputs: normalized hardness/cementation, porosity fraction,
  permeability in square metres, and density in kilograms per cubic metre;
- causal history: ordered chronology nodes/edges, finite fracture-set inputs,
  depositional history where applicable, metamorphic fabric where applicable,
  weathering exposure/cycles, transport/source/coastal/stability context;
- reproducibility: one non-zero 32-bit root seed and ten unique named seed
  namespaces; and
- output intent: `draft`, `production`, or `hero` quality.

Compatibility failures are closed by default. A deliberately non-physical
combination requires `allowFantasticalOverride=true`, a non-empty reason, and an
author. The validator preserves the declared geology and emits warnings; the
artifact manifest labels every such output `non-physical-art-directed`.

## Canonical serialization and migration

Canonical JSON recursively sorts keys, preserves array order, and rejects
undefined, cyclic values, non-plain objects, NaN/infinity, and negative zero.
Content identities are lowercase SHA-256 values over canonical bytes.

Supported documents are:

| Input | Behavior |
| --- | --- |
| `toonlab/rock-geology-recipe` v1 | Strict validation; no migration and no mutation |
| `toonlab/rock-geology-recipe-draft` v0 | Explicit `v0-draft-to-v1` migration with renamed-field warning |
| Any other schema/version | Structured `ROCK_RECIPE_VERSION_UNSUPPORTED` failure |

The v0 migration explicitly renames dimensions, transform orientation,
quality, and seed-stream fields. It then validates the complete v1 result. No
best-effort/future-version downgrade exists.

## Compiler stage graph

```mermaid
flowchart LR
  structure["structure-field"] --> fractures["fracture-network"]
  structure --> weathering["weathering-field"]
  fractures --> weathering
  structure --> transport["stability-transport"]
  fractures --> transport
  weathering --> transport
  structure --> dense["dense-source"]
  fractures --> dense
  weathering --> dense
  transport --> dense
  dense --> render["render-mesh"]
  dense --> fallback["fallback-mesh"]
  dense --> collision["collision"]
  dense --> bake["surface-bake"]
  render --> bake
  render --> style["style"]
  bake --> style
```

Each stage identity hashes only:

1. compiler and stage version;
2. the exact declared recipe fields consumed by that stage;
3. upstream stage identities; and
4. that stage's named derived random stream.

Metadata-only label/description edits therefore change the source recipe hash
but reuse every compile-stage cache entry. A fracture edit preserves the
structure field and invalidates the fracture stage plus its downstream users.
A target-dimension edit invalidates all ten physical-scale-dependent stages.
Changing one random namespace has the same constrained downstream behavior.

Stage plans, inputs, dependency maps, random-stream records, cache records, and
JSON output descriptors are recursively frozen. A cache refuses a second output
hash for the same stage identity with `NONDETERMINISTIC_STAGE_OUTPUT`.

## Artifact manifest v1

The manifest schema is
`src/rockgen/experimental/geology-v2/artifact-manifest.schema.v1.json`.
A planned manifest contains the recipe/content identity, target dimensions,
compiler version, frozen scale/rebuild policy, physicality claim, and source
stage identity for 15 required roles:

- dense source;
- render mesh;
- three fallback meshes;
- collision;
- base color, normal, roughness, AO, height, material-ID, fracture, and
  weathering-mask bakes; and
- reversible style output.

Planned records cannot claim paths, bytes, or output hashes. Complete records
require safe relative paths, positive byte lengths, SHA-256 identities, and
measured generated dimensions. The manifest itself has a verified SHA-256
identity. This format reserves the complete delivery contract; Checkpoint 2
does not claim those artifacts have been produced.

## Offline harness

`scripts/plan-rock-geology-v2.mjs` supports three mutually exclusive scopes:

```sh
node scripts/plan-rock-geology-v2.mjs --recipe recipe.json --output empty-dir
node scripts/plan-rock-geology-v2.mjs --family sedimentary --output empty-dir
node scripts/plan-rock-geology-v2.mjs --all --output empty-dir
```

`--family` accepts one of the three rock classes or one lithology ID. The output
directory must be empty so stale files cannot masquerade as current artifacts.
Each run emits canonical recipe, plan, and planned-manifest JSON plus an index.
No timestamps, absolute paths, build times, or scheduling order enter content
identities. The CLI says `contract-plan-only` in both stdout and the index.

## Verification result

The candidate gate ran 1,034 checks with zero failures:

- all 65 hero recipes (22 igneous, 26 sedimentary, 17 metamorphic) validate,
  round-trip losslessly, remain recursively immutable, and reproduce all ten
  stage identities;
- all ten random namespaces match their exact expected invalidation set;
- eleven field-invalidation cases change only the intended stages;
- repeated target-dimension plans are identical and a dimension change
  invalidates all physical stages;
- 16 intentionally invalid fixtures fail with structured paths/remediation,
  including bedded granite, unsafe artifact paths, chronology cycles, duplicate
  streams, wrong scalar types, and simulated nondeterministic cache output;
- v0→v1 migration reproduces the canonical v1 granite recipe exactly;
- the second execution of an unchanged ten-stage plan is ten cache hits with no
  executor calls; and
- CLI one/family/all runs produce 1/26/65 plans, with identical repeated all-run
  index identity.

The complete audit, tables, CLI transcript, migration fixtures, dependency
graph, manifest examples, and visual summary are in
`artifacts/research/rock-geology-v2/checkpoint-02-recipe-compiler-contract/`.

## Limits carried into Checkpoint 3

- Stage executors are interfaces only. They currently produce no scalar field,
  mesh, texture, collision hull, or style asset.
- The artifact manifest's complete example contains synthetic test hashes and is
  labeled a fixture; it is not production output.
- Platform-independent binary reproducibility is not claimed. Checkpoint 2
  proves canonical plan identity on the supported local Node runtime. Binary
  determinism must be qualified when each executor exists.
- The provisional runtime transform envelope remains `[0.75, 1.5]` with maximum
  axis ratio `1.2`; it is metadata, not a shipping guarantee. Later family/scale
  tests must replace it with measured limits or recompile-only behavior.
- Checkpoint 3 must still reject or select the actual topology-safe mesher. No
  current Surface Nets result is grandfathered by this contract.
