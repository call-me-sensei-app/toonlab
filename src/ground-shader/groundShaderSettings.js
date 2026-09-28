// Public, portable configuration contract for terrain and ground rendering.
// Terrain geometry, splat weights, water level, current weather, current sun,
// foliage, paths, holes, and landscape editing state remain outside it.

import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';

export const GROUND_SHADER_DOCUMENT_TYPE = 'toonlab/ground-shader-preset';
export const GROUND_SHADER_SCHEMA_VERSION = 1;
export const DEFAULT_GROUND_SHADER_PRESET = 'call_me_sensei';

function field({
  defaultValue,
  description,
  label,
  options = null,
  range = null,
  type = 'number',
}) {
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? Object.freeze([...defaultValue]) : defaultValue,
    description,
    label,
    options: options ? Object.freeze([...options]) : null,
    range: range ? Object.freeze({ ...range }) : null,
    serializable: true,
    type,
  });
}

const GROUP_DEFINITIONS = Object.freeze({
  layers: Object.freeze({
    description: 'Coordinated base treatment for the four semantic ground layers.',
    label: 'Ground Layers',
    fields: Object.freeze({
      grassTint: field({ defaultValue: [0.38, 0.61, 0.3], description: 'Anime meadow tint for lawn and groundcover-painted terrain.', label: 'Grass Tint', type: 'color' }),
      dirtTint: field({ defaultValue: [0.48, 0.43, 0.37], description: 'Warm anime-earth tint for trails and exposed soil.', label: 'Dirt Tint', type: 'color' }),
      rockTint: field({ defaultValue: [0.58, 0.63, 0.69], description: 'Cool luminous stone tint for cliffs and embedded-rock layers.', label: 'Rock Tint', type: 'color' }),
      sandTint: field({ defaultValue: [0.88, 0.78, 0.52], description: 'Graphic shoreline tint for beaches and dry sediment.', label: 'Sand Tint', type: 'color' }),
      textureStrength: field({ defaultValue: 1, description: 'Strength of authored layer textures relative to the graphic layer tints.', label: 'Texture Strength', range: { max: 1, min: 0, step: 0.01 } }),
      saturation: field({ defaultValue: 1, description: 'Saturation applied after splat-layer composition.', label: 'Saturation', range: { max: 2, min: 0, step: 0.01 } }),
      contrast: field({ defaultValue: 1, description: 'Contrast around the ground-color midpoint.', label: 'Contrast', range: { max: 2.5, min: 0, step: 0.01 } }),
      brightness: field({ defaultValue: 0, description: 'Linear brightness offset after layer composition.', label: 'Brightness', range: { max: 0.5, min: -0.5, step: 0.005 } }),
    }),
  }),
  projection: Object.freeze({
    description: 'World-space layer scale and steep-surface projection.',
    label: 'Projection',
    fields: Object.freeze({
      grassScale: field({ defaultValue: 16, description: 'World-space repeat size in meters for the grass layer.', label: 'Grass Scale', range: { max: 64, min: 0.05, step: 0.05 } }),
      dirtScale: field({ defaultValue: 13, description: 'World-space repeat size in meters for the dirt layer.', label: 'Dirt Scale', range: { max: 64, min: 0.05, step: 0.05 } }),
      rockScale: field({ defaultValue: 25, description: 'World-space repeat size in meters for rock and cliff detail.', label: 'Rock Scale', range: { max: 128, min: 0.05, step: 0.05 } }),
      sandScale: field({ defaultValue: 10, description: 'World-space repeat size in meters for sand detail.', label: 'Sand Scale', range: { max: 64, min: 0.05, step: 0.05 } }),
      triplanarStrength: field({ defaultValue: 1, description: 'Strength of triplanar projection on steep surfaces.', label: 'Triplanar Strength', range: { max: 1, min: 0, step: 0.01 } }),
      triplanarSharpness: field({ defaultValue: 2, description: 'Sharpness of blending between triplanar projection axes.', label: 'Triplanar Sharpness', range: { max: 12, min: 0.25, step: 0.05 } }),
    }),
  }),
  macro: Object.freeze({
    description: 'Large-scale color variation that prevents flat, repeating terrain.',
    label: 'Macro Variation',
    fields: Object.freeze({
      amount: field({ defaultValue: 0.16, description: 'Primary world-space brightness variation.', label: 'Primary Amount', range: { max: 1, min: 0, step: 0.01 } }),
      scale: field({ defaultValue: 0.045, description: 'Primary macro-noise frequency in inverse meters.', label: 'Primary Scale', range: { max: 0.5, min: 0.0005, step: 0.0005 } }),
      secondaryAmount: field({ defaultValue: 0.08, description: 'Secondary broad variation that breaks the primary pattern.', label: 'Secondary Amount', range: { max: 1, min: 0, step: 0.01 } }),
      secondaryScale: field({ defaultValue: 0.012, description: 'Secondary macro-noise frequency in inverse meters.', label: 'Secondary Scale', range: { max: 0.25, min: 0.0002, step: 0.0002 } }),
      tint: field({ defaultValue: [0.74, 0.86, 0.58], description: 'Graphic color introduced through macro variation.', label: 'Macro Tint', type: 'color' }),
      tintStrength: field({ defaultValue: 0.12, description: 'Maximum blend toward the macro tint.', label: 'Tint Strength', range: { max: 1, min: 0, step: 0.01 } }),
      rockDetailAmount: field({ defaultValue: 0.3, description: 'Triplanar geological value variation applied to steep rock surfaces even when no authored layer map is supplied.', label: 'Rock Detail Amount', range: { max: 1, min: 0, step: 0.01 } }),
      rockDetailScale: field({ defaultValue: 0.42, description: 'World-space frequency for procedural triplanar cliff detail.', label: 'Rock Detail Scale', range: { max: 4, min: 0.005, step: 0.005 } }),
      rockStrataAmount: field({ defaultValue: 0.2, description: 'Horizontal geological band variation applied to steep cliff surfaces.', label: 'Rock Strata Amount', range: { max: 1, min: 0, step: 0.01 } }),
      rockStrataScale: field({ defaultValue: 0.72, description: 'Vertical frequency for procedural cliff strata.', label: 'Rock Strata Scale', range: { max: 8, min: 0.01, step: 0.01 } }),
    }),
  }),
  slope: Object.freeze({
    description: 'How steep terrain transitions toward the rock treatment.',
    label: 'Slope Response',
    fields: Object.freeze({
      autoRockStrength: field({ defaultValue: 0.82, description: 'Maximum automatic rock-layer takeover on steep terrain.', label: 'Auto Rock Strength', range: { max: 1, min: 0, step: 0.01 } }),
      start: field({ defaultValue: 0.18, description: 'World-normal slope value where automatic rock begins.', label: 'Slope Start', range: { max: 1, min: 0, step: 0.01 } }),
      fade: field({ defaultValue: 0.16, description: 'Width of the grass-to-rock slope transition.', label: 'Slope Fade', range: { max: 1, min: 0.001, step: 0.005 } }),
      noiseStrength: field({ defaultValue: 0.08, description: 'World-noise offset that prevents analytic contour bands.', label: 'Edge Noise', range: { max: 0.5, min: 0, step: 0.005 } }),
      noiseScale: field({ defaultValue: 0.035, description: 'Frequency of the slope-transition noise.', label: 'Noise Scale', range: { max: 0.5, min: 0.0005, step: 0.0005 } }),
      edgeHighlight: field({ defaultValue: 0.28, description: 'Warm graphic lift along the flat-to-cliff transition.', label: 'Lip Highlight', range: { max: 2, min: 0, step: 0.01 } }),
    }),
  }),
  shoreline: Object.freeze({
    description: 'Response to the current scene water level; the water level itself is never serialized.',
    label: 'Shoreline Response',
    fields: Object.freeze({
      autoSandStrength: field({ defaultValue: 0.55, description: 'Automatic blend toward the sand treatment near current water level.', label: 'Auto Sand Strength', range: { max: 1, min: 0, step: 0.01 } }),
      bandWidth: field({ defaultValue: 3.5, description: 'Meters around water level that can receive automatic sand.', label: 'Sand Band Width', range: { max: 40, min: 0.05, step: 0.05 } }),
      softness: field({ defaultValue: 1.25, description: 'Softness in meters of the automatic shoreline transition.', label: 'Band Softness', range: { max: 20, min: 0.01, step: 0.05 } }),
      wetBandWidth: field({ defaultValue: 0.7, description: 'Meters above water level that receive a damp shoreline response.', label: 'Wet Band Width', range: { max: 10, min: 0, step: 0.05 } }),
      wetBandDarkening: field({ defaultValue: 0.18, description: 'Maximum darkening in the damp shoreline band.', label: 'Wet Band Darkening', range: { max: 1, min: 0, step: 0.01 } }),
    }),
  }),
  material: Object.freeze({
    description: 'Shared physically based response for the ground surface.',
    label: 'Material Response',
    fields: Object.freeze({
      roughness: field({ defaultValue: 0.9, description: 'Dry ground roughness before current wetness.', label: 'Roughness', range: { max: 1, min: 0, step: 0.01 } }),
      metalness: field({ defaultValue: 0, description: 'Metallic response for deliberately unusual ground styles.', label: 'Metalness', range: { max: 1, min: 0, step: 0.01 } }),
      microOcclusionStrength: field({ defaultValue: 0.16, description: 'Subtle broad surface occlusion derived from terrain form and macro variation.', label: 'Micro Occlusion', range: { max: 1, min: 0, step: 0.01 } }),
      emissiveStrength: field({ defaultValue: 0, description: 'Emission multiplier for deliberately luminous ground styles.', label: 'Emission', range: { max: 2, min: 0, step: 0.01 } }),
    }),
  }),
  lighting: Object.freeze({
    description: 'Ground-specific response to the current scene sun and sky.',
    label: 'Lighting',
    fields: Object.freeze({
      sunIntensity: field({ defaultValue: 1, description: 'Exposure of sun-facing ground after the graphic light/shade split. Values above one preserve HDR headroom for tone mapping.', label: 'Sun Intensity', range: { max: 4, min: 0, step: 0.01 } }),
      backShadowStrength: field({ defaultValue: 0.38, description: 'Directional value loss on terrain faces turned away from the current sun; keeps cliffs from reading as unlit flat color.', label: 'Back Shadow Strength', range: { max: 0.8, min: 0, step: 0.01 } }),
      shadowTint: field({ defaultValue: [0.68, 0.74, 0.94], description: 'Cool tint introduced on surfaces facing away from the current sun.', label: 'Shadow Tint', type: 'color' }),
      shadowTintStrength: field({ defaultValue: 0.34, description: 'Strength of the cool ground-shadow treatment.', label: 'Shadow Tint Strength', range: { max: 1, min: 0, step: 0.01 } }),
      shadowLift: field({ defaultValue: 0.4, description: 'Albedo-relative floor retained in shaded ground.', label: 'Shadow Lift', range: { max: 1, min: 0, step: 0.01 } }),
      sunTintStrength: field({ defaultValue: 0.18, description: 'Influence of current sun color on lit ground.', label: 'Sun Tint Strength', range: { max: 1, min: 0, step: 0.01 } }),
      skyFillStrength: field({ defaultValue: 0.12, description: 'Influence of current sky color on shaded ground.', label: 'Sky Fill Strength', range: { max: 1, min: 0, step: 0.01 } }),
      rimStrength: field({ defaultValue: 0.06, description: 'View-dependent grazing-angle color lift.', label: 'Rim Strength', range: { max: 1, min: 0, step: 0.01 } }),
    }),
  }),
  weatherResponse: Object.freeze({
    description: 'How ground responds to current wetness and snow coverage.',
    label: 'Weather Response',
    fields: Object.freeze({
      wetDarkening: field({ defaultValue: 0.24, description: 'Maximum albedo darkening at full wetness.', label: 'Wet Darkening', range: { max: 1, min: 0, step: 0.01 } }),
      wetDesaturation: field({ defaultValue: 0.08, description: 'Maximum color desaturation at full wetness.', label: 'Wet Desaturation', range: { max: 1, min: 0, step: 0.01 } }),
      wetRoughness: field({ defaultValue: 0.38, description: 'Roughness approached at full wetness.', label: 'Wet Roughness', range: { max: 1, min: 0, step: 0.01 } }),
      snowTint: field({ defaultValue: [0.92, 0.96, 1], description: 'Ground snow tint.', label: 'Snow Tint', type: 'color' }),
      snowStrength: field({ defaultValue: 0.92, description: 'Maximum visible snow coverage response.', label: 'Snow Strength', range: { max: 1, min: 0, step: 0.01 } }),
      snowSlopeStart: field({ defaultValue: 0.62, description: 'Upward-normal threshold where snow begins to remain.', label: 'Snow Slope Start', range: { max: 1, min: -1, step: 0.01 } }),
      snowSoftness: field({ defaultValue: 0.22, description: 'Softness of the snow slope transition.', label: 'Snow Softness', range: { max: 1, min: 0.001, step: 0.005 } }),
    }),
  }),
  printResponse: Object.freeze({
    description: 'How printable dirt, sand, and snow respond to transient footprint and track stamps.',
    label: 'Print Response',
    fields: Object.freeze({
      strength: field({ defaultValue: 1, description: 'Master visibility of the transient Ground Print Layer.', label: 'Print Strength', range: { max: 1, min: 0, step: 0.01 } }),
      dirtStrength: field({ defaultValue: 0.7, description: 'Printability of the painted dirt layer.', label: 'Dirt Printability', range: { max: 1, min: 0, step: 0.01 } }),
      sandStrength: field({ defaultValue: 1, description: 'Printability of the painted sand layer.', label: 'Sand Printability', range: { max: 1, min: 0, step: 0.01 } }),
      snowStrength: field({ defaultValue: 1, description: 'Printability of current snow once scene snow depth is sufficient.', label: 'Snow Printability', range: { max: 1, min: 0, step: 0.01 } }),
      depressionDarkening: field({ defaultValue: 0.28, description: 'Albedo darkening inside compressed or displaced material.', label: 'Depression Darkening', range: { max: 1, min: 0, step: 0.01 } }),
      rimLightening: field({ defaultValue: 0.22, description: 'Graphic lift on the raised edge around a print.', label: 'Raised Rim Lightening', range: { max: 1, min: 0, step: 0.01 } }),
      normalStrength: field({ defaultValue: 1.4, description: 'World-space normal relief derived from the print field.', label: 'Relief Strength', range: { max: 6, min: 0, step: 0.02 } }),
      compactedRoughness: field({ defaultValue: 0.5, description: 'Roughness approached inside compacted prints.', label: 'Compacted Roughness', range: { max: 1, min: 0, step: 0.01 } }),
    }),
  }),
  distance: Object.freeze({
    description: 'Atmospheric recession and detail simplification over viewing distance.',
    label: 'Distance Treatment',
    fields: Object.freeze({
      start: field({ defaultValue: 500, description: 'Distance in meters where atmospheric ground tint begins.', label: 'Start Distance', range: { max: 10000, min: 0, step: 1 } }),
      end: field({ defaultValue: 15000, description: 'Distance in meters where atmospheric tint reaches full strength.', label: 'End Distance', range: { max: 50000, min: 1, step: 1 } }),
      color: field({ defaultValue: [0.59375, 0.59375, 0.59375], description: 'Atmospheric ground color at long distance.', label: 'Far Color', type: 'color' }),
      strength: field({ defaultValue: 0.5, description: 'Maximum blend toward the far-distance color.', label: 'Far Tint Strength', range: { max: 1, min: 0, step: 0.01 } }),
      detailFade: field({ defaultValue: 1, description: 'Amount of high-frequency texture and macro detail removed at range.', label: 'Detail Fade', range: { max: 1, min: 0, step: 0.01 } }),
    }),
  }),
});

