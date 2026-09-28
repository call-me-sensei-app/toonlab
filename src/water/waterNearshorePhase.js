// CPU-baked nearshore phase field for the primary Gerstner swell and its
// optional same-direction set-beat partner.
//
// A spatial phase coordinate q(x,z) replaces the deep-water dot(direction,
// position) term close to bathymetry. Its gradient is the local wave vector
// expressed as a multiple of the offshore wave number:
//
//   theta_i = k_i * q(x,z) - omega_i * time + phase_i
//   grad(theta_i) = k_i * grad(q)
//
// Keeping omega fixed preserves the incident period. Increasing |grad(q)| in
// shallow water therefore lowers phase speed and shortens wavelength, while
// the direction of grad(q) bends crests around depth contours. The field is
// baked once when the static bed atlas is baked; WaterSurface packs it into
// one vec4 attribute (q, dq/dx, dq/dz, slot mask), avoiding another texture
// pass or per-wave root solve in the already-large WebGPU material.

const EPSILON = 1e-8;

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizedDirection(x, z) {
  const length = Math.hypot(Number(x) || 0, Number(z) || 0);
  return length > EPSILON
    ? { x: x / length, z: z / length }
    : { x: 0, z: 1 };
}

/**
 * Solves the finite-depth dispersion relation for a fixed incident period.
 *
 * buildGerstnerWaves authors omega from the deep-water k0 and then applies a
 * user speed multiplier. Treating that multiplier as an effective gravity
 * reduces the usual omega^2 = g*k*tanh(k*h) equation to:
 *
 *   k * tanh(k*h) = k0
 *
 * This keeps the speed dial a uniform multiplier while retaining the correct
 * deep- and shallow-water wavelength ratios.
 */
export function solveFiniteDepthWaveNumber(deepWaveNumber, waterDepth, iterations = 6) {
  const k0 = finitePositive(deepWaveNumber, 1);
  if (waterDepth === Infinity) return k0;
  const h = finitePositive(waterDepth, 1e-4);
  let k = Math.max(k0, Math.sqrt(k0 / h));
  const count = Math.max(1, Math.min(Math.trunc(iterations) || 6, 12));

  for (let i = 0; i < count; i += 1) {
    const kh = k * h;
    const tanhKh = Math.tanh(kh);
    const derivative = tanhKh + kh * (1 - tanhKh * tanhKh);
    if (!(derivative > EPSILON)) break;
    k -= (k * tanhKh - k0) / derivative;
    k = Math.max(k, k0);
  }
  return k;
}

export function finiteDepthWaveNumberRatio(
  deepWaveNumber,
  waterDepth,
  { minDepth = 0.05, maxRatio = 4 } = {},
) {
  const k0 = finitePositive(deepWaveNumber, 1);
  const h = Math.max(Number(waterDepth) || 0, finitePositive(minDepth, 0.05));
  const cap = Math.max(Number(maxRatio) || 1, 1);
  return Math.min(solveFiniteDepthWaveNumber(k0, h) / k0, cap);
}

function assertGrid(restDepths, columns, rows) {
  const nx = Math.trunc(columns);
  const nz = Math.trunc(rows);
  if (nx < 2 || nz < 2) {
    throw new RangeError('Nearshore phase field requires at least a 2 x 2 grid.');
  }
  if (!restDepths || restDepths.length !== nx * nz) {
    throw new RangeError(`Nearshore phase depth grid must contain ${nx * nz} samples.`);
  }
  return { nx, nz };
}

/**
 * Builds a one-way upwind eikonal field on a regular world-space XZ grid. The
 * incident edge retains the offshore plane-wave phase, and each successive
 * slice solves the propagation component of |grad(q)| = k/k0 from the prior
 * slice's transverse derivative. This is a mild-slope/ray approximation: it
 * handles refraction but deliberately does not model diffraction or a ray
 * turning back toward the incident boundary.
 *
 * Grid storage is row-major: index = zIndex * columns + xIndex.
 */
