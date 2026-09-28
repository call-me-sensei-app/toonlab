// Portable, versioned VFX Effect documents.
//
// This module owns effect identity, intent, macro parameters, runtime inputs,
// phases, layer composition, bindings, and quality policy. It deliberately
// stores references to VFX renderer profiles and source assets instead of
// absorbing either document type. Preview state and gameplay callbacks never
// enter the portable document.

import { cloneSerializable, stableStringify } from '../core/generation.js';
import { parsePresetDocument } from '../core/presetDocuments.js';
import {
  DEFAULT_VFX_SILHOUETTE_PROFILE,
  normalizeVfxSilhouetteProfile,
} from './vfxShapeProfiles.js';

export const VFX_EFFECT_DOCUMENT_TYPE = 'toonlab.vfx.effect';
export const VFX_EFFECT_SCHEMA_VERSION = 2;

export const VFX_EFFECT_LAYER_TYPES = Object.freeze([
  'sprite-particle',
  'mesh-particle',
  'mesh-volume',
  'ribbon',
  'trail',
  'beam',
  'decal',
  'light',
  'distortion',
  'post-process',
  'sub-effect',
]);

export const VFX_EFFECT_PARAMETER_TYPES = Object.freeze([
  'boolean',
  'color',
  'enum',
  'number',
  'profile',
]);

export const VFX_EFFECT_INPUT_TYPES = Object.freeze([
  'boolean',
  'enum',
  'number',
  'object',
  'string',
  'vec3',
]);

export const VFX_EFFECT_PHASE_MODES = Object.freeze(['hold', 'loop', 'once']);

const PARAMETER_TYPES = new Set(VFX_EFFECT_PARAMETER_TYPES);
const INPUT_TYPES = new Set(VFX_EFFECT_INPUT_TYPES);
const LAYER_TYPES = new Set(VFX_EFFECT_LAYER_TYPES);
const PHASE_MODES = new Set(VFX_EFFECT_PHASE_MODES);
const BINDING_TRANSFORMS = new Set(['constant', 'curve', 'identity', 'linear', 'step']);

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanId = (value) => String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const unique = (values) => [...new Set(values)];

function cleanStringArray(value) {
  return unique((Array.isArray(value) ? value : [])
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean));
}

function cleanColor(value, fallback = [1, 1, 1]) {
  const source = Array.isArray(value) ? value : fallback;
  return [0, 1, 2].map((index) => clamp(finite(source[index], fallback[index] ?? 1), 0, 1));
}

function normalizeTemplate(value) {
  const source = typeof value === 'string' ? { id: value } : (plain(value) ? value : {});
  const answers = {};
  if (plain(source.answers)) {
    for (const [key, raw] of Object.entries(source.answers)) {
      const id = cleanId(key);
      if (!id || raw === undefined || raw === null) continue;
      if (typeof raw === 'boolean' || typeof raw === 'number') answers[id] = raw;
      else answers[id] = String(raw);
    }
  }
  return {
    answers,
    id: cleanId(source.id),
    version: Math.max(1, Math.round(finite(source.version, 1))),
  };
}

function normalizeIntent(value) {
  const source = plain(value) ? value : {};
  const modifiers = {};
  if (plain(source.modifiers)) {
    for (const [key, raw] of Object.entries(source.modifiers)) {
      const id = cleanId(key);
      if (!id) continue;
      if (Array.isArray(raw)) modifiers[id] = cleanStringArray(raw);
      else if (typeof raw === 'boolean' || typeof raw === 'number') modifiers[id] = raw;
      else if (raw !== undefined && raw !== null) modifiers[id] = String(raw);
    }
  }
  return {
    modifiers,
    path: cleanStringArray(source.path).map(cleanId).filter(Boolean),
  };
}

