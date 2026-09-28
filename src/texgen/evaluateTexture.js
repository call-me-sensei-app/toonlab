// Turns a texture settings document into a full set of seamlessly tiling
// PBR maps: albedo, height, normal, roughness, metalness, AO, packed ORM,
// and optional emissive. Pure CPU + typed arrays — headless-safe (no DOM,
// no Math.random), deterministic per seed, chunked so the UI thread
// breathes during big bakes.
//
// Image-base mode: pass decoded RGBA pixels via options.imagePixels and the
// image replaces the BASE layer (albedo + height from band-split luminance,
// seamless-ized by a torus blend) while detail layers, overlays, wear,
// color grading, glow, and all PBR derivation keep working on top. Decoding
// stays the caller's job so this module remains DOM-free.

import { hash3u, hashCombine } from '../rockgen/noise/prng.js';
import { periodicFbm2 } from './noise2.js';
import { compileTextureLayer } from './textureGenerators.js';
import { createTextureSettings } from './textureSettings.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// --- color helpers (exact sRGB transfer, linear-space ramp blending) ------

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function toLinear(rgb) {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/** Hue rotation around the gray axis in linear RGB (angle in turns). */
function hueRotate(r, g, b, turns) {
  const angle = turns * Math.PI * 2;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const m00 = 0.213 + cosA * 0.787 - sinA * 0.213;
  const m01 = 0.715 - cosA * 0.715 - sinA * 0.715;
  const m02 = 0.072 - cosA * 0.072 + sinA * 0.928;
  const m10 = 0.213 - cosA * 0.213 + sinA * 0.143;
  const m11 = 0.715 + cosA * 0.285 + sinA * 0.14;
  const m12 = 0.072 - cosA * 0.072 - sinA * 0.283;
  const m20 = 0.213 - cosA * 0.213 - sinA * 0.787;
  const m21 = 0.715 - cosA * 0.715 + sinA * 0.715;
  const m22 = 0.072 + cosA * 0.928 + sinA * 0.072;
  return [
    m00 * r + m01 * g + m02 * b,
    m10 * r + m11 * g + m12 * b,
    m20 * r + m21 * g + m22 * b,
  ];
}

/** Compiles the five-stop ramp into `t -> [r, g, b]` (linear output). */
function compileRamp(color) {
  const stops = [
    { pos: 0, rgb: toLinear(color.color0) },
    { pos: color.pos1, rgb: toLinear(color.color1) },
    { pos: color.pos2, rgb: toLinear(color.color2) },
    { pos: color.pos3, rgb: toLinear(color.color3) },
    { pos: 1, rgb: toLinear(color.color4) },
  ].sort((a, b) => a.pos - b.pos);
  const smoothness = Math.max(0.0001, color.rampSmooth);
  return (t, out) => {
    let hi = 1;
    while (hi < stops.length - 1 && stops[hi].pos < t) hi += 1;
    const a = stops[hi - 1];
    const b = stops[hi];
    const span = Math.max(1e-6, b.pos - a.pos);
    let f = clamp01((t - a.pos) / span);
    // rampSmooth 1 = linear blend, 0 = hard cel band at the segment middle.
    f = clamp01((f - 0.5) / smoothness + 0.5);
    out[0] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f;
    out[1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f;
    out[2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f;
  };
}

// --- layer blending --------------------------------------------------------

function overlayOp(a, b) {
  return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
}

/**
 * Independent [0, 1) draw from a pattern cell id. The legacy per-cell tint read
 * two overlapping 16-bit slices of the same hash for hue and value, which tied a
 * cell's hue to its brightness; a fresh salted hash per channel breaks that.
 */
function cellUnit(id, salt) {
  return hash3u(salt, id | 0, (id >>> 16) | 0, 0) / 4294967296;
}

function blendHeight(mode, h, d) {
  switch (mode) {
    case 'add': return clamp01(h + (d - 0.5));
    case 'multiply': return h * d;
    case 'screen': return 1 - (1 - h) * (1 - d);
    case 'min': return Math.min(h, d);
    case 'max': return Math.max(h, d);
    case 'mix': return d;
    case 'overlay':
    default: return overlayOp(h, d);
  }
}

// --- accent + emissive masks -----------------------------------------------

function compileAccent(spec, seed, salt) {
  if (!spec.enabled) return null;
  const sample = compileTextureLayer(spec, seed, salt);
  const threshold = 1 - clamp01(spec.coverage);
  const softness = Math.max(0.01, spec.softness);
  const bias = Math.min(1, Math.max(-1, spec.creviceBias));
  const colorA = toLinear(spec.color);
  const colorB = toLinear(spec.colorB);
  return {
    blend: spec.blend,
    colorA,
    colorB,
    heightShift: spec.heightShift,
    metalShift: spec.metalShift,
    roughnessShift: spec.roughnessShift,
    mask(u, v, h) {
      const out = sample(u, v);
      let m = smoothstep(threshold - softness, threshold + softness, out.v);
      if (bias > 0) m *= 1 - bias + bias * smoothstep(0.85, 0.15, h);
      else if (bias < 0) m *= 1 + bias - bias * smoothstep(0.15, 0.85, h);
      return { m: clamp01(m), t: out.v };
    },
  };
}

function emissiveMask(source, h, mA, mB, threshold, width, softness) {
  switch (source) {
    case 'crevices': return 1 - smoothstep(threshold, threshold + Math.max(0.02, width), h);
    case 'peaks': return smoothstep(threshold - Math.max(0.02, width), threshold, h);
    case 'band': {
      const half = width * 0.5;
      return smoothstep(threshold - half - softness, threshold - half, h)
        * (1 - smoothstep(threshold + half, threshold + half + softness, h));
    }
    case 'accentA': return mA;
    case 'accentB': return mB;
    case 'everywhere':
    default: return 1;
  }
}

// --- post passes ------------------------------------------------------------

/** Separable box blur with toroidal wrap on a Float32 field. */
function wrapBoxBlur(src, size, radius, tmp, dst) {
  const r = Math.max(1, Math.round(radius));
  const norm = 1 / (r * 2 + 1);
  // horizontal
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    let acc = 0;
    for (let k = -r; k <= r; k += 1) acc += src[row + ((k + size) % size)];
    for (let x = 0; x < size; x += 1) {
      tmp[row + x] = acc * norm;
      const add = src[row + ((x + r + 1) % size)];
      const sub = src[row + ((x - r + size) % size)];
      acc += add - sub;
    }
  }
  // vertical
  for (let x = 0; x < size; x += 1) {
    let acc = 0;
    for (let k = -r; k <= r; k += 1) acc += tmp[((k + size) % size) * size + x];
    for (let y = 0; y < size; y += 1) {
      dst[y * size + x] = acc * norm;
      const add = tmp[((y + r + 1) % size) * size + x];
      const sub = tmp[((y - r + size) % size) * size + x];
      acc += add - sub;
    }
  }
}

// --- image base ---------------------------------------------------------------

export const DEFAULT_TEXTURE_IMAGE_PARAMS = Object.freeze({
  bands: 0,
  heightBase: 0.35,
  heightDetail: 0.65,
  seamless: true,
});

/** Triangle weight peaking at the tile center — the torus-blend kernel. */
function triWeight(t) {
  const w = 1 - Math.abs(2 * (t - Math.floor(t)) - 1);
  return 0.0001 + w * w;
}

/** Bilinear sample (wrapping) of source RGBA bytes -> linear RGB into out. */
function sampleBilinear(pixels, sx, sy, out) {
  const { data, width, height } = pixels;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const xa = ((x0 % width) + width) % width;
  const xb = (xa + 1) % width;
  const ya = ((y0 % height) + height) % height;
  const yb = (ya + 1) % height;
  for (let c = 0; c < 3; c += 1) {
    const p00 = data[(ya * width + xa) * 4 + c] / 255;
    const p10 = data[(ya * width + xb) * 4 + c] / 255;
    const p01 = data[(yb * width + xa) * 4 + c] / 255;
    const p11 = data[(yb * width + xb) * 4 + c] / 255;
    out[c] = srgbToLinear(p00 + (p10 - p00) * fx + ((p01 + (p11 - p01) * fx) - (p00 + (p10 - p00) * fx)) * fy);
  }
}

/**
 * Resamples decoded image pixels into the working tile: seamless-ized
 * linear albedo plus a band-split luminance height field (local detail
 * emphasized, baked-in photo lighting flattened).
 */
function prepareImageField(imagePixels, size, params) {
  const { seamless, heightDetail, heightBase } = { ...DEFAULT_TEXTURE_IMAGE_PARAMS, ...params };
  const albedo = new Float32Array(size * size * 3);
  const luma = new Float32Array(size * size);
  const sample = [0, 0, 0];
  const accum = [0, 0, 0];
  const taps = seamless
    ? [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]
    : [[0, 0]];
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      accum[0] = 0;
      accum[1] = 0;
      accum[2] = 0;
      let weightSum = 0;
      for (const [ou, ov] of taps) {
        // Weight each shifted copy by distance to ITS tile center so every
        // edge is covered by a copy whose seam lies elsewhere.
        const wu = u + ou;
        const wv = v + ov;
        const weight = taps.length === 1 ? 1 : triWeight(wu) * triWeight(wv);
        sampleBilinear(imagePixels, (wu - Math.floor(wu)) * imagePixels.width - 0.5, (wv - Math.floor(wv)) * imagePixels.height - 0.5, sample);
        accum[0] += sample[0] * weight;
        accum[1] += sample[1] * weight;
        accum[2] += sample[2] * weight;
        weightSum += weight;
      }
      const i = y * size + x;
      albedo[i * 3] = accum[0] / weightSum;
      albedo[i * 3 + 1] = accum[1] / weightSum;
      albedo[i * 3 + 2] = accum[2] / weightSum;
      luma[i] = 0.2126 * albedo[i * 3] + 0.7152 * albedo[i * 3 + 1] + 0.0722 * albedo[i * 3 + 2];
    }
  }

  // Contrast-stretch the luminance, then split into a low-frequency base
  // (photo lighting, damped) and high-frequency detail (surface relief).
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < luma.length; i += 1) {
    if (luma[i] < lo) lo = luma[i];
    if (luma[i] > hi) hi = luma[i];
  }
  const span = Math.max(1e-4, hi - lo);
  for (let i = 0; i < luma.length; i += 1) luma[i] = (luma[i] - lo) / span;
  const tmp = new Float32Array(size * size);
  const blurred = new Float32Array(size * size);
  wrapBoxBlur(luma, size, Math.max(2, size / 12), tmp, blurred);
  const height = new Float32Array(size * size);
  for (let i = 0; i < luma.length; i += 1) {
    height[i] = clamp01(0.5 + (luma[i] - blurred[i]) * heightDetail * 2.4 + (blurred[i] - 0.5) * heightBase);
  }
  return { albedo, height };
}

