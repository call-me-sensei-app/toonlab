# Water

A modern anime-style stylized, interactive water system. Fully procedural — no
texture assets — with the whole wave spectrum mirrored on the CPU so physics
and rendering always agree.

Water materials and simulation passes are TSL-only. They run on native WebGPU
by default and on the TSL WebGL2 fallback with `?renderer=webgl`.

Water Lab authors one complete runtime-system preset. Its Surface, Foam, and
Lighting groups are the embedded water-shader controls; Waves, Ripples,
Splashes, and Quality own the coupled runtime behavior. ToonLab intentionally
does not split those values into a separate Water Shader Lab, which would
produce two documents with overlapping ownership. See
[Lab responsibilities](lab-architecture.md).

## Quickstart

```js
import { WaterSurface } from '@call-me-sensei/toonlab/water';
import { StylizedSky } from '@call-me-sensei/toonlab/sky';

const water = new WaterSurface({
  width: 200, depth: 200, preset: 'lake',
  // Enabled by default: a 6 m closed side/bottom volume prevents a finite
  // water body from reading as a transparent sheet in side views.
  volumeDepth: 6,
  // Enabled by default: WaterSurface applies body-color fog/background when
  // the camera is below and inside this finite surface's XZ footprint.
  underwaterAtmosphere: true,
  // Optional terrain sampler enabling surf mechanics: waves shoal, break,
  // and wash a swash film up the beach. breakerAmount > 0 adds plunging
  // breaker shells that ride each set wave to the break line.
  bedHeight: (x, z) => terrainHeightAt(x, z),
});
water.position.y = 0.4;
scene.add(water);

const sky = new StylizedSky(); // shows up in the water's reflections
scene.add(sky);

water.addInteractor(characterObject3D, { radius: 0.35 });
water.setFollowTarget(characterObject3D); // ripple window follows across big water

// Current scene light may replace the preset's standalone fallback values.
water.setSceneOverrides({
  sunDirection: lightingState.sunDirection,
  sunColor: lightingState.sunColor,
  skyZenithColor: lightingState.skyZenithColor,
  skyHorizonColor: lightingState.skyHorizonColor,
});

// per frame, before renderer.render(scene, camera):
water.update(renderer, scene, camera, delta);
sky.update(delta, camera);

// interactions & physics
water.splash({ x, y, z }, { strength: 1.2 });
water.addRipple({ x, z }, { radius: 0.3, strength: 0.5 });
const surfaceY = water.getHeightAt(x, z);   // buoyancy — includes swell + breakers
const flow = water.getFlowAt(x, z);         // surge velocity (breaker whitewater)
```

(Inside this repo the labs import from `../../src/water/...`.)

Constraints: the surface must stay axis-aligned (translation only), and
depth-based effects assume a perspective camera. Above water,
`WaterScenePasses` renders a submerged-scene color+depth grab and a planar
reflection. Below water, that color target becomes a same-pose air-side
transmission capture with an oblique water-plane clip, while the planar
reflection and scene-depth pass are skipped. Exclude objects with
`userData.waterExclude` (all water passes), `userData.waterGrabExclude`
(above-water grab only), or `userData.waterReflectionExclude` (reflection
only).

For an authored terrain heightfield, prefer
`createSceneSurfaceRuntime({ bounds, heightAt, waterLevel })` and its
`createWaterSurface()` method. It supplies the same bed sampler to shoaling,
nearshore phase, shore-state history, side volume, grass water mask, and strict
readiness audit, so these coupled requirements cannot drift independently.

Camera-facing meshes can opt into the offscreen cameras without becoming
inside-out billboards in reflections:

```js
billboard.userData.onWaterPass = function onWaterPass(passCamera, passKind) {
  orientBillboardToCamera(this, passCamera);
  return () => restoreAnyNonTransformState(); // optional
};
```

`passKind` is `grab` or `reflection`. The hook is synchronous; ToonLab restores
the object's transform and visibility after each pass even if rendering throws.
Use the returned cleanup only for other host-owned state.

These passes are real scene renders, not a free material feature. Above water,
the default maximum is three offscreen renders per update (grab, depth, and
reflection); below water the inactive depth/reflection work is skipped. Inspect
`water.passes.stats` for `configuredMaximumSceneRenders`, the actual last-frame
pass list/count, and every render-target size before accepting a scene budget.

## Settings, presets, tones

