import { createCloudTextureCache } from './textureCache.js';
// Weather map — the 2D field that decides *where* cloud exists, before any of
// the 3D noise decides what shape it takes. CPU FBM, deterministic from a
// seed, tiling in both axes, regenerated whenever the sky-cloud lab changes the
// profile or the quality tier changes `weatherMapResolution`.
//
//   R  coverage — the only channel the density field reads
//   G  cloud type: 0 stratus, 0.5 stratocumulus, 1 cumulus
//   B  precipitation, gated by coverage so rain cannot exist without cloud
//   A  reserved (255)
//
// R and G are consumed by the density field. B is generated now so adding
// precipitation-driven lighting later does not force a weather-map format
// change.
//
// WeatherMapProfile is the preset-tunable surface: a flat, serializable object
// of FBM knobs with documented defaults and ranges, which is what the lab binds
// its controls to. Seed is *not* part of it — the lab owns the seed separately,
// so re-rolling a sky and re-tuning one are different actions.

import * as THREE from 'three';

import { hashSeed } from '../../core/generation.js';
import { encodeUnorm8, resolveAuthoredNumber } from './noiseVolume.js';

export const WEATHER_MAP_SCHEMA_VERSION = 1;

/**
 * The legal weather-map resolutions — the quality tiers' set and the only values
 * `resolveWeatherMapResolution` returns. `src/sky/skyQualityTiers.js` imports
 * this rather than declaring a range of its own, so the tier field, the resolver
 * and the spec's tier table cannot drift apart.
 */
export const WEATHER_MAP_RESOLUTIONS = Object.freeze([256, 512, 1024]);

/** Resolution used when none is given, or when the request is unusable. */
// Matches DEFAULT_SKY_PARAMS.noise.weather.resolution, which mirrors the default
// `high` tier. The generator and the schema have to agree: when they did not,
// "the default weather map" was two different textures depending on whether you
// arrived through a preset or through a direct bake call.
export const WEATHER_MAP_DEFAULT_RESOLUTION = 1024;

/**
 * The preset-tunable knobs, with the metadata the lab renders controls from.
 * Ranges are the useful range, not the safe range — every value is clamped to
 * them, so a preset authored outside them loads as the nearest legal sky.
 */
export const WEATHER_MAP_PROFILE_FIELDS = Object.freeze({
  octaves: Object.freeze({
    description: 'Number of coverage FBM octaves. More octaves add smaller cloud clusters inside the large ones.',
    group: 'coverage',
    label: 'Octaves',
    range: Object.freeze({ max: 8, min: 1, step: 1 }),
    type: 'number',
    value: 5,
  }),
  period: Object.freeze({
    description: 'Lattice periods across one weather-map repeat at the first octave. Higher values make cloud groups smaller.',
    group: 'coverage',
    label: 'Base Period',
    range: Object.freeze({ max: 32, min: 1, step: 1 }),
    type: 'number',
    value: 4,
  }),
  lacunarity: Object.freeze({
    description: 'Frequency step between octaves. Rounded to an integer period per octave so the map still tiles exactly.',
    group: 'coverage',
    label: 'Lacunarity',
    range: Object.freeze({ max: 4, min: 1.5, step: 0.01 }),
    type: 'number',
    value: 2,
  }),
  gain: Object.freeze({
    description: 'Amplitude step between octaves. Higher values roughen the coverage boundary; lower values smooth it.',
    group: 'coverage',
    label: 'Gain',
    range: Object.freeze({ max: 0.8, min: 0.2, step: 0.01 }),
    type: 'number',
    value: 0.5,
  }),
  warp: Object.freeze({
    description: 'Domain-warp amount in tile units. Bends cloud groups into streets and hooks instead of round blobs. 0 disables it.',
    group: 'coverage',
    label: 'Warp',
    range: Object.freeze({ max: 1, min: 0, step: 0.005 }),
    type: 'number',
    value: 0,
  }),
  warpPeriod: Object.freeze({
    description: 'Lattice periods of the warp field. Low values sweep whole regions; high values ripple edges.',
    group: 'coverage',
    label: 'Warp Period',
    range: Object.freeze({ max: 16, min: 1, step: 1 }),
    type: 'number',
    value: 2,
  }),
  coverageContrast: Object.freeze({
    description: 'Contrast of the coverage field about 0.5. High values separate sky and cloud into hard regions.',
    group: 'coverage',
    label: 'Coverage Contrast',
    range: Object.freeze({ max: 4, min: 0.1, step: 0.01 }),
    type: 'number',
    value: 1.32,
  }),
  coverageBias: Object.freeze({
    description: 'Added to coverage after contrast. Positive fills the sky, negative clears it. Distinct from shape.coverage, which scales the whole field at runtime.',
    group: 'coverage',
    label: 'Coverage Bias',
    range: Object.freeze({ max: 1, min: -1, step: 0.005 }),
    type: 'number',
    // Authored coverage 0.26 is a -0.24 shift from the neutral 0.5 baseline.
    value: -0.24,
  }),
  typePeriod: Object.freeze({
    description: 'Lattice periods of the cloud-type field. Low values give one weather system across the sky.',
    group: 'type',
    label: 'Type Period',
    range: Object.freeze({ max: 16, min: 1, step: 1 }),
    type: 'number',
    value: 3,
  }),
  typeBias: Object.freeze({
    description: 'Added to cloud type. Positive pushes the sky toward developed cumulus, negative toward flat stratus.',
    group: 'type',
    label: 'Type Bias',
    range: Object.freeze({ max: 1, min: -1, step: 0.005 }),
    type: 'number',
    value: 0,
  }),
  precipitationPeriod: Object.freeze({
    description: 'Lattice periods of the precipitation field, before coverage gates it.',
    group: 'precipitation',
    label: 'Precipitation Period',
    range: Object.freeze({ max: 16, min: 1, step: 1 }),
    type: 'number',
    value: 1,
  }),
  precipitationBias: Object.freeze({
    description: 'Added to precipitation before coverage gates it. Positive rains from more of the deck.',
    group: 'precipitation',
    label: 'Precipitation Bias',
    range: Object.freeze({ max: 1, min: -1, step: 0.005 }),
    type: 'number',
    value: 0,
  }),
});