export function buildNearshorePhaseField({
  restDepths,
  columns,
  rows,
  originX,
  originZ,
  stepX,
  stepZ,
  directionX,
  directionZ,
  deepWaveNumber,
  incidentAxis = null,
  minDepth = 0.05,
  maxWavenumberRatio = 4,
} = {}) {
  const { nx, nz } = assertGrid(restDepths, columns, rows);
  const x0 = Number(originX) || 0;
  const z0 = Number(originZ) || 0;
  const dxGrid = finitePositive(stepX, 1);
  const dzGrid = finitePositive(stepZ, 1);
  const direction = normalizedDirection(directionX, directionZ);
  const k0 = finitePositive(deepWaveNumber, 1);
  const ratioCap = Math.max(Number(maxWavenumberRatio) || 1, 1);

  const ratios = new Float32Array(nx * nz);
  for (let index = 0; index < ratios.length; index += 1) {
    ratios[index] = finiteDepthWaveNumberRatio(k0, restDepths[index], {
      minDepth,
      maxRatio: ratioCap,
    });
  }

  // Keep the integration in Float64. On a 100m+ water body, Float32 phase
  // accumulation otherwise leaves small grid-aligned velocity changes.
  const phase64 = new Float64Array(nx * nz);
  const basePhase = (x, z) => direction.x * x + direction.z * z;
  const indexOf = (ix, iz) => iz * nx + ix;

  // Pick one incident boundary. A raw plane-phase condition on *both* inflow
  // edges is wrong when a side edge already crosses changing bathymetry: that
  // edge would inject undelayed shallow phase into the interior. Prefer the
  // deepest plausible incoming edge. This choice deliberately does not vary
  // with incidence angle: an angle-weighted score moved the old 45-degree pop
  // to a different threshold. Callers that know their offshore axis should
  // pass incidentAxis ('x' or 'z') and keep it stable across direction edits.
  const setBoundary = (ix, iz) => {
    const index = indexOf(ix, iz);
    phase64[index] = basePhase(x0 + ix * dxGrid, z0 + iz * dzGrid);
  };
  const candidates = [];
  if (Math.abs(direction.x) > EPSILON) {
    const ix = direction.x > 0 ? 0 : nx - 1;
    let averageRatio = 0;
    for (let iz = 0; iz < nz; iz += 1) averageRatio += ratios[indexOf(ix, iz)];
    candidates.push({ axis: 'x', index: ix, score: averageRatio / nz });
  }
  if (Math.abs(direction.z) > EPSILON) {
    const iz = direction.z > 0 ? 0 : nz - 1;
    let averageRatio = 0;
    for (let ix = 0; ix < nx; ix += 1) averageRatio += ratios[indexOf(ix, iz)];
    candidates.push({ axis: 'z', index: iz, score: averageRatio / nx });
  }
  candidates.sort((a, b) => a.score - b.score ||
    Math.abs(direction[b.axis]) - Math.abs(direction[a.axis]) ||
    a.axis.localeCompare(b.axis));
  const requestedAxis = incidentAxis === 'x' || incidentAxis === 'z' ? incidentAxis : null;
  const incident = candidates.find((candidate) => candidate.axis === requestedAxis) ?? candidates[0];
  const valid = new Uint8Array(nx * nz);
  valid.fill(1);
  let invalidCount = 0;
  const invalidate = (index) => {
    if (valid[index]) {
      valid[index] = 0;
      invalidCount += 1;
    }
  };

  if (incident.axis === 'x') {
    for (let iz = 0; iz < nz; iz += 1) setBoundary(incident.index, iz);
  } else {
    for (let ix = 0; ix < nx; ix += 1) setBoundary(ix, incident.index);
  }

  if (incident.axis === 'x') {
    const stepSign = incident.index === 0 ? 1 : -1;
    for (let offset = 1; offset < nx; offset += 1) {
      const ix = incident.index + offset * stepSign;
      const previousX = ix - stepSign;
      for (let iz = 0; iz < nz; iz += 1) {
        const zBefore = Math.max(iz - 1, 0);
        const zAfter = Math.min(iz + 1, nz - 1);
        const transverse = (
          phase64[indexOf(previousX, zAfter)] - phase64[indexOf(previousX, zBefore)]
        ) / Math.max((zAfter - zBefore) * dzGrid, EPSILON);
        const previousIndex = indexOf(previousX, iz);
        const index = indexOf(ix, iz);
        if (!valid[previousIndex]) invalidate(index);
        const previousAxisSquared = ratios[previousIndex] * ratios[previousIndex] -
          transverse * transverse;
        const currentAxisSquared = ratios[index] * ratios[index] - transverse * transverse;
        if (previousAxisSquared < 0 || currentAxisSquared < 0) invalidate(index);
        const previousAxis = stepSign * Math.sqrt(Math.max(previousAxisSquared, EPSILON));
        const currentAxis = stepSign * Math.sqrt(Math.max(currentAxisSquared, EPSILON));
        phase64[index] = phase64[previousIndex] +
          0.5 * (previousAxis + currentAxis) * stepSign * dxGrid;
      }
    }
  } else {
    const stepSign = incident.index === 0 ? 1 : -1;
    for (let offset = 1; offset < nz; offset += 1) {
      const iz = incident.index + offset * stepSign;
      const previousZ = iz - stepSign;
      for (let ix = 0; ix < nx; ix += 1) {
        const xBefore = Math.max(ix - 1, 0);
        const xAfter = Math.min(ix + 1, nx - 1);
        const transverse = (
          phase64[indexOf(xAfter, previousZ)] - phase64[indexOf(xBefore, previousZ)]
        ) / Math.max((xAfter - xBefore) * dxGrid, EPSILON);
        const previousIndex = indexOf(ix, previousZ);
        const index = indexOf(ix, iz);
        if (!valid[previousIndex]) invalidate(index);
        const previousAxisSquared = ratios[previousIndex] * ratios[previousIndex] -
          transverse * transverse;
        const currentAxisSquared = ratios[index] * ratios[index] - transverse * transverse;
        if (previousAxisSquared < 0 || currentAxisSquared < 0) invalidate(index);
        const previousAxis = stepSign * Math.sqrt(Math.max(previousAxisSquared, EPSILON));
        const currentAxis = stepSign * Math.sqrt(Math.max(currentAxisSquared, EPSILON));
        phase64[index] = phase64[previousIndex] +
          0.5 * (previousAxis + currentAxis) * stepSign * dzGrid;
      }
    }
  }

  const phaseCoordinate = new Float32Array(phase64);
  const waveVector = new Float32Array(nx * nz * 2);
  for (let iz = 0; iz < nz; iz += 1) {
    const zBefore = Math.max(iz - 1, 0);
    const zAfter = Math.min(iz + 1, nz - 1);
    const dz = Math.max((zAfter - zBefore) * dzGrid, EPSILON);
    for (let ix = 0; ix < nx; ix += 1) {
      const xBefore = Math.max(ix - 1, 0);
      const xAfter = Math.min(ix + 1, nx - 1);
      const dx = Math.max((xAfter - xBefore) * dxGrid, EPSILON);
      const index = indexOf(ix, iz);
      let gx = (phase64[indexOf(xAfter, iz)] - phase64[indexOf(xBefore, iz)]) / dx;
      let gz = (phase64[indexOf(ix, zAfter)] - phase64[indexOf(ix, zBefore)]) / dz;
      let magnitude = Math.hypot(gx, gz);
      if (!(magnitude > EPSILON) || !Number.isFinite(magnitude)) {
        invalidate(index);
        magnitude = ratios[index];
        gx = direction.x * magnitude;
        gz = direction.z * magnitude;
      } else if (gx * direction.x + gz * direction.z <= 0) {
        // Preserve the actual phase gradient for analytic Gerstner normals;
        // replacing it independently would make q and grad(q) disagree.
        invalidate(index);
      }
      waveVector[index * 2] = gx;
      waveVector[index * 2 + 1] = gz;
    }
  }

  return {
    columns: nx,
    rows: nz,
    originX: x0,
    originZ: z0,
    stepX: dxGrid,
    stepZ: dzGrid,
    directionX: direction.x,
    directionZ: direction.z,
    deepWaveNumber: k0,
    incidentAxis: incident.axis,
    invalidCount,
    invalidFraction: invalidCount / (nx * nz),
    phaseCoordinate,
    validity: valid,
    waveVector,
    waveNumberRatio: ratios,
  };
}

