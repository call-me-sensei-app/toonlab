import { createHash } from 'node:crypto';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { sha256Bytes } from './customMesh.node.js';
import { inspectC8ControlGlb } from './customMeshSampler.node.js';

export const C8_BLENDER_IMPORT_SCHEMA = 'toonlab/c8-blender-custom-mesh-import';
export const C8_BLENDER_IMPORT_VERSION = 1;

export const C8_BLENDER_IMPORT_DEFAULTS = Object.freeze({
  rules: Object.freeze({
    bodyRegionValue: 2,
    crownMinimumHeightFraction: 0.72,
    crownMinimumUpNormal: 0.15,
    crownRegionValue: 3,
    minimumRegionVertices: 3,
    supportBandHeightFraction: 0.015,
    supportRegionValue: 1,
  }),
  tolerances: Object.freeze({
    normalUnitLength: 0.02,
    positionWeldMetres: 1e-7,
    supportPlaneMetres: 1e-6,
    uvBounds: 1e-5,
  }),
});

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function contentHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) fail('invalid-c8-import-option', `${label} must be finite and positive.`, { value });
}

function resolveOptions(options = {}) {
  const tolerances = { ...C8_BLENDER_IMPORT_DEFAULTS.tolerances, ...(options.tolerances ?? {}) };
  const rules = { ...C8_BLENDER_IMPORT_DEFAULTS.rules, ...(options.rules ?? {}) };
  assertFinitePositive(tolerances.positionWeldMetres, 'positionWeldMetres');
  assertFinitePositive(tolerances.normalUnitLength, 'normalUnitLength');
  assertFinitePositive(tolerances.supportPlaneMetres, 'supportPlaneMetres');
  assertFinitePositive(tolerances.uvBounds, 'uvBounds');
  if (!Number.isFinite(rules.supportBandHeightFraction)
    || rules.supportBandHeightFraction <= 0 || rules.supportBandHeightFraction >= 0.25
    || !Number.isFinite(rules.crownMinimumHeightFraction)
    || rules.crownMinimumHeightFraction <= 0.5 || rules.crownMinimumHeightFraction >= 1
    || !Number.isFinite(rules.crownMinimumUpNormal)
    || rules.crownMinimumUpNormal < -1 || rules.crownMinimumUpNormal > 1
    || !Number.isInteger(rules.minimumRegionVertices) || rules.minimumRegionVertices < 1) {
    fail('invalid-c8-import-semantic-rules', 'Semantic support/body/crown thresholds are invalid.', { rules });
  }
  const values = [rules.supportRegionValue, rules.bodyRegionValue, rules.crownRegionValue];
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 255)
    || new Set(values).size !== values.length) {
    fail('invalid-c8-import-semantic-values', 'Semantic region values must be distinct unsigned bytes.', { values });
  }
  return Object.freeze({ rules: Object.freeze(rules), tolerances: Object.freeze(tolerances) });
}

function bytesView(bytes) {
  return bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length);
}

function verifySourceBytes(source, bytes) {
  const view = bytesView(bytes);
  if (!source?.id || !SHA256.test(source.contentHash ?? '')
    || !Number.isInteger(source.byteLength) || source.byteLength < 20) {
    fail('invalid-c8-import-source-binding', 'Blender import requires a stable ID, exact byte length, and lowercase SHA-256.', { source });
  }
  if (view.byteLength !== source.byteLength) {
    fail('c8-import-byte-length-mismatch', 'Blender GLB byte length does not match its source binding.', {
      actual: view.byteLength,
      expected: source.byteLength,
    });
  }
  const actual = sha256Bytes(view);
  if (actual !== source.contentHash) {
    fail('c8-import-content-hash-mismatch', 'Blender GLB bytes do not match their source binding.', {
      actual,
      expected: source.contentHash,
    });
  }
  if (view.byteLength < 20 || String.fromCharCode(...view.subarray(0, 4)) !== 'glTF') {
    fail('invalid-c8-import-glb', 'Blender custom-mesh source is not a GLB.');
  }
  return view;
}

