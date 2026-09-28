// Meshing orchestrator: document -> compiled field -> padded bounds ->
// sampled grid -> surface nets -> derived attributes -> BufferGeometry.
//
// Typical budgets (single default piece): preview 80 cells on the longest
// axis samples ~0.5M points (40-120 ms), export 224 samples ~11M (1-4 s,
// grid ~45 MB freed after extraction). Resolution is hard-capped at 320.

import * as THREE from 'three';

import { hashCombine } from '../noise/prng.js';
import { compileDocument } from '../sdf/fieldCompiler.js';
import {
  computeGradientNormals,
  computeSdfAo,
  computeVertexColors,
  deindexWithFlatNormals,
} from './meshAttributes.js';
import { filterSmallIslands, sampleGrid, surfaceNets } from './surfaceNets.js';

const MAX_RESOLUTION = 320;
const SEED_COLOR = 131;

/**
 * Meshes a rock document into a THREE.BufferGeometry with the rockgen
 * attribute contract: `position`, `normal`, `color` (baked stylized
 * albedo), `envVertexAo` (1 = open), and `index` (dropped in 'flat'
 * normals mode, which de-indexes).
 *
 * @param {object} document Rock document.
 * @param {object} [options]
 * @param {number} [options.resolution] Cells along the longest bounds axis
 *   (defaults to `document.meshing.previewResolution`).
 * @param {{min: number[], max: number[]}} [options.bounds] Bounds override.
 * @param {'gradient'|'flat'} [options.normals] Normal mode override.
 * @param {{color?: boolean, ao?: boolean}} [options.attributes] Skip baked
 *   attributes (both default true).
 * @param {boolean} [options.includeHelpers] Include construction-only lab
 *   helpers such as hidden ground supports. Defaults false so preview/export
 *   match the final visible rock.
 * @param {string} [options.pieceId] Mesh one piece in its local space.
 */
export function meshDocument(document, {
  attributes = {},
  bounds = null,
  includeHelpers = false,
  normals = null,
  pieceId = null,
  resolution = null,
} = {}) {
  if (document?.reference?.sourceMode === 'mesh-template') {
    throw new Error(
      'Source-mesh rock references cannot be SDF-meshed. Load their local authored LODs '
      + 'with loadRockReferenceAsset() and use createRockReferenceLodObject().',
    );
  }
  const program = compileDocument(document, { includeHelpers, pieceId });
  const gridResolution = Math.min(
    Math.max(Math.round(resolution ?? document.meshing.previewResolution), 8),
    MAX_RESOLUTION,
  );
  const normalsMode = normals ?? document.meshing.normalsMode;
  const wantColor = attributes.color !== false;
  const wantAo = attributes.ao !== false;

  // Final safety pad: two voxels beyond the compiler's displacement pad.
  const sourceBounds = bounds ?? program.bounds;
  const longest = Math.max(
    sourceBounds.max[0] - sourceBounds.min[0],
    sourceBounds.max[1] - sourceBounds.min[1],
    sourceBounds.max[2] - sourceBounds.min[2],
  );
  const voxelPad = (longest / gridResolution) * 2;
  const paddedBounds = {
    max: sourceBounds.max.map((value) => value + voxelPad),
    min: sourceBounds.min.map((value) => value - voxelPad),
  };

  const grid = sampleGrid(program.evaluate, paddedBounds, gridResolution);
  let surface = surfaceNets(grid, {
    evaluate: document.meshing.sharpFeatures !== false ? program.evaluate : null,
  });
  if (document.meshing.removeIslands !== false) {
    surface = filterSmallIslands(surface);
  }
  const { indices, positions } = surface;
  if (positions.length === 0) {
    throw new Error('Rock document produced an empty surface (check sizes and amplitudes).');
  }

  const epsilon = grid.cellSize * 0.5;
  let vertexNormals = computeGradientNormals(program.evaluate, positions, epsilon);
  const ao = wantAo || wantColor
    ? computeSdfAo(program.evaluate, positions, vertexNormals, {
      radius: document.surface.aoRadius,
      strength: document.surface.aoStrength,
    })
    : null;
  const colors = wantColor
    ? computeVertexColors(
      positions,
      vertexNormals,
      ao,
      document.surface,
      hashCombine(document.seed >>> 0, SEED_COLOR),
      paddedBounds,
      program.tintAt,
    )
    : null;

  const geometry = new THREE.BufferGeometry();
  if (normalsMode === 'flat') {
    const flat = deindexWithFlatNormals({
      ao: ao ?? new Float32Array(positions.length / 3).fill(1),
      colors: colors ?? new Float32Array(positions.length),
      indices,
      positions,
    });
    geometry.setAttribute('position', new THREE.BufferAttribute(flat.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(flat.normals, 3));
    if (wantColor) geometry.setAttribute('color', new THREE.BufferAttribute(flat.colors, 3));
    if (wantAo) geometry.setAttribute('envVertexAo', new THREE.BufferAttribute(flat.ao, 1));
  } else {
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(vertexNormals, 3));
    if (wantColor) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (wantAo) geometry.setAttribute('envVertexAo', new THREE.BufferAttribute(ao, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * FNV-1a hash over every attribute's byte view (name-salted) plus the
 * index. Used by scripts/verify-rockgen.mjs to assert determinism and by
 * callers as a cheap content key.
 */
export function hashGeometry(geometry) {
  let hash = 0x811c9dc5;
  const mixBytes = (bytes) => {
    for (let i = 0; i < bytes.length; i += 1) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  const mixString = (text) => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  for (const name of Object.keys(geometry.attributes).sort()) {
    mixString(name);
    const { array } = geometry.attributes[name];
    mixBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  }
  if (geometry.index) {
    mixString('index');
    const { array } = geometry.index;
    mixBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.toString(16).padStart(8, '0');
}