const presets = new Map();

function clone(value) {
  return Array.isArray(value) ? [...value] : value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function color(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  if (!channels.every(Number.isFinite)) return [...fallback];
  return channels.map((channel) => Math.min(Math.max(channel, 0), 1));
}

function sanitize(value, definition, fallback) {
  if (definition.type === 'color') return color(value, fallback);
  if (definition.type === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (definition.type === 'select') {
    return definition.options.includes(value) ? value : fallback;
  }
  const parsed = Number(value);
  const number = Number.isFinite(parsed) ? parsed : fallback;
  return definition.range
    ? Math.min(Math.max(number, definition.range.min), definition.range.max)
    : number;
}

const defaults = {};
const schema = {};
const uniformByField = {};
function pascal(value) {
  return String(value).replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g,
    (_match, _separator, character) => character.toUpperCase());
}
for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
  defaults[groupId] = {};
  schema[groupId] = {};
  for (const [key, definition] of Object.entries(group.fields)) {
    const uniform = `uStyle${pascal(groupId)}${pascal(key)}`;
    uniformByField[`${groupId}.${key}`] = uniform;
    defaults[groupId][key] = clone(definition.defaultValue);
    schema[groupId][key] = Object.freeze({
      ...definition,
      defaultValue: clone(definition.defaultValue),
      group: groupId,
      id: `${groupId}.${key}`,
      key,
      uniform,
    });
  }
  defaults[groupId] = Object.freeze(defaults[groupId]);
  schema[groupId] = Object.freeze(schema[groupId]);
}

