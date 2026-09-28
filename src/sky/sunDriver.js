// Sun, and the per-frame driver that walks it around the sky.
//
// The arc is the equinox arc at every latitude: the sun sits on the celestial
// equator, so it rises due east, transits at 90° − |latitude|, and sets due
// west along the same path every day — the spec's "no seasons". Two consequences
// worth stating, because the rest of the system leans on them: the moon, half a
// day behind on that same arc, is the exact antipode of the sun, and the
// sidereal day equals the solar day, so the stars keep a fixed relationship to
// both.
//
// The direction is solved as a rigid rotation of the observer's equatorial
// frame instead of through the textbook alt/az formulae. Those divide by
// cos(altitude) and cos(latitude), which blows up exactly where this system is
// asked to work: the zenith transit at latitude 0 and the poles at ±90.

import * as THREE from 'three';
import { uniform } from 'three/tsl';

import {
  col, describe, hasValue, isObject, readColorInto,
} from '../cloud/paramSchema.js';
import { moonPhaseTerms, wrapDayTime } from './timeOfDay.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TAU = Math.PI * 2;

export const DEFAULT_SUN_PARAMS = Object.freeze({
  // The docs publish no default position because the clock owns the direction.
  // These two are where the default clock (time 0.5, latitude 45) puts it, so
  // a sun built without a driver already stands where the first tick would.
  elevation: 45,
  azimuth: 180,
  intensity: 6.6,
  color: Object.freeze([1, 0.95, 0.85]),
  discSize: 0.0003,
});

/**
 * The `sun.color` descriptor, published here rather than in the SkyParams
 * envelope because this module clamps the live colour to it on every
 * applyParams and the envelope declares the same field. The envelope adopts it
 * verbatim, exactly as it adopts atmosphereParams' own table, so the channel
 * maximum has one definition instead of one per layer — and the live sun and the
 * preset written from it cannot be different colours.
 *
 * The tint is emissive, so it keeps HDR headroom above white: a warm sun is
 * authored past 1.
 */
export const SUN_COLOR_FIELD = col({
  description: 'Sun colour before the atmosphere absorbs any of it. Sunset reddening comes from the atmosphere, not here.',
  label: 'Colour',
  max: 4,
  value: DEFAULT_SUN_PARAMS.color,
});

// Radiance ramps in across the last few degrees of elevation. The band reaches
// zero a little *below* the horizon deliberately: cloud tops stay lit for some
// minutes after a ground observer's sunset, which is where alpenglow comes
// from. Anything steeper belongs in the atmospheric transmittance LUT — this
// fade must not double-count extinction the scattering pass already applies.
const SUN_FADE_BELOW = Math.sin(-3.5 * DEG2RAD);
const SUN_FADE_ABOVE = Math.sin(7 * DEG2RAD);

// Twilight: night terms are fully washed out while the sun is at or above the
// horizon and reach full strength once it is 12° down — nautical twilight,
// where the horizon stops being visible and the fainter stars come out.
const NIGHT_FULL_DEPTH = Math.sin(12 * DEG2RAD);

// Scratch for the celestial frame; the driver runs every frame and must not
// allocate.
const frameScratch = {
  pole: new THREE.Vector3(),
  meridian: new THREE.Vector3(),
  west: new THREE.Vector3(),
};

// Reads a number the way this module promises to: anything unreadable holds the
// caller's current value.
//
// `Number(value)` on its own is far too generous for a param reader — it maps
// `null`, `''`, `false` and `[7]` onto real numbers, so a preset carrying
// `intensity: null` would zero `peakIntensity` and take the whole sky with it.
// Only a genuine finite number counts, plus a string a host typed or parsed out
// of a URL/localStorage, since those legitimately arrive as text. Kept identical
// to the copy in timeOfDay.js: the two halves of this module must agree on what
// "readable" means.
function finiteOr(value, fallback) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

