// Landscape sculpt + splat brushes. Pure functions over a landscape field:
// a stroke lazily captures before-values per touched sample, pointer samples
// mutate the field in place, and pointerup commits the stroke into a compact
// invertible command { indices, before, after } — the terrain half of the
// lab's hybrid undo history (settings stay JSON snapshots, bulk edits are
// commands).

import { periodicFbm2 } from '../texgen/noise2.js';

import { mergeDirtyRects } from './landscapeField.js';

// World-anchored noise period in noise-space units. Large enough that the
// brush never meets its own tiling inside the max 8x8-tile field.
const NOISE_PERIOD = 4096;

function smoothstep(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Brush falloff weight for a sample `d` meters from the brush center.
 * `hardness` 0 feathers from the center; 1 is a hard-edged disc.
 */
export function brushFalloff(d, radius, hardness = 0.5) {
  if (d >= radius) return 0;
  const flat = radius * Math.min(0.999, Math.max(0, hardness));
  if (d <= flat) return 1;
  return smoothstep(1 - (d - flat) / (radius - flat));
}

/** Starts a sculpt stroke: lazy before-capture plus a running dirty rect. */
export function beginStroke(field) {
  return { field, before: new Map(), dirtyRect: null, kind: 'terrain' };
}

function recordBefore(stroke, index, value) {
  if (!stroke.before.has(index)) stroke.before.set(index, value);
}

/**
 * Brush distance metric: euclidean for the round brush, chebyshev for the
 * square one (a square brush's "distance" is the max axis offset, so the
 * falloff runs parallel to the edges).
 */
export function brushDistance(dx, dz, shape = 'round') {
  return shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
}

function forEachSampleInDisc(field, x, z, radius, callback, shape = 'round') {
  const { gridW, gridD, spacing, origin } = field;
  const minGx = Math.max(0, Math.floor((x - radius - origin.x) / spacing));
  const maxGx = Math.min(gridW - 1, Math.ceil((x + radius - origin.x) / spacing));
  const minGz = Math.max(0, Math.floor((z - radius - origin.z) / spacing));
  const maxGz = Math.min(gridD - 1, Math.ceil((z + radius - origin.z) / spacing));
  if (minGx > maxGx || minGz > maxGz) return null;
  for (let gz = minGz; gz <= maxGz; gz += 1) {
    const sampleZ = origin.z + gz * spacing;
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      const sampleX = origin.x + gx * spacing;
      const d = brushDistance(sampleX - x, sampleZ - z, shape);
      if (d >= radius) continue;
      callback(gz * gridW + gx, gx, gz, d, sampleX, sampleZ);
    }
  }
  return { minX: minGx, minZ: minGz, maxX: maxGx, maxZ: maxGz };
}

/**
 * Applies one pointer sample of a sculpt tool. Mutates `field.heights`,
 * records before-values into the stroke, and returns the sample's grid dirty
 * rect (null when the brush missed the field entirely).
 *
 * Tools: `raise` (± via strength sign), `smooth`, `flatten` (toward
 * `flattenTarget`, defaulting to the stroke's first sampled height), `noise`
 * (world-anchored seeded fbm), `terrace` (quantize toward `terraceStep`
 * bands).
 */
