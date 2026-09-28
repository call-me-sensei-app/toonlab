import { assertMeshContract } from '../meshing/meshContract.node.js';

const CHART_AXES = Object.freeze([
  Object.freeze({ id: '+x', normal: [1, 0, 0], project: (p) => [-p[2], p[1]] }),
  Object.freeze({ id: '-x', normal: [-1, 0, 0], project: (p) => [p[2], p[1]] }),
  Object.freeze({ id: '+y', normal: [0, 1, 0], project: (p) => [p[0], -p[2]] }),
  Object.freeze({ id: '-y', normal: [0, -1, 0], project: (p) => [p[0], p[2]] }),
  Object.freeze({ id: '+z', normal: [0, 0, 1], project: (p) => [p[0], p[1]] }),
  Object.freeze({ id: '-z', normal: [0, 0, -1], project: (p) => [-p[0], p[1]] }),
]);

function positionAt(mesh, vertex) {
  return [mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]];
}

function faceChart(mesh, face) {
  const a = positionAt(mesh, mesh.indices[face * 3]);
  const b = positionAt(mesh, mesh.indices[face * 3 + 1]);
  const c = positionAt(mesh, mesh.indices[face * 3 + 2]);
  const ab = b.map((value, axis) => value - a[axis]);
  const ac = c.map((value, axis) => value - a[axis]);
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const axis = Math.abs(normal[0]) >= Math.abs(normal[1]) && Math.abs(normal[0]) >= Math.abs(normal[2])
    ? 0
    : Math.abs(normal[1]) >= Math.abs(normal[2]) ? 1 : 2;
  return axis * 2 + (normal[axis] >= 0 ? 0 : 1);
}

function connectedChartIslands(mesh, faceCharts) {
  const edgeFaces = new Map();
  const faceCount = mesh.indices.length / 3;
  for (let face = 0; face < faceCount; face += 1) {
    const triangle = [mesh.indices[face * 3], mesh.indices[face * 3 + 1], mesh.indices[face * 3 + 2]];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const faces = edgeFaces.get(key) ?? [];
      faces.push(face);
      edgeFaces.set(key, faces);
    }
  }
  const neighbors = Array.from({ length: faceCount }, () => []);
  for (const faces of edgeFaces.values()) {
    if (faces.length !== 2) continue;
    const [a, b] = faces;
    if (faceCharts[a] === faceCharts[b]) {
      neighbors[a].push(b);
      neighbors[b].push(a);
    }
  }
  const visited = new Uint8Array(faceCount);
  const islands = [];
  for (let start = 0; start < faceCount; start += 1) {
    if (visited[start]) continue;
    const faces = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const face = stack.pop();
      faces.push(face);
      for (const neighbor of neighbors[face]) {
        if (visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    islands.push({ axis: faceCharts[start], faces: faces.sort((a, b) => a - b) });
  }
  return islands;
}

function projectedBounds(mesh, island) {
  const project = CHART_AXES[island.axis].project;
  const vertices = new Set();
  for (const face of island.faces) {
    vertices.add(mesh.indices[face * 3]);
    vertices.add(mesh.indices[face * 3 + 1]);
    vertices.add(mesh.indices[face * 3 + 2]);
  }
  const projected = new Map();
  const minimum = [Infinity, Infinity];
  const maximum = [-Infinity, -Infinity];
  for (const vertex of vertices) {
    const uv = project(positionAt(mesh, vertex));
    projected.set(vertex, uv);
    for (let axis = 0; axis < 2; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], uv[axis]);
      maximum[axis] = Math.max(maximum[axis], uv[axis]);
    }
  }
  return {
    ...island,
    dimensions: maximum.map((value, axis) => Math.max(value - minimum[axis], 1e-8)),
    maximum,
    minimum,
    projected,
  };
}

function barycentric2(point, a, b, c) {
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denominator) < 1e-14) return null;
  const wa = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
  const wb = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
  const wc = 1 - wa - wb;
  return wa > 1e-7 && wb > 1e-7 && wc > 1e-7;
}

function orientation2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function properSegmentsCross(a, b, c, d, tolerance) {
  const abC = orientation2(a, b, c);
  const abD = orientation2(a, b, d);
  const cdA = orientation2(c, d, a);
  const cdB = orientation2(c, d, b);
  return abC * abD < -tolerance && cdA * cdB < -tolerance;
}

