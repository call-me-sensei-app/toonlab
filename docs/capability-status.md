# What ToonLab 0.5.0 can and cannot do

This page is the public expectation contract for `@call-me-sensei/toonlab`
0.5.0. It describes the result a developer should expect from the supported
workflow, regardless of whether they write the integration themselves or use a
coding agent.

## Executable walkable reference

`/examples/walkable-reference/` is the canonical Scene Three implementation. It
is an independent scene file rather than another option inside Playground. It
uses public package entry points for the character runtime, semantic style
labels, strict style-bundle application, surface placement, conservative
collision, official 480-rock loading, meadow LOD, sky/cloud conditions, water,
shared shadows, and the per-domain shader inspector. The page lets developers
change time, load a character URL, select an available style bundle, and return
to Labs. Legacy `playground/?scene=water` links redirect to this reference.

The example is deliberately a reference integration, not a promise that the
package invents scene composition or semantic material intent from unlabeled
content. The host supplies objects and layout; ToonLab validates labels and
applies the supported runtime behavior consistently.

## The short version

For a correctly constructed and semantically labeled Three.js scene, ToonLab
0.5.0 can apply the Call Me Sensei bundle and establish the approved visual
baseline without scene-specific shader tuning. It coordinates the supported
sky, clouds, sun, sky fill, shadows, character treatment, manufactured
surfaces, rocks, ground, grass, trees, flowers, water, and post domains.

ToonLab cannot take arbitrary unlabeled meshes and reliably invent a polished
level. The host still supplies coherent geometry, scene layout, asset choices,
semantic material labels, gameplay, and cameras. Strict mode detects missing
or unsafe contracts and stops before mutation; it does not hide uncertainty by
guessing.

The OSS MCP can also use developer-supplied provider keys for local image and
3D generation. Meshy 7 supports image-to-3D and 2–4-image multi-view input.
Text-to-Meshy is intentionally a two-stage workflow: ToonLab creates a concept
PNG/JPEG with the selected `image_model`, then submits it to Meshy and tracks
both stages. Tripo remains available for direct text/image/multiview generation
and model segmentation. ToonLab Pro adds managed credentials, credits, durable
workers, OAuth, and cloud persistence; Meshy itself is not Pro-only.

## Supported first-pass contract

The expected first-pass result applies when the scene provides all of the
following:

- a renderer, scene, camera, frame loop, and valid renderable geometry;
- authored terrain shape and XZ layout, including the intended water footprint;
- a stable target ID and rendering domain for every style-aware root;
- a stable material ID and semantic role for every renderable material slot;
- package factories or documented adapters for the systems being requested;
- supported source textures and intentional custom-renderer exemptions; and
- strict preflight, runtime readiness, and visual review before handoff.

With that contract in place, one strict Call Me Sensei bundle application owns
these defaults:

| ToonLab owns after strict application | The host still provides |
| --- | --- |
| Partly-cloudy Call Me Sensei sky and coordinated clouds | Scene layout and camera composition |
| Renderer look, sun, blue sky fill/light probe, exposure, shared sun shadows, and visible-cloud shadows | Renderer construction and the frame loop |
| Character material treatment and automatic static-scene collision consumption through the shared character runtime | Movement intent, gameplay, and dynamic physics |
| Manufactured, rock, ground, tree, grass, flower, water, and post routing | Stable root/material labels and unresolved overrides |
| Authored-first generated-tree bark selection, with a registered Call Me Sensei fallback and shared-pass cast/receive defaults | Imported tree UVs/textures, species identity, and any deliberate profile override |
| Source albedo/normal/ORM preservation for supported assets | Valid source maps, UVs, geometry, and asset provenance |
| Grass adoption of the ground's final lit/shadowed color, canonical meadow recipes, LOD, and finite-water exclusion | Terrain shape, surface bounds, density region, and water placement |
| Anime water appearance, shoreline connection, finite underwater volume, and shared shadow response for water, foam, breakers, caustics, and direct-sun glints | The intended coast, closed bed, and underwater level design |
| Reversible per-domain inspector toggles and exact pre-ToonLab restoration | Final artistic approval |
| Conservative, reversible collision for labeled trees, rocks, manufactured surfaces/environments, and props | Precise custom colliders, dynamic bodies, navigation, and gameplay rules |
| Searchable saved-object metadata through Library UI and MCP, with durable normalized tags | Meaningful names, descriptions, and tags chosen by the developer or agent |

If a required label, material role, texture lineage, shadow participant, sky
view, ground relationship, or water relationship is missing, the supported
behavior is to report the specific problem and fail closed. A build completing
or a scene rendering is not the same as passing this contract.

In 0.5.0, the visible Sky System cloud bake is the authoritative cloud-shadow
source. Supported ground, vegetation, character, rock, manufactured, and water
receivers consume that same transmittance map. Foam remains readable but cools
and dims inside shadow; direct-sun caustics, specular, and sparkle cues are
suppressed. A consumer must not add a second procedural cloud-shadow field.

