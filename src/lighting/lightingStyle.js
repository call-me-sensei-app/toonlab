// Game-wide lighting identity as one portable document.
//
// A lighting style answers "what does light in this game look like at any
// hour" — the day cycle (sun color/intensity/exposure/sky/fog per hour), the
// sun's path, the ambient policy, the shadow policy, and the global fixture
// response — so scenes reference a style plus a time instead of scattering
// light configuration. Fixture placements (street lamps, lanterns) live in
// lightingFixtures.js; createLightingSystem applies both to a scene/world.
//
// The keyframes generalize the previously hard-coded day cycle in
// src/environment/environmentTimeOfDay.js into registerable data.

import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { colorTemperatureToRgb, resolveLightColor } from './colorIntensity.js';
import { CALL_ME_SENSEI_LIGHTING_CONTRACT } from './callMeSenseiLightingContract.js';
import { createShadowPolicy } from './lightingDocuments.js';
import { clamp, cloneJson, finite, isPlainObject, slug } from './utils.js';

export const LIGHTING_STYLE_DOCUMENT_TYPE = 'toonlab/lighting-style';
export const LIGHTING_STYLE_SCHEMA_VERSION = 1;

/** Every lighting-style field applies as a hot update; nothing forces a rebuild. */
export const LIGHTING_STYLE_APPLY_METADATA = Object.freeze({ '*': 'hot' });

function styleColor(value, fallback = [1, 1, 1]) {
  if (value === undefined || value === null) return [...fallback];
  if (isPlainObject(value) && value.kelvin !== undefined) {
    return colorTemperatureToRgb(value.kelvin);
  }
  return resolveLightColor(value);
}

function normalizeKeyframeSky(source, base) {
  const input = isPlainObject(source) ? source : {};
  return {
    horizon: styleColor(input.horizon, base.horizon),
    stars: clamp(finite(input.stars, base.stars), 0, 1),
    zenith: styleColor(input.zenith, base.zenith),
  };
}

function normalizeKeyframe(source = {}, previous = null) {
  const base = previous ?? {
    accentScale: 1,
    ambientScale: 1,
    exposureScale: 1,
    fixtureScale: 0,
    fogColor: [0.78, 0.85, 0.95],
    sky: { horizon: [0.78, 0.92, 1.0], stars: 0, zenith: [0.28, 0.56, 0.92] },
    skyGroundTint: [1.05, 0.97, 0.9],
    skyTopTint: [0.86, 0.96, 1.08],
    skyProbeColor: [1, 1, 1],
    skyProbeEnergy: 1,
    sunColor: [1, 0.95, 0.85],
    sunIntensity: 1,
  };
  return {
    sky: normalizeKeyframeSky(source.sky, base.sky),
    accentScale: clamp(finite(source.accentScale, base.accentScale), 0, 4),
    ambientScale: clamp(finite(source.ambientScale, base.ambientScale), 0, 8),
    exposureScale: clamp(finite(source.exposureScale, base.exposureScale), 0.05, 8),
    fixtureScale: clamp(finite(source.fixtureScale ?? source.lampScale, base.fixtureScale), 0, 8),
    fogColor: styleColor(source.fogColor, base.fogColor),
    hour: clamp(finite(source.hour, 12), 0, 24),
    // Sky tints intentionally allow >1 values (the environment materials use
    // them as multipliers), so they bypass the 0-1 color clamp.
    skyGroundTint: Array.isArray(source.skyGroundTint)
      ? source.skyGroundTint.slice(0, 3).map((channel) => Math.max(finite(channel, 1), 0))
      : [...base.skyGroundTint],
    skyTopTint: Array.isArray(source.skyTopTint)
      ? source.skyTopTint.slice(0, 3).map((channel) => Math.max(finite(channel, 1), 0))
      : [...base.skyTopTint],
    skyProbeColor: styleColor(source.skyProbeColor, base.skyProbeColor),
    skyProbeEnergy: clamp(finite(source.skyProbeEnergy, base.skyProbeEnergy), 0, 8),
    sunColor: styleColor(source.sunColor, base.sunColor),
    sunIntensity: clamp(finite(source.sunIntensity, base.sunIntensity), 0, 16),
  };
}

