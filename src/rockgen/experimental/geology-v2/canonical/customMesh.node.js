import { createHash } from 'node:crypto';

import {
  createC7SurfaceSpecification,
  resolveC7Projection,
} from '../../../surface/c7GeologySurface.js';
import { canonicalizeJson, contentId } from '../canonical.node.js';

export const C8_CUSTOM_MESH_SOURCE_SCHEMA = 'toonlab/c8-custom-mesh-source';
export const C8_CUSTOM_MESH_SOURCE_VERSION = 1;
export const C8_SPARSE_SCULPT_DELTA_SCHEMA = 'toonlab/c8-sparse-sculpt-delta';
export const C8_SPARSE_SCULPT_DELTA_VERSION = 1;
export const C8_SURFACE_REPROJECTION_SCHEMA = 'toonlab/c8-surface-reprojection';
export const C8_SURFACE_REPROJECTION_VERSION = 1;

export const C8_GEOMETRY_DERIVATIVE_ROLES = Object.freeze([
  'collision',
  'geometricResidual',
  'lods',
  'pbrBake',
  'runtimePackage',
]);

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const REGION_ROLES = new Set([
  'base-support',
  'caprock',
  'cavity',
  'clast',
  'crown',
  'fracture-face',
  'joint',
  'ledge',
  'primary-mass',
  'secondary-mass',
  'shaft',
  'toe',
  'weathering-zone',
]);

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}

function finiteVector(value, length, label, { positive = false } = {}) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    fail('invalid-custom-mesh-vector', `${label} must contain ${length} finite numbers.`, { label, value });
  }
  if (positive && !value.every((entry) => entry > 0)) {
    fail('invalid-custom-mesh-positive-vector', `${label} must contain positive numbers.`, { label, value });
  }
}

function validateHash(value, label) {
  if (!SHA256.test(value ?? '')) {
    fail('invalid-custom-mesh-hash', `${label} must be a lowercase sha256 content hash.`, { label, value });
  }
}

function validateBounds(bounds, label) {
  finiteVector(bounds?.min, 3, `${label}.min`);
  finiteVector(bounds?.max, 3, `${label}.max`);
  if (!bounds.min.every((value, axis) => value < bounds.max[axis])) {
    fail('invalid-custom-mesh-bounds', `${label} must have strictly increasing min/max bounds.`, { bounds });
  }
}

function validateArtifact(artifact, role) {
  if (!['editable-control', 'retained-high-detail'].includes(role)) {
    fail('invalid-custom-mesh-artifact-role', 'C8 artifacts must be an editable control or retained high-detail GLB.', {
      artifact,
      role,
    });
  }
  if (!artifact?.id || artifact.role !== role) {
    fail('invalid-custom-mesh-artifact-role', `The ${role} artifact needs a stable ID and exact role.`, { artifact, role });
  }
  if (artifact.mimeType !== 'model/gltf-binary') {
    fail('invalid-custom-mesh-media-type', `${artifact.id} must be a binary GLB.`, { artifact });
  }
  if (artifact.unit !== 'metre' || artifact.metreUnitScale !== 1) {
    fail('invalid-custom-mesh-unit', `${artifact.id} must author one GLB unit as exactly one metre.`, { artifact });
  }
  if (artifact.coordinateSystem !== 'right-handed-y-up') {
    fail('invalid-custom-mesh-coordinate-system', `${artifact.id} must be right-handed and Y-up.`, { artifact });
  }
  if (typeof artifact.uri !== 'string' || !artifact.uri.trim() || !artifact.uri.toLowerCase().endsWith('.glb')) {
    fail('invalid-custom-mesh-uri', `${artifact.id} requires a resolvable .glb URI.`, { artifact });
  }
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength < 20) {
    fail('invalid-custom-mesh-byte-length', `${artifact.id} requires its exact positive GLB byte length.`, { artifact });
  }
  if (!Number.isInteger(artifact.sourceRevision) || artifact.sourceRevision < 1) {
    fail('invalid-custom-mesh-source-revision', `${artifact.id} requires a positive source revision.`, { artifact });
  }
  validateHash(artifact.contentHash, `${artifact.id}.contentHash`);
  validateHash(artifact.topologyHash, `${artifact.id}.topologyHash`);
  const audit = artifact.geometryAudit;
  if (!audit || audit.topologyHash !== artifact.topologyHash
    || !Number.isInteger(audit.vertexCount) || audit.vertexCount < 4
    || !Number.isInteger(audit.triangleCount) || audit.triangleCount < 4
    || !Array.isArray(audit.meshVertexCounts) || audit.meshVertexCounts.length === 0
    || !audit.meshVertexCounts.every((value) => Number.isInteger(value) && value > 0)
    || audit.meshVertexCounts.reduce((sum, value) => sum + value, 0) !== audit.vertexCount) {
    fail('invalid-custom-mesh-geometry-audit', `${artifact.id} requires decoded topology and per-mesh vertex counts bound to its topology hash.`, { artifact });
  }
  finiteVector(artifact.dimensionsMetres, 3, `${artifact.id}.dimensionsMetres`, { positive: true });
  validateBounds(artifact.boundsMetres, `${artifact.id}.boundsMetres`);
}

