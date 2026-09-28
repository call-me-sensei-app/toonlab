// Nova Promenade street level.
//
// WHY THIS EXISTS
//   The parity analysis measured ~40 street-furniture instances in
//   `01-city-street-vehicles.png` and ~35 in `03`, and reached 8.7% flat
//   lower-two-thirds in `03` through tactile paving, a modeled kerb profile,
//   expansion joints, drains and wear. ToonLab has no city street vocabulary
//   at all: `propgen`'s prop types are `lantern | bench | fence | crateStack |
//   firewood | well | torii | milestone | pier | stoneWall` — a village kit.
//   There is no kerb, no sidewalk, no signal, no signal mast, no bollard, no
//   planter, no drain, no bike rack, no guardrail, no crossing marking, and
//   nothing at all that spans a roadway.
//
//   Registered as FILL-010. Target on merge: a `src/streetgen/` sibling to
//   `villagegen`, with the same "seeded layout -> merged geometry per role"
//   shape, so the merge is a move.
//
// WHAT IT PLACES
//   Kerbs with a real profile, raised sidewalks, tactile paving at every
//   crossing, crossing stripes, a dashed lane line, drains, manholes, lamp
//   posts, cantilevered signal masts with heads and a catenary run spanning
//   the avenue, planters, tree pits with grates, benches, bollards, bike
//   racks, guardrails, waste bins and a shelter.
//
// DETERMINISM
//   Street geometry is authored from centreline constants; only jitter and
//   kit selection are seeded, from one fixed master seed.

import { CityParts, lerp, mulberry32 } from './parts.js';

// ---------------------------------------------------------------------------
// Authored street network — the same voids `massing.js` reserves.
// ---------------------------------------------------------------------------

export const STREETS = Object.freeze({
  // §10.1's 22 m avenue: 14 m carriageway, 4 m footway each side.
  avenue: Object.freeze({
    axis: 'z', at: 0, from: -78, to: 78, halfRoad: 7, footway: 4,
  }),
  cross: Object.freeze({
    axis: 'x', at: 8.5, from: -78, to: 78, halfRoad: 5.5, footway: 3.5,
  }),
});

/** Yua's mark plus a working radius the kit refuses to place inside. */
const YUA = Object.freeze({ x: 0, z: 4, clear: 4.2 });

const SURFACE = Object.freeze({
  asphalt: [0.196, 0.203, 0.222],
  asphaltPatch: [0.238, 0.242, 0.252],
  blockPaving: [0.362, 0.372, 0.378],
  jointDark: [0.238, 0.245, 0.252],
  paving: [0.512, 0.523, 0.531],
  pavingWarm: [0.522, 0.530, 0.540],
  kerb: [0.605, 0.607, 0.598],
  lineWhite: [0.815, 0.818, 0.805],
  tactile: [0.638, 0.612, 0.502],
  metalDark: [0.155, 0.163, 0.175],
  metalMid: [0.318, 0.334, 0.352],
  metalPale: [0.545, 0.562, 0.578],
  timber: [0.372, 0.322, 0.268],
  planterStone: [0.470, 0.480, 0.492],
  soil: [0.128, 0.124, 0.118],
  foliage: [0.238, 0.372, 0.216],
  foliageLight: [0.312, 0.452, 0.252],
  signalRed: [0.712, 0.212, 0.168],
  signalGreen: [0.182, 0.552, 0.352],
  signalAmber: [0.742, 0.588, 0.288],
  accentCoral: [0.688, 0.398, 0.342],
  accentTeal: [0.238, 0.452, 0.452],
  glass: [0.152, 0.196, 0.242],
});

/** Point on a street's centreline, and its lateral offset direction. */
function streetPoint(street, along, lateral) {
  return street.axis === 'z'
    ? [street.at + lateral, along]
    : [along, street.at + lateral];
}

const clearOfYua = (x, z, pad = 0) => (
  Math.hypot(x - YUA.x, z - YUA.z) > YUA.clear + pad
);

// ---------------------------------------------------------------------------
// Kit pieces
// ---------------------------------------------------------------------------

