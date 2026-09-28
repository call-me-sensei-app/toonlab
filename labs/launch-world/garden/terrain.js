// Stillwater Garden — authored terrain, garden spines, material-role masks and
// the RGBA splat brick the ToonLab Ground Shader consumes.
//
// Everything downstream (ground mesh, water bed sampler, grass scatter, object
// grounding, collision) reads THIS module, so paint and placement can never
// disagree. `gardenHeight` is a pure function of (x, z), defined outside the
// walkable footprint too — ToonLab Water samples the bed past the garden edge.
//
// Plan reference: launch-plan/20-stillwater-garden-scene-brief.md §2.
//   walkable garden ~38 x 38 m · hero camera space ~24 x 18 m · no skyline
//   sightlines close on the planted rise, the pine mass and the boundary line
//
// Orientation: -Z is north (planted rise, pines, boundary), +Z is south (gate
// and camera approach), +X is east (teahouse terrace), -X is west (cascade and
// the raked gravel sea).
//
// Ported from labs/launch-world/coast/terrain.js (FILL-003 / FILL-005). The
// shoreline/Dean-terrace bed is replaced by a pond basin, a viewing rise and a
// cascade terrace; the height-field authoring, slope query, shared edge wiggle,
// role normalisation and stochastic boundary all carry over unchanged in shape.

import * as THREE from 'three';
import { createCurveFrame } from '@call-me-sensei/toonlab/vegetation';

const { clamp } = THREE.MathUtils;

