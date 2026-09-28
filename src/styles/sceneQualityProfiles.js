import {
  createSceneQualityDocument,
  validateSceneQualityDocument,
} from './sceneLayerDocuments.js';

export const SCENE_QUALITY_PROFILE_VERSION = 1;

const SCHEMA = Object.freeze({
  catalog: Object.freeze({
    lodFar: [1, 10000],
    lodMid: [1, 10000],
    lodNear: [0, 10000],
  }),
  cloud: Object.freeze({
    baseShapeSize: [16, 64],
    cloudHistoryDiv: [1, 8],
    cloudShadowMipLevel: [0, 3],
    cloudShadowResolution: [128, 1024],
    envMapHeight: [64, 1024],
    envMapMarchSteps: [1, 256],
    envMapWidth: [128, 2048],
    godRaySteps: [1, 128],
    weatherMapResolution: [128, 2048],
  }),
  renderer: Object.freeze({
    maxPixelRatio: [0.25, 4],
    minPixelRatio: [0.25, 4],
  }),
  scheduler: Object.freeze({
    maxFrameMs: [1, 1000],
  }),
  shadows: Object.freeze({
    mapSize: [64, 8192],
    maxDistance: [1, 10000],
    maxUpdatesPerSecond: [0, 120],
  }),
  vegetation: Object.freeze({
    chunkWorldSize: [2, 128],
    cullPadding: [0, 100],
    lodFar: [1, 10000],
    lodMid: [1, 10000],
    lodNear: [0, 10000],
    maxInstances: [1, 10000000],
    maxVisibleChunks: [1, 100000],
  }),
  water: Object.freeze({
    depthScale: [0.1, 1],
    maxPasses: [0, 3],
    reflectionScale: [0.1, 1],
    sceneColorScale: [0.1, 1],
  }),
});

const INTEGER_FIELDS = Object.freeze({
  cloud: new Set([
    'baseShapeSize',
    'cloudHistoryDiv',
    'cloudShadowMipLevel',
    'cloudShadowResolution',
    'envMapHeight',
    'envMapMarchSteps',
    'envMapWidth',
    'godRaySteps',
    'weatherMapResolution',
  ]),
  shadows: new Set(['mapSize']),
  vegetation: new Set(['maxInstances', 'maxVisibleChunks']),
  water: new Set(['maxPasses']),
});

const OPTION_FIELDS = Object.freeze({
  cloud: Object.freeze({
    baseShapeSize: new Set([16, 32, 64]),
    cloudHistoryDiv: new Set([1, 2, 4, 8]),
    cloudShadowResolution: new Set([128, 256, 512, 1024]),
    weatherMapResolution: new Set([256, 512, 1024]),
  }),
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function validateBudgetObject(system, value, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`quality.${system} must be an object.`);
    return;
  }
  const schema = SCHEMA[system];
  for (const key of Object.keys(value)) {
    if (!(key in schema)) errors.push(`Unknown quality.${system} field "${key}".`);
  }
  for (const [key, [minimum, maximum]] of Object.entries(schema)) {
    const number = value[key];
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      errors.push(`quality.${system}.${key} must be between ${minimum} and ${maximum}.`);
    } else if (INTEGER_FIELDS[system]?.has(key) && !Number.isInteger(number)) {
      errors.push(`quality.${system}.${key} must be an integer.`);
    } else if (OPTION_FIELDS[system]?.[key] && !OPTION_FIELDS[system][key].has(number)) {
      errors.push(`quality.${system}.${key} is not a supported value.`);
    }
  }
}

export function validateSceneQualityProfile(input) {
  const base = validateSceneQualityDocument(input);
  if (!base.ok) return base;
  const errors = [];
  const value = base.value;
  for (const system of Object.keys(value.quality)) {
    if (!(system in SCHEMA)) errors.push(`Unknown quality system "${system}".`);
  }
  for (const system of Object.keys(SCHEMA)) {
    validateBudgetObject(system, value.quality[system], errors);
  }
  if (value.quality.renderer?.minPixelRatio > value.quality.renderer?.maxPixelRatio) {
    errors.push('quality.renderer.minPixelRatio cannot exceed maxPixelRatio.');
  }
  for (const system of ['catalog', 'vegetation']) {
    const budget = value.quality[system];
    if (budget && !(budget.lodNear < budget.lodMid && budget.lodMid < budget.lodFar)) {
      errors.push(`quality.${system} LOD distances must increase from near to mid to far.`);
    }
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? value : null,
    warnings: [],
  };
}

export function createSceneQualityProfile(id, definition = {}) {
  const document = createSceneQualityDocument(id, definition);
  const result = validateSceneQualityProfile(document);
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return result.value;
}

export function parseSceneQualityProfile(input) {
  try {
    return validateSceneQualityProfile(typeof input === 'string' ? JSON.parse(input) : input);
  } catch (error) {
    return { errors: [`Invalid scene quality profile JSON: ${error.message}`], ok: false, value: null, warnings: [] };
  }
}

