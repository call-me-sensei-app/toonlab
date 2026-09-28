// Repository-only C7 bake policy. This is intentionally not part of ToonLab's
// public rockgen export until the checkpoint and family proofs are approved.

import { canonicalizeJson } from '../canonical.node.js';

export const ROCK_BAKE_COMPILER_SCHEMA = 'toonlab/rock-geology-bake-compiler';
export const ROCK_BAKE_COMPILER_VERSION = '2.0.0-c7.2';

const TIERS = Object.freeze({
  draft: Object.freeze({
    denseResolution: 36,
    renderResolution: 28,
    fallbackResolutions: Object.freeze([22, 16, 12]),
    collisionResolution: 10,
    targetPixelsPerMetre: 96,
    maximumAtlasResolution: 1024,
    minimumAtlasResolution: 256,
    maximumGeometricErrorFraction: 0.025,
    maximumSilhouetteErrorPixels: 4,
  }),
  production: Object.freeze({
    denseResolution: 64,
    renderResolution: 52,
    fallbackResolutions: Object.freeze([42, 34, 26]),
    collisionResolution: 20,
    targetPixelsPerMetre: 200,
    maximumAtlasResolution: 2048,
    minimumAtlasResolution: 512,
    maximumGeometricErrorFraction: 0.01,
    maximumSilhouetteErrorPixels: 3,
  }),
  hero: Object.freeze({
    denseResolution: 88,
    renderResolution: 72,
    fallbackResolutions: Object.freeze([56, 42, 30]),
    collisionResolution: 24,
    targetPixelsPerMetre: 360,
    maximumAtlasResolution: 4096,
    minimumAtlasResolution: 1024,
    maximumGeometricErrorFraction: 0.006,
    maximumSilhouetteErrorPixels: 2,
  }),
});

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 1)));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Select a scale-aware texture strategy before baking. The area estimate is
 * deliberately conservative (ellipsoid-like surface area) and the compiler
 * replaces it with measured surface area in its final asset record.
 */
export function selectRockBakePolicy(recipe, options = {}) {
  const tier = TIERS[recipe.qualityTier] ?? TIERS.production;
  const dimensions = recipe.targetDimensionsMetres;
  const [x, y, z] = dimensions;
  const p = 1.6075;
  const estimatedSurfaceAreaSquareMetres = 4 * Math.PI * (
    ((x * y / 4) ** p + (x * z / 4) ** p + (y * z / 4) ** p) / 3
  ) ** (1 / p);
  const minimumViewDistanceMetres = options.minimumViewDistanceMetres
    ?? Math.max(Math.min(...dimensions) * 0.55, 0.35);
  const distanceFactor = clamp(1 / Math.sqrt(minimumViewDistanceMetres), 0.65, 1.45);
  const desiredPixelsPerMetre = Math.round(tier.targetPixelsPerMetre * distanceFactor);
  // Connected geological charts are intentionally conservative and average
  // roughly 18–30% occupied texels after gutters. Size for that measured class
  // of utilization instead of assuming a rectangular 78% packing fill.
  const singleAtlasPixels = Math.sqrt(estimatedSurfaceAreaSquareMetres) * desiredPixelsPerMetre / 0.42;
  const requestedResolution = nextPowerOfTwo(singleAtlasPixels);
  const largestDimension = Math.max(...dimensions);
  const useVirtualTexture = largestDimension >= 12 || requestedResolution > tier.maximumAtlasResolution;
  const selectedResolution = options.atlasResolution ?? clamp(
    requestedResolution,
    tier.minimumAtlasResolution,
    tier.maximumAtlasResolution,
  );
  const tileCount = useVirtualTexture
    ? Math.ceil((requestedResolution / tier.maximumAtlasResolution) ** 2)
    : 1;
  return canonicalizeJson({
    atlas: {
      colorPageEncoding: 'base-color=sRGB; all data maps=linear',
      gutterTexels: options.gutterTexels ?? Math.max(32, Math.ceil(selectedResolution / 64)),
      requestedResolution,
      selectedResolution,
      strategy: useVirtualTexture ? 'udim-or-virtual-texture' : 'single-atlas',
      tileCount,
    },
    estimatedSurfaceAreaSquareMetres,
    geometry: {
      collisionResolution: options.collisionResolution ?? tier.collisionResolution,
      denseResolution: options.denseResolution ?? tier.denseResolution,
      fallbackResolutions: options.fallbackResolutions ?? tier.fallbackResolutions,
      renderResolution: options.renderResolution ?? tier.renderResolution,
    },
    minimumViewDistanceMetres,
    qualityTier: recipe.qualityTier,
    targetDimensionsMetres: dimensions,
    texelDensity: {
      desiredPixelsPerMetre,
      measurement: 'sqrt(covered atlas texels / measured mesh surface area m2)',
    },
    tolerances: {
      maximumGeometricErrorFraction: tier.maximumGeometricErrorFraction,
      maximumSilhouetteErrorPixels: tier.maximumSilhouetteErrorPixels,
    },
  });
}

export function finalizeRockBakePolicy(policy, measuredSurfaceAreaSquareMetres, coveredTexels) {
  return canonicalizeJson({
    ...policy,
    measuredSurfaceAreaSquareMetres,
    texelDensity: {
      ...policy.texelDensity,
      achievedPixelsPerMetre: Math.sqrt(coveredTexels / Math.max(measuredSurfaceAreaSquareMetres, 1e-12)),
      coveredTexels,
      passesMinimum: Math.sqrt(coveredTexels / Math.max(measuredSurfaceAreaSquareMetres, 1e-12))
        >= policy.texelDensity.desiredPixelsPerMetre,
    },
  });
}
