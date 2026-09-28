// The PropAsset contract — the ONE shape every placeable thing reduces to,
// procedural or imported. This is the strategic seam of the library: the
// placement pipeline (propPlacement.js), buildings, villages, the catalog,
// and the pro asset faucet all traffic exclusively in PropAssets.
//
//   asset.build(seed?) → {
//     object3D,   // origin at ground contact, +y up
//     footprint,  // { radius } | { circles: [{x, z, radius}] } — feeds
//                 //   world.collision.addCircles verbatim (local frame)
//     anchor,     // ground-contact offset: final y = heightAt(x, z) + anchor
//     lod,        // optional { far: object3D, distance }
//   }
//
// Linear assets (fences, walls) additionally implement
// `buildAlong(points3D)` — they are generated continuously along a line,
// not instanced — and placeAlongSpline dispatches on that automatically.

import * as THREE from 'three';

import { getDebrisDetailTexture } from '../debrisgen/debrisTextures.js';
import { createPropRandom } from './propParts.js';
import {
  PROP_TYPES,
  createPropSettings,
  validatePropRecipeDocument,
} from './propSettings.js';
import {
  generateFenceAlong,
  generateLantern,
  generateMilestone,
  generateSignpost,
  generateStoneStairs,
} from './generatorsWave1.js';
import {
  generateBench,
  generateCrateStack,
  generateFirewood,
  generatePier,
  generateStoneWallAlong,
  generateTorii,
  generateWell,
} from './generatorsWave2.js';

const POINT_GENERATORS = {
  bench: generateBench,
  crateStack: generateCrateStack,
  firewood: generateFirewood,
  lantern: generateLantern,
  milestone: generateMilestone,
  pier: generatePier,
  signpost: generateSignpost,
  stoneStairs: generateStoneStairs,
  torii: generateTorii,
  well: generateWell,
};

const LINEAR_GENERATORS = {
  fence: generateFenceAlong,
  stoneWall: generateStoneWallAlong,
};

// Which procedural detail map suits each type (multiplies vertex colors,
// same texture cache debrisgen uses — no new texture systems).
const TEXTURE_FAMILY = {
  bench: { kind: 'wood', style: 'grain' },
  crateStack: { kind: 'wood', style: 'grain' },
  fence: { kind: 'wood', style: 'grain' },
  firewood: { kind: 'wood', style: 'bark' },
  lantern: { kind: 'stone', style: 'speckle' },
  milestone: { kind: 'stone', style: 'speckle' },
  pier: { kind: 'wood', style: 'grain' },
  signpost: { kind: 'wood', style: 'grain' },
  stoneStairs: { kind: 'stone', style: 'speckle' },
  stoneWall: { kind: 'stone', style: 'speckle' },
  torii: { kind: 'wood', style: 'grain' },
  well: { kind: 'stone', style: 'speckle' },
};

// LOD swap distance per type: bigger silhouettes hold detail longer.
const LOD_DISTANCE = {
  bench: 40,
  crateStack: 50,
  fence: 70,
  firewood: 45,
  lantern: 55,
  milestone: 45,
  pier: 90,
  signpost: 50,
  stoneStairs: 60,
  stoneWall: 70,
  torii: 120,
  well: 80,
};

function createPropMaterials(settings) {
  const family = TEXTURE_FAMILY[settings.asset.type] ?? { kind: 'stone', style: 'speckle' };
  const main = new THREE.MeshStandardMaterial({
    map: getDebrisDetailTexture(family.kind, settings.asset.seed, family.style, 1),
    metalness: 0,
    roughness: settings.surface.roughness,
    vertexColors: true,
  });
  main.name = `Prop ${settings.asset.type}`;
  main.userData.envRole = 'standard';

  // Warm unlit lamp bodies: emissive carries the glow through the toon
  // conversion and into GLB exports.
  const glow = new THREE.MeshStandardMaterial({
    emissive: new THREE.Color(1, 0.72, 0.32),
    emissiveIntensity: 0.85,
    metalness: 0,
    roughness: 0.6,
    vertexColors: true,
  });
  glow.name = `Prop ${settings.asset.type} glow`;
  glow.userData.envRole = 'emissive';
  return { glow, main };
}

