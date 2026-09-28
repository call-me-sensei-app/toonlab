// Ribbon geometry for path routes: a skirted strip that follows the route's
// flattened height profile, painted per style (dirt / stone / planks) with
// vertex colors + a procedural detail map. The terrain mesh is never
// modified — the ribbon is a true overlay (lift + edge skirts tucked under
// the terrain), and the flattened profile is what `paths.heightAt` reports.

import * as THREE from 'three';

import { hashCombine } from '../rockgen/noise/prng.js';
import { valueNoise3 } from '../rockgen/noise/valueNoise3.js';

// Values are linear-space (THREE vertex colors), same convention as the
// debris palettes — earthy and saturated enough to survive the environment
// shader's ambient lift without washing to pink.
export const PATH_STYLE_PALETTES = Object.freeze({
  dirt: Object.freeze({
    base: Object.freeze([0.3, 0.21, 0.12]),
    edge: Object.freeze([0.24, 0.18, 0.11]),
    wear: Object.freeze([0.42, 0.31, 0.18]),
  }),
  stone: Object.freeze({
    base: Object.freeze([0.4, 0.41, 0.39]),
    edge: Object.freeze([0.3, 0.31, 0.3]),
    wear: Object.freeze([0.52, 0.51, 0.47]),
  }),
  planks: Object.freeze({
    base: Object.freeze([0.38, 0.26, 0.15]),
    edge: Object.freeze([0.3, 0.2, 0.12]),
    wear: Object.freeze([0.5, 0.36, 0.21]),
  }),
});

/** Even resampling of a 2D polyline at `stepLength` meters (arclength). */
export function resamplePolyline(points, stepLength = 2) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const step = Math.max(Number(stepLength) || 2, 0.5);
  const samples = [{ s: 0, x: points[0].x, z: points[0].z }];
  let total = 0; // arclength at the start of the current segment
  let nextS = step; // arclength of the next sample to emit
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (span < 1e-6) continue;
    while (nextS <= total + span) {
      const t = (nextS - total) / span;
      samples.push({ s: nextS, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      nextS += step;
    }
    total += span;
  }
  const last = points[points.length - 1];
  const tail = samples[samples.length - 1];
  const closing = Math.hypot(last.x - tail.x, last.z - tail.z);
  if (closing > step * 0.35) {
    samples.push({ s: total, x: last.x, z: last.z });
  } else if (samples.length > 1) {
    tail.x = last.x;
    tail.z = last.z;
    tail.s = total;
  }
  return samples;
}

/**
 * Builds per-sample route data: raw terrain height, flattened profile,
 * bridge spans (open-water runs longer than `minSpan`), ford flags, and
 * stair runs (steep dry stretches). This is the single source of truth the
 * ribbon mesh, the bridges, `paths.heightAt`, and `paths.maskAt` all share.
 */
