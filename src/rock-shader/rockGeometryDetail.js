// Geometry-side surface detail for rock meshes.
//
// A detail normal map can only shade relief that the silhouette never shows.
// Published catalog cliffs are 1.5k-4k triangles, which is ample at mid
// distance and visibly faceted in a close framing: large planar spans and hard
// straight silhouette edges that no normal map can break up, because the
// geometry genuinely is flat there.
//
// This module adds the missing geometry, deterministically and at load time:
// subdivide, then displace along the interpolated normal with a value-noise
// fBm evaluated in the mesh's own local space.
//
// Two decisions worth stating, because the obvious implementations are wrong:
//
//   * Normals are NOT recomputed with `computeVertexNormals()`. Subdivision
//     output is non-indexed, so that call produces flat per-face normals and
//     makes the faceting worse than it started. Welding by position instead
//     over-smooths: a rock's crisp arris edges are load-bearing in the
//     stylized read, and averaging across them rounds the asset into a pebble.
//     The original normals are interpolated through subdivision and then
//     perturbed by the *gradient of the same height field* that moved the
//     vertices, so shading stays consistent with the new surface while every
//     authored hard edge survives.
//
//   * Displacement is evaluated in local space, not world space. A rock's
//     surface must not swim when the scene moves it, and keying the field to
//     `variation` is what makes two placements of the same geology carry
//     different relief — the per-asset separation that shared texture maps
//     cannot provide.
//
// Nothing here touches the catalog artifact; it operates on the loaded mesh.

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
export const DEFAULT_ROCK_GEOMETRY_DETAIL = Object.freeze({
  amount: 0.1,
  // Concavity channel for the moss mask. `cavityMicro` folds the displacement's
  // own pits into the macro curvature, so moss gathers in the fine hollows the
  // noise just carved as well as in the mesh's structural crevices.
  cavity: true,
  cavityGain: 2.6,
  cavityMicro: 0.55,
  lacunarity: 2.03,
  normalStrength: 1,
  octaves: 4,
  scale: 0.65,
  subdivisions: 2,
  variation: 0,
});

/** Subdivision is 4^levels triangles; past this a hero mesh stops being sane. */
export const MAX_ROCK_DETAIL_SUBDIVISIONS = 3;

/**
 * Displacement as a fraction of the coarsest feature size.
 *
 * The reference pairing (0.1 m displacement at a 0.65 m feature scale) is
 * 0.154, so this preserves the tuned cliff response exactly while making the
 * relationship the derivation actually depends on explicit.
 */
const FEATURE_RELIEF_FRACTION = DEFAULT_ROCK_GEOMETRY_DETAIL.amount
  / DEFAULT_ROCK_GEOMETRY_DETAIL.scale;

/**
 * The size the defaults were tuned against: ROCK-COAST-01 at 5.94 m.
 * `amount` and `scale` are absolute metres, so they only mean what they were
 * tuned to mean on a rock of about this size.
 */
export const ROCK_GEOMETRY_DETAIL_REFERENCE = Object.freeze({
  amount: DEFAULT_ROCK_GEOMETRY_DETAIL.amount,
  scale: DEFAULT_ROCK_GEOMETRY_DETAIL.scale,
  size: 5.94,
  /** ROCK-COAST-01's LOD0 count, which sets the reference facet size. */
  triangles: 4006,
});

/**
 * Relief multipliers by stone character.
 *
 * A fractured cliff and a water-worn garden boulder are not the same surface
 * at different sizes — the boulder is smoother *in proportion to itself*,
 * because the process that shaped it removed relief rather than creating it.
 * Scaling the cliff numbers geometrically onto a 1.3 m boulder gives a lumpy
 * potato; these are the honest per-character corrections.
 */
