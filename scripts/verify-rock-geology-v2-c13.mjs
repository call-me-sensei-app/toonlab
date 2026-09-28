#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  ROCK_SHADER_DOCUMENT_TYPE,
  ROCK_SHADER_FIELD_SCHEMA,
  ROCK_SHADER_SCHEMA_VERSION,
  createRockShaderPresetDocument,
  createRockShaderSettings,
  inspectRockRegionBinding,
  parseRockShaderPresetDocument,
} from '../src/rock-shader/index.js';
import { createCatalogLodRuntime } from '../src/catalog/officialCatalogLod.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import {
  MemoryContentAddressedCache,
  ROCK_COMPILER_STAGES,
  executeRockCompilationPlan,
  planRockCompilation,
} from '../src/rockgen/experimental/geology-v2/stageGraph.node.js';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BINARY = 0x004e4942;
const GLB_VERSION = 2;
const REGION_ATTRIBUTE = '_TL_ROCK_REGION';
const REGION_BINDING_KEY = 'toonlabRockRegionBinding';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock',
);
const runtimeRoot = path.join(sourceRoot, 'v31-scan-assisted-runtime-package');
const exportRoot = path.join(runtimeRoot, 'exports');
const regionRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/semantic-regions',
);
const outputRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-13-regression/hoodoo-caprock',
);
const visualManifestFile = path.join(outputRoot, 'visual-captures/manifest.json');

const EXPECTED_ASSETS = Object.freeze([
  Object.freeze({
    id: 'lod0', file: 'hoodoo-caprock-lod0-desktop-4k.glb', triangles: 180_000,
    sha256: 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e',
    dimensions: [1.999083221, 2.130162954, 3.20006077], textures: 3,
  }),
  Object.freeze({
    id: 'lod1', file: 'hoodoo-caprock-lod1-mobile-near-2k.glb', triangles: 60_000,
    sha256: '32a4a24f4967080964031e179ce1741a0cbebb6d794ae8df4e56f24ea9cecd09',
    dimensions: [1.999687195, 2.130674839, 3.199749231], textures: 3,
  }),
  Object.freeze({
    id: 'lod2', file: 'hoodoo-caprock-lod2-mobile-mid-1k.glb', triangles: 20_000,
    sha256: '5e09de7b855f0d13509e4628ea705f03b86220fc6c0026d3186ab1dee8d0c7fa',
    dimensions: [1.998211086, 2.128360987, 3.201056356], textures: 3,
  }),
  Object.freeze({
    id: 'lod3', file: 'hoodoo-caprock-lod3-mobile-far-1k.glb', triangles: 6_000,
    sha256: '1b29256626e579779dd9f45e7cc4833c18934eac27cfdc351c1b7cc16a399e55',
    dimensions: [2.000410259, 2.133708715, 3.197211344], textures: 3,
  }),
  Object.freeze({
    id: 'collision', file: 'hoodoo-caprock-collision.glb', triangles: 500,
    sha256: '5a9bb48d296e482342e45ceb0bf5fb4a0bc98ff575c52ba7ec3b987d565d0f9d',
    dimensions: null, textures: 0,
  }),
]);
const EXPECTED_REGION_HASHES = Object.freeze({
  lod0: '3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012',
  lod1: 'b991e9599347803738a98d0b70ce5118ae2caa90ab27c77b2267b0fd9c9754d8',
  lod2: 'be77620486492c980e152b4c56aa91081dc9680d351c14f57fd938fbb39c1968',
  lod3: '5e7c878205167b8d4e090c659189e8c8232b99d32fb5624f64ee89b5e9ac8af0',
});
const REGION_FILES = Object.freeze({
  lod0: 'hoodoo-caprock-lod0-desktop-4k-regions.glb',
  lod1: 'hoodoo-caprock-lod1-mobile-near-2k-regions.glb',
  lod2: 'hoodoo-caprock-lod2-mobile-mid-1k-regions.glb',
  lod3: 'hoodoo-caprock-lod3-mobile-far-1k-regions.glb',
});

const checks = [];
const failures = [];
function check(id, passed, evidence = null) {
  const record = { id, passed: Boolean(passed), evidence };
  checks.push(record);
  if (!record.passed) failures.push(record);
  return record.passed;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function parseGlb(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 20) throw new Error('GLB is truncated.');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('GLB magic is invalid.');
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error('Only GLB 2.0 is supported.');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared length does not match bytes.');
  let json = null;
  let binary = null;
  let chunks = 0;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error('GLB chunk header is truncated.');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error('GLB chunk exceeds file bounds.');
    if (chunks === 0 && type !== GLB_JSON) throw new Error('First GLB chunk must be JSON.');
    if (type === GLB_JSON) {
      if (json) throw new Error('GLB has multiple JSON chunks.');
      json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/[\0 ]+$/u, ''));
    } else if (type === GLB_BINARY) {
      if (binary) throw new Error('GLB has multiple binary chunks.');
      binary = bytes.subarray(start, end);
    } else {
      throw new Error(`Unsupported GLB chunk type ${type}.`);
    }
    chunks += 1;
    offset = end;
  }
  if (!json || !binary || chunks !== 2) throw new Error('GLB requires exactly one JSON and one binary chunk.');
  if (json.asset?.version !== '2.0') throw new Error('glTF asset version must be 2.0.');
  if (json.buffers?.length !== 1 || json.buffers[0]?.uri) throw new Error('GLB requires one embedded buffer.');
  const declaredBinaryBytes = json.buffers[0].byteLength;
  if (!Number.isInteger(declaredBinaryBytes)
    || declaredBinaryBytes < 0
    || declaredBinaryBytes > binary.length
    || binary.length - declaredBinaryBytes > 3) {
    throw new Error('Embedded binary buffer length is invalid.');
  }
  return { json, binary, declaredBinaryBytes };
}

