// Wave-2 (rural set) and wave-3 (garden/urban) prop generators. Same
// contract as wave 1: { main, glow, footprint } with origin at ground
// contact.

import { PartsBuilder } from './propParts.js';

const TAU = Math.PI * 2;

// --- well ---------------------------------------------------------------------

export function generateWell(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const radius = shape.radius;
  const wall = shape.wallHeight;

  // stone ring: lathe with a lip
  builder.lathe([
    [radius + 0.16, 0], [radius + 0.14, wall * 0.82], [radius + 0.2, wall * 0.86],
    [radius + 0.2, wall], [radius - 0.04, wall], [radius - 0.04, wall * 0.35],
  ], { segments: hi ? 12 : 8, slot: 0 });
  {
    // individual coping stones for the hand-built read (values drawn on
    // both detail levels so the structure stream stays aligned)
    const stones = 8;
    for (let index = 0; index < stones; index += 1) {
      const angle = (index / stones) * TAU + random() * 0.1;
      const roll = (random() - 0.5) * 0.06;
      const shade = 0.88 + random() * 0.2;
      if (!hi) continue;
      builder.box(0.32, 0.12, 0.24, {
        position: [Math.cos(angle) * (radius + 0.02), wall + 0.05, Math.sin(angle) * (radius + 0.02)],
        rotation: [0, -angle + Math.PI / 2, roll],
        shade,
        slot: 0,
      });
    }
  }

  if (settings.asset.variant === 'roofed') {
    const roofY = shape.roofHeight;
    for (const side of [-1, 1]) {
      builder.box(0.09, roofY, 0.09, {
        position: [side * (radius + 0.05), roofY / 2, 0], shade: 0.95, slot: 1,
      });
    }
    // winch beam + rope + bucket
    builder.cylinder(0.04, 0.04, (radius + 0.2) * 2, {
      position: [0, roofY * 0.82, 0],
      rotation: [0, 0, Math.PI / 2],
      segments: hi ? 7 : 5,
      shade: 0.85,
      slot: 1,
    });
    if (shape.bucket >= 0.5) {
      const ropeLength = roofY * 0.82 - wall - 0.3;
      builder.cylinder(0.012, 0.012, ropeLength, {
        position: [0, roofY * 0.82 - ropeLength / 2, 0], segments: 5, shade: 0.7, slot: 2,
      });
      builder.lathe([
        [0.09, 0], [0.12, 0.16], [0.115, 0.18],
      ], { position: [0, wall + 0.12, 0], segments: hi ? 9 : 6, shade: 0.9, slot: 1 });
    }
    // gable roof: two slabs + ridge
    const roofSpan = radius + 0.55;
    for (const side of [-1, 1]) {
      builder.box(roofSpan, 0.05, roofSpan * 1.15, {
        position: [side * roofSpan * 0.33, roofY + roofSpan * 0.2, 0],
        rotation: [0, 0, side * -0.62],
        shade: 0.9,
        slot: 1,
      });
    }
    builder.box(0.1, 0.08, roofSpan * 1.18, {
      position: [0, roofY + roofSpan * 0.37, 0], shade: 0.8, slot: 1,
    });
  }
  return { footprint: { radius: radius + 0.32 }, ...builder.build() };
}

// --- crates & barrels ----------------------------------------------------------

