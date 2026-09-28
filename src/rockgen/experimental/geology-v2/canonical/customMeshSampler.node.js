import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

import { sha256Bytes, verifyC8CustomMeshArtifactBytes } from './customMesh.node.js';

const verifiedSamplers = new WeakSet();
const verifiedAuthorities = new WeakSet();
const COMPONENT_BYTES = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const TYPE_COMPONENTS = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4], ['MAT2', 4], ['MAT3', 9], ['MAT4', 16]]);

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function contractHash(value) {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(canonicalValue(value))));
}

function glbDocument(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.byteLength < 20 || String.fromCharCode(...view.subarray(0, 4)) !== 'glTF') {
    fail('invalid-custom-mesh-glb', 'C8 control source is not a binary glTF container.');
  }
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
  if (data.getUint32(4, true) !== 2 || data.getUint32(8, true) !== view.byteLength) {
    fail('invalid-custom-mesh-glb-header', 'C8 control GLB has an invalid version or declared length.');
  }
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= view.byteLength) {
    const length = data.getUint32(offset, true);
    const type = data.getUint32(offset + 4, true);
    offset += 8;
    if (offset + length > view.byteLength) fail('invalid-custom-mesh-glb-chunk', 'C8 control GLB has a truncated chunk.');
    const chunk = view.subarray(offset, offset + length);
    if (type === 0x4e4f534a) {
      try {
        json = JSON.parse(new TextDecoder().decode(chunk).trim());
      } catch (error) {
        fail('invalid-custom-mesh-glb-json', `C8 control GLB JSON cannot be parsed: ${error.message}`);
      }
    } else if (type === 0x004e4942) {
      binary = chunk;
    }
    offset += length;
  }
  if (!json || !binary) fail('missing-custom-mesh-glb-data', 'C8 control GLB requires embedded JSON and BIN chunks.');
  if ((json.buffers ?? []).some((buffer) => typeof buffer.uri === 'string')) {
    fail('external-custom-mesh-buffer', 'C8 control geometry must be fully embedded in the content-hashed GLB.');
  }
  return { binary, json };
}

function readComponent(view, offset, componentType) {
  if (componentType === 5120) return view.getInt8(offset);
  if (componentType === 5121) return view.getUint8(offset);
  if (componentType === 5122) return view.getInt16(offset, true);
  if (componentType === 5123) return view.getUint16(offset, true);
  if (componentType === 5125) return view.getUint32(offset, true);
  if (componentType === 5126) return view.getFloat32(offset, true);
  fail('unsupported-custom-mesh-component', `Unsupported glTF component type ${componentType}.`);
}

function readAccessor(document, accessorIndex) {
  const accessor = document.json.accessors?.[accessorIndex];
  if (!accessor || accessor.sparse) fail('unsupported-custom-mesh-accessor', 'C8 control GLBs require non-sparse accessors.');
  const bufferView = document.json.bufferViews?.[accessor.bufferView];
  if (!bufferView || (bufferView.buffer ?? 0) !== 0) fail('invalid-custom-mesh-buffer-view', 'C8 control accessor has no embedded buffer view.');
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  const itemSize = TYPE_COMPONENTS.get(accessor.type);
  if (!componentBytes || !itemSize || !Number.isInteger(accessor.count) || accessor.count <= 0) {
    fail('invalid-custom-mesh-accessor', 'C8 control accessor metadata is invalid.', { accessor });
  }
  const stride = bufferView.byteStride ?? componentBytes * itemSize;
  if (stride < componentBytes * itemSize) fail('invalid-custom-mesh-accessor-stride', 'C8 control accessor stride is too small.');
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const end = base + (accessor.count - 1) * stride + componentBytes * itemSize;
  if (base < 0 || end > document.binary.byteLength) fail('custom-mesh-accessor-out-of-range', 'C8 control accessor exceeds the embedded BIN chunk.');
  const view = new DataView(document.binary.buffer, document.binary.byteOffset, document.binary.byteLength);
  const values = new Array(accessor.count * itemSize);
  for (let index = 0; index < accessor.count; index += 1) {
    for (let component = 0; component < itemSize; component += 1) {
      values[index * itemSize + component] = readComponent(
        view,
        base + index * stride + component * componentBytes,
        accessor.componentType,
      );
    }
  }
  return { componentType: accessor.componentType, count: accessor.count, itemSize, values };
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return new THREE.Matrix4().fromArray(node.matrix);
  const position = new THREE.Vector3(...(node.translation ?? [0, 0, 0]));
  const rotation = new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
  const scale = new THREE.Vector3(...(node.scale ?? [1, 1, 1]));
  return new THREE.Matrix4().compose(position, rotation, scale);
}

