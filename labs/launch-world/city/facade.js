// Facade construction for Nova Promenade — the elements that separate a
// building from an extruded box.
//
// WHY THIS EXISTS
//   `buildinggen` builds a genuinely constructed VILLAGE house: leaning wall
//   pairs, a base course, a bay grid, framed windows with sills, a door with a
//   threshold, an overhanging roof with a modeled underside. What it has no
//   vocabulary for is everything that makes a CITY building read at 40-200 m:
//
//     - a parapet, so the roofline is not a bare slab edge
//     - a cornice / setback band, so the mass has a horizontal order
//     - a ground-floor retail plinth with real recess depth and a projecting
//       canopy, which is the single strongest "this is a street" cue
//     - a modeled entrance with a portal, steps and a canopy
//     - balconies, which break the facade plane and cast the small hard
//       shadows the eye reads as human scale
//     - roof plant — tanks, plant rooms, a lift overrun, an aerial mast —
//       which is what stops every roofline in a skyline being a flat line
//     - window reveals with interior depth behind the glass
//     - curtain-wall fins and spandrel bands
//
//   None of that is expressible through `createBuildingSettings`, and none of
//   it can be faked with a texture without tripping §2 ("fake windows with no
//   recess, frame, glass thickness, or interior depth") and §13 ("flat shop
//   image on a plane"). So it is modeled, registered as FILL-011, and written
//   against the resolved PLAN — every element derives from the grammar's own
//   walls, floors, bays and rects, so when this merges into `buildinggen` it
//   merges as elements of the mesher, not as a bolt-on.
//
// DETAIL LEVELS
//   'full' near/mid  — everything, including window reveals and balconies
//   'mid'  far       — no reveals, no balconies; plinth, cornice, parapet,
//                      entrance, fins, spandrels, roof plant
//   'far'  distant   — parapet, cornice, roof plant only (silhouette work)

import * as THREE from 'three';

import { lerp } from './parts.js';

// ---------------------------------------------------------------------------
// Wall geometry helpers — mirrors `buildingMesh.js` insetWalls exactly so
// elements land on the wall planes the mesher actually built.
// ---------------------------------------------------------------------------

function insetWalls(walls, inset) {
  if (inset <= 0) return walls;
  const count = walls.length;
  const points = walls.map((wall) => [wall.ax, wall.az]);
  const moved = points.map((point, index) => {
    const prev = walls[(index + count - 1) % count];
    const next = walls[index];
    return [
      point[0] - (prev.nx + next.nx) * inset,
      point[1] - (prev.nz + next.nz) * inset,
    ];
  });
  return walls.map((wall, index) => {
    const a = moved[index];
    const b = moved[(index + 1) % count];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { ...wall, ax: a[0], az: a[1], bx: b[0], bz: b[1], length };
  });
}

/** Point on a wall at parameter u, pushed `out` metres along the outward normal. */
const at = (wall, u, out) => [
  wall.ax + (wall.bx - wall.ax) * u + wall.nx * out,
  wall.az + (wall.bz - wall.az) * u + wall.nz * out,
];

/** Yaw that maps a box's local +X onto the wall's outward normal. */
const yawOf = (wall) => Math.atan2(wall.bx - wall.ax, wall.bz - wall.az);

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

/**
 * Projecting band around a whole floor line: cornice, string course, or the
 * coping under a parapet. `project` is how far it reaches past the wall face.
 */
function bandAround(parts, walls, palette, {
  y, height, project, role = 'trim', shade = 1, colour = null,
}) {
  for (const wall of walls) {
    const yaw = yawOf(wall);
    const [mx, mz] = at(wall, 0.5, project / 2);
    parts.box(role, colour ?? palette.trim, shade,
      project + 0.22, height, wall.length + project * 2,
      [mx, y + height / 2, mz], [0, yaw, 0]);
  }
}

/**
 * Parapet: the wall carried above the roof line with a coping cap. This is
 * the element that most changes a skyline — without it every mass ends in a
 * bare slab edge and reads as an extrusion.
 *
 * Styles: 'solid' (plain upstand), 'stepped' (taller piers at the corners and
 * at bay thirds), 'railed' (low upstand + posts + a top rail).
 */
