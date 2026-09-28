// Day/night clock for the volumetric sky.
//
// The clock owns three things and no geometry: where the day is (`time`),
// where on the globe the observer stands (`latitude`, `azimuth`), and the moon
// block. sunDriver.js reads that state every frame, solves the celestial arc,
// and writes the derived read-only uniforms declared here back into it.
//
// `time` is a uniform rather than a plain field because hosts scrub it
// directly (`timeOfDay.time.value = 0.85`) from sliders and cutscene tracks;
// there is no setter to wrap through, so the driver folds whatever it finds
// back into [0, 1) on the next tick.

import * as THREE from 'three';
import { uniform } from 'three/tsl';

import {
  col, describe, hasValue, isObject, readColorInto,
} from '../cloud/paramSchema.js';

export const DEFAULT_MOON_PARAMS = Object.freeze({
  phase: 0.5,
  intensity: 1,
  discBrightness: 9,
  angularSize: 0.0003,
  color: Object.freeze([0.7, 0.78, 0.95]),
  ambient: 0.015,
});

export const DEFAULT_TIME_OF_DAY_PARAMS = Object.freeze({
  time: 0.5,
  autoAdvanceSecondsPerDay: 600,
  latitude: 45,
  azimuth: 0,
  moon: DEFAULT_MOON_PARAMS,
});

/**
 * The `time.moon.color` descriptor, published here rather than in the SkyParams
 * envelope for the reason its sibling `sun.color` is published by sunDriver.js:
 * this module clamps the live colour to it on every applyParams and the envelope
 * declares the same field, so the channel maximum has one definition instead of
 * one per layer. Emissive like the sun tint, so it keeps its HDR headroom.
 */
export const MOON_COLOR_FIELD = col({
  description: 'Tints the moon disc, the sky ambient it casts, and the moonlight on cloud edges.',
  label: 'Moon Colour',
  max: 4,
  value: DEFAULT_MOON_PARAMS.color,
});

// Reads a number the way this module promises to: anything unreadable holds the
// caller's current value.
//
// `Number(value)` on its own is far too generous for a param reader — it maps
// `null`, `''`, `false` and `[7]` onto real numbers, so a JSON null, a cleared
// `<input type=number>`, or a stray array would silently move the clock, the
// observer, or the moon instead of being ignored. Only a genuine finite number
// counts, plus a string a host typed or parsed out of a URL/localStorage, since
// those legitimately arrive as text. Kept identical to the copy in sunDriver.js:
// the two halves of this module must agree on what "readable" means.
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

// The whole-argument guard, shared by createTimeOfDay and applyParams.
//
// Every field read below is `next.something`, which throws outright on a
// non-object argument rather than holding — and `params = {}` only fires for
// `undefined`, so `createTimeOfDay(null)` reached the body and took the
// TypeError. A cutscene track that lost its clock block, `JSON.parse` of "null",
// and a host passing a cleared field all deliver exactly that. A non-object
// carries no subset of the clock params, so it writes nothing and says so, the
// way the cloud groups and the SkyParams envelope already do. `null` and
// `undefined` mean "not supplied" (paramSchema's hasValue) and pass quietly, as
// they do there. Kept in step with the copy in sunDriver.js.
function readParamBlock(value) {
  if (isObject(value)) return value;
  if (hasValue(value)) {
    console.warn(
      `[timeOfDay] time-of-day params must be an object (got ${describe(value)}); `
      + 'keeping the current values.',
    );
  }
  return {};
}

/**
 * Folds any day time onto [0, 1); 0 is midnight, 0.5 noon.
 *
 * In-range values pass through untouched. The modulo route is not exact —
 * ((0.85 % 1) + 1) % 1 lands on 0.8500000000000001 — and this runs on every
 * tick and every applyParams, so an authored preset time would drift away from
 * the number the author typed and break round-trip identity.
 *
 * `fallback` is what an unreadable time resolves to. Anything holding clock
 * state must pass the reading it wants to keep (see `createTimeOfDay`), because
 * landing on the factory default would jump the whole sky to noon. The
 * factory-default fallback is only for one-shot solves like `sunDirectionAt`,
 * which have no previous reading to hold.
 */
export function wrapDayTime(time, fallback = DEFAULT_TIME_OF_DAY_PARAMS.time) {
  const value = finiteOr(time, fallback);
  if (value >= 0 && value < 1) return value;
  // Beyond 2^53 a double has no fractional part left: `value % 1` is exactly 0,
  // so folding would report midnight for a number that carries no time of day at
  // all. A degenerate `autoAdvanceSecondsPerDay` gets here — 1e-300 s per day
  // advances 1e298 days in one frame — and so does a host writing 1e300 into the
  // uniform. Both are unreadable, so both hold rather than jumping the sky.
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) return fallback;
  return ((value % 1) + 1) % 1;
}