export function generateCrateStack(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const size = shape.size;
  const count = Math.round(shape.count);
  const placed = [];

  for (let index = 0; index < count; index += 1) {
    const isBarrel = settings.asset.variant === 'barrels'
      || (settings.asset.variant === 'mixed' && random() < 0.45);
    const pieceSize = size * (0.85 + random() * 0.3);
    // stack on an earlier piece, or spread on the ground
    const stackOn = placed.length > 0 && random() < shape.stackiness
      ? placed[Math.floor(random() * placed.length)]
      : null;
    const x = stackOn ? stackOn.x + (random() - 0.5) * 0.1 : (random() - 0.5) * shape.jitter * size * 2.6;
    const z = stackOn ? stackOn.z + (random() - 0.5) * 0.1 : (random() - 0.5) * shape.jitter * size * 2.6;
    const y = stackOn ? stackOn.top : 0;
    const yaw = random() * TAU * shape.jitter * 0.5;
    if (isBarrel) {
      const height = pieceSize * 1.15;
      builder.lathe([
        [pieceSize * 0.34, 0], [pieceSize * 0.42, height * 0.5], [pieceSize * 0.34, height],
      ], { position: [x, y, z], rotation: [0, yaw, 0], segments: hi ? 11 : 7, shade: 0.92 + random() * 0.14, slot: 0 });
      if (hi) {
        for (const bandY of [height * 0.18, height * 0.82]) {
          builder.cylinder(pieceSize * 0.395, pieceSize * 0.395, 0.035, {
            position: [x, y + bandY, z], segments: 11, shade: 0.8, slot: 2,
          });
        }
      }
      placed.push({ top: y + height, x, z });
    } else {
      const height = pieceSize * 0.92;
      builder.box(pieceSize, height, pieceSize, {
        position: [x, y + height / 2, z],
        rotation: [0, yaw, 0],
        shade: 0.9 + random() * 0.18,
        slot: random() < 0.3 ? 1 : 0,
      });
      if (hi) {
        // lid frame reads "crate" from any distance
        builder.box(pieceSize * 1.04, 0.045, pieceSize * 1.04, {
          position: [x, y + height - 0.02, z], rotation: [0, yaw, 0], shade: 0.78, slot: 1,
        });
      }
      placed.push({ top: y + height, x, z });
    }
  }
  const spread = size * (1 + shape.jitter);
  return { footprint: { radius: Math.max(spread, size * 0.8) + 0.15 }, ...builder.build() };
}

// --- firewood pile ---------------------------------------------------------------

export function generateFirewood(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const loose = settings.asset.variant === 'loose';
  const logRadius = shape.logRadius;
  const rows = Math.max(Math.round(shape.height / (logRadius * 2)), 2);
  const logsPerRow = Math.max(Math.round(shape.length / (logRadius * 2.2)), 4);
  const logLength = 0.45;

  if (!hi) {
    // far LOD: one box per row keeps the silhouette at ~2% of the triangles
    for (let row = 0; row < rows; row += 1) {
      const rowCount = loose ? Math.max(logsPerRow - row, 2) : logsPerRow - (row % 2);
      builder.box(rowCount * logRadius * 2.15, logRadius * 2, logLength, {
        position: [0, logRadius + row * logRadius * (loose ? 1.55 : 1.8), 0],
        shade: 0.9,
        slot: 0,
      });
    }
    return {
      footprint: {
        circles: [
          { radius: 0.42, x: -shape.length * 0.25, z: 0 },
          { radius: 0.42, x: shape.length * 0.25, z: 0 },
        ],
      },
      ...builder.build(),
    };
  }
  for (let row = 0; row < rows; row += 1) {
    const rowCount = loose ? Math.max(logsPerRow - row, 2) : logsPerRow - (row % 2);
    for (let index = 0; index < rowCount; index += 1) {
      if (loose && random() < 0.2) continue;
      const x = (index - rowCount / 2 + 0.5) * logRadius * 2.15
        + (loose ? (random() - 0.5) * logRadius * 1.6 : (random() - 0.5) * logRadius * 0.3);
      const y = logRadius + row * logRadius * (loose ? 1.55 : 1.8);
      const z = (loose ? (random() - 0.5) * logRadius * 3 : (row % 2) * logRadius * 0.2);
      const roll = (random() - 0.5) * (loose ? 0.5 : 0.08);
      builder.cylinder(logRadius, logRadius, logLength, {
        position: [x, y, z],
        rotation: [Math.PI / 2 + roll, 0, 0],
        segments: hi ? 7 : 5,
        shade: 0.85 + random() * 0.25,
        slot: 0,
      });
      if (hi) {
        // pale cut face on the near end
        builder.cylinder(logRadius * 0.92, logRadius * 0.92, 0.012, {
          position: [x, y, z + logLength / 2],
          rotation: [Math.PI / 2 + roll, 0, 0],
          segments: 7,
          shade: 1,
          slot: 2,
        });
      }
    }
  }
  return {
    footprint: {
      circles: [
        { radius: 0.42, x: -shape.length * 0.25, z: 0 },
        { radius: 0.42, x: shape.length * 0.25, z: 0 },
      ],
    },
    ...builder.build(),
  };
}

// --- torii gate -------------------------------------------------------------------

