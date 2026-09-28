import * as THREE from 'three';

import {
  computeGradientNormals,
  computeSdfAo,
  computeVertexColors,
} from '../../src/rockgen/mesh/meshAttributes.js';
import {
  filterSmallIslands,
  sampleGrid,
  surfaceNets,
} from '../../src/rockgen/mesh/surfaceNets.js';
import { hashGeometry } from '../../src/rockgen/mesh/meshDocument.js';
import {
  DOMAIN_TO_METRES_X,
  detailedSdf,
  fbm,
  formationOf,
  graniteMeshField,
  octaveBudget,
  surfaceSdf,
} from './geologyField.js';
import { extractDenseSurface } from './vibeDualContour.js';
import { auditGeometry } from './geometryAudit.js';

export const WORLD_SCALE = Object.freeze([DOMAIN_TO_METRES_X, 1.62, 1.7]);

const GRANITE_SURFACE = Object.freeze({
  aoRadius: 0.17,
  aoStrength: 0.72,
  baseColor: [0.48, 0.46, 0.43],
  cavityColor: [0.13, 0.14, 0.15],
  colorNoise: 0.075,
  lichenColor: [0.55, 0.57, 0.43],
  lichenCoverage: 0.12,
  mossColor: [0.23, 0.29, 0.18],
  mossCoverage: 0.025,
  stainColor: [0.29, 0.25, 0.21],
  stainStrength: 0.18,
  textureScale: 1.7,
  textureStrength: 0.86,
  textureStyle: 'granite',
  topCoatStrength: 0.12,
  topColor: [0.59, 0.57, 0.52],
  topHeightStart: 0.58,
  topSlopeStart: 0.68,
  veinColor: [0.68, 0.67, 0.62],
  veinStrength: 0.08,
});

function toFloat32(values) {
  return values instanceof Float32Array ? values : new Float32Array(values);
}

function extractWithVibe(seed, resolution) {
  const surface = extractDenseSurface({
    cells: resolution,
    field: graniteMeshField,
    seed,
  });
  return filterSmallIslands({
    indices: surface.indices,
    positions: toFloat32(surface.positions),
  }, 0.015);
}

function extractWithToonLab(seed, resolution, minimumWavelength) {
  const evaluate = (x, y, z) => surfaceSdf(x, y, z, seed, minimumWavelength);
  const grid = sampleGrid(evaluate, {
    min: [-1, -1, -1],
    max: [1, 1, 1],
  }, resolution);
  return {
    ...filterSmallIslands(surfaceNets(grid, { evaluate }), 0.015),
    cellSize: grid.cellSize,
  };
}

/**
 * Builds one deterministic granite seed using the Vibe3D field and either the
 * reference or ToonLab extractor. This is intentionally repository-only.
 */
export function buildGraniteGeometry({
  detailNormals = true,
  mesher = 'vibe',
  resolution = 64,
  seed = 1,
} = {}) {
  const normalizedSeed = Math.max(1, Math.floor(Number(seed) || 1));
  const normalizedResolution = Math.min(128, Math.max(32, Math.round(Number(resolution) || 64)));
  if (!['toonlab', 'vibe'].includes(mesher)) throw new Error(`Unknown mesher "${mesher}".`);

  const started = performance.now();
  const budget = octaveBudget(normalizedResolution);
  const extracted = mesher === 'vibe'
    ? extractWithVibe(normalizedSeed, normalizedResolution)
    : extractWithToonLab(normalizedSeed, normalizedResolution, budget.minimumWavelength);
  if (extracted.positions.length === 0 || extracted.indices.length === 0) {
    throw new Error('The geological field produced an empty surface.');
  }

  const meshEvaluate = (x, y, z) => surfaceSdf(
    x,
    y,
    z,
    normalizedSeed,
    budget.minimumWavelength,
  );
  // The detailed field includes every displacement band plus sub-grid crystal
  // relief. Sampling its gradient at game vertices demonstrates the value of a
  // future object-normal bake without pretending this vertex signal is that bake.
  const normalEvaluate = detailNormals
    ? (x, y, z) => detailedSdf(x, y, z, normalizedSeed)
    : meshEvaluate;
  const normalStep = detailNormals ? 0.0032 : Math.max(0.004, 0.42 / normalizedResolution);
  const normals = computeGradientNormals(normalEvaluate, extracted.positions, normalStep);
  const ao = computeSdfAo(meshEvaluate, extracted.positions, normals, {
    radius: GRANITE_SURFACE.aoRadius,
    strength: GRANITE_SURFACE.aoStrength,
  });
  const colors = computeVertexColors(
    extracted.positions,
    normals,
    ao,
    GRANITE_SURFACE,
    normalizedSeed * 7919,
    { min: [-1, -1, -1], max: [1, 1, 1] },
  );

  // Add a restrained, centimetre-scale mineral modulation. It stays in the
  // asset color channel and does not change topology or replace the future
  // surface bake.
  for (let vertex = 0; vertex < ao.length; vertex += 1) {
    const offset = vertex * 3;
    const grain = fbm(
      extracted.positions[offset] * 24,
      extracted.positions[offset + 1] * 24,
      extracted.positions[offset + 2] * 24,
      normalizedSeed + 1201,
      3,
    );
    const cavity = 0.58 + ao[vertex] * 0.42;
    const mineral = 1 + grain * 0.13;
    colors[offset] *= cavity * mineral;
    colors[offset + 1] *= cavity * mineral;
    colors[offset + 2] *= cavity * (mineral * 0.985);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(extracted.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('envVertexAo', new THREE.BufferAttribute(ao, 1));
  geometry.setIndex(new THREE.BufferAttribute(extracted.indices, 1));
  geometry.scale(...WORLD_SCALE);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const integrity = auditGeometry(geometry);
  return {
    geometry,
    report: {
      ...integrity,
      bandsInMesh: budget.bands,
      bakeOnlyBands: budget.bakeOnly,
      buildMs: Math.round((performance.now() - started) * 10) / 10,
      detailNormals,
      formation: formationOf(normalizedSeed),
      geometryHash: hashGeometry(geometry),
      mesher,
      minimumWavelengthCm: Math.round(
        budget.minimumWavelength * DOMAIN_TO_METRES_X * 1000,
      ) / 10,
      provenance: 'vibe3d@10bba5d + toonlab repository experiment',
      resolution: normalizedResolution,
      seed: normalizedSeed,
      surfaceBake: false,
      voxelCm: Math.round(budget.voxel * DOMAIN_TO_METRES_X * 1000) / 10,
    },
  };
}

