// Arbitrary authored 24-hour color grading for the Three.js atmosphere base.
// Time itself remains scene state; this module only owns the reusable curve.

const TAU_HOURS = 24;

export const DEFAULT_SKY_ATMOSPHERE = Object.freeze({
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8,
  rayleigh: 1.35,
  turbidity: 4.2,
});

export const DEFAULT_SKY_TIME_KEYFRAMES = Object.freeze([
  Object.freeze({
    belowHorizonTint: Object.freeze([0.08, 0.12, 0.24]),
    contrast: 1.05,
    exposure: 0.48,
    horizonGlow: 0.04,
    horizonGlowColor: Object.freeze([0.42, 0.56, 0.92]),
    horizonTint: Object.freeze([0.24, 0.34, 0.62]),
    hour: 0,
    id: 'night',
    label: 'Night',
    saturation: 0.9,
    zenithTint: Object.freeze([0.08, 0.14, 0.4]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.55, 0.58, 0.68]),
    contrast: 1.04,
    exposure: 0.88,
    horizonGlow: 0.72,
    horizonGlowColor: Object.freeze([1, 0.58, 0.32]),
    horizonTint: Object.freeze([1, 0.62, 0.42]),
    hour: 6,
    id: 'dawn',
    label: 'Dawn',
    saturation: 1.12,
    zenithTint: Object.freeze([0.44, 0.58, 0.96]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.66, 0.8, 0.96]),
    contrast: 1.08,
    exposure: 1.06,
    horizonGlow: 0.16,
    horizonGlowColor: Object.freeze([1, 0.9, 0.72]),
    horizonTint: Object.freeze([0.88, 0.96, 1]),
    hour: 13,
    id: 'day',
    label: 'Day',
    saturation: 1.18,
    zenithTint: Object.freeze([0.52, 0.76, 1]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.4, 0.32, 0.48]),
    contrast: 1.1,
    exposure: 0.82,
    horizonGlow: 0.9,
    horizonGlowColor: Object.freeze([1, 0.42, 0.2]),
    horizonTint: Object.freeze([1, 0.48, 0.3]),
    hour: 18,
    id: 'sunset',
    label: 'Sunset',
    saturation: 1.2,
    zenithTint: Object.freeze([0.38, 0.42, 0.84]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.12, 0.16, 0.28]),
    contrast: 1.07,
    exposure: 0.56,
    horizonGlow: 0.16,
    horizonGlowColor: Object.freeze([0.48, 0.56, 0.9]),
    horizonTint: Object.freeze([0.34, 0.38, 0.62]),
    hour: 22,
    id: 'late-night',
    label: 'Late Night',
    saturation: 0.94,
    zenithTint: Object.freeze([0.1, 0.17, 0.46]),
  }),
]);

// Call Me Sensei's house sky is intentionally art-directed toward the
// luminous, high-altitude anime-open-world read: a cyan-white horizon, a
// clean saturated zenith, lifted blue aerial perspective, and restrained
// contrast. This is the product default; the neutral curve above remains a
// useful authoring alternative.
export const CALL_ME_SENSEI_SKY_ATMOSPHERE = Object.freeze({
  mieCoefficient: 0.004,
  mieDirectionalG: 0.78,
  rayleigh: 1.72,
  turbidity: 3.1,
});

