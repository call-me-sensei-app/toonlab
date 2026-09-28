// Region procedural generation — the controlled counterpart to a full
// archetype seed: the user picks TILES and dials in what appears there
// (terrain type, elevation range, roughness, features, seed), and the
// generator rewrites exactly that region:
//
//   - heights from seeded, type-shaped noise, FEATHERED into the untouched
//     surroundings so region borders never crack or cliff;
//   - features (lake / river / plateau / cliff steps) fitted best-effort
//     into the generated relief;
//   - surface weights repainted per-quad to match the type (with noise
//     dithering so bands never read as hard stripes).
//
// Deterministic for a given (field, tiles, options) — same seed, same
// terrain. Returns invertible commands; the lab applies them as one
// compound history entry.

import {
  periodicBillow2,
  periodicFbm2,
  periodicRidged2,
} from '../texgen/noise2.js';
import { tileGridRange } from './landscapeTileGeometry.js';

const NOISE_PERIOD = 8192;
const BLEND_MARGIN_SAMPLES = 14;

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
};

/** Terrain types the generator understands (UI options come from here). */
export const GENERATE_TERRAIN_TYPES = Object.freeze([
  Object.freeze({ id: 'plains', label: 'Plains' }),
  Object.freeze({ id: 'hills', label: 'Rolling Hills' }),
  Object.freeze({ id: 'mountains', label: 'Mountains' }),
  Object.freeze({ id: 'desert', label: 'Desert Dunes' }),
  Object.freeze({ id: 'canyon', label: 'Canyon / Badlands' }),
]);

/** Optional features the generator best-effort fits into the region. */
export const GENERATE_FEATURES = Object.freeze([
  Object.freeze({ id: 'lake', label: 'Lake', hint: 'Depresses a basin below the water level at the lowest spot.' }),
  Object.freeze({ id: 'river', label: 'River', hint: 'Carves a meandering channel across the region down to the water.' }),
  Object.freeze({ id: 'plateau', label: 'Plateau', hint: 'Flattens a raised table near the region center.' }),
  Object.freeze({ id: 'cliffs', label: 'Cliff Steps', hint: 'Terraces the relief into stepped bands.' }),
]);

// Base relief in [0, 1] per type; roughness adds high-frequency detail.
function reliefAt(type, seed, x, z, roughness) {
  const fbm = (scale, offset = 0) => periodicFbm2(seed + offset, x * scale, z * scale, NOISE_PERIOD, NOISE_PERIOD);
  const ridged = (scale, offset = 0) => periodicRidged2(seed + offset, x * scale, z * scale, NOISE_PERIOD, NOISE_PERIOD);
  const billow = (scale, offset = 0) => periodicBillow2(seed + offset, x * scale, z * scale, NOISE_PERIOD, NOISE_PERIOD);
  let base;
  if (type === 'plains') {
    base = 0.35 + (fbm(0.012) - 0.5) * 0.5;
  } else if (type === 'mountains') {
    const ridge = ridged(0.011, 11);
    base = ridge ** 1.5 * 0.85 + fbm(0.03, 7) * 0.15;
  } else if (type === 'desert') {
    base = billow(0.02, 23) * 0.75 + fbm(0.008, 5) * 0.25;
  } else if (type === 'canyon') {
    const mesa = fbm(0.01, 31);
    base = mesa > 0.5 ? 0.65 + (mesa - 0.5) * 0.5 : 0.2 + mesa * 0.3;
  } else { // hills
    base = fbm(0.02, 3);
  }
  const detail = (fbm(0.09, 97) - 0.5) * roughness * 0.35;
  return Math.min(1, Math.max(0, base + detail));
}