export function applyBrushSample(field, stroke, {
  tool = 'raise',
  x,
  z,
  radius = 5,
  strength = 0.5,
  hardness = 0.5,
  shape = 'round',
  flattenTarget = null,
  seed = 1,
  noiseScale = 0.08,
  noiseAmplitude = 2,
  terraceStep = 2,
} = {}) {
  const { heights, gridW } = field;
  const target = tool === 'flatten'
    ? (Number.isFinite(flattenTarget) ? flattenTarget : field.heightAt(x, z))
    : 0;

  let smoothSource = null;
  let smoothRect = null;
  if (tool === 'smooth') {
    // Read the pre-sample neighborhood once so the kernel never reads its own
    // writes inside a single sample.
    smoothRect = {
      minGx: Math.max(0, Math.floor((x - radius - field.origin.x) / field.spacing) - 1),
      minGz: Math.max(0, Math.floor((z - radius - field.origin.z) / field.spacing) - 1),
    };
    const maxGx = Math.min(gridW - 1, Math.ceil((x + radius - field.origin.x) / field.spacing) + 1);
    const maxGz = Math.min(field.gridD - 1, Math.ceil((z + radius - field.origin.z) / field.spacing) + 1);
    smoothRect.width = maxGx - smoothRect.minGx + 1;
    smoothRect.depth = maxGz - smoothRect.minGz + 1;
    smoothSource = new Float32Array(smoothRect.width * smoothRect.depth);
    for (let gz = 0; gz < smoothRect.depth; gz += 1) {
      for (let gx = 0; gx < smoothRect.width; gx += 1) {
        smoothSource[gz * smoothRect.width + gx] = heights[
          (smoothRect.minGz + gz) * gridW + (smoothRect.minGx + gx)
        ];
      }
    }
  }

  const rect = forEachSampleInDisc(field, x, z, radius, (index, gx, gz, d) => {
    const weight = brushFalloff(d, radius, hardness);
    if (weight <= 0) return;
    const current = heights[index];
    let next = current;
    if (tool === 'raise') {
      next = current + strength * weight;
    } else if (tool === 'flatten') {
      next = current + (target - current) * Math.min(1, Math.abs(strength)) * weight;
    } else if (tool === 'smooth') {
      const lx = gx - smoothRect.minGx;
      const lz = gz - smoothRect.minGz;
      let sum = 0;
      let count = 0;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = lx + dx;
          const sz = lz + dz;
          if (sx < 0 || sz < 0 || sx >= smoothRect.width || sz >= smoothRect.depth) continue;
          sum += smoothSource[sz * smoothRect.width + sx];
          count += 1;
        }
      }
      next = current + (sum / count - current) * Math.min(1, Math.abs(strength)) * weight;
    } else if (tool === 'noise') {
      const sample = field.gridToWorld(gx, gz);
      const noise = periodicFbm2(
        seed,
        (sample.x - field.origin.x) * noiseScale,
        (sample.z - field.origin.z) * noiseScale,
        NOISE_PERIOD,
        NOISE_PERIOD,
      );
      next = current + (noise - 0.5) * 2 * noiseAmplitude * Math.abs(strength) * weight;
    } else if (tool === 'terrace') {
      const step = Math.max(0.05, terraceStep);
      const banded = Math.round(current / step) * step;
      next = current + (banded - current) * Math.min(1, Math.abs(strength)) * weight;
    }
    if (next === current) return;
    recordBefore(stroke, index, current);
    heights[index] = next;
    field.expandHeightBounds(next);
  }, shape);

  if (rect && stroke.before.size) stroke.dirtyRect = mergeDirtyRects(stroke.dirtyRect, rect);
  return rect;
}

/**
 * One-shot ramp gesture: linearly interpolate heights along the from→to
 * segment inside `width`, feathered at the edges. Applied as a single stroke
 * sample so it commits like any other brush.
 */
export function applyRamp(field, stroke, {
  fromX, fromZ, fromH, toX, toZ, toH, width = 4, hardness = 0.4, strength = 1,
} = {}) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-8) return null;
  const { heights, gridW } = field;
  const pad = width;
  const minX = Math.min(fromX, toX) - pad;
  const maxX = Math.max(fromX, toX) + pad;
  const minZ = Math.min(fromZ, toZ) - pad;
  const maxZ = Math.max(fromZ, toZ) + pad;
  const minGx = Math.max(0, Math.floor((minX - field.origin.x) / field.spacing));
  const maxGx = Math.min(gridW - 1, Math.ceil((maxX - field.origin.x) / field.spacing));
  const minGz = Math.max(0, Math.floor((minZ - field.origin.z) / field.spacing));
  const maxGz = Math.min(field.gridD - 1, Math.ceil((maxZ - field.origin.z) / field.spacing));
  if (minGx > maxGx || minGz > maxGz) return null;

  for (let gz = minGz; gz <= maxGz; gz += 1) {
    const sampleZ = field.origin.z + gz * field.spacing;
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      const sampleX = field.origin.x + gx * field.spacing;
      const t = Math.min(1, Math.max(0, ((sampleX - fromX) * dx + (sampleZ - fromZ) * dz) / lengthSq));
      const nearestX = fromX + dx * t;
      const nearestZ = fromZ + dz * t;
      const d = Math.hypot(sampleX - nearestX, sampleZ - nearestZ);
      const weight = brushFalloff(d, width, hardness) * Math.min(1, Math.abs(strength));
      if (weight <= 0) continue;
      const index = gz * gridW + gx;
      const current = heights[index];
      const rampHeight = fromH + (toH - fromH) * t;
      const next = current + (rampHeight - current) * weight;
      if (next === current) continue;
      recordBefore(stroke, index, current);
      heights[index] = next;
      field.expandHeightBounds(next);
    }
  }
  const rect = { minX: minGx, minZ: minGz, maxX: maxGx, maxZ: maxGz };
  if (stroke.before.size) stroke.dirtyRect = mergeDirtyRects(stroke.dirtyRect, rect);
  return rect;
}

