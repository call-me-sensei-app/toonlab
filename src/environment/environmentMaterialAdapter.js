import { syncToonSceneLights } from '../shaders-tsl/character/sceneLights.js';
import {
  classifyEnvironmentMaterialRole,
  toMaterialArray,
} from './environmentMaterialClassifier.js';
import {
  MANUFACTURED_OBJECT_CLASSES,
  applyManufacturedMaterialManifest,
  classifyManufacturedMaterial,
  createManufacturedMaterialLook,
  inferManufacturedObjectClass,
  resolveManufacturedMaterialLook,
} from './manufacturedMaterialContract.js';

// Environment node materials read scene lights from the shared toon light
// uniforms (shaders-tsl/character/sceneLights.js) instead of three's
// classic light blocks; converted meshes mirror the light state right before
// they render, exactly like the toon adapter's toonNodeLightSync. Both
// renderers invoke Object3D.onBeforeRender.
function environmentNodeLightSync(renderer, scene, camera) {
  syncToonSceneLights(scene, camera, renderer);
}
import {
  applyEnvironmentSettingsToMaterial,
  createEnvironmentSettings,
  normalizeEnvironmentDebugMode,
} from './environmentSettings.js';
import {
  createDebugEnvironmentMaterial,
  createEnvironmentAoMaterial,
  createEnvironmentMaterial,
  createEnvironmentShadowMaterial,
  setEnvironmentDebugOutput,
} from './environmentShaderMaterials.js';
import { resolveEnvironmentPreset } from './environmentPresets.js';
import { installToonLabSurfaceLighting } from './toonLabSurfaceLighting.js';
import {
  resolveEnvironmentTextureSet,
} from './environmentTextureResolver.js';
import {
  bakeEnvironmentVertexAo,
} from './environmentVertexAo.js';
import {
  DEFAULT_SCAN_STYLIZE_PARAMS,
  applyScanStylizeToMaterial,
  isScanAssetMaterial,
  stylizeScanBaseMap,
} from './scanAssetStylize.js';

export {
  DEFAULT_SCAN_STYLIZE_PARAMS,
  applyScanStylizeToMaterial,
  isScanAssetMaterial,
  stylizeScanBaseMap,
} from './scanAssetStylize.js';

export {
  ENVIRONMENT_MATERIAL_ROLES,
  alphaCutoffForMaterial,
  classifyEnvironmentMaterialRole,
  isAoOverlayMaterial,
  isEmissiveEnvironmentMaterial,
  isEnvironmentAoOverlay,
  isEnvironmentShadowMesh,
  isFoliageMaterial,
  isUtilityTextureLabel,
  isWindowCutoutMaterial,
  materialBaseColor,
  materialText,
  objectMaterialText,
  sourceOpacity,
  textureLabel,
  textureSourceUrl,
  toMaterialArray,
  usesAlphaCutout,
} from './environmentMaterialClassifier.js';

export {
  MANUFACTURED_CONTENT_FLAGS,
  MANUFACTURED_MATERIAL_BASES,
  MANUFACTURED_MATERIAL_FINISHES,
  MANUFACTURED_MATERIAL_LOOK_VERSION,
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  MANUFACTURED_MATERIAL_MANIFEST_VERSION,
  MANUFACTURED_OBJECT_CLASSES,
  MANUFACTURED_RENDER_MODES,
  MANUFACTURED_STRUCTURAL_ROLES,
  analyzeManufacturedAsset,
  applyManufacturedMaterialManifest,
  classifyManufacturedMaterial,
  createManufacturedMaterialClassification,
  createManufacturedMaterialLook,
  inferManufacturedObjectClass,
  resolveManufacturedMaterialLook,
  validateManufacturedMaterialLook,
  validateManufacturedMaterialManifest,
} from './manufacturedMaterialContract.js';

