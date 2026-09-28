// SDF-composed debris forms (bones, skulls, jaws, masonry chunks) meshed
// with rockgen's surface-nets extractor. Assembling these from separate
// THREE primitives reads as glued-together programmer art; smooth-blended
// implicit surfaces produce the single continuous form that scanned debris
// references (and Rock Lab) have. All noise is rockgen's coherent
// hash-based simplex/fbm — never uncorrelated per-vertex jitter.

import * as THREE from 'three';

import { computeGradientNormals, computeSdfAo } from '../rockgen/mesh/meshAttributes.js';
import { filterSmallIslands, sampleGrid, surfaceNets } from '../rockgen/mesh/surfaceNets.js';
import { cellular3, cellularCrease3 } from '../rockgen/noise/cellularNoise3.js';
import { hash3f, hashCombine } from '../rockgen/noise/prng.js';
import { simplexNoise3 } from '../rockgen/noise/simplexNoise3.js';
import { fbm3 } from '../rockgen/noise/valueNoise3.js';
import { opSmoothIntersect, opSmoothSubtract, opSmoothUnion } from '../rockgen/sdf/sdfOps.js';
import { sdEllipsoid, sdRoundBox } from '../rockgen/sdf/sdfPrimitives.js';

const SEED_WEATHER = 17;
const SEED_BITES = 29;
const SEED_DRIFT = 43;
const SEED_CUTS = 59;
const SEED_FACET = 73;

const mix2 = (a, b, amount) => a + (b - a) * amount;

function sphere(x, y, z, cx, cy, cz, r) {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  return sdEllipsoid(x - cx, y - cy, z - cz, rx, ry, rz);
}

/**
 * Distance to a polyline of `points` ([x,y,z][]) minus a per-point radius
 * (lerped along each segment): a tapered capsule chain, the workhorse for
 * bone shafts and jaw bodies.
 */
function chainDistance(points, radii, x, y, z) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay, az] = points[i];
    const [bx, by, bz] = points[i + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const wx = x - ax;
    const wy = y - ay;
    const wz = z - az;
    const lengthSq = ex * ex + ey * ey + ez * ez;
    const t = lengthSq > 0 ? Math.min(Math.max((wx * ex + wy * ey + wz * ez) / lengthSq, 0), 1) : 0;
    const dx = wx - ex * t;
    const dy = wy - ey * t;
    const dz = wz - ez * t;
    const radius = radii[i] + (radii[i + 1] - radii[i]) * t;
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz) - radius);
  }
  return best;
}

/** Weathering pass shared by every bone form: coherent erosion + bite chips. */
function applyBoneWeathering(d, x, y, z, weather) {
  const { amplitude, bites, frequency, seed } = weather;
  if (amplitude > 0) {
    d -= amplitude * fbm3(hashCombine(seed, SEED_WEATHER), x * frequency, y * frequency, z * frequency, 3, 2.1, 0.52);
  }
  for (const bite of bites) {
    d = opSmoothSubtract(d, sphere(x, y, z, bite[0], bite[1], bite[2], bite[3]), bite[4]);
  }
  return d;
}

function makeBites(seed, anchors, damage, scale) {
  const bites = [];
  const count = Math.floor(damage * 3.2);
  const biteSeed = hashCombine(seed, SEED_BITES);
  for (let i = 0; i < count; i += 1) {
    const anchor = anchors[i % anchors.length];
    const theta = hash3f(biteSeed, i, 0, 0) * Math.PI * 2;
    const up = hash3f(biteSeed, i, 1, 0) * 2 - 1;
    const ring = Math.sqrt(Math.max(1 - up * up, 0));
    const reach = scale * (0.65 + hash3f(biteSeed, i, 2, 0) * 0.5);
    bites.push([
      anchor[0] + Math.cos(theta) * ring * reach,
      anchor[1] + up * reach,
      anchor[2] + Math.sin(theta) * ring * reach,
      scale * (0.3 + hash3f(biteSeed, i, 3, 0) * 0.4) * (0.4 + damage * 0.6),
      scale * 0.22,
    ]);
  }
  return bites;
}

