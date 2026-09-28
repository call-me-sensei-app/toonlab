// Legacy procedural-rock LOD policy, calibrated from the reference inventory.
// Actual source-mesh references bypass this policy and preserve every exact
// authored LOD; Surface Nets generation uses it only for retained old presets.

export const REFERENCE_ROCK_LOD_RATIOS = Object.freeze([1, 0.5, 0.25]);

// LOD0 ceilings are rounded, modest-headroom versions of the studied asset
// roles: single boulders peak near 290 triangles, clumps near 850, and the
// representative cliff near 430. Landmark and hero roles are explicit escape
// hatches for authored silhouettes that genuinely need more geometry.
const ROLE_LOD0_BUDGETS = Object.freeze({
  boulder: 320,
  cliff: 512,
  cluster: 960,
  hero: 4096,
  landmark: 2048,
});

function budgetsFromLod0(lod0) {
  return Object.freeze(REFERENCE_ROCK_LOD_RATIOS.map((ratio) => (
    Math.max(Math.round(lod0 * ratio), 1)
  )));
}

export const REFERENCE_ROCK_LOD_ROLE_BUDGETS = Object.freeze(Object.fromEntries(
  Object.entries(ROLE_LOD0_BUDGETS).map(([role, lod0]) => [role, budgetsFromLod0(lod0)]),
));

export const REFERENCE_ROCK_LOD_ROLES = Object.freeze(
  Object.keys(REFERENCE_ROCK_LOD_ROLE_BUDGETS),
);

const ROLE_ALIASES = Object.freeze({
  boulderClump: 'cluster',
  'boulder-clump': 'cluster',
  clump: 'cluster',
  'cliff-piece': 'cliff',
  cliffFace: 'cliff',
  'column-piece': 'cliff',
  'column-rock': 'cliff',
  'hoodoo-cliff': 'cliff',
  hoodoo: 'cliff',
  'layered-rock': 'boulder',
  'metric-block': 'boulder',
  'mountain-backdrop': 'landmark',
  platform: 'cluster',
  'ridge-clump': 'cluster',
  rock: 'boulder',
  'rock-clump': 'cluster',
  setPiece: 'landmark',
  shelf: 'cluster',
  'slanted-rock': 'boulder',
  spire: 'landmark',
  'vertical-clump': 'cluster',
});