/**
 * Freezes a stroke into an invertible terrain command. Unchanged samples are
 * dropped; returns null when the stroke touched nothing.
 */
export function commitStroke(field, stroke) {
  const entries = [];
  for (const [index, before] of stroke.before) {
    const after = field.heights[index];
    if (after !== before) entries.push([index, before, after]);
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a[0] - b[0]);
  const indices = new Uint32Array(entries.length);
  const before = new Float32Array(entries.length);
  const after = new Float32Array(entries.length);
  entries.forEach(([index, beforeValue, afterValue], i) => {
    indices[i] = index;
    before[i] = beforeValue;
    after[i] = afterValue;
  });
  return { kind: 'terrain', indices, before, after, dirtyRect: { ...stroke.dirtyRect } };
}

function rectForIndices(field, indices) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < indices.length; i += 1) {
    const gx = indices[i] % field.gridW;
    const gz = Math.floor(indices[i] / field.gridW);
    if (gx < minX) minX = gx;
    if (gx > maxX) maxX = gx;
    if (gz < minZ) minZ = gz;
    if (gz > maxZ) maxZ = gz;
  }
  return { minX, minZ, maxX, maxZ };
}

/** Re-applies a committed terrain command (redo). Returns its dirty rect. */
export function applyCommand(field, command) {
  for (let i = 0; i < command.indices.length; i += 1) {
    field.heights[command.indices[i]] = command.after[i];
    field.expandHeightBounds(command.after[i]);
  }
  return command.dirtyRect ?? rectForIndices(field, command.indices);
}

/** Reverts a committed terrain command (undo). Returns its dirty rect. */
export function revertCommand(field, command) {
  for (let i = 0; i < command.indices.length; i += 1) {
    field.heights[command.indices[i]] = command.before[i];
    field.expandHeightBounds(command.before[i]);
  }
  return command.dirtyRect ?? rectForIndices(field, command.indices);
}

// --- Hole punching -----------------------------------------------------------
// Holes are hard-edged per-quad (no falloff): 0 = punched out, 1 = solid.
// This is the cave/tunnel workflow — punch through the surface, then build
// the interior out of placed meshes.

/** Starts a hole stroke; before-values are captured per quad. */
export function beginHoleStroke(field) {
  return { field, before: new Map(), dirtyRect: null, kind: 'holes' };
}

/** Punches (restore=false) or restores (restore=true) quads in the disc. */
export function applyHoleSample(field, stroke, {
  x,
  z,
  radius = 5,
  restore = false,
  shape = 'round',
} = {}) {
  const { holes, splatW, splatD, spacing, origin } = field;
  const target = restore ? 1 : 0;
  const minQx = Math.max(0, Math.floor((x - radius - origin.x) / spacing - 0.5));
  const maxQx = Math.min(splatW - 1, Math.ceil((x + radius - origin.x) / spacing - 0.5));
  const minQz = Math.max(0, Math.floor((z - radius - origin.z) / spacing - 0.5));
  const maxQz = Math.min(splatD - 1, Math.ceil((z + radius - origin.z) / spacing - 0.5));
  if (minQx > maxQx || minQz > maxQz) return null;
  for (let qz = minQz; qz <= maxQz; qz += 1) {
    const centerZ = origin.z + (qz + 0.5) * spacing;
    for (let qx = minQx; qx <= maxQx; qx += 1) {
      const centerX = origin.x + (qx + 0.5) * spacing;
      if (brushDistance(centerX - x, centerZ - z, shape) >= radius) continue;
      const quad = qz * splatW + qx;
      if (holes[quad] === target) continue;
      if (!stroke.before.has(quad)) stroke.before.set(quad, holes[quad]);
      holes[quad] = target;
    }
  }
  const rect = { minX: minQx, minZ: minQz, maxX: maxQx, maxZ: maxQz };
  if (stroke.before.size) stroke.dirtyRect = mergeDirtyRects(stroke.dirtyRect, rect);
  return rect;
}