function encodeGlb(json, binary) {
  const rawJson = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonBytes = Buffer.alloc((rawJson.length + 3) & ~3, 0x20);
  rawJson.copy(jsonBytes);
  const binaryBytes = Buffer.alloc((binary.length + 3) & ~3);
  binary.copy(binaryBytes);
  const output = Buffer.alloc(12 + 8 + jsonBytes.length + 8 + binaryBytes.length);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonBytes.length, 12);
  output.writeUInt32LE(GLB_JSON, 16);
  jsonBytes.copy(output, 20);
  const binaryHeader = 20 + jsonBytes.length;
  output.writeUInt32LE(binaryBytes.length, binaryHeader);
  output.writeUInt32LE(GLB_BINARY, binaryHeader + 4);
  binaryBytes.copy(output, binaryHeader + 8);
  return output;
}

function accessorByteLength(accessor) {
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor?.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor?.componentType];
  if (!components || !bytes || !Number.isInteger(accessor?.count) || accessor.count < 1) {
    throw new Error('Accessor shape is unsupported.');
  }
  return accessor.count * components * bytes;
}

function validateAccessor(json, binary, accessorIndex, label) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || accessor.sparse) throw new Error(`${label} accessor is absent or sparse.`);
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0) throw new Error(`${label} must reference embedded buffer 0.`);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const packedLength = accessorByteLength(accessor);
  const stride = view.byteStride ?? (packedLength / accessor.count);
  const itemBytes = packedLength / accessor.count;
  const end = offset + ((accessor.count - 1) * stride) + itemBytes;
  if (offset < 0 || end > binary.length || end > (view.byteOffset ?? 0) + view.byteLength) {
    throw new Error(`${label} accessor exceeds its buffer view.`);
  }
  return { accessor, view, offset, stride, itemBytes };
}

function validateRockGlb(parsed, expected) {
  const { json, binary } = parsed;
  const primitives = [];
  for (const node of json.nodes ?? []) {
    if (!Number.isInteger(node.mesh)) continue;
    const mesh = json.meshes?.[node.mesh];
    if (!mesh?.primitives?.length) throw new Error('Mesh node has no primitives.');
    primitives.push(...mesh.primitives);
  }
  if (primitives.length !== 1) throw new Error(`Expected one visual primitive, found ${primitives.length}.`);
  const primitive = primitives[0];
  const position = validateAccessor(json, binary, primitive.attributes?.POSITION, 'POSITION').accessor;
  if (position.componentType !== 5126 || position.type !== 'VEC3') throw new Error('POSITION must be FLOAT VEC3.');
  for (const attribute of expected.id === 'collision' ? ['POSITION', 'NORMAL'] : ['POSITION', 'NORMAL', 'TEXCOORD_0', 'TANGENT']) {
    if (!Number.isInteger(primitive.attributes?.[attribute])) throw new Error(`Missing ${attribute}.`);
    validateAccessor(json, binary, primitive.attributes[attribute], attribute);
  }
  const index = validateAccessor(json, binary, primitive.indices, 'indices').accessor;
  if (index.type !== 'SCALAR' || index.count % 3 !== 0) throw new Error('Triangle index accessor is invalid.');
  const triangles = index.count / 3;
  if (triangles !== expected.triangles) throw new Error(`Triangle count ${triangles} != ${expected.triangles}.`);
  const embeddedImages = (json.images ?? []).filter((image) => Number.isInteger(image.bufferView) && !image.uri).length;
  if (embeddedImages !== expected.textures || (json.images ?? []).some((image) => image.uri)) {
    throw new Error(`Embedded texture count ${embeddedImages} != ${expected.textures}.`);
  }
  let dimensions = null;
  if (expected.dimensions) {
    if (!Array.isArray(position.min) || !Array.isArray(position.max)) throw new Error('POSITION bounds are missing.');
    dimensions = [
      position.max[0] - position.min[0],
      position.max[2] - position.min[2],
      position.max[1] - position.min[1],
    ];
    dimensions.forEach((value, indexValue) => {
      if (Math.abs(value - expected.dimensions[indexValue]) > 0.001) {
        throw new Error(`Dimension ${indexValue} drifted: ${value}.`);
      }
    });
  }
  return { triangles, embeddedImages, dimensions, vertices: position.count };
}

