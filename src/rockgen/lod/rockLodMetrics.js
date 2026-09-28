// Geometry metrics used by the LOD planner and verifier. Silhouette scores
// rasterize projected triangles (not just vertices), so comparisons remain
// meaningful when independent Surface Nets resolutions have different vertex
// layouts.

const PROJECTIONS = Object.freeze([
  Object.freeze({ axes: [0, 1], id: 'xy' }),
  Object.freeze({ axes: [0, 2], id: 'xz' }),
  Object.freeze({ axes: [2, 1], id: 'zy' }),
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getGeometryTriangleCount(geometry) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return 0;
  return Math.floor((geometry.index?.count ?? position.count) / 3);
}

export function getGeometryBounds(geometry) {
  if (!geometry?.getAttribute?.('position')) {
    throw new TypeError('A BufferGeometry with a position attribute is required.');
  }
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const { max, min } = geometry.boundingBox;
  const minimum = [min.x, min.y, min.z];
  const maximum = [max.x, max.y, max.z];
  const size = maximum.map((value, axis) => value - minimum[axis]);
  const center = maximum.map((value, axis) => (value + minimum[axis]) * 0.5);
  const diagonal = Math.hypot(...size);
  return { center, diagonal, max: maximum, min: minimum, size };
}

export function compareGeometryBounds(referenceGeometry, candidateGeometry) {
  const reference = getGeometryBounds(referenceGeometry);
  const candidate = getGeometryBounds(candidateGeometry);
  const relativeSizeError = reference.size.map((size, axis) => (
    Math.abs(candidate.size[axis] - size) / Math.max(Math.abs(size), 1e-6)
  ));
  const centerDistance = Math.hypot(
    candidate.center[0] - reference.center[0],
    candidate.center[1] - reference.center[1],
    candidate.center[2] - reference.center[2],
  );
  return {
    candidate,
    centerDrift: centerDistance / Math.max(reference.diagonal, 1e-6),
    maxSizeError: Math.max(...relativeSizeError),
    reference,
    relativeSizeError,
  };
}

function coordinate(position, vertexIndex, axis) {
  return position.array[vertexIndex * position.itemSize + axis];
}

function markLine(mask, gridSize, ax, ay, bx, by) {
  const steps = Math.max(Math.ceil(Math.abs(bx - ax)), Math.ceil(Math.abs(by - ay)), 1);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = clamp(Math.round(ax + (bx - ax) * t), 0, gridSize - 1);
    const y = clamp(Math.round(ay + (by - ay) * t), 0, gridSize - 1);
    mask[y * gridSize + x] = 1;
  }
}

function edge(ax, ay, bx, by, px, py) {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function rasterizeProjectedSilhouette(geometry, projection, projectionBounds, gridSize) {
  const mask = new Uint8Array(gridSize * gridSize);
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const triangleCount = getGeometryTriangleCount(geometry);
  const [uAxis, vAxis] = projection.axes;
  const uMin = projectionBounds.min[uAxis];
  const vMin = projectionBounds.min[vAxis];
  const uScale = (gridSize - 1) / Math.max(projectionBounds.max[uAxis] - uMin, 1e-6);
  const vScale = (gridSize - 1) / Math.max(projectionBounds.max[vAxis] - vMin, 1e-6);
  const vertexAt = index
    ? (offset) => index.getX(offset)
    : (offset) => offset;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const i0 = vertexAt(triangle * 3);
    const i1 = vertexAt(triangle * 3 + 1);
    const i2 = vertexAt(triangle * 3 + 2);
    const ax = (coordinate(position, i0, uAxis) - uMin) * uScale;
    const ay = (coordinate(position, i0, vAxis) - vMin) * vScale;
    const bx = (coordinate(position, i1, uAxis) - uMin) * uScale;
    const by = (coordinate(position, i1, vAxis) - vMin) * vScale;
    const cx = (coordinate(position, i2, uAxis) - uMin) * uScale;
    const cy = (coordinate(position, i2, vAxis) - vMin) * vScale;

    markLine(mask, gridSize, ax, ay, bx, by);
    markLine(mask, gridSize, bx, by, cx, cy);
    markLine(mask, gridSize, cx, cy, ax, ay);

    const area = edge(ax, ay, bx, by, cx, cy);
    if (Math.abs(area) < 1e-8) continue;
    const minX = clamp(Math.floor(Math.min(ax, bx, cx)), 0, gridSize - 1);
    const maxX = clamp(Math.ceil(Math.max(ax, bx, cx)), 0, gridSize - 1);
    const minY = clamp(Math.floor(Math.min(ay, by, cy)), 0, gridSize - 1);
    const maxY = clamp(Math.ceil(Math.max(ay, by, cy)), 0, gridSize - 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const e0 = edge(ax, ay, bx, by, px, py);
        const e1 = edge(bx, by, cx, cy, px, py);
        const e2 = edge(cx, cy, ax, ay, px, py);
        const hasNegative = e0 < 0 || e1 < 0 || e2 < 0;
        const hasPositive = e0 > 0 || e1 > 0 || e2 > 0;
        if (!(hasNegative && hasPositive)) mask[y * gridSize + x] = 1;
      }
    }
  }
  return mask;
}

function maskIntersectionOverUnion(left, right) {
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] || right[index]) union += 1;
    if (left[index] && right[index]) intersection += 1;
  }
  return union === 0 ? 1 : intersection / union;
}

export function compareGeometrySilhouettes(referenceGeometry, candidateGeometry, {
  gridSize = 40,
} = {}) {
  const referenceBounds = getGeometryBounds(referenceGeometry);
  const candidateBounds = getGeometryBounds(candidateGeometry);
  const projectionBounds = {
    max: referenceBounds.max.map((value, axis) => Math.max(value, candidateBounds.max[axis])),
    min: referenceBounds.min.map((value, axis) => Math.min(value, candidateBounds.min[axis])),
  };
  const scores = {};
  for (const projection of PROJECTIONS) {
    const referenceMask = rasterizeProjectedSilhouette(
      referenceGeometry, projection, projectionBounds, gridSize,
    );
    const candidateMask = rasterizeProjectedSilhouette(
      candidateGeometry, projection, projectionBounds, gridSize,
    );
    scores[projection.id] = maskIntersectionOverUnion(referenceMask, candidateMask);
  }
  const values = Object.values(scores);
  return {
    gridSize,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    views: scores,
  };
}

export function compareRockLodGeometry(referenceGeometry, candidateGeometry, options = {}) {
  return {
    bounds: compareGeometryBounds(referenceGeometry, candidateGeometry),
    silhouette: compareGeometrySilhouettes(referenceGeometry, candidateGeometry, options),
  };
}
