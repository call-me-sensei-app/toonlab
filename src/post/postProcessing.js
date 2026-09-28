import * as THREE from 'three';

import { createSceneDepthColorPass } from '../shaders-tsl/chunks/scene-depth-color-pass.js';
import {
  createBloomDownsampleNodeMaterial,
  createBloomPrefilterNodeMaterial,
  createBloomUpsampleNodeMaterial,
  createPostCompositeNodeMaterial,
  fallbackPostTexture,
} from '../shaders-tsl/post-composite.js';
import {
  createSettingsPresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';

export const DEFAULT_POST_PROCESSING_FEATURES = Object.freeze({
  // Two-layer stylized atmosphere: distance/height mix fog + additive
  // sun/moon glow fog. Colors come from the shared environment state.
  atmosphere: false,
  bloom: false,
  colorGrade: false,
  depthCue: false,
  enabled: false,
  // Camera-reprojection motion blur (reconstructs velocity from the depth
  // buffer and the previous frame's view-projection). Blurs camera movement
  // only — per-bone character motion has no velocity buffer in three.js.
  motionBlur: false,
  screenOutline: false,
  vignette: false,
  verticalGrade: false,
});

export const DEFAULT_POST_PROCESSING_PARAMETERS = Object.freeze({
  // Character-aware bloom: with a character mask connected (see
  // characterRenderPasses), bloom gathered from character pixels is scaled by
  // bloomCharacterBoost and everything else by bloomBackgroundSuppress.
  // Defaults of 1/1 reproduce plain bloom.
  bloomBackgroundSuppress: 1.0,
  bloomCharacterBoost: 1.0,
  // Saturation of bloom gathered from character pixels. Bloom is additive and
  // pushes skin toward white; above 1 it keeps the glow the character's own
  // hue (warm skin glows warm). 1 = unchanged.
  bloomCharacterSaturation: 1.0,
  // 'single' = the original one-pass 9-tap bloom. 'pyramid' = multi-pass
  // dual-filter mip chain: wider, softer glow for roughly the same cost at
  // high radii, at the price of extra render targets.
  bloomLevels: 5,
  bloomMode: 'single',
  bloomRadius: 0.16,
  bloomStrength: 0.0,
  bloomThreshold: 0.995,
  bottomDark: 0.0,
  atmosphereBaseHeight: 0.0,
  atmosphereFar: 900.0,
  atmosphereGlowStrength: 1.0,
  atmosphereHeightFalloff: 0.012,
  atmosphereNear: 60.0,
  atmosphereStrength: 0.55,
  contrast: 1.0,
  depthCueColor: new THREE.Color(0x9db7d8),
  depthCueFar: 24.0,
  depthCueNear: 1.0,
  depthCueStrength: 0.0,
  exposure: 1.0,
  // Optional 2D-strip color LUT (horizontal slices, height = slice size, e.g.
  // a 1024x32 strip). Runtime texture object — not serializable to JSON.
  lutMap: null,
  lutSize: 0, // 0 = derive from lutMap.image.height
  lutStrength: 0.0,
  motionBlurStrength: 0.55,
  outlineColor: new THREE.Color(0x10131a),
  outlineDepthStrength: 0.16,
  outlineLumaStrength: 0.04,
  outlineStrength: 0.0,
  saturation: 1.0,
  strength: 1.0,
  topLight: 0.0,
  vignetteRadius: 0.55,
  vignetteSoftness: 0.34,
  vignetteStrength: 0.0,
  warmth: 0.0,
});

export const POST_PROCESSING_PRESETS = Object.freeze({
  off: {
    features: {
      ...DEFAULT_POST_PROCESSING_FEATURES,
    },
    parameters: {
      strength: 0.0,
    },
  },
  custom: {
    features: {
      ...DEFAULT_POST_PROCESSING_FEATURES,
    },
  },
  softAnime: {
    features: {
      bloom: false,
      colorGrade: false,
      enabled: true,
      vignette: true,
      verticalGrade: false,
    },
    parameters: {
      bloomRadius: 0.08,
      bloomStrength: 0.0,
      bloomThreshold: 0.992,
      bottomDark: 0.0,
      contrast: 1.0,
      exposure: 1.0,
      saturation: 1.0,
      strength: 0.45,
      topLight: 0.0,
      vignetteStrength: 0.018,
      warmth: 0.0,
    },
  },
  // Studio-managed signature grade, curated by Call Me Sensei and updated
  // over releases. Currently equal to the softAnime grade.
  call_me_sensei: {
    features: {
      bloom: false,
      colorGrade: false,
      enabled: true,
      vignette: true,
      verticalGrade: false,
    },
    parameters: {
      bloomRadius: 0.08,
      bloomStrength: 0.0,
      bloomThreshold: 0.992,
      bottomDark: 0.0,
      contrast: 1.0,
      exposure: 1.0,
      saturation: 1.0,
      strength: 0.45,
      topLight: 0.0,
      vignetteStrength: 0.018,
      warmth: 0.0,
    },
  },
  debugEdges: {
    features: {
      depthCue: true,
      enabled: true,
      screenOutline: true,
    },
    parameters: {
      depthCueStrength: 0.08,
      outlineDepthStrength: 0.85,
      outlineLumaStrength: 0.55,
      outlineStrength: 1.0,
      strength: 1.0,
    },
  },
  showcase: {
    features: {
      bloom: true,
      enabled: true,
      motionBlur: true,
      vignette: true,
    },
    parameters: {
      bloomCharacterBoost: 1.6,
      bloomCharacterSaturation: 1.4,
      bloomLevels: 5,
      bloomMode: 'pyramid',
      bloomRadius: 0.5,
      bloomStrength: 0.3,
      bloomThreshold: 0.85,
      motionBlurStrength: 0.55,
      strength: 1.0,
      vignetteStrength: 0.018,
    },
  },
});

function cleanObject(value) {
  return value && typeof value === 'object' ? value : {};
}

// ---------------------------------------------------------------------------
// Settings schema metadata, preset registry, and preset documents. Mirrors
// the pattern in src/toon/toonSettings.js so the schema-driven debug panel
// and serialized preset documents work for post-processing too. Everything in
// this section is additive; the pipeline code further down is unchanged.
// ---------------------------------------------------------------------------

/**
 * Document `type` string written into serialized post-processing presets.
 * @type {string}
 */
export const POST_PROCESSING_PRESET_DOCUMENT_TYPE = 'toonlab/post-processing-preset';

/**
 * Current schema version written into post-processing preset documents.
 * @type {number}
 */
export const POST_PROCESSING_PRESET_SCHEMA_VERSION = 1;

/**
 * Setting groups for the schema-driven settings panel. Same entry shape as
 * `TOON_SETTING_GROUPS`: `{ id, label, description }`.
 * @type {ReadonlyArray<{description: string, id: string, label: string}>}
 */
export const POST_PROCESSING_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Toggles for each optional screen-space effect in the final composite pass.',
    id: 'features',
    label: 'Features',
  }),
  Object.freeze({
    description: 'Tuning values used by the post-processing effects when their feature toggles are on.',
    id: 'parameters',
    label: 'Parameters',
  }),
]);

