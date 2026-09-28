// Cost-field routing for path networks. Pure math — no THREE imports — so
// the router is trivially testable and runs anywhere (workers, Node).
//
// The whole contract is `heightAt(x, z)` + `waterLevel`: slope is expensive,
// water is very expensive (but crossable, which is exactly where bridges
// appear), and cells an earlier route already uses are discounted so later
// routes fork off the existing network instead of cutting parallel tracks.

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Binary min-heap keyed on `score` — A*'s open set. Plain arrays beat
// fancier structures at the few-thousand-node sizes a routing grid hits.
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, score) {
    const items = this.items;
    items.push({ node, score });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].score <= items[index].score) break;
      [items[parent], items[index]] = [items[index], items[parent]];
      index = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left].score < items[smallest].score) smallest = left;
        if (right < items.length && items[right].score < items[smallest].score) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index], items[smallest]];
        index = smallest;
      }
    }
    return top?.node;
  }
}

/**
 * Builds the routing grid: per-cell height, wetness, and a `used` layer the
 * router marks as routes land (feeding the reuse discount).
 */
export function createRoutingGrid({
  heightAt,
  waterLevel = 0,
  size = { x: 1000, z: 1000 },
  gridStep = 8,
  shoreMargin = 0.6,
} = {}) {
  const width = Number(size?.width ?? size?.x ?? size) || 1000;
  const depth = Number(size?.depth ?? size?.z ?? size) || 1000;
  const step = Math.max(Number(gridStep) || 8, 2);
  const cols = Math.max(Math.round(width / step) + 1, 4);
  const rows = Math.max(Math.round(depth / step) + 1, 4);
  const originX = -width / 2;
  const originZ = -depth / 2;
  const sample = typeof heightAt === 'function' ? heightAt : () => 0;

  const heights = new Float32Array(cols * rows);
  const wet = new Uint8Array(cols * rows);
  const used = new Uint8Array(cols * rows);
  const threshold = waterLevel + shoreMargin;
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const index = iz * cols + ix;
      const y = Number(sample(originX + ix * step, originZ + iz * step)) || 0;
      heights[index] = y;
      wet[index] = y <= threshold ? 1 : 0;
    }
  }

  return {
    cols,
    rows,
    step,
    originX,
    originZ,
    heights,
    wet,
    used,
    waterLevel,
    indexOf: (ix, iz) => iz * cols + ix,
    worldOf: (ix, iz) => ({ x: originX + ix * step, z: originZ + iz * step }),
    cellOf: (x, z) => ({
      ix: Math.min(cols - 1, Math.max(0, Math.round((x - originX) / step))),
      iz: Math.min(rows - 1, Math.max(0, Math.round((z - originZ) / step))),
    }),
  };
}

const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* over the routing grid. Returns grid-cell waypoints (world coordinates)
 * or null when no route exists. Slope enters quadratically — a 2x steeper
 * climb hurts 4x — which is what bends routes into contour-hugging arcs and
 * switchbacks instead of straight assaults.
 */
