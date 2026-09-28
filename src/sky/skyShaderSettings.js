// Portable Sky Shader settings for ToonLab's authored anime sky renderer.
//
// The profile owns visible background treatment, sun/moon appearance, and
// stars. Current time, celestial direction, cloud rendering, atmosphere,
// weather, exposure, source meshes/textures/atlases, and camera are host
// inputs and never enter this document.

import {
  CALL_ME_SENSEI_SKY_ATMOSPHERE,
  CALL_ME_SENSEI_SKY_TIME_KEYFRAMES,
  DEFAULT_SKY_ATMOSPHERE,
  DEFAULT_SKY_TIME_KEYFRAMES,
  createSkyAtmosphereSettings,
  createSkyTimeKeyframes,
} from './skyTimeKeyframes.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';

export const SKY_SHADER_DOCUMENT_TYPE = 'toonlab/sky-shader-preset';
export const SKY_SHADER_SCHEMA_VERSION = 2;
export const DEFAULT_SKY_SHADER_PRESET = 'call_me_sensei';

const DEFINITIONS = Object.freeze({
  atlasBrightness: Object.freeze({
    description: 'Brightness multiplier applied after the authored anime sky color-curve lookup.',
    group: 'gradient',
    label: 'Sky Brightness',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  atlasSaturation: Object.freeze({
    description: 'Saturation of the authored sky gradient. 1 preserves the source color curve.',
    group: 'gradient',
    label: 'Sky Saturation',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  atlasContrast: Object.freeze({
    description: 'Contrast around middle gray after the authored sky color-curve lookup.',
    group: 'gradient',
    label: 'Sky Contrast',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  atlasSampleOffset: Object.freeze({
    description: 'Vertical offset into the authored sky color curve.',
    group: 'gradient',
    label: 'Gradient Offset',
    range: Object.freeze({ max: 0.5, min: -0.5, step: 0.001 }),
    type: 'number',
    value: 0,
  }),
  atlasSampleScale: Object.freeze({
    description: 'Vertical scale of the authored sky color curve around its midpoint.',
    group: 'gradient',
    label: 'Gradient Scale',
    range: Object.freeze({ max: 3, min: 0.1, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  skyTint: Object.freeze({
    description: 'Master tint multiplied into the complete sky background.',
    group: 'gradient',
    label: 'Sky Tint',
    type: 'color',
    value: Object.freeze([1, 1, 1]),
  }),
  zenithTint: Object.freeze({
    description: 'Additional tint toward the top of the sky dome.',
    group: 'gradient',
    label: 'Zenith Tint',
    type: 'color',
    value: Object.freeze([1, 1, 1]),
  }),
  horizonTint: Object.freeze({
    description: 'Additional tint centered on the visible horizon band.',
    group: 'gradient',
    label: 'Horizon Tint',
    type: 'color',
    value: Object.freeze([1, 1, 1]),
  }),
  belowHorizonTint: Object.freeze({
    description: 'Additional tint below the horizon. It affects background presentation, not ground materials.',
    group: 'gradient',
    label: 'Below-horizon Tint',
    type: 'color',
    value: Object.freeze([1, 1, 1]),
  }),
  horizonPosition: Object.freeze({
    description: 'Vertical center of the horizon treatment in dome UV space.',
    group: 'gradient',
    label: 'Horizon Position',
    range: Object.freeze({ max: 0.8, min: 0.2, step: 0.001 }),
    type: 'number',
    value: 0.5,
  }),
  horizonBlend: Object.freeze({
    description: 'Width used to blend the zenith, horizon, and below-horizon tint regions.',
    group: 'gradient',
    label: 'Horizon Blend',
    range: Object.freeze({ max: 0.5, min: 0.01, step: 0.001 }),
    type: 'number',
    value: 0.18,
  }),
  horizonGlowColor: Object.freeze({
    description: 'Tint of the optional sunward horizon glow.',
    group: 'gradient',
    label: 'Horizon Glow Color',
    type: 'color',
    value: Object.freeze([1, 0.72, 0.5]),
  }),
  horizonGlowStrength: Object.freeze({
    description: 'Strength of the sunward glow centered on the horizon.',
    group: 'gradient',
    label: 'Horizon Glow Strength',
    range: Object.freeze({ max: 3, min: 0, step: 0.01 }),
    type: 'number',
    value: 0,
  }),
  horizonGlowWidth: Object.freeze({
    description: 'Vertical width of the sunward horizon glow.',
    group: 'gradient',
    label: 'Horizon Glow Width',
    range: Object.freeze({ max: 0.5, min: 0.01, step: 0.001 }),
    type: 'number',
    value: 0.12,
  }),
  horizonGlowFocus: Object.freeze({
    description: 'Angular focus of the horizon glow toward the current sun direction.',
    group: 'gradient',
    label: 'Horizon Glow Focus',
    range: Object.freeze({ max: 24, min: 0.5, step: 0.1 }),
    type: 'number',
    value: 5,
  }),
  sunColor: Object.freeze({
    description: 'Tint of the visible sun disc.',
    group: 'sun',
    label: 'Sun Disc Color',
    type: 'color',
    value: Object.freeze([1, 0.96, 0.86]),
  }),
  sunDiscSize: Object.freeze({
    description: 'Angular radius of the visible sun disc.',
    group: 'sun',
    label: 'Sun Disc Size',
    range: Object.freeze({ max: 0.16, min: 0, step: 0.001 }),
    type: 'number',
    value: 0.026,
  }),
  sunDiscSoftness: Object.freeze({
    description: 'Fraction of the sun radius used for its anti-aliased edge.',
    group: 'sun',
    label: 'Sun Edge Softness',
    range: Object.freeze({ max: 1, min: 0.01, step: 0.01 }),
    type: 'number',
    value: 0.28,
  }),
  sunDiscIntensity: Object.freeze({
    description: 'Brightness of the visible sun disc. The current time controls visibility, not this value.',
    group: 'sun',
    label: 'Sun Disc Intensity',
    range: Object.freeze({ max: 8, min: 0, step: 0.05 }),
    type: 'number',
    value: 1.8,
  }),
  sunGlowColor: Object.freeze({
    description: 'Tint of the broad and core sun glow.',
    group: 'sun',
    label: 'Sun Glow Color',
    type: 'color',
    value: Object.freeze([1, 0.82, 0.62]),
  }),
  sunGlowStrength: Object.freeze({
    description: 'Master intensity of the sun glow.',
    group: 'sun',
    label: 'Sun Glow Strength',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.45,
  }),
  sunGlowSpread: Object.freeze({
    description: 'Falloff power of the broad sun halo. Lower values make a wider glow.',
    group: 'sun',
    label: 'Sun Glow Spread',
    range: Object.freeze({ max: 24, min: 1, step: 0.1 }),
    type: 'number',
    value: 5,
  }),
  sunGlowCoreStrength: Object.freeze({
    description: 'Relative strength of the tight inner sun halo.',
    group: 'sun',
    label: 'Sun Core Glow',
    range: Object.freeze({ max: 2, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.45,
  }),
  sunGlowCoreSharpness: Object.freeze({
    description: 'Falloff power of the tight inner sun halo.',
    group: 'sun',
    label: 'Sun Core Sharpness',
    range: Object.freeze({ max: 200, min: 5, step: 1 }),
    type: 'number',
    value: 64,
  }),
  moonColor: Object.freeze({
    description: 'Tint of the visible moon disc.',
    group: 'moon',
    label: 'Moon Disc Color',
    type: 'color',
    value: Object.freeze([0.76, 0.86, 1]),
  }),
  moonDiscSize: Object.freeze({
    description: 'Angular radius of the visible moon disc.',
    group: 'moon',
    label: 'Moon Disc Size',
    range: Object.freeze({ max: 0.16, min: 0, step: 0.001 }),
    type: 'number',
    value: 0.022,
  }),
  moonDiscSoftness: Object.freeze({
    description: 'Fraction of the moon radius used for its anti-aliased edge.',
    group: 'moon',
    label: 'Moon Edge Softness',
    range: Object.freeze({ max: 1, min: 0.01, step: 0.01 }),
    type: 'number',
    value: 0.32,
  }),
  moonDiscIntensity: Object.freeze({
    description: 'Brightness of the visible moon disc. The current time controls visibility, not this value.',
    group: 'moon',
    label: 'Moon Disc Intensity',
    range: Object.freeze({ max: 8, min: 0, step: 0.05 }),
    type: 'number',
    value: 1.25,
  }),
  moonGlowColor: Object.freeze({
    description: 'Tint of the moon halo.',
    group: 'moon',
    label: 'Moon Glow Color',
    type: 'color',
    value: Object.freeze([0.45, 0.62, 1]),
  }),
  moonGlowStrength: Object.freeze({
    description: 'Intensity of the moon halo.',
    group: 'moon',
    label: 'Moon Glow Strength',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.32,
  }),
  moonGlowSpread: Object.freeze({
    description: 'Falloff power of the moon halo. Lower values make a wider glow.',
    group: 'moon',
    label: 'Moon Glow Spread',
    range: Object.freeze({ max: 24, min: 1, step: 0.1 }),
    type: 'number',
    value: 7,
  }),
  starsColor: Object.freeze({
    description: 'Tint of the procedural night-sky star glints.',
    group: 'stars',
    label: 'Stars Color',
    type: 'color',
    value: Object.freeze([0.82, 0.9, 1]),
  }),
  starsStrength: Object.freeze({
    description: 'Maximum night-time brightness of the star field. Day/night visibility comes from the runtime clock.',
    group: 'stars',
    label: 'Stars Strength',
    range: Object.freeze({ max: 3, min: 0, step: 0.01 }),
    type: 'number',
    value: 1,
  }),
  starsSeed: Object.freeze({
    description: 'Offsets the deterministic star pattern without changing density or size.',
    group: 'stars',
    integer: true,
    label: 'Stars Pattern Seed',
    range: Object.freeze({ max: 1000, min: 0, step: 1 }),
    type: 'number',
    value: 173,
  }),
  starsDensity: Object.freeze({
    description: 'Fraction of candidate cells allowed to contain a visible star.',
    group: 'stars',
    label: 'Stars Density',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.34,
  }),
  starsScale: Object.freeze({
    description: 'Scale of the projected star grid. Higher values create more, smaller cells.',
    group: 'stars',
    label: 'Stars Scale',
    range: Object.freeze({ max: 64, min: 2, step: 0.5 }),
    type: 'number',
    value: 18,
  }),
  starsSize: Object.freeze({
    description: 'Size of each procedural star glint inside its cell.',
    group: 'stars',
    label: 'Stars Size',
    range: Object.freeze({ max: 0.2, min: 0.005, step: 0.005 }),
    type: 'number',
    value: 0.045,
  }),
  starsTwinkleStrength: Object.freeze({
    description: 'Depth of per-star brightness animation. 0 disables twinkle.',
    group: 'stars',
    label: 'Twinkle Strength',
    range: Object.freeze({ max: 1, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.35,
  }),
  starsTwinkleSpeed: Object.freeze({
    description: 'Speed multiplier of seeded star twinkle.',
    group: 'stars',
    label: 'Twinkle Speed',
    range: Object.freeze({ max: 4, min: 0, step: 0.01 }),
    type: 'number',
    value: 0.8,
  }),
  starsHorizonFade: Object.freeze({
    description: 'Altitude at which the star field reaches full brightness above the horizon.',
    group: 'stars',
    label: 'Stars Horizon Fade',
    range: Object.freeze({ max: 1, min: 0.04, step: 0.01 }),
    type: 'number',
    value: 0.2,
  }),
});

const GROUP_KEYS = Object.freeze({
  gradient: Object.freeze([
    'atlasBrightness',
    'atlasSaturation',
    'atlasContrast',
    'atlasSampleOffset',
    'atlasSampleScale',
    'skyTint',
    'zenithTint',
    'horizonTint',
    'belowHorizonTint',
    'horizonPosition',
    'horizonBlend',
    'horizonGlowColor',
    'horizonGlowStrength',
    'horizonGlowWidth',
    'horizonGlowFocus',
  ]),
  sun: Object.freeze([
    'sunColor',
    'sunDiscSize',
    'sunDiscSoftness',
    'sunDiscIntensity',
    'sunGlowColor',
    'sunGlowStrength',
    'sunGlowSpread',
    'sunGlowCoreStrength',
    'sunGlowCoreSharpness',
  ]),
  moon: Object.freeze([
    'moonColor',
    'moonDiscSize',
    'moonDiscSoftness',
    'moonDiscIntensity',
    'moonGlowColor',
    'moonGlowStrength',
    'moonGlowSpread',
  ]),
  stars: Object.freeze([
    'starsColor',
    'starsStrength',
    'starsSeed',
    'starsDensity',
    'starsScale',
    'starsSize',
    'starsTwinkleStrength',
    'starsTwinkleSpeed',
    'starsHorizonFade',
  ]),
});

export const SKY_SHADER_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Anime color-curve sampling, grading, region tints, and visible horizon treatment.',
    id: 'gradient',
    label: 'Gradient',
  }),
  Object.freeze({
    description: 'Appearance of the visible sun disc and halo. Direction and visibility come from time of day.',
    id: 'sun',
    label: 'Sun',
  }),
  Object.freeze({
    description: 'Appearance of the visible moon disc and halo. Direction and visibility come from time of day.',
    id: 'moon',
    label: 'Moon',
  }),
  Object.freeze({
    description: 'Procedural star-field appearance. The runtime clock controls day/night visibility.',
    id: 'stars',
    label: 'Stars',
  }),
]);

export const SKY_SHADER_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  SKY_SHADER_SETTING_GROUPS.map((group) => [
    group.id,
    Object.freeze(Object.fromEntries(GROUP_KEYS[group.id].map((key) => {
      const definition = DEFINITIONS[key];
      return [key, Object.freeze({
        defaultValue: definition.value,
        description: definition.description,
        group: group.id,
        id: `${group.id}.${key}`,
        integer: definition.integer ?? false,
        key,
        label: definition.label,
        ...(definition.range ? { range: definition.range } : {}),
        serializable: true,
        type: definition.type,
      })];
    }))),
  ]),
));

export const SKY_SHADER_FIELD_COUNT = Object.keys(DEFINITIONS).length;

const SKY_SHADER_KEYS = Object.freeze(Object.values(GROUP_KEYS).flat());
const SKY_SHADER_KEY_SET = new Set(SKY_SHADER_KEYS);
const presetRegistry = new Map();

function clone(value) {
  return Array.isArray(value) ? [...value] : value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

function normalizeField(key, value, fallback) {
  const definition = DEFINITIONS[key];
  if (definition.type === 'color') {
    if (!Array.isArray(value)
      || value.length < 3
      || !value.slice(0, 3).every((channel) => Number.isFinite(Number(channel)))) {
      return clone(fallback);
    }
    return value.slice(0, 3).map((channel) =>
      Math.min(Math.max(Number(channel), 0), 1));
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return clone(fallback);
  const normalized = Math.min(
    Math.max(number, definition.range.min),
    definition.range.max,
  );
  return definition.integer ? Math.round(normalized) : normalized;
}

function pickSettings(input = {}) {
  const source = isObject(input) ? input : {};
  return Object.fromEntries(
    SKY_SHADER_KEYS
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, clone(source[key])]),
  );
}

export const DEFAULT_SKY_SHADER_SETTINGS = Object.freeze(Object.fromEntries(
  SKY_SHADER_KEYS.map((key) => [
    key,
    Array.isArray(DEFINITIONS[key].value)
      ? Object.freeze([...DEFINITIONS[key].value])
      : DEFINITIONS[key].value,
  ]),
));

export const CALL_ME_SENSEI_SKY_SHADER_SETTINGS = Object.freeze({
  ...DEFAULT_SKY_SHADER_SETTINGS,
  atlasContrast: 1.04,
  atlasSaturation: 1.2,
  belowHorizonTint: Object.freeze([0.3, 0.65, 0.84]),
  horizonGlowStrength: 0.24,
  horizonTint: Object.freeze([0.46, 0.78, 0.94]),
  skyTint: Object.freeze([0.7, 0.9, 1]),
  starsStrength: 0.86,
  sunGlowStrength: 0.52,
  zenithTint: Object.freeze([0.045, 0.29, 0.7]),
});

export function createSkyShaderSettings(options = {}) {
  const source = typeof options === 'string'
    ? { preset: options }
    : (isObject(options) ? options : {});
  const presetId = normalizeId(source.preset) || DEFAULT_SKY_SHADER_PRESET;
  const preset = presetRegistry.get(presetId)
    ?? presetRegistry.get(DEFAULT_SKY_SHADER_PRESET);
  const input = isObject(source.settings) ? source.settings : source;
  return Object.fromEntries(SKY_SHADER_KEYS.map((key) => {
    const fallback = preset?.settings?.[key] ?? DEFAULT_SKY_SHADER_SETTINGS[key];
    return [key, normalizeField(key, input[key], fallback)];
  }));
}

function canonicalDocument(id, definition = {}) {
  const source = isObject(definition) ? definition : {};
  const presetId = normalizeId(source.preset) || DEFAULT_SKY_SHADER_PRESET;
  const preset = presetRegistry.get(presetId)
    ?? presetRegistry.get(DEFAULT_SKY_SHADER_PRESET);
  return {
    atmosphere: createSkyAtmosphereSettings(source.atmosphere ?? preset?.atmosphere),
    description: String(source.description ?? ''),
    id: normalizeId(id ?? source.id),
    label: String(source.label ?? source.title ?? id ?? source.id ?? '').trim(),
    settings: createSkyShaderSettings({
      preset: source.preset ?? DEFAULT_SKY_SHADER_PRESET,
      settings: source.settings ?? pickSettings(source),
    }),
    timeKeyframes: createSkyTimeKeyframes(source.timeKeyframes ?? preset?.timeKeyframes),
    type: SKY_SHADER_DOCUMENT_TYPE,
    version: SKY_SHADER_SCHEMA_VERSION,
  };
}

export function validateSkyShaderPresetDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid Sky Shader JSON: ${error.message}`],
        ok: false,
        value: null,
        warnings: [],
      };
    }
  }
  if (!isObject(source)) {
    return {
      errors: ['Sky Shader preset must be a JSON object.'],
      ok: false,
      value: null,
      warnings: [],
    };
  }
  const errors = [];
  const warnings = [];
  if (source.type !== SKY_SHADER_DOCUMENT_TYPE) {
    errors.push(`Sky Shader preset type must be "${SKY_SHADER_DOCUMENT_TYPE}".`);
  }
  const version = Number(
    source.version ?? source.schemaVersion ?? SKY_SHADER_SCHEMA_VERSION,
  );
  if (!Number.isFinite(version)) errors.push('Sky Shader version must be a number.');
  else if (version > SKY_SHADER_SCHEMA_VERSION) {
    errors.push(
      `Sky Shader version ${version} is newer than supported version ${SKY_SHADER_SCHEMA_VERSION}.`,
    );
  }
  if (version < SKY_SHADER_SCHEMA_VERSION) {
    warnings.push(
      `Sky Shader version ${version} was migrated to version ${SKY_SHADER_SCHEMA_VERSION} with the default atmosphere and time curve.`,
    );
  }
  if (!normalizeId(source.id)) errors.push('Sky Shader preset id is required.');
  if (source.timeKeyframes !== undefined) {
    if (!Array.isArray(source.timeKeyframes)) {
      errors.push('Sky Shader timeKeyframes must be an array.');
    } else {
      const uniqueHours = new Set(source.timeKeyframes.map((entry) =>
        Number(entry?.hour)).filter(Number.isFinite).map((hour) =>
        (((hour % 24) + 24) % 24).toFixed(6)));
      if (uniqueHours.size < 2) {
        errors.push('Sky Shader timeKeyframes must contain at least two unique hours.');
      }
    }
  }
  for (const key of Object.keys(isObject(source.settings) ? source.settings : {})) {
    if (!SKY_SHADER_KEY_SET.has(key)) {
      warnings.push(`Unknown Sky Shader setting "${key}" was ignored.`);
    }
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? canonicalDocument(source.id, source) : null,
    warnings,
  };
}

export const parseSkyShaderPresetDocument = validateSkyShaderPresetDocument;

export function createSkyShaderPresetDocument(id, definition = {}) {
  const document = canonicalDocument(id, definition);
  const result = validateSkyShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeSkyShaderPreset(
  idOrDocument,
  definition = {},
  { pretty = true } = {},
) {
  const document = isObject(idOrDocument)
    && idOrDocument.type === SKY_SHADER_DOCUMENT_TYPE
    ? createSkyShaderPresetDocument(idOrDocument.id, idOrDocument)
    : createSkyShaderPresetDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export function registerSkyShaderPreset(
  id,
  definition = {},
  { overwrite = false } = {},
) {
  const document = createSkyShaderPresetDocument(id, definition);
  if (overwrite && isProtectedSystemStyleId(document.id) && presetRegistry.has(document.id)) {
    throw new Error(`System style "${document.id}" is read-only.`);
  }
  if (!overwrite && presetRegistry.has(document.id)) {
    throw new Error(`Sky Shader preset "${document.id}" already exists.`);
  }
  presetRegistry.set(document.id, document);
  return {
    description: document.description,
    id: document.id,
    label: document.label,
    value: document.id,
  };
}

export function registerSerializedSkyShaderPreset(input, options = {}) {
  const result = parseSkyShaderPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerSkyShaderPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

export function getSkyShaderPresetOptions() {
  return Array.from(presetRegistry.values()).map((document) => ({
    description: document.description,
    id: document.id,
    label: document.label,
    value: document.id,
  }));
}

export function applySkyShaderSettings(target, options = {}) {
  const source = isObject(options) ? options : {};
  const settings = createSkyShaderSettings(
    source.type === SKY_SHADER_DOCUMENT_TYPE ? source.settings : options,
  );
  if (typeof target?.applySkyShaderProfile === 'function') {
    const profile = source.type === SKY_SHADER_DOCUMENT_TYPE
      ? canonicalDocument(source.id || 'runtime', source)
      : {
        atmosphere: createSkyAtmosphereSettings(source.atmosphere),
        settings,
        timeKeyframes: createSkyTimeKeyframes(source.timeKeyframes),
      };
    target.applySkyShaderProfile(profile);
    return profile;
  }
  if (typeof target?.applySkyShaderSettings !== 'function') {
    throw new Error(
      'Sky Shader target must expose applySkyShaderSettings(settings).',
    );
  }
  target.applySkyShaderSettings(settings);
  return settings;
}

registerSkyShaderPreset('default', {
  description: 'Neutral authored sky-dome color-curve treatment.',
  label: 'Default',
  atmosphere: DEFAULT_SKY_ATMOSPHERE,
  settings: DEFAULT_SKY_SHADER_SETTINGS,
  timeKeyframes: DEFAULT_SKY_TIME_KEYFRAMES,
});

registerSkyShaderPreset('call_me_sensei', {
  description: 'The Call Me Sensei house sky: a Genshin-inspired open-world treatment with a saturated cyan-blue zenith, luminous horizon, lifted aerial perspective, and graphic celestial accents.',
  label: 'Call Me Sensei',
  atmosphere: CALL_ME_SENSEI_SKY_ATMOSPHERE,
  settings: CALL_ME_SENSEI_SKY_SHADER_SETTINGS,
  timeKeyframes: CALL_ME_SENSEI_SKY_TIME_KEYFRAMES,
});
