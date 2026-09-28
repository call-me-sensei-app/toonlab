// Plan → geometry. One merged BufferGeometry per material role (wall /
// beam / roof / trim / door) keeps any building at ≤ 6 draw calls; villages
// instance repeated recipes on top of that. No interiors, no CSG: windows
// and doors are surface-mounted frames and panels — the stylized read at a
// fraction of the cost, and nothing to go wrong across 1000 seeds.

import * as THREE from 'three';

import { createPropRandom, mergePainted } from '../propgen/propParts.js';

const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

// Per-role painted-geometry collector; building palettes are explicit RGB
// per part (five roles), so this is PartsBuilder's cousin with free colors.
class RoleBuilder {
  constructor(variation, paintRandom) {
    this.variation = variation;
    this.random = paintRandom;
    this.roles = new Map();
  }

  paint(geometry, rgb, shade) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const normal = geometry.attributes.normal;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const drift = 1 + (this.random() * 2 - 1) * this.variation;
      const upward = Math.max(0, normal.getY(index));
      const value = drift * shade * (1 + upward * 0.12);
      colors[index * 3] = Math.min(rgb[0] * value, 1);
      colors[index * 3 + 1] = Math.min(rgb[1] * value, 1);
      colors[index * 3 + 2] = Math.min(rgb[2] * value, 1);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  add(role, geometry, rgb, shade = 1) {
    this.paint(geometry, rgb, shade);
    const bucket = this.roles.get(role);
    if (bucket) bucket.push(geometry);
    else this.roles.set(role, [geometry]);
  }

  box(role, rgb, shade, w, h, d, position, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    scratchEuler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchPosition.set(position[0], position[1], position[2]);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    geometry.applyMatrix4(scratchMatrix);
    this.add(role, geometry, rgb, shade);
  }

  /** Quad from 4 corners (CCW facing the viewer), normal computed flat. */
  quad(role, rgb, shade, p0, p1, p2, p3) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      ...p0, ...p1, ...p2, ...p0, ...p2, ...p3,
    ], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1,
    ], 2));
    geometry.computeVertexNormals();
    this.add(role, geometry, rgb, shade);
  }

  triangle(role, rgb, shade, p0, p1, p2) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    geometry.computeVertexNormals();
    this.add(role, geometry, rgb, shade);
  }

  build() {
    const result = {};
    for (const [role, geometries] of this.roles) {
      result[role] = mergePainted(geometries);
    }
    return result;
  }
}

// Inset a rectilinear CCW perimeter: each vertex moves along the sum of its
// two adjacent outward normals (exact for 90° corners).
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

const GLASS = [0.22, 0.31, 0.38];
const glassOf = (palette) => (Array.isArray(palette.glass) && palette.glass.length === 3
  ? palette.glass
  : GLASS);

