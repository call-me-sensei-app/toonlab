// Landscape system barrel — the editable heightfield/splat/foliage runtime
// behind Landscape Lab. Everything grounds on `field.heightAt(x, z)`, the
// same contract the rest of the runtime (scatter, collision, walk previews,
// ground-field pass) already consumes.

export {
  createLandscapeField,
  mergeDirtyRects,
  tilesForDirtyRect,
} from './landscapeField.js';
export {
  applyBrushSample,
  applyCommand,
  applyHoleCommand,
  applyHoleSample,
  applyRamp,
  applySplatCommand,
  applySplatSample,
  applyWaterCommand,
  applyWaterSample,
  beginHoleStroke,
  beginSplatStroke,
  beginStroke,
  beginWaterStroke,
  brushDistance,
  brushFalloff,
  commitHoleStroke,
  commitSplatStroke,
  commitStroke,
  commitWaterStroke,
  revertCommand,
  revertHoleCommand,
  revertSplatCommand,
  revertWaterCommand,
} from './landscapeBrushes.js';
export {
  buildAllTileGeometries,
  buildTileGeometry,
  buildTileHoleSkirt,
  buildTileIndices,
  rebuildTileIndicesForRect,
  tileGridRange,
  updateTileGeometry,
} from './landscapeTileGeometry.js';
export { createLandscapeMaterial } from './landscapeMaterial.js';
export {
  createDefaultMaterialLayers,
  LANDSCAPE_TEXGEN_PRESET_OPTIONS,
  registerLayerTextureResolver,
  resolveLayerTexture,
  sanitizeMaterialLayers,
  texgenOptionsForSurface,
} from './landscapeLayerTextures.js';
export {
  LandscapeFoliageLayer,
  planFoliagePaint,
} from './landscapeFoliage.js';
export { GrassFoliageLayer } from './landscapeGrass.js';
export {
  BUILTIN_FOLIAGE_ENTRIES,
  registerFoliageSourceResolver,
  resolveFoliageAsset,
} from './landscapePalette.js';
export {
  createLandscapeSettings,
  sanitizeLandscapeSettings,
  resolveLandscapeLayers,
  DEFAULT_LANDSCAPE_SETTINGS,
  LANDSCAPE_LAYER_DEFAULTS,
  LANDSCAPE_SETTING_GROUPS,
  LANDSCAPE_SETTING_FIELD_SCHEMA,
  LANDSCAPE_SETTING_FIELD_SCHEMA_BY_GROUP,
} from './landscapeSettings.js';
export {
  createLandscapeProjectDocument,
  parseLandscapeProjectDocument,
  serializeLandscapeProject,
  FOLIAGE_INSTANCE_STRIDE,
  FOLIAGE_INSTANCE_STRIDE_V2,
  LANDSCAPE_PROJECT_DOCUMENT_TYPE,
  LANDSCAPE_PROJECT_SCHEMA_VERSION,
} from './landscapeDocument.js';
export { seedFieldFromArchetype } from './landscapeSeed.js';
export { resizeLandscapeField } from './landscapeResize.js';
export {
  generateTerrainRegion,
  GENERATE_FEATURES,
  GENERATE_TERRAIN_TYPES,
} from './landscapeGenerate.js';
export {
  buildTunnelGeometries,
  buildTunnelPath,
  createTunnel,
  deserializeTunnel,
  normalizeTunnelProfile,
  planTunnelBore,
  serializeTunnel,
  tunnelProfilePreset,
} from './landscapeTunnel.js';
export {
  createLandscapeMaterialPresetDocument,
  LANDSCAPE_MATERIAL_PRESET_DOCUMENT_TYPE,
  LANDSCAPE_MATERIAL_PRESET_SCHEMA_VERSION,
  LANDSCAPE_MATERIAL_SETTING_KEYS,
  parseLandscapeMaterialPresetDocument,
  serializeLandscapeMaterialPreset,
} from './landscapeMaterialPreset.js';
