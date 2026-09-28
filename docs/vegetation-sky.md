# Vegetation

Vegetation treatment and focused generators are designed for a scene with
user-authored geometry or placements. Sky and Cloud have their own live Labs
and runtime guides; the host application still coordinates final scene state.

Procedural stylized vegetation from
`@call-me-sensei/toonlab/vegetation`. Geometry and shading are generated;
animation runs in the vertex shaders. The runtime sky now has its own
[Sky system](sky.md) guide.

Vegetation materials use the shared TSL renderer stack: native
WebGPU by default, with `?renderer=webgl` for the WebGL2 fallback.

Geometry systems follow the same settings pattern as the rest of the library:
a `DEFAULT_*` settings object, a `create*Settings(options)` normalizer,
`*_SETTING_GROUPS` + `*_SETTING_FIELD_SCHEMA` for UIs, and a runtime
`applySettings(options)` method on the class. Reusable shading lives in
independent Tree, Grass, and Flower profiles over one shared Vegetation
renderer family; those profiles must not absorb asset identity or the scene's
current state.

Settings registries are runtime extension points, not asset catalogs. The
packaged `StylizedTree` registry starts with only the neutral `default`;
reviewed authored trees live in the public Gallery and can be retrieved over
MCP. Reusable shader profiles such as `call_me_sensei` remain package runtime
features and do not define tree geometry or identity. For large terrain
placements, use the public scatter helpers with one ToonLab world unit equal
to one meter.

## Vegetation shader family

Use one shared Vegetation implementation with one shared treatment base and
three independently versioned role profiles. The profiles dispatch by semantic material role
(`grassBlade`, `foliageCard`, `flowerPetal`, `flowerCenter`, `woodySurface`,
`herbaceousStem`); mesh/cutout/billboard/procedural remain technical variants.

| Profile | Owns | Does not own |
|---|---|---|
| Shared Vegetation Base | lighting, thin-surface response, and weather response used by every applicable vegetation role | species, geometry, per-profile palette, current weather amounts |
| Tree Shader | foliage/card and bark/wood treatment resolved over the shared base | species, trunk/canopy geometry, scatter, LOD, current wind or season |
| Grass Shader | blade gradient, dense-field, gust, bend, and interaction response resolved over the shared base | blade/clump geometry, density, placement, current wind or interaction position |
| Flower Shader | petal, center, leaf/foliage, and herbaceous-stem treatment resolved over the shared base | species, petal count, plant geometry, placement, current wind |
| Asset/material | albedo, textures, alpha cutoff, species palette, authored role labels | the selected reusable shader treatment |
| Scene/world | current sun/sky, cloud field, wind, wetness, and snow coverage | persistent shader response coefficients |

### Procedural asset compatibility contract

Procedural trees use the same Tree Shader as imported trees. Compatibility
depends on a clean hand-off between the asset recipe and the shader:

- The recipe supplies sRGB canopy and bark colors once. Runtime normalization
  converts those values once; material creation must not decode an already
  linear `THREE.Color` as sRGB a second time.
- Package-generated trees resolve bark in a deterministic precedence order:
  explicit `trunkSurfaceProfile`, an authored `trunkMap`, then the protected
  Call Me Sensei default `call-me-sensei-bark-v1`. Applying the Call Me Sensei
  bundle to an otherwise neutral `StylizedTree` fills the same registered
  fallback. `getTreeSurfaceProfileOptions()` exposes the choices for developer
  or coding-agent selection. An explicit `'none'` is the only supported way to
  request a flat-color trunk.
- The generator labels foliage cards as `foliageCard` and trunks, branches,
  and visible roots as `woodySurface`. Moss, snow, attached grass, and other
  secondary surfaces need their own semantic roles rather than inheriting the
  nearest tree material.
- Foliage cutouts are double-sided in both color and shadow passes. Their
  light-facing billboard position and alpha mask must match the visible leaf
  card; otherwise Three's reversed shadow-side culling removes the canopy
  while leaving only the volumetric trunk and branches.