function lampPost(parts, x, z, yaw, { height = 7.4, arm = 1.9 } = {}) {
  parts.box('street', SURFACE.metalMid, 0.85, 0.52, 0.18, 0.52, [x, 0.24, z]);
  parts.cylinder('street', SURFACE.metalDark, 0.95, 0.09, 0.14, height,
    [x, 0.16 + height / 2, z], [0, 0, 0], 8);
  // cantilever arm, angled up toward the carriageway
  const armX = x + Math.sin(yaw) * arm * 0.5;
  const armZ = z + Math.cos(yaw) * arm * 0.5;
  parts.box('street', SURFACE.metalDark, 0.9, arm, 0.11, 0.11,
    [armX, height + 0.02, armZ], [0, yaw + Math.PI / 2, 0]);
  const headX = x + Math.sin(yaw) * arm;
  const headZ = z + Math.cos(yaw) * arm;
  parts.box('street', SURFACE.metalMid, 0.92, 0.62, 0.15, 0.3,
    [headX, height - 0.08, headZ], [0, yaw + Math.PI / 2, 0]);
  parts.box('lamp', SURFACE.lineWhite, 1, 0.5, 0.06, 0.24,
    [headX, height - 0.17, headZ], [0, yaw + Math.PI / 2, 0]);
}

/**
 * Cantilevered signal mast spanning the carriageway: column, mast arm, three
 * vehicle heads with visors, a pedestrian head on the column, and a backing
 * board. `01` spans its roadway twice with exactly this.
 */
function signalMast(parts, x, z, yaw, { reach = 8.4 } = {}) {
  const columnH = 6.2;
  parts.box('street', SURFACE.metalMid, 0.85, 0.66, 0.22, 0.66, [x, 0.28, z]);
  parts.cylinder('street', SURFACE.metalDark, 0.95, 0.11, 0.17, columnH,
    [x, 0.2 + columnH / 2, z], [0, 0, 0], 8);
  const dirX = Math.sin(yaw);
  const dirZ = Math.cos(yaw);
  // arm
  parts.box('street', SURFACE.metalDark, 0.9, reach, 0.14, 0.14,
    [x + dirX * reach / 2, columnH, z + dirZ * reach / 2], [0, yaw + Math.PI / 2, 0]);
  // brace back to the column
  parts.box('street', SURFACE.metalDark, 0.86, reach * 0.42, 0.09, 0.09,
    [x + dirX * reach * 0.21, columnH - 0.75, z + dirZ * reach * 0.21],
    [0, yaw + Math.PI / 2, -0.28]);
  // three vehicle heads along the arm
  for (let index = 0; index < 3; index += 1) {
    const t = 0.42 + index * 0.22;
    const hx = x + dirX * reach * t;
    const hz = z + dirZ * reach * t;
    parts.box('street', SURFACE.metalDark, 0.8, 0.34, 1.02, 0.4,
      [hx, columnH - 0.62, hz], [0, yaw, 0]);
    // backing board
    parts.box('street', SURFACE.lineWhite, 0.92, 0.06, 1.24, 0.62,
      [hx - dirX * 0.2, columnH - 0.62, hz - dirZ * 0.2], [0, yaw, 0]);
    const lenses = [SURFACE.signalRed, SURFACE.signalAmber, SURFACE.signalGreen];
    for (let lens = 0; lens < 3; lens += 1) {
      parts.cylinder(lens === 2 ? 'lamp' : 'street', lenses[lens], 1, 0.11, 0.11, 0.09,
        [hx + dirX * 0.2, columnH - 0.26 - lens * 0.34, hz + dirZ * 0.2],
        [0, 0, Math.PI / 2], 8);
      // visor
      parts.box('street', SURFACE.metalDark, 0.75, 0.14, 0.06, 0.28,
        [hx + dirX * 0.26, columnH - 0.16 - lens * 0.34, hz + dirZ * 0.26], [0, yaw, 0]);
    }
  }
  // pedestrian head on the column
  parts.box('street', SURFACE.metalDark, 0.82, 0.28, 0.62, 0.32,
    [x + dirX * 0.24, 3.1, z + dirZ * 0.24], [0, yaw, 0]);
  parts.cylinder('lamp', SURFACE.signalAmber, 1, 0.08, 0.08, 0.07,
    [x + dirX * 0.4, 3.22, z + dirZ * 0.4], [0, 0, Math.PI / 2], 8);
  // control cabinet at the base
  parts.box('street', SURFACE.metalPale, 0.88, 0.55, 1.1, 0.42,
    [x - dirX * 0.9, 0.55, z - dirZ * 0.9], [0, yaw, 0]);
}

