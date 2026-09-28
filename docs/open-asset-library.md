# Open asset library and scene coverage

This document defines how ToonLab should build and use a production-quality
library of CC0 and CC-BY assets.

The objective is not to claim that a finite catalog contains every object a
developer could imagine. The objective is to make common game scenes
constructible from accepted assets and reliable generators without forcing a
developer to browse a gallery or spend credits for every object.

Use capability routing, not one universal acquisition order:

```text
reuse an accepted project asset
  -> if an approved generator reliably covers the role:
       generate from its curated stylized base set
     otherwise:
       select or adapt an asset from the curated open library
  -> use image-to-3D for a specific remaining gap
  -> commission or hand-author when quality or rights require it
```

The open library and gallery are not mandatory stops. They are discovery and
gap-filling tools. A deterministic generator that reliably produces better
style fit, labels, LODs, collision, and variation should be preferred for its
supported asset family.

The style contract still applies. An asset is not accepted merely because its
license is open or its source model looks attractive. It must be prepared,
labeled, routed, and verified with the Call Me Sensei bundle.

See [Styles, style bundles, and asset routing](styles-and-bundles.md).

## Product principles

1. **Reuse first.** Search accepted local and shared assets before creating a
   duplicate.
2. **CC0 first, CC-BY second.** Prefer assets with the lowest downstream
   compliance burden when quality is comparable.
3. **Quality before raw count.** A smaller library of useful, labeled,
   performant assets is more valuable than thousands of unreviewed downloads.
4. **Kits before isolated objects.** A coherent kit produces a scene; an
   attractive one-off model often does not.
5. **Use proven generators directly.** Gallery search is unnecessary when an
   approved procedural family reliably satisfies the requested role.
6. **Provenance is part of the asset.** License and source metadata must
   survive download, conversion, optimization, relabeling, and export.
7. **Style readiness is measurable.** Every accepted model has a rendering
   domain, material roles, support level, collision/LOD status, and a reviewed
   Call Me Sensei result.
8. **Image-to-3D fills specific gaps.** It should not replace a reliable
   procedural family or a suitable accepted asset.

## What “enough assets” means

Coverage is measured by scene grammar rather than total asset count.

A typical playable scene needs:

- Ground and terrain surfaces.
- Structures and architectural modules.
- Paths, roads, stairs, bridges, curbs, and boundaries.
- Doors, windows, roofs, trim, railings, and signs.
- Furniture and functional props.
- Small clutter and storytelling props.
- Vegetation and natural forms.
- Rocks, debris, and terrain transitions.
- Vehicles or transport where appropriate.
- Characters, equipment, fauna, and animation.
- Light fixtures and emissive props.
- Sky, water, weather, VFX, decals, and ambient dressing.
- Collision, LODs, and placement metadata.

A scene family is covered only when these roles can be filled coherently. Ten
chairs do not compensate for missing walls, doors, paths, or lights.

Coverage may be satisfied by accepted ready-made assets, an approved
procedural family, or both. The coverage manifest must say which route owns
each role.

### Minimum viable scene kit

For each scene family, target at least:

| Asset family | Minimum target | Notes |
| --- | ---: | --- |
| Ground and surface materials | 8 | Include clean, worn, and transition-compatible surfaces |
| Structural modules | 12 | Walls, floors, roofs, openings, corners, stairs, boundaries |
| Complete structures | 4 | Small, medium, large, and landmark or service structure |
| Circulation pieces | 8 | Paths, roads, curbs, steps, bridge/ramp, barriers |
| Furniture families | 12 | Families may contain several size or material variants |
| Functional props | 20 | Storage, tools, appliances, utilities, containers, fixtures |
| Clutter and storytelling props | 20 | Repetition-safe small objects with several variants |
| Light and emissive fixtures | 6 | Interior and exterior coverage |
| Vegetation or natural forms | 8 | When the scene family uses them |
| Rock, debris, and transitions | 8 | Edge breakup, rubble, ground integration |
| Vehicles or transport | 3 | When the scene family uses them |
| Decals, signs, and graphics | 8 | Must avoid uncontrolled brands and protected marks |