function triangleInteriorsOverlap(a, b, tolerance) {
  if (a.maximum[0] <= b.minimum[0] + tolerance || b.maximum[0] <= a.minimum[0] + tolerance
    || a.maximum[1] <= b.minimum[1] + tolerance || b.maximum[1] <= a.minimum[1] + tolerance) return false;
  if (a.points.some((point) => barycentric2(point, ...b.points))) return true;
  if (b.points.some((point) => barycentric2(point, ...a.points))) return true;
  for (let edgeA = 0; edgeA < 3; edgeA += 1) for (let edgeB = 0; edgeB < 3; edgeB += 1) {
    if (properSegmentsCross(
      a.points[edgeA], a.points[(edgeA + 1) % 3],
      b.points[edgeB], b.points[(edgeB + 1) % 3],
      tolerance * tolerance,
    )) return true;
  }
  return false;
}

function islandHasExactProjectionOverlap(mesh, island) {
  const tolerance = Math.max(...island.dimensions) * 1e-10;
  const triangles = island.faces.map((face) => {
    const points = [0, 1, 2].map((corner) => island.projected.get(mesh.indices[face * 3 + corner]));
    return {
      face,
      maximum: [Math.max(...points.map((point) => point[0])), Math.max(...points.map((point) => point[1]))],
      minimum: [Math.min(...points.map((point) => point[0])), Math.min(...points.map((point) => point[1]))],
      points,
    };
  }).sort((left, right) => left.minimum[0] - right.minimum[0] || left.face - right.face);
  for (let left = 0; left < triangles.length; left += 1) {
    for (let right = left + 1; right < triangles.length; right += 1) {
      if (triangles[right].minimum[0] >= triangles[left].maximum[0] - tolerance) break;
      if (triangleInteriorsOverlap(triangles[left], triangles[right], tolerance)) return true;
    }
  }
  return false;
}

function islandHasProjectionOverlap(mesh, island, resolution = 96) {
  if (island.faces.length < 2) return false;
  const owners = new Int32Array(resolution * resolution).fill(-1);
  const range = island.dimensions;
  for (const face of island.faces) {
    const uv = [0, 1, 2].map((corner) => {
      const source = mesh.indices[face * 3 + corner];
      const point = island.projected.get(source);
      return [
        (point[0] - island.minimum[0]) / range[0] * (resolution - 1),
        (point[1] - island.minimum[1]) / range[1] * (resolution - 1),
      ];
    });
    const minX = Math.max(0, Math.floor(Math.min(...uv.map((point) => point[0]))));
    const maxX = Math.min(resolution - 1, Math.ceil(Math.max(...uv.map((point) => point[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...uv.map((point) => point[1]))));
    const maxY = Math.min(resolution - 1, Math.ceil(Math.max(...uv.map((point) => point[1]))));
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (!barycentric2([x + 0.5, y + 0.5], uv[0], uv[1], uv[2])) continue;
      const texel = x + y * resolution;
      if (owners[texel] >= 0 && owners[texel] !== face) return true;
      owners[texel] = face;
    }
  }
  // The coarse occupancy pass is fast, but it can miss a fold whose overlap is
  // narrower than one diagnostic texel. Exact projected-triangle tests close
  // that gap so a higher-resolution production bake cannot reveal a latent
  // chart collision that was invisible during unwrap.
  return islandHasExactProjectionOverlap(mesh, island);
}

function splitOverlappingIsland(mesh, island, depth = 0) {
  const bounded = projectedBounds(mesh, island);
  if (!islandHasProjectionOverlap(mesh, bounded) || island.faces.length === 1) return [bounded];
  if (depth >= 12 || island.faces.length <= 3) {
    return island.faces.map((face) => projectedBounds(mesh, { axis: island.axis, faces: [face] }));
  }
  const splitAxis = bounded.dimensions[0] >= bounded.dimensions[1] ? 0 : 1;
  const ordered = [...island.faces].sort((left, right) => {
    const center = (face) => [0, 1, 2].reduce((total, corner) => {
      const uv = bounded.projected.get(mesh.indices[face * 3 + corner]);
      return total + uv[splitAxis] / 3;
    }, 0);
    return center(left) - center(right) || left - right;
  });
  const middle = Math.ceil(ordered.length / 2);
  return [ordered.slice(0, middle), ordered.slice(middle)]
    .filter((faces) => faces.length)
    .flatMap((faces) => splitOverlappingIsland(mesh, { axis: island.axis, faces }, depth + 1));
}

function packIslands(islands, resolution, gutter) {
  const available = resolution - gutter * 2;
  const totalArea = islands.reduce((sum, island) => sum + island.dimensions[0] * island.dimensions[1], 0);
  let pixelsPerMetre = Math.sqrt(available * available * 0.68 / Math.max(totalArea, 1e-12));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const entries = islands.map((island, index) => ({
      height: Math.max(2, Math.ceil(island.dimensions[1] * pixelsPerMetre)) + gutter * 2,
      index,
      island,
      width: Math.max(2, Math.ceil(island.dimensions[0] * pixelsPerMetre)) + gutter * 2,
    })).sort((a, b) => b.height - a.height || b.width - a.width || a.index - b.index);
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let failed = false;
    for (const entry of entries) {
      if (entry.width > resolution || entry.height > resolution) {
        failed = true;
        break;
      }
      if (x + entry.width > resolution) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      if (y + entry.height > resolution) {
        failed = true;
        break;
      }
      entry.x = x;
      entry.y = y;
      x += entry.width;
      rowHeight = Math.max(rowHeight, entry.height);
    }
    if (!failed) return { entries, pixelsPerMetre };
    pixelsPerMetre *= 0.88;
  }
  throw new Error(`Unable to pack ${islands.length} UV islands into ${resolution}px atlas.`);
}