/** Catenary / service cable spanning the carriageway between two points. */
function cableRun(parts, from, to, { sag = 0.9, segments = 8, height }) {
  let prev = null;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = lerp(from[0], to[0], t);
    const z = lerp(from[1], to[1], t);
    const y = height - Math.sin(t * Math.PI) * sag;
    if (prev) {
      const dx = x - prev[0];
      const dy = y - prev[1];
      const dz = z - prev[2];
      const length = Math.hypot(dx, dy, dz);
      parts.box('street', SURFACE.metalDark, 0.7, 0.05, 0.05, length,
        [(prev[0] + x) / 2, (prev[1] + y) / 2, (prev[2] + z) / 2],
        [Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0]);
    }
    prev = [x, y, z];
  }
}

function planter(parts, x, z, yaw, random) {
  const w = lerp(1.6, 2.6, random());
  const d = lerp(0.9, 1.3, random());
  parts.box('street', SURFACE.planterStone, 0.95, w, 0.62, d, [x, 0.31, z], [0, yaw, 0]);
  parts.box('street', SURFACE.planterStone, 1.06, w + 0.14, 0.1, d + 0.14, [x, 0.63, z], [0, yaw, 0]);
  parts.box('street', SURFACE.soil, 1, w - 0.24, 0.1, d - 0.24, [x, 0.6, z], [0, yaw, 0]);
  const clumps = 2 + Math.round(random() * 2);
  for (let index = 0; index < clumps; index += 1) {
    const cw = lerp(0.4, 0.8, random());
    const ch = lerp(0.35, 0.75, random());
    parts.box('foliage', random() < 0.5 ? SURFACE.foliage : SURFACE.foliageLight, 1,
      cw, ch, cw * 0.8,
      [x + (random() - 0.5) * (w - cw), 0.66 + ch / 2, z + (random() - 0.5) * (d - cw * 0.8)],
      [0, random() * Math.PI, 0]);
  }
}

/** Tree pit + cast grate. INTEGRATION: the tree itself is TREE-CITY-01/02. */
function treePit(parts, x, z) {
  parts.box('street', SURFACE.metalDark, 0.85, 1.7, 0.08, 1.7, [x, 0.14, z]);
  for (let index = 0; index < 5; index += 1) {
    parts.box('street', SURFACE.metalMid, 0.9, 1.66, 0.05, 0.11,
      [x, 0.19, z - 0.62 + index * 0.31]);
  }
  parts.box('street', SURFACE.kerb, 1, 2.0, 0.18, 2.0, [x, 0.09, z]);
  parts.box('street', SURFACE.soil, 1, 1.5, 0.06, 1.5, [x, 0.16, z]);
}

function bench(parts, x, z, yaw) {
  for (const side of [-0.62, 0.62]) {
    parts.box('street', SURFACE.metalDark, 0.9, 0.09, 0.42, 0.5,
      [x + Math.cos(yaw) * side, 0.21, z - Math.sin(yaw) * side], [0, yaw, 0]);
  }
  for (let slat = 0; slat < 4; slat += 1) {
    parts.box('street', SURFACE.timber, 1, 1.75, 0.06, 0.12,
      [x, 0.44, z - 0.18 + slat * 0.13], [0, yaw, 0]);
  }
  for (let slat = 0; slat < 3; slat += 1) {
    parts.box('street', SURFACE.timber, 0.94, 1.75, 0.12, 0.06,
      [x - Math.sin(yaw) * 0.2, 0.6 + slat * 0.16, z - Math.cos(yaw) * 0.2], [0, yaw, -0.12]);
  }
}