// Chamfer distance transform (in samples) to the nearest out-of-region
// sample, over the region bounding box — exact enough for feathering and
// O(n) even for L-shaped multi-tile unions.
function distanceToBorder(inRegion, width, depth) {
  const INF = 1e9;
  const dist = new Float32Array(width * depth);
  for (let i = 0; i < dist.length; i += 1) dist[i] = inRegion[i] ? INF : 0;
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = z * width + x;
      if (dist[i] === 0) continue;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (z > 0) dist[i] = Math.min(dist[i], dist[i - width] + 1);
      if (x > 0 && z > 0) dist[i] = Math.min(dist[i], dist[i - width - 1] + 1.4);
      if (x < width - 1 && z > 0) dist[i] = Math.min(dist[i], dist[i - width + 1] + 1.4);
    }
  }
  for (let z = depth - 1; z >= 0; z -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = z * width + x;
      if (dist[i] === 0) continue;
      if (x < width - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (z < depth - 1) dist[i] = Math.min(dist[i], dist[i + width] + 1);
      if (x < width - 1 && z < depth - 1) dist[i] = Math.min(dist[i], dist[i + width + 1] + 1.4);
      if (x > 0 && z < depth - 1) dist[i] = Math.min(dist[i], dist[i + width - 1] + 1.4);
    }
  }
  return dist;
}

/**
 * Generates the selected tiles. Returns `{ terrainCommand, splatCommand,
 * dirtyRect }` (either command may be null when nothing changed); the field
 * is already mutated — callers push the pair as one history entry.
 */
