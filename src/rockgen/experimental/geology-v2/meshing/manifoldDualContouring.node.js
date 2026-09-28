import {
  addQefPlane,
  createQefAccumulator,
  evaluateQef,
  mergeQef,
  solveQef,
} from './qef.node.js';
import {
  assertMeshContract,
  compactMesh,
  triangulatePolygon,
} from './meshContract.node.js';
import {
  assertScalarGrid,
  gridCellIndex,
  gridPointIndex,
} from './scalarGrid.node.js';

// Corner numbering is xyz bit order. Keeping it explicit avoids inheriting the
// legacy Surface Nets cell conventions by accident.
export const MDC_CORNER_OFFSETS = Object.freeze([
  Object.freeze([0, 0, 0]), Object.freeze([1, 0, 0]),
  Object.freeze([0, 1, 0]), Object.freeze([1, 1, 0]),
  Object.freeze([0, 0, 1]), Object.freeze([1, 0, 1]),
  Object.freeze([0, 1, 1]), Object.freeze([1, 1, 1]),
]);

export const MDC_CUBE_EDGES = Object.freeze([
  Object.freeze([0, 1]), Object.freeze([2, 3]),
  Object.freeze([4, 5]), Object.freeze([6, 7]),
  Object.freeze([0, 2]), Object.freeze([1, 3]),
  Object.freeze([4, 6]), Object.freeze([5, 7]),
  Object.freeze([0, 4]), Object.freeze([1, 5]),
  Object.freeze([2, 6]), Object.freeze([3, 7]),
]);

// Each face lists cyclic corners and the matching cyclic cube-edge ids.
const MDC_FACES = Object.freeze([
  Object.freeze({ axis: 2, side: 0, corners: [0, 1, 3, 2], edges: [0, 5, 1, 4] }),
  Object.freeze({ axis: 2, side: 1, corners: [4, 5, 7, 6], edges: [2, 7, 3, 6] }),
  Object.freeze({ axis: 1, side: 0, corners: [0, 1, 5, 4], edges: [0, 9, 2, 8] }),
  Object.freeze({ axis: 1, side: 1, corners: [2, 3, 7, 6], edges: [1, 11, 3, 10] }),
  Object.freeze({ axis: 0, side: 0, corners: [0, 2, 6, 4], edges: [4, 10, 6, 8] }),
  Object.freeze({ axis: 0, side: 1, corners: [1, 3, 7, 5], edges: [5, 11, 7, 9] }),
]);

const EDGE_AXIS_START = MDC_CUBE_EDGES.map(([a, b]) => {
  const start = MDC_CORNER_OFFSETS[a].map((value, axis) => Math.min(value, MDC_CORNER_OFFSETS[b][axis]));
  const axis = start.findIndex((value, index) => MDC_CORNER_OFFSETS[a][index] !== MDC_CORNER_OFFSETS[b][index]);
  return { axis, start };
});

function signChanges(a, b) {
  return (a < 0) !== (b < 0);
}

function connect(adjacency, a, b) {
  if (!adjacency[a].includes(b)) adjacency[a].push(b);
  if (!adjacency[b].includes(a)) adjacency[b].push(a);
}

function faceConnections(cornerValues, cell, face) {
  const activeFaceEdges = face.edges.filter((edge) => {
    const [a, b] = MDC_CUBE_EDGES[edge];
    return signChanges(cornerValues[a], cornerValues[b]);
  });
  if (activeFaceEdges.length === 0) return [];
  if (activeFaceEdges.length === 2) return [[activeFaceEdges[0], activeFaceEdges[1]]];
  if (activeFaceEdges.length !== 4) {
    throw new Error(`MDC face in cell [${cell.join(', ')}] has ${activeFaceEdges.length} crossings.`);
  }
  const [a, b, c, d] = face.corners.map((corner) => cornerValues[corner]);
  const determinant = a * c - b * d;
  const determinantScale = Math.abs(a * c) + Math.abs(b * d) + 1;
  const acConnected = Math.abs(determinant) <= Number.EPSILON * 64 * determinantScale
    ? faceTieBreak(cell, face)
    : determinant > 0;
  const [e0, e1, e2, e3] = face.edges;
  return acConnected ? [[e0, e1], [e2, e3]] : [[e0, e3], [e1, e2]];
}

function faceTieBreak(cell, face) {
  // Shared faces receive the same parity because the fixed face definitions
  // preserve the same checkerboard partition on both neighboring cells.
  const coordinate = [cell[0], cell[1], cell[2]];
  coordinate[face.axis] += face.side;
  const hash = Math.imul(coordinate[0] + 1, 73856093)
    ^ Math.imul(coordinate[1] + 1, 19349663)
    ^ Math.imul(coordinate[2] + 1, 83492791)
    ^ Math.imul(face.axis + 1, 2654435761);
  return (hash & 1) === 0;
}

