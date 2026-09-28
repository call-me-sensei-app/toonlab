function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Lightweight topology report for the experiment's deterministic QA. */
export function auditGeometry(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  if (!position || !index) throw new Error('Rock realism audit requires indexed geometry.');

  const parents = new Int32Array(position.count);
  for (let vertex = 0; vertex < parents.length; vertex += 1) parents[vertex] = vertex;
  const find = (vertex) => {
    let root = vertex;
    while (parents[root] !== root) root = parents[root];
    while (parents[vertex] !== root) {
      const next = parents[vertex];
      parents[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const join = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };

  const edges = new Map();
  let degenerateTriangles = 0;
  let nonFiniteVertices = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    if (![position.getX(vertex), position.getY(vertex), position.getZ(vertex)].every(Number.isFinite)) {
      nonFiniteVertices += 1;
    }
  }
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    join(a, b);
    join(a, c);
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(from, to);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const abx = position.getX(b) - position.getX(a);
    const aby = position.getY(b) - position.getY(a);
    const abz = position.getZ(b) - position.getZ(a);
    const acx = position.getX(c) - position.getX(a);
    const acy = position.getY(c) - position.getY(a);
    const acz = position.getZ(c) - position.getZ(a);
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) degenerateTriangles += 1;
  }

  const roots = new Set();
  for (let vertex = 0; vertex < position.count; vertex += 1) roots.add(find(vertex));
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges += 1;
    else if (count > 2) nonManifoldEdges += 1;
  }

  return {
    boundaryEdges,
    components: roots.size,
    degenerateTriangles,
    nonFiniteVertices,
    nonManifoldEdges,
    triangles: index.count / 3,
    vertices: position.count,
  };
}

