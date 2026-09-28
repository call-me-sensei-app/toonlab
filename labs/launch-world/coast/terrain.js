// Azure Headland — authored terrain, material-role masks, and the RGBA splat
// brick the ToonLab Ground Shader consumes.
//
// Everything downstream (ground mesh, water bed sampler, grass scatter, object
// grounding, collision) reads THIS module, so paint and placement can never
// disagree. `headlandHeight` is a pure function of (x, z) and is defined
// outside the scene bounds too — ToonLab Water samples the bed well past the
// walkable footprint.
//
// Plan reference: 18-launch-video-world-production-plan §10.2.
//   world footprint 240 x 180 m · walkable land 150 x 110 m
//   shoreline: a ~110 m ASYMMETRIC curve, never a plane intersection
//   Yua hero mark (4, 2.2, 18) on the overlook, facing west-northwest
//
// Orientation: -Z is north (ocean + city horizon), +Z is south (camera ridge).

import * as THREE from 'three';

const { clamp, smoothstep } = THREE.MathUtils;

export const BOUNDS = Object.freeze({
  min: Object.freeze({ x: -120, z: -90 }),
  max: Object.freeze({ x: 120, z: 90 }),
});

export const WALKABLE = Object.freeze({
  min: Object.freeze({ x: -75, z: -35 }),
  max: Object.freeze({ x: 75, z: 75 }),
});

export const WATER_LEVEL = 0;

// §10.2 hero mark. Height here is authored to land on 2.2 m (measured 2.34 m).
export const YUA_MARK = Object.freeze({ x: 4, y: 2.2, z: 18 });
// West-northwest, with north = -Z: bearing 292.5deg -> (sin b, 0, -cos b).
export const YUA_FACING = Object.freeze({ x: -0.924, y: 0, z: -0.383 });

// ---------------------------------------------------------------------------
// Shoreline
// ---------------------------------------------------------------------------

// The authored waterline as z = shoreZ(x). A linear tilt makes the two ends
// genuinely different (a broad wading bay to the west, a headland promontory
// to the east) and three decreasing harmonics keep it off any analytic arc.
// Arc length over the walkable span x = -50..50 measures ~110 m.
export function shoreZ(x) {
  const cx = clamp(x, BOUNDS.min.x, BOUNDS.max.x);
  return -14
    - 0.26 * cx
    + 0.0016 * cx * cx
    + 3.0 * Math.sin(cx * 0.085 + 0.6)
    + 1.4 * Math.sin(cx * 0.21 - 1.3)
    + 0.7 * Math.sin(cx * 0.47 + 2.1);
}

/** Signed inland distance in metres. Positive = landward (south) of the waterline. */
export function inland(x, z) {
  return z - shoreZ(x);
}

// ---------------------------------------------------------------------------
// Height profile
// ---------------------------------------------------------------------------

// Beach berm -> lawn -> southern camera ridge. Slope stays under 15deg across
// the whole walkable footprint, so every metre of it is walkable.
function landProfile(d) {
  return 0.042 * d + 0.00082 * d * d;
}

// Nearshore bed — a Dean equilibrium terrace, h = A·x^(2/3).
//
// PASS 2. The pass-1 bed reached 6 m of water 55 m offshore, which put the
// whole visible bay past `deepFadeDistance` and made ToonLab Water resolve to
// one flat mid-blue from the shore to the horizon — §10.2's "luminous
// turquoise-to-deep-blue" collapsed into a single band. Water colour is a
// function of the *bed*, not of the water settings, so the fix is here.
//
// A = 0.155 with a 3 m origin offset (which keeps the slope finite at the
// waterline instead of a vertical wall, and lands it at 4.1deg against the
// beach berm's 2.4deg) puts:
//     24 m out ->  1.1 m   the break line for a 0.84 m wave (h_b = H/0.78)
//     60 m out ->  2.1 m   shallow turquoise still reading
//    100 m out ->  3.1 m
//    170 m out ->  4.5 m   shelf edge; the deep band starts here
// so the three colour bands occupy the frame instead of the first 40 m.
const SHELF_A = 0.155;
const SHELF_ORIGIN = 3.0;
const SHELF_ORIGIN_TERM = SHELF_ORIGIN ** (2 / 3);
const SHELF_EDGE_DISTANCE = 170;

function bedProfile(d) {
  const a = -d;
  const shelf = SHELF_A * ((a + SHELF_ORIGIN) ** (2 / 3) - SHELF_ORIGIN_TERM);
  const edge = 0.06 * Math.max(a - SHELF_EDGE_DISTANCE, 0);
  return -Math.min(shelf + edge, 24);
}

