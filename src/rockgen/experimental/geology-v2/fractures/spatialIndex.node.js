import { canonicalizeJson } from '../canonical.node.js';

function mergeBounds(items) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const item of items) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], item.bounds.minimum[axis]);
      maximum[axis] = Math.max(maximum[axis], item.bounds.maximum[axis]);
    }
  }
  return { maximum, minimum };
}

function overlaps(left, right) {
  return left.minimum.every((value, axis) => value <= right.maximum[axis]
    && left.maximum[axis] >= right.minimum[axis]);
}

export function buildFlatSpatialIndex(items, options = {}) {
  const leafSize = options.leafSize ?? 8;
  if (!Number.isInteger(leafSize) || leafSize < 1 || leafSize > 64) {
    throw new RangeError('Spatial-index leafSize must be an integer from 1 through 64.');
  }
  const normalized = items.map((item) => ({ id: item.id, bounds: item.bounds }));
  const nodes = [];

  function build(subset) {
    const nodeIndex = nodes.length;
    nodes.push(null);
    const bounds = mergeBounds(subset);
    if (subset.length <= leafSize) {
      nodes[nodeIndex] = {
        bounds,
        itemIds: subset.map((item) => item.id).sort(),
        left: null,
        right: null,
      };
      return nodeIndex;
    }
    const extents = bounds.maximum.map((value, axis) => value - bounds.minimum[axis]);
    const axis = extents.indexOf(Math.max(...extents));
    subset.sort((left, right) => {
      const leftCenter = (left.bounds.minimum[axis] + left.bounds.maximum[axis]) * 0.5;
      const rightCenter = (right.bounds.minimum[axis] + right.bounds.maximum[axis]) * 0.5;
      return leftCenter - rightCenter || left.id.localeCompare(right.id);
    });
    const middle = Math.floor(subset.length * 0.5);
    const left = build(subset.slice(0, middle));
    const right = build(subset.slice(middle));
    nodes[nodeIndex] = { bounds, itemIds: [], left, right };
    return nodeIndex;
  }

  const root = normalized.length > 0 ? build(normalized) : null;
  return canonicalizeJson({
    schema: 'toonlab/rock-flat-spatial-index',
    version: 1,
    leafSize,
    nodes,
    root,
  });
}

export function querySpatialIndex(index, bounds) {
  if (index.root === null) return [];
  const result = [];
  const stack = [index.root];
  while (stack.length > 0) {
    const node = index.nodes[stack.pop()];
    if (!overlaps(node.bounds, bounds)) continue;
    if (node.left === null) result.push(...node.itemIds);
    else {
      stack.push(node.right);
      stack.push(node.left);
    }
  }
  return result.sort();
}

export function pointQueryBounds(point, padding = 0) {
  return {
    maximum: point.map((value) => value + padding),
    minimum: point.map((value) => value - padding),
  };
}

export function segmentQueryBounds(start, end, padding = 0) {
  return {
    maximum: start.map((value, axis) => Math.max(value, end[axis]) + padding),
    minimum: start.map((value, axis) => Math.min(value, end[axis]) - padding),
  };
}
