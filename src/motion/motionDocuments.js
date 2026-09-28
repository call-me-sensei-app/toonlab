import { parsePresetDocument } from '../core/presetDocuments.js';
import {
  createGeneratorRecipeDocument,
  deepMerge,
  generateDomainValues,
  hashSeed,
  hashValue,
  parseGeneratorRecipeDocument,
  stableStringify,
  validateGeneratorRecipeDocument,
} from '../core/generation.js';
import {
  DEFAULT_MOTION_CLIP_SLOTS,
  DEFAULT_MOTION_GRAPH,
  createMotionClipSlots,
  createMotionGraph,
  validateMotionGraph,
} from './motionGraph.js';
import { createMotionSettings } from './motionSettings.js';

export const MOTION_PRESET_DOCUMENT_TYPE = 'toonlab/motion-preset';
export const MOTION_PRESET_SCHEMA_VERSION = 1;
export const MOTION_GENERATOR_DOCUMENT_TYPE = 'toonlab/motion-generator';

const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanId = (value) => String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');

/** Complete portable configuration shared by presets, recipes, Labs, and MCP. */
export function createMotionConfiguration(options = {}) {
  const source = plain(options?.configuration) ? options.configuration : (plain(options) ? options : {});
  return {
    settings: createMotionSettings(source.settings),
    graph: createMotionGraph(source.graph),
    clipSlots: createMotionClipSlots(source.clipSlots),
  };
}

export function validateMotionPresetDocument(input) {
  const errors = [];
  const warnings = [];
  if (!plain(input)) return { errors: ['Motion preset must be a JSON object.'], ok: false, value: null, warnings };
  if (input.type !== MOTION_PRESET_DOCUMENT_TYPE) errors.push(`Motion preset type must be "${MOTION_PRESET_DOCUMENT_TYPE}".`);
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1) errors.push('Motion preset version must be a positive integer.');
  if (version > MOTION_PRESET_SCHEMA_VERSION) errors.push(`Motion preset version ${version} is newer than supported version ${MOTION_PRESET_SCHEMA_VERSION}.`);
  const id = cleanId(input.id);
  if (!id) errors.push('Motion preset id is required.');
  const source = plain(input.configuration)
    ? input.configuration
    : { settings: input.settings, graph: input.graph, clipSlots: input.clipSlots };
  const configuration = createMotionConfiguration(source);
  const graphResult = validateMotionGraph(configuration.graph, { clipSlots: configuration.clipSlots });
  errors.push(...graphResult.errors);
  warnings.push(...graphResult.warnings);
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length ? null : {
      type: MOTION_PRESET_DOCUMENT_TYPE,
      version: MOTION_PRESET_SCHEMA_VERSION,
      id,
      label: String(input.label || id),
      description: String(input.description ?? ''),
      configuration,
      ...(plain(input.generation) ? { generation: {
        recipeId: cleanId(input.generation.recipeId),
        seed: hashSeed(input.generation.seed ?? 1),
        signature: String(input.generation.signature ?? ''),
      } } : {}),
    },
    warnings: [...new Set(warnings)],
  };
}