async function parseSingleMesh(bytes) {
  let gltf;
  try {
    const view = bytesView(bytes);
    gltf = await new GLTFLoader().parseAsync(
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
      '',
    );
  } catch (error) {
    fail('invalid-c8-import-glb', `Blender custom-mesh GLB cannot be decoded: ${error.message}`);
  }
  gltf.scene.updateWorldMatrix(true, true);
  const meshes = [];
  gltf.scene.traverse((object) => {
    if (object.isMesh && object.geometry) meshes.push(object);
  });
  if (meshes.length !== 1) {
    fail('ambiguous-c8-import-mesh-count', 'Canonical custom-mesh import requires exactly one applied mesh.', {
      meshCount: meshes.length,
    });
  }
  const mesh = meshes[0];
  const identity = new THREE.Matrix4();
  if (mesh.matrixWorld.determinant() <= 0
    || !mesh.matrixWorld.elements.every((value, index) => Math.abs(value - identity.elements[index]) <= 1e-9)) {
    fail('unapplied-c8-import-transform', 'Blender custom-mesh transforms must be applied before canonical import.');
  }
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!position || position.itemSize !== 3 || !normal || normal.itemSize !== 3 || !uv || uv.itemSize !== 2) {
    fail('missing-c8-import-attributes', 'Blender custom-mesh import requires POSITION, NORMAL, and UV0 for integrity review.');
  }
  const index = geometry.index;
  const indexCount = index?.count ?? position.count;
  if (indexCount % 3 !== 0) fail('invalid-c8-import-triangles', 'Blender custom-mesh indices are not a triangle list.');
  const positions = new Float64Array(position.count * 3);
  const normals = new Float64Array(position.count * 3);
  const uvs = new Float64Array(position.count * 2);
  const indices = new Uint32Array(indexCount);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    positions[vertex * 3] = position.getX(vertex);
    positions[vertex * 3 + 1] = position.getY(vertex);
    positions[vertex * 3 + 2] = position.getZ(vertex);
    normals[vertex * 3] = normal.getX(vertex);
    normals[vertex * 3 + 1] = normal.getY(vertex);
    normals[vertex * 3 + 2] = normal.getZ(vertex);
    uvs[vertex * 2] = uv.getX(vertex);
    uvs[vertex * 2 + 1] = uv.getY(vertex);
  }
  for (let item = 0; item < indexCount; item += 1) indices[item] = index ? index.getX(item) : item;
  return Object.freeze({ indices, normals, positions, uvs });
}

function inspectAttributes(source, tolerances) {
  let maximumNormalLengthError = 0;
  let minimumUv = Infinity;
  let maximumUv = -Infinity;
  for (let vertex = 0; vertex < source.positions.length / 3; vertex += 1) {
    const position = [source.positions[vertex * 3], source.positions[vertex * 3 + 1], source.positions[vertex * 3 + 2]];
    const normal = [source.normals[vertex * 3], source.normals[vertex * 3 + 1], source.normals[vertex * 3 + 2]];
    const uv = [source.uvs[vertex * 2], source.uvs[vertex * 2 + 1]];
    if (![...position, ...normal, ...uv].every(Number.isFinite)) {
      fail('c8-import-nonfinite-attribute', 'Blender custom-mesh attributes contain NaN or infinity.', { vertex });
    }
    const normalError = Math.abs(Math.hypot(...normal) - 1);
    maximumNormalLengthError = Math.max(maximumNormalLengthError, normalError);
    minimumUv = Math.min(minimumUv, ...uv);
    maximumUv = Math.max(maximumUv, ...uv);
  }
  if (maximumNormalLengthError > tolerances.normalUnitLength) {
    fail('c8-import-normal-corruption', 'Blender custom-mesh normals are not unit length within tolerance.', {
      maximumNormalLengthError,
      tolerance: tolerances.normalUnitLength,
    });
  }
  if (minimumUv < -tolerances.uvBounds || maximumUv > 1 + tolerances.uvBounds) {
    fail('c8-import-uv-corruption', 'Blender custom-mesh UV0 exceeds the admitted 0–1 tile tolerance.', {
      maximumUv,
      minimumUv,
      tolerance: tolerances.uvBounds,
    });
  }
  return Object.freeze({ maximumNormalLengthError, maximumUv, minimumUv });
}

