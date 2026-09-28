// First-party paintable grass clumps. The public pieces deliberately mirror
// the useful separation in DCC/engine foliage workflows:
//
// - createGrassClumpGeometry() is the reusable static-mesh equivalent.
// - createGrassClumpMaterial() is the material-instance equivalent, backed by
//   ToonLab's Grass Shader profile and shared ground-field sampling.
// - StylizedGrassClumpField instances one authored tuft per placement and
//   reassigns those placements across three geometry LODs.
//
// The geometry is original procedural ToonLab data. It is generated from a
// versioned curved-ribbon recipe and never reads retained/reference foliage.
// Keeping the recipe in code makes the ownership boundary auditable while
// still producing the reusable static-mesh equivalent expected by painters.

import * as THREE from 'three';

import { createGrassNodeMaterial } from '../shaders-tsl/grass.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import { createGrassSettings } from './stylizedGrass.js';
import { applyVegetationShader } from './vegetationShaders.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const pushScratch = new THREE.Vector3();
const cameraScratch = new THREE.Vector3();
const placementScratch = new THREE.Vector3();
const normalScratch = new THREE.Vector3();
const forwardScratch = new THREE.Vector3();
const matrixScratch = new THREE.Matrix4();
const alignmentScratch = new THREE.Quaternion();
const yawScratch = new THREE.Quaternion();
const rotationScratch = new THREE.Quaternion();
const scaleScratch = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);
const cullBoxScratch = new THREE.Box3();
const cullFrustumScratch = new THREE.Frustum();
const cullMatrixScratch = new THREE.Matrix4();
const cullSphereScratch = new THREE.Sphere();
const cullMinScratch = new THREE.Vector3();
const cullMaxScratch = new THREE.Vector3();

const DEFAULT_GRASS_CHUNK_SIZE = 16;
const DEFAULT_GRASS_CULL_PADDING = 1.5;

export const GRASS_CLUMP_LODS = Object.freeze([
  Object.freeze({ bladeRetention: 1, distance: 50, level: 0, name: 'near' }),
  Object.freeze({ bladeRetention: 0.35, distance: 68, level: 1, name: 'mid' }),
  // The last LOD is the terminal representation, not an implicit hard cull.
  // Hosts that need distance culling can provide an explicit density/fade
  // policy without creating an unexplained straight grass boundary at 80 m.
  Object.freeze({ bladeRetention: 0.15, distance: Infinity, level: 2, name: 'far' }),
]);

export const GRASS_CLUMP_GEOMETRY_RECIPE = Object.freeze({
  authority: 'Hyperbond Studio PTE. LTD. (Call Me Sensei)',
  geometry: 'procedural curved tapered ribbons',
  id: 'toonlab/call-me-sensei-grass-clump',
  license: 'MIT',
  mediaDependencies: Object.freeze([]),
  referenceGeometryUsed: false,
  version: 3,
});

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function setSrgbColor(color, rgb) {
  color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

function colorArray(value, fallback) {
  if (value?.isColor) return value.clone().convertLinearToSRGB().toArray();
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    if (next.every(Number.isFinite)) return next;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const color = new THREE.Color(value);
      return color.convertLinearToSRGB().toArray();
    } catch {
      return [...fallback];
    }
  }
  return [...fallback];
}

