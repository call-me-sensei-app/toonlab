// The shape grammar: settings + seed → a PLAN (pure data, no THREE). Every
// stage is deterministic, and the grammar invariants (door reachable and on
// an exterior wall, windows never intersecting beams, roofs always
// overhanging walls) are properties of the plan — which is why the 1000-seed
// invariant suite runs in milliseconds without building any geometry.

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

// Footprint construction: axis-aligned rect union whose perimeter we can
// walk explicitly (general polygon union is overkill for village-grade
// buildings). CCW viewed from above; outward normal of a CCW segment
// (dx, dz) is (dz, -dx).
function buildFootprint({ kind, width, depth, wingRatio }, random) {
  const w = width;
  const d = depth;
  const rects = [{ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2 }];
  let perimeter;
  if (kind === 'L') {
    const ww = Math.max(w * wingRatio, 2);
    const wd = Math.max(d * wingRatio, 2);
    rects.push({ x0: w / 2 - ww, x1: w / 2, z0: d / 2, z1: d / 2 + wd });
    perimeter = [
      [-w / 2, -d / 2], [w / 2, -d / 2],
      [w / 2, d / 2 + wd], [w / 2 - ww, d / 2 + wd],
      [w / 2 - ww, d / 2], [-w / 2, d / 2],
    ];
  } else if (kind === 'T') {
    const ww = Math.max(w * wingRatio * 0.8, 2);
    const wd = Math.max(d * wingRatio, 2);
    const cx = (random() - 0.5) * (w - ww) * 0.4; // wing wanders off-center a bit
    rects.push({ x0: cx - ww / 2, x1: cx + ww / 2, z0: d / 2, z1: d / 2 + wd });
    perimeter = [
      [-w / 2, -d / 2], [w / 2, -d / 2],
      [w / 2, d / 2], [cx + ww / 2, d / 2],
      [cx + ww / 2, d / 2 + wd], [cx - ww / 2, d / 2 + wd],
      [cx - ww / 2, d / 2], [-w / 2, d / 2],
    ];
  } else {
    perimeter = [
      [-w / 2, -d / 2], [w / 2, -d / 2],
      [w / 2, d / 2], [-w / 2, d / 2],
    ];
  }
  const walls = perimeter.map((point, index) => {
    const next = perimeter[(index + 1) % perimeter.length];
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    const length = Math.hypot(dx, dz);
    return {
      ax: point[0],
      az: point[1],
      bx: next[0],
      bz: next[1],
      length,
      nx: dz / (length || 1),
      nz: -dx / (length || 1),
    };
  });
  return { perimeter, rects, walls };
}

// Bay layout along one wall: beam columns at bay edges, windows strictly
// inside bays with a margin — the "windows never intersect beams" invariant
// holds by construction.
function layoutBays(wall, settings, random, { door = null, floor = 0 }) {
  const { facade } = settings;
  const bayCount = Math.max(Math.round(wall.length / facade.bayWidth), 1);
  const bays = [];
  for (let index = 0; index < bayCount; index += 1) {
    const u0 = index / bayCount;
    const u1 = (index + 1) / bayCount;
    const bayLength = (u1 - u0) * wall.length;
    const isDoorBay = door !== null && index === door.bayIndex;
    let window = null;
    const roll = random();
    if (!isDoorBay && roll < facade.windowChance) {
      const margin = 0.16; // beam clearance in meters
      const maxWidth = bayLength - margin * 2;
      const width = Math.min(facade.windowWidth, maxWidth * 0.8);
      if (width > 0.3) {
        const y0 = floor === 0 ? 0.95 : 0.75;
        window = {
          height: Math.min(facade.windowHeight, settings.massing.floorHeight - y0 - 0.45),
          u: (u0 + u1) / 2,
          width,
          y0,
        };
      }
    }
    bays.push({ door: isDoorBay ? door : null, u0, u1, window });
  }
  return bays;
}

/**
 * settings (+ its seed) → plan. See module header; the plan is everything
 * the mesher and the invariant tests need.
 */