export const DEFAULT_GROUND_SHADER_SETTINGS = Object.freeze(defaults);
export const GROUND_SHADER_FIELD_SCHEMA = Object.freeze(schema);
export const GROUND_SHADER_UNIFORM_BY_FIELD = Object.freeze(uniformByField);
export const GROUND_SHADER_SETTING_GROUPS = Object.freeze(
  Object.entries(GROUP_DEFINITIONS).map(([id, group]) => Object.freeze({
    description: group.description,
    id,
    label: group.label,
  })),
);

function normalizePreset(value) {
  const id = String(value ?? '').trim();
  return id || DEFAULT_GROUND_SHADER_PRESET;
}

export function createGroundShaderSettings(options = {}) {
  const source = typeof options === 'string' ? { preset: options } : (isObject(options) ? options : {});
  const presetId = normalizePreset(source.preset);
  const preset = presets.get(presetId) ?? presets.get('default');
  const input = isObject(source.settings) ? source.settings : source;
  const result = {};
  for (const [groupId, group] of Object.entries(GROUP_DEFINITIONS)) {
    const groupInput = isObject(input[groupId]) ? input[groupId] : {};
    result[groupId] = {};
    for (const [key, definition] of Object.entries(group.fields)) {
      const fallback = preset?.settings?.[groupId]?.[key]
        ?? DEFAULT_GROUND_SHADER_SETTINGS[groupId][key];
      result[groupId][key] = sanitize(
        groupInput[key] === undefined ? fallback : groupInput[key],
        definition,
        fallback,
      );
    }
  }
  return result;
}

