import { applyDebrisStyle, createDebrisSettings } from '../../src/debrisgen/index.js';

const DOCUMENT_KEY = 'toonlab.debris-lab.document.v1';
const PRESETS_KEY = 'toonlab.debris-lab.presets.v1';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key, fallback) {
  try {
    const value = storage()?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is a convenience; private browsing must not block editing.
  }
}

export function loadDebrisDocument() {
  const saved = read(DOCUMENT_KEY, null);
  if (!saved?.settings) return null;
  const legacyStylePreset = saved.presetId === 'call_me_sensei' || saved.presetId === 'call-me-sensei';
  const styleId = saved.styleId || (legacyStylePreset ? 'call_me_sensei' : 'default');
  const baseSettings = createDebrisSettings(saved.baseSettings ?? saved.settings);
  return {
    baseSettings,
    name: String(saved.name || 'Untitled debris'),
    presetId: legacyStylePreset ? 'bleached-driftwood' : (saved.presetId || null),
    settings: saved.baseSettings
      ? createDebrisSettings(saved.settings)
      : applyDebrisStyle(baseSettings, styleId),
    styleId,
  };
}

export function saveDebrisDocument(document) {
  write(DOCUMENT_KEY, document);
}

export function clearDebrisDocument() {
  try {
    storage()?.removeItem(DOCUMENT_KEY);
  } catch { /* optional persistence */ }
}

export function loadLocalDebrisPresets() {
  const presets = read(PRESETS_KEY, []);
  if (!Array.isArray(presets)) return [];
  return presets
    .filter((entry) => entry?.id && entry?.settings)
    .map((entry) => ({
      ...entry,
      settings: createDebrisSettings(entry.settings),
      type: entry.settings.asset.type,
      variant: entry.settings.asset.variant,
    }));
}

export function upsertLocalDebrisPreset(preset) {
  const presets = loadLocalDebrisPresets();
  const index = presets.findIndex((entry) => entry.id === preset.id);
  if (index >= 0) presets[index] = preset;
  else presets.unshift(preset);
  write(PRESETS_KEY, presets.slice(0, 60));
  return preset;
}

export function deleteLocalDebrisPreset(id) {
  write(PRESETS_KEY, loadLocalDebrisPresets().filter((entry) => entry.id !== id));
}