function cellCycles(cornerValues, cell) {
  const active = MDC_CUBE_EDGES.map(([a, b]) => signChanges(cornerValues[a], cornerValues[b]));
  const adjacency = Array.from({ length: 12 }, () => []);
  for (const face of MDC_FACES) {
    for (const [a, b] of faceConnections(cornerValues, cell, face)) connect(adjacency, a, b);
  }

  const activeEdges = active.map((value, edge) => (value ? edge : -1)).filter((edge) => edge >= 0);
  for (const edge of activeEdges) {
    if (adjacency[edge].length !== 2) {
      throw new Error(
        `MDC boundary-cycle graph in cell [${cell.join(', ')}] gives edge ${edge} degree ${adjacency[edge].length}.`,
      );
    }
  }
  const visited = new Set();
  const cycles = [];
  for (const start of activeEdges) {
    if (visited.has(start)) continue;
    const cycle = [];
    let previous = -1;
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      cycle.push(current);
      const choices = adjacency[current];
      const next = choices[0] === previous ? choices[1] : choices[0];
      previous = current;
      current = next;
    }
    if (current !== start) {
      throw new Error(`MDC boundary-cycle graph in cell [${cell.join(', ')}] is not a closed cycle.`);
    }
    cycles.push(cycle.sort((a, b) => a - b));
  }
  cycles.sort((a, b) => a[0] - b[0] || a.length - b.length);
  return cycles;
}

function worldPoint(grid, cell, offset) {
  const globalOrigin = grid.globalOrigin ?? grid.origin;
  const cellOffset = grid.cellOffset ?? [0, 0, 0];
  return offset.map((value, axis) => globalOrigin[axis]
    + (cellOffset[axis] + cell[axis] + value) * grid.cellSize);
}

function gradient(evaluate, point, epsilon) {
  let nx = evaluate(point[0] + epsilon, point[1], point[2])
    - evaluate(point[0] - epsilon, point[1], point[2]);
  let ny = evaluate(point[0], point[1] + epsilon, point[2])
    - evaluate(point[0], point[1] - epsilon, point[2]);
  let nz = evaluate(point[0], point[1], point[2] + epsilon)
    - evaluate(point[0], point[1], point[2] - epsilon);
  const length = Math.hypot(nx, ny, nz);
  if (!(length > 1e-18)) return null;
  nx /= length;
  ny /= length;
  nz /= length;
  return [nx, ny, nz];
}

function edgeKey(cell, edge) {
  const descriptor = EDGE_AXIS_START[edge];
  return `${descriptor.axis}:${cell[0] + descriptor.start[0]}:${cell[1] + descriptor.start[1]}:${cell[2] + descriptor.start[2]}`;
}

function gridEdgeCrossing(grid, evaluate, key) {
  const [axis, x, y, z] = key.split(':').map(Number);
  const start = [x, y, z];
  const end = [...start];
  end[axis] += 1;
  const valueA = grid.values[gridPointIndex(grid, ...start)];
  const valueB = grid.values[gridPointIndex(grid, ...end)];
  const t = Math.min(Math.max(valueA / (valueA - valueB), 0), 1);
  const globalOrigin = grid.globalOrigin ?? grid.origin;
  const cellOffset = grid.cellOffset ?? [0, 0, 0];
  const point = start.map((value, coordinateAxis) => globalOrigin[coordinateAxis]
    + (cellOffset[coordinateAxis] + value + (coordinateAxis === axis ? t : 0)) * grid.cellSize);
  return { normal: gradient(evaluate, point, grid.cellSize * 0.2), point };
}

function createCellVertex(grid, evaluate, cell, cycle, cornerValues, index) {
  const qef = createQefAccumulator();
  const epsilon = grid.cellSize * 0.2;
  for (const edge of cycle) {
    const [cornerA, cornerB] = MDC_CUBE_EDGES[edge];
    const valueA = cornerValues[cornerA];
    const valueB = cornerValues[cornerB];
    const t = Math.min(Math.max(valueA / (valueA - valueB), 0), 1);
    const offsetA = MDC_CORNER_OFFSETS[cornerA];
    const offsetB = MDC_CORNER_OFFSETS[cornerB];
    const offset = offsetA.map((value, axis) => value + (offsetB[axis] - value) * t);
    const point = worldPoint(grid, cell, offset);
    const normal = gradient(evaluate, point, epsilon);
    if (normal) addQefPlane(qef, point, normal);
  }
  if (qef.count === 0) {
    throw new Error(`MDC could not estimate a gradient in cell [${cell.join(', ')}].`);
  }
  // A dual vertex exactly on a shared cell edge can coincide bit-for-bit with
  // vertices from two or three neighboring cells, producing zero-area faces
  // even though the QEF error is minimal. The symbolic inset is 0.01% of a
  // voxel: below bake precision, but large enough to keep the dual complex
  // geometrically non-degenerate at every physical scale in the gate.
  const inset = grid.cellSize * 1e-4;
  const boundsMin = worldPoint(grid, cell, [0, 0, 0]).map((value) => value + inset);
  const boundsMax = worldPoint(grid, cell, [1, 1, 1]).map((value) => value - inset);
  const solution = solveQef(qef, { boundsMax, boundsMin });
  const constrained = solution.position.some((value, axis) => (
    value <= boundsMin[axis] + inset * 0.5 || value >= boundsMax[axis] - inset * 0.5
  ));
  const position = constrained
    ? Array.from(solution.massPoint, (value, axis) => Math.min(Math.max(value, boundsMin[axis]), boundsMax[axis]))
    : solution.position;
  return {
    cell: [...cell],
    cellLevel: 0,
    cycleEdges: [...cycle],
    descendants: [index],
    edgeKeys: cycle.map((edge) => edgeKey(cell, edge)),
    index,
    key: `${cell.join(':')}|${cycle.join('.')}`,
    position,
    qef,
    qefError: constrained ? evaluateQef(qef, position) : solution.error,
    root: index,
  };
}