/** Default WeatherMapProfile. */
export const WEATHER_MAP_PROFILE_DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(WEATHER_MAP_PROFILE_FIELDS).map(([key, field]) => [key, field.value]),
  ),
);

const mapCache = createCloudTextureCache('weather');

/**
 * Normalizes any partial input into a complete WeatherMapProfile: every field
 * present, every value finite and inside its range, integers rounded. The
 * result is plain JSON — presets serialize it verbatim.
 */
export function createWeatherMapProfile(input = {}) {
  const profile = {};
  for (const [key, field] of Object.entries(WEATHER_MAP_PROFILE_FIELDS)) {
    const value = resolveAuthoredNumber(input?.[key], field.value);
    const clamped = Math.min(Math.max(value, field.range.min), field.range.max);
    profile[key] = field.range.step === 1 ? Math.round(clamped) : clamped;
  }
  return profile;
}

/**
 * Snaps a requested resolution onto the nearest WEATHER_MAP_RESOLUTIONS member.
 *
 * A snap, not a clamp into a wider range: 64, 128 and 2048 are not cheaper or
 * finer versions of the same coverage field. The four-texels-per-cell band limit
 * means a 64² map keeps only 3 of the default ladder's 5 coverage octaves
 * (periods 4, 8, 16 instead of 4…64), so admitting one would bake a *different*
 * sky at 1/16 the texel count of the lowest tier — silently, from a preset that
 * merely serialized a null.
 */
export function resolveWeatherMapResolution(resolution = WEATHER_MAP_DEFAULT_RESOLUTION) {
  const requested = resolveAuthoredNumber(resolution, WEATHER_MAP_DEFAULT_RESOLUTION);
  // 0 and negatives are absent values too, not "as small as possible".
  if (!(requested > 0)) return WEATHER_MAP_DEFAULT_RESOLUTION;
  let nearest = WEATHER_MAP_RESOLUTIONS[0];
  for (const candidate of WEATHER_MAP_RESOLUTIONS) {
    if (Math.abs(candidate - requested) < Math.abs(nearest - requested)) nearest = candidate;
  }
  return nearest;
}

/**
 * Periodic 2D Perlin FBM over the unit tile. Each octave's period is rounded
 * to an integer and the octave is sampled through that rounded period, so a
 * non-integer lacunarity still tiles exactly — the alternative, scaling a
 * float frequency, is what silently breaks tiling. Octaves are seeded by their
 * own period so a given frequency is the same field at every resolution.
 */