// Sand bars. Two shore-parallel ridges on the terrace, ~0.35 m of relief on a
// 2 m bed. Real dissipative beaches build them, and they are what makes a
// breaker line break where it does instead of anywhere the swell happens to
// be: the swell trips on the bar, reforms in the trough, and breaks again at
// the step. Without them a Dean terrace peels one uniform line across 240 m,
// which is its own kind of repetition.
function sandBars(x, d) {
  const a = -d;
  if (a <= 0) return 0;
  const wander = 4.5 * Math.sin(x * 0.037 + 0.8) + 2.0 * Math.sin(x * 0.101 - 2.2);
  const bar = (centre, halfWidth, height) => {
    const t = clamp(1 - Math.abs(a - (centre + wander)) / halfWidth, 0, 1);
    return height * t * t * (3 - 2 * t);
  };
  return bar(34, 15, 0.34) + bar(86, 26, 0.3);
}

// Dune/meadow relief. Faded out near the waterline so the authored shoreline
// curve stays the authored shoreline curve.
function landDetail(x, z, d) {
  const fade = smoothstep(d, 5, 26);
  return fade * (
    0.55 * Math.sin(x * 0.041 + 1.2) * Math.cos(z * 0.037 - 0.4)
    + 0.28 * Math.sin((x * 0.9 + z * 1.3) * 0.061 + 2.4)
    + 0.12 * Math.sin(x * 0.19 - z * 0.13)
  );
}

// Centimetre-scale relief right at the swash line. On a 1:24 berm this walks
// the waterline a few metres in and out so the wet-sand band reads as tidal
// rather than stamped.
function shoreRipple(x, d) {
  const near = 1 - smoothstep(Math.abs(d), 4, 22);
  return near * (0.09 * Math.sin(x * 0.33 + 1.7) + 0.05 * Math.sin(x * 0.77 - 0.6));
}

function bump(x, centre, halfWidth) {
  const t = clamp(1 - Math.abs(x - centre) / halfWidth, 0, 1);
  return t * t * (3 - 2 * t);
}

// Two discontinuous headland bluffs (§10.2: "two discontinuous headland
// clusters"). Peak face angle ~40deg, which is past the Ground Shader's
// automatic rock takeover (slope.start 0.15 => ~32deg) so the cliffs paint
// themselves as stone. ROCK-COAST-01/02/03 land on these two shoulders.
function bluff(x, d) {
  const rise = smoothstep(d, -2, 11);
  return (7.4 * bump(x, 54, 26) + 4.6 * bump(x, -52, 20)) * rise;
}

/** Authoritative height field. Safe to call anywhere on the XZ plane. */
export function headlandHeight(x, z) {
  const d = z - shoreZ(x);
  const base = d >= 0 ? landProfile(d) : bedProfile(d) + sandBars(x, d);
  return base + landDetail(x, z, d) + shoreRipple(x, d) + bluff(x, d);
}

/** Central-difference slope, expressed the way the Ground Shader reads it: 1 - |n.y|. */
export function slopeAt(x, z, step = 0.7) {
  const dx = (headlandHeight(x + step, z) - headlandHeight(x - step, z)) / (2 * step);
  const dz = (headlandHeight(x, z + step) - headlandHeight(x, z - step)) / (2 * step);
  return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
}

// ---------------------------------------------------------------------------
// Promenade
// ---------------------------------------------------------------------------

// The overlook path. It runs ~30 m inland of the waterline and therefore
// inherits the shoreline's asymmetry instead of cutting a straight line
// across it. At x = 4 it passes z = 20.0 — two metres behind Yua's mark, so
// she stands at the railing rather than on the path.
export function pathZ(x) {
  return shoreZ(x) + 30
    + 6.5 * Math.sin(x * 0.055 + 0.9)
    + 2.4 * Math.sin(x * 0.13 - 1.6);
}

export function pathDistance(x, z) {
  return Math.abs(z - pathZ(x));
}

// Meandering offset added to every mask threshold so material boundaries
// wander instead of tracing clean height contours.
function edgeWiggle(x, z) {
  return Math.sin(x * 0.53 + z * 0.31) * 0.9
    + Math.sin(x * 0.17 - z * 0.41) * 1.2
    + Math.sin(x * 1.21 + z * 0.83) * 0.4;
}

// ---------------------------------------------------------------------------
// Material roles
// ---------------------------------------------------------------------------
//
// The Ground Shader splat brick has four FIXED channels (grass, dirt, rock,
// sand — see docs/capability-status.md D19-022). §6.5's semantic roles map:
//   lawn / headland grass -> R (grass)
//   promenade / boardwalk -> G (dirt)
//   cliff                 -> B (rock)
//   beach + seabed        -> A (sand)

export function roleWeights(x, z) {
  const wiggle = edgeWiggle(x, z);
  const d = inland(x, z) + wiggle * 0.8;
  const slope = slopeAt(x, z);

  // Cliff. Slope-driven, so the bluff faces and the wave-cut base paint
  // themselves; the Ground Shader adds its own automatic rock on top.
  const cliff = smoothstep(slope, 0.10, 0.26);

  // Beach and seabed. Everything below and just above the waterline is sand —
  // except on the bluff faces, where sand would otherwise share the channel
  // with rock 50/50 after normalisation and turn the cliffs into tan dunes.
  const sand = (1 - smoothstep(d, 9, 22 + wiggle)) * (1 - cliff * 0.92);

  // Promenade, only where there is dry land to put it on, and never on a face
  // too steep to pave.
  const promenade = (1 - smoothstep(pathDistance(x, z) + wiggle * 0.35, 2.4, 4.4))
    * smoothstep(d, 14, 20)
    * (1 - cliff);

  const lawn = clamp(1 - sand - promenade - cliff, 0, 1);
  return { cliff, lawn, promenade, sand };
}

