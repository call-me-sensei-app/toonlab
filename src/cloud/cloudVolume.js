// The volumetric cloud raymarcher.
//
// A screen-space pass: 128 primary steps along the view ray through a spherical
// shell, 6 light steps toward the sun at every non-empty sample. Both counts
// come from src/sky/skyQualityTiers.js and are fixed for every quality tier —
// tiers scale how many *rays* are marched (cloudHistoryDiv, see
// cloudReprojection.js), never the steps per ray, because changing the step
// count changes the transmittance integral and therefore the look.
//
// Written from the published literature summarized in docs/sky-cloud-parameters.md:
//
//   Schneider & Vos, "The Real-Time Volumetric Cloudscapes of Horizon Zero
//     Dawn" (SIGGRAPH 2015) — the shell, the weather-map/height-gradient/
//     base-shape/erosion density recipe, the cone-spread light march.
//   Hillaire, EGSR 2020 / SIGGRAPH 2015 — the energy-conserving segment
//     integral and the analytic aerial-perspective solution.
//   Bruneton & Neyret 2008 — the transmittance parameterisation this reuses
//     through src/sky/atmosphereScattering.js.
//
// Geometry. Everything is world-space metres, but the shell is spherical, so
// altitudes have to survive a planet radius of 6360 km in float32. Two
// conditioned forms do that and are used everywhere instead of the direct
// expressions:
//
//   altitude(camera + d) = (camAlt + d.y) + (d.x^2 + d.z^2) / (2R + camAlt + d.y)
//   mu(after distance t) = (r*mu + t) / rAfter
//
// The first is `|p - centre| - R` rearranged so no term is ever the difference
// of two planet-scale numbers; at 42 km horizontal it reproduces the 139 m of
// earth curvature to within 1.5 mm (measured, not estimated). The direct form
// loses about a metre in float32, which is a third of a percent of a 2800 m
// shell — and it loses it at the horizon, where the melt window lives.
//
// The planet is re-centred under the camera every frame, at
// `(cameraX, groundLevel - R, cameraZ)`. That is what keeps the horizon at the
// right distance wherever the host places the camera; a centre fixed at
// `(0, -R, 0)` would leave a camera 100 km out from the world origin 780 m below
// its own local horizon. Two consequences to know about. Altitude is measured
// from the observer, so a distant cloud's height fraction drifts as the camera
// moves — 0.035 over 35 km at the default shell, absorbed entirely by the height
// gradient's plateau, so the density does not move with it. And the cloud *field*
// is still world-anchored: every noise and coverage lookup uses the absolute
// world position, so flying toward a cloud approaches it. Only the altitude and
// the horizon-bank distance are camera-relative, and both are camera-relative by
// definition. `cloudReprojection.js` re-centres identically from the same camera,
// which is what keeps the two passes agreeing within a frame.
//
// Output. `vec4(scatteredRadiance, transmittance)` in linear HDR, in the same
// unit as `sun.intensity`. The compositor's job is
// `sky * transmittance + scatteredRadiance` — no tonemap and no exposure here,
// exactly as the sky dome leaves them to the post chain.

import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  clamp,
  cross,
  exp,
  float,
  length,
  log2,
  max,
  min,
  mix,
  mrt,
  normalize,
  pow,
  saturate,
  screenUV,
  select,
  smoothstep,
  sqrt,
  step,
  texture,
  texture3D,
  uniform,
  property,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import {
  ATMOSPHERE_MEDIUM,
  atmosphereRaymarchNodes,
} from '../sky/atmosphereScattering.js';
import { applySkyColorNode } from '../sky/skyColor.js';
import {
  CLOUD_LIGHT_MARCH_STEPS,
  CLOUD_PRIMARY_MARCH_STEPS,
  assertFixedMarchBudget,
  resolveQuality,
} from '../sky/skyQualityTiers.js';
import {
  applyCloudInnerPaintNode,
  applyCloudLightBlendNode,
  applyCloudTopLightNode,
  applyCloudTimePaletteNode,
  applyCloudWhiteTopNode,
  createCloudLightingModel,
} from './cloudLighting.js';
import { AmbientSkyBaker } from './ambientSkyBaker.js';
import {
  CLOUD_BASE_SHAPE_EROSION_WEIGHTS,
  getCloudBaseShapeVolume,
} from './noise/baseShapeVolume.js';
import { getCloudCirrusMap } from './noise/cirrusMap.js';
import { getCloudErosionVolume } from './noise/erosionVolume.js';
import { getCurlNoiseVolume } from './noise/curlNoise.js';
import { getWeatherMap } from './noise/weatherMap.js';
import { uploadNoiseVolumeMipChain } from './noise/noiseVolume.js';

// The budget this module marches with is asserted at import time, so a tier
// table that grew a step-count field fails here rather than silently changing
// every rendered cloud.
assertFixedMarchBudget();

/** Planet radius in metres — the atmosphere module's bottom radius, in km. */
export const CLOUD_PLANET_RADIUS = ATMOSPHERE_MEDIUM.bottomRadius * 1000;

// The physical light march keeps the full optical depth. The white-top style
// descriptor uses a broader reach only for classifying sun-readable upper
// regions; it never feeds scattering, extinction, transmittance, or opacity.
export const CLOUD_WHITE_TOP_DEPTH_SCALE = 0.25;
export const CLOUD_WHITE_TOP_MIN_SUN_REACH = 0.55;
export const CLOUD_WHITE_TOP_HEIGHT_GAIN = 5;
/** Smallest accumulated alpha contribution accepted as the visible surface. */
export const CLOUD_SURFACE_LIGHT_MIN_WEIGHT = 0.002;

/** Metres sampled around the first visible point to recover a broad exterior normal. */
export const CLOUD_SURFACE_NORMAL_RADIUS = 100;

/**
 * Transmittance at which the primary march stops.
 *
 * A 128-step march that never breaks early costs the same on a clear pixel as
 * on an overcast one, and an overcast sky is where the frame budget is tightest.
 * 0.004 is about eight stops below full brightness — below the point where a
 * further sample can move the image — and on a `thunderstorm` sky it retires
 * most rays in the first fifth of the shell.
 */
export const CLOUD_TRANSMITTANCE_EPSILON = 0.004;

/** Normalized density below which a sample contributes nothing and is skipped. */
export const CLOUD_DENSITY_EPSILON = 1e-4;

/** Fine primary-march step in world metres. */
export const CLOUD_BASE_STEP_SIZE = 25;

/** Empty space advances at four times the current cone-footprint step. */
export const CLOUD_COARSE_STEP_SCALE = 4;

/** Empty fine samples required before returning to coarse mode. */
export const CLOUD_FINE_EMPTY_LIMIT = 4;

/** Distance-based fine-step growth multiplier. */
export const CLOUD_STEP_CONE_FACTOR = 1.5;

/** Largest optical depth integrated by one visible-surface sample. */
export const CLOUD_MAX_OPTICAL_DEPTH_PER_STEP = 0.5;

/** Smallest density-adaptive core step as a fraction of the cone-footprint step. */
export const CLOUD_CORE_STEP_MIN_SCALE = 0.15;

/** Opaque cloud interiors advance faster once their contribution is hidden. */
export const CLOUD_INTERIOR_STEP_SCALE = 3;
export const CLOUD_INTERIOR_COARSEN_START = 1;
export const CLOUD_INTERIOR_COARSEN_FULL = 3;

/** Metres the cirrus/haze deck sits above the top of the volumetric shell. */
export const CLOUD_DECK_ALTITUDE_OFFSET = 2000;

/** Longest slant path, in deck thicknesses, a grazing view is allowed to accrue. */
export const CLOUD_DECK_MAX_SLANT = 6;

/** Floor on |cos| for the deck's slant path, so the horizon does not divide by zero. */
export const CLOUD_DECK_MIN_COS = 0.02;

/**
 * Representative extinction of the deck, 1/m. Only the moon rim reads it — the
 * deck's own opacity comes from its texture and coverage — and a thin deck has
 * to read as an edge everywhere for the rim to land on it.
 */
export const CLOUD_DECK_EXTINCTION = 0.0004;

/** Self-shadowing optical depth the deck accrues at full opacity. */
export const CLOUD_DECK_LIGHT_DEPTH = 1.5;

/** Light-march length as a fraction of the shell thickness. */
export const CLOUD_LIGHT_MARCH_LENGTH_FRACTION = 1;

/**
 * Geometric growth of the light-march step.
 *
 * Six steps cannot resolve a 2800 m shell evenly, so they are graded: the first
 * two land inside the sample's own neighbourhood, where the self-shadow that
 * shapes a billow lives, and the last reaches most of the way out of the cloud
 * to catch a tower shadowing the deck below it. At 1.7 the last step is 12
 * times the first.
 */
export const CLOUD_LIGHT_MARCH_GROWTH = 1.5;

/**
 * Cone half-width of the light march, as a fraction of the distance marched.
 *
 * The light march is a cone, not a line: six samples along a single ray alias
 * into hard-edged shadow bands, and spreading them decorrelates the bands. At
 * 0.3 the cone's half-angle is 16.7 degrees, which is **not** the sun's angular
 * radius (0.26 degrees) — it is the width over which multiple scattering has
 * already smeared the shadow by the time it reaches the eye. Sizing the cone to
 * the solar disc would leave the banding it exists to remove.
 */
export const CLOUD_LIGHT_CONE_SPREAD = 0.05;

/** Base light-cone step in world metres. */
export const CLOUD_LIGHT_STEP_SIZE = 25;

/**
 * Unit offsets the light march spreads its samples over: a Vogel (golden-angle)
 * disc, deterministic and better stratified for six points than any hand-picked
 * set.
 *
 * Two dimensions, not three, because the offsets are applied on a basis built
 * around the light direction at march time — see `createCloudLightMarch`. A
 * fixed world-space lattice would displace the taps by a constant world
 * direction regardless of where the sun is: the two heaviest taps of a sphere
 * lattice sit 187 m and 550 m *below* the sample at the default 2800 m
 * thickness, so a sample under a low sun is shadowed by cloud that is not
 * between it and the sun at all.
 */
