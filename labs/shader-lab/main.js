// Main entry for testing the reusable Three.js toon shader adapter.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

import {
  advanceEnvironmentShaderTime,
  applyEnvironmentSettingsToMaterial,
  applyEnvironmentShader,
  createEnvironmentSettings,
  ENVIRONMENT_DEBUG_MODES,
  ENVIRONMENT_SETTING_FIELD_SCHEMA,
  ENVIRONMENT_SETTING_GROUPS,
  resetEnvironmentShaderTime,
  setEnvironmentDebugOutput,
  setEnvironmentOpenings,
} from '../../src/environment/environmentMaterialAdapter.js';
import { captureEnvironmentAmbientProbe } from '../../src/environment/environmentAmbientProbe.js';
import { createEnvironmentPlanarReflection } from '../../src/environment/environmentPlanarReflection.js';
import {
  getEnvironmentPresetOptions,
  normalizeEnvironmentPresetName,
  resolveEnvironmentPreset,
} from '../../src/environment/environmentPresets.js';
import {
  applyEnvironmentLampEmissive,
  createEnvironmentDustMotes,
  createEnvironmentLampRig,
} from '../../src/environment/environmentRigs.js';
import { loadModelAsset, registerModelTextureAssetPaths } from '../../src/character/modelLoader.js';
import {
  applyToonShader,
  applyToonSettingsToMaterial,
  createToonPresetDocument,
  createToonSettings,
  findPrimarySkinnedMesh,
  getToonPresetOptions,
  normalizeToonPresetName,
  parseToonPresetDocument,
  resolveToonDebugOutputMode,
  sanitizeToonPresetSettings,
  serializeToonPreset,
  setToonDebugOutput,
  setObjectTextureColorSpaces,
  TOON_SETTING_GROUPS,
  waitForObjectTextures,
} from '../../src/toon/toonMaterialAdapter.js';
import {
  createPostProcessingPipeline,
  createPostProcessingSettings,
  DEFAULT_POST_PROCESSING_FEATURES,
  isPostProcessingEnabled,
} from '../../src/post/postProcessing.js';
import { createCharacterRenderPasses } from '../../src/toon/characterRenderPasses.js';
import { createEnvironmentSunShadowPass } from '../../src/environment/environmentSunShadowPass.js';
import { StylizedSky } from '../../src/sky/stylizedSky.js';
import {
  colorToHex,
  createSelectRow,
  createSettingsPanel,
  hexToColorArray,
} from '../../src/debug/index.js';
import { setLabParams } from '../shared/labParams.js';
import {
  countToonSettingDifferences,
  fillToonDebugSelect,
  readToonSettingValue,
  TOON_SETTING_FIELDS_BY_GROUP,
  withToonGroupValue,
} from '../shared/toonSettingFields.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import {
  CHARACTER_ASSET_OPTIONS,
  clearEnvironmentBackdropParams,
  DEFAULT_ENVIRONMENT_URL,
  DEFAULT_MODEL_URL,
  ENVIRONMENT_ASSET_OPTIONS,
  modelLabelFromUrl,
  normalizeAssetUrlPath,
  normalizedUrlListKey,
  TEST_CHARACTER_TEXTURE_ASSET_PATHS,
  TEST_ENVIRONMENT_TEXTURE_ASSET_PATHS,
} from './assetCatalog.js';
import {
  backdropPeriodForTime,
  createSunBeamMaterial,
  createSunDiskMaterial,
  createSunShaftMaterial,
  createSunSpillMaterial,
  defaultTurnForCaptureView,
  formatTimeOfDay,
  normalizeTimeOfDay,
  resolveCelestialState,
} from './environmentSky.js';
import {
  bindHudCheckbox,
  bindHudRange,
  bindHudSelect,
  HUD_TABS,
  initializeHudTabs,
  setHudCheckboxDisabled,
  setHudCheckboxValue,
  setHudRangeDisabled,
  setHudRangeLimits,
  setHudRangeValue,
  setHudSelectDisabled,
  setHudSelectValue,
  updateHudOutput,
} from './hudControls.js';
import { collectBones, createBoxingClipForTarget, RETARGET_MODE } from './mixamoRetarget.js';
import {
  booleanParam,
  compactObject,
  numberOption,
  numberParam,
  optionalBooleanParam,
  optionalNumberParam,
  settingParamName,
  URL_PARAMS,
} from './params.js';
import {
  clampInside,
  computeBackdropDimensions,
  computeModelBounds,
  defaultBackdropDistance,
  defaultBackdropScale,
  environmentRelativePoint,
  findEnvironmentFloorYAt,
  materialList,
  scaleModelToSceneSize,
  setShaderColor,
  setShaderOpacity,
  writeModelBoundsDataset,
} from './sceneGeometry.js';
import { loadLocalToonPresets, upsertLocalToonPresetDocument } from './toonPresetStore.js';

const DEFAULT_ENVIRONMENT_BACKDROP_URLS = Object.freeze({
  day: 'assets-local/environments/tests/indoor/Liyue/backgrounds/background-afternoon.jpg',
  evening: 'assets-local/environments/tests/indoor/Liyue/backgrounds/background-evening.jpg',
  morning: 'assets-local/environments/tests/indoor/Liyue/backgrounds/background-morning.jpg',
  night: 'assets-local/environments/tests/indoor/Liyue/backgrounds/background-night.jpg',
});
const DEFAULT_ENVIRONMENT_BACKDROP_URL = DEFAULT_ENVIRONMENT_BACKDROP_URLS.day;
const DEFAULT_STANDALONE_MODEL_SIZE = 2.4;
const DEFAULT_ENVIRONMENT_MODEL_SIZE = 0.86;
const DEFAULT_ENVIRONMENT_MODEL_Z_RATIO = 0.12;
const DEFAULT_ENVIRONMENT_SUN_INTENSITY = 2.6;
const DEFAULT_ENVIRONMENT_CEILING_LIGHT_INTENSITY = 2.2;
const DEFAULT_ENVIRONMENT_ROOM_YAW = 0;

// Modes:
//   ?model=assets-local/models/character/character.pmx, .fbx, .glb, .gltf, .obj, or .usdz
//   Repeat ?model=... to load multiple model files as one fitted set.
//   ?model=none skips character/model loading.
//   ?env=1 loads the default local interior test, or pass ?env=src/environments/.../scene.fbx
//   ?envShader=anime (default), standard, basic
//   ?envView=interior (default), exterior
//   ?envBackdrop=1 uses the local ignored test background, or pass an image URL
//   ?envBackdropOffset=12 moves the backdrop farther outside; default is distant scenery
//   ?envBackdropScale=3.5 scales the distant backdrop plane
//   ?envOpenWindows=1 cuts window-pane pixels so the backdrop shows through
//   ?envSun=1 adds a visible outside sun glow plus interior light spill
//   ?envTime=14 sets time of day in hours; 6 is sunrise and 18 is sunset
//   ?envRoomYaw=0 rotates the room's assumed compass direction without rotating geometry
//   ?envSunX=-0.46&envSunY=0.98&envSunZ=-0.42 tunes the outside sun source
//   ?envSunTargetX=0.08&envSunTargetY=0.12&envSunTargetZ=0.42 tunes where the sun aims
//   ?envCeilingLight=0 disables the optional warm ceiling lamp fill
//   ?envCeilingLightIntensity=2.2&envCeilingLightDistance=3 tune the two ceiling fixture lights
//   ?modelSize=0.86 overrides fitted character size; environment default is 20% smaller
//   ?modelGroundClearance=0.02 raises fitted characters above the detected environment floor
//   ?modelZ=... overrides the default sunlit character placement in environments
//   ?modelZRatio=0.12 places characters closer to the back/window side without world coordinates
//   ?modelTurn=180 rotates the character around the vertical axis
//   ?captureView=front, side, back, or face applies stable screenshot framing
//   ?hud=0 hides the HUD for clean baseline screenshots
//   ?mtl=assets-local/models/character/character.mtl for OBJ material libraries
//   ?shader=anime (default), toon, basic, normal
//   ?toonPreset=default (default) or call_me_sensei
//   ?toonDebug=off, albedo, sourceAlbedo, litAmount, terminator, sceneShadow, characterShadow, screenSpaceShadow, faceMap, shadowColor, lightColor, rim, depthRim, specular, hairHighlight, roles, alpha, lightingMap, normalMap, ao, emissive, or matcap
//   ?post=1 enables the optional post pipeline; ?postPreset=softAnime or debugEdges applies a preset
//   ?postBloom=1&postColorGrade=1&postVignette=1&postOutline=1&postDepthCue=1 toggles individual post effects
//   ?postAdvanced=1 exposes raw post effect controls in the HUD
//   ?anim=none (default), native, boxing
registerModelTextureAssetPaths([
  ...TEST_CHARACTER_TEXTURE_ASSET_PATHS,
  ...TEST_ENVIRONMENT_TEXTURE_ASSET_PATHS,
]);

loadLocalToonPresets();

const ENVIRONMENT_PARAM = URL_PARAMS.get('env') || URL_PARAMS.get('environment');
const ENVIRONMENT_URL = ENVIRONMENT_PARAM === '1'
  ? DEFAULT_ENVIRONMENT_URL
  : ENVIRONMENT_PARAM;
const REQUESTED_MODEL_URLS = URL_PARAMS.getAll('model')
  .filter((url) => url && url.toLowerCase() !== 'none');
const MODEL_URLS = REQUESTED_MODEL_URLS.length > 0
  ? REQUESTED_MODEL_URLS
  : ENVIRONMENT_URL
    ? []
    : [DEFAULT_MODEL_URL];
const MODEL_URL = MODEL_URLS[0];
const OBJ_MATERIAL_URL = URL_PARAMS.get('mtl') || null;
const SHADER_MODE = URL_PARAMS.get('shader') || 'anime';
const CAPTURE_VIEW = (URL_PARAMS.get('captureView') || '').toLowerCase();
let toonSettings = createToonSettings({
  preset: normalizeToonPresetName(
    URL_PARAMS.get('toonPreset') ||
    URL_PARAMS.get('toonStyle') ||
    URL_PARAMS.get('toonProfile') ||
    URL_PARAMS.get('preset'),
  ),
});
let toonDebugMode = resolveToonDebugOutputMode(URL_PARAMS.get('toonDebug'));
const ENVIRONMENT_SHADER_MODE = URL_PARAMS.get('envShader') || 'anime';
const ENVIRONMENT_VIEW = (URL_PARAMS.get('envView') || 'interior').toLowerCase();
const ENVIRONMENT_BACKDROP_PARAM = URL_PARAMS.get('envBackdrop') || URL_PARAMS.get('backdrop');
const FIXED_ENVIRONMENT_BACKDROP_URL = ENVIRONMENT_BACKDROP_PARAM && ENVIRONMENT_BACKDROP_PARAM !== '1'
  ? ENVIRONMENT_BACKDROP_PARAM
  : null;
const ENVIRONMENT_BACKDROP_URLS = Object.freeze({
  day: URL_PARAMS.get('envBackdropDay') || URL_PARAMS.get('envBackdropNoon') || FIXED_ENVIRONMENT_BACKDROP_URL || DEFAULT_ENVIRONMENT_BACKDROP_URLS.day,
  evening: URL_PARAMS.get('envBackdropEvening') || FIXED_ENVIRONMENT_BACKDROP_URL || DEFAULT_ENVIRONMENT_BACKDROP_URLS.evening,
  morning: URL_PARAMS.get('envBackdropMorning') || FIXED_ENVIRONMENT_BACKDROP_URL || DEFAULT_ENVIRONMENT_BACKDROP_URLS.morning,
  night: URL_PARAMS.get('envBackdropNight') || FIXED_ENVIRONMENT_BACKDROP_URL || DEFAULT_ENVIRONMENT_BACKDROP_URLS.night,
});
const ENVIRONMENT_BACKDROP_URL = ENVIRONMENT_BACKDROP_PARAM === '1'
  ? DEFAULT_ENVIRONMENT_BACKDROP_URL
  : ENVIRONMENT_BACKDROP_PARAM;
const OPEN_ENVIRONMENT_WINDOWS = (
  URL_PARAMS.get('envOpenWindows') === '1' ||
  URL_PARAMS.get('openWindows') === '1' ||
  (Boolean(ENVIRONMENT_BACKDROP_URL) && URL_PARAMS.get('envOpenWindows') !== '0')
);
const ENABLE_ENVIRONMENT_SUN = URL_PARAMS.get('envSun') === '1' ||
  (Boolean(ENVIRONMENT_BACKDROP_URL) && URL_PARAMS.get('envSun') !== '0');
const CEILING_LIGHT_SUPPORTED = Boolean(ENVIRONMENT_URL);
const ENABLE_ENVIRONMENT_CEILING_LIGHT = CEILING_LIGHT_SUPPORTED &&
  URL_PARAMS.get('envCeilingLight') !== '0' &&
  (ENABLE_ENVIRONMENT_SUN || URL_PARAMS.get('envCeilingLight') === '1');
const REQUESTED_ANIMATION_MODE = (URL_PARAMS.get('anim') || URL_PARAMS.get('animation') || 'none').toLowerCase();
const SUPPORTED_ANIMATION_MODES = new Set(['none', 'native', 'boxing']);
const ANIMATION_MODE = SUPPORTED_ANIMATION_MODES.has(REQUESTED_ANIMATION_MODE)
  ? REQUESTED_ANIMATION_MODE
  : 'none';
