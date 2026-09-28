// Nova Promenade — background and midground architectural mass (§10.1).
//
// WHAT THIS OWNS
//   Every building in the scene EXCEPT the four hero blocks. §10.1 names four
//   (ARCH-CITY-01..04) plus one unnamed "secondary skyline mass"; the
//   art-direction parity analysis measured ~30 distinct masses in the
//   benchmark plate `01-city-street-vehicles.png`. This module authors 28.
//
// WHAT IT IS BUILT FROM
//   `src/buildinggen` — the shipped seeded shape grammar. Nothing here is a
//   procedural box (§2): every volume comes out of `resolveBuildingPlan` ->
//   `meshBuildingPlan`, which produces leaning wall pairs, a stone base
//   course, per-bay pilaster/floor-band articulation, recessed window frames
//   with glass thickness and sills, doors with frames and thresholds, roof
//   slabs with undersides, fascia and gable infill, and a buried foundation
//   skirt. Read `docs/capability-status.md` D19-037 for the honest limits.
//
// HOW A CITY COMES OUT OF A VILLAGE GRAMMAR
//   buildinggen's *schema ranges* are village-scale (width <= 14 m, 6 floors)
//   but `createBuildingSettings` only clamps `floors`, `roof.kind` and
//   `footprint.kind` — width, depth, floorHeight, pitch and the window
//   dimensions pass through unclamped (D19-038). So one volume reaches
//   ~30 x 20 m and ~24 m tall, and a city mass is a deliberate COMPOSITION of
//   1..4 such volumes: podium + setback tower, ziggurat, courtyard U, party-
//   wall twin, corner tower. Roof pitch driven to 0.05..0.12 gives the flat
//   roof-with-a-fall that modern architecture wants, without inventing a roof
//   kind the 1000-seed invariant suite has never seen.
//
// DETERMINISM
//   Every seed in this file is an authored constant. The only randomness is
//   `mulberry32` fed from those constants. No Math.random, no Date, no
//   per-load regeneration — a precondition of the filler contract's
//   equivalence test (docs/capability-status.md).

import * as THREE from 'three/webgpu';

import { createBuildingFromRecipe } from '../../../src/buildinggen/buildingRecipe.js';
import { resolveBuildingPlan, checkPlanInvariants } from '../../../src/buildinggen/buildingGrammar.js';
import { createBuildingSettings } from '../../../src/buildinggen/buildingSettings.js';
import { mergePainted } from '../../../src/propgen/propParts.js';
import { CHARACTER_IDS, decorateVolume } from './facade.js';
import { CityParts } from './parts.js';

// ---------------------------------------------------------------------------
// 1. World frame, keep-outs, and the hero integration points
// ---------------------------------------------------------------------------

/** §10.1: 160 x 140 m authored world; hero camera space is the central 70 x 55. */
export const CITY_BOUNDS = Object.freeze({
  min: Object.freeze({ x: -80, z: -70 }),
  max: Object.freeze({ x: 80, z: 70 }),
});

/** §10.1 hero mark. Yua faces south-southwest for the establishing shot. */
export const YUA_MARK = Object.freeze({ x: 0, y: 0, z: 4 });

/**
 * §10.1 hero placements. NOT generated here — these are the four blocks the
 * architecture owner delivers at full §8 construction. Listed so this module
 * can reserve their parcels and so the integration points are explicit.
 */
export const HERO_BLOCKS = Object.freeze([
  Object.freeze({ id: 'ARCH-CITY-01', x: -18, y: 0, z: -8, reserve: 14, role: 'recessed arcade, both street facades exposed' }),
  Object.freeze({ id: 'ARCH-CITY-02', x: -24, y: 0, z: -32, reserve: 15, role: 'skyline anchor — never directly behind Yua\'s head' }),
  Object.freeze({ id: 'ARCH-CITY-03', x: -16, y: 0, z: 20, reserve: 14, role: 'warm side-street pocket for the S04 close shot' }),
  Object.freeze({ id: 'ARCH-CITY-04', x: 20, y: 0, z: -10, reserve: 15, role: 'destination, balances the hero corner' }),
]);

/**
 * Street and plaza voids. Authored from §10.1's diagram: a 22 m avenue N-S, a
 * cross street E-W, and the 28 x 22 m plaza that carries Yua. Nothing this
 * module places may intersect them.
 */
const KEEPOUT_RECTS = Object.freeze([
  Object.freeze({ id: 'avenue', minX: -12, maxX: 12, minZ: -78, maxZ: 78 }),
  Object.freeze({ id: 'cross-street', minX: -80, maxX: 80, minZ: 0, maxZ: 17 }),
  Object.freeze({ id: 'plaza', minX: -16, maxX: 16, minZ: -10, maxZ: 16 }),
]);

/**
 * Yua's head clearance. §10.1 forbids ARCH-CITY-02 directly behind her head;
 * this module extends the rule to every mass it owns by refusing the whole
 * near cylinder around the hero mark.
 */
const YUA_CLEARANCE = 21;

// ---------------------------------------------------------------------------
// 2. Depth bands and authored aerial perspective
// ---------------------------------------------------------------------------

// The parity analysis §5.4 is explicit: the benchmark resolves distance into
// DISCRETE value bands (02 shows three, 08 shows two flat pale plateaus), and
// a continuous exponential fog ramp produces mush instead. So haze is authored
// into the vertex colour per band, as a step function, on top of whatever the
// atmosphere does. Four plateaus, measured from the S01 camera eye.

/** S01 eye position — the origin distance bands are measured from. */
export const BAND_ORIGIN = Object.freeze({ x: 5, y: 11.5, z: 52 });

/** Low-sky value the far bands converge on. Pale, cool, desaturated. */
const HAZE = Object.freeze([0.795, 0.855, 0.925]);

// `value` is the band's albedo multiplier and it is doing the heavy lifting:
// aerial perspective reads as a VALUE step long before it reads as a hue shift,
// and a palette that is already pale everywhere produces one plateau no matter
// how much haze is mixed in. Near bands are pulled down so they can hold a wide
// range under the sun; far bands ride up to the sky plateau and compress.
const BANDS = Object.freeze([
  // The previous pass drove near-band ALBEDO down to separate the plateaus and
  // it was the wrong lever: it crushed every family toward the same dark cream
  // and produced exactly the "same beige facade on every mass" read. Near-field
  // value variety belongs to the PALETTE (which now spans 0.37..0.90 wall
  // value); the bands only do what atmosphere does — desaturate and lift
  // toward the sky plateau, in discrete steps.
  //   id            maxDistance  value  haze   desat  variation  detail
  Object.freeze({ id: 'near-mid', max: 62, value: 1, haze: 0.0, desat: 0.0, variation: 0.075, detail: 'full' }),
  Object.freeze({ id: 'mid', max: 105, value: 0.98, haze: 0.11, desat: 0.14, variation: 0.06, detail: 'full' }),
  Object.freeze({ id: 'far', max: 165, value: 0.96, haze: 0.2, desat: 0.22, variation: 0.036, detail: 'mid' }),
  Object.freeze({ id: 'distant', max: Infinity, value: 0.95, haze: 0.58, desat: 0.6, variation: 0.02, detail: 'far' }),
]);

function bandFor(x, z) {
  const distance = Math.hypot(x - BAND_ORIGIN.x, z - BAND_ORIGIN.z);
  for (let index = 0; index < BANDS.length; index += 1) {
    if (distance <= BANDS[index].max) return { ...BANDS[index], index, distance };
  }
  const last = BANDS[BANDS.length - 1];
  return { ...last, index: BANDS.length - 1, distance };
}

const luma = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

/** Step the value plateau, desaturate toward own luma, then mix the haze. */
function atmospheric(rgb, band) {
  const scaled = rgb.map((channel) => channel * band.value);
  const grey = luma(scaled);
  return scaled.map((channel, index) => {
    const flattened = channel + (grey - channel) * band.desat;
    return flattened + (HAZE[index] - flattened) * band.haze;
  });
}

