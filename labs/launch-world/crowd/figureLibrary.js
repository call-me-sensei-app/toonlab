// Original ToonLab background-figure design library — FILL-006.
//
// Ten original figures. None of them is Yua, none of them is derived from any
// Ananta character, and no design here reproduces a protected costume: every
// figure is a set of numbers (heights, loft radii, garment lengths) plus a
// palette slot map, authored against the parity analysis's §4 requirement that
// silhouette variety — not face detail — is what a crowd is scored on at
// 15 m and beyond.
//
// The variety axes, in the order they matter at distance:
//   1. HEIGHT       1.16 m (child) .. 1.88 m — a 62% span
//   2. OUTERWEAR    six volumes: none / shirt / cardigan / blazer / coat /
//                   hoodie, plus a sundress and two swim silhouettes
//   3. HEADWEAR     bare / flat cap / visor / bucket / wide brim / floppy
//   4. HAIR MASS    crop / slick / bob / messy / low ponytail / high ponytail /
//                   long
//   5. CARRIED      none / satchel / backpack / tote / towel / shoulder bag
//   6. BUILD        `mass` 0.86 .. 1.18 drives every loft radius on the body
//
// §13 forbids "repeated prop pattern obvious in the hero frame", and that
// applies to people hardest. Ten archetypes carry 18 placements only because
// every placement also rotates palette slots (see `coastCrowd.js`), so no two
// figures in frame share both a silhouette and a colourway.

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
//
// §10.2's coastal colour structure is warm pale sand, saturated-but-natural
// greens, luminous water and "coral accents limited to furniture and pavilion
// detail". The parity analysis §5.5 puts a hard ceiling of 0.30 mean
// saturation on the plate and reserves >0.55 saturation for the 5% accent
// budget. So the crowd is built almost entirely from off-whites, denims,
// stones and sands, and exactly one accent slot per figure is allowed to be
// loud — which is also what `09-beach-crowd-wide.png` does.

export const CROWD_PALETTE_COLORS = Object.freeze([
  /*  0 */ '#f0cdb4', // skinPale
  /*  1 */ '#e5b795', // skinWarm
  /*  2 */ '#c99268', // skinTan
  /*  3 */ '#9c6a4a', // skinDeep
  /*  4 */ '#2f2b30', // hairInk
  /*  5 */ '#513a2e', // hairChestnut
  /*  6 */ '#8d8b8a', // hairAsh
  /*  7 */ '#b9915f', // hairSand
  /*  8 */ '#6d3a2c', // hairAuburn
  /*  9 */ '#e9e6de', // linenWhite
  /* 10 */ '#cfd2cf', // paleStone
  /* 11 */ '#9aa8b4', // greyBlue
  /* 12 */ '#4d5a6b', // slateNavy
  /* 13 */ '#6a7f9c', // denim
  /* 14 */ '#3d5674', // denimDeep
  /* 15 */ '#c9b48c', // sandKhaki
  /* 16 */ '#8fae9b', // seafoam
  /* 17 */ '#6f7f58', // oliveGreen
  /* 18 */ '#d8dce0', // chalk
  /* 19 */ '#b6bcc2', // ashGrey
  /* 20 */ '#2b3038', // shoeDark
  /* 21 */ '#4a4038', // strapBrown
  /* 22 */ '#e2653f', // coral        (accent)
  /* 23 */ '#e0a03c', // amber        (accent)
  /* 24 */ '#2f8f92', // teal         (accent)
  /* 25 */ '#a3567a', // plum         (accent)
  /* 26 */ '#7d99b8', // skyBlue
  /* 27 */ '#efe0c4', // straw
  /* 28 */ '#5d6b7a', // slateMid
  /* 29 */ '#c2554c', // brick        (accent)
]);

export const CROWD_PALETTE_NAMES = Object.freeze({
  skinPale: 0,
  skinWarm: 1,
  skinTan: 2,
  skinDeep: 3,
  hairInk: 4,
  hairChestnut: 5,
  hairAsh: 6,
  hairSand: 7,
  hairAuburn: 8,
  linenWhite: 9,
  paleStone: 10,
  greyBlue: 11,
  slateNavy: 12,
  denim: 13,
  denimDeep: 14,
  sandKhaki: 15,
  seafoam: 16,
  oliveGreen: 17,
  chalk: 18,
  ashGrey: 19,
  shoeDark: 20,
  strapBrown: 21,
  coral: 22,
  amber: 23,
  teal: 24,
  plum: 25,
  skyBlue: 26,
  straw: 27,
  slateMid: 28,
  brick: 29,
});

const SKIN = 'Skin';
const HAIR = 'Hair';
const CLOTH = 'Costume';

// ---------------------------------------------------------------------------
// Shared anatomy
// ---------------------------------------------------------------------------

