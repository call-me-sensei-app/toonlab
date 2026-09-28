// Bounded hero-cloud authoring recipes.
//
// A doodle is intentionally only the broad top-down footprint. It does not
// become geometry and it does not replace the physical cloud model. The normal
// weather-map column field, 3D base shape, erosion, density integration and
// lighting still produce the rendered cloud. This keeps a quick artist mark
// from turning into a flat billboard or a literal extruded brush stroke.

import * as THREE from 'three';

import { hashSeed } from '../core/generation.js';

export const HERO_CLOUD_RECIPE_TYPE = 'toonlab/hero-cloud-recipe';
export const HERO_CLOUD_RECIPE_VERSION = 1;
export const HERO_CLOUD_MAP_PADDING = 8;
export const HERO_CLOUD_DEFAULT_RESOLUTION = 512;
export const HERO_CLOUD_PREVIEW_ALTITUDE = 1400;

const LIMITS = Object.freeze({
  breakup: Object.freeze([0, 1]),
  development: Object.freeze([0, 1]),
  diameter: Object.freeze([500, 30000]),
  height: Object.freeze([100, 12000]),
  radius: Object.freeze([0.005, 0.5]),
  softness: Object.freeze([0.01, 0.95]),
  strength: Object.freeze([0, 1]),
});

const DEFAULT_STROKES = Object.freeze([
  Object.freeze({ mode: 'add', radius: 0.19, strength: 0.94, points: Object.freeze([[0.31, 0.54]]) }),
  Object.freeze({ mode: 'add', radius: 0.24, strength: 1, points: Object.freeze([[0.48, 0.48]]) }),
  Object.freeze({ mode: 'add', radius: 0.19, strength: 0.92, points: Object.freeze([[0.67, 0.53]]) }),
  Object.freeze({ mode: 'add', radius: 0.14, strength: 0.82, points: Object.freeze([[0.42, 0.31]]) }),
  Object.freeze({ mode: 'add', radius: 0.12, strength: 0.78, points: Object.freeze([[0.61, 0.34]]) }),
]);