function parapet(parts, walls, palette, { baseY, height, style, random }) {
  const thickness = 0.34;
  for (const wall of walls) {
    const yaw = yawOf(wall);
    const [mx, mz] = at(wall, 0.5, 0);
    if (style === 'railed') {
      const upstand = height * 0.42;
      parts.box('trim', palette.trim, 0.94, thickness, upstand, wall.length,
        [mx, baseY + upstand / 2, mz], [0, yaw, 0]);
      const postCount = Math.max(2, Math.round(wall.length / 1.9));
      for (let index = 0; index <= postCount; index += 1) {
        const [px, pz] = at(wall, index / postCount, 0);
        parts.box('beam', palette.beam, 0.9, 0.1, height - upstand, 0.1,
          [px, baseY + upstand + (height - upstand) / 2, pz], [0, yaw, 0]);
      }
      parts.box('beam', palette.beam, 0.96, 0.14, 0.1, wall.length,
        [mx, baseY + height, mz], [0, yaw, 0]);
      continue;
    }
    parts.box('wall', palette.wall, 0.97, thickness, height, wall.length,
      [mx, baseY + height / 2, mz], [0, yaw, 0]);
    if (style === 'stepped') {
      const piers = Math.max(2, Math.round(wall.length / 6.5));
      for (let index = 0; index <= piers; index += 1) {
        const [px, pz] = at(wall, index / piers, 0.04);
        const extra = 0.35 + random() * 0.3;
        parts.box('wall', palette.wall, 1, thickness + 0.16, height + extra, 0.9,
          [px, baseY + (height + extra) / 2, pz], [0, yaw, 0]);
      }
    }
    // coping cap — a hard bright line at the top of every mass
    parts.box('trim', palette.trim, 1.06, thickness + 0.2, 0.12, wall.length + 0.2,
      [mx, baseY + height + 0.06, mz], [0, yaw, 0]);
  }
}

/**
 * Ground-floor retail plinth with genuine recess depth.
 *
 * Built as: solid piers between shop bays, a shopfront glazing plane set back
 * `recess` metres inside them, a dark interior box behind that glazing so the
 * recess reads as a room rather than a painted panel, mullions on the glazing
 * line, a projecting fascia band above, and a canopy that throws a hard
 * horizontal shadow across the pavement.
 */
function retailPlinth(parts, walls, palette, {
  bandTop, recess, canopy, random, warmInterior, accent,
}) {
  const pierWidth = 0.85;
  const sill = 0.42;
  for (const wall of walls) {
    if (wall.length < 4) continue;
    const yaw = yawOf(wall);
    const bays = Math.max(1, Math.round(wall.length / lerp(4.2, 6.4, random())));
    for (let index = 0; index < bays; index += 1) {
      const u0 = index / bays;
      const u1 = (index + 1) / bays;
      const bayLength = (u1 - u0) * wall.length;
      const openWidth = Math.max(bayLength - pierWidth, 1.2);

      // pier between shops, standing proud of the facade
      const [px, pz] = at(wall, u0, 0.12);
      parts.box('wall', palette.wall, 0.98, 0.44, bandTop, pierWidth,
        [px, bandTop / 2, pz], [0, yaw, 0]);

      // set-back glazing plane + the interior behind it
      const [gx, gz] = at(wall, (u0 + u1) / 2, -recess);
      parts.box('glass', warmInterior ? palette.glassWarm : palette.glass, 1,
        0.09, bandTop - sill - 0.45, openWidth,
        [gx, sill + (bandTop - sill - 0.45) / 2, gz], [0, yaw, 0]);
      const [ix, iz] = at(wall, (u0 + u1) / 2, -recess - 0.95);
      parts.box('interior', palette.interior, 1,
        1.8, bandTop - sill - 0.5, openWidth - 0.2,
        [ix, sill + (bandTop - sill - 0.5) / 2, iz], [0, yaw, 0]);

      // stall riser below the glass, and the reveal head above it
      const [sx, sz] = at(wall, (u0 + u1) / 2, -recess + 0.02);
      parts.box('trim', palette.trim, 0.92, 0.16, sill, openWidth,
        [sx, sill / 2, sz], [0, yaw, 0]);

      // mullions on the glazing line
      const mullions = Math.max(1, Math.round(openWidth / 1.5));
      for (let m = 1; m < mullions; m += 1) {
        const [mx, mz] = at(wall, u0 + (u1 - u0) * (m / mullions), -recess + 0.04);
        parts.box('beam', palette.beam, 0.9, 0.12, bandTop - sill - 0.45, 0.1,
          [mx, sill + (bandTop - sill - 0.45) / 2, mz], [0, yaw, 0]);
      }

      // shopfront return colour — part of the 5% accent budget
      if (accent && random() < 0.34) {
        const [ax, az] = at(wall, (u0 + u1) / 2, -recess + 0.1);
        parts.box('door', accent, 1, 0.1, 0.34, openWidth - 0.3,
          [ax, bandTop - 0.72, az], [0, yaw, 0]);
      }
    }

    // continuous fascia + canopy over the whole run
    const [fx, fz] = at(wall, 0.5, 0.16);
    parts.box('wall', palette.wall, 1.02, 0.5, 0.72, wall.length,
      [fx, bandTop + 0.36, fz], [0, yaw, 0]);
    if (canopy > 0) {
      const [cx, cz] = at(wall, 0.5, canopy / 2);
      parts.box('trim', palette.trim, 0.86, canopy, 0.14, wall.length - 0.3,
        [cx, bandTop + 0.02, cz], [0, yaw, 0]);
      // canopy brackets
      const brackets = Math.max(2, Math.round(wall.length / 4.5));
      for (let index = 0; index <= brackets; index += 1) {
        const [bx, bz] = at(wall, index / brackets, canopy * 0.45);
        parts.box('beam', palette.beam, 0.85, canopy * 0.9, 0.1, 0.1,
          [bx, bandTop + 0.24, bz], [0, yaw, 0]);
      }
    }
  }
}

