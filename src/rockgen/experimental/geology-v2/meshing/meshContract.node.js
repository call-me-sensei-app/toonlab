// Common indexed-triangle mesh contract and deterministic geometry helpers.

function triangleNormal(positions, a, b, c) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const abx = positions[b * 3] - ax;
  const aby = positions[b * 3 + 1] - ay;
  const abz = positions[b * 3 + 2] - az;
  const acx = positions[c * 3] - ax;
  const acy = positions[c * 3 + 1] - ay;
  const acz = positions[c * 3 + 2] - az;
  return [
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  ];
}

export function assertMeshContract(mesh) {
  if (!mesh || !(mesh.positions instanceof Float32Array || mesh.positions instanceof Float64Array)) {
    throw new TypeError('Mesh positions must be Float32Array or Float64Array.');
  }
  if (!(mesh.indices instanceof Uint32Array)) throw new TypeError('Mesh indices must be Uint32Array.');
  if (mesh.positions.length % 3 !== 0 || mesh.indices.length % 3 !== 0) {
    throw new RangeError('Mesh position and index arrays must describe complete vertices and triangles.');
  }
  const vertexCount = mesh.positions.length / 3;
  for (let index = 0; index < mesh.indices.length; index += 1) {
    if (mesh.indices[index] >= vertexCount) {
      throw new RangeError(`Triangle index ${mesh.indices[index]} is outside ${vertexCount} vertices.`);
    }
  }
  return mesh;
}

export function orientMeshToField(mesh, evaluate) {
  assertMeshContract(mesh);
  if (typeof evaluate !== 'function') return mesh;
  const indices = new Uint32Array(mesh.indices);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    const normal = triangleNormal(mesh.positions, a, b, c);
    const cx = (mesh.positions[a * 3] + mesh.positions[b * 3] + mesh.positions[c * 3]) / 3;
    const cy = (mesh.positions[a * 3 + 1] + mesh.positions[b * 3 + 1] + mesh.positions[c * 3 + 1]) / 3;
    const cz = (mesh.positions[a * 3 + 2] + mesh.positions[b * 3 + 2] + mesh.positions[c * 3 + 2]) / 3;
    const span = mesh.metadata?.cellSize ?? 1;
    const epsilon = Math.max(span * 0.12, Math.max(Math.abs(cx), Math.abs(cy), Math.abs(cz), 1) * 1e-7);
    const gx = evaluate(cx + epsilon, cy, cz) - evaluate(cx - epsilon, cy, cz);
    const gy = evaluate(cx, cy + epsilon, cz) - evaluate(cx, cy - epsilon, cz);
    const gz = evaluate(cx, cy, cz + epsilon) - evaluate(cx, cy, cz - epsilon);
    if (normal[0] * gx + normal[1] * gy + normal[2] * gz < 0) {
      indices[offset + 1] = c;
      indices[offset + 2] = b;
    }
  }
  return { ...mesh, indices };
}

function triangleQuality(positions, a, b, c) {
  const normal = triangleNormal(positions, a, b, c);
  const area2 = Math.hypot(...normal);
  const squaredLength = (from, to) => {
    const x = positions[from * 3] - positions[to * 3];
    const y = positions[from * 3 + 1] - positions[to * 3 + 1];
    const z = positions[from * 3 + 2] - positions[to * 3 + 2];
    return x * x + y * y + z * z;
  };
  const perimeterSquared = squaredLength(a, b) + squaredLength(b, c) + squaredLength(c, a);
  return perimeterSquared > 0 ? area2 / perimeterSquared : 0;
}

export function triangulatePolygon(indices, positions) {
  const polygon = [...indices];
  if (polygon.length < 3) return [];
  if (polygon.length === 3) return polygon;
  if (polygon.length !== 4) {
    const triangles = [];
    for (let i = 1; i + 1 < polygon.length; i += 1) triangles.push(polygon[0], polygon[i], polygon[i + 1]);
    return triangles;
  }
  const [a, b, c, d] = polygon;
  const ac = Math.min(triangleQuality(positions, a, b, c), triangleQuality(positions, a, c, d));
  const bd = Math.min(triangleQuality(positions, a, b, d), triangleQuality(positions, b, c, d));
  return ac >= bd ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
}