export const ROCK_GEOMETRY_DETAIL_CHARACTER = Object.freeze({
  /** Fractured, bedded, quarried — the tuned cliff response. */
  fractured: 1,
  /** Glacially rounded or water-worn: soft convex form, shallow relief. */
  worn: 0.42,
  /** Weathered but still angular: talus, frost-shattered fragments. */
  weathered: 0.72,
});

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
export function resolveRockGeometryDetailForSize({
  size = ROCK_GEOMETRY_DETAIL_REFERENCE.size,
  character = 'fractured',
  relief = Number.NaN,
  triangles = 0,
  triangleTarget = 2600,
  variation = 0,
  maxSubdivisions = MAX_ROCK_DETAIL_SUBDIVISIONS,
} = {}) {
  const largest = Array.isArray(size)
    ? Math.max(...size.map((value) => Math.abs(Number(value) || 0)))
    : Math.abs(Number(size) || 0);
  const span = largest > 0 ? largest : ROCK_GEOMETRY_DETAIL_REFERENCE.size;
  const ratio = span / ROCK_GEOMETRY_DETAIL_REFERENCE.size;
  const character_ = ROCK_GEOMETRY_DETAIL_CHARACTER[character];
  const reliefScale = Number.isFinite(relief)
    ? Math.max(0, relief)
    : (Number.isFinite(character_) ? character_ : 1);

  const ceiling = Math.max(0, Math.min(MAX_ROCK_DETAIL_SUBDIVISIONS, Math.trunc(maxSubdivisions)));
  let subdivisions = 0;
  const source = Math.max(0, Math.trunc(Number(triangles) || 0));
  if (source > 0 && triangleTarget > 0) {
    while (subdivisions < ceiling && source * (4 ** subdivisions) < triangleTarget) {
      subdivisions += 1;
    }
  } else {
    subdivisions = Math.min(ceiling, DEFAULT_ROCK_GEOMETRY_DETAIL.subdivisions);
  }

  // Relief is keyed to FACET SIZE, not to the asset span, and the difference
  // is not academic.
  //
  // Scaling the tuned 0.1 m by span alone gives 9 mm on a 1.3 m boulder. That
  // is invisible, because what has to be eroded is not the rock — it is the
  // flat spans of its hull, and midpoint subdivision splits triangles without
  // moving them, so a 120-triangle hull is still a 120-facet hull at 7,680
  // triangles. Facet size is `span / sqrt(triangles)`, and by that measure the
  // 1.28 m / 120-triangle boulder has facets of 0.117 m against the 5.94 m /
  // 4,006-triangle cliff's 0.094 m — LARGER, despite being a fifth the size.
  // Span-derived relief had it backwards and flattened exactly the assets that
  // needed the most help.
  const referenceFacet = ROCK_GEOMETRY_DETAIL_REFERENCE.size
    / Math.sqrt(ROCK_GEOMETRY_DETAIL_REFERENCE.triangles);
  const facet = source > 0 ? span / Math.sqrt(source) : referenceFacet * ratio;
  const facetRatio = referenceFacet > 0 ? facet / referenceFacet : 1;
  const featureScale = ROCK_GEOMETRY_DETAIL_REFERENCE.scale * facetRatio;
  return {
    amount: featureScale * FEATURE_RELIEF_FRACTION * reliefScale,
    cavity: DEFAULT_ROCK_GEOMETRY_DETAIL.cavity,
    cavityGain: DEFAULT_ROCK_GEOMETRY_DETAIL.cavityGain,
    cavityMicro: DEFAULT_ROCK_GEOMETRY_DETAIL.cavityMicro,
    lacunarity: DEFAULT_ROCK_GEOMETRY_DETAIL.lacunarity,
    normalStrength: DEFAULT_ROCK_GEOMETRY_DETAIL.normalStrength,
    octaves: DEFAULT_ROCK_GEOMETRY_DETAIL.octaves,
    scale: featureScale,
    // Water-worn stone has no arris edges to protect — the process that made
    // it removed them. Smoothing is wrong for a fractured cliff and right
    // here, and without it a 120-facet catalog boulder shades as a gemstone.
    smoothNormals: character === 'worn' && !Number.isFinite(relief),
    subdivisions,
    variation: Math.trunc(Number(variation) || 0),
  };
}

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep01(t) {
  return t * t * (3 - (2 * t));
}

/** Trilinear value noise in [0,1]. */
function valueNoise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const tx = smoothstep01(x - xi);
  const ty = smoothstep01(y - yi);
  const tz = smoothstep01(z - zi);
  let result = 0;
  for (let dz = 0; dz <= 1; dz += 1) {
    const wz = dz ? tz : 1 - tz;
    for (let dy = 0; dy <= 1; dy += 1) {
      const wy = dy ? ty : 1 - ty;
      for (let dx = 0; dx <= 1; dx += 1) {
        const wx = dx ? tx : 1 - tx;
        result += hash3(xi + dx, yi + dy, zi + dz) * wx * wy * wz;
      }
    }
  }
  return result;
}

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
export function rockDetailHeight(x, y, z, {
  lacunarity = DEFAULT_ROCK_GEOMETRY_DETAIL.lacunarity,
  octaves = DEFAULT_ROCK_GEOMETRY_DETAIL.octaves,
  scale = DEFAULT_ROCK_GEOMETRY_DETAIL.scale,
  seed = 0,
} = {}) {
  const invScale = 1 / Math.max(1e-4, scale);
  const offset = (seed % 64) * 17.31;
  let frequency = invScale;
  let amplitude = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += amplitude * valueNoise3(
      (x * frequency) + offset,
      (y * frequency) + (offset * 0.7),
      (z * frequency) + (offset * 1.3),
    );
    normalization += amplitude;
    frequency *= lacunarity;
    amplitude *= 0.5;
  }
  return ((total / normalization) * 2) - 1;
}