function topologyBytes(positions, indices) {
  const bytes = new Uint8Array(16 + positions.length * 8 + indices.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x4338544d, true); // C8TM
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

function assertWatertight(indices) {
  const edges = new Map();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    if (new Set(triangle).size !== 3) fail('degenerate-custom-mesh-triangle', 'C8 control GLB contains a degenerate indexed triangle.');
    for (const [from, to] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const entry = edges.get(key) ?? { count: 0, direction: 0 };
      entry.count += 1;
      entry.direction += from < to ? 1 : -1;
      edges.set(key, entry);
    }
  }
  const invalid = [...edges.entries()].find(([, entry]) => entry.count !== 2 || entry.direction !== 0);
  if (invalid) {
    fail('non-watertight-custom-mesh-control', 'C8 custom-mesh SDF compilation requires a watertight, consistently wound control GLB.', {
      edge: invalid[0],
      incidence: invalid[1],
    });
  }
}

export function inspectC8ControlGlb(bytes) {
  const document = glbDocument(bytes);
  const positions = [];
  const indices = [];
  const meshRanges = [];
  const semanticValues = new Map();
  const vector = new THREE.Vector3();
  const sceneIndex = Number.isInteger(document.json.scene) ? document.json.scene : 0;
  const roots = document.json.scenes?.[sceneIndex]?.nodes;
  if (!Array.isArray(roots) || roots.length === 0) fail('missing-custom-mesh-scene', 'C8 control GLB has no populated default scene.');
  const active = new Set();
  const visit = (nodeIndex, parentMatrix) => {
    if (active.has(nodeIndex)) fail('cyclic-custom-mesh-nodes', 'C8 control GLB node hierarchy contains a cycle.');
    const node = document.json.nodes?.[nodeIndex];
    if (!node) fail('invalid-custom-mesh-node', `C8 control GLB references missing node ${nodeIndex}.`);
    active.add(nodeIndex);
    const matrix = parentMatrix.clone().multiply(nodeMatrix(node));
    if (matrix.determinant() <= 0) fail('mirrored-custom-mesh-transform', 'C8 control GLB may not use singular or mirrored node transforms.');
    if (Number.isInteger(node.mesh)) {
      const identity = new THREE.Matrix4();
      if (!matrix.elements.every((value, index) => Math.abs(value - identity.elements[index]) <= 1e-9)) {
        fail('non-identity-custom-mesh-transform', 'C8 authority mesh transforms must be applied in Blender before export so edit deltas remain world-metre aligned.', {
          nodeIndex,
        });
      }
      const mesh = document.json.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        if ((primitive.mode ?? 4) !== 4 || !Number.isInteger(primitive.attributes?.POSITION)) {
          fail('unsupported-custom-mesh-primitive', 'C8 control GLB supports indexed TRIANGLES with POSITION data.');
        }
        const sourcePositions = readAccessor(document, primitive.attributes.POSITION);
        if (sourcePositions.componentType !== 5126 || sourcePositions.itemSize !== 3) {
          fail('invalid-custom-mesh-position-accessor', 'C8 control POSITION data must be FLOAT VEC3.');
        }
        const vertexOffset = positions.length / 3;
        for (let index = 0; index < sourcePositions.count; index += 1) {
          vector.fromArray(sourcePositions.values, index * 3).applyMatrix4(matrix);
          positions.push(vector.x, vector.y, vector.z);
        }
        const sourceIndices = Number.isInteger(primitive.indices)
          ? readAccessor(document, primitive.indices)
          : { componentType: 5125, count: sourcePositions.count, itemSize: 1, values: Array.from({ length: sourcePositions.count }, (_, index) => index) };
        if (sourceIndices.itemSize !== 1 || ![5121, 5123, 5125].includes(sourceIndices.componentType)
          || sourceIndices.count % 3 !== 0) {
          fail('invalid-custom-mesh-index-accessor', 'C8 control indices must be unsigned SCALAR triangles.');
        }
        for (const value of sourceIndices.values) {
          if (!Number.isInteger(value) || value < 0 || value >= sourcePositions.count) {
            fail('custom-mesh-index-out-of-range', 'C8 control index exceeds its POSITION accessor.');
          }
          indices.push(vertexOffset + value);
        }
        const referencedVertices = new Set(sourceIndices.values);
        for (const [attribute, accessorIndex] of Object.entries(primitive.attributes)) {
          if (!attribute.startsWith('_')) continue;
          const accessor = readAccessor(document, accessorIndex);
          if (accessor.itemSize !== 1 || accessor.count !== sourcePositions.count) {
            fail('invalid-custom-mesh-semantic-accessor', `${attribute} must be a per-vertex SCALAR attribute.`);
          }
          const values = semanticValues.get(attribute) ?? new Set();
          for (const vertexIndex of referencedVertices) values.add(accessor.values[vertexIndex]);
          semanticValues.set(attribute, values);
        }
        meshRanges.push({ vertexCount: sourcePositions.count, vertexOffset });
      }
    }
    for (const child of node.children ?? []) visit(child, matrix);
    active.delete(nodeIndex);
  };
  for (const node of roots) visit(node, new THREE.Matrix4());
  if (positions.length === 0 || indices.length === 0) fail('empty-custom-mesh-control', 'C8 control GLB contains no triangle geometry.');
  assertWatertight(indices);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return Object.freeze({
    boundsMetres: Object.freeze({ max: Object.freeze(max), min: Object.freeze(min) }),
    dimensionsMetres: Object.freeze(max.map((value, axis) => value - min[axis])),
    indices: Object.freeze(indices),
    meshRanges: Object.freeze(meshRanges.map(Object.freeze)),
    positions: Object.freeze(positions),
    semanticValues,
    topologyHash: sha256Bytes(topologyBytes(positions, indices)),
    triangleCount: indices.length / 3,
    vertexCount: positions.length / 3,
  });
}

