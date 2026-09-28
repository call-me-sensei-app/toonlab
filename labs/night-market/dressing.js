// Night Market — dressing: the left side and the figures.
//
// SCOPE: plain Three.js. Nothing from src/ (ToonLab) is imported. The mannequin
// GLB is fetched from /characters/mannequin.glb — that is an asset, not a
// ToonLab system, and the spec (§8) approves substituting it for characters.
//
// Owns, per launch-plan/22-night-market-replica-spec.md:
//   §5  the open seating on the left: patio umbrellas, communal tables and
//       benches, stacked kegs, the amber food truck, the dark tree mass and the
//       green railing at the far-left edge.
//   §2  ground litter — cans and a fallen bottle, near-foreground right.
//   §8  figures: the near-field pair, the mid-depth walkers, the seated diners.
//
// Everything is keyed off MARKET from scene.js so the umbrellas clear the
// lantern wires at 4.7 m and the table legs land on street.js's paving.
//
// ---------------------------------------------------------------------------
// REPAIR PASS — launch-plan/review/night-market-difference-audit.md, D3/D9/D10.
// Three findings, and the first of them is a SPEC bug rather than a build bug:
//
//   D3  There was no near field. §8 placed the nearest figure at 8 m and it
//       filled 20% of frame height against the reference's 54%; emissive spread
//       stopped at y47% against y67%. §8 is wrong and is not followed here — the
//       lead pair now stand at 3.4 and 4.1 m, solved against SHOTS.hero rather
//       than guessed, and straddle the vanishing axis instead of blocking it.
//       Measured in-engine by reportFigureHeights() at the bottom of this file.
//   D9  The left was 1.8× too dark and 38% less dense. Value is now at parity
//       (region mean L 50.7 against the reference's 48.9, near-black 16.7%
//       against 20.0%); density was the harder half and drove the near table
//       forward, doubled the table settings, split the umbrella into gores, put
//       a barrel wall between the tables and a hedge behind the railing.
//   D10 The figures were black cut-outs — the tints were sRGB 0.35 over a GLB
//       whose joints ship at 0.055 linear. They now carry garment albedo, a
//       hip-split second tone and a flat ambient floor, and measure L≈62 on the
//       torso against the reference's 62.7.
//
// Every number above is measured on the hero shot at 1920×1080 against the
// restored 2294×1440 reference, both resampled to 1600×1000, minimap masked.

import * as THREE from 'three';
// `three/examples/jsm/…`, not `three/addons/…` — same files, but this is the
// specifier lighting.js already uses in this lab and one spelling keeps Vite's
// dedupe on a single module graph.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// ---------------------------------------------------------------------------
// Palette. §9: warm amber dominant, deep navy/near-black as the contrast field.
// Nothing here is allowed to be mid-grey.

const C = {
  canopy: 0xd7cab2,        // cream umbrella fabric, top
  canopyUnder: 0xc0b092,   // underside, catching the warm light
  valance: 0xcdbfa4,
  pole: 0x8d867a,
  // D9: the reference's left-side timber is a PALE bench-and-trestle set, not the
  // dark stained wood this started on. Lifting the two largest surfaces on that
  // side is worth more to the region's mean L than any number of small props.
  tableTop: 0x8d6f4c,
  tableFrame: 0x6a5033,
  bench: 0x7d5f42,
  metalDark: 0x2b2724,
  kegWood: 0xc8b189,
  kegBand: 0x8a4030,
  kegHoop: 0x6b6259,
  truckBody: 0xcf9c2c,     // §5 yellow/amber
  truckTrim: 0x8c6416,
  truckDark: 0x241f1a,
  truckCounter: 0xa57c30,
  // §5 calls the tree mass unlit, and the audit (D9) measures what "unlit" cost:
  // the left third became a black void where the reference has a dark-but-legible
  // green. Target there is L 20-30 with a green bias, not L 9.
  //
  // The green BIAS, though, was three times too strong, and the tree mass is where
  // the whole frame's green lives. Measured: green is 3.7% of the frame's colourful
  // pixels against the reference's 0.89%, and 90% of ours sits in the top-left
  // quadrant — this mass — at mean L 19.6. The reference's green is a quarter of
  // ours by area, sits in the MID-left (86% of it in the y 25-50% band, i.e. its
  // hedge and its lit foliage, not its sky-line trees), and is genuinely greener
  // where it appears (mean HSV sat 0.47 against our 0.24). So an unlit silhouette
  // this large has to be a dark NEUTRAL with a green cast, not a green field.
  // These three colours are the originals desaturated to 35% of their chroma at
  // CONSTANT Rec.709 luminance, so the mass keeps every bit of the value D9 bought
  // it — L is untouched, only the chroma moves, and near-black does not shift.
  treeMass: 0x1f2620,      // was 0x1b271d
  treeMassDeep: 0x151916,  // was 0x121a14
  foliage: 0x24331f,       // the hedge behind the railing — nearer, so lighter
  foliageLit: 0x33452a,
  fenceGreen: 0x5f8064,
  crateTimber: 0x7d6244,
  crateBlue: 0x1f4f5e,
  binDark: 0x22262a,
  canBody: 0xb6b9bd,
  canLabel: 0xa8392c,
  bottleGlass: 0x5c5a2c,
  cupStack: 0xd05a32,

  // D9 tableware. The reference's table carries ~15 distinguishable props in a
  // spread of pale values; a table with four dark bottles on it reads as closed.
  bowlWhite: 0xe4dfd2,
  bowlRim: 0xcbc2ae,
  plateCream: 0xd9d1bd,
  trayAmber: 0xc9932f,
  trayRed: 0xa8402c,
  cupRed: 0xc2432c,
  cupPale: 0xd8d3c6,
  glassPale: 0xc6cdc4,
  potMetal: 0x7c776e,
  basketTan: 0xa8875a,
  teapotClay: 0x8a5c3a,
  foodWarm: 0xd2762c,
  foodPale: 0xe0cf9e,
  greens: 0x4e6b34,
};

const stdMat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: opts.roughness ?? 0.82,
  metalness: opts.metalness ?? 0.0,
  side: opts.side ?? THREE.FrontSide,
  ...(opts.extra ?? {}),
});