Water settings are flat (`createWaterSettings({ preset: 'ocean',
waveIntensity: 0.6 })`); all 82 fields across 7 groups (waves, surface,
foam, lighting, ripples, splashes, quality) are in the
[settings reference](settings-reference.md). Highlights:

- **`waveIntensity`** — the authored baseline scales the whole Gerstner
  spectrum from glassy mirror to storm swell. Components are slope-limited,
  so big dials stretch to long wavelengths instead of spiking. Current
  Weather may transiently modulate this baseline without editing the preset.
- **Wave sets** — `waveSetPeriod`/`waveSetStrength` make big waves arrive in
  groups with lulls between, marching at group velocity.
- **Body color** — three-stop absorption (`shallowColor → midColor →
  deepColor`), separate from wave motion. `colorTone` picks a named palette
  from `WATER_COLOR_TONES`: `classic`, `anime`, `teal`, `caribbean`,
  `lagoon`, `deepOcean`. Every non-`classic` tone owns the coherent palette,
  depth-fade, Fresnel, reflection, caustic, and detail-normal block; values for
  those individual keys passed alongside it are intentionally replaced. Use
  `classic` when the caller needs full per-key control.
- **Opacity** — controls the fallback material path when no scene-color target
  is bound. The normal `WaterSurface` capture path composites an integrated
  refractive body and does not use the standalone `opacity` setting.
- **Underwater transmission** — `indexOfRefraction` anchors the Snell window
  and total internal reflection; `underwaterTransmission` controls how much
  of the captured air-side scene comes through; `underwaterTintStrength`
  keeps that view inside the authored water palette.
- **Shore** — `shoalingDepth`, `shorelineWaves`, `shorelineRunup`, and
  `runupDistance` tune surf and swash reach. With an explicit
  `runupDistance`, event peaks vary over 80–100% of that bound and the next
  uprush starts at the preceding rundown endpoint rather than resetting.
  `breakerEnabled/breakerAmount/breakerCurl/breakerScale/breakerPeel`
  control the plunging-breaker shells.
- **Persistent beach state** — `swashFoamAmount`, `swashFoamLifetime`,
  `swashFoamResidueLifetime`, `wetSandDryTime`, `wetSandDarkening`, and
  `wetSandSheen` are separate from offshore `foamAmount`. They take effect
  when the surface is constructed with a `shoreState` field and the beach
  uses a shore-state material.

A water **preset** is the water recipe (`mirror`, `calm`, `lake`, `river`,
`coast`, `ocean`, or `storm`). A **style** is the orthogonal IP-wide
rendition applied across every preset. Built-in styles
(`getWaterStyleOptions()`) are `default` and `call_me_sensei`, the
studio-managed signature style:

```js
createWaterSettings({ preset: 'river', style: 'call_me_sensei' });
water.setPreset('coast', { style: 'call_me_sensei' });
```

The style refines appearance while each preset retains its defining motion
and shoreline behavior. The short-lived/historical
`{ preset: 'call_me_sensei', scenario: 'river' }` form remains a compatibility
alias for `{ preset: 'river', style: 'call_me_sensei' }`. Apply a preset at
construction or live with `water.setPreset(name, { style })` /
`water.applySettings(options)`.

### Authored baseline vs. current scene

`water.settings` is always the authored, portable baseline. Body palette,
wave structure, foam, ripple/splash response, and water-specific lighting
response belong there. `waveIntensity` is also saved as the intended calmness
of that body of water.

`sunDirection`, `sunColor`, `skyZenithColor`, and `skyHorizonColor` remain
portable authored fallbacks so a water asset renders correctly in isolation,
previews, and scenes without a connected lighting rig. A live scene should
replace those current values transiently. Weather may likewise add temporary
wave energy:

```js
import {
  WATER_SCENE_OVERRIDE_PRIORITIES,
} from '@call-me-sensei/toonlab/water';

const weatherLayer = Symbol('weather-water');
water.setSceneOverrideLayer(weatherLayer, (base) => ({
  waveIntensity: Math.min(base.waveIntensity + currentWaterWaveBoost, 1),
}), { priority: WATER_SCENE_OVERRIDE_PRIORITIES.weather });

// Removes Weather only; a separate Lighting layer remains active.
water.clearSceneOverrideLayer(weatherLayer);
```

