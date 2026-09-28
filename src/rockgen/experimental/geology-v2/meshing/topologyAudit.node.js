import * as THREE from 'three';
import { ExtendedTriangle, MeshBVH } from 'three-mesh-bvh';

import { assertMeshContract } from './meshContract.node.js';
import { assertScalarGrid, gridPointIndex } from './scalarGrid.node.js';

function undirectedEdgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function find(parent, value) {
  let root = value;
  while (parent[root] !== root) root = parent[root];
  while (parent[value] !== root) {
    const next = parent[value];
    parent[value] = root;
    value = next;
  }
  return root;
}

function join(parent, a, b) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function meshBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return { dimensions: max.map((value, axis) => value - min[axis]), max, min };
}

function createBvh(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  const bvh = new MeshBVH(geometry, { indirect: true, maxLeafTris: 8 });
  return { bvh, geometry };
}

function triangleFromMesh(mesh, face, target) {
  const offset = face * 3;
  const a = mesh.indices[offset];
  const b = mesh.indices[offset + 1];
  const c = mesh.indices[offset + 2];
  target.a.set(mesh.positions[a * 3], mesh.positions[a * 3 + 1], mesh.positions[a * 3 + 2]);
  target.b.set(mesh.positions[b * 3], mesh.positions[b * 3 + 1], mesh.positions[b * 3 + 2]);
  target.c.set(mesh.positions[c * 3], mesh.positions[c * 3 + 1], mesh.positions[c * 3 + 2]);
  target.update();
  return [a, b, c];
}

export function auditSelfIntersections(mesh, { maxExamples = 24 } = {}) {
  assertMeshContract(mesh);
  if (mesh.indices.length === 0) return { examples: [], pairs: 0 };
  const { bvh, geometry } = createBvh(mesh);
  const source = new ExtendedTriangle();
  const sourceBox = new THREE.Box3();
  const examples = [];
  let pairs = 0;
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const sourceVertices = triangleFromMesh(mesh, face, source);
    sourceBox.makeEmpty().expandByPoint(source.a).expandByPoint(source.b).expandByPoint(source.c);
    const extent = sourceBox.getSize(new THREE.Vector3()).length();
    sourceBox.expandByScalar(Math.max(extent * 1e-8, 1e-10));
    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsBox(sourceBox),
      intersectsTriangle: (triangle, otherFace) => {
        if (otherFace <= face) return false;
        const otherOffset = otherFace * 3;
        const otherVertices = [
          mesh.indices[otherOffset],
          mesh.indices[otherOffset + 1],
          mesh.indices[otherOffset + 2],
        ];
        if (sourceVertices.some((vertex) => otherVertices.includes(vertex))) return false;
        if (source.intersectsTriangle(triangle)) {
          pairs += 1;
          if (examples.length < maxExamples) examples.push([face, otherFace]);
        }
        return false;
      },
    });
  }
  geometry.dispose();
  return { examples, pairs };
}

function vertexManifoldFailures(vertexCount, indices) {
  const incident = Array.from({ length: vertexCount }, () => []);
  for (let face = 0; face < indices.length / 3; face += 1) {
    incident[indices[face * 3]].push(face);
    incident[indices[face * 3 + 1]].push(face);
    incident[indices[face * 3 + 2]].push(face);
  }
  const failures = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (incident[vertex].length === 0) continue;
    const link = new Map();
    const add = (a, b) => {
      if (!link.has(a)) link.set(a, new Set());
      if (!link.has(b)) link.set(b, new Set());
      link.get(a).add(b);
      link.get(b).add(a);
    };
    for (const face of incident[vertex]) {
      const triangle = [indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]];
      const others = triangle.filter((entry) => entry !== vertex);
      if (others.length === 2) add(others[0], others[1]);
    }
    if ([...link.values()].some((neighbors) => neighbors.size !== 2)) {
      failures.push(vertex);
      continue;
    }
    const start = link.keys().next().value;
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const neighbor of link.get(current)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    if (seen.size !== link.size) failures.push(vertex);
  }
  return failures;
}

