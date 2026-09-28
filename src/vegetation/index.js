// Stylized vegetation barrel. Import from '@call-me-sensei/toonlab/vegetation'.
export * from './stylizedGrass.js';
export * from './grassClump.js';
export * from './callMeSenseiGrass.js';
export * from './stylizedFlowers.js';
export * from './flowerSpecies.js';
// Public tree construction/runtime surface. Authored tree recipes are assets
// and are discovered through ToonLab MCP; showcase/example recipe arrays are
// deliberately not re-exported from the npm package.
export {
  DEFAULT_STYLIZED_TREE_SETTINGS,
  STYLIZED_TREE_SETTING_FIELD_SCHEMA,
  STYLIZED_TREE_SETTING_GROUPS,
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  TREE_TRUNK_STYLES,
  StylizedTree,
  createBranchTubeGeometry,
  createBranchingTreeSkeleton,
  createStylizedTreeSettings,
  createTreeSkeleton,
  createTreeTrunkGeometry,
  getStylizedTreePresetOptions,
  polarProfileFromOutline,
  registerStylizedTreePreset,
  resolvePadPruning,
  serializableTreeOptions,
} from './stylizedTree.js';
export * from './branchTree.js';
export * from './stylizedTreeFoliage.js';
export * from './stylizedBush.js';
export * from './stylizedFlower.js';
export * from './treeExport.js';
export * from './compiledTree.js';
export * from './scatter.js';
export * from './stylizedForest.js';
export * from './stylizedUnderstory.js';
export * from './contactShadowField.js';
export * from './vegetationShaders.js';
export {
  TREE_SURFACE_PROFILES,
  TREE_SURFACE_PROFILE_ALIASES,
  TREE_SURFACE_PROFILE_DEFAULTS,
  createTreeSurfaceTexture,
  createTreeSurfaceTextureData,
  getTreeSurfaceProfileOptions,
  resolveTreeSurfaceProfileId,
} from './treeSurfaceTextures.js';
export * from './importedVegetationMaterial.js';
export * from './grassPalettes.js';
export * from '../shaders-tsl/grass.js';
export * from '../shaders-tsl/tree-leaf.js';
export * from '../shaders-tsl/flower.js';
export * from '../shaders-tsl/woody-surface.js';