// ---------------------------------------------------------------------------
// 3. Colour structure (§10.1)
// ---------------------------------------------------------------------------
//
// 60% pale stone / cool concrete, 25% blue-grey glass and metal, 10% living
// green, 5% coral / teal / amber accent — with warm interior pools against a
// bright cool exterior. Families below carry the first two budgets in the wall
// role; green arrives as planted roof terraces (the tree owner carries street
// green); accents are held to doors, entrance canopies and two trim bands, so
// they stay the only high-saturation pixels in frame (analysis §5.5).

// A family is authored as ONE wall colour plus a derived set. Deriving the
// sub-roles is not a shortcut — it is the point. `detailOcc` (the parity
// metric's "how much of the frame carries information") is produced almost
// entirely by the value STEP between a pale wall and the darker mullion,
// pilaster, floor band, sill, base course and glazing sitting on it. Families
// with independently authored sub-roles drifted toward the wall value and the
// whole facade flattened into one plateau; these ratios hold the step open on
// every mass, in every band, by construction.
const shade = (rgb, factor) => rgb.map((channel) => channel * factor);

/**
 * The city's single colour-temperature control.
 *
 * Measured on the S01 plate before it existed: mean saturation 0.313 against
 * the analysis ceiling of 0.30, and — the worse number — the darkest luminance
 * quartile of the lower two-thirds at hue 28deg, where the benchmark city
 * plates measure 214-267deg and §5.2 requires 250-270. The darkest quartile in
 * this frame is not the road, it is the SHADED SIDE OF THE ARCHITECTURE, so a
 * facade palette that is warm on every family makes a warm shadow family no
 * matter what the fill light does. Exposure does not fix it (swept 0.30-0.52:
 * hue held at 27-28deg and saturation got worse as ACES came off its shoulder).
 *
 * So chroma is scaled globally and the residual is biased cool, once, here —
 * rather than by hand-tuning twelve families and hoping.
 */
const CHROMA = 0.72;
const COOL_BIAS = 0.05;
function cityTemperature(rgb) {
  const grey = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const pulled = rgb.map((channel) => grey + (channel - grey) * CHROMA);
  return [
    Math.min(pulled[0] * (1 - COOL_BIAS * 0.75), 1),
    Math.min(pulled[1] * (1 - COOL_BIAS * 0.2), 1),
    Math.min(pulled[2] * (1 + COOL_BIAS), 1),
  ];
}
const family = (klass, rawWall) => {
  const wall = cityTemperature(rawWall);
  return Object.freeze({
    beam: Object.freeze(shade(wall, 0.5)), // mullions, pilasters, floor bands
    class: klass,
    roof: Object.freeze(shade(wall, 0.42)),
    trim: Object.freeze(shade(wall, 0.72)), // sills, base course, thresholds
    wall: Object.freeze(wall),
  });
};

const FAMILY = Object.freeze({
  // 60% pale stone / cool concrete — but spanning a real value range rather
  // than one cream. §10.1's percentages are a HUE budget; nothing in them
  // requires every stone mass to sit at the same luminance, and the benchmark
  // city plate resolves to three luma plateaus at 0.12 / 0.22 / 0.34.
  paleStone: family('stone', [0.872, 0.866, 0.848]),
  warmStone: family('stone', [0.878, 0.842, 0.784]),
  paleConcrete: family('stone', [0.812, 0.826, 0.842]),
  greyStone: family('stone', [0.735, 0.733, 0.720]),
  coolConcrete: family('stone', [0.632, 0.665, 0.702]),
  sandBrick: family('stone', [0.712, 0.624, 0.528]),
  oxideBrick: family('stone', [0.478, 0.376, 0.338]),
  deepSlate: family('stone', [0.352, 0.372, 0.398]),
  // 25% blue-grey glass and metal.
  blueGlass: family('glassMetal', [0.478, 0.562, 0.632]),
  slateGlass: family('glassMetal', [0.312, 0.372, 0.438]),
  greyMetal: family('glassMetal', [0.598, 0.638, 0.668]),
  bronzeMetal: family('glassMetal', [0.522, 0.472, 0.402]),
});

/** Planted roof terrace — §10.1's 10% living green, in the background band. */
const GREEN_ROOF = Object.freeze([0.278, 0.402, 0.252]);
const GREEN_ROOF_DEEP = Object.freeze([0.222, 0.336, 0.212]);

/** §10.1's 5%. Held to doors, canopies and two trim bands only. */
const ACCENT = Object.freeze({
  coral: [0.878, 0.412, 0.318],
  teal: [0.212, 0.612, 0.598],
  amber: [0.925, 0.678, 0.282],
  deepTeal: [0.145, 0.452, 0.475],
});

/** Cool exterior glazing (the 25% budget) and the warm interior pool. */
const GLASS_COOL = Object.freeze([0.132, 0.186, 0.242]);
const GLASS_COOL_LIGHT = Object.freeze([0.252, 0.322, 0.392]);
const GLASS_WARM = Object.freeze([0.925, 0.688, 0.352]);
const GLASS_WARM_DEEP = Object.freeze([0.845, 0.545, 0.238]);

/** What you see THROUGH the glass. Real interior depth, not a painted panel. */
const INTERIOR_COOL = Object.freeze([0.072, 0.086, 0.104]);
const INTERIOR_WARM = Object.freeze([0.412, 0.268, 0.138]);

// ---------------------------------------------------------------------------
// 4. Seeded helpers
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// 5. Volume authoring — one buildinggen call's worth of settings
// ---------------------------------------------------------------------------

/**
 * Builds a full buildinggen settings object for one volume. Every group is
 * supplied in full so `BUILDING_TYPE_DEFAULTS` cannot leak village proportions
 * back in; `type` is then only choosing whether a rooftop service riser is
 * drawn (`cottage`/`farmhouse` do, everything else does not) — never `shrine`,
 * whose open front and veranda plinth have no city reading.
 */
function volumeSettings({
  seed,
  type = 'shed',
  kind = 'rect',
  width,
  depth,
  wingRatio = 0.55,
  floors,
  floorHeight,
  inset = 0,
  wallLean = 0,
  roofKind = 'shed',
  pitch = 0.09,
  overhang = 0.32,
  ridgeDecor = 0,
  curvature = 0,
  beams = 0.4,
  bayWidth = 2,
  windowChance = 0.85,
  windowWidth = 1.25,
  windowHeight = 1.9,
  doorWidth = 2.1,
  doorHeight = 2.6,
  baseHeight = 0.55,
  wall,
  beam,
  roof,
  trim,
  door,
  glass,
  variation,
}) {
  // D19-039: the grammar's collision-circle chain stops covering the middle of
  // a rect once its aspect passes ~2.4:1, so invariant 5 fails. City slabs want
  // to be long, but not at the price of a broken footprint — hold every volume
  // inside 2.25:1 and the invariant stays clean at city scale.
  const MAX_ASPECT = 2.05;
  const safeDepth = Math.max(depth, width / MAX_ASPECT);
  const safeWidth = Math.max(width, safeDepth / MAX_ASPECT);

  return createBuildingSettings({
    facade: { bayWidth, baseHeight, beams, doorHeight, doorWidth, windowChance, windowHeight, windowWidth },
    footprint: { depth: safeDepth, kind, width: safeWidth, wingRatio },
    massing: { atticRatio: 0, floorHeight, floors, inset, wallLean },
    palette: { beam, door, glass, roof, trim, variation, wall },
    roof: { curvature, kind: roofKind, overhang, pitch, ridgeDecor },
    seed,
    type,
  });
}

