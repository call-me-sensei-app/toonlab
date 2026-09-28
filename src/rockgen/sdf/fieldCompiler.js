// Compiles a rock document into a FieldProgram: one closure per piece
// (inverse transform and stage constants baked in), left-folded with the
// piece combine ops, then sculpt edits applied on top.
//
// Lipschitz note: displaced fields under/over-estimate true distance, which
// would break sphere tracing but is harmless for rockgen's dense grid
// sampling as long as the zero crossing stays inside the sampled bounds.
// That is guaranteed by padding each piece's AABB with the worst-case
// modifier displacement (maxPieceDisplacement) plus the domain-warp reach
// (warpBoundsPad) plus its combine blend; meshDocument.js adds the final
// two-voxel pad once the cell size is known.
//
// Determinism: all per-sample math is hash/polynomial based (see noise/).
// Math.sin/cos appear only in per-piece compile-time constants (rotation),
// never per sample, so a document meshes bit-identically run to run.

import { cellular2, cellularCrease3 } from '../noise/cellularNoise3.js';
import { hash3f, hashCombine } from '../noise/prng.js';
import { simplexNoise3 } from '../noise/simplexNoise3.js';
import { fbm3, ridgedFbm3 } from '../noise/valueNoise3.js';
import { combine, opSmoothIntersect } from './sdfOps.js';
import { maxPieceDisplacement, strataProfile, warpBoundsPad } from './sdfModifiers.js';
import {
  sdCapsule, sdEllipsoid, sdExtrudedPolygon, sdRoundBox, sdSphere,
} from './sdfPrimitives.js';
import { getHeightfieldPatch } from '../heightfield/heightfieldPatch.js';
import { isRockHelperPiece } from '../rockHelpers.js';
import { applySculptEditToField, evaluateSculptEdit, sculptEditBounds } from './sculptEdits.js';

const DEG_TO_RAD = Math.PI / 180;

// Seed lanes so each stage draws decorrelated noise from one piece seed.
const SEED_WARP_X = 11;
const SEED_WARP_Y = 23;
const SEED_WARP_Z = 37;
const SEED_NOISE = 53;
const SEED_FACET = 71;
const SEED_STRATA = 89;
const SEED_COLUMNS = 101;
const SEED_CUTS = 113;
const SEED_HEIGHTFIELD = 127;
const SEED_CRACKS = 137;
const SEED_CRACK_COVER = 149;

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

// A sketch piece is only meshable with a drawn outline of 3+ points; the
// select-a-type UI can set type 'sketch' before any outline exists, so both
// the metrics and the compiled shape fall back to the ellipsoid until then.
function usableOutline(piece) {
  return piece.shape.type === 'sketch' && Array.isArray(piece.outline)
    && piece.outline.length >= 3
    ? piece.outline
    : null;
}

// Exact support (farthest surface reach) of the base shape along a unit
// direction. Planar cuts place their planes relative to this; the box's L1
// support badly overestimates ellipsoids and capsules along diagonals,
// which parks cut planes outside the surface where they slice nothing.
function shapeSupport(piece, nx, ny, nz) {
  const { capsuleLength, sizeX, sizeY, sizeZ, type } = piece.shape;
  if (type === 'sphere') return sizeX;
  if (type === 'box' || type === 'heightfield') {
    return Math.abs(nx) * sizeX + Math.abs(ny) * sizeY + Math.abs(nz) * sizeZ;
  }
  if (type === 'capsule') {
    return Math.abs(ny) * (capsuleLength / 2) + sizeX;
  }
  const outline = usableOutline(piece);
  if (outline) {
    let planar = 0;
    for (const [px, py] of outline) {
      planar = Math.max(planar, nx * px + ny * py);
    }
    return planar + Math.abs(nz) * sizeZ;
  }
  // Ellipsoid support: |diag(r) * n|.
  return Math.sqrt((nx * sizeX) ** 2 + (ny * sizeY) ** 2 + (nz * sizeZ) ** 2);
}