function bollard(parts, x, z) {
  parts.cylinder('street', SURFACE.metalDark, 0.95, 0.09, 0.11, 0.92, [x, 0.46, z], [0, 0, 0], 8);
  parts.cylinder('street', SURFACE.metalPale, 1.05, 0.1, 0.1, 0.07, [x, 0.9, z], [0, 0, 0], 8);
  parts.cylinder('street', SURFACE.lineWhite, 1.1, 0.112, 0.112, 0.06, [x, 0.72, z], [0, 0, 0], 8);
}

function bikeRack(parts, x, z, yaw, count = 3) {
  for (let index = 0; index < count; index += 1) {
    const offset = (index - (count - 1) / 2) * 0.78;
    const ox = x + Math.cos(yaw) * offset;
    const oz = z - Math.sin(yaw) * offset;
    for (const side of [-0.34, 0.34]) {
      parts.cylinder('street', SURFACE.metalMid, 0.95, 0.045, 0.045, 0.78,
        [ox - Math.sin(yaw) * side, 0.39, oz - Math.cos(yaw) * side], [0, 0, 0], 6);
    }
    parts.box('street', SURFACE.metalMid, 1, 0.06, 0.06, 0.72, [ox, 0.78, oz], [0, yaw + Math.PI / 2, 0]);
  }
}

function wasteBin(parts, x, z, yaw) {
  parts.cylinder('street', SURFACE.metalMid, 0.92, 0.29, 0.24, 0.86, [x, 0.43, z], [0, yaw, 0], 10);
  parts.cylinder('street', SURFACE.metalDark, 0.8, 0.31, 0.31, 0.08, [x, 0.9, z], [0, yaw, 0], 10);
}

function guardrail(parts, points, y = 0.16) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, az] = points[index];
    const [bx, bz] = points[index + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (const railY of [0.62, 1.02]) {
      parts.box('street', SURFACE.metalPale, 0.95, 0.07, 0.09, length,
        [(ax + bx) / 2, y + railY, (az + bz) / 2], [0, yaw, 0]);
    }
    const posts = Math.max(2, Math.round(length / 2.1));
    for (let post = 0; post <= posts; post += 1) {
      const t = post / posts;
      parts.box('street', SURFACE.metalPale, 0.88, 0.09, 1.06, 0.09,
        [lerp(ax, bx, t), y + 0.53, lerp(az, bz, t)], [0, yaw, 0]);
    }
  }
}

function shelter(parts, x, z, yaw) {
  const w = 4.4;
  const d = 1.55;
  for (const side of [-w / 2 + 0.16, w / 2 - 0.16]) {
    for (const back of [-d / 2 + 0.12, d / 2 - 0.12]) {
      parts.box('street', SURFACE.metalDark, 0.9, 0.12, 2.5, 0.12,
        [x + Math.cos(yaw) * side - Math.sin(yaw) * back, 1.25,
          z - Math.sin(yaw) * side - Math.cos(yaw) * back], [0, yaw, 0]);
    }
  }
  parts.box('street', SURFACE.metalMid, 1, w + 0.5, 0.14, d + 0.55, [x, 2.58, z], [0, yaw, 0]);
  parts.box('glass', SURFACE.glass, 1, w - 0.4, 2.1, 0.07,
    [x - Math.sin(yaw) * (d / 2), 1.3, z - Math.cos(yaw) * (d / 2)], [0, yaw, 0]);
  parts.box('street', SURFACE.timber, 1, w - 1.0, 0.07, 0.4, [x, 0.46, z], [0, yaw, 0]);
  parts.box('street', SURFACE.accentTeal, 1, 0.9, 1.5, 0.09,
    [x + Math.cos(yaw) * (w / 2 - 0.1) - Math.sin(yaw) * (d / 2), 1.5,
      z - Math.sin(yaw) * (w / 2 - 0.1) - Math.cos(yaw) * (d / 2)], [0, yaw, 0]);
}