/** Projecting entrance: portal frame, canopy slab, and two steps. */
function entrance(parts, plan, walls, palette, { bandTop, accent }) {
  const wall = walls[plan.door.wallIndex];
  if (!wall) return;
  const yaw = yawOf(wall);
  const width = Math.max(plan.door.width + 1.9, 3.2);
  const height = Math.min(bandTop - 0.5, 4.4);
  const [px, pz] = at(wall, plan.door.u, 0.3);
  // portal surround
  parts.box('trim', palette.trim, 1.04, 0.62, height, width,
    [px, height / 2, pz], [0, yaw, 0]);
  // the opening itself, set back inside the surround
  const [ox, oz] = at(wall, plan.door.u, -0.35);
  parts.box('interior', palette.interior, 1, 1.1, height - 0.8, width - 1.1,
    [ox, (height - 0.8) / 2, oz], [0, yaw, 0]);
  const [dx, dz] = at(wall, plan.door.u, 0.02);
  parts.box('glass', palette.glass, 1, 0.09, height - 1.0, width - 1.3,
    [dx, (height - 1.0) / 2 + 0.06, dz], [0, yaw, 0]);
  // canopy
  const [cx, cz] = at(wall, plan.door.u, 1.15);
  parts.box(accent ? 'door' : 'trim', accent ?? palette.trim, 0.9,
    2.3, 0.18, width + 0.8, [cx, height + 0.2, cz], [0, yaw, 0]);
  // steps
  for (let step = 0; step < 2; step += 1) {
    const reach = 0.55 + step * 0.4;
    const [sx, sz] = at(wall, plan.door.u, reach);
    parts.box('trim', palette.trim, 0.94 + step * 0.04,
      0.8 + step * 0.5, 0.16, width + 0.5 + step * 0.5,
      [sx, 0.08 + (1 - step) * 0.16, sz], [0, yaw, 0]);
  }
}

/**
 * Balconies on a share of the upper bays. Slab, two end posts, a top rail and
 * three balusters — enough to read as a rail at 40 m and to break the facade
 * plane with a hard shadow, which is the actual job.
 */
function balconies(parts, plan, palette, { chance, random, floorsFrom, depth }) {
  for (const floor of plan.floors) {
    if (floor.level < floorsFrom) continue;
    const walls = insetWalls(plan.footprint.walls, floor.inset);
    for (const facade of plan.facades) {
      if (facade.floor !== floor.level) continue;
      const wall = walls[facade.wallIndex];
      if (!wall || wall.length < 3) continue;
      const yaw = yawOf(wall);
      for (const bay of facade.bays) {
        if (!bay.window || random() > chance) continue;
        const width = Math.min((bay.u1 - bay.u0) * wall.length - 0.5, 2.6);
        if (width < 1.1) continue;
        const u = (bay.u0 + bay.u1) / 2;
        const y = floor.y0 + 0.1;
        const [sx, sz] = at(wall, u, depth / 2);
        parts.box('trim', palette.trim, 0.98, depth, 0.16, width,
          [sx, y + 0.08, sz], [0, yaw, 0]);
        const railY = y + 0.62;
        const [rx, rz] = at(wall, u, depth - 0.06);
        parts.box('beam', palette.beam, 0.94, 0.09, 0.09, width,
          [rx, railY + 0.36, rz], [0, yaw, 0]);
        parts.box('beam', palette.beam, 0.82, 0.07, 0.72, width,
          [rx, railY, rz], [0, yaw, 0]);
        for (const side of [-0.5, 0.5]) {
          const [ex, ez] = at(wall, u + (side * width) / wall.length, depth / 2);
          parts.box('beam', palette.beam, 0.9, depth, 0.72, 0.09,
            [ex, railY, ez], [0, yaw, 0]);
        }
      }
    }
  }
}

