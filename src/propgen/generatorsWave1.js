// Wave-1 prop generators: path dressing. Each generator returns
// { main, glow, footprint } — merged painted geometry per role plus the
// collision footprint ({ radius } or { circles }) in the prop's local
// frame (origin = ground contact, +y up).
//
// `detail` is 'hi' or 'lo': lo drops segment counts and garnish parts but
// keeps the silhouette, so the distance swap is invisible in motion.

import { PartsBuilder } from './propParts.js';

const TAU = Math.PI * 2;

// --- lantern -----------------------------------------------------------------

export function generateLantern(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  // seeded proportion jitter: every lantern is a cousin, not a clone
  const height = shape.height * (0.95 + random() * 0.1);
  const lamp = shape.lampSize * (0.94 + random() * 0.12);

  if (settings.asset.variant === 'chochin') {
    // Post + arm + hanging paper barrel. The paper is the glow role — warm
    // unlit lamp bodies read at dusk without any real light.
    const postHeight = height;
    builder.cylinder(0.05, 0.065, postHeight, {
      position: [0, postHeight / 2, 0], segments: hi ? 8 : 5, slot: 0,
    });
    builder.box(0.05, 0.05, 0.42, {
      position: [0, postHeight - 0.05, 0.18], slot: 0, shade: 0.92,
    });
    const bodyR = 0.16 * lamp;
    const bodyH = 0.42 * lamp;
    const bodyY = postHeight - 0.14 - bodyH / 2;
    builder.lathe([
      [0.02, 0], [bodyR * 0.8, bodyH * 0.12], [bodyR, bodyH * 0.5],
      [bodyR * 0.8, bodyH * 0.88], [0.02, bodyH],
    ], {
      position: [0, bodyY, 0.34], role: 'glow', segments: hi ? 12 : 7,
      shade: 0.75 + shape.glow * 0.5, slot: 2,
    });
    builder.cylinder(0.05, 0.05, 0.03, {
      position: [0, bodyY + bodyH + 0.015, 0.34], segments: hi ? 8 : 5, shade: 0.5, slot: 0,
    });
    builder.cylinder(0.05, 0.05, 0.03, {
      position: [0, bodyY - 0.015, 0.34], segments: hi ? 8 : 5, shade: 0.5, slot: 0,
    });
    return { footprint: { radius: 0.14 }, ...builder.build() };
  }

  if (settings.asset.variant === 'woodPost') {
    const postHeight = height;
    builder.box(0.09, postHeight, 0.09, { position: [0, postHeight / 2, 0], slot: 0 });
    const boxSize = 0.24 * lamp;
    const boxY = postHeight - boxSize / 2 - 0.02;
    // housing frame: four corner sticks + glow core
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      builder.box(0.03, boxSize, 0.03, {
        position: [dx * boxSize * 0.45, boxY, dz * boxSize * 0.45], shade: 0.85, slot: 0,
      });
    }
    builder.box(boxSize * 0.8, boxSize * 0.8, boxSize * 0.8, {
      position: [0, boxY, 0], role: 'glow', shade: 0.7 + shape.glow * 0.5, slot: 2,
    });
    builder.box(boxSize * 1.5, 0.04, boxSize * 1.5, {
      position: [0, boxY + boxSize * 0.55, 0], rotation: [0, Math.PI / 4, 0], shade: 0.8, slot: 1,
    });
    return { footprint: { radius: 0.12 }, ...builder.build() };
  }

  // stoneToro: plinth → pillar → firebox (glow core behind stone posts) →
  // pyramidal cap → jewel. The anime shrine-path staple.
  const plinthH = height * 0.14;
  const pillarH = height * 0.34;
  const shelfH = height * 0.06;
  const boxH = height * 0.26 * lamp;
  const roofH = height * 0.16;
  let y = 0;
  builder.lathe([
    [height * 0.22, 0], [height * 0.2, plinthH * 0.5], [height * 0.13, plinthH],
  ], { position: [0, y, 0], segments: hi ? 10 : 6, slot: 0 });
  y += plinthH;
  builder.cylinder(height * 0.06, height * 0.08, pillarH, {
    position: [0, y + pillarH / 2, 0], segments: hi ? 9 : 6, shade: 0.96, slot: 0,
  });
  y += pillarH;
  builder.box(height * 0.3, shelfH, height * 0.3, {
    position: [0, y + shelfH / 2, 0], shade: 0.9, slot: 0,
  });
  y += shelfH;
  const boxW = height * 0.22;
  builder.box(boxW * 0.8, boxH * 0.9, boxW * 0.8, {
    position: [0, y + boxH / 2, 0], role: 'glow', shade: 0.7 + shape.glow * 0.5, slot: 2,
  });
  if (hi) {
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      builder.box(boxW * 0.16, boxH, boxW * 0.16, {
        position: [dx * boxW * 0.42, y + boxH / 2, dz * boxW * 0.42], shade: 0.85, slot: 0,
      });
    }
  }
  y += boxH;
  builder.cone(height * 0.24 * shape.roofOverhang, roofH, {
    position: [0, y + roofH / 2, 0], rotation: [0, Math.PI / 4, 0], segments: 4, shade: 0.88, slot: 0,
  });
  y += roofH;
  builder.sphere(height * 0.045, {
    position: [0, y + height * 0.03, 0], segments: hi ? 8 : 6, shade: 1.05, slot: 0,
  });
  return { footprint: { radius: Math.max(height * 0.22, 0.2) }, ...builder.build() };
}