function normalizeDayCycle(source) {
  const list = Array.isArray(source) && source.length > 0 ? source : null;
  const frames = [];
  let previous = null;
  for (const entry of list ?? [{ hour: 12 }]) {
    previous = normalizeKeyframe(isPlainObject(entry) ? entry : {}, previous);
    frames.push(previous);
  }
  frames.sort((a, b) => a.hour - b.hour);
  // Seamless midnight: mirror the first frame at hour 24 unless authored.
  if (frames.at(-1).hour < 24) frames.push({ ...cloneJson(frames[0]), hour: 24 });
  if (frames[0].hour > 0) frames.unshift({ ...cloneJson(frames.at(-1)), hour: 0 });
  return frames;
}

function normalizeSunPath(source = {}) {
  return {
    azimuthArc: clamp(finite(source.azimuthArc, Math.PI * 1.6), 0, Math.PI * 2),
    azimuthOffset: finite(source.azimuthOffset, 0),
    heightBase: clamp(finite(source.heightBase, 0.4), 0, 2),
    heightScale: clamp(finite(source.heightScale, 0.6), 0, 2),
    minElevation: clamp(finite(source.minElevation, 0.06), 0, 1),
    orbitRadius: clamp(finite(source.orbitRadius, 0.85), 0.05, 2),
  };
}

/** Normalizes a complete lighting style from a partial source. */
export function createLightingStyleSettings(source = {}) {
  const input = isPlainObject(source) ? source : {};
  const ambient = isPlainObject(input.ambientLight) ? input.ambientLight : {};
  const exposure = isPlainObject(input.exposure) ? input.exposure : {};
  const fixtures = isPlainObject(input.fixtures) ? input.fixtures : {};
  const toon = isPlainObject(input.toonResponse) ? input.toonResponse : {};
  const skyProbe = isPlainObject(input.skyProbe) ? input.skyProbe : {};
  const coefficients = Array.isArray(skyProbe.threeCoefficients)
    && skyProbe.threeCoefficients.length === 9
    && skyProbe.threeCoefficients.every((entry) => (
      Array.isArray(entry)
      && entry.length >= 3
      && entry.slice(0, 3).every((value) => Number.isFinite(Number(value)))
    ))
    ? skyProbe.threeCoefficients.map((entry) => entry.slice(0, 3).map(Number))
    : null;
  return {
    ambientLight: {
      color: styleColor(ambient.color, [0.72, 0.78, 0.92]),
      enabled: ambient.enabled === undefined ? true : Boolean(ambient.enabled),
      intensity: clamp(finite(ambient.intensity, 0.45), 0, 8),
    },
    dayCycle: normalizeDayCycle(input.dayCycle ?? input.keyframes),
    exposure: {
      base: clamp(finite(exposure.base, 1), 0.05, 8),
      enabled: exposure.enabled === undefined ? true : Boolean(exposure.enabled),
    },
    fixtures: {
      intensityScale: clamp(finite(fixtures.intensityScale, 1), 0, 8),
    },
    quality: typeof input.quality === 'string' ? input.quality : 'balanced',
    shadowPolicy: createShadowPolicy(input.shadowPolicy),
    skyProbe: {
      colorSrgb8: Array.isArray(skyProbe.colorSrgb8)
        ? skyProbe.colorSrgb8.slice(0, 3).map((channel) => clamp(finite(channel, 255), 0, 255))
        : [255, 255, 255],
      enabled: skyProbe.enabled === undefined ? coefficients !== null : Boolean(skyProbe.enabled),
      intensity: clamp(finite(skyProbe.intensity, 1), 0, 16),
      referenceContract: typeof skyProbe.referenceContract === 'string'
        ? skyProbe.referenceContract
        : null,
      threeCoefficients: coefficients,
    },
    sunPath: normalizeSunPath(input.sunPath),
    toonResponse: {
      bandSoftness: clamp(finite(toon.bandSoftness, 0.08), 0, 1),
      rimInfluence: clamp(finite(toon.rimInfluence, 0), 0, 1),
      shadowTint: toon.shadowTint === undefined || toon.shadowTint === null
        ? null
        : styleColor(toon.shadowTint, [0.35, 0.38, 0.52]),
    },
  };
}

