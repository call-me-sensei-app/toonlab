// Shared deterministic generation primitives used by ToonLab runtimes and
// design-time labs. The package owns these algorithms so a recipe produces
// the same result in a lab, through MCP, and inside a shipped game.

import { parsePresetDocument } from './presetDocuments.js';

export const GENERATOR_RECIPE_SCHEMA_VERSION = 1;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneSerializable(value) {
  if (value === undefined) return undefined;
  // Runtime settings may contain Three.js value objects (Color, Vector*,
  // Matrix*) whose prototypes structuredClone would erase. Preserve their
  // public clone contract while recursively copying JSON-shaped documents.
  if (value && typeof value.clone === 'function') return value.clone();
  if (Array.isArray(value)) return value.map(cloneSerializable);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneSerializable(entry)]));
  }
  return value;
}

/** Stable FNV-1a hash. Strings and numbers are accepted as public seeds. */
export function hashSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return (value >>> 0) || 1;
  const source = typeof value === 'string' ? value : JSON.stringify(value ?? 1);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

export function deriveSeed(seed, namespace) {
  return hashSeed(`${hashSeed(seed)}:${String(namespace ?? '')}`);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic stream. `fork(label)` is derived from the stream's
 * root seed rather than its current cursor, so adding an unrelated field does
 * not perturb existing generated values.
 */
export function createSeededRandom(seed = 1, namespace = 'root') {
  const rootSeed = deriveSeed(seed, namespace);
  const nextValue = mulberry32(rootSeed);
  let spareNormal = null;

  const api = {
    seed: rootSeed,
    next() {
      return nextValue();
    },
    float(min = 0, max = 1) {
      const lo = Number(min);
      const hi = Number(max);
      return lo + (hi - lo) * nextValue();
    },
    int(min = 0, max = 1) {
      const lo = Math.ceil(Number(min));
      const hi = Math.floor(Number(max));
      if (hi <= lo) return lo;
      return lo + Math.floor(nextValue() * (hi - lo + 1));
    },
    bool(probability = 0.5) {
      return nextValue() < Math.min(Math.max(Number(probability), 0), 1);
    },
    normal(mean = 0, deviation = 1) {
      if (spareNormal !== null) {
        const value = spareNormal;
        spareNormal = null;
        return Number(mean) + value * Number(deviation);
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = nextValue();
      while (v === 0) v = nextValue();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      const angle = 2 * Math.PI * v;
      spareNormal = magnitude * Math.sin(angle);
      return Number(mean) + magnitude * Math.cos(angle) * Number(deviation);
    },
    pick(values = []) {
      return values.length > 0 ? values[Math.floor(nextValue() * values.length)] : undefined;
    },
    weighted(options = []) {
      const entries = options.map((entry) => (
        isPlainObject(entry) && Object.hasOwn(entry, 'value')
          ? { value: entry.value, weight: Math.max(Number(entry.weight) || 0, 0) }
          : { value: entry, weight: 1 }
      ));
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      if (entries.length === 0) return undefined;
      if (total <= 0) return entries[0].value;
      let cursor = nextValue() * total;
      for (const entry of entries) {
        cursor -= entry.weight;
        if (cursor <= 0) return cloneSerializable(entry.value);
      }
      return cloneSerializable(entries.at(-1).value);
    },
    fork(label) {
      return createSeededRandom(rootSeed, label);
    },
  };
  return api;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function quantize(value, step, origin = 0) {
  if (!(Number(step) > 0)) return value;
  return origin + Math.round((value - origin) / step) * step;
}

function sampleColor(domain, random) {
  const from = Array.isArray(domain.from) ? domain.from : [0, 0, 0];
  const to = Array.isArray(domain.to) ? domain.to : from;
  const shared = domain.linked === true ? random.next() : null;
  return from.map((channel, index) => {
    const amount = shared ?? random.fork(index).next();
    return Number(channel) + (Number(to[index] ?? channel) - Number(channel)) * amount;
  });
}

/** Samples a domain leaf. Domain leaves are explicitly tagged with `$type`. */
export function sampleDomain(domain, random = createSeededRandom(1)) {
  if (!isPlainObject(domain) || !domain.$type) return cloneSerializable(domain);
  switch (domain.$type) {
    case 'constant':
      return cloneSerializable(domain.value);
    case 'boolean':
      return random.bool(domain.probability ?? 0.5);
    case 'choice':
      return random.weighted(domain.options ?? domain.values ?? []);
    case 'color':
      return sampleColor(domain, random);
    case 'range': {
      const min = Number(domain.min ?? 0);
      const max = Number(domain.max ?? 1);
      let value;
      if (domain.distribution === 'normal') {
        const mean = Number(domain.mean ?? ((min + max) / 2));
        const deviation = Number(domain.deviation ?? ((max - min) / 6));
        value = clamp(random.normal(mean, deviation), min, max);
      } else if (domain.distribution === 'log') {
        const safeMin = Math.max(min, Number.EPSILON);
        const safeMax = Math.max(max, safeMin);
        value = Math.exp(random.float(Math.log(safeMin), Math.log(safeMax)));
      } else {
        value = random.float(min, max);
      }
      if (domain.integer) value = Math.round(value);
      return clamp(quantize(value, domain.step, min), min, max);
    }
    default:
      throw new Error(`Unknown generator domain type "${domain.$type}".`);
  }
}

function getPath(source, path) {
  let value = source;
  for (const key of path) {
    if (!value || typeof value !== 'object') return undefined;
    value = value[key];
  }
  return value;
}

function isLocked(locks, path) {
  const id = path.join('.');
  return locks.has(id) || [...locks].some((lock) => id.startsWith(`${lock}.`));
}

/**
 * Resolves a nested domain tree. Each leaf receives a named path stream, so
 * schema additions are deterministic and backward-friendly.
 */
export function generateDomainValues(domains = {}, {
  current = {},
  locks = [],
  seed = 1,
} = {}) {
  const lockSet = new Set(Array.isArray(locks) ? locks.map(String) : []);
  const rootRandom = createSeededRandom(seed, 'domains');

  function visit(node, path) {
    if (isPlainObject(node) && node.$type) {
      const existing = getPath(current, path);
      if (isLocked(lockSet, path) && existing !== undefined) return cloneSerializable(existing);
      return sampleDomain(node, rootRandom.fork(path.join('.')));
    }
    if (Array.isArray(node)) return cloneSerializable(node);
    if (!isPlainObject(node)) return cloneSerializable(node);
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, visit(value, [...path, key])]));
  }

  return visit(domains, []);
}