// --- signpost ----------------------------------------------------------------

export function generateSignpost(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const tilt = (random() * 2 - 1) * shape.tilt * 0.09;
  const height = shape.height;
  builder.cylinder(0.045, 0.06, height, {
    position: [Math.sin(tilt) * height * 0.4, height / 2, 0],
    rotation: [0, 0, tilt],
    segments: hi ? 8 : 5,
    slot: 0,
  });
  const boards = settings.asset.variant === 'single' ? 1
    : settings.asset.variant === 'double' ? 2 : 4;
  for (let index = 0; index < boards; index += 1) {
    const y = height - 0.22 - index * 0.24;
    const yaw = settings.asset.variant === 'crossroads'
      ? (index * Math.PI) / 2 + (random() - 0.5) * 0.2
      : (random() - 0.5) * 0.6 + (index % 2 ? Math.PI : 0);
    const length = shape.boardLength * (0.85 + random() * 0.3);
    builder.box(length, 0.13, 0.03, {
      position: [
        Math.cos(yaw) * length * 0.42 + Math.sin(tilt) * y * 0.8,
        y,
        -Math.sin(yaw) * length * 0.42,
      ],
      rotation: [0, yaw, (random() - 0.5) * shape.tilt * 0.12],
      shade: 0.95 + random() * 0.1,
      slot: 1,
    });
    if (hi) {
      // pointed tip: a small wedge at the far end sells "direction"
      builder.cone(0.075, 0.1, {
        position: [
          Math.cos(yaw) * length * 0.95 + Math.sin(tilt) * y * 0.8,
          y,
          -Math.sin(yaw) * length * 0.95,
        ],
        // cone +y → horizontal board direction (cos yaw, 0, -sin yaw)
        rotation: [Math.PI / 2, Math.atan2(Math.cos(yaw), -Math.sin(yaw)), 0],
        segments: 4,
        shade: 0.9,
        slot: 1,
      });
    }
  }
  return { footprint: { radius: 0.14 }, ...builder.build() };
}

// --- stone stairs -------------------------------------------------------------