// Window rhythm presets — the facade-rhythm variation axis. Each is a real
// building type's bay module, not a jitter of one number.
const RHYTHM = Object.freeze({
  // Wide horizontal ribbon glazing: post-war commercial.
  ribbon: { bayWidth: 2.15, windowChance: 1, windowWidth: 1.82, windowHeight: 2.2, beams: 0.42 },
  // Tall narrow punched openings on a strong pilaster grid: civic / stone.
  civic: { bayWidth: 1.35, windowChance: 0.94, windowWidth: 0.78, windowHeight: 2.1, beams: 0.95 },
  // Square office punch, medium module.
  office: { bayWidth: 1.62, windowChance: 0.92, windowWidth: 1.06, windowHeight: 1.6, beams: 0.68 },
  // Sparse deep-set openings on a wide module: warehouse / back-of-house.
  utility: { bayWidth: 2.35, windowChance: 0.52, windowWidth: 1.05, windowHeight: 1.25, beams: 0.55 },
  // Dense small module: residential slab.
  residential: { bayWidth: 1.44, windowChance: 0.84, windowWidth: 0.94, windowHeight: 1.35, beams: 0.5 },
  // Full-height mullioned curtain wall, articulation carried by the mullions.
  curtain: { bayWidth: 1.92, windowChance: 1, windowWidth: 1.66, windowHeight: 2.45, beams: 0.78 },
  // Deep-plan floorplate with a banded spandrel read: the quiet block in a run.
  banded: { bayWidth: 2.05, windowChance: 0.72, windowWidth: 1.55, windowHeight: 1.1, beams: 0.62 },
  // Retail plinth: shallow wide shopfront bays, warm behind the glass.
  retail: { bayWidth: 2.25, windowChance: 1, windowWidth: 1.95, windowHeight: 2.6, beams: 0.55 },
});

const ROOF_TREATMENT = Object.freeze({
  // Flat with a fall — pitch this low reads as a parapet plane.
  flat: { roofKind: 'shed', pitch: 0.055, overhang: 0.34, ridgeDecor: 0 },
  // Flat with a deeper eave shadow line.
  cornice: { roofKind: 'shed', pitch: 0.07, overhang: 0.85, ridgeDecor: 0 },
  // Shallow four-way fall, reads as a capped crown.
  crown: { roofKind: 'hip', pitch: 0.11, overhang: 0.55, ridgeDecor: 0.55 },
  // Low double fall with a ridge cap: mid-century commercial.
  lowGable: { roofKind: 'gable', pitch: 0.2, overhang: 0.5, ridgeDecor: 0.35 },
  // Genuinely pitched — the older low-rise stock in the block.
  pitched: { roofKind: 'gable', pitch: 0.62, overhang: 0.7, ridgeDecor: 0.5 },
  // Pitched hip on the older corner buildings.
  hipped: { roofKind: 'hip', pitch: 0.55, overhang: 0.65, ridgeDecor: 0.45 },
  // Shallow mono-pitch, one strong direction.
  mono: { roofKind: 'shed', pitch: 0.28, overhang: 0.62, ridgeDecor: 0 },
});

// ---------------------------------------------------------------------------
// 6. Massing archetypes
// ---------------------------------------------------------------------------
//
// Nine of them. Each returns volumes in the mass's LOCAL frame:
//   { dx, dz, dy, yaw, settings }
// The analysis asks for >= 3 footprint archetypes and >= 4 height tiers; this
// delivers 9 massing archetypes across 3 footprint kinds and 4 height tiers,
// which is what makes 26 masses read as individually designed rather than as
// one recipe with jitter.

const TIER_HEIGHT = Object.freeze({ low: 13.5, mid: 23, tall: 39, landmark: 63 });

/** Split a target height into <= 6-floor buildinggen volumes. */
function splitFloors(target, floorHeight) {
  const totalFloors = Math.max(2, Math.round(target / floorHeight));
  const volumes = [];
  let remaining = totalFloors;
  while (remaining > 0) {
    const take = Math.min(6, remaining);
    // Never leave a 1-floor crumb on top — fold it into the volume below.
    if (remaining - take === 1) volumes.push(take - 1);
    else volumes.push(take);
    remaining -= volumes[volumes.length - 1];
  }
  return volumes;
}

function paletteFor(mass, band, roleOverrides = {}) {
  const fam = FAMILY[mass.family];
  const warm = roleOverrides.warmInterior === true;
  return {
    beam: atmospheric(roleOverrides.beam ?? fam.beam, band),
    // The 5% accent budget lives here and on shopfront returns and entrance
    // canopies. Doors, returns and canopies are the only saturated pixels in
    // the architecture, which is what keeps mean saturation under the
    // analysis ceiling of 0.30 while still reading as coral/teal/amber.
    door: atmospheric(roleOverrides.door ?? ACCENT[mass.accent] ?? fam.trim, band),
    glass: atmospheric(roleOverrides.glass ?? GLASS_COOL, band),
    // Warm interiors are a light source read, so they are deliberately NOT
    // hazed toward the cool sky plateau — that is what makes them pool.
    glassWarm: mass.warmDeep ? GLASS_WARM_DEEP : GLASS_WARM,
    interior: warm
      ? INTERIOR_WARM
      : atmospheric(roleOverrides.interior ?? INTERIOR_COOL, band),
    roof: atmospheric(roleOverrides.roof ?? (mass.greenRoof ? GREEN_ROOF : fam.roof), band),
    trim: atmospheric(roleOverrides.trim ?? fam.trim, band),
    variation: band.variation,
    wall: atmospheric(roleOverrides.wall ?? fam.wall, band),
  };
}

/**
 * `retailPlinth` marks the volume that gets warm glazing — §10.1's "warm
 * interior pools against a bright cool exterior". Only the near two bands
 * carry it; a warm pool at 150 m is a colour-noise pixel, not a pool.
 */
function glassFor(mass, band, isPlinth) {
  if (isPlinth && band.index <= 1) return mass.warmDeep ? GLASS_WARM_DEEP : GLASS_WARM;
  if (band.index >= 2) return GLASS_COOL_LIGHT;
  return GLASS_COOL;
}

