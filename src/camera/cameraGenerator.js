import {
  cloneSerializable,
  createGeneratorRecipeDocument,
  createSeededRandom,
  deepMerge,
  generateDomainValues,
  hashSeed,
  parseGeneratorRecipeDocument,
  stableStringify,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';
import { createCameraSettings } from './cameraSettings.js';

export const CAMERA_PRESET_SCHEMA_VERSION = 1;
export const CAMERA_PRESET_DOCUMENT_TYPE = 'toonlab/camera-preset';
export const CAMERA_GENERATOR_DOMAIN = 'camera';

export const DEFAULT_CAMERA_OPERATORS = Object.freeze([
  Object.freeze({ enabled: true, id: 'follow', order: 100, settings: Object.freeze({}), type: 'follow' }),
  Object.freeze({ enabled: true, id: 'look-ahead', order: 200, settings: Object.freeze({}), type: 'lookAhead' }),
  Object.freeze({ enabled: true, id: 'framing', order: 300, settings: Object.freeze({}), type: 'framing' }),
  Object.freeze({ enabled: true, id: 'collision', order: 400, settings: Object.freeze({}), type: 'collision' }),
  Object.freeze({ enabled: true, id: 'damping', order: 500, settings: Object.freeze({}), type: 'damping' }),
  Object.freeze({ enabled: true, id: 'lens', order: 600, settings: Object.freeze({}), type: 'lens' }),
  Object.freeze({ enabled: true, id: 'noise', order: 650, settings: Object.freeze({}), type: 'noise' }),
  Object.freeze({ enabled: true, id: 'impulse', order: 700, settings: Object.freeze({}), type: 'impulse' }),
]);

const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const cleanId = (value) => String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeCameraOperators(operators = DEFAULT_CAMERA_OPERATORS) {
  if (!Array.isArray(operators)) return DEFAULT_CAMERA_OPERATORS.map((operator) => ({ ...operator, settings: {} }));
  const used = new Set();
  return operators.map((source, index) => {
    const entry = plainObject(source) ? source : {};
    const type = cleanId(entry.type || `operator_${index}`);
    let id = cleanId(entry.id || `${type}_${index}`);
    while (used.has(id)) id = `${id}_${index}`;
    used.add(id);
    return {
      enabled: entry.enabled === undefined ? true : Boolean(entry.enabled),
      id,
      order: finite(entry.order, (index + 1) * 100),
      settings: plainObject(entry.settings) ? cloneSerializable(entry.settings) : {},
      type,
    };
  }).filter((operator) => operator.type);
}

function sanitizeGeneratorConfiguration(value = {}) {
  const source = plainObject(value) ? value : {};
  const parameters = plainObject(source.parameters) ? source.parameters : {};
  return {
    operators: normalizeCameraOperators(source.operators),
    parameters: {
      aimDepth: finite(parameters.aimDepth, 0),
      aimHeight: finite(parameters.aimHeight, 1.45),
      aimLateral: finite(parameters.aimLateral, 0),
      distance: Math.max(0.01, finite(parameters.distance, 6.4)),
      height: finite(parameters.height, 2.8),
      shoulder: finite(parameters.shoulder, 1.15),
    },
    settings: createCameraSettings(source.settings),
  };
}

const BASE_DOMAINS = Object.freeze({
  parameters: Object.freeze({
    aimDepth: Object.freeze({ $type: 'range', min: -1.2, max: 2.2, step: 0.01 }),
    aimHeight: Object.freeze({ $type: 'range', min: 0.6, max: 3.2, step: 0.01, distribution: 'normal' }),
    aimLateral: Object.freeze({ $type: 'range', min: -1.6, max: 1.6, step: 0.01 }),
    distance: Object.freeze({ $type: 'range', min: 3.2, max: 11.5, step: 0.01, distribution: 'normal' }),
    height: Object.freeze({ $type: 'range', min: 1.4, max: 6.5, step: 0.01, distribution: 'normal' }),
    shoulder: Object.freeze({ $type: 'range', min: -2.1, max: 2.1, step: 0.01 }),
  }),
  settings: Object.freeze({
    collision: Object.freeze({
      minimumDistance: Object.freeze({ $type: 'range', min: 0.5, max: 1.8, step: 0.01 }),
      radius: Object.freeze({ $type: 'range', min: 0.16, max: 0.52, step: 0.01 }),
      recoveryDamping: Object.freeze({ $type: 'range', min: 3, max: 12, step: 0.1 }),
    }),
    damping: Object.freeze({
      aim: Object.freeze({ $type: 'range', min: 5, max: 18, step: 0.1 }),
      lens: Object.freeze({ $type: 'range', min: 4, max: 15, step: 0.1 }),
      position: Object.freeze({ $type: 'range', min: 3.5, max: 14, step: 0.1 }),
    }),
    framing: Object.freeze({
      horizontalScale: Object.freeze({ $type: 'range', min: 0.25, max: 1.3, step: 0.01 }),
      screenX: Object.freeze({ $type: 'range', min: 0.38, max: 0.62, step: 0.01 }),
      screenY: Object.freeze({ $type: 'range', min: 0.42, max: 0.67, step: 0.01 }),
      verticalScale: Object.freeze({ $type: 'range', min: 0.2, max: 1.15, step: 0.01 }),
    }),
    impulse: Object.freeze({
      decay: Object.freeze({ $type: 'range', min: 7, max: 22, step: 0.1 }),
      positionScale: Object.freeze({ $type: 'range', min: 0.4, max: 1.8, step: 0.01 }),
      rotationScale: Object.freeze({ $type: 'range', min: 0.35, max: 1.8, step: 0.01 }),
    }),
    lens: Object.freeze({
      fov: Object.freeze({ $type: 'range', min: 32, max: 72, step: 0.1, distribution: 'normal' }),
      speedFov: Object.freeze({ $type: 'range', min: 0, max: 10, step: 0.1 }),
      speedReference: Object.freeze({ $type: 'range', min: 4, max: 18, step: 0.1 }),
    }),
    lookAhead: Object.freeze({
      maxDistance: Object.freeze({ $type: 'range', min: 0.6, max: 7, step: 0.05 }),
      smoothing: Object.freeze({ $type: 'range', min: 3, max: 16, step: 0.1 }),
      time: Object.freeze({ $type: 'range', min: 0.08, max: 0.9, step: 0.01 }),
    }),
    noise: Object.freeze({
      enabled: Object.freeze({ $type: 'choice', options: Object.freeze([
        Object.freeze({ value: false, weight: 3 }),
        Object.freeze({ value: true, weight: 1 }),
      ]) }),
      frequency: Object.freeze({ $type: 'range', min: 0.18, max: 2.4, step: 0.01 }),
      positionAmplitude: Object.freeze({ $type: 'range', min: 0.005, max: 0.06, step: 0.001 }),
      rotationAmplitude: Object.freeze({ $type: 'range', min: 0.001, max: 0.012, step: 0.001 }),
      octaves: Object.freeze({ $type: 'range', min: 1, max: 4, integer: true }),
      persistence: Object.freeze({ $type: 'range', min: 0.35, max: 0.72, step: 0.01 }),
      lacunarity: Object.freeze({ $type: 'range', min: 1.5, max: 2.6, step: 0.01 }),
      seed: Object.freeze({ $type: 'range', min: 1, max: 1000000, integer: true }),
    }),
  }),
});

const archetypeRegistry = new Map();

function registerBuiltInArchetypes() {
  registerCameraGeneratorArchetype('adventure', {
    description: 'Responsive over-shoulder seed family for traversal and lightweight combat.',
    label: 'Adventure Seed',
    configuration: sanitizeGeneratorConfiguration({}),
    domains: BASE_DOMAINS,
  });
  registerCameraGeneratorArchetype('close_action', {
    description: 'Closer, faster response family with stronger impacts. Every field remains generative.',
    label: 'Close Action Seed',
    configuration: sanitizeGeneratorConfiguration({
      parameters: { distance: 4.5, height: 2.1, shoulder: 0.85, aimHeight: 1.25 },
      settings: {
        damping: { position: 12, aim: 16 },
        lens: { fov: 56, speedFov: 7 },
        impulse: { positionScale: 1.35, rotationScale: 1.25 },
      },
    }),
    domains: deepMerge(BASE_DOMAINS, {
      parameters: {
        distance: { $type: 'range', min: 2.6, max: 6.2, step: 0.01, distribution: 'normal' },
        height: { $type: 'range', min: 1.2, max: 3.6, step: 0.01 },
      },
      settings: { lens: { fov: { $type: 'range', min: 44, max: 72, step: 0.1 } } },
    }),
  });
  registerCameraGeneratorArchetype('wide_exploration', {
    description: 'Wide scenic framing family for world exploration and traversal reveals.',
    label: 'Wide Exploration Seed',
    configuration: sanitizeGeneratorConfiguration({
      parameters: { distance: 10.5, height: 5.1, shoulder: 0.2, aimHeight: 2 },
      settings: { damping: { position: 4.8, aim: 6 }, lens: { fov: 40, speedFov: 2 } },
    }),
    domains: deepMerge(BASE_DOMAINS, {
      parameters: {
        distance: { $type: 'range', min: 7, max: 18, step: 0.01, distribution: 'normal' },
        height: { $type: 'range', min: 3.2, max: 10, step: 0.01, distribution: 'normal' },
        shoulder: { $type: 'range', min: -1, max: 1, step: 0.01 },
      },
      settings: { lens: { fov: { $type: 'range', min: 25, max: 52, step: 0.1 } } },
    }),
  });
}

export function registerCameraGeneratorArchetype(id, definition = {}, { overwrite = false } = {}) {
  const clean = cleanId(id);
  if (!clean) throw new Error('Camera generator archetype id is required.');
  if (!overwrite && archetypeRegistry.has(clean)) throw new Error(`Camera generator archetype "${clean}" already exists.`);
  const source = plainObject(definition) ? definition : {};
  archetypeRegistry.set(clean, {
    configuration: sanitizeGeneratorConfiguration(source.configuration),
    description: String(source.description ?? ''),
    domains: cloneSerializable(plainObject(source.domains) ? source.domains : {}),
    label: String(source.label || clean),
  });
  return { id: clean, label: String(source.label || clean) };
}

export function getCameraGeneratorArchetypeOptions() {
  return [...archetypeRegistry].map(([id, entry]) => ({ description: entry.description, id, label: entry.label }));
}

export function createCameraGeneratorRecipeDocument(id = 'camera_recipe', definition = {}) {
  const source = plainObject(definition) ? definition : {};
  const archetype = archetypeRegistry.get(source.basePreset) ?? archetypeRegistry.get('adventure');
  return createGeneratorRecipeDocument(CAMERA_GENERATOR_DOMAIN, id, {
    ...source,
    basePreset: source.basePreset ?? 'adventure',
    configuration: deepMerge(archetype?.configuration, source.configuration),
    domains: source.domains ?? archetype?.domains ?? BASE_DOMAINS,
  }, { sanitizeConfiguration: sanitizeGeneratorConfiguration });
}

export function validateCameraGeneratorRecipeDocument(input) {
  return validateGeneratorRecipeDocument(input, {
    domain: CAMERA_GENERATOR_DOMAIN,
    sanitizeConfiguration: sanitizeGeneratorConfiguration,
  });
}

export function parseCameraGeneratorRecipeDocument(input) {
  return parseGeneratorRecipeDocument(input, {
    domain: CAMERA_GENERATOR_DOMAIN,
    sanitizeConfiguration: sanitizeGeneratorConfiguration,
  });
}

export function serializeCameraGeneratorRecipeDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = plainObject(idOrDocument)
    ? createCameraGeneratorRecipeDocument(idOrDocument.id, idOrDocument)
    : createCameraGeneratorRecipeDocument(idOrDocument, definition);
  return stableStringify(document, pretty ? 2 : 0);
}