// Reversible smoothstep: `ramp(x, a, b)` is 0 at a, 1 at b, for a < b or a > b.
// THREE.MathUtils.smoothstep requires min < max, and half the ramps a garden
// needs run downhill.
function ramp(x, a, b) {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function gauss(d, sigma) {
  const t = d / sigma;
  return Math.exp(-t * t);
}

// ---------------------------------------------------------------------------
// Extents
// ---------------------------------------------------------------------------

// D19-251 — EXTENDED SOUTH FOR STILLWATER LANE (doc 21 §5).
//
// "One continuous terrain surface — the lane is authored in the same height
// field, not a separate scene." So the bounds grow rather than a second surface
// appearing: `gardenHeight` is the single authority for the ground under the
// garden, under the carriageway, and under the buildings' footings alike, and
// every consumer (ground mesh, splat brick, prop grounding, collision) keeps
// reading one function.
//
// +Z only. The north, east and west edges are unchanged, so nothing the garden
// captures depend on moves; the extension is 14 m of street and back-lot depth
// past the old +26 edge (the deepest building, ARCH-LANE-02, reaches z = 37.8).
export const BOUNDS = Object.freeze({
  min: Object.freeze({ x: -26, z: -26 }),
  max: Object.freeze({ x: 26, z: 40 }),
});

/**
 * Stillwater Lane — the street's section, in world coordinates.
 *
 * Doc 21 §2: ~40 m long x 9 m wide, running along the garden's SOUTH boundary,
 * the garden's wall and gate forming the north side and four urban frontages
 * the south. Every level below is quoted against the pond (`WATER_LEVEL = 0`),
 * the same datum the garden uses, because the two are one surface.
 *
 * The step at the gate is doc 21 §5's ("the garden sits slightly above the
 * street so the gate has a step up") and is sized to §8's human-scale band:
 * garden threshold ~0.96 against a footway at 0.78 is a 0.18 m rise, inside the
 * 0.15-0.19 m range §4 asks every step in this world to sit in.
 */
export const LANE = Object.freeze({
  // Run. The frontages occupy x -14..+9; the sightline closer stands west of
  // them and a blank flank closes the east.
  xMin: -24,
  xMax: 19,
  // Section, north (garden) to south (frontage).
  wallZ: 20.0,      // garden boundary wall centreline
  kerbNorthZ: 21.9, // north footway -> carriageway
  kerbSouthZ: 26.9, // carriageway -> south footway
  frontageZ: 29.0,  // south building line
  // Levels.
  footway: 0.78,    // footway top — buildings and street furniture stand on this
  channel: 0.63,    // gutter invert at both kerb lines (0.15 m kerb upstand)
  crown: 0.695,     // carriageway crown, a 2.5% crossfall over 2.6 m
});

/** Carriageway/footway profile at a lane z. Pure, and used by the height field. */
function laneProfile(z) {
  if (z <= LANE.kerbNorthZ || z >= LANE.kerbSouthZ) return LANE.channel;
  // Parabolic crown between the two kerb lines.
  const t = (z - LANE.kerbNorthZ) / (LANE.kerbSouthZ - LANE.kerbNorthZ);
  return LANE.channel + (LANE.crown - LANE.channel) * (4 * t * (1 - t));
}

/** The walkable garden proper — §2's "~40 x 40 m". */
export const GARDEN = Object.freeze({
  min: Object.freeze({ x: -19, z: -19 }),
  max: Object.freeze({ x: 19, z: 19 }),
});

/** Pond surface. Every other level in the garden is quoted against it. */
export const WATER_LEVEL = 0;

/** The upper basin the cascade falls out of, in metres above `WATER_LEVEL`. */
export const UPPER_POOL_LEVEL = 1.6;

/** Flat garden floor: gravel court, path band, moss beds. */
const COURT = 0.46;

// §2 puts Yua on the stone path, near camera. The mark is resolved against the
// path spine below so she cannot drift off it when the path is re-authored.
export const YUA_PATH_T = 0.46;

// ---------------------------------------------------------------------------
// Garden spines — every boundary in a garden is a curve
// ---------------------------------------------------------------------------
//
// A Japanese garden is almost entirely spines: the pond margin, the stone
// path, the boundary line, the bamboo screen. They are authored once here as
// ToonLab curve frames (`createCurveFrame`, src/vegetation/scatter.js) and
// every consumer — hand placement, seeded scatter, role masks — resolves
// through the same frame. See D19-066 / FILL-013.

const POND_CENTRE = Object.freeze({ x: -4.6, z: -5.4 });
const POND_RADIUS_X = 7.6;
const POND_RADIUS_Z = 5.4;

/**
 * Unit radius of the pond margin at bearing `theta`. Four decreasing harmonics
 * keep the outline off any analytic ellipse, and the fifth term is a deliberate
 * pinch on the east-south-east bearing: that notch is the shallow neck the
 * stepping-stone run crosses.
 */
function pondUnitRadius(theta) {
  return 1
    + 0.132 * Math.sin(2 * theta + 0.62)
    + 0.088 * Math.sin(3 * theta - 1.34)
    + 0.046 * Math.sin(5 * theta + 2.12)
    - 0.150 * gauss(Math.atan2(Math.sin(theta - 0.42), Math.cos(theta - 0.42)), 0.44);
}

/** The pond waterline as a closed curve. Domain is the bearing, 0..2π. */
export const POND_MARGIN = createCurveFrame({
  closed: true,
  domain: [0, Math.PI * 2],
  samples: 384,
  spine: (theta) => {
    const r = pondUnitRadius(theta);
    return {
      x: POND_CENTRE.x + POND_RADIUS_X * r * Math.cos(theta),
      z: POND_CENTRE.z + POND_RADIUS_Z * r * Math.sin(theta),
    };
  },
});

/**
 * Normalised pond coordinate: 1 exactly on the waterline, 0 at the centre,
 * greater than 1 on land. Analytic and cheap — the height field calls this per
 * vertex and per splat texel, so it must never go through the curve frame's
 * nearest-point search.
 */
function pondQ(x, z) {
  const dx = (x - POND_CENTRE.x) / POND_RADIUS_X;
  const dz = (z - POND_CENTRE.z) / POND_RADIUS_Z;
  const theta = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / pondUnitRadius(theta);
}

export { pondQ };

// The stone path: gate -> gravel sea edge -> pond south margin -> teahouse
// terrace. Authored as control points and evaluated as a Catmull-Rom spline so
// the walking line is a genuine curve rather than a polyline with corners.
const PATH_POINTS = Object.freeze([
  [-1.0, 16.6], [-1.6, 13.4], [-3.1, 10.8], [-5.6, 8.9], [-7.6, 6.8],
  [-6.4, 4.6], [-3.2, 3.3], [0.5, 2.4], [4.0, 1.3], [7.2, -0.5], [9.6, -3.4],
]);

const PATH_SPLINE = new THREE.CatmullRomCurve3(
  PATH_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'catmullrom',
  0.5,
);

export const PATH = createCurveFrame({
  domain: [0, 1],
  samples: 320,
  spine: (t) => {
    const point = PATH_SPLINE.getPoint(clamp(t, 0, 1));
    return { x: point.x, z: point.z };
  },
});

/**
 * The packed-earth back route (roji). It leaves the stone path beside the
 * teahouse, runs behind the pond around the foot of the viewing rise, and
 * climbs to the head of the cascade — which is the reason a garden has a back
 * route at all. Deliberately informal: no paving, no edging.
 */
const SPUR_POINTS = Object.freeze([
  [8.2, -1.2], [11.6, -5.4], [11.2, -10.4], [7.4, -13.8], [1.6, -15.2],
  [-4.6, -14.6], [-9.8, -14.4], [-13.4, -13.6],
]);

const SPUR_SPLINE = new THREE.CatmullRomCurve3(
  SPUR_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'catmullrom',
  0.5,
);

export const SPUR = createCurveFrame({
  domain: [0, 1],
  samples: 256,
  spine: (t) => {
    const point = SPUR_SPLINE.getPoint(clamp(t, 0, 1));
    return { x: point.x, z: point.z };
  },
});

/**
 * The enclosing boundary line — where the wall, the gate and the bamboo screen
 * stand once ARCH-GDN-02 lands. Until then it is what the perimeter berm and
 * the pine mass are authored against, so the enclosure is already correct when
 * the built pieces arrive.
 */
const BOUNDARY_POINTS = Object.freeze([
  [-17.5, 17.0], [-17.8, 6.0], [-17.2, -6.0], [-15.0, -15.0], [-6.0, -18.0],
  [4.0, -18.4], [13.0, -16.4], [17.0, -8.0], [17.4, 3.0], [16.8, 15.0],
]);

const BOUNDARY_SPLINE = new THREE.CatmullRomCurve3(
  BOUNDARY_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'catmullrom',
  0.5,
);

export const BOUNDARY = createCurveFrame({
  domain: [0, 1],
  samples: 320,
  spine: (t) => {
    const point = BOUNDARY_SPLINE.getPoint(clamp(t, 0, 1));
    return { x: point.x, z: point.z };
  },
});

// ---------------------------------------------------------------------------
// Cascade
// ---------------------------------------------------------------------------

/** Upper basin centre. The cascade falls south-east out of it into the pond. */
export const CASCADE = Object.freeze({
  axis: Object.freeze({ x: 0.58, z: 0.815 }),
  // Where the falling water meets the pond — the plunge point the ripple and
  // foam injection targets.
  plunge: Object.freeze({ x: -11.35, z: -9.05 }),
  pool: Object.freeze({ x: -14.9, z: -13.2 }),
  // Absolute shelf height. The upper pool spills essentially flush with it,
  // which is what makes the lip a lip rather than a step in a bank.
  terrace: UPPER_POOL_LEVEL + 0.02,
});

// Distance along the cascade axis, measured from the upper basin toward the
// pond. Negative is behind the basin (further up the rise).
function cascadeRun(x, z) {
  return (x - CASCADE.pool.x) * CASCADE.axis.x + (z - CASCADE.pool.z) * CASCADE.axis.z;
}

// Lateral distance from the cascade axis.
function cascadeAcross(x, z) {
  return (x - CASCADE.pool.x) * -CASCADE.axis.z + (z - CASCADE.pool.z) * CASCADE.axis.x;
}

/**
 * The cascade is authored as an ABSOLUTE height plus an override weight, not
 * as a delta on the surrounding land. A delta rode the planted rise upward and
 * pushed the upper basin floor above its own waterline — a shelf cut into a
 * hillside has to be quoted against the world, not against the hillside.
 *
 * Height falls from the shelf to the pond bank across a 2.4 m face — ~32°,
 * well past the Ground Shader's automatic rock takeover (slope.start 0.18 =>
 * ~10°), so the cascade face paints itself as stone.
 */
function cascadeShape(x, z) {
  const run = cascadeRun(x, z);
  const across = Math.abs(cascadeAcross(x, z));
  const weight = (1 - ramp(across, 2.6, 5.4)) * (1 - ramp(run, 3.4, 5.0));
  if (weight <= 0) return null;
  const shelf = CASCADE.terrace;
  // Basin bowl, 0.45 m below the spill lip so the upper pool holds water.
  const bowl = 0.45 * gauss(Math.hypot(x - CASCADE.pool.x, z - CASCADE.pool.z), 1.7);
  const drop = ramp(run, 0.9, 3.3);
  const height = (shelf - bowl) * (1 - drop) + 0.12 * drop;
  return { height, weight };
}

// ---------------------------------------------------------------------------
// Height profile
// ---------------------------------------------------------------------------

// The planted rise that closes the north. It carries the pine mass and is the
// hydrological reason the cascade exists. Gradient is 2.9 m over 11 m — 15°,
// walkable everywhere.
function northRise(x, z) {
  // Onset sits BEHIND the pond's north margin (z = -10.7). An earlier onset
  // made the pond's north bank fight the rise and produced a 57° wall where
  // the two gradients stacked.
  const lift = 2.75 * ramp(-z, 10.8, 19.0);
  // Weighted west-heavy so the rise reads as a landform rather than a bank,
  // and so the cascade terrace is cut out of it rather than sitting on it.
  return lift * (0.8 + 0.2 * ramp(-x, -6, 12));
}

// The raised viewing rise east of the pond — §2's "gentle mounding". The
// teahouse terrace sits on its south-west shoulder.
function viewingRise(x, z) {
  return 1.45 * gauss(Math.hypot((x - 9.0) / 1.15, (z + 6.5) / 0.92), 6.6);
}

// A level pad for ARCH-GDN-01. Authored now so the terrace is already flat and
// at the right height when the teahouse arrives (§2 forbids a blockout, not a
// prepared site).
export const TEAHOUSE_PAD = Object.freeze({ radius: 4.6, x: 9.4, z: -4.6 });

function teahousePad(x, z) {
  const d = Math.hypot(x - TEAHOUSE_PAD.x, z - TEAHOUSE_PAD.z);
  return 0.34 * (1 - ramp(d, TEAHOUSE_PAD.radius * 0.62, TEAHOUSE_PAD.radius * 1.5));
}

// The southern approach lifts gently toward the gate so the near edge of every
// hero frame is closed by ground rather than by a cut-off.
function southApproach(z) {
  return 0.5 * ramp(z, 11.5, 19.5);
}

// Perimeter berm. Outside the walkable garden the ground lifts into the
// boundary planting, which is half of why this world has no visible skyline.
//
// PASS 1 FIX. A radial `hypot(outX, outZ)` berm is higher at the corners than
// along the edges, so it built four bare grey CONES that read as distant hills
// through every gap in the planting — an automatic §13 rejection, and the exact
// opposite of "no skyline". A Chebyshev distance gives a continuous rectangular
// ridge at one height all the way round, which is what a garden wall's planted
// bank actually is.
//
// D19-251. The SOUTH lobe is gone, because the lane is there now. A planted
// bank and a street cannot occupy the same 9 m, and the enclosure on that side
// is no longer a berm at all — it is the boundary wall, then the urban
// frontage, which is a stronger sightline stop than a bank ever was.
//
// `southFade` scales the WHOLE berm rather than only its south lobe: the east
// and west lobes run the full length of the world, so leaving them live past
// z = 17 would put a 4 m planted ridge across both ends of the carriageway.
function perimeterBerm(x, z) {
  const outX = Math.max(Math.abs(x) - 15.5, 0);
  // North only. `-z` rather than `|z|`.
  const outZ = Math.max(-z - 15.5, 0);
  const outward = Math.max(outX, outZ);
  // Rises fast to a shoulder, then keeps climbing gently to the world edge so
  // nothing behind it can ever appear over the top.
  const berm = 2.7 * ramp(outward, 0.4, 5.2) + 1.5 * ramp(outward, 5.2, 10.5);
  return berm * (1 - ramp(z, 11.5, 16.8));
}

/**
 * The lane's own surface, as an ABSOLUTE height plus an override weight — the
 * same construction the cascade uses, and for the same reason: a street cut
 * beside a garden is quoted against the world, not against the garden's grade.
 * A delta would have ridden the garden's south approach and put the carriageway
 * on a slope.
 *
 * North of `wallZ` the weight falls off across 2.6 m, which is what makes the
 * garden's threshold sit 0.18 m above the footway instead of meeting it in a
 * cliff. Past `frontageZ` the surface stays flat at footway level: that is the
 * back-lot the buildings' footings sit in, and nothing sees it.
 */
function laneShape(x, z) {
  const inRun = (1 - ramp(x, LANE.xMin, LANE.xMin - 3.0))
    * (1 - ramp(x, LANE.xMax, LANE.xMax + 3.0));
  if (inRun <= 0) return null;
  const weight = inRun * ramp(z, LANE.wallZ - 2.6, LANE.wallZ + 0.4);
  if (weight <= 0) return null;
  const height = z >= LANE.frontageZ ? LANE.footway : laneProfile(z);
  return { height, weight };
}

// Hand-scale relief. Kept small: a designed garden floor is graded, and the
// eye reads any large wobble here as sloppiness rather than as nature.
function microRelief(x, z) {
  return 0.085 * Math.sin(x * 0.37 + 1.1) * Math.cos(z * 0.31 - 0.6)
    + 0.045 * Math.sin((x * 1.3 - z * 0.9) * 0.29 + 2.2)
    + 0.022 * Math.sin(x * 0.83 + z * 0.61);
}

// Pond bed. Two stages, and the shallow one is the point: a 1.5–1.8 m shelf at
// 0.10–0.36 m of water rings the whole pond, which is the depth window where
// ToonLab Water's caustics actually read (§2 "caustics in the shallows"). The
// centre reaches 1.28 m so the deep colour has somewhere to live.
function pondBed(q) {
  return -(0.36 * ramp(q, 1.0, 0.80) + 0.92 * ramp(q, 0.78, 0.42));
}

/** Land height with no pond cut — the surface the bank blends back up to. */
function landHeight(x, z) {
  const base = COURT
    + northRise(x, z)
    + viewingRise(x, z)
    + teahousePad(x, z)
    + southApproach(z)
    + perimeterBerm(x, z)
    + microRelief(x, z);
  const cascade = cascadeShape(x, z);
  const shaped = cascade ? base + (cascade.height - base) * cascade.weight : base;
  const lane = laneShape(x, z);
  if (!lane) return shaped;
  return shaped + (lane.height - shaped) * lane.weight;
}

/** Authoritative height field. Safe to call anywhere on the XZ plane. */
export function gardenHeight(x, z) {
  const q = pondQ(x, z);
  if (q >= 1.5) return landHeight(x, z);
  // A hair below the waterline at the margin, so the waterline is a real edge
  // and the Ground Shader's own wet band has something to sit on.
  const rim = -0.03;
  if (q <= 1) return rim + pondBed(q);
  // A 2.5–3 m bank, which is what keeps the pond edge walkable rather than a
  // retaining wall. Steeper only where the cascade face deliberately overrides.
  return rim + (landHeight(x, z) - rim) * ramp(q, 1.0, 1.5);
}

/** Central-difference slope, expressed the way the Ground Shader reads it. */
export function slopeAt(x, z, step = 0.45) {
  const dx = (gardenHeight(x + step, z) - gardenHeight(x - step, z)) / (2 * step);
  const dz = (gardenHeight(x, z + step) - gardenHeight(x, z - step)) / (2 * step);
  return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
}

/** Gradient magnitude in metres per metre — the walkability query. */
export function gradientAt(x, z, step = 0.45) {
  const dx = (gardenHeight(x + step, z) - gardenHeight(x - step, z)) / (2 * step);
  const dz = (gardenHeight(x, z + step) - gardenHeight(x, z - step)) / (2 * step);
  return Math.hypot(dx, dz);
}

/**
 * Yua's mark, resolved ON the path spine rather than as a loose world
 * coordinate, so she cannot drift off the paving when the path is re-authored.
 * INTEGRATION: `world.yua` hands this to the character owner.
 */
export const YUA_MARK = Object.freeze({
  facing: PATH.headingAt(YUA_PATH_T),
  x: PATH.pointAt(YUA_PATH_T).x,
  y: gardenHeight(PATH.pointAt(YUA_PATH_T).x, PATH.pointAt(YUA_PATH_T).z),
  z: PATH.pointAt(YUA_PATH_T).z,
});

// Distance to a garden spine.
//
// `frame.fromWorld` is exact but runs a nearest-point search per call, and the
// splat bake alone asks for it ~300 000 times across two spines. Each spine is
// therefore rasterised once into a coarse distance field and sampled
// bilinearly. Distances past `max` are clamped — no consumer cares how far
// away "far" is, and the clamp is what keeps the raster cheap.
const FIELD_CELL = 0.2;
const FIELD_MAX = 5;

function createDistanceField(frame) {
  let field = null;
  const build = () => {
    const spanX = BOUNDS.max.x - BOUNDS.min.x;
    const spanZ = BOUNDS.max.z - BOUNDS.min.z;
    const width = Math.ceil(spanX / FIELD_CELL) + 1;
    const depth = Math.ceil(spanZ / FIELD_CELL) + 1;
    const data = new Float32Array(width * depth).fill(FIELD_MAX);
    const steps = Math.max(Math.ceil(frame.length / 0.1), 2);
    const reach = Math.ceil(FIELD_MAX / FIELD_CELL);
    for (let step = 0; step <= steps; step += 1) {
      const point = frame.pointAt(frame.atArcLength((frame.length * step) / steps));
      const cx = Math.round((point.x - BOUNDS.min.x) / FIELD_CELL);
      const cz = Math.round((point.z - BOUNDS.min.z) / FIELD_CELL);
      for (let iz = Math.max(cz - reach, 0); iz <= Math.min(cz + reach, depth - 1); iz += 1) {
        const wz = BOUNDS.min.z + iz * FIELD_CELL - point.z;
        for (let ix = Math.max(cx - reach, 0); ix <= Math.min(cx + reach, width - 1); ix += 1) {
          const wx = BOUNDS.min.x + ix * FIELD_CELL - point.x;
          const distance = Math.hypot(wx, wz);
          const index = iz * width + ix;
          if (distance < data[index]) data[index] = distance;
        }
      }
    }
    field = { data, depth, width };
    return field;
  };
  return (x, z) => {
    const active = field ?? build();
    const fx = clamp((x - BOUNDS.min.x) / FIELD_CELL, 0, active.width - 1.001);
    const fz = clamp((z - BOUNDS.min.z) / FIELD_CELL, 0, active.depth - 1.001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const row = iz * active.width;
    const nextRow = (iz + 1) * active.width;
    const a = active.data[row + ix] + (active.data[row + ix + 1] - active.data[row + ix]) * tx;
    const b = active.data[nextRow + ix]
      + (active.data[nextRow + ix + 1] - active.data[nextRow + ix]) * tx;
    return a + (b - a) * tz;
  };
}

const pathField = createDistanceField(PATH);
const spurField = createDistanceField(SPUR);

/** Distance from the stone path centreline, in metres, clamped to 5 m. */
export function pathDistance(x, z) {
  return pathField(x, z);
}

/** Distance from the packed-earth back route, in metres, clamped to 5 m. */
export function spurDistance(x, z) {
  return spurField(x, z);
}

// ---------------------------------------------------------------------------
// Material roles
// ---------------------------------------------------------------------------
//
// The Ground Shader splat brick has four FIXED channels (grass, dirt, rock,
// sand — D19-022). The garden's four surfaces map exactly, which is the tight
// fit §3 warned about:
//   moss beds and groundcover -> R (grass)
//   packed earth              -> G (dirt)
//   stone paving              -> B (rock)
//   raked gravel              -> A (sand)
//
// The channel names are semantically wrong for three of the four; the layer
// textures, tints and projection scales are what make them read correctly.
// Registered against FILL-005.

// Meandering offset added to every mask threshold so material boundaries
// wander instead of tracing clean analytic contours. Shared by the painted
// splat and by every scatter mask, so the two can never disagree.
function edgeWiggle(x, z) {
  return Math.sin(x * 0.71 + z * 0.43) * 0.34
    + Math.sin(x * 0.23 - z * 0.57) * 0.46
    + Math.sin(x * 1.63 + z * 1.11) * 0.15;
}

// The raked gravel sea. Sited west of the stone path and south of the pond, so
// the hero eye reads gravel -> path -> water as three separated near-field
// bands rather than as one open floor.
//
// PASS 2 FIX — this is the single change that most altered the frame.
// Pass 1 gave gravel a `Math.max(..., 0.55)` FLOOR, i.e. "gravel is the
// garden's default open surface". That made pale crushed granite the ground of
// the entire 38 x 38 m garden, and because the splat is normalised, a 0.55
// gravel background beat every moss pocket that was not itself near 1. The
// result was the pale straw floor that reads as rough grassland in every pass-1
// frame — with the moss field, the thing §2 calls "the dominant green field",
// nowhere in shot.
//
// A karesansui gravel sea is a CONTAINED court, deliberately bounded, and its
// power comes entirely from being surrounded by moss. So the sea is now a
// bounded region only, and moss carries the floor (see `roleWeights`).
function gravelSeaWeight(x, z) {
  const d = Math.hypot((x + 8.4) / 4.9, (z - 2.6) / 3.7);
  return 1 - ramp(d, 0.62, 1.0);
}

export function roleWeights(x, z) {
  // D19-251. The lane's own carriageway and footways are real meshes with §9
  // street recipes on them (MAT-CITY-04 asphalt, MAT-CITY-03 sidewalk stone) —
  // the splat has four FIXED channels and all four are already spoken for by
  // the garden, so a fifth and sixth surface cannot be expressed here. What the
  // splat still owns under the lane is the margin the meshes do not cover: the
  // wall base, the back-lot behind the frontage, and the ends of the run. Those
  // resolve to PAVING, so a sliver of ground showing past a kerb reads as more
  // stone rather than as a strip of moss in a street.
  if (z > LANE.wallZ - 1.0) {
    return { earth: 0.12, gravel: 0.06, moss: 0.04, paving: 1 };
  }

  const wiggle = edgeWiggle(x, z);
  const q = pondQ(x, z);
  const slope = slopeAt(x, z);
  const pathOffset = pathDistance(x, z) + wiggle * 0.22;

  // Stone paving: the path itself, the teahouse terrace, and the cascade face
  // where slope alone would have painted rock anyway.
  const pathPaving = 1 - ramp(pathOffset, 0.95, 1.45);
  const terrace = 1 - ramp(
    Math.hypot(x - TEAHOUSE_PAD.x, z - TEAHOUSE_PAD.z) + wiggle * 0.3,
    TEAHOUSE_PAD.radius * 0.72,
    TEAHOUSE_PAD.radius * 1.06,
  );
  const cascadeStone = (1 - ramp(Math.abs(cascadeAcross(x, z)), 2.4, 4.6))
    * (1 - ramp(cascadeRun(x, z), 0.4, 4.6))
    * ramp(cascadeRun(x, z), -2.6, -0.8);
  // PASS 1 FIX. A `+ slope * 0.4` term used to be added here so banks would
  // take stone. It painted the ENTIRE planted rise, both pond banks and the
  // whole perimeter berm grey — 40% of the garden — because in a graded garden
  // almost nothing is perfectly level. The Ground Shader already owns automatic
  // slope-to-rock takeover (`slope.autoRockStrength`); the splat's job is to
  // say where stone was LAID, and stone was laid on the path, the terrace and
  // the cascade.
  const paving = clamp(Math.max(pathPaving, terrace, cascadeStone), 0, 1);

  // Moss: the pond margin band, the shaded north rise under the pines, the
  // east bank under the viewing rise, and two planted pockets. Moss is the
  // garden's dominant green field (§2 "deep green moss and foliage").
  const margin = (1 - ramp(q, 1.02, 1.78)) * ramp(q, 0.94, 1.02);
  const shade = ramp(-z, 2.2 + wiggle, 11.5);
  const eastBank = 1 - ramp(Math.hypot((x - 12.2) / 1.2, (z + 1.4) / 1.0) + wiggle * 0.35, 2.8, 6.6);
  const westPocket = 1 - ramp(Math.hypot((x + 15.4) / 1.0, (z - 1.6) / 0.9) + wiggle * 0.4, 2.2, 5.0);
  const southPocket = 1 - ramp(Math.hypot((x + 1.4) / 1.25, (z - 9.2) / 0.9) + wiggle * 0.4, 2.6, 6.4);
  // The perimeter bank is planted, not bare. This is most of the enclosure
  // read: the boundary mass has to be green before the pines are counted.
  const bermFace = ramp(perimeterBerm(x, z), 0.4, 1.4);
  const sea = gravelSeaWeight(x, z);
  // PASS 2. Moss carries the FLOOR of the garden (the 0.58 term), which is what
  // §2's "deep green moss and foliage as the dominant field" actually means and
  // what pass 1's gravel floor displaced. The named pockets then push it to
  // full where the planting is deliberately heavy, and the gravel sea cuts it
  // back out again so the court stays a court.
  const moss = clamp(
    Math.max(margin, shade * 0.94, eastBank * 0.9, westPocket, southPocket * 0.86, bermFace, 0.58)
      * (1 - paving * 0.9)
      * (1 - sea),
    0,
    1,
  );

  // Packed earth: the informal back route behind the pond, and the foot of the
  // boundary planting. The route is authored as a SPINE, not as a band in
  // world z — a band would have run straight across open water.
  const spur = 1 - ramp(spurDistance(x, z) + wiggle * 0.28, 0.62, 1.35);
  // Only the FOOT of the berm is bare earth. Its face and shoulder are planted
  // — a bare bank is the thing that made pass 1 read as a quarry.
  const bermFoot = ramp(perimeterBerm(x, z), 0.1, 0.55) * (1 - ramp(perimeterBerm(x, z), 0.9, 1.8));
  const earth = clamp(Math.max(spur, bermFoot * 0.55) * (1 - paving), 0, 1);

  // Raked gravel: the sea proper, and a whisper of substrate everywhere else.
  //
  // D19-240. THE SUBSTRATE TERM WAS 0.09 AND IT OWNED THE GARDEN FLOOR.
  //
  // "A few percent after normalisation" is true of the WEIGHT and false of the
  // RESULT, because a splat weight is only half of what a layer contributes —
  // the other half is its albedo, and these two are an order of magnitude
  // apart. Measured, mean linear luminance over each authored 4096² map:
  //
  //   MAT-GDN-02 moss            0.038
  //   MAT-GDN-01-straight gravel 0.435      11.4x brighter
  //
  // So on the open floor, where the normalised split is 82% moss / 13% gravel,
  // the visible colour is 0.82 x 0.038 = 0.031 of moss against 0.13 x 0.435 =
  // 0.057 of gravel. The 13% channel contributed nearly TWICE the 82% one, and
  // the garden's dominant surface rendered as pale crushed granite.
  //
  // Proved rather than argued, with `?splat=2` (tint x detail, moss tinted pure
  // red): the floor came back sRGB [109, 107, 114] — neutral, with no red in it
  // at all — while the paving channel tinted pure blue came back [86, 89, 138].
  // A channel carrying 82% of the weight was invisible.
  //
  // 0.012 keeps the substrate doing the one job it was added for — breaking the
  // moss colony up so it does not read as flat paint — at a level where it
  // modulates the colour instead of being it.
  const gravel = clamp(
    Math.max(sea, 0.012) * (1 - paving) * (1 - earth),
    0,
    1,
  );

  return { earth, gravel, moss, paving };
}

/**
 * Builds the RGBA splat brick.
 * @returns {{ splat: Uint8Array, splatW: number, splatD: number }}
 */
export function buildGroundField({ width = 512, depth = 512 } = {}) {
  const splat = new Uint8Array(width * depth * 4);
  const spanX = BOUNDS.max.x - BOUNDS.min.x;
  const spanZ = BOUNDS.max.z - BOUNDS.min.z;
  const centreX = BOUNDS.min.x + spanX * 0.5;
  const centreZ = BOUNDS.min.z + spanZ * 0.5;
  for (let row = 0; row < depth; row += 1) {
    const v = row / Math.max(depth - 1, 1);
    // PlaneGeometry.rotateX(-PI/2) maps increasing UV.y toward -Z.
    const z = (0.5 - v) * spanZ + centreZ;
    for (let column = 0; column < width; column += 1) {
      const u = column / Math.max(width - 1, 1);
      const x = (u - 0.5) * spanX + centreX;
      const { earth, gravel, moss, paving } = roleWeights(x, z);
      const total = Math.max(moss + earth + paving + gravel, 1e-4);
      const index = (row * width + column) * 4;
      splat[index] = Math.round((moss / total) * 255);
      splat[index + 1] = Math.round((earth / total) * 255);
      splat[index + 2] = Math.round((paving / total) * 255);
      splat[index + 3] = Math.round((gravel / total) * 255);
    }
  }
  return { splat, splatD: depth, splatW: width };
}

/** Terrain geometry sampled from the same height field. */
export function buildTerrainGeometry({ segmentsX = 416, segmentsZ = 416 } = {}) {
  const spanX = BOUNDS.max.x - BOUNDS.min.x;
  const spanZ = BOUNDS.max.z - BOUNDS.min.z;
  const geometry = new THREE.PlaneGeometry(spanX, spanZ, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    position.setY(index, gardenHeight(position.getX(index), position.getZ(index)));
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

// Deterministic value hash in [0, 1). Seeded, pure and stable run to run — the
// filler contract's determinism precondition applies to masks too, because a
// mask that re-rolls per load cannot be equivalence-tested.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43_758.545_3;
  return s - Math.floor(s);
}

/** Dry ground, clear of the water and of the cascade face. */
export function dryMask(x, z) {
  // D19-251. Nothing the garden scatters may cross the boundary wall: moss,
  // ornamental clumps, trees and set stones all resolve through this one gate,
  // so the lane cannot acquire a lawn by any route.
  if (z > LANE.wallZ - 0.9) return false;
  return gardenHeight(x, z) > WATER_LEVEL + 0.08 && pondQ(x, z) > 1.0;
}

/**
 * Moss beds — the dominant green field. The boundary against gravel is
 * STOCHASTIC, not a boolean cut: coverage probability follows the painted moss
 * weight, so moss thins into the gravel across a band instead of ending on a
 * traced curve (the §13 "hard rectangular boundary" failure the coast pass hit
 * at its sand line).
 */
export function mossMask(x, z) {
  if (!dryMask(x, z)) return false;
  if (pathDistance(x, z) < 1.25) return false;
  const { moss, paving } = roleWeights(x, z);
  if (paving > 0.35) return false;
  return hash2(x * 4.13, z * 4.13) < moss * 0.94;
}

/**
 * Ornamental clumps — taller, sparser, and deliberately NOT co-distributed
 * with the moss: a garden reads as designed because its planting is grouped.
 * Three pockets plus a thin scatter through the moss.
 */
const CLUMP_POCKETS = Object.freeze([
  Object.freeze({ r: 2.2, x: -14.6, z: -3.2 }),
  Object.freeze({ r: 2.0, x: 3.4, z: -10.6 }),
  Object.freeze({ r: 2.4, x: 13.2, z: 1.2 }),
  Object.freeze({ r: 1.8, x: 6.2, z: 11.2 }),
  Object.freeze({ r: 1.7, x: -14.0, z: 9.2 }),
]);

export function clumpMask(x, z) {
  if (!dryMask(x, z)) return false;
  if (pathDistance(x, z) < 1.5) return false;
  if (gradientAt(x, z) > 0.62) return false;
  let pocket = 0;
  for (const { r, x: px, z: pz } of CLUMP_POCKETS) {
    pocket = Math.max(pocket, 1 - ramp(Math.hypot(x - px, z - pz), r * 0.5, r));
  }
  const { moss } = roleWeights(x, z);
  // Pocketed, and ONLY pocketed. The `moss * 0.14` background term that used
  // to sit here spread a thin layer of 0.9 m grass across the entire garden,
  // which is how an accent becomes a meadow.
  return hash2(x * 6.71 + 13.7, z * 6.71 - 4.3) < pocket * 0.86;
}

/**
 * Pond-edge planting — iris and sedge standing in the shallow margin and just
 * behind it. Authored in the pond margin's own curve frame rather than in world
 * XZ, which is the whole point of FILL-013: a constant-width band around an
 * irregular pond is unexpressible as a rectangle with a hole in it.
 */
export function pondEdgeMask(x, z) {
  const q = pondQ(x, z);
  if (q < 1.0 || q > 1.34) return false;
  // Kept out of the water itself. Emergent aquatics standing IN the shallows
  // are the right art direction here and the shipped placement runtime has no
  // way to express them — `createGrassField` treats any submerged placement as
  // a defect (`grass-in-water-footprint`). Recorded as D19-068.
  if (gardenHeight(x, z) <= WATER_LEVEL + 0.05) return false;
  if (pathDistance(x, z) < 1.4) return false;
  // Clumped, not continuous: a uniform fringe around the whole pond reads as
  // pipe cladding. Three bearings carry planting, the rest is open stone.
  const theta = Math.atan2(
    (z - POND_CENTRE.z) / POND_RADIUS_Z,
    (x - POND_CENTRE.x) / POND_RADIUS_X,
  );
  const clump = 0.5 + 0.5 * Math.sin(theta * 3.0 + 1.15);
  return hash2(x * 8.31 - 21.7, z * 8.31 + 5.9) < clump * clump * 0.78;
}

/** Where trees and set stones may stand: dry, off the path, off steep ground. */
export function plantableMask(x, z) {
  if (!dryMask(x, z)) return false;
  if (pondQ(x, z) < 1.16) return false;
  if (pathDistance(x, z) < 1.9) return false;
  if (gradientAt(x, z) > 0.72) return false;
  return true;
}
