// Public API for the procedural texture generator cluster
// (@call-me-sensei/toonlab/texgen).

export {
  periodicBillow2,
  periodicCellular2,
  periodicFbm2,
  periodicPerlin2,
  periodicRidged2,
  periodicTurbulence2,
  periodicValue2,
  periodicWarp2,
} from './noise2.js';
export {
  compileTextureLayer,
  TEXTURE_GENERATOR_IDS,
  TEXTURE_GENERATORS,
} from './textureGenerators.js';
export {
  applyTextureSettingsPatch,
  cloneTextureSettings,
  createTextureRecipeDocument,
  createTextureSettings,
  DEFAULT_TEXTURE_SETTINGS,
  flattenTextureSettings,
  hexToRgb01,
  rgb01ToHex,
  TEXTURE_ACCENT_BLENDS,
  TEXTURE_DETAIL_BLENDS,
  TEXTURE_EMISSIVE_SOURCES,
  TEXTURE_RECIPE_KIND,
  TEXTURE_SETTING_FIELD_SCHEMA,
  TEXTURE_SETTING_GROUPS,
  validateTextureRecipeDocument,
} from './textureSettings.js';
export {
  DEFAULT_TEXTURE_IMAGE_PARAMS,
  evaluateTextureMaps,
  imageToTextureMaps,
  linearToSrgb,
  srgbToLinear,
  TEXTURE_MAP_IDS,
} from './evaluateTexture.js';
export {
  disposeTextureMapTextures,
  syncTextureMapTextures,
  TEXTURE_THREE_MAP_IDS,
} from './textureThree.js';
export {
  BUILT_IN_TEXTURE_PRESETS,
  findTexturePreset,
  TEXTURE_PRESET_CATEGORIES,
} from './texturePresets.js';
export {
  buildTextureAiPrompt,
  compileTextureAiRecipe,
  keywordTextureRecipe,
  matchTexturePresets,
  parseTextureAiResponse,
} from './textureAi.js';
