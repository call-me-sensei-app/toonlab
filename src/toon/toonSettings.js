// Character toon-shading settings registry. Import from
// '@call-me-sensei/toonlab/toon-settings' (or '/toon').
//
// Settings are grouped (spec §4): light, shading, ramp, face, shadows, rim,
// highlights, outline and maps describe the look; baseTexture, alpha,
// autoRoles, sticker and fur describe how a model's materials are read.
// Every group is described once by field definitions (settings/*.js); the
// same definitions normalise values, produce the public field schema the Labs
// and the settings reference render from, and sanitise preset documents.

import {
  cleanPresetObject,
  createSettingsPresetDocument,
  isPlainPresetObject,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';
import { createAlphaSettings, DEFAULT_ALPHA_SETTINGS } from './settings/alphaSettings.js';
import { AUTO_ROLE_MODES, createAutoRolesSettings, DEFAULT_AUTO_ROLES_SETTINGS } from './settings/autoRolesSettings.js';
import {
  BASE_TEXTURE_MATERIAL_COLOR_MODES,
  BASE_TEXTURE_SATURATION_MODES,
  createBaseTextureSettings,
  DEFAULT_BASE_TEXTURE_SETTINGS,
} from './settings/baseTextureSettings.js';
import { FACE_FIELDS, FACE_GROUP, createFaceSettings } from './settings/faceSettings.js';
import {
  booleanField,
  describeGroupFields,
  listField,
  mergeSettings,
  numberField,
  sanitizeGroupValues,
  selectField,
  textureField,
  unknownGroupKeys,
  vector2Field,
} from './settings/fieldSchema.js';
import { createFurSettings, DEFAULT_FUR_SETTINGS } from './settings/furSettings.js';
import { HIGHLIGHTS_FIELDS, HIGHLIGHTS_GROUP, createHighlightSettings } from './settings/highlightSettings.js';
import { LIGHT_FIELDS, LIGHT_GROUP, createLightSettings } from './settings/lightSettings.js';
import { MAPS_FIELDS, MAPS_GROUP, createMapsSettings } from './settings/mapsSettings.js';
import { OUTLINE_FIELDS, OUTLINE_GROUP, createOutlineSettings } from './settings/outlineSettings.js';
import { RAMP_FIELDS, RAMP_GROUP, createRampSettings } from './settings/rampSettings.js';
import { RIM_FIELDS, RIM_GROUP, createRimSettings } from './settings/rimSettings.js';
import { SHADING_FIELDS, SHADING_GROUP, createShadingSettings } from './settings/shadingSettings.js';
import { SHADOWS_FIELDS, SHADOWS_GROUP, createShadowSettings } from './settings/shadowSettings.js';
import { createStickerSettings, DEFAULT_STICKER_SETTINGS, STICKER_BLEND_MODES } from './settings/stickerSettings.js';

// ---------------------------------------------------------------------------
// Field descriptions of the groups that read the model (their values are
// still produced by their own create*Settings functions).

const BASE_TEXTURE_FIELDS = Object.freeze({
  materialColorMode: selectField(DEFAULT_BASE_TEXTURE_SETTINGS.materialColorMode, Object.values(BASE_TEXTURE_MATERIAL_COLOR_MODES), 'How the source material colour combines with its base texture (`legacy` ignores importer default greys).', { optionLabels: { legacy: 'Compatibility', source: 'Source Material Color', texture: 'Texture Only', white: 'White' } }),
  saturationMode: selectField(DEFAULT_BASE_TEXTURE_SETTINGS.saturationMode, Object.values(BASE_TEXTURE_SATURATION_MODES), 'Base-texture saturation policy (`legacy` lifts cloth slightly and calms skin).', { optionLabels: { custom: 'Custom', legacy: 'Compatibility', source: 'Source Saturation' } }),
  customSaturation: numberField(DEFAULT_BASE_TEXTURE_SETTINGS.customSaturation, 0, 2, 'Saturation multiplier used when the saturation mode is `custom`.'),
});

const ALPHA_FIELDS = Object.freeze({
  enabled: booleanField(DEFAULT_ALPHA_SETTINGS.enabled, 'Apply the alpha policy (cutouts, blended overlays, draw order).'),
  coverageMode: selectField(DEFAULT_ALPHA_SETTINGS.coverageMode, ['auto', 'trust'], '`auto` checks each inferred cutout against the measured alpha coverage; `trust` honours every rule as-is.'),
  cutoutCutoff: numberField(DEFAULT_ALPHA_SETTINGS.cutoutCutoff, 0, 1, 'Alpha below which cutout texels are discarded.'),
  blendCutoff: numberField(DEFAULT_ALPHA_SETTINGS.blendCutoff, 0, 1, 'Alpha below which blended texels are discarded.'),
  ditherOpacity: numberField(DEFAULT_ALPHA_SETTINGS.ditherOpacity, 0, 1, 'Screen-door fade of the whole character (1 = opaque).'),
  featuresOverHairDepth: numberField(DEFAULT_ALPHA_SETTINGS.featuresOverHairDepth, 0, 0.1, 'Brows, lashes and eye lines draw over bangs by pulling their depth this far toward the camera. 0 = off.'),
  preserveSourceAlphaTest: booleanField(DEFAULT_ALPHA_SETTINGS.preserveSourceAlphaTest, 'Keep a source material\'s own alpha test.'),
  sourceAlphaMapCutout: booleanField(DEFAULT_ALPHA_SETTINGS.sourceAlphaMapCutout, 'Cut out materials with an alpha map.'),
  mapTransparentCutout: booleanField(DEFAULT_ALPHA_SETTINGS.mapTransparentCutout, 'Cut out materials whose base texture is flagged transparent.'),
  sourceTransparentCutout: booleanField(DEFAULT_ALPHA_SETTINGS.sourceTransparentCutout, 'Cut out (rather than blend) fully opaque materials flagged transparent.'),
  skinCutout: booleanField(DEFAULT_ALPHA_SETTINGS.skinCutout, 'Cut out skin materials.'),
  faceCutout: booleanField(DEFAULT_ALPHA_SETTINGS.faceCutout, 'Cut out face materials.'),
  hairCutout: booleanField(DEFAULT_ALPHA_SETTINGS.hairCutout, 'Cut out hair materials.'),
  costumeCutout: booleanField(DEFAULT_ALPHA_SETTINGS.costumeCutout, 'Cut out costume materials.'),
  expressionTokenCutout: booleanField(DEFAULT_ALPHA_SETTINGS.expressionTokenCutout, 'Cut out materials named skin/cloth/hair/expression.'),
  transparentOverlayBlend: booleanField(DEFAULT_ALPHA_SETTINGS.transparentOverlayBlend, 'Blend transparent overlays (blush, eye highlights, decals).'),
  transparentOpacityThreshold: numberField(DEFAULT_ALPHA_SETTINGS.transparentOpacityThreshold, 0, 1, 'Material opacity at or above which a material counts as opaque.'),
  overlayDepthWrite: booleanField(DEFAULT_ALPHA_SETTINGS.overlayDepthWrite, 'Overlays write depth.'),
  sortOverlays: booleanField(DEFAULT_ALPHA_SETTINGS.sortOverlays, 'Draw eye layers and overlays in a fixed order.'),
  scleraOrder: numberField(DEFAULT_ALPHA_SETTINGS.scleraOrder, -100, 100, 'Draw order of eye whites.', { step: 1 }),
  eyeOrder: numberField(DEFAULT_ALPHA_SETTINGS.eyeOrder, -100, 100, 'Draw order of irises and pupils.', { step: 1 }),
  eyeHighlightOrder: numberField(DEFAULT_ALPHA_SETTINGS.eyeHighlightOrder, -100, 100, 'Draw order of eye highlights.', { step: 1 }),
  overlayOrder: numberField(DEFAULT_ALPHA_SETTINGS.overlayOrder, -100, 100, 'Draw order of other overlays.', { step: 1 }),
});

const AUTO_ROLES_FIELDS = Object.freeze({
  mode: selectField(DEFAULT_AUTO_ROLES_SETTINGS.mode, Object.values(AUTO_ROLE_MODES), '`auto` infers face, skin and hair per vertex when no material is named as a face; `off` never does.'),
  skinTolerance: numberField(DEFAULT_AUTO_ROLES_SETTINGS.skinTolerance, 0.01, 0.3, 'Chromaticity distance from the model\'s sampled skin tone that still counts as skin.'),
});

const STICKER_FIELDS = Object.freeze({
  enabled: booleanField(DEFAULT_STICKER_SETTINGS.enabled, 'Blend a decal texture into the albedo before lighting.'),
  map: textureField('Decal texture for every material (per material: `userData.toonStickerMap`).'),
  blendMode: selectField(DEFAULT_STICKER_SETTINGS.blendMode, Object.values(STICKER_BLEND_MODES), 'How the decal combines with the albedo.'),
  strength: numberField(DEFAULT_STICKER_SETTINGS.strength, 0, 1, 'Decal opacity.'),
  repeat: vector2Field(DEFAULT_STICKER_SETTINGS.repeat, -64, 64, 'Decal UV tiling.'),
  offset: vector2Field(DEFAULT_STICKER_SETTINGS.offset, -64, 64, 'Decal UV offset.'),
  uvChannel: selectField(DEFAULT_STICKER_SETTINGS.uvChannel, [0, 1], 'UV set the decal uses.', { numeric: true, optionLabels: { 0: 'UV', 1: 'UV2' } }),
});

const FUR_FIELDS = Object.freeze({
  enabled: booleanField(DEFAULT_FUR_SETTINGS.enabled, 'Shell fur on opted-in materials (names, roles or `userData.toonFur`).'),
  shellCount: numberField(DEFAULT_FUR_SETTINGS.shellCount, 1, 32, 'Number of shells; cost grows linearly.', { step: 1 }),
  length: numberField(DEFAULT_FUR_SETTINGS.length, 0, 1, 'Fur length at the outermost shell, metres.'),
  gravity: numberField(DEFAULT_FUR_SETTINGS.gravity, 0, 1, 'How far the tips sag toward world down.'),
  density: numberField(DEFAULT_FUR_SETTINGS.density, 0.1, 40, 'Strand density.'),
  rootOffset: numberField(DEFAULT_FUR_SETTINGS.rootOffset, -1, 0, 'Shifts strand coverage toward the roots; more negative = fuller coat.'),
  rootShade: numberField(DEFAULT_FUR_SETTINGS.rootShade, 0, 1, 'Darkens the roots for depth.'),
  materials: listField('Material names or patterns that grow fur.'),
  roles: listField('Material roles that grow fur.'),
});

const KEPT_GROUP_METADATA = Object.freeze({
  alpha: Object.freeze({ description: 'Cutout, blend and draw-order policy for the model\'s materials.', id: 'alpha', label: 'Alpha' }),
  autoRoles: Object.freeze({ description: 'Automatic face, skin and hair roles for models whose materials name none.', id: 'autoRoles', label: 'Automatic Roles' }),
  baseTexture: Object.freeze({ description: 'How the source base texture and material colour become the albedo.', id: 'baseTexture', label: 'Base Texture' }),
  fur: Object.freeze({ description: 'Shell fur on opted-in materials.', id: 'fur', label: 'Fur' }),
  sticker: Object.freeze({ description: 'A decal texture blended into the albedo before lighting.', id: 'sticker', label: 'Sticker' }),
});

// ---------------------------------------------------------------------------
// The group table.

const GROUPS = [
  { create: createLightSettings, fields: LIGHT_FIELDS, meta: LIGHT_GROUP },
  { create: createShadingSettings, fields: SHADING_FIELDS, meta: SHADING_GROUP },
  { create: createRampSettings, fields: RAMP_FIELDS, meta: RAMP_GROUP },
  { create: createFaceSettings, fields: FACE_FIELDS, meta: FACE_GROUP },
  { create: createShadowSettings, fields: SHADOWS_FIELDS, meta: SHADOWS_GROUP },
  { create: createRimSettings, fields: RIM_FIELDS, meta: RIM_GROUP },
  { create: createHighlightSettings, fields: HIGHLIGHTS_FIELDS, meta: HIGHLIGHTS_GROUP },
  { create: createOutlineSettings, fields: OUTLINE_FIELDS, meta: OUTLINE_GROUP },
  { create: createMapsSettings, fields: MAPS_FIELDS, meta: MAPS_GROUP },
  { create: (value) => createBaseTextureSettings(isPlainPresetObject(value) && Object.keys(value).length ? value : null), fields: BASE_TEXTURE_FIELDS, meta: KEPT_GROUP_METADATA.baseTexture },
  { create: createAlphaSettings, fields: ALPHA_FIELDS, meta: KEPT_GROUP_METADATA.alpha },
  { create: createAutoRolesSettings, fields: AUTO_ROLES_FIELDS, meta: KEPT_GROUP_METADATA.autoRoles },
  { create: createStickerSettings, fields: STICKER_FIELDS, meta: KEPT_GROUP_METADATA.sticker },
  { create: createFurSettings, fields: FUR_FIELDS, meta: KEPT_GROUP_METADATA.fur },
];

const GROUP_BY_ID = new Map(GROUPS.map((group) => [group.meta.id, group]));

/** Setting groups in display order: `{ id, label, description }`. */
export const TOON_SETTING_GROUPS = Object.freeze(GROUPS.map((group) => group.meta));

/** Group metadata keyed by group id. */
export const TOON_SETTING_GROUP_METADATA = Object.freeze(
  Object.fromEntries(GROUPS.map((group) => [group.meta.id, group.meta])),
);

/**
 * Field metadata per group, nested like the group's values; every leaf is
 * `{ id, group, key, label, description, type, range, options, optionLabels,
 * defaultValue, serializable }` (`key` is the dotted path within the group).
 */
export const TOON_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(GROUPS.map((group) => [group.meta.id, describeGroupFields(group.meta.id, group.fields)])),
);