// Shape metrics used by falloff normalization and local bounds.
function shapeMetrics(piece) {
  const { capsuleLength, sizeX, sizeY, sizeZ, type } = piece.shape;
  if (type === 'sphere') {
    return { extentX: sizeX, extentY: sizeX, extentZ: sizeX };
  }
  if (type === 'box' || type === 'heightfield') {
    return { extentX: sizeX, extentY: sizeY, extentZ: sizeZ };
  }
  if (type === 'capsule') {
    return { extentX: sizeX, extentY: capsuleLength / 2 + sizeX, extentZ: sizeX };
  }
  const outline = usableOutline(piece);
  if (outline) {
    let extentX = 0;
    let extentY = 0;
    for (const [px, py] of outline) {
      extentX = Math.max(extentX, Math.abs(px));
      extentY = Math.max(extentY, Math.abs(py));
    }
    return { extentX, extentY, extentZ: sizeZ };
  }
  return { extentX: sizeX, extentY: sizeY, extentZ: sizeZ }; // ellipsoid
}

function compileBaseShape(piece, seed) {
  const { capsuleLength, cornerRadius, sizeX, sizeY, sizeZ, type } = piece.shape;
  if (type === 'sphere') {
    return (x, y, z) => sdSphere(x, y, z, sizeX);
  }
  if (type === 'heightfield') {
    // Eroded landform: the patch's normalized heights span the piece's
    // vertical extents (y = -sizeY at height 0, +sizeY at height 1),
    // clipped to the footprint box. The 0.7 slope-compensation keeps the
    // vertical-distance bound conservative on steep gullies — dense-grid
    // sampling only needs the zero crossing inside the padded bounds.
    const patch = getHeightfieldPatch(
      hashCombine(seed >>> 0, SEED_HEIGHTFIELD), piece.heightfield,
    );
    return (x, y, z) => {
      const u = (x / sizeX) * 0.5 + 0.5;
      const v = (z / sizeZ) * 0.5 + 0.5;
      const top = -sizeY + patch.sample(u, v) * 2 * sizeY;
      const dSurface = (y - top) * 0.7;
      const dSides = Math.max(Math.abs(x) - sizeX, Math.abs(z) - sizeZ);
      const dBottom = -sizeY - y;
      return Math.max(dSurface, dSides, dBottom);
    };
  }
  if (type === 'box') {
    const r = clamp01(cornerRadius) * Math.min(sizeX, sizeY, sizeZ);
    return (x, y, z) => sdRoundBox(x, y, z, sizeX, sizeY, sizeZ, r);
  }
  if (type === 'capsule') {
    return (x, y, z) => sdCapsule(x, y, z, capsuleLength / 2, sizeX);
  }
  const outline = usableOutline(piece);
  if (outline) {
    const flat = new Float64Array(outline.length * 2);
    for (let i = 0; i < outline.length; i += 1) {
      flat[i * 2] = outline[i][0];
      flat[i * 2 + 1] = outline[i][1];
    }
    const rounding = clamp01(cornerRadius) * sizeZ;
    return (x, y, z) => sdExtrudedPolygon(flat, x, y, z, sizeZ, rounding);
  }
  return (x, y, z) => sdEllipsoid(x, y, z, sizeX, sizeY, sizeZ);
}

// Rotation matrix elements for euler XYZ (matches THREE.Matrix4
// .makeRotationFromEuler order so lab gizmo transforms round-trip).
function rotationFromEuler(rx, ry, rz) {
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ];
}

