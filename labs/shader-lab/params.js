// URL query parameter access shared by the shader-lab modules.

export const URL_PARAMS = new URLSearchParams(location.search);

export function optionalNumberParam(name) {
  const value = URL_PARAMS.get(name);
  if (value === null || value.trim() === '') return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function numberParam(name, fallback) {
  return optionalNumberParam(name) ?? fallback;
}

export function booleanParam(name, fallback = false) {
  if (!URL_PARAMS.has(name)) return fallback;
  const value = URL_PARAMS.get(name);
  if (value === null || value.trim() === '') return true;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  return fallback;
}

export function optionalBooleanParam(name) {
  return URL_PARAMS.has(name) ? booleanParam(name) : undefined;
}

export function numberOption(name) {
  const value = optionalNumberParam(name);
  return Number.isFinite(value) ? value : undefined;
}

export function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

export function settingParamName(prefix, key) {
  return `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
}
