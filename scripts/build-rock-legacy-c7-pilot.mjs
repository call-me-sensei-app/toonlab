#!/usr/bin/env node

/**
 * Isolated C7-method modernization pilot for twelve assets from the legacy 480 set.
 *
 * The legacy GLB is immutable authority for silhouette and material provenance. This
 * script copies/downloads it into a versioned pilot root, extracts embedded images
 * without transcoding, builds a signed-distance control field from LOD0, and invokes
 * the repository-only C7 compiler. Outputs are review derivatives, never replacements
 * for public/catalog or the official 2026-08 release.
 */

import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

import { compileRockBakeV2, rockBakeBundleSignature } from '../src/rockgen/experimental/geology-v2/bake/compiler.node.js';
import { createDenseDetailField } from '../src/rockgen/experimental/geology-v2/bake/detailField.node.js';
import { c8BasisMeshBounds, compileC8BasisStages } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixture } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { parseRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

const PILOT_SCHEMA = 'toonlab/legacy-480-c7-pilot';
const PILOT_VERSION = 1;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const SELECTED = Object.freeze([
  { id: 'rock-0001', geology: 'weathered-limestone', role: 'weathered-fragment', basisFamily: 'bedded-karst-limestone', basisSeedIndex: 0 },
  { id: 'rock-0287', geology: 'weathered-limestone', role: 'broad-wall', basisFamily: 'bedded-karst-limestone', basisSeedIndex: 1 },
  { id: 'rock-0002', geology: 'blocky-granite', role: 'rounded-boulder', basisFamily: 'jointed-exfoliating-granite', basisSeedIndex: 0 },
  { id: 'rock-0200', geology: 'blocky-granite', role: 'fractured-block', basisFamily: 'jointed-exfoliating-granite', basisSeedIndex: 1 },
  { id: 'rock-0005', geology: 'layered-sandstone', role: 'layered-slab', basisFamily: 'cross-bedded-sandstone', basisSeedIndex: 0 },
  { id: 'rock-0358', geology: 'layered-sandstone', role: 'hoodoo', basisFamily: 'cross-bedded-sandstone', basisSeedIndex: 1 },
  { id: 'rock-0018', geology: 'alpine-granite', role: 'rounded-boulder', basisFamily: 'jointed-exfoliating-granite', basisSeedIndex: 0 },
  { id: 'rock-0298', geology: 'alpine-granite', role: 'cliff-termination', basisFamily: 'jointed-exfoliating-granite', basisSeedIndex: 1 },
  { id: 'rock-0362', geology: 'columnar-basalt', role: 'column-field', basisFamily: 'columnar-entablature-basalt', basisSeedIndex: 0 },
  { id: 'rock-0450', geology: 'columnar-basalt', role: 'column-kit', basisFamily: 'columnar-entablature-basalt', basisSeedIndex: 1 },
  { id: 'rock-0360', geology: 'sharp-karst', role: 'spire', basisFamily: 'bedded-karst-limestone', basisSeedIndex: 0 },
  { id: 'rock-0364', geology: 'sharp-karst', role: 'natural-arch', basisFamily: 'bedded-karst-limestone', basisSeedIndex: 1 },
]);

function parseArguments(argv) {
  const options = {
    atlasResolution: 256,
    denseResolution: 52,
    renderResolution: 44,
    filter: null,
    prepareOnly: false,
    outputDirectory: path.resolve('artifacts/research/rock-geology-v2/legacy-480-c7-pilot-v0.1'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--atlas-resolution') options.atlasResolution = Number(argv[++index]);
    else if (argument === '--dense-resolution') options.denseResolution = Number(argv[++index]);
    else if (argument === '--render-resolution') options.renderResolution = Number(argv[++index]);
    else if (argument === '--filter') options.filter = new RegExp(argv[++index] ?? '');
    else if (argument === '--output-dir') options.outputDirectory = path.resolve(argv[++index] ?? '');
    else if (argument === '--prepare-only') options.prepareOnly = true;
    else throw new RangeError(`Unknown argument: ${argument}`);
  }
  for (const [label, value] of Object.entries({
    atlasResolution: options.atlasResolution,
    denseResolution: options.denseResolution,
    renderResolution: options.renderResolution,
  })) {
    if (!Number.isInteger(value) || value < 24) throw new RangeError(`${label} must be an integer >= 24.`);
  }
  return options;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function repositoryPath(file) {
  return path.relative(path.resolve('.'), file).split(path.sep).join('/');
}

function parseLegacyCatalog(sql) {
  const assetBlocks = [...sql.matchAll(/\(\n\s*'(rock-\d{4})',[\s\S]*?\n\)/g)].slice(0, 480);
  const assets = new Map();
  for (const match of assetBlocks) {
    const block = match[0];
    const name = block.match(/'model',\s*'([^']*)'/)?.[1];
    const metadataText = block.match(/array\[[^\n]*\]::text\[],\s*'(\{.*\})'::jsonb,/)?.[1];
    const downloadUrl = block.match(/'(https:\/\/assets\.toonlab\.io\/official\/2026-08\/rock-\d{4}\/rock\.glb)'/)?.[1];
    if (!name || !metadataText || !downloadUrl) continue;
    const metadata = JSON.parse(metadataText.replaceAll("''", "'"));
    assets.set(match[1], { downloadUrl, id: match[1], metadata, name });
  }
  const filePattern = /\(\n\s*'(rock-\d{4})',\s*'rock\.glb',\s*'primary',[\s\S]*?\n\s*'https:\/\/assets\.toonlab\.io\/official\/2026-08\/rock-\d{4}\/rock\.glb',\s*'([a-f0-9]{64})',\s*(\d+),/g;
  for (const match of sql.matchAll(filePattern)) {
    const asset = assets.get(match[1]);
    if (asset) Object.assign(asset, { expectedBytes: Number(match[3]), expectedSha256: match[2] });
  }
  return assets;
}

function parseGlb(bytes, label) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${label}: invalid GLB magic.`);
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${label}: invalid GLB header.`);
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error(`${label}: GLB chunk exceeds file bounds.`);
    if (type === JSON_CHUNK) json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/[\0 ]+$/u, ''));
    if (type === BIN_CHUNK) binary = bytes.subarray(start, end);
    offset = end;
  }
  if (!json || !binary) throw new Error(`${label}: expected embedded JSON and BIN chunks.`);
  return { binary, json };
}

