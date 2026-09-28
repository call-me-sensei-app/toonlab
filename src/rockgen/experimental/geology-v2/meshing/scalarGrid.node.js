// Repository-only scalar-grid contract for the geology-v2 mesher bake-off.
// Negative samples are inside. Values are Float64 so every candidate receives
// the same coordinates and scalar values before it performs its own arithmetic.

const MAX_GRID_POINTS = 256 * 1024 * 1024;

function finiteVector3(value, name) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${name} must be an array of three finite numbers.`);
  }
  return value.map(Number);
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    throw new TypeError('Mesher bounds are required.');
  }
  const min = finiteVector3(bounds.min, 'bounds.min');
  const max = finiteVector3(bounds.max, 'bounds.max');
  for (let axis = 0; axis < 3; axis += 1) {
    if (!(max[axis] > min[axis])) {
      throw new RangeError(`bounds.max[${axis}] must be greater than bounds.min[${axis}].`);
    }
  }
  return { min, max };
}

function normalizeResolution(resolution) {
  const numeric = Number(resolution);
  if (!Number.isInteger(numeric) || numeric < 2 || numeric > 2048) {
    throw new RangeError('Mesher resolution must be an integer from 2 through 2048.');
  }
  return numeric;
}

export function gridPointIndex(grid, x, y, z) {
  return x + y * grid.pointDims[0] + z * grid.pointDims[0] * grid.pointDims[1];
}

export function gridCellIndex(grid, x, y, z) {
  return x + y * grid.cellDims[0] + z * grid.cellDims[0] * grid.cellDims[1];
}

export function gridPointPosition(grid, x, y, z) {
  return [
    grid.origin[0] + x * grid.spacing[0],
    grid.origin[1] + y * grid.spacing[1],
    grid.origin[2] + z * grid.spacing[2],
  ];
}

export function gridSample(grid, x, y, z) {
  return grid.values[gridPointIndex(grid, x, y, z)];
}

/**
 * Sample a scalar field on a cubic world-space lattice.
 *
 * `resolution` is the number of cells along the longest bounds axis. Shorter
 * axes round up, matching the existing Rockgen sampling contract while
 * keeping cells isotropic. Exact isovalue samples use a documented symbolic
 * +epsilon (outside) so all three candidates share one deterministic tie rule.
 */
export function sampleScalarField({
  bounds,
  evaluate,
  isoLevel = 0,
  resolution,
  sourceId = 'anonymous-scalar-field',
} = {}) {
  if (typeof evaluate !== 'function') throw new TypeError('evaluate must be a function.');
  if (!Number.isFinite(isoLevel)) throw new TypeError('isoLevel must be finite.');
  const normalizedBounds = normalizeBounds(bounds);
  const normalizedResolution = normalizeResolution(resolution);
  const spans = normalizedBounds.max.map((value, axis) => value - normalizedBounds.min[axis]);
  const longest = Math.max(...spans);
  const cellSize = longest / normalizedResolution;
  const cellDims = spans.map((span) => Math.max(1, Math.ceil(span / cellSize)));
  const pointDims = cellDims.map((value) => value + 1);
  const pointCount = pointDims[0] * pointDims[1] * pointDims[2];
  if (!Number.isSafeInteger(pointCount) || pointCount > MAX_GRID_POINTS) {
    throw new RangeError(`Scalar grid would contain ${pointCount} points; limit is ${MAX_GRID_POINTS}.`);
  }

  const values = new Float64Array(pointCount);
  let maximumMagnitude = 0;
  let minimumValue = Infinity;
  let maximumValue = -Infinity;
  let write = 0;
  for (let z = 0; z < pointDims[2]; z += 1) {
    const wz = normalizedBounds.min[2] + z * cellSize;
    for (let y = 0; y < pointDims[1]; y += 1) {
      const wy = normalizedBounds.min[1] + y * cellSize;
      for (let x = 0; x < pointDims[0]; x += 1) {
        const wx = normalizedBounds.min[0] + x * cellSize;
        const value = Number(evaluate(wx, wy, wz));
        if (!Number.isFinite(value)) {
          throw new RangeError(
            `Scalar field "${sourceId}" returned ${String(value)} at grid point [${x}, ${y}, ${z}].`,
          );
        }
        const shifted = value - isoLevel;
        values[write] = shifted;
        maximumMagnitude = Math.max(maximumMagnitude, Math.abs(shifted));
        minimumValue = Math.min(minimumValue, shifted);
        maximumValue = Math.max(maximumValue, shifted);
        write += 1;
      }
    }
  }

  // Strictly zero samples otherwise place several independently computed
  // vertices on one lattice point. A common symbolic outside epsilon gives a
  // single, deterministic convention without changing any non-zero sample.
  const zeroEpsilon = Math.max(maximumMagnitude * 2 ** -44, Number.MIN_VALUE * 1024, 1e-15);
  let zeroPerturbations = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (Object.is(values[index], 0) || Object.is(values[index], -0)) {
      values[index] = zeroEpsilon;
      zeroPerturbations += 1;
    }
  }

  return Object.freeze({
    bounds: Object.freeze({
      min: Object.freeze([...normalizedBounds.min]),
      max: Object.freeze(cellDims.map(
        (count, axis) => normalizedBounds.min[axis] + count * cellSize,
      )),
      requestedMax: Object.freeze([...normalizedBounds.max]),
    }),
    cellDims: Object.freeze(cellDims),
    cellSize,
    isoLevel: 0,
    originalIsoLevel: isoLevel,
    origin: Object.freeze([...normalizedBounds.min]),
    pointCount,
    pointDims: Object.freeze(pointDims),
    resolution: normalizedResolution,
    sourceId: String(sourceId),
    spacing: Object.freeze([cellSize, cellSize, cellSize]),
    valueRange: Object.freeze([minimumValue, maximumValue]),
    values,
    zeroEpsilon,
    zeroPerturbations,
  });
}

export function assertScalarGrid(grid) {
  if (!grid || !(grid.values instanceof Float64Array)) {
    throw new TypeError('Mesher input must be a Float64 scalar grid.');
  }
  if (!Array.isArray(grid.cellDims) || grid.cellDims.length !== 3) {
    throw new TypeError('Scalar grid is missing cellDims.');
  }
  const expected = (grid.cellDims[0] + 1) * (grid.cellDims[1] + 1) * (grid.cellDims[2] + 1);
  if (grid.values.length !== expected) {
    throw new RangeError(`Scalar grid has ${grid.values.length} values; expected ${expected}.`);
  }
  return grid;
}
