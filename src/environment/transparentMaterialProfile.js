export const TRANSPARENT_PROFILE_TYPE = 'toonlab/transparent-material-profile';
export const TRANSPARENT_PROFILE_VERSION = 1;

export const DEFAULT_TRANSPARENT_PROFILE = Object.freeze({
  type: TRANSPARENT_PROFILE_TYPE,
  version: TRANSPARENT_PROFILE_VERSION,
  id: 'clear_stylized_glass',
  label: 'Clear Stylized Glass',
  settings: Object.freeze({
    attenuationColor: '#78c7d8', attenuationDistance: 3.5,
    clearcoat: 0.72, clearcoatRoughness: 0.12,
    color: '#bdebf2', depthWrite: false, envMapIntensity: 1.15,
    ior: 1.45, metalness: 0, opacity: 0.58, roughness: 0.12,
    thickness: 0.75, transmission: 0.92,
  }),
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? String(value) : fallback;
}

function slug(value, fallback = 'transparent_profile') {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
}

/** Creates the portable profile consumed by the transparent-material lab. */
export function createTransparentProfile(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const settings = source.settings && typeof source.settings === 'object'
    ? source.settings
    : source;
  const defaults = DEFAULT_TRANSPARENT_PROFILE.settings;
  const label = String(source.label ?? DEFAULT_TRANSPARENT_PROFILE.label).trim().slice(0, 80)
    || DEFAULT_TRANSPARENT_PROFILE.label;
  return {
    type: TRANSPARENT_PROFILE_TYPE,
    version: TRANSPARENT_PROFILE_VERSION,
    id: slug(source.id ?? label),
    label,
    settings: {
      attenuationColor: color(settings.attenuationColor, defaults.attenuationColor),
      attenuationDistance: clamp(settings.attenuationDistance, 0.1, 50, defaults.attenuationDistance),
      clearcoat: clamp(settings.clearcoat, 0, 1, defaults.clearcoat),
      clearcoatRoughness: clamp(settings.clearcoatRoughness, 0, 1, defaults.clearcoatRoughness),
      color: color(settings.color, defaults.color),
      depthWrite: Boolean(settings.depthWrite ?? defaults.depthWrite),
      envMapIntensity: clamp(settings.envMapIntensity, 0, 4, defaults.envMapIntensity),
      ior: clamp(settings.ior, 1, 2.5, defaults.ior),
      metalness: clamp(settings.metalness, 0, 1, defaults.metalness),
      opacity: clamp(settings.opacity, 0.05, 1, defaults.opacity),
      roughness: clamp(settings.roughness, 0, 1, defaults.roughness),
      thickness: clamp(settings.thickness, 0, 5, defaults.thickness),
      transmission: clamp(settings.transmission, 0, 1, defaults.transmission),
    },
  };
}

/** Parses JSON or an object without accepting future schema versions. */
export function parseTransparentProfile(input) {
  let source = input;
  if (typeof input === 'string') {
    try { source = JSON.parse(input); } catch (error) {
      return { errors: [`Invalid transparent profile JSON: ${error.message}`], ok: false };
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { errors: ['Transparent profile must be an object.'], ok: false };
  }
  if (source.type !== undefined && source.type !== TRANSPARENT_PROFILE_TYPE) {
    return { errors: [`Expected type ${TRANSPARENT_PROFILE_TYPE}.`], ok: false };
  }
  if (Number(source.version ?? 1) > TRANSPARENT_PROFILE_VERSION) {
    return { errors: [`Transparent profile version ${source.version} is newer than supported version ${TRANSPARENT_PROFILE_VERSION}.`], ok: false };
  }
  return { errors: [], ok: true, value: createTransparentProfile(source) };
}

export function serializeTransparentProfile(input) {
  return JSON.stringify(createTransparentProfile(input), null, 2);
}