const ARCHETYPES = {
  /** Single wide street-wall slab. The block's connective tissue. */
  slab(mass, band, random) {
    const floorHeight = lerp(3.3, 3.9, random());
    const floors = splitFloors(TIER_HEIGHT[mass.tier], floorHeight);
    const width = mass.width ?? lerp(20, 28, random());
    const depth = mass.depth ?? lerp(13, 18, random());
    const volumes = [];
    let dy = 0;
    floors.forEach((count, index) => {
      const isPlinth = index === 0;
      const rhythm = isPlinth && mass.plinth ? RHYTHM[mass.plinth] : RHYTHM[mass.rhythm];
      const treatment = index === floors.length - 1 ? ROOF_TREATMENT[mass.roofTop] : ROOF_TREATMENT.flat;
      volumes.push({
        dx: 0,
        dy,
        dz: 0,
        yaw: 0,
        settings: volumeSettings({
          ...rhythm,
          ...treatment,
          baseHeight: isPlinth ? 0.62 : 0.2,
          depth: depth - index * 0.5,
          floorHeight,
          floors: count,
          seed: mass.seed + index * 101,
          type: index === floors.length - 1 && mass.riser ? 'cottage' : 'shed',
          wallLean: index === 0 ? 0.004 : 0,
          width: width - index * 0.5,
          ...paletteFor(mass, band, {
            glass: glassFor(mass, band, isPlinth),
            roof: index === floors.length - 1 && mass.greenRoof ? GREEN_ROOF : undefined,
          }),
        }),
      });
      dy += count * floorHeight;
    });
    return volumes;
  },

  /** Wide low podium carrying a narrower, offset tower. */
  podiumTower(mass, band, random) {
    const podiumFloorHeight = lerp(4.1, 4.8, random());
    const podiumFloors = 2 + Math.round(random());
    const towerFloorHeight = lerp(3.2, 3.6, random());
    const podiumWidth = mass.width ?? lerp(24, 32, random());
    const podiumDepth = mass.depth ?? lerp(16, 21, random());
    const towerWidth = podiumWidth * lerp(0.48, 0.66, random());
    const towerDepth = podiumDepth * lerp(0.52, 0.7, random());
    const offsetX = (random() - 0.5) * (podiumWidth - towerWidth) * 0.8;
    const offsetZ = (random() - 0.5) * (podiumDepth - towerDepth) * 0.7;
    const podiumHeight = podiumFloors * podiumFloorHeight;
    const towerFloors = splitFloors(Math.max(TIER_HEIGHT[mass.tier] - podiumHeight, towerFloorHeight * 3), towerFloorHeight);

    const volumes = [{
      dx: 0,
      dy: 0,
      dz: 0,
      yaw: 0,
      settings: volumeSettings({
        ...RHYTHM[mass.plinth ?? 'retail'],
        ...ROOF_TREATMENT.cornice,
        baseHeight: 0.7,
        depth: podiumDepth,
        floorHeight: podiumFloorHeight,
        floors: podiumFloors,
        seed: mass.seed,
        wallLean: 0.003,
        width: podiumWidth,
        ...paletteFor(mass, band, { glass: glassFor(mass, band, true) }),
      }),
    }];

    let dy = podiumHeight;
    towerFloors.forEach((count, index) => {
      const treatment = index === towerFloors.length - 1 ? ROOF_TREATMENT[mass.roofTop] : ROOF_TREATMENT.flat;
      volumes.push({
        dx: offsetX,
        dy,
        dz: offsetZ,
        yaw: index === 0 ? (random() - 0.5) * 0.09 : 0,
        settings: volumeSettings({
          ...RHYTHM[mass.rhythm],
          ...treatment,
          baseHeight: 0.18,
          depth: towerDepth - index * 0.7,
          floorHeight: towerFloorHeight,
          floors: count,
          inset: 0.03,
          seed: mass.seed + 211 + index * 37,
          type: index === towerFloors.length - 1 && mass.riser ? 'cottage' : 'shed',
          width: towerWidth - index * 0.7,
          ...paletteFor(mass, band, {
            glass: glassFor(mass, band, false),
            roof: index === towerFloors.length - 1 && mass.greenRoof ? GREEN_ROOF_DEEP : undefined,
          }),
        }),
      });
      dy += count * towerFloorHeight;
    });
    return volumes;
  },

  /** Ziggurat: three volumes stepping in on all sides. */
  setbackStack(mass, band, random) {
    const floorHeight = lerp(3.4, 4.0, random());
    const target = TIER_HEIGHT[mass.tier];
    const steps = 3;
    const baseWidth = mass.width ?? lerp(24, 30, random());
    const baseDepth = mass.depth ?? lerp(17, 22, random());
    const shrink = lerp(0.7, 0.8, random());
    const perStep = Math.max(2, Math.round(target / floorHeight / steps));
    const volumes = [];
    let dy = 0;
    for (let step = 0; step < steps; step += 1) {
      const scale = shrink ** step;
      const last = step === steps - 1;
      const treatment = last ? ROOF_TREATMENT[mass.roofTop] : ROOF_TREATMENT.cornice;
      volumes.push({
        dx: 0,
        dy,
        dz: 0,
        yaw: 0,
        settings: volumeSettings({
          ...RHYTHM[step === 0 ? (mass.plinth ?? mass.rhythm) : mass.rhythm],
          ...treatment,
          baseHeight: step === 0 ? 0.68 : 0.16,
          depth: baseDepth * scale,
          floorHeight,
          floors: Math.min(6, perStep + (step === 0 ? 1 : 0)),
          seed: mass.seed + step * 313,
          type: last && mass.riser ? 'cottage' : 'shed',
          wallLean: step === 0 ? 0.003 : 0,
          width: baseWidth * scale,
          ...paletteFor(mass, band, {
            glass: glassFor(mass, band, step === 0),
            roof: last && mass.greenRoof ? GREEN_ROOF : undefined,
            wall: step === steps - 1 && mass.crownFamily
              ? FAMILY[mass.crownFamily].wall
              : undefined,
          }),
        }),
      });
      dy += Math.min(6, perStep + (step === 0 ? 1 : 0)) * floorHeight;
    }
    return volumes;
  },

  /** Single L-plan block — buildinggen's own composite footprint. */
  lBlock(mass, band, random) {
    const floorHeight = lerp(3.3, 3.8, random());
    const floors = splitFloors(TIER_HEIGHT[mass.tier], floorHeight);
    const width = mass.width ?? lerp(18, 25, random());
    const depth = mass.depth ?? lerp(13, 17, random());
    const wingRatio = lerp(0.45, 0.75, random());
    const volumes = [];
    let dy = 0;
    floors.forEach((count, index) => {
      const last = index === floors.length - 1;
      volumes.push({
        dx: 0,
        dy,
        dz: 0,
        yaw: 0,
        settings: volumeSettings({
          ...RHYTHM[index === 0 ? (mass.plinth ?? mass.rhythm) : mass.rhythm],
          ...ROOF_TREATMENT[last ? mass.roofTop : 'flat'],
          baseHeight: index === 0 ? 0.6 : 0.18,
          depth: depth - index * 0.4,
          floorHeight,
          floors: count,
          kind: 'L',
          seed: mass.seed + index * 149,
          type: last && mass.riser ? 'farmhouse' : 'shed',
          wallLean: index === 0 ? 0.005 : 0,
          width: width - index * 0.4,
          wingRatio,
          ...paletteFor(mass, band, {
            glass: glassFor(mass, band, index === 0),
            roof: last && mass.greenRoof ? GREEN_ROOF : undefined,
          }),
        }),
      });
      dy += count * floorHeight;
    });
    return volumes;
  },

  /** Single T-plan block — a cross-wing pushing toward the street. */
  tBlock(mass, band, random) {
    const floorHeight = lerp(3.4, 3.9, random());
    const floors = splitFloors(TIER_HEIGHT[mass.tier], floorHeight);
    const width = mass.width ?? lerp(20, 27, random());
    const depth = mass.depth ?? lerp(12, 16, random());
    const volumes = [];
    let dy = 0;
    floors.forEach((count, index) => {
      const last = index === floors.length - 1;
      volumes.push({
        dx: 0,
        dy,
        dz: 0,
        yaw: 0,
        settings: volumeSettings({
          ...RHYTHM[index === 0 ? (mass.plinth ?? mass.rhythm) : mass.rhythm],
          ...ROOF_TREATMENT[last ? mass.roofTop : 'flat'],
          baseHeight: index === 0 ? 0.65 : 0.18,
          depth: depth - index * 0.35,
          floorHeight,
          floors: count,
          kind: 'T',
          seed: mass.seed + index * 173,
          type: last && mass.riser ? 'cottage' : 'shed',
          wallLean: index === 0 ? 0.005 : 0,
          width: width - index * 0.35,
          wingRatio: lerp(0.5, 0.8, random()),
          ...paletteFor(mass, band, {
            glass: glassFor(mass, band, index === 0),
            roof: last && mass.greenRoof ? GREEN_ROOF_DEEP : undefined,
          }),
        }),
      });
      dy += count * floorHeight;
    });
    return volumes;
  },

  /** U-plan: a spine with two perpendicular wings — the courtyard read. */
  courtyard(mass, band, random) {
    const floorHeight = lerp(3.4, 3.9, random());
    const spineFloors = Math.min(6, Math.max(3, Math.round(TIER_HEIGHT[mass.tier] / floorHeight)));
    const spineWidth = mass.width ?? lerp(24, 30, random());
    const spineDepth = mass.depth ?? lerp(11, 14, random());
    const wingLength = lerp(14, 19, random());
    const wingDepth = lerp(9, 11.5, random());
    const wingFloors = Math.max(2, spineFloors - 1 - Math.round(random()));
    const palette = paletteFor(mass, band, { glass: glassFor(mass, band, true) });
    const wingPalette = paletteFor(mass, band, {
      glass: glassFor(mass, band, false),
      wall: mass.wingFamily ? FAMILY[mass.wingFamily].wall : undefined,
    });

    const volumes = [{
      dx: 0,
      dy: 0,
      dz: 0,
      yaw: 0,
      settings: volumeSettings({
        ...RHYTHM[mass.rhythm],
        ...ROOF_TREATMENT[mass.roofTop],
        baseHeight: 0.62,
        depth: spineDepth,
        floorHeight,
        floors: spineFloors,
        seed: mass.seed,
        type: mass.riser ? 'cottage' : 'shed',
        wallLean: 0.004,
        width: spineWidth,
        ...palette,
      }),
    }];
    for (const side of [-1, 1]) {
      volumes.push({
        dx: side * (spineWidth / 2 - wingDepth / 2),
        dy: 0,
        dz: spineDepth / 2 + wingLength / 2 - 0.4,
        yaw: Math.PI / 2,
        settings: volumeSettings({
          ...RHYTHM[mass.plinth ?? 'residential'],
          ...ROOF_TREATMENT[side < 0 ? 'flat' : 'cornice'],
          baseHeight: 0.55,
          depth: wingDepth,
          floorHeight,
          floors: wingFloors,
          seed: mass.seed + (side < 0 ? 401 : 587),
          wallLean: 0.004,
          width: wingLength,
          ...wingPalette,
        }),
      });
    }
    return volumes;
  },

  /** Two volumes on a shared party wall at clearly different heights. */
  twin(mass, band, random) {
    const floorHeight = lerp(3.3, 3.8, random());
    const leftWidth = lerp(13, 18, random());
    const rightWidth = lerp(11, 16, random());
    const depth = mass.depth ?? lerp(13, 17, random());
    const tallFloors = Math.min(6, Math.max(3, Math.round(TIER_HEIGHT[mass.tier] / floorHeight)));
    const shortFloors = Math.max(2, tallFloors - 2 - Math.round(random()));
    const volumes = [];
    // Party wall on the local origin: the two halves meet, they do not float.
    const halves = [
      { width: leftWidth, centre: -leftWidth / 2, floors: tallFloors, sign: -1, family: mass.family, rhythm: mass.rhythm, roofTop: mass.roofTop, seed: mass.seed },
      { width: rightWidth, centre: rightWidth / 2, floors: shortFloors, sign: 1, family: mass.twinFamily ?? mass.family, rhythm: mass.twinRhythm ?? 'residential', roofTop: mass.twinRoof ?? 'pitched', seed: mass.seed + 733 },
    ];
    for (const half of halves) {
      const halfPalette = paletteFor({ ...mass, family: half.family }, band, {
        glass: glassFor(mass, band, true),
        roof: mass.greenRoof && half.sign < 0 ? GREEN_ROOF : undefined,
      });
      volumes.push({
        dx: half.centre,
        dy: 0,
        dz: half.sign * lerp(0, 1.4, random()),
        yaw: 0,
        settings: volumeSettings({
          ...RHYTHM[half.rhythm],
          ...ROOF_TREATMENT[half.roofTop],
          baseHeight: 0.6,
          depth: depth - (half.sign > 0 ? 1.6 : 0),
          floorHeight,
          floors: half.floors,
          seed: half.seed,
          type: half.sign < 0 && mass.riser ? 'cottage' : 'shed',
          wallLean: 0.006,
          width: half.width,
          ...halfPalette,
        }),
      });
    }
    return volumes;
  },

  /** Low L block with a slender tall shaft pinned to one corner. */
  cornerTower(mass, band, random) {
    const baseFloorHeight = lerp(3.6, 4.2, random());
    const baseFloors = 3 + Math.round(random());
    const baseWidth = mass.width ?? lerp(20, 26, random());
    const baseDepth = mass.depth ?? lerp(14, 18, random());
    const shaftSide = lerp(8, 11, random());
    const shaftFloorHeight = lerp(3.2, 3.5, random());
    const shaftFloors = splitFloors(TIER_HEIGHT[mass.tier], shaftFloorHeight);
    const cornerX = (baseWidth / 2 - shaftSide / 2) * (random() < 0.5 ? -1 : 1);
    const cornerZ = (baseDepth / 2 - shaftSide / 2) * (random() < 0.5 ? -1 : 1);

    const volumes = [{
      dx: 0,
      dy: 0,
      dz: 0,
      yaw: 0,
      settings: volumeSettings({
        ...RHYTHM[mass.plinth ?? 'retail'],
        ...ROOF_TREATMENT.cornice,
        baseHeight: 0.68,
        depth: baseDepth,
        floorHeight: baseFloorHeight,
        floors: baseFloors,
        kind: 'L',
        seed: mass.seed,
        wallLean: 0.005,
        width: baseWidth,
        wingRatio: 0.55,
        ...paletteFor(mass, band, { glass: glassFor(mass, band, true) }),
      }),
    }];

    let dy = 0;
    shaftFloors.forEach((count, index) => {
      const last = index === shaftFloors.length - 1;
      volumes.push({
        dx: cornerX,
        dy,
        dz: cornerZ,
        yaw: 0,
        settings: volumeSettings({
          ...RHYTHM[mass.rhythm],
          ...ROOF_TREATMENT[last ? mass.roofTop : 'flat'],
          baseHeight: index === 0 ? 0.5 : 0.14,
          depth: shaftSide - index * 0.45,
          floorHeight: shaftFloorHeight,
          floors: count,
          inset: 0.05,
          seed: mass.seed + 863 + index * 59,
          type: last && mass.riser ? 'cottage' : 'shed',
          width: shaftSide - index * 0.45,
          ...paletteFor(mass, band, { glass: glassFor(mass, band, false) }),
        }),
      });
      dy += count * shaftFloorHeight;
    });
    return volumes;
  },

  /** A run of three narrow party-wall volumes stepping down along the street. */
  terrace(mass, band, random) {
    const floorHeight = lerp(3.3, 3.7, random());
    const topFloors = Math.min(6, Math.max(3, Math.round(TIER_HEIGHT[mass.tier] / floorHeight)));
    const widths = [lerp(9, 12, random()), lerp(8, 11, random()), lerp(9, 13, random())];
    const depth = mass.depth ?? lerp(11, 15, random());
    const stepFamilies = [mass.family, mass.twinFamily ?? mass.family, mass.wingFamily ?? mass.family];
    const stepRhythms = [mass.rhythm, mass.twinRhythm ?? 'residential', mass.plinth ?? 'civic'];
    const stepRoofs = [mass.roofTop, mass.twinRoof ?? 'pitched', 'mono'];
    const total = widths.reduce((sum, value) => sum + value, 0);
    let cursor = -total / 2;
    const volumes = [];
    widths.forEach((width, index) => {
      const floors = Math.max(2, topFloors - index - (index === 2 ? 1 : 0));
      volumes.push({
        dx: cursor + width / 2,
        dy: 0,
        dz: lerp(-1.2, 1.2, random()),
        yaw: (random() - 0.5) * 0.05,
        settings: volumeSettings({
          ...RHYTHM[stepRhythms[index]],
          ...ROOF_TREATMENT[stepRoofs[index]],
          baseHeight: 0.58,
          depth,
          floorHeight,
          floors,
          seed: mass.seed + index * 907,
          type: index === 0 && mass.riser ? 'cottage' : 'shed',
          wallLean: 0.007,
          width,
          ...paletteFor({ ...mass, family: stepFamilies[index] }, band, {
            glass: glassFor(mass, band, true),
            roof: mass.greenRoof && index === 1 ? GREEN_ROOF : undefined,
          }),
        }),
      });
      cursor += width;
    });
    return volumes;
  },
};

