# Cloud shader

`@call-me-sensei/toonlab/cloud` defines the reusable appearance of a
**raymarched volumetric cloud deck**. Cloud Shader is an independent
style-bundle domain. It is not a sky-gradient preset, weather condition,
generated cloud asset, cloud-shadow field, or preview-scene configuration.

See [Sky and cloud parameter reference](sky-cloud-parameters.md) for the exact
field tables, quality tiers, rendering model, and shared Lab responsibilities.

## Profile versus generated fields

The cloud parameters and the fields they sample are separate artifacts.

The parameters own the reusable treatment: shell geometry, coverage response,
erosion character, edge treatment, scattering, drift, and aerial perspective.
The system generates or the host supplies:

- the 3D base-shape, erosion, and curl volumes, and the 2D weather map — all
  procedurally generated from a seed and a `WeatherMapProfile`;
- the procedural 2D cirrus mask (a host may override the generated texture);
- time, weather, fog, precipitation, camera, and scene lighting.

This separation lets one cloud treatment be reviewed against multiple generated
fields without embedding licensed or project-local asset paths in a portable npm
document.

## Exact ownership

The core cloud schema has 38 fields in six groups (37 authored and one
derived read-only field), published as
`CLOUD_PARAM_GROUPS` plus `CLOUD_PARAMS_FIELD_SCHEMA`:

| Group | Fields |
| --- | --- |
| Shape | Shell altitude and thickness; coverage, density, base and weather scales; erosion scale, shape and strengths; edge softness and falloff; bottom carving; horizon banking |
| Lighting | Scattering albedo, powder, ambient fill, ground-bounce albedo, base shadow, moon gain |
| Wind | Heading, drift speed, evolution speed, shear skew |
| Cirrus | Scale and strength of the thin high deck |
| Haze | Storm-haze density and scale, driven by coverage rather than a texture |
| Fade | Aerial-perspective scale, the horizon melt window, and the derived march ceiling |

`fade.maxMarchDist` is derived and read-only: it is always `horizonMeltEnd`
plus 2000 m. Supplying it is reported and replaced, never stored.

The two labs split those groups by *what the author is deciding*. Cloud Shader
Lab owns the per-pixel look — density, erosion character, edge treatment, all of
`lighting`, all of `fade`, all of `cirrus` and `haze`, plus
`atmosphere.multipleScattering`. Sky & Cloud Lab owns where cloud exists and
what the sky around it is doing. Every visible Lab control must update the
corresponding renderer uniform. The Lab must not show disabled placeholders or
preview controls that do not affect the active renderer.

Cloud Shader does **not** own:

- sky zenith, horizon, or below-horizon colour;
- sun, moon, or star rendering;
- time of day or the selected clock hour;
- current weather, rain, snow, hail, lightning, dust, or fog;
- the seed, weather profile, or volume dimensions behind the generated fields;
- backend selection, camera, terrain, or preview framing;
- world placement, transforms, physics, collision, or walkable cloud proxies;
- the world-projected cloud-shadow field.

The visible cloud deck and world-projected cloud shadows come from the same
density field, but the top-down shadow bake is a separate stage with its own
resolution, extent, and mip level. Weather may temporarily modulate scene
response without rewriting the authored cloud parameters.

## Altitude and terrain interaction

The current runtime renders one lower volumetric shell, whose base altitude and
thickness are authored in the Shape group, plus an independent high cirrus
deck. Moving the shell supports a different global cloud height. Multiple local
cumulus layers and independently transformed cloud bodies are not yet part of
the portable document.

Clouds are participating media, so terrain interaction is not defined as rigid
collision. Opaque scene depth covers the far cloud backdrop, while a future
terrain-aware density mask may thin cloud inside solid mountains or form local
mist around slopes. The default backdrop uses carrier depth. For opaque
geometry intersections, `SkySystem.setSceneDepthTexture(texture)` opts into
depth-clipped cloud integration. Supply a nearest-filtered FloatType or
HalfFloatType color texture with `NoColorSpace`: R stores positive view-space
distance in metres, not hardware depth. Render it with the same perspective
camera before `sky.update()`, excluding sky and transparent surfaces; clear it
to 65000 or larger. Geometry below 64000 m can terminate the cloud march. The
host owns this prepass and texture; pass null to restore default behavior.
Clouds in front of geometry then composite over it, with opaque-depth changes
rejecting temporal history. Thin boundaries remain limited by reconstruction
resolution; this does not replace a terrain density mask or model transparent
volumetric intersections.

