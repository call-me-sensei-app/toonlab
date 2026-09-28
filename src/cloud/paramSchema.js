// Descriptor builders and the normalizer both param layers share.
//
// It lives on its own because the spec fixes one owner per param group
// (docs/sky-cloud-parameters.md, "Module ownership"): the six cloud groups
// belong to cloudParams.js and the SkyParams envelope to sky/skyParams.js. Both
// need the same clamping and reporting rules, and duplicating them is how the
// two halves drifted apart in the first place — cloudParams rejected a
// non-boolean while skyQualityTiers coerced one, and the same field ended up
// with two different defaults. There is exactly one copy of each rule here.
//
// Colors are linear RGB everywhere. Live params hold THREE.Color; serialized
// documents hold [r, g, b] triples. This module converts at that boundary and
// nothing else does.

import * as THREE from 'three';

export const DIMENSIONLESS = '';

// ---------------------------------------------------------------------------
// Descriptor builders
// ---------------------------------------------------------------------------

// `range` is the lab's slider domain — the docs' "useful range". `limit` is the
// hard clamp applyParams enforces, and is only tightened past ±Infinity where a
// value outside it would divide by zero, invert a window, or degenerate the
// scattering model. Two invariants hold for every field, and
// assertSchemaInvariants() below enforces them: `range` never escapes `limit`
// (a slider parked at its own end must not clamp), and every clamp is
// idempotent so round-trip identity survives it.
export function num(spec) {
  const [rangeMin, rangeMax, step] = spec.range;
  return Object.freeze({
    // Present only when the legal values are a discrete set; clampNumber snaps
    // to the nearest member rather than merely bounding the interval.
    options: spec.options ? Object.freeze([...spec.options]) : null,
    derived: spec.derived === true,
    derive: spec.derive ?? null,
    description: spec.description,
    // A periodic field can name its own fold — `time` borrows timeOfDay's, so
    // the clock's wrap has one definition rather than two that disagree.
    fold: spec.fold ?? null,
    integer: spec.integer === true,
    label: spec.label,
    limit: Object.freeze({
      max: spec.max ?? Number.POSITIVE_INFINITY,
      min: spec.min ?? Number.NEGATIVE_INFINITY,
    }),
    range: Object.freeze({ max: rangeMax, min: rangeMin, step }),
    type: 'number',
    unit: spec.unit ?? DIMENSIONLESS,
    uniform: spec.uniform !== false,
    value: spec.value,
    wrap: spec.wrap ? Object.freeze([...spec.wrap]) : null,
  });
}

export function col(spec) {
  return Object.freeze({
    derived: false,
    derive: null,
    description: spec.description,
    fold: null,
    integer: false,
    label: spec.label,
    // Reflectances cap at 1; emissive tints keep HDR headroom so a warm sun or
    // a bright moon can be authored above white.
    limit: Object.freeze({ max: spec.max ?? 1, min: 0 }),
    type: 'color',
    unit: 'linear RGB',
    uniform: spec.uniform !== false,
    value: Object.freeze([...spec.value]),
    wrap: null,
  });
}

export function bool(spec) {
  return Object.freeze({
    derived: false,
    derive: null,
    description: spec.description,
    fold: null,
    integer: false,
    label: spec.label,
    limit: Object.freeze({ max: 1, min: 0 }),
    type: 'boolean',
    unit: DIMENSIONLESS,
    uniform: false,
    value: spec.value,
    wrap: null,
  });
}

/**
 * Adapts an owner module's `{ range: { min, max, step }, type, unit, value }`
 * table into descriptors. The owner clamps to its own range, so that range is
 * both the slider domain and the hard limit here — otherwise the schema layer
 * would accept a value the owner then silently moves.
 */