export function auditMeshTopology(mesh, {
  evaluate = null,
  grid = null,
  includeSelfIntersections = true,
  sliverAngleDegrees = 0.5,
} = {}) {
  assertMeshContract(mesh);
  if (grid) assertScalarGrid(grid);
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  const parent = Int32Array.from({ length: vertexCount }, (_, index) => index);
  const edges = new Map();
  const duplicateTriangleKeys = new Set();
  const duplicateTriangles = [];
  const degenerateTriangles = [];
  const sliverTriangles = [];
  let nonFiniteVertices = 0;
  let signedVolumeTimesSix = 0;
  let surfaceArea = 0;
  let windingFieldDisagreements = 0;
  let minimumAngleDegrees = 180;
  const faceRecords = [];
  const bounds = meshBounds(mesh.positions);
  const scale = Math.max(...bounds.dimensions, 1e-12);
  const areaTolerance = scale * scale * 1e-13;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (![mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]].every(Number.isFinite)) {
      nonFiniteVertices += 1;
    }
  }

  for (let face = 0; face < triangleCount; face += 1) {
    const offset = face * 3;
    const a = mesh.indices[offset];
    const b = mesh.indices[offset + 1];
    const c = mesh.indices[offset + 2];
    join(parent, a, b);
    join(parent, a, c);
    const sorted = [a, b, c].sort((left, right) => left - right).join(':');
    if (duplicateTriangleKeys.has(sorted)) duplicateTriangles.push(face);
    duplicateTriangleKeys.add(sorted);
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = undirectedEdgeKey(from, to);
      const entry = edges.get(key) ?? { count: 0, direction: 0, vertices: from < to ? [from, to] : [to, from] };
      entry.count += 1;
      entry.direction += from < to ? 1 : -1;
      edges.set(key, entry);
    }

    const ax = mesh.positions[a * 3];
    const ay = mesh.positions[a * 3 + 1];
    const az = mesh.positions[a * 3 + 2];
    const bx = mesh.positions[b * 3];
    const by = mesh.positions[b * 3 + 1];
    const bz = mesh.positions[b * 3 + 2];
    const cx = mesh.positions[c * 3];
    const cy = mesh.positions[c * 3 + 1];
    const cz = mesh.positions[c * 3 + 2];
    const ab = [bx - ax, by - ay, bz - az];
    const ac = [cx - ax, cy - ay, cz - az];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const area2 = Math.hypot(...normal);
    surfaceArea += area2 * 0.5;
    if (a === b || b === c || c === a || area2 <= areaTolerance) degenerateTriangles.push(face);
    const lengths = [
      Math.hypot(...ab),
      Math.hypot(cx - bx, cy - by, cz - bz),
      Math.hypot(...ac),
    ];
    const angle = (opposite, sideA, sideB) => {
      const denominator = 2 * sideA * sideB;
      if (!(denominator > 0)) return 0;
      const cosine = Math.min(Math.max((sideA ** 2 + sideB ** 2 - opposite ** 2) / denominator, -1), 1);
      return Math.acos(cosine) * 180 / Math.PI;
    };
    const faceMinimumAngle = Math.min(
      angle(lengths[1], lengths[0], lengths[2]),
      angle(lengths[2], lengths[0], lengths[1]),
      angle(lengths[0], lengths[1], lengths[2]),
    );
    minimumAngleDegrees = Math.min(minimumAngleDegrees, faceMinimumAngle);
    if (faceMinimumAngle < sliverAngleDegrees) sliverTriangles.push(face);
    const faceSignedVolumeTimesSix = ax * (by * cz - bz * cy)
      - ay * (bx * cz - bz * cx)
      + az * (bx * cy - by * cx);
    signedVolumeTimesSix += faceSignedVolumeTimesSix;

    let fieldDisagrees = null;
    if ((evaluate || grid) && area2 > areaTolerance) {
      const center = [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3];
      // Test the actual geometric normal and cap the probe by local triangle
      // size. A fixed voxel-scale central difference can jump completely over
      // a valid sub-voxel component and falsely label it inverted.
      const epsilon = Math.max(
        Math.min(mesh.metadata?.cellSize * 0.15 || scale * 1e-5, Math.min(...lengths) * 0.2),
        scale * 1e-10,
      );
      const unitNormal = normal.map((value) => value / area2);
      const sampleField = grid
        ? (point) => trilinearSample(grid, point).value
        : (point) => evaluate(point[0], point[1], point[2]);
      const outside = sampleField(center.map((value, axis) => value + unitNormal[axis] * epsilon));
      const inside = sampleField(center.map((value, axis) => value - unitNormal[axis] * epsilon));
      const delta = outside - inside;
      const comparisonTolerance = Math.max(Math.abs(outside), Math.abs(inside), 1) * Number.EPSILON * 64;
      if (Math.abs(delta) > comparisonTolerance) {
        fieldDisagrees = delta < 0;
        if (fieldDisagrees) windingFieldDisagreements += 1;
      }
    }
    faceRecords.push({ fieldDisagrees, signedVolumeTimesSix: faceSignedVolumeTimesSix, vertex: a });
  }

  const boundaryEdges = [];
  const nonManifoldEdges = [];
  const windingEdges = [];
  for (const entry of edges.values()) {
    if (entry.count === 1) boundaryEdges.push(entry.vertices);
    if (entry.count > 2) nonManifoldEdges.push([...entry.vertices, entry.count]);
    if (entry.count === 2 && entry.direction !== 0) windingEdges.push(entry.vertices);
  }
  const roots = new Set();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) roots.add(find(parent, vertex));
  const fieldOrientationComponents = new Map();
  for (const record of faceRecords) {
    const root = find(parent, record.vertex);
    const component = fieldOrientationComponents.get(root) ?? {
      comparableTriangles: 0,
      fieldDisagreements: 0,
      root,
      signedVolume: 0,
      triangles: 0,
    };
    component.triangles += 1;
    component.signedVolume += record.signedVolumeTimesSix / 6;
    if (record.fieldDisagrees !== null) {
      component.comparableTriangles += 1;
      component.fieldDisagreements += Number(record.fieldDisagrees);
    }
    fieldOrientationComponents.set(root, component);
  }
  const componentOrientation = [...fieldOrientationComponents.values()]
    .sort((left, right) => left.root - right.root)
    .map((component) => ({
      ...component,
      fieldDisagreementRatio: component.comparableTriangles > 0
        ? component.fieldDisagreements / component.comparableTriangles
        : null,
      invertedAgainstField: component.comparableTriangles > 0
        && component.fieldDisagreements > component.comparableTriangles / 2,
    }));
  const invertedFieldOrientationComponents = componentOrientation
    .filter((component) => component.invertedAgainstField).length;
  const nonManifoldVertices = vertexManifoldFailures(vertexCount, mesh.indices);
  const selfIntersections = includeSelfIntersections
    ? auditSelfIntersections(mesh)
    : { examples: [], pairs: null };
  const eulerCharacteristic = vertexCount - edges.size + triangleCount;
  const closedOrientableGenus = boundaryEdges.length === 0
    && nonManifoldEdges.length === 0
    && nonManifoldVertices.length === 0
    && windingEdges.length === 0
    ? (2 * roots.size - eulerCharacteristic) / 2
    : null;
  const topologyFailures = nonFiniteVertices
    + boundaryEdges.length
    + nonManifoldEdges.length
    + nonManifoldVertices.length
    + windingEdges.length
    + degenerateTriangles.length
    + duplicateTriangles.length
    + invertedFieldOrientationComponents
    + (selfIntersections.pairs ?? 0);
  return {
    boundaryEdges: boundaryEdges.length,
    bounds,
    closedOrientableGenus,
    componentOrientation,
    components: roots.size,
    degenerateTriangles: degenerateTriangles.length,
    duplicateTriangles: duplicateTriangles.length,
    edgeCount: edges.size,
    eulerCharacteristic,
    examples: {
      boundaryEdges: boundaryEdges.slice(0, 24),
      degenerateTriangles: degenerateTriangles.slice(0, 24),
      duplicateTriangles: duplicateTriangles.slice(0, 24),
      nonManifoldEdges: nonManifoldEdges.slice(0, 24),
      nonManifoldVertices: nonManifoldVertices.slice(0, 24),
      selfIntersections: selfIntersections.examples,
      sliverTriangles: sliverTriangles.slice(0, 24),
      windingEdges: windingEdges.slice(0, 24),
    },
    minimumAngleDegrees,
    invertedFieldOrientationComponents,
    nonFiniteVertices,
    nonManifoldEdges: nonManifoldEdges.length,
    nonManifoldVertices: nonManifoldVertices.length,
    selfIntersectionPairs: selfIntersections.pairs,
    signedVolume: signedVolumeTimesSix / 6,
    sliverTriangles: sliverTriangles.length,
    surfaceArea,
    topologyFailures,
    triangles: triangleCount,
    vertices: vertexCount,
    windingEdges: windingEdges.length,
    windingFieldDisagreements,
  };
}

