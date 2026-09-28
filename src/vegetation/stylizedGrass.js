import * as THREE from 'three';

import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';
import { createGrassNodeMaterial } from '../shaders-tsl/grass.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import { applyVegetationShader } from './vegetationShaders.js';

export {
  GRASS_COLOR_PALETTES,
  applyGrassColorPalette,
  matchGrassColorPalette,
  resolveGrassColorPalette,
} from './grassPalettes.js';

const pushScratch = new THREE.Vector3();

function setSrgbColor(color, rgb) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function colorArray(value, fallback) {
  if (value?.isColor) return value.clone().convertLinearToSRGB().toArray();
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const color = new THREE.Color(value);
      // Public color arrays are authored sRGB values. THREE.Color stores
      // constructor inputs in linear working space; convert back before the
      // material's sRGB setter decodes them once.
      return color.convertLinearToSRGB().toArray();
    } catch {
      return fallback.slice();
    }
  }
  return fallback.slice();
}

function vectorArray(value, fallback, size) {
  const keys = ['x', 'y', 'z', 'w'];
  const read = (index) => {
    if (Array.isArray(value)) return Number(value[index]);
    if (value && typeof value === 'object') return Number(value[keys[index]]);
    return NaN;
  };
  const next = Array.from({ length: size }, (_, index) => read(index));
  return next.every(Number.isFinite) ? next : fallback.slice(0, size);
}

/**
 * Default grass-field settings. Every value equals the field's historical
 * hardcoded/constructor default, so `new StylizedGrassField({ placements })`
 * renders identically to previous releases.
 */
export const DEFAULT_GRASS_SETTINGS = Object.freeze({
  backlitStrength: 0.3,
  baseColor: Object.freeze([0.42, 0.68, 0.24]),
  bladeHeightRange: Object.freeze([0.16, 0.42]),
  bladeWidthRange: Object.freeze([0.05, 0.085]),
  bladesPerClump: 1,
  clumpRadius: 0.055,
  cloudShadowCoverage: 0.45,
  cloudShadowScale: 0.012,
  cloudShadowStrength: 0,
  cloudShadowVelocity: Object.freeze([0.02, 0.006]),
  groundAdoptHeight: 0.85,
  groundAdoptStrength: 0,
  groundAdoptTint: Object.freeze([1, 1, 1]),
  gustFrequency: 0.35,
  gustResponse: 1,
  gustSpeed: 1.6,
  leanStrength: 1,
  pushRadius: 0.9,
  shadowStrength: 0.9,
  shadowTint: Object.freeze([0.42, 0.47, 0.62]),
  skyColor: Object.freeze([0.62, 0.78, 0.95]),
  sunColor: Object.freeze([1.0, 0.96, 0.84]),
  sunDirection: Object.freeze([0.35, 0.72, 0.42]),
  tipColor: Object.freeze([0.74, 0.9, 0.42]),
  windDirection: Object.freeze([1, 0.3]),
  windResponse: 1,
  windSpeed: 1.0,
  windStrength: 0.16,
  washLift: 0,
  washOpacity: 1,
});

/** Document `type` discriminator for portable grass presets. */
export const GRASS_PRESET_DOCUMENT_TYPE = 'toonlab/grass-preset';

/** Current portable grass preset schema version. */
export const GRASS_PRESET_SCHEMA_VERSION = 2;

// Named grass presets: 'default' is the baseline; 'call_me_sensei' is the
// studio-managed signature look, curated and updated over releases.
// Community presets register alongside them via registerGrassPreset().
const CALL_ME_SENSEI_GRASS_SETTINGS = Object.freeze({
  backlitStrength: 0.38,
  baseColor: Object.freeze([0.172518, 0.317708, 0.052621]),
  bladeHeightRange: Object.freeze([0.38, 0.82]),
  bladeWidthRange: Object.freeze([0.065, 0.105]),
  bladesPerClump: 40,
  clumpRadius: 0.68,
  groundAdoptHeight: 0.88,
  groundAdoptStrength: 1,
  groundAdoptTint: Object.freeze([1, 1, 1]),
  leanStrength: 0.24,
  tipColor: Object.freeze([0.62, 0.84, 0.28]),
  washLift: 0.68,
  washOpacity: 0.82,
  windResponse: 0.55,
});

const grassPresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline meadow grass.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature meadow with ground-derived color, curated by Call Me Sensei and updated over releases.',
    label: 'Call Me Sensei',
    settings: CALL_ME_SENSEI_GRASS_SETTINGS,
  })],
  ['call_me_sensei_clump', Object.freeze({
    description: 'Paint-ready Call Me Sensei meadow clump: 40 overlapping curved blades with a broad planted footprint, ground-derived color, and three runtime LODs.',
    label: 'Call Me Sensei Clump',
    // Exact neutral adoption is the signature default: the sampled terrain
    // sets the planted palette without an exposure lift that can bleach roots.
    settings: CALL_ME_SENSEI_GRASS_SETTINGS,
  })],
  // Genshin-style clumped meadow, after StylizedStation's "ULTIMATE Guide to
  // Making Genshin Grass": several blades per placement splaying from a
  // shared base, strong root-to-tip gradient, soft height-masked wind, no
  // cast shadows. The up-facing lighting normal and gradient the tutorial
  // authors in Blender/ToonLab are already how this field shades.
  ['anime_clump', Object.freeze({
    description: 'Genshin-inspired clumped grass: 6 blades per placement rising from a shared base with varied heights, light tips over dark roots, gentle wind.',
    label: 'Anime Clump',
    settings: Object.freeze({
      backlitStrength: 0.4,
      baseColor: Object.freeze([0.21, 0.43, 0.14]),
      bladeHeightRange: Object.freeze([0.18, 0.5]),
      bladeWidthRange: Object.freeze([0.05, 0.09]),
      bladesPerClump: 6,
      clumpRadius: 0.055,
      tipColor: Object.freeze([0.67, 0.85, 0.34]),
    }),
  })],
]);
const BUILT_IN_GRASS_PRESET_IDS = new Set([
  'default',
  'call_me_sensei',
  'call_me_sensei_clump',
  'anime_clump',
]);

/**
 * Registers a named grass preset so it resolves in `createGrassSettings({
 * preset })` exactly like the built-ins. Accepts `{ label?, description?,
 * settings? }` or flat settings.
 */
export function registerGrassPreset(name, preset = {}, { overwrite = false } = {}) {
  const document = createGrassPresetDocument(name, preset);
  if (overwrite && isProtectedSystemStyleId(document.id) && grassPresetRegistry.has(document.id)) {
    throw new Error(`System style "${document.id}" is read-only.`);
  }
  if (!overwrite && grassPresetRegistry.has(document.id)) {
    throw new Error(`Grass preset "${document.id}" already exists.`);
  }
  const entry = Object.freeze({
    description: document.description,
    label: document.label,
    settings: Object.freeze({ ...document.settings }),
  });
  grassPresetRegistry.set(document.id, entry);
  return { description: entry.description, id: document.id, label: entry.label };
}