// ---------------------------------------------------------------------------
// Surface work: kerbs, footways, crossings, markings, drainage
// ---------------------------------------------------------------------------

function buildStreetSurface(parts, street, random) {
  const { from, to, halfRoad, footway } = street;
  const length = to - from;

  // Carriageway. Modeled rather than left to the ground plate: asphalt is a
  // specific value and a specific hue family, and the parity metric reads the
  // lower two-thirds of the frame almost entirely off it.
  const mid = (from + to) / 2;
  const [rx, rz] = streetPoint(street, mid, 0);
  parts.box('paving', SURFACE.asphalt, 1,
    street.axis === 'z' ? halfRoad * 2 : length, 0.05, street.axis === 'z' ? length : halfRoad * 2,
    [rx, 0.025, rz]);

  for (const side of [-1, 1]) {
    // footway slab, raised a real kerb height above the carriageway
    const mid = (from + to) / 2;
    const [fx, fz] = streetPoint(street, mid, side * (halfRoad + footway / 2));
    parts.box('paving', side < 0 ? SURFACE.paving : SURFACE.pavingWarm, 1,
      street.axis === 'z' ? footway : length, 0.17, street.axis === 'z' ? length : footway,
      [fx, 0.085, fz]);

    // kerb: face + top chamfer, the profile `03` reads its street off
    const [kx, kz] = streetPoint(street, mid, side * halfRoad);
    parts.box('paving', SURFACE.kerb, 1.04,
      street.axis === 'z' ? 0.32 : length, 0.19, street.axis === 'z' ? length : 0.32,
      [kx, 0.095, kz]);
    parts.box('paving', SURFACE.kerb, 0.86,
      street.axis === 'z' ? 0.1 : length, 0.2, street.axis === 'z' ? length : 0.1,
      [...(street.axis === 'z'
        ? [kx - side * 0.16, 0.1, kz]
        : [kx, 0.1, kz - side * 0.16])]);

    // expansion / paving joints across the footway every ~3 m
    const joints = Math.floor(length / 3);
    for (let index = 1; index < joints; index += 1) {
      const along = from + (length * index) / joints;
      const [jx, jz] = streetPoint(street, along, side * (halfRoad + footway / 2));
      parts.box('paving', SURFACE.kerb, 0.78,
        street.axis === 'z' ? footway - 0.1 : 0.07, 0.02, street.axis === 'z' ? 0.07 : footway - 0.1,
        [jx, 0.175, jz]);
    }

    // drainage gullies at the kerb line
    const drains = Math.floor(length / 26);
    for (let index = 0; index <= drains; index += 1) {
      const along = from + 12 + index * 26;
      if (along > to - 6) continue;
      const [dx, dz] = streetPoint(street, along, side * (halfRoad - 0.35));
      parts.box('paving', SURFACE.metalDark, 0.9,
        street.axis === 'z' ? 0.44 : 0.9, 0.05, street.axis === 'z' ? 0.9 : 0.44,
        [dx, 0.025, dz]);
      for (let bar = 0; bar < 4; bar += 1) {
        parts.box('paving', SURFACE.metalMid, 0.8,
          street.axis === 'z' ? 0.4 : 0.14, 0.03, street.axis === 'z' ? 0.14 : 0.4,
          street.axis === 'z'
            ? [dx, 0.055, dz - 0.34 + bar * 0.22]
            : [dx - 0.34 + bar * 0.22, 0.055, dz]);
      }
    }
  }

  // dashed lane line down the carriageway centre
  const dashes = Math.floor(length / 7);
  for (let index = 0; index < dashes; index += 1) {
    const along = from + 2 + index * 7;
    if (along > to - 3) continue;
    const [lx, lz] = streetPoint(street, along, 0);
    parts.box('paving', SURFACE.lineWhite, 0.86,
      street.axis === 'z' ? 0.16 : 3.4, 0.02, street.axis === 'z' ? 3.4 : 0.16,
      [lx, 0.012, lz]);
  }

  // manhole covers, off-centre in the running lane
  const manholes = Math.floor(length / 34);
  for (let index = 0; index <= manholes; index += 1) {
    const along = from + 18 + index * 34;
    if (along > to - 8) continue;
    const [mx, mz] = streetPoint(street, along, (random() - 0.5) * halfRoad);
    parts.cylinder('paving', SURFACE.metalDark, 0.94, 0.36, 0.36, 0.04, [mx, 0.022, mz], [0, 0, 0], 12);
    parts.cylinder('paving', SURFACE.metalMid, 0.84, 0.29, 0.29, 0.045, [mx, 0.026, mz], [0, 0, 0], 12);
  }
}

