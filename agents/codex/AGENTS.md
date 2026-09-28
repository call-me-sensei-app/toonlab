# ToonLab Agent Guide

Use ToonLab's public runtime to develop the game the user requested. Build the
host game systems when needed; “host-owned” means your application implements
that part, not that the task must be refused or called an experiment. Preserve
existing gameplay and layout unless the request authorizes changing them.

## Find the installed contract

Resolve `@call-me-sensei/toonlab` in this project and read its `package.json`
version and export map. In this guide and the feature skills, `agents/...` and
`NPM-LIBRARY.md` are relative to that package root, normally
`node_modules/@call-me-sensei/toonlab/`, not the game repository root. In a
workspace with hoisted dependencies, resolve the installed location first.

Start with `NPM-LIBRARY.md`, `agents/references/runtime-entry-points.md`, and the
`game-dev` skill. Read other skills only for the systems the task uses. The
installed package has the supported guides and references; a source checkout,
Lab UI, Pro account, and generative AI are not prerequisites for building a game.
Do not overwrite the game's existing agent instructions when installing this guide.

## Divide responsibilities correctly

| Application work | ToonLab support |
| --- | --- |
| Game rules, input, camera, UI, objectives, spawning, scene layout, navigation, dynamic physics, networking, persistence | Host code composed with the runtime; do not invent ToonLab APIs for these |
| Renderer construction, resize, frame loop, shutdown | `renderer` helpers and scene-style configuration; use Three's `WebGPURenderer` for TSL, including its WebGL2 fallback |
| Character loading, rig/clips, conversion, animation update/disposal | `createCharacterRuntime()`; `createWalkableCharacterRuntime()` connects locomotion and grounding to host movement/physics |
| Terrain-bound placement, grass, shore and water-bed coordination | `createSceneSurfaceRuntime()` when the host supplies a heightfield |
| Labeled static blockers | `createSceneStyleRuntime().collision`; use explicit collision metadata or the Rapier adapter where needed |
| Coordinated lighting, sky inputs, ground field and shared shadows | `createSceneStyleRuntime()` and the public `lighting` domain |
| Materials, vegetation, water, sky/cloud, post and procedural assets | Focused exports listed in `agents/references/runtime-entry-points.md` |

A hand-built level is valid application work. Reliable automatic world layout,
terrain/geology synthesis, navigation, camera controllers, gameplay VFX and the
experimental species engine are not promises of the npm package. Do not import
repository-only implementations or turn a Lab route into a runtime dependency.

## Build in useful increments

For a new game, make a playable vertical slice first: controls, movement,
collision, camera, one objective, and restart. Then apply the selected art
direction and add assets. For an existing game, integrate the requested domains
without replacing its renderer or update loop unnecessarily. The `game-dev`
skill gives the integration order and the frame ownership contract.

Use focused package imports. Choose the selected bundle's treatment explicitly;
Call Me Sensei is the first-party default when the user has not chosen another.
Its bundle ID is `call-me-sensei`; many domain preset/style selectors instead
use `call_me_sensei`. Use the documented selector for each API.

Use `style-presets` before style-aware construction.
For anime treatment, read `agents/references/anime-art-direction.md` and
`agents/references/style-bundles.md`. Preserve source PBR maps and material
identity. Realistic rock maps are valid asset inputs and may also be the user's
requested output; do not confuse them with an accidentally unstyled anime scene.

Label style targets by domain and give every material slot a stable material
ID and semantic role. A root-only label is incomplete for a multi-material
asset. Strict mode blocks incomplete coverage. Use the manufactured-material proposal/review/apply
helpers for imported props. Report automatic and assisted results separately.
Do not infer a physical material solely from its color or filename. Split mixed
atlases or supply the required mask. Strict style application must reject
incomplete coverage before mutation; advisory results must disclose gaps.

Apply scene-wide styles through `styleRuntime.apply(...)`. It manages the
lighting, renderer, shadow, and collision integrations as well as material
transactions. Use the lower-level `applyStyleBundle()` only when the app owns
those integrations deliberately. A `createStyleTarget()` descriptor alone is
not durable labeling: use `labelStyleTarget()` for scene-label discovery.

## Assets and MCP

Use `asset-sourcing` when discovering/importing assets or requesting generation.
Inspect the connected server's tool schemas: local and Pro tools with the same
name can mean different things. Follow the project's actual policy; the strict
acceptance fixture is not a universal rule for every game.

Reuse project/Library assets, shortlist Gallery results from metadata, then
retrieve selected artifacts. Preserve IDs, license, provenance, dimensions,
recipe and seed. First-party rock dimensions and taxonomy support shortlisting
without rendering GLBs just to measure them. Use returned IDs and public labels;
internal production identifiers are not product names.

MCP also creates and mutates portable Lab documents. Call `list_live_labs`,
`get_lab_features`, then `create_lab_document`; its result wraps the portable
JSON in `document`. Save through the relevant Library tool when persistence is
part of the task. A valid document does not guarantee its preview or generated
asset has passed visual review.

Local `generate_asset` is procedural; local provider work uses
`generate_ai_asset` and the user's keys. Pro `generate_asset` spends separately
purchased credits. A free Pro month grants MCP access without AI credits.
Generation capability is not permission to spend; follow existing authorization
and the server's sourcing-policy requirements. Keep provider keys out of source
and portable documents.

## Verify and hand off

Test through the app's real input and render path. Run its applicable checks,
wait for asset/render readiness, inspect the console, and capture the requested
views. Test restart/teardown and verify that listeners, resources, and animation
loops are not duplicated. Each system has one update owner and each frame has
one final render owner. Read `visual-verification` for a visual review.

For a heightfield scene, run the shared surface audit after the required passes
have rendered. Run `styleRuntime.collision.assertReady()` before relying on its
blockers. Test actual movement around representative obstacles. Include LOD,
shadow and shoreline views only when those systems are used.

Record missing package capabilities and material-policy exceptions when they
matter to the requested result. Ordinary host gameplay code is not a ToonLab
failure. Report what works, what was tested, and any remaining limitation;
never describe a build alone as a finished or visually approved game.