// The whole-argument guard, shared by createSun and applyParams.
//
// Every field read below is `next.something`, which throws outright on a
// non-object argument rather than falling back — and `params = {}` only fires
// for `undefined`, so `createSun(null)` reached the body and took the TypeError.
// A restored preset that failed to load, a `JSON.parse` of "null", and a host
// passing a cleared field all deliver exactly that. A non-object carries no
// subset of the sun params, so it writes nothing and says so, the way the cloud
// groups and the SkyParams envelope already do. `null` and `undefined` mean "not
// supplied" (paramSchema's hasValue) and pass quietly, as they do there.
function readParamBlock(value) {
  if (isObject(value)) return value;
  if (hasValue(value)) {
    console.warn(
      `[sunDriver] sun params must be an object (got ${describe(value)}); `
      + 'keeping the current values.',
    );
  }
  return {};
}

/** Unit direction from elevation/azimuth in degrees. 0 = +Z, 90 = +X. */
export function directionFromAngles(elevationDeg, azimuthDeg, target = new THREE.Vector3()) {
  const elevation = finiteOr(elevationDeg, 0) * DEG2RAD;
  const azimuth = finiteOr(azimuthDeg, 0) * DEG2RAD;
  const horizontal = Math.cos(elevation);
  return target.set(
    horizontal * Math.sin(azimuth),
    Math.sin(elevation),
    horizontal * Math.cos(azimuth),
  ).normalize();
}

/** Elevation of a unit direction, degrees. 0 horizon, 90 zenith. */
export function elevationOf(direction) {
  return Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) * RAD2DEG;
}

/** Compass azimuth of a direction, −180…180 degrees. 0 = +Z, 90 = +X. */
export function azimuthOf(direction) {
  // A direction solved on the meridian carries a *signed* zero in x (−sinφ·0),
  // and atan2 reads −0 as the negative branch: a driver-solved northern transit
  // would report −180 where the identical pose built from angles — and
  // DEFAULT_SUN_PARAMS.azimuth — reads +180. Nothing renders differently, but a
  // HUD readout and a preset captured from a driven sun would carry the opposite
  // sign from the documented default, so collapse the zero's sign here, at the
  // one place that turns a direction back into a bearing.
  const x = direction.x === 0 ? 0 : direction.x;
  return Math.atan2(x, direction.z) * RAD2DEG;
}

/**
 * Bearing of an azimuth in degrees, folded onto [0, 360).
 *
 * Used only to compare clock readings: the clock leaves `azimuth` unwrapped so a
 * preset round-trips what it authored, so 360 and 0 arrive as different numbers
 * for the same sky and must not read as a change.
 */
function bearingOf(azimuthDeg) {
  const value = finiteOr(azimuthDeg, 0) % 360;
  return value < 0 ? value + 360 : value;
}

/**
 * The observer's celestial frame in world space, already swung by the clock's
 * celestial azimuth. An orthonormal right-handed triple with
 * meridian × west = pole:
 *
 * - `pole` — north celestial pole: `latitude` above due north. At latitude 90
 *   it is the zenith, which is why everything then circles the horizon.
 * - `meridian` — where a body at declination 0 stands at hour angle 0 (upper
 *   transit): due south at 90° − latitude in the northern hemisphere, due
 *   north in the southern.
 * - `west` — the third axis. Hour angle runs toward it, so bodies drift this
 *   way as the day advances.
 *
 * Allocates a frame when none is passed. The per-frame callers below hand it
 * their own scratch instead — a shared default would alias between callers.
 */
export function celestialFrame(latitude, azimuth, target = {
  pole: new THREE.Vector3(),
  meridian: new THREE.Vector3(),
  west: new THREE.Vector3(),
}) {
  const phi = THREE.MathUtils.clamp(finiteOr(latitude, 0), -90, 90) * DEG2RAD;
  const swing = finiteOr(azimuth, 0) * DEG2RAD;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinSwing = Math.sin(swing);
  const cosSwing = Math.cos(swing);
  target.pole.set(cosPhi * sinSwing, sinPhi, cosPhi * cosSwing);
  target.meridian.set(-sinPhi * sinSwing, cosPhi, -sinPhi * cosSwing);
  target.west.set(-cosSwing, 0, sinSwing);
  return target;
}

/**
 * Unit direction toward the sun for a clock reading.
 *
 * Hour angle is zero at noon and runs a full turn per day, so time 0.25 lands
 * on −90° (due east, on the horizon at every latitude) and 0.75 on +90° (due
 * west).
 */
