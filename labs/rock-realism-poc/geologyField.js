/* Adapted from Vibe3D revision 10bba5dbb0dcac855fbbeb112c1804c5999ca120 under MIT; see THIRD_PARTY_NOTICES.md. */

// .local-reference/vibe3d/assets/terrain/shared/noise.ts
function hashBits(x, y, z, seed) {
  let value = Math.imul(x | 0, 521288629);
  value ^= Math.imul(y | 0, 1597334677);
  value ^= Math.imul(z | 0, 1821285621);
  value ^= Math.imul(seed | 0, 668265261);
  value ^= value >>> 15;
  value = Math.imul(value, 2246822507);
  value ^= value >>> 13;
  value = Math.imul(value, 3266489909);
  value ^= value >>> 16;
  return value >>> 0;
}
function hash01(x, y, z, seed) {
  return hashBits(x, y, z, seed) / 4294967296;
}
var GRADIENTS = new Float64Array([
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
  0,
  1,
  0,
  1,
  -1,
  0,
  1,
  1,
  0,
  -1,
  -1,
  0,
  -1,
  0,
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
  1,
  1,
  0,
  0,
  -1,
  1,
  -1,
  1,
  0,
  0,
  -1,
  -1
]);
var NOISE_CELL_CACHE_SIZE = 4096;
var gradientCellBySeed = new Array(NOISE_CELL_CACHE_SIZE);
function gradientNoise(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const cacheSlot = seed & NOISE_CELL_CACHE_SIZE - 1;
  let cell = gradientCellBySeed[cacheSlot];
  if (!cell || cell.seed !== seed) {
    cell = { seed, x: NaN, y: NaN, z: NaN, bases: new Int16Array(8) };
    gradientCellBySeed[cacheSlot] = cell;
  }
  if (cell.x !== ix || cell.y !== iy || cell.z !== iz) {
    cell.x = ix;
    cell.y = iy;
    cell.z = iz;
    const bases2 = cell.bases;
    bases2[0] = (hashBits(ix, iy, iz, seed) & 15) * 3;
    bases2[1] = (hashBits(ix + 1, iy, iz, seed) & 15) * 3;
    bases2[2] = (hashBits(ix, iy + 1, iz, seed) & 15) * 3;
    bases2[3] = (hashBits(ix + 1, iy + 1, iz, seed) & 15) * 3;
    bases2[4] = (hashBits(ix, iy, iz + 1, seed) & 15) * 3;
    bases2[5] = (hashBits(ix + 1, iy, iz + 1, seed) & 15) * 3;
    bases2[6] = (hashBits(ix, iy + 1, iz + 1, seed) & 15) * 3;
    bases2[7] = (hashBits(ix + 1, iy + 1, iz + 1, seed) & 15) * 3;
  }
  const bases = cell.bases;
  let base = bases[0];
  const n000 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * fz;
  base = bases[1];
  const n100 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * fz;
  base = bases[2];
  const n010 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * fz;
  base = bases[3];
  const n110 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * fz;
  base = bases[4];
  const n001 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * (fz - 1);
  base = bases[5];
  const n101 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * fy + GRADIENTS[base + 2] * (fz - 1);
  base = bases[6];
  const n011 = GRADIENTS[base] * fx + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * (fz - 1);
  base = bases[7];
  const n111 = GRADIENTS[base] * (fx - 1) + GRADIENTS[base + 1] * (fy - 1) + GRADIENTS[base + 2] * (fz - 1);
  const x00 = n000 + (n100 - n000) * ux;
  const x10 = n010 + (n110 - n010) * ux;
  const x01 = n001 + (n101 - n001) * ux;
  const x11 = n011 + (n111 - n011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}
function fbm(x, y, z, seed, octaves = 4) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0173;
  }
  return total / weight * 0.71;
}
function ridged(x, y, z, seed, octaves = 4) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const raw = 1 - Math.abs(gradientNoise(x * frequency, y * frequency, z * frequency, seed + octave * 1013) * 2.2);
    const band = raw < 0 ? 0 : raw;
    total += band * band * amplitude;
    weight += amplitude;
    amplitude *= 0.52;
    frequency *= 2.0173;
  }
  return total / weight;
}
function worleyBorder(x, y, z, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const cacheSlot = seed & NOISE_CELL_CACHE_SIZE - 1;
  let cell = worleyCellBySeed[cacheSlot];
  if (!cell || cell.seed !== seed) {
    cell = { seed, x: NaN, y: NaN, z: NaN, points: new Float64Array(27 * 3) };
    worleyCellBySeed[cacheSlot] = cell;
  }
  if (cell.x !== ix || cell.y !== iy || cell.z !== iz) {
    cell.x = ix;
    cell.y = iy;
    cell.z = iz;
    let cursor = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ix + dx;
          const cy = iy + dy;
          const cz = iz + dz;
          cell.points[cursor] = cx + hashBits(cx, cy, cz, seed) / 4294967296;
          cell.points[cursor + 1] = cy + hashBits(cx, cy, cz, seed + 31) / 4294967296;
          cell.points[cursor + 2] = cz + hashBits(cx, cy, cz, seed + 67) / 4294967296;
          cursor += 3;
        }
      }
    }
  }
  let first = Infinity;
  let second = Infinity;
  const points = cell.points;
  for (let cursor = 0; cursor < points.length; cursor += 3) {
    const ex = x - points[cursor];
    const ey = y - points[cursor + 1];
    const ez = z - points[cursor + 2];
    const squared = ex * ex + ey * ey + ez * ez;
    if (squared < first) {
      second = first;
      first = squared;
    } else if (squared < second) second = squared;
  }
  return Math.sqrt(second) - Math.sqrt(first);
}
var worleyCellBySeed = new Array(NOISE_CELL_CACHE_SIZE);
function normalize([x, y, z]) {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / length, y / length, z / length];
}
function smax(a, b, k) {
  if (k <= 0) return a > b ? a : b;
  const difference = a - b;
  const spread = difference < 0 ? -difference : difference;
  const h = k - spread;
  if (h <= 0) return a > b ? a : b;
  return (a > b ? a : b) + h * h / (k * 4);
}
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const difference = a - b;
  const spread = difference < 0 ? -difference : difference;
  const h = k - spread;
  if (h <= 0) return a < b ? a : b;
  return (a < b ? a : b) - h * h / (k * 4);
}
function boxoid(x, y, z, rx, ry, rz) {
  const ax = x / rx;
  const ay = y / ry;
  const az = z / rz;
  const sx = ax * ax;
  const sy = ay * ay;
  const sz = az * az;
  const sum = sx * sx + sy * sy + sz * sz;
  const normalized = Math.sqrt(Math.sqrt(sum));
  const smallest = rx < ry ? rx < rz ? rx : rz : ry < rz ? ry : rz;
  return (normalized - 1) * smallest;
}

