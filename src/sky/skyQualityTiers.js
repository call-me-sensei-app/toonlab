// Deployment quality tiers for the volumetric sky. These are cost policy, not
// look: presets never carry a tier, and switching tier must not change the
// authored image beyond resolution and reconstruction.
//
// The one thing tiers deliberately do NOT scale is the raymarch budget. Steps
// per ray are fixed at 128 primary / 6 light for every tier; a tier moves how
// many *rays* are marched (cloudHistoryDiv) instead. Scaling steps would change
// the transmittance integral and therefore the look, which is the whole reason
// the budget lives outside the table.
//
// An override this module cannot honour is warned about and dropped, never
// silently swallowed: `resolveQuality` already shouted about an unknown field
// name, so staying quiet about an unusable *value* made silence read as
// acceptance. Value rules match src/cloud/paramSchema.js so the two schema
// layers agree about what a boolean and a number are.

// The legal weather-map resolutions are imported, not re-declared: the noise
// module owns that set, and a second copy here is how the tier field, the
// resolver and the spec's tier table drifted into three different ranges.
import { NOISE_VOLUME_MIN_DIM } from '../cloud/noise/noiseVolume.js';
import { WEATHER_MAP_RESOLUTIONS } from '../cloud/noise/weatherMap.js';
import { describe, finiteNumber, isObject } from '../cloud/paramSchema.js';

/** Primary march steps per view ray. Fixed across every tier. */
export const CLOUD_PRIMARY_MARCH_STEPS = 128;

/** Light-march steps per primary sample. Fixed across every tier. */
export const CLOUD_LIGHT_MARCH_STEPS = 6;

export const CLOUD_MARCH_BUDGET = Object.freeze({
  lightSteps: CLOUD_LIGHT_MARCH_STEPS,
  primarySteps: CLOUD_PRIMARY_MARCH_STEPS,
});

// Names a tier is forbidden to carry, so the fixed budget cannot drift back in
// through a well-meaning edit to the table below.
const FORBIDDEN_TIER_FIELDS = Object.freeze([
  'cloudLightSteps',
  'cloudMarchSteps',
  'cloudPrimarySteps',
  'lightSteps',
  'marchSteps',
  'primarySteps',
]);

function dims(size) {
  return Object.freeze({ x: size, y: size, z: size });
}

export const QUALITY_LEVELS = Object.freeze({
  low: Object.freeze({
    baseShapeDims: dims(16),
    cloudHistoryDiv: 4,
    cloudShadowMipLevel: 3,
    cloudShadowResolution: 128,
    envMapClouds: false,
    envMapEnabled: true,
    envMapHeight: 128,
    envMapMarchSteps: 24,
    envMapMipBase: 3,
    envMapWidth: 256,
    godRaySteps: 16,
    godRaysEnabled: false,
    weatherMapResolution: 256,
  }),
  medium: Object.freeze({
    baseShapeDims: dims(32),
    cloudHistoryDiv: 2,
    cloudShadowMipLevel: 2,
    cloudShadowResolution: 256,
    envMapClouds: true,
    envMapEnabled: true,
    envMapHeight: 192,
    envMapMarchSteps: 32,
    envMapMipBase: 2,
    envMapWidth: 384,
    godRaySteps: 16,
    godRaysEnabled: true,
    weatherMapResolution: 512,
  }),
  high: Object.freeze({
    baseShapeDims: dims(64),
    cloudHistoryDiv: 2,
    cloudShadowMipLevel: 2,
    cloudShadowResolution: 512,
    envMapClouds: true,
    envMapEnabled: true,
    envMapHeight: 256,
    envMapMarchSteps: 48,
    envMapMipBase: 1,
    envMapWidth: 512,
    godRaySteps: 24,
    godRaysEnabled: true,
    weatherMapResolution: 1024,
  }),
  ultra: Object.freeze({
    baseShapeDims: dims(64),
    cloudHistoryDiv: 2,
    cloudShadowMipLevel: 1,
    cloudShadowResolution: 1024,
    envMapClouds: true,
    envMapEnabled: true,
    envMapHeight: 512,
    envMapMarchSteps: 64,
    envMapMipBase: 1,
    envMapWidth: 1024,
    godRaySteps: 24,
    godRaysEnabled: true,
    weatherMapResolution: 1024,
  }),
});