- The asset derives lit, shadow, and crown tones from its botanical palette.
  The Tree Shader owns how those tones are selected by light, shadow, canopy
  occlusion, weather, and view response.
- Sky fill, rim, and leaf transmission are albedo-relative reflected light.
  Adding raw sky or sun color creates a white veil and destroys saturated
  procedural palettes.
- Different source assets can use different material math. Use a calibrated
  canonical preset and do not copy asset-specific coefficients blindly into a
  different shader graph.

Shader Lab can expand its preview shadow coverage for a large procedural tree
so the crown is not clipped. That camera adjustment remains preview state.

This keeps species identity overridable per generated or imported asset while
allowing one reusable style profile to produce a consistent rendering
treatment. Shader Lab previews therefore switch recipes without serializing a
recipe, palette, seed, geometry, time of day, or current weather into the Tree
Shader document.

Shared Lighting, Thin Surface, and Weather Response are one editable base by
default. Editing any of those groups affects Tree foliage, Bark/wood,
Grass/groundcover, and Flower petals, centers, attached leaves, and stems
where the semantic role consumes that group. Every shader lab must show this
impact before the controls.

Scope documents embed a snapshot of the shared base so an exported JSON file
remains portable. Loading the document normally resolves that snapshot into
the project's shared base; it is not an implicit per-profile override. A
detached profile must be an explicit, named override with a reset-to-shared
action. Silent divergence between Tree, Grass, and Flower is not allowed.

```js
import { StylizedGrassField } from '@call-me-sensei/toonlab/vegetation';
import {
  createVegetationSharedShaderSettings,
  createGrassShaderProfileSettings,
  mergeVegetationSharedShaderSettings,
} from '@call-me-sensei/toonlab/vegetation-shaders';

const sharedVegetation = createVegetationSharedShaderSettings({
  preset: 'call_me_sensei',
  lighting: { shadowTintStrength: 0.42 },
});
const grassRole = createGrassShaderProfileSettings({
  preset: 'call_me_sensei',
  grass: { bandSoftness: 0.08 },
});
const grassShader = mergeVegetationSharedShaderSettings(
  'grass',
  grassRole,
  sharedVegetation,
);

const purpleGrass = new StylizedGrassField({
  baseColor: [0.28, 0.12, 0.48],
  tipColor: [0.76, 0.38, 0.96],
  placements,
  vegetationShader: grassShader,
});

// Host-owned current state; neither value changes the saved profile.
purpleGrass.setWind({ strength: currentWind });
purpleGrass.setSurfaceWeather({
  wetness: currentWetness,
  snowCover: currentSnow,
});
```

Each shader lab exports its own versioned document consumed by the same npm
runtime:

```js
import {
  createTreeShaderPresetDocument,
  createGrassShaderProfilePresetDocument,
  createFlowerShaderProfilePresetDocument,
  parseTreeShaderPresetDocument,
} from '@call-me-sensei/toonlab/vegetation-shaders';

const document = createTreeShaderPresetDocument('project_tree', {
  label: 'Project Tree',
  settings: { bark: { bandCount: 3 } },
});
const parsed = parseTreeShaderPresetDocument(document);
if (!parsed.ok) throw new Error(parsed.errors.join(' '));
```

Portable document types are `toonlab/tree-shader-preset`,
`toonlab/grass-shader-preset`, and `toonlab/flower-shader-preset`.
`toonlab/vegetation-shader-preset` remains the compatibility aggregate for
existing projects. The focused `vegetation-shaders` subpath and the main
`vegetation` barrel expose the same bindings.

`applyVegetationShader(root, profile)` updates only materials tagged with the
semantic contract and returns coverage/unsupported-uniform diagnostics.
`applyVegetationShaderScope(root, 'tree' | 'grass' | 'flower', profile)`
additionally rejects roles owned by another profile.