const ARM_BONES_L = ['DEF-shoulder.L', 'DEF-upper_arm.L', 'DEF-forearm.L', 'DEF-hand.L', 'DEF-spine.003'];
const ARM_BONES_R = ['DEF-shoulder.R', 'DEF-upper_arm.R', 'DEF-forearm.R', 'DEF-hand.R', 'DEF-spine.003'];
const LEG_BONES_L = ['DEF-thigh.L', 'DEF-shin.L', 'DEF-foot.L', 'DEF-toe.L', 'DEF-hips'];
const LEG_BONES_R = ['DEF-thigh.R', 'DEF-shin.R', 'DEF-foot.R', 'DEF-toe.R', 'DEF-hips'];
const TORSO_BONES = ['DEF-hips', 'DEF-spine.001', 'DEF-spine.002', 'DEF-spine.003', 'DEF-neck', 'DEF-shoulder.L', 'DEF-shoulder.R'];
const HIP_BONES = ['DEF-hips', 'DEF-spine.001', 'DEF-thigh.L', 'DEF-thigh.R'];
const SKIRT_BONES = ['DEF-hips', 'DEF-thigh.L', 'DEF-thigh.R', 'DEF-spine.001'];

/**
 * The bare body every archetype starts from. Garments are authored OVER it at
 * a slightly larger radius, which is why the skin pass is unconditional: a
 * short sleeve then reveals a real arm rather than a hole, and a raised knee
 * in `Sitting_Idle_Loop` never opens a gap at the hem.
 */
function anatomy(parts, rig, colour, { mass = 1, shoulder = 1 } = {}) {
  const skin = colour('skin');
  const hipY = rig.y('DEF-hips');
  const kneeY = rig.y('DEF-shin.L');
  const ankleY = rig.y('DEF-foot.L');
  const toeY = rig.y('DEF-toe.L');
  const chestY = rig.y('DEF-spine.003');
  const neckY = rig.y('DEF-neck');
  const headY = rig.y('DEF-head');
  const hipX = rig.at('DEF-thigh.L').x;
  const armY = rig.at('DEF-upper_arm.L').y;
  const armZ = rig.at('DEF-upper_arm.L').z;
  const shoulderX = rig.at('DEF-upper_arm.L').x;
  const elbowX = rig.at('DEF-forearm.L').x;
  const wristX = rig.at('DEF-hand.L').x;

  // Legs
  for (const side of [1, -1]) {
    const suffix = side > 0 ? 'L' : 'R';
    const bones = side > 0 ? LEG_BONES_L : LEG_BONES_R;
    parts.limb(SKIN, skin,
      [side * hipX, hipY + 0.02, 0.004], [side * hipX, kneeY, -0.002],
      [[0, 0.088 * mass], [0.55, 0.072 * mass], [1, 0.060 * mass]], bones, { radialSegments: 8 });
    parts.limb(SKIN, skin,
      [side * hipX, kneeY, -0.002], [side * hipX, ankleY + 0.01, -0.028],
      [[0, 0.060 * mass], [0.45, 0.052 * mass], [1, 0.038 * mass]], bones, { radialSegments: 8 });
    // Foot: a wedge, not a box — a box reads as a brick at the swash line.
    parts.limb(SKIN, colour('foot'),
      [side * hipX, ankleY - 0.038, -0.05], [side * hipX, toeY + 0.018, 0.115],
      [[0, 0.048], [0.5, 0.056], [1, 0.036]], [`DEF-foot.${suffix}`, `DEF-toe.${suffix}`],
      { flatten: 0.62, radialSegments: 8 });
  }

  // Pelvis + torso as one loft: the silhouette line from hip to shoulder is
  // the single most-read contour on a distant figure.
  parts.loftY(SKIN, skin, [
    { y: hipY - 0.055, rx: 0.128 * mass, rz: 0.094 * mass },
    { y: hipY + 0.06, rx: 0.138 * mass, rz: 0.098 * mass },
    { y: (hipY + chestY) * 0.5 - 0.03, rx: 0.126 * mass, rz: 0.090 * mass },
    { y: chestY - 0.02, rx: 0.150 * mass, rz: 0.100 * mass },
    { y: chestY + 0.075, rx: 0.170 * mass * shoulder, rz: 0.100 * mass },
    { y: neckY - 0.015, rx: 0.150 * mass * shoulder, rz: 0.088 * mass },
  ], TORSO_BONES, { radialSegments: 12 });

  // Neck + head
  parts.limb(SKIN, skin, [0, neckY - 0.045, -0.004], [0, headY - 0.005, 0.004],
    [[0, 0.050], [1, 0.044]], ['DEF-neck', 'DEF-head', 'DEF-spine.003'], { radialSegments: 8 });
  parts.blob(SKIN, skin, [0, headY + 0.095, 0.012], 0.108, 'DEF-head',
    { scale: [0.94, 1.10, 1.02], segments: 14, rings: 10 });

  // Arms
  for (const side of [1, -1]) {
    const bones = side > 0 ? ARM_BONES_L : ARM_BONES_R;
    const suffix = side > 0 ? 'L' : 'R';
    parts.limb(SKIN, skin, [side * (shoulderX - 0.03), armY + 0.012, armZ],
      [side * elbowX, armY, armZ - 0.005],
      [[0, 0.062 * mass], [0.5, 0.054 * mass], [1, 0.046 * mass]], bones, { radialSegments: 8 });
    parts.limb(SKIN, skin, [side * elbowX, armY, armZ - 0.005], [side * wristX, armY, armZ],
      [[0, 0.046 * mass], [0.6, 0.040 * mass], [1, 0.033 * mass]], bones, { radialSegments: 8 });
    parts.blob(SKIN, skin, [side * (wristX + 0.055), armY, armZ + 0.005], 0.046,
      `DEF-hand.${suffix}`, { scale: [1.35, 0.62, 1.15], segments: 8, rings: 6 });
  }
}

