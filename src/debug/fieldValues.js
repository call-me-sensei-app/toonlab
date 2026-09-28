// Generic value coercion between settings-schema fields and DOM controls.
// Field metadata comes from the settings modules' *_SETTING_FIELD_SCHEMA
// exports (type, range, options, optionLabels, defaultValue).

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function toHexChannel(value) {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, '0');
}

export function colorToHex(value) {
  if (value?.isColor) return `#${toHexChannel(value.r)}${toHexChannel(value.g)}${toHexChannel(value.b)}`;
  if (Array.isArray(value) && value.length >= 3) {
    return `#${toHexChannel(value[0])}${toHexChannel(value[1])}${toHexChannel(value[2])}`;
  }
  return '#ffffff';
}

export function hexToColorArray(value, fallback = [1, 1, 1]) {
  const normalized = String(value ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

export function vectorToArray(value, fallback = []) {
  if (value?.isVector2) return [value.x, value.y];
  if (value?.isVector3) return [value.x, value.y, value.z];
  if (value?.isVector4) return [value.x, value.y, value.z, value.w];
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') {
    return [value.x, value.y, value.z, value.w].filter((entry) => entry !== undefined);
  }
  return [...fallback];
}

export function formatFieldValue(value, field) {
  if (field.type === 'boolean') return value ? 'On' : 'Off';
  if (field.type === 'select') return field.optionLabels?.[String(value)] ?? String(value ?? '');
  if (field.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(field.range?.step < 0.01 ? 3 : 2) : String(value);
  }
  if (field.type === 'color') return colorToHex(value);
  if (field.type.startsWith('vector')) {
    return vectorToArray(value, field.defaultValue)
      .map((entry) => Number(entry).toFixed(2))
      .join(', ');
  }
  return String(value ?? '');
}

export function readFieldValueFromSettings(settings, field) {
  const group = settings?.[field.group] ?? {};
  return group[field.key] ?? field.defaultValue;
}

export function readFieldValueFromControl(control, field) {
  if (field.type === 'boolean') return Boolean(control.checked);
  if (field.type === 'number') return Number(control.value);
  if (field.type === 'color') return hexToColorArray(control.value, field.defaultValue);
  if (field.type.startsWith('vector')) {
    const size = Number(field.type.replace('vector', '')) || field.defaultValue?.length || 2;
    const parts = String(control.value)
      .split(',')
      .map((entry) => Number(entry.trim()));
    return Array.from({ length: size }, (_, index) => (
      Number.isFinite(parts[index]) ? parts[index] : field.defaultValue[index] ?? 0
    ));
  }
  if (field.type === 'select' && typeof field.defaultValue === 'number') return Number(control.value);
  return control.value;
}

export function writeFieldControlValue(control, output, field, value, formatValue = formatFieldValue) {
  if (field.type === 'boolean') {
    control.checked = Boolean(value);
  } else if (field.type === 'color') {
    control.value = colorToHex(value);
  } else if (field.type.startsWith('vector')) {
    control.value = vectorToArray(value, field.defaultValue)
      .map((entry) => Number(entry).toFixed(3))
      .join(', ');
  } else {
    control.value = String(value ?? field.defaultValue ?? '');
  }
  if (output) output.textContent = formatValue(value, field);
}