/**
 * Roof plant. Every roofline in a real skyline is broken by tanks, plant
 * rooms, a lift overrun and an aerial; a skyline of clean slabs is the
 * clearest tell of a blockout.
 */
function roofPlant(parts, plan, palette, { topY, random, count }) {
  const rect = plan.footprint.rects[0];
  const spanX = rect.x1 - rect.x0;
  const spanZ = rect.z1 - rect.z0;
  const place = (inset) => [
    rect.x0 + inset + random() * Math.max(spanX - inset * 2, 0.5),
    rect.z0 + inset + random() * Math.max(spanZ - inset * 2, 0.5),
  ];

  // lift overrun / stair head — the tallest element, always present
  const [ox, oz] = place(2.2);
  const overrunH = lerp(2.4, 3.8, random());
  parts.box('wall', palette.wall, 0.96,
    lerp(3.2, 5.2, random()), overrunH, lerp(3, 4.6, random()),
    [ox, topY + overrunH / 2, oz]);
  parts.box('trim', palette.trim, 1.04, 4.2, 0.16, 3.8, [ox, topY + overrunH + 0.08, oz]);

  for (let index = 0; index < count; index += 1) {
    const roll = random();
    const [x, z] = place(1.6);
    if (roll < 0.42) {
      // plant deck / AHU with a louvre face
      const w = lerp(1.8, 3.4, random());
      const h = lerp(1.1, 2.0, random());
      const d = lerp(1.4, 2.6, random());
      parts.box('trim', palette.trim, 0.88, w, h, d, [x, topY + h / 2, z]);
      const louvres = Math.max(2, Math.round(h / 0.28));
      for (let l = 0; l < louvres; l += 1) {
        parts.box('beam', palette.beam, 0.8, 0.06, 0.1, d - 0.2,
          [x + w / 2, topY + 0.18 + l * 0.28, z]);
      }
    } else if (roll < 0.74) {
      // water tank on legs
      const radius = lerp(0.7, 1.25, random());
      const h = lerp(1.4, 2.3, random());
      parts.cylinder('trim', palette.trim, 0.92, radius, radius, h,
        [x, topY + 0.75 + h / 2, z], [0, 0, 0], 10);
      for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) {
        parts.box('beam', palette.beam, 0.78, 0.11, 0.75, 0.11,
          [x + lx * radius, topY + 0.38, z + lz * radius]);
      }
    } else if (roll < 0.88) {
      // vent stack cluster
      for (let v = 0; v < 3; v += 1) {
        const h = lerp(0.9, 1.9, random());
        parts.cylinder('trim', palette.trim, 0.85, 0.16, 0.19, h,
          [x + (v - 1) * 0.55, topY + h / 2, z], [0, 0, 0], 8);
      }
    } else {
      // aerial mast — the thin silhouette breaker against the sky
      const h = lerp(3.5, 7.5, random());
      parts.cylinder('beam', palette.beam, 0.8, 0.07, 0.11, h,
        [x, topY + h / 2, z], [0, 0, 0], 6);
      for (let arm = 0; arm < 3; arm += 1) {
        parts.box('beam', palette.beam, 0.86, 0.9, 0.06, 0.06,
          [x, topY + h * (0.55 + arm * 0.14), z], [0, random() * Math.PI, 0]);
      }
    }
  }
}

