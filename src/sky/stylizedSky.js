import * as THREE from 'three';

import {
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';
import { createSkyNodeMaterial } from '../shaders-tsl/sky.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import { SKY_SCENE_OVERRIDE_PRIORITIES } from './sceneOverrideLayers.js';
import { resolveSkyQuality } from './skyQuality.js';

export { SKY_SCENE_OVERRIDE_PRIORITIES } from './sceneOverrideLayers.js';
export { SKY_QUALITY_OPTIONS, SKY_QUALITY_TIERS, resolveSkyQuality } from './skyQuality.js';

// Procedural stylized sky dome: vertical gradient, sun disc, painterly
// two-tone clouds, and stars — no texture assets. Designed as the companion
// backdrop for the stylized water (it appears in the water's planar
// reflections automatically), but works standalone with any scene.
//
//   const sky = new StylizedSky({ preset-ish options });
//   scene.add(sky);
//   sky.update(delta, camera);       // each frame
//   sky.applySettings({ sunDirection: [..], cloudCoverage: 0.6 });

/**
 * Default sky settings. Every value equals the historical hardcoded/
 * constructor default, so `new StylizedSky()` renders identically to
 * previous releases. `radius` is construction-only (dome geometry).
 */
export const DEFAULT_SKY_SETTINGS = Object.freeze({
  radius: 100,
  zenithColor: [0.28, 0.56, 0.92],
  horizonColor: [0.78, 0.92, 1.0],
  groundColor: [0.42, 0.48, 0.55],
  sunDirection: [0.35, 0.8, 0.45],
  sunColor: [1.0, 0.95, 0.82],
  sunSize: 0.026,
  sunDiscSoftness: 0.5,
  sunGlowStrength: 1.0,
  sunDiscIntensity: 2.4,
  sunGlowSpread: 5.0,
  sunGlowCoreSharpness: 60.0,
  sunGlowBroadStrength: 0.16,
  sunGlowCoreStrength: 0.5,
  sunCloudOcclusionStrength: 1.0,
  horizonScattering: 0.5,
  zenithExponent: 0.48,
  groundExponent: 0.55,
  horizonBandSize: 0.42,
  horizonSunPower: 5.0,
  cloudCoverage: 0.42,
  cloudScale: 1.6,
  cloudSpeed: 1.0,
  cloudDirection: Object.freeze([0.9615239476, 0.2747211279]),
  cloudSeed: 0,
  cloudProjection: 0.22,
  cloudSoftness: 0.1,
  cloudEdgeOpacity: 0.65,
  cloudOpacity: 1.0,
  cloudShadeStrength: 0.85,
  cloudShadeThreshold: 0.02,
  cloudShadeSoftness: 0.06,
  cloudLightOffset: 0.4,
  cloudSilverLiningStrength: 0.3,
  cloudSunPower: 10.0,
  cloudHorizonFade: 0.16,
  cloudColor: [1.0, 1.0, 1.0],
  cloudShadeColor: [0.68, 0.78, 0.92],
  starsStrength: 0.0,
  starsColor: Object.freeze([1.0, 0.98, 0.92]),
  starsSeed: 0,
  starsScale: 14.0,
  starsDensity: 0.28,
  starsSize: 0.06,
  starsTwinkleStrength: 0.8,
  starsTwinkleSpeed: 1.0,
  starsHorizonFade: 0.24,
});

/** Document `type` discriminator for portable sky-look presets. */
export const SKY_PRESET_DOCUMENT_TYPE = 'toonlab/sky-preset';

/** Current portable sky preset schema version. v2 adds per-scenario variants. */
export const SKY_PRESET_SCHEMA_VERSION = 2;

/**
 * Canonical sky scenarios — the world-state axis (time of day / weather
 * condition), deliberately separate from the style axis. A sky preset is a
 * STYLE (an identity: palette bias, cloud character, glow personality) and
 * every style resolves in every scenario, exactly like a lighting style's
 * `dayCycle` covers every hour. Selecting "Call Me Sensei" never means
 * "daytime only"; it means the Call Me Sensei rendition of whichever
 * scenario the scene is in.
 */
export const SKY_SCENARIOS = Object.freeze([
  Object.freeze({
    description: 'Crisp daylight with sparse, slow-moving clouds.',
    id: 'clear_day',
    label: 'Clear Day',
  }),
  Object.freeze({
    description: 'Low warm sun, glowing horizon, and softly lit evening clouds.',
    id: 'golden_hour',
    label: 'Golden Hour',
  }),
  Object.freeze({
    description: 'Dense cloud cover with broad, low-contrast daylight.',
    id: 'overcast',
    label: 'Overcast',
  }),
  Object.freeze({
    description: 'Deep night with a cool moon glow, quiet clouds, and stars.',
    id: 'moonlit',
    label: 'Moonlit Night',
  }),
]);

/** The scenario a style shows when no scenario is requested. */
export const DEFAULT_SKY_SCENARIO = 'clear_day';

const SKY_SCENARIO_IDS = new Set(SKY_SCENARIOS.map((scenario) => scenario.id));

/** Lists the canonical scenarios as `{ id, label, description }` (for HUDs). */
export function getSkyScenarioOptions() {
  return SKY_SCENARIOS.map(({ description, id, label }) => ({ description, id, label }));
}

/**
 * Historical single-look preset ids. Each was really the Default style's
 * rendition of one scenario, so they now resolve as exactly that — settings
 * are byte-identical to the old flat presets. Kept indefinitely: saved
 * style bundles, lab links, and downstream games reference these ids.
 */
export const SKY_PRESET_ALIASES = Object.freeze({
  clear_day: Object.freeze({ preset: 'default', scenario: 'clear_day' }),
  golden_hour: Object.freeze({ preset: 'default', scenario: 'golden_hour' }),
  moonlit: Object.freeze({ preset: 'default', scenario: 'moonlit' }),
  overcast: Object.freeze({ preset: 'default', scenario: 'overcast' }),
});

// Canonical rendition of each scenario — settings identical to the historical
// flat presets of the same name. These are the Default style's variants and
// the inherited fallback for styles that do not author a scenario.
const SKY_SCENARIO_CANONICAL = Object.freeze({
  clear_day: Object.freeze({
    cloudCoverage: 0.12,
    cloudEdgeOpacity: 0.48,
    cloudScale: 1.9,
    cloudSeed: 12,
    cloudSoftness: 0.075,
    cloudSpeed: 0.65,
    horizonColor: Object.freeze([0.76, 0.93, 1.0]),
    horizonScattering: 0.42,
    sunGlowStrength: 1.15,
    zenithColor: Object.freeze([0.2, 0.52, 0.95]),
  }),
  golden_hour: Object.freeze({
    cloudColor: Object.freeze([1.0, 0.78, 0.6]),
    cloudCoverage: 0.34,
    cloudProjection: 0.28,
    cloudSeed: 47,
    cloudShadeColor: Object.freeze([0.58, 0.38, 0.52]),
    cloudSilverLiningStrength: 0.62,
    groundColor: Object.freeze([0.3, 0.22, 0.28]),
    horizonColor: Object.freeze([1.0, 0.55, 0.28]),
    horizonScattering: 0.76,
    starsStrength: 0.04,
    sunColor: Object.freeze([1.0, 0.62, 0.3]),
    sunDirection: Object.freeze([0.76, 0.18, 0.36]),
    sunGlowStrength: 1.85,
    sunGlowSpread: 3.8,
    sunDiscIntensity: 3.0,
    sunSize: 0.036,
    zenithColor: Object.freeze([0.22, 0.36, 0.68]),
  }),
  moonlit: Object.freeze({
    cloudColor: Object.freeze([0.2, 0.27, 0.42]),
    cloudCoverage: 0.28,
    cloudSeed: 31,
    cloudShadeColor: Object.freeze([0.06, 0.08, 0.17]),
    cloudSpeed: 0.35,
    groundColor: Object.freeze([0.015, 0.02, 0.05]),
    horizonColor: Object.freeze([0.09, 0.14, 0.25]),
    horizonScattering: 0.25,
    starsStrength: 1.1,
    starsColor: Object.freeze([0.72, 0.82, 1.0]),
    starsDensity: 0.42,
    starsScale: 18,
    starsSeed: 173,
    starsSize: 0.045,
    starsTwinkleStrength: 0.9,
    sunColor: Object.freeze([0.58, 0.7, 1.0]),
    sunDirection: Object.freeze([-0.45, 0.6, 0.3]),
    sunGlowStrength: 0.38,
    sunSize: 0.018,
    zenithColor: Object.freeze([0.015, 0.035, 0.11]),
  }),
  overcast: Object.freeze({
    cloudColor: Object.freeze([0.78, 0.83, 0.9]),
    cloudCoverage: 0.88,
    cloudEdgeOpacity: 0.82,
    cloudScale: 1.2,
    cloudSeed: 88,
    cloudShadeColor: Object.freeze([0.42, 0.5, 0.62]),
    cloudShadeSoftness: 0.1,
    cloudSoftness: 0.17,
    cloudSpeed: 0.72,
    groundColor: Object.freeze([0.3, 0.35, 0.42]),
    horizonColor: Object.freeze([0.62, 0.7, 0.78]),
    horizonScattering: 0.72,
    sunColor: Object.freeze([0.82, 0.88, 1.0]),
    sunGlowStrength: 0.16,
    sunSize: 0.018,
    zenithColor: Object.freeze([0.38, 0.49, 0.62]),
  }),
});

// Named sky styles. Built-ins and imported preset documents use the same
// registry so a preset behaves identically whether it shipped with Toonlab or
// was authored in a lab and registered at runtime.
const skyPresetRegistry = new Map();

/**
 * Registers a named sky style so it resolves in `createSkySettings({
 * preset, scenario })` exactly like the built-ins. Accepts `{ label?,
 * description?, settings?, scenarios? }` or flat settings. `settings` is the
 * style's base identity; `scenarios` maps canonical scenario ids to partial
 * settings layered over that base. Scenarios the style does not author
 * inherit the canonical rendition (the Default style's variant keys) over
 * the style base, so every style resolves in every scenario either way.
 */
export function registerSkyPreset(name, preset = {}, { overwrite = false } = {}) {
  const document = createSkyPresetDocument(name, preset);
  if (overwrite && isProtectedSystemStyleId(document.id) && skyPresetRegistry.has(document.id)) {
    throw new Error(`System style "${document.id}" is read-only.`);
  }
  if (!overwrite && skyPresetRegistry.has(document.id)) {
    throw new Error(`Sky preset "${document.id}" already exists.`);
  }
  const entry = Object.freeze({
    description: document.description,
    label: document.label,
    scenarios: Object.freeze(Object.fromEntries(
      Object.entries(document.scenarios ?? {})
        .map(([scenarioId, partial]) => [scenarioId, Object.freeze({ ...partial })]),
    )),
    settings: Object.freeze({ ...document.settings }),
  });
  skyPresetRegistry.set(document.id, entry);
  return { description: entry.description, id: document.id, label: entry.label };
}

/**
 * Lists registered sky styles as `{ id, label, description, scenarios }`,
 * where `scenarios` reports per-scenario coverage: `'authored'` when the
 * style ships its own variant, `'inherited'` when the canonical rendition
 * fills in. Every style always covers every scenario.
 */
export function getSkyPresetOptions() {
  return Array.from(skyPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
    scenarios: Object.fromEntries(SKY_SCENARIOS.map((scenario) => [
      scenario.id,
      preset.scenarios[scenario.id] ? 'authored' : 'inherited',
    ])),
  }));
}