export const CLOUD_LIGHT_CONE_OFFSETS = Object.freeze(
  Array.from({ length: CLOUD_LIGHT_MARCH_STEPS }, (unused, index) => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt((index + 0.5) / CLOUD_LIGHT_MARCH_STEPS);
    const phi = index * golden;
    return Object.freeze([radius * Math.cos(phi), radius * Math.sin(phi)]);
  }),
);

/**
 * Nubis-style density-height profiles, expressed as
 * `[bottomStart, bottomEnd, topStart, topEnd]` shell fractions.
 *
 * The 2017 density-model presentation defines the type axis as stratus at 0,
 * stratocumulus at 0.5 and cumulus at 1. The four breakpoints below are the
 * canonical public HZD implementation values used with that axis: a profile is
 * `smoothstep(x, y, h) - smoothstep(z, w, h)`, and the three vec4s are blended
 * with triangular weights before that profile is evaluated. Blending the
 * breakpoints first is important: it moves the cloud floor and crown smoothly
 * instead of cross-fading two already-shaped slabs.
 */
export const CLOUD_STRATUS_HEIGHT_GRADIENT = Object.freeze([0.02, 0.05, 0.09, 0.11]);
export const CLOUD_STRATOCUMULUS_HEIGHT_GRADIENT = Object.freeze([0.02, 0.2, 0.48, 0.625]);
export const CLOUD_CUMULUS_HEIGHT_GRADIENT = Object.freeze([0.01, 0.0625, 0.78, 1]);

/**
 * Couples the published 0-5 `erosionStrength*` range to the erosion field's own
 * [0, 1] range.
 *
 * Detail times strength becomes the lower edge of a density remap. A remap,
 * rather than a subtraction multiplied by `(1 - density)`, preserves a value
 * of one in the core while allowing the high-frequency field to move the
 * actual surface. Multiplying by `(1 - density)` made saturated macro bodies
 * immune to erosion and left them as smooth extruded weather-map shapes.
 */
export const CLOUD_EROSION_CARVE_SCALE = 0.2;

/** Height scale of the wispy inversion, per the erosion volume's documented recipe. */
export const CLOUD_EROSION_WISP_HEIGHT = 10;

/** Smallest erosion tile, metres — keeps a zero multiplier from dividing by zero. */
export const CLOUD_EROSION_MIN_SCALE = 32;

/** Curl advection of the erosion sample, as a fraction of the erosion tile. */
export const CLOUD_CURL_STRENGTH_FRACTION = 0.12;

/** Per-channel top-dilation weights for the packed Worley volume. */
export const CLOUD_BASE_CHANNEL_STRENGTHS = Object.freeze([0.7, 0.41, 0.23]);

/** Per-channel erosion weights when that volume is sampled at a smaller scale. */
export const CLOUD_EROSION_CHANNEL_STRENGTHS = Object.freeze([0.113, 0.04, 0.02]);

/** Coverage-space width of the weather-map floor carve. */
export const CLOUD_WEATHER_CARVE_WIDTH = 0.1;

// Unique suffix for the laid-out GPU functions this module emits. A layout name
// is a GPU identifier, so two cloud materials compiled into one program would
// collide on it.
let volumeId = 0;

/**
 * Scopes a laid-out TSL function to the build that consumes it.
 *
 * `Fn().setLayout()` emits one real GPU function instead of an inlined copy per
 * call, which is the only way a 128-step march can afford this density field.
 * But three caches that function's GENERATED TEXT in a map keyed by
 * (backend, Fn) which outlives every build, and hands the cached text to any
 * later build of the same Fn. The text does not travel. It reads its uniforms as
 * `object.nodeUniformN` — N being the slot the generating build happened to
 * allocate — and names its texture and sampler bindings the same way; and
 * because a cached body is never regenerated, its bindings are never
 * re-registered either. Handed to a build whose graph numbered the object group
 * differently, `position - cameraPosition` becomes `vec3<f32> - vec2<f32>`
 * (measured: WGSL "no matching overload for 'operator - (vec3<f32>,
 * vec2<f32>)'", GLSL "wrong operand types"), and the three noise volumes'
 * samplers are not declared in the program at all.
 *
 * That is not a corner case. `SkySystem.cloudShadow` puts this module's reduced
 * density field into an arbitrary receiver material's graph, `cloudReprojection`
 * marches into its own target, the env-map bake wants its own build with its own
 * march settings, and any material-level change rebuilds the pass in place.
 * Whichever program compiles second gets the first one's text.
 *
 * Explicit parameters are the fix for the uniforms and cannot be the fix for the
 * volumes: WGSL and GLSL both need a texture and its sampler as bindings, and
 * neither node builder maps a `texture`/`texture3D` layout input to a parameter
 * type — there is no such parameter to pass. So the function is made to belong
 * to its build instead. Every body then names the slots of the build it is
 * emitted into, whatever else that build put in the object group and in whatever
 * order, and a uniform or volume added to the field later is covered without
 * anyone having to remember this.
 *
 * The key is `builder.globalCache`: one object per NodeBuilder, and — unlike
 * `builder.cache`, which is swapped out and back around every sub-build — the
 * same object for the whole of that build. Asserted rather than defaulted: a
 * key that failed to identify the build would hand the same build two functions
 * carrying one layout name, which is a duplicate GPU identifier and a far worse
 * failure than the one this exists to prevent.
 */
function buildScoped(create) {
  const perBuild = new WeakMap();
  return (builder) => {
    const scope = builder?.globalCache;
    if (scope === null || typeof scope !== 'object') {
      throw new TypeError(
        '[cloudVolume] NodeBuilder has no globalCache to scope a laid-out function to; '
        + 'the three version this module was written against (r185) is the contract.',
      );
    }
    let scoped = perBuild.get(scope);
    if (scoped === undefined) {
      scoped = create();
      perBuild.set(scope, scoped);
    }
    return scoped;
  };
}

function vectorUniform(x = 0, y = 0, z = 0) {
  return uniform(new THREE.Vector3(x, y, z));
}

/**
 * Both roots of `t^2 + 2 b t + q = 0`, written so neither is the difference of
 * two planet-scale numbers.
 *
 * The naive `-b ± sqrt(b^2 - q)` cancels catastrophically for whichever root
 * has the same sign as `-b`: a vertical view from the ground computes the
 * shell entry as 6.360000e6 minus 6.359999e6. Because `tNear * tFar = q`, the
 * bad root is recovered from the good one by a division instead, and which root
 * is which follows from the sign of `b`.
 */
function solveQuadratic(b, q) {
  const discriminant = b.mul(b).sub(q).toVar();
  const root = sqrt(max(discriminant, 0)).toVar();
  const naiveNear = b.negate().sub(root).toVar();
  const naiveFar = b.negate().add(root).toVar();
  // The guards only matter for an exactly grazing ray, where both roots meet.
  const stableFar = q.div(naiveNear.sub(1e-6)).toVar();
  const stableNear = q.div(naiveFar.add(1e-6)).toVar();
  const forward = step(0, b).toVar();
  return {
    discriminant,
    far: mix(naiveFar, stableFar, forward).toVar(),
    near: mix(stableNear, naiveNear, forward).toVar(),
  };
}

/**
 * Roots of the view ray against a sphere at `targetAltitude`, plus the two
 * intersection flags the callers need. `frontHit` requires both a real
 * discriminant and a positive near root: a negative discriminant leaves a
 * meaningless positive root behind, so one test on its own is not enough.
 */
function intersectAltitude({ cameraAltitude, b, r, targetAltitude }) {
  const target = float(targetAltitude);
  const q = cameraAltitude.sub(target).mul(r.add(target).add(CLOUD_PLANET_RADIUS));
  const roots = solveQuadratic(b, q);
  return {
    ...roots,
    frontHit: step(0, roots.discriminant).mul(step(0, roots.near)).toVar(),
    hit: step(0, roots.discriminant).toVar(),
  };
}

/**
 * Distance at which the view ray crosses a single thin layer at
 * `layerAltitude`, and whether it crosses it at all.
 *
 * Used for the cirrus/haze deck, which is a surface rather than a volume, so
 * running it through `intersectCloudShell` with a one-metre shell would have made
 * the hit test depend on the view angle: a vertical ray crosses one metre of it
 * and a grazing ray several kilometres.
 *
 * A camera below the layer crosses it on the far root, one above it on the near
 * root, and a ray that meets the planet first never reaches it.
 *
 * `above` is returned as well as consumed: it is the same 0/1 test that decides
 * which root is the crossing, and it is therefore also the answer to "is this
 * layer in front of everything below it along the ray", which the compositor
 * needs.
 */
export function findCloudLayerCrossing({ cameraAltitude, viewDir, layerAltitude }) {
  const altitude = max(float(cameraAltitude), 0.5).toVar();
  const r = altitude.add(CLOUD_PLANET_RADIUS).toVar();
  const b = r.mul(viewDir.y).toVar();
  const layer = intersectAltitude({ b, cameraAltitude: altitude, r, targetAltitude: layerAltitude });
  const ground = intersectAltitude({ b, cameraAltitude: altitude, r, targetAltitude: 0 });
  const above = step(float(layerAltitude), altitude).toVar();
  const distance = mix(layer.far, layer.near, above).toVar();
  const blocked = ground.frontHit.mul(step(ground.near, distance)).toVar();
  return {
    above,
    distance: max(distance, 1).toVar(),
    hit: layer.hit.mul(step(1, distance)).mul(blocked.oneMinus()).toVar(),
  };
}

/**
 * Intersects the view ray with the cloud shell.
 *
 * Handles all three camera placements: below the deck (the common case, where
 * the ray enters through the far side of the inner sphere), inside it (the
 * march starts at the camera), and above it (a descending ray enters through
 * the near side of the outer sphere). A ray that meets the planet first sees no
 * cloud at all, and the march never runs past `maxDistance`.
 *
 * Emitted inline rather than wrapped in `Fn`, because the caller needs all
 * three results and TSL functions return one value.
 */