export function deepMerge(...sources) {
  const output = {};
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (isPlainObject(value) && !value.$type) {
        output[key] = deepMerge(isPlainObject(output[key]) ? output[key] : {}, value);
      } else {
        output[key] = cloneSerializable(value);
      }
    }
  }
  return output;
}

function normalizeForStableJson(value) {
  if (Array.isArray(value)) return value.map(normalizeForStableJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeForStableJson(value[key])]));
}

export function stableStringify(value, space = 0) {
  return JSON.stringify(normalizeForStableJson(value), null, space);
}

export function hashValue(value) {
  return hashSeed(stableStringify(value)).toString(16).padStart(8, '0');
}

function normalizeGeneratorId(value) {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
}

function generatorDocumentType(domain) {
  return `toonlab/${String(domain || 'style')}-generator`;
}

const GENERATOR_DOMAIN_TYPES = new Set(['boolean', 'choice', 'color', 'constant', 'range']);

function domainPath(path) {
  return path.length > 0 ? `domains.${path.join('.')}` : 'domains';
}

function inspectSerializableLiteral(value, path, errors, stack = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path} must contain only finite numbers.`);
    return;
  }
  if (typeof value === 'undefined' || typeof value === 'function'
    || typeof value === 'symbol' || typeof value === 'bigint') {
    errors.push(`${path} must be JSON-serializable.`);
    return;
  }
  if (typeof value !== 'object') return;
  if (stack.has(value)) {
    errors.push(`${path} cannot contain a circular reference.`);
    return;
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    errors.push(`${path} must contain only JSON objects and arrays.`);
    return;
  }
  stack.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSerializableLiteral(entry, `${path}[${index}]`, errors, stack));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      inspectSerializableLiteral(entry, `${path}.${key}`, errors, stack);
    }
  }
  stack.delete(value);
}

/**
 * Validates the shared open-domain grammar before a recipe reaches sampling.
 * This keeps malformed MCP/imported recipes from validating successfully and
 * then failing later inside a lab or runtime generation call.
 */
export function validateGeneratorDomains(input) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(input)) {
    return { errors: ['domains must be a JSON object.'], ok: false, warnings };
  }
  const stack = new WeakSet();

  function finite(value, path, { optional = false } = {}) {
    if (optional && value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) errors.push(`${path} must be a finite number.`);
    return parsed;
  }

  function inspectLeaf(leaf, path) {
    const label = domainPath(path);
    const type = leaf.$type;
    if (typeof type !== 'string' || !GENERATOR_DOMAIN_TYPES.has(type)) {
      errors.push(`${label} has unknown generator domain type "${String(type)}".`);
      return;
    }
    if (type === 'constant') {
      if (!Object.hasOwn(leaf, 'value')) errors.push(`${label}.value is required for a constant domain.`);
      else inspectSerializableLiteral(leaf.value, `${label}.value`, errors);
      return;
    }
    if (type === 'boolean') {
      if (leaf.probability !== undefined) {
        const probability = finite(leaf.probability, `${label}.probability`);
        if (Number.isFinite(probability) && (probability < 0 || probability > 1)) {
          errors.push(`${label}.probability must be between 0 and 1.`);
        }
      }
      return;
    }
    if (type === 'choice') {
      const options = leaf.options ?? leaf.values;
      if (!Array.isArray(options) || options.length === 0) {
        errors.push(`${label}.options must be a non-empty array.`);
        return;
      }
      let weightedCount = 0;
      let positiveWeightCount = 0;
      options.forEach((entry, index) => {
        const optionPath = `${label}.options[${index}]`;
        if (isPlainObject(entry) && Object.hasOwn(entry, 'value')) {
          weightedCount += 1;
          inspectSerializableLiteral(entry.value, `${optionPath}.value`, errors);
          if (entry.weight !== undefined) {
            const weight = finite(entry.weight, `${optionPath}.weight`);
            if (Number.isFinite(weight) && weight < 0) errors.push(`${optionPath}.weight cannot be negative.`);
            if (weight > 0) positiveWeightCount += 1;
          } else {
            positiveWeightCount += 1;
          }
        } else {
          positiveWeightCount += 1;
          inspectSerializableLiteral(entry, optionPath, errors);
        }
      });
      if (weightedCount > 0 && positiveWeightCount === 0) {
        warnings.push(`${label} has no positive weights and will always choose its first option.`);
      }
      return;
    }
    if (type === 'color') {
      for (const key of ['from', 'to']) {
        const value = leaf[key];
        if (key === 'to' && value === undefined) continue;
        if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
          errors.push(`${label}.${key} must be an RGB or RGBA array.`);
          continue;
        }
        value.forEach((channel, index) => finite(channel, `${label}.${key}[${index}]`));
      }
      if (leaf.linked !== undefined && typeof leaf.linked !== 'boolean') {
        errors.push(`${label}.linked must be a boolean.`);
      }
      return;
    }

    const min = finite(leaf.min, `${label}.min`);
    const max = finite(leaf.max, `${label}.max`);
    if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
      errors.push(`${label}.max must be greater than or equal to min.`);
    }
    if (leaf.step !== undefined) {
      const step = finite(leaf.step, `${label}.step`);
      if (Number.isFinite(step) && step <= 0) errors.push(`${label}.step must be greater than zero.`);
    }
    if (leaf.integer !== undefined && typeof leaf.integer !== 'boolean') {
      errors.push(`${label}.integer must be a boolean.`);
    }
    const distribution = leaf.distribution ?? 'uniform';
    if (!['uniform', 'normal', 'log'].includes(distribution)) {
      errors.push(`${label}.distribution must be uniform, normal, or log.`);
    }
    if (distribution === 'normal') {
      finite(leaf.mean, `${label}.mean`, { optional: true });
      const deviation = finite(leaf.deviation, `${label}.deviation`, { optional: true });
      if (Number.isFinite(deviation) && deviation < 0) errors.push(`${label}.deviation cannot be negative.`);
    }
    if (distribution === 'log' && Number.isFinite(min) && min <= 0) {
      errors.push(`${label}.min must be greater than zero for a log distribution.`);
    }
  }

  function visit(node, path) {
    if (isPlainObject(node) && Object.hasOwn(node, '$type')) {
      inspectLeaf(node, path);
      return;
    }
    if (Array.isArray(node) || !isPlainObject(node)) {
      inspectSerializableLiteral(node, domainPath(path), errors);
      return;
    }
    if (stack.has(node)) {
      errors.push(`${domainPath(path)} cannot contain a circular reference.`);
      return;
    }
    stack.add(node);
    for (const [key, value] of Object.entries(node)) visit(value, [...path, key]);
    stack.delete(node);
  }

  visit(input, []);
  return { errors, ok: errors.length === 0, warnings };
}

export function validateGeneratorRecipeDocument(input, {
  domain,
  sanitizeConfiguration = (value) => cloneSerializable(value),
} = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(input)) {
    return { errors: ['Generator recipe must be a JSON object.'], ok: false, value: null, warnings };
  }
  const expectedType = generatorDocumentType(domain);
  if (input.type !== expectedType) errors.push(`Generator recipe type must be "${expectedType}".`);
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1) errors.push('Generator recipe version must be a positive integer.');
  if (version > GENERATOR_RECIPE_SCHEMA_VERSION) {
    errors.push(`Generator recipe version ${version} is newer than supported version ${GENERATOR_RECIPE_SCHEMA_VERSION}.`);
  }
  const id = normalizeGeneratorId(input.id);
  if (!id) errors.push('Generator recipe id is required.');
  const seed = hashSeed(input.seed ?? 1);
  let domains = {};
  if (input.domains !== undefined && !isPlainObject(input.domains)) {
    errors.push('domains must be a JSON object.');
  } else {
    const domainResult = validateGeneratorDomains(input.domains ?? {});
    errors.push(...domainResult.errors);
    warnings.push(...domainResult.warnings);
    if (domainResult.ok) domains = cloneSerializable(input.domains ?? {});
  }
  const locks = Array.isArray(input.locks) ? [...new Set(input.locks.map(String))] : [];
  let configuration = {};
  try {
    configuration = sanitizeConfiguration(isPlainObject(input.configuration) ? input.configuration : {});
  } catch (error) {
    errors.push(error.message);
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length > 0 ? null : {
      basePreset: input.basePreset == null ? null : String(input.basePreset),
      configuration,
      description: String(input.description ?? ''),
      domains,
      id,
      label: String(input.label || id),
      locks,
      seed,
      type: expectedType,
      version: GENERATOR_RECIPE_SCHEMA_VERSION,
    },
    warnings,
  };
}

export function createGeneratorRecipeDocument(domain, id, definition = {}, options = {}) {
  const source = isPlainObject(definition) ? definition : {};
  const result = validateGeneratorRecipeDocument({
    basePreset: source.basePreset ?? null,
    configuration: source.configuration ?? source.settings ?? {},
    description: source.description ?? '',
    domains: source.domains ?? {},
    id: id ?? source.id,
    label: source.label ?? source.name ?? id,
    locks: source.locks ?? [],
    seed: source.seed ?? 1,
    type: generatorDocumentType(domain),
    version: GENERATOR_RECIPE_SCHEMA_VERSION,
  }, { domain, ...options });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function parseGeneratorRecipeDocument(input, options = {}) {
  return parsePresetDocument(
    input,
    (source) => validateGeneratorRecipeDocument(source, options),
    { invalidJsonLabel: `${options.domain || 'style'} generator recipe` },
  );
}

export function serializeGeneratorRecipeDocument(domain, idOrDocument, definition = {}, {
  pretty = true,
  ...options
} = {}) {
  const document = isPlainObject(idOrDocument)
    ? createGeneratorRecipeDocument(domain, idOrDocument.id, idOrDocument, options)
    : createGeneratorRecipeDocument(domain, idOrDocument, definition, options);
  return stableStringify(document, pretty ? 2 : 0);
}

/** Resolves a recipe into flat settings ready for a runtime normalizer. */
export function resolveGeneratorRecipe(recipe, {
  baseSettings = {},
  sanitizeSettings = (value) => value,
} = {}) {
  const generated = generateDomainValues(recipe?.domains ?? {}, {
    current: recipe?.configuration ?? {},
    locks: recipe?.locks ?? [],
    seed: recipe?.seed ?? 1,
  });
  return sanitizeSettings(deepMerge(baseSettings, recipe?.configuration, generated));
}