function normalizeParameter(source, index, errors) {
  const entry = plain(source) ? source : {};
  const id = cleanId(entry.id);
  if (!id) errors.push(`parameters[${index}].id is required.`);
  const type = String(entry.type ?? 'number');
  if (!PARAMETER_TYPES.has(type)) {
    errors.push(`Parameter "${id || index}" has unknown type "${type}".`);
  }

  const base = {
    description: String(entry.description ?? ''),
    group: cleanId(entry.group || 'appearance'),
    id,
    label: String(entry.label || id),
    type,
  };

  if (type === 'number') {
    const min = finite(entry.min, 0);
    const max = Math.max(finite(entry.max, 1), min);
    const step = Math.max(finite(entry.step, (max - min) / 100 || 0.01), Number.EPSILON);
    const defaultValue = clamp(finite(entry.default, min), min, max);
    return {
      ...base,
      default: defaultValue,
      max,
      min,
      step,
      value: clamp(finite(entry.value, defaultValue), min, max),
    };
  }

  if (type === 'boolean') {
    const defaultValue = entry.default === undefined ? false : Boolean(entry.default);
    return {
      ...base,
      default: defaultValue,
      value: entry.value === undefined ? defaultValue : Boolean(entry.value),
    };
  }

  if (type === 'color') {
    const defaultValue = cleanColor(entry.default);
    return {
      ...base,
      default: defaultValue,
      value: cleanColor(entry.value, defaultValue),
    };
  }

  if (type === 'enum') {
    const options = cleanStringArray(entry.options);
    if (options.length === 0) errors.push(`Enum parameter "${id || index}" requires options.`);
    const defaultValue = options.includes(String(entry.default)) ? String(entry.default) : (options[0] ?? '');
    const value = options.includes(String(entry.value)) ? String(entry.value) : defaultValue;
    return { ...base, default: defaultValue, options, value };
  }

  if (type === 'profile') {
    const defaultValue = normalizeVfxSilhouetteProfile(
      entry.default,
      DEFAULT_VFX_SILHOUETTE_PROFILE,
    );
    return {
      ...base,
      default: defaultValue,
      value: normalizeVfxSilhouetteProfile(entry.value, defaultValue),
    };
  }

  return { ...base, default: cloneSerializable(entry.default), value: cloneSerializable(entry.value) };
}

function normalizeInput(source, index, errors) {
  const entry = plain(source) ? source : {};
  const id = cleanId(entry.id);
  if (!id) errors.push(`inputs[${index}].id is required.`);
  const type = String(entry.type ?? 'object');
  if (!INPUT_TYPES.has(type)) errors.push(`Input "${id || index}" has unknown type "${type}".`);
  const normalized = {
    description: String(entry.description ?? ''),
    id,
    label: String(entry.label || id),
    required: Boolean(entry.required),
    type,
  };
  if (type === 'enum') {
    normalized.options = cleanStringArray(entry.options);
    if (normalized.options.length === 0) errors.push(`Enum input "${id || index}" requires options.`);
  }
  if (entry.default !== undefined) normalized.default = cloneSerializable(entry.default);
  return normalized;
}

function normalizePhase(source, index, errors) {
  const entry = plain(source) ? source : {};
  const id = cleanId(entry.id);
  if (!id) errors.push(`phases[${index}].id is required.`);
  const mode = String(entry.mode ?? 'once');
  if (!PHASE_MODES.has(mode)) errors.push(`Phase "${id || index}" has unknown mode "${mode}".`);
  let duration = entry.duration === null ? null : Math.max(0, finite(entry.duration, 0));
  if (mode === 'once' && duration === null) {
    errors.push(`Once phase "${id || index}" requires a finite duration.`);
    duration = 0;
  }
  return {
    description: String(entry.description ?? ''),
    duration,
    id,
    label: String(entry.label || id),
    mode,
  };
}

function normalizeReference(value, key) {
  const source = plain(value) ? value : {};
  const id = cleanId(source[key]);
  return id ? { [key]: id, ...(plain(source.overrides) ? { overrides: cloneSerializable(source.overrides) } : {}) } : null;
}

