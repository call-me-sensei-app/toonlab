import * as THREE from 'three';

// Field-definition helpers shared by the character shading settings groups.
//
// A group is described once as a nested object of field definitions; the same
// description drives value normalisation (`createGroupValues`), the public
// field schema the Labs and the settings reference render from
// (`describeGroupFields`), and preset sanitising (`sanitizeGroupValues`).
// Nested plain objects become dotted keys (`cameraLight.strength`).

/** One field's definition: type, default, range/options, description. */
export class SettingField {
  constructor(definition) {
    Object.assign(this, definition);
    Object.freeze(this);
  }
}

function field(type, defaultValue, extra = {}) {
  return new SettingField({ defaultValue, type, ...extra });
}

/**
 * A number with an inclusive range.
 * @param {number} defaultValue
 * @param {number} min
 * @param {number} max
 * @param {string} description
 * @param {{ label?: string, step?: number | null }} [options]
 */
export function numberField(defaultValue, min, max, description, { label, step = null } = {}) {
  return field('number', defaultValue, {
    description,
    label,
    range: Object.freeze({ max, min, step: step ?? defaultStep(min, max) }),
  });
}

/**
 * @param {boolean} defaultValue
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function booleanField(defaultValue, description, { label } = {}) {
  return field('boolean', defaultValue, { description, label });
}

/**
 * An [r, g, b] colour, components 0–1.
 * @param {number[]} defaultValue
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function colorField(defaultValue, description, { label } = {}) {
  return field('color', Object.freeze([...defaultValue]), { description, label });
}

/**
 * @param {string | number} defaultValue
 * @param {Array<string | number>} options
 * @param {string} description
 * @param {{ label?: string, optionLabels?: Record<string, string> | null, numeric?: boolean }} [settings]
 */
export function selectField(defaultValue, options, description, { label, optionLabels = null, numeric = false } = {}) {
  return field('select', defaultValue, {
    description,
    label,
    numeric,
    optionLabels: optionLabels ? Object.freeze({ ...optionLabels }) : null,
    options: Object.freeze([...options]),
  });
}

/**
 * An [x, y] pair.
 * @param {number[]} defaultValue
 * @param {number} min
 * @param {number} max
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function vector2Field(defaultValue, min, max, description, { label } = {}) {
  return field('vector2', Object.freeze([...defaultValue]), {
    description,
    label,
    range: Object.freeze({ max, min, step: defaultStep(min, max) }),
  });
}

/**
 * A list of strings (material names, patterns, roles).
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function listField(description, { label } = {}) {
  return field('list', null, { description, label });
}

/**
 * A texture: runtime-only, never written into a preset document.
 * @param {string} description
 * @param {{ label?: string }} [options]
 */
export function textureField(description, { label } = {}) {
  return field('texture', null, { description, label, serializable: false });
}

function defaultStep(min, max) {
  const span = Math.abs(max - min);
  if (span <= 0.2) return 0.0005;
  if (span <= 2) return 0.005;
  if (span <= 20) return 0.05;
  return 1;
}

export function isFieldDefinition(value) {
  return value instanceof SettingField;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !value.isColor && !value.isTexture;
}

function labelFromKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function coerceColor(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((entry) => Number.isFinite(Number(entry)))) {
    return [Number(value[0]), Number(value[1]), Number(value[2])];
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const color = new THREE.Color(value.trim());
      return [color.r, color.g, color.b];
    } catch {
      return [...fallback];
    }
  }
  if (value && typeof value === 'object' && ['r', 'g', 'b'].every((key) => Number.isFinite(Number(value[key])))) {
    return [Number(value.r), Number(value.g), Number(value.b)];
  }
  if (value && typeof value === 'object' && ['x', 'y', 'z'].every((key) => Number.isFinite(Number(value[key])))) {
    return [Number(value.x), Number(value.y), Number(value.z)];
  }
  return [...fallback];
}

function coerceBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no', 'none', 'disabled'].includes(normalized)) return false;
  }
  return fallback;
}

function coerceNumber(value, definition) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return definition.defaultValue;
  return Math.min(definition.range.max, Math.max(definition.range.min, number));
}

function coerceSelect(value, definition) {
  if (value === undefined || value === null) return definition.defaultValue;
  const match = definition.options.find((option) => option === value || String(option).toLowerCase() === String(value).trim().toLowerCase());
  return match === undefined ? definition.defaultValue : match;
}

