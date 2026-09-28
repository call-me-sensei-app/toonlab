// Swept-mesh tunnels. A tunnel is a doodleable cross-section PROFILE swept
// along a 3D PATH — a real tube mesh, not a heightfield trick. The terrain
// is punched ONLY where the tube crosses the surface (the portals), so the
// hill above a passage stays genuine, sculptable heightfield: no frozen
// caps, no full-column shafts.
//
//   profile — closed polygon in meters, local coords: u across the bore
//     (0 = center), v up from the floor (0 = floor line). Presets (arch /
//     round / box) or a normalized freehand doodle.
//   path — world polyline [[x,y,z],...]; y is the FLOOR elevation. Built by
//     buildTunnelPath from two clicked portals + an optional doodled route,
//     with a short lip extension past each open end so the tube mouth pokes
//     out through the punched quads and hides their stair-stepped edges.
//
// Tunnels are plain data ({id, profile, path, endOpen}) so they serialize,
// undo, and rebuild deterministically.

import * as THREE from 'three';

const WALL_FLOOR_COLOR = [0.16, 0.14, 0.12];
const WALL_CEILING_COLOR = [0.045, 0.04, 0.035];
const PORTAL_LIP = 1.4;
const PATH_STEP = 1.25;
const PROFILE_POINTS = 28;

let tunnelIdCounter = 1;

// --- profiles ---------------------------------------------------------------

/** Built-in cross-sections: 'arch' (flat floor, elliptical roof), 'round', 'box'. */
export function tunnelProfilePreset(kind, width = 6, height = 4) {
  const hw = Math.max(0.5, width / 2);
  const h = Math.max(1, height);
  const points = [];
  if (kind === 'box') {
    points.push([-hw, 0], [hw, 0], [hw, h], [-hw, h]);
  } else if (kind === 'round') {
    for (let i = 0; i < PROFILE_POINTS; i += 1) {
      const angle = (i / PROFILE_POINTS) * Math.PI * 2;
      points.push([Math.cos(angle) * hw, h / 2 + Math.sin(angle) * (h / 2)]);
    }
  } else {
    // Arch: flat floor, springline at 40% height, elliptical crown.
    const spring = h * 0.4;
    points.push([-hw, 0], [hw, 0], [hw, spring]);
    const CROWN = 16;
    for (let i = 1; i < CROWN; i += 1) {
      const angle = (i / CROWN) * Math.PI;
      points.push([Math.cos(angle) * hw, spring + Math.sin(angle) * (h - spring)]);
    }
    points.push([-hw, spring]);
  }
  return points;
}

function chaikin(points, iterations = 2) {
  let current = points;
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 1) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    current = next;
  }
  return current;
}

function resampleClosed(points, count) {
  const lengths = [0];
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(total);
  }
  if (total < 1e-6) return points.slice(0, count);
  const out = [];
  let segment = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i / count) * total;
    while (segment < points.length - 1 && lengths[segment + 1] < target) segment += 1;
    const a = points[segment];
    const b = points[(segment + 1) % points.length];
    const span = lengths[segment + 1] - lengths[segment];
    const t = span > 1e-6 ? (target - lengths[segment]) / span : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * Turns a freehand closed doodle (any 2D coordinate space, y-up) into a
 * tunnel profile: smoothed, resampled, and scaled so its bounding box is
 * exactly width × height meters with the floor at v = 0.
 */
export function normalizeTunnelProfile(rawPoints, width = 6, height = 4) {
  if (!Array.isArray(rawPoints) || rawPoints.length < 3) return tunnelProfilePreset('arch', width, height);
  const smoothed = resampleClosed(chaikin(rawPoints, 2), PROFILE_POINTS);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [u, v] of smoothed) {
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const spanU = Math.max(1e-3, maxU - minU);
  const spanV = Math.max(1e-3, maxV - minV);
  return smoothed.map(([u, v]) => [
    ((u - minU) / spanU - 0.5) * Math.max(0.5, width),
    ((v - minV) / spanV) * Math.max(1, height),
  ]);
}