function normalizeLayer(source, index, errors, warnings) {
  const entry = plain(source) ? source : {};
  const id = cleanId(entry.id);
  if (!id) errors.push(`layers[${index}].id is required.`);
  const type = cleanId(entry.type);
  const isCustom = type.startsWith('custom/');
  if (!LAYER_TYPES.has(type) && !isCustom) {
    errors.push(`Layer "${id || index}" has unknown type "${type}".`);
  } else if (isCustom) {
    warnings.push(`Layer "${id}" requires the registered custom renderer "${type}".`);
  }
  const renderer = normalizeReference(entry.renderer, 'profile');
  const sourceRef = normalizeReference(entry.source, 'asset');
  if (!renderer && !['light', 'post-process', 'sub-effect'].includes(type) && !isCustom) {
    errors.push(`Layer "${id || index}" requires renderer.profile.`);
  }
  if (!sourceRef && ['mesh-particle', 'mesh-volume', 'decal'].includes(type)) {
    errors.push(`Layer "${id || index}" requires source.asset.`);
  }
  return {
    enabled: entry.enabled === undefined ? true : Boolean(entry.enabled),
    id,
    label: String(entry.label || id),
    order: finite(entry.order, (index + 1) * 100),
    phases: cleanStringArray(entry.phases).map(cleanId).filter(Boolean),
    ...(renderer ? { renderer } : {}),
    settings: plain(entry.settings) ? cloneSerializable(entry.settings) : {},
    ...(sourceRef ? { source: sourceRef } : {}),
    type,
  };
}

function normalizeBinding(source, index, errors) {
  const entry = plain(source) ? source : {};
  const parameter = cleanId(entry.parameter);
  if (!parameter) errors.push(`bindings[${index}].parameter is required.`);
  const targetSource = plain(entry.target) ? entry.target : {};
  const target = {
    layer: cleanId(targetSource.layer),
    path: cleanStringArray(targetSource.path).map(cleanId).filter(Boolean),
  };
  if (!target.layer) errors.push(`bindings[${index}].target.layer is required.`);
  if (target.path.length === 0) errors.push(`bindings[${index}].target.path is required.`);
  const transformSource = plain(entry.transform) ? entry.transform : {};
  const transformType = String(transformSource.type ?? 'linear');
  if (!BINDING_TRANSFORMS.has(transformType)) {
    errors.push(`Binding ${index} has unknown transform "${transformType}".`);
  }
  const transform = { type: transformType };
  if (transformType === 'identity') {
    // The parameter value is forwarded unchanged. Used by colors, enums,
    // booleans, and number macros that need no response remapping.
  } else if (transformType === 'linear') {
    transform.input = Array.isArray(transformSource.input)
      ? transformSource.input.slice(0, 2).map((value) => finite(value, 0))
      : [0, 1];
    transform.output = Array.isArray(transformSource.output)
      ? transformSource.output.slice(0, 2).map((value) => finite(value, 0))
      : [0, 1];
    if (transform.input.length !== 2 || transform.output.length !== 2) {
      errors.push(`Linear binding ${index} requires two-value input and output ranges.`);
    }
  } else if (transformType === 'curve') {
    transform.points = (Array.isArray(transformSource.points) ? transformSource.points : [])
      .map((point) => Array.isArray(point) ? point.slice(0, 2).map((value) => finite(value, 0)) : [])
      .filter((point) => point.length === 2)
      .sort((a, b) => a[0] - b[0]);
    if (transform.points.length < 2) errors.push(`Curve binding ${index} requires at least two points.`);
  } else if (transformType === 'step') {
    transform.threshold = finite(transformSource.threshold, 0.5);
    transform.below = cloneSerializable(transformSource.below ?? 0);
    transform.above = cloneSerializable(transformSource.above ?? 1);
  } else {
    transform.value = cloneSerializable(transformSource.value);
  }
  return { parameter, target, transform };
}