export const sanitizeLightingStyleSettings = createLightingStyleSettings;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Samples the style's day cycle at an hour (0-24, wrapping). Returns plain
 * arrays/numbers so callers decide what becomes a THREE object.
 */
export function sampleLightingStyle(settings, hour = 12) {
  const style = isPlainObject(settings) && Array.isArray(settings.dayCycle)
    ? settings
    : createLightingStyleSettings(settings);
  const normalizedHour = ((finite(hour, 12) % 24) + 24) % 24;
  const frames = style.dayCycle;
  let previous = frames[0];
  let next = frames.at(-1);
  for (let index = 0; index < frames.length - 1; index += 1) {
    if (normalizedHour >= frames[index].hour && normalizedHour <= frames[index + 1].hour) {
      previous = frames[index];
      next = frames[index + 1];
      break;
    }
  }
  const span = Math.max(next.hour - previous.hour, 0.001);
  const t = clamp((normalizedHour - previous.hour) / span, 0, 1);

  const path = style.sunPath;
  const dayT = normalizedHour / 24;
  const azimuth = path.azimuthOffset + (dayT - 0.5) * path.azimuthArc;
  const elevation = Math.max(Math.sin(((normalizedHour - 6) / 12) * Math.PI), path.minElevation);

  return {
    accentScale: lerp(previous.accentScale, next.accentScale, t),
    ambientScale: lerp(previous.ambientScale, next.ambientScale, t),
    exposure: style.exposure.base * lerp(previous.exposureScale, next.exposureScale, t),
    fixtureScale: lerp(previous.fixtureScale, next.fixtureScale, t),
    fogColor: lerpColor(previous.fogColor, next.fogColor, t),
    hour: normalizedHour,
    skyGroundTint: lerpColor(previous.skyGroundTint, next.skyGroundTint, t),
    skyHorizonColor: lerpColor(previous.sky.horizon, next.sky.horizon, t),
    skyTopTint: lerpColor(previous.skyTopTint, next.skyTopTint, t),
    skyProbeColor: lerpColor(previous.skyProbeColor, next.skyProbeColor, t),
    skyProbeEnergy: lerp(previous.skyProbeEnergy, next.skyProbeEnergy, t),
    skyZenithColor: lerpColor(previous.sky.zenith, next.sky.zenith, t),
    starsStrength: lerp(previous.sky.stars, next.sky.stars, t),
    sunColor: lerpColor(previous.sunColor, next.sunColor, t),
    sunElevation: elevation,
    sunIntensity: lerp(previous.sunIntensity, next.sunIntensity, t),
    sunSourceRatios: {
      x: Math.sin(azimuth) * path.orbitRadius,
      y: path.heightBase + elevation * path.heightScale,
      z: -Math.cos(azimuth) * path.orbitRadius,
    },
  };
}

// ---------------------------------------------------------------------------
// Preset registry — starting points, never a boundary. register/overwrite is
// the supported path for app-defined styles.

const STYLE_PRESETS = new Map();

/** Registers a lighting style preset. Returns the normalized id. */
export function registerLightingStylePreset(id, definition = {}, { overwrite = false } = {}) {
  const key = slug(id, 'style');
  if (!overwrite && STYLE_PRESETS.has(key)) {
    throw new Error(`Lighting style preset "${key}" already exists. Pass { overwrite: true } to replace it.`);
  }
  const source = isPlainObject(definition) ? definition : {};
  STYLE_PRESETS.set(key, {
    description: String(source.description ?? ''),
    label: String(source.label ?? source.name ?? key),
    settings: createLightingStyleSettings(source.settings ?? source),
  });
  return key;
}

export function getLightingStylePresetOptions() {
  return [...STYLE_PRESETS.entries()].map(([id, entry]) => ({
    description: entry.description, id, label: entry.label,
  }));
}