export function routeBetween(grid, from, to, {
  slopeCost = 26,
  waterCost = 14,
  reuseBonus = 0.45,
} = {}) {
  const start = grid.cellOf(from.x ?? from[0], from.z ?? from[1]);
  const goal = grid.cellOf(to.x ?? to[0], to.z ?? to[1]);
  const startIndex = grid.indexOf(start.ix, start.iz);
  const goalIndex = grid.indexOf(goal.ix, goal.iz);
  if (startIndex === goalIndex) return null;

  const { cols, rows, step, heights, wet, used } = grid;
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  gScore[startIndex] = 0;

  const heuristic = (ix, iz) => {
    const dx = Math.abs(ix - goal.ix);
    const dz = Math.abs(iz - goal.iz);
    // Octile distance in meters — admissible because flat dry reused ground
    // can never cost less than distance * (1 - reuseBonus).
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * step * (1 - reuseBonus);
  };

  const open = new MinHeap();
  open.push(startIndex, heuristic(start.ix, start.iz));

  const reuse = Math.min(Math.max(reuseBonus, 0), 0.9);
  let found = false;
  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIndex) { found = true; break; }
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % cols;
    const cz = (current / cols) | 0;
    for (const [dx, dz, factor] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const next = nz * cols + nx;
      if (closed[next]) continue;
      const run = factor * step;
      const rise = Math.abs(heights[next] - heights[current]);
      const slope = rise / run;
      let cost = run * (1 + slopeCost * slope * slope);
      if (wet[next]) cost *= Math.max(waterCost, 1);
      if (used[next]) cost *= (1 - reuse);
      const tentative = gScore[current] + cost;
      if (tentative >= gScore[next]) continue;
      gScore[next] = tentative;
      cameFrom[next] = current;
      open.push(next, tentative + heuristic(nx, nz));
    }
  }
  if (!found) return null;

  const cells = [];
  for (let index = goalIndex; index !== -1; index = cameFrom[index]) {
    cells.push(index);
    if (index === startIndex) break;
  }
  cells.reverse();
  return cells.map((index) => {
    const ix = index % cols;
    const iz = (index / cols) | 0;
    const { x, z } = grid.worldOf(ix, iz);
    return { x, z, wet: wet[index] === 1 };
  });
}

/** Marks a routed polyline into the grid's `used` layer (reuse discount). */
export function markRouteUsed(grid, waypoints, radiusCells = 1) {
  for (const point of waypoints) {
    const { ix, iz } = grid.cellOf(point.x, point.z);
    for (let dz = -radiusCells; dz <= radiusCells; dz += 1) {
      for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= grid.cols || nz >= grid.rows) continue;
        grid.used[grid.indexOf(nx, nz)] = 1;
      }
    }
  }
}

/** Drops collinear middle points, then Chaikin-smooths the polyline. */
export function smoothWaypoints(waypoints, { iterations = 2 } = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 3) return waypoints ?? [];
  let points = waypoints.filter((point, index) => {
    if (index === 0 || index === waypoints.length - 1) return true;
    const prev = waypoints[index - 1];
    const next = waypoints[index + 1];
    const cross = (point.x - prev.x) * (next.z - prev.z) - (point.z - prev.z) * (next.x - prev.x);
    return Math.abs(cross) > 1e-6;
  });
  for (let pass = 0; pass < iterations; pass += 1) {
    const smoothed = [points[0]];
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      smoothed.push(
        { x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 },
      );
    }
    smoothed.push(points[points.length - 1]);
    points = smoothed;
  }
  return points;
}

/**
 * Low-frequency perpendicular wander over a smoothed polyline — the
 * hand-drawn read. Routed corridors are already safe, and the amplitude is
 * around a meter, so the wander never leaves them.
 */