These are curation targets, not a requirement to ship twelve separate files.
A well-designed modular pack can satisfy several roles through variants. Every
accepted kit still needs visual review; reaching the count alone is not
completion.

### Priority scene families

Build coverage in this order:

1. **Natural outdoor:** temperate forest, alpine, coast, river/lake, desert,
   tropical, wetland.
2. **Rural and village:** farm, fishing village, mountain settlement, shrine
   or temple grounds, roadside services.
3. **Modern urban exterior:** residential, commercial street, alley, park,
   transit, industrial edge.
4. **Common interiors:** home, apartment, office, school, shop, restaurant,
   clinic, workshop, warehouse.
5. **Transport and infrastructure:** roads, rail, harbor, station, utility,
   construction.
6. **Historical and fantasy-neutral:** masonry, timber, market, fortification,
   dungeon/cave, ruins.
7. **Science-fiction-neutral:** modular corridor, industrial room, laboratory,
   hangar, generic machinery.

“Neutral” means the kit avoids a protected franchise identity and can be
restyled without misleading users about its origin.

## Curated stylized base sets

A procedural generator should not start from arbitrary gallery content on
every run. It should build from an approved, versioned base set: a compact
collection of shapes, modules, material roles, proportions, constraints, and
reference outputs that define the quality floor for one asset family.

Examples include:

- Structural modules and proportions for a building family.
- Trunk, branch, leaf-cluster, and silhouette grammars for trees.
- Body masses, fracture planes, and surface zones for rocks.
- Parts, attachment points, and material-role combinations for props.
- Construction profiles for roads, bridges, stairs, and boundaries.
- Palette and texture families that preserve the Call Me Sensei material
  language.

The base set is not a gallery that the user must browse. It is generator input
and validation data.

### Base-set document

Each base set should preserve:

- Stable id, version, domain, and supported kit roles.
- Source and rights provenance for every authored or imported input.
- Semantic material roles and allowed combinations.
- Modular parts, attachment points, dimensional constraints, and scale.
- Shape grammar and controlled variation ranges.
- Topology, UV, texture, LOD, collision, and performance requirements.
- Condition-mask requirements.
- Call Me Sensei reference settings and expected support level.
- Golden seeds and reference renders used for regression tests.
- Compatible generator versions and migrations.

Inputs whose license does not permit the intended transformation,
redistribution, or downstream use must not enter an OSS-distributed base set.
The generated output must retain any required attribution and modification
notices from its inputs.

### Pro and OSS boundary

ToonLab Pro may provide internal tools to discover candidates, author a
stylized base set, compare generated families, store reviews, and expand the
set with image-to-3D or other managed generation.

The useful result must remain portable:

- The approved base-set document.
- Any redistributable source modules.
- Generator recipes and seeds.
- Semantic labels.
- License and attribution records.
- Reference renders and acceptance metadata.

OSS runtimes and labs should be able to import, validate, inspect, and use
those portable artifacts without writing to the Pro database. Hosted storage,
team review, managed generation, and publishing remain optional services.

### Generator reliability gate

A generator family is `approved` only when it:

- Produces valid geometry for all documented parameter ranges.
- Is deterministic for a fixed version, recipe, and seed.
- Inherits correct domain and semantic material labels.
- Produces required collision and LOD data or deterministic inputs for them.
- Stays within recorded draw-call, triangle, memory, and texture budgets.
- Avoids systematic intersections, floating pieces, open seams, and unusable
  pivots.
- Produces meaningful silhouette and proportion variation rather than
  superficial noise.
- Preserves asset identity separately from style and runtime condition.
- Passes the Call Me Sensei reference review matrix.
- Reports parameter combinations it cannot support instead of emitting a
  broken asset.

Before this gate passes, generation is an authoring experiment. After it
passes, the generator may satisfy coverage without gallery search.

### Base-set expansion loop

Use the base set to improve procedural quality systematically:

```text
identify a missing kit role or weak variation
  -> find, author, or generate a high-quality candidate
  -> verify rights and technical quality
  -> label and normalize it into the base-set grammar
  -> generate a controlled family of variations
  -> review golden seeds with Call Me Sensei
  -> accept the new base-set version
```

Do not put every generated candidate into the base set. The base set should
contain the smallest high-quality grammar that produces broad useful
variation.