// ---------------------------------------------------------------------------
// Garment vocabulary
// ---------------------------------------------------------------------------

/** Sleeved upper garment. `length` is the hem Y as a fraction hip..chest. */
function top(parts, rig, colourIndex, {
  mass = 1,
  hem = 0.0,          // metres below the hip line
  collar = 0.02,
  sleeve = 'short',   // 'none' | 'cap' | 'short' | 'long'
  open = 0,           // 0 closed, 1 open front (adds a lapel pair instead of a closed front)
  bulk = 0.012,       // radius added over the skin
} = {}) {
  const hipY = rig.y('DEF-hips');
  const chestY = rig.y('DEF-spine.003');
  const neckY = rig.y('DEF-neck');
  const armY = rig.at('DEF-upper_arm.L').y;
  const armZ = rig.at('DEF-upper_arm.L').z;
  const shoulderX = rig.at('DEF-upper_arm.L').x;
  const elbowX = rig.at('DEF-forearm.L').x;
  const wristX = rig.at('DEF-hand.L').x;

  const b = bulk;
  parts.loftY(CLOTH, colourIndex, [
    { y: hipY - 0.04 - hem, rx: (0.132 + b) * mass, rz: (0.098 + b) * mass },
    { y: hipY + 0.09, rx: (0.140 + b) * mass, rz: (0.100 + b) * mass },
    { y: (hipY + chestY) * 0.5, rx: (0.134 + b) * mass, rz: (0.094 + b) * mass },
    { y: chestY, rx: (0.156 + b) * mass, rz: (0.104 + b) * mass },
    { y: chestY + 0.08, rx: (0.176 + b) * mass, rz: (0.104 + b) * mass },
    { y: neckY - 0.02 + collar, rx: (0.140 + b) * mass, rz: (0.090 + b) * mass },
  ], TORSO_BONES, { capBottom: false, radialSegments: 12 });

  if (open > 0) {
    // Open front reads as two lapel planes catching the light differently from
    // the body — the cheapest way to make a shirt read as *open* at 20 m.
    for (const side of [1, -1]) {
      parts.slab(CLOTH, colourIndex, [0.055, chestY - hipY + 0.16, 0.02],
        [side * 0.072, (hipY + chestY) * 0.5 + 0.02, (0.098 + b) * mass + 0.012],
        ['DEF-spine.002', 'DEF-spine.003', 'DEF-spine.001'],
        { rotation: [0, 0, side * -0.12] });
    }
  }

  if (sleeve === 'none') return;
  const reach = { cap: 0.30, short: 0.52, long: 1.0 }[sleeve] ?? 0.52;
  for (const side of [1, -1]) {
    const bones = side > 0 ? ARM_BONES_L : ARM_BONES_R;
    const endX = shoulderX + (wristX - shoulderX) * reach;
    const mid = Math.min(1, reach / 0.52);
    parts.limb(CLOTH, colourIndex,
      [side * (shoulderX - 0.055), armY + 0.02, armZ],
      [side * endX, armY, armZ - 0.004],
      sleeve === 'long'
        ? [[0, (0.078 + b) * mass], [0.45, (0.062 + b) * mass], [1, (0.046 + b) * mass]]
        : [[0, (0.080 + b) * mass], [1, (0.062 + b) * mass * (1 - 0.1 * mid)]],
      bones, { radialSegments: 8, capEnds: false });
    if (sleeve === 'long') {
      // cuff
      parts.limb(CLOTH, colourIndex, [side * (elbowX + 0.02), armY, armZ],
        [side * (wristX + 0.02), armY, armZ],
        [[0, (0.056 + b) * mass], [1, (0.044 + b) * mass]], bones, { radialSegments: 8, capEnds: false });
    }
  }
}

/** Trousers / shorts / swim shorts. `hemY` is absolute. */
function legwear(parts, rig, colourIndex, { mass = 1, hemY, bulk = 0.012, seatDrop = 0.06 } = {}) {
  const hipY = rig.y('DEF-hips');
  const hipX = rig.at('DEF-thigh.L').x;
  const kneeY = rig.y('DEF-shin.L');
  const ankleY = rig.y('DEF-foot.L');
  const b = bulk;

  parts.loftY(CLOTH, colourIndex, [
    { y: hipY - seatDrop, rx: (0.140 + b) * mass, rz: (0.104 + b) * mass },
    { y: hipY + 0.08, rx: (0.142 + b) * mass, rz: (0.104 + b) * mass },
  ], HIP_BONES, { capTop: false, radialSegments: 12 });

  for (const side of [1, -1]) {
    const bones = side > 0 ? LEG_BONES_L : LEG_BONES_R;
    const topR = (0.096 + b) * mass;
    const kneeR = (0.078 + b) * mass;
    const ankleR = (0.062 + b) * mass;
    const t = Math.max(0, Math.min(1, (hipY - hemY) / (hipY - ankleY)));
    const radiusAt = (u) => (u < (hipY - kneeY) / (hipY - ankleY)
      ? topR + (kneeR - topR) * (u / Math.max(1e-3, (hipY - kneeY) / (hipY - ankleY)))
      : kneeR + (ankleR - kneeR) * ((u - (hipY - kneeY) / (hipY - ankleY)) / Math.max(1e-3, 1 - (hipY - kneeY) / (hipY - ankleY))));
    parts.limb(CLOTH, colourIndex,
      [side * hipX, hipY - seatDrop + 0.02, 0.004], [side * hipX, hemY, -0.004 - 0.02 * t],
      [[0, topR], [0.5, radiusAt(t * 0.5)], [1, radiusAt(t)]], bones,
      { radialSegments: 8, capEnds: false });
  }
}

