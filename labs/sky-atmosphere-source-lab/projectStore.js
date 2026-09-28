import {
  createSkyAtmosphereSourceDocument,
  validateSkyAtmosphereSourceDocument,
} from './document.js';

const WORKING_KEY = 'toonlab.skyAtmosphereSource.working.v1';
const LIBRARY_KEY = 'toonlab.skyAtmosphereSource.library.v1';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key) {
  try {
    const value = storage()?.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadWorkingSourceDocument() {
  const result = validateSkyAtmosphereSourceDocument(read(WORKING_KEY));
  return result.ok ? result.value : null;
}

export function saveWorkingSourceDocument(document) {
  return write(WORKING_KEY, createSkyAtmosphereSourceDocument(document));
}

export function loadSavedSourceDocuments() {
  const source = read(LIBRARY_KEY);
  if (!Array.isArray(source)) return [];
  return source.flatMap((entry) => {
    const result = validateSkyAtmosphereSourceDocument(entry);
    return result.ok ? [result.value] : [];
  });
}

export function upsertSavedSourceDocument(document) {
  const canonical = createSkyAtmosphereSourceDocument(document);
  const next = [
    canonical,
    ...loadSavedSourceDocuments().filter((entry) => entry.id !== canonical.id),
  ];
  return write(LIBRARY_KEY, next) ? canonical : null;
}

export function deleteSavedSourceDocument(id) {
  const next = loadSavedSourceDocuments().filter((entry) => entry.id !== id);
  return write(LIBRARY_KEY, next);
}