// ---------------------------------------------------------------------------
// 7. The authored layout — 28 masses
// ---------------------------------------------------------------------------
//
// Hand-composed, not sampled. Every mass has its own seed, archetype, height
// tier, colour family, facade rhythm and roof treatment. §13 rejects "repeated
// building or prop pattern obvious in the hero frame", and the benchmark's ~30
// masses read as individually designed — so the anti-repetition rule here is
// structural, not statistical:
//
//   R1  no two masses share an archetype seed
//   R2  no two masses within 34 m share an archetype
//   R3  no two masses within 34 m share a height tier
//   R4  no two masses within 26 m share a colour family
//   R5  every archetype used at least twice, none more than 4 times
//   R6  >= 4 height tiers present, >= 6 roof treatments, >= 6 facade rhythms
//
// `verifyVariation()` asserts all six and is called on every build.

export const CITY_MASSES = Object.freeze([
  // --- Avenue frontage, west. Fills the gaps ARCH-CITY-01/02/03 leave in the
  //     west street wall and carries it north past the hero space.
  { accent: 'coral', id: 'CM-W1', x: -34, z: 50, yaw: 0.06, archetype: 'terrace', tier: 'low', family: 'oxideBrick', rhythm: 'civic', roofTop: 'pitched', twinFamily: 'paleStone', twinRhythm: 'residential', twinRoof: 'hipped', wingFamily: 'greyStone', plinth: 'retail', character: 'olderStock', seed: 1109, riser: true },
  { accent: 'teal', id: 'CM-W2', x: -34, z: -68, yaw: -0.04, archetype: 'lBlock', tier: 'mid', family: 'paleConcrete', rhythm: 'office', roofTop: 'cornice', plinth: 'retail', character: 'commercial', seed: 1213, greenRoof: true },
  { id: 'CM-W3', x: -32, z: -90, yaw: 0.11, archetype: 'podiumTower', tier: 'tall', family: 'blueGlass', rhythm: 'curtain', roofTop: 'flat', plinth: 'retail', character: 'curtainTower', seed: 1327, riser: true },

  // --- West outer column. The second rank behind the frontage: this is what
  //     turns a street wall into a city block depth-wise.
  { accent: 'amber', id: 'CM-W4', x: -64, z: 32, yaw: -0.05, archetype: 'twin', tier: 'mid', family: 'sandBrick', rhythm: 'residential', roofTop: 'hipped', twinFamily: 'warmStone', twinRhythm: 'civic', twinRoof: 'pitched', character: 'olderStock', seed: 1697, riser: true },
  { accent: 'deepTeal', id: 'CM-W5', x: -56, z: -28, yaw: -0.08, archetype: 'courtyard', tier: 'landmark', family: 'paleStone', rhythm: 'civic', roofTop: 'lowGable', wingFamily: 'greyStone', plinth: 'residential', character: 'civicStone', seed: 1451, greenRoof: true },
  { id: 'CM-W6', x: -60, z: -46, yaw: 0.09, archetype: 'slab', tier: 'low', family: 'deepSlate', rhythm: 'ribbon', roofTop: 'mono', plinth: 'retail', character: 'utilityBlock', seed: 2297 },
  { id: 'CM-W7', x: -62, z: -82, yaw: 0.03, archetype: 'setbackStack', tier: 'landmark', family: 'greyMetal', rhythm: 'utility', roofTop: 'crown', crownFamily: 'paleStone', plinth: 'blank', character: 'utilityBlock', seed: 1583, riser: true },

  // --- Avenue frontage, east. Balances ARCH-CITY-04 and closes the corner.
  { accent: 'coral', id: 'CM-E1', x: 30, z: 32, yaw: -0.1, archetype: 'cornerTower', tier: 'mid', family: 'deepSlate', rhythm: 'office', roofTop: 'crown', plinth: 'retail', character: 'curtainTower', seed: 1949, riser: true, greenRoof: true },
  { accent: 'amber', id: 'CM-E2', x: 32, z: -74, yaw: 0.05, archetype: 'tBlock', tier: 'low', family: 'warmStone', rhythm: 'utility', roofTop: 'lowGable', plinth: 'blank', character: 'olderStock', seed: 2063 },

  // --- §10.1's unnamed "secondary skyline mass" at (+28, -40), nudged 2 m east
  //     so its eave line clears the 22 m avenue void.
  { accent: 'amber', id: 'CM-SKY', x: 30, z: -42, yaw: -0.03, archetype: 'setbackStack', tier: 'landmark', family: 'paleStone', rhythm: 'civic', roofTop: 'crown', crownFamily: 'warmStone', plinth: 'retail', character: 'civicStone', seed: 2777, riser: true },

  // --- East outer column.
  { accent: 'teal', id: 'CM-E3', x: 60, z: 30, yaw: 0.07, archetype: 'slab', tier: 'tall', family: 'sandBrick', rhythm: 'ribbon', roofTop: 'cornice', plinth: 'retail', character: 'residentialSlab', seed: 1811, warmDeep: true },
  { id: 'CM-E4', x: 58, z: -20, yaw: 0.02, archetype: 'lBlock', tier: 'landmark', family: 'coolConcrete', rhythm: 'residential', roofTop: 'flat', plinth: 'retail', character: 'residentialSlab', seed: 2539, greenRoof: true },
  { id: 'CM-E5', x: 60, z: -48, yaw: 0.13, archetype: 'twin', tier: 'mid', family: 'oxideBrick', rhythm: 'curtain', roofTop: 'flat', twinFamily: 'coolConcrete', twinRhythm: 'ribbon', twinRoof: 'mono', character: 'olderStock', seed: 2657, greenRoof: true },
  { id: 'CM-E6', x: 64, z: -82, yaw: -0.06, archetype: 'podiumTower', tier: 'tall', family: 'bronzeMetal', rhythm: 'office', roofTop: 'flat', plinth: 'utility', character: 'commercial', seed: 2179, riser: true },

  // --- Far band. The avenue's terminating vista, held off the centreline so
  //     the 28 mm S01 reveal has sky to travel into and Yua's head reads
  //     against the brightest plane in frame (analysis §5.1).
  { id: 'CM-F1', x: -34, z: -108, yaw: 0.04, archetype: 'terrace', tier: 'mid', family: 'coolConcrete', rhythm: 'office', roofTop: 'mono', twinFamily: 'paleConcrete', twinRhythm: 'ribbon', twinRoof: 'flat', wingFamily: 'greyStone', plinth: 'civic', character: 'residentialSlab', seed: 2897, greenRoof: true },
  { id: 'CM-F2', x: 34, z: -112, yaw: -0.07, archetype: 'courtyard', tier: 'tall', family: 'blueGlass', rhythm: 'residential', roofTop: 'flat', wingFamily: 'coolConcrete', plinth: 'banded', character: 'curtainTower', seed: 3011 },
  { id: 'CM-F3', x: -64, z: -116, yaw: 0.08, archetype: 'slab', tier: 'landmark', family: 'greyMetal', rhythm: 'curtain', roofTop: 'cornice', plinth: 'banded', character: 'utilityBlock', seed: 3137, riser: true },
  { id: 'CM-F4', x: 66, z: -120, yaw: -0.04, archetype: 'tBlock', tier: 'low', family: 'sandBrick', rhythm: 'civic', roofTop: 'pitched', plinth: 'utility', character: 'olderStock', seed: 3259 },
  { id: 'CM-F5', x: -36, z: -142, yaw: 0.02, archetype: 'cornerTower', tier: 'landmark', family: 'warmStone', rhythm: 'civic', roofTop: 'flat', plinth: 'utility', character: 'civicStone', seed: 3373, riser: true },
  { id: 'CM-F6', x: 38, z: -146, yaw: 0.06, archetype: 'setbackStack', tier: 'mid', family: 'slateGlass', rhythm: 'curtain', roofTop: 'lowGable', crownFamily: 'paleConcrete', plinth: 'banded', character: 'curtainTower', seed: 3491 },
  { id: 'CM-F7', x: -70, z: -150, yaw: -0.03, archetype: 'twin', tier: 'tall', family: 'paleConcrete', rhythm: 'ribbon', roofTop: 'flat', twinFamily: 'greyMetal', twinRhythm: 'office', twinRoof: 'mono', character: 'commercial', seed: 4211 },
  { id: 'CM-F8', x: 72, z: -152, yaw: 0.05, archetype: 'lBlock', tier: 'tall', family: 'greyStone', rhythm: 'office', roofTop: 'crown', plinth: 'banded', character: 'residentialSlab', seed: 4337 },

  // --- Distant band: flat pale plateaus at lo detail. Analysis §5.4 — the far
  //     band must land near sky value with a visible STEP, not a fog ramp. This
  //     is the band that closes the vista behind Yua, and it is deliberately
  //     the lowest-contrast mass in the frame.
  { id: 'CM-D1', x: -88, z: -182, yaw: 0.03, archetype: 'podiumTower', tier: 'landmark', family: 'paleStone', rhythm: 'civic', roofTop: 'flat', plinth: 'office', character: 'commercial', seed: 3617 },
  { id: 'CM-D2', x: -30, z: -196, yaw: -0.02, archetype: 'setbackStack', tier: 'tall', family: 'slateGlass', rhythm: 'office', roofTop: 'cornice', crownFamily: 'paleStone', plinth: 'banded', character: 'curtainTower', seed: 3733 },
  { id: 'CM-D3', x: 6, z: -210, yaw: 0.05, archetype: 'slab', tier: 'landmark', family: 'paleStone', rhythm: 'ribbon', roofTop: 'flat', plinth: 'retail', character: 'civicStone', seed: 3851 },
  { id: 'CM-D4', x: 44, z: -190, yaw: -0.05, archetype: 'courtyard', tier: 'mid', family: 'coolConcrete', rhythm: 'residential', roofTop: 'mono', wingFamily: 'paleConcrete', plinth: 'banded', character: 'residentialSlab', seed: 3967 },
  { id: 'CM-D5', x: 94, z: -176, yaw: 0.04, archetype: 'cornerTower', tier: 'landmark', family: 'paleConcrete', rhythm: 'curtain', roofTop: 'flat', plinth: 'office', character: 'commercial', seed: 4091 },
  { id: 'CM-D6', x: -56, z: -220, yaw: -0.04, archetype: 'tBlock', tier: 'landmark', family: 'greyStone', rhythm: 'banded', roofTop: 'crown', plinth: 'utility', character: 'utilityBlock', seed: 4457 },
].map(Object.freeze));