/**
 * Phase terms a shaded moon disc needs, from the 0..1 phase dial.
 *
 * `illumination` is the lit fraction of the disc, (1 + cos ψ) / 2 for the
 * phase angle ψ = π(1 − 2·phase) — the fraction astronomy quotes, so a
 * quarter moon reads 0.5 and a new moon 0. Every moonshine term (disc, sky
 * ambient, cloud rim) scales by it, which is what keeps a sliver dim.
 *
 * `sin`/`cos` are that angle's trig, signed so waxing and waning light
 * opposite limbs. They hand the disc shader its sub-solar direction in disc
 * space, `vec3(sin, 0, cos)` with +x along the disc's tangent axis and +z
 * toward the viewer: a fragment is lit where dot(discNormal, that) > 0. The
 * terminator is fixed in disc space on purpose — the moon here is exactly
 * antipodal to the sun, so a geometric phase would always be new, and the
 * phase dial is an authored look, not a position.
 */
export function moonPhaseTerms(phase, target = { illumination: 0, sin: 0, cos: 0 }) {
  const angle = Math.PI * (1 - 2 * finiteOr(phase, DEFAULT_MOON_PARAMS.phase));
  target.sin = Math.sin(angle);
  target.cos = Math.cos(angle);
  target.illumination = 0.5 + 0.5 * target.cos;
  return target;
}

/**
 * Builds the clock. Pass any subset of TimeOfDayParams; the rest defaults.
 *
 * Driven uniforms (`moonDirection`, `skyDarkness`, `morningLight`,
 * `eveningLight`, `starRotation`, `moonPhaseIllumination`, `moonPhaseTrig`) are
 * declared here so materials can
 * bind them at build time. The three that need the celestial solve hold neutral
 * values until the first driver tick, which happens when the driver is
 * constructed; the two moon-phase terms are pure functions of `moonPhase`, so
 * this module keeps them correct from construction on — an env-map bake before
 * the driver exists must not light a new moon like a full one.
 */
