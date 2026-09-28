// Seeded 3D cellular (Voronoi/Worley) noise. F2 - F1 approaches zero along
// cell borders, which rockgen carves into the field as facet creases — the
// hard-planed, fractured look that sells stylized rock without any texture.

import { hash3u } from './prng.js';

/**
 * Returns the two nearest feature-point distances { f1, f2 } for a point.
 * `jitter` in [0, 1] moves feature points from cell centers (0) to fully
 * random positions (1). Distances are Euclidean, in noise-space units.
 */
export function cellular3(seed, x, y, z, jitter = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);

  let f1 = Infinity;
  let f2 = Infinity;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const h = hash3u(seed, cx, cy, cz);
        // Derive three decorrelated offsets from one hash (11/11/10 bits).
        const ox = 0.5 + jitter * (((h & 0x7ff) / 0x7ff) - 0.5);
        const oy = 0.5 + jitter * ((((h >>> 11) & 0x7ff) / 0x7ff) - 0.5);
        const oz = 0.5 + jitter * ((((h >>> 22) & 0x3ff) / 0x3ff) - 0.5);
        const px = cx + ox - x;
        const py = cy + oy - y;
        const pz = cz + oz - z;
        const d = px * px + py * py + pz * pz;
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return { f1: Math.sqrt(f1), f2: Math.sqrt(f2) };
}

/**
 * 2D cellular noise in the XZ plane with a stable per-cell id — the basis
 * of the columnar-jointing stage (each Voronoi cell = one rock column).
 * Returns { f1, f2, id } where `id` is the nearest cell's hash in [0, 1).
 */
export function cellular2(seed, x, z, jitter = 1) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);

  let f1 = Infinity;
  let f2 = Infinity;
  let id = 0;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = xi + dx;
      const cz = zi + dz;
      const h = hash3u(seed, cx, 0, cz);
      const ox = 0.5 + jitter * (((h & 0xffff) / 0xffff) - 0.5);
      const oz = 0.5 + jitter * ((((h >>> 16) & 0xffff) / 0xffff) - 0.5);
      const px = cx + ox - x;
      const pz = cz + oz - z;
      const d = px * px + pz * pz;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = h / 4294967296;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1: Math.sqrt(f1), f2: Math.sqrt(f2), id };
}

/**
 * Facet crease profile: 1 at cell borders (F2 ≈ F1), falling to 0 inside
 * cells. `width` controls how far the crease reaches into the cell.
 */
export function cellularCrease3(seed, x, y, z, jitter = 1, width = 0.35) {
  const { f1, f2 } = cellular3(seed, x, y, z, jitter);
  const edge = (f2 - f1) / width;
  if (edge >= 1) return 0;
  if (edge <= 0) return 1;
  // Smoothstep falloff keeps the crease shoulder soft at mesh resolution.
  const t = 1 - edge;
  return t * t * (3 - 2 * t);
}