// .local-reference/vibe3d/assets/terrain/glacial-granite-boulder/field.ts
var DOMAIN_TO_METRES_X = 1.82;
var FORMATIONS = [
  "erratic",
  "prow",
  "arch",
  "tor",
  "bench",
  "monolith"
];
function formationOf(seed) {
  const normalized = Math.max(1, Math.floor(seed));
  return FORMATIONS[(normalized - 1) % FORMATIONS.length];
}
var massParameterCache = /* @__PURE__ */ new Map();
var lastMassSeed = Number.NaN;
var lastMassParameters;
function buildMassParameters(seed) {
  const formation = formationOf(seed);
  const pick = (index) => hash01(seed, index, 77, 625341585);
  const envelopes = {
    erratic: [0.88, 0.74, 0.79],
    prow: [0.72, 0.88, 0.6],
    arch: [0.92, 0.78, 0.48],
    tor: [0.86, 0.7, 0.76],
    bench: [0.98, 0.52, 0.76],
    monolith: [0.56, 0.96, 0.54]
  };
  const envelope = envelopes[formation];
  const radii = [
    envelope[0] + (pick(1) - 0.5) * 0.08,
    envelope[1] + (pick(2) - 0.5) * 0.07,
    envelope[2] + (pick(3) - 0.5) * 0.08
  ];
  const facets = [];
  const addFacet = (normal, support, blend) => {
    const unit = normalize(normal);
    const extent = Math.sqrt(
      (unit[0] * radii[0]) ** 2 + (unit[1] * radii[1]) ** 2 + (unit[2] * radii[2]) ** 2
    );
    facets.push(unit[0], unit[1], unit[2], extent * support, blend);
  };
  const jointSets = [
    normalize([0.96, 0.12, -0.25]),
    normalize([-0.19, 0.07, 0.98]),
    normalize([0.44, 0.34, 0.83])
  ];
  for (let set = 0; set < jointSets.length; set += 1) {
    const axis = jointSets[set];
    for (const sign of [1, -1]) {
      const jitter = 0.16;
      for (let step = 0; step < 2; step += 1) {
        const wobble = (index) => (pick(set * 20 + step * 5 + index) - 0.5) * jitter;
        addFacet(
          [
            axis[0] * sign + wobble(1),
            axis[1] * sign + wobble(2),
            axis[2] * sign + wobble(3)
          ],
          0.62 + pick(set * 30 + step * 3 + (sign > 0 ? 0 : 1)) * 0.26,
          // Near-hard arrises. Frost-shattered granite has not been abraded.
          2e-3 + pick(set * 40 + step) * 6e-3
        );
      }
    }
  }
  const breakCount = formation === "arch" ? 14 : formation === "tor" ? 20 : 30;
  for (let index = 0; index < breakCount; index += 1) {
    const theta = index / breakCount * Math.PI * 2 + pick(100 + index) * 0.9;
    const rise = -0.3 + pick(120 + index) * 1.25;
    addFacet(
      [Math.cos(theta), rise, Math.sin(theta)],
      0.55 + pick(140 + index) * 0.29,
      12e-4 + pick(160 + index) * 35e-4
    );
  }
  addFacet([0.03, -0.99, -0.05], 0.6, 4e-3);
  const scarCount = formation === "arch" ? 5 : formation === "monolith" ? 7 : 10;
  const scars = new Float64Array(scarCount * 9);
  for (let index = 0; index < scarCount; index += 1) {
    const theta = 0.7 + index * 1.29 + pick(200 + index) * 0.7;
    const radius = 0.2 + pick(220 + index) * 0.22;
    const distance = 0.98 + radius * (0.72 + pick(240 + index) * 0.3);
    const yaw = pick(320 + index) * Math.PI;
    scars[index * 9] = Math.cos(theta) * distance;
    scars[index * 9 + 1] = -0.2 + pick(260 + index) * 0.78;
    scars[index * 9 + 2] = Math.sin(theta) * distance;
    scars[index * 9 + 3] = radius;
    scars[index * 9 + 4] = radius * (0.5 + pick(280 + index) * 0.7);
    scars[index * 9 + 5] = radius * (0.6 + pick(290 + index) * 0.8);
    scars[index * 9 + 6] = 2e-3 + pick(300 + index) * 8e-3;
    scars[index * 9 + 7] = Math.cos(yaw);
    scars[index * 9 + 8] = Math.sin(yaw);
  }
  const lobeCount = formation === "arch" ? 2 : formation === "tor" ? 6 : 4;
  const lobes = new Float64Array(lobeCount * 8);
  for (let index = 0; index < lobeCount; index += 1) {
    const theta = 1.9 + index * 1.65 + pick(340 + index) * 0.9;
    const radius = 0.15 + pick(360 + index) * 0.13;
    const yaw = pick(440 + index) * Math.PI;
    lobes[index * 8] = Math.cos(theta) * (0.34 + pick(380 + index) * 0.22);
    lobes[index * 8 + 1] = -0.22 + pick(400 + index) * 0.5;
    lobes[index * 8 + 2] = Math.sin(theta) * (0.32 + pick(420 + index) * 0.22);
    lobes[index * 8 + 3] = radius;
    lobes[index * 8 + 4] = radius * (0.55 + pick(430 + index) * 0.7);
    lobes[index * 8 + 5] = radius * (0.7 + pick(435 + index) * 0.6);
    lobes[index * 8 + 6] = Math.cos(yaw);
    lobes[index * 8 + 7] = Math.sin(yaw);
  }
  return {
    formation,
    radii,
    facets: new Float64Array(facets),
    facetCount: facets.length / 5,
    scars,
    scarCount,
    lobes,
    lobeCount
  };
}
function ellipsoid(x, y, z, rx, ry, rz) {
  const nx = x / rx;
  const ny = y / ry;
  const nz = z / rz;
  return (Math.sqrt(nx * nx + ny * ny + nz * nz) - 1) * Math.min(rx, ry, rz);
}
function massParameters(seed) {
  if (seed === lastMassSeed) return lastMassParameters;
  let cached = massParameterCache.get(seed);
  if (!cached) {
    cached = buildMassParameters(seed);
    massParameterCache.set(seed, cached);
  }
  lastMassSeed = seed;
  lastMassParameters = cached;
  return cached;
}
function facetCount(seed) {
  return massParameters(seed).facetCount;
}
function graniteGpuParameters(seed) {
  const parameters = massParameters(Math.max(1, Math.floor(seed)));
  return {
    formation: FORMATIONS.indexOf(parameters.formation),
    radii: parameters.radii,
    facets: parameters.facets,
    facetCount: parameters.facetCount,
    scars: parameters.scars,
    scarCount: parameters.scarCount,
    lobes: parameters.lobes,
    lobeCount: parameters.lobeCount
  };
}
function massSdf(x, y, z, seed) {
  const parameters = massParameters(seed);
  const radii = parameters.radii;
  const leanX = x + y * 0.07;
  const leanZ = z - y * 0.09;
  const taper = 1 - Math.max(-0.1, Math.min(0.24, y * 0.26));
  let distance;
  switch (parameters.formation) {
    case "arch": {
      distance = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2]);
      break;
    }
    case "tor": {
      const base = boxoid(leanX + 0.12, y + 0.24, leanZ, radii[0] * 0.9, radii[1] * 0.7, radii[2]);
      const crown = boxoid(leanX - 0.18, y - 0.34, leanZ + 0.08, radii[0] * 0.68, radii[1] * 0.48, radii[2] * 0.82);
      const shoulder = boxoid(leanX + 0.38, y - 0.05, leanZ - 0.12, radii[0] * 0.42, radii[1] * 0.5, radii[2] * 0.64);
      distance = smin(smin(base, crown, 0.045), shoulder, 0.035);
      break;
    }
    case "bench": {
      const body = boxoid(leanX - 0.12, y + 0.18, leanZ, radii[0] * 0.82, radii[1] * 0.78, radii[2]);
      const shelf = boxoid(leanX + 0.16, y - 0.27, leanZ - 0.05, radii[0], radii[1] * 0.34, radii[2] * 0.82);
      distance = smin(body, shelf, 0.035);
      break;
    }
    case "prow": {
      const body = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2] * taper);
      const shoulder = boxoid(leanX - 0.28, y - 0.18, leanZ + 0.08, radii[0] * 0.55, radii[1] * 0.48, radii[2] * 0.78);
      distance = smin(body, shoulder, 0.04);
      break;
    }
    default:
      distance = boxoid(leanX, y, leanZ, radii[0] * taper, radii[1], radii[2] * taper);
  }
  const facets = parameters.facets;
  for (let index = 0; index < parameters.facetCount; index += 1) {
    const offset = index * 5;
    const plane = x * facets[offset] + y * facets[offset + 1] + z * facets[offset + 2] - facets[offset + 3];
    distance = smax(distance, plane, facets[offset + 4]);
  }
  const lobes = parameters.lobes;
  for (let index = 0; index < parameters.lobeCount; index += 1) {
    const offset = index * 8;
    const lx = x - lobes[offset];
    const lz = z - lobes[offset + 2];
    const cos = lobes[offset + 6];
    const sin = lobes[offset + 7];
    distance = smin(distance, boxoid(
      lx * cos - lz * sin,
      y - lobes[offset + 1],
      lx * sin + lz * cos,
      lobes[offset + 3],
      lobes[offset + 4],
      lobes[offset + 5]
    ), 0.05);
  }
  const scars = parameters.scars;
  for (let index = 0; index < parameters.scarCount; index += 1) {
    const offset = index * 9;
    const sx = x - scars[offset];
    const sz = z - scars[offset + 2];
    const cos = scars[offset + 7];
    const sin = scars[offset + 8];
    distance = smax(distance, -boxoid(
      sx * cos - sz * sin,
      y - scars[offset + 1],
      sx * sin + sz * cos,
      scars[offset + 3],
      scars[offset + 4],
      scars[offset + 5]
    ), scars[offset + 6]);
  }
  if (parameters.formation === "arch") {
    const openingX = (hash01(seed, 901, 77, 625341585) - 0.5) * 0.12;
    const shaft = boxoid(x - openingX, y + 0.62, z, 0.36, 0.43, 0.72);
    const crown = ellipsoid(x - openingX, y + 0.14, z, 0.43, 0.43, 0.72);
    distance = smax(distance, -smin(shaft, crown, 0.025), 8e-3);
  }
  return distance;
}
var BANDS = [
  {
    // Buttresses and gullies across whole faces. Ridged, so faces meet at
    // creased spines instead of rolling into one another.
    name: "macro-buttress",
    wavelength: 0.72,
    amplitude: 0.052,
    evaluate: (x, y, z, seed) => {
      const wx = x + fbm(x * 1.05 + 3.1, y * 1.05, z * 1.05, seed + 11, 3) * 0.4;
      const wy = y + fbm(x * 1, y * 1 - 5.7, z * 1, seed + 43, 3) * 0.3;
      const wz = z + fbm(x * 1.1, y * 1.1, z * 1.1 + 8.4, seed + 79, 3) * 0.4;
      const spine = ridged(wx * 1.75, wy * 1.35, wz * 1.75, seed + 137, 3);
      const broad = fbm(wx * 1.5, wy * 1.25, wz * 1.5, seed + 101, 3) * 2;
      return broad * 0.42 + (spine - 0.4) * 1.15;
    }
  },
  {
    // Joint blocks at decimetre scale. The cellular term dominates, so this
    // band cuts the faces into stepped plates with hard borders.
    name: "meso-jointing",
    wavelength: 0.23,
    amplitude: 0.017,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 2.9 + 6.7, y * 2.9, z * 2.9, seed + 307, 3) * 0.26;
      const cells = worleyBorder((x + warp) * 5.4, y * 4.3, (z - warp) * 5.4, seed + 389);
      const plate = 1 - Math.min(1, cells / 0.44);
      const spine = ridged((x + warp) * 4.6, y * 3.9, (z + warp) * 4.6, seed + 421, 2);
      const broken = fbm((x + warp) * 5.6, (y - warp * 0.45) * 4.4, (z + warp) * 5.6, seed + 347, 3) * 2;
      return broken * 0.34 + (spine - 0.42) * 0.7 - plate * plate * 0.62;
    }
  },
  {
    // Frost-shattered chip scars and exfoliation sheeting. Strongly creased,
    // and stratified in Y so it reads as bedding rather than uniform lumpiness.
    name: "fine-shatter",
    wavelength: 0.085,
    amplitude: 55e-4,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 7 + 1.3, y * 7, z * 7, seed + 503, 2) * 0.14;
      const chips = worleyBorder((x + warp) * 14.5, y * 11.5, (z - warp) * 14.5, seed + 541);
      const scar = 1 - Math.min(1, chips / 0.42);
      const bedding = ridged(x * 6.5, y * 21.5, z * 6.5, seed + 577, 2);
      const grit = fbm(x * 13.5, y * 13.5, z * 13.5, seed + 613, 3) * 2;
      return grit * 0.36 - scar * scar * 0.62 - (bedding - 0.4) * 0.5;
    }
  }
];
function octaveBudget(cells) {
  const voxel = 2 / cells;
  const minimumWavelength = voxel * 3;
  return {
    cells,
    voxel,
    minimumWavelength,
    bands: BANDS.filter((band) => band.wavelength >= minimumWavelength).map((band) => band.name),
    bakeOnly: BANDS.filter((band) => band.wavelength < minimumWavelength).map((band) => band.name)
  };
}
function displacement(x, y, z, seed, minimumWavelength = 0) {
  let total = 0;
  for (let index = 0; index < BANDS.length; index += 1) {
    const band = BANDS[index];
    if (band.wavelength < minimumWavelength) continue;
    total += band.evaluate(x, y, z, seed) * band.amplitude;
  }
  return total;
}
function microRelief(x, y, z, seed) {
  const grain = fbm(x * 44, y * 44, z * 44, seed + 701, 3) * 2;
  const crystal = ridged(x * 72, y * 72, z * 72, seed + 743, 2);
  const flake = worleyBorder(x * 56, y * 56, z * 56, seed + 787);
  const pit = 1 - Math.min(1, flake / 0.36);
  return grain * 21e-4 + (crystal - 0.42) * 17e-4 - pit * pit * 18e-4;
}
function surfaceSdf(x, y, z, seed, minimumWavelength = 0) {
  return massSdf(x, y, z, seed) - displacement(x, y, z, seed, minimumWavelength);
}
function detailedSdf(x, y, z, seed) {
  return massSdf(x, y, z, seed) - displacement(x, y, z, seed, 0) - microRelief(x, y, z, seed);
}
function detailedNormal(x, y, z, seed, step) {
  return detailedNormalInto(x, y, z, seed, step, [0, 0, 0]);
}
function detailedNormalInto(x, y, z, seed, step, output) {
  const base = detailedSdf(x + step, y + step, z + step, seed);
  const dx = detailedSdf(x + step, y - step, z - step, seed);
  const dy = detailedSdf(x - step, y + step, z - step, seed);
  const dz = detailedSdf(x - step, y - step, z + step, seed);
  let nx = base + dx - dy - dz;
  let ny = base - dx + dy - dz;
  let nz = base - dx - dy + dz;
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length < 1e-12) {
    output[0] = 0;
    output[1] = 1;
    output[2] = 0;
    return output;
  }
  output[0] = nx / length;
  output[1] = ny / length;
  output[2] = nz / length;
  return output;
}
var graniteMeshField = {
  sdf: surfaceSdf,
  octaveBudget
};
var graniteDetailField = {
  sdf: detailedSdf,
  normal: detailedNormal,
  normalInto: detailedNormalInto
};
function fieldDiagnostics(seed, minimumWavelength = 0, samples = 2e4) {
  const step = 1e-3;
  let peak = 0;
  let gradientSum = 0;
  let gradientMax = 0;
  let folded = 0;
  let counted = 0;
  for (let index = 0; index < samples; index += 1) {
    const x = hash01(index, 1, seed, 458671337) * 2 - 1;
    const y = hash01(index, 2, seed, 458671337) * 2 - 1;
    const z = hash01(index, 3, seed, 458671337) * 2 - 1;
    peak = Math.max(peak, Math.abs(displacement(x, y, z, seed, minimumWavelength)));
    if (Math.abs(massSdf(x, y, z, seed)) > 0.12) continue;
    const dx = displacement(x + step, y, z, seed, minimumWavelength) - displacement(x - step, y, z, seed, minimumWavelength);
    const dy = displacement(x, y + step, z, seed, minimumWavelength) - displacement(x, y - step, z, seed, minimumWavelength);
    const dz = displacement(x, y, z + step, seed, minimumWavelength) - displacement(x, y, z - step, seed, minimumWavelength);
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz) / (2 * step);
    gradientSum += magnitude;
    gradientMax = Math.max(gradientMax, magnitude);
    if (magnitude > 1) folded += 1;
    counted += 1;
  }
  return {
    peakDisplacement: peak,
    meanNearSurfaceGradient: counted === 0 ? 0 : gradientSum / counted,
    maximumNearSurfaceGradient: gradientMax,
    foldedFraction: counted === 0 ? 0 : folded / counted
  };
}
export {
  DOMAIN_TO_METRES_X,
  detailedNormal,
  detailedNormalInto,
  detailedSdf,
  displacement,
  facetCount,
  fbm,
  fieldDiagnostics,
  formationOf,
  graniteDetailField,
  graniteGpuParameters,
  graniteMeshField,
  hash01,
  massSdf,
  microRelief,
  normalize,
  octaveBudget,
  ridged,
  surfaceSdf,
  worleyBorder
};