function encodeGlb(json, binary) {
  const jsonSource = Buffer.from(JSON.stringify(json));
  const jsonPadding = (4 - jsonSource.length % 4) % 4;
  const jsonChunk = Buffer.concat([jsonSource, Buffer.alloc(jsonPadding, 0x20)]);
  const binaryPadding = (4 - binary.length % 4) % 4;
  const binaryChunk = Buffer.concat([binary, Buffer.alloc(binaryPadding)]);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binaryChunk.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binaryChunk.length, binaryHeader);
  output.writeUInt32LE(BIN_CHUNK, binaryHeader + 4);
  binaryChunk.copy(output, binaryHeader + 8);
  return output;
}

function geometryOnlyGlb(bytes, label) {
  const { binary, json } = parseGlb(bytes, label);
  const document = structuredClone(json);
  delete document.images;
  delete document.materials;
  delete document.samplers;
  delete document.textures;
  document.extensionsUsed = (document.extensionsUsed ?? []).filter((value) => value !== 'KHR_texture_basisu');
  document.extensionsRequired = (document.extensionsRequired ?? []).filter((value) => value !== 'KHR_texture_basisu');
  if (document.extensionsUsed.length === 0) delete document.extensionsUsed;
  if (document.extensionsRequired.length === 0) delete document.extensionsRequired;
  for (const mesh of document.meshes ?? []) for (const primitive of mesh.primitives ?? []) delete primitive.material;
  return encodeGlb(document, binary);
}

function embeddedImages(bytes, label) {
  const { binary, json } = parseGlb(bytes, label);
  return (json.images ?? []).map((image, index) => {
    if (!Number.isInteger(image.bufferView)) throw new Error(`${label}: image ${index} is not embedded.`);
    const view = json.bufferViews?.[image.bufferView];
    if (!view || view.buffer !== 0) throw new Error(`${label}: image ${index} has an invalid bufferView.`);
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    const data = binary.subarray(start, end);
    const extension = image.mimeType === 'image/ktx2' ? 'ktx2'
      : image.mimeType === 'image/png' ? 'png'
        : image.mimeType === 'image/jpeg' ? 'jpg'
          : 'bin';
    return { data, extension, index, mimeType: image.mimeType ?? 'application/octet-stream', name: image.name ?? null };
  });
}

