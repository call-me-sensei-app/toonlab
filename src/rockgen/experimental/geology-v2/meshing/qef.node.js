// Small deterministic 3x3 QEF solver. The symmetric eigendecomposition uses
// fixed-order Jacobi rotations so singular planar systems use a stable
// pseudoinverse instead of an unstable adjugate.

function identity3() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

function jacobiEigenSymmetric3(matrix) {
  const a = [...matrix];
  const vectors = identity3();
  const pairs = [[0, 1], [0, 2], [1, 2]];
  for (let sweep = 0; sweep < 12; sweep += 1) {
    let changed = false;
    for (const [p, q] of pairs) {
      const apq = a[p * 3 + q];
      const scale = Math.abs(a[p * 3 + p]) + Math.abs(a[q * 3 + q]) + 1;
      if (Math.abs(apq) <= Number.EPSILON * 16 * scale) continue;
      changed = true;
      const app = a[p * 3 + p];
      const aqq = a[q * 3 + q];
      const tau = (aqq - app) / (2 * apq);
      const tangent = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const cosine = 1 / Math.sqrt(1 + tangent * tangent);
      const sine = tangent * cosine;

      for (let row = 0; row < 3; row += 1) {
        if (row === p || row === q) continue;
        const arp = a[row * 3 + p];
        const arq = a[row * 3 + q];
        const nextP = cosine * arp - sine * arq;
        const nextQ = sine * arp + cosine * arq;
        a[row * 3 + p] = nextP;
        a[p * 3 + row] = nextP;
        a[row * 3 + q] = nextQ;
        a[q * 3 + row] = nextQ;
      }
      a[p * 3 + p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
      a[q * 3 + q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
      a[p * 3 + q] = 0;
      a[q * 3 + p] = 0;

      for (let row = 0; row < 3; row += 1) {
        const vrp = vectors[row * 3 + p];
        const vrq = vectors[row * 3 + q];
        vectors[row * 3 + p] = cosine * vrp - sine * vrq;
        vectors[row * 3 + q] = sine * vrp + cosine * vrq;
      }
    }
    if (!changed) break;
  }
  return { values: [a[0], a[4], a[8]], vectors };
}

export function createQefAccumulator() {
  return {
    ata: new Float64Array(9),
    atb: new Float64Array(3),
    btb: 0,
    count: 0,
    massPoint: new Float64Array(3),
  };
}

export function addQefPlane(qef, point, normal) {
  const [nx, ny, nz] = normal;
  const dot = nx * point[0] + ny * point[1] + nz * point[2];
  qef.ata[0] += nx * nx;
  qef.ata[1] += nx * ny;
  qef.ata[2] += nx * nz;
  qef.ata[3] += ny * nx;
  qef.ata[4] += ny * ny;
  qef.ata[5] += ny * nz;
  qef.ata[6] += nz * nx;
  qef.ata[7] += nz * ny;
  qef.ata[8] += nz * nz;
  qef.atb[0] += nx * dot;
  qef.atb[1] += ny * dot;
  qef.atb[2] += nz * dot;
  qef.btb += dot * dot;
  qef.massPoint[0] += point[0];
  qef.massPoint[1] += point[1];
  qef.massPoint[2] += point[2];
  qef.count += 1;
  return qef;
}

export function mergeQef(target, source) {
  for (let i = 0; i < 9; i += 1) target.ata[i] += source.ata[i];
  for (let i = 0; i < 3; i += 1) {
    target.atb[i] += source.atb[i];
    target.massPoint[i] += source.massPoint[i];
  }
  target.btb += source.btb;
  target.count += source.count;
  return target;
}

export function evaluateQef(qef, point) {
  const [x, y, z] = point;
  const ax = qef.ata[0] * x + qef.ata[1] * y + qef.ata[2] * z;
  const ay = qef.ata[3] * x + qef.ata[4] * y + qef.ata[5] * z;
  const az = qef.ata[6] * x + qef.ata[7] * y + qef.ata[8] * z;
  return Math.max(0, x * ax + y * ay + z * az
    - 2 * (x * qef.atb[0] + y * qef.atb[1] + z * qef.atb[2]) + qef.btb);
}

export function solveQef(qef, {
  boundsMax = [Infinity, Infinity, Infinity],
  boundsMin = [-Infinity, -Infinity, -Infinity],
  relativeTolerance = 1e-10,
} = {}) {
  if (!qef || qef.count <= 0) throw new RangeError('Cannot solve an empty QEF.');
  const massPoint = [
    qef.massPoint[0] / qef.count,
    qef.massPoint[1] / qef.count,
    qef.massPoint[2] / qef.count,
  ];
  const { values, vectors } = jacobiEigenSymmetric3(qef.ata);
  const largest = Math.max(...values.map(Math.abs), 1);
  const threshold = largest * relativeTolerance;
  const solution = [0, 0, 0];
  let rank = 0;
  for (let column = 0; column < 3; column += 1) {
    const eigenvalue = values[column];
    const vx = vectors[column];
    const vy = vectors[3 + column];
    const vz = vectors[6 + column];
    if (Math.abs(eigenvalue) > threshold) {
      const projected = (vx * qef.atb[0] + vy * qef.atb[1] + vz * qef.atb[2]) / eigenvalue;
      solution[0] += vx * projected;
      solution[1] += vy * projected;
      solution[2] += vz * projected;
      rank += 1;
    } else {
      const projectedMass = vx * massPoint[0] + vy * massPoint[1] + vz * massPoint[2];
      solution[0] += vx * projectedMass;
      solution[1] += vy * projectedMass;
      solution[2] += vz * projectedMass;
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    solution[axis] = Math.min(Math.max(solution[axis], boundsMin[axis]), boundsMax[axis]);
  }
  return {
    error: evaluateQef(qef, solution),
    massPoint,
    rank,
    position: solution,
  };
}
