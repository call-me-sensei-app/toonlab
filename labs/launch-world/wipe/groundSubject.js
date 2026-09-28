// A whole-scene (S07) wipe subject: one ground mesh, one geometry, TWO ground
// materials.
//
// This is the pattern every non-character domain must follow. Domains like the
// ground shader, the rock shader and water apply a style by MUTATING settings
// on an existing material. If a scene styles a subject that way, both variants
// end up holding the same material reference and the wipe is a silent no-op —
// which `comparison.auditIdentity()` reports as "No tracked node has a
// different material between variants".
//
// The fix is to build both materials up front over the SAME geometry and have
// `applyStyle()` install the styled one. One mesh, one geometry buffer, one
// world transform, two material objects.
//
// Everything here is deterministic: the height field and the splat are pure
// functions of position, and the layer textures are generated from a seeded
// integer hash. No RNG, no per-load regeneration — a precondition for the
// filler register's equivalence test.

import * as THREE from 'three';

import {
  createGroundShaderMaterial,
  createGroundShaderSettings,
} from '../../../src/ground-shader/index.js';

const LAYER_SIZE = 128;
const SPLAT_SIZE = 128;

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Seeded sRGB layer texture — a grain, not a photo, but a real texture. */
function createLayerTexture([r, g, b], { grain = 0.22, scale = 7, seed = 1 } = {}) {
  const data = new Uint8Array(LAYER_SIZE * LAYER_SIZE * 4);
  for (let y = 0; y < LAYER_SIZE; y += 1) {
    for (let x = 0; x < LAYER_SIZE; x += 1) {
      const fine = valueNoise((x / LAYER_SIZE) * scale * 4, (y / LAYER_SIZE) * scale * 4, seed + 11);
      const broad = valueNoise((x / LAYER_SIZE) * scale, (y / LAYER_SIZE) * scale, seed);
      const shade = 1 + grain * (broad - 0.5) * 2 + grain * 0.4 * (fine - 0.5) * 2;
      const index = (y * LAYER_SIZE + x) * 4;
      data[index + 0] = Math.max(0, Math.min(255, Math.round(r * 255 * shade)));
      data[index + 1] = Math.max(0, Math.min(255, Math.round(g * 255 * shade)));
      data[index + 2] = Math.max(0, Math.min(255, Math.round(b * 255 * shade)));
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, LAYER_SIZE, LAYER_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** RGBA = grass / dirt / rock / sand, the ground shader's four fixed channels. */
function buildSplat(size = SPLAT_SIZE) {
  const splat = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const u = col / (size - 1);
      const v = row / (size - 1);
      const wiggle = (valueNoise(u * 6, v * 6, 4211) - 0.5) * 0.16;
      const path = Math.exp(-((u - 0.5 + wiggle) ** 2) / 0.006);
      const sand = Math.max(0, Math.min(1, (v - 0.72 + wiggle) / 0.18));
      const rock = Math.max(0, Math.min(1, (0.2 - v + wiggle) / 0.14));
      const grass = Math.max(0, 1 - path - sand - rock);
      const index = (row * size + col) * 4;
      splat[index + 0] = Math.round(grass * 255);
      splat[index + 1] = Math.round(Math.min(1, path) * 255);
      splat[index + 2] = Math.round(rock * 255);
      splat[index + 3] = Math.round(sand * 255);
    }
  }
  return { splat, splatD: size, splatW: size };
}

/**
 * The ground's own height function — the same expression the geometry is built
 * from, so a subject placed with it is grounded exactly rather than nearly.
 */
export function groundHeightAt(x, z) {
  return valueNoise(x * 0.06 + 32, z * 0.06 + 32, 9021) * 1.4
    + valueNoise(x * 0.2 + 8, z * 0.2 + 8, 5821) * 0.28
    - Math.max(0, z * 0.5 + 6) * 0.06;
}

/**
 * Builds the S07 ground subject.
 *
 * @returns {{applyStyle: Function, dispose: Function, id: string, mesh: object, root: object}}
 */
export function createGroundWipeSubject({ segments = 128, size = 96 } = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, groundHeightAt(x, z));
  }
  geometry.computeVertexNormals();

  const field = buildSplat();
  const layers = [
    { texture: createLayerTexture([0.31, 0.44, 0.21], { scale: 9, seed: 101 }) },
    { texture: createLayerTexture([0.55, 0.52, 0.47], { grain: 0.14, scale: 6, seed: 202 }) },
    { texture: createLayerTexture([0.5, 0.5, 0.52], { grain: 0.3, scale: 5, seed: 303 }) },
    { texture: createLayerTexture([0.79, 0.72, 0.56], { grain: 0.12, scale: 11, seed: 404 }) },
  ];

  const neutralMaterial = createGroundShaderMaterial({
    field, layers, settings: createGroundShaderSettings({ preset: 'neutral' }),
  });
  const styledMaterial = createGroundShaderMaterial({
    field, layers, settings: createGroundShaderSettings({ preset: 'call_me_sensei' }),
  });

  const mesh = new THREE.Mesh(geometry, neutralMaterial);
  mesh.name = 'Launch wipe · Ground';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.groundFieldWrite = true;

  return {
    applyStyle() {
      mesh.material = styledMaterial;
      return { materialSwapped: true, preset: 'call_me_sensei' };
    },
    dispose() {
      geometry.dispose();
      neutralMaterial.dispose?.();
      styledMaterial.dispose?.();
      for (const layer of layers) layer.texture.dispose();
    },
    id: 'ground',
    materials: { neutral: neutralMaterial, styled: styledMaterial },
    mesh,
    root: mesh,
  };
}