export function createMotionPresetDocument(id, definition = {}) {
  const source = plain(definition) ? definition : {};
  const result = validateMotionPresetDocument({
    type: MOTION_PRESET_DOCUMENT_TYPE,
    version: MOTION_PRESET_SCHEMA_VERSION,
    id: id ?? source.id,
    label: source.label ?? source.name ?? id,
    description: source.description ?? '',
    configuration: createMotionConfiguration(source.configuration ?? source),
    ...(source.generation ? { generation: source.generation } : {}),
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function parseMotionPresetDocument(input) {
  return parsePresetDocument(input, validateMotionPresetDocument, { invalidJsonLabel: 'motion preset' });
}

export function serializeMotionPresetDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = plain(idOrDocument)
    ? createMotionPresetDocument(idOrDocument.id, idOrDocument)
    : createMotionPresetDocument(idOrDocument, definition);
  return stableStringify(document, pretty ? 2 : 0);
}

/** Wrapper around the shared generator schema with motion-specific sanitation. */
export function validateMotionGeneratorRecipeDocument(input) {
  const result = validateGeneratorRecipeDocument(input, {
    domain: 'motion',
    sanitizeConfiguration: createMotionConfiguration,
  });
  if (!result.ok) return result;
  const graphResult = validateMotionGraph(result.value.configuration.graph, {
    clipSlots: result.value.configuration.clipSlots,
  });
  return {
    ...result,
    errors: [...result.errors, ...graphResult.errors],
    ok: result.ok && graphResult.ok,
    value: graphResult.ok ? result.value : null,
    warnings: [...new Set([...result.warnings, ...graphResult.warnings])],
  };
}

export function createMotionGeneratorRecipeDocument(id, definition = {}) {
  const document = createGeneratorRecipeDocument('motion', id, {
    ...definition,
    configuration: createMotionConfiguration(definition.configuration ?? definition),
  }, { sanitizeConfiguration: createMotionConfiguration });
  const result = validateMotionGeneratorRecipeDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function parseMotionGeneratorRecipeDocument(input) {
  const parsed = parseGeneratorRecipeDocument(input, {
    domain: 'motion',
    sanitizeConfiguration: createMotionConfiguration,
  });
  return parsed.ok ? validateMotionGeneratorRecipeDocument(parsed.value) : parsed;
}

export function serializeMotionGeneratorRecipeDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = plain(idOrDocument)
    ? createMotionGeneratorRecipeDocument(idOrDocument.id, idOrDocument)
    : createMotionGeneratorRecipeDocument(idOrDocument, definition);
  return stableStringify(document, pretty ? 2 : 0);
}

export const DEFAULT_MOTION_GENERATOR_DOMAINS = Object.freeze({
  settings: Object.freeze({
    playback: Object.freeze({
      cadence: Object.freeze({ $type: 'choice', options: Object.freeze([
        Object.freeze({ value: 'smooth', weight: 3 }),
        Object.freeze({ value: 'stepped', weight: 2 }),
      ]) }),
      sampleRate: Object.freeze({ $type: 'range', min: 10, max: 30, integer: true }),
      speed: Object.freeze({ $type: 'range', min: 0.88, max: 1.16, step: 0.01 }),
    }),
    transitions: Object.freeze({
      duration: Object.freeze({ $type: 'range', min: 0.08, max: 0.32, step: 0.01 }),
    }),
    lean: Object.freeze({
      maxAngle: Object.freeze({ $type: 'range', min: 0.08, max: 0.32, step: 0.01 }),
      response: Object.freeze({ $type: 'range', min: 6, max: 18, step: 0.5 }),
    }),
    bob: Object.freeze({
      amplitude: Object.freeze({ $type: 'range', min: 0.012, max: 0.075, step: 0.001 }),
      frequency: Object.freeze({ $type: 'range', min: 1.2, max: 2.8, step: 0.05 }),
      lateral: Object.freeze({ $type: 'range', min: 0, max: 0.035, step: 0.001 }),
    }),
    squash: Object.freeze({
      amount: Object.freeze({ $type: 'range', min: 0.02, max: 0.16, step: 0.005 }),
      response: Object.freeze({ $type: 'range', min: 8, max: 24, step: 0.5 }),
    }),
  }),
});

export function createDefaultMotionGeneratorRecipe(options = {}) {
  return createMotionGeneratorRecipeDocument(options.id ?? 'motion-family', {
    label: options.label ?? 'Generative Motion Family',
    description: options.description ?? 'An unrestricted motion graph with generated timing and presentation style.',
    seed: options.seed ?? 2027,
    configuration: {
      settings: options.settings,
      graph: options.graph ?? DEFAULT_MOTION_GRAPH,
      clipSlots: options.clipSlots ?? DEFAULT_MOTION_CLIP_SLOTS,
    },
    domains: options.domains ?? DEFAULT_MOTION_GENERATOR_DOMAINS,
    locks: options.locks ?? [],
  });
}

/** Resolves one deterministic seed from an unlimited recipe family. */
export function resolveMotionGeneratorRecipe(input, {
  seed = undefined,
  current = undefined,
  baseConfiguration = undefined,
  resolveBasePreset = null,
  presetId = undefined,
  label = undefined,
} = {}) {
  const validation = validateMotionGeneratorRecipeDocument(input);
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  const recipe = validation.value;
  const resolvedSeed = hashSeed(seed ?? recipe.seed);
  let inherited = baseConfiguration ? createMotionConfiguration(baseConfiguration) : createMotionConfiguration();
  if (recipe.basePreset && typeof resolveBasePreset === 'function') {
    const base = resolveBasePreset(recipe.basePreset);
    if (base) inherited = createMotionConfiguration(base.configuration ?? base);
  }
  const existing = createMotionConfiguration(current ?? recipe.configuration);
  const generated = generateDomainValues(recipe.domains, {
    current: existing,
    locks: recipe.locks,
    seed: resolvedSeed,
  });
  const configuration = createMotionConfiguration(deepMerge(inherited, recipe.configuration, generated));
  const signature = hashValue(configuration);
  return createMotionPresetDocument(presetId ?? `${recipe.id}-${resolvedSeed}`, {
    label: label ?? `${recipe.label} · ${resolvedSeed}`,
    description: recipe.description,
    configuration,
    generation: { recipeId: recipe.id, seed: resolvedSeed, signature },
  });
}

export function motionConfigurationSignature(configuration) {
  return hashValue(createMotionConfiguration(configuration));
}
