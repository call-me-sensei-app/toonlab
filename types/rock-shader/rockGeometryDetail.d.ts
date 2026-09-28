/**
 * Detail options for a rock of a given measured size.
 *
 * `amount` and `scale` are metres, so the tuned defaults silently mean
 * something different on every asset that is not 5.94 m across. This is the
 * geometry-side twin of `resolveCatalogRockProjectionScale`: hold the relief
 * *proportional to the stone* instead of holding the absolute displacement,
 * which is what keeps a 0.6 m stepping stone and a 6 m cliff reading as the
 * same material.
 *
 * `subdivisions` is derived from a triangle target rather than fixed, because
 * the catalog's density is wildly uneven — garden-scale families ship
 * 120-460 triangles where cliff families ship 1,500-4,000, so one fixed level
 * count either starves the small assets or wastes budget on the large ones.
 *
 * @param {object} options
 * @param {number|number[]} [options.size]      Largest dimension in metres, or a bounds triple.
 * @param {string} [options.character]          Key of `ROCK_GEOMETRY_DETAIL_CHARACTER`.
 * @param {number} [options.relief]             Explicit relief multiplier; wins over `character`.
 * @param {number} [options.triangles]          Source triangle count, for the subdivision target.
 * @param {number} [options.triangleTarget]     Desired post-subdivision triangles.
 * @param {number} [options.variation]          Per-asset decorrelation index.
 * @param {number} [options.maxSubdivisions]    Ceiling on subdivision levels.
 * @returns {RockGeometryDetailOptions} options ready for `applyRockGeometryDetail`.
 */
export function resolveRockGeometryDetailForSize({ size, character, relief, triangles, triangleTarget, variation, maxSubdivisions, }?: {
    size?: number | number[];
    character?: string;
    relief?: number;
    triangles?: number;
    triangleTarget?: number;
    variation?: number;
    maxSubdivisions?: number;
}): RockGeometryDetailOptions;
/**
 * Displacement controls. Declared explicitly because inferring them from the
 * frozen defaults yields literal types (`scale?: 0.65`), which would reject
 * every real caller value and force a permissive declaration fallback.
 *
 * @typedef {object} RockGeometryDetailOptions
 * @property {number} [amount]          Peak displacement along the normal, metres.
 * @property {boolean} [cavity]         Write the concavity channel the moss mask reads.
 * @property {number} [cavityGain]      Scales the curvature response before clamping.
 * @property {number} [cavityMicro]     Folds displacement pits into the macro curvature.
 * @property {number} [lacunarity]      Frequency step between octaves.
 * @property {number} [normalStrength]  Scales the gradient-driven normal tilt.
 * @property {number} [octaves]         fBm octave count.
 * @property {number} [scale]           Coarsest feature size, metres.
 * @property {boolean} [smoothNormals]  Average normals across coincident vertices first.
 * @property {number} [subdivisions]    Midpoint subdivision levels (4^n triangles).
 * @property {number} [variation]       Per-asset index; equal indices give equal relief.
 */
/**
 * @typedef {object} RockDetailHeightOptions
 * @property {number} [lacunarity]
 * @property {number} [octaves]
 * @property {number} [scale]
 * @property {number} [seed]
 */
/**
 * Signed fBm height in roughly [-1, 1].
 *
 * `seed` offsets the lattice rather than reseeding the hash, which keeps the
 * field continuous and makes adjacent variation indices genuinely different
 * surfaces instead of near-copies.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {RockDetailHeightOptions} [options]
 * @returns {number}
 */
export function rockDetailHeight(x: number, y: number, z: number, { lacunarity, octaves, scale, seed, }?: RockDetailHeightOptions): number;
/**
 * Per-vertex concavity of the mesh's own form, in [0,1].
 *
 * Moss does not colonise by slope. It colonises where moisture collects and
 * light is indirect — crevices, hollows, the junction where one slab meets
 * another. Slope cannot express any of that, which is why a slope-only mask
 * reads as a tint painted on rather than a material growing in.
 *
 * The estimator is the standard discrete mean-curvature sign test: for each
 * welded vertex, take the centroid of its one-ring neighbours and project the
 * offset onto the vertex normal. A centroid sitting along +n means the surface
 * curves away on all sides — a hollow. Along -n means a ridge or an exposed
 * corner. Normalising by the local edge length keeps it scale-invariant, so the
 * same term works on a 0.4 m stepping stone and a 6 m cliff.
 *
 * Computed BEFORE subdivision deliberately: the coarse mesh's edges span the
 * macro form, which is where the real crevices are. Subdivision then
 * interpolates the attribute for free, giving a smooth moisture field rather
 * than a stair-stepped one.
 *
 * @param {import('three').BufferGeometry} geometry Non-indexed triangle soup.
 * @param {number} [gain] Scales the curvature response before clamping.
 * @returns {Float32Array} one value per vertex.
 */