ToonLab has no stable full-world coordinator. Apply tree, grass, and
flower profiles to their explicitly labeled roots with
`applyVegetationShaderScope(...)`, and keep the returned diagnostics. The host
must also rebuild any far-forest proxy whose baked appearance no longer
matches an updated tree profile. Do not invent world-level setters.

The labs intentionally split by responsibility:

- Tree, Grass, and Flower **Generation Labs** author geometry and palettes.
  The public package supports the 12 named tree
  silhouettes plus the generic `BranchTree`; taxonomy/species experiments
  remain repository-only.
- Tree, Grass, and Flower **Shader Labs** author the three reusable profiles.
- Terrain, soil, paths, and sand route to Ground Shader, not Vegetation.

## Construction-time vs. runtime settings

Each class takes asset/construction settings and an optional
`vegetationShader` in the constructor. `applySettings()` remains the
compatibility path for system-specific material and construction settings;
`setVegetationShader()` applies the IP treatment, while `setWind()`,
`setSun()`, `setCloudShadow()`, and `setSurfaceWeather()` carry current world
state. Geometry-shaping settings remain construction-only.

In a composed world, `world.setSun({ direction, color, sky })` is the single
scene-light adapter. It forwards the same transient values to Grass, Flowers,
near Forest variants, Ambient FX direction, the physical directional light,
and shadow-follow logic without mutating any portable vegetation preset.
`lighting.attachWorld(world)` drives that adapter; standalone Weather uses the
same adapter and restores its captured baseline on disposal.

| Class | Live after construction | Construction-only |
|---|---|---|
| `StylizedGrassField` | asset palette through `applySettings`; current wind/sun/scene/cloud/weather through setters; IP look through `setVegetationShader` | `placements`, `bladeHeightRange`, `bladeWidthRange` (baked into instance attributes) |
| `StylizedFlowerField` | asset colors through `applySettings`; current wind/sun/cloud/weather through setters; IP look through `setVegetationShader` | placements, flower geometry |
| `StylizedTree` | current wind/sun/cloud/weather through setters; IP look through `setVegetationShader`; canopy palette re-derivation through `applySettings` | `size`, `seed`, `canopyWidth/Depth/Scale/Layout`, `leafDensity`, `leafPlacement`, trunk/skeleton topology |

## Grass

For the default Call Me Sensei meadow, prefer the focused package factory:

```js
import { createCallMeSenseiGrassField } from '@call-me-sensei/toonlab/grass';

const grass = await createCallMeSenseiGrassField({ placements });
scene.add(grass);
grass.update(delta, camera);
console.log(grass.bladeBudget()); // authored, actually drawn, and per-LOD counts
console.log(grass.cullingStats); // visible/culled instances and spatial chunks
```

The field spatially chunks placements and performs camera-frustum rejection by
default while retaining only three LOD draw buffers. The optional construction
controls are `chunkSize` (16 m), `cullPadding` (1.5 m), and
`frustumCulling`. Keep culling enabled for normal world use; it prevents a
meadow behind the camera from consuming the same vertex budget as the view.

It resolves `call_me_sensei_clump`: first-party procedural 40-blade primary
clumps, generated LOD0/1/2 geometry, full ground-field adoption, texture-free
watercolor lift, translucent stroke layering, and no terminal hard cull. With
`createSceneStyleRuntime()`, label terrain as `terrain.ground` and the meadow as
`vegetation.grass`; the runtime marks writers and updates the ground-field pass.
Only manual subsystem integrations need to create and update that pass directly.
Reject dark or dirty roots, isolated tuft islands, tangled blades, bare-ground
pinholes at normal density, or a straight coverage boundary. Check both the
Composition and Grass close views without importing preview-only geometry or
materials into the package result.