export const QUALITY_LEVEL_NAMES = Object.freeze(['low', 'medium', 'high', 'ultra']);

export const DEFAULT_QUALITY_LEVEL = 'high';

export const QUALITY_LEVEL_OPTIONS = Object.freeze([
  Object.freeze({ description: 'Quarter-rate cloud reconstruction, no god rays, cloud-free reflections.', id: 'low', label: 'Low', value: 'low' }),
  Object.freeze({ description: 'Half-rate reconstruction with god rays and clouded reflections.', id: 'medium', label: 'Medium', value: 'medium' }),
  Object.freeze({ description: 'Default tier: half-rate reconstruction, full-detail shape volume.', id: 'high', label: 'High', value: 'high' }),
  Object.freeze({ description: 'Sharpest shadows and reflections; same march budget as every other tier.', id: 'ultra', label: 'Ultra', value: 'ultra' }),
]);

// Field metadata so the labs can show what a tier costs without hard-coding it.
const INTEGER = 'integer';
const BOOLEAN = 'boolean';
const DIMS = 'dims3';

export const QUALITY_LEVEL_FIELDS = Object.freeze({
  cloudHistoryDiv: Object.freeze({
    description: 'Reconstruction divisor. The cloud image renders at screen size divided by this and upscales, so each step quarters the work.',
    label: 'Cloud History Divisor',
    options: Object.freeze([1, 2, 4, 8]),
    type: INTEGER,
  }),
  cloudShadowResolution: Object.freeze({
    // Bounded to the documented tier range. Unbounded, an override of 4096 was
    // accepted silently — a 16x ultra allocation for the shadow bake, which is
    // not a knob anyone reaches for on purpose.
    description: 'Square resolution of the top-down cloud shadow bake.',
    label: 'Shadow Resolution',
    max: 1024,
    min: 128,
    type: INTEGER,
    unit: 'pixels',
  }),
  cloudShadowMipLevel: Object.freeze({
    // r185 cannot build a 3D mip chain on WebGPU, so a level is served by a
    // coarser *volume*. Per the spec the shift is relative to the 64-cubed
    // master plan, never to this tier's already-reduced baseShapeDims, and the
    // resolved volume floors at 8 cubed with a warning when it had to clamp.
    description: 'Cloud-field detail the shadow bake reads, as a halving of the 64-cubed master volume. 0 is finest; the resolved volume never goes below 8 cubed.',
    label: 'Shadow Mip',
    max: 3,
    min: 0,
    type: INTEGER,
  }),
  godRaysEnabled: Object.freeze({
    description: 'Runs the crepuscular-ray march. A preset may override this.',
    label: 'God Rays',
    type: BOOLEAN,
  }),
  godRaySteps: Object.freeze({
    description: 'Samples per view ray in the god-ray march. The dominant cost of the effect.',
    label: 'God Ray Steps',
    min: 1,
    type: INTEGER,
  }),
  envMapEnabled: Object.freeze({
    description: 'Bakes the reflection environment map.',
    label: 'Env Map',
    type: BOOLEAN,
  }),
  envMapClouds: Object.freeze({
    description: 'Bakes clouds into the reflection as well as the sky dome.',
    label: 'Env Map Clouds',
    type: BOOLEAN,
  }),
  envMapWidth: Object.freeze({
    description: 'Equirectangular bake width.',
    label: 'Env Map Width',
    min: 8,
    type: INTEGER,
    unit: 'pixels',
  }),
  envMapHeight: Object.freeze({
    description: 'Equirectangular bake height, normally half the width.',
    label: 'Env Map Height',
    min: 8,
    type: INTEGER,
    unit: 'pixels',
  }),
  envMapMarchSteps: Object.freeze({
    description: 'Cloud march steps for the env-map bake. Independent of the on-screen budget, and far lower.',
    label: 'Env Map March Steps',
    min: 1,
    type: INTEGER,
  }),
  envMapMipBase: Object.freeze({
    // Same 64-cubed-relative reading and 8-cubed floor as cloudShadowMipLevel.
    description: 'Base-shape detail floor for the bake, as a halving of the 64-cubed master volume. Higher buys cheaper, softer reflections; the resolved volume never goes below 8 cubed.',
    label: 'Env Map Mip Base',
    min: 0,
    type: INTEGER,
  }),
  weatherMapResolution: Object.freeze({
    // Bounded by the noise module's own legal set rather than by a range of its
    // own: below 256 the coverage FBM loses octaves to its band limit, so a
    // smaller map is a different sky, not a cheaper one.
    // An `options` set, not just a range: a range let 384 through, which the
    // generator then snapped to 256. The document said 384, the texture was 256,
    // and nothing warned — so the legal set is the constraint, not its endpoints.
    description: `Square resolution of the CPU-generated coverage map. One of ${WEATHER_MAP_RESOLUTIONS.join(', ')}.`,
    label: 'Weather Resolution',
    options: WEATHER_MAP_RESOLUTIONS,
    type: INTEGER,
    unit: 'pixels',
  }),
  baseShapeDims: Object.freeze({
    // No prebaked volume exists, and describing one made the tier UI promise a
    // free switch. Stated as a texel-count ratio rather than in milliseconds so
    // the text cannot go stale on hardware other than the machine it was timed on.
    description: 'Base-shape 3D noise resolution. Always generated on the CPU, cached per (resolution, seed). Cost scales with texel count — 64 cubed is 8x the texels of 32 cubed and takes a few hundred ms — so drive it from a debounced control.',
    label: 'Base Shape Dims',
    max: 64,
    min: NOISE_VOLUME_MIN_DIM,
    type: DIMS,
    unit: 'voxels',
  }),
});