export function sunDirectionAt(time, latitude, azimuth, target = new THREE.Vector3()) {
  const hourAngle = (wrapDayTime(time) - 0.5) * TAU;
  const frame = celestialFrame(latitude, azimuth, frameScratch);
  return target
    .copy(frame.meridian)
    .multiplyScalar(Math.cos(hourAngle))
    .addScaledVector(frame.west, Math.sin(hourAngle))
    .normalize();
}

/**
 * World → celestial rotation for the star panorama, as a mat3.
 *
 * The target frame is fixed to the stars: +Y is the north celestial pole and
 * the XZ longitude follows this system's bearing convention (0 = +Z, 90 = +X).
 * It turns rigidly about the pole once per day, so star trails are circles
 * about the same axis the sun and moon swing around — tilted by latitude,
 * horizontal at the poles.
 *
 * The phase anchor: at time 0 the frame's +Z axis is at upper transit. That
 * puts the moon (antipodal to the sun, therefore at hour angle 0 at midnight)
 * permanently at longitude 0 and the sun at 180°, so the night sky is always
 * centred on the middle of the panorama and nothing drifts between days.
 *
 * Longitude in this frame runs opposite to right ascension. That is not a bug
 * to fix here: the celestial sphere is being viewed from the inside, and a
 * pure rotation is the only thing a mat3 uniform should carry. The panorama
 * sampler picks the u direction that matches its source map.
 */
export function starRotationAt(time, latitude, azimuth, target = new THREE.Matrix3()) {
  const sidereal = wrapDayTime(time) * TAU;
  const frame = celestialFrame(latitude, azimuth, frameScratch);
  const cos = Math.cos(sidereal);
  const sin = Math.sin(sidereal);

  // +Z: the meridian at time 0, carried west as the day turns.
  const zx = frame.meridian.x * cos + frame.west.x * sin;
  const zy = frame.meridian.y * cos + frame.west.y * sin;
  const zz = frame.meridian.z * cos + frame.west.z * sin;
  // +X: completes a right-handed triple with the pole, x × y = z.
  const xx = frame.west.x * cos - frame.meridian.x * sin;
  const xy = frame.west.y * cos - frame.meridian.y * sin;
  const xz = frame.west.z * cos - frame.meridian.z * sin;

  // Rows project a world direction onto each celestial axis.
  return target.set(
    xx, xy, xz,
    frame.pole.x, frame.pole.y, frame.pole.z,
    zx, zy, zz,
  );
}

/** Sun radiance multiplier for a direction's sin(elevation). 0 below, 1 in daylight. */
export function sunHorizonFade(sinElevation) {
  return THREE.MathUtils.smoothstep(finiteOr(sinElevation, 0), SUN_FADE_BELOW, SUN_FADE_ABOVE);
}

/** How night it is, from a sun direction's sin(elevation). 0 by day, 1 past nautical twilight. */
export function skyDarknessFor(sinElevation) {
  return THREE.MathUtils.smoothstep(-finiteOr(sinElevation, 0), 0, NIGHT_FULL_DEPTH);
}

/**
 * Shared morning/evening/night weights for every optional time-based style.
 * Daylight outside the low-sun band returns exact zero for all three values.
 */
export function timeStyleWeightsFor(sinElevation, time, target = {}) {
  const sunHeight = Math.abs(THREE.MathUtils.clamp(finiteOr(sinElevation, 0), -1, 1));
  const night = skyDarknessFor(sinElevation);
  const lowSun = (1 - THREE.MathUtils.smoothstep(sunHeight, 0.02, 0.35)) * (1 - night);
  const eveningSide = THREE.MathUtils.smoothstep(wrapDayTime(time), 0.48, 0.52);
  target.morning = lowSun * (1 - eveningSide);
  target.evening = lowSun * eveningSide;
  target.night = night;
  return target;
}

/**
 * The sun: direction, brightness, tint, disc size. Read by the sky dome, the
 * cloud lighting, the shadow bake, and the god rays.
 *
 * `peakIntensity` is the brightness anchor for the whole sky and a plain field;
 * the `intensity` uniform is that anchor times the horizon fade and is rewritten
 * every frame by the driver.
 */
