# ToonLab by Call Me Sensei

ToonLab by Call Me Sensei is an anime rendering and content-integration toolkit
for [Three.js](https://threejs.org/). It is purpose-built for cel-shaded anime
games rather than generic stylization. It is strongest when you already have a
scene, level layout, or asset and want to apply coordinated
character, environment, ground, rock, vegetation, water, and post treatments
without building those shaders from scratch. It also provides focused asset
generators, a searchable Gallery, portable presets, and OSS/Pro MCP workflows.

ToonLab does **not** currently make a coding agent reliable at constructing a
complete polished world from one prompt. Terrain composition, natural cliffs,
coastlines, beaches, underwater habitat, biome layout, cameras, and final scene
art direction remain host-authored or experimental work. For an existing
labeled scene, the public style runtime coordinates the selected bundle's
lighting, sky probe, grass/ground coupling, sky/cloud/water, and post defaults.

Use ToonLab as a focused runtime library (`@call-me-sensei/toonlab` on npm), as
an asset/preset authoring workspace, or as an asset-discovery service—not as a
one-shot world generator.

## Versioned expectation: 0.5.0

For a correctly constructed and semantically labeled scene, one strict Call Me
Sensei bundle application is expected to establish the supported visual
baseline without scene-specific shader tuning: partly-cloudy sky and clouds,
renderer look, sun and blue sky fill, shared sun shadows and visible-cloud
shadows across every supported receiver (including water foam and direct-sun
highlights), character and material
routing, source-texture-preserving rocks, Ground Shader conversion,
meadow grass that adopts the ground's final lit/shadowed color with LOD and
finite-water exclusion, Anime water,
and reversible per-domain inspection.

The host still authors the level, geometry, asset selection and placement,
material labels, cameras, gameplay, dynamic physics, and navigation. Labeled
solid objects receive conservative static collision by default. Arbitrary
imported assets are not guaranteed to route automatically; strict mode blocks
uncertain contracts instead of guessing. The installed
[npm library guide](./NPM-LIBRARY.md) defines the complete shipped surface,
exclusions, agent setup, MCP setup, and package-first documentation paths.

## Recommended scope today

The recommended production workflow is:

1. **Style an existing scene** with Toon, Environment, Ground, Rock,
   Tree/Grass/Flower, Water, and Post runtimes. Water still needs a host-authored
   footprint, shore, and closed seabed.
2. **Find and reuse assets** from the project/library, released ToonLab Gallery,
   or policy-permitted open sources. Select by dimensions, taxonomy,
   provenance, license, review status, and immutable public URLs before
   downloading.
3. **Connect through ToonLab MCP**—ToonLab OSS local MCP, ToonLab Pro remote
   MCP, or both—for discovery, metadata, provenance, saved presets/files, and
   policy-aware imports.
4. **Author bounded outputs** such as portable settings, style bundles,
   procedural grass/trees/rocks/textures, model-loading integrations, and
   reusable exports.

Whole-world generation, terrain/biome/coast/cliff formation, automatic set
dressing, Weather/Climate composition, gameplay systems, and autonomous scene
classification belong under experimentation. The exact supported boundary and
a recommended agent brief ship in `NPM-LIBRARY.md` and `agents/PROMPTS.md`.

## Quickstart

**No install** — use the hosted Labs at **[toonlab.io](https://toonlab.io)**:
define character, vegetation, and environment shaders; author stylized assets;
tune Water, Sky, and Cloud; and export portable presets from the browser.

**As a library** in your own Three.js app:

```bash
npm install @call-me-sensei/toonlab
```

The package publishes declaration files for the root and every supported
subpath. TypeScript resolves them through each export's `types` condition. The
style-target, label, bundle-application, inspector, and official-catalog
placement APIs use exact contracts, including the closed style-domain union;
the remaining JavaScript surface uses source-inferred declarations with
permissive signatures only where inference cannot produce a valid public type.
Package verification compiles a clean packed consumer with `strict: true` and
`skipLibCheck: false`.

The npm artifact is self-documenting when the source repository is unavailable:

- `NPM-LIBRARY.md` is the versioned install, runtime, agent, MCP, and support
  boundary guide.
- `agents/PROMPTS.md` contains ready-to-paste supported prompts.
- The Codex, Claude Code, and Cursor guidance files are included under
  `agents/` alongside their paired feature skills.
- Live user documentation remains available at
  [toonlab.io/docs](https://toonlab.io/docs), including the
  [15 public Labs](https://toonlab.io/docs/labs),
  [MCP setup](https://toonlab.io/docs/mcp), and
  [settings reference](https://toonlab.io/docs/reference).

```ts
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createStyleTargetLabel,
  createToonLabInspector,
} from '@call-me-sensei/toonlab/styles';

const label = createStyleTargetLabel('natural.rock', {
  targetId: 'island/cliff',
});
const inspector = createToonLabInspector({ bundle: CALL_ME_SENSEI_STYLE_BUNDLE });

await inspector.setDomainEnabled(label.domain, false);
```

**Run the labs locally** (this repo):

```bash
git clone https://github.com/call-me-sensei-app/toonlab.git && cd toonlab
npm install
npm run setup
npm run dev
```

Setup starts local Postgres with Docker Compose, applies schema migrations and
official catalog seeds, and reports configured BYO-key providers. Set an
external `DATABASE_URL` to use an existing Postgres service instead. Vite
serves the labs at `http://127.0.0.1:5175`. See
[Getting started](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/getting-started.md) for a tour.

### Open the full documentation locally

After `npm run dev` is running, open **[http://127.0.0.1:5175/docs/](http://127.0.0.1:5175/docs/)**.
The Docs page links to the runtime reference, the 15 live Labs, MCP setup,
asset policy, style bundles, and the generated settings reference. Use the
language menu in the site header to choose one of the 22 Call Me Sensei
languages; the selected language is remembered in your browser.

### Complete local setup

Prerequisites:

- Git and Node.js 18 or newer.
- Docker Desktop on macOS/Windows, or Docker Engine with the Compose plugin on
  Linux. Use Docker's official installation guides for
  [macOS](https://docs.docker.com/desktop/setup/install/mac-install/),
  [Windows](https://docs.docker.com/desktop/setup/install/windows-install/),
  or [Linux](https://docs.docker.com/engine/install/).
- On macOS or Windows, open Docker Desktop once, finish its first-run setup,
  and wait until it reports that the Docker engine is running.
- At least one provider API key only if you want local AI generation. Browsing,
  editing, the Library, styles, and official catalog assets do not require one.

Install and configure:

```bash
git clone https://github.com/call-me-sensei-app/toonlab.git
cd toonlab
npm install
cp .env.example .env
```

Edit `.env` if needed:

```dotenv
# The bundled local database; leave this unchanged for the simplest setup.
DATABASE_URL=postgresql://toonlab:toonlab@127.0.0.1:55432/toonlab

# Optional server-side provider keys. Add only providers you use.
TRIPO_API_KEY=
MESHY_API_KEY=
MESHY_API_KEYS=
GEMINI_API_KEY=
FAL_KEY=
OPENAI_API_KEY=
ARK_API_KEY=
POLYPIZZA_API_KEY=
```

Then initialize and start ToonLab:

```bash
npm run setup
npm run dev
```

Open `http://127.0.0.1:5175`. `npm run setup` starts Postgres, waits for it to
be healthy, applies every missing schema migration, applies every missing
official catalog dataset, and reports which providers are configured. It is
safe to run again.

The local MCP server exposes the same configured image/3D providers through
`generate_ai_asset`, `get_generation_job(s)`, and `save_generated_asset`.
With `FAL_KEY`, `kind: "material"` creates a seamless Fal Patina preview and a
durable grouped PBR bundle (basecolor, normal, roughness, metalness, and height)
at 1K–8K instead of flattening the maps into unrelated image jobs.
Meshy text mode first generates a concept with the selected `image_model`,
then submits that PNG/JPEG to Meshy 7 as one trackable MCP job. The existing
`generate_asset` tool remains the deterministic procedural-recipe contract.

If setup reports that Docker Desktop is installed but not running, start it
and retry:

```bash
open -a Docker # macOS
npm run setup
```

ToonLab supports the normal `docker compose` plugin, Docker Desktop's bundled
Compose binary on macOS, and the legacy `docker-compose` command.

To use an existing Postgres server instead of Docker, set `DATABASE_URL` to
that server before running setup. ToonLab skips Docker and applies the same
migrations and catalog batches to the external database.

### Local Generate and Library

Open `/generate/` to use the same asset-generation workflow as ToonLab Pro
without accounts, credits, billing, or Character Setup. The local workspace
supports:

- Meshy 7 image-to-3D and multi-image-to-3D, including status polling and GLB
  downloads. Text prompts can run through a selected image model and chain
  into Meshy 7 automatically. Tripo remains available for direct text/image/
  multi-view generation and model segmentation.
- Gemini image, texture, and concept generation, including model,
  aspect-ratio, resolution, image-count, reference-image, reference-URL,
  previous-generation, prompt-enhancement, and automatic image-to-3D controls.
- Searchable generation history, full previews, bulk image-to-3D conversion,
  multi-view composition, prompt reuse, cancellation, and explicit saving to
  the Library.

Provider keys remain in `.env` and are read only by the local Node server.
Uploaded references, generated files, and provider downloads are stored as
opaque objects under `.toonlab/objects`; Postgres stores their metadata and
generation history. Saved generated assets appear in `/library/` with preview,
Open, asset-download, JSON-export, and delete actions.

Every meaningful Library save also creates an immutable local revision. Open a
creation in `/library/` to browse or download earlier documents, give important
versions a unique name, add version-only tags and notes, pin milestones, or
restore an earlier snapshot. Identical saves are deduplicated, and restore
always creates a new head revision instead of rewriting history. This revision
number is Library history; a document's own `version` field remains its portable
schema version. Style-bundle revisions also record the exact revisions of saved
documents referenced by their slots. Local runtimes can request the locked,
self-contained bundle with
`fetchStyleBundle('/api/toonlab/library/<bundle-id>/resolved')`; a missing lock
fails explicitly instead of substituting a newer dependency.

### Updating an existing installation

Use the same update sequence for every ToonLab release, whether it contains
application changes, database changes, new official assets, or all three:

```bash
git pull --ff-only
npm install
npm run update
```

Restart `npm run dev` afterward. `npm run update` is idempotent: it applies
only files that this database has not recorded yet. It does not recreate the
database, reset the Library, or delete local creations, drafts, files, styles,
bundles, or generation history.

Users do not need to inspect a release and choose a migration manually:

| Release content | Repository location | Applied automatically by |
|---|---|---|
| Database structure or behavior | `database/migrations/NNNN_name.sql` | `npm run setup` and `npm run update` |
| Official catalog metadata and immutable `https://assets.toonlab.io` R2 URLs | `database/seeds/catalog/NNNN_release.sql` | `npm run setup` and `npm run update` |
| Personal Library content | Local Postgres and `.toonlab/objects` | Never replaced by an official update |

Fresh installations receive the complete catalog by applying all versioned
seed batches in order. Existing installations apply only newer batches.
Catalog data therefore does **not** use a separate downloadable “current
seed,” and new datasets are **not** schema migrations. Keeping every released
batch in the repository gives fresh and upgraded installations the same final
catalog while preserving a simple, auditable upgrade path. The checked-in
catalog includes the original 480 first-party Stylized rocks, the 100-item
Nature Reference Rocks by ToonLab collection, and the verified open-asset
release. The two ToonLab rock collections keep distinct searchable identities.

Applied filenames and SHA-256 digests are recorded in `schema_migrations` and
`catalog_seed_batches`. Never edit, rename, or replace a released migration or
seed file; add the next numbered file instead. The updater intentionally stops
if an already-applied file has changed.

Advanced troubleshooting commands are available, but are not required for a
normal installation:

```bash
npm run db:migrate # apply schema files only
npm run db:seed    # apply catalog dataset files only
```

**Building with an AI coding agent?** That is the fastest path through all of
this — see [Build with an AI coding agent](#build-with-an-ai-coding-agent)
for the recommended setup (skills + MCP) and ready-to-paste starting prompts.

### Local MCP server

Running the labs locally also creates a Postgres-backed `.toonlab/` workspace
shared by the browser tools and the included MCP server. Structured records
live in Postgres; `.toonlab/objects` contains opaque local binaries. Open
`http://localhost:5175/settings/` for a checkout-specific configuration you
can paste into an MCP-compatible coding tool.

```bash
npm run dev
# In an MCP client, use the command/config shown at /settings/.
```

The local server can search your workspace, the public ToonLab Gallery, the
released official catalog, and public CC0 sources; read saved presets and
exported files; generate approved seeded recipes; and import assets into the
project. Authored Gallery recipes are fetched with their public license and
provenance instead of being copied into the npm package. The server uses stdio,
requires no account or OAuth for public discovery, and keeps local work local.
See [Local MCP and workspace](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/mcp.md) and
[Local database and public asset releases](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/local-database-and-public-assets.md).

## The labs

Lab UIs are development tools and are not published in the npm package. The
Labs home (`/`) presents the 15 live user-facing Labs by the artifact they
author. Every Lab can save and reopen its documented portable creation type;
preview cameras, stages, lights, playback, and comparison helpers remain
preview-only. See [The 15 live ToonLab Labs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/live-labs.md).

Focused ToonLab shaders, water, vegetation, generated assets, texture recipes,
Gallery assets, and metadata are intended for supplied scene content. Complete
scene layout, gameplay, dynamic physics, precise collision, navigation, and one-shot world
construction remain host responsibilities.

Every lab also uses one shared 24-hour preview harness with Dawn, Day, Sunset,
and Night captures. The Day reference must visibly show Call Me Sensei's
cool/blue shadow response. See the
[universal preview contract](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/lab-preview-environment.md).

- **Shaders** — Character, Tree, Grass, Flower, Rock, Ground, Manufactured
  Surface, Water, Sky, Cloud, and integrated Sky & Cloud authoring.
- **Asset Generation** — Rock, Tree, and Grass recipes and projects.
- **Source & Texture Generation** — deterministic material-map recipes.

Every card links to a working editor. Integration examples are documented as
examples rather than additional Labs. See
[Lab responsibilities](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/lab-architecture.md) for scope rules and
[Getting started](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/getting-started.md) for current direct routes.

Sky, Cloud, and Water Labs author reusable rendering artifacts. Your application
still supplies valid scene geometry, placement, current conditions, and the
lighting coordination that keeps the sun, shadows, vegetation, sky, and water
aligned. Current time and weather remain runtime state and do not alter exported
presets. Sky quality can be rebuilt with `setQuality()`; Water quality is a
construction-time graph choice and requires rebuilding the surface.

Every URL parameter has a HUD control. In local development, lab state is
stored in Postgres so the MCP server and browser share it; existing
`localStorage` and IndexedDB data migrate on first run and browser copies are
retired after the verified commit. Static hosted builds
fall back to browser storage. **Reset Lab** clears the current lab state.
Point any model-aware lab at your own model with the Model URL input or
`?model=` — see
[Characters](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/characters.md).

## What's inside

The current release exposes the public runtime clusters below. Public API status and
end-to-end capability maturity are different: the recommended workflow is to
apply focused runtimes to supplied scene content. Whole-world composition
remains host-owned even though focused Sky and Cloud authoring is live.
Lighting, VFX, renderer ownership,
camera behavior, and game feel remain host-owned or pre-beta.

| Cluster | Import | What you get |
|---|---|---|
| Styles and bundles | `@call-me-sensei/toonlab/styles` | Local, versioned style-bundle documents that coordinate domain profiles without storing asset identity or current scene state. Create, validate, serialize, parse, and resolve JSON with no account or database; hosts currently route explicitly labeled assets through each owning runtime. [Contract](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/styles-and-bundles.md) |
| Toon character shading | `@call-me-sensei/toonlab/toon` | Anime-game character shader: flat lit colour, per-surface shadow tones with a warm band at the terminator, face maps baked automatically from the face, a nose shadow, eye-white shade and stocking sheen derived from the model, environment-aware light (sun, sky, cast shade), scenery, character and hair-on-face shadows, depth rim, hair ring and masked specular, ink outlines coloured from the surface, source map routing (normal/AO/emissive/MatCap/detail), stickers, shell fur, dither fades — 14 settings groups, all preset-serializable. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/toon-shading.md) |
| Environment shading | `@call-me-sensei/toonlab/environment` | Modern anime-style scene shader for texture packs, standard glTF, and untextured scenes: material-role classification, wrapped lighting, packed-map hints, window cutouts, sun/lamp rigs, time-of-day, six-direction ambient probe, planar floor reflections, BVH vertex-AO baking, height fog, cloud shadows. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/environment.md) |
| Water | `@call-me-sensei/toonlab/water` | Focused water treatment for a host-authored water footprint, continuous shore, and closed seabed: Gerstner waves, absorption color, refraction/caustics/foam, ripples, splashes, wakes, kelp, underwater treatment, and CPU buoyancy sampling. It does not design the coast or underwater habitat. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/water.md) |
| Vegetation | `@call-me-sensei/toonlab/vegetation` | Tree/grass/flower construction and shader runtimes, including the focused procedural broadleaf `BranchTree` with deterministic branching, eight leaf silhouettes, caller-supplied leaf/bark textures, and a portable recipe. No authored tree asset collection is bundled or exported: reviewed tree recipes remain searchable Gallery assets delivered through MCP with their CC0 metadata. Package-generated trees preserve authored bark first and otherwise select a registered deterministic bark surface instead of a bare trunk. The experimental species roster remains repository-only. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/vegetation-sky.md) |
| Rock shader | `@call-me-sensei/toonlab/rock-shader` | Detailed, versioned rock-material profiles with projected detail, distance tint, normal fading, striping, moss and optional top layers, plus explicit source-albedo and vertex-color/AO integration. Call Me Sensei is the default. Geometry generation remains separate in `rockgen`. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/rock-shader.md) |
| Ground shader | `@call-me-sensei/toonlab/ground-shader` | Splat-weighted anime terrain with slope/cliff detail, shoreline and weather response, HDR sun/shade controls, safe shadow defaults, and flat-albedo ground-field output for vegetation adoption. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/ground-shader.md) |
| Sky | `@call-me-sensei/toonlab/sky` | Reusable atmosphere, palette, sun, moon, stars, and god-ray settings authored by Sky Lab and Sky & Cloud Lab. Your application coordinates final lighting and scene state. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/sky.md) |
| Cloud | `@call-me-sensei/toonlab/cloud` | Reusable cloud shape, erosion, density, lighting, wind, cirrus, haze, fade, style, and hero-cloud recipe controls authored by Cloud Shader Lab and Sky & Cloud Lab. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/cloud-shader.md) |
| Post-processing | `@call-me-sensei/toonlab/post` | Optional single-pipeline compositor: character-aware bloom, color grade, LUT, vignette, screen outline, depth cue — schema-driven, preset-serializable. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/post-processing.md) |
| Procedural textures | `@call-me-sensei/toonlab/texgen` | Seamless CPU-baked PBR texture generator: 25 tileable pattern/noise generators, layered detail + colored overlays (moss, rust, grime), five-stop cel-capable color ramp, cavity/sheen hand-painted read, derived normal/AO/roughness/metalness/height/ORM/emissive maps, 60+ presets, and a natural-language recipe mapper (offline keywords or BYO-key Gemini/OpenAI). [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/texture-lab.md) |
| Character pipeline | `@call-me-sensei/toonlab/character` | High-level load/style/rig/animate lifecycle runtime, bone-role adapters for VRM/MMD/Mixamo/Rigify rigs, native-or-packaged locomotion fallback, and procedural freestyle swim. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/characters.md) |
| Scene surface runtime | `@call-me-sensei/toonlab/runtime` | One strict heightfield contract for grounded props/characters, terrain-aware meadow scatter, shoreline water bed/phase/state wiring, source-texture continuity, and actual labeled shadow-coverage readiness. The host still authors terrain and XZ layout. |
| Scene collision runtime | `@call-me-sensei/toonlab/runtime` | Automatic reversible collision discovery for labeled static solids, lightweight walkable blockers by default, strict readiness diagnostics, and public Rapier/custom-adapter integration. |
| Model loaders | `@call-me-sensei/toonlab/loaders` | Optional GLB/glTF, VRM 0+1, PMX/PMD, FBX, OBJ, and text-USDZ loading helpers. Kept off the root import so apps that do not load models avoid loader dependencies. [Docs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/characters.md) |

The main `vegetation` barrel exposes the complete runtime. Smaller consumers
can import the same bindings from
`@call-me-sensei/toonlab/vegetation-shaders` or
`@call-me-sensei/toonlab/grass-palettes`; package verification asserts that
the focused subpaths and root export reference the identical implementations.

### Default Call Me Sensei grass

ToonLab's default grass is its own deterministic procedural implementation.
The package generates the `primary` or denser `secondary` clump, LOD0/1/2,
blade attributes, and material entirely from code. The public factory uses the
primary `call_me_sensei_clump` meadow by default and has no GLB or image
dependency. Its accepted look is continuous upright coverage, full ground
color adoption, and a bright texture-free watercolor wash—not isolated dark
tufts or generic procedural blades:

```js
import { createSceneSurfaceRuntime } from '@call-me-sensei/toonlab/runtime';
import { createSceneStyleRuntime, createStyleTarget } from '@call-me-sensei/toonlab/styles';

const surface = createSceneSurfaceRuntime({ bounds, heightAt, waterLevel: 0 });
const grass = await surface.createGrassField({
  count: 12000,
  min: { x: -40, z: -30 },
  max: { x: 40, z: 30 },
  // variant: 'secondary',
});
const water = surface.createWaterSurface({
  width: 80,
  depth: 50,
  position: { x: 0, z: -25 },
});
scene.add(grass);
scene.add(water);

const look = createSceneStyleRuntime({ renderer, scene, sky, water });
await look.apply('call-me-sensei', {
  targets: [
    createStyleTarget('terrain', 'terrain.ground', ground),
    createStyleTarget('meadow', 'vegetation.grass', grass),
  ],
});

// The style runtime updates its ground-color field before the grass renders.
look.update(delta, camera);
grass.update(delta, camera);

// Fail closed after the package shadow pass has produced coverage telemetry.
surface.assertReady({
  camera,
  styleRuntime: look,
  requireShadowDomains: ['character', 'manufactured.surface', 'vegetation.tree'],
});
```

Large fields are spatially chunked by default. Each update rejects chunks and
placements outside the camera frustum, then compacts only visible records into
the same three LOD draw buffers. `chunkSize` (default 16 m), `cullPadding`
(default 1.5 m), and `frustumCulling` are construction options;
`grass.cullingStats` reports the current visible/culled instance and chunk
counts. Do not disable this for an outdoor meadow merely to work around bounds.

`CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS` exposes the stable procedural recipes;
`CALL_ME_SENSEI_GRASS_MATERIAL_TEXTURE_URLS` is an empty compatibility binding
because the material has no image dependencies. The default factory returns a
`StylizedGrassClumpField`. `RetainedGrassClumpField` remains the generic
caller-supplied geometry/material container and does not load assets by itself.
The Call Me Sensei default preserves sampled ground hue: green ground produces
only lighter/darker green blades. Optional hue shift/desaturation remain public
profile parameters for other authored styles. Its recipe-v3 LOD0/1/2 topology
uses 40/14/6 primary blades and compensates retained stroke width so zooming
does not make the underlying terrain appear to change color.

ToonLab does not ship predefined tree assets in npm. Search reviewed public
tree recipes through MCP, then pass the retrieved portable recipe options to
the runtime:

```js
import { StylizedTree } from '@call-me-sensei/toonlab/vegetation';

// treeRecipe is the document returned by get_public_gallery_asset after
// search_public_gallery({ query: 'tree', type: 'tree-recipe' }).
const tree = new StylizedTree({
  ...treeRecipe.options,
  trunkMap: barkTexture,
  vegetationShader: { preset: 'call_me_sensei' },
});
scene.add(tree);
```

For a configurable recursive branch-type broadleaf, use the focused wrapper:

```js
import { BranchTree } from '@call-me-sensei/toonlab/vegetation';

const tree = new BranchTree({
  seed: 18,
  branches: { levels: 3, children: 5, angle: 52 },
  leaves: { shape: 'oak', color: [0.18, 0.48, 0.22], map: leafTexture },
  trunk: { color: [0.48, 0.29, 0.16], map: barkTexture },
});
scene.add(tree);
```

`teardrop`, `round`, `oak`, `maple`, and `gingko` are the supported leaf
shapes. Botanical species generation is not a public package claim.

Water, sky, flowers, trees, grass, and splashes keep procedural defaults, while
Gallery tree recipes, `StylizedTree`, and `BranchTree` may use caller-owned
leaf and bark textures. The
Call Me Sensei tree path resolves bark in this order: explicit
`trunkSurfaceProfile`, authored `trunkMap`, then the registered
`call-me-sensei-bark-v1` fallback. Use `getTreeSurfaceProfileOptions()` when a
developer or coding agent should choose a different registered surface; use
`trunkSurfaceProfile: 'none'` only for an intentional flat-color trunk. Trunks
cast and receive through the package shared shadow pass by default.

The optional CC0 Quaternius mannequin is also not bundled in npm: its immutable R2
URL, byte count, hash, source, and license are exposed as metadata. A host may
download that test fixture or use its own mannequin:

```js
import { TOONLAB_MANNEQUIN_ASSET } from '@call-me-sensei/toonlab/character';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const { scene: mannequin, animations } = await new GLTFLoader().loadAsync(
  TOONLAB_MANNEQUIN_ASSET.url,
);
```

## Library usage

The local Library is discoverable through the same vocabulary as Gallery:
search names, descriptions, types, and durable tags in `/library/`, or use
`list_my_creations` / `search_assets({ source: 'library' })` through MCP.
Saved-object tags are ASCII lowercase slugs (`a-z`, `0-9`, and single hyphen
separators; maximum 10 tags and 32 characters each) and are
stored independently from the portable document so they remain searchable
after reload and edits.

Revision history is unlimited in the local workspace. Creation tags above are
separate from version tags: creation tags remain discovery metadata, while
version tags describe a particular immutable snapshot.

Start by loading one style bundle, explicitly labeling the scene targets, and
preflighting the complete routing plan. Strict mode is atomic: if any target
is unlabeled, unsupported, or missing an adapter, nothing is mutated.

```js
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  applyStyleBundle,
} from '@call-me-sensei/toonlab/styles';

const targets = [
  {
    id: 'hero',
    domain: 'character',
    subject: characterRoot,
    apply: (root, settings) => applyCharacterProfile(root, settings),
  },
  {
    id: 'terrain',
    domain: 'terrain.ground',
    subject: terrainRoot,
    apply: (root, settings) => applyGroundProfile(root, settings),
  },
  {
    id: 'forest',
    domain: 'vegetation.tree',
    subject: treeRoot,
    apply: (root, settings) => applyTreeProfile(root, settings),
  },
];

await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, { targets });
```

Use the domain-specific runtimes below to implement each `apply` callback.
Asset identity stays in project/library sourcing configuration; it is never
embedded in the style bundle. Custom adapters and custom assets must be
recorded in `.toonlab/reports/style-asset-gaps.json` and
`.toonlab/reports/asset-gaps.md`. These generated review records stay local and are
excluded from source control.

### Individual clusters

```js
import { applyToonShader, createToonSettings } from '@call-me-sensei/toonlab/toon';

const settings = createToonSettings({
  preset: 'default',
  ramp: {
    tone: { skin: [0.94, 0.82, 0.76] },
  },
});

applyToonShader(characterRoot, { settings });
```

```js
import { WaterSurface } from '@call-me-sensei/toonlab/water';

// The host supplies a continuous shore and closed bed sampler.
const water = new WaterSurface({
  width: 200,
  depth: 200,
  preset: 'lake',
  bedHeight,
});
scene.add(water);

// per frame, before renderer.render(scene, camera):
water.update(renderer, scene, camera, delta);
```

Add Sky and Cloud after the host scene has one coordinated sun, light rig, and
current-condition source. Their focused Labs produce the portable settings;
the application owns final scene composition.

Inside this repo the labs import from `../../src/...`; the `@call-me-sensei/toonlab/...`
specifiers are what you use once the package is installed from npm. The
shader clusters are TSL/NodeMaterial modules for Three's WebGPU renderer
stack, with WebGL2 fallback through the same TSL path.

## Documentation

- **In-browser docs** — with the labs running (`npm run dev`), open
  `http://localhost:5175/docs/` for guided documentation: library usage,
  MCP setup, the prompt cookbook, and the full settings reference. Hosted
  features are marked "Pro"; the extended hosted docs live at
  [toonlab.io/docs](https://toonlab.io/docs).
- [Lab responsibilities](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/lab-architecture.md) — the finalized artifact,
  production-method, editor/library, and preview-state boundaries.
- [The 15 live ToonLab Labs](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/live-labs.md) — each user-facing editor, saved artifact, runtime, and generation workflow.
- [Universal lab preview environment](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/lab-preview-environment.md) —
  shared 24-hour controls, four-state regression matrix, and required cool/blue
  daylight-shadow verification.
- [Rock shader](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/rock-shader.md) — the separate generator/material
  architecture, schema-defined public configuration, import policy, and bundle use.
- [Styles, style bundles, and asset routing](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/styles-and-bundles.md) —
  rendering domains, required asset labels, fallback policy, bundle ownership,
  OSS application boundaries, and the shader/lab migration contract.
- [Open asset library and scene coverage](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/open-asset-library.md) —
  measurable scene-kit coverage, curated stylized generator base sets,
  CC0/CC-BY provenance, gallery routing, and generation fallback policy.
- [Getting started](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/getting-started.md) — clone, run, tour the labs,
  load your own models.
- [Current capability status](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/capability-status.md) — recommended
  existing-scene, Gallery, MCP, and focused-authoring workflows versus
  experimental scene-construction claims.
- [Toon character shading](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/toon-shading.md)
- [Manufactured environment materials](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/urban-prop-surface-roles.md) —
  the layered classify-once contract for props, vehicles, buildings,
  interiors, and reusable material-aware shaders.
- [Environment shading](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/environment.md)
- [Styles and bundles](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/styles-and-bundles.md) — apply coordinated treatments to explicitly labeled scene targets.
- [Current release notes](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/release-notes.md)
- [Water](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/water.md)
- [Sky system](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/sky.md)
- [Cloud shader](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/cloud-shader.md)
- [Vegetation](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/vegetation-sky.md)
- [Post-processing](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/post-processing.md)
- [Texture Lab and texgen](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/texture-lab.md)
- [Characters and animation](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/characters.md)
- [Settings reference](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/settings-reference.md) — selected runtime and repository settings,
  generated from the schemas (`node scripts/generate-settings-reference.mjs`).
- [Shader constants](https://github.com/call-me-sensei-app/toonlab/blob/main/docs/shader-constants.md) — the deliberately unexposed
  constants and where they live.

## Build with an AI coding agent

ToonLab is designed to be driven by a coding agent (Claude Code, Codex,
Cursor, …). The recommended setup has three parts: give the agent the ToonLab
skills, connect whichever ToonLab OSS local or ToonLab Pro remote MCP surface
the developer has, then start from a goal prompt and iterate. The npm package
ships runtime source and the small text-only `agents/` guidance bundle. It
includes a copyable playable blockout in `agents/examples/game-foundation.mjs`;
models, textures, Lab apps, repository demos and review media are not bundled.

### 1. Install the ToonLab skills in your game project

The skills teach the agent the runtime boundary, asset-discovery order,
frame-loop contract, and each focused subsystem API. Start with `game-dev` for
new-game development or integration, and `asset-sourcing` for Gallery/MCP work.
Experimental whole-world, natural-cliff, Weather/Climate, camera, game-feel,
and gameplay-VFX skills are intentionally not included in the npm artifact.

```bash
# Claude Code — feature skills + project guidance
mkdir -p .claude/skills
cp -R node_modules/@call-me-sensei/toonlab/agents/skills/claude/* .claude/skills/
cat node_modules/@call-me-sensei/toonlab/agents/claude/CLAUDE.md >> CLAUDE.md

# Codex — shared guide + Codex-oriented skills
cat node_modules/@call-me-sensei/toonlab/agents/codex/AGENTS.md >> AGENTS.md
mkdir -p docs/toonlab-skills
cp -R node_modules/@call-me-sensei/toonlab/agents/skills/codex/* docs/toonlab-skills/

# Cursor — rule file
mkdir -p .cursor/rules
cp node_modules/@call-me-sensei/toonlab/agents/cursor/toonlab.mdc .cursor/rules/
```

See [`agents/README.md`](agents/README.md) for the full layout.
Ready-to-paste supported prompts are included in
[`agents/PROMPTS.md`](agents/PROMPTS.md).

### 2. Connect MCP for asset discovery

Two servers, and they compose:

**Local (free, no account).** The stdio server included in this package
searches local/project content, reviewed public Gallery recipes, the released
official catalog, and public CC0 sources; reads saved presets and Lab exports;
generates approved seeded recipes; and imports assets into a disk-backed
`.toonlab/` workspace. Use `search_public_gallery` for authored assets such as
the public tree collection—those recipes are not npm built-ins:

```json
{
  "mcpServers": {
    "toonlab-local": {
      "command": "npx",
      "args": ["-y", "--package=@call-me-sensei/toonlab@latest", "toonlab-mcp", "--workspace", "/absolute/path/to/your-game/.toonlab"],
      "env": { "TOONLAB_LEGACY_WORKSPACE": "1" }
    }
  }
}
```

The npm server defaults to this disk workspace when `DATABASE_URL` is absent.
See [the installed npm guide](./NPM-LIBRARY.md) and
[live MCP documentation](https://toonlab.io/docs/mcp) for the complete local
and hosted setup.

**ToonLab Pro (remote, OAuth).** [toonlab.io](https://toonlab.io) hosts a
remote MCP server that adds an indexed CC0 asset search with ToonLab-styled
previews, AI generation (concept art, seamless textures, image→3D model
chaining) on credits, stored characters with reference-image consistency, and
your cloud library of presets and style bundles. Requires a Pro or Team plan.

```bash
# Claude Code
claude mcp add --transport http toonlab https://toonlab.io/mcp
```

Other clients: add `https://toonlab.io/mcp` as a remote MCP server and
authorize in the browser. Full client-by-client setup and a tool reference
live at [toonlab.io/docs/mcp](https://toonlab.io/docs/mcp).

### 3. The first prompt

Give the agent a bounded goal over supplied scene content, name the skill, and
let it verify its own work:

```text
Using the ToonLab game-dev skill, integrate @call-me-sensei/toonlab into this
existing Three.js scene. Inventory and label the character, manufactured,
ground, rock, tree, grass, flower, water, and post targets. Confirm my asset
sourcing policy and use whichever ToonLab OSS or Pro MCP surface is connected
to fill only named asset gaps. Apply the matching public runtimes, preserve
provenance, run the scene, and verify the supplied cameras. Do not redesign the
terrain, coastline, biome, lighting, camera, or gameplay unless I explicitly
request an experiment.
```

### 4. Prompts for common jobs

```text
Use the ToonLab MCP server to find CC0 props for a small fishing village —
lanterns, crates, a pier, a torii gate. Evaluate geometry, material separation,
texture frequency, silhouette, provenance, and license for the Call Me Sensei
anime treatment. Use the host game's placement/collision/LOD system and tell
me what came from where.
```

```text
Using the ToonLab water skill, make the ocean stormier as the player sails
away from shore, and let them surf the plunging breakers near the reef.
```

```text
Generate a seamless mossy stone texture with texgen and apply it to the
shrine path. I want a hand-painted look with a five-stop cel ramp.
```

```text
As an experiment, use ToonLab Weather plus the host game's lighting system to
prototype a day/night cycle with a thunderstorm at dusk. Keep lighting outside
the selected style bundle, list every host adapter, and do not describe the result
as a supported full-world workflow.
```

```text
Search my ToonLab library for the "sunset-festival" style bundle and apply
it across toon shading, sky, water, and post so the whole game matches it.
```

```text
Design a sword-swing VFX treatment that matches the selected anime bundle.
VFX is not included in the selected bundle, so use your application runtime,
record the custom VFX choice, and include its provenance and intended feedback.
```

A more extensive prompt cookbook — including the Pro generation and
character-consistency workflows — is at
[toonlab.io/docs/prompts](https://toonlab.io/docs/prompts).

## License

Code is [MIT](LICENSE), copyright Hyperbond Studio PTE. LTD. Bundled assets are CC0 — see
[ATTRIBUTION.md](ATTRIBUTION.md) for credits and for the bring-your-own
conventions (Mixamo clips, your own models, licensed scan packs).