function validateRegionGlb(parsed) {
  const { json, binary } = parsed;
  let vertices = 0;
  let neckSamples = 0;
  let meshes = 0;
  for (const node of json.nodes ?? []) {
    if (!Number.isInteger(node.mesh)) continue;
    const binding = node.extras?.[REGION_BINDING_KEY];
    if (binding?.schema !== 'toonlab.rock-region-binding'
      || binding?.version !== 1
      || binding?.profile !== 'hoodoo-caprock-normalized-height-v1'
      || binding?.attribute !== REGION_ATTRIBUTE
      || binding?.encoding !== 'unorm8'
      || binding?.space !== 'mesh-local-normalized-height'
      || binding?.failClosed !== true
      || JSON.stringify(binding?.channels) !== JSON.stringify(['base', 'shaft', 'neck', 'cap'])
      || JSON.stringify(binding?.bands) !== JSON.stringify({
        base: [0.12, 0.3], cap: [0.72, 0.86], neckEnter: [0.6, 0.7], neckExit: [0.8, 0.89],
      })) {
      throw new Error('Rock-region binding metadata is invalid.');
    }
    const primitives = json.meshes?.[node.mesh]?.primitives;
    if (!Array.isArray(primitives) || primitives.length !== 1) throw new Error('Region mesh must have one primitive.');
    const primitive = primitives[0];
    const positionRecord = validateAccessor(json, binary, primitive.attributes?.POSITION, 'POSITION');
    const position = positionRecord.accessor;
    if (position.componentType !== 5126 || position.type !== 'VEC3') throw new Error('POSITION must be FLOAT VEC3.');
    const regionRecord = validateAccessor(json, binary, primitive.attributes?.[REGION_ATTRIBUTE], REGION_ATTRIBUTE);
    const region = regionRecord.accessor;
    if (region.componentType !== 5121 || region.type !== 'VEC4' || region.normalized !== true) {
      throw new Error('Region accessor must be normalized UNSIGNED_BYTE VEC4.');
    }
    if (region.count !== position.count || regionRecord.stride !== 4) throw new Error('Region accessor count or stride is invalid.');
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const heights = Array.from({ length: position.count }, (_, index) => (
      view.getFloat32(positionRecord.offset + index * positionRecord.stride + 4, true)
    ));
    let minimumHeight = Number.POSITIVE_INFINITY;
    let maximumHeight = Number.NEGATIVE_INFINITY;
    for (const height of heights) {
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
    }
    const heightRange = maximumHeight - minimumHeight;
    if (!(heightRange > 1e-8)) throw new Error('Region mesh height range is invalid.');
    const smoothstep = (edge0, edge1, value) => {
      const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
      return t * t * (3 - (2 * t));
    };
    for (let index = 0; index < region.count; index += 1) {
      const offset = regionRecord.offset + index * 4;
      const base = binary[offset];
      const shaft = binary[offset + 1];
      const neck = binary[offset + 2];
      const cap = binary[offset + 3];
      if (base + shaft + cap !== 255) throw new Error('Region primary partition is invalid.');
      if (neck > 0) neckSamples += 1;
      const normalizedHeight = (heights[index] - minimumHeight) / heightRange;
      const expectedBase = Math.round((1 - smoothstep(0.12, 0.30, normalizedHeight)) * 255);
      const expectedCap = Math.round(smoothstep(0.72, 0.86, normalizedHeight) * 255);
      const expectedNeck = Math.round(
        smoothstep(0.60, 0.70, normalizedHeight)
          * (1 - smoothstep(0.80, 0.89, normalizedHeight)) * 255,
      );
      if (base !== expectedBase || shaft !== 255 - expectedBase - expectedCap
        || neck !== expectedNeck || cap !== expectedCap) {
        throw new Error('Region bytes do not match the immutable hoodoo compiler profile.');
      }
    }
    vertices += region.count;
    meshes += 1;
  }
  if (meshes !== 1 || vertices < 1 || neckSamples < 1) throw new Error('Region coverage is incomplete.');
  return { meshes, vertices, neckSamples };
}

async function expectFailure(id, action, pattern) {
  let error = null;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  const passed = Boolean(error) && (!pattern || pattern.test(`${error.code ?? ''} ${error.message}`));
  check(id, passed, error ? { name: error.name, code: error.code ?? null, message: error.message } : null);
  return { id, passed, error: error ? { name: error.name, code: error.code ?? null, message: error.message } : null };
}

function classifyScale(scale, context) {
  if (!Array.isArray(scale) || scale.length !== 3 || !scale.every(Number.isFinite)) {
    return { valid: false, action: 'reject', reason: 'scale-must-be-three-finite-components' };
  }
  if (scale.some((value) => value <= 0)) {
    return { valid: false, action: 'reject', reason: 'zero-negative-and-mirrored-scale-unsupported' };
  }
  const minimum = Math.min(...scale);
  const maximum = Math.max(...scale);
  const anisotropy = maximum / minimum;
  const rebakeRequired = minimum <= 0.5 || maximum >= 2 || anisotropy > 1.2 + Number.EPSILON;
  return {
    valid: true,
    minimum,
    maximum,
    anisotropy,
    rebakeRequired,
    context,
    action: rebakeRequired
      ? (context === 'toonlab-editor' ? 'auto-rebake' : 'allow-transform-quality-not-guaranteed-no-rebake')
      : 'runtime-transform-safe-envelope',
  };
}

function makeRegionMesh({
  bindingOverride = null,
  componentArray = Uint8Array,
  count = 6,
  includeAttribute = true,
  includeBinding = true,
  itemSize = 4,
  normalized = true,
  partitionInvalid = false,
  withNeck = true,
} = {}) {
  const geometry = new THREE.BufferGeometry();
  const normalizedHeights = [0, 0.2, 0.5, 0.7, 0.76, 1];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    normalizedHeights.flatMap((height) => [0, height * 2.4, 0]), 3,
  ));
  const smoothstep = (edge0, edge1, value) => {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - (2 * t));
  };
  const source = normalizedHeights.flatMap((height, index) => {
    const base = Math.round((1 - smoothstep(0.12, 0.30, height)) * 255);
    const cap = Math.round(smoothstep(0.72, 0.86, height) * 255);
    const neck = Math.round(
      smoothstep(0.60, 0.70, height) * (1 - smoothstep(0.80, 0.89, height)) * 255,
    );
    return [index === 0 && partitionInvalid ? base - 1 : base, 255 - base - cap, withNeck ? neck : 0, cap];
  });
  if (includeAttribute) {
    geometry.setAttribute('_tl_rock_region', new THREE.BufferAttribute(
      new componentArray(source.slice(0, count * itemSize)), itemSize, normalized,
    ));
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  if (includeBinding) {
    mesh.userData[REGION_BINDING_KEY] = {
      schema: 'toonlab.rock-region-binding', version: 1, attribute: REGION_ATTRIBUTE,
      encoding: 'unorm8', channels: ['base', 'shaft', 'neck', 'cap'],
      space: 'mesh-local-normalized-height', failClosed: true,
      profile: 'hoodoo-caprock-normalized-height-v1',
      bands: {
        base: [0.12, 0.30], cap: [0.72, 0.86],
        neckEnter: [0.60, 0.70], neckExit: [0.80, 0.89],
      },
      ...(bindingOverride ?? {}),
    };
  }
  return mesh;
}