function sourceTopologyHash(source) {
  const bytes = new Uint8Array(16 + source.positions.length * 8 + source.indices.length * 4);
  const data = new DataView(bytes.buffer);
  data.setUint32(0, 0x4338544d, true);
  data.setUint32(4, 1, true);
  data.setUint32(8, source.positions.length / 3, true);
  data.setUint32(12, source.indices.length / 3, true);
  let offset = 16;
  for (const value of source.positions) {
    data.setFloat64(offset, value, true);
    offset += 8;
  }
  for (const value of source.indices) {
    data.setUint32(offset, value, true);
    offset += 4;
  }
  return sha256Bytes(bytes);
}

function weldPositions(source, tolerance) {
  const positions = [];
  const sourceToWelded = new Uint32Array(source.positions.length / 3);
  const buckets = new Map();
  let maximumWeldDistanceMetres = 0;
  const key = (x, y, z) => `${x}:${y}:${z}`;
  for (let vertex = 0; vertex < source.positions.length / 3; vertex += 1) {
    const point = [source.positions[vertex * 3], source.positions[vertex * 3 + 1], source.positions[vertex * 3 + 2]];
    const cell = point.map((value) => Math.floor(value / tolerance));
    const matches = [];
    for (let x = cell[0] - 1; x <= cell[0] + 1; x += 1) {
      for (let y = cell[1] - 1; y <= cell[1] + 1; y += 1) {
        for (let z = cell[2] - 1; z <= cell[2] + 1; z += 1) {
          for (const candidate of buckets.get(key(x, y, z)) ?? []) {
            const offset = candidate * 3;
            const distance = Math.hypot(
              point[0] - positions[offset],
              point[1] - positions[offset + 1],
              point[2] - positions[offset + 2],
            );
            if (distance <= tolerance) matches.push({ candidate, distance });
          }
        }
      }
    }
    const uniqueMatches = [...new Map(matches.map((entry) => [entry.candidate, entry])).values()];
    if (uniqueMatches.length > 1) {
      fail('ambiguous-c8-import-weld', 'A source vertex is within weld tolerance of multiple distinct authority vertices.', {
        matches: uniqueMatches,
        vertex,
      });
    }
    if (uniqueMatches.length === 1) {
      sourceToWelded[vertex] = uniqueMatches[0].candidate;
      maximumWeldDistanceMetres = Math.max(maximumWeldDistanceMetres, uniqueMatches[0].distance);
      continue;
    }
    const weldedIndex = positions.length / 3;
    positions.push(...point);
    sourceToWelded[vertex] = weldedIndex;
    const bucketKey = key(...cell);
    const entries = buckets.get(bucketKey) ?? [];
    entries.push(weldedIndex);
    buckets.set(bucketKey, entries);
  }
  const indices = new Uint32Array(source.indices.length);
  const triangles = new Set();
  for (let offset = 0; offset < source.indices.length; offset += 3) {
    const triangle = [
      sourceToWelded[source.indices[offset]],
      sourceToWelded[source.indices[offset + 1]],
      sourceToWelded[source.indices[offset + 2]],
    ];
    if (new Set(triangle).size !== 3) {
      fail('c8-import-topology-drift', 'Position weld collapses a source triangle.', { offset, triangle });
    }
    const identity = [...triangle].sort((left, right) => left - right).join(':');
    if (triangles.has(identity)) {
      fail('c8-import-topology-drift', 'Position weld creates a duplicate triangle.', { identity, offset });
    }
    triangles.add(identity);
    indices.set(triangle, offset);
  }
  return Object.freeze({
    indices,
    maximumWeldDistanceMetres,
    positions: Float64Array.from(positions),
    sourceToWelded,
  });
}

