// Surface nets over a dense sampled grid: one vertex per sign-changing
// cell, one quad per sign-changing grid edge — the even, quad-dominant
// topology that cel-shades cleanly at low resolutions.
//
// Vertex placement has two modes:
//   - mass point (classic naive nets): the mean of the cell's edge
//     crossings. Chamfers sharp creases by ~1 voxel.
//   - DUAL CONTOURING (pass `evaluate`): solve the QEF — the point that
//     best satisfies every crossing's tangent plane (normals from field
//     gradients) — so planar-cut edges and heightfield ridgelines stay
//     knife-sharp. Tikhonov-regularized toward the mass point and clamped
//     into the cell, so smooth surfaces degrade gracefully to classic
//     nets instead of growing spikes.

// Cube corner offsets in (x, y, z) bit order.
const CORNER_OFFSETS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

// The 12 cube edges as corner index pairs.
const CUBE_EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Samples `evaluate` over a uniform grid covering `bounds`. `resolution` is
 * the cell count along the longest axis; other axes derive from aspect so
 * cells stay cubic.
 *
 * Returns { values, dims, origin, cellSize } where `values` holds
 * (nx+1)*(ny+1)*(nz+1) corner samples (x fastest, then y, then z).
 */
export function sampleGrid(evaluate, bounds, resolution) {
  const sizeX = bounds.max[0] - bounds.min[0];
  const sizeY = bounds.max[1] - bounds.min[1];
  const sizeZ = bounds.max[2] - bounds.min[2];
  const longest = Math.max(sizeX, sizeY, sizeZ);
  if (!(longest > 0)) throw new Error('Rockgen grid bounds are empty.');
  const cellSize = longest / resolution;
  const nx = Math.max(Math.ceil(sizeX / cellSize), 1);
  const ny = Math.max(Math.ceil(sizeY / cellSize), 1);
  const nz = Math.max(Math.ceil(sizeZ / cellSize), 1);

  const values = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const origin = [bounds.min[0], bounds.min[1], bounds.min[2]];
  let write = 0;
  for (let z = 0; z <= nz; z += 1) {
    const wz = origin[2] + z * cellSize;
    for (let y = 0; y <= ny; y += 1) {
      const wy = origin[1] + y * cellSize;
      for (let x = 0; x <= nx; x += 1) {
        values[write] = evaluate(origin[0] + x * cellSize, wy, wz);
        write += 1;
      }
    }
  }
  return { cellSize, dims: [nx, ny, nz], origin, values };
}

// Solves the 3x3 symmetric system (A + λI) x = b via the adjugate;
// returns false when the matrix is too ill-conditioned to trust.
function solveSymmetric3(a00, a01, a02, a11, a12, a22, b0, b1, b2, out) {
  const c00 = a11 * a22 - a12 * a12;
  const c01 = a02 * a12 - a01 * a22;
  const c02 = a01 * a12 - a02 * a11;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (Math.abs(det) < 1e-10) return false;
  const inv = 1 / det;
  out[0] = (c00 * b0 + c01 * b1 + c02 * b2) * inv;
  out[1] = (c01 * b0 + (a00 * a22 - a02 * a02) * b1 + (a02 * a01 - a00 * a12) * b2) * inv;
  out[2] = (c02 * b0 + (a01 * a02 - a00 * a12) * b1 + (a00 * a11 - a01 * a01) * b2) * inv;
  return true;
}

/**
 * Extracts the zero isosurface from a sampled grid. Returns
 * { positions: Float32Array, indices: Uint32Array } in world space.
 *
 * @param {object} grid From sampleGrid().
 * @param {object} [options]
 * @param {(x,y,z)=>number} [options.evaluate] Field for gradient normals —
 *   enables dual-contouring (QEF) vertex placement; omit for mass points.
 */
