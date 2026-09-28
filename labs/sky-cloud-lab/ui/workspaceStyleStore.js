// Browser-local named style library shared by Sky Shader, Cloud Shader, and
// Sky & Cloud. Every saved entry contains the public toonlab/sky-params
// document verbatim; workspace is local-library metadata only.

import {
  createSkyParamsDocument,
  parseSkyParamsDocument,
  serializeSkyParamsDocument,
} from '../../../src/sky/index.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
} from '../../../src/core/systemStylePolicy.js';

export const SKY_CLOUD_STYLE_LIBRARY_KEY = 'toonlab.skyCloudLab.styles.v1';
const STYLE_LIMIT = 120;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read() {
  try {
    const raw = storage()?.getItem(SKY_CLOUD_STYLE_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(records) {
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(SKY_CLOUD_STYLE_LIBRARY_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function canonicalDocument(input) {
  const parsed = parseSkyParamsDocument(input);
  if (!parsed.ok) return null;
  return JSON.parse(serializeSkyParamsDocument(parsed.value));
}

export function createWorkspaceStyleDocument(id, { description = '', label, params }) {
  return JSON.parse(serializeSkyParamsDocument(createSkyParamsDocument(id, {
    description,
    label,
    params,
  })));
}

export function loadSkyCloudStyles() {
  return read().flatMap((record) => {
    const document = canonicalDocument(record?.document);
    if (!document || isProtectedSystemStyleId(document.id)) return [];
    return [{
      document,
      id: document.id,
      label: document.label,
      workspace: typeof record.workspace === 'string' ? record.workspace : 'integration',
    }];
  });
}

export function upsertSkyCloudStyle({ document, workspace }) {
  const canonical = canonicalDocument(document);
  if (!canonical) return null;
  assertUserStyleId(canonical.id);
  const records = read().filter((entry) => entry?.document?.id !== canonical.id);
  records.unshift({ document: canonical, workspace });
  if (!write(records.slice(0, STYLE_LIMIT))) return null;
  return canonical;
}

export function deleteSkyCloudStyle(id) {
  if (isProtectedSystemStyleId(id)) return false;
  return write(read().filter((entry) => entry?.document?.id !== id));
}