function buildWallsAndFacades(builder, plan, detail) {
  const { settings, floors, footprint } = plan;
  const { palette, facade, massing } = settings;
  const hi = detail === 'hi';
  const thickness = 0.22;
  const shrineOpenWall = settings.type === 'shrine' ? plan.door.wallIndex : -1;

  for (const floor of floors) {
    const walls = insetWalls(footprint.walls, floor.inset);
    for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
      const wall = walls[wallIndex];
      const facadeSpec = plan.facades.find(
        (entry) => entry.floor === floor.level && entry.wallIndex === wallIndex,
      );
      const leanAt = (y) => massing.wallLean * y;
      const openColumns = floor.level === 0 && wallIndex === shrineOpenWall;

      const outer = (u, y) => [
        wall.ax + (wall.bx - wall.ax) * u + wall.nx * (thickness / 2 + leanAt(y)),
        y,
        wall.az + (wall.bz - wall.az) * u + wall.nz * (thickness / 2 + leanAt(y)),
      ];
      const inner = (u, y) => [
        wall.ax + (wall.bx - wall.ax) * u - wall.nx * (thickness / 2 - leanAt(y)),
        y,
        wall.az + (wall.bz - wall.az) * u - wall.nz * (thickness / 2 - leanAt(y)),
      ];

      if (openColumns) {
        // Shrine front: columns at bay edges instead of a wall — the open
        // hall read. The door panel becomes the inner sanctum face.
        const bays = facadeSpec?.bays ?? [];
        const columnRadius = 0.14;
        const edges = new Set([0, 1]);
        for (const bay of bays) { edges.add(bay.u0); edges.add(bay.u1); }
        for (const u of edges) {
          const [x, , z] = outer(u, 0);
          const geometry = new THREE.CylinderGeometry(columnRadius, columnRadius * 1.1, floor.y1 - floor.y0, 8);
          geometry.translate(x, (floor.y0 + floor.y1) / 2, z);
          builder.add('beam', geometry, palette.beam, 1);
        }
        // header beam across the top
        builder.quad('beam', palette.beam, 0.95,
          outer(0, floor.y1 - 0.28), outer(0, floor.y1),
          outer(1, floor.y1), outer(1, floor.y1 - 0.28));
        // inner sanctum wall, recessed
        builder.quad('wall', palette.wall, 0.86,
          inner(0.05, floor.y0), inner(0.05, floor.y1),
          inner(0.95, floor.y1), inner(0.95, floor.y0));
        continue;
      }

      // Outer + inner faces (leaning trapezoids); corners share positions so
      // adjacent walls seal.
      builder.quad('wall', palette.wall, 1,
        outer(0, floor.y0), outer(0, floor.y1), outer(1, floor.y1), outer(1, floor.y0));
      builder.quad('wall', palette.wall, 0.82,
        inner(1, floor.y0), inner(1, floor.y1), inner(0, floor.y1), inner(0, floor.y0));

      if (!facadeSpec) continue;
      const faceOffset = thickness / 2 + 0.035;
      const facePoint = (u, y) => [
        wall.ax + (wall.bx - wall.ax) * u + wall.nx * (faceOffset + leanAt(y)),
        y,
        wall.az + (wall.bz - wall.az) * u + wall.nz * (faceOffset + leanAt(y)),
      ];

      // Timber framing: floor bands + bay posts (hi only — the lo silhouette
      // doesn't need them).
      if (hi && facade.beams > 0.05) {
        const bandHeight = 0.16 * facade.beams + 0.06;
        for (const y of [floor.y0 + 0.02, floor.y1 - 0.08]) {
          const [ax, , az] = facePoint(0, y);
          const [bx, , bz] = facePoint(1, y);
          builder.box('beam', palette.beam, 1,
            0.07, bandHeight, wall.length + 0.02,
            [(ax + bx) / 2, y + bandHeight / 2, (az + bz) / 2],
            [0, Math.atan2(bx - ax, bz - az), 0]);
        }
        for (const bay of facadeSpec.bays) {
          for (const u of bay === facadeSpec.bays[0] ? [bay.u0, bay.u1] : [bay.u1]) {
            const yMid = (floor.y0 + floor.y1) / 2;
            const [x, , z] = facePoint(u, yMid);
            builder.box('beam', palette.beam, 0.95,
              0.11, floor.y1 - floor.y0, 0.11,
              [x, yMid, z],
              [0, Math.atan2(wall.bx - wall.ax, wall.bz - wall.az), 0]);
          }
        }
      }

      // Windows and the door — surface-mounted on the outer face.
      for (const bay of facadeSpec.bays) {
        const yaw = Math.atan2(wall.bx - wall.ax, wall.bz - wall.az);
        if (bay.window && hi) {
          const { u, width, y0: wy0, height } = bay.window;
          const yCenter = floor.y0 + wy0 + height / 2;
          const [x, , z] = facePoint(u, yCenter);
          // Frame reads as a reveal: it is deeper than the glass and the glass
          // is pushed inward behind it, so every window carries a modeled
          // recess plus real glass thickness rather than a proud panel.
          const frameDepth = 0.13;
          const glassDepth = 0.05;
          const glassSet = frameDepth / 2 - glassDepth / 2 - 0.005;
          builder.box('beam', palette.beam, 0.9, frameDepth, height + 0.14, width + 0.14, [x, yCenter, z], [0, yaw, 0]);
          builder.box('trim', glassOf(palette), 1, glassDepth, height, width,
            [x - wall.nx * glassSet, yCenter, z - wall.nz * glassSet], [0, yaw, 0]);
          // sill
          const [sx, , sz] = facePoint(u, floor.y0 + wy0 - 0.05);
          builder.box('trim', palette.trim, 1, 0.12, 0.07, width + 0.2, [sx, floor.y0 + wy0 - 0.05, sz], [0, yaw, 0]);
        }
        if (bay.door) {
          const { u, width, height } = bay.door;
          const yCenter = floor.y0 + height / 2;
          const [x, , z] = facePoint(u, yCenter);
          if (hi) {
            builder.box('beam', palette.beam, 0.92, 0.09, height + 0.12, width + 0.16, [x, yCenter, z], [0, yaw, 0]);
          }
          builder.box('door', palette.door, 1, 0.1, height, width, [x, yCenter, z], [0, yaw, 0]);
          if (hi) {
            // stone threshold step
            const [tx, , tz] = facePoint(u, 0);
            builder.box('trim', palette.trim, 0.95, 0.5, 0.14, width + 0.3,
              [tx + wall.nx * 0.2, 0.07, tz + wall.nz * 0.2], [0, yaw, 0]);
          }
        }
      }
    }
  }
}