export function intersectCloudShell({
  cameraAltitude,
  viewDir,
  baseAltitude,
  topAltitude,
  maxDistance,
}) {
  const altitude = max(float(cameraAltitude), 0.5).toVar();
  const r = altitude.add(CLOUD_PLANET_RADIUS).toVar();
  const b = r.mul(viewDir.y).toVar();

  const intersectAt = (targetAltitude) => intersectAltitude({
    b,
    cameraAltitude: altitude,
    r,
    targetAltitude,
  });

  const inner = intersectAt(baseAltitude);
  const outer = intersectAt(topAltitude);
  const ground = intersectAt(0);

  const tStart = float(0).toVar();
  const tEnd = float(-1).toVar();

  // Where the shell ends for a camera that is not below it: the inner sphere if
  // the ray descends into it, the outer sphere otherwise. Branchless, because
  // `frontHit` is already the 0/1 selector.
  const exitAbove = mix(outer.far, inner.near, inner.frontHit).toVar();

  If(altitude.lessThan(float(baseAltitude)), () => {
    tStart.assign(inner.far);
    tEnd.assign(outer.far);
  }).ElseIf(altitude.greaterThan(float(topAltitude)), () => {
    tStart.assign(max(outer.near, 0));
    tEnd.assign(exitAbove);
    // Looking away from the deck, or missing the outer sphere entirely.
    If(outer.frontHit.lessThan(0.5), () => {
      tEnd.assign(-1);
    });
  }).Else(() => {
    tStart.assign(0);
    tEnd.assign(exitAbove);
  });

  // The planet blocks the rest of the ray. A downward view from below the deck
  // reaches the inner sphere only on the far side of the world, so this is what
  // removes cloud from below the horizon rather than a separate test.
  If(ground.frontHit.greaterThan(0.5), () => {
    tEnd.assign(min(tEnd, ground.near));
  });

  tStart.assign(max(tStart, 0));
  tEnd.assign(min(tEnd, max(float(maxDistance), 0)));

  return {
    tStart,
    tEnd,
    // A shell shorter than a metre is a grazing sliver, not a cloud.
    hit: step(1, tEnd.sub(tStart)).toVar(),
  };
}

/**
 * Conditioned altitude of a point offset from the camera by `delta`, in metres.
 * See the module header for why the direct form is not used.
 *
 * The exact altitude is `sqrt(h2 + (R + a)^2) - R` for a flat height `a` and a
 * squared horizontal distance `h2`, whose expansion is
 * `a + h2 / (2 (R + a)) - h2^2 / (8 (R + a)^3) + ...`. This keeps the first two
 * terms of the numerator exactly and drops the third, which at 42 km horizontal
 * is 1.5 mm against 139 m of curvature. Writing the denominator as `2R + a`
 * rather than `2R + 2a` looks equivalent at planet scale and is not: it costs a
 * further 24 mm, sixteen times the whole remaining error, for no saving.
 */
function getAltitudeNode(cameraAltitude, delta) {
  const flat = cameraAltitude.add(delta.y);
  const horizontal = delta.x.mul(delta.x).add(delta.z.mul(delta.z));
  return flat.add(horizontal.div(flat.mul(2).add(2 * CLOUD_PLANET_RADIUS)));
}

/**
 * Builds the cloud-density samplers used by view, light, and shadow marches.
 *
 * `sampleDensityNode(worldPosition)` returns
 * `vec3(normalizedDensity, heightFraction, occupancy)`:
 *
 *   - `normalizedDensity` is the dimensionless [0, 1] field before
 *     `shape.density` turns it into an extinction coefficient.
 *   - `heightFraction` is the sample's place in the shell, which the lighting
 *     model needs anyway.
 *   - `occupancy` is the same field with the shell's height envelope left out —
 *     how much cloud surrounds the sample, independent of where in the shell it
 *     sits. `powderNode` keys on it; see `cloudLighting.js` for why the plain
 *     density is the wrong input for a term that darkens *edges*.
 *
 * One call, three results.
 *
 * `sampleCoarseDensityNode(worldPosition)` returns density alone from a reduced
 * field: base shape and coverage, no erosion volume and no curl. That is the
 * shape Nubis marches the light with, and the reason is cost — the light march
 * evaluates a density six times per lit sample, so a full-detail field there
 * costs 24 texture fetches against 12 for the reduced one. The high-frequency
 * erosion carves edges finer than the light march's own 42 m first step can
 * resolve, so what it buys in a shadow is noise rather than detail.
 *
 * GPU layouts prevent the 128 view samples and their light samples from
 * inlining duplicate copies of the field. The returned `...Node` functions are
 * small call shims that can safely be used by separate shader graphs.
 *
 * The recipe, in the order the two noise modules document it:
 *
 *   heightGradient = bottomFade * topFade
 *   shape          = remap(baseShape.r, -(1 - lowFreqFbm), 1, 0, 1) * heightGradient
 *   coverage       = weather.r * (shape.coverage + horizonBank)
 *   density        = remap(shape, 1 - coverage, 1, 0, 1) * coverage
 *   density       -= baseWeatherCarve                       (thin bottoms)
 *   density       -= erosionModifier * strength * (1 - density)
 *
 * Two coordinate frames are in play and mixing them up is not a subtle error.
 * Every noise and coverage lookup uses the **absolute world position**, so the
 * cloud field is anchored to the world and a camera that flies a kilometre
 * actually approaches the cloud it was pointed at. Only three quantities are
 * camera-relative, and each of them is camera-relative by definition: the
 * conditioned altitude, which is expressed as an offset from the camera to stay
 * out of planet-scale arithmetic; the horizontal distance the horizon bank
 * builds over; and nothing else. Feeding `delta` to the noise instead pins the
 * whole sky to the camera — the clouds slide along with it and the temporal
 * reprojection, which projects a world position, disagrees with the marcher
 * about where they are.
 */