/** Skirt / dress skirt / coat skirt: a flaring open loft. */
function skirt(parts, rig, colourIndex, { mass = 1, topY, hemY, topR = 0.152, hemR = 0.24, panels = 14 } = {}) {
  const mid = (topY + hemY) * 0.5;
  parts.loftY(CLOTH, colourIndex, [
    { y: hemY, rx: hemR * mass, rz: hemR * mass * 0.86 },
    { y: mid, rx: (topR + (hemR - topR) * 0.42) * mass, rz: (topR + (hemR - topR) * 0.42) * mass * 0.86 },
    { y: topY, rx: topR * mass, rz: topR * mass * 0.9 },
  ], SKIRT_BONES, { capBottom: false, capTop: false, radialSegments: panels });
}

/** Wide-brim / bucket / flat cap / visor. */
function headwear(parts, rig, colourIndex, kind, { brim = 0.24, crown = 0.075, tilt = 0 } = {}) {
  const headY = rig.y('DEF-head');
  const crownY = headY + 0.155;
  if (kind === 'wide' || kind === 'bucket' || kind === 'floppy') {
    const brimY = kind === 'floppy' ? crownY - 0.10 : crownY - 0.085;
    parts.loftY(CLOTH, colourIndex, [
      { y: brimY - (kind === 'floppy' ? 0.03 : 0.008), rx: brim, rz: brim * 0.98 },
      { y: brimY + 0.014, rx: brim * 0.42, rz: brim * 0.42 },
      { y: brimY + 0.02, rx: 0.118, rz: 0.116 },
      { y: crownY + crown, rx: kind === 'bucket' ? 0.104 : 0.094, rz: kind === 'bucket' ? 0.102 : 0.092 },
    ], 'DEF-head', { capBottom: false, radialSegments: 14 });
    return;
  }
  if (kind === 'cap' || kind === 'visor') {
    if (kind === 'cap') {
      parts.blob(CLOTH, colourIndex, [0, headY + 0.128, 0.012], 0.118, 'DEF-head',
        { scale: [0.98, 0.62, 1.02], segments: 12, rings: 7 });
    } else {
      parts.loftY(CLOTH, colourIndex, [
        { y: headY + 0.11, rx: 0.120, rz: 0.118 },
        { y: headY + 0.165, rx: 0.114, rz: 0.112 },
      ], 'DEF-head', { capBottom: false, capTop: false, radialSegments: 12 });
    }
    // peak
    parts.slab(CLOTH, colourIndex, [0.19, 0.016, 0.15], [0, headY + 0.108, 0.155], 'DEF-head',
      { rotation: [tilt - 0.16, 0, 0] });
  }
}

/** Hair mass. Everything is authored as volume — no cards, so no alpha halo. */
function hair(parts, rig, colourIndex, style) {
  const headY = rig.y('DEF-head');
  const cap = (scale, y = 0.104, r = 0.116) => parts.blob(HAIR, colourIndex,
    [0, headY + y, 0.008], r, 'DEF-head', { scale, segments: 14, rings: 10 });

  switch (style) {
    case 'slick':
      cap([0.98, 0.96, 1.03], 0.098, 0.112);
      break;
    case 'crop':
      cap([1.02, 1.00, 1.05], 0.104, 0.116);
      parts.blob(HAIR, colourIndex, [0, headY + 0.052, -0.055], 0.082, 'DEF-head',
        { scale: [1.05, 0.9, 0.7], segments: 10, rings: 7 });
      break;
    case 'messy':
      cap([1.06, 1.04, 1.08], 0.108, 0.118);
      parts.blob(HAIR, colourIndex, [0.048, headY + 0.168, -0.03], 0.062, 'DEF-head',
        { scale: [1.1, 0.8, 1.0], segments: 8, rings: 6 });
      parts.blob(HAIR, colourIndex, [-0.056, headY + 0.146, 0.018], 0.058, 'DEF-head',
        { scale: [1.0, 0.85, 1.05], segments: 8, rings: 6 });
      break;
    case 'bob':
      cap([1.04, 1.02, 1.06], 0.104, 0.118);
      parts.loftY(HAIR, colourIndex, [
        { y: headY - 0.035, rx: 0.128, rz: 0.122, cz: -0.006 },
        { y: headY + 0.06, rx: 0.132, rz: 0.126, cz: -0.004 },
        { y: headY + 0.15, rx: 0.112, rz: 0.108 },
      ], 'DEF-head', { capBottom: false, capTop: false, radialSegments: 12 });
      break;
    case 'lowTail':
      cap([1.03, 1.01, 1.05], 0.104, 0.117);
      parts.limb(HAIR, colourIndex, [0, headY + 0.01, -0.10], [0, headY - 0.30, -0.135],
        [[0, 0.056], [0.4, 0.062], [1, 0.030]], ['DEF-head', 'DEF-neck'], { radialSegments: 8 });
      break;
    case 'highTail':
      cap([1.01, 1.00, 1.04], 0.104, 0.115);
      parts.limb(HAIR, colourIndex, [0, headY + 0.185, -0.055], [0, headY + 0.052, -0.235],
        [[0, 0.050], [0.45, 0.056], [1, 0.026]], 'DEF-head', { radialSegments: 8 });
      break;
    case 'long':
      cap([1.04, 1.02, 1.06], 0.106, 0.118);
      parts.loftY(HAIR, colourIndex, [
        { y: headY - 0.42, rx: 0.108, rz: 0.070, cz: -0.052 },
        { y: headY - 0.20, rx: 0.126, rz: 0.082, cz: -0.048 },
        { y: headY + 0.02, rx: 0.132, rz: 0.108, cz: -0.030 },
        { y: headY + 0.14, rx: 0.112, rz: 0.108, cz: -0.006 },
      ], ['DEF-head', 'DEF-neck', 'DEF-spine.003'], { capBottom: false, capTop: false, radialSegments: 12 });
      break;
    case 'bun':
      cap([1.00, 0.99, 1.03], 0.102, 0.114);
      parts.blob(HAIR, colourIndex, [0, headY + 0.128, -0.128], 0.070, 'DEF-head',
        { scale: [1.0, 0.95, 1.0], segments: 10, rings: 7 });
      break;
    default:
      cap([1.02, 1.00, 1.04]);
  }
}