function profileBounds(profile) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const [u, v] of profile) {
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  return { minU, maxU, minV, maxV };
}

function pointInProfile(profile, u, v) {
  let inside = false;
  for (let i = 0, j = profile.length - 1; i < profile.length; j = i, i += 1) {
    const [ui, vi] = profile[i];
    const [uj, vj] = profile[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) {
      inside = !inside;
    }
  }
  return inside;
}

// --- paths ------------------------------------------------------------------

function resampleOpen(points, step) {
  const out = [points[0]];
  let carried = 0;
  for (let i = 1; i < points.length; i += 1) {
    let a = out[out.length - 1];
    const b = points[i];
    let span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (carried + span >= step) {
      const t = (step - carried) / span;
      const next = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      out.push(next);
      a = next;
      span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      carried = 0;
    }
    carried += span;
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1], last[2] - tail[2]) > step * 0.25) out.push([...last]);
  else out[out.length - 1] = [...last];
  return out;
}

/**
 * Builds the tunnel path from two portal clicks and an optional doodled
 * route. `a`/`b` are world points ON the terrain ({x, y, z}); `route` is an
 * optional XZ polyline [[x,z],...] between them (endpoints are re-pinned to
 * a/b). Elevation ramps linearly along arc length from a.y to b.y.
 * `stopAt` in (0,1] truncates the bore short of b — a dead-end cave.
 * Returns { path, endOpen } with the lip extensions already baked in.
 */
export function buildTunnelPath({ a, b, route = null, stopAt = 1 } = {}) {
  const stop = Math.min(1, Math.max(0.15, Number(stopAt) || 1));
  const xz = (Array.isArray(route) && route.length >= 2 ? route : [[a.x, a.z], [b.x, b.z]])
    .map(([x, z]) => [x, z]);
  xz[0] = [a.x, a.z];
  xz[xz.length - 1] = [b.x, b.z];
  // Smooth the doodle (open-curve Chaikin: endpoints stay pinned).
  let current = xz;
  for (let pass = 0; pass < 2 && current.length > 2; pass += 1) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      const p = current[i];
      const q = current[i + 1];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  // Arc lengths → linear elevation ramp.
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < current.length; i += 1) {
    total += Math.hypot(current[i][0] - current[i - 1][0], current[i][1] - current[i - 1][1]);
    lengths.push(total);
  }
  if (total < 1) return null;
  let path = current.map(([x, z], i) => [x, a.y + (b.y - a.y) * (lengths[i] / total), z]);
  path = resampleOpen(path, PATH_STEP);
  const endOpen = stop >= 0.999;
  if (!endOpen) {
    const keep = Math.max(2, Math.round(path.length * stop));
    path = path.slice(0, keep);
  }
  // Lip extensions past open ends: the tube mouth pokes out of the hill and
  // covers the stair-stepped edges of the punched portal quads.
  const extend = (from, to) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const span = Math.hypot(dx, dy, dz) || 1;
    return [to[0] + (dx / span) * PORTAL_LIP, to[1] + (dy / span) * PORTAL_LIP, to[2] + (dz / span) * PORTAL_LIP];
  };
  path.unshift(extend(path[1], path[0]));
  if (endOpen) path.push(extend(path[path.length - 2], path[path.length - 1]));
  return { path, endOpen };
}

/** Assembles a tunnel record from a profile + built path. */
export function createTunnel({ profile, path, endOpen = true, id = null } = {}) {
  return {
    id: id ?? `tunnel_${tunnelIdCounter++}`,
    profile: profile.map(([u, v]) => [u, v]),
    path: path.map(([x, y, z]) => [x, y, z]),
    endOpen: Boolean(endOpen),
  };
}

// --- terrain punching -------------------------------------------------------

/**
 * Finds the terrain quads whose SURFACE lies inside the swept tube volume —
 * the portals plus any spot where the bore grazes the surface. Terrain
 * above or below the tube is untouched. Returns `{ holeQuads: Uint32Array }`
 * (possibly empty for a fully buried segment).
 */