function compareVector(actual, expected, label) {
  const scale = Math.max(...expected.map(Math.abs), 1);
  if (!actual.every((value, axis) => Math.abs(value - expected[axis]) <= Math.max(1e-5, scale * 1e-5))) {
    fail('custom-mesh-measurement-mismatch', `${label} does not match the content-hashed GLB geometry.`, { actual, expected });
  }
}

function compareGeometryAudit(inspection, artifact) {
  const expected = artifact.geometryAudit;
  if (!expected
    || expected.topologyHash !== inspection.topologyHash
    || expected.vertexCount !== inspection.vertexCount
    || expected.triangleCount !== inspection.triangleCount
    || expected.meshVertexCounts.length !== inspection.meshRanges.length
    || expected.meshVertexCounts.some((value, index) => value !== inspection.meshRanges[index].vertexCount)) {
    fail('custom-mesh-geometry-audit-mismatch', `${artifact.id} decoded topology counts do not match its bound geometry audit.`, {
      actual: {
        meshVertexCounts: inspection.meshRanges.map((entry) => entry.vertexCount),
        topologyHash: inspection.topologyHash,
        triangleCount: inspection.triangleCount,
        vertexCount: inspection.vertexCount,
      },
      expected,
    });
  }
}

export function verifyC8CustomMeshArtifactGeometry(artifact, bytes, {
  semanticRegions = [],
  requireSemanticRegions = false,
} = {}) {
  verifyC8CustomMeshArtifactBytes(artifact, bytes);
  const inspection = inspectC8ControlGlb(bytes);
  if (inspection.topologyHash !== artifact.topologyHash) {
    fail('custom-mesh-topology-hash-mismatch', 'C8 artifact topology hash does not match decoded GLB geometry.', {
      actual: inspection.topologyHash,
      expected: artifact.topologyHash,
    });
  }
  compareVector(inspection.boundsMetres.min, artifact.boundsMetres.min, 'Artifact minimum bounds');
  compareVector(inspection.boundsMetres.max, artifact.boundsMetres.max, 'Artifact maximum bounds');
  compareVector(inspection.dimensionsMetres, artifact.dimensionsMetres, 'Artifact dimensions');
  compareGeometryAudit(inspection, artifact);
  if (requireSemanticRegions && (!Array.isArray(semanticRegions) || semanticRegions.length < 3)) {
    fail('missing-custom-mesh-semantic-contract', 'Editable C8 controls require their complete semantic-region contract during decoded admission.');
  }
  for (const region of semanticRegions) {
    const values = inspection.semanticValues.get(region.selector.attribute);
    if (!values?.has(region.selector.value)) {
      fail('missing-custom-mesh-semantic-value', `Control GLB does not contain ${region.selector.attribute}=${region.selector.value} on rendered vertices for region ${region.id}.`);
    }
  }
  return inspection;
}