export function fromOwnerSchema(schema, overrides = {}, shared = {}) {
  const fields = {};
  for (const [key, field] of Object.entries(schema)) {
    const extra = { ...shared, ...(overrides[key] ?? {}) };
    if (field.type === 'color') {
      fields[key] = col({
        description: field.description,
        label: field.label,
        value: field.value,
        ...extra,
      });
      continue;
    }
    // A flag has no range to adapt. Handled explicitly rather than falling into
    // the numeric branch, which would throw on the missing `field.range`.
    if (field.type === 'boolean') {
      fields[key] = bool({
        description: field.description,
        label: field.label,
        value: field.value,
        ...extra,
      });
      continue;
    }
    const { min, max, step } = field.range;
    fields[key] = num({
      description: field.description,
      // The owner rounds a field whose step is 1, so the schema layer has to
      // agree or the two disagree about what round-trips.
      integer: step === 1,
      label: field.label,
      max,
      min,
      range: [min, max, step],
      unit: field.unit ?? DIMENSIONLESS,
      value: field.value,
      ...extra,
    });
  }
  return Object.freeze(fields);
}

/**
 * Fails loudly on a schema that cannot be authored: a slider domain outside the
 * hard clamp, or a default the clamp would move. Both were real defects, and
 * both are cheap to catch at import time rather than in a lab.
 */