The Call Me Sensei default is hue-preserving and uses an exact neutral
`groundAdoptTint` of `[1, 1, 1]`: it does not brighten pale terrain into
bleached roots. The profile keeps `tipHueShift` and `tipDesaturation` at zero,
so green ground stays within shades of green. Those fields remain available
for explicitly authored styles. Recipe-v3 LOD0/1/2 uses 40/14/6
primary blades; retained width compensation keeps measured integrated coverage
at 1.000/0.997/0.991. The signature Grass Shader sets `bendExponent: 1.3` so
the root-to-tip deformation reads as a painted blade arc rather than a straight
spar. `bladeBudget()` reports authored and currently drawn blades; do not infer
draw cost from placement count after camera LOD assignment. Reject a
zoom-dependent terrain color change.

```js
import { StylizedGrassField } from '@call-me-sensei/toonlab/vegetation';

const grass = new StylizedGrassField({
  placements: points.map((p) => ({ x: p.x, y: terrainHeight(p), z: p.z })),
  windResponse: 1.35, // species flexibility relative to the current world wind
  gustResponse: 0.8,
});
scene.add(grass);
grass.setPushTarget(characterObject3D); // blades bend away from the character
grass.setPushRadius(0.9);               // current scene/instance interaction field
grass.setWind({ direction: [1, 0.3], speed: 1, strength: 0.25 });
grass.setCloudShadow({ strength: 0.5, coverage: 0.45 });

// per frame:
grass.update(delta);

// live asset re-tune (flat settings, see DEFAULT_GRASS_SETTINGS):
grass.applySettings({ windResponse: 1.6, gustResponse: 0.65 });
```

One draw call for the whole field. Convenience setters mirror common groups:
`setWind`, `setSun`, `setSceneShadow({ strength, tint })` (blades darken
under tree/character shadow maps), `setCloudShadow`, `setDistanceFade({
start, end })` (collapse blades the fog has swallowed), `setPushTarget`, and
`setPushRadius`.
Backlit translucency (`backlitStrength`) gives tips a warm glow against the
sun.

Portable grass presets separate asset response from current world state.
`windResponse` and `gustResponse` belong to the species/asset; wind direction,
speed, strength, gust field, cloud-shadow field, sun/sky, push target, and push
radius belong to the active scene or instance. Constructor options and
`applySettings()` still accept those legacy runtime keys for compatibility,
but portable preset schema v2 does not serialize them. When a v1 preset is
loaded, its authored `windStrength` becomes `windResponse` relative to the
historical `0.16` default.

Grass Lab includes coordinated color palettes. A palette is asset/material
data, not a new shader: it updates `baseColor`, `tipColor`, and `shadowTint`
as one set so purple, autumn, dry, and fantasy grass retain an authored shadow
color. It does not change `shadowStrength`, asset motion response, current
weather, or the IP-wide `VegetationShaderProfile`.

```js
import {
  applyGrassColorPalette,
  createGrassSettings,
  serializeGrassPreset,
} from '@call-me-sensei/toonlab/vegetation';

const settings = createGrassSettings(
  applyGrassColorPalette(currentSettings, 'wisteria'),
);
const json = serializeGrassPreset('violet_meadow', {
  label: 'Violet Meadow',
  settings,
});
```

`GRASS_COLOR_PALETTES`, `resolveGrassColorPalette`, and
`matchGrassColorPalette` support custom UIs. Portable Grass Lab documents use
`toonlab/grass-preset`; the public API mirrors the other systems with
`createGrassPresetDocument`, `validateGrassPresetDocument`,
`parseGrassPresetDocument`, and `registerSerializedGrassPreset`. These
documents currently use schema version 2.

## Flowers

```js
import { StylizedFlowerField } from '@call-me-sensei/toonlab/vegetation';

const flowers = new StylizedFlowerField({ placements });
scene.add(flowers);
flowers.update(delta);
flowers.applySettings({ windStrength: 0.2 });
```