await mkdir(outputRoot, { recursive: true });

// Immutable source asset and authored bake/LOD gates.
const protectedBefore = [];
const sourceBytesById = new Map();
for (const expected of EXPECTED_ASSETS) {
  const file = path.join(exportRoot, expected.file);
  const bytes = await readFile(file);
  const digest = sha256(bytes);
  sourceBytesById.set(expected.id, bytes);
  const parsed = parseGlb(bytes);
  const audit = validateRockGlb(parsed, expected);
  protectedBefore.push({ id: expected.id, file, bytes: bytes.length, sha256: digest });
  check(`asset.${expected.id}.immutable-hash`, digest === expected.sha256, { expected: expected.sha256, actual: digest });
  check(`asset.${expected.id}.structure`, true, audit);
}

const silhouetteFile = path.join(sourceRoot, 'v31-runtime-lods/silhouette-audit.json');
const residualFile = path.join(sourceRoot, 'v31-signed-residual-2048/signed-geometric-residual-audit.json');
const pbrFile = path.join(sourceRoot, 'v31-scan-assisted-bake-4096/pbr-map-audit.json');
const [silhouette, residual, pbr] = await Promise.all(
  [silhouetteFile, residualFile, pbrFile].map((file) => readFile(file, 'utf8').then(JSON.parse)),
);
const silhouetteThresholds = { lod0: 0.995, lod1: 0.990, lod2: 0.980, lod3: 0.960 };
for (const [lod, threshold] of Object.entries(silhouetteThresholds)) {
  check(`silhouette.${lod}`, silhouette.minimumIou?.[lod] >= threshold, {
    minimum: silhouette.minimumIou?.[lod], threshold,
  });
}
check('bake.projection-miss', residual.coverage?.projectionMissFraction <= 0.001, {
  actual: residual.coverage?.projectionMissFraction, maximum: 0.001,
});
check('bake.no-clipped-texels', residual.encoding?.clippedTexels === 0, residual.encoding);
check('bake.independent-pbr-map-audit', pbr.passed === true, pbr.checks);

// Semantic GLBs and corrupt binding/accessor matrix.
const regionRecords = [];
for (const [id, fileName] of Object.entries(REGION_FILES)) {
  const file = path.join(regionRoot, fileName);
  const bytes = await readFile(file);
  const digest = sha256(bytes);
  const audit = validateRegionGlb(parseGlb(bytes));
  regionRecords.push({ id, file, bytes: bytes.length, sha256: digest, ...audit });
  protectedBefore.push({ id: `region-${id}`, file, bytes: bytes.length, sha256: digest });
  check(`region.${id}.immutable-hash`, digest === EXPECTED_REGION_HASHES[id], {
    expected: EXPECTED_REGION_HASHES[id], actual: digest,
  });
  check(`region.${id}.structure`, true, audit);
}

const corruptInputMatrix = [];
const canonicalBytes = sourceBytesById.get('lod0');
const canonicalParsed = parseGlb(canonicalBytes);
for (const fixture of [
  ['glb.bad-magic', () => { const value = Buffer.from(canonicalBytes); value.writeUInt32LE(0, 0); return parseGlb(value); }, /magic/],
  ['glb.bad-version', () => { const value = Buffer.from(canonicalBytes); value.writeUInt32LE(1, 4); return parseGlb(value); }, /2\.0/],
  ['glb.bad-length', () => { const value = Buffer.from(canonicalBytes); value.writeUInt32LE(value.length - 1, 8); return parseGlb(value); }, /length/],
  ['glb.truncated', () => parseGlb(canonicalBytes.subarray(0, canonicalBytes.length - 8)), /length|bounds|truncated/],
  ['glb.invalid-json', () => { const value = Buffer.from(canonicalBytes); value[20] = 0xff; return parseGlb(value); }, /JSON|Unexpected/],
  ['glb.binary-overrun', () => {
    const json = structuredClone(canonicalParsed.json);
    json.buffers[0].byteLength = canonicalParsed.binary.length + 4;
    return parseGlb(encodeGlb(json, canonicalParsed.binary));
  }, /buffer length/],
  ['glb.position-component', () => {
    const json = structuredClone(canonicalParsed.json);
    json.accessors[json.meshes[0].primitives[0].attributes.POSITION].componentType = 5123;
    return validateRockGlb(parseGlb(encodeGlb(json, canonicalParsed.binary)), EXPECTED_ASSETS[0]);
  }, /POSITION/],
  ['glb.external-image', () => {
    const json = structuredClone(canonicalParsed.json);
    json.images[0] = { uri: 'drift.png' };
    return validateRockGlb(parseGlb(encodeGlb(json, canonicalParsed.binary)), EXPECTED_ASSETS[0]);
  }, /texture/],
]) {
  const record = await expectFailure(fixture[0], fixture[1], fixture[2]);
  corruptInputMatrix.push(record);
}