export function generateTorii(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const height = shape.height * (0.97 + random() * 0.06);
  const halfSpan = height * 0.5 * shape.width * (0.97 + random() * 0.06);
  const pillarR = height * shape.pillarRadius;
  const lean = 0.05 + random() * 0.02; // classic inward pillar lean

  for (const side of [-1, 1]) {
    builder.cylinder(pillarR * 0.85, pillarR, height * 0.92, {
      position: [side * halfSpan, height * 0.46, 0],
      rotation: [0, 0, -side * lean],
      segments: hi ? 10 : 6,
      slot: 0,
    });
    // base stone
    builder.cylinder(pillarR * 1.5, pillarR * 1.7, height * 0.05, {
      position: [side * halfSpan, height * 0.025, 0],
      segments: hi ? 10 : 6,
      shade: 0.85,
      slot: 1,
    });
  }
  // nuki (tie beam through the pillars)
  builder.box(halfSpan * 2 + pillarR * 3, height * 0.055, pillarR * 1.1, {
    position: [0, height * 0.72, 0], slot: 0, shade: 0.96,
  });
  // gakuzuka (center strut)
  builder.box(pillarR * 1.2, height * 0.14, pillarR * 0.9, {
    position: [0, height * 0.82, 0], slot: 0, shade: 0.9,
  });
  // shimaki + kasagi (double top lintel, curved for myōjin)
  const curve = settings.asset.variant === 'shinmei' ? 0 : shape.curvature;
  const lintelSegments = curve > 0.05 && hi ? 5 : 1;
  const lintelSpan = halfSpan * 2 + pillarR * 5;
  for (const [thickness, yBase, lengthScale, shadeValue, slot] of [
    [height * 0.05, height * 0.885, 0.94, 0.92, 0],  // shimaki: vermilion
    [height * 0.075, height * 0.95, 1, 1, 2],        // kasagi: black cap
  ]) {
    for (let segment = 0; segment < lintelSegments; segment += 1) {
      const t0 = segment / lintelSegments - 0.5;
      const t1 = (segment + 1) / lintelSegments - 0.5;
      const x0 = t0 * lintelSpan * lengthScale;
      const x1 = t1 * lintelSpan * lengthScale;
      const lift = (t) => Math.abs(t * 2) ** 2 * curve * height * 0.09;
      const y0 = yBase + lift(t0);
      const y1 = yBase + lift(t1);
      const segLength = Math.hypot(x1 - x0, y1 - y0);
      builder.box(segLength + 0.02, thickness, pillarR * 2.4, {
        position: [(x0 + x1) / 2, (y0 + y1) / 2, 0],
        rotation: [0, 0, Math.atan2(y1 - y0, x1 - x0)],
        shade: shadeValue,
        slot,
      });
    }
  }
  return {
    footprint: {
      circles: [
        { radius: pillarR * 2, x: -halfSpan, z: 0 },
        { radius: pillarR * 2, x: halfSpan, z: 0 },
      ],
    },
    ...builder.build(),
  };
}

// --- pier ---------------------------------------------------------------------------

export function generatePier(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const width = shape.width;
  const deckY = shape.deckHeight;
  const plankPitch = 0.34;

  const buildRun = (fromZ, toZ, offsetX = 0, runWidth = width) => {
    const length = toZ - fromZ;
    const planks = Math.max(Math.round(length / plankPitch), 3);
    for (let index = 0; index < planks; index += 1) {
      const z = fromZ + (index + 0.5) * (length / planks);
      builder.box(runWidth, 0.07, length / planks * 0.8, {
        position: [offsetX, deckY, z],
        rotation: [0, (random() - 0.5) * 0.02, 0],
        shade: 0.88 + random() * 0.2,
        slot: 0,
      });
    }
    // stringers + posts
    for (const side of [-1, 1]) {
      builder.box(0.12, 0.14, length, {
        position: [offsetX + side * runWidth * 0.42, deckY - 0.1, fromZ + length / 2],
        shade: 0.8,
        slot: 1,
      });
    }
    const bays = Math.max(Math.round(length / 2.4), 1);
    for (let bay = 0; bay <= bays; bay += 1) {
      const z = fromZ + (bay / bays) * length;
      for (const side of [-1, 1]) {
        builder.cylinder(0.07, 0.085, deckY + 1.3, {
          position: [offsetX + side * runWidth * 0.42, (deckY - 1.3) / 2 + 0.65 - 0.65, z],
          segments: hi ? 7 : 5,
          shade: 0.75 + random() * 0.15,
          slot: 1,
        });
      }
    }
  };

  buildRun(0, shape.length);
  if (settings.asset.variant === 'tShape') {
    const headWidth = shape.length * 0.45;
    buildRun(shape.length, shape.length + width, 0, headWidth * 2);
  }
  if (shape.rails >= 1) {
    const sides = shape.rails >= 2 ? [-1, 1] : [1];
    for (const side of sides) {
      const posts = Math.max(Math.round(shape.length / 1.8), 2);
      for (let index = 0; index <= posts; index += 1) {
        const z = (index / posts) * shape.length;
        builder.box(0.07, 0.85, 0.07, {
          position: [side * width * 0.46, deckY + 0.42, z], shade: 0.82, slot: 1,
        });
      }
      builder.box(0.06, 0.06, shape.length, {
        position: [side * width * 0.46, deckY + 0.85, shape.length / 2], shade: 0.95, slot: 0,
      });
    }
  }
  return {
    footprint: {
      circles: [
        { radius: width * 0.35, x: -width * 0.42, z: shape.length * 0.5 },
        { radius: width * 0.35, x: width * 0.42, z: shape.length * 0.5 },
      ],
    },
    ...builder.build(),
  };
}