async function parseGeometry(bytes, label) {
  const loader = new GLTFLoader();
  const geometryBytes = geometryOnlyGlb(bytes, label);
  const arrayBuffer = geometryBytes.buffer.slice(geometryBytes.byteOffset, geometryBytes.byteOffset + geometryBytes.byteLength);
  const gltf = await new Promise((resolve, reject) => loader.parse(arrayBuffer, '', resolve, reject));
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.geometry?.getAttribute('position')) return;
    meshes.push({
      mesh: object,
      triangles: Math.floor((object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3),
    });
  });
  if (meshes.length === 0) throw new Error(`${label}: no triangle mesh found.`);
  meshes.sort((left, right) => right.triangles - left.triangles || left.mesh.name.localeCompare(right.mesh.name));
  let geometry = meshes[0].mesh.geometry.clone();
  geometry.applyMatrix4(meshes[0].mesh.matrixWorld);
  if (!geometry.index) {
    const indices = Array.from({ length: geometry.getAttribute('position').count }, (_, index) => index);
    geometry.setIndex(indices);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    sourceMesh: {
      meshCount: meshes.length,
      name: meshes[0].mesh.name || null,
      triangles: meshes[0].triangles,
      vertices: geometry.getAttribute('position').count,
    },
  };
}

function signedVolume(geometry) {
  const positions = geometry.getAttribute('position');
  const indices = geometry.index;
  let volume = 0;
  for (let face = 0; face < indices.count; face += 3) {
    const a = indices.getX(face);
    const b = indices.getX(face + 1);
    const c = indices.getX(face + 2);
    const ax = positions.getX(a); const ay = positions.getY(a); const az = positions.getZ(a);
    const bx = positions.getX(b); const by = positions.getY(b); const bz = positions.getZ(b);
    const cx = positions.getX(c); const cy = positions.getY(c); const cz = positions.getZ(c);
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function smoothGroove(value, period, width) {
  const distance = Math.abs((((value / period) % 1) + 1.5) % 1 - 0.5) * period;
  const normalized = Math.max(0, 1 - distance / Math.max(width, 1e-6));
  return normalized * normalized * (3 - 2 * normalized);
}

function createMeshControlField(geometry, selection, sourceSha256) {
  const bvh = new MeshBVH(geometry, { maxLeafTris: 8 });
  const positions = geometry.getAttribute('position');
  const indices = geometry.index;
  const orientation = signedVolume(geometry) >= 0 ? 1 : -1;
  const faceNormals = new Float32Array(indices.count);
  for (let face = 0; face < indices.count; face += 3) {
    const a = indices.getX(face);
    const b = indices.getX(face + 1);
    const c = indices.getX(face + 2);
    const abx = positions.getX(b) - positions.getX(a);
    const aby = positions.getY(b) - positions.getY(a);
    const abz = positions.getZ(b) - positions.getZ(a);
    const acx = positions.getX(c) - positions.getX(a);
    const acy = positions.getY(c) - positions.getY(a);
    const acz = positions.getZ(c) - positions.getZ(a);
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const inverseLength = orientation / Math.max(Math.hypot(nx, ny, nz), 1e-12);
    faceNormals[face] = nx * inverseLength;
    faceNormals[face + 1] = ny * inverseLength;
    faceNormals[face + 2] = nz * inverseLength;
  }
  const bounds = geometry.boundingBox.clone();
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = Math.max(size.x, size.y, size.z, 1e-6);
  const point = new THREE.Vector3();
  const closest = { point: new THREE.Vector3() };
  const parityRays = [
    new THREE.Vector3(0.739, 0.421, 0.526),
    new THREE.Vector3(-0.317, 0.811, 0.493),
    new THREE.Vector3(0.287, -0.438, 0.852),
  ].map((direction) => new THREE.Ray(point, direction.normalize()));

  function evaluateExact(x, y, z) {
    point.set(x, y, z);
    const hit = bvh.closestPointToPoint(point, closest);
    if (!hit) return scale;
    const face = hit.faceIndex * 3;
    const dx = x - hit.point.x;
    const dy = y - hit.point.y;
    const dz = z - hit.point.z;
    let side = dx * faceNormals[face] + dy * faceNormals[face + 1] + dz * faceNormals[face + 2] >= 0 ? 1 : -1;
    const insideBounds = bounds.containsPoint(point);
    if (insideBounds) {
      let insideVotes = 0;
      for (const parityRay of parityRays) {
        parityRay.origin.copy(point);
        const intersections = bvh.raycast(parityRay, THREE.DoubleSide, scale * 1e-7, Infinity);
        let distinctHits = 0;
        let previousDistance = -Infinity;
        for (const intersection of intersections.sort((left, right) => left.distance - right.distance)) {
          if (intersection.distance - previousDistance <= scale * 1e-6) continue;
          distinctHits += 1;
          previousDistance = intersection.distance;
        }
        if (distinctHits % 2 === 1) insideVotes += 1;
      }
      side = insideVotes >= 2 ? -1 : 1;
    }
    return hit.distance * side;
  }

  // Sample the discontinuous polygonal closest-surface query once, then use a
  // deterministic trilinear scalar volume for every C7 extraction and cage
  // query. This is the legacy-control equivalent of a bounded voxel remesh:
  // it removes triangle-edge sign discontinuities without smoothing away the
  // source silhouette beyond the explicitly recorded voxel size.
  const gridResolution = 72;
  const gridMargin = scale * 0.12;
  const gridMin = new THREE.Vector3(
    bounds.min.x - gridMargin,
    bounds.min.y - gridMargin,
    bounds.min.z - gridMargin,
  );
  const gridMax = new THREE.Vector3(
    bounds.max.x + gridMargin,
    bounds.max.y + gridMargin,
    bounds.max.z + gridMargin,
  );
  const gridSpan = gridMax.clone().sub(gridMin);
  const gridCellSize = Math.max(gridSpan.x, gridSpan.y, gridSpan.z) / gridResolution;
  const gridCells = [gridSpan.x, gridSpan.y, gridSpan.z].map((span) => Math.max(2, Math.ceil(span / gridCellSize)));
  const gridPoints = gridCells.map((value) => value + 1);
  const gridValues = new Float32Array(gridPoints[0] * gridPoints[1] * gridPoints[2]);
  let gridWrite = 0;
  for (let z = 0; z < gridPoints[2]; z += 1) for (let y = 0; y < gridPoints[1]; y += 1) for (let x = 0; x < gridPoints[0]; x += 1) {
    gridValues[gridWrite++] = evaluateExact(
      gridMin.x + x * gridCellSize,
      gridMin.y + y * gridCellSize,
      gridMin.z + z * gridCellSize,
    );
  }

  function evaluate(x, y, z) {
    const coordinates = [x - gridMin.x, y - gridMin.y, z - gridMin.z].map((value) => value / gridCellSize);
    if (coordinates.some((value, axis) => value < 0 || value > gridCells[axis])) return evaluateExact(x, y, z);
    const lower = coordinates.map((value, axis) => Math.min(Math.floor(value), gridCells[axis] - 1));
    const fraction = coordinates.map((value, axis) => Math.max(0, Math.min(1, value - lower[axis])));
    const index = (ix, iy, iz) => ix + iy * gridPoints[0] + iz * gridPoints[0] * gridPoints[1];
    const sampleGrid = (ix, iy, iz) => gridValues[index(ix, iy, iz)];
    const x00 = sampleGrid(lower[0], lower[1], lower[2]) * (1 - fraction[0]) + sampleGrid(lower[0] + 1, lower[1], lower[2]) * fraction[0];
    const x10 = sampleGrid(lower[0], lower[1] + 1, lower[2]) * (1 - fraction[0]) + sampleGrid(lower[0] + 1, lower[1] + 1, lower[2]) * fraction[0];
    const x01 = sampleGrid(lower[0], lower[1], lower[2] + 1) * (1 - fraction[0]) + sampleGrid(lower[0] + 1, lower[1], lower[2] + 1) * fraction[0];
    const x11 = sampleGrid(lower[0], lower[1] + 1, lower[2] + 1) * (1 - fraction[0]) + sampleGrid(lower[0] + 1, lower[1] + 1, lower[2] + 1) * fraction[0];
    const y0 = x00 * (1 - fraction[1]) + x10 * fraction[1];
    const y1 = x01 * (1 - fraction[1]) + x11 * fraction[1];
    return y0 * (1 - fraction[2]) + y1 * fraction[2];
  }

  function surfaceSemantics(worldPoint) {
    const x = worldPoint[0] - center.x;
    const y = worldPoint[1] - center.y;
    const z = worldPoint[2] - center.z;
    const semantics = { bedding: 0, clast: 0, clastEdge: 0, cleavage: 0, coolingFracture: 0, foliation: 0, joint: 0 };
    if (selection.basisFamily === 'jointed-exfoliating-granite') {
      semantics.joint = Math.max(
        smoothGroove(x + z * 0.13, scale * 0.31, scale * 0.025),
        smoothGroove(y - x * 0.08, scale * 0.39, scale * 0.025),
      );
    } else if (selection.basisFamily === 'cross-bedded-sandstone') {
      semantics.bedding = Math.sin((y + x * 0.28 + z * 0.07) / (scale * 0.065) * Math.PI * 2) * 0.5 + 0.5;
    } else if (selection.basisFamily === 'columnar-entablature-basalt') {
      semantics.coolingFracture = Math.max(
        smoothGroove(x + y * 0.44, scale * 0.17, scale * 0.022),
        smoothGroove(z - y * 0.37, scale * 0.19, scale * 0.022),
      );
    } else if (selection.basisFamily === 'bedded-karst-limestone') {
      semantics.bedding = Math.sin((y + x * 0.08) / (scale * 0.11) * Math.PI * 2) * 0.5 + 0.5;
      semantics.joint = smoothGroove(x + z * 0.18, scale * 0.27, scale * 0.02);
    }
    return semantics;
  }

  function sample(worldPoint) {
    const semantics = surfaceSemantics(worldPoint);
    const height = Math.max(0, Math.min(1, (worldPoint[1] - bounds.min.y) / Math.max(size.y, 1e-6)));
    const fracture = Math.max(semantics.joint, semantics.coolingFracture, semantics.bedding * 0.28);
    return {
      damageNormalized: Math.min(1, 0.28 + fracture * 0.46),
      environment: {
        exposure: 0.34 + height * 0.48,
        fabricWeakness: semantics.bedding * 0.64,
        fractureInfluence: fracture,
        materialWeakness: selection.geology.includes('limestone') || selection.geology.includes('karst') ? 0.58 : 0.34,
      },
      signedDistanceMetres: evaluate(...worldPoint),
    };
  }

  return Object.freeze({
    descriptor: Object.freeze({
      familyId: selection.basisFamily,
      fieldContentId: sha256(Buffer.from(JSON.stringify({ sourceSha256, selection, version: PILOT_VERSION }))),
      gridCellSizeMetres: gridCellSize,
      gridResolution,
      kind: 'legacy-lod0-signed-distance-control',
      variantId: selection.role,
    }),
    evaluate,
    sample,
    surfaceSemantics,
  });
}

function expandedBounds(box) {
  const size = box.getSize(new THREE.Vector3());
  const margin = Math.max(size.x, size.y, size.z) * 0.09;
  return {
    max: [box.max.x + margin, box.max.y + margin, box.max.z + margin],
    min: [box.min.x - margin, box.min.y - margin, box.min.z - margin],
  };
}

function meshToObj(mesh, name) {
  const lines = [`o ${name}`];
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    lines.push(`v ${mesh.positions[vertex * 3]} ${mesh.positions[vertex * 3 + 1]} ${mesh.positions[vertex * 3 + 2]}`);
  }
  if (mesh.uvs) for (let vertex = 0; vertex < mesh.uvs.length / 2; vertex += 1) {
    lines.push(`vt ${mesh.uvs[vertex * 2]} ${mesh.uvs[vertex * 2 + 1]}`);
  }
  if (mesh.normals) for (let vertex = 0; vertex < mesh.normals.length / 3; vertex += 1) {
    lines.push(`vn ${mesh.normals[vertex * 3]} ${mesh.normals[vertex * 3 + 1]} ${mesh.normals[vertex * 3 + 2]}`);
  }
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const faceIndices = [mesh.indices[face * 3], mesh.indices[face * 3 + 1], mesh.indices[face * 3 + 2]];
    lines.push(`f ${faceIndices.map((index) => {
      const one = index + 1;
      if (mesh.uvs && mesh.normals) return `${one}/${one}/${one}`;
      if (mesh.normals) return `${one}//${one}`;
      return one;
    }).join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function pilotRecipe(selection, asset, catalog) {
  const base = createC8BasisFixture(selection.basisFamily, 'production', selection.basisSeedIndex, { catalog });
  const dimensions = asset.metadata.dimensionsMeters;
  const target = [dimensions.width, dimensions.height, dimensions.depth];
  const scaleFactor = Math.max(...target) / Math.max(...base.recipe.targetDimensionsMetres);
  const recipe = structuredClone(base.recipe);
  if (recipe.depositionalHistory) {
    recipe.depositionalHistory.bedding.minimumThicknessMetres *= scaleFactor;
    recipe.depositionalHistory.bedding.meanThicknessMetres *= scaleFactor;
    recipe.depositionalHistory.bedding.maximumThicknessMetres *= scaleFactor;
  }
  if (recipe.metamorphicFabric) recipe.metamorphicFabric.spacingMetres *= scaleFactor;
  for (const set of recipe.fractureHistory.sets) {
    set.spacingMetres *= scaleFactor;
    set.persistenceMetres *= scaleFactor;
    set.apertureMetres *= scaleFactor;
    set.roughnessMetres *= scaleFactor;
    set.sizeDistribution.minimumMetres *= scaleFactor;
    set.sizeDistribution.meanMetres *= scaleFactor;
    set.sizeDistribution.maximumMetres *= scaleFactor;
  }
  recipe.id = `legacy-c7-${asset.id}`;
  recipe.label = `Legacy C7 pilot — ${asset.name}`;
  recipe.description = `C7-method review derivative from immutable legacy asset ${asset.id}; not an admitted geology authority.`;
  recipe.seed = asset.metadata.recipe.generator.seed;
  recipe.targetDimensionsMetres = target;
  if (Math.max(...target) < 5) {
    // The v2 ontology does not permit miniature cliffs, tors, column fields,
    // or karst spires. The immutable legacy mesh still controls the actual
    // silhouette; this recipe declaration selects the valid detached-prop
    // process envelope for C7 scale policy and surface baking.
    recipe.landform = 'boulder';
    recipe.scale = 'prop';
    recipe.processContext.collapseStage = null;
    recipe.processContext.detached = true;
    recipe.processContext.stability = { mode: 'not-required', passed: false };
  }
  const parsed = parseRockRecipe(recipe, { catalog }).recipe;
  return { ...base, recipe: parsed, scaleFactor, selection };
}

async function preserveOriginal(asset, assetDirectory) {
  const originalDirectory = path.join(assetDirectory, 'original');
  const textureDirectory = path.join(originalDirectory, 'embedded-textures');
  const originalFile = path.join(originalDirectory, 'rock.glb');
  await mkdir(textureDirectory, { recursive: true });
  const local = path.resolve(`public/catalog/rocks/${asset.id}/rock.glb`);
  let bytes;
  try {
    bytes = await readFile(originalFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    try {
      bytes = await readFile(local);
      await copyFile(local, originalFile);
    } catch (localError) {
      if (localError?.code !== 'ENOENT') throw localError;
      const response = await fetch(asset.downloadUrl);
      if (!response.ok) throw new Error(`${asset.id}: download failed with HTTP ${response.status}.`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(originalFile, bytes);
    }
  }
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== asset.expectedSha256) throw new Error(`${asset.id}: GLB hash mismatch (${actualSha256}).`);
  if (bytes.length !== asset.expectedBytes) throw new Error(`${asset.id}: GLB byte count mismatch (${bytes.length}).`);
  const images = [];
  for (const image of embeddedImages(bytes, asset.id)) {
    const filename = `${String(image.index).padStart(2, '0')}-${image.name ?? `image-${image.index}`}.${image.extension}`;
    await writeFile(path.join(textureDirectory, filename), image.data);
    images.push({
      bytes: image.data.length,
      file: `original/embedded-textures/${filename}`,
      index: image.index,
      mimeType: image.mimeType,
      name: image.name,
      sha256: sha256(image.data),
    });
  }
  const manifest = {
    assetId: asset.id,
    bytes: bytes.length,
    catalogExpectedSha256: asset.expectedSha256,
    immutable: true,
    images,
    originalFile: 'original/rock.glb',
    sha256: actualSha256,
    texturePolicy: 'exact embedded bytes retained; no transcoding or recompression',
  };
  await writeFile(path.join(originalDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { bytes, manifest, originalFile };
}

async function compileAsset(selection, asset, preserved, assetDirectory, options, catalog) {
  const c7Directory = path.join(assetDirectory, 'c7');
  const meshDirectory = path.join(c7Directory, 'meshes');
  const textureDirectory = path.join(c7Directory, 'textures');
  await mkdir(meshDirectory, { recursive: true });
  await mkdir(textureDirectory, { recursive: true });
  const parsed = await parseGeometry(preserved.bytes, asset.id);
  const fixture = pilotRecipe(selection, asset, catalog);
  const stages = compileC8BasisStages(fixture, { catalog });
  const productionField = createMeshControlField(parsed.geometry, selection, preserved.manifest.sha256);
  let detailField = createDenseDetailField(fixture.recipe, productionField, {
    amplitudeMetres: Math.max(...fixture.recipe.targetDimensionsMetres) * 0.0032,
    seed: fixture.recipe.seed,
  });
  const selectedAtlasResolution = selection.basisFamily === 'columnar-entablature-basalt'
    ? Math.max(options.atlasResolution, 1024)
    : options.atlasResolution;
  const compile = (field, fieldKind, bounds) => compileRockBakeV2({
    recipe: fixture.recipe,
    structuralProgram: stages.structuralProgram,
    fractureStage: stages.fractureStage,
    processStage: stages.processStage,
  }, {
    atlasResolution: selectedAtlasResolution,
    bounds,
    collisionResolution: 18,
    denseResolution: options.denseResolution,
    detailField,
    fallbackResolutions: [36, 30, 24],
    fieldContentId: field.descriptor.fieldContentId,
    fieldKind,
    gutterTexels: 8,
    includeSelfIntersections: true,
    orientMeshesToField: true,
    productionField: field,
    renderResolution: options.renderResolution,
  });
  let bundle;
  let controlAuthority = 'immutable legacy LOD0 geometry';
  let legacyControlFailure = null;
  try {
    bundle = compile(productionField, productionField.descriptor.kind, expandedBounds(parsed.geometry.boundingBox));
  } catch (error) {
    legacyControlFailure = { message: error?.message ?? String(error), name: error?.name ?? 'Error' };
    controlAuthority = 'matched C8 geology basis reconstruction; legacy silhouette compile failed';
    detailField = createDenseDetailField(fixture.recipe, stages.basisField, {
      amplitudeMetres: Math.max(...fixture.recipe.targetDimensionsMetres) * 0.0032,
      seed: fixture.recipe.seed,
    });
    bundle = compile(stages.basisField, 'c8-basis-reconstruction-fallback', c8BasisMeshBounds(fixture));
  }
  const meshFiles = {};
  for (const [role, mesh] of Object.entries({ ...bundle.assets, 'render-mesh-uv': bundle.atlas.mesh })) {
    const filename = `${role}.obj`;
    await writeFile(path.join(meshDirectory, filename), meshToObj(mesh, `${asset.id}-${role}`));
    meshFiles[role] = `c7/meshes/${filename}`;
  }
  const textureFiles = {};
  for (const [id, page] of Object.entries(bundle.bake.pages)) {
    const filename = `${id}.png`;
    const data = encodeRgbaPng(page.width, page.height, page.data);
    await writeFile(path.join(textureDirectory, filename), data);
    textureFiles[id] = { bytes: data.length, file: `c7/textures/${filename}`, sha256: sha256(data) };
  }
  const report = {
    assetId: asset.id,
    c7Compiler: bundle.report.compiler,
    compilerPassed: bundle.report.passed,
    compilerReport: bundle.report,
    controlAuthority,
    fieldContentId: bundle.report.sourceField.contentId,
    meshFiles,
    methodStatus: 'C7-method legacy modernization preview; not production or geology admission',
    originalSha256: preserved.manifest.sha256,
    legacyControlFailure,
    signature: rockBakeBundleSignature(bundle),
    sourceMesh: parsed.sourceMesh,
    textureFiles,
  };
  await writeFile(path.join(c7Directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  parsed.geometry.dispose();
  return report;
}

const options = parseArguments(process.argv.slice(2));
const sql = await readFile('database/seeds/catalog/0002_2026-08.sql', 'utf8');
const assets = parseLegacyCatalog(sql);
const selected = SELECTED.filter((entry) => !options.filter || options.filter.test(`${entry.geology}/${entry.id}/${entry.role}`));
if (selected.length === 0) throw new Error('No pilot assets matched the requested filter.');
await mkdir(options.outputDirectory, { recursive: true });
const catalog = loadGeologyCatalog();
const results = [];

for (const selection of selected) {
  const asset = assets.get(selection.id);
  if (!asset?.expectedSha256 || !asset?.expectedBytes) throw new Error(`${selection.id}: incomplete legacy catalog integrity metadata.`);
  if (asset.metadata.taxonomy.geology !== selection.geology) throw new Error(`${selection.id}: geology selection drifted from catalog metadata.`);
  const assetDirectory = path.join(options.outputDirectory, selection.id);
  await mkdir(assetDirectory, { recursive: true });
  console.log(`${selection.id}: preserving original (${selection.geology}/${selection.role})`);
  try {
    const preserved = await preserveOriginal(asset, assetDirectory);
    let c7 = null;
    if (!options.prepareOnly) {
      console.log(`${selection.id}: compiling C7 preview`);
      c7 = await compileAsset(selection, asset, preserved, assetDirectory, options, catalog);
    }
    results.push({
      asset: {
        dimensionsMetres: asset.metadata.dimensionsMeters,
        familyId: asset.metadata.familyId,
        geology: asset.metadata.taxonomy.geology,
        id: asset.id,
        name: asset.name,
        role: selection.role,
        scaleClass: asset.metadata.taxonomy.scaleClass,
      },
      basisFamily: selection.basisFamily,
      c7,
      original: preserved.manifest,
      passed: options.prepareOnly ? true : Boolean(c7),
    });
  } catch (error) {
    const structuredError = error?.toJSON?.() ?? { message: error?.message ?? String(error), name: error?.name ?? 'Error' };
    console.error(`${selection.id}: ${JSON.stringify(structuredError, null, 2)}`);
    results.push({ asset: { id: selection.id, geology: selection.geology, role: selection.role }, error: structuredError, passed: false });
  }
}

const summary = {
  schema: PILOT_SCHEMA,
  version: PILOT_VERSION,
  generatedAt: new Date().toISOString(),
  outputDirectory: repositoryPath(options.outputDirectory),
  policy: {
    geologyClaim: false,
    massRolloutAuthorized: false,
    originalsImmutable: true,
    texturePreservation: 'all original GLBs and embedded images retained byte-for-byte',
    visualApprovalRequired: true,
  },
  settings: {
    atlasResolution: options.atlasResolution,
    denseResolution: options.denseResolution,
    prepareOnly: options.prepareOnly,
    renderResolution: options.renderResolution,
  },
  counts: {
    failed: results.filter((entry) => !entry.passed).length,
    families: new Set(results.map((entry) => entry.asset.geology)).size,
    selected: results.length,
    succeeded: results.filter((entry) => entry.passed).length,
  },
  passed: results.length === selected.length && results.every((entry) => entry.passed),
  results,
};
await writeFile(path.join(options.outputDirectory, options.prepareOnly ? 'preparation.json' : 'pilot-report.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ counts: summary.counts, passed: summary.passed }, null, 2));
if (!summary.passed) process.exitCode = 1;
