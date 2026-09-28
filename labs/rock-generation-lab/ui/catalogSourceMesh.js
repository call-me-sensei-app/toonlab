import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as WebGPUTextureUtils from 'three/examples/jsm/utils/WebGPUTextureUtils.js';

import { computeVertexColors } from '../../../src/rockgen/mesh/meshAttributes.js';
import { simplifyRockGeometryToTriangleBudget } from '../../../src/rockgen/lod/rockLodSimplifier.js';
import { createNearestVertexLookup } from './nearestVertex.js';

const LOD_NAME = /(?:^|_)LOD(\d+)(?:$|_)/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const topologyCache = new WeakMap();
let meshoptSimplifierReady = false;
let solidKernel = null;
let solidKernelPromise = null;
const meshoptSimplifierReadyPromise = MeshoptSimplifier.ready.then(() => {
  meshoptSimplifierReady = true;
});

export async function whenCatalogTopologyReady() {
  await meshoptSimplifierReadyPromise;
  solidKernelPromise ??= (async () => {
    const { default: initialize } = await import('manifold-3d');
    const wasmUrl = typeof document === 'undefined' ? null
      : (await import('manifold-3d/manifold.wasm?url')).default;
    const config = wasmUrl ? { locateFile: () => wasmUrl } : {};
    solidKernel = await initialize(config);
    solidKernel.setup();
  })();
  await solidKernelPromise;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function mixSeed(seed, salt) {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function signed(seed, salt) {
  return (mixSeed(seed, salt) / 0xffffffff) * 2 - 1;
}

function smoothstep(min, max, value) {
  const amount = clamp((value - min) / Math.max(max - min, 1e-6), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function triangleCount(geometry) {
  return Math.floor((geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3);
}

function dimensionsObject(value) {
  const dimensions = Array.isArray(value)
    ? value.slice(0, 3).map(Number)
    : [value?.width, value?.height, value?.depth].map(Number);
  if (dimensions.length !== 3 || dimensions.some((entry) => !Number.isFinite(entry) || entry <= 0)) return null;
  return { depth: dimensions[2], height: dimensions[1], width: dimensions[0] };
}

export function isC8CustomMeshReference(reference) {
  const source = reference?.customMeshSource;
  return reference?.sourceMode === 'c8-custom-mesh'
    && source?.schema === 'toonlab/c8-custom-mesh-source'
    && Number(source.version) === 1
    && source.authority === 'toonlab-editable-control-plus-retained-high'
    && source.control?.role === 'editable-control'
    && source.highDetail?.role === 'retained-high-detail'
    && SHA256.test(source.control.contentHash ?? '')
    && SHA256.test(source.control.topologyHash ?? '')
    && SHA256.test(source.highDetail.contentHash ?? '')
    && SHA256.test(source.highDetail.topologyHash ?? '')
    && source.control.contentHash !== source.highDetail.contentHash
    && Number.isInteger(source.control.byteLength)
    && source.control.byteLength >= 20
    && typeof source.control.uri === 'string'
    && source.control.uri.toLowerCase().endsWith('.glb')
    && Number.isFinite(source.editEnvelope?.maximumDisplacementMetres)
    && source.editEnvelope.maximumDisplacementMetres > 0
    && Number.isFinite(source.editEnvelope?.maximumVariationStrength)
    && source.editEnvelope.maximumVariationStrength > 0
    && source.editEnvelope.maximumVariationStrength <= 1
    && Array.isArray(source.semanticRegions)
    && source.semanticRegions.length >= 3
    && Array.isArray(reference.identityLandmarks)
    && reference.identityLandmarks.length >= 3
    && Boolean(dimensionsObject(source.control.dimensionsMetres));
}

/** Resolve a saved C8 editor document without adding it to the released 480 registry. */
export function createC8CustomMeshCatalogEntry(reference) {
  if (!isC8CustomMeshReference(reference)) return null;
  const source = reference.customMeshSource;
  const control = source.control;
  const admissionManifest = {
    customMeshSource: source,
    identityLandmarks: reference.identityLandmarks,
    sourceId: reference.id,
    sourceRevision: reference.sourceRevision,
  };
  return Object.freeze({
    admissionManifestFingerprint: stableJsonValue(admissionManifest),
    customMeshSource: source,
    dimensionsMetres: Object.freeze(dimensionsObject(control.dimensionsMetres)),
    familyId: String(reference.family ?? reference.archetype ?? 'c8-custom-rock'),
    galleryId: null,
    geology: String(reference.geology ?? reference.surfacePackage?.geology ?? ''),
    id: String(reference.id),
    identityLandmarks: Object.freeze(structuredClone(reference.identityLandmarks ?? [])),
    label: String(reference.label ?? reference.id),
    maxVariationStrength: Math.min(
      Math.max(Number(source.editEnvelope?.maximumVariationStrength) || 0, 0),
      1,
    ),
    maxDisplacementMetres: Number(source.editEnvelope.maximumDisplacementMetres),
    modelUrl: control.uri,
    semanticRegions: source.semanticRegions,
    sourceContentHash: control.contentHash,
    sourceByteLength: control.byteLength,
    sourceMode: 'c8-custom-glb',
    sourceTopologyHash: control.topologyHash,
    retainedHighByteLength: source.highDetail.byteLength,
    retainedHighContentHash: source.highDetail.contentHash,
    retainedHighTopologyHash: source.highDetail.topologyHash,
    retainedHighUrl: source.highDetail.uri,
    sourceVersion: `c8-r${Math.max(1, Math.round(Number(reference.sourceRevision) || 1))}`,
    thumbnailUrl: String(reference.thumbnailUrl ?? ''),
    variationId: String(reference.id),
  });
}

export async function verifyC8GlbContentHash(bytes, expectedContentHash, expectedByteLength = null) {
  if (!SHA256.test(expectedContentHash ?? '')) throw new Error('C8 control GLB requires a lowercase sha256 content hash.');
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (expectedByteLength !== null
    && (!Number.isInteger(expectedByteLength) || view.byteLength !== expectedByteLength)) {
    throw new Error(`C8 control GLB byte length mismatch (expected ${expectedByteLength}, received ${view.byteLength}).`);
  }
  if (view.byteLength < 20 || String.fromCharCode(...view.subarray(0, 4)) !== 'glTF') {
    throw new Error('C8 control source is not a binary glTF container.');
  }
  const header = new DataView(view.buffer, view.byteOffset, view.byteLength);
  if (header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== view.byteLength) {
    throw new Error('C8 control GLB has an invalid version or declared length.');
  }
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification is unavailable in this browser.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', view));
  const actual = `sha256:${[...digest].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  if (actual !== expectedContentHash) {
    throw new Error(`C8 control GLB hash mismatch (expected ${expectedContentHash}, received ${actual}).`);
  }
  return Object.freeze({ byteLength: view.byteLength, contentHash: actual, passed: true });
}

function verifyC8GlbSelfContained(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const header = new DataView(view.buffer, view.byteOffset, view.byteLength);
  let offset = 12;
  let document = null;
  let binaryChunkCount = 0;
  while (offset + 8 <= view.byteLength) {
    const length = header.getUint32(offset, true);
    const type = header.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > view.byteLength) throw new Error('C8 GLB contains a truncated chunk.');
    const chunk = view.subarray(offset, offset + length);
    if (type === 0x4e4f534a) {
      if (document) throw new Error('C8 GLB contains more than one JSON chunk.');
      try {
        document = JSON.parse(new TextDecoder().decode(chunk).trim());
      } catch (error) {
        throw new Error(`C8 GLB JSON cannot be parsed: ${error.message}`);
      }
    } else if (type === 0x004e4942) {
      binaryChunkCount += 1;
    }
    offset += length;
  }
  if (offset !== view.byteLength || !document || binaryChunkCount !== 1) {
    throw new Error('C8 GLB requires one complete JSON chunk and one embedded BIN chunk.');
  }
  if (!Array.isArray(document.buffers) || document.buffers.length !== 1
    || document.buffers.some((buffer) => typeof buffer.uri === 'string')) {
    throw new Error('C8 GLB geometry must use exactly one embedded buffer.');
  }
  if ((document.images ?? []).some((image) => typeof image.uri === 'string')) {
    throw new Error('C8 GLB may not resolve external image resources outside its content hash.');
  }
  return document;
}

function c8TopologyBytes(positions, indices) {
  const bytes = new Uint8Array(16 + positions.length * 8 + indices.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x4338544d, true);
  view.setUint32(4, 1, true);
  view.setUint32(8, positions.length / 3, true);
  view.setUint32(12, indices.length / 3, true);
  let offset = 16;
  for (const value of positions) {
    view.setFloat64(offset, value, true);
    offset += 8;
  }
  for (const value of indices) {
    view.setUint32(offset, value, true);
    offset += 4;
  }
  return bytes;
}

async function sha256Browser(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification is unavailable in this browser.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...digest].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function assertC8Watertight(indices) {
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    if (new Set(triangle).size !== 3) throw new Error('C8 control GLB contains a degenerate triangle.');
    for (const [from, to] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const entry = edges.get(key) ?? { count: 0, direction: 0 };
      entry.count += 1;
      entry.direction += from < to ? 1 : -1;
      edges.set(key, entry);
    }
  }
  if ([...edges.values()].some((entry) => entry.count !== 2 || entry.direction !== 0)) {
    throw new Error('C8 control GLB must be watertight and consistently wound.');
  }
}

function assertC8MeasuredVector(actual, expected, label) {
  const scale = Math.max(...expected.map(Math.abs), 1);
  if (!actual.every((value, axis) => Math.abs(value - expected[axis]) <= Math.max(1e-5, scale * 1e-5))) {
    throw new Error(`${label} does not match the content-bound C8 manifest.`);
  }
}

/** Audit the parsed scene before it can become a live/editable editor source. */
export async function verifyC8ParsedControlScene(entry, scene, { artifactRole = 'control' } = {}) {
  if (entry?.sourceMode !== 'c8-custom-glb' || !scene) throw new Error('C8 parsed-scene audit requires a custom control entry and scene.');
  if (!['control', 'highDetail'].includes(artifactRole)) throw new Error('C8 parsed-scene audit received an unsupported artifact role.');
  const requiresSemantics = artifactRole === 'control';
  scene.updateWorldMatrix(true, true);
  const positions = [];
  const indices = [];
  const meshVertexCounts = [];
  const semanticValues = new Map();
  const point = new THREE.Vector3();
  const identityMatrix = new THREE.Matrix4();
  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    if (object.matrixWorld.determinant() <= 0) throw new Error('C8 control GLB may not use singular or mirrored mesh transforms.');
    if (!object.matrixWorld.elements.every((value, index) => (
      Math.abs(value - identityMatrix.elements[index]) <= 1e-9
    ))) {
      throw new Error('C8 authority mesh transforms must be applied before export so editor deltas remain world-metre aligned.');
    }
    const position = object.geometry.getAttribute('position');
    if (!position) throw new Error('C8 control mesh has no POSITION attribute.');
    meshVertexCounts.push(position.count);
    const vertexOffset = positions.length / 3;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      positions.push(point.x, point.y, point.z);
    }
    const index = object.geometry.index;
    const count = index?.count ?? position.count;
    if (count % 3 !== 0) throw new Error('C8 control mesh is not a triangle list.');
    const referencedVertices = new Set();
    for (let item = 0; item < count; item += 1) {
      const value = index ? index.getX(item) : item;
      if (!Number.isInteger(value) || value < 0 || value >= position.count) {
        throw new Error('C8 control mesh contains an out-of-range index.');
      }
      referencedVertices.add(value);
      indices.push(vertexOffset + value);
    }
    for (const region of requiresSemantics ? entry.semanticRegions : []) {
      const attributeName = region.selector.attribute.toLowerCase();
      const attribute = object.geometry.getAttribute(attributeName);
      if (!attribute || attribute.itemSize !== 1 || attribute.count !== position.count) continue;
      const values = semanticValues.get(region.selector.attribute) ?? new Set();
      for (const item of referencedVertices) values.add(attribute.getX(item));
      semanticValues.set(region.selector.attribute, values);
    }
  });
  if (positions.length === 0 || indices.length === 0) throw new Error('C8 control GLB contains no mesh geometry.');
  assertC8Watertight(indices);
  for (const region of requiresSemantics ? entry.semanticRegions : []) {
    if (!semanticValues.get(region.selector.attribute)?.has(region.selector.value)) {
      throw new Error(`C8 control GLB is missing ${region.selector.attribute}=${region.selector.value} for ${region.id}.`);
    }
  }
  const topologyHash = await sha256Browser(c8TopologyBytes(positions, indices));
  const expectedTopologyHash = artifactRole === 'control'
    ? entry.sourceTopologyHash
    : entry.retainedHighTopologyHash;
  if (topologyHash !== expectedTopologyHash) throw new Error(`C8 ${artifactRole} GLB topology hash does not match its manifest.`);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  const artifact = entry.customMeshSource[artifactRole];
  assertC8MeasuredVector(min, artifact.boundsMetres.min, 'C8 control minimum bounds');
  assertC8MeasuredVector(max, artifact.boundsMetres.max, 'C8 control maximum bounds');
  assertC8MeasuredVector(max.map((value, axis) => value - min[axis]), artifact.dimensionsMetres, 'C8 control dimensions');
  const audit = artifact.geometryAudit;
  if (!audit || audit.topologyHash !== topologyHash
    || audit.vertexCount !== positions.length / 3
    || audit.triangleCount !== indices.length / 3
    || audit.meshVertexCounts.length !== meshVertexCounts.length
    || audit.meshVertexCounts.some((value, index) => value !== meshVertexCounts[index])) {
    throw new Error('C8 decoded mesh ranges and topology counts do not match the content-bound geometry audit.');
  }
  return Object.freeze({
    boundsMetres: Object.freeze({ max: Object.freeze(max), min: Object.freeze(min) }),
    meshVertexCounts: Object.freeze(meshVertexCounts),
    passed: true,
    topologyHash,
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
  });
}

function materialsOf(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function cloneMaterial(material) {
  return material?.clone?.() ?? material;
}

function cloneMaterials(material) {
  return Array.isArray(material) ? material.map(cloneMaterial) : cloneMaterial(material);
}

function packedAttribute(attribute) {
  if (!attribute.isInterleavedBufferAttribute && !attribute.normalized) return Float32Array.from(attribute.array);
  const values = new Float32Array(attribute.count * attribute.itemSize);
  for (let index = 0; index < attribute.count; index += 1) {
    values[index * attribute.itemSize] = attribute.getX(index);
    if (attribute.itemSize > 1) values[(index * attribute.itemSize) + 1] = attribute.getY(index);
    if (attribute.itemSize > 2) values[(index * attribute.itemSize) + 2] = attribute.getZ(index);
    if (attribute.itemSize > 3) values[(index * attribute.itemSize) + 3] = attribute.getW(index);
  }
  return values;
}

function refreshEditedGeometry(geometry, { tangents = false } = {}) {
  const position = geometry.getAttribute('position');
  if (!position) return;
  position.needsUpdate = true;
  if (geometry.userData.toonlabFillPatches?.length) computeCutNormals(geometry);
  else { geometry.computeVertexNormals(); weldCatalogNormals(geometry); }
  if ((tangents || geometry.getAttribute('tangent'))
    && geometry.index && geometry.getAttribute('uv')) {
    try {
      geometry.computeTangents();
    } catch {
      // Keep the prior tangent buffer when degenerate source UV islands
      // prevent reconstruction; removing an active WebGPU vertex slot would
      // invalidate the material pipeline mid-frame.
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

// Boolean cuts contain long, thin triangles next to small wall triangles.
// Area-weighted normals make their shading depend on triangulation and create
// dark fan-shaped streaks. Corner-angle weighting is subdivision-independent.
function computeCutNormals(geometry) {
  const p = geometry.attributes.position, indices = geometry.index;
  const sum = new Float64Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), bc = new THREE.Vector3(), n = new THREE.Vector3();
  const count = indices?.count ?? p.count;
  for (let i = 0; i < count; i += 3) {
    const ai = indices ? indices.getX(i) : i, bi = indices ? indices.getX(i + 1) : i + 1, ci = indices ? indices.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, ai); b.fromBufferAttribute(p, bi); c.fromBufferAttribute(p, ci);
    ab.subVectors(b, a); ac.subVectors(c, a); bc.subVectors(c, b); n.crossVectors(ab, ac);
    const area = n.length(); if (area < 1e-15) continue;
    n.multiplyScalar(1 / area);
    const angleA = Math.atan2(area, ab.dot(ac)), angleB = Math.atan2(area, -ab.dot(bc));
    const angles = [angleA, angleB, Math.max(0, Math.PI - angleA - angleB)];
    [ai, bi, ci].forEach((vertex, corner) => {
      sum[vertex * 3] += n.x * angles[corner]; sum[vertex * 3 + 1] += n.y * angles[corner]; sum[vertex * 3 + 2] += n.z * angles[corner];
    });
  }
  if (!geometry.attributes.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
  for (const group of geometryTopology(geometry).weldGroups) {
    n.set(0, 0, 0);
    for (const vertex of group) { n.x += sum[vertex * 3]; n.y += sum[vertex * 3 + 1]; n.z += sum[vertex * 3 + 2]; }
    n.normalize(); for (const vertex of group) geometry.attributes.normal.setXYZ(vertex, n.x, n.y, n.z);
  }
  geometry.attributes.normal.needsUpdate = true;
}

export function serializeCatalogGeometry(geometry, meshIndex = 0, { includeFills = true } = {}) {
  if (!geometry?.isBufferGeometry || !geometry.getAttribute('position')) return null;
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    attributes[name] = {
      data: Array.from(attribute.array, Number),
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
    };
  }
  return {
    attributes,
    groups: geometry.groups.map(({ count, materialIndex, start }) => ({ count, materialIndex, start })),
    index: geometry.index ? Array.from(geometry.index.array, Number) : null,
    meshIndex,
    ...(includeFills && geometry.userData.toonlabFillPatches?.length
      ? { fillPatches: structuredClone(geometry.userData.toonlabFillPatches) } : {}),
  };
}

export function deserializeCatalogGeometry(snapshot) {
  if (!snapshot?.attributes?.position) return null;
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(snapshot.attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(
      attribute.data,
      attribute.itemSize,
      Boolean(attribute.normalized),
    ));
  }
  if (Array.isArray(snapshot.index)) geometry.setIndex(snapshot.index);
  if (snapshot.fillPatches?.length) geometry.userData.toonlabFillPatches = structuredClone(snapshot.fillPatches);
  for (const group of snapshot.groups ?? []) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  refreshEditedGeometry(geometry, { tangents: true });
  return geometry;
}

export function captureCatalogMeshSnapshots(meshes = []) {
  return meshes.flatMap((mesh, meshIndex) => {
    const snapshot = serializeCatalogGeometry(mesh?.geometry, meshIndex);
    return snapshot ? [snapshot] : [];
  });
}

/** Carry editor selections and saved fill volumes through a topology change. */
export function inheritCatalogEditState(source, target) {
  if (!target) return target;
  if (!target.userData.toonlabFillPatches && source.userData.toonlabFillPatches) {
    target.userData.toonlabFillPatches = structuredClone(source.userData.toonlabFillPatches);
  }
  for (const name of ['sculptMask', 'sculptSelection']) {
    const attribute = source.getAttribute(name);
    if (attribute && !target.getAttribute(name)) {
      target.setAttribute(name, new THREE.Float32BufferAttribute(
        transferCatalogWeights(source, target, attribute.array), 1,
      ));
    }
  }
  return target;
}

export function transferCatalogWeights(source, target, weights) {
  const a = source.getAttribute('position');
  const b = target.getAttribute('position');
  const sameIndex = source.index?.count === target.index?.count
    && (!source.index || source.index.array.every((value, index) => value === target.index.array[index]));
  if (a.count === b.count && sameIndex) return new Float32Array(weights);
  const result = new Float32Array(b.count);
  const nearestVertex = createNearestVertexLookup(a);
  for (let i = 0; i < b.count; i += 1) {
    const nearest = nearestVertex(b.getX(i), b.getY(i), b.getZ(i));
    result[i] = weights[nearest] ?? 0;
  }
  return result;
}

function catalogBoolean(leftGeometry, rightGeometry, operation) {
  const robust = solidCatalogBoolean(leftGeometry, rightGeometry, operation);
  if (robust) return robust;
  const left = new Brush(leftGeometry.clone());
  const right = new Brush(rightGeometry.clone());
  for (const brush of [left, right]) {
    if (!brush.geometry.getAttribute('normal')) brush.geometry.computeVertexNormals();
    brush.updateMatrixWorld(true);
  }
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal'];
  evaluator.useGroups = false;
  evaluator.useCDTClipping = true;
  try {
    for (const useCDT of [true, false]) {
      evaluator.useCDTClipping = useCDT;
      for (const [a, b] of [[left, right], [right, left]]) {
        let result;
        try {
          result = evaluator.evaluate(a, b, operation).geometry;
          const repaired = repairCatalogTopology(result);
          if (repaired) return repaired;
        } catch {
          // These two operations are commutative; another triangulation can
          // resolve coplanar boundaries without moving either operand.
        } finally {
          result?.dispose();
        }
      }
    }
    return null;
  } finally {
    for (const brush of [left, right]) {
      brush.disposeCacheData?.();
      brush.geometry.dispose();
    }
  }
}

function solidCatalogBoolean(leftGeometry, rightGeometry, operation) {
  if (!solidKernel) return null;
  const solids = [];
  try {
    for (const geometry of [leftGeometry, rightGeometry]) {
      const position = geometry.getAttribute('position');
      const mesh = new solidKernel.Mesh({
        numProp: 3,
        vertProperties: packedAttribute(position),
        triVerts: geometry.index ? new Uint32Array(geometry.index.array)
          : Uint32Array.from({ length: position.count }, (_, index) => index),
      });
      mesh.merge();
      const solid = new solidKernel.Manifold(mesh);
      solids.push(solid);
      if (solid.status() !== 'NoError') return null;
    }
    const result = operation === ADDITION ? solids[0].add(solids[1])
      : operation === INTERSECTION ? solids[0].intersect(solids[1])
        : solids[0].subtract(solids[1]);
    solids.push(result);
    if (result.status() !== 'NoError' || result.isEmpty()) return null;
    leftGeometry.computeBoundingBox();
    const tolerance = Math.max(leftGeometry.boundingBox.getSize(new THREE.Vector3()).length() * 1e-6, 1e-7);
    const original = result.asOriginal();
    solids.push(original);
    for (const factor of [10, 50, 250]) {
      const cleaned = original.simplify(tolerance * factor);
      solids.push(cleaned);
      const mesh = cleaned.getMesh();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertProperties, 3));
      const remap = Uint32Array.from({ length: mesh.vertProperties.length / 3 }, (_, index) => index);
      for (let i = 0; i < mesh.mergeFromVert.length; i += 1) remap[mesh.mergeFromVert[i]] = mesh.mergeToVert[i];
      const indices = Uint32Array.from(mesh.triVerts, (vertex) => {
        let root = vertex;
        while (remap[root] !== root) root = remap[root];
        return root;
      });
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      const repaired = repairCatalogTopology(geometry);
      geometry.dispose();
      if (repaired) return repaired;
    }
    return null;
  } catch {
    return null;
  } finally {
    solids.forEach((solid) => solid.delete());
  }
}

/** Fill against the current surface, keeping all later sculpt/topology edits. */
export function fillCatalogGeometry(geometry, point) {
  const patches = geometry.userData.toonlabFillPatches ?? [];
  if (!patches.length) return null;
  let selected = 0;
  let distance = Infinity;
  patches.forEach((patch, index) => {
    const d = new THREE.Vector3(...patch.point).distanceToSquared(new THREE.Vector3(...point));
    if (d < distance) { selected = index; distance = d; }
  });
  const plug = deserializeCatalogGeometry(patches[selected].geometry);
  if (!plug) return null;
  let result = catalogBoolean(geometry, plug, ADDITION);
  // Coincident recovered/source faces can still produce ambiguous seams.
  // Retry within the weld tolerance, never changing the user's bore settings.
  if (!result) {
    plug.computeBoundingSphere();
    const epsilon = Math.max(plug.boundingSphere.radius * 1e-6, 1e-7);
    for (const axis of [0, 1, 2]) {
      for (const sign of [1, -1]) {
        const shifted = plug.clone();
        const offset = new THREE.Vector3().setComponent(axis, epsilon * sign);
        shifted.translate(offset.x, offset.y, offset.z);
        result = catalogBoolean(geometry, shifted, ADDITION);
        shifted.dispose();
        if (result) break;
      }
      if (result) break;
    }
  }
  plug.dispose();
  if (!result) return null;
  result.userData.toonlabFillPatches = structuredClone(patches.filter((_, index) => index !== selected));
  return inheritCatalogEditState(geometry, result);
}

function moveCatalogFillPatches(geometry, next) {
  const patches = geometry.userData.toonlabFillPatches;
  if (!patches?.length) return;
  const position = geometry.getAttribute('position');
  const oldPoint = (index) => new THREE.Vector3().fromBufferAttribute(position, index);
  const newPoint = (index) => new THREE.Vector3().fromArray(next, index * 3);
  // Recognize whole-mesh affine transforms so saved plugs follow translation,
  // rotation, scale and reflection exactly, including their interior vertices.
  const indices = [0];
  const origin = oldPoint(0);
  for (let i = 1; i < position.count && indices.length < 4; i += 1) {
    const delta = oldPoint(i).sub(origin);
    if (indices.length === 1 && delta.lengthSq() > 1e-12) indices.push(i);
    else if (indices.length === 2 && delta.clone().cross(oldPoint(indices[1]).sub(origin)).lengthSq() > 1e-12) indices.push(i);
    else if (indices.length === 3 && Math.abs(delta.dot(oldPoint(indices[1]).sub(origin)
      .cross(oldPoint(indices[2]).sub(origin)))) > 1e-12) indices.push(i);
  }
  let affine = null;
  if (indices.length === 4) {
    const frame = (read) => {
      const a = read(indices[0]);
      return new THREE.Matrix4().makeBasis(read(indices[1]).sub(a), read(indices[2]).sub(a), read(indices[3]).sub(a)).setPosition(a);
    };
    affine = frame(newPoint).multiply(frame(oldPoint).invert());
    for (let i = 0; i < position.count; i += 1) {
      if (oldPoint(i).applyMatrix4(affine).distanceToSquared(newPoint(i)) > 1e-8) { affine = null; break; }
    }
  }
  const nearestVertex = affine ? null : createNearestVertexLookup(position);
  const movePoint = (point) => {
    if (affine) return point.applyMatrix4(affine);
    const best = nearestVertex(point.x, point.y, point.z);
    return point.add(newPoint(best).sub(oldPoint(best)));
  };
  for (const patch of patches) {
    patch.point = movePoint(new THREE.Vector3(...patch.point)).toArray();
    const plug = deserializeCatalogGeometry(patch.geometry);
    const p = plug.getAttribute('position');
    for (let i = 0; i < p.count; i += 1) {
      const point = movePoint(new THREE.Vector3().fromBufferAttribute(p, i));
      p.setXYZ(i, point.x, point.y, point.z);
    }
    if (affine && affine.determinant() < 0) {
      if (!plug.index) plug.setIndex(Array.from({ length: p.count }, (_, index) => index));
      for (let i = 0; i < plug.index.count; i += 3) {
        const b = plug.index.getX(i + 1);
        plug.index.setX(i + 1, plug.index.getX(i + 2));
        plug.index.setX(i + 2, b);
      }
    }
    refreshEditedGeometry(plug);
    patch.geometry = serializeCatalogGeometry(plug, 0, { includeFills: false });
    plug.dispose();
  }
}

function weldCatalogNormals(geometry) {
  const normal = geometry?.getAttribute?.('normal');
  if (!normal) return;
  for (const group of geometryTopology(geometry).weldGroups) {
    if (group.length < 2) continue;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const index of group) {
      x += normal.getX(index);
      y += normal.getY(index);
      z += normal.getZ(index);
    }
    const length = Math.hypot(x, y, z);
    if (length <= 1e-10) continue;
    x /= length;
    y /= length;
    z /= length;
    for (const index of group) normal.setXYZ(index, x, y, z);
  }
  normal.needsUpdate = true;
}

export function restoreCatalogGeometrySnapshot(geometry, snapshot) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !snapshot || snapshot.length !== position.count * 3) return false;
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(index, snapshot[index * 3], snapshot[index * 3 + 1], snapshot[index * 3 + 2]);
  }
  refreshEditedGeometry(geometry, { tangents: true });
  return true;
}

/**
 * Build a surface-aware brush mask. Ray hits can land in the middle of a
 * large low-poly triangle with no vertex inside the metric radius, so the hit
 * face and a soft one-ring are always admitted. Coincident UV/hard-normal
 * seam vertices share a weight to prevent the brush from tearing the mesh.
 */
export function createCatalogSculptWeights(geometry, {
  point,
  radius = 0.5,
  rigidConnectedComponent = false,
  rigidCoveredComponent = false,
  seedIndices = [],
  seedWeight = 0.72,
  topologyFalloff = 0.28,
  topologyRings = 1,
} = {}) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !Array.isArray(point)) return new Float32Array(0);
  const brushRadius = Math.max(Number(radius) || 0.5, 0.001);
  const center = new THREE.Vector3(...point);
  const vertex = new THREE.Vector3();
  const weights = new Float32Array(position.count);
  for (let index = 0; index < position.count; index += 1) {
    vertex.set(position.getX(index), position.getY(index), position.getZ(index));
    const distance = vertex.distanceTo(center);
    if (distance > brushRadius) continue;
    const linear = 1 - (distance / brushRadius);
    weights[index] = linear * linear * (3 - (2 * linear));
  }

  const { adjacency, weldGroups } = geometryTopology(geometry);
  for (const rawIndex of seedIndices) {
    const index = Math.round(Number(rawIndex));
    if (index < 0 || index >= position.count) continue;
    weights[index] = Math.max(weights[index], clamp(Number(seedWeight) || 0, 0, 1));
  }
  let frontier = new Float32Array(weights);
  const ringCount = clamp(Math.round(Number(topologyRings) || 0), 0, 12);
  const ringFalloff = clamp(Number(topologyFalloff) || 0, 0, 1);
  for (let ring = 0; ring < ringCount; ring += 1) {
    const nextFrontier = new Float32Array(weights.length);
    for (let index = 0; index < frontier.length; index += 1) {
      if (frontier[index] <= 0) continue;
      for (const neighbor of adjacency[index]) {
        const propagated = frontier[index] * ringFalloff;
        if (propagated <= weights[neighbor]) continue;
        weights[neighbor] = propagated;
        nextFrontier[neighbor] = propagated;
      }
    }
    frontier = nextFrontier;
  }
  for (const group of weldGroups) {
    let groupWeight = 0;
    for (const index of group) groupWeight = Math.max(groupWeight, weights[index]);
    for (const index of group) weights[index] = groupWeight;
  }
  if (rigidConnectedComponent || rigidCoveredComponent) {
    // Stacked formations such as hoodoos are often authored as disconnected
    // tiers inside one BufferGeometry (or as one mesh per tier). When the
    // brush covers an entire connected tier, users expect to translate that
    // tier, not stretch one face into a spike. Promote only a fully covered
    // component to a rigid weight; larger connected surfaces retain the soft
    // metric/topology falloff above.
    const component = new Set();
    const pending = seedIndices
      .map((value) => Math.round(Number(value)))
      .filter((index) => index >= 0 && index < position.count);
    while (pending.length > 0) {
      const index = pending.pop();
      if (component.has(index)) continue;
      component.add(index);
      for (const neighbor of adjacency[index]) {
        if (!component.has(neighbor)) pending.push(neighbor);
      }
    }
    let fullyCovered = component.size > 0;
    for (const index of component) {
      vertex.set(position.getX(index), position.getY(index), position.getZ(index));
      if (rigidConnectedComponent || vertex.distanceTo(center) <= brushRadius) {
        // At high Falloff, the visible brush volume is a rigid selection. This
        // lets a large grab translate a cap or ledge without turning the
        // selected region itself into a long tapered spike.
        weights[index] = 1;
      } else {
        fullyCovered = false;
      }
    }
    if (rigidConnectedComponent || fullyCovered) {
      if (rigidConnectedComponent) weights.fill(0);
      for (const index of component) weights[index] = 1;
    }
  }
  return weights;
}

/** Prepare immutable falloff and face-fold constraints once for an interactive grab. */
export function createCatalogGrabSession(geometry, { before, weights, strength = 0.35, preventFaceFlips = false } = {}) {
  const position = geometry.attributes.position;
  if (!before || before.length !== position.count * 3 || weights?.length !== position.count) throw new Error('Invalid grab snapshot.');
  const power = THREE.MathUtils.lerp(2.6, 0.7, clamp(Number(strength) || 0, 0, 1));
  const effective = Float64Array.from(weights, (weight) => clamp(Number(weight) || 0, 0, 1) ** power);
  for (const group of geometryTopology(geometry).weldGroups) {
    let sum = 0, count = 0;
    for (const index of group) if (effective[index] > 0) { sum += effective[index]; count += 1; }
    for (const index of group) effective[index] = count ? sum / count : 0;
  }
  const affected = [];
  for (let i = 0; i < effective.length; i += 1) if (effective[i] > 0) affected.push(i);
  geometry.computeBoundingBox();
  const initialBounds = geometry.boundingBox.clone();
  const diagonal = Math.max(initialBounds.getSize(new THREE.Vector3()).length(), 1e-6);
  const meaningfulArea = diagonal * diagonal * 1e-10;
  const constraints = [];
  let nonRigid = false, appliedScale = 1;
  const index = geometry.index, count = index?.count ?? position.count;
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), gradient = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    const wb = effective[b] - effective[a], wc = effective[c] - effective[a];
    if (wb === 0 && wc === 0) continue; // rigid translation cannot fold a face
    nonRigid = true;
    if (!preventFaceFlips) continue;
    ab.set(before[b * 3] - before[a * 3], before[b * 3 + 1] - before[a * 3 + 1], before[b * 3 + 2] - before[a * 3 + 2]);
    ac.set(before[c * 3] - before[a * 3], before[c * 3 + 1] - before[a * 3 + 1], before[c * 3 + 2] - before[a * 3 + 2]);
    n.crossVectors(ab, ac);
    if (n.length() * 0.5 <= meaningfulArea) continue;
    // cross(ab + wb*d, ac + wc*d) is affine in d: d × d = 0.
    gradient.crossVectors(n, ab).multiplyScalar(wc).addScaledVector(new THREE.Vector3().crossVectors(ac, n), wb);
    constraints.push([gradient.x, gradient.y, gradient.z, n.lengthSq()]);
  }
  const next = new Float32Array(before);
  let changed = false, fillsBeforeFinish = null, lastNormals = performance.now();
  return {
    affectedCount: affected.length,
    constraintCount: constraints.length,
    get appliedScale() { return appliedScale; },
    move(delta) {
      if (!delta?.every(Number.isFinite)) return 0;
      let scale = 1;
      for (const [x, y, z, areaSquared] of constraints) {
        const slope = x * delta[0] + y * delta[1] + z * delta[2];
        if (slope < 0) scale = Math.min(scale, areaSquared * (1 - 1e-5) / -slope);
      }
      const dx = delta[0] * scale, dy = delta[1] * scale, dz = delta[2] * scale;
      appliedScale = scale;
      for (const i of affected) {
        next[i * 3] = dx === 0 ? before[i * 3] : before[i * 3] + dx * effective[i];
        next[i * 3 + 1] = dy === 0 ? before[i * 3 + 1] : before[i * 3 + 1] + dy * effective[i];
        next[i * 3 + 2] = dz === 0 ? before[i * 3 + 2] : before[i * 3 + 2] + dz * effective[i];
        if (!Number.isFinite(next[i * 3]) || !Number.isFinite(next[i * 3 + 1]) || !Number.isFinite(next[i * 3 + 2])) {
          for (const j of affected) { next[j * 3] = position.getX(j); next[j * 3 + 1] = position.getY(j); next[j * 3 + 2] = position.getZ(j); }
          return 0;
        }
      }
      for (const i of affected) position.setXYZ(i, next[i * 3], next[i * 3 + 1], next[i * 3 + 2]);
      position.needsUpdate = true;
      // Conservative bounds avoid a whole-mesh scan and never cull a moved vertex.
      geometry.boundingBox.copy(initialBounds);
      geometry.boundingBox.min.add(new THREE.Vector3(Math.min(0, dx), Math.min(0, dy), Math.min(0, dz)));
      geometry.boundingBox.max.add(new THREE.Vector3(Math.max(0, dx), Math.max(0, dy), Math.max(0, dz)));
      geometry.boundingSphere ??= new THREE.Sphere();
      geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);
      const now = performance.now();
      if (nonRigid && now - lastNormals >= 50) {
        if (geometry.userData.toonlabFillPatches?.length) computeCutNormals(geometry);
        else { geometry.computeVertexNormals(); weldCatalogNormals(geometry); }
        lastNormals = now;
      }
      changed = true;
      return affected.length;
    },
    finish() {
      if (!changed) return;
      if (geometry.userData.toonlabFillPatches?.length) {
        fillsBeforeFinish = structuredClone(geometry.userData.toonlabFillPatches);
        // Saved invisible fill volumes need only follow the final displacement.
        for (const i of affected) position.setXYZ(i, before[i * 3], before[i * 3 + 1], before[i * 3 + 2]);
        try { moveCatalogFillPatches(geometry, next); }
        finally { for (const i of affected) position.setXYZ(i, next[i * 3], next[i * 3 + 1], next[i * 3 + 2]); }
      }
      refreshEditedGeometry(geometry, { tangents: true });
    },
    rollback() {
      if (fillsBeforeFinish) geometry.userData.toonlabFillPatches = fillsBeforeFinish;
      restoreCatalogGeometrySnapshot(geometry, before);
    },
  };
}

/** Apply one camera-plane grab displacement from an immutable gesture snapshot. */
export function grabCatalogGeometry(geometry, {
  before,
  delta,
  strength = 0.35,
  weights,
} = {}) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !before || before.length !== position.count * 3
    || !weights || weights.length !== position.count || !Array.isArray(delta)) return 0;
  const amount = clamp(Number(strength) || 0, 0, 1);
  // Grab is a direct-manipulation tool: the point under the cursor must track
  // the cursor for the entire drag, regardless of the generic brush-strength
  // setting. Strength instead controls how broadly the surrounding falloff
  // follows that point. This makes metre-scale translations predictable while
  // retaining a useful way to choose between a tight pull and a soft bend.
  const falloffPower = THREE.MathUtils.lerp(2.6, 0.7, amount);
  const [dx, dy, dz] = delta.map((value) => Number(value) || 0);
  const next = new Float32Array(before);
  const affected = [];
  let touched = 0;
  for (let index = 0; index < position.count; index += 1) {
    const weight = clamp(Number(weights[index]) || 0, 0, 1);
    if (weight <= 0) continue;
    affected.push([index, weight]);
    touched += 1;
  }
  if (touched > 0) {
    const buildCandidate = (scale) => {
      next.set(before);
      for (const [index, weight] of affected) {
        const grabWeight = weight ** falloffPower;
        next[index * 3] += dx * grabWeight * scale;
        next[(index * 3) + 1] += dy * grabWeight * scale;
        next[(index * 3) + 2] += dz * grabWeight * scale;
      }
      weldCandidateDeltas(geometry, before, next);
    };
    buildCandidate(1);
    if (!auditCatalogPositions(geometry, before, next, { allowLargeDeformation: true, preventFaceFlips: true }).ok) {
      // Preserve finite data and welded seams, but do not treat elongated
      // triangles as an implicit distance limit. If a malformed candidate
      // still appears, stop at the last structurally valid point.
      let safeScale = 0;
      let unsafeScale = 1;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const candidateScale = (safeScale + unsafeScale) * 0.5;
        buildCandidate(candidateScale);
        if (auditCatalogPositions(geometry, before, next, { allowLargeDeformation: true, preventFaceFlips: true }).ok) safeScale = candidateScale;
        else unsafeScale = candidateScale;
      }
      buildCandidate(safeScale);
    }
    moveCatalogFillPatches(geometry, next);
    for (let index = 0; index < position.count; index += 1) {
      position.setXYZ(index, next[index * 3], next[(index * 3) + 1], next[(index * 3) + 2]);
    }
    refreshEditedGeometry(geometry);
  }
  return touched;
}

/** Resize the picked rock/tier proportionally or along one local axis. */
export function resizeCatalogGeometry(geometry, {
  before,
  scale = 1,
  scales = null,
  pivot = null,
  axis = 'uniform',
  weights,
} = {}) {
  const position = geometry?.getAttribute?.('position');
  const scaleFactor = Number(scale);
  const factors = scales ?? ['x', 'y', 'z'].map((name) => axis === 'uniform' || axis === name ? scaleFactor : 1);
  if (!position || !before || before.length !== position.count * 3
    || !weights || weights.length !== position.count
    || !Number.isFinite(scaleFactor) || scaleFactor <= 0
    || !['uniform', 'x', 'y', 'z'].includes(axis)) return 0;
  if (factors.length !== 3 || !factors.every((v) => Number.isFinite(v) && v > 0)
    || (pivot && (pivot.length !== 3 || !pivot.every(Number.isFinite)))) return 0;
  let totalWeight = 0;
  let centerX = 0;
  let centerY = 0;
  let centerZ = 0;
  let touched = 0;
  for (let index = 0; index < position.count; index += 1) {
    const weight = Math.max(Number(weights[index]) || 0, 0);
    if (weight <= 0) continue;
    totalWeight += weight;
    centerX += before[index * 3] * weight;
    centerY += before[index * 3 + 1] * weight;
    centerZ += before[index * 3 + 2] * weight;
    touched += 1;
  }
  if (totalWeight <= 0) return 0;
  centerX /= totalWeight;
  centerY /= totalWeight;
  centerZ /= totalWeight;
  if (pivot) [centerX, centerY, centerZ] = pivot;
  const next = new Float32Array(before);
  for (let index = 0; index < position.count; index += 1) {
    const weight = Math.max(Number(weights[index]) || 0, 0);
    if (weight <= 0) continue;
    // Exponential interpolation keeps every intermediate size positive while
    // allowing an unrestricted drag to grow or shrink by any factor.
    const centers = [centerX, centerY, centerZ];
    for (let component = 0; component < 3; component += 1) {
      if (factors[component] === 1) continue;
      const weightedScale = Math.exp(Math.log(factors[component]) * weight);
      next[index * 3 + component] = centers[component] + (before[index * 3 + component] - centers[component]) * weightedScale;
    }
  }
  weldCandidateDeltas(geometry, before, next);
  if (!auditCatalogPositions(geometry, before, next, { allowLargeDeformation: true }).ok) return 0;
  moveCatalogFillPatches(geometry, next);
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(index, next[index * 3], next[index * 3 + 1], next[index * 3 + 2]);
  }
  refreshEditedGeometry(geometry);
  return touched;
}

function transformCatalogSelection(geometry, before, weights, transform) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !before || before.length !== position.count * 3
    || !weights || weights.length !== position.count) return 0;
  let totalWeight = 0;
  const center = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    const weight = Math.max(Number(weights[index]) || 0, 0);
    if (weight <= 0) continue;
    totalWeight += weight;
    center.x += before[index * 3] * weight;
    center.y += before[index * 3 + 1] * weight;
    center.z += before[index * 3 + 2] * weight;
  }
  if (totalWeight <= 0) return 0;
  center.multiplyScalar(1 / totalWeight);
  const next = new Float32Array(before);
  const source = new THREE.Vector3();
  const target = new THREE.Vector3();
  let touched = 0;
  for (let index = 0; index < position.count; index += 1) {
    const weight = Math.max(Number(weights[index]) || 0, 0);
    if (weight <= 0) continue;
    source.fromArray(before, index * 3);
    target.copy(transform(source.clone(), center.clone(), index));
    next[index * 3] += (target.x - source.x) * weight;
    next[index * 3 + 1] += (target.y - source.y) * weight;
    next[index * 3 + 2] += (target.z - source.z) * weight;
    touched += 1;
  }
  weldCandidateDeltas(geometry, before, next);
  if (!auditCatalogPositions(geometry, before, next, { allowLargeDeformation: true }).ok) return 0;
  moveCatalogFillPatches(geometry, next);
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(index, next[index * 3], next[index * 3 + 1], next[index * 3 + 2]);
  }
  refreshEditedGeometry(geometry);
  return touched;
}

export function rotateCatalogGeometry(geometry, {
  angle = 0,
  axis = [0, 1, 0],
  before,
  weights,
} = {}) {
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(...axis).normalize(),
    Number(angle) || 0,
  );
  return transformCatalogSelection(geometry, before, weights, (vertex, center) => (
    vertex.sub(center).applyQuaternion(rotation).add(center)
  ));
}

export function settleCatalogGeometry(geometry, weights, { worldMatrix = null } = {}) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !weights || weights.length !== position.count) return 0;
  const before = packedAttribute(position);
  let minimum = Infinity;
  const point = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    if (weights[index] <= 0) continue;
    point.fromArray(before, index * 3);
    if (worldMatrix) point.applyMatrix4(worldMatrix);
    minimum = Math.min(minimum, point.y);
  }
  if (!Number.isFinite(minimum)) return 0;
  const delta = new THREE.Vector3(0, -minimum, 0);
  if (worldMatrix) {
    const inverse = worldMatrix.clone().invert();
    delta.applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse));
  }
  return transformCatalogSelection(geometry, before, weights, (vertex) => vertex.add(delta));
}

export function mirrorCatalogGeometry(geometry, weights, axis = 'x') {
  const position = geometry?.getAttribute?.('position');
  if (!position || !weights || weights.length !== position.count) return 0;
  const before = packedAttribute(position);
  const axisIndex = axis === 'z' ? 2 : axis === 'y' ? 1 : 0;
  const touched = transformCatalogSelection(geometry, before, weights, (vertex, center) => {
    vertex.setComponent(axisIndex, (center.getComponent(axisIndex) * 2) - vertex.getComponent(axisIndex));
    return vertex;
  });
  if (touched === 0) return 0;
  // A triangle soup still needs reversed winding after a reflection. Adding
  // an identity index preserves every UV/color attribute and corner ordering.
  if (!geometry.index) geometry.setIndex(Array.from({ length: position.count }, (_, index) => index));
  const index = geometry.index;
  if (index) {
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = index.getX(offset);
      const b = index.getX(offset + 1);
      const c = index.getX(offset + 2);
      if (weights[a] <= 0 || weights[b] <= 0 || weights[c] <= 0) continue;
      index.setX(offset + 1, c);
      index.setX(offset + 2, b);
    }
    index.needsUpdate = true;
  }
  refreshEditedGeometry(geometry, { tangents: true });
  return touched;
}

export function subdivideCatalogGeometry(geometry) {
  if (!geometry?.isBufferGeometry || !geometry.getAttribute('position')) return null;
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const sourcePosition = source.getAttribute('position');
  source.computeBoundingBox();
  const diagonal = Math.max(source.boundingBox.getSize(new THREE.Vector3()).length(), 1e-6);
  const minimumArea = diagonal * diagonal * 1e-10;
  const validTriangles = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const triangleCount = Math.floor(sourcePosition.count / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    a.fromBufferAttribute(sourcePosition, triangle * 3);
    b.fromBufferAttribute(sourcePosition, triangle * 3 + 1);
    c.fromBufferAttribute(sourcePosition, triangle * 3 + 2);
    cross.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (cross.length() * 0.5 > minimumArea) validTriangles.push(triangle);
  }
  if (validTriangles.length === 0) return null;
  const output = new THREE.BufferGeometry();
  const patterns = [[0, 3, 5], [3, 1, 4], [5, 4, 2], [3, 4, 5]];
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const data = [];
    const read = (vertex) => Array.from({ length: attribute.itemSize }, (_, component) => (
      attribute.array[vertex * attribute.itemSize + component]
    ));
    const midpoint = (left, right) => left.map((value, component) => (value + right[component]) * 0.5);
    for (const triangle of validTriangles) {
      const a = read(triangle * 3);
      const b = read(triangle * 3 + 1);
      const c = read(triangle * 3 + 2);
      const vertices = [a, b, c, midpoint(a, b), midpoint(b, c), midpoint(c, a)];
      for (const pattern of patterns) {
        for (const vertexIndex of pattern) data.push(...vertices[vertexIndex]);
      }
    }
    output.setAttribute(name, new THREE.Float32BufferAttribute(data, attribute.itemSize, attribute.normalized));
  }
  source.dispose();
  refreshEditedGeometry(output, { tangents: true });
  const repaired = repairCatalogTopology(output);
  output.dispose();
  return repaired;
}

/**
 * Convert topology output to a position-welded indexed surface, discard
 * zero-area faces, and cap any simple boundary loops introduced by a Boolean
 * or edge-collapse operation. Generated geology is reprojected immediately
 * after commit, so deterministic cylindrical UVs are preferable to retaining
 * torn source UV islands.
 */
function repairCatalogTopology(geometry, {
  allowOpen = false,
  closeBoundaries = true,
  repairPass = 0,
} = {}) {
  const sourcePosition = geometry?.getAttribute?.('position');
  if (!sourcePosition) return null;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const dimensions = bounds.getSize(new THREE.Vector3());
  const diagonal = Math.max(dimensions.length(), 1e-6);
  const tolerance = Math.max(diagonal * 1e-6, 1e-7);
  const minimumArea = diagonal * diagonal * 1e-10;
  const vertexMap = new Map();
  const vertices = [];
  const sourceToWelded = new Uint32Array(sourcePosition.count);
  for (let index = 0; index < sourcePosition.count; index += 1) {
    const x = sourcePosition.getX(index);
    const y = sourcePosition.getY(index);
    const z = sourcePosition.getZ(index);
    const key = [x, y, z].map((value) => Math.round(value / tolerance)).join(':');
    let welded = vertexMap.get(key);
    if (welded === undefined) {
      welded = vertices.length / 3;
      vertexMap.set(key, welded);
      vertices.push(x, y, z);
    }
    sourceToWelded[index] = welded;
  }
  const sourceIndex = geometry.index;
  let indices = [];
  const triangleKeys = new Set();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const triangleCount = Math.floor((sourceIndex?.count ?? sourcePosition.count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const sourceVertices = [0, 1, 2].map((corner) => (
      sourceIndex ? sourceIndex.getX(triangle * 3 + corner) : triangle * 3 + corner
    ));
    const welded = sourceVertices.map((index) => sourceToWelded[index]);
    if (new Set(welded).size < 3) continue;
    va.fromArray(vertices, welded[0] * 3);
    vb.fromArray(vertices, welded[1] * 3);
    vc.fromArray(vertices, welded[2] * 3);
    if (vb.clone().sub(va).cross(vc.clone().sub(va)).length() * 0.5 <= minimumArea) continue;
    const key = [...welded].sort((left, right) => left - right).join(':');
    if (triangleKeys.has(key)) continue;
    triangleKeys.add(key);
    indices.push(...welded);
  }
  if (indices.length < 3) return null;

  // Boolean kernels can tessellate the two sides of a coplanar seam
  // differently. Split long boundary edges at existing collinear vertices
  // before attempting caps; a T-junction is not a hole to fill.
  const initialEdges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const face = indices.slice(offset, offset + 3);
    for (let edge = 0; edge < 3; edge += 1) {
      const a = face[edge], b = face[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      initialEdges.set(key, (initialEdges.get(key) ?? 0) + 1);
    }
  }
  const boundaryVertices = new Set();
  for (const [key, count] of initialEdges) if (count === 1) key.split(':').forEach((v) => boundaryVertices.add(Number(v)));
  if (boundaryVertices.size) {
    const splitEdges = new Map();
    const split = (a, b) => {
      const key = `${a}:${b}`;
      if (splitEdges.has(key)) return splitEdges.get(key);
      const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`;
      const points = [];
      if (initialEdges.get(edgeKey) === 1) {
        const start = new THREE.Vector3().fromArray(vertices, a * 3);
        const direction = new THREE.Vector3().fromArray(vertices, b * 3).sub(start);
        const length = direction.lengthSq();
        for (const v of boundaryVertices) {
          if (v === a || v === b) continue;
          const delta = new THREE.Vector3().fromArray(vertices, v * 3).sub(start);
          const t = delta.dot(direction) / length;
          if (t <= 1e-7 || t >= 1 - 1e-7) continue;
          if (delta.addScaledVector(direction, -t).lengthSq() <= tolerance * tolerance * 4) points.push({ v, t });
        }
      }
      const result = points.sort((left, right) => left.t - right.t).map(({ v }) => v);
      splitEdges.set(key, result);
      return result;
    };
    const stitched = [];
    for (let offset = 0; offset < indices.length; offset += 3) {
      const [a, b, c] = indices.slice(offset, offset + 3);
      const loop = [a, ...split(a, b), b, ...split(b, c), c, ...split(c, a)];
      if (loop.length === 3) { stitched.push(a, b, c); continue; }
      const center = vertices.length / 3;
      for (let axis = 0; axis < 3; axis += 1) vertices.push((vertices[a * 3 + axis] + vertices[b * 3 + axis] + vertices[c * 3 + axis]) / 3);
      for (let edge = 0; edge < loop.length; edge += 1) stitched.push(loop[edge], loop[(edge + 1) % loop.length], center);
    }
    indices = stitched;
  }

  // Generic edge-collapse and CSG can occasionally leave three or more faces
  // sharing one edge. Retain the most opposed pair around each such edge and
  // let the boundary pass below close the discarded sliver fan. This is
  // deterministic and prevents black/inverted wedges from being committed.
  for (let pass = 0; pass < 3; pass += 1) {
    const edgeTriangles = new Map();
    for (let offset = 0; offset < indices.length; offset += 3) {
      const triangle = indices.slice(offset, offset + 3);
      for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const key = left < right ? `${left}:${right}` : `${right}:${left}`;
        const entries = edgeTriangles.get(key) ?? [];
        entries.push(offset / 3);
        edgeTriangles.set(key, entries);
      }
    }
    const removals = new Set();
    const faceNormal = (triangle) => {
      const offset = triangle * 3;
      va.fromArray(vertices, indices[offset] * 3);
      vb.fromArray(vertices, indices[offset + 1] * 3);
      vc.fromArray(vertices, indices[offset + 2] * 3);
      return vb.clone().sub(va).cross(vc.clone().sub(va)).normalize();
    };
    for (const entries of edgeTriangles.values()) {
      if (entries.length <= 2) continue;
      let keepLeft = entries[0];
      let keepRight = entries[1];
      let bestDot = Infinity;
      for (let left = 0; left < entries.length - 1; left += 1) {
        const leftNormal = faceNormal(entries[left]);
        for (let right = left + 1; right < entries.length; right += 1) {
          const dot = leftNormal.dot(faceNormal(entries[right]));
          if (dot < bestDot) {
            bestDot = dot;
            keepLeft = entries[left];
            keepRight = entries[right];
          }
        }
      }
      for (const triangle of entries) {
        if (triangle !== keepLeft && triangle !== keepRight) removals.add(triangle);
      }
    }
    if (removals.size === 0) break;
    indices = indices.filter((_, index) => !removals.has(Math.floor(index / 3)));
  }

  if (closeBoundaries) {
    const edgeCounts = new Map();
    const directedEdges = new Set();
    for (let offset = 0; offset < indices.length; offset += 3) {
      const triangle = indices.slice(offset, offset + 3);
      for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const key = left < right ? `${left}:${right}` : `${right}:${left}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        directedEdges.add(`${left}:${right}`);
      }
    }
    const boundaryAdjacency = new Map();
    for (const [key, count] of edgeCounts) {
      if (count !== 1) continue;
      const [left, right] = key.split(':').map(Number);
      if (!boundaryAdjacency.has(left)) boundaryAdjacency.set(left, []);
      if (!boundaryAdjacency.has(right)) boundaryAdjacency.set(right, []);
      boundaryAdjacency.get(left).push(right);
      boundaryAdjacency.get(right).push(left);
    }
    const visitedEdges = new Set();
    for (const start of boundaryAdjacency.keys()) {
      for (const first of boundaryAdjacency.get(start)) {
        const firstKey = start < first ? `${start}:${first}` : `${first}:${start}`;
        if (visitedEdges.has(firstKey)) continue;
        const loop = [start];
        let previous = start;
        let current = first;
        let closed = false;
        while (loop.length <= boundaryAdjacency.size + 1) {
          loop.push(current);
          const edgeKey = previous < current ? `${previous}:${current}` : `${current}:${previous}`;
          visitedEdges.add(edgeKey);
          const next = (boundaryAdjacency.get(current) ?? []).find((candidate) => candidate !== previous);
          if (next === undefined) break;
          if (next === start) {
            const closingKey = current < start ? `${current}:${start}` : `${start}:${current}`;
            visitedEdges.add(closingKey);
            closed = true;
            break;
          }
          previous = current;
          current = next;
        }
        if (!closed || loop.length < 3 || loop.length > 1024) continue;
        // A centroid fan only works for convex contours. Rock cuts are often
        // deeply concave; connecting every boundary vertex to the mean can
        // cross the contour and create the visible starburst of overlapping
        // triangles. Project the planar loop onto its dominant 2D plane and
        // let Earcut produce a concavity-safe cap instead.
        const loopNormal = new THREE.Vector3();
        for (let edge = 0; edge < loop.length; edge += 1) {
          const currentVertex = loop[edge];
          const nextVertex = loop[(edge + 1) % loop.length];
          const currentX = vertices[currentVertex * 3];
          const currentY = vertices[currentVertex * 3 + 1];
          const currentZ = vertices[currentVertex * 3 + 2];
          const nextX = vertices[nextVertex * 3];
          const nextY = vertices[nextVertex * 3 + 1];
          const nextZ = vertices[nextVertex * 3 + 2];
          loopNormal.x += (currentY - nextY) * (currentZ + nextZ);
          loopNormal.y += (currentZ - nextZ) * (currentX + nextX);
          loopNormal.z += (currentX - nextX) * (currentY + nextY);
        }
        if (loopNormal.lengthSq() < tolerance * tolerance) continue;
        const dominantAxis = ['x', 'y', 'z'].reduce((best, axis) => (
          Math.abs(loopNormal[axis]) > Math.abs(loopNormal[best]) ? axis : best
        ), 'x');
        const contour = loop.map((vertex) => {
          const x = vertices[vertex * 3];
          const y = vertices[vertex * 3 + 1];
          const z = vertices[vertex * 3 + 2];
          if (dominantAxis === 'x') return new THREE.Vector2(y, z);
          if (dominantAxis === 'y') return new THREE.Vector2(x, z);
          return new THREE.Vector2(x, y);
        });
        let capFaces = THREE.ShapeUtils.triangulateShape(contour, []).map((face) => [...face]);
        if (capFaces.length === 0) continue;
        // Earcut intentionally drops perfectly collinear contour vertices.
        // Those vertices are still endpoints of the clipped rock's boundary
        // edges, so put each omitted point back by splitting the cap edge that
        // contains it. This preserves a two-manifold seam without introducing
        // zero-area triangles.
        for (let omitted = 0; omitted < contour.length; omitted += 1) {
          if (capFaces.some((face) => face.includes(omitted))) continue;
          const point2 = contour[omitted];
          let inserted = false;
          for (let faceIndex = 0; faceIndex < capFaces.length && !inserted; faceIndex += 1) {
            const face = capFaces[faceIndex];
            for (let edge = 0; edge < 3; edge += 1) {
              const left = face[edge];
              const right = face[(edge + 1) % 3];
              const opposite = face[(edge + 2) % 3];
              const segment = contour[right].clone().sub(contour[left]);
              const lengthSquared = segment.lengthSq();
              if (lengthSquared <= tolerance * tolerance) continue;
              const amount = point2.clone().sub(contour[left]).dot(segment) / lengthSquared;
              if (amount <= 1e-6 || amount >= 1 - 1e-6) continue;
              const closest = contour[left].clone().addScaledVector(segment, amount);
              if (closest.distanceTo(point2) > tolerance * 4) continue;
              capFaces.splice(
                faceIndex,
                1,
                [left, omitted, opposite],
                [omitted, right, opposite],
              );
              inserted = true;
              break;
            }
          }
          if (!inserted) {
            capFaces = [];
            break;
          }
        }
        if (capFaces.length !== loop.length - 2) continue;
        let reverseCap = null;
        for (const face of capFaces) {
          const faceVertices = face.map((index) => loop[index]);
          for (const [left, right] of [
            [faceVertices[0], faceVertices[1]],
            [faceVertices[1], faceVertices[2]],
            [faceVertices[2], faceVertices[0]],
          ]) {
            const key = left < right ? `${left}:${right}` : `${right}:${left}`;
            if (edgeCounts.get(key) !== 1) continue;
            reverseCap = directedEdges.has(`${left}:${right}`);
            break;
          }
          if (reverseCap !== null) break;
        }
        if (reverseCap === null) continue;
        for (const face of capFaces) {
          const [firstIndex, secondIndex, thirdIndex] = face.map((index) => loop[index]);
          if (reverseCap) indices.push(firstIndex, thirdIndex, secondIndex);
          else indices.push(firstIndex, secondIndex, thirdIndex);
        }
      }
    }
  }

  const output = new THREE.BufferGeometry();
  output.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  output.setIndex(indices);
  output.computeBoundingBox();
  const outputBounds = output.boundingBox;
  const outputSize = outputBounds.getSize(new THREE.Vector3());
  const uv = new Float32Array((vertices.length / 3) * 2);
  for (let index = 0; index < vertices.length / 3; index += 1) {
    const x = vertices[index * 3];
    const y = vertices[index * 3 + 1];
    const z = vertices[index * 3 + 2];
    uv[index * 2] = (Math.atan2(z, x) / (Math.PI * 2)) + 0.5;
    uv[index * 2 + 1] = (y - outputBounds.min.y) / Math.max(outputSize.y, 1e-6);
  }
  output.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  refreshEditedGeometry(output, { tangents: true });
  const finalEdges = new Map();
  const outputIndex = output.index;
  for (let offset = 0; offset < outputIndex.count; offset += 3) {
    const triangle = [outputIndex.getX(offset), outputIndex.getX(offset + 1), outputIndex.getX(offset + 2)];
    for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      finalEdges.set(key, (finalEdges.get(key) ?? 0) + 1);
    }
  }
  const unresolvedEdges = [...finalEdges.values()].filter((count) => count !== 2).length;
  const outputPosition = output.getAttribute('position');
  let degenerate = false;
  for (let offset = 0; offset < indices.length; offset += 3) {
    va.fromBufferAttribute(outputPosition, indices[offset]);
    vb.fromBufferAttribute(outputPosition, indices[offset + 1]);
    vc.fromBufferAttribute(outputPosition, indices[offset + 2]);
    if (vb.sub(va).cross(vc.sub(va)).length() * 0.5 <= minimumArea) { degenerate = true; break; }
  }
  if (unresolvedEdges > 0 || degenerate) {
    // The plane-cap path intentionally asks for the clipped open shell so it
    // can triangulate all coplanar boundary loops (including nested holes) in
    // one pass. Re-running the generic repair cannot close those boundaries
    // when closeBoundaries is disabled and only wastes several full welds.
    if (allowOpen && !closeBoundaries && !degenerate) return output;
    if (repairPass < 3) {
      const repaired = repairCatalogTopology(output, {
        allowOpen,
        closeBoundaries,
        repairPass: repairPass + 1,
      });
      output.dispose();
      return repaired;
    }
    output.dispose();
    return null;
  }
  return output;
}

export function decimateCatalogGeometry(geometry, ratio = 0.5) {
  if (!geometry?.isBufferGeometry || !geometry.getAttribute('position')) return null;
  if (!Number.isFinite(Number(ratio)) || Number(ratio) <= 0 || Number(ratio) > 1) return null;
  const triangleCount = Math.floor((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);
  if (triangleCount < 8) return geometry.clone();
  const targetTriangles = Math.max(4, Math.round(triangleCount * Number(ratio)));
  if (meshoptSimplifierReady) {
    const prepared = repairCatalogTopology(geometry);
    if (!prepared?.index) {
      prepared?.dispose();
      return null;
    }
    const preparedPosition = prepared.getAttribute('position');
    const sourcePositions = new Float32Array(preparedPosition.array);
    const sourceIndices = new Uint32Array(prepared.index.array);
    const [simplified] = MeshoptSimplifier.simplify(
      sourceIndices,
      sourcePositions,
      3,
      Math.min(targetTriangles * 3, sourceIndices.length),
      1,
      ['Regularize'],
    );
    const compactIndices = new Uint32Array(simplified);
    const [remap, uniqueVertices] = MeshoptSimplifier.compactMesh(compactIndices);
    const compactPositions = new Float32Array(uniqueVertices * 3);
    const missing = 0xffffffff;
    for (let sourceIndex = 0; sourceIndex < remap.length; sourceIndex += 1) {
      const targetIndex = remap[sourceIndex];
      if (targetIndex === missing) continue;
      compactPositions[targetIndex * 3] = sourcePositions[sourceIndex * 3];
      compactPositions[targetIndex * 3 + 1] = sourcePositions[sourceIndex * 3 + 1];
      compactPositions[targetIndex * 3 + 2] = sourcePositions[sourceIndex * 3 + 2];
    }
    prepared.dispose();
    const output = new THREE.BufferGeometry();
    output.setAttribute('position', new THREE.BufferAttribute(compactPositions, 3));
    output.setIndex(new THREE.BufferAttribute(compactIndices, 1));
    const repaired = repairCatalogTopology(output);
    output.dispose();
    return repaired;
  }
  const result = simplifyRockGeometryToTriangleBudget(geometry, targetTriangles);
  if (!result.retainedSource && result.triangleCount <= targetTriangles * 1.15) {
    const repaired = repairCatalogTopology(result.geometry);
    result.geometry.dispose();
    return repaired;
  }
  if (!result.retainedSource) result.geometry.dispose();

  // Boolean output and many authored GLBs duplicate every triangle corner for
  // UVs or hard normals. An edge-collapse modifier cannot see any shared edge
  // in that representation, so make a welded geometric carrier and retry.
  // Material coordinates are deliberately rebuilt below; the live surface
  // pipeline reprojects its geology/PBR maps after the topology snapshot loads.
  const carrier = new THREE.BufferGeometry();
  carrier.setAttribute('position', geometry.getAttribute('position').clone());
  if (geometry.index) carrier.setIndex(geometry.index.clone());
  const welded = mergeVertices(carrier, 1e-5);
  carrier.dispose();
  const fallback = simplifyRockGeometryToTriangleBudget(welded, targetTriangles);
  const output = fallback.retainedSource ? welded.clone() : fallback.geometry;
  welded.dispose();
  output.computeBoundingBox();
  const bounds = output.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const position = output.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (Math.atan2(position.getZ(index), position.getX(index)) / (Math.PI * 2)) + 0.5;
    uv[index * 2 + 1] = (position.getY(index) - bounds.min.y) / Math.max(size.y, 1e-6);
  }
  output.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  refreshEditedGeometry(output, { tangents: true });
  const repaired = repairCatalogTopology(output);
  output.dispose();
  return repaired;
}

export function remeshCatalogGeometry(geometry, { targetTriangles = null } = {}) {
  const sourceTriangles = Math.floor((geometry.index?.count ?? geometry.getAttribute('position').count) / 3);
  const target = targetTriangles === null ? sourceTriangles : Math.round(Number(targetTriangles));
  if (!Number.isFinite(target) || target < 4) return null;
  // Collapse first and then split the surviving faces. Simplifying a fully
  // non-indexed subdivision makes Three's edge-collapse modifier treat every
  // triangle as an island and retain the 4x mesh instead of remeshing it.
  let carrier = geometry;
  while ((carrier.index?.count ?? carrier.attributes.position.count) / 3 < target / 4) {
    const previousCount = carrier.index?.count ?? carrier.attributes.position.count;
    const refined = subdivideCatalogGeometry(carrier);
    if (carrier !== geometry) carrier.dispose();
    if (!refined) return null;
    if ((refined.index?.count ?? refined.attributes.position.count) <= previousCount) { refined.dispose(); return null; }
    carrier = refined;
  }
  const coarse = decimateCatalogGeometry(carrier, Math.min(1, target / ((carrier.index?.count ?? carrier.attributes.position.count) / 3) / 4));
  if (carrier !== geometry) carrier.dispose();
  if (!coarse) return null;
  const remeshed = subdivideCatalogGeometry(coarse);
  coarse.dispose();
  if (!remeshed) return null;
  remeshed.computeBoundingSphere();
  const sphere = remeshed.boundingSphere;
  sculptCatalogGeometry(remeshed, {
    point: sphere.center.toArray(),
    radius: Math.max(sphere.radius * 2.1, 0.01),
    strength: 0.25,
    tool: 'smooth',
  });
  remeshed.userData.toonlabRemesh = {
    sourceTriangles,
    triangleCount: Math.floor((remeshed.index?.count ?? remeshed.getAttribute('position').count) / 3),
  };
  return remeshed;
}

function geometryTopology(geometry) {
  let cached = topologyCache.get(geometry);
  if (cached) return cached;
  const position = geometry.getAttribute('position');
  const count = position?.count ?? 0;
  const sets = Array.from({ length: count }, () => new Set());
  const index = geometry.index;
  const addEdge = (left, right) => {
    if (left === right || left < 0 || right < 0 || left >= count || right >= count) return;
    sets[left].add(right);
    sets[right].add(left);
  };
  const triangleCount = Math.floor((index?.count ?? count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    const a = index ? index.getX(offset) : offset;
    const b = index ? index.getX(offset + 1) : offset + 1;
    const c = index ? index.getX(offset + 2) : offset + 2;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  // GLBs commonly duplicate the same geometric vertex at UV and hard-normal
  // seams. Treat those duplicates as one sculpt point even though their
  // attributes remain independent for rendering.
  geometry.computeBoundingBox();
  const diagonal = geometry.boundingBox?.getSize(new THREE.Vector3()).length() ?? 1;
  const weldTolerance = Math.max(diagonal * 1e-6, 1e-7);
  const weldMap = new Map();
  for (let vertexIndex = 0; vertexIndex < count; vertexIndex += 1) {
    const key = [
      Math.round(position.getX(vertexIndex) / weldTolerance),
      Math.round(position.getY(vertexIndex) / weldTolerance),
      Math.round(position.getZ(vertexIndex) / weldTolerance),
    ].join(':');
    const group = weldMap.get(key) ?? [];
    group.push(vertexIndex);
    weldMap.set(key, group);
  }
  const weldGroups = [...weldMap.values()];
  for (const group of weldGroups) {
    if (group.length < 2) continue;
    const sharedNeighbors = new Set(group);
    for (const vertexIndex of group) {
      for (const neighbor of sets[vertexIndex]) sharedNeighbors.add(neighbor);
    }
    for (const vertexIndex of group) {
      sets[vertexIndex] = new Set([...sharedNeighbors].filter((neighbor) => neighbor !== vertexIndex));
    }
  }
  cached = { adjacency: sets.map((entry) => [...entry]), weldGroups, weldTolerance };
  topologyCache.set(geometry, cached);
  return cached;
}

function geometryAdjacency(geometry) {
  return geometryTopology(geometry).adjacency;
}

function weldCandidateDeltasForGroups(weldGroups, before, next) {
  for (const group of weldGroups) {
    if (group.length < 2) continue;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let contributors = 0;
    for (const index of group) {
      const offset = index * 3;
      const nextDx = next[offset] - before[offset];
      const nextDy = next[offset + 1] - before[offset + 1];
      const nextDz = next[offset + 2] - before[offset + 2];
      if (Math.abs(nextDx) + Math.abs(nextDy) + Math.abs(nextDz) <= 1e-10) continue;
      dx += nextDx;
      dy += nextDy;
      dz += nextDz;
      contributors += 1;
    }
    if (contributors === 0) continue;
    dx /= contributors;
    dy /= contributors;
    dz /= contributors;
    for (const index of group) {
      const offset = index * 3;
      next[offset] = before[offset] + dx;
      next[offset + 1] = before[offset + 1] + dy;
      next[offset + 2] = before[offset + 2] + dz;
    }
  }
}

function weldCandidateDeltas(geometry, before, next) {
  weldCandidateDeltasForGroups(geometryTopology(geometry).weldGroups, before, next);
}

function triangleArea(snapshot, a, b, c) {
  const ax = snapshot[a * 3];
  const ay = snapshot[a * 3 + 1];
  const az = snapshot[a * 3 + 2];
  const abx = snapshot[b * 3] - ax;
  const aby = snapshot[b * 3 + 1] - ay;
  const abz = snapshot[b * 3 + 2] - az;
  const acx = snapshot[c * 3] - ax;
  const acy = snapshot[c * 3 + 1] - ay;
  const acz = snapshot[c * 3 + 2] - az;
  const crossX = (aby * acz) - (abz * acy);
  const crossY = (abz * acx) - (abx * acz);
  const crossZ = (abx * acy) - (aby * acx);
  return Math.hypot(crossX, crossY, crossZ) * 0.5;
}

function triangleCross(snapshot, a, b, c) {
  const ax = snapshot[a * 3];
  const ay = snapshot[a * 3 + 1];
  const az = snapshot[a * 3 + 2];
  const abx = snapshot[b * 3] - ax;
  const aby = snapshot[b * 3 + 1] - ay;
  const abz = snapshot[b * 3 + 2] - az;
  const acx = snapshot[c * 3] - ax;
  const acy = snapshot[c * 3 + 1] - ay;
  const acz = snapshot[c * 3 + 2] - az;
  return [
    (aby * acz) - (abz * acy),
    (abz * acx) - (abx * acz),
    (abx * acy) - (aby * acx),
  ];
}

function edgeLength(snapshot, left, right) {
  return Math.hypot(
    snapshot[left * 3] - snapshot[right * 3],
    snapshot[left * 3 + 1] - snapshot[right * 3 + 1],
    snapshot[left * 3 + 2] - snapshot[right * 3 + 2],
  );
}

function auditCatalogPositions(geometry, reference, candidate, { allowLargeDeformation = false, preventFaceFlips = false } = {}) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !reference || !candidate
    || reference.length !== position.count * 3 || candidate.length !== reference.length) {
    return { ok: false, reason: 'non-finite or mismatched vertex data' };
  }
  for (const value of candidate) {
    if (!Number.isFinite(value)) return { ok: false, reason: 'non-finite or mismatched vertex data' };
  }
  const topology = geometryTopology(geometry);
  let minimumX = Infinity;
  let minimumY = Infinity;
  let minimumZ = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;
  let maximumZ = -Infinity;
  for (let offset = 0; offset < reference.length; offset += 3) {
    minimumX = Math.min(minimumX, reference[offset]);
    minimumY = Math.min(minimumY, reference[offset + 1]);
    minimumZ = Math.min(minimumZ, reference[offset + 2]);
    maximumX = Math.max(maximumX, reference[offset]);
    maximumY = Math.max(maximumY, reference[offset + 1]);
    maximumZ = Math.max(maximumZ, reference[offset + 2]);
  }
  const referenceDiagonal = Math.max(Math.hypot(
    maximumX - minimumX,
    maximumY - minimumY,
    maximumZ - minimumZ,
  ), 1e-6);
  // Authored GLBs may contain microscopic sliver triangles around hard seams.
  // They are irrelevant to the visible surface but produce meaningless
  // million-fold edge ratios after even a safe brush displacement.
  const meaningfulEdgeLength = referenceDiagonal * 1e-5;
  const meaningfulTriangleArea = referenceDiagonal * referenceDiagonal * 1e-10;
  let maxSeamGap = 0;
  for (const group of topology.weldGroups) {
    if (group.length < 2) continue;
    const anchor = group[0];
    for (let offset = 1; offset < group.length; offset += 1) {
      maxSeamGap = Math.max(maxSeamGap, edgeLength(candidate, anchor, group[offset]));
    }
  }
  let maxEdgeStretch = 1;
  let minAreaRatio = 1;
  let minNormalDot = 1;
  const index = geometry.index;
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const sourceOffset = triangle * 3;
    const a = index ? index.getX(sourceOffset) : sourceOffset;
    const b = index ? index.getX(sourceOffset + 1) : sourceOffset + 1;
    const c = index ? index.getX(sourceOffset + 2) : sourceOffset + 2;
    for (const [left, right] of [[a, b], [b, c], [c, a]]) {
      const baseLength = edgeLength(reference, left, right);
      if (baseLength <= meaningfulEdgeLength) continue;
      maxEdgeStretch = Math.max(maxEdgeStretch, edgeLength(candidate, left, right) / baseLength);
    }
    const baseArea = triangleArea(reference, a, b, c);
    if (baseArea <= meaningfulTriangleArea) continue;
    minAreaRatio = Math.min(minAreaRatio, triangleArea(candidate, a, b, c) / baseArea);
    const baseCross = triangleCross(reference, a, b, c);
    const nextCross = triangleCross(candidate, a, b, c);
    const crossLength = Math.hypot(...baseCross) * Math.hypot(...nextCross);
    if (crossLength > 1e-12) {
      minNormalDot = Math.min(minNormalDot, (
        baseCross[0] * nextCross[0]
        + baseCross[1] * nextCross[1]
        + baseCross[2] * nextCross[2]
      ) / crossLength);
    }
  }
  const seamsIntact = maxSeamGap <= topology.weldTolerance * 4;
  // Inflate, deflate, smooth, and flatten are surface-conditioning brushes and
  // should fail closed before they fold or explode a triangle. Grab is an
  // intentional freeform transform: a long pull necessarily stretches the
  // transition band, so imposing those ratios silently caps its travel.
  const boundedShape = maxEdgeStretch <= 8
    && minAreaRatio >= 0.12
    && minNormalDot >= 0.1;
  const nonCollapsed = minAreaRatio > 1e-10;
  const ok = seamsIntact && nonCollapsed && (!preventFaceFlips || minNormalDot > 0)
    && (allowLargeDeformation || boundedShape);
  return {
    maxEdgeStretch,
    maxSeamGap,
    minAreaRatio,
    minNormalDot,
    ok,
    reason: ok ? '' : 'the stroke would tear a seam or collapse/stretch a triangle',
  };
}

/** Fail-closed topology audit used by live sculpt and sparse-delta replay. */
export function auditCatalogSculptGeometry(geometry, referenceSnapshot, options = {}) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return { ok: false, reason: 'missing position data' };
  return auditCatalogPositions(geometry, referenceSnapshot, packedAttribute(position), options);
}

/** Replay portable sparse vertex deltas onto one decoded catalog mesh. */
export function applyCatalogMeshEdits(geometry, meshEdits, meshIndex = 0, { strict = false } = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(meshEdits)) return 0;
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  let applied = 0;
  for (const edit of meshEdits) {
    if (!Number.isInteger(edit?.meshIndex) || edit.meshIndex < 0) {
      if (strict) throw new Error('C8 sparse sculpt contains an invalid mesh index.');
      continue;
    }
    if (edit.meshIndex !== meshIndex) continue;
    const before = packedAttribute(position);
    const next = new Float32Array(before);
    let operationApplied = 0;
    for (const delta of Array.isArray(edit?.deltas) ? edit.deltas : []) {
      const vertexIndex = Math.round(Number(delta?.[0]));
      const x = Number(delta?.[1]);
      const y = Number(delta?.[2]);
      const z = Number(delta?.[3]);
      if (vertexIndex < 0 || vertexIndex >= position.count || ![x, y, z].every(Number.isFinite)) {
        if (strict) throw new Error(`C8 sparse sculpt references missing vertex ${vertexIndex} on mesh ${meshIndex}.`);
        continue;
      }
      const offset = vertexIndex * 3;
      next[offset] += x;
      next[offset + 1] += y;
      next[offset + 2] += z;
      operationApplied += 1;
    }
    weldCandidateDeltas(geometry, before, next);
    // Saved deltas were already constrained by their live brush. Replay only
    // guards portable data and welded seams; otherwise a legitimate long Grab
    // would disappear as soon as the editor rebuilds or reloads the project.
    const audit = auditCatalogPositions(geometry, before, next, { allowLargeDeformation: true });
    if (!audit.ok) {
      if (strict) throw new Error(`C8 sculpt edit history rejected: ${audit.reason}.`);
      // Legacy drafts may contain a malformed stroke written by an older
      // editor. Ignore only that operation so later safe strokes can still be
      // replayed instead of making the entire sculpt appear to bounce back.
      continue;
    }
    moveCatalogFillPatches(geometry, next);
    for (let index = 0; index < position.count; index += 1) {
      position.setXYZ(index, next[index * 3], next[index * 3 + 1], next[index * 3 + 2]);
    }
    applied += operationApplied;
  }
  if (applied > 0) refreshEditedGeometry(geometry, { tangents: true });
  return applied;
}

function validateC8CatalogMeshEdits(entry, meshEdits) {
  const meshVertexCounts = entry.customMeshSource.control.geometryAudit.meshVertexCounts;
  for (const edit of meshEdits) {
    const vertexCount = meshVertexCounts[edit?.meshIndex];
    if (!Number.isInteger(edit?.meshIndex) || !Number.isInteger(vertexCount) || !Array.isArray(edit.deltas)) {
      throw new Error('C8 sparse sculpt replay does not match the admitted control mesh ranges.');
    }
    const vertices = new Set();
    for (const delta of edit.deltas) {
      if (!Array.isArray(delta) || delta.length !== 4 || !Number.isInteger(delta[0])
        || delta[0] < 0 || delta[0] >= vertexCount || vertices.has(delta[0])
        || !delta.slice(1).every(Number.isFinite)) {
        throw new Error('C8 sparse sculpt replay contains an invalid or duplicate vertex target.');
      }
      vertices.add(delta[0]);
    }
  }
}

/** Apply one live sculpt stamp to decoded BufferGeometry without changing topology or UVs. */
export function sculptCatalogGeometry(geometry, {
  allowLargeDeformation = false,
  maskWeights = null,
  point,
  planePoint = point,
  normal = [0, 1, 0],
  radius = 0.5,
  referenceSnapshot = null,
  seedIndices = [],
  strength = 0.35,
  tool = 'inflate',
} = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(point)) return 0;
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  const brushRadius = Math.max(Number(radius) || 0.5, 0.001);
  const brushStrength = Math.max(Number(strength) || 0, 0);
  const center = new THREE.Vector3(...point);
  const planeNormal = new THREE.Vector3(...normal).normalize();
  const vertex = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();
  const normalAttribute = geometry.getAttribute('normal');
  const average = new THREE.Vector3();
  const neighbors = tool === 'smooth' || tool === 'erode' ? geometryAdjacency(geometry) : null;
  const weights = createCatalogSculptWeights(geometry, {
    point,
    radius: brushRadius,
    seedIndices,
    // Terrain-style brushes need a coherent patch on sparse catalog meshes.
    // A metric-only mask often selects no vertices at all between large
    // triangles; carrying the hit through a few topology rings makes the
    // default 0.5 m brush visibly useful without changing topology.
    seedWeight: 1,
    topologyFalloff: 0.5,
    topologyRings: 3,
  });
  const before = packedAttribute(position);
  const next = new Float32Array(before);
  let touched = 0;
  for (let index = 0; index < position.count; index += 1) {
    vertex.set(position.getX(index), position.getY(index), position.getZ(index));
    const protectedWeight = clamp(Number(maskWeights?.[index]) || 0, 0, 1);
    const weight = weights[index] * (1 - protectedWeight);
    if (weight <= 0) continue;
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (tool === 'smooth' || tool === 'erode') {
      const adjacent = neighbors[index];
      if (adjacent.length === 0) continue;
      average.set(0, 0, 0);
      for (const neighbor of adjacent) {
        average.x += position.getX(neighbor);
        average.y += position.getY(neighbor);
        average.z += position.getZ(neighbor);
      }
      const response = tool === 'erode' ? 0.7 : 1.2;
      // Approach the neighborhood without overshooting it at high strength.
      average.multiplyScalar(1 / adjacent.length).sub(vertex).multiplyScalar(1 - Math.exp(-brushStrength * weight * response));
      ({ x: dx, y: dy, z: dz } = average);
      if (tool === 'erode') dy -= brushRadius * brushStrength * weight * 0.08;
    } else if (tool === 'flatten') {
      const signedDistance = (vertex.x - planePoint[0]) * planeNormal.x
        + (vertex.y - planePoint[1]) * planeNormal.y + (vertex.z - planePoint[2]) * planeNormal.z;
      const amount = -signedDistance * (1 - Math.exp(-brushStrength * weight * 1.6));
      dx = planeNormal.x * amount;
      dy = planeNormal.y * amount;
      dz = planeNormal.z * amount;
    } else if (tool === 'scrape') {
      const signedDistance = vertex.clone().sub(center).dot(planeNormal);
      const amount = (-Math.max(signedDistance, 0) * (1 - Math.exp(-brushStrength * weight * 1.8)))
        - (brushRadius * brushStrength * weight * 0.06);
      dx = planeNormal.x * amount;
      dy = planeNormal.y * amount;
      dz = planeNormal.z * amount;
    } else if (tool === 'pinch') {
      const toCenter = center.clone().sub(vertex);
      toCenter.addScaledVector(planeNormal, -toCenter.dot(planeNormal));
      toCenter.multiplyScalar(1 - Math.exp(-brushStrength * weight * 0.55));
      const ridge = brushRadius * brushStrength * weight * 0.08;
      dx = toCenter.x + planeNormal.x * ridge;
      dy = toCenter.y + planeNormal.y * ridge;
      dz = toCenter.z + planeNormal.z * ridge;
    } else if (tool === 'terrace') {
      const step = Math.max(brushRadius * 0.2, 0.01);
      const targetY = Math.round(vertex.y / step) * step;
      dy = (targetY - vertex.y) * (1 - Math.exp(-brushStrength * weight));
    } else if (tool === 'clay') {
      // Deposit towards a raised brush plane. Low areas fill before high
      // ridges, producing a broad clay pad rather than a scaled Inflate.
      const height = vertex.clone().sub(center).dot(planeNormal);
      const amount = Math.max(0, brushRadius * 0.3 - height)
        * (1 - Math.exp(-brushStrength * weight * 1.4));
      dx = planeNormal.x * amount;
      dy = planeNormal.y * amount;
      dz = planeNormal.z * amount;
    } else if (tool === 'roughen') {
      const noise = ((hash(`${index}:${Math.round(center.x * 97)}:${Math.round(center.y * 89)}:${Math.round(center.z * 83)}`) / 0xffffffff) * 2) - 1;
      const amount = brushRadius * brushStrength * weight * noise * 0.32;
      const direction = normalAttribute
        ? vertexNormal.set(normalAttribute.getX(index), normalAttribute.getY(index), normalAttribute.getZ(index)).normalize()
        : planeNormal;
      dx = direction.x * amount;
      dy = direction.y * amount;
      dz = direction.z * amount;
    } else {
      const direction = tool === 'deflate' ? -1 : 1;
      const effectiveWeight = tool === 'crack' ? weight ** 3 : weight;
      const toolScale = tool === 'clay' ? 0.42 : tool === 'crack' ? 0.9 : 0.65;
      const toolDirection = tool === 'crack' ? -1 : direction;
      const amount = brushRadius * brushStrength * effectiveWeight * toolScale * toolDirection;
      // True inflate/deflate follows the surface normal field rather than
      // translating the whole brush patch along one hit-face normal. Normals
      // are welded after every edit, and candidate deltas are welded again
      // below, so UV/hard-normal seam twins still travel together.
      if (normalAttribute) {
        vertexNormal.set(
          normalAttribute.getX(index),
          normalAttribute.getY(index),
          normalAttribute.getZ(index),
        ).normalize();
      } else {
        vertexNormal.copy(planeNormal);
      }
      dx = vertexNormal.x * amount;
      dy = vertexNormal.y * amount;
      dz = vertexNormal.z * amount;
    }
    next[index * 3] += dx;
    next[(index * 3) + 1] += dy;
    next[(index * 3) + 2] += dz;
    touched += 1;
  }
  if (touched === 0) return 0;
  weldCandidateDeltas(geometry, before, next);
  // Free brushes validate the current step, not a cumulative stroke budget.
  const auditReference = !allowLargeDeformation && referenceSnapshot?.length === before.length ? referenceSnapshot : before;
  const auditOptions = { allowLargeDeformation };
  const requested = new Float32Array(next);
  if (!auditCatalogPositions(geometry, auditReference, next, auditOptions).ok) {
    let safeScale = 0;
    let unsafeScale = 1;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const scale = (safeScale + unsafeScale) * 0.5;
      for (let offset = 0; offset < next.length; offset += 1) {
        next[offset] = before[offset] + ((requested[offset] - before[offset]) * scale);
      }
      weldCandidateDeltas(geometry, before, next);
      if (auditCatalogPositions(geometry, auditReference, next, auditOptions).ok) safeScale = scale;
      else unsafeScale = scale;
    }
    if (safeScale <= 1e-5) return 0;
    for (let offset = 0; offset < next.length; offset += 1) {
      next[offset] = before[offset] + ((requested[offset] - before[offset]) * safeScale);
    }
    weldCandidateDeltas(geometry, before, next);
  }
  moveCatalogFillPatches(geometry, next);
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(index, next[index * 3], next[(index * 3) + 1], next[(index * 3) + 2]);
  }
  refreshEditedGeometry(geometry);
  return touched;
}

/** Build a closed, deterministic cutter whose radius varies around and along the bore. */
export function createCatalogDrillCutterGeometry({
  length,
  radius,
  roughness = 0,
  seed = 0,
} = {}) {
  const cutterLength = Math.max(Number(length) || 0.01, 0.01);
  const cutterRadius = Math.max(Number(radius) || 0.01, 0.01);
  const wallRoughness = clamp(Number(roughness) || 0, 0, 1);
  const radialSegments = 32;
  const heightSegments = wallRoughness > 0 ? 8 : 1;
  const geometry = new THREE.CylinderGeometry(
    cutterRadius,
    cutterRadius,
    cutterLength,
    radialSegments,
    heightSegments,
    false,
  );
  if (wallRoughness <= 0) return geometry;

  const position = geometry.getAttribute('position');
  const phaseA = signed(Math.round(Number(seed) || 0) >>> 0, 0) * Math.PI;
  const phaseB = signed(Math.round(Number(seed) || 0) >>> 0, 1) * Math.PI;
  const phaseC = signed(Math.round(Number(seed) || 0) >>> 0, 2) * Math.PI;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const radialDistance = Math.hypot(x, z);
    if (radialDistance < cutterRadius * 0.05) continue;
    const angle = Math.atan2(z, x);
    const axial = clamp((y / cutterLength) + 0.5, 0, 1);
    const angularNoise = (
      Math.sin(angle * 3 + phaseA) * 0.52
      + Math.sin(angle * 7 + phaseB) * 0.3
      + Math.sin(angle * 11 + phaseC) * 0.18
    );
    const wallNoise = Math.sin((axial * Math.PI * 3.5) + (angle * 2) + phaseB) * 0.35;
    const radialScale = 1 + wallRoughness * 0.24 * clamp(angularNoise + wallNoise, -1, 1);
    position.setXYZ(index, x * radialScale, y, z * radialScale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Subtract a capped, optionally irregular cylindrical cutter from an editable
 * catalog mesh. A blind cut ends at `depth`; a through cut extends beyond the
 * measured local bounds. The returned geometry owns new topology and can be
 * sculpted and exported.
 */
export function drillCatalogGeometry(geometry, {
  kernel = 'legacy',
  depth = 0.75,
  normal = [0, 1, 0],
  point,
  radius = 0.25,
  roughness = 0,
  seed = 0,
  through = false,
} = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(point) || !Array.isArray(normal)) return null;
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return null;
  geometry.computeBoundingBox();
  const dimensions = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const diagonal = Math.max(dimensions.length(), 0.1);
  const cutRadius = Math.max(Number(radius) || 0.25, 0.01);
  const requestedDepth = Math.max(Number(depth) || 0.75, 0.01);
  const surfaceNormal = new THREE.Vector3(...normal);
  if (surfaceNormal.lengthSq() < 1e-12) return null;
  surfaceNormal.normalize();
  const overcut = Math.max(cutRadius * 0.2, diagonal * 0.002, 0.002);
  const cutDepth = through ? diagonal * 2 + cutRadius * 2 : requestedDepth;
  const length = cutDepth + overcut;
  const center = new THREE.Vector3(...point)
    .addScaledVector(surfaceNormal, (overcut - cutDepth) * 0.5);
  const requestedRoughness = clamp(Number(roughness) || 0, 0, 1);
  const requestedSeed = Math.round(Number(seed) || 0) >>> 0;
  const sourceGeometry = repairCatalogTopology(geometry) ?? geometry.clone();
  if (!sourceGeometry.getAttribute('normal')) sourceGeometry.computeVertexNormals();
  const source = new Brush(sourceGeometry);
  source.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', ...(sourceGeometry.getAttribute('uv') ? ['uv'] : [])];
  evaluator.useGroups = false;
  // The legacy triangle splitter can leave gaps around a cylinder crossing
  // large, low-poly faces. Constrained Delaunay clipping keeps the generated
  // tunnel wall tessellated through the full entrance/exit loop.
  evaluator.useCDTClipping = true;
  // A rough cutter can occasionally place one of its wall vertices exactly on
  // a source edge. That is a Boolean triangulation ambiguity, not an invalid
  // user request. Retry deterministic rough-wall phases and microscopic axial
  // offsets before rejecting the bore. Replay receives the same saved seed,
  // so whichever candidate succeeds remains stable across reloads and export.
  const attempts = [
    { axial: 0, roughness: requestedRoughness, seed: requestedSeed },
    { axial: diagonal * 1e-6, roughness: requestedRoughness, seed: (requestedSeed + 0x9e3779b9) >>> 0 },
    { axial: -diagonal * 1e-6, roughness: requestedRoughness, seed: (requestedSeed + 0x3c6ef372) >>> 0 },
    { axial: diagonal * 4e-6, roughness: requestedRoughness, seed: (requestedSeed + 0xdaa66d2b) >>> 0 },
    { axial: -diagonal * 4e-6, roughness: requestedRoughness, seed: (requestedSeed + 0x78dde6e4) >>> 0 },
    { axial: 0, roughness: requestedRoughness, seed: (requestedSeed + 0x1715609d) >>> 0 },
  ];
  try {
    for (const attempt of attempts) {
      const cutterGeometry = createCatalogDrillCutterGeometry({
        length,
        radius: cutRadius,
        roughness: attempt.roughness,
        seed: attempt.seed,
      });
      const cutter = new Brush(cutterGeometry);
      cutter.position.copy(center).addScaledVector(surfaceNormal, attempt.axial);
      cutter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNormal.clone().negate());
      cutter.updateMatrixWorld(true);
      let result = null;
      try {
        // Prefer the solid kernel: the triangle splitter can produce closed
        // but nearly coplanar slivers around long through-bores. Manifold's
        // cleaned solid result avoids those visible wall/entrance artifacts.
        const solidCutter = cutterGeometry.clone().applyMatrix4(cutter.matrixWorld);
        const solidResult = kernel === 'manifold' ? solidCatalogBoolean(sourceGeometry, solidCutter, SUBTRACTION) : null;
        solidCutter.dispose();
        if (solidResult) {
          const fillCutter = cutterGeometry.clone().scale(1.02, 1.02, 1.02).applyMatrix4(cutter.matrixWorld);
          const plug = catalogBoolean(sourceGeometry, fillCutter, INTERSECTION);
          fillCutter.dispose();
          if (plug) {
            solidResult.userData.toonlabFillPatches = [
              ...structuredClone(geometry.userData.toonlabFillPatches ?? []),
              { point: [...point], geometry: serializeCatalogGeometry(plug, 0, { includeFills: false }) },
            ];
            solidResult.userData.toonlabDrillKernel = 'manifold';
            plug.dispose();
            return inheritCatalogEditState(geometry, solidResult);
          }
          solidResult.dispose();
        }
        result = evaluator.evaluate(source, cutter, SUBTRACTION);
        let output = result?.geometry;
        const outputPosition = output?.getAttribute?.('position');
        if (!output?.isBufferGeometry || !outputPosition || outputPosition.count < 3
          || !outputPosition.array.every(Number.isFinite)) {
          output?.dispose?.();
          continue;
        }
        if (output.index) {
          // Evaluator results are indexed. Clearing the index does not expand the
          // triangles; it renders the compact vertex table as a triangle soup and
          // drops most of the generated tunnel wall. Convert it explicitly so
          // sculpt deltas retain their simple per-vertex addressing without
          // sacrificing any Boolean triangles.
          const indexedOutput = output;
          output = indexedOutput.toNonIndexed();
          indexedOutput.dispose();
        }
        output.deleteAttribute('tangent');
        refreshEditedGeometry(output, { tangents: true });
        const repaired = repairCatalogTopology(output);
        output.dispose();
        if (repaired) {
          // Retain only the removed local volume, with a small overlap for a
          // stable future union. Fill no longer deletes an earlier operation
          // or reuses vertex indices from a different topology.
          const fillCutter = cutterGeometry.clone().scale(1.02, 1.02, 1.02).applyMatrix4(cutter.matrixWorld);
          const plug = catalogBoolean(sourceGeometry, fillCutter, INTERSECTION);
          fillCutter.dispose();
          if (!plug) { repaired.dispose(); continue; }
          repaired.userData.toonlabFillPatches = [
            ...structuredClone(geometry.userData.toonlabFillPatches ?? []),
            { point: [...point], geometry: serializeCatalogGeometry(plug, 0, { includeFills: false }) },
          ];
          plug.dispose();
          return inheritCatalogEditState(geometry, repaired);
        }
      } catch {
        result?.geometry?.dispose?.();
      } finally {
        cutterGeometry.dispose();
        cutter.disposeCacheData?.();
      }
    }
    return null;
  } finally {
    sourceGeometry.dispose();
    source.disposeCacheData?.();
  }
}

function capCatalogPlanarBoundaries(geometry, planeNormal) {
  const surface = repairCatalogTopology(geometry, { allowOpen: true, closeBoundaries: false });
  const position = surface?.getAttribute?.('position');
  const index = surface?.index;
  if (!surface || !position || !index) {
    surface?.dispose();
    return null;
  }
  surface.computeBoundingBox();
  const diagonal = Math.max(surface.boundingBox.getSize(new THREE.Vector3()).length(), 1e-6);
  const edgeCounts = new Map();
  const directedEdges = new Set();
  for (let offset = 0; offset < index.count; offset += 3) {
    const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      directedEdges.add(`${left}:${right}`);
    }
  }
  const adjacency = new Map();
  for (const [key, count] of edgeCounts) {
    if (count !== 1) continue;
    const [left, right] = key.split(':').map(Number);
    if (!adjacency.has(left)) adjacency.set(left, []);
    if (!adjacency.has(right)) adjacency.set(right, []);
    adjacency.get(left).push(right);
    adjacency.get(right).push(left);
  }
  if (adjacency.size === 0) return surface;
  if ([...adjacency.values()].some((neighbors) => neighbors.length !== 2)) {
    surface.dispose();
    return null;
  }
  const visited = new Set();
  const loops = [];
  for (const start of adjacency.keys()) {
    const first = adjacency.get(start)[0];
    const firstKey = start < first ? `${start}:${first}` : `${first}:${start}`;
    if (visited.has(firstKey)) continue;
    const loop = [start];
    let previous = start;
    let current = first;
    while (current !== start && loop.length <= adjacency.size + 1) {
      loop.push(current);
      const edgeKey = previous < current ? `${previous}:${current}` : `${current}:${previous}`;
      visited.add(edgeKey);
      const neighbors = adjacency.get(current);
      const next = neighbors[0] === previous ? neighbors[1] : neighbors[0];
      previous = current;
      current = next;
    }
    if (current !== start || loop.length < 3) {
      surface.dispose();
      return null;
    }
    const closingKey = previous < start ? `${previous}:${start}` : `${start}:${previous}`;
    visited.add(closingKey);
    loops.push(loop);
  }
  const normal = planeNormal.clone().normalize();
  const dominantAxis = ['x', 'y', 'z'].reduce((best, axis) => (
    Math.abs(normal[axis]) > Math.abs(normal[best]) ? axis : best
  ), 'x');
  const project = (vertex) => {
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    if (dominantAxis === 'x') return new THREE.Vector2(y, z);
    if (dominantAxis === 'y') return new THREE.Vector2(x, z);
    return new THREE.Vector2(x, y);
  };
  const signedArea = (points) => points.reduce((sum, point, pointIndex) => {
    const next = points[(pointIndex + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) * 0.5;
  const containsPoint = (polygon, point) => {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
      const left = polygon[current];
      const right = polygon[previous];
      if (((left.y > point.y) !== (right.y > point.y))
        && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x) {
        inside = !inside;
      }
    }
    return inside;
  };
  const contours = loops.map((verticesInLoop, loopIndex) => {
    const points = verticesInLoop.map(project);
    return { area: Math.abs(signedArea(points)), depth: 0, loopIndex, parent: null, points, vertices: verticesInLoop };
  }).sort((left, right) => right.area - left.area);
  for (let childIndex = 0; childIndex < contours.length; childIndex += 1) {
    const child = contours[childIndex];
    for (let parentIndex = childIndex - 1; parentIndex >= 0; parentIndex -= 1) {
      const parent = contours[parentIndex];
      if (!containsPoint(parent.points, child.points[0])) continue;
      if (!child.parent || parent.area < child.parent.area) child.parent = parent;
    }
    child.depth = child.parent ? child.parent.depth + 1 : 0;
  }
  const capIndices = [];
  for (const outer of contours.filter((contour) => contour.depth % 2 === 0)) {
    const holes = contours.filter((contour) => contour.parent === outer && contour.depth % 2 === 1);
    const flatVertices = [outer, ...holes].flatMap((contour) => contour.vertices);
    const flatPoints = [outer, ...holes].flatMap((contour) => contour.points);
    let faces = THREE.ShapeUtils.triangulateShape(
      outer.points,
      holes.map((hole) => hole.points),
    ).map((face) => [...face]);
    if (faces.length === 0) {
      surface.dispose();
      return null;
    }
    for (let omitted = 0; omitted < flatPoints.length; omitted += 1) {
      if (faces.some((face) => face.includes(omitted))) continue;
      let inserted = false;
      for (let faceIndex = 0; faceIndex < faces.length && !inserted; faceIndex += 1) {
        const face = faces[faceIndex];
        for (let edge = 0; edge < 3; edge += 1) {
          const left = face[edge];
          const right = face[(edge + 1) % 3];
          const opposite = face[(edge + 2) % 3];
          const segment = flatPoints[right].clone().sub(flatPoints[left]);
          const lengthSquared = segment.lengthSq();
          if (lengthSquared <= 1e-16) continue;
          const amount = flatPoints[omitted].clone().sub(flatPoints[left]).dot(segment) / lengthSquared;
          if (amount <= 1e-6 || amount >= 1 - 1e-6) continue;
          const closest = flatPoints[left].clone().addScaledVector(segment, amount);
          if (closest.distanceTo(flatPoints[omitted]) > diagonal * 4e-6) continue;
          faces.splice(faceIndex, 1, [left, omitted, opposite], [omitted, right, opposite]);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        surface.dispose();
        return null;
      }
    }
    let reverse = null;
    for (const face of faces) {
      const vertices = face.map((faceIndex) => flatVertices[faceIndex]);
      for (const [left, right] of [[vertices[0], vertices[1]], [vertices[1], vertices[2]], [vertices[2], vertices[0]]]) {
        const key = left < right ? `${left}:${right}` : `${right}:${left}`;
        if (edgeCounts.get(key) !== 1) continue;
        reverse = directedEdges.has(`${left}:${right}`);
        break;
      }
      if (reverse !== null) break;
    }
    if (reverse === null) {
      surface.dispose();
      return null;
    }
    for (const face of faces) {
      const [first, second, third] = face.map((faceIndex) => flatVertices[faceIndex]);
      if (reverse) capIndices.push(first, third, second);
      else capIndices.push(first, second, third);
    }
  }
  const capped = surface.clone();
  capped.setIndex([...Array.from(index.array, Number), ...capIndices]);
  surface.dispose();
  refreshEditedGeometry(capped, { tangents: true });
  const repaired = repairCatalogTopology(capped, { closeBoundaries: false });
  capped.dispose();
  return repaired;
}

function manuallyClipCatalogGeometryByPlane(geometry, { keepPositive, normal, point }) {
  const source = repairCatalogTopology(geometry) ?? geometry.clone();
  const position = source.getAttribute('position');
  const index = source.index;
  const planeNormal = new THREE.Vector3(...normal).normalize();
  const planePoint = new THREE.Vector3(...point);
  const direction = keepPositive ? 1 : -1;
  const vertices = [];
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  const readVertex = (vertex) => new THREE.Vector3(
    position.getX(vertex), position.getY(vertex), position.getZ(vertex),
  );
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const polygon = [0, 1, 2].map((corner) => readVertex(
      index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner,
    ));
    const clipped = [];
    for (let edge = 0; edge < polygon.length; edge += 1) {
      const current = polygon[edge];
      const next = polygon[(edge + 1) % polygon.length];
      const currentDistance = current.clone().sub(planePoint).dot(planeNormal) * direction;
      const nextDistance = next.clone().sub(planePoint).dot(planeNormal) * direction;
      const currentInside = currentDistance >= -1e-8;
      const nextInside = nextDistance >= -1e-8;
      if (currentInside) clipped.push(current.clone());
      if (currentInside !== nextInside) {
        clipped.push(current.clone().lerp(next, clamp(
          currentDistance / (currentDistance - nextDistance), 0, 1,
        )));
      }
    }
    for (let corner = 1; corner < clipped.length - 1; corner += 1) {
      vertices.push(...clipped[0].toArray(), ...clipped[corner].toArray(), ...clipped[corner + 1].toArray());
    }
  }
  source.dispose();
  if (vertices.length < 9) return null;
  const clipped = new THREE.BufferGeometry();
  clipped.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const capped = capCatalogPlanarBoundaries(clipped, planeNormal);
  clipped.dispose();
  return capped;
}

function clipCatalogGeometryByPlane(geometry, {
  keepPositive = false,
  normal,
  point,
} = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(normal) || !Array.isArray(point)) return null;
  const planeNormal = new THREE.Vector3(...normal).normalize();
  const planePoint = new THREE.Vector3(...point);
  if (planeNormal.lengthSq() < 1e-12 || !geometry.getAttribute('position')) return null;
  const sourceGeometry = repairCatalogTopology(geometry) ?? geometry.clone();
  sourceGeometry.computeBoundingBox();
  const diagonal = Math.max(sourceGeometry.boundingBox.getSize(new THREE.Vector3()).length(), 0.1);
  const depth = diagonal * 4;
  const span = diagonal * 4;
  const halfSpaceNormal = keepPositive ? planeNormal : planeNormal.clone().negate();
  const cutterGeometry = new THREE.BoxGeometry(span, depth, span);
  const cutter = new Brush(cutterGeometry);
  cutter.position.copy(planePoint).addScaledVector(halfSpaceNormal, depth * 0.5);
  cutter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), halfSpaceNormal);
  cutter.updateMatrixWorld(true);
  const transformedCutter = cutterGeometry.clone().applyMatrix4(cutter.matrixWorld);
  try {
    return catalogBoolean(sourceGeometry, transformedCutter, INTERSECTION)
      ?? manuallyClipCatalogGeometryByPlane(geometry, { keepPositive, normal, point });
  } finally {
    sourceGeometry.dispose();
    transformedCutter.dispose();
    cutterGeometry.dispose();
    cutter.disposeCacheData?.();
  }
}

function cutFillPatches(geometry, normal, point, separation = null) {
  const patches = [];
  const planeNormal = new THREE.Vector3(...normal).normalize();
  const planePoint = new THREE.Vector3(...point);
  for (const patch of geometry.userData.toonlabFillPatches ?? []) {
    const source = deserializeCatalogGeometry(patch.geometry);
    const pieces = [];
    const position = source.getAttribute('position');
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const d = new THREE.Vector3().fromBufferAttribute(position, i).sub(planePoint).dot(planeNormal);
      min = Math.min(min, d); max = Math.max(max, d);
    }
    for (const positive of separation === null ? [false] : [false, true]) {
      if (positive ? max < 0 : min > 0) continue;
      const piece = (positive ? min >= 0 : max <= 0) ? source.clone()
        : clipCatalogGeometryByPlane(source, { keepPositive: positive, normal, point });
      if (!piece) { source.dispose(); pieces.forEach((part) => part.dispose()); return null; }
      if (separation !== null) piece.translate(...planeNormal.clone().multiplyScalar((positive ? 1 : -1) * separation).toArray());
      pieces.push(piece);
    }
    source.dispose();
    if (!pieces.length) continue;
    const merged = mergeGeometries(pieces, false);
    pieces.forEach((part) => part.dispose());
    if (!merged) return null;
    const anchor = new THREE.Vector3(...patch.point);
    if (separation !== null) anchor.addScaledVector(planeNormal, anchor.clone().sub(planePoint).dot(planeNormal) >= 0 ? separation : -separation);
    patches.push({ point: anchor.toArray(), geometry: serializeCatalogGeometry(merged, 0, { includeFills: false }) });
    merged.dispose();
  }
  return patches;
}

export function trimCatalogGeometry(geometry, { normal = [0, 1, 0], point } = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(point)) return null;
  const result = clipCatalogGeometryByPlane(geometry, { keepPositive: false, normal, point });
  if (!result) return null;
  const patches = cutFillPatches(geometry, normal, point);
  if (!patches) { result.dispose(); return null; }
  result.userData.toonlabFillPatches = patches;
  return inheritCatalogEditState(geometry, result);
}

export function fractureCatalogGeometry(geometry, {
  normal = [1, 0, 0],
  point,
  width = 0.05,
} = {}) {
  if (!geometry?.isBufferGeometry || !Array.isArray(point)) return null;
  const planeNormal = new THREE.Vector3(...normal).normalize();
  if (planeNormal.lengthSq() < 1e-12) return null;
  const splitPoint = new THREE.Vector3(...point);
  if (!geometry.getAttribute('position')) return null;
  const requestedSeparation = Math.max(Number(width) || 0.05, 0.001);
  // Preserve the requested plane. A failed cut must not silently turn into a
  // different location or orientation on the rock.
  const left = clipCatalogGeometryByPlane(geometry, {
    keepPositive: false, normal: planeNormal.toArray(), point: splitPoint.toArray(),
  });
  const right = clipCatalogGeometryByPlane(geometry, {
    keepPositive: true, normal: planeNormal.toArray(), point: splitPoint.toArray(),
  });
  if (!left || !right) {
    left?.dispose();
    right?.dispose();
    return null;
  }
  const separation = requestedSeparation * 0.5;
  left.translate(
    -planeNormal.x * separation,
    -planeNormal.y * separation,
    -planeNormal.z * separation,
  );
  right.translate(
    planeNormal.x * separation,
    planeNormal.y * separation,
    planeNormal.z * separation,
  );
  const merged = mergeGeometries([left, right], false);
  const repaired = merged && (repairCatalogTopology(merged) ?? solidCatalogBoolean(left, right, ADDITION));
  left.dispose();
  right.dispose();
  merged?.dispose();
  if (repaired) {
    const patches = cutFillPatches(geometry, planeNormal.toArray(), splitPoint.toArray(), separation);
    if (!patches) { repaired.dispose(); return null; }
    repaired.userData.toonlabFillPatches = patches;
    inheritCatalogEditState(geometry, repaired);
  }
  return repaired;
}

export function unionCatalogGeometryComponents(geometry) {
  if (!geometry?.isBufferGeometry || !geometry.getAttribute('position')) return null;
  const { adjacency } = geometryTopology(geometry);
  const components = [];
  const visited = new Set();
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    const component = new Set();
    const pending = [start];
    while (pending.length > 0) {
      const index = pending.pop();
      if (visited.has(index)) continue;
      visited.add(index);
      component.add(index);
      for (const neighbor of adjacency[index]) if (!visited.has(neighbor)) pending.push(neighbor);
    }
    components.push(component);
  }
  if (components.length < 2) return null;
  const sourceIndex = geometry.index;
  const indexValues = sourceIndex ? Array.from(sourceIndex.array, Number) : Array.from(
    { length: geometry.getAttribute('position').count },
    (_, index) => index,
  );
  const componentGeometries = components.flatMap((component) => {
    const indices = [];
    for (let offset = 0; offset < indexValues.length; offset += 3) {
      if (component.has(indexValues[offset])) indices.push(...indexValues.slice(offset, offset + 3));
    }
    if (indices.length === 0) return [];
    const result = geometry.clone();
    result.setIndex(indices);
    result.clearGroups();
    result.computeVertexNormals();
    return [result];
  });
  if (componentGeometries.length < 2) { componentGeometries.forEach((part) => part.dispose()); return null; }
  let current = componentGeometries.shift();
  try {
    for (const componentGeometry of componentGeometries) {
      const left = new Brush(current);
      const right = new Brush(componentGeometry);
      left.updateMatrixWorld(true);
      right.updateMatrixWorld(true);
      const evaluator = new Evaluator();
      evaluator.attributes = ['position', 'normal', ...(current.getAttribute('uv') && componentGeometry.getAttribute('uv') ? ['uv'] : [])];
      evaluator.useGroups = false;
      evaluator.useCDTClipping = true;
      const result = evaluator.evaluate(left, right, ADDITION)?.geometry;
      left.disposeCacheData?.();
      right.disposeCacheData?.();
      current.dispose();
      componentGeometry.dispose();
      if (!result?.getAttribute?.('position')) return null;
      current = result;
    }
    refreshEditedGeometry(current, { tangents: true });
    const repaired = repairCatalogTopology(current);
    current.dispose();
    return repaired;
  } catch {
    current?.dispose?.();
    for (const componentGeometry of componentGeometries) componentGeometry.dispose();
    return null;
  }
}

export function applyCatalogMeshOperations(geometry, {
  meshCuts = [],
  meshEdits = [],
  meshIndex = 0,
  meshOperationOrder = null,
  strict = false,
} = {}) {
  const order = Array.isArray(meshOperationOrder) && meshOperationOrder.length > 0
    ? meshOperationOrder
    : [
        ...meshEdits.map((_, index) => ({ index, type: 'sculpt' })),
        ...meshCuts.map((_, index) => ({ index, type: 'drill' })),
      ];
  let current = geometry;
  for (const operation of order) {
    if (operation?.type === 'sculpt') {
      const edit = meshEdits[operation.index];
      if (edit?.meshIndex !== meshIndex) continue;
      applyCatalogMeshEdits(current, [edit], meshIndex, { strict });
      continue;
    }
    if (operation?.type !== 'drill') continue;
    const cut = meshCuts[operation.index];
    if (cut?.meshIndex !== meshIndex) continue;
    const drilled = drillCatalogGeometry(current, cut);
    if (!drilled) {
      if (strict) throw new Error(`Drill cut ${operation.index} could not be replayed.`);
      continue;
    }
    current.dispose();
    current = drilled;
  }
  return current;
}

/** Bake the regular Rock Generation surface stack onto an imported GLB mesh. */
export function applyCatalogGeneratedSurface(geometry, surface, seed = 0) {
  if (!geometry?.isBufferGeometry || !surface) return false;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return false;
  const positions = packedAttribute(position);
  const normals = packedAttribute(normal);
  const ao = new Float32Array(position.count).fill(1);
  const bounds = geometry.boundingBox;
  const colors = computeVertexColors(
    positions,
    normals,
    ao,
    surface,
    Math.round(Number(seed) || 0) >>> 0,
    {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    },
  );
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return true;
}

/** Tint only the upward-facing cap while leaving the authored GLB material neutral elsewhere. */
export function applyCatalogSourceTopOverlay(geometry, surface, seed = 0) {
  if (!geometry?.isBufferGeometry || !surface) return false;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const bounds = geometry.boundingBox;
  if (!position || !normal || !bounds) return false;

  const positions = packedAttribute(position);
  const normals = packedAttribute(normal);
  const boundsArray = {
    min: [bounds.min.x, bounds.min.y, bounds.min.z],
    max: [bounds.max.x, bounds.max.y, bounds.max.z],
  };
  const colors = computeVertexColors(
    positions,
    normals,
    new Float32Array(position.count).fill(1),
    {
      ...surface,
      baseColor: [1, 1, 1],
      cavityColor: [1, 1, 1],
      colorNoise: 0,
      textureStrength: 0,
      textureStyle: 'none',
      topCoatStrength: 0,
    },
    Math.round(Number(seed) || 0) >>> 0,
    boundsArray,
  );
  const coat = clamp(Number(surface.topCoatStrength) || 0, 0, 1);
  const topHeightStart = clamp(Number(surface.topHeightStart) || 0, 0, 1);
  const topSlopeStart = clamp(Number(surface.topSlopeStart) || 0, 0, 1);
  const sourceColor = Array.isArray(surface.topColor) ? surface.topColor : [1, 1, 1];
  const topColor = sourceColor.map((channel) => {
    const srgb = clamp(Number(channel) || 0, 0, 1);
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const heightSpan = Math.max(bounds.max.y - bounds.min.y, 1e-6);
  for (let index = 0; index < position.count; index += 1) {
    const normalizedHeight = (position.getY(index) - bounds.min.y) / heightSpan;
    const heightMask = smoothstep(topHeightStart, Math.min(topHeightStart + 0.16, 1), normalizedHeight);
    const slopeMask = smoothstep(topSlopeStart, Math.min(topSlopeStart + 0.18, 1), normal.getY(index));
    const blend = clamp(heightMask * slopeMask * coat, 0, 1);
    const offset = index * 3;
    colors[offset] += (topColor[0] - colors[offset]) * blend;
    colors[offset + 1] += (topColor[1] - colors[offset + 1]) * blend;
    colors[offset + 2] += (topColor[2] - colors[offset + 2]) * blend;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return true;
}

function enableVertexColors(material) {
  for (const entry of materialsOf({ material })) {
    if (!entry) continue;
    entry.vertexColors = true;
    entry.needsUpdate = true;
  }
}

function disposeMaterials(material, { textures = false } = {}) {
  for (const entry of Array.isArray(material) ? material : [material]) {
    if (!entry) continue;
    if (textures) {
      for (const value of Object.values(entry)) {
        if (value?.isTexture) value.dispose();
      }
    }
    entry.dispose?.();
  }
}

function createVariationProfile(referenceId, seed, strength, settings = {}) {
  const amount = clamp(Number(strength) || 0, 0, 1);
  const identitySeed = hash(`${referenceId}:${Math.round(Number(seed) || 0) >>> 0}`);
  const profile = {
    bulge: round(signed(identitySeed, 8) * 0.09 * amount),
    leanX: round(signed(identitySeed, 3) * 0.11 * amount),
    leanZ: round(signed(identitySeed, 4) * 0.11 * amount),
    noiseAmplitude: round((0.012 + Math.abs(signed(identitySeed, 9)) * 0.022) * amount),
    noiseFrequency: round(1.15 + Math.abs(signed(identitySeed, 10)) * 1.35),
    phases: Object.freeze([
      round(signed(identitySeed, 11) * Math.PI),
      round(signed(identitySeed, 12) * Math.PI),
      round(signed(identitySeed, 13) * Math.PI),
    ]),
    scale: Object.freeze([
      round(1 + signed(identitySeed, 0) * 0.1 * amount),
      round(1 + signed(identitySeed, 1) * 0.12 * amount),
      round(1 + signed(identitySeed, 2) * 0.1 * amount),
    ]),
    seed: Math.round(Number(seed) || 0) >>> 0,
    strength: amount,
    taper: round(signed(identitySeed, 7) * 0.13 * amount),
    twist: round(signed(identitySeed, 5) * 0.14 * amount),
  };
  for (const key of ['leanX', 'leanZ', 'twist', 'taper', 'bulge', 'noiseAmplitude']) {
    if (Number.isFinite(settings[key])) profile[key] = settings[key] * amount;
  }
  if (Number.isFinite(settings.noiseFrequency)) profile.noiseFrequency = settings.noiseFrequency;
  profile.scale = ['width', 'height', 'depth'].map((key, i) => Number.isFinite(settings[key])
    ? 1 + (settings[key] - 1) * amount : profile.scale[i]);
  profile.anchorBase = settings.anchorBase !== false;
  profile.scope = settings.scope ?? (settings.version === 2 ? 'whole' : 'mesh');
  profile.spatialField = settings.version === 2;
  return Object.freeze(profile);
}

function variationComponentBounds(geometry) {
  const position = geometry.attributes.position, adjacency = geometryAdjacency(geometry);
  const frames = [], seen = new Set();
  for (let i = 0; i < position.count; i += 1) {
    if (seen.has(i)) continue;
    const indices = [i]; seen.add(i); const box = new THREE.Box3();
    for (let cursor = 0; cursor < indices.length; cursor += 1) {
      const index = indices[cursor]; box.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, index));
      for (const neighbor of adjacency[index]) if (!seen.has(neighbor)) { seen.add(neighbor); indices.push(neighbor); }
    }
    for (const index of indices) frames[index] = box;
  }
  return frames;
}

/** Clone and conservatively deform one rock template mesh without changing topology or UVs. */
export function deformCatalogGeometry(source, profile, { maximumDisplacementMetres = Infinity, bounds: sharedBounds = null } = {}) {
  if (!source?.isBufferGeometry) throw new TypeError('Catalog variation requires BufferGeometry.');
  const result = source.clone();
  result.computeBoundingBox();
  if (!profile || profile.strength <= 0) {
    result.computeBoundingSphere();
    return result;
  }

  const bounds = sharedBounds?.clone() ?? result.boundingBox.clone();
  const frameFor = (box) => {
    const size = box.getSize(new THREE.Vector3());
    const extentX = Math.max(size.x * 0.5, 1e-4), extentY = Math.max(size.y, 1e-4), extentZ = Math.max(size.z * 0.5, 1e-4);
    return { center: box.getCenter(new THREE.Vector3()), baseY: box.min.y, extentX, extentY, extentZ,
      referenceScale: Math.max(Math.min(extentX, extentY * 0.5, extentZ), 1e-4) };
  };
  const wholeFrame = frameFor(bounds);
  const position = result.getAttribute('position');
  const componentFrames = [];
  if (profile.scope === 'component' && position.count > 1) {
    const frames = new Map();
    variationComponentBounds(source).forEach((box, index) => {
      if (!frames.has(box)) frames.set(box, frameFor(box));
      componentFrames[index] = frames.get(box);
    });
  }
  const sourcePositions = packedAttribute(source.getAttribute('position'));
  const sourceNormal = source.getAttribute('normal');
  const normal = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    const { center, baseY, extentX, extentY, extentZ, referenceScale } = componentFrames[index] ?? wholeFrame;
    const originalX = position.getX(index);
    const originalY = position.getY(index);
    const originalZ = position.getZ(index);
    const height = clamp((originalY - baseY) / extentY, 0, 1);
    const baseLock = profile.anchorBase !== false ? smoothstep(0.03, 0.24, height) : 1;
    const centeredHeight = height - 0.5;
    const taper = 1 + profile.taper * centeredHeight;

    let x = (originalX - center.x) * profile.scale[0] * taper;
    let y = (originalY - baseY) * profile.scale[1];
    let z = (originalZ - center.z) * profile.scale[2] * taper;
    const bulge = 1 + profile.bulge * Math.sin(Math.PI * height);
    x *= bulge;
    z *= bulge;

    const twist = profile.twist * height * baseLock;
    const cosine = Math.cos(twist);
    const sine = Math.sin(twist);
    const twistedX = x * cosine - z * sine;
    const twistedZ = x * sine + z * cosine;
    x = twistedX + profile.leanX * extentY * height * baseLock;
    z = twistedZ + profile.leanZ * extentY * height * baseLock;

    const nx = (originalX - center.x) / extentX;
    const ny = centeredHeight * 2;
    const nz = (originalZ - center.z) / extentZ;
    const noise = Math.sin(nx * profile.noiseFrequency * 2.13 + profile.phases[0])
      * Math.cos(ny * profile.noiseFrequency * 1.37 + profile.phases[1])
      * Math.sin(nz * profile.noiseFrequency * 1.79 + profile.phases[2]);
    const displacement = noise * profile.noiseAmplitude * referenceScale * baseLock;
    // A position-defined field also deforms saved drill volumes identically at
    // shared boundaries; split surface normals must not open those seams.
    if (!profile.spatialField && sourceNormal) normal.set(sourceNormal.getX(index), sourceNormal.getY(index), sourceNormal.getZ(index)).normalize();
    else normal.set(nx, 0.25, nz).normalize();
    let nextX = center.x + x + normal.x * displacement;
    let nextY = baseY + y + normal.y * displacement;
    if (profile.anchorBase === false) nextY += extentY * (1 - profile.scale[1]) * 0.5;
    let nextZ = center.z + z + normal.z * displacement;
    const offsetX = nextX - originalX;
    const offsetY = nextY - originalY;
    const offsetZ = nextZ - originalZ;
    const offsetLength = Math.hypot(offsetX, offsetY, offsetZ);
    if (offsetLength > maximumDisplacementMetres) {
      const amount = maximumDisplacementMetres / offsetLength;
      nextX = originalX + offsetX * amount;
      nextY = originalY + offsetY * amount;
      nextZ = originalZ + offsetZ * amount;
    }
    position.setXYZ(index, nextX, nextY, nextZ);
  }

  // Variation noise previously followed each render vertex's split normal.
  // That lets coincident UV/hard-normal seam twins drift apart before the
  // sculpt brush ever sees them. Preserve the source mesh's geometric welds
  // by averaging the variation delta for every original seam group.
  const variedPositions = packedAttribute(position);
  weldCandidateDeltasForGroups(
    geometryTopology(source).weldGroups,
    sourcePositions,
    variedPositions,
  );
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(
      index,
      variedPositions[index * 3],
      variedPositions[(index * 3) + 1],
      variedPositions[(index * 3) + 2],
    );
  }

  position.needsUpdate = true;
  result.deleteAttribute('normal');
  result.computeVertexNormals();
  weldCatalogNormals(result);
  result.deleteAttribute('tangent');
  if (result.index && result.getAttribute('uv')) {
    try {
      result.computeTangents();
    } catch {
      // Degenerate source UV islands can prevent tangent reconstruction.
    }
  }
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

// Evaluate each variation against a stable snapshot. Subtracting the profile
// recorded when it was captured avoids applying the old variation twice.
function varySnapshotGeometry(geometry, profile, originProfile, bounds, maximumDisplacementMetres = Infinity, originBounds = bounds) {
  if (profile.strength === 0 && !originProfile) return geometry.clone();
  const options = { bounds, maximumDisplacementMetres };
  const candidate = deformCatalogGeometry(geometry, profile, options);
  if (originProfile) {
    const origin = deformCatalogGeometry(geometry, originProfile, { ...options, bounds: originBounds });
    const p = candidate.attributes.position, base = geometry.attributes.position, old = origin.attributes.position;
    for (let i = 0; i < p.count; i += 1) p.setXYZ(i,
      base.getX(i) + p.getX(i) - old.getX(i), base.getY(i) + p.getY(i) - old.getY(i), base.getZ(i) + p.getZ(i) - old.getZ(i));
    origin.dispose();
  }
  const audit = auditCatalogSculptGeometry(candidate, packedAttribute(geometry.attributes.position), { allowLargeDeformation: true, preventFaceFlips: true });
  if (!audit.ok) { candidate.dispose(); throw new Error(`Variation rejected: ${audit.reason}. Reduce the affected parameter; your previous mesh is unchanged.`); }
  refreshEditedGeometry(candidate, { tangents: true });
  // Keep saved drill plugs in the same deformation field as the surrounding rock.
  candidate.userData.toonlabFillPatches = (geometry.userData.toonlabFillPatches ?? []).map((patch) => {
    let componentBounds = bounds;
    if (profile.scope === 'component' || originProfile?.scope === 'component') {
      let nearest = 0, distance = Infinity;
      const p = geometry.attributes.position, anchor = new THREE.Vector3(...patch.point);
      for (let i = 0; i < p.count; i += 1) {
        const d = new THREE.Vector3().fromBufferAttribute(p, i).distanceToSquared(anchor);
        if (d < distance) { distance = d; nearest = i; }
      }
      componentBounds = variationComponentBounds(geometry)[nearest];
    }
    const targetBounds = profile.scope === 'component' ? componentBounds : bounds;
    const previousBounds = originProfile?.scope === 'component' ? componentBounds : originBounds;
    const plugProfile = { ...profile, scope: 'whole' };
    const plugOrigin = originProfile ? { ...originProfile, scope: 'whole' } : null;
    const plug = deserializeCatalogGeometry(patch.geometry);
    const varied = varySnapshotGeometry(plug, plugProfile, plugOrigin, targetBounds, maximumDisplacementMetres, previousBounds);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(patch.point, 3));
    const point = deformCatalogGeometry(pointGeometry, plugProfile, { ...options, bounds: targetBounds });
    const oldPoint = plugOrigin ? deformCatalogGeometry(pointGeometry, plugOrigin, { ...options, bounds: previousBounds }) : pointGeometry;
    const anchor = patch.point.map((value, i) => value + point.attributes.position.array[i] - oldPoint.attributes.position.array[i]);
    const saved = { point: anchor, geometry: serializeCatalogGeometry(varied, 0, { includeFills: false }) };
    plug.dispose(); varied.dispose(); point.dispose(); if (oldPoint !== pointGeometry) oldPoint.dispose(); pointGeometry.dispose();
    return saved;
  });
  return candidate;
}

function transformVariationGeometry(geometry, matrix) {
  geometry.applyMatrix4(matrix);
  for (const patch of geometry.userData.toonlabFillPatches ?? []) {
    patch.point = new THREE.Vector3(...patch.point).applyMatrix4(matrix).toArray();
    const plug = deserializeCatalogGeometry(patch.geometry); plug.applyMatrix4(matrix);
    patch.geometry = serializeCatalogGeometry(plug, 0, { includeFills: false }); plug.dispose();
  }
  return geometry;
}

export function resizeCatalogMeshesToDimensions(meshes, dimensions) {
  const bounds = new THREE.Box3();
  for (const mesh of meshes) { mesh.updateWorldMatrix(true, false); bounds.union(new THREE.Box3().setFromObject(mesh, true)); }
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const ratios = ['width', 'height', 'depth'].map((key, i) => {
    const target = dimensions[key] ?? size.getComponent(i);
    if (!Number.isFinite(target) || target <= 0 || size.getComponent(i) <= 0) throw new Error('Dimensions must be positive finite metres.');
    return target / size.getComponent(i);
  });
  const pivot = new THREE.Vector3(center.x, bounds.min.y, center.z);
  const scale = new THREE.Matrix4().makeTranslation(...pivot.toArray())
    .multiply(new THREE.Matrix4().makeScale(...ratios))
    .multiply(new THREE.Matrix4().makeTranslation(...pivot.clone().negate().toArray()));
  return meshes.map((mesh, index) => {
    const matrix = mesh.matrixWorld.clone().invert().multiply(scale).multiply(mesh.matrixWorld);
    const geometry = transformVariationGeometry(mesh.geometry.clone(), matrix);
    const snapshot = serializeCatalogGeometry(geometry, index); geometry.dispose(); return snapshot;
  });
}

export function createCatalogSourceLoader(renderer) {
  const ktx2Loader = new KTX2Loader()
    .setTranscoderPath('/basis/')
    .setWorkerLimit(2)
    .detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2Loader);
  return {
    dispose() {
      ktx2Loader.dispose();
    },
    loader,
  };
}

export async function loadCatalogSource(entry, loader) {
  let gltf;
  try {
    if (!entry?.modelUrl || !['official-glb', 'c8-custom-glb'].includes(entry?.sourceMode)) {
      throw new Error('The Gallery entry has no immutable public GLB.');
    }
    if (entry.sourceMode === 'c8-custom-glb') {
      const [controlResponse, highResponse] = await Promise.all([
        fetch(entry.modelUrl, { headers: { accept: 'model/gltf-binary' } }),
        fetch(entry.retainedHighUrl, { headers: { accept: 'model/gltf-binary' } }),
      ]);
      if (!controlResponse.ok) throw new Error(`control GLB returned HTTP ${controlResponse.status}`);
      if (!highResponse.ok) throw new Error(`retained-high GLB returned HTTP ${highResponse.status}`);
      const [bytes, highBytes] = await Promise.all([
        controlResponse.arrayBuffer(),
        highResponse.arrayBuffer(),
      ]);
      await verifyC8GlbContentHash(bytes, entry.sourceContentHash, entry.sourceByteLength);
      await verifyC8GlbContentHash(highBytes, entry.retainedHighContentHash, entry.retainedHighByteLength);
      verifyC8GlbSelfContained(bytes);
      verifyC8GlbSelfContained(highBytes);
      const slash = entry.modelUrl.lastIndexOf('/');
      const resourcePath = slash >= 0 ? entry.modelUrl.slice(0, slash + 1) : '';
      gltf = await loader.parseAsync(bytes, resourcePath);
      const highSlash = entry.retainedHighUrl.lastIndexOf('/');
      const highResourcePath = highSlash >= 0 ? entry.retainedHighUrl.slice(0, highSlash + 1) : '';
      const highGltf = await loader.parseAsync(highBytes, highResourcePath);
      const controlAudit = await verifyC8ParsedControlScene(entry, gltf.scene);
      const highDetailAudit = await verifyC8ParsedControlScene(entry, highGltf.scene, { artifactRole: 'highDetail' });
      if (highDetailAudit.vertexCount <= controlAudit.vertexCount
        || highDetailAudit.triangleCount <= controlAudit.triangleCount) {
        throw new Error('Decoded retained-high C8 geometry is not measurably denser than the control.');
      }
      highGltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose?.();
        disposeMaterials(object.material, { textures: true });
      });
      gltf.scene.userData.toonlabC8AdmissionAudit = Object.freeze({
        admissionManifestFingerprint: entry.admissionManifestFingerprint,
        control: controlAudit,
        highDetail: highDetailAudit,
        passed: true,
      });
    } else {
      gltf = await loader.loadAsync(entry.modelUrl);
    }
  } catch (error) {
    const sourceLabel = entry?.sourceMode === 'c8-custom-glb' ? 'content-bound C8 control GLB' : 'Gallery GLB';
    throw new Error(`Unable to load ${entry?.label ?? 'catalog rock'} from the ${sourceLabel}: ${error.message}`);
  }
  const meshes = [];
  gltf.scene.traverse((object) => {
    if (object.isMesh && object.geometry) meshes.push(object);
  });
  if (meshes.length === 0) throw new Error(`${entry.label} contains no mesh geometry.`);
  return {
    dispose() {
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry?.dispose?.();
        disposeMaterials(object.material, { textures: true });
      });
    },
    entry,
    meshes,
    root: gltf.scene,
  };
}

/** Bounds of the editable visible surfaces, excluding retained hidden LODs. */
export function catalogEditableBounds(variation) {
  variation.root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  for (const mesh of variation.previewMeshes) bounds.expandByObject(mesh, true);
  return bounds;
}

export function createCatalogVariation(source, {
  meshCuts = [],
  meshEdits = [],
  meshOperationOrder = null,
  meshSnapshots = [],
  preserveSourceMaterial = false,
  seed = 0,
  strength = 0.3,
  variationSettings = {},
  surface = null,
  surfaceMode = 'source',
} = {}) {
  if (source.entry.sourceMode === 'c8-custom-glb' && meshCuts.length === 0 && meshSnapshots.length === 0) {
    validateC8CatalogMeshEdits(source.entry, meshEdits);
  }
  const boundedStrength = source.entry.sourceMode === 'c8-custom-glb'
    ? Math.min(Number(strength) || 0, source.entry.maxVariationStrength)
    : strength;
  const profile = createVariationProfile(source.entry.variationId, seed, boundedStrength, variationSettings);
  const root = source.root.clone(true);
  const sourceMeshes = [];
  const clonedMeshes = [];
  source.root.traverse((object) => { if (object.isMesh) sourceMeshes.push(object); });
  root.traverse((object) => { if (object.isMesh) clonedMeshes.push(object); });
  if (sourceMeshes.length !== clonedMeshes.length) {
    throw new Error('The catalog GLB could not be cloned without changing its mesh hierarchy.');
  }

  source.root.updateWorldMatrix(true, true);
  const worldBounds = new THREE.Box3().setFromObject(source.root, true);

  const previewMeshes = [];
  const sculptBaseSnapshots = [];
  for (let index = 0; index < clonedMeshes.length; index += 1) {
    const sourceMesh = sourceMeshes[index];
    const mesh = clonedMeshes[index];
    const savedSnapshot = meshSnapshots.find((snapshot) => snapshot.meshIndex === index);
    const origin = savedSnapshot?.variationOrigin;
    let variedGeometry;
    if (!savedSnapshot && !profile.spatialField) {
      // Preserve existing saved variants in their original local-space field.
      variedGeometry = deformCatalogGeometry(sourceMesh.geometry, profile, {
        maximumDisplacementMetres: source.entry.sourceMode === 'c8-custom-glb' ? source.entry.maxDisplacementMetres : Infinity,
      });
    } else if (savedSnapshot && !origin) {
      variedGeometry = deserializeCatalogGeometry(savedSnapshot);
    } else {
      const baseGeometry = savedSnapshot ? deserializeCatalogGeometry(savedSnapshot) : sourceMesh.geometry.clone();
      if (!baseGeometry) throw new Error(`Saved topology snapshot ${index} could not be decoded.`);
      try {
        transformVariationGeometry(baseGeometry, sourceMesh.matrixWorld);
        baseGeometry.computeBoundingBox();
        const bounds = profile.scope !== 'whole' ? baseGeometry.boundingBox : worldBounds;
        variedGeometry = varySnapshotGeometry(baseGeometry, profile,
          origin ? createVariationProfile(source.entry.variationId, origin.seed, origin.strength, origin.settings) : null, bounds,
          source.entry.sourceMode === 'c8-custom-glb' ? source.entry.maxDisplacementMetres : Infinity,
          origin?.settings?.scope === 'whole' || (origin?.settings?.version === 2 && !origin?.settings?.scope) ? worldBounds : baseGeometry.boundingBox);
        transformVariationGeometry(variedGeometry, sourceMesh.matrixWorld.clone().invert());
      } finally { baseGeometry.dispose(); }
    }
    if (!variedGeometry) throw new Error(`Saved topology snapshot ${index} could not be decoded.`);
    sculptBaseSnapshots[index] = packedAttribute(variedGeometry.getAttribute('position'));
    mesh.geometry = applyCatalogMeshOperations(variedGeometry, {
      meshCuts,
      meshEdits,
      meshIndex: index,
      meshOperationOrder,
      strict: source.entry.sourceMode === 'c8-custom-glb',
    });
    mesh.material = cloneMaterials(sourceMesh.material);
    if (surfaceMode === 'generated') {
      const applied = (preserveSourceMaterial
        ? applyCatalogSourceTopOverlay
        : applyCatalogGeneratedSurface)(
        mesh.geometry,
        surface,
        (Math.round(Number(seed) || 0) + index) >>> 0,
      );
      if (applied && preserveSourceMaterial) {
        enableVertexColors(mesh.material);
      } else if (applied) {
        disposeMaterials(mesh.material);
        mesh.material = new THREE.MeshStandardMaterial({
          metalness: 0,
          roughness: 0.92,
          vertexColors: true,
        });
        mesh.material.name = 'ToonLab editable catalog rock surface';
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const match = String(mesh.name).match(LOD_NAME);
    mesh.visible = !match || Number(match[1]) === 0;
    if (mesh.visible) previewMeshes.push(mesh);
  }
  if (previewMeshes.length === 0) {
    clonedMeshes[0].visible = true;
    previewMeshes.push(clonedMeshes[0]);
  }
  root.userData.toonlabCatalogVariation = {
    galleryId: source.entry.galleryId,
    profile: structuredClone(profile),
    preserveSourceMaterial,
    sourceMode: source.entry.sourceMode,
    sourceVersion: source.entry.sourceVersion,
    surfaceMode,
    variationId: source.entry.variationId,
  };
  if (source.entry.sourceMode === 'c8-custom-glb') {
    root.userData.toonlabC8CustomMesh = {
      controlContentHash: source.entry.sourceContentHash,
      controlTopologyHash: source.entry.sourceTopologyHash,
      highDetail: structuredClone(source.entry.customMeshSource.highDetail),
      identityLandmarks: structuredClone(source.entry.identityLandmarks),
      semanticRegions: structuredClone(source.entry.semanticRegions),
    };
  }
  return {
    dispose() {
      root.removeFromParent();
      for (const mesh of clonedMeshes) {
        mesh.geometry.dispose();
        disposeMaterials(mesh.material);
      }
    },
    meshes: clonedMeshes,
    previewMeshes,
    profile,
    fullStrengthProfile: createVariationProfile(source.entry.variationId, seed, 1, variationSettings),
    root,
    sculptBaseSnapshots,
    stats: {
      triangles: previewMeshes.reduce((total, mesh) => total + triangleCount(mesh.geometry), 0),
      vertices: previewMeshes.reduce(
        (total, mesh) => total + (mesh.geometry.getAttribute('position')?.count ?? 0),
        0,
      ),
    },
  };
}

/** Stable preview frame derived from the unedited variation, never its edits. */
export function catalogPreviewOffset(source, options = {}) {
  const base = createCatalogVariation(source, { seed: options.seed ?? 0, strength: options.strength ?? 0.3 });
  const bounds = new THREE.Box3().setFromObject(base.root, true);
  const center = bounds.getCenter(new THREE.Vector3());
  base.dispose();
  return new THREE.Vector3(-center.x, -bounds.min.y, -center.z);
}

export async function exportCatalogVariation(root, renderer) {
  if (!root) throw new Error('The selected catalog GLB is still loading.');
  const exporter = new GLTFExporter();
  exporter.setTextureUtils({
    decompress: (texture, maxTextureSize) => (
      WebGPUTextureUtils.decompress(texture, maxTextureSize, renderer)
    ),
  });
  return exporter.parseAsync(root, {
    binary: true,
    maxTextureSize: 2048,
    onlyVisible: false,
    trs: false,
  });
}