`setSceneOverrides()` is the convenience single-scene layer, and
`clearSceneOverrides()` removes only that layer. Named owners should clear their
own layer with `clearSceneOverrideLayer(id)`; `clearAllSceneOverrideLayers()` is
available for an explicit full teardown. `applySettings()` and `setPreset()`
keep their existing behavior as authored edits and automatically recompose
active runtime layers. `water.renderedSettings` exposes the composed state while
exports continue to read `water.settings`. Runtime layers accept only
`waveIntensity` and the four fallback sun/sky fields, so scene code cannot
accidentally overwrite the water palette or wave structure.

### Registering and sharing presets

```js
import {
  registerWaterPreset,
  serializeWaterPreset,
  parseWaterPresetDocument,
  registerSerializedWaterPreset,
} from '@call-me-sensei/toonlab/water';

registerWaterPreset('harbor', { waveIntensity: 0.25, colorTone: 'teal' });

// Versioned JSON document ('toonlab/water-preset'), same pattern as toon presets:
const json = serializeWaterPreset('harbor', { label: 'Harbor' });
const result = parseWaterPresetDocument(json);
if (result.ok) registerWaterPreset(result.value.id, result.value, { overwrite: true });
// or in one step: registerSerializedWaterPreset(json, { overwrite: true });
```

`getWaterPresetOptions()` lists built-ins plus registrations (for HUDs);
`validateWaterPresetDocument` / `createWaterPresetDocument` /
`sanitizeWaterPresetSettings` round out the document API.

## Persistent swash, foam, and wet sand

`shoreState` is opt-in because a lake or open-ocean tile does not necessarily
need a fixed beach-history atlas. It requires `bedHeight`, and its `region` is
world-anchored rather than camera-following. The four state channels are:

| Channel | Stored beach history |
|---|---|
| R | persistent sediment moisture |
| G | short-lived surface film |
| B | active aerated foam |
| A | stranded and drying foam residue |

The water samples this atlas so swash foam remains attached to the moving
wet/dry edge. A beach material can sample the same atlas, preserving wet sand,
the glossy draining film, and foam that has just crossed onto exposed sand.
The ground mesh must provide a `color` vertex attribute because
`createWaterShoreMaterial` uses it as the dry albedo. Optional `albedoMap`,
Poly Haven-style `armMap` (AO/roughness/metalness), `normalMap`, and
`textureRepeat` inputs can layer tiling grain detail under the same live wet
sand, foam, and projected-caustic response.

```js
import {
  WaterSurface,
  createWaterShoreMaterial,
} from '@call-me-sensei/toonlab/water';

const water = new WaterSurface({
  width: 80,
  depth: 40,
  preset: 'coast',
  bedHeight: (x, z) => terrainHeightAt(x, z),
  runupDistance: 10, // event maxima vary from about 8 m to 10 m
  nearshorePhase: true,
  shoreState: {
    region: { centerX: 0, centerZ: 0, width: 80, depth: 40 },
    resolution: { x: 512, y: 256 },
  },
});

const beachMaterial = createWaterShoreMaterial({
  stateField: water.shoreState,
  foamColor: water.settings.foamColor,
  foamAmount: water.settings.swashFoamAmount,
  wetDarkening: water.settings.wetSandDarkening,
});
beach.material = beachMaterial;
water.attachShoreStateMaterial(beachMaterial);
```

Call `water.attachShoreStateMaterial(material)` rather than binding only the
initial texture. The shore state uses ping-pong targets, and the attachment
refreshes the material after every swap. The field is a visual history model,
not a sediment, air-entrainment, or two-phase-fluid simulation.

## Quality tiers

`quality: 'low' | 'medium' | 'high'` gates the most expensive fragment
features (`WATER_QUALITY_TIERS`):

| Tier | Caustics/sparkles | Detail octaves | Foam octaves |
|---|---|---|---|
| `low` | off | 2 | 2 |
| `medium` | caustics + sparkles | 3 | 3 |
| `high` | + chromatic caustics | 4 | 3 |

Custom tiers are a plain object:

```js
new WaterSurface({ quality: { qualityLevel: 'high', detailOctaves: 5, foamOctaves: 4 } });
```

`resolveWaterQualityDefines(quality)` is the resolver if you build materials
directly (`createWaterMaterial`).

Water quality is a compile-time TSL graph policy. Pass it when constructing
`WaterSurface`; changing tiers requires replacing the surface/material graph.
Water Lab performs that rebuild while preserving the authored document and
stage state. `applySettings()` hot-updates art/simulation uniforms but should
not be used as a runtime quality switch. The saved `quality` value is the
preset's preferred deployment default; a host may replace it per device when
constructing the surface.

