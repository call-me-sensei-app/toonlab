import {
  collectCatalogLodBindings,
  createCatalogLodRuntime,
} from '../../catalog/officialCatalogLod.js';

export const DENSE_FIELD_ROCK_LOD_LEVELS = Object.freeze([
  Object.freeze({ id: 'LOD0', level: 0, purpose: 'hero-close' }),
  Object.freeze({ id: 'LOD1', level: 1, purpose: 'near-gameplay' }),
  Object.freeze({ id: 'LOD2', level: 2, purpose: 'mid-gameplay' }),
  Object.freeze({ id: 'LOD3', level: 3, purpose: 'far-simplified' }),
  Object.freeze({ id: 'LOD4', level: 4, purpose: 'very-far-silhouette' }),
]);

export const DENSE_FIELD_ROCK_PIXEL_THRESHOLDS = Object.freeze([240, 110, 48, 16, 6]);
export const DENSE_FIELD_ROCK_CULL_BELOW_PIXELS = 5;

export const DENSE_FIELD_ROCK_TRIANGLE_CEILINGS = Object.freeze({
  ordinary: Object.freeze({ LOD3: 1200, LOD4: 350 }),
  formation: Object.freeze({ LOD3: 1800, LOD4: 600 }),
  landmark: Object.freeze({ LOD3: 2500, LOD4: 800 }),
});

export const DENSE_FIELD_ROCK_PRODUCTION_RULE = Object.freeze({
  cullBelowPixels: DENSE_FIELD_ROCK_CULL_BELOW_PIXELS,
  farShadowLastLevel: 2,
  levelCount: 5,
  levels: DENSE_FIELD_ROCK_LOD_LEVELS,
  pixelThresholds: DENSE_FIELD_ROCK_PIXEL_THRESHOLDS,
  selectionBasis: 'projected-object-diameter-pixels',
  triangleCeilings: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS,
  veryFar: Object.freeze({
    allowedSurfaceChannels: Object.freeze(['baseColor', 'broadLighting']),
    castShadow: false,
    preserve: Object.freeze(['outerSilhouette', 'primaryMass', 'groundContact', 'broadBaseColor']),
    remove: Object.freeze([
      'cracks',
      'strataRelief',
      'cavities',
      'secondaryLedges',
      'normalMap',
      'heightMap',
      'aoMap',
      'uniqueRoughness',
    ]),
    silhouetteOnly: true,
  }),
});

export function inferDenseFieldRockClass({ scaleClass = null, targetHeightMetres = null } = {}) {
  const named = String(scaleClass ?? '').trim().toLowerCase();
  if (named === 'landmark' || named === 'hero' || named === 'backdrop') return 'landmark';
  if (named === 'formation' || named === 'outcrop' || named === 'cliff') return 'formation';
  if (named === 'ordinary' || named === 'boulder' || named === 'debris') return 'ordinary';
  const height = Number(targetHeightMetres);
  if (Number.isFinite(height) && height > 6) return 'landmark';
  if (Number.isFinite(height) && height > 2) return 'formation';
  return 'ordinary';
}

export function validateDenseFieldRockLodTargets(targets, {
  assetClass = 'ordinary',
} = {}) {
  const classification = Object.hasOwn(DENSE_FIELD_ROCK_TRIANGLE_CEILINGS, assetClass)
    ? assetClass
    : 'ordinary';
  const ceilings = DENSE_FIELD_ROCK_TRIANGLE_CEILINGS[classification];
  const values = DENSE_FIELD_ROCK_LOD_LEVELS.map(({ id }) => Number(targets?.[id]));
  const errors = [];
  values.forEach((value, level) => {
    if (!Number.isInteger(value) || value <= 0) {
      errors.push(`${DENSE_FIELD_ROCK_LOD_LEVELS[level].id} must be a positive integer`);
    }
  });
  for (let level = 1; level < values.length; level += 1) {
    if (Number.isFinite(values[level]) && Number.isFinite(values[level - 1])
      && values[level] >= values[level - 1]) {
      errors.push(`LOD${level} must contain fewer triangles than LOD${level - 1}`);
    }
  }
  if (Number.isFinite(values[3]) && values[3] > ceilings.LOD3) {
    errors.push(`LOD3 exceeds the ${classification} ${ceilings.LOD3}-triangle ceiling`);
  }
  if (Number.isFinite(values[4]) && values[4] > ceilings.LOD4) {
    errors.push(`LOD4 exceeds the ${classification} ${ceilings.LOD4}-triangle ceiling`);
  }
  return Object.freeze({
    assetClass: classification,
    ceilings,
    errors: Object.freeze(errors),
    valid: errors.length === 0,
    values: Object.freeze(values),
  });
}

/**
 * Install the mandatory dense-field rock behavior on an authored LOD0-LOD4
 * root. The final tier is geometry-only silhouette support; it never casts a
 * shadow and the root is culled once its projected diameter drops below the
 * production pixel threshold.
 */
export function createDenseFieldRockLodRuntime(root, {
  cullBelowPixels = DENSE_FIELD_ROCK_CULL_BELOW_PIXELS,
  hysteresis = 0.12,
  maxLevel = Number.POSITIVE_INFINITY,
  pixelThresholds = DENSE_FIELD_ROCK_PIXEL_THRESHOLDS,
  referenceDiameter = null,
  requireComplete = true,
} = {}) {
  const bindings = collectCatalogLodBindings(root);
  const levels = [...new Set(bindings.map(({ level }) => level))].sort((a, b) => a - b);
  const missing = DENSE_FIELD_ROCK_LOD_LEVELS
    .map(({ level }) => level)
    .filter((level) => !levels.includes(level));
  if (requireComplete && missing.length > 0) {
    throw new Error(`Dense-field rock is missing required visual tiers: ${missing.map((level) => `LOD${level}`).join(', ')}`);
  }

  const originalShadows = new Map(bindings.map(({ mesh }) => [mesh, mesh.castShadow]));
  for (const { level, mesh } of bindings) {
    if (level > DENSE_FIELD_ROCK_PRODUCTION_RULE.farShadowLastLevel) mesh.castShadow = false;
    mesh.userData.toonlabDenseFieldRock = Object.freeze({
      castShadow: mesh.castShadow,
      silhouetteOnly: level === 4,
      visualLevel: level,
    });
  }

  const runtime = createCatalogLodRuntime(root, {
    cullBelowPixels,
    hysteresis,
    maxLevel,
    pixelThresholds,
    referenceDiameter,
  });
  return Object.freeze({
    ...runtime,
    policy: DENSE_FIELD_ROCK_PRODUCTION_RULE,
    dispose() {
      runtime.dispose();
      for (const [mesh, castShadow] of originalShadows) mesh.castShadow = castShadow;
    },
  });
}
