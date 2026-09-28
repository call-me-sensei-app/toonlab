import { createCloudTextureCache } from './textureCache.js';
// Curl noise — the divergence-free vector field that advects cloud edges into
// wisps. Displacing a sample position by an arbitrary noise vector pumps
// density in and out of the cloud (the field has sources and sinks), so edges
// bulge and pop. The curl of a vector potential is divergence-free by
// construction, so advecting along it shears and folds the cloud without
// creating or destroying any of it — the reason curl noise, not plain noise, is
// what makes a wisp look torn from the body rather than pasted onto it.
//
// Potential: three decorrelated periodic Perlin FBM fields. Curl: collocated
// central differences of those. Because the same difference stencil is used for
// every partial, the mixed second derivatives cancel exactly and the discrete
// divergence is zero to floating-point rounding — not just to O(h²).
//
// Encoding: the volume packs curl * 0.5 + 0.5 into RGB and the vector's length
// into A, so a shader can modulate wisp strength by field energy from the same
// fetch. Decode through decodeCurlNoise(), or take the ready-made advection
// offset from curlNoiseOffsetNode(), rather than unpacking by hand; the scale
// the CPU normalized by is this module's business, not the raymarcher's.
//
// Both channels share one normalization scale, so A is exactly the length of the
// vector RGB decodes to. That scale comes from the probed peak *length*, not the
// peak component: a length reaches up to sqrt(3) times its largest component, so
// normalizing by the component peak overflowed A and clipped it.

import {
  Fn,
  texture3D,
  vec3,
} from 'three/tsl';

import { hashSeed } from '../../core/generation.js';
import { hashCombine } from '../../rockgen/noise/prng.js';
import {
  createNoiseVolumeTexture,
  encodeSnorm8,
  encodeUnorm8,
  noiseVolumeKey,
  resolveNoiseDims,
  warnNoiseVolumeOnce,
} from './noiseVolume.js';
import { createPeriodicPerlinFbm3 } from './periodicNoise3.js';

/** Default resolution. Curl is a low-frequency advection field; 32³ is ample. */
export const CURL_NOISE_DEFAULT_DIMS = 32;

/**
 * Potential-field plan. `epsilon` is the central-difference step in tile units:
 * small enough to read as a derivative, large enough that the difference of two
 * nearly equal FBM samples keeps its significant digits.
 */
export const CURL_NOISE_PLAN = Object.freeze({
  epsilon: 1 / 256,
  gain: 0.6,
  lacunarity: 2,
  octaves: 3,
  period: 3,
});

// The normalization scale is measured on a fixed probe grid rather than on the
// output grid, so the same seed yields the same field at every resolution — a
// 16³ curl volume must not be a differently scaled field from the 64³ one.
const NORMALIZATION_PROBE_DIMS = 32;
// Headroom over the probed peak, and the reason the probe can be fixed at all: a
// finer output grid samples points the probe never visits, so it finds higher
// values. Measured against the 32³ probe's peak length, the true peak runs 8.5%
// higher on a 64³ output grid and 8.8% higher on a 128³ one, and a 400k-point
// off-lattice sweep tops out at 6.8% — so the growth flattens off well inside
// 15%, resolveNoiseDims' 256³ ceiling included.
const NORMALIZATION_HEADROOM = 1.15;

const volumeCache = createCloudTextureCache('curl');

/**
 * Builds the divergence-free field.
 *
 * `sample(x, y, z)` takes tile coordinates and writes the normalized curl into
 * `out`, returning it — components land in about [-1, 1]. `curl()` returns the
 * same vector unnormalized, which is what the divergence check needs.
 */
