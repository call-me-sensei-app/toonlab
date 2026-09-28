# ToonLab 0.5 character shading — build specification

This is the specification for ToonLab's character toon shader, settings and
character render passes as of 0.5.0. It describes what the shader must do and
look like. It deliberately does not describe any previous implementation.

## 0. Rules for the implementer

- Build from this document, general knowledge of standard real-time
  rendering techniques, the ToonLab modules listed as reusable in §2, and the
  reference images in §9.
- Do not open or search:
  - this repository's git history (`git log -p`, `git show <old rev>`,
    `git diff` against older commits, the reflog);
  - any other checkout of this repository (`../toonlab`, `../toonlab-bak`,
    `../toonlab-pro`, `../artifacts`, `../release-candidates`, anything
    outside this worktree except the gitignored `assets-local/` it links to);
  - `/Users/juminoz/CascadeProjects/cms/**`, any Unity project, `~/.claude/**`,
    `/private/tmp/**`;
  - third-party anime/toon shader packages or their source (published
    npm tarballs of this package included).

  `node_modules/three` and `node_modules/@pixiv/three-vrm*` (to read MToon
  material *properties*) are fine.
- Name things in ToonLab's own vocabulary (§4 gives the groups). Where a
  concept exists in every toon shader (a terminator, an outline width), a
  plain descriptive name is fine; do not reach for names you may have seen in
  other shaders' property lists.
- Choose your own formulas and constants. Where this document gives numbers
  they are ToonLab's measurements or design values — use them.
- Keep a provenance note per new module in `docs/design/provenance.md`:
  what it implements, which sections of this spec and which references it
  was built from.

## 1. The look

The target is the character rendering of Genshin Impact and Honkai: Star
Rail — flat, clean, painted:

- **Lit side = the albedo** under the light's colour. A neutral daylight
  sun leaves texture colours unchanged; no additive ambient washes them out.
- **One crisp terminator** between light and shadow, slightly softened, with
  a narrow warmer, more saturated band just inside it.
- **Shadow side = albedo × a shadow tone** chosen per kind of surface:
  cool lavender-grey for cloth and hair, warm peach for skin. Dark cloth stays
  dark and slightly violet; whites go blue-grey; nothing turns muddy or grey.
- **Faces are shaded by a face map** (a per-texel threshold of how far the
  light may swing before that texel goes dark), not by their normals, so the
  face shadow is one clean shape that sweeps as the light moves, plus a small
  painted nose shadow.
- **Ink outlines** coloured as a deeper, more saturated version of the
  surface under them (navy on periwinkle hair), not grey or black.
- **Restrained highlights**: a band ring on hair, masked specular, a thin
  streak on stockings, matcap on metal. Unmasked cloth is matte.
- **Depth rim**: a thin lit edge where a surface stands in front of a far
  background, on the lit side and faintly around the silhouette.
- **Cast shadows** (scenery, the character's own limbs and hair, bangs on the
  forehead) move pixels into the shadow tone; they never darken the tone
  itself.
- **Environment light** tints the whole character: warm low sun, cool shade,
  dim cool night.

Measured targets from Genshin frames (sRGB, display space) are in §9.

## 2. What exists and stays

ToonLab's conversion pipeline around the shader is kept. You may read and
modify these modules:

| Module | Role |
|---|---|
| `src/toon/toonMaterialAdapter.js` | Converts a model's materials to toon materials: role classification, alpha policy, texture waits, outline hulls, fur shells, MToon/MMD handling, conversion report, live retuning. **Keep its conversion logic; replace how settings reach the material** (it currently imports modules that were removed). |
| `src/toon/sourceShading.js` | Reads authored shading data (MToon, MMD toon ramp, `userData.toon*`). Keep; adapt its outputs to your material inputs. |
| `src/toon/autoRoles.js`, `skinEvidence.js` | Automatic face/skin/hair roles per vertex or per texel. |
| `src/toon/faceShadowBake.js` | Automatic face map bake + nose-shadow placement (`geometry.userData.toonNoseMark`). |
| `src/toon/occlusionBake.js` | Local occlusion per vertex (drives the automatic lighting-map shadow bias). |
| `src/toon/featureBakes.js` | Eye-white lid position and sheer-fabric (stocking) weight per vertex. |
| `src/toon/bakeAttribute.js` | The shared `toonBake` vec4 vertex attribute (xy face-map coordinates, z occlusion, w per-material detail). |
| `src/toon/alphaCoverage.js`, `headBone.js`, `texturePixels.js` | Alpha evidence, head frame / character frame, texture pixel access. |
| `src/toon/settings/alphaSettings.js`, `autoRolesSettings.js`, `baseTextureSettings.js`, `stickerSettings.js`, `furSettings.js` | Settings groups that stay (fur may rename its fields). |
| `src/core/materialRoles.js` | Material name → role classification. |
| `src/shaders-tsl/chunks/character-roles.js` | Role ids and role-weight plumbing. |
| `src/shaders-tsl/chunks/character-skinning.js` | Storage-buffer skinning for large MMD skeletons. |
| `src/shaders-tsl/chunks/pass-depth-color.js` | Depth-as-colour pass material. |
| `src/shaders-tsl/chunks/environment-sun-shadow.js`, `src/sky/cloudShadow.js` | Scene sun shadow and cloud shadow sampling (shared with the environment). |
| `src/character/*`, `src/post/*`, `src/environment/*`, `src/shaders-tsl/environment.js` | Callers you must keep working. |
| `labs/toon-review/` | The review lab used for acceptance (§9). |