function validateRegion(region, regionIds, landmarkIds) {
  if (!region?.id || regionIds.has(region.id)) {
    fail('invalid-custom-mesh-region-id', 'Semantic region IDs must be present and unique.', { region });
  }
  regionIds.add(region.id);
  if (typeof region.label !== 'string' || !region.label.trim() || !REGION_ROLES.has(region.role)) {
    fail('invalid-custom-mesh-region-role', `${region.id} requires a label and supported geology role.`, { region });
  }
  const selector = region.selector;
  if (!selector || selector.kind !== 'gltf-attribute'
    || !/^_[A-Z0-9_]+$/u.test(selector.attribute ?? '')
    || !Number.isInteger(selector.value)
    || selector.value < 0) {
    fail('invalid-custom-mesh-region-selector', `${region.id} requires an explicit integer glTF attribute selector.`, { region });
  }
  if (!Array.isArray(region.landmarkIds)) {
    fail('invalid-custom-mesh-region-landmarks', `${region.id}.landmarkIds must be an array.`, { region });
  }
  for (const landmarkId of region.landmarkIds) {
    if (!landmarkIds.has(landmarkId)) {
      fail('unknown-custom-mesh-region-landmark', `${region.id} references unknown landmark ${landmarkId}.`, { region });
    }
  }
}