function vertexForCellEdge(cellEdgeVertex, grid, x, y, z, edge) {
  if (x < 0 || y < 0 || z < 0 || x >= grid.cellDims[0] || y >= grid.cellDims[1] || z >= grid.cellDims[2]) {
    return -1;
  }
  return cellEdgeVertex[gridCellIndex(grid, x, y, z) * 12 + edge];
}

function buildFineQuads(grid, cellEdgeVertex) {
  const [nx, ny, nz] = grid.cellDims;
  const [px, py] = grid.pointDims;
  const quads = [];
  const sample = (x, y, z) => grid.values[x + y * px + z * px * py];
  for (let z = 1; z < nz; z += 1) {
    for (let y = 1; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (!signChanges(sample(x, y, z), sample(x + 1, y, z))) continue;
        const vertices = [
          vertexForCellEdge(cellEdgeVertex, grid, x, y - 1, z - 1, 3),
          vertexForCellEdge(cellEdgeVertex, grid, x, y, z - 1, 2),
          vertexForCellEdge(cellEdgeVertex, grid, x, y, z, 0),
          vertexForCellEdge(cellEdgeVertex, grid, x, y - 1, z, 1),
        ];
        if (sample(x, y, z) >= 0) vertices.reverse();
        quads.push({
          axis: 0,
          anchorCell: [x, y - 1, z - 1],
          key: `0:${x}:${y}:${z}`,
          vertices,
        });
      }
    }
  }
  for (let z = 1; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 1; x < nx; x += 1) {
        if (!signChanges(sample(x, y, z), sample(x, y + 1, z))) continue;
        const vertices = [
          vertexForCellEdge(cellEdgeVertex, grid, x - 1, y, z - 1, 7),
          vertexForCellEdge(cellEdgeVertex, grid, x - 1, y, z, 5),
          vertexForCellEdge(cellEdgeVertex, grid, x, y, z, 4),
          vertexForCellEdge(cellEdgeVertex, grid, x, y, z - 1, 6),
        ];
        if (sample(x, y, z) >= 0) vertices.reverse();
        quads.push({
          axis: 1,
          anchorCell: [x - 1, y, z - 1],
          key: `1:${x}:${y}:${z}`,
          vertices,
        });
      }
    }
  }
  for (let z = 0; z < nz; z += 1) {
    for (let y = 1; y < ny; y += 1) {
      for (let x = 1; x < nx; x += 1) {
        if (!signChanges(sample(x, y, z), sample(x, y, z + 1))) continue;
        const vertices = [
          vertexForCellEdge(cellEdgeVertex, grid, x - 1, y - 1, z, 11),
          vertexForCellEdge(cellEdgeVertex, grid, x, y - 1, z, 10),
          vertexForCellEdge(cellEdgeVertex, grid, x, y, z, 8),
          vertexForCellEdge(cellEdgeVertex, grid, x - 1, y, z, 9),
        ];
        if (sample(x, y, z) >= 0) vertices.reverse();
        quads.push({
          axis: 2,
          anchorCell: [x - 1, y - 1, z],
          key: `2:${x}:${y}:${z}`,
          vertices,
        });
      }
    }
  }
  for (const quad of quads) {
    if (quad.vertices.some((vertex) => vertex < 0)) {
      throw new Error(`MDC sign edge ${quad.key} is missing one or more incident cell components.`);
    }
  }
  return quads;
}

