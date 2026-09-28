// Repository-only research profile. This is deliberately not exported from
// @call-me-sensei/toonlab/rockgen until the compiler and family gates have
// completed package-boundary and visual qualification.

import * as THREE from 'three';

import { computeGradientNormals } from '../mesh/meshAttributes.js';
import { filterSmallIslands, sampleGrid, surfaceNets } from '../mesh/surfaceNets.js';
import { cellularCrease3 } from '../noise/cellularNoise3.js';
import { createRandom, hashCombine } from '../noise/prng.js';
import { fbm3, valueNoise3 } from '../noise/valueNoise3.js';
import { opSmoothIntersect } from '../sdf/sdfOps.js';
import { sdEllipsoid } from '../sdf/sdfPrimitives.js';
import { evaluateBoulderFamilyGate } from './meshAudit.js';

export const REALISTIC_BOULDER_FAMILY_ID = 'toonlab/jointed-granite-boulder-v1';

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 1e-6));
  return t * t * (3 - 2 * t);
}

function normalizedSeed(value) {
  return Math.max(1, Math.round(Number(value) || 1)) >>> 0;
}

function normalizePlane([x, y, z]) {
  const length = Math.sqrt(x * x + y * y + z * z);
  return [x / length, y / length, z / length];
}

function ellipsoidSupport(rx, ry, rz, nx, ny, nz) {
  return Math.sqrt((rx * nx) ** 2 + (ry * ny) ** 2 + (rz * nz) ** 2);
}

function buildJointPlanes(random, radii) {
  const templates = [
    [1, 0.08, 0.08], [-1, 0.04, -0.12],
    [0.08, 0.1, 1], [-0.14, 0.07, -1],
    [0.72, 0.12, 0.7], [-0.72, 0.1, 0.7],
    [0.68, 0.08, -0.74], [-0.7, 0.12, -0.68],
    [0.18, 1, 0.12], [-0.28, 1, -0.08],
  ];
  return templates.map((template, index) => {
    const normal = normalizePlane([
      template[0] + (random() - 0.5) * 0.12,
      template[1] + (random() - 0.5) * 0.08,
      template[2] + (random() - 0.5) * 0.12,
    ]);
    const support = ellipsoidSupport(...radii, ...normal);
    const retainedSupport = index >= 8
      ? 0.77 + random() * 0.07
      : 0.81 + random() * 0.1;
    return [...normal, support * retainedSupport];
  });
}

/**
 * First qualified source profile for the generic high-to-low compiler.
 *
 * The variation range is intentionally narrow: these are grounded, massive,
 * jointed granite boulders, not arbitrary rock formations. The low field owns
 * silhouette and meso-scale joints. The high field adds centimetre-scale
 * fissures and mineral relief that must be baked rather than meshed at runtime.
 */
export function createJointedGraniteBoulderSource({ seed = 1 } = {}) {
  const familySeed = normalizedSeed(seed);
  const random = createRandom(hashCombine(familySeed, 0x6a09e667));
  const radiusX = 1.2 + random() * 0.17;
  const radiusY = 0.76 + random() * 0.1;
  const radiusZ = 1.01 + random() * 0.15;
  const radii = [radiusX, radiusY, radiusZ];
  const jointPlanes = buildJointPlanes(random, radii);
  const lowNoiseSeed = hashCombine(familySeed, 0x1f83d9ab);
  const detailSeed = hashCombine(familySeed, 0xbb67ae85);
  const fissureSeed = hashCombine(familySeed, 0x3c6ef372);
  const crystalSeed = hashCombine(familySeed, 0xa54ff53a);
  const regionSeed = hashCombine(familySeed, 0x510e527f);
  const bottomY = -radiusY * (0.52 + random() * 0.05);
  const bevel = 0.018;

  const evaluateLow = (x, y, z) => {
    let distance = sdEllipsoid(x, y, z, radiusX, radiusY, radiusZ);
    distance -= fbm3(lowNoiseSeed, x * 1.1, y * 1.05, z * 1.1, 3, 2.03, 0.48) * 0.047;
    for (const [nx, ny, nz, offset] of jointPlanes) {
      distance = opSmoothIntersect(distance, nx * x + ny * y + nz * z - offset, bevel);
    }
    distance = opSmoothIntersect(distance, bottomY - y, 0.014);
    return distance;
  };

  const evaluateHigh = (x, y, z) => {
    const low = evaluateLow(x, y, z);
    const exfoliation = fbm3(detailSeed, x * 5.1, y * 4.6, z * 5.1, 3, 2.03, 0.48);
    const fissureGate = smoothstep(
      0.39,
      0.73,
      fbm3(fissureSeed + 1, x * 0.72, y * 0.68, z * 0.72, 2, 2, 0.5) * 0.5 + 0.5,
    );
    const fissures = cellularCrease3(fissureSeed, x * 2.55, y * 2.25, z * 2.55, 1, 0.06)
      * fissureGate;
    const crystals = valueNoise3(crystalSeed, x * 24, y * 24, z * 24);
    return low - exfoliation * 0.015 + fissures * 0.012 - crystals * 0.0028;
  };

  const bounds = {
    min: [-radiusX - 0.15, bottomY - 0.15, -radiusZ - 0.15],
    max: [radiusX + 0.15, radiusY + 0.15, radiusZ + 0.15],
  };
  const regionAt = (x, y, z, normal = null, ao = 1) => {
    const exposure = normal ? smoothstep(0.2, 0.82, normal[1]) : 0.5;
    const patch = fbm3(regionSeed, x * 1.25, y * 0.9, z * 1.25, 3, 2, 0.5) * 0.5 + 0.5;
    const sheltered = clamp01((1 - ao) * 0.72 + exposure * 0.3);
    return clamp01(patch * 0.67 + sheltered * 0.33);
  };

  return Object.freeze({
    bounds,
    createLowGeometry(resolution = 48) {
      const grid = sampleGrid(evaluateLow, bounds, resolution);
      const surface = filterSmallIslands(surfaceNets(grid, { evaluate: evaluateLow }), 0.02);
      if (surface.positions.length === 0 || surface.indices.length === 0) {
        throw new Error('Jointed granite source produced an empty low mesh.');
      }
      const normals = computeGradientNormals(
        evaluateLow,
        surface.positions,
        Math.max(grid.cellSize * 0.38, 0.003),
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    },
    evaluateHigh,
    evaluateFamilyGate: evaluateBoulderFamilyGate,
    evaluateLow,
    family: REALISTIC_BOULDER_FAMILY_ID,
    geology: 'granite',
    maxProjectionDistance: 0.075,
    regionAt,
    seed: familySeed,
    variation: Object.freeze({
      bottomY,
      jointCount: jointPlanes.length,
      radiusX,
      radiusY,
      radiusZ,
    }),
  });
}