/** Vertex attribute carrying the concavity term the moss mask reads. */
export const ROCK_CAVITY_ATTRIBUTE = 'rockCavity';

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
export const ROCK_EXPOSURE_ATTRIBUTE = 'rockExposure';

function positionKey(x, y, z) {
  // 0.1 mm quantisation: welds the duplicated corners of a non-indexed soup
  // without merging genuinely distinct surfaces.
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
}

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
export function computeMeshCavity(geometry, gain = 2.6) {
  return computeMeshCurvature(geometry, gain).cavity;
}

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
export function computeMeshCurvature(geometry, gain = 2.6) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const count = position.count;
  const values = new Float32Array(count);
  const exposure = new Float32Array(count);
  if (!normal) return { cavity: values, exposure };

  /** @type {Map<string, {x: number, y: number, z: number, n: number, edge: number, edges: number}>} */
  const rings = new Map();
  const addNeighbour = (key, nx, ny, nz, edge) => {
    const entry = rings.get(key);
    if (!entry) return;
    entry.x += nx; entry.y += ny; entry.z += nz; entry.n += 1;
    entry.edge += edge; entry.edges += 1;
  };

  const keys = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const key = positionKey(position.getX(i), position.getY(i), position.getZ(i));
    keys[i] = key;
    if (!rings.has(key)) rings.set(key, { edge: 0, edges: 0, n: 0, x: 0, y: 0, z: 0 });
  }

  for (let triangle = 0; triangle < count; triangle += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const self = triangle + corner;
      const sx = position.getX(self);
      const sy = position.getY(self);
      const sz = position.getZ(self);
      for (let other = 1; other <= 2; other += 1) {
        const index = triangle + ((corner + other) % 3);
        const ox = position.getX(index);
        const oy = position.getY(index);
        const oz = position.getZ(index);
        addNeighbour(keys[self], ox, oy, oz, Math.hypot(ox - sx, oy - sy, oz - sz));
      }
    }
  }

  for (let i = 0; i < count; i += 1) {
    const ring = rings.get(keys[i]);
    if (!ring || ring.n === 0 || ring.edges === 0) continue;
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    const meanEdge = ring.edge / ring.edges;
    if (!(meanEdge > 0)) continue;
    let nx = normal.getX(i);
    let ny = normal.getY(i);
    let nz = normal.getZ(i);
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    const dx = (ring.x / ring.n) - px;
    const dy = (ring.y / ring.n) - py;
    const dz = (ring.z / ring.n) - pz;
    const curvature = ((dx * nx) + (dy * ny) + (dz * nz)) / meanEdge;
    values[i] = Math.min(1, Math.max(0, curvature * gain));
    exposure[i] = Math.min(1, Math.max(0, -curvature * gain));
  }
  return { cavity: values, exposure };
}

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
export function smoothMeshNormals(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return 0;
  const count = position.count;
  /** @type {Map<string, number[]>} */
  const sums = new Map();
  const keys = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const key = positionKey(position.getX(i), position.getY(i), position.getZ(i));
    keys[i] = key;
    const entry = sums.get(key);
    if (entry) {
      entry[0] += normal.getX(i);
      entry[1] += normal.getY(i);
      entry[2] += normal.getZ(i);
    } else {
      sums.set(key, [normal.getX(i), normal.getY(i), normal.getZ(i)]);
    }
  }
  let replaced = 0;
  for (let i = 0; i < count; i += 1) {
    const entry = sums.get(keys[i]);
    if (!entry) continue;
    const length = Math.hypot(entry[0], entry[1], entry[2]);
    if (!(length > 0)) continue;
    normal.setXYZ(i, entry[0] / length, entry[1] / length, entry[2] / length);
    replaced += 1;
  }
  normal.needsUpdate = true;
  return replaced;
}