export function assertSchemaInvariants(label, fields, path = '') {
  for (const [key, field] of Object.entries(fields)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (!field?.type) {
      assertSchemaInvariants(label, field, fieldPath);
      continue;
    }
    if (field.derived && typeof field.derive !== 'function') {
      throw new Error(`${label}: ${fieldPath} is derived but declares no derive() rule.`);
    }
    if (field.type === 'number') {
      if (field.range.min < field.limit.min || field.range.max > field.limit.max) {
        throw new Error(
          `${label}: ${fieldPath} range [${field.range.min}, ${field.range.max}] escapes `
          + `limit [${field.limit.min}, ${field.limit.max}]; the slider would clamp at its own end.`,
        );
      }
      if (!field.derived && clampNumber(field, field.value) !== field.value) {
        throw new Error(`${label}: ${fieldPath} default ${field.value} is outside its own limit.`);
      }
    }
    if (field.type === 'color') {
      for (const channel of field.value) {
        if (channel < field.limit.min || channel > field.limit.max) {
          throw new Error(`${label}: ${fieldPath} default channel ${channel} is outside its own limit.`);
        }
      }
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// `null` reads as "not supplied" rather than 0, because Number(null) is 0 and
// would silently zero a parameter a caller only meant to leave alone.
export function hasValue(value) {
  return value !== undefined && value !== null;
}

/**
 * A number, or null when the input is not one.
 *
 * Deliberately narrower than `Number(value)`: that reads `null`, `''`, `[]` and
 * `false` as 0 and `true` as 1, so every one of them can silently zero a
 * parameter. Only real numbers and non-blank numeric strings (JSON and URL
 * params produce those) get through.
 */
export function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

export function describe(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  // String(object) is "[object Object]", which tells a reader nothing about the
  // value their message is complaining about.
  if (isObject(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Folds a periodic value into its representative interval, which is closed at
 * both ends. A compass bearing of −180 and one of +180 are the same direction,
 * and the spec's due-south noon azimuth has to store as the 180 the author
 * typed instead of flipping sign on every load, so an in-range value passes
 * through untouched and only an out-of-range one is folded.
 */
export function foldClosed(value, min, max) {
  if (value >= min && value <= max) return value;
  const span = max - min;
  return ((((value - min) % span) + span) % span) + min;
}

export function clampNumber(field, value) {
  let result = field.integer ? Math.round(value) : value;
  if (field.fold) result = field.fold(result);
  else if (field.wrap) result = foldClosed(result, field.wrap[0], field.wrap[1]);
  result = Math.min(Math.max(result, field.limit.min), field.limit.max);
  // A field whose legal values are a set, not an interval, snaps to the set.
  // Range-only bounds let in-between values through to a consumer that quietly
  // rounded them somewhere else, leaving the document and the thing it produced
  // disagreeing with nothing reporting it.
  if (field.options) {
    return field.options.reduce(
      (best, option) => (Math.abs(option - result) < Math.abs(best - result) ? option : best),
      field.options[0],
    );
  }
  return result;
}

export function toChannels(value) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map(finiteNumber);
    return channels.every((channel) => channel !== null) ? channels : null;
  }
  if (isObject(value)) {
    const channels = [finiteNumber(value.r), finiteNumber(value.g), finiteNumber(value.b)];
    return channels.every((channel) => channel !== null) ? channels : null;
  }
  return null;
}

export function clampChannels(field, channels) {
  return channels.map((channel) =>
    Math.min(Math.max(channel, field.limit.min), field.limit.max));
}

export function channelsToColor(channels) {
  // setRGB defaults to the working colour space, which is linear-sRGB. No
  // transfer function is applied here, unlike the authored sRGB swatches in
  // the ground shader.
  return new THREE.Color().setRGB(channels[0], channels[1], channels[2]);
}

/**
 * Reads a linear-RGB colour into a live THREE.Color, the way every live param
 * group promises to: an unusable value keeps the colour already there and says
 * so, and every channel is clamped to the field's declared limit.
 *
 * Built on toChannels and clampChannels — the same two the document layer
 * normalizes through — so `applyParams({ color })` and a serialized document
 * cannot disagree about what a colour is. They did, in both directions, for as
 * long as the live groups hand-wrote their own reader:
 *
 * - A SHORT array read as a *partial* write. `{ color: [7] }` set r = 7 and held
 *   g and b, where toChannels wants three channels and the document layer
 *   rejects the value outright.
 * - NOTHING CLAMPED. A live sun held r = 7 while the preset written from it
 *   carried the field's declared maximum of 4, so the sun in the lab and the sun
 *   in the file were different colours with nothing reporting it.
 *
 * `label` is the caller's `[module] group.field`. This is the live path, so it
 * warns rather than filling a report: applyParams has no report to fill, and a
 * dropped colour write is otherwise completely silent.
 */
export function readColorInto(label, field, value, target) {
  const channels = toChannels(value);
  if (!channels) {
    console.warn(
      `${label} takes a THREE.Color, an [r, g, b] triple, or an { r, g, b } object in linear `
      + `RGB — got ${describe(value)}. Keeping (${target.r}, ${target.g}, ${target.b}). `
      + 'A shorter array is not a partial write, and the sRGB hex integer Color.toJSON() '
      + 'produces is not a supported form.',
    );
    return target;
  }
  const clamped = clampChannels(field, channels);
  if (clamped.some((channel, index) => channel !== channels[index])) {
    console.warn(`${label} [${channels.join(', ')}] was clamped to [${clamped.join(', ')}].`);
  }
  // The colour space is named rather than left to the host's working space:
  // these channels are linear RGB and no transfer function applies to them.
  return target.setRGB(clamped[0], clamped[1], clamped[2], THREE.LinearSRGBColorSpace);
}

/** Live-params view of a normalized block: colour triples become THREE.Color. */
export function colorFieldsToColors(fields, params) {
  const result = { ...params };
  for (const [key, field] of Object.entries(fields)) {
    if (field.type === 'color') result[key] = channelsToColor(params[key]);
  }
  return result;
}

export function deepFreeze(value) {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreeze(entry);
    return Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Field normalization
// ---------------------------------------------------------------------------

export function normalizeNumber(path, field, value, fallback, report) {
  // The fallback is only a fallback when it is actually a number. Guarding it
  // with Number.isFinite(Number(fallback)) is not the same test: it lets null
  // and '' through as 0 and zeroes the parameter.
  const fallbackNumber = finiteNumber(fallback);
  const base = clampNumber(field, fallbackNumber === null ? field.value : fallbackNumber);
  if (!hasValue(value)) return base;
  const raw = finiteNumber(value);
  if (raw === null) {
    report.errors.push(`${path} must be a finite number (got ${describe(value)}).`);
    return base;
  }
  const result = clampNumber(field, raw);
  if (result !== raw) report.warnings.push(`${path} ${raw} was normalized to ${result}.`);
  return result;
}

export function normalizeBoolean(path, field, value, fallback, report) {
  const base = typeof fallback === 'boolean' ? fallback : field.value;
  if (!hasValue(value)) return base;
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  report.errors.push(`${path} must be a boolean (got ${describe(value)}).`);
  return base;
}

export function normalizeChannels(path, field, value, fallback, report) {
  const base = clampChannels(field, toChannels(fallback) ?? [...field.value]);
  if (!hasValue(value)) return base;
  if (typeof value === 'number') {
    // A hex integer cannot express linear RGB above 1 and implies an sRGB
    // transfer function on decode, so it is rejected rather than guessed at.
    report.errors.push(
      `${path} must be a linear RGB [r, g, b] triple or a THREE.Color; hex numbers are not accepted.`,
    );
    return base;
  }
  const channels = toChannels(value);
  if (!channels) {
    report.errors.push(
      `${path} must be a linear RGB [r, g, b] triple or a THREE.Color (got ${describe(value)}).`,
    );
    return base;
  }
  const result = clampChannels(field, channels);
  if (result.some((channel, index) => channel !== channels[index])) {
    report.warnings.push(`${path} [${channels.join(', ')}] was clamped to [${result.join(', ')}].`);
  }
  return result;
}

export function reportUnknownKeys(path, fields, source, report, ignored = []) {
  for (const key of Object.keys(source)) {
    if (key in fields || ignored.includes(key)) continue;
    report.warnings.push(`Unknown parameter "${path}.${key}" was ignored.`);
  }
}

/**
 * Reports a supplied value for a read-only derived field, but only when it
 * disagrees with what the rule derives. A document this module serialized
 * carries the derived value, so warning on its mere presence made every
 * round-trip of our own output look like a problem.
 */
export function reportDerived(path, supplied, derivedValue, report) {
  const number = finiteNumber(supplied);
  if (number === derivedValue) return;
  report.warnings.push(
    `${path} is derived; the supplied ${describe(supplied)} was replaced with ${derivedValue}.`,
  );
}

/**
 * Normalizes one flat block of fields into a plain params object. `fallback`
 * supplies the value for any field the input omits; without one the field
 * defaults are used.
 *
 * `rule` runs after the authored fields are written and before the derived ones
 * are computed, which is what lets a cross-field clamp (the melt window, the
 * far-fade band) settle before anything derives from it.
 */
export function normalizeBlock(path, fields, input, fallback, report, options = {}) {
  const { ignored = [], rule = null } = options;
  if (hasValue(input) && !isObject(input)) {
    report.errors.push(`${path} must be an object (got ${describe(input)}).`);
  }
  const source = isObject(input) ? input : {};
  const base = isObject(fallback) ? fallback : {};
  const params = {};
  for (const [key, field] of Object.entries(fields)) {
    const fieldPath = `${path}.${key}`;
    if (field.derived) {
      // Placeholder in declaration order; the second pass overwrites it.
      params[key] = field.value;
    } else if (field.type === 'color') {
      params[key] = normalizeChannels(fieldPath, field, source[key], base[key], report);
    } else if (field.type === 'boolean') {
      params[key] = normalizeBoolean(fieldPath, field, source[key], base[key], report);
    } else {
      params[key] = normalizeNumber(fieldPath, field, source[key], base[key], report);
    }
  }
  if (rule) rule(path, params, report);
  for (const [key, field] of Object.entries(fields)) {
    if (!field.derived) continue;
    params[key] = clampNumber(field, field.derive(params));
    if (hasValue(source[key])) {
      reportDerived(`${path}.${key}`, source[key], params[key], report);
    }
  }
  reportUnknownKeys(path, fields, source, report, ignored);
  return params;
}