/** Window reveals: a dark interior box behind every glazed bay. */
function windowReveals(parts, plan, palette, { maxFloors }) {
  for (const floor of plan.floors) {
    if (floor.level > maxFloors) continue;
    const walls = insetWalls(plan.footprint.walls, floor.inset);
    for (const facade of plan.facades) {
      if (facade.floor !== floor.level) continue;
      const wall = walls[facade.wallIndex];
      if (!wall) continue;
      const yaw = yawOf(wall);
      for (const bay of facade.bays) {
        if (!bay.window) continue;
        const { u, width, y0, height } = bay.window;
        const [x, z] = at(wall, u, -0.42);
        parts.box('interior', palette.interior, 1,
          0.7, height - 0.06, width - 0.06,
          [x, floor.y0 + y0 + height / 2, z], [0, yaw, 0]);
      }
    }
  }
}

/** Vertical curtain-wall fins running the full height of the volume. */
function fins(parts, plan, palette, { spacing, project }) {
  const walls = plan.footprint.walls;
  for (const wall of walls) {
    const yaw = yawOf(wall);
    const count = Math.max(2, Math.round(wall.length / spacing));
    for (let index = 0; index <= count; index += 1) {
      const [x, z] = at(wall, index / count, project / 2);
      parts.box('beam', palette.beam, 0.9, project, plan.wallTop, 0.16,
        [x, plan.wallTop / 2, z], [0, yaw, 0]);
    }
  }
}