export function generateStoneStairs(settings, random, detail = 'hi') {
  const { shape } = settings;
  const builder = new PartsBuilder(settings.surface, random);
  const depth = 0.34;
  const worn = settings.asset.variant === 'worn' ? 1 : shape.wear;
  for (let index = 0; index < shape.stepCount; index += 1) {
    const wearJitter = (random() * 2 - 1) * worn;
    const mossRoll = random(); // drawn unconditionally: hi and lo must stay in step
    builder.box(
      shape.width * (1 - Math.abs(wearJitter) * 0.06),
      shape.stepHeight + 0.05,
      depth + 0.1,
      {
        position: [
          wearJitter * 0.05,
          (index + 0.5) * shape.stepHeight - 0.04,
          index * depth,
        ],
        rotation: [wearJitter * 0.03, wearJitter * 0.05, wearJitter * 0.025],
        shade: 0.92 + random() * 0.14,
        // lower steps go mossy: accent slot carries the green
        slot: detail === 'hi' && index < shape.stepCount * shape.wear * 0.6 && mossRoll < 0.5 ? 2 : 0,
      },
    );
  }
  const runDepth = shape.stepCount * depth;
  return {
    footprint: {
      circles: [
        { radius: shape.width * 0.55, x: 0, z: runDepth * 0.25 },
        { radius: shape.width * 0.55, x: 0, z: runDepth * 0.75 },
      ],
    },
    ...builder.build(),
  };
}

// --- milestone -----------------------------------------------------------------

export function generateMilestone(settings, random, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const height = shape.height;
  const girth = shape.girth * height * 0.22;

  if (settings.asset.variant === 'obelisk') {
    builder.box(girth * 1.6, height * 0.12, girth * 1.6, {
      position: [0, height * 0.06, 0], shade: 0.9, slot: 0,
    });
    builder.box(girth, height * 0.76, girth, {
      position: [0, height * 0.5, 0], scale: [1, 1, 1], slot: 0,
    });
    builder.cone(girth * 0.72, height * 0.14, {
      position: [0, height * 0.93, 0], rotation: [0, Math.PI / 4, 0], segments: 4, shade: 1.04, slot: 0,
    });
  } else if (settings.asset.variant === 'jizo') {
    builder.lathe([
      [girth * 1.3, 0], [girth * 1.1, height * 0.1], [girth * 0.9, height * 0.16],
    ], { segments: hi ? 10 : 6, shade: 0.9, slot: 0 });
    builder.lathe([
      [girth * 0.85, 0], [girth, height * 0.3], [girth * 0.8, height * 0.62], [girth * 0.35, height * 0.72],
    ], { position: [0, height * 0.14, 0], segments: hi ? 10 : 6, slot: 0 });
    builder.sphere(girth * 0.55, {
      position: [0, height * 0.9, 0], segments: hi ? 9 : 6, shade: 1.02, slot: 0,
    });
    // the red bib — tiny, and instantly reads "jizō"
    builder.box(girth * 0.9, height * 0.2, 0.02, {
      position: [0, height * 0.68, girth * 0.72], rotation: [0.25, 0, 0], shade: 1, slot: 2,
    });
  } else {
    // roadStone: weathered rounded slab
    builder.lathe([
      [girth * 1.15, 0], [girth * 1.05, height * 0.32], [girth * 0.92, height * 0.7],
      [girth * 0.6, height * 0.94], [0.01, height],
    ], { rotation: [0, random() * TAU, 0], scale: [1, 1, 0.7], segments: hi ? 11 : 7, slot: 0 });
    if (hi && shape.inscription > 0.05) {
      builder.box(girth * 1.1, height * 0.26 * shape.inscription, girth * 0.16, {
        position: [0, height * 0.46, girth * 0.62], shade: 0.78, slot: 0,
      });
    }
  }
  if (hi && shape.moss > 0.05) {
    builder.lathe([
      [girth * 1.22, 0], [girth * 1.08, height * 0.1 + shape.moss * height * 0.12],
    ], { segments: 8, shade: 0.95, slot: 2 });
  }
  return { footprint: { radius: Math.max(girth * 1.3, 0.18) }, ...builder.build() };
}

// --- fence (linear) -------------------------------------------------------------

/**
 * Builds a fence run along resolved 3D points (one per post). Returns
 * { main, glow: null, footprints } where footprints are world-frame circles
 * along the run (the run is baked in world space by the caller's points).
 */
