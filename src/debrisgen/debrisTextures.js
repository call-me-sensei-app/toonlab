// Procedural detail textures for debris materials. Each debris type gets
// a tileable 256x256 DataTexture (no canvas/DOM — works headless and in
// workers) built from the same hash-based value noise rockgen uses, so
// results are deterministic per seed. Textures are near-white detail maps
// that MULTIPLY the baked vertex colors: the palette still comes from the
// generator's color slots; the map adds material read (wood grain, bone
// porosity, mineral speckle, brushed metal, leaf veins, ash powder) that
// survives the environment toon conversion (the adapter resolves
// `material.map` into its stylized albedo).

import * as THREE from 'three';

import { hashCombine } from '../rockgen/noise/prng.js';
import { fbm3, valueNoise3 } from '../rockgen/noise/valueNoise3.js';

const SIZE = 256;
const CACHE_LIMIT = 24;
const cache = new Map();

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

/**
 * Fills a texture from `shade(u, v) -> [r, g, b]` with u/v in [0, 1).
 * Sampling wraps because every noise call below uses u/v scaled by whole
 * numbers, keeping the tile seamless.
 */
function bakeTexture(shade) {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = shade(x / SIZE, y / SIZE);
      const offset = (y * SIZE + x) * 4;
      data[offset] = Math.round(clamp01(r) * 255);
      data[offset + 1] = Math.round(clamp01(g) * 255);
      data[offset + 2] = Math.round(clamp01(b) * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// Tileable fbm: sample on a torus via two phase-shifted reads (cheap and
// good enough for detail maps — exact periodic noise is overkill here).
function tileNoise(seed, u, v, scaleU, scaleV, octaves = 3) {
  const a = fbm3(seed, u * scaleU, v * scaleV, 0.37, octaves, 2, 0.5);
  const b = fbm3(seed, (u - 1) * scaleU, v * scaleV, 0.37, octaves, 2, 0.5);
  const c = fbm3(seed, u * scaleU, (v - 1) * scaleV, 0.37, octaves, 2, 0.5);
  const d = fbm3(seed, (u - 1) * scaleU, (v - 1) * scaleV, 0.37, octaves, 2, 0.5);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

const gray = (value) => [value, value, value];

// Wood: grain streaks running along V — noise compressed 12x across so
// bands read as fibers, plus sparse darker growth lines.
function shadeWood(seed) {
  return (u, v) => {
    const wobble = 0.06 * tileNoise(hashCombine(seed, 2), u, v, 3, 3, 2);
    const grain = tileNoise(seed, u + wobble, v, 24, 2, 3);
    const line = valueNoise3(hashCombine(seed, 3), (u + wobble) * 48, v * 3, 0.7);
    let value = 0.88 + grain * 0.1;
    if (line > 0.55) value -= (line - 0.55) * 0.5;
    return [value, value * 0.97, value * 0.92];
  };
}

// Bone: fine porous speckle with sparse darker pits and a faint mottle.
function shadeBone(seed) {
  return (u, v) => {
    const mottle = tileNoise(seed, u, v, 4, 4, 2);
    const pore = valueNoise3(hashCombine(seed, 5), u * 60, v * 60, 0.3);
    let value = 0.92 + mottle * 0.07;
    if (pore > 0.62) value -= (pore - 0.62) * 0.9;
    return [value, value, value * 0.97];
  };
}

// Stone / masonry: mineral speckle over a broad mottle.
function shadeStone(seed) {
  return (u, v) => {
    const mottle = tileNoise(seed, u, v, 5, 5, 3);
    const speck = valueNoise3(hashCombine(seed, 7), u * 90, v * 90, 0.2);
    let value = 0.9 + mottle * 0.08;
    if (speck > 0.7) value += (speck - 0.7) * 0.5;
    if (speck < -0.7) value += (speck + 0.7) * 0.4;
    return gray(value);
  };
}

// Metal: brushed streaks along U plus broad patchy tarnish.
function shadeMetal(seed) {
  return (u, v) => {
    const brush = tileNoise(seed, u, v, 2, 40, 2);
    const patch = tileNoise(hashCombine(seed, 11), u, v, 3, 3, 2);
    const value = 0.9 + brush * 0.06 + patch * 0.08;
    return [value, value, value * 1.02];
  };
}

// Leaf: mid vein at u=0.5 with angled side veins, over papery fibers.
// Leaf geometry UVs put u across the blade and v stem->tip.
function shadeLeaf(seed) {
  return (u, v) => {
    const paper = tileNoise(seed, u, v, 8, 8, 2);
    let value = 0.92 + paper * 0.06;
    const acrossMid = Math.abs(u - 0.5);
    if (acrossMid < 0.02) value -= (1 - acrossMid / 0.02) * 0.18;
    // Side veins: diagonal lines every ~0.14 of blade length.
    const veinPhase = (v * 7 + acrossMid * 4.2) % 1;
    if (veinPhase < 0.07 && acrossMid > 0.02 && acrossMid < 0.42) {
      value -= (1 - veinPhase / 0.07) * 0.1;
    }
    return [value * 0.99, value, value * 0.95];
  };
}

// Ash: fine powder with soft clumps.
function shadeAsh(seed) {
  return (u, v) => {
    const clump = tileNoise(seed, u, v, 6, 6, 3);
    const dust = valueNoise3(hashCombine(seed, 13), u * 110, v * 110, 0.2);
    return gray(0.92 + clump * 0.06 + dust * 0.04);
  };
}

// Fibrous radial detail for cones, shells, and other organic solids.
function shadeFiber(seed) {
  return (u, v) => {
    const fiber = tileNoise(seed, u, v, 24, 4, 2);
    const mottle = tileNoise(hashCombine(seed, 17), u, v, 3, 3, 2);
    return gray(0.9 + fiber * 0.07 + mottle * 0.05);
  };
}

// Bark: deep lengthwise ridge streaks with dark furrows.
function shadeBark(seed) {
  return (u, v) => {
    const wobble = 0.08 * tileNoise(hashCombine(seed, 2), u, v, 3, 3, 2);
    const ridge = tileNoise(seed, u + wobble, v, 16, 2, 3);
    const furrow = valueNoise3(hashCombine(seed, 4), (u + wobble) * 26, v * 2.2, 0.5);
    let value = 0.82 + ridge * 0.14;
    if (furrow > 0.35) value -= (furrow - 0.35) * 0.55;
    return [value, value * 0.94, value * 0.88];
  };
}

// Cracked wood: grain plus crossing check-crack lines.
function shadeCrackedWood(seed) {
  const grain = shadeWood(seed);
  return (u, v) => {
    const color = grain(u, v);
    const crack = valueNoise3(hashCombine(seed, 9), u * 9, v * 34, 0.4);
    if (crack > 0.66) {
      const depth = Math.min((crack - 0.66) * 2.4, 0.5);
      return [color[0] - depth, color[1] - depth, color[2] - depth];
    }
    return color;
  };
}

// Bleached bone: smoother and brighter than porous, faint sutures.
function shadeBleachedBone(seed) {
  return (u, v) => {
    const mottle = tileNoise(seed, u, v, 3, 3, 2);
    const suture = valueNoise3(hashCombine(seed, 6), u * 14, v * 14, 0.6);
    let value = 0.96 + mottle * 0.04;
    if (suture > 0.74) value -= (suture - 0.74) * 0.35;
    return [value, value, value * 0.98];
  };
}

// Veined stone: thin bright mineral veins over mottle.
function shadeVeinedStone(seed) {
  return (u, v) => {
    const mottle = tileNoise(seed, u, v, 4, 4, 3);
    const vein = Math.abs(tileNoise(hashCombine(seed, 8), u, v, 6, 6, 3));
    let value = 0.88 + mottle * 0.07;
    if (vein < 0.05) value += (1 - vein / 0.05) * 0.18;
    return gray(value);
  };
}

// Porous stone (lava/limestone): dark pit holes.
function shadePorousStone(seed) {
  return (u, v) => {
    const mottle = tileNoise(seed, u, v, 5, 5, 2);
    const pore = valueNoise3(hashCombine(seed, 10), u * 70, v * 70, 0.25);
    let value = 0.9 + mottle * 0.06;
    if (pore > 0.55) value -= (pore - 0.55) * 1;
    return gray(value);
  };
}

// Galvanized metal: crystalline spangle patches.
function shadeGalvanized(seed) {
  return (u, v) => {
    const patch = valueNoise3(hashCombine(seed, 12), u * 9, v * 9, 0.9);
    const grainy = tileNoise(seed, u, v, 30, 30, 1);
    const facet = (Math.round(patch * 5) / 5 - 0.5) * 0.14;
    const value = 0.92 + facet + grainy * 0.03;
    return [value, value, value * 1.03];
  };
}

// Painted metal: flat color with chipped scratches to bare metal.
function shadePaintedMetal(seed) {
  return (u, v) => {
    const chip = valueNoise3(hashCombine(seed, 14), u * 22, v * 22, 0.35);
    const scratch = tileNoise(seed, u, v, 2, 46, 1);
    let value = 0.95 + scratch * 0.02;
    if (chip > 0.62) value -= (chip - 0.62) * 0.85;
    return [value, value * 0.99, value * 0.97];
  };
}

// Style registry per material kind; the first entry is the 'auto' pick
// unless debrisTextureAuto overrides by variant.
export const DEBRIS_TEXTURE_STYLES = Object.freeze({
  ash: Object.freeze([Object.freeze({ id: 'powder', label: 'Powder' })]),
  bone: Object.freeze([
    Object.freeze({ id: 'porous', label: 'Porous' }),
    Object.freeze({ id: 'bleached', label: 'Bleached' }),
  ]),
  leaf: Object.freeze([Object.freeze({ id: 'veins', label: 'Leaf veins' })]),
  metal: Object.freeze([
    Object.freeze({ id: 'brushed', label: 'Brushed' }),
    Object.freeze({ id: 'galvanized', label: 'Galvanized' }),
    Object.freeze({ id: 'painted', label: 'Painted & chipped' }),
  ]),
  organicFiber: Object.freeze([Object.freeze({ id: 'fiber', label: 'Fiber' })]),
  stone: Object.freeze([
    Object.freeze({ id: 'speckle', label: 'Speckled' }),
    Object.freeze({ id: 'veined', label: 'Veined' }),
    Object.freeze({ id: 'porous', label: 'Porous' }),
  ]),
  wood: Object.freeze([
    Object.freeze({ id: 'grain', label: 'Plain grain' }),
    Object.freeze({ id: 'bark', label: 'Bark' }),
    Object.freeze({ id: 'cracked', label: 'Cracked' }),
  ]),
});

const STYLE_SHADERS = {
  'ash:powder': shadeAsh,
  'bone:bleached': shadeBleachedBone,
  'bone:porous': shadeBone,
  'leaf:veins': shadeLeaf,
  'metal:brushed': shadeMetal,
  'metal:galvanized': shadeGalvanized,
  'metal:painted': shadePaintedMetal,
  'organicFiber:fiber': shadeFiber,
  'stone:porous': shadePorousStone,
  'stone:speckle': shadeStone,
  'stone:veined': shadeVeinedStone,
  'wood:bark': shadeBark,
  'wood:cracked': shadeCrackedWood,
  'wood:grain': shadeWood,
};

/**
 * Returns the cached detail texture for a material kind + style at a
 * tiling scale. Textures are owned by this cache (evicted LRU, disposed
 * on eviction) — asset disposal must NOT dispose `material.map`.
 */
export function getDebrisDetailTexture(kind, seed, style = 'auto', scale = 1) {
  const styles = DEBRIS_TEXTURE_STYLES[kind] ?? DEBRIS_TEXTURE_STYLES.stone;
  const resolved = styles.some((entry) => entry.id === style) ? style : styles[0].id;
  const shader = STYLE_SHADERS[`${kind}:${resolved}`] ?? shadeStone;
  const scaleKey = Math.round(scale * 10) / 10;
  const key = `${kind}:${resolved}:${seed >>> 0}:${scaleKey}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const texture = bakeTexture(shader(hashCombine(seed >>> 0, kind.length * 37 + resolved.length)));
  texture.repeat.set(scaleKey, scaleKey);
  texture.name = `Debris detail ${key}`;
  cache.set(key, texture);
  if (cache.size > CACHE_LIMIT) {
    const [oldestKey, oldest] = cache.entries().next().value;
    cache.delete(oldestKey);
    oldest.dispose();
  }
  return texture;
}

// User-uploaded textures, cached by data URL. Browser only (Image
// decode); headless generation skips custom maps.
const customCache = new Map();

export function getCustomDebrisTexture(customTexture, scale = 1) {
  if (!customTexture?.dataUrl || typeof document === 'undefined') return null;
  const scaleKey = Math.round(scale * 10) / 10;
  const key = `${customTexture.dataUrl.length}:${customTexture.dataUrl.slice(-40)}:${scaleKey}`;
  const hit = customCache.get(key);
  if (hit) return hit;
  const texture = new THREE.TextureLoader().load(customTexture.dataUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(scaleKey, scaleKey);
  texture.name = `Debris custom ${customTexture.name ?? 'texture'}`;
  customCache.set(key, texture);
  if (customCache.size > 8) {
    const [oldestKey, oldest] = customCache.entries().next().value;
    customCache.delete(oldestKey);
    oldest.dispose();
  }
  return texture;
}

/**
 * Material kind + auto style per debris type/variant. Logs, root stumps,
 * and bark chips default to bark; everything else takes its kind's first
 * style.
 */
export function debrisTextureAuto(type, variant) {
  if (type === 'wood') {
    const bark = variant === 'logs' || variant === 'rootStump' || variant === 'barkChips';
    return { kind: 'wood', style: bark ? 'bark' : 'grain' };
  }
  if (type === 'bone') return { kind: 'bone', style: 'porous' };
  if (type === 'stone') return { kind: 'stone', style: 'speckle' };
  if (type === 'metal') return { kind: 'metal', style: 'brushed' };
  if (type === 'ash') return { kind: 'ash', style: 'powder' };
  return variant === 'leafLitter'
    ? { kind: 'leaf', style: 'veins' }
    : { kind: 'organicFiber', style: 'fiber' };
}

/** @deprecated kept for callers that only need the kind. */
export function debrisTextureKind(type, variant) {
  return debrisTextureAuto(type, variant).kind;
}

/**
 * Ensures UVs exist for texture sampling. Geometry without UVs (surface
 * nets output, custom slabs) gets a dominant-axis box projection scaled so
 * the tile repeats ~repeat times across the mesh — plenty for detail maps,
 * and seam-free enough at toon contrast.
 */
export function ensureDebrisUvs(geometry, repeat = 2) {
  if (geometry.attributes.uv) return;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position) return;
  geometry.computeBoundingSphere();
  const scale = repeat / Math.max(geometry.boundingSphere?.radius ?? 1, 1e-4) / 2;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = normal ? Math.abs(normal.getX(i)) : 0;
    const ny = normal ? Math.abs(normal.getY(i)) : 1;
    const nz = normal ? Math.abs(normal.getZ(i)) : 0;
    let u;
    let v;
    if (nx >= ny && nx >= nz) {
      u = position.getZ(i);
      v = position.getY(i);
    } else if (ny >= nz) {
      u = position.getX(i);
      v = position.getZ(i);
    } else {
      u = position.getX(i);
      v = position.getY(i);
    }
    uvs[i * 2] = u * scale + 0.5;
    uvs[i * 2 + 1] = v * scale + 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}