/** Resolves an id, document, or settings object into normalized settings. */
export function resolveLightingStylePreset(value = 'storybook') {
  if (typeof value === 'string') {
    const entry = STYLE_PRESETS.get(value) ?? STYLE_PRESETS.get(slug(value, 'style'));
    if (!entry) {
      throw new Error(`Unknown lighting style preset "${value}". Registered: ${[...STYLE_PRESETS.keys()].join(', ')}.`);
    }
    return cloneJson(entry.settings);
  }
  if (isPlainObject(value) && value.type === LIGHTING_STYLE_DOCUMENT_TYPE) {
    return createLightingStyleSettings(value.settings);
  }
  return createLightingStyleSettings(value);
}

// ---------------------------------------------------------------------------
// Versioned preset documents (shared core envelope).

function migrateStyleDocument(input) {
  return {
    ...input,
    id: input.id ?? input.name,
    label: input.label ?? input.title ?? input.name,
    settings: input.settings ?? input.style ?? {},
    type: LIGHTING_STYLE_DOCUMENT_TYPE,
    version: Number(input.version ?? input.schemaVersion ?? 1),
  };
}

export function validateLightingStylePresetDocument(input) {
  return validateSettingsPresetDocument(input, {
    documentType: LIGHTING_STYLE_DOCUMENT_TYPE,
    migrateDocument: migrateStyleDocument,
    normalizeId: (value) => slug(value, ''),
    sanitizeSettings: createLightingStyleSettings,
    schemaVersion: LIGHTING_STYLE_SCHEMA_VERSION,
  });
}

export function createLightingStylePresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => createLightingStyleSettings(source.settings ?? source),
    documentType: LIGHTING_STYLE_DOCUMENT_TYPE,
    schemaVersion: LIGHTING_STYLE_SCHEMA_VERSION,
    validateDocument: validateLightingStylePresetDocument,
  });
}

export function parseLightingStylePresetDocument(input) {
  return parsePresetDocument(input, validateLightingStylePresetDocument, {
    invalidJsonLabel: 'lighting style preset',
  });
}

export function serializeLightingStylePresetDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    createDocument: createLightingStylePresetDocument,
    pretty,
  });
}

/** Registers a parsed/validated style document in the runtime registry. */
export function registerLightingStylePresetDocument(document, { overwrite = true } = {}) {
  const result = validateLightingStylePresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerLightingStylePreset(result.value.id, {
    description: result.value.description,
    label: result.value.label,
    settings: result.value.settings,
  }, { overwrite });
}

// ---------------------------------------------------------------------------
// Built-in styles. `storybook` reproduces the classic anime-interior day the
// environment rigs shipped with, so existing worlds keep their look.

registerLightingStylePreset('storybook', {
  description: 'Classic anime day: cool lamp-lit night, warm low morning, neutral noon, amber evening.',
  label: 'Storybook Day',
  settings: {
    ambientLight: { color: [0.74, 0.79, 0.94], intensity: 0.45 },
    dayCycle: [
      { accentScale: 0.2, ambientScale: 0.55, exposureScale: 0.92, fixtureScale: 1.35, fogColor: [0.32, 0.38, 0.55], hour: 0, sky: { horizon: [0.22, 0.28, 0.5], stars: 0.85, zenith: [0.06, 0.09, 0.24] }, skyGroundTint: [0.82, 0.86, 1.0], skyTopTint: [0.62, 0.72, 1.02], sunColor: 0x9bbcff, sunIntensity: 0.1 },
      { accentScale: 0.85, ambientScale: 0.8, exposureScale: 1, fixtureScale: 0.7, fogColor: [0.85, 0.7, 0.55], hour: 6, sky: { horizon: [0.98, 0.78, 0.6], stars: 0, zenith: [0.42, 0.52, 0.86] }, skyGroundTint: [1.1, 0.94, 0.82], skyTopTint: [0.95, 0.9, 1.0], sunColor: 0xffb56a, sunIntensity: 0.45 },
      { accentScale: 1, ambientScale: 1, exposureScale: 1.04, fixtureScale: 0, fogColor: [0.78, 0.85, 0.95], hour: 12, sky: { horizon: [0.78, 0.92, 1.0], stars: 0, zenith: [0.28, 0.56, 0.92] }, skyGroundTint: [1.05, 0.97, 0.9], skyTopTint: [0.86, 0.96, 1.08], sunColor: 0xfff1d8, sunIntensity: 1.0 },
      { accentScale: 0.9, ambientScale: 0.78, exposureScale: 1, fixtureScale: 0.8, fogColor: [0.82, 0.6, 0.45], hour: 18, sky: { horizon: [1.0, 0.64, 0.44], stars: 0.05, zenith: [0.34, 0.36, 0.7] }, skyGroundTint: [1.14, 0.9, 0.74], skyTopTint: [0.92, 0.84, 0.96], sunColor: 0xff884b, sunIntensity: 0.5 },
      { accentScale: 0.3, ambientScale: 0.58, exposureScale: 0.94, fixtureScale: 1.3, fogColor: [0.34, 0.4, 0.58], hour: 21, sky: { horizon: [0.24, 0.3, 0.52], stars: 0.75, zenith: [0.07, 0.1, 0.26] }, skyGroundTint: [0.84, 0.87, 1.0], skyTopTint: [0.64, 0.74, 1.02], sunColor: 0x9bbcff, sunIntensity: 0.14 },
    ],
  },
});