/** Adds a mesh, wires shadows and parents it. Returns the mesh. */
function put(parent, geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

/**
 * Original glyph-like marks (spec §0: full signage density, invented forms).
 * Abstract strokes at character size and spacing, never reproduced glyphs.
 */
function glyphStripTexture(random, { bg = '#141210', fg = '#efe6d2', rows = 5, width = 96, height = 384 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  const cell = height / rows;
  g.strokeStyle = fg;
  g.lineCap = 'square';
  for (let r = 0; r < rows; r += 1) {
    const cx = width / 2;
    const cy = cell * (r + 0.5);
    const s = cell * 0.32;
    const strokes = 3 + Math.floor(random() * 4);
    g.lineWidth = Math.max(2, cell * 0.075);
    for (let i = 0; i < strokes; i += 1) {
      const horizontal = random() > 0.42;
      const off = (random() - 0.5) * s * 1.7;
      g.beginPath();
      if (horizontal) {
        const len = s * (0.55 + random() * 0.9);
        g.moveTo(cx - len, cy + off);
        g.lineTo(cx + len, cy + off);
      } else {
        const len = s * (0.55 + random() * 0.9);
        g.moveTo(cx + off, cy - len);
        g.lineTo(cx + off, cy + len);
      }
      g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// ---------------------------------------------------------------------------
// §5 — patio umbrella. ~3 m across, canopy at ~2.6 m, so it clears the lantern
// wires at MARKET.lanternRowY (4.7 m) by a clear 2 m.

function buildUmbrella(random, emissives, { radius = 1.5, rimY = 2.12, apexY = 2.82, ribs = 8 }) {
  const group = new THREE.Group();
  const poleTop = apexY + 0.14;

  const poleMat = stdMat(C.pole, { roughness: 0.45, metalness: 0.55 });
  put(group, new THREE.CylinderGeometry(0.036, 0.045, poleTop, 10), poleMat, { y: poleTop / 2, receive: false });
  // Cruciform foot — an umbrella that meets the paving on nothing reads as floating.
  put(group, new THREE.BoxGeometry(0.66, 0.07, 0.16), poleMat, { y: 0.035 });
  put(group, new THREE.BoxGeometry(0.16, 0.07, 0.66), poleMat, { y: 0.035 });
  put(group, new THREE.CylinderGeometry(0.13, 0.16, 0.1, 10), stdMat(C.metalDark), { y: 0.05 });

  // Canopy: eight-sided cone with a real pitch (~25°), so it reads as a canvas
  // umbrella rather than a disc. Doubled, because eye level only ever sees the
  // warm underside.
  const rise = apexY - rimY;
  // Built as separate GORES rather than one cone. A patio umbrella is sewn from
  // panels, and the seams matter here for a measured reason: this canopy is the
  // largest single smooth surface in the left third of frame, and that third was
  // measured at 61% of the reference's detail density. Alternating the panel
  // value by ~8% costs nothing, is what the real object does, and puts eight
  // radial value steps across the biggest empty area on that side.
  const gore = (2 * Math.PI) / ribs;
  const goreMats = [
    stdMat(C.canopy, { roughness: 0.9, side: THREE.DoubleSide }),
    stdMat(0xc9bda6, { roughness: 0.92, side: THREE.DoubleSide }),
  ];
  const underMats = [
    stdMat(C.canopyUnder, { roughness: 0.95, side: THREE.BackSide }),
    stdMat(0xb2a488, { roughness: 0.96, side: THREE.BackSide }),
  ];
  for (let i = 0; i < ribs; i += 1) {
    put(group, new THREE.ConeGeometry(radius, rise, 2, 1, true, i * gore, gore),
      goreMats[i % 2], { y: (rimY + apexY) / 2, receive: false });
    put(group, new THREE.ConeGeometry(radius * 0.97, rise * 0.97, 2, 1, true, i * gore, gore),
      underMats[i % 2], { y: (rimY + apexY) / 2 - 0.012, cast: false, receive: false });
  }

  // Shallow valance at the rim — a hem, not a brim. The first pass made this a
  // 0.17 m straight cylinder and the whole umbrella read as a flying saucer.
  put(group, new THREE.CylinderGeometry(radius * 0.985, radius * 0.9, 0.11, ribs * 2, 1, true),
    stdMat(C.valance, { roughness: 0.9, side: THREE.DoubleSide }), { y: rimY - 0.05, receive: false });

  // Ribs UNDER the canopy. The first pass left these out because full-length ribs
  // z-fought the cone; slung 3 cm clear of it they do not, and they matter more
  // than they look: the canopy is the single largest smooth area in the left
  // third of frame, and the audit measures that third at 65% of the reference's
  // detail density. Eight dark radial lines across a 3 m cream disc is a large
  // fraction of that gap, and it is what a real patio umbrella has.
  const ribGeo = new THREE.BoxGeometry(radius * 0.94, 0.02, 0.042);
  const ribMat = stdMat(0x584e41, { roughness: 0.72 });
  for (let i = 0; i < ribs; i += 1) {
    const a = (i / ribs) * Math.PI * 2 + Math.PI / ribs;
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.set(Math.cos(a) * radius * 0.5, (rimY + apexY) / 2 - 0.055, Math.sin(a) * radius * 0.5);
    rib.rotation.y = -a;
    rib.rotation.z = Math.atan2(rise * 0.5, radius * 0.5) * -1;
    rib.castShadow = false;
    rib.receiveShadow = false;
    group.add(rib);
  }

  // Rib tips poking past the hem at each fold — cheap, and it is the detail
  // that names the object.
  const tipGeo = new THREE.ConeGeometry(0.028, 0.15, 5);
  const tipMat = stdMat(C.pole, { roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < ribs; i += 1) {
    const a = (i / ribs) * Math.PI * 2 + Math.PI / ribs;
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(Math.cos(a) * radius * 1.02, rimY - 0.02, Math.sin(a) * radius * 1.02);
    tip.rotation.set(Math.PI / 2 - 0.25, 0, 0);
    tip.rotation.y = -a;
    tip.castShadow = false;
    group.add(tip);
  }

  put(group, new THREE.SphereGeometry(0.055, 8, 6), stdMat(C.pole, { metalness: 0.5, roughness: 0.4 }),
    { y: poleTop + 0.02, receive: false });

  // A bulb slung under the hub, hanging clear of the canopy. The reference's
  // left side has its own light pocket; lighting.js's stall pockets are all on
  // the frontageRight side, so without a source here the seating reads as props
  // parked in the dark rather than a table anyone is using.
  put(group, new THREE.CylinderGeometry(0.006, 0.006, 0.34, 5), stdMat(C.metalDark),
    { y: rimY - 0.17, cast: false, receive: false });
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 9),
    new THREE.MeshStandardMaterial({
      color: 0x5a4526, emissive: new THREE.Color(0xffbe78), emissiveIntensity: 2.4, roughness: 1,
    }),
  );
  lamp.position.set(0, rimY - 0.38, 0);
  group.add(lamp);
  emissives.add(lamp, { color: 0xffbe78, intensity: 2.4, kind: 'bulb' });

  // Tiny per-umbrella lean; a plaza umbrella is never dead plumb.
  group.rotation.z = (random() - 0.5) * 0.035;
  group.rotation.x = (random() - 0.5) * 0.03;
  return group;
}

/** A furled umbrella, leaning — the amber vertical accent mid-left. */
function buildFurledUmbrella(random) {
  const group = new THREE.Group();
  const h = 2.5;
  put(group, new THREE.CylinderGeometry(0.03, 0.035, h, 8), stdMat(C.pole, { metalness: 0.5, roughness: 0.45 }),
    { y: h / 2, receive: false });
  const furl = new THREE.CylinderGeometry(0.085, 0.16, 1.25, 9);
  put(group, furl, stdMat(0xd8a63a, { roughness: 0.85 }), { y: h - 0.62, receive: false });
  put(group, new THREE.CylinderGeometry(0.05, 0.09, 0.3, 9), stdMat(0xc08f28, { roughness: 0.85 }),
    { y: h - 1.32, receive: false });
  group.rotation.z = 0.06 + random() * 0.05;
  return group;
}

// ---------------------------------------------------------------------------
// §5 — communal table with bench seating. Long axis runs along the street (Z).

function buildCommunalTable(random, { length = 3.4, width = 0.95, topY = 0.74, seatY = 0.45, benchOffset = 0.78 }) {
  const group = new THREE.Group();
  const topMat = stdMat(C.tableTop, { roughness: 0.72 });
  const frameMat = stdMat(C.tableFrame, { roughness: 0.8 });
  const benchMat = stdMat(C.bench, { roughness: 0.78 });

  // Plank top — three boards, so the near edge catches a highlight seam.
  const boards = 5;
  for (let i = 0; i < boards; i += 1) {
    const bw = width / boards - 0.012;
    put(group, new THREE.BoxGeometry(bw, 0.055, length), topMat, {
      x: -width / 2 + (width / boards) * (i + 0.5), y: topY,
    });
  }
  put(group, new THREE.BoxGeometry(width * 0.9, 0.09, 0.07), frameMat, { y: topY - 0.07, z: length / 2 - 0.35 });
  put(group, new THREE.BoxGeometry(width * 0.9, 0.09, 0.07), frameMat, { y: topY - 0.07, z: -length / 2 + 0.35 });
  // End caps. The near end of a 5.6 m table is the closest horizontal surface in
  // the whole frame; without a capped edge it terminated in five floating board
  // ends and read as a cutaway.
  for (const s of [-1, 1]) {
    put(group, new THREE.BoxGeometry(width + 0.02, 0.075, 0.05), topMat,
      { y: topY - 0.005, z: (s * length) / 2 + s * 0.024 });
  }
  // A long apron under each edge of the top — two more shadow lines down the run.
  for (const sx of [-1, 1]) {
    put(group, new THREE.BoxGeometry(0.035, 0.085, length * 0.99), frameMat,
      { x: sx * (width / 2 + 0.012), y: topY - 0.06, cast: false });
  }

  // Leg pairs every ~2.4 m, not one pair per end. On a 5.6 m near-field table
  // that is three pairs instead of two, and each one is a hard vertical in the
  // frame's smoothest region.
  const legGeo = new THREE.BoxGeometry(0.085, topY - 0.055, 0.085);
  const legPairs = Math.max(2, Math.round(length / 2.4) + 1);
  const legSpan = length - 0.56;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < legPairs; i += 1) {
      put(group, legGeo, frameMat, {
        x: sx * (width / 2 - 0.1),
        y: (topY - 0.055) / 2,
        z: -legSpan / 2 + (legSpan / (legPairs - 1)) * i,
      });
    }
  }
  // Longitudinal stretcher at ankle height, and a diagonal brace at each pair.
  put(group, new THREE.BoxGeometry(0.06, 0.06, length * 0.9), frameMat, { y: 0.18 });
  for (let i = 0; i < legPairs; i += 1) {
    put(group, new THREE.BoxGeometry(width * 0.78, 0.05, 0.05), frameMat, {
      y: 0.18, z: -legSpan / 2 + (legSpan / (legPairs - 1)) * i,
    });
  }

  // Benches both sides — two boards with a visible seam, on the same leg rhythm.
  const benchLen = length * 0.94;
  const benchGeo = new THREE.BoxGeometry(0.163, 0.05, benchLen);
  const benchLegGeo = new THREE.BoxGeometry(0.07, seatY - 0.05, 0.07);
  const benchApron = new THREE.BoxGeometry(0.03, 0.07, benchLen * 0.98);
  for (const sx of [-1, 1]) {
    put(group, benchGeo, benchMat, { x: sx * benchOffset - 0.086, y: seatY });
    put(group, benchGeo, benchMat, { x: sx * benchOffset + 0.086, y: seatY });
    put(group, benchApron, frameMat, { x: sx * benchOffset + 0.17, y: seatY - 0.055, cast: false });
    for (let i = 0; i < legPairs; i += 1) {
      const bz = -legSpan / 2 + (legSpan / (legPairs - 1)) * i;
      put(group, benchLegGeo, frameMat, { x: sx * benchOffset, y: (seatY - 0.05) / 2, z: bz });
      put(group, new THREE.BoxGeometry(0.28, 0.05, 0.05), frameMat,
        { x: sx * benchOffset, y: 0.14, z: bz, cast: false });
    }
  }

  group.add(dressTableTop(random, { length, width, topY }));
  return group;
}

// ---------------------------------------------------------------------------
// §5 / D9 — the table setting.
//
// The audit's largest density deficit in the whole frame sits here: the mid-left
// third carries 62% of the reference's visual information, and the single
// cheapest way to close it is prop COUNT on the two table tops. The reference
// puts roughly fifteen distinguishable objects on one table — stacked red cups,
// white bowls with food in them, plates, amber trays, a chopstick stand, glasses,
// a teapot, a menu card. Four bottles on a bare plank is a showroom, not a meal.
//
// Everything is authored in the table's own local frame so both tables get the
// same treatment at their own lengths, and every position comes off `random`
// so a capture is reproducible.

/** A bowl with a heap of something warm in it. Two meshes, and it reads as food. */
function bowl(parent, random, x, y, z, { r = 0.078, food = true } = {}) {
  put(parent, new THREE.CylinderGeometry(r, r * 0.66, 0.062, 12), stdMat(C.bowlWhite, { roughness: 0.55 }),
    { x, y: y + 0.031, z });
  put(parent, new THREE.TorusGeometry(r * 0.98, 0.008, 5, 14), stdMat(C.bowlRim, { roughness: 0.6 }),
    { x, y: y + 0.062, z, rx: Math.PI / 2, cast: false });
  if (food) {
    const warm = random() > 0.45;
    put(parent, new THREE.SphereGeometry(r * 0.72, 9, 6), stdMat(warm ? C.foodWarm : C.foodPale, { roughness: 0.7 }),
      { x, y: y + 0.055, z, cast: false });
    if (random() > 0.5) {
      put(parent, new THREE.SphereGeometry(r * 0.3, 7, 5), stdMat(C.greens, { roughness: 0.75 }),
        { x: x + r * 0.3, y: y + 0.082, z: z - r * 0.2, cast: false });
    }
  }
}

/** A stack of nested cups — the reference's most recognisable table object. */
function cupStack(parent, x, y, z, { count = 5, color = C.cupRed } = {}) {
  const mat = stdMat(color, { roughness: 0.66 });
  for (let i = 0; i < count; i += 1) {
    put(parent, new THREE.CylinderGeometry(0.049, 0.041, 0.088, 12, 1, true), mat,
      { x, y: y + 0.03 + i * 0.036, z, receive: false });
  }
  put(parent, new THREE.CircleGeometry(0.042, 12), mat, { x, y: y + 0.031, z, rx: -Math.PI / 2, cast: false });
}

function dressTableTop(random, { length, width, topY }) {
  const clutter = new THREE.Group();
  const halfL = length / 2 - 0.24;
  const jitter = (s) => (random() - 0.5) * s;

  // --- the two cup towers, near the middle where the seated pair reach them.
  cupStack(clutter, 0.04 + jitter(0.06), topY, length * 0.14, { count: 6, color: C.cupRed });
  cupStack(clutter, -0.15 + jitter(0.06), topY, length * 0.19, { count: 4, color: C.cupPale });

  // --- chopstick caddy, bristling.
  const caddyZ = length * 0.26;
  put(clutter, new THREE.BoxGeometry(0.115, 0.135, 0.115), stdMat(C.basketTan, { roughness: 0.8 }),
    { x: 0.2, y: topY + 0.09, z: caddyZ });
  const stickGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.26, 4);
  const stickMat = stdMat(0xe8dcbc, { roughness: 0.72 });
  for (let i = 0; i < 11; i += 1) {
    put(clutter, stickGeo, stickMat, {
      x: 0.2 + jitter(0.07), y: topY + 0.2, z: caddyZ + jitter(0.07),
      rx: jitter(0.2), rz: jitter(0.2), cast: false,
    });
  }
  // A shaker pair beside it — small, but two more silhouettes.
  for (let i = 0; i < 2; i += 1) {
    put(clutter, new THREE.CylinderGeometry(0.024, 0.028, 0.085, 10), stdMat(i ? C.trayRed : C.potMetal, { roughness: 0.5 }),
      { x: 0.32, y: topY + 0.045, z: caddyZ - 0.11 + i * 0.1 });
  }

  // --- six bowls, spread the length of the table so the whole run is occupied
  // rather than one clustered end. The audit measures density per REGION; a
  // single busy corner leaves the rest of the run reading as empty plank.
  for (let i = 0; i < 6; i += 1) {
    const t = (i + 0.5) / 6;
    bowl(clutter, random, -0.24 + random() * 0.46, topY, -halfL + t * halfL * 2 + jitter(0.18), {
      r: 0.062 + random() * 0.026,
    });
  }

  // --- plates and small dishes.
  for (let i = 0; i < 5; i += 1) {
    const t = (i + 0.5) / 5;
    put(clutter, new THREE.CylinderGeometry(0.082, 0.076, 0.014, 14), stdMat(C.plateCream, { roughness: 0.5 }),
      { x: -0.3 + random() * 0.58, y: topY + 0.037, z: -halfL + t * halfL * 2 + jitter(0.24), cast: false });
  }

  // --- trays. Amber and red, the two colour notes the reference's table has.
  put(clutter, new THREE.BoxGeometry(0.36, 0.024, 0.26), stdMat(C.trayAmber, { roughness: 0.68 }),
    { x: -0.1, y: topY + 0.04, z: -length * 0.24, ry: 0.2 });
  put(clutter, new THREE.BoxGeometry(0.32, 0.022, 0.23), stdMat(C.trayRed, { roughness: 0.7 }),
    { x: 0.16, y: topY + 0.039, z: length * 0.36, ry: -0.34 });
  put(clutter, new THREE.BoxGeometry(0.3, 0.02, 0.22), stdMat(C.trayAmber, { roughness: 0.68 }),
    { x: -0.18, y: topY + 0.038, z: length * 0.02, ry: 0.5 });

  // --- glasses and a teapot.
  for (let i = 0; i < 5; i += 1) {
    put(clutter, new THREE.CylinderGeometry(0.033, 0.029, 0.105, 10), stdMat(C.glassPale, { roughness: 0.24 }),
      { x: -0.28 + random() * 0.56, y: topY + 0.055, z: -halfL + random() * halfL * 2 });
  }
  const potZ = -length * 0.1;
  put(clutter, new THREE.SphereGeometry(0.082, 12, 9), stdMat(C.teapotClay, { roughness: 0.62 }),
    { x: -0.2, y: topY + 0.082, z: potZ });
  put(clutter, new THREE.CylinderGeometry(0.03, 0.038, 0.035, 10), stdMat(C.teapotClay, { roughness: 0.62 }),
    { x: -0.2, y: topY + 0.165, z: potZ, cast: false });
  put(clutter, new THREE.CylinderGeometry(0.012, 0.018, 0.11, 7), stdMat(C.teapotClay, { roughness: 0.62 }),
    { x: -0.2, y: topY + 0.1, z: potZ + 0.1, rx: 0.9, cast: false });

  // --- a shallow steel pot with a lid, and a lidded pan. Cool metal against all
  // that warm ceramic; §9 wants the left side not to be one hue either.
  put(clutter, new THREE.CylinderGeometry(0.098, 0.092, 0.09, 14), stdMat(C.potMetal, { roughness: 0.34, metalness: 0.55 }),
    { x: 0.12, y: topY + 0.045, z: -length * 0.34 });
  put(clutter, new THREE.CylinderGeometry(0.1, 0.1, 0.014, 14), stdMat(C.potMetal, { roughness: 0.3, metalness: 0.6 }),
    { x: 0.12, y: topY + 0.097, z: -length * 0.34, cast: false });

  // --- a woven basket of something pale, and a bundle of napkins.
  put(clutter, new THREE.CylinderGeometry(0.1, 0.082, 0.075, 12, 1, true), stdMat(C.basketTan, { roughness: 0.85, side: THREE.DoubleSide }),
    { x: 0.2, y: topY + 0.038, z: -length * 0.06 });
  put(clutter, new THREE.SphereGeometry(0.075, 9, 6), stdMat(C.foodPale, { roughness: 0.8 }),
    { x: 0.2, y: topY + 0.062, z: -length * 0.06, cast: false });
  put(clutter, new THREE.BoxGeometry(0.11, 0.08, 0.13), stdMat(0xdedad0, { roughness: 0.85 }),
    { x: -0.3, y: topY + 0.04, z: length * 0.3, ry: 0.3 });

  // --- menu cards standing on edge. Vertical marks in a field of horizontals.
  put(clutter, new THREE.BoxGeometry(0.16, 0.21, 0.012), stdMat(0xd9b040, { roughness: 0.75 }),
    { x: 0.28, y: topY + 0.135, z: -length * 0.32, ry: -0.5, rx: -0.14 });
  put(clutter, new THREE.BoxGeometry(0.14, 0.19, 0.012), stdMat(0xd6cdb6, { roughness: 0.78 }),
    { x: -0.3, y: topY + 0.125, z: length * 0.44, ry: 0.62, rx: -0.1 });

  // --- the NEAR-END setting. Everything above is spread evenly along the run,
  // which is right for the table but wrong for the frame: on a 5.6 m table the
  // near metre is what the hero camera actually resolves, and an evenly spread
  // table still leaves the bottom-left corner reading as bare plank. This second,
  // denser cluster sits in the last 18% of the run — a place setting in front of
  // the diner who sits there, at the screen size where each object is legible.
  // Clamped so the cluster's own ±1.05 m spread never hangs off a short table.
  // Pulled back from 0.30·length to 0.17·length after a capture: at the near end
  // proper it sat directly BEHIND the diner seated there and none of it reached
  // frame. The reference offsets the two — the man at x≈16% of frame, his cups
  // and trays at 20-32% — so the setting has to sit one place down the bench.
  const nearZ = Math.max(-length / 2 + 1.15, Math.min(length * 0.17, length / 2 - 1.15));
  cupStack(clutter, 0.02, topY, nearZ + 0.34, { count: 7, color: C.cupRed });
  cupStack(clutter, 0.26, topY, nearZ + 0.5, { count: 5, color: C.trayAmber });
  bowl(clutter, random, -0.2, topY, nearZ, { r: 0.09 });
  bowl(clutter, random, 0.04, topY, nearZ - 0.22, { r: 0.075 });
  bowl(clutter, random, 0.24, topY, nearZ + 0.02, { r: 0.07 });
  put(clutter, new THREE.CylinderGeometry(0.095, 0.088, 0.016, 16), stdMat(C.plateCream, { roughness: 0.5 }),
    { x: -0.22, y: topY + 0.038, z: nearZ + 0.36, cast: false });
  put(clutter, new THREE.CylinderGeometry(0.088, 0.082, 0.016, 16), stdMat(C.plateCream, { roughness: 0.5 }),
    { x: 0.14, y: topY + 0.038, z: nearZ - 0.44, cast: false });
  put(clutter, new THREE.BoxGeometry(0.4, 0.026, 0.29), stdMat(C.trayRed, { roughness: 0.7 }),
    { x: -0.06, y: topY + 0.043, z: nearZ + 0.72, ry: -0.22 });
  for (let i = 0; i < 4; i += 1) {
    put(clutter, new THREE.CylinderGeometry(0.035, 0.031, 0.115, 10), stdMat(C.glassPale, { roughness: 0.22 }),
      { x: -0.26 + i * 0.16 + jitter(0.05), y: topY + 0.06, z: nearZ - 0.62 + jitter(0.14) });
  }
  // A condiment rack: four little bottles in a timber tray. Small, but it is four
  // more silhouettes and two more hue notes at the largest screen size on the table.
  const rackZ = nearZ - 0.86;
  put(clutter, new THREE.BoxGeometry(0.24, 0.03, 0.14), stdMat(C.basketTan, { roughness: 0.82 }),
    { x: 0.18, y: topY + 0.02, z: rackZ });
  const condiment = [0x8e2f22, 0x3a2a18, 0xc8a63a, 0x6d7a4a];
  for (let i = 0; i < 4; i += 1) {
    put(clutter, new THREE.CylinderGeometry(0.021, 0.024, 0.1, 8), stdMat(condiment[i], { roughness: 0.4 }),
      { x: 0.1 + (i % 2) * 0.11, y: topY + 0.085, z: rackZ - 0.03 + Math.floor(i / 2) * 0.06 });
  }
  // A steel teapot and two more bowls at the very end of the run.
  put(clutter, new THREE.CylinderGeometry(0.072, 0.082, 0.13, 12), stdMat(C.potMetal, { roughness: 0.3, metalness: 0.6 }),
    { x: 0.24, y: topY + 0.065, z: nearZ + 0.92 });
  bowl(clutter, random, -0.24, topY, nearZ + 1.02, { r: 0.072 });

  return clutter;
}

// ---------------------------------------------------------------------------
// §5 — stacked timber kegs, brown with metal banding. The distinctive
// mid-left silhouette: a pyramid of barrels lying end-on to camera.

function buildKeg(random, { length = 0.86, radius = 0.3 }) {
  const group = new THREE.Group();
  const profile = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = -length / 2 + t * length;
    const bulge = 1 - 0.17 * ((2 * y) / length) ** 2;
    profile.push(new THREE.Vector2(radius * bulge, y));
  }
  const woodMat = stdMat(C.kegWood, { roughness: 0.82 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 18), woodMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const capR = radius * (1 - 0.17);
  for (const s of [-1, 1]) {
    put(group, new THREE.CircleGeometry(capR, 18), stdMat(C.kegWood, { roughness: 0.88 }),
      { y: (s * length) / 2, rx: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    put(group, new THREE.TorusGeometry(capR * 0.97, 0.022, 6, 18), stdMat(C.kegHoop, { metalness: 0.7, roughness: 0.45 }),
      { y: (s * length) / 2 - s * 0.012, rx: Math.PI / 2 });
  }
  // Banding.
  const bandMat = stdMat(C.kegBand, { metalness: 0.55, roughness: 0.5 });
  for (const t of [0.3, 0.5, 0.7]) {
    const y = -length / 2 + t * length;
    const r = radius * (1 - 0.17 * ((2 * y) / length) ** 2) * 1.015;
    put(group, new THREE.CylinderGeometry(r, r, 0.055, 18, 1, true), bandMat, { y, receive: false });
  }
  group.rotation.y = random() * Math.PI * 2;
  return group;
}

function buildKegStack(random) {
  const group = new THREE.Group();
  const R = 0.3;
  const L = 0.86;
  // Two rows lying end-on (axis along Z, so the banded circular ends face the
  // camera), plus a pair standing upright at the side.
  const rows = [
    { count: 4, y: R, xoff: 0 },
    { count: 3, y: R + R * 1.72, xoff: R * 1.0 },
    { count: 2, y: R + R * 3.44, xoff: R * 2.0 },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.count; i += 1) {
      const keg = buildKeg(random, { length: L, radius: R });
      keg.rotation.x = Math.PI / 2;
      keg.position.set(row.xoff + i * (R * 2.04), row.y, (random() - 0.5) * 0.04);
      group.add(keg);
    }
  }
  for (let i = 0; i < 2; i += 1) {
    const keg = buildKeg(random, { length: L, radius: R });
    keg.position.set(-R * 2.4 - i * 0.05, L / 2, -0.85 - i * 0.72);
    group.add(keg);
  }
  // A low timber pallet under the stack — kegs never sit on bare paving.
  const palletMat = stdMat(0x5f4a32, { roughness: 0.9 });
  for (let i = 0; i < 5; i += 1) {
    put(group, new THREE.BoxGeometry(rows[0].count * R * 2.1, 0.045, 0.15), palletMat, {
      x: (rows[0].count - 1) * R * 1.02, y: 0.06, z: -0.42 + i * 0.21,
    });
  }
  return group;
}

/**
 * D9 — a tall, tight barrel wall, banded ends facing camera.
 *
 * Distinct from `buildKegStack`: that one is a low pyramid on a pallet, which at
 * 12 m subtends almost nothing. The reference's barrels are a two-column, four-
 * high pale mass filling y 44-59% of frame at x ≈ 19%, and that mass is a large
 * part of why the reference's mid-left reads as occupied. Columns are centred on
 * the group origin so it can be slotted into the 1.3 m of clear ground between
 * the railing and the tables without hand-solving for its footprint.
 */
function buildBarrelWall(random, { cols = 2, rows = 4, R = 0.32, L = 0.9 }) {
  const group = new THREE.Group();
  const pitchX = R * 2.06;
  const pitchY = R * 1.74;
  for (let r = 0; r < rows; r += 1) {
    const n = r === rows - 1 ? Math.max(1, cols - 1) : cols;
    for (let i = 0; i < n; i += 1) {
      const keg = buildKeg(random, { length: L, radius: R });
      keg.rotation.x = Math.PI / 2;
      keg.position.set(
        (i - (n - 1) / 2) * pitchX + (random() - 0.5) * 0.02,
        R + r * pitchY,
        (random() - 0.5) * 0.05,
      );
      group.add(keg);
    }
  }
  // Timber chocks at the base — the tell that this is a stack, not a pile.
  const chock = stdMat(0x6a5238, { roughness: 0.9 });
  for (let i = 0; i < cols; i += 1) {
    put(group, new THREE.BoxGeometry(0.12, 0.09, L * 1.1), chock,
      { x: (i - (cols - 1) / 2) * pitchX - R * 0.86, y: 0.045 });
  }
  return group;
}

/**
 * D9 — the hedge behind the railing. The audit's instruction is literal: replace
 * the black void with "a dark-but-not-black foliage mass (L≈20–30, slightly
 * green)". Standard material, not the basic material the far tree mass uses, so
 * it takes a little of the left pocket light and is not a flat cut-out.
 */
function buildHedge(random, { length = 14, height = 1.45, z0 = 0 }) {
  const group = new THREE.Group();
  const dark = stdMat(C.foliage, { roughness: 1 });
  const lit = stdMat(C.foliageLit, { roughness: 1 });
  // Blob pitch 0.52 m, not 0.78: a hedge made of a dozen big lumps is a wall with
  // a bumpy top. The gradient-magnitude metric counts silhouette edges, and small
  // overlapping masses are almost all edge.
  const n = Math.round(length / 0.52);
  for (let i = 0; i < n; i += 1) {
    const z = z0 - length / 2 + (length / n) * (i + 0.5);
    const r = 0.26 + random() * 0.17;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), random() > 0.62 ? lit : dark);
    blob.position.set((random() - 0.5) * 0.36, height - r * 0.55 + (random() - 0.5) * 0.3, z);
    blob.scale.set(0.9, 0.8 + random() * 0.35, 1.0);
    blob.rotation.set(random() * 3, random() * 3, random() * 3);
    blob.castShadow = false;
    blob.receiveShadow = true;
    group.add(blob);
    // A lower course, so the hedge has a body and not just a fringe.
    const low = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.82, 1), dark);
    low.position.set((random() - 0.5) * 0.3, height * 0.5 + (random() - 0.5) * 0.22, z + (random() - 0.5) * 0.3);
    low.rotation.set(random() * 3, random() * 3, random() * 3);
    low.castShadow = false;
    low.receiveShadow = true;
    group.add(low);
  }
  return group;
}