function weatherHash33(x, y, z) {
  let px = (Math.imul(x >>> 0, 1664525) + 1013904223) >>> 0;
  let py = (Math.imul(y >>> 0, 1664525) + 1013904223) >>> 0;
  let pz = (Math.imul(z >>> 0, 1664525) + 1013904223) >>> 0;
  px = (px + Math.imul(py, pz)) >>> 0;
  py = (py + Math.imul(pz, px)) >>> 0;
  pz = (pz + Math.imul(px, py)) >>> 0;
  px = (px ^ (px >>> 16)) >>> 0;
  py = (py ^ (py >>> 16)) >>> 0;
  pz = (pz ^ (pz >>> 16)) >>> 0;
  px = (px + Math.imul(py, pz)) >>> 0;
  py = (py + Math.imul(pz, px)) >>> 0;
  pz = (pz + Math.imul(px, py)) >>> 0;
  const inverse = 1 / 4294967295;
  return [px * inverse, py * inverse, pz * inverse];
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function gradient3(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function cornerHash(x, y, z) {
  return (weatherHash33(x, y, z)[0] * 256) >>> 0;
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

/** Builds one tileable 3D Perlin-FBM slice. */
function perlinFbmSlice(size, z, baseFrequency, octaves) {
  const sum = new Float64Array(size * size);
  let weight = 0.5;
  let weightSum = 0;
  let frequency = Math.max(1, Math.round(baseFrequency));
  const fraction = new Float64Array(size);
  const faded = new Float64Array(size);
  const cell = new Int32Array(size);
  const cellNext = new Int32Array(size);

  for (let octave = 0; octave < octaves; octave += 1) {
    const period = Math.round(frequency);
    const scaledZ = z * frequency;
    const cellZ = Math.floor(scaledZ);
    const fz = scaledZ - cellZ;
    const fzMinusOne = fz - 1;
    const zi = positiveModulo(cellZ, period);
    const ziNext = positiveModulo(zi + 1, period);
    const w = fade(fz);

    for (let index = 0; index < size; index += 1) {
      const scaled = (index / size) * frequency;
      const cellIndex = Math.floor(scaled);
      fraction[index] = scaled - cellIndex;
      faded[index] = fade(fraction[index]);
      cell[index] = positiveModulo(cellIndex, period);
      cellNext[index] = positiveModulo(cell[index] + 1, period);
    }

    const hashNear = new Uint16Array(period * period);
    const hashFar = new Uint16Array(period * period);
    for (let y = 0; y < period; y += 1) {
      for (let x = 0; x < period; x += 1) {
        hashNear[y * period + x] = cornerHash(x, y, zi);
        hashFar[y * period + x] = cornerHash(x, y, ziNext);
      }
    }

    let outputIndex = 0;
    for (let y = 0; y < size; y += 1) {
      const fy = fraction[y];
      const fyMinusOne = fy - 1;
      const v = faded[y];
      const row = cell[y] * period;
      const nextRow = cellNext[y] * period;
      for (let x = 0; x < size; x += 1) {
        const fx = fraction[x];
        const fxMinusOne = fx - 1;
        const u = faded[x];
        const xi = cell[x];
        const xiNext = cellNext[x];
        const nearA = lerp(
          gradient3(hashNear[row + xi], fx, fy, fz),
          gradient3(hashNear[row + xiNext], fxMinusOne, fy, fz),
          u,
        );
        const nearB = lerp(
          gradient3(hashNear[nextRow + xi], fx, fyMinusOne, fz),
          gradient3(hashNear[nextRow + xiNext], fxMinusOne, fyMinusOne, fz),
          u,
        );
        const farA = lerp(
          gradient3(hashFar[row + xi], fx, fy, fzMinusOne),
          gradient3(hashFar[row + xiNext], fxMinusOne, fy, fzMinusOne),
          u,
        );
        const farB = lerp(
          gradient3(hashFar[nextRow + xi], fx, fyMinusOne, fzMinusOne),
          gradient3(hashFar[nextRow + xiNext], fxMinusOne, fyMinusOne, fzMinusOne),
          u,
        );
        sum[outputIndex] += lerp(
          lerp(nearA, nearB, v),
          lerp(farA, farB, v),
          w,
        ) * weight;
        outputIndex += 1;
      }
    }

    weightSum += weight;
    weight *= 0.5;
    frequency *= 2;
  }

  for (let index = 0; index < sum.length; index += 1) {
    sum[index] = (sum[index] / weightSum) * 0.5 + 0.5;
  }
  return sum;
}

function seedSlice(seed) {
  return seed * 13.37 + 0.5;
}

/**
 * Bakes the RGBA8 weather map. Returned separately from the texture so the
 * determinism checks and headless tools can read the bytes without a renderer.
 */
export function createWeatherMapData({
  resolution = WEATHER_MAP_DEFAULT_RESOLUTION,
  seed = 1,
  profile = {},
} = {}) {
  const size = resolveWeatherMapResolution(resolution);
  const resolved = createWeatherMapProfile(profile);
  const rootSeed = hashSeed(seed);
  const coverageField = perlinFbmSlice(
    size,
    seedSlice(0),
    resolved.period,
    resolved.octaves,
  );
  const detailField = perlinFbmSlice(size, seedSlice(1), 6, 6);
  const precipitationField = perlinFbmSlice(
    size,
    seedSlice(3),
    resolved.precipitationPeriod,
    1,
  );

  const data = new Uint8Array(size * size * 4);
  let cursor = 0;
  let coverageSum = 0;
  for (let pixel = 0; pixel < size * size; pixel += 1) {
      const mass = Math.min(Math.max(
        (coverageField[pixel] - 0.5) * resolved.coverageContrast + 0.5,
        0,
      ), 1);
      const detail = (detailField[pixel] * 2 - 1) * 0.13;
      const coverage = Math.min(Math.max(
        mass + detail + resolved.coverageBias,
        0,
      ), 1);
      const precipitation = Math.min(Math.max(
        precipitationField[pixel] + resolved.precipitationBias,
        0,
      ), 1);
      data[cursor] = encodeUnorm8(coverage);
      data[cursor + 1] = 0;
      data[cursor + 2] = encodeUnorm8(precipitation);
      data[cursor + 3] = 255;
      cursor += 4;
      coverageSum += coverage;
  }

  return {
    coverageMean: coverageSum / (size * size),
    coverageOctavePeriods: Array.from(
      { length: resolved.octaves },
      (unused, octave) => Math.round(resolved.period * 2 ** octave),
    ),
    data,
    profile: resolved,
    resolution: size,
    seed: rootSeed,
    version: WEATHER_MAP_SCHEMA_VERSION,
  };
}

/**
 * Bakes an uncached weather map. Callers own dispose().
 *
 * `generateMipmaps` defaults off. A raymarch loop has no coherent screen-space
 * derivative, so an implicit mip selection inside the march reads a random
 * level and the coverage field dissolves. Turn it on only together with an
 * explicit level on the sampling side.
 */
export function createWeatherMap({
  resolution = WEATHER_MAP_DEFAULT_RESOLUTION,
  seed = 1,
  profile = {},
  generateMipmaps = false,
} = {}) {
  const baked = createWeatherMapData({ profile, resolution, seed });
  const texture = new THREE.DataTexture(
    baked.data,
    baked.resolution,
    baked.resolution,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `ToonLabCloudWeatherMap${baked.resolution}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = generateMipmaps
    ? THREE.LinearMipmapLinearFilter
    : THREE.LinearFilter;
  texture.generateMipmaps = generateMipmaps;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  texture.userData.toonlabCloudNoise = {
    coverageMean: baked.coverageMean,
    kind: 'weather-map',
    profile: baked.profile,
    resolution: baked.resolution,
    seed: baked.seed,
    version: WEATHER_MAP_SCHEMA_VERSION,
  };
  return texture;
}

/**
 * Cached weather map, keyed by resolution, seed and profile. A tier switch that
 * returns to a resolution already baked pays nothing; a profile edit does not
 * collide with the old map.
 */
export function getWeatherMap({
  resolution = WEATHER_MAP_DEFAULT_RESOLUTION,
  seed = 1,
  profile = {},
  generateMipmaps = false,
} = {}) {
  const size = resolveWeatherMapResolution(resolution);
  const resolved = createWeatherMapProfile(profile);
  const key = `${size}:${hashSeed(seed)}:${hashSeed(JSON.stringify(resolved))}:${generateMipmaps ? 1 : 0}`;
  const cached = mapCache.get(key);
  if (cached) return cached;
  const texture = createWeatherMap({ generateMipmaps, profile: resolved, resolution: size, seed });
  mapCache.set(key, texture);
  return texture;
}

/** Releases every cached weather map. */
export function disposeWeatherMaps() {
  for (const texture of mapCache.values()) texture.dispose();
  mapCache.clear();
}
