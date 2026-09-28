// Painted-geometry collector shared by the city's facade detail and street
// kit. Deliberately the same shape as `buildinggen`'s own `RoleBuilder`
// (`src/buildinggen/buildingMesh.js:19`) and `propgen`'s `PartsBuilder`
// (`src/propgen/propParts.js:35`): transformed primitives, vertex-painted at
// build time, merged to ONE geometry per material role.
//
// It differs from PartsBuilder in exactly one way, and that difference is the
// reason it exists: PartsBuilder paints from a fixed three-slot surface
// palette, and a city needs free per-element RGB — a coral shopfront return
// beside a pale stone pilaster beside a dark bronze mullion, on the same
// merged mesh. `RoleBuilder` already does free RGB but is private to the
// building mesher. When this merges (FILL-008/FILL-011) the two collapse into
// one exported helper.

import * as THREE from 'three';

import { mergePainted } from '../../../src/propgen/propParts.js';

const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

export function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const shade = (rgb, factor) => rgb.map((channel) => Math.min(channel * factor, 1));

/** Collector: free-RGB painted primitives, merged per material role. */
export class CityParts {
  constructor({ variation = 0.05, seed = 1 } = {}) {
    this.variation = variation;
    this.random = mulberry32(seed ^ 0x9e37);
    this.roles = new Map();
    this.count = 0;
  }

  paint(geometry, rgb, shadeFactor) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const normal = geometry.attributes.normal;
    const total = geometry.attributes.position.count;
    const colors = new Float32Array(total * 3);
    for (let index = 0; index < total; index += 1) {
      const drift = 1 + (this.random() * 2 - 1) * this.variation;
      // Upward faces catch a touch more sky — the same cheap edge-light the
      // building mesher and the prop kit both bake.
      const upward = Math.max(0, normal.getY(index));
      const value = drift * shadeFactor * (1 + upward * 0.1);
      colors[index * 3] = Math.min(rgb[0] * value, 1);
      colors[index * 3 + 1] = Math.min(rgb[1] * value, 1);
      colors[index * 3 + 2] = Math.min(rgb[2] * value, 1);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  add(role, geometry, rgb, shadeFactor = 1) {
    this.paint(geometry, rgb, shadeFactor);
    const bucket = this.roles.get(role);
    if (bucket) bucket.push(geometry);
    else this.roles.set(role, [geometry]);
    this.count += 1;
    return this;
  }

  box(role, rgb, shadeFactor, w, h, d, position, rotation = [0, 0, 0]) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    scratchEuler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchPosition.set(position[0], position[1], position[2]);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    geometry.applyMatrix4(scratchMatrix);
    return this.add(role, geometry, rgb, shadeFactor);
  }

  cylinder(role, rgb, shadeFactor, radiusTop, radiusBottom, height, position, rotation = [0, 0, 0], segments = 10) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    scratchEuler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchPosition.set(position[0], position[1], position[2]);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    geometry.applyMatrix4(scratchMatrix);
    return this.add(role, geometry, rgb, shadeFactor);
  }

  /**
   * A run of boxes along a 2D polyline at a fixed height — kerbs, guardrails,
   * sidewalk edges, crossing stripes. Each segment is one box oriented along
   * the segment, so corners meet without gaps at the mitre tolerance a street
   * needs.
   */
  run(role, rgb, shadeFactor, points, { width, height, y = 0, overlap = 0.04 }) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, az] = points[index];
      const [bx, bz] = points[index + 1];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-3) continue;
      this.box(role, rgb, shadeFactor, width, height, length + overlap,
        [(ax + bx) / 2, y + height / 2, (az + bz) / 2],
        [0, Math.atan2(bx - ax, bz - az), 0]);
    }
    return this;
  }

  /** Merged geometry per role. Roles with nothing in them are omitted. */
  build() {
    const result = {};
    for (const [role, geometries] of this.roles) {
      const merged = mergePainted(geometries);
      if (merged) result[role] = merged;
    }
    return result;
  }
}