/** Diamond mesh for the §5 fence — cheap, and it is pure detail density. */
function meshPanelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  for (let i = -64; i <= 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** A stack of stools, and a couple knocked loose. More seating, §5 / D9. */
function buildStool(random) {
  const stool = new THREE.Group();
  put(stool, new THREE.CylinderGeometry(0.175, 0.165, 0.05, 12), stdMat(C.bench, { roughness: 0.76 }), { y: 0.44 });
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2;
    put(stool, new THREE.CylinderGeometry(0.02, 0.024, 0.44, 6), stdMat(C.tableFrame),
      { x: Math.cos(a) * 0.11, y: 0.22, z: Math.sin(a) * 0.11, rx: Math.cos(a) * -0.08, rz: Math.sin(a) * 0.08 });
  }
  stool.rotation.y = random() * 2;
  return stool;
}

// ---------------------------------------------------------------------------
// §5 — the yellow/amber food-truck structure, mid-left. Its lit serving hatch
// is registered with the emissive registry; lighting.js owns the scale.

function buildFoodTruck(random, emissives) {
  const group = new THREE.Group();
  const L = 4.6;
  const W = 2.1;
  const bodyY = 0.72;
  const bodyH = 1.75;

  const bodyMat = stdMat(C.truckBody, { roughness: 0.62 });
  const trimMat = stdMat(C.truckTrim, { roughness: 0.6 });
  const darkMat = stdMat(C.truckDark, { roughness: 0.85 });

  put(group, new THREE.BoxGeometry(W, bodyH, L * 0.72), bodyMat, { y: bodyY + bodyH / 2, z: L * 0.11 });
  // Cab, lower and set forward down-street.
  put(group, new THREE.BoxGeometry(W * 0.93, bodyH * 0.68, L * 0.28), darkMat,
    { y: bodyY + bodyH * 0.34, z: -L * 0.36 });
  put(group, new THREE.BoxGeometry(W * 0.86, bodyH * 0.3, L * 0.1), stdMat(0x101418, { roughness: 0.25, metalness: 0.2 }),
    { y: bodyY + bodyH * 0.52, z: -L * 0.47 });
  // Chassis + wheels.
  put(group, new THREE.BoxGeometry(W * 0.9, 0.22, L * 0.96), darkMat, { y: bodyY - 0.09 });
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14);
  for (const sx of [-1, 1]) {
    for (const sz of [-L * 0.32, L * 0.3]) {
      put(group, wheel, stdMat(0x15181a, { roughness: 0.9 }), {
        x: sx * (W / 2 - 0.13), y: 0.36, z: sz, rz: Math.PI / 2,
      });
    }
  }

  // Serving hatch on the +X side (facing the street). Recessed dark interior
  // with an emissive back panel: this is the warm pocket mid-left. Nothing in
  // lighting.js illuminates the left half of the street, so the lit interior is
  // doing all the work of making this truck read — it is sized accordingly.
  const hatchW = L * 0.6;
  const hatchH = 1.12;
  const hatchY = bodyY + bodyH * 0.62;
  put(group, new THREE.BoxGeometry(0.06, hatchH, hatchW), darkMat, { x: W / 2 - 0.02, y: hatchY, z: L * 0.1 });
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(hatchW * 0.98, hatchH * 0.94),
    new THREE.MeshStandardMaterial({
      color: 0x3a2c1a,
      emissive: new THREE.Color(0xffc07a),
      emissiveIntensity: 2.4,
      roughness: 1,
    }),
  );
  glow.position.set(W / 2 + 0.012, hatchY, L * 0.1);
  glow.rotation.y = Math.PI / 2;
  group.add(glow);
  emissives.add(glow, { color: 0xffc07a, intensity: 2.4, kind: 'stall-interior' });

  // Counter ledge and the flap awning over the hatch.
  put(group, new THREE.BoxGeometry(0.42, 0.06, hatchW * 1.05), stdMat(C.truckCounter, { roughness: 0.7 }),
    { x: W / 2 + 0.17, y: hatchY - hatchH / 2 - 0.03, z: L * 0.1 });
  put(group, new THREE.BoxGeometry(0.78, 0.05, hatchW * 1.06), trimMat, {
    x: W / 2 + 0.3, y: hatchY + hatchH / 2 + 0.24, z: L * 0.1, rz: 0.42,
  });

  // A small lit menu box above the counter.
  const menu = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.44, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0x6a4a12,
      emissive: new THREE.Color(0xffd487),
      emissiveIntensity: 1.7,
      roughness: 0.9,
    }),
  );
  menu.position.set(W / 2 + 0.07, hatchY + hatchH / 2 + 0.52, L * 0.1);
  group.add(menu);
  emissives.add(menu, { color: 0xffd487, intensity: 1.7, kind: 'sign' });

  // §0: a vertical banner of ORIGINAL glyph-like marks on the truck's near edge.
  const bannerTex = glyphStripTexture(random, { bg: '#161310', fg: '#f0e5cf', rows: 5 });
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 1.7),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.9, side: THREE.DoubleSide }),
  );
  banner.position.set(W / 2 + 0.05, bodyY + bodyH * 0.5, L * 0.36);
  banner.rotation.y = Math.PI / 2;
  banner.castShadow = false;
  group.add(banner);

  // Two bare bulbs under the awning flap. The hatch interior is registered as
  // `stall-interior`, which lighting.js budgets BELOW its bloom threshold — a
  // lit surface, no halo — so without these the truck has nothing that reads
  // as a source through the haze.
  for (const dz of [-0.7, 0.7]) {
    const b = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x5a4526, emissive: new THREE.Color(0xffc07a), emissiveIntensity: 2.3, roughness: 1,
      }),
    );
    b.position.set(W / 2 + 0.34, hatchY + hatchH / 2 + 0.12, L * 0.1 + dz);
    group.add(b);
    emissives.add(b, { color: 0xffc07a, intensity: 2.3, kind: 'bulb' });
  }

  // Body stripe, so the truck is not one flat amber slab.
  put(group, new THREE.BoxGeometry(W * 1.005, 0.16, L * 0.72), trimMat,
    { y: bodyY + bodyH * 0.24, z: L * 0.11, cast: false });

  // Self-lit fascia band along the serving side. §5 calls this the yellow/amber
  // structure; unlit amber at 15 m in warm haze is just brown.
  const fascia = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 0.7, 0.3),
    new THREE.MeshStandardMaterial({
      color: 0x7a5a16, emissive: new THREE.Color(0xffb64f), emissiveIntensity: 1.2, roughness: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  fascia.position.set(W / 2 + 0.011, bodyY + bodyH * 0.98, L * 0.1);
  fascia.rotation.y = Math.PI / 2;
  fascia.castShadow = false;
  group.add(fascia);
  emissives.add(fascia, { color: 0xffb64f, intensity: 1.2, kind: 'fascia' });

  return group;
}

// ---------------------------------------------------------------------------
// §5 — dark tree mass behind, unlit. MeshBasicMaterial guarantees it stays a
// near-black silhouette no matter what lighting.js does with exposure.

function buildTreeMass(random, { canopies = 6, spread = 1.0, baseY = 3.4 }) {
  const group = new THREE.Group();
  // These used to carry fog:false. That was a compensation for lighting.js's OLD
  // atmosphere — FogExp2 at density 0.017 in a warm 0x241a19 — which was a bright
  // warm haze that dissolved the whole mass into the sky and emptied the upper-left
  // corner. lighting.js thinned the fog to 0.0125 and neutralised it to 0x1b1e26
  // on 2026-08-16, and at that density and colour fog contributes ≤7% of a dark
  // neutral at this distance: it cannot dissolve anything. The compensation is
  // reverted, so the trees now sit in the same atmosphere as everything else
  // instead of being the one mass in frame that ignores it.
  // D9: two greens, not one. A single flat colour over a lumpy silhouette is
  // still a cut-out; alternating the sub-masses gives the mass internal edges,
  // which is what the gradient-magnitude density metric is actually counting.
  const darkMat = new THREE.MeshBasicMaterial({ color: C.treeMass });
  const deepMat = new THREE.MeshBasicMaterial({ color: C.treeMassDeep });
  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x0f1210 }); // was 0x0d130f, same chroma cut
  for (let i = 0; i < canopies; i += 1) {
    const r = 1.25 + random() * 1.15;
    const x = (-1.1 + random() * 1.3) * spread;
    const z = (-2.2 + random() * 4.4) * spread;
    const y = baseY + random() * 2.4;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), darkMat);
    blob.position.set(x, y, z);
    blob.scale.set(1, 0.72 + random() * 0.3, 0.86 + random() * 0.3);
    blob.rotation.set(random() * 3, random() * 3, random() * 3);
    group.add(blob);
    // Sub-masses break the ball read. The first pass used two large ones and
    // the whole thing silhouetted as a boulder; four small lumpy ones at the
    // canopy edge give the ragged outline foliage actually has.
    for (let k = 0; k < 4; k += 1) {
      const sr = r * (0.3 + random() * 0.32);
      const a = random() * Math.PI * 2;
      const d = r * (0.65 + random() * 0.5);
      const sub = new THREE.Mesh(new THREE.IcosahedronGeometry(sr, 1), k % 2 ? deepMat : darkMat);
      sub.position.set(
        x + Math.cos(a) * d,
        Math.max(sr + 0.4, y + (random() - 0.55) * r * 1.15),
        z + Math.sin(a) * d,
      );
      sub.rotation.set(random() * 3, random() * 3, random() * 3);
      group.add(sub);
    }
    if (i % 2 === 0) {
      const th = y - r * 0.55;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, th, 7), trunkMat);
      trunk.position.set(x, th / 2, z);
      group.add(trunk);
    }
  }
  return group;
}