/**
 * Paved block ground with expansion joints and tonal modules. Covers the
 * district floor the street network does not; the streets sit 0.05-0.17 m
 * above it, so overlap is harmless and the kerb line still reads.
 */
function blockPaving(parts, random) {
  const AREA = { maxX: 96, maxZ: 64, minX: -96, minZ: -132 };
  const module = 11;
  const cols = Math.ceil((AREA.maxX - AREA.minX) / module);
  const rows = Math.ceil((AREA.maxZ - AREA.minZ) / module);
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x = AREA.minX + col * module + module / 2;
      const z = AREA.minZ + row * module + module / 2;
      const roll = random();
      const tone = roll < 0.18 ? 0.9 : roll < 0.36 ? 1.06 : 1;
      parts.box('paving', SURFACE.blockPaving, tone,
        module - 0.14, 0.04, module - 0.14, [x, 0.02, z]);
    }
  }
  // joint grid
  for (let col = 0; col <= cols; col += 1) {
    const x = AREA.minX + col * module;
    parts.box('paving', SURFACE.jointDark, 0.9, 0.13, 0.03, AREA.maxZ - AREA.minZ,
      [x, 0.03, (AREA.minZ + AREA.maxZ) / 2]);
  }
  for (let row = 0; row <= rows; row += 1) {
    const z = AREA.minZ + row * module;
    parts.box('paving', SURFACE.jointDark, 0.9, AREA.maxX - AREA.minX, 0.03, 0.13,
      [(AREA.minX + AREA.maxX) / 2, 0.03, z]);
  }
}