const POST_PROCESSING_SETTING_GROUP_METADATA = Object.freeze(
  Object.fromEntries(POST_PROCESSING_SETTING_GROUPS.map((group) => [group.id, group])),
);

const POST_PROCESSING_SETTING_DEFAULTS = Object.freeze({
  features: DEFAULT_POST_PROCESSING_FEATURES,
  parameters: DEFAULT_POST_PROCESSING_PARAMETERS,
});

// Hand-written labels, descriptions, ranges, and select options per field.
// Types are derived from the default values; ranges reflect how each uniform
// is actually used in the composite shader / bloom chain below.
const POST_PROCESSING_FIELD_DEFINITIONS = Object.freeze({
  features: Object.freeze({
    bloom: {
      description: 'Adds glow around pixels brighter than the bloom threshold.',
      label: 'Bloom',
    },
    colorGrade: {
      description: 'Applies exposure, contrast, saturation, and warmth grading.',
      label: 'Color Grade',
    },
    atmosphere: {
      description: 'Two-layer stylized atmosphere: distance/height mix fog plus an additive sun/moon glow halo, colored by the scene environment state.',
      label: 'Atmosphere',
    },
    depthCue: {
      description: 'Fades distant pixels toward the depth cue color for atmospheric depth.',
      label: 'Depth Cue',
    },
    enabled: {
      description: 'Forces the post-processing composite pass on, even with no individual effect active.',
      label: 'Enabled',
    },
    motionBlur: {
      description: 'Blurs camera movement by reprojecting the previous frame (camera motion only).',
      label: 'Motion Blur',
    },
    screenOutline: {
      description: 'Draws screen-space outlines from depth and luminance edges.',
      label: 'Screen Outline',
    },
    verticalGrade: {
      description: 'Adds warm light at the top of the frame and darkening at the bottom.',
      label: 'Vertical Grade',
    },
    vignette: {
      description: 'Darkens the frame toward the corners.',
      label: 'Vignette',
    },
  }),
  parameters: Object.freeze({
    bloomBackgroundSuppress: {
      description: 'Scales bloom gathered from non-character pixels when a character mask is connected.',
      label: 'Bloom Background Suppress',
      range: { max: 2, min: 0, step: 0.01 },
    },
    bloomCharacterBoost: {
      description: 'Scales bloom gathered from character pixels when a character mask is connected.',
      label: 'Bloom Character Boost',
      range: { max: 4, min: 0, step: 0.05 },
    },
    bloomCharacterSaturation: {
      description: 'Scales the saturation of bloom gathered from character pixels when a character mask is connected.',
      label: 'Bloom Character Saturation',
      range: { max: 3, min: 0, step: 0.05 },
    },
    bloomLevels: {
      description: 'Number of mip levels in the pyramid bloom chain (pyramid mode only).',
      label: 'Bloom Levels',
      range: { max: 8, min: 2, step: 1 },
    },
    bloomMode: {
      description: 'Selects the one-pass 9-tap bloom or the wider multi-pass pyramid bloom.',
      label: 'Bloom Mode',
      optionLabels: { pyramid: 'Pyramid (Mip Chain)', single: 'Single Pass' },
      options: ['single', 'pyramid'],
    },
    bloomRadius: {
      description: 'Controls how far the bloom glow spreads from bright pixels.',
      label: 'Bloom Radius',
      range: { max: 1, min: 0, step: 0.01 },
    },
    bloomStrength: {
      description: 'Controls how strongly bloom is added to the image.',
      label: 'Bloom Strength',
      range: { max: 2, min: 0, step: 0.01 },
    },
    bloomThreshold: {
      description: 'Sets the luminance above which pixels start to bloom.',
      label: 'Bloom Threshold',
      range: { max: 1, min: 0, step: 0.001 },
    },
    bottomDark: {
      description: 'Darkens the lower part of the frame in the vertical grade.',
      label: 'Bottom Dark',
      range: { max: 1, min: 0, step: 0.01 },
    },
    contrast: {
      description: 'Scales contrast around mid gray in the color grade.',
      label: 'Contrast',
      range: { max: 2, min: 0, step: 0.01 },
    },
    atmosphereBaseHeight: {
      description: 'World height where atmosphere fog is densest; fog thins above it.',
      label: 'Atmosphere Base Height',
      range: { max: 500, min: -100, step: 1 },
    },
    atmosphereFar: {
      description: 'View distance in meters where atmosphere fog reaches full strength.',
      label: 'Atmosphere Far',
      range: { max: 4000, min: 10, step: 10 },
    },
    atmosphereGlowStrength: {
      description: 'Multiplier on the environment-state sun/moon glow fog.',
      label: 'Atmosphere Glow',
      range: { max: 3, min: 0, step: 0.05 },
    },
    atmosphereHeightFalloff: {
      description: 'How quickly atmosphere fog thins with altitude above the base height.',
      label: 'Atmosphere Height Falloff',
      range: { max: 0.2, min: 0, step: 0.001 },
    },
    atmosphereNear: {
      description: 'View distance in meters where atmosphere fog starts.',
      label: 'Atmosphere Near',
      range: { max: 1000, min: 0, step: 5 },
    },
    atmosphereStrength: {
      description: 'Maximum blend of the atmospheric mix fog.',
      label: 'Atmosphere Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    depthCueColor: {
      description: 'Sets the color distant pixels fade toward.',
      label: 'Depth Cue Color',
    },
    depthCueFar: {
      description: 'Sets the depth at which the depth cue reaches full strength.',
      label: 'Depth Cue Far',
      range: { max: 200, min: 0, step: 0.5 },
    },
    depthCueNear: {
      description: 'Sets the depth at which the depth cue starts to appear.',
      label: 'Depth Cue Near',
      range: { max: 50, min: 0, step: 0.1 },
    },
    depthCueStrength: {
      description: 'Controls how strongly distant pixels blend toward the depth cue color.',
      label: 'Depth Cue Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    exposure: {
      description: 'Multiplies overall image brightness in the color grade.',
      label: 'Exposure',
      range: { max: 4, min: 0, step: 0.01 },
    },
    lutMap: {
      description: 'Optional 2D-strip color LUT texture (runtime only, not serialized).',
      label: 'LUT Map',
    },
    lutSize: {
      description: 'Slice size of the LUT strip; 0 derives it from the texture height.',
      label: 'LUT Size',
      range: { max: 64, min: 0, step: 1 },
    },
    lutStrength: {
      description: 'Controls how strongly the LUT recolors the graded image.',
      label: 'LUT Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    motionBlurStrength: {
      description: 'Scales the camera-reprojection blur distance along the motion vector.',
      label: 'Motion Blur Strength',
      range: { max: 2, min: 0, step: 0.01 },
    },
    outlineColor: {
      description: 'Sets the color drawn on detected screen-space edges.',
      label: 'Outline Color',
    },
    outlineDepthStrength: {
      description: 'Controls how strongly depth discontinuities contribute to outlines.',
      label: 'Outline Depth Strength',
      range: { max: 2, min: 0, step: 0.01 },
    },
    outlineLumaStrength: {
      description: 'Controls how strongly luminance edges contribute to outlines.',
      label: 'Outline Luma Strength',
      range: { max: 2, min: 0, step: 0.01 },
    },
    outlineStrength: {
      description: 'Controls the overall opacity of screen-space outlines.',
      label: 'Outline Strength',
      range: { max: 2, min: 0, step: 0.01 },
    },
    saturation: {
      description: 'Scales color saturation in the color grade.',
      label: 'Saturation',
      range: { max: 2, min: 0, step: 0.01 },
    },
    strength: {
      description: 'Blends between the raw render and the full post-processing result.',
      label: 'Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    topLight: {
      description: 'Adds warm light to the upper part of the frame in the vertical grade.',
      label: 'Top Light',
      range: { max: 1, min: 0, step: 0.01 },
    },
    vignetteRadius: {
      description: 'Sets the distance from the frame center where the vignette starts.',
      label: 'Vignette Radius',
      range: { max: 1, min: 0, step: 0.01 },
    },
    vignetteSoftness: {
      description: 'Controls the falloff width of the vignette edge.',
      label: 'Vignette Softness',
      range: { max: 1, min: 0, step: 0.01 },
    },
    vignetteStrength: {
      description: 'Controls how strongly the vignette darkens the frame edges.',
      label: 'Vignette Strength',
      range: { max: 1, min: 0, step: 0.01 },
    },
    warmth: {
      description: 'Shifts the color grade warmer (positive) or cooler (negative).',
      label: 'Warmth',
      range: { max: 1, min: -1, step: 0.01 },
    },
  }),
});

function labelFromPostProcessingKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function postProcessingFieldTypeFor(definition, value) {
  if (definition.options) return 'select';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (value?.isColor) return 'color';
  if (value === null) return 'texture';
  return 'text';
}

function serializablePostProcessingValue(value) {
  if (value?.isColor) return [value.r, value.g, value.b];
  return value;
}

function createPostProcessingFieldMetadata(group, key, value) {
  const definition = POST_PROCESSING_FIELD_DEFINITIONS[group.id]?.[key] ?? {};
  const type = postProcessingFieldTypeFor(definition, value);
  return Object.freeze({
    defaultValue: serializablePostProcessingValue(value),
    description: definition.description ?? `Configures ${labelFromPostProcessingKey(key).toLowerCase()} for ${group.label.toLowerCase()}.`,
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: definition.label ?? labelFromPostProcessingKey(key),
    optionLabels: definition.optionLabels ? Object.freeze(definition.optionLabels) : null,
    options: definition.options ? Object.freeze(definition.options) : null,
    range: type === 'number' ? Object.freeze(definition.range ?? { max: 1, min: 0, step: 0.01 }) : null,
    serializable: type !== 'texture',
    type,
  });
}

/**
 * Field metadata for every post-processing feature and parameter, keyed by
 * group id and then field key. Same field shape as
 * `TOON_SETTING_FIELD_SCHEMA` (`id`, `group`, `key`, `label`, `description`,
 * `type`, `range`, `options`, `optionLabels`, `defaultValue`,
 * `serializable`), consumable by the schema-driven debug settings panel.
 * @type {Readonly<Record<string, Readonly<Record<string, object>>>>}
 */
