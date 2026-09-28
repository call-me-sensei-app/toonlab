// Landscape tile geometry — per-tile render meshes over the global field
// brick. Border vertices of adjacent tiles read the *same* global samples and
// their normals difference the *global* array, so tile seams cannot open in
// either position or lighting. Positions are world-space (tiles sit at the
// scene origin), which keeps raycasts, the ground-field pass, and prop
// placement free of per-tile transforms.

import * as THREE from 'three';

function sampleHeight(field, gx, gz) {
  const clampedX = Math.min(field.gridW - 1, Math.max(0, gx));
  const clampedZ = Math.min(field.gridD - 1, Math.max(0, gz));
  return field.heights[clampedZ * field.gridW + clampedX];
}

function writeNormal(field, normals, vertexOffset, gx, gz) {
  const lowerX = Math.max(0, gx - 1);
  const upperX = Math.min(field.gridW - 1, gx + 1);
  const lowerZ = Math.max(0, gz - 1);
  const upperZ = Math.min(field.gridD - 1, gz + 1);
  const dx = (sampleHeight(field, upperX, gz) - sampleHeight(field, lowerX, gz))
    / ((upperX - lowerX || 1) * field.spacing);
  const dz = (sampleHeight(field, gx, upperZ) - sampleHeight(field, gx, lowerZ))
    / ((upperZ - lowerZ || 1) * field.spacing);
  const inverseLength = 1 / Math.hypot(dx, 1, dz);
  normals[vertexOffset] = -dx * inverseLength;
  normals[vertexOffset + 1] = inverseLength;
  normals[vertexOffset + 2] = dz * -inverseLength;
}

/** Grid range (inclusive) of the samples tile (tx, tz) renders. */
export function tileGridRange(field, tx, tz) {
  const quads = field.quadsPerTile;
  return {
    minGx: tx * quads,
    minGz: tz * quads,
    maxGx: tx * quads + quads,
    maxGz: tz * quads + quads,
  };
}

/**
 * Builds the world-space BufferGeometry for tile (tx, tz): (quads+1)^2
 * vertices, world-normalized UVs (shared by the splat map and ground-field
 * sampling), indexed quads.
 */