function composeSettings(configuration) {
  const clean = sanitizeGeneratorConfiguration(configuration);
  const p = clean.parameters;
  return createCameraSettings(deepMerge(clean.settings, {
    follow: {
      offset: [p.shoulder, p.height, p.distance],
      targetOffset: [p.aimLateral, p.aimHeight, p.aimDepth],
    },
  }));
}

function isPathLocked(locks, path) {
  const id = path.join('.');
  return locks.some((lock) => id === lock || id.startsWith(`${lock}.`));
}

function blendMutation(current, candidate, amount, locks, random, path = []) {
  if (isPathLocked(locks, path)) return cloneSerializable(current ?? candidate);
  if (typeof current === 'number' && typeof candidate === 'number') {
    return current + (candidate - current) * amount;
  }
  if (Array.isArray(current) && Array.isArray(candidate)) {
    return candidate.map((value, index) => blendMutation(current[index], value, amount, locks, random, [...path, index]));
  }
  if (plainObject(current) && plainObject(candidate)) {
    const keys = new Set([...Object.keys(current), ...Object.keys(candidate)]);
    return Object.fromEntries([...keys].map((key) => [key, blendMutation(current[key], candidate[key], amount, locks, random, [...path, key])]));
  }
  return random.fork(path.join('.')).bool(amount) ? cloneSerializable(candidate) : cloneSerializable(current ?? candidate);
}

