# Character shading provenance (0.5)

One entry per module written or reworked for the 0.5 character-shading
rebuild: what it implements, which sections of
[character-shading-spec.md](character-shading-spec.md) it follows, and what
it was built from. Every module was written from the specification, general
real-time rendering technique, the reusable ToonLab modules listed in spec
§2, the three.js r185 sources and documentation (node material, TSL and
render-target APIs), and the reference images in
`assets-local/genshin-ref/` (look only). No earlier revision of these modules,
other checkout, Unity project or third-party toon/anime shader source was
consulted.

## Settings

### `src/toon/settings/fieldSchema.js`
Field-definition helpers (number, boolean, colour, select, vector, list,
texture) that drive value normalisation, the public field schema and preset
sanitising from one description per group. Spec §3 (field schema shape), §4
(groups, `enabled`, display-space colours). Built from the spec and the
settings-module conventions already used across ToonLab (post-processing,
water: `{ id, group, key, label, description, type, range, options,
defaultValue, serializable }`).

### `src/toon/settings/lightSettings.js`
The `light` group. Spec §4.1, §5.2. Values are the spec's defaults; `maxTint`
and `shadowSkyTint` were added while tuning the day cycle and the back-lit
hair against `sunset-backlit.png` and the acceptance targets in §9.

### `src/toon/settings/shadingSettings.js`
The `shading` group (terminator per surface, softness, anti-aliasing, lighting
map). Spec §4.2, §5.3.

### `src/toon/settings/rampSettings.js`
The `ramp` group (display-space shadow tones, terminator band, MMD/MToon
import switches). Spec §4.3, §5.6; tone and band defaults are the spec's
measured values.

### `src/toon/settings/faceSettings.js`
The `face` group (face map, face normals, head space, nose shadow, eye-white
shade). Spec §4.4, §5.4, §5.10.

### `src/toon/settings/shadowSettings.js`
The `shadows` group (scene, character shadow map, screen-space hair shadow).
Spec §4.5, §5.5.

### `src/toon/settings/rimSettings.js`
The `rim` group. Spec §4.6, §5.8.

### `src/toon/settings/highlightSettings.js`
The `highlights` group (thresholded specular per surface and masks, hair
ring, eye glint, stocking streak). Spec §4.7, §5.7, §5.10. Hair-ring offset,
width and strand values were chosen by rendering Ganyu against
`expression-1-face.png`.

### `src/toon/settings/outlineSettings.js`
The `outline` group (per-surface widths, screen-space correction, ink,
saturation/hue step, lighting mix, face depth push, width maps). Spec §4.8,
§5.9.

### `src/toon/settings/mapsSettings.js`
The `maps` group and the per-material map resolver (normal, AO, emissive,
matcap, detail, roughness/metalness, specular colour; the userData texture
list used for colour spaces and texture waits). Spec §4.9, §5.11; material
properties from three.js `MeshStandardMaterial`/`MeshMatcapMaterial` and the
MMD loader's `matcapCombine`.

### `src/toon/toonSettings.js`
The settings registry: groups, field schema and metadata, presets
(`default`, `call_me_sensei`, `showcase`), resolution defaults → preset →
overrides, sanitising, preset documents at schema version 2 (version 1
rejected). Spec §3, §4.10. Document plumbing reuses ToonLab's
`src/core/presetDocuments.js`.

## Conversion

### `src/toon/characterParameters.js`
Resolved settings → the character material's uniform values, per role and
per role weight (skin/face/hair suffixes, so the shader blends parameters and
evaluates one terminator). Spec §4 (per-role fields), §5.3 (parameter
blending), §7.

### `src/toon/toonMaterialAdapter.js` (reworked)
Keeps ToonLab's conversion logic (roles, alpha policy, texture waits, outline
hulls, fur shells, MToon/MMD handling, the report) and now builds the new
character material from resolved settings; adds live retune through uniform
writes, debug-view resolution, lazily compiled dithering, and the
`retired-settings-group` report code. Spec §3, §7, §8.

### `src/toon/sourceShading.js` (reworked)
Authored per-material shading (userData conventions, VRM MToon, MMD toon
ramps) mapped onto the new material's parameters: MToon shift/toony →
terminator/softness, MMD ramp → display-space tone. Spec §4.3, §7. MToon
property names from `@pixiv/three-vrm`'s material.

### `src/toon/characterRenderPasses.js`
Depth prepass (reusing `chunks/scene-depth-color-pass.js`), character shadow
map fitted in light space, head tracking (headBone.js helpers, face frame
from the face bake), character mask, per-mesh cached pass variants. Spec §6.

## Shaders (`src/shaders-tsl/character/`)

### `sceneLights.js`
Scene-light collector shared by characters and the environment
(`toonSceneLights`, `syncToonSceneLights`): main light (marked or brightest),
ambient + light-probe L0, hemisphere, point and spot lights in view and world
space, one collection per render call. Spec §3, §4.1 (light sources). View-
space conventions follow what `src/shaders-tsl/environment.js` consumes.

### `characterState.js`
Per-character shared uniform/texture nodes (head frame, prepass and shadow
map) and the root/material → state maps. Spec §6.

### `characterMaterial.js`
The node material assembly: albedo and painted details, lighting normal
(normal map, face field), terminator and face map, cast shadows, shadow tone
and band, shadow-side light, local lights, highlights, rim, emission, debug
views; the outline hull (view-space expansion, face push, ink); depth and
mask pass variants; hidden-fragment rejection. Spec §5, §5.9, §5.12, §8.

### `surfaceLight.js`
Sun colour (hue desaturated in display space, level capped), sky floor/cap,
light saturation limit, shading direction (camera key blend, elevation cap),
local-light cel bands. Spec §5.2.

### `castShadows.js`
Character shadow map sampling (normal/slope bias, bilinear comparisons,
coverage fade, face occluders ignored by face receivers), screen-space hair
shadow against the prepass, the face-depth encoding of the pass targets.
Spec §5.5, §6.

### `highlightsRim.js`
Thresholded specular, the hair ring, matcap lookup, the depth rim and
silhouette rim with the thin-strand test. Spec §5.7, §5.8.

### `paintedDetails.js`
Nose-shadow leaf (the outline formula and constants given in spec §5.10),
eye-white lid shade, stocking streak. Spec §5.10.

### `displayColor.js`
Display-space (sRGB) multiply, chroma and HSV helpers. Spec §4 (display-space
multipliers), §5.9 (ink saturation and hue step). Standard colour-space
formulas.

### `debugViews.js`
The debug view table (names, labels, values). Spec §5.12.

## Verification and docs

### `scripts/verify-toon-character-shading.mjs` (rewritten)
Pipeline checks kept (roles, head frame, alpha, colour factors, skin
evidence, MToon/MMD import, importer outline slots, eye layering, automatic
roles, bakes, outline flags, retune) against the new schema, plus presets,
preset documents, scene lights, debug views and the render-pass API.
Spec §9.1.

### `docs/toon-shading.md`
User-facing guide. Spec §9.6.
