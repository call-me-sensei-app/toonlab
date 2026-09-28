// Landscape material preset — the SHAREABLE style slice of a landscape:
// layer tints, macro variation, and per-layer texture refs. Heights, splat
// weights, and foliage instances are project data and are deliberately NOT
// part of this document (style-first contract: styles restyle any project,
// they never carry world content).

import {
  createLandscapeSettings,
  DEFAULT_LANDSCAPE_SETTINGS,
} from './landscapeSettings.js';
import { sanitizeMaterialLayers } from './landscapeLayerTextures.js';

export const LANDSCAPE_MATERIAL_PRESET_DOCUMENT_TYPE = 'toonlab/landscape-material-preset';
export const LANDSCAPE_MATERIAL_PRESET_SCHEMA_VERSION = 1;

/** Settings keys that belong to the material style (not brush/stage). */
export const LANDSCAPE_MATERIAL_SETTING_KEYS = Object.freeze([
  'grassTint', 'dirtTint', 'rockTint', 'sandTint', 'macroNoiseAmount', 'macroNoiseScale',
]);

function materialSettingsOnly(settings) {
  const full = createLandscapeSettings(settings);
  return Object.fromEntries(LANDSCAPE_MATERIAL_SETTING_KEYS.map((key) => [key, full[key]]));
}

export function createLandscapeMaterialPresetDocument(id, {
  label = 'Landscape material',
  settings = {},
  materialLayers = null,
} = {}) {
  return {
    type: LANDSCAPE_MATERIAL_PRESET_DOCUMENT_TYPE,
    version: LANDSCAPE_MATERIAL_PRESET_SCHEMA_VERSION,
    id: String(id || 'landscape_material'),
    label: String(label),
    settings: materialSettingsOnly(settings),
    materialLayers: sanitizeMaterialLayers(materialLayers),
  };
}

export function serializeLandscapeMaterialPreset(id, options) {
  return JSON.stringify(createLandscapeMaterialPresetDocument(id, options), null, 2);
}

/** Validates a material preset document (JSON text or object). */
export function parseLandscapeMaterialPresetDocument(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      return { ok: false, errors: [`Not valid JSON: ${error.message}`] };
    }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Document must be a JSON object.'] };
  }
  if (raw.type !== LANDSCAPE_MATERIAL_PRESET_DOCUMENT_TYPE) {
    return {
      ok: false,
      errors: [`Expected type "${LANDSCAPE_MATERIAL_PRESET_DOCUMENT_TYPE}", received "${raw.type}".`],
    };
  }
  if (Number(raw.version) > LANDSCAPE_MATERIAL_PRESET_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`Document version ${raw.version} is newer than this runtime (${LANDSCAPE_MATERIAL_PRESET_SCHEMA_VERSION}).`],
    };
  }
  return {
    ok: true,
    value: {
      id: typeof raw.id === 'string' ? raw.id : 'landscape_material',
      label: typeof raw.label === 'string' ? raw.label : 'Landscape material',
      settings: materialSettingsOnly({ ...DEFAULT_LANDSCAPE_SETTINGS, ...(raw.settings ?? {}) }),
      materialLayers: sanitizeMaterialLayers(raw.materialLayers),
    },
  };
}
