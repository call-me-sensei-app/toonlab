// Repository-only compiler QA helpers. Kept separate from the public rockgen
// surface until the baked-asset contract is qualified.

function edgeKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function auditIndexedMesh(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  if (!position || !index) throw new Error('Baked-rock audit requires indexed geometry.');

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

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges += 1;
    else if (count > 2) nonManifoldEdges += 1;
  }
  const roots = new Set();
  for (let vertex = 0; vertex < position.count; vertex += 1) roots.add(find(vertex));

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const dimensions = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ];
  return {
    boundaryEdges,
    components: roots.size,
    degenerateTriangles,
    dimensions,
    nonFiniteVertices,
    nonManifoldEdges,
    triangles: index.count / 3,
    vertices: position.count,
  };
}

export function evaluateBoulderFamilyGate(audit) {
  const [width, height, depth] = audit.dimensions;
  const horizontalAspect = Math.max(width, depth) / Math.max(Math.min(width, depth), 1e-6);
  const massAspect = Math.max(width, depth) / Math.max(height, 1e-6);
  const failures = [];
  if (audit.components !== 1) failures.push('surface must contain one connected component');
  if (audit.boundaryEdges !== 0) failures.push('surface must be closed');
  if (audit.degenerateTriangles !== 0) failures.push('surface contains degenerate triangles');
  if (audit.nonFiniteVertices !== 0) failures.push('surface contains non-finite vertices');
  if (audit.nonManifoldEdges !== 0) failures.push('surface contains non-manifold edges');
  if (audit.triangles < 2_000 || audit.triangles > 20_000) {
    failures.push('LOD0 triangle count is outside the 2k–20k family budget');
  }
  if (horizontalAspect > 1.65) failures.push('horizontal silhouette is too elongated for a boulder');
  if (massAspect < 1.12 || massAspect > 2.6) failures.push('height-to-mass ratio is outside the boulder family');
  if (Math.min(...audit.dimensions) < 1 || Math.max(...audit.dimensions) > 3.6) {
    failures.push('dimensions are outside the authored 1–3.6 metre family range');
  }
  return {
    accepted: failures.length === 0,
    failures,
    horizontalAspect,
    massAspect,
  };
}

export function evaluateGenericRockGate(audit) {
  const failures = [];
  if (audit.components !== 1) failures.push('surface must contain one connected component');
  if (audit.boundaryEdges !== 0) failures.push('surface must be closed');
  if (audit.degenerateTriangles !== 0) failures.push('surface contains degenerate triangles');
  if (audit.nonFiniteVertices !== 0) failures.push('surface contains non-finite vertices');
  if (audit.nonManifoldEdges !== 0) failures.push('surface contains non-manifold edges');
  if (audit.triangles < 250 || audit.triangles > 120_000) {
    failures.push('triangle count is outside the research compiler budget');
  }
  if (Math.min(...audit.dimensions) <= 0 || Math.max(...audit.dimensions) > 160) {
    failures.push('compiled dimensions are empty or outside the 160 metre research bound');
  }
  return { accepted: failures.length === 0, failures };
}
