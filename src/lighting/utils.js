// Small dependency-free helpers shared by the lighting document, preset, and
// runtime modules. Lighting recipes stay plain JSON; Three.js objects only
// enter the system in the realization layer.

export const clamp = (value, min, max) => Math.min(Math.max(Number(value), min), max);

export function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function vector(value, fallback, size = fallback.length) {
  if (!Array.isArray(value) || value.length < size) return [...fallback];
  const next = value.slice(0, size).map(Number);
  return next.every(Number.isFinite) ? next : [...fallback];
}

export function slug(value, fallback = 'lighting') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

/** Deep-clones a JSON-compatible value without requiring structuredClone. */
export function cloneJson(value) {
  if (Array.isArray(value)) return value.map(cloneJson);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)]));
  }
  return value;
}

/** Recursively freezes an object registry exposed as a public constant. */
export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}

export function mergePlain(base, overrides) {
  const output = cloneJson(isPlainObject(base) ? base : {});
  if (!isPlainObject(overrides)) return output;
  for (const [key, value] of Object.entries(overrides)) {
    output[key] = isPlainObject(value) && isPlainObject(output[key])
      ? mergePlain(output[key], value)
      : cloneJson(value);
  }
  return output;
}

export function uniqueId(preferred, used, fallbackPrefix = 'light') {
  const base = slug(preferred, fallbackPrefix);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

export function createValidationResult(errors, warnings = []) {
  const valid = errors.length === 0;
  return Object.freeze({
    errors: Object.freeze([...errors]),
    ok: valid,
    valid,
    warnings: Object.freeze([...warnings]),
  });
}

export function formatValidationErrors(label, result) {
  const details = result.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; ');
  return `${label} is invalid${details ? `: ${details}` : '.'}`;
}