/**
 * Builds the RGBA splat brick.
 * @returns {{ splat: Uint8Array, splatW: number, splatD: number }}
 */
export function buildGroundField({ width = 512, depth = 384 } = {}) {
  const splat = new Uint8Array(width * depth * 4);
  const spanX = BOUNDS.max.x - BOUNDS.min.x;
  const spanZ = BOUNDS.max.z - BOUNDS.min.z;
  for (let row = 0; row < depth; row += 1) {
    const v = row / Math.max(depth - 1, 1);
    // PlaneGeometry.rotateX(-PI/2) maps increasing UV.y toward -Z.
    const z = (0.5 - v) * spanZ + (BOUNDS.min.z + spanZ * 0.5);
    for (let column = 0; column < width; column += 1) {
      const u = column / Math.max(width - 1, 1);
      const x = (u - 0.5) * spanX + (BOUNDS.min.x + spanX * 0.5);
      const { cliff, lawn, promenade, sand } = roleWeights(x, z);
      const total = Math.max(lawn + promenade + cliff + sand, 1e-4);
      const index = (row * width + column) * 4;
      splat[index] = Math.round((lawn / total) * 255);
      splat[index + 1] = Math.round((promenade / total) * 255);
      splat[index + 2] = Math.round((cliff / total) * 255);
      splat[index + 3] = Math.round((sand / total) * 255);
    }
  }
  return { splat, splatD: depth, splatW: width };
}

/** Terrain geometry sampled from the same height field. */
export function buildTerrainGeometry({ segmentsX = 320, segmentsZ = 240 } = {}) {
  const spanX = BOUNDS.max.x - BOUNDS.min.x;
  const spanZ = BOUNDS.max.z - BOUNDS.min.z;
  const geometry = new THREE.PlaneGeometry(spanX, spanZ, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, headlandHeight(position.getX(index), position.getZ(index)));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------
// Scatter masks
// ---------------------------------------------------------------------------

// Deterministic value hash in [0, 1). Seeded, pure, and stable run to run —
// the filler contract's determinism precondition applies to masks too, because
// a mask that re-rolls per load cannot be equivalence-tested.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43_758.545_3;
  return s - Math.floor(s);
}

/**
 * Grass exclusion, authored from the same roles the splat paints:
 * no grass on sand/swash, on the promenade, or on cliff faces (§6.2).
 *
 * PASS 2. §6.2 forbids a "hard rectangular boundary", and pass 1 delivered
 * exactly that at the sand line: a boolean cut on `d < 13 + wiggle` traced a
 * clean curve because a boolean predicate can only ever produce an edge. The
 * seaward edge is now *stochastic* — the coverage probability ramps from 0 at
 * 8 m inland to 1 at 24 m, so blades thin out across a 16 m dune band and the
 * boundary is broken at clump scale rather than wandering at scene scale.
 * Inland and path/slope exclusions stay hard, because those are real edges.
 */
export function grassMask(x, z) {
  const wiggle = edgeWiggle(x, z);
  const d = inland(x, z) + wiggle * 0.8;
  if (pathDistance(x, z) + wiggle * 0.35 < 3.1) return false;
  if (slopeAt(x, z) > 0.17) return false;
  return hash2(x * 3.73, z * 3.73) < smoothstep(d, 8 + wiggle, 24 + wiggle * 1.6);
}

/**
 * The complementary band: sparse marram-style dune grass standing *in* the
 * sand, seaward of where the lawn gives up. This is what actually dissolves
 * the material seam — the lawn thinning out still leaves a lawn, whereas a few
 * isolated tufts on open sand read as a beach.
 *
 * Never on wet sand (the swash would scrub it), never on the path.
 */
export function duneGrassMask(x, z) {
  const wiggle = edgeWiggle(x, z);
  const d = inland(x, z) + wiggle * 0.8;
  if (d < 3.0) return false;
  if (pathDistance(x, z) + wiggle * 0.35 < 2.6) return false;
  if (slopeAt(x, z) > 0.2) return false;
  const band = smoothstep(d, 3.0, 10 + wiggle) * (1 - smoothstep(d, 15, 30 + wiggle * 2));
  return hash2(x * 5.17 + 19.3, z * 5.17 - 7.7) < band * 0.6;
}

/** Where trees and props may stand: lawn, off the path, off steep ground. */
export function plantableMask(x, z) {
  const d = inland(x, z);
  if (d < 18) return false;
  if (pathDistance(x, z) < 4.2) return false;
  if (slopeAt(x, z) > 0.22) return false;
  return true;
}