export function createCurlNoiseField({ seed = 1, plan = {} } = {}) {
  const rootSeed = hashSeed(seed);
  const settings = { ...CURL_NOISE_PLAN, ...plan };
  const epsilon = Math.max(1e-5, Number(settings.epsilon) || CURL_NOISE_PLAN.epsilon);
  const fbmOptions = {
    // The potential is evaluated analytically at arbitrary offsets, not on the
    // output grid, so it carries no band limit of its own. The curl's own
    // frequency content is set by `period` and stays well inside 32³.
    dim: Infinity,
    gain: settings.gain,
    lacunarity: settings.lacunarity,
    octaves: settings.octaves,
    period: settings.period,
  };
  // Three potential components, seeded apart so the curl does not degenerate
  // toward a single axis.
  const psi = [
    createPeriodicPerlinFbm3(hashCombine(rootSeed, 0x9e37), fbmOptions),
    createPeriodicPerlinFbm3(hashCombine(rootSeed, 0x85eb), fbmOptions),
    createPeriodicPerlinFbm3(hashCombine(rootSeed, 0xc2b2), fbmOptions),
  ];
  const inverseStep = 1 / (2 * epsilon);

  function curl(x, y, z, out) {
    const dy3 = (psi[2].sample(x, y + epsilon, z) - psi[2].sample(x, y - epsilon, z)) * inverseStep;
    const dz2 = (psi[1].sample(x, y, z + epsilon) - psi[1].sample(x, y, z - epsilon)) * inverseStep;
    const dz1 = (psi[0].sample(x, y, z + epsilon) - psi[0].sample(x, y, z - epsilon)) * inverseStep;
    const dx3 = (psi[2].sample(x + epsilon, y, z) - psi[2].sample(x - epsilon, y, z)) * inverseStep;
    const dx2 = (psi[1].sample(x + epsilon, y, z) - psi[1].sample(x - epsilon, y, z)) * inverseStep;
    const dy1 = (psi[0].sample(x, y + epsilon, z) - psi[0].sample(x, y - epsilon, z)) * inverseStep;
    out.x = dy3 - dz2;
    out.y = dz1 - dx3;
    out.z = dx2 - dy1;
    return out;
  }

  // Probe for the peak so the 8-bit encoding uses its range without clipping the
  // tails. Both peaks are measured; only the length one sets the scale.
  const probe = { x: 0, y: 0, z: 0 };
  let componentPeak = 0;
  let lengthPeak = 0;
  const inverseProbe = 1 / NORMALIZATION_PROBE_DIMS;
  for (let z = 0; z < NORMALIZATION_PROBE_DIMS; z += 1) {
    for (let y = 0; y < NORMALIZATION_PROBE_DIMS; y += 1) {
      for (let x = 0; x < NORMALIZATION_PROBE_DIMS; x += 1) {
        curl((x + 0.5) * inverseProbe, (y + 0.5) * inverseProbe, (z + 0.5) * inverseProbe, probe);
        componentPeak = Math.max(
          componentPeak, Math.abs(probe.x), Math.abs(probe.y), Math.abs(probe.z),
        );
        lengthPeak = Math.max(
          lengthPeak,
          Math.sqrt(probe.x * probe.x + probe.y * probe.y + probe.z * probe.z),
        );
      }
    }
  }
  // Normalize by the *length* peak, because the length is what the A channel
  // encodes and a length runs up to sqrt(3) times its largest component. Scaling
  // by the component peak fit RGB and overflowed A, and a clipped |curl| is no
  // longer the length of the RGB it ships with. One shared scale keeps
  // `a === length(decode(rgb))` exact; it costs the components about a tenth of
  // their range, which is cheaper than an inconsistent encoding.
  const scale = 1 / (lengthPeak * NORMALIZATION_HEADROOM || 1);

  return {
    componentPeak,
    curl,
    epsilon,
    lengthPeak,
    sample(x, y, z, out = { x: 0, y: 0, z: 0 }) {
      curl(x, y, z, out);
      out.x *= scale;
      out.y *= scale;
      out.z *= scale;
      return out;
    },
    scale,
    seed: rootSeed,
  };
}

/**
 * Bakes the RGBA8 curl volume. Returned separately from the texture so the
 * divergence and tiling checks can read the numbers without a renderer.
 */
