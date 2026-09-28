const DEFAULT_EPSILON = 1e-6;
const DEFAULT_ORTHOGONALITY_TOLERANCE = 0.1;

function finite(value) {
  return Number.isFinite(Number(value));
}

/**
 * Audits a geometry tangent attribute before a normal-mapped material can
 * consume it. A missing tangent attribute is valid: Three.js derives a
 * derivative TBN frame. A present but zero/invalid attribute is not valid and
 * produces literal black facets in WebGPU/TSL normal mapping.
 */
export function inspectRockGeometryTangents(geometry, {
  epsilon = DEFAULT_EPSILON,
  orthogonalityTolerance = DEFAULT_ORTHOGONALITY_TOLERANCE,
} = {}) {
  const position = geometry?.getAttribute?.('position');
  const normal = geometry?.getAttribute?.('normal');
  const tangent = geometry?.getAttribute?.('tangent');
  const vertices = position?.count ?? 0;
  const report = {
    vertices,
    hasTangents: Boolean(tangent),
    tangentVertices: tangent?.count ?? 0,
    invalidVertices: 0,
    zeroLength: 0,
    nonFinite: 0,
    invalidHandedness: 0,
    nonOrthogonal: 0,
    countMismatch: Boolean(tangent && tangent.count !== vertices),
    itemSizeInvalid: Boolean(tangent && tangent.itemSize < 4),
    valid: true,
  };
  if (!tangent) return report;

  const epsilonSquared = Math.max(Number(epsilon) || DEFAULT_EPSILON, 1e-12) ** 2;
  const orthogonality = Math.max(
    Number(orthogonalityTolerance) || DEFAULT_ORTHOGONALITY_TOLERANCE,
    1e-6,
  );
  const count = Math.min(tangent.count, vertices || tangent.count);
  for (let index = 0; index < count; index += 1) {
    const x = tangent.getX(index);
    const y = tangent.getY(index);
    const z = tangent.getZ(index);
    const w = tangent.itemSize > 3 ? tangent.getW(index) : 0;
    const lengthSquared = (x * x) + (y * y) + (z * z);
    let invalid = false;
    if (![x, y, z, w].every(finite)) {
      report.nonFinite += 1;
      invalid = true;
    }
    if (!finite(lengthSquared) || lengthSquared <= epsilonSquared) {
      report.zeroLength += 1;
      invalid = true;
    }
    if (!finite(w) || Math.abs(w) < 0.5) {
      report.invalidHandedness += 1;
      invalid = true;
    }
    if (normal && normal.count > index && finite(lengthSquared) && lengthSquared > epsilonSquared) {
      const nx = normal.getX(index);
      const ny = normal.getY(index);
      const nz = normal.getZ(index);
      const normalLengthSquared = (nx * nx) + (ny * ny) + (nz * nz);
      if (normalLengthSquared > epsilonSquared) {
        const cosine = Math.abs((x * nx) + (y * ny) + (z * nz))
          / Math.sqrt(lengthSquared * normalLengthSquared);
        if (!finite(cosine) || cosine > orthogonality) {
          report.nonOrthogonal += 1;
          invalid = true;
        }
      }
    }
    if (invalid) report.invalidVertices += 1;
  }
  if (report.countMismatch || report.itemSizeInvalid) {
    report.invalidVertices = Math.max(report.invalidVertices, tangent.count);
  }
  report.valid = report.invalidVertices === 0
    && !report.countMismatch
    && !report.itemSizeInvalid;
  return report;
}

/**
 * Removes only invalid tangent attributes. Three.js then uses its derivative
 * tangent frame, which is the safe fallback for degenerate UV islands. Vertex
 * positions, normals, UVs, indices, materials, and texture files are untouched.
 */
export function sanitizeRockGeometryTangents(geometry, options = {}) {
  const inspection = inspectRockGeometryTangents(geometry, options);
  const removed = inspection.hasTangents && !inspection.valid;
  if (removed) {
    geometry.deleteAttribute('tangent');
    geometry.userData ??= {};
    geometry.userData.toonLabRemovedInvalidTangents = {
      invalidVertices: inspection.invalidVertices,
      tangentVertices: inspection.tangentVertices,
    };
  }
  return { ...inspection, removed };
}

/** Audits and repairs every mesh below a rock root. */
export function sanitizeRockTangents(root, options = {}) {
  const issues = [];
  const report = {
    meshes: 0,
    meshesWithTangents: 0,
    repairedMeshes: 0,
    vertices: 0,
    tangentVertices: 0,
    invalidVertices: 0,
    issues,
  };
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.geometry) return;
    report.meshes += 1;
    const result = sanitizeRockGeometryTangents(object.geometry, options);
    report.vertices += result.vertices;
    report.tangentVertices += result.tangentVertices;
    report.invalidVertices += result.invalidVertices;
    if (result.hasTangents) report.meshesWithTangents += 1;
    if (result.removed) {
      report.repairedMeshes += 1;
      issues.push({
        mesh: object.name || `mesh-${report.meshes}`,
        invalidVertices: result.invalidVertices,
        tangentVertices: result.tangentVertices,
      });
    }
  });
  return report;
}