// ---------------------------------------------------------------------------
// Carried items
// ---------------------------------------------------------------------------

function satchel(parts, rig, body, strap) {
  const chestY = rig.y('DEF-spine.003');
  const hipY = rig.y('DEF-hips');
  parts.slab(CLOTH, strap, [0.055, 0.42, 0.022], [0.03, (chestY + hipY) * 0.5 + 0.10, 0.098],
    ['DEF-spine.002', 'DEF-spine.003'], { rotation: [0, 0, 0.42] });
  parts.slab(CLOTH, body, [0.26, 0.20, 0.085], [-0.17, hipY + 0.10, 0.03],
    ['DEF-spine.001', 'DEF-hips'], { rotation: [0, 0.18, 0.06] });
}

function backpack(parts, rig, body, strap) {
  const chestY = rig.y('DEF-spine.003');
  parts.loftY(CLOTH, body, [
    { y: chestY - 0.28, rx: 0.125, rz: 0.070, cz: -0.150 },
    { y: chestY - 0.10, rx: 0.140, rz: 0.082, cz: -0.156 },
    { y: chestY + 0.10, rx: 0.132, rz: 0.078, cz: -0.150 },
  ], ['DEF-spine.002', 'DEF-spine.003', 'DEF-spine.001'], { radialSegments: 10 });
  for (const side of [1, -1]) {
    parts.slab(CLOTH, strap, [0.042, 0.30, 0.02], [side * 0.088, chestY - 0.02, 0.098],
      ['DEF-spine.003', 'DEF-spine.002'], { rotation: [0.1, 0, 0] });
  }
}

function tote(parts, rig, body, handle, side = -1) {
  const armY = rig.at('DEF-upper_arm.L').y;
  const wristX = rig.at('DEF-hand.L').x;
  const x = side * (wristX + 0.03);
  const suffix = side > 0 ? 'L' : 'R';
  parts.slab(CLOTH, body, [0.23, 0.28, 0.10], [x, armY - 0.30, 0.02], `DEF-hand.${suffix}`);
  parts.limb(CLOTH, handle, [x - 0.07, armY - 0.16, 0.02], [x + 0.07, armY - 0.16, 0.02],
    [[0, 0.012], [0.5, 0.016], [1, 0.012]], `DEF-hand.${suffix}`, { radialSegments: 5 });
}

function towelOverShoulder(parts, rig, colourIndex, side = 1) {
  const chestY = rig.y('DEF-spine.003');
  const shoulderX = rig.at('DEF-upper_arm.L').x;
  parts.loftY(CLOTH, colourIndex, [
    { y: chestY - 0.24, rx: 0.075, rz: 0.030, cx: side * (shoulderX - 0.045), cz: 0.075 },
    { y: chestY + 0.04, rx: 0.078, rz: 0.036, cx: side * (shoulderX - 0.030), cz: 0.055 },
    { y: chestY + 0.10, rx: 0.082, rz: 0.052, cx: side * (shoulderX - 0.020), cz: 0.005 },
    { y: chestY - 0.02, rx: 0.076, rz: 0.036, cx: side * (shoulderX - 0.030), cz: -0.075 },
    { y: chestY - 0.30, rx: 0.072, rz: 0.030, cx: side * (shoulderX - 0.045), cz: -0.090 },
  ], ['DEF-spine.003', 'DEF-shoulder.L', 'DEF-shoulder.R', 'DEF-spine.002'],
  { capBottom: false, capTop: false, radialSegments: 8 });
}

function shoulderBag(parts, rig, body, strap, side = -1) {
  const chestY = rig.y('DEF-spine.003');
  const hipY = rig.y('DEF-hips');
  parts.slab(CLOTH, strap, [0.032, 0.40, 0.02], [side * 0.055, (chestY + hipY) * 0.5 + 0.13, 0.092],
    ['DEF-spine.002', 'DEF-spine.003'], { rotation: [0, 0, side * -0.30] });
  parts.slab(CLOTH, body, [0.17, 0.14, 0.07], [side * 0.155, hipY + 0.16, 0.055],
    ['DEF-spine.001', 'DEF-hips']);
}