export const CALL_ME_SENSEI_SKY_TIME_KEYFRAMES = Object.freeze([
  Object.freeze({
    belowHorizonTint: Object.freeze([0.055, 0.09, 0.2]),
    contrast: 1.02,
    exposure: 0.42,
    horizonGlow: 0.06,
    horizonGlowColor: Object.freeze([0.38, 0.55, 0.94]),
    horizonTint: Object.freeze([0.17, 0.29, 0.62]),
    hour: 0,
    id: 'sensei-night',
    label: 'Sensei Night',
    saturation: 1.02,
    zenithTint: Object.freeze([0.035, 0.095, 0.34]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.48, 0.59, 0.76]),
    contrast: 1.02,
    exposure: 0.82,
    horizonGlow: 0.82,
    horizonGlowColor: Object.freeze([1, 0.62, 0.4]),
    horizonTint: Object.freeze([1, 0.69, 0.5]),
    hour: 6,
    id: 'sensei-dawn',
    label: 'Sensei Dawn',
    saturation: 1.16,
    zenithTint: Object.freeze([0.38, 0.58, 0.96]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.28, 0.62, 0.82]),
    contrast: 1.035,
    exposure: 0.9,
    horizonGlow: 0.24,
    horizonGlowColor: Object.freeze([0.62, 0.9, 1]),
    horizonTint: Object.freeze([0.42, 0.74, 0.92]),
    hour: 10,
    id: 'sensei-morning',
    label: 'Sensei Morning',
    saturation: 1.2,
    zenithTint: Object.freeze([0.055, 0.31, 0.72]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.3, 0.65, 0.84]),
    contrast: 1.04,
    exposure: 0.9,
    horizonGlow: 0.18,
    horizonGlowColor: Object.freeze([0.66, 0.92, 1]),
    horizonTint: Object.freeze([0.46, 0.78, 0.94]),
    hour: 13,
    id: 'sensei-day',
    label: 'Sensei Day',
    saturation: 1.22,
    zenithTint: Object.freeze([0.045, 0.29, 0.7]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.4, 0.34, 0.52]),
    contrast: 1.07,
    exposure: 0.8,
    horizonGlow: 0.96,
    horizonGlowColor: Object.freeze([1, 0.43, 0.22]),
    horizonTint: Object.freeze([1, 0.52, 0.32]),
    hour: 18,
    id: 'sensei-sunset',
    label: 'Sensei Sunset',
    saturation: 1.24,
    zenithTint: Object.freeze([0.35, 0.43, 0.86]),
  }),
  Object.freeze({
    belowHorizonTint: Object.freeze([0.09, 0.13, 0.25]),
    contrast: 1.04,
    exposure: 0.5,
    horizonGlow: 0.18,
    horizonGlowColor: Object.freeze([0.48, 0.57, 0.94]),
    horizonTint: Object.freeze([0.27, 0.34, 0.65]),
    hour: 22,
    id: 'sensei-late-night',
    label: 'Sensei Late Night',
    saturation: 1.06,
    zenithTint: Object.freeze([0.06, 0.13, 0.4]),
  }),
]);

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function clampColor(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const result = value.slice(0, 3).map((channel) => clamp(channel, 0, 2));
  return result.every(Number.isFinite) ? result : [...fallback];
}

function normalizeHour(value) {
  const number = Number(value);
  return Number.isFinite(number) ? ((number % TAU_HOURS) + TAU_HOURS) % TAU_HOURS : 0;
}

