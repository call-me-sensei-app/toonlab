// Source-aware emission for the ambient-fx backbone. Emitters own WHERE
// particles spawn (and their per-particle rng stream); stylizedAmbientFx owns
// what they look like. Everything here is pure CPU + deterministic, so the
// verify script exercises it headless.
//
// Determinism is world-anchored: the window disk is diced into fixed world
// cells and each cell hashes (seed, effect, cellX, cellZ) into its own rng
// stream. Re-emitting after the follow target strays therefore reproduces
// BIT-IDENTICAL particles in the overlapping region — cells only appear or
// drop at the disk rim, where the shader's window fade has already taken
// them to zero. That invariant (recenter distance + fade end ≤ disk radius)
// is what makes window re-emission pop-free.

import { hashCombine, mulberry32 } from './particleBackbone.js';

function cellHash(seed, kindId, ix, iz) {
  let h = hashCombine(seed >>> 0, (kindId + 1) >>> 0);
  h = hashCombine(h, (ix + 0x40000000) >>> 0);
  h = hashCombine(h, (iz + 0x40000000) >>> 0);
  return h;
}

function inBounds(bounds, x, z) {
  if (!bounds) return true;
  return Math.abs(x) <= bounds.x && Math.abs(z) <= bounds.z;
}

function groundY(heightAt, x, z) {
  const y = typeof heightAt === 'function' ? Number(heightAt(x, z)) : 0;
  return Number.isFinite(y) ? y : 0;
}

/**
 * Global-volume emitter: `density` particles per m³ of (window disk area ×
 * `band` height), spawned `band[0]..band[1]` meters above the ground.
 *
 * @param {Object} options
 * @param {number} options.seed        World seed.
 * @param {number} options.kindId      Effect kind (keeps rng streams apart).
 * @param {{x: number, z: number}} options.center  Window center.
 * @param {number} options.radius      Window radius in meters.
 * @param {number} options.density     Particles per m³.
 * @param {[number, number]} options.band  Min/max meters above ground.
 * @param {Function} options.heightAt  `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask]    `(x, z) => boolean` keep filter.
 * @param {{x: number, z: number}} [options.bounds]  World half-extents clamp.
 * @param {Function} [options.yBase]   Overrides the ground sample (e.g. water).
 * @param {Function} options.emit      `(x, y, z, rng, extra) => void`.
 * @returns {number} Emitted count.
 */
export function emitGlobalVolume({
  seed = 1, kindId = 0, center, radius, density = 0, band = [0, 1],
  heightAt, mask = null, bounds = null, yBase = null, emit,
}) {
  if (!(density > 0) || !(radius > 0)) return 0;
  // Cells small enough that the rim of appearing/dropping cells sits inside
  // the fade band, big enough that cell loops stay trivial.
  const cell = Math.max(radius / 4, 6);
  const bandMin = Math.min(band[0], band[1]);
  const bandSpan = Math.abs(band[1] - band[0]);
  const perCell = density * cell * cell * Math.max(bandSpan, 0.25);
  const radiusSq = radius * radius;
  const minIx = Math.floor((center.x - radius) / cell);
  const maxIx = Math.floor((center.x + radius) / cell);
  const minIz = Math.floor((center.z - radius) / cell);
  const maxIz = Math.floor((center.z + radius) / cell);
  let emitted = 0;
  for (let ix = minIx; ix <= maxIx; ix += 1) {
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      const h = cellHash(seed, kindId, ix, iz);
      const rng = mulberry32(h);
      const n = Math.floor(perCell) + (rng() < perCell % 1 ? 1 : 0);
      for (let i = 0; i < n; i += 1) {
        // Candidate positions draw from the cell stream in fixed order; all
        // OTHER randomness comes from a per-candidate child rng. Rejection
        // (window disk, mask, bounds) therefore can never shift a later
        // particle's draws — the invariant behind pop-free re-emission.
        const x = (ix + rng()) * cell;
        const z = (iz + rng()) * cell;
        const lift = bandMin + rng() * bandSpan;
        const dx = x - center.x;
        const dz = z - center.z;
        if (dx * dx + dz * dz > radiusSq) continue;
        if (!inBounds(bounds, x, z)) continue;
        if (mask && !mask(x, z)) continue;
        const base = yBase ? yBase(x, z) : groundY(heightAt, x, z);
        emit(x, base + lift, z, mulberry32(hashCombine(h, i >>> 0)), null);
        emitted += 1;
      }
    }
  }
  return emitted;
}