registerLightingStylePreset('call-me-sensei', {
  description: 'Vivid, vibrant anime-open-world light: saturated daylight, luminous never-crushed shadows, punchy golden hour, and rich blue nights where fixtures carry the frame.',
  label: 'Call Me Sensei',
  settings: {
    // High cool-tinted ambient keeps shadow regions luminous and colorful
    // instead of gray — the core of the vivid anime-open-world look.
    // The canonical look uses captured sky irradiance rather than a flat ambient term. The
    // probe below is the source of its luminous blue daylight back-side.
    ambientLight: { color: [0.62, 0.72, 1.0], enabled: false, intensity: 0 },
    exposure: { base: 1.08 },
    fixtures: { intensityScale: 1.3 },
    skyProbe: {
      ...CALL_ME_SENSEI_LIGHTING_CONTRACT.skyLight,
      enabled: true,
      referenceContract: CALL_ME_SENSEI_LIGHTING_CONTRACT.id,
    },
    toonResponse: { bandSoftness: 0.06, rimInfluence: 0.35, shadowTint: [0.42, 0.5, 0.85] },
    dayCycle: [
      { accentScale: 0.3, ambientScale: 0.42, exposureScale: 0.94, fixtureScale: 1.55, fogColor: [0.16, 0.2, 0.46], hour: 0, sky: { horizon: [0.12, 0.2, 0.5], stars: 1, zenith: [0.02, 0.05, 0.2] }, skyGroundTint: [0.72, 0.78, 1.05], skyProbeColor: [0.08, 0.15, 0.36], skyProbeEnergy: 0.42, skyTopTint: [0.42, 0.55, 1.05], sunColor: [0.24, 0.38, 0.74], sunIntensity: 1.28 },
      { accentScale: 1.2, ambientScale: 0.72, exposureScale: 1.04, fixtureScale: 0.7, fogColor: [1.0, 0.68, 0.5], hour: 6, sky: { horizon: [1.0, 0.72, 0.52], stars: 0, zenith: [0.38, 0.5, 0.95] }, skyGroundTint: [1.2, 0.95, 0.78], skyProbeColor: [0.20, 0.28, 0.48], skyProbeEnergy: 0.72, skyTopTint: [0.95, 0.85, 1.05], sunColor: [1.0, 0.55, 0.31], sunIntensity: 4.64 },
      { accentScale: 1.15, ambientScale: 1, exposureScale: 1.1, fixtureScale: 0, fogColor: [0.72, 0.86, 1.0], hour: 13, sky: { horizon: [0.72, 0.9, 1.05], stars: 0, zenith: [0.18, 0.5, 1.0] }, skyGroundTint: [1.12, 1.02, 0.9], skyProbeColor: [1, 1, 1], skyProbeEnergy: 1, skyTopTint: [0.78, 0.98, 1.2], sunColor: [1, 1, 1], sunIntensity: 8 },
      { accentScale: 1.35, ambientScale: 0.68, exposureScale: 1.05, fixtureScale: 0.85, fogColor: [1.0, 0.52, 0.36], hour: 18, sky: { horizon: [1.1, 0.5, 0.32], stars: 0.08, zenith: [0.3, 0.3, 0.78] }, skyGroundTint: [1.25, 0.85, 0.66], skyProbeColor: [0.18, 0.20, 0.45], skyProbeEnergy: 0.68, skyTopTint: [0.95, 0.72, 1.0], sunColor: [1.0, 0.38, 0.16], sunIntensity: 3.84 },
      { accentScale: 0.4, ambientScale: 0.42, exposureScale: 0.96, fixtureScale: 1.5, fogColor: [0.18, 0.22, 0.5], hour: 22, sky: { horizon: [0.15, 0.22, 0.52], stars: 0.95, zenith: [0.03, 0.07, 0.24] }, skyGroundTint: [0.74, 0.8, 1.05], skyProbeColor: [0.08, 0.15, 0.36], skyProbeEnergy: 0.42, skyTopTint: [0.45, 0.58, 1.05], sunColor: [0.24, 0.38, 0.74], sunIntensity: 1.28 },
    ],
  },
});

