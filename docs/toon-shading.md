# Character toon shading

ToonLab's character shader gives a Three.js character the flat, painted look
of modern anime games: the lit side is the texture under the light's colour,
one crisp terminator separates it from a shadow side painted in a per-surface
tone, faces are shaded by a face map instead of their normals, and ink lines
take a deeper, more saturated version of the colour under them.

It runs on three.js r185 `WebGPURenderer` (native WebGPU, with the WebGL2
fallback) as TSL node materials. Import it from
`@call-me-sensei/toonlab/toon`; the settings registry alone is
`@call-me-sensei/toonlab/toon-settings`.

## Quick start

The character runtime converts, registers and updates a character for you:

```js
import { createCharacterRuntime } from '@call-me-sensei/toonlab/character';
import { createCharacterRenderPasses } from '@call-me-sensei/toonlab/toon';

const passes = createCharacterRenderPasses({ camera, renderer, scene });
const character = await createCharacterRuntime({
  parent: scene,
  renderPasses: passes,
  renderer,
  toon: { preset: 'call_me_sensei' },
  url: '/models/hero.vrm',
});

function frame(delta) {
  character.update(delta);
  passes.update();            // before rendering the scene
  renderer.render(scene, camera);
}
```

Call `passes.setSize(width, height, pixelRatio)` whenever the canvas changes.

To convert a model you loaded yourself:

```js
import {
  applyToonShader,
  createCharacterRenderPasses,
} from '@call-me-sensei/toonlab/toon';

const result = applyToonShader(model, { preset: 'call_me_sensei' });
console.table(result.report);      // what conversion decided, and why
passes.registerCharacterRoot(model);
```

`applyToonShader(root, options)` accepts `preset`, `settings` (a settings
object or a preset id) and per-group overrides (`light`, `shading`, `ramp`,
`face`, `shadows`, `rim`, `highlights`, `outline`, `maps`, `baseTexture`,
`alpha`, `autoRoles`, `sticker`, `fur`), plus `materialRoles` and
`debugOutputMode`. It returns `{ report, settings, materialRoleSummary,
convertedMeshCount, primarySkinnedMesh, … }`.

## The look

- **Lit side** — the albedo times the light's colour. A physically bright sun
  is scaled down as a whole (`light.sunMax`), so a warm sun keeps its hue, and
  `light.sunTint` decides how much of that hue the character takes. The
  light's saturation is limited (`light.maxTint`), so sunsets are gently warm
  and nights gently cool rather than orange or blue.
- **Sky** — ambient lights, light probes (their L0 band) and hemisphere
  lights form the sky light. It is a floor under the sun (`light.skyFloor`,
  `light.skyMax`), never an additive wash.
- **Terminator** — one soft step in N·L at the surface's
  `shading.terminator`, anti-aliased to about a pixel. Where an atlased
  material blends skin, face and hair by per-pixel role weights, the
  parameters are blended and the step evaluated once, so there is never a
  second, half-strength terminator.
- **Shadow side** — the albedo times a display-space tone chosen per surface
  (`ramp.tone`): cool lavender-grey for cloth and hair, warm peach for skin.
  Just past the terminator a narrow band (`ramp.band`) is warmer and more
  saturated; greys and blacks get no band. The shadow side is lit at the
  light's level with its hue leaning toward the sky (`light.shadowSkyTint`),
  so shadows stay colourful under a warm sun.
- **Cast shadows** move pixels into the shadow tone; they never darken the
  tone itself.

## Presets

| Id | Use |
|---|---|
| `default` | The measured defaults of every group. |
| `call_me_sensei` | The product look: softer sun hue, silhouette rim, cloth highlights only where a mask says so, deeper and more saturated ink. |
| `showcase` | `call_me_sensei` with a little more rim and hair ring, for the `showcase` post-processing preset. |

```js
import {
  createToonSettings,
  registerToonPreset,
} from '@call-me-sensei/toonlab/toon-settings';

registerToonPreset('my_look', {
  label: 'My Look',
  settings: { ramp: { tone: { cloth: [0.8, 0.8, 0.95] } }, rim: { silhouette: { body: 0.6 } } },
});
const settings = createToonSettings({ preset: 'my_look', outline: { inkHueShift: 0.03 } });
```

