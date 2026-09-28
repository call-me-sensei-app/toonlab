// Procedural detail textures for path ribbons — the same deterministic
// DataTexture approach as debrisgen (no canvas/DOM, headless-safe). Maps are
// near-white multipliers over baked vertex colors: the palette stays in the
// ribbon painter, the map adds the material read (trodden earth, cobble
// cells with grout, plank runs) that survives the environment toon
// conversion.

import * as THREE from 'three';

import { hashCombine } from '../rockgen/noise/prng.js';
import { fbm3, valueNoise3 } from '../rockgen/noise/valueNoise3.js';
import { periodicCellular2 } from '../texgen/noise2.js';

const SIZE = 256;
const cache = new Map();

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

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

// Tileable fbm via torus-blend of four phase-shifted reads (same trick as
// debrisTextures — exact periodic noise is overkill for detail maps).
function tileNoise(seed, u, v, scaleU, scaleV, octaves = 3) {
  const a = fbm3(seed, u * scaleU, v * scaleV, 0.37, octaves, 2, 0.5);
  const b = fbm3(seed, (u - 1) * scaleU, v * scaleV, 0.37, octaves, 2, 0.5);
  const c = fbm3(seed, u * scaleU, (v - 1) * scaleV, 0.37, octaves, 2, 0.5);
  const d = fbm3(seed, (u - 1) * scaleU, (v - 1) * scaleV, 0.37, octaves, 2, 0.5);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Dirt: broad trodden mottle, faint wheel-rut darkening along V, sparse
// pebble specks.
function shadeDirt(seed) {
  return (u, v) => {
    const mottle = tileNoise(seed, u, v, 5, 5, 3);
    const speck = valueNoise3(hashCombine(seed, 7), u * 70, v * 70, 0.25);
    let value = 0.9 + mottle * 0.09;
    // Two soft ruts at u ≈ 0.3 / 0.7 — reads as wear, not stripes.
    const rut = Math.min(Math.abs(u - 0.3), Math.abs(u - 0.7));
    value -= Math.max(0, 0.05 - rut * 0.4) * 0.7;
    if (speck > 0.66) value += (speck - 0.66) * 0.65;
    return [value, value * 0.985, value * 0.955];
  };
}

// Stone: cobble cells from periodic cellular noise — cell interiors bright
// with per-cell tone drift, grout lines dark. The painterly cobble read.
function shadeStone(seed) {
  const cellsU = 6;
  const cellsV = 6;
  return (u, v) => {
    const { f1, f2, id } = periodicCellular2(seed, u * cellsU, v * cellsV, cellsU, cellsV, 0.85);
    const edge = f2 - f1; // small near cell borders
    const grout = 1 - clamp01((edge - 0.02) / 0.1);
    const tone = 0.9 + ((id % 97) / 97 - 0.5) * 0.12;
    const mottle = tileNoise(hashCombine(seed, 3), u, v, 7, 7, 2) * 0.05;
    let value = tone + mottle - grout * 0.34;
    // Painterly top-left cell highlight, like the cliff edge treatment.
    value += (1 - grout) * 0.04;
    return [value, value, value * 0.99];
  };
}

// Planks: boards running across the path (breaks along V every board
// length), wood grain along U, darker seams.
function shadePlanks(seed) {
  const boards = 5; // across (U)
  return (u, v) => {
    const board = Math.floor(u * boards);
    // Stagger board ends per column so seams don't align.
    const phase = valueNoise3(hashCombine(seed, board), board * 13.7, 0.5, 0.9) * 0.5;
    const along = (v * 3 + phase) % 1;
    const grain = tileNoise(hashCombine(seed, 5 + board), u * boards - board, v, 2, 18, 2);
    let value = 0.88 + grain * 0.1;
    const seamU = Math.abs(u * boards - board - 0.5);
    if (seamU > 0.44) value -= (seamU - 0.44) * 3.2;
    if (along < 0.035) value -= (1 - along / 0.035) * 0.22;
    return [value, value * 0.97, value * 0.92];
  };
}

const SHADERS = { dirt: shadeDirt, planks: shadePlanks, stone: shadeStone };

/**
 * Cached deterministic detail texture per style + seed. Cache-owned:
 * dispose of ribbon materials, never of `material.map`.
 */
export function getPathDetailTexture(style, seed = 1) {
  const key = `${style}:${seed >>> 0}`;
  let texture = cache.get(key);
  if (!texture) {
    const shade = SHADERS[style] ?? shadeDirt;
    texture = bakeTexture(shade(hashCombine(seed >>> 0, 131)));
    cache.set(key, texture);
    if (cache.size > 12) {
      const oldest = cache.keys().next().value;
      cache.get(oldest)?.dispose();
      cache.delete(oldest);
    }
  }
  return texture;
}
