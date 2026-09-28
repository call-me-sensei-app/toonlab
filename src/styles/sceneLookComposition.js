import {
  getFirstPartyStyleBundle,
  resolveStyleBundleSettings,
  validateStyleBundleDocument,
} from './styleBundle.js';
import {
  validateSceneContentDocument,
  validateSceneOverrideDocument,
  validateSceneQualityDocument,
  validateSceneScenarioDocument,
} from './sceneLayerDocuments.js';

export const RESOLVED_SCENE_LOOK_DOCUMENT_TYPE = 'toonlab/resolved-scene-look';
export const RESOLVED_SCENE_LOOK_DOCUMENT_VERSION = 1;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]));
  }
  return value;
}

function mergeLayer(base, next) {
  if (!isPlainObject(next)) return next === undefined ? cloneJson(base) : cloneJson(next);
  const result = isPlainObject(base) ? cloneJson(base) : {};
  for (const [key, value] of Object.entries(next)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? mergeLayer(result[key], value)
      : cloneJson(value);
  }
  return result;
}

function systemMap(payload, reserved = []) {
  const source = isPlainObject(payload?.systems) ? payload.systems : payload;
  return Object.fromEntries(Object.entries(source ?? {}).filter(([key, value]) => (
    !reserved.includes(key) && isPlainObject(value)
  )));
}

function inputIdentity(document) {
  return { id: document.id, type: document.type, version: document.version };
}

function readDocument(name, input, validator, errors) {
  const result = validator(input);
  if (!result.ok) {
    for (const message of result.errors) errors.push(`${name}: ${message}`);
    return null;
  }
  return result.value;
}

export class SceneLookCompositionError extends Error {
  constructor(errors) {
    super(errors.join(' '));
    this.errors = [...errors];
    this.name = 'SceneLookCompositionError';
  }
}

/**
 * Resolves layer precedence without mutating or flattening away ownership.
 * Content stays beside the effective visual settings; style, scenario,
 * quality, and explicit overrides compose in that order for each system.
 */
export function resolveSceneLook({
  bundle: bundleInput,
  content: contentInput,
  overrides: overrideInput = null,
  quality: qualityInput,
  scenario: scenarioInput,
} = {}) {
  const errors = [];
  const bundleSource = typeof bundleInput === 'string'
    ? getFirstPartyStyleBundle(bundleInput)
    : bundleInput;
  if (!bundleSource) errors.push(`bundle: Unknown first-party style bundle "${bundleInput}".`);
  const bundleResult = bundleSource ? validateStyleBundleDocument(bundleSource) : { ok: false, errors: [] };
  if (bundleSource && !bundleResult.ok) {
    for (const message of bundleResult.errors) errors.push(`bundle: ${message}`);
  }
  const content = readDocument('content', contentInput, validateSceneContentDocument, errors);
  const scenario = readDocument('scenario', scenarioInput, validateSceneScenarioDocument, errors);
  const quality = readDocument('quality', qualityInput, validateSceneQualityDocument, errors);
  const overrides = overrideInput === null
    ? null
    : readDocument('overrides', overrideInput, validateSceneOverrideDocument, errors);
  if (errors.length) throw new SceneLookCompositionError(errors);

  const bundle = bundleResult.value;
  const styleSystems = resolveStyleBundleSettings(bundle);
  const contentSystems = systemMap(content.content, ['assets', 'formations']);
  const scenarioSystems = systemMap(scenario.scenario);
  const qualitySystems = systemMap(quality.quality);
  const overrideSystems = overrides ? systemMap(overrides.overrides?.systems ?? {}) : {};
  const systemIds = [...new Set([
    ...Object.keys(contentSystems),
    ...Object.keys(styleSystems),
    ...Object.keys(scenarioSystems),
    ...Object.keys(qualitySystems),
    ...Object.keys(overrideSystems),
  ])].sort();

  const systems = {};
  for (const systemId of systemIds) {
    const style = styleSystems[systemId] ?? {};
    const scenarioLayer = scenarioSystems[systemId] ?? {};
    const qualityLayer = qualitySystems[systemId] ?? {};
    const override = overrideSystems[systemId] ?? {};
    systems[systemId] = {
      content: cloneJson(contentSystems[systemId] ?? {}),
      style: cloneJson(style),
      scenario: cloneJson(scenarioLayer),
      quality: cloneJson(qualityLayer),
      override: cloneJson(override),
      effective: mergeLayer(
        mergeLayer(mergeLayer(style, scenarioLayer), qualityLayer),
        override,
      ),
    };
  }

  return {
    type: RESOLVED_SCENE_LOOK_DOCUMENT_TYPE,
    version: RESOLVED_SCENE_LOOK_DOCUMENT_VERSION,
    inputs: {
      bundle: { id: bundle.id, type: bundle.schema, version: bundle.version },
      content: inputIdentity(content),
      scenario: inputIdentity(scenario),
      quality: inputIdentity(quality),
      overrides: overrides ? inputIdentity(overrides) : null,
    },
    content: cloneJson(content.content),
    scenario: cloneJson(scenario.scenario),
    quality: cloneJson(quality.quality),
    overrides: overrides ? cloneJson(overrides.overrides) : null,
    systems,
    targets: cloneJson(overrides?.overrides?.targets ?? {}),
  };
}

export function serializeResolvedSceneLook(result, { pretty = false } = {}) {
  if (result?.type !== RESOLVED_SCENE_LOOK_DOCUMENT_TYPE
    || result?.version !== RESOLVED_SCENE_LOOK_DOCUMENT_VERSION) {
    throw new TypeError('Expected a resolved ToonLab scene look document.');
  }
  return JSON.stringify(result, null, pretty ? 2 : 0);
}