const ANIMATION_REQUESTED = ANIMATION_MODE !== 'none';
const FIT_MODEL_TO_STAGE = URL_PARAMS.get('fit') !== '0';
const INITIAL_HUD_TAB = HUD_TABS.has(URL_PARAMS.get('hudTab'))
  ? URL_PARAMS.get('hudTab')
  : 'character';

document.body.dataset.hideHud = URL_PARAMS.get('hud') === '0' ? 'true' : 'false';
document.body.dataset.hudTab = INITIAL_HUD_TAB;
document.body.dataset.postAdvanced = URL_PARAMS.get('postAdvanced') === '1' ? 'true' : 'false';
document.body.dataset.toonPreset = toonSettings.preset;
document.body.dataset.toonPresetLabel = toonSettings.presetLabel;
document.body.dataset.toonDebugMode = toonDebugMode.name;
document.body.dataset.toonDebugValue = String(toonDebugMode.value);

function getSelectedCharacterAssetOption() {
  if (MODEL_URLS.length === 0) {
    return CHARACTER_ASSET_OPTIONS.find((option) => option.id === 'none') ?? null;
  }

  const currentModelKey = normalizedUrlListKey(MODEL_URLS);
  return CHARACTER_ASSET_OPTIONS.find((option) => (
    normalizedUrlListKey(option.modelUrls) === currentModelKey
  )) ?? null;
}

function getSelectedEnvironmentAssetOption() {
  if (!ENVIRONMENT_URL) {
    return ENVIRONMENT_ASSET_OPTIONS.find((option) => option.id === 'none') ?? null;
  }

  const currentUrl = normalizeAssetUrlPath(ENVIRONMENT_URL).toLowerCase();
  return ENVIRONMENT_ASSET_OPTIONS.find((option) => (
    option.modelUrl &&
    normalizeAssetUrlPath(option.modelUrl).toLowerCase() === currentUrl
  )) ?? null;
}

if (REQUESTED_ANIMATION_MODE !== ANIMATION_MODE) {
  console.warn(`Unsupported animation mode "${REQUESTED_ANIMATION_MODE}". Supported modes: none, native, boxing.`);
}

function postPresetFromParams() {
  const explicitPreset = URL_PARAMS.get('postPreset');
  if (explicitPreset) return explicitPreset;

  const postValue = URL_PARAMS.get('post');
  if (!postValue) return 'off';
  const normalized = postValue.trim().toLowerCase();
  if (['0', '1', 'true', 'false', 'on', 'off', 'yes', 'no'].includes(normalized)) {
    return 'off';
  }
  return postValue;
}

function resolvePostProcessingOptions() {
  return {
    features: compactObject({
      bloom: optionalBooleanParam('postBloom'),
      colorGrade: optionalBooleanParam('postColorGrade'),
      depthCue: optionalBooleanParam('postDepthCue'),
      enabled: optionalBooleanParam('post'),
      screenOutline: optionalBooleanParam('postOutline'),
      vignette: optionalBooleanParam('postVignette'),
      verticalGrade: optionalBooleanParam('postVerticalGrade'),
    }),
    parameters: compactObject({
      bloomRadius: numberOption('postBloomRadius'),
      bloomStrength: numberOption('postBloomStrength'),
      bloomThreshold: numberOption('postBloomThreshold'),
      bottomDark: numberOption('postBottomDark'),
      contrast: numberOption('postContrast'),
      depthCueFar: numberOption('postDepthCueFar'),
      depthCueNear: numberOption('postDepthCueNear'),
      depthCueStrength: numberOption('postDepthCueStrength'),
      exposure: numberOption('postExposure'),
      outlineDepthStrength: numberOption('postOutlineDepthStrength'),
      outlineLumaStrength: numberOption('postOutlineLumaStrength'),
      outlineStrength: numberOption('postOutlineStrength'),
      saturation: numberOption('postSaturation'),
      strength: numberOption('postStrength'),
      topLight: numberOption('postTopLight'),
      vignetteRadius: numberOption('postVignetteRadius'),
      vignetteSoftness: numberOption('postVignetteSoftness'),
      vignetteStrength: numberOption('postVignetteStrength'),
      warmth: numberOption('postWarmth'),
    }),
    preset: postPresetFromParams(),
  };
}

let postProcessingSettings = createPostProcessingSettings(resolvePostProcessingOptions());
document.body.dataset.postProcessingEnabled = String(isPostProcessingEnabled(postProcessingSettings));
document.body.dataset.postProcessingPreset = postProcessingSettings.preset;
document.body.dataset.postProcessingFeatures = JSON.stringify(postProcessingSettings.features);

const POST_PROCESSING_PRESET_LABELS = Object.freeze({
  custom: 'Custom',
  debugEdges: 'Debug Edges',
  off: 'Off',
  softAnime: 'Presentation',
});

const POST_PROCESSING_FEATURE_LABELS = Object.freeze({
  bloom: 'Bloom',
  colorGrade: 'Grade',
  depthCue: 'Depth',
  screenOutline: 'Outline',
  vignette: 'Vignette',
});

function backdropUrlForTime(timeOfDay) {
  if (!ENVIRONMENT_BACKDROP_URL) return null;
  return ENVIRONMENT_BACKDROP_URLS[backdropPeriodForTime(timeOfDay)] || ENVIRONMENT_BACKDROP_URL;
}

function environmentFeatureOverridesFromParams() {
  const features = {};
  for (const key of Object.keys(ENVIRONMENT_SETTING_FIELD_SCHEMA.features ?? {})) {
    const paramName = settingParamName('env', key);
    if (URL_PARAMS.has(paramName)) features[key] = booleanParam(paramName);
  }
  return features;
}

function environmentParameterOverridesFromParams() {
  const parameters = {};
  for (const [key, field] of Object.entries(ENVIRONMENT_SETTING_FIELD_SCHEMA.parameters ?? {})) {
    const paramName = settingParamName('env', key);
    if (!URL_PARAMS.has(paramName)) continue;
    parameters[key] = field.type === 'number'
      ? optionalNumberParam(paramName)
      : URL_PARAMS.get(paramName);
  }
  return parameters;
}

// Named environment preset: one string selects a coherent look (shader
// features/parameters + rig hints). URL/HUD overrides still win over it.
const ENVIRONMENT_PRESET_NAME = normalizeEnvironmentPresetName(URL_PARAMS.get('envPreset'));
const ENVIRONMENT_PRESET = resolveEnvironmentPreset(ENVIRONMENT_PRESET_NAME);
document.body.dataset.environmentPreset = ENVIRONMENT_PRESET_NAME;

const ENVIRONMENT_DEBUG_MODE = (URL_PARAMS.get('envDebug') || 'off');
document.body.dataset.environmentDebug = ENVIRONMENT_DEBUG_MODE;

const sceneTune = {
  backdropDistance: optionalNumberParam('envBackdropOffset'),
  backdropScale: optionalNumberParam('envBackdropScale'),
  ceilingLightStrength: THREE.MathUtils.clamp(numberParam('envCeilingLightStrength', 1), 1, 8),
  modelGroundClearance: optionalNumberParam('modelGroundClearance') ?? optionalNumberParam('modelYOffset') ?? 0,
  modelSize: numberParam('modelSize', ENVIRONMENT_URL ? DEFAULT_ENVIRONMENT_MODEL_SIZE : DEFAULT_STANDALONE_MODEL_SIZE),
  modelTurn: THREE.MathUtils.clamp(optionalNumberParam('modelTurn') ?? defaultTurnForCaptureView(CAPTURE_VIEW) ?? 0, 0, 360),
  modelX: optionalNumberParam('modelX'),
  modelZ: optionalNumberParam('modelZ'),
  modelZRatio: THREE.MathUtils.clamp(
    optionalNumberParam('modelZRatio') ?? DEFAULT_ENVIRONMENT_MODEL_Z_RATIO,
    0.08,
    0.9,
  ),
  roomYaw: THREE.MathUtils.clamp(
    optionalNumberParam('envRoomYaw') ?? optionalNumberParam('roomYaw') ?? DEFAULT_ENVIRONMENT_ROOM_YAW,
    0,
    360,
  ),
  sunIntensity: Math.max(0, numberParam('envSunIntensity', DEFAULT_ENVIRONMENT_SUN_INTENSITY)),
  timeOfDay: normalizeTimeOfDay(
    optionalNumberParam('envTime') ?? optionalNumberParam('timeOfDay') ?? optionalNumberParam('time')
      ?? ENVIRONMENT_PRESET.rig.timeOfDayHour,
  ),
};
let environmentSettingsDraft = createEnvironmentSettings({
  features: {
    ...ENVIRONMENT_PRESET.features,
    ...environmentFeatureOverridesFromParams(),
  },
  parameters: {
    ...ENVIRONMENT_PRESET.parameters,
    ...environmentParameterOverridesFromParams(),
  },
});

let toonSettingsDraft = {
  preset: toonSettings.preset,
};

function updateModeLabel() {
  const el = document.getElementById('mode');
  if (!el) return;
  const modelLabel = MODEL_URLS.length === 0
    ? 'none'
    : MODEL_URLS.length > 1
      ? `${modelLabelFromUrl(MODEL_URL)} + ${MODEL_URLS.length - 1}`
      : modelLabelFromUrl(MODEL_URL);
  const environmentLabel = ENVIRONMENT_URL ? ` · Env: ${modelLabelFromUrl(ENVIRONMENT_URL)}` : '';
  const debugLabel = toonDebugMode.value > 0 ? ` · Debug: ${toonDebugMode.label}` : '';
  const presetLabel = toonSettings.presetLabel || toonSettings.preset;
  el.textContent = `Model: ${modelLabel}${environmentLabel} · Shader: ${SHADER_MODE} · Preset: ${presetLabel}${debugLabel} · Animation: ${ANIMATION_MODE}`;
}
updateModeLabel();

function populateCharacterAssetSelect() {
  const select = document.getElementById('characterAsset');
  if (!select) return;

  const selectedOption = getSelectedCharacterAssetOption();
  const currentOption = selectedOption ?? {
    format: 'Custom',
    id: 'custom',
    label: MODEL_URLS.length > 1
      ? `${modelLabelFromUrl(MODEL_URL)} + ${MODEL_URLS.length - 1} (Custom)`
      : `${modelLabelFromUrl(MODEL_URL)} (Custom)`,
    materialUrl: OBJ_MATERIAL_URL,
    modelUrls: MODEL_URLS,
    name: 'Custom',
  };

  select.replaceChildren();
  for (const option of CHARACTER_ASSET_OPTIONS) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    item.dataset.format = option.format;
    select.appendChild(item);
  }

  if (!selectedOption && MODEL_URLS.length > 0) {
    const item = document.createElement('option');
    item.value = currentOption.id;
    item.textContent = currentOption.label;
    item.dataset.format = currentOption.format;
    select.appendChild(item);
  }

  select.value = currentOption.id;
  updateHudOutput('characterAsset', currentOption.format);
  document.body.dataset.characterAssetCount = String(CHARACTER_ASSET_OPTIONS.length - 1);
}

function updateCharacterAssetHudControls() {
  const select = document.getElementById('characterAsset');
  if (!select) return;

  const selectedOption = getSelectedCharacterAssetOption();
  if (selectedOption) {
    setHudSelectValue('characterAsset', selectedOption.id, selectedOption.format);
    return;
  }

  if (MODEL_URLS.length > 0) {
    setHudSelectValue('characterAsset', 'custom', 'Custom');
  }
}