function slug(value, fallback) {
  return String(value ?? fallback).trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function linearChannel(value) {
  const channel = clamp(value, 0, 2);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function srgbChannel(value) {
  const channel = Math.max(value, 0);
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function srgbToOklab(rgb) {
  const [r, g, b] = rgb.map(linearChannel);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

function oklabToSrgb(lab) {
  const lRoot = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
  const mRoot = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
  const sRoot = lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2];
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    srgbChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    srgbChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    srgbChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((channel) => clamp(channel, 0, 2));
}

function smooth(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function mixNumber(from, to, amount) {
  return from + (to - from) * amount;
}

function mixColor(from, to, amount) {
  const a = srgbToOklab(from);
  const b = srgbToOklab(to);
  return oklabToSrgb(a.map((channel, index) => mixNumber(channel, b[index], amount)));
}

export function createSkyAtmosphereSettings(input = {}) {
  return {
    mieCoefficient: clamp(
      Number.isFinite(Number(input.mieCoefficient))
        ? input.mieCoefficient : DEFAULT_SKY_ATMOSPHERE.mieCoefficient,
      0,
      0.1,
    ),
    mieDirectionalG: clamp(
      Number.isFinite(Number(input.mieDirectionalG))
        ? input.mieDirectionalG : DEFAULT_SKY_ATMOSPHERE.mieDirectionalG,
      0,
      0.999,
    ),
    rayleigh: clamp(
      Number.isFinite(Number(input.rayleigh)) ? input.rayleigh : DEFAULT_SKY_ATMOSPHERE.rayleigh,
      0,
      8,
    ),
    turbidity: clamp(
      Number.isFinite(Number(input.turbidity)) ? input.turbidity : DEFAULT_SKY_ATMOSPHERE.turbidity,
      0,
      20,
    ),
  };
}

export function createSkyTimeKeyframes(input = DEFAULT_SKY_TIME_KEYFRAMES) {
  const source = Array.isArray(input) ? input : DEFAULT_SKY_TIME_KEYFRAMES;
  const byHour = new Map();
  source.forEach((raw, index) => {
    const fallback = DEFAULT_SKY_TIME_KEYFRAMES[index % DEFAULT_SKY_TIME_KEYFRAMES.length];
    const hour = normalizeHour(raw?.hour ?? fallback.hour);
    const id = slug(raw?.id ?? raw?.label, `key-${index + 1}`);
    byHour.set(hour.toFixed(6), {
      belowHorizonTint: clampColor(raw?.belowHorizonTint, fallback.belowHorizonTint),
      contrast: clamp(raw?.contrast ?? fallback.contrast, 0, 3),
      exposure: clamp(raw?.exposure ?? fallback.exposure, 0, 4),
      horizonGlow: clamp(raw?.horizonGlow ?? fallback.horizonGlow, 0, 3),
      horizonGlowColor: clampColor(raw?.horizonGlowColor, fallback.horizonGlowColor),
      horizonTint: clampColor(raw?.horizonTint, fallback.horizonTint),
      hour,
      id,
      label: String(raw?.label ?? id).trim() || id,
      saturation: clamp(raw?.saturation ?? fallback.saturation, 0, 3),
      zenithTint: clampColor(raw?.zenithTint, fallback.zenithTint),
    });
  });
  const normalized = Array.from(byHour.values()).sort((a, b) => a.hour - b.hour);
  if (normalized.length >= 2) return normalized;
  return DEFAULT_SKY_TIME_KEYFRAMES.map((keyframe) => ({
    ...keyframe,
    belowHorizonTint: [...keyframe.belowHorizonTint],
    horizonGlowColor: [...keyframe.horizonGlowColor],
    horizonTint: [...keyframe.horizonTint],
    zenithTint: [...keyframe.zenithTint],
  }));
}

export function sampleSkyTimeKeyframes(input, hourInput) {
  const keyframes = createSkyTimeKeyframes(input);
  const hour = normalizeHour(hourInput);
  let from = keyframes[keyframes.length - 1];
  let to = keyframes[0];
  let sampleHour = hour;
  let fromHour = from.hour;
  let toHour = to.hour + TAU_HOURS;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    if (hour >= keyframes[index].hour && hour <= keyframes[index + 1].hour) {
      from = keyframes[index];
      to = keyframes[index + 1];
      fromHour = from.hour;
      toHour = to.hour;
      break;
    }
  }
  if (from === keyframes[keyframes.length - 1] && to === keyframes[0] && hour < to.hour) {
    sampleHour += TAU_HOURS;
  }
  const amount = smooth((sampleHour - fromHour) / Math.max(toHour - fromHour, 0.000001));
  return {
    belowHorizonTint: mixColor(from.belowHorizonTint, to.belowHorizonTint, amount),
    contrast: mixNumber(from.contrast, to.contrast, amount),
    exposure: mixNumber(from.exposure, to.exposure, amount),
    from,
    horizonGlow: mixNumber(from.horizonGlow, to.horizonGlow, amount),
    horizonGlowColor: mixColor(from.horizonGlowColor, to.horizonGlowColor, amount),
    horizonTint: mixColor(from.horizonTint, to.horizonTint, amount),
    hour,
    saturation: mixNumber(from.saturation, to.saturation, amount),
    to,
    amount,
    zenithTint: mixColor(from.zenithTint, to.zenithTint, amount),
  };
}

export function celestialDirectionForHour(hourInput, { moon = false } = {}) {
  const hour = normalizeHour(Number(hourInput) + (moon ? 12 : 0));
  const angle = ((hour - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const horizontal = Math.cos(Math.asin(clamp(elevation, -1, 1)));
  const azimuth = ((hour / 24) * Math.PI * 2) - Math.PI * 0.25;
  const direction = [
    Math.cos(azimuth) * horizontal,
    elevation,
    Math.sin(azimuth) * horizontal,
  ];
  const length = Math.hypot(...direction) || 1;
  return direction.map((channel) => channel / length);
}