export function resolveBuildingPlan(settings) {
  const random = mulberry32(settings.seed * 2654435761 + 17);
  const footprint = buildFootprint(settings.footprint, random);
  const { massing, roof } = settings;

  // Floors: inset shrinks the working rects; clamp so the top floor never
  // degenerates (invariant 4).
  const minSpan = Math.min(
    settings.footprint.width,
    settings.footprint.depth,
  );
  const maxInset = (minSpan * 0.3) / Math.max(massing.floors, 1);
  const inset = Math.min(massing.inset, maxInset);
  const floors = [];
  for (let level = 0; level < massing.floors; level += 1) {
    floors.push({
      inset: inset * level,
      level,
      y0: level * massing.floorHeight,
      y1: (level + 1) * massing.floorHeight,
    });
  }
  const wallTop = floors[floors.length - 1].y1;
  const topInset = inset * (massing.floors - 1);

  // Door: the longest ground-floor wall; centered in its middle bay. The
  // wall is exterior by construction (every perimeter segment is).
  let doorWallIndex = 0;
  for (let index = 1; index < footprint.walls.length; index += 1) {
    if (footprint.walls[index].length > footprint.walls[doorWallIndex].length) {
      doorWallIndex = index;
    }
  }
  const doorWall = footprint.walls[doorWallIndex];
  const doorBayCount = Math.max(Math.round(doorWall.length / settings.facade.bayWidth), 1);
  const door = {
    bayIndex: Math.floor(doorBayCount / 2),
    height: Math.min(settings.facade.doorHeight, massing.floorHeight - 0.3),
    u: (Math.floor(doorBayCount / 2) + 0.5) / doorBayCount,
    width: Math.min(settings.facade.doorWidth, doorWall.length * 0.5),
  };

  // Facades: per floor per wall. Upper floors of inset massing reuse the
  // same wall directions with shrunk extents (the mesher applies inset).
  const facades = [];
  for (const floor of floors) {
    footprint.walls.forEach((wall, wallIndex) => {
      facades.push({
        bays: layoutBays(wall, settings, random, {
          door: floor.level === 0 && wallIndex === doorWallIndex ? door : null,
          floor: floor.level,
        }),
        floor: floor.level,
        wallIndex,
      });
    });
  }

  // Roof per rect: the main rect carries the ridge along its longer axis;
  // wings get their own smaller roof of the same kind.
  const roofs = footprint.rects.map((rect, index) => {
    const spanX = rect.x1 - rect.x0;
    const spanZ = rect.z1 - rect.z0;
    const ridgeAxis = spanX >= spanZ ? 'x' : 'z';
    const halfSpan = (ridgeAxis === 'x' ? spanZ : spanX) / 2;
    // seeded proportion jitter: cousins, not clones — and the only seed
    // variation some spartan types (shrine) have
    const riseJitter = 0.95 + random() * 0.1;
    return {
      curvature: roof.curvature,
      kind: roof.kind,
      overhang: Math.max(roof.overhang * (0.97 + random() * 0.06), 0.25), // invariant 3: floor applied last
      rect,
      ridgeAxis,
      ridgeDecor: roof.ridgeDecor,
      rise: Math.max((halfSpan + roof.overhang) * roof.pitch, 0.4) * riseJitter,
      wing: index > 0,
    };
  });

  // Trim: chimney near the main ridge end for homely types.
  const wantsChimney = settings.type === 'cottage' || settings.type === 'farmhouse';
  const mainRect = footprint.rects[0];
  const chimney = wantsChimney
    ? {
      x: roofs[0].ridgeAxis === 'x'
        ? mainRect.x0 + (mainRect.x1 - mainRect.x0) * (0.22 + random() * 0.12)
        : (mainRect.x0 + mainRect.x1) / 2 + (random() - 0.5) * 0.6,
      z: roofs[0].ridgeAxis === 'z'
        ? mainRect.z0 + (mainRect.z1 - mainRect.z0) * (0.22 + random() * 0.12)
        : (mainRect.z0 + mainRect.z1) / 2 + (random() - 0.5) * 0.6,
    }
    : null;

  // Collision: one circle per footprint rect (two for long rects).
  const footprintCircles = [];
  for (const rect of footprint.rects) {
    const cx = (rect.x0 + rect.x1) / 2;
    const cz = (rect.z0 + rect.z1) / 2;
    const spanX = rect.x1 - rect.x0;
    const spanZ = rect.z1 - rect.z0;
    const radius = Math.min(spanX, spanZ) * 0.62;
    if (Math.max(spanX, spanZ) > Math.min(spanX, spanZ) * 1.5) {
      const along = spanX >= spanZ ? 'x' : 'z';
      const reach = (Math.max(spanX, spanZ) / 2 - radius * 0.7);
      for (const side of [-1, 1]) {
        footprintCircles.push({
          radius,
          x: cx + (along === 'x' ? side * reach : 0),
          z: cz + (along === 'z' ? side * reach : 0),
        });
      }
    } else {
      footprintCircles.push({ radius, x: cx, z: cz });
    }
  }

  const bounds = {
    maxX: Math.max(...footprint.rects.map((rect) => rect.x1)),
    maxZ: Math.max(...footprint.rects.map((rect) => rect.z1)),
    minX: Math.min(...footprint.rects.map((rect) => rect.x0)),
    minZ: Math.min(...footprint.rects.map((rect) => rect.z0)),
  };

  return {
    bounds,
    chimney,
    door: {
      ...door,
      // world-frame door anchor for villages: position + outward normal
      nx: doorWall.nx,
      nz: doorWall.nz,
      wallIndex: doorWallIndex,
      x: doorWall.ax + (doorWall.bx - doorWall.ax) * door.u,
      z: doorWall.az + (doorWall.bz - doorWall.az) * door.u,
    },
    facades,
    floors,
    footprint,
    footprintCircles,
    roofs,
    seed: settings.seed,
    settings,
    topInset,
    type: settings.type,
    wallTop,
  };
}