function assembleGroup(settings, result, materials, detail) {
  const group = new THREE.Group();
  group.name = `Prop ${settings.asset.type} ${settings.asset.variant}${detail === 'lo' ? ' (lo)' : ''}`;
  if (result.main) {
    const mesh = new THREE.Mesh(result.main, materials.main);
    mesh.name = 'PropBody';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (result.glow) {
    const mesh = new THREE.Mesh(result.glow, materials.glow);
    mesh.name = 'PropGlow';
    mesh.castShadow = false; // lamp cores are light sources, not occluders
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  if (settings.asset.scale !== 1) group.scale.setScalar(settings.asset.scale);
  return group;
}

function scaleFootprint(footprint, scale) {
  if (!footprint || scale === 1) return footprint;
  if (footprint.circles) {
    return {
      circles: footprint.circles.map((circle) => ({
        radius: circle.radius * scale,
        x: circle.x * scale,
        z: circle.z * scale,
      })),
    };
  }
  return { radius: (footprint.radius ?? 0.3) * scale };
}

/**
 * Builds one prop object (no asset wrapper) — the direct construction path
 * labs and quick scripts use. Returns `{ object3D, footprint, anchor, stats }`.
 */
export function buildProp(settingsInput = {}, { detail = 'hi' } = {}) {
  const settings = createPropSettings(settingsInput);
  const type = settings.asset.type;
  const generator = POINT_GENERATORS[type];
  if (!generator) {
    throw new Error(`Prop type "${type}" is linear — use buildPropAlong / placeAlongSpline.`);
  }
  const random = createPropRandom(settings.asset.seed);
  const result = generator(settings, random, detail);
  const materials = createPropMaterials(settings);
  const object3D = assembleGroup(settings, result, materials, detail);
  object3D.userData.propRecipe = settings;
  let triangles = 0;
  object3D.traverse((object) => {
    if (object.isMesh && object.geometry.index) triangles += object.geometry.index.count / 3;
  });
  return {
    anchor: 0,
    footprint: scaleFootprint(result.footprint, settings.asset.scale),
    object3D,
    stats: { triangles: Math.round(triangles) },
  };
}

/**
 * Builds a linear prop run along resolved world-space points
 * `[{x, y, z}, …]`. Returns `{ object3D, footprints }` — footprints are
 * world-frame circles ready for `collision.addCircles`.
 */
export function buildPropAlong(settingsInput, points, { detail = 'hi' } = {}) {
  const settings = createPropSettings(settingsInput);
  const type = settings.asset.type;
  const generator = LINEAR_GENERATORS[type];
  if (!generator) {
    throw new Error(`Prop type "${type}" is not linear — use buildProp / placeProps.`);
  }
  const random = createPropRandom(settings.asset.seed);
  const result = generator(settings, random, points, detail);
  const materials = createPropMaterials(settings);
  const object3D = assembleGroup(settings, result, materials, detail);
  object3D.userData.propRecipe = settings;
  return { footprints: result.footprints, object3D };
}

/**
 * Wraps generator settings into the PropAsset contract. `build(seed)`
 * overrides only the seed (variants of one design); pass full settings to
 * `createPropAsset` for anything more.
 */
export function createPropAsset(settingsInput = {}) {
  const settings = createPropSettings(settingsInput);
  const type = settings.asset.type;
  const linear = Boolean(PROP_TYPES[type]?.linear);
  const asset = {
    linear,
    settings,
    type,
    variant: settings.asset.variant,
  };
  if (linear) {
    asset.buildAlong = (points, options = {}) => buildPropAlong(
      { ...settings, asset: { ...settings.asset, seed: options.seed ?? settings.asset.seed } },
      points,
      options,
    );
    // Linear assets still expose a build() so thumbnails/labs can preview a
    // short straight run without a spline.
    asset.build = (seed = settings.asset.seed) => {
      const points = [0, 1, 2].map((index) => ({ x: (index - 1) * 2.2, y: 0, z: 0 }));
      const { object3D, footprints } = buildPropAlong(
        { ...settings, asset: { ...settings.asset, seed } },
        points,
      );
      return { anchor: 0, footprint: { circles: footprints }, object3D };
    };
    return asset;
  }
  asset.build = (seed = settings.asset.seed) => {
    const buildSettings = { ...settings, asset: { ...settings.asset, seed } };
    const hi = buildProp(buildSettings, { detail: 'hi' });
    const lo = buildProp(buildSettings, { detail: 'lo' });
    return {
      anchor: hi.anchor,
      footprint: hi.footprint,
      lod: { distance: LOD_DISTANCE[type] ?? 55, far: lo.object3D },
      object3D: hi.object3D,
      stats: hi.stats,
    };
  };
  return asset;
}

/**
 * The OSS↔pro seam: wraps ANY Object3D (imported GLB, pro-generated, hand
 * modeling) into the PropAsset contract so every pipeline downstream —
 * scatter, spline placement, collision, catalog — takes it with zero extra
 * work. Footprint and anchor are measured from the bounding box when not
 * given.
 */
export function propAssetFromObject(object3D, {
  footprint = null,
  anchor = null,
  lod = null,
  name = null,
} = {}) {
  if (!object3D?.isObject3D) throw new Error('propAssetFromObject needs an Object3D.');
  const box = new THREE.Box3().setFromObject(object3D);
  const measuredAnchor = Number.isFinite(anchor) ? anchor : (box.isEmpty() ? 0 : -box.min.y);
  let resolvedFootprint = footprint;
  if (!resolvedFootprint) {
    const sizeX = box.isEmpty() ? 0.6 : box.max.x - box.min.x;
    const sizeZ = box.isEmpty() ? 0.6 : box.max.z - box.min.z;
    resolvedFootprint = { radius: Math.max(Math.hypot(sizeX, sizeZ) * 0.32, 0.2) };
  }
  return {
    build(/* seed ignored: imported meshes have one shape */) {
      const clone = object3D.clone(true);
      clone.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return {
        anchor: measuredAnchor,
        footprint: resolvedFootprint,
        lod: lod ?? null,
        object3D: clone,
      };
    },
    imported: true,
    linear: false,
    type: name ?? object3D.name ?? 'imported',
    variant: 'imported',
  };
}

/** Deterministic rebuild from a recipe document (throws on invalid input). */
export function createPropFromRecipe(recipe, options = {}) {
  const { ok, errors } = validatePropRecipeDocument(recipe);
  if (!ok) throw new Error(`Invalid prop recipe: ${errors.join(' ')}`);
  const type = recipe.settings.asset.type;
  if (PROP_TYPES[type]?.linear) return createPropAsset(recipe.settings).build();
  return buildProp(recipe.settings, options);
}

/** Recipe → PropAsset (what `catalog.spawn` returns for prop entries). */
export function createPropAssetFromRecipe(recipe) {
  const { ok, errors } = validatePropRecipeDocument(recipe);
  if (!ok) throw new Error(`Invalid prop recipe: ${errors.join(' ')}`);
  return createPropAsset(recipe.settings);
}

export function disposeProp(root) {
  const materials = new Set();
  root?.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) materials.add(material);
    }
  });
  // Detail textures are cache-owned (shared across props) — never disposed here.
  for (const material of materials) material.dispose?.();
}