function subdivideParallelDualEdges(vertices, quads, grid, evaluate) {
  const occurrences = new Map();
  quads.forEach((quad, quadIndex) => {
    for (let edge = 0; edge < quad.vertices.length; edge += 1) {
      const a = quad.vertices[edge];
      const b = quad.vertices[(edge + 1) % quad.vertices.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!occurrences.has(key)) occurrences.set(key, []);
      occurrences.get(key).push({ a, b, edge, quadIndex, sourceEdge: quad.key });
    }
  });
  const insertions = new Map();
  let splitEdges = 0;
  for (const entries of occurrences.values()) {
    if (entries.length <= 2) continue;
    const first = entries[0];
    const cellA = vertices[first.a].cell;
    const cellB = vertices[first.b].cell;
    const axis = [0, 1, 2].find((candidate) => Math.abs(cellA[candidate] - cellB[candidate]) === 1);
    if (axis === undefined) {
      throw new Error('MDC parallel dual edge does not cross one shared primal face.');
    }
    const lower = cellA[axis] < cellB[axis] ? cellA : cellB;
    const face = MDC_FACES.find((candidate) => candidate.axis === axis && candidate.side === 1);
    const cornerValues = new Float64Array(8);
    for (let corner = 0; corner < 8; corner += 1) {
      const offset = MDC_CORNER_OFFSETS[corner];
      cornerValues[corner] = grid.values[gridPointIndex(
        grid,
        lower[0] + offset[0],
        lower[1] + offset[1],
        lower[2] + offset[2],
      )];
    }
    for (const pair of faceConnections(cornerValues, lower, face)) {
      const sourceKeys = pair.map((edge) => edgeKey(lower, edge)).sort();
      const pairedOccurrences = entries.filter((entry) => sourceKeys.includes(entry.sourceEdge));
      if (pairedOccurrences.length !== 2) {
        throw new Error(
          `MDC could not pair ${entries.length} parallel face-edge occurrences (${sourceKeys.join(', ')}).`,
        );
      }
      const crossings = sourceKeys.map((key) => gridEdgeCrossing(grid, evaluate, key));
      const position = [0, 1, 2].map((coordinateAxis) => (
        crossings[0].point[coordinateAxis] + crossings[1].point[coordinateAxis]
      ) * 0.5);
      const qef = createQefAccumulator();
      crossings.forEach((crossing) => {
        if (crossing.normal) addQefPlane(qef, crossing.point, crossing.normal);
      });
      if (qef.count === 0) {
        const faceNormal = [0, 0, 0];
        faceNormal[axis] = 1;
        addQefPlane(qef, position, faceNormal);
      }
      const index = vertices.length;
      const splitKey = `edge-split:${axis}:${lower.join(':')}:${sourceKeys.join('+')}`;
      vertices.push({
        cell: [...lower],
        cellLevel: 0,
        cycleEdges: [],
        descendants: [index],
        edgeKeys: sourceKeys,
        index,
        key: splitKey,
        position,
        qef,
        qefError: evaluateQef(qef, position),
        root: index,
        synthetic: { axis, lower: [...lower], sourceKeys },
      });
      for (const occurrence of pairedOccurrences) {
        if (!insertions.has(occurrence.quadIndex)) insertions.set(occurrence.quadIndex, new Map());
        insertions.get(occurrence.quadIndex).set(occurrence.edge, index);
      }
      splitEdges += 1;
    }
  }
  if (splitEdges === 0) return { quads, splitEdges };
  const subdivided = quads.map((quad, quadIndex) => {
    const edgeInsertions = insertions.get(quadIndex);
    if (!edgeInsertions) return quad;
    const polygon = [];
    quad.vertices.forEach((vertex, edge) => {
      polygon.push(vertex);
      if (edgeInsertions.has(edge)) polygon.push(edgeInsertions.get(edge));
    });
    return { ...quad, vertices: polygon };
  });
  return { quads: subdivided, splitEdges };
}

function triangulateDualPolygon(quad, vertices, positions) {
  if (quad.vertices.length <= 4) return triangulatePolygon(quad.vertices, positions);
  const pivot = quad.vertices.findIndex((index) => vertices[index]?.synthetic);
  if (pivot < 0) return triangulatePolygon(quad.vertices, positions);
  // A polygon longer than four sides is a fine quad whose parallel abstract
  // edge was subdivided by one or more contour vertices. Fan triangulation
  // from an original dual vertex can recreate the forbidden unsplit chord.
  // Rotating the cyclic boundary to a synthetic contour vertex makes every
  // fan chord distinct from every original dual edge.
  const polygon = [
    ...quad.vertices.slice(pivot),
    ...quad.vertices.slice(0, pivot),
  ];
  const triangles = [];
  for (let index = 1; index + 1 < polygon.length; index += 1) {
    triangles.push(polygon[0], polygon[index], polygon[index + 1]);
  }
  return triangles;
}

function meshFromVerticesAndQuads(vertices, quads, evaluate, metadata) {
  const positions = new Float64Array(vertices.length * 3);
  vertices.forEach((vertex, index) => positions.set(vertex.position, index * 3));
  const triangles = [];
  for (const quad of quads) triangles.push(...triangulateDualPolygon(quad, vertices, positions));
  return {
    indices: new Uint32Array(triangles),
    metadata,
    positions,
  };
}