export function getToonSettingGroupMetadata(groupId) {
  return TOON_SETTING_GROUP_METADATA[groupId] ?? null;
}

/** Field metadata by group and dotted key (`getToonSettingFieldSchema('light', 'cameraLight.strength')`). */
export function getToonSettingFieldSchema(groupId, key = null) {
  const group = TOON_SETTING_FIELD_SCHEMA[groupId];
  if (!group) return null;
  if (key === null || key === undefined) return group;
  let node = group;
  for (const part of String(key).split('.')) {
    node = node?.[part];
    if (!node) return null;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Presets.

const PRESET_DEFAULT = 'default';
const PRESET_CALL_ME_SENSEI = 'call_me_sensei';
const PRESET_SHOWCASE = 'showcase';

/** The built-in preset ids. */
export const TOON_PRESET_IDS = Object.freeze([PRESET_DEFAULT, PRESET_CALL_ME_SENSEI, PRESET_SHOWCASE]);

// The product look (spec §4.10): a softer sun hue, the silhouette rim, masked
// cloth highlights and deeper, more saturated ink.
const CALL_ME_SENSEI_SETTINGS = Object.freeze({
  highlights: {
    hair: { intensity: 0.45, shadowFloor: 0.32 },
    specular: {
      cloth: { intensity: 0.09, size: 48, threshold: 0.74 },
      clothNeedsMask: true,
      hair: { intensity: 0.24, size: 44 },
      mask: { fromSource: true },
      metal: { intensity: 0.5 },
    },
  },
  light: { sunTint: 0.35 },
  outline: {
    ink: {
      cloth: [0.22, 0.21, 0.28],
      face: [0.55, 0.3, 0.3],
      hair: [0.75, 0.75, 0.75],
      skin: [0.55, 0.3, 0.3],
    },
    inkHueShift: 0.044,
    inkSaturation: { hair: 0.47 },
    lighting: { cloth: { mix: 0.22 }, hair: { mix: 0.1 } },
    width: { cloth: 0.0055, face: 0.003, hair: 0.005, metal: 0.005, skin: 0.0035 },
  },
  rim: {
    intensity: { cloth: 0.16, hair: 0.3, skin: 0.15 },
    silhouette: { body: 1, hair: 0.5 },
    tint: [0.79, 0.88, 1],
  },
  shadows: { hairOnFace: { strength: { face: 0.75 } } },
});

// The product look for captures that go through the showcase post preset:
// a little more rim and hair ring for the bloom to pick up.
const SHOWCASE_SETTINGS = Object.freeze(mergeSettings(CALL_ME_SENSEI_SETTINGS, {
  highlights: { hair: { intensity: 0.52 } },
  rim: { intensity: { cloth: 0.19, face: 0.15, hair: 0.34, skin: 0.17 } },
}));

const presetRegistry = new Map([
  [PRESET_DEFAULT, {
    builtIn: true,
    description: 'ToonLab\'s neutral character look: painted tones, one crisp terminator, face maps and ink lines at their measured defaults.',
    label: 'Default',
    settings: {},
  }],
  [PRESET_CALL_ME_SENSEI, {
    builtIn: true,
    description: 'The Call Me Sensei product look: softer sun hue, silhouette rim, masked cloth highlights and deeper, saturated ink.',
    label: 'Call Me Sensei',
    settings: CALL_ME_SENSEI_SETTINGS,
  }],
  [PRESET_SHOWCASE, {
    builtIn: true,
    description: 'Call Me Sensei tuned for the showcase post-processing preset (a touch more rim and hair ring for bloom).',
    label: 'Showcase',
    settings: SHOWCASE_SETTINGS,
  }],
]);

function presetKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Resolves a preset name (`'Call Me Sensei'`, `'call-me-sensei'`, …) to a registered id, else `'default'`. */
export function normalizeToonPresetName(value) {
  if (value === undefined || value === null || value === '') return PRESET_DEFAULT;
  const raw = String(value).trim();
  if (presetRegistry.has(raw)) return raw;
  const key = presetKey(raw);
  if (presetRegistry.has(key)) return key;
  const compact = key.replace(/_/g, '');
  for (const id of presetRegistry.keys()) {
    if (id.replace(/_/g, '').toLowerCase() === compact) return id;
  }
  return PRESET_DEFAULT;
}

export function getToonPresetIds() {
  return [...presetRegistry.keys()];
}

export function getToonPresetMetadata(id) {
  const presetId = normalizeToonPresetName(id);
  const preset = presetRegistry.get(presetId);
  return { builtIn: Boolean(preset.builtIn), description: preset.description, id: presetId, label: preset.label };
}

export function getToonPresetOptions() {
  return getToonPresetIds().map((id) => getToonPresetMetadata(id));
}

/** The preset's partial settings (relative to the defaults), deep-copied. */
export function getToonPresetDefinition(id) {
  const presetId = normalizeToonPresetName(id);
  const preset = presetRegistry.get(presetId);
  return {
    description: preset.description,
    id: presetId,
    label: preset.label,
    settings: mergeSettings(preset.settings),
  };
}

// ---------------------------------------------------------------------------
// Settings.

function groupInputs(source) {
  const inputs = {};
  for (const id of GROUP_BY_ID.keys()) {
    if (source[id] !== undefined && source[id] !== null) inputs[id] = source[id];
  }
  return inputs;
}

/**
 * Resolves complete settings: the defaults, then the preset's settings, then
 * any per-group overrides. Accepts a preset id, a settings object with
 * `preset`, or settings previously returned by this function.
 */
export function createToonSettings(input = {}) {
  const source = typeof input === 'string' ? { preset: input } : cleanPresetObject(input);
  const presetId = normalizeToonPresetName(source.preset);
  const preset = presetRegistry.get(presetId);
  const merged = mergeSettings(preset.settings, groupInputs(source));
  const settings = { preset: presetId, presetDescription: preset.description, presetLabel: preset.label };
  for (const group of GROUPS) {
    const value = merged[group.meta.id];
    settings[group.meta.id] = group.create(value === undefined ? null : value);
  }
  settings.materialRoles = isPlainPresetObject(source.materialRoles) || Array.isArray(source.materialRoles)
    ? source.materialRoles
    : null;
  return settings;
}

/** Default-preset settings for every group. */
export const TOON_SETTING_DEFAULTS = Object.freeze(createToonSettings());

/**
 * Keeps only schema-known, serialisable settings (coerced), dropping textures,
 * unknown groups and unknown keys. Partial input stays partial.
 */
export function sanitizeToonPresetSettings(settings = {}) {
  const source = cleanPresetObject(settings);
  const sanitized = {};
  for (const group of GROUPS) {
    if (source[group.meta.id] === undefined) continue;
    const values = sanitizeGroupValues(group.fields, source[group.meta.id]);
    if (Object.keys(values).length) sanitized[group.meta.id] = values;
  }
  return sanitized;
}

function collectUnknownToonSettingKeys(settings = {}) {
  const warnings = [];
  for (const [groupId, value] of Object.entries(cleanPresetObject(settings))) {
    if (groupId === 'preset' || groupId === 'materialRoles') continue;
    const group = GROUP_BY_ID.get(groupId);
    if (!group) {
      warnings.push(`Unknown settings group "${groupId}" was ignored.`);
      continue;
    }
    for (const { path, reason } of unknownGroupKeys(group.fields, value)) {
      warnings.push(reason === 'runtime'
        ? `Setting "${groupId}.${path}" is runtime-only and was ignored.`
        : `Unknown setting "${groupId}.${path}" was ignored.`);
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Preset documents.

export const TOON_PRESET_DOCUMENT_TYPE = 'toonlab/toon-preset';
export const TOON_PRESET_SCHEMA_VERSION = 2;

function normalizePresetDocumentId(value) {
  return String(value ?? '').trim();
}

/**
 * Validates a parsed toon preset document. Never throws. Documents written
 * before schema version 2 use the retired settings groups and are rejected;
 * they are not converted.
 */
export function validateToonPresetDocument(input) {
  if (isPlainPresetObject(input)) {
    const version = Number(input.version);
    if (!Number.isFinite(version) || version < TOON_PRESET_SCHEMA_VERSION) {
      return {
        errors: [
          `Toon preset document version ${Number.isFinite(version) ? version : '(missing)'} is not supported: ` +
          `version ${TOON_PRESET_SCHEMA_VERSION} replaced every shading group, and older documents are not converted. ` +
          'Re-create the preset from a built-in preset with the current settings groups.',
        ],
        ok: false,
        value: null,
        warnings: [],
      };
    }
  }
  return validateSettingsPresetDocument(input, {
    collectWarnings: collectUnknownToonSettingKeys,
    documentType: TOON_PRESET_DOCUMENT_TYPE,
    migrateDocument: (source) => ({ ...source, type: source.type ?? TOON_PRESET_DOCUMENT_TYPE }),
    normalizeId: normalizePresetDocumentId,
    sanitizeSettings: sanitizeToonPresetSettings,
    schemaVersion: TOON_PRESET_SCHEMA_VERSION,
  });
}

export function parseToonPresetDocument(input) {
  return parsePresetDocument(input, validateToonPresetDocument, { invalidJsonLabel: 'toon preset' });
}

/** Builds a validated preset document; `definition` carries `settings`, `label`, `description`. */
export function createToonPresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => (isPlainPresetObject(source.settings) ? source.settings : groupInputs(source)),
    documentType: TOON_PRESET_DOCUMENT_TYPE,
    schemaVersion: TOON_PRESET_SCHEMA_VERSION,
    validateDocument: validateToonPresetDocument,
  });
}

export function serializeToonPreset(idOrDocument, definition = {}, options = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createToonPresetDocument,
    pretty: options.pretty !== false,
  });
}

/**
 * Registers a preset usable anywhere a built-in one is. The definition is
 * sanitised through the document pipeline. Replacing an existing id needs
 * `overwrite`; the system style (`call_me_sensei`) is read-only.
 */
export function registerToonPreset(id, definition = {}, { overwrite = false } = {}) {
  const document = createToonPresetDocument(id, definition);
  const existing = presetRegistry.get(document.id);
  if (existing && isProtectedSystemStyleId(document.id)) {
    throw new Error(`System style "${document.id}" is read-only.`);
  }
  if (existing && !overwrite) {
    throw new Error(`Toon preset "${document.id}" is already registered; pass { overwrite: true } to replace it.`);
  }
  presetRegistry.set(document.id, {
    builtIn: false,
    description: document.description,
    label: document.label,
    settings: document.settings,
  });
  return getToonPresetDefinition(document.id);
}

/** Parses a serialised preset document and registers it. */
export function registerSerializedToonPreset(input, options = {}) {
  const parsed = parseToonPresetDocument(input);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  return registerToonPreset(parsed.value.id, parsed.value, options);
}