export {
  DEFAULT_ENVIRONMENT_FEATURES,
  DEFAULT_ENVIRONMENT_PARAMETERS,
  ENVIRONMENT_DEBUG_MODES,
  ENVIRONMENT_SETTING_FIELD_SCHEMA,
  ENVIRONMENT_SETTING_GROUPS,
  applyEnvironmentSettingsToMaterial,
  createEnvironmentSettings,
  normalizeEnvironmentDebugMode,
  updateEnvironmentBoundsUniforms,
} from './environmentSettings.js';

export {
  advanceEnvironmentShaderTime,
  createDebugEnvironmentMaterial,
  createEnvironmentAoMaterial,
  createEnvironmentMaterial,
  createEnvironmentShadowMaterial,
  createEnvironmentWindowOpeningMaterial,
  resetEnvironmentShaderTime,
  setEnvironmentAmbientProbeColors,
  setEnvironmentCloudShadow,
  setEnvironmentDebugOutput,
  setEnvironmentOpenings,
  setEnvironmentPlanarReflection,
} from './environmentShaderMaterials.js';

export {
  copyTextureTransform,
  fallbackEnvironmentBlackTexture,
  fallbackEnvironmentNormalTexture,
  fallbackEnvironmentWhiteTexture,
  loadEnvironmentTexture,
  resolveEnvironmentTextureSet,
  textureKindCandidateUrl,
  textureUrlExists,
} from './environmentTextureResolver.js';

export { bakeEnvironmentVertexAo } from './environmentVertexAo.js';

function resolveEnvironmentSettings({ features = {}, parameters = {}, settings = {} } = {}) {
  const mergedSettings = createEnvironmentSettings(settings);
  return createEnvironmentSettings({
    features: {
      ...mergedSettings.features,
      ...features,
    },
    parameters: {
      ...mergedSettings.parameters,
      ...parameters,
    },
  });
}

// The FBX/legacy loaders name the second uv set uv2; the shader reads uv1
// (the modern three.js convention). Alias so both work.
function ensureUv2Attribute(geometry) {
  if (geometry.attributes.uv1) return true;
  if (geometry.attributes.uv2) {
    geometry.setAttribute('uv1', geometry.attributes.uv2);
    return true;
  }
  return false;
}

function createConvertedEnvironmentMaterial(mat, options) {
  return options.normalizedShaderMode === 'anime'
    ? createEnvironmentMaterial(mat, options.textureSet, options)
    : createDebugEnvironmentMaterial(mat, options.normalizedShaderMode, options.textureSet, {
      hasVertexColors: options.hasVertexColors,
    });
}

