# ToonLab npm library guide

This guide is included in `@call-me-sensei/toonlab`. It is the package-first
reference for version 0.5.0 and does not require access to the source
repository.

## Install

```bash
npm install @call-me-sensei/toonlab three
```

ToonLab requires Node.js 18 or newer for its command-line and local MCP tools.
The rendering library targets the Three.js TSL/NodeMaterial stack and is
WebGPU-first with a WebGL2 fallback through the same public materials.

## Supported product surface

The public package follows the 15 Labs currently shown in ToonLab Pro. Several
Labs share one runtime because they author different scopes of the same
portable document.

| ToonLab Pro Lab | npm runtime |
| --- | --- |
| Character & Creature Shader | `@call-me-sensei/toonlab/toon` |
| Tree Shader | `@call-me-sensei/toonlab/vegetation-shaders` |
| Grass Shader | `@call-me-sensei/toonlab/vegetation-shaders` |
| Flower Shader | `@call-me-sensei/toonlab/vegetation-shaders` |
| Rock & Geology Shader | `@call-me-sensei/toonlab/rock-shader` |
| Terrain & Ground Shader | `@call-me-sensei/toonlab/ground-shader` |
| Manufactured Surface Shader | `@call-me-sensei/toonlab/environment` |
| Water & Liquid Shader | `@call-me-sensei/toonlab/water` |
| Sky Shader | `@call-me-sensei/toonlab/sky` |
| Cloud Shader | `@call-me-sensei/toonlab/cloud` |
| Sky & Cloud | `@call-me-sensei/toonlab/sky` and `/cloud` |
| Rock & Cliff Generation | `@call-me-sensei/toonlab/rockgen` |
| Tree & Shrub Generation | `@call-me-sensei/toonlab/vegetation` |
| Grass & Groundcover Generation | `@call-me-sensei/toonlab/vegetation` |
| Texture & Material Map Generation | `@call-me-sensei/toonlab/texgen` |

These stable support entry points are also public because the visible Labs,
Library, Gallery, style-bundle workflow, or integration examples depend on
them:

- `@call-me-sensei/toonlab/styles` for portable bundles, strict labels,
  auditing, and coordinated application;
- `@call-me-sensei/toonlab/assetlib`, `/asset-policy`, and
  `/official-catalog` for policy-aware local/released-catalog integration;
- `@call-me-sensei/toonlab/character` and `/loaders` for supported preview and
  host-model integration;
- `@call-me-sensei/toonlab/runtime`, `/renderer`, `/lighting`, and
  `/world-collision` for the shared scene contract used by the documented
  integration examples;
- `@call-me-sensei/toonlab/post` for the coordinated optional post pipeline;
- focused aliases such as `/toon-settings`, `/water-settings`, `/grass`,
  `/grass-palettes`, `/post-processing`, and `/vegetation-shaders` when a
  consumer does not want a larger barrel.

The package deliberately does not export Weather, Climate, Biome, Landscape,
path/building/village generation, debris generation, fauna, ambient effects,
game feel, camera behavior, soundscape, or gameplay VFX. Those areas may exist
as repository experiments or host examples, but they are not npm APIs in this
release. A one-asset Node rock annotation compiler is also repository-only.

## What the package contains

The npm artifact contains four supported layers:

1. The JavaScript runtime and TypeScript declarations for the public imports.
2. Text-only agent guides, prompts, references, a copyable game example, and paired Codex/Claude skills
   under `agents/`.
3. The `toonlab` manifest audit CLI and `toonlab-mcp` local stdio MCP server.
4. The local MCP database/catalog support required for Library and asset
   discovery workflows.

It does not contain the ToonLab website, Lab application UIs, repository demo applications,
screenshots, models, textures, or other binary media. Optional public fixtures
are identified by immutable `https://assets.toonlab.io` metadata rather than
being bundled. Authored tree recipes are assets too: the reviewed public tree
collection remains in the Gallery and is discovered through MCP instead of
being hard-coded into the JavaScript runtime.

## Use a focused runtime

```js
import {
  applyToonShader,
  createToonSettings,
} from '@call-me-sensei/toonlab/toon';

const settings = createToonSettings({
  preset: 'call_me_sensei',
  rim: { intensity: { hair: 0.35 }, mode: 'depth' },
  outline: { width: { cloth: 0.006 } },
  ramp: { tone: { skin: [0.93, 0.74, 0.68] } },
});

applyToonShader(characterRoot, { settings });
```

For a multi-domain scene, label roots and materials before applying a bundle.
Strict mode preflights the complete plan and stops before mutation when a
target, material role, or adapter is missing.

```js
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
} from '@call-me-sensei/toonlab/styles';

const look = createSceneStyleRuntime({ renderer, scene, sky, water, post });
await look.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
  discovery: 'scene-labels',
  mode: 'strict',
});

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  sky?.update(delta);
  look.update(delta, camera);
  // Update host-owned grass/characters here if this scene uses them.
  water?.update(delta, camera);
  if (post) post.render(delta);
  else renderer.render(scene, camera);
});
```

The host application still owns renderer creation, geometry and XZ layout,
cameras, controls, gameplay, dynamic physics, navigation, persistence, and the
frame loop. ToonLab does not turn a prompt into a finished world.

## Realistic rock surface generation

The public `rockgen` entry includes `createNaturalRockMapData`,
`createNaturalRockSurfaceSpecification`, `resolveNaturalRockProjection`,
`NATURAL_ROCK_SURFACE_PROFILES`, and `NATURAL_ROCK_MAP_ROLES`.
These are the same deterministic realistic material profiles used by the Rock
Lab. They produce typed RGBA map data; the host creates textures and assigns
material/projection settings. Saved library rocks retain their surface recipe.
The published realistic GLB is also available through raw catalog acquisition.
Composite lithologies require authored semantic regions; micro-height maps are
surface detail, not displacement that replaces a geometric high-to-low bake.