function setCharacterAssetFromHud(assetId) {
  if (assetId === 'custom') return;

  const option = CHARACTER_ASSET_OPTIONS.find((entry) => entry.id === assetId);
  if (!option) return;

  const params = new URLSearchParams(location.search);
  params.delete('model');
  params.delete('mtl');
  params.set('hudTab', 'demo');

  if (option.id === 'none') {
    params.set('model', 'none');
  } else {
    for (const modelUrl of option.modelUrls) params.append('model', modelUrl);
    if (option.materialUrl) params.set('mtl', option.materialUrl);
  }

  const query = params.toString();
  location.assign(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function populateEnvironmentAssetSelect() {
  const select = document.getElementById('environmentAsset');
  if (!select) return;

  const selectedOption = getSelectedEnvironmentAssetOption();
  const currentOption = selectedOption ?? {
    format: ENVIRONMENT_URL ? 'Custom' : 'Demo',
    id: ENVIRONMENT_URL ? 'custom' : 'none',
    label: ENVIRONMENT_URL
      ? `${modelLabelFromUrl(ENVIRONMENT_URL)} (Custom)`
      : 'No Environment',
    modelUrl: ENVIRONMENT_URL,
    name: ENVIRONMENT_URL ? 'Custom' : 'None',
  };

  select.replaceChildren();
  for (const option of ENVIRONMENT_ASSET_OPTIONS) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    item.dataset.format = option.format;
    select.appendChild(item);
  }

  if (!selectedOption && ENVIRONMENT_URL) {
    const item = document.createElement('option');
    item.value = currentOption.id;
    item.textContent = currentOption.label;
    item.dataset.format = currentOption.format;
    select.appendChild(item);
  }

  select.value = currentOption.id;
  updateHudOutput('environmentAsset', currentOption.format);
  document.body.dataset.environmentAssetCount = String(ENVIRONMENT_ASSET_OPTIONS.length - 1);
}

function updateEnvironmentAssetHudControls() {
  const select = document.getElementById('environmentAsset');
  if (!select) return;

  const selectedOption = getSelectedEnvironmentAssetOption();
  if (selectedOption) {
    setHudSelectValue('environmentAsset', selectedOption.id, selectedOption.format);
    return;
  }

  setHudSelectValue('environmentAsset', ENVIRONMENT_URL ? 'custom' : 'none', ENVIRONMENT_URL ? 'Custom' : 'Demo');
}

function setEnvironmentAssetFromHud(assetId) {
  if (assetId === 'custom') return;

  const option = ENVIRONMENT_ASSET_OPTIONS.find((entry) => entry.id === assetId);
  if (!option) return;

  const params = new URLSearchParams(location.search);
  params.delete('environment');
  params.set('hudTab', 'demo');

  if (option.id === 'none') {
    params.delete('env');
    params.delete('envView');
    clearEnvironmentBackdropParams(params);
  } else {
    params.set('env', option.modelUrl);
    if (!params.has('envShader')) params.set('envShader', ENVIRONMENT_SHADER_MODE || 'anime');
    if (!params.has('envView')) params.set('envView', option.view);

    clearEnvironmentBackdropParams(params);
    for (const [period, url] of Object.entries(option.backdropUrls ?? {})) {
      const key = period === 'day' ? 'envBackdropDay' : `envBackdrop${period[0].toUpperCase()}${period.slice(1)}`;
      params.set(key, url);
    }
    if (Object.keys(option.backdropUrls ?? {}).length > 0) {
      params.set('envBackdrop', '1');
      if (!params.has('envOpenWindows') && option.view === 'interior') params.set('envOpenWindows', '1');
    }
  }

  const query = params.toString();
  location.assign(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

// ---- Renderer ----
const container = document.getElementById('app');
const renderer = createLabRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a1a);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Node backends: three's own shadow system stays off — environmentSunShadowPass
// renders the sun shadow map (three's pass would use built-in buffer skinning,
// which overflows GL_MAX_UNIFORM_BLOCK_SIZE on MMD-scale skeletons).
renderer.shadowMap.enabled = ENABLE_ENVIRONMENT_SUN && !renderer.isWebGPURenderer;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
const backdropTextureLoader = new THREE.TextureLoader();
const backdropTextureCache = new Map();

// ---- Scene & Camera ----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 4.5);
camera.lookAt(0, 1.2, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1.2, 0);
const postProcessingPipeline = createPostProcessingPipeline({
  camera,
  renderer,
  scene,
  settings: postProcessingSettings,
  height: window.innerHeight,
  pixelRatio: window.devicePixelRatio,
  width: window.innerWidth,
});
document.body.dataset.postProcessingEnabled = postProcessingPipeline.enabled ? 'true' : 'false';

// Runtime character passes: scene depth prepass (depth rim + contact shadow),
// character-only self-shadow map, head-bone tracking for face shading, and
// measured average shadow. Each pass auto-skips unless a converted material
// actually consumes it.
const characterRenderPasses = createCharacterRenderPasses({ camera, renderer, scene });

// Node backends: three's shadow system is bypassed (materials are unlit node
// materials), so a dedicated pass renders the sun shadow map that the
// environment + character shaders sample. Inert without a shadow-casting sun
// and on the classic path.
const environmentSunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });

// Opt-in stylized sky dome (`?sky=1`). The sky system's scene home is the
// playground water lab; this hook gives shader-lab a minimal deterministic
// scene for sky-only verification (used by the TSL migration A/B captures).
const stylizedSkyDome = booleanParam('sky') ? new StylizedSky({ radius: 60 }) : null;
if (stylizedSkyDome) scene.add(stylizedSkyDome);

// Debug/automation handle (probe scripts in the TSL migration verification
// flow introspect the scene graph through this).
if (booleanParam('labDebug')) {
  window.__toonLabDebug = {
    camera,
    environmentSunShadowPass,
    getFloorReflection: () => sceneRuntime.floorReflection,
    renderer,
    scene,
  };
}

const clock = new THREE.Clock();
const animationMixers = [];
const animationActions = [];
let animationPlaybackEnabled = ANIMATION_REQUESTED;
let ceilingLightRig = null;
let ceilingLightEnabled = ENABLE_ENVIRONMENT_CEILING_LIGHT;
const sceneRuntime = {
  backdrop: null,
  environmentBox: null,
  environmentRoot: null,
  modelBox: null,
  modelRoot: null,
  sunLight: null,
  sunRig: null,
};

function updateSceneLightCounts() {
  const counts = {
    ambient: 0,
    directional: 0,
    hemisphere: 0,
    point: 0,
    spot: 0,
    total: 0,
  };

  scene.traverse((obj) => {
    if (!obj.isLight || obj.visible === false || obj.intensity <= 0) return;

    counts.total += 1;
    if (obj.isAmbientLight) counts.ambient += 1;
    if (obj.isDirectionalLight) counts.directional += 1;
    if (obj.isHemisphereLight) counts.hemisphere += 1;
    if (obj.isPointLight) counts.point += 1;
    if (obj.isSpotLight) counts.spot += 1;
  });

  document.body.dataset.ambientLightCount = String(counts.ambient);
  document.body.dataset.directionalLightCount = String(counts.directional);
  document.body.dataset.hemisphereLightCount = String(counts.hemisphere);
  document.body.dataset.pointLightCount = String(counts.point);
  document.body.dataset.spotLightCount = String(counts.spot);
  document.body.dataset.totalLightCount = String(counts.total);
  return counts;
}

function setAnimationReady(value) {
  document.body.dataset.animationReady = value;
  updateAnimationToggleButton();
}

function updateAnimationToggleButton() {
  const button = document.getElementById('animationToggle');
  if (!button) return;

  const animationReady = document.body.dataset.animationReady;

  if (!ANIMATION_REQUESTED || animationReady === 'none') {
    button.textContent = 'Animation Off';
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    document.body.dataset.animationPlayback = 'off';
    return;
  }

  if (animationReady === 'error') {
    button.textContent = 'Animation Error';
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    document.body.dataset.animationPlayback = 'off';
    return;
  }

  if (animationActions.length === 0) {
    button.textContent = 'Animation Loading';
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    return;
  }

  button.disabled = false;
  button.textContent = animationPlaybackEnabled ? 'Animation On' : 'Animation Off';
  button.setAttribute('aria-pressed', animationPlaybackEnabled ? 'true' : 'false');
  document.body.dataset.animationPlayback = animationPlaybackEnabled ? 'on' : 'off';
}

function registerAnimationAction(action) {
  action.reset();
  action.paused = !animationPlaybackEnabled;
  action.play();
  animationActions.push(action);
  setAnimationReady('true');
}

document.getElementById('animationToggle')?.addEventListener('click', () => {
  if (animationActions.length === 0) return;

  animationPlaybackEnabled = !animationPlaybackEnabled;
  for (const action of animationActions) {
    action.paused = !animationPlaybackEnabled;
    if (animationPlaybackEnabled) action.play();
  }
  updateAnimationToggleButton();
});