export function surfaceNets(grid, { evaluate = null } = {}) {
  const [nx, ny, nz] = grid.dims;
  const { cellSize, origin, values } = grid;
  const rowStride = nx + 1;
  const sliceStride = (nx + 1) * (ny + 1);

  // Vertex index per cell, -1 where the cell has no crossing.
  const cellVertex = new Int32Array(nx * ny * nz).fill(-1);
  const positions = [];

  const cornerValues = new Float32Array(8);
  const crossX = new Float32Array(12);
  const crossY = new Float32Array(12);
  const crossZ = new Float32Array(12);
  const normX = new Float32Array(12);
  const normY = new Float32Array(12);
  const normZ = new Float32Array(12);
  const solved = new Float32Array(3);
  const gradEps = cellSize * 0.5;
  // Regularization weight: high enough that near-flat cells stay at the
  // mass point, low enough that two crossing cut planes pin the crease.
  const LAMBDA = 0.12;

  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        let mask = 0;
        for (let corner = 0; corner < 8; corner += 1) {
          const [ox, oy, oz] = CORNER_OFFSETS[corner];
          const value = values[(x + ox) + (y + oy) * rowStride + (z + oz) * sliceStride];
          cornerValues[corner] = value;
          if (value < 0) mask |= 1 << corner;
        }
        if (mask === 0 || mask === 0xff) continue;

        // Edge zero-crossings (cell-local coordinates in [0, 1]).
        let px = 0;
        let py = 0;
        let pz = 0;
        let crossings = 0;
        for (const [c0, c1] of CUBE_EDGES) {
          const v0 = cornerValues[c0];
          const v1 = cornerValues[c1];
          if ((v0 < 0) === (v1 < 0)) continue;
          const t = v0 / (v0 - v1);
          const [ax, ay, az] = CORNER_OFFSETS[c0];
          const [bx, by, bz] = CORNER_OFFSETS[c1];
          crossX[crossings] = ax + (bx - ax) * t;
          crossY[crossings] = ay + (by - ay) * t;
          crossZ[crossings] = az + (bz - az) * t;
          px += crossX[crossings];
          py += crossY[crossings];
          pz += crossZ[crossings];
          crossings += 1;
        }
        const inv = 1 / crossings;
        px *= inv;
        py *= inv;
        pz *= inv;

        if (evaluate) {
          // QEF: minimize Σ (n_i · (v - p_i))² + λ|v - masspoint|² over the
          // crossing tangent planes (normals = field gradients).
          let a00 = LAMBDA;
          let a01 = 0;
          let a02 = 0;
          let a11 = LAMBDA;
          let a12 = 0;
          let a22 = LAMBDA;
          let b0 = LAMBDA * px;
          let b1 = LAMBDA * py;
          let b2 = LAMBDA * pz;
          for (let i = 0; i < crossings; i += 1) {
            const wx = origin[0] + (x + crossX[i]) * cellSize;
            const wy = origin[1] + (y + crossY[i]) * cellSize;
            const wz = origin[2] + (z + crossZ[i]) * cellSize;
            let gx = evaluate(wx + gradEps, wy, wz) - evaluate(wx - gradEps, wy, wz);
            let gy = evaluate(wx, wy + gradEps, wz) - evaluate(wx, wy - gradEps, wz);
            let gz = evaluate(wx, wy, wz + gradEps) - evaluate(wx, wy, wz - gradEps);
            const len = Math.sqrt(gx * gx + gy * gy + gz * gz);
            if (len < 1e-9) continue;
            gx /= len;
            gy /= len;
            gz /= len;
            const dot = gx * crossX[i] + gy * crossY[i] + gz * crossZ[i];
            a00 += gx * gx;
            a01 += gx * gy;
            a02 += gx * gz;
            a11 += gy * gy;
            a12 += gy * gz;
            a22 += gz * gz;
            b0 += gx * dot;
            b1 += gy * dot;
            b2 += gz * dot;
          }
          if (solveSymmetric3(a00, a01, a02, a11, a12, a22, b0, b1, b2, solved)) {
            // Clamp into the cell: an out-of-cell QEF solution means the
            // planes meet elsewhere — trust the topology, not the spike.
            px = Math.min(Math.max(solved[0], 0), 1);
            py = Math.min(Math.max(solved[1], 0), 1);
            pz = Math.min(Math.max(solved[2], 0), 1);
          }
        }

        cellVertex[x + y * nx + z * nx * ny] = positions.length / 3;
        positions.push(
          origin[0] + (x + px) * cellSize,
          origin[1] + (y + py) * cellSize,
          origin[2] + (z + pz) * cellSize,
        );
      }
    }
  }

  // One quad (two triangles) per sign-changing interior grid edge, joining
  // the four cells around that edge. Axis loops are unrolled per direction
  // so the winding stays consistent with the sign of the near corner.
  const indices = [];
  const pushQuad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) {
      indices.push(a, b, c, c, b, d);
    } else {
      indices.push(a, c, b, b, c, d);
    }
  };

  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const corner = values[x + y * rowStride + z * sliceStride];
        const inside = corner < 0;

        // Edge along +X: shared by cells (x, y-1..y, z-1..z).
        if (y > 0 && z > 0 && x < nx) {
          const next = values[(x + 1) + y * rowStride + z * sliceStride];
          if ((next < 0) !== inside) {
            pushQuad(
              cellVertex[x + (y - 1) * nx + (z - 1) * nx * ny],
              cellVertex[x + y * nx + (z - 1) * nx * ny],
              cellVertex[x + (y - 1) * nx + z * nx * ny],
              cellVertex[x + y * nx + z * nx * ny],
              inside,
            );
          }
        }
        // Edge along +Y: shared by cells (x-1..x, y, z-1..z).
        if (x > 0 && z > 0 && y < ny) {
          const next = values[x + (y + 1) * rowStride + z * sliceStride];
          if ((next < 0) !== inside) {
            pushQuad(
              cellVertex[(x - 1) + y * nx + (z - 1) * nx * ny],
              cellVertex[(x - 1) + y * nx + z * nx * ny],
              cellVertex[x + y * nx + (z - 1) * nx * ny],
              cellVertex[x + y * nx + z * nx * ny],
              inside,
            );
          }
        }
        // Edge along +Z: shared by cells (x-1..x, y-1..y, z).
        if (x > 0 && y > 0 && z < nz) {
          const next = values[x + y * rowStride + (z + 1) * sliceStride];
          if ((next < 0) !== inside) {
            pushQuad(
              cellVertex[(x - 1) + (y - 1) * nx + z * nx * ny],
              cellVertex[x + (y - 1) * nx + z * nx * ny],
              cellVertex[(x - 1) + y * nx + z * nx * ny],
              cellVertex[x + y * nx + z * nx * ny],
              inside,
            );
          }
        }
      }
    }
  }

  return {
    indices: new Uint32Array(indices),
    positions: new Float32Array(positions),
  };
}