For a package-generated `StylizedTree`, an authored trunk map wins. If none is
present, the Call Me Sensei preset or bundle selects
`call-me-sensei-bark-v1`; developers and coding agents may enumerate and pick
another registered profile. All generated trunks cast and receive through the
shared shadow pass by default, and exact consumer qualification requires every
labeled tree target to appear in coverage telemetry.

## What 0.5.0 does not automate

ToonLab 0.5.0 does not currently:

- design an attractive terrain, coastline, cliff, biome, or underwater habitat;
- choose, transform, bury, overlap, or compose assets into a convincing level;
- guarantee correct semantic classification for arbitrary imported materials;
- repair broken topology, UVs, source textures, rigging, or animation data;
- infer precise compound collision, navigation, gameplay, camera behavior, or streaming; or
- replace multi-view visual review with telemetry or a single screenshot.

Local generation also does not hide provider differences: Meshy does not
segment models, and a text prompt cannot bypass its required concept-image
stage. Call `get_generation_capabilities` before selecting a provider or model.

These are explicit product boundaries. They are not tasks that a style bundle
quietly performs.

## Imported-asset labeling: measured results

The current qualification used three real CC0 assets with six material slots:

- exact semantic identification: **6/6 (100%)**;
- automatic material readiness: **5/6 (83.33%)**;
- automatic whole-asset readiness: **2/3 (66.67%)**; and
- assisted whole-asset readiness: **3/3 (100%)** after one explicit metal
  override on a street lamp.

The blocked automatic result is intentional. Its material class was plausible
but below the production confidence threshold, so strict mode requested a
developer decision instead of silently applying a potentially wrong shader.
These measurements must not be described as universal accuracy guarantees.

## With or without a coding agent

The runtime contract is identical in both workflows.

- **Without an agent:** follow the public factory, labeling, strict-application,
  audit, and readiness APIs documented here and in Styles & Bundles.
- **With an agent:** install the shipped ToonLab skills and require the agent to
  inventory every root and material, preserve source maps, label every slot,
  use strict mode, resolve reported uncertainty, and show the running result.

An agent following those instructions should not need a developer to dictate
Call Me Sensei sky colors, rock response, grass/ground coupling, shadow policy,
or water appearance again. It still needs a scene brief and must ask about
genuinely ambiguous content rather than inventing an answer.

## How to verify a new scene

Before calling the result complete:

1. Run `auditSceneStyleContract()` in strict mode before mutation.
2. Apply the bundle through `createSceneStyleRuntime()` with scene-label
   discovery and `mode: 'strict'`.
3. For heightfield scenes, use `createSceneSurfaceRuntime()` and call its
   readiness assertion after the shared shadow and visible-color ground-field
   passes update. The audit rejects an albedo-only grass-adoption field.
4. Require the style inspector's cloud-shadow diagnostic to report
   `sky-system-volumetric-transmittance` and `ToonLabCloudShadowMap` before
   accepting the scene as ready.
5. Toggle every discovered domain off and on and verify exact restoration.
6. Review both WebGPU and the TSL WebGL2 fallback from gameplay, shadow, sky,
   shoreline, underwater, and distance-LOD views relevant to the scene.

If any of these steps fails, the scene is not bundle-ready even if it looks
acceptable from one camera.

## Broader product boundary

ToonLab is strongest as a focused anime rendering and content-integration
toolkit for a scene whose layout and major geometry already exist. It can make
that scene substantially more coherent and attractive with Toon, Environment,
Ground, Rock, Tree, Grass, Flower, Water, and Post treatments. It can also help
a developer find, validate, download, and reuse assets.

ToonLab does **not** currently make a coding agent reliable at constructing a
complete polished world from one prompt. Terrain composition, cliff formation,
coastlines, beaches, underwater habitat, biome layout, lighting, camera,
gameplay, and final art direction remain difficult scene-design tasks. A public
runtime export or a repository lab is not evidence that an agent can combine
those tasks into a production-quality result.

This is a product-maturity boundary, not a statement about semantic-versioning:
some experimental systems already have public APIs so they can be tested. The
API may work while the end-to-end authored outcome is not yet a recommended
workflow.

## Recommended uses

### 1. Style an existing scene

Use ToonLab on already identified objects and surfaces:

- toon/cel shading for characters, clothing, equipment, and suitable hero
  props;
- Environment treatment for manufactured scene assets and ordinary glTF
  materials;
- Ground and Rock shaders for existing terrain and rock geometry;
- Tree, Grass, and Flower shaders plus `StylizedTree`/`BranchTree` construction
  and first-party procedural grass surfaces; authored tree recipes are
  discovered through MCP rather than bundled as npm assets;