// ---------------------------------------------------------------------------
// 8. Layout validation — keep-outs and anti-repetition, asserted
// ---------------------------------------------------------------------------

/**
 * Keep-out validation runs against the MEASURED world-space XZ footprint of
 * every mass — the union of its volumes' grammar bounds under the volume and
 * mass transforms — not against a guessed radius. That is the only version of
 * this check worth having: it fails when geometry actually intrudes.
 */
export function verifyPlacement(footprints) {
  const issues = [];

  const overlap = (box, rect) => (
    box.minX < rect.maxX && box.maxX > rect.minX
    && box.minZ < rect.maxZ && box.maxZ > rect.minZ
  );
  const distanceToBox = (box, x, z) => {
    const nearX = Math.max(box.minX, Math.min(x, box.maxX));
    const nearZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    return Math.hypot(x - nearX, z - nearZ);
  };

  for (const entry of footprints) {
    for (const rect of KEEPOUT_RECTS) {
      if (overlap(entry.box, rect)) issues.push(`${entry.id} intrudes on the ${rect.id} void`);
    }
    if (distanceToBox(entry.box, YUA_MARK.x, YUA_MARK.z) < YUA_CLEARANCE) {
      issues.push(`${entry.id} breaks Yua's ${YUA_CLEARANCE} m head clearance`);
    }
    for (const hero of HERO_BLOCKS) {
      if (distanceToBox(entry.box, hero.x, hero.z) < hero.reserve) {
        issues.push(`${entry.id} enters the ${hero.id} reserved parcel`);
      }
    }
  }

  // Masses may share a party wall; they may not occupy each other.
  for (let a = 0; a < footprints.length; a += 1) {
    for (let b = a + 1; b < footprints.length; b += 1) {
      const first = footprints[a].box;
      const second = footprints[b].box;
      const insetX = Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX);
      const insetZ = Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ);
      if (insetX > 1.5 && insetZ > 1.5) {
        issues.push(`${footprints[a].id}/${footprints[b].id} interpenetrate by ${Math.min(insetX, insetZ).toFixed(1)} m`);
      }
    }
  }
  return issues;
}

