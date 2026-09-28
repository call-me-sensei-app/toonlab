import { createPropRecipeDocument, createPropSettings } from '../../src/propgen/index.js';

const DOCUMENT_KEY = 'toonlab.prop-lab.document.v1';
const PRESETS_KEY = 'toonlab.prop-lab.presets.v1';

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

export function loadPropDocument() {
  const saved = read(DOCUMENT_KEY, null);
  if (!saved?.settings) return null;
  return {
    name: String(saved.name || 'Untitled prop'),
    presetId: saved.presetId || null,
    settings: createPropSettings(saved.settings),
  };
}

export function savePropDocument(document) {
  write(DOCUMENT_KEY, document);
}

export function clearPropDocument() {
  try {
    storage()?.removeItem(DOCUMENT_KEY);
  } catch { /* optional persistence */ }
}

// Local presets carry a full recipe document so they share the built-in
// preset shape ({ id, label, description, recipe }) — one apply path.
export function loadLocalPropPresets() {
  const presets = read(PRESETS_KEY, []);
  if (!Array.isArray(presets)) return [];
  return presets
    .filter((entry) => entry?.id && entry?.recipe?.settings)
    .map((entry) => ({
      ...entry,
      recipe: createPropRecipeDocument(entry.recipe.settings, { name: entry.label }),
      type: entry.recipe.settings.asset.type,
      variant: entry.recipe.settings.asset.variant,
    }));
}

export function upsertLocalPropPreset(preset) {
  const presets = loadLocalPropPresets();
  const index = presets.findIndex((entry) => entry.id === preset.id);
  if (index >= 0) presets[index] = preset;
  else presets.unshift(preset);
  write(PRESETS_KEY, presets.slice(0, 60));
  return preset;
}

export function deleteLocalPropPreset(id) {
  write(PRESETS_KEY, loadLocalPropPresets().filter((entry) => entry.id !== id));
}