export function createSun(params = {}) {
  const sun = {
    direction: uniform(directionFromAngles(
      DEFAULT_SUN_PARAMS.elevation,
      DEFAULT_SUN_PARAMS.azimuth,
      new THREE.Vector3(),
    )),
    intensity: uniform(DEFAULT_SUN_PARAMS.intensity),
    color: uniform(new THREE.Color().setRGB(
      DEFAULT_SUN_PARAMS.color[0],
      DEFAULT_SUN_PARAMS.color[1],
      DEFAULT_SUN_PARAMS.color[2],
      THREE.LinearSRGBColorSpace,
    )),
    discSize: uniform(DEFAULT_SUN_PARAMS.discSize),

    peakIntensity: DEFAULT_SUN_PARAMS.intensity,

    get elevationDeg() {
      return elevationOf(sun.direction.value);
    },
    get azimuthDeg() {
      return azimuthOf(sun.direction.value);
    },

    setFromAngles(elevationDeg, azimuthDeg) {
      directionFromAngles(elevationDeg, azimuthDeg, sun.direction.value);
      refreshIntensity();
    },

    applyParams(next = {}) {
      const source = readParamBlock(next);
      // Either angle alone keeps the other where it is, so a preset can nudge
      // elevation without knowing the compass. finiteOr does that job:
      // an absent or unreadable angle decomposes back out of the direction.
      if (source.elevation !== undefined || source.azimuth !== undefined) {
        directionFromAngles(
          finiteOr(source.elevation, sun.elevationDeg),
          finiteOr(source.azimuth, sun.azimuthDeg),
          sun.direction.value,
        );
      }
      if (source.intensity !== undefined) {
        sun.peakIntensity = Math.max(0, finiteOr(source.intensity, sun.peakIntensity));
      }
      if (source.color !== undefined) {
        readColorInto('[sunDriver] sun.color', SUN_COLOR_FIELD, source.color, sun.color.value);
      }
      if (source.discSize !== undefined) {
        // 1 − cos θ, same convention as the moon.
        sun.discSize.value = THREE.MathUtils.clamp(
          finiteOr(source.discSize, sun.discSize.value),
          0,
          2,
        );
      }
      refreshIntensity();
    },

    toParams() {
      return {
        elevation: sun.elevationDeg,
        azimuth: sun.azimuthDeg,
        intensity: sun.peakIntensity,
        color: new THREE.Color().copy(sun.color.value),
        discSize: sun.discSize.value,
      };
    },
  };

  // Keeps the per-frame uniform honest for hosts that read or bake before the
  // first driver tick.
  function refreshIntensity() {
    sun.intensity.value = sun.peakIntensity * sunHorizonFade(sun.direction.value.y);
  }

  sun.applyParams(params);
  return sun;
}

/**
 * Per-frame driver. Advances the clock, solves the celestial arc, and writes
 * every derived uniform the sky reads.
 *
 * Ownership of `sun.direction` is shared: the clock claims it while it is
 * moving or whenever `time`, `latitude`, or `azimuth` changes, and otherwise
 * leaves it alone — which is what makes a `setFromAngles()` pose stick once
 * `autoAdvanceSecondsPerDay` is 0.
 *
 * Everything else is derived from `sun.direction` as it stands after that, not
 * from the clock, so a hand-placed sun still gets a moon opposite it, a matching
 * horizon fade, and the right amount of night.
 *
 * A paused clock therefore never claims the direction on its own: it adopts its
 * opening reading without solving, so the natural construction order (clock,
 * sun from `params.sun`, driver) keeps an authored sun. Any later move of
 * `time`, `latitude`, or `azimuth` still takes the direction back, and a running
 * clock always wins.
 */