function computeTangents(positions, normals, uvs, indices) {
  const tan1 = new Float64Array(positions.length);
  const tan2 = new Float64Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const [a, b, c] = [indices[face], indices[face + 1], indices[face + 2]];
    const p = [a, b, c].map((vertex) => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]]);
    const w = [a, b, c].map((vertex) => [uvs[vertex * 2], uvs[vertex * 2 + 1]]);
    const x1 = p[1][0] - p[0][0]; const x2 = p[2][0] - p[0][0];
    const y1 = p[1][1] - p[0][1]; const y2 = p[2][1] - p[0][1];
    const z1 = p[1][2] - p[0][2]; const z2 = p[2][2] - p[0][2];
    const s1 = w[1][0] - w[0][0]; const s2 = w[2][0] - w[0][0];
    const t1 = w[1][1] - w[0][1]; const t2 = w[2][1] - w[0][1];
    const denominator = s1 * t2 - s2 * t1;
    if (Math.abs(denominator) < 1e-15) continue;
    const r = 1 / denominator;
    const sdir = [(t2 * x1 - t1 * x2) * r, (t2 * y1 - t1 * y2) * r, (t2 * z1 - t1 * z2) * r];
    const tdir = [(s1 * x2 - s2 * x1) * r, (s1 * y2 - s2 * y1) * r, (s1 * z2 - s2 * z1) * r];
    for (const vertex of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) {
      tan1[vertex * 3 + axis] += sdir[axis];
      tan2[vertex * 3 + axis] += tdir[axis];
    }
  }
  const tangents = new Float32Array((positions.length / 3) * 4);
  let finiteTangents = true;
  let maximumOrthogonalityError = 0;
  let maximumUnitLengthError = 0;
  let zeroLengthTangents = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const sourceNormal = [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]];
    const normalLength = Math.hypot(...sourceNormal);
    const n = normalLength > 1e-12 ? sourceNormal.map((value) => value / normalLength) : [0, 1, 0];
    const source = [tan1[vertex * 3], tan1[vertex * 3 + 1], tan1[vertex * 3 + 2]];
    const dot = n[0] * source[0] + n[1] * source[1] + n[2] * source[2];
    let t = source.map((value, axis) => value - n[axis] * dot);
    const length = Math.hypot(...t);
    if (length > 1e-12) t = t.map((value) => value / length);
    else {
      const reference = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      t = [
        reference[1] * n[2] - reference[2] * n[1],
        reference[2] * n[0] - reference[0] * n[2],
        reference[0] * n[1] - reference[1] * n[0],
      ];
      const fallbackLength = Math.hypot(...t);
      t = t.map((value) => value / fallbackLength);
    }
    const cross = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
    const b = [tan2[vertex * 3], tan2[vertex * 3 + 1], tan2[vertex * 3 + 2]];
    const handedness = cross[0] * b[0] + cross[1] * b[1] + cross[2] * b[2] < 0 ? -1 : 1;
    tangents.set([...t, handedness], vertex * 4);
    const stored = [tangents[vertex * 4], tangents[vertex * 4 + 1], tangents[vertex * 4 + 2]];
    const storedLength = Math.hypot(...stored);
    finiteTangents = finiteTangents && stored.every(Number.isFinite) && Number.isFinite(tangents[vertex * 4 + 3]);
    zeroLengthTangents += Number(storedLength <= 1e-8);
    maximumUnitLengthError = Math.max(maximumUnitLengthError, Math.abs(1 - storedLength));
    maximumOrthogonalityError = Math.max(maximumOrthogonalityError, Math.abs(n[0] * stored[0] + n[1] * stored[1] + n[2] * stored[2]));
  }
  return { finiteTangents, maximumOrthogonalityError, maximumUnitLengthError, tangents, zeroLengthTangents };
}