// --- stone wall (linear) --------------------------------------------------------------

export function generateStoneWallAlong(settings, random, points, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const courses = Math.max(Math.round(shape.height / (0.22 * shape.stoneSize)), 2);
  const stoneH = shape.height / courses;

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const stones = Math.max(Math.round(span / (0.5 * shape.stoneSize)), 1);
    for (let course = 0; course < courses; course += 1) {
      for (let stone = 0; stone < stones; stone += 1) {
        const t = (stone + 0.5 + (course % 2) * 0.5) / stones;
        if (t > 1) continue;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t;
        const mossRoll = random();
        builder.box(
          (span / stones) * (0.94 + random() * 0.1),
          stoneH * (0.9 + random() * 0.18),
          shape.thickness * (0.9 + random() * 0.2),
          {
            position: [x, y + (course + 0.5) * stoneH, z],
            rotation: [(random() - 0.5) * 0.04, heading + Math.PI / 2 + (random() - 0.5) * 0.05, (random() - 0.5) * 0.04],
            shade: 0.85 + random() * 0.28,
            slot: hi && course === 0 && mossRoll < 0.35 ? 2 : 0, // mossy base stones
          },
        );
      }
    }
    if (shape.topCourse >= 0.5) {
      const copings = Math.max(Math.round(span / 0.32), 1);
      for (let coping = 0; coping < copings; coping += 1) {
        const t = (coping + 0.5) / copings;
        const rollA = (random() - 0.5) * 0.1;
        const rollB = (random() - 0.5) * 0.12;
        const shade = 0.9 + random() * 0.16;
        if (!hi) continue;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t;
        builder.box(0.24, 0.26, shape.thickness * 0.7, {
          position: [x, y + shape.height + 0.1, z],
          rotation: [rollA, heading + Math.PI / 2, rollB],
          shade,
          slot: 1,
        });
      }
    }
  }

  const footprints = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(Math.round(span / 0.5), 1);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      footprints.push({
        radius: shape.thickness * 0.75,
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
      });
    }
  }
  return { footprints, ...builder.build() };
}

// --- bench ------------------------------------------------------------------------------

export function generateBench(settings, random, detail = 'hi') {
  const { shape } = settings;
  const builder = new PartsBuilder(settings.surface, random);
  const isLog = settings.asset.variant === 'log';
  const length = shape.length * (0.95 + random() * 0.1);
  if (isLog) {
    builder.cylinder(0.16, 0.16, length, {
      position: [0, shape.height - 0.08, 0],
      rotation: [0, 0, Math.PI / 2],
      scale: [1, 1, 0.7],
      segments: detail === 'hi' ? 9 : 6,
      slot: 0,
    });
  } else {
    builder.box(length, 0.06, 0.38, {
      position: [0, shape.height, 0], slot: 0,
    });
  }
  for (const side of [-1, 1]) {
    builder.box(0.08, shape.height, isLog ? 0.3 : 0.34, {
      position: [side * (length * 0.42), shape.height / 2, 0],
      shade: 0.85,
      slot: 1,
    });
  }
  if (!isLog && shape.backrest >= 0.5) {
    builder.box(length, 0.3, 0.05, {
      position: [0, shape.height + 0.32, -0.17], rotation: [-0.16, 0, 0], shade: 0.95, slot: 0,
    });
  }
  return { footprint: { radius: Math.max(length * 0.5, 0.4) }, ...builder.build() };
}
