// Local toon-preset document persistence (browser localStorage).

import { registerToonPreset, validateToonPresetDocument } from '../../src/toon/toonMaterialAdapter.js';
import { writeRequiredLocalJson } from '../shared/browserStorage.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
} from '../../src/core/systemStylePolicy.js';

const LOCAL_TOON_PRESETS_STORAGE_KEY = 'toonlab.toonPresets.v1';
const LEGACY_LOCAL_TOON_PRESETS_STORAGE_KEYS = Object.freeze([
  'threejs-toon-shader.toonPresets.v1',
]);

function readLocalToonPresetDocuments() {
  try {
    const storage = window.localStorage;
    const raw = storage?.getItem(LOCAL_TOON_PRESETS_STORAGE_KEY)
      ?? LEGACY_LOCAL_TOON_PRESETS_STORAGE_KEYS
        .map((key) => storage?.getItem(key))
        .find(Boolean);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => !isProtectedSystemStyleId(entry?.id))
      : [];
  } catch (error) {
    console.warn('Failed to read local toon presets:', error);
    return [];
  }
}

function writeLocalToonPresetDocuments(documents) {
  writeRequiredLocalJson(LOCAL_TOON_PRESETS_STORAGE_KEY, documents);
}

export function loadLocalToonPresets() {
  const documents = readLocalToonPresetDocuments();
  const validDocuments = [];
  for (const document of documents) {
    const result = validateToonPresetDocument(document);
    if (!result.ok) {
      console.warn('Ignoring invalid local toon preset:', result.errors.join(' '));
      continue;
    }
    registerToonPreset(result.value.id, result.value, { overwrite: true });
    validDocuments.push(result.value);
  }
  if (validDocuments.length > 0 || validDocuments.length !== documents.length) {
    // Optional migration/cleanup must not prevent reading existing work.
    try { writeLocalToonPresetDocuments(validDocuments); } catch { /* Preserve the source collection. */ }
  }
  document.body.dataset.localToonPresetCount = String(validDocuments.length);
  return validDocuments;
}

export function deleteLocalToonPreset(id) {
  if (isProtectedSystemStyleId(id)) return false;
  const nextDocuments = readLocalToonPresetDocuments()
    .map((entry) => validateToonPresetDocument(entry))
    .filter((entry) => entry.ok)
    .map((entry) => entry.value)
    .filter((entry) => entry.id !== id);
  writeLocalToonPresetDocuments(nextDocuments);
  document.body.dataset.localToonPresetCount = String(nextDocuments.length);
  return true;
}

export function upsertLocalToonPresetDocument(presetDocument) {
  const result = validateToonPresetDocument(presetDocument);
  if (!result.ok) throw new Error(result.errors.join(' '));
  assertUserStyleId(result.value.id);

  const nextDocuments = readLocalToonPresetDocuments()
    .map((entry) => validateToonPresetDocument(entry))
    .filter((entry) => entry.ok)
    .map((entry) => entry.value)
    .filter((entry) => entry.id !== result.value.id);
  nextDocuments.push(result.value);
  nextDocuments.sort((a, b) => a.label.localeCompare(b.label));
  writeLocalToonPresetDocuments(nextDocuments);
  registerToonPreset(result.value.id, result.value, { overwrite: true });
  document.body.dataset.localToonPresetCount = String(nextDocuments.length);
  return result.value;
}
