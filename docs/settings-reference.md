# Settings reference

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: node scripts/generate-settings-reference.mjs -->

Fields in the selected runtime and repository settings schemas, generated from the
exported field schemas (including the modern SkyParams envelope). The same schemas
drive the Lab controls and inspectors. A Lab may place
scene/runtime inputs in its Preview controls instead of the saved editor;
the **Portable** column makes that ownership explicit.

- [Character toon shading](#character-toon-shading)
- [Environment shading](#environment-shading)
- [Rock shader profile](#rock-shader-profile)
- [Ground shader profile](#ground-shader-profile)
- [Water](#water)
- [Post-processing](#post-processing)
- [Vegetation shader family](#vegetation-shader-family)
- [Grass](#grass)
- [Flowers](#flowers)
- [Trees](#trees)
- [SkySystem atmosphere and clouds](#skysystem-atmosphere-and-clouds)
- [Legacy StylizedSky compatibility](#legacy-stylizedsky-compatibility)
- [Paths, roads & bridges](#paths-roads-bridges)
- [Ambient VFX](#ambient-vfx)
- [Gameplay VFX](#gameplay-vfx)
- [Fauna](#fauna)
- [Buildings](#buildings)
- [Procedural textures](#procedural-textures)

## Character toon shading

Module: `@call-me-sensei/toonlab/toon` — 14 groups, 245 fields.

Settings are nested per group; dotted keys are nested objects: `createToonSettings({ preset: 'call_me_sensei', rim: { intensity: { hair: 0.3 } } })`. Colours are `[r, g, b]` 0–1; shadow tones, band colours, tints and inks are display-space (sRGB) multipliers. Texture fields are runtime-only.

### Character toon shading: Light

How the scene's sun, sky, probes and local lights reach the character.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Use the scene's lights. Off shades with a neutral white light from the camera-relative key. |
| `sunMax` | number | `1` | 0 – 4 | Yes | Brightest channel the sun may contribute. A physically bright sun is scaled down as a whole to this, keeping its hue. |
| `sunTint` | number | `1` | 0 – 1 | Yes | Share of the sun's hue the character takes (0 = a grey light of the same luminance). |
| `maxTint` | number | `0.14` | 0 – 1 | Yes | Largest display saturation the light may carry, so a deep sunset or a blue night tints the character gently instead of turning it orange or blue. 1 = no limit. |
| `skyFloor` | number | `0.04` | 0 – 1 | Yes | Minimum light level from the sky ambient; the character never goes fully black. |
| `skyMax` | number | `1` | 0 – 4 | Yes | Cap on the sky ambient's contribution (brightest channel). |
| `shadeSkyTint` | number | `0.15` | 0 – 1 | Yes | In the scenery's cast shade the light takes this share of the sky's hue at the sun's level. |
| `shadowSkyTint` | number | `0.35` | 0 – 1 | Yes | On the shadow side the light leans this far toward the sky's hue (at the light's level), so shadows stay cool and colourful under a warm sun. |
| `cameraLight.strength` | number | `0` | 0 – 1 | Yes | 0 shades with the sun's direction; 1 with a key fixed relative to the camera. Cast shadows keep the real sun. |
| `cameraLight.azimuth` | number | `-25` | -180 – 180 | Yes | Camera-relative key azimuth in degrees (negative = from the camera's left). |
| `cameraLight.elevation` | number | `35` | -89 – 89 | Yes | Camera-relative key elevation in degrees. |
| `maxSunElevation` | number | `90` | 0 – 90 | Yes | Caps the shading direction's elevation (degrees) so a noon sun cannot hollow out eye sockets. 90 = off. |
| `hemisphereByNormal` | boolean | `true` | — | Yes | Hemisphere lights shade by normal (sky above, ground below); off averages them into the flat sky ambient. |
| `localLights.intensity` | number | `1` | 0 – 4 | Yes | Point and spot lights add their colour on the side facing them as their own cel band. |
| `localLights.max` | number | `1` | 0 – 4 | Yes | Cap on the summed local-light contribution (brightest channel). |
| `localLights.softness` | number | `0.08` | 0.005 – 1 | Yes | Half-width of a local light's cel band edge in N·L. |
| `highlightShadowFloor` | number | `0.25` | 0 – 1 | Yes | Highlights keep this share of their strength inside shadow. |

### Character toon shading: Shading

The terminator between light and shadow and the lighting map that shifts it.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Shade with a terminator. Off leaves every surface on its lit side. |
| `terminator.cloth` | number | `0` | -1 – 1 | Yes | Where the terminator sits in N·L on cloth and unclassified surfaces (0 = the half facing the light is lit; negative = more lit). |
| `terminator.hair` | number | `0` | -1 – 1 | Yes | Terminator position on hair. |
| `terminator.skin` | number | `0` | -1 – 1 | Yes | Terminator position on body skin. |
| `softness` | number | `0.04` | 0 – 0.5 | Yes | Half-width of the terminator's soft edge in N·L. |
| `antiAlias` | number | `1` | 0 – 3 | Yes | Widens the edge to at least about this many pixels (screen derivatives) so it never stair-steps. |
| `lightingMap.auto` | boolean | `true` | — | Yes | Use the conversion-time occlusion bake as a per-vertex shadow bias: creases and inner surfaces reach the shadow earlier. Faces are excluded. |
| `lightingMap.autoStrength.body` | number | `0.8` | 0 – 2 | Yes | Bias at full occlusion, in N·L, on everything but hair and faces. |
| `lightingMap.autoStrength.hair` | number | `0.4` | 0 – 2 | Yes | Bias at full occlusion on hair. |
| `lightingMap.autoStart` | number | `0.2` | 0 – 1 | Yes | Occlusion at which the automatic bias starts. |
| `lightingMap.autoEnd` | number | `0.7` | 0 – 1 | Yes | Occlusion at which the automatic bias is full. |
| `lightingMap.map` | texture | — | — | No — local/runtime | Authored per-texel shadow bias texture (also `userData.toonShadingGradeMap`, MToon shading-shift texture). |
| `lightingMap.channel` | select | `0` | `0` \| `1` \| `2` \| `3` | Yes | Channel of the authored map that holds the bias. |
| `lightingMap.scale` | number | `0.5` | -2 – 2 | Yes | Bias per unit of map value (N·L). |
| `lightingMap.pivot` | number | `0.5` | 0 – 1 | Yes | Map value that means no bias. |

### Character toon shading: Shadow Tones

Shadow tones per kind of surface and the warm band just inside the terminator.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Colour shadows with the per-surface tones. Off uses a neutral grey tone and no band. |
| `tone.cloth` | color | `[0.77, 0.835, 0.91]` | — | Yes | Shadow tone for cloth and anything unclassified (display-space multiplier; Genshin white cloth: lit (239, 237, 238) → shadow (183, 198, 216)). |
| `tone.hair` | color | `[0.74, 0.76, 0.92]` | — | Yes | Shadow tone for hair. |
| `tone.skin` | color | `[0.92, 0.79, 0.74]` | — | Yes | Shadow tone for body skin (Genshin Ganyu neck: (238, 208, 189) → (220, 164, 140)); body skin textures run pinker than face textures, so it is lighter than the face tone. |
| `tone.face` | color | `[0.91, 0.71, 0.65]` | — | Yes | Shadow tone for the face. |
| `tone.metal` | color | `[0.7, 0.7, 0.8]` | — | Yes | Shadow tone for metal. |
| `tone.eye` | color | `[0.88, 0.88, 0.94]` | — | Yes | Shadow tone for eyes. |
| `band.width` | number | `0.12` | 0 – 1 | Yes | How far past the terminator (N·L) the warmer band reaches before the plain tone. 0 disables it. |
| `band.cloth` | color | `[0.95, 0.8, 0.86]` | — | Yes | Band multiplier on cloth (warmer, more saturated than the tone). |
| `band.hair` | color | `[0.82, 0.78, 0.96]` | — | Yes | Band multiplier on hair. |
| `band.skin` | color | `[0.97, 0.78, 0.72]` | — | Yes | Band multiplier on skin. The face has no band. |
| `importMmdRamp` | boolean | `false` | — | Yes | Use an MMD model's own toon ramp (not the shared toon01–10) as that material's tone. |
| `importMToon` | boolean | `true` | — | Yes | VRM MToon: shade colour/texture replaces the tone; shading shift and toony set the terminator. |

### Character toon shading: Face

Face-map shading, smoothed face normals and painted face details.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Treat face surfaces as faces. Off shades them like skin. |
| `map.auto` | boolean | `true` | — | Yes | Bake a face map from the face geometry when a face has none. |
| `map.texture` | texture | — | — | No — local/runtime | Authored face map (also `userData.toonFaceShadowMap`). |
| `map.mirror` | boolean | `true` | — | Yes | The map covers light from the character's right; mirror it for light from the left. |
| `map.midU` | number | `0.5` | 0 – 1 | Yes | The face's centre line in the map's u coordinate. |
| `map.uvChannel` | select | `0` | `0` \| `1` | Yes | UV set an authored face map uses (the automatic bake has its own planar coordinates). |
| `map.softness` | number | `0.02` | 0 – 0.3 | Yes | Edge softness of the face-map threshold. |
| `map.offset` | number | `0` | -0.5 – 0.5 | Yes | Bias added to the stored threshold (positive = more lit). |
| `map.strength` | number | `1` | 0 – 1 | Yes | How strongly the face map (rather than the terminator) shades the face. |
| `terminator` | number | `-0.48` | -1 – 1 | Yes | The face's terminator in N·L when no face map is used. |
| `softness` | number | `0.22` | 0 – 1 | Yes | Soft edge of the face terminator when no face map is used. |
| `normals.amount` | number | `0.75` | 0 – 1 | Yes | Replace face normals by a smooth head-shaped field for lighting (0 = model normals). |
| `normals.roundness` | number | `0.75` | 0 – 1 | Yes | 0 = one flat forward normal for the whole face, 1 = a sphere around the head. |
| `headSpace` | select | `'headBone'` | `headBone` \| `static` | Yes | Track the head bone at runtime, or a static per-character frame. |
| `sceneShadowStrength` | number | `0.5` | 0 – 1 | Yes | Cast shadows from the scenery reach the face at this strength. |
| `nose.auto` | boolean | `true` | — | Yes | Paint the leaf-shaped nose shadow where the face bake found a nose the texture does not already draw. |
| `nose.size` | number | `1` | 0.25 – 3 | Yes | Size of the nose shadow relative to the measured nose. |
| `nose.strength` | number | `1` | 0 – 1 | Yes | Opacity of the nose shadow. |
| `nose.tint` | color | `[0.93, 0.79, 0.78]` | — | Yes | Nose-shadow multiplier on the skin (display space). |
| `eyeWhiteShade.strength` | number | `1` | 0 – 1 | Yes | Opacity of the shade under the upper lid on eye whites. |
| `eyeWhiteShade.depth` | number | `0.4` | 0 – 1 | Yes | How far down the eye white the shade reaches (0 = upper lid, 1 = lower edge). |
| `eyeWhiteShade.tint` | color | `[0.76, 0.7, 0.71]` | — | Yes | Eye-white shade multiplier (display space). |

### Character toon shading: Cast Shadows

Cast shadows from the scenery, the character's own shadow map and the screen-space hair shadow.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Receive cast shadows. |
| `scene.strength` | number | `1` | 0 – 1 | Yes | How strongly the scenery's sun and cloud shadow move pixels into shadow (faces use face.sceneShadowStrength; eyes none). |
| `character.enabled` | boolean | `true` | — | Yes | The character's own shadow map: limbs on the body, hair on the neck, chin on the throat. |
| `character.strength.body` | number | `1` | 0 – 1 | Yes | Character shadow strength on everything but the face. |
| `character.strength.face` | number | `0.5` | 0 – 1 | Yes | Character shadow strength on the face. |
| `character.direction` | select | `'light'` | `camera` \| `light` | Yes | `light` casts from the sun; `camera` from a camera-relative direction for art-directed shadows. |
| `character.pitch` | number | `40` | 0 – 89 | Yes | Camera-relative shadow direction: degrees above the view direction. |
| `character.yaw` | number | `15` | -180 – 180 | Yes | Camera-relative shadow direction: degrees to the side. |
| `character.normalBias` | number | `0.005` | 0 – 0.05 | Yes | Receiver offset along the normal, metres. |
| `character.depthBias` | number | `0.003` | 0 – 0.05 | Yes | Receiver depth bias, metres, so short occluders (chin over neck) still cast. |
| `character.softness` | number | `1` | 0 – 4 | Yes | Filter radius in shadow-map texels. |
| `hairOnFace.strength.face` | number | `0.7` | 0 – 1 | Yes | Screen-space shadow on the face (bangs on the forehead, hair on the cheeks). |
| `hairOnFace.strength.body` | number | `0.3` | 0 – 1 | Yes | Screen-space shadow on everything else (a sleeve on the arm, hair on the neck). |
| `hairOnFace.width` | number | `0.012` | 0 – 0.1 | Yes | How far toward the light, in world metres projected to the screen, the test looks. |

### Character toon shading: Rim

The depth rim on the lit side and the faint silhouette rim.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Draw the rim. |
| `mode` | select | `'depth'` | `depth` \| `view` | Yes | `depth` uses the depth prepass; `view` is a view-angle rim (also the fallback without a prepass). |
| `width` | number | `0.004` | 0 – 0.05 | Yes | Rim width in world metres, projected to the screen at the pixel's depth. |
| `threshold` | number | `0.04` | 0 – 1 | Yes | How much farther (metres) the sampled surface must be for a rim. |
| `softness` | number | `0.03` | 0.001 – 1 | Yes | Fade of the rim past the threshold, metres. |
| `silhouette.body` | number | `0` | 0 – 2 | Yes | A second, fainter rim all around the silhouette regardless of the light side, relative to the role's rim. |
| `silhouette.hair` | number | `0` | 0 – 2 | Yes | Silhouette rim on hair. |
| `intensity.cloth` | number | `0.13` | 0 – 2 | Yes | Rim strength on cloth, metal and unclassified surfaces. |
| `intensity.hair` | number | `0.23` | 0 – 2 | Yes | Rim strength on hair. |
| `intensity.skin` | number | `0.13` | 0 – 2 | Yes | Rim strength on body skin. |
| `intensity.face` | number | `0.13` | 0 – 2 | Yes | Rim strength on the face. |
| `intensity.eye` | number | `0.04` | 0 – 2 | Yes | Rim strength on eyes. |
| `tint` | color | `[0.82, 0.9, 1]` | — | Yes | Rim colour (times the light). |
| `albedoMix` | number | `0.35` | 0 – 1 | Yes | Share of the albedo in the rim colour. |
| `inShadow` | number | `0.35` | 0 – 1 | Yes | Rim visibility on the shadow side. |
| `fadeStart` | number | `20` | 0 – 500 | Yes | Distance (metres) at which the depth rim starts to fade. |
| `fadeEnd` | number | `30` | 0 – 500 | Yes | Distance (metres) at which the depth rim is gone. |

### Character toon shading: Highlights

Stylised specular, the hair ring, the eye glint and the stocking streak.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Draw highlights. |
| `specular.cloth.intensity` | number | `0.075` | 0 – 2 | Yes | Specular strength on cloth. |
| `specular.cloth.size` | number | `56` | 1 – 512 | Yes | Specular exponent on cloth; larger = a tighter highlight. |
| `specular.cloth.threshold` | number | `0.72` | 0 – 1 | Yes | Level of the specular lobe where the highlight starts on cloth. |
| `specular.cloth.softness` | number | `0.12` | 0.001 – 1 | Yes | Edge softness of the highlight on cloth. |
| `specular.hair.intensity` | number | `0.18` | 0 – 2 | Yes | Specular strength on hair. |
| `specular.hair.size` | number | `40` | 1 – 512 | Yes | Specular exponent on hair; larger = a tighter highlight. |
| `specular.hair.threshold` | number | `0.62` | 0 – 1 | Yes | Level of the specular lobe where the highlight starts on hair. |
| `specular.hair.softness` | number | `0.2` | 0.001 – 1 | Yes | Edge softness of the highlight on hair. |
| `specular.skin.intensity` | number | `0.025` | 0 – 2 | Yes | Specular strength on body skin. |
| `specular.skin.size` | number | `24` | 1 – 512 | Yes | Specular exponent on body skin; larger = a tighter highlight. |
| `specular.skin.threshold` | number | `0.6` | 0 – 1 | Yes | Level of the specular lobe where the highlight starts on body skin. |
| `specular.skin.softness` | number | `0.3` | 0.001 – 1 | Yes | Edge softness of the highlight on body skin. |
| `specular.face.intensity` | number | `0.025` | 0 – 2 | Yes | Specular strength on the face. |
| `specular.face.size` | number | `24` | 1 – 512 | Yes | Specular exponent on the face; larger = a tighter highlight. |
| `specular.face.threshold` | number | `0.6` | 0 – 1 | Yes | Level of the specular lobe where the highlight starts on the face. |
| `specular.face.softness` | number | `0.3` | 0.001 – 1 | Yes | Edge softness of the highlight on the face. |
| `specular.metal.intensity` | number | `0.075` | 0 – 2 | Yes | Specular strength on metal. |
| `specular.metal.size` | number | `32` | 1 – 512 | Yes | Specular exponent on metal; larger = a tighter highlight. |
| `specular.metal.threshold` | number | `0.5` | 0 – 1 | Yes | Level of the specular lobe where the highlight starts on metal. |
| `specular.metal.softness` | number | `0.2` | 0.001 – 1 | Yes | Edge softness of the highlight on metal. |
| `specular.eye.intensity` | number | `0` | 0 – 2 | Yes | Specular strength on eyes. |
| `specular.eye.size` | number | `96` | 1 – 512 | Yes | Specular exponent on eyes; larger = a tighter highlight. |
| `specular.eye.threshold` | number | `0.6` | 0 – 1 | Yes | Level of the specular lobe where the highlight starts on eyes. |
| `specular.eye.softness` | number | `0.2` | 0.001 – 1 | Yes | Edge softness of the highlight on eyes. |
| `specular.clothNeedsMask` | boolean | `false` | — | Yes | Cloth shines only where a specular mask (source map or `userData.toonSpecularMaskMap`) says so; unmasked cloth is matte. |
| `specular.inShadow` | number | `0.25` | 0 – 1 | Yes | Specular visibility on the shadow side. |
| `specular.mask.map` | texture | — | — | No — local/runtime | Specular mask applied to every material. |
| `specular.mask.channel` | select | `0` | `0` \| `1` \| `2` \| `3` | Yes | Mask channel. |
| `specular.mask.strength` | number | `1` | 0 – 1 | Yes | How strongly the mask gates the highlight. |
| `specular.mask.fromSource` | boolean | `true` | — | Yes | Read masks from the source material (`userData.toonSpecularMaskMap`, specular maps). |
| `hair.enabled` | boolean | `true` | — | Yes | A highlight ring on hair that follows the head's up axis. |
| `hair.intensity` | number | `0.45` | 0 – 2 | Yes | Hair ring strength. |
| `hair.width` | number | `0.07` | 0.005 – 0.5 | Yes | Width of the ring. |
| `hair.offset` | number | `0.56` | -1 – 1 | Yes | Moves the ring up (positive) or down the head. |
| `hair.strands` | number | `11` | 0 – 64 | Yes | How many strands the ring breaks into around the head. |
| `hair.jitter` | number | `0.05` | 0 – 0.5 | Yes | How far each strand's piece of the ring wanders up and down. |
| `hair.lean` | number | `1` | 0 – 1 | Yes | How much the strand direction follows the head's up axis (1) rather than world up (0). |
| `hair.shadowFloor` | number | `0.32` | 0 – 1 | Yes | Ring visibility on the shadow side. |
| `eye.enabled` | boolean | `false` | — | Yes | Dynamic eye glint (anime eyes usually paint their own). |
| `eye.intensity` | number | `0.6` | 0 – 2 | Yes | Eye glint strength. |
| `eye.size` | number | `160` | 1 – 1024 | Yes | Eye glint exponent. |
| `sheer.auto` | boolean | `true` | — | Yes | Draw the streak along the leg on detected stockings and tights. |
| `sheer.color` | color | `[0.55, 0.45, 1]` | — | Yes | Streak colour. |
| `sheer.intensity` | number | `0.07` | 0 – 1 | Yes | Streak strength. |
| `sheer.power` | number | `48` | 1 – 512 | Yes | Streak narrowness. |

### Character toon shading: Outline

Inverted-hull ink outlines: widths, ink colour and screen-space behaviour.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Draw ink outlines. |
| `width.cloth` | number | `0.0045` | 0 – 0.03 | Yes | Line width on cloth, metres at the reference framing. |
| `width.hair` | number | `0.004` | 0 – 0.03 | Yes | Line width on hair. |
| `width.skin` | number | `0.0035` | 0 – 0.03 | Yes | Line width on body skin. |
| `width.face` | number | `0.0025` | 0 – 0.03 | Yes | Line width on the face. |
| `width.eye` | number | `0` | 0 – 0.03 | Yes | Line width on eyes. |
| `width.metal` | number | `0.0045` | 0 – 0.03 | Yes | Line width on metal. |
| `maxWidth` | number | `0.014` | 0 – 0.1 | Yes | Upper limit of the world-space width after screen-space correction. |
| `screenSpace` | number | `1` | 0 – 1 | Yes | Keep a constant on-screen width at any distance (relative to the reference framing). |
| `referenceDistance` | number | `4` | 0.1 – 100 | Yes | Camera distance the widths are authored at, metres. |
| `referenceFov` | number | `40` | 1 – 120 | Yes | Vertical field of view the widths are authored at, degrees. |
| `fadeDistance` | number | `12` | 0.1 – 500 | Yes | Past this camera distance lines stop growing in world space (they thin on screen). |
| `ink.cloth` | color | `[0.34, 0.33, 0.4]` | — | Yes | Ink on cloth: display-space multiplier on the lit colour under the line. |
| `ink.hair` | color | `[0.72, 0.78, 0.9]` | — | Yes | Ink on hair. |
| `ink.skin` | color | `[0.62, 0.36, 0.34]` | — | Yes | Ink on body skin. |
| `ink.face` | color | `[0.62, 0.36, 0.34]` | — | Yes | Ink on the face. |
| `ink.metal` | color | `[0.34, 0.33, 0.4]` | — | Yes | Ink on metal. |
| `inkSaturation.cloth` | number | `0` | 0 – 1 | Yes | Saturation added to the line on cloth (scaled by the fill's chroma, so grey lines stay neutral). |
| `inkSaturation.hair` | number | `0` | 0 – 1 | Yes | Saturation added to the line on hair. |
| `inkSaturation.skin` | number | `0` | 0 – 1 | Yes | Saturation added to the line on skin. |
| `inkSaturation.face` | number | `0` | 0 – 1 | Yes | Saturation added to the line on the face. |
| `inkSaturation.metal` | number | `0` | 0 – 1 | Yes | Saturation added to the line on metal. |
| `inkHueShift` | number | `0` | -0.5 – 0.5 | Yes | Hue step of the line in turns (scaled by the fill's chroma). |
| `lighting.cloth.mix` | number | `0.2` | 0 – 1 | Yes | How much the line on cloth follows the cel lighting (darker on the shadow side). |
| `lighting.cloth.min` | number | `0` | 0 – 1 | Yes | Minimum line brightness on cloth. |
| `lighting.cloth.max` | number | `1` | 0 – 1 | Yes | Maximum line brightness on cloth. |
| `lighting.hair.mix` | number | `0.2` | 0 – 1 | Yes | How much the line on hair follows the cel lighting (darker on the shadow side). |
| `lighting.hair.min` | number | `0` | 0 – 1 | Yes | Minimum line brightness on hair. |
| `lighting.hair.max` | number | `1` | 0 – 1 | Yes | Maximum line brightness on hair. |
| `lighting.skin.mix` | number | `0.2` | 0 – 1 | Yes | How much the line on skin follows the cel lighting (darker on the shadow side). |
| `lighting.skin.min` | number | `0` | 0 – 1 | Yes | Minimum line brightness on skin. |
| `lighting.skin.max` | number | `1` | 0 – 1 | Yes | Maximum line brightness on skin. |
| `lighting.face.mix` | number | `0.2` | 0 – 1 | Yes | How much the line on the face follows the cel lighting (darker on the shadow side). |
| `lighting.face.min` | number | `0` | 0 – 1 | Yes | Minimum line brightness on the face. |
| `lighting.face.max` | number | `1` | 0 – 1 | Yes | Maximum line brightness on the face. |
| `lighting.metal.mix` | number | `0.2` | 0 – 1 | Yes | How much the line on metal follows the cel lighting (darker on the shadow side). |
| `lighting.metal.min` | number | `0` | 0 – 1 | Yes | Minimum line brightness on metal. |
| `lighting.metal.max` | number | `1` | 0 – 1 | Yes | Maximum line brightness on metal. |
| `faceDepthPush` | number | `0.02` | 0 – 0.2 | Yes | Push face hull lines back in depth (metres) so they show only on the silhouette, not across nose and eyelids. |
| `honourSourceOff` | boolean | `true` | — | Yes | Respect a source material's "no outline" (MMD edge flag off). |
| `widthMap` | texture | — | — | No — local/runtime | Per-texel width multiplier (also `userData.toonOutlineWidthMap`, MToon outline width texture). |
| `widthMapChannel` | select | `0` | `0` \| `1` \| `2` \| `3` | Yes | Width map channel. |
| `widthVertexColorChannel` | select | `-1` | `-1` \| `0` \| `1` \| `2` \| `3` | Yes | Vertex colour channel that multiplies the width (-1 = none). |
| `smoothNormals` | boolean | `true` | — | Yes | Bake averaged normals so hard-edged meshes keep a closed hull. |

### Character toon shading: Material Maps

Strengths of the source material's normal, AO, emissive, matcap, detail, roughness/metalness and specular colour maps.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Use the source material's maps. |
| `normal.strength` | number | `1` | 0 – 2 | Yes | Normal map strength on the lighting normal. |
| `normal.scale` | number | `1` | 0 – 4 | Yes | Multiplier on the source material's own normal scale. |
| `ao.strength` | number | `1` | 0 – 1 | Yes | AO map strength; occluded texels move into the shadow tone. |
| `emissive.color` | color | `[1, 1, 1]` | — | Yes | Multiplier on the source emissive colour. |
| `emissive.strength` | number | `1` | 0 – 8 | Yes | Emission strength. |
| `matcap.strength` | number | `1` | 0 – 2 | Yes | Matcap strength where a matcap texture is present (metal). |
| `detail.map` | texture | — | — | No — local/runtime | A tiling detail texture multiplied into the albedo (also `userData.toonDetailMap`). |
| `detail.repeat` | number | `8` | 0.1 – 128 | Yes | Detail texture tiling. |
| `detail.strength` | number | `0` | 0 – 1 | Yes | Detail texture strength (mid-grey is neutral). |
| `roughness.strength` | number | `0.5` | 0 – 1 | Yes | How much a roughness map dims the specular highlight. |
| `metalness.strength` | number | `1` | 0 – 1 | Yes | How much a metalness map drives the matcap and tints the highlight with the albedo. |
| `specularColor.strength` | number | `1` | 0 – 1 | Yes | Specular colour map strength. |

### Character toon shading: Base Texture

How the source base texture and material colour become the albedo.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `materialColorMode` | select | `'legacy'` | `legacy` \| `source` \| `texture` \| `white` | Yes | How the source material colour combines with its base texture (`legacy` ignores importer default greys). |
| `saturationMode` | select | `'legacy'` | `legacy` \| `source` \| `custom` | Yes | Base-texture saturation policy (`legacy` lifts cloth slightly and calms skin). |
| `customSaturation` | number | `1` | 0 – 2 | Yes | Saturation multiplier used when the saturation mode is `custom`. |

### Character toon shading: Alpha

Cutout, blend and draw-order policy for the model's materials.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Apply the alpha policy (cutouts, blended overlays, draw order). |
| `coverageMode` | select | `'auto'` | `auto` \| `trust` | Yes | `auto` checks each inferred cutout against the measured alpha coverage; `trust` honours every rule as-is. |
| `cutoutCutoff` | number | `0.35` | 0 – 1 | Yes | Alpha below which cutout texels are discarded. |
| `blendCutoff` | number | `0.02` | 0 – 1 | Yes | Alpha below which blended texels are discarded. |
| `ditherOpacity` | number | `1` | 0 – 1 | Yes | Screen-door fade of the whole character (1 = opaque). |
| `featuresOverHairDepth` | number | `0.03` | 0 – 0.1 | Yes | Brows, lashes and eye lines draw over bangs by pulling their depth this far toward the camera. 0 = off. |
| `preserveSourceAlphaTest` | boolean | `true` | — | Yes | Keep a source material's own alpha test. |
| `sourceAlphaMapCutout` | boolean | `true` | — | Yes | Cut out materials with an alpha map. |
| `mapTransparentCutout` | boolean | `true` | — | Yes | Cut out materials whose base texture is flagged transparent. |
| `sourceTransparentCutout` | boolean | `true` | — | Yes | Cut out (rather than blend) fully opaque materials flagged transparent. |
| `skinCutout` | boolean | `true` | — | Yes | Cut out skin materials. |
| `faceCutout` | boolean | `true` | — | Yes | Cut out face materials. |
| `hairCutout` | boolean | `true` | — | Yes | Cut out hair materials. |
| `costumeCutout` | boolean | `true` | — | Yes | Cut out costume materials. |
| `expressionTokenCutout` | boolean | `true` | — | Yes | Cut out materials named skin/cloth/hair/expression. |
| `transparentOverlayBlend` | boolean | `true` | — | Yes | Blend transparent overlays (blush, eye highlights, decals). |
| `transparentOpacityThreshold` | number | `0.999` | 0 – 1 | Yes | Material opacity at or above which a material counts as opaque. |
| `overlayDepthWrite` | boolean | `false` | — | Yes | Overlays write depth. |
| `sortOverlays` | boolean | `true` | — | Yes | Draw eye layers and overlays in a fixed order. |
| `scleraOrder` | number | `10` | -100 – 100 | Yes | Draw order of eye whites. |
| `eyeOrder` | number | `11` | -100 – 100 | Yes | Draw order of irises and pupils. |
| `eyeHighlightOrder` | number | `12` | -100 – 100 | Yes | Draw order of eye highlights. |
| `overlayOrder` | number | `20` | -100 – 100 | Yes | Draw order of other overlays. |

### Character toon shading: Automatic Roles

Automatic face, skin and hair roles for models whose materials name none.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `mode` | select | `'auto'` | `auto` \| `off` | Yes | `auto` infers face, skin and hair per vertex when no material is named as a face; `off` never does. |
| `skinTolerance` | number | `0.07` | 0.01 – 0.3 | Yes | Chromaticity distance from the model's sampled skin tone that still counts as skin. |

### Character toon shading: Sticker

A decal texture blended into the albedo before lighting.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Blend a decal texture into the albedo before lighting. |
| `map` | texture | — | — | No — local/runtime | Decal texture for every material (per material: `userData.toonStickerMap`). |
| `blendMode` | select | `'normal'` | `normal` \| `add` \| `multiply` | Yes | How the decal combines with the albedo. |
| `strength` | number | `1` | 0 – 1 | Yes | Decal opacity. |
| `repeat` | vector2 | `[1, 1]` | -64 – 64 | Yes | Decal UV tiling. |
| `offset` | vector2 | `[0, 0]` | -64 – 64 | Yes | Decal UV offset. |
| `uvChannel` | select | `0` | `0` \| `1` | Yes | UV set the decal uses. |

### Character toon shading: Fur

Shell fur on opted-in materials.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Shell fur on opted-in materials (names, roles or `userData.toonFur`). |
| `shellCount` | number | `8` | 1 – 32 | Yes | Number of shells; cost grows linearly. |
| `length` | number | `0.02` | 0 – 1 | Yes | Fur length at the outermost shell, metres. |
| `gravity` | number | `0.35` | 0 – 1 | Yes | How far the tips sag toward world down. |
| `density` | number | `3` | 0.1 – 40 | Yes | Strand density. |
| `rootOffset` | number | `-0.2` | -1 – 0 | Yes | Shifts strand coverage toward the roots; more negative = fuller coat. |
| `rootShade` | number | `0.55` | 0 – 1 | Yes | Darkens the roots for depth. |
| `materials` | list | — | — | Yes | Material names or patterns that grow fur. |
| `roles` | list | — | — | Yes | Material roles that grow fur. |

## Environment shading

Module: `@call-me-sensei/toonlab/environment` — 2 groups, 87 fields.

Settings are `{ features, parameters }`: `createEnvironmentSettings({ parameters: { exposure: 0.95 } })`.

### Environment shading: Features

Enables or disables individual environment shader feature paths.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `alphaCutout` | boolean | `true` | — | Yes | Turns alpha cutout processing on or off for environment materials. |
| `alphaMap` | boolean | `true` | — | Yes | Turns alpha map processing on or off for environment materials. |
| `ambientLight` | boolean | `true` | — | Yes | Turns ambient light processing on or off for environment materials. |
| `ambientProbe` | boolean | `true` | — | Yes | Turns ambient probe processing on or off for environment materials. |
| `aoMap` | boolean | `true` | — | Yes | Turns ao map processing on or off for environment materials. |
| `aoOverlay` | boolean | `true` | — | Yes | Turns ao overlay processing on or off for environment materials. |
| `directionalLights` | boolean | `true` | — | Yes | Turns directional lights processing on or off for environment materials. |
| `emissive` | boolean | `true` | — | Yes | Turns emissive processing on or off for environment materials. |
| `emissiveMap` | boolean | `true` | — | Yes | Turns emissive map processing on or off for environment materials. |
| `foliageCutout` | boolean | `true` | — | Yes | Turns foliage cutout processing on or off for environment materials. |
| `heightFog` | boolean | `true` | — | Yes | Turns height fog processing on or off for environment materials. |
| `interiorOcclusion` | boolean | `true` | — | Yes | Turns interior occlusion processing on or off for environment materials. |
| `leftSideShadow` | boolean | `true` | — | Yes | Turns side shadow processing on or off for environment materials. |
| `lightMap` | boolean | `true` | — | Yes | Turns lightmap processing on or off for environment materials. |
| `normalMap` | boolean | `true` | — | Yes | Turns normal map processing on or off for environment materials. |
| `packedMap` | boolean | `true` | — | Yes | Turns packed map processing on or off for environment materials. |
| `planarReflection` | boolean | `true` | — | Yes | Turns floor reflection processing on or off for environment materials. |
| `pointLights` | boolean | `true` | — | Yes | Turns point lights processing on or off for environment materials. |
| `shadowMask` | boolean | `true` | — | Yes | Turns shadow mask processing on or off for environment materials. |
| `shadowMesh` | boolean | `true` | — | Yes | Turns shadow mesh processing on or off for environment materials. |
| `skyTint` | boolean | `true` | — | Yes | Turns sky tint processing on or off for environment materials. |
| `specular` | boolean | `true` | — | Yes | Turns specular processing on or off for environment materials. |
| `spotLights` | boolean | `true` | — | Yes | Turns spot lights processing on or off for environment materials. |
| `sunBoost` | boolean | `true` | — | Yes | Turns sun boost processing on or off for environment materials. |
| `untexturedGradient` | boolean | `true` | — | Yes | Turns untextured gradient processing on or off for environment materials. |
| `vertexAo` | boolean | `true` | — | Yes | Turns vertex ao processing on or off for environment materials. |
| `windowCutout` | boolean | `true` | — | Yes | Turns window cutout processing on or off for environment materials. |

### Environment shading: Shader Parameters

Overrides numeric environment shader uniforms. Auto values preserve material defaults.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `ambientProbeBlend` | number | — | 0 – 1 | Yes | Overrides ambient probe blend; leave unset in code to use the material default. |
| `ambientStrength` | number | — | 0 – 2 | Yes | Overrides ambient strength; leave unset in code to use the material default. |
| `ambientLightInfluence` | number | — | 0 – 2 | Yes | Overrides ambient influence; leave unset in code to use the material default. |
| `aoMapStrength` | number | — | 0 – 2 | Yes | Overrides ao map strength; leave unset in code to use the material default. |
| `aoWarmth` | number | — | 0 – 1 | Yes | Overrides ao warmth; leave unset in code to use the material default. |
| `bakedGlowStrength` | number | — | 0 – 2 | Yes | Overrides baked glow; leave unset in code to use the material default. |
| `cloudShadowCoverage` | number | — | 0 – 1 | Yes | Overrides cloud shadow coverage; leave unset in code to use the material default. |
| `cloudShadowScale` | number | — | 0 – 0.1 | Yes | Overrides cloud shadow scale; leave unset in code to use the material default. |
| `cloudShadowStrength` | number | — | 0 – 2 | Yes | Overrides cloud shadow; leave unset in code to use the material default. |
| `directLightStrength` | number | — | 0 – 2 | Yes | Overrides direct light; leave unset in code to use the material default. |
| `emissiveMapStrength` | number | — | 0 – 2 | Yes | Overrides emissive map strength; leave unset in code to use the material default. |
| `emissiveStrength` | number | — | 0 – 2 | Yes | Overrides emissive strength; leave unset in code to use the material default. |
| `exposure` | number | — | 0 – 2 | Yes | Overrides exposure; leave unset in code to use the material default. |
| `heightFogColor` | color | — | — | Yes | Overrides height fog color; leave unset in code to use the material default. |
| `heightFogDensity` | number | — | 0 – 0.5 | Yes | Overrides height fog density; leave unset in code to use the material default. |
| `heightFogFalloff` | number | — | 0.05 – 600 | Yes | Overrides height fog falloff; leave unset in code to use the material default. |
| `interiorOcclusionColor` | color | — | — | Yes | Overrides interior occlusion color; leave unset in code to use the material default. |
| `interiorOcclusionStrength` | number | — | 0 – 2 | Yes | Overrides interior occlusion strength; leave unset in code to use the material default. |
| `leftSideShadow` | number | — | 0 – 1 | Yes | Overrides side shadow; leave unset in code to use the material default. |
| `leftSideShadowColor` | color | — | — | Yes | Overrides side shadow color; leave unset in code to use the material default. |
| `lightMapLift` | number | — | 0 – 1 | Yes | Overrides lightmap lift; leave unset in code to use the material default. |
| `lightMapStrength` | number | — | 0 – 2 | Yes | Overrides lightmap strength; leave unset in code to use the material default. |
| `lightingInfluence` | number | — | 0 – 2 | Yes | Overrides lighting influence; leave unset in code to use the material default. |
| `normalMapStrength` | number | — | 0 – 2 | Yes | Overrides normal map strength; leave unset in code to use the material default. |
| `packedOcclusionStrength` | number | — | 0 – 2 | Yes | Overrides packed occlusion; leave unset in code to use the material default. |
| `planarReflectionFresnel` | number | — | 0.1 – 8 | Yes | Overrides floor reflection fresnel; leave unset in code to use the material default. |
| `planarReflectionStrength` | number | — | 0 – 2 | Yes | Overrides floor reflection strength; leave unset in code to use the material default. |
| `pointLightStrength` | number | — | 0 – 2 | Yes | Overrides point light; leave unset in code to use the material default. |
| `saturation` | number | — | 0 – 2 | Yes | Overrides saturation; leave unset in code to use the material default. |
| `shadeSoftness` | number | — | 0 – 1 | Yes | Overrides shade softness; leave unset in code to use the material default. |
| `shadeStrength` | number | — | 0 – 2 | Yes | Overrides shade strength; leave unset in code to use the material default. |
| `shadowLift` | number | — | 0 – 1 | Yes | Overrides shadow lift; leave unset in code to use the material default. |
| `sunShadowStrength` | number | — | 0 – 2 | Yes | Overrides sun shadow strength; leave unset in code to use the material default. |
| `shadowTintColor` | color | — | — | Yes | Overrides shadow tint; leave unset in code to use the material default. |
| `skyGroundTint` | color | — | — | Yes | Overrides sky ground tint; leave unset in code to use the material default. |
| `skyTintStrength` | number | — | 0 – 2 | Yes | Overrides sky tint strength; leave unset in code to use the material default. |
| `skyTopTint` | color | — | — | Yes | Overrides sky top tint; leave unset in code to use the material default. |
| `specularColor` | color | — | — | Yes | Overrides specular color; leave unset in code to use the material default. |
| `specularShininess` | number | — | 1 – 256 | Yes | Overrides specular shininess; leave unset in code to use the material default. |
| `specularSoftness` | number | — | 0 – 1 | Yes | Overrides specular softness; leave unset in code to use the material default. |
| `specularStrength` | number | — | 0 – 2 | Yes | Overrides specular strength; leave unset in code to use the material default. |
| `spotLightStrength` | number | — | 0 – 2 | Yes | Overrides spot light; leave unset in code to use the material default. |
| `sunBoost` | number | — | 0 – 1 | Yes | Overrides sun boost; leave unset in code to use the material default. |
| `sunBoostColor` | color | — | — | Yes | Overrides sun boost color; leave unset in code to use the material default. |
| `cliffFade` | number | — | 0 – 1 | Yes | Overrides cliff fade; leave unset in code to use the material default. |
| `cliffNoiseScale` | number | — | 0 – 1 | Yes | Overrides cliff noise scale; leave unset in code to use the material default. |
| `cliffNoiseStrength` | number | — | 0 – 2 | Yes | Overrides cliff noise strength; leave unset in code to use the material default. |
| `cliffStart` | number | — | 0 – 1 | Yes | Overrides cliff start; leave unset in code to use the material default. |
| `colormapDecode` | number | — | 0 – 1 | Yes | Overrides colormap decode; leave unset in code to use the material default. |
| `colormapMode` | number | — | 0 – 1 | Yes | Overrides colormap mode; leave unset in code to use the material default. |
| `colormapStrength` | number | — | 0 – 2 | Yes | Overrides macro colormap; leave unset in code to use the material default. |
| `dualDetailMix` | number | — | 0 – 1 | Yes | Overrides dual detail mix; leave unset in code to use the material default. |
| `dualDetailScale` | number | — | 0 – 1 | Yes | Overrides dual detail scale; leave unset in code to use the material default. |
| `triplanarDetail` | number | — | 0 – 1 | Yes | Overrides triplanar detail; leave unset in code to use the material default. |
| `triplanarDetailScale` | number | — | 0.25 – 64 | Yes | Overrides triplanar detail scale; leave unset in code to use the material default. |
| `triplanarEdgeHighlight` | number | — | 0 – 1 | Yes | Overrides rock edge highlight; leave unset in code to use the material default. |
| `untexturedGradientStrength` | number | — | 0 – 2 | Yes | Overrides untextured gradient strength; leave unset in code to use the material default. |
| `vtBlendHeight` | number | — | 0 – 1 | Yes | Overrides ground melt height; leave unset in code to use the material default. |
| `vtBlendStrength` | number | — | 0 – 2 | Yes | Overrides ground melt; leave unset in code to use the material default. |
| `vertexAoStrength` | number | — | 0 – 2 | Yes | Overrides vertex ao strength; leave unset in code to use the material default. |

## Rock shader profile

Module: `@call-me-sensei/toonlab/rock-shader` — 13 groups, 100 fields.

Reusable grouped material settings consumed by `applyRockShader(root, settings)`. Rock geometry, erosion, seed, LOD, collision, and current scene conditions remain separate.

### Rock shader profile: Base Projection

World-space base projection and graphic texture treatment.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `mode` | select | `'triplanar'` | `triplanar` \| `directional-bedding` | Yes | Compile-time texture graph: ordinary three-axis projection or coherent bedding that excludes the top-axis structural sample. |
| `upAxis` | select | `'y'` | `x` \| `y` \| `z` | Yes | World-space geological up axis used by directional bedding. |
| `scale` | number | `1.6` | 0.05 – 256 | Yes | World-space size of the projected rock texture in meters. |
| `saturation` | number | `0.78` | 0 – 2 | Yes | Saturation retained from the projected base texture. |
| `contrast` | number | `1.12` | 0 – 3 | Yes | Contrast around the rock projection midpoint. |
| `brightness` | number | `0.015` | -1 – 1 | Yes | Linear brightness offset applied after saturation and contrast. |
| `projectionContrast` | number | `0.62` | 0.05 – 4 | Yes | Sharpness of the triplanar blend between projection axes. |
| `sideOnly` | boolean | `false` | — | Yes | Restricts the base projection to side-oriented axes. |
| `nearDetailScale` | number | `1.4` | 0.05 – 32 | Yes | World-space size of the close-range detail octave in meters. |
| `nearDetailStrength` | number | `0.24` | 0 – 1 | Yes | Strength of close-range geological value breakup. |
| `nearDetailDistance` | number | `55` | 0.1 – 2000 | Yes | Camera distance in meters over which the close-range detail octave fades out. |

### Rock shader profile: Material Response

Shared stone tint and physically based response.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `tint` | color | `[0.92, 0.88, 0.8]` | — | Yes | IP-wide stone tint multiplied over asset color and projected detail. |
| `metallic` | number | `0` | 0 – 1 | Yes | Metallic response of ordinary rock surfaces. |
| `smoothness` | number | `0.08` | 0 – 1 | Yes | Base smoothness before top-layer masking and wetness. |
| `useSmoothnessTexture` | boolean | `false` | — | Yes | Reads the optional smoothness texture instead of a constant source. |
| `smoothnessContrast` | number | `1` | 0 – 4 | Yes | Contrast applied to the optional smoothness texture. |
| `emissiveStrength` | number | `0` | 0 – 2 | Yes | Base emission multiplier for deliberately luminous stone styles. |

### Rock shader profile: Shared Lighting

Rock-specific exposure and shaded-face readability under the current scene lighting.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `exposure` | number | `1` | 0 – 4 | Yes | Rock-specific direct-sun calibration. Base Color and indirect sky light remain unchanged. |
| `ambientFloor` | number | `0.04` | 0 – 0.4 | Yes | Albedo-relative indirect floor that keeps downward-facing overhangs readable. |
| `skyColorInfluence` | number | `0.35` | 0 – 1 | Yes | Fraction of active sky chroma admitted into the albedo-relative readability floor. |
| `skyFillStrength` | number | `1` | 0 – 2 | Yes | Rock-specific strength of the scene sky probe; direct sunlight is unchanged. |
| `skyFillTint` | color | `[1, 1, 1]` | — | Yes | Rock-specific RGB weighting for indirect sky light and blue back-shadow separation. |
| `shadowFill` | number | `0` | 0 – 1 | Yes | Fraction of direct sun retained where the shared low-angle shadow mask occludes the rock. Normal-facing response is preserved. |
| `shadowFillTint` | color | `[1, 1, 1]` | — | Yes | RGB weighting for retained direct light inside shared sun-shadow coverage. |

### Rock shader profile: Shoreline Response

Portable wet-rock response around the current scene water level.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `wetBandWidth` | number | `0.8` | 0 – 20 | Yes | Meters around the current water level that receive the wet-rock treatment. |
| `wetBandDarkening` | number | `0.22` | 0 – 1 | Yes | Maximum albedo darkening inside the wet band. |
| `wetRoughness` | number | `0.26` | 0.02 – 1 | Yes | Roughness approached inside the wet band. |

### Rock shader profile: Distance Tint

Distance color recession shared by rocks, cliffs, and mountains.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `closeDistance` | number | `18` | 0 – 2000 | Yes | World distance where the far tint begins. |
| `farDistance` | number | `140` | 0.1 – 50000 | Yes | World distance where the far tint reaches full strength. |
| `color` | color | `[0.55, 0.62, 0.66]` | — | Yes | Atmospheric stone tint used at long distance. |
| `strength` | number | `0.28` | 0 – 1 | Yes | Maximum blend toward the far-distance tint. |

### Rock shader profile: Normal Detail

Near and far normal-detail behavior.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `distance` | number | `75` | 0.1 – 50000 | Yes | Distance over which projected normal detail fades. |
| `nearFlatten` | number | `0.08` | -0.5 – 1.5 | Yes | Amount of projected normal flattening near the camera. |
| `farFlatten` | number | `0.75` | -0.5 – 1.5 | Yes | Amount of projected normal flattening at the fade distance. |
| `useSmoothed` | boolean | `false` | — | Yes | Uses an optional authored smoothed-normal texture as the base normal. |
| `normalGreenSign` | select | `1` | `-1` \| `1` | Yes | Normal-map green-channel convention: 1 retains Y, -1 flips it. |

### Rock shader profile: Striping

Optional graphic sediment or mineral striping over side faces.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Enables the optional side-projected stripe layer. |
| `scale` | number | `3.5` | 0.05 – 5000 | Yes | World-space size of the stripe texture. |
| `contrast` | number | `0.8` | 0 – 4 | Yes | Contrast of the stripe opacity mask. |
| `color` | color | `[0.65, 0.48, 0.3]` | — | Yes | Graphic color overlaid through the stripe mask. |

### Rock shader profile: Moss Response

Slope-aware moss treatment; current climate coverage remains scene-owned.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Enables the style capability for slope-aware moss. |
| `size` | number | `2.4` | 0.05 – 50 | Yes | World-space size of the projected moss pattern. |
| `sharpness` | number | `2.4` | 0 – 8 | Yes | Sharpness of the upward-facing moss slope mask. |
| `offset` | number | `0.35` | -1 – 1 | Yes | Upward-normal threshold where moss begins. |
| `multiply` | number | `1.6` | 0 – 24 | Yes | Strength of the projected moss coverage pattern. |
| `colorPower` | number | `1.25` | 0.1 – 6 | Yes | Contrast curve applied to the moss texture color. |
| `lowColor` | color | `[0.18, 0.28, 0.09]` | — | Yes | Dark end of the shared moss color range. |
| `highColor` | color | `[0.42, 0.55, 0.2]` | — | Yes | Light end of the shared moss color range. |
| `roughness` | number | `-1` | -1 – 1 | Yes | Surface roughness under full moss; -1 keeps the stone value. |
| `relief` | number | `0` | 0 – 1 | Yes | Flattens the rock detail normal under moss, as a cushion would. |
| `fringe` | number | `0` | 0 – 1 | Yes | Ragged break-up of the moss coverage boundary. |
| `fringeScale` | number | `0.35` | 0.02 – 1 | Yes | Fringe noise period as a fraction of the colonisation patch scale. |
| `formDriven` | number | `0` | 0 – 1 | Yes | Blends coverage from the moss albedo toward the geometric moisture field. |
| `coverage` | number | `-1` | -1 – 1 | Yes | Target moss coverage of supported surface; -1 keeps the legacy coverage curve. |
| `band` | number | `0.18` | 0.001 – 0.5 | Yes | Width of the coverage transition. Narrow bands read as a dyed waterline. |
| `patchScale` | number | `0.6` | 0.01 – 20 | Yes | World-space period of the colonisation noise, metres. |
| `patchStrength` | number | `0.8` | 0 – 1 | Yes | How strongly colonisation noise gates coverage. 0 gives an unbroken cap. |
| `patchOctaves` | number | `3` | 1 – 6 | Yes | Octaves of colonisation noise. |
| `patchContrast` | number | `1.6` | 0.1 – 6 | Yes | Separates the noise into distinct cushions rather than a smooth cloud. |
| `patternFloor` | number | `-1` | -1 – 1 | Yes | Moss-map luminance that maps to Low Color; -1 keeps the shipped per-channel ramp. |
| `patternCeiling` | number | `1` | 0 – 1 | Yes | Moss-map luminance that maps to High Color. Ignored when Pattern Floor is -1. |
| `damp` | number | `0` | 0 – 1 | Yes | Darkens the stone where the moss support field is wet, including just beyond the moss. |
| `exposure` | number | `0` | 0 – 2 | Yes | How strongly convex, weather-exposed form (crowns and ridges) suppresses moss. |
| `cushion` | number | `0` | 0 – 1 | Yes | Raises the moss into a soft cushion by tilting the shading normal along the patch field. |
| `contact` | number | `0` | 0 – 1 | Yes | Contact shading where a cushion meets bare stone — the occlusion a raised mass casts. |

### Rock shader profile: Top-Layer Mask

Shared upward-facing mask for geological top layers.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `useAssetMask` | boolean | `true` | — | Yes | Multiplies the slope mask by an optional asset-authored top mask. |
| `sharpness` | number | `2.3` | 0 – 8 | Yes | Sharpness of the shared upward-facing layer transition. |
| `offset` | number | `0.42` | -1 – 1 | Yes | Upward-normal threshold where top layers begin. |

### Rock shader profile: Grass Layer

Optional authored grass-over-rock layer, separate from current weather.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Enables grass texture projection on the shared top-layer mask. |
| `useGroundShader` | boolean | `false` | — | Yes | Uses the environment ground field for the grass cap color and surface response. |
| `scale` | number | `1.8` | 0.05 – 50 | Yes | World-space size of the projected grass texture. |
| `tint` | color | `[0.65, 0.78, 0.42]` | — | Yes | Style tint multiplied over the grass layer. |
| `saturation` | number | `0.8` | 0 – 2 | Yes | Saturation retained from the grass texture. |
| `emission` | number | `0` | 0 – 2 | Yes | Emission multiplier for the grass layer. |

### Rock shader profile: Snow Layer

Authored snow response; the current snow amount remains runtime state.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Enables the material capability for a snow top layer. |
| `scale` | number | `2` | 0.05 – 50 | Yes | World-space size of the projected snow texture. |
| `tint` | color | `[0.9, 0.95, 1]` | — | Yes | Shared snow tint. |
| `saturation` | number | `0.3` | 0 – 2 | Yes | Saturation retained from the snow texture. |
| `emission` | number | `0` | 0 – 2 | Yes | Emission multiplier for the snow layer. |

### Rock shader profile: Sand Layer

Optional authored sand-over-rock layer and its normal response.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Enables sand projection on the shared top-layer mask. |
| `useGroundShader` | boolean | `false` | — | Yes | Uses the environment ground field for the sand cap color and surface response. |
| `scale` | number | `1.5` | 0.05 – 50 | Yes | World-space size of the projected sand texture. |
| `tint` | color | `[0.82, 0.65, 0.4]` | — | Yes | Style tint multiplied over the sand layer. |
| `saturation` | number | `0.65` | 0 – 2 | Yes | Saturation retained from the sand texture. |
| `emission` | number | `0` | 0 – 2 | Yes | Emission multiplier for the sand layer. |
| `normalScale` | number | `1.5` | 0.05 – 50 | Yes | World-space size of the projected sand normal. |
| `normalStrength` | number | `0.35` | 0 – 2 | Yes | Strength of the sand-layer normal. |
| `normalRotationDegrees` | number | `30` | -180 – 180 | Yes | Rotation of the sand normal projection in degrees. |

### Rock shader profile: Asset Integration

How stable asset-authored channels participate in the shared shader.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sourceAlbedoMode` | select | `'replace'` | `replace` \| `blend` \| `retain` | Yes | Replace gives the strongest cross-library consistency; Blend admits a controlled amount of the imported texture; Retain uses it as the projected base. |
| `sourceAlbedoStrength` | number | `0.2` | 0 – 1 | Yes | Imported-albedo influence when Source Albedo is Blend. Ignored by Replace and Retain. |
| `sourceNormalStrength` | number | `1` | 0 – 2 | Yes | Influence of the imported tangent-space normal map. Independent from albedo replacement so authored cracks and erosion survive strict styling. |
| `sourceAoStrength` | number | `1` | 0 – 2 | Yes | Influence of the imported AO or ORM red channel in creases and cavities. Independent from source color. |
| `vertexColorStrength` | number | `0.8` | 0 – 1 | Yes | Influence of asset-authored vertex color over projected rock detail. |
| `vertexAoStrength` | number | `1` | 0 – 2 | Yes | Influence of the asset-authored envVertexAo channel. |
| `regionTintStrength` | number | `0` | 0 – 1 | Yes | Influence of the fail-closed _TL_ROCK_REGION base, shaft, neck, and cap palette. Zero does not require the attribute. |
| `regionBaseTint` | color | `[1, 1, 1]` | — | Yes | Multiplier applied to the geological support/base region. |
| `regionShaftTint` | color | `[1, 1, 1]` | — | Yes | Multiplier applied to the main hoodoo shaft region. |
| `regionNeckTint` | color | `[1, 1, 1]` | — | Yes | Independent overlay multiplier around the constricted neck. |
| `regionCapTint` | color | `[1, 1, 1]` | — | Yes | Multiplier applied to the resistant caprock region. |
| `regionNeckOverlayStrength` | number | `0` | 0 – 1 | Yes | How strongly the overlapping neck mask modifies the primary base/shaft/cap partition. |

## Ground shader profile

Module: `@call-me-sensei/toonlab/ground-shader` — 10 groups, 67 fields.

Reusable grouped terrain-material settings consumed by `createGroundShaderMaterial(settings)` and `createGroundShaderMesh({ geometry, settings })`. Terrain geometry, coverage, LOD, collision, and current scene conditions remain separate.

### Ground shader profile: Ground Layers

Coordinated base treatment for the four semantic ground layers.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `grassTint` | color | `[0.38, 0.61, 0.3]` | — | Yes | Anime meadow tint for lawn and groundcover-painted terrain. |
| `dirtTint` | color | `[0.48, 0.43, 0.37]` | — | Yes | Warm anime-earth tint for trails and exposed soil. |
| `rockTint` | color | `[0.58, 0.63, 0.69]` | — | Yes | Cool luminous stone tint for cliffs and embedded-rock layers. |
| `sandTint` | color | `[0.88, 0.78, 0.52]` | — | Yes | Graphic shoreline tint for beaches and dry sediment. |
| `textureStrength` | number | `1` | 0 – 1 | Yes | Strength of authored layer textures relative to the graphic layer tints. |
| `saturation` | number | `1` | 0 – 2 | Yes | Saturation applied after splat-layer composition. |
| `contrast` | number | `1` | 0 – 2.5 | Yes | Contrast around the ground-color midpoint. |
| `brightness` | number | `0` | -0.5 – 0.5 | Yes | Linear brightness offset after layer composition. |

### Ground shader profile: Projection

World-space layer scale and steep-surface projection.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `grassScale` | number | `16` | 0.05 – 64 | Yes | World-space repeat size in meters for the grass layer. |
| `dirtScale` | number | `13` | 0.05 – 64 | Yes | World-space repeat size in meters for the dirt layer. |
| `rockScale` | number | `25` | 0.05 – 128 | Yes | World-space repeat size in meters for rock and cliff detail. |
| `sandScale` | number | `10` | 0.05 – 64 | Yes | World-space repeat size in meters for sand detail. |
| `triplanarStrength` | number | `1` | 0 – 1 | Yes | Strength of triplanar projection on steep surfaces. |
| `triplanarSharpness` | number | `2` | 0.25 – 12 | Yes | Sharpness of blending between triplanar projection axes. |

### Ground shader profile: Macro Variation

Large-scale color variation that prevents flat, repeating terrain.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `amount` | number | `0.16` | 0 – 1 | Yes | Primary world-space brightness variation. |
| `scale` | number | `0.045` | 0.0005 – 0.5 | Yes | Primary macro-noise frequency in inverse meters. |
| `secondaryAmount` | number | `0.08` | 0 – 1 | Yes | Secondary broad variation that breaks the primary pattern. |
| `secondaryScale` | number | `0.012` | 0.0002 – 0.25 | Yes | Secondary macro-noise frequency in inverse meters. |
| `tint` | color | `[0.74, 0.86, 0.58]` | — | Yes | Graphic color introduced through macro variation. |
| `tintStrength` | number | `0.12` | 0 – 1 | Yes | Maximum blend toward the macro tint. |
| `rockDetailAmount` | number | `0.3` | 0 – 1 | Yes | Triplanar geological value variation applied to steep rock surfaces even when no authored layer map is supplied. |
| `rockDetailScale` | number | `0.42` | 0.005 – 4 | Yes | World-space frequency for procedural triplanar cliff detail. |
| `rockStrataAmount` | number | `0.2` | 0 – 1 | Yes | Horizontal geological band variation applied to steep cliff surfaces. |
| `rockStrataScale` | number | `0.72` | 0.01 – 8 | Yes | Vertical frequency for procedural cliff strata. |

### Ground shader profile: Slope Response

How steep terrain transitions toward the rock treatment.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `autoRockStrength` | number | `0.82` | 0 – 1 | Yes | Maximum automatic rock-layer takeover on steep terrain. |
| `start` | number | `0.18` | 0 – 1 | Yes | World-normal slope value where automatic rock begins. |
| `fade` | number | `0.16` | 0.001 – 1 | Yes | Width of the grass-to-rock slope transition. |
| `noiseStrength` | number | `0.08` | 0 – 0.5 | Yes | World-noise offset that prevents analytic contour bands. |
| `noiseScale` | number | `0.035` | 0.0005 – 0.5 | Yes | Frequency of the slope-transition noise. |
| `edgeHighlight` | number | `0.28` | 0 – 2 | Yes | Warm graphic lift along the flat-to-cliff transition. |

### Ground shader profile: Shoreline Response

Response to the current scene water level; the water level itself is never serialized.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `autoSandStrength` | number | `0.55` | 0 – 1 | Yes | Automatic blend toward the sand treatment near current water level. |
| `bandWidth` | number | `3.5` | 0.05 – 40 | Yes | Meters around water level that can receive automatic sand. |
| `softness` | number | `1.25` | 0.01 – 20 | Yes | Softness in meters of the automatic shoreline transition. |
| `wetBandWidth` | number | `0.7` | 0 – 10 | Yes | Meters above water level that receive a damp shoreline response. |
| `wetBandDarkening` | number | `0.18` | 0 – 1 | Yes | Maximum darkening in the damp shoreline band. |

### Ground shader profile: Material Response

Shared physically based response for the ground surface.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `roughness` | number | `0.9` | 0 – 1 | Yes | Dry ground roughness before current wetness. |
| `metalness` | number | `0` | 0 – 1 | Yes | Metallic response for deliberately unusual ground styles. |
| `microOcclusionStrength` | number | `0.16` | 0 – 1 | Yes | Subtle broad surface occlusion derived from terrain form and macro variation. |
| `emissiveStrength` | number | `0` | 0 – 2 | Yes | Emission multiplier for deliberately luminous ground styles. |

### Ground shader profile: Lighting

Ground-specific response to the current scene sun and sky.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunIntensity` | number | `1` | 0 – 4 | Yes | Exposure of sun-facing ground after the graphic light/shade split. Values above one preserve HDR headroom for tone mapping. |
| `backShadowStrength` | number | `0.38` | 0 – 0.8 | Yes | Directional value loss on terrain faces turned away from the current sun; keeps cliffs from reading as unlit flat color. |
| `shadowTint` | color | `[0.68, 0.74, 0.94]` | — | Yes | Cool tint introduced on surfaces facing away from the current sun. |
| `shadowTintStrength` | number | `0.34` | 0 – 1 | Yes | Strength of the cool ground-shadow treatment. |
| `shadowLift` | number | `0.4` | 0 – 1 | Yes | Albedo-relative floor retained in shaded ground. |
| `sunTintStrength` | number | `0.18` | 0 – 1 | Yes | Influence of current sun color on lit ground. |
| `skyFillStrength` | number | `0.12` | 0 – 1 | Yes | Influence of current sky color on shaded ground. |
| `rimStrength` | number | `0.06` | 0 – 1 | Yes | View-dependent grazing-angle color lift. |

### Ground shader profile: Weather Response

How ground responds to current wetness and snow coverage.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `wetDarkening` | number | `0.24` | 0 – 1 | Yes | Maximum albedo darkening at full wetness. |
| `wetDesaturation` | number | `0.08` | 0 – 1 | Yes | Maximum color desaturation at full wetness. |
| `wetRoughness` | number | `0.38` | 0 – 1 | Yes | Roughness approached at full wetness. |
| `snowTint` | color | `[0.92, 0.96, 1]` | — | Yes | Ground snow tint. |
| `snowStrength` | number | `0.92` | 0 – 1 | Yes | Maximum visible snow coverage response. |
| `snowSlopeStart` | number | `0.62` | -1 – 1 | Yes | Upward-normal threshold where snow begins to remain. |
| `snowSoftness` | number | `0.22` | 0.001 – 1 | Yes | Softness of the snow slope transition. |

### Ground shader profile: Print Response

How printable dirt, sand, and snow respond to transient footprint and track stamps.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `strength` | number | `1` | 0 – 1 | Yes | Master visibility of the transient Ground Print Layer. |
| `dirtStrength` | number | `0.7` | 0 – 1 | Yes | Printability of the painted dirt layer. |
| `sandStrength` | number | `1` | 0 – 1 | Yes | Printability of the painted sand layer. |
| `snowStrength` | number | `1` | 0 – 1 | Yes | Printability of current snow once scene snow depth is sufficient. |
| `depressionDarkening` | number | `0.28` | 0 – 1 | Yes | Albedo darkening inside compressed or displaced material. |
| `rimLightening` | number | `0.22` | 0 – 1 | Yes | Graphic lift on the raised edge around a print. |
| `normalStrength` | number | `1.4` | 0 – 6 | Yes | World-space normal relief derived from the print field. |
| `compactedRoughness` | number | `0.5` | 0 – 1 | Yes | Roughness approached inside compacted prints. |

### Ground shader profile: Distance Treatment

Atmospheric recession and detail simplification over viewing distance.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `start` | number | `500` | 0 – 10000 | Yes | Distance in meters where atmospheric ground tint begins. |
| `end` | number | `15000` | 1 – 50000 | Yes | Distance in meters where atmospheric tint reaches full strength. |
| `color` | color | `[0.59375, 0.59375, 0.59375]` | — | Yes | Atmospheric ground color at long distance. |
| `strength` | number | `0.5` | 0 – 1 | Yes | Maximum blend toward the far-distance color. |
| `detailFade` | number | `1` | 0 – 1 | Yes | Amount of high-frequency texture and macro detail removed at range. |

## Water

Module: `@call-me-sensei/toonlab/water` — 7 groups, 82 fields.

Flat authored settings for `WaterSurface`; live sun/sky and Weather wave energy compose through transient scene layers without changing portable `water.settings`. Quality is a construction-time graph policy.

### Water: Waves

Gerstner swell and detail ripple shaping.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `waveIntensity` | number | `0.25` | 0 – 1 | Yes | Authored baseline from glassy mirror (0) to storm swell (1); scene weather can transiently modulate it without changing the preset. |
| `waterLevel` | number | `0.36` | 0 – 4 | Yes | World-space rest height of the surface; waves and run-up displace around it. |
| `waveAmplitude` | number | `0.3` | 0 – 5 | Yes | Primary amplitude in meters at full intensity, before splitting into a wave set. The combined surface includes smaller waves; its wavelengths lengthen to keep slopes bounded. |
| `shoalingDepth` | number | `1.4` | 0.05 – 12 | Yes | Column depth in meters at which waves reach full height; shallower water shrinks them (needs a bed height sampler). |
| `shorelineWaves` | number | `0.35` | 0 – 1 | Yes | Fraction of wave height that keeps rolling through the shallows as surf before dying at the waterline. |
| `shorelineRunup` | number | `0.6` | 0 – 3 | Yes | How far incoming waves wash a thin foam film up the beach; reach scales with wave energy. |
| `runupDistance` | number | `0` | 0 – 15 | Yes | Maximum horizontal reach in meters. Wave groups vary each event from 80–100%, and each backwash hands its endpoint into the next uprush. 0 lets wave energy decide. |
| `breakerEnabled` | boolean | `true` | — | Yes | Master switch for the breaker system; off removes the mesh and skips all breaker work (for perf A/B). |
| `breakerAmount` | number | `0` | 0 – 1 | Yes | Dedicated curling breaker shells along the break line; 0 disables the system (needs a bed height sampler). |
| `breakerCurl` | number | `0.8` | 0 – 1 | Yes | Lip pitch: 0 spills down the face, 1 curls a full surfable tunnel. |
| `breakerScale` | number | `1` | 0.25 – 3 | Yes | Shell height multiplier over the physical breaking height (0.72x column depth). |
| `breakerPeel` | number | `1` | 0 – 4 | Yes | How fast the barrel section travels sideways along the crest line. |
| `waveLength` | number | `7.5` | 1 – 120 | Yes | Longest wavelength in meters; smaller waves are derived from it. Big swells need long wavelengths to stay stable. |
| `waveSteepness` | number | `0.75` | 0 – 1.4 | Yes | Gerstner chop; higher values pinch crests sharper. |
| `waveSpeed` | number | `1` | 0 – 4 | Yes | Phase speed multiplier over the deep-water dispersion. |
| `waveDirection` | vector2 | `[1, 0.35]` | — | Yes | Main travel direction of the swell in the XZ plane. |
| `waveDirectionSpread` | number | `0.65` | 0 – 1 | Yes | 0 keeps all waves aligned (river); 1 spreads them omnidirectionally (open sea). The primary swell always follows Wave Direction exactly. |
| `waveSetPeriod` | number | `60` | 8 – 600 | Yes | Requested minimum interval between wave-set peaks. Stability limits and slow motion can lengthen it. |
| `waveSetStrength` | number | `0.5` | 0 – 1 | Yes | Depth of the set/lull cycle: 0 = constant swell, 1 = the swell dies completely between sets. |
| `detailNormalStrength` | number | `0.32` | 0 – 2 | Yes | Strength of the procedural micro-ripple normal detail. |
| `detailScale` | number | `1.15` | 0.05 – 8 | Yes | Spatial frequency of the micro-ripple detail. |
| `flowDirection` | vector2 | `[0.72, -0.18]` | — | Yes | Scroll direction for detail ripples, foam noise, and sparkles. |
| `flowSpeed` | number | `0.3` | 0 – 4 | Yes | Scroll speed for surface detail; high values read as a river current. |

### Water: Surface

Water body color, refraction, and caustics.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `colorTone` | select | `'classic'` | `classic` \| `anime` \| `teal` \| `caribbean` \| `lagoon` \| `deepOcean` | Yes | Named body-color palette forced over the preset colors; classic returns control to the preset. |
| `shallowColor` | color | `[0.42, 0.85, 0.88]` | — | Yes | Water tint right at the shoreline. |
| `midColor` | color | `[0.2, 0.62, 0.8]` | — | Yes | Water tint at moderate depth. |
| `deepColor` | color | `[0.1, 0.38, 0.6]` | — | Yes | Water tint where the bottom is no longer visible. |
| `depthFadeDistance` | number | `1` | 0.05 – 12 | Yes | Water column depth where the shallow tint gives way to mid. |
| `deepFadeDistance` | number | `2.2` | 0.05 – 24 | Yes | Additional depth where mid fades to the deep tint. |
| `opacity` | number | `0.8` | 0 – 1 | Yes | Base transparency when no scene color grab pass is bound. |
| `refractionStrength` | number | `0.35` | 0 – 2 | Yes | Screen-space distortion of the underwater scene. |
| `indexOfRefraction` | number | `1.333` | 1.0001 – 1.8 | Yes | Index of refraction used by the underwater Snell window and total internal reflection. |
| `underwaterTransmission` | number | `1` | 0 – 1 | Yes | Visibility of the real above-water scene through the surface from below. |
| `underwaterTintStrength` | number | `0.35` | 0 – 1 | Yes | Stylized water-color tint applied to the view through the surface. |
| `causticsStrength` | number | `0.55` | 0 – 3 | Yes | Brightness of focused sunlight on the submerged bed. The dynamics path derives focusing from the water normals. |
| `causticsScale` | number | `0.8` | 0.05 – 8 | Yes | Spatial frequency of the caustic web. |
| `causticsSpeed` | number | `0.6` | 0 – 4 | Yes | Animation speed of the caustic web. |

### Water: Foam

Shoreline foam, whitecaps, and wake foam.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `foamColor` | color | `[0.94, 1, 0.99]` | — | Yes | Color of all foam: shoreline, whitecaps, wakes, and splashes. |
| `foamAmount` | number | `1` | 0 – 2 | Yes | Offshore contact foam, whitecap, and wake gain. |
| `swashFoamAmount` | number | `1.15` | 0 – 2 | Yes | Independent gain for torn foam carried up and back down the beach. |
| `swashFoamLifetime` | number | `4` | 0.25 – 30 | Yes | Seconds fresh aerated swash foam remains before thinning into residue. |
| `swashFoamResidueLifetime` | number | `10` | 0.5 – 60 | Yes | Seconds fragmented beach foam persists and drifts after the active front passes. |
| `wetSandDryTime` | number | `120` | 2 – 600 | Yes | Seconds saturated sand takes to return to its dry color after the water retreats. |
| `wetSandDarkening` | number | `0.58` | 0 – 1 | Yes | How strongly remembered moisture darkens exposed sand. |
| `wetSandSheen` | number | `0.78` | 0 – 1 | Yes | Strength of the short-lived glossy water film left on freshly exposed sand. |
| `foamContactDistance` | number | `0.4` | 0.02 – 4 | Yes | Depth difference covered by the solid contact foam band. |
| `foamLineSpacing` | number | `0.55` | 0.05 – 4 | Yes | Spacing of the animated lapping foam lines off the shore. |
| `foamNoiseScale` | number | `0.6` | 0.05 – 8 | Yes | Breakup noise frequency for foam edges. |
| `whitecapAmount` | number | `0.05` | 0 – 1 | Yes | Coverage of breaking crests on open water. |
| `rippleFoamStrength` | number | `0.8` | 0 – 3 | Yes | Foam intensity left behind by interactive ripples and wakes. |

### Water: Lighting

Authored fallback sun/sky plus water-specific glint, fresnel, and reflection response.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.8, 0.45]` | — | Yes | Authored fallback direction toward the sun when no live scene-light override is connected. |
| `sunColor` | color | `[1, 0.96, 0.86]` | — | Yes | Authored fallback sun tint for glints, sparkles, and caustics; a live scene rig may replace it transiently. |
| `specularStrength` | number | `0.8` | 0 – 3 | Yes | Toon sun-glint intensity. |
| `specularShininess` | number | `150` | 4 – 2000 | Yes | Glint tightness; higher is smaller and sharper. |
| `specularStretch` | number | `0.35` | 0 – 0.95 | Yes | Elongates glints along the sun azimuth into a sparkling sun path. |
| `sparkleStrength` | number | `0.5` | 0 – 3 | Yes | Twinkling star-glint intensity. |
| `sparkleScale` | number | `1.5` | 0.1 – 16 | Yes | Density of the sparkle field. |
| `sparkleSpeed` | number | `1` | 0 – 6 | Yes | How quickly sparkles twinkle in and out. |
| `sunGlowStrength` | number | `0.85` | 0 – 3 | Yes | Sun disk glow in the procedural sky reflection. |
| `sceneShadowStrength` | number | `0.6` | 0 – 1 | Yes | How strongly cast shadows from rocks, trees, and the character darken the surface. |
| `fresnelStrength` | number | `0.9` | 0 – 2 | Yes | Grazing-angle reflectivity boost. |
| `fresnelPower` | number | `4.5` | 0.5 – 12 | Yes | Falloff of the fresnel band toward the horizon. |
| `fresnelBias` | number | `0.16` | 0 – 0.6 | Yes | Sky-tint floor at steep angles; higher reads more anime-blue. |
| `fresnelColor` | color | `[0.68, 0.9, 1]` | — | Yes | Additive rim tint at grazing angles. |
| `skyZenithColor` | color | `[0.5, 0.74, 0.98]` | — | Yes | Authored fallback procedural sky-reflection color overhead when no live scene sky is connected. |
| `skyHorizonColor` | color | `[0.86, 0.95, 1]` | — | Yes | Authored fallback procedural sky-reflection color at the horizon when no live scene sky is connected. |
| `reflectionStrength` | number | `0.62` | 0 – 1.5 | Yes | Planar/sky reflection mix, weighted by fresnel. |
| `reflectionDistortion` | number | `0.04` | 0 – 0.3 | Yes | How much waves shatter the reflection. |
| `reflectionSoftness` | number | `0.55` | 0 – 1 | Yes | Blends sharp planar reflections toward the soft procedural sky (milky anime look). |

### Water: Ripples

Interactive ripple simulation response.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `rippleStrength` | number | `1` | 0 – 6 | Yes | Global multiplier for splash and wake impulses. |
| `rippleDamping` | number | `0.985` | 0.9 – 0.999 | Yes | Energy retained per frame; higher rings travel farther. |
| `ripplePropagation` | number | `11` | 1 – 40 | Yes | Travel speed of interactive rings across the surface. |
| `rippleHeightScale` | number | `1` | 0 – 4 | Yes | Vertical displacement of the interactive ripples. |
| `rippleFoamDecay` | number | `0.94` | 0.5 – 0.999 | Yes | How long wake foam lingers. |
| `rippleFoamGain` | number | `2.4` | 0 – 12 | Yes | How quickly motion generates wake foam. |

### Water: Splashes

Procedural splash droplets, spray, and rings.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `splashStrength` | number | `1` | 0 – 3 | Yes | Global multiplier for splash particle counts and energy. |
| `splashScale` | number | `1` | 0.1 – 4 | Yes | Physical size multiplier for droplets, spray, and rings. |
| `splashDropletCount` | number | `26` | 0 – 120 | Yes | Droplets emitted by a strength-1 splash. |
| `splashRingCount` | number | `2` | 0 – 4 | Yes | Expanding foam rings emitted per splash. |
| `splashColor` | color | `[0.97, 1, 1]` | — | Yes | Bright tone of droplets and spray. |
| `splashShadeColor` | color | `[0.62, 0.86, 0.95]` | — | Yes | Shadow tone of the two-tone splash shading. |

### Water: Quality

Shader quality tier gating caustics, sparkles, and noise octaves.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `quality` | select | `'high'` | `low` \| `medium` \| `high` | Yes | Named quality tier: low drops caustics and sparkles, high adds chromatic caustics and extra detail octaves. |

## Post-processing

Module: `@call-me-sensei/toonlab/post` — 2 groups, 45 fields.

Settings are `{ features, parameters }`: `createPostProcessingSettings({ preset: "softAnime" })`.

### Post-processing: Features

Toggles for each optional screen-space effect in the final composite pass.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `atmosphere` | boolean | `false` | — | Yes | Two-layer stylized atmosphere: distance/height mix fog plus an additive sun/moon glow halo, colored by the scene environment state. |
| `bloom` | boolean | `false` | — | Yes | Adds glow around pixels brighter than the bloom threshold. |
| `colorGrade` | boolean | `false` | — | Yes | Applies exposure, contrast, saturation, and warmth grading. |
| `depthCue` | boolean | `false` | — | Yes | Fades distant pixels toward the depth cue color for atmospheric depth. |
| `enabled` | boolean | `false` | — | Yes | Forces the post-processing composite pass on, even with no individual effect active. |
| `motionBlur` | boolean | `false` | — | Yes | Blurs camera movement by reprojecting the previous frame (camera motion only). |
| `screenOutline` | boolean | `false` | — | Yes | Draws screen-space outlines from depth and luminance edges. |
| `vignette` | boolean | `false` | — | Yes | Darkens the frame toward the corners. |
| `verticalGrade` | boolean | `false` | — | Yes | Adds warm light at the top of the frame and darkening at the bottom. |

### Post-processing: Parameters

Tuning values used by the post-processing effects when their feature toggles are on.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bloomBackgroundSuppress` | number | `1` | 0 – 2 | Yes | Scales bloom gathered from non-character pixels when a character mask is connected. |
| `bloomCharacterBoost` | number | `1` | 0 – 4 | Yes | Scales bloom gathered from character pixels when a character mask is connected. |
| `bloomCharacterSaturation` | number | `1` | 0 – 3 | Yes | Scales the saturation of bloom gathered from character pixels when a character mask is connected. |
| `bloomLevels` | number | `5` | 2 – 8 | Yes | Number of mip levels in the pyramid bloom chain (pyramid mode only). |
| `bloomMode` | select | `'single'` | `single` \| `pyramid` | Yes | Selects the one-pass 9-tap bloom or the wider multi-pass pyramid bloom. |
| `bloomRadius` | number | `0.16` | 0 – 1 | Yes | Controls how far the bloom glow spreads from bright pixels. |
| `bloomStrength` | number | `0` | 0 – 2 | Yes | Controls how strongly bloom is added to the image. |
| `bloomThreshold` | number | `0.995` | 0 – 1 | Yes | Sets the luminance above which pixels start to bloom. |
| `bottomDark` | number | `0` | 0 – 1 | Yes | Darkens the lower part of the frame in the vertical grade. |
| `atmosphereBaseHeight` | number | `0` | -100 – 500 | Yes | World height where atmosphere fog is densest; fog thins above it. |
| `atmosphereFar` | number | `900` | 10 – 4000 | Yes | View distance in meters where atmosphere fog reaches full strength. |
| `atmosphereGlowStrength` | number | `1` | 0 – 3 | Yes | Multiplier on the environment-state sun/moon glow fog. |
| `atmosphereHeightFalloff` | number | `0.012` | 0 – 0.2 | Yes | How quickly atmosphere fog thins with altitude above the base height. |
| `atmosphereNear` | number | `60` | 0 – 1000 | Yes | View distance in meters where atmosphere fog starts. |
| `atmosphereStrength` | number | `0.55` | 0 – 1 | Yes | Maximum blend of the atmospheric mix fog. |
| `contrast` | number | `1` | 0 – 2 | Yes | Scales contrast around mid gray in the color grade. |
| `depthCueColor` | color | `[0.3371636150376657, 0.4735314961384573, 0.6866853124288864]` | — | Yes | Sets the color distant pixels fade toward. |
| `depthCueFar` | number | `24` | 0 – 200 | Yes | Sets the depth at which the depth cue reaches full strength. |
| `depthCueNear` | number | `1` | 0 – 50 | Yes | Sets the depth at which the depth cue starts to appear. |
| `depthCueStrength` | number | `0` | 0 – 1 | Yes | Controls how strongly distant pixels blend toward the depth cue color. |
| `exposure` | number | `1` | 0 – 4 | Yes | Multiplies overall image brightness in the color grade. |
| `lutMap` | texture | — | — | No — local/runtime | Optional 2D-strip color LUT texture (runtime only, not serialized). |
| `lutSize` | number | `0` | 0 – 64 | Yes | Slice size of the LUT strip; 0 derives it from the texture height. |
| `lutStrength` | number | `0` | 0 – 1 | Yes | Controls how strongly the LUT recolors the graded image. |
| `motionBlurStrength` | number | `0.55` | 0 – 2 | Yes | Scales the camera-reprojection blur distance along the motion vector. |
| `outlineColor` | color | `[0.005181516700061659, 0.006512090790025684, 0.010329823026364548]` | — | Yes | Sets the color drawn on detected screen-space edges. |
| `outlineDepthStrength` | number | `0.16` | 0 – 2 | Yes | Controls how strongly depth discontinuities contribute to outlines. |
| `outlineLumaStrength` | number | `0.04` | 0 – 2 | Yes | Controls how strongly luminance edges contribute to outlines. |
| `outlineStrength` | number | `0` | 0 – 2 | Yes | Controls the overall opacity of screen-space outlines. |
| `saturation` | number | `1` | 0 – 2 | Yes | Scales color saturation in the color grade. |
| `strength` | number | `1` | 0 – 1 | Yes | Blends between the raw render and the full post-processing result. |
| `topLight` | number | `0` | 0 – 1 | Yes | Adds warm light to the upper part of the frame in the vertical grade. |
| `vignetteRadius` | number | `0.55` | 0 – 1 | Yes | Sets the distance from the frame center where the vignette starts. |
| `vignetteSoftness` | number | `0.34` | 0 – 1 | Yes | Controls the falloff width of the vignette edge. |
| `vignetteStrength` | number | `0` | 0 – 1 | Yes | Controls how strongly the vignette darkens the frame edges. |
| `warmth` | number | `0` | -1 – 1 | Yes | Shifts the color grade warmer (positive) or cooler (negative). |

## Vegetation shader family

Module: `@call-me-sensei/toonlab/vegetation-shaders` — 8 groups, 104 fields.

Shared field registry for three independent portable profiles: Tree uses Shared/Foliage/Bark groups, Grass uses Shared/Grass groups, and Flower uses Shared/Foliage/Flower/Stem groups. Asset geometry, species, albedo, and current scene weather remain separate.

### Vegetation shader family: Shared Lighting

IP-wide light and shadow treatment shared by every vegetation surface.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `shadowTint` | color | `[0.36, 0.4, 0.58]` | — | Yes | Cool treatment tint mixed into shadowed vegetation without replacing its albedo. |
| `shadowTintStrength` | number | `1` | 0 – 1 | Yes | Strength of the shared shadow tint treatment. |
| `sunTintStrength` | number | `0.25` | 0 – 1 | Yes | How strongly the active sun color tints lit vegetation. |
| `skyFillStrength` | number | `0.08` | 0 – 0.5 | Yes | Shared sky-color fill in unlit vegetation regions. |
| `rimStrength` | number | `0.12` | 0 – 1 | Yes | View-dependent silhouette fill shared by vegetation surfaces. |
| `rimPower` | number | `3` | 0.5 – 12 | Yes | Falloff exponent of the shared vegetation rim. |

### Vegetation shader family: Thin Surfaces

Lighting shared by thin blades, leaf cards, and petals.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `diffuseWrap` | number | `0.5` | 0 – 1 | Yes | Wraps direct light around thin surfaces so back faces remain readable. |
| `transmissionStrength` | number | `0.35` | 0 – 2 | Yes | Shared sunlight transmission through blades, leaves, and petals. |
| `transmissionPower` | number | `3.5` | 0.5 – 12 | Yes | Angular concentration of thin-surface transmission. |
| `transmissionShadowFloor` | number | `0.35` | 0 – 1 | Yes | Minimum transmission that remains inside cast or cloud shadow. |
| `normalUpBias` | number | `0` | 0 – 1 | Yes | Biases thin-surface shading normals toward world up. |
| `twoSidedLighting` | number | `1` | 0 – 1 | Yes | Blends back-face normals into the shared thin-surface lighting model. |

### Vegetation shader family: Weather Response

How the IP shades wetness and snow; current weather amounts remain scene-owned.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `wetDarkening` | number | `0.15` | 0 – 1 | Yes | Maximum albedo darkening applied by wetness. |
| `wetDesaturation` | number | `0.05` | 0 – 1 | Yes | Maximum desaturation applied by wetness. |
| `wetHighlightStrength` | number | `0.2` | 0 – 1 | Yes | Stylized highlight added to wet vegetation. |
| `snowTint` | color | `[0.92, 0.96, 1]` | — | Yes | Vegetation-domain multiplier over the selected shared Snow Surface profile. The Snow Surface shader owns the base powder and shadow colors. |
| `snowShadowStrength` | number | `0.65` | 0 – 1 | Yes | Vegetation-domain light visibility retained over the shared Snow Surface shadow body. |
| `snowEdgeSoftness` | number | `0.2` | 0 – 1 | Yes | Softness of snow coverage transitions. |

### Vegetation shader family: Grass

Grass-only color, surface, lighting, dense-field, gust, and bend treatment.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `styleColorStrength` | number | `0` | 0 – 1 | Yes | Blend from asset-authored blade color to the style-owned root and tip treatment. |
| `baseColor` | color | `[0.16, 0.34, 0.08]` | — | Yes | Style-owned anime grass-root color. |
| `tipBrightness` | number | `0.1` | -1 – 1 | Yes | Brightness added to root color before the blade-tip saturation and hue treatment. |
| `tipDesaturation` | number | `-0.35` | -1 – 1 | Yes | Tip desaturation. Negative values increase saturation for a graphic anime gradient. |
| `tipHueShift` | number | `-0.06` | -1 – 1 | Yes | Normalized HSV hue rotation applied to blade tips. |
| `roughness` | number | `0.5` | 0 – 1 | Yes | Grass surface roughness used by the stylized highlight response. |
| `specularStrength` | number | `0.04` | 0 – 1 | Yes | Grass direct-light highlight strength. |
| `emissiveStrength` | number | `0` | 0 – 2 | Yes | Albedo-relative emission before scene exposure. |
| `backlitStrength` | number | `0.4` | 0 – 1.5 | Yes | Grass transmission multiplier. |
| `sceneShadowResponse` | number | `0.7` | 0 – 1 | Yes | Grass response to renderer shadow visibility. |
| `cloudShadowResponse` | number | `0.35` | 0 – 1 | Yes | Grass response to the scene cloud-shadow field. |
| `bandThreshold` | number | `0.49` | 0 – 1 | Yes | Center of the grass direct-light toon transition. |
| `bandSoftness` | number | `0.1` | 0 – 0.5 | Yes | Width of the grass direct-light toon transition. |
| `shadowFloor` | number | `0.35` | 0 – 1 | Yes | Minimum grass brightness in full shadow. |
| `rootOcclusionStrength` | number | `0.36` | 0 – 1 | Yes | Dense-field darkening at blade roots. |
| `rootOcclusionHeight` | number | `0.62` | 0.01 – 1 | Yes | Blade height over which root occlusion fades. |
| `tipGradientStart` | number | `0.1` | 0 – 1 | Yes | Blade fraction where the root-to-tip material gradient begins. |
| `tipGradientEnd` | number | `0.95` | 0 – 1 | Yes | Blade fraction where the root-to-tip material gradient completes. |
| `colorVariationStrength` | number | `0.2` | 0 – 1 | Yes | Seeded blade luminance variation. |
| `gustSheenThreshold` | number | `0.78` | 0 – 1 | Yes | Gust value where the blade-tip sheen begins. |
| `gustSheenStrength` | number | `0.22` | 0 – 1 | Yes | Strength of the moving gust sheen. |
| `bendExponent` | number | `2` | 0.5 – 6 | Yes | Root-to-tip curve used by wind and interaction deformation. |
| `interactionResponse` | number | `1` | 0 – 2 | Yes | Grass deformation response to a scene-owned interaction field. |

### Vegetation shader family: Foliage

Leaf-card gradient shaping, surface, subsurface, and canopy-volume treatment over the asset-authored foliage palette.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `styleColorStrength` | number | `0` | 0 – 1 | Yes | Legacy aggregate-only blend into a global replacement palette. Canonical Tree and Flower Shader profiles preserve asset-authored foliage colors. |
| `mainColor` | color | `[0.040915, 0.135633, 0.015209]` | — | Yes | Legacy aggregate-only replacement color. Canonical profiles read the primary foliage color from the asset or species recipe. |
| `gradientColor` | color | `[0.076185, 0.198069, 0.016807]` | — | Yes | Legacy aggregate-only replacement color. Canonical profiles read the secondary foliage color from the asset or species recipe. |
| `gradientOffset` | number | `0.088` | -1 – 1 | Yes | Offsets the normalized height transfer applied over the asset-authored foliage palette. |
| `gradientContrast` | number | `0.821665` | -1 – 4 | Yes | Shapes the normalized height transfer applied over the asset-authored foliage palette. |
| `hueVariation` | number | `0.1` | 0 – 1 | Yes | Style-owned hue-variation amplitude; the stable per-card seed remains asset or instance data. |
| `hueShift` | number | `0` | -1 – 1 | Yes | Style-wide normalized HSV rotation applied after resolving the asset-authored foliage palette. |
| `roughness` | number | `0.75` | 0 – 1 | Yes | Roughness of the stylized leaf highlight response over any asset-authored surface inputs. |
| `specularStrength` | number | `0.1` | 0 – 1 | Yes | Leaf direct-light highlight strength. |
| `emissiveStrength` | number | `0.25` | 0 – 2 | Yes | Albedo-relative leaf emission before scene exposure. |
| `subsurfaceStrength` | number | `0.8` | 0 – 2 | Yes | Strength of foliage back-light transmission. |
| `subsurfaceOpacity` | number | `0.3` | 0 – 1 | Yes | Opacity retained by foliage transmission. |
| `backlitStrength` | number | `0.35` | 0 – 1.5 | Yes | Foliage transmission multiplier. |
| `sceneShadowResponse` | number | `0.55` | 0 – 1 | Yes | Foliage response to renderer shadow visibility. |
| `cloudShadowResponse` | number | `0` | 0 – 1 | Yes | Foliage response to the scene cloud-shadow field. |
| `bandThreshold` | number | `0.47` | 0 – 1 | Yes | Center of the foliage direct-light toon transition. |
| `bandSoftness` | number | `0.18` | 0 – 0.5 | Yes | Width of the foliage direct-light toon transition. |
| `crestThreshold` | number | `0.72` | 0 – 1 | Yes | Center of the high crown-color crest band. |
| `crestSoftness` | number | `0.12` | 0 – 0.5 | Yes | Width of the high crown-color crest band. |
| `crownOcclusionStrength` | number | `0.2` | 0 – 1 | Yes | Additional darkening inside renderer-shadowed crowns. |
| `spriteLuminanceStrength` | number | `0.36` | 0 – 1 | Yes | Influence of painted leaf-sprite luminance. |
| `cardVariationStrength` | number | `0.16` | 0 – 1 | Yes | Seeded per-card luminance variation. |
| `transmissionPowerMultiplier` | number | `1` | 0.25 – 3 | Yes | Foliage multiplier over the shared thin-surface transmission concentration. |

### Vegetation shader family: Flower

Shared petal/center cutout, surface, lighting, and subsurface treatment across flower variants.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `textureTint` | color | `[1, 1, 1]` | — | Yes | Legacy aggregate-only replacement tint. Canonical Flower Shader profiles preserve the asset/species petal and center palette. |
| `tintStrength` | number | `1` | 0 – 1 | Yes | Legacy aggregate-only strength for the replacement flower tint. |
| `roughness` | number | `0.5` | 0 – 1 | Yes | Flower surface roughness used by the stylized highlight response. |
| `specularStrength` | number | `0.05` | 0 – 1 | Yes | Flower direct-light highlight strength. |
| `emissiveStrength` | number | `0` | 0 – 2 | Yes | Albedo-relative flower emission before scene exposure. |
| `subsurfaceStrength` | number | `0.3` | 0 – 2 | Yes | Strength of petal back-light transmission. |
| `subsurfaceOpacity` | number | `0.08` | 0 – 1 | Yes | Opacity retained by petal transmission. |
| `backlitStrength` | number | `0.35` | 0 – 1.5 | Yes | Petal transmission multiplier. |
| `sceneShadowResponse` | number | `0.85` | 0 – 1 | Yes | Flower response to renderer shadow visibility. |
| `bandThreshold` | number | `0.5` | 0 – 1 | Yes | Center of the flower direct-light toon transition. |
| `bandSoftness` | number | `0.1` | 0 – 0.5 | Yes | Width of the flower direct-light toon transition. |
| `unlitPetalLift` | number | `0.35` | 0 – 1 | Yes | Petal-tinted floor for unlit petal faces. |
| `cupDarkeningStrength` | number | `0.1` | 0 – 1 | Yes | Stylized darkening toward curved petal edges. |
| `petalTransmissionMultiplier` | number | `1` | 0 – 2 | Yes | Flower-family multiplier over shared thin-surface transmission. |
| `centerLightResponse` | number | `0.8` | 0 – 2 | Yes | Direct-light response of flower centers relative to petals. |
| `centerShadowResponse` | number | `1` | 0 – 2 | Yes | Shadow response of flower centers relative to petals. |

### Vegetation shader family: Bark / Woody Surface

Opaque woody color, texture projection, surface, and lighting treatment for trunks, branches, and roots.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `tint` | color | `[0.938, 0.3752, 0]` | — | Yes | Style tint mixed over the asset-authored bark color. |
| `tintStrength` | number | `0` | 0 – 1 | Yes | Strength of the bark style tint. |
| `roughness` | number | `1` | 0 – 1 | Yes | Bark roughness used by the stylized highlight response. |
| `normalFlatness` | number | `0` | 0 – 1 | Yes | Amount of asset-authored bark normal detail flattened by the style. |
| `emissiveStrength` | number | `0` | 0 – 2 | Yes | Albedo-relative bark emission before scene exposure. |
| `bandCount` | number | `3` | 2 – 6 | Yes | Cel bands across the woody light-to-shadow ramp. |
| `bandSoftness` | number | `0` | 0 – 1 | Yes | Continuous softness of woody toon-band transitions. |
| `shadowFloor` | number | `0.35` | 0 – 0.9 | Yes | Minimum brightness of a fully shadowed woody surface. |
| `sunTintStrength` | number | `0.15` | 0 – 1 | Yes | Sun-color tint applied to lit bark. |
| `skyFillStrength` | number | `0.04` | 0 – 0.5 | Yes | Sky-color fill applied to shaded bark. |
| `rimStrength` | number | `0` | 0 – 1 | Yes | View-dependent woody silhouette fill. |
| `specularStrength` | number | `0` | 0 – 1 | Yes | Stylized bark highlight strength. |
| `verticalShadeStrength` | number | `0` | 0 – 1 | Yes | World-up gradient used to ground trunks without changing their albedo. |

### Vegetation shader family: Herbaceous Stem

Smooth herbaceous stem surface and lighting treatment, intentionally separate from woody bark.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `color` | color | `[0.155926, 0.332452, 0.066626]` | — | Yes | Legacy aggregate-only replacement color. Canonical Flower Shader profiles read herbaceous stem color from the plant asset/species recipe. |
| `colorStrength` | number | `0` | 0 – 1 | Yes | Legacy aggregate-only blend into the replacement stem color. |
| `roughness` | number | `0.5` | 0 – 1 | Yes | Stem surface roughness used by the stylized highlight response. |
| `specularStrength` | number | `0.05` | 0 – 1 | Yes | Stem direct-light highlight strength. |
| `emissiveStrength` | number | `0` | 0 – 2 | Yes | Albedo-relative stem emission before scene exposure. |
| `bandCount` | number | `3` | 2 – 6 | Yes | Cel bands across herbaceous stems. |
| `bandSoftness` | number | `0.08` | 0 – 1 | Yes | Softness of herbaceous stem toon bands. |
| `shadowFloor` | number | `0.42` | 0 – 0.9 | Yes | Minimum brightness of a fully shadowed stem. |
| `transmissionStrength` | number | `0.08` | 0 – 1 | Yes | Subtle light transmission through green stems. |
| `skyFillStrength` | number | `0.06` | 0 – 0.5 | Yes | Additional stem sky-color fill over the shared vegetation fill. |
| `rimStrength` | number | `0.02` | 0 – 1 | Yes | View-dependent stem silhouette fill. |

## Grass

Module: `@call-me-sensei/toonlab/vegetation` — 9 groups, 30 fields.

Flat settings consumed by `new StylizedGrassField(options)` and `grass.applySettings(options)`. Portable grass preset v2 stores asset geometry, palette/material, and `windResponse` / `gustResponse`; current light, wind/gust field, cloud field, and push radius are scene/runtime inputs.

### Grass: Blades

Random blade dimensions baked into the instance attributes when the field is built. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `bladeHeightRange` | vector2 | `[0.16, 0.42]` | — | Yes | Min/max blade height in meters for placements without an explicit height. Construction-only: baked into instance attributes. |
| `bladeWidthRange` | vector2 | `[0.05, 0.085]` | — | Yes | Min/max blade width in meters for placements without an explicit width. Construction-only: baked into instance attributes. |
| `bladesPerClump` | number | `1` | 1 – 64 | Yes | Blades grown from each placement or authored into each paintable clump mesh. 1 keeps the classic lone-blade field; the first-party meadow clump uses 40. Construction-only. |
| `clumpRadius` | number | `0.055` | 0 – 1 | Yes | Base scatter radius in meters for the extra blades of a clump. Small values read as one tuft; larger values loosen the clump. Construction-only. |
| `leanStrength` | number | `1` | 0 – 2 | Yes | Authored static splay of each blade before live wind and interaction. Low values form clean upright meadow strokes; high values form wild bent grass. |

### Grass: Motion

Asset-level flexibility: how this grass responds when a scene supplies wind and gusts.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windResponse` | number | `1` | 0 – 8 | Yes | Asset flexibility multiplier applied to the current scene wind strength. 1 preserves the authored baseline; 0 keeps blades still. |
| `gustResponse` | number | `1` | 0 – 4 | Yes | How strongly this grass follows gust bands relative to its regular wind sway. |

### Grass: Palette

The blades' coordinated base, tip, and material shadow colors — the grass's identity, whatever the scene lighting does. Magical blue grass welcome.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `baseColor` | color | `[0.42, 0.68, 0.24]` | — | Yes | Blade color at the root. |
| `tipColor` | color | `[0.74, 0.9, 0.42]` | — | Yes | Blade color at the tip; blades gradient from base to tip. |
| `groundAdoptStrength` | number | `0` | 0 – 1 | Yes | How strongly blades adopt the terrain color under them from the scene ground field (0 keeps the authored palette). Needs a world running the ground-field pass. |
| `groundAdoptHeight` | number | `0.85` | 0.01 – 1 | Yes | Blade fraction the adopted ground color reaches before fading back to the palette tips. |
| `groundAdoptTint` | color | `[1, 1, 1]` | — | Yes | Multiplier applied to the adopted ground color — lift or warm the sampled terrain albedo before it colors the blades. |
| `washLift` | number | `0` | 0 – 1 | Yes | Procedural watercolor wash lift. Irregularly pulls blade strokes toward the active sun color without requiring a texture. |
| `washOpacity` | number | `1` | 0.1 – 1 | Yes | Layer opacity of the procedural watercolor blade strokes. Values below 1 soften each stroke against the terrain and sky. |

### Grass: Lighting

How the blades RESPOND to scene light — e.g. the backlit glow on blades between the camera and the sun.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `backlitStrength` | number | `0.3` | 0 – 2 | Yes | Translucent backlight boost when the camera looks toward the sun through the blades. |

### Grass: Shadows

Grass-material shadow strength and palette tint. The renderer and cloud-shadow fields themselves come from the scene.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `shadowStrength` | number | `0.9` | 0 – 1 | Yes | How strongly renderer shadow maps (trees, rocks, the character) darken blades. |
| `shadowTint` | color | `[0.42, 0.47, 0.62]` | — | Yes | Grass material color approached in full scene or cloud shadow. Palette presets set it with base/tip colors; the IP-wide vegetation shadow treatment still layers over it. |

### Grass: Scene Light

Current sun direction/color and sky color supplied by the scene at runtime.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | No — scene/runtime | World-space direction toward the sun (normalized on apply). Match your main directional light. |
| `sunColor` | color | `[1, 0.96, 0.84]` | — | No — scene/runtime | Sunlight tint applied to lit blades. |
| `skyColor` | color | `[0.62, 0.78, 0.95]` | — | No — scene/runtime | Ambient sky tint mixed into shaded blades. |

### Grass: Scene Wind

Current world wind and gust field supplied by weather or another scene system.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | No — scene/runtime | Current horizontal (XZ) heading the world wind blows toward. |
| `windSpeed` | number | `1` | 0 – 4 | No — scene/runtime | Current temporal speed of the world wind. |
| `windStrength` | number | `0.16` | 0 – 1 | No — scene/runtime | Current world wind amplitude before the asset response multiplier. |
| `gustFrequency` | number | `0.35` | 0 – 2 | No — scene/runtime | Current spatial frequency of the world gust bands. |
| `gustSpeed` | number | `1.6` | 0 – 6 | No — scene/runtime | Current travel speed of the world gust bands. |

### Grass: Cloud Field

Current drifting cloud-shadow field shared across terrain, water, and vegetation.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `cloudShadowStrength` | number | `0` | 0 – 1 | No — scene/runtime | Current strength of the shared procedural cloud-shadow field. 0 disables it. |
| `cloudShadowCoverage` | number | `0.45` | 0 – 1 | No — scene/runtime | Current fraction of the world covered by cloud shadow. |
| `cloudShadowScale` | number | `0.012` | 0.001 – 0.1 | No — scene/runtime | Current world-to-noise scale of the shared cloud pattern. |
| `cloudShadowVelocity` | vector2 | `[0.02, 0.006]` | — | No — scene/runtime | Current cloud-shadow drift in noise-space units per second. |

### Grass: Interaction

Current push target and influence radius supplied per scene or grass instance.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `pushRadius` | number | `0.9` | 0 – 3 | No — scene/runtime | Current radius in meters around the scene push target. |

## Flowers

Module: `@call-me-sensei/toonlab/vegetation` — 3 groups, 7 fields.

Flat settings consumed by `new StylizedFlowerField(options)` and `flowers.applySettings(options)`.

### Flowers: Heads

Random head sizes baked into the instance attributes when the field is built. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sizeRange` | vector2 | `[0.045, 0.08]` | — | Yes | Min/max head size in meters for placements without an explicit size. Construction-only: baked into instance attributes. |

### Flowers: Wind

Wind sway shared with the surrounding grass so heads and blades move together.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Yes | Horizontal (XZ) heading the wind blows toward. Magnitude does not matter; use wind strength for amplitude. |
| `windSpeed` | number | `1` | 0 – 4 | Yes | How fast the head sway oscillates. |
| `windStrength` | number | `0.16` | 0 – 1 | Yes | How far flower heads bob with the wind. |

### Flowers: Appearance

Petal/center palette and scene-shadow darkening.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `petalColor` | color | `[1, 0.98, 0.92]` | — | Yes | Petal color of the procedural daisies. |
| `centerColor` | color | `[0.98, 0.8, 0.34]` | — | Yes | Center-disc color of the procedural daisies. |
| `shadowStrength` | number | `0.85` | 0 – 1 | Yes | How strongly renderer shadow maps darken flower heads. |

## Trees

Module: `@call-me-sensei/toonlab/vegetation` — 5 groups, 77 fields.

Grouped settings consumed by `new StylizedTree(options)` and `tree.applySettings(options)`.

### Trees: Tree

Overall scale, seed, crown reach, leaf coverage, and canopy palette. Everything except the palette and trunk shadow flag bakes geometry at construction.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `size` | number | `1` | 0.2 – 6 | Yes | Overall tree multiplier (1 ≈ 3 m tree, 2 ≈ 6 m, 3+ large). Construction-only: also densifies canopy cards so leaves stay leaf-sized. |
| `seed` | number | `1` | 1 – 999 | Yes | Deterministic generation seed; the same options and seed always grow the same tree. Construction-only. |
| `canopyColor` | color | `[0.30196078431372547, 0.6352941176470588, 0.34509803921568627]` | — | Yes | Canopy base color; the lit/shadow/crown palette derives from it. Also accepts richer resolveCanopyColor specs (color lists, {from,to} blends, HSL ranges) resolved per seed. |
| `canopyPalette` | object | `'{}'` | — | No — local/runtime | Optional explicit { lit, shadow, crown } tone overrides; unset tones derive from the canopy color. |
| `canopyWidth` | number | `1` | 0.3 – 2.5 | Yes | X-axis crown reach multiplier. Construction-only: shapes the blob layout. |
| `canopyDepth` | number | `1` | 0.3 – 2.5 | Yes | Z-axis crown reach multiplier. Construction-only: shapes the blob layout. |
| `canopyLayout` | object | `'{}'` | — | No — local/construction | Optional createCanopyBlobs overrides (lobeCount, spread, flatten, coreRadius, ...). Construction-only. |
| `leafDensity` | number | `1` | 0.05 – 2 | Yes | Crown leaf coverage. Below ~0.9 see-through gap pockets open and branches read through; above 1 packs extra cards (and fatter tufts) for lush crowns. Construction-only. |
| `canopyScale` | number | `1` | 0.2 – 3 | Yes | Canopy-only scale relative to the trunk. Construction-only. |
| `leafPlacement` | select | `'canopy'` | `canopy` \| `tips` | Yes | canopy: solid leaf mass hiding interior wood. tips: bushes only at branch ends with bare limbs between them (Sumeru silhouette). Construction-only. |
| `trunkReceiveShadow` | boolean | `true` | — | Yes | Whether the bark receives shadow maps. Massive pale-limbed trees read better with this off. |
| `trunkColor` | color | `[0.788235294117647, 0.6705882352941176, 0.5411764705882353]` | — | Yes | Warm bark base color used by the generated trunk, branches, and roots. |

### Trees: Trunk

Trunk silhouette (bend, lean, twist, gnarl) shared by the skeleton grower and the classic curved-trunk generator. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `height` | number | `1.55` | 0.4 – 3 | Yes | Trunk height in meters (before the overall size multiplier). Construction-only. |
| `radiusBottom` | number | `0.19` | 0.05 – 0.6 | Yes | Trunk radius at the root flare in meters. Construction-only. |
| `radiusTop` | number | `0.085` | 0.02 – 0.3 | Yes | Trunk radius at the top in meters. Classic trunk generator (createTreeTrunkGeometry) only. Construction-only. |
| `bend` | number | `0.12` | 0 – 0.8 | Yes | Mid-trunk bow amplitude that returns toward center (S-curve) in meters. Construction-only. |
| `lean` | number | `0.16` | 0 – 1.2 | Yes | Off-vertical drift that accumulates toward the top, in meters. Construction-only. |
| `twist` | number | `0` | -4 – 4 | Yes | Y-rotation of the cross-section over the full height in radians; spirals the bark like wrung wood. Construction-only. |
| `gnarl` | number | `0` | 0 – 2 | Yes | High-frequency wiggle and radius bulges: 0 is a clean park tree, 1+ reads like an old bonsai. Construction-only. |
| `gnarlFrequencyXRange` | vector2 | `[4.2, 7.6]` | — | Yes | Seeded min/max wave count of the gnarl wiggle over the trunk height on the X axis. Classic trunk generator only. Construction-only. |
| `gnarlFrequencyZRange` | vector2 | `[3.1, 6.7]` | — | Yes | Seeded min/max wave count of the gnarl wiggle over the trunk height on the Z axis. Classic trunk generator only. Construction-only. |
| `gnarlAmplitude` | number | `0.16` | 0 – 0.5 | Yes | Meters of gnarl wiggle (and radius bulge fraction) per unit of gnarl. Classic trunk generator only. Construction-only. |
| `radialGnarlFrequency` | number | `9.3` | 0 – 20 | Yes | Wave count of the gnarl radius bulges (old-wood knuckles) over the trunk height. Classic trunk generator only. Construction-only. |
| `bendDirection` | number | — | -6.283 – 6.283 | Yes | World heading of the bow in radians; null/unset picks a seeded heading. Construction-only. |
| `leanOffset` | number | — | -6.283 – 6.283 | Yes | Lean heading relative to the bow in radians (PI pins a serpentine S-trunk); null/unset picks a seeded offset. Construction-only. |
| `radialSegments` | number | `10` | 3 – 16 | Yes | Cross-section segment count of the trunk tube. Classic trunk generator only. Construction-only. |
| `heightSegments` | number | `14` | 2 – 24 | Yes | Vertical segment count of the trunk tube. Classic trunk generator only. Construction-only. |
| `branchCount` | number | `2` | 0 – 6 | Yes | Number of stub branches near the top. Classic trunk generator only. Construction-only. |
| `branchLength` | number | `0.55` | 0 – 1.5 | Yes | Base branch length in meters. Classic trunk generator only. Construction-only. |
| `branchRadius` | number | `0.055` | 0 – 0.2 | Yes | Base branch radius in meters. Classic trunk generator only. Construction-only. |

### Trees: Skeleton

Space-colonization limb growth and bark mesh controls. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `generator` | select | `'limbs'` | `limbs` \| `branching` \| `drawn` | Yes | limbs: space-colonization growth toward the crown blobs (solid anime-style crowns). branching: recursive central-leader branching (open, realistic broadleaf/conifer silhouettes). drawn: no procedural wood at all — the tree is exactly the hand-drawn branchSpines (Tree Lab sketch mode). Construction-only. |
| `levels` | number | `3` | 1 – 4 | Yes | Recursion depth of the branching generator; each level subdivides into thinner children. Branching generator only. Construction-only. |
| `childrenCount` | number | `6` | 1 – 90 | Yes | Lateral child branches sprouting along the trunk (deeper levels derive from them). The central leader continues separately, so children=1 forms one lateral limb plus the leader. Conifers use high counts (60-90) for dense whorled fronds. Branching generator only. Construction-only. |
| `branchAngle` | number | `55` | 10 – 130 | Yes | Child pitch away from the parent axis, in degrees. Past 90 points branches below horizontal (conifer fronds ~110). Branching generator only. Construction-only. |
| `branchStart` | number | `0.4` | 0 – 0.9 | Yes | Fraction of the trunk kept bare before children begin — real trees hold their crown off the ground. Branching generator only. Construction-only. |
| `lengthRatio` | number | `0.45` | 0.15 – 0.95 | Yes | Child branch length as a fraction of the trunk (deeper levels shorten from it). Branching generator only. Construction-only. |
| `radiusRatio` | number | `0.7` | 0.3 – 0.9 | Yes | Child radius as a fraction of the parent\u2019s radius at the attach point — radius continuity is what makes forks read as one tree. Branching generator only. Construction-only. |
| `gnarliness` | number | `0.15` | 0 – 0.6 | Yes | Random-walk curvature per growth section, amplified as branches thin: trunks stay stately, twigs wander. Branching generator only. Construction-only. |
| `forceStrength` | number | `0.02` | -0.08 – 0.15 | Yes | Growth force: every section steers toward vertical with 1/radius compliance. Positive sweeps tips skyward (broadleaf crowns); negative droops them (pines, willows). Branching generator only. Construction-only. |
| `conifer` | boolean | `false` | — | Yes | Evergreen behavior: branches taper fully and children shorten toward the top \u2014 the layered cone silhouette. Pair with high Children, Branch Angle ~110, negative Growth Force. Branching generator only. Construction-only. |
| `attractionCount` | number | `90` | 10 – 200 | Yes | Number of crown attraction points the limbs grow toward; more points grow more, finer limbs. Construction-only. |
| `segmentLength` | number | `0.3` | 0.1 – 0.8 | Yes | Growth step length in meters; shorter steps grow smoother, curvier limbs. Construction-only. |
| `influenceRadius` | number | `1.2` | 0.3 – 2.5 | Yes | How far an attraction point can pull on a growing limb, in meters. Construction-only. |
| `killRadius` | number | `0.42` | 0.1 – 1 | Yes | Distance at which a limb consumes an attraction point and stops growing toward it. Construction-only. |
| `maxSteps` | number | `48` | 4 – 96 | Yes | Growth iteration cap. Construction-only. |
| `maxNodes` | number | `140` | 20 – 400 | Yes | Skeleton node cap; lower keeps trees to a few clean limbs. Construction-only. |
| `radialSegments` | number | `8` | 3 – 16 | Yes | Cross-section segment count of each bark tube. Construction-only. |
| `tipRadius` | number | `0.03` | 0.005 – 0.15 | Yes | Radius of the thinnest twigs in meters; pipe-model radii grow from here toward the root. Construction-only. |
| `minLimbRadius` | number | `0.028` | 0 – 0.15 | Yes | Limbs thinner than this get no bark tube and are left to the leaves. Construction-only. |
| `attachmentTwigRadius` | number | `0.09` | 0 – 0.3 | Yes | Wood thinner than this sprouts leaf tufts in canopy mode. Construction-only. |
| `attractionReach` | number | — | 0 – 1 | Yes | How deep into each crown blob attraction points sample (fraction of blob radius); null/unset is automatic (0.65 canopy mode, 0.92 tips mode). Construction-only. |

### Trees: Canopy Cards

Leaf-card canopy geometry: card counts, tuft clusters, and shell fill. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `architecture` | select | `'cloud-cards'` | `cloud-cards` \| `layered-sprays` \| `needle-whorls` \| `radial-fronds` | Yes | Branch-attached foliage layout: historical round clouds, stacked sprays, conifer whorls, or palm-like radial fronds. Construction-only. |
| `cardCount` | number | `170` | 20 – 600 | Yes | Base leaf-card count before density and coverage scaling; few LARGE overlapping cards keep the crown one fluffy mass. Construction-only. |
| `cardSizeRange` | vector2 | `[1, 1.6]` | — | Yes | Min/max leaf-cluster card size in meters. Construction-only. |
| `cardsPerCluster` | number | `5` | 1 – 20 | Yes | Cards per leaf tuft around each branch attachment. Construction-only. (In tips placement the built-in default becomes 9.) |
| `clusterRadius` | number | `0.48` | 0.1 – 1.5 | Yes | Radius in meters of each leaf tuft around its branch end. Construction-only. (In tips placement the built-in default becomes 0.62.) |
| `sprayLayers` | number | `3` | 1 – 12 | Yes | Number of stacked foliage planes at each layered-spray attachment. Construction-only. |
| `spraySpread` | number | `0.8` | 0.05 – 4 | Yes | Branch-local radius of each layered spray in meters. Construction-only. |
| `sprayThickness` | number | `0.18` | 0 – 2 | Yes | Separation between the stacked spray planes in meters. Construction-only. |
| `whorlArms` | number | `6` | 3 – 24 | Yes | Radial arm count around a conifer foliage attachment. Construction-only. |
| `whorlRadius` | number | `0.48` | 0.05 – 3 | Yes | Radius of each conifer foliage whorl in meters. Construction-only. |
| `frondCount` | number | `7` | 3 – 24 | Yes | Number of radial frond directions at each attachment. Construction-only. |
| `frondLength` | number | `1.25` | 0.1 – 4 | Yes | Maximum radial frond reach in meters. Construction-only. |
| `shellFill` | boolean | `true` | — | Yes | Fill the blob shells between tufts so the crown reads as one solid mass; off leaves bare wood between end bushes. Construction-only. (Tips placement turns this off by default.) |

### Trees: Foliage Material

Leaf material response: wind, sun, alpha cutout, scene and cloud shadows. Applies at runtime via applySettings.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `alphaCutoff` | number | `0.3` | 0 – 1 | Yes | Alpha-cutout threshold for the leaf sprite; low enough that mipmap-averaged alpha does not erode distant crowns. |
| `windDirection` | vector2 | `[1, 0.3]` | — | Yes | Horizontal (XZ) heading the canopy flutter drifts toward. |
| `windSpeed` | number | `1` | 0 – 4 | Yes | How fast the leaf-card flutter oscillates. |
| `windStrength` | number | `0.05` | 0 – 0.5 | Yes | How far leaf cards sway with the wind. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | Yes | World-space direction toward the sun. Match your main directional light. |
| `sunColor` | color | `[1, 0.96, 0.84]` | — | Yes | Sunlight tint applied to lit leaf cards. |
| `skyColor` | color | `[0.62, 0.78, 0.95]` | — | Yes | Ambient sky tint mixed into shaded leaf cards. |
| `sceneShadowStrength` | number | `0.55` | 0 – 1 | Yes | How strongly renderer shadow maps shift the crown toward its shadow palette. 0 disables. |
| `backlitStrength` | number | `0.35` | 0 – 2 | Yes | Translucent glow on leaves between the camera and the sun. |
| `cloudShadowStrength` | number | `0` | 0 – 1 | Yes | How strongly drifting procedural cloud shadows darken the crown. 0 disables the effect. |
| `cloudShadowCoverage` | number | `0.45` | 0 – 1 | Yes | Fraction of the world covered by cloud shadow at any moment. |
| `cloudShadowScale` | number | `0.012` | 0.001 – 0.1 | Yes | World-to-noise scale of the cloud shadow pattern; smaller values give larger cloud shapes. |
| `cloudShadowVelocity` | vector2 | `[0.02, 0.006]` | — | Yes | Cloud shadow drift in noise-space units per second (world drift = velocity / scale). |

## SkySystem atmosphere and clouds

Module: `@call-me-sensei/toonlab/sky` — 7 groups, 179 fields.

Current versioned SkySystem document. Nested field paths are relative to the named block; use createSkyParams() and the exported schema version. Quality remains a separate runtime policy.

### SkySystem atmosphere and clouds: atmosphere

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `rayleigh` | number | `1` | 0 – 3 | Yes | Scattering by air molecules — what makes the sky blue and a low sun red. 1 matches Earth. |
| `turbidity` | number | `3.3` | 1 – 15 | Yes | Aerosol haze load. 1 is a clear day, 15 heavy smog. Washes out sky color and broadens the sun halo. |
| `mieDirectionalG` | number | `0.7` | 0 – 0.999 | Yes | Forward-peak of the Henyey-Greenstein haze lobe. 0 spreads the glow over the whole sky, higher pulls it into a tight halo. |
| `mieScatteringStrength` | number | `1` | 0 – 2 | Yes | Art multiplier on halo brightness only. Does not change haze density or sky color. |
| `multipleScattering` | number | `0.2` | 0 – 2 | Yes | Skylight filling cloud undersides and shadowed interiors, applied as 1 + this. Clouds only. |
| `skyMultipleScattering` | number | `0.5` | 0 – 2 | Yes | Scale on the sky dome multiply-scattered term. This light pools near the horizon, so it is the daytime horizon-brightness control. |
| `exposure` | number | `1` | 0.05 – 5 | Yes | Master brightness on the linear HDR image. The post chain applies it; the sky dome itself never does. |
| `groundAlbedo` | color | `[0.18, 0.17, 0.15]` | — | Yes | Reflectance of the ground under the atmosphere. Bounce light feeds the dome multiple scattering, so brighter ground lifts the horizon. |
| `fogDensity` | number | `1.25` | 0 – 5 | Yes | How fast distance fades geometry into the sky. 1 half-fades near 23 km; 0 disables aerial perspective. |
| `fogFarFadeStart` | number | `1000000` | 0 – 100000000 | Yes | Distance at which geometry starts being replaced by sky outright. Hides the rim of a finite world. |
| `fogFarFadeEnd` | number | `1100000` | 0 – 100000000 | Yes | Distance at which geometry is fully replaced by sky. Always kept above fogFarFadeStart; the gap is the ramp. |
| `style.enabled` | boolean | `false` | — | Yes | Master bypass for optional sky-colour styling. Off is the unchanged physical atmosphere. |
| `style.amount` | number | `1` | 0 – 1 | Yes | Blends the styled sky palette over the physical atmosphere. |
| `style.palette.enabled` | boolean | `false` | — | Yes | Applies an authored zenith-to-horizon palette while retaining physical variation. |
| `style.palette.zenithColor` | color | `[0.21, 0.57, 0.78]` | — | Yes | Sky colour directly overhead. |
| `style.palette.horizonColor` | color | `[0.66, 0.85, 1]` | — | Yes | Sky colour at the horizon. |
| `style.palette.horizonBlend` | number | `0.14` | 0.02 – 0.5 | Yes | How far the horizon colour rises into the sky before becoming the zenith colour. |
| `style.palette.saturation` | number | `1` | 0 – 2 | Yes | Saturation of the authored sky palette. 1 preserves its colour and 0 makes it grey. |
| `style.palette.contrast` | number | `1` | 0 – 2 | Yes | Contrast around the middle of the styled sky range. |
| `style.palette.brightness` | number | `1` | 0 – 2 | Yes | Final brightness of the styled sky palette. |
| `style.timePalette.enabled` | boolean | `false` | — | Yes | Adds authored morning, evening, and night colours from the existing sky clock. |
| `style.timePalette.morningEnabled` | boolean | `true` | — | Yes | Enables only the morning sky grade. Afternoon, evening, and night are unchanged. |
| `style.timePalette.morningZenith` | color | `[0.12, 0.4, 0.8]` | — | Yes | Upper-sky colour while the morning sun is near the horizon. |
| `style.timePalette.morningHorizon` | color | `[1, 0.56, 0.3]` | — | Yes | Horizon colour while the morning sun is near the horizon. |
| `style.timePalette.morningAmount` | number | `0.72` | 0 – 1 | Yes | Strength of the authored morning colours. |
| `style.timePalette.morningFill` | number | `0.24` | 0 – 1 | Yes | Adds a warm ambient floor only while the morning sun is near the horizon. |
| `style.timePalette.eveningEnabled` | boolean | `true` | — | Yes | Enables only the evening sky grade. Morning, afternoon, and night are unchanged. |
| `style.timePalette.eveningZenith` | color | `[0.38, 0.2, 0.44]` | — | Yes | Upper-sky colour while the evening sun is near the horizon. |
| `style.timePalette.eveningHorizon` | color | `[1, 0.42, 0.18]` | — | Yes | Horizon colour while the evening sun is near the horizon. |
| `style.timePalette.eveningAmount` | number | `0.75` | 0 – 1 | Yes | Strength of the authored evening colours. |
| `style.timePalette.eveningFill` | number | `0.22` | 0 – 1 | Yes | Adds a warm ambient floor only while the evening sun is near the horizon. |
| `style.timePalette.nightEnabled` | boolean | `true` | — | Yes | Enables only the night sky grade. Morning, afternoon, and evening are unchanged. |
| `style.timePalette.nightZenith` | color | `[0.005, 0.015, 0.08]` | — | Yes | Upper-sky colour during full night. |
| `style.timePalette.nightHorizon` | color | `[0.02, 0.06, 0.2]` | — | Yes | Horizon colour during full night. |
| `style.timePalette.nightAmount` | number | `1` | 0 – 1 | Yes | Strength of the authored night colours. |
| `style.timePalette.nightFill` | number | `0.14` | 0 – 1 | Yes | Adds a deep-blue ambient floor only during night. |
| `style.timePalette.nightStars` | number | `1` | 0 – 2 | Yes | Brightness of the star panorama only while the night palette is active. |
| `style.starField.enabled` | boolean | `false` | — | Yes | Shapes a supplied panorama into sparse, crisp night-sky anchors while retaining a subtle diffuse celestial band. |
| `style.starField.amount` | number | `1` | 0 – 1 | Yes | Blends from the supplied panorama to the polished star-field treatment. |
| `style.starField.pointThreshold` | number | `0.02` | 0 – 1 | Yes | Panorama luminance where distinct star points begin to separate from the diffuse field. |
| `style.starField.pointSoftness` | number | `0.06` | 0.005 – 1 | Yes | Soft transition from the diffuse celestial field into distinct star points. |
| `style.starField.diffuseStrength` | number | `0.08` | 0 – 1 | Yes | Amount of faint panorama and celestial-band radiance retained behind the distinct stars. |
| `style.starField.pointBrightness` | number | `0.75` | 0 – 2 | Yes | Brightness of the distinct star points after the diffuse field is separated. |

### SkySystem atmosphere and clouds: cloud

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `cirrus.scale` | number | `30000` | 2000 – 200000 | Yes | World distance the cirrus texture spans before it repeats. Larger stretches the streaks out. |
| `cirrus.strength` | number | `0` | 0 – 2 | Yes | How opaque the cirrus deck reads. 0 hides it. |
| `fade.hazeDensityScale` | number | `1` | 0 – 4 | Yes | How much atmosphere sits between camera and cloud. 1 matches the real atmosphere; 0 removes it. |
| `fade.horizonMeltStart` | number | `25000` | 0 – 200000 | Yes | Distance at which clouds begin dissolving into the sky. |
| `fade.horizonMeltEnd` | number | `40000` | 0 – 200000 | Yes | Distance at which clouds have fully dissolved into the sky. Held at or above horizonMeltStart. |
| `fade.maxMarchDist` | number | `42000` | 0 – 202000 | No — local/runtime | How far the view ray marches before giving up. Read-only, always horizonMeltEnd + 2000. |
| `haze.density` | number | `0` | 0 – 8 | Yes | How opaque the storm haze reads for a given amount of cloud coverage. 0 hides it. |
| `haze.scale` | number | `40000` | 2000 – 200000 | Yes | World distance the haze layer spans before it repeats. Independent of shape.weatherScale even though both read the same coverage. |
| `lighting.scatteringAlbedo` | number | `0.9` | 0 – 1 | Yes | How much light survives each bounce inside a cloud. 1 loses nothing and reads bright white; lower reads grey and heavy. |
| `lighting.powderStrength` | number | `1` | 0 – 4 | Yes | Darkens the thin outer edges of sunlit cloud, which is what stops them reading as flat cotton. |
| `lighting.ambientIntensity` | number | `0.6` | 0 – 3 | Yes | Skylight filling the parts of a cloud the sun does not reach. |
| `lighting.groundBounceAlbedo` | color | `[0.18, 0.17, 0.15]` | — | Yes | Colour of the ground below the clouds, which tints the light bouncing up onto their undersides. |
| `lighting.baseShadowStrength` | number | `0` | 0 – 1 | Yes | Darkens cloud bottoms. 0 leaves them lit; 1 shades them to the floor of the shell. |
| `lighting.baseShadowHeight` | number | `0.6` | 0 – 1 | Yes | How far up the cloud the base darkening reaches before light returns to full. |
| `lighting.moonGain` | number | `1` | 0 – 4 | Yes | Moonlight falling on cloud edges at night. |
| `shape.altitude` | number | `1400` | 0 – 8000 | Yes | Height of the cloud bases above the ground. |
| `shape.thickness` | number | `2800` | 100 – 12000 | Yes | Height of the cloud shell, measured up from the altitude. |
| `shape.coverage` | number | `1` | 0 – 1 | Yes | How much of the sky holds cloud. 0 clears it; 1 uses the full coverage map. |
| `shape.density` | number | `0.048` | 0 – 0.5 | Yes | How much light a metre of cloud blocks. Higher reads as thicker, more opaque cloud. |
| `shape.baseScale` | number | `8000` | 500 – 40000 | Yes | World distance the cloud-shape noise spans before it repeats. Larger makes individual clouds bigger. |
| `shape.baseStrength` | number | `1` | 0 – 3 | Yes | Scales the cloud-shape noise. Raising it swells the tops without moving the bases. |
| `shape.weatherScale` | number | `40000` | 2000 – 200000 | Yes | World distance the coverage map spans before it repeats. Push the repeat past the horizon and it stops reading as tiling. |
| `shape.erosionScaleBaseMultiplier` | number | `0.5` | 0 – 1 | Yes | Size of the erosion detail relative to baseScale. Lower values carve finer wisps; 0 removes the erosion field entirely. |
| `shape.erosionShape` | number | `0` | 0 – 1 | Yes | Character of the erosion. 0 gives billowy cauliflower edges; 1 gives torn wispy ones. |
| `shape.erosionStrengthBase` | number | `1` | 0 – 5 | Yes | How hard erosion carves at the bottom of the cloud. |
| `shape.erosionStrengthPeak` | number | `1` | 0 – 5 | Yes | How hard erosion carves at the top of the cloud. |
| `shape.edgeSoftness` | number | `0.05` | 0 – 0.5 | Yes | How gradually cloud fades in at the base of the shell. |
| `shape.edgeSoftnessFalloff` | number | `1` | 0 – 4 | Yes | Tightens edgeSoftness as height climbs, so bases stay soft while tops stay crisp. 1 holds the same softness everywhere. |
| `shape.baseWeatherStrength` | number | `0` | 0 – 2 | Yes | Eats the bottoms of thin clouds while leaving thick ones intact, so a patchy sky lifts off the shell floor. |
| `shape.baseWeatherHeightStart` | number | `0.05` | 0 – 1 | Yes | Height where baseWeatherStrength carves hardest. Nearer 0 bites at the very bottom of the shell. |
| `shape.baseWeatherHeightEnd` | number | `0.1` | 0 – 1 | Yes | Height above which baseWeatherStrength stops carving. |
| `shape.horizonCoverageAmount` | number | `0` | 0 – 2 | Yes | Adds coverage to distant cloud, banking it up along the horizon while the sky overhead stays as-is. May exceed 1. |
| `shape.horizonCoverageStart` | number | `10000` | 0 – 60000 | Yes | How far from the camera the horizon bank starts building. |
| `shape.horizonCoverageRamp` | number | `20000` | 100 – 80000 | Yes | Distance over which the horizon bank builds from normal coverage to full. |
| `wind.heading` | number | `0` | 0 – 360 | Yes | Direction clouds travel toward. 0 is +Z, 90 is +X. |
| `wind.speed` | number | `0` | 0 – 200 | Yes | How fast clouds drift across the sky. 0 holds them still. |
| `wind.evolutionSpeed` | number | `0` | 0 – 120 | Yes | How fast clouds change shape as they drift. Independent of speed, so they can churn in place. |
| `wind.skew` | number | `0` | -4000 – 4000 | Yes | Leans cloud tops downwind of their bases by this distance, the way real cloud shears in a wind gradient. |
| `style.enabled` | boolean | `false` | — | Yes | Master bypass for every optional cloud styling module. Off is the unchanged V1 renderer. |
| `style.amount` | number | `1` | 0 – 1 | Yes | Blends all enabled styling modules over the physical cloud result. |
| `style.tone.enabled` | boolean | `false` | — | Yes | Remaps physical cloud illumination through an authored three-colour tone ramp. |
| `style.tone.shadowColor` | color | `[0.18, 0.3, 0.52]` | — | Yes | Colour used for the darkest readable cloud masses. |
| `style.tone.midColor` | color | `[0.56, 0.71, 0.9]` | — | Yes | Colour used across the broad body of the cloud. |
| `style.tone.lightColor` | color | `[1, 0.96, 0.86]` | — | Yes | Colour used on the brightest sun-facing cloud forms. |
| `style.tone.shadowPoint` | number | `0.16` | 0 – 1 | Yes | Physical light level where shadow begins transitioning into the midtone. |
| `style.tone.lightPoint` | number | `0.46` | 0 – 1 | Yes | Physical light level where the midtone begins transitioning into highlight. |
| `style.tone.softness` | number | `0.08` | 0.001 – 0.5 | Yes | Width of both tone transitions. Lower values make clearer painted bands. |
| `style.tone.shadowLift` | number | `0.12` | 0 – 2 | Yes | Minimum cloud radiance after tone mapping, keeping shaded bodies readable. |
| `style.tone.highlightCompression` | number | `0.12` | 0 – 1 | Yes | Compresses bright cloud radiance so white form survives exposure and bloom. |
| `style.tone.brightness` | number | `1.05` | 0 – 4 | Yes | Final brightness multiplier for the styled cloud tones. |
| `style.blueShadow.enabled` | boolean | `false` | — | Yes | Adds an authored blue skylight tint only to the darker cloud body. |
| `style.blueShadow.color` | color | `[0.08, 0.28, 0.68]` | — | Yes | Blue skylight colour applied to cloud shadows while preserving their brightness. |
| `style.blueShadow.amount` | number | `0.65` | 0 – 1 | Yes | Strength of the blue skylight tint inside the selected shadow range. |
| `style.blueShadow.range` | number | `0.36` | 0 – 1 | Yes | How far the blue tint reaches from the darkest underside into the cloud midtones. |
| `style.blueShadow.softness` | number | `0.14` | 0.001 – 0.5 | Yes | Softness of the transition between blue shadow and the existing cloud colour. |
| `style.shadowWash.enabled` | boolean | `false` | — | Yes | Softens the selected cloud-shadow region into a broad, pale painted wash. |
| `style.shadowWash.lift` | number | `0.32` | 0 – 2 | Yes | Target brightness of the painted underside. Higher values make the wash paler. |
| `style.shadowWash.detail` | number | `0.4` | 0 – 1 | Yes | Amount of the original shadow variation retained inside the wash. |
| `style.shadowWash.blend` | number | `0.16` | 0.001 – 0.5 | Yes | Softness of the transition from the painted underside into the bright cloud body. |
| `style.innerPaint.enabled` | boolean | `false` | — | Yes | Restricts the painted shadow treatment to the cloud interior while preserving the physical outer edge. |
| `style.innerPaint.amount` | number | `1` | 0 – 1 | Yes | Strength of the interior-only painted treatment. |
| `style.innerPaint.edgeKeep` | number | `0.22` | 0 – 1 | Yes | Minimum visible cloud opacity kept entirely physical before interior paint begins. |
| `style.innerPaint.edgeBlend` | number | `0.28` | 0.001 – 1 | Yes | Softness of the transition from the untouched physical edge into the painted interior. |
| `style.whiteTop.enabled` | boolean | `false` | — | Yes | Broadens the clean sunlit colour across the upper cloud body without changing its silhouette. |
| `style.whiteTop.color` | color | `[1, 0.98, 0.92]` | — | Yes | Warm-white colour painted into the sun-reachable upper cloud body. |
| `style.whiteTop.amount` | number | `1` | 0 – 1 | Yes | Strength of the white-top treatment inside the selected upper region. |
| `style.whiteTop.area` | number | `0.62` | 0 – 1 | Yes | How broadly the white region extends down from the sunlit cloud top. |
| `style.whiteTop.softness` | number | `0.14` | 0.001 – 0.5 | Yes | Softness of the transition from white top into the existing cloud middle. |
| `style.whiteTop.detail` | number | `0.35` | 0 – 1 | Yes | Amount of physical light variation retained inside the white region. |
| `style.topLight.enabled` | boolean | `false` | — | Yes | Restores physical sunlight variation across the painted white cloud top. |
| `style.topLight.amount` | number | `0.7` | 0 – 1 | Yes | Amount of sunlight shape shown across the white cloud top. |
| `style.surfaceLight.enabled` | boolean | `false` | — | Yes | Uses the first visible cloud layer for white-top lighting instead of averaging light through the whole cloud body. |
| `style.surfaceLight.amount` | number | `1` | 0 – 1 | Yes | Blends from whole-cloud lighting to the light measured at the visible cloud surface. |
| `style.lightBlend.enabled` | boolean | `false` | — | Yes | Blends the warm white top through a pale blue middle into the cooler underside without changing cloud shape. |
| `style.lightBlend.bottomColor` | color | `[0.28, 0.5, 0.82]` | — | Yes | Cool blue used at the shaded bottom of the painted cloud interior. |
| `style.lightBlend.middleColor` | color | `[0.68, 0.84, 0.98]` | — | Yes | Pale blue used between the white top and cool underside. |
| `style.lightBlend.amount` | number | `0.5` | 0 – 1 | Yes | Strength of the cool tint below the existing white cloud top. |
| `style.lightBlend.balance` | number | `0.16` | 0 – 1 | Yes | Light level where the bottom blue gives way to the pale blue middle. |
| `style.lightBlend.softness` | number | `0.14` | 0.001 – 0.5 | Yes | Width of the transition from bottom blue to pale blue. |
| `style.lightBlend.detail` | number | `0.65` | 0 – 1 | Yes | Amount of the existing physical cloud colour retained through the tint. |
| `style.timePalette.enabled` | boolean | `false` | — | Yes | Adds authored morning, evening, and night colours from the existing sky clock. |
| `style.timePalette.morningEnabled` | boolean | `true` | — | Yes | Enables only the morning cloud tint. Afternoon, evening, and night are unchanged. |
| `style.timePalette.morningTop` | color | `[1, 0.56, 0.3]` | — | Yes | Warm colour applied to the brighter cloud body in the morning. |
| `style.timePalette.morningBottom` | color | `[0.32, 0.24, 0.5]` | — | Yes | Cool colour applied to the shaded cloud body in the morning. |
| `style.timePalette.morningAmount` | number | `0.82` | 0 – 1 | Yes | Strength of the authored morning cloud colours. |
| `style.timePalette.morningDetail` | number | `0.3` | 0 – 1 | Yes | Amount of the existing physical cloud colour retained only in the morning. |
| `style.timePalette.morningBrightness` | number | `0.72` | 0 – 2 | Yes | Brightness of the compressed cloud interior only in the morning. |
| `style.timePalette.eveningEnabled` | boolean | `true` | — | Yes | Enables only the evening cloud tint. Morning, afternoon, and night are unchanged. |
| `style.timePalette.eveningTop` | color | `[1, 0.42, 0.22]` | — | Yes | Warm colour applied to the brighter cloud body in the evening. |
| `style.timePalette.eveningBottom` | color | `[0.4, 0.16, 0.35]` | — | Yes | Cooler colour applied to the shaded cloud body in the evening. |
| `style.timePalette.eveningAmount` | number | `0.9` | 0 – 1 | Yes | Strength of the authored evening cloud colours. |
| `style.timePalette.eveningDetail` | number | `0.25` | 0 – 1 | Yes | Amount of the existing physical cloud colour retained only in the evening. |
| `style.timePalette.eveningBrightness` | number | `0.65` | 0 – 2 | Yes | Brightness of the compressed cloud interior only in the evening. |
| `style.timePalette.nightEnabled` | boolean | `true` | — | Yes | Enables only the night cloud tint. Morning, afternoon, and evening are unchanged. |
| `style.timePalette.nightTop` | color | `[0.15, 0.32, 0.72]` | — | Yes | Moonlit colour applied to the brighter cloud body at night. |
| `style.timePalette.nightBottom` | color | `[0.02, 0.05, 0.18]` | — | Yes | Deep-blue colour applied to the shaded cloud body at night. |
| `style.timePalette.nightAmount` | number | `1` | 0 – 1 | Yes | Strength of the authored night cloud colours. |
| `style.timePalette.nightDetail` | number | `0.22` | 0 – 1 | Yes | Amount of the existing physical cloud colour retained only at night. |
| `style.timePalette.nightContrast` | number | `0.25` | 0 – 1 | Yes | Strength of the night-only value compression. Lower values keep more readable cloud-body definition. |
| `style.timePalette.nightBrightness` | number | `0.32` | 0 – 4 | Yes | Brightness of the compressed cloud interior only at night. |

### SkySystem atmosphere and clouds: godRays

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Runs or skips the shaft march. The quality tier also sets this; the low tier disables it. |
| `strength` | number | `2` | 0 – 8 | Yes | How fast shafts approach their brightness ceiling. The result is soft-clipped, so raising this reaches the light colour sooner rather than growing without limit. |
| `sharpness` | number | `2` | 1 – 16 | Yes | Contrast of the shafts, applied as a gamma on sampled light visibility. 1 leaves visibility untouched. |
| `extinction` | number | `0.0002` | 0 – 0.001 | Yes | Haze the shafts travel through. The same value scatters light in and absorbs it along the way, so raising it makes shafts denser but shorter. |
| `maxDistance` | number | `12500` | 1000 – 20000 | Yes | How far the march runs for pixels showing open sky. Pixels showing geometry stop at the surface, and shafts fade at the cloud-shadow box edge. |
| `moonGodRayScale` | number | `0.4` | 0 – 1 | Yes | Shaft brightness while the moon is the active light. The sun uses strength directly. |

### SkySystem atmosphere and clouds: nightSky

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `intensity` | number | `0.3` | 0 – 3 | Yes | Star panorama brightness, calibrated for exposure 1.0. The star texture itself is supplied by the host; without one the night sky is black. |

### SkySystem atmosphere and clouds: noise

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `weather.resolution` | number | `1024` | `256` \| `512` \| `1024` | Yes | Square resolution of the generated coverage map. One of 256, 512, 1024. The quality tier sets it; a preset may override it. |
| `weather.seed` | number | `1` | 0 – 65535 | Yes | PRNG seed for the coverage field. The same seed always regenerates the same map. |
| `weather.profile.octaves` | number | `5` | 1 – 8 | Yes | Number of coverage FBM octaves. More octaves add smaller cloud clusters inside the large ones. |
| `weather.profile.period` | number | `4` | 1 – 32 | Yes | Lattice periods across one weather-map repeat at the first octave. Higher values make cloud groups smaller. |
| `weather.profile.lacunarity` | number | `2` | 1.5 – 4 | Yes | Frequency step between octaves. Rounded to an integer period per octave so the map still tiles exactly. |
| `weather.profile.gain` | number | `0.5` | 0.2 – 0.8 | Yes | Amplitude step between octaves. Higher values roughen the coverage boundary; lower values smooth it. |
| `weather.profile.warp` | number | `0` | 0 – 1 | Yes | Domain-warp amount in tile units. Bends cloud groups into streets and hooks instead of round blobs. 0 disables it. |
| `weather.profile.warpPeriod` | number | `2` | 1 – 16 | Yes | Lattice periods of the warp field. Low values sweep whole regions; high values ripple edges. |
| `weather.profile.coverageContrast` | number | `1.32` | 0.1 – 4 | Yes | Contrast of the coverage field about 0.5. High values separate sky and cloud into hard regions. |
| `weather.profile.coverageBias` | number | `-0.24` | -1 – 1 | Yes | Added to coverage after contrast. Positive fills the sky, negative clears it. Distinct from shape.coverage, which scales the whole field at runtime. |
| `weather.profile.typePeriod` | number | `3` | 1 – 16 | Yes | Lattice periods of the cloud-type field. Low values give one weather system across the sky. |
| `weather.profile.typeBias` | number | `0` | -1 – 1 | Yes | Added to cloud type. Positive pushes the sky toward developed cumulus, negative toward flat stratus. |
| `weather.profile.precipitationPeriod` | number | `1` | 1 – 16 | Yes | Lattice periods of the precipitation field, before coverage gates it. |
| `weather.profile.precipitationBias` | number | `0` | -1 – 1 | Yes | Added to precipitation before coverage gates it. Positive rains from more of the deck. |

### SkySystem atmosphere and clouds: sun

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `elevation` | number | `45` | -90 – 90 | Yes | Altitude the sun sits at. 0 is the horizon, 90 straight overhead. |
| `azimuth` | number | `180` | -180 – 180 | Yes | Compass direction the sun sits along. 0 faces +Z, 90 faces +X. |
| `intensity` | number | `6.6` | 0 – 40 | Yes | Sun radiance at full daylight, written to peakIntensity. The brightness anchor for the whole sky. |
| `color` | color | `[1, 0.95, 0.85]` | — | Yes | Sun colour before the atmosphere absorbs any of it. Sunset reddening comes from the atmosphere, not here. |
| `discSize` | number | `0.0003` | 0.00005 – 0.005 | Yes | Angular size of the sun disc, as 1 - cos of the angular radius. The default is roughly 1.4 degrees. |

### SkySystem atmosphere and clouds: time

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `time` | number | `0.5` | 0 – 1 | Yes | Master clock over one day: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. |
| `autoAdvanceSecondsPerDay` | number | `600` | 0 – 3600 | Yes | Real seconds one full day takes. 0 pauses the clock, which also frees sun.direction. |
| `latitude` | number | `45` | -90 – 90 | Yes | Observer latitude. 0 puts the noon sun overhead; 90 circles sun, moon, and stars parallel to the horizon. |
| `azimuth` | number | `0` | -180 – 180 | Yes | Rotates the whole celestial sphere — sun path, moon, and stars together — about the vertical axis. |
| `moon.phase` | number | `0.5` | 0 – 1 | Yes | Moon phase: 0 new and dark, 0.5 full, 1 new again. Brightness only — the arc is unchanged. |
| `moon.intensity` | number | `1` | 0 – 4 | Yes | Master over everything the moon lights: the disc, the sky ambient, and the light on cloud edges. |
| `moon.discBrightness` | number | `9` | 0 – 40 | Yes | Brightens the moon disc alone, on top of intensity. |
| `moon.angularSize` | number | `0.0003` | 0.00005 – 0.005 | Yes | Angular size of the moon disc, as 1 - cos of the angular radius. Same convention as sun.discSize. |
| `moon.color` | color | `[0.7, 0.78, 0.95]` | — | Yes | Tints the moon disc, the sky ambient it casts, and the moonlight on cloud edges. |
| `moon.ambient` | number | `0.015` | 0 – 1 | Yes | Ambient lift the moon adds to the night sky, which is what keeps night from going pitch black. |

## Legacy StylizedSky compatibility

Module: `@call-me-sensei/toonlab/sky` — 5 groups, 47 fields.

Compatibility schema for StylizedSky, not the modern SkySystem document. See the SkySystem section for current integrated sky/cloud authoring.

### Legacy StylizedSky compatibility: Dome

Sky dome geometry. Construction-only.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `radius` | number | `100` | 10 – 1000 | No — local/construction | Sphere radius of the sky dome in meters. Construction-only: baked into the dome geometry; applySettings stores but does not rebuild it. |

### Legacy StylizedSky compatibility: Gradient

Vertical zenith-to-horizon-to-ground gradient and horizon scattering.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `zenithColor` | color | `[0.28, 0.56, 0.92]` | — | Yes | Sky color straight up at the top of the dome. |
| `horizonColor` | color | `[0.78, 0.92, 1]` | — | Yes | Sky color at the horizon band. |
| `groundColor` | color | `[0.42, 0.48, 0.55]` | — | Yes | Dome color below the horizon. |
| `zenithExponent` | number | `0.48` | 0.1 – 4 | Yes | Shape of the horizon-to-zenith gradient. Lower values bring the zenith color farther toward the horizon. |
| `groundExponent` | number | `0.55` | 0.1 – 4 | Yes | Shape of the mirrored below-horizon fade into the ground color. |
| `horizonBandSize` | number | `0.42` | 0.02 – 1 | Yes | Vertical size of the sun-side atmospheric scattering band around the horizon. |
| `horizonSunPower` | number | `5` | 0.5 – 20 | Yes | How tightly horizon scattering concentrates toward the sun direction. |
| `horizonScattering` | number | `0.5` | 0 – 1 | Yes | Strength of the bright sun-side atmospheric wedge at the horizon. |

### Legacy StylizedSky compatibility: Sun

Sun disc position, size, tint, and glow halo.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `sunDirection` | vector3 | `[0.35, 0.8, 0.45]` | — | Yes | World-space direction toward the sun (normalized on apply). Match your main directional light. |
| `sunColor` | color | `[1, 0.95, 0.82]` | — | Yes | Tint of the sun disc and its glow. |
| `sunSize` | number | `0.026` | 0 – 0.2 | Yes | Angular size of the sun disc. |
| `sunDiscSoftness` | number | `0.5` | 0.01 – 1 | Yes | Fraction of the disc radius used for its anti-aliased painterly edge. |
| `sunDiscIntensity` | number | `2.4` | 0 – 8 | Yes | Brightness multiplier of the solid sun disc before the renderer tone map. |
| `sunGlowStrength` | number | `1` | 0 – 4 | Yes | Master intensity of the broad and core sun glow terms. |
| `sunGlowSpread` | number | `5` | 1 – 20 | Yes | Falloff power of the broad halo. Lower values spread the glow across more sky. |
| `sunGlowCoreSharpness` | number | `60` | 5 – 200 | Yes | Falloff power of the tight inner halo. Higher values make a smaller, sharper core. |
| `sunGlowBroadStrength` | number | `0.16` | 0 – 2 | Yes | Contribution of the broad halo inside the master glow strength. |
| `sunGlowCoreStrength` | number | `0.5` | 0 – 2 | Yes | Contribution of the tight inner halo inside the master glow strength. |
| `sunCloudOcclusionStrength` | number | `1` | 0 – 1 | Yes | How strongly dense cloud coverage hides the sun disc. 0 keeps the disc visible through cloud. |

### Legacy StylizedSky compatibility: Clouds

Painterly two-tone procedural clouds.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `cloudCoverage` | number | `0.42` | 0 – 1 | Yes | Fraction of the sky filled by clouds. 0 clears the sky. |
| `cloudScale` | number | `1.6` | 0.1 – 6 | Yes | Noise scale of the cloud shapes; higher gives smaller, busier clouds. |
| `cloudSoftness` | number | `0.1` | 0.01 – 0.3 | Yes | Width of the painterly cloud silhouette transition. |
| `cloudProjection` | number | `0.22` | 0.05 – 0.8 | Yes | Perspective offset of the virtual cloud plane; higher values flatten clouds toward the horizon. |
| `cloudOpacity` | number | `1` | 0 – 1 | Yes | Overall blend opacity of the procedural cloud layer. |
| `cloudEdgeOpacity` | number | `0.65` | 0 – 1 | Yes | Opacity of the soft outer silhouette relative to the solid cloud core. |
| `cloudSpeed` | number | `1` | 0 – 4 | Yes | How fast the authored cloud layer drifts across the dome. |
| `cloudDirection` | vector2 | `[0.9615239476, 0.2747211279]` | — | Yes | Normalized horizontal drift direction of the authored cloud layer; speed is controlled separately. |
| `cloudSeed` | number | `0` | 0 – 1000 | Yes | Offsets the procedural cloud field to produce a different deterministic composition. |
| `cloudColor` | color | `[1, 1, 1]` | — | Yes | Lit tone of the two-tone painterly clouds. |
| `cloudShadeColor` | color | `[0.68, 0.78, 0.92]` | — | Yes | Shaded underside tone of the two-tone painterly clouds. |
| `cloudShadeStrength` | number | `0.85` | 0 – 1 | Yes | Strength of the two-tone shaded underside. |
| `cloudShadeThreshold` | number | `0.02` | -0.3 – 0.3 | Yes | Noise-difference threshold that separates the lit and shaded cloud tones. |
| `cloudShadeSoftness` | number | `0.06` | 0.001 – 0.3 | Yes | Softness of the transition between the two cloud tones. |
| `cloudLightOffset` | number | `0.4` | 0 – 2 | Yes | Distance of the secondary noise sample toward the sun; controls the depth and directionality of cloud shading. |
| `cloudSilverLiningStrength` | number | `0.3` | 0 – 2 | Yes | Warm sun-colored lining added to cloud edges facing the sun. |
| `cloudSunPower` | number | `10` | 1 – 40 | Yes | Angular focus of the sun-colored cloud lining. |
| `cloudHorizonFade` | number | `0.16` | 0.02 – 0.8 | Yes | Altitude at which the cloud layer reaches full opacity above the horizon. |

### Legacy StylizedSky compatibility: Stars

Procedural star field for night skies.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `starsStrength` | number | `0` | 0 – 2 | Yes | Brightness of the procedural star field. 0 (default) hides stars for daytime skies. |
| `starsColor` | color | `[1, 0.98, 0.92]` | — | Yes | Tint of the procedural star glints. |
| `starsSeed` | number | `0` | 0 – 1000 | Yes | Offsets the deterministic star pattern without changing density or size. |
| `starsDensity` | number | `0.28` | 0 – 1 | Yes | Fraction of candidate cells allowed to contain a visible star. |
| `starsScale` | number | `14` | 2 – 64 | Yes | Density scale of the projected star grid; higher values produce more, smaller cells. |
| `starsSize` | number | `0.06` | 0.005 – 0.2 | Yes | Size of each procedural star glint inside its cell. |
| `starsTwinkleStrength` | number | `0.8` | 0 – 1 | Yes | Depth of per-star brightness animation. 0 disables twinkle without hiding stars. |
| `starsTwinkleSpeed` | number | `1` | 0 – 4 | Yes | Speed multiplier of the seeded per-star twinkle animation. |
| `starsHorizonFade` | number | `0.24` | 0.04 – 1 | Yes | Altitude at which the star field reaches full brightness above the horizon. |

## Paths, roads & bridges

Repository-only module: `src/pathgen/pathSettings.js` — 4 groups, 22 fields. **Not an npm entry point.**

Grouped settings consumed by `createStylizedPaths({ settings })` and serialized in path recipes.

### Paths, roads & bridges: Routing

Cost-field router: how strongly slope and water repel routes, and how much existing paths attract reuse (forks and junctions).

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `pointCount` | number | `4` | 2 – 8 | Yes | Auto mode: number of destinations probed from the terrain and connected into a network. |
| `slopeCost` | number | `26` | 0 – 80 | Yes | How expensive climbing is for the router. Higher values hug contours and produce switchbacks instead of straight climbs. |
| `waterCost` | number | `14` | 2 – 60 | Yes | Cost multiplier for crossing water. High enough that routes only cross where a bridge is worth it, low enough that crossings still happen. |
| `reuseBonus` | number | `0.45` | 0 – 0.9 | Yes | Cost discount (0..1) on cells an earlier route already walks — the source of natural forks and shared trunk roads. |
| `gridStep` | number | `8` | 3 – 24 | Yes | Router grid resolution in meters. Smaller steps find finer detours and cost more to solve. |
| `shoreMargin` | number | `0.6` | 0 – 2 | Yes | Meters above the waterline a cell must be to count as dry land. |
| `loopChance` | number | `0.35` | 0 – 1 | Yes | Auto mode: chance to add one extra ring road beyond the spanning network. |

### Paths, roads & bridges: Ribbon

The walkable strip: width, hand-drawn wobble, edge skirts that tuck into the terrain, and the height-profile smoothing that flattens the walk.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `width` | number | `2.6` | 1 – 6 | Yes | Walkable ribbon width in meters (dirt trail 2–3, stone road 3–4). |
| `widthWobble` | number | `0.22` | 0 – 0.6 | Yes | Low-frequency width variation (0..1) for the hand-drawn look. 0 is a survey-straight road. |
| `edgeSkirt` | number | `1.1` | 0.2 – 2.5 | Yes | Extra meters each side that slope down and tuck under the terrain so the ribbon never floats on side slopes. |
| `lift` | number | `0.07` | 0.02 – 0.25 | Yes | Meters the ribbon rides above the height profile — the true-overlay offset that prevents z-fighting. |
| `smoothing` | number | `16` | 0 – 40 | Yes | Moving-average window in meters applied to the terrain height along the route; the flattened profile is what paths.heightAt reports. |
| `stepLength` | number | `2` | 1 – 5 | Yes | Meters between ribbon cross-sections. Smaller steps follow curves tighter and spend more triangles. |
| `edgeFade` | number | `1.4` | 0.2 – 4 | Yes | Meters past the ribbon edge over which maskAt falls from 1 to 0 — the band where grass and flowers thin out. |

### Paths, roads & bridges: Bridges

Arched plank bridges generated where a route crosses open water.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `arc` | number | `0.1` | 0 – 0.18 | Yes | Deck rise as a fraction of span length. 0 is a flat causeway, 0.14 a strong arched footbridge. |
| `railStyle` | select | `'posts'` | `posts` \| `beams` \| `none` | Yes | Bridge railing construction. |
| `postSpacing` | number | `2.2` | 1.2 – 4 | Yes | Meters between railing posts. |
| `minSpan` | number | `4` | 2 – 12 | Yes | Meters of open water a route must cross before a bridge is generated (shorter crossings ford instead). |
| `pierSpacing` | number | `7` | 4 – 16 | Yes | Long crossings get support piers to the bed every this many meters. |
| `deckClearance` | number | `1.1` | 0.3 – 3 | Yes | Minimum meters between the water level and the deck at mid-span. |

### Paths, roads & bridges: Stairs

Stepped stone segments swapped in where the route climbs steeply. Visual only — paths.heightAt stays a smooth ramp.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `slopeThreshold` | number | `0.45` | 0.2 – 0.9 | Yes | Rise-over-run along the route beyond which the ribbon switches to stepped stone segments. |
| `stepHeight` | number | `0.19` | 0.12 – 0.3 | Yes | Riser height of generated steps in meters. |

## Ambient VFX

Repository-only module: `src/ambientfx/ambientFxSettings.js` — 6 groups, 54 fields. **Not an npm entry point.**

Settings are nested per group: `createAmbientFx({ settings: { fireflies: { blinkSpeed: 0.8 } } })`. Effect entries in `effects` override their group; `densityScale` multiplies the authored per-m³ density (`density` remains a compatibility alias). Call `emitNow(camera)` when build-time stats or a settled first capture are required before the first update.

### Ambient VFX: Shared

Wind, sun, and the follow-window every effect emits into. Match windDirection/windSpeed/windStrength with the grass and tree wind so the whole world blows the same way.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `windDirection` | vector2 | `[1, 0.3]` | — | Yes | Horizontal (XZ) heading the wind blows toward — share with grass/trees. Magnitude is ignored. |
| `windSpeed` | number | `1` | 0 – 4 | Yes | How fast wind-driven motion oscillates and mist scrolls. |
| `windStrength` | number | `0.16` | 0 – 1 | Yes | How far particles drift downwind. |
| `sunDirection` | vector3 | `[0.35, 0.72, 0.42]` | — | Yes | World-space direction toward the sun (normalized on apply); drives the pollen backlight and petal sheen. |
| `windowRadius` | number | `45` | 15 – 120 | Yes | Meters of the follow window particles exist in around the follow target. Construction-only. |
| `maxParticles` | number | `20000` | 1000 – 40000 | Yes | Hard budget; effect densities are scaled down proportionally when their sum would exceed it. Construction-only. |

### Ambient VFX: Petals

Flutter-falling blossom petals. Emit from registered bloom volumes (flowering canopies) when any exist, otherwise from the open air above the ground.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.03` | 0 – 0.15 | Yes | Petals per m³ of the emission volume. |
| `canopyDensity` | number | `4.5` | 0 – 20 | Yes | Petals per m³ inside registered bloom volumes (crowns shed far more than open air). |
| `sizeRange` | vector2 | `[0.06, 0.11]` | — | Yes | Min/max petal size in meters. |
| `colorA` | color | `[1, 0.52, 0.68]` | — | Yes | Primary petal color. |
| `colorB` | color | `[1, 0.75, 0.84]` | — | Yes | Secondary petal color; each petal picks between the two. |
| `emitHeight` | vector2 | `[2, 9]` | — | Yes | Min/max meters above ground petals spawn at when not bound to canopies. Construction-only. |
| `flutter` | number | `1` | 0 – 3 | Yes | Side-to-side rocking amplitude while falling. |
| `windResponse` | number | `1` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'day'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Falling Leaves

Tumble-falling leaves with strong gust response. Emit from bloom volumes tagged effect:"leaves", otherwise globally.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.022` | 0 – 0.15 | Yes | Leaves per m³ of the emission volume. |
| `canopyDensity` | number | `3.2` | 0 – 20 | Yes | Leaves per m³ inside bloom volumes tagged effect:"leaves". |
| `sizeRange` | vector2 | `[0.09, 0.16]` | — | Yes | Min/max leaf size in meters. |
| `colorA` | color | `[0.93, 0.64, 0.2]` | — | Yes | Primary leaf color. |
| `colorB` | color | `[0.78, 0.4, 0.13]` | — | Yes | Secondary leaf color; each leaf picks between the two. |
| `emitHeight` | vector2 | `[2, 10]` | — | Yes | Min/max meters above ground leaves spawn at when not bound to canopies. Construction-only. |
| `tumble` | number | `1` | 0 – 3 | Yes | Rotational tumbling speed while falling. |
| `windResponse` | number | `1.35` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'any'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Fireflies

Hovering, blinking emissive motes over grass and shore margins. Unlit by design; they ramp with the time-of-day dusk.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.045` | 0 – 0.2 | Yes | Fireflies per m³ of the near-ground hover band. |
| `sizeRange` | vector2 | `[0.13, 0.2]` | — | Yes | Min/max glow-sprite size in meters. |
| `color` | color | `[1, 0.87, 0.42]` | — | Yes | Emissive glow color (unlit; never touched by scene lights). |
| `hoverHeight` | vector2 | `[0.25, 2.2]` | — | Yes | Min/max meters above ground fireflies hover at. Construction-only. |
| `hoverRadius` | number | `0.9` | 0 – 4 | Yes | Meters of wander around each spawn point. |
| `blinkSpeed` | number | `1` | 0 – 4 | Yes | How fast the blink program pulses. |
| `intensity` | number | `1` | 0 – 4 | Yes | Emissive brightness multiplier. |
| `windResponse` | number | `0.1` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'duskNight'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Pollen Motes

Slow curl-drifting dust motes, brightest looking toward the sun (backlit). Bind to flower masks via the effects config.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.06` | 0 – 0.3 | Yes | Motes per m³ of the near-ground drift band. |
| `sizeRange` | vector2 | `[0.045, 0.085]` | — | Yes | Min/max mote size in meters. |
| `color` | color | `[1, 0.93, 0.72]` | — | Yes | Mote color (additive, so it reads as light). |
| `hoverHeight` | vector2 | `[0.3, 2.6]` | — | Yes | Min/max meters above ground motes drift at. Construction-only. |
| `driftRadius` | number | `1.3` | 0 – 5 | Yes | Meters of curl-drift wander around each spawn point. |
| `backlitStrength` | number | `1` | 0 – 3 | Yes | Brightness boost when the camera looks toward the sun through the motes. |
| `windResponse` | number | `0.5` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'day'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

### Ambient VFX: Ground Mist

Soft horizontal wisps scrolling with the wind, hugging water margins and low ground at dawn/dusk.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `density` | number | `0.0045` | 0 – 0.02 | Yes | Wisps per m³ of the ground-hugging band — a few dozen quads, not thousands. |
| `sizeRange` | vector2 | `[1.6, 3]` | — | Yes | Min/max wisp height in meters (width is ~3–5× the height). |
| `color` | color | `[0.84, 0.9, 0.97]` | — | Yes | Wisp color. |
| `opacity` | number | `0.34` | 0 – 0.6 | Yes | Peak alpha at a wisp center; the sprite falls off softly from there. |
| `scrollSpan` | number | `26` | 5 – 60 | Yes | Meters a wisp travels downwind before wrapping (fades at both ends). |
| `marginWidth` | number | `7` | 1 – 20 | Yes | Meters of \|ground − waterLevel\| that count as the water-margin emission band. Construction-only. |
| `windResponse` | number | `1` | 0 – 3 | Yes | Multiplier on the shared wind drift for this effect. |
| `gate` | select | `'dawnDusk'` | `day` \| `night` \| `duskNight` \| `dawnDusk` \| `any` | Yes | When the effect is visible; weights follow the environmentTimeOfDay hour. |

## Gameplay VFX

Repository-only module: `src/vfxgen/vfxSettings.js` — 7 groups, 80 fields. **Not an npm entry point.**

Settings are nested per group: `createVfxSystem({ settings: { impact: { sparkCount: 40 } } })`. Per-spawn `look` overrides re-tint one spawn without touching settings.

### Gameplay VFX: Shared

Budgets and global pacing for every effect. The one-shot backbone renders all bursts in two draw calls; these bound its ring buffers and the pooled trail/projectile meshes.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `maxParticles` | number | `4096` | 256 – 32768 | Yes | Ring-buffer capacity of the one-shot backbone (sparks, embers, puffs, rings, flashes). Oldest instances are overwritten first. Construction-only. |
| `maxProjectiles` | number | `8` | 1 – 32 | Yes | Pooled legacy billboard projectile cores (fireballs in flight). Spawns beyond this reuse the oldest. Construction-only. |
| `maxLayeredProjectiles` | number | `8` | 1 – 32 | Yes | Pooled template-backed layered projectile roots. Spawns beyond this reuse the oldest. Construction-only. |
| `maxTrails` | number | `8` | 1 – 32 | Yes | Pooled slash-trail ribbons live at once. Spawns beyond this reuse the oldest. Construction-only. |
| `timeScale` | number | `1` | 0 – 2 | Yes | Global VFX clock multiplier — hit-stop and slow-motion hooks feed this. |

### Gameplay VFX: Slash Trail

Weapon-swing ribbon sampled from a followed blade (base + tip anchors), with a stepped toon fade and edge sparkle. The anime arc smear.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `color` | color | `[0.55, 0.8, 1]` | — | Yes | The solid body of the arc — the flat saturated fill. |
| `coreColor` | color | `[1, 1, 1]` | — | Yes | Leading-edge band color along the blade-tip side; white body+edge banding is the reference action-RPG read. |
| `lifetime` | number | `0.28` | 0.05 – 1.5 | Yes | Seconds a ribbon segment persists before the tail erodes over it. |
| `bands` | number | `3` | 1 – 8 | Yes | Cel quantization of the tail erosion sweep — fewer bands, chunkier stepped tail. |
| `intensity` | number | `1` | 0 – 4 | Yes | Emissive brightness multiplier on the glow parts. |
| `sparkle` | number | `60` | 0 – 300 | Yes | Sparks per second shed from the blade tip while the trail is active. |
| `segments` | number | `96` | 8 – 256 | Yes | Ribbon history capacity in spline points — longer fast swings need more. Construction-only. |

### Gameplay VFX: Impact Burst

Hit feedback: a radial star flash plus ballistic sparks with gravity. `power` at spawn scales count, speed, and flash size.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `sparkColor` | color | `[1, 0.85, 0.45]` | — | Yes | Ballistic spark color (additive). |
| `flashColor` | color | `[1, 0.97, 0.88]` | — | Yes | Radial star-flash color at the hit point. |
| `sparkCount` | number | `26` | 0 – 120 | Yes | Sparks per burst at power 1; spawn `power` scales this. |
| `sparkSpeed` | number | `7` | 0 – 30 | Yes | Initial spark speed in m/s, biased along the hit normal. |
| `gravity` | number | `18` | 0 – 60 | Yes | Downward pull on sparks in m/s² — high values read as metal chips. |
| `flashSize` | number | `0.9` | 0 – 4 | Yes | Star-flash quad size in meters at power 1. |
| `spikes` | number | `6` | 3 – 12 | Yes | Point count of the star flash — 4 reads as an action-RPG glint, 6–8 as an anime hit star. |
| `shockwave` | boolean | `true` | — | Yes | Camera-facing expanding ring at the hit point — the action-RPG hit circle. Tinted by Flash Color. |
| `lifetime` | number | `0.5` | 0.05 – 2 | Yes | Seconds sparks live (the flash pops in about a quarter of this). |
| `intensity` | number | `1` | 0 – 4 | Yes | Emissive brightness multiplier on the glow parts. |

### Gameplay VFX: Fireball

Projectile: a flame-shaded core billboard shedding embers in flight; explodes into an impact burst, smoke puffs, and an expanding scorch ring.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `coreSize` | number | `0.42` | 0.05 – 2 | Yes | Flame-core billboard radius in meters. |
| `coreColor` | color | `[1, 0.95, 0.6]` | — | Yes | Hot center of the flame shader. |
| `flameColor` | color | `[1, 0.45, 0.12]` | — | Yes | Outer flame licks and ember tint. |
| `emberRate` | number | `90` | 0 – 400 | Yes | Embers shed per second while the projectile flies. |
| `emberSize` | vector2 | `[0.05, 0.12]` | — | Yes | Min/max ember size in meters. |
| `emberLifetime` | number | `0.55` | 0.05 – 2 | Yes | Seconds each shed ember lives. |
| `intensity` | number | `1.2` | 0 – 4 | Yes | Emissive brightness multiplier on the glow parts. |
| `explosionPower` | number | `1.6` | 0 – 5 | Yes | `power` handed to the impact burst + smoke on detonation. |
| `scorchRing` | boolean | `true` | — | Yes | Expanding ground ring on detonation. |
| `ringColor` | color | `[1, 0.55, 0.2]` | — | Yes | Scorch-ring glow color. |

### Gameplay VFX: Charged Energy Shot

Template-backed layered projectile: directional mesh core, animated energy shell and filaments, internal motes, boundary sparks, travel trail, local light, and impact presentation.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `length` | number | `1.8` | 0.6 – 4 | Yes | Projectile length in meters at full charge. |
| `radius` | number | `0.46` | 0.12 – 1.2 | Yes | Projectile radius in meters at full charge. |
| `coreIntensity` | number | `2.4` | 0 – 5 | Yes | Emission multiplier for the directional inner body. |
| `shellIntensity` | number | `1.35` | 0 – 4 | Yes | Emission multiplier for the outer energy volume. |
| `filamentDensity` | number | `1.25` | 0.25 – 3 | Yes | Density of animated veins across the outer shell. |
| `filamentSpeed` | number | `1.2` | 0 – 4 | Yes | Flow speed of shell veins and internal streaks. |
| `circulationEnabled` | boolean | `true` | — | Yes | Procedural seeded energy arcs that move over the projectile volume. |
| `energyMotionTheme` | text | `'electric-orbit'` | — | Yes | Authored starting theme or custom parameter set. |
| `circulationCount` | number | `6` | 1 – 12 | Yes | Primary surface arcs before branch forks. |
| `circulationSpeed` | number | `1.6` | 0 – 4 | Yes | Cycles per authored motion unit. |
| `circulationDirection` | text | `'alternating'` | — | Yes | Clockwise, counter-clockwise, or alternating per arc. |
| `circulationCoverage` | number | `0.3` | 0.08 – 1 | Yes | Fraction of a full orbit covered by each arc. |
| `circulationIrregularity` | number | `0.72` | 0 – 1 | Yes | Seeded angular and axial deviation from a uniform orbit. |
| `circulationBranching` | number | `0.42` | 0 – 1 | Yes | Frequency and reach of connected lightning forks. |
| `circulationThickness` | number | `0.022` | 0.006 – 0.08 | Yes | Normalized width of the bright surface ribbon. |
| `circulationSurfaceOffset` | number | `1.68` | 1.05 – 2.4 | Yes | Visible gap between the main projectile body and the circulating lightning. |
| `circulationAxialWander` | number | `0.52` | 0 – 1 | Yes | How far an arc travels between nose and tail. |
| `circulationPlaneVariation` | number | `0.78` | 0 – 1 | Yes | Tilts arcs onto different seeded planes and adds non-planar depth wobble. |
| `circulationFlicker` | number | `0.68` | 0 – 1 | Yes | Seeded disappearance and reformation instead of continuous uniform bands. |
| `releaseDepth` | number | `0.28` | 0.05 – 0.65 | Yes | Out-of-plane depth along the firing axis. |
| `releaseIrregularity` | number | `0.38` | 0 – 0.75 | Yes | Restrained seeded variation around the loop. |
| `releaseLobes` | number | `3` | 2 – 7 | Yes | Gentle undulations around the closed loop. |
| `turbulence` | number | `0.7` | 0 – 2 | Yes | Internal-particle motion and boundary instability. |
| `trailLength` | number | `1.15` | 0 – 3 | Yes | Lifetime and visual reach of particles shed behind the projectile. |
| `particleRate` | number | `160` | 0 – 500 | Yes | Internal motes and boundary sparks emitted per second. |
| `impactPower` | number | `2.2` | 0 – 5 | Yes | Presentation power of the contact flash, shockwave, sparks, and smoke. |
| `coreColor` | color | `[0.9, 0.98, 1]` | — | Yes | Hot inner energy color. |
| `edgeColor` | color | `[0.28, 0.62, 1]` | — | Yes | Outer shell and travel-trail color. |
| `accentColor` | color | `[0.55, 0.82, 1]` | — | Yes | Filament, compression-ring, and impact accent color. |
| `lightIntensity` | number | `2.4` | 0 – 8 | Yes | Optional local point-light intensity at full charge. |
| `bloomContribution` | number | `0.8` | 0 – 2 | Yes | Authored bloom recommendation exposed to compatible host post stacks. |

### Gameplay VFX: Footstep Dust

Small chunky dust puffs kicked up at a footfall. Cheap enough to fire every step.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `puffCount` | number | `5` | 0 – 20 | Yes | Dust puffs per footfall. |
| `sizeRange` | vector2 | `[0.1, 0.22]` | — | Yes | Min/max puff size in meters (puffs grow ~2× over life). |
| `color` | color | `[0.78, 0.72, 0.62]` | — | Yes | Dust color — sample the ground palette. |
| `lifetime` | number | `0.55` | 0.05 – 2 | Yes | Seconds a puff lives. |
| `rise` | number | `0.5` | 0 – 2 | Yes | Upward drift in m/s — heavier dust settles faster. |
| `spread` | number | `0.22` | 0 – 1 | Yes | Horizontal scatter radius in meters around the footfall. |

### Gameplay VFX: Landing Ring

The classic landing hit: a radial ring of dust puffs expanding outward from the touch-down point. `power` at spawn scales radius and count.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Master toggle for the effect. |
| `puffCount` | number | `14` | 0 – 40 | Yes | Puffs around the ring at power 1; spawn `power` scales this. |
| `ringRadius` | number | `1.1` | 0.2 – 5 | Yes | Meters the dust ring expands to at power 1. |
| `sizeRange` | vector2 | `[0.18, 0.38]` | — | Yes | Min/max puff size in meters. |
| `color` | color | `[0.78, 0.72, 0.62]` | — | Yes | Dust color — sample the ground palette. |
| `lifetime` | number | `0.7` | 0.05 – 2 | Yes | Seconds the ring takes to expand and fade. |

## Fauna

Repository-only module: `src/fauna/faunaSettings.js` — 5 groups, 48 fields. **Not an npm entry point.**

Settings are nested per species group: `createFauna({ settings: { birds: { fleeRadius: 15 } } })`. Populations are passed separately: `createFauna({ species: { birds: 40, fish: 80 } })`.

### Fauna: Shared

Cross-species simulation budgets: the staggered steering-tick share and the distance beyond which agents degrade to scripted loops.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `tickShare` | number | `0.25` | 0.05 – 0.5 | Yes | Fraction of all agents that receive a full steering tick per update; the rest integrate their last velocity. 0.25 = every agent steers at ~15 Hz on a 60 Hz host. |
| `farDistance` | number | `150` | 40 – 400 | Yes | Meters from the follow target beyond which agents stop steering entirely and fly scripted circles (fish keep their depth clamps). |

### Fauna: Birds

Flocking boids in a roaming altitude band; perch on registered points (or terrain) and flush when the follow target approaches.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `altitudeMin` | number | `7` | 1 – 40 | Yes | Bottom of the preferred flight band, meters above the local terrain. |
| `altitudeMax` | number | `26` | 2 – 80 | Yes | Top of the preferred flight band, meters above the local terrain. |
| `cruiseSpeed` | number | `7` | 1 – 20 | Yes | Relaxed flight speed in m/s; flocks settle around it. |
| `maxSpeed` | number | `12` | 2 – 30 | Yes | Hard speed cap in m/s, reached when fleeing. |
| `neighborRadius` | number | `14` | 2 – 30 | Yes | Meters within which flockmates influence cohesion and alignment. |
| `separationRadius` | number | `2.6` | 0.5 – 8 | Yes | Personal-space radius in meters; closer neighbors are pushed away. |
| `cohesion` | number | `0.9` | 0 – 2 | Yes | Pull toward the local flock center — the flock-tightness knob. |
| `alignment` | number | `0.8` | 0 – 2 | Yes | Pull toward the local average heading. |
| `separation` | number | `1.3` | 0 – 3 | Yes | Push away from neighbors inside the separation radius. |
| `wander` | number | `0.45` | 0 – 2 | Yes | Per-bird sinusoidal drift so flocks meander instead of orbiting. |
| `fleeRadius` | number | `12` | 0 – 40 | Yes | Meters from the follow target at which flying birds scatter and perched birds flush. |
| `perchChance` | number | `0.5` | 0 – 1 | Yes | Appetite for landing: expected perch attempts scale with this per ~10 s of flight. |
| `perchDuration` | number | `11` | 2 – 40 | Yes | Mean seconds a bird stays perched (each stay jitters ±40%). |
| `flapHz` | number | `3.4` | 0.5 – 8 | Yes | Wingbeats per second; the GPU flap phase/speed attributes derive from it. Birds glide (near-zero amplitude) when descending. |
| `scale` | number | `1` | 0.4 – 2.5 | Yes | Uniform body scale multiplier (±12% per-bird jitter on top). |
| `palette` | select | `'swallow'` | `swallow` \| `egret` \| `finch` | Yes | Named body palette; each palette carries 2–4 vertex-colored variants. |

### Fauna: Butterflies

Individual noise-wanderers anchored to flower-mask points, hovering just above the terrain.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `hoverMin` | number | `0.5` | 0.1 – 3 | Yes | Bottom of the flutter band, meters above the local terrain. |
| `hoverMax` | number | `1.7` | 0.2 – 5 | Yes | Top of the flutter band, meters above the local terrain. |
| `speed` | number | `1.3` | 0.2 – 4 | Yes | Typical flutter speed in m/s. |
| `wanderRadius` | number | `6` | 2 – 30 | Yes | Meters a butterfly may drift from its flower-mask anchor before being pulled back. |
| `fleeRadius` | number | `3.5` | 0 – 15 | Yes | Meters from the follow target at which butterflies scatter upward. |
| `flapHz` | number | `8.5` | 2 – 16 | Yes | Wingbeats per second for the GPU wing fold. |
| `scale` | number | `1` | 0.4 – 2.5 | Yes | Uniform body scale multiplier (±20% per-agent jitter on top). |
| `palette` | select | `'meadow'` | `meadow` \| `twilight` | Yes | Named wing palette; each palette carries up to 4 vertex-colored variants. |

### Fauna: Dragonflies

Hover-and-dart flyers anchored to the water margin, holding a fixed height above the water surface.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `hoverHeight` | number | `0.6` | 0.2 – 3 | Yes | Meters above the water surface dragonflies hold. |
| `hoverRadius` | number | `5` | 1 – 20 | Yes | Meters of drift allowed around the current hover anchor. |
| `dartSpeed` | number | `7` | 1 – 16 | Yes | Straight-line speed in m/s when relocating to a new anchor. |
| `dartChance` | number | `0.5` | 0 – 1 | Yes | Appetite for relocating: expected darts scale with this per ~8 s of hovering. |
| `flapHz` | number | `36` | 10 – 60 | Yes | Wing oscillations per second; high rates read as the classic wing shimmer. |
| `scale` | number | `1` | 0.4 – 2.5 | Yes | Uniform body scale multiplier. |
| `palette` | select | `'pond'` | `pond` \| `ember` | Yes | Named body palette; each palette carries 2–3 vertex-colored variants. |

### Fauna: Fish

Schooling boids clamped between the water surface and the bed; visible from above through the water refraction pass.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `surfaceMargin` | number | `0.3` | 0.1 – 2 | Yes | Minimum meters a fish stays below the water surface (never breaches). |
| `bedMargin` | number | `0.35` | 0.1 – 2 | Yes | Minimum meters a fish stays above the terrain bed. |
| `minSpawnDepth` | number | `1.1` | 0.3 – 5 | Yes | Meters of water column required for a fish spawn point; shallower bounds simply hold fewer fish. |
| `cruiseSpeed` | number | `1.5` | 0.2 – 5 | Yes | Relaxed swim speed in m/s. |
| `maxSpeed` | number | `3.2` | 0.5 – 8 | Yes | Hard speed cap in m/s, reached when fleeing. |
| `neighborRadius` | number | `4` | 1 – 12 | Yes | Meters within which schoolmates influence cohesion and alignment. |
| `separationRadius` | number | `0.8` | 0.2 – 4 | Yes | Personal-space radius in meters. |
| `cohesion` | number | `0.9` | 0 – 2 | Yes | Pull toward the local school center — schooling tightness. |
| `alignment` | number | `0.85` | 0 – 2 | Yes | Pull toward the local average heading. |
| `separation` | number | `1.1` | 0 – 3 | Yes | Push away from neighbors inside the separation radius. |
| `wander` | number | `0.5` | 0 – 2 | Yes | Per-fish sinusoidal drift so schools roam the basin. |
| `fleeRadius` | number | `7` | 0 – 25 | Yes | Meters from the follow target (a swimmer, a bridge walker) at which fish scatter. |
| `swayHz` | number | `2.8` | 0.5 – 8 | Yes | Tail-sway cycles per second for the GPU body flex. |
| `scale` | number | `1` | 0.3 – 3 | Yes | Uniform body scale multiplier (±25% per-fish jitter on top). |
| `palette` | select | `'koi'` | `koi` \| `silver` | Yes | Named body palette: koi for ponds and lakes, silver for open water. |

## Buildings

Repository-only module: `src/buildinggen/buildingSettings.js` — 5 groups, 29 fields. **Not an npm entry point.**

Grouped settings consumed by `createBuildingFromRecipe(...)` / `buildingAsset(...)`; `{ type, seed }` ride alongside the groups.

### Buildings: Footprint

Ground plan: rect, L, or T, in meters.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `kind` | select | `'rect'` | `rect` \| `L` \| `T` | Yes | Ground-plan shape. |
| `width` | number | `6.5` | 2.5 – 14 | Yes | Main rect width in meters. |
| `depth` | number | `5` | 2.5 – 12 | Yes | Main rect depth in meters. |
| `wingRatio` | number | `0.55` | 0.3 – 0.85 | Yes | L/T wing size relative to the main rect. |

### Buildings: Massing

Floors, per-floor inset, and the slight outward wall lean that keeps facades hand-drawn.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `floors` | number | `1` | 1 – 5 | Yes | Full floors (towers go tall). |
| `floorHeight` | number | `2.5` | 2.1 – 3.4 | Yes | Meters per floor. |
| `atticRatio` | number | `0.55` | 0 – 0.8 | Yes | Half-floor under a gable roof (0 = none). |
| `inset` | number | `0` | 0 – 0.3 | Yes | Meters each floor steps inward — watchtower massing. |
| `wallLean` | number | `0.012` | 0 – 0.05 | Yes | Outward lean per meter of height. Exaggerated proportions are settings, not bugs. |

### Buildings: Roof

Roof form: gable, hip, shed, or the curved pagoda-ish shrine roof. Roofs always overhang walls.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `kind` | select | `'gable'` | `gable` \| `hip` \| `shed` \| `pagoda` | Yes | Roof construction. |
| `pitch` | number | `0.85` | 0.25 – 1.4 | Yes | Rise over half-span. |
| `overhang` | number | `0.55` | 0.25 – 1.6 | Yes | Meters the roof reaches past the walls (invariant: > 0). |
| `curvature` | number | `0` | 0 – 1 | Yes | Upturned eave sweep — the shrine-roof signature. |
| `ridgeDecor` | number | `0` | 0 – 1 | Yes | Ridge cap beam and end finials. |

### Buildings: Facade

Timber framing, window rhythm (windows never intersect beams), and the door (always on an exterior wall).

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `beams` | number | `1` | 0 – 1 | Yes | Visible beam grid strength (0 hides framing). |
| `bayWidth` | number | `1.6` | 1 – 2.6 | Yes | Meters between beam columns; windows land mid-bay. |
| `windowChance` | number | `0.75` | 0 – 1 | Yes | Chance an eligible bay gets a window. |
| `windowWidth` | number | `0.75` | 0.4 – 1.4 | Yes | Window width in meters (clamped inside its bay). |
| `windowHeight` | number | `0.95` | 0.4 – 1.6 | Yes | Window height in meters. |
| `doorWidth` | number | `1` | 0.7 – 2.2 | Yes | Door width in meters. |
| `doorHeight` | number | `2` | 1.7 – 2.4 | Yes | Door height in meters. |
| `baseHeight` | number | `0.35` | 0 – 1.2 | Yes | Stone base band height (shrines ride a full veranda plinth). |

### Buildings: Palette

Material role colors: wall, beam, roof, trim, door.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `wall` | color | `[0.82, 0.74, 0.6]` | — | Yes | Plaster / plank wall color. |
| `beam` | color | `[0.32, 0.22, 0.14]` | — | Yes | Timber framing color. |
| `roof` | color | `[0.42, 0.3, 0.24]` | — | Yes | Roof surface color. |
| `trim` | color | `[0.45, 0.46, 0.44]` | — | Yes | Stone base, chimney, and sills. |
| `door` | color | `[0.5, 0.3, 0.16]` | — | Yes | Door color. |
| `glass` | color | `[0.22, 0.31, 0.38]` | — | Yes | Window glazing color — cool by default; warm it for lit interiors. |
| `variation` | number | `0.12` | 0 – 0.4 | Yes | Per-vertex color drift. |

## Procedural textures

Module: `@call-me-sensei/toonlab/texgen` — 10 groups, 167 fields.

Grouped settings consumed by `evaluateTextureMaps(settings)` and serialized in texture recipes (`createTextureSettings`).

### Procedural textures: Seed

Deterministic seed shared by every layer.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `seed` | number | `1337` | 0 – 99999 | Yes | Deterministic seed — every value is a different texture with the same recipe. |

### Procedural textures: Base pattern

The primary structure: pattern, frequency, warp.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Primary structure of the material: this drives height, color banding, and pattern cells. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the base pattern. |
| `bias` | number | `0` | -0.5 – 0.5 | Yes | Shifts the whole pattern up or down the ramp. |
| `invert` | boolean | `false` | — | Yes | Flips the base pattern (crevices become ridges). |
| `scale` | number | `6` | 1 – 256 | Yes | Feature cells across the tile. Higher = finer features. At a 2 m world tile, 200 resolves 1 cm detail. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods across U. Higher = finer in U, so features elongate along V and read as VERTICAL streaks (drips, fibers, strata). On grid patterns it instead widens the joint on the U axis. |
| `stretchY` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods down V. Higher = finer in V, so features elongate along U and read as HORIZONTAL streaks (brushed metal, boards lying across the frame). On grid patterns it instead widens the joint on the V axis. |
| `warp` | number | `0` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 256 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 256 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 128 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Detail layer A

Mid-frequency relief blended over the base.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `true` | — | Yes | Toggles this detail layer. |
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Pattern blended over the base height. |
| `blend` | select | `'overlay'` | `overlay` \| `add` \| `multiply` \| `screen` \| `min` \| `max` \| `mix` | Yes | How this layer combines with the height underneath. |
| `amount` | number | `0.35` | 0 – 1 | Yes | Blend strength of this layer. |
| `invert` | boolean | `false` | — | Yes | Flips the layer before blending. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the layer. |
| `scale` | number | `18` | 1 – 256 | Yes | Feature cells across the tile. Higher = finer features. At a 2 m world tile, 200 resolves 1 cm detail. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods across U. Higher = finer in U, so features elongate along V and read as VERTICAL streaks (drips, fibers, strata). On grid patterns it instead widens the joint on the U axis. |
| `stretchY` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods down V. Higher = finer in V, so features elongate along U and read as HORIZONTAL streaks (brushed metal, boards lying across the frame). On grid patterns it instead widens the joint on the V axis. |
| `warp` | number | `0` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 256 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 256 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 128 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Detail layer B

Fine grain, pores, chips.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Toggles this detail layer. |
| `generator` | select | `'speckle'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Pattern blended over the base height. |
| `blend` | select | `'add'` | `overlay` \| `add` \| `multiply` \| `screen` \| `min` \| `max` \| `mix` | Yes | How this layer combines with the height underneath. |
| `amount` | number | `0.2` | 0 – 1 | Yes | Blend strength of this layer. |
| `invert` | boolean | `false` | — | Yes | Flips the layer before blending. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the layer. |
| `scale` | number | `24` | 1 – 256 | Yes | Feature cells across the tile. Higher = finer features. At a 2 m world tile, 200 resolves 1 cm detail. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods across U. Higher = finer in U, so features elongate along V and read as VERTICAL streaks (drips, fibers, strata). On grid patterns it instead widens the joint on the U axis. |
| `stretchY` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods down V. Higher = finer in V, so features elongate along U and read as HORIZONTAL streaks (brushed metal, boards lying across the frame). On grid patterns it instead widens the joint on the V axis. |
| `warp` | number | `0` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 256 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 256 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 128 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Color

Five-stop height ramp, painterly jitter, cavity & sheen, final grade.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `color0` | color | `[0.16, 0.14, 0.13]` | — | Yes | Ramp stop at the darkest crevices. |
| `color1` | color | `[0.35, 0.31, 0.28]` | — | Yes | Ramp stop between crevices and the mid tone. |
| `color2` | color | `[0.55, 0.5, 0.45]` | — | Yes | Ramp stop for the average surface. |
| `color3` | color | `[0.72, 0.68, 0.62]` | — | Yes | Ramp stop approaching the ridges. |
| `color4` | color | `[0.88, 0.85, 0.79]` | — | Yes | Ramp stop at the highest ridges. |
| `pos1` | number | `0.25` | 0.02 – 0.98 | Yes | Where the Low stop sits on the height ramp. |
| `pos2` | number | `0.5` | 0.02 – 0.98 | Yes | Where the Mid stop sits on the height ramp. |
| `pos3` | number | `0.75` | 0.02 – 0.98 | Yes | Where the High stop sits on the height ramp. |
| `rampSmooth` | number | `1` | 0 – 1 | Yes | 1 = smooth gradient, 0 = hard cel bands between the five stops. |
| `jitterHue` | number | `0.04` | 0 – 0.5 | Yes | Painterly hue drift across the surface. |
| `jitterValue` | number | `0.08` | 0 – 0.5 | Yes | Painterly brightness drift across the surface. |
| `jitterScale` | number | `24` | 2 – 256 | Yes | Frequency of the painterly drift. |
| `jitterCells` | boolean | `false` | — | Yes | Applies drift per pattern cell (per brick / plank / scale) instead of smoothly. Reads the BASE layer's cell id, so it is a no-op when the base pattern has no cells. |
| `jitterCellVariety` | number | `0` | 0 – 1 | Yes | Enriches per-cell drift: decorrelates each cell's hue from its value and keeps painterly drift running inside the cell, so a tile with N modules stops reading as N flat tints. 0 = legacy flat per-cell tint. |
| `cavity` | number | `0.35` | 0 – 1 | Yes | Darkens crevices toward the cavity tint — the hand-painted occlusion read. |
| `cavityTint` | color | `[0.13, 0.09, 0.08]` | — | Yes | Color the crevices sink toward. |
| `sheen` | number | `0.18` | 0 – 1 | Yes | Screens the sheen tint over ridges and edges — worn highlight. |
| `sheenTint` | color | `[1, 0.97, 0.88]` | — | Yes | Color of the ridge highlight. |
| `hueShift` | number | `0` | -0.5 – 0.5 | Yes | Rotates the final palette hue. |
| `saturation` | number | `1` | 0 – 2 | Yes | Final color saturation. |
| `brightness` | number | `1` | 0.25 – 1.75 | Yes | Final brightness multiplier. |
| `contrast` | number | `0` | -1 – 1 | Yes | Final color contrast. |
| `gamma` | number | `1` | 0.4 – 2.5 | Yes | Final gamma on the albedo. |

### Procedural textures: Wear & tear

One-knob damage and dirt macros layered over everything.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `damage` | number | `0` | 0 – 1 | Yes | Universal wear macro: carves seeded scratches and chips into the surface and roughens them. One knob, many parameters. |
| `dirt` | number | `0` | 0 – 1 | Yes | Grime macro: darkens crevices with pooled dirt and raises their roughness, independent of the overlay slots. |

### Procedural textures: Overlay A

Masked colored overlay: moss, rust, dirt, snow, lichen…

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Toggles this overlay. |
| `generator` | select | `'fbm'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Mask pattern deciding where the overlay lands. |
| `color` | color | `[0.35, 0.48, 0.22]` | — | Yes | Overlay color where the mask is strongest. |
| `colorB` | color | `[0.52, 0.62, 0.28]` | — | Yes | Secondary overlay color for variation within the mask. |
| `coverage` | number | `0.35` | 0 – 1 | Yes | How much of the surface the overlay claims. |
| `softness` | number | `0.18` | 0.01 – 0.6 | Yes | Feather width of the overlay border. |
| `creviceBias` | number | `0.5` | -1 – 1 | Yes | +1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear). |
| `blend` | select | `'normal'` | `normal` \| `multiply` \| `overlay` \| `screen` | Yes | How the overlay color mixes into the albedo. |
| `roughnessShift` | number | `0.25` | -1 – 1 | Yes | Overlay area gets rougher (+) or glossier (-). |
| `heightShift` | number | `0.05` | -0.5 – 0.5 | Yes | Overlay area rises (+) or sinks (-) in the height map. |
| `metalShift` | number | `0` | -1 – 1 | Yes | Overlay area gains (+) or loses (-) metalness — rust strips metal. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the mask pattern. |
| `invert` | boolean | `false` | — | Yes | Flips the mask before thresholding. |
| `scale` | number | `5` | 1 – 256 | Yes | Feature cells across the tile. Higher = finer features. At a 2 m world tile, 200 resolves 1 cm detail. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods across U. Higher = finer in U, so features elongate along V and read as VERTICAL streaks (drips, fibers, strata). On grid patterns it instead widens the joint on the U axis. |
| `stretchY` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods down V. Higher = finer in V, so features elongate along U and read as HORIZONTAL streaks (brushed metal, boards lying across the frame). On grid patterns it instead widens the joint on the V axis. |
| `warp` | number | `0.3` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 256 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 256 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 128 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Overlay B

Second masked overlay: grime, stains, scorch, drips…

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Toggles this overlay. |
| `generator` | select | `'turbulence'` | `fbm` \| `billow` \| `ridged` \| `turbulence` \| `value` \| `perlin` \| `worley` \| `worleyF2` \| `cells` \| `cracks` \| `caustics` \| `speckle` \| `bricks` \| `tiles` \| `hex` \| `checker` \| `grid` \| `stripes` \| `chevron` \| `weave` \| `basketWeave` \| `scales` \| `dots` \| `marble` \| `woodGrain` \| `flat` | Yes | Mask pattern deciding where the overlay lands. |
| `color` | color | `[0.16, 0.12, 0.09]` | — | Yes | Overlay color where the mask is strongest. |
| `colorB` | color | `[0.3, 0.24, 0.18]` | — | Yes | Secondary overlay color for variation within the mask. |
| `coverage` | number | `0.3` | 0 – 1 | Yes | How much of the surface the overlay claims. |
| `softness` | number | `0.22` | 0.01 – 0.6 | Yes | Feather width of the overlay border. |
| `creviceBias` | number | `0.6` | -1 – 1 | Yes | +1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear). |
| `blend` | select | `'multiply'` | `normal` \| `multiply` \| `overlay` \| `screen` | Yes | How the overlay color mixes into the albedo. |
| `roughnessShift` | number | `0.2` | -1 – 1 | Yes | Overlay area gets rougher (+) or glossier (-). |
| `heightShift` | number | `-0.03` | -0.5 – 0.5 | Yes | Overlay area rises (+) or sinks (-) in the height map. |
| `metalShift` | number | `0` | -1 – 1 | Yes | Overlay area gains (+) or loses (-) metalness — rust strips metal. |
| `contrast` | number | `0` | -1 – 1 | Yes | Sharpens (+) or flattens (-) the mask pattern. |
| `invert` | boolean | `false` | — | Yes | Flips the mask before thresholding. |
| `scale` | number | `4` | 1 – 256 | Yes | Feature cells across the tile. Higher = finer features. At a 2 m world tile, 200 resolves 1 cm detail. |
| `rotate90` | boolean | `false` | — | Yes | Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact. |
| `detail` | number | `4` | 1 – 8 | Yes | Fractal octaves layered into the noise. |
| `detailGain` | number | `0.5` | 0.15 – 0.85 | Yes | How much each finer octave contributes. |
| `stretchX` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods across U. Higher = finer in U, so features elongate along V and read as VERTICAL streaks (drips, fibers, strata). On grid patterns it instead widens the joint on the U axis. |
| `stretchY` | number | `1` | 0.125 – 16 | Yes | Multiplies feature periods down V. Higher = finer in V, so features elongate along U and read as HORIZONTAL streaks (brushed metal, boards lying across the frame). On grid patterns it instead widens the joint on the V axis. |
| `warp` | number | `0.25` | 0 – 1 | Yes | Domain warp: melts straight features into organic meanders. |
| `warpScale` | number | `3` | 1 – 32 | Yes | Frequency of the warp field. |
| `columns` | number | `4` | 1 – 256 | Yes | Pattern cells across the tile. |
| `rows` | number | `8` | 1 – 256 | Yes | Pattern cells down the tile. |
| `gap` | number | `0.06` | 0 – 0.4 | Yes | Mortar/groove width between pattern cells. |
| `bevel` | number | `0.12` | 0 – 0.5 | Yes | Edge ramp from groove up to the cell face. |
| `cellJitter` | number | `1` | 0 – 1 | Yes | Randomizes cell centers: 0 = perfect grid, 1 = organic. |
| `cellVariation` | number | `0.35` | 0 – 1 | Yes | Per-cell brightness variance (brick tint shifts). |
| `edgeWidth` | number | `0.12` | 0.01 – 0.6 | Yes | Width of cracks / caustic filaments / speckle chips. |
| `rings` | number | `6` | 1 – 128 | Yes | Ring or vein count across the tile (wood, marble). |
| `grain` | number | `0.5` | 0 – 1 | Yes | Streak amount (wood) or vein sharpness (marble). |

### Procedural textures: Surface

PBR response: relief, occlusion, roughness, metalness.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `heightScale` | number | `0.5` | 0 – 1 | Yes | Overall relief strength — feeds the normal map, AO, and displacement. |
| `normalStrength` | number | `1` | 0 – 3 | Yes | Extra multiplier on the derived normal map. |
| `invertHeight` | boolean | `false` | — | Yes | Flips the height map (grooves become ridges). |
| `aoStrength` | number | `0.55` | 0 – 1 | Yes | Baked ambient occlusion depth in the crevices. |
| `roughness` | number | `0.75` | 0 – 1 | Yes | Base roughness: 0 = mirror gloss, 1 = fully matte. |
| `roughnessContrast` | number | `0.35` | -1 – 1 | Yes | +1 = crevices rough & ridges polished; -1 = the reverse. |
| `metalness` | number | `0` | 0 – 1 | Yes | Base metalness of the material. |

### Procedural textures: Glow

Optional emissive map.

| Field | Type | Default | Range / options | Portable | Description |
|---|---|---|---|---|---|
| `enabled` | boolean | `false` | — | Yes | Adds a glow map (lava cracks, sci-fi circuits, embers). |
| `color` | color | `[1, 0.45, 0.12]` | — | Yes | Emissive color. |
| `intensity` | number | `2` | 0 – 8 | Yes | Emissive brightness (preview material intensity). |
| `source` | select | `'crevices'` | `crevices` \| `peaks` \| `band` \| `accentA` \| `accentB` \| `everywhere` | Yes | Which part of the surface glows. |
| `threshold` | number | `0.5` | 0 – 1 | Yes | Height level the glow hugs (band / crevices / peaks). |
| `width` | number | `0.25` | 0.02 – 0.8 | Yes | Thickness of the glowing region. |
| `softness` | number | `0.2` | 0.01 – 0.6 | Yes | Feather on the glow border. |