## Source policy

The source registry in `src/assetlib/sources.js` is the runtime source of
truth. It records integration capability, license family, quality tier,
restrictions, moderation state, and intended use.

As of July 26, 2026, the primary candidates are:

| Source | License policy | Best use | ToonLab posture |
| --- | --- | --- | --- |
| [Poly Haven](https://polyhaven.com/license) | Assets are CC0; use of the live API has separate identification and credit conditions | Reference-quality models, textures, and HDRIs | Enabled reference source; stylization and optimization still required |
| [ambientCG](https://ambientcg.com) | CC0 | PBR materials, some HDRIs and models | Enabled reference source |
| [Project PLATEAU](https://www.mlit.go.jp/plateau/site-policy/) | PDL 1.0 with required source notice; CC BY 4.0-compatible | Japanese buildings and city context | Enabled reference source with mandatory provenance |
| [Poly Pizza](https://poly.pizza) | Per-asset CC0 or CC-BY | Authored low-poly models and broad prop coverage | Mixed-quality source; curate individual assets before enabling |
| [Open Source 3D Assets](https://opensource3dassets.com) | Per-collection license, currently filtered to exact CC0 | Environment sets and creatures | Candidate source pending visual curation |
| [Smithsonian 3D Open Access](https://3d.si.edu/explore/) | Per-record Open Access/CC0 filtering | Artifacts, fossils, scientific and museum objects | Candidate source; scan complexity and non-copyright rights need review |
| [Kenney](https://kenney.nl/assets) | Asset pages are CC0 | Coherent game-ready kits and broad utility coverage | Candidate source; use only packs that meet the reference quality bar |
| [Quaternius](https://quaternius.com) | Models are CC0 | Coherent low-poly packs, characters, animals, environments | Candidate source; atlas/material structure and style fit need review |
| [Sketchfab downloadable search](https://sketchfab.com/search?features=downloadable&type=models) | Per-model license; API requires end-user OAuth and platform/creator attribution | Long-tail manual discovery | Link-out only; do not build an unauthorized download proxy |

Source acceptance is not asset acceptance. An enabled source may contain an
asset that fails moderation, performance, topology, semantic labeling, or
style quality. A disabled source may contain individual candidates worth
reviewing.

The gallery is therefore optional:

- Skip it when an approved generator owns the requested kit role.
- Use it when a curated authored asset is faster, more accurate, or materially
  better than current generation.
- Use it to find candidates for a missing base-set role.
- Never make gallery availability a runtime dependency for a procedural
  family.

### Source review cadence

Licenses, APIs, and platform terms can change. Before enabling a provider or
ingesting a new collection:

1. Read the provider's current official license and API/terms pages.
2. Record the review date and exact URLs.
3. Confirm whether licensing applies to asset files, previews, metadata, and
   API access separately.
4. Confirm automation, redistribution, caching, and attribution rules.
5. Test the integration with a small sample.
6. Keep the provider disabled until legal/provenance and quality review pass.

Never infer a site's license from a search-engine label, community post, or
the license of a different asset on the same site.

## Accepted licenses

The default curated library may accept:

- **CC0** and equivalent public-domain dedications.
- **CC BY 4.0** or another explicitly approved attribution license when the
  pipeline can satisfy every term.
- Provider-specific open-data terms that have been reviewed and mapped to
  required attribution behavior, such as PLATEAU's PDL 1.0 policy.

Do not put NC, ND, SA, editorial-only, personal-use-only, or unclear-license
assets into the default redistributable library. A project may make a separate
decision for its own private assets, but the license must remain explicit and
must not be presented as a ToonLab-open asset.

### CC-BY record

For every CC-BY asset, preserve:

- Source-native asset id.
- Title, when supplied.
- Creator and any designated attribution party.
- Original asset page URL.
- License name, version, and canonical URL.
- Copyright and disclaimer notices supplied with the asset.
- A statement that the asset was modified, when applicable.
- Previous modification notices.
- Provider-required credit or branding.
- The exact source files and ingestion date used.

The credits system must be able to produce a human-readable notice from this
record. Attribution must follow the asset into composed scenes, exports, and
distributed creations. Do not depend on a developer remembering it later.

CC BY does not imply endorsement. Credits must not present ToonLab or the host
project as affiliated with the creator.

### Rights outside copyright

CC0 and CC-BY do not automatically clear:

- Trademarks and logos.
- Patents or protected product designs.
- Publicity and personality rights.
- Privacy rights.
- Cultural-property or site-specific restrictions.
- Rights in background artwork, labels, photographs, or embedded media.

Flag recognizable people, brands, copyrighted characters, real-product
trade dress, and sensitive cultural objects for review. When doubt is
material, reject the asset from the default catalog.

## Curation pipeline

An asset moves through explicit states:

```text
discovered
  -> license verified
  -> downloaded with provenance
  -> technically inspected
  -> optimized and converted
  -> semantically labeled
  -> styled and audited
  -> reviewed in a composed scene
  -> accepted into a scene kit
```

### 1. Discover against a named gap

Every search starts from a coverage item, such as:

- “modern urban / street utilities / transformer”
- “apartment interior / kitchen / countertop appliance”
- “temperate forest / ground transition / fallen branch”

Do not collect assets simply because they look interesting. Record which scene
family and kit role the candidate is intended to satisfy.

### 2. Verify license and provenance

Use per-asset metadata, not only provider defaults. Save the source page and
license data before transforming the file. If the source does not provide
enough information to redistribute or comply with attribution, do not accept
the asset into the shared library.

### 3. Inspect technical quality

Record:

- File formats and dependency layout.
- Geometry count, draw calls, triangle count, and scale.
- UV quality and texture resolution.
- PBR maps and packed-map conventions.
- Baked lighting or photographic artifacts.
- Rig, animations, blend shapes, and skeleton license coverage.
- Transparency, double-sided surfaces, and custom shader dependencies.
- Naming, hierarchy, transforms, pivots, and origin.
- Collision and LOD availability.

Reject or repair broken normals, missing textures, extreme hidden geometry,
unusable topology, unsafe external dependencies, and unexplained scale.

### 4. Normalize without destroying identity

Convert to the project's runtime format, set units and axes, generate
appropriate LODs/collision, and cap textures according to role and quality
tier. Preserve source materials and maps before any stylization pass.

Keep deterministic conversion settings in the asset record so the accepted
result can be rebuilt from the licensed source.

### 5. Label for routing

Apply the domain and semantic-material contract from
[Styles, style bundles, and asset routing](styles-and-bundles.md).

Mixed atlases require material splits, an ID mask, or an explicit compatibility
classification. Name-based inference may propose labels during intake but
must not be the only durable record.

### 6. Verify Call Me Sensei

Review the asset with:

- Its canonical domain shader.
- The full Call Me Sensei bundle, including reference lighting and post.
- Near, gameplay, and distant cameras.
- Neutral daylight, warm low-angle light, night, and wet/rain conditions.
- The intended quality tiers.

Assign one support level: contract-ready, clean PBR first pass,
mixed-atlas compatibility, or bespoke.

### 7. Accept into a kit

An accepted entry must state:

- Which scene families and kit roles it covers.
- Which variants are meaningful rather than cosmetic duplicates.
- Its license and generated credit.
- Its domain and material labels.
- Its performance budget, LODs, and collision.
- Its Call Me Sensei support level.
- Its moderation status.
- Its source and rebuild instructions.

An isolated asset that does not fill a coverage gap may remain discoverable
without being promoted into a curated scene kit.

## Coverage manifest

The asset library should maintain a machine-readable coverage manifest. Each
row represents a kit role, not merely a downloaded file.

Recommended fields:

```js
{
  sceneFamily: 'modern-urban-exterior',
  kit: 'neighborhood-street',
  role: 'street-furniture.waste-container',
  status: 'accepted',
  fulfillment: 'generator',
  generatorFamily: 'manufactured.waste-container.v1',
  assetIds: ['generated/manufactured/waste-container/seed-42'],
  minimum: 2,
  acceptedCount: 2,
  licenses: ['CC0'],
  renderingDomain: 'manufacturedEnvironment',
  callMeSenseiSupport: 'contract-ready',
  gaps: [],
}
```

This is a target manifest shape, not a currently exported ToonLab document
schema. Version the public schema before other tools depend on exact property
names.

### Coverage states

Use these states consistently:

| State | Meaning |
| --- | --- |
| Missing | No viable candidate |
| Discovered | Candidate URLs exist; rights and quality not yet approved |
| License verified | Asset rights and provider terms recorded |
| Prepared | Downloaded, converted, optimized, and provenance preserved |
| Labeled | Domain and semantic material data complete |
| Styled | Call Me Sensei result and support level recorded |
| Accepted | Technical, rights, art, and kit review passed |
| Rejected | Candidate failed with a recorded reason |

Only accepted assets or approved generator families count toward production
scene coverage. A generator role should also list several accepted golden-seed
outputs so its quality is inspectable.

## Procedural generation route

### Procedural generation

Use procedural generation directly, without gallery search, when:

- An approved base set and generator family cover the requested kit role.
- Variation is more important than a unique authored silhouette.
- The asset is structural or parametric: rocks, debris, paths, terrain,
  vegetation scatter, buildings, or textures.
- A deterministic seed and editable recipe provide more value than a download.
- Generated outputs meet or exceed the style, topology, and performance bar of
  available open assets.

The generated recipe must receive the same domain labels, audit, and scene-kit
role as an imported asset. If the generator has not passed its reliability
gate, treat its outputs as candidates and compare them with curated open
assets.

### Image-to-3D

Use image-to-3D when:

- The missing object is specific and visually important.
- Search and procedural options have been documented as inadequate.
- The input image is owned, licensed for this use, or generated with recorded
  provenance.
- The project can budget for topology, UV, texture, scale, collision, LOD,
  semantic-material, and style cleanup.

Image-to-3D output is a candidate, not a production-ready asset. It follows
the full curation pipeline and may still be rejected.

### Hand-authored or commissioned work

Use hand authoring when the asset carries the project's identity, must animate
or deform precisely, needs exact gameplay dimensions, or cannot safely be
sourced/generated with sufficient quality and rights.

## Developer and coding-agent instructions

For every asset request:

1. Translate the request into a scene family and kit role.
2. Search accepted project assets and the coverage manifest.
3. If an approved generator family covers the role, generate from its approved
   base set and skip gallery search.
4. Otherwise, search curated CC0, then curated CC-BY candidates.
5. Compare two or three candidates for hero or repeated assets.
6. Verify the exact per-asset license and provider rules.
7. Import with provenance.
8. Normalize, label, audit, and verify with Call Me Sensei.
9. Use image-to-3D only if reliable procedural and curated open-asset routes
   are inadequate.
10. Update the coverage manifest with the selected fulfillment route and
    acceptance or rejection evidence.

An agent's completion report must include:

- The scene family and kit role.
- The selected route and why gallery search was used or skipped.
- Search terms and sources checked, when discovery was needed.
- Base-set id, generator version, recipe, and seed, when generated.
- Selected asset and rejected alternatives.
- Exact license and attribution output.
- Domain and material-role mapping.
- Support level and unresolved fallback.
- Performance, collision, and LOD status.
- Call Me Sensei verification scene and conditions.
- Coverage-manifest change.

Do not say “no asset exists” after checking only one provider. Do not say an
asset is reusable merely because it downloaded successfully. Do not browse a
gallery reflexively when an approved generator owns the role, and do not
generate an unreliable replacement merely to avoid curation.

## Implementation direction

The OSS asset experience should eventually provide:

- One searchable view across procedural catalog entries, accepted imports,
  project assets, and enabled open providers.
- Versioned stylized base-set documents and generator reliability status.
- Coverage filters by scene family and kit role.
- Per-record license and attribution rendering.
- A downloadable credits manifest.
- Domain/material label editing and audit results.
- Call Me Sensei support level and reference renders.
- Local curation and coverage-manifest editing with no database.
- Optional hosted base-set authoring, indexing, team review, previews, and
  managed generation without changing the portable asset and coverage
  contracts.

The current source registry and `.toonlab/imports` provenance manifests are the
foundation. Broad provider enablement must wait for curation, license review,
and Call Me Sensei verification rather than exposing an unreviewed firehose.
