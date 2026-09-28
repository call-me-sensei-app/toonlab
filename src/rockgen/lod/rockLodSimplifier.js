import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

import { getGeometryTriangleCount } from './rockLodMetrics.js';

const MODIFIER = new SimplifyModifier();

function clampInteger(value, min, max) {
  return Math.min(Math.max(Math.round(Number(value)), min), max);
}

function geometryWithAoCarrier(source) {
  const geometry = source.clone();
  const ao = geometry.getAttribute('envVertexAo');
  if (!ao || geometry.getAttribute('uv')) return { geometry, carriedAo: false };
  const uv = new Float32Array(ao.count * 2);
  for (let index = 0; index < ao.count; index += 1) uv[index * 2] = ao.getX(index);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.deleteAttribute('envVertexAo');
  return { geometry, carriedAo: true };
}

function restoreCarriedAo(geometry, carriedAo) {
  if (!carriedAo) return geometry;
  const uv = geometry.getAttribute('uv');
  if (uv) {
    const ao = new Float32Array(uv.count);
    for (let index = 0; index < uv.count; index += 1) ao[index] = uv.getX(index);
    geometry.setAttribute('envVertexAo', new THREE.BufferAttribute(ao, 1));
    geometry.deleteAttribute('uv');
  }
  return geometry;
}

/**
 * Reduces an indexed rock mesh toward an explicit triangle budget with Three's
 * curvature-aware edge-collapse modifier. Rock AO is temporarily carried in
 * UV.x so every exported LOD retains the same intrinsic shading contract.
 */
export function simplifyRockGeometryToTriangleBudget(source, targetTriangles, {
  maxAttempts = 6,
} = {}) {
  if (!source?.isBufferGeometry) throw new TypeError('Rock LOD simplification requires a BufferGeometry.');
  const baseTriangles = getGeometryTriangleCount(source);
  const target = clampInteger(targetTriangles, 1, Math.max(baseTriangles, 1));
  if (target >= baseTriangles) {
    return {
      geometry: source,
      removedVertices: 0,
      retainedSource: true,
      targetTriangles: target,
      triangleCount: baseTriangles,
    };
  }

  const vertexCount = source.getAttribute('position')?.count ?? 0;
  const maxRemoval = Math.max(vertexCount - 4, 0);
  if (maxRemoval === 0) {
    return {
      geometry: source,
      removedVertices: 0,
      retainedSource: true,
      targetTriangles: target,
      triangleCount: baseTriangles,
    };
  }

  const { geometry: working, carriedAo } = geometryWithAoCarrier(source);
  const candidates = new Map();
  const measure = (removal) => {
    const count = clampInteger(removal, 0, maxRemoval);
    if (candidates.has(count)) return candidates.get(count);
    const geometry = count === 0 ? working.clone() : MODIFIER.modify(working, count);
    restoreCarriedAo(geometry, carriedAo);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const candidate = {
      geometry,
      removedVertices: count,
      retainedSource: false,
      targetTriangles: target,
      triangleCount: getGeometryTriangleCount(geometry),
    };
    candidates.set(count, candidate);
    return candidate;
  };

  // Closed rock surfaces follow F ~= 2V - 4, making this estimate exact for
  // most meshes and a strong first guess for multi-piece/bordered variants.
  let removal = clampInteger(
    vertexCount - Math.max(Math.round((target + 4) * 0.5), 4),
    0,
    maxRemoval,
  );
  const acceptableShortfall = Math.max(2, Math.round(target * 0.06));
  for (let attempt = 0; attempt < Math.max(Math.round(maxAttempts), 1); attempt += 1) {
    const candidate = measure(removal);
    const delta = candidate.triangleCount - target;
    if (delta <= 0 && -delta <= acceptableShortfall && candidate.triangleCount > 0) break;
    const correction = Math.max(Math.ceil(Math.abs(delta) * 0.5), 1);
    const next = clampInteger(removal + (delta > 0 ? correction : -correction), 0, maxRemoval);
    if (next === removal) break;
    removal = next;
  }

  const current = measure(removal);
  for (const offset of [-2, -1, 1, 2]) measure(current.removedVertices + offset);
  const viable = [...candidates.values()].filter((candidate) => candidate.triangleCount > 0);
  const underBudget = viable.filter((candidate) => candidate.triangleCount <= target);
  const ranked = underBudget.length > 0 ? underBudget : viable;
  ranked.sort((left, right) => (
    Math.abs(left.triangleCount - target) - Math.abs(right.triangleCount - target)
    || right.triangleCount - left.triangleCount
    || left.removedVertices - right.removedVertices
  ));
  const selected = ranked[0] ?? null;
  for (const candidate of candidates.values()) {
    if (candidate !== selected) candidate.geometry.dispose();
  }
  working.dispose();

  if (!selected) {
    return {
      geometry: source,
      removedVertices: 0,
      retainedSource: true,
      targetTriangles: target,
      triangleCount: baseTriangles,
    };
  }
  return selected;
}

/**
 * Restores the reference AABB after edge collapse. Extreme silhouette points
 * are the first vertices many generic simplifiers sacrifice on thin rocks;
 * this deterministic affine correction keeps LOD pivots, footprint, and total
 * extents stable without adding triangles.
 */
export function matchRockGeometryBounds(geometry, referenceGeometry) {
  if (!geometry?.isBufferGeometry || !referenceGeometry?.isBufferGeometry) {
    throw new TypeError('Rock LOD bound matching requires two BufferGeometry objects.');
  }
  geometry.computeBoundingBox();
  referenceGeometry.computeBoundingBox();
  const sourceBox = geometry.boundingBox;
  const referenceBox = referenceGeometry.boundingBox;
  if (!sourceBox || !referenceBox || sourceBox.isEmpty() || referenceBox.isEmpty()) return geometry;
  const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
  const referenceCenter = referenceBox.getCenter(new THREE.Vector3());
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const referenceSize = referenceBox.getSize(new THREE.Vector3());
  const scale = new THREE.Vector3(
    sourceSize.x > 1e-8 ? referenceSize.x / sourceSize.x : 1,
    sourceSize.y > 1e-8 ? referenceSize.y / sourceSize.y : 1,
    sourceSize.z > 1e-8 ? referenceSize.z / sourceSize.z : 1,
  );
  const matrix = new THREE.Matrix4().makeTranslation(
    -sourceCenter.x,
    -sourceCenter.y,
    -sourceCenter.z,
  );
  matrix.premultiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
  matrix.premultiply(new THREE.Matrix4().makeTranslation(
    referenceCenter.x,
    referenceCenter.y,
    referenceCenter.z,
  ));
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