/** Normalises one value against its field definition. */
export function coerceFieldValue(value, definition) {
  switch (definition.type) {
    case 'number':
      return coerceNumber(value, definition);
    case 'boolean':
      return coerceBoolean(value, definition.defaultValue);
    case 'color':
      return value === undefined || value === null ? [...definition.defaultValue] : coerceColor(value, definition.defaultValue);
    case 'select':
      return coerceSelect(value, definition);
    case 'texture':
      return value?.isTexture ? value : null;
    case 'vector2': {
      const source = Array.isArray(value) ? value : value && typeof value === 'object' ? [value.x, value.y] : null;
      if (!source) return [...definition.defaultValue];
      return [0, 1].map((index) => {
        const number = Number(source[index]);
        return Number.isFinite(number)
          ? Math.min(definition.range.max, Math.max(definition.range.min, number))
          : definition.defaultValue[index];
      });
    }
    case 'list': {
      if (value === null || value === undefined) return null;
      const list = (Array.isArray(value) ? value : [value])
        .filter((entry) => entry instanceof RegExp || (typeof entry === 'string' && entry.trim()))
        .map((entry) => (entry instanceof RegExp ? entry.source : entry.trim()));
      return list.length ? list : null;
    }
    default:
      return value ?? definition.defaultValue;
  }
}

/**
 * Builds a complete values object for a group: every field present, each
 * normalised. `input` may be partial; unknown keys are dropped. A boolean
 * input toggles the group's `enabled` field.
 */
export function createGroupValues(fields, input) {
  let source = input;
  if (typeof source === 'boolean') source = { enabled: source };
  if (!isPlainObject(source)) source = {};
  const values = {};
  for (const [key, definition] of Object.entries(fields)) {
    if (isFieldDefinition(definition)) {
      values[key] = coerceFieldValue(source[key], definition);
    } else {
      // A per-role (or other nested) block may also be given as one value
      // that applies to every entry: `terminator: 0.1`.
      const nested = source[key];
      const spread = nested === undefined || nested === null || isPlainObject(nested)
        ? nested
        : Object.fromEntries(Object.keys(definition).map((child) => [child, nested]));
      values[key] = createGroupValues(definition, spread);
    }
  }
  return values;
}

/** Default values of a group. */
export function groupDefaults(fields) {
  return createGroupValues(fields, {});
}

/**
 * The public field schema of a group: the same nesting as its values, with a
 * frozen metadata record at every leaf.
 */
export function describeGroupFields(groupId, fields, prefix = '') {
  const described = {};
  for (const [key, definition] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isFieldDefinition(definition)) {
      described[key] = Object.freeze({
        defaultValue: Array.isArray(definition.defaultValue) ? Object.freeze([...definition.defaultValue]) : definition.defaultValue,
        description: definition.description ?? '',
        group: groupId,
        id: `${groupId}.${path}`,
        key: path,
        label: definition.label ?? labelFromKey(key),
        optionLabels: definition.optionLabels ?? null,
        options: definition.options ?? null,
        range: definition.range ?? null,
        serializable: definition.serializable !== false,
        type: definition.type,
      });
    } else {
      described[key] = describeGroupFields(groupId, definition, path);
    }
  }
  return Object.freeze(described);
}

/**
 * Keeps only schema-known, serialisable keys present in `input`, coerced to
 * their field types. Partial input stays partial.
 */
export function sanitizeGroupValues(fields, input) {
  if (typeof input === 'boolean') return fields.enabled ? { enabled: input } : {};
  if (!isPlainObject(input)) return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    const definition = fields[key];
    if (!definition) continue;
    if (isFieldDefinition(definition)) {
      if (definition.serializable === false) continue;
      sanitized[key] = coerceFieldValue(value, definition);
    } else if (isPlainObject(value)) {
      const nested = sanitizeGroupValues(definition, value);
      if (Object.keys(nested).length) sanitized[key] = nested;
    } else if (value !== undefined && value !== null) {
      // One value for a whole nested block.
      const nested = sanitizeGroupValues(definition, Object.fromEntries(Object.keys(definition).map((child) => [child, value])));
      if (Object.keys(nested).length) sanitized[key] = nested;
    }
  }
  return sanitized;
}

/** Unknown or runtime-only keys in `input`, as dotted paths. */
export function unknownGroupKeys(fields, input, prefix = '') {
  if (!isPlainObject(input)) return [];
  const unknown = [];
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const definition = fields[key];
    if (!definition) unknown.push({ path, reason: 'unknown' });
    else if (isFieldDefinition(definition)) {
      if (definition.serializable === false) unknown.push({ path, reason: 'runtime' });
    } else if (isPlainObject(value)) unknown.push(...unknownGroupKeys(definition, value, path));
  }
  return unknown;
}

/** Deep merge of plain settings objects (arrays, colours and textures replace). */
export function mergeSettings(...sources) {
  const result = {};
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      if (isPlainObject(value) && isPlainObject(result[key])) result[key] = mergeSettings(result[key], value);
      else if (isPlainObject(value)) result[key] = mergeSettings(value);
      else result[key] = value;
    }
  }
  return result;
}
