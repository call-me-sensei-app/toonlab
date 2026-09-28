import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';

export const UNDERSTORY_AERIAL_FADE = Object.freeze({ end: 0.5, start: 0.24 });

// Performance-bounded middle vegetation layer for open worlds. A forest
// needs more than trunks and grass: these two instanced meshes add shrub
// masses and low ground-cover rosettes without creating one Object3D (and
// one draw call) per plant.

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

function shrubGeometry() {
  const lobes = [
    [-0.52, 0.47, 0.05, 0.72, 0.62, 0.68],
    [0.46, 0.43, -0.08, 0.68, 0.57, 0.62],
    [0.03, 0.62, 0.28, 0.82, 0.72, 0.76],
    [0.08, 0.39, -0.42, 0.67, 0.54, 0.62],
  ];
  const pieces = lobes.map(([x, y, z, sx, sy, sz]) => {
    const geometry = new THREE.SphereGeometry(1, 7, 5);
    geometry.scale(sx, sy, sz);
    geometry.translate(x, y, z);
    return geometry;
  });
  const geometry = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function groundCoverGeometry() {
  const pieces = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const geometry = new THREE.PlaneGeometry(0.18, 0.95, 1, 2);
    geometry.translate(0, 0.475, 0);
    geometry.rotateZ((i % 2 ? 0.34 : -0.28));
    geometry.rotateY(angle);
    geometry.translate(Math.cos(angle) * 0.16, 0, Math.sin(angle) * 0.16);
    pieces.push(geometry);
  }
  const geometry = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterial({ color, emissive, emissiveIntensity = 0.24, side = THREE.FrontSide }) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness: 0,
    roughness: 1,
    side,
  });
}

function makeInstances(geometry, material, placements, palette, seed, scaleRange) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(placements.length, 1));
  mesh.count = placements.length;
  mesh.castShadow = false;
  // These plants live under the canopy. Receiving the sun shadow map here
  // double-darkens them and turns distant shrubs into black pinpricks.
  // The soft contact field supplies grounding without crushed luminance.
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.environmentShaderExclude = true;
  mesh.userData.waterExclude = true;
  const random = mulberry32(seed);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  placements.forEach((placement, index) => {
    const size = THREE.MathUtils.lerp(scaleRange[0], scaleRange[1], random());
    quaternion.setFromAxisAngle(up, random() * Math.PI * 2);
    scale.set(size * (0.84 + random() * 0.32), size, size * (0.84 + random() * 0.32));
    matrix.compose(
      new THREE.Vector3(placement.x, placement.y + 0.025, placement.z),
      quaternion,
      scale,
    );
    mesh.setMatrixAt(index, matrix);
    color.set(palette[Math.floor(random() * palette.length) % palette.length]);
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/**
 * Scatters shrubs and rosettes around an existing forest distribution. The
 * forest is the canopy layer, shrubs become understory, and the ordinary
 * grass field remains ground cover. Counts are hard-capped for predictable
 * open-world budgets.
 */
export function scatterUnderstory({
  forestPlacements = [],
  heightAt = null,
  mask = null,
  seed = 2309,
  shrubsPerTree = 1.35,
  groundCoverPerTree = 3.2,
  maxShrubs = 2400,
  maxGroundCover = 6200,
} = {}) {
  const random = mulberry32(seed);
  const shrubs = [];
  const groundCover = [];
  const addAround = (target, tree, minRadius, maxRadius) => {
    const angle = random() * Math.PI * 2;
    const distance = THREE.MathUtils.lerp(minRadius, maxRadius, Math.sqrt(random()));
    const x = tree.x + Math.cos(angle) * distance;
    const z = tree.z + Math.sin(angle) * distance;
    if (typeof mask === 'function' && !mask(x, z)) return;
    const sampled = typeof heightAt === 'function' ? Number(heightAt(x, z)) : 0;
    target.push({ x, y: Number.isFinite(sampled) ? sampled : 0, z });
  };

  for (const tree of forestPlacements) {
    const shrubCount = Math.floor(shrubsPerTree) + (random() < shrubsPerTree % 1 ? 1 : 0);
    for (let i = 0; i < shrubCount && shrubs.length < maxShrubs; i += 1) {
      addAround(shrubs, tree, 1.7, 5.8);
    }
    const coverCount = Math.floor(groundCoverPerTree) + (random() < groundCoverPerTree % 1 ? 1 : 0);
    for (let i = 0; i < coverCount && groundCover.length < maxGroundCover; i += 1) {
      addAround(groundCover, tree, 0.9, 7.2);
    }
    if (shrubs.length >= maxShrubs && groundCover.length >= maxGroundCover) break;
  }
  return { groundCover, shrubs };
}

export class StylizedUnderstory extends THREE.Group {
  constructor({
    groundCover = [],
    shrubs = [],
    seed = 2309,
    shrubPalette = [0x3f913e, 0x57a847, 0x69b84d, 0x37853a],
    groundPalette = [0x4d9735, 0x68ad3d, 0x7dbc48],
    shrubScaleRange = [0.72, 1.5],
    groundScaleRange = [0.5, 1.05],
    styleTarget = {},
  } = {}) {
    super();
    this.name = 'StylizedUnderstory';
    this.shrubCount = shrubs.length;
    this.groundCoverCount = groundCover.length;
    this._geometries = [shrubGeometry(), groundCoverGeometry()];
    this._materials = [
      createMaterial({ color: 0xffffff, emissive: 0x17351c, emissiveIntensity: 0.3 }),
      createMaterial({
        color: 0xffffff,
        emissive: 0x18391a,
        emissiveIntensity: 0.26,
        side: THREE.DoubleSide,
      }),
    ];
    for (const material of this._materials) {
      material.transparent = true;
      material.depthWrite = false;
    }
    markFactoryStyleMaterial(this._materials[0], 'UnderstoryShrubs');
    markFactoryStyleMaterial(this._materials[1], 'UnderstoryGroundCover');
    this._cameraDirection = new THREE.Vector3();
    this.shrubs = makeInstances(
      this._geometries[0], this._materials[0], shrubs, shrubPalette, seed, shrubScaleRange,
    );
    this.groundCover = makeInstances(
      this._geometries[1], this._materials[1], groundCover, groundPalette, seed + 101, groundScaleRange,
    );
    this.add(this.shrubs, this.groundCover);
    attachFactoryStyleTarget(this, 'vegetation.tree', {
      targetId: 'toonlab/understory',
      ...styleTarget,
      materials: {
        assignments: {
          UnderstoryGroundCover: { roles: ['foliageCard'] },
          UnderstoryShrubs: { roles: ['foliageCard'] },
        },
        ...(styleTarget.materials ?? {}),
      },
    });
  }

  /**
   * Understory is a gameplay-distance layer. As the camera pitches into an
   * aerial view, its tiny projected plants become visual dirt rather than a
   * readable height layer, so fade them before minification reaches a pixel.
   */
  update(camera) {
    if (!camera) return this;
    camera.getWorldDirection(this._cameraDirection);
    const downwardness = THREE.MathUtils.clamp(-this._cameraDirection.y, 0, 1);
    const aerial = THREE.MathUtils.smoothstep(
      downwardness,
      UNDERSTORY_AERIAL_FADE.start,
      UNDERSTORY_AERIAL_FADE.end,
    );
    const opacity = 1 - aerial;
    for (const material of this._materials) material.opacity = opacity;
    this.visible = opacity > 0.002;
    return this;
  }

  dispose() {
    for (const geometry of this._geometries) geometry.dispose();
    for (const material of this._materials) material.dispose();
    this.parent?.remove(this);
  }
}