export function createCloudDensityField({
  shape,
  wind,
  weatherMap,
  baseShapeVolume,
  erosionVolume,
  curlVolume = null,
  cameraPosition,
  cameraAltitude,
  pixelConeAngle = float(0.001),
  baseShapeResolution = float(64),
  name = 'cloudDensity',
} = {}) {
  if (!shape?.altitude || !shape?.thickness) {
    throw new TypeError('createCloudDensityField needs a cloud shape param group.');
  }
  if (!wind?.direction || !wind?.offset) {
    throw new TypeError('createCloudDensityField needs a cloud wind param group.');
  }
  if (!weatherMap?.isTexture) throw new TypeError('createCloudDensityField needs a weather map.');
  if (!baseShapeVolume?.isTexture) {
    throw new TypeError('createCloudDensityField needs a base-shape volume.');
  }
  if (!erosionVolume?.isTexture) {
    throw new TypeError('createCloudDensityField needs an erosion volume.');
  }

  const weatherNode = texture(weatherMap);
  const baseShapeNode = texture3D(baseShapeVolume);
  const erosionNode = texture3D(erosionVolume);
  const curlNode = curlVolume?.isTexture ? texture3D(curlVolume) : null;

  const [baseLow, baseMid, baseHigh] = CLOUD_BASE_CHANNEL_STRENGTHS;
  const [detailLow, detailMid, detailHigh] = CLOUD_EROSION_CHANNEL_STRENGTHS;

  volumeId += 1;
  const functionName = `${name}${volumeId}`;
  const coarseFunctionName = `${name}Coarse${volumeId}`;

  /**
   * Samples the shared cloud field. Named options make each call state why it
   * differs from the normal camera-ray sample instead of relying on positional
   * nulls and booleans.
   */
  const sampleDensity = (position, {
    detail = true,
    viewDistance = null,
    mipLevel = null,
    coverage = null,
  } = {}) => {
    const delta = position.sub(cameraPosition).toVar();
    const sampleDistance = length(delta).toVar();
    // Primary samples derive their footprint and horizon lift from their own
    // camera distance. Sun-cone taps receive the primary sample's distance so
    // those values stay consistent across the light cone.
    const fieldDistance = viewDistance ?? sampleDistance;
    const altitude = getAltitudeNode(cameraAltitude, delta).toVar();
    const thickness = max(shape.thickness, 1).toVar();
    const heightFraction = altitude.sub(shape.altitude).div(thickness).toVar();

    // --- wind -------------------------------------------------------------
    // Drift moves the whole field, skew leans the sample upwind as height
    // climbs so tops sit downwind of bases, and evolution walks only the 3D
    // noise so shape churns without the weather system moving. All three are
    // independent, which is the contract `wind.speed` / `wind.evolutionSpeed`
    // publish.
    //
    // World position, not `delta` — see the frame note in the doc comment.
    const drifted = position.sub(wind.offset).toVar();
    const skewed = drifted.sub(
      wind.direction.mul(wind.skew.mul(max(heightFraction, 0))),
    ).toVar();
    const evolved = skewed.add(wind.evolutionOffset).toVar();

    // --- density field ---------------------------------------------------
    // The weather map's red channel is a column-height field. The one packed
    // Worley volume is sampled at the broad base scale to dilate the column top,
    // then sampled again at a smaller scale to erode both top and underside.
    // Weather G is intentionally unused; this model does not blend separate
    // cloud-type height profiles.
    const weatherSample = weatherNode
      .sample(position.xz.sub(wind.offset.xz).div(max(shape.weatherScale, 1)))
      .toVar();
    const weather = weatherSample.r.toVar();
    const baseScale = max(shape.baseScale, 1).toVar();
    const macroUv = evolved.div(baseScale).toVar();
    const baseWorldTexel = baseScale.div(max(baseShapeResolution, 1)).toVar();
    const baseLod = (mipLevel ?? max(
      0,
      log2(max(fieldDistance.mul(pixelConeAngle).div(baseWorldTexel), 1e-6)),
    )).toVar();
    const packed = baseShapeNode.sample(macroUv).level(baseLod).toVar();
    let boundaryOffset = packed.r.mul(baseLow)
      .add(packed.g.mul(baseMid))
      .add(packed.b.mul(baseHigh))
      .mul(max(shape.baseStrength, 0))
      .toVar();

    // The horizon coverage lift uses the full camera-to-sample
    // distance. Reuse the same distance already computed for the cone-footprint
    // LOD so the medium and its reference self-shadow stay in the same frame.
    const bankRamp = smoothstep(
      shape.horizonCoverageStart,
      shape.horizonCoverageStart.add(max(shape.horizonCoverageRamp, 1)),
      fieldDistance,
    );
    const effectiveCoverage = (coverage ?? shape.coverage
      .add(shape.horizonCoverageAmount.mul(bankRamp)))
      .toVar();

    const expectedTop = weather
      .add(effectiveCoverage.sub(1))
      .add(boundaryOffset.mul(effectiveCoverage))
      .toVar();
    const localHeightFraction = clamp(
      heightFraction.div(max(expectedTop, 1e-3)),
      0,
      1,
    ).toVar();

    let erosionOffset = float(0).toVar();
    if (detail) If(shape.erosionScaleBaseMultiplier.greaterThan(1e-4), () => {
      const erosionScale = max(
        shape.baseScale.mul(shape.erosionScaleBaseMultiplier),
        CLOUD_EROSION_MIN_SCALE,
      ).toVar();
      const erosionWorldTexel = erosionScale.div(max(baseShapeResolution, 1)).toVar();
      const erosionLod = (mipLevel ?? max(
        0,
        log2(max(fieldDistance.mul(pixelConeAngle).div(erosionWorldTexel), 1e-6)),
      )).toVar();
      const erosionPacked = baseShapeNode
        .sample(evolved.div(erosionScale))
        .level(erosionLod)
        .toVar();
      const erosionField = mix(
        erosionPacked.oneMinus(),
        erosionPacked,
        saturate(shape.erosionShape),
      ).toVar();
      const erosionStrength = mix(
        shape.erosionStrengthBase,
        shape.erosionStrengthPeak,
        localHeightFraction,
      ).toVar();
      erosionOffset.assign(
        erosionField.r.mul(detailLow)
          .add(erosionField.g.mul(detailMid))
          .add(erosionField.b.mul(detailHigh))
          .negate()
          .mul(erosionStrength),
      );
      boundaryOffset.addAssign(erosionOffset);
    });

    const coverageThreshold = weather
      .add(effectiveCoverage.sub(1))
      .add(boundaryOffset.mul(effectiveCoverage))
      .toVar();

    // `edgeSoftnessFalloff` is a per-kilometre divisor. At 1 the width stays
    // constant; above 1 the top gets progressively crisper.
    const heightKm = max(heightFraction, 0).mul(thickness).mul(0.001).toVar();
    const edge = max(
      shape.edgeSoftness.div(pow(max(shape.edgeSoftnessFalloff, 1e-3), heightKm)),
      1e-4,
    ).toVar();

    const topFalloff = smoothstep(
      edge.negate(),
      edge,
      coverageThreshold.sub(heightFraction),
    ).toVar();
    const baseThreshold = erosionOffset.negate().mul(effectiveCoverage).toVar();
    const baseFalloff = smoothstep(
      edge.negate(),
      edge,
      heightFraction.sub(baseThreshold),
    ).toVar();

    const baseBandEnd = max(
      shape.baseWeatherHeightEnd,
      shape.baseWeatherHeightStart.add(1e-3),
    );
    const baseBand = smoothstep(
      shape.baseWeatherHeightStart,
      baseBandEnd,
      heightFraction,
    );
    const requiredCoverage = baseBand.oneMinus()
      .mul(shape.baseWeatherStrength)
      .toVar();
    const weatherBaseFalloff = smoothstep(
      requiredCoverage.sub(CLOUD_WEATHER_CARVE_WIDTH),
      requiredCoverage,
      weather,
    ).toVar();
    const density = topFalloff.mul(baseFalloff).mul(weatherBaseFalloff).toVar();

    return {
      density,
      heightFraction: saturate(heightFraction),
      occupancy: density,
    };
  };

  // Keep every density variant in the same build scope so they share one set of
  // uniforms and cannot drift onto different cloud state.
  const laidOut = buildScoped(() => ({
    sampleDensity: Fn(([position]) => {
      const field = sampleDensity(position);
      return vec3(field.density, field.heightFraction, field.occupancy);
    }).setLayout({
      name: functionName,
      type: 'vec3',
      inputs: [{ name: 'position', type: 'vec3' }],
    }),
    sampleCoarseDensity: Fn(([position]) => (
      sampleDensity(position, { detail: false }).density
    )).setLayout({
      name: coarseFunctionName,
      type: 'float',
      inputs: [{ name: 'position', type: 'vec3' }],
    }),
    sampleLightDensity: Fn(([position, viewDistance]) => (
      sampleDensity(position, { viewDistance }).density
    )).setLayout({
      name: `${functionName}ForLight`,
      type: 'float',
      inputs: [
        { name: 'position', type: 'vec3' },
        { name: 'viewDistance', type: 'float' },
      ],
    }),
    sampleCoarseLightDensity: Fn(([position, viewDistance]) => (
      sampleDensity(position, { detail: false, viewDistance }).density
    )).setLayout({
      name: `${coarseFunctionName}ForLight`,
      type: 'float',
      inputs: [
        { name: 'position', type: 'vec3' },
        { name: 'viewDistance', type: 'float' },
      ],
    }),
    sampleShadowDensity: Fn(([position, mipLevel]) => (
      sampleDensity(position, { coverage: shape.coverage, mipLevel }).density
    )).setLayout({
      name: `${functionName}Shadow`,
      type: 'float',
      inputs: [
        { name: 'position', type: 'vec3' },
        { name: 'mipLevel', type: 'float' },
      ],
    }),
  }));

  // What callers hold: an inline shim whose entire body is one call to the
  // laid-out function, so the per-build lookup happens where the builder is in
  // scope and the field is still emitted once per build rather than inlined per
  // march step. The shim itself carries no state, so it is safe to hand to any
  // number of foreign graphs — which `SkySystem.cloudShadow` does.
  const sampleDensityNode = Fn(
    ([position], builder) => laidOut(builder).sampleDensity(position),
    'vec3',
  );
  const sampleCoarseDensityNode = Fn(
    ([position], builder) => laidOut(builder).sampleCoarseDensity(position),
    'float',
  );
  const sampleLightDensityNode = Fn(
    ([position, viewDistance], builder) => (
      laidOut(builder).sampleLightDensity(position, viewDistance)
    ),
    'float',
  );
  const sampleCoarseLightDensityNode = Fn(
    ([position, viewDistance], builder) => (
      laidOut(builder).sampleCoarseLightDensity(position, viewDistance)
    ),
    'float',
  );
  const sampleShadowDensityNode = Fn(
    ([position, mipLevel], builder) => (
      laidOut(builder).sampleShadowDensity(position, mipLevel)
    ),
    'float',
  );

  return {
    baseShapeNode,
    curlNode,
    erosionNode,
    functionName,
    coarseFunctionName,
    sampleCoarseDensityNode,
    sampleCoarseLightDensityNode,
    sampleDensityNode,
    sampleLightDensityNode,
    sampleShadowDensityNode,
    weatherNode,
  };
}

/**
 * Builds the light march as one laid-out TSL function.
 *
 * Returns the optical depth from a sample toward `lightDirection`: six graded
 * steps over one shell thickness, spread into a cone oriented on the light,
 * already multiplied by `shape.density` so the caller has a dimensionless depth.
 *
 * Surface samples march the full field. Only after the
 * accumulated view alpha passes 0.7 do the hidden interior samples switch to
 * the cheaper base-only upper bound. The first cone tap reuses the primary
 * density rather than fetching the field again.
 */
function createCloudLightMarch({
  shape,
  sampleDensityNode,
  sampleCoarseDensityNode,
  name = 'cloudLightDepth',
}) {
  const weights = Array.from(
    { length: CLOUD_LIGHT_MARCH_STEPS },
    (unused, index) => CLOUD_LIGHT_MARCH_GROWTH ** index,
  );

  volumeId += 1;
  const functionName = `${name}${volumeId}`;

  // Per build, for the reason `buildScoped` gives: this body reads
  // `shape.thickness` and `shape.density` off the object group by generated name,
  // and it inlines the reduced density field's own bindings through the call it
  // makes.
  const laidOutLightDepth = buildScoped(() => Fn(([
    position,
    lightDirection,
    useCheapDensity,
    originDensity,
    viewDistance,
  ]) => {
    // Basis for the cone. The reference axis is whichever of world up and world
    // right the light is least aligned with, chosen by a `step` rather than a
    // branch, so the cross product never degenerates at any sun elevation.
    const reference = mix(vec3(0, 1, 0), vec3(1, 0, 0), step(0.9, lightDirection.y.abs()));
    const tangent = normalize(cross(lightDirection, reference)).toVar();
    const bitangent = cross(lightDirection, tangent).toVar();
    const depth = float(0).toVar();
    for (let index = 0; index < CLOUD_LIGHT_MARCH_STEPS; index += 1) {
      const stepCoef = weights[index];
      const stepLength = CLOUD_LIGHT_STEP_SIZE * stepCoef;
      if (index === 0) {
        depth.addAssign(originDensity.mul(stepLength));
        continue;
      }
      const startCoef = (stepCoef - 1) / (CLOUD_LIGHT_MARCH_GROWTH - 1);
      const mid = CLOUD_LIGHT_STEP_SIZE * (startCoef + stepCoef * 0.5);
      const offset = CLOUD_LIGHT_CONE_OFFSETS[index];
      const spread = float(mid).mul(CLOUD_LIGHT_CONE_SPREAD);
      const samplePosition = position
        .add(lightDirection.mul(mid))
        .add(tangent.mul(offset[0]).add(bitangent.mul(offset[1])).mul(spread));
      const lightDensity = float(0).toVar();
      If(useCheapDensity.greaterThan(0.5), () => {
        lightDensity.assign(sampleCoarseDensityNode(samplePosition, viewDistance));
      }).Else(() => {
        lightDensity.assign(sampleDensityNode(samplePosition, viewDistance));
      });
      depth.addAssign(lightDensity.mul(stepLength));
    }
    return depth.mul(max(shape.density, 0));
  }).setLayout({
    name: functionName,
    type: 'float',
    inputs: [
      { name: 'position', type: 'vec3' },
      { name: 'lightDirection', type: 'vec3' },
      { name: 'useCheapDensity', type: 'float' },
      { name: 'originDensity', type: 'float' },
      { name: 'viewDistance', type: 'float' },
    ],
  }));

  const lightDepthNode = Fn(
    ([position, lightDirection, useCheapDensity, originDensity, viewDistance], builder) => (
      laidOutLightDepth(builder)(
        position,
        lightDirection,
        useCheapDensity,
        originDensity,
        viewDistance,
      )
    ),
    'float',
  );

  return { functionName, lightDepthNode, stepWeights: Object.freeze(weights) };
}