/**
 * Grammar invariant checks — run across 1000 seeds in the verify script.
 * Returns a list of violation strings (empty = clean).
 */
export function checkPlanInvariants(plan) {
  const violations = [];
  const { door, facades, footprint, roofs, settings } = plan;

  // 1. Door exists on an exterior wall, fits it, sits on the ground floor.
  const doorWall = footprint.walls[door.wallIndex];
  if (!doorWall) violations.push('door wall missing');
  else if (door.width > doorWall.length * 0.8) violations.push('door wider than its wall');
  const doorFacade = facades.find((facade) => facade.floor === 0 && facade.wallIndex === door.wallIndex);
  if (!doorFacade || !doorFacade.bays.some((bay) => bay.door)) {
    violations.push('door bay missing from ground facade');
  }

  // 2. Windows never intersect beams: window extent ⊂ its bay minus margin.
  for (const facade of facades) {
    const wall = footprint.walls[facade.wallIndex];
    for (const bay of facade.bays) {
      if (!bay.window) continue;
      const bayLength = (bay.u1 - bay.u0) * wall.length;
      const windowU0 = bay.window.u - (bay.window.width / 2) / wall.length;
      const windowU1 = bay.window.u + (bay.window.width / 2) / wall.length;
      const marginU = 0.1 / wall.length;
      if (windowU0 < bay.u0 + marginU || windowU1 > bay.u1 - marginU) {
        violations.push(`window escapes its bay on wall ${facade.wallIndex} floor ${facade.floor}`);
      }
      if (bay.window.y0 + bay.window.height > settings.massing.floorHeight - 0.2) {
        violations.push('window intersects the floor beam above');
      }
    }
  }

  // 3. Roofs always overhang walls.
  for (const roofSpec of roofs) {
    if (roofSpec.overhang < 0.25 - 1e-9) violations.push('roof overhang collapsed');
  }

  // 4. Massing sanity: top floor keeps positive span after inset.
  const minSpan = Math.min(settings.footprint.width, settings.footprint.depth);
  if (plan.topInset * 2 > minSpan * 0.8) violations.push('floor inset degenerates the top floor');

  // 5. Collision covers every rect center.
  for (const rect of footprint.rects) {
    const cx = (rect.x0 + rect.x1) / 2;
    const cz = (rect.z0 + rect.z1) / 2;
    const covered = plan.footprintCircles.some(
      (circle) => (circle.x - cx) ** 2 + (circle.z - cz) ** 2 <= circle.radius ** 2,
    );
    if (!covered) violations.push('footprint circle misses a rect center');
  }
  return violations;
}
