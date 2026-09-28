// Repository-only adapter that runs every existing Rockgen preset through the
// same family-agnostic high-to-low compiler. It is a qualification harness,
// not a replacement for geology-specific production authoring.

import { createRockDocument } from '../rockDocument.js';
import { meshDocument } from '../mesh/meshDocument.js';
import { cellularCrease3 } from '../noise/cellularNoise3.js';
import { hashCombine } from '../noise/prng.js';
import { fbm3, valueNoise3 } from '../noise/valueNoise3.js';
import { compileDocument } from '../sdf/fieldCompiler.js';

export const ROCKGEN_FAMILY_PROFILES = Object.freeze([
  Object.freeze({ geology: 'granite', id: 'boulder', label: 'Boulder' }),
  Object.freeze({ geology: 'river-stone', id: 'river-boulder', label: 'River Boulder' }),
  Object.freeze({ geology: 'limestone', id: 'karst-spire', label: 'Karst Spire' }),
  Object.freeze({ geology: 'limestone', id: 'sea-stack', label: 'Sea Stack' }),
  Object.freeze({ geology: 'granite', id: 'granite-boulder', label: 'Granite Block' }),
  Object.freeze({ geology: 'basalt', id: 'basalt-columns', label: 'Basalt Columns' }),
  Object.freeze({ geology: 'sandstone', id: 'cliff-wall', label: 'Cliff Wall' }),
  Object.freeze({ geology: 'sandstone', id: 'eroded-mesa', label: 'Eroded Mesa' }),
  Object.freeze({ geology: 'sandstone', id: 'canyon-ridge', label: 'Canyon Ridge' }),
  Object.freeze({ geology: 'limestone', id: 'column-arch', label: 'Column Arch' }),
  Object.freeze({ geology: 'limestone', id: 'cliff-face', label: 'Cliff Face' }),
  Object.freeze({ geology: 'granite', id: 'scree-cluster', label: 'Scree Cluster' }),
  Object.freeze({ geology: 'granite', id: 'lowpoly-boulder', label: 'Low-Poly Boulder' }),
  Object.freeze({ geology: 'granite', id: 'mossy-boulder', label: 'Mossy Boulder' }),
  Object.freeze({ geology: 'metamorphic', id: 'shard-monolith', label: 'Shard Monolith' }),
]);

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 1e-6));
  return t * t * (3 - 2 * t);
}

function fract(value) {
  return value - Math.floor(value);
}

function profileFor(id) {
  const profile = ROCKGEN_FAMILY_PROFILES.find((entry) => entry.id === id);
  if (!profile) throw new Error(`Unknown Rockgen family "${id}".`);
  return profile;
}