/** Preferred style-axis normalizer; legacy scenario aliases fold to Default. */
export function resolveSkyStyleName(name) {
  const requested = String(name ?? '').trim();
  if (skyPresetRegistry.has(requested)) return requested;
  return SKY_PRESET_ALIASES[requested]?.preset ?? 'default';
}

function finiteNumber(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function colorArray(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const color = new THREE.Color(value);
      return [color.r, color.g, color.b];
    } catch {
      return fallback.slice();
    }
  }
  return fallback.slice();
}

function vector3Array(value, fallback) {
  if (value?.isVector3) return [value.x, value.y, value.z];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function vector2Array(value, fallback) {
  if (value?.isVector2) return [value.x, value.y];
  if (Array.isArray(value) && value.length >= 2) {
    const next = value.slice(0, 2).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function direction2Array(value, fallback) {
  const supplied = value?.isVector2 || (
    Array.isArray(value)
    && value.length >= 2
    && value.slice(0, 2).every((channel) => Number.isFinite(Number(channel)))
  );
  if (!supplied) return fallback.slice();
  const next = vector2Array(value, fallback);
  const length = Math.hypot(next[0], next[1]);
  if (length < 1e-6) return fallback.slice();
  return [next[0] / length, next[1] / length]
    .map((channel) => Number(channel.toFixed(10)));
}

// A style's complete partial for one scenario: authored variant over the
// style base when the style ships one, otherwise the canonical rendition
// over the style base. The base scenario without an authored variant is the
// style base verbatim, so single-look presets (user saves, v1 documents)
// keep reading as themselves until a scenario is requested.
function resolveSkyStyleVariant(entry, scenarioId) {
  const authored = entry.scenarios?.[scenarioId];
  if (authored) return { ...entry.settings, ...authored };
  if (scenarioId === DEFAULT_SKY_SCENARIO) return entry.settings;
  return { ...entry.settings, ...SKY_SCENARIO_CANONICAL[scenarioId] };
}

// Resolves `{ preset?, scenario? }` to one style entry + scenario id,
// following legacy single-look aliases (`preset: 'moonlit'` → Default style
// at the moonlit scenario). An explicit `scenario` wins over an alias's.
function resolveSkyPresetReference(preset, scenario) {
  const scenarioId = SKY_SCENARIO_IDS.has(scenario) ? scenario : undefined;
  let entry = skyPresetRegistry.get(preset);
  if (entry) return { entry, scenarioId: scenarioId ?? DEFAULT_SKY_SCENARIO, styleId: preset };
  const alias = preset === undefined ? undefined : SKY_PRESET_ALIASES[preset];
  if (alias) {
    return {
      entry: skyPresetRegistry.get(alias.preset),
      scenarioId: scenarioId ?? alias.scenario,
      styleId: alias.preset,
    };
  }
  // Scenario without a style: the Default style's rendition of it.
  if (scenarioId !== undefined) {
    return { entry: skyPresetRegistry.get('default'), scenarioId, styleId: 'default' };
  }
  return { entry: undefined, scenarioId: undefined, styleId: 'default' };
}

/**
 * Validates and merges partial sky options over {@link DEFAULT_SKY_SETTINGS}.
 * Unknown keys are ignored; malformed values fall back to their defaults.
 * `createSkySettings()` deep-equals the defaults object.
 *
 * `style` names a sky STYLE (`preset` is the compatibility alias) and
 * `scenario` one of {@link SKY_SCENARIOS};
 * every style resolves in every scenario. Legacy single-look ids
 * (`clear_day`, `golden_hour`, `overcast`, `moonlit`) resolve as the Default
 * style at that scenario with identical settings.
 *
 * @param {Object} [options] Partial settings (legacy constructor options are
 *   the same flat shape, so they work unchanged).
 * @returns {Object} A complete, plain sky settings object.
 */
export function createSkySettings(options = {}) {
  const source = typeof options === 'string'
    ? { preset: options }
    : (options && typeof options === 'object' ? options : {});
  const { entry, scenarioId } = resolveSkyPresetReference(source.style ?? source.preset, source.scenario);
  const presetSettings = entry ? resolveSkyStyleVariant(entry, scenarioId) : undefined;
  const base = presetSettings ? { ...DEFAULT_SKY_SETTINGS, ...presetSettings } : DEFAULT_SKY_SETTINGS;
  return {
    radius: Math.max(finiteNumber(source.radius, base.radius), 0.1),
    zenithColor: colorArray(source.zenithColor, base.zenithColor),
    horizonColor: colorArray(source.horizonColor, base.horizonColor),
    groundColor: colorArray(source.groundColor, base.groundColor),
    sunDirection: vector3Array(source.sunDirection, base.sunDirection),
    sunColor: colorArray(source.sunColor, base.sunColor),
    sunSize: finiteNumber(source.sunSize, base.sunSize, { max: 0.2, min: 0 }),
    sunDiscSoftness: finiteNumber(source.sunDiscSoftness, base.sunDiscSoftness, { max: 1, min: 0.01 }),
    sunGlowStrength: finiteNumber(source.sunGlowStrength, base.sunGlowStrength, { max: 4, min: 0 }),
    sunDiscIntensity: finiteNumber(source.sunDiscIntensity, base.sunDiscIntensity, { max: 8, min: 0 }),
    sunGlowSpread: finiteNumber(source.sunGlowSpread, base.sunGlowSpread, { max: 20, min: 1 }),
    sunGlowCoreSharpness: finiteNumber(source.sunGlowCoreSharpness, base.sunGlowCoreSharpness, { max: 200, min: 5 }),
    sunGlowBroadStrength: finiteNumber(source.sunGlowBroadStrength, base.sunGlowBroadStrength, { max: 2, min: 0 }),
    sunGlowCoreStrength: finiteNumber(source.sunGlowCoreStrength, base.sunGlowCoreStrength, { max: 2, min: 0 }),
    sunCloudOcclusionStrength: finiteNumber(source.sunCloudOcclusionStrength, base.sunCloudOcclusionStrength, { max: 1, min: 0 }),
    horizonScattering: finiteNumber(source.horizonScattering, base.horizonScattering, { max: 1, min: 0 }),
    zenithExponent: finiteNumber(source.zenithExponent, base.zenithExponent, { max: 4, min: 0.1 }),
    groundExponent: finiteNumber(source.groundExponent, base.groundExponent, { max: 4, min: 0.1 }),
    horizonBandSize: finiteNumber(source.horizonBandSize, base.horizonBandSize, { max: 1, min: 0.02 }),
    horizonSunPower: finiteNumber(source.horizonSunPower, base.horizonSunPower, { max: 20, min: 0.5 }),
    cloudCoverage: finiteNumber(source.cloudCoverage, base.cloudCoverage, { max: 1, min: 0 }),
    cloudScale: finiteNumber(source.cloudScale, base.cloudScale, { max: 6, min: 0.1 }),
    cloudSpeed: finiteNumber(source.cloudSpeed, base.cloudSpeed, { max: 4, min: 0 }),
    cloudDirection: direction2Array(source.cloudDirection, base.cloudDirection),
    cloudSeed: Math.round(finiteNumber(source.cloudSeed, base.cloudSeed, { max: 1000, min: 0 })),
    cloudProjection: finiteNumber(source.cloudProjection, base.cloudProjection, { max: 0.8, min: 0.05 }),
    cloudSoftness: finiteNumber(source.cloudSoftness, base.cloudSoftness, { max: 0.3, min: 0.01 }),
    cloudEdgeOpacity: finiteNumber(source.cloudEdgeOpacity, base.cloudEdgeOpacity, { max: 1, min: 0 }),
    cloudOpacity: finiteNumber(source.cloudOpacity, base.cloudOpacity, { max: 1, min: 0 }),
    cloudShadeStrength: finiteNumber(source.cloudShadeStrength, base.cloudShadeStrength, { max: 1, min: 0 }),
    cloudShadeThreshold: finiteNumber(source.cloudShadeThreshold, base.cloudShadeThreshold, { max: 0.3, min: -0.3 }),
    cloudShadeSoftness: finiteNumber(source.cloudShadeSoftness, base.cloudShadeSoftness, { max: 0.3, min: 0.001 }),
    cloudLightOffset: finiteNumber(source.cloudLightOffset, base.cloudLightOffset, { max: 2, min: 0 }),
    cloudSilverLiningStrength: finiteNumber(source.cloudSilverLiningStrength, base.cloudSilverLiningStrength, { max: 2, min: 0 }),
    cloudSunPower: finiteNumber(source.cloudSunPower, base.cloudSunPower, { max: 40, min: 1 }),
    cloudHorizonFade: finiteNumber(source.cloudHorizonFade, base.cloudHorizonFade, { max: 0.8, min: 0.02 }),
    cloudColor: colorArray(source.cloudColor, base.cloudColor),
    cloudShadeColor: colorArray(source.cloudShadeColor, base.cloudShadeColor),
    starsStrength: finiteNumber(source.starsStrength, base.starsStrength, { max: 2, min: 0 }),
    starsColor: colorArray(source.starsColor, base.starsColor),
    starsSeed: Math.round(finiteNumber(source.starsSeed, base.starsSeed, { max: 1000, min: 0 })),
    starsScale: finiteNumber(source.starsScale, base.starsScale, { max: 64, min: 2 }),
    starsDensity: finiteNumber(source.starsDensity, base.starsDensity, { max: 1, min: 0 }),
    starsSize: finiteNumber(source.starsSize, base.starsSize, { max: 0.2, min: 0.005 }),
    starsTwinkleStrength: finiteNumber(source.starsTwinkleStrength, base.starsTwinkleStrength, { max: 1, min: 0 }),
    starsTwinkleSpeed: finiteNumber(source.starsTwinkleSpeed, base.starsTwinkleSpeed, { max: 4, min: 0 }),
    starsHorizonFade: finiteNumber(source.starsHorizonFade, base.starsHorizonFade, { max: 1, min: 0.04 }),
  };
}

/**
 * Panel group metadata for the sky settings, in display order. Settings
 * themselves stay flat; each group lists which flat keys it owns via
 * {@link SKY_SETTING_FIELD_SCHEMA}.
 */
export const SKY_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Sky dome geometry. Construction-only.',
    id: 'dome',
    label: 'Dome',
  }),
  Object.freeze({
    description: 'Vertical zenith-to-horizon-to-ground gradient and horizon scattering.',
    id: 'gradient',
    label: 'Gradient',
  }),
  Object.freeze({
    description: 'Sun disc position, size, tint, and glow halo.',
    id: 'sun',
    label: 'Sun',
  }),
  Object.freeze({
    description: 'Painterly two-tone procedural clouds.',
    id: 'clouds',
    label: 'Clouds',
  }),
  Object.freeze({
    description: 'Procedural star field for night skies.',
    id: 'stars',
    label: 'Stars',
  }),
]);

