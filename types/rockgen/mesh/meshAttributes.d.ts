/** Central-difference field gradient per vertex, normalized. */
export function computeGradientNormals(evaluate: any, positions: any, epsilon: any): Float32Array<any>;
/**
 * Five-tap SDF ambient occlusion along the vertex normal. Near-free since
 * the field is already compiled, deterministic, and baked into the
 * `envVertexAo` attribute (1 = open, matching environmentVertexAo.js).
 */
export function computeSdfAo(evaluate: any, positions: any, normals: any, { radius, strength }: {
    radius: any;
    strength: any;
}): Float32Array<ArrayBuffer>;
/**
 * Baked stylized albedo: base color, cavity color mixed in by occlusion,
 * top (snow/moss/highlight) color by up-slope and height band, plus a low
 * amplitude seeded color variation.
 */
export function computeVertexColors(positions: any, normals: any, ao: any, surface: any, seed: any, bounds: any, tintAt?: any): Float32Array<any>;
/**
 * De-indexes positions and emits per-face normals for the 'flat' normals
 * mode. Colors/AO are expanded alongside so the attribute contract holds.
 */
export function deindexWithFlatNormals({ ao, colors, indices, positions }: {
    ao: any;
    colors: any;
    indices: any;
    positions: any;
}): {
    ao: Float32Array<any>;
    colors: Float32Array<ArrayBuffer>;
    normals: Float32Array<ArrayBuffer>;
    positions: Float32Array<ArrayBuffer>;
};
