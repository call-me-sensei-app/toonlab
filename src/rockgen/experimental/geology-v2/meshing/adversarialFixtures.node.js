// Deterministic scalar fields for the Checkpoint 3 topology bake-off. These
// fixtures are geometry tests, not geology families, and intentionally isolate
// one failure mode at a time.

function length3(x, y, z) {
  return Math.hypot(x, y, z);
}

function sdSphere(x, y, z, radius) {
  return length3(x, y, z) - radius;
}

function sdEllipsoidApprox(x, y, z, radii) {
  const k0 = Math.hypot(x / radii[0], y / radii[1], z / radii[2]);
  const k1 = Math.hypot(x / (radii[0] ** 2), y / (radii[1] ** 2), z / (radii[2] ** 2));
  return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(...radii);
}

function sdBox(x, y, z, halfSize) {
  const qx = Math.abs(x) - halfSize[0];
  const qy = Math.abs(y) - halfSize[1];
  const qz = Math.abs(z) - halfSize[2];
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0))
    + Math.min(Math.max(qx, qy, qz), 0);
}

const STANDARD_BOUNDS = Object.freeze({ min: [-1, -1, -1], max: [1, 1, 1] });

export const ADVERSARIAL_MESHER_FIXTURES = Object.freeze([
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    evaluate(x, y, z) {
      // A closed trilinear-warped body whose coarse cells contain four-edge
      // face ambiguities. The envelope drives the warp to zero at the domain
      // boundary, so the adversarial topology remains a closed surface.
      const envelope = Math.max(0, 1 - x * x - y * y - z * z);
      return sdSphere(x, y, z, 0.72) + 5 * x * y * envelope;
    },
    expected: Object.freeze({ components: 1, minimumAmbiguousFaces: 1 }),
    id: 'ambiguous-cell',
    label: 'Ambiguous cell / face decider',
    resolution: 21,
  }),
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    evaluate(x, y, z) {
      return sdSphere(x, y, z, 0.7) + 0.42 * (x * y - 0.55 * z * z) + 0.045;
    },
    expected: Object.freeze({ components: 1, maximumGenus: 0 }),
    id: 'saddle',
    label: 'Interior saddle',
    resolution: 20,
  }),
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    evaluate(x, y, z) {
      const radial = Math.hypot(x, z) - 0.72;
      const slab = Math.abs(y + 0.013) - 0.058;
      return Math.max(radial, slab);
    },
    expected: Object.freeze({ components: 1, maximumGenus: 0 }),
    id: 'thin-sheet',
    label: 'Thin closed sheet',
    resolution: 22,
  }),
  Object.freeze({
    bounds: Object.freeze({ min: [-1.35, -0.9, -0.9], max: [1.35, 0.9, 0.9] }),
    evaluate(x, y, z) {
      const left = length3(x + 0.6, y, z) - 0.54;
      const right = length3(x - 0.6, y, z) - 0.54;
      return Math.min(left, right);
    },
    expected: Object.freeze({ components: 2, maximumGenus: 0 }),
    id: 'near-touching',
    label: 'Near-touching components',
    resolution: 27,
  }),
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    evaluate(x, y, z) {
      const box = sdBox(x, y, z, [0.58, 0.48, 0.62]);
      // An oblique hard intersection makes a deliberate, high-dihedral ridge.
      return Math.max(box, 0.62 * x + 0.18 * y - 0.68);
    },
    expected: Object.freeze({ components: 1, maximumGenus: 0 }),
    id: 'sharp-crease',
    label: 'Sharp QEF crease',
    resolution: 22,
  }),
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    evaluate(x, y, z) {
      return Math.abs(length3(x, y, z) - 0.58) - 0.115;
    },
    expected: Object.freeze({ components: 2, maximumGenus: 0 }),
    id: 'cavity',
    label: 'Closed cavity shell',
    resolution: 24,
  }),
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    evaluate(x, y, z) {
      const radius = length3(x, y, z);
      return (radius - 0.34) * (radius - 0.72);
    },
    expected: Object.freeze({ components: 2, maximumGenus: 0 }),
    id: 'nested-component',
    label: 'Nested closed components',
    resolution: 24,
  }),
  Object.freeze({
    bounds: STANDARD_BOUNDS,
    chunkCells: 7,
    evaluate(x, y, z) {
      const base = sdEllipsoidApprox(x - 0.07, y + 0.03, z - 0.04, [0.73, 0.61, 0.68]);
      const warp = Math.sin(7.3 * x + 0.4) * Math.sin(6.1 * y - 0.2) * Math.sin(6.7 * z + 0.7);
      return base + warp * 0.025;
    },
    expected: Object.freeze({ components: 1, maximumGenus: 0 }),
    id: 'chunk-seam',
    label: 'Cross-chunk seam',
    resolution: 25,
  }),
  Object.freeze({
    bounds: Object.freeze({ min: [-0.00012, -0.00012, -0.00012], max: [0.00012, 0.00012, 0.00012] }),
    evaluate(x, y, z) {
      const scale = 0.0001;
      const base = sdEllipsoidApprox(x / scale, y / scale, z / scale, [0.78, 0.62, 0.7]);
      const crease = 0.08 * Math.max(0, (0.7 * x + 0.2 * y - 0.5 * z) / scale - 0.38);
      return (base + crease) * scale;
    },
    expected: Object.freeze({ components: 1, maximumGenus: 0 }),
    id: 'extreme-scale',
    label: 'Extreme physical scale',
    resolution: 22,
  }),
]);

export function countAmbiguousGridFaces(grid) {
  const [nx, ny, nz] = grid.cellDims;
  const sample = (x, y, z) => grid.values[
    x + y * grid.pointDims[0] + z * grid.pointDims[0] * grid.pointDims[1]
  ];
  let count = 0;
  const face = (values) => {
    const crossings = values.reduce((total, value, index) => {
      const next = values[(index + 1) % values.length];
      return total + Number((value < 0) !== (next < 0));
    }, 0);
    if (crossings === 4) count += 1;
  };
  for (let z = 0; z <= nz; z += 1) for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
    face([sample(x, y, z), sample(x + 1, y, z), sample(x + 1, y + 1, z), sample(x, y + 1, z)]);
  }
  for (let y = 0; y <= ny; y += 1) for (let z = 0; z < nz; z += 1) for (let x = 0; x < nx; x += 1) {
    face([sample(x, y, z), sample(x + 1, y, z), sample(x + 1, y, z + 1), sample(x, y, z + 1)]);
  }
  for (let x = 0; x <= nx; x += 1) for (let z = 0; z < nz; z += 1) for (let y = 0; y < ny; y += 1) {
    face([sample(x, y, z), sample(x, y + 1, z), sample(x, y + 1, z + 1), sample(x, y, z + 1)]);
  }
  return count;
}