const SKY_FIELD_DEFINITIONS = Object.freeze({
  dome: {
    radius: {
      description: 'Sphere radius of the sky dome in meters. Construction-only: baked into the dome geometry; applySettings stores but does not rebuild it.',
      label: 'Radius',
      range: { max: 1000, min: 10, step: 1 },
      serializable: false,
      type: 'number',
    },
  },
  gradient: {
    zenithColor: {
      description: 'Sky color straight up at the top of the dome.',
      label: 'Zenith Color',
      type: 'color',
    },
    horizonColor: {
      description: 'Sky color at the horizon band.',
      label: 'Horizon Color',
      type: 'color',
    },
    groundColor: {
      description: 'Dome color below the horizon.',
      label: 'Ground Color',
      type: 'color',
    },
    zenithExponent: {
      description: 'Shape of the horizon-to-zenith gradient. Lower values bring the zenith color farther toward the horizon.',
      label: 'Zenith Gradient Shape',
      range: { max: 4, min: 0.1, step: 0.01 },
      type: 'number',
    },
    groundExponent: {
      description: 'Shape of the mirrored below-horizon fade into the ground color.',
      label: 'Ground Gradient Shape',
      range: { max: 4, min: 0.1, step: 0.01 },
      type: 'number',
    },
    horizonBandSize: {
      description: 'Vertical size of the sun-side atmospheric scattering band around the horizon.',
      label: 'Horizon Band Size',
      range: { max: 1, min: 0.02, step: 0.01 },
      type: 'number',
    },
    horizonSunPower: {
      description: 'How tightly horizon scattering concentrates toward the sun direction.',
      label: 'Horizon Sun Focus',
      range: { max: 20, min: 0.5, step: 0.1 },
      type: 'number',
    },
    horizonScattering: {
      description: 'Strength of the bright sun-side atmospheric wedge at the horizon.',
      label: 'Horizon Scatter Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  sun: {
    sunDirection: {
      description: 'World-space direction toward the sun (normalized on apply). Match your main directional light.',
      label: 'Sun Direction',
      type: 'vector3',
    },
    sunColor: {
      description: 'Tint of the sun disc and its glow.',
      label: 'Sun Color',
      type: 'color',
    },
    sunSize: {
      description: 'Angular size of the sun disc.',
      label: 'Sun Size',
      range: { max: 0.2, min: 0, step: 0.001 },
      type: 'number',
    },
    sunDiscSoftness: {
      description: 'Fraction of the disc radius used for its anti-aliased painterly edge.',
      label: 'Disc Edge Softness',
      range: { max: 1, min: 0.01, step: 0.01 },
      type: 'number',
    },
    sunDiscIntensity: {
      description: 'Brightness multiplier of the solid sun disc before the renderer tone map.',
      label: 'Disc Intensity',
      range: { max: 8, min: 0, step: 0.05 },
      type: 'number',
    },
    sunGlowStrength: {
      description: 'Master intensity of the broad and core sun glow terms.',
      label: 'Glow Strength',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    sunGlowSpread: {
      description: 'Falloff power of the broad halo. Lower values spread the glow across more sky.',
      label: 'Glow Spread',
      range: { max: 20, min: 1, step: 0.1 },
      type: 'number',
    },
    sunGlowCoreSharpness: {
      description: 'Falloff power of the tight inner halo. Higher values make a smaller, sharper core.',
      label: 'Core Sharpness',
      range: { max: 200, min: 5, step: 1 },
      type: 'number',
    },
    sunGlowBroadStrength: {
      description: 'Contribution of the broad halo inside the master glow strength.',
      label: 'Broad Halo',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    sunGlowCoreStrength: {
      description: 'Contribution of the tight inner halo inside the master glow strength.',
      label: 'Core Halo',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    sunCloudOcclusionStrength: {
      description: 'How strongly dense cloud coverage hides the sun disc. 0 keeps the disc visible through cloud.',
      label: 'Cloud Occlusion',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  clouds: {
    cloudCoverage: {
      description: 'Fraction of the sky filled by clouds. 0 clears the sky.',
      label: 'Cloud Coverage',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudScale: {
      description: 'Noise scale of the cloud shapes; higher gives smaller, busier clouds.',
      label: 'Cloud Scale',
      range: { max: 6, min: 0.1, step: 0.01 },
      type: 'number',
    },
    cloudSoftness: {
      description: 'Width of the painterly cloud silhouette transition.',
      label: 'Edge Softness',
      range: { max: 0.3, min: 0.01, step: 0.005 },
      type: 'number',
    },
    cloudProjection: {
      description: 'Perspective offset of the virtual cloud plane; higher values flatten clouds toward the horizon.',
      label: 'Layer Projection',
      range: { max: 0.8, min: 0.05, step: 0.01 },
      type: 'number',
    },
    cloudOpacity: {
      description: 'Overall blend opacity of the procedural cloud layer.',
      label: 'Cloud Opacity',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudEdgeOpacity: {
      description: 'Opacity of the soft outer silhouette relative to the solid cloud core.',
      label: 'Edge Opacity',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudSpeed: {
      description: 'How fast the authored cloud layer drifts across the dome.',
      label: 'Cloud Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudDirection: {
      description: 'Normalized horizontal drift direction of the authored cloud layer; speed is controlled separately.',
      label: 'Cloud Direction',
      type: 'vector2',
    },
    cloudSeed: {
      description: 'Offsets the procedural cloud field to produce a different deterministic composition.',
      integer: true,
      label: 'Cloud Pattern Seed',
      range: { max: 1000, min: 0, step: 1 },
      type: 'number',
    },
    cloudColor: {
      description: 'Lit tone of the two-tone painterly clouds.',
      label: 'Cloud Color',
      type: 'color',
    },
    cloudShadeColor: {
      description: 'Shaded underside tone of the two-tone painterly clouds.',
      label: 'Cloud Shade Color',
      type: 'color',
    },
    cloudShadeStrength: {
      description: 'Strength of the two-tone shaded underside.',
      label: 'Shade Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadeThreshold: {
      description: 'Noise-difference threshold that separates the lit and shaded cloud tones.',
      label: 'Shade Threshold',
      range: { max: 0.3, min: -0.3, step: 0.005 },
      type: 'number',
    },
    cloudShadeSoftness: {
      description: 'Softness of the transition between the two cloud tones.',
      label: 'Shade Softness',
      range: { max: 0.3, min: 0.001, step: 0.005 },
      type: 'number',
    },
    cloudLightOffset: {
      description: 'Distance of the secondary noise sample toward the sun; controls the depth and directionality of cloud shading.',
      label: 'Light Sample Offset',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudSilverLiningStrength: {
      description: 'Warm sun-colored lining added to cloud edges facing the sun.',
      label: 'Silver Lining',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudSunPower: {
      description: 'Angular focus of the sun-colored cloud lining.',
      label: 'Lining Focus',
      range: { max: 40, min: 1, step: 0.5 },
      type: 'number',
    },
    cloudHorizonFade: {
      description: 'Altitude at which the cloud layer reaches full opacity above the horizon.',
      label: 'Horizon Fade',
      range: { max: 0.8, min: 0.02, step: 0.01 },
      type: 'number',
    },
  },
  stars: {
    starsStrength: {
      description: 'Brightness of the procedural star field. 0 (default) hides stars for daytime skies.',
      label: 'Stars Strength',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    starsColor: {
      description: 'Tint of the procedural star glints.',
      label: 'Stars Color',
      type: 'color',
    },
    starsSeed: {
      description: 'Offsets the deterministic star pattern without changing density or size.',
      integer: true,
      label: 'Stars Pattern Seed',
      range: { max: 1000, min: 0, step: 1 },
      type: 'number',
    },
    starsDensity: {
      description: 'Fraction of candidate cells allowed to contain a visible star.',
      label: 'Stars Density',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    starsScale: {
      description: 'Density scale of the projected star grid; higher values produce more, smaller cells.',
      label: 'Stars Scale',
      range: { max: 64, min: 2, step: 0.5 },
      type: 'number',
    },
    starsSize: {
      description: 'Size of each procedural star glint inside its cell.',
      label: 'Stars Size',
      range: { max: 0.2, min: 0.005, step: 0.005 },
      type: 'number',
    },
    starsTwinkleStrength: {
      description: 'Depth of per-star brightness animation. 0 disables twinkle without hiding stars.',
      label: 'Twinkle Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    starsTwinkleSpeed: {
      description: 'Speed multiplier of the seeded per-star twinkle animation.',
      label: 'Twinkle Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    starsHorizonFade: {
      description: 'Altitude at which the star field reaches full brightness above the horizon.',
      label: 'Horizon Fade',
      range: { max: 1, min: 0.04, step: 0.01 },
      type: 'number',
    },
  },
});

function createSkyFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_SKY_SETTINGS[key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    integer: field.integer ?? false,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: field.serializable ?? true,
    type: field.type,
  });
}

/**
 * Field metadata (id/group/key/label/description/type/range/defaultValue/
 * serializable) per settings group, in the shape consumed by
 * `createSettingsPanel`. Keys are the flat {@link DEFAULT_SKY_SETTINGS} keys.
 */
export const SKY_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    SKY_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(SKY_FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createSkyFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

const SKY_FIELDS_BY_KEY = Object.freeze(Object.fromEntries(
  Object.values(SKY_SETTING_FIELD_SCHEMA)
    .flatMap((fields) => Object.entries(fields)),
));

function cleanSkyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeSkyPresetId(value) {
  return String(value ?? '').trim();
}

function collectTopLevelSkySettings(source) {
  const input = cleanSkyObject(source);
  return Object.fromEntries(
    Object.keys(SKY_FIELDS_BY_KEY)
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]]),
  );
}

function collectSkyPresetWarnings(settings = {}) {
  const warnings = [];
  for (const key of Object.keys(cleanSkyObject(settings))) {
    const field = SKY_FIELDS_BY_KEY[key];
    if (!field) warnings.push(`Unknown sky setting "${key}" was ignored.`);
    else if (!field.serializable) {
      warnings.push(`Sky setting "${key}" is construction-only and was not stored in the preset.`);
    }
  }
  return warnings;
}

/**
 * Normalizes a sky look into a complete, JSON-safe settings object. Runtime
 * construction state such as the dome radius is intentionally excluded.
 */
export function sanitizeSkyPresetSettings(settings = {}) {
  const knownSettings = collectTopLevelSkySettings(settings);
  const normalized = createSkySettings(knownSettings);
  return Object.fromEntries(
    Object.entries(SKY_FIELDS_BY_KEY)
      .filter(([, field]) => field.serializable)
      .map(([key]) => [key, normalized[key]]),
  );
}

// One scenario variant, sanitized but kept PARTIAL: only the keys the style
// actually overrides for that scenario, each normalized to schema ranges.
function sanitizeSkyScenarioPartial(partial) {
  const known = collectTopLevelSkySettings(partial);
  const normalized = createSkySettings(known);
  return Object.fromEntries(
    Object.keys(known)
      .filter((key) => SKY_FIELDS_BY_KEY[key].serializable)
      .map((key) => [key, normalized[key]]),
  );
}

function sanitizeSkyPresetScenarios(input) {
  const warnings = [];
  if (input === undefined) return { scenarios: undefined, warnings };
  const scenarios = {};
  for (const [scenarioId, partial] of Object.entries(cleanSkyObject(input))) {
    if (!SKY_SCENARIO_IDS.has(scenarioId)) {
      warnings.push(`Unknown sky scenario "${scenarioId}" was ignored.`);
      continue;
    }
    warnings.push(...collectSkyPresetWarnings(cleanSkyObject(partial))
      .map((warning) => `Scenario "${scenarioId}": ${warning}`));
    scenarios[scenarioId] = sanitizeSkyScenarioPartial(cleanSkyObject(partial));
  }
  return {
    scenarios: Object.keys(scenarios).length > 0 ? scenarios : undefined,
    warnings,
  };
}

function migrateSkyPresetDocument(input) {
  const source = cleanSkyObject(input);
  const numericVersion = Number(source.version ?? source.schemaVersion ?? 0);
  const version = Number.isFinite(numericVersion) ? Math.round(numericVersion) : 0;
  if (version > SKY_PRESET_SCHEMA_VERSION) return { ...source, version };
  const nestedSettings = cleanSkyObject(source.settings);
  return {
    description: source.description ?? '',
    id: source.id ?? source.name ?? source.preset ?? '',
    label: source.label ?? source.title ?? source.name ?? source.id ?? '',
    // v1 documents carry a single flat look and no scenarios; they stay
    // valid as a style whose non-base scenarios inherit the canonical
    // renditions at resolve time.
    ...(source.scenarios === undefined ? {} : { scenarios: source.scenarios }),
    settings: Object.keys(nestedSettings).length > 0
      ? nestedSettings
      : collectTopLevelSkySettings(source),
    type: source.type ?? SKY_PRESET_DOCUMENT_TYPE,
    version: SKY_PRESET_SCHEMA_VERSION,
  };
}

/** Validates and normalizes a portable sky preset document. Never throws. */
export function validateSkyPresetDocument(input) {
  if (cleanSkyObject(input).type !== undefined && input.type !== SKY_PRESET_DOCUMENT_TYPE) {
    return {
      errors: [`Sky preset type must be "${SKY_PRESET_DOCUMENT_TYPE}".`],
      ok: false,
      value: null,
      warnings: [],
    };
  }
  const result = validateSettingsPresetDocument(input, {
    collectWarnings: collectSkyPresetWarnings,
    documentType: SKY_PRESET_DOCUMENT_TYPE,
    migrateDocument: migrateSkyPresetDocument,
    normalizeId: normalizeSkyPresetId,
    sanitizeSettings: sanitizeSkyPresetSettings,
    schemaVersion: SKY_PRESET_SCHEMA_VERSION,
  });
  if (!result.ok) return result;
  // The shared settings-document helper only knows `settings`; the scenario
  // variants ride alongside it and are sanitized here.
  const migrated = migrateSkyPresetDocument(input);
  const { scenarios, warnings } = sanitizeSkyPresetScenarios(migrated.scenarios);
  result.warnings.push(...warnings);
  if (scenarios !== undefined) result.value = { ...result.value, scenarios };
  return result;
}

/** Parses JSON text or an object into a validated sky preset document. */
export function parseSkyPresetDocument(input) {
  return parsePresetDocument(input, validateSkyPresetDocument, {
    invalidJsonLabel: 'sky preset',
  });
}

/** Creates a canonical, versioned sky preset document. */
export function createSkyPresetDocument(id, definition = {}) {
  const source = cleanSkyObject(definition);
  const document = {
    description: source.description ?? '',
    id: id ?? source.id ?? source.name ?? source.preset,
    label: source.label ?? source.title ?? source.name ?? id,
    ...(source.scenarios === undefined ? {} : { scenarios: source.scenarios }),
    settings: source.settings ?? collectTopLevelSkySettings(source),
    type: SKY_PRESET_DOCUMENT_TYPE,
    version: SKY_PRESET_SCHEMA_VERSION,
  };
  const result = validateSkyPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

/** Serializes a sky preset id/definition or document-like object as JSON. */
export function serializeSkyPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createSkyPresetDocument,
    pretty,
  });
}

/** Registers a portable preset document, overwriting an existing id by default. */
export function registerSerializedSkyPreset(input, options = {}) {
  const result = parseSkyPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerSkyPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

// Built-in STYLES. A style is an identity, not a moment: each one authors
// (or inherits) a variant for every canonical scenario, the same way a
// lighting style's dayCycle covers every hour. The historical single-look
// ids (clear_day/golden_hour/overcast/moonlit) resolve through
// SKY_PRESET_ALIASES as the Default style at that scenario, byte-identical
// to the flat presets they replaced.

registerSkyPreset('default', {
  description: 'Baseline stylized sky in every scenario — the canonical renditions.',
  label: 'Default',
  scenarios: SKY_SCENARIO_CANONICAL,
});

registerSkyPreset('call_me_sensei', {
  description: 'Studio-managed signature sky in every scenario, curated by Call Me Sensei and updated over releases.',
  label: 'Call Me Sensei',
  // Identity base: saturated zenith, soft painterly clouds, generous glow.
  // cloudSeed stays fixed across scenarios so the style keeps the same cloud
  // shapes while the light moves through them.
  settings: {
    cloudCoverage: 0.36,
    cloudScale: 1.45,
    cloudSeed: 7,
    cloudSoftness: 0.12,
    horizonScattering: 0.56,
    sunGlowStrength: 1.1,
    zenithColor: [0.24, 0.52, 0.92],
  },
  // Palette-matched to the call-me-sensei lighting style dayCycle (hour 12 /
  // 18 / 0 keyframes) so sky and lighting agree when both are active.
  scenarios: {
    clear_day: {
      cloudCoverage: 0.22,
      cloudEdgeOpacity: 0.55,
      cloudSpeed: 0.7,
      horizonColor: [0.72, 0.9, 1.0],
      sunGlowStrength: 1.2,
      zenithColor: [0.18, 0.5, 1.0],
    },
    golden_hour: {
      cloudColor: [1.0, 0.72, 0.55],
      cloudCoverage: 0.34,
      cloudProjection: 0.28,
      cloudShadeColor: [0.5, 0.3, 0.6],
      cloudSilverLiningStrength: 0.7,
      groundColor: [0.32, 0.2, 0.28],
      horizonColor: [1.0, 0.5, 0.32],
      horizonScattering: 0.8,
      starsStrength: 0.08,
      sunColor: [1.0, 0.55, 0.24],
      sunDirection: [0.76, 0.16, 0.36],
      sunDiscIntensity: 3.2,
      sunGlowSpread: 3.6,
      sunGlowStrength: 2.0,
      sunSize: 0.038,
      zenithColor: [0.3, 0.3, 0.78],
    },
    overcast: {
      cloudColor: [0.82, 0.87, 0.95],
      cloudCoverage: 0.85,
      cloudEdgeOpacity: 0.8,
      cloudShadeColor: [0.46, 0.54, 0.7],
      cloudShadeSoftness: 0.1,
      cloudSoftness: 0.16,
      cloudSpeed: 0.72,
      groundColor: [0.32, 0.38, 0.48],
      horizonColor: [0.68, 0.76, 0.86],
      horizonScattering: 0.7,
      sunColor: [0.85, 0.9, 1.0],
      sunGlowStrength: 0.2,
      sunSize: 0.018,
      zenithColor: [0.36, 0.5, 0.72],
    },
    moonlit: {
      cloudColor: [0.16, 0.24, 0.46],
      cloudCoverage: 0.3,
      cloudShadeColor: [0.05, 0.08, 0.2],
      cloudSpeed: 0.35,
      groundColor: [0.015, 0.025, 0.06],
      horizonColor: [0.12, 0.2, 0.5],
      horizonScattering: 0.3,
      starsColor: [0.75, 0.85, 1.0],
      starsDensity: 0.46,
      starsScale: 18,
      starsSeed: 173,
      starsSize: 0.045,
      starsStrength: 1.15,
      starsTwinkleStrength: 0.9,
      sunColor: [0.62, 0.74, 1.0],
      sunDirection: [-0.45, 0.6, 0.3],
      sunGlowStrength: 0.42,
      sunSize: 0.018,
      zenithColor: [0.02, 0.05, 0.2],
    },
  },
});

function setSrgbColorUniform(uniform, rgb) {
  uniform.value.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

export function applySkySettingsToMaterial(material, options = {}) {
  // Both backends expose `.uniforms` under the same names: ShaderMaterial
  // natively, the TSL factory via same-name UniformNodes (`.value` on both).
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  const source = cleanSkyObject(options);
  const replacesLook = source.preset !== undefined || source.scenario !== undefined;
  const settings = createSkySettings({
    ...(replacesLook ? {} : cleanSkyObject(material.userData?.skySettings)),
    ...source,
  });
  setSrgbColorUniform(uniforms.uZenithColor, settings.zenithColor);
  setSrgbColorUniform(uniforms.uHorizonColor, settings.horizonColor);
  setSrgbColorUniform(uniforms.uGroundColor, settings.groundColor);
  uniforms.uZenithExponent.value = settings.zenithExponent;
  uniforms.uGroundExponent.value = settings.groundExponent;
  uniforms.uHorizonBandSize.value = settings.horizonBandSize;
  uniforms.uHorizonSunPower.value = settings.horizonSunPower;
  uniforms.uSunDirection.value.set(...settings.sunDirection).normalize();
  setSrgbColorUniform(uniforms.uSunColor, settings.sunColor);
  uniforms.uSunSize.value = settings.sunSize;
  uniforms.uSunDiscSoftness.value = settings.sunDiscSoftness;
  uniforms.uSunDiscIntensity.value = settings.sunDiscIntensity;
  uniforms.uSunGlowStrength.value = settings.sunGlowStrength;
  uniforms.uSunGlowSpread.value = settings.sunGlowSpread;
  uniforms.uSunGlowCoreSharpness.value = settings.sunGlowCoreSharpness;
  uniforms.uSunGlowBroadStrength.value = settings.sunGlowBroadStrength;
  uniforms.uSunGlowCoreStrength.value = settings.sunGlowCoreStrength;
  uniforms.uSunCloudOcclusionStrength.value = settings.sunCloudOcclusionStrength;
  uniforms.uHorizonScattering.value = settings.horizonScattering;
  uniforms.uCloudCoverage.value = settings.cloudCoverage;
  uniforms.uCloudScale.value = settings.cloudScale;
  uniforms.uCloudSpeed.value = settings.cloudSpeed;
  uniforms.uCloudDirection.value.set(...settings.cloudDirection);
  uniforms.uCloudSeed.value = settings.cloudSeed;
  uniforms.uCloudProjection.value = settings.cloudProjection;
  uniforms.uCloudSoftness.value = settings.cloudSoftness;
  uniforms.uCloudEdgeOpacity.value = settings.cloudEdgeOpacity;
  uniforms.uCloudOpacity.value = settings.cloudOpacity;
  uniforms.uCloudShadeStrength.value = settings.cloudShadeStrength;
  uniforms.uCloudShadeThreshold.value = settings.cloudShadeThreshold;
  uniforms.uCloudShadeSoftness.value = settings.cloudShadeSoftness;
  uniforms.uCloudLightOffset.value = settings.cloudLightOffset;
  uniforms.uCloudSilverLiningStrength.value = settings.cloudSilverLiningStrength;
  uniforms.uCloudSunPower.value = settings.cloudSunPower;
  uniforms.uCloudHorizonFade.value = settings.cloudHorizonFade;
  setSrgbColorUniform(uniforms.uCloudColor, settings.cloudColor);
  setSrgbColorUniform(uniforms.uCloudShadeColor, settings.cloudShadeColor);
  uniforms.uStarsStrength.value = settings.starsStrength;
  setSrgbColorUniform(uniforms.uStarsColor, settings.starsColor);
  uniforms.uStarsSeed.value = settings.starsSeed;
  uniforms.uStarsScale.value = settings.starsScale;
  uniforms.uStarsDensity.value = settings.starsDensity;
  uniforms.uStarsSize.value = settings.starsSize;
  uniforms.uStarsTwinkleStrength.value = settings.starsTwinkleStrength;
  uniforms.uStarsTwinkleSpeed.value = settings.starsTwinkleSpeed;
  uniforms.uStarsHorizonFade.value = settings.starsHorizonFade;
  material.userData.skySettings = settings;
  return material;
}

export function createSkyMaterial(options = {}) {
  return applySkySettingsToMaterial(
    createSkyNodeMaterial({ quality: options?.quality }),
    options,
  );
}

export class StylizedSky extends THREE.Mesh {
  /**
   * @param {Object} [options] Flat sky settings (see
   *   {@link DEFAULT_SKY_SETTINGS}); legacy individual constructor options
   *   are the same keys, so existing callers keep working unchanged.
   */
  constructor(options = {}) {
    const settings = createSkySettings(options);
    const quality = resolveSkyQuality(options?.quality);
    const source = typeof options === 'string' ? { preset: options } : cleanSkyObject(options);
    const identity = resolveSkyPresetReference(source.style ?? source.preset, source.scenario);
    super(
      new THREE.SphereGeometry(settings.radius, 48, 24),
      createSkyMaterial({ ...settings, quality }),
    );
    this.name = 'StylizedSky';
    markFactoryStyleMaterial(this.material, 'SkyDome');
    attachFactoryStyleTarget(this, 'sky', {
      targetId: 'toonlab/sky',
      ...(source.styleTarget ?? {}),
    });
    this.frustumCulled = false;
    this.renderOrder = -100;
    this._authoredSettings = settings;
    this._style = identity.styleId;
    this._scenario = identity.scenarioId ?? DEFAULT_SKY_SCENARIO;
    this._quality = quality;
    this._retiredMaterials = [];
    this._sceneOverrideLayers = new Map();
    this._sceneOverrideSequence = 0;
    this._sceneOverrides = {};
  }

  get settings() {
    return this._authoredSettings;
  }

  /** Current authored IP-wide style identity. */
  get style() {
    return this._style;
  }

  /** Current authored world-state scenario. */
  get scenario() {
    return this._scenario;
  }

  /** Current compile-time deployment tier; not part of the authored preset. */
  get quality() {
    return this._quality;
  }

  /** The settings currently uploaded after transient scene overrides. */
  get renderedSettings() {
    return this.material.userData.skySettings;
  }

  /** Current transient scene overrides, kept separate from authored settings. */
  get sceneOverrides() {
    return structuredClone(this._sceneOverrides);
  }

  /** Ordered runtime layer metadata, without exposing mutable resolvers. */
  get sceneOverrideLayers() {
    return [...this._sceneOverrideLayers.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order)
      .map((layer) => ({ id: layer.id, priority: layer.priority }));
  }

  _composeSceneSettings() {
    let composed = createSkySettings(this._authoredSettings);
    const layers = [...this._sceneOverrideLayers.values()]
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (const layer of layers) {
      const source = layer.resolve
        ? layer.resolve(structuredClone(composed))
        : layer.settings;
      const next = collectTopLevelSkySettings(source);
      delete next.radius;
      composed = createSkySettings({ ...composed, ...next });
    }
    return composed;
  }

  _applyComposedSceneSettings() {
    const composed = this._composeSceneSettings();
    this._sceneOverrides = Object.fromEntries(
      Object.keys(SKY_FIELDS_BY_KEY)
        .filter((key) => key !== 'radius')
        .filter((key) => JSON.stringify(composed[key]) !== JSON.stringify(this._authoredSettings[key]))
        .map((key) => [key, composed[key]]),
    );
    applySkySettingsToMaterial(this.material, composed);
    return this.renderedSettings;
  }

  /**
   * Runtime re-tune: merges `options` into the current settings and pushes
   * every value into the material uniforms. `radius` is construction-only
   * (baked into the dome geometry); a new value is stored but the dome is
   * not rebuilt.
   *
   * @param {Object} [options] Partial flat settings, same keys as
   *   {@link DEFAULT_SKY_SETTINGS}.
   * @returns {Object} The updated settings object.
   */
  applySettings(options = {}) {
    const source = cleanSkyObject(options);
    if (source.style !== undefined || source.preset !== undefined) {
      const { preset, style, ...overrides } = source;
      return this.setStyle(style ?? preset, overrides);
    }
    if (source.scenario !== undefined) {
      const { scenario, ...overrides } = source;
      return this.setScenario(scenario, overrides);
    }
    this._authoredSettings = createSkySettings({ ...this._authoredSettings, ...options });
    this._applyComposedSceneSettings();
    return this.settings;
  }

  /**
   * Replaces the authored look from a registered style, then recomposes
   * runtime layers. `overrides.scenario` selects which canonical scenario of
   * the style to show (defaults to {@link DEFAULT_SKY_SCENARIO}).
   */
  setPreset(name, overrides = {}) {
    return this.setStyle(name, overrides);
  }

  /** Preferred style-axis name; setPreset() remains the compatibility alias. */
  setStyle(name, overrides = {}) {
    const source = cleanSkyObject(overrides);
    const alias = SKY_PRESET_ALIASES[name];
    const scenario = source.scenario ?? alias?.scenario ?? this._scenario;
    const identity = resolveSkyPresetReference(alias?.preset ?? name, scenario);
    const { scenario: _scenario, ...settingsOverrides } = source;
    this._style = identity.styleId;
    this._scenario = identity.scenarioId ?? DEFAULT_SKY_SCENARIO;
    this._authoredSettings = createSkySettings({
      style: this._style,
      scenario: this._scenario,
      ...settingsOverrides,
    });
    this._applyComposedSceneSettings();
    return this.settings;
  }

  /** Changes the world-state moment without changing the selected style. */
  setScenario(name, overrides = {}) {
    return this.setStyle(this._style, { ...cleanSkyObject(overrides), scenario: name });
  }

  /**
   * Adds or replaces one transient world-state layer. A resolver receives the
   * result of all lower-priority layers, which lets Weather tint the current
   * Lighting time-of-day instead of competing with it.
   */
  setSceneOverrideLayer(id, optionsOrResolver = {}, {
    priority = SKY_SCENE_OVERRIDE_PRIORITIES.scene,
    replace = true,
  } = {}) {
    if ((typeof id !== 'string' || id.length === 0) && typeof id !== 'symbol') {
      throw new TypeError('A sky scene override layer needs a non-empty string or Symbol id.');
    }
    const existing = this._sceneOverrideLayers.get(id);
    const resolve = typeof optionsOrResolver === 'function' ? optionsOrResolver : null;
    let settings = null;
    if (!resolve) {
      const next = collectTopLevelSkySettings(optionsOrResolver);
      delete next.radius;
      settings = !replace && existing?.settings
        ? { ...existing.settings, ...next }
        : next;
    }
    this._sceneOverrideLayers.set(id, {
      id,
      order: existing?.order ?? this._sceneOverrideSequence++,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : SKY_SCENE_OVERRIDE_PRIORITIES.scene,
      resolve,
      settings,
    });
    return this._applyComposedSceneSettings();
  }

  /** Removes one runtime owner without disturbing any other active layer. */
  clearSceneOverrideLayer(id) {
    if (!this._sceneOverrideLayers.delete(id)) return this.renderedSettings;
    return this._applyComposedSceneSettings();
  }

  /**
   * Applies transient Lighting/Weather/world-state inputs without modifying
   * the authored sky preset returned by {@link settings}.
   */
  setSceneOverrides(options = {}, { replace = false } = {}) {
    return this.setSceneOverrideLayer('scene', options, {
      priority: SKY_SCENE_OVERRIDE_PRIORITIES.scene,
      replace,
    });
  }

  /** Clears only the compatibility/manual `scene` layer. */
  clearSceneOverrides() {
    return this.clearSceneOverrideLayer('scene');
  }

  /** Explicit full teardown for hosts that own every runtime Sky layer. */
  clearAllSceneOverrideLayers() {
    this._sceneOverrideLayers.clear();
    return this._applyComposedSceneSettings();
  }

  /** Rebuilds only the material graph for a new deployment-quality tier. */
  setQuality(value) {
    const quality = resolveSkyQuality(value);
    if (quality.cloudOctaves === this._quality.cloudOctaves) return this;
    const previous = this.material;
    const elapsed = previous.uniforms?.uTime?.value ?? 0;
    this._quality = quality;
    this.material = createSkyMaterial({ ...this.renderedSettings, quality });
    this.material.uniforms.uTime.value = elapsed;
    // WebGPU submission is asynchronous. Disposing the old graph here can
    // destroy binding buffers still referenced by the command buffer already
    // in flight. Quality changes are rare deployment/lab actions, so retain
    // replaced graphs and release them with the Sky object at safe teardown.
    this._retiredMaterials.push(previous);
    return this;
  }

  // Advances cloud/star animation and keeps the dome centered on the camera.
  update(delta, camera) {
    this.material.uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    if (camera) camera.getWorldPosition(this.position);
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    for (const material of this._retiredMaterials) material.dispose();
    this._retiredMaterials.length = 0;
  }
}