const regionBytes = await readFile(path.join(regionRoot, REGION_FILES.lod0));
const regionParsed = parseGlb(regionBytes);
for (const fixture of [
  ['region-glb.binding-version', (json) => { json.nodes[0].extras[REGION_BINDING_KEY].version = 99; }, /binding metadata/],
  ['region-glb.channel-order', (json) => { json.nodes[0].extras[REGION_BINDING_KEY].channels = ['base', 'neck', 'shaft', 'cap']; }, /binding metadata/],
  ['region-glb.accessor-type', (json) => {
    const accessor = json.meshes[0].primitives[0].attributes[REGION_ATTRIBUTE];
    json.accessors[accessor].componentType = 5123;
  }, /normalized UNSIGNED_BYTE|buffer view/],
  ['region-glb.accessor-normalized', (json) => {
    const accessor = json.meshes[0].primitives[0].attributes[REGION_ATTRIBUTE];
    json.accessors[accessor].normalized = false;
  }, /normalized UNSIGNED_BYTE/],
  ['region-glb.accessor-count', (json) => {
    const accessor = json.meshes[0].primitives[0].attributes[REGION_ATTRIBUTE];
    json.accessors[accessor].count -= 1;
  }, /count or stride/],
]) {
  const record = await expectFailure(fixture[0], () => {
    const json = structuredClone(regionParsed.json);
    fixture[1](json);
    return validateRegionGlb(parseGlb(encodeGlb(json, regionParsed.binary)));
  }, fixture[2]);
  corruptInputMatrix.push(record);
}
const compilerByteRecord = await expectFailure('region-glb.compiler-byte-mismatch', () => {
  const json = structuredClone(regionParsed.json);
  const binary = Buffer.from(regionParsed.binary);
  const primitive = json.meshes[0].primitives[0];
  const regionAccessor = json.accessors[primitive.attributes[REGION_ATTRIBUTE]];
  const regionView = json.bufferViews[regionAccessor.bufferView];
  const offset = (regionView.byteOffset ?? 0) + (regionAccessor.byteOffset ?? 0);
  let changed = false;
  for (let index = 0; index < regionAccessor.count && !changed; index += 1) {
    const vertex = offset + index * 4;
    if (binary[vertex] > 0) {
      binary[vertex] -= 1;
      binary[vertex + 1] += 1;
      changed = true;
    } else if (binary[vertex + 3] > 0) {
      binary[vertex + 3] -= 1;
      binary[vertex + 1] += 1;
      changed = true;
    }
  }
  if (!changed) throw new Error('Corrupt fixture could not find a primary region byte.');
  return validateRegionGlb(parseGlb(encodeGlb(json, binary)));
}, /immutable hoodoo compiler profile/);
corruptInputMatrix.push(compilerByteRecord);

for (const fixture of [
  ['region-runtime.missing-binding', makeRegionMesh({ includeBinding: false }), /missing/],
  ['region-runtime.wrong-schema', makeRegionMesh({ bindingOverride: { schema: 'wrong' } }), /schema/],
  ['region-runtime.wrong-version', makeRegionMesh({ bindingOverride: { version: 2 } }), /version/],
  ['region-runtime.wrong-channels', makeRegionMesh({ bindingOverride: { channels: ['base', 'neck', 'shaft', 'cap'] } }), /channel order/],
  ['region-runtime.missing-attribute', makeRegionMesh({ includeAttribute: false }), /attribute/],
  ['region-runtime.wrong-storage', makeRegionMesh({ componentArray: Float32Array }), /UNSIGNED_BYTE/],
  ['region-runtime.wrong-item-size', makeRegionMesh({ itemSize: 3 }), /VEC4/],
  ['region-runtime.wrong-count', makeRegionMesh({ count: 5 }), /counts differ/],
  ['region-runtime.not-normalized', makeRegionMesh({ normalized: false }), /must be normalized/],
  ['region-runtime.partition-invalid', makeRegionMesh({ partitionInvalid: true }), /must equal one/],
  ['region-runtime.no-neck', makeRegionMesh({ withNeck: false }), /neck overlay/],
]) {
  const record = await expectFailure(fixture[0], () => inspectRockRegionBinding(fixture[1]), fixture[2]);
  corruptInputMatrix.push(record);
  fixture[1].geometry.dispose();
  fixture[1].material.dispose();
}

// Scale and rebake policy: the transform is legal outside ToonLab, but quality
// is not promised beyond the proven envelope because no external rebake runs.
const scaleCases = [
  { id: 'uniform-050', scale: [0.5, 0.5, 0.5], rebake: true },
  { id: 'uniform-075', scale: [0.75, 0.75, 0.75], rebake: false },
  { id: 'uniform-100', scale: [1, 1, 1], rebake: false },
  { id: 'uniform-150', scale: [1.5, 1.5, 1.5], rebake: false },
  { id: 'uniform-200', scale: [2, 2, 2], rebake: true },
  { id: 'anisotropic-120', scale: [1.2, 1, 1], rebake: false },
  { id: 'anisotropic-121', scale: [1.21, 1, 1], rebake: true },
  { id: 'anisotropic-200', scale: [1.5, 0.75, 1], rebake: true },
  { id: 'anisotropic-400', scale: [2, 0.5, 1], rebake: true },
];
const scaleMatrix = [];
for (const fixture of scaleCases) {
  const editor = classifyScale(fixture.scale, 'toonlab-editor');
  const external = classifyScale(fixture.scale, 'external-scene');
  const passed = editor.valid && external.valid
    && editor.rebakeRequired === fixture.rebake
    && external.rebakeRequired === fixture.rebake
    && (!fixture.rebake || (editor.action === 'auto-rebake'
      && external.action === 'allow-transform-quality-not-guaranteed-no-rebake'));
  check(`scale.${fixture.id}`, passed, { fixture, editor, external });
  scaleMatrix.push({ ...fixture, editor, external, passed });
}
for (const fixture of [
  { id: 'zero', scale: [1, 0, 1] },
  { id: 'negative', scale: [1, -1, 1] },
  { id: 'mirror', scale: [-1, 1, 1] },
  { id: 'nan', scale: [1, Number.NaN, 1] },
]) {
  const result = classifyScale(fixture.scale, 'toonlab-editor');
  const passed = result.valid === false && result.action === 'reject';
  check(`scale.invalid-${fixture.id}`, passed, result);
  scaleMatrix.push({ ...fixture, result, passed });
}