Removed and to be rebuilt by you: the character node material and its
shading chunks, the scene-light sync used by characters, the character
render passes, the toon settings schema/presets/registry and every settings
group not listed above.

## 3. What to build

New modules (layout is a suggestion; keep files focused):

- `src/shaders-tsl/character/` — the toon character node material:
  assembly, light, terminator/face, cast shadows, shadow tones, highlights,
  rim, outline, material maps, details, debug views.
- `src/shaders-tsl/character/sceneLights.js` (or similar) — collects the
  scene's lights for characters **and** the environment shader: main
  directional light (the one marked `userData.toonMainLight`, else the
  brightest), ambient lights, light probes (irradiance from the L0 band),
  hemisphere lights, point and spot lights. `src/shaders-tsl/environment.js`
  and `src/environment/environmentMaterialAdapter.js` currently import
  `toonSceneLights` / `syncToonSceneLights`; keep those two exported names
  (the environment depends on them) or update both callers.
- `src/toon/settings/*.js` — the groups in §4, one file each.
- `src/toon/toonSettings.js` — the settings registry.
- `src/toon/characterRenderPasses.js` — §6.

Public API that must keep its name and shape (callers across the repo and in
games use it):

- `applyToonShader(root, options)` → returns `{ report, ... }` as today;
  `options.preset`, `options.outline`, and per-group overrides.
- `applyToonSettingsToMaterial(target, settings)` — live retune.
- `setToonDebugOutput(root, mode)`, `TOON_DEBUG_OUTPUT_MODES`,
  `TOON_DEBUG_OUTPUT_LABELS`, `resolveToonDebugOutputMode`.
- `setToonDitherOpacity`, `waitForTexture`, `waitForObjectTextures`,
  `setObjectTextureColorSpaces`, `findPrimarySkinnedMesh`.
- Settings registry: `createToonSettings`, `registerToonPreset`,
  `getToonPresetIds`, `getToonPresetOptions`, `getToonPresetMetadata`,
  `getToonPresetDefinition`, `TOON_PRESET_IDS` (`default`,
  `call_me_sensei`, `showcase`), `TOON_SETTING_DEFAULTS`,
  `TOON_SETTING_GROUPS`, `TOON_SETTING_GROUP_METADATA`,
  `TOON_SETTING_FIELD_SCHEMA` (type, default, range, options, description per
  field — the lab UIs and `scripts/generate-settings-reference.mjs` render
  from it), `getToonSettingGroupMetadata`, `getToonSettingFieldSchema`,
  `sanitizeToonPresetSettings`, preset documents
  (`TOON_PRESET_DOCUMENT_TYPE`, `TOON_PRESET_SCHEMA_VERSION` → **2**,
  `validate/parse/create/serialize/registerSerialized…`). Version-1 preset
  documents are rejected with a clear error (no automatic conversion).
- `createCharacterRenderPasses({ renderer, scene, camera, ... })` returning
  `registerCharacterRoot`, `unregisterCharacterRoot`, `update`, `setSize`,
  `setCharacterMaskEnabled`, `characterMaskTexture`, `dispose`, and
  `TOON_CHARACTER_LAYER`.
- `updateToonStorageSkinning` (character-skinning.js, unchanged).
- Conversion report codes currently emitted by the adapter stay.

## 4. Settings

Settings are grouped; every group has `enabled`. Per-role fields exist where
the look differs by surface; roles are `cloth` (anything unclassified,
costumes), `skin`, `face`, `hair`, `eye`, `metal`. Colours are `[r, g, b]`
0–1. **Tones and tints that multiply a colour are display-space (sRGB)
multipliers** — the way an artist picks them — applied to the display-encoded
colour and converted back.