function updateCeilingLightToggleButton() {
  const button = document.getElementById('ceilingLightToggle');
  if (!button) return;

  button.hidden = !CEILING_LIGHT_SUPPORTED;
  if (!CEILING_LIGHT_SUPPORTED) {
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    document.body.dataset.environmentCeilingLight = 'none';
    return;
  }

  if (!ceilingLightRig) {
    button.textContent = 'Ceiling Loading';
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    document.body.dataset.environmentCeilingLight = ceilingLightEnabled ? 'loading' : 'off';
    return;
  }

  button.disabled = false;
  button.textContent = ceilingLightEnabled ? 'Ceiling Light On' : 'Ceiling Light Off';
  button.setAttribute('aria-pressed', ceilingLightEnabled ? 'true' : 'false');
  document.body.dataset.environmentCeilingLight = ceilingLightEnabled ? 'on' : 'off';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

// `key` is the field's dotted key within its group (`'cameraLight.strength'`).
function setToonDraftField(groupId, key, value) {
  const nextDraft = cloneJson(toonSettingsDraft);
  nextDraft[groupId] = withToonGroupValue(nextDraft[groupId], key, value);
  toonSettingsDraft = nextDraft;
}

// Every serialisable field of resolved settings (a complete preset body).
function fullSerializableSettingsFrom(settings) {
  return sanitizeToonPresetSettings(settings);
}

function currentToonPresetDocument({ id = toonSettings.preset, label = toonSettings.presetLabel } = {}) {
  return createToonPresetDocument(id, {
    description: `Saved from the demo HUD using ${toonSettings.presetLabel || toonSettings.preset} as the starting point.`,
    label,
    settings: fullSerializableSettingsFrom(createToonSettings(toonSettingsDraft)),
  });
}

function updateToonPresetDiff() {
  const output = document.getElementById('toonPresetDiffValue');
  if (!output) return;

  const changedCount = countToonSettingDifferences(
    createToonSettings(toonSettingsDraft),
    createToonSettings({ preset: toonSettings.preset }),
  );
  const label = changedCount === 0 ? 'Clean' : `Modified (${changedCount})`;
  output.value = label;
  output.textContent = label;
  document.body.dataset.toonPresetModified = changedCount === 0 ? 'false' : 'true';
  document.body.dataset.toonPresetDiffCount = String(changedCount);
}

function applyToonSettingsDraft({ updateControls = true } = {}) {
  toonSettings = createToonSettings(toonSettingsDraft);
  document.body.dataset.toonPreset = toonSettings.preset;
  document.body.dataset.toonPresetLabel = toonSettings.presetLabel;
  if (sceneRuntime.modelRoot) applyToonSettingsToMaterial(sceneRuntime.modelRoot, toonSettings);
  updateModeLabel();
  updateToonPresetDiff();
  if (updateControls) refreshToonSettingControls();
}

function populateToonPresetSelect() {
  const select = document.getElementById('toonPreset');
  if (!select) return;

  const currentValue = select.value;
  select.replaceChildren();

  for (const option of getToonPresetOptions()) {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.label;
    element.title = option.description;
    select.append(element);
  }

  if (currentValue && [...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function updateToonPresetHudControls() {
  populateToonPresetSelect();
  setHudSelectValue('toonPreset', toonSettings.preset, toonSettings.presetLabel);
  document.body.dataset.toonPreset = toonSettings.preset;
  document.body.dataset.toonPresetLabel = toonSettings.presetLabel;

  const metadata = getToonPresetOptions().find((option) => option.id === toonSettings.preset);
  const select = document.getElementById('toonPreset');
  if (select && metadata?.description) select.title = metadata.description;
  updateToonPresetDiff();
}

function setToonPresetFromHud(presetName) {
  const nextPreset = normalizeToonPresetName(presetName);
  if (nextPreset === toonSettings.preset) {
    updateToonPresetHudControls();
    return;
  }

  setLabParams({ toonPreset: nextPreset });
}

let toonSettingsPanel = null;
let toonPanelSettings = null;

function buildToonSettingsPanel() {
  const container = document.getElementById('toonSettingGroups');
  if (!container || container.childElementCount > 0) return;

  toonPanelSettings = createToonSettings(toonSettingsDraft);
  toonSettingsPanel = createSettingsPanel({
    container,
    dataAttribute: 'toonField',
    fieldFilter: (field) => field.serializable,
    fieldSchema: TOON_SETTING_FIELDS_BY_GROUP,
    getValue: (field) => readToonSettingValue(toonPanelSettings, field),
    groups: TOON_SETTING_GROUPS,
    idPrefix: 'toonSetting',
    isDisabled: () => SHADER_MODE !== 'anime',
    onChange: (field, value) => {
      setToonDraftField(field.group, field.key, value);
      applyToonSettingsDraft({ updateControls: false });
    },
    rowClassName: 'hud-control toon-field-control',
  });
  updateToonPresetDiff();
}

function refreshToonSettingControls() {
  toonPanelSettings = createToonSettings(toonSettingsDraft);
  toonSettingsPanel?.refresh();
  updateToonPresetDiff();
}

function firstEnvironmentUniformValue(uniformName) {
  let foundValue;
  sceneRuntime.environmentRoot?.traverse((obj) => {
    if (foundValue !== undefined || !obj.isMesh || !obj.material) return;
    for (const mat of materialList(obj.material)) {
      if (!mat?.userData?.environmentMaterial || !mat.uniforms?.[uniformName]) continue;
      foundValue = mat.uniforms[uniformName].value;
      return;
    }
  });
  return foundValue;
}

function environmentFieldControlValue(field) {
  if (field.group === 'features') return Boolean(environmentSettingsDraft.features[field.key]);

  const overrideValue = environmentSettingsDraft.parameters[field.key];
  if (overrideValue !== null && overrideValue !== undefined) return overrideValue;

  const uniformValue = firstEnvironmentUniformValue(field.key);
  if (field.type === 'color') return uniformValue ?? [1, 1, 1];
  if (field.type === 'number') {
    const fallback = field.range?.min ?? 0;
    return Number.isFinite(uniformValue) ? uniformValue : fallback;
  }
  return uniformValue ?? field.defaultValue;
}

function formatEnvironmentFieldValue(value, field) {
  const isAuto = field.group === 'parameters' &&
    (environmentSettingsDraft.parameters[field.key] === null ||
      environmentSettingsDraft.parameters[field.key] === undefined);
  if (isAuto) return 'Auto';
  if (field.type === 'boolean') return value ? 'On' : 'Off';
  if (field.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toFixed(field.range?.step < 0.01 ? 3 : 2)
      : String(value ?? '');
  }
  if (field.type === 'color') return colorToHex(value);
  return String(value ?? '');
}

function setEnvironmentDraftField(groupId, key, value) {
  environmentSettingsDraft = createEnvironmentSettings({
    ...environmentSettingsDraft,
    [groupId]: {
      ...(environmentSettingsDraft[groupId] ?? {}),
      [key]: value,
    },
  });
}

function updateEnvironmentSettingsStatus() {
  const output = document.getElementById('environmentSettingsStatus');
  if (!output) return;
  const parameterOverrides = Object.values(environmentSettingsDraft.parameters)
    .filter((value) => value !== null && value !== undefined)
    .length;
  const featureDiffs = Object.entries(environmentSettingsDraft.features)
    .filter(([key, value]) => value !== createEnvironmentSettings().features[key])
    .length;
  const total = parameterOverrides + featureDiffs;
  const label = total === 0
    ? 'Auto material defaults'
    : `${total} shader override${total === 1 ? '' : 's'}`;
  output.value = label;
  output.textContent = label;
  document.body.dataset.environmentSettingsOverrideCount = String(total);
}

function applyEnvironmentSettingsDraft({ updateControls = true } = {}) {
  if (sceneRuntime.environmentRoot) {
    sceneRuntime.environmentRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = ENABLE_ENVIRONMENT_SUN && environmentSettingsDraft.features.shadowMask;
      obj.receiveShadow = ENABLE_ENVIRONMENT_SUN && environmentSettingsDraft.features.shadowMask;
      for (const mat of materialList(obj.material)) {
        if (mat?.userData?.environmentMaterial) {
          applyEnvironmentSettingsToMaterial(mat, environmentSettingsDraft);
        } else if (mat?.userData?.environmentAoOverlay) {
          mat.visible = environmentSettingsDraft.features.aoOverlay;
        } else if (mat?.userData?.environmentShadow) {
          mat.visible = environmentSettingsDraft.features.shadowMesh;
        }
      }
    });
  }
  updateEnvironmentSettingsStatus();
  if (updateControls) refreshEnvironmentSettingControls();
}

let environmentSettingsPanel = null;

function buildEnvironmentPresetDebugGroup() {
  // Preset + debug selectors ahead of the schema-generated groups.
  const details = document.createElement('details');
  details.className = 'toon-setting-group environment-setting-group';
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Preset & Debug';
  summary.title = 'Named environment looks and shader debug views.';
  const fieldList = document.createElement('div');
  fieldList.className = 'toon-setting-fields';

  fieldList.append(createSelectRow({
    id: 'environmentPresetSelect',
    label: 'Preset',
    onChange: (value) => {
      setLabParams({ envPreset: value === 'default' ? null : value });
    },
    options: getEnvironmentPresetOptions(),
    rowClassName: 'hud-control environment-static-control',
    title: 'Applies a named environment look (reloads the scene so conversion starts from source materials).',
    value: ENVIRONMENT_PRESET_NAME,
  }));

  fieldList.append(createSelectRow({
    id: 'environmentDebugSelect',
    label: 'Debug View',
    onChange: (value) => {
      if (sceneRuntime.environmentRoot) setEnvironmentDebugOutput(sceneRuntime.environmentRoot, value);
      document.body.dataset.environmentDebug = value;
      setLabParams({ envDebug: value === 'off' ? null : value }, { navigate: false });
    },
    options: Object.keys(ENVIRONMENT_DEBUG_MODES).map((key) => ({ label: key, value: key })),
    rowClassName: 'hud-control environment-static-control',
    title: 'Renders one environment shader term in isolation.',
    value: ENVIRONMENT_DEBUG_MODE in ENVIRONMENT_DEBUG_MODES ? ENVIRONMENT_DEBUG_MODE : 'off',
  }));

  details.append(summary, fieldList);
  return details;
}

function buildEnvironmentSettingsPanel() {
  const container = document.getElementById('environmentSettingGroups');
  if (!container || container.childElementCount > 0) return;

  environmentSettingsPanel = createSettingsPanel({
    container,
    dataAttribute: 'environmentField',
    fieldSchema: ENVIRONMENT_SETTING_FIELD_SCHEMA,
    formatValue: formatEnvironmentFieldValue,
    getValue: environmentFieldControlValue,
    groupClassName: 'toon-setting-group environment-setting-group',
    groups: ENVIRONMENT_SETTING_GROUPS,
    idPrefix: 'environmentSetting',
    isDisabled: () => !(Boolean(sceneRuntime.environmentRoot) && ENVIRONMENT_SHADER_MODE === 'anime'),
    isGroupOpen: (group) => group.id === 'features',
    onChange: (field, value) => {
      setEnvironmentDraftField(field.group, field.key, value);
      applyEnvironmentSettingsDraft({ updateControls: false });
    },
    prepend: [buildEnvironmentPresetDebugGroup()],
    rowClassName: 'hud-control environment-field-control',
  });
  updateEnvironmentSettingsStatus();
}

function refreshEnvironmentSettingControls() {
  environmentSettingsPanel?.refresh();
  updateEnvironmentSettingsStatus();
}

function updateToonPresetStatus(message) {
  const output = document.getElementById('toonPresetDiffValue');
  if (!output) return;
  output.value = message;
  output.textContent = message;
}

function saveToonPresetFromHud() {
  const nameInput = document.getElementById('toonPresetName');
  const requestedName = nameInput?.value?.trim() || `${toonSettings.preset}_copy`;
  const presetId = requestedName.replace(/[\s-]+/g, '_').toLowerCase();
  const presetDocument = currentToonPresetDocument({
    id: presetId,
    label: requestedName,
  });
  const savedDocument = upsertLocalToonPresetDocument(presetDocument);
  populateToonPresetSelect();
  updateToonPresetStatus(`Saved ${savedDocument.label}`);
}

function exportToonPresetFromHud() {
  const textArea = document.getElementById('toonPresetJson');
  const nameInput = document.getElementById('toonPresetName');
  const requestedName = nameInput?.value?.trim() || toonSettings.presetLabel || toonSettings.preset;
  const presetDocument = currentToonPresetDocument({
    id: requestedName,
    label: requestedName,
  });
  if (textArea) textArea.value = serializeToonPreset(presetDocument);
  updateToonPresetStatus('Exported JSON');
}

function importToonPresetFromHud() {
  const textArea = document.getElementById('toonPresetJson');
  const result = parseToonPresetDocument(textArea?.value ?? '');
  if (!result.ok) {
    updateToonPresetStatus(result.errors[0] ?? 'Import failed');
    return;
  }

  const savedDocument = upsertLocalToonPresetDocument(result.value);
  populateToonPresetSelect();
  updateToonPresetStatus(`Imported ${savedDocument.label}`);
}

function resetToonPresetDraftFromHud() {
  toonSettingsDraft = {
    preset: toonSettings.preset,
  };
  applyToonSettingsDraft();
  updateToonPresetHudControls();
  updateToonPresetStatus('Reset');
}

function updatePostProcessingDataset() {
  document.body.dataset.postProcessingEnabled = postProcessingPipeline.enabled ? 'true' : 'false';
  document.body.dataset.postProcessingPreset = postProcessingSettings.preset;
  document.body.dataset.postProcessingFeatures = JSON.stringify(postProcessingSettings.features);
}

function applyPostProcessingSettings(nextOptions = {}) {
  const hasPreset = Object.prototype.hasOwnProperty.call(nextOptions, 'preset');
  const hasFeatureUpdate = Object.prototype.hasOwnProperty.call(nextOptions, 'features');
  const hasParameterUpdate = Object.prototype.hasOwnProperty.call(nextOptions, 'parameters');
  const nextPreset = hasPreset ? nextOptions.preset : postProcessingSettings.preset;
  const shouldPreserveFeatures = !hasPreset || nextPreset === 'custom';
  const shouldPreserveParameters = !hasPreset || nextPreset === 'custom' || hasParameterUpdate;

  postProcessingSettings = createPostProcessingSettings({
    features: hasFeatureUpdate || shouldPreserveFeatures
      ? {
        ...(shouldPreserveFeatures ? postProcessingSettings.features : {}),
        ...nextOptions.features,
      }
      : undefined,
    parameters: hasParameterUpdate || shouldPreserveParameters
      ? {
        ...(shouldPreserveParameters ? postProcessingSettings.parameters : {}),
        ...nextOptions.parameters,
      }
      : undefined,
    preset: nextPreset,
  });
  postProcessingPipeline.setSettings(postProcessingSettings);
  updatePostProcessingDataset();
  refreshSceneHudControls();
}

function setPostProcessingEnabledFromHud(enabled) {
  if (!enabled) {
    applyPostProcessingSettings({
      features: {
        ...DEFAULT_POST_PROCESSING_FEATURES,
      },
      preset: 'off',
    });
    return;
  }

  const hasActiveEffect = Object.entries(postProcessingSettings.features)
    .some(([key, value]) => key !== 'enabled' && Boolean(value));
  applyPostProcessingSettings(hasActiveEffect
    ? {
      features: {
        enabled: true,
      },
      preset: postProcessingSettings.preset === 'off' ? 'custom' : postProcessingSettings.preset,
    }
    : {
      preset: 'softAnime',
    });
}

function setPostProcessingPreset(preset) {
  applyPostProcessingSettings({ preset });
}

function setPostProcessingFeature(featureName, enabled) {
  const nextFeatures = {
    ...postProcessingSettings.features,
    [featureName]: Boolean(enabled),
  };
  const hasActiveEffect = Object.entries(nextFeatures)
    .some(([key, value]) => key !== 'enabled' && Boolean(value));
  const featureUpdate = {
    [featureName]: Boolean(enabled),
    enabled: hasActiveEffect,
  };

  applyPostProcessingSettings({
    features: featureUpdate,
    preset: 'custom',
  });
}

function setPostProcessingParameter(parameterName, value) {
  applyPostProcessingSettings({
    parameters: {
      [parameterName]: value,
    },
    preset: postProcessingSettings.preset === 'off' ? 'custom' : postProcessingSettings.preset,
  });
}

function updatePostProcessingToggleButton() {
  const button = document.getElementById('postProcessingToggle');
  if (!button) return;

  button.disabled = false;
  button.textContent = postProcessingPipeline.enabled ? 'Post On' : 'Post Off';
  button.setAttribute('aria-pressed', postProcessingPipeline.enabled ? 'true' : 'false');
}

function updatePostProcessingHudControls() {
  updatePostProcessingToggleButton();

  const showAdvancedPost = document.body.dataset.postAdvanced === 'true';
  document.querySelectorAll('.post-advanced-option').forEach((option) => {
    option.hidden = !showAdvancedPost;
  });

  setHudSelectValue(
    'postPreset',
    postProcessingSettings.preset,
    POST_PROCESSING_PRESET_LABELS[postProcessingSettings.preset] ?? postProcessingSettings.preset,
  );

  for (const featureName of Object.keys(POST_PROCESSING_FEATURE_LABELS)) {
    setHudCheckboxDisabled(`post${POST_PROCESSING_FEATURE_LABELS[featureName]}`, false);
    setHudCheckboxValue(
      `post${POST_PROCESSING_FEATURE_LABELS[featureName]}`,
      postProcessingSettings.features[featureName],
    );
  }

  setHudRangeValue('postStrength', postProcessingSettings.parameters.strength, (value) => value.toFixed(2));
  setHudRangeValue('postBloomStrength', postProcessingSettings.parameters.bloomStrength, (value) => value.toFixed(2));
  setHudRangeValue('postExposure', postProcessingSettings.parameters.exposure, (value) => value.toFixed(2));
  setHudRangeValue('postContrast', postProcessingSettings.parameters.contrast, (value) => value.toFixed(2));
  setHudRangeValue('postVignetteStrength', postProcessingSettings.parameters.vignetteStrength, (value) => value.toFixed(2));
}

function setToonDebugMode(debugMode) {
  toonDebugMode = setToonDebugOutput(sceneRuntime.modelRoot, debugMode);
  document.body.dataset.toonDebugMode = toonDebugMode.name;
  document.body.dataset.toonDebugValue = String(toonDebugMode.value);
  setHudSelectValue('toonDebug', toonDebugMode.name, toonDebugMode.label);
  setLabParams({ toonDebug: toonDebugMode.name === 'off' ? null : toonDebugMode.name }, { navigate: false });
  updateModeLabel();
}

function applyCeilingLightRigState() {
  if (!ceilingLightRig) return;

  ceilingLightRig.visible = ceilingLightEnabled;
  ceilingLightRig.traverse((obj) => {
    if (obj.isLight) {
      const baseIntensity = obj.userData.ceilingLightBaseIntensity ?? DEFAULT_ENVIRONMENT_CEILING_LIGHT_INTENSITY;
      obj.intensity = ceilingLightEnabled ? baseIntensity * sceneTune.ceilingLightStrength : 0;
      obj.userData.ceilingLightIntensity = obj.intensity;
    }
    if (obj.material?.uniforms?.opacity) {
      const baseOpacity = obj.userData.ceilingLightBaseOpacity ?? obj.material.uniforms.opacity.value;
      obj.material.uniforms.opacity.value = ceilingLightEnabled
        ? Math.min(0.5, baseOpacity * Math.sqrt(sceneTune.ceilingLightStrength))
        : 0;
    }
    if (obj.material && 'opacity' in obj.material) {
      const baseOpacity = obj.userData.ceilingLightBaseOpacity ?? obj.material.opacity;
      obj.material.opacity = ceilingLightEnabled
        ? Math.min(0.5, baseOpacity * Math.sqrt(sceneTune.ceilingLightStrength))
        : 0;
    }
    if (obj.material) obj.material.needsUpdate = true;
  });

  // Fixture emissive follows lamp intensity so a dimmed lamp does not leave
  // its shade glowing at full strength.
  if (sceneRuntime.environmentRoot) {
    applyEnvironmentLampEmissive(
      sceneRuntime.environmentRoot,
      ceilingLightEnabled ? Math.sqrt(sceneTune.ceilingLightStrength) : 0.15,
    );
  }

  document.body.dataset.environmentCeilingLightStrength = String(sceneTune.ceilingLightStrength);
  updateSceneLightCounts();
}

function setCeilingLightStrength(strength) {
  sceneTune.ceilingLightStrength = THREE.MathUtils.clamp(strength, 1, 8);
  applyCeilingLightRigState();
  setHudRangeValue('ceilingLightStrength', sceneTune.ceilingLightStrength, (value) => `${value.toFixed(2)}x`);
}

function setCeilingLightEnabled(enabled) {
  ceilingLightEnabled = Boolean(enabled);
  applyCeilingLightRigState();

  updateCeilingLightToggleButton();
  refreshSceneHudControls();
}

document.getElementById('ceilingLightToggle')?.addEventListener('click', () => {
  if (!ceilingLightRig) return;
  setCeilingLightEnabled(!ceilingLightEnabled);
});

document.getElementById('postProcessingToggle')?.addEventListener('click', () => {
  setPostProcessingEnabledFromHud(!postProcessingPipeline.enabled);
});

function applyEnvironmentSkyState({ updateBackdrop = false } = {}) {
  if (!sceneRuntime.environmentBox || !sceneRuntime.sunLight) {
    if (updateBackdrop) void applyEnvironmentBackdropForTime();
    return null;
  }

  const environmentBox = sceneRuntime.environmentBox;
  const size = environmentBox.getSize(new THREE.Vector3());
  const center = environmentBox.getCenter(new THREE.Vector3());
  const skyState = resolveCelestialState(sceneTune.timeOfDay, sceneTune.roomYaw, sceneTune.sunIntensity);
  const light = sceneRuntime.sunLight;

  light.color.copy(skyState.color);
  light.intensity = skyState.intensity;
  light.position.copy(environmentRelativePoint(environmentBox, skyState.source));
  light.target.position.copy(environmentRelativePoint(environmentBox, skyState.target));
  light.target.updateMatrixWorld(true);
  light.shadow.needsUpdate = true;
  if (light.shadow.camera) light.shadow.camera.updateProjectionMatrix();

  const rig = sceneRuntime.sunRig;
  if (rig?.sunDisk) {
    setShaderColor(rig.sunDisk, skyState.diskColor);
    setShaderOpacity(rig.sunDisk, skyState.diskOpacity);
    rig.sunDisk.position.set(
      center.x + size.x * skyState.source.x * 0.62,
      environmentBox.min.y + size.y * THREE.MathUtils.clamp(0.42 + skyState.source.y * 0.32, 0.28, 0.88),
      environmentBox.min.z - 0.05,
    );
    rig.sunDisk.lookAt(camera.position);
  }

  if (rig?.spill) {
    setShaderColor(rig.spill, skyState.color);
    setShaderOpacity(rig.spill, skyState.spillOpacity);
    rig.spill.rotation.z = -0.08 + skyState.skyRotation * 0.55;
  }

  if (rig?.beam) {
    setShaderColor(rig.beam, skyState.color);
    setShaderOpacity(rig.beam, skyState.warmBeamOpacity);
    rig.beam.rotation.z = -0.34 + skyState.skyRotation * 0.7;
  }

  if (rig?.shaft) {
    setShaderColor(rig.shaft, skyState.color);
    setShaderOpacity(rig.shaft, skyState.shaftOpacity);
    rig.shaft.rotation.z = skyState.skyRotation * 0.18;
  }

  document.body.dataset.environmentCelestialKind = skyState.kind;
  document.body.dataset.environmentRoomYaw = String(sceneTune.roomYaw);
  document.body.dataset.environmentTimeOfDay = skyState.timeLabel;
  document.body.dataset.environmentSunPosition = light.position.toArray().join(',');
  document.body.dataset.environmentSunTarget = light.target.position.toArray().join(',');
  document.body.dataset.environmentSunIntensity = String(light.intensity);
  document.body.dataset.environmentSunMaxIntensity = String(sceneTune.sunIntensity);
  document.body.dataset.environmentSunVisibility = String(skyState.visibilityFactor);
  updateSceneLightCounts();

  if (updateBackdrop) void applyEnvironmentBackdropForTime();
  return skyState;
}

function setSunIntensity(intensity) {
  sceneTune.sunIntensity = Math.max(0, intensity);
  applyEnvironmentSkyState();
  setHudRangeValue('sunIntensity', sceneTune.sunIntensity, (value) => value.toFixed(2));
}

function setTimeOfDayFromHud(timeOfDay) {
  sceneTune.timeOfDay = normalizeTimeOfDay(timeOfDay);
  applyEnvironmentSkyState({ updateBackdrop: true });
  setHudRangeValue('timeOfDay', sceneTune.timeOfDay, formatTimeOfDay);
}

function setRoomYawFromHud(roomYaw) {
  sceneTune.roomYaw = THREE.MathUtils.clamp(roomYaw, 0, 360);
  applyEnvironmentSkyState();
  setHudRangeValue('roomYaw', sceneTune.roomYaw, (value) => `${Math.round(value)} deg`);
}

function applyModelHudTransform({ updateCamera = false } = {}) {
  if (!sceneRuntime.modelRoot) return;

  sceneRuntime.modelRoot.rotation.y = THREE.MathUtils.degToRad(sceneTune.modelTurn);
  sceneRuntime.modelRoot.updateMatrixWorld(true);
  let modelBox = scaleModelToSceneSize(sceneRuntime.modelRoot, sceneTune.modelSize);
  if (ENVIRONMENT_URL && sceneRuntime.environmentBox) {
    modelBox = positionModelInEnvironment(sceneRuntime.modelRoot, sceneRuntime) || modelBox;
    if (updateCamera) frameModelInEnvironment(modelBox, sceneRuntime.environmentBox);
  } else if (modelBox && updateCamera) {
    const finalSize = modelBox.getSize(new THREE.Vector3());
    controls.target.set(0, Math.max(0.75, Math.min(1.35, modelBox.min.y + finalSize.y * 0.55)), 0);
    controls.update();
  }

  sceneRuntime.modelBox = modelBox;
  refreshSceneHudControls();
}

function setModelSizeFromHud(size) {
  sceneTune.modelSize = Math.max(0.05, size);
  applyModelHudTransform();
  setHudRangeValue('modelSize', sceneTune.modelSize, (value) => value.toFixed(2));
}

function setModelXFromHud(x) {
  sceneTune.modelX = x;
  applyModelHudTransform();
  setHudRangeValue('modelX', sceneTune.modelX, (value) => value.toFixed(2));
}

function setModelDepthFromHud(ratio) {
  sceneTune.modelZ = null;
  sceneTune.modelZRatio = THREE.MathUtils.clamp(ratio, 0.08, 0.9);
  applyModelHudTransform();
  setHudRangeValue('modelDepth', sceneTune.modelZRatio, (value) => value.toFixed(2));
}

function setModelTurnFromHud(turn) {
  sceneTune.modelTurn = THREE.MathUtils.clamp(turn, 0, 360);
  applyModelHudTransform();
  setHudRangeValue('modelTurn', sceneTune.modelTurn, (value) => `${Math.round(value)} deg`);
}

function setModelLiftFromHud(lift) {
  sceneTune.modelGroundClearance = lift;
  applyModelHudTransform();
  setHudRangeValue('modelLift', sceneTune.modelGroundClearance, (value) => value.toFixed(3));
}

function applyBackdropHudTransform() {
  if (!sceneRuntime.backdrop || !sceneRuntime.environmentBox) return;

  const environmentBox = sceneRuntime.environmentBox;
  const size = environmentBox.getSize(new THREE.Vector3());
  const center = environmentBox.getCenter(new THREE.Vector3());
  const imageAspect = sceneRuntime.backdrop.userData.imageAspect ?? 16 / 9;
  const distance = sceneTune.backdropDistance ?? defaultBackdropDistance(environmentBox);
  const scale = sceneTune.backdropScale ?? defaultBackdropScale(environmentBox, distance);
  const dimensions = computeBackdropDimensions(environmentBox, imageAspect, distance, scale);

  // Rebuild only on a real size change. On the node backends the retired
  // geometry is NOT disposed: disposing it tears down the mesh's object
  // uniform buffer while queued submits still reference it (WebGPU
  // validation error); a few small plane geometries per HUD edit leak
  // instead. Classic GL keeps the original dispose.
  const currentParams = sceneRuntime.backdrop.geometry?.parameters;
  if (currentParams?.width !== dimensions.width || currentParams?.height !== dimensions.height) {
    const retiredGeometry = sceneRuntime.backdrop.geometry;
    sceneRuntime.backdrop.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
    if (!renderer.isWebGPURenderer) retiredGeometry.dispose();
  }
  sceneRuntime.backdrop.position.set(
    center.x,
    sceneRuntime.backdrop.userData.verticalOffset !== null
      ? center.y + sceneRuntime.backdrop.userData.verticalOffset
      : environmentBox.min.y + size.y * 0.57,
    environmentBox.min.z - distance,
  );
  document.body.dataset.environmentBackdropDistance = String(distance);
  document.body.dataset.environmentBackdropScale = String(scale);
}

function setBackdropDistanceFromHud(distance) {
  sceneTune.backdropDistance = Math.max(0.1, distance);
  applyBackdropHudTransform();
  setHudRangeValue('backdropDistance', sceneTune.backdropDistance, (value) => value.toFixed(1));
}

function refreshSceneHudControls() {
  const hasEnvironment = Boolean(sceneRuntime.environmentBox);
  const hasModel = Boolean(sceneRuntime.modelRoot);
  const hasBackdrop = Boolean(sceneRuntime.backdrop);
  const hasSun = Boolean(sceneRuntime.sunLight);

  updatePostProcessingHudControls();
  buildToonSettingsPanel();
  buildEnvironmentSettingsPanel();
  updateCharacterAssetHudControls();
  updateEnvironmentAssetHudControls();
  setHudSelectDisabled('toonPreset', SHADER_MODE !== 'anime');
  setHudRangeDisabled('ceilingLightStrength', !ceilingLightRig || !CEILING_LIGHT_SUPPORTED);
  setHudRangeDisabled('sunIntensity', !hasSun);
  setHudRangeDisabled('timeOfDay', !hasSun && !hasBackdrop);
  setHudRangeDisabled('roomYaw', !hasSun);
  setHudRangeDisabled('modelSize', !hasModel);
  setHudRangeDisabled('modelX', !hasModel || !hasEnvironment);
  setHudRangeDisabled('modelDepth', !hasModel || !hasEnvironment);
  setHudRangeDisabled('modelTurn', !hasModel);
  setHudRangeDisabled('modelLift', !hasModel || !hasEnvironment);
  setHudRangeDisabled('backdropDistance', !hasBackdrop);

  updateToonPresetHudControls();
  setHudRangeValue('ceilingLightStrength', sceneTune.ceilingLightStrength, (value) => `${value.toFixed(2)}x`);
  setHudSelectValue('toonDebug', toonDebugMode.name, toonDebugMode.label);
  setHudRangeValue('sunIntensity', sceneTune.sunIntensity, (value) => value.toFixed(2));
  setHudRangeValue('timeOfDay', sceneTune.timeOfDay, formatTimeOfDay);
  setHudRangeValue('roomYaw', sceneTune.roomYaw, (value) => `${Math.round(value)} deg`);
  setHudRangeValue('modelSize', sceneTune.modelSize, (value) => value.toFixed(2));
  setHudRangeValue('modelLift', sceneTune.modelGroundClearance, (value) => value.toFixed(3));
  setHudRangeValue('modelDepth', sceneTune.modelZRatio, (value) => value.toFixed(2));
  setHudRangeValue('modelTurn', sceneTune.modelTurn, (value) => `${Math.round(value)} deg`);

  if (hasEnvironment) {
    const box = sceneRuntime.environmentBox;
    const size = box.getSize(new THREE.Vector3());
    const xMin = box.min.x + size.x * 0.12;
    const xMax = box.max.x - size.x * 0.12;
    const xValue = sceneTune.modelX ?? box.getCenter(new THREE.Vector3()).x;
    setHudRangeLimits('modelX', { min: xMin, max: xMax, step: 0.01, value: xValue });
    setHudRangeValue('modelX', xValue, (value) => value.toFixed(2));

    const backdropMin = Math.max(2, size.z * 0.65);
    const backdropMax = Math.max(30, size.z * 7.5);
    const backdropValue = sceneTune.backdropDistance ?? defaultBackdropDistance(box);
    setHudRangeLimits('backdropDistance', {
      min: backdropMin,
      max: backdropMax,
      step: 0.1,
      value: backdropValue,
    });
    setHudRangeValue('backdropDistance', backdropValue, (value) => value.toFixed(1));
  }

  refreshToonSettingControls();
  refreshEnvironmentSettingControls();
}

function initializeSceneHudControls() {
  initializeHudTabs(INITIAL_HUD_TAB);
  populateToonPresetSelect();
  fillToonDebugSelect(document.getElementById('toonDebug'));
  populateCharacterAssetSelect();
  populateEnvironmentAssetSelect();
  buildToonSettingsPanel();
  buildEnvironmentSettingsPanel();
  bindHudSelect('characterAsset', setCharacterAssetFromHud);
  bindHudSelect('environmentAsset', setEnvironmentAssetFromHud);
  bindHudSelect('toonPreset', setToonPresetFromHud);
  bindHudSelect('toonDebug', setToonDebugMode);
  bindHudSelect('postPreset', setPostProcessingPreset);
  bindHudCheckbox('postBloom', (enabled) => setPostProcessingFeature('bloom', enabled));
  bindHudCheckbox('postGrade', (enabled) => setPostProcessingFeature('colorGrade', enabled));
  bindHudCheckbox('postVignette', (enabled) => setPostProcessingFeature('vignette', enabled));
  bindHudCheckbox('postOutline', (enabled) => setPostProcessingFeature('screenOutline', enabled));
  bindHudCheckbox('postDepth', (enabled) => setPostProcessingFeature('depthCue', enabled));
  bindHudRange('postStrength', (value) => setPostProcessingParameter('strength', value), (value) => value.toFixed(2));
  bindHudRange('postBloomStrength', (value) => setPostProcessingParameter('bloomStrength', value), (value) => value.toFixed(2));
  bindHudRange('postExposure', (value) => setPostProcessingParameter('exposure', value), (value) => value.toFixed(2));
  bindHudRange('postContrast', (value) => setPostProcessingParameter('contrast', value), (value) => value.toFixed(2));
  bindHudRange(
    'postVignetteStrength',
    (value) => setPostProcessingParameter('vignetteStrength', value),
    (value) => value.toFixed(2),
  );
  bindHudRange('ceilingLightStrength', setCeilingLightStrength, (value) => `${value.toFixed(2)}x`);
  bindHudRange('sunIntensity', setSunIntensity, (value) => value.toFixed(2));
  bindHudRange('timeOfDay', setTimeOfDayFromHud, formatTimeOfDay);
  bindHudRange('roomYaw', setRoomYawFromHud, (value) => `${Math.round(value)} deg`);
  bindHudRange('modelSize', setModelSizeFromHud, (value) => value.toFixed(2));
  bindHudRange('modelX', setModelXFromHud, (value) => value.toFixed(2));
  bindHudRange('modelDepth', setModelDepthFromHud, (value) => value.toFixed(2));
  bindHudRange('modelTurn', setModelTurnFromHud, (value) => `${Math.round(value)} deg`);
  bindHudRange('modelLift', setModelLiftFromHud, (value) => value.toFixed(3));
  bindHudRange('backdropDistance', setBackdropDistanceFromHud, (value) => value.toFixed(1));
  document.getElementById('toonPresetSave')?.addEventListener('click', saveToonPresetFromHud);
  document.getElementById('toonPresetReset')?.addEventListener('click', resetToonPresetDraftFromHud);
  document.getElementById('toonPresetExport')?.addEventListener('click', exportToonPresetFromHud);
  document.getElementById('toonPresetImport')?.addEventListener('click', importToonPresetFromHud);
  refreshSceneHudControls();
}

document.body.dataset.modelReady = 'false';
document.body.dataset.environmentReady = ENVIRONMENT_URL ? 'false' : 'none';
document.body.dataset.environmentAoOverlayCount = '0';
document.body.dataset.environmentBackdropReady = ENVIRONMENT_BACKDROP_URL ? 'false' : 'none';
document.body.dataset.environmentOpenWindowCount = '0';
document.body.dataset.environmentShadowMeshCount = '0';
document.body.dataset.environmentSunReady = ENABLE_ENVIRONMENT_SUN ? 'false' : 'none';
document.body.dataset.environmentCelestialKind = ENABLE_ENVIRONMENT_SUN ? 'loading' : 'none';
document.body.dataset.environmentRoomYaw = String(sceneTune.roomYaw);
document.body.dataset.environmentTimeOfDay = formatTimeOfDay(sceneTune.timeOfDay);
document.body.dataset.ambientLightCount = '0';
document.body.dataset.environmentCeilingLight = CEILING_LIGHT_SUPPORTED
  ? (ceilingLightEnabled ? 'loading' : 'off')
  : 'none';
document.body.dataset.directionalLightCount = '0';
document.body.dataset.hemisphereLightCount = '0';
document.body.dataset.pointLightCount = '0';
document.body.dataset.spotLightCount = '0';
document.body.dataset.totalLightCount = '0';
document.body.dataset.animationMode = ANIMATION_MODE;
document.body.dataset.animationReady = ANIMATION_REQUESTED ? 'false' : 'none';
document.body.dataset.animationPlayback = animationPlaybackEnabled ? 'on' : 'off';
updateAnimationToggleButton();
updateCeilingLightToggleButton();
initializeSceneHudControls();

// ---- Lights ----
if (!ENABLE_ENVIRONMENT_SUN) {
  const sun = new THREE.DirectionalLight(0xfff1de, 1.18);
  sun.position.set(1.8, 3.8, 3.4);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xa8b7d4, 0.42));
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x25202e, 0.26));
  updateSceneLightCounts();
}

