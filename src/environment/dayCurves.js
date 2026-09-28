import * as THREE from 'three';

// Day-cycle curves: the runtime's time-of-day color model.
//
// All time-of-day styling flows through a single scalar, the day-cycle
// progress, rather than the raw clock: 0 = day, 0.25 = sunset, 0.5 = night,
// 0.75 = sunrise, wrapping back to day at 1. Progress HOLDS at day/night and
// eases through the transitions, so "how long is golden hour" is a remap
// concern here and every consumer (sky gradient, fog, sun tint, clouds)
// just samples its looping curve at the shared progress value.
//
// Curves are plain arrays of `{ at, value }` stops (serializable in style
// presets); values may be numbers, [r, g, b] arrays, or THREE.Color.

export const DAY_CYCLE_PHASE = {
  day: 0,
  sunset: 0.25,
  night: 0.5,
  sunrise: 0.75,
};

function smooth01(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Maps a cycle clock (seconds since sunrise, wrapping every
 * dayLength + nightLength) onto day-cycle progress. Transitions live at the
 * edges of each half: sunrise finishes at the start of the day span, sunset
 * occupies its tail; dusk opens the night span, dawn closes it.
 */
export function dayCycleProgressFromTime(time, {
  dayLength = 600,
  nightLength = 480,
  sunriseDuration = dayLength * 0.12,
  sunsetDuration = dayLength * 0.15,
  duskDuration = nightLength * 0.15,
  dawnDuration = nightLength * 0.12,
} = {}) {
  const cycle = Math.max(dayLength + nightLength, 0.001);
  let t = ((Number(time) || 0) % cycle + cycle) % cycle;

  if (t < dayLength) {
    const sunriseEnd = Math.min(sunriseDuration, dayLength);
    const sunsetStart = Math.max(dayLength - sunsetDuration, sunriseEnd);
    if (t < sunriseEnd) {
      // 0.75 -> 1 wraps to day; keep the output in [0, 1).
      return (0.75 + 0.25 * smooth01(t / Math.max(sunriseEnd, 0.001))) % 1;
    }
    if (t < sunsetStart) return DAY_CYCLE_PHASE.day;
    return 0.25 * smooth01((t - sunsetStart) / Math.max(dayLength - sunsetStart, 0.001));
  }

  t -= dayLength;
  const duskEnd = Math.min(duskDuration, nightLength);
  const dawnStart = Math.max(nightLength - dawnDuration, duskEnd);
  if (t < duskEnd) return 0.25 + 0.25 * smooth01(t / Math.max(duskEnd, 0.001));
  if (t < dawnStart) return DAY_CYCLE_PHASE.night;
  return 0.5 + 0.25 * smooth01((t - dawnStart) / Math.max(nightLength - dawnStart, 0.001));
}

/**
 * Companion pseudo-hour for consumers keyed to a 24h clock
 * (LightingSystem.setTimeOfDay): the day span maps to 06:00-18:00 and the
 * night span to 18:00-06:00 regardless of the configured span lengths.
 */
export function hourFromDayCycleTime(time, { dayLength = 600, nightLength = 480 } = {}) {
  const cycle = Math.max(dayLength + nightLength, 0.001);
  const t = ((Number(time) || 0) % cycle + cycle) % cycle;
  if (t < dayLength) return 6 + 12 * (t / Math.max(dayLength, 0.001));
  return (18 + 12 * ((t - dayLength) / Math.max(nightLength, 0.001))) % 24;
}

function isColorLike(value) {
  return value?.isColor === true;
}

function lerpValue(a, b, t, target) {
  if (typeof a === 'number' && typeof b === 'number') {
    return THREE.MathUtils.lerp(a, b, t);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // A THREE.Color target must work with array stops too — presets author
    // colors as plain [r, g, b] while consumers hold Color uniforms.
    if (isColorLike(target)) {
      return target.setRGB(
        THREE.MathUtils.lerp(a[0], b[0] ?? a[0], t),
        THREE.MathUtils.lerp(a[1], b[1] ?? a[1], t),
        THREE.MathUtils.lerp(a[2], b[2] ?? a[2], t),
      );
    }
    const out = Array.isArray(target) ? target : new Array(a.length);
    for (let i = 0; i < a.length; i += 1) out[i] = THREE.MathUtils.lerp(a[i], b[i] ?? a[i], t);
    return out;
  }
  const colorA = isColorLike(a) ? a : new THREE.Color(...(Array.isArray(a) ? a : [a]));
  const colorB = isColorLike(b) ? b : new THREE.Color(...(Array.isArray(b) ? b : [b]));
  const out = isColorLike(target) ? target.copy(colorA) : colorA.clone();
  return out.lerp(colorB, t);
}

/**
 * Samples a looping curve at progress in [0, 1). Stops need not be sorted;
 * interpolation wraps from the last stop back to the first (at + 1).
 * `ease: 'smooth'` applies smoothstep between stops. Pass `target` (a
 * THREE.Color or array) to write color results without allocating.
 */
export function sampleDayCurve(stops, progress, { ease = 'linear', target = null } = {}) {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  if (stops.length === 1) return lerpValue(stops[0].value, stops[0].value, 0, target);

  const sorted = [...stops].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const p = ((Number(progress) || 0) % 1 + 1) % 1;

  let previous = sorted[sorted.length - 1];
  let previousAt = (previous.at ?? 0) - 1;
  let next = sorted[0];
  let nextAt = next.at ?? 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if ((sorted[i].at ?? 0) <= p) {
      previous = sorted[i];
      previousAt = previous.at ?? 0;
      next = sorted[(i + 1) % sorted.length];
      nextAt = (i + 1 < sorted.length) ? (next.at ?? 0) : (next.at ?? 0) + 1;
    }
  }

  const span = Math.max(nextAt - previousAt, 0.001);
  let t = THREE.MathUtils.clamp((p - previousAt) / span, 0, 1);
  if (ease === 'smooth') t = smooth01(t);
  return lerpValue(previous.value, next.value, t, target);
}

/**
 * The four-phase convenience constructor: one value per phase, wrapping from
 * sunrise back to day. This is the shape most style-preset curves use.
 */
export function fiveStopCurve(day, sunset, night, sunrise) {
  return [
    { at: DAY_CYCLE_PHASE.day, value: day },
    { at: DAY_CYCLE_PHASE.sunset, value: sunset },
    { at: DAY_CYCLE_PHASE.night, value: night },
    { at: DAY_CYCLE_PHASE.sunrise, value: sunrise },
  ];
}