## The systems

`WaterSurface` orchestrates these modules (all exported from
`@call-me-sensei/toonlab/water` for standalone use):

- **`WaterRippleSimulation`** — GPU ping-pong heightfield with velocity,
  foam energy, absorbing borders, and a texel-exact moving window that
  follows a target across large surfaces.
- **`WaterCurrentField`** — optional CPU-authored, world-space horizontal
  current atlas mirrored to a compact GPU texture. It can project authored
  flow away from signed-distance obstacles and feeds gameplay queries plus
  shore-foam transport. It does not solve pressure, circulation, separation,
  or turbulence.
- **`WaterShoreStateField`** — optional world-anchored GPU ping-pong atlas for
  moisture, surface film, active swash foam, and residue. Pair it with
  **`createWaterShoreMaterial`** and `water.attachShoreStateMaterial(...)` so
  the water and beach render the same history instead of looking like two
  independent systems.
- **`WaterSplashSystem`** — GPU-ballistic droplet points, procedural spray
  crown, expanding foam rings; all in-shader, no sprite atlas.
- **`WaterBreakerSystem`** — dedicated curl-shell geometry swept along the
  break line: shells swell out of the ambient sea, pitch a plunging lip,
  peel alongshore, and decay into a whitewater bore. Physical: mirrored on
  the CPU (`sampleAt`) so `getHeightAt` rides objects over the passing face
  and `getFlowAt` surges them shoreward. `breakerEnabled: false` removes the
  whole system for perf A/B.
- **`WaterInteractionManager`** (via `water.addInteractor`) — objects
  entering fast splash automatically, submerged movement leaves wakes with
  bow spray, exits splash lighter. Interactors take a radius plus a height
  (optionally a function for pose-dependent bodies).
- **`WaterRain`** — GPU-looping rain streaks to pair with ripple dimples.
- **`WaterKelpField`** — instanced kelp blades swaying with the flow.
- **Underwater view** — when the camera dips below the waterline, a clipped
  same-pose scene capture supplies the real sky, clouds, and above-water
  objects to a stylized IOR-based Snell window with total internal
  reflection and compact Beer–Lambert-inspired tinting.
- **Projected floor caustics** — the environment and shore materials receive
  a runtime-generated seamless Voronoi web sampled in two independently
  moving layers. It is distorted by waves and attenuated by water depth,
  receiver angle, and the active water region. This is the shimmering light
  commonly mistaken for a floor reflection; it is not mirror reflection.

`WaterSurface` applies the Water Lab's proven full-screen underwater
atmosphere by default: when the camera is below and inside the finite surface,
it replaces the main render's background and distance fog with a dense color
derived from `midColor`. Before transmission/reflection capture passes it
restores the host's original air-side background, `scene.fog`, and
`scene.fogNode`, then reapplies the submerged state for the host render. A
capture-excluded fullscreen color veil also grades custom TSL materials that
intentionally opt out of Three's scene fog, preventing mixed ToonLab scenes
from looking like clear air beneath a dark plane. The current result is
inspectable at `water.underwaterAtmosphereState`. Disable it with
`underwaterAtmosphere: false`, or pass an object with `fogNear`, `fogFar`,
`color`, `colorScale`, `overlayOpacity`, `boundsMargin`, or
`clipToSurfaceBounds` overrides.

Advanced image distortion, a waterline meniscus, and volumetric sun shafts
remain optional scene/post-processing effects. They are not required to avoid
the hollow, clear-air-under-a-plane failure that the default atmosphere now
prevents.

Scene shadowing and cloud shadows: the surface darkens under cast shadows
(`sceneShadowStrength`) and shares the global cloud-shadow field
(`water.setCloudShadow({ strength, coverage, scale, velocity })`) with
grass, trees, and the environment shader.

## CPU/GPU spectrum mirror

