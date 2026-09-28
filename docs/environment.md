# Environment shading

The licensed ToonLab pack is maintained as a separate native reference
before any Call Me Sensei treatment is applied. See the
[ToonLab reference baseline](toonlab-reference-baseline.md) for the
documented ToonLab renderer, lighting, RVT, post-process, and capture contract.

A modern anime-style scene shader for rooms, props, buildings, manufactured
assets, and terrain. It targets three
input classes with no shader edits: convention-named texture packs
(Liyue-style `Diffuse/SMBE/LSAB/ESA/Normal` siblings), standard glTF scenes,
and untextured/flat-color scenes.

```js
import {
  applyEnvironmentShader,
  createEnvironmentSunRig,
  createEnvironmentLampRig,
  captureEnvironmentAmbientProbe,
  createEnvironmentPlanarReflection,
  advanceEnvironmentShaderTime,
} from '@call-me-sensei/toonlab/environment';

await applyEnvironmentShader(root, {
  environmentBox,
  hasSun: true,
  preset: 'call_me_sensei',
  scenario: 'interiorDay',
});

const sun = createEnvironmentSunRig({ scene, environmentBox });
const lamps = createEnvironmentLampRig({ scene, environmentBox, root, spot: { castShadow: true } });
captureEnvironmentAmbientProbe({ renderer, scene, position: roomCenter });

// per frame:
advanceEnvironmentShaderTime(delta);
```

(Inside this repo the labs import from `../../src/environment/...`.)

## Adapter and settings

`applyEnvironmentShader(root, options)` walks the scene, resolves texture
sets, classifies material roles and manufactured-material identity, resolves
IP profiles, and converts materials. Configuration is
`{ preset, scenario, features, parameters, materialLook }`; the named preset is
resolved first, `settings` may refine that baseline, and explicit feature,
parameter, and material-look options win last. The global features and
parameters are normalized by `createEnvironmentSettings()`:

```js
await applyEnvironmentShader(sceneRoot, {
  features: { packedMap: true, shadowMask: true, skyTint: true, spotLights: true },
  parameters: {
    exposure: 0.95,
    ambientLightInfluence: 0.22,
    shadowTintColor: [0.86, 0.82, 0.78],
    saturation: 1.08,
  },
});
```

`materialLook` is a sparse profile table layered over that catch-all. Base
material is data, not a shader fork: metal, wood, masonry, and glass normally
share the same ToonLab node-material implementation. Only incompatible render
behavior selects a small shader family (`opaque`, `alphaCutout`,
`translucent`, `transmissive`, or `unlit`).

```js
await applyEnvironmentShader(sceneRoot, {
  assetId: 'clocktower-a',
  objectClass: 'buildingExterior',
  materialLook: {
    version: 1,
    default: { parameters: { specularStrength: 0.12 } },
    baseMaterials: {
      metal: { parameters: { specularStrength: 0.28 } },
      mineral: { parameters: { specularStrength: 0.04 } },
      glass: { parameters: { specularStrength: 0.42 } },
    },
    objectClasses: {
      buildingExterior: { parameters: { normalMapStrength: 0.72 } },
    },
    assets: {
      'clocktower-a': { parameters: { triplanarEdgeHighlight: 0.82 } },
    },
  },
});
```

Profiles resolve in this order: global catch-all, `materialLook.default`,
base material, finish, render mode, structural role, content flags, object
class, then stable asset id. A later sparse profile only overrides fields it
declares. This makes the default responsible for the common 80%+ while an IP
can treat glass or clear-coated metal differently, and a rare hero asset can
receive a final adjustment without mesh-name conditionals.

All 72 fields are in the [settings reference](settings-reference.md)
(`ENVIRONMENT_SETTING_GROUPS` / `ENVIRONMENT_SETTING_FIELD_SCHEMA`); color
parameters accept `THREE.Color`, hex strings/numbers, `{ r, g, b }`, or
`[r, g, b]`. Runtime re-tuning goes through
`applyEnvironmentSettingsToMaterial(material, settings)`.

The shader consumes standard maps — `normalMap` (derivative-TBN, no tangents
required), `aoMap`/`lightMap` (uv1/uv2-aware, warm-tinted occlusion,
painterly lightmap remap), `emissiveMap` (scaled down by day, full at night)
— plus convention-pack siblings found by filename probing. Every sampler is
define-gated per material, so unused maps cost nothing. Author hooks:
`material.userData.envNormalMap/envAoMap/envLightMap/envEmissiveMap`.

## Classification, automatic audit, and roles

Materials get environment roles — foliage, window cutout, emissive, shadow
mesh, AO overlay, glossFloor — resolved in priority order:

1. `userData.envRole` on the material or mesh,
2. conversion option `roleOverrides: [{ match, role }]`,
3. built-in keyword heuristics (`classifyEnvironmentMaterialRole`).