// --- result buffers ----------------------------------------------------------

export const TEXTURE_MAP_IDS = Object.freeze(['albedo', 'height', 'normal', 'roughness', 'metalness', 'ao', 'orm', 'emissive']);

function allocResult(size, target) {
  if (target && target.size === size && target.albedo?.length === size * size * 4) return target;
  const bytes = () => new Uint8Array(size * size * 4);
  return {
    albedo: bytes(),
    ao: bytes(),
    emissive: bytes(),
    height: new Float32Array(size * size),
    heightBytes: bytes(),
    metalness: bytes(),
    normal: bytes(),
    orm: bytes(),
    roughness: bytes(),
    size,
  };
}

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Bakes every map for `settings` at `size`x`size`. Async and cancellable:
 * returns null when `shouldCancel()` goes true mid-bake. Pass the previous
 * result as `target` to reuse its buffers (same size only).
 *
 * Returns { size, albedo, heightBytes, normal, roughness, metalness, ao,
 * orm, emissive, height (Float32), emissiveEnabled, ms }.
 */
export async function evaluateTextureMaps(rawSettings, {
  size = 256,
  target = null,
  onProgress = null,
  shouldCancel = null,
  imagePixels = null,
  imageParams = null,
} = {}) {
  const started = (typeof performance !== 'undefined' ? performance.now() : 0);
  const settings = createTextureSettings(rawSettings);
  const seed = settings.global.seed >>> 0;
  const result = allocResult(size, target);

  // Image base: the settings' image layer carries per-document params; a
  // bare imagePixels + imageParams works for library callers without one.
  const imageField = imagePixels
    ? prepareImageField(imagePixels, size, settings.image ?? imageParams ?? {})
    : null;
  const imageBands = imageField ? Math.round((settings.image ?? imageParams ?? {}).bands ?? 0) : 0;

  const base = compileTextureLayer(settings.base, seed, 0x0b45e);
  const details = [settings.detailA, settings.detailB]
    .map((layer, index) => (layer.enabled && layer.amount > 0
      ? { amount: layer.amount, blend: layer.blend, sample: compileTextureLayer(layer, seed, 0xde7a11 + index * 977) }
      : null))
    .filter(Boolean);
  const accentA = compileAccent(settings.accentA, seed, 0xacce17);
  const accentB = compileAccent(settings.accentB, seed, 0xacce55);
  const ramp = compileRamp(settings.color);

  // Wear macros: one knob compiles to fixed seeded sub-layers so "damage"
  // and "dirt" never rewrite the user's other sliders (debris-lab pattern).
  const damage = settings.wear.damage;
  const dirt = settings.wear.dirt;
  const scratches = damage > 0 ? compileTextureLayer({
    cellJitter: 1, detail: 3, detailGain: 0.5, edgeWidth: 0.045, generator: 'cracks',
    scale: 9, stretchX: 2.6, stretchY: 1, warp: 0.3, warpScale: 4,
  }, seed, 0x5c9a7c) : null;
  const chips = damage > 0 ? compileTextureLayer({
    cellVariation: 0.45, edgeWidth: 0.16, generator: 'speckle', scale: 26,
  }, seed, 0xc41b22) : null;
  const grime = dirt > 0 ? compileTextureLayer({
    detail: 4, detailGain: 0.55, generator: 'turbulence', scale: 5, warp: 0.3, warpScale: 3,
  }, seed, 0xd127a1) : null;
  const DIRT_TINT = [0.4, 0.34, 0.27];

  const color = settings.color;
  const surface = settings.surface;
  const emissive = settings.emissive;
  const jitterSeed = hashCombine(seed, 0x11a77);
  const hueSeed = hashCombine(seed, 0x22b33);
  // Per-cell tint variety (0 = legacy). Above 0 the cell's hue and value come
  // from independent salted hashes and the painterly drift keeps running inside
  // the cell, so N modules stop reading as N flat swatches (D19-057).
  const cellVariety = Math.min(1, Math.max(0, color.jitterCellVariety ?? 0));
  const cellValueSalt = hashCombine(seed, 0x33c1e);
  const cellHueSalt = hashCombine(seed, 0x44d2f);
  const jitterScale = Math.max(2, Math.round(color.jitterScale));
  const cavityTint = toLinear(color.cavityTint);
  const sheenTint = toLinear(color.sheenTint);
  const emissiveColor = toLinear(emissive.color);
  const invertHeight = Boolean(surface.invertHeight);

  const heightF = result.height;
  const rgb = [0, 0, 0];
  const chunkRows = Math.max(4, Math.round(2048 / Math.max(64, size) * 16));

  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const i = y * size + x;
      const o = i * 4;

      // -- height stack (image base replaces the base pattern when present)
      const baseOut = imageField ? null : base(u, v);
      const baseCell = baseOut ? baseOut.cell : null;
      let h = imageField ? imageField.height[i] : baseOut.v;
      for (const layer of details) {
        const d = layer.sample(u, v).v;
        h += (blendHeight(layer.blend, h, d) - h) * layer.amount;
      }
      h = clamp01(h);

      // -- accent masks (need the pre-shift height for crevice bias)
      let mA = 0;
      let tA = 0;
      let mB = 0;
      let tB = 0;
      if (accentA) {
        const a = accentA.mask(u, v, h);
        mA = a.m;
        tA = a.t;
      }
      if (accentB) {
        const b = accentB.mask(u, v, h);
        mB = b.m;
        tB = b.t;
      }
      if (accentA) h += accentA.heightShift * mA;
      if (accentB) h += accentB.heightShift * mB;
      h = clamp01(h);
      if (invertHeight) h = 1 - h;

      // -- damage: carve scratch lines and chips into the final surface
      let scuff = 0;
      if (scratches) {
        const lines = 1 - scratches(u, v).v; // 1 inside a scratch
        const pit = chips(u, v).v;
        scuff = Math.min(1, lines + pit * 0.8);
        h = clamp01(h - damage * (lines * 0.4 + pit * 0.25));
      }
      heightF[i] = h;

      // -- albedo: image base or height ramp, plus painterly jitter
      let r;
      let g;
      let b;
      if (imageField) {
        const i3 = i * 3;
        r = imageField.albedo[i3];
        g = imageField.albedo[i3 + 1];
        b = imageField.albedo[i3 + 2];
        if (color.jitterValue > 0) {
          const jn = periodicFbm2(jitterSeed, u * jitterScale, v * jitterScale, jitterScale, jitterScale, 2, 0.5) * 0.5 + 0.5;
          const lift = 1 + (jn - 0.5) * color.jitterValue * 1.4;
          r *= lift;
          g *= lift;
          b *= lift;
        }
        if (imageBands > 1) {
          // Cel banding for image bases: quantize luminance, keep chroma.
          const luma = Math.max(1e-4, 0.2126 * r + 0.7152 * g + 0.0722 * b);
          const banded = (Math.floor(Math.min(0.999, luma) * imageBands) + 0.5) / imageBands;
          const scale = 1 + ((banded / luma) - 1) * 0.85;
          r *= scale;
          g *= scale;
          b *= scale;
        }
      } else {
        let t = h;
        if (color.jitterValue > 0) {
          let jn;
          if (color.jitterCells && baseCell !== null) {
            jn = cellVariety > 0
              ? cellUnit(baseCell, cellValueSalt)
              : ((baseCell >>> 8) & 0xffff) / 65536;
            if (cellVariety > 0) {
              const drift = periodicFbm2(jitterSeed, u * jitterScale, v * jitterScale, jitterScale, jitterScale, 2, 0.5) * 0.5 + 0.5;
              jn = clamp01(jn + (drift - 0.5) * cellVariety * 0.6);
            }
          } else {
            jn = periodicFbm2(jitterSeed, u * jitterScale, v * jitterScale, jitterScale, jitterScale, 2, 0.5) * 0.5 + 0.5;
          }
          t = clamp01(t + (jn - 0.5) * color.jitterValue);
        }
        ramp(t, rgb);
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      }

      if (color.jitterHue > 0) {
        let hn;
        if (color.jitterCells && baseCell !== null) {
          hn = cellVariety > 0
            ? cellUnit(baseCell, cellHueSalt)
            : (baseCell & 0xffff) / 65536;
          if (cellVariety > 0) {
            const drift = periodicFbm2(hueSeed, u * jitterScale, v * jitterScale, jitterScale, jitterScale, 2, 0.5) * 0.5 + 0.5;
            hn = clamp01(hn + (drift - 0.5) * cellVariety * 0.6);
          }
        } else {
          hn = periodicFbm2(hueSeed, u * jitterScale, v * jitterScale, jitterScale, jitterScale, 2, 0.5) * 0.5 + 0.5;
        }
        [r, g, b] = hueRotate(r, g, b, (hn - 0.5) * color.jitterHue);
      }

      // -- cavity darkening & ridge sheen (the hand-painted read)
      if (color.cavity > 0) {
        const c = Math.min(1, color.cavity * Math.pow(1 - h, 1.6) * 1.5);
        r += (r * cavityTint[0] - r) * c;
        g += (g * cavityTint[1] - g) * c;
        b += (b * cavityTint[2] - b) * c;
      }
      if (color.sheen > 0) {
        const s = color.sheen * smoothstep(0.62, 0.96, h);
        r = 1 - (1 - r) * (1 - sheenTint[0] * s);
        g = 1 - (1 - g) * (1 - sheenTint[1] * s);
        b = 1 - (1 - b) * (1 - sheenTint[2] * s);
      }

      // -- colored overlays
      for (const [accent, m, tt] of [[accentA, mA, tA], [accentB, mB, tB]]) {
        if (!accent || m <= 0) continue;
        const ar = accent.colorA[0] + (accent.colorB[0] - accent.colorA[0]) * tt;
        const ag = accent.colorA[1] + (accent.colorB[1] - accent.colorA[1]) * tt;
        const ab = accent.colorA[2] + (accent.colorB[2] - accent.colorA[2]) * tt;
        let nr = ar;
        let ng = ag;
        let nb = ab;
        if (accent.blend === 'multiply') {
          nr = r * ar; ng = g * ag; nb = b * ab;
        } else if (accent.blend === 'screen') {
          nr = 1 - (1 - r) * (1 - ar); ng = 1 - (1 - g) * (1 - ag); nb = 1 - (1 - b) * (1 - ab);
        } else if (accent.blend === 'overlay') {
          nr = overlayOp(r, ar); ng = overlayOp(g, ag); nb = overlayOp(b, ab);
        }
        r += (nr - r) * m;
        g += (ng - g) * m;
        b += (nb - b) * m;
      }

      // -- wear grading: dirt pools into crevices, scuffs lighten faintly
      let dirtM = 0;
      if (grime) {
        const pooled = 0.35 + 0.65 * smoothstep(0.85, 0.15, h);
        dirtM = Math.min(1, dirt * grime(u, v).v * pooled * 1.5);
        r += (r * DIRT_TINT[0] - r) * dirtM;
        g += (g * DIRT_TINT[1] - g) * dirtM;
        b += (b * DIRT_TINT[2] - b) * dirtM;
      }
      if (scuff > 0) {
        const lift = damage * scuff * 0.1;
        r = 1 - (1 - r) * (1 - lift);
        g = 1 - (1 - g) * (1 - lift);
        b = 1 - (1 - b) * (1 - lift);
      }

      // -- global grade
      if (color.hueShift !== 0) [r, g, b] = hueRotate(r, g, b, color.hueShift);
      if (color.saturation !== 1) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * color.saturation;
        g = luma + (g - luma) * color.saturation;
        b = luma + (b - luma) * color.saturation;
      }

      let sr = linearToSrgb(Math.max(0, r)) * color.brightness;
      let sg = linearToSrgb(Math.max(0, g)) * color.brightness;
      let sb = linearToSrgb(Math.max(0, b)) * color.brightness;
      if (color.contrast !== 0) {
        const k = color.contrast >= 0 ? 1 + color.contrast * 1.6 : 1 + color.contrast * 0.85;
        sr = (sr - 0.5) * k + 0.5;
        sg = (sg - 0.5) * k + 0.5;
        sb = (sb - 0.5) * k + 0.5;
      }
      if (color.gamma !== 1) {
        const inv = 1 / color.gamma;
        sr = Math.pow(clamp01(sr), inv);
        sg = Math.pow(clamp01(sg), inv);
        sb = Math.pow(clamp01(sb), inv);
      }
      result.albedo[o] = clamp01(sr) * 255;
      result.albedo[o + 1] = clamp01(sg) * 255;
      result.albedo[o + 2] = clamp01(sb) * 255;
      result.albedo[o + 3] = 255;

      // -- roughness / metalness
      let rough = surface.roughness + surface.roughnessContrast * (0.5 - h) * 0.9;
      let metal = surface.metalness;
      if (accentA) { rough += accentA.roughnessShift * mA; metal += accentA.metalShift * mA; }
      if (accentB) { rough += accentB.roughnessShift * mB; metal += accentB.metalShift * mB; }
      rough += damage * scuff * 0.35 + dirtM * 0.3;
      const roughByte = clamp01(Math.max(0.02, rough)) * 255;
      const metalByte = clamp01(metal) * 255;
      result.roughness[o] = roughByte;
      result.roughness[o + 1] = roughByte;
      result.roughness[o + 2] = roughByte;
      result.roughness[o + 3] = 255;
      result.metalness[o] = metalByte;
      result.metalness[o + 1] = metalByte;
      result.metalness[o + 2] = metalByte;
      result.metalness[o + 3] = 255;

      // -- height bytes (linear grayscale)
      const hByte = h * 255;
      result.heightBytes[o] = hByte;
      result.heightBytes[o + 1] = hByte;
      result.heightBytes[o + 2] = hByte;
      result.heightBytes[o + 3] = 255;

      // -- emissive
      if (emissive.enabled) {
        const e = clamp01(emissiveMask(emissive.source, h, mA, mB, emissive.threshold, emissive.width, emissive.softness));
        result.emissive[o] = linearToSrgb(emissiveColor[0] * e) * 255;
        result.emissive[o + 1] = linearToSrgb(emissiveColor[1] * e) * 255;
        result.emissive[o + 2] = linearToSrgb(emissiveColor[2] * e) * 255;
        result.emissive[o + 3] = 255;
      } else if (result.emissive[o + 3] !== 255 || result.emissive[o] !== 0) {
        result.emissive[o] = 0;
        result.emissive[o + 1] = 0;
        result.emissive[o + 2] = 0;
        result.emissive[o + 3] = 255;
      }
    }

    if (y % chunkRows === chunkRows - 1) {
      if (shouldCancel?.()) return null;
      onProgress?.((y + 1) / (size + 2));
      await yieldToUi();
    }
  }

  if (shouldCancel?.()) return null;

  // -- normal map from height (toroidal sobel-style central differences)
  const slope = surface.heightScale * 0.08 * surface.normalStrength * size * 0.5;
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const gx = (heightF[row + right] - heightF[row + left]) * slope;
      const gy = (heightF[down + x] - heightF[up + x]) * slope;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const o = (row + x) * 4;
      result.normal[o] = (-gx * inv * 0.5 + 0.5) * 255;
      result.normal[o + 1] = (gy * inv * 0.5 + 0.5) * 255; // +Y up (OpenGL convention)
      result.normal[o + 2] = (inv * 0.5 + 0.5) * 255;
      result.normal[o + 3] = 255;
    }
  }

  if (shouldCancel?.()) return null;
  onProgress?.((size + 1) / (size + 2));
  await yieldToUi();

  // -- ambient occlusion: crevices relative to two blur radii
  const tmp = new Float32Array(size * size);
  const blurNear = new Float32Array(size * size);
  const blurFar = new Float32Array(size * size);
  wrapBoxBlur(heightF, size, Math.max(1, size / 48), tmp, blurNear);
  wrapBoxBlur(heightF, size, Math.max(2, size / 14), tmp, blurFar);
  const aoDepth = surface.aoStrength * (0.4 + surface.heightScale);
  for (let i = 0; i < size * size; i += 1) {
    const occ = Math.max(0, blurNear[i] - heightF[i]) * 1.35 + Math.max(0, blurFar[i] - heightF[i]) * 0.85;
    const ao = clamp01(1 - occ * 2.6 * aoDepth);
    const o = i * 4;
    const aoByte = ao * 255;
    result.ao[o] = aoByte;
    result.ao[o + 1] = aoByte;
    result.ao[o + 2] = aoByte;
    result.ao[o + 3] = 255;
    // glTF ORM packing: R = occlusion, G = roughness, B = metalness.
    result.orm[o] = aoByte;
    result.orm[o + 1] = result.roughness[o];
    result.orm[o + 2] = result.metalness[o];
    result.orm[o + 3] = 255;
  }

  onProgress?.(1);
  return {
    ...result,
    emissiveEnabled: Boolean(emissive.enabled),
    emissiveIntensity: emissive.intensity,
    ms: (typeof performance !== 'undefined' ? performance.now() : 0) - started,
  };
}

/**
 * Any bitmap -> a complete tiling toon PBR material. `imagePixels` is
 * decoded RGBA ({ data, width, height }); decode stays the caller's job so
 * this works headless. `params` are DEFAULT_TEXTURE_IMAGE_PARAMS overrides
 * (seamless, heightDetail, heightBase, bands) and `settings` any partial
 * texture settings for the grade/surface/overlay stages on top.
 */
export async function imageToTextureMaps(imagePixels, {
  params = {},
  settings = {},
  size = 512,
  target = null,
  onProgress = null,
  shouldCancel = null,
} = {}) {
  return evaluateTextureMaps(settings, {
    imageParams: params,
    imagePixels,
    onProgress,
    shouldCancel,
    size,
    target,
  });
}