Defaults below are for the `default` preset; `call_me_sensei` differences
follow in §4.10. Field names are a proposal: keep the meaning, improve names
if you like, stay in ToonLab's vocabulary.

### 4.1 `light` — how the scene's light reaches the character

| Field | Default | Meaning |
|---|---|---|
| `sunMax` | 1 | Brightest channel the sun may contribute. A physically bright sun (intensity 3–8) is scaled down *as a whole* to this, keeping its hue; clamping channels separately bleaches a warm sun to white. |
| `sunTint` | 1 | Share of the sun's hue the character takes (0 = a grey light of the same luminance). |
| `skyFloor` | 0.04 | Minimum light level from the sky ambient; the character never goes fully black. |
| `skyMax` | 1 | Cap on the sky ambient's contribution. |
| `shadeSkyTint` | 0.15 | Where the character stands in the scenery's cast shade (sun shadow map, cloud shadow), the light takes this share of the sky's hue at the sun's level. |
| `cameraLight.strength` | 0 | 0 = shade with the scene's sun direction; 1 = with a key fixed relative to the camera (`azimuth` −25°, `elevation` 35°), so faces read even when the sun is behind or overhead. Cast shadows keep the real sun. |
| `maxSunElevation` | 90 | Caps the shading direction's elevation (degrees) so a noon sun cannot hollow out eye sockets. 90 = off. |
| `localLights.intensity` | 1 | Point/spot lights add their colour on the side facing them as their own cel-shaded band, capped at `localLights.max` (1). |
| `highlightShadowFloor` | 0.25 | Highlights keep this share of their strength inside shadow. |

Light sources: the main directional light (colour × intensity), ambient
lights and light probes (sky ambient, averaged, flat — not per-normal),
hemisphere lights (sky/ground by normal, optional), point and spot lights.

### 4.2 `shading` — the terminator and lighting map

| Field | Default | Meaning |
|---|---|---|
| `terminator.cloth` / `.hair` / `.skin` | 0 | Where the terminator sits in N·L (0 = the sphere half facing the light is lit; −0.3 = more lit). |
| `softness` | 0.04 | Half-width of the terminator's soft edge in N·L. |
| `antiAlias` | 1 | Widen the edge to at least ~1 pixel using screen derivatives so it never stair-steps. |
| `lightingMap.auto` | true | Use the conversion-time occlusion bake as a per-vertex shadow bias: creases and inner surfaces reach the shadow earlier. |
| `lightingMap.autoStrength` | 0.8 (hair 0.4) | Bias at full occlusion, in N·L. Face surfaces are excluded (they use the face map). |
| `lightingMap.autoStart` / `autoEnd` | 0.2 / 0.7 | Occlusion range mapped onto the bias. |
| `lightingMap.map` | null | Authored per-texel shadow bias texture (`userData.toonShadingGradeMap` / MToon shading-shift texture). |
| `lightingMap.channel` / `scale` / `pivot` | 0 / 0.5 / 0.5 | How an authored map's values become a bias. |

### 4.3 `ramp` — shadow tones

