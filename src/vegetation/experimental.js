// Repository-only aggregation for Tree Lab and research fixtures.
//
// Never import this module from a consumer app. The public npm surface is
// `./index.js`, whose supported generated tree is BranchTree. Keeping this
// barrel separate lets repository labs continue taxonomy/species research
// without accidentally turning every experiment into a package promise.
export * from './index.js';
export * from './plantGraph.js';
export * from './proceduralSpeciesTree.js';
export * from './recursiveWoodyGrowth.js';
export * from './recursiveWoodyMesh.js';
export * from './treeArchitectureProfiles.js';
export * from './treeExport.js';
export * from './treeLodCompiler.js';
export * from './treeRecipe.js';
export * from './treeRecipePresets.js';
export * from './stylizedTreeExamples.js';
export * from './treeSpeciesProfiles.js';
export * from './treeSpeciesRoster.js';
export * from './treeSurfaceTextures.js';
export * from './woodyBaselineControls.js';