function auditTopology(welded) {
  const edges = new Map();
  const adjacency = Array.from({ length: welded.positions.length / 3 }, () => new Set());
  for (let offset = 0; offset < welded.indices.length; offset += 3) {
    const triangle = [welded.indices[offset], welded.indices[offset + 1], welded.indices[offset + 2]];
    for (const [from, to] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const entry = edges.get(key) ?? { count: 0, direction: 0 };
      entry.count += 1;
      entry.direction += from < to ? 1 : -1;
      edges.set(key, entry);
      adjacency[from].add(to);
      adjacency[to].add(from);
    }
  }
  const invalidEdges = [...edges.entries()].filter(([, entry]) => entry.count !== 2 || entry.direction !== 0);
  if (invalidEdges.length > 0) {
    fail('nonmanifold-c8-import-weld', 'Welded Blender custom mesh is open, nonmanifold, or inconsistently wound.', {
      firstInvalidEdge: invalidEdges[0],
      invalidEdgeCount: invalidEdges.length,
    });
  }
  const visited = new Set();
  let components = 0;
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    components += 1;
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      for (const adjacent of adjacency[stack.pop()]) {
        if (visited.has(adjacent)) continue;
        visited.add(adjacent);
        stack.push(adjacent);
      }
    }
  }
  if (components !== 1) {
    fail('disconnected-c8-import-weld', 'Canonical custom-mesh authority must be one connected component.', { components });
  }
  return Object.freeze({ componentCount: components, edgeCount: edges.size });
}

function calculateBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return Object.freeze({
    dimensionsMetres: Object.freeze(max.map((value, axis) => value - min[axis])),
    max: Object.freeze(max),
    min: Object.freeze(min),
  });
}