/**
 * Long bone: waisted diaphysis (capsule chain), a ball head + trochanter
 * bump on the proximal end, twin condyle lobes with an intercondylar
 * groove on the distal end — the asymmetric ends are what make it read as
 * a femur instead of a dog-toy dumbbell.
 */
export function createLongBoneField(shape, seed) {
  const { curvature, damage, jointSize, length, thickness } = shape;
  const half = length * 0.44;
  const joint = thickness * jointSize;
  const bow = curvature * length * 0.055;
  const phase = hash3f(seed, 5, 0, 0) * Math.PI * 2;

  const points = [];
  const radii = [];
  for (let i = 0; i <= 4; i += 1) {
    const t = i / 4;
    points.push([
      (t - 0.5) * 2 * half,
      bow * Math.sin(t * Math.PI),
      curvature * length * 0.02 * Math.sin(t * Math.PI * 2 + phase),
    ]);
    radii.push(thickness * (1.06 - 0.4 * Math.sin(t * Math.PI)));
  }
  const end0 = points[0];
  const end1 = points[4];

  const head = [end0[0] - joint * 0.3, end0[1] + joint * 0.62, end0[2], joint * 0.78];
  const troch = [end0[0] + joint * 0.1, end0[1] - joint * 0.28, end0[2] - joint * 0.3];
  const condyles = [-1, 1].map((side) => [
    end1[0] + joint * 0.22, end1[1] - joint * 0.08, end1[2] + side * joint * 0.48,
  ]);
  const groove = [end1[0] + joint * 0.72, end1[1] + joint * 0.3, end1[2]];

  const weather = {
    amplitude: damage * thickness * 0.14,
    bites: makeBites(seed, [end0, end1], damage, joint),
    frequency: 1 / (thickness * 2.6),
    seed,
  };

  const reach = joint * 1.7;
  return {
    bounds: {
      max: [half + reach, bow + reach, reach],
      min: [-half - reach, -reach, -reach],
    },
    evaluate: (x, y, z) => {
      let d = chainDistance(points, radii, x, y, z);
      d = opSmoothUnion(d, sphere(x, y, z, head[0], head[1], head[2], head[3]), thickness * 0.85);
      d = opSmoothUnion(
        d,
        ellipsoid(x, y, z, troch[0], troch[1], troch[2], joint * 0.55, joint * 0.45, joint * 0.5),
        thickness * 0.6,
      );
      for (const c of condyles) {
        d = opSmoothUnion(
          d,
          ellipsoid(x, y, z, c[0], c[1], c[2], joint * 0.68, joint * 0.58, joint * 0.46),
          thickness * 0.55,
        );
      }
      // Y-axis capsule via swapped coords: groove runs along X between the
      // condyles.
      const gx = x - groove[0];
      const gz = z - groove[2];
      const gy = y - groove[1];
      const clampedX = gx - Math.min(Math.max(gx, -joint * 0.8), joint * 0.8);
      const grooveD = Math.sqrt(clampedX * clampedX + gy * gy + gz * gz) - thickness * 0.34;
      d = opSmoothSubtract(d, grooveD, thickness * 0.3);
      return applyBoneWeathering(d, x, y, z, weather);
    },
    resolution: 60,
  };
}

/**
 * Ungulate skull (deer/goat family, matching scanned reference packs):
 * braincase + frontal plate + tapering snout smooth-blended into one form,
 * orbits and nasal aperture subtracted so sockets read as true cavities,
 * zygomatic arches and pedicle stubs breaking the silhouette.
 */