function interpolatedAttributeArray(attribute, triangleCount, verticesPerTriangle) {
  const itemSize = attribute.itemSize;
  return new Float32Array(triangleCount * verticesPerTriangle * itemSize);
}

/**
 * One level of midpoint subdivision on a non-indexed geometry: every triangle
 * becomes four. Every float attribute is interpolated, so uvs, colors and any
 * authored channel survive rather than being silently dropped.
 */
function subdivideOnce(geometry) {
  const attributes = Object.entries(geometry.attributes)
    .filter(([, attribute]) => attribute?.array && typeof attribute.itemSize === 'number');
  const position = geometry.attributes.position;
  const triangleCount = position.count / 3;
  const next = {};
  for (const [name, attribute] of attributes) {
    next[name] = interpolatedAttributeArray(attribute, triangleCount * 4, 3);
  }

  for (const [name, attribute] of attributes) {
    const size = attribute.itemSize;
    const source = attribute.array;
    const target = next[name];
    let write = 0;
    const emit = (values) => {
      for (let i = 0; i < size; i += 1) target[write + i] = values[i];
      write += size;
    };
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const base = triangle * 3 * size;
      const a = [];
      const b = [];
      const c = [];
      for (let i = 0; i < size; i += 1) {
        a.push(source[base + i]);
        b.push(source[base + size + i]);
        c.push(source[base + (size * 2) + i]);
      }
      const ab = a.map((value, i) => (value + b[i]) * 0.5);
      const bc = b.map((value, i) => (value + c[i]) * 0.5);
      const ca = c.map((value, i) => (value + a[i]) * 0.5);
      emit(a); emit(ab); emit(ca);
      emit(ab); emit(b); emit(bc);
      emit(ca); emit(bc); emit(c);
      emit(ab); emit(bc); emit(ca);
    }
  }

  for (const [name, attribute] of attributes) {
    geometry.setAttribute(name, new attribute.constructor(next[name], attribute.itemSize));
  }
  return geometry;
}

/**
 * Subdivides and displaces one geometry in place.
 *
 * @param {import('three').BufferGeometry} geometry
 * @param {RockGeometryDetailOptions} [options]
 * @returns {{triangles: number, subdivisions: number, amount: number, cavity: boolean} | null} applied detail.
 */
