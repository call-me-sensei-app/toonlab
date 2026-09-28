// Sculpt edits: brush strokes stored in the document as sphere/capsule SDF
// operations, applied after the piece fold. Keeping strokes as data (rather
// than baked vertex offsets) makes undo a list pop, keeps save/load free,
// and means export-resolution re-meshing includes sculpting with no bake.

import { opSmoothSubtract, opSmoothUnion } from './sdfOps.js';

/** Distance to a sculpt edit's brush volume (sphere, or capsule segment). */
export function evaluateSculptEdit(edit, x, y, z) {
  const [cx, cy, cz] = edit.center;
  let px = x - cx;
  let py = y - cy;
  let pz = z - cz;
  if (edit.shape === 'capsule' && edit.end) {
    const bx = edit.end[0] - cx;
    const by = edit.end[1] - cy;
    const bz = edit.end[2] - cz;
    const lengthSq = bx * bx + by * by + bz * bz;
    if (lengthSq > 0) {
      const t = Math.min(Math.max((px * bx + py * by + pz * bz) / lengthSq, 0), 1);
      px -= bx * t;
      py -= by * t;
      pz -= bz * t;
    }
  }
  return Math.sqrt(px * px + py * py + pz * pz) - edit.radius;
}

/** Applies one edit to the folded field value. */
export function applySculptEditToField(edit, d, editDistance) {
  return edit.tool === 'subtract'
    ? opSmoothSubtract(d, editDistance, edit.blend)
    : opSmoothUnion(d, editDistance, edit.blend);
}

/** World-space AABB of an edit, padded by its blend radius. */
export function sculptEditBounds(edit) {
  const pad = edit.radius + Math.max(edit.blend, 0);
  const min = [edit.center[0] - pad, edit.center[1] - pad, edit.center[2] - pad];
  const max = [edit.center[0] + pad, edit.center[1] + pad, edit.center[2] + pad];
  if (edit.shape === 'capsule' && edit.end) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], edit.end[axis] - pad);
      max[axis] = Math.max(max[axis], edit.end[axis] + pad);
    }
  }
  return { max, min };
}

/**
 * Builds one capsule edit for a pointer-drag segment (from -> to). The lab
 * emits one of these per stroke sample instead of a sphere per pointermove,
 * keeping documents at ~10-30 edits per stroke. The id is assigned by
 * applySculptEdit (rockDocument.js) so ids stay unique per document.
 */
export function createStrokeEdit({ blend = 0, from, to = null, radius, tool = 'add' }) {
  return {
    blend: Math.max(Number(blend) || 0, 0),
    center: [...from],
    end: to ? [...to] : null,
    id: null,
    radius: Math.max(Number(radius) || 0.1, 0.001),
    shape: to ? 'capsule' : 'sphere',
    tool: tool === 'subtract' ? 'subtract' : 'add',
  };
}