function stabilizeDualVertices(vertices, quads, evaluate, cellSize) {
  let fallbackVertices = 0;
  const alreadyFallback = new Set();
  for (let pass = 0; pass < 3; pass += 1) {
    const positions = new Float64Array(vertices.length * 3);
    vertices.forEach((vertex, index) => positions.set(vertex.position, index * 3));
    const fallback = new Set();
    for (const quad of quads) {
      const triangles = triangulateDualPolygon(quad, vertices, positions);
      for (let offset = 0; offset < triangles.length; offset += 3) {
        const [a, b, c] = triangles.slice(offset, offset + 3);
        const ab = [
          positions[b * 3] - positions[a * 3],
          positions[b * 3 + 1] - positions[a * 3 + 1],
          positions[b * 3 + 2] - positions[a * 3 + 2],
        ];
        const ac = [
          positions[c * 3] - positions[a * 3],
          positions[c * 3 + 1] - positions[a * 3 + 1],
          positions[c * 3 + 2] - positions[a * 3 + 2],
        ];
        const normal = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const center = [
          (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3,
          (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1]) / 3,
          (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3,
        ];
        const fieldNormal = gradient(evaluate, center, cellSize * 0.15);
        if (fieldNormal && normal[0] * fieldNormal[0] + normal[1] * fieldNormal[1] + normal[2] * fieldNormal[2] <= 0) {
          fallback.add(a);
          fallback.add(b);
          fallback.add(c);
        }
      }
    }
    if (fallback.size === 0) break;
    let changed = false;
    for (const index of fallback) {
      if (alreadyFallback.has(index)) continue;
      const vertex = vertices[index];
      vertex.position = Array.from(vertex.qef.massPoint, (value) => value / vertex.qef.count);
      vertex.qefError = evaluateQef(vertex.qef, vertex.position);
      alreadyFallback.add(index);
      fallbackVertices += 1;
      changed = true;
    }
    if (!changed) break;
  }
  return fallbackVertices;
}

export function extractManifoldDualContouring(grid, { evaluate } = {}) {
  assertScalarGrid(grid);
  if (typeof evaluate !== 'function') {
    throw new TypeError('Manifold Dual Contouring requires evaluate for Hermite gradients.');
  }
  const [nx, ny, nz] = grid.cellDims;
  const cellEdgeVertex = new Int32Array(nx * ny * nz * 12).fill(-1);
  const vertices = [];
  const cornerValues = new Float64Array(8);
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        let negative = 0;
        for (let corner = 0; corner < 8; corner += 1) {
          const offset = MDC_CORNER_OFFSETS[corner];
          const value = grid.values[gridPointIndex(grid, x + offset[0], y + offset[1], z + offset[2])];
          cornerValues[corner] = value;
          if (value < 0) negative += 1;
        }
        if (negative === 0 || negative === 8) continue;
        const cell = [x, y, z];
        const cycles = cellCycles(cornerValues, cell);
        for (const cycle of cycles) {
          const vertexIndex = vertices.length;
          const vertex = createCellVertex(grid, evaluate, cell, cycle, cornerValues, vertexIndex);
          vertices.push(vertex);
          for (const edge of cycle) {
            const address = gridCellIndex(grid, x, y, z) * 12 + edge;
            if (cellEdgeVertex[address] >= 0) {
              throw new Error(`MDC cell edge ${edge} in [${cell.join(', ')}] belongs to multiple cycles.`);
            }
            cellEdgeVertex[address] = vertexIndex;
          }
        }
      }
    }
  }
  const fineQuads = buildFineQuads(grid, cellEdgeVertex);
  const parallel = subdivideParallelDualEdges(vertices, fineQuads, grid, evaluate);
  const quads = parallel.quads;
  const geometricFallbackVertices = stabilizeDualVertices(vertices, quads, evaluate, grid.cellSize);
  const mesh = meshFromVerticesAndQuads(vertices, quads, evaluate, {
    algorithm: 'toonlab-manifold-dual-contouring-v1',
    cellSize: grid.cellSize,
    manifoldCriterion: 'uniform Hermite Dual MC boundary cycles; adaptive Euler/face criterion available separately',
    geometricFallbackVertices,
    qef: 'fixed-order symmetric eigensolver with bounded pseudoinverse',
    splitParallelDualEdges: parallel.splitEdges,
    topologyGuarantee: 'closed 2-manifold when the shared face-cycle contract is satisfied',
  });
  return {
    ...mesh,
    internal: {
      cellEdgeVertex,
      fineQuads: quads,
      fineVertices: vertices,
      grid,
    },
  };
}

function scalarSubgrid(grid, minCell, maxCell) {
  const cellDims = maxCell.map((value, axis) => value - minCell[axis]);
  const pointDims = cellDims.map((value) => value + 1);
  const values = new Float64Array(pointDims[0] * pointDims[1] * pointDims[2]);
  let write = 0;
  for (let z = 0; z < pointDims[2]; z += 1) {
    for (let y = 0; y < pointDims[1]; y += 1) {
      for (let x = 0; x < pointDims[0]; x += 1) {
        values[write++] = grid.values[gridPointIndex(
          grid,
          minCell[0] + x,
          minCell[1] + y,
          minCell[2] + z,
        )];
      }
    }
  }
  const origin = minCell.map((value, axis) => grid.origin[axis] + value * grid.cellSize);
  return {
    ...grid,
    bounds: {
      min: [...origin],
      max: maxCell.map((value, axis) => grid.origin[axis] + value * grid.cellSize),
      requestedMax: maxCell.map((value, axis) => grid.origin[axis] + value * grid.cellSize),
    },
    cellDims,
    cellOffset: [...minCell],
    globalOrigin: [...grid.origin],
    origin,
    pointCount: values.length,
    pointDims,
    sourceId: `${grid.sourceId}/chunk-${minCell.join('-')}`,
    values,
  };
}

/**
 * Extract deterministic chunks with a two-cell topology/geometry halo, then weld by
 * component key. Quads are owned by the chunk containing their anchor cell.
 * The returned proof compares the triangle multiset and IEEE-754 vertex bits
 * against monolithic extraction; it does not rely on visual seam inspection.
 */