function detailedDisplacement(geology, x, y, z, seed, span) {
  const inverseSpan = 1 / Math.max(span, 1e-4);
  const qx = x * inverseSpan;
  const qy = y * inverseSpan;
  const qz = z * inverseSpan;
  const baseAmplitude = span * 0.0042;
  const grain = fbm3(seed, qx * 22, qy * 22, qz * 22, 3, 2.07, 0.47);

  if (geology === 'sandstone') {
    const warp = fbm3(seed + 7, qx * 3.1, qy * 2.1, qz * 3.1, 2, 2, 0.5) * 0.36;
    const phase = fract(qy * 34 + warp);
    const boundary = 1 - smoothstep(0.015, 0.085, Math.min(phase, 1 - phase));
    const granular = valueNoise3(seed + 19, qx * 74, qy * 74, qz * 74);
    return boundary * baseAmplitude * 1.4 - grain * baseAmplitude * 0.62
      - granular * baseAmplitude * 0.18;
  }
  if (geology === 'limestone') {
    const dissolutionGate = smoothstep(
      0.5,
      0.72,
      fbm3(seed + 11, qx * 4, qy * 2.5, qz * 4, 2, 2, 0.5) * 0.5 + 0.5,
    );
    const seams = cellularCrease3(seed + 23, qx * 12, qy * 8, qz * 12, 1, 0.11);
    return seams * dissolutionGate * baseAmplitude * 1.35 - grain * baseAmplitude * 0.52;
  }
  if (geology === 'basalt') {
    const crystalline = cellularCrease3(seed + 31, qx * 18, qy * 18, qz * 18, 0.82, 0.16);
    const vesicle = valueNoise3(seed + 37, qx * 58, qy * 58, qz * 58);
    return crystalline * baseAmplitude * 0.72 - grain * baseAmplitude * 0.38
      + Math.max(vesicle - 0.68, 0) * baseAmplitude * 0.58;
  }
  if (geology === 'river-stone') {
    return -grain * baseAmplitude * 0.3
      - valueNoise3(seed + 41, qx * 62, qy * 62, qz * 62) * baseAmplitude * 0.1;
  }
  if (geology === 'metamorphic') {
    const veinWarp = fbm3(seed + 43, qx * 3, qy * 3, qz * 3, 2, 2, 0.5) * 0.4;
    const vein = 1 - smoothstep(0.015, 0.09, Math.abs(fract((qx * 0.8 + qy * 1.8) * 18 + veinWarp) - 0.5));
    return vein * baseAmplitude - grain * baseAmplitude * 0.4;
  }
  const fissureGate = smoothstep(
    0.48,
    0.72,
    fbm3(seed + 47, qx * 3, qy * 2.5, qz * 3, 2, 2, 0.5) * 0.5 + 0.5,
  );
  const fissure = cellularCrease3(seed + 53, qx * 13, qy * 11, qz * 13, 1, 0.085);
  const crystal = valueNoise3(seed + 59, qx * 68, qy * 68, qz * 68);
  return fissure * fissureGate * baseAmplitude * 1.15 - grain * baseAmplitude * 0.62
    - crystal * baseAmplitude * 0.13;
}

export function createRockgenPresetBakeSource({ family = 'boulder', seed = 1 } = {}) {
  const profile = profileFor(family);
  const normalizedSeed = Math.max(1, Math.round(Number(seed) || 1)) >>> 0;
  const document = createRockDocument({ preset: family, seed: normalizedSeed, style: 'default' });
  const program = compileDocument(document, { includeHelpers: false });
  const spans = [0, 1, 2].map((axis) => program.bounds.max[axis] - program.bounds.min[axis]);
  const span = Math.max(...spans);
  const detailSeed = hashCombine(normalizedSeed, 0x9b05688c);
  const padding = Math.max(span * 0.025, 0.035);
  const evaluateHigh = (x, y, z) => program.evaluate(x, y, z)
    + detailedDisplacement(profile.geology, x, y, z, detailSeed, span);
  const regionAt = (x, y, z, normal = null, ao = 1) => {
    const normalizedHeight = clamp01((y - program.bounds.min[1]) / Math.max(spans[1], 1e-5));
    const facingUp = normal ? smoothstep(0.18, 0.85, normal[1]) : 0.5;
    const patch = fbm3(
      detailSeed + 71,
      x / span * 5,
      y / span * 4,
      z / span * 5,
      3,
      2,
      0.5,
    ) * 0.5 + 0.5;
    if (profile.geology === 'sandstone') return clamp01(patch * 0.48 + normalizedHeight * 0.52);
    if (profile.geology === 'basalt') return clamp01(patch * 0.72 + (1 - ao) * 0.28);
    if (profile.geology === 'limestone') return clamp01(patch * 0.55 + facingUp * 0.28 + (1 - ao) * 0.17);
    return clamp01(patch * 0.62 + facingUp * 0.2 + (1 - ao) * 0.18);
  };

  return Object.freeze({
    bounds: {
      min: program.bounds.min.map((value) => value - padding),
      max: program.bounds.max.map((value) => value + padding),
    },
    createLowGeometry(resolution = 42) {
      return meshDocument(document, {
        attributes: { ao: false, color: false },
        includeHelpers: false,
        normals: 'gradient',
        resolution,
      });
    },
    document,
    evaluateHigh,
    evaluateLow: program.evaluate,
    family: `toonlab/rockgen/${profile.id}`,
    geology: profile.geology,
    label: profile.label,
    maxProjectionDistance: Math.max(span * 0.028, 0.045),
    preset: profile.id,
    regionAt,
    seed: normalizedSeed,
    variation: Object.freeze({ preset: profile.id, span }),
  });
}