export function generateFenceAlong(settings, random, points, detail = 'hi') {
  const { shape } = settings;
  const hi = detail === 'hi';
  const builder = new PartsBuilder(settings.surface, random);
  const variant = settings.asset.variant;
  const thickness = shape.thickness;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const leanX = (random() * 2 - 1) * shape.lean * 0.1;
    const leanZ = (random() * 2 - 1) * shape.lean * 0.1;
    const postHeight = shape.postHeight * (1 + (random() - 0.5) * 0.08);
    if (variant === 'picket' || variant === 'ranch') {
      builder.box(thickness * 1.2, postHeight, thickness * 1.2, {
        position: [point.x, point.y + postHeight / 2, point.z],
        rotation: [leanX, 0, leanZ],
        shade: 0.9 + random() * 0.16,
        slot: 0,
      });
    } else {
      builder.cylinder(thickness * 0.8, thickness, postHeight, {
        position: [point.x, point.y + postHeight / 2, point.z],
        rotation: [leanX, 0, leanZ],
        segments: hi ? 7 : 5,
        shade: 0.9 + random() * 0.16,
        slot: 0,
      });
    }
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (random() < shape.gapChance) continue;
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const rails = variant === 'rope' ? 1 : Math.round(shape.railCount);
    for (let rail = 0; rail < rails; rail += 1) {
      const t = (rail + 1) / (rails + 1);
      const yA = a.y + shape.postHeight * (0.35 + t * 0.55);
      const yB = b.y + shape.postHeight * (0.35 + t * 0.55);
      if (variant === 'rope') {
        // sagging rope: three chained segments approximating a catenary
        const sagDrop = shape.sag * 0.22 * span * 0.25;
        const midX = (a.x + b.x) / 2;
        const midZ = (a.z + b.z) / 2;
        const midY = (yA + yB) / 2 - sagDrop;
        for (const [fromX, fromY, fromZ, toX, toY, toZ] of [
          [a.x, yA, a.z, midX, midY, midZ],
          [midX, midY, midZ, b.x, yB, b.z],
        ]) {
          const length = Math.hypot(toX - fromX, toY - fromY, toZ - fromZ);
          // cylinder +y → segment direction: pitch = acos(dy), yaw = atan2(dx, dz)
          const dy = (toY - fromY) / Math.max(length, 1e-6);
          builder.cylinder(0.02, 0.02, length, {
            position: [(fromX + toX) / 2, (fromY + toY) / 2, (fromZ + toZ) / 2],
            rotation: [
              Math.acos(Math.min(Math.max(dy, -1), 1)),
              Math.atan2(toX - fromX, toZ - fromZ),
              0,
            ],
            segments: 5,
            shade: 0.85,
            slot: 1,
          });
        }
        continue;
      }
      const pitch = Math.atan2(yB - yA, span);
      const bow = variant === 'log' ? 0 : (random() - 0.5) * shape.sag * 0.06;
      builder.box(thickness * 0.8, thickness * (variant === 'log' ? 1.4 : 0.8), span + thickness, {
        position: [(a.x + b.x) / 2, (yA + yB) / 2 - bow, (a.z + b.z) / 2],
        rotation: [-pitch, heading, 0],
        shade: 0.92 + random() * 0.14,
        slot: 1,
      });
    }
    if (variant === 'picket') {
      const slats = Math.max(Math.floor(span / 0.22), 2);
      for (let slat = 0; slat < slats; slat += 1) {
        const t = (slat + 0.5) / slats;
        const roll = (random() - 0.5) * 0.05;
        const shade = 0.94 + random() * 0.12;
        if (!hi) continue; // values drawn either way — streams stay aligned
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t;
        builder.box(0.1, shape.postHeight * 0.82, 0.02, {
          position: [x, y + shape.postHeight * 0.5, z],
          rotation: [0, heading, roll],
          shade,
          slot: 1,
        });
      }
    }
  }

  // Collision: a chain of circles along the run so characters can't slip
  // between posts.
  const footprints = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(Math.round(span / 0.55), 1);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      footprints.push({
        radius: 0.2,
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
      });
    }
  }
  return { footprints, ...builder.build() };
}