// Roof slabs: top + underside + eave fascia. Pagoda curvature segments the
// slope and sweeps the eave upward.
function buildRoof(builder, plan, roofSpec, detail) {
  const { settings } = plan;
  const { palette } = settings;
  const hi = detail === 'hi';
  const { rect, overhang, rise, ridgeAxis, kind, curvature } = roofSpec;
  const baseY = plan.wallTop;
  const slabThickness = 0.14;

  // Work in ridge-local coordinates: `a` along the ridge, `b` across it.
  const along = ridgeAxis === 'x'
    ? { max: rect.x1 + overhang, min: rect.x0 - overhang }
    : { max: rect.z1 + overhang, min: rect.z0 - overhang };
  const across = ridgeAxis === 'x'
    ? { max: rect.z1 + overhang, mid: (rect.z0 + rect.z1) / 2, min: rect.z0 - overhang }
    : { max: rect.x1 + overhang, mid: (rect.x0 + rect.x1) / 2, min: rect.x0 - overhang };
  const point = (a, b, y) => (ridgeAxis === 'x' ? [a, y, b] : [b, y, a]);
  const halfSpan = (across.max - across.min) / 2;
  const eaveY = baseY - 0.08;
  const ridgeY = eaveY + rise;

  const slopeQuads = (bFrom, bTo, yFrom, yTo, aMin = along.min, aMax = along.max) => {
    const segments = kind === 'pagoda' && hi ? 4 : 1;
    // Winding depends on which way `b` runs AND which world axis it maps to
    // — one slope of every pair would otherwise face down (invisible at lo
    // detail, wrongly-shaded at hi).
    const flip = (bTo > bFrom) === (ridgeAxis === 'x');
    const topQuad = (p0, p1, p2, p3) => (flip
      ? builder.quad('roof', palette.roof, 1, p3, p2, p1, p0)
      : builder.quad('roof', palette.roof, 1, p0, p1, p2, p3));
    const underQuad = (p0, p1, p2, p3) => (flip
      ? builder.quad('roof', palette.roof, 0.72, p3, p2, p1, p0)
      : builder.quad('roof', palette.roof, 0.72, p0, p1, p2, p3));
    for (let segment = 0; segment < segments; segment += 1) {
      const t0 = segment / segments;
      const t1 = (segment + 1) / segments;
      // concave sweep: steep at the ridge, flaring flat toward the eave
      const ease = (t) => (curvature > 0.01 ? 1 - (1 - t) ** (1 + curvature * 1.6) : t);
      const b0 = bFrom + (bTo - bFrom) * t0;
      const b1 = bFrom + (bTo - bFrom) * t1;
      const y0 = yFrom + (yTo - yFrom) * ease(t0);
      const y1 = yFrom + (yTo - yFrom) * ease(t1);
      topQuad(
        point(aMin, b0, y0), point(aMax, b0, y0),
        point(aMax, b1, y1), point(aMin, b1, y1));
      if (hi) {
        underQuad(
          point(aMax, b0, y0 - slabThickness), point(aMin, b0, y0 - slabThickness),
          point(aMin, b1, y1 - slabThickness), point(aMax, b1, y1 - slabThickness));
      }
    }
  };

  let capAlong = { max: along.max, min: along.min };
  if (kind === 'shed') {
    slopeQuads(across.min, across.max, ridgeY, eaveY);
    // fascia on the high edge
    if (hi) {
      builder.quad('roof', palette.roof, 0.8,
        point(along.min, across.min, ridgeY - slabThickness), point(along.max, across.min, ridgeY - slabThickness),
        point(along.max, across.min, ridgeY), point(along.min, across.min, ridgeY));
    }
  } else if (kind === 'hip') {
    const hipInset = Math.min(halfSpan, (along.max - along.min) * 0.28);
    capAlong = { max: along.max - hipInset, min: along.min + hipInset };
    slopeQuads(across.mid, across.max, ridgeY, eaveY, along.min + hipInset, along.max - hipInset);
    slopeQuads(across.mid, across.min, ridgeY, eaveY, along.min + hipInset, along.max - hipInset);
    for (const [aEdge, aRidge] of [[along.min, along.min + hipInset], [along.max, along.max - hipInset]]) {
      const outwardFirst = aEdge === along.min; // wind each end to face outward
      if (outwardFirst) {
        builder.triangle('roof', palette.roof, 0.94,
          point(aEdge, across.min, eaveY), point(aEdge, across.max, eaveY),
          point(aRidge, across.mid, ridgeY));
      } else {
        builder.triangle('roof', palette.roof, 0.94,
          point(aEdge, across.max, eaveY), point(aEdge, across.min, eaveY),
          point(aRidge, across.mid, ridgeY));
      }
    }
  } else {
    // gable / pagoda: two slopes + gable-end infill at the wall line. The
    // infill rim follows the roof UNDERSIDE (including the pagoda ease
    // curve) so no sky sliver opens between wall and roof.
    slopeQuads(across.mid, across.max, ridgeY, eaveY);
    slopeQuads(across.mid, across.min, ridgeY, eaveY);
    const wallAcross = ridgeAxis === 'x'
      ? { max: rect.z1, min: rect.z0 }
      : { max: rect.x1, min: rect.x0 };
    const wallAlong = ridgeAxis === 'x'
      ? { max: rect.x1, min: rect.x0 }
      : { max: rect.z1, min: rect.z0 };
    const ease = (t) => (curvature > 0.01 ? 1 - (1 - t) ** (1 + curvature * 1.6) : t);
    const undersideAt = (b) => {
      const t = Math.min(Math.abs(b - across.mid) / halfSpan, 1);
      return ridgeY + (eaveY - ridgeY) * ease(t) - slabThickness - 0.015;
    };
    const rimSegments = kind === 'pagoda' && hi ? 4 : 1;
    for (const aEnd of [wallAlong.min, wallAlong.max]) {
      const flip = aEnd === wallAlong.min; // both gables must face OUTWARD
      const tri = (p0, p1, p2) => (flip
        ? builder.triangle('wall', palette.wall, 0.95, p0, p2, p1)
        : builder.triangle('wall', palette.wall, 0.95, p0, p1, p2));
      const rim = [];
      for (let index = 0; index <= rimSegments * 2; index += 1) {
        const b = wallAcross.min + ((wallAcross.max - wallAcross.min) * index) / (rimSegments * 2);
        rim.push([b, undersideAt(b)]);
      }
      const bottomY = baseY - 0.05;
      const bottomMid = point(aEnd, (wallAcross.min + wallAcross.max) / 2, bottomY);
      for (let index = 0; index < rim.length - 1; index += 1) {
        tri(
          bottomMid,
          point(aEnd, rim[index][0], rim[index][1]),
          point(aEnd, rim[index + 1][0], rim[index + 1][1]));
      }
      tri(
        point(aEnd, wallAcross.min, bottomY),
        point(aEnd, rim[0][0], rim[0][1]),
        bottomMid);
      tri(
        bottomMid,
        point(aEnd, rim[rim.length - 1][0], rim[rim.length - 1][1]),
        point(aEnd, wallAcross.max, bottomY));
    }
  }

  // Ridge cap + finials.
  if (hi && roofSpec.ridgeDecor > 0.05 && kind !== 'shed') {
    const capY = ridgeY + 0.05;
    const capLength = Math.max(capAlong.max - capAlong.min, 0.3) + 0.2;
    const capMid = (capAlong.min + capAlong.max) / 2;
    builder.box('roof', palette.roof, 0.7,
      ridgeAxis === 'x' ? capLength : 0.24,
      0.14,
      ridgeAxis === 'x' ? 0.24 : capLength,
      ridgeAxis === 'x' ? [capMid, capY, across.mid] : [across.mid, capY, capMid]);
    if (roofSpec.ridgeDecor > 0.4) {
      for (const aEnd of [capAlong.min + 0.1, capAlong.max - 0.1]) {
        const position = ridgeAxis === 'x' ? [aEnd, capY + 0.16, across.mid] : [across.mid, capY + 0.16, aEnd];
        builder.box('roof', palette.roof, 0.62, 0.16, 0.3, 0.16, position);
      }
    }
  }
}