export function validateC8CustomMeshSource(value, { identityLandmarks = [] } = {}) {
  if (value?.schema !== C8_CUSTOM_MESH_SOURCE_SCHEMA
    || value.version !== C8_CUSTOM_MESH_SOURCE_VERSION) {
    fail('invalid-custom-mesh-source-schema', 'C8 custom-mesh source schema or version is unsupported.', {
      schema: value?.schema,
      version: value?.version,
    });
  }
  if (value.authority !== 'toonlab-editable-control-plus-retained-high') {
    fail('invalid-custom-mesh-authority', 'C8 requires an independent editable control and retained high-detail source.', { value });
  }
  validateArtifact(value.control, 'editable-control');
  validateArtifact(value.highDetail, 'retained-high-detail');
  const supportToleranceMetres = Math.max(...value.control.dimensionsMetres) * 1e-5;
  if (Math.abs(value.control.boundsMetres.min[1]) > Math.max(1e-6, supportToleranceMetres)) {
    fail('custom-mesh-support-plane-mismatch', 'The decoded editable control must have its applied support plane at Y=0 metres.', {
      minimumYMetres: value.control.boundsMetres.min[1],
      toleranceMetres: Math.max(1e-6, supportToleranceMetres),
    });
  }
  if (value.control.id === value.highDetail.id) {
    fail('duplicate-custom-mesh-artifact-id', 'Control and high-detail artifacts require distinct IDs.', { value });
  }
  if (value.control.contentHash === value.highDetail.contentHash) {
    fail('duplicate-custom-mesh-artifact-content', 'The retained high-detail source must not be the control GLB relabeled as high detail.', { value });
  }
  if (value.highDetail.geometryAudit.triangleCount <= value.control.geometryAudit.triangleCount
    || value.highDetail.geometryAudit.vertexCount <= value.control.geometryAudit.vertexCount) {
    fail('insufficient-custom-mesh-high-detail', 'The retained high-detail GLB must contain measurably more source geometry than the editable control.', { value });
  }
  const landmarkIds = new Set(identityLandmarks.map((landmark) => landmark.id));
  if (landmarkIds.size < 3) {
    fail('missing-custom-mesh-landmarks', 'C8 custom meshes require at least three package identity landmarks.');
  }
  if (!Array.isArray(value.semanticRegions) || value.semanticRegions.length < 3) {
    fail('missing-custom-mesh-regions', 'C8 custom meshes require at least three semantic regions.');
  }
  const regionIds = new Set();
  for (const region of value.semanticRegions) validateRegion(region, regionIds, landmarkIds);
  if (!value.semanticRegions.some((region) => region.role === 'base-support')) {
    fail('missing-custom-mesh-support-region', 'C8 custom meshes require an explicit base-support semantic region.');
  }
  const envelope = value.editEnvelope;
  if (!envelope || envelope.mode !== 'bounded-source-space'
    || !Number.isFinite(envelope.maximumDisplacementMetres)
    || envelope.maximumDisplacementMetres <= 0
    || !Number.isFinite(envelope.maximumVariationStrength)
    || envelope.maximumVariationStrength <= 0
    || envelope.maximumVariationStrength > 1) {
    fail('invalid-custom-mesh-edit-envelope', 'C8 custom meshes require finite bounded displacement and variation limits.', { envelope });
  }
  return canonicalizeJson(value);
}

export function sha256Bytes(bytes) {
  const view = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length);
  return `sha256:${createHash('sha256').update(view).digest('hex')}`;
}

/** Verify bytes before any GLB is parsed or admitted as an editable authority. */
export function verifyC8CustomMeshArtifactBytes(artifact, bytes) {
  validateArtifact(artifact, artifact.role);
  const view = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length);
  if (view.byteLength !== artifact.byteLength) {
    fail('custom-mesh-byte-length-mismatch', `${artifact.id} byte length does not match its manifest.`, {
      actual: view.byteLength,
      expected: artifact.byteLength,
    });
  }
  if (view.byteLength < 20 || String.fromCharCode(...view.subarray(0, 4)) !== 'glTF') {
    fail('invalid-custom-mesh-glb', `${artifact.id} is not a binary glTF container.`);
  }
  const header = new DataView(view.buffer, view.byteOffset, view.byteLength);
  if (header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== view.byteLength) {
    fail('invalid-custom-mesh-glb-header', `${artifact.id} has an invalid GLB version or declared length.`);
  }
  const actual = sha256Bytes(view);
  if (actual !== artifact.contentHash) {
    fail('custom-mesh-content-hash-mismatch', `${artifact.id} bytes do not match the bound content hash.`, {
      actual,
      expected: artifact.contentHash,
    });
  }
  return Object.freeze({ byteLength: view.byteLength, contentHash: actual, passed: true });
}

