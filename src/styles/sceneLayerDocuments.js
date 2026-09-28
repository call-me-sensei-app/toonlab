import { STYLE_MATERIAL_STABLE_ID_PATTERN } from './styleMetadata.js';

export const SCENE_LAYER_DOCUMENT_VERSION = 1;
export const SCENE_CONTENT_DOCUMENT_TYPE = 'toonlab/scene-content';
export const SCENE_SCENARIO_DOCUMENT_TYPE = 'toonlab/scene-scenario';
export const SCENE_QUALITY_DOCUMENT_TYPE = 'toonlab/scene-quality';
export const SCENE_OVERRIDE_DOCUMENT_TYPE = 'toonlab/scene-overrides';

const BASE_KEYS = new Set(['description', 'id', 'label', 'type', 'version']);

const LAYERS = Object.freeze({
  content: Object.freeze({
    forbidden: new Set([
      'bundle', 'cloudShader', 'environmentShader', 'flowerShader', 'groundShader',
      'lightingStyle', 'postStyle', 'rockShader', 'style', 'styleBundle',
      'styleBundleId', 'toonStyle', 'treeShader', 'waterStyle',
    ]),
    payloadKey: 'content',
    type: SCENE_CONTENT_DOCUMENT_TYPE,
  }),
  overrides: Object.freeze({
    forbidden: new Set(),
    payloadKey: 'overrides',
    requiresDescription: true,
    type: SCENE_OVERRIDE_DOCUMENT_TYPE,
  }),
  quality: Object.freeze({
    forbidden: new Set([
      'assetId', 'bundle', 'catalogId', 'cloudCoverage', 'geometry',
      'implementation', 'modelUrl', 'precipitation', 'scenario', 'season',
      'sourceUrl', 'style', 'styleBundle', 'styleBundleId', 'timeOfDay',
      'waterPreset', 'weather', 'wind',
    ]),
    payloadKey: 'quality',
    type: SCENE_QUALITY_DOCUMENT_TYPE,
  }),
  scenario: Object.freeze({
    forbidden: new Set([
      'assetId', 'catalogId', 'geometry', 'implementation', 'modelUrl',
      'sourceAsset', 'sourceUrl', 'style', 'styleBundle', 'styleBundleId',
    ]),
    payloadKey: 'scenario',
    type: SCENE_SCENARIO_DOCUMENT_TYPE,
  }),
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value, path, errors, seen = new Set()) {
  if (value === null || ['boolean', 'string'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      errors.push(`${path} cannot contain a circular reference.`);
      return null;
    }
    seen.add(value);
    const result = value.map((entry, index) => cloneJson(entry, `${path}[${index}]`, errors, seen));
    seen.delete(value);
    return result;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) {
      errors.push(`${path} cannot contain a circular reference.`);
      return null;
    }
    seen.add(value);
    const result = Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      cloneJson(entry, `${path}.${key}`, errors, seen),
    ]));
    seen.delete(value);
    return result;
  }
  errors.push(`${path} must contain only JSON-serializable values.`);
  return null;
}

function findForbidden(value, forbidden, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbidden(entry, forbidden, `${path}[${index}]`, errors));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (forbidden.has(key)) {
      errors.push(`${path.split('.')[0]} cannot contain field "${key}" at ${nextPath}.`);
    }
    findForbidden(entry, forbidden, nextPath, errors);
  }
}

function validateLayerDocument(kind, input) {
  const definition = LAYERS[kind];
  const errors = [];
  if (!isPlainObject(input)) return { errors: [`${kind} document must be a JSON object.`], ok: false, value: null, warnings: [] };
  const allowed = new Set([...BASE_KEYS, definition.payloadKey]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors.push(`Unknown ${kind} document field "${key}".`);
  }
  if (input.type !== definition.type) errors.push(`${kind} document type must be "${definition.type}".`);
  if (input.version !== SCENE_LAYER_DOCUMENT_VERSION) {
    errors.push(`${kind} document version must be ${SCENE_LAYER_DOCUMENT_VERSION}.`);
  }
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!STYLE_MATERIAL_STABLE_ID_PATTERN.test(id)) errors.push(`${kind} document id must be a stable identifier.`);
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!label) errors.push(`${kind} document label is required.`);
  const description = typeof input.description === 'string' ? input.description : '';
  if (definition.requiresDescription && !description.trim()) {
    errors.push(`${kind} document description must explain why the overrides are required.`);
  }
  const payloadInput = input[definition.payloadKey];
  if (!isPlainObject(payloadInput)) errors.push(`${definition.payloadKey} must be a JSON object.`);
  const payload = isPlainObject(payloadInput)
    ? cloneJson(payloadInput, definition.payloadKey, errors)
    : null;
  if (payload) findForbidden(payload, definition.forbidden, definition.payloadKey, errors);
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? {
      type: definition.type,
      version: SCENE_LAYER_DOCUMENT_VERSION,
      id,
      label,
      description,
      [definition.payloadKey]: payload,
    } : null,
    warnings: [],
  };
}

function createLayerDocument(kind, id, definition = {}) {
  const layer = LAYERS[kind];
  const result = validateLayerDocument(kind, {
    type: layer.type,
    version: SCENE_LAYER_DOCUMENT_VERSION,
    id,
    label: definition.label ?? id,
    description: definition.description ?? '',
    [layer.payloadKey]: definition[layer.payloadKey] ?? {},
  });
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return result.value;
}

function parseLayerDocument(kind, input) {
  try {
    return validateLayerDocument(kind, typeof input === 'string' ? JSON.parse(input) : input);
  } catch (error) {
    return { errors: [`Invalid ${kind} document JSON: ${error.message}`], ok: false, value: null, warnings: [] };
  }
}

function serializeLayerDocument(kind, input, { pretty = true } = {}) {
  const result = validateLayerDocument(kind, input);
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}

export const validateSceneContentDocument = (input) => validateLayerDocument('content', input);
export const createSceneContentDocument = (id, definition) => createLayerDocument('content', id, definition);
export const parseSceneContentDocument = (input) => parseLayerDocument('content', input);
export const serializeSceneContentDocument = (input, options) => serializeLayerDocument('content', input, options);

export const validateSceneScenarioDocument = (input) => validateLayerDocument('scenario', input);
export const createSceneScenarioDocument = (id, definition) => createLayerDocument('scenario', id, definition);
export const parseSceneScenarioDocument = (input) => parseLayerDocument('scenario', input);
export const serializeSceneScenarioDocument = (input, options) => serializeLayerDocument('scenario', input, options);

export const validateSceneQualityDocument = (input) => validateLayerDocument('quality', input);
export const createSceneQualityDocument = (id, definition) => createLayerDocument('quality', id, definition);
export const parseSceneQualityDocument = (input) => parseLayerDocument('quality', input);
export const serializeSceneQualityDocument = (input, options) => serializeLayerDocument('quality', input, options);

export const validateSceneOverrideDocument = (input) => validateLayerDocument('overrides', input);
export const createSceneOverrideDocument = (id, definition) => createLayerDocument('overrides', id, definition);
export const parseSceneOverrideDocument = (input) => parseLayerDocument('overrides', input);
export const serializeSceneOverrideDocument = (input, options) => serializeLayerDocument('overrides', input, options);