function canonicalDocument(id, definition = {}) {
  const source = isObject(definition) ? definition : {};
  return {
    description: String(source.description ?? ''),
    id: String(id ?? source.id ?? '').trim(),
    label: String(source.label ?? id ?? source.id ?? '').trim(),
    settings: createGroundShaderSettings(source.settings ?? source),
    type: GROUND_SHADER_DOCUMENT_TYPE,
    version: GROUND_SHADER_SCHEMA_VERSION,
  };
}

export function validateGroundShaderPresetDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid Ground Shader JSON: ${error.message}`], ok: false, value: null, warnings: [] };
    }
  }
  if (!isObject(source)) {
    return { errors: ['Ground Shader preset must be a JSON object.'], ok: false, value: null, warnings: [] };
  }
  const errors = [];
  const warnings = [];
  if (source.type !== GROUND_SHADER_DOCUMENT_TYPE) {
    errors.push(`Ground Shader preset type must be "${GROUND_SHADER_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? source.schemaVersion ?? GROUND_SHADER_SCHEMA_VERSION);
  if (!Number.isFinite(version)) errors.push('Ground Shader version must be a number.');
  else if (version > GROUND_SHADER_SCHEMA_VERSION) {
    errors.push(`Ground Shader version ${version} is newer than supported version ${GROUND_SHADER_SCHEMA_VERSION}.`);
  }
  const id = String(source.id ?? '').trim();
  if (!id) errors.push('Ground Shader preset id is required.');
  for (const [groupId, group] of Object.entries(isObject(source.settings) ? source.settings : {})) {
    if (!GROUP_DEFINITIONS[groupId]) {
      warnings.push(`Unknown Ground Shader group "${groupId}" was ignored.`);
      continue;
    }
    for (const key of Object.keys(isObject(group) ? group : {})) {
      if (!GROUP_DEFINITIONS[groupId].fields[key]) {
        warnings.push(`Unknown Ground Shader field "${groupId}.${key}" was ignored.`);
      }
    }
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? canonicalDocument(id, source) : null,
    warnings,
  };
}