// ---- Ground ----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.visible = !ENVIRONMENT_URL;
ground.receiveShadow = true;
scene.add(ground);

function fitModelToStage(root, { targetSize = 2.4, updateControlsTarget = true } = {}) {
  const box = computeModelBounds(root);
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  const referenceSize = Math.max(size.x, size.y, size.z);
  if (referenceSize > 0) {
    root.scale.multiplyScalar(targetSize / referenceSize);
  }

  root.updateMatrixWorld(true);
  const fittedBox = computeModelBounds(root);
  if (!fittedBox) return null;

  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fittedBox.min.y;
  root.updateMatrixWorld(true);

  const finalBox = computeModelBounds(root);
  writeModelBoundsDataset(finalBox);
  if (finalBox && updateControlsTarget) {
    const finalSize = finalBox.getSize(new THREE.Vector3());
    controls.target.set(0, Math.max(0.75, Math.min(1.35, finalBox.min.y + finalSize.y * 0.55)), 0);
  }

  return finalBox;
}

function modelGroundClearanceForEnvironment(environmentBox) {
  return Number.isFinite(sceneTune.modelGroundClearance) ? sceneTune.modelGroundClearance : 0;
}

function frameEnvironment(box) {
  if (!box) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const safeDepth = Math.max(size.z, 0.001);

  if (ENVIRONMENT_VIEW === 'exterior') {
    const targetY = Math.max(0.9, center.y + size.y * 0.05);
    controls.target.set(center.x, targetY, center.z);
    camera.position.set(center.x, targetY + Math.max(1.0, size.y * 0.22), center.z + Math.max(5.2, size.z * 1.35));
    camera.fov = 35;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
    return;
  }

  const edgePadding = Math.min(0.45, safeDepth * 0.12);
  const cameraZ = clampInside(
    center.z + Math.max(0.35, safeDepth * 0.08),
    box.min.z + edgePadding,
    box.max.z - edgePadding,
  );
  const targetZ = clampInside(
    center.z - Math.max(1.2, safeDepth * 0.34),
    box.min.z + edgePadding,
    box.max.z - edgePadding,
  );
  const eyeY = clampInside(
    box.min.y + Math.min(Math.max(size.y * 0.38, 1.25), 2.1),
    box.min.y + 0.85,
    box.max.y - 0.35,
  );
  const targetY = clampInside(
    eyeY - 0.15,
    box.min.y + 0.7,
    box.max.y - 0.5,
  );

  controls.target.set(center.x, targetY, targetZ);
  camera.position.set(center.x, eyeY, cameraZ);
  camera.fov = window.innerWidth < 700 ? 52 : 46;
  camera.near = 0.02;
  camera.far = 200;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.minDistance = 0.2;
  controls.maxDistance = Math.max(10, Math.max(size.x, size.y, size.z) * 2.5);
  controls.update();
}