function trilinearSample(grid, point) {
  const cell = [0, 0, 0];
  const local = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const coordinate = (point[axis] - grid.origin[axis]) / grid.cellSize;
    cell[axis] = Math.min(Math.max(Math.floor(coordinate), 0), grid.cellDims[axis] - 1);
    local[axis] = Math.min(Math.max(coordinate - cell[axis], 0), 1);
  }
  let value = 0;
  const gradient = [0, 0, 0];
  for (let oz = 0; oz <= 1; oz += 1) {
    for (let oy = 0; oy <= 1; oy += 1) {
      for (let ox = 0; ox <= 1; ox += 1) {
        const sample = grid.values[gridPointIndex(grid, cell[0] + ox, cell[1] + oy, cell[2] + oz)];
        const wx = ox ? local[0] : 1 - local[0];
        const wy = oy ? local[1] : 1 - local[1];
        const wz = oz ? local[2] : 1 - local[2];
        value += sample * wx * wy * wz;
        gradient[0] += sample * (ox ? 1 : -1) * wy * wz / grid.cellSize;
        gradient[1] += sample * wx * (oy ? 1 : -1) * wz / grid.cellSize;
        gradient[2] += sample * wx * wy * (oz ? 1 : -1) / grid.cellSize;
      }
    }
  }
  return { gradient, value };
}