function compilePiece(piece, documentSeed) {
  const seed = hashCombine(documentSeed, piece.seed >>> 0);
  const {
    columns, cracks, cuts, facet, falloff, noise, strata, transform, warp,
  } = piece;

  const [posX, posY, posZ] = transform.position;
  const [sclX, sclY, sclZ] = transform.scale;
  const rot = rotationFromEuler(
    transform.rotation[0],
    transform.rotation[1],
    transform.rotation[2],
  );
  const distanceScale = Math.min(sclX, sclY, sclZ);

  const base = compileBaseShape(piece, seed);
  const { extentX, extentY, extentZ } = shapeMetrics(piece);

  const warpEnabled = warp.enabled && warp.strength > 0;
  const warpFreq = warp.frequency;
  const warpStrength = warp.strength;
  const seedWarpX = hashCombine(seed, SEED_WARP_X);
  const seedWarpY = hashCombine(seed, SEED_WARP_Y);
  const seedWarpZ = hashCombine(seed, SEED_WARP_Z);

  const noiseEnabled = noise.enabled && noise.amplitude > 0;
  const noiseSeed = hashCombine(hashCombine(seed, SEED_NOISE), noise.seedOffset >>> 0);
  const noiseOctaves = Math.round(noise.octaves);

  const facetEnabled = facet.enabled && facet.strength > 0;
  const facetSeed = hashCombine(seed, SEED_FACET);

  const cracksEnabled = Boolean(cracks?.enabled) && cracks.depth > 0 && cracks.coverage > 0;
  const cracksSeed = hashCombine(seed, SEED_CRACKS);
  const crackCoverSeed = hashCombine(seed, SEED_CRACK_COVER);

  const strataEnabled = strata.enabled && strata.strength > 0;
  const strataSeed = hashCombine(seed, SEED_STRATA);
  const tilt = strata.tiltDegrees * DEG_TO_RAD;
  // Strata bands stack along a tilted axis in the local XZ->Y plane.
  const tiltY = Math.cos(tilt);
  const tiltX = Math.sin(tilt);

  const columnsEnabled = Boolean(columns?.enabled)
    && (columns.grooveDepth > 0 || columns.heightVariation > 0);
  const columnSeed = hashCombine(seed, SEED_COLUMNS);

  // Planar cuts compile to a flat array of [nx, ny, nz, offset] half-space
  // planes. All randomness is drawn here (compile time), so per sample each
  // cut costs one dot product and one max.
  const cutsEnabled = Boolean(cuts?.enabled) && cuts.count >= 1 && cuts.depth > 0;
  let cutPlanes = null;
  let cutBevel = 0;
  if (cutsEnabled) {
    const cutSeed = hashCombine(hashCombine(seed, SEED_CUTS), cuts.seedOffset >>> 0);
    const cutCount = Math.round(cuts.count);
    cutBevel = Math.max(cuts.bevel, 0);
    cutPlanes = new Float64Array(cutCount * 4);
    for (let i = 0; i < cutCount; i += 1) {
      const azimuth = hash3f(cutSeed, i, 0, 0) * Math.PI * 2;
      // verticalBias squashes normals toward the horizon so the cut faces
      // stand near-vertical (cliff walls); 0 slices from any direction.
      const ny = (hash3f(cutSeed, i, 1, 0) * 2 - 1) * (1 - clamp01(cuts.verticalBias));
      const horizontal = Math.sqrt(Math.max(1 - ny * ny, 0));
      const nx = Math.cos(azimuth) * horizontal;
      const nz = Math.sin(azimuth) * horizontal;
      // The plane lands between (1 - depth) and (1 - depth/4) of the exact
      // shape support along the normal, so a cut bites at most `depth` of
      // the shape but always at least a quarter of that — a zero-bite
      // plane is an invisible no-op slider.
      const support = shapeSupport(piece, nx, ny, nz);
      const bite = cuts.depth * (0.25 + 0.75 * hash3f(cutSeed, i, 2, 0));
      const offset = support * (1 - bite);
      cutPlanes[i * 4] = nx;
      cutPlanes[i * 4 + 1] = ny;
      cutPlanes[i * 4 + 2] = nz;
      cutPlanes[i * 4 + 3] = offset;
    }
  }

  const { bottomFlatten, radialPinch, topTaper } = falloff;
  const maxRadius = Math.max(extentX, extentZ);
  const flattenPlaneY = -extentY * (1 - clamp01(bottomFlatten));
  const flattenBlend = extentY * 0.08;

  const evaluate = (x, y, z) => {
    // World -> local: translate, inverse-rotate (transpose), inverse-scale.
    const dx = x - posX;
    const dy = y - posY;
    const dz = z - posZ;
    const lx = (rot[0] * dx + rot[3] * dy + rot[6] * dz) / sclX;
    const ly = (rot[1] * dx + rot[4] * dy + rot[7] * dz) / sclY;
    const lz = (rot[2] * dx + rot[5] * dy + rot[8] * dz) / sclZ;

    let ampScale = 1;
    if (topTaper > 0) {
      ampScale *= 1 - topTaper * clamp01((ly / extentY) * 0.5 + 0.5);
    }
    if (radialPinch > 0) {
      const radial = Math.sqrt(lx * lx + lz * lz) / maxRadius;
      ampScale *= 1 - radialPinch * clamp01(radial);
    }

    // Columnar jointing: each 2D Voronoi cell in the ground plane is one
    // column. Lifting the sample's y per cell steps the column tops; the
    // field discontinuity at cell borders meshes as the vertical seam.
    let columnLift = 0;
    let columnGroove = 0;
    let columnPhase = 0;
    if (columnsEnabled) {
      const cell = cellular2(columnSeed, lx * columns.scale, lz * columns.scale, 1);
      columnLift = (cell.id - 0.5) * columns.heightVariation;
      columnPhase = cell.id;
      const edge = (cell.f2 - cell.f1) / columns.grooveWidth;
      if (edge < 1) {
        const t = 1 - Math.max(edge, 0);
        columnGroove = t * t * (3 - 2 * t);
      }
    }

    let wx = lx;
    let wy = ly - columnLift;
    let wz = lz;
    if (warpEnabled) {
      wx += warpStrength * simplexNoise3(seedWarpX, lx * warpFreq, ly * warpFreq, lz * warpFreq);
      wy += warpStrength * simplexNoise3(seedWarpY, lx * warpFreq, ly * warpFreq, lz * warpFreq);
      wz += warpStrength * simplexNoise3(seedWarpZ, lx * warpFreq, ly * warpFreq, lz * warpFreq);
    }

    let d = base(wx, wy, wz);

    if (noiseEnabled) {
      const n = noise.ridged
        ? ridgedFbm3(noiseSeed, wx * noise.frequency, wy * noise.frequency, wz * noise.frequency,
          noiseOctaves, noise.lacunarity, noise.gain) * 2 - 1
        : fbm3(noiseSeed, wx * noise.frequency, wy * noise.frequency, wz * noise.frequency,
          noiseOctaves, noise.lacunarity, noise.gain);
      d -= noise.amplitude * ampScale * n;
    }

    if (facetEnabled) {
      d += facet.strength * ampScale
        * cellularCrease3(facetSeed, wx * facet.scale, wy * facet.scale, wz * facet.scale, facet.jitter);
    }

    if (cracksEnabled) {
      // Sparse fissures: narrow crease profile on LARGE cells, gated by a
      // low-frequency coverage mask so cracks live in weathered patches
      // instead of tiling the whole surface.
      const cover = fbm3(crackCoverSeed, wx * 0.55, wy * 0.55, wz * 0.55, 2, 2, 0.5) * 0.5 + 0.5;
      const gate = clamp01((cracks.coverage - cover) / 0.12 + 0.5);
      if (gate > 0) {
        d += cracks.depth * ampScale * gate
          * cellularCrease3(cracksSeed, wx * cracks.scale, wy * cracks.scale, wz * cracks.scale, 1, cracks.width);
      }
    }

    if (strataEnabled) {
      // Joints follow the lifted column surface, and each column gets its
      // own phase so horizontal break lines don't align across columns.
      let v = (tiltX * lx + tiltY * (ly - columnLift)) * strata.frequency + columnPhase * 2.618;
      if (strata.warpAmount > 0) {
        v += strata.warpAmount * fbm3(strataSeed, lx * 0.8, ly * 0.8, lz * 0.8, 2, 2, 0.5);
      }
      d += strata.strength * ampScale * strataProfile(v, clamp01(strata.sharpness));
    }

    // Column grooves stay full-depth to the top — they define the
    // silhouette, so no ampScale fade.
    if (columnGroove > 0) d += columns.grooveDepth * columnGroove;

    // Planar cuts intersect in UNWARPED local space, after all displacement
    // stages: warp and noise never touch the cut faces, so they mesh as
    // dead-flat planes with straight edges (no ampScale — they define the
    // silhouette). Bevel > 0 softens the edge with a smooth intersect.
    if (cutPlanes) {
      for (let i = 0; i < cutPlanes.length; i += 4) {
        const plane = cutPlanes[i] * lx + cutPlanes[i + 1] * ly + cutPlanes[i + 2] * lz
          - cutPlanes[i + 3];
        d = cutBevel > 0 ? opSmoothIntersect(d, plane, cutBevel) : Math.max(d, plane);
      }
    }

    if (bottomFlatten > 0) {
      // Keep the half-space above the flatten plane (negative above plane).
      d = opSmoothIntersect(d, flattenPlaneY - ly, flattenBlend);
    }

    return d * distanceScale;
  };

  // Local AABB (pre-scale space) padded by displacement + warp reach, then
  // scaled/rotated to a world AABB via the 8 corners.
  const pad = maxPieceDisplacement(piece) + warpBoundsPad(piece);
  const ex = extentX + pad;
  const ey = extentY + pad;
  const ez = extentZ + pad;
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  for (let corner = 0; corner < 8; corner += 1) {
    const cx = (corner & 1 ? ex : -ex) * sclX;
    const cy = (corner & 2 ? ey : -ey) * sclY;
    const cz = (corner & 4 ? ez : -ez) * sclZ;
    // Forward rotation (row-major, matches rotationFromEuler layout).
    const wxc = rot[0] * cx + rot[1] * cy + rot[2] * cz + posX;
    const wyc = rot[3] * cx + rot[4] * cy + rot[5] * cz + posY;
    const wzc = rot[6] * cx + rot[7] * cy + rot[8] * cz + posZ;
    boundsMin[0] = Math.min(boundsMin[0], wxc);
    boundsMin[1] = Math.min(boundsMin[1], wyc);
    boundsMin[2] = Math.min(boundsMin[2], wzc);
    boundsMax[0] = Math.max(boundsMax[0], wxc);
    boundsMax[1] = Math.max(boundsMax[1], wyc);
    boundsMax[2] = Math.max(boundsMax[2], wzc);
  }

  return { bounds: { max: boundsMax, min: boundsMin }, evaluate };
}