export function createCurlNoiseData({
  dims = CURL_NOISE_DEFAULT_DIMS,
  seed = 1,
  plan = {},
} = {}) {
  const size = resolveNoiseDims(dims, CURL_NOISE_DEFAULT_DIMS);
  const field = createCurlNoiseField({ plan, seed });
  const data = new Uint8Array(size.x * size.y * size.z * 4);
  const vector = { x: 0, y: 0, z: 0 };
  const invX = 1 / size.x;
  const invY = 1 / size.y;
  const invZ = 1 / size.z;
  let cursor = 0;
  // Watchdog on the fixed probe grid's assumption: the output grid is free to
  // land on a higher field value than the probe found, and if the headroom ever
  // fails to cover that the encoders clamp silently. Report it instead.
  let peakLength = 0;
  let clippedTexels = 0;
  for (let z = 0; z < size.z; z += 1) {
    const w = (z + 0.5) * invZ;
    for (let y = 0; y < size.y; y += 1) {
      const v = (y + 0.5) * invY;
      for (let x = 0; x < size.x; x += 1) {
        const u = (x + 0.5) * invX;
        field.sample(u, v, w, vector);
        const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
        if (length > peakLength) peakLength = length;
        if (length > 1) clippedTexels += 1;
        data[cursor] = encodeSnorm8(vector.x);
        data[cursor + 1] = encodeSnorm8(vector.y);
        data[cursor + 2] = encodeSnorm8(vector.z);
        data[cursor + 3] = encodeUnorm8(length);
        cursor += 4;
      }
    }
  }
  if (clippedTexels > 0) {
    warnNoiseVolumeOnce(
      `curl-clip:${size.x}x${size.y}x${size.z}`,
      `[curlNoise] |curl| peaked at ${peakLength.toFixed(3)} on the `
      + `${size.x}x${size.y}x${size.z} output grid, above the 1.0 the A channel can hold, so `
      + `${clippedTexels} texel(s) clipped. The ${NORMALIZATION_PROBE_DIMS}³ probe grid `
      + 'under-estimated the field peak at this resolution.',
    );
  }

  return {
    clippedTexels,
    data,
    dims: size,
    field,
    peakLength,
    seed: field.seed,
  };
}

/** Bakes an uncached curl volume. Callers own dispose(). */
export function createCurlNoiseVolume({
  dims = CURL_NOISE_DEFAULT_DIMS,
  seed = 1,
  plan = {},
} = {}) {
  const baked = createCurlNoiseData({ dims, plan, seed });
  const texture = createNoiseVolumeTexture(
    baked.data,
    baked.dims,
    `ToonLabCloudCurl${baked.dims.x}x${baked.dims.y}x${baked.dims.z}`,
  );
  texture.userData.toonlabCloudNoise = {
    componentPeak: baked.field.componentPeak,
    dims: baked.dims,
    encoding: 'rgb = curl * 0.5 + 0.5, a = |curl|',
    kind: 'curl',
    lengthPeak: baked.field.lengthPeak,
    peakLength: baked.peakLength,
    scale: baked.field.scale,
    seed: baked.seed,
  };
  return texture;
}

/** Cached curl volume, keyed by resolution and seed. */
export function getCurlNoiseVolume({
  dims = CURL_NOISE_DEFAULT_DIMS,
  seed = 1,
  plan = {},
} = {}) {
  const size = resolveNoiseDims(dims, CURL_NOISE_DEFAULT_DIMS);
  // The plan joins the key: a custom potential is a different field, and
  // returning the default one for it would be a silent wrong answer.
  const key = `${noiseVolumeKey(size, hashSeed(seed))}:${hashSeed(JSON.stringify({ ...CURL_NOISE_PLAN, ...plan }))}`;
  const cached = volumeCache.get(key);
  if (cached) return cached;
  const texture = createCurlNoiseVolume({ dims: size, plan, seed });
  volumeCache.set(key, texture);
  return texture;
}

/** Releases every cached curl volume. */
export function disposeCurlNoiseVolumes() {
  for (const texture of volumeCache.values()) texture.dispose();
  volumeCache.clear();
}

/** Decodes a packed curl texel back to a signed vector in about [-1, 1]. */
export const decodeCurlNoise = /*@__PURE__*/ Fn(([packed]) => (
  packed.rgb.mul(2).sub(vec3(1))
));

/**
 * Samples a baked curl volume as an advection offset, in metres.
 *
 * `scale` is the world size of one tile — pass the same repeat the erosion
 * detail uses so wisps shear at the scale they are carved at. `strength` is the
 * offset magnitude in metres at full field energy. RepeatWrapping does the
 * tiling, so the world position needs no fract() first.
 */
export function curlNoiseOffsetNode(volume, {
  position,
  scale,
  strength,
}) {
  const packed = texture3D(volume).sample(position.div(scale));
  return decodeCurlNoise(packed).mul(strength);
}