The lab's `/cloud-shader-lab/?capture=1&occlusion=1` QA fixture demonstrates
near, intersecting, and distant opaque cards. It disables world-rim fog only
for this diagnostic stage. Add `renderer=webgl` to qualify the fallback.

The Cloud Shader Lab includes a **Hero Cloud** authoring surface. The author
draws a top-down footprint; that mark becomes the broad weather-map column
field, while the normal 3D base shape, erosion, density integration, physical
light march, and temporal reconstruction produce the rendered volume. The
doodle is therefore a shape constraint, not a cloud sprite, side silhouette, or
literal extrusion.

Its `toonlab/hero-cloud-recipe` v1 JSON stores the seed, normalized footprint
strokes, diameter, vertical growth, development, softness, and breakup. It does
not store world position, rotation, base altitude, terrain collision, gameplay
collision, or navigation. The lab uses a fixed review altitude only to make the
recipe visible. The host scene remains responsible for placing a future local
instance because only it knows the mountain, camera, and composition.

The current runtime can preview or directly consume the baked coverage field:

```js
import {
  createHeroCloudRecipe,
  createHeroCloudWeatherTexture,
  heroCloudSkyOverrides,
} from '@call-me-sensei/toonlab/cloud';

const recipe = createHeroCloudRecipe(savedRecipe);
const weatherMap = createHeroCloudWeatherTexture(recipe);
sky.setCloudWeatherTexture(weatherMap);

// These are partial review overrides for the existing cloud shell. Merge them
// into the host's SkyParams before applyPreset().
const previewOverrides = heroCloudSkyOverrides(recipe);

// The caller created the texture and therefore disposes it after clearing it.
sky.setCloudWeatherTexture(null);
weatherMap.dispose();
```

This override path uses a padded, periodically sampled weather map inside the
existing shell. It is sufficient for authoring and inspecting one isolated
form, but it is not yet a placed local-volume runtime. Independent transforms
and optional terrain-density masks remain separate placement/integration work.

## Parameters and documents

```js
import { CLOUD_PARAM_GROUPS, createCloudParams } from '@call-me-sensei/toonlab/cloud';
import { SkySystem, createSkyParamsDocument } from '@call-me-sensei/toonlab/sky';

// Live parameters, for a host driving the raymarcher directly. Uniform-backed
// fields expose a TSL node the marcher reads; plain-number fields are assigned.
const clouds = createCloudParams({
  shape: { coverage: 0.55, density: 0.061, erosionShape: 0.4 },
  lighting: { powderStrength: 0.7, scatteringAlbedo: 0.82 },
});
clouds.update(1 / 60);              // integrates wind, refreshes derived fade
const params = clouds.toParams();   // reads every field back, derived included

// Or the whole sky at once. applyPreset FULLY REPLACES sky state: anything the
// document leaves out falls back to the schema default, not to what is on
// screen. toParams() is its inverse.
const sky = await SkySystem.create({ renderer, scene, camera, quality: 'high' });
await sky.applyPreset({ cloud: params });

const document = createSkyParamsDocument('soft_layered_clouds', {
  label: 'Soft Layered Clouds',
  params: { cloud: params },
});
```

Documents use `type: "toonlab/sky-params"` and version `6`. A partial document
is completed to every field on validation. Unknown parameters are ignored with
warnings, numeric fields clamp to the published schema and say so, and colours
serialize as linear `[r, g, b]` arrays while live parameters hold `THREE.Color`.
The schema layer converts at that boundary and nothing else does.

The OSS package does not require a database. A project may commit the JSON,
store it in its own configuration, or reference a registered style from a
style bundle. Hosted persistence and collaboration are optional host services.