function vectorArray(value, fallback, size) {
  const keys = ['x', 'y', 'z'];
  const next = Array.from({ length: size }, (_, index) => Number(
    Array.isArray(value) ? value[index] : value?.[keys[index]],
  ));
  return next.every(Number.isFinite) ? next : [...fallback].slice(0, size);
}

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function positionHash01(x, z, salt = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function resolveLodProfile(lod) {
  const level = THREE.MathUtils.clamp(Math.round(Number(lod) || 0), 0, GRASS_CLUMP_LODS.length - 1);
  return GRASS_CLUMP_LODS[level];
}

function createClumpLayout(settings, seed) {
  const random = mulberry32(seed);
  const count = Math.max(3, Math.round(settings.bladesPerClump));
  const [heightMin, heightMax] = settings.bladeHeightRange;
  const [widthMin, widthMax] = settings.bladeWidthRange;
  const candidates = [];

  for (let index = 0; index < count; index += 1) {
    const normalizedRadius = index === 0
      ? 0
      : Math.sqrt((index - 0.35) / Math.max(count - 0.35, 1));
    const angle = index * GOLDEN_ANGLE + (random() - 0.5) * 0.34;
    const radius = normalizedRadius * settings.clumpRadius * (0.88 + random() * 0.12);
    const edgeHeight = 1 - normalizedRadius * 0.16;
    candidates.push({
      facing: angle + Math.PI * 0.5 + (random() - 0.5) * 1.5,
      height: THREE.MathUtils.lerp(heightMin, heightMax, 0.18 + random() * 0.82) * edgeHeight,
      phase: random(),
      priority: index === 0 ? -1 : random(),
      width: THREE.MathUtils.lerp(widthMin, widthMax, random()),
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    });
  }

  // Lower LODs are strict subsets of LOD0. Randomized priority keeps those
  // subsets distributed across the full tuft instead of collapsing inward.
  return candidates.sort((a, b) => a.priority - b.priority);
}

/**
 * Builds one reusable tapered grass-tuft geometry at LOD0/1/2.
 *
 * The mesh stores per-blade base, height, width, phase, and facing as vertex
 * attributes; a clump field adds only one origin/yaw/scale record per painted
 * placement. The shader therefore keeps independent wind per blade without
 * turning every blade into an authoring record.
 */
export function createGrassClumpGeometry({
  lod = 0,
  seed = 1337,
  settings: inputSettings = {},
} = {}) {
  const settings = createGrassSettings({
    preset: 'call_me_sensei_clump',
    ...cleanObject(inputSettings),
  });
  const profile = resolveLodProfile(lod);
  const fullLayout = createClumpLayout(settings, seed);
  const bladeCount = Math.max(3, Math.round(fullLayout.length * profile.bladeRetention));
  const layout = fullLayout.slice(0, bladeCount);
  // LODs reduce overlapping strokes, not their integrated screen coverage.
  // Widen retained blades in inverse proportion to retention so moving the
  // camera does not reveal a different amount (and therefore a different
  // apparent color) of the ground beneath the clump.
  const coverageCompensation = fullLayout.length / bladeCount;
  const fullWidthSum = fullLayout.reduce((sum, blade) => sum + blade.width, 0);
  let effectiveWidthSum = 0;

  // Nine vertices / seven triangles. This narrow, slightly asymmetric ribbon
  // reads as a blade instead of the broad leaf silhouette of the old fallback.
  // The footprint, not an oversized blade, is responsible for joining painted
  // placements into a meadow. These normalized coordinates were authored for
  // ToonLab and are not sampled from a mesh.
  const bladeShape = [
    [-0.24, 0], [0.24, 0],
    [-0.42, 0.2], [0.38, 0.2],
    [-0.34, 0.5], [0.29, 0.5],
    [-0.18, 0.79], [0.13, 0.79],
    [-0.025, 1],
  ];
  const bladeIndices = [
    0, 1, 2, 1, 3, 2,
    2, 3, 4, 3, 5, 4,
    4, 5, 6, 5, 7, 6,
    6, 7, 8,
  ];
  const vertexCount = bladeCount * bladeShape.length;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const bladeOrigins = new Float32Array(vertexCount * 3);
  const bladeInfos = new Float32Array(vertexCount * 4);
  const indices = new Uint16Array(bladeCount * bladeIndices.length);

  for (let bladeIndex = 0; bladeIndex < bladeCount; bladeIndex += 1) {
    const blade = layout[bladeIndex];
    const vertexBase = bladeIndex * bladeShape.length;
    for (let vertex = 0; vertex < bladeShape.length; vertex += 1) {
      const target = vertexBase + vertex;
      const [x, y] = bladeShape[vertex];
      positions[target * 3] = x;
      positions[target * 3 + 1] = y;
      normals[target * 3 + 1] = 1;
      uvs[target * 2] = x + 0.5;
      uvs[target * 2 + 1] = y;
      bladeOrigins[target * 3] = blade.x;
      bladeOrigins[target * 3 + 2] = blade.z;
      bladeInfos[target * 4] = blade.height;
      bladeInfos[target * 4 + 1] = blade.width * coverageCompensation;
      bladeInfos[target * 4 + 2] = blade.phase;
      bladeInfos[target * 4 + 3] = blade.facing;
    }
    effectiveWidthSum += blade.width * coverageCompensation;
    for (let index = 0; index < bladeIndices.length; index += 1) {
      indices[bladeIndex * bladeIndices.length + index] = vertexBase + bladeIndices[index];
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = `ToonLabCallMeSenseiGrassClump:LOD${profile.level}`;
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aBladeOrigin', new THREE.BufferAttribute(bladeOrigins, 3));
  geometry.setAttribute('aBladeInfo', new THREE.BufferAttribute(bladeInfos, 4));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, settings.bladeHeightRange[1] * 0.5, 0),
    settings.clumpRadius + settings.bladeHeightRange[1],
  );
  geometry.userData.grassClump = {
    authority: GRASS_CLUMP_GEOMETRY_RECIPE.authority,
    bladeCount,
    coverageCompensation,
    effectiveCoverageRatio: effectiveWidthSum / fullWidthSum,
    effectiveWidthSum,
    fullWidthSum,
    lod: profile.level,
    recipeId: GRASS_CLUMP_GEOMETRY_RECIPE.id,
    recipeVersion: GRASS_CLUMP_GEOMETRY_RECIPE.version,
    referenceGeometryUsed: false,
    role: 'static-mesh-equivalent',
    seed,
    triangleCount: indices.length / 3,
    vertexCount,
  };
  return geometry;
}

function applySettingsToMaterial(material, settings) {
  const uniforms = material.uniforms;
  uniforms.uShadowStrength.value = settings.shadowStrength;
  uniforms.uWindDirection.value.set(...settings.windDirection);
  uniforms.uWindSpeed.value = settings.windSpeed;
  uniforms.uWindStrength.value = settings.windStrength;
  uniforms.uGustFrequency.value = settings.gustFrequency;
  uniforms.uGustResponse.value = settings.gustResponse;
  uniforms.uGustSpeed.value = settings.gustSpeed;
  uniforms.uStaticLean.value = settings.leanStrength;
  uniforms.uWindResponse.value = settings.windResponse;
  uniforms.uPushRadius.value = settings.pushRadius;
  uniforms.uGroundAdoptStrength.value = settings.groundAdoptStrength;
  uniforms.uGroundAdoptHeight.value = settings.groundAdoptHeight;
  uniforms.uGroundAdoptTint.value.setRGB(...settings.groundAdoptTint);
  uniforms.uWashLift.value = settings.washLift;
  uniforms.uWashOpacity.value = settings.washOpacity;
  uniforms.uBacklitStrength.value = settings.backlitStrength;
  uniforms.uCloudShadowStrength.value = settings.cloudShadowStrength;
  uniforms.uCloudShadowCoverage.value = settings.cloudShadowCoverage;
  uniforms.uCloudShadowScale.value = settings.cloudShadowScale;
  uniforms.uCloudShadowVelocity.value.set(...settings.cloudShadowVelocity);
  uniforms.uSunDirection.value.set(...settings.sunDirection).normalize();
  setSrgbColor(uniforms.uBaseColor.value, settings.baseColor);
  setSrgbColor(uniforms.uTipColor.value, settings.tipColor);
  setSrgbColor(uniforms.uSunColor.value, settings.sunColor);
  setSrgbColor(uniforms.uSkyColor.value, settings.skyColor);
  setSrgbColor(uniforms.uShadowTint.value, settings.shadowTint);
  return material;
}

/** Creates the clump's ToonLab Grass Shader material-instance equivalent. */
export function createGrassClumpMaterial(
  options = {},
  vegetationShader = null,
  { groundField = true } = {},
) {
  const settings = createGrassSettings({
    preset: 'call_me_sensei_clump',
    ...cleanObject(options),
  });
  const material = createGrassNodeMaterial(settings, vegetationShader, {
    geometryMode: 'clump',
    groundField,
  });
  material.name = 'StylizedGrassClumpMaterial';
  material.userData.grassClump = {
    groundColor: 'root-weighted environment ground field',
    role: 'material-instance-equivalent',
  };
  material.transparent = settings.washOpacity < 0.999;
  material.depthWrite = true;
  return markFactoryStyleMaterial(applySettingsToMaterial(material, settings), 'GrassBlade');
}

function createInstancedLevelGeometry(base, capacity) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  for (const [name, attribute] of Object.entries(base.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  // WebGPU guarantees only eight vertex buffers. The clump mesh already uses
  // five static streams, so four independent instance streams requested nine
  // and invalidated the pipeline on conforming eight-buffer devices. Keep the
  // public shader attribute names while packing all per-instance data into one
  // 13-float interleaved stream (five + one = six vertex buffers total).
  const instanceData = new THREE.InstancedInterleavedBuffer(
    new Float32Array(capacity * 13),
    13,
  );
  instanceData.setUsage(THREE.DynamicDrawUsage);
  const origins = new THREE.InterleavedBufferAttribute(instanceData, 3, 0);
  const clumps = new THREE.InterleavedBufferAttribute(instanceData, 4, 3);
  const surfaceNormals = new THREE.InterleavedBufferAttribute(instanceData, 3, 7);
  const surfaceForwards = new THREE.InterleavedBufferAttribute(instanceData, 3, 10);
  geometry.setAttribute('iOrigin', origins);
  geometry.setAttribute('iClump', clumps);
  geometry.setAttribute('iSurfaceNormal', surfaceNormals);
  geometry.setAttribute('iSurfaceForward', surfaceForwards);
  geometry.instanceCount = 0;
  geometry.boundingBox = new THREE.Box3();
  geometry.boundingSphere = new THREE.Sphere();
  geometry.userData.grassClump = { ...base.userData.grassClump };
  geometry.userData.grassClump.vertexBufferCount = 6;
  return geometry;
}

function placementPhase(placement) {
  return Number.isFinite(placement.phase)
    ? placement.phase
    : positionHash01(placement.x ?? 0, placement.z ?? 0, 1);
}

function placementYaw(placement) {
  return Number.isFinite(placement.yaw)
    ? placement.yaw
    : positionHash01(placement.x ?? 0, placement.z ?? 0, 2) * Math.PI * 2;
}

function placementNormal(placement) {
  const source = placement.normal;
  const x = Number(Array.isArray(source) ? source[0] : source?.x);
  const y = Number(Array.isArray(source) ? source[1] : source?.y);
  const z = Number(Array.isArray(source) ? source[2] : source?.z);
  if (![x, y, z].every(Number.isFinite)) return [0, 1, 0];
  placementScratch.set(x, y, z);
  if (placementScratch.lengthSq() < 1e-8) return [0, 1, 0];
  placementScratch.normalize();
  return [placementScratch.x, placementScratch.y, placementScratch.z];
}

function placementForward(placement, normal) {
  const source = placement.forward;
  const sourceX = Number(Array.isArray(source) ? source[0] : source?.x);
  const sourceY = Number(Array.isArray(source) ? source[1] : source?.y);
  const sourceZ = Number(Array.isArray(source) ? source[2] : source?.z);
  const yaw = placementYaw(placement);
  forwardScratch.set(
    Number.isFinite(sourceX) ? sourceX : Math.cos(yaw),
    Number.isFinite(sourceY) ? sourceY : 0,
    Number.isFinite(sourceZ) ? sourceZ : Math.sin(yaw),
  );
  normalScratch.set(normal[0], normal[1], normal[2]);
  forwardScratch.addScaledVector(normalScratch, -forwardScratch.dot(normalScratch));
  if (forwardScratch.lengthSq() < 1e-8) {
    forwardScratch.set(1, 0, 0)
      .addScaledVector(normalScratch, -normalScratch.x);
  }
  if (forwardScratch.lengthSq() < 1e-8) forwardScratch.set(0, 0, 1);
  forwardScratch.normalize();
  return [forwardScratch.x, forwardScratch.y, forwardScratch.z];
}

function matrixFromPlacement(placement, target) {
  if (placement.matrix?.isMatrix4) return target.copy(placement.matrix);
  if (Array.isArray(placement.matrix) && placement.matrix.length >= 16) {
    return target.fromArray(placement.matrix);
  }
  const normal = placementNormal(placement);
  normalScratch.set(normal[0], normal[1], normal[2]);
  alignmentScratch.setFromUnitVectors(upAxis, normalScratch);
  yawScratch.setFromAxisAngle(upAxis, placementYaw(placement));
  rotationScratch.multiplyQuaternions(alignmentScratch, yawScratch);
  placementScratch.set(
    finiteNumber(placement.x, 0),
    finiteNumber(placement.y, 0),
    finiteNumber(placement.z, 0),
  );
  const scale = finiteNumber(placement.scale, 1, { min: 0.01 });
  normalScratch.setScalar(scale);
  return target.compose(placementScratch, rotationScratch, normalScratch);
}

function localPositionFromPlacement(placement, target) {
  if (placement.matrix?.isMatrix4 || (Array.isArray(placement.matrix) && placement.matrix.length >= 16)) {
    return target.setFromMatrixPosition(matrixFromPlacement(placement, matrixScratch));
  }
  return target.set(
    finiteNumber(placement.x, 0),
    finiteNumber(placement.y, 0),
    finiteNumber(placement.z, 0),
  );
}

function maxScaleFromPlacement(placement) {
  if (placement.matrix?.isMatrix4 || (Array.isArray(placement.matrix) && placement.matrix.length >= 16)) {
    matrixFromPlacement(placement, matrixScratch).decompose(
      placementScratch,
      rotationScratch,
      scaleScratch,
    );
    return Math.max(Math.abs(scaleScratch.x), Math.abs(scaleScratch.y), Math.abs(scaleScratch.z), 0.01);
  }
  return finiteNumber(placement.scale, 1, { min: 0.01 });
}

function placementCullRadius(placement, baseRadius, padding = 0) {
  return baseRadius * maxScaleFromPlacement(placement) + padding;
}

function expandBoxForPlacement(box, placement, baseRadius, padding = 0) {
  const radius = placementCullRadius(placement, baseRadius, padding);
  localPositionFromPlacement(placement, placementScratch);
  cullMinScratch.copy(placementScratch).addScalar(-radius);
  cullMaxScratch.copy(placementScratch).addScalar(radius);
  box.expandByPoint(cullMinScratch);
  box.expandByPoint(cullMaxScratch);
}

function createPlacementChunks(placements, {
  baseRadius,
  chunkSize = DEFAULT_GRASS_CHUNK_SIZE,
  padding = DEFAULT_GRASS_CULL_PADDING,
} = {}) {
  const size = finiteNumber(chunkSize, DEFAULT_GRASS_CHUNK_SIZE, { min: 2 });
  const chunks = new Map();
  for (const placement of placements) {
    localPositionFromPlacement(placement, placementScratch);
    const cellX = Math.floor(placementScratch.x / size);
    const cellZ = Math.floor(placementScratch.z / size);
    const key = `${cellX}:${cellZ}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = {
        box: new THREE.Box3(),
        cellX,
        cellZ,
        placements: [],
        sphere: new THREE.Sphere(),
      };
      chunks.set(key, chunk);
    }
    chunk.placements.push(placement);
    expandBoxForPlacement(chunk.box, placement, baseRadius, padding);
  }
  for (const chunk of chunks.values()) chunk.box.getBoundingSphere(chunk.sphere);
  return [...chunks.values()];
}

function updatePlacementGeometryBounds(geometry, placements, baseRadius, padding = 0) {
  if (!placements.length) {
    geometry.boundingBox ??= new THREE.Box3();
    geometry.boundingSphere ??= new THREE.Sphere();
    geometry.boundingBox.min.set(0, 0, 0);
    geometry.boundingBox.max.set(0, 0, 0);
    geometry.boundingSphere.center.set(0, 0, 0);
    geometry.boundingSphere.radius = 0;
    return;
  }
  cullBoxScratch.makeEmpty();
  for (const placement of placements) {
    expandBoxForPlacement(cullBoxScratch, placement, baseRadius, padding);
  }
  geometry.boundingBox ??= new THREE.Box3();
  geometry.boundingSphere ??= new THREE.Sphere();
  geometry.boundingBox.copy(cullBoxScratch);
  cullBoxScratch.getBoundingSphere(geometry.boundingSphere);
}

function prepareGrassCulling(field, source, baseRadius) {
  field._frustumCulling = source.frustumCulling !== false;
  field._cullPadding = finiteNumber(
    source.cullPadding,
    DEFAULT_GRASS_CULL_PADDING,
    { min: 0 },
  );
  field._chunkSize = finiteNumber(
    source.chunkSize,
    DEFAULT_GRASS_CHUNK_SIZE,
    { min: 2 },
  );
  field._placementCullRadius = Math.max(Number(baseRadius) || 0, 0.01);
  field._maxVisibleChunks = finiteNumber(source.maxVisibleChunks, Infinity, { min: 1 });
  field._maxVisibleInstances = finiteNumber(source.maxVisibleInstances, Infinity, { min: 1 });
  field._placementChunks = createPlacementChunks(field.placements, {
    baseRadius: field._placementCullRadius,
    chunkSize: field._chunkSize,
    padding: field._cullPadding,
  });
  field._cullingStats = {
    culledInstances: 0,
    budgetCulledInstances: 0,
    distanceCulledInstances: 0,
    testedInstances: field.placements.length,
    totalChunks: field._placementChunks.length,
    visibleChunks: field._placementChunks.length,
    visibleInstances: field.placements.length,
  };
  field.userData.grassSpatialCulling = {
    chunkSize: field._chunkSize,
    enabled: field._frustumCulling,
  };
}

function assignVisibleLods(field, camera, buckets) {
  if (!camera) {
    buckets[0].push(...field.placements);
    field._cullingStats = {
      culledInstances: 0,
      budgetCulledInstances: 0,
      distanceCulledInstances: 0,
      testedInstances: field.placements.length,
      totalChunks: field._placementChunks.length,
      visibleChunks: field._placementChunks.length,
      visibleInstances: field.placements.length,
    };
    return;
  }

  camera.updateMatrixWorld(true);
  camera.getWorldPosition(cameraScratch);
  field.updateWorldMatrix(true, false);

  if (field._frustumCulling) {
    cullMatrixScratch.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    cullFrustumScratch.setFromProjectionMatrix(cullMatrixScratch, camera.coordinateSystem);
  }

  let visibleChunks = 0;
  let testedInstances = 0;
  let visibleInstances = 0;
  let culledInstances = 0;
  let distanceCulledInstances = 0;
  let budgetCulledInstances = 0;
  const candidateChunks = [];
  for (const chunk of field._placementChunks) {
    if (field._frustumCulling) {
      cullSphereScratch.copy(chunk.sphere).applyMatrix4(field.matrixWorld);
      if (!cullFrustumScratch.intersectsSphere(cullSphereScratch)) {
        culledInstances += chunk.placements.length;
        continue;
      }
    }
    cullSphereScratch.copy(chunk.sphere).applyMatrix4(field.matrixWorld);
    candidateChunks.push({
      chunk,
      distance: cullSphereScratch.center.distanceToSquared(cameraScratch),
    });
  }
  candidateChunks.sort((left, right) => left.distance - right.distance
    || left.chunk.cellX - right.chunk.cellX
    || left.chunk.cellZ - right.chunk.cellZ);
  const selectedChunks = candidateChunks.slice(0, field._maxVisibleChunks);
  for (const { chunk } of candidateChunks.slice(selectedChunks.length)) {
    budgetCulledInstances += chunk.placements.length;
  }
  visibleChunks = selectedChunks.length;
  for (const { chunk } of selectedChunks) {
    for (const placement of chunk.placements) {
      if (visibleInstances >= field._maxVisibleInstances) {
        budgetCulledInstances += 1;
        continue;
      }
      testedInstances += 1;
      localPositionFromPlacement(placement, placementScratch);
      cullSphereScratch.center.copy(placementScratch);
      cullSphereScratch.radius = placementCullRadius(
        placement,
        field._placementCullRadius,
        field._cullPadding,
      );
      cullSphereScratch.applyMatrix4(field.matrixWorld);
      if (field._frustumCulling && !cullFrustumScratch.intersectsSphere(cullSphereScratch)) {
        culledInstances += 1;
        continue;
      }
      const distance = cullSphereScratch.center.distanceTo(cameraScratch);
      const level = field.lodProfiles.findIndex((profile) => distance <= profile.distance);
      if (level < 0) {
        distanceCulledInstances += 1;
        continue;
      }
      buckets[level].push(placement);
      visibleInstances += 1;
    }
  }
  field._cullingStats = {
    culledInstances: culledInstances + budgetCulledInstances,
    budgetCulledInstances,
    distanceCulledInstances,
    testedInstances,
    totalChunks: field._placementChunks.length,
    visibleChunks,
    visibleInstances,
  };
}

function applyGrassQualityBudget(field, {
  chunkSize,
  cullPadding,
  frustumCulling,
  lodDistances,
  lodUpdateInterval,
  maxVisibleChunks,
  maxVisibleInstances,
} = {}) {
  if (frustumCulling !== undefined) field._frustumCulling = frustumCulling !== false;
  if (Number.isFinite(cullPadding)) field._cullPadding = Math.max(cullPadding, 0);
  if (Number.isFinite(chunkSize)) field._chunkSize = Math.max(chunkSize, 2);
  if (Number.isFinite(maxVisibleChunks)) field._maxVisibleChunks = Math.max(1, maxVisibleChunks);
  if (Number.isFinite(maxVisibleInstances)) field._maxVisibleInstances = Math.max(1, maxVisibleInstances);
  if (Number.isFinite(lodUpdateInterval)) field._lodUpdateInterval = Math.max(0.05, lodUpdateInterval);
  if (Array.isArray(lodDistances)) {
    field.lodProfiles = GRASS_CLUMP_LODS.map((profile, index) => Object.freeze({
      ...profile,
      distance: Number.isFinite(Number(lodDistances[index]))
        ? Number(lodDistances[index])
        : profile.distance,
    }));
    field._qualityLodDistances = field.lodProfiles.map(({ distance }) => distance);
  }
  if (Number.isFinite(field._distanceFadeEnd)) {
    field.lodProfiles = field.lodProfiles.map((profile, index) => Object.freeze({
      ...profile,
      distance: index === field.lodProfiles.length - 1
        ? Math.min(field._qualityLodDistances[index], field._distanceFadeEnd)
        : profile.distance,
    }));
  }
  field._placementChunks = createPlacementChunks(field.placements, {
    baseRadius: field._placementCullRadius,
    chunkSize: field._chunkSize,
    padding: field._cullPadding,
  });
  field.userData.grassSpatialCulling = {
    chunkSize: field._chunkSize,
    enabled: field._frustumCulling,
    maxVisibleChunks: field._maxVisibleChunks,
    maxVisibleInstances: field._maxVisibleInstances,
  };
  field._assignLods(field._camera);
  return field;
}

function grassQualityBudget(field) {
  return Object.freeze({
    chunkSize: field._chunkSize,
    cullPadding: field._cullPadding,
    frustumCulling: field._frustumCulling,
    lodDistances: Object.freeze(field.lodProfiles.map(({ distance }) => distance)),
    lodUpdateInterval: field._lodUpdateInterval,
    maxVisibleChunks: field._maxVisibleChunks,
    maxVisibleInstances: field._maxVisibleInstances,
  });
}

/**
 * One paint record = one clump instance. Three shared tapered geometries are
 * kept live and records move between their instance buffers by camera range.
 */
export class StylizedGrassClumpField extends THREE.Group {
  constructor(options = {}) {
    super();
    const source = cleanObject(options);
    const {
      groundField = true,
      placements = [],
      seed = 1337,
      styleTarget = {},
      vegetationShader = null,
    } = source;
    this.name = 'StylizedGrassClumpField';
    this.settings = createGrassSettings({
      ...source,
      preset: source.preset ?? 'call_me_sensei_clump',
    });
    this.placements = placements.map((placement) => ({ ...placement }));
    this.pushTarget = null;
    this._camera = null;
    this._lodTimer = 0;
    this._lodUpdateInterval = finiteNumber(source.lodUpdateInterval, 0.35, { min: 0.05 });
    this.lodProfiles = GRASS_CLUMP_LODS.map((profile, index) => Object.freeze({
      ...profile,
      distance: Array.isArray(source.lodDistances) && Number.isFinite(Number(source.lodDistances[index]))
        ? Number(source.lodDistances[index])
        : profile.distance,
    }));
    this._qualityLodDistances = this.lodProfiles.map(({ distance }) => distance);
    this._distanceFadeEnd = Infinity;
    const bladeHeight = Math.max(...this.settings.bladeHeightRange);
    prepareGrassCulling(
      this,
      source,
      Math.hypot(this.settings.clumpRadius, bladeHeight),
    );

    const capacity = Math.max(this.placements.length, 1);
    this.lodMeshes = this.lodProfiles.map((profile) => {
      const base = createGrassClumpGeometry({ lod: profile.level, seed, settings: this.settings });
      const geometry = createInstancedLevelGeometry(base, capacity);
      const material = createGrassClumpMaterial(this.settings, vegetationShader, { groundField });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `StylizedGrassClumpField:LOD${profile.level}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.userData.grassClumpLod = profile.level;
      mesh.userData.waterExclude = true;
      this.add(mesh);
      return mesh;
    });
    attachFactoryStyleTarget(this, 'vegetation.grass', {
      targetId: 'toonlab/grass-clumps',
      ...styleTarget,
      materials: {
        assignments: { GrassBlade: { roles: ['grassBlade'] } },
        ...(styleTarget.materials ?? {}),
      },
    });
    this._assignLods(null);
  }

  get instanceCount() {
    return this.placements.length;
  }

  get bladeCount() {
    return this.bladeBudget().drawn;
  }

  get cullingStats() {
    return { ...this._cullingStats };
  }

  get qualityBudget() {
    return grassQualityBudget(this);
  }

  bladeBudget() {
    const perLod = this.lodMeshes.map((mesh, level) => {
      const instances = mesh.geometry.instanceCount;
      const bladesPerInstance = mesh.geometry.userData.grassClump.bladeCount;
      return {
        bladesPerInstance,
        drawn: instances * bladesPerInstance,
        instances,
        level,
      };
    });
    const authoredBladesPerInstance = perLod[0]?.bladesPerInstance ?? 0;
    return {
      authored: this.placements.length * authoredBladesPerInstance,
      drawn: perLod.reduce((sum, lod) => sum + lod.drawn, 0),
      instances: this.placements.length,
      perLod,
    };
  }

  _writeLevel(level, placements) {
    const geometry = this.lodMeshes[level].geometry;
    const origins = geometry.getAttribute('iOrigin');
    const clumps = geometry.getAttribute('iClump');
    const surfaceNormals = geometry.getAttribute('iSurfaceNormal');
    const surfaceForwards = geometry.getAttribute('iSurfaceForward');
    for (let index = 0; index < placements.length; index += 1) {
      const placement = placements[index];
      const normal = placementNormal(placement);
      const forward = placementForward(placement, normal);
      origins.setXYZ(index, placement.x ?? 0, placement.y ?? 0, placement.z ?? 0);
      clumps.setXYZW(
        index,
        finiteNumber(placement.scale, 1, { min: 0.01 }),
        placementPhase(placement),
        placementYaw(placement),
        positionHash01(placement.x ?? 0, placement.z ?? 0, 3),
      );
      surfaceNormals.setXYZ(index, normal[0], normal[1], normal[2]);
      surfaceForwards.setXYZ(index, forward[0], forward[1], forward[2]);
    }
    geometry.instanceCount = placements.length;
    updatePlacementGeometryBounds(
      geometry,
      placements,
      this._placementCullRadius,
      this._cullPadding,
    );
    origins.needsUpdate = true;
    clumps.needsUpdate = true;
    surfaceNormals.needsUpdate = true;
    surfaceForwards.needsUpdate = true;
  }

  _assignLods(camera) {
    const buckets = this.lodProfiles.map(() => []);
    assignVisibleLods(this, camera, buckets);
    buckets.forEach((bucket, level) => this._writeLevel(level, bucket));
  }

  applySettings(options = {}) {
    this.settings = createGrassSettings({ ...this.settings, ...cleanObject(options) });
    for (const mesh of this.lodMeshes) {
      applySettingsToMaterial(mesh.material, this.settings);
      mesh.material.transparent = this.settings.washOpacity < 0.999;
      mesh.material.depthWrite = true;
      mesh.material.needsUpdate = true;
    }
    return this.settings;
  }

  setWind({ direction, speed, strength, gustFrequency, gustSpeed } = {}) {
    for (const { material } of this.lodMeshes) {
      const uniforms = material.uniforms;
      if (direction !== undefined) {
        const next = vectorArray(direction, this.settings.windDirection, 2);
        uniforms.uWindDirection.value.set(next[0], next[1]);
      }
      if (Number.isFinite(speed)) uniforms.uWindSpeed.value = speed;
      if (Number.isFinite(strength)) uniforms.uWindStrength.value = Math.max(strength, 0);
      if (Number.isFinite(gustFrequency)) uniforms.uGustFrequency.value = Math.max(gustFrequency, 0);
      if (Number.isFinite(gustSpeed)) uniforms.uGustSpeed.value = Math.max(gustSpeed, 0);
    }
    return this;
  }

  setSun({ direction, color, intensity, sky, skyIntensity } = {}) {
    for (const { material } of this.lodMeshes) {
      const uniforms = material.uniforms;
      if (direction !== undefined) {
        const next = vectorArray(direction, this.settings.sunDirection, 3);
        uniforms.uSunDirection.value.set(...next).normalize();
      }
      if (color !== undefined) {
        setSrgbColor(uniforms.uSunColor.value, colorArray(color, this.settings.sunColor));
      }
      if (sky !== undefined) {
        setSrgbColor(uniforms.uSkyColor.value, colorArray(sky, this.settings.skyColor));
      }
      if (Number.isFinite(intensity) && uniforms.uSunIntensity) {
        uniforms.uSunIntensity.value = Math.max(intensity, 0);
      }
      if (Number.isFinite(skyIntensity) && uniforms.uSkyIntensity) {
        uniforms.uSkyIntensity.value = Math.max(skyIntensity, 0);
      }
    }
    return this;
  }

  setSceneShadow({ strength, tint } = {}) {
    return this.applySettings({
      ...(strength !== undefined ? { shadowStrength: strength } : {}),
      ...(tint !== undefined ? { shadowTint: tint } : {}),
    });
  }

  setCloudShadow({ strength, coverage, scale, velocity } = {}) {
    for (const { material } of this.lodMeshes) {
      const uniforms = material.uniforms;
      if (Number.isFinite(strength)) uniforms.uCloudShadowStrength.value = THREE.MathUtils.clamp(strength, 0, 1);
      if (Number.isFinite(coverage)) uniforms.uCloudShadowCoverage.value = THREE.MathUtils.clamp(coverage, 0, 1);
      if (Number.isFinite(scale)) uniforms.uCloudShadowScale.value = Math.max(scale, 0.0001);
      if (velocity !== undefined) {
        const next = vectorArray(velocity, this.settings.cloudShadowVelocity, 2);
        uniforms.uCloudShadowVelocity.value.set(next[0], next[1]);
      }
    }
    return this;
  }

  setSurfaceWeather({ wetness, snowCover } = {}) {
    for (const { material } of this.lodMeshes) {
      if (material.uniforms.uWetness && Number.isFinite(wetness)) {
        material.uniforms.uWetness.value = THREE.MathUtils.clamp(wetness, 0, 1);
      }
      if (material.uniforms.uSnowCover && Number.isFinite(snowCover)) {
        material.uniforms.uSnowCover.value = THREE.MathUtils.clamp(snowCover, 0, 1);
      }
    }
    return this;
  }

  setVegetationShader(profile) {
    return applyVegetationShader(this, profile);
  }

  setDistanceFade({ start = 1e6, end } = {}) {
    const fadeEnd = Number.isFinite(end) ? Math.max(end, start + 0.01) : start + 1;
    for (const { material } of this.lodMeshes) {
      material.uniforms.uFadeStart.value = start;
      material.uniforms.uFadeEnd.value = fadeEnd;
    }
    // A clump is guaranteed fully transparent beyond fadeEnd. Keep the CPU
    // terminal LOD boundary on that same contract so fog-hidden instances do
    // not remain in the draw buffers indefinitely.
    this._distanceFadeEnd = fadeEnd;
    this.lodProfiles = this.lodProfiles.map((profile, index) => Object.freeze({
      ...profile,
      distance: index === this.lodProfiles.length - 1
        ? Math.min(this._qualityLodDistances[index], fadeEnd)
        : profile.distance,
    }));
    this._assignLods(this._camera);
    return this;
  }

  setQualityBudget(options = {}) {
    return applyGrassQualityBudget(this, options);
  }

  updateLods(camera = this._camera) {
    if (camera) this._camera = camera;
    this._assignLods(this._camera);
    this._lodTimer = 0;
    return this;
  }

  setPushTarget(target) {
    this.pushTarget = target;
    return this;
  }

  setPushRadius(radius) {
    for (const { material } of this.lodMeshes) {
      material.uniforms.uPushRadius.value = finiteNumber(
        radius,
        material.uniforms.uPushRadius.value,
        { min: 0 },
      );
    }
    return this;
  }

  update(delta = 0.016, camera = null) {
    const step = Math.min(Math.max(delta, 0), 0.1);
    for (const { material } of this.lodMeshes) material.uniforms.uTime.value += step;

    let pushPosition = null;
    if (typeof this.pushTarget === 'function') pushPosition = this.pushTarget(pushScratch);
    else if (this.pushTarget?.isObject3D) pushPosition = this.pushTarget.getWorldPosition(pushScratch);
    else if (Number.isFinite(this.pushTarget?.x)) pushPosition = this.pushTarget;
    for (const { material } of this.lodMeshes) {
      if (pushPosition) {
        material.uniforms.uPushPosition.value.set(
          pushPosition.x,
          pushPosition.y ?? 0,
          pushPosition.z ?? 0,
        );
      } else {
        material.uniforms.uPushPosition.value.set(0, -1e5, 0);
      }
    }

    if (camera) this._camera = camera;
    this._lodTimer += step;
    if (this._camera && this._lodTimer >= this._lodUpdateInterval) {
      this._lodTimer = 0;
      this._assignLods(this._camera);
    }
    return this;
  }

  dispose() {
    for (const mesh of this.lodMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.clear();
  }
}

/**
 * Paintable clump field for an authored SM/MI/LOD pack.
 *
 * Unlike StylizedGrassClumpField's procedural fallback, this path retains the
 * complete artist-authored static-mesh vertices, UV ramps, vertex WPO masks,
 * and material graph. One placement is still one paint record, while camera
 * distance moves the record between the supplied LOD meshes.
 */
export class RetainedGrassClumpField extends THREE.Group {
  constructor({
    chunkSize = DEFAULT_GRASS_CHUNK_SIZE,
    cullPadding = DEFAULT_GRASS_CULL_PADDING,
    frustumCulling = true,
    geometryLods = [],
    lodDistances = null,
    lodUpdateInterval = 0.35,
    maxVisibleChunks = Infinity,
    maxVisibleInstances = Infinity,
    materials = [],
    ownsMaterials = false,
    placements = [],
    styleTarget = {},
  } = {}) {
    super();
    if (!geometryLods.length || !geometryLods[0]?.isBufferGeometry) {
      throw new Error('RetainedGrassClumpField requires at least one authored BufferGeometry LOD.');
    }
    const materialList = Array.isArray(materials) ? materials : [materials];
    if (!materialList[0]?.isMaterial) {
      throw new Error('RetainedGrassClumpField requires an authored material instance.');
    }
    this.name = 'RetainedGrassClumpField';
    this.placements = placements.map((placement) => ({ ...placement }));
    this._camera = null;
    this._lodTimer = 0;
    this._lodUpdateInterval = finiteNumber(lodUpdateInterval, 0.35, { min: 0.05 });
    this._ownsMaterials = Boolean(ownsMaterials);
    this.lodProfiles = GRASS_CLUMP_LODS.map((profile, index) => Object.freeze({
      ...profile,
      distance: Array.isArray(lodDistances) && Number.isFinite(Number(lodDistances[index]))
        ? Number(lodDistances[index])
        : profile.distance,
    }));
    const capacity = Math.max(this.placements.length, 1);
    let retainedCullRadius = 0.01;
    this.lodMeshes = this.lodProfiles.map((profile, index) => {
      const sourceGeometry = geometryLods[index] ?? geometryLods.at(-1);
      const geometry = sourceGeometry.clone();
      const triangleCount = Math.floor(
        (geometry.index?.count ?? geometry.getAttribute('position').count) / 3,
      );
      geometry.userData.grassClump = {
        bladeCount: Number(sourceGeometry.userData.grassClump?.bladeCount) || 22,
        lod: profile.level,
        role: 'authored-static-mesh-equivalent',
        triangleCount,
      };
      const material = materialList[index] ?? materialList.at(-1);
      markFactoryStyleMaterial(material, 'GrassBlade', {
        managed: material.userData?.toonlabManagedMaterial === true,
      });
      geometry.computeBoundingSphere();
      retainedCullRadius = Math.max(retainedCullRadius, geometry.boundingSphere?.radius ?? 0);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `RetainedGrassClumpField:LOD${profile.level}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.count = 0;
      mesh.userData.grassClumpLod = profile.level;
      mesh.userData.waterExclude = true;
      this.add(mesh);
      return mesh;
    });
    attachFactoryStyleTarget(this, 'vegetation.grass', {
      targetId: 'toonlab/grass-clumps',
      ...styleTarget,
      materials: {
        assignments: { GrassBlade: { roles: ['grassBlade'] } },
        ...(styleTarget.materials ?? {}),
      },
    });
    prepareGrassCulling(this, {
      chunkSize,
      cullPadding,
      frustumCulling,
      maxVisibleChunks,
      maxVisibleInstances,
    }, retainedCullRadius);
    this.updateLods(null);
  }

  get instanceCount() {
    return this.placements.length;
  }

  get bladeCount() {
    return this.bladeBudget().drawn;
  }

  get cullingStats() {
    return { ...this._cullingStats };
  }

  get qualityBudget() {
    return grassQualityBudget(this);
  }

  bladeBudget() {
    const perLod = this.lodMeshes.map((mesh, level) => {
      const instances = mesh.count;
      const bladesPerInstance = mesh.geometry.userData.grassClump.bladeCount;
      return {
        bladesPerInstance,
        drawn: instances * bladesPerInstance,
        instances,
        level,
      };
    });
    const authoredBladesPerInstance = perLod[0]?.bladesPerInstance ?? 0;
    return {
      authored: this.placements.length * authoredBladesPerInstance,
      drawn: perLod.reduce((sum, lod) => sum + lod.drawn, 0),
      instances: this.placements.length,
      perLod,
    };
  }

  _writeLevel(level, placements) {
    const mesh = this.lodMeshes[level];
    for (let index = 0; index < placements.length; index += 1) {
      mesh.setMatrixAt(index, matrixFromPlacement(placements[index], matrixScratch));
    }
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }

  _assignLods(camera) {
    const buckets = this.lodProfiles.map(() => []);
    assignVisibleLods(this, camera, buckets);
    buckets.forEach((bucket, level) => this._writeLevel(level, bucket));
  }

  updateLods(camera = this._camera) {
    if (camera) this._camera = camera;
    this._assignLods(this._camera);
    this._lodTimer = 0;
    return this;
  }

  setQualityBudget(options = {}) {
    return applyGrassQualityBudget(this, options);
  }

  update(delta = 0.016, camera = null) {
    if (camera) this._camera = camera;
    this._lodTimer += Math.min(Math.max(Number(delta) || 0, 0), 0.1);
    if (this._camera && this._lodTimer >= this._lodUpdateInterval) {
      this.updateLods(this._camera);
    }
    return this;
  }

  dispose() {
    const materials = new Set();
    for (const mesh of this.lodMeshes) {
      mesh.geometry.dispose();
      if (this._ownsMaterials) materials.add(mesh.material);
    }
    materials.forEach((material) => material.dispose());
    this.clear();
  }
}