export function computeMeshCavity(geometry: import("three").BufferGeometry, gain?: number): Float32Array;
/**
 * Per-vertex concavity AND convexity of the mesh's own form, both in [0,1].
 *
 * One traversal, one curvature estimate, two rectified halves. `cavity` keeps
 * the positive sign (hollows, crevices, slab junctions) and `exposure` keeps the
 * negative one (crowns, ridges, shoulders, exposed corners). They are mutually
 * exclusive per vertex by construction, and a flat face scores 0 in both.
 *
 * Splitting them matters because the two halves answer different questions for
 * the moss mask: cavity says where water lingers, exposure says where it never
 * does. A mask holding only the first can add moss to hollows but cannot take it
 * off a crown, which leaves the noise field as the sole thing distinguishing one
 * upper face from another — and noise uncorrelated with form is the definition
 * of camouflage (D19-212).
 *
 * @param {import('three').BufferGeometry} geometry Non-indexed triangle soup.
 * @param {number} [gain] Scales the curvature response before clamping.
 * @returns {{cavity: Float32Array, exposure: Float32Array}} one value per vertex each.
 */
export function computeMeshCurvature(geometry: import("three").BufferGeometry, gain?: number): {
    cavity: Float32Array;
    exposure: Float32Array;
};
/**
 * Averages normals across coincident vertices, in place.
 *
 * This is the operation the module's header warns against — and it is warned
 * against for FRACTURED stone, where welding rounds the authored arris edges
 * into a pebble. For water-worn stone the reverse is true: the asset has no
 * arris edges to protect, and the catalog's garden-scale families ship flat
 * per-face normals on a 120-460 triangle hull, so the shading breaks into
 * gemstone facets that no amount of subdivision or displacement can hide.
 *
 * Applied BEFORE subdivision, so the interpolation that follows carries a
 * smooth field rather than re-splitting a faceted one.
 *
 * @param {import('three').BufferGeometry} geometry Non-indexed triangle soup.
 * @returns {number} vertices whose normal was replaced.
 */
export function smoothMeshNormals(geometry: import("three").BufferGeometry): number;
/**
 * Subdivides and displaces one geometry in place.
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {RockGeometryDetailOptions} [options]
 * @returns {{triangles: number, subdivisions: number, amount: number, cavity: boolean} | null} applied detail.
 */
export function applyRockGeometryDetailToGeometry(geometry: import("three").BufferGeometry, { amount, cavity, cavityGain, cavityMicro, lacunarity, normalStrength, octaves, scale, smoothNormals, subdivisions, variation, }?: RockGeometryDetailOptions): {
    triangles: number;
    subdivisions: number;
    amount: number;
    cavity: boolean;
} | null;
/**
 * Adds geometry detail to every rock mesh under `root`.
 *
 * Idempotent per mesh: a geometry already enriched is skipped, so calling this
 * twice cannot compound displacement into mush.
 *
 * @param {import('three').Object3D} root
 * @param {RockGeometryDetailOptions} [options]
 * @returns {{meshes: number, triangles: number, trianglesBefore: number, skipped: number, cavity: number}} meshes that received a cavity channel are counted in `cavity`.
 */
export function applyRockGeometryDetail(root: import("three").Object3D, options?: RockGeometryDetailOptions): {
    meshes: number;
    triangles: number;
    trianglesBefore: number;
    skipped: number;
    cavity: number;
};
/**
 * Displacement defaults, tuned against shot S08's 85 mm framing on
 * ROCK-COAST-01 — the closest any launch frame gets to a rock.
 *
 * `amount` is in metres and the useful window is narrow. At 0.055 the straight
 * silhouette edges soften but the broad faces stay visibly planar; at 0.16 with
 * a 0.40 scale the asset turns to lumpy wax and the crisp stylized arris that
 * makes it read as cliff rather than boulder is gone. 0.10 m at a 0.65 m
 * feature scale erodes the edges and breaks up the faces while keeping the
 * authored silhouette legible.
 *
 * `subdivisions: 2` (16x triangles) resolves this scale almost as well as 3
 * (64x) at a quarter of the cost, so 3 is reserved for a hero close-up.
 */