function calculateNormals(welded) {
  const normals = new Float64Array(welded.positions.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const face = new THREE.Vector3();
  for (let offset = 0; offset < welded.indices.length; offset += 3) {
    const triangle = [welded.indices[offset], welded.indices[offset + 1], welded.indices[offset + 2]];
    a.fromArray(welded.positions, triangle[0] * 3);
    b.fromArray(welded.positions, triangle[1] * 3);
    c.fromArray(welded.positions, triangle[2] * 3);
    face.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (face.lengthSq() <= 1e-24) fail('c8-import-degenerate-face', 'Welded authority contains a zero-area face.', { offset });
    for (const vertex of triangle) {
      normals[vertex * 3] += face.x;
      normals[vertex * 3 + 1] += face.y;
      normals[vertex * 3 + 2] += face.z;
    }
  }
  for (let vertex = 0; vertex < normals.length / 3; vertex += 1) {
    const normal = new THREE.Vector3().fromArray(normals, vertex * 3);
    if (normal.lengthSq() <= 1e-24) fail('c8-import-ambiguous-normal', 'Welded authority has a vertex with no stable normal.', { vertex });
    normal.normalize().toArray(normals, vertex * 3);
  }
  return normals;
}

function assignRegions({ bounds, normals, positions, rules, tolerances }) {
  if (Math.abs(bounds.min[1]) > tolerances.supportPlaneMetres) {
    fail('c8-import-support-plane-mismatch', 'Blender Z=0 support did not arrive at exact glTF Y=0 within tolerance.', {
      minimumYMetres: bounds.min[1],
      tolerance: tolerances.supportPlaneMetres,
    });
  }
  const height = bounds.dimensionsMetres[1];
  const supportBandMetres = Math.max(tolerances.supportPlaneMetres, height * rules.supportBandHeightFraction);
  const values = new Uint8Array(positions.length / 3);
  const counts = { body: 0, crown: 0, support: 0 };
  for (let vertex = 0; vertex < values.length; vertex += 1) {
    const y = positions[vertex * 3 + 1];
    const normalizedHeight = (y - bounds.min[1]) / Math.max(height, 1e-12);
    const upNormal = normals[vertex * 3 + 1];
    if (y <= bounds.min[1] + supportBandMetres) {
      values[vertex] = rules.supportRegionValue;
      counts.support += 1;
    } else if (normalizedHeight >= rules.crownMinimumHeightFraction
      && upNormal >= rules.crownMinimumUpNormal) {
      values[vertex] = rules.crownRegionValue;
      counts.crown += 1;
    } else {
      values[vertex] = rules.bodyRegionValue;
      counts.body += 1;
    }
  }
  for (const [region, count] of Object.entries(counts)) {
    if (count < rules.minimumRegionVertices) {
      fail('missing-c8-import-region-coverage', `Deterministic ${region} region has insufficient audited coverage.`, {
        count,
        minimum: rules.minimumRegionVertices,
        region,
      });
    }
  }
  return Object.freeze({ counts: Object.freeze(counts), supportBandMetres, values });
}

function aligned(value, alignment = 4) {
  return Math.ceil(value / alignment) * alignment;
}

function createNormalizedGlb({ indices, normals, positions, regions, sourceId }) {
  const positionArray = Float32Array.from(positions);
  const normalArray = Float32Array.from(normals);
  const indexArray = Uint32Array.from(indices);
  const regionArray = Uint8Array.from(regions);
  const arrays = [positionArray, normalArray, indexArray, regionArray];
  const offsets = [];
  let binaryLength = 0;
  for (const array of arrays) {
    binaryLength = aligned(binaryLength, Math.min(array.BYTES_PER_ELEMENT, 4));
    offsets.push(binaryLength);
    binaryLength += array.byteLength;
  }
  binaryLength = aligned(binaryLength, 4);
  const binary = new Uint8Array(binaryLength);
  arrays.forEach((array, index) => {
    binary.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offsets[index]);
  });
  const bounds = calculateBounds(positions);
  const document = {
    accessors: [
      { bufferView: 0, componentType: 5126, count: positionArray.length / 3, max: bounds.max, min: bounds.min, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: normalArray.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: indexArray.length, type: 'SCALAR' },
      { bufferView: 3, componentType: 5121, count: regionArray.length, type: 'SCALAR' },
    ],
    asset: { generator: `ToonLab C8 canonical Blender import ${C8_BLENDER_IMPORT_VERSION}`, version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: positionArray.byteLength, byteOffset: offsets[0], target: 34962 },
      { buffer: 0, byteLength: normalArray.byteLength, byteOffset: offsets[1], target: 34962 },
      { buffer: 0, byteLength: indexArray.byteLength, byteOffset: offsets[2], target: 34963 },
      { buffer: 0, byteLength: regionArray.byteLength, byteOffset: offsets[3], target: 34962 },
    ],
    buffers: [{ byteLength: binary.byteLength }],
    meshes: [{ name: `TOONLAB_AUTHORITY__${sourceId}`, primitives: [{ attributes: { NORMAL: 1, POSITION: 0, _TOONLAB_REGION: 3 }, indices: 2, mode: 4 }] }],
    nodes: [{ mesh: 0, name: `TOONLAB_AUTHORITY__${sourceId}` }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = aligned(json.byteLength, 4);
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + binary.byteLength);
  const header = new DataView(bytes.buffer);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.byteLength, true);
  header.setUint32(12, jsonLength, true);
  bytes.set([0x4a, 0x53, 0x4f, 0x4e], 16);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const binaryHeader = 20 + jsonLength;
  header.setUint32(binaryHeader, binary.byteLength, true);
  bytes.set([0x42, 0x49, 0x4e, 0x00], binaryHeader + 4);
  bytes.set(binary, binaryHeader + 8);
  return bytes;
}

