import { createHash } from 'node:crypto';

import { RockGeologyError } from './errors.js';

export function canonicalizeJson(value) {
  return freezeCanonical(value, '$', new Set());
}

export function canonicalStringify(value, options = {}) {
  const indentation = options.pretty === true ? 2 : 0;
  return JSON.stringify(canonicalizeJson(value), null, indentation);
}

export function contentId(value) {
  const digest = createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
  return `sha256:${digest}`;
}

export function contentIdFromText(value) {
  if (typeof value !== 'string') {
    throw new RockGeologyError('CONTENT_TEXT_REQUIRED', 'Content identity input must be a string.', {
      path: '$',
      suggestion: 'Serialize structured values with canonicalStringify before hashing.',
    });
  }
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function deriveNamespacedSeed(rootSeed, namespace) {
  if (!Number.isInteger(rootSeed) || rootSeed < 1 || rootSeed > 0xffffffff) {
    throw new RockGeologyError('SEED_OUT_OF_RANGE', 'Root seed must be an unsigned non-zero 32-bit integer.', {
      path: '$.seed',
      suggestion: 'Use an integer from 1 through 4294967295.',
      details: { received: rootSeed },
    });
  }
  if (typeof namespace !== 'string' || namespace.length === 0) {
    throw new RockGeologyError('SEED_NAMESPACE_REQUIRED', 'Seed namespace must be a non-empty string.', {
      path: '$.seedNamespaces',
      suggestion: 'Use the fixed namespace assigned to the compiler stage.',
    });
  }
  const hex = createHash('sha256').update(`${rootSeed}\u0000${namespace}`, 'utf8').digest('hex');
  const value = Number.parseInt(hex.slice(0, 8), 16) >>> 0;
  return value === 0 ? 1 : value;
}

export function cloneCanonical(value) {
  return canonicalizeJson(value);
}

function freezeCanonical(value, path, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RockGeologyError('JSON_NON_FINITE_NUMBER', 'Canonical JSON does not permit non-finite numbers.', {
        path,
        suggestion: 'Replace NaN or infinity with a finite, explicitly unit-labelled value.',
        details: { received: String(value) },
      });
    }
    if (Object.is(value, -0)) {
      throw new RockGeologyError('JSON_NEGATIVE_ZERO', 'Canonical JSON does not permit negative zero.', {
        path,
        suggestion: 'Use 0 so serialization remains lossless.',
      });
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new RockGeologyError('JSON_UNSUPPORTED_VALUE', 'Canonical JSON accepts only null, booleans, numbers, strings, arrays, and plain objects.', {
      path,
      suggestion: 'Convert the value to an explicit JSON representation.',
      details: { type: typeof value },
    });
  }

  if (seen.has(value)) {
    throw new RockGeologyError('JSON_CYCLIC_VALUE', 'Canonical JSON cannot contain cyclic references.', {
      path,
      suggestion: 'Replace object references with stable identifiers.',
    });
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((child, index) => freezeCanonical(child, `${path}[${index}]`, seen));
    seen.delete(value);
    return Object.freeze(result);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    seen.delete(value);
    throw new RockGeologyError('JSON_NON_PLAIN_OBJECT', 'Canonical JSON requires plain objects.', {
      path,
      suggestion: 'Convert class instances, Maps, Sets, Dates, and typed arrays to explicit JSON values.',
      details: { constructor: value.constructor?.name ?? null },
    });
  }

  const result = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) {
      seen.delete(value);
      throw new RockGeologyError('JSON_UNDEFINED_VALUE', 'Canonical JSON does not permit undefined values.', {
        path: `${path}.${key}`,
        suggestion: 'Omit an optional field or assign an explicit JSON value.',
      });
    }
    result[key] = freezeCanonical(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
  return Object.freeze(result);
}
