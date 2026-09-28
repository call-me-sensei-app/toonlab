/**
 * Returns the two nearest feature-point distances { f1, f2 } for a point.
 * `jitter` in [0, 1] moves feature points from cell centers (0) to fully
 * random positions (1). Distances are Euclidean, in noise-space units.
 */
export function cellular3(seed: any, x: any, y: any, z: any, jitter?: number): {
    f1: number;
    f2: number;
};
/**
 * 2D cellular noise in the XZ plane with a stable per-cell id — the basis
 * of the columnar-jointing stage (each Voronoi cell = one rock column).
 * Returns { f1, f2, id } where `id` is the nearest cell's hash in [0, 1).
 */
export function cellular2(seed: any, x: any, z: any, jitter?: number): {
    f1: number;
    f2: number;
    id: number;
};
/**
 * Facet crease profile: 1 at cell borders (F2 ≈ F1), falling to 0 inside
 * cells. `width` controls how far the crease reaches into the cell.
 */
export function cellularCrease3(seed: any, x: any, y: any, z: any, jitter?: number, width?: number): number;