export function planTunnelBore(field, tunnel) {
  const { profile, path } = tunnel;
  const { minU, maxU, minV, maxV } = profileBounds(profile);
  const reach = Math.max(Math.abs(minU), Math.abs(maxU)) + field.spacing;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, , z] of path) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const minQx = Math.max(0, Math.floor((minX - reach - field.origin.x) / field.spacing));
  const maxQx = Math.min(field.splatW - 1, Math.ceil((maxX + reach - field.origin.x) / field.spacing));
  const minQz = Math.max(0, Math.floor((minZ - reach - field.origin.z) / field.spacing));
  const maxQz = Math.min(field.splatD - 1, Math.ceil((maxZ + reach - field.origin.z) / field.spacing));

  const holeQuads = [];
  for (let qz = minQz; qz <= maxQz; qz += 1) {
    const pz = field.origin.z + (qz + 0.5) * field.spacing;
    for (let qx = minQx; qx <= maxQx; qx += 1) {
      const px = field.origin.x + (qx + 0.5) * field.spacing;
      // Nearest point on the path polyline (XZ).
      let bestDistSq = Infinity;
      let bestU = 0;
      let bestY = 0;
      for (let i = 0; i < path.length - 1; i += 1) {
        const [ax, ay, az] = path[i];
        const [bx, by, bz] = path[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq < 1e-9) continue;
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
        const cx = ax + dx * t;
        const cz = az + dz * t;
        const distSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          // Signed across-bore offset: positive toward the left of travel.
          const inv = 1 / Math.sqrt(lengthSq);
          bestU = (pz - cz) * (dx * inv) - (px - cx) * (dz * inv);
          bestY = ay + (by - ay) * t;
        }
      }
      if (bestDistSq === Infinity || bestDistSq > reach * reach) continue;
      const v = field.heightAt(px, pz) - bestY;
      // Only punch where the surface sits meaningfully INSIDE the tube.
      // Ground that merely grazes the floor line (the flat approach outside
      // an entrance) stays solid — the portal starts at the hill face.
      if (v < minV + 0.35 || v > maxV + 0.05) continue;
      if (pointInProfile(profile, bestU, v)) holeQuads.push(qz * field.splatW + qx);
    }
  }
  return { holeQuads: Uint32Array.from(holeQuads) };
}

// --- geometry ---------------------------------------------------------------

/**
 * Builds the render geometry for a tunnel:
 *   `floor` — the walkable bottom segments, world positions with GLOBAL-
 *   normalized UVs so the shared splat material lines up with the tiles;
 *   `walls` — everything else (walls/ceiling + dead-end cap), dark
 *   vertex-colored rock.
 */