## Load Nature Reference Rocks

Version 0.5.0 understands both the original `rock-0001`–`rock-0480`
identities and the Nature Reference Rocks catalog. Acquiring an asset
directly returns its realistic PBR GLB. The one-call placement path additionally
loads that asset's reviewed geology maps and `call_me_sensei` material settings
before applying the selected style bundle.

```js
import {
  createOfficialCatalogAssetRuntime,
  createOfficialCatalogProvider,
  createOfficialCatalogRockEditorDescriptor,
  loadOfficialCatalogAsset,
} from '@call-me-sensei/toonlab/official-catalog';
import { CALL_ME_SENSEI_STYLE_BUNDLE } from '@call-me-sensei/toonlab/styles';

const provider = createOfficialCatalogProvider({
  baseUrl: 'https://toonlab.io/',
  transport: 'public-rock',
});
const assets = createOfficialCatalogAssetRuntime({ provider, renderer });
const catalog = await provider.listAssets();
const selectedRock = catalog.assets.find((asset) => asset.label.toLowerCase().includes('sandstone'));
if (!selectedRock) throw new Error('Select an available sandstone rock from the catalog.');

// Raw acquisition keeps the realistic PBR model.
const realistic = await assets.acquireAsset(selectedRock.id);
scene.add(realistic.root);

// Placement loads the same rock's geology maps and applies Call Me Sensei.
const stylized = await loadOfficialCatalogAsset({
  assetId: selectedRock.id,
  assetRuntime: assets,
  parent: scene,
  styleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
});

// Rock Lab/editor integrations receive the non-destructive authoring contract.
const rockPackage = await assets.getRockPackage(selectedRock.id);
const editorSource = createOfficialCatalogRockEditorDescriptor(
  rockPackage.asset,
  rockPackage,
);
```

`editorSource` exposes `control.glb`, retained high detail, LOD0–LOD4,
collision, recipe, material configuration, and the required post-sculpt
reprojection/rebake/rebuild flags. These are immutable R2 URLs; the package
does not embed any rock media. Release acquired handles and dispose the runtime
when their scene lifetime ends.

## Install the agent guidance

Everything in this section is present in the installed npm package.

### Use the installed guide

Add a reference to `node_modules/@call-me-sensei/toonlab/agents/codex/AGENTS.md`
in the project's existing instructions, or read it directly. Merge relevant
guidance; do not replace an existing `AGENTS.md` or `CLAUDE.md`. Claude's optional
wrapper is `agents/claude/CLAUDE.md`; Cursor's is `agents/cursor/toonlab.mdc`.

Copy only the feature skills you need into the client's skill directory, while
preserving any existing skills with the same names. Shared `agents/...`
references remain relative to the installed package root. Keep the package
installed; copying a single skill does not copy its reference library.

Start with `game-dev` for a new game or existing-scene integration, then add
`asset-sourcing` for Library/Gallery work and the focused rendering skills as
needed. `agents/PROMPTS.md` contains the prompt cookbook.
`agents/examples/game-foundation.mjs` is a copyable, playable blockout example;
it is application code, not an exported ToonLab game engine.

## Connect MCP

### Local npm MCP

The package executable runs as a local stdio server. With no `DATABASE_URL`,
it uses the disk workspace passed through `--workspace`; no account is needed.

```json
{
  "mcpServers": {
    "toonlab-local": {
      "command": "npx",
      "args": [
        "-y",
        "--package=@call-me-sensei/toonlab@0.5.0",
        "toonlab-mcp",
        "--workspace",
        "/absolute/path/to/your-game/.toonlab"
      ],
      "env": {
        "TOONLAB_LEGACY_WORKSPACE": "1"
      }
    }
  }
}
```

This server provides the anime-game profile, live-Lab
contracts, deterministic document creation and mutation, policy validation,
public Gallery search/retrieval, local Library operations, and optional
provider-backed generation when the developer supplies server-side provider
keys. Authored tree recipes are not bundled. Call `search_public_gallery` with
`{ query: "tree", type: "tree-recipe" }`, then use
`get_public_gallery_asset` to retrieve the reviewed portable recipe.

### ToonLab Pro MCP

Add `https://toonlab.io/mcp` as a remote MCP server and authorize in the
browser. The hosted server adds the signed-in Pro Library, published Gallery,
stored characters, and managed generation. Local and remote servers may be
connected at the same time; inspect the tool description before choosing one
when names overlap.

Full live setup and tool documentation is available at
<https://toonlab.io/docs/mcp>.

## CLI

The `toonlab` executable audits JSON scene manifests without starting a
renderer:

```bash
npx toonlab audit --input scene.json --bundle call-me-sensei --mode strict --pretty
```

Supported operations are `inspect`, `audit`, `plan`, `apply`, and `verify`.
Use `--out` to write a report. `apply --write-manifest` is the only operation
that replaces the input file and should be used only after reviewing the plan.

## Documentation without the source repository

- This installed guide is the complete npm boundary and setup reference.
- `README.md` provides the longer runtime tour.
- `agents/README.md` explains the packaged agent resource layout.
- `agents/PROMPTS.md` contains supported prompts.
- `agents/references/` contains the machine-readable runtime, style, sourcing,
  and MCP contracts used by the skills.
- <https://toonlab.io/docs> provides hosted user documentation.
- <https://toonlab.io/docs/labs> documents all 15 public Labs.
- <https://toonlab.io/docs/reference> and
  <https://toonlab.io/docs/reference.md> provide the settings reference.

GitHub access is not required for npm installation, agent setup, MCP setup, or
the supported runtime workflows above.