// ---------------------------------------------------------------------------
// §5 — green metal railing at the far-left edge.

function buildRailing({ length = 7.6, height = 1.06 }) {
  const group = new THREE.Group();
  const mat = stdMat(C.fenceGreen, { roughness: 0.55, metalness: 0.4 });
  const railGeo = new THREE.BoxGeometry(0.06, 0.06, length);
  put(group, railGeo, mat, { y: height, receive: false });
  put(group, railGeo, mat, { y: height - 0.42, receive: false });
  put(group, railGeo, mat, { y: 0.1, receive: false });
  const barGeo = new THREE.BoxGeometry(0.03, height, 0.03);
  const spacing = 0.13;
  const bars = Math.floor(length / spacing);
  for (let i = 0; i <= bars; i += 1) {
    put(group, barGeo, mat, { y: height / 2, z: -length / 2 + i * spacing, cast: false, receive: false });
  }
  const postGeo = new THREE.BoxGeometry(0.09, height + 0.1, 0.09);
  const posts = Math.max(2, Math.round(length / 2.1));
  for (let i = 0; i <= posts; i += 1) {
    put(group, postGeo, mat, { y: (height + 0.1) / 2, z: -length / 2 + (length / posts) * i });
  }

  // §5's fence is a GREEN MESH, and the mesh is the point: an alpha-cut diamond
  // lattice puts real high-frequency edges across the whole left edge of frame
  // for two triangles. Alpha-tested rather than blended so it needs no sorting
  // against the hedge behind it.
  const tex = meshPanelTexture();
  tex.repeat.set(length * 6.4, height * 6.4);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(length, height - 0.12),
    new THREE.MeshStandardMaterial({
      color: C.fenceGreen,
      alphaMap: tex,
      transparent: true,
      alphaTest: 0.45,
      roughness: 0.6,
      metalness: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  panel.rotation.y = Math.PI / 2;
  panel.position.y = height / 2 + 0.02;
  panel.castShadow = false;
  panel.receiveShadow = true;
  group.add(panel);
  return group;
}

// ---------------------------------------------------------------------------
// Small dressing: crates, a bin, ground litter.

function buildCrate(random, { w = 0.52, h = 0.32, d = 0.38, color = C.crateTimber }) {
  const group = new THREE.Group();
  const mat = stdMat(color, { roughness: 0.85 });
  const t = 0.035;
  put(group, new THREE.BoxGeometry(w, t, d), mat, { y: t / 2 });
  put(group, new THREE.BoxGeometry(w, h, t), mat, { y: h / 2, z: d / 2 });
  put(group, new THREE.BoxGeometry(w, h, t), mat, { y: h / 2, z: -d / 2 });
  put(group, new THREE.BoxGeometry(t, h, d), mat, { x: w / 2, y: h / 2 });
  put(group, new THREE.BoxGeometry(t, h, d), mat, { x: -w / 2, y: h / 2 });
  group.rotation.y = (random() - 0.5) * 0.5;
  return group;
}

function buildBin() {
  const group = new THREE.Group();
  const mat = stdMat(C.binDark, { roughness: 0.6, metalness: 0.3 });
  put(group, new THREE.CylinderGeometry(0.29, 0.25, 0.86, 14, 1, true), mat, { y: 0.43 });
  put(group, new THREE.TorusGeometry(0.29, 0.025, 6, 16), mat, { y: 0.86, rx: Math.PI / 2 });
  put(group, new THREE.CylinderGeometry(0.31, 0.31, 0.06, 14), stdMat(0x3a3a34, { roughness: 0.7 }), { y: 0.89 });
  return group;
}

/** §2: a few cans and a fallen bottle, near-foreground right. */
function buildLitter(random) {
  const group = new THREE.Group();
  const canBody = stdMat(C.canBody, { roughness: 0.32, metalness: 0.72 });
  const canLabel = stdMat(C.canLabel, { roughness: 0.42, metalness: 0.25 });

  const can = (x, z, ry, crushed) => {
    const c = new THREE.Group();
    const h = crushed ? 0.085 : 0.122;
    put(c, new THREE.CylinderGeometry(0.033, 0.033, h, 12), canBody, { y: h / 2 });
    put(c, new THREE.CylinderGeometry(0.0335, 0.0335, h * 0.5, 12, 1, true), canLabel, { y: h * 0.5 });
    // Lying on its side — a standing can in the gutter reads as placed, not dropped.
    c.rotation.set(Math.PI / 2, 0, 0);
    c.position.set(x, 0.033, z);
    c.rotation.z = ry;
    if (crushed) c.scale.set(1, 1, 0.62);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(c);
    return c;
  };
  // Kept on the open paving between the kerbs. Pushed out to x > 2 they sat
  // behind frontage.js's crate run and never appeared in frame at all.
  // The 1.22/4.9 can moved to 1.62/6.35: D3's near wing figure now stands at
  // (0.99, 4.92) and a mannequin's foot was passing straight through it.
  can(1.62, 6.35, 0.7, false);
  can(1.66, 4.05, -1.25, true);
  can(1.05, 6.1, 2.1, false);
  can(1.35, 3.4, 1.4, false); // was -1.35/4.35, now under tableA's lengthened bench

  // Fallen bottle.
  const bottle = new THREE.Group();
  const glass = stdMat(C.bottleGlass, { roughness: 0.18, metalness: 0.1 });
  put(bottle, new THREE.CylinderGeometry(0.038, 0.038, 0.19, 12), glass, { y: 0.095 });
  put(bottle, new THREE.CylinderGeometry(0.014, 0.036, 0.07, 12), glass, { y: 0.225 });
  put(bottle, new THREE.CylinderGeometry(0.015, 0.015, 0.06, 10), glass, { y: 0.28 });
  put(bottle, new THREE.CylinderGeometry(0.017, 0.017, 0.022, 10), stdMat(0xc8a23a, { metalness: 0.6, roughness: 0.35 }), { y: 0.315 });
  bottle.rotation.set(Math.PI / 2, 0, 0);
  bottle.position.set(1.52, 0.038, 4.45);
  bottle.rotation.z = -0.55;
  bottle.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(bottle);

  // A flattened paper cup and a receipt scrap — cheap, and they sell it.
  put(group, new THREE.CylinderGeometry(0.045, 0.035, 0.09, 10), stdMat(C.cupStack, { roughness: 0.8 }),
    { x: 1.9, y: 0.045, z: 5.35, rx: Math.PI / 2, rz: 0.9 });
  put(group, new THREE.PlaneGeometry(0.09, 0.14), stdMat(0xe7e2d4, { roughness: 0.95, side: THREE.DoubleSide }),
    { x: 0.85, y: 0.006, z: 5.2, rx: -Math.PI / 2, ry: 0.6, cast: false });
  void random;
  return group;
}

// ---------------------------------------------------------------------------
// §8 — figures. ToonLab's shipped CC0 mannequin GLB, posed from its own bundled
// clips at a FIXED sample time (never driven off the clock) so every capture is
// byte-identical regardless of frame rate.

const MANNEQUIN_URL = '/characters/mannequin.glb';

// D10 — the figures were black cut-outs, and this table is why. The previous
// tints (0x5a5464 and friends) sit at sRGB ≈ 0.35, i.e. LINEAR ≈ 0.10; the GLB's
// own base colour is 0.42 linear and even that reads as a shop dummy. The audit's
// instruction is "~0.6 diffuse rather than ~0.15", so `main` here runs
// sRGB 0.78-0.88 → linear 0.57-0.75, which is cream/tan/pale-olive clothing.
//
// Two tones per figure, split at the hip. One flat colour over a 1.75 m body at
// half the frame height reads as a mannequin no matter how bright it is; a
// garment value over a trouser value is the whole difference between "a person"
// and "a posed dummy", and it costs one shader chunk.
// Chroma matters as much as level here. At the first try these were near-neutral
// creams and the figures measured dead on the reference's L (61.6 against 62.7)
// while still reading as plaster shop dummies, because a body that is one
// desaturated value from collar to ankle is a mannequin whatever its brightness.
// Each look now carries a real garment hue AND a real split — three of the six
// run pale-over-dark, three run dark-over-pale, the way a street of people does.
const FIGURE_LOOKS = [
  { main: 0xe0d2ae, lower: 0x6b7286 }, // cream shirt over denim
  { main: 0xb87b45, lower: 0xcfc6b2 }, // rust jacket over pale trousers
  { main: 0xa9a184, lower: 0xc6bda4 }, // stone-olive coat over khaki
  { main: 0xd8d4cc, lower: 0x6f6558 }, // white shirt over brown
  { main: 0x7f8fa8, lower: 0xc9c3b4 }, // blue-grey over stone
  { main: 0xc9a06a, lower: 0x5f6673 }, // sand over slate
];

/**
 * Two-tone a mannequin at a given model-space height.
 *
 * The GLB carries exactly two materials (M_Main, M_Joints) and no useful UV
 * layout to paint into, so the split is done in the shader off the post-skinning
 * object-space Y. Injected after `<skinning_vertex>`'s output is final —
 * `<project_vertex>` is the anchor because it exists whether or not the mesh is
 * skinned, so a static prop taking the same treatment does not silently miss it.
 */
function applyTwoTone(material, splitY, lowerColor, fillScale) {
  const lower = new THREE.Color(lowerColor); // Color() → working (linear) space
  const lowerFill = lower.clone().multiplyScalar(fillScale);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSplitY = { value: splitY };
    shader.uniforms.uLower = { value: lower };
    shader.uniforms.uLowerFill = { value: lowerFill };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyY;')
      .replace('#include <project_vertex>', 'vBodyY = transformed.y;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vBodyY;\nuniform float uSplitY;\nuniform vec3 uLower;\nuniform vec3 uLowerFill;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat nmSplit = smoothstep(uSplitY - 0.05, uSplitY + 0.05, vBodyY);\ndiffuseColor.rgb = mix(uLower, diffuseColor.rgb, nmSplit);',
      )
      // The ambient floor has to follow the split too. When it did not, the fill
      // was one flat neutral over the whole body and it washed the garment split
      // straight back out — the figures measured correct and still looked like
      // plaster.
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(uLowerFill, totalEmissiveRadiance, nmSplit);',
      );
  };
  // Distinct cache key per split/colour pair. Without it three shares one program
  // across every figure, which is fine for uniforms but makes a shader-editor
  // dump of the frame unreadable and hides a mis-injection behind a cache hit.
  material.customProgramCacheKey = () => `nm-twotone-${splitY.toFixed(3)}-${lowerColor.toString(16)}`;
}

