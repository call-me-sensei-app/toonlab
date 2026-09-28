import { STYLE_TARGET_DOMAINS } from './styleDomains.js';
import {
  STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION,
  validateStyleMaterialContract,
} from './styleMaterialContract.js';
import {
  STYLE_TARGET_LABEL_KEY,
  STYLE_TARGET_LABEL_SCHEMA_VERSION,
} from './styleMetadata.js';
import { validateCollisionMetadata } from '../collisionMetadata.js';

export { STYLE_TARGET_LABEL_KEY, STYLE_TARGET_LABEL_SCHEMA_VERSION } from './styleMetadata.js';

const ALLOWED_KEYS = Object.freeze(new Set([
  'assetId',
  'collision',
  'domain',
  'extensions',
  'materials',
  'schemaVersion',
  'targetId',
]));

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$/i;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJsonValue(value, path, errors, seen = new Set()) {
  if (value === null || ['boolean', 'string'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      errors.push(`${path} cannot contain a circular reference.`);
      return null;
    }
    seen.add(value);
    const cloned = value.map((entry, index) => cloneJsonValue(entry, `${path}[${index}]`, errors, seen));
    seen.delete(value);
    return cloned;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) {
      errors.push(`${path} cannot contain a circular reference.`);
      return null;
    }
    seen.add(value);
    const cloned = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneJsonValue(entry, `${path}.${key}`, errors, seen),
      ]),
    );
    seen.delete(value);
    return cloned;
  }
  errors.push(`${path} must contain only JSON-serializable values.`);
  return null;
}

function readStableId(value, path, errors) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value)) {
    errors.push(`${path} must be a stable identifier using letters, numbers, dot, underscore, colon, slash, or hyphen.`);
    return undefined;
  }
  return value;
}

/**
 * Migrates the published v1 label's single-role map into the explicit v2
 * material contract. Unversioned or renamed fields remain invalid.
 */
export function migrateStyleTargetLabel(input) {
  if (!isPlainObject(input)) return input;
  if (input.schemaVersion === 1) {
    const { roles, ...rest } = input;
    return {
      ...rest,
      schemaVersion: STYLE_TARGET_LABEL_SCHEMA_VERSION,
      ...(isPlainObject(roles) && Object.keys(roles).length > 0 ? {
        materials: {
          schemaVersion: STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION,
          assignments: Object.fromEntries(
            Object.entries(roles).map(([materialId, role]) => [materialId, { roles: [role] }]),
          ),
        },
      } : {}),
    };
  }
  return { ...input };
}

export function validateStyleTargetLabel(input) {
  const warnings = [];
  if (!isPlainObject(input)) {
    return {
      errors: ['Style target label must be a JSON object.'],
      ok: false,
      value: null,
      warnings,
    };
  }

  const source = migrateStyleTargetLabel(input);
  const errors = [];
  for (const key of Object.keys(source)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`Unknown style target label field "${key}".`);
  }

  if (!Number.isInteger(source.schemaVersion)) {
    errors.push('schemaVersion is required and must be an integer.');
  } else if (source.schemaVersion !== STYLE_TARGET_LABEL_SCHEMA_VERSION) {
    const direction = source.schemaVersion > STYLE_TARGET_LABEL_SCHEMA_VERSION
      ? 'newer than'
      : 'older than';
    errors.push(`Style target label schema version ${source.schemaVersion} is ${direction} supported version ${STYLE_TARGET_LABEL_SCHEMA_VERSION}.`);
  }

  const domain = typeof source.domain === 'string' ? source.domain.trim() : '';
  if (!domain) {
    errors.push('domain is required.');
  } else if (!STYLE_TARGET_DOMAINS.includes(domain)) {
    errors.push(`Unknown style target domain "${domain}".`);
  }

  const targetId = readStableId(source.targetId, 'targetId', errors);
  const assetId = readStableId(source.assetId, 'assetId', errors);

  let materials;
  if (source.materials !== undefined && domain) {
    const materialResult = validateStyleMaterialContract(domain, source.materials);
    errors.push(...materialResult.errors);
    warnings.push(...materialResult.warnings);
    materials = materialResult.value;
  }

  let collision;
  if (source.collision !== undefined) {
    if (typeof source.collision === 'string' && source.collision.trim() !== '') {
      collision = source.collision.trim();
    } else if (isPlainObject(source.collision)) {
      const collisionResult = validateCollisionMetadata(source.collision);
      errors.push(...collisionResult.errors);
      collision = collisionResult.value;
    } else {
      errors.push('collision must be a non-empty legacy profile identifier or collision metadata object.');
    }
  }

  let extensions;
  if (source.extensions !== undefined) {
    if (!isPlainObject(source.extensions)) {
      errors.push('extensions must be a JSON object.');
    } else {
      extensions = cloneJsonValue(source.extensions, 'extensions', errors);
    }
  }

  const value = errors.length === 0
    ? {
      schemaVersion: STYLE_TARGET_LABEL_SCHEMA_VERSION,
      ...(targetId === undefined ? {} : { targetId }),
      ...(assetId === undefined ? {} : { assetId }),
      domain,
      ...(collision === undefined ? {} : { collision }),
      ...(materials === undefined ? {} : { materials }),
      ...(extensions === undefined ? {} : { extensions }),
    }
    : null;

  return { errors, ok: errors.length === 0, value, warnings };
}

export function parseStyleTargetLabel(input) {
  try {
    const source = typeof input === 'string' ? JSON.parse(input) : input;
    return validateStyleTargetLabel(source);
  } catch (error) {
    return {
      errors: [`Invalid style target label JSON: ${error.message}`],
      ok: false,
      value: null,
      warnings: [],
    };
  }
}

export function createStyleTargetLabel(domain, definition = {}) {
  const result = validateStyleTargetLabel({
    ...definition,
    domain,
    schemaVersion: STYLE_TARGET_LABEL_SCHEMA_VERSION,
  });
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return result.value;
}

export function serializeStyleTargetLabel(label, { pretty = true } = {}) {
  const result = validateStyleTargetLabel(label);
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}
