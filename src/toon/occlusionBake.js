import * as THREE from 'three';

import { writeBakedOcclusion } from './bakeAttribute.js';

// Automatic shading grade from local occlusion — the "falls into shadow
// early" channel anime artists paint by hand (under the chin, inside collars
// and sleeves, armpits, cloth folds, the underside of hair).
//
// Per vertex rather than per texel: atlased and mirrored UVs would break a
// texture bake, and these features are centimetres across, well above vertex
// spacing. The method is point-based occlusion over a surfel cloud:
//
//   1. The character's surface is binned into surfels — one per voxel and
//      normal direction, so the two sides of thin cloth stay separate —
//      carrying summed area, mean position and mean normal.
//   2. Each surfel sums, within a radius of a few centimetres, how much of the
//      surrounding surface rises above its own tangent plane (area × cosine /
//      distance², the disc approximation). Open and convex surfaces score 0;
//      creases and cavities approach 1. Occluders that turn their back to the
//      receiver — the next hair card or cloth layer stacked the same way — count
//      only a little: the shapes anime shading darkens are surfaces facing each
//      other (chin over neck, arm against torso, a collar's inner wall).
//   3. Surfels are smoothed with their same-orientation neighbours, and every
//      vertex takes its surfel's value, written into the `toonBake`
//      attribute's z (bakeAttribute.js), which the shader turns into an
//      earlier terminator.

export const DEFAULT_OCCLUSION_BAKE = Object.freeze({
  // Occlusion radius as a fraction of the character's height (≈7 cm at 1.7 m).
  radius: 0.04,
  // Surfel size as a fraction of the radius.
  surfelFraction: 1 / 6,
  // Weight of occluders seen from behind (stacked layers facing the same way).
  backFacingWeight: 0.15,
  // Accumulated coverage → occlusion: 1 − exp(−gain · coverage). A surfel at
  // the bottom of a closed hemisphere has coverage ≈ 1.
  gain: 2.5,
});

const toArray = (material) => (Array.isArray(material) ? material : [material]);

function normalBin(nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx >= 0 ? 0 : 1;
  if (ay >= az) return ny >= 0 ? 2 : 3;
  return nz >= 0 ? 4 : 5;
}

/**
 * Bakes per-vertex local occlusion for every eligible mesh under `root`.
 * `isEligibleMesh(mesh)` selects receivers and occluders.
 */
