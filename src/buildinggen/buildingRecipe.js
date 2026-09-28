// Building recipe layer — mirrors treeRecipe.js: settings ⇄ recipe
// (`{ schema: 'buildingRecipe', version, type, options }`) ⇄ deterministic
// rebuild. Building settings are already flat panel groups, so the mapping
// is direct; the recipe's `options` are the grouped settings plus seed.

import * as THREE from 'three';

import { getDebrisDetailTexture } from '../debrisgen/debrisTextures.js';
import {
  BUILDING_TYPES,
  cloneBuildingSettings,
  createBuildingSettings,
} from './buildingSettings.js';
import { resolveBuildingPlan } from './buildingGrammar.js';
import { meshBuildingPlan } from './buildingMesh.js';

export const BUILDING_RECIPE_SCHEMA = 'buildingRecipe';
export const BUILDING_RECIPE_VERSION = 1;

export function buildingRecipeFromSettings(settings) {
  const normalized = createBuildingSettings(settings);
  const { type, seed, ...groups } = normalized;
  return {
    options: { seed, ...groups },
    schema: BUILDING_RECIPE_SCHEMA,
    type,
    version: BUILDING_RECIPE_VERSION,
  };
}

export function buildingSettingsFromRecipe(recipe) {
  return createBuildingSettings({ ...recipe?.options, type: recipe?.type });
}

export function validateBuildingRecipeDocument(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Recipe document must be an object.'], ok: false };
  }
  if (input.schema !== BUILDING_RECIPE_SCHEMA) errors.push(`schema must be "${BUILDING_RECIPE_SCHEMA}".`);
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > BUILDING_RECIPE_VERSION) {
    errors.push(`version must be an integer between 1 and ${BUILDING_RECIPE_VERSION}.`);
  }
  if (!BUILDING_TYPES[input.type]) {
    errors.push(`type must be one of ${Object.keys(BUILDING_TYPES).join(', ')}.`);
  }
  if (!input.options || typeof input.options !== 'object' || Array.isArray(input.options)) {
    errors.push('options must be an object.');
  }
  return { errors, ok: errors.length === 0 };
}

// Role materials are shared per (roughness bucket) — every building in a
// scene reuses the same five materials, so a whole village adds ~5 programs.
const materialCache = new Map();
function roleMaterial(role) {
  let material = materialCache.get(role);
  if (material) return material;
  const family = role === 'roof' || role === 'trim'
    ? { kind: 'stone', style: 'speckle' }
    : { kind: 'wood', style: 'grain' };
  material = new THREE.MeshStandardMaterial({
    map: getDebrisDetailTexture(family.kind, 7, family.style, 1),
    metalness: 0,
    roughness: role === 'roof' ? 0.85 : 0.92,
    vertexColors: true,
  });
  material.name = `Building ${role}`;
  material.userData.envRole = 'standard';
  materialCache.set(role, material);
  return material;
}

/**
 * Deterministic rebuild: recipe (or bare settings) → `{ object3D, plan,
 * stats }`. Same recipe → identical building, forever.
 */
export function createBuildingFromRecipe(recipeOrSettings, { detail = 'hi' } = {}) {
  const settings = recipeOrSettings?.schema === BUILDING_RECIPE_SCHEMA
    ? buildingSettingsFromRecipe(recipeOrSettings)
    : createBuildingSettings(recipeOrSettings ?? {});
  const plan = resolveBuildingPlan(settings);
  const { geometries, stats } = meshBuildingPlan(plan, { detail });
  const root = new THREE.Group();
  root.name = `Building ${settings.type} ${settings.seed}${detail === 'lo' ? ' (lo)' : ''}`;
  for (const [role, geometry] of Object.entries(geometries)) {
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, roleMaterial(role));
    mesh.name = `Building-${role}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.userData.buildingRecipe = buildingRecipeFromSettings(settings);
  return { object3D: root, plan, settings, stats };
}

export function cloneDefaultBuildingSettings() {
  return cloneBuildingSettings();
}