export function extractManifoldDualContouringChunks(grid, {
  chunkCells = 8,
  evaluate,
  monolithic = null,
} = {}) {
  if (!Number.isInteger(chunkCells) || chunkCells < 2) {
    throw new RangeError('chunkCells must be an integer of at least 2.');
  }
  const full = monolithic ?? extractManifoldDualContouring(grid, { evaluate });
  const { fineQuads, fineVertices } = full.internal;
  const [nx, ny, nz] = grid.cellDims;
  const chunkCounts = [nx, ny, nz].map((count) => Math.ceil(count / chunkCells));
  const emittedQuads = [];
  const keyToVertex = new Map();
  const seamObservations = new Map();

  for (let cz = 0; cz < chunkCounts[2]; cz += 1) {
    for (let cy = 0; cy < chunkCounts[1]; cy += 1) {
      for (let cx = 0; cx < chunkCounts[0]; cx += 1) {
        const min = [cx * chunkCells, cy * chunkCells, cz * chunkCells];
        const max = [
          Math.min(min[0] + chunkCells, nx),
          Math.min(min[1] + chunkCells, ny),
          Math.min(min[2] + chunkCells, nz),
        ];
        const haloMin = min.map((value) => Math.max(0, value - 2));
        const haloMax = max.map((value, axis) => Math.min(grid.cellDims[axis], value + 2));
        const local = extractManifoldDualContouring(scalarSubgrid(grid, haloMin, haloMax), { evaluate });
        const localVertexKeys = new Array(local.internal.fineVertices.length);
        for (const vertex of local.internal.fineVertices) {
          const globalCell = vertex.cell.map((value, axis) => value + haloMin[axis]);
          const globalEdgeKeys = vertex.edgeKeys.map((key) => {
            const [axis, x, y, z] = key.split(':').map(Number);
            return `${axis}:${x + haloMin[0]}:${y + haloMin[1]}:${z + haloMin[2]}`;
          });
          const globalKey = vertex.synthetic
            ? `edge-split:${vertex.synthetic.axis}:${globalCell.join(':')}:${globalEdgeKeys.slice().sort().join('+')}`
            : `${globalCell.join(':')}|${vertex.cycleEdges.join('.')}`;
          localVertexKeys[vertex.index] = globalKey;
          // The outer halo exists only to give the inner stitch halo complete
          // geometric context. Do not compare or select vertices from that
          // intentionally incomplete outer ring.
          const inStitchHalo = globalCell.every((value, axis) => (
            value >= Math.max(0, min[axis] - 1)
            && value < Math.min(grid.cellDims[axis], max[axis] + 1)
          ));
          if (!inStitchHalo) continue;
          const globalVertex = {
            ...vertex,
            cell: globalCell,
            edgeKeys: globalEdgeKeys,
            key: globalKey,
            synthetic: vertex.synthetic ? {
              ...vertex.synthetic,
              lower: globalCell,
              sourceKeys: globalEdgeKeys,
            } : undefined,
          };
          const bitPattern = globalVertex.position.map((value) => {
            const bytes = Buffer.allocUnsafe(8);
            bytes.writeDoubleLE(value, 0);
            return bytes.toString('hex');
          }).join('');
          const previous = seamObservations.get(globalKey);
          if (previous && previous !== bitPattern) {
            throw new Error(`Chunk halo produced non-bit-compatible MDC vertex ${globalKey}.`);
          }
          seamObservations.set(globalKey, bitPattern);
          if (!keyToVertex.has(globalKey)) keyToVertex.set(globalKey, globalVertex);
        }
        for (const quad of local.internal.fineQuads) {
          const globalAnchor = quad.anchorCell.map((value, axis) => value + haloMin[axis]);
          if (!globalAnchor.every((value, axis) => value >= min[axis] && value < max[axis])) continue;
          const [axis, x, y, z] = quad.key.split(':').map(Number);
          emittedQuads.push({
            ...quad,
            anchorCell: globalAnchor,
            key: `${axis}:${x + haloMin[0]}:${y + haloMin[1]}:${z + haloMin[2]}`,
            vertexKeys: quad.vertices.map((vertex) => localVertexKeys[vertex]),
          });
        }
      }
    }
  }

  const sortedVertices = [...keyToVertex.values()].sort((a, b) => a.key.localeCompare(b.key));
  const keyToIndex = new Map();
  sortedVertices.forEach((vertex, index) => {
    vertex.index = index;
    vertex.root = index;
    keyToIndex.set(vertex.key, index);
  });
  const remappedQuads = emittedQuads.map((quad) => ({
    ...quad,
    vertices: quad.vertexKeys.map((key) => keyToIndex.get(key)),
  }));
  const chunked = meshFromVerticesAndQuads(sortedVertices, remappedQuads, evaluate, {
    ...full.metadata,
    chunkCells,
    chunkCounts,
    extraction: 'two-cell independently extracted halo with anchor-cell quad ownership and component-key weld',
  });
  assertMeshContract(chunked);

  const monolithicVertexBits = new Map(fineVertices.map((vertex) => [vertex.key, vertex.position.map((value) => {
    const bytes = Buffer.allocUnsafe(8);
    bytes.writeDoubleLE(value, 0);
    return bytes.toString('hex');
  }).join('')]));
  let vertexBitMismatches = 0;
  for (const [key, bits] of seamObservations) if (monolithicVertexBits.get(key) !== bits) vertexBitMismatches += 1;
  const monolithicTriangles = new Set();
  for (let offset = 0; offset < full.indices.length; offset += 3) {
    const keys = [full.indices[offset], full.indices[offset + 1], full.indices[offset + 2]]
      .map((vertex) => fineVertices[vertex].key);
    monolithicTriangles.add(keys.sort().join('|'));
  }
  const chunkTriangles = new Set();
  for (let offset = 0; offset < chunked.indices.length; offset += 3) {
    const keys = [chunked.indices[offset], chunked.indices[offset + 1], chunked.indices[offset + 2]]
      .map((vertex) => sortedVertices[vertex].key);
    chunkTriangles.add(keys.sort().join('|'));
  }
  const missingTriangles = [...monolithicTriangles].filter((key) => !chunkTriangles.has(key)).length;
  const extraTriangles = [...chunkTriangles].filter((key) => !monolithicTriangles.has(key)).length;
  return {
    ...chunked,
    internal: { fineQuads: remappedQuads, fineVertices: sortedVertices, grid },
    seamProof: {
      chunks: chunkCounts[0] * chunkCounts[1] * chunkCounts[2],
      extraTriangles,
      haloVertexObservations: seamObservations.size,
      missingTriangles,
      passed: vertexBitMismatches === 0 && missingTriangles === 0 && extraTriangles === 0,
      vertexBitMismatches,
    },
  };
}

