// Deterministic placement scatter helpers. Import from
// '@call-me-sensei/toonlab/vegetation'.
//
// Hosts stop authoring placement logic by hand: these produce plain
// `{ x, y, z }` placement arrays (plus a per-item `seed` for trees) ready for
// StylizedGrassField/StylizedFlowerField `placements` and StylizedTree
// construction. Everything is seeded and dependency-free — the same inputs
// always yield the same world, which keeps captures and multiplayer
// deterministic. Depends only on a host-supplied `heightAt(x, z)` terrain
// sampler; without one, placements land at y = 0.
//
// ToonLab world units are meters.

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placementY(heightAt, x, z) {
  if (typeof heightAt !== 'function') return 0;
  const y = Number(heightAt(x, z));
  return Number.isFinite(y) ? y : 0;
}

function passesMask(mask, x, z) {
  return typeof mask === 'function' ? Boolean(mask(x, z)) : true;
}

function spatialHash01(x, z, seed) {
  let hash = Math.imul(Math.floor(Number(x) * 4096), 0x1f123bb5)
    ^ Math.imul(Math.floor(Number(z) * 4096), 0x5f356495)
    ^ Math.imul(Math.trunc(seed) || 1, 0x6c8e9cf5);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/**
 * Mask factory: rejects points where the terrain slope exceeds `maxSlope`
 * (rise over run, so 0.6 ≈ 31°). Slope is estimated from `heightAt` with
 * central differences at `sampleDistance`.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createSlopeMask({ heightAt, maxSlope = 0.6, sampleDistance = 0.5 } = {}) {
  if (typeof heightAt !== 'function') return () => true;
  const step = Math.max(Number(sampleDistance) || 0.5, 0.01);
  const limit = Math.max(Number(maxSlope) || 0, 0);
  return (x, z) => {
    const dx = (placementY(heightAt, x + step, z) - placementY(heightAt, x - step, z)) / (2 * step);
    const dz = (placementY(heightAt, x, z + step) - placementY(heightAt, x, z - step)) / (2 * step);
    return Math.hypot(dx, dz) <= limit;
  };
}

/**
 * Mask factory: keeps only terrain whose authored/procedural surface weight
 * reaches `threshold`. Use a grass/meadow weight sampler here so dirt paths,
 * painted rock, cliff masks, and other excluded materials do not receive
 * vegetation even when they share the same height field.
 *
 * The sampler should return a normalized 0..1 weight. Because it is evaluated
 * when scatter is rebuilt, terrain painting or procedural layer changes do
 * not require hand-removing individual grass instances.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createSurfaceWeightMask({
  weightAt,
  threshold = 0.4,
} = {}) {
  if (typeof weightAt !== 'function') return () => true;
  const minimum = Math.min(Math.max(Number(threshold) || 0, 0), 1);
  return (x, z) => {
    const weight = Number(weightAt(x, z));
    return Number.isFinite(weight) && weight > minimum;
  };
}

/**
 * Converts a continuous authored 0..1 coverage field into a deterministic
 * keep/reject mask. Unlike thresholding a surface weight, this preserves a
 * soft ecological transition: coverage thins probabilistically toward paths,
 * cliff lips, rock fields, beaches, and biome boundaries without drawing a
 * visible line through the placement field.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createDensityWeightMask({ weightAt, seed = 1 } = {}) {
  if (typeof weightAt !== 'function') return () => true;
  return (x, z) => {
    const raw = Number(weightAt(x, z));
    if (!Number.isFinite(raw) || raw <= 0) return false;
    if (raw >= 1) return true;
    return spatialHash01(x, z, seed) < raw;
  };
}

/**
 * Mask factory: rejects points at or below the water line (terrain height
 * under `waterLevel + margin`), so grass and trees stay out of lakes and
 * surf. Pair `waterLevel` with the WaterSurface's world y position.
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createWaterMask({ heightAt, waterLevel = 0, margin = 0.15 } = {}) {
  if (typeof heightAt !== 'function') return () => true;
  const threshold = (Number(waterLevel) || 0) + (Number(margin) || 0);
  return (x, z) => placementY(heightAt, x, z) > threshold;
}

/** Combines mask functions; a point must pass every mask. */
export function combineMasks(...masks) {
  const active = masks.filter((mask) => typeof mask === 'function');
  return (x, z) => active.every((mask) => mask(x, z));
}

/**
 * Uniform scatter inside an axis-aligned rectangle. The generic primitive
 * behind scatterGrassAround/scatterForest — use it directly for custom
 * regions.
 *
 * @param {Object} options
 * @param {{x: number, z: number}} options.min Rectangle corner.
 * @param {{x: number, z: number}} options.max Opposite corner.
 * @param {number} [options.count] Number of placements to attempt.
 * @param {number} [options.seed] Deterministic seed.
 * @param {number} [options.minSpacing] Reject points closer than this (m).
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter.
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function scatterInRect({
  min = { x: -10, z: -10 },
  max = { x: 10, z: 10 },
  count = 100,
  seed = 1,
  minSpacing = 0,
  heightAt = null,
  mask = null,
} = {}) {
  const random = mulberry32(seed);
  const spacing = Math.max(Number(minSpacing) || 0, 0);
  const cell = spacing > 0 ? spacing : Infinity;
  const occupied = new Map();
  const placements = [];
  // A mask can reject just as many candidates as a spacing constraint. One
  // attempt per requested point silently under-filled water-masked meadows
  // and biome transitions, so both constrained paths receive a deterministic
  // retry budget.
  const attemptFactor = mask ? 16 : spacing > 0 ? 6 : 1;
  const attempts = Math.max(Math.trunc(count) || 0, 0) * attemptFactor;
  const spacingSq = spacing * spacing;

  const isFree = (x, z) => {
    if (spacing <= 0) return true;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
      for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
        const bucket = occupied.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const p of bucket) {
          const dx = p.x - x;
          const dz = p.z - z;
          if (dx * dx + dz * dz < spacingSq) return false;
        }
      }
    }
    return true;
  };

  for (let i = 0; i < attempts && placements.length < count; i += 1) {
    const x = min.x + (max.x - min.x) * random();
    const z = min.z + (max.z - min.z) * random();
    if (!passesMask(mask, x, z) || !isFree(x, z)) continue;
    const placement = { x, y: placementY(heightAt, x, z), z };
    placements.push(placement);
    if (spacing > 0) {
      const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
      const bucket = occupied.get(key);
      if (bucket) bucket.push(placement);
      else occupied.set(key, [placement]);
    }
  }
  return placements;
}

/**
 * Grass placements in a disc around a point (or an Object3D — the character,
 * a camp, a POI). Density-based, so the same call reads correctly at any
 * radius:
 *
 *   const grass = new StylizedGrassField({
 *     placements: scatterGrassAround({ center: spawn, radius: 30, density: 12, heightAt, mask }),
 *   });
 *
 * @param {Object} options
 * @param {{x: number, z: number}|{position: {x: number, z: number}}} [options.center]
 *   Point or Object3D-like (its `.position` is read once, at call time).
 * @param {number} [options.radius] Disc radius in meters.
 * @param {number} [options.density] Blades per square meter.
 * @param {number} [options.seed]
 * @param {number} [options.maxCount] Safety cap on placement count.
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter.
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function scatterGrassAround({
  center = { x: 0, z: 0 },
  radius = 12,
  density = 8,
  seed = 1,
  maxCount = 60000,
  heightAt = null,
  mask = null,
} = {}) {
  const origin = center?.position ?? center ?? { x: 0, z: 0 };
  const r = Math.max(Number(radius) || 0, 0);
  const random = mulberry32(seed);
  const target = Math.min(Math.round((Number(density) || 0) * Math.PI * r * r), Math.max(maxCount, 0));
  const placements = [];
  let attempts = target * 4;
  while (placements.length < target && attempts > 0) {
    attempts -= 1;
    // sqrt keeps the disc uniform instead of center-clumped
    const distance = r * Math.sqrt(random());
    const angle = random() * Math.PI * 2;
    const x = (Number(origin.x) || 0) + Math.cos(angle) * distance;
    const z = (Number(origin.z) || 0) + Math.sin(angle) * distance;
    if (!passesMask(mask, x, z)) continue;
    placements.push({ x, y: placementY(heightAt, x, z), z });
  }
  return placements;
}

/**
 * Tree placements in a disc: a jittered grid at `spacing` meters, so trees
 * never clump unnaturally and density stays predictable (one candidate per
 * grid cell). Each placement carries a deterministic per-tree `seed` to pass
 * straight to StylizedTree for silhouette variation:
 *
 *   for (const p of scatterForest({ center, radius: 80, spacing: 9, heightAt, mask })) {
 *     const tree = new StylizedTree({
 *       ...galleryTreeRecipe.options,
 *       seed: p.seed,
 *       size: 3.2,
 *       vegetationShader: { preset: 'call_me_sensei' },
 *     });
 *     tree.position.set(p.x, p.y, p.z);
 *     scene.add(tree);
 *   }
 *
 * @param {Object} options
 * @param {{x: number, z: number}|{position: {x: number, z: number}}} [options.center]
 * @param {number} [options.radius] Disc radius in meters.
 * @param {number} [options.spacing] Grid spacing in meters (≈ average tree distance).
 * @param {number} [options.jitter] 0..1 of spacing each tree may wander off-grid.
 * @param {number} [options.keepChance] 0..1 chance a cell spawns at all (thins the forest).
 * @param {number} [options.seed]
 * @param {Function} [options.heightAt] `(x, z) => y` terrain sampler.
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter.
 * @returns {Array<{x: number, y: number, z: number, seed: number}>}
 */
export function scatterForest({
  center = { x: 0, z: 0 },
  radius = 60,
  spacing = 9,
  jitter = 0.45,
  keepChance = 1,
  seed = 1,
  heightAt = null,
  mask = null,
} = {}) {
  const origin = center?.position ?? center ?? { x: 0, z: 0 };
  const originX = Number(origin.x) || 0;
  const originZ = Number(origin.z) || 0;
  const r = Math.max(Number(radius) || 0, 0);
  const step = Math.max(Number(spacing) || 1, 0.1);
  const wander = Math.min(Math.max(Number(jitter) || 0, 0), 1) * step;
  const keep = Math.min(Math.max(Number(keepChance) ?? 1, 0), 1);
  const radiusSq = r * r;
  const placements = [];
  const cells = Math.ceil(r / step);
  for (let ix = -cells; ix <= cells; ix += 1) {
    for (let iz = -cells; iz <= cells; iz += 1) {
      // one RNG stream per cell keeps the forest stable when the radius grows
      const random = mulberry32(seed * 73856093 + ix * 19349663 + iz * 83492791);
      if (random() > keep) continue;
      const x = originX + ix * step + (random() - 0.5) * 2 * wander;
      const z = originZ + iz * step + (random() - 0.5) * 2 * wander;
      const dx = x - originX;
      const dz = z - originZ;
      if (dx * dx + dz * dz > radiusSq) continue;
      if (!passesMask(mask, x, z)) continue;
      placements.push({
        seed: Math.floor(random() * 0xffffffff),
        x,
        y: placementY(heightAt, x, z),
        z,
      });
    }
  }
  return placements;
}

/**
 * Mask factory: organic patches from seeded value noise — the standard way
 * to cluster forests, meadows, or rock fields instead of uniform sprinkling
 * (uniform scatter reads as confetti from any aerial camera). Threshold
 * controls coverage: 0.5 ≈ half the map in patches, 0.6 ≈ sparse islands.
 *
 *   const forestMask = createNoisePatchMask({ seed: 7, scale: 0.004, threshold: 0.52 });
 *   scatterForest({
 *     ...,
 *     mask: combineMasks(forestMask, surfaceWeightMask, slopeMask, waterMask),
 *   });
 *
 * @returns {(x: number, z: number) => boolean}
 */
export function createNoisePatchMask({ seed = 1, scale = 0.004, threshold = 0.55, octaves = 3 } = {}) {
  const cell = (ix, iz) => {
    let h = (ix * 374761393 + iz * 668265263 + Math.trunc(seed) * 971) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = cell(ix, iz);
    const b = cell(ix + 1, iz);
    const c = cell(ix, iz + 1);
    const d = cell(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
  const freq = Math.max(Number(scale) || 0.004, 1e-6);
  const steps = Math.max(Math.trunc(octaves) || 3, 1);
  const limit = Number(threshold) || 0.55;
  return (x, z) => {
    let amplitude = 0.5;
    let frequency = freq;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < steps; i += 1) {
      sum += amplitude * noise(x * frequency, z * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / norm > limit;
  };
}

// ---------------------------------------------------------------------------
// Placement on arbitrary surfaces (cliff caps, ledges, shelves, platforms).
//
// Everything above scatters across the ground heightfield: `(x, z)` in, `y`
// sampled from `heightAt`. That cannot express "grass on top of that tower" or
// "shrubs along this ledge", because those surfaces are not single-valued in
// `y` — a cliff cap has terrain both above and below it.
//
// `scatterOnSurface` takes explicit surface records instead, of the shape a
// rock/cliff module already publishes for its caps and ledges, and returns the
// same placement records the rest of this module produces plus the orientation
// data an aligned field needs (`normal`, `forward`, `yaw`). Callers previously
// had to derive those by hand for every placement.
// ---------------------------------------------------------------------------

function vec3(source, fallback) {
  if (Array.isArray(source) && source.length >= 3) {
    return [Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0];
  }
  if (source && typeof source === 'object') {
    return [Number(source.x) || 0, Number(source.y) || 0, Number(source.z) || 0];
  }
  return fallback.slice();
}

function normalize3(v) {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!(length > 1e-6)) return [0, 1, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Right-handed tangent basis for a plane. The reference axis switches away
 * from world up when the surface is near-horizontal, so a flat cap and a
 * vertical ledge both get a stable, continuous basis instead of degenerating.
 */
function tangentBasis(normal) {
  const reference = Math.abs(normal[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const tangent = normalize3([
    reference[1] * normal[2] - reference[2] * normal[1],
    reference[2] * normal[0] - reference[0] * normal[2],
    reference[0] * normal[1] - reference[1] * normal[0],
  ]);
  const bitangent = [
    normal[1] * tangent[2] - normal[2] * tangent[1],
    normal[2] * tangent[0] - normal[0] * tangent[2],
    normal[0] * tangent[1] - normal[1] * tangent[0],
  ];
  return [tangent, bitangent];
}

/**
 * Radial weight for a cap or ledge, in normalized disc space.
 *
 * A grass cap that is uniformly dense to its rim reads as a flat green disc
 * stuck onto the rock. Real soil caps thin toward a broken, slightly
 * overhanging edge. `rimBias` above 0 pushes coverage outward; keep it near
 * zero for a soil cap so it does not form a dense annulus. `falloff` controls
 * how fast coverage dies at the very edge.
 *
 * @param {Object} [options]
 * @param {number} [options.rimBias] 0 = centre-weighted, 1 = rim-weighted.
 * @param {number} [options.falloff] Width of the fade at the rim, 0..1.
 * @param {number} [options.break] Amount of per-point break-up at the rim, 0..1.
 * @param {number} [options.seed]
 * @returns {(r01: number, angle: number) => number} weight in 0..1
 */
export function createCapEdgeWeight({
  rimBias = 0.05,
  falloff = 0.22,
  break: breakUp = 0.45,
  seed = 1,
} = {}) {
  const bias = Math.min(Math.max(Number(rimBias) || 0, 0), 1);
  const fade = Math.min(Math.max(Number(falloff) || 0, 1e-3), 1);
  const chaos = Math.min(Math.max(Number(breakUp) || 0, 0), 1);
  return (r01, angle = 0) => {
    const r = Math.min(Math.max(Number(r01) || 0, 0), 1);
    // Ragged rim: the effective edge wanders with angle, so the cap never ends
    // on a clean circle.
    const wobble = chaos * 0.5 * (spatialHash01(Math.cos(angle) * 8, Math.sin(angle) * 8, seed) - 0.5);
    const edge = 1 - fade + wobble;
    const rim = r <= edge ? 1 : Math.max(0, 1 - (r - edge) / fade);
    const radial = bias > 0 ? (1 - bias) + bias * r : 1;
    return Math.min(Math.max(rim * radial, 0), 1);
  };
}

/**
 * Scatter placements across explicit surfaces rather than across the ground.
 *
 * Each surface is a disc in world space — the contract a cliff/rock module
 * already publishes for a tower cap or a ledge:
 *
 *   { center: {x, y, z}, radius: number, normal?: {x, y, z}, seed?: number }
 *
 * Spacing is measured in 3D, so two caps stacked above one another do not
 * reject each other's points the way an `(x, z)` grid would.
 *
 * Each surface gets its own deterministic stream, derived from `seed` and the
 * surface's own `seed` (or its index). Adding or removing one surface
 * therefore does not reshuffle the others.
 *
 *   const caps = cliffs.parts.towers.caps;   // [{ center, radius, normal }]
 *   const placements = scatterOnSurface({
 *     surfaces: caps,
 *     density: 6,
 *     minSpacing: 0.35,
 *     weightAt: createCapEdgeWeight({ rimBias: 0.05 }),
 *   });
 *
 * @param {Object} options
 * @param {Array<Object>} options.surfaces Surface records (see above).
 * @param {number} [options.density] Placements per square meter of surface.
 * @param {number} [options.count] Total placements; overrides `density`.
 * @param {number} [options.seed] Deterministic seed.
 * @param {number} [options.minSpacing] Reject points closer than this (m, 3D).
 * @param {Function} [options.mask] `(x, z) => boolean` keep filter, so the
 *   existing mask factories and `combineMasks` compose unchanged.
 * @param {Function} [options.weightAt] `(r01, angle) => 0..1` radial weight.
 * @param {number} [options.maxCount] Safety cap.
 * @param {number} [options.normalBlend] 0 keeps the surface normal, 1 forces
 *   world up. Grass on a tilted ledge usually wants a partial blend so blades
 *   do not lie flat against the slope.
 * @returns {Array<{x, y, z, normal, forward, yaw, seed, surfaceIndex}>}
 */
export function scatterOnSurface({
  surfaces = [],
  density = 4,
  count = 0,
  seed = 1,
  minSpacing = 0,
  mask = null,
  weightAt = null,
  maxCount = 20000,
  normalBlend = 0,
} = {}) {
  const list = Array.isArray(surfaces) ? surfaces : [];
  const spacing = Math.max(Number(minSpacing) || 0, 0);
  const spacingSq = spacing * spacing;
  const cell = spacing > 0 ? spacing : Infinity;
  const cap = Math.max(Math.trunc(maxCount) || 0, 0);
  const blend = Math.min(Math.max(Number(normalBlend) || 0, 0), 1);
  const occupied = new Map();
  const placements = [];

  // 3D spacing: two caps at the same (x, z) but different heights must not
  // reject each other, which an (x, z) grid would do.
  const isFree = (x, y, z) => {
    if (spacing <= 0) return true;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
      for (let iy = cy - 1; iy <= cy + 1; iy += 1) {
        for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
          const bucket = occupied.get(`${ix},${iy},${iz}`);
          if (!bucket) continue;
          for (const p of bucket) {
            const dx = p.x - x;
            const dy = p.y - y;
            const dz = p.z - z;
            if (dx * dx + dy * dy + dz * dz < spacingSq) return false;
          }
        }
      }
    }
    return true;
  };

  const totalArea = list.reduce((sum, s) => {
    const r = Math.max(Number(s?.radius) || 0, 0);
    return sum + Math.PI * r * r;
  }, 0);
  const requested = Math.trunc(count) || 0;

  for (let index = 0; index < list.length; index += 1) {
    const surface = list[index];
    const radius = Math.max(Number(surface?.radius) || 0, 0);
    if (radius <= 0) continue;

    const center = vec3(surface?.center ?? surface?.position, [0, 0, 0]);
    const normal = normalize3(vec3(surface?.normal, [0, 1, 0]));
    const oriented = blend > 0
      ? normalize3([
        normal[0] * (1 - blend),
        normal[1] * (1 - blend) + blend,
        normal[2] * (1 - blend),
      ])
      : normal;
    const [tangent, bitangent] = tangentBasis(normal);

    const area = Math.PI * radius * radius;
    const share = requested > 0
      ? Math.round(requested * (totalArea > 0 ? area / totalArea : 1 / list.length))
      : Math.round(area * (Number(density) || 0));
    const want = Math.max(share, 0);
    if (want <= 0) continue;

    // Per-surface stream: adding a surface does not reshuffle its neighbours.
    const surfaceSeed = Number.isFinite(Number(surface?.seed))
      ? Number(surface.seed)
      : (Math.trunc(seed) || 1) + index * 0x9e3779b1;
    const random = mulberry32(surfaceSeed);
    const attempts = want * (spacing > 0 ? 8 : 2);
    let made = 0;

    for (let i = 0; i < attempts && made < want && placements.length < cap; i += 1) {
      // Uniform over the disc: sqrt keeps density even rather than centre-heavy.
      const r01 = Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      if (typeof weightAt === 'function' && random() > weightAt(r01, angle)) continue;

      const local = r01 * radius;
      const ox = Math.cos(angle) * local;
      const oy = Math.sin(angle) * local;
      const x = center[0] + tangent[0] * ox + bitangent[0] * oy;
      const y = center[1] + tangent[1] * ox + bitangent[1] * oy;
      const z = center[2] + tangent[2] * ox + bitangent[2] * oy;

      if (!passesMask(mask, x, z) || !isFree(x, y, z)) continue;

      const yaw = random() * Math.PI * 2;
      // Forward is the yaw direction projected onto the surface plane, so an
      // aligned field leans along the surface instead of through it.
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      const dot = fx * oriented[0] + fz * oriented[2];
      const forward = normalize3([
        fx - oriented[0] * dot,
        -oriented[1] * dot,
        fz - oriented[2] * dot,
      ]);

      const placement = {
        x,
        y,
        z,
        normal: oriented.slice(),
        forward,
        yaw,
        seed: Math.floor(random() * 0xffffffff),
        surfaceIndex: index,
      };
      placements.push(placement);
      made += 1;

      if (spacing > 0) {
        const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
        const bucket = occupied.get(key);
        if (bucket) bucket.push(placement);
        else occupied.set(key, [placement]);
      }
    }
  }

  return placements;
}

// ---------------------------------------------------------------------------
// Curve-relative placement
// ---------------------------------------------------------------------------

function curvePoint(spine, t) {
  const point = spine(t);
  if (Array.isArray(point)) return { x: Number(point[0]), z: Number(point[1]) };
  return { x: Number(point?.x), z: Number(point?.z) };
}

/**
 * A placement frame defined by an authored curve instead of by world axes.
 *
 * Every boundary a natural scene actually has — a shoreline, a garden path, a
 * pond margin, a wall, a hedge line, a tree line — is a curve. `scatterInRect`
 * can only *reject* candidates against such a boundary through its boolean
 * mask; it can never *distribute along* one, so a host either accepts a
 * rectangular distribution with a curved hole punched in it, or hand-authors
 * world coordinates that silently drift away from the curve they were meant to
 * follow.
 *
 * A curve frame closes that gap. Positions are authored as `(along, offset)`:
 * `along` is the spine's own parameter and `offset` is signed distance across
 * it, positive toward the spine's left normal (the tangent rotated +90° about
 * +Y). Both hand-placed tables and seeded scatter resolve through the same
 * frame, so a scene authors its spine once and everything that references it
 * stays parallel to it for the curve's whole length.
 *
 * ```js
 * const margin = createCurveFrame({
 *   spine: (theta) => pondMarginPoint(theta),
 *   domain: [0, Math.PI * 2],
 * });
 * // hand placement: eight set stones just outside the water's edge
 * const stones = SET_STONES.map(([along, offset]) => margin.toWorld({ along, offset }));
 * // seeded scatter: pond-edge planting in a 0.4–1.8 m band behind them
 * const reeds = margin.scatterAlong({ count: 140, offsetRange: [0.4, 1.8], seed: 91 });
 * ```
 *
 * @param {Object} options
 * @param {(t: number) => ({x: number, z: number}|[number, number])} options.spine
 *   The curve, sampled in its own parameter.
 * @param {[number, number]} [options.domain] Parameter range, `[min, max]`.
 * @param {number} [options.samples] Arc-length table resolution.
 * @param {null|'x'|'z'} [options.offsetAxis] `null` (default) offsets along the
 *   curve normal, which is what keeps a band a constant width. Set `'z'` (or
 *   `'x'`) for a graph-style spine authored as `z = f(x)`, where the intent is
 *   a plain axis offset — the frame then reproduces `f(along) + offset`
 *   exactly rather than approximately.
 * @param {boolean} [options.closed] Wrap the parameter instead of clamping.
 * @returns {Object} frozen frame API
 */
export function createCurveFrame({
  spine,
  domain = [0, 1],
  samples = 256,
  offsetAxis = null,
  closed = false,
} = {}) {
  if (typeof spine !== 'function') {
    throw new TypeError('createCurveFrame requires spine(t) => { x, z }.');
  }
  const start = Number(domain?.[0] ?? 0);
  const end = Number(domain?.[1] ?? 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end === start) {
    throw new RangeError('createCurveFrame requires a finite, non-empty domain.');
  }
  const span = end - start;
  const steps = Math.max(Math.trunc(samples) || 0, 8);
  const epsilon = Math.abs(span) / steps * 0.5;

  const wrap = (t) => {
    if (!closed) return Math.min(Math.max(t, Math.min(start, end)), Math.max(start, end));
    const shifted = (t - start) % span;
    return start + (shifted < 0 ? shifted + span : shifted);
  };

  // Arc-length table. Sampled once at construction so both `atArcLength` and
  // arc-uniform scatter are O(log n) afterwards.
  const table = new Array(steps + 1);
  let total = 0;
  let previous = curvePoint(spine, start);
  table[0] = { s: 0, t: start, x: previous.x, z: previous.z };
  for (let index = 1; index <= steps; index += 1) {
    const t = start + span * (index / steps);
    const point = curvePoint(spine, t);
    total += Math.hypot(point.x - previous.x, point.z - previous.z);
    table[index] = { s: total, t, x: point.x, z: point.z };
    previous = point;
  }

  function pointAt(t) {
    return curvePoint(spine, wrap(t));
  }

  function tangentAt(t) {
    const at = wrap(t);
    const back = curvePoint(spine, closed ? at - epsilon : Math.max(at - epsilon, Math.min(start, end)));
    const forward = curvePoint(spine, closed ? at + epsilon : Math.min(at + epsilon, Math.max(start, end)));
    const dx = forward.x - back.x;
    const dz = forward.z - back.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) return { x: 1, z: 0 };
    return { x: dx / length, z: dz / length };
  }

  // Left normal: the tangent rotated +90° about +Y, i.e. (x, z) -> (-z, x).
  // For a spine authored as z = f(x) with x increasing, this points toward +Z,
  // which is what makes `offset` read the same way as a hand-authored
  // "distance inland" column.
  function normalAt(t) {
    const tangent = tangentAt(t);
    return { x: -tangent.z, z: tangent.x };
  }

  /** Yaw in radians that turns an object's +Z along the curve tangent. */
  function headingAt(t) {
    const tangent = tangentAt(t);
    return Math.atan2(tangent.x, tangent.z);
  }

  function toWorld({ along = start, offset = 0 } = {}) {
    const t = wrap(Number(along) || 0);
    const point = curvePoint(spine, t);
    const distance = Number(offset) || 0;
    if (offsetAxis === 'z') return { x: point.x, z: point.z + distance };
    if (offsetAxis === 'x') return { x: point.x + distance, z: point.z };
    const normal = normalAt(t);
    return { x: point.x + normal.x * distance, z: point.z + normal.z * distance };
  }

  function arcLengthAt(t) {
    // Clamped, never wrapped: on a closed curve `wrap(end)` folds back to the
    // domain start, which would collapse a full-loop range to zero length.
    const target = Math.min(Math.max(Number(t) || 0, Math.min(start, end)), Math.max(start, end));
    const fraction = (target - start) / span;
    const position = Math.min(Math.max(fraction, 0), 1) * steps;
    const low = Math.min(Math.floor(position), steps - 1);
    const blend = position - low;
    return table[low].s + (table[low + 1].s - table[low].s) * blend;
  }

  /** Parameter value at arc length `s` metres from the domain start. */
  function atArcLength(s) {
    const target = Math.min(Math.max(Number(s) || 0, 0), total);
    let low = 0;
    let high = steps;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (table[mid].s <= target) low = mid;
      else high = mid;
    }
    const segment = table[low + 1].s - table[low].s;
    const blend = segment > 0 ? (target - table[low].s) / segment : 0;
    return table[low].t + (table[low + 1].t - table[low].t) * blend;
  }

  /**
   * Nearest point on the spine. Coarse table search, then a bounded ternary
   * refinement on squared distance, so the result is stable and allocation-free
   * for the callers that use it as a mask.
   */
  function fromWorld(x, z) {
    const px = Number(x);
    const pz = Number(z);
    let bestIndex = 0;
    let best = Infinity;
    for (let index = 0; index <= steps; index += 1) {
      const dx = table[index].x - px;
      const dz = table[index].z - pz;
      const squared = dx * dx + dz * dz;
      if (squared < best) {
        best = squared;
        bestIndex = index;
      }
    }
    let low = table[Math.max(bestIndex - 1, 0)].t;
    let high = table[Math.min(bestIndex + 1, steps)].t;
    const distanceSquared = (t) => {
      const point = curvePoint(spine, t);
      const dx = point.x - px;
      const dz = point.z - pz;
      return dx * dx + dz * dz;
    };
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const a = low + (high - low) / 3;
      const b = high - (high - low) / 3;
      if (distanceSquared(a) < distanceSquared(b)) high = b;
      else low = a;
    }
    const along = (low + high) * 0.5;
    const point = curvePoint(spine, along);
    const normal = normalAt(along);
    const offset = (px - point.x) * normal.x + (pz - point.z) * normal.z;
    return { along, distance: Math.hypot(px - point.x, pz - point.z), offset };
  }

  /**
   * `(x, z) => boolean` keep filter for a band of signed offsets. Pass it to
   * `scatterInRect`, `surface.createGrassField`, or `combineMasks` so a
   * rectangular scatter respects a curved boundary without the host
   * re-deriving the distance by hand.
   */
  function bandMask({ min = -Infinity, max = Infinity, alongRange = null } = {}) {
    return (x, z) => {
      const { along, offset } = fromWorld(x, z);
      if (offset < min || offset > max) return false;
      if (!alongRange) return true;
      return along >= Math.min(alongRange[0], alongRange[1])
        && along <= Math.max(alongRange[0], alongRange[1]);
    };
  }

  function resolveAlongRange(alongRange) {
    if (!alongRange) return [Math.min(start, end), Math.max(start, end)];
    return [Math.min(alongRange[0], alongRange[1]), Math.max(alongRange[0], alongRange[1])];
  }

  function makeSpacingFilter(minSpacing) {
    const spacing = Math.max(Number(minSpacing) || 0, 0);
    if (spacing <= 0) return { accept: () => true, commit: () => {} };
    const cell = spacing;
    const spacingSq = spacing * spacing;
    const occupied = new Map();
    return {
      accept(x, z) {
        const cx = Math.floor(x / cell);
        const cz = Math.floor(z / cell);
        for (let ix = cx - 1; ix <= cx + 1; ix += 1) {
          for (let iz = cz - 1; iz <= cz + 1; iz += 1) {
            const bucket = occupied.get(`${ix},${iz}`);
            if (!bucket) continue;
            for (const p of bucket) {
              const dx = p.x - x;
              const dz = p.z - z;
              if (dx * dx + dz * dz < spacingSq) return false;
            }
          }
        }
        return true;
      },
      commit(placement) {
        const key = `${Math.floor(placement.x / cell)},${Math.floor(placement.z / cell)}`;
        const bucket = occupied.get(key);
        if (bucket) bucket.push(placement);
        else occupied.set(key, [placement]);
      },
    };
  }

  /**
   * Seeded scatter distributed along the curve and across an offset band.
   * `along` is uniform in **arc length**, not in the spine's parameter, so a
   * curve whose parameter bunches (a radial pond margin, a heavily curved
   * path) still receives even spacing on the ground.
   *
   * @returns {Array<{x, y, z, along, offset, heading}>}
   */
  function scatterAlong({
    count = 100,
    offsetRange = [0, 1],
    alongRange = null,
    minSpacing = 0,
    seed = 1,
    mask = null,
    heightAt = null,
  } = {}) {
    const random = mulberry32(seed);
    const [alongMin, alongMax] = resolveAlongRange(alongRange);
    const arcMin = arcLengthAt(alongMin);
    const arcMax = arcLengthAt(alongMax);
    const offsetMin = Number(offsetRange?.[0] ?? 0);
    const offsetMax = Number(offsetRange?.[1] ?? 0);
    const spacing = makeSpacingFilter(minSpacing);
    const target = Math.max(Math.trunc(count) || 0, 0);
    const attempts = target * (mask ? 16 : minSpacing > 0 ? 8 : 1);
    const placements = [];

    for (let index = 0; index < attempts && placements.length < target; index += 1) {
      const along = atArcLength(arcMin + (arcMax - arcMin) * random());
      const offset = offsetMin + (offsetMax - offsetMin) * random();
      const { x, z } = toWorld({ along, offset });
      if (!passesMask(mask, x, z) || !spacing.accept(x, z)) continue;
      const placement = {
        along,
        heading: headingAt(along),
        offset,
        x,
        y: placementY(heightAt, x, z),
        z,
      };
      placements.push(placement);
      spacing.commit(placement);
    }
    return placements;
  }

  /**
   * Evenly spaced placements measured in arc length — stepping stones, path
   * edging, fence posts, wall bays, a bamboo screen. Deterministic and
   * gap-free where `scatterAlong` would clump.
   *
   * @returns {Array<{x, y, z, along, offset, heading}>}
   */
  function stepAlong({
    spacing = 1,
    count = null,
    offset = 0,
    alongRange = null,
    phase = 0,
    jitterAlong = 0,
    jitterOffset = 0,
    seed = 1,
    mask = null,
    heightAt = null,
  } = {}) {
    const step = Math.max(Number(spacing) || 0, 1e-4);
    const random = mulberry32(seed);
    const [alongMin, alongMax] = resolveAlongRange(alongRange);
    const arcMin = arcLengthAt(alongMin);
    const arcMax = arcLengthAt(alongMax);
    const available = Math.max(arcMax - arcMin, 0);
    const limit = Number.isFinite(Number(count)) && Number(count) > 0
      ? Math.trunc(Number(count))
      : Math.floor(available / step) + 1;
    const placements = [];

    for (let index = 0; index < limit; index += 1) {
      const jitteredAlongMetres = arcMin + Number(phase) * step + index * step
        + (random() - 0.5) * 2 * Number(jitterAlong || 0);
      if (jitteredAlongMetres > arcMax + 1e-6 || jitteredAlongMetres < arcMin - 1e-6) continue;
      const along = atArcLength(jitteredAlongMetres);
      const across = Number(offset) + (random() - 0.5) * 2 * Number(jitterOffset || 0);
      const { x, z } = toWorld({ along, offset: across });
      if (!passesMask(mask, x, z)) continue;
      placements.push({
        along,
        heading: headingAt(along),
        offset: across,
        x,
        y: placementY(heightAt, x, z),
        z,
      });
    }
    return placements;
  }

  return Object.freeze({
    arcLengthAt,
    atArcLength,
    bandMask,
    closed,
    domain: Object.freeze([start, end]),
    fromWorld,
    headingAt,
    length: total,
    normalAt,
    offsetAxis,
    pointAt,
    scatterAlong,
    stepAlong,
    tangentAt,
    toWorld,
  });
}