export function createSkullField(shape, seed) {
  const { damage, jointSize, length } = shape;
  const s = length * 0.62;

  const orbitR = s * 0.145 * jointSize;
  const weather = {
    amplitude: damage * s * 0.035,
    bites: makeBites(seed, [[-s * 0.3, s * 0.58, 0], [s * 0.15, s * 0.6, 0]], damage * 0.8, s * 0.3),
    frequency: 2.6 / s,
    seed,
  };

  return {
    bounds: {
      max: [s * 1.05, s * 0.95, s * 0.5],
      min: [-s * 0.65, 0, -s * 0.5],
    },
    evaluate: (x, y, z) => {
      // Union half: cranium, frontal plate, wedge snout, nasal ridge,
      // maxilla plate. Blends stay tight — over-blending is what turns a
      // skull into a peanut.
      let d = ellipsoid(x, y, z, -s * 0.26, s * 0.48, 0, s * 0.32, s * 0.3, s * 0.23);
      d = opSmoothUnion(d, ellipsoid(x, y, z, 0.02 * s, s * 0.54, 0, s * 0.26, s * 0.18, s * 0.26), s * 0.07);
      // Snout tapers in plan AND profile: a slimmer main wedge plus a
      // narrow premaxilla tip carrying the taper to the nose.
      d = opSmoothUnion(d, ellipsoid(x, y, z, s * 0.36, s * 0.36, 0, s * 0.38, s * 0.18, s * 0.13), s * 0.08);
      d = opSmoothUnion(d, ellipsoid(x, y, z, s * 0.72, s * 0.32, 0, s * 0.26, s * 0.12, s * 0.085), s * 0.07);
      d = opSmoothUnion(d, ellipsoid(x, y, z, s * 0.4, s * 0.48, 0, s * 0.3, s * 0.09, s * 0.07), s * 0.06);
      d = opSmoothUnion(d, ellipsoid(x, y, z, s * 0.42, s * 0.24, 0, s * 0.34, s * 0.1, s * 0.115), s * 0.07);
      for (const side of [-1, 1]) {
        // Zygomatic arch: thin bar standing proud of the skull side so it
        // catches its own shading band.
        const arch = chainDistance(
          [[s * 0.24, s * 0.33, side * s * 0.21], [s * 0.02, s * 0.36, side * s * 0.27], [-s * 0.14, s * 0.44, side * s * 0.25]],
          [s * 0.04, s * 0.045, s * 0.05],
          x, y, z,
        );
        d = opSmoothUnion(d, arch, s * 0.035);
        // Pedicle stubs (shed-antler mounts) on the rear crown.
        const pedicle = chainDistance(
          [[-s * 0.18, s * 0.62, side * s * 0.13], [-s * 0.24, s * 0.8, side * s * 0.21]],
          [s * 0.065, s * 0.05],
          x, y, z,
        );
        d = opSmoothUnion(d, pedicle, s * 0.03);
        // Orbit cavities carved AFTER the arch so a socket rim survives.
        d = opSmoothSubtract(
          d,
          sphere(x, y, z, s * 0.14, s * 0.5, side * s * 0.22, orbitR),
          s * 0.03,
        );
      }
      // Nasal aperture: a shallow notch nicking the top of the nose tip.
      d = opSmoothSubtract(d, ellipsoid(x, y, z, s * 0.95, s * 0.42, 0, s * 0.14, s * 0.07, s * 0.05), s * 0.02);
      // Foramen magnum hollow at the rear.
      d = opSmoothSubtract(d, sphere(x, y, z, -s * 0.56, s * 0.42, 0, s * 0.1), s * 0.02);
      // Flatten the underside just enough to rest on the maxilla — cutting
      // higher pancakes the whole skull under toon banding.
      d = opSmoothIntersect(d, s * 0.05 - y, s * 0.035);
      return applyBoneWeathering(d, x, y, z, weather);
    },
    resolution: 72,
  };
}

