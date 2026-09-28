import { createHash } from 'node:crypto';

export const C8_COHORT_SURFACE_PACKAGE_SCHEMA = 'toonlab/c8-cohort-surface-package';
export const C8_COHORT_SURFACE_PACKAGE_VERSION = 1;
export const C8_COHORT_SURFACE_OPERATOR_REVISION = 'cohort03-r03-plus-cohort04-pass-r03-plus-cohort05-pass-r01-plus-cohort06-pass-r01-plus-cohort07-credible-r04';
export const C8_COHORT_SURFACE_MAP_ROLES = Object.freeze([
  'baseColor', 'normalGL', 'height', 'heightMicro', 'ao', 'roughness', 'smoothness', 'orm',
]);

const TAU = Math.PI * 2;
const SHA256 = /^[a-f0-9]{64}$/;

export const C8_COHORT03_ACCEPTED_PROFILES = Object.freeze({
  'schist-phyllite-cleavage': Object.freeze({
    colors: [[67, 78, 79], [157, 167, 163]], family: 'metamorphic-cleavage', heightSpanMetres: 0.011,
    operatorId: 'penetrative-phyllite-cleavage', roughness: [0.43, 0.78], repeats: 3.25,
  }),
  'basalt-mafic-cooling': Object.freeze({
    colors: [[39, 48, 49], [116, 126, 116]], family: 'mafic-volcanic', heightSpanMetres: 0.018,
    operatorId: 'pillow-basalt-rinds-vesicles', roughness: [0.58, 0.87], repeats: 3.35,
  }),
  'viscous-lava-spine': Object.freeze({
    colors: [[53, 48, 47], [145, 130, 120]], family: 'viscous-volcanic', heightSpanMetres: 0.022,
    operatorId: 'steep-viscous-lava-shear', roughness: [0.61, 0.89], repeats: 3.45,
  }),
  'kaibab-limestone-ledge': Object.freeze({
    colors: [[145, 139, 121], [221, 213, 190]], family: 'solution-carbonate', heightSpanMetres: 0.024,
    operatorId: 'carbonate-solution-flutes-rills-pits',
    operatorIds: Object.freeze(['carbonate-solution-flutes-rills-pits', 'platy-limestone-fracture-laminae']),
    roughness: [0.68, 0.94], repeats: 3.35,
  }),
  'gneiss-foliated': Object.freeze({
    colors: [[78, 82, 87], [202, 196, 181]], family: 'metamorphic-foliation', heightSpanMetres: 0.018,
    operatorId: 'warped-compositional-gneiss-foliation', roughness: [0.54, 0.84], repeats: 3.45,
  }),
  'soft-bedded-mudstone': Object.freeze({
    colors: [[118, 69, 39], [210, 151, 94]], family: 'weak-sedimentary', heightSpanMetres: 0.016,
    operatorId: 'irregular-discontinuous-mudstone-beds', roughness: [0.72, 0.96], repeats: 3.55,
  }),
  'silicic-lava-flow-banded': Object.freeze({
    colors: [[82, 58, 52], [190, 151, 128]], family: 'silicic-flow-banded', heightSpanMetres: 0.020,
    operatorId: 'curvilinear-silicic-flow-bands', roughness: [0.55, 0.84], repeats: 3.60,
  }),
  'neutral-sedimentary-bedded': Object.freeze({
    colors: [[106, 99, 84], [205, 193, 164]], family: 'folded-sedimentary', heightSpanMetres: 0.018,
    operatorId: 'asset-fold-arc-bedding', roughness: [0.66, 0.92], repeats: 3.55,
  }),
  'weathered-monzogranite': Object.freeze({
    colors: [[91, 82, 75], [196, 172, 148]], family: 'weathered-coarse-crystalline', heightSpanMetres: 0.015,
    operatorId: 'broad-granular-monzogranite-weathering', roughness: [0.58, 0.9], repeats: 3.2,
  }),
  'coarse-granite-jointed': Object.freeze({
    colors: [[78, 79, 77], [199, 188, 172]], family: 'coarse-crystalline-jointed', heightSpanMetres: 0.021,
    operatorId: 'coarse-granite-jointed', roughness: [0.56, 0.9], repeats: 3.15,
  }),
  'granite-exfoliation-dome': Object.freeze({
    colors: [[93, 85, 81], [205, 185, 166]], family: 'granite-sheet-exfoliation', heightSpanMetres: 0.018,
    operatorId: 'granite-exfoliation-sheet-weathering', roughness: [0.55, 0.88], repeats: 3.1,
  }),
  'jointed-sandstone-spire': Object.freeze({
    colors: [[104, 57, 38], [219, 157, 103]], family: 'jointed-resistant-sandstone', heightSpanMetres: 0.019,
    operatorId: 'vertical-sandstone-joints-bedding', roughness: [0.66, 0.94], repeats: 3.4,
  }),
  'travertine-depositional-terrace': Object.freeze({
    colors: [[143, 113, 76], [238, 223, 184]], family: 'carbonate-precipitate-terrace', heightSpanMetres: 0.014,
    operatorId: 'travertine-flow-rims-porosity', roughness: [0.48, 0.88], repeats: 3.25,
  }),
  'jointed-granodiorite-mass': Object.freeze({
    colors: [[68, 70, 67], [194, 189, 176]], family: 'massive-jointed-granodiorite', heightSpanMetres: 0.02,
    operatorId: 'granodiorite-block-joints-mineral-weathering', roughness: [0.57, 0.9], repeats: 3.15,
  }),
  'schist-erosional-bench': Object.freeze({
    colors: [[61, 52, 49], [151, 125, 101]], family: 'foliated-schist-bench', heightSpanMetres: 0.017,
    operatorId: 'schist-cleavage-bench-joints-oxidation', roughness: [0.64, 0.93], repeats: 3.5,
  }),
  'coastal-granite-sea-cliff': Object.freeze({
    colors: [[74, 72, 68], [196, 185, 166]], family: 'salt-weathered-coastal-granite', heightSpanMetres: 0.02,
    operatorId: 'coastal-granite-joints-salt-pitting', roughness: [0.59, 0.92], repeats: 3.2,
  }),
  'humid-limestone-karst-towers': Object.freeze({
    colors: [[55, 69, 65], [176, 180, 160]], family: 'humid-solution-limestone', heightSpanMetres: 0.023,
    operatorId: 'humid-karst-karren-rills-dampness', roughness: [0.67, 0.95], repeats: 3.4,
  }),
  'granite-tor-block-joints': Object.freeze({
    colors: [[72, 71, 68], [190, 177, 158]], family: 'jointed-granite-tor', heightSpanMetres: 0.021,
    operatorId: 'coarse-granite-jointed', roughness: [0.57, 0.91], repeats: 3.15,
  }),
  'columnar-basalt-cliff': Object.freeze({
    colors: [[38, 45, 46], [119, 126, 118]], family: 'columnar-mafic-cliff', heightSpanMetres: 0.019,
    operatorId: 'columnar-basalt-cooling-joints-talus', roughness: [0.63, 0.92], repeats: 3.35,
  }),
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const lerp = (a, b, t) => a + ((b - a) * t);
const smoothstep = (a, b, value) => {
  const t = clamp01((value - a) / Math.max(1e-9, b - a));
  return t * t * (3 - (2 * t));
};
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
export const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const sha256Stable = (value) => sha256Bytes(Buffer.from(stableJson(value)));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function integerHash(seed, salt) {
  let value = (Number(seed) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function phase(seed, salt) {
  return (integerHash(seed, salt) / 4294967296) * TAU;
}

function wave(u, v, fu, fv, p) {
  return Math.sin(TAU * ((u * fu) + (v * fv)) + p);
}

function periodicNoise(u, v, seed, terms) {
  let sum = 0;
  let weights = 0;
  for (let index = 0; index < terms.length; index += 1) {
    const [fu, fv, weight] = terms[index];
    sum += wave(u, v, fu, fv, phase(seed, index + 17)) * weight;
    weights += Math.abs(weight);
  }
  return sum / Math.max(weights, 1e-9);
}

function latticeUnit(x, y, period, seed) {
  const wrappedX = ((x % period) + period) % period;
  const wrappedY = ((y % period) + period) % period;
  return integerHash(seed, wrappedX + (wrappedY * period)) / 4294967296;
}

function tileValueNoise(u, v, period, seed) {
  const sampleX = u * period;
  const sampleY = v * period;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const tx = sampleX - x0;
  const ty = sampleY - y0;
  const sx = tx * tx * (3 - (2 * tx));
  const sy = ty * ty * (3 - (2 * ty));
  const top = lerp(latticeUnit(x0, y0, period, seed), latticeUnit(x0 + 1, y0, period, seed), sx);
  const bottom = lerp(latticeUnit(x0, y0 + 1, period, seed), latticeUnit(x0 + 1, y0 + 1, period, seed), sx);
  return lerp(top, bottom, sy);
}

function tileValueFbm(u, v, period, seed) {
  const broad = tileValueNoise(u, v, period, seed);
  const fine = tileValueNoise(u, v, period * 2, seed + 53);
  const finest = tileValueNoise(u, v, period * 4, seed + 109);
  return (((broad * 0.56) + (fine * 0.3) + (finest * 0.14)) * 2) - 1;
}

function torusDistance(value, centre) {
  const distance = Math.abs(value - centre);
  return Math.min(distance, 1 - distance);
}

function points(seed, count, salt) {
  return Array.from({ length: count }, (_, index) => ({
    radius: lerp(0.045, 0.15, integerHash(seed, salt + (index * 11)) / 4294967296),
    u: integerHash(seed, salt + (index * 11) + 1) / 4294967296,
    v: integerHash(seed, salt + (index * 11) + 2) / 4294967296,
  }));
}

function nearestPoint(u, v, candidates, vScale = 1) {
  let nearest = Infinity;
  let radius = 0.1;
  for (const point of candidates) {
    const distance = Math.hypot(torusDistance(u, point.u), torusDistance(v, point.v) * vScale);
    if (distance < nearest) {
      nearest = distance;
      radius = point.radius;
    }
  }
  return { distance: nearest, radius };
}

function irregularCellBoundary(u, v, candidates, vScale = 1) {
  let nearest = Infinity;
  let second = Infinity;
  for (const point of candidates) {
    const distance = Math.hypot(torusDistance(u, point.u), torusDistance(v, point.v) * vScale);
    if (distance < nearest) {
      second = nearest;
      nearest = distance;
    } else if (distance < second) {
      second = distance;
    }
  }
  return 1 - smoothstep(0.006, 0.038, second - nearest);
}

function operatorSample(operatorId, u, v, seed, context) {
  const warpA = periodicNoise(u, v, seed + 101, [[1, 2, 0.58], [3, -1, 0.27], [2, 3, 0.15]]);
  const warpB = periodicNoise(u, v, seed + 131, [[2, 1, 0.52], [-1, 3, 0.31], [4, 2, 0.17]]);
  if (operatorId === 'penetrative-phyllite-cleavage') {
    const lamina = wave(u, v, 2, 11, phase(seed, 211) + (warpA * 0.75));
    const mica = wave(u, v, 5, 23, phase(seed, 223) + (warpB * 0.35));
    const seam = (1 - smoothstep(0.72, 0.97, Math.abs(lamina))) ** 2;
    return { cavity: seam * 0.16, color: (lamina * 0.72) + (mica * 0.18), height: (lamina * 0.25) - (seam * 0.18), roughness: (-mica * 0.18) + (seam * 0.08) };
  }
  if (operatorId === 'pillow-basalt-rinds-vesicles') {
    const nearest = nearestPoint(u, v, context.primary, 0.86);
    const radial = nearest.distance / nearest.radius;
    const rind = Math.exp(-(((radial - 1) / 0.18) ** 2));
    const vesicle = smoothstep(0.58, 0.86, periodicNoise(u, v, seed + 251, [[31, 37, 0.48], [47, -29, 0.32], [19, 53, 0.20]])) * smoothstep(0.2, 0.88, radial);
    return { cavity: (vesicle * 0.48) + (rind * 0.08), color: (rind * 0.74) - (vesicle * 0.28), height: (rind * 0.26) - (vesicle * 0.38), roughness: (rind * 0.22) + (vesicle * 0.18) };
  }
  if (operatorId === 'steep-viscous-lava-shear') {
    const shear = wave(u, v, 7, 2, phase(seed, 271) + (warpA * 1.05));
    const stretched = wave(u, v, 13, 3, phase(seed, 277) + (warpB * 0.42));
    const seam = smoothstep(0.66, 0.96, -shear) ** 1.7;
    return { cavity: seam * 0.46, color: (shear * 0.46) + (stretched * 0.18) - (seam * 0.32), height: (shear * 0.22) + (stretched * 0.08) - (seam * 0.4), roughness: (seam * 0.26) + (stretched * 0.07) };
  }
  if (operatorId === 'carbonate-solution-flutes-rills-pits') {
    const flute = wave(u, v, 9, 0, phase(seed, 293) + (warpA * 0.72));
    const rill = smoothstep(0.42, 0.94, flute) ** 1.5;
    const nearest = nearestPoint(u, v, context.secondary, 1.28);
    const pit = Math.exp(-((nearest.distance / (nearest.radius * 0.46)) ** 2));
    return { cavity: pit * 0.55, color: (rill * 0.56) - (pit * 0.68), height: (rill * 0.3) - (pit * 0.56), roughness: (rill * 0.17) + (pit * 0.24) };
  }
  if (operatorId === 'warped-compositional-gneiss-foliation') {
    const foliation = wave(u, v, 3, 7, phase(seed, 331) + (warpA * 1.45));
    const secondary = wave(u, v, 5, 12, phase(seed, 337) + (warpB * 0.75));
    const lightBand = smoothstep(0.24, 0.88, (foliation * 0.72) + (secondary * 0.28));
    return { cavity: (1 - lightBand) * 0.09, color: (foliation * 0.82) + (secondary * 0.24), height: (foliation * 0.18) + (secondary * 0.07), roughness: (-foliation * 0.17) + (secondary * 0.05) };
  }
  if (operatorId === 'irregular-discontinuous-mudstone-beds') {
    const coordinate = (9 * v) + (warpA * 0.92) + (wave(u, v, 2, 0, phase(seed, 353)) * 0.31);
    const bed = Math.sin(TAU * coordinate + phase(seed, 359));
    const resistant = smoothstep(0.44, 0.9, bed);
    const continuity = smoothstep(-0.18, 0.58, warpB + (wave(u, v, 1, 2, phase(seed, 367)) * 0.35));
    return { cavity: (1 - continuity) * resistant * 0.18, color: (bed * 0.38) + (resistant * continuity * 0.45), height: (bed * 0.16) + (resistant * continuity * 0.34), roughness: (-(resistant * continuity) * 0.15) + ((1 - continuity) * 0.1) };
  }
  if (operatorId === 'curvilinear-silicic-flow-bands') {
    const curve = (5 * u) + (4 * v) + (warpA * 1.34) + (wave(u, v, 1, -1, phase(seed, 383)) * 0.72);
    const flow = Math.sin(TAU * curve + phase(seed, 389));
    const harmonic = wave(u, v, 11, 9, phase(seed, 397) + (warpB * 0.62));
    const glassy = smoothstep(0.48, 0.92, flow);
    return { cavity: (1 - glassy) * 0.08, color: (flow * 0.62) + (harmonic * 0.14), height: (flow * 0.2) + (harmonic * 0.07), roughness: (-glassy * 0.21) + (harmonic * 0.05) };
  }
  if (operatorId === 'asset-fold-arc-bedding') {
    const arc = v + (Math.cos(TAU * u + phase(seed, 419)) * 0.145) + (Math.cos(TAU * 2 * u + phase(seed, 421)) * 0.047) + (warpA * 0.055);
    const bed = Math.sin(TAU * 8 * arc + phase(seed, 431));
    const competent = smoothstep(0.38, 0.88, bed);
    return { cavity: (1 - competent) * 0.1, color: (bed * 0.52) + (competent * 0.22), height: (bed * 0.17) + (competent * 0.19), roughness: (-competent * 0.14) + (warpB * 0.05) };
  }
  if (operatorId === 'broad-granular-monzogranite-weathering') {
    const nearest = nearestPoint(u, v, context.primary, 1.04);
    const grainCell = clamp01(1 - (nearest.distance / Math.max(nearest.radius, 1e-6)));
    const mineralDomain = periodicNoise(u, v, seed + 461, [[2, 3, 0.52], [-3, 4, 0.31], [5, 2, 0.17]]);
    const feldspar = smoothstep(-0.38, 0.64, mineralDomain + (warpA * 0.28));
    const quartz = smoothstep(0.24, 0.82, (-mineralDomain * 0.72) + (warpB * 0.46));
    const broadWeathering = periodicNoise(u, v, seed + 479, [[1, 2, 0.63], [2, -1, 0.37]]);
    const relictJoint = smoothstep(0.86, 0.98, Math.abs(wave(u, v, 2, 1, phase(seed, 487) + (warpA * 0.7))));
    return {
      cavity: (relictJoint * 0.22) + ((1 - grainCell) * 0.045),
      color: (feldspar * 0.38) + (quartz * 0.22) + (broadWeathering * 0.36) - (relictJoint * 0.16),
      height: (grainCell * 0.1) + (feldspar * 0.07) + (quartz * 0.04) + (broadWeathering * 0.14) - (relictJoint * 0.26),
      roughness: ((1 - quartz) * 0.12) + (broadWeathering * 0.08) + (relictJoint * 0.16),
    };
  }
  if (operatorId === 'platy-limestone-fracture-laminae') {
    const coordinate = (3 * u) + (8 * v) + (warpA * 0.48);
    const lamina = Math.sin(TAU * coordinate + phase(seed, 503));
    const discontinuity = smoothstep(-0.12, 0.62, warpB + (wave(u, v, 1, -2, phase(seed, 509)) * 0.38));
    const stylolite = (smoothstep(0.74, 0.97, -lamina) ** 1.6) * discontinuity;
    const nearest = nearestPoint(u, v, context.secondary, 1.1);
    const sparsePit = Math.exp(-((nearest.distance / (nearest.radius * 0.34)) ** 2));
    return {
      cavity: (stylolite * 0.28) + (sparsePit * 0.15),
      color: (lamina * 0.2) + (discontinuity * 0.12) - (stylolite * 0.28) - (sparsePit * 0.12),
      height: (lamina * 0.08) + (discontinuity * 0.05) - (stylolite * 0.24) - (sparsePit * 0.12),
      roughness: (stylolite * 0.16) + (sparsePit * 0.11) + (warpA * 0.04),
    };
  }
  if (operatorId === 'coarse-granite-jointed') {
    const nearest = nearestPoint(u, v, context.primary, 1.16);
    const grainInterior = clamp01(1 - (nearest.distance / Math.max(nearest.radius, 1e-6)));
    const mineral = periodicNoise(u, v, seed + 541, [[2, 3, 0.48], [-4, 1, 0.29], [5, 4, 0.23]]);
    const quartz = smoothstep(0.28, 0.84, mineral + (warpB * 0.32));
    const feldspar = smoothstep(-0.42, 0.52, (-mineral * 0.63) + (warpA * 0.41));
    const jointA = smoothstep(0.91, 0.987,
      Math.abs(wave(u, v, 1, 3, phase(seed, 557) + (warpA * 0.58))));
    const jointB = smoothstep(0.925, 0.99,
      Math.abs(wave(u, v, 4, -1, phase(seed, 563) + (warpB * 0.51))));
    const joint = clamp01(Math.max(jointA, jointB) * (0.72 + (0.28 * smoothstep(-0.6, 0.72, warpA))));
    const oxidation = smoothstep(0.18, 0.86,
      periodicNoise(u, v, seed + 571, [[1, 2, 0.67], [3, -1, 0.33]]) + (joint * 0.4));
    return {
      cavity: (joint * 0.46) + ((1 - grainInterior) * 0.035),
      color: (feldspar * 0.32) + (quartz * 0.18) + (oxidation * 0.25) - (joint * 0.38),
      height: (grainInterior * 0.1) + (feldspar * 0.08) + (quartz * 0.045) - (joint * 0.48),
      roughness: ((1 - quartz) * 0.11) + (oxidation * 0.08) + (joint * 0.22),
    };
  }
  if (operatorId === 'granite-exfoliation-sheet-weathering') {
    const mineral = periodicNoise(u, v, seed + 601, [[2, 3, 0.46], [-3, 5, 0.31], [6, 1, 0.23]]);
    const sheetCoordinate = (3.2 * v)
      + (Math.cos(TAU * u + phase(seed, 607)) * 0.36)
      + (Math.cos(TAU * 2 * u + phase(seed, 613)) * 0.12)
      + (warpA * 0.22);
    const sheetWave = Math.sin(TAU * sheetCoordinate + phase(seed, 617));
    const openSheet = (smoothstep(0.76, 0.975, -sheetWave) ** 1.8)
      * smoothstep(-0.48, 0.72, warpB + (wave(u, v, 1, -1, phase(seed, 619)) * 0.3));
    const feldspar = smoothstep(-0.38, 0.62, mineral + (warpB * 0.24));
    const weathering = periodicNoise(u, v, seed + 631, [[1, 2, 0.7], [2, -1, 0.3]]);
    return {
      cavity: (openSheet * 0.4) + ((1 - feldspar) * 0.025),
      color: (feldspar * 0.28) + (weathering * 0.34) - (openSheet * 0.27),
      height: (feldspar * 0.07) + (sheetWave * 0.08) + (weathering * 0.11) - (openSheet * 0.42),
      roughness: ((1 - feldspar) * 0.09) + (openSheet * 0.19) + (weathering * 0.06),
    };
  }
  if (operatorId === 'vertical-sandstone-joints-bedding') {
    const bedCoordinate = (8.5 * v) + (warpA * 0.5) + (wave(u, v, 2, 0, phase(seed, 641)) * 0.16);
    const bed = Math.sin(TAU * bedCoordinate + phase(seed, 643));
    const resistantBed = smoothstep(0.34, 0.91, bed);
    const jointA = smoothstep(0.88, 0.985,
      Math.abs(wave(u, v, 3, 0, phase(seed, 647) + (warpB * 0.63))));
    const jointB = smoothstep(0.91, 0.99,
      Math.abs(wave(u, v, 5, 1, phase(seed, 653) + (warpA * 0.31))));
    const continuity = smoothstep(-0.34, 0.68,
      periodicNoise(u, v, seed + 659, [[1, 2, 0.66], [2, -1, 0.34]]));
    const joint = clamp01(Math.max(jointA * continuity, jointB * (1 - (continuity * 0.42))));
    const iron = smoothstep(0.08, 0.82, warpB + (bed * 0.2));
    return {
      cavity: (joint * 0.49) + ((1 - resistantBed) * 0.06),
      color: (bed * 0.22) + (iron * 0.31) - (joint * 0.35),
      height: (resistantBed * 0.16) + (bed * 0.07) - (joint * 0.5),
      roughness: ((1 - resistantBed) * 0.09) + (joint * 0.2) + (iron * 0.04),
    };
  }
  if (operatorId === 'travertine-flow-rims-porosity') {
    const flowCoordinate = (5.5 * v)
      + (Math.cos(TAU * u + phase(seed, 673)) * 0.31)
      + (warpA * 0.44);
    const flow = Math.sin(TAU * flowCoordinate + phase(seed, 677));
    const rim = smoothstep(0.57, 0.94, flow) ** 1.35;
    const drape = wave(u, v, 2, 7, phase(seed, 683) + (warpB * 0.54));
    const nearest = nearestPoint(u, v, context.secondary, 1.18);
    const pore = Math.exp(-((nearest.distance / (nearest.radius * 0.31)) ** 2));
    const wetPatch = smoothstep(0.22, 0.86,
      periodicNoise(u, v, seed + 691, [[1, 2, 0.62], [-2, 3, 0.38]]) + (rim * 0.18));
    return {
      cavity: (pore * 0.38) + ((1 - rim) * Math.max(0, -drape) * 0.1),
      color: (rim * 0.32) + (drape * 0.12) - (pore * 0.22) - (wetPatch * 0.14),
      height: (rim * 0.24) + (drape * 0.06) - (pore * 0.31),
      roughness: (pore * 0.18) - (wetPatch * 0.17) + ((1 - rim) * 0.07),
    };
  }
  if (operatorId === 'granodiorite-block-joints-mineral-weathering') {
    const mineral = periodicNoise(u, v, seed + 701, [[2, 3, 0.45], [-4, 1, 0.32], [5, 6, 0.23]]);
    const quartz = smoothstep(0.23, 0.84, mineral + (warpB * 0.28));
    const feldspar = smoothstep(-0.48, 0.55, (-mineral * 0.66) + (warpA * 0.35));
    const continuity = smoothstep(-0.42, 0.7,
      periodicNoise(u, v, seed + 727, [[1, 2, 0.63], [-2, 1, 0.37]]));
    const blockBoundary = irregularCellBoundary(
      u + (warpA * 0.018), v + (warpB * 0.018), context.primary, 0.86,
    );
    const joint = clamp01(blockBoundary * (0.34 + (continuity * 0.66)));
    const oxidation = smoothstep(0.18, 0.85, warpA + (joint * 0.38));
    return {
      cavity: (joint * 0.5) + ((1 - feldspar) * 0.025),
      color: (feldspar * 0.28) + (quartz * 0.16) + (oxidation * 0.2) - (joint * 0.34),
      height: (feldspar * 0.075) + (quartz * 0.045) + (warpB * 0.1) - (joint * 0.5),
      roughness: ((1 - quartz) * 0.11) + (oxidation * 0.07) + (joint * 0.21),
    };
  }
  if (operatorId === 'schist-cleavage-bench-joints-oxidation') {
    const cleavageCoordinate = (3.4 * u) + (10.5 * v) + (warpA * 0.72);
    const cleavage = Math.sin(TAU * cleavageCoordinate + phase(seed, 739));
    const mica = wave(u, v, 8, 21, phase(seed, 743) + (warpB * 0.38));
    const openCleavage = (smoothstep(0.74, 0.975, -cleavage) ** 1.7)
      * smoothstep(-0.52, 0.72, warpB);
    const crossJoint = smoothstep(0.91, 0.991,
      Math.abs(wave(u, v, 4, -1, phase(seed, 751) + (warpA * 0.51))));
    const iron = smoothstep(0.08, 0.82,
      periodicNoise(u, v, seed + 757, [[1, 2, 0.61], [3, -1, 0.39]]) + (openCleavage * 0.27));
    return {
      cavity: (openCleavage * 0.42) + (crossJoint * 0.33),
      color: (cleavage * 0.27) + (mica * 0.12) + (iron * 0.3) - (openCleavage * 0.3) - (crossJoint * 0.2),
      height: (cleavage * 0.09) + (mica * 0.045) - (openCleavage * 0.41) - (crossJoint * 0.3),
      roughness: (openCleavage * 0.18) + (crossJoint * 0.16) + (iron * 0.07) - (mica * 0.05),
    };
  }
  if (operatorId === 'coastal-granite-joints-salt-pitting') {
    const mineral = periodicNoise(u, v, seed + 769, [[3, 2, 0.43], [-5, 1, 0.34], [4, 7, 0.23]]);
    const paleMineral = smoothstep(-0.22, 0.72, mineral + (warpA * 0.25));
    const jointA = smoothstep(0.915, 0.99,
      Math.abs(wave(u, v, 2, 1, phase(seed, 773) + (warpB * 0.56))));
    const jointB = smoothstep(0.925, 0.992,
      Math.abs(wave(u, v, -1, 4, phase(seed, 787) + (warpA * 0.43))));
    const nearest = nearestPoint(u, v, context.secondary, 1.08);
    const saltPit = Math.exp(-((nearest.distance / (nearest.radius * 0.34)) ** 2));
    const sprayBleach = smoothstep(0.04, 0.82,
      periodicNoise(u, v, seed + 797, [[1, 2, 0.68], [-2, 3, 0.32]]) - (saltPit * 0.18));
    const joint = Math.max(jointA, jointB);
    return {
      cavity: (joint * 0.46) + (saltPit * 0.3),
      color: (paleMineral * 0.24) + (sprayBleach * 0.36) - (joint * 0.32) - (saltPit * 0.24),
      height: (paleMineral * 0.07) + (sprayBleach * 0.08) - (joint * 0.47) - (saltPit * 0.28),
      roughness: (joint * 0.2) + (saltPit * 0.18) + ((1 - sprayBleach) * 0.08),
    };
  }
  if (operatorId === 'humid-karst-karren-rills-dampness') {
    const fluteCoordinate = (8.5 * u) + (1.1 * v) + (warpA * 0.83);
    const flute = Math.sin(TAU * fluteCoordinate + phase(seed, 809));
    const rill = smoothstep(0.48, 0.94, flute) ** 1.5;
    const nearest = nearestPoint(u, v, context.primary, 1.27);
    const solutionPit = Math.exp(-((nearest.distance / (nearest.radius * 0.38)) ** 2));
    const runoff = smoothstep(0.1, 0.84,
      periodicNoise(u, v, seed + 811, [[1, 3, 0.61], [-2, 5, 0.39]]) + (rill * 0.17));
    const calcite = smoothstep(0.22, 0.88, warpB - (solutionPit * 0.21));
    return {
      cavity: (solutionPit * 0.48) + ((1 - rill) * 0.1),
      color: (rill * 0.22) + (calcite * 0.18) - (solutionPit * 0.36) - (runoff * 0.24),
      height: (rill * 0.24) + (calcite * 0.06) - (solutionPit * 0.45) - (runoff * 0.08),
      roughness: (solutionPit * 0.2) + ((1 - rill) * 0.1) - (runoff * 0.11),
    };
  }
  if (operatorId === 'columnar-basalt-cooling-joints-talus') {
    const columnBoundary = irregularCellBoundary(
      u + (warpA * 0.012), v + (warpB * 0.008), context.primary, 1.72,
    );
    const coolingJoint = clamp01(columnBoundary * (0.58 + (0.42 * smoothstep(-0.44, 0.72, warpB))));
    const verticalFabric = wave(u, v, 7, 1, phase(seed, 827) + (warpA * 0.52));
    const talusPatch = smoothstep(0.24, 0.88,
      periodicNoise(u, v, seed + 829, [[1, 2, 0.64], [-2, 3, 0.36]]) - (v * 0.18));
    const maficDomain = periodicNoise(u, v, seed + 839, [[3, 4, 0.48], [-5, 2, 0.31], [7, 1, 0.21]]);
    return {
      cavity: (coolingJoint * 0.5) + (talusPatch * Math.max(0, -verticalFabric) * 0.08),
      color: (maficDomain * 0.24) + (verticalFabric * 0.12) + (talusPatch * 0.09) - (coolingJoint * 0.34),
      height: (maficDomain * 0.07) + (verticalFabric * 0.08) - (coolingJoint * 0.5),
      roughness: (coolingJoint * 0.22) + (talusPatch * 0.08) + (maficDomain * 0.05),
    };
  }
  throw new RangeError(`Unknown accepted cohort surface operator “${String(operatorId)}”.`);
}

function rgbaPage(size) {
  return new Uint8Array(size * size * 4);
}

function writeRgba(page, pixel, red, green, blue, alpha = 255) {
  const offset = pixel * 4;
  page[offset] = Math.round(clamp01(red) * 255);
  page[offset + 1] = Math.round(clamp01(green) * 255);
  page[offset + 2] = Math.round(clamp01(blue) * 255);
  page[offset + 3] = alpha;
}

function scalarPage(values, size) {
  const page = rgbaPage(size);
  for (let pixel = 0; pixel < values.length; pixel += 1) {
    writeRgba(page, pixel, values[pixel], values[pixel], values[pixel]);
  }
  return page;
}

function correlation(values, size, dx, dy) {
  let leftMean = 0;
  let rightMean = 0;
  const count = size * size;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    leftMean += values[(y * size) + x];
    rightMean += values[(((y + dy) % size) * size) + ((x + dx) % size)];
  }
  leftMean /= count;
  rightMean /= count;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const left = values[(y * size) + x] - leftMean;
    const right = values[(((y + dy) % size) * size) + ((x + dx) % size)] - rightMean;
    numerator += left * right;
    leftVariance += left * left;
    rightVariance += right * right;
  }
  return numerator / Math.max(1e-12, Math.sqrt(leftVariance * rightVariance));
}

export function measureC8CohortSurfaceQuality(heightValues, size) {
  assert(heightValues?.length === size * size, 'Surface quality metrics require one height value per pixel.');
  const shifts = [Math.floor(size / 4), Math.floor(size / 3), Math.floor(size / 2)].filter((value) => value > 0);
  const correlations = shifts.flatMap((shift) => [
    { axis: 'u', shift, value: correlation(heightValues, size, shift, 0) },
    { axis: 'v', shift, value: correlation(heightValues, size, 0, shift) },
  ]);
  const blockCount = 4;
  const regionalMeans = [];
  for (let by = 0; by < blockCount; by += 1) for (let bx = 0; bx < blockCount; bx += 1) {
    let sum = 0;
    let count = 0;
    const y0 = Math.floor((by * size) / blockCount);
    const y1 = Math.floor(((by + 1) * size) / blockCount);
    const x0 = Math.floor((bx * size) / blockCount);
    const x1 = Math.floor(((bx + 1) * size) / blockCount);
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      sum += heightValues[(y * size) + x];
      count += 1;
    }
    regionalMeans.push(sum / count);
  }
  const mean = regionalMeans.reduce((sum, value) => sum + value, 0) / regionalMeans.length;
  const regionalMeanStdDev = Math.sqrt(regionalMeans.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / regionalMeans.length);
  const maximumRepeatCorrelation = Math.max(...correlations.map(({ value }) => Math.abs(value)));
  return Object.freeze({
    correlations: Object.freeze(correlations),
    maximumRepeatCorrelation,
    regionalMeanStdDev,
    repeatedUniformPatternPass: maximumRepeatCorrelation < 0.985 && regionalMeanStdDev > 0.0025,
  });
}

function geometrySourceFromManifest(manifest) {
  return manifest?.exports?.high ?? manifest?.cleanedAuthoring?.sourceGeometry ?? null;
}

export function validateC8CohortSurfaceInputs({ authoringManifest, authoringManifestSha256, geologyProfile, visualApproval } = {}) {
  assert(authoringManifest && typeof authoringManifest === 'object', 'Cleaned-authoring manifest is required.');
  assert(SHA256.test(authoringManifestSha256 ?? ''), 'Cleaned-authoring manifest SHA-256 is required.');
  assert(authoringManifest.worldUnitMetres === 1, 'Cleaned authoring must use one world unit per metre.');
  assert(typeof authoringManifest.assetId === 'string' && authoringManifest.assetId.length > 0, 'Cleaned authoring requires assetId.');
  const sourceGeometry = geometrySourceFromManifest(authoringManifest);
  assert(sourceGeometry && SHA256.test(sourceGeometry.sha256 ?? ''), 'Cleaned authoring is missing the retained source geometry SHA-256.');
  assert(authoringManifest.high?.audit?.appliedScale === true || authoringManifest.cleanedAuthoring?.appliedScale === true,
    'Texture-stretch gate requires applied geometry scale.');
  assert(authoringManifest.high?.build?.uv?.worldScaleRebakeRequiredAfterNonUniformEditorScale === true
    || authoringManifest.cleanedAuthoring?.worldScaleRebakeRequiredAfterNonUniformEditorScale === true,
  'Texture-stretch gate requires rebake after non-uniform editor scale.');
  assert(geologyProfile && typeof geologyProfile === 'object', 'Geology profile is required.');
  assert(geologyProfile.schema === 'toonlab/c8-cohort-geology-profile' && geologyProfile.version === 1,
    'Geology profile must use the admitted C8 cohort profile schema/version.');
  assert(geologyProfile.assetId === authoringManifest.assetId, 'Geology profile assetId differs from cleaned authoring.');
  assert(SHA256.test(geologyProfile.admittedEvidence?.sha256 ?? '')
    && typeof geologyProfile.admittedEvidence?.path === 'string'
    && geologyProfile.admittedEvidence.path.length > 0
    && geologyProfile.admittedEvidence.generatedViewsAreGeologyEvidence === false,
  'Geology profile requires hash-bound admitted nature/authority evidence; generated views must not be geology evidence.');
  const profileId = geologyProfile.profileId ?? geologyProfile.id;
  const accepted = C8_COHORT03_ACCEPTED_PROFILES[profileId];
  assert(accepted, `Unknown geology profile “${String(profileId)}”; no surface package may be generated.`);
  const acceptedOperatorIds = accepted.operatorIds ?? [accepted.operatorId];
  assert(acceptedOperatorIds.includes(geologyProfile.operatorId),
    `${profileId}: operator must be one of the accepted operators: ${acceptedOperatorIds.join(', ')}.`);
  if (visualApproval?.schema === 'toonlab/c8-cohort-surface-visual-approval') {
    assert(visualApproval.version === 1 && visualApproval.approved === true,
      'Exact visual approval input is required before surface generation.');
    assert(visualApproval.assetId === authoringManifest.assetId, 'Visual approval assetId differs from cleaned authoring.');
    assert(visualApproval.authoringManifestSha256 === authoringManifestSha256, 'Visual approval does not bind the cleaned-authoring manifest hash.');
    assert(visualApproval.sourceGeometrySha256 === sourceGeometry.sha256, 'Visual approval does not bind the retained source geometry hash.');
    assert(visualApproval.profileId === profileId, 'Visual approval does not bind the geology profile.');
    assert(SHA256.test(visualApproval.evidenceBoard?.sha256 ?? ''), 'Visual approval requires a hashed evidence board.');
    assert(typeof visualApproval.reviewer === 'string' && visualApproval.reviewer.trim().length > 0, 'Visual approval requires reviewer identity.');
    assert(Number.isFinite(Date.parse(visualApproval.approvedAt)), 'Visual approval requires an ISO approval time.');
  } else if (['toonlab/rock-c8-first100-h31-cohort04-authoring-audit',
    'toonlab/rock-c8-first100-h31-cohort05-authoring-audit',
    'toonlab/rock-c8-first100-h31-cohort06-authoring-audit',
    'toonlab/rock-c8-first100-h31-cohort07-authoring-audit'].includes(visualApproval?.schema)) {
    const cohortLabel = visualApproval.schema.includes('cohort07')
      ? 'Cohort07'
      : visualApproval.schema.includes('cohort06')
      ? 'Cohort06'
      : visualApproval.schema.includes('cohort05') ? 'Cohort05' : 'Cohort04';
    const expectedAdmissionPolicy = cohortLabel === 'Cohort07'
      ? 'Only technicalGeometryStatus=pass and visualStatus=pass may proceed to PBR/admission. Borderline, visual reject, and technical failure revisions remain immutable evidence and are not admitted.'
      : 'Only visualStatus=pass may proceed to PBR/admission. Borderline and reject revisions remain immutable evidence and are not admitted.';
    assert(visualApproval.version === 1
      && visualApproval.admissionPolicy === expectedAdmissionPolicy,
    `${cohortLabel} audit approval policy is absent or changed.`);
    const decision = visualApproval.assets?.find(({ id }) => id === authoringManifest.assetId);
    assert(decision
      && decision.visualStatus === 'pass'
      && decision.technicalGeometryStatus === 'pass'
      && decision.admissionStatus === 'admitted-for-pbr-gate',
    `${authoringManifest.assetId}: ${cohortLabel.toLowerCase()} audit does not admit this asset for PBR.`);
    assert(decision.manifest?.sha256 === authoringManifestSha256,
      `${cohortLabel} audit decision does not bind the cleaned-authoring manifest hash.`);
    assert(SHA256.test(visualApproval.board?.sha256 ?? '') && visualApproval.board?.path,
      `${cohortLabel} audit requires a hash-bound review board.`);
  } else if (visualApproval?.schema === 'toonlab/rock-c8-cohort-credible-morphology-admission') {
    const expectedPolicy = 'Technically valid cleaned meshes with credible real-rock morphology may proceed to surface and comparison evidence despite exact-reference mismatch; broken or implausible meshes remain excluded.';
    assert(visualApproval.version === 1
      && visualApproval.policy === expectedPolicy
      && visualApproval.visualApprovalClaimed === false
      && visualApproval.productionReady === false
      && visualApproval.signedHeightResidualClaimed === false,
    'Credible-morphology admission policy or non-approval safeguards are absent or changed.');
    const decision = visualApproval.assets?.find(({ id }) => id === authoringManifest.assetId);
    assert(decision
      && decision.technicalGeometryStatus === 'pass'
      && decision.credibleMorphologyStatus === 'pass'
      && decision.admissionStatus === 'admitted-for-surface-technical-evidence'
      && decision.manifest?.sha256 === authoringManifestSha256,
    `${authoringManifest.assetId}: credible-morphology admission does not bind this exact technically valid manifest.`);
    assert(SHA256.test(visualApproval.evidenceBoard?.sha256 ?? '') && visualApproval.evidenceBoard?.path,
      'Credible-morphology admission requires a hash-bound review board.');
  } else {
    throw new Error('Exact visual approval input is required before surface generation.');
  }
  return Object.freeze({
    accepted,
    assetId: authoringManifest.assetId,
    operatorId: geologyProfile.operatorId,
    profileId,
    sourceGeometry,
  });
}

export function createC8CohortSurfacePackageData({
  authoringManifest,
  authoringManifestSha256,
  geologyProfile,
  resolution = 1024,
  visualApproval,
} = {}) {
  assert(Number.isInteger(resolution) && resolution >= 32 && resolution <= 4096, 'Surface resolution must be an integer from 32 to 4096.');
  const validated = validateC8CohortSurfaceInputs({ authoringManifest, authoringManifestSha256, geologyProfile, visualApproval });
  const seed = Number.parseInt(sha256Stable({
    assetId: validated.assetId,
    geometry: validated.sourceGeometry.sha256,
    operator: validated.operatorId,
    revision: C8_COHORT_SURFACE_OPERATOR_REVISION,
  }).slice(0, 8), 16) >>> 0;
  const count = resolution * resolution;
  const height = new Float64Array(count);
  const heightMicro = new Float64Array(count);
  const colorSignal = new Float64Array(count);
  const cavities = new Float64Array(count);
  const roughnessValues = new Float64Array(count);
  const context = { primary: points(seed, 17, 701), secondary: points(seed, 29, 907) };
  for (let y = 0; y < resolution; y += 1) for (let x = 0; x < resolution; x += 1) {
    const pixel = (y * resolution) + x;
    const u = (x + 0.5) / resolution;
    const v = (y + 0.5) / resolution;
    const sample = operatorSample(validated.operatorId, u, v, seed, context);
    const grain = tileValueFbm(u, v, 24, seed + 1701);
    const broad = periodicNoise(u, v, seed + 1801, [[1, 2, 0.61], [2, -1, 0.39]]);
    height[pixel] = clamp01(0.5 + (sample.height * 0.78) + (broad * 0.09));
    heightMicro[pixel] = clamp01(height[pixel] + (grain * 0.075));
    colorSignal[pixel] = clamp01(0.5 + (sample.color * 0.34) + (broad * 0.12) + (grain * 0.05));
    cavities[pixel] = clamp01(sample.cavity + Math.max(0, -grain) * 0.035);
    roughnessValues[pixel] = clamp01(lerp(validated.accepted.roughness[0], validated.accepted.roughness[1], clamp01(0.5 + sample.roughness + (grain * 0.08))));
  }
  const quality = measureC8CohortSurfaceQuality(height, resolution);
  assert(quality.repeatedUniformPatternPass,
    `${validated.assetId}: repeated/uniform pattern gate failed (correlation=${quality.maximumRepeatCorrelation}, regionalStdDev=${quality.regionalMeanStdDev}).`);
  const baseColor = rgbaPage(resolution);
  const normalGL = rgbaPage(resolution);
  const ao = scalarPage(Float64Array.from(cavities, (value) => clamp01(1 - value)), resolution);
  const roughness = scalarPage(roughnessValues, resolution);
  const smoothness = scalarPage(Float64Array.from(roughnessValues, (value) => 1 - value), resolution);
  const orm = rgbaPage(resolution);
  for (let y = 0; y < resolution; y += 1) for (let x = 0; x < resolution; x += 1) {
    const pixel = (y * resolution) + x;
    const color = colorSignal[pixel];
    const low = validated.accepted.colors[0];
    const high = validated.accepted.colors[1];
    writeRgba(baseColor, pixel, lerp(low[0], high[0], color) / 255, lerp(low[1], high[1], color) / 255, lerp(low[2], high[2], color) / 255);
    const left = heightMicro[(y * resolution) + ((x - 1 + resolution) % resolution)];
    const right = heightMicro[(y * resolution) + ((x + 1) % resolution)];
    const down = heightMicro[(((y - 1 + resolution) % resolution) * resolution) + x];
    const up = heightMicro[(((y + 1) % resolution) * resolution) + x];
    const texelMetres = 1 / resolution;
    const dx = ((right - left) * validated.accepted.heightSpanMetres) / (2 * texelMetres);
    const dy = ((up - down) * validated.accepted.heightSpanMetres) / (2 * texelMetres);
    const length = Math.hypot(dx, dy, 1);
    writeRgba(normalGL, pixel, ((-dx / length) * 0.5) + 0.5, ((-dy / length) * 0.5) + 0.5, (1 / length * 0.5) + 0.5);
    const offset = pixel * 4;
    orm[offset] = ao[offset];
    orm[offset + 1] = roughness[offset];
    orm[offset + 2] = 0;
    orm[offset + 3] = 255;
  }
  const pages = Object.freeze({
    ao,
    baseColor,
    height: scalarPage(height, resolution),
    heightMicro: scalarPage(heightMicro, resolution),
    normalGL,
    orm,
    roughness,
    smoothness,
  });
  const rebakeKey = sha256Stable({
    authoringManifestSha256,
    operatorId: validated.operatorId,
    operatorRevision: C8_COHORT_SURFACE_OPERATOR_REVISION,
    profileId: validated.profileId,
    projectionScaleMetres: 1,
    resolution,
    sourceGeometrySha256: validated.sourceGeometry.sha256,
  });
  return Object.freeze({
    assetId: validated.assetId,
    audit: Object.freeze({
      baseColorAoContribution: 0,
      legacy60TextureContribution: 0,
      legacy480SurfaceContribution: 0,
      legacyTextureContribution: 0,
      providerTextureContribution: 0,
      quality,
      textureStretch: Object.freeze({ anisotropy: 1, appliedScale: true, passed: true }),
    }),
    operator: Object.freeze({ id: validated.operatorId, revision: C8_COHORT_SURFACE_OPERATOR_REVISION, seed }),
    pages,
    profileId: validated.profileId,
    projection: Object.freeze({
      axisScaleMetres: Object.freeze([1, 1, 1]),
      coordinateSpace: 'world-metres',
      mode: 'triplanar',
      scaleDecoupledFromBounds: true,
      scaleMetres: 1,
      textureCoordinateScalePerMetre: Object.freeze([1, 1, 1]),
    }),
    rebakeKey,
    resolution,
    sourceGeometrySha256: validated.sourceGeometry.sha256,
  });
}

export function c8CohortSurfaceRebakeReasons(packageManifest, current = {}) {
  const reasons = [];
  if (packageManifest?.operator?.revision !== C8_COHORT_SURFACE_OPERATOR_REVISION) reasons.push('operator-revision-changed');
  if (packageManifest?.operator?.id !== current.operatorId) reasons.push('operator-id-changed');
  if (packageManifest?.inputs?.authoringManifestSha256 !== current.authoringManifestSha256) reasons.push('authoring-manifest-changed');
  if (packageManifest?.inputs?.sourceGeometrySha256 !== current.sourceGeometrySha256) reasons.push('geometry-or-sculpt-changed');
  if (packageManifest?.profile?.id !== current.profileId) reasons.push('geology-profile-changed');
  if (current.nonUniformScale === true) reasons.push('non-uniform-editor-scale-requires-reproject-and-rebake');
  return Object.freeze(reasons);
}
