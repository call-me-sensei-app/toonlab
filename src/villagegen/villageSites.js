// POI site selection: score the terrain per archetype (flatness, dryness,
// shore/hilltop affinities from the archetype table), then greedy-pick
// mutually distant winners. Deterministic per seed.

import { POI_ARCHETYPES } from './villageArchetypes.js';

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

/**
 * @param {Object} options
 * @param {Function} options.heightAt
 * @param {number} [options.waterLevel]
 * @param {number|{x,z}} [options.size]
 * @param {number} [options.seed]
 * @param {Array<{archetype: string, count: number, radius?: number}>} options.requests
 * @returns {Array<{archetype, seed, x, z, radius}>}
 */
export function pickPoiSites({
  heightAt,
  waterLevel = 0,
  size = 1000,
  seed = 1,
  requests = [],
} = {}) {
  const width = Number(size?.width ?? size?.x ?? size) || 1000;
  const depth = Number(size?.depth ?? size?.z ?? size) || 1000;
  const random = mulberry32(seed * 22695477 + 3);
  const innerX = width * 0.4;
  const innerZ = depth * 0.4;

  const slopeAt = (x, z) => {
    const step = 3;
    const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
    const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
    return Math.hypot(dx, dz);
  };
  const shoreDistance = (x, z) => {
    for (const reach of [6, 12, 20, 28]) {
      for (let probe = 0; probe < 8; probe += 1) {
        const angle = (probe / 8) * Math.PI * 2;
        if (heightAt(x + Math.cos(angle) * reach, z + Math.sin(angle) * reach) <= waterLevel) {
          return reach;
        }
      }
    }
    return 99;
  };
  const context = { heightAt, shoreDistance, slopeAt, waterLevel };

  // Site flatness must hold across the whole radius, not just the center —
  // sample a ring too.
  const areaScore = (archetypeSpec, x, z, radius) => {
    let score = archetypeSpec.siteScore(x, z, context);
    if (score <= 0) return 0;
    for (let probe = 0; probe < 4; probe += 1) {
      const angle = (probe / 4) * Math.PI * 2 + 0.5;
      const rx = x + Math.cos(angle) * radius * 0.6;
      const rz = z + Math.sin(angle) * radius * 0.6;
      const ringScore = archetypeSpec.siteScore(rx, rz, context);
      if (ringScore <= 0) return 0;
      score += ringScore * 0.25;
    }
    return score;
  };

  const picked = [];
  for (const request of requests) {
    const archetypeSpec = POI_ARCHETYPES[request.archetype];
    if (!archetypeSpec) continue;
    const radius = request.radius ?? Math.max(archetypeSpec.minRadius, 30);
    for (let instance = 0; instance < (request.count ?? 1); instance += 1) {
      let best = null;
      for (let attempt = 0; attempt < 220; attempt += 1) {
        const x = (random() * 2 - 1) * innerX;
        const z = (random() * 2 - 1) * innerZ;
        let clear = true;
        for (const site of picked) {
          const minDistance = site.radius + radius + 40;
          if ((site.x - x) ** 2 + (site.z - z) ** 2 < minDistance ** 2) { clear = false; break; }
        }
        if (!clear) continue;
        const score = areaScore(archetypeSpec, x, z, radius);
        if (score > 0 && (!best || score > best.score)) best = { score, x, z };
      }
      if (!best) continue; // terrain had no room — honest miss, not a crash
      picked.push({
        archetype: request.archetype,
        radius,
        seed: Math.floor(random() * 0xffffffff),
        x: best.x,
        z: best.z,
      });
    }
  }
  return picked;
}