// Portable shader schema bounds, clamps, defaults, and invalid documents.
let styleFieldCases = 0;
const neutralSettings = createRockShaderSettings({ preset: 'neutral' });
for (const [groupId, fields] of Object.entries(ROCK_SHADER_FIELD_SCHEMA)) {
  for (const [fieldId, metadata] of Object.entries(fields)) {
    const baseline = neutralSettings[groupId][fieldId];
    const invalidFallback = metadata.defaultValue;
    if (metadata.type === 'number') {
      const minimum = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: metadata.range.min } });
      const maximum = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: metadata.range.max } });
      const below = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: metadata.range.min - 10_000 } });
      const above = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: metadata.range.max + 10_000 } });
      const invalid = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: 'not-a-number' } });
      check(`style.${groupId}.${fieldId}`, minimum[groupId][fieldId] === metadata.range.min
        && maximum[groupId][fieldId] === metadata.range.max
        && below[groupId][fieldId] === metadata.range.min
        && above[groupId][fieldId] === metadata.range.max
        && invalid[groupId][fieldId] === invalidFallback,
      { min: minimum[groupId][fieldId], max: maximum[groupId][fieldId], baseline, invalidFallback });
    } else if (metadata.type === 'boolean') {
      const invalid = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: 'true' } });
      const toggled = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: !baseline } });
      check(`style.${groupId}.${fieldId}`, invalid[groupId][fieldId] === invalidFallback
        && toggled[groupId][fieldId] === !baseline, { baseline });
    } else if (metadata.type === 'select') {
      const invalid = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: '__invalid__' } });
      const optionsPass = metadata.options.every((option) => (
        createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: option } })[groupId][fieldId] === option
      ));
      check(`style.${groupId}.${fieldId}`, invalid[groupId][fieldId] === invalidFallback && optionsPass, { baseline });
    } else if (metadata.type === 'color') {
      const clamped = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: [-1, 0.5, 2] } });
      const invalid = createRockShaderSettings({ preset: 'neutral', [groupId]: { [fieldId]: [0, 'bad', 1] } });
      check(`style.${groupId}.${fieldId}`, JSON.stringify(clamped[groupId][fieldId]) === '[0,0.5,1]'
        && JSON.stringify(invalid[groupId][fieldId]) === JSON.stringify(invalidFallback), { baseline, invalidFallback });
    }
    styleFieldCases += 1;
  }
}
const validStyleDocument = createRockShaderPresetDocument('c13-hoodoo', { label: 'C13 Hoodoo' });
check('style.document-valid', parseRockShaderPresetDocument(validStyleDocument).ok === true);
for (const [id, input] of [
  ['invalid-json', '{'],
  ['wrong-schema', { ...validStyleDocument, schema: 'wrong' }],
  ['future-version', { ...validStyleDocument, version: ROCK_SHADER_SCHEMA_VERSION + 1 }],
  ['missing-label', { ...validStyleDocument, label: '' }],
  ['missing-settings', { ...validStyleDocument, settings: null }],
]) {
  const result = parseRockShaderPresetDocument(input);
  check(`style.document-${id}`, result.ok === false && result.errors.length > 0, result.errors);
}
check('style.document-schema-identity', validStyleDocument.schema === ROCK_SHADER_DOCUMENT_TYPE);

// Cancellation must never publish an in-flight result or execute later stages.
const catalog = loadGeologyCatalog();
const recipe = createHeroRockRecipe('quartz-arenite', { catalog, seed: 13_013 });
const plan = planRockCompilation(recipe, { catalog });
const executorResult = ({ stage }) => ({ stageId: stage.id, contentId: stage.stageContentId });
const defaultExecutors = Object.fromEntries(ROCK_COMPILER_STAGES.map((stage) => [stage.id, executorResult]));

const preAborted = new AbortController();
preAborted.abort(new Error('pre-aborted fixture'));
let preCalls = 0;
const preCache = new MemoryContentAddressedCache();
const preExecutors = Object.fromEntries(ROCK_COMPILER_STAGES.map((stage) => [stage.id, () => { preCalls += 1; return {}; }]));
await expectFailure('compiler.cancel-pre-aborted', () => executeRockCompilationPlan(plan, preExecutors, {
  cache: preCache, signal: preAborted.signal,
}), /COMPILATION_CANCELLED/);
check('compiler.cancel-pre-aborted-no-work', preCalls === 0 && preCache.size === 0, { preCalls, cache: preCache.size });