export function serializeSceneQualityProfile(input, { pretty = true } = {}) {
  const result = validateSceneQualityProfile(input);
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}

const BALANCED_BUDGET = {
  catalog: { lodFar: 220, lodMid: 95, lodNear: 32 },
  cloud: {
    baseShapeSize: 64,
    cloudHistoryDiv: 2,
    cloudShadowMipLevel: 2,
    cloudShadowResolution: 512,
    envMapHeight: 256,
    envMapMarchSteps: 48,
    envMapWidth: 512,
    godRaySteps: 24,
    weatherMapResolution: 1024,
  },
  renderer: { maxPixelRatio: 2, minPixelRatio: 0.75 },
  scheduler: { maxFrameMs: 16.67 },
  shadows: { mapSize: 2048, maxDistance: 220, maxUpdatesPerSecond: 30 },
  vegetation: { chunkWorldSize: 16, cullPadding: 8, lodFar: 400, lodMid: 70, lodNear: 24, maxInstances: 180000, maxVisibleChunks: 196 },
  water: { depthScale: 0.75, maxPasses: 3, reflectionScale: 0.5, sceneColorScale: 1 },
};

const PERFORMANCE_BUDGET = {
  catalog: { lodFar: 150, lodMid: 64, lodNear: 22 },
  cloud: {
    baseShapeSize: 32,
    cloudHistoryDiv: 2,
    cloudShadowMipLevel: 2,
    cloudShadowResolution: 256,
    envMapHeight: 192,
    envMapMarchSteps: 32,
    envMapWidth: 384,
    godRaySteps: 16,
    weatherMapResolution: 512,
  },
  renderer: { maxPixelRatio: 1.25, minPixelRatio: 0.5 },
  scheduler: { maxFrameMs: 12.5 },
  shadows: { mapSize: 1024, maxDistance: 150, maxUpdatesPerSecond: 15 },
  vegetation: { chunkWorldSize: 24, cullPadding: 4, lodFar: 105, lodMid: 48, lodNear: 18, maxInstances: 90000, maxVisibleChunks: 112 },
  water: { depthScale: 0.5, maxPasses: 2, reflectionScale: 0.35, sceneColorScale: 0.75 },
};

export const SCENE_QUALITY_PROFILES = deepFreeze({
  balanced: createSceneQualityProfile('balanced', {
    description: 'Reference quality budgets for the supported ToonLab scene systems.',
    label: 'Balanced',
    quality: BALANCED_BUDGET,
  }),
  performance: createSceneQualityProfile('performance', {
    description: 'Lower-cost representations with the same style and scenario.',
    label: 'Performance',
    quality: PERFORMANCE_BUDGET,
  }),
});

export function getSceneQualityProfileOptions() {
  return Object.values(SCENE_QUALITY_PROFILES).map(({ id, label, description }) => ({
    description,
    id,
    label,
  }));
}

export function resolveSceneQualityProfile(input = 'balanced') {
  const source = typeof input === 'string' ? SCENE_QUALITY_PROFILES[input] : input;
  if (!source) throw new Error(`Unknown scene quality profile "${input}".`);
  const result = validateSceneQualityProfile(source);
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return cloneJson(result.value);
}

export function resolveCatalogQualityOptions(input = 'balanced') {
  const { catalog } = resolveSceneQualityProfile(input).quality;
  return {
    lodDistances: [0, catalog.lodNear, catalog.lodMid, catalog.lodFar],
  };
}

export function resolveVegetationQualityOptions(input = 'balanced') {
  const { vegetation } = resolveSceneQualityProfile(input).quality;
  return {
    chunkSize: vegetation.chunkWorldSize,
    cullPadding: vegetation.cullPadding,
    lodDistances: [vegetation.lodNear, vegetation.lodMid, vegetation.lodFar],
    maxVisibleChunks: vegetation.maxVisibleChunks,
    maxVisibleInstances: vegetation.maxInstances,
  };
}

export function resolveWaterQualityOptions(input = 'balanced') {
  return { ...resolveSceneQualityProfile(input).quality.water };
}

export function resolveSkyQualityOptions(input = 'balanced') {
  const { cloud } = resolveSceneQualityProfile(input).quality;
  return {
    baseShapeDims: {
      x: cloud.baseShapeSize,
      y: cloud.baseShapeSize,
      z: cloud.baseShapeSize,
    },
    cloudHistoryDiv: cloud.cloudHistoryDiv,
    cloudShadowMipLevel: cloud.cloudShadowMipLevel,
    cloudShadowResolution: cloud.cloudShadowResolution,
    envMapHeight: cloud.envMapHeight,
    envMapMarchSteps: cloud.envMapMarchSteps,
    envMapWidth: cloud.envMapWidth,
    godRaySteps: cloud.godRaySteps,
    weatherMapResolution: cloud.weatherMapResolution,
  };
}