function positionModelInEnvironment(root, environmentState) {
  const environmentBox = environmentState?.box || environmentState?.environmentBox || environmentState;
  const environmentRoot = environmentState?.root || environmentState?.environmentRoot || null;
  if (!root || !environmentBox) return computeModelBounds(root);

  const modelBox = computeModelBounds(root);
  if (!modelBox) return null;

  const environmentCenter = environmentBox.getCenter(new THREE.Vector3());
  const environmentSize = environmentBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const requestedX = sceneTune.modelX;
  const requestedZ = sceneTune.modelZ;
  const modelZRatio = THREE.MathUtils.clamp(sceneTune.modelZRatio, 0.08, 0.9);
  const groundClearance = modelGroundClearanceForEnvironment(environmentBox);
  const targetX = requestedX !== null ? requestedX : environmentCenter.x;
  const targetZ = requestedZ !== null
    ? requestedZ
    : environmentBox.min.z + environmentSize.z * modelZRatio;
  const floorY = findEnvironmentFloorYAt(environmentRoot, environmentBox, targetX, targetZ)
    ?? environmentBox.min.y;

  root.position.x += targetX - modelCenter.x;
  root.position.z += targetZ - modelCenter.z;
  root.position.y += floorY + groundClearance - modelBox.min.y;
  root.updateMatrixWorld(true);

  const positionedBox = computeModelBounds(root);
  sceneTune.modelX = targetX;
  sceneTune.modelZRatio = THREE.MathUtils.clamp((targetZ - environmentBox.min.z) / Math.max(environmentSize.z, 0.001), 0.08, 0.9);
  document.body.dataset.modelGroundClearance = String(groundClearance);
  document.body.dataset.modelGroundY = String(floorY);
  document.body.dataset.modelTargetX = String(targetX);
  document.body.dataset.modelTargetZ = String(targetZ);
  document.body.dataset.modelZRatio = String(sceneTune.modelZRatio);
  writeModelBoundsDataset(positionedBox);
  return positionedBox;
}

function frameModelInEnvironment(modelBox, environmentBox) {
  if (!modelBox || !environmentBox) return;

  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const environmentSize = environmentBox.getSize(new THREE.Vector3());
  const environmentPadding = Math.min(0.5, Math.max(environmentSize.z * 0.08, 0.25));
  const targetY = clampInside(
    modelBox.min.y + modelSize.y * 0.5,
    environmentBox.min.y + 0.65,
    environmentBox.max.y - 0.35,
  );
  const cameraDistance = Math.max(2.55, modelSize.y * 2.05);
  const cameraZ = clampInside(
    modelCenter.z + cameraDistance,
    environmentBox.min.z + environmentPadding,
    environmentBox.max.z - environmentPadding,
  );

  controls.target.set(modelCenter.x, targetY, modelCenter.z);
  camera.position.set(modelCenter.x, targetY + modelSize.y * 0.06, cameraZ);
  camera.fov = window.innerWidth < 700 ? 54 : 46;
  camera.near = 0.02;
  camera.far = 200;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.minDistance = Math.max(0.3, modelSize.y * 0.35);
  controls.maxDistance = Math.max(10, Math.max(environmentSize.x, environmentSize.y, environmentSize.z) * 2.5);
  controls.update();
}

function applyCaptureView(modelBox) {
  if (!CAPTURE_VIEW || CAPTURE_VIEW === 'environment' || !modelBox) return;

  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const faceView = CAPTURE_VIEW === 'face';
  const targetY = modelBox.min.y + modelSize.y * (faceView ? 0.65 : 0.52);
  const distance = faceView
    ? Math.max(0.9, modelSize.y * 1.05)
    : Math.max(2.75, modelSize.y * 1.78);

  controls.target.set(modelCenter.x, targetY, modelCenter.z);
  camera.position.set(
    modelCenter.x,
    targetY + modelSize.y * (faceView ? 0.015 : 0.08),
    modelCenter.z + distance,
  );
  camera.fov = faceView ? 36 : 35;
  camera.near = 0.02;
  camera.far = 200;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.minDistance = Math.max(0.18, modelSize.y * (faceView ? 0.12 : 0.32));
  controls.maxDistance = Math.max(10, modelSize.y * 4.0);
  controls.update();
  document.body.dataset.captureView = CAPTURE_VIEW;
}

