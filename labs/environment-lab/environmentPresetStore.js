// Local environment-preset document persistence (browser localStorage),
// mirroring labs/shader-lab/toonPresetStore.js. Loaded documents are
// registered into the runtime preset registry so createEnvironmentSettings /
// resolveEnvironmentPreset can resolve them by id.

import {
  registerEnvironmentPreset,
  validateEnvironmentPresetDocument,
} from '../../src/environment/environmentPresets.js';

const LOCAL_ENVIRONMENT_PRESETS_STORAGE_KEY = 'toonlab.environmentPresets.v1';

function readLocalEnvironmentPresetDocuments() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_ENVIRONMENT_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read local environment presets:', error);
    return [];
  }
}

function writeLocalEnvironmentPresetDocuments(documents) {
  try {
    window.localStorage?.setItem(
      LOCAL_ENVIRONMENT_PRESETS_STORAGE_KEY,
      JSON.stringify(documents, null, 2),
    );
  } catch (error) {
    console.warn('Failed to write local environment presets:', error);
  }
}

export function loadLocalEnvironmentPresets() {
  const documents = readLocalEnvironmentPresetDocuments();
  const validDocuments = [];
  for (const document of documents) {
    const result = validateEnvironmentPresetDocument(document);
    if (!result.ok) {
      console.warn('Ignoring invalid local environment preset:', result.errors.join(' '));
      continue;
    }
    registerEnvironmentPreset(result.value.id, result.value, { overwrite: true });
    validDocuments.push(document);
  }
  return validDocuments.map((document) => ({
    id: document.id,
    label: document.label ?? document.id,
  }));
}

export function upsertLocalEnvironmentPresetDocument(presetDocument) {
  const result = validateEnvironmentPresetDocument(presetDocument);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const nextDocuments = readLocalEnvironmentPresetDocuments()
    .filter((entry) => entry?.id !== result.value.id);
  nextDocuments.push(presetDocument);
  nextDocuments.sort((a, b) => String(a.label ?? a.id).localeCompare(String(b.label ?? b.id)));
  writeLocalEnvironmentPresetDocuments(nextDocuments);
  registerEnvironmentPreset(result.value.id, result.value, { overwrite: true });
  return result.value;
}

export function deleteLocalEnvironmentPreset(id) {
  writeLocalEnvironmentPresetDocuments(
    readLocalEnvironmentPresetDocuments().filter((entry) => entry?.id !== id),
  );
}