function mappedPolygon(vertices, roots) {
  const mapped = [];
  for (const vertex of vertices) {
    const root = roots[vertex];
    if (mapped.at(-1) !== root) mapped.push(root);
  }
  if (mapped.length > 1 && mapped[0] === mapped.at(-1)) mapped.pop();
  return [...new Set(mapped)].length === mapped.length ? mapped : [...new Set(mapped)];
}

function surfacePatchEuler(descendants, quads) {
  const member = new Set(descendants);
  const patch = quads.filter((quad) => quad.vertices.some((vertex) => member.has(vertex)));
  const vertices = new Set();
  const edges = new Set();
  for (const quad of patch) {
    for (let i = 0; i < quad.vertices.length; i += 1) {
      const a = quad.vertices[i];
      const b = quad.vertices[(i + 1) % quad.vertices.length];
      vertices.add(a);
      vertices.add(b);
      edges.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
  }
  return { euler: vertices.size - edges.size + patch.length, faces: patch.length };
}

function edgeCoordinates(key) {
  const [axis, x, y, z] = key.split(':').map(Number);
  return { axis, coordinates: [x, y, z] };
}

function manifoldFaceCounts(edgeKeys, cellMin, cellSize) {
  const counts = new Int32Array(6);
  for (const key of new Set(edgeKeys)) {
    const { axis, coordinates } = edgeCoordinates(key);
    for (let faceAxis = 0; faceAxis < 3; faceAxis += 1) {
      if (axis === faceAxis) continue;
      for (let side = 0; side < 2; side += 1) {
        const plane = cellMin[faceAxis] + side * cellSize;
        if (coordinates[faceAxis] !== plane) continue;
        const otherAxis = [0, 1, 2].find((candidate) => candidate !== axis && candidate !== faceAxis);
        const onOtherBoundary = coordinates[otherAxis] === cellMin[otherAxis]
          || coordinates[otherAxis] === cellMin[otherAxis] + cellSize;
        const alongCellEdge = coordinates[axis] >= cellMin[axis]
          && coordinates[axis] < cellMin[axis] + cellSize;
        if (onOtherBoundary && alongCellEdge) counts[faceAxis * 2 + side] += 1;
      }
    }
  }
  return counts;
}

/**
 * Bottom-up topology-preserving MDC clustering from the 2007 paper. The
 * sufficient collapse criterion is Euler(Sv)=1 plus 0-or-2 intersections on
 * every parent-cell face. Geometry is rebuilt from the original fine quads.
 */
export function simplifyManifoldDualContouring(baseMesh, {
  evaluate,
  maxLevel = 2,
  qefErrorTolerance = 0.02,
} = {}) {
  assertMeshContract(baseMesh);
  const internal = baseMesh.internal;
  if (!internal?.fineVertices || !internal?.fineQuads || !internal?.grid) {
    throw new TypeError('Adaptive MDC requires a mesh returned by extractManifoldDualContouring.');
  }
  if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 8) {
    throw new RangeError('maxLevel must be an integer from 1 through 8.');
  }
  const fineVertices = internal.fineVertices;
  const quads = internal.fineQuads;
  const roots = Int32Array.from({ length: fineVertices.length }, (_, index) => index);
  const nodes = new Map(fineVertices.map((vertex) => [vertex.index, { ...vertex }]));
  let nextNode = fineVertices.length;
  let acceptedClusters = 0;
  let rejectedGeometry = 0;
  let rejectedTopology = 0;

  const rootOf = (vertex) => roots[vertex];
  for (let level = 1; level <= maxLevel; level += 1) {
    const parentSize = 2 ** level;
    const groups = new Map();
    for (const node of nodes.values()) {
      if (node.root !== node.index) continue;
      const parent = node.cell.map((value) => Math.floor(value / parentSize) * parentSize);
      const key = parent.join(':');
      if (!groups.has(key)) groups.set(key, { nodes: [], parent });
      groups.get(key).nodes.push(node);
    }
    for (const group of groups.values()) {
      if (group.nodes.length < 2) continue;
      const candidates = new Set(group.nodes.map((node) => node.index));
      const adjacency = new Map(group.nodes.map((node) => [node.index, new Set()]));
      for (const quad of quads) {
        const mapped = [...new Set(quad.vertices.map(rootOf))].filter((root) => candidates.has(root));
        for (let i = 0; i < mapped.length; i += 1) {
          for (let j = i + 1; j < mapped.length; j += 1) {
            adjacency.get(mapped[i]).add(mapped[j]);
            adjacency.get(mapped[j]).add(mapped[i]);
          }
        }
      }
      const seen = new Set();
      const components = [];
      for (const node of group.nodes) {
        if (seen.has(node.index)) continue;
        const stack = [node.index];
        const component = [];
        seen.add(node.index);
        while (stack.length > 0) {
          const current = stack.pop();
          component.push(nodes.get(current));
          for (const neighbor of adjacency.get(current)) {
            if (!seen.has(neighbor)) {
              seen.add(neighbor);
              stack.push(neighbor);
            }
          }
        }
        components.push(component);
      }
      for (const component of components) {
        if (component.length < 2) continue;
        // Synthetic contour vertices exist to represent parallel abstract
        // surface edges in an ordinary indexed mesh. Collapsing one would
        // erase that distinction and invalidate the manifold guarantee.
        if (component.some((node) => node.synthetic)) {
          rejectedTopology += 1;
          continue;
        }
        const descendants = component.flatMap((node) => node.descendants);
        const patch = surfacePatchEuler(descendants, quads);
        const edgeKeys = component.flatMap((node) => node.edgeKeys);
        const faceCounts = manifoldFaceCounts(edgeKeys, group.parent, parentSize);
        const topologySafe = patch.euler === 1 && [...faceCounts].every((count) => count === 0 || count === 2);
        if (!topologySafe) {
          rejectedTopology += 1;
          continue;
        }
        const qef = createQefAccumulator();
        component.forEach((node) => mergeQef(qef, node.qef));
        const boundsMin = group.parent.map((value, axis) => internal.grid.origin[axis] + value * internal.grid.cellSize);
        const boundsMax = group.parent.map((value, axis) => internal.grid.origin[axis]
          + Math.min(value + parentSize, internal.grid.cellDims[axis]) * internal.grid.cellSize);
        const solved = solveQef(qef, { boundsMax, boundsMin });
        const normalizedError = Math.sqrt(solved.error / Math.max(qef.count, 1)) / internal.grid.cellSize;
        if (normalizedError > qefErrorTolerance * parentSize) {
          rejectedGeometry += 1;
          continue;
        }
        const index = nextNode++;
        const clustered = {
          cell: [...group.parent],
          cellLevel: level,
          descendants,
          edgeKeys,
          index,
          key: `L${level}:${group.parent.join(':')}:${component.map((node) => node.key).sort().join('+')}`,
          position: solved.position,
          qef,
          qefError: solved.error,
          root: index,
        };
        nodes.set(index, clustered);
        for (const node of component) {
          node.root = index;
          for (const descendant of node.descendants) roots[descendant] = index;
        }
        acceptedClusters += 1;
      }
    }
  }

  const outputNodes = [...nodes.values()].filter((node) => node.root === node.index);
  outputNodes.sort((a, b) => a.key.localeCompare(b.key));
  const outputIndex = new Map(outputNodes.map((node, index) => [node.index, index]));
  const outputQuads = [];
  for (const quad of quads) {
    const polygon = mappedPolygon(quad.vertices, roots);
    if (polygon.length < 3) continue;
    outputQuads.push({
      ...quad,
      vertices: polygon.map((root) => outputIndex.get(root)),
    });
  }
  const geometricFallbackVertices = stabilizeDualVertices(
    outputNodes,
    outputQuads,
    evaluate,
    internal.grid.cellSize,
  );
  const mesh = compactMesh(meshFromVerticesAndQuads(outputNodes, outputQuads, evaluate, {
    ...baseMesh.metadata,
    acceptedClusters,
    adaptive: true,
    geometricFallbackVertices,
    maxLevel,
    qefErrorTolerance,
    rejectedGeometry,
    rejectedTopology,
    topologyCriterion: 'Schaefer-Ju-Warren 2007: Euler(Sv)=1 and 0-or-2 intersections per parent-cell face',
  }));
  return {
    ...mesh,
    adaptiveStats: {
      acceptedClusters,
      fineTriangles: baseMesh.indices.length / 3,
      fineVertices: fineVertices.length,
      reduction: 1 - mesh.indices.length / Math.max(baseMesh.indices.length, 1),
      rejectedGeometry,
      rejectedTopology,
    },
  };
}