const midController = new AbortController();
const midCache = new MemoryContentAddressedCache();
let midCalls = 0;
const midExecutors = { ...defaultExecutors };
midExecutors['structure-field'] = async ({ signal }) => {
  midCalls += 1;
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ partial: true }), { once: true });
    queueMicrotask(() => midController.abort(new Error('mid-stage fixture')));
  });
};
await expectFailure('compiler.cancel-mid-stage', () => executeRockCompilationPlan(plan, midExecutors, {
  cache: midCache, signal: midController.signal,
}), /COMPILATION_CANCELLED/);
check('compiler.cancel-mid-stage-no-partial-cache', midCalls === 1 && midCache.size === 0, {
  midCalls, cache: midCache.size,
});

const cachedController = new AbortController();
const cachedCache = new MemoryContentAddressedCache();
cachedCache.put(plan.stages[0].stageContentId, { admitted: true });
let cachedCalls = 0;
const cachedExecutors = { ...defaultExecutors };
cachedExecutors['fracture-network'] = async ({ signal }) => {
  cachedCalls += 1;
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ partial: true }), { once: true });
    queueMicrotask(() => cachedController.abort());
  });
};
await expectFailure('compiler.cancel-after-cache-hit', () => executeRockCompilationPlan(plan, cachedExecutors, {
  cache: cachedCache, signal: cachedController.signal,
}), /COMPILATION_CANCELLED/);
check('compiler.cancel-after-cache-hit-preserves-only-admitted-cache', cachedCalls === 1 && cachedCache.size === 1, {
  cachedCalls, cache: cachedCache.size,
});
await expectFailure('compiler.reject-invalid-signal', () => executeRockCompilationPlan(plan, defaultExecutors, {
  signal: { aborted: false },
}), /AbortSignal/);

// Stateful hysteresis and synthetic long-scene load. This is CPU/runtime
// correctness evidence only; mobile GPU budgets remain a full-checkpoint gate.
function makeLodRoot() {
  const root = new THREE.Group();
  for (let level = 0; level < 3; level += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = `hoodoo_LOD${level}_mesh`;
    root.add(mesh);
  }
  return root;
}

const hysteresisRoot = makeLodRoot();
const hysteresisRuntime = createCatalogLodRuntime(hysteresisRoot, {
  distances: [0, 45, 120], hysteresis: 0.1,
});
const firstBoundary = Array.from({ length: 100 }, (_, index) => (
  hysteresisRuntime.update({ distance: index % 2 ? 45.1 : 44.9 }).level
));
const upOne = hysteresisRuntime.update({ distance: 49.51 }).level;
const secondBoundary = Array.from({ length: 100 }, (_, index) => (
  hysteresisRuntime.update({ distance: index % 2 ? 45.1 : 44.9 }).level
));
const downOne = hysteresisRuntime.update({ distance: 40.49 }).level;
const upTwo = hysteresisRuntime.update({ distance: 132.01 }).level;
const downTwo = hysteresisRuntime.update({ distance: 107.99 }).level;
check('lod.hysteresis-100-cycle-first-boundary', firstBoundary.every((level) => level === 0));
check('lod.hysteresis-up-one', upOne === 1, { upOne });
check('lod.hysteresis-100-cycle-second-boundary', secondBoundary.every((level) => level === 1));
check('lod.hysteresis-down-one', downOne === 0, { downOne });
check('lod.hysteresis-up-two', upTwo === 2, { upTwo });
check('lod.hysteresis-down-two', downTwo === 1, { downTwo });
hysteresisRuntime.dispose();
hysteresisRoot.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });

const longScene = [];
for (const count of [1, 16, 64, 256]) {
  const roots = Array.from({ length: count }, makeLodRoot);
  const runtimes = roots.map((root) => createCatalogLodRuntime(root, {
    distances: [0, 45, 120], hysteresis: 0.1,
  }));
  const started = performance.now();
  for (let cycle = 0; cycle < 100; cycle += 1) {
    const distance = [0, 44.9, 45.1, 49.51, 119.9, 120.1, 132.01, 107.99][cycle % 8];
    for (const runtime of runtimes) runtime.update({ distance });
  }
  const milliseconds = performance.now() - started;
  const oneVisiblePerRoot = roots.every((root) => root.children.filter((child) => child.visible).length === 1);
  runtimes.forEach((runtime) => runtime.dispose());
  const restorePassed = roots.every((root) => root.children.every((child) => child.visible));
  roots.forEach((root) => root.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); }));
  const record = { count, updates: count * 100, milliseconds, oneVisiblePerRoot, restorePassed };
  longScene.push(record);
  check(`lod.long-scene-${count}`, oneVisiblePerRoot && restorePassed, record);
}

const protectedAfter = [];
for (const before of protectedBefore) {
  const bytes = await readFile(before.file);
  protectedAfter.push({ ...before, bytes: bytes.length, sha256: sha256(bytes) });
}
check('asset.protected-inputs-unchanged', protectedBefore.every((before, index) => (
  before.bytes === protectedAfter[index].bytes && before.sha256 === protectedAfter[index].sha256
)), { protectedBefore, protectedAfter });

let visualEvidence = null;
try {
  visualEvidence = JSON.parse(await readFile(visualManifestFile, 'utf8'));
  const boardBytes = await readFile(visualEvidence.comparisonBoard.file);
  check('visual.webgl2-six-capture-manifest', visualEvidence.passed === true
    && visualEvidence.actualBackend === 'webgl2-fallback'
    && visualEvidence.captures?.length === 6,
  { manifest: visualManifestFile, captures: visualEvidence.captures?.length });
  check('visual.lod-and-scale-modes', ['lods', 'scale'].every((mode) => (
    visualEvidence.captures.filter((capture) => capture.mode === mode).length === 3
  )), visualEvidence.captures.map(({ mode, view }) => ({ mode, view })));
  check('visual.comparison-board-current', sha256(boardBytes) === visualEvidence.comparisonBoard.sha256,
    visualEvidence.comparisonBoard);
  check('visual.protected-inputs-unchanged', visualEvidence.sourceMutationFailures?.length === 0,
    visualEvidence.sourceMutationFailures);
} catch (error) {
  check('visual.manifest-readable', false, { manifest: visualManifestFile, error: error.message });
}

