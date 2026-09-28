/**
 * Samples `evaluate` over a uniform grid covering `bounds`. `resolution` is
 * the cell count along the longest axis; other axes derive from aspect so
 * cells stay cubic.
 *
 * Returns { values, dims, origin, cellSize } where `values` holds
 * (nx+1)*(ny+1)*(nz+1) corner samples (x fastest, then y, then z).
 */
export function sampleGrid(evaluate: any, bounds: any, resolution: any): {
    cellSize: number;
    dims: number[];
    origin: any[];
    values: Float32Array<ArrayBuffer>;
};
/**
 * Extracts the zero isosurface from a sampled grid. Returns
 * { positions: Float32Array, indices: Uint32Array } in world space.
 *
 * @param {object} grid From sampleGrid().
 * @param {object} [options]
 * @param {(x,y,z)=>number} [options.evaluate] Field for gradient normals —
 *   enables dual-contouring (QEF) vertex placement; omit for mass points.
 */
export function surfaceNets(grid: object, { evaluate }?: {
    evaluate?: (x: any, y: any, z: any) => number;
}): {
    indices: Uint32Array<ArrayBuffer>;
    positions: Float32Array<ArrayBuffer>;
};
/**
 * Drops disconnected surface fragments smaller than `minRatio` of the
 * largest component's triangle count, compacting the vertex list. Strong
 * domain warp / high noise amplitudes routinely pinch off small floating
 * islands; they read as artifacts, so meshDocument filters them by default.
 */
export function filterSmallIslands({ indices, positions }: {
    indices: any;
    positions: any;
}, minRatio?: number): {
    indices: any;
    positions: any;
};