/**
 * Drops disconnected surface fragments smaller than `minRatio` of the
 * largest component's triangle count, compacting the vertex list. Strong
 * domain warp / high noise amplitudes routinely pinch off small floating
 * islands; they read as artifacts, so meshDocument filters them by default.
 */
export function filterSmallIslands({ indices, positions }, minRatio = 0.02) {
  const vertexCount = positions.length / 3;
  const parent = new Int32Array(vertexCount);
  for (let v = 0; v < vertexCount; v += 1) parent[v] = v;
  const find = (v) => {
    let root = v;
    while (parent[root] !== root) root = parent[root];
    while (parent[v] !== root) {
      const next = parent[v];
      parent[v] = root;
      v = next;
    }
    return root;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]);
    const b = find(indices[t + 1]);
    const c = find(indices[t + 2]);
    if (b !== a) parent[b] = a;
    if (c !== a) parent[c] = a;
  }

  const triangleCounts = new Map();
  let largest = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const root = find(indices[t]);
    const count = (triangleCounts.get(root) ?? 0) + 1;
    triangleCounts.set(root, count);
    if (count > largest) largest = count;
  }
  const threshold = Math.max(largest * minRatio, 1);
  if ([...triangleCounts.values()].every((count) => count >= threshold)) {
    return { indices, positions };
  }

  // Compact kept triangles and remap their vertices.
  const remap = new Int32Array(vertexCount).fill(-1);
  const keptPositions = [];
  const keptIndices = [];
  for (let t = 0; t < indices.length; t += 3) {
    if (triangleCounts.get(find(indices[t])) < threshold) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const source = indices[t + corner];
      if (remap[source] === -1) {
        remap[source] = keptPositions.length / 3;
        keptPositions.push(positions[source * 3], positions[source * 3 + 1], positions[source * 3 + 2]);
      }
      keptIndices.push(remap[source]);
    }
  }
  return {
    indices: new Uint32Array(keptIndices),
    positions: new Float32Array(keptPositions),
  };
}