/**
 * Hemimandible (half jaw, the classic found bone): curved tooth-bearing
 * body sweeping up into a flat ramus with condyle + coronoid processes,
 * molar row as rounded boxes with damage-dependent missing teeth, and the
 * long toothless diastema gap that makes herbivore jaws instantly legible.
 */
export function createJawField(shape, seed) {
  const { curvature, damage, jointSize, length } = shape;
  const s = length * 0.5;
  const lift = 0.1 + curvature * 0.1;

  const body = [
    [s * 0.92, s * 0.2, 0],
    [s * 0.5, s * (lift + 0.03), s * 0.03],
    [s * 0.05, s * lift, s * 0.05],
    [-s * 0.3, s * (lift + 0.06), s * 0.04],
  ];
  const bodyRadii = [s * 0.045, s * 0.06, s * 0.075, s * 0.09];

  const teeth = [];
  const teethSeed = hashCombine(seed, SEED_BITES);
  // Molar row over the rear body; the front stays bare (diastema).
  for (let i = 0; i < 6; i += 1) {
    if (hash3f(teethSeed, i, 7, 0) < damage * 0.45) continue;
    const t = i / 5;
    const cx = s * (0.42 - t * 0.62);
    const cy = s * (lift + 0.1 + t * 0.025);
    teeth.push([cx, cy, s * 0.045, s * (0.05 + jointSize * 0.012)]);
  }
  // Two incisor nubs at the chin tip.
  for (let i = 0; i < 2; i += 1) {
    teeth.push([s * (0.88 - i * 0.09), s * 0.26, s * 0.01, s * 0.032]);
  }

  const weather = {
    amplitude: damage * s * 0.03,
    bites: makeBites(seed, [[-s * 0.5, s * 0.5, 0], [s * 0.9, s * 0.2, 0]], damage * 0.7, s * 0.18),
    frequency: 3 / s,
    seed,
  };

  return {
    bounds: {
      max: [s * 1.1, s * 0.95, s * 0.35],
      min: [-s * 0.8, 0, -s * 0.25],
    },
    evaluate: (x, y, z) => {
      let d = chainDistance(body, bodyRadii, x, y, z);
      // Ramus: thin vertical plate rising behind the molars.
      d = opSmoothUnion(
        d,
        ellipsoid(x, y, z, -s * 0.42, s * 0.42, s * 0.03, s * 0.24, s * 0.3, s * 0.045),
        s * 0.08,
      );
      // Condyle knob (articular) and coronoid spike on the ramus top.
      d = opSmoothUnion(d, ellipsoid(x, y, z, -s * 0.56, s * 0.68, s * 0.03, s * 0.08, s * 0.055, s * 0.09), s * 0.04);
      d = opSmoothUnion(d, ellipsoid(x, y, z, -s * 0.26, s * 0.7, s * 0.02, s * 0.055, s * 0.14, s * 0.03), s * 0.04);
      for (const tooth of teeth) {
        d = opSmoothUnion(
          d,
          sdRoundBox(x - tooth[0], y - tooth[1], z - tooth[2], tooth[3] * 0.75, tooth[3], tooth[3] * 0.6, tooth[3] * 0.3),
          s * 0.02,
        );
      }
      return applyBoneWeathering(d, x, y, z, weather);
    },
    resolution: 64,
  };
}

/**
 * Masonry chunk / brick / shard as a mini-rock: base solid + planar cuts
 * for the fractured silhouette + cellular crease facets + low fbm — the
 * exact recipe rockgen's cliffs use, at debris scale.
 */