/** Env-map defaults when one is built directly rather than seeded from a tier. */
export const DEFAULT_ENV_MAP_OPTIONS = Object.freeze({
  cloudMarchSteps: 16,
  cloudMipBase: 0,
  includeClouds: true,
  skipFrames: 4,
  width: 384,
});

/**
 * Guards the invariant this module exists to protect: the march budget is fixed
 * and must never appear in the tier table. Runs at import time and is exported
 * so the verify scripts can assert it too.
 */
export function assertFixedMarchBudget() {
  if (CLOUD_PRIMARY_MARCH_STEPS !== 128 || CLOUD_LIGHT_MARCH_STEPS !== 6) {
    throw new Error(
      `March budget must stay 128 primary / 6 light steps; found ${CLOUD_PRIMARY_MARCH_STEPS}/${CLOUD_LIGHT_MARCH_STEPS}.`,
    );
  }
  for (const [name, tier] of Object.entries(QUALITY_LEVELS)) {
    for (const field of FORBIDDEN_TIER_FIELDS) {
      if (field in tier) {
        throw new Error(
          `Quality tier "${name}" must not scale the march budget (found "${field}").`,
        );
      }
    }
  }
  return CLOUD_MARCH_BUDGET;
}

assertFixedMarchBudget();

/** The march budget, which is the same object for every tier by construction. */
export function resolveMarchBudget() {
  return CLOUD_MARCH_BUDGET;
}

export function resolveQualityLevelName(level) {
  const name = typeof level === 'string'
    ? level.trim().toLowerCase()
    : String(level?.id ?? level?.quality ?? '').trim().toLowerCase();
  return QUALITY_LEVEL_NAMES.includes(name) ? name : DEFAULT_QUALITY_LEVEL;
}

function warnTier(message) {
  console.warn(`[skyQualityTiers] ${message}`);
}

// An override the field cannot represent is dropped in favour of the tier value,
// which is a decision worth stating out loud. Clamping it instead would invent a
// cost the author never asked for — an `envMapWidth: -5` becoming an 8-pixel
// bake is not what anyone meant by -5.
function rejectOverride(key, value, reason, fallback) {
  warnTier(
    `Quality override "${key}" ${reason} (got ${describe(value)}); `
    + `the tier value ${describe(fallback)} was kept.`,
  );
  return fallback;
}