`buildGerstnerWaves(settings)` builds the 8-component Gerstner spectrum that
both the vertex shader and the CPU sampler consume;
`sampleGerstnerHeight(waves, x, z, time)` (wrapped by
`water.getHeightAt(x, z)`) evaluates the exact same math for buoyancy,
swimming, and interaction tests. The spectrum constants (wavelength falloff,
slope limit, gravity) are deliberately not settings because the two sides
must stay in lockstep — see
[shader-constants.md](shader-constants.md#water) for the full list and
where each lives.

On a shoaling surface, `nearshorePhase: true` optionally bakes a static-bed,
one-way mild-slope/ray approximation for the two dominant swell components.
It keeps the incident period while shortening and turning those components in
shallower water, and CPU height queries sample the same field. The shader's
analytic macro normal uses the corresponding baked phase gradient. This
is intentionally bounded: it does not model diffraction, reflection, a ray
turning back toward the incident boundary, moving bathymetry, or every detail
wave. Dedicated breaker-shell mode currently bypasses this phase solve.

Swash also has one CPU-authored frame per event. The visible water, gameplay
queries, and persistent shore-state pass share the same event index, oblique
edge shape, uprush/backwash progress, and endpoints. That shared frame is what
prevents foam, wetness, and the moving water edge from becoming separately
looping animations.

## Debug views

`?waterDebug=<mode>` in the labs or `water.setDebugMode(mode)`:

```text
depth | foam | normal | ripple | reflection | caustics | specular | fresnel | crest | shoreState
```

`shoreState` displays moisture in red, surface film in green, and the stronger
of active foam/residue in blue. It is the quickest way to tell whether a visual
gap is caused by state generation, state/material binding, or final shading.

## Technique and research matrix

This table separates what the renderer actually implements from useful
coastal-engineering reference models. The references constrain terminology
and expected behavior; they are not evidence that this stylized system has
been physically validated.

| Technique | ToonLab status | Scope and important boundary |
|---|---|---|
| Eight-component Gerstner spectrum | **Implemented** | Drives open-water geometry and has a CPU mirror for height queries. This is a compact directional spectrum, not an FFT ocean and not a fluid solver. |
| Finite-depth nearshore phase/refraction | **Implemented, opt-in** | A static-bed, one-way mild-slope/ray bake affects the dominant swell pair. It approximates wavelength shortening and refraction but omits diffraction, reflection, turning rays, moving beds, and the six detail waves. The physical phenomena and numerical methods are covered in the [USACE Coastal Engineering Manual, Part II](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1100_Part-02.pdf). |
| Shoaling and breaking | **Implemented, stylized** | Bed depth attenuates/amplifies the authored swell and can drive a separate curling-breaker shell. It is not an energy-conserving Boussinesq, shallow-water, or two-phase breaking calculation; dedicated breaker-shell mode currently bypasses the nearshore phase bake. See the [USACE Coastal Engineering Manual, Part II](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1100_Part-02.pdf) for the engineering treatment of wave transformations and surf-zone processes. |
| Swash run-up and backwash | **Implemented, stylized** | A continuous event state gives fast uprush, slower return, 80–100% peak variation, correlated sets, oblique macro-shape, and endpoint handoff. `runupDistance` is a horizontal art/calibration control, not the `R2%` elevation predicted by an empirical model. [Carrier & Greenspan (1958)](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/water-waves-of-finite-amplitude-on-a-sloping-beach/9628CB59A4761A52C12E098ACCE3F1C6) derive nonlinear shallow-water run-up on a plane slope; [Stockdon et al. (2006)](https://pubs.usgs.gov/publication/70030520) show observed run-up depends on setup plus incident- and infragravity-band swash and on offshore conditions and beach properties. ToonLab does not solve or fit either model. |
| Persistent foam, film, and wet sand | **Implemented, opt-in** | A world-anchored RGBA state atlas is shared by water and ground materials. It preserves visual history but does not simulate bubbles, air entrainment, sediment transport, infiltration, or two-phase flow. |
| Interactive ripple heightfield | **Implemented, local** | A camera-following 2D GPU heightfield handles splashes and wakes. It is not mass/momentum conserving, is not coupled to the offshore spectrum, and is not a wetting/drying shoreline solver. |
| Flow maps / spatial currents | **Foundation implemented; authored input required** | `WaterCurrentField` stores authored XZ velocity and an optional domain/obstacle mask for gameplay and shore-foam advection. Its signed-distance projection discourages bank penetration but cannot infer pressure, circulation, wakes, separation, rip currents, or turbulence. Those patterns still need authored/baked vectors or a solver upstream. |
| Shallow-water equations (SWE) | **Not implemented** | There is no depth-and-momentum time integration, conservative wetting/drying front, obstacle-coupled flow, or numerical run-up solution. The current swash and ripple systems must not be described as SWE. [Carrier & Greenspan (1958)](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/water-waves-of-finite-amplitude-on-a-sloping-beach/9628CB59A4761A52C12E098ACCE3F1C6) is a useful primary reference for the nonlinear shallow-water model class on a plane beach. |
| FFT spectral ocean | **Not implemented** | No frequency-domain spectrum is transformed into a displacement field. FFT could be a future open-ocean option, but it would not by itself supply beach wetting/drying, swash history, or obstacle-aware currents. |
| Full CFD / two-phase foam | **Not implemented** | Spray droplets and foam are rendering/simulation effects, not Navier–Stokes water/air volume fractions. |

### Research references

- G. F. Carrier and H. P. Greenspan, [“Water waves of finite amplitude on a
  sloping beach”](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/abs/water-waves-of-finite-amplitude-on-a-sloping-beach/9628CB59A4761A52C12E098ACCE3F1C6),
  *Journal of Fluid Mechanics* 4(1), 1958. Primary analytic nonlinear
  shallow-water treatment of shoreline motion on a plane slope.
- H. F. Stockdon, R. A. Holman, P. A. Howd, and A. H. Sallenger Jr.,
  [“Empirical parameterization of setup, swash, and
  runup”](https://pubs.usgs.gov/publication/70030520), *Coastal Engineering*
  53(7), 2006. Primary field-data study separating setup, incident swash, and
  infragravity swash in run-up estimates.
- U.S. Army Corps of Engineers, [*Coastal Engineering Manual, Part
  II*](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1100_Part-02.pdf),
  EM 1110-2-1100, 2002. Official engineering reference for wave mechanics,
  transformations, breaking, and surf-zone processes.

## Water Lab visual acceptance gates

These are regression targets derived from the reported Water Lab captures,
not a claim that every current build already passes. Use **Ground → Beach
(swash)**, a 20 m test beach, `runupDistance: 10`, and a camera that can inspect
the shoreline both alongshore and from above. Observe at least eight complete
events; a single attractive still does not prove continuity.

- **Reach and continuity:** centerline inland maxima fall between 8 m and
  10 m, consecutive events visibly differ, and the edge returns continuously
  to an event-dependent rundown endpoint. No teleport/reset is allowed when a
  cycle changes.
- **Connected, oblique edge:** the water/sand silhouette remains one connected
  front with an incidence angle, broad tongues, smaller scallops, and real
  gaps. It must not become a ruler-straight or clamped plateau, release one
  mesh column/block at a time, or repeat the same outline every cycle.
- **Foam belongs to the edge:** the strongest fresh foam intersects the actual
  wet/dry silhouette on both water and sand sides. It may tear into patches and
  leave residue, but a detached interior white strip that looks like a
  reflection or a second looping system is a failure.
- **Shape variety:** compare several cycles at the same camera. Broad tongue
  widths, holes, breaks, and alongshore positions change while remaining
  spatially coherent; avoid evenly spaced teeth or nearly uniform ribbons.
- **One optical system:** shallow color, opacity, refraction, and caustic
  motion transition into the swash film without a sharp internal handoff.
  Caustics may fade as the film becomes physically thin and foam may occlude
  them, but they must not stop at a fixed line inside connected water.
- **Retreat history:** active foam thins into residue, recently exposed sand
  stays darker and briefly glossier, and those marks decay on their configured
  lifetimes instead of disappearing at the procedural cycle boundary.
- **Coverage:** supported orbit, pan, and zoom views do not reveal a rectangular
  water-tile edge, skirt gap, or finite patch against the horizon. Either the
  water covers the view or scene composition hides its boundary.
- **Ground switching and controls:** after switching into Beach (swash), orbit,
  pan, and zoom remain responsive; a rendered scene followed by a multi-second
  input freeze is a failure.
- **Backend safety:** native WebGPU and the WebGL2 fallback retain displaced
  waves and swash. Neither may log a WebGPU private-address-space pipeline
  error or silently fall back to a completely flat surface.
- **From below:** use the Water Lab's **From below** shortcut. The real sky,
  clouds, and above-water silhouettes remain visible inside the Snell window;
  grazing rays transition into a stylized total-internal-reflection band
  without turning the whole underside transparent.
- **Seabed:** use the **Seabed** shortcut on open ground. A moving two-layer
  caustic web stays attached to actual receiving geometry, follows the water
  palette and sun tint, fades with depth, and never appears on dry ground.
- **Debug cross-check:** in `shoreState`, the blue foam signal follows the same
  event as the moving edge, green film trails the retreat, and red moisture
  outlives both. In `caustics` and `foam`, no fixed internal seam should reveal
  two independently phased systems.
