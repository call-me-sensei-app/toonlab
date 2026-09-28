// Tiny geometry kit the prop generators share. Every part is a primitive
// (box / cylinder / lathe) transformed into place and vertex-painted from
// the settings palette; a generator's output is ONE merged geometry per
// material role (main + optional glow), which is what keeps a prop at 1–2
// draw calls and makes instanced placement trivial.

import * as THREE from 'three';

import { createDebrisRandom } from '../debrisgen/debrisGenerator.js';

const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

export { createDebrisRandom as createPropRandom };

function paletteColor(surface, slot) {
  const values = slot === 2 ? surface.accentColor
    : slot === 1 ? surface.secondaryColor
      : surface.primaryColor;
  return values;
}

/**
 * Collects transformed, painted primitives and merges them per role.
 * Roles: 'main' (environment-shaded) and 'glow' (warm unlit lamp bodies).
 *
 * Two RNG streams: the generator's `random` drives STRUCTURE (placement
 * jitter — must draw identically for hi and lo detail so LOD swaps don't
 * rearrange the prop), while per-vertex paint drift uses `paintRandom`
 * (vertex counts differ between LODs, so it must not share the stream).
 */
export class PartsBuilder {
  constructor(surface, random, paintRandom = null) {
    this.surface = surface;
    this.random = random;
    // One structural draw seeds the paint stream — the same single draw on
    // every detail level, so hi/lo geometry stays jitter-identical while
    // per-vertex drift (whose call count differs by LOD) runs independently.
    this.paintRandom = paintRandom ?? createDebrisRandom(Math.floor(random() * 0xffffffff));
    this.parts = { glow: [], main: [] };
  }

  /**
   * Adds a geometry. Options: position [x,y,z], rotation [rx,ry,rz] (YXZ),
   * scale number|[x,y,z], slot 0|1|2 (palette), shade multiplier, role.
   * The geometry is consumed (cloned by value into the merge lists).
   */
  add(geometry, {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
    slot = 0,
    shade = 1,
    role = 'main',
    flatShade = false,
  } = {}) {
    const scaleVec = Array.isArray(scale) ? scale : [scale, scale, scale];
    scratchEuler.set(rotation[0], rotation[1], rotation[2], 'YXZ');
    scratchQuaternion.setFromEuler(scratchEuler);
    scratchPosition.set(position[0], position[1], position[2]);
    scratchScale.set(scaleVec[0], scaleVec[1], scaleVec[2]);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    geometry.applyMatrix4(scratchMatrix);
    if (flatShade) geometry.computeVertexNormals();
    this.paint(geometry, slot, shade);
    this.parts[role in this.parts ? role : 'main'].push(geometry);
    return this;
  }

  box(w, h, d, options = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), options);
  }

  cylinder(radiusTop, radiusBottom, height, options = {}) {
    const segments = options.segments ?? 10;
    return this.add(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      options,
    );
  }

  cone(radius, height, options = {}) {
    const segments = options.segments ?? 10;
    return this.add(new THREE.ConeGeometry(radius, height, segments), options);
  }

  sphere(radius, options = {}) {
    const segments = options.segments ?? 8;
    return this.add(new THREE.SphereGeometry(radius, segments, Math.max(6, segments - 2)), options);
  }

  /** Lathe from [ [radius, y], ... ] profile pairs (meters). */
  lathe(profile, options = {}) {
    const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
    const segments = options.segments ?? 10;
    return this.add(new THREE.LatheGeometry(points, segments), options);
  }

  /** Baked vertex paint: palette slot × drift × upward edge light. */
  paint(geometry, slot, shade) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const { surface, paintRandom: random } = this;
    const base = paletteColor(surface, slot);
    const normal = geometry.attributes.normal;
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const drift = 1 + (random() * 2 - 1) * surface.variation;
      const upward = Math.max(0, normal.getY(index));
      const edge = 1 + upward * surface.edgeLight * 0.3;
      const value = drift * edge * shade;
      colors[index * 3] = Math.min(base[0] * value, 1);
      colors[index * 3 + 1] = Math.min(base[1] * value, 1);
      colors[index * 3 + 2] = Math.min(base[2] * value, 1);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  }

  /** Merges collected parts: { main, glow } BufferGeometries (glow null when unused). */
  build() {
    return {
      glow: mergePainted(this.parts.glow),
      main: mergePainted(this.parts.main),
    };
  }
}

/** Position+normal+color+uv merge (uv optional per-part; missing uv fills 0). */
export function mergePainted(geometries) {
  if (!geometries.length) return null;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let offset = 0;
  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const color = geometry.attributes.color;
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      uvs.push(uv ? uv.getX(index) : 0, uv ? uv.getY(index) : 0);
      if (color) colors.push(color.getX(index), color.getY(index), color.getZ(index));
      else colors.push(1, 1, 1);
    }
    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices.push(geometry.index.getX(index) + offset);
      }
    } else {
      for (let index = 0; index < position.count; index += 1) indices.push(index + offset);
    }
    offset += position.count;
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}