// Only real numbers and numeric strings count. `Number(value)` would read [],
// null and false as 0, which is how `baseShapeDims: []` used to resolve to a
// 4x4x4 volume without a word.
function normalizeInteger(key, field, value, fallback) {
  const number = finiteNumber(value);
  if (number === null) return rejectOverride(key, value, 'must be a number', fallback);
  const rounded = Math.round(number);
  if (field.options) {
    return field.options.includes(rounded)
      ? rounded
      : rejectOverride(key, value, `must be one of ${field.options.join(', ')}`, fallback);
  }
  const min = field.min ?? 1;
  if (rounded < min) return rejectOverride(key, value, `must be at least ${min}`, fallback);
  if (field.max !== undefined && rounded > field.max) {
    return rejectOverride(key, value, `must be at most ${field.max}`, fallback);
  }
  return rounded;
}

function normalizeBooleanField(key, value, fallback) {
  // Same rule as src/cloud/paramSchema.js: a boolean, or the 0/1 a URL param or
  // a store round-trip produces. Plain `Boolean(value)` turned the string
  // 'false' into true and quietly enabled an effect the low tier disables.
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  return rejectOverride(key, value, 'must be a boolean', fallback);
}

function normalizeDims(key, field, value, fallback) {
  const floor = field.min ?? 4;
  // A bare number is accepted because every bundled tier is cubic, and typing
  // `{ baseShapeDims: 32 }` in a lab override is the common case.
  const size = finiteNumber(value);
  if (size !== null) {
    const rounded = Math.round(size);
    return rounded < floor
      ? rejectOverride(key, value, `must be at least ${floor} on every axis`, fallback)
      : dims(rounded);
  }
  if (!isObject(value)) {
    return rejectOverride(key, value, 'must be a number or an { x, y, z } object', fallback);
  }
  const axis = (name) => {
    if (value[name] === undefined || value[name] === null) return fallback[name];
    const requested = finiteNumber(value[name]);
    const rounded = requested === null ? null : Math.round(requested);
    if (rounded === null || rounded < floor) {
      return rejectOverride(`${key}.${name}`, value[name], `must be at least ${floor}`, fallback[name]);
    }
    return rounded;
  };
  return Object.freeze({ x: axis('x'), y: axis('y'), z: axis('z') });
}

/**
 * Merges a `Partial<QualityLevelConfig>` over a named tier. Unknown fields, any
 * attempt to override the fixed march budget, and any value a field cannot
 * represent are all reported and dropped — nothing is discarded silently.
 */
export function resolveQuality(level = DEFAULT_QUALITY_LEVEL, overrides = {}) {
  const tier = QUALITY_LEVELS[resolveQualityLevelName(level)];
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides
    : {};
  const config = {};
  for (const [key, field] of Object.entries(QUALITY_LEVEL_FIELDS)) {
    const fallback = tier[key];
    if (!(key in source) || source[key] === undefined || source[key] === null) {
      config[key] = fallback;
    } else if (field.type === BOOLEAN) {
      config[key] = normalizeBooleanField(key, source[key], fallback);
    } else if (field.type === DIMS) {
      config[key] = normalizeDims(key, field, source[key], fallback);
    } else {
      config[key] = normalizeInteger(key, field, source[key], fallback);
    }
  }
  for (const key of Object.keys(source)) {
    if (key in QUALITY_LEVEL_FIELDS) continue;
    if (FORBIDDEN_TIER_FIELDS.includes(key)) {
      console.warn(
        `[skyQualityTiers] "${key}" is fixed at ${CLOUD_PRIMARY_MARCH_STEPS} primary / ${CLOUD_LIGHT_MARCH_STEPS} light steps and cannot be set per tier.`,
      );
      continue;
    }
    console.warn(`[skyQualityTiers] Unknown quality field "${key}" was ignored.`);
  }
  return Object.freeze(config);
}
