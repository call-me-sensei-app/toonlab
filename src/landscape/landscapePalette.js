// Landscape foliage palette — built-in procedural entries plus source
// resolution to PropAssets. The OSS lab is fully usable with these seeded
// StylizedTree/rockgen assets; the Pro lab adds `pro-creation` entries (the
// user's own generated GLBs) through the injectable resolver, which
// `propAssetFromObject` wraps into the same contract.

import * as THREE from 'three';

import { propAssetFromObject, createPropAssetFromRecipe } from '../propgen/propAsset.js';
import { createRockDocument, deserializeRockDocument, meshDocument } from '../rockgen/index.js';
import { createPlantFromRecipe } from '../vegetation/treeRecipe.js';
import { StylizedTree, TREE_TRUNK_STYLES } from '../vegetation/stylizedTree.js';

const TREE_RULES = Object.freeze({
  minSpacing: 2.5,
  scaleRange: [0.8, 1.3],
  yawRandom: true,
  alignToSlope: 0.12,
  maxSlope: 0.55,
  minHeight: null,
  maxHeight: null,
  avoidWater: true,
});

const ROCK_RULES = Object.freeze({
  minSpacing: 1.2,
  scaleRange: [0.55, 1.6],
  yawRandom: true,
  alignToSlope: 0.45,
  maxSlope: 1.4,
  minHeight: null,
  maxHeight: null,
  avoidWater: false,
});

const GRASS_RULES = Object.freeze({
  minSpacing: 0.45,
  scaleRange: [0.9, 1.1],
  yawRandom: true,
  alignToSlope: 0,
  maxSlope: 0.9,
  minHeight: null,
  maxHeight: null,
  avoidWater: true,
});

/** Default OSS palette: grass, two seeded tree looks, two rockgen boulders. */
export const BUILTIN_FOLIAGE_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'builtin-grass',
    label: 'Meadow Grass',
    // Grass sources carry a grass-preset document (null = default settings);
    // the engine gives them a GrassFoliageLayer instead of mesh instancing.
    source: Object.freeze({ kind: 'grass-preset', document: null }),
    rules: GRASS_RULES,
    density: 1.6,
    active: false,
  }),
  Object.freeze({
    id: 'builtin-tree-green',
    label: 'Leafy Tree',
    source: Object.freeze({ kind: 'builtin', builtinId: 'tree-green' }),
    rules: TREE_RULES,
    density: 0.07,
    active: true,
  }),
  Object.freeze({
    id: 'builtin-tree-autumn',
    label: 'Autumn Tree',
    source: Object.freeze({ kind: 'builtin', builtinId: 'tree-autumn' }),
    rules: TREE_RULES,
    density: 0.07,
    active: false,
  }),
  Object.freeze({
    id: 'builtin-rock-granite',
    label: 'Granite Boulder',
    source: Object.freeze({ kind: 'builtin', builtinId: 'rock-granite' }),
    rules: ROCK_RULES,
    density: 0.045,
    active: false,
  }),
  Object.freeze({
    id: 'builtin-rock-mossy',
    label: 'Mossy Boulder',
    source: Object.freeze({ kind: 'builtin', builtinId: 'rock-mossy' }),
    rules: ROCK_RULES,
    density: 0.045,
    active: false,
  }),
]);

function treeAsset(name, options) {
  return {
    type: name,
    build(seed) {
      const tree = new StylizedTree({ ...options, seed: (seed % 997) + 1 });
      return {
        anchor: 0,
        footprint: { radius: 0.45 },
        lod: null,
        object3D: tree,
      };
    },
  };
}

let sharedRockMaterial = null;
function rockAsset(name, preset) {
  return {
    type: name,
    build(seed) {
      const geometry = meshDocument(createRockDocument({ preset, seed: (seed % 9973) + 1 }));
      geometry.computeBoundingBox();
      sharedRockMaterial ??= new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true });
      const mesh = new THREE.Mesh(geometry, sharedRockMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const box = geometry.boundingBox;
      const height = box.max.y - box.min.y;
      return {
        // Settle boulders slightly into the ground instead of perching them.
        anchor: -box.min.y - height * 0.12,
        footprint: { radius: Math.max((box.max.x - box.min.x), (box.max.z - box.min.z)) * 0.35 },
        lod: null,
        object3D: mesh,
      };
    },
  };
}

const BUILTIN_ASSETS = {
  'tree-green': () => treeAsset('tree-green', {
    size: 1.9,
    canopyColor: [0x4da258, 0x5eb063, 0x58ab5c],
    leafDensity: 0.95,
    trunk: TREE_TRUNK_STYLES.curved,
  }),
  'tree-autumn': () => treeAsset('tree-autumn', {
    size: 2.0,
    canopyColor: { from: 0xe8a33c, to: 0xd96f29 },
    leafDensity: 0.9,
    trunk: TREE_TRUNK_STYLES.leaning,
  }),
  'rock-granite': () => rockAsset('rock-granite', 'granite-boulder'),
  'rock-mossy': () => rockAsset('rock-mossy', 'mossy-boulder'),
};

const externalResolvers = new Map();

/**
 * Registers a resolver for a non-builtin source kind (Pro registers
 * `pro-creation` here). `resolver(source, entry)` returns a PropAsset or a
 * Promise of one.
 */
export function registerFoliageSourceResolver(kind, resolver) {
  externalResolvers.set(kind, resolver);
}

/**
 * Resolves a palette entry's source to a PropAsset. Synchronous kinds
 * (builtin, prop-recipe, object) return the asset directly; external
 * resolvers may return a Promise.
 */
export function resolveFoliageAsset(entry) {
  const source = entry?.source;
  if (!source?.kind) throw new Error('Palette entry has no source.');
  if (source.kind === 'builtin') {
    const factory = BUILTIN_ASSETS[source.builtinId];
    if (!factory) throw new Error(`Unknown built-in foliage asset "${source.builtinId}".`);
    return factory();
  }
  if (source.kind === 'prop-recipe') {
    return createPropAssetFromRecipe(source.recipe);
  }
  // Tree Lab recipes (saved presets, library/gallery tree-recipe creations):
  // each build re-grows the recipe at a varied seed.
  if (source.kind === 'tree-recipe') {
    const recipe = source.recipe;
    return {
      type: recipe?.options?.name ?? 'tree-recipe',
      build(seed) {
        const options = { ...(recipe?.options ?? {}), seed: (seed % 9973) + 1 };
        const plant = createPlantFromRecipe({ ...recipe, options });
        plant.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        return { anchor: 0, footprint: { radius: 0.45 }, lod: null, object3D: plant };
      },
    };
  }
  // Rock Lab documents (saved projects, rock-project creations): one shape,
  // meshed once and instanced.
  if (source.kind === 'rock-document') {
    const document = typeof source.document === 'string'
      ? deserializeRockDocument(source.document)
      : source.document;
    if (!document) throw new Error('The rock document could not be read.');
    const geometry = meshDocument(document);
    geometry.computeBoundingBox();
    sharedRockMaterial ??= new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true });
    const box = geometry.boundingBox;
    return propAssetFromObject(new THREE.Mesh(geometry, sharedRockMaterial), {
      anchor: -box.min.y,
      name: source.label ?? 'rock',
    });
  }
  if (source.kind === 'object') {
    return propAssetFromObject(source.object3D, source.options ?? {});
  }
  const resolver = externalResolvers.get(source.kind);
  if (!resolver) throw new Error(`No resolver registered for foliage source kind "${source.kind}".`);
  return resolver(source, entry);
}