const PROGRAM_CACHE = new WeakMap();

/**
 * Compiles a document into `{ evaluate(x, y, z), bounds, revision }`.
 * Results are cached per document object and invalidated by `revision`,
 * so repeated meshing while dragging one slider recompiles only once per
 * document mutation.
 *
 * @param {object} document Rock document (rockDocument.js shape).
 * @param {{ includeHelpers?: boolean, pieceId?: string }} [options]
 *   `pieceId` restricts to a single piece, evaluated in its LOCAL space
 *   (transform ignored) — used by the lab's per-piece preview mode where
 *   the transform lives on the scene group. `includeHelpers` keeps
 *   construction-only supports for authoring calculations; visual meshing
 *   and walker collision pass false so they match the final rock.
 */
export function compileDocument(document, { includeHelpers = true, pieceId = null } = {}) {
  const cacheKey = pieceId === null ? document : null;
  const cacheSlot = includeHelpers ? 'withHelpers' : 'withoutHelpers';
  if (cacheKey) {
    const cached = PROGRAM_CACHE.get(cacheKey);
    if (cached && cached.revision === document.revision && cached[cacheSlot]) {
      return cached[cacheSlot];
    }
  }

  const documentSeed = document.seed >>> 0;
  let pieces = document.pieces;
  if (pieceId !== null) {
    const piece = document.pieces.find((entry) => entry.id === pieceId);
    if (!piece) throw new Error(`Rock document has no piece "${pieceId}".`);
    pieces = [{
      ...piece,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    }];
  } else {
    // Hidden pieces are excluded from the field; an all-hidden document
    // falls back to everything rather than meshing nothing, but visual
    // fields never fall back to construction helpers.
    const visible = pieces.filter((piece) => !piece.hidden && (includeHelpers || !isRockHelperPiece(piece)));
    if (visible.length > 0) {
      pieces = visible;
    } else if (!includeHelpers) {
      pieces = pieces.filter((piece) => !isRockHelperPiece(piece));
    }
  }
  if (pieces.length === 0) throw new Error('Rock document has no pieces to compile.');

  const compiled = pieces.map((piece) => ({
    blend: piece.combine.blend,
    op: piece.combine.op,
    piece: compilePiece(piece, documentSeed),
  }));

  const sculptEdits = pieceId === null ? document.sculptEdits : [];

  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < compiled.length; index += 1) {
    const entry = compiled[index];
    // Subtract/intersect pieces only remove volume; they never extend the
    // surface beyond the union pieces (plus their smooth blend radius).
    // Piece 0 always counts — the fold starts from it, ignoring its op.
    const expands = entry.op === 'union' || entry.op === 'smoothUnion';
    const blendPad = entry.op === 'smoothUnion' ? entry.blend : 0;
    if (!expands && index > 0) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis], entry.piece.bounds.min[axis] - blendPad);
      boundsMax[axis] = Math.max(boundsMax[axis], entry.piece.bounds.max[axis] + blendPad);
    }
  }
  for (const edit of sculptEdits) {
    if (edit.tool !== 'add') continue;
    const editBounds = sculptEditBounds(edit);
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis], editBounds.min[axis]);
      boundsMax[axis] = Math.max(boundsMax[axis], editBounds.max[axis]);
    }
  }

  const evaluate = (x, y, z) => {
    let d = compiled[0].piece.evaluate(x, y, z);
    for (let i = 1; i < compiled.length; i += 1) {
      d = combine(compiled[i].op, d, compiled[i].piece.evaluate(x, y, z), compiled[i].blend);
    }
    // Phase D adds a coarse culling grid here; linear application is fine
    // for the edit counts Phase A-C documents carry.
    for (const edit of sculptEdits) {
      d = applySculptEditToField(edit, d, evaluateSculptEdit(edit, x, y, z));
    }
    return d;
  };

  // Erosion-story tint hook: heightfield pieces expose their sim masks
  // (deposition lightens gully floors, flow darkens water paths) to the
  // vertex-color bake. First containing piece wins — good enough until a
  // composition stacks eroded landforms.
  const tintPieces = pieces
    .filter((piece) => piece.shape.type === 'heightfield')
    .map((piece) => {
      const pieceSeed = hashCombine(documentSeed, piece.seed >>> 0);
      const patch = getHeightfieldPatch(
        hashCombine(pieceSeed, SEED_HEIGHTFIELD), piece.heightfield,
      );
      if (!patch.masks) return null;
      const [posX, posY, posZ] = piece.transform.position;
      const [sclX, sclY, sclZ] = piece.transform.scale;
      const rot = rotationFromEuler(
        piece.transform.rotation[0], piece.transform.rotation[1], piece.transform.rotation[2],
      );
      const { sizeX, sizeZ } = piece.shape;
      return (x, y, z) => {
        const dx = x - posX;
        const dy = y - posY;
        const dz = z - posZ;
        const lx = (rot[0] * dx + rot[3] * dy + rot[6] * dz) / sclX;
        const lz = (rot[2] * dx + rot[5] * dy + rot[8] * dz) / sclZ;
        if (Math.abs(lx) > sizeX || Math.abs(lz) > sizeZ) return null;
        return patch.sampleMasks((lx / sizeX) * 0.5 + 0.5, (lz / sizeZ) * 0.5 + 0.5);
      };
    })
    .filter(Boolean);
  const tintAt = tintPieces.length === 0 ? null : (x, y, z) => {
    for (const sample of tintPieces) {
      const tint = sample(x, y, z);
      if (tint) return tint;
    }
    return null;
  };

  const program = {
    bounds: { max: boundsMax, min: boundsMin },
    evaluate,
    revision: document.revision,
    tintAt,
  };
  if (cacheKey) {
    const cached = PROGRAM_CACHE.get(cacheKey);
    const entry = cached && cached.revision === document.revision
      ? cached
      : { revision: document.revision, withHelpers: null, withoutHelpers: null };
    entry[cacheSlot] = program;
    PROGRAM_CACHE.set(cacheKey, entry);
  }
  return program;
}

/** Evaluates the document (or a precompiled program) at one point. */
export function evaluateField(fieldProgramOrDocument, x, y, z) {
  const program = typeof fieldProgramOrDocument.evaluate === 'function'
    ? fieldProgramOrDocument
    : compileDocument(fieldProgramOrDocument);
  return program.evaluate(x, y, z);
}