export function commitHoleStroke(field, stroke) {
  const entries = [];
  for (const [quad, before] of stroke.before) {
    const after = field.holes[quad];
    if (after !== before) entries.push([quad, before, after]);
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a[0] - b[0]);
  const indices = new Uint32Array(entries.length);
  const before = new Uint8Array(entries.length);
  const after = new Uint8Array(entries.length);
  entries.forEach(([quad, beforeValue, afterValue], i) => {
    indices[i] = quad;
    before[i] = beforeValue;
    after[i] = afterValue;
  });
  return { kind: 'holes', indices, before, after, dirtyRect: { ...stroke.dirtyRect } };
}

export function applyHoleCommand(field, command) {
  for (let i = 0; i < command.indices.length; i += 1) {
    field.holes[command.indices[i]] = command.after[i];
  }
  return command.dirtyRect;
}

export function revertHoleCommand(field, command) {
  for (let i = 0; i < command.indices.length; i += 1) {
    field.holes[command.indices[i]] = command.before[i];
  }
  return command.dirtyRect;
}

// --- Dry-zone painting -------------------------------------------------------
// Per-quad water mask, hole-style hard edges: 0 = dry (the stage water plane
// is suppressed — dug caves stay dry), 1 = watered. `restore` re-wets.

export function beginWaterStroke(field) {
  return { field, before: new Map(), dirtyRect: null, kind: 'water' };
}

export function applyWaterSample(field, stroke, {
  x,
  z,
  radius = 5,
  restore = false,
  shape = 'round',
} = {}) {
  const { water, splatW, splatD, spacing, origin } = field;
  const target = restore ? 1 : 0;
  const minQx = Math.max(0, Math.floor((x - radius - origin.x) / spacing - 0.5));
  const maxQx = Math.min(splatW - 1, Math.ceil((x + radius - origin.x) / spacing - 0.5));
  const minQz = Math.max(0, Math.floor((z - radius - origin.z) / spacing - 0.5));
  const maxQz = Math.min(splatD - 1, Math.ceil((z + radius - origin.z) / spacing - 0.5));
  if (minQx > maxQx || minQz > maxQz) return null;
  for (let qz = minQz; qz <= maxQz; qz += 1) {
    const centerZ = origin.z + (qz + 0.5) * spacing;
    for (let qx = minQx; qx <= maxQx; qx += 1) {
      const centerX = origin.x + (qx + 0.5) * spacing;
      if (brushDistance(centerX - x, centerZ - z, shape) >= radius) continue;
      const quad = qz * splatW + qx;
      if (water[quad] === target) continue;
      if (!stroke.before.has(quad)) stroke.before.set(quad, water[quad]);
      water[quad] = target;
    }
  }
  const rect = { minX: minQx, minZ: minQz, maxX: maxQx, maxZ: maxQz };
  if (stroke.before.size) stroke.dirtyRect = mergeDirtyRects(stroke.dirtyRect, rect);
  return rect;
}

export function commitWaterStroke(field, stroke) {
  const entries = [];
  for (const [quad, before] of stroke.before) {
    const after = field.water[quad];
    if (after !== before) entries.push([quad, before, after]);
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a[0] - b[0]);
  const indices = new Uint32Array(entries.length);
  const before = new Uint8Array(entries.length);
  const after = new Uint8Array(entries.length);
  entries.forEach(([quad, beforeValue, afterValue], i) => {
    indices[i] = quad;
    before[i] = beforeValue;
    after[i] = afterValue;
  });
  return { kind: 'water', indices, before, after, dirtyRect: { ...stroke.dirtyRect } };
}

export function applyWaterCommand(field, command) {
  for (let i = 0; i < command.indices.length; i += 1) {
    field.water[command.indices[i]] = command.after[i];
  }
  return command.dirtyRect;
}

export function revertWaterCommand(field, command) {
  for (let i = 0; i < command.indices.length; i += 1) {
    field.water[command.indices[i]] = command.before[i];
  }
  return command.dirtyRect;
}

// --- Splat painting ----------------------------------------------------------

/** Starts a splat stroke; before-values are captured as packed RGBA. */
export function beginSplatStroke(field) {
  return { field, before: new Map(), dirtyRect: null, kind: 'splat' };
}

function packSplat(splat, offset) {
  return (splat[offset] << 24 >>> 0)
    | (splat[offset + 1] << 16)
    | (splat[offset + 2] << 8)
    | splat[offset + 3];
}

/**
 * Paints one pointer sample of splat weight toward `layer` (0-3). Weights are
 * renormalized so each texel's channels always sum to 255. Negative
 * `strength` erases the layer instead (its weight redistributes to the other
 * channels, ToonLab-style Shift-erase).
 */