export function generateTerrainRegion(field, {
  tiles = [],
  type = 'hills',
  minElevation = 0,
  maxElevation = 12,
  roughness = 0.5,
  features = [],
  seed = 1,
  waterLevel = -0.6,
} = {}) {
  if (!tiles.length) return { terrainCommand: null, splatCommand: null, dirtyRect: null };
  const tileSet = new Set(tiles.map(({ tx, tz }) => `${tx},${tz}`));
  const quads = field.quadsPerTile;
  const featureSet = new Set(features);
  const random = mulberry32(seed * 747796405 + 2891336453);

  // Region bounding box in SAMPLE space (inclusive), padded by a one-sample
  // halo so the distance transform SEES the out-of-region surroundings —
  // without it, box-edge samples read as deep interior and the region rim
  // would snap instead of blending. At the field edge there is no halo, so
  // generation runs full-strength right up to the map border (desired).
  let minGx = Infinity;
  let minGz = Infinity;
  let maxGx = -Infinity;
  let maxGz = -Infinity;
  for (const { tx, tz } of tiles) {
    const range = tileGridRange(field, tx, tz);
    minGx = Math.min(minGx, range.minGx);
    minGz = Math.min(minGz, range.minGz);
    maxGx = Math.max(maxGx, range.maxGx);
    maxGz = Math.max(maxGz, range.maxGz);
  }
  minGx = Math.max(0, minGx - 1);
  minGz = Math.max(0, minGz - 1);
  maxGx = Math.min(field.gridW - 1, maxGx + 1);
  maxGz = Math.min(field.gridD - 1, maxGz + 1);
  const boxW = maxGx - minGx + 1;
  const boxD = maxGz - minGz + 1;

  // A SAMPLE is in-region when any adjacent quad belongs to a selected tile.
  const sampleTile = (gq) => Math.min(field.tilesX - 1, Math.floor(gq / quads));
  const inRegion = new Uint8Array(boxW * boxD);
  for (let z = 0; z < boxD; z += 1) {
    const gz = minGz + z;
    for (let x = 0; x < boxW; x += 1) {
      const gx = minGx + x;
      const candidates = [
        [sampleTile(Math.min(gx, field.splatW - 1)), Math.min(Math.floor(Math.min(gz, field.splatD - 1) / quads), field.tilesZ - 1)],
        [sampleTile(Math.max(gx - 1, 0)), Math.min(Math.floor(Math.max(gz - 1, 0) / quads), field.tilesZ - 1)],
      ];
      if (candidates.some(([tx, tz]) => tileSet.has(`${tx},${tz}`))) inRegion[z * boxW + x] = 1;
    }
  }
  const border = distanceToBorder(inRegion, boxW, boxD);

  // Region world center/extents for feature placement.
  const worldMinX = field.origin.x + minGx * field.spacing;
  const worldMinZ = field.origin.z + minGz * field.spacing;
  const worldW = (boxW - 1) * field.spacing;
  const worldD = (boxD - 1) * field.spacing;
  const regionRadius = Math.min(worldW, worldD) / 2;

  // Feature parameters (seeded, best-effort).
  const plateau = featureSet.has('plateau') ? {
    x: worldMinX + worldW * (0.35 + random() * 0.3),
    z: worldMinZ + worldD * (0.35 + random() * 0.3),
    radius: regionRadius * (0.3 + random() * 0.15),
    height: minElevation + (maxElevation - minElevation) * 0.65,
  } : null;
  const river = featureSet.has('river') ? {
    horizontal: worldW >= worldD,
    phase: random() * Math.PI * 2,
    amplitude: (worldW >= worldD ? worldD : worldW) * 0.18,
    width: Math.max(3.5, regionRadius * 0.08),
    depth: 1.6 + random() * 0.8,
  } : null;
  const cliffStep = featureSet.has('cliffs')
    ? Math.max(1.25, (maxElevation - minElevation) / 6)
    : null;

  // --- pass 1: target heights --------------------------------------------------
  const targets = new Float32Array(boxW * boxD);
  for (let z = 0; z < boxD; z += 1) {
    const gz = minGz + z;
    const worldZ = field.origin.z + gz * field.spacing;
    for (let x = 0; x < boxW; x += 1) {
      const index = z * boxW + x;
      if (!inRegion[index]) continue;
      const gx = minGx + x;
      const worldX = field.origin.x + gx * field.spacing;
      let target = minElevation
        + reliefAt(type, seed, worldX, worldZ, roughness) * (maxElevation - minElevation);
      if (plateau) {
        const d = Math.hypot(worldX - plateau.x, worldZ - plateau.z);
        const w = smooth(1 - d / plateau.radius);
        target = target + (plateau.height - target) * w * 0.9;
      }
      if (cliffStep) {
        const banded = Math.round(target / cliffStep) * cliffStep;
        target = target + (banded - target) * 0.85;
      }
      if (river) {
        const along = river.horizontal ? worldX : worldZ;
        const across = river.horizontal ? worldZ : worldX;
        const centerAcross = (river.horizontal ? worldMinZ + worldD / 2 : worldMinX + worldW / 2)
          + Math.sin(along * 0.025 + river.phase) * river.amplitude;
        const d = Math.abs(across - centerAcross);
        if (d < river.width * 2.5) {
          const w = smooth(1 - d / (river.width * 2.5));
          const bed = waterLevel - river.depth;
          target = Math.min(target, target + (bed - target) * w);
        }
      }
      targets[index] = target;
    }
  }
  if (featureSet.has('lake')) {
    // Lowest generated spot hosts the lake basin.
    let bestIndex = -1;
    let bestHeight = Infinity;
    for (let i = 0; i < targets.length; i += 1) {
      if (inRegion[i] && border[i] > BLEND_MARGIN_SAMPLES && targets[i] < bestHeight) {
        bestHeight = targets[i];
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      const lakeX = worldMinX + (bestIndex % boxW) * field.spacing;
      const lakeZ = worldMinZ + Math.floor(bestIndex / boxW) * field.spacing;
      const lakeRadius = regionRadius * (0.28 + random() * 0.15);
      const lakeBed = waterLevel - (2 + random() * 2);
      for (let z = 0; z < boxD; z += 1) {
        for (let x = 0; x < boxW; x += 1) {
          const index = z * boxW + x;
          if (!inRegion[index]) continue;
          const worldX = worldMinX + x * field.spacing;
          const worldZ = worldMinZ + z * field.spacing;
          const w = smooth(1 - Math.hypot(worldX - lakeX, worldZ - lakeZ) / lakeRadius);
          if (w > 0) targets[index] = Math.min(targets[index], targets[index] + (lakeBed - targets[index]) * w);
        }
      }
    }
  }

  // --- pass 2: feathered write + terrain command -------------------------------
  const heightEntries = [];
  for (let z = 0; z < boxD; z += 1) {
    const gz = minGz + z;
    for (let x = 0; x < boxW; x += 1) {
      const index = z * boxW + x;
      if (!inRegion[index]) continue;
      const gx = minGx + x;
      const fieldIndex = gz * field.gridW + gx;
      const before = field.heights[fieldIndex];
      // (border − 1) keeps shared boundary samples EXACTLY untouched.
      const blend = smooth((border[index] - 1) / BLEND_MARGIN_SAMPLES);
      const after = before + (targets[index] - before) * blend;
      if (after === before) continue;
      heightEntries.push([fieldIndex, before, after]);
      field.heights[fieldIndex] = after;
      field.expandHeightBounds(after);
    }
  }
  const dirtyRect = { minX: minGx, minZ: minGz, maxX: maxGx, maxZ: maxGz };
  let terrainCommand = null;
  if (heightEntries.length) {
    const indices = new Uint32Array(heightEntries.length);
    const before = new Float32Array(heightEntries.length);
    const after = new Float32Array(heightEntries.length);
    heightEntries.forEach(([fieldIndex, b, a], i) => {
      indices[i] = fieldIndex;
      before[i] = b;
      after[i] = a;
    });
    terrainCommand = { kind: 'terrain', indices, before, after, dirtyRect };
  }

  // --- pass 3: surface repaint (per selected quad, dithered by type) ----------
  const splatEntries = [];
  const elevationSpan = Math.max(1e-3, maxElevation - minElevation);
  for (const { tx, tz } of tiles) {
    for (let qz = tz * quads; qz < (tz + 1) * quads; qz += 1) {
      for (let qx = tx * quads; qx < (tx + 1) * quads; qx += 1) {
        const quad = qz * field.splatW + qx;
        const worldX = field.origin.x + (qx + 0.5) * field.spacing;
        const worldZ = field.origin.z + (qz + 0.5) * field.spacing;
        const height = field.heightAt(worldX, worldZ);
        const slope = field.slopeAt(worldX, worldZ);
        const fraction = (height - minElevation) / elevationSpan;
        const dither = periodicFbm2(seed + 131, worldX * 0.06, worldZ * 0.06, NOISE_PERIOD, NOISE_PERIOD) - 0.5;
        // Channels: 0 grass · 1 dirt · 2 rock · 3 sand.
        let channel;
        if (height <= waterLevel + 0.4) channel = type === 'desert' ? 3 : 1;
        else if (slope > 0.55 + dither * 0.2) channel = 2;
        else if (type === 'desert') channel = dither > 0.18 ? 2 : 3;
        else if (type === 'canyon') channel = fraction > 0.55 ? 2 : (dither > 0.1 ? 1 : 3);
        else if (type === 'mountains') channel = fraction > 0.62 + dither * 0.2 ? 2 : 0;
        else channel = dither > 0.24 ? 1 : 0;
        const offset = quad * 4;
        const beforePacked = (field.splat[offset] << 24 >>> 0)
          | (field.splat[offset + 1] << 16) | (field.splat[offset + 2] << 8) | field.splat[offset + 3];
        field.splat[offset] = channel === 0 ? 255 : 0;
        field.splat[offset + 1] = channel === 1 ? 255 : 0;
        field.splat[offset + 2] = channel === 2 ? 255 : 0;
        field.splat[offset + 3] = channel === 3 ? 255 : 0;
        const afterPacked = (field.splat[offset] << 24 >>> 0)
          | (field.splat[offset + 1] << 16) | (field.splat[offset + 2] << 8) | field.splat[offset + 3];
        if (afterPacked !== beforePacked) splatEntries.push([quad, beforePacked, afterPacked]);
      }
    }
  }
  let splatCommand = null;
  if (splatEntries.length) {
    const indices = new Uint32Array(splatEntries.length);
    const before = new Uint32Array(splatEntries.length);
    const after = new Uint32Array(splatEntries.length);
    splatEntries.forEach(([quad, b, a], i) => {
      indices[i] = quad;
      before[i] = b >>> 0;
      after[i] = a >>> 0;
    });
    splatCommand = { kind: 'splat', indices, before, after, dirtyRect };
  }

  return { terrainCommand, splatCommand, dirtyRect };
}