export function createTimeOfDay(params = {}) {
  let autoAdvanceSecondsPerDay = DEFAULT_TIME_OF_DAY_PARAMS.autoAdvanceSecondsPerDay;
  let latitude = DEFAULT_TIME_OF_DAY_PARAMS.latitude;
  let azimuth = DEFAULT_TIME_OF_DAY_PARAMS.azimuth;

  // The `time` uniform is the clock's only storage, and hosts write it directly,
  // so an unreadable write (a NaN out of a bad expression, a cleared field) has
  // nothing left to hold on to. This remembers the last reading that *was*
  // readable so junk holds the clock where it stood instead of snapping to noon.
  let lastReadableTime = DEFAULT_TIME_OF_DAY_PARAMS.time;

  // Reused by refreshMoonPhase(); the clock must not allocate per refresh.
  const phaseScratch = moonPhaseTerms(DEFAULT_MOON_PARAMS.phase);

  const timeOfDay = {
    time: uniform(DEFAULT_TIME_OF_DAY_PARAMS.time),

    moonPhase: uniform(DEFAULT_MOON_PARAMS.phase),
    moonIntensity: uniform(DEFAULT_MOON_PARAMS.intensity),
    moonDiscBrightness: uniform(DEFAULT_MOON_PARAMS.discBrightness),
    moonAngularSize: uniform(DEFAULT_MOON_PARAMS.angularSize),
    moonColor: uniform(new THREE.Color().setRGB(
      DEFAULT_MOON_PARAMS.color[0],
      DEFAULT_MOON_PARAMS.color[1],
      DEFAULT_MOON_PARAMS.color[2],
      THREE.LinearSRGBColorSpace,
    )),
    moonAmbient: uniform(DEFAULT_MOON_PARAMS.ambient),

    // Driven — read-only to everything but the driver, except the two phase
    // terms, which are pure functions of `moonPhase` and so are also kept
    // current by applyParams (see refreshMoonPhase).
    moonDirection: uniform(new THREE.Vector3(0, -1, 0)),
    skyDarkness: uniform(0),
    morningLight: uniform(0),
    eveningLight: uniform(0),
    starRotation: uniform(new THREE.Matrix3()),
    moonPhaseIllumination: uniform(phaseScratch.illumination),
    moonPhaseTrig: uniform(new THREE.Vector2(phaseScratch.sin, phaseScratch.cos)),

    /** Real seconds one simulated day takes. 0 pauses, which also releases sun.direction. */
    get autoAdvanceSecondsPerDay() {
      return autoAdvanceSecondsPerDay;
    },
    set autoAdvanceSecondsPerDay(value) {
      // Running the day backwards is not part of the surface, so a negative
      // rate pauses rather than reversing. Unreadable input holds the current
      // value — snapping back to the factory default would be a bigger
      // surprise than ignoring the write.
      autoAdvanceSecondsPerDay = Math.max(0, finiteOr(value, autoAdvanceSecondsPerDay));
    },

    /** Observer latitude in degrees, clamped to −90…90. Tilts the arcs and the star pole. */
    get latitude() {
      return latitude;
    },
    set latitude(value) {
      latitude = THREE.MathUtils.clamp(finiteOr(value, latitude), -90, 90);
    },

    /** Compass rotation of the whole celestial sphere, degrees. 0 = +Z, 90 = +X. */
    get azimuth() {
      return azimuth;
    },
    set azimuth(value) {
      // Left unwrapped so toParams() round-trips whatever a preset authored;
      // the driver only ever feeds it to trig.
      azimuth = finiteOr(value, azimuth);
    },

    /**
     * Folds a host's direct `time.value` scrub back onto [0, 1) and returns it.
     *
     * The driver calls this once per tick, which is what makes
     * `timeOfDay.time.value = 0.85` a supported host path. An unreadable value
     * resolves to the last readable reading, not to the factory default: a bad
     * write should be ignored, not teleport the clock to noon.
     */
    foldTime() {
      return setTime(timeOfDay.time.value);
    },

    applyParams(next = {}) {
      const source = readParamBlock(next);
      if (source.time !== undefined) {
        // foldTime() first, so an unreadable preset time holds whatever the host
        // last scrubbed the uniform to rather than a stale reading.
        setTime(finiteOr(source.time, timeOfDay.foldTime()));
      }
      if (source.autoAdvanceSecondsPerDay !== undefined) {
        timeOfDay.autoAdvanceSecondsPerDay = source.autoAdvanceSecondsPerDay;
      }
      if (source.latitude !== undefined) timeOfDay.latitude = source.latitude;
      if (source.azimuth !== undefined) timeOfDay.azimuth = source.azimuth;

      const moon = source.moon;
      if (moon) {
        if (moon.phase !== undefined) {
          timeOfDay.moonPhase.value = finiteOr(moon.phase, timeOfDay.moonPhase.value);
        }
        if (moon.intensity !== undefined) {
          timeOfDay.moonIntensity.value = Math.max(
            0,
            finiteOr(moon.intensity, timeOfDay.moonIntensity.value),
          );
        }
        if (moon.discBrightness !== undefined) {
          timeOfDay.moonDiscBrightness.value = Math.max(
            0,
            finiteOr(moon.discBrightness, timeOfDay.moonDiscBrightness.value),
          );
        }
        if (moon.angularSize !== undefined) {
          // 1 − cos θ, so 0 is a point and 2 is the whole sphere.
          timeOfDay.moonAngularSize.value = THREE.MathUtils.clamp(
            finiteOr(moon.angularSize, timeOfDay.moonAngularSize.value),
            0,
            2,
          );
        }
        if (moon.color !== undefined) {
          readColorInto(
            '[timeOfDay] time.moon.color',
            MOON_COLOR_FIELD,
            moon.color,
            timeOfDay.moonColor.value,
          );
        }
        if (moon.ambient !== undefined) {
          timeOfDay.moonAmbient.value = THREE.MathUtils.clamp(
            finiteOr(moon.ambient, timeOfDay.moonAmbient.value),
            0,
            1,
          );
        }
      }

      refreshMoonPhase();
    },

    toParams() {
      return {
        time: wrapDayTime(timeOfDay.time.value, lastReadableTime),
        autoAdvanceSecondsPerDay,
        latitude,
        azimuth,
        moon: {
          phase: timeOfDay.moonPhase.value,
          intensity: timeOfDay.moonIntensity.value,
          discBrightness: timeOfDay.moonDiscBrightness.value,
          angularSize: timeOfDay.moonAngularSize.value,
          color: new THREE.Color().copy(timeOfDay.moonColor.value),
          ambient: timeOfDay.moonAmbient.value,
        },
      };
    },
  };

  // The single write path for `time`: every route that lands a new day time goes
  // through here, so the held value and the uniform never disagree.
  function setTime(value) {
    lastReadableTime = wrapDayTime(value, lastReadableTime);
    timeOfDay.time.value = lastReadableTime;
    return lastReadableTime;
  }

  // `moonPhaseIllumination` and `moonPhaseTrig` are pure functions of
  // `moonPhase`, so they are refreshed here as well as by the driver: a host
  // that reads them — or bakes an env map — before the first tick would
  // otherwise light a new moon like a full one. Mirrors createSun's
  // refreshIntensity, which keeps its derived uniform honest the same way.
  function refreshMoonPhase() {
    moonPhaseTerms(timeOfDay.moonPhase.value, phaseScratch);
    timeOfDay.moonPhaseIllumination.value = phaseScratch.illumination;
    timeOfDay.moonPhaseTrig.value.set(phaseScratch.sin, phaseScratch.cos);
  }

  timeOfDay.applyParams(params);
  return timeOfDay;
}
