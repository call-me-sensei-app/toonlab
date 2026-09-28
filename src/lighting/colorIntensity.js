import { clamp, finite, isPlainObject, vector } from './utils.js';

export const LIGHT_INTENSITY_UNITS = Object.freeze([
  'unitless',
  'lux',
  'candela',
  'lumens',
  'nits',
]);

const DEFAULT_UNIT_BY_TYPE = Object.freeze({
  ambient: 'unitless',
  discArea: 'nits',
  directional: 'lux',
  hemisphere: 'unitless',
  point: 'candela',
  rectArea: 'nits',
  spot: 'candela',
  tubeArea: 'nits',
});

function channelToHex(value) {
  return Number.parseInt(value, 16) / 255;
}

function parseHexColor(value) {
  const hex = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [...hex].map((channel) => channelToHex(`${channel}${channel}`));
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [channelToHex(hex.slice(0, 2)), channelToHex(hex.slice(2, 4)), channelToHex(hex.slice(4, 6))];
  }
  return null;
}

/**
 * Approximates a black-body color in authoring-space sRGB.
 * The useful range is deliberately clamped to 1,000-40,000 kelvin.
 */
export function colorTemperatureToRgb(temperatureKelvin, { clampOutput = true } = {}) {
  const temperature = clamp(finite(temperatureKelvin, 6500), 1000, 40000) / 100;
  let red;
  let green;
  let blue;

  if (temperature <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temperature) - 161.1195681661;
    blue = temperature <= 19
      ? 0
      : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * ((temperature - 60) ** -0.1332047592);
    green = 288.1221695283 * ((temperature - 60) ** -0.0755148492);
    blue = 255;
  }

  const rgb = [red / 255, green / 255, blue / 255];
  return clampOutput ? rgb.map((channel) => clamp(channel, 0, 1)) : rgb;
}

/** Converts an RGB array, hex color, or temperature/tint object to sRGB. */
export function resolveLightColor(value = [1, 1, 1]) {
  if (typeof value === 'string') return parseHexColor(value) ?? [1, 1, 1];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
  }
  if (Array.isArray(value)) return vector(value, [1, 1, 1], 3).map((channel) => clamp(channel, 0, 1));
  if (!isPlainObject(value)) return [1, 1, 1];

  const base = value.temperatureKelvin !== null && value.temperatureKelvin !== undefined
    ? colorTemperatureToRgb(value.temperatureKelvin)
    : resolveLightColor(value.rgb ?? value.color ?? [1, 1, 1]);
  const tint = vector(value.tint, [1, 1, 1], 3);
  return base.map((channel, index) => clamp(channel * tint[index], 0, 1));
}

/** Normalizes author-facing light color metadata into a serializable object. */
export function createLightColor(value = null) {
  if (isPlainObject(value)) {
    const temperature = value.temperatureKelvin === null || value.temperatureKelvin === undefined
      ? null
      : clamp(finite(value.temperatureKelvin, 6500), 1000, 40000);
    return {
      rgb: temperature === null ? resolveLightColor(value.rgb ?? value.color ?? [1, 1, 1]) : null,
      temperatureKelvin: temperature,
      tint: vector(value.tint, [1, 1, 1], 3).map((channel) => Math.max(channel, 0)),
    };
  }
  return {
    rgb: resolveLightColor(value ?? [1, 1, 1]),
    temperatureKelvin: null,
    tint: [1, 1, 1],
  };
}

/** Converts luminous flux to intensity for an isotropic point source. */
export function lumensToCandela(lumens, solidAngleSteradians = Math.PI * 4) {
  return Math.max(finite(lumens, 0), 0) / Math.max(finite(solidAngleSteradians, Math.PI * 4), 1e-6);
}

/** Converts candela to luminous flux for a supplied solid angle. */
export function candelaToLumens(candela, solidAngleSteradians = Math.PI * 4) {
  return Math.max(finite(candela, 0), 0) * Math.max(finite(solidAngleSteradians, Math.PI * 4), 0);
}

/** Solid angle of a cone whose half-angle is `angleRadians`. */
export function coneSolidAngle(angleRadians) {
  return Math.PI * 2 * (1 - Math.cos(clamp(finite(angleRadians, Math.PI / 4), 0.001, Math.PI / 2)));
}

/** Illuminance in lux from a candela value at a distance in meters. */
export function luxAtDistance(candela, distanceMeters) {
  const distance = Math.max(finite(distanceMeters, 1), 0.001);
  return Math.max(finite(candela, 0), 0) / (distance * distance);
}

/** Approximate luminance for a diffuse rectangular emitter. */
export function lumensToNits(lumens, widthMeters = 1, heightMeters = 1) {
  const area = Math.max(finite(widthMeters, 1) * finite(heightMeters, 1), 1e-6);
  return Math.max(finite(lumens, 0), 0) / (Math.PI * area);
}

/**
 * Normalizes physical intensity metadata. `artisticMultiplier` remains
 * separate so a look can be tuned without destroying authored units.
 */
export function createLightIntensity(type, value = null) {
  const defaultUnit = DEFAULT_UNIT_BY_TYPE[type] ?? 'unitless';
  if (typeof value === 'number') {
    return { artisticMultiplier: 1, referenceDistance: 1, unit: defaultUnit, value: Math.max(value, 0) };
  }
  const source = isPlainObject(value) ? value : {};
  const unit = LIGHT_INTENSITY_UNITS.includes(source.unit) ? source.unit : defaultUnit;
  return {
    artisticMultiplier: Math.max(finite(source.artisticMultiplier, source.multiplier ?? 1), 0),
    referenceDistance: Math.max(finite(source.referenceDistance, 1), 0.001),
    unit,
    value: Math.max(finite(source.value, 1), 0),
  };
}

/**
 * Resolves portable intensity metadata to the value expected by Three.js.
 * Directional lux, local-light candela, and rect-area nits pass through.
 * Conversions from lumens are geometric approximations, not photometry.
 */
export function resolveThreeLightIntensity(type, intensity, geometry = {}) {
  const resolved = createLightIntensity(type, intensity);
  const { artisticMultiplier, referenceDistance, unit, value } = resolved;
  let output = value;

  if (type === 'point') {
    if (unit === 'lumens') output = lumensToCandela(value);
    if (unit === 'lux') output = value * referenceDistance * referenceDistance;
    if (unit === 'nits') output = value;
  } else if (type === 'spot') {
    if (unit === 'lumens') output = lumensToCandela(value, coneSolidAngle(geometry.angle));
    if (unit === 'lux') output = value * referenceDistance * referenceDistance;
    if (unit === 'nits') output = value;
  } else if (type === 'rectArea' || type === 'discArea' || type === 'tubeArea') {
    if (unit === 'lumens') output = lumensToNits(value, geometry.width, geometry.height);
    if (unit === 'candela') {
      const area = Math.max(finite(geometry.width, 1) * finite(geometry.height, 1), 1e-6);
      output = value / area;
    }
    if (unit === 'lux') output = value / Math.PI;
  }

  return Math.max(output * artisticMultiplier, 0);
}

/** Returns the preferred authoring unit for a descriptor type. */
export function getDefaultIntensityUnit(type) {
  return DEFAULT_UNIT_BY_TYPE[type] ?? 'unitless';
}