function scarf(parts, rig, colourIndex) {
  const neckY = rig.y('DEF-neck');
  parts.loftY(CLOTH, colourIndex, [
    { y: neckY - 0.03, rx: 0.098, rz: 0.086 },
    { y: neckY + 0.045, rx: 0.104, rz: 0.092 },
    { y: neckY + 0.10, rx: 0.092, rz: 0.082 },
  ], ['DEF-neck', 'DEF-spine.003'], { capBottom: false, capTop: false, radialSegments: 10 });
  parts.slab(CLOTH, colourIndex, [0.075, 0.30, 0.03], [0.055, neckY - 0.17, 0.085],
    ['DEF-spine.003', 'DEF-spine.002'], { rotation: [0, 0, 0.06] });
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------
//
// `slots` are the archetype's DEFAULT palette names. A placement may override
// any slot, which is how ten designs cover eighteen placements without a
// repeat reading as a repeat.

export const CROWD_FIGURES = Object.freeze([
  {
    id: 'FIG-COAST-01',
    label: 'Shoreline walker, cropped hair',
    height: 1.78,
    mass: 0.94,
    shoulder: 1.04,
    activity: ['walk', 'walkSlow'],
    slots: { skin: 'skinWarm', foot: 'shoeDark', hair: 'hairInk', shirt: 'linenWhite', shorts: 'denim', bag: 'strapBrown', accent: 'coral' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 0.94, shoulder: 1.04 });
      top(parts, rig, c('shirt'), { mass: 0.94, sleeve: 'short', hem: 0.02 });
      legwear(parts, rig, c('shorts'), { mass: 0.94, hemY: rig.y('DEF-shin.L') + 0.20 });
      hair(parts, rig, c('hair'), 'crop');
      satchel(parts, rig, c('accent'), c('bag'));
    },
  },
  {
    id: 'FIG-COAST-02',
    label: 'Tall figure, open linen coat',
    height: 1.88,
    mass: 0.98,
    shoulder: 1.08,
    activity: ['walkSlow', 'idle', 'lean'],
    slots: { skin: 'skinPale', foot: 'shoeDark', hair: 'hairAsh', coat: 'chalk', shirt: 'greyBlue', trousers: 'slateNavy', accent: 'teal' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 0.98, shoulder: 1.08 });
      top(parts, rig, c('shirt'), { mass: 0.98, sleeve: 'short' });
      legwear(parts, rig, c('trousers'), { mass: 0.98, hemY: rig.y('DEF-foot.L') + 0.02 });
      // Knee-length open coat — the tallest, straightest silhouette in the set.
      top(parts, rig, c('coat'), { mass: 0.98, sleeve: 'long', bulk: 0.032, open: 1, collar: 0.03 });
      skirt(parts, rig, c('coat'), {
        mass: 0.98, topY: rig.y('DEF-hips') - 0.02, hemY: rig.y('DEF-shin.L') - 0.06,
        topR: 0.168, hemR: 0.196, panels: 14,
      });
      scarf(parts, rig, c('accent'));
      hair(parts, rig, c('hair'), 'slick');
    },
  },
  {
    id: 'FIG-COAST-03',
    label: 'Student, blazer and pleated skirt',
    height: 1.62,
    mass: 0.90,
    shoulder: 0.96,
    activity: ['idleTalk', 'walk', 'sit'],
    slots: { skin: 'skinPale', foot: 'shoeDark', hair: 'hairChestnut', blazer: 'slateNavy', shirt: 'linenWhite', skirtCloth: 'slateMid', bag: 'brick', accent: 'amber' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 0.90, shoulder: 0.96 });
      top(parts, rig, c('shirt'), { mass: 0.90, sleeve: 'short' });
      top(parts, rig, c('blazer'), { mass: 0.90, sleeve: 'long', bulk: 0.026, open: 1 });
      skirt(parts, rig, c('skirtCloth'), {
        mass: 0.90, topY: rig.y('DEF-hips') + 0.02, hemY: rig.y('DEF-shin.L') + 0.13,
        topR: 0.150, hemR: 0.215, panels: 16,
      });
      hair(parts, rig, c('hair'), 'lowTail');
      backpack(parts, rig, c('bag'), c('accent'));
    },
  },
  {
    id: 'FIG-COAST-04',
    label: 'Shopper, wide sun hat and cardigan',
    height: 1.66,
    mass: 1.16,
    shoulder: 1.00,
    activity: ['walkSlow', 'idle', 'idleTalk'],
    slots: { skin: 'skinWarm', foot: 'strapBrown', hair: 'hairAsh', cardigan: 'sandKhaki', shirt: 'linenWhite', trousers: 'ashGrey', hat: 'straw', bag: 'oliveGreen', accent: 'plum' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 1.16, shoulder: 1.00 });
      top(parts, rig, c('shirt'), { mass: 1.16, sleeve: 'short' });
      top(parts, rig, c('cardigan'), { mass: 1.16, sleeve: 'long', bulk: 0.030, open: 1, hem: 0.10 });
      legwear(parts, rig, c('trousers'), { mass: 1.16, hemY: rig.y('DEF-foot.L') + 0.06 });
      hair(parts, rig, c('hair'), 'bob');
      headwear(parts, rig, c('hat'), 'wide', { brim: 0.27 });
      tote(parts, rig, c('bag'), c('accent'), -1);
    },
  },
  {
    id: 'FIG-COAST-05',
    label: 'Runner, vest and shorts',
    height: 1.71,
    mass: 0.88,
    shoulder: 1.02,
    activity: ['jog', 'walk'],
    slots: { skin: 'skinTan', foot: 'linenWhite', hair: 'hairInk', vest: 'chalk', shorts: 'shoeDark', hat: 'teal' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 0.88, shoulder: 1.02 });
      top(parts, rig, c('vest'), { mass: 0.88, sleeve: 'none', hem: 0.0, bulk: 0.008 });
      legwear(parts, rig, c('shorts'), { mass: 0.88, hemY: rig.y('DEF-shin.L') + 0.28, bulk: 0.018 });
      hair(parts, rig, c('hair'), 'highTail');
      headwear(parts, rig, c('hat'), 'visor');
    },
  },
  {
    id: 'FIG-COAST-06',
    label: 'Beachgoer, open shirt and towel',
    height: 1.75,
    mass: 1.02,
    shoulder: 1.05,
    activity: ['walk', 'idle', 'lean'],
    slots: { skin: 'skinTan', foot: 'sandKhaki', hair: 'hairSand', shirt: 'seafoam', shorts: 'denimDeep', towel: 'coral' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 1.02, shoulder: 1.05 });
      top(parts, rig, c('shirt'), { mass: 1.02, sleeve: 'short', open: 1, bulk: 0.018 });
      legwear(parts, rig, c('shorts'), { mass: 1.02, hemY: rig.y('DEF-shin.L') + 0.16, bulk: 0.020 });
      hair(parts, rig, c('hair'), 'messy');
      towelOverShoulder(parts, rig, c('towel'), 1);
    },
  },
  {
    id: 'FIG-COAST-07',
    label: 'Sundress and floppy hat',
    height: 1.58,
    mass: 0.92,
    shoulder: 0.94,
    activity: ['idleTalk', 'walkSlow', 'sit'],
    slots: { skin: 'skinPale', foot: 'linenWhite', hair: 'hairAuburn', dress: 'linenWhite', hat: 'straw', bag: 'skyBlue', accent: 'coral' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 0.92, shoulder: 0.94 });
      top(parts, rig, c('dress'), { mass: 0.92, sleeve: 'cap', bulk: 0.014 });
      skirt(parts, rig, c('dress'), {
        mass: 0.92, topY: rig.y('DEF-hips') + 0.06, hemY: rig.y('DEF-shin.L') - 0.02,
        topR: 0.150, hemR: 0.255, panels: 16,
      });
      hair(parts, rig, c('hair'), 'long');
      headwear(parts, rig, c('hat'), 'floppy', { brim: 0.31 });
      shoulderBag(parts, rig, c('bag'), c('accent'), -1);
    },
  },
  {
    id: 'FIG-COAST-08',
    label: 'Wader, swim shorts',
    height: 1.80,
    mass: 1.10,
    shoulder: 1.12,
    activity: ['wade', 'idle', 'walkSlow'],
    slots: { skin: 'skinDeep', foot: 'skinDeep', hair: 'hairInk', shorts: 'teal' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 1.10, shoulder: 1.12 });
      legwear(parts, rig, c('shorts'), { mass: 1.10, hemY: rig.y('DEF-shin.L') + 0.22, bulk: 0.020 });
      hair(parts, rig, c('hair'), 'slick');
    },
  },
  {
    id: 'FIG-COAST-09',
    label: 'Child, bucket hat',
    height: 1.16,
    mass: 1.06,
    shoulder: 0.92,
    activity: ['walk', 'idle', 'crouch'],
    slots: { skin: 'skinWarm', foot: 'coral', hair: 'hairChestnut', shirt: 'amber', shorts: 'denim', hat: 'linenWhite' },
    build(parts, rig, c) {
      // A child is not a scaled adult: the head stays near adult size against a
      // much shorter body, which is the whole reason a child figure reads as a
      // child at 40 m rather than as a distant adult and destroys the scale
      // calibration the analysis §4(a) is asking for.
      anatomy(parts, rig, c, { mass: 1.06, shoulder: 0.92 });
      parts.blob(SKIN, c('skin'), [0, rig.y('DEF-head') + 0.10, 0.012], 0.128, 'DEF-head',
        { scale: [0.96, 1.06, 1.02], segments: 14, rings: 10 });
      top(parts, rig, c('shirt'), { mass: 1.06, sleeve: 'short', hem: 0.06, bulk: 0.020 });
      legwear(parts, rig, c('shorts'), { mass: 1.06, hemY: rig.y('DEF-shin.L') + 0.18, bulk: 0.020 });
      hair(parts, rig, c('hair'), 'messy');
      headwear(parts, rig, c('hat'), 'bucket', { brim: 0.215 });
    },
  },
  {
    id: 'FIG-COAST-10',
    label: 'Oversized hoodie, wide trousers',
    height: 1.69,
    mass: 1.08,
    shoulder: 1.06,
    activity: ['sit', 'idle', 'lean', 'idleTalk'],
    slots: { skin: 'skinWarm', foot: 'shoeDark', hair: 'hairAuburn', hoodie: 'greyBlue', trousers: 'sandKhaki', accent: 'amber' },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 1.08, shoulder: 1.06 });
      top(parts, rig, c('hoodie'), { mass: 1.08, sleeve: 'long', bulk: 0.040, hem: 0.10, collar: 0.01 });
      // Hood down at the nape — the read that separates a hoodie from a jumper.
      parts.blob(CLOTH, c('hoodie'), [0, rig.y('DEF-neck') + 0.01, -0.115], 0.105, 'DEF-spine.003',
        { scale: [1.15, 0.85, 0.72], segments: 10, rings: 7 });
      legwear(parts, rig, c('trousers'), { mass: 1.08, hemY: rig.y('DEF-foot.L') + 0.04, bulk: 0.034 });
      hair(parts, rig, c('hair'), 'messy');
    },
  },
  {
    // Authored 2026-08-15 AFTER the coastal scene was cancelled for Stillwater
    // Garden (doc 20). It is the ONE figure the garden brief allows, and it is
    // deliberately the opposite of everything above: no accent colour, no
    // carried item, no headwear, minimum silhouette incident. A garden figure
    // has to read as *stillness*, so the design work went into the seated
    // profile — a long straight robe with a single horizontal obi break —
    // rather than into anything that catches the eye.
    //
    // Its job in the composition is not density. It is (a) to give the
    // teahouse's §8-required 2 m interior read a reason to exist, because an
    // empty pavilion with a deep recess reads as an architectural model, and
    // (b) to put a second human scale reference in depth band 4, where Yua on
    // the path (band 2) cannot reach.
    id: 'FIG-GARDEN-01',
    label: 'Garden visitor, seated at the engawa',
    height: 1.64,
    mass: 1.00,
    shoulder: 0.98,
    activity: ['sit', 'idle'],
    slots: {
      skin: 'skinPale', foot: 'skinPale', hair: 'hairInk',
      robe: 'slateNavy', obi: 'sandKhaki', under: 'linenWhite',
    },
    build(parts, rig, c) {
      anatomy(parts, rig, c, { mass: 1.00, shoulder: 0.98 });
      // Under-layer collar showing at the neck — the one detail that keeps a
      // single-colour robe from reading as a sack at 20 m.
      top(parts, rig, c('under'), { mass: 1.00, sleeve: 'cap', bulk: 0.010, collar: 0.035 });
      // Robe: wide dropped sleeves, straight body, no waist shaping.
      top(parts, rig, c('robe'), { mass: 1.00, sleeve: 'long', bulk: 0.038, collar: 0.0, hem: 0.14 });
      // A kimono skirt TAPERS — it is the one garment in the set whose hem is
      // narrower than its waist, and getting that backwards is what makes a
      // robe read as a dress. It also matters mechanically: a narrow hem
      // weighted onto the thighs follows `Sitting_Idle_Loop` instead of
      // hanging in the air as a disc when the knees come up.
      skirt(parts, rig, c('robe'), {
        mass: 1.00, topY: rig.y('DEF-hips') - 0.10, hemY: rig.y('DEF-foot.L') + 0.10,
        topR: 0.170, hemR: 0.148, panels: 12,
      });
      // Obi: one horizontal band, the only value break on the figure.
      parts.loftY(CLOTH, c('obi'), [
        { y: rig.y('DEF-hips') + 0.055, rx: 0.178, rz: 0.132 },
        { y: rig.y('DEF-hips') + 0.175, rx: 0.180, rz: 0.134 },
      ], HIP_BONES, { capBottom: false, capTop: false, radialSegments: 12 });
      hair(parts, rig, c('hair'), 'bun');
    },
  },
]);