const blockers = [
  'C9 formation-scale proof is parked until enough C8 assets exist.',
  'C10 full family rollout and the complete ~1,000-asset catalog are not available.',
  'Developer visual approval remains open for the representative hoodoo stylization.',
  'iOS, Android, Windows/DX12, packaged Unreal, and actual device GPU budgets were not exercised here.',
  'Long-scene coverage is a synthetic CPU LOD-state test, not a rendered mobile performance claim.',
  'Scale rebake is classified but no external scene can invoke ToonLab rebaking automatically.',
  'Full-family pathological seeds, chunk boundaries, cache/process interruption, and formation streaming remain deferred.',
];
const representativePassed = failures.length === 0;
const verification = canonicalize({
  schema: 'toonlab/rock-geology-v2-c13-representative-verification',
  version: 1,
  asset: 'hoodoo-caprock-claron-v31',
  status: representativePassed
    ? 'representative-c13-technical-slice-passed-full-checkpoint-open'
    : 'representative-c13-technical-slice-failed',
  representativeTechnicalPassed: representativePassed,
  fullCheckpointApproved: false,
  counts: {
    checks: checks.length,
    failures: failures.length,
    styleFields: styleFieldCases,
    corruptFixtures: corruptInputMatrix.length,
    scaleCases: scaleMatrix.length,
    protectedInputs: protectedBefore.length,
  },
  immutableAssetPackage: protectedBefore,
  silhouette: { thresholds: silhouetteThresholds, minimumIou: silhouette.minimumIou },
  bake: {
    projectionMissFraction: residual.coverage.projectionMissFraction,
    clippedTexels: residual.encoding.clippedTexels,
    pbrAuditPassed: pbr.passed,
  },
  regionRecords,
  scaleMatrix,
  corruptInputMatrix,
  lodStress: {
    thresholds: [0, 45, 120], hysteresisRatio: 0.1, boundaryCycles: 100, longScene,
  },
  visualEvidence: visualEvidence ? {
    manifest: visualManifestFile,
    passed: visualEvidence.passed,
    captures: visualEvidence.captures.length,
    comparisonBoard: visualEvidence.comparisonBoard,
  } : null,
  blockers,
  checks,
  failures,
});

await Promise.all([
  writeFile(path.join(outputRoot, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'scale-matrix.json'), `${JSON.stringify({
    schema: 'toonlab/rock-geology-v2-c13-scale-matrix', version: 1, cases: scaleMatrix,
  }, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'corrupt-input-matrix.json'), `${JSON.stringify({
    schema: 'toonlab/rock-geology-v2-c13-corrupt-input-matrix', version: 1,
    passed: corruptInputMatrix.every((record) => record.passed), cases: corruptInputMatrix,
  }, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'lod-stress.json'), `${JSON.stringify({
    schema: 'toonlab/rock-geology-v2-c13-lod-stress', version: 1,
    thresholds: [0, 45, 120], hysteresisRatio: 0.1, boundaryCycles: 100, longScene,
  }, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'checkpoint-status.json'), `${JSON.stringify({
    schema: 'toonlab/rock-geology-v2-checkpoint-status', version: 1, checkpoint: 'C13',
    representativeTechnicalPassed: representativePassed, fullCheckpointApproved: false, blockers,
  }, null, 2)}\n`),
  writeFile(path.join(outputRoot, 'commands.txt'), [
    'node scripts/verify-rock-geology-v2-c13.mjs',
    'node scripts/capture-rock-geology-v2-c13.mjs',
    'node scripts/verify-official-catalog-lod.mjs',
    'node scripts/verify-rock-geology-v2-contract.mjs',
  ].join('\n') + '\n'),
  writeFile(path.join(outputRoot, 'known-issues.md'), `# C13 representative hoodoo blockers\n\n${blockers.map((item) => `- ${item}`).join('\n')}\n`),
  writeFile(path.join(outputRoot, 'approval.md'), `# C13 approval\n\n- Representative hoodoo technical slice: ${representativePassed ? 'passed' : 'failed or pending evidence stabilization'}.\n- Full C13 checkpoint: not approved.\n- Developer approval: required after C9/C10, full family/platform qualification, and visual review.\n`),
  writeFile(path.join(outputRoot, 'README.md'), `# C13 representative hoodoo regression slice\n\nThis is a fail-closed technical regression slice over the admitted hoodoo package. It covers immutable GLBs, authored LOD/silhouette/bake gates, semantic-region corruption, scale/rebake policy, shader bounds, cancellation, hysteresis, and synthetic long-scene LOD state.\n\nRepresentative technical status: **${representativePassed ? 'passed' : 'failed'}**.\n\nFull C13 approval: **open**. C9/C10, the full family/seed/platform matrix, real mobile GPU qualification, and developer approval are still required.\n`),
]);

console.log(JSON.stringify({
  representativeTechnicalPassed: representativePassed,
  fullCheckpointApproved: false,
  checks: checks.length,
  failures: failures.length,
  outputRoot,
}, null, 2));
if (!representativePassed) process.exitCode = 1;