export const DEFAULT_HERO_CLOUD_RECIPE = Object.freeze({
  type: HERO_CLOUD_RECIPE_TYPE,
  version: HERO_CLOUD_RECIPE_VERSION,
  id: 'hero_cloud',
  label: 'Hero Cloud',
  seed: 11,
  bounds: Object.freeze({
    diameter: 6000,
    height: 3200,
  }),
  footprint: Object.freeze({
    breakup: 0.18,
    development: 0.82,
    softness: 0.34,
    strokes: DEFAULT_STROKES,
  }),
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function ranged(value, fallback, range) {
  return clamp(finite(value, fallback), range[0], range[1]);
}

function cleanId(value, fallback = 'hero_cloud') {
  const id = String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return id || fallback;
}

function normalizePoint(point) {
  const source = Array.isArray(point) ? point : [];
  return [
    clamp(finite(source[0], 0.5), 0, 1),
    clamp(finite(source[1], 0.5), 0, 1),
  ];
}

function normalizeStroke(stroke) {
  const source = stroke && typeof stroke === 'object' ? stroke : {};
  const points = Array.isArray(source.points)
    ? source.points.slice(0, 2048).map(normalizePoint)
    : [];
  if (points.length === 0) return null;
  return {
    mode: source.mode === 'erase' ? 'erase' : 'add',
    radius: ranged(source.radius, 0.1, LIMITS.radius),
    strength: ranged(source.strength, 1, LIMITS.strength),
    points,
  };
}

/** Normalizes a portable, placement-free hero-cloud recipe. */
export function createHeroCloudRecipe(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const bounds = source.bounds && typeof source.bounds === 'object' ? source.bounds : {};
  const footprint = source.footprint && typeof source.footprint === 'object'
    ? source.footprint
    : {};
  const strokes = (Array.isArray(footprint.strokes)
    ? footprint.strokes
    : DEFAULT_HERO_CLOUD_RECIPE.footprint.strokes)
    .slice(0, 256)
    .map(normalizeStroke)
    .filter(Boolean);

  return {
    type: HERO_CLOUD_RECIPE_TYPE,
    version: HERO_CLOUD_RECIPE_VERSION,
    id: cleanId(source.id, DEFAULT_HERO_CLOUD_RECIPE.id),
    label: String(source.label ?? DEFAULT_HERO_CLOUD_RECIPE.label).trim().slice(0, 80)
      || DEFAULT_HERO_CLOUD_RECIPE.label,
    seed: hashSeed(source.seed ?? DEFAULT_HERO_CLOUD_RECIPE.seed),
    bounds: {
      diameter: ranged(
        bounds.diameter,
        DEFAULT_HERO_CLOUD_RECIPE.bounds.diameter,
        LIMITS.diameter,
      ),
      height: ranged(
        bounds.height,
        DEFAULT_HERO_CLOUD_RECIPE.bounds.height,
        LIMITS.height,
      ),
    },
    footprint: {
      breakup: ranged(
        footprint.breakup,
        DEFAULT_HERO_CLOUD_RECIPE.footprint.breakup,
        LIMITS.breakup,
      ),
      development: ranged(
        footprint.development,
        DEFAULT_HERO_CLOUD_RECIPE.footprint.development,
        LIMITS.development,
      ),
      softness: ranged(
        footprint.softness,
        DEFAULT_HERO_CLOUD_RECIPE.footprint.softness,
        LIMITS.softness,
      ),
      strokes,
    },
  };
}

/** Parses a portable hero-cloud recipe without accepting a future schema. */
export function parseHeroCloudRecipe(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Hero-cloud recipe must be an object.'], ok: false, warnings };
  }
  if (input.type !== undefined && input.type !== HERO_CLOUD_RECIPE_TYPE) {
    errors.push(`Expected type ${HERO_CLOUD_RECIPE_TYPE}.`);
  }
  const version = finite(input.version, HERO_CLOUD_RECIPE_VERSION);
  if (version > HERO_CLOUD_RECIPE_VERSION) {
    errors.push(
      `Hero-cloud recipe version ${version} is newer than supported version ${HERO_CLOUD_RECIPE_VERSION}.`,
    );
  } else if (version < HERO_CLOUD_RECIPE_VERSION) {
    warnings.push(
      `Hero-cloud recipe version ${version} was normalized to version ${HERO_CLOUD_RECIPE_VERSION}.`,
    );
  }
  if (errors.length) return { errors, ok: false, warnings };
  return {
    errors,
    ok: true,
    value: createHeroCloudRecipe(input),
    warnings,
  };
}

export function serializeHeroCloudRecipe(input) {
  return JSON.stringify(createHeroCloudRecipe(input), null, 2);
}

function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function hashNoise(x, y, seed) {
  let value = seed >>> 0;
  value ^= Math.imul((x + 1) >>> 0, 0x9e3779b1);
  value ^= Math.imul((y + 1) >>> 0, 0x85ebca77);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function coherentNoise(x, y, cellSize, seed) {
  const gridX = Math.floor(x / cellSize);
  const gridY = Math.floor(y / cellSize);
  const localX = smoothstep(0, 1, (x / cellSize) - gridX);
  const localY = smoothstep(0, 1, (y / cellSize) - gridY);
  const top = hashNoise(gridX, gridY, seed) * (1 - localX)
    + hashNoise(gridX + 1, gridY, seed) * localX;
  const bottom = hashNoise(gridX, gridY + 1, seed) * (1 - localX)
    + hashNoise(gridX + 1, gridY + 1, seed) * localX;
  return top * (1 - localY) + bottom * localY;
}

function stamp(field, size, x, y, radius, strength, softness, mode) {
  const pixelRadius = Math.max(1, radius * size);
  const minX = Math.max(0, Math.floor(x * size - pixelRadius - 1));
  const maxX = Math.min(size - 1, Math.ceil(x * size + pixelRadius + 1));
  const minY = Math.max(0, Math.floor(y * size - pixelRadius - 1));
  const maxY = Math.min(size - 1, Math.ceil(y * size + pixelRadius + 1));
  // A broad flat brush core becomes a flat vertical wall once the mask is used
  // as column height. Keep only a small centre plateau, then let the physical
  // volume turn the continuous falloff into rounded cloud towers.
  const core = clamp(0.38 - softness * 0.32, 0.05, 0.35);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = (px + 0.5) / size - x;
      const dy = (py + 0.5) / size - y;
      const distance = Math.hypot(dx, dy) / Math.max(radius, 1e-6);
      const weight = (1 - smoothstep(core, 1, distance)) * strength;
      if (!(weight > 0)) continue;
      const index = py * size + px;
      field[index] = mode === 'erase'
        ? field[index] * (1 - weight)
        : Math.max(field[index], weight);
    }
  }
}

/** Rasterizes the top-down doodle to normalized cloud-column development. */
export function rasterizeHeroCloudFootprint(input, { resolution = 128 } = {}) {
  const recipe = createHeroCloudRecipe(input);
  const size = Math.round(clamp(finite(resolution, 128), 32, 1024));
  const field = new Float32Array(size * size);
  const softness = recipe.footprint.softness;

  for (const stroke of recipe.footprint.strokes) {
    const points = stroke.points;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const previous = points[Math.max(0, index - 1)];
      const distance = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      const steps = Math.max(1, Math.ceil(distance / Math.max(stroke.radius * 0.28, 0.002)));
      for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
        const amount = stepIndex / steps;
        stamp(
          field,
          size,
          previous[0] + (point[0] - previous[0]) * amount,
          previous[1] + (point[1] - previous[1]) * amount,
          stroke.radius,
          stroke.strength,
          softness,
          stroke.mode,
        );
      }
    }
  }

  const data = new Uint8Array(size * size);
  const breakup = recipe.footprint.breakup;
  const development = recipe.footprint.development;
  for (let index = 0; index < field.length; index += 1) {
    const x = index % size;
    const y = Math.floor(index / size);
    const broad = coherentNoise(x, y, Math.max(4, size / 7), recipe.seed);
    const medium = coherentNoise(x, y, Math.max(3, size / 15), recipe.seed ^ 0x68bc21eb);
    const developedHeight = 0.66 + (broad * 0.24 + medium * 0.1) * development;
    const breakupVariation = 1 - breakup * 0.08
      + hashNoise(x >> 2, y >> 2, recipe.seed) * breakup * 0.08;
    const organic = developedHeight * breakupVariation;
    const shaped = Math.pow(
      clamp(field[index] * organic, 0, 1),
      1.35 - development * 0.7,
    );
    data[index] = Math.round(shaped * 255);
  }
  return { data, height: size, recipe, width: size };
}