/**
 * The primary march. Emitted inline rather than wrapped in `Fn` because the
 * caller needs the radiance, the transmittance and the mean cloud distance, and
 * a TSL function returns one value.
 *
 * The segment integral is Hillaire's energy-conserving form: for a constant
 * medium over a step, `integral(T * S) = albedo * L_in * (1 - exp(-sigma dt))`,
 * which is exact rather than the midpoint approximation and does not fall apart
 * when `sigma dt` is large — which it is, at 0.048 1/m over a 300 m step.
 */
export function marchCloud({
  shell,
  cameraPosition,
  viewDir,
  densityNode,
  coarseDensityNode = null,
  lightDepthNode,
  inScatterNode,
  shape,
  sunDirection,
  moonDirection,
  nightFactor,
  cosSun,
  cosMoon,
  sunRadiance,
  zenithRadiance,
  horizonRadiance,
  groundBounceRadiance,
  moonRadiance,
  jitter,
  stepConeAngle = float(0.003),
  surfaceLighting = float(1),
  steps = CLOUD_PRIMARY_MARCH_STEPS,
}) {
  const scattered = vec3(0).toVar();
  const weightedPhysicalLight = float(0).toVar();
  const transmittance = float(1).toVar();
  const weightedDistance = float(0).toVar();
  const weightedSunlight = float(0).toVar();
  const weightedSunlitHeight = float(0).toVar();
  const surfacePhysicalLight = float(0).toVar();
  const surfaceSunlight = float(0).toVar();
  const surfaceSunlitHeight = float(0).toVar();
  const surfaceSunFacing = float(0.5).toVar();
  const surfaceLightSet = float(0).toVar();
  const weightSum = float(0).toVar();
  const hitDistance = float(1e6).toVar();

  const recordSurfaceLight = ({
    heightFraction,
    inScatterSample,
    lightOpticalDepth,
    position,
    weight,
  }) => {
    If(
      float(surfaceLighting).greaterThan(0).and(surfaceLightSet.lessThan(0.5))
        .and(weight.greaterThan(CLOUD_SURFACE_LIGHT_MIN_WEIGHT)),
      () => {
        const radius = CLOUD_SURFACE_NORMAL_RADIUS;
        // Use the broad envelope for the lighting normal. Including the full
        // erosion field here turns sub-pixel wisps into glittering normal
        // changes; opacity already retains that detail at the physical edge.
        const sampleSurfaceDensity = coarseDensityNode
          ? (samplePosition) => coarseDensityNode(samplePosition)
          : (samplePosition) => densityNode(samplePosition).x;
        const gradient = vec3(
          sampleSurfaceDensity(position.add(vec3(radius, 0, 0)))
            .sub(sampleSurfaceDensity(position.sub(vec3(radius, 0, 0)))),
          sampleSurfaceDensity(position.add(vec3(0, radius, 0)))
            .sub(sampleSurfaceDensity(position.sub(vec3(0, radius, 0)))),
          sampleSurfaceDensity(position.add(vec3(0, 0, radius)))
            .sub(sampleSurfaceDensity(position.sub(vec3(0, 0, radius)))),
        ).toVar();
        const outwardNormal = normalize(mix(
          vec3(0, 1, 0),
          gradient.negate(),
          step(1e-5, length(gradient)),
        )).toVar();
        const sunlight = exp(lightOpticalDepth.negate()).toVar();
        surfacePhysicalLight.assign(inScatterSample.a);
        surfaceSunlight.assign(sunlight);
        surfaceSunFacing.assign(smoothstep(-0.15, 0.85, outwardNormal.dot(sunDirection)));
        surfaceSunlitHeight.assign(
          heightFraction.mul(mix(
            CLOUD_WHITE_TOP_MIN_SUN_REACH,
            1,
            exp(lightOpticalDepth.mul(CLOUD_WHITE_TOP_DEPTH_SCALE).negate()),
          )),
        );
        surfaceLightSet.assign(1);
      },
    );
  };

  If(shell.hit.greaterThan(0.5), () => {
    const thickness = max(shape.thickness, 1).toVar();
    // These are fixed world-space steps, not a shell-span subdivision.
    // The fine stride follows the pixel footprint with distance but never drops
    // below 25 m. Empty regions use a 4x stride; occupied surfaces then adapt
    // the integration step so no sample contributes more than tau=0.5.
    const getStepSizeNode = (distance) => max(
      float(CLOUD_BASE_STEP_SIZE),
      float(CLOUD_STEP_CONE_FACTOR).mul(stepConeAngle).mul(distance),
    );
    const t = shell.tStart.add(getStepSizeNode(shell.tStart).mul(jitter)).toVar();
    const stepSize = float(CLOUD_BASE_STEP_SIZE * CLOUD_COARSE_STEP_SCALE).toVar();
    const coarseMode = float(coarseDensityNode ? 1 : 0).toVar();
    const emptyFineSamples = float(0).toVar();
    const opticalDepthAccum = float(0).toVar();

    Loop(steps, () => {
      // Early out. Without it an overcast sky costs the same as a clear one,
      // and 128 steps is not a budget that survives being spent twice.
      If(transmittance.lessThan(CLOUD_TRANSMITTANCE_EPSILON), () => {
        // Once the interior is opaque, the remaining samples cannot affect
        // sub-threshold transmission is discarded before exiting the loop.
        transmittance.assign(0);
        Break();
      });
      If(t.greaterThanEqual(shell.tEnd), () => {
        Break();
      });

      const position = cameraPosition.add(viewDir.mul(t)).toVar();
      const effectiveBaseStep = getStepSizeNode(t).toVar();
      const effectiveLargeStep = effectiveBaseStep.mul(CLOUD_COARSE_STEP_SCALE).toVar();
      if (coarseDensityNode) {
        If(coarseMode.greaterThan(0.5), () => {
          const coarseDensity = coarseDensityNode(position).toVar();
          If(coarseDensity.greaterThan(CLOUD_DENSITY_EPSILON), () => {
            // The cheap density is an upper bound because the detail field only
            // erodes it. Confirm the full field before paying for fine steps.
            const confirmed = densityNode(position).x.toVar();
            If(confirmed.greaterThan(CLOUD_DENSITY_EPSILON), () => {
              t.assign(max(shell.tStart, t.sub(effectiveLargeStep)));
              coarseMode.assign(0);
              emptyFineSamples.assign(0);
              stepSize.assign(effectiveBaseStep);
            }).Else(() => {
              stepSize.assign(effectiveLargeStep);
            });
          }).Else(() => {
            stepSize.assign(effectiveLargeStep);
          });
        }).Else(() => {
          const sample = densityNode(position).toVar();
          const normalizedDensity = sample.x.toVar();

          If(normalizedDensity.greaterThan(CLOUD_DENSITY_EPSILON), () => {
            emptyFineSamples.assign(0);
            If(hitDistance.greaterThanEqual(1e6), () => {
              hitDistance.assign(t);
            });
            const heightFraction = sample.y.toVar();
            const extinction = normalizedDensity.mul(max(shape.density, 0)).toVar();
            const surfaceCoreStep = clamp(
              float(CLOUD_MAX_OPTICAL_DEPTH_PER_STEP).div(max(extinction, 1e-6)),
              effectiveBaseStep.mul(CLOUD_CORE_STEP_MIN_SCALE),
              effectiveBaseStep,
            ).toVar();
            const interiorOpenness = smoothstep(
              CLOUD_INTERIOR_COARSEN_START,
              CLOUD_INTERIOR_COARSEN_FULL,
              opticalDepthAccum,
            ).toVar();
            const coreStep = min(shell.tEnd.sub(t), mix(
              surfaceCoreStep,
              effectiveBaseStep.mul(CLOUD_INTERIOR_STEP_SCALE),
              interiorOpenness,
            )).toVar();
            stepSize.assign(coreStep);
            const cheapLight = step(0.3, transmittance).oneMinus().toVar();
            const lightOpticalDepth = lightDepthNode(
              position,
              sunDirection,
              cheapLight,
              normalizedDensity,
              t,
            ).toVar();
            const moonLightOpticalDepth = float(0).toVar();
            If(float(nightFactor).greaterThan(1e-4), () => {
              moonLightOpticalDepth.assign(lightDepthNode(
                position,
                moonDirection,
                cheapLight,
                normalizedDensity,
                t,
              ));
            });
            const inScatterSample = inScatterNode(
              heightFraction,
              sample.z,
              extinction,
              lightOpticalDepth,
              moonLightOpticalDepth,
              thickness.mul(heightFraction.oneMinus()),
              thickness.mul(heightFraction),
              cosSun,
              cosMoon,
              sunRadiance,
              zenithRadiance,
              horizonRadiance,
              groundBounceRadiance,
              moonRadiance,
            ).toVar();
            const inScatter = inScatterSample.rgb.toVar();

            const sampleTransmittance = exp(extinction.mul(coreStep).negate()).toVar();
            const weight = transmittance.mul(sampleTransmittance.oneMinus()).toVar();
            recordSurfaceLight({
              heightFraction,
              inScatterSample,
              lightOpticalDepth,
              position,
              weight,
            });
            scattered.addAssign(inScatter.mul(weight));
            weightedPhysicalLight.addAssign(inScatterSample.a.mul(weight));
            weightedDistance.addAssign(t.mul(weight));
            weightedSunlight.addAssign(exp(lightOpticalDepth.negate()).mul(weight));
            weightedSunlitHeight.addAssign(
              heightFraction
                .mul(mix(
                  CLOUD_WHITE_TOP_MIN_SUN_REACH,
                  1,
                  exp(lightOpticalDepth.mul(CLOUD_WHITE_TOP_DEPTH_SCALE).negate()),
                ))
                .mul(weight),
            );
            weightSum.addAssign(weight);
            transmittance.mulAssign(sampleTransmittance);
            opticalDepthAccum.addAssign(extinction.mul(coreStep));
          }).Else(() => {
            emptyFineSamples.addAssign(1);
            stepSize.assign(effectiveBaseStep);
            If(emptyFineSamples.greaterThanEqual(CLOUD_FINE_EMPTY_LIMIT), () => {
              coarseMode.assign(1);
              stepSize.assign(effectiveLargeStep);
            });
          });
        });
      } else {
        const sample = densityNode(position).toVar();
        const normalizedDensity = sample.x.toVar();
        If(normalizedDensity.greaterThan(CLOUD_DENSITY_EPSILON), () => {
          If(hitDistance.greaterThanEqual(1e6), () => {
            hitDistance.assign(t);
          });
          const heightFraction = sample.y.toVar();
          const extinction = normalizedDensity.mul(max(shape.density, 0)).toVar();
          const surfaceCoreStep = clamp(
            float(CLOUD_MAX_OPTICAL_DEPTH_PER_STEP).div(max(extinction, 1e-6)),
            effectiveBaseStep.mul(CLOUD_CORE_STEP_MIN_SCALE),
            effectiveBaseStep,
          ).toVar();
          const interiorOpenness = smoothstep(
            CLOUD_INTERIOR_COARSEN_START,
            CLOUD_INTERIOR_COARSEN_FULL,
            opticalDepthAccum,
          ).toVar();
          const coreStep = min(shell.tEnd.sub(t), mix(
            surfaceCoreStep,
            effectiveBaseStep.mul(CLOUD_INTERIOR_STEP_SCALE),
            interiorOpenness,
          )).toVar();
          stepSize.assign(coreStep);
          const cheapLight = step(0.3, transmittance).oneMinus().toVar();
          const lightOpticalDepth = lightDepthNode(
            position,
            sunDirection,
            cheapLight,
            normalizedDensity,
            t,
          ).toVar();
          const moonLightOpticalDepth = float(0).toVar();
          If(float(nightFactor).greaterThan(1e-4), () => {
            moonLightOpticalDepth.assign(lightDepthNode(
              position,
              moonDirection,
              cheapLight,
              normalizedDensity,
              t,
            ));
          });
          const inScatterSample = inScatterNode(
            heightFraction,
            sample.z,
            extinction,
            lightOpticalDepth,
            moonLightOpticalDepth,
            thickness.mul(heightFraction.oneMinus()),
            thickness.mul(heightFraction),
            cosSun,
            cosMoon,
            sunRadiance,
            zenithRadiance,
            horizonRadiance,
            groundBounceRadiance,
            moonRadiance,
          ).toVar();
          const inScatter = inScatterSample.rgb.toVar();
          const sampleTransmittance = exp(extinction.mul(coreStep).negate()).toVar();
          const weight = transmittance.mul(sampleTransmittance.oneMinus()).toVar();
          recordSurfaceLight({
            heightFraction,
            inScatterSample,
            lightOpticalDepth,
            position,
            weight,
          });
          scattered.addAssign(inScatter.mul(weight));
          weightedPhysicalLight.addAssign(inScatterSample.a.mul(weight));
          weightedDistance.addAssign(t.mul(weight));
          weightedSunlight.addAssign(exp(lightOpticalDepth.negate()).mul(weight));
          weightedSunlitHeight.addAssign(
            heightFraction
              .mul(mix(
                CLOUD_WHITE_TOP_MIN_SUN_REACH,
                1,
                exp(lightOpticalDepth.mul(CLOUD_WHITE_TOP_DEPTH_SCALE).negate()),
              ))
              .mul(weight),
          );
          weightSum.addAssign(weight);
          transmittance.mulAssign(sampleTransmittance);
          opticalDepthAccum.addAssign(extinction.mul(coreStep));
        }).Else(() => {
          stepSize.assign(effectiveBaseStep);
        });
      }
      t.addAssign(stepSize);
    });
  });

  // Fallback distance when nothing was accumulated. `shell.tEnd` is deliberately
  // left negative on a miss and `tStart` is then an unused root that can be
  // planet-scale, so the fallback is clamped into the shell rather than trusted:
  // it feeds the aerial perspective, and an unclamped 6e6 there would ask the
  // transmittance table for a point outside the atmosphere.
  const midShell = shell.tStart.add(shell.tEnd).mul(0.5);
  const fallback = mix(midShell, weightedDistance.div(max(weightSum, 1e-6)), step(1e-6, weightSum));
  const physicalLight = weightedPhysicalLight.div(max(weightSum, 1e-6)).toVar();
  const sunlight = weightedSunlight.div(max(weightSum, 1e-6)).toVar();
  const sunlitHeight = weightedSunlitHeight.div(max(weightSum, 1e-6)).toVar();
  return {
    alpha: transmittance.oneMinus().toVar(),
    hitDistance,
    meanDistance: clamp(fallback, 1, max(shell.tEnd, 1)).toVar(),
    physicalLight,
    scattered,
    sunlight,
    sunlitHeight: sunlitHeight.mul(CLOUD_WHITE_TOP_HEIGHT_GAIN).toVar(),
    surfacePhysicalLight: mix(physicalLight, surfacePhysicalLight, surfaceLightSet).toVar(),
    surfaceSunlight: mix(sunlight, surfaceSunlight, surfaceLightSet).toVar(),
    surfaceSunFacing: mix(float(0.5), surfaceSunFacing, surfaceLightSet).toVar(),
    surfaceSunlitHeight: mix(sunlitHeight, surfaceSunlitHeight, surfaceLightSet)
      .mul(CLOUD_WHITE_TOP_HEIGHT_GAIN)
      .toVar(),
    transmittance,
  };
}

