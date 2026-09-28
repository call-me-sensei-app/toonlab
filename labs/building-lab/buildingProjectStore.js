import { buildingRecipeFromSettings, createBuildingSettings } from '../../src/buildinggen/index.js';

const DOCUMENT_KEY = 'toonlab.building-lab.document.v1';
const PRESETS_KEY = 'toonlab.building-lab.presets.v1';

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

export function loadBuildingDocument() {
  const saved = read(DOCUMENT_KEY, null);
  if (!saved?.settings) return null;
  return {
    name: String(saved.name || 'Untitled building'),
    presetId: saved.presetId || null,
    settings: createBuildingSettings(saved.settings),
  };
}

export function saveBuildingDocument(document) {
  write(DOCUMENT_KEY, document);
}

export function clearBuildingDocument() {
  try {
    storage()?.removeItem(DOCUMENT_KEY);
  } catch { /* optional persistence */ }
}

// Local presets carry a full recipe document so they share the built-in
// preset shape ({ id, label, description, recipe }) — one apply path.
export function loadLocalBuildingPresets() {
  const presets = read(PRESETS_KEY, []);
  if (!Array.isArray(presets)) return [];
  return presets
    .filter((entry) => entry?.id && entry?.recipe?.options)
    .map((entry) => ({
      ...entry,
      recipe: buildingRecipeFromSettings(createBuildingSettings({
        ...entry.recipe.options,
        type: entry.recipe.type,
      })),
      type: entry.recipe.type,
    }));
}

export function upsertLocalBuildingPreset(preset) {
  const presets = loadLocalBuildingPresets();
  const index = presets.findIndex((entry) => entry.id === preset.id);
  if (index >= 0) presets[index] = preset;
  else presets.unshift(preset);
  write(PRESETS_KEY, presets.slice(0, 60));
  return preset;
}

export function deleteLocalBuildingPreset(id) {
  write(PRESETS_KEY, loadLocalBuildingPresets().filter((entry) => entry.id !== id));
}