/** Deterministic connected planar charting with overlap-triggered subdivision. */
export function unwrapRockMesh(mesh, { atlasResolution = 512, gutterTexels = 8 } = {}) {
  assertMeshContract(mesh);
  if (!mesh.normals || mesh.normals.length !== mesh.positions.length) {
    throw new Error('Rock unwrap requires one finite normal per source vertex.');
  }
  const faceCount = mesh.indices.length / 3;
  const faceCharts = Uint8Array.from({ length: faceCount }, (_, face) => faceChart(mesh, face));
  const initial = connectedChartIslands(mesh, faceCharts);
  const islands = initial.flatMap((island) => splitOverlappingIsland(mesh, island));
  const packed = packIslands(islands, atlasResolution, gutterTexels);
  const positions = [];
  const normals = [];
  const uvs = [];
  const sourceVertices = [];
  const indices = new Uint32Array(mesh.indices.length);
  const triangleIslands = new Uint32Array(faceCount);
  const faceToEntry = new Map();
  packed.entries.forEach((entry, packedIndex) => {
    entry.packedIndex = packedIndex;
    for (const face of entry.island.faces) faceToEntry.set(face, entry);
  });
  const remap = new Map();
  for (let face = 0; face < faceCount; face += 1) {
    const entry = faceToEntry.get(face);
    triangleIslands[face] = entry.packedIndex;
    for (let corner = 0; corner < 3; corner += 1) {
      const source = mesh.indices[face * 3 + corner];
      const key = `${source}:${entry.packedIndex}`;
      let target = remap.get(key);
      if (target === undefined) {
        target = positions.length / 3;
        remap.set(key, target);
        positions.push(mesh.positions[source * 3], mesh.positions[source * 3 + 1], mesh.positions[source * 3 + 2]);
        normals.push(mesh.normals[source * 3], mesh.normals[source * 3 + 1], mesh.normals[source * 3 + 2]);
        sourceVertices.push(source);
        const projected = entry.island.projected.get(source);
        const localU = (projected[0] - entry.island.minimum[0]) / entry.island.dimensions[0];
        const localV = (projected[1] - entry.island.minimum[1]) / entry.island.dimensions[1];
        const innerWidth = entry.width - gutterTexels * 2;
        const innerHeight = entry.height - gutterTexels * 2;
        uvs.push(
          (entry.x + gutterTexels + localU * innerWidth) / atlasResolution,
          1 - (entry.y + gutterTexels + localV * innerHeight) / atlasResolution,
        );
      }
      indices[face * 3 + corner] = target;
    }
  }
  const positionArray = new Float64Array(positions);
  const normalArray = new Float32Array(normals);
  const uvArray = new Float32Array(uvs);
  const tangent = computeTangents(positionArray, normalArray, uvArray, indices);
  return {
    atlasResolution,
    gutterTexels,
    initialIslandCount: initial.length,
    mesh: {
      indices,
      metadata: { ...mesh.metadata, uvPolicy: 'connected signed-axis charts with overlap subdivision' },
      normals: normalArray,
      positions: positionArray,
      tangents: tangent.tangents,
      uvs: uvArray,
    },
    packedIslandCount: islands.length,
    packingPixelsPerMetre: packed.pixelsPerMetre,
    sourceVertices: new Uint32Array(sourceVertices),
    tangentAudit: {
      convention: 'MikkTSpace-compatible tangent frame; +Y/OpenGL normal map',
      finiteTangents: tangent.finiteTangents,
      maximumOrthogonalityError: tangent.maximumOrthogonalityError,
      maximumUnitLengthError: tangent.maximumUnitLengthError,
      zeroLengthTangents: tangent.zeroLengthTangents,
    },
    triangleIslands,
  };
}