/** Zebra crossing + tactile paving on both approaches. */
function crossing(parts, street, along) {
  const { halfRoad, footway } = street;
  const stripes = 7;
  for (let index = 0; index < stripes; index += 1) {
    const offset = -halfRoad + 0.8 + (index * (halfRoad * 2 - 1.6)) / (stripes - 1);
    const [sx, sz] = streetPoint(street, along, offset);
    parts.box('paving', SURFACE.lineWhite, 0.9,
      street.axis === 'z' ? 0.52 : 3.0, 0.022, street.axis === 'z' ? 3.0 : 0.52,
      [sx, 0.013, sz]);
  }
  for (const side of [-1, 1]) {
    const [tx, tz] = streetPoint(street, along, side * (halfRoad + 0.7));
    parts.box('paving', SURFACE.tactile, 1,
      street.axis === 'z' ? 1.2 : 3.2, 0.03, street.axis === 'z' ? 3.2 : 1.2,
      [tx, 0.185, tz]);
    // blister studs — the detail `03` scores on
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const dx = street.axis === 'z' ? -0.45 + row * 0.3 : -1.4 + col * 0.4;
        const dz = street.axis === 'z' ? -1.4 + col * 0.4 : -0.45 + row * 0.3;
        parts.box('paving', SURFACE.tactile, 1.12, 0.11, 0.035, 0.11,
          [tx + dx, 0.2, tz + dz]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Builds the whole street level.
 *
 * @param {object} [options]
 * @param {number} [options.seed]
 * @returns {{ geometries: Record<string, import('three').BufferGeometry>,
 *            stats: { instances: number, parts: number } }}
 */
export function buildStreetKit({ seed = 90210 } = {}) {
  const random = mulberry32(seed);
  const parts = new CityParts({ seed: seed ^ 0x5171, variation: 0.055 });
  let instances = 0;

  // --- plaza: the 28 x 22 m public space §10.1 puts Yua in --------------------
  parts.box('paving', SURFACE.paving, 1, 32, 0.14, 26, [0, 0.07, 3]);
  parts.box('paving', SURFACE.paving, 1.03, 28, 0.02, 22, [0, 0.15, 3]);
  for (let index = 1; index < 8; index += 1) {
    parts.box('paving', SURFACE.kerb, 0.8, 27.6, 0.02, 0.08, [0, 0.162, -8 + index * 2.75]);
  }
  for (let index = 1; index < 8; index += 1) {
    parts.box('paving', SURFACE.kerb, 0.8, 0.08, 0.02, 21.6, [-14 + index * 3.5, 0.162, 3]);
  }

  // --- carriageways, footways, kerbs, markings, drainage ---------------------
  buildStreetSurface(parts, STREETS.avenue, random);
  buildStreetSurface(parts, STREETS.cross, random);
  instances += 2;

  // Block paving. The ground between the street walls is not bare earth in a
  // city — it is the paved yard, service apron and side street of the blocks
  // themselves. Left to the base plate it renders as a dark olive void that
  // reads as "unfinished terrain", which is what it looked like. Tiled with
  // joints so it carries information rather than being one flat block.
  blockPaving(parts, random);
  instances += 1;

  // Carriageway wear: patched repairs and a worn-out lane edge. `03` reaches
  // the lowest ground-region emptiness in the benchmark set partly on exactly
  // this, and a clean asphalt plane is a large flat block in the metric.
  for (let index = 0; index < 14; index += 1) {
    const along = -74 + index * 11 + random() * 5;
    const lateral = (random() - 0.5) * 11;
    parts.box('paving', SURFACE.asphaltPatch, 1,
      lerp(1.6, 4.2, random()), 0.012, lerp(2.2, 5.5, random()),
      [lateral, 0.058, along], [0, (random() - 0.5) * 0.2, 0]);
    instances += 1;
  }
  for (const street of [STREETS.cross]) {
    for (let index = 0; index < 10; index += 1) {
      const along = -70 + index * 18 + random() * 6;
      const [px, pz] = streetPoint(street, along, (random() - 0.5) * street.halfRoad * 1.4);
      parts.box('paving', SURFACE.asphaltPatch, 1,
        lerp(2.0, 4.8, random()), 0.012, lerp(1.6, 3.4, random()),
        [px, 0.058, pz], [0, (random() - 0.5) * 0.25, 0]);
      instances += 1;
    }
  }

  // --- crossings at the intersection and at the plaza edge -------------------
  for (const along of [-6, 24]) crossing(parts, STREETS.avenue, along);
  for (const along of [-20, 20]) crossing(parts, STREETS.cross, along);
  instances += 4;

  // --- lamp posts, alternating sides, 24 m spacing ---------------------------
  for (const [street, spacing] of [[STREETS.avenue, 24], [STREETS.cross, 26]]) {
    let flip = 0;
    for (let along = street.from + 14; along < street.to - 10; along += spacing) {
      const side = (flip += 1) % 2 === 0 ? 1 : -1;
      const [x, z] = streetPoint(street, along, side * (street.halfRoad + 1.1));
      if (!clearOfYua(x, z, 2)) continue;
      const yaw = street.axis === 'z'
        ? (side < 0 ? Math.PI / 2 : -Math.PI / 2)
        : (side < 0 ? 0 : Math.PI);
      lampPost(parts, x, z, yaw, { arm: lerp(1.6, 2.2, random()), height: lerp(6.8, 7.8, random()) });
      instances += 1;
    }
  }

  // --- signal masts + catenary at the avenue / cross-street junction ---------
  // `01` spans its roadway twice and hangs cable through the sky gap; this is
  // the §10 "overhead elements: 0" hole the analysis calls out as item #9.
  const junction = STREETS.cross.at;
  signalMast(parts, -STREETS.avenue.halfRoad - 1.2, junction - 9, Math.PI / 2, { reach: 8.8 });
  signalMast(parts, STREETS.avenue.halfRoad + 1.2, junction + 9, -Math.PI / 2, { reach: 8.8 });
  signalMast(parts, STREETS.avenue.halfRoad + 1.2, junction - 26, -Math.PI / 2, { reach: 7.6 });
  instances += 3;
  cableRun(parts,
    [-STREETS.avenue.halfRoad - 1.2, junction - 14],
    [STREETS.avenue.halfRoad + 1.2, junction - 14],
    { height: 6.9, sag: 1.05 });
  cableRun(parts,
    [-STREETS.avenue.halfRoad - 1.2, junction - 40],
    [STREETS.avenue.halfRoad + 1.2, junction - 40],
    { height: 7.2, sag: 1.25 });
  instances += 2;

  // --- planters, tree pits, benches, bins along the footways ----------------
  for (const street of [STREETS.avenue, STREETS.cross]) {
    for (const side of [-1, 1]) {
      const lateral = side * (street.halfRoad + street.footway * 0.55);
      for (let along = street.from + 9; along < street.to - 9; along += lerp(9.5, 13.5, random())) {
        const [x, z] = streetPoint(street, along, lateral);
        if (!clearOfYua(x, z, 1.5)) continue;
        const yaw = street.axis === 'z' ? Math.PI / 2 : 0;
        const roll = random();
        if (roll < 0.3) {
          treePit(parts, x, z);
        } else if (roll < 0.56) {
          planter(parts, x, z, yaw + (random() - 0.5) * 0.3, random);
        } else if (roll < 0.72) {
          bench(parts, x, z, yaw + (random() - 0.5) * 0.25);
        } else if (roll < 0.82) {
          wasteBin(parts, x, z, random() * Math.PI);
        } else if (roll < 0.9) {
          bikeRack(parts, x, z, yaw, 2 + Math.round(random() * 2));
        } else {
          // paired planters
          planter(parts, x, z - 1.4, yaw, random);
          planter(parts, x, z + 1.4, yaw, random);
          instances += 1;
        }
        instances += 1;
      }
    }
  }

  // --- bollard runs guarding the plaza edge ---------------------------------
  for (const side of [-1, 1]) {
    for (let index = 0; index < 9; index += 1) {
      const x = side * (STREETS.avenue.halfRoad + 0.6);
      const z = -8 + index * 2.4;
      if (!clearOfYua(x, z, 1)) continue;
      bollard(parts, x, z);
      instances += 1;
    }
  }
  for (let index = 0; index < 7; index += 1) {
    const x = -7.5 + index * 2.5;
    const z = STREETS.cross.at + STREETS.cross.halfRoad + 0.6;
    if (!clearOfYua(x, z, 1)) continue;
    bollard(parts, x, z);
    instances += 1;
  }

  // --- guardrail runs on the approach ---------------------------------------
  guardrail(parts, [
    [-STREETS.avenue.halfRoad - 0.6, -34],
    [-STREETS.avenue.halfRoad - 0.6, -52],
    [-STREETS.avenue.halfRoad - 0.6, -68],
  ]);
  guardrail(parts, [
    [STREETS.avenue.halfRoad + 0.6, 30],
    [STREETS.avenue.halfRoad + 0.6, 46],
  ]);
  instances += 2;

  // --- one shelter, on the west footway ------------------------------------
  shelter(parts, -(STREETS.avenue.halfRoad + 2.2), -22, Math.PI / 2);
  instances += 1;

  // INTEGRATION: VEH-CITY-01/02 park at the kerb between z = +12 and z = +26
  // on the east side; a third vehicle stands at the signal on the avenue
  // centreline near z = -12. Kerb line is x = +-7, footway top is y = 0.17.
  // INTEGRATION: TREE-CITY-01 x8 drop into the tree pits this kit places
  // (1.5 m soil square, grate at y = 0.19); TREE-CITY-02 x5 at the plaza edge.

  return { geometries: parts.build(), stats: { instances, parts: parts.count } };
}