function resolveVolumes({ quality, seed, volumes }) {
  const resolved = resolveQuality(quality);
  return {
    baseShape: volumes?.baseShape ?? getCloudBaseShapeVolume({ dims: resolved.baseShapeDims, seed }),
    cirrus: volumes?.cirrus ?? getCloudCirrusMap({ seed }),
    curl: volumes?.curl ?? getCurlNoiseVolume({ seed }),
    erosion: volumes?.erosion ?? getCloudErosionVolume({ seed }),
    quality: resolved,
    weather: volumes?.weather ?? getWeatherMap({ resolution: resolved.weatherMapResolution, seed }),
  };
}

/**
 * Builds the cloud raymarcher as a fullscreen-pass node material.
 *
 * A `NodeMaterial` with a `fragmentNode`, not a lit material with a `colorNode`:
 * the pass writes linear HDR radiance in RGB and view transmittance in A, and
 * neither may be touched by tone mapping or an output colour transform on its
 * way into the reconstruction buffer.
 *
 * The view ray is built from an explicit `rayBasis` uniform rather than from
 * TSL's `cameraPosition` / `cameraProjectionMatrixInverse`, for two reasons.
 * The pass is drawn with a fullscreen quad, whose own camera is what those
 * built-ins would report. And an inverse-projection unprojection needs an NDC z
 * whose range differs between WebGPU (0..1) and WebGL2 (-1..1), which is exactly
 * the kind of backend split this project cannot ship. Call `update(camera)`
 * once a frame to refresh it.
 */