export function bakeLocalOcclusion(root, { isEligibleMesh = () => true, ...options } = {}) {
  const config = { ...DEFAULT_OCCLUSION_BAKE, ...options };
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const meshes = [];
  const bounds = new THREE.Box3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData?.isToonOutline || !mesh.geometry?.attributes?.position || !mesh.geometry.attributes.normal) return;
    if (!isEligibleMesh(mesh)) return;
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(toRoot);
    const points = new Float32Array(position.count * 3);
    const normals = new Float32Array(position.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      p.fromBufferAttribute(position, i).applyMatrix4(toRoot);
      points.set([p.x, p.y, p.z], i * 3);
      bounds.expandByPoint(p);
      p.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normals.set([p.x, p.y, p.z], i * 3);
    }
    // Vertex area: a third of each adjacent triangle.
    const areas = new Float32Array(position.count);
    const index = geometry.index;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < triangleCount; t += 1) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromArray(points, ia * 3);
      b.fromArray(points, ib * 3);
      c.fromArray(points, ic * 3);
      const area = b.sub(a).cross(c.sub(a)).length() / 6;
      areas[ia] += area;
      areas[ib] += area;
      areas[ic] += area;
    }
    meshes.push({ areas, geometry, mesh, normals, points });
  });
  if (!meshes.length || bounds.isEmpty()) return null;

  const height = bounds.max.y - bounds.min.y;
  const radius = Math.max(height * config.radius, 1e-5);
  const cell = radius * config.surfelFraction;

  // 1. Surfels.
  const surfelIndex = new Map();
  const surfels = [];
  const keyOf = (x, y, z, bin) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)},${bin}`;
  const vertexSurfel = meshes.map(({ points }) => new Int32Array(points.length / 3));
  meshes.forEach(({ areas, normals, points }, m) => {
    for (let i = 0; i < points.length / 3; i += 1) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const key = keyOf(points[i * 3], points[i * 3 + 1], points[i * 3 + 2], normalBin(nx, ny, nz));
      let s = surfelIndex.get(key);
      if (s === undefined) {
        s = surfels.length;
        surfelIndex.set(key, s);
        surfels.push({ area: 0, nx: 0, ny: 0, nz: 0, weight: 0, x: 0, y: 0, z: 0 });
      }
      const surfel = surfels[s];
      const w = areas[i] + 1e-12;
      surfel.area += areas[i];
      surfel.weight += w;
      surfel.x += points[i * 3] * w;
      surfel.y += points[i * 3 + 1] * w;
      surfel.z += points[i * 3 + 2] * w;
      surfel.nx += nx * w;
      surfel.ny += ny * w;
      surfel.nz += nz * w;
      vertexSurfel[m][i] = s;
    }
  });
  const count = surfels.length;
  const sx = new Float32Array(count);
  const sy = new Float32Array(count);
  const sz = new Float32Array(count);
  const snx = new Float32Array(count);
  const sny = new Float32Array(count);
  const snz = new Float32Array(count);
  const sa = new Float32Array(count);
  const sbin = new Uint8Array(count);
  surfels.forEach((surfel, s) => {
    sx[s] = surfel.x / surfel.weight;
    sy[s] = surfel.y / surfel.weight;
    sz[s] = surfel.z / surfel.weight;
    const length = Math.hypot(surfel.nx, surfel.ny, surfel.nz) || 1;
    snx[s] = surfel.nx / length;
    sny[s] = surfel.ny / length;
    snz[s] = surfel.nz / length;
    sa[s] = surfel.area;
    sbin[s] = normalBin(snx[s], sny[s], snz[s]);
  });

  // Spatial hash at the occlusion radius.
  const grid = new Map();
  const gridKey = (x, y, z) => `${Math.floor(x / radius)},${Math.floor(y / radius)},${Math.floor(z / radius)}`;
  for (let s = 0; s < count; s += 1) {
    const key = gridKey(sx[s], sy[s], sz[s]);
    let list = grid.get(key);
    if (!list) grid.set(key, (list = []));
    list.push(s);
  }
  const forNeighbours = (s, range, visit) => {
    const gx = Math.floor(sx[s] / radius);
    const gy = Math.floor(sy[s] / radius);
    const gz = Math.floor(sz[s] / radius);
    const span = Math.ceil(range / radius);
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dy = -span; dy <= span; dy += 1) {
        for (let dz = -span; dz <= span; dz += 1) {
          const list = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (list) for (const o of list) visit(o);
        }
      }
    }
  };

  // 2. Coverage above each surfel's tangent plane.
  const occlusion = new Float32Array(count);
  const radiusSq = radius * radius;
  const minDistance = cell * 0.75;
  for (let s = 0; s < count; s += 1) {
    let coverage = 0;
    forNeighbours(s, radius, (o) => {
      if (o === s) return;
      const vx = sx[o] - sx[s];
      const vy = sy[o] - sy[s];
      const vz = sz[o] - sz[s];
      const distanceSq = vx * vx + vy * vy + vz * vz;
      if (distanceSq > radiusSq || distanceSq < minDistance * minDistance) return;
      const distance = Math.sqrt(distanceSq);
      const cosine = (snx[s] * vx + sny[s] * vy + snz[s] * vz) / distance;
      if (cosine <= 0.05) return;
      const falloff = 1 - distanceSq / radiusSq;
      // > 0 when the occluder faces the receiver.
      const facing = -(snx[o] * vx + sny[o] * vy + snz[o] * vz) / distance;
      const facingWeight = facing > 0 ? 1 : config.backFacingWeight;
      coverage += (sa[o] * cosine * falloff * facingWeight) / (Math.PI * distanceSq + sa[o]);
    });
    occlusion[s] = 1 - Math.exp(-config.gain * coverage);
  }

  // 3. Smooth over same-orientation neighbours within two surfels.
  const smoothed = new Float32Array(count);
  const smoothRange = cell * 2;
  for (let s = 0; s < count; s += 1) {
    let sum = 0;
    let weight = 0;
    forNeighbours(s, smoothRange, (o) => {
      if (sbin[o] !== sbin[s]) return;
      const d = Math.hypot(sx[o] - sx[s], sy[o] - sy[s], sz[o] - sz[s]);
      if (d > smoothRange) return;
      const w = sa[o] * (1 - d / smoothRange) + 1e-12;
      sum += occlusion[o] * w;
      weight += w;
    });
    smoothed[s] = weight ? sum / weight : occlusion[s];
  }

  let occludedVertices = 0;
  meshes.forEach(({ geometry, points }, m) => {
    const values = new Float32Array(points.length / 3);
    for (let i = 0; i < values.length; i += 1) {
      const value = THREE.MathUtils.clamp(smoothed[vertexSurfel[m][i]], 0, 1);
      values[i] = value;
      if (value > 0.5) occludedVertices += 1;
    }
    writeBakedOcclusion(geometry, values);
  });

  return { meshes: meshes.map(({ mesh }) => mesh), occludedVertices, radius, surfels: count };
}