export function verifyVariation(masses = CITY_MASSES) {
  const issues = [];
  const seeds = new Set();
  const archetypeUse = new Map();

  for (const mass of masses) {
    if (seeds.has(mass.seed)) issues.push(`R1 duplicate seed ${mass.seed} on ${mass.id}`);
    seeds.add(mass.seed);
    archetypeUse.set(mass.archetype, (archetypeUse.get(mass.archetype) ?? 0) + 1);
  }

  for (let a = 0; a < masses.length; a += 1) {
    for (let b = a + 1; b < masses.length; b += 1) {
      const first = masses[a];
      const second = masses[b];
      const gap = Math.hypot(first.x - second.x, first.z - second.z);
      if (gap < 34 && first.archetype === second.archetype) {
        issues.push(`R2 ${first.id}/${second.id} share archetype ${first.archetype} at ${gap.toFixed(1)} m`);
      }
      if (gap < 34 && first.tier === second.tier) {
        issues.push(`R3 ${first.id}/${second.id} share tier ${first.tier} at ${gap.toFixed(1)} m`);
      }
      if (gap < 26 && first.family === second.family) {
        issues.push(`R4 ${first.id}/${second.id} share family ${first.family} at ${gap.toFixed(1)} m`);
      }
      if (gap < 34 && first.character === second.character) {
        issues.push(`R7 ${first.id}/${second.id} share facade character ${first.character} at ${gap.toFixed(1)} m`);
      }
    }
  }

  for (const [archetype, count] of archetypeUse) {
    if (count < 2) issues.push(`R5 archetype ${archetype} used only ${count}x`);
    if (count > 4) issues.push(`R5 archetype ${archetype} used ${count}x (max 4)`);
  }
  const characters = new Map();
  for (const mass of masses) {
    if (!CHARACTER_IDS.includes(mass.character)) {
      issues.push(`R7 ${mass.id} has unknown facade character "${mass.character}"`);
    }
    characters.set(mass.character, (characters.get(mass.character) ?? 0) + 1);
  }
  if (characters.size < CHARACTER_IDS.length) {
    issues.push(`R7 only ${characters.size} of ${CHARACTER_IDS.length} facade characters used`);
  }
  const tiers = new Set(masses.map((mass) => mass.tier));
  const roofs = new Set(masses.map((mass) => mass.roofTop));
  const rhythms = new Set(masses.map((mass) => mass.rhythm));
  const families = new Set(masses.map((mass) => mass.family));
  if (families.size < 10) issues.push(`R6 only ${families.size} colour families`);
  if (tiers.size < 4) issues.push(`R6 only ${tiers.size} height tiers`);
  if (roofs.size < 6) issues.push(`R6 only ${roofs.size} roof treatments`);
  if (rhythms.size < 6) issues.push(`R6 only ${rhythms.size} facade rhythms`);

  return {
    archetypes: Object.fromEntries(archetypeUse),
    characters: Object.fromEntries(characters),
    issues,
    families: [...families],
    rhythms: [...rhythms],
    roofs: [...roofs],
    tiers: [...tiers],
  };
}

// ---------------------------------------------------------------------------
// 9. Build
// ---------------------------------------------------------------------------

// buildinggen owns wall / beam / roof / trim / door and caches those five
// materials process-wide. The facade construction and the street kit add
// roles it has no concept of, so the city owns those. Every one opts out of
// the environment classifier's role heuristics (`envRole: 'standard'`),
// exactly as `buildingRecipe.roleMaterial` does, so the painted vertex read
// survives the conversion.
const CITY_ROLE_MATERIALS = new Map();
const CITY_ROLE_SURFACE = Object.freeze({
  foliage: { roughness: 0.86 },
  glass: { roughness: 0.34 },
  interior: { roughness: 0.95 },
  lamp: { emissive: 0.85, roughness: 0.6 },
  paving: { roughness: 0.94 },
  street: { roughness: 0.72 },
});

export function cityRoleMaterial(role) {
  const hit = CITY_ROLE_MATERIALS.get(role);
  if (hit) return hit;
  const surface = CITY_ROLE_SURFACE[role] ?? { roughness: 0.9 };
  const material = new THREE.MeshStandardMaterial({
    metalness: 0,
    roughness: surface.roughness,
    vertexColors: true,
  });
  if (surface.emissive) {
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveIntensity = surface.emissive;
  }
  material.name = `City ${role}`;
  material.userData.envRole = 'standard';
  CITY_ROLE_MATERIALS.set(role, material);
  return material;
}

const scratchMassMatrix = new THREE.Matrix4();
const scratchVolumeMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchAxis = new THREE.Vector3(0, 1, 0);
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3(1, 1, 1);

/**
 * Builds every background/midground mass and merges the result to ONE mesh per
 * material role per detail level. buildinggen already caches its five role
 * materials process-wide, so 26 masses / ~70 volumes cost <= 10 draw calls in
 * total, exactly as a village does.
 *
 * @param {object} [options]
 * @param {(x:number,z:number)=>number} [options.heightAt] ground sampler; the
 *   promenade is authored flat, so the default is a flat plane at y = 0.
 * @param {readonly object[]} [options.masses]
 * @returns {{root: THREE.Group, masses: object[], stats: object, audit: object}}
 */