export function addCenterlineWander(points, { seed = 1, amplitude = 1.4, wavelength = 26 } = {}) {
  if (!Array.isArray(points) || points.length < 3 || amplitude <= 0) return points ?? [];
  const random = mulberry32(seed * 69069 + 5);
  const phase = random() * 100;
  let s = 0;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const point = points[index];
    const next = points[index + 1];
    s += Math.hypot(point.x - prev.x, point.z - prev.z);
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const invLen = 1 / Math.max(Math.hypot(tx, tz), 1e-6);
    // two octaves of sine wander with seeded phases — cheap, smooth, tileable
    const w = Math.sin((s / wavelength + phase) * Math.PI * 2) * 0.7
      + Math.sin((s / (wavelength * 0.37) + phase * 1.7) * Math.PI * 2) * 0.3;
    result.push({
      x: point.x + (-tz * invLen) * w * amplitude,
      z: point.z + (tx * invLen) * w * amplitude,
    });
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Auto mode: probes `count` walkable, mutually distant points of interest.
 * Deterministic per seed. POIs prefer locally flat, dry, open ground with a
 * mild affinity for shorelines — the same instinct a settlement has (and
 * shoreline destinations are what make routes earn their bridges).
 */
export function pickPointsOfInterest({
  heightAt,
  waterLevel = 0,
  size = { x: 1000, z: 1000 },
  count = 4,
  seed = 1,
  shoreMargin = 0.6,
  margin = 0.12,
} = {}) {
  const width = Number(size?.width ?? size?.x ?? size) || 1000;
  const depth = Number(size?.depth ?? size?.z ?? size) || 1000;
  const random = mulberry32(seed * 2654435761 + 97);
  const sample = typeof heightAt === 'function' ? heightAt : () => 0;
  const innerX = width * (0.5 - margin);
  const innerZ = depth * (0.5 - margin);

  const flatness = (x, z) => {
    const step = 4;
    const center = sample(x, z);
    let deviation = 0;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      deviation += Math.abs(sample(x + dx, z + dz) - center);
    }
    return deviation / (4 * step);
  };

  const nearShore = (x, z) => {
    for (let probe = 0; probe < 8; probe += 1) {
      const angle = (probe / 8) * Math.PI * 2;
      if (sample(x + Math.cos(angle) * 26, z + Math.sin(angle) * 26) <= waterLevel) return true;
    }
    return false;
  };

  const candidates = [];
  const attempts = Math.max(count * 60, 240);
  for (let attempt = 0; attempt < attempts && candidates.length < count * 24; attempt += 1) {
    const x = (random() * 2 - 1) * innerX;
    const z = (random() * 2 - 1) * innerZ;
    const y = sample(x, z);
    if (y <= waterLevel + shoreMargin + 0.4) continue;
    const slope = flatness(x, z);
    if (slope > 0.45) continue;
    const score = (1 / (0.08 + slope)) * (nearShore(x, z) ? 1.5 : 1);
    candidates.push({ score, x, y, z });
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => b.score - a.score);

  // Greedy max-min-distance pick from the best half — spread beats score.
  const pool = candidates.slice(0, Math.max(count * 8, 16));
  const picked = [pool[0]];
  while (picked.length < count && pool.length > picked.length) {
    let best = null;
    let bestDistance = -1;
    for (const candidate of pool) {
      if (picked.includes(candidate)) continue;
      let nearest = Infinity;
      for (const point of picked) {
        nearest = Math.min(nearest, Math.hypot(candidate.x - point.x, candidate.z - point.z));
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
    }
    if (!best) break;
    picked.push(best);
  }
  return picked.map(({ x, y, z }) => ({ x, y, z }));
}

/**
 * Connects points into route pairs: a minimum spanning tree (every POI
 * reachable, no redundant parallel roads) plus, per `loopChance`, one ring
 * edge so the network isn't always a tree.
 */
export function connectPointsOfInterest(points, { seed = 1, loopChance = 0.35 } = {}) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const random = mulberry32(seed * 1103515245 + 12345);
  const edges = [];
  const inTree = new Set([0]);
  while (inTree.size < points.length) {
    let best = null;
    for (const from of inTree) {
      for (let to = 0; to < points.length; to += 1) {
        if (inTree.has(to)) continue;
        const distance = Math.hypot(points[from].x - points[to].x, points[from].z - points[to].z);
        if (!best || distance < best.distance) best = { distance, from, to };
      }
    }
    if (!best) break;
    edges.push([best.from, best.to]);
    inTree.add(best.to);
  }
  if (points.length > 2 && random() < loopChance) {
    // Close the longest open pair that isn't already an edge.
    const has = new Set(edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    let far = null;
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        if (has.has(`${a}-${b}`)) continue;
        const distance = Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z);
        if (!far || distance > far.distance) far = { a, b, distance };
      }
    }
    if (far) edges.push([far.a, far.b]);
  }
  return edges;
}