function lowestBoneY(object, names) {
  const v = new THREE.Vector3();
  let min = Infinity;
  object.traverse((o) => {
    if (o.isBone && names.includes(o.name)) min = Math.min(min, o.getWorldPosition(v).y);
  });
  return min;
}

function boneY(object, name) {
  const v = new THREE.Vector3();
  let y = null;
  object.traverse((o) => { if (o.isBone && o.name === name) y = o.getWorldPosition(v).y; });
  return y;
}

async function buildFigures(ctx, root, random, anchors) {
  let asset;
  try {
    asset = await new Promise((resolve, reject) => {
      new GLTFLoader().load(MANNEQUIN_URL, resolve, undefined, reject);
    });
  } catch (error) {
    console.warn('[night-market/dressing] mannequin unavailable, figures skipped:', error?.message ?? error);
    return { placed: 0 };
  }

  const clipByName = new Map(asset.animations.map((c) => [c.name, c]));
  // GLTFLoader strips glTF's reserved characters from node names, so the rig's
  // `DEF-toe.L` arrives as `DEF-toeL`. Matching only the dotted form silently
  // returned Infinity and skipped grounding entirely — both spellings here.
  const TOES = ['DEF-toeL', 'DEF-toeR', 'DEF-toe.L', 'DEF-toe.R'];

  // Bind-pose reference: with the soles on the floor, this is where the toe
  // bones sit. Every posed figure is shifted to put its planted toe back here.
  const bindProbe = cloneSkinned(asset.scene);
  bindProbe.updateMatrixWorld(true);
  const bindToeY = lowestBoneY(bindProbe, TOES);
  // Model-space height, so the garment/trouser split is expressed as a fraction
  // of the body rather than as a magic number that breaks if the GLB is re-exported.
  const bbox = new THREE.Box3().setFromObject(bindProbe);
  const modelH = Math.max(0.5, bbox.max.y - bbox.min.y);
  const HIP_SPLIT = bbox.min.y + modelH * 0.52;

  const spawn = ({ clip, time, scale, x, z, yaw, look, seated = false, seatY = 0.45 }) => {
    const figure = cloneSkinned(asset.scene);
    figure.scale.setScalar(scale);
    figure.position.set(x, 0, z);
    figure.rotation.y = yaw;
    const mainColor = new THREE.Color(look.main);
    // The GLB's ball joints are its most mannequin-like feature — elbows, knees,
    // wrists and neck picked out as separate spheres. Giving them their own value
    // announced the rig; carrying the garment through them at 88% reads as a
    // seam instead of as a joint, which is what the reference's out-of-focus
    // people look like.
    const jointColor = mainColor.clone().multiplyScalar(0.88);
    figure.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // D10. The GLB ships M_Main at 0.42 linear and M_Joints at 0.055 — the
        // joints are what turned every figure into a jointed black doll under
        // exposure 0.41. Both are replaced with clothing values.
        const isJoint = m.name === 'M_Joints';
        const base = (isJoint ? jointColor : mainColor).clone();
        const lower = new THREE.Color(look.lower).multiplyScalar(isJoint ? 0.88 : 1);
        m.color = base;
        m.roughness = 0.78;
        m.metalness = 0;
        // D10, second half. Albedo alone does not fix a figure walking AWAY from
        // camera: every practical in the scene is then behind it and the camera
        // sees only the shadow side, which is how a 0.6-albedo body still lands
        // at L≈25. The audit's note is that the reference's people are "lit
        // flatly by ambient market light, never silhouettes" — so this is a flat,
        // uniform floor in the garment's own hue, three-quarters of a stop under
        // the lit side and two decades under TUNE.bloomThreshold, which means it
        // reads as fill and never as a glow. Deliberately NOT registered on
        // ctx.emissives: these are not sources and must not take a bloom budget.
        const FILL = 0.14;
        m.emissive = base.clone().multiplyScalar(FILL);
        m.emissiveIntensity = 1;
        applyTwoTone(m, HIP_SPLIT, lower.getHex(), FILL);
        m.needsUpdate = true;
      }
    });
    root.add(figure);

    const source = clipByName.get(clip);
    if (source) {
      const mixer = new THREE.AnimationMixer(figure);
      mixer.clipAction(source).play();
      mixer.setTime(time); // fixed sample — deterministic, no per-frame update
    }
    figure.updateMatrixWorld(true);

    if (seated) {
      // Seated figures are grounded off the hips so they meet the bench top;
      // the bench and table hide the legs from the hero camera anyway.
      const hips = boneY(figure, 'DEF-hips');
      if (hips !== null) figure.position.y = seatY + 0.10 - hips;
    } else {
      const toe = lowestBoneY(figure, TOES);
      if (Number.isFinite(toe)) figure.position.y = bindToeY * scale - toe;
    }
    figure.updateMatrixWorld(true);
    return figure;
  };

  const AWAY = Math.PI; // yaw = atan2(dir.x, dir.z); (0,0,-1) → π, i.e. down-street

  // D3 — THE NEAR FIELD. §8 asked for the nearest figure at ~8 m; the reference's
  // nearest is at ~3.5 m and fills 54% of frame height against this build's 20%.
  // §8 was wrong and it cost the frame its foreground anchor, so the two lead
  // figures are placed by solving the hero camera rather than by following it.
  //
  // Hero shot (scene.js SHOTS.hero): eye (0.6, 1.6, 9), target (-0.4, 1.35, -14),
  // fov 52 vertical, 16:9. A 1.75 m figure subtends H / (2 d tan26°) of frame
  // height, so ~50% lands at d ≈ 3.5 m — i.e. z ≈ 5.5 with the eye at z = 9.
  // Horizontally they straddle the vanishing axis (which lands at x ≈ 51% of
  // frame) rather than sitting on it: NEAR_LEAD reads at x ≈ 36-44% and
  // NEAR_WING at x ≈ 55-62%, leaving the street, both mid walkers and the far
  // end of the lantern spine visible in the gap between them and past them.
  const placements = [
    {
      clip: 'Walk_Loop', time: 0.42, scale: 1.0,
      x: -0.15, z: 5.6, yaw: AWAY + 0.05, look: FIGURE_LOOKS[0],
    },
    {
      clip: 'Walk_Loop', time: 1.31, scale: 0.96,
      x: 0.99, z: 4.92, yaw: AWAY - 0.12, look: FIGURE_LOOKS[5],
    },
    // The mid ladder. Keeping these is what turns two big near figures into
    // depth rather than into two big near figures: the audit's complaint was
    // that the replica's figure sizes spanned 0.147-0.20 of frame height, no
    // range at all. With the pair above, this set now spans ~0.05 to ~0.52.
    { clip: 'Walk_Loop', time: 0.42, scale: 0.98, x: -0.34, z: 0.9, yaw: AWAY + 0.06, look: FIGURE_LOOKS[1] },
    { clip: 'Walk_Loop', time: 1.05, scale: 0.94, x: 0.52, z: -3.1, yaw: AWAY - 0.09, look: FIGURE_LOOKS[4] },
    { clip: 'Walk_Formal_Loop', time: 0.7, scale: 0.95, x: -1.15, z: -8.4, yaw: AWAY + 0.14, look: FIGURE_LOOKS[3] },
    // D9 — the left table is occupied, and by people who read as people. The
    // reference seats three at its near table; two of them are the brightest
    // non-emissive shapes on that whole side of the frame.
    {
      clip: 'Sitting_Talking_Loop', time: 1.6, scale: 0.97, seated: true, seatY: 0.45,
      x: anchors.tableA.x - 0.78, z: anchors.tableA.z + 1.15, yaw: Math.PI / 2 - 0.15, look: FIGURE_LOOKS[2],
    },
    {
      clip: 'Sitting_Talking_Loop', time: 3.1, scale: 0.96, seated: true, seatY: 0.45,
      x: anchors.tableA.x + 0.78, z: anchors.tableA.z + 0.15, yaw: -Math.PI / 2 + 0.12, look: FIGURE_LOOKS[0],
    },
    // The near-left anchor. On the street-side bench at the very near end of the
    // lengthened tableA — about 2.9 m from the hero eye, so it reads from y≈58%
    // of frame to the bottom edge at x≈16%, which is where the reference puts
    // its own seen-from-behind diner. This square is the frame's largest single
    // value deficit (ref L 106 vs 27) and a lit person is what fills it.
    {
      clip: 'Sitting_Idle_Loop', time: 0.8, scale: 1.0, seated: true, seatY: 0.45,
      x: anchors.tableA.x + 0.78, z: anchors.tableA.z + 2.2, yaw: -Math.PI / 2 - 0.22, look: FIGURE_LOOKS[2],
    },
    // (A sixth diner sat at tableA.z + 2.55 on the FAR bench and projected to
    // x = -0.21 — entirely off the left edge. Measured, not guessed: that is what
    // reportFigureHeights is for.)
    {
      clip: 'Sitting_Talking_Loop', time: 2.05, scale: 0.97, seated: true, seatY: 0.45,
      x: anchors.tableA.x - 0.78, z: anchors.tableA.z - 1.05, yaw: Math.PI / 2 - 0.28, look: FIGURE_LOOKS[1],
    },
    {
      clip: 'Sitting_Idle_Loop', time: 1.15, scale: 0.98, seated: true, seatY: 0.45,
      x: anchors.tableB.x - 0.78, z: anchors.tableB.z + 0.6, yaw: Math.PI / 2 + 0.2, look: FIGURE_LOOKS[5],
    },
  ];

  const placed = placements.map(spawn);
  void random;
  return { placed: placements.length, figures: placed };
}