export const POST_PROCESSING_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    POST_PROCESSING_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(POST_PROCESSING_SETTING_DEFAULTS[group.id] ?? {})
            .map(([key, value]) => [key, createPostProcessingFieldMetadata(group, key, value)]),
        ),
      ),
    ]),
  ),
);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberFromValue(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanFromValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  if (Number.isFinite(value)) return value !== 0;
  return fallback;
}

function selectFromValue(value, fallback, options) {
  if (!options?.length) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  const match = options.find((option) => String(option).toLowerCase() === normalized);
  if (match !== undefined) return match;
  return fallback;
}

function colorArrayFromValue(value, fallback) {
  const fallbackColor = new THREE.Color(fallback?.[0] ?? 1, fallback?.[1] ?? 1, fallback?.[2] ?? 1);
  const color = colorFromParameter(value, fallbackColor);
  return [color.r, color.g, color.b];
}

function coercePostProcessingFieldValue(value, field) {
  switch (field.type) {
    case 'boolean':
      return booleanFromValue(value, field.defaultValue);
    case 'number':
      return numberFromValue(value, field.defaultValue);
    case 'select':
      return selectFromValue(value, field.defaultValue, field.options);
    case 'color':
      return colorArrayFromValue(value, field.defaultValue);
    default:
      return value;
  }
}

/**
 * Reduces a `{ features, parameters }` settings object to serializable,
 * schema-known values: booleans/numbers are coerced, select values are
 * matched against their options, colors become `[r, g, b]` arrays, and
 * runtime-only fields (like `lutMap`) plus unknown keys are dropped. Only
 * keys present in the input are kept, so partial presets stay partial.
 * @param {object} [settings] Raw `{ features, parameters }` input.
 * @returns {object} Sanitized settings safe for `JSON.stringify`.
 */
export function sanitizePostProcessingPresetSettings(settings = {}) {
  const source = cleanObject(settings);
  const sanitized = {};

  for (const group of POST_PROCESSING_SETTING_GROUPS) {
    const groupSource = cleanObject(source[group.id]);
    if (Object.keys(groupSource).length === 0) continue;

    const fields = POST_PROCESSING_SETTING_FIELD_SCHEMA[group.id] ?? {};
    const groupSettings = {};
    for (const [key, value] of Object.entries(groupSource)) {
      const field = fields[key];
      if (!field?.serializable) continue;
      groupSettings[key] = coercePostProcessingFieldValue(value, field);
    }

    if (Object.keys(groupSettings).length > 0) sanitized[group.id] = groupSettings;
  }

  return sanitized;
}

function collectUnknownPostProcessingSettingKeys(settings = {}) {
  const source = cleanObject(settings);
  const warnings = [];
  for (const [groupId, groupValue] of Object.entries(source)) {
    if (!(groupId in POST_PROCESSING_SETTING_GROUP_METADATA)) {
      warnings.push(`Unknown settings group "${groupId}" was ignored.`);
      continue;
    }
    const fields = POST_PROCESSING_SETTING_FIELD_SCHEMA[groupId] ?? {};
    for (const key of Object.keys(cleanObject(groupValue))) {
      if (!fields[key]) warnings.push(`Unknown setting "${groupId}.${key}" was ignored.`);
      else if (!fields[key].serializable) warnings.push(`Setting "${groupId}.${key}" is runtime-only and was ignored.`);
    }
  }
  return warnings;
}

function normalizePostProcessingPresetId(value) {
  return String(value ?? '').trim();
}

function migratePostProcessingPresetDocument(input) {
  const source = cleanObject(input);
  const version = Number.isFinite(source.version) ? Math.round(source.version) : 0;
  const settings = cleanObject(source.settings);

  if (version <= 1) {
    return {
      description: source.description ?? '',
      id: source.id ?? source.name ?? source.preset ?? '',
      label: source.label ?? source.title ?? source.name ?? source.id ?? '',
      settings: Object.keys(settings).length > 0
        ? settings
        : {
          ...(isPlainObject(source.features) ? { features: source.features } : {}),
          ...(isPlainObject(source.parameters) ? { parameters: source.parameters } : {}),
        },
      type: source.type ?? POST_PROCESSING_PRESET_DOCUMENT_TYPE,
      version: POST_PROCESSING_PRESET_SCHEMA_VERSION,
    };
  }

  return source;
}

/**
 * Validates (and migrates) a parsed post-processing preset document.
 * Mirrors `validateToonPresetDocument`: never throws, collects all problems.
 * @param {object} input Parsed JSON document (or document-like object).
 * @returns {{ok: boolean, errors: string[], warnings: string[], value: object|null}}
 *   `value` is the normalized document (`type`, `version`, `id`, `label`,
 *   `description`, sanitized `settings`) when `ok`, otherwise `null`.
 */
export function validatePostProcessingPresetDocument(input) {
  return validateSettingsPresetDocument(input, {
    collectWarnings: collectUnknownPostProcessingSettingKeys,
    documentType: POST_PROCESSING_PRESET_DOCUMENT_TYPE,
    migrateDocument: migratePostProcessingPresetDocument,
    normalizeId: normalizePostProcessingPresetId,
    sanitizeSettings: sanitizePostProcessingPresetSettings,
    schemaVersion: POST_PROCESSING_PRESET_SCHEMA_VERSION,
  });
}