export function applySplatSample(field, stroke, {
  layer = 0,
  x,
  z,
  radius = 5,
  strength = 0.5,
  hardness = 0.5,
  shape = 'round',
} = {}) {
  const { splat, splatW, splatD, spacing, origin } = field;
  const channel = Math.min(3, Math.max(0, Math.round(layer)));
  // Texel (i, j) covers quad (i, j); its center sits half a quad in.
  const minTx = Math.max(0, Math.floor((x - radius - origin.x) / spacing - 0.5));
  const maxTx = Math.min(splatW - 1, Math.ceil((x + radius - origin.x) / spacing - 0.5));
  const minTz = Math.max(0, Math.floor((z - radius - origin.z) / spacing - 0.5));
  const maxTz = Math.min(splatD - 1, Math.ceil((z + radius - origin.z) / spacing - 0.5));
  if (minTx > maxTx || minTz > maxTz) return null;

  for (let tz = minTz; tz <= maxTz; tz += 1) {
    const centerZ = origin.z + (tz + 0.5) * spacing;
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const centerX = origin.x + (tx + 0.5) * spacing;
      const d = brushDistance(centerX - x, centerZ - z, shape);
      const weight = brushFalloff(d, radius, hardness);
      if (weight <= 0) continue;
      const texel = tz * splatW + tx;
      const offset = texel * 4;
      const currentTarget = splat[offset + channel] / 255;
      const nextTarget = strength >= 0
        ? Math.min(1, currentTarget + strength * weight)
        : Math.max(0, currentTarget + strength * weight);
      if (nextTarget === currentTarget) continue;
      if (!stroke.before.has(texel)) stroke.before.set(texel, packSplat(splat, offset));
      // Rebalance the other channels so the texel keeps summing to 255. When
      // the painted channel was saturated (others all zero) an erase has no
      // proportions to scale — split the freed weight evenly instead.
      const remaining = 1 - currentTarget;
      let sum = 0;
      for (let c = 0; c < 4; c += 1) {
        let value;
        if (c === channel) {
          value = Math.round(nextTarget * 255);
        } else if (remaining > 0) {
          value = Math.round(splat[offset + c] * ((1 - nextTarget) / remaining));
        } else {
          value = Math.round(((1 - nextTarget) / 3) * 255);
        }
        splat[offset + c] = value;
        sum += value;
      }
      // Rounding drift lands on the largest channel so the invariant holds
      // without ever wrapping a Uint8 below 0 or above 255.
      const drift = 255 - sum;
      if (drift !== 0) {
        let largest = 0;
        for (let c = 1; c < 4; c += 1) {
          if (splat[offset + c] > splat[offset + largest]) largest = c;
        }
        splat[offset + largest] += drift;
      }
    }
  }
  const rect = { minX: minTx, minZ: minTz, maxX: maxTx, maxZ: maxTz };
  if (stroke.before.size) stroke.dirtyRect = mergeDirtyRects(stroke.dirtyRect, rect);
  return rect;
}

/** Freezes a splat stroke into an invertible command of packed RGBA texels. */
export function commitSplatStroke(field, stroke) {
  const entries = [];
  for (const [texel, beforePacked] of stroke.before) {
    const afterPacked = packSplat(field.splat, texel * 4);
    if (afterPacked !== beforePacked) entries.push([texel, beforePacked, afterPacked]);
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a[0] - b[0]);
  const indices = new Uint32Array(entries.length);
  const before = new Uint32Array(entries.length);
  const after = new Uint32Array(entries.length);
  entries.forEach(([texel, beforePacked, afterPacked], i) => {
    indices[i] = texel;
    before[i] = beforePacked >>> 0;
    after[i] = afterPacked >>> 0;
  });
  return { kind: 'splat', indices, before, after, dirtyRect: { ...stroke.dirtyRect } };
}

function writeSplatValues(field, indices, packedValues) {
  for (let i = 0; i < indices.length; i += 1) {
    const offset = indices[i] * 4;
    const packed = packedValues[i];
    field.splat[offset] = (packed >>> 24) & 0xff;
    field.splat[offset + 1] = (packed >>> 16) & 0xff;
    field.splat[offset + 2] = (packed >>> 8) & 0xff;
    field.splat[offset + 3] = packed & 0xff;
  }
}

export function applySplatCommand(field, command) {
  writeSplatValues(field, command.indices, command.after);
  return command.dirtyRect;
}

export function revertSplatCommand(field, command) {
  writeSplatValues(field, command.indices, command.before);
  return command.dirtyRect;
}
