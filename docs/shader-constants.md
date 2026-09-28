# Shader constants reference

Constants that are deliberately **not** exposed as settings — either because
they are physics, because a CPU mirror must stay in lockstep with the GPU
code, or because changing them requires re-deriving neighbors. If you need to
tune one, edit the TSL shader source or its CPU mirror; this page tells you where and what will
break.

Everything that *is* meant to be tuned lives in the settings schemas
(`TOON_SETTING_FIELD_SCHEMA`, `WATER_SETTING_FIELD_SCHEMA`,
`ENVIRONMENT_SETTING_FIELD_SCHEMA`, `POST_PROCESSING_SETTING_FIELD_SCHEMA`,
`VEGETATION_SHADER_FIELD_SCHEMA`, and the
`GRASS/FLOWER/STYLIZED_TREE/SKY_SETTING_FIELD_SCHEMA` families) and renders in
the matching Lab controls.

## Water

| Constant | Where | Why fixed |
|---|---|---|
| `WATER_GERSTNER_WAVE_COUNT = 8` | `src/water/waterSettings.js` + wave loops in `src/shaders-tsl/chunks/water-waves.js` | Loop count baked into the shader; `buildGerstnerWaves()` (the CPU mirror used for buoyancy/physics) must produce exactly this many waves. Changing it means editing both in lockstep. |
| Wavelength falloff `0.68`, min wavelength `0.05` | `buildGerstnerWaves()` in `waterSettings.js` | Wave-spectrum shape: each successive wave is 0.68× the previous wavelength. Part of the tuned spectrum, mirrored on the GPU. |
| Slope limit `0.4` (`amplitude * waveNumber > 0.4`) | `buildGerstnerWaves()` | Gerstner waves self-intersect (loop over) past steepness ~1; 0.4 keeps the tuned look stable at every `waveIntensity`. |
| Gravity `9.81` | `buildGerstnerWaves()` | Deep-water dispersion relation (`speed = sqrt(g/k)`). Physics. |
| Detail-normal distance fade `smoothstep(16.0, 60.0, viewDistance)` and near/far blend `mix(0.2, 1.0, detailFade)` | `src/shaders-tsl/water.js` | Screen-stability tuning: full detail near, 20% far, fading over 16–60 m. Honest candidates for uniforms later; documented here until then. |
| Detail UV advection factors `0.55` / `0.34`, second-layer rotation `1.9` rad | `src/shaders-tsl/water.js` | Two detail layers must drift at different, incommensurate rates or the surface visibly tiles. The triplet was tuned together. |
| View-depth blend `0.18` (`effectiveDepth = columnDepth + viewDepthDiff * 0.18`) | `src/shaders-tsl/chunks/water-color.js` | How much grazing-angle view depth deepens the absorption color; tuned against the shoreline film fix. |
| Absorption divisor `24.0` (`viewDepthDiff / 24.0`) | `src/shaders-tsl/chunks/water-color.js` | Far-field opacity floor so open water never goes glassy at distance. |

Quality tiers (`WATER_DETAIL_OCTAVES`, `WATER_FOAM_OCTAVES`) **are** exposed:
pass `quality: 'low'|'medium'|'high'` or a custom
`{ detailOctaves, foamOctaves, qualityLevel }` — see
`resolveWaterQualityDefines()` in `src/water/waterMaterial.js`.

## Character (toon)

| Constant | Where | Why fixed |
|---|---|---|
| Screen-door dither pattern (interleaved gradient noise) | `src/shaders-tsl/character/characterMaterial.js` | Fade pattern for `alpha.ditherOpacity` / `setToonDitherOpacity`; the pattern itself is canonical. |
| Terminator anti-alias derivative math | `src/shaders-tsl/character/characterMaterial.js` | Driven by `shading.antiAlias` (exposed); the fwidth-based widening formula is not a tunable. |
| Character shadow filter (bilinear 2×2 comparisons) | `src/shaders-tsl/character/castShadows.js` | Kernel shape; width, strength and biases are exposed via `shadows.character.*`. |
| Nose-shadow leaf outline | `src/shaders-tsl/character/paintedDetails.js` | Shape fitted to the reference nose shadow; size, strength and tint are exposed via `face.nose.*`. |
| Face depth flag (+2) in the character pass targets | `src/shaders-tsl/character/castShadows.js` | Encoding that lets faces ignore their own occluders; not a look parameter. |

## Environment

| Constant | Where | Why fixed |
|---|---|---|
| Lightmap painterly remap (warm dark end, lift floor) | `src/shaders-tsl/chunks/environment-lighting.js` | The remap curve IS the art direction; its inputs (strengths, tints) are exposed in `environmentSettings`. |
| Vertex-AO golden-spiral hemisphere sample set | `src/environment/environmentVertexAo.js` | Deterministic sampling pattern — changing it invalidates every baked result. Budget/strength are exposed. |

## Vegetation / sky

Formerly hardcoded uniforms (grass cloud-shadow coverage/scale/velocity,
backlit strength, tree gnarl frequencies/amplitude, foliage shadow strengths)
are now settings — see the vegetation/sky schemas. What remains fixed:

| Constant | Where | Why fixed |
|---|---|---|
| Grass blade segment count / geometry proportions | `stylizedGrass.js` geometry builder | Baked into instanced geometry at construction; density/height ARE settings (construction-time). |
| Tree trunk ring/segment tessellation | `stylizedTree.js` | Geometry topology; regenerating is the designed path (see the tree recipe system). |
| Sky far-plane clip epsilon and horizon branch guards | `src/shaders-tsl/sky.js` | Numerical/render-order safeguards, not art direction. Dome radius remains constructor-compatible but is visually invariant because the vertex stage pins the dome to the far plane. |
| Sky FBM implementation and deployment octave tiers | `src/shaders-tsl/sky.js`, `src/sky/skyQuality.js`, `chunks/water-common.js` | Noise/hash internals define deterministic parity. Shipped quality tiers compile 2/3/4 octaves (`low`/`medium`/`high`), with 1–5 custom; quality stays outside the portable art preset while cloud shape, seed, projection, softness, shading, and motion are exposed. |
| Sky coverage calibration and projection singularity guards | `src/shaders-tsl/sky.js` | Stable mapping from the authored coverage/altitude controls to safe procedural thresholds. All visually meaningful colors, curve shapes, sun/glow terms, cloud treatment, and star treatment are schema fields. |

## Post-processing

All colors, strengths, and thresholds are exposed
(`POST_PROCESSING_SETTING_FIELD_SCHEMA`, 29 parameters). The bloom pyramid's
level count is exposed (`bloomLevels`, 2–8); the downsample filter weights are
not (standard dual-filter kernel).

## TSL texture binding budget

The raw GLSL `USE_*` define plumbing was removed with Phase 11, but the
binding budget did not disappear. The app currently requests default WebGPU
limits, so native WebGPU and the forced WebGL2 fallback both need the same
16-sampled-texture discipline. Optional maps must stay graph-gated in
`src/shaders-tsl/character/`, `src/shaders-tsl/environment.js`, and their chunks:
only construct/sample a texture node when the corresponding map exists.