function finiteInteger(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function finiteNumber(value, fallback, { max = Infinity, min = -Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function normalizeRole(value) {
  const requested = String(value ?? 'boulder').trim();
  const role = ROLE_ALIASES[requested] ?? requested;
  if (!Object.hasOwn(REFERENCE_ROCK_LOD_ROLE_BUDGETS, role)) {
    throw new Error(
      `Unknown rock LOD role "${requested}" (expected ${REFERENCE_ROCK_LOD_ROLES.join(', ')}).`,
    );
  }
  return role;
}

function normalizeRatios(value) {
  if (!Array.isArray(value) || value.length !== 3) return [...REFERENCE_ROCK_LOD_RATIOS];
  const ratios = value.map((entry, index) => finiteNumber(
    entry,
    REFERENCE_ROCK_LOD_RATIOS[index],
    { max: 1, min: 0.001 },
  ));
  ratios[0] = 1;
  for (let index = 1; index < ratios.length; index += 1) {
    ratios[index] = Math.min(ratios[index], ratios[index - 1]);
  }
  return ratios;
}

function normalizeBudgets(value, role, ratios) {
  const roleBudgets = REFERENCE_ROCK_LOD_ROLE_BUDGETS[role];
  if (!Array.isArray(value) || value.length !== 3) return [...roleBudgets];
  const budgets = value.map((entry, index) => finiteInteger(
    entry,
    roleBudgets[index],
    { min: 1 },
  ));
  for (let index = 1; index < budgets.length; index += 1) {
    budgets[index] = Math.min(budgets[index], budgets[index - 1]);
  }
  // A custom LOD0-only budget can be expressed by passing [N, null, null].
  for (let index = 1; index < budgets.length; index += 1) {
    if (value[index] === null || value[index] === undefined) {
      budgets[index] = Math.max(Math.round(budgets[0] * ratios[index]), 1);
    }
  }
  return budgets;
}

/**
 * Creates a normalized procedural-rock LOD policy with up to three levels.
 *
 * Role budgets are hard ceilings when an integer Surface Nets resolution can
 * attain them. `minResolution` mirrors meshDocument's hard minimum of 8; a
 * budget below what that grid can represent is reported as minimum-limited,
 * rather than pretending that the cap was met.
 */
export function createReferenceRockLodPolicy(options = {}) {
  const role = normalizeRole(options.role);
  const ratios = normalizeRatios(options.ratios);
  const targetTriangles = Number(options.targetTriangles);
  const requestedBudgets = options.triangleBudgets ?? (
    Number.isFinite(targetTriangles) && targetTriangles > 0
      ? [targetTriangles, null, null]
      : null
  );
  const triangleBudgets = normalizeBudgets(requestedBudgets, role, ratios);
  const minResolution = finiteInteger(options.minResolution, 8, { max: 320, min: 8 });
  const maxResolution = finiteInteger(options.maxResolution, 320, {
    max: 320,
    min: minResolution,
  });
  const probeResolution = finiteInteger(options.probeResolution, 24, {
    max: maxResolution,
    min: minResolution,
  });
  const silhouetteThreshold = finiteNumber(options.silhouetteThreshold, 0.72, { max: 1, min: 0 });
  const silhouetteThresholds = Array.isArray(options.silhouetteThresholds)
    && options.silhouetteThresholds.length === 3
    ? options.silhouetteThresholds.map((entry, level) => finiteNumber(
      entry,
      level === 2 ? Math.max(silhouetteThreshold - 0.02, 0) : silhouetteThreshold,
      { max: 1, min: 0 },
    ))
    : [1, silhouetteThreshold, Math.max(silhouetteThreshold - 0.02, 0)];

  return Object.freeze({
    allowTinyTopologyRetention: options.allowTinyTopologyRetention !== false,
    boundsCenterTolerance: finiteNumber(options.boundsCenterTolerance, 0.1, { max: 1, min: 0 }),
    boundsSizeTolerance: finiteNumber(options.boundsSizeTolerance, 0.18, { max: 1, min: 0 }),
    levelCount: finiteInteger(options.levelCount, 3, { max: 3, min: 1 }),
    maxResolution,
    minResolution,
    probeResolution,
    ratioTolerance: finiteNumber(options.ratioTolerance, 0.4, { max: 2, min: 0 }),
    ratios: Object.freeze(ratios),
    role,
    silhouetteGridSize: finiteInteger(options.silhouetteGridSize, 40, { max: 128, min: 12 }),
    silhouetteThreshold,
    silhouetteThresholds: Object.freeze(silhouetteThresholds),
    tinyTriangleThreshold: finiteInteger(options.tinyTriangleThreshold, 96, { min: 0 }),
    triangleBudgets: Object.freeze(triangleBudgets),
  });
}

export function resolveReferenceRockLodPolicy(roleOrPolicy = 'boulder', overrides = {}) {
  if (typeof roleOrPolicy === 'string' || roleOrPolicy === null || roleOrPolicy === undefined) {
    return createReferenceRockLodPolicy({ ...overrides, role: roleOrPolicy ?? 'boulder' });
  }
  if (typeof roleOrPolicy !== 'object' || Array.isArray(roleOrPolicy)) {
    throw new TypeError('Rock LOD policy must be a role name or an options object.');
  }
  return createReferenceRockLodPolicy({ ...roleOrPolicy, ...overrides });
}

/**
 * Resolves catalog/reference metadata without coupling the planner to a
 * catalog schema. Explicit options win; otherwise `reference.targetTriangles`
 * becomes LOD0 and the policy derives its half/quarter budgets.
 */
export function createReferenceRockLodPolicyForDocument(document, options = {}) {
  const reference = document?.reference && typeof document.reference === 'object'
    ? document.reference
    : {};
  const explicitBudgets = Object.hasOwn(options, 'triangleBudgets')
    || Object.hasOwn(options, 'targetTriangles');
  const referenceLevels = Array.isArray(reference.lodTriangles)
    ? reference.lodTriangles
      .slice(0, 3)
      .map((entry) => finiteInteger(entry, 0, { min: 0 }))
      .filter((entry) => entry > 0)
    : [];
  const exactLevelCount = referenceLevels.length;
  const exactBudgets = [...referenceLevels];
  const exactRatios = referenceLevels.map((entry) => entry / referenceLevels[0]);
  while (exactBudgets.length > 0 && exactBudgets.length < 3) {
    const level = exactBudgets.length;
    exactBudgets.push(Math.max(Math.round(exactBudgets[0] * REFERENCE_ROCK_LOD_RATIOS[level]), 1));
    exactRatios.push(exactBudgets[level] / exactBudgets[0]);
  }
  return createReferenceRockLodPolicy({
    ...(!explicitBudgets && exactLevelCount > 0 ? {
      levelCount: exactLevelCount,
      ratios: exactRatios,
      triangleBudgets: exactBudgets,
    } : {}),
    ...options,
    // Catalog `role` describes inventory use (core form / metric utility /
    // backdrop); `archetype` describes the geometry budget class. Older
    // callers may still put the geometry role directly in `reference.role`.
    role: options.role ?? reference.archetype ?? reference.role ?? 'boulder',
    ...(!explicitBudgets && exactLevelCount === 0
      && Number.isFinite(Number(reference.targetTriangles))
      ? { targetTriangles: Number(reference.targetTriangles) }
      : {}),
  });
}

/** Returns actual triangle targets for a measured LOD0 mesh. */
export function createRockLodTriangleTargets(lod0Triangles, roleOrPolicy = 'boulder') {
  const policy = resolveReferenceRockLodPolicy(roleOrPolicy);
  const base = finiteInteger(lod0Triangles, 1, { min: 1 });
  return Object.freeze(policy.ratios.map((ratio, level) => Object.freeze({
    level,
    ratio,
    triangleBudget: policy.triangleBudgets[level],
    targetTriangles: level === 0
      ? Math.min(base, policy.triangleBudgets[0])
      : Math.min(Math.max(Math.round(base * ratio), 1), policy.triangleBudgets[level]),
  })));
}
