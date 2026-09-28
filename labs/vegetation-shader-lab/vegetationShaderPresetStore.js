// Browser persistence for the Vegetation shader family. Tree, Grass, and
// Flower profiles have separate collections; the former aggregate collection
// remains available for compatibility and legacy-document migration.

import {
  migrateLegacyVegetationShaderDocuments,
  parseVegetationShaderPresetDocument,
  parseVegetationShaderScopePresetDocument,
  registerVegetationShaderPreset,
} from '../../src/vegetation/vegetationShaders.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
} from '../../src/core/systemStylePolicy.js';

export const VEGETATION_SHADER_PROFILE_STORAGE_KEY = 'toonlab.vegetationShaderProfiles.v1';
export const LEGACY_VEGETATION_SHADER_STORAGE_KEY = 'toonlab.vegetationShaders.v1';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function storageKey(scope = 'vegetation') {
  return scope === 'vegetation'
    ? VEGETATION_SHADER_PROFILE_STORAGE_KEY
    : `toonlab.vegetationShaderProfiles.${scope}.v1`;
}

function writeDocuments(documents, scope = 'vegetation') {
  try {
    if (!window.localStorage) throw new Error('Browser storage is unavailable.');
    window.localStorage.setItem(
      storageKey(scope),
      JSON.stringify(documents, null, 2),
    );
  } catch (error) {
    throw new Error(`Could not save shader profiles to browser storage: ${error.message}`);
  }
}

function canonicalDocument(input, index = 0, scope = 'vegetation') {
  if (scope !== 'vegetation') {
    const scoped = parseVegetationShaderScopePresetDocument(scope, input);
    return scoped.ok ? scoped.value : null;
  }
  const parsed = parseVegetationShaderPresetDocument(input);
  if (parsed.ok) return parsed.value;
  const migrated = migrateLegacyVegetationShaderDocuments(input, {
    id: input?.id ? `migrated_${input.id}` : `migrated_vegetation_${index + 1}`,
    label: input?.label ? `${input.label} · migrated` : `Migrated vegetation ${index + 1}`,
  });
  return migrated.ok ? migrated.value : null;
}

function readDocuments(scope = 'vegetation') {
  const saved = readJson(storageKey(scope), []);
  if (Array.isArray(saved)) return saved.filter((entry) => !isProtectedSystemStyleId(entry?.id));
  if (Array.isArray(saved?.documents)) {
    return saved.documents.filter((entry) => !isProtectedSystemStyleId(entry?.id));
  }
  return [];
}

function migrateLegacyCollection() {
  const legacy = readJson(LEGACY_VEGETATION_SHADER_STORAGE_KEY, null);
  if (!legacy) return [];
  const inputs = Array.isArray(legacy)
    ? legacy
    : (Array.isArray(legacy.documents) ? legacy.documents : [legacy]);
  return inputs.map(canonicalDocument).filter(Boolean);
}

export function loadLocalVegetationShaderProfiles(scope = 'vegetation') {
  const existing = readDocuments(scope);
  const documents = existing.length > 0 || scope !== 'vegetation'
    ? existing
    : migrateLegacyCollection();
  const valid = [];
  const canonical = [];
  documents.forEach((document, index) => {
    const parsed = canonicalDocument(document, index, scope);
    if (!parsed) return;
    registerVegetationShaderPreset(parsed.id, parsed, { overwrite: true });
    canonical.push(parsed);
    valid.push({ description: parsed.description, id: parsed.id, label: parsed.label });
  });
  if (existing.length === 0 && canonical.length > 0) {
    // A failed optional migration must not prevent opening the lab. Explicit
    // saves below still report storage failures to the author.
    try { writeDocuments(canonical, scope); } catch { /* Keep the source collection. */ }
  }
  return valid;
}

export function upsertLocalVegetationShaderProfile(document, scope = 'vegetation') {
  const result = scope === 'vegetation'
    ? parseVegetationShaderPresetDocument(document)
    : parseVegetationShaderScopePresetDocument(scope, document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  assertUserStyleId(result.value.id);
  const next = readDocuments(scope).filter((entry) => entry?.id !== result.value.id);
  next.push(result.value);
  writeDocuments(next, scope);
  registerVegetationShaderPreset(result.value.id, result.value, { overwrite: true });
  return result.value;
}

export function deleteLocalVegetationShaderProfile(id, scope = 'vegetation') {
  if (isProtectedSystemStyleId(id)) return false;
  writeDocuments(
    readDocuments(scope).filter((entry) => entry?.id !== id),
    scope,
  );
  return true;
}