Settings resolve as defaults → preset → overrides. Every group has
`enabled`. Colours are `[r, g, b]` in 0–1; tones, band colours, tints and inks
are **display-space multipliers** — pick them off a reference the way you
would in a paint program. The complete field list, with ranges and
descriptions, is in [settings-reference.md](settings-reference.md).

### Preset documents

Presets serialise as `toonlab/toon-preset` documents at schema version 2:

```js
import {
  parseToonPresetDocument,
  serializeToonPreset,
} from '@call-me-sensei/toonlab/toon-settings';

const json = serializeToonPreset('my_look', { settings });
const parsed = parseToonPresetDocument(json);   // { ok, value, errors, warnings }
```

Documents written with version 1 use retired groups and are rejected with an
explanatory error; they are not converted. Re-create them from a current
preset. Unknown groups and keys are ignored with a warning; textures are
runtime-only and never serialised.

## Settings groups

| Group | What it controls |
|---|---|
| `light` | Sun level and hue, sky floor and cap, shade and shadow-side sky tint, camera-relative key (`cameraLight`), sun elevation cap, local (point/spot) light bands, highlight floor in shadow. |
| `shading` | Terminator position per surface, softness, anti-aliasing, and the lighting map: the automatic occlusion bias (creases reach the shadow earlier) and an authored bias texture. |
| `ramp` | Shadow tones per surface, the terminator band, MMD toon-ramp and VRM MToon import. |
| `face` | Face map (automatic bake or authored), mirroring, softness, face normals, head tracking, scene-shadow strength on faces, the nose shadow and the eye-white shade. |
| `shadows` | Scenery sun/cloud shadow strength, the character shadow map (strength, sun or camera-relative direction, biases, softness) and the screen-space hair shadow. |
| `rim` | Depth rim (or view-angle rim), width in metres, threshold, silhouette rim, intensities, tint, fade distance. |
| `highlights` | Thresholded specular per surface and its masks, the hair ring, the eye glint, the stocking streak. |
| `outline` | Hull widths per surface, screen-space width correction, ink per surface, ink saturation and hue step, lighting mix and brightness range, face depth push, width maps. |
| `maps` | Strengths of the source material's normal, AO, emissive, matcap, detail, roughness/metalness and specular-colour maps. |
| `baseTexture`, `alpha`, `autoRoles`, `sticker`, `fur` | How the model's materials are read: colour policy, cutouts and draw order, automatic face/skin/hair roles, decals, shell fur. |

## Faces

Faces are not lit by their normals. A **face map** stores, per texel, how far
the light may swing round the head (0 = in front, 1 = behind) before that texel
falls into shadow; the shader compares the light's azimuth in the tracked head
frame against it, mirroring the map for light from the other side. The result
is one clean shadow shape that sweeps across the face as the light moves.

- A face without an authored map gets one baked from its geometry at
  conversion (`face.map.auto`), including the nose's cast shadow.
- Author your own with `material.userData.toonFaceShadowMap` or
  `face.map.texture` (`face.map.mirror`, `midU`, `uvChannel` describe it).
- Face normals are replaced by a smooth head-shaped field for highlights
  and rim (`face.normals`).
- A small leaf-shaped **nose shadow** is painted beside the nose ridge on the
  side away from the light, where the bake found a nose the texture does not
  already draw (`face.nose`).
- Eye whites get a shade band under the upper lid unless their texture
  already paints one (`face.eyeWhiteShade`).

Models whose materials name no face (one atlased material from a generator)
get per-vertex face, skin and hair weights from `autoRoles`.

## Cast shadows and render passes

`createCharacterRenderPasses({ renderer, scene, camera })` returns
`registerCharacterRoot`, `unregisterCharacterRoot`, `update`, `setSize`,
`setCharacterMaskEnabled`, `characterMaskTexture`, `dispose` and
`TOON_CHARACTER_LAYER`. Each frame, before the scene renders, it runs only
the passes the registered materials need:

- a **depth prepass** of the scene (drawing-buffer size) for the depth rim,
  the screen-space hair shadow and hidden-fragment rejection;