The manufactured classifier reads explicit `urbanMaterial` metadata first,
then material/mesh names, alpha/transmission/emission state, metalness, and
other PBR cues. Use it before conversion:

```js
import {
  analyzeManufacturedAsset,
  applyManufacturedMaterialManifest,
} from '@call-me-sensei/toonlab/environment';

const audit = analyzeManufacturedAsset(root);
console.table(audit.records);

// Optional durable sidecar for an asset that cannot preserve glTF extras:
applyManufacturedMaterialManifest(root, sidecarJson);
```

`applyEnvironmentShader` returns a `classification` report containing
`{ object, material, role, source, manufactured, appliedProfiles }` per
material, plus the resolved asset id/object class and manifest warnings.

Code detection is the normal first pass and is sufficient for clean,
semantically named assets with normal PBR separation. It deliberately does
not infer physical identity from RGB alone. Brown pixels may be wood, rust,
brick, leather, or dirt. A visual model is optional offline assistance for
ambiguous scans and mixed texture atlases; its result must still become
reviewable material splits, an ID mask, or explicit manifest assignments.
No visual model is required at runtime.

For a style-bundle-ready manufactured target, turn the conservative classifier
into a reviewed proposal through the styles entry point:

```js
import {
  applyManufacturedStyleTargetLabelProposal,
  proposeManufacturedStyleTargetLabel,
} from '@call-me-sensei/toonlab/styles';

let proposal = proposeManufacturedStyleTargetLabel(root, {
  assetId: 'project:bench-01',
  targetId: 'scene/bench-01',
});

// Generic or low-confidence entries keep proposal.ready false. Review them;
// do not lower the threshold just to force acceptance.
proposal = proposeManufacturedStyleTargetLabel(root, {
  assetId: 'project:bench-01',
  targetId: 'scene/bench-01',
  materialOverrides: {
    BenchHardware: {
      baseMaterial: 'metal',
      finish: 'painted',
      renderMode: 'opaque',
      structuralRole: 'secondaryStructure',
    },
  },
});
applyManufacturedStyleTargetLabelProposal(root, proposal);
```

The proposal is read-only. Applying a blocked proposal throws before writing
IDs, classifications, or the root label. Strict bundle application then
reconciles that label against the live material slots before its first shader
mutation.

The [Manufactured Material Lab](/manufactured-material-lab/) displays every
resolved tag and confidence, permits temporary non-destructive overrides, and
exports an approved `.toonlab-materials.json` sidecar.

### Non-GLB assets

Classification happens after loading, on the Three.js `Object3D`, so FBX,
OBJ/MTL, USDZ, VRM, PMX/PMD, and procedural meshes use the same shader and
audit path. glTF/GLB is preferred because `extras` reliably becomes
`userData`. Other containers vary in custom-metadata support; keep a sidecar
manifest beside the source and apply it after loading. Procedural code may
assign `material.userData.urbanMaterial` directly. Selectors use stable asset
ids, material names, object names, or object paths—never runtime UUIDs.

## Presets and preset documents

An environment preset is a **style** — an identity, never a baked moment —
and every style resolves in every canonical **scenario** (venue × time of
day: `interiorDay`, `interiorEvening`, `interiorNight`, `exteriorDay`; see
`ENVIRONMENT_SCENARIOS` / `getEnvironmentScenarioOptions()`).

`resolveEnvironmentPreset(name, scenario?)` returns
`{ features, materialLook, parameters, rig }`. `materialLook` is IP/style
identity and remains stable while scenarios change lighting and venue state.
Styles: `default`, `interiorStudio` (tuned
for untextured scenes), `showcase`, and `call_me_sensei` — the
studio-managed signature look, curated and updated over releases, with every
scenario authored. Without a `scenario` the style's base look is returned;
styles that do not author a scenario inherit the canonical rendition (the
Default style's variant). The historical single-moment ids (`interiorDay`,
`interiorEvening`, `interiorNight`, `exteriorDay`) resolve through
`ENVIRONMENT_PRESET_ALIASES` as the Default style at that scenario,
byte-identical to the presets they replaced. The `rig` hints (`sun`,
`spotShadows`, `probe`, `planarReflection`, `dustMotes`, `bakeVertexAo`,
`lampIntensity`, `timeOfDayHour`) tell the host app which rigs to
construct — the labs consume them automatically via `?envStyle=` and
`?envScenario=`. The older `?envPreset=` identity key remains readable for
existing bookmarks.

Register your own, either in code or as a shareable JSON document
(`toonlab/environment-preset`, versioned and validated like toon presets):

