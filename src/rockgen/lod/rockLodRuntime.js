import * as THREE from 'three';

import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../../styles/styleMetadata.js';
import { planRockLodMeshes } from './rockLodPlanner.js';

export const DEFAULT_ROCK_LOD_DISTANCES = Object.freeze([0, 45, 120]);

export function normalizeRockLodDistances(value = DEFAULT_ROCK_LOD_DISTANCES) {
  const source = Array.isArray(value) && value.length === 3
    ? value
    : DEFAULT_ROCK_LOD_DISTANCES;
  const distances = source.map((entry, index) => {
    const number = Number(entry);
    return Number.isFinite(number) ? Math.max(number, index === 0 ? 0 : 0.001) : DEFAULT_ROCK_LOD_DISTANCES[index];
  });
  distances[0] = 0;
  for (let index = 1; index < distances.length; index += 1) {
    distances[index] = Math.max(distances[index], distances[index - 1] + 0.001);
  }
  return distances;
}

function defaultRockLodMaterial() {
  return new THREE.MeshStandardMaterial({
    metalness: 0,
    roughness: 0.95,
    vertexColors: true,
  });
}

/**
 * Builds a runtime-native THREE.LOD from legacy planned Surface Nets geometries.
 * THREE.LOD compares camera and object world positions with Vector3 distance,
 * so aerial/vertical cameras demote rocks correctly without a custom updater.
 *
 * `materialFactory({ document, geometry, level, plan })` may return a distinct
 * material per level. Without it, `material` is reused, or one shared
 * vertex-color material is created for the whole LOD object.
 */
export function createRockLodObject(document, {
  castShadow = true,
  distances: distanceOption = DEFAULT_ROCK_LOD_DISTANCES,
  hysteresis = 0,
  material = null,
  materialFactory = null,
  name = null,
  planOptions = {},
  receiveShadow = true,
  styleTarget = {},
} = {}) {
  if (materialFactory !== null && typeof materialFactory !== 'function') {
    throw new TypeError('materialFactory must be a function when provided.');
  }
  const distances = normalizeRockLodDistances(distanceOption);
  const plan = planRockLodMeshes(document, {
    ...planOptions,
    keepGeometries: true,
  });
  const lod = new THREE.LOD();
  lod.autoUpdate = true;
  lod.name = String(name ?? document.name ?? 'Rock');
  const sharedMaterial = materialFactory ? null : material ?? defaultRockLodMaterial();
  const ownsSharedMaterial = !materialFactory && !material;

  for (const level of plan.levels) {
    const levelMaterial = materialFactory
      ? materialFactory({ document, geometry: level.geometry, level, plan })
      : sharedMaterial;
    if (!levelMaterial?.isMaterial && !Array.isArray(levelMaterial)) {
      throw new TypeError(`materialFactory did not return a Three.js material for LOD${level.level}.`);
    }
    for (const entry of Array.isArray(levelMaterial) ? levelMaterial : [levelMaterial]) {
      markFactoryStyleMaterial(entry, 'RockSurface', { managed: ownsSharedMaterial });
    }
    const mesh = new THREE.Mesh(level.geometry, levelMaterial);
    mesh.castShadow = Boolean(castShadow);
    mesh.receiveShadow = Boolean(receiveShadow);
    mesh.name = `${lod.name}_LOD${level.level}`;
    mesh.userData.rockLod = {
      level: level.level,
      resolution: level.resolution,
      triangleCount: level.triangleCount,
    };
    lod.addLevel(mesh, distances[level.level], Math.max(Number(hysteresis) || 0, 0));
  }

  const report = Object.freeze({
    distances: Object.freeze([...distances]),
    levels: Object.freeze(plan.levels.map((level) => Object.freeze({
      actualRatio: level.actualRatio,
      distance: distances[level.level],
      level: level.level,
      limitedByMinimum: level.limitedByMinimum,
      resolution: level.resolution,
      retainedTopology: level.retainedTopology,
      targetRatio: level.targetRatio,
      targetTriangles: level.targetTriangles,
      triangleBudget: level.triangleBudget,
      triangleCount: level.triangleCount,
    }))),
    role: plan.policy.role,
    validation: plan.validation,
  });
  lod.userData.rockLodReport = report;
  attachFactoryStyleTarget(lod, 'natural.rock', {
    collision: 'solid',
    targetId: 'toonlab/rock',
    ...styleTarget,
    materials: {
      assignments: { RockSurface: { roles: ['rock'] } },
      ...(styleTarget.materials ?? {}),
    },
  });

  return {
    lod,
    ownsSharedMaterial,
    plan,
    report,
  };
}