function bilinear(data, width, height, u, v) {
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const x = u * width - 0.5;
  const y = v * height - 0.5;
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = clamp(x - Math.floor(x), 0, 1);
  const ty = clamp(y - Math.floor(y), 0, 1);
  const a = data[y0 * width + x0] * (1 - tx) + data[y0 * width + x1] * tx;
  const b = data[y1 * width + x0] * (1 - tx) + data[y1 * width + x1] * tx;
  return (a * (1 - ty) + b * ty) / 255;
}

/** Builds the weather-map texture the physical volume marcher consumes. */
export function createHeroCloudWeatherTexture(input, {
  resolution = HERO_CLOUD_DEFAULT_RESOLUTION,
} = {}) {
  const recipe = createHeroCloudRecipe(input);
  const size = Math.round(clamp(finite(resolution, HERO_CLOUD_DEFAULT_RESOLUTION), 128, 1024));
  const footprintSize = Math.max(64, Math.round(size / HERO_CLOUD_MAP_PADDING));
  const footprint = rasterizeHeroCloudFootprint(recipe, { resolution: footprintSize });
  const data = new Uint8Array(size * size * 4);
  let coverageTotal = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const localU = (((x + 0.5) / size) - 0.5) * HERO_CLOUD_MAP_PADDING + 0.5;
      const localV = (((y + 0.5) / size) - 0.5) * HERO_CLOUD_MAP_PADDING + 0.5;
      const coverage = bilinear(
        footprint.data,
        footprint.width,
        footprint.height,
        localU,
        localV,
      );
      const index = (y * size + x) * 4;
      data[index] = Math.round(coverage * 255);
      data[index + 1] = Math.round((0.72 + recipe.footprint.development * 0.28) * 255);
      data[index + 2] = 0;
      data[index + 3] = 255;
      coverageTotal += coverage;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `ToonLabHeroCloud_${recipe.id}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  texture.userData.toonlabCloudNoise = {
    bounds: { ...recipe.bounds },
    coverageMean: coverageTotal / (size * size),
    kind: 'hero-cloud-weather-map',
    recipeId: recipe.id,
    seed: recipe.seed,
    version: HERO_CLOUD_RECIPE_VERSION,
  };
  return texture;
}

/**
 * Returns the SkyParams overrides used only to preview the recipe.
 * No world transform is serialized; the host remains responsible for placement.
 */
export function heroCloudSkyOverrides(input) {
  const recipe = createHeroCloudRecipe(input);
  const development = recipe.footprint.development;
  return {
    cloud: {
      cirrus: { strength: 0 },
      haze: { density: 0 },
      shape: {
        altitude: HERO_CLOUD_PREVIEW_ALTITUDE,
        thickness: recipe.bounds.height,
        coverage: 0.3 + development * 0.1,
        baseScale: recipe.bounds.diameter * (0.48 + development * 0.18),
        baseStrength: 1.05 + development * 0.22,
        weatherScale: recipe.bounds.diameter * HERO_CLOUD_MAP_PADDING,
        erosionScaleBaseMultiplier: 0.2,
        erosionShape: 0.22 + recipe.footprint.breakup * 0.45,
        erosionStrengthBase: 0.65,
        erosionStrengthPeak: 1 + recipe.footprint.breakup * 0.6,
        edgeSoftness: 0.065,
        edgeSoftnessFalloff: 1.25,
        baseWeatherStrength: 0.18,
        baseWeatherHeightStart: 0.02,
        baseWeatherHeightEnd: 0.14,
        horizonCoverageAmount: 0,
      },
    },
    noise: {
      weather: { seed: recipe.seed },
    },
  };
}

/** World-space preview centre for the padded, periodically sampled mask. */
export function getHeroCloudPreviewCenter(input) {
  const recipe = createHeroCloudRecipe(input);
  const weatherScale = recipe.bounds.diameter * HERO_CLOUD_MAP_PADDING;
  return {
    x: weatherScale * 0.5,
    y: HERO_CLOUD_PREVIEW_ALTITUDE + recipe.bounds.height * 0.46,
    z: weatherScale * 0.5,
  };
}