/** Lists registered grass presets as `{ id, label, description }` (for HUDs). */
export function getGrassPresetOptions() {
  return Array.from(grassPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

/** Removes a registered community/local preset. Built-in preset ids are protected. */
export function unregisterGrassPreset(name) {
  const id = normalizeGrassPresetId(name);
  if (!id || BUILT_IN_GRASS_PRESET_IDS.has(id)) return false;
  return grassPresetRegistry.delete(id);
}

/**
 * Validates, clamps, and merges partial grass options over
 * {@link DEFAULT_GRASS_SETTINGS}. Unknown keys are ignored; malformed values
 * fall back to their defaults. `createGrassSettings()` deep-equals the
 * defaults object.
 *
 * @param {Object} [options] Partial settings (legacy constructor options are
 *   the same flat shape, so they work unchanged). `preset` resolves a
 *   registered preset under the overrides.
 * @returns {Object} A complete, plain grass settings object.
 */
export function createGrassSettings(options = {}) {
  const source = typeof options === 'string' ? { preset: options } : cleanObject(options);
  const presetSettings = grassPresetRegistry.get(source.preset)?.settings;
  const base = presetSettings ? { ...DEFAULT_GRASS_SETTINGS, ...presetSettings } : DEFAULT_GRASS_SETTINGS;
  return {
    backlitStrength: finiteNumber(source.backlitStrength, base.backlitStrength, { min: 0 }),
    baseColor: colorArray(source.baseColor, base.baseColor),
    bladeHeightRange: vectorArray(source.bladeHeightRange, base.bladeHeightRange, 2),
    bladeWidthRange: vectorArray(source.bladeWidthRange, base.bladeWidthRange, 2),
    bladesPerClump: Math.round(finiteNumber(source.bladesPerClump, base.bladesPerClump, { min: 1, max: 64 })),
    clumpRadius: finiteNumber(source.clumpRadius, base.clumpRadius, { min: 0, max: 1 }),
    cloudShadowCoverage: finiteNumber(source.cloudShadowCoverage, base.cloudShadowCoverage, { min: 0, max: 1 }),
    cloudShadowScale: finiteNumber(source.cloudShadowScale, base.cloudShadowScale, { min: 0.0001 }),
    cloudShadowStrength: finiteNumber(source.cloudShadowStrength, base.cloudShadowStrength, { min: 0, max: 1 }),
    cloudShadowVelocity: vectorArray(source.cloudShadowVelocity, base.cloudShadowVelocity, 2),
    groundAdoptHeight: finiteNumber(source.groundAdoptHeight, base.groundAdoptHeight, { min: 0.01, max: 1 }),
    groundAdoptStrength: finiteNumber(source.groundAdoptStrength, base.groundAdoptStrength, { min: 0, max: 1 }),
    groundAdoptTint: colorArray(source.groundAdoptTint, base.groundAdoptTint),
    gustFrequency: finiteNumber(source.gustFrequency, base.gustFrequency, { min: 0 }),
    gustResponse: finiteNumber(source.gustResponse, base.gustResponse, { min: 0 }),
    gustSpeed: finiteNumber(source.gustSpeed, base.gustSpeed, { min: 0 }),
    leanStrength: finiteNumber(source.leanStrength, base.leanStrength, { min: 0, max: 2 }),
    pushRadius: finiteNumber(source.pushRadius, base.pushRadius, { min: 0 }),
    shadowStrength: finiteNumber(source.shadowStrength, base.shadowStrength, { min: 0, max: 1 }),
    shadowTint: colorArray(source.shadowTint, base.shadowTint),
    skyColor: colorArray(source.skyColor, base.skyColor),
    sunColor: colorArray(source.sunColor, base.sunColor),
    sunDirection: vectorArray(source.sunDirection, base.sunDirection, 3),
    tipColor: colorArray(source.tipColor, base.tipColor),
    windDirection: vectorArray(source.windDirection, base.windDirection, 2),
    windResponse: finiteNumber(source.windResponse, base.windResponse, { min: 0 }),
    windSpeed: finiteNumber(source.windSpeed, base.windSpeed),
    windStrength: finiteNumber(source.windStrength, base.windStrength, { min: 0 }),
    washLift: finiteNumber(source.washLift, base.washLift, { min: 0, max: 1 }),
    washOpacity: finiteNumber(source.washOpacity, base.washOpacity, { min: 0.1, max: 1 }),
  };
}

/**
 * Panel group metadata for the grass settings, in display order. Settings
 * themselves stay flat; each group lists which flat keys it owns via
 * {@link GRASS_SETTING_FIELD_SCHEMA}.
 */
export const GRASS_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Random blade dimensions baked into the instance attributes when the field is built. Construction-only.',
    id: 'blades',
    label: 'Blades',
  }),
  Object.freeze({
    description: 'Asset-level flexibility: how this grass responds when a scene supplies wind and gusts.',
    id: 'wind',
    label: 'Motion',
  }),
  Object.freeze({
    description: "The blades' coordinated base, tip, and material shadow colors — the grass's identity, whatever the scene lighting does. Magical blue grass welcome.",
    id: 'palette',
    label: 'Palette',
  }),
  Object.freeze({
    description: 'How the blades RESPOND to scene light — e.g. the backlit glow on blades between the camera and the sun.',
    id: 'lighting',
    label: 'Lighting',
  }),
  Object.freeze({
    description: 'Grass-material shadow strength and palette tint. The renderer and cloud-shadow fields themselves come from the scene.',
    id: 'shadows',
    label: 'Shadows',
  }),
  Object.freeze({
    description: 'Current sun direction/color and sky color supplied by the scene at runtime.',
    id: 'sceneLight',
    label: 'Scene Light',
    scene: true,
  }),
  Object.freeze({
    description: 'Current world wind and gust field supplied by weather or another scene system.',
    id: 'sceneWind',
    label: 'Scene Wind',
    scene: true,
  }),
  Object.freeze({
    description: 'Current drifting cloud-shadow field shared across terrain, water, and vegetation.',
    id: 'sceneCloudShadow',
    label: 'Cloud Field',
    scene: true,
  }),
  Object.freeze({
    description: 'Current push target and influence radius supplied per scene or grass instance.',
    id: 'interaction',
    label: 'Interaction',
    scene: true,
  }),
]);