export const DEFAULT_ROCK_GEOMETRY_DETAIL: Readonly<{
    amount: 0.1;
    cavity: true;
    cavityGain: 2.6;
    cavityMicro: 0.55;
    lacunarity: 2.03;
    normalStrength: 1;
    octaves: 4;
    scale: 0.65;
    subdivisions: 2;
    variation: 0;
}>;
/** Subdivision is 4^levels triangles; past this a hero mesh stops being sane. */
export const MAX_ROCK_DETAIL_SUBDIVISIONS: 3;
/**
 * The size the defaults were tuned against: ROCK-COAST-01 at 5.94 m.
 * `amount` and `scale` are absolute metres, so they only mean what they were
 * tuned to mean on a rock of about this size.
 */
export const ROCK_GEOMETRY_DETAIL_REFERENCE: Readonly<{
    amount: 0.1;
    scale: 0.65;
    size: 5.94;
    /** ROCK-COAST-01's LOD0 count, which sets the reference facet size. */
    triangles: 4006;
}>;
/**
 * Relief multipliers by stone character.
 *
 * A fractured cliff and a water-worn garden boulder are not the same surface
 * at different sizes — the boulder is smoother *in proportion to itself*,
 * because the process that shaped it removed relief rather than creating it.
 * Scaling the cliff numbers geometrically onto a 1.3 m boulder gives a lumpy
 * potato; these are the honest per-character corrections.
 */
export const ROCK_GEOMETRY_DETAIL_CHARACTER: Readonly<{
    /** Fractured, bedded, quarried — the tuned cliff response. */
    fractured: 1;
    /** Glacially rounded or water-worn: soft convex form, shallow relief. */
    worn: 0.42;
    /** Weathered but still angular: talus, frost-shattered fragments. */
    weathered: 0.72;
}>;
/** Vertex attribute carrying the concavity term the moss mask reads. */
export const ROCK_CAVITY_ATTRIBUTE: "rockCavity";
/**
 * Vertex attribute carrying the CONVEXITY term — the signed opposite of
 * `ROCK_CAVITY_ATTRIBUTE`.
 *
 * `computeMeshCavity` clamps its curvature to [0,1], so every convex vertex —
 * every crown, ridge, shoulder and exposed corner — resolves to exactly 0 and
 * is indistinguishable from a flat face. The moss support term could therefore
 * express "this is a hollow" but had no way to express "this is a weather-beaten
 * crown", and a crown is precisely where moss is absent: it sheds water, it is
 * scoured, and it dries first.
 *
 * That missing half is why moss distributed evenly over exposed upper faces
 * (D19-212). It is the same estimator, the same pass and the same interpolation;
 * only the sign kept is different.
 */
export const ROCK_EXPOSURE_ATTRIBUTE: "rockExposure";
/**
 * Displacement controls. Declared explicitly because inferring them from the
 * frozen defaults yields literal types (`scale?: 0.65`), which would reject
 * every real caller value and force a permissive declaration fallback.
 */
export type RockGeometryDetailOptions = {
    /**
     * Peak displacement along the normal, metres.
     */
    amount?: number;
    /**
     * Write the concavity channel the moss mask reads.
     */
    cavity?: boolean;
    /**
     * Scales the curvature response before clamping.
     */
    cavityGain?: number;
    /**
     * Folds displacement pits into the macro curvature.
     */
    cavityMicro?: number;
    /**
     * Frequency step between octaves.
     */
    lacunarity?: number;
    /**
     * Scales the gradient-driven normal tilt.
     */
    normalStrength?: number;
    /**
     * fBm octave count.
     */
    octaves?: number;
    /**
     * Coarsest feature size, metres.
     */
    scale?: number;
    /**
     * Average normals across coincident vertices first.
     */
    smoothNormals?: boolean;
    /**
     * Midpoint subdivision levels (4^n triangles).
     */
    subdivisions?: number;
    /**
     * Per-asset index; equal indices give equal relief.
     */
    variation?: number;
};
export type RockDetailHeightOptions = {
    lacunarity?: number;
    octaves?: number;
    scale?: number;
    seed?: number;
};