/** Bilinearly samples the baked field for the CPU water-height mirror. */
export function sampleNearshorePhaseField(field, x, z, out = {}) {
  const nx = field?.columns ?? 0;
  const nz = field?.rows ?? 0;
  if (nx < 2 || nz < 2) {
    const direction = normalizedDirection(field?.directionX ?? 1, field?.directionZ ?? 0);
    const worldX = Number(x) || 0;
    const worldZ = Number(z) || 0;
    out.phaseCoordinate = direction.x * worldX + direction.z * worldZ;
    out.waveVectorX = direction.x;
    out.waveVectorZ = direction.z;
    return out;
  }
  const worldX = Number(x) || 0;
  const worldZ = Number(z) || 0;
  const unclampedX = (worldX - field.originX) / field.stepX;
  const unclampedZ = (worldZ - field.originZ) / field.stepZ;
  const fx = Math.min(Math.max(unclampedX, 0), nx - 1);
  const fz = Math.min(Math.max(unclampedZ, 0), nz - 1);
  const ix = Math.min(Math.floor(fx), nx - 2);
  const iz = Math.min(Math.floor(fz), nz - 2);
  const tx = fx - ix;
  const tz = fz - iz;
  const indices = [iz * nx + ix, iz * nx + ix + 1, (iz + 1) * nx + ix, (iz + 1) * nx + ix + 1];
  const weights = [(1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz, tx * tz];
  let phase = 0;
  let vectorX = 0;
  let vectorZ = 0;
  for (let i = 0; i < 4; i += 1) {
    phase += field.phaseCoordinate[indices[i]] * weights[i];
    vectorX += field.waveVector[indices[i] * 2] * weights[i];
    vectorZ += field.waveVector[indices[i] * 2 + 1] * weights[i];
  }
  const clampedWorldX = field.originX + fx * field.stepX;
  const clampedWorldZ = field.originZ + fz * field.stepZ;
  // CPU callers can query just outside the finite mesh (wide splash rings,
  // interaction margins). Continue the edge phase linearly instead of
  // clamping q to a spatially constant value and stopping the wave there.
  out.phaseCoordinate = phase + vectorX * (worldX - clampedWorldX) +
    vectorZ * (worldZ - clampedWorldZ);
  out.waveVectorX = vectorX;
  out.waveVectorZ = vectorZ;
  return out;
}