export const CROWD_FIGURES_BY_ID = Object.freeze(
  Object.fromEntries(CROWD_FIGURES.map((figure) => [figure.id, figure])),
);

/**
 * Activity -> source clip name on the ToonLab mannequin's shipped library.
 *
 * The whole reason this is a lookup table and not a retarget is the parity
 * analysis's Gate 4 finding: clip sharing across skeletons is absent, so 18
 * figures each retargeting a clip would cost 18 retargets. Every figure here
 * borrows the SOURCE skeleton, so the 46 shipped clips bind by node name with
 * no retarget at all. That is the single decision that makes a crowd free at
 * load time as well as at frame time.
 */
export const CROWD_ACTIVITY_CLIPS = Object.freeze({
  crouch: { clip: 'Crouch_Idle_Loop', speed: 0 },
  idle: { clip: 'Idle_Loop', speed: 0 },
  idleTalk: { clip: 'Idle_Talking_Loop', speed: 0 },
  jog: { clip: 'Jog_Fwd_Loop', speed: 2.75 },
  lean: { clip: 'Idle_Torch_Loop', speed: 0 },
  sit: { clip: 'Sitting_Idle_Loop', speed: 0 },
  sitTalk: { clip: 'Sitting_Talking_Loop', speed: 0 },
  wade: { clip: 'Swim_Idle_Loop', speed: 0 },
  walk: { clip: 'Walk_Loop', speed: 1.32 },
  walkSlow: { clip: 'Walk_Formal_Loop', speed: 1.02 },
});