Instanced flowers that receive scene shadows like the grass. Settings:
`DEFAULT_FLOWER_SETTINGS` / `createFlowerSettings` /
`FLOWER_SETTING_GROUPS` / `FLOWER_SETTING_FIELD_SCHEMA`.

## Trees

For the focused stable branch-type tree, use `BranchTree`. It exposes eight
leaf silhouettes, leaf/bark textures, a portable three-tone canopy
palette, trunk bend/twist/taper, roots, and a leaf `coverageScale` that can be
tuned without resizing the tree:

```js
import { BranchTree } from '@call-me-sensei/toonlab/vegetation';

const tree = new BranchTree({
  size: 2,
  branches: { children: 4, levels: 3 },
  trunk: { bend: 0.22, radiusTop: 0.06, twist: 0.18, textureRef: barkAssetId },
  leaves: {
    shape: 'oak',
    coverageScale: 0.8,
    palette: { lit: [0.28, 0.62, 0.3], shadow: [0.08, 0.22, 0.1], crown: [0.12, 0.32, 0.13] },
  },
});
```

`branches.children` is the number of lateral children per primary parent. The
branching generator also carries a terminal continuation into the next level,
forming a leader instead of ending the trunk in a stump.

```js
import { StylizedTree, TREE_TRUNK_STYLES } from '@call-me-sensei/toonlab/vegetation';

const tree = new StylizedTree({
  size: 2,                      // 1 ≈ 3 m tree
  seed: 7,                      // deterministic per-seed variation
  canopyColor: { from: 0x4f8f3a, to: 0x77b34e }, // color spec: one color, list, blend, or HSL ranges
  leafDensity: 0.95,
  leafPlacement: 'canopy',      // or 'tips' for bare-limbed silhouettes
  vegetationShader: { preset: 'call_me_sensei' }, // reusable treatment, not tree identity
});
scene.add(tree);
tree.update(delta);

tree.applySettings({ foliage: { windStrength: 0.4 } }); // grouped settings
tree.setCloudShadow({ strength: 0.45 });
tree.setSceneFog(scene.fog); // linear THREE.Fog; updates true billboard depth
```

An authored `trunkMap` always wins. To select a different package surface,
pass `trunkSurfaceProfile` using an ID from `getTreeSurfaceProfileOptions()`.
Every generated trunk casts and receives shared sun/cloud shadows by default;
consumer scenes should not need to repair those flags.

Curved trunk (`createTreeTrunkGeometry`, `TREE_TRUNK_STYLES`) + leaf-card
canopy (`stylizedTreeFoliage.js`) in one `THREE.Group`. Settings are grouped
(`DEFAULT_STYLIZED_TREE_SETTINGS`, `STYLIZED_TREE_SETTING_GROUPS`, and
`STYLIZED_TREE_SETTING_FIELD_SCHEMA`). Repository-only showcase recipes and layout helpers power Tree Lab
(`/tree-lab/`) but are not npm assets or public runtime exports. Tree Lab's
Generation authoring scope is trees, bushes, and optional blossoms attached to
a tree canopy. Reusable canopy/bark treatment belongs to Tree Shader Lab
(`/tree-shader-lab/`).

Tree Shader Lab uses a first-party outdoor comparison scene with pine, grass,
flowers, ground, rock, props, sky, clouds, camera, and lighting. Asset colors
remain owned by the selected tree recipe while the reusable shader preserves
each species palette. All 51 Tree Shader fields remain editable without moving
asset identity into the shader document.

### Tree Shader v2 ownership audit

The fact that a GPU program reads a value does not mean the reusable shader
profile owns that value. The authoritative Tree boundary is:

| Owner | Values |
|---|---|
| Gallery tree or BranchTree asset recipe | Primary and gradient foliage colors, canopy palette, bark base color/texture, leaf sprite, alpha cutoff, stable variation seed, generic silhouette/branching, roots, LOD, and collision. It does not claim botanical species identity. |
| Tree Shader profile | Shared Lighting, Thin Surface and Weather Response coefficients; foliage gradient transfer, hue treatment, highlight/surface response, toon bands, crown response, sprite/detail influence, transmission; bark tint/flattening, highlight response, toon bands, floors, fill, rim, and vertical shading |
| Placed instance or condition | Optional instance tint/hue, variation seed, season, damage, wet/snow retention state, and similar per-tree data |
| Scene/runtime | Current sun/sky, cloud field, wind field, wetness, snow amount, fog, time, and interaction positions |
| Lab preview | Selected fixture/recipe, camera, visibility, comparison bundle, time, weather toggles, and debug view |

The 51 portable Tree Shader v2 fields are grouped as follows:

| Group | Count | What it owns |
|---|---:|---|
| Shared Lighting | 6 | shadow tint treatment, sun/sky influence, and rim response |
| Thin Surface | 6 | diffuse wrap, transmission, normal bias, and two-sided response |
| Weather Response | 6 | wet/snow response coefficients; never current accumulation |
| Foliage | 20 | gradient shape over the asset palette, hue transform/variation amplitude, surface/highlight, transmission, bands, crest, occlusion, and sprite/card influence |
| Bark / Woody Surface | 13 | multiplicative tint treatment, surface simplification/highlight, toon bands, shadow/fill/rim, and vertical grounding |

`foliage.mainColor`, `foliage.gradientColor`, and
`foliage.styleColorStrength` remain readable only through the version-1
vegetation aggregate compatibility surface. Tree Shader v2 excludes them.
Importing a v1 Tree Shader document that contains them produces migration
warnings identifying the asset recipe fields that must receive those values;
the parser does not silently keep species colors in the shader.

The Tree Shader Lab's **Preview assets** modal starts with a first-party pine
and can also list user-saved or imported fixtures. Package users discover
reviewed authored recipes through MCP and instantiate them with `StylizedTree`,
or deliberately author a focused branch-type tree with `BranchTree`. The same
effective Tree Shader is reapplied to each fixture
through `foliageCard` and `woodySurface` roles. The selected recipe and its
palette never enter the exported Tree Shader or style-bundle slot.

### Flower Shader v3 ownership audit

Flower Shader is a reusable treatment over labeled botanical inputs. It is
not a flower-species recipe and it is not a placed-flower instance.

| Owner | Values |
|---|---|
| Flower asset/species recipe | Petal and center colors, attached-leaf palette, stem base color, flower/leaf textures, alpha cutoff, center/region mask, normalized petal data, stable variation seed, geometry, bloom count, LOD, and collision |
| Flower Shader profile | Shared Lighting, Thin Surface, and Weather Response coefficients; attached-foliage gradient/hue transfer and surface response; flower roughness, highlight, emission, bands, subsurface/transmission, unlit-petal lift, petal-cup darkening, and center light/shadow response; herbaceous-stem surface, bands, shadow floor, transmission, fill, and rim |
| Placed instance or condition | Optional instance color transform, growth stage, health, season, damage, wet/snow retention state, and other one-plant overrides |
| Scene/runtime | Current sun/sky, cloud field, wind field, wetness, snow amount, fog, time, and interaction positions |
| Lab preview | Selected flower recipe, camera, visibility, comparison bundle, time, weather toggles, and debug view |

Shader-profile values are the shared rendering defaults for every compatible
flower. Asset/species values are resolved first. An explicit instance or
condition layer may transform the result later, but it must remain a separate
named layer; it must not rewrite the Flower Shader profile or the source
recipe.

The 61 portable Flower Shader v3 fields are grouped as follows:

| Group | Count | What it owns |
|---|---:|---|
| Shared Lighting | 6 | shadow tint treatment, sun/sky influence, and rim response |
| Thin Surface | 6 | petal/leaf diffuse wrap, transmission, normal bias, and two-sided response |
| Weather Response | 6 | wet/snow response coefficients; never current accumulation |
| Attached Foliage | 20 | gradient shape over the asset palette, hue transform/variation amplitude, surface/highlight, transmission, bands, crest, occlusion, and sprite/card influence |
| Flower Head | 14 | petal/center surface response, bands, transmission/subsurface, cup shading, and independent center light/shadow response |
| Herbaceous Stem | 9 | stem surface/highlight, emission, bands, shadow floor, transmission, fill, and rim |

The following fields remain readable only through the version-1 Vegetation
compatibility aggregate and are excluded from Flower Shader v3:

- `foliage.mainColor`, `foliage.gradientColor`, and
  `foliage.styleColorStrength`;
- `flower.textureTint` and `flower.tintStrength`;
- `stem.color` and `stem.colorStrength`.

Importing a Flower Shader v1/v2 document containing those fields emits a
migration warning for each value and identifies the flower/plant recipe as
the new owner. The parser does not silently preserve species colors inside a
v3 shader profile.

Flower Shader Lab's **Preview assets** modal starts with a first-party daisy
field and adds built-in, locally saved, and imported procedural flower recipes.
The daisy remains a one-click comparison fixture. Its combined material cannot
prove independent petal, center, attached-leaf, and stem controls. A labeled
procedural flower exposes `flowerPetal`, `flowerCenter`, `foliageCard`, and
`herbaceousStem` consumers and is the required fixture for full control
verification. Switching preview flowers never changes the exported shader
profile.

Trees are serializable: `treeRecipe.js` defines a versioned recipe document
(`recipeFromSettings` / `settingsFromRecipe` /
`validateTreeRecipeDocument` / `createPlantFromRecipe`), and
`treeExport.js` bakes a tree into plain exportable meshes
(`prepareTreeForExport`, crossed-card or baked foliage) for use outside the
library shaders. `StylizedBush` reuses the foliage system as a standalone
bush. `StylizedFlower` uses the same versioned plant recipe contract while
the Flower Lab (`/flower-lab/`) gives standalone flowers their own document
storage, preset gallery, and bloom-focused Generation workflow. Reusable
petal/center/leaf/stem treatment belongs to Flower Shader Lab
(`/flower-shader-lab/`).

Grass Shader Lab and Flower Shader Lab use the same first-party comparison
scene and preview controls. Their shared-base fields are editable. The grass
has an independently addressable material. The daisy uses one material for
petal, center, and stem, so it cannot
prove independent semantic controls for all three. Remaining role-specific
controls stay honestly marked unsupported for this fixture until a validation
asset supplies material splits, geometry groups, or ID masks.

Vegetation generators must preserve semantic modeled parts—root, trunk,
branch, leaf or needle, blade, petal, center, leaf, and herbaceous stem—as
well as the shader-facing material roles. The complete requirement, including
LOD/export preservation and the distinction between rock surface coverage and
actual vegetation geometry, is defined in
[Generated asset labeling and shader routing](generated-asset-labeling.md).

## Sky

Sky settings, portable preset documents, runtime ownership, and Sky Lab are
documented in [Sky system](sky.md). Sky and vegetation share current sun,
cloud-shadow, and weather inputs, but neither saved artifact owns that scene
state.

## Shared atmosphere hooks

The outdoor systems share one procedural cloud-shadow field and the
renderer's shadow maps, so a cloud or a character shades terrain, grass,
flowers, canopies, and water together:

```js
grass.setCloudShadow({ strength: 0.5, coverage: 0.45, scale: 0.012 });
tree.setCloudShadow({ strength: 0.5 });
water.setCloudShadow({ strength: 0.5 });
setEnvironmentCloudShadow({ strength: 0.5 }); // toonlab/environment
```

All of these are also plain settings fields (`cloudShadowStrength`,
`cloudShadowCoverage`, `cloudShadowScale`, `cloudShadowVelocity`) on each
system.