const GRASS_FIELD_DEFINITIONS = Object.freeze({
  blades: {
    bladeHeightRange: {
      description: 'Min/max blade height in meters for placements without an explicit height. Construction-only: baked into instance attributes.',
      label: 'Blade Height Range',
      type: 'vector2',
    },
    bladeWidthRange: {
      description: 'Min/max blade width in meters for placements without an explicit width. Construction-only: baked into instance attributes.',
      label: 'Blade Width Range',
      type: 'vector2',
    },
    bladesPerClump: {
      description: 'Blades grown from each placement or authored into each paintable clump mesh. 1 keeps the classic lone-blade field; the first-party meadow clump uses 40. Construction-only.',
      label: 'Blades Per Clump',
      range: { max: 64, min: 1, step: 1 },
      type: 'number',
    },
    clumpRadius: {
      description: 'Base scatter radius in meters for the extra blades of a clump. Small values read as one tuft; larger values loosen the clump. Construction-only.',
      label: 'Clump Radius',
      range: { max: 1, min: 0, step: 0.005 },
      type: 'number',
    },
    leanStrength: {
      description: 'Authored static splay of each blade before live wind and interaction. Low values form clean upright meadow strokes; high values form wild bent grass.',
      label: 'Static Lean',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  wind: {
    windResponse: {
      description: 'Asset flexibility multiplier applied to the current scene wind strength. 1 preserves the authored baseline; 0 keeps blades still.',
      label: 'Wind Response',
      range: { max: 8, min: 0, step: 0.01 },
      type: 'number',
    },
    gustResponse: {
      description: 'How strongly this grass follows gust bands relative to its regular wind sway.',
      label: 'Gust Response',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  sceneWind: {
    windDirection: {
      description: 'Current horizontal (XZ) heading the world wind blows toward.',
      label: 'Wind Direction',
      type: 'vector2',
    },
    windSpeed: {
      description: 'Current temporal speed of the world wind.',
      label: 'Wind Speed',
      range: { max: 4, min: 0, step: 0.01 },
      type: 'number',
    },
    windStrength: {
      description: 'Current world wind amplitude before the asset response multiplier.',
      label: 'Wind Strength',
      range: { max: 1, min: 0, step: 0.005 },
      type: 'number',
    },
    gustFrequency: {
      description: 'Current spatial frequency of the world gust bands.',
      label: 'Gust Frequency',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
    gustSpeed: {
      description: 'Current travel speed of the world gust bands.',
      label: 'Gust Speed',
      range: { max: 6, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  palette: {
    baseColor: {
      description: 'Blade color at the root.',
      label: 'Base Color',
      type: 'color',
    },
    tipColor: {
      description: 'Blade color at the tip; blades gradient from base to tip.',
      label: 'Tip Color',
      type: 'color',
    },
    groundAdoptStrength: {
      description: 'How strongly blades adopt the terrain color under them from the scene ground field (0 keeps the authored palette). Needs a world running the ground-field pass.',
      label: 'Ground Adoption',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    groundAdoptHeight: {
      description: 'Blade fraction the adopted ground color reaches before fading back to the palette tips.',
      label: 'Ground Adopt Height',
      range: { max: 1, min: 0.01, step: 0.01 },
      type: 'number',
    },
    groundAdoptTint: {
      description: 'Multiplier applied to the adopted ground color — lift or warm the sampled terrain albedo before it colors the blades.',
      label: 'Ground Adopt Tint',
      type: 'color',
    },
    washLift: {
      description: 'Procedural watercolor wash lift. Irregularly pulls blade strokes toward the active sun color without requiring a texture.',
      label: 'Watercolor Wash Lift',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    washOpacity: {
      description: 'Layer opacity of the procedural watercolor blade strokes. Values below 1 soften each stroke against the terrain and sky.',
      label: 'Watercolor Stroke Opacity',
      range: { max: 1, min: 0.1, step: 0.01 },
      type: 'number',
    },
  },
  lighting: {
    backlitStrength: {
      description: 'Translucent backlight boost when the camera looks toward the sun through the blades.',
      label: 'Backlit Strength',
      range: { max: 2, min: 0, step: 0.01 },
      type: 'number',
    },
  },
  sceneLight: {
    sunDirection: {
      description: 'World-space direction toward the sun (normalized on apply). Match your main directional light.',
      label: 'Sun Direction',
      type: 'vector3',
    },
    sunColor: {
      description: 'Sunlight tint applied to lit blades.',
      label: 'Sun Color',
      type: 'color',
    },
    skyColor: {
      description: 'Ambient sky tint mixed into shaded blades.',
      label: 'Sky Color',
      type: 'color',
    },
  },
  shadows: {
    shadowStrength: {
      description: 'How strongly renderer shadow maps (trees, rocks, the character) darken blades.',
      label: 'Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    shadowTint: {
      description: 'Grass material color approached in full scene or cloud shadow. Palette presets set it with base/tip colors; the IP-wide vegetation shadow treatment still layers over it.',
      label: 'Shadow Tint',
      type: 'color',
    },
  },
  sceneCloudShadow: {
    cloudShadowStrength: {
      description: 'Current strength of the shared procedural cloud-shadow field. 0 disables it.',
      label: 'Cloud Shadow Strength',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowCoverage: {
      description: 'Current fraction of the world covered by cloud shadow.',
      label: 'Cloud Shadow Coverage',
      range: { max: 1, min: 0, step: 0.01 },
      type: 'number',
    },
    cloudShadowScale: {
      description: 'Current world-to-noise scale of the shared cloud pattern.',
      label: 'Cloud Shadow Scale',
      range: { max: 0.1, min: 0.001, step: 0.001 },
      type: 'number',
    },
    cloudShadowVelocity: {
      description: 'Current cloud-shadow drift in noise-space units per second.',
      label: 'Cloud Shadow Velocity',
      type: 'vector2',
    },
  },
  interaction: {
    pushRadius: {
      description: 'Current radius in meters around the scene push target.',
      label: 'Push Radius',
      range: { max: 3, min: 0, step: 0.01 },
      type: 'number',
    },
  },
});

function createGrassFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_GRASS_SETTINGS[key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: field.serializable ?? !group.scene,
    type: field.type,
  });
}

/**
 * Field metadata (id/group/key/label/description/type/range/defaultValue/
 * serializable) per settings group, in the shape consumed by
 * `createSettingsPanel`. Keys are the flat {@link DEFAULT_GRASS_SETTINGS}
 * keys.
 */
export const GRASS_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    GRASS_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(GRASS_FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createGrassFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

const GRASS_FIELDS_BY_KEY = Object.freeze(Object.fromEntries(
  Object.values(GRASS_SETTING_FIELD_SCHEMA)
    .flatMap((fields) => Object.entries(fields)),
));

function normalizeGrassPresetId(value) {
  return String(value ?? '').trim();
}

function collectTopLevelGrassSettings(source) {
  const input = cleanObject(source);
  return Object.fromEntries(
    Object.keys(GRASS_FIELDS_BY_KEY)
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, input[key]]),
  );
}

function collectGrassPresetWarnings(settings = {}) {
  const warnings = [];
  for (const key of Object.keys(cleanObject(settings))) {
    const field = GRASS_FIELDS_BY_KEY[key];
    if (!field) warnings.push(`Unknown grass setting "${key}" was ignored.`);
    else if (!field.serializable) {
      warnings.push(`Grass setting "${key}" is scene-owned and was not stored in the preset.`);
    }
  }
  return warnings;
}

/**
 * Normalizes a grass preset into complete JSON-safe product settings. Scene
 * inputs supplied by the active sun/sky rig are deliberately excluded.
 */
export function sanitizeGrassPresetSettings(settings = {}) {
  const knownSettings = collectTopLevelGrassSettings(settings);
  const normalized = createGrassSettings(knownSettings);
  return Object.fromEntries(
    Object.entries(GRASS_FIELDS_BY_KEY)
      .filter(([, field]) => field.serializable)
      .map(([key]) => [key, normalized[key]]),
  );
}

function migrateGrassPresetDocument(input) {
  const source = cleanObject(input);
  const numericVersion = Number(source.version ?? source.schemaVersion ?? 0);
  const version = Number.isFinite(numericVersion) ? Math.round(numericVersion) : 0;
  if (version > GRASS_PRESET_SCHEMA_VERSION) return { ...source, version };
  const nestedSettings = cleanObject(source.settings);
  const settings = Object.keys(nestedSettings).length > 0
    ? { ...nestedSettings }
    : collectTopLevelGrassSettings(source);

  // Schema v1 treated windStrength as a portable grass value. Preserve that
  // authored look by converting it to the v2 species response relative to the
  // historical world-wind default. Keep the original key so validation also
  // explains that the live scene field is no longer stored. A v2 document is
  // never reinterpreted this way.
  if (version <= 1 && settings.windResponse === undefined
    && Number.isFinite(Number(settings.windStrength))) {
    settings.windResponse = Math.max(Number(settings.windStrength), 0)
      / DEFAULT_GRASS_SETTINGS.windStrength;
  }
  return {
    description: source.description ?? '',
    id: source.id ?? source.name ?? source.preset ?? '',
    label: source.label ?? source.title ?? source.name ?? source.id ?? '',
    settings,
    type: source.type ?? GRASS_PRESET_DOCUMENT_TYPE,
    version: GRASS_PRESET_SCHEMA_VERSION,
  };
}

/** Validates and normalizes a portable grass preset document. Never throws. */
export function validateGrassPresetDocument(input) {
  if (cleanObject(input).type !== undefined && input.type !== GRASS_PRESET_DOCUMENT_TYPE) {
    return {
      errors: [`Grass preset type must be "${GRASS_PRESET_DOCUMENT_TYPE}".`],
      ok: false,
      value: null,
      warnings: [],
    };
  }
  return validateSettingsPresetDocument(input, {
    collectWarnings: collectGrassPresetWarnings,
    documentType: GRASS_PRESET_DOCUMENT_TYPE,
    migrateDocument: migrateGrassPresetDocument,
    normalizeId: normalizeGrassPresetId,
    sanitizeSettings: sanitizeGrassPresetSettings,
    schemaVersion: GRASS_PRESET_SCHEMA_VERSION,
  });
}

/** Parses JSON text or an object into a validated grass preset document. */
export function parseGrassPresetDocument(input) {
  return parsePresetDocument(input, validateGrassPresetDocument, {
    invalidJsonLabel: 'grass preset',
  });
}

/** Creates a canonical, versioned grass preset document. */
export function createGrassPresetDocument(id, definition = {}) {
  return createSettingsPresetDocument(id, definition, {
    collectSettings: (source) => source.settings ?? collectTopLevelGrassSettings(source),
    documentType: GRASS_PRESET_DOCUMENT_TYPE,
    schemaVersion: GRASS_PRESET_SCHEMA_VERSION,
    validateDocument: validateGrassPresetDocument,
  });
}

/** Serializes a grass preset id/definition or document-like object as JSON. */
export function serializeGrassPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createGrassPresetDocument,
    pretty,
  });
}

/** Registers a portable grass document, overwriting an existing id by default. */
export function registerSerializedGrassPreset(input, options = {}) {
  const result = parseGrassPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerGrassPreset(result.value.id, result.value, {
    overwrite: options.overwrite ?? true,
  });
}

// Dense instanced grass: procedural tapered blades with wind sway and a
// push-away radius around a character. One draw call for the whole field;
// emitting is a one-time attribute fill, animation is entirely in the vertex
// shader. No texture assets.
//
//   const grass = new StylizedGrassField({
//     placements: points.map((p) => ({ x: p.x, y: terrainHeight(p), z: p.z })),
//   });
//   scene.add(grass);
//   grass.setPushTarget(characterObject3D);
//   grass.update(delta);                     // each frame
//   grass.applySettings({ windStrength: 0.3, cloudShadowStrength: 0.5 });
//
// Options are a flat settings object (see DEFAULT_GRASS_SETTINGS) plus
// `placements`; legacy individual constructor options are the same keys, so
// existing callers keep working unchanged.
export class StylizedGrassField extends THREE.Mesh {
  constructor(options = {}) {
    const {
      groundField = true,
      placements = [],
      styleTarget = {},
      vegetationShader = null,
    } = cleanObject(options);
    const settings = createGrassSettings(options);
    const { bladeHeightRange, bladeWidthRange } = settings;

    const blade = new THREE.PlaneGeometry(1, 1, 1, 3);
    blade.translate(0, 0.5, 0);

    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = blade.index;
    geometry.setAttribute('position', blade.attributes.position);
    geometry.setAttribute('uv', blade.attributes.uv);

    // Each placement grows `bladesPerClump` instances. The first blade sits
    // on the placement itself; the rest scatter within `clumpRadius` so the
    // tuft shares a base, and the shader's per-blade facing + static lean
    // splays them apart like a hand-modeled clump.
    const { bladesPerClump, clumpRadius } = settings;
    const bladeCount = placements.length * bladesPerClump;
    const count = Math.max(bladeCount, 1);
    const origins = new Float32Array(count * 3);
    const infos = new Float32Array(count * 4);
    let bladeIndex = 0;
    for (const placement of placements) {
      for (let clumpBlade = 0; clumpBlade < bladesPerClump; clumpBlade += 1) {
        const spreadAngle = Math.random() * Math.PI * 2;
        const spread = clumpBlade === 0 ? 0 : Math.sqrt(Math.random()) * clumpRadius;
        origins[bladeIndex * 3] = (placement.x ?? 0) + Math.cos(spreadAngle) * spread;
        origins[bladeIndex * 3 + 1] = placement.y ?? 0;
        origins[bladeIndex * 3 + 2] = (placement.z ?? 0) + Math.sin(spreadAngle) * spread;
        infos[bladeIndex * 4] = placement.height ??
          THREE.MathUtils.lerp(bladeHeightRange[0], bladeHeightRange[1], Math.random());
        infos[bladeIndex * 4 + 1] = placement.phase ?? Math.random();
        infos[bladeIndex * 4 + 2] = placement.width ??
          THREE.MathUtils.lerp(bladeWidthRange[0], bladeWidthRange[1], Math.random());
        infos[bladeIndex * 4 + 3] = Math.random() * Math.PI * 2;
        bladeIndex += 1;
      }
    }
    geometry.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute('iInfo', new THREE.InstancedBufferAttribute(infos, 4));
    geometry.instanceCount = bladeCount;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    const material = createGrassNodeMaterial(settings, vegetationShader, { groundField });
    setSrgbColor(material.uniforms.uBaseColor.value, settings.baseColor);
    setSrgbColor(material.uniforms.uTipColor.value, settings.tipColor);
    setSrgbColor(material.uniforms.uSunColor.value, settings.sunColor);
    setSrgbColor(material.uniforms.uSkyColor.value, settings.skyColor);
    setSrgbColor(material.uniforms.uShadowTint.value, settings.shadowTint);

    super(geometry, material);
    this.name = 'StylizedGrassField';
    markFactoryStyleMaterial(this.material, 'GrassBlade');
    attachFactoryStyleTarget(this, 'vegetation.grass', {
      targetId: 'toonlab/grass',
      ...styleTarget,
      materials: {
        assignments: { GrassBlade: { roles: ['grassBlade'] } },
        ...(styleTarget.materials ?? {}),
      },
    });
    this.frustumCulled = false;
    this.receiveShadow = true;
    this.pushTarget = null;
    this.settings = settings;
  }

  /**
   * Runtime re-tune: merges `options` into the current settings and pushes
   * every material-driven value (asset response, current scene fields,
   * palette, sun, shadows, and push radius)
   * into the uniforms. `bladeHeightRange` / `bladeWidthRange` /
   * `bladesPerClump` / `clumpRadius` are baked into the instance attributes
   * at construction and are construction-only; new values are stored but do
   * not reshape existing blades.
   *
   * @param {Object} [options] Partial flat settings, same keys as
   *   {@link DEFAULT_GRASS_SETTINGS}.
   * @returns {Object} The updated settings object.
   */
  applySettings(options = {}) {
    const merged = { ...this.settings };
    for (const [key, value] of Object.entries(cleanObject(options))) {
      if (value !== undefined) merged[key] = value;
    }
    const settings = createGrassSettings(merged);
    this.settings = settings;

    const uniforms = this.material.uniforms;
    uniforms.uShadowStrength.value = settings.shadowStrength;
    uniforms.uWindDirection.value.set(settings.windDirection[0], settings.windDirection[1]);
    uniforms.uWindSpeed.value = settings.windSpeed;
    uniforms.uWindStrength.value = settings.windStrength;
    uniforms.uGustFrequency.value = settings.gustFrequency;
    uniforms.uGustResponse.value = settings.gustResponse;
    uniforms.uGustSpeed.value = settings.gustSpeed;
    uniforms.uStaticLean.value = settings.leanStrength;
    uniforms.uWindResponse.value = settings.windResponse;
    uniforms.uPushRadius.value = settings.pushRadius;
    uniforms.uGroundAdoptStrength.value = settings.groundAdoptStrength;
    uniforms.uGroundAdoptHeight.value = settings.groundAdoptHeight;
    // Multiplier data, not an sRGB color — no colorspace conversion.
    uniforms.uGroundAdoptTint.value.setRGB(...settings.groundAdoptTint);
    uniforms.uWashLift.value = settings.washLift;
    uniforms.uWashOpacity.value = settings.washOpacity;
    uniforms.uBacklitStrength.value = settings.backlitStrength;
    uniforms.uCloudShadowStrength.value = settings.cloudShadowStrength;
    uniforms.uCloudShadowCoverage.value = settings.cloudShadowCoverage;
    uniforms.uCloudShadowScale.value = settings.cloudShadowScale;
    uniforms.uCloudShadowVelocity.value.set(
      settings.cloudShadowVelocity[0], settings.cloudShadowVelocity[1]);
    uniforms.uSunDirection.value.set(...settings.sunDirection).normalize();
    setSrgbColor(uniforms.uBaseColor.value, settings.baseColor);
    setSrgbColor(uniforms.uTipColor.value, settings.tipColor);
    setSrgbColor(uniforms.uSunColor.value, settings.sunColor);
    setSrgbColor(uniforms.uSkyColor.value, settings.skyColor);
    setSrgbColor(uniforms.uShadowTint.value, settings.shadowTint);
    this.material.transparent = settings.washOpacity < 0.999;
    this.material.depthWrite = true;
    this.material.needsUpdate = true;
    return this.settings;
  }

  setWind({ direction, speed, strength, gustFrequency, gustSpeed } = {}) {
    const uniforms = this.material.uniforms;
    if (direction !== undefined) {
      const next = vectorArray(direction, this.settings.windDirection, 2);
      uniforms.uWindDirection.value.set(next[0], next[1]);
    }
    if (speed !== undefined) uniforms.uWindSpeed.value = finiteNumber(speed, uniforms.uWindSpeed.value);
    if (strength !== undefined) uniforms.uWindStrength.value = finiteNumber(strength, uniforms.uWindStrength.value, { min: 0 });
    if (gustFrequency !== undefined) uniforms.uGustFrequency.value = finiteNumber(gustFrequency, uniforms.uGustFrequency.value, { min: 0 });
    if (gustSpeed !== undefined) uniforms.uGustSpeed.value = finiteNumber(gustSpeed, uniforms.uGustSpeed.value, { min: 0 });
    return this;
  }

  setSun({ direction, color, intensity, sky, skyIntensity } = {}) {
    const uniforms = this.material.uniforms;
    if (direction !== undefined) {
      const next = vectorArray(direction, this.settings.sunDirection, 3);
      uniforms.uSunDirection.value.set(...next).normalize();
    }
    if (color !== undefined) setSrgbColor(uniforms.uSunColor.value, colorArray(color, this.settings.sunColor));
    if (sky !== undefined) setSrgbColor(uniforms.uSkyColor.value, colorArray(sky, this.settings.skyColor));
    if (Number.isFinite(intensity) && uniforms.uSunIntensity) {
      uniforms.uSunIntensity.value = Math.max(intensity, 0);
    }
    if (Number.isFinite(skyIntensity) && uniforms.uSkyIntensity) {
      uniforms.uSkyIntensity.value = Math.max(skyIntensity, 0);
    }
    return this;
  }

  // Scene-shadow response: strength lerps the renderer shadow mask, tint is
  // the color a fully shadowed blade is multiplied by.
  setSceneShadow({ strength, tint } = {}) {
    this.applySettings({
      shadowStrength: strength,
      shadowTint: tint,
    });
    return this;
  }

  // Drifting procedural cloud shadows over the field. strength 0 disables.
  // velocity is uv-space drift per second (worldDrift = velocity / scale).
  setCloudShadow({ strength, coverage, scale, velocity } = {}) {
    const uniforms = this.material.uniforms;
    if (strength !== undefined) uniforms.uCloudShadowStrength.value = finiteNumber(strength, uniforms.uCloudShadowStrength.value, { min: 0, max: 1 });
    if (coverage !== undefined) uniforms.uCloudShadowCoverage.value = finiteNumber(coverage, uniforms.uCloudShadowCoverage.value, { min: 0, max: 1 });
    if (scale !== undefined) uniforms.uCloudShadowScale.value = finiteNumber(scale, uniforms.uCloudShadowScale.value, { min: 0.0001 });
    if (velocity !== undefined) {
      const next = vectorArray(velocity, this.settings.cloudShadowVelocity, 2);
      uniforms.uCloudShadowVelocity.value.set(next[0], next[1]);
    }
    return this;
  }

  /** Current world surface state. Responses remain owned by the shader/material profile. */
  setSurfaceWeather({ wetness, snowCover } = {}) {
    const uniforms = this.material.uniforms;
    if (uniforms.uWetness && wetness !== undefined) {
      uniforms.uWetness.value = finiteNumber(wetness, uniforms.uWetness.value, { min: 0, max: 1 });
    }
    if (uniforms.uSnowCover && snowCover !== undefined) {
      uniforms.uSnowCover.value = finiteNumber(snowCover, uniforms.uSnowCover.value, { min: 0, max: 1 });
    }
    return this;
  }

  setVegetationShader(profile) {
    return applyVegetationShader(this, profile);
  }

  // Collapse blades between start and end meters from the camera so distant,
  // fog-swallowed grass stops costing fill rate. Pass nothing to disable.
  setDistanceFade({ start = 1e6, end } = {}) {
    const uniforms = this.material.uniforms;
    uniforms.uFadeStart.value = start;
    uniforms.uFadeEnd.value = Number.isFinite(end) ? Math.max(end, start + 0.01) : start + 1;
    return this;
  }

  // target: Object3D | (outVector3) => position | { x, y, z } | null.
  setPushTarget(target) {
    this.pushTarget = target;
    return this;
  }

  /** Sets the current scene/instance interaction radius without editing the asset preset. */
  setPushRadius(radius) {
    const uniforms = this.material.uniforms;
    uniforms.uPushRadius.value = finiteNumber(radius, uniforms.uPushRadius.value, { min: 0 });
    return this;
  }

  update(delta) {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
    const target = this.pushTarget;
    if (!target) {
      uniforms.uPushPosition.value.set(0, -1e5, 0);
    } else if (typeof target === 'function') {
      const resolved = target(pushScratch);
      if (resolved && Number.isFinite(resolved.x)) uniforms.uPushPosition.value.copy(resolved);
    } else if (target.isObject3D) {
      uniforms.uPushPosition.value.copy(target.getWorldPosition(pushScratch));
    } else if (Number.isFinite(target.x)) {
      uniforms.uPushPosition.value.set(target.x, target.y ?? 0, target.z ?? 0);
    }
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