function normalizeTier(source, index, errors) {
  const entry = plain(source) ? source : {};
  const id = cleanId(entry.id);
  if (!id) errors.push(`quality.tiers[${index}].id is required.`);
  const budgets = plain(entry.budgets) ? entry.budgets : {};
  const normalizedBudgets = {};
  for (const [key, value] of Object.entries(budgets)) {
    const budgetId = cleanId(key);
    if (!budgetId) continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      errors.push(`Quality tier "${id || index}" budget "${budgetId}" must be non-negative.`);
    } else {
      normalizedBudgets[budgetId] = Math.round(number);
    }
  }
  return {
    budgets: normalizedBudgets,
    features: plain(entry.features)
      ? Object.fromEntries(Object.entries(entry.features).map(([key, value]) => [cleanId(key), Boolean(value)]))
      : {},
    id,
    label: String(entry.label || id),
  };
}

function normalizeQuality(value, errors) {
  const source = plain(value) ? value : {};
  const tiers = (Array.isArray(source.tiers) ? source.tiers : [])
    .map((tier, index) => normalizeTier(tier, index, errors));
  const defaultTier = cleanId(source.defaultTier || tiers[0]?.id);
  if (tiers.length === 0) errors.push('quality.tiers requires at least one tier.');
  if (defaultTier && !tiers.some((tier) => tier.id === defaultTier)) {
    errors.push(`quality.defaultTier "${defaultTier}" does not reference a quality tier.`);
  }
  return { defaultTier, tiers };
}

function checkDuplicateIds(entries, label, errors) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (id && count > 1) errors.push(`Duplicate ${label} id "${id}".`);
  }
}

/**
 * Validates and canonicalizes one VFX Effect document without registering it
 * or mutating the caller's value.
 */
export function validateVfxEffectDocument(input) {
  const errors = [];
  const warnings = [];
  if (!plain(input)) {
    return { errors: ['VFX effect document must be a JSON object.'], ok: false, value: null, warnings };
  }
  if (input.type !== VFX_EFFECT_DOCUMENT_TYPE) {
    errors.push(`VFX effect document type must be "${VFX_EFFECT_DOCUMENT_TYPE}".`);
  }
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1) {
    errors.push('VFX effect document version must be a positive integer.');
  } else if (version > VFX_EFFECT_SCHEMA_VERSION) {
    errors.push(`VFX effect document version ${version} is newer than supported version ${VFX_EFFECT_SCHEMA_VERSION}.`);
  }

  const id = cleanId(input.id);
  if (!id) errors.push('VFX effect document id is required.');
  const template = normalizeTemplate(input.template);
  if (!template.id) errors.push('VFX effect document template.id is required.');
  const intent = normalizeIntent(input.intent);
  if (intent.path.length < 2) errors.push('VFX effect document intent.path requires at least two segments.');

  const parameters = (Array.isArray(input.parameters) ? input.parameters : [])
    .map((parameter, index) => normalizeParameter(parameter, index, errors));
  const inputs = (Array.isArray(input.inputs) ? input.inputs : [])
    .map((entry, index) => normalizeInput(entry, index, errors));
  const phases = (Array.isArray(input.phases) ? input.phases : [])
    .map((phase, index) => normalizePhase(phase, index, errors));
  const layers = (Array.isArray(input.layers) ? input.layers : [])
    .map((layer, index) => normalizeLayer(layer, index, errors, warnings))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const bindings = (Array.isArray(input.bindings) ? input.bindings : [])
    .map((binding, index) => normalizeBinding(binding, index, errors));
  const quality = normalizeQuality(input.quality, errors);

  checkDuplicateIds(parameters, 'parameter', errors);
  checkDuplicateIds(inputs, 'input', errors);
  checkDuplicateIds(phases, 'phase', errors);
  checkDuplicateIds(layers, 'layer', errors);
  checkDuplicateIds(quality.tiers, 'quality tier', errors);

  const parameterIds = new Set(parameters.map((entry) => entry.id));
  const parameterById = new Map(parameters.map((entry) => [entry.id, entry]));
  const phaseIds = new Set(phases.map((entry) => entry.id));
  const layerIds = new Set(layers.map((entry) => entry.id));
  const layerById = new Map(layers.map((entry) => [entry.id, entry]));
  for (const layer of layers) {
    if (layer.phases.length === 0) warnings.push(`Layer "${layer.id}" is not assigned to a phase.`);
    for (const phase of layer.phases) {
      if (!phaseIds.has(phase)) errors.push(`Layer "${layer.id}" references unknown phase "${phase}".`);
    }
  }
  for (const binding of bindings) {
    if (!parameterIds.has(binding.parameter)) {
      errors.push(`Binding references unknown parameter "${binding.parameter}".`);
    }
    if (!layerIds.has(binding.target.layer)) {
      errors.push(`Binding references unknown layer "${binding.target.layer}".`);
      continue;
    }
    const parameter = parameterById.get(binding.parameter);
    if (parameter && ['boolean', 'color', 'enum', 'profile'].includes(parameter.type)
      && !['constant', 'identity', 'step'].includes(binding.transform.type)) {
      errors.push(`Binding for ${parameter.type} parameter "${parameter.id}" requires identity, constant, or step transform.`);
    }
    let targetValue = layerById.get(binding.target.layer);
    let missingPath = false;
    for (const segment of binding.target.path) {
      if (!plain(targetValue) || !Object.hasOwn(targetValue, segment)) {
        missingPath = true;
        break;
      }
      targetValue = targetValue[segment];
    }
    if (missingPath) {
      errors.push(
        `Binding target "${binding.target.layer}.${binding.target.path.join('.')}" does not exist.`,
      );
    }
  }
  if (phases.length === 0) errors.push('VFX effect document requires at least one phase.');
  if (layers.length === 0) warnings.push('VFX effect document has no visual layers.');

  const tags = cleanStringArray(input.tags).map(cleanId).filter(Boolean);
  const value = errors.length > 0 ? null : {
    bindings,
    description: String(input.description ?? ''),
    id,
    inputs,
    intent,
    label: String(input.label || id),
    layers,
    parameters,
    phases,
    quality,
    style: cleanId(input.style || 'default') || 'default',
    tags,
    template,
    type: VFX_EFFECT_DOCUMENT_TYPE,
    version: VFX_EFFECT_SCHEMA_VERSION,
  };
  return { errors: unique(errors), ok: errors.length === 0, value, warnings: unique(warnings) };
}