export function buildTileGeometry(field, tx, tz) {
  const quads = field.quadsPerTile;
  const side = quads + 1;
  const range = tileGridRange(field, tx, tz);
  const vertexCount = side * side;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  for (let localZ = 0; localZ < side; localZ += 1) {
    const gz = range.minGz + localZ;
    const worldZ = field.origin.z + gz * field.spacing;
    for (let localX = 0; localX < side; localX += 1) {
      const gx = range.minGx + localX;
      const vertex = localZ * side + localX;
      const positionOffset = vertex * 3;
      positions[positionOffset] = field.origin.x + gx * field.spacing;
      positions[positionOffset + 1] = field.heights[gz * field.gridW + gx];
      positions[positionOffset + 2] = worldZ;
      writeNormal(field, normals, positionOffset, gx, gz);
      uvs[vertex * 2] = gx / (field.gridW - 1);
      uvs[vertex * 2 + 1] = gz / (field.gridD - 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = `LandscapeTile:${tx},${tz}`;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(buildTileIndices(field, tx, tz), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.landscapeTile = { tx, tz };
  return geometry;
}

/** Index buffer for a tile, skipping punched-out (hole) quads. */
export function buildTileIndices(field, tx, tz) {
  const quads = field.quadsPerTile;
  const side = quads + 1;
  let solid = 0;
  for (let localZ = 0; localZ < quads; localZ += 1) {
    const globalRow = (tz * quads + localZ) * field.splatW + tx * quads;
    for (let localX = 0; localX < quads; localX += 1) {
      if (field.holes[globalRow + localX] !== 0) solid += 1;
    }
  }
  const indices = new Uint32Array(solid * 6);
  let indexOffset = 0;
  for (let localZ = 0; localZ < quads; localZ += 1) {
    const globalRow = (tz * quads + localZ) * field.splatW + tx * quads;
    for (let localX = 0; localX < quads; localX += 1) {
      if (field.holes[globalRow + localX] === 0) continue;
      const topLeft = localZ * side + localX;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + side;
      const bottomRight = bottomLeft + 1;
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = bottomRight;
    }
  }
  return indices;
}

/**
 * Rebuilds a tile's index buffer after hole edits inside a quad-space dirty
 * rect. Returns false when the rect misses the tile.
 */
export function rebuildTileIndicesForRect(field, geometry, dirtyRect) {
  const { tx, tz } = geometry.userData.landscapeTile;
  const quads = field.quadsPerTile;
  const minQx = tx * quads;
  const minQz = tz * quads;
  if (dirtyRect
    && (dirtyRect.maxX < minQx || dirtyRect.minX >= minQx + quads
      || dirtyRect.maxZ < minQz || dirtyRect.minZ >= minQz + quads)) {
    return false;
  }
  geometry.setIndex(new THREE.BufferAttribute(buildTileIndices(field, tx, tz), 1));
  return true;
}

/**
 * Refreshes heights + normals of a tile's vertices inside a global grid dirty
 * rect. Normals need a one-sample ring beyond the height edit, so callers
 * should pass the stroke rect unexpanded — the ring is handled here. Returns
 * false when the rect misses the tile.
 */
export function updateTileGeometry(field, geometry, dirtyRect) {
  const { tx, tz } = geometry.userData.landscapeTile;
  const range = tileGridRange(field, tx, tz);
  const side = field.quadsPerTile + 1;
  // Positions change only inside the rect; normals also change one ring out.
  const minGx = Math.max(range.minGx, dirtyRect.minX - 1);
  const maxGx = Math.min(range.maxGx, dirtyRect.maxX + 1);
  const minGz = Math.max(range.minGz, dirtyRect.minZ - 1);
  const maxGz = Math.min(range.maxGz, dirtyRect.maxZ + 1);
  if (minGx > maxGx || minGz > maxGz) return false;

  const positionAttribute = geometry.getAttribute('position');
  const normalAttribute = geometry.getAttribute('normal');
  const positions = positionAttribute.array;
  const normals = normalAttribute.array;
  for (let gz = minGz; gz <= maxGz; gz += 1) {
    const localZ = gz - range.minGz;
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      const localX = gx - range.minGx;
      const vertexOffset = (localZ * side + localX) * 3;
      positions[vertexOffset + 1] = field.heights[gz * field.gridW + gx];
      writeNormal(field, normals, vertexOffset, gx, gz);
    }
  }
  positionAttribute.needsUpdate = true;
  normalAttribute.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return true;
}

// Kept dark throughout: the walls must read as shadowed depth, never as a
// lit rim — the gradient just keeps the very top from being a hard edge.
const SKIRT_TOP_COLOR = [0.07, 0.06, 0.05];
const SKIRT_BOTTOM_COLOR = [0.008, 0.006, 0.005];

/**
 * Hole skirt walls for tile (tx, tz): a dark vertical quad descending from
 * every edge where a solid quad meets a punched-out one, so an opening reads
 * as an actual pit/shaft instead of a see-through cutout. Wall tops follow
 * the terrain edge heights exactly (no gaps when sculpting near a hole);
 * vertex colors fade to near-black at `depth` below. Returns a world-space
 * BufferGeometry, or null when the tile has no hole boundaries.
 */
export function buildTileHoleSkirt(field, tx, tz, { depth = 30 } = {}) {
  const quads = field.quadsPerTile;
  const positions = [];
  const colors = [];
  const holeAt = (qx, qz) => {
    if (qx < 0 || qz < 0 || qx >= field.splatW || qz >= field.splatD) return true; // map border: open
    return field.holes[qz * field.splatW + qx] === 0;
  };
  const sample = (gx, gz) => field.heights[gz * field.gridW + gx];
  const world = (gx, gz) => [field.origin.x + gx * field.spacing, field.origin.z + gz * field.spacing];

  // Emits the wall under the edge (gxA,gzA)→(gxB,gzB).
  const emitWall = (gxA, gzA, gxB, gzB) => {
    const [ax, az] = world(gxA, gzA);
    const [bx, bz] = world(gxB, gzB);
    const topA = sample(gxA, gzA);
    const topB = sample(gxB, gzB);
    const bottom = Math.min(topA, topB) - depth;
    // Two triangles: A-top, B-top, B-bottom / A-top, B-bottom, A-bottom.
    positions.push(
      ax, topA, az, bx, topB, bz, bx, bottom, bz,
      ax, topA, az, bx, bottom, bz, ax, bottom, az,
    );
    colors.push(
      ...SKIRT_TOP_COLOR, ...SKIRT_TOP_COLOR, ...SKIRT_BOTTOM_COLOR,
      ...SKIRT_TOP_COLOR, ...SKIRT_BOTTOM_COLOR, ...SKIRT_BOTTOM_COLOR,
    );
  };

  for (let localZ = 0; localZ < quads; localZ += 1) {
    const qz = tz * quads + localZ;
    for (let localX = 0; localX < quads; localX += 1) {
      const qx = tx * quads + localX;
      if (!holeAt(qx, qz)) continue;
      if (!holeAt(qx - 1, qz)) emitWall(qx, qz, qx, qz + 1);
      if (!holeAt(qx + 1, qz)) emitWall(qx + 1, qz, qx + 1, qz + 1);
      if (!holeAt(qx, qz - 1)) emitWall(qx, qz, qx + 1, qz);
      if (!holeAt(qx, qz + 1)) emitWall(qx, qz + 1, qx + 1, qz + 1);
    }
  }
  if (!positions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.name = `LandscapeHoleSkirt:${tx},${tz}`;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.landscapeTile = { tx, tz };
  return geometry;
}

/** Builds all tile geometries for a field. */
export function buildAllTileGeometries(field) {
  const geometries = [];
  for (let tz = 0; tz < field.tilesZ; tz += 1) {
    for (let tx = 0; tx < field.tilesX; tx += 1) {
      geometries.push(buildTileGeometry(field, tx, tz));
    }
  }
  return geometries;
}