export function applyRockGeometryDetailToGeometry(geometry, {
  amount = DEFAULT_ROCK_GEOMETRY_DETAIL.amount,
  cavity = DEFAULT_ROCK_GEOMETRY_DETAIL.cavity,
  cavityGain = DEFAULT_ROCK_GEOMETRY_DETAIL.cavityGain,
  cavityMicro = DEFAULT_ROCK_GEOMETRY_DETAIL.cavityMicro,
  lacunarity = DEFAULT_ROCK_GEOMETRY_DETAIL.lacunarity,
  normalStrength = DEFAULT_ROCK_GEOMETRY_DETAIL.normalStrength,
  octaves = DEFAULT_ROCK_GEOMETRY_DETAIL.octaves,
  scale = DEFAULT_ROCK_GEOMETRY_DETAIL.scale,
  smoothNormals = false,
  subdivisions = DEFAULT_ROCK_GEOMETRY_DETAIL.subdivisions,
  variation = 0,
} = {}) {
  if (!geometry?.attributes?.position) return null;
  const levels = Math.max(0, Math.min(MAX_ROCK_DETAIL_SUBDIVISIONS, Math.trunc(subdivisions)));

  let working = geometry.index ? geometry.toNonIndexed() : geometry;
  if (working !== geometry) {
    for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
    geometry.setIndex(null);
    for (const [name, attribute] of Object.entries(working.attributes)) {
      geometry.setAttribute(name, attribute);
    }
    working.dispose?.();
    working = geometry;
  }
  // Before both the cavity estimate and subdivision: the cavity term projects
  // onto the vertex normal, so it wants the smoothed field too.
  if (smoothNormals) smoothMeshNormals(working);
  // Macro concavity from the coarse form, before subdivision multiplies the
  // vertex count and shrinks the one-ring to micro scale. Subdivision then
  // interpolates it like any other float attribute.
  if (cavity && working.attributes.normal) {
    const CavityArray = working.attributes.position.constructor;
    // Both halves of the same curvature estimate. Written together so the two
    // attributes can never disagree about which mesh they were measured on,
    // and so the runtime's "every mesh carries it" gate covers both at once.
    const curvature = computeMeshCurvature(working, cavityGain);
    working.setAttribute(
      ROCK_CAVITY_ATTRIBUTE,
      new CavityArray(curvature.cavity, 1),
    );
    working.setAttribute(
      ROCK_EXPOSURE_ATTRIBUTE,
      new CavityArray(curvature.exposure, 1),
    );
  }

  for (let level = 0; level < levels; level += 1) subdivideOnce(working);

  const position = working.attributes.position;
  const normal = working.attributes.normal;
  const cavityAttribute = working.attributes[ROCK_CAVITY_ATTRIBUTE] ?? null;
  const exposureAttribute = working.attributes[ROCK_EXPOSURE_ATTRIBUTE] ?? null;
  const noise = { lacunarity, octaves, scale, seed: Math.trunc(variation) };
  // Finite-difference step for the gradient. Small relative to the finest
  // octave so the perturbation tracks the surface actually being built.
  const epsilon = Math.max(1e-3, scale / (2 ** Math.max(1, octaves)));

  if (amount !== 0 && normal) {
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      let nx = normal.getX(i);
      let ny = normal.getY(i);
      let nz = normal.getZ(i);
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;

      const height = rockDetailHeight(x, y, z, noise);
      position.setXYZ(i, x + (nx * height * amount), y + (ny * height * amount), z + (nz * height * amount));

      // A vertex pushed inward is a pit; moisture and moss collect there. Fold
      // it into the interpolated macro curvature so the moss mask sees both
      // scales through one channel.
      if (cavityAttribute && cavityMicro > 0) {
        const pit = Math.max(0, -height);
        const merged = cavityAttribute.getX(i) + (pit * cavityMicro);
        cavityAttribute.setX(i, Math.min(1, Math.max(0, merged)));
      }
      // The mirror of the pit: a vertex pushed outward is a micro-bump, which
      // sheds water and dries first exactly as a macro crown does. Folding it in
      // here is what gives the exposure term detail at the displacement's own
      // scale rather than only at the coarse hull's.
      if (exposureAttribute && cavityMicro > 0) {
        const bump = Math.max(0, height);
        const merged = exposureAttribute.getX(i) + (bump * cavityMicro);
        exposureAttribute.setX(i, Math.min(1, Math.max(0, merged)));
      }

      if (normalStrength !== 0) {
        // Gradient of the height field, then remove its normal component so
        // only the tangential slope tilts the shading normal.
        const gx = (rockDetailHeight(x + epsilon, y, z, noise) - height) / epsilon;
        const gy = (rockDetailHeight(x, y + epsilon, z, noise) - height) / epsilon;
        const gz = (rockDetailHeight(x, y, z + epsilon, noise) - height) / epsilon;
        const along = (gx * nx) + (gy * ny) + (gz * nz);
        const tx = gx - (along * nx);
        const ty = gy - (along * ny);
        const tz = gz - (along * nz);
        const k = amount * normalStrength;
        const px = nx - (tx * k);
        const py = ny - (ty * k);
        const pz = nz - (tz * k);
        const plen = Math.hypot(px, py, pz) || 1;
        normal.setXYZ(i, px / plen, py / plen, pz / plen);
      }
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    if (cavityAttribute) cavityAttribute.needsUpdate = true;
  }

  working.computeBoundingBox?.();
  working.computeBoundingSphere?.();
  return {
    amount,
    cavity: Boolean(cavityAttribute),
    subdivisions: levels,
    triangles: position.count / 3,
  };
}

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
export function applyRockGeometryDetail(root, options = {}) {
  const report = { cavity: 0, meshes: 0, skipped: 0, triangles: 0, trianglesBefore: 0 };
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.geometry) return;
    if (object.userData?.rockShaderExclude === true) return;
    // Catalog artifacts pack every LOD as a sibling node and the consumer hides
    // all but LOD0. Subdividing the hidden ones triples the cost for geometry
    // that is never drawn at this distance.
    if (object.visible === false) {
      report.skipped += 1;
      return;
    }
    if (object.geometry.userData?.toonLabRockDetail) {
      report.skipped += 1;
      return;
    }
    const before = (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3;
    const applied = applyRockGeometryDetailToGeometry(object.geometry, options);
    if (!applied) return;
    object.geometry.userData = { ...object.geometry.userData, toonLabRockDetail: applied };
    report.meshes += 1;
    if (applied.cavity) report.cavity += 1;
    report.trianglesBefore += before;
    report.triangles += applied.triangles;
  });
  return report;
}