/** Horizontal spandrel band at every floor line. */
function spandrels(parts, plan, palette, { project }) {
  for (const floor of plan.floors) {
    const walls = insetWalls(plan.footprint.walls, floor.inset);
    for (const wall of walls) {
      const yaw = yawOf(wall);
      const [x, z] = at(wall, 0.5, project / 2);
      parts.box('beam', palette.beam, 0.84, project + 0.1, 0.42, wall.length,
        [x, floor.y1 - 0.28, z], [0, yaw, 0]);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Adds the city facade construction for one buildinggen volume.
 *
 * @param {CityParts} parts collector (city-local frame is the VOLUME frame)
 * @param {object} plan resolved buildinggen plan
 * @param {object} options
 * @param {'full'|'mid'|'far'} options.detail
 * @param {object} options.palette role colours, already band-graded
 * @param {boolean} options.isPlinth this volume carries the ground floor
 * @param {boolean} options.isTop this volume carries the roofline
 * @param {string} options.character facade character id (see CHARACTER)
 * @param {() => number} options.random seeded stream
 * @param {number[]|null} options.accent 5%-budget accent, or null
 * @param {boolean} options.warmInterior warm shopfront glow
 */
export function decorateVolume(parts, plan, {
  detail,
  palette,
  isPlinth,
  isTop,
  character,
  random,
  accent = null,
  warmInterior = false,
}) {
  const walls = plan.footprint.walls;
  const spec = CHARACTER[character] ?? CHARACTER.commercial;

  // --- base course: a projecting plinth band on every volume that meets the
  //     ground, so the mass lands rather than stopping.
  if (isPlinth) {
    bandAround(parts, walls, palette, { height: 0.5, project: 0.24, shade: 0.9, y: 0 });
  }

  // --- ground-floor retail with real recess depth
  if (isPlinth && spec.plinth && detail !== 'far') {
    retailPlinth(parts, walls, palette, {
      accent,
      bandTop: spec.plinthHeight,
      canopy: detail === 'full' ? spec.canopy : 0,
      random,
      recess: detail === 'full' ? spec.recess : spec.recess * 0.6,
      warmInterior,
    });
    if (detail === 'full') entrance(parts, plan, walls, palette, { accent, bandTop: spec.plinthHeight });
  } else if (isPlinth && detail === 'far') {
    // Far masses still get the horizontal band and the shadow line it throws.
    bandAround(parts, walls, palette, {
      height: 0.55, project: 0.5, shade: 0.8, y: spec.plinthHeight,
    });
  }

  // --- horizontal order: a cornice at the top of the wall, and a string
  //     course partway up, which is what gives a tall mass a readable scale.
  if (spec.cornice) {
    bandAround(parts, walls, palette, {
      height: 0.42, project: spec.corniceProject, shade: 1.05, y: plan.wallTop - 0.52,
    });
  }
  if (spec.stringCourse && plan.floors.length >= 3 && detail !== 'far') {
    const level = plan.floors[Math.max(1, Math.floor(plan.floors.length / 2))];
    bandAround(parts, insetWalls(walls, level.inset), palette, {
      height: 0.26, project: 0.2, shade: 0.94, y: level.y0 - 0.14,
    });
  }

  // --- facade grain
  if (spec.fins && detail !== 'far') {
    fins(parts, plan, palette, { project: 0.3, spacing: spec.finSpacing });
  }
  if (spec.spandrels && detail !== 'far') {
    spandrels(parts, plan, palette, { project: 0.12 });
  }
  if (spec.balconyChance > 0 && detail === 'full') {
    balconies(parts, plan, palette, {
      chance: spec.balconyChance, depth: 1.15, floorsFrom: 1, random,
    });
  }
  if (detail === 'full' && spec.reveals) {
    windowReveals(parts, plan, palette, { maxFloors: 6 });
  }

  // --- roofline: a parapet always, plant on the top volume
  if (isTop) {
    parapet(parts, walls, palette, {
      baseY: plan.wallTop,
      height: spec.parapetHeight,
      random,
      style: spec.parapetStyle,
    });
    roofPlant(parts, plan, palette, {
      count: detail === 'far' ? 2 : spec.plantCount,
      random,
      topY: plan.wallTop + 0.1,
    });
  } else {
    // setback line: a low upstand where the next volume steps in
    parapet(parts, walls, palette, {
      baseY: plan.wallTop, height: 0.75, random, style: 'solid',
    });
  }
}

/**
 * Facade characters. This is the anti-repetition axis the parity analysis
 * asks for and the last pass did not have: two masses can share a height, a
 * footprint and a palette family and still read as different buildings if
 * their CONSTRUCTION differs — one has balconies and a stringcourse, the next
 * has curtain-wall fins and a railed parapet, the third has a deep arcade and
 * a stepped parapet.
 */
export const CHARACTER = Object.freeze({
  // Stone commercial: deep cornice, string course, stepped parapet.
  civicStone: {
    balconyChance: 0, canopy: 1.35, cornice: true, corniceProject: 0.62,
    finSpacing: 0, fins: false, parapetHeight: 1.45, parapetStyle: 'stepped',
    plantCount: 3, plinth: true, plinthHeight: 4.6, recess: 1.15,
    reveals: true, spandrels: false, stringCourse: true,
  },
  // Curtain wall: fins, spandrel bands, railed parapet, minimal plinth.
  curtainTower: {
    balconyChance: 0, canopy: 0.9, cornice: false, corniceProject: 0.3,
    finSpacing: 1.9, fins: true, parapetHeight: 1.1, parapetStyle: 'railed',
    plantCount: 4, plinth: true, plinthHeight: 5.2, recess: 1.4,
    reveals: true, spandrels: true, stringCourse: false,
  },
  // Residential slab: balconies everywhere, shallow plinth, solid parapet.
  residentialSlab: {
    balconyChance: 0.55, canopy: 0.8, cornice: true, corniceProject: 0.34,
    finSpacing: 0, fins: false, parapetHeight: 1.05, parapetStyle: 'solid',
    plantCount: 2, plinth: true, plinthHeight: 3.9, recess: 0.85,
    reveals: true, spandrels: false, stringCourse: false,
  },
  // Mid-rise commercial: canopy-led street, spandrels, plain parapet.
  commercial: {
    balconyChance: 0.14, canopy: 1.6, cornice: true, corniceProject: 0.45,
    finSpacing: 0, fins: false, parapetHeight: 1.2, parapetStyle: 'solid',
    plantCount: 3, plinth: true, plinthHeight: 4.3, recess: 1.05,
    reveals: true, spandrels: true, stringCourse: true,
  },
  // Older low-rise stock: strong cornice, no plinth glazing, pitched above.
  olderStock: {
    balconyChance: 0.38, canopy: 1.15, cornice: true, corniceProject: 0.68,
    finSpacing: 0, fins: false, parapetHeight: 0.7, parapetStyle: 'solid',
    plantCount: 1, plinth: true, plinthHeight: 3.7, recess: 0.95,
    reveals: true, spandrels: false, stringCourse: true,
  },
  // Service / back-of-house: blank plinth, railed parapet, heavy plant.
  utilityBlock: {
    balconyChance: 0, canopy: 0, cornice: false, corniceProject: 0.28,
    finSpacing: 3.4, fins: true, parapetHeight: 1.6, parapetStyle: 'railed',
    plantCount: 5, plinth: false, plinthHeight: 4.8, recess: 0.5,
    reveals: false, spandrels: true, stringCourse: false,
  },
});

export const CHARACTER_IDS = Object.freeze(Object.keys(CHARACTER));

/** Roles this module emits, in addition to buildinggen's five. */
export const EXTRA_ROLES = Object.freeze(['glass', 'interior']);

export { insetWalls, THREE as _three };