async function createEnvironmentBackdrop(environmentBox) {
  if (!ENVIRONMENT_BACKDROP_URL || !environmentBox) return null;

  const initialBackdropUrl = backdropUrlForTime(sceneTune.timeOfDay);
  const texture = await loadEnvironmentBackdropTexture(initialBackdropUrl);

  const size = environmentBox.getSize(new THREE.Vector3());
  const center = environmentBox.getCenter(new THREE.Vector3());
  const imageAspect = texture.image?.width && texture.image?.height
    ? texture.image.width / texture.image.height
    : 16 / 9;
  const backdropDistance = sceneTune.backdropDistance ?? defaultBackdropDistance(environmentBox);
  const backdropScale = sceneTune.backdropScale ?? defaultBackdropScale(environmentBox, backdropDistance);
  const { height, width } = computeBackdropDimensions(environmentBox, imageAspect, backdropDistance, backdropScale);
  const verticalOffset = optionalNumberParam('envBackdropY');
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );

  sceneTune.backdropDistance = backdropDistance;
  sceneTune.backdropScale = backdropScale;
  plane.name = 'Environment window backdrop';
  plane.userData.isEnvironmentBackdrop = true;
  plane.userData.imageAspect = imageAspect;
  plane.userData.currentBackdropUrl = initialBackdropUrl;
  plane.userData.verticalOffset = verticalOffset;
  plane.position.set(
    center.x,
    verticalOffset !== null ? center.y + verticalOffset : environmentBox.min.y + size.y * 0.57,
    environmentBox.min.z - backdropDistance,
  );
  plane.renderOrder = -10;
  plane.frustumCulled = false;
  scene.add(plane);

  document.body.dataset.environmentBackdropReady = 'true';
  document.body.dataset.environmentBackdropPeriod = backdropPeriodForTime(sceneTune.timeOfDay);
  document.body.dataset.environmentBackdropUrl = initialBackdropUrl;
  document.body.dataset.environmentBackdropDistance = String(backdropDistance);
  document.body.dataset.environmentBackdropScale = String(backdropScale);
  sceneRuntime.backdrop = plane;
  return plane;
}

async function loadEnvironmentBackdropTexture(url) {
  if (!url) return null;
  if (!backdropTextureCache.has(url)) {
    backdropTextureCache.set(url, backdropTextureLoader.loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      // WebGLRenderer exposes capabilities.getMaxAnisotropy(); WebGPURenderer
      // exposes getMaxAnisotropy() on the renderer itself.
      texture.anisotropy = renderer.capabilities?.getMaxAnisotropy?.() ??
        renderer.getMaxAnisotropy?.() ?? 1;
      return texture;
    }));
  }
  return backdropTextureCache.get(url);
}

async function applyEnvironmentBackdropForTime() {
  if (!sceneRuntime.backdrop || !sceneRuntime.environmentBox) return;

  const backdropUrl = backdropUrlForTime(sceneTune.timeOfDay);
  if (!backdropUrl || backdropUrl === sceneRuntime.backdrop.userData.currentBackdropUrl) {
    document.body.dataset.environmentBackdropPeriod = backdropPeriodForTime(sceneTune.timeOfDay);
    return;
  }

  const requestId = (sceneRuntime.backdrop.userData.backdropRequestId ?? 0) + 1;
  sceneRuntime.backdrop.userData.backdropRequestId = requestId;
  document.body.dataset.environmentBackdropReady = 'loading';

  try {
    const texture = await loadEnvironmentBackdropTexture(backdropUrl);
    if (!texture || sceneRuntime.backdrop.userData.backdropRequestId !== requestId) return;

    sceneRuntime.backdrop.material.map = texture;
    sceneRuntime.backdrop.material.needsUpdate = true;
    sceneRuntime.backdrop.userData.currentBackdropUrl = backdropUrl;
    sceneRuntime.backdrop.userData.imageAspect = texture.image?.width && texture.image?.height
      ? texture.image.width / texture.image.height
      : sceneRuntime.backdrop.userData.imageAspect;
    applyBackdropHudTransform();
    document.body.dataset.environmentBackdropReady = 'true';
    document.body.dataset.environmentBackdropPeriod = backdropPeriodForTime(sceneTune.timeOfDay);
    document.body.dataset.environmentBackdropUrl = backdropUrl;
  } catch (error) {
    document.body.dataset.environmentBackdropReady = 'error';
    console.warn(`Failed to load timed backdrop "${backdropUrl}":`, error);
  }
}

function addEnvironmentCeilingLight(environmentBox, environmentRoot = null) {
  if (!CEILING_LIGHT_SUPPORTED || !environmentBox) return null;

  const size = environmentBox.getSize(new THREE.Vector3());
  const lightIntensity = numberParam('envCeilingLightIntensity', DEFAULT_ENVIRONMENT_CEILING_LIGHT_INTENSITY);
  const lightDistance = Number(URL_PARAMS.get('envCeilingLightDistance')) || null;
  const spotShadows = URL_PARAMS.has('envCeilingSpotShadow')
    ? booleanParam('envCeilingSpotShadow')
    : Boolean(ENVIRONMENT_PRESET.rig.spotShadows);

  // The lamp rig itself lives in environmentRigs.js so library users get the
  // same fixture detection, shadowed downlights, and glow spheres. The demo
  // keeps its Liyue fixture pattern and URL-param tuning.
  const rig = createEnvironmentLampRig({
    scene,
    environmentBox,
    root: environmentRoot,
    detectPattern: /^Indoor_Ly_Light_Common_07_Lod0/,
    intensity: lightIntensity,
    distance: lightDistance,
    spot: {
      intensityScale: numberParam('envCeilingSpotIntensity', lightIntensity * 1.45) / Math.max(lightIntensity, 0.001),
      distance: Number(URL_PARAMS.get('envCeilingSpotDistance')) || null,
      angle: numberParam('envCeilingSpotAngle', 0.74),
      penumbra: numberParam('envCeilingSpotPenumbra', 0.82),
      castShadow: spotShadows,
      shadowMapSize: numberParam('envCeilingSpotShadowMapSize', 1024),
    },
    glow: {
      sizeRatio: Number(URL_PARAMS.get('envCeilingLightGlowSize')) || 0.025,
      opacity: Number(URL_PARAMS.get('envCeilingLightGlowOpacity')) || 0.12,
    },
    fallback: {
      xOffsetRatio: Number(URL_PARAMS.get('envCeilingLightXOffset')) || 0.28,
      zOffsetRatio: Number(URL_PARAMS.get('envCeilingLightZ')) || 0.03,
      heightRatio: Number(URL_PARAMS.get('envCeilingLightHeight')) || 0.14,
    },
  });
  if (!rig) return null;
  void size;

  if (Number.isFinite(ENVIRONMENT_PRESET.rig.lampIntensity)) {
    rig.setIntensity(ENVIRONMENT_PRESET.rig.lampIntensity);
  }

  ceilingLightRig = rig.group;
  sceneRuntime.lampRig = rig;
  document.body.dataset.environmentCeilingSpotLightCount = String(rig.lamps.length);
  document.body.dataset.environmentCeilingSpotShadow = String(spotShadows);
  setCeilingLightEnabled(ceilingLightEnabled);
  refreshSceneHudControls();
  return rig.group;
}

function addEnvironmentSun(environmentBox) {
  if (!ENABLE_ENVIRONMENT_SUN || !environmentBox) return null;

  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  const skyState = resolveCelestialState(sceneTune.timeOfDay, sceneTune.roomYaw, sceneTune.sunIntensity);
  const shadowExtent = Math.max(size.x, size.z) * numberParam('envSunShadowExtent', 0.78);
  const outsideSun = new THREE.DirectionalLight(skyState.color, skyState.intensity);
  outsideSun.name = 'Environment outside sky key';
  outsideSun.castShadow = true;
  outsideSun.shadow.mapSize.set(4096, 4096);
  outsideSun.shadow.bias = numberParam('envSunShadowBias', -0.00004);
  outsideSun.shadow.normalBias = numberParam('envSunShadowNormalBias', 0.004);
  outsideSun.shadow.radius = numberParam('envSunShadowRadius', 2.0);
  outsideSun.shadow.camera.near = 0.1;
  outsideSun.shadow.camera.far = size.length() * 3.2;
  outsideSun.shadow.camera.left = -shadowExtent;
  outsideSun.shadow.camera.right = shadowExtent;
  outsideSun.shadow.camera.top = shadowExtent;
  outsideSun.shadow.camera.bottom = -shadowExtent;
  outsideSun.position.copy(environmentRelativePoint(environmentBox, skyState.source));
  outsideSun.target.position.copy(environmentRelativePoint(environmentBox, skyState.target));
  outsideSun.shadow.camera.updateProjectionMatrix();
  scene.add(outsideSun.target);
  scene.add(outsideSun);
  sceneRuntime.sunLight = outsideSun;
  document.body.dataset.environmentSunPosition = outsideSun.position.toArray().join(',');
  document.body.dataset.environmentSunTarget = outsideSun.target.position.toArray().join(',');
  document.body.dataset.environmentSunIntensity = String(outsideSun.intensity);
  document.body.dataset.environmentSunMaxIntensity = String(sceneTune.sunIntensity);
  updateSceneLightCounts();

  const sunDiskSize = size.y * (Number(URL_PARAMS.get('envSunDiskSize')) || 0.22);
  const sunDisk = new THREE.Mesh(
    new THREE.PlaneGeometry(sunDiskSize, sunDiskSize),
    createSunDiskMaterial(),
  );
  sunDisk.name = 'Environment visible outside sun';
  sunDisk.renderOrder = -8;
  sunDisk.frustumCulled = false;
  scene.add(sunDisk);

  const spillWidth = size.x * (Number(URL_PARAMS.get('envSunSpillWidth')) || 0.5);
  const spillDepth = size.z * (Number(URL_PARAMS.get('envSunSpillDepth')) || 0.48);
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(spillWidth, spillDepth),
    createSunSpillMaterial(),
  );
  spill.name = 'Environment outside sun floor spill';
  spill.rotation.x = -Math.PI / 2;
  spill.rotation.z = -0.08;
  spill.position.set(
    center.x,
    environmentBox.min.y + 0.018,
    environmentBox.min.z + size.z * 0.38,
  );
  spill.renderOrder = 12;
  spill.frustumCulled = false;
  scene.add(spill);

  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 0.38, size.z * 0.72),
    createSunBeamMaterial(),
  );
  beam.name = 'Environment angled outside sun beam';
  beam.rotation.x = -Math.PI / 2;
  beam.rotation.z = -0.34;
  beam.position.set(
    center.x - size.x * 0.08,
    environmentBox.min.y + 0.028,
    environmentBox.min.z + size.z * 0.35,
  );
  beam.renderOrder = 11;
  beam.frustumCulled = false;
  scene.add(beam);

  const shaft = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 0.92, size.y * 0.7),
    createSunShaftMaterial(),
  );
  shaft.name = 'Environment outside sun shaft';
  shaft.position.set(
    center.x,
    environmentBox.min.y + size.y * 0.5,
    environmentBox.min.z + size.z * 0.22,
  );
  shaft.renderOrder = 9;
  shaft.frustumCulled = false;
  scene.add(shaft);

  document.body.dataset.environmentSunReady = 'true';
  sceneRuntime.sunRig = {
    beam,
    light: outsideSun,
    sunDisk,
    shaft,
    spill,
  };
  applyEnvironmentSkyState({ updateBackdrop: true });
  return sceneRuntime.sunRig;
}

function playNativeAnimation(root, clips) {
  if (!clips.length) {
    setAnimationReady('none');
    console.warn(`No native clips found on ${MODEL_URL}.`);
    return false;
  }

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clips[0]);
  animationMixers.push(mixer);
  registerAnimationAction(action);
  console.log(`Native animation loaded: ${clips[0].name || 'clip 0'} (${clips[0].tracks.length} tracks)`);
  return true;
}

async function loadBoxingAnimation(targetMesh) {
  const loader = new FBXLoader();
  const fbx = await new Promise((resolve, reject) => {
    loader.load('assets-local/animations/Boxing.fbx', resolve, undefined, reject);
  });

  const sourceClip = fbx.animations[0];
  const sourceBones = collectBones(fbx);
  if (!sourceClip || sourceBones.length === 0) {
    throw new Error('Boxing.fbx has no usable skeleton animation.');
  }

  targetMesh.skeleton.pose();
  targetMesh.updateMatrixWorld(true);
  fbx.updateMatrixWorld(true);

  const boxingClip = createBoxingClipForTarget(targetMesh, sourceClip, sourceBones);
  if (boxingClip.tracks.length === 0) {
    throw new Error('Boxing.fbx did not retarget to any compatible target bones.');
  }

  const mixer = new THREE.AnimationMixer(targetMesh);
  const action = mixer.clipAction(boxingClip);
  animationMixers.push(mixer);
  registerAnimationAction(action);
  console.log(`Boxing animation retargeted (${RETARGET_MODE}): ${sourceClip.tracks.length} source tracks -> ${boxingClip.tracks.length} target tracks`);
}

async function setupRequestedAnimation(asset, toonState) {
  if (!ANIMATION_REQUESTED) {
    setAnimationReady('none');
    return;
  }

  try {
    if (ANIMATION_MODE === 'native') {
      playNativeAnimation(asset.root, asset.clips);
      return;
    }

    if (ANIMATION_MODE === 'boxing') {
      const targetMesh = toonState.primarySkinnedMesh || findPrimarySkinnedMesh(asset.root);
      if (!targetMesh) {
        throw new Error('No skinned mesh was found for Boxing.fbx retargeting.');
      }

      await loadBoxingAnimation(targetMesh);
      return;
    }

    setAnimationReady('none');
  } catch (error) {
    setAnimationReady('error');
    console.warn(`Failed to start ${ANIMATION_MODE} animation for ${MODEL_URL || 'scene'}:`, error);
  }
}

