import { writeRequiredLocalJson } from '../shared/browserStorage.js';
// Local browser persistence for the public grass-preset document contract.
// Validation, migration, serialization, and runtime registration live in the
// npm vegetation module; this file owns localStorage only.

import {
  parseGrassPresetDocument,
  registerSerializedGrassPreset,
  unregisterGrassPreset,
} from '../../src/vegetation/stylizedGrass.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
} from '../../src/core/systemStylePolicy.js';

export {
  GRASS_PRESET_DOCUMENT_TYPE,
  GRASS_PRESET_SCHEMA_VERSION,
  createGrassPresetDocument,
  parseGrassPresetDocument,
  registerSerializedGrassPreset,
  sanitizeGrassPresetSettings,
  serializeGrassPreset,
  validateGrassPresetDocument,
} from '../../src/vegetation/stylizedGrass.js';

const STORAGE_KEY = 'toonlab.grassPresets.v1';

function readDocuments() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => !isProtectedSystemStyleId(entry?.id))
      : [];
  } catch {
    return [];
  }
}

function writeDocuments(documents) {
  writeRequiredLocalJson(STORAGE_KEY, documents);
}

export function loadLocalGrassPresets() {
  const valid = [];
  for (const document of readDocuments()) {
    const result = parseGrassPresetDocument(document);
    if (!result.ok) continue;
    registerSerializedGrassPreset(result.value, { overwrite: true });
    valid.push({ id: result.value.id, label: result.value.label });
  }
  return valid;
}

export function upsertLocalGrassPresetDocument(document) {
  const result = parseGrassPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  assertUserStyleId(result.value.id);
  const next = readDocuments().filter((entry) => entry?.id !== result.value.id);
  next.push(result.value);
  writeDocuments(next);
  registerSerializedGrassPreset(result.value, { overwrite: true });
  return result.value;
}

export function deleteLocalGrassPreset(id) {
  if (isProtectedSystemStyleId(id)) return false;
  writeDocuments(readDocuments().filter((entry) => entry?.id !== id));
  unregisterGrassPreset(id);
  return true;
}
