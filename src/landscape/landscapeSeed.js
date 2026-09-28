// Seed-from-archetype: bake the analytic procedural terrain
// (createStylizedTerrain) into the editable landscape brick. Emitted as a
// normal terrain command so seeding is a single undoable history entry —
// projects start flat, and one click hands the user a sculptable archetype.

import { createStylizedTerrain } from '../stylizedTerrain.js';
import { beginStroke, commitStroke } from './landscapeBrushes.js';

/**
 * Samples an archetype's `heightAt` across the whole field. Returns
 * `{ command, waterLevel }` (command null if the bake changed nothing);
 * the caller applies/commits it like any brush stroke.
 */
export function seedFieldFromArchetype(field, {
  archetype = 'lushKarst',
  seed = 1,
  heightScale = 1,
} = {}) {
  const terrain = createStylizedTerrain({
    archetype,
    seed,
    size: Math.max(field.extentX, field.extentZ),
    // Only heightAt is consumed; keep the throwaway mesh minimal.
    segments: 16,
  });
  const stroke = beginStroke(field);
  try {
    const { heights, gridW, gridD } = field;
    for (let gz = 0; gz < gridD; gz += 1) {
      for (let gx = 0; gx < gridW; gx += 1) {
        const world = field.gridToWorld(gx, gz);
        const next = terrain.heightAt(world.x, world.z) * heightScale;
        const index = gz * gridW + gx;
        if (heights[index] === next) continue;
        if (!stroke.before.has(index)) stroke.before.set(index, heights[index]);
        heights[index] = next;
        field.expandHeightBounds(next);
      }
    }
    stroke.dirtyRect = { minX: 0, minZ: 0, maxX: gridW - 1, maxZ: gridD - 1 };
    return {
      command: commitStroke(field, stroke),
      waterLevel: Number.isFinite(terrain.waterLevel) ? terrain.waterLevel * heightScale : null,
    };
  } finally {
    terrain.dispose?.();
  }
}