export const parseGroundShaderPresetDocument = validateGroundShaderPresetDocument;

export function createGroundShaderPresetDocument(id, definition = {}) {
  const document = canonicalDocument(id, definition);
  const result = validateGroundShaderPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializeGroundShaderPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = isObject(idOrDocument) && idOrDocument.type === GROUND_SHADER_DOCUMENT_TYPE
    ? createGroundShaderPresetDocument(idOrDocument.id, idOrDocument)
    : createGroundShaderPresetDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}

export function registerGroundShaderPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createGroundShaderPresetDocument(id, definition);
  if (overwrite && isProtectedSystemStyleId(document.id) && presets.has(document.id)) {
    throw new Error(`System style "${document.id}" is read-only.`);
  }
  if (!overwrite && presets.has(document.id)) {
    throw new Error(`Ground Shader preset "${document.id}" already exists.`);
  }
  presets.set(document.id, document);
  return { description: document.description, id: document.id, label: document.label, value: document.id };
}

export function registerSerializedGroundShaderPreset(input, options = {}) {
  const result = parseGroundShaderPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerGroundShaderPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

export function getGroundShaderPresetOptions() {
  return [...presets.values()].map(({ description, id, label }) => ({
    description,
    id,
    label,
    value: id,
  }));
}

export function resolveGroundShaderPreset(id = DEFAULT_GROUND_SHADER_PRESET, overrides = {}) {
  return createGroundShaderSettings({ ...overrides, preset: id });
}

registerGroundShaderPreset('default', {
  description: 'Neutral complete Ground Shader baseline.',
  label: 'Default',
});

registerGroundShaderPreset('call_me_sensei', {
  description: 'Call Me Sensei anime-ground treatment with coordinated projection, cliff, wetness, snow, and distance response.',
  label: 'Call Me Sensei',
  settings: {
    layers: {
      brightness: 0,
      contrast: 1,
      dirtTint: [0.48, 0.43, 0.37],
      grassTint: [0.38, 0.61, 0.3],
      rockTint: [0.58, 0.63, 0.69],
      sandTint: [0.88, 0.78, 0.52],
      saturation: 1,
      textureStrength: 1,
    },
    lighting: {
      sunIntensity: 1.18,
      backShadowStrength: 0.62,
      shadowLift: 0.24,
      shadowTint: [0.68, 0.74, 0.94],
      shadowTintStrength: 0.48,
      skyFillStrength: 0.04,
    },
    macro: {
      amount: 0.1,
      scale: 1 / 84.172,
      secondaryAmount: 0,
      tint: [0.38, 0.61, 0.3],
      tintStrength: 0,
    },
    material: {
      emissiveStrength: 0,
      metalness: 0.1,
      roughness: 1,
    },
    projection: {
      dirtScale: 13,
      grassScale: 16,
      rockScale: 25,
      sandScale: 10,
      triplanarSharpness: 2,
      triplanarStrength: 1,
    },
    slope: {
      autoRockStrength: 1,
      edgeHighlight: 0,
      fade: 0.05,
      noiseScale: 1 / 80,
      noiseStrength: 0.08,
      start: 0.15,
    },
    shoreline: {
      autoSandStrength: 0,
      bandWidth: 0.75,
      softness: 0.25,
      wetBandDarkening: 0.3,
      wetBandWidth: 0.75,
    },
    weatherResponse: {
      snowSlopeStart: 0.3,
      snowSoftness: 0.125,
      snowStrength: 1,
      snowTint: [1, 1, 1],
      wetDarkening: 0.25,
      wetDesaturation: 0.25,
      wetRoughness: 0.3,
    },
    printResponse: {
      compactedRoughness: 0.48,
      depressionDarkening: 0.3,
      dirtStrength: 0.72,
      normalStrength: 1.55,
      rimLightening: 0.24,
      sandStrength: 1,
      snowStrength: 1,
      strength: 1,
    },
    distance: {
      color: [0.59375, 0.59375, 0.59375],
      detailFade: 1,
      end: 15000,
      start: 500,
      strength: 0.5,
    },
  },
});

/** Complete portable Call Me Sensei starting point used by the Ground Shader Lab. */
export const CALL_ME_SENSEI_GROUND_SHADER_SETTINGS = Object.freeze(
  createGroundShaderSettings({ preset: 'call_me_sensei' }),
);

export const GROUND_SHADER = Object.freeze({
  createDocument: createGroundShaderPresetDocument,
  createSettings: createGroundShaderSettings,
  defaults: DEFAULT_GROUND_SHADER_SETTINGS,
  description: 'Reusable terrain treatment with bounded transient print response, independent from landscape geometry and collision.',
  documentType: GROUND_SHADER_DOCUMENT_TYPE,
  fieldSchema: GROUND_SHADER_FIELD_SCHEMA,
  getPresetOptions: getGroundShaderPresetOptions,
  groups: GROUND_SHADER_SETTING_GROUPS,
  id: 'ground',
  label: 'Ground Shader',
  registerPreset: registerGroundShaderPreset,
  validateDocument: validateGroundShaderPresetDocument,
});