// Converts every mesh under root to the environment shader.
//
// Options beyond the original set:
// - roleOverrides: [{ match: string|RegExp, role }] — corrects heuristic
//   classification without renaming assets (userData.envRole wins over both).
// - bakeVertexAo: 'auto' | true | false — bake per-vertex ambient occlusion
//   at conversion for grounding. 'auto' bakes untextured meshes only (the
//   input class with no baked AO of its own) within the vertex budget.
// - vertexAoOptions: forwarded to bakeEnvironmentVertexAo.
// - debugOutputMode: compile debug views in from the start ('off' keeps
//   normal rendering; setEnvironmentDebugOutput can enable them later).
// - scanStylize: 'auto' | true | false — photoscan stylization pass
//   (albedo simplify + detail-map compression, see scanAssetStylize.js).
//   'auto' applies it only to materials that detect as photoscan/Fab scans;
//   material.userData.envScanStylize overrides detection per material.
// - scanStylizeParams: overrides merged over DEFAULT_SCAN_STYLIZE_PARAMS.
// - materialLook: sparse IP-owned profiles resolved over the global catch-all
//   by base material, finish, render mode, structural role, content flags,
//   object class, then stable asset id.
// - materialManifest: optional sidecar manifest for formats that cannot
//   reliably preserve glTF extras (also useful for third-party GLBs).
// - assetId/objectClass: stable profile selectors; explicit values override
//   root metadata and manifest values.
//
// Returns conversion counts plus a classification report:
// [{ object, material, role, source, manufactured, appliedProfiles }] for
// every converted material.
export async function applyEnvironmentShader(root, {
  assetId = '',
  bakeVertexAo = 'auto',
  debugOutputMode = 'off',
  environmentBox = null,
  features = {},
  hasSun = false,
  materialLook = undefined,
  materialManifest = null,
  objectClass = '',
  parameters = {},
  preset = undefined,
  roleOverrides = null,
  scanStylize = 'auto',
  scanStylizeParams = {},
  scenario = undefined,
  settings = {},
  shaderMode = 'anime',
  // Surface-lighting model options (D19-150). A material this adapter converts
  // now JOINS the ToonLab surface-lighting model instead of being left outside
  // it. Before this, `applyEnvironmentShader` reported a material as converted
  // while never setting `userData.toonLabSurfaceLighting` — the exact flag every
  // scene guards on when adopting its own shadow fill:
  //
  //   if (!material?.userData?.toonLabSurfaceLighting) continue;   // missed it
  //
  // so a scene's shadow fill silently reached every first-party surface and
  // skipped every dropped-in asset. Nothing warned; the adoption loop simply
  // reported a lower count. The divergence grows with how much fill the scene
  // adopts, which is what made it severe rather than cosmetic.
  //
  // Defaults are the installer's own defaults (shadowFill 0), so installing
  // here changes no existing capture — it only makes the material present in
  // the model, which is what lets a scene's adoption loop find it afterwards.
  surfaceLighting = {},
  openWindows = false,
  vertexAoOptions = {},
} = {}) {
  const presetSettings = preset !== undefined || scenario !== undefined
    ? resolveEnvironmentPreset(preset ?? 'default', scenario)
    : null;
  const sourceSettings = settings && typeof settings === 'object' ? settings : {};
  const composedSettings = presetSettings ? {
    ...sourceSettings,
    features: {
      ...presetSettings.features,
      ...(sourceSettings.features ?? {}),
    },
    materialLook: sourceSettings.materialLook ?? presetSettings.materialLook,
    parameters: {
      ...presetSettings.parameters,
      ...(sourceSettings.parameters ?? {}),
    },
  } : sourceSettings;
  const manifestResult = materialManifest
    ? applyManufacturedMaterialManifest(root, materialManifest)
    : null;
  const environmentSettings = resolveEnvironmentSettings({
    features,
    parameters,
    settings: composedSettings,
  });
  const resolvedMaterialLook = createManufacturedMaterialLook(
    materialLook ?? composedSettings.materialLook ?? {},
  );
  const resolvedAssetId = String(
    assetId
      || manifestResult?.assetId
      || root?.userData?.toonlabAssetId
      || '',
  );
  const requestedObjectClass = objectClass || manifestResult?.objectClass;
  const resolvedObjectClass = MANUFACTURED_OBJECT_CLASSES.includes(requestedObjectClass)
    ? requestedObjectClass
    : inferManufacturedObjectClass(root);
  const normalizedShaderMode = ['anime', 'basic', 'standard'].includes(shaderMode)
    ? shaderMode
    : 'anime';
  const resolvedDebugMode = normalizeEnvironmentDebugMode(debugOutputMode);
  let convertedMeshCount = 0;
  // D19-150: how many converted materials actually joined the lighting model.
  let surfaceLightingMaterialCount = 0;
  let aoOverlayMeshCount = 0;
  let windowCutoutMaterialCount = 0;
  let shadowMeshCount = 0;
  let vertexAoMeshCount = 0;
  let scanStylizedMaterialCount = 0;
  const classification = [];
  const materialTextureSets = new WeakMap();
  const materialPromises = [];
  const scanMaterials = new Set();
  const scanParams = { ...DEFAULT_SCAN_STYLIZE_PARAMS, ...scanStylizeParams };

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    if (obj.userData?.environmentShaderExclude) return;

    const originalMaterials = toMaterialArray(obj.material);
    if (!obj.geometry.attributes.normal) obj.geometry.computeVertexNormals();

    for (const mat of originalMaterials) {
      if (!mat) continue;
      if (scanStylize === true || (scanStylize === 'auto' && isScanAssetMaterial(obj, mat))) {
        scanMaterials.add(mat);
      }
      if (materialTextureSets.has(mat)) continue;
      const promise = resolveEnvironmentTextureSet(mat)
        .then((textureSet) => {
          materialTextureSets.set(mat, textureSet);
        });
      materialPromises.push(promise);
    }
  });

  await Promise.all(materialPromises);

  // Photoscan albedo simplify runs on the resolved texture sets so both the
  // converted material and the vertex-AO bake below see the stylized map.
  for (const mat of scanMaterials) {
    const textureSet = materialTextureSets.get(mat);
    if (!textureSet || textureSet.untextured) continue;
    textureSet.baseMap = stylizeScanBaseMap(textureSet.baseMap, scanParams);
  }

  // Vertex AO bakes before material creation so baked meshes compile with
  // USE_ENV_VERTEX_AO. 'auto' targets untextured meshes with no ao/lightmap
  // of their own — the flat-color input class that needs grounding most.
  const vertexAoTargets = [];
  if (environmentSettings.features.vertexAo && bakeVertexAo !== false && normalizedShaderMode === 'anime') {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.material) return;
      if (obj.userData?.environmentShaderExclude) return;
      if (obj.geometry.attributes.envVertexAo) return;
      const materials = toMaterialArray(obj.material);
      const textureSet = materialTextureSets.get(materials[0]);
      if (!textureSet) return;
      if (bakeVertexAo === 'auto'
        && (!textureSet.untextured || textureSet.aoMap || textureSet.lightMap)) return;
      vertexAoTargets.push(obj);
    });
  }
  if (vertexAoTargets.length > 0) {
    const baked = await bakeEnvironmentVertexAo(vertexAoTargets, {
      occluderRoot: root,
      environmentBox,
      ...vertexAoOptions,
    });
    vertexAoMeshCount = baked.bakedMeshCount;
  }

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    // Meshes with bespoke shaders (e.g. leaf-card tree canopies) opt out of
    // conversion; the adapter would otherwise replace their material.
    if (obj.userData?.environmentShaderExclude) return;

    const originalMaterials = toMaterialArray(obj.material);
    const roleInfos = originalMaterials.map((mat) => {
      const info = classifyEnvironmentMaterialRole(obj, mat, { roleOverrides });
      const manufactured = classifyManufacturedMaterial(obj, mat);
      const materialProfile = resolveManufacturedMaterialLook(resolvedMaterialLook, {
        assetId: resolvedAssetId,
        classification: manufactured,
        objectClass: resolvedObjectClass,
      });
      classification.push({
        appliedProfiles: materialProfile.appliedProfiles,
        material: mat?.name ?? '',
        manufactured,
        object: obj.name ?? '',
        role: info.role,
        source: info.source,
      });
      return { ...info, manufactured, materialProfile };
    });
    const shadowMesh = environmentSettings.features.shadowMesh
      && roleInfos.some((info) => info.role === 'shadowMesh');
    const aoOverlay = !shadowMesh && environmentSettings.features.aoOverlay
      && roleInfos.some((info) => info.role === 'aoOverlay');
    const hasVertexColors = Boolean(obj.geometry.attributes.color);
    const hasVertexAo = Boolean(obj.geometry.attributes.envVertexAo);
    const hasUv2 = ensureUv2Attribute(obj.geometry);

    const convertMaterial = (mat, index) => {
      const roleInfo = roleInfos[index];
      const perMaterialSettings = createEnvironmentSettings({
        features: {
          ...environmentSettings.features,
          ...roleInfo?.materialProfile?.features,
        },
        parameters: {
          ...environmentSettings.parameters,
          ...roleInfo?.materialProfile?.parameters,
        },
      });
      const converted = createConvertedEnvironmentMaterial(mat, {
        assetId: resolvedAssetId,
        debugOutputMode: resolvedDebugMode,
        environmentBox,
        environmentSettings: perMaterialSettings,
        hasSun,
        hasUv2,
        hasVertexAo,
        hasVertexColors,
        manufacturedClassification: roleInfo?.manufactured,
        manufacturedObjectClass: resolvedObjectClass,
        materialProfile: roleInfo?.materialProfile,
        normalizedShaderMode,
        openWindows,
        role: roleInfo?.role ?? null,
        textureSet: materialTextureSets.get(mat),
      });
      if (scanMaterials.has(mat)) {
        applyScanStylizeToMaterial(converted, scanParams);
        scanStylizedMaterialCount += 1;
      }
      return converted;
    };

    obj.material = shadowMesh
      ? (Array.isArray(obj.material)
        ? originalMaterials.map((mat) => createEnvironmentShadowMaterial(mat, { hasVertexColors }))
        : createEnvironmentShadowMaterial(originalMaterials[0], { hasVertexColors }))
      : aoOverlay
        ? (Array.isArray(obj.material)
          ? originalMaterials.map((mat) => createEnvironmentAoMaterial(mat, materialTextureSets.get(mat)))
          : createEnvironmentAoMaterial(originalMaterials[0], materialTextureSets.get(originalMaterials[0])))
        : Array.isArray(obj.material)
          ? originalMaterials.map((mat, index) => convertMaterial(mat, index))
          : convertMaterial(originalMaterials[0], 0);

    for (const mat of toMaterialArray(obj.material)) {
      if (mat?.userData?.windowCutout) windowCutoutMaterialCount += 1;
      // D19-150: enrol every converted environment material in the surface
      // lighting model. `installToonLabSurfaceLighting` is a no-op on anything
      // that is not a NodeMaterial and preserves prior options when re-run, so
      // this is safe both for materials that already carry it and for the
      // scene-side adoption pass that re-installs with an authored shadowFill.
      if (mat?.isNodeMaterial && mat.userData?.environmentMaterial) {
        installToonLabSurfaceLighting(mat, surfaceLighting);
        if (mat.userData?.toonLabSurfaceLighting) surfaceLightingMaterialCount += 1;
      }
    }
    if (toMaterialArray(obj.material).some((mat) => mat?.userData?.environmentMaterial)) {
      obj.onBeforeRender = environmentNodeLightSync;
    }
    if (shadowMesh) shadowMeshCount += 1;
    if (aoOverlay) aoOverlayMeshCount += 1;

    obj.frustumCulled = false;
    obj.castShadow = hasSun && environmentSettings.features.shadowMask;
    obj.receiveShadow = hasSun && environmentSettings.features.shadowMask;
    convertedMeshCount += 1;
  });

  // Materials compiled with the debug define still need the shared debug-mode
  // uniform pointed at the requested view.
  if (resolvedDebugMode > 0) setEnvironmentDebugOutput(root, resolvedDebugMode);

  return {
    aoOverlayMeshCount,
    classification,
    convertedMeshCount,
    surfaceLightingMaterialCount,
    manifestWarnings: manifestResult?.warnings ?? [],
    manufacturedAssetId: resolvedAssetId,
    manufacturedObjectClass: resolvedObjectClass,
    preset: presetSettings ? String(preset ?? 'default') : null,
    scanStylizedMaterialCount,
    scenario: presetSettings && scenario !== undefined ? String(scenario) : null,
    shaderMode: normalizedShaderMode,
    shadowMeshCount,
    vertexAoMeshCount,
    windowCutoutMaterialCount,
  };
}