registerLightingStylePreset('golden-summer', {
  description: 'Warm high-key daylight with a long amber golden hour and gentle nights.',
  label: 'Golden Summer',
  settings: {
    ambientLight: { color: [0.9, 0.82, 0.7], intensity: 0.5 },
    exposure: { base: 1.06 },
    dayCycle: [
      { accentScale: 0.25, ambientScale: 0.6, exposureScale: 0.9, fixtureScale: 1.2, fogColor: [0.36, 0.4, 0.56], hour: 0, sky: { horizon: [0.26, 0.3, 0.5], stars: 0.8, zenith: [0.07, 0.1, 0.26] }, sunColor: { kelvin: 12000 }, sunIntensity: 0.12 },
      { accentScale: 1, ambientScale: 0.85, exposureScale: 1, fixtureScale: 0.5, fogColor: [0.95, 0.78, 0.58], hour: 6.5, sky: { horizon: [1.05, 0.8, 0.55], stars: 0, zenith: [0.42, 0.54, 0.9] }, sunColor: { kelvin: 3200 }, sunIntensity: 0.55 },
      { accentScale: 1, ambientScale: 1.05, exposureScale: 1.06, fixtureScale: 0, fogColor: [0.85, 0.88, 0.92], hour: 12.5, sky: { horizon: [0.85, 0.94, 1.0], stars: 0, zenith: [0.3, 0.58, 0.94] }, skyGroundTint: [1.1, 1.0, 0.88], skyTopTint: [0.9, 0.98, 1.1], sunColor: { kelvin: 5600 }, sunIntensity: 1.15 },
      { accentScale: 1.15, ambientScale: 0.82, exposureScale: 1.02, fixtureScale: 0.6, fogColor: [0.96, 0.66, 0.42], hour: 18.5, sky: { horizon: [1.1, 0.62, 0.36], stars: 0.05, zenith: [0.38, 0.36, 0.68] }, skyGroundTint: [1.2, 0.92, 0.7], skyTopTint: [0.98, 0.84, 0.9], sunColor: { kelvin: 2400 }, sunIntensity: 0.6 },
      { accentScale: 0.35, ambientScale: 0.62, exposureScale: 0.92, fixtureScale: 1.15, fogColor: [0.38, 0.42, 0.6], hour: 21.5, sky: { horizon: [0.28, 0.32, 0.54], stars: 0.7, zenith: [0.08, 0.11, 0.28] }, sunColor: { kelvin: 11000 }, sunIntensity: 0.16 },
    ],
  },
});