export function buildCityMassing({ heightAt = () => 0, masses = CITY_MASSES } = {}) {
  const variation = verifyVariation(masses);

  const root = new THREE.Group();
  root.name = 'Nova Promenade · background massing';

  const roleBuckets = new Map();
  const roleMaterials = new Map();
  const pushRole = (role, geometry) => {
    const bucket = roleBuckets.get(role);
    if (bucket) bucket.push(geometry);
    else roleBuckets.set(role, [geometry]);
  };
  let decorParts = 0;
  const built = [];
  const footprints = [];
  const invariantViolations = [];
  let volumeCount = 0;
  let triangles = 0;
  let peakHeight = 0;

  // --- Pass 1: resolve every plan, measure real footprints, assert invariants
  const resolved = masses.map((mass) => {
    const band = bandFor(mass.x, mass.z);
    const archetype = ARCHETYPES[mass.archetype];
    if (!archetype) throw new Error(`Unknown city massing archetype "${mass.archetype}" on ${mass.id}`);
    const volumes = archetype(mass, band, mulberry32(mass.seed * 2654435761 + 7));
    const groundY = heightAt(mass.x, mass.z);

    scratchQuaternion.setFromAxisAngle(scratchAxis, mass.yaw ?? 0);
    scratchMassMatrix.compose(
      scratchPosition.set(mass.x, groundY, mass.z),
      scratchQuaternion,
      scratchScale,
    );
    const massMatrix = scratchMassMatrix.clone();

    const box = { maxX: -Infinity, maxZ: -Infinity, minX: Infinity, minZ: Infinity };
    let height = 0;
    const plans = volumes.map((volume) => {
      const plan = resolveBuildingPlan(volume.settings);
      const found = checkPlanInvariants(plan);
      if (found.length > 0) invariantViolations.push(`${mass.id}: ${found.join('; ')}`);
      height = Math.max(height, volume.dy + plan.wallTop + (plan.roofs[0]?.rise ?? 0));

      scratchQuaternion.setFromAxisAngle(scratchAxis, volume.yaw ?? 0);
      scratchVolumeMatrix.compose(
        scratchPosition.set(volume.dx, volume.dy, volume.dz),
        scratchQuaternion,
        scratchScale,
      );
      const matrix = scratchVolumeMatrix.clone().premultiply(massMatrix);

      // Grammar bounds are the footprint rect union; take its four corners plus
      // the roof overhang so the measured box is the geometry, not the walls.
      const eave = Math.max(...plan.roofs.map((entry) => entry.overhang), 0);
      for (const [cornerX, cornerZ] of [
        [plan.bounds.minX - eave, plan.bounds.minZ - eave],
        [plan.bounds.maxX + eave, plan.bounds.minZ - eave],
        [plan.bounds.maxX + eave, plan.bounds.maxZ + eave],
        [plan.bounds.minX - eave, plan.bounds.maxZ + eave],
      ]) {
        const point = scratchPosition.set(cornerX, 0, cornerZ).applyMatrix4(matrix);
        box.minX = Math.min(box.minX, point.x);
        box.maxX = Math.max(box.maxX, point.x);
        box.minZ = Math.min(box.minZ, point.z);
        box.maxZ = Math.max(box.maxZ, point.z);
      }
      return { matrix, plan, volume };
    });

    footprints.push({ box, id: mass.id });
    return { band, box, height, mass, plans };
  });

  const layoutIssues = verifyPlacement(footprints);

  // --- Pass 2: mesh, decorate, merge ----------------------------------------
  for (const { band, box, height, mass, plans } of resolved) {
    const decorRandom = mulberry32(mass.seed * 2246822519 + 131);
    plans.forEach(({ matrix, plan, volume }, index) => {
      // buildinggen detail stays 'hi' at every band: measured at the S01
      // framing a 1.2 m window module at 220 m still spans ~18 px on the
      // 3840-wide master, and 'lo' drops window frames, sills and the beam
      // grid outright. The BAND drives the facade construction level instead.
      const result = createBuildingFromRecipe(volume.settings, { detail: 'hi' });
      triangles += result.stats.triangles;
      volumeCount += 1;
      for (const child of result.object3D.children) {
        if (!child.isMesh) continue;
        const role = child.name.replace('Building-', '') || 'wall';
        if (!roleMaterials.has(role)) roleMaterials.set(role, child.material);
        child.geometry.applyMatrix4(matrix);
        pushRole(role, child.geometry);
      }

      // City construction: parapet, cornice, retail plinth with real recess
      // depth, entrance, balconies, fins, spandrels, roof plant, window
      // reveals. Without this a buildinggen volume at city scale is an
      // extruded mass with a bare slab edge -- §2's "procedural box building".
      const parts = new CityParts({ seed: mass.seed + index * 7919, variation: band.variation });
      const isPlinth = volume.dy < 0.01;
      // §10.1: "warm interior pools against a bright cool exterior". Only the
      // ground floor, and only where the eye can resolve a lit room -- a warm
      // pool at 150 m is colour noise, not a pool.
      const warmInterior = isPlinth && band.index <= 1;
      decorateVolume(parts, plan, {
        accent: mass.accent ? ACCENT[mass.accent] : null,
        character: mass.character,
        detail: band.detail,
        isPlinth,
        isTop: index === plans.length - 1,
        palette: {
          ...volume.settings.palette,
          glassWarm: mass.warmDeep ? GLASS_WARM_DEEP : GLASS_WARM,
          interior: warmInterior ? INTERIOR_WARM : atmospheric(INTERIOR_COOL, band),
        },
        random: decorRandom,
        warmInterior,
      });
      for (const [role, geometry] of Object.entries(parts.build())) {
        geometry.applyMatrix4(matrix);
        if (!roleMaterials.has(role)) roleMaterials.set(role, cityRoleMaterial(role));
        pushRole(role, geometry);
        if (geometry.index) triangles += geometry.index.count / 3;
      }
      decorParts += parts.count;
    });

    peakHeight = Math.max(peakHeight, height);
    built.push({
      archetype: mass.archetype,
      band: band.id,
      character: mass.character,
      distance: Number(band.distance.toFixed(1)),
      family: mass.family,
      footprint: `${(box.maxX - box.minX).toFixed(1)} x ${(box.maxZ - box.minZ).toFixed(1)}`,
      height: Number(height.toFixed(1)),
      id: mass.id,
      rhythm: mass.rhythm,
      roofTop: mass.roofTop,
      seed: mass.seed,
      tier: mass.tier,
      volumes: plans.length,
      x: mass.x,
      z: mass.z,
    });
  }

  for (const [role, geometries] of roleBuckets) {
    const merged = mergePainted(geometries);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, roleMaterials.get(role));
    mesh.name = `CityMass-${role}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  const bandCounts = built.reduce((counts, entry) => {
    counts[entry.band] = (counts[entry.band] ?? 0) + 1;
    return counts;
  }, {});

  // §10.1 colour structure, measured by mass count rather than asserted.
  const familyClasses = built.reduce((counts, entry) => {
    const family = FAMILY[entry.family];
    counts[family.class] = (counts[family.class] ?? 0) + 1;
    return counts;
  }, {});
  const total = built.length || 1;

  return {
    audit: {
      colourStructure: {
        glassMetalPct: Math.round(((familyClasses.glassMetal ?? 0) / total) * 100),
        greenRoofPct: Math.round((masses.filter((mass) => mass.greenRoof).length / total) * 100),
        stonePct: Math.round(((familyClasses.stone ?? 0) / total) * 100),
      },
      grammarInvariants: invariantViolations,
      layoutIssues,
      variation,
    },
    masses: built,
    root,
    stats: {
      bands: bandCounts,
      drawCalls: root.children.length,
      decorParts,
      masses: built.length,
      peakHeight: Number(peakHeight.toFixed(1)),
      triangles,
      volumes: volumeCount,
    },
  };
}