async function loadEnvironment() {
  if (!ENVIRONMENT_URL) {
    return {
      convertedMeshCount: 0,
      root: null,
    };
  }

  const asset = await loadModelAsset(ENVIRONMENT_URL, { renderer });
  document.body.dataset.environmentUrl = ENVIRONMENT_URL;
  document.body.dataset.environmentFormat = asset.format;

  await waitForObjectTextures(asset.root);
  setObjectTextureColorSpaces(asset.root);

  const fittedBox = FIT_MODEL_TO_STAGE
    ? fitModelToStage(asset.root, {
      targetSize: Number(URL_PARAMS.get('envSize')) || 7.2,
      updateControlsTarget: false,
    })
    : computeModelBounds(asset.root);
  sceneRuntime.environmentBox = fittedBox;
  sceneRuntime.environmentRoot = asset.root;
  refreshSceneHudControls();
  await createEnvironmentBackdrop(fittedBox);
  addEnvironmentSun(fittedBox);
  addEnvironmentCeilingLight(fittedBox, asset.root);

  const wantsFloorReflection = URL_PARAMS.has('envFloorReflection')
    ? booleanParam('envFloorReflection')
    : Boolean(ENVIRONMENT_PRESET.rig.planarReflection);
  const roleOverrides = wantsFloorReflection
    ? [{ match: 'floor', role: 'glossFloor' }]
    : null;

  const environmentState = await applyEnvironmentShader(asset.root, {
    bakeVertexAo: URL_PARAMS.has('envVertexAoBake')
      ? booleanParam('envVertexAoBake')
      : (ENVIRONMENT_PRESET.rig.bakeVertexAo ?? 'auto'),
    debugOutputMode: ENVIRONMENT_DEBUG_MODE,
    environmentBox: fittedBox,
    hasSun: ENABLE_ENVIRONMENT_SUN,
    roleOverrides,
    settings: environmentSettingsDraft,
    shaderMode: ENVIRONMENT_SHADER_MODE,
    openWindows: OPEN_ENVIRONMENT_WINDOWS,
  });
  document.body.dataset.environmentAoOverlayCount = String(environmentState.aoOverlayMeshCount ?? 0);
  document.body.dataset.environmentMeshCount = String(environmentState.convertedMeshCount);
  document.body.dataset.environmentOpenWindowCount = String(environmentState.windowCutoutMaterialCount ?? 0);
  document.body.dataset.environmentShadowMeshCount = String(environmentState.shadowMeshCount ?? 0);
  document.body.dataset.environmentVertexAoMeshCount = String(environmentState.vertexAoMeshCount ?? 0);

  if (environmentState.convertedMeshCount === 0) {
    throw new Error(`${ENVIRONMENT_URL} loaded but did not contain any renderable environment meshes.`);
  }

  scene.add(asset.root);
  document.body.dataset.environmentReady = 'true';
  refreshSceneHudControls();

  // Interior openings feed the generalized interior-occlusion term. The
  // default registers the backdrop-facing window wall; inert until an
  // interiorOcclusionStrength above 0 is set (preset or HUD).
  {
    const center = fittedBox.getCenter(new THREE.Vector3());
    const size = fittedBox.getSize(new THREE.Vector3());
    setEnvironmentOpenings([{
      position: new THREE.Vector3(center.x + size.x * 0.1, center.y + size.y * 0.15, fittedBox.min.z),
      radius: Math.max(size.x, size.y) * 0.55,
    }]);
  }

  // Glossy-floor planar reflection pass (preset or ?envFloorReflection=1).
  if (wantsFloorReflection) {
    sceneRuntime.floorReflection = createEnvironmentPlanarReflection({
      renderer,
      scene,
      camera,
      floorY: fittedBox.min.y + 0.01,
    });
  }

  // Drifting dust motes in the sunlit half of the room.
  const wantsDustMotes = URL_PARAMS.has('envDustMotes')
    ? booleanParam('envDustMotes')
    : Boolean(ENVIRONMENT_PRESET.rig.dustMotes);
  if (wantsDustMotes) {
    const center = fittedBox.getCenter(new THREE.Vector3());
    const size = fittedBox.getSize(new THREE.Vector3());
    const moteBounds = new THREE.Box3(
      new THREE.Vector3(center.x - size.x * 0.32, fittedBox.min.y + size.y * 0.12, fittedBox.min.z + size.z * 0.08),
      new THREE.Vector3(center.x + size.x * 0.32, fittedBox.min.y + size.y * 0.78, center.z),
    );
    sceneRuntime.dustMotes = createEnvironmentDustMotes({ scene, bounds: moteBounds });
  }

  // One-shot ambient probe: samples the lit room so ambient color follows the
  // room's own palette (ambientProbeBlend controls how much).
  const wantsProbe = URL_PARAMS.has('envProbe')
    ? booleanParam('envProbe')
    : Boolean(ENVIRONMENT_PRESET.rig.probe);
  if (wantsProbe) {
    const center = fittedBox.getCenter(new THREE.Vector3());
    const size = fittedBox.getSize(new THREE.Vector3());
    const probePosition = new THREE.Vector3(center.x, fittedBox.min.y + size.y * 0.45, center.z);
    // The capture harness waits on this flag: the node backends resolve the
    // probe via an async readback, and a capture racing it catches the
    // pre-probe ambient tint (classic resolves synchronously).
    sceneRuntime.refreshAmbientProbe = () => {
      document.body.dataset.environmentProbeReady = 'false';
      return Promise.resolve(captureEnvironmentAmbientProbe({
        renderer,
        scene,
        position: probePosition,
      })).finally(() => {
        document.body.dataset.environmentProbeReady = 'true';
      });
    };
    sceneRuntime.refreshAmbientProbe();
  }
  console.log(`${modelLabelFromUrl(ENVIRONMENT_URL)} environment loaded (${asset.format}, ${environmentState.convertedMeshCount} mesh roots converted, ${environmentState.windowCutoutMaterialCount ?? 0} window materials opened, ${environmentState.shadowMeshCount ?? 0} shadow meshes softened, ${environmentState.aoOverlayMeshCount ?? 0} AO overlays converted)`);

  if (MODEL_URLS.length === 0) frameEnvironment(fittedBox);

  return {
    ...environmentState,
    box: fittedBox,
    root: asset.root,
  };
}

async function loadSceneModels() {
  if (MODEL_URLS.length === 0) {
    return {
      clips: [],
      convertedMeshCount: 0,
      primarySkinnedMesh: null,
      root: null,
    };
  }

  const assets = await Promise.all(MODEL_URLS.map((url) => loadModelAsset(url, {
    materialUrl: MODEL_URLS.length === 1 ? OBJ_MATERIAL_URL : null,
    renderer,
  })));
  const root = new THREE.Group();
  root.name = MODEL_URLS.length === 1 ? modelLabelFromUrl(MODEL_URL) : 'Loaded model set';

  for (const asset of assets) root.add(asset.root);
  root.rotation.y = THREE.MathUtils.degToRad(sceneTune.modelTurn);
  root.updateMatrixWorld(true);

  document.body.dataset.modelFormat = assets.map((asset) => asset.format).join(',');
  document.body.dataset.modelUrl = MODEL_URLS.join(',');

  await Promise.all(assets.map((asset) => waitForObjectTextures(asset.root)));
  setObjectTextureColorSpaces(root);

  const fittedBox = FIT_MODEL_TO_STAGE
    ? fitModelToStage(root, {
      targetSize: sceneTune.modelSize,
      updateControlsTarget: !ENVIRONMENT_URL,
    })
    : computeModelBounds(root);

  const toonState = applyToonShader(root, {
    debugOutputMode: toonDebugMode.name,
    settings: toonSettings,
    shaderMode: SHADER_MODE,
  });
  toonSettings = toonState.settings;
  document.body.dataset.toonPreset = toonSettings.preset;
  document.body.dataset.toonPresetLabel = toonSettings.presetLabel;
  document.body.dataset.convertedMeshCount = String(toonState.convertedMeshCount);
  document.body.dataset.toonDebugMode = toonState.debugOutputMode.name;
  document.body.dataset.toonDebugValue = String(toonState.debugOutputMode.value);
  document.body.dataset.materialRoleSummary = JSON.stringify(toonState.materialRoleSummary || {});
  window.__TOON_MATERIAL_ROLE_SUMMARY = toonState.materialRoleSummary || {};

  if (toonState.convertedMeshCount === 0) {
    throw new Error(`${MODEL_URLS.join(', ')} loaded but did not contain any renderable meshes.`);
  }

  scene.add(root);
  sceneRuntime.modelRoot = root;
  sceneRuntime.modelBox = fittedBox;
  const registeredPasses = characterRenderPasses.registerCharacterRoot(root);
  document.body.dataset.characterPassesRegistered = registeredPasses ? 'true' : 'false';
  document.body.dataset.characterHeadTracked = registeredPasses?.headTracker ? 'true' : 'false';
  refreshSceneHudControls();
  console.log(`${MODEL_URLS.length} model file(s) loaded (${toonState.convertedMeshCount} mesh/material roots converted)`);

  return {
    box: fittedBox,
    clips: assets.flatMap((asset) => asset.clips || []),
    root,
    ...toonState,
  };
}

async function loadSceneContent() {
  const [environmentState, modelState] = await Promise.all([
    loadEnvironment(),
    loadSceneModels(),
  ]);

  if (MODEL_URLS.length === 0 && !ENVIRONMENT_URL) {
    throw new Error('No model or environment requested.');
  }

  if (MODEL_URLS.length === 0) {
    document.body.dataset.modelFormat = 'none';
    document.body.dataset.modelUrl = '';
    document.body.dataset.convertedMeshCount = '0';
    document.body.dataset.modelReady = 'true';
    setAnimationReady('none');
    return {
      environmentState,
      modelState,
    };
  }

  if (ENVIRONMENT_URL) {
    const modelBox = positionModelInEnvironment(modelState.root, environmentState) || modelState.box;
    modelState.box = modelBox;
    frameModelInEnvironment(modelBox, environmentState.box);
  }
  applyCaptureView(modelState.box);

  await setupRequestedAnimation({
    clips: modelState.clips || [],
    root: modelState.root,
  }, modelState);
  document.body.dataset.modelReady = 'true';

  return {
    environmentState,
    modelState,
  };
}

// Scene content waits for the renderer backend: loaders probe renderer
// capabilities (KTX2 detectSupport), which needs WebGPU init to have resolved.
whenRendererReady(renderer).then(loadSceneContent).catch((error) => {
  document.body.dataset.modelReady = 'error';
  if (ENVIRONMENT_URL) document.body.dataset.environmentReady = 'error';
  if (ENVIRONMENT_BACKDROP_URL) document.body.dataset.environmentBackdropReady = 'error';
  if (ENABLE_ENVIRONMENT_SUN) document.body.dataset.environmentSunReady = 'error';
  if (ANIMATION_REQUESTED) setAnimationReady('error');
  console.error(`Failed to load scene content:`, error);
});

// ---- Animation Loop ----
// Captures freeze the shared environment clock (cloud drift, dust motes) so
// screenshots are deterministic frame-to-frame.
const ENVIRONMENT_TIME_FROZEN = Boolean(CAPTURE_VIEW) || booleanParam('envFreezeTime');
if (ENVIRONMENT_TIME_FROZEN) resetEnvironmentShaderTime(0);

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  for (const mixer of animationMixers) mixer.update(delta);
  controls.update();

  if (!ENVIRONMENT_TIME_FROZEN) {
    advanceEnvironmentShaderTime(delta);
    sceneRuntime.dustMotes?.update(delta);
  }
  // Frozen captures keep the sky's cloud/star clock at 0 for determinism.
  stylizedSkyDome?.update(ENVIRONMENT_TIME_FROZEN ? 0 : delta, camera);

  if (renderer.isWebGPURenderer) {
    // Node backend (webgpu / webgpu-forced-gl): sun shadows render first so
    // the measure pass and materials see them — but only once the scene
    // content settled (loader material swaps churn its render objects) and
    // re-rendered only while animation moves casters (see the r185 churn
    // note in environmentSunShadowPass). The frame then flows through the
    // same character-pass + post-pipeline path as classic (Phase 6 port).
    if (document.body.dataset.modelReady === 'true') {
      environmentSunShadowPass.update({
        dynamic: animationPlaybackEnabled && animationActions.length > 0,
      });
    }
  }

  sceneRuntime.floorReflection?.update();

  const wantsCharacterMask = postProcessingPipeline.enabled &&
    postProcessingPipeline.settings.features.bloom &&
    (postProcessingPipeline.settings.parameters.bloomCharacterBoost !== 1 ||
      postProcessingPipeline.settings.parameters.bloomBackgroundSuppress !== 1 ||
      postProcessingPipeline.settings.parameters.bloomCharacterSaturation !== 1);
  characterRenderPasses.setCharacterMaskEnabled(wantsCharacterMask);
  characterRenderPasses.update();
  postProcessingPipeline.setCharacterMask(wantsCharacterMask ? characterRenderPasses.characterMaskTexture : null);

  postProcessingPipeline.render(delta);
}
whenRendererReady(renderer).then(() => animate());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  postProcessingPipeline.setSize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  characterRenderPasses.setSize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
});
