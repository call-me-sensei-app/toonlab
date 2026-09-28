import {
  createLightColor,
  createLightIntensity,
  getDefaultIntensityUnit,
} from './colorIntensity.js';
import {
  clamp,
  createValidationResult,
  finite,
  isPlainObject,
  mergePlain,
  slug,
  vector,
} from './utils.js';

/** Portable light families supported by the v1 recipe schema. */
export const LIGHT_TYPES = Object.freeze([
  'ambient',
  'hemisphere',
  'directional',
  'point',
  'spot',
  'rectArea',
  'discArea',
  'tubeArea',
]);

export const SHADOW_CAPABLE_LIGHT_TYPES = Object.freeze(['directional', 'point', 'spot']);
export const COOKIE_CAPABLE_LIGHT_TYPES = Object.freeze(['spot']);

const DEFAULT_POSITIONS = Object.freeze({
  ambient: Object.freeze([0, 0, 0]),
  directional: Object.freeze([8, 12, 6]),
  discArea: Object.freeze([0, 2, 0]),
  hemisphere: Object.freeze([0, 1, 0]),
  point: Object.freeze([0, 2, 0]),
  rectArea: Object.freeze([0, 2, 0]),
  spot: Object.freeze([0, 3, 0]),
  tubeArea: Object.freeze([0, 2, 0]),
});

const DEFAULT_TARGETS = Object.freeze({
  ambient: Object.freeze([0, 0, 0]),
  directional: Object.freeze([0, 0, 0]),
  discArea: Object.freeze([0, 0, 0]),
  hemisphere: Object.freeze([0, 0, 0]),
  point: Object.freeze([0, 0, 0]),
  rectArea: Object.freeze([0, 0, 0]),
  spot: Object.freeze([0, 0, 0]),
  tubeArea: Object.freeze([0, 0, 0]),
});

function normalizeLayers(value) {
  const source = Array.isArray(value) ? value : [0];
  return [...new Set(source.map(Number)
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 31))]
    .sort((a, b) => a - b);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
}

/** Creates a portable cookie reference. Runtime textures are intentionally not serialized. */
export function createLightCookie(value = null) {
  if (!isPlainObject(value)) return null;
  const uri = String(value.uri ?? value.url ?? '').trim() || null;
  const key = String(value.key ?? '').trim() || null;
  if (!uri && !key) return null;
  return {
    channel: ['r', 'g', 'b', 'a', 'rgb'].includes(value.channel) ? value.channel : 'rgb',
    intensity: Math.max(finite(value.intensity, 1), 0),
    key,
    uri,
  };
}

/** Creates a portable IES photometric-profile reference for host adapters. */
export function createLightIesProfile(value = null) {
  if (!isPlainObject(value)) return null;
  const uri = String(value.uri ?? value.url ?? '').trim() || null;
  const key = String(value.key ?? '').trim() || null;
  if (!uri && !key) return null;
  return {
    intensity: Math.max(finite(value.intensity, 1), 0),
    key,
    uri,
  };
}

/** Normalizes portable include/exclude tags used by host light-linking adapters. */
export function createLightLinking(value = null) {
  const source = isPlainObject(value) ? value : {};
  return {
    excludeTags: normalizeTags(source.excludeTags ?? source.exclude),
    includeTags: normalizeTags(source.includeTags ?? source.include),
  };
}

/** Normalizes per-light shadow authoring without allocating a shadow map. */
export function createLightShadow(value = null, type = 'point') {
  const source = isPlainObject(value) ? value : {};
  const supported = SHADOW_CAPABLE_LIGHT_TYPES.includes(type);
  return {
    bias: finite(source.bias, -0.0001),
    enabled: supported && Boolean(source.enabled),
    extent: Math.max(finite(source.extent, 40), 0.01),
    far: Math.max(finite(source.far, type === 'directional' ? 250 : 50), 0.01),
    mapSize: 2 ** Math.round(Math.log2(clamp(finite(source.mapSize, 1024), 128, 8192))),
    near: Math.max(finite(source.near, 0.1), 0.001),
    normalBias: Math.max(finite(source.normalBias, 0.01), 0),
    priority: finite(source.priority, 0),
    radius: Math.max(finite(source.radius, 1), 0),
  };
}

/** Normalizes toon-specific metadata preserved for material adapters. */
export function createLightArtisticSettings(value = null) {
  const source = isPlainObject(value) ? value : {};
  return {
    bandSoftness: clamp(finite(source.bandSoftness, 0.08), 0, 1),
    diffuseMultiplier: Math.max(finite(source.diffuseMultiplier, 1), 0),
    rimInfluence: clamp(finite(source.rimInfluence, 0), 0, 1),
    role: ['key', 'fill', 'rim', 'ambient', 'practical', 'effect'].includes(source.role)
      ? source.role
      : 'practical',
    shadowTint: source.shadowTint === null || source.shadowTint === undefined
      ? null
      : createLightColor(source.shadowTint),
    specularMultiplier: Math.max(finite(source.specularMultiplier, 1), 0),
  };
}

/**
 * Creates a complete JSON-compatible light descriptor.
 *
 * @param {string|object} typeOrOptions Light type or an object containing `type`.
 * @param {object} [options] Partial descriptor when the first argument is a type.
 */