- Water on a host-authored footprint with a continuous shore and closed seabed;
- restrained Post treatment after materials, lighting, and composition work.

The host still owns target classification, transforms, cameras, controls,
dynamic physics, navigation, render-loop order, and final visual approval. When the host opts
into `createSceneStyleRuntime()`, ToonLab owns the bundle's default sun,
sky-light probe, shadow policy, grass/ground field, and sky/cloud/water/post
coordination. A host may still supply and explicitly adapt its own lighting.

For a host-authored heightfield, `createSceneSurfaceRuntime()` is the supported
high-level coordination path. The host keeps terrain shape and authored XZ
layout; ToonLab derives ground Y, grounds bounds-based props, produces
terrain-aware grass, constructs water with the same bed/shore contract, and
fails readiness on lost textures or incomplete required shadow coverage.

`createSceneStyleRuntime()` also creates the default static collision service.
Labeled solid domains receive conservative collision, generated trees use
their trunks, and `createWalkableCharacterRuntime()` consumes the bound service
without per-scene wiring. See [Collision defaults](collision.md) for explicit
`none`, blockers, convex/trimesh, custom-adapter, and Rapier integration rules.

### 2. Find and reuse assets

Use the ToonLab Gallery, the local official catalog, a project library, or
policy-permitted open sources. Select with metadata before downloading:
dimensions, family/profile, taxonomy, license, provenance, review status, and
stable immutable file URLs. Preview finalists in the real scene because tags
and thumbnails cannot prove scale, silhouette, material separation, or anime
fit.

### 3. Use ToonLab through MCP

Both supported MCP surfaces are useful:

- ToonLab OSS local MCP searches the project/workspace/library, the released
  official catalog, and supported open sources; it also reads and saves
  portable presets and files.
- ToonLab Pro remote MCP searches the project/cloud library, the ToonLab public
  Gallery, and its supported external indexes, and may provide managed
  generation when policy permits it.

Feature-detect the connected surface. Do not prescribe Pro tools to an OSS-only
user or OSS-only tools to a Pro user. Use MCP for discovery, metadata,
provenance, files, and shared state; use package APIs for runtime shading and
focused deterministic construction.

Saved Library objects use the same discovery vocabulary as Gallery assets.
Names, descriptions, types, and durable tags are searchable from the browser
and MCP. Tags are canonical ASCII lowercase slugs, and both result surfaces
are paginated rather than silently truncating the Library. A coding agent must
follow `nextOffset` until it is null and save meaningful semantic tags whenever
it creates a reusable object.

### 4. Author and reuse focused assets and settings

The current practical authoring workflow also includes:

- portable shader, system, and style-bundle documents;
- the schema-driven tuning/debug panel;
- focused procedural grass, tree, flower, rock, debris, and texture outputs
  after their individual lab/quality gate has passed;
- model loading, character rig adapters, animation helpers, and the public-R2
  mannequin qualification fixture;
- deterministic regression tests and clean-package verification.

Use each feature independently against a known input. Do not treat the list as
an automatic scene-composition system.

## Experimental uses

The following are research, qualification, or host-owned work for now:

- generating or assembling a complete game scene from one prompt;
- procedural terrain as final art direction rather than a test foundation;
- natural cliff, gorge, sea-stack, cave, beach, coastline, village, path, or
  biome construction;
- automatic rock selection, transformation, burial, overlap, and formation
  planning across a whole level;
- automatic ecological placement and transition design;
- automatic underwater habitat and coastline continuation;
- full-world Lighting, Weather, Climate, camera, VFX, game-feel, navigation,
  physics, and streaming composition;
- automatic Sky, Cloud, Lighting, and Weather composition across an entire
  scene; the focused Sky and Cloud Labs themselves are live;
- any workflow whose success claim is based only on a build, scene-graph count,
  or one screenshot.

The `outdoor-world`, `karst-cliff-construction`, and visual research guidance
remain valuable for experiments and for documenting missing capabilities. They
must not be presented as evidence that ToonLab can reliably build a polished
outdoor world today.

## Recommended agent brief

Give an agent a bounded integration task over a supplied scene, for example:

> Use ToonLab to stylize this existing Three.js scene. Inventory and
> label the character, manufactured, ground, rock, tree, grass, flower, water,
> and post targets. Reuse project assets first, then use whichever ToonLab OSS
> or Pro MCP surface is connected to fill named asset gaps. Apply only the
> matching public runtimes, preserve provenance, run the app, and verify the
> result from the supplied cameras. Do not redesign the terrain, coastline,
> biome, lighting, camera, or gameplay unless I request an experiment.

Prefer multiple small tasks—one material family, asset role, vegetation field,
or water body at a time—over a single instruction to build an entire world.

## Choosing a workflow

Use the 15 live Labs for focused authoring and the documented npm entry points
for focused runtime use. Treat an example scene as a demonstration, not as an
additional Lab or a promise of automatic world construction.