```js
import {
  registerEnvironmentPreset,
  createEnvironmentPresetDocument,
  validateEnvironmentPresetDocument,
  registerEnvironmentPresetDocument,
} from '@call-me-sensei/toonlab/environment';

registerEnvironmentPreset('myRoom', {
  features: {...},
  materialLook: {
    version: 1,
    baseMaterials: {
      glass: { parameters: { specularStrength: 0.4 } },
    },
  },
  parameters: {...},
  rig: {...},
});

const document = createEnvironmentPresetDocument('myRoom', { label: 'My Room' });
// ...save/share JSON.stringify(document), then on another machine:
const result = validateEnvironmentPresetDocument(document);
if (result.ok) registerEnvironmentPresetDocument(result.value, { overwrite: true });
```

## Rigs

Stylized light rigs positioned relative to the environment bounds
(`environmentRelativePoint`):

- `createEnvironmentSunRig({ scene, environmentBox })` — key directional
  light plus visible sun disk, spill, beam, and shaft quads. Its public
  `intensity` is expressed in ToonLab sun units: `1` means one sun and the rig
  applies the required `PI` conversion at the Three light boundary.
- `createEnvironmentLampRig({ scene, environmentBox, root, spot })` — lamp
  point/spot lights with optional shadowed downlight spots;
  `applyEnvironmentLampEmissive(root, multiplier)` couples fixture emissive
  textures to lamp intensity.
- `createEnvironmentBackdrop(...)` — timed window backdrop
  (morning/day/evening/night images, `environmentBackdropPeriodForHour`).
- `createEnvironmentDustMotes(...)` — deterministic drifting motes for sun
  shafts.

## Time of day

```js
import { sampleEnvironmentTimeOfDay, applyEnvironmentTimeOfDay } from '@call-me-sensei/toonlab/environment';

const state = sampleEnvironmentTimeOfDay(17.5); // hour 0..24
applyEnvironmentTimeOfDay(state, { sunRig, lampRig, backdrop, environmentRoot });
```

`sampleEnvironmentTimeOfDay(hour)` interpolates keyframed sun
color/intensity/position, ambient and lamp scales, sky tints, fog color, and
backdrop period (sunrise 06:00, sunset 18:00); `applyEnvironmentTimeOfDay`
pushes the sampled state everywhere in one call. In the labs: `?envTime=14`,
`?envFreezeTime=1` for deterministic captures.

## Ambient probe

`captureEnvironmentAmbientProbe({ renderer, scene, position })` renders a
six-direction probe at a point (typically the room center) so ambient light
follows the room's own palette instead of a flat constant. Blend with the
`ambientProbeBlend` parameter; colors land on every converted material via
`setEnvironmentAmbientProbeColors`.

## Planar reflection

`createEnvironmentPlanarReflection({ renderer, scene, camera, ... })` adds
one oblique-clipped mirror pass for glossy floors (`glossFloor` role),
fresnel-faded, including character reflections. Call `reflection.update()`
per frame. `detectEnvironmentFloorY(root)` finds the floor height.

## Manufactured mirrors

`createManufacturedReflectionProbe({ renderer, scene })` creates the default
scene-level provider for materials classified as `glass + mirror`. Call
`probe.capture(root)` after loading the manufactured asset and whenever room
contents or lighting change. The provider locates mirror consumers, hides them
during the six-face capture, and returns the cubemap plus consumer count.

This probe is deliberately separate from the material manifest: the asset
requests mirror behavior through classification, while each scene chooses its
reflection budget. Use a planar-reflection provider for large hero mirrors;
when no provider exists, the shader may retain only its roughness/Fresnel
fallback.

## Vertex AO for untextured scenes

With `bakeVertexAo: 'auto'` (the default), untextured meshes get per-vertex
ambient occlusion baked at conversion — BVH-accelerated
(`three-mesh-bvh`), deterministic, budgeted with explicit skip warnings.
Direct API: `bakeEnvironmentVertexAo`. Untextured materials also get a
designed gradient (floor falloff + sky tint) so flat-color rooms read
art-directed; the `interiorStudio` preset tunes the whole look for this
class.

## Interior occlusion, fog, cloud shadows

- `setEnvironmentOpenings(openings)` + the `interiorOcclusionStrength`
  parameter darken interiors based on where the real openings (windows,
  doors) are.
- Converted materials participate in `scene.fog`, plus world-height fog via
  `heightFogDensity/Falloff/Color`.
- `setEnvironmentCloudShadow({ strength, coverage, scale, velocity })`
  drives the same procedural cloud-shadow field the grass, trees, and water
  use; advance the shared clock once per frame with
  `advanceEnvironmentShaderTime(delta)`.

## Debug views

`?envDebug=<mode>` in the labs or `setEnvironmentDebugOutput(root, mode)` in
code renders one term in isolation:

```text
albedo | lit | ambient | direct | shadowMask | pointLight | spotLight |
occlusion | bakedGi | normal | vertexAo | specular | emissive | windowMask |
roomOcclusion | alpha
```

Debug branches compile out entirely unless requested. Captures freeze the
shared environment clock automatically (`?envFreezeTime=1`).