function implicitDistance(grid, point) {
  const projected = [...point];
  let bestPoint = [...point];
  let bestResidual = Math.abs(trilinearSample(grid, point).value);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const { gradient, value } = trilinearSample(grid, projected);
    const residual = Math.abs(value);
    if (residual < bestResidual) {
      bestResidual = residual;
      bestPoint = [...projected];
    }
    if (residual <= Math.max(1e-10, grid.cellSize * 1e-8)) break;
    const [gx, gy, gz] = gradient;
    const magnitudeSquared = gx * gx + gy * gy + gz * gz;
    if (!(magnitudeSquared > 1e-20)) break;
    let stepScale = value / magnitudeSquared;
    const stepLength = Math.abs(stepScale) * Math.sqrt(magnitudeSquared);
    if (stepLength > grid.cellSize * 0.75) stepScale *= grid.cellSize * 0.75 / stepLength;
    projected[0] -= gx * stepScale;
    projected[1] -= gy * stepScale;
    projected[2] -= gz * stepScale;
  }
  return Math.hypot(
    bestPoint[0] - point[0],
    bestPoint[1] - point[1],
    bestPoint[2] - point[2],
  );
}

function gridCrossings(grid) {
  const crossings = [];
  const [nx, ny, nz] = grid.cellDims;
  const add = (a, b, pointA, pointB) => {
    if ((a < 0) === (b < 0)) return;
    const t = a / (a - b);
    crossings.push(pointA.map((value, axis) => value + (pointB[axis] - value) * t));
  };
  const point = (x, y, z) => [
    grid.origin[0] + x * grid.cellSize,
    grid.origin[1] + y * grid.cellSize,
    grid.origin[2] + z * grid.cellSize,
  ];
  for (let z = 0; z <= nz; z += 1) for (let y = 0; y <= ny; y += 1) for (let x = 0; x < nx; x += 1) {
    add(
      grid.values[gridPointIndex(grid, x, y, z)],
      grid.values[gridPointIndex(grid, x + 1, y, z)],
      point(x, y, z), point(x + 1, y, z),
    );
  }
  for (let z = 0; z <= nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x <= nx; x += 1) {
    add(
      grid.values[gridPointIndex(grid, x, y, z)],
      grid.values[gridPointIndex(grid, x, y + 1, z)],
      point(x, y, z), point(x, y + 1, z),
    );
  }
  for (let z = 0; z < nz; z += 1) for (let y = 0; y <= ny; y += 1) for (let x = 0; x <= nx; x += 1) {
    add(
      grid.values[gridPointIndex(grid, x, y, z)],
      grid.values[gridPointIndex(grid, x, y, z + 1)],
      point(x, y, z), point(x, y, z + 1),
    );
  }
  return crossings;
}