registerLightingStylePreset('overcast-pastel', {
  description: 'Soft shadowless pastel light: flat ambient, muted sun, cool fog.',
  label: 'Overcast Pastel',
  settings: {
    ambientLight: { color: [0.82, 0.85, 0.9], intensity: 0.62 },
    exposure: { base: 0.98 },
    shadowPolicy: { maxShadowedLights: 1 },
    dayCycle: [
      { accentScale: 0.1, ambientScale: 0.7, exposureScale: 0.95, fixtureScale: 1.1, fogColor: [0.4, 0.44, 0.55], hour: 0, sky: { horizon: [0.3, 0.33, 0.45], stars: 0.25, zenith: [0.12, 0.14, 0.24] }, sunColor: { kelvin: 9000 }, sunIntensity: 0.12 },
      { accentScale: 0.3, ambientScale: 1.15, exposureScale: 1, fixtureScale: 0.2, fogColor: [0.78, 0.82, 0.88], hour: 8, sky: { horizon: [0.82, 0.85, 0.9], stars: 0, zenith: [0.55, 0.62, 0.74] }, sunColor: { kelvin: 6800 }, sunIntensity: 0.45 },
      { accentScale: 0.35, ambientScale: 1.25, exposureScale: 1, fixtureScale: 0, fogColor: [0.8, 0.84, 0.9], hour: 13, sky: { horizon: [0.85, 0.88, 0.93], stars: 0, zenith: [0.58, 0.66, 0.78] }, skyGroundTint: [0.98, 1.0, 1.02], skyTopTint: [0.88, 0.92, 1.0], sunColor: { kelvin: 6500 }, sunIntensity: 0.55 },
      { accentScale: 0.25, ambientScale: 1.05, exposureScale: 0.98, fixtureScale: 0.35, fogColor: [0.66, 0.66, 0.74], hour: 18, sky: { horizon: [0.7, 0.68, 0.74], stars: 0, zenith: [0.42, 0.44, 0.56] }, sunColor: { kelvin: 7200 }, sunIntensity: 0.35 },
      { accentScale: 0.12, ambientScale: 0.72, exposureScale: 0.95, fixtureScale: 1.05, fogColor: [0.4, 0.44, 0.56], hour: 21, sky: { horizon: [0.31, 0.34, 0.46], stars: 0.2, zenith: [0.13, 0.15, 0.26] }, sunColor: { kelvin: 9000 }, sunIntensity: 0.14 },
    ],
  },
});

registerLightingStylePreset('neon-night', {
  description: 'Perpetual dusk-to-night cycle where fixtures carry the scene over a cool blue base.',
  label: 'Neon Night',
  settings: {
    ambientLight: { color: [0.45, 0.5, 0.8], intensity: 0.4 },
    exposure: { base: 0.96 },
    fixtures: { intensityScale: 1.35 },
    dayCycle: [
      { accentScale: 0.15, ambientScale: 0.5, exposureScale: 0.9, fixtureScale: 1.5, fogColor: [0.24, 0.2, 0.42], hour: 0, sky: { horizon: [0.2, 0.14, 0.4], stars: 0.9, zenith: [0.05, 0.04, 0.16] }, skyGroundTint: [0.7, 0.7, 0.95], skyTopTint: [0.5, 0.55, 0.95], sunColor: { kelvin: 15000 }, sunIntensity: 0.08 },
      { accentScale: 0.4, ambientScale: 0.68, exposureScale: 0.96, fixtureScale: 1, fogColor: [0.45, 0.36, 0.55], hour: 8, sky: { horizon: [0.5, 0.4, 0.6], stars: 0.1, zenith: [0.2, 0.2, 0.42] }, sunColor: { kelvin: 8000 }, sunIntensity: 0.32 },
      { accentScale: 0.5, ambientScale: 0.8, exposureScale: 1, fixtureScale: 0.7, fogColor: [0.55, 0.48, 0.62], hour: 13, sky: { horizon: [0.6, 0.54, 0.68], stars: 0, zenith: [0.3, 0.32, 0.55] }, sunColor: { kelvin: 6800 }, sunIntensity: 0.5 },
      { accentScale: 0.6, ambientScale: 0.66, exposureScale: 0.96, fixtureScale: 1.25, fogColor: [0.5, 0.3, 0.55], hour: 18, sky: { horizon: [0.62, 0.3, 0.55], stars: 0.25, zenith: [0.18, 0.12, 0.4] }, sunColor: { kelvin: 3000 }, sunIntensity: 0.3 },
      { accentScale: 0.2, ambientScale: 0.52, exposureScale: 0.9, fixtureScale: 1.5, fogColor: [0.26, 0.22, 0.44], hour: 21, sky: { horizon: [0.22, 0.16, 0.42], stars: 0.85, zenith: [0.06, 0.05, 0.18] }, sunColor: { kelvin: 14000 }, sunIntensity: 0.1 },
    ],
  },
});