export function buildRouteProfile({
  points,
  heightAt,
  waterLevel = 0,
  settings,
  seed = 1,
}) {
  const sample = typeof heightAt === 'function' ? heightAt : () => 0;
  const { ribbon, bridge, stairs } = settings;
  const samples = resamplePolyline(points, ribbon.stepLength);
  if (samples.length < 2) return null;

  for (const point of samples) {
    point.raw = Number(sample(point.x, point.z)) || 0;
    point.wet = point.raw <= waterLevel + 0.05;
  }

  // Flattened profile: moving average of raw height, deviation-clamped so
  // the path can fill dips (embankment) but never cuts deep into a rise.
  const window = Math.max(Math.round((ribbon.smoothing || 0) / Math.max(ribbon.stepLength, 0.5)), 0);
  for (let index = 0; index < samples.length; index += 1) {
    if (window === 0) { samples[index].profile = samples[index].raw; continue; }
    let sum = 0;
    let count = 0;
    for (let k = -window; k <= window; k += 1) {
      const at = Math.min(samples.length - 1, Math.max(0, index + k));
      sum += samples[at].raw;
      count += 1;
    }
    const smoothed = sum / count;
    const deviation = Math.min(Math.max(smoothed - samples[index].raw, -0.45), 1.4);
    samples[index].profile = samples[index].raw + deviation;
  }

  // Open-water runs → bridge spans (long) or fords (short). Bridges get an
  // arched deck profile clamped above the waterline; fords wade the profile
  // just above it.
  const bridges = [];
  let runStart = -1;
  const flushRun = (endIndex) => {
    if (runStart < 0) return;
    const startIndex = Math.max(runStart - 1, 0);
    const stopIndex = Math.min(endIndex, samples.length - 1);
    const span = samples[stopIndex].s - samples[startIndex].s;
    if (span >= bridge.minSpan) {
      bridges.push({ endIndex: stopIndex, span, startIndex });
    } else {
      for (let index = startIndex; index <= stopIndex; index += 1) {
        samples[index].profile = Math.max(samples[index].profile, waterLevel + 0.14);
        samples[index].ford = true;
      }
    }
    runStart = -1;
  };
  for (let index = 0; index < samples.length; index += 1) {
    if (samples[index].wet) {
      if (runStart < 0) runStart = index;
    } else {
      flushRun(index);
    }
  }
  flushRun(samples.length - 1);

  for (const crossing of bridges) {
    const { startIndex, endIndex } = crossing;
    const startY = samples[startIndex].profile;
    const endY = samples[endIndex].profile;
    const span = crossing.span;
    const rise = Math.min(span * bridge.arc, 2.6);
    const clearance = waterLevel + bridge.deckClearance;
    for (let index = startIndex; index <= endIndex; index += 1) {
      const t = (samples[index].s - samples[startIndex].s) / Math.max(span, 1e-6);
      const base = startY + (endY - startY) * t;
      const arch = base + Math.sin(t * Math.PI) * rise;
      samples[index].profile = index === startIndex || index === endIndex
        ? base
        : Math.max(arch, clearance);
      // Interior samples are deck-only; the bank samples stay in the ribbon
      // so the dirt strip runs under the deck ends (no seam gap).
      if (index > startIndex && index < endIndex) samples[index].bridge = true;
    }
    crossing.deckHeights = samples
      .slice(startIndex, endIndex + 1)
      .map((point) => point.profile);
  }

  // Stair runs: steep, dry, non-bridge stretches. Visual only — the profile
  // stays a smooth ramp so character controllers need no step logic.
  const stairRuns = [];
  let stairStart = -1;
  for (let index = 0; index < samples.length - 1; index += 1) {
    const a = samples[index];
    const b = samples[index + 1];
    const slope = Math.abs(b.profile - a.profile) / Math.max(b.s - a.s, 1e-6);
    const steep = slope >= stairs.slopeThreshold && !a.bridge && !b.bridge && !a.ford;
    if (steep && stairStart < 0) stairStart = index;
    if (!steep && stairStart >= 0) {
      if (index - stairStart >= 1) stairRuns.push({ endIndex: index, startIndex: stairStart });
      stairStart = -1;
    }
  }
  if (stairStart >= 0 && samples.length - 1 - stairStart >= 1) {
    stairRuns.push({ endIndex: samples.length - 1, startIndex: stairStart });
  }

  // Per-sample half-width with low-frequency wobble (hand-drawn look) and
  // the side direction (perpendicular of the local tangent).
  const halfBase = ribbon.width / 2;
  for (let index = 0; index < samples.length; index += 1) {
    const prev = samples[Math.max(index - 1, 0)];
    const next = samples[Math.min(index + 1, samples.length - 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const invLen = 1 / Math.max(Math.hypot(tx, tz), 1e-6);
    samples[index].sideX = -tz * invLen;
    samples[index].sideZ = tx * invLen;
    const wobble = valueNoise3(hashCombine(seed, 811), samples[index].s * 0.045, 0.5, 0.5);
    samples[index].half = samples[index].bridge
      ? halfBase
      : halfBase * (1 + ribbon.widthWobble * wobble);
  }

  return { bridges, samples, stairRuns };
}

const scratchColor = new THREE.Color();

function pushColor(colors, rgb, shade) {
  scratchColor.setRGB(rgb[0], rgb[1], rgb[2]);
  colors.push(
    Math.min(scratchColor.r * shade, 1),
    Math.min(scratchColor.g * shade, 1),
    Math.min(scratchColor.b * shade, 1),
  );
}

/**
 * Ribbon mesh for one route (bridge spans skipped — those become bridge
 * groups). Cross-section: skirt / edge / crown / edge / skirt; skirts drop
 * below the neighbouring terrain so the visible edge is the organic
 * intersection line, never a floating hem.
 */
export function buildRibbonGeometry(routeData, {
  heightAt,
  settings,
  style = 'dirt',
  seed = 1,
}) {
  const sample = typeof heightAt === 'function' ? heightAt : () => 0;
  const { ribbon } = settings;
  const palette = PATH_STYLE_PALETTES[style] ?? PATH_STYLE_PALETTES.dirt;
  const positions = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const skirtDrop = 0.4;
  const crown = Math.min(ribbon.width * 0.02, 0.05);
  const vRepeat = 1 / Math.max(ribbon.width, 1); // ~square texture tiles

  const { samples } = routeData;
  let rowIndex = -1;
  let previousRow = null;
  for (let index = 0; index < samples.length; index += 1) {
    const point = samples[index];
    if (point.bridge) { previousRow = null; continue; }
    const lift = ribbon.lift;
    const y = point.profile + lift;
    const half = point.half;
    const skirt = half + ribbon.edgeSkirt;
    const wear = valueNoise3(hashCombine(seed, 977), point.s * 0.11, 0.25, 0.75);

    const across = [
      { off: -skirt, u: 0, kind: 'skirt' },
      { off: -half, u: 0.04, kind: 'edge' },
      { off: 0, u: 0.5, kind: 'center' },
      { off: half, u: 0.96, kind: 'edge' },
      { off: skirt, u: 1, kind: 'skirt' },
    ];
    for (const slot of across) {
      const x = point.x + point.sideX * slot.off;
      const z = point.z + point.sideZ * slot.off;
      let vy;
      if (slot.kind === 'skirt') {
        vy = Math.min((Number(sample(x, z)) || 0) - skirtDrop, y - 0.05);
      } else if (slot.kind === 'center') {
        vy = y + crown;
      } else {
        vy = y;
      }
      positions.push(x, vy, z);
      uvs.push(slot.u, point.s * vRepeat);
      if (slot.kind === 'skirt') {
        pushColor(colors, palette.edge, 0.72);
      } else if (slot.kind === 'edge') {
        pushColor(colors, palette.edge, 0.94 + wear * 0.05);
      } else {
        const worn = wear * 0.5 + 0.5;
        const rgb = [
          palette.base[0] + (palette.wear[0] - palette.base[0]) * worn,
          palette.base[1] + (palette.wear[1] - palette.base[1]) * worn,
          palette.base[2] + (palette.wear[2] - palette.base[2]) * worn,
        ];
        pushColor(colors, rgb, 1);
      }
    }
    rowIndex += 1;
    if (previousRow !== null) {
      const a = previousRow * 5;
      const b = rowIndex * 5;
      for (let k = 0; k < 4; k += 1) {
        // Wound so face normals point up (+y): row b is ahead of row a
        // along the route, slots run left→right across it.
        indices.push(a + k, b + k + 1, b + k, a + k, a + k + 1, b + k + 1);
      }
    }
    previousRow = rowIndex;
  }
  if (positions.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Stepped stone segments over steep runs. Boxes sunk into the ramp — the
 * read is stairs, the walk is the smooth profile underneath.
 */
export function buildStairsGeometry(routeData, { settings, seed = 1, maxSteps = 400 }) {
  const { stairRuns, samples } = routeData;
  if (!stairRuns.length) return null;
  const { stairs } = settings;
  let stepsLeft = Math.max(Number(maxSteps) || 400, 0); // triangle-budget guard
  const palette = PATH_STYLE_PALETTES.stone;
  const geometries = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const random = (value) => valueNoise3(hashCombine(seed, 601), value * 3.7, 0.2, 0.8);

  for (const run of stairRuns) {
    if (stepsLeft <= 0) break;
    const start = samples[run.startIndex];
    const end = samples[run.endIndex];
    const rise = end.profile - start.profile;
    const stepCount = Math.min(
      Math.max(Math.ceil(Math.abs(rise) / stairs.stepHeight), 2),
      stepsLeft,
    );
    stepsLeft -= stepCount;
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      const t = (stepIndex + 0.5) / stepCount;
      const s = start.s + (end.s - start.s) * t;
      // find bracketing samples for position/heading
      let at = run.startIndex;
      while (at < run.endIndex && samples[at + 1].s < s) at += 1;
      const a = samples[at];
      const b = samples[Math.min(at + 1, run.endIndex)];
      const spanT = (s - a.s) / Math.max(b.s - a.s, 1e-6);
      const x = a.x + (b.x - a.x) * spanT;
      const z = a.z + (b.z - a.z) * spanT;
      const profile = a.profile + (b.profile - a.profile) * spanT;
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      const width = (a.half + b.half) * 0.92;
      const depth = (end.s - start.s) / stepCount + 0.14;
      const height = stairs.stepHeight + 0.1;
      const jitter = random(stepIndex + run.startIndex);

      const geometry = box.clone();
      quaternion.setFromAxisAngle(up, heading + jitter * 0.06);
      matrix.compose(
        new THREE.Vector3(x, profile + stairs.stepHeight * 0.28, z),
        quaternion,
        new THREE.Vector3(width, height, depth),
      );
      geometry.applyMatrix4(matrix);
      const count = geometry.attributes.position.count;
      const stepColors = new Float32Array(count * 3);
      const shade = 0.9 + jitter * 0.12;
      for (let v = 0; v < count; v += 1) {
        stepColors[v * 3] = Math.min(palette.base[0] * shade, 1);
        stepColors[v * 3 + 1] = Math.min(palette.base[1] * shade, 1);
        stepColors[v * 3 + 2] = Math.min(palette.base[2] * shade, 1);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(stepColors, 3));
      geometries.push(geometry);
    }
  }
  box.dispose();
  if (!geometries.length) return null;
  const merged = mergePathGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

// Minimal local merge (positions/normals/uvs/colors + index) — avoids the
// three/examples import here so the module stays lean for tests.
export function mergePathGeometries(geometries) {
  const hasUv = geometries.every((geometry) => geometry.attributes.uv);
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let offset = 0;
  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const color = geometry.attributes.color;
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      if (normal) normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      if (hasUv && uv) uvs.push(uv.getX(index), uv.getY(index));
      if (color) colors.push(color.getX(index), color.getY(index), color.getZ(index));
      else colors.push(1, 1, 1);
    }
    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices.push(geometry.index.getX(index) + offset);
      }
    } else {
      for (let index = 0; index < position.count; index += 1) indices.push(index + offset);
    }
    offset += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (uvs.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  if (!normals.length) merged.computeVertexNormals();
  return merged;
}
