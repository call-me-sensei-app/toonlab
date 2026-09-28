import * as THREE from 'three';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';

import {
  createCanopyBlobs,
  createTreeFoliageGeometry,
  createTreeFoliageMaterials,
  setCanopyCloudShadow,
  setCanopySceneShadow,
  setCanopySun,
  setCanopyWind,
  tickCanopyTime,
} from './stylizedTreeFoliage.js';
import {
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  serializableTreeOptions,
} from './stylizedTree.js';

// Trunkless plant: the tree's leaf-card canopy resting on the ground —
// bushes, shrubs, hedges. Same deterministic seeding and the same runtime
// API as StylizedTree (setSun/setWind/update/...), so scenes and the tree
// designer treat plants polymorphically:
//
//   const bush = new StylizedBush({ size: 0.8, seed: 4, canopyColor: 0x4da258 });
//   scene.add(bush);
//   bush.update(delta);
//
//   width / depth — X / Z reach multipliers (hedges: width up, depth down)
//   flatten       — vertical squash; low values give low, spreading shrubs
//   canopyLayout  — extra createCanopyBlobs overrides (lobeCount, spread, ...)
//   canopy        — createTreeFoliageGeometry options (cardCount, ...)
//   foliage       — createTreeFoliageMaterials options (cutoff, wind, sun, ...)
export class StylizedBush extends THREE.Group {
  constructor(options = {}) {
    super();
    const {
      size = 1,
      seed = 1,
      canopyColor = 0x4da258,
      canopyPalette = {},
      width = 1.3,
      depth = 1.1,
      flatten = 0.35,
      leafDensity = 1,
      canopy = {},
      canopyLayout = {},
      foliage = {},
      styleTarget = {},
      vegetationShader = null,
    } = options;
    this.name = 'StylizedBush';
    // Kept for toJSON(); not cloned (see StylizedTree.config).
    this.config = options;

    // Squat layout: smaller core and tighter lobes than a tree crown, so a
    // size-1 bush reads hip-high rather than like a floating tree top.
    const coreRadius = canopyLayout.coreRadius ?? 0.7;
    const blobs = canopy.blobs ?? createCanopyBlobs({
      seed,
      width,
      depth,
      flatten,
      spread: 1.0,
      coreRadius,
      lobeRadiusRange: [0.35, 0.6],
      ...canopyLayout,
    });
    const geometry = createTreeFoliageGeometry({
      seed: seed * 7.31 + 1.7,
      leafDensity,
      attachments: null,
      coverageScale: size,
      cardSizeRange: [0.7, 1.1],
      ...canopy,
      blobs,
    });
    const materials = createTreeFoliageMaterials({
      color: canopyColor,
      palette: canopyPalette,
      seed,
      vegetationShader,
      ...foliage,
    });

    this.canopyMesh = new THREE.Mesh(geometry, materials.material);
    this.canopyMesh.customDepthMaterial = materials.depthMaterial;
    this.canopyMesh.castShadow = true;
    this.canopyMesh.receiveShadow = true;
    this.canopyMesh.frustumCulled = false;
    // Keep the loaded-scene material adapter from replacing the leaf shader.
    this.canopyMesh.userData.environmentShaderExclude = true;
    markFactoryStyleMaterial(this.canopyMesh.material, 'BushFoliage');
    // Rest the mass on the ground instead of centering it on the origin.
    this.canopyMesh.position.y = coreRadius * 0.85;

    this.add(this.canopyMesh);
    attachFactoryStyleTarget(this, 'vegetation.tree', {
      targetId: 'toonlab/bush',
      ...styleTarget,
      materials: {
        assignments: { BushFoliage: { roles: ['foliageCard'] } },
        ...(styleTarget.materials ?? {}),
      },
    });
    this.scale.setScalar(size);
  }

  setSun(options) {
    setCanopySun(this.canopyMesh.material.uniforms, options ?? {});
    return this;
  }

  setWind(options) {
    setCanopyWind(this.canopyMesh.material.uniforms, options);
    return this;
  }

  setSceneShadow(options) {
    setCanopySceneShadow(this.canopyMesh.material.uniforms, options);
    return this;
  }

  setCloudShadow(options) {
    setCanopyCloudShadow(this.canopyMesh.material.uniforms, options);
    return this;
  }

  update(delta) {
    tickCanopyTime(this.canopyMesh.material.uniforms, delta);
    return this;
  }

  // Recipe document that rebuilds this exact bush (see StylizedTree.toJSON).
  toJSON() {
    return {
      schema: TREE_RECIPE_SCHEMA,
      version: TREE_RECIPE_VERSION,
      type: 'bush',
      options: serializableTreeOptions(this.config),
    };
  }

  dispose() {
    this.canopyMesh.geometry.dispose();
    this.canopyMesh.material.dispose();
    this.canopyMesh.customDepthMaterial?.dispose();
  }
}