export function validateC8SparseSculptDelta(value, customMeshSource) {
  if (value?.schema !== C8_SPARSE_SCULPT_DELTA_SCHEMA
    || value.version !== C8_SPARSE_SCULPT_DELTA_VERSION) {
    fail('invalid-c8-sculpt-schema', 'Sparse sculpt delta schema or version is unsupported.', { value });
  }
  if (value.baseControlContentHash !== customMeshSource.control.contentHash
    || value.baseTopologyHash !== customMeshSource.control.topologyHash) {
    fail('stale-c8-sculpt-base', 'Sparse sculpt delta is not bound to the current control GLB and topology.', { value });
  }
  const operations = Array.isArray(value.operations) ? value.operations : [];
  if (operations.length === 0 || operations.length > 200) {
    fail('invalid-c8-sculpt-operation-count', 'Sparse sculpt delta requires 1–200 operations.', { value });
  }
  let deltaCount = 0;
  for (const operation of operations) {
    const meshVertexCount = customMeshSource.control.geometryAudit.meshVertexCounts[operation.meshIndex];
    if (!Number.isInteger(operation.meshIndex) || operation.meshIndex < 0
      || !Number.isInteger(meshVertexCount) || !Array.isArray(operation.deltas)) {
      fail('invalid-c8-sculpt-operation', 'Each sculpt operation requires a mesh index and delta array.', { operation });
    }
    const vertices = new Set();
    for (const delta of operation.deltas) {
      if (!Array.isArray(delta) || delta.length !== 4 || !delta.every(Number.isFinite)
        || !Number.isInteger(delta[0]) || delta[0] < 0 || delta[0] >= meshVertexCount || vertices.has(delta[0])) {
        fail('invalid-c8-sculpt-delta', 'Each sculpt delta must target one unique non-negative vertex with finite XYZ offsets.', { delta });
      }
      const displacement = Math.hypot(delta[1], delta[2], delta[3]);
      if (displacement > customMeshSource.editEnvelope.maximumDisplacementMetres) {
        fail('c8-sculpt-outside-envelope', 'Sparse sculpt displacement exceeds the source edit envelope.', {
          displacement,
          maximum: customMeshSource.editEnvelope.maximumDisplacementMetres,
        });
      }
      vertices.add(delta[0]);
      deltaCount += 1;
    }
  }
  if (deltaCount === 0 || deltaCount > 10_000) {
    fail('invalid-c8-sculpt-delta-count', 'Sparse sculpt delta requires 1–10,000 changed vertices.', { deltaCount });
  }
  return canonicalizeJson({ ...value, deltaCount });
}

/** Validate the complete saved sculpt history against one base control mesh. */
export function validateC8SparseSculptSequence(values, customMeshSource) {
  if (!Array.isArray(values)) {
    fail('invalid-c8-sculpt-sequence', 'Sparse sculpt history must be an array.', { values });
  }
  const accumulated = new Map();
  let operationCount = 0;
  let deltaCount = 0;
  let maximumAccumulatedDisplacementMetres = 0;
  for (const value of values) {
    const validated = validateC8SparseSculptDelta(value, customMeshSource);
    for (const operation of validated.operations) {
      operationCount += 1;
      for (const [vertexIndex, x, y, z] of operation.deltas) {
        deltaCount += 1;
        const key = `${operation.meshIndex}:${vertexIndex}`;
        const prior = accumulated.get(key) ?? [0, 0, 0];
        const next = [prior[0] + x, prior[1] + y, prior[2] + z];
        const accumulatedDisplacementMetres = Math.hypot(...next);
        if (accumulatedDisplacementMetres > customMeshSource.editEnvelope.maximumDisplacementMetres + 1e-9) {
          fail('c8-sculpt-sequence-outside-envelope', 'Accumulated sparse sculpt displacement exceeds the source edit envelope.', {
            displacement: accumulatedDisplacementMetres,
            maximum: customMeshSource.editEnvelope.maximumDisplacementMetres,
            meshIndex: operation.meshIndex,
            vertexIndex,
          });
        }
        maximumAccumulatedDisplacementMetres = Math.max(
          maximumAccumulatedDisplacementMetres,
          accumulatedDisplacementMetres,
        );
        accumulated.set(key, next);
      }
    }
  }
  if (operationCount > 200 || deltaCount > 10_000) {
    fail('c8-sculpt-sequence-too-large', 'Complete sparse sculpt history is limited to 200 operations and 10,000 deltas.', {
      deltaCount,
      operationCount,
    });
  }
  return Object.freeze({
    deltaCount,
    maximumAccumulatedDisplacementMetres,
    operationCount,
    passed: true,
  });
}