/** Mask-bound emitter: global-volume restricted to `(x, z) => bool` regions
 * (flower masks, grass patches, shore margins from the host's mask kit). */
export function emitMaskBound(options) {
  if (typeof options?.mask !== 'function') return 0;
  return emitGlobalVolume(options);
}

/**
 * Water-margin band: emits where |ground − waterLevel| < `margin`, with the
 * spawn base hugging whichever is higher — the water surface over the lake,
 * the bank on shore. The natural home of mist wisps and dusk fireflies.
 */
export function emitWaterMargin({ waterLevel, margin = 6, heightAt, ...rest }) {
  if (!Number.isFinite(waterLevel)) return 0;
  return emitGlobalVolume({
    ...rest,
    heightAt,
    mask: (x, z) => Math.abs(groundY(heightAt, x, z) - waterLevel) < margin,
    yBase: (x, z) => Math.max(groundY(heightAt, x, z), waterLevel),
  });
}

/**
 * Canopy-bound emitter over registered bloom volumes.
 *
 * A bloom volume is a plain `{ x, y, z, radius, color?, effect? }` object —
 * `x/y/z` the crown center in world space, `radius` its rough sphere radius,
 * `color` an optional `[r, g, b]` (sRGB 0..1) the shed particles inherit
 * (blossom pink, autumn gold), `effect` which effect it feeds ('petals' by
 * default, or 'leaves'). Hosts register them via fx.addBloomSources(); tree
 * recipes that know their bloom color can hand these straight over.
 *
 * `density` is particles per m³ of each crown's upper half — crowns shed far
 * more than open air, hence the separate canopyDensity setting.
 */
export function emitCanopyBound({
  seed = 1, kindId = 0, sources = [], center, radius, density = 0,
  bounds = null, emit,
}) {
  if (!(density > 0) || !Array.isArray(sources) || sources.length === 0) return 0;
  const radiusSq = radius * radius;
  let emitted = 0;
  sources.forEach((source, index) => {
    const r = Math.max(Number(source?.radius) || 0, 0.4);
    const dx = (source.x ?? 0) - center.x;
    const dz = (source.z ?? 0) - center.z;
    if (dx * dx + dz * dz > (radius + r) * (radius + r)) return;
    const h = hashCombine(hashCombine(seed >>> 0, (kindId + 101) >>> 0), index >>> 0);
    const rng = mulberry32(h);
    const halfVolume = (2 / 3) * Math.PI * r * r * r;
    const target = density * halfVolume;
    const n = Math.floor(target) + (rng() < target % 1 ? 1 : 0);
    const extra = Array.isArray(source.color) ? { color: source.color } : null;
    for (let i = 0; i < n; i += 1) {
      // Shed from the crown shell, biased to its upper half — petals leave
      // from where the blossoms are, not the trunk. Positions draw from the
      // source stream; everything else from a per-candidate child rng (see
      // emitGlobalVolume for why).
      const theta = rng() * Math.PI * 2;
      const up = rng() * 1.3 - 0.3;
      const shell = r * (0.55 + 0.45 * Math.cbrt(rng()));
      const horizontal = Math.sqrt(Math.max(1 - up * up, 0)) * shell;
      const x = source.x + Math.cos(theta) * horizontal;
      const z = source.z + Math.sin(theta) * horizontal;
      const y = source.y + up * shell;
      const cx = x - center.x;
      const cz = z - center.z;
      if (cx * cx + cz * cz > radiusSq) continue;
      if (!inBounds(bounds, x, z)) continue;
      emit(x, y, z, mulberry32(hashCombine(h, i >>> 0)), extra);
      emitted += 1;
    }
  });
  return emitted;
}