export async function normalizeC8BlenderCustomMesh({ bytes, options = {}, source } = {}) {
  const resolved = resolveOptions(options);
  const view = verifySourceBytes(source, bytes);
  if (source.metreUnitScale !== 1 || source.coordinateSystem !== 'right-handed-y-up'
    || source.blenderAuthoringSupportPlane !== 'z=0') {
    fail('invalid-c8-import-coordinate-contract', 'Source must bind one metre per unit, glTF right-handed Y-up, and Blender Z=0 support.', { source });
  }
  const decoded = await parseSingleMesh(view);
  const attributeAudit = inspectAttributes(decoded, resolved.tolerances);
  const decodedTopologyHash = sourceTopologyHash(decoded);
  if (source.topologyHash && source.topologyHash !== decodedTopologyHash) {
    fail('c8-import-source-topology-hash-mismatch', 'Decoded Blender topology does not match its source binding.', {
      actual: decodedTopologyHash,
      expected: source.topologyHash,
    });
  }
  const sourceBounds = calculateBounds(decoded.positions);
  const welded = weldPositions(decoded, resolved.tolerances.positionWeldMetres);
  const topologyAudit = auditTopology(welded);
  const weldedBounds = calculateBounds(welded.positions);
  const boundDrift = Math.max(...sourceBounds.min.map((value, axis) => Math.abs(value - weldedBounds.min[axis])),
    ...sourceBounds.max.map((value, axis) => Math.abs(value - weldedBounds.max[axis])));
  if (boundDrift > resolved.tolerances.positionWeldMetres) {
    fail('c8-import-bounds-drift', 'Seam weld changes the source bounds outside position tolerance.', {
      boundDrift,
      tolerance: resolved.tolerances.positionWeldMetres,
    });
  }
  const normals = calculateNormals(welded);
  const semantic = assignRegions({
    bounds: weldedBounds,
    normals,
    positions: welded.positions,
    rules: resolved.rules,
    tolerances: resolved.tolerances,
  });
  const normalizedBytes = createNormalizedGlb({
    indices: welded.indices,
    normals,
    positions: welded.positions,
    regions: semantic.values,
    sourceId: source.id,
  });
  const normalizedInspection = inspectC8ControlGlb(normalizedBytes);
  const provenance = {
    schema: C8_BLENDER_IMPORT_SCHEMA,
    version: C8_BLENDER_IMPORT_VERSION,
    source: {
      byteLength: source.byteLength,
      contentHash: source.contentHash,
      coordinateSystem: source.coordinateSystem,
      decodedTopologyHash,
      id: source.id,
      metreUnitScale: source.metreUnitScale,
      vertexCountIncludingExportSeams: decoded.positions.length / 3,
    },
    normalization: {
      attributePolicy: 'POSITION is welded; source NORMAL and UV0 are integrity-audited; authority normals are deterministically recomputed; UV0 is intentionally excluded because editor surfaces are metre-triplanar and portable UV bake is separate.',
      maximumWeldDistanceMetres: welded.maximumWeldDistanceMetres,
      semanticAttribute: '_TOONLAB_REGION',
      semanticCounts: semantic.counts,
      semanticRules: resolved.rules,
      supportBandMetres: semantic.supportBandMetres,
      tolerances: resolved.tolerances,
      topologyAudit,
      uvAudit: attributeAudit,
      weldedVertexCount: welded.positions.length / 3,
    },
    output: {
      byteLength: normalizedBytes.byteLength,
      contentHash: sha256Bytes(normalizedBytes),
      dimensionsMetres: normalizedInspection.dimensionsMetres,
      topologyHash: normalizedInspection.topologyHash,
      triangleCount: normalizedInspection.triangleCount,
      vertexCount: normalizedInspection.vertexCount,
    },
    preservation: {
      blenderSupportPlane: 'z=0',
      boundDriftMetres: boundDrift,
      gltfSupportPlane: 'y=0',
      metreUnitScale: 1,
      shapePreservingWithinPositionTolerance: true,
      triangleCountPreserved: normalizedInspection.triangleCount === decoded.indices.length / 3,
    },
    productionAuthority: true,
  };
  provenance.provenanceHash = contentHash(provenance);
  return Object.freeze({
    audit: Object.freeze(canonical(provenance)),
    bytes: normalizedBytes,
  });
}

