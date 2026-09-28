// Landscape field — the editable heightfield + splat-weight data model behind
// Landscape Lab. One *global* sample brick per project (heights Float32Array,
// splat RGBA Uint8Array); tile meshes read subranges of the global arrays, so
// tile seams are impossible by construction. Everything downstream grounds on
// `heightAt(x, z)` — the same contract as stylizedTerrain — which keeps the
// existing scatter/collision/walk-preview stack working unchanged.

const DEFAULT_TILES = 2;
const DEFAULT_QUADS_PER_TILE = 128;
const DEFAULT_SPACING = 0.5;
const MAX_TILES = 8;
const MAX_GRID_SAMPLES = (MAX_TILES * DEFAULT_QUADS_PER_TILE + 1) ** 2;

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Creates an editable landscape field.
 *
 * Grid layout: `gridW = tilesX·quadsPerTile + 1` columns (x) by
 * `gridD = tilesZ·quadsPerTile + 1` rows (z), heights indexed `gz·gridW + gx`.
 * World position of sample (gx, gz) is `(origin.x + gx·spacing, origin.z +
 * gz·spacing)`. The splat brick has one RGBA texel per quad and starts fully
 * on layer 0 (R = 255).
 */
export function createLandscapeField({
  tilesX = DEFAULT_TILES,
  tilesZ = DEFAULT_TILES,
  quadsPerTile = DEFAULT_QUADS_PER_TILE,
  spacing = DEFAULT_SPACING,
  origin = null,
  heights = null,
  splat = null,
  holes = null,
  water = null,
} = {}) {
  const resolvedTilesX = clampInt(tilesX, 1, MAX_TILES, DEFAULT_TILES);
  const resolvedTilesZ = clampInt(tilesZ, 1, MAX_TILES, DEFAULT_TILES);
  const resolvedQuads = clampInt(quadsPerTile, 8, 256, DEFAULT_QUADS_PER_TILE);
  const resolvedSpacing = finitePositive(spacing, DEFAULT_SPACING);

  const gridW = resolvedTilesX * resolvedQuads + 1;
  const gridD = resolvedTilesZ * resolvedQuads + 1;
  if (gridW * gridD > MAX_GRID_SAMPLES) {
    throw new RangeError(
      `Landscape grid ${gridW}x${gridD} exceeds the ${MAX_TILES}x${MAX_TILES}-tile cap.`,
    );
  }
  const extentX = (gridW - 1) * resolvedSpacing;
  const extentZ = (gridD - 1) * resolvedSpacing;
  const resolvedOrigin = {
    x: Number.isFinite(origin?.x) ? Number(origin.x) : -extentX / 2,
    z: Number.isFinite(origin?.z) ? Number(origin.z) : -extentZ / 2,
  };

  let heightData;
  if (heights instanceof Float32Array) {
    if (heights.length !== gridW * gridD) {
      throw new RangeError(
        `Landscape heights must contain ${gridW * gridD} samples; received ${heights.length}.`,
      );
    }
    heightData = heights;
  } else {
    heightData = new Float32Array(gridW * gridD);
  }

  const splatW = gridW - 1;
  const splatD = gridD - 1;
  let splatData;
  if (splat instanceof Uint8Array) {
    if (splat.length !== splatW * splatD * 4) {
      throw new RangeError(
        `Landscape splat must contain ${splatW * splatD * 4} bytes; received ${splat.length}.`,
      );
    }
    splatData = splat;
  } else {
    splatData = new Uint8Array(splatW * splatD * 4);
    for (let i = 0; i < splatData.length; i += 4) splatData[i] = 255;
  }

  // Water mask: one byte per quad, 1 = the stage water plane applies,
  // 0 = DRY ZONE (a dug cave stays dry below the waterline; only the deeper
  // groundwater level can flood it).
  let waterData;
  if (water instanceof Uint8Array) {
    if (water.length !== splatW * splatD) {
      throw new RangeError(
        `Landscape water mask must contain ${splatW * splatD} bytes; received ${water.length}.`,
      );
    }
    waterData = water;
  } else {
    waterData = new Uint8Array(splatW * splatD).fill(1);
  }

  // Terrain holes, ToonLab convention: one byte per quad, 1 = solid, 0 = hole.
  // Holes are how caves/tunnels work on a heightfield (the ToonLab approach):
  // punch through the surface, then build the interior from placed meshes.
  let holeData;
  if (holes instanceof Uint8Array) {
    if (holes.length !== splatW * splatD) {
      throw new RangeError(
        `Landscape holes must contain ${splatW * splatD} bytes; received ${holes.length}.`,
      );
    }
    holeData = holes;
  } else {
    holeData = new Uint8Array(splatW * splatD).fill(1);
  }

  // Approximate vertical bounds for the analytic raycast. Expanded on writes,
  // never shrunk mid-session — a slightly generous march window is harmless.
  const heightBounds = { min: 0, max: 0 };
  for (let i = 0; i < heightData.length; i += 1) {
    const h = heightData[i];
    if (h < heightBounds.min) heightBounds.min = h;
    if (h > heightBounds.max) heightBounds.max = h;
  }

  const field = {
    tilesX: resolvedTilesX,
    tilesZ: resolvedTilesZ,
    quadsPerTile: resolvedQuads,
    spacing: resolvedSpacing,
    origin: resolvedOrigin,
    gridW,
    gridD,
    extentX,
    extentZ,
    heights: heightData,
    splat: splatData,
    holes: holeData,
    water: waterData,
    splatW,
    splatD,
    heightBounds,
  };

  /** True when the quad under world (x, z) is punched out. */
  field.isHole = (x, z) => {
    const qx = Math.floor((x - resolvedOrigin.x) / resolvedSpacing);
    const qz = Math.floor((z - resolvedOrigin.z) / resolvedSpacing);
    if (qx < 0 || qz < 0 || qx >= splatW || qz >= splatD) return false;
    return holeData[qz * splatW + qx] === 0;
  };

  /** True when world (x, z) is painted as a dry zone (no stage water). */
  field.isDry = (x, z) => {
    const qx = Math.floor((x - resolvedOrigin.x) / resolvedSpacing);
    const qz = Math.floor((z - resolvedOrigin.z) / resolvedSpacing);
    if (qx < 0 || qz < 0 || qx >= splatW || qz >= splatD) return false;
    return waterData[qz * splatW + qx] === 0;
  };

  field.indexOf = (gx, gz) => gz * gridW + gx;

  /** World → continuous grid coordinates (unclamped). */
  field.worldToGrid = (x, z) => ({
    gx: (x - resolvedOrigin.x) / resolvedSpacing,
    gz: (z - resolvedOrigin.z) / resolvedSpacing,
  });

  field.gridToWorld = (gx, gz) => ({
    x: resolvedOrigin.x + gx * resolvedSpacing,
    z: resolvedOrigin.z + gz * resolvedSpacing,
  });

  field.contains = (x, z) => (
    x >= resolvedOrigin.x && x <= resolvedOrigin.x + extentX
    && z >= resolvedOrigin.z && z <= resolvedOrigin.z + extentZ
  );

  /** Bilinear world-space height sample; clamps to the field edge. */
  field.heightAt = (x, z) => {
    const gx = Math.min(gridW - 1.000001, Math.max(0, (x - resolvedOrigin.x) / resolvedSpacing));
    const gz = Math.min(gridD - 1.000001, Math.max(0, (z - resolvedOrigin.z) / resolvedSpacing));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const row = z0 * gridW + x0;
    const h00 = heightData[row];
    const h10 = heightData[row + 1];
    const h01 = heightData[row + gridW];
    const h11 = heightData[row + gridW + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  };

  /**
   * Central-difference surface normal, matching the GPU/geometry normals:
   * normalize(-dH/dx, 1, -dH/dz).
   */
  field.normalAt = (x, z, out = { x: 0, y: 1, z: 0 }) => {
    const step = resolvedSpacing;
    const dx = (field.heightAt(x + step, z) - field.heightAt(x - step, z)) / (2 * step);
    const dz = (field.heightAt(x, z + step) - field.heightAt(x, z - step)) / (2 * step);
    const inverseLength = 1 / Math.hypot(dx, 1, dz);
    out.x = -dx * inverseLength;
    out.y = inverseLength;
    out.z = -dz * inverseLength;
    return out;
  };

  /** Slope magnitude (rise over run) at a world position. */
  field.slopeAt = (x, z) => {
    const step = resolvedSpacing;
    const dx = (field.heightAt(x + step, z) - field.heightAt(x - step, z)) / (2 * step);
    const dz = (field.heightAt(x, z + step) - field.heightAt(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  };

  field.expandHeightBounds = (value) => {
    if (value < heightBounds.min) heightBounds.min = value;
    if (value > heightBounds.max) heightBounds.max = value;
  };

  /**
   * Analytic heightfield raycast: march the ray inside the field's AABB and
   * bisect the first above→below crossing. Immune to stale mesh bounds during
   * active sculpting, and far cheaper than triangle raycasts on 32k-tri tiles.
   * Returns `{ point: {x, y, z}, distance }` or null.
   */
  field.raycast = (rayOrigin, rayDirection, { maxDistance = 4000 } = {}) => {
    const pad = resolvedSpacing;
    const minX = resolvedOrigin.x - pad;
    const maxX = resolvedOrigin.x + extentX + pad;
    const minZ = resolvedOrigin.z - pad;
    const maxZ = resolvedOrigin.z + extentZ + pad;
    const minY = heightBounds.min - 1;
    const maxY = heightBounds.max + 1;

    let t0 = 0;
    let t1 = maxDistance;
    const axes = [
      [rayOrigin.x, rayDirection.x, minX, maxX],
      [rayOrigin.y, rayDirection.y, minY, maxY],
      [rayOrigin.z, rayDirection.z, minZ, maxZ],
    ];
    for (const [start, direction, minValue, maxValue] of axes) {
      if (Math.abs(direction) < 1e-9) {
        if (start < minValue || start > maxValue) return null;
        continue;
      }
      let near = (minValue - start) / direction;
      let far = (maxValue - start) / direction;
      if (near > far) [near, far] = [far, near];
      t0 = Math.max(t0, near);
      t1 = Math.min(t1, far);
      if (t0 > t1) return null;
    }

    const above = (t) => {
      const x = rayOrigin.x + rayDirection.x * t;
      const z = rayOrigin.z + rayDirection.z * t;
      return (rayOrigin.y + rayDirection.y * t) - field.heightAt(x, z);
    };

    // Height bounds are approximate (expanded on writes); if the ray enters
    // the slab already "below" the surface, remarch from the ray origin so a
    // stale bound can only cost time, never a miss.
    if (above(t0) <= 0 && above(0) > 0) t0 = 0;
    const step = Math.max(resolvedSpacing * 0.75, (t1 - t0) / 512);
    let previousT = t0;
    let previousAbove = above(t0) > 0;
    if (!previousAbove) return null; // genuinely starts under the terrain
    for (let t = t0 + step; t <= t1 + step; t += step) {
      const clamped = Math.min(t, t1);
      const nowAbove = above(clamped) > 0;
      if (nowAbove !== previousAbove) {
        // Bisect the crossing for a stable brush cursor.
        let low = previousT;
        let high = clamped;
        for (let i = 0; i < 24; i += 1) {
          const mid = (low + high) / 2;
          if ((above(mid) > 0) === previousAbove) low = mid;
          else high = mid;
        }
        const hitT = (low + high) / 2;
        const x = rayOrigin.x + rayDirection.x * hitT;
        const z = rayOrigin.z + rayDirection.z * hitT;
        // Only downward (front-face) crossings on SOLID quads are hits.
        // Punched-out quads are open air — the ray passes through and keeps
        // marching, so cursors/brushes work inside cave openings; upward
        // crossings just flip the state (exiting a hillside from below).
        if (previousAbove && !field.isHole(x, z)) {
          return { distance: hitT, point: { x, y: field.heightAt(x, z), z } };
        }
        previousAbove = nowAbove;
      }
      if (clamped >= t1) break;
      previousT = clamped;
    }
    return null;
  };

  return field;
}

/** Merge two grid-index dirty rects ({minX, minZ, maxX, maxZ}, inclusive). */
export function mergeDirtyRects(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return {
    minX: Math.min(a.minX, b.minX),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

/** Tile coordinates whose geometry a grid-space dirty rect touches. */
export function tilesForDirtyRect(field, rect, { normalMargin = 1 } = {}) {
  if (!rect) return [];
  const quads = field.quadsPerTile;
  const minTx = Math.max(0, Math.floor((rect.minX - normalMargin) / quads));
  const maxTx = Math.min(field.tilesX - 1, Math.floor((rect.maxX + normalMargin - 1e-9) / quads));
  const minTz = Math.max(0, Math.floor((rect.minZ - normalMargin) / quads));
  const maxTz = Math.min(field.tilesZ - 1, Math.floor((rect.maxZ + normalMargin - 1e-9) / quads));
  const tiles = [];
  for (let tz = minTz; tz <= maxTz; tz += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) tiles.push({ tx, tz });
  }
  return tiles;
}