export function createSunDriver({ sun, timeOfDay } = {}) {
  // foldTime is how the driver reads the clock without a junk write snapping it,
  // so a clock that predates it is not drivable — say so rather than throwing a
  // TypeError on the first tick.
  if (!sun?.direction || !timeOfDay?.time || typeof timeOfDay.foldTime !== 'function') {
    throw new Error('createSunDriver requires { sun, timeOfDay }');
  }

  // Last clock reading the direction was solved from — `bearing` rather than the
  // raw azimuth so a host re-emitting 360 for 0 is not mistaken for a move.
  // `hasReading` is false only before the first apply(): with the clock paused
  // that first pass records the reading and leaves the sun alone, which is what
  // "0 pauses, which also frees sun.direction" has to mean from construction on.
  const driven = { time: 0, latitude: 0, bearing: 0 };
  let hasReading = false;
  const phase = { illumination: 0, sin: 0, cos: 0 };
  const styleWeights = { morning: 0, evening: 0, night: 0 };

  // Mutated in place and returned by update(); a lab HUD can hold onto it.
  const state = {
    time: 0,
    sunElevationDeg: 0,
    sunAzimuthDeg: 0,
    sunIntensity: 0,
    moonElevationDeg: 0,
    moonAzimuthDeg: 0,
    moonIllumination: 0,
    skyDarkness: 0,
    morningLight: 0,
    eveningLight: 0,
  };

  function apply() {
    // Folds a host's direct write (or an out-of-range scrub) back into range,
    // holding the last readable reading if the write was junk.
    const time = timeOfDay.foldTime();
    const { latitude, azimuth } = timeOfDay;
    const bearing = bearingOf(azimuth);

    const clockMoved = hasReading
      && (time !== driven.time || latitude !== driven.latitude || bearing !== driven.bearing);
    if (clockMoved || timeOfDay.autoAdvanceSecondsPerDay > 0) {
      sunDirectionAt(time, latitude, azimuth, sun.direction.value);
    }
    // Recorded on every pass, not only when the sun was solved, so the opening
    // pass of a paused clock adopts the reading it declined to solve from.
    driven.time = time;
    driven.latitude = latitude;
    driven.bearing = bearing;
    hasReading = true;

    const sunDirection = sun.direction.value;
    // Half a day behind on a declination-0 arc is the antipode, so the moon is
    // just the negated sun: highest at midnight, gone at noon.
    timeOfDay.moonDirection.value.copy(sunDirection).negate().normalize();
    sun.intensity.value = sun.peakIntensity * sunHorizonFade(sunDirection.y);
    timeOfDay.skyDarkness.value = skyDarknessFor(sunDirection.y);
    timeStyleWeightsFor(sunDirection.y, time, styleWeights);
    timeOfDay.morningLight.value = styleWeights.morning;
    timeOfDay.eveningLight.value = styleWeights.evening;
    starRotationAt(time, latitude, azimuth, timeOfDay.starRotation.value);

    moonPhaseTerms(timeOfDay.moonPhase.value, phase);
    timeOfDay.moonPhaseIllumination.value = phase.illumination;
    timeOfDay.moonPhaseTrig.value.set(phase.sin, phase.cos);

    state.time = time;
    state.sunElevationDeg = elevationOf(sunDirection);
    state.sunAzimuthDeg = azimuthOf(sunDirection);
    state.sunIntensity = sun.intensity.value;
    state.moonElevationDeg = elevationOf(timeOfDay.moonDirection.value);
    state.moonAzimuthDeg = azimuthOf(timeOfDay.moonDirection.value);
    state.moonIllumination = phase.illumination;
    state.skyDarkness = timeOfDay.skyDarkness.value;
    state.morningLight = timeOfDay.morningLight.value;
    state.eveningLight = timeOfDay.eveningLight.value;
    return state;
  }

  // Driven uniforms must be valid before anything renders or bakes.
  apply();

  return {
    state,
    /** Advances the clock by dt seconds when it is running, then rewrites every driven uniform. */
    update(dt = 0) {
      const secondsPerDay = timeOfDay.autoAdvanceSecondsPerDay;
      if (secondsPerDay > 0) {
        // A degenerate rate (1e-300 s per day) overflows the increment, so the
        // advance is folded against the reading it started from: the clock holds
        // for that frame instead of landing on an arbitrary time of day.
        const from = timeOfDay.foldTime();
        timeOfDay.time.value = wrapDayTime(
          from + Math.max(0, finiteOr(dt, 0)) / secondsPerDay,
          from,
        );
      }
      return apply();
    },
    /** Re-solves without advancing — after applying a preset, or when scrubbing. */
    apply,
    /** Pole the stars, sun, and moon all turn about, in world space. */
    celestialPole(target = new THREE.Vector3()) {
      return target.copy(
        celestialFrame(timeOfDay.latitude, timeOfDay.azimuth, frameScratch).pole,
      );
    },
  };
}

/** The moon's arc: the sun's, half a day behind, which on this arc is its antipode. */
export function moonDirectionAt(time, latitude, azimuth, target = new THREE.Vector3()) {
  return sunDirectionAt(time, latitude, azimuth, target).negate();
}
