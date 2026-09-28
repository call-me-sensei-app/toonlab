import * as THREE from 'three';

import { createCallMeSenseiGrassField } from '../../../src/vegetation/callMeSenseiGrass.js';

const AUTHORED_CLUMP_HEIGHT = 0.82;
const UP = new THREE.Vector3(0, 1, 0);

export const DEFAULT_ROCK_GRASS_PREVIEW = Object.freeze({
  bladeHeight: 0.13,
  colorAdaptation: 1,
  coverage: 0.8,
  density: 28,
  enabled: false,
  heightStart: 0.55,
  maxClumps: 320,
  slopeStart: 0.52,
  spacing: 0.045,
  uprightness: 0.72,
  windStrength: 0.12,
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function sanitizeRockGrassPreview(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    bladeHeight: clamp(source.bladeHeight, 0.02, 1.5, DEFAULT_ROCK_GRASS_PREVIEW.bladeHeight),
    colorAdaptation: clamp(source.colorAdaptation, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.colorAdaptation),
    coverage: clamp(source.coverage, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.coverage),
    density: clamp(source.density, 0, 240, DEFAULT_ROCK_GRASS_PREVIEW.density),
    enabled: Boolean(source.enabled),
    heightStart: clamp(source.heightStart, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.heightStart),
    maxClumps: Math.round(clamp(source.maxClumps, 1, 1200, DEFAULT_ROCK_GRASS_PREVIEW.maxClumps)),
    slopeStart: clamp(source.slopeStart, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.slopeStart),
    spacing: clamp(source.spacing, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.spacing),
    uprightness: clamp(source.uprightness, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.uprightness),
    windStrength: clamp(source.windStrength, 0, 1, DEFAULT_ROCK_GRASS_PREVIEW.windStrength),
  };
}

function mulberry32(seed) {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function readIndex(index, offset) {
  return index ? index.getX(offset) : offset;
}

function surfaceTriangles(root, settings) {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  if (bounds.isEmpty()) return { bounds, totalArea: 0, triangles: [] };
  const heightSpan = Math.max(bounds.max.y - bounds.min.y, 1e-6);
  const minimumY = bounds.min.y + (heightSpan * settings.heightStart);
  const triangles = [];
  let totalArea = 0;

  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.getAttribute('position')) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const vertexCount = index?.count ?? position.count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
      a.fromBufferAttribute(position, readIndex(index, offset)).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, readIndex(index, offset + 1)).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, readIndex(index, offset + 2)).applyMatrix4(mesh.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac);
      const doubleArea = normal.length();
      if (doubleArea <= 1e-9) continue;
      normal.multiplyScalar(1 / doubleArea);
      if (normal.y < settings.slopeStart || Math.max(a.y, b.y, c.y) < minimumY) continue;
      const area = doubleArea * 0.5;
      totalArea += area;
      triangles.push({
        a: a.clone(),
        area,
        b: b.clone(),
        c: c.clone(),
        cumulativeArea: totalArea,
        normal: normal.clone(),
      });
    }
  });

  return { bounds, totalArea, triangles };
}

function chooseTriangle(triangles, totalArea, random) {
  const target = random() * totalArea;
  let low = 0;
  let high = triangles.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (target <= triangles[middle].cumulativeArea) high = middle;
    else low = middle + 1;
  }
  return triangles[low];
}

function isSpaced(candidate, placements, spacingSq) {
  if (spacingSq <= 0) return true;
  for (const placement of placements) {
    const dx = placement.x - candidate.x;
    const dy = placement.y - candidate.y;
    const dz = placement.z - candidate.z;
    if ((dx * dx) + (dy * dy) + (dz * dz) < spacingSq) return false;
  }
  return true;
}

/** Deterministically scatter preview clumps over the actual upward-facing mesh triangles. */
export function scatterRockMeadowGrass(root, options = {}, seed = 1) {
  const settings = sanitizeRockGrassPreview(options);
  const { bounds, totalArea, triangles } = surfaceTriangles(root, settings);
  if (!settings.enabled || triangles.length === 0 || totalArea <= 0) return [];

  const requested = Math.min(
    settings.maxClumps,
    Math.max(0, Math.round(totalArea * settings.density * settings.coverage)),
  );
  if (requested === 0) return [];

  const random = mulberry32(seed);
  const heightSpan = Math.max(bounds.max.y - bounds.min.y, 1e-6);
  const minimumY = bounds.min.y + (heightSpan * settings.heightStart);
  const spacingSq = settings.spacing * settings.spacing;
  const placements = [];
  const point = new THREE.Vector3();
  const oriented = new THREE.Vector3();
  const forward = new THREE.Vector3();

  for (let attempt = 0; attempt < requested * 18 && placements.length < requested; attempt += 1) {
    const triangle = chooseTriangle(triangles, totalArea, random);
    const rootU = Math.sqrt(random());
    const u = 1 - rootU;
    const v = random() * rootU;
    const w = 1 - u - v;
    point.set(0, 0, 0)
      .addScaledVector(triangle.a, u)
      .addScaledVector(triangle.b, v)
      .addScaledVector(triangle.c, w);
    if (point.y < minimumY) continue;

    oriented.copy(triangle.normal).lerp(UP, settings.uprightness).normalize();
    const yaw = random() * Math.PI * 2;
    forward.set(Math.cos(yaw), 0, Math.sin(yaw));
    forward.addScaledVector(oriented, -forward.dot(oriented)).normalize();
    const lift = Math.max(settings.bladeHeight * 0.012, 0.001);
    const candidate = {
      forward: forward.toArray(),
      normal: oriented.toArray(),
      scale: (settings.bladeHeight / AUTHORED_CLUMP_HEIGHT) * (0.82 + (random() * 0.36)),
      seed: Math.floor(random() * 0xffffffff),
      x: point.x + (triangle.normal.x * lift),
      y: point.y + (triangle.normal.y * lift),
      yaw,
      z: point.z + (triangle.normal.z * lift),
    };
    if (!isSpaced(candidate, placements, spacingSq)) continue;
    placements.push(candidate);
  }
  return placements;
}

/** Build the standard meadow clumps; ground-field sampling supplies their local rock color. */
export async function createRockMeadowGrassPreview(root, options = {}, seed = 1) {
  const settings = sanitizeRockGrassPreview(options);
  const placements = scatterRockMeadowGrass(root, settings, seed);
  if (placements.length === 0) return null;
  const field = await createCallMeSenseiGrassField({
    groundAdoptHeight: 0.9,
    groundAdoptStrength: settings.colorAdaptation,
    groundField: true,
    placements,
    preset: 'call_me_sensei_clump',
    seed,
    windStrength: settings.windStrength,
  });
  field.name = 'Rock Lab preview meadow grass';
  field.userData.rockGrassPreview = {
    colorSource: 'environment-ground-field',
    exportable: false,
    placementCount: placements.length,
    previewOnly: true,
  };
  return field;
}
