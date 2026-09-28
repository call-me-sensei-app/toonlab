function bounds2(mesh, axes) {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) for (let axis = 0; axis < 2; axis += 1) {
    const value = mesh.positions[vertex * 3 + axes[axis]];
    min[axis] = Math.min(min[axis], value);
    max[axis] = Math.max(max[axis], value);
  }
  return { max, min };
}

function barycentric(point, a, b, c) {
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denominator) < 1e-14) return false;
  const wa = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
  const wb = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
  const wc = 1 - wa - wb;
  return wa >= 0 && wb >= 0 && wc >= 0;
}

function rasterSilhouette(mesh, axes, commonBounds, resolution) {
  const mask = new Uint8Array(resolution * resolution);
  const span = commonBounds.max.map((value, axis) => Math.max(value - commonBounds.min[axis], 1e-12));
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const projected = [0, 1, 2].map((corner) => {
      const vertex = mesh.indices[face * 3 + corner];
      return axes.map((axis, outputAxis) => (
        (mesh.positions[vertex * 3 + axis] - commonBounds.min[outputAxis]) / span[outputAxis] * (resolution - 1)
      ));
    });
    const minX = Math.max(0, Math.floor(Math.min(...projected.map((point) => point[0]))));
    const maxX = Math.min(resolution - 1, Math.ceil(Math.max(...projected.map((point) => point[0]))));
    const minY = Math.max(0, Math.floor(Math.min(...projected.map((point) => point[1]))));
    const maxY = Math.min(resolution - 1, Math.ceil(Math.max(...projected.map((point) => point[1]))));
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (barycentric([x + 0.5, y + 0.5], ...projected)) mask[x + y * resolution] = 1;
    }
  }
  return mask;
}

function boundary(mask, resolution) {
  const result = [];
  for (let y = 0; y < resolution; y += 1) for (let x = 0; x < resolution; x += 1) {
    const index = x + y * resolution;
    if (!mask[index]) continue;
    if (x === 0 || y === 0 || x + 1 === resolution || y + 1 === resolution
      || !mask[index - 1] || !mask[index + 1] || !mask[index - resolution] || !mask[index + resolution]) {
      result.push([x, y]);
    }
  }
  return result;
}

function directedBoundaryDistance(a, b) {
  if (!a.length || !b.length) return Infinity;
  let maximum = 0;
  for (const point of a) {
    let nearestSquared = Infinity;
    for (const candidate of b) {
      const dx = point[0] - candidate[0];
      const dy = point[1] - candidate[1];
      nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy);
    }
    maximum = Math.max(maximum, Math.sqrt(nearestSquared));
  }
  return maximum;
}

export function auditMeshSilhouettes(reference, candidate, { resolution = 128 } = {}) {
  const views = [
    { axes: [0, 1], id: 'front-back' },
    { axes: [2, 1], id: 'left-right' },
    { axes: [0, 2], id: 'top-bottom' },
  ];
  const results = views.map((view) => {
    const a = bounds2(reference, view.axes);
    const b = bounds2(candidate, view.axes);
    const commonBounds = {
      min: a.min.map((value, axis) => Math.min(value, b.min[axis])),
      max: a.max.map((value, axis) => Math.max(value, b.max[axis])),
    };
    const referenceMask = rasterSilhouette(reference, view.axes, commonBounds, resolution);
    const candidateMask = rasterSilhouette(candidate, view.axes, commonBounds, resolution);
    let union = 0;
    let mismatch = 0;
    for (let index = 0; index < referenceMask.length; index += 1) {
      union += Number(referenceMask[index] || candidateMask[index]);
      mismatch += Number(referenceMask[index] !== candidateMask[index]);
    }
    const referenceBoundary = boundary(referenceMask, resolution);
    const candidateBoundary = boundary(candidateMask, resolution);
    return {
      id: view.id,
      maximumBoundaryErrorPixels: Math.max(
        directedBoundaryDistance(referenceBoundary, candidateBoundary),
        directedBoundaryDistance(candidateBoundary, referenceBoundary),
      ),
      mismatchFraction: mismatch / Math.max(union, 1),
      resolution,
    };
  });
  return {
    maximumBoundaryErrorPixels: Math.max(...results.map((result) => result.maximumBoundaryErrorPixels)),
    maximumMismatchFraction: Math.max(...results.map((result) => result.mismatchFraction)),
    views: results,
  };
}

export function auditFiniteMeshAttributes(mesh) {
  const attributes = ['positions', 'normals', 'tangents', 'uvs'].filter((name) => mesh[name]);
  const results = Object.fromEntries(attributes.map((name) => {
    let nonFinite = 0;
    for (const value of mesh[name]) nonFinite += Number(!Number.isFinite(value));
    return [name, { count: mesh[name].length, nonFinite }];
  }));
  let outOfRangeIndices = 0;
  const vertexCount = mesh.positions.length / 3;
  for (const index of mesh.indices) outOfRangeIndices += Number(index >= vertexCount);
  return {
    attributes: results,
    outOfRangeIndices,
    passed: outOfRangeIndices === 0 && Object.values(results).every((result) => result.nonFinite === 0),
  };
}