/**
 * Builds a validated, serializable post-processing preset document. The
 * definition may carry `{ settings: { features, parameters } }` or top-level
 * `features` / `parameters`, plus optional `label` and `description`.
 * @param {string} id Preset id the document is stored under.
 * @param {object} [definition] Preset definition.
 * @returns {object} Normalized document (see `validatePostProcessingPresetDocument`).
 * @throws {Error} When validation fails (e.g. missing id).
 */
export function createPostProcessingPresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => (isPlainObject(source.settings)
      ? source.settings
      : {
        ...(isPlainObject(source.features) ? { features: source.features } : {}),
        ...(isPlainObject(source.parameters) ? { parameters: source.parameters } : {}),
      }),
    documentType: POST_PROCESSING_PRESET_DOCUMENT_TYPE,
    schemaVersion: POST_PROCESSING_PRESET_SCHEMA_VERSION,
    validateDocument: validatePostProcessingPresetDocument,
  });
}

const BUILT_IN_POST_PROCESSING_PRESET_METADATA = Object.freeze({
  call_me_sensei: Object.freeze({
    description: 'Studio-managed signature grade, curated by Call Me Sensei and updated over releases.',
    label: 'Call Me Sensei',
  }),
  custom: Object.freeze({
    description: 'Neutral starting point that expects host-supplied feature and parameter overrides.',
    label: 'Custom',
  }),
  debugEdges: Object.freeze({
    description: 'Depth cue plus strong screen outlines for inspecting edge detection.',
    label: 'Debug Edges',
  }),
  off: Object.freeze({
    description: 'Post-processing composite disabled; the scene renders directly.',
    label: 'Off',
  }),
  showcase: Object.freeze({
    description: 'Pyramid bloom, motion blur, and vignette turned on with demo values.',
    label: 'Showcase',
  }),
  softAnime: Object.freeze({
    description: 'Gentle vignette-led grade for soft anime framing.',
    label: 'Soft Anime',
  }),
});

const postProcessingPresetRegistry = new Map(
  Object.entries(POST_PROCESSING_PRESETS).map(([id, preset]) => [id, {
    description: BUILT_IN_POST_PROCESSING_PRESET_METADATA[id]?.description ?? '',
    features: preset.features,
    label: BUILT_IN_POST_PROCESSING_PRESET_METADATA[id]?.label ?? labelFromPostProcessingKey(id),
    parameters: preset.parameters,
  }]),
);

/**
 * Registers a post-processing preset so it can be used anywhere built-in
 * presets are (e.g. `createPostProcessingSettings({ preset: id })`). The
 * definition is validated and sanitized through the preset document pipeline.
 * @param {string} id Preset id (case-sensitive, like the built-in ids).
 * @param {object} [definition] Preset definition (see `createPostProcessingPresetDocument`).
 * @param {{overwrite?: boolean}} [options] Set `overwrite: true` to replace an existing preset.
 * @returns {{id: string, label: string, description: string}} Registered preset metadata.
 * @throws {Error} When validation fails or the id already exists without `overwrite`.
 */
export function registerPostProcessingPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createPostProcessingPresetDocument(id, definition);
  if (!overwrite && postProcessingPresetRegistry.has(document.id)) {
    throw new Error(`Post-processing preset "${document.id}" already exists.`);
  }

  postProcessingPresetRegistry.set(document.id, {
    description: document.description,
    features: document.settings.features ?? {},
    label: document.label,
    parameters: document.settings.parameters ?? {},
  });
  return {
    description: document.description,
    id: document.id,
    label: document.label,
  };
}

/**
 * Lists every known post-processing preset (built-in and registered) as
 * `{ id, label, description }` options for preset pickers.
 * @returns {Array<{id: string, label: string, description: string}>}
 */
export function getPostProcessingPresetOptions() {
  return Array.from(postProcessingPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description ?? '',
    id,
    label: preset.label ?? id,
  }));
}

function colorFromParameter(value, fallback) {
  if (value?.isColor) return value.clone();
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value.map(Number);
    if ([r, g, b].every(Number.isFinite)) return new THREE.Color(r, g, b);
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return new THREE.Color(value);
    } catch {
      return fallback.clone();
    }
  }
  if (value && typeof value === 'object') {
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    if ([r, g, b].every(Number.isFinite)) return new THREE.Color(r, g, b);
  }
  return fallback.clone();
}

function createMergedParameters(...parameterSets) {
  const merged = {
    ...DEFAULT_POST_PROCESSING_PARAMETERS,
  };

  for (const source of parameterSets) {
    Object.assign(merged, cleanObject(source));
  }

  merged.depthCueColor = colorFromParameter(
    merged.depthCueColor,
    DEFAULT_POST_PROCESSING_PARAMETERS.depthCueColor,
  );
  merged.outlineColor = colorFromParameter(
    merged.outlineColor,
    DEFAULT_POST_PROCESSING_PARAMETERS.outlineColor,
  );
  return merged;
}

export function createPostProcessingSettings(options = {}) {
  const source = cleanObject(options);
  const presetName = source.preset || 'off';
  const preset = postProcessingPresetRegistry.get(presetName) ??
    POST_PROCESSING_PRESETS[presetName] ??
    POST_PROCESSING_PRESETS.off;
  const features = {
    ...DEFAULT_POST_PROCESSING_FEATURES,
    ...cleanObject(preset.features),
    ...cleanObject(source.features),
  };

  return {
    features,
    parameters: createMergedParameters(preset.parameters, source.parameters),
    preset: presetName,
  };
}

export function isPostProcessingEnabled(settingsInput = {}) {
  const settings = createPostProcessingSettings(settingsInput);
  const { features } = settings;
  return Boolean(
    features.enabled ||
    features.bloom ||
    features.colorGrade ||
    features.depthCue ||
    features.motionBlur ||
    features.screenOutline ||
    features.vignette ||
    features.verticalGrade,
  );
}