export function createMasonryChunkField(shape, variant, seed) {
  const { angularity, chunkSize, fracture } = shape;
  const brick = variant === 'brick';
  const shard = variant === 'shard';

  const rx = chunkSize * (brick ? 0.9 : 0.55 + hash3f(seed, 1, 0, 0) * 0.4);
  const ry = chunkSize * (brick ? 0.34 : shard ? 0.2 : 0.38 + hash3f(seed, 2, 0, 0) * 0.25);
  const rz = chunkSize * (brick ? 0.44 : 0.45 + hash3f(seed, 3, 0, 0) * 0.35);

  // Planar cuts: random directions, offset so each bites 15-45% of the
  // support radius — straight fracture faces instead of blobby noise.
  const cutSeed = hashCombine(seed, SEED_CUTS);
  const cutCount = brick ? 1 + Math.round(fracture * 2) : 3 + Math.round(angularity * 3);
  const planes = [];
  for (let i = 0; i < cutCount; i += 1) {
    const theta = hash3f(cutSeed, i, 0, 0) * Math.PI * 2;
    const up = (hash3f(cutSeed, i, 1, 0) * 2 - 1) * (shard ? 0.35 : 1);
    const ring = Math.sqrt(Math.max(1 - up * up, 0));
    const nx = Math.cos(theta) * ring;
    const ny = up;
    const nz = Math.sin(theta) * ring;
    const support = Math.sqrt((nx * rx) ** 2 + (ny * ry) ** 2 + (nz * rz) ** 2);
    const bite = (brick ? 0.2 : 0.18 + angularity * 0.3) * (0.5 + hash3f(cutSeed, i, 2, 0));
    planes.push([nx, ny, nz, support * (1 - bite)]);
  }

  // DM2 calibration: gravel's cellular displacement is the MAIN shaper
  // (strength 30-45% of radius, feature size ~= radius), planar facets
  // secondary. Slate/sandstone plates keep noise in-plane only so faces
  // stay flat while outlines wobble.
  const facetSeed = hashCombine(seed, SEED_FACET);
  const facetStrength = chunkSize * (brick ? 0.05 : mix2(0.08, 0.22, fracture));
  const facetScale = 1.3 / chunkSize;
  const noiseAmp = chunkSize * (brick ? 0.02 : shard ? 0.07 : 0.06) * Math.max(fracture, shard ? 0.6 : 0);
  const noiseFreq = (shard ? 1.3 : 1.7) / chunkSize;
  const noiseFlatten = shard ? 0.15 : 1;
  const bevel = chunkSize * (shard ? 0.015 : 0.03);

  const pad = chunkSize * 0.18;
  return {
    bounds: {
      max: [rx + pad, ry + pad, rz + pad],
      min: [-rx - pad, -ry - pad, -rz - pad],
    },
    evaluate: (x, y, z) => {
      let d = brick
        ? sdRoundBox(x, y, z, rx, ry, rz, chunkSize * 0.05)
        : sdEllipsoid(x, y, z, rx, ry, rz);
      if (noiseAmp > 0) {
        d -= noiseAmp * fbm3(hashCombine(seed, SEED_WEATHER), x * noiseFreq, y * noiseFreq * noiseFlatten, z * noiseFreq, 3, 2, 0.5);
      }
      if (facetStrength > 0) {
        d += facetStrength * cellularCrease3(facetSeed, x * facetScale, y * facetScale, z * facetScale, 1);
      }
      for (const plane of planes) {
        d = opSmoothIntersect(d, plane[0] * x + plane[1] * y + plane[2] * z - plane[3], bevel);
      }
      return d;
    },
    resolution: shard ? 40 : 36,
  };
}

/**
 * Stone & mineral fields, each following its DebrisMaker2 recipe:
 * - riverstones: flat ellipsoid + subtle large cellular + heavy smoothing
 *   (low amplitudes stand in for DM2's ~150 relax iterations)
 * - obsidian: tapered wedge + large cellular lobes + conchoidal banding
 *   ridges + hard cuts, NO smoothing noise
 * - meteor: sphere + inward cellular craters layered large->medium->small
 * - gems: many planar slices around a sphere, beveled (chamfer) edges
 */
