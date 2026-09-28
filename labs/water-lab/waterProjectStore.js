import { writeRequiredLocalJson } from '../shared/browserStorage.js';
// localStorage persistence for Water Lab: the autosaved working document and
// the user's saved preset library. Presets are stored as validated
// toonlab/water-preset documents (the serializable interchange shape), so
// cloud sync and export/import move them verbatim.

import {
  createWaterSettings,
  validateWaterPresetDocument,
} from '../../src/water/index.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
} from '../../src/core/systemStylePolicy.js';

const DOCUMENT_KEY = 'toonlab.water-lab.document.v1';
const PRESETS_KEY = 'toonlab.water-lab.presets.v1';
const SCENE_SETTINGS_KEY = 'toonlab.water-lab.scene-settings.v1';
const LOCAL_PRESET_LIMIT = 60;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage never breaks editing
  }
}

function read(key) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch { /* quota/private mode: editing continues unsaved */ }
}

export function loadWaterDocument() {
  const saved = read(DOCUMENT_KEY);
  if (!saved || typeof saved !== 'object' || !saved.settings) return null;
  const legacyStylePreset = saved.presetId === 'call_me_sensei' || saved.presetId === 'call-me-sensei';
  const inferredStyle = saved.settings?.style
    ?? (legacyStylePreset || saved.settings?.colorTone === 'anime' ? 'call_me_sensei' : 'default');
  const legacyMode = ['mirror', 'calm', 'lake', 'river', 'coast', 'ocean', 'storm']
    .includes(saved.settings?.mode) ? saved.settings.mode : 'lake';
  return {
    name: typeof saved.name === 'string' ? saved.name : 'Untitled water',
    presetId: legacyStylePreset ? legacyMode : (saved.presetId ?? null),
    styleId: saved.styleId ?? inferredStyle,
    settings: createWaterSettings(saved.settings),
  };
}

export function loadWaterSceneSettings() { return read(SCENE_SETTINGS_KEY); }
export function saveWaterSceneSettings(settings) { write(SCENE_SETTINGS_KEY,settings); }

export function saveWaterDocument({ name, presetId, settings, styleId = 'default' }) {
  write(DOCUMENT_KEY, { name, presetId, settings, styleId });
}

export function clearWaterDocument() {
  try {
    storage()?.removeItem(DOCUMENT_KEY);
  } catch { /* ignore */ }
}

/** User preset library: an array of water-preset documents, newest first. */
export function loadLocalWaterPresets() {
  const list = read(PRESETS_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => validateWaterPresetDocument(entry))
    .filter((result) => result.ok)
    .map((result) => result.value)
    .filter((entry) => !isProtectedSystemStyleId(entry.id));
}

export function upsertLocalWaterPreset(document) {
  const result = validateWaterPresetDocument(document);
  if (!result.ok) return null;
  assertUserStyleId(result.value.id);
  const list = loadLocalWaterPresets().filter((entry) => entry.id !== result.value.id);
  list.unshift(result.value);
  writeRequiredLocalJson(PRESETS_KEY, list.slice(0, LOCAL_PRESET_LIMIT));
  return result.value;
}

export function deleteLocalWaterPreset(id) {
  if (isProtectedSystemStyleId(id)) return false;
  writeRequiredLocalJson(PRESETS_KEY, loadLocalWaterPresets().filter((entry) => entry.id !== id));
  return true;
}