// ---------------------------------------------------------------------------

export async function build(ctx) {
  const { scene, MARKET, rng, emissives } = ctx;
  const random = rng(20_260_816);

  const root = new THREE.Group();
  root.name = 'dressing';
  scene.add(root);

  const LEFT = MARKET.frontageLeft; // -3.8

  // --- anchors -------------------------------------------------------------
  // Clustered, not distributed: the seating pair sits together under its own
  // umbrellas; the kegs and crates pile against the left edge; the truck parks
  // behind them. That is how a real street fills up.
  const anchors = {
    // D9. Block-by-block against the reference, the worst square in the frame is
    // the near-left corner (x 0-17%, y 67-100%): reference mean L 106 and density
    // 5.5, this build 27 and 2.7. The reference fills it with the NEAR CORNER of
    // the communal table and a man sitting at it about 3 m from the lens. So
    // tableA is no longer a 3.4 m table parked at 6 m — it is a 5.6 m run whose
    // near end comes to z = 6.5, i.e. 2.5 m from the hero eye, and it carries
    // seated figures at that end. The near field is not only the street's.
    tableA: { x: LEFT + 1.6, z: 3.7 },   // -2.20 — near enough that the hero
    // tableB slid from z -1.6 to -3.5 to open 1.6 m of clear ground between the
    // two table runs. That gap is where the barrel wall goes, and the barrel wall
    // is the single largest pale mass the reference has in the mid-left third.
    tableB: { x: LEFT + 1.2, z: -2.0 },  // -2.60   camera reads faces at the table
    // The plaza's clear ground runs z -3.3 … +5 (the truck owns everything past
    // that), so the three left masses are slotted along it rather than piled:
    // tableA near, barrels between, tableB behind.
    barrels: { x: LEFT + 0.88, z: 0.15 },
    kegs: { x: LEFT - 0.75, z: 3.6 },
    // Back at z -9.4, which is where the reference frames it. It had been walked
    // forward to -5.8 to escape two things that have since moved: lighting.js's
    // fog (0.017 warm, now 0.0125 neutral) and the steam plume, which used to sit
    // down-street and now sits in the lower-left foreground at z +0.9…+4.4 and at
    // ~40% of its former opacity. Neither is in front of -9.4 any more.
    truck: { x: LEFT + 1.85, z: -9.4 },
  };

  // --- §5 umbrellas + communal tables --------------------------------------
  const umbrellaA = buildUmbrella(random, emissives, { radius: 1.52, rimY: 2.12, apexY: 2.84 });
  umbrellaA.position.set(anchors.tableA.x, 0, anchors.tableA.z);
  umbrellaA.rotation.y = 0.22;
  root.add(umbrellaA);

  const umbrellaB = buildUmbrella(random, emissives, { radius: 1.44, rimY: 2.2, apexY: 2.9 });
  umbrellaB.position.set(anchors.tableB.x, 0, anchors.tableB.z);
  umbrellaB.rotation.y = -0.35;
  root.add(umbrellaB);

  // A low festoon along the plaza edge, at 2.35 m — well under lanterns.js's
  // rows at MARKET.lanternRowY (4.7) and at a fifth of a chochin's size, so it
  // never competes with §4's spine. It exists because the left half of the
  // frame otherwise has no light source of its own at all, and the reference's
  // left is unmistakably a lit, occupied corner.
  const festoon = new THREE.Group();
  const bulbGeo = new THREE.SphereGeometry(0.055, 10, 8);
  // Two strands, not one, at different heights and set-backs. The reference's
  // seating carries a criss-cross of string lights, and each bulb is both a small
  // warm accent and — for the density metric — a hard little edge in the frame's
  // smoothest third.
  const strands = [
    { x: LEFT + 0.55, y: 2.42, z0: 5.6, span: 12.4, bulbs: 13, tint: 0xffc98d },
    { x: LEFT + 1.95, y: 2.66, z0: 6.4, span: 11.0, bulbs: 11, tint: 0xffd2a0 },
  ];
  for (const strand of strands) {
    const sag = (t) => strand.y - 0.2 * Math.sin(Math.PI * t); // shallow catenary
    const cordPts = [];
    for (let i = 0; i <= strand.bulbs; i += 1) {
      const t = i / strand.bulbs;
      cordPts.push(new THREE.Vector3(strand.x, sag(t), strand.z0 - strand.span * t));
    }
    festoon.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(cordPts),
      new THREE.LineBasicMaterial({ color: 0x1a1714, fog: false }),
    ));
    for (let i = 1; i < strand.bulbs; i += 1) {
      const t = i / strand.bulbs;
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshStandardMaterial({
        color: 0x5a4526, emissive: new THREE.Color(strand.tint), emissiveIntensity: 2.2, roughness: 1,
      }));
      bulb.position.set(strand.x, sag(t) - 0.11, strand.z0 - strand.span * t);
      festoon.add(bulb);
      emissives.add(bulb, { color: strand.tint, intensity: 2.2, kind: 'bulb' });
    }
  }
  root.add(festoon);

  const tableA = buildCommunalTable(random, { length: 5.6 });
  tableA.position.set(anchors.tableA.x, 0, anchors.tableA.z);
  tableA.rotation.y = 0.06;
  root.add(tableA);

  const tableB = buildCommunalTable(random, { length: 2.4 });
  tableB.position.set(anchors.tableB.x, 0, anchors.tableB.z);
  tableB.rotation.y = -0.05;
  root.add(tableB);

  // --- §5 stacked kegs -----------------------------------------------------
  // D9. Two masses, doing two different jobs. The barrel WALL stands inside the
  // plaza between the tables, four high with its banded ends to camera — that is
  // the reference's pale mid-left silhouette and it lands at x ≈ 31%, y 43-66%
  // of frame. The original low pyramid keeps its §5 role but moves outside the
  // railing, rotated so its run goes down-street instead of across it, where it
  // shows above street.js's boundary wall the way the reference's barrels show
  // above its fence.
  const barrels = buildBarrelWall(random, { cols: 2, rows: 4, R: 0.32, L: 0.9 });
  barrels.position.set(anchors.barrels.x, 0, anchors.barrels.z);
  barrels.rotation.y = 0.07;
  root.add(barrels);

  const kegs = buildKegStack(random);
  kegs.position.set(anchors.kegs.x, 0, anchors.kegs.z);
  kegs.rotation.y = Math.PI / 2 + 0.12;
  root.add(kegs);

  // --- §5 food truck -------------------------------------------------------
  const truck = buildFoodTruck(random, emissives);
  truck.position.set(anchors.truck.x, 0, anchors.truck.z);
  truck.rotation.y = -0.11;
  root.add(truck);

  // Furled amber umbrellas. The reference has exactly this: a tall saturated
  // yellow vertical standing among the seating, and it is the one strong warm
  // accent on that side of the frame — the mid-left otherwise runs entirely
  // cream, timber and green. One at the truck, one among the tables.
  const furled = buildFurledUmbrella(random);
  furled.position.set(anchors.truck.x + 1.35, 0, anchors.truck.z + 2.5);
  furled.rotation.y = 0.5;
  root.add(furled);

  const furledNear = buildFurledUmbrella(random);
  furledNear.position.set(LEFT + 0.62, 0, 1.15);
  furledNear.rotation.y = -0.4;
  furledNear.rotation.z = -0.07;
  root.add(furledNear);

  // --- §5 dark tree mass ---------------------------------------------------
  // Beyond the left frontage line and tall, so it fills the upper-left the way
  // the reference does. Canopies reach no further right than ≈ -2.6, which
  // keeps lanterns.js's left row at x = -2.1 clear of them.
  const treesNear = buildTreeMass(random, { canopies: 5, baseY: 4.0 });
  treesNear.position.set(LEFT - 0.6, 0, -5.4);
  root.add(treesNear);
  const treesFar = buildTreeMass(random, { canopies: 6, baseY: 3.6, spread: 1.2 });
  treesFar.position.set(LEFT - 1.5, 0, -11.0);
  treesFar.scale.setScalar(1.15);
  root.add(treesFar);
  // A near mass at the extreme left, to carry dark into the frame corner.
  const treesCorner = buildTreeMass(random, { canopies: 3, baseY: 4.4 });
  treesCorner.position.set(LEFT - 1.6, 0, 0.6);
  root.add(treesCorner);

  // --- §5 green railing ----------------------------------------------------
  // Just inboard of street.js's left frontage line, running the length of the
  // seating as the plaza edge. At LEFT - 0.35 it sat BEHIND that wall and was
  // never once visible in frame.
  // At LEFT + 0.35 the railing fouled the barrel wall; LEFT + 0.15 is the last
  // line clear of street.js's boundary wall (its inner face is at -3.825).
  const railing = buildRailing({ length: 13.0, height: 1.02 });
  railing.position.set(LEFT + 0.15, 0, 1.5);
  root.add(railing);

  // D9 — the hedge behind the railing. The audit's finding was that the left is
  // "a black void" behind the umbrellas; §5's unlit tree mass only ever filled
  // the UPPER left, so the band between the railing top and the tree canopies
  // was genuinely empty. This is a standard-material foliage row at L≈25-32,
  // sitting just outside street.js's boundary wall, and it is what turns that
  // band from a hole into a dark green.
  const hedge = buildHedge(random, { length: 15, height: 1.42, z0: 1.0 });
  hedge.position.set(LEFT - 0.62, 0, 0);
  hedge.scale.set(0.7, 1, 1);
  root.add(hedge);
  const hedgeFar = buildHedge(random, { length: 9, height: 1.3, z0: -9.5 });
  hedgeFar.position.set(LEFT - 0.7, 0, 0);
  hedgeFar.scale.set(0.7, 1, 1);
  root.add(hedgeFar);

  // --- clustered small dressing -------------------------------------------
  // Crates against the keg stack and the truck; a bin at the kerb edge.
  const crateSpots = [
    { x: anchors.barrels.x + 0.95, z: anchors.barrels.z - 0.7, stack: 2, color: C.crateTimber },
    { x: anchors.barrels.x + 1.32, z: anchors.barrels.z - 0.95, stack: 1, color: C.crateBlue },
    { x: anchors.truck.x + 1.25, z: anchors.truck.z - 1.3, stack: 3, color: C.crateTimber },
    { x: anchors.truck.x + 1.05, z: anchors.truck.z - 0.55, stack: 2, color: C.crateBlue },
  ];
  for (const spot of crateSpots) {
    for (let i = 0; i < spot.stack; i += 1) {
      const crate = buildCrate(random, { color: spot.color });
      crate.position.set(spot.x + (random() - 0.5) * 0.06, i * 0.33, spot.z + (random() - 0.5) * 0.06);
      root.add(crate);
    }
  }

  const bin = buildBin();
  bin.position.set(LEFT + 0.3, 0, 7.3); // clear of the lengthened tableA far bench
  root.add(bin);

  // D9 — more seating, loose and stacked. "Genuinely busy rather than sparsely
  // set" is mostly a count problem: five stools around the tables plus a stack
  // of four nobody put away reads as a plaza that has been used all evening.
  const stoolSpots = [
    [anchors.tableA.x + 1.18, anchors.tableA.z - 1.65],
    [anchors.tableA.x + 1.62, anchors.tableA.z - 1.05],
    [anchors.tableA.x + 1.3, anchors.tableA.z + 1.9],
    [anchors.tableB.x + 1.25, anchors.tableB.z + 0.9],
    [anchors.tableB.x + 1.05, anchors.tableB.z - 1.0],
  ];
  for (const [sx, sz] of stoolSpots) {
    const stool = buildStool(random);
    stool.position.set(sx, 0, sz);
    root.add(stool);
  }
  // The stack: four seats up, leaning very slightly, against the railing.
  const stoolStack = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const stool = buildStool(random);
    stool.position.set((random() - 0.5) * 0.03, i * 0.13, (random() - 0.5) * 0.03);
    stoolStack.add(stool);
  }
  stoolStack.position.set(LEFT + 0.35, 0, 2.15);
  stoolStack.rotation.z = 0.02;
  root.add(stoolStack);

  // Stacked plastic tubs and a produce basket at the plaza edge — the reference
  // carries this kind of working clutter right through the seating, not only at
  // the stall end of it.
  const tubColors = [0x2f5a63, 0x8d4a30, 0x2f5a63, 0x6e6a58];
  for (let i = 0; i < 4; i += 1) {
    put(root, new THREE.BoxGeometry(0.46, 0.19, 0.34), stdMat(tubColors[i], { roughness: 0.55 }),
      { x: LEFT + 0.3 + (random() - 0.5) * 0.05, y: 0.1 + i * 0.19, z: 6.9, ry: 0.12 + i * 0.04 });
  }
  const basket = new THREE.Group();
  put(basket, new THREE.CylinderGeometry(0.28, 0.22, 0.26, 12, 1, true),
    stdMat(C.basketTan, { roughness: 0.88, side: THREE.DoubleSide }), { y: 0.13 });
  put(basket, new THREE.SphereGeometry(0.24, 10, 7), stdMat(C.foodPale, { roughness: 0.8 }),
    { y: 0.24, cast: false });
  basket.position.set(LEFT + 1.05, 0, -0.95);
  basket.rotation.y = 0.4;
  root.add(basket);

  // The near-left floor. Block-for-block this is the frame's weakest square for
  // detail (density 2.7 against the reference's 6.4) and it is bare paving in
  // every capture so far, so it gets the things that end up under a busy table:
  // a crate of empties, a folded stack of trays, a dropped carrier bag.
  const emptiesCrate = buildCrate(random, { w: 0.56, h: 0.34, d: 0.42, color: C.crateTimber });
  emptiesCrate.position.set(anchors.tableA.x + 1.32, 0, anchors.tableA.z + 2.05);
  root.add(emptiesCrate);
  const emptyBottle = stdMat(0x4a6030, { roughness: 0.25, metalness: 0.1 });
  for (let i = 0; i < 6; i += 1) {
    put(root, new THREE.CylinderGeometry(0.036, 0.036, 0.24, 8), emptyBottle, {
      x: anchors.tableA.x + 1.32 - 0.16 + (i % 3) * 0.16,
      y: 0.12,
      z: anchors.tableA.z + 2.05 - 0.08 + Math.floor(i / 3) * 0.16,
    });
  }
  for (let i = 0; i < 5; i += 1) {
    put(root, new THREE.BoxGeometry(0.38, 0.022, 0.28), stdMat(i % 2 ? C.trayAmber : C.trayRed, { roughness: 0.7 }), {
      x: anchors.tableA.x + 1.02, y: 0.02 + i * 0.026, z: anchors.tableA.z + 2.75, ry: 0.3 + i * 0.05,
    });
  }

  // A galvanised bucket and a coiled hose by the railing. Two more silhouettes
  // in the band the audit measured as empty.
  put(root, new THREE.CylinderGeometry(0.17, 0.14, 0.3, 12, 1, true),
    stdMat(0x8a8b86, { roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }),
    { x: LEFT + 0.5, y: 0.15, z: -1.5 });
  put(root, new THREE.TorusGeometry(0.22, 0.045, 6, 16), stdMat(0x394038, { roughness: 0.75 }),
    { x: LEFT + 0.45, y: 0.05, z: 0.9, rx: Math.PI / 2 });

  // --- the occupancy tell --------------------------------------------------
  // Furniture alone reads as a showroom. Bags dumped under the table, a coat
  // over the bench end and bottles left standing are what say "people are here
  // now" — and they cost almost nothing.
  const bagMat = stdMat(0x2f2a2e, { roughness: 0.85 });
  const bagSpots = [
    { x: anchors.tableA.x + 0.9, z: anchors.tableA.z + 1.5, s: 1.0 },
    { x: anchors.tableA.x - 0.95, z: anchors.tableA.z - 0.9, s: 0.85 },
    { x: anchors.tableB.x + 0.85, z: anchors.tableB.z + 0.4, s: 0.9 },
  ];
  for (const spot of bagSpots) {
    const bag = new THREE.Group();
    put(bag, new THREE.BoxGeometry(0.36, 0.3, 0.2), bagMat, { y: 0.15 });
    put(bag, new THREE.TorusGeometry(0.11, 0.018, 5, 10), bagMat, { y: 0.31, rx: 0.2 });
    bag.position.set(spot.x, 0, spot.z);
    bag.rotation.y = random() * 2;
    bag.scale.setScalar(spot.s);
    root.add(bag);
  }
  // A coat slung over the near bench end.
  const coat = new THREE.Group();
  put(coat, new THREE.BoxGeometry(0.3, 0.05, 0.44), stdMat(0x4a3b46, { roughness: 0.9 }), { y: 0.475 });
  put(coat, new THREE.BoxGeometry(0.26, 0.26, 0.4), stdMat(0x4a3b46, { roughness: 0.9 }), { y: 0.34, z: 0.02 });
  coat.position.set(anchors.tableA.x + 0.78, 0, anchors.tableA.z - 1.35);
  coat.rotation.y = 0.15;
  root.add(coat);

  // Standing bottles and a cup left on both tables.
  const bottleMat = stdMat(0x3f5a2c, { roughness: 0.22, metalness: 0.1 });
  for (const [tx, tz, n] of [[anchors.tableA.x, anchors.tableA.z, 3], [anchors.tableB.x, anchors.tableB.z, 2]]) {
    for (let i = 0; i < n; i += 1) {
      const b = new THREE.Group();
      put(b, new THREE.CylinderGeometry(0.037, 0.037, 0.2, 10), bottleMat, { y: 0.1 });
      put(b, new THREE.CylinderGeometry(0.014, 0.035, 0.08, 10), bottleMat, { y: 0.24 });
      put(b, new THREE.CylinderGeometry(0.015, 0.015, 0.07, 8), bottleMat, { y: 0.31 });
      b.position.set(tx + (random() - 0.5) * 0.55, 0.77, tz - 1.1 + random() * 2.2);
      root.add(b);
    }
  }

  // A cooler and a chalkboard by the truck's counter — the working end.
  const cooler = new THREE.Group();
  put(cooler, new THREE.BoxGeometry(0.78, 0.44, 0.52), stdMat(C.crateBlue, { roughness: 0.6 }), { y: 0.22 });
  put(cooler, new THREE.BoxGeometry(0.8, 0.06, 0.54), stdMat(0xd8d2c4, { roughness: 0.6 }), { y: 0.47 });
  cooler.position.set(anchors.truck.x + 1.5, 0, anchors.truck.z + 1.6);
  cooler.rotation.y = -0.3;
  root.add(cooler);

  // A freestanding vertical banner at the truck's near corner. The reference's
  // mid-left carries exactly this: a tall dark panel of pale marks that reads
  // as a hard vertical against the umbrellas' horizontals. Original marks, §0.
  const standBanner = new THREE.Group();
  const standTex = glyphStripTexture(random, { bg: '#17130f', fg: '#efe4cb', rows: 6, width: 96, height: 460 });
  put(standBanner, new THREE.CylinderGeometry(0.035, 0.04, 2.6, 8), stdMat(C.metalDark), { y: 1.3 });
  put(standBanner, new THREE.CylinderGeometry(0.22, 0.26, 0.08, 10), stdMat(C.metalDark), { y: 0.04 });
  const bannerMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 1.95),
    new THREE.MeshStandardMaterial({ map: standTex, roughness: 0.9, side: THREE.DoubleSide }),
  );
  bannerMesh.position.set(0.25, 1.42, 0);
  bannerMesh.castShadow = false;
  standBanner.add(bannerMesh);
  standBanner.position.set(anchors.truck.x + 0.55, 0, anchors.truck.z + 2.6);
  standBanner.rotation.y = -0.28;
  root.add(standBanner);

  const board = new THREE.Group();
  const boardTex = glyphStripTexture(random, { bg: '#1b1a17', fg: '#e8cf8a', rows: 4, width: 128, height: 200 });
  put(board, new THREE.BoxGeometry(0.62, 0.9, 0.04),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 }), { y: 0.62, rx: -0.12 });
  put(board, new THREE.BoxGeometry(0.06, 0.72, 0.05), stdMat(C.tableFrame), { x: -0.3, y: 0.36, z: 0.14, rx: 0.2 });
  put(board, new THREE.BoxGeometry(0.06, 0.72, 0.05), stdMat(C.tableFrame), { x: 0.3, y: 0.36, z: 0.14, rx: 0.2 });
  board.position.set(anchors.truck.x + 1.75, 0, anchors.truck.z + 2.9);
  board.rotation.y = 1.25;
  root.add(board);

  // --- §2 ground litter ----------------------------------------------------
  root.add(buildLitter(random));

  // --- §8 figures ----------------------------------------------------------
  const figures = await buildFigures(ctx, root, random, anchors);

  // D3 is stated as a NUMBER — nearest figure at 0.54 of frame height in the
  // reference against 0.20 here — so it is measured in-engine rather than eyed
  // off a screenshot. Deferred to the first frame on purpose: main.js applies
  // the shot AFTER buildNightMarket() returns, so at build time the camera is
  // still at the origin with a default fov and every projection would be a lie.
  ctx.updaters ??= [];
  let reported = false;
  ctx.updaters.push(() => {
    if (reported) return;
    reported = true;
    reportFigureHeights(ctx, figures.figures ?? []);
  });

  return { root, figures };
}

/** Project each figure's bounding box and publish its frame-height fraction. */
function reportFigureHeights(ctx, figures) {
  const { camera, scene } = ctx;
  if (!camera || !figures.length) return;
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const rows = [];
  for (const figure of figures) {
    box.setFromObject(figure);
    if (box.isEmpty()) continue;
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < 8; i += 1) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      v.project(camera);
      const sy = 0.5 - v.y * 0.5;
      const sx = 0.5 + v.x * 0.5;
      top = Math.min(top, sy);
      bottom = Math.max(bottom, sy);
      left = Math.min(left, sx);
      right = Math.max(right, sx);
    }
    rows.push({
      h: Number((bottom - top).toFixed(3)),
      x: Number(((left + right) / 2).toFixed(3)),
      top: Number(top.toFixed(3)),
      bottom: Number(bottom.toFixed(3)),
    });
  }
  rows.sort((a, b) => b.h - a.h);
  const probe = { nearestFrameHeight: rows[0]?.h ?? 0, figures: rows };
  globalThis.__dressingProbe = probe;
  console.info('[night-market/dressing] figure frame heights', probe);
}
