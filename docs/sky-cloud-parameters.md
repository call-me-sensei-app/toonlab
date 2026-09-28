# Sky and cloud parameter reference

This is the advanced user reference for ToonLab's raymarched volumetric cloud
deck, physical atmosphere, celestial rendering, shared `SkyParams` document,
and runtime quality policy.

Three user-facing Labs edit the shared system without overlapping ownership:

- **Cloud Shader Lab** edits cloud shape treatment, erosion, density, lighting,
  fade, cirrus, haze, and placement-free hero-cloud recipes.
- **Sky Shader Lab** edits clear-air atmosphere, sky palette, sun, moon, stars,
  and god-ray appearance.
- **Sky & Cloud Lab** edits procedural field generation, shell placement, wind,
  scene state, quality, shadows, and the complete shared document.

All three read and write normalized portable parameters. Current time, weather,
camera, preview lighting, and scene placement remain runtime or preview state.

## Technical basis

The implementation follows published volumetric-cloud literature, including
Schneider and Vos's Nubis work, Hillaire's physically based atmosphere work,
Bruneton–Neyret scattering, Preetham/Hošek–Wilkie sky models, and Quílez noise
constructions.

## What makes a production cloud image work

The pipeline is consistent with the published production recipe in
[Guerrilla's Nubis work](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes-with-the-decima-engine)
and public implementations such as [Meteoros](https://github.com/AmanSachan1/Meteoros): the good
image is a pipeline, not one clever noise function.

1. **A weather map organizes the sky.** A low-frequency 2D field decides where kilometre-scale
   systems exist and which vertical cloud profile they use. It must remain continuous;
   thresholding it into a binary mask extrudes flat 2D islands through the whole cloud shell.
2. **Perlin-Worley supplies connected 3D bodies.** The packed R channel follows Guerrilla's
   published `remap(perlin, 1 - worley, 1, 0, 1)` construction. G/B/A carry successive
   inverted-Worley FBMs at the companion generator's 8/16/32, 16/32/64 and 32/64 cell
   ladders; the Perlin body uses its published three octaves from frequency 8. At render time
   those channels dilate the base body with the exact
   companion-generator expression `remap(base, -(1 - lowFreqFbm), 1, 0, 1)` before coverage is
   applied. The Perlin-Worley texture bake and this runtime dilation are two different remaps.
3. **Height is a three-profile weather field, not a two-shape crossfade.** Guerrilla's
   [2017 density-model slides](https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf)
   define weather type 0,
   0.5 and 1 select stratus, stratocumulus and cumulus respectively. Each profile is a
   four-breakpoint bottom/top gradient, and the breakpoints are blended with triangular
   weights before the height function is evaluated. This preserves the published middle
   profile and produces broad fair-weather masses instead of interpolating directly from
   a thin slab to a tower.
4. **A second 3D field erodes only the boundary.** Higher-frequency Worley detail and curl warp
   carve the potential surface after the base field and coverage establish the body. Applying that
   detail to the whole volume destroys the dense core; omitting it leaves smooth foam blocks.
5. **Lighting integrates a medium.** View transmittance uses Beer-Lambert over the actual step;
   six light samples estimate self-shadowing; phase functions create forward scatter and silver
   lining; powder/multiple-scattering approximations keep the core from reading as soot. Ambient
   and ground bounce fill, but must not replace directional structure.
6. **The atmosphere and clouds share one sun.** Rayleigh/Mie sky radiance, sun transmittance,
   cloud light colour, aerial perspective, moonlight, environment lighting, cloud shadows and god
   rays all derive from the same celestial state. Independent gradients and tints cannot stay
   coherent from noon through sunset.
7. **Temporal reconstruction buys enough samples.** The primary ray still uses a fixed 128-step
   budget; quality tiers reduce the number of pixels marched and reconstruct history. A prettier
   density function cannot compensate for under-sampling or unstable reprojection.

### Rendering failure modes

Avoid these rendering failure modes when evaluating or extending the cloud system:

- A binary weather column mask gives clouds vertical walls inherited from a 2D contour.
- The base-volume baker must use Guerrilla's published
  `remap(perlin, 1 - worley, 1, 0, 1)` construction rather than the alternate
  `remap(perlin, 0, 1, worley, 1)` interpretation. A deterministic fixture verifies it.
- Applying coverage as a hard threshold and multiplying again flattens the field. Use the
  continuous weather value as the lower bound of a remap, so coverage grows and densifies an
  existing 3D body.
- Omitting the vertical envelope from low-frequency density turns the shell into extruded noise.
  Apply it before coverage, with cloud type choosing its shape.
- Arbitrary cirrus normalization can drive the mask to zero at real camera-to-layer distances.
  Project the ray to the cirrus plane, sample world XZ at `cirrus.scale`, and
  fade only near the horizon.
- Using height-faded density as the powder occupancy signal classifies every cloud crown as an
  edge. Occupancy uses the covered base body without the vertical envelope; density still
  carries the envelope for extinction.
- Coverage near one and excessive ambient fill produce overcast sheets and bleached storms.
  Evaluate preset values against rendered captures rather than compensating for a broken field.

Stylization is applied deliberately over these stable physical signals through
quantized light bands, authored ramps, edge accents, and simplified atmosphere.
It does not replace coherent volume geometry, transmittance, or celestial lighting.

## Runtime requirements

- `three@^0.185.1` (declared; reference requires r185+).
- TSL only — `three/webgpu` node materials + `three/tsl`. `src/core/shaderBackend.js` already
  pins the project to `tsl`, and `WebGPURenderer` covers both the WebGPU and forced-WebGL2
  backends, which is how dual-backend parity is achieved.
- The Labs provide their own renderer, store, schema controls, preview scene,
  persistence, and export UI. Library users provide the renderer, scene,
  camera, frame loop, and current world state.

## Architecture

```
src/cloud/                        volumetric cloud subsystem
  index.js                       barrel (public API surface, exports './cloud')
  cloudParams.js                 6 param groups: shape/lighting/wind/cirrus/haze/fade
  cloudVolume.js                 the raymarcher (TSL node material)
  cloudLighting.js               scattering: Beer-Lambert, powder, HG phase, MS octaves
  cloudReprojection.js           temporal reconstruction (cloudHistoryDiv)
  noise/baseShapeVolume.js       Perlin-Worley 3D base shape, 16³/32³/64³
  noise/erosionVolume.js         high-frequency Worley detail volume
  noise/weatherMap.js            2D FBM coverage map + WeatherMapProfile
  noise/curlNoise.js             wispy edge distortion
  noise/cirrusMap.js             anisotropic 2D veil/fibre mask for the high deck

src/sky/                         atmosphere, celestial, compositing (extends existing module)
  skySystem.js                   top-level orchestrator
  skyPresets.js                  the 8 presets
  skyQualityTiers.js             4 tiers (exact table below)
  atmosphereParams.js            atmosphere param group
  atmosphereScattering.js        Rayleigh+Mie precomputed transmittance/scattering LUTs
  atmosphereDome.js              sky dome material + sun disc
  sunDriver.js                   sun/moon direction, intensity fade, driven uniforms
  timeOfDay.js                   day/night clock, latitude/azimuth arcs, moon phase
  nightSky.js                    star panorama + moon disc with phase shading
  cloudShadow.js                 top-down shadow bake + cloudShadow(worldPos) TSL node
  godRays.js                     crepuscular ray post stage
  skyEnvironment.js              live equirect env-map bake
  skyFog.js                      aerial-perspective distance fog
  renderLayers.js                RenderLayer + placeInLayer
```

`SkyParams` is the serialized preset schema and the contract between labs and runtime:

```js
{ atmosphere, sun, time, cloud: { shape, lighting, wind, cirrus, haze, fade, style }, noise, godRays, nightSky }
```

The `atmosphere` block contains its physical fields plus the optional nested `style` block.

### Module ownership (one definition per param group)

Each parameter group has one definition so `export *` barrels cannot produce
conflicting exports:

| Group | Sole owner |
| --- | --- |
| `cloud.{shape,lighting,wind,cirrus,haze,fade}` | `src/cloud/cloudParams.js` |
| `cloud.style` and its optional modules | `src/cloud/cloudStyle.js` |
| `atmosphere` | `src/sky/atmosphereParams.js` |
| `atmosphere.style` and its optional sky-colour modules | `src/sky/skyColor.js` |
| `sun` | `src/sky/sunDriver.js` |
| `time` (incl. the nested `moon` block) | `src/sky/timeOfDay.js` |
| `godRays` | `src/sky/godRays.js` |
| `nightSky` | `src/sky/nightSky.js` |
| `noise` | `src/cloud/noise/weatherMap.js` (profile) + `skyQualityTiers.js` (`baseShapeDims`) |
| The `SkyParams` envelope — validate/serialize/round-trip | `src/sky/skyParams.js` |

A module that needs another group's defaults **imports** them; it must not re-declare them. No
symbol may be exported from two files that both feed a barrel.

### Colour representation

Live parameter objects hold `THREE.Color` in **linear** RGB. Serialized documents
(presets, Lab JSON, localStorage) hold `[r, g, b]` number triples so
they stay plain JSON. The schema layer converts at the boundary — nothing else should.

## Parameter reference

Every parameter below is from the reference's public docs: name, default, unit. Reproduce these
names, defaults, and units exactly — they are the compatibility surface.

`cloud.style` and `atmosphere.style` are the additive ToonLab V2 surfaces and are documented
separately below. They must never change these physical defaults; disabling both master switches
is the preserved V1 result.

### cloud.shape

| Param | Default | Unit |
| --- | --- | --- |
| `altitude` | 1400 | m (cloud base above ground) |
| `thickness` | 2800 | m (shell height above altitude) |
| `coverage` | 1.0 | — (0 clears sky, 1 uses full coverage map) |
| `density` | 0.048 | 1/m (light blocked per metre) |
| `baseScale` | 8000 | m (shape-noise repeat) |
| `baseStrength` | 1.0 | — (swells tops, bases fixed) |
| `weatherScale` | 40000 | m (coverage-map repeat) |
| `erosionScaleBaseMultiplier` | 0.5 | — (detail size rel. baseScale, 0–1) |
| `erosionShape` | 0.0 | — (0 billowy/cauliflower, 1 torn/wispy) |
| `erosionStrengthBase` | 1.0 | — (carve at cloud bottom, 0–5) |
| `erosionStrengthPeak` | 1.0 | — (carve at cloud top, 0–5) |
| `edgeSoftness` | 0.05 | shell height fraction |
| `edgeSoftnessFalloff` | 1.0 | 1/km (tightens softness with height) |
| `baseWeatherStrength` | 0.0 | — (eats thin cloud bottoms) |
| `baseWeatherHeightStart` | 0.05 | shell height fraction |
| `baseWeatherHeightEnd` | 0.1 | shell height fraction |
| `horizonCoverageAmount` | 0.0 | — (banks cloud on horizon, may exceed 1) |
| `horizonCoverageStart` | 10000 | m |
| `horizonCoverageRamp` | 20000 | m |

### cloud.lighting

| Param | Default | Unit |
| --- | --- | --- |
| `scatteringAlbedo` | 0.9 | — (light surviving each bounce) |
| `powderStrength` | 1.0 | — (darkens thin sunlit edges) |
| `ambientIntensity` | 0.6 | — (skylight fill) |
| `groundBounceAlbedo` | Color(0.18, 0.17, 0.15) | linear RGB |
| `baseShadowStrength` | 0.0 | — (darkens cloud bottoms) |
| `baseShadowHeight` | 0.6 | shell height fraction |
| `moonGain` | 1.0 | — (moonlight on cloud edges) |

### cloud.wind

| Param | Default | Unit |
| --- | --- | --- |
| `heading` | 0 | degrees (0 = +Z, 90 = +X) |
| `speed` | 0 | m/s (drift) |
| `evolutionSpeed` | 0 | m/s (shape churn; independent of drift) |
| `skew` | 0 | m (tops lean downwind of bases) |

`heading`, `speed`, `evolutionSpeed` are plain numbers; `skew` is a uniform. `wind.advance(dt)`
integrates and refreshes read-only `direction`, `offset`, `evolutionOffset` uniforms.

### cloud.cirrus / cloud.haze / cloud.fade

| Param | Default | Unit |
| --- | --- | --- |
| `cirrus.scale` | 30000 | m (texture repeat) |
| `cirrus.strength` | 0.0 | — (0 hides) |
| `haze.density` | 0.0 | — (storm haze driven by coverage, not texture) |
| `haze.scale` | 40000 | m |
| `fade.hazeDensityScale` | 1.0 | — (1 = real atmosphere) |
| `fade.horizonMeltStart` | 25000 | m |
| `fade.horizonMeltEnd` | 40000 | m |
| `fade.maxMarchDist` | 42000 | m — **derived, read-only**, always `horizonMeltEnd + 2000` |

`applyParams` must clamp `horizonMeltEnd >= horizonMeltStart`.

### cloud.style (optional V2 modules)

`cloud.style.enabled` is the master bypass and defaults to `false`. Every module also owns an
independent `enabled` switch. All switches are live uniforms: toggling a module does not rebuild
the cloud shader or change the physical cloud parameters.

V2.0 adds the `tone` module:

| Param | Default | Unit |
| --- | --- | --- |
| `enabled` | false | bool |
| `amount` | 1.0 | — |
| `tone.enabled` | false | bool |
| `tone.shadowColor` | Color(0.18, 0.30, 0.52) | linear RGB |
| `tone.midColor` | Color(0.56, 0.71, 0.90) | linear RGB |
| `tone.lightColor` | Color(1.00, 0.96, 0.86) | linear RGB |
| `tone.shadowPoint` | 0.16 | — |
| `tone.lightPoint` | 0.46 | — |
| `tone.softness` | 0.08 | — |
| `tone.shadowLift` | 0.12 | linear radiance |
| `tone.highlightCompression` | 0.12 | — |
| `tone.brightness` | 1.05 | — |

The physical in-scatter still determines form and lighting. The tone module uses its luminance to
select an authored shadow, midtone and highlight colour, then writes linear HDR radiance back into
the existing atmosphere, exposure and bloom pipeline.

V2.2 adds the independent `blueShadow` module:

| Param | Default | Unit |
| --- | --- | --- |
| `blueShadow.enabled` | false | bool |
| `blueShadow.color` | Color(0.08, 0.28, 0.68) | linear RGB |
| `blueShadow.amount` | 0.65 | — |
| `blueShadow.range` | 0.36 | — |
| `blueShadow.softness` | 0.14 | — |

The physical pre-tone luminance selects the affected shadow range. The blue colour is normalized
back to the existing cloud luminance before blending, so it exaggerates ambient skylight hue
without replacing self-shadowing, flattening the light march, or tinting bright sun-facing forms.

V2.3 adds the independent `shadowWash` module:

| Param | Default | Unit |
| --- | --- | --- |
| `shadowWash.enabled` | false | bool |
| `shadowWash.lift` | 0.32 | linear radiance |
| `shadowWash.detail` | 0.40 | — |
| `shadowWash.blend` | 0.16 | — |

The wash runs once on the accumulated cloud colour after the volume march. `lift` sets the pale
underside value, `detail` retains or suppresses the original lighting variation, and `blend`
softens the transition into the bright cloud body. It uses `blueShadow.range` to select the same
underside region, but its own switch works whether the blue-hue module is enabled or bypassed.
Density, transmittance and the physical light march remain unchanged.

V2.4 adds the independent `innerPaint` module:

| Param | Default | Unit |
| --- | --- | --- |
| `innerPaint.enabled` | false | bool |
| `innerPaint.amount` | 1.00 | — |
| `innerPaint.edgeKeep` | 0.22 | resolved opacity |
| `innerPaint.edgeBlend` | 0.28 | resolved opacity |

The physical volume march continues to own density, transmittance and the visible silhouette.
`edgeKeep` leaves low-opacity wisps and contours completely physical, while `edgeBlend` makes a
soft transition into the painted shadow wash on opaque interior pixels. `amount` controls only
that interior colour blend. The module never changes coverage, erosion, extinction or shadows.

V2.5 adds the independent `whiteTop` module:

| Param | Default | Unit |
| --- | --- | --- |
| `whiteTop.enabled` | false | bool |
| `whiteTop.color` | Color(1.00, 0.98, 0.92) | linear RGB |
| `whiteTop.amount` | 1.00 | — |
| `whiteTop.area` | 0.62 | — |
| `whiteTop.softness` | 0.14 | — |
| `whiteTop.detail` | 0.35 | — |

The physical march accumulates a colour-only descriptor from sample height and
sun reach. `area` expands the clean upper region, `softness` controls its
transition into the cloud middle, and `detail` decides how much physical light
variation survives inside the authored warm white. The final blend reuses the
V2.4 opacity boundary, so thin edges, density, transmittance, and the cloud
shadow field remain unchanged.

V2.6 adds the independent `lightBlend` module:

| Param | Default | Unit |
| --- | --- | --- |
| `lightBlend.enabled` | false | bool |
| `lightBlend.bottomColor` | Color(0.28, 0.50, 0.82) | linear RGB |
| `lightBlend.middleColor` | Color(0.68, 0.84, 0.98) | linear RGB |
| `lightBlend.amount` | 0.50 | — |
| `lightBlend.balance` | 0.16 | — |
| `lightBlend.softness` | 0.14 | — |
| `lightBlend.detail` | 0.65 | — |

The same physical sunlit-height descriptor selects a cool bottom and pale-blue
middle. The exact V2.5 White Top mask excludes its bright region from this
additional tint. `balance` positions the lower colour split, `softness` widens
that transition, and `detail` preserves the existing physical cloud colour.
The blend is daylight-gated and reuses the V2.4 opacity boundary, so it cannot
change density, coverage, transmittance, shadows, or the visible contour.

### atmosphere

| Param | Default | Unit |
| --- | --- | --- |
| `rayleigh` | 1.0 | — (0–3; 1 = Earth) |
| `turbidity` | 3.3 | — (1 clear … 15 smog) |
| `mieDirectionalG` | 0.7 | — (0–0.999; degenerates at 1) |
| `mieScatteringStrength` | 1.0 | — (0–2, halo brightness only) |
| `multipleScattering` | 0.2 | — (clouds; applied as `1 + this`) |
| `skyMultipleScattering` | 0.5 | — (sky dome horizon brightness) |
| `exposure` | 1.0 | — (0.05–5; post chain applies it, not `applyTo`) |
| `groundAlbedo` | Color(0.18, 0.17, 0.15) | linear RGB (sky dome only) |
| `fogDensity` | 1.25 | — (1 ⇒ half-fade near 23 km; 0 off) |
| `fogFarFadeStart` | 1000000 | m |
| `fogFarFadeEnd` | 1100000 | m |

`rayleigh`, `turbidity`, `groundAlbedo` re-bake the scattering LUTs; everything else is per-frame.

### atmosphere.style (optional V2 modules)

`atmosphere.style.enabled` is the master bypass and defaults to `false`. The `palette` module also
owns its own live switch, so sky colour can be enabled, disabled, or tuned without rebuilding the
physical atmosphere or changing cloud styling.

V2.1 adds the `palette` module:

| Param | Default | Unit |
| --- | --- | --- |
| `enabled` | false | bool |
| `amount` | 1.0 | — |
| `palette.enabled` | false | bool |
| `palette.zenithColor` | Color(0.21, 0.57, 0.78) | linear RGB |
| `palette.horizonColor` | Color(0.66, 0.85, 1.00) | linear RGB |
| `palette.horizonBlend` | 0.14 | — |
| `palette.saturation` | 1.0 | — |
| `palette.contrast` | 1.0 | — |
| `palette.brightness` | 1.0 | — |

The physical atmosphere still supplies sun position, haze, scattering variation, and aerial
perspective. The palette compresses that radiance before moving it toward the authored
zenith-to-horizon gradient; disabling either switch restores the byte-stable physical path.

### sun

| Param | Default | Unit |
| --- | --- | --- |
| `elevation` | — | degrees (0 horizon, 90 zenith) |
| `azimuth` | — | degrees (0 = +Z, 90 = +X) |
| `intensity` | 6.6 | — (writes `peakIntensity`; brightness anchor for whole sky) |
| `color` | Color(1.0, 0.95, 0.85) | linear RGB (pre-atmosphere) |
| `discSize` | 0.0003 | — angular radius as `1 - cos θ` (≈1.4°, ~5× physical) |

`direction` is derived from elevation/azimuth. Per-frame `intensity` uniform = `peakIntensity`
scaled by a horizon fade; the driver overwrites it every frame.

### time (TimeOfDay)

| Param | Default | Unit |
| --- | --- | --- |
| `time` | 0.5 | — (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset; wraps) |
| `autoAdvanceSecondsPerDay` | 600 | s (0 pauses, which also frees `sun.direction`) |
| `latitude` | 45 | degrees (clamped −90…90) |
| `azimuth` | 0 | degrees (rotates sun+moon+stars together) |
| `moon.phase` | 0.5 | — (0 new, 0.5 full, 1 new; brightness only) |
| `moon.intensity` | 1.0 | — (master over disc, cloud key, sky ambient) |
| `moon.discBrightness` | 9.0 | — (disc only) |
| `moon.angularSize` | 0.0003 | — (`1 - cos θ`) |
| `moon.color` | Color(0.7, 0.78, 0.95) | linear RGB |
| `moon.ambient` | 0.015 | — (night ambient lift, 0–1) |

Sun rises due east at `time = 0.25`, peaks at `90° − |latitude|` — the transit swings to due north
in the southern hemisphere, so write the formula against `|latitude|`, never the raw value — sets
due west. No seasons. Moon
sits opposite the sun. Driven read-only uniforms: `moonDirection`, `skyDarkness`, `starRotation`,
`moonPhaseIllumination`, `moonPhaseTrig`. All three moonshine terms scale with lit fraction.

### godRays

| Param | Default | Unit |
| --- | --- | --- |
| `enabled` | true | bool (also set by tier) |
| `strength` | 2.0 | — (0–8, soft-clipped) |
| `sharpness` | 2.0 | — (1–16, gamma on visibility) |
| `extinction` | 0.0002 | 1/m (0–0.001; denser ⇒ shorter) |
| `maxDistance` | 12500 | m (1000–20000) |
| `moonGodRayScale` | 0.4 | — (0–1) |
| `steps` | 24 | — uniform, **not** a params field; tier-driven |

Tint follows the active light — no colour control. Shafts fade at the cloud-shadow box edge.

### noise (procedural generation — preset-tunable)

```js
noise: { weather: { resolution: number, profile: WeatherMapProfile } }
```

Applying it triggers a CPU FBM regeneration. Only the weather map is preset-tunable; the base
shape volume is tier-driven via `baseShapeDims`.

### nightSky

`{ intensity: 0.3 }` — panorama brightness, calibrated for exposure 1.0. Star texture is
**supplied by the host**, not bundled; omit it and the night sky renders black.

### cloudShadow (via `sky.pipeline.cloudShadow`)

| Knob | Default |
| --- | --- |
| `resolution` | tier-driven, 128–1024 |
| `extent` | 4000 m half-width (8 km box centred on camera) |
| `intensity` | 1.0 |
| `mipLevel` | tier-driven, 1–3 |
| `lightSteps` | 8 |
| `bakeInterval` | 1 frame |
| `enabled` | tracks `clouds.enabled` |

Returns 0..1 sun transmittance; 1 outside the footprint. Multiply into the **direct** sun term
only, never ambient. Follows the moon after sunset. One bake feeds both ground shadows and god
rays.

## Quality tiers

March budgets are **fixed for every tier**: **128 primary steps, 6 light steps**. Tiers scale how
many *rays* are marched (`cloudHistoryDiv`), not the steps per ray.

| Field | low | medium | high | ultra |
| --- | --- | --- | --- | --- |
| `cloudHistoryDiv` | 4 | 2 | 2 | 2 |
| `cloudShadowResolution` | 128 | 256 | 512 | 1024 |
| `cloudShadowMipLevel` | 3 | 2 | 2 | 1 |
| `godRaysEnabled` | false | true | true | true |
| `godRaySteps` | 16 | 16 | 24 | 24 |
| `envMapEnabled` | true | true | true | true |
| `envMapClouds` | false | true | true | true |
| `envMapWidth` | 256 | 384 | 512 | 1024 |
| `envMapHeight` | 128 | 192 | 256 | 512 |
| `envMapMarchSteps` | 24 | 32 | 48 | 64 |
| `envMapMipBase` | 3 | 2 | 1 | 1 |
| `weatherMapResolution` | 256 | 512 | 1024 | 1024 |
| `baseShapeDims` | 16³ | 32³ | 64³ | 64³ |

`high` is the default. The cloud image renders at screen ÷ `cloudHistoryDiv` and upscales, so
each step up quarters the work.

**Mip semantics.** three.js r185 cannot build a 3D mip chain on the WebGPU backend, so
`cloudShadowMipLevel` and `envMapMipBase` are served by generating a coarser *volume* rather than
by sampling a mip. Two rules keep that substitution honest:

- The level is **relative to the 64³ master plan**, not to the tier's already-reduced
  `baseShapeDims`. Applying a level-3 shift on top of a 16³ tier volume yields 2³ — eight texels,
  with the three erosion channels collapsed to one band — which is not a cloud field.
- Floor every resolved volume at **8³** and warn when the requested level had to be clamped.
  Silent degeneration to an unusable field is worse than an honest clamp. Env-map defaults when built directly: `width` 384,
`cloudMarchSteps` 16, `cloudMipBase` 0, `skipFrames` 4.

## Presets

Eight presets, keyed exactly as below. Each is a fully-specified `SkyParams` — applying one
**fully replaces** sky state. Presets are look-only: they never touch the quality tier, march
budgets, or env-map bake config, but they *do* carry `godRays.enabled` and the weather-map
resolution.

| Key | Label | Character (from the docs + captured frame) |
| --- | --- | --- |
| `partlyCloudy` | Partly Cloudy | Scattered fair-weather cumulus, high midday sun. **Startup default.** |
| `stunningSunset` | Stunning Sunset | Low sun, broad warm Mie aureole, deep cumulus deck. |
| `thunderstorm` | Thunderstorm | Heavy overcast, towering storm deck, very low light. |
| `stormyEvening` | Stormy Evening | Tall storm deck under low warm sun, thick horizon coverage, dense grey haze. |
| `moonlitNight` | Moonlit Night | Night sky, lit moon, dim moonlit clouds. |
| `fluffy` | Fluffy | High midday sun, soft low-density cumulus, crisp billows. |
| `hazy` | Hazy | Thick atmospheric haze under a high sun, muted washed-out horizon. |
| `pixar` | Pixar | High midday sun, tall dense bright-white cumulus, soft rounded storybook edges. |

## Lab responsibilities

The shared document exposes all six cloud groups on one object. The Labs split
them by what the user is editing.

### cloud-shader-lab — cloud look & hero-cloud recipes

Everything that changes how a given cubic metre of cloud shades, plus the atmospheric treatment
of the cloud image:

- **Density & optics:** `shape.density`, `shape.baseStrength`
- **Erosion character:** `shape.erosionShape`, `shape.erosionStrengthBase`,
  `shape.erosionStrengthPeak`, `shape.erosionScaleBaseMultiplier`
- **Edge treatment:** `shape.edgeSoftness`, `shape.edgeSoftnessFalloff`
- **All of `lighting`:** `scatteringAlbedo`, `powderStrength`, `ambientIntensity`,
  `groundBounceAlbedo`, `baseShadowStrength`, `baseShadowHeight`, `moonGain`
- **All of `fade`:** `hazeDensityScale`, `horizonMeltStart`, `horizonMeltEnd` (+ derived
  `maxMarchDist` shown read-only)
- **All of `cirrus`** and **all of `haze`**
- **Scattering coupling:** `atmosphere.multipleScattering`
- **Cost controls (read-only display + override):** `cloudHistoryDiv`, primary/light step counts
- **Hero-cloud authoring:** placement-free top-down footprint doodle, broad dimensions,
  development, edge softness, breakup, seed, normalized JSON import/export, and a physical
  volumetric preview. Position, rotation, terrain masking, collision, and scene placement are
  deliberately not serialized.

The Preview tab provides a two-state user comparison: **Physical volume** bypasses only the
optional cloud stylization modules, while **Stylized result** applies the authored treatment. The
density field, lighting setup, camera, weather context, and exposure remain fixed between them.

### sky-lab — atmosphere & celestial appearance

Everything that changes the visible clear-air sky and celestial treatment:

- physical atmosphere except cloud-medium `multipleScattering`;
- daylight, morning, evening, and night sky palettes;
- sun and moon appearance;
- host-supplied night panorama intensity and stylized star-field extraction;
- god-ray appearance.

Clouds remain visible as review context, but cloud shape and shading controls are not exposed here.

### sky-cloud-lab — procedural generation & world integration

Everything that decides *where cloud exists* and what the sky around it is doing:

- **Shell geometry:** `shape.altitude`, `shape.thickness`
- **Coverage field:** `shape.coverage`, `shape.weatherScale`, `shape.baseScale`
- **Weather-map generation:** `noise.weather.resolution`, `noise.weather.profile`, seed
- **Base-shape volume generation:** `baseShapeDims`, seed, regeneration trigger
- **Bottom carving:** `shape.baseWeatherStrength`, `baseWeatherHeightStart`, `baseWeatherHeightEnd`
- **Horizon banking:** `shape.horizonCoverageAmount`, `horizonCoverageStart`, `horizonCoverageRamp`
- **All of `wind`:** `heading`, `speed`, `evolutionSpeed`, `skew`
- **Scene clock and celestial bearing:** the runtime portions of `sun` and `time`
- **Integration controls:** weather context, quality tier, comparison camera/light, cloud-shadow
  coordination, and the complete `SkyParams` round-trip

All three labs read and write the same `SkyParams` document, so a preset edited in any workspace
remains complete and round-trips through `toParams()`. Each route stores its camera, light,
weather, quality, and comparison preferences separately so review setup does not leak between
workspaces. Fixed comparison lighting is applied only while rendering; it is never written into
the shared authored `sun` or `time` blocks.

## Validation commands

Users who modify the Sky or Cloud implementation can run the focused checks:

1. `node scripts/verify-cloud-shader.mjs` — param schema, defaults, units, clamping, round-trip
   `applyParams`/`toParams` identity, preset completeness.
2. `node scripts/verify-sky-cloud-lab.mjs` — procedural generation determinism (same seed ⇒ same
   weather map), lab store round-trip.
3. `node scripts/verify-public-api.mjs` — `./cloud` and `./sky` barrels, preset keys, tier table.
4. **Visual quality.** Render each preset at fixed framing and compare wide and
   close-up views for coherent shape, lighting, atmosphere, and temporal stability.

Visual parity is the gate. Schema tests passing while the render looks wrong is a failure.