function createBvhState(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  const bvh = new MeshBVH(geometry, { indirect: true, maxLeafTris: 8 });
  return { bvh, geometry };
}

function positionsWithSculpt(base, meshRanges, sparseSculptDeltas) {
  const positions = [...base];
  for (const sculpt of sparseSculptDeltas ?? []) {
    for (const operation of sculpt.operations ?? []) {
      const range = meshRanges[operation.meshIndex];
      if (!range) fail('c8-sculpt-mesh-out-of-range', `Sparse sculpt references missing mesh ${operation.meshIndex}.`);
      for (const [vertexIndex, x, y, z] of operation.deltas ?? []) {
        if (vertexIndex < 0 || vertexIndex >= range.vertexCount) {
          fail('c8-sculpt-vertex-out-of-range', `Sparse sculpt references missing vertex ${vertexIndex}.`);
        }
        const offset = (range.vertexOffset + vertexIndex) * 3;
        positions[offset] += x;
        positions[offset + 1] += y;
        positions[offset + 2] += z;
      }
    }
  }
  return positions;
}

export function createVerifiedC8CustomMeshSampler(artifact, bytes, { semanticRegions = [] } = {}) {
  const inspection = verifyC8CustomMeshArtifactGeometry(artifact, bytes, {
    requireSemanticRegions: true,
    semanticRegions,
  });
  const cache = new Map();
  const stateFor = (sparseSculptDeltas) => {
    const key = JSON.stringify(sparseSculptDeltas ?? []);
    let state = cache.get(key);
    if (!state) {
      state = createBvhState(
        positionsWithSculpt(inspection.positions, inspection.meshRanges, sparseSculptDeltas),
        inspection.indices,
      );
      cache.set(key, state);
    }
    return state;
  };
  const point = new THREE.Vector3();
  const ray = new THREE.Ray();
  const rayDirection = new THREE.Vector3(0.712341, 0.367913, 0.597123).normalize();
  const binding = Object.freeze({
    audit: Object.freeze({
      boundsMetres: inspection.boundsMetres,
      semanticRegionCount: semanticRegions.length,
      topologyHash: inspection.topologyHash,
      triangleCount: inspection.triangleCount,
      vertexCount: inspection.vertexCount,
    }),
    contentHash: artifact.contentHash,
    contractHash: contractHash({ artifact, semanticRegions }),
    dispose() {
      for (const state of cache.values()) state.geometry.dispose();
      cache.clear();
    },
    evaluateSignedDistanceMetres(value, { sparseSculptDeltas = [] } = {}) {
      point.fromArray(value);
      const state = stateFor(sparseSculptDeltas);
      const nearest = state.bvh.closestPointToPoint(point, {});
      if (!nearest || !Number.isFinite(nearest.distance)) fail('invalid-custom-mesh-distance', 'C8 control BVH could not evaluate a finite distance.');
      if (nearest.distance <= 1e-9) return 0;
      ray.set(point, rayDirection);
      const hits = state.bvh.raycast(ray, THREE.DoubleSide, 1e-8, Infinity)
        .map((hit) => hit.distance)
        .sort((left, right) => left - right);
      let intersections = 0;
      let prior = -Infinity;
      for (const distance of hits) {
        if (distance - prior <= 1e-7) continue;
        intersections += 1;
        prior = distance;
      }
      return intersections % 2 === 1 ? -nearest.distance : nearest.distance;
    },
    topologyHash: artifact.topologyHash,
  });
  verifiedSamplers.add(binding);
  return binding;
}