export function createVfxEffectDocument(id, definition = {}) {
  const source = plain(definition) ? definition : {};
  const result = validateVfxEffectDocument({
    bindings: source.bindings,
    description: source.description ?? '',
    id: id ?? source.id,
    inputs: source.inputs,
    intent: source.intent,
    label: source.label ?? source.name ?? id,
    layers: source.layers,
    parameters: source.parameters,
    phases: source.phases,
    quality: source.quality,
    style: source.style ?? 'default',
    tags: source.tags,
    template: source.template,
    type: VFX_EFFECT_DOCUMENT_TYPE,
    version: VFX_EFFECT_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function parseVfxEffectDocument(input) {
  return parsePresetDocument(input, validateVfxEffectDocument, {
    invalidJsonLabel: 'VFX effect document',
  });
}

export function serializeVfxEffectDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = plain(idOrDocument)
    ? createVfxEffectDocument(idOrDocument.id, idOrDocument)
    : createVfxEffectDocument(idOrDocument, definition);
  return stableStringify(document, pretty ? 2 : 0);
}

/** Returns the portable macro values as an id-keyed object. */
export function getVfxEffectParameterValues(documentInput) {
  const result = validateVfxEffectDocument(documentInput);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return Object.fromEntries(result.value.parameters.map((parameter) => [
    parameter.id,
    cloneSerializable(parameter.value),
  ]));
}

/**
 * Creates a new canonical document with selected macro values replaced. Values
 * are revalidated against their original type/range/options.
 */
export function setVfxEffectParameterValues(documentInput, values = {}) {
  const result = validateVfxEffectDocument(documentInput);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const document = cloneSerializable(result.value);
  document.parameters = document.parameters.map((parameter) => (
    Object.hasOwn(values, parameter.id)
      ? { ...parameter, value: cloneSerializable(values[parameter.id]) }
      : parameter
  ));
  const next = validateVfxEffectDocument(document);
  if (!next.ok) throw new Error(next.errors.join(' '));
  return next.value;
}