export function buildTunnelGeometries(field, tunnel) {
  const { profile, path } = tunnel;
  const { minV, maxV } = profileBounds(profile);
  const spanV = Math.max(1e-3, maxV - minV);
  const count = profile.length;

  // Ground-stable frames: side vector = horizontal perpendicular of the
  // tangent, v maps straight to world Y — floors stay level through curves.
  const frames = path.map((point, i) => {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    let tx = next[0] - prev[0];
    let tz = next[2] - prev[2];
    const span = Math.hypot(tx, tz) || 1;
    tx /= span;
    tz /= span;
    return { sx: -tz, sz: tx };
  });

  const ringAt = (i, j) => {
    const [px, py, pz] = path[i];
    const { sx, sz } = frames[i];
    const [u, v] = profile[j];
    return [px + sx * u, py + v, pz + sz * u];
  };

  const floorSegment = (j) => {
    const [ua, va] = profile[j];
    const [ub, vb] = profile[(j + 1) % count];
    const low = Math.min(va, vb) - minV < spanV * 0.2;
    return low && Math.abs(ub - ua) > Math.abs(vb - va);
  };

  const floorPositions = [];
  const floorUvs = [];
  const wallPositions = [];
  const wallColors = [];
  const wallColor = (v) => {
    const t = Math.min(1, Math.max(0, (v - minV) / spanV));
    return [
      WALL_FLOOR_COLOR[0] + (WALL_CEILING_COLOR[0] - WALL_FLOOR_COLOR[0]) * t,
      WALL_FLOOR_COLOR[1] + (WALL_CEILING_COLOR[1] - WALL_FLOOR_COLOR[1]) * t,
      WALL_FLOOR_COLOR[2] + (WALL_CEILING_COLOR[2] - WALL_FLOOR_COLOR[2]) * t,
    ];
  };
  const pushFloorVertex = (point) => {
    floorPositions.push(...point);
    floorUvs.push(
      ((point[0] - field.origin.x) / field.spacing) / (field.gridW - 1),
      ((point[2] - field.origin.z) / field.spacing) / (field.gridD - 1),
    );
  };

  for (let i = 0; i < path.length - 1; i += 1) {
    for (let j = 0; j < count; j += 1) {
      const j2 = (j + 1) % count;
      const a = ringAt(i, j);
      const b = ringAt(i, j2);
      const c = ringAt(i + 1, j2);
      const d = ringAt(i + 1, j);
      if (floorSegment(j)) {
        pushFloorVertex(a); pushFloorVertex(b); pushFloorVertex(c);
        pushFloorVertex(a); pushFloorVertex(c); pushFloorVertex(d);
      } else {
        const colorA = wallColor(profile[j][1]);
        const colorB = wallColor(profile[j2][1]);
        wallPositions.push(...a, ...b, ...c, ...a, ...c, ...d);
        wallColors.push(...colorA, ...colorB, ...colorB, ...colorA, ...colorB, ...colorA);
      }
    }
  }

  // Dead-end: close the far ring with a fan (dark back wall).
  if (!tunnel.endOpen) {
    const last = path.length - 1;
    const [cx, cy, cz] = path[last];
    const center = [cx, cy + (minV + maxV) / 2, cz];
    const centerColor = wallColor((minV + maxV) / 2);
    for (let j = 0; j < count; j += 1) {
      const a = ringAt(last, j);
      const b = ringAt(last, (j + 1) % count);
      wallPositions.push(...center, ...a, ...b);
      wallColors.push(...centerColor, ...wallColor(profile[j][1]), ...wallColor(profile[(j + 1) % count][1]));
    }
  }

  const floor = new THREE.BufferGeometry();
  floor.setAttribute('position', new THREE.BufferAttribute(new Float32Array(floorPositions), 3));
  floor.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(floorUvs), 2));
  floor.computeVertexNormals();
  floor.computeBoundingBox();
  floor.computeBoundingSphere();

  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallPositions), 3));
  walls.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wallColors), 3));
  walls.computeBoundingBox();
  walls.computeBoundingSphere();

  return { floor, walls };
}

// --- serialization ----------------------------------------------------------

/** Serialized (plain-JSON-able) form of a tunnel for documents/autosave. */
export function serializeTunnel(tunnel) {
  return {
    id: tunnel.id,
    profile: tunnel.profile.map(([u, v]) => [u, v]),
    path: tunnel.path.map(([x, y, z]) => [x, y, z]),
    endOpen: Boolean(tunnel.endOpen),
  };
}

/** Rebuilds a live tunnel from its serialized form (invalid → null). */
export function deserializeTunnel(raw) {
  if (!raw || !Array.isArray(raw.profile) || !Array.isArray(raw.path)) return null;
  if (raw.profile.length < 3 || raw.path.length < 2) return null;
  const profile = raw.profile.map((point) => [Number(point?.[0]), Number(point?.[1])]);
  const path = raw.path.map((point) => [Number(point?.[0]), Number(point?.[1]), Number(point?.[2])]);
  if (profile.some((point) => point.some((value) => !Number.isFinite(value)))) return null;
  if (path.some((point) => point.some((value) => !Number.isFinite(value)))) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : `tunnel_${tunnelIdCounter++}`,
    profile,
    path,
    endOpen: raw.endOpen !== false,
  };
}