function createPostRenderTarget(width, height) {
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
    // The canvas's MSAA does not apply to intermediate targets; without this
    // the post path silently loses antialiasing versus the raw render.
    samples: 4,
  });
  renderTarget.texture.name = 'PostProcessing.Color';
  renderTarget.texture.colorSpace = THREE.NoColorSpace;
  // Scene depth is read from the dedicated depth-color prepass, never from
  // this attachment; the forced-GL node backend rejects MSAA depth resolves.
  return renderTarget;
}

// Node shaders can't sample depth attachments as a plain float consistently
// across both builders, so a second override-material scene pass writes linear
// window depth into a float color target.
function createScenePostDepthTarget(width, height) {
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    stencilBuffer: false,
    type: THREE.FloatType,
  });
  renderTarget.texture.name = 'PostProcessing.SceneDepthColor';
  return renderTarget;
}

function needsScenePostDepth(settings) {
  const { features, parameters } = settings;
  return Boolean(
    features.atmosphere ||
    features.depthCue ||
    features.screenOutline ||
    (features.motionBlur && parameters.motionBlurStrength > 0),
  );
}

// ---------------------------------------------------------------------------
// Pyramid bloom (dual-filter mip chain): prefilter -> N downsamples -> N
// upsamples that accumulate each level back in. Wider, softer glow than the
// single-pass bloom, activated with parameters.bloomMode = 'pyramid'.
// ---------------------------------------------------------------------------

function createFinalCompositeMaterial() {
  return createPostCompositeNodeMaterial();
}

function applyCompositeSettings(material, settings, camera, depthTexture, width, height, pixelRatio) {
  if (!material) return;
  const { features, parameters } = settings;
  const uniforms = material.uniforms;
  uniforms.bloomBackgroundSuppress.value = parameters.bloomBackgroundSuppress;
  uniforms.bloomCharacterBoost.value = parameters.bloomCharacterBoost;
  uniforms.bloomCharacterSaturation.value = parameters.bloomCharacterSaturation;
  uniforms.bloomRadius.value = parameters.bloomRadius;
  uniforms.bloomStrength.value = features.bloom ? parameters.bloomStrength : 0.0;
  uniforms.bloomThreshold.value = parameters.bloomThreshold;
  uniforms.bottomDark.value = parameters.bottomDark;
  uniforms.cameraFar.value = camera.far;
  uniforms.cameraNear.value = camera.near;
  uniforms.contrast.value = parameters.contrast;
  uniforms.depthCueColor.value.copy(parameters.depthCueColor);
  uniforms.depthCueFar.value = parameters.depthCueFar;
  uniforms.depthCueNear.value = parameters.depthCueNear;
  uniforms.depthCueStrength.value = parameters.depthCueStrength;
  uniforms.exposure.value = parameters.exposure;
  const lutMap = parameters.lutMap?.isTexture ? parameters.lutMap : null;
  // Classic tolerates a `null` sampler uniform (it's only ever read behind an
  // `if (lutStrength > 0.0 && lutSize > 1.5)` guard that stays false whenever
  // lutMap is unset). The node backends bind every declared texture
  // regardless of runtime branching, so `null` is unsafe there even inside a
  // runtime-gated If() — fall back to the shared 1x1 placeholder instead.
  // Harmless on classic: lutSize stays 0 below, so tLut is still never
  // observably sampled.
  uniforms.tLut.value = lutMap || fallbackPostTexture();
  uniforms.lutSize.value = lutMap ? (parameters.lutSize || lutMap.image?.height || 0) : 0;
  uniforms.lutStrength.value = lutMap ? parameters.lutStrength : 0.0;
  uniforms.outlineColor.value.copy(parameters.outlineColor);
  uniforms.outlineDepthStrength.value = parameters.outlineDepthStrength;
  uniforms.outlineLumaStrength.value = parameters.outlineLumaStrength;
  uniforms.outlineStrength.value = parameters.outlineStrength;
  uniforms.resolution.value.set(width * pixelRatio, height * pixelRatio);
  uniforms.saturation.value = parameters.saturation;
  uniforms.strength.value = parameters.strength;
  uniforms.tDepth.value = depthTexture;
  uniforms.tDiffuse.value = material.userData.sourceTexture || fallbackPostTexture();
  uniforms.topLight.value = parameters.topLight;
  uniforms.useColorGrade.value = features.colorGrade ? 1.0 : 0.0;
  uniforms.useAtmosphere.value = features.atmosphere ? 1.0 : 0.0;
  uniforms.atmosphereStrength.value = parameters.atmosphereStrength;
  uniforms.atmosphereNear.value = parameters.atmosphereNear;
  uniforms.atmosphereFar.value = parameters.atmosphereFar;
  uniforms.atmosphereHeightFalloff.value = parameters.atmosphereHeightFalloff;
  uniforms.atmosphereBaseHeight.value = parameters.atmosphereBaseHeight;
  uniforms.atmosphereGlowStrength.value = parameters.atmosphereGlowStrength;
  uniforms.atmosphereAspect.value = height > 0 ? width / height : 16 / 9;
  uniforms.useDepthCue.value = features.depthCue ? 1.0 : 0.0;
  uniforms.useScreenOutline.value = features.screenOutline ? 1.0 : 0.0;
  uniforms.useVignette.value = features.vignette ? 1.0 : 0.0;
  uniforms.useVerticalGrade.value = features.verticalGrade ? 1.0 : 0.0;
  uniforms.vignetteRadius.value = parameters.vignetteRadius;
  uniforms.vignetteSoftness.value = parameters.vignetteSoftness;
  uniforms.vignetteStrength.value = parameters.vignetteStrength;
  uniforms.warmth.value = parameters.warmth;
}