- a **character shadow map** of the registered characters only, fitted to
  them from the sun (or a camera-relative direction): limbs on the body, hair
  on the neck, the chin on the throat;
- **head tracking** for the face map, face normals and hair ring;
- an optional **character mask** for character-aware post effects
  (`setCharacterMaskEnabled(true)`, then pass `characterMaskTexture` to the
  post pipeline).

Scenery shadows come from the shared environment sun-shadow pass and the Sky
System's cloud shadow. The screen-space shadow looks a few millimetres toward
the light in the prepass: bangs shadow the forehead, hair shadows the cheeks,
but a face never shadows itself.

## Authored data

Per-material data wins over the preset and survives live retunes:

| Source | Effect |
|---|---|
| `userData.toonShadeColor` / `toonShadeMap` | Absolute shadow colour (capped at the albedo's luminance). |
| `userData.toonRampMap` | 1D shadow-tone ramp: u = 0 at the terminator, 1 deepest. |
| `userData.toonShadingGradeMap` | Authored lighting map (per-texel shadow bias). |
| `userData.toonFaceShadowMap` | Face map. |
| `userData.toonRoleMask` | Role mask texture (R skin, G face, B hair). |
| `userData.toonSpecularMaskMap` | Specular mask. |
| `userData.toonOutlineWidthMap` | Outline width multiplier. |
| VRM MToon | Shade colour/texture, shading shift/toony (terminator), outline colour, parametric rim, matcap. |
| MMD | The edge flag (no outline where the author turned it off); the model's own toon ramp as its tone with `ramp.importMmdRamp`. |

## Live retuning

```js
import { applyToonSettingsToMaterial, createToonSettings } from '@call-me-sensei/toonlab/toon';

applyToonSettingsToMaterial(model, createToonSettings({ preset: 'call_me_sensei', light: { sunTint: 0.6 } }));
```

A retune writes uniforms; it never rebuilds a material. Changes that alter
what a material samples (a new texture, turning the automatic face map on
after conversion) need a new conversion. `setToonDitherOpacity(root, value)`
fades a whole character with a screen-door pattern (no sorting needed).

## Debug views

`setToonDebugOutput(root, mode)` selects a view with a uniform write:
`off`, `albedo`, `sourceAlbedo`, `litAmount`, `terminator`, `sceneShadow`,
`characterShadow`, `screenSpaceShadow`, `faceMap`, `shadowColor`,
`lightColor`, `rim`, `depthRim`, `specular`, `hairHighlight`, `roles`,
`alpha`, `lightingMap`, `normalMap`, `ao`, `emissive`, `matcap`
(`TOON_DEBUG_OUTPUT_MODES`, `TOON_DEBUG_OUTPUT_LABELS`,
`resolveToonDebugOutputMode` also accept common aliases).

## Conversion report

`applyToonShader` returns a plain report of what it decided. Codes include
`auto-roles-applied`, `auto-roles-skipped`, `no-face-role`,
`face-shadow-map-baked`, `shading-grade-baked`, `eye-white-lid-baked`,
`eye-white-lid-painted`, `sheer-fabric-detected`, `role-demoted-not-skin`,
`texture-unavailable`, `alpha-data-channel`, `alpha-soft-blend`,
`alpha-cutout-skipped`, `vertex-buffer-budget`, `mtoon-imported`,
`mmd-toon-imported`, `importer-outline-slots-removed`,
`painted-eye-highlights`, `no-head-frame` and `retired-settings-group`
(settings passed under a group name that no longer exists).

## Engineering notes

- Characters are not tone-mapped by default (`material.toneMapped = false`).
- WebGPU binds at most 8 vertex buffers per draw. A skinned mesh uses five;
  role weights one more; all per-vertex bakes share one `toonBake` attribute.
  When a mesh would exceed the limit, conversion drops optional bakes (details
  first, then the occlusion bias, then the automatic face map) and reports
  `vertex-buffer-budget`.
- Large MMD skeletons skin through a storage buffer on the WebGL2 backend in
  every pass.
- VRM 0.x roots are turned 180° by their importer; the head frame is
  calibrated in the character's own frame, so this and an already-turned
  character both track correctly.