export function createCloudVolumeMaterial({
  params,
  style = null,
  skyColor = null,
  atmosphere,
  scattering,
  sun,
  timeOfDay = null,
  quality = undefined,
  seed = 1,
  volumes = null,
  groundLevel = 0,
  name = 'ToonLabCloudVolume',
} = {}) {
  if (!params?.shape?.altitude || !params?.lighting || !params?.wind || !params?.fade) {
    throw new TypeError('createCloudVolumeMaterial needs a CloudParams instance.');
  }
  if (!atmosphere?.multipleScattering) {
    throw new TypeError('createCloudVolumeMaterial needs an atmosphere param group.');
  }
  if (!scattering?.transmittanceNode) {
    throw new TypeError('createCloudVolumeMaterial needs a scattering bake.');
  }
  if (!sun?.direction) {
    throw new TypeError('createCloudVolumeMaterial needs a sun.');
  }
  const budget = assertFixedMarchBudget();

  const { shape, lighting, wind, cirrus, haze, fade } = params;
  const resolved = resolveVolumes({ quality, seed, volumes });

  // Owned uniforms. The camera-derived three are written by `update(camera)`;
  // the two jitters are written by the reconstruction pass.
  const cameraPositionUniform = vectorUniform();
  const rayBasis = uniform(new THREE.Matrix3());
  const groundLevelUniform = uniform(groundLevel);
  const pixelJitter = uniform(new THREE.Vector2());
  const marchJitter = uniform(0.5);
  const pixelConeAngle = uniform(0.001);
  const stepConeAngle = uniform(0.003);
  const baseShapeResolution = uniform(resolved.baseShape?.image?.width ?? 64);
  const rayHitDistance = property('float', 'toonlabCloudRayHitDistance');
  const opaqueViewDistance = property('float', 'toonlabCloudOpaqueViewDistance');
  const sceneDepthFallback = new THREE.DataTexture(new Float32Array([65000]), 1, 1, THREE.RedFormat, THREE.FloatType);
  sceneDepthFallback.needsUpdate = true;
  const sceneDepthNode = texture(sceneDepthFallback);
  const sceneDepthEnabled = uniform(0);
  // A generated cirrus mask ships with the field; the 1x1 stand-in keeps the
  // graph stable when a host explicitly clears it. `cirrusEnabled` is the gate,
  // so setCirrusTexture(null) still removes the deck exactly.
  //
  // The filters are set explicitly because `DataTexture` defaults to
  // NearestFilter, which the node builders classify as unfilterable: the tap then
  // compiles to a `textureLoad` with a hand-rolled repeat wrap and no sampler
  // binding at all. `setCirrusTexture` only writes `TextureNode.value`, and a
  // TextureNode carries no `customCacheKey`, so swapping a filtered map in
  // afterwards does not invalidate the compiled program — the deck would stay
  // point-sampled for the life of the material. Both textures are filterable, so
  // the graph compiles to a `textureSample` once and the swap is a pure uniform
  // change.
  const cirrusFallback = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  cirrusFallback.name = `${name}CirrusFallback`;
  cirrusFallback.colorSpace = THREE.NoColorSpace;
  cirrusFallback.wrapS = THREE.RepeatWrapping;
  cirrusFallback.wrapT = THREE.RepeatWrapping;
  cirrusFallback.minFilter = THREE.LinearFilter;
  cirrusFallback.magFilter = THREE.LinearFilter;
  cirrusFallback.generateMipmaps = false;
  cirrusFallback.needsUpdate = true;
  const cirrusEnabled = uniform(resolved.cirrus?.isTexture ? 1 : 0);
  const cirrusNode = texture(resolved.cirrus?.isTexture ? resolved.cirrus : cirrusFallback);

  const moonDirection = timeOfDay?.moonDirection ?? vectorUniform(0, -1, 0);
  const moonColor = timeOfDay?.moonColor ?? uniform(new THREE.Color(0, 0, 0));
  const moonIntensity = timeOfDay?.moonIntensity ?? uniform(0);

  const field = createCloudDensityField({
    baseShapeVolume: resolved.baseShape,
    baseShapeResolution,
    cameraAltitude: max(cameraPositionUniform.y.sub(groundLevelUniform), 0.5),
    cameraPosition: cameraPositionUniform,
    curlVolume: resolved.curl,
    erosionVolume: resolved.erosion,
    pixelConeAngle,
    shape,
    weatherMap: resolved.weather,
    wind,
  });
  const light = createCloudLightMarch({
    sampleCoarseDensityNode: field.sampleCoarseLightDensityNode,
    sampleDensityNode: field.sampleLightDensityNode,
    shape,
  });
  const model = createCloudLightingModel({ atmosphere, lighting, style, timeOfDay });
  const ambientSky = new AmbientSkyBaker();
  ambientSky.update(atmosphere, sun, lighting);
  // `createCloudLightingModel`'s in-scatter function is laid out too, and its
  // layout is not this module's to widen, so the model is re-created per build
  // and the graph below scatters through THAT one — same reason as `buildScoped`,
  // whose comment has the mechanism. The eagerly built model stays on the api
  // because what consumers take from it (`sunTransmittanceNode`, `keyLightNode`)
  // are inline node factories with no laid-out body to go stale.
  const scopedModel = buildScoped(
    () => createCloudLightingModel({ atmosphere, lighting, style, timeOfDay }),
  );
  const inScatterNode = Fn(
    (inputs, builder) => scopedModel(builder).inScatterNode(...inputs),
    'vec4',
  );

  const uniforms = {
    baseShapeResolution,
    cameraPosition: cameraPositionUniform,
    cirrusEnabled,
    groundLevel: groundLevelUniform,
    marchJitter,
    pixelConeAngle,
    pixelJitter,
    rayBasis,
    stepConeAngle,
    sceneDepthEnabled,
  };

  const material = new NodeMaterial();
  material.name = name;
  material.depthTest = false;
  material.depthWrite = false;
  material.transparent = false;
  material.toneMapped = false;
  material.blending = THREE.NoBlending;
  material.fog = false;
  material.uniforms = uniforms;

  const cloudColorNode = Fn(() => {
    // screenUV is top-left origin on both backends (three flips the WebGL frag
    // coord to the WebGPU convention), so NDC y is 1 - 2v.
    const ndc = vec2(
      screenUV.x.mul(2).sub(1),
      screenUV.y.mul(-2).add(1),
    ).add(pixelJitter).toVar();
    const viewDir = normalize(rayBasis.mul(vec3(ndc, 1))).toVar();
    opaqueViewDistance.assign(65000);
    If(sceneDepthEnabled.greaterThan(0.5), () => {
      const depthUv = vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5));
      opaqueViewDistance.assign(min(max(sceneDepthNode.sample(depthUv).r, 0), 65000));
    });
    const opaqueRayDistance = select(
      sceneDepthEnabled.greaterThan(0.5).and(opaqueViewDistance.lessThan(64000)),
      opaqueViewDistance.mul(length(rayBasis.mul(vec3(ndc, 1)))),
      float(1e20),
    ).toVar();
    const cameraAltitude = max(cameraPositionUniform.y.sub(groundLevelUniform), 0.5).toVar();

    const baseAltitude = max(shape.altitude, 0).toVar();
    const topAltitude = baseAltitude.add(max(shape.thickness, 1)).toVar();
    const shell = intersectCloudShell({
      baseAltitude,
      cameraAltitude,
      maxDistance: min(fade.maxMarchDist, opaqueRayDistance),
      topAltitude,
      viewDir,
    });

    // --- light setup, once per pixel --------------------------------------
    const sunDirection = normalize(sun.direction).toVar();
    const cosSun = clamp(viewDir.dot(sunDirection), -1, 1).toVar();
    const moonLightDirection = normalize(moonDirection).toVar();
    const cosMoon = clamp(viewDir.dot(moonLightDirection), -1, 1).toVar();
    const sunIrradiance = sun.color.mul(sun.intensity).toVar();

    const deckAltitude = topAltitude.add(CLOUD_DECK_ALTITUDE_OFFSET).toVar();
    const sunRadiance = sunIrradiance.mul(ambientSky.sunTransmittance).toVar();
    const zenithRadiance = ambientSky.zenithRadiance.toVar();
    const horizonRadiance = ambientSky.horizonRadiance.toVar();
    const groundBounceRadiance = ambientSky.groundBounceRadiance.toVar();
    const moonRadiance = moonColor.mul(moonIntensity).toVar();

    // --- the volumetric march ---------------------------------------------
    const march = marchCloud({
      surfaceLighting: style?.surfaceLight
        ? style.enabled.mul(style.amount).mul(style.surfaceLight.enabled).mul(style.surfaceLight.amount)
        : float(0),
      cameraPosition: cameraPositionUniform,
      coarseDensityNode: field.sampleCoarseDensityNode,
      cosMoon,
      cosSun,
      densityNode: field.sampleDensityNode,
      groundBounceRadiance,
      horizonRadiance,
      inScatterNode,
      jitter: marchJitter,
      lightDepthNode: light.lightDepthNode,
      moonDirection: moonLightDirection,
      moonRadiance,
      nightFactor: timeOfDay?.skyDarkness ?? float(0),
      shape,
      shell,
      stepConeAngle,
      zenithRadiance,
      sunDirection,
      sunRadiance,
      viewDir,
    });

    const scattered = march.scattered.toVar();
    const transmittance = march.transmittance.toVar();
    const volumeAlpha = transmittance.oneMinus().toVar();
    const surfaceLightAmount = style?.surfaceLight
      ? saturate(
        style.enabled
          .mul(style.amount)
          .mul(style.surfaceLight.enabled)
          .mul(style.surfaceLight.amount),
      ).toVar()
      : float(0);
    const whiteTopHeight = mix(
      march.sunlitHeight,
      march.surfaceSunlitHeight,
      surfaceLightAmount,
    ).toVar();
    const whiteTopPhysicalLight = mix(
      march.physicalLight,
      march.surfacePhysicalLight,
      surfaceLightAmount,
    ).toVar();
    const surfaceDirectionalSunlight = saturate(
      march.surfaceSunlight.mul(mix(
        0.15,
        1.35,
        pow(march.surfaceSunFacing, 1.2),
      )),
    ).toVar();
    const whiteTopSunlight = mix(
      march.sunlight,
      surfaceDirectionalSunlight,
      surfaceLightAmount,
    ).toVar();

    // Final-pixel paint. Tone and blue hue are per-sample lighting stages;
    // the shadow wash, white top, light blend, and time palette use resolved
    // opacity only as a colour mask, so density, transmittance and the physical
    // silhouette remain unchanged.
    const whiteTopDaylight = smoothstep(
      0.01,
      0.2,
      max(sunRadiance.dot(vec3(0.2126, 0.7152, 0.0722)), 0),
    ).toVar();
    scattered.assign(applyCloudInnerPaintNode(
      scattered,
      volumeAlpha,
      style,
      whiteTopDaylight,
    ));
    scattered.assign(applyCloudWhiteTopNode(
      scattered,
      volumeAlpha,
      whiteTopHeight.mul(whiteTopDaylight),
      style,
    ));
    scattered.assign(applyCloudTopLightNode(
      scattered,
      whiteTopPhysicalLight,
      whiteTopSunlight,
      volumeAlpha,
      whiteTopHeight,
      whiteTopDaylight,
      surfaceLightAmount,
      march.surfaceSunFacing,
      style,
    ));
    scattered.assign(applyCloudLightBlendNode(
      scattered,
      volumeAlpha,
      march.sunlitHeight,
      whiteTopDaylight,
      style,
    ));
    scattered.assign(applyCloudTimePaletteNode(
      scattered,
      volumeAlpha,
      march.sunlitHeight,
      timeOfDay?.morningLight ?? float(0),
      timeOfDay?.eveningLight ?? float(0),
      timeOfDay?.skyDarkness ?? float(0),
      style,
    ));

    // Apply aerial perspective to the cumulus result before adding
    // the high deck. Both the air transmittance and the in-scattered light come
    // from the same 12-step LUT-assisted atmosphere path as CloudMaterial.ts.
    If(march.hitDistance.lessThan(1e6), () => {
      const aerial = atmosphereRaymarchNodes({
        densityScale: fade.hazeDensityScale,
        maxDistanceKm: march.meanDistance.mul(0.001),
        mieDirectionalG: atmosphere.mieDirectionalG,
        mieScatteringStrength: atmosphere.mieScatteringStrength,
        scattering,
        skyMultipleScattering: atmosphere.skyMultipleScattering,
        sunDir: sunDirection,
        sunIrradiance: vec3(sun.intensity),
        viewDir,
      });
      scattered.assign(
        scattered.mul(aerial.transmittance).add(aerial.luminance.mul(volumeAlpha)),
      );

      // The melt converges cloud colour to the sky along the same view ray. It
      // does not reduce alpha: an opaque distant cloud still occludes the sun.
      const skyAlongRay = applySkyColorNode(atmosphereRaymarchNodes({
        mieDirectionalG: atmosphere.mieDirectionalG,
        mieScatteringStrength: atmosphere.mieScatteringStrength,
        scattering,
        skyMultipleScattering: atmosphere.skyMultipleScattering,
        sunDir: sunDirection,
        sunIrradiance: vec3(sun.intensity),
        viewDir,
      }).luminance, viewDir, skyColor, timeOfDay);
      const melt = smoothstep(
        fade.horizonMeltStart,
        max(fade.horizonMeltEnd, fade.horizonMeltStart.add(1)),
        march.meanDistance,
      );
      scattered.assign(mix(scattered, skyAlongRay.mul(volumeAlpha), melt));
    });

    // --- cirrus + haze deck ------------------------------------------------
    const deck = findCloudLayerCrossing({
      cameraAltitude,
      layerAltitude: deckAltitude,
      viewDir,
    });
    const deckDistance = deck.distance.toVar();
    const deckPosition = cameraPositionUniform
      .add(viewDir.mul(deckDistance))
      .sub(wind.offset)
      .toVar();
    // Slant path through a thin slab: a grazing view crosses more of it, which
    // is why a cirrus deck thickens toward the horizon on its own.
    const slant = min(
      float(1).div(max(viewDir.y.abs(), CLOUD_DECK_MIN_COS)),
      CLOUD_DECK_MAX_SLANT,
    ).rgb.toVar();
    const cirrusSample = cirrusNode
      .sample(deckPosition.xz.div(max(cirrus.scale, 1)))
      .r
      .mul(cirrusEnabled)
      .toVar();
    // Both decks saturate toward opaque rather than clipping, which is what
    // "high values saturate to fully opaque" has to mean for the 0-8 range
    // `haze.density` publishes.
    const cirrusOpacity = exp(
      cirrusSample.mul(max(cirrus.strength, 0)).mul(slant).negate(),
    ).oneMinus().toVar();
    // Haze is driven by coverage rather than a texture, so it thickens wherever
    // the cumulus below it do — on its own scale, not `shape.weatherScale`.
    const hazeCoverage = field.weatherNode
      .sample(deckPosition.xz.div(max(haze.scale, 1)))
      .r
      .mul(saturate(shape.coverage))
      .toVar();
    const hazeOpacity = exp(
      hazeCoverage.mul(max(haze.density, 0)).mul(slant).negate(),
    ).oneMinus().toVar();
    const deckOpacity = saturate(
      cirrusOpacity.oneMinus().mul(hazeOpacity.oneMinus()).oneMinus(),
    ).mul(step(0.5, deck.hit)).toVar();

    // The deck reuses the volumetric lighting model with a thin synthetic
    // sample: height fraction 1 (no base darkening on a cirrus deck), no slab
    // above or below (ambient and bounce arrive unattenuated), and a
    // self-shadow that grows with its own opacity. Its own opacity stands in for
    // the occupancy the powder term keys on, so a wisp of cirrus darkens the way
    // a wisp of cumulus does and a saturated storm haze is left alone.
    const deckRadiance = inScatterNode(
      float(1),
      deckOpacity,
      float(CLOUD_DECK_EXTINCTION),
      deckOpacity.mul(CLOUD_DECK_LIGHT_DEPTH),
      deckOpacity.mul(CLOUD_DECK_LIGHT_DEPTH),
      float(0),
      float(0),
      cosSun,
      cosMoon,
      sunRadiance,
      zenithRadiance,
      horizonRadiance,
      groundBounceRadiance,
      moonRadiance,
    ).rgb.toVar();

    // Composite the cirrus/haze deck behind the volumetric layer.
    deckOpacity.mulAssign(step(deckDistance, opaqueRayDistance));
    const deckTerm = deckRadiance.mul(deckOpacity).toVar();
    scattered.addAssign(deckTerm.mul(transmittance));
    transmittance.mulAssign(deckOpacity.oneMinus());

    rayHitDistance.assign(select(
      march.hitDistance.lessThan(1e6),
      min(march.hitDistance, float(60000)),
      float(65000),
    ));
    return vec4(max(scattered, vec3(0)), saturate(transmittance));
  })();
  // Carry first-hit distance beside cloud color. The attachment names
  // are matched by cloudReprojection's MRT render target.
  material.fragmentNode = mrt({
    output: cloudColorNode,
    rayHitDist: vec4(rayHitDistance, opaqueViewDistance, 0, 1),
  });

  const rightScratch = new THREE.Vector3();
  const upScratch = new THREE.Vector3();
  const forwardScratch = new THREE.Vector3();

  const api = {
    sceneDepthNode,
    /** Positive view-space depth (metres) in R; clear to >=65000. Host-owned. */
    setSceneDepthTexture(map = null) {
      if (map !== null && (!map?.isTexture || map.isDepthTexture)) {
        throw new TypeError('Cloud scene depth must be a linear view-distance color texture, not hardware depth.');
      }
      if (map && (map.colorSpace !== THREE.NoColorSpace
        || ![THREE.FloatType, THREE.HalfFloatType].includes(map.type)
        || map.minFilter !== THREE.NearestFilter || map.magFilter !== THREE.NearestFilter)) {
        throw new TypeError('Cloud scene depth requires a nearest-filtered float texture with NoColorSpace.');
      }
      sceneDepthNode.value = map ?? sceneDepthFallback;
      sceneDepthEnabled.value = map ? 1 : 0;
    },
    material,
    uniforms,
    marchBudget: budget,
    lighting: model,
    densityField: field,
    ambientSky,
    lightMarch: light,
    volumes: resolved,

    /**
     * Refreshes the camera-derived uniforms. Call once a frame, before the pass.
     *
     * `tanX`/`tanY` come from the projection matrix rather than from
     * `camera.fov`, so an authored or asymmetric projection still produces the
     * right rays, and a resize needs no extra call.
     */
    update(camera) {
      if (!camera?.isCamera) return null;
      camera.updateMatrixWorld();
      const world = camera.matrixWorld.elements;
      const projection = camera.projectionMatrix.elements;
      const tanX = projection[0] !== 0 ? 1 / projection[0] : 1;
      const tanY = projection[5] !== 0 ? 1 / projection[5] : 1;
      rightScratch.set(world[0], world[1], world[2]).normalize().multiplyScalar(tanX);
      upScratch.set(world[4], world[5], world[6]).normalize().multiplyScalar(tanY);
      forwardScratch.set(-world[8], -world[9], -world[10]).normalize();
      rayBasis.value.set(
        rightScratch.x, upScratch.x, forwardScratch.x,
        rightScratch.y, upScratch.y, forwardScratch.y,
        rightScratch.z, upScratch.z, forwardScratch.z,
      );
      cameraPositionUniform.value.setFromMatrixPosition(camera.matrixWorld);
      scattering.bakeIfNeeded();
      ambientSky.update(atmosphere, sun, lighting);
      return uniforms;
    },

    /** World Y treated as ground, metres. Shifts the whole shell with it. */
    get groundLevel() {
      return groundLevelUniform.value;
    },
    set groundLevel(value) {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      groundLevelUniform.value = next;
    },

    /**
     * Host-supplied cirrus texture, or null to hide the deck.
     *
     * Two properties are forced, and both are stated out loud rather than
     * silently, since they mutate the host's texture.
     *
     * The colour space, because `texture()` decodes an sRGB map to linear on
     * sample and this reads the red channel as an opacity mask: a decode would
     * bend the mask's midtones and quietly thin the deck.
     *
     * The filters, because the fragment graph was compiled against a filterable
     * texture. A NearestFilter map is classified as unfilterable by the node
     * builders, and a swap only writes `TextureNode.value` — it does not change
     * the graph's cache key, so the compiled `textureSample` would stay in place
     * and read an unfilterable binding. Point-sampling a cirrus deck also aliases
     * badly under `cirrus.scale`.
     */
    setCirrusTexture(map) {
      if (map?.isTexture) {
        if (map.colorSpace !== THREE.NoColorSpace) {
          console.warn(
            `[cloudVolume] Cirrus texture "${map.name || 'unnamed'}" colorSpace `
            + `"${map.colorSpace}" was set to NoColorSpace; the deck reads it as an opacity mask.`,
          );
          map.colorSpace = THREE.NoColorSpace;
          map.needsUpdate = true;
        }
        if (map.magFilter === THREE.NearestFilter || map.minFilter === THREE.NearestFilter) {
          console.warn(
            `[cloudVolume] Cirrus texture "${map.name || 'unnamed'}" was point-sampled; `
            + 'filters were set to LinearFilter so the deck matches the compiled shader.',
          );
          map.magFilter = THREE.LinearFilter;
          if (map.minFilter === THREE.NearestFilter) map.minFilter = THREE.LinearFilter;
          map.needsUpdate = true;
        }
        cirrusNode.value = map;
        cirrusEnabled.value = 1;
      } else {
        cirrusNode.value = cirrusFallback;
        cirrusEnabled.value = 0;
      }
      return api;
    },

    /**
     * Swaps a regenerated weather map or noise volume in place.
     *
     * Assigning the texture node's value rather than rebuilding the graph: a
     * rebuild would recompile the shader, and the sky-cloud lab regenerates the
     * weather map on every drag of a profile slider.
     */
    setVolumes({ baseShape, cirrus, curl, erosion, weather } = {}) {
      if (weather?.isTexture) {
        resolved.weather = weather;
        field.weatherNode.value = weather;
      }
      if (baseShape?.isTexture) {
        resolved.baseShape = baseShape;
        field.baseShapeNode.value = baseShape;
        baseShapeResolution.value = baseShape.image?.width ?? baseShapeResolution.value;
      }
      if (erosion?.isTexture) {
        resolved.erosion = erosion;
        field.erosionNode.value = erosion;
      }
      if (curl?.isTexture && field.curlNode) {
        resolved.curl = curl;
        field.curlNode.value = curl;
      }
      if (cirrus?.isTexture) {
        resolved.cirrus = cirrus;
        cirrusNode.value = cirrus;
        cirrusEnabled.value = 1;
      }
      return api;
    },

    /** Uploads the authored 3D mip pyramid once the WebGPU renderer exists. */
    prepareNoiseMipmaps(renderer) {
      return uploadNoiseVolumeMipChain(renderer, resolved.baseShape);
    },

    dispose() {
      sceneDepthFallback.dispose();
      cirrusFallback.dispose();
      material.dispose();
    },
  };

  material.userData.toonlabCloudVolume = api;
  return api;
}