/**
 * Symmetric sampled Hausdorff audit. Mesh-to-field uses first-order implicit
 * projection distance at vertices and triangle centroids. Field-to-mesh uses
 * every (or a deterministic subset of) lattice zero crossing and BVH closest
 * points. Distances are world-space units and normalized by cell size.
 */
export function auditHausdorff(mesh, grid, evaluate, { maxGridSamples = 12_000 } = {}) {
  assertMeshContract(mesh);
  assertScalarGrid(grid);
  let meshToFieldMax = 0;
  let meshToFieldSumSquared = 0;
  let meshToFieldSamples = 0;
  const samplePoint = (point) => {
    const distance = implicitDistance(grid, point);
    meshToFieldMax = Math.max(meshToFieldMax, distance);
    meshToFieldSumSquared += distance * distance;
    meshToFieldSamples += 1;
  };
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    samplePoint([mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]]);
  }
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const a = mesh.indices[face * 3];
    const b = mesh.indices[face * 3 + 1];
    const c = mesh.indices[face * 3 + 2];
    samplePoint([
      (mesh.positions[a * 3] + mesh.positions[b * 3] + mesh.positions[c * 3]) / 3,
      (mesh.positions[a * 3 + 1] + mesh.positions[b * 3 + 1] + mesh.positions[c * 3 + 1]) / 3,
      (mesh.positions[a * 3 + 2] + mesh.positions[b * 3 + 2] + mesh.positions[c * 3 + 2]) / 3,
    ]);
  }

  const crossings = gridCrossings(grid);
  const stride = Math.max(1, Math.ceil(crossings.length / maxGridSamples));
  const { bvh, geometry } = createBvh(mesh);
  const query = new THREE.Vector3();
  const target = {};
  let fieldToMeshMax = 0;
  let fieldToMeshSumSquared = 0;
  let fieldToMeshSamples = 0;
  for (let index = 0; index < crossings.length; index += stride) {
    query.fromArray(crossings[index]);
    const hit = bvh.closestPointToPoint(query, target);
    if (!hit) continue;
    fieldToMeshMax = Math.max(fieldToMeshMax, hit.distance);
    fieldToMeshSumSquared += hit.distance * hit.distance;
    fieldToMeshSamples += 1;
  }
  geometry.dispose();
  const maximum = Math.max(meshToFieldMax, fieldToMeshMax);
  return {
    cellSize: grid.cellSize,
    fieldToMesh: {
      maximum: fieldToMeshMax,
      normalizedMaximum: fieldToMeshMax / grid.cellSize,
      rms: Math.sqrt(fieldToMeshSumSquared / Math.max(fieldToMeshSamples, 1)),
      samples: fieldToMeshSamples,
      sourceCrossings: crossings.length,
      stride,
    },
    maximum,
    normalizedMaximum: maximum / grid.cellSize,
    meshToField: {
      maximum: meshToFieldMax,
      normalizedMaximum: meshToFieldMax / grid.cellSize,
      rms: Math.sqrt(meshToFieldSumSquared / Math.max(meshToFieldSamples, 1)),
      samples: meshToFieldSamples,
    },
  };
}