/**
 * Builds the merged role geometries for a plan. `detail` 'hi' keeps timber,
 * window frames, ridge decoration; 'lo' is walls + roof + chimney silhouette.
 * Returns `{ geometries: { wall, beam, roof, trim, door }, stats }`.
 */
export function meshBuildingPlan(plan, { detail = 'hi' } = {}) {
  const { settings } = plan;
  const { palette, facade } = settings;
  const paintRandom = createPropRandom(plan.seed ^ 0x51ab);
  const builder = new RoleBuilder(palette.variation, paintRandom);
  const hi = detail === 'hi';

  // Foundation skirt: outset stone box per rect, buried 1.3 m — buildings
  // sit on slopes (≤ ~20°) without floating corners.
  for (const rect of plan.footprint.rects) {
    const width = rect.x1 - rect.x0 + 0.24;
    const depth = rect.z1 - rect.z0 + 0.24;
    const top = Math.max(facade.baseHeight, 0.12);
    builder.box('trim', palette.trim, 0.95, width, top + 1.3, depth,
      [(rect.x0 + rect.x1) / 2, top - (top + 1.3) / 2, (rect.z0 + rect.z1) / 2]);
  }
  // Shrine veranda: a wider platform + its own buried skirt (the platform
  // outreach would otherwise hover on any slope) + entry steps.
  if (settings.type === 'shrine' && hi) {
    const rect = plan.footprint.rects[0];
    builder.box('trim', palette.trim, 1.02,
      rect.x1 - rect.x0 + 1.6, 0.22, rect.z1 - rect.z0 + 1.6,
      [(rect.x0 + rect.x1) / 2, facade.baseHeight - 0.11, (rect.z0 + rect.z1) / 2]);
    builder.box('trim', palette.trim, 0.88,
      rect.x1 - rect.x0 + 1.4, facade.baseHeight + 1.1, rect.z1 - rect.z0 + 1.4,
      [(rect.x0 + rect.x1) / 2, (facade.baseHeight - 0.22 - 1.3) / 2, (rect.z0 + rect.z1) / 2]);
    const door = plan.door;
    const steps = Math.max(Math.round(facade.baseHeight / 0.18), 2);
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 1) / steps;
      builder.box('trim', palette.trim, 0.9 + step * 0.03,
        1.6, 0.18, 0.34,
        [
          door.x + door.nx * ((rect.z1 - rect.z0) * 0 + 0.9 + (1 - t) * 0.34 * steps * 0.5),
          facade.baseHeight * t - 0.09,
          door.z + door.nz * (0.9 + (1 - t) * 0.34 * steps * 0.5),
        ],
        [0, Math.atan2(door.nx, door.nz), 0]);
    }
  }

  buildWallsAndFacades(builder, plan, detail);
  for (const roofSpec of plan.roofs) buildRoof(builder, plan, roofSpec, detail);

  if (plan.chimney) {
    const mainRoof = plan.roofs[0];
    const chimneyTop = plan.wallTop + mainRoof.rise + 0.7;
    builder.box('trim', palette.trim, 1, 0.5, chimneyTop, 0.5,
      [plan.chimney.x, chimneyTop / 2, plan.chimney.z]);
    if (hi) {
      builder.box('trim', palette.trim, 0.85, 0.7, 0.12, 0.7,
        [plan.chimney.x, chimneyTop + 0.06, plan.chimney.z]);
    }
  }

  const geometries = builder.build();
  let triangles = 0;
  for (const geometry of Object.values(geometries)) {
    if (geometry?.index) triangles += geometry.index.count / 3;
  }
  return { geometries, stats: { triangles: Math.round(triangles) } };
}