export function createPostProcessingPipeline({
  camera,
  ownsRenderer = false,
  renderer,
  scene,
  settings: settingsInput = {},
  height = window.innerHeight,
  pixelRatio = window.devicePixelRatio,
  width = window.innerWidth,
} = {}) {
  let settings = createPostProcessingSettings(settingsInput);
  let enabled = isPostProcessingEnabled(settings);
  let currentWidth = width;
  let currentHeight = height;
  let currentPixelRatio = pixelRatio;

  const target = createPostRenderTarget(width * pixelRatio, height * pixelRatio);

  // Allocated unconditionally, but only rendered into when a depth-consuming
  // feature is active.
  const sceneDepthColorPass = createSceneDepthColorPass({ scene });
  const sceneDepthColorTarget = createScenePostDepthTarget(width * pixelRatio, height * pixelRatio);
  function compositeDepthTexture() {
    return sceneDepthColorTarget.texture;
  }

  const compositeMaterial = createFinalCompositeMaterial();
  compositeMaterial.userData.sourceTexture = target.texture;
  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compositeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
  compositeMesh.frustumCulled = false;
  compositeScene.add(compositeMesh);
  applyCompositeSettings(compositeMaterial, settings, camera, compositeDepthTexture(), width, height, pixelRatio);

  // ---- Pyramid bloom chain (lazy; only allocated when the mode is used) ----
  const bloomQuadScene = new THREE.Scene();
  const bloomQuadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  bloomQuadMesh.frustumCulled = false;
  bloomQuadScene.add(bloomQuadMesh);
  const bloomPrefilterMaterial = createBloomPrefilterNodeMaterial();
  const bloomDownsampleMaterial = createBloomDownsampleNodeMaterial();
  const bloomUpsampleMaterial = createBloomUpsampleNodeMaterial();
  let bloomDownChain = [];
  let bloomUpChain = [];
  let bloomChainWidth = 0;
  let bloomChainHeight = 0;

  function disposeBloomChain() {
    for (const rt of [...bloomDownChain, ...bloomUpChain]) rt.dispose();
    bloomDownChain = [];
    bloomUpChain = [];
  }

  function ensureBloomChain(levels) {
    const baseWidth = Math.max(1, Math.floor((currentWidth * currentPixelRatio) / 2));
    const baseHeight = Math.max(1, Math.floor((currentHeight * currentPixelRatio) / 2));
    if (bloomChainWidth === baseWidth && bloomChainHeight === baseHeight && bloomDownChain.length === levels) return;
    disposeBloomChain();
    bloomChainWidth = baseWidth;
    bloomChainHeight = baseHeight;
    let levelWidth = baseWidth;
    let levelHeight = baseHeight;
    for (let i = 0; i < levels; i++) {
      const options = { depthBuffer: false, stencilBuffer: false, type: THREE.HalfFloatType };
      const down = new THREE.WebGLRenderTarget(levelWidth, levelHeight, options);
      down.texture.name = `PostProcessing.BloomDown${i}`;
      bloomDownChain.push(down);
      if (i < levels - 1) {
        const up = new THREE.WebGLRenderTarget(levelWidth, levelHeight, options);
        up.texture.name = `PostProcessing.BloomUp${i}`;
        bloomUpChain.push(up);
      }
      levelWidth = Math.max(1, levelWidth >> 1);
      levelHeight = Math.max(1, levelHeight >> 1);
      if (levelWidth < 4 || levelHeight < 4) {
        levels = i + 1;
        break;
      }
    }
  }

  function renderBloomPass(material, renderTargetOut) {
    bloomQuadMesh.material = material;
    renderer.setRenderTarget(renderTargetOut);
    renderer.render(bloomQuadScene, compositeCamera);
  }

  // Runs the mip chain and returns the texture the composite should add.
  function renderBloomPyramid() {
    const levels = Math.max(2, Math.min(8, Math.round(settings.parameters.bloomLevels)));
    ensureBloomChain(levels);
    const activeLevels = bloomDownChain.length;

    bloomPrefilterMaterial.uniforms.tInput.value = target.texture;
    bloomPrefilterMaterial.uniforms.bloomThreshold.value = settings.parameters.bloomThreshold;
    bloomPrefilterMaterial.uniforms.bloomCharacterBoost.value = settings.parameters.bloomCharacterBoost;
    bloomPrefilterMaterial.uniforms.bloomCharacterSaturation.value = settings.parameters.bloomCharacterSaturation;
    bloomPrefilterMaterial.uniforms.bloomBackgroundSuppress.value = settings.parameters.bloomBackgroundSuppress;
    bloomPrefilterMaterial.uniforms.tCharacterMask.value = compositeMaterial.uniforms.tCharacterMask.value;
    bloomPrefilterMaterial.uniforms.useCharacterMask.value = compositeMaterial.uniforms.useCharacterMask.value;
    renderBloomPass(bloomPrefilterMaterial, bloomDownChain[0]);

    for (let i = 1; i < activeLevels; i++) {
      bloomDownsampleMaterial.uniforms.tInput.value = bloomDownChain[i - 1].texture;
      bloomDownsampleMaterial.uniforms.texelSize.value.set(1 / bloomDownChain[i - 1].width, 1 / bloomDownChain[i - 1].height);
      renderBloomPass(bloomDownsampleMaterial, bloomDownChain[i]);
    }

    const spread = 1 + settings.parameters.bloomRadius * 4;
    let previousTexture = bloomDownChain[activeLevels - 1].texture;
    for (let i = activeLevels - 2; i >= 0; i--) {
      bloomUpsampleMaterial.uniforms.tInput.value = previousTexture;
      bloomUpsampleMaterial.uniforms.tAccumulate.value = bloomDownChain[i].texture;
      bloomUpsampleMaterial.uniforms.texelSize.value.set(1 / bloomUpChain[i].width, 1 / bloomUpChain[i].height);
      bloomUpsampleMaterial.uniforms.bloomSpread.value = spread;
      renderBloomPass(bloomUpsampleMaterial, bloomUpChain[i]);
      previousTexture = bloomUpChain[i].texture;
    }
    return previousTexture;
  }

  // ---- Motion blur previous-frame matrices ----
  const currentViewProjection = new THREE.Matrix4();
  const previousViewProjection = new THREE.Matrix4();
  let hasPreviousViewProjection = false;
  let disposed = false;

  function stats() {
    const fullWidth = Math.max(1, Math.round(currentWidth * currentPixelRatio));
    const fullHeight = Math.max(1, Math.round(currentHeight * currentPixelRatio));
    const bloomTargets = bloomDownChain.length + bloomUpChain.length;
    return {
      bloomTargets,
      disposed,
      enabled,
      fullResolutionTargets: 2,
      height: fullHeight,
      // Approximation for authoring diagnostics: two RGBA16F full-res targets
      // plus allocated bloom-chain targets. Driver-specific overhead excluded.
      renderTargetBytesApprox: fullWidth * fullHeight * 8 * (2 + bloomTargets),
      scenePasses: enabled ? 1 + (needsScenePostDepth(settings) ? 1 : 0) : 1,
      width: fullWidth,
    };
  }

  return {
    compositeCamera,
    compositeMaterial,
    compositeScene,
    get enabled() {
      return enabled;
    },
    get settings() {
      return settings;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      target.dispose();
      sceneDepthColorTarget.dispose();
      sceneDepthColorPass.dispose();
      disposeBloomChain();
      for (const material of [
        compositeMaterial,
        bloomPrefilterMaterial,
        bloomDownsampleMaterial,
        bloomUpsampleMaterial,
      ]) material?.dispose?.();
    },
    resetHistory() {
      hasPreviousViewProjection = false;
    },
    render(delta) {
      void delta;
      if (disposed) return;
      if (!enabled) {
        renderer.render(scene, camera);
        return;
      }

      const previousRenderTarget = renderer.getRenderTarget();

      // Scene depth-as-color prepass feeding tDepth. Skipped whenever nothing
      // this frame actually reads depth, exactly like characterRenderPasses'
      // "only renders when a registered material consumes its output".
      if (needsScenePostDepth(settings)) {
        sceneDepthColorPass.render(renderer, camera, sceneDepthColorTarget);
      }

      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);

      const uniforms = compositeMaterial.uniforms;

      if (settings.features.atmosphere) {
        currentViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        uniforms.atmosphereViewProjection.value.copy(currentViewProjection);
        uniforms.atmosphereInverseViewProjection.value.copy(currentViewProjection).invert();
        camera.getWorldPosition(uniforms.atmosphereCameraPosition.value);
      }

      if (settings.features.motionBlur && settings.parameters.motionBlurStrength > 0) {
        currentViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        if (!hasPreviousViewProjection) {
          previousViewProjection.copy(currentViewProjection);
          hasPreviousViewProjection = true;
        }
        uniforms.motionBlurInverseViewProjection.value.copy(currentViewProjection).invert();
        uniforms.motionBlurPreviousViewProjection.value.copy(previousViewProjection);
        uniforms.motionBlurStrength.value = settings.parameters.motionBlurStrength;
        uniforms.useMotionBlur.value = 1;
        previousViewProjection.copy(currentViewProjection);
      } else {
        uniforms.useMotionBlur.value = 0;
        hasPreviousViewProjection = false;
      }

      if (settings.features.bloom &&
        settings.parameters.bloomMode === 'pyramid' &&
        settings.parameters.bloomStrength > 0) {
        uniforms.tBloom.value = renderBloomPyramid();
        uniforms.useBloomTexture.value = 1;
      } else {
        uniforms.useBloomTexture.value = 0;
      }

      renderer.setRenderTarget(null);
      renderer.render(compositeScene, compositeCamera);
      renderer.setRenderTarget(previousRenderTarget);
    },
    setSize(nextWidth, nextHeight, nextPixelRatio = pixelRatio) {
      if (disposed) return;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
      currentPixelRatio = nextPixelRatio;
      if (ownsRenderer) {
        renderer.setPixelRatio(nextPixelRatio);
        renderer.setSize(nextWidth, nextHeight);
      }
      target.setSize(nextWidth * nextPixelRatio, nextHeight * nextPixelRatio);
      sceneDepthColorTarget.setSize(nextWidth * nextPixelRatio, nextHeight * nextPixelRatio);
      disposeBloomChain();
      bloomChainWidth = 0;
      bloomChainHeight = 0;
      applyCompositeSettings(
        compositeMaterial,
        settings,
        camera,
        compositeDepthTexture(),
        nextWidth,
        nextHeight,
        nextPixelRatio,
      );
    },
    setCharacterMask(texture) {
      if (disposed) return;
      // See applyCompositeSettings' tLut comment: the node backends need a
      // real bound texture at all times, never `null`; harmless on classic
      // since tCharacterMask is only read behind the useCharacterMask guard.
      compositeMaterial.uniforms.tCharacterMask.value = texture ?? fallbackPostTexture();
      compositeMaterial.uniforms.useCharacterMask.value = texture ? 1.0 : 0.0;
    },
    setSettings(nextSettingsInput = {}) {
      if (disposed) return;
      settings = createPostProcessingSettings(nextSettingsInput);
      enabled = isPostProcessingEnabled(settings);
      applyCompositeSettings(
        compositeMaterial,
        settings,
        camera,
        compositeDepthTexture(),
        currentWidth,
        currentHeight,
        currentPixelRatio,
      );
    },
    sceneDepthReport: sceneDepthColorPass.report,
    stats,
    target,
  };
}
