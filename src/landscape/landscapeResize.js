// Terrain resize — the Photoshop canvas-size operation generalized to tiles.
// A new (tilesX × tilesZ) field is created and the EXISTING tile block is
// placed at a per-axis tile offset chosen by the user (the placement canvas
// in the lab UI). Growing an axis adds flat tiles; SHRINKING an axis crops —
// the offset then selects which slice of the existing terrain is kept
// (offset ≤ 0: the block hangs off the new grid and the overlap survives).
// The origin shifts so kept terrain stays at its exact WORLD position.

import { createLandscapeField } from './landscapeField.js';

/**
 * Returns a NEW field of (tilesX × tilesZ) tiles with the overlapping slice
 * of `field` copied in at (offsetTilesX, offsetTilesZ). Valid offsets per
 * axis span [min(0, new−old), max(0, new−old)]; sizes span 1..8 tiles.
 */
export function resizeLandscapeField(field, {
  tilesX,
  tilesZ,
  offsetTilesX = 0,
  offsetTilesZ = 0,
} = {}) {
  const nextTilesX = Math.round(Number(tilesX));
  const nextTilesZ = Math.round(Number(tilesZ));
  const offsetX = Math.round(Number(offsetTilesX));
  const offsetZ = Math.round(Number(offsetTilesZ));
  if (!Number.isInteger(nextTilesX) || !Number.isInteger(nextTilesZ)
    || nextTilesX < 1 || nextTilesZ < 1) {
    throw new RangeError('Terrain resize needs tile counts of at least 1.');
  }
  const clampLoX = Math.min(0, nextTilesX - field.tilesX);
  const clampHiX = Math.max(0, nextTilesX - field.tilesX);
  const clampLoZ = Math.min(0, nextTilesZ - field.tilesZ);
  const clampHiZ = Math.max(0, nextTilesZ - field.tilesZ);
  if (offsetX < clampLoX || offsetX > clampHiX || offsetZ < clampLoZ || offsetZ > clampHiZ) {
    throw new RangeError('The existing terrain must overlap the new grid at that placement.');
  }

  const quads = field.quadsPerTile;
  const next = createLandscapeField({
    tilesX: nextTilesX,
    tilesZ: nextTilesZ,
    quadsPerTile: quads,
    spacing: field.spacing,
    origin: {
      x: field.origin.x - offsetX * quads * field.spacing,
      z: field.origin.z - offsetZ * quads * field.spacing,
    },
  });

  // Clipped copy windows (offsets may be negative when cropping).
  const sampleOffsetX = offsetX * quads;
  const sampleOffsetZ = offsetZ * quads;
  const srcStartX = Math.max(0, -sampleOffsetX);
  const dstStartX = Math.max(0, sampleOffsetX);
  const srcStartZ = Math.max(0, -sampleOffsetZ);
  const dstStartZ = Math.max(0, sampleOffsetZ);
  const copyW = Math.min(field.gridW - srcStartX, next.gridW - dstStartX);
  const copyD = Math.min(field.gridD - srcStartZ, next.gridD - dstStartZ);
  for (let row = 0; row < copyD; row += 1) {
    const sourceRow = (srcStartZ + row) * field.gridW + srcStartX;
    const targetRow = (dstStartZ + row) * next.gridW + dstStartX;
    next.heights.set(field.heights.subarray(sourceRow, sourceRow + copyW), targetRow);
  }
  let min = 0;
  let max = 0;
  for (let i = 0; i < next.heights.length; i += 1) {
    const h = next.heights[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  next.heightBounds.min = min;
  next.heightBounds.max = max;

  // Splat + holes: per-quad windows (one fewer sample per axis).
  const quadCopyW = Math.min(field.splatW - srcStartX, next.splatW - dstStartX);
  const quadCopyD = Math.min(field.splatD - srcStartZ, next.splatD - dstStartZ);
  for (let row = 0; row < quadCopyD; row += 1) {
    const sourceRow = (srcStartZ + row) * field.splatW + srcStartX;
    const targetRow = (dstStartZ + row) * next.splatW + dstStartX;
    next.splat.set(
      field.splat.subarray(sourceRow * 4, (sourceRow + quadCopyW) * 4),
      targetRow * 4,
    );
    next.holes.set(field.holes.subarray(sourceRow, sourceRow + quadCopyW), targetRow);
    next.water.set(field.water.subarray(sourceRow, sourceRow + quadCopyW), targetRow);
  }

  return next;
}