export function assertVerifiedC8CustomMeshSampler(binding, artifact) {
  if (!verifiedSamplers.has(binding)) {
    fail('unverified-custom-mesh-sampler', `Custom-mesh sampler ${artifact.id} was not constructed from verified GLB bytes.`);
  }
  if (binding.contentHash !== artifact.contentHash || binding.topologyHash !== artifact.topologyHash) {
    fail('custom-mesh-sampler-hash-mismatch', `Custom-mesh sampler ${artifact.id} is not bound to the admitted GLB and topology hashes.`);
  }
  return binding;
}


export function createVerifiedC8CustomMeshAuthority(customMeshSource, {
  controlBytes,
  highDetailBytes,
} = {}) {
  const controlSampler = createVerifiedC8CustomMeshSampler(customMeshSource.control, controlBytes, {
    semanticRegions: customMeshSource.semanticRegions,
  });
  const highInspection = verifyC8CustomMeshArtifactGeometry(customMeshSource.highDetail, highDetailBytes);
  const controlInspection = controlSampler.audit;
  const tolerance = Math.max(...customMeshSource.control.dimensionsMetres) * 0.05;
  for (const key of ['min', 'max']) {
    if (customMeshSource.control.boundsMetres[key].some((value, axis) => (
      Math.abs(value - customMeshSource.highDetail.boundsMetres[key][axis]) > tolerance
    ))) {
      fail('custom-mesh-high-correspondence-mismatch', 'Retained high-detail bounds must correspond to the editable control in the same applied metre space.', {
        control: customMeshSource.control.boundsMetres,
        highDetail: customMeshSource.highDetail.boundsMetres,
        tolerance,
      });
    }
  }
  if (highInspection.triangleCount <= controlInspection.triangleCount
    || highInspection.vertexCount <= controlInspection.vertexCount) {
    fail('insufficient-custom-mesh-high-detail', 'Decoded retained-high geometry must contain more vertices and triangles than the control.');
  }
  const authority = Object.freeze({
    authorityContractHash: contractHash(customMeshSource),
    controlAudit: controlSampler.audit,
    controlSampler,
    highDetailAudit: Object.freeze({
      boundsMetres: highInspection.boundsMetres,
      topologyHash: highInspection.topologyHash,
      triangleCount: highInspection.triangleCount,
      vertexCount: highInspection.vertexCount,
    }),
  });
  verifiedAuthorities.add(authority);
  return authority;
}

export function assertVerifiedC8CustomMeshAuthority(authority, customMeshSource) {
  if (!verifiedAuthorities.has(authority)) {
    fail('unverified-custom-mesh-authority', 'C8 canonical compilation requires paired decoded control and retained-high GLB admission.');
  }
  if (authority.authorityContractHash !== contractHash(customMeshSource)) {
    fail('custom-mesh-authority-contract-mismatch', 'Verified C8 authority does not match the complete saved control/high/semantic manifest.');
  }
  return authority;
}