export function createStoneField(shape, variant, seed) {
  const { banding, chunkSize, detail, flatness, sharpness } = shape;
  const gem = variant === 'gems';
  const meteor = variant === 'meteor';
  const obsidian = variant === 'obsidian';

  const rx = chunkSize * (obsidian ? 0.85 + hash3f(seed, 1, 0, 0) * 0.5 : 0.6 + hash3f(seed, 1, 0, 0) * 0.4);
  const ry = chunkSize * mix2(0.62, 0.2, gem || meteor ? 0 : flatness) * (0.8 + hash3f(seed, 2, 0, 0) * 0.4);
  const rz = chunkSize * (obsidian ? 0.32 + hash3f(seed, 3, 0, 0) * 0.25 : 0.5 + hash3f(seed, 3, 0, 0) * 0.4);

  // Obsidian taper: shrink the cross-section toward +X (DM2 taper -0.4..-0.7).
  const taper = obsidian ? mix2(0.35, 0.7, sharpness) : 0;

  // Banding direction for conchoidal ridges / strata.
  const bandTheta = hash3f(seed, 4, 0, 0) * Math.PI;
  const bandDir = [Math.cos(bandTheta), mix2(0.1, 0.5, hash3f(seed, 5, 0, 0)), Math.sin(bandTheta)];
  const bandFreq = (obsidian ? 9 : 5) / chunkSize;
  const bandAmp = chunkSize * (obsidian ? 0.035 : 0.012) * banding;

  // Gem facets / obsidian fracture faces as planar intersections.
  const cutSeed = hashCombine(seed, SEED_CUTS);
  const cutCount = gem ? 12 + Math.round(sharpness * 8) : obsidian ? 3 + Math.round(sharpness * 3) : 0;
  const planes = [];
  for (let i = 0; i < cutCount; i += 1) {
    const theta = hash3f(cutSeed, i, 0, 0) * Math.PI * 2;
    const up = hash3f(cutSeed, i, 1, 0) * 2 - 1;
    const ring = Math.sqrt(Math.max(1 - up * up, 0));
    const nx = Math.cos(theta) * ring;
    const ny = up;
    const nz = Math.sin(theta) * ring;
    const support = Math.sqrt((nx * rx) ** 2 + (ny * ry) ** 2 + (nz * rz) ** 2);
    // Gems slice close to the surface everywhere (convex faceted solid);
    // obsidian takes a couple of deep fracture faces.
    const bite = gem ? mix2(0.14, 0.34, hash3f(cutSeed, i, 2, 0)) : mix2(0.15, 0.4, hash3f(cutSeed, i, 2, 0));
    planes.push([nx, ny, nz, support * (1 - bite)]);
  }
  // Gem chamfer: banding doubles as the facet-edge bevel radius.
  const bevel = chunkSize * (gem ? mix2(0.005, 0.028, banding) : obsidian ? 0.008 : 0.02);

  const cellSeed = hashCombine(seed, SEED_FACET);
  const cellScale = (meteor ? 1.1 : 0.9) / chunkSize;
  const cellAmp = chunkSize * detail * (obsidian ? 0.1 : meteor ? 0.2 : 0.08);
  const microSeed = hashCombine(seed, SEED_WEATHER);
  const microAmp = chunkSize * detail * (gem ? 0 : obsidian ? 0.015 : 0.035);

  const pad = chunkSize * 0.25;
  return {
    bounds: {
      max: [rx + pad, ry + pad, rz + pad],
      min: [-rx - pad, -ry - pad, -rz - pad],
    },
    evaluate: (x, y, z) => {
      if (taper > 0) {
        const squeeze = 1 - taper * Math.min(Math.max((x / rx) * 0.5 + 0.5, 0), 1);
        return evaluateStone(x, y / squeeze, z / squeeze) * squeeze;
      }
      return evaluateStone(x, y, z);

      function evaluateStone(px, py, pz) {
        let d = sdEllipsoid(px, py, pz, rx, ry, rz);
        if (cellAmp > 0) {
          if (meteor) {
            // Craters: inward dents at cell centers, three octave layers.
            for (const [scaleMul, ampMul] of [[1, 1], [2.3, 0.4], [5.1, 0.15]]) {
              const cell = cellular3(hashCombine(cellSeed, scaleMul * 7), px * cellScale * scaleMul, py * cellScale * scaleMul, pz * cellScale * scaleMul, 1);
              const crater = Math.max(0, 1 - cell.f1 * 1.6);
              d += cellAmp * ampMul * crater * crater;
            }
          } else {
            // Lobes: cellular crease borders carve the silhouette.
            d += cellAmp * cellularCrease3(cellSeed, px * cellScale, py * cellScale, pz * cellScale, 1);
          }
        }
        if (microAmp > 0) {
          d -= microAmp * fbm3(microSeed, px * 2.2 / chunkSize, py * 2.2 / chunkSize, pz * 2.2 / chunkSize, 3, 2, 0.5);
        }
        if (bandAmp > 0) {
          d += bandAmp * Math.abs(Math.sin((bandDir[0] * px + bandDir[1] * py + bandDir[2] * pz) * bandFreq * Math.PI));
        }
        for (const plane of planes) {
          d = opSmoothIntersect(d, plane[0] * px + plane[1] * py + plane[2] * pz - plane[3], bevel);
        }
        return d;
      }
    },
    resolution: gem ? 52 : obsidian ? 48 : 40,
  };
}