export function validateCameraPresetDocument(input) {
  const errors = [];
  const warnings = [];
  if (!plainObject(input)) return { errors: ['Camera preset must be a JSON object.'], ok: false, value: null, warnings };
  if (input.type !== CAMERA_PRESET_DOCUMENT_TYPE) errors.push(`Camera preset type must be "${CAMERA_PRESET_DOCUMENT_TYPE}".`);
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1) errors.push('Camera preset version must be a positive integer.');
  if (version > CAMERA_PRESET_SCHEMA_VERSION) errors.push(`Camera preset version ${version} is newer than supported version ${CAMERA_PRESET_SCHEMA_VERSION}.`);
  const id = cleanId(input.id);
  if (!id) errors.push('Camera preset id is required.');
  const operators = normalizeCameraOperators(input.operators);
  if (operators.length === 0) warnings.push('Camera preset has no operators and will not move the camera.');
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length ? null : {
      description: String(input.description ?? ''),
      id,
      label: String(input.label || id),
      operators,
      seed: hashSeed(input.seed ?? 1),
      settings: createCameraSettings(input.settings),
      type: CAMERA_PRESET_DOCUMENT_TYPE,
      version: CAMERA_PRESET_SCHEMA_VERSION,
    },
    warnings,
  };
}

export function createCameraPresetDocument(id = 'camera_preset', definition = {}) {
  const source = plainObject(definition) ? definition : {};
  const result = validateCameraPresetDocument({
    description: source.description ?? '',
    id: id ?? source.id,
    label: source.label ?? source.name ?? id,
    operators: source.operators,
    seed: source.seed ?? 1,
    settings: source.settings,
    type: CAMERA_PRESET_DOCUMENT_TYPE,
    version: CAMERA_PRESET_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function parseCameraPresetDocument(input) {
  try {
    return validateCameraPresetDocument(typeof input === 'string' ? JSON.parse(input) : input);
  } catch (error) {
    return { errors: [`Invalid camera preset JSON: ${error.message}`], ok: false, value: null, warnings: [] };
  }
}

export function serializeCameraPresetDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = plainObject(idOrDocument)
    ? createCameraPresetDocument(idOrDocument.id, idOrDocument)
    : createCameraPresetDocument(idOrDocument, definition);
  return stableStringify(document, pretty ? 2 : 0);
}

/**
 * Generates a deterministic resolved preset. `mutation` blends continuous
 * values around the current candidate; locks are dot paths into the recipe's
 * configuration (for example `settings.lens.fov` or `parameters.distance`).
 */
export function generateCameraPreset(recipeInput, {
  current = null,
  locks = null,
  mutation = 1,
  seed = null,
} = {}) {
  const result = validateCameraGeneratorRecipeDocument(recipeInput);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const recipe = result.value;
  const resolvedSeed = hashSeed(seed ?? recipe.seed);
  const lockPaths = Array.isArray(locks) ? locks.map(String) : recipe.locks;
  const archetype = archetypeRegistry.get(recipe.basePreset);
  const base = deepMerge(archetype?.configuration, recipe.configuration);
  const currentConfiguration = plainObject(current?.generatorConfiguration)
    ? sanitizeGeneratorConfiguration(current.generatorConfiguration)
    : base;
  const sampled = generateDomainValues(recipe.domains, {
    current: currentConfiguration,
    locks: lockPaths,
    seed: resolvedSeed,
  });
  let configuration = deepMerge(base, sampled);
  const amount = Math.min(Math.max(finite(mutation, 1), 0), 1);
  if (current && amount < 1) {
    configuration = blendMutation(
      currentConfiguration,
      configuration,
      amount,
      lockPaths,
      createSeededRandom(resolvedSeed, 'camera-mutation'),
    );
  }
  const preset = createCameraPresetDocument(`${recipe.id}_${resolvedSeed}`, {
    description: `Generated from ${recipe.label}.`,
    label: `${recipe.label} ${resolvedSeed}`,
    operators: configuration.operators,
    seed: resolvedSeed,
    settings: composeSettings(configuration),
  });
  // Non-enumerable authoring provenance keeps the shipping preset flat while
  // allowing design-time mutation to preserve locked source parameters.
  Object.defineProperty(preset, 'generatorConfiguration', {
    configurable: true,
    enumerable: false,
    value: sanitizeGeneratorConfiguration(configuration),
  });
  return preset;
}

registerBuiltInArchetypes();