export function createC8SparseSculptDelta(customMeshSource, operations, metadata = {}) {
  return validateC8SparseSculptDelta({
    baseControlContentHash: customMeshSource.control.contentHash,
    baseTopologyHash: customMeshSource.control.topologyHash,
    kind: 'sparse-control-sculpt',
    label: String(metadata.label ?? 'saved-rock-editor-sculpt'),
    operations,
    schema: C8_SPARSE_SCULPT_DELTA_SCHEMA,
    version: C8_SPARSE_SCULPT_DELTA_VERSION,
  }, customMeshSource);
}

export function invalidateC8GeometryDerivatives(previous = {}, {
  reason = 'geometry-source-changed',
  sourceContentId,
  sourceRevision,
} = {}) {
  const result = {};
  for (const role of C8_GEOMETRY_DERIVATIVE_ROLES) {
    result[role] = {
      previousContentHash: SHA256.test(previous?.[role]?.contentHash ?? '')
        ? previous[role].contentHash
        : null,
      reason,
      sourceContentId,
      sourceRevision,
      status: 'stale',
    };
  }
  result.surfaceReprojection = {
    reason,
    sourceContentId,
    sourceRevision,
    status: 'stale',
  };
  return canonicalizeJson(result);
}

/**
 * Recalculate C7 maps in metre-isotropic triplanar space for edited geometry.
 * This is deterministic map reprojection, never a claim of a Blender
 * high-to-low normal/AO/residual bake.
 */
export function createC8SurfaceReprojection({
  dimensionsMetres,
  geology,
  mapResolution = 512,
  seed,
  sourceContentId,
  sourceId,
  sourceRevision,
} = {}) {
  const resolution = Math.max(32, Math.min(2048, Math.round(Number(mapResolution) || 512)));
  const base = createC7SurfaceSpecification({
    assetId: sourceId,
    dimensionsMetres,
    geology,
    seed,
  });
  const result = {
    geology,
    mapResolution: resolution,
    method: 'deterministic-metre-triplanar-map-reprojection',
    projection: resolveC7Projection({ dimensionsMetres, geology }),
    schema: C8_SURFACE_REPROJECTION_SCHEMA,
    seed: base.seed,
    sourceContentId,
    sourceId,
    sourceRevision,
    trueHighToLowBake: false,
    version: C8_SURFACE_REPROJECTION_VERSION,
  };
  return canonicalizeJson({ ...result, reprojectionContentId: contentId(result) });
}

export function markC8SurfaceReprojectionCurrent(derivedArtifactState, surfaceReprojection) {
  return canonicalizeJson({
    ...derivedArtifactState,
    surfaceReprojection: {
      contentHash: surfaceReprojection.reprojectionContentId,
      method: surfaceReprojection.method,
      sourceContentId: surfaceReprojection.sourceContentId,
      sourceRevision: surfaceReprojection.sourceRevision,
      status: 'current',
      trueHighToLowBake: false,
    },
  });
}

export function exposeC8CustomMeshAuthoring(sourcePackage) {
  const source = validateC8CustomMeshSource(sourcePackage.customMeshSource, {
    identityLandmarks: sourcePackage.identityLandmarks,
  });
  return Object.freeze({
    artifacts: Object.freeze({ control: source.control, highDetail: source.highDetail }),
    identityLandmarks: Object.freeze(structuredClone(sourcePackage.identityLandmarks)),
    semanticRegions: source.semanticRegions,
  });
}