/**
 * Meshes a debris field with surface nets (dual-contouring vertex
 * placement so cut planes and socket rims stay sharp) and bakes coherent
 * vertex colors: palette drift from low-frequency simplex, SDF ambient
 * occlusion pulling cavities toward the accent (dirt) color, and the
 * debris look's upward edge light.
 */
export function meshDebrisField(field, surface, seed, { cavityTint = 0.75 } = {}) {
  const { bounds, evaluate } = field;
  const longest = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const cell = longest / field.resolution;
  const padded = {
    max: bounds.max.map((v) => v + cell * 2),
    min: bounds.min.map((v) => v - cell * 2),
  };
  const grid = sampleGrid(evaluate, padded, field.resolution);
  const extracted = filterSmallIslands(surfaceNets(grid, { evaluate }));
  const { indices, positions } = extracted;
  if (positions.length === 0) return null;

  const normals = computeGradientNormals(evaluate, positions, grid.cellSize * 0.5);
  const ao = computeSdfAo(evaluate, positions, normals, {
    radius: longest * 0.16,
    strength: 0.9,
  });

  const primary = new THREE.Color(...surface.primaryColor);
  const secondary = new THREE.Color(...surface.secondaryColor);
  const accent = new THREE.Color(...surface.accentColor);
  const driftSeed = hashCombine(seed, SEED_DRIFT);
  const driftFreq = 2.4 / longest;
  const colors = new Float32Array(positions.length);
  const swatch = new THREE.Color();
  for (let i = 0; i < positions.length / 3; i += 1) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const drift = simplexNoise3(driftSeed, px * driftFreq, py * driftFreq, pz * driftFreq);
    const blend = Math.min(Math.max(0.5 + drift * (0.5 + surface.variation * 1.4), 0), 1);
    swatch.copy(primary).lerp(secondary, blend);
    // Cavities (sockets, grooves, bite chips) collect the accent color and
    // shade — this is what makes carved detail read at toon contrast.
    const cavity = Math.min(Math.max((1 - ao[i]) * cavityTint * 2, 0), 1);
    swatch.lerp(accent, cavity);
    const upward = Math.max(0, normals[i * 3 + 1]);
    const light = (0.72 + ao[i] * 0.28) * (1 + upward * surface.edgeLight * 0.28);
    colors[i * 3] = Math.min(swatch.r * light, 1);
    colors[i * 3 + 1] = Math.min(swatch.g * light, 1);
    colors[i * 3 + 2] = Math.min(swatch.b * light, 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