```js
import { createStyleBundleDocument } from '@call-me-sensei/toonlab/styles';

const bundle = createStyleBundleDocument('project-look', {
  slots: {
    sky: { style: 'call_me_sensei' },
    cloud: { document },
    weather: { style: 'call_me_sensei' },
  },
});
```

The `cloud` slot accepts either `{ style }` or an inline `toonlab/sky-params`
document, and resolves to the `cloud` block alone — sun, time, and atmosphere
are world state, not art direction. It stays independent from `sky` and
`weather` so developers can mix them deliberately. Until the eight sky presets
land there is no named cloud style to select, so a `{ style }` payload resolves
to the schema defaults and records the identity it was given.

## Cloud Shader Lab review contract

Cloud Shader Lab lives at `/cloud-shader-lab/` and its default view must show
the volumetric cloud deck against the atmosphere as the dominant image. It must
not start on terrain, primitive test objects, fog, precipitation, or a weather
condition.
Cloud Shader Lab must never route into Atmospheric Condition Lab; conditions
are optional preview stress tests, not cloud shader documents.

The default preview rules are:

- the raymarched deck lit by the Rayleigh+Mie atmosphere;
- sky and clouds visible together, horizon at roughly 62% of frame height;
- cloud-focused camera tilted above the horizon;
- no terrain in Cloud Focus;
- every field this lab owns live, none of Sky & Cloud Lab's;
- Dawn, Day, Sunset, Night, and continuous time as preview-only inputs;
- weather-condition stress testing explicit and optional.
- a fixed **Physical volume / Stylized result** comparison that changes only
  the optional cloud treatment, never the density field, camera, weather, or
  exposure;
- no internal regression modes in the user controls;
- a Hero Cloud tab for doodle-to-volume authoring, normalized recipe JSON, and
  physical preview. The recipe never stores scene placement or collision.

Changing time must visibly tint and attenuate the sky/cloud context without
changing the saved cloud parameters. Selecting weather is a stress test, not a
style choice.

Cloud Lab owns cloud density/optics, erosion, edges, light transport, fade,
cirrus, haze, cloud-medium scattering coupling, cloud stylization, and the
placement-free hero-cloud recipe. Shell altitude, global coverage, wind, and
procedural weather-field generation live in Sky & Cloud Lab; atmosphere and
celestial look live in Sky Lab.

Cloud Shader Lab is one of the 15 live user-facing Labs. Save the shared
`toonlab/sky-params` document for reuse, and keep preview time, camera,
lighting, weather stress tests, and comparison layout out of the artifact.

## Cloud performance and motion

Cloud history compensates for wind translation even with a stationary camera.
Evolution activates history clamping and opacity confidence rather than being
treated as rigid motion. Camera projection changes and large field jumps reset
history. The fixed 128-primary/6-light march budget remains unchanged.

`sky.cloudShadowsEnabled` defaults to true. A host can set it to false when
there are no cloud-shadow receivers. This disables the receiver bake without
disabling visible clouds or god rays. The empty sky/cloud lab stage uses this
policy; a populated scene should keep the authoritative shadow field enabled.

Noise caches retain at most 32 recent textures and 64 MiB of their CPU image
data across the cloud generators. Weak entries preserve identity for live host
references; eviction never disposes a borrowed texture. This bounds cache-owned
retention, not all live GPU memory, and reclamation after eviction depends on
garbage collection. Explicit disposal functions still dispose cached textures
and must only be called after consumers are finished. Cached base-shape volumes
share a canonical seed-0 texture and mip chain per resolution because their
bytes do not depend on the authored seed. Uncached creation functions retain
the requested seed metadata.

`?capture=1&profile=1` enables asynchronous GPU timestamp diagnostics and records
64 samples after warmup in `document.body.dataset.cloudProfile`. Unsupported
backends report GPU timing as unavailable; CPU submission time is recorded
separately. Nested render-pass timings must not be summed as independent costs.
The optional **Preserve billow detail** action in Stylization reduces interior
paint and increases retained white-top shading without changing density,
palette colors, or the saved system-style defaults.