export function compactMesh(mesh) {
  assertMeshContract(mesh);
  const remap = new Int32Array(mesh.positions.length / 3).fill(-1);
  let next = 0;
  for (const index of mesh.indices) {
    if (remap[index] < 0) remap[index] = next++;
  }
  const positions = new mesh.positions.constructor(next * 3);
  for (let old = 0; old < remap.length; old += 1) {
    const mapped = remap[old];
    if (mapped < 0) continue;
    positions[mapped * 3] = mesh.positions[old * 3];
    positions[mapped * 3 + 1] = mesh.positions[old * 3 + 1];
    positions[mapped * 3 + 2] = mesh.positions[old * 3 + 2];
  }
  const indices = Uint32Array.from(mesh.indices, (index) => remap[index]);
  return { ...mesh, indices, positions };
}

export function computeGradientNormals(mesh, evaluate) {
  assertMeshContract(mesh);
  const normals = new Float32Array(mesh.positions.length);
  const epsilon = Math.max(mesh.metadata?.cellSize * 0.2 || 0, 1e-7);
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const z = mesh.positions[vertex * 3 + 2];
    let nx = evaluate(x + epsilon, y, z) - evaluate(x - epsilon, y, z);
    let ny = evaluate(x, y + epsilon, z) - evaluate(x, y - epsilon, z);
    let nz = evaluate(x, y, z + epsilon) - evaluate(x, y, z - epsilon);
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    normals[vertex * 3] = nx;
    normals[vertex * 3 + 1] = ny;
    normals[vertex * 3 + 2] = nz;
  }
  return normals;
}

/**
 * Produce a render-only mesh that duplicates vertices across dihedral creases.
 * The untouched indexed source remains the topology authority.
 */
export function buildCreaseAwareRenderMesh(mesh, { creaseAngleDegrees = 55 } = {}) {
  assertMeshContract(mesh);
  const cosineThreshold = Math.cos(creaseAngleDegrees * Math.PI / 180);
  const triangleCount = mesh.indices.length / 3;
  const faceNormals = new Float64Array(triangleCount * 3);
  const incident = Array.from({ length: mesh.positions.length / 3 }, () => []);
  for (let face = 0; face < triangleCount; face += 1) {
    const offset = face * 3;
    const normal = triangleNormal(
      mesh.positions,
      mesh.indices[offset],
      mesh.indices[offset + 1],
      mesh.indices[offset + 2],
    );
    const length = Math.hypot(...normal) || 1;
    faceNormals[offset] = normal[0] / length;
    faceNormals[offset + 1] = normal[1] / length;
    faceNormals[offset + 2] = normal[2] / length;
    incident[mesh.indices[offset]].push(face);
    incident[mesh.indices[offset + 1]].push(face);
    incident[mesh.indices[offset + 2]].push(face);
  }

  const positions = [];
  const normals = [];
  const indices = new Uint32Array(mesh.indices.length);
  const cornerMap = new Map();
  for (let vertex = 0; vertex < incident.length; vertex += 1) {
    const clusters = [];
    for (const face of incident[vertex]) {
      const nx = faceNormals[face * 3];
      const ny = faceNormals[face * 3 + 1];
      const nz = faceNormals[face * 3 + 2];
      let cluster = clusters.find((entry) => {
        const length = Math.hypot(entry.nx, entry.ny, entry.nz) || 1;
        return (entry.nx * nx + entry.ny * ny + entry.nz * nz) / length >= cosineThreshold;
      });
      if (!cluster) {
        cluster = { faces: [], nx: 0, ny: 0, nz: 0 };
        clusters.push(cluster);
      }
      cluster.faces.push(face);
      cluster.nx += nx;
      cluster.ny += ny;
      cluster.nz += nz;
    }
    for (const cluster of clusters) {
      const output = positions.length / 3;
      positions.push(mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]);
      const length = Math.hypot(cluster.nx, cluster.ny, cluster.nz) || 1;
      normals.push(cluster.nx / length, cluster.ny / length, cluster.nz / length);
      for (const face of cluster.faces) cornerMap.set(`${face}:${vertex}`, output);
    }
  }
  for (let face = 0; face < triangleCount; face += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const source = mesh.indices[face * 3 + corner];
      indices[face * 3 + corner] = cornerMap.get(`${face}:${source}`);
    }
  }
  return {
    indices,
    metadata: {
      ...mesh.metadata,
      creaseAngleDegrees,
      normalPolicy: 'area-weighted face clusters split at dihedral crease',
      topologySourceVertexCount: mesh.positions.length / 3,
    },
    normals: new Float32Array(normals),
    positions: new Float64Array(positions),
  };
}