| Field | Default | Meaning |
|---|---|---|
| `tone.cloth` | [0.77, 0.835, 0.91] | Shadow tone for cloth and anything unclassified (display multiplier). |
| `tone.hair` | [0.74, 0.76, 0.92] | Hair. |
| `tone.skin` | [0.92, 0.79, 0.74] | Body skin (measured on Genshin's neck, §9; body-skin textures run pinker than face textures). |
| `tone.face` | [0.91, 0.71, 0.65] | Face. |
| `tone.metal` | [0.70, 0.70, 0.80] | Metal. |
| `tone.eye` | [0.88, 0.88, 0.94] | Eyes. |
| `band.width` | 0.12 | How far past the terminator (in N·L) the warmer band reaches before the plain tone. 0 disables. |
| `band.cloth` / `.hair` / `.skin` | [0.95, 0.80, 0.86] / [0.82, 0.78, 0.96] / [0.97, 0.78, 0.72] | The band's multiplier (warmer, more saturated than the tone). The face has no band. Near-grey and near-black albedos (display chroma < ~0.1) get no band — there is no hue to deepen. |
| `importMmdRamp` | false | Use an MMD model's own toon ramp (material `gradientMap` flagged `userData.mmdToon.shared === false` by the loader) as that material's tone. |
| `importMToon` | true | VRM MToon: shade colour/texture replaces the tone (absolute, capped at the albedo's luminance), shading shift/toony set the terminator. |

Authored per-material data wins over the group: `userData.toonShadeColor` /
`toonShadeMap` (absolute shade colour), `userData.toonRampMap` (a 1D ramp
texture: u = 0 at the terminator, 1 deepest).

### 4.4 `face`

| Field | Default | Meaning |
|---|---|---|
| `map.auto` | true | Bake a face map from the face geometry when a face has none (faceShadowBake.js). |
| `map.texture` | null | Authored face map (`userData.toonFaceShadowMap`). |
| `map.mirror` / `midU` / `uvChannel` | true / 0.5 / 0 | One half-face map mirrored for light from the other side; the face's centre line in UV; which UV set (the auto bake uses its own planar coordinates). |
| `map.softness` / `offset` / `strength` | 0.02 / 0 / 1 | Edge softness of the face-map threshold, a bias, and how strongly the map (vs. the terminator) shades the face. |
| `terminator` / `softness` | −0.48 / 0.22 | The face's terminator when no face map is used. |
| `normals.amount` | 0.75 | Replace face normals by a smooth head-shaped field for lighting (0 = model normals). |
| `normals.roundness` | 0.75 | 0 = one flat forward normal for the whole face, 1 = a sphere around the head. |
| `headSpace` | `'headBone'` | Track the head bone at runtime (else a static per-object frame). |
| `sceneShadowStrength` | 0.5 | Cast shadows from the scenery on the face at this strength. |
| `nose.auto` / `size` / `strength` / `tint` | true / 1 / 1 / [0.93, 0.79, 0.78] | The painted nose shadow (§5.10). |
| `eyeWhiteShade.strength` / `depth` / `tint` | 1 / 0.4 / [0.76, 0.70, 0.71] | Shade under the upper lid on eye whites (§5.10). |

### 4.5 `shadows` — cast shadows

| Field | Default | Meaning |
|---|---|---|
| `scene.strength` | 1 (face: `face.sceneShadowStrength`, eye 0) | How strongly the scenery's sun/cloud shadow moves pixels into shadow. |
| `character.enabled` | true | The character's own shadow map (§6): limbs on the body, hair on the neck, chin on the throat. |
| `character.strength` | 1 (face 0.5) | |
| `character.direction` | `'light'` | `'light'` = the sun; `'camera'` = a camera-relative direction (`pitch` 40°, `yaw` 15°) for art-directed shadows. |
| `character.normalBias` / `depthBias` | 0.005 / 0.003 m | Receiver biases — millimetres, so short occluders (chin over neck, hair over hair) still cast. |
| `character.softness` | 1 | Filter radius in shadow-map texels. |
| `hairOnFace.strength` | 0.7 (body 0.3) | Screen-space shadow of what lies just in front of a surface toward the light — bangs on the forehead, hair on the cheeks, a sleeve on the arm. |
| `hairOnFace.width` | 0.012 m | How far toward the light (in world metres, projected) the test looks. |

### 4.6 `rim`

| Field | Default | Meaning |
|---|---|---|
| `mode` | `'depth'` | `'depth'` uses the depth prepass (§6); `'view'` is a view-angle rim, also the fallback when no prepass runs. |
| `width` | 0.004 m | Rim width in world metres, projected to screen at the pixel's depth (perspective and orthographic). |
| `threshold` / `softness` | 0.04 / 0.03 m | How much farther the sampled depth must be for a rim, and the fade. |
| `silhouette` | 0 (hair 0) | A second, fainter rim all around the silhouette regardless of light side (strength relative to the role's rim). Strands thinner than the rim are skipped rather than turned white. |
| `intensity.cloth` / `.hair` / `.skin` / `.face` / `.eye` | 0.13 / 0.23 / 0.13 / 0.13 / 0.04 | |
| `tint` | [0.82, 0.90, 1.0] | |
| `albedoMix` | 0.35 | Share of the albedo in the rim colour. |
| `inShadow` | 0.35 | Rim visibility on the shadow side. |
| `fadeStart` / `fadeEnd` | 20 / 30 m | Fade the depth rim out with distance. |

### 4.7 `highlights`

| Field | Default | Meaning |
|---|---|---|
| `specular.<role>.intensity` | cloth 0.075, hair 0.18, skin 0.025, face 0.025, metal 0.075, eye 0 | Stylised specular (a thresholded highlight, not a smooth lobe). |
| `specular.<role>.size` / `threshold` / `softness` | cloth: tight (e.g. power ~56, threshold 0.72, softness 0.12); hair power ~40 | |
| `specular.clothNeedsMask` | false | Cloth highlights only where a specular mask (source map or `userData.toonSpecularMaskMap`) says so. |
| `specular.inShadow` | 0.25 | |
| `specular.mask` (`map`, `channel`, `strength`, `fromSource`) | | Authored mask routing. |
| `hair.enabled` / `intensity` | true / 0.45 | A band ring around the head that follows the head's up axis (§5.7). |
| `hair.width` / `offset` / `strands` / `jitter` / `lean` / `shadowFloor` | your values; `shadowFloor` 0.32 | Ring shape, break-up into strands, lean toward the head's up axis, visibility in shadow. |
| `eye.enabled` | false | Dynamic eye glint (anime eyes paint their own). |
| `sheer.auto` / `color` / `intensity` / `power` | true / [0.55, 0.45, 1] / 0.07 / 48 | Stocking streak (§5.10). |

### 4.8 `outline`

Inverted-hull outlines. Keep ToonLab's per-role widths and ink behaviour:

| Field | Default | Meaning |
|---|---|---|
| `width.<role>` | cloth 0.0045, hair 0.004, skin 0.0035 (?), face 0.0025, eye 0, metal 0.0045 (m at the reference framing) | |
| `maxWidth` | 0.014 | |
| `screenSpace` | 1 | Keep a constant on-screen width at any distance (relative to `referenceDistance` 4 m, `referenceFov` 40°), and stop growing past `fadeDistance` (12 m). |
| `ink.<role>` | cloth [0.34, 0.33, 0.40], hair [0.72, 0.78, 0.90], skin/face [0.62, 0.36, 0.34], metal [0.34, 0.33, 0.40] | Display-space multiplier on the lit colour under the line. |
| `inkSaturation.<role>` / `inkHueShift` | 0 / 0 | Line = a deeper, more saturated version of the fill (§5.9). |
| `lighting` (mix, min, max brightness per role) | | How much the line follows the lighting. |
| `faceDepthPush` | 0.02 m | Push face hull lines back in depth so they show only on the silhouette, not across nose and eyelids. |
| `honourSourceOff` | true | Respect a source material's "no outline" (MMD edge flag off). |
| `widthMap`, `widthVertexColorChannel` | | Authored width control. |
| `smoothNormals` | true | Bake averaged normals so hard-edged meshes keep a closed hull. |

### 4.9 `maps`

Normal map (strength, scale), AO map (strength — AO moves pixels into shadow),
emissive (colour, strength), matcap (strength; metal), detail texture
(repeat, strength), roughness/metalness (strength), specular colour map.
Unchanged in meaning from today's material-map routing.

### 4.10 Presets

- `default`: §4 defaults.
- `call_me_sensei` (the product look), differences from default:
  - `light.sunTint` 0.35
  - `ramp.tone.cloth` / `hair` as default; stronger band not needed
  - `rim.silhouette` 1, `rim.silhouette.hair` 0.5; `rim.intensity` cloth
    0.16, hair 0.30, skin 0.15; `rim.tint` [0.79, 0.88, 1]
  - `highlights.specular.clothNeedsMask` true; cloth intensity 0.09
    (threshold 0.74, power 48), hair 0.24 (power 44), metal 0.5; masks from
    source maps
  - `highlights.hair.intensity` 0.45, `shadowFloor` 0.32
  - `outline`: cloth width 0.0055, hair 0.005, face 0.003, skin 0.0035,
    metal 0.005; ink cloth [0.22, 0.21, 0.28], hair [0.75, 0.75, 0.75] with
    `inkSaturation.hair` 0.47 and `inkHueShift` 0.044, skin/face
    [0.55, 0.30, 0.30]; lighting mix cloth 0.22, hair 0.10
  - `shadows.hairOnFace.strength` face 0.75
- `showcase`: `call_me_sensei` with post-processing-friendly choices (your
  call; today it mainly pairs with the showcase post preset).

## 5. Per-pixel behaviour

All lighting math in linear colour. "Display space" = sRGB-encoded.

### 5.1 Albedo

Base texture × material colour, with the existing base-colour edits
(saturation policy, brightness) and sticker/detail layers. Painted-on details
(§5.10 nose, eye-white shade) modify the albedo, so shading applies on top.

### 5.2 Light

- Sun colour = main directional light colour × intensity; take
  `light.sunTint` of its hue (desaturate toward its own luminance), then
  scale the whole colour so its brightest channel ≤ `light.sunMax`.
- Sky ambient = sum of ambient lights and light-probe L0 irradiance (flat).
- The light the character is shaded with never drops below the sky ambient
  (clamped to `skyFloor`…`skyMax`); where the sun dominates it carries the
  sun's hue.
- In scenery cast shade (sun visibility < 1), the light moves toward the
  sky's hue at the sun's level by `shadeSkyTint` × (1 − visibility).
- Shading direction: the sun's direction (optionally blended toward the
  camera light, elevation-capped).
- Local lights: each adds `colour × attenuation` on the surfaces facing it
  (its own soft cel band), summed and capped at `localLights.max`.

### 5.3 Terminator

- Shading coordinate from N·L (the lighting normal: model/normal-map normal,
  the face's smoothed normal on the face), shifted by the lighting-map bias
  (auto occlusion bake × `lightingMap` params, authored map).
- Lit amount = a soft step at the role's terminator with `softness`,
  anti-aliased. Where role weights blend (a soft face edge, a skin/cloth
  boundary in one texture), blend the *parameters* (terminator position,
  softness) and evaluate one step — never blend two finished steps (that
  draws two half-strength terminators).
- Face: the face map result (§5.4) replaces the terminator by `map.strength`
  × face weight.
- Cast shadows (§5.5) and the AO map multiply the lit amount.

### 5.4 Face map

- Threshold compare in the head's horizontal plane: the light's azimuth
  around the head (from the tracked head frame: forward/right/up) gives a
  value 0 (light in front) … 1 (light behind); a texel is lit while the
  light's value is below its stored threshold, with `softness`.
- Mirrored sampling for light from the other side when `mirror` (flip u
  about `midU`).
- Face-map coordinates: the auto bake's planar coordinates (`toonBake.xy`)
  when baked, else the chosen UV set.

### 5.5 Cast shadows

- Scenery: the shared sun shadow map and cloud shadow
  (environment-sun-shadow.js, cloudShadow.js), scaled per role.
- Character shadow map: §6.2. Normal-offset and slope-scaled biases; a small
  PCF filter; fade the map's influence out beyond its coverage.
- Hair on face / screen-space: compare the depth prepass a short distance
  (`hairOnFace.width`, projected) toward the light in screen space. A surface
  is shadowed when something in front of it there is nearer by more than a
  small threshold. **A face must not shadow itself** (nose on cheek, brow on
  eye socket): only non-face surfaces may cast onto the face in this test.
  How you achieve that is your design (e.g. the prepass writes which
  surfaces are face so face pixels ignore face occluders).

### 5.6 Shadow tones

- `shadowColour = albedo × tone(role, depth-into-shadow)` in display space.
  depth-into-shadow is 0 at the terminator and grows into the shadow side;
  within `band.width` the tone moves from the band colour to the plain tone.
  Cast-shadowed areas far from the terminator get the plain tone.
- Role weights blend tones per pixel.
- Authored shade (MToon / `toonShadeColor`/`toonShadeMap`) replaces the
  computed shadow colour (absolute), capped at the albedo's luminance.
- An MMD ramp (when imported) or `toonRampMap` replaces the tone.
- Final colour = mix(shadowColour, albedo, litAmount) × light colour (§5.2),
  plus local-light bands, highlights, rim, emission.

### 5.7 Highlights

- Specular: a thresholded highlight from N·H (with `size`, `threshold`,
  `softness`), × mask, × `inShadow` floor, per role.
- Hair ring: strands are taken to run along the head's up axis projected on
  the surface; a strand-direction highlight forms a band around the head
  that stays put as the light moves, broken into strands by an offset that
  varies smoothly around the head (no hard steps between strands — steps
  read as blocks).
- Metal: matcap from the view-space normal.

### 5.8 Rim

- Depth mode: sample the prepass depth at an offset toward the light's
  screen direction, the offset = `width` metres projected at the pixel's
  depth (exact for perspective and orthographic). Rim where the sampled
  surface is farther than this pixel by more than `threshold`, faded by
  `softness`. Plus the silhouette rim: the same test outward along the
  surface's screen-space normal, skipped where the opposite side is also
  clear (a strand thinner than the rim).
- Fade with distance; fall back to the view-angle rim without a prepass.
- Rim colour = light × tint × mix(1, albedo, albedoMix) × intensity ×
  mix(inShadow, 1, lit).

### 5.9 Outline

- Hull expanded along **geometry** normals (or the baked smooth normals),
  outward, in view space, width per role × screen-space correction ×
  width map × vertex-colour channel. (three.js r185's `normalView` is already
  flipped for back-side materials — use `normalViewGeometry`.)
- Face hull pushed back by `faceDepthPush` in clip depth so only the
  silhouette shows.
- Ink colour: the lit colour under the line, multiplied by the role's ink in
  display space, then its saturation raised by `inkSaturation` and hue
  stepped by `inkHueShift` (both scaled by the fill's display chroma, so
  grey/black lines stay neutral), then × lighting mix and clamped to the
  role's min/max brightness.
- A material whose source says "no outline" gets none (`honourSourceOff`).

### 5.10 Painted details

- **Nose shadow** (`geometry.userData.toonNoseMark = { center, size, drawn }`
  in the planar face coordinates; skip when `drawn`). A leaf-shaped shadow
  beside the nose ridge on the side away from the key light (a head-on light
  counts as from the character's right; swap sides over a narrow band once
  the light is clearly on the other side — blending both sides draws a pink
  dot), with a faint highlight on the lit side. Shape in leaf coordinates
  (x = distance from the ridge in leaf widths, y from −1 bottom tip to +1
  top tip): outer edge
  `0.34 + 0.66·(1 − t²)^e`, `t = (y + 0.25)/1.25` above the belly (`e` 1.4)
  and `(y + 0.25)/0.75` below (`e` 1.1); inner edge
  `0.02 + 0.32·smoothstep(0.75, 1, |y|)^2.5` (straight along the ridge,
  turning off it only near the tips). These were fitted to Genshin's nose
  shadow (92% overlap). Tint `face.nose.tint` in display space.
- **Eye-white shade** (materials whose role is sclera and whose geometry has
  the `lid` detail baked; `toonBake.w` = 0 at the upper lid … 1 at the lower
  edge): shade the band `w < depth` (flat to 55% of the depth, then fading)
  by the tint in display space.
- **Stocking streak** (materials with the `sheer` detail baked; `toonBake.w` =
  weight): a narrow highlight along the leg — take the leg axis as world up
  projected onto the surface; the streak is where the normal, around that
  axis, faces the half vector; `power` narrows it; colour × intensity ×
  weight × light × highlight visibility.

### 5.11 Maps

Normal, AO, emissive, matcap, detail, roughness/metalness, specular colour —
routed as today (the adapter resolves them per material).

### 5.12 Debug views

`off`, `albedo`, `source albedo`, `lit amount`, `terminator only`, `scene
shadow`, `character shadow`, `screen-space shadow`, `face map`, `shadow
colour`, `light colour`, `rim`, `depth rim`, `specular`, `hair highlight`,
`roles`, `alpha`, `lighting map`, `normal map`, `ao`, `emissive`, `matcap`.
Selecting a view is a uniform write (no recompile).

## 6. Character render passes

`createCharacterRenderPasses({ renderer, scene, camera, ...options })`:

1. **Depth prepass** — scene depth (as a float colour target at drawing-buffer
   size) for the depth rim and screen-space shadow. Characters render with
   their own prepass materials (alpha-tested like their colour pass) so the
   face can be told apart (§5.5). Outline hulls, fur shells and fully
   transparent meshes must not write it.
2. **Character shadow map** — an orthographic shadow map of the registered
   characters only, fitted tightly to their bounds, from the sun or the
   camera-relative direction (§4.5). Depth material per mesh (cutout aware).
3. **Head tracking** — head position/forward/up per registered character for
   the face map, face normals and hair ring (headBone.js has the helpers;
   calibrate the forward axis in the character's own frame when the root is
   registered so a character already turned still tracks).
4. **Character mask** — characters as a mask texture for the post pipeline's
   character-aware bloom (`setCharacterMaskEnabled`, `characterMaskTexture`).

Each pass runs only when some registered material needs it.

Hard-won rules:

- Passes that store depth in a colour target must clear to the far value with
  `scene.background` removed — a background colour reads back as a near
  depth.
- Swap each mesh's material to a cached per-mesh pass variant (keyed by the
  source material) — handing the renderer fresh arrays each frame churns its
  cache and trips WebGPU validation.
- Skinned meshes with large skeletons use the storage-buffer skinning path
  (character-skinning.js) in every pass variant.
- Render-target reads in the fragment stage sample at explicit level 0.

## 7. Conversion pipeline changes

- Everything the adapter wrote into the old material (per-role values,
  authored overrides from sourceShading.js) now targets your material's
  inputs. Per-material authored values must survive live retunes.
- Features dropped in 0.5: per-character averaged shadow measurement,
  procedural glitter, face perspective removal, the additive "legacy"
  lighting model, the old HSV-shift shadow colour and its skin/face tint
  groups, the old indirect-light and local-light groups (replaced by §4.1).
- Report codes stay; add codes for anything new you decide to report.

## 8. Engineering constraints

- three.js r185 WebGPU/TSL `NodeMaterial`s, with the WebGL2 fallback.
- TSL: `normalView`/`normalWorld` are pre-flipped on BackSide/DoubleSide; use
  `normalViewGeometry`/`normalWorldGeometry` for raw normals, and evaluate
  those shared `.once()` nodes at the top of the fragment function before
  using them in nested helpers.
- WebGPU allows 8 vertex buffers per draw. A skinned mesh uses 5; role
  weights one more; all per-vertex bakes share `toonBake` (vec4). Count
  buffers per material and drop optional bakes (details first, then
  occlusion, then the auto face map) rather than exceed 8.
- VRM 0.x roots are turned 180° (`root.userData.toonForward = [0, 0, -1]`);
  use headBone.js's character-frame helpers.
- No tonemapping on characters by default.

## 9. References and acceptance

Reference images (Genshin in-game, private, `assets-local/genshin-ref/`):
`expression-1-face.png` (daylight face close-up), `turnaround-4view-full.webp`
(character screen, four views, constant light), `showcase-front.png`,
`sunset-backlit.png`, `sunny-front34.png`, `daylight-side.png`,
`daylight-back-close.png`, `dusk-close-*.jpg`, `ingame-back-night.webp`.
Test characters: `assets-local/ganyu-fixed/ganyu.pmx` (the official
Genshin MMD model — the main target), `assets-local/models/yua/yua.glb`
(product character), `assets-local/test-characters/*` (VRM girl, Seed-san,
Jennifer, Rocketbox, SWAT, astronaut, fox, robot, twist sample),
`assets-local/rem-vroid/Rem-VRoid-prototype-01.vrm`.

Review lab: `labs/toon-review/index.html` — `model`, `view=full|face|head`,
`yaw`, `pose=down` (lower MMD/humanoid arms), `bg=<hex>`, `floor=0`,
`light=az,el,intensity`, `ambient=r,g,b`, `env=<style>@<hour>` (a lighting
style's sun/sky at that hour), `shade=1` (the character in cast shade),
`post=showcase`, `debug=<mode>`, `a=`/`b=` JSON settings (A/B split),
`capture=WxH` (canvas only, for scripts). `document.body.dataset.ready`
becomes `true` when rendered; `window.__TOON_REVIEW` exposes the runtimes.
Run your own dev server from this worktree (`npx vite --port 5210` or the
repo's dev script) and capture with Playwright (headless Chromium with
`--enable-unsafe-webgpu`).

Measured Genshin targets (sRGB):

| Where | Lit | Shadow / detail |
|---|---|---|
| Skin (face close-up) | (241, 232, 215) | neck under chin (220, 164, 140) |
| Hair (close-up) | (166, 187, 212) | shadowed hair hue 233–251°, saturation 0.4–0.6 (back-lit frame) |
| White cloth (turnaround) | (239, 237, 238) | (183, 198, 216) |
| Dark stockings (turnaround) | (68, 55, 79) | streak on the shin (93, 88, 119) |
| Hair outline (close-up) | — | navy ~ (50, 70, 160) against lit hair |
| Nose shadow | on skin (239, 228, 208) | (223, 180, 162); 7 × 11 px at the close-up framing |
| Eye white | (243–255) | band under the lashes ≈ (188, 174, 174) |

Framings that match the references: face close-up — `view=head`, the camera
moved 23% closer than the default head framing and 3 cm lower (eye spacing
≈ 105 px at 420 px); turnaround — perspective fov 26°, camera at
(0, 0.9, 4.4) looking at (0, 0.86, 0), 500 × 900 per view, `pose=down`,
`yaw` 0 / −90 / 90 / 180, light `-15,30,1.6`, ambient `0.40,0.46,0.55`.

Acceptance:

1. `npm run verify:toon-shading` (rewrite it for the new schema, keeping its
   pipeline checks: roles, alpha, MToon/MMD import, bakes, outline flags,
   retune), `verify:docs`, `verify:api`, `verify:types`, `verify:package`,
   `verify:character-package`, `verify:scene-depth-pass`, `verify:post`,
   `verify:lighting`, `verify:vegetation-shader`, `verify:grass` pass.
2. Every test character renders on WebGPU without errors, NaNs or black
   meshes; outlines are outward and closed; faces have a clean face-map
   shadow; no stripes or double terminators.
3. Ganyu vs the references at the matched framings: lit skin and lit hair
   within 6 sRGB levels per channel; skin shadow within 10; white-cloth
   shadow within 12; hair shadow hue and saturation within the ranges above;
   nose shadow and eye-white band present with the listed shape/colour.
4. The day cycle (`env=call-me-sensei@7|12|18|22`, and `@12&shade=1`):
   morning/evening gently warm, noon neutral, night dim cool and readable,
   shade cool — never saturated orange or blue.
5. GPU frame time for a 1600×1600 face close-up within 10% of an
   all-features-off baseline plus the passes.
6. Leave comparison sheets (PNG/JPG) in `assets-local/review-0.5/` and write
   `docs/toon-shading.md` (user-facing feature guide, no history) and
   regenerate `docs/settings-reference.md`.