export function createLightDescriptor(typeOrOptions = 'point', options = {}) {
  const source = isPlainObject(typeOrOptions)
    ? typeOrOptions
    : isPlainObject(options) ? { ...options, type: typeOrOptions } : { type: typeOrOptions };
  const type = LIGHT_TYPES.includes(source.type) ? source.type : 'point';
  const name = String(source.name ?? `${type[0].toUpperCase()}${type.slice(1)} Light`);
  const id = slug(source.id ?? name, type);
  const angle = clamp(finite(source.angle, Math.PI / 4), 0.001, Math.PI / 2);

  return {
    angle,
    artistic: createLightArtisticSettings(source.artistic),
    castShadow: SHADOW_CAPABLE_LIGHT_TYPES.includes(type) && Boolean(source.castShadow ?? source.shadow?.enabled),
    color: createLightColor(source.color),
    cookie: COOKIE_CAPABLE_LIGHT_TYPES.includes(type) ? createLightCookie(source.cookie) : null,
    decay: Math.max(finite(source.decay, 2), 0),
    distance: Math.max(finite(source.distance, 0), 0),
    enabled: source.enabled === undefined ? true : Boolean(source.enabled),
    groundColor: createLightColor(source.groundColor ?? [0.18, 0.22, 0.34]),
    height: Math.max(finite(source.height, 1), 0.001),
    id,
    intensity: createLightIntensity(type, source.intensity),
    ies: ['point', 'spot'].includes(type) ? createLightIesProfile(source.ies) : null,
    layers: normalizeLayers(source.layers),
    linking: createLightLinking(source.linking),
    maxDistance: Math.max(finite(source.maxDistance, source.distance || 0), 0),
    name,
    penumbra: clamp(finite(source.penumbra, 0.25), 0, 1),
    position: vector(source.position, DEFAULT_POSITIONS[type], 3),
    priority: finite(source.priority, 0),
    shadow: createLightShadow({ ...source.shadow, enabled: source.castShadow ?? source.shadow?.enabled }, type),
    tags: normalizeTags(source.tags),
    target: vector(source.target, DEFAULT_TARGETS[type], 3),
    type,
    userData: isPlainObject(source.userData) ? mergePlain({}, source.userData) : {},
    width: Math.max(finite(source.width, 1), 0.001),
  };
}

/** Re-normalizes a descriptor after applying a deep partial update. */
export function mergeLightDescriptor(descriptor, overrides = {}) {
  return createLightDescriptor(mergePlain(descriptor, overrides));
}

export const createAmbientLightDescriptor = (options = {}) => createLightDescriptor('ambient', options);
export const createHemisphereLightDescriptor = (options = {}) => createLightDescriptor('hemisphere', options);
export const createDirectionalLightDescriptor = (options = {}) => createLightDescriptor('directional', options);
export const createPointLightDescriptor = (options = {}) => createLightDescriptor('point', options);
export const createSpotLightDescriptor = (options = {}) => createLightDescriptor('spot', options);
export const createRectAreaLightDescriptor = (options = {}) => createLightDescriptor('rectArea', options);
export const createDiscAreaLightDescriptor = (options = {}) => createLightDescriptor('discArea', options);
export const createTubeAreaLightDescriptor = (options = {}) => createLightDescriptor('tubeArea', options);

/** Performs structural validation without mutating or coercing the descriptor. */
export function validateLightDescriptor(value, { path = 'light' } = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(value)) {
    errors.push({ message: 'must be an object', path });
    return createValidationResult(errors, warnings);
  }
  if (!LIGHT_TYPES.includes(value.type)) {
    errors.push({ message: `type must be one of ${LIGHT_TYPES.join(', ')}`, path: `${path}.type` });
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    errors.push({ message: 'must be a non-empty string', path: `${path}.id` });
  }
  if (value.position !== undefined && (!Array.isArray(value.position)
    || value.position.length < 3
    || !value.position.slice(0, 3).every((entry) => Number.isFinite(Number(entry))))) {
    errors.push({ message: 'must be a finite [x, y, z] array', path: `${path}.position` });
  }
  if (value.target !== undefined && (!Array.isArray(value.target)
    || value.target.length < 3
    || !value.target.slice(0, 3).every((entry) => Number.isFinite(Number(entry))))) {
    errors.push({ message: 'must be a finite [x, y, z] array', path: `${path}.target` });
  }
  if (value.intensity !== undefined && !isPlainObject(value.intensity) && !Number.isFinite(value.intensity)) {
    errors.push({ message: 'must be a number or intensity object', path: `${path}.intensity` });
  }
  if (isPlainObject(value.intensity)
    && value.intensity.unit !== undefined
    && !['unitless', 'lux', 'candela', 'lumens', 'nits'].includes(value.intensity.unit)) {
    errors.push({ message: 'has an unsupported physical unit', path: `${path}.intensity.unit` });
  }
  if (value.cookie && !COOKIE_CAPABLE_LIGHT_TYPES.includes(value.type)) {
    warnings.push({ message: 'cookies are currently realized only for spot lights', path: `${path}.cookie` });
  }
  if (value.ies && !['point', 'spot'].includes(value.type)) {
    warnings.push({ message: 'IES profiles are portable metadata only for point and spot lights', path: `${path}.ies` });
  }
  if (value.linking !== undefined && !isPlainObject(value.linking)) {
    errors.push({ message: 'must be an include/exclude tag object', path: `${path}.linking` });
  }
  if ((value.castShadow || value.shadow?.enabled) && !SHADOW_CAPABLE_LIGHT_TYPES.includes(value.type)) {
    warnings.push({ message: 'this light type cannot cast Three.js shadows', path: `${path}.shadow` });
  }
  const expectedUnit = getDefaultIntensityUnit(value.type);
  if (isPlainObject(value.intensity)
    && value.intensity.unit
    && value.intensity.unit !== expectedUnit
    && value.intensity.unit !== 'lumens') {
    warnings.push({
      message: `${value.intensity.unit} is converted approximately; ${expectedUnit} is native for ${value.type}`,
      path: `${path}.intensity.unit`,
    });
  }
  return createValidationResult(errors, warnings);
}
