import * as THREE from 'three';

import { createEnvironmentAoOverlayNodeMaterial } from '../shaders-tsl/environment-ao-overlay.js';
import {
  createEnvironmentNodeMaterial,
  environmentSharedUniformNodes,
} from '../shaders-tsl/environment.js';
import {
  isEmissiveEnvironmentMaterial,
  isFoliageMaterial,
  isWindowCutoutMaterial,
  materialBaseColor,
  sourceOpacity,
  usesAlphaCutout,
} from './environmentMaterialClassifier.js';
import {
  ENVIRONMENT_DEBUG_MODES,
  applyEnvironmentSettingsToMaterial,
  createEnvironmentSettings,
  normalizeEnvironmentDebugMode,
} from './environmentSettings.js';
import {
  fallbackEnvironmentBlackTexture,
  fallbackEnvironmentWhiteTexture,
} from './environmentTextureResolver.js';

// Uniform objects shared by reference across every environment material, so a
// single write drives the whole converted scene: the animation clock, the
// drifting cloud-shadow field, the debug selector, the interior openings, the
// ambient probe, and the floor reflection pass output. These names are
// excluded from the per-material settings snapshot (see
// ENVIRONMENT_SHARED_UNIFORM_NAMES).
const environmentSharedUniforms = {
  time: { value: 0 },
  cloudShadowStrength: { value: 0 },
  cloudShadowCoverage: { value: 0.45 },
  cloudShadowScale: { value: 0.012 },
  cloudShadowVelocity: { value: new THREE.Vector2(0.02, 0.006) },
  envDebugMode: { value: 0 },
  environmentOpenings: {
    value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()],
  },
  environmentOpeningCount: { value: 0 },
  ambientProbe: {
    value: [
      new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1),
      new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1),
      new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1),
    ],
  },
  planarReflectionMap: { value: fallbackEnvironmentBlackTexture },
  planarReflectionMatrix: { value: new THREE.Matrix4() },
};

// The module-level setters below write the classic shared uniforms and
// mirror each write into the TSL shared uniform nodes
// (src/shaders-tsl/environment.js), so scene-wide updates reach both
// backends. Per-material writes (applyEnvironmentSettingsToMaterial, HUD)
// need no mirroring: on TSL the material `.uniforms` slots ARE the shared
// nodes, exactly like the classic shared-by-reference uniform objects.

// Advance the shared environment clock once per frame (drives cloud drift).
export function advanceEnvironmentShaderTime(delta) {
  environmentSharedUniforms.time.value += Math.min(Math.max(delta ?? 0, 0), 0.1);
  environmentSharedUniformNodes.time.value = environmentSharedUniforms.time.value;
}

// Reset the shared clock (deterministic captures need a repeatable time).
export function resetEnvironmentShaderTime(value = 0) {
  environmentSharedUniforms.time.value = Number.isFinite(value) ? value : 0;
  environmentSharedUniformNodes.time.value = environmentSharedUniforms.time.value;
}

// Retune the scene-wide cloud shadows. strength 0 (the default) disables the
// effect, so indoor scenes never see it. velocity is uv-space drift per
// second (worldDrift = velocity / scale).
export function setEnvironmentCloudShadow({ strength, coverage, scale, velocity } = {}) {
  if (Number.isFinite(strength)) environmentSharedUniforms.cloudShadowStrength.value = strength;
  if (Number.isFinite(coverage)) environmentSharedUniforms.cloudShadowCoverage.value = coverage;
  if (Number.isFinite(scale)) environmentSharedUniforms.cloudShadowScale.value = scale;
  if (velocity) {
    environmentSharedUniforms.cloudShadowVelocity.value.set(
      velocity[0] ?? velocity.x ?? 0, velocity[1] ?? velocity.y ?? 0);
  }
  environmentSharedUniformNodes.cloudShadowStrength.value = environmentSharedUniforms.cloudShadowStrength.value;
  environmentSharedUniformNodes.cloudShadowCoverage.value = environmentSharedUniforms.cloudShadowCoverage.value;
  environmentSharedUniformNodes.cloudShadowScale.value = environmentSharedUniforms.cloudShadowScale.value;
  environmentSharedUniformNodes.cloudShadowVelocity.value.copy(environmentSharedUniforms.cloudShadowVelocity.value);
}

function forEachEnvironmentShaderMaterial(root, callback) {
  root?.traverse?.((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (mat?.userData?.environmentMaterial) callback(mat, obj);
    }
  });
}

// Switch every converted environment material under root to a debug view
// ('off' restores normal rendering). Materials compile the debug branch out
// unless a debug view has been requested at least once.
export function setEnvironmentDebugOutput(root, mode = 'off') {
  const resolved = normalizeEnvironmentDebugMode(mode);
  environmentSharedUniforms.envDebugMode.value = resolved;
  // Node materials compile the debug table in from the start (and pre-set the
  // define marker), so on the TSL backend this stays a pure uniform write.
  environmentSharedUniformNodes.envDebugMode.value = resolved;
  forEachEnvironmentShaderMaterial(root, (mat) => {
    if (resolved > 0 && !mat.defines?.ENV_DEBUG_VIEWS) {
      mat.defines = { ...mat.defines, ENV_DEBUG_VIEWS: 1 };
      mat.needsUpdate = true;
    }
  });
  return resolved;
}

// Register up to four interior "openings" (windows, doors, strong lamps):
// world position + light reach radius. Interior occlusion darkens surfaces
// away from every opening; passing an empty list disables the term.
export function setEnvironmentOpenings(openings = []) {
  const slots = environmentSharedUniforms.environmentOpenings.value;
  const count = Math.min(Array.isArray(openings) ? openings.length : 0, slots.length);
  for (let i = 0; i < slots.length; i += 1) {
    const opening = openings[i];
    if (i < count && opening) {
      const position = opening.position ?? opening;
      slots[i].set(
        position.x ?? position[0] ?? 0,
        position.y ?? position[1] ?? 0,
        position.z ?? position[2] ?? 0,
        opening.radius ?? opening.w ?? 1,
      );
    } else {
      slots[i].set(0, 0, 0, 0);
    }
  }
  environmentSharedUniforms.environmentOpeningCount.value = count;
  for (let i = 0; i < slots.length; i += 1) {
    environmentSharedUniformNodes.environmentOpenings.array[i].copy(slots[i]);
  }
  environmentSharedUniformNodes.environmentOpeningCount.value = count;
  return count;
}

// Write the six-direction ambient probe (+x, -x, +y, -y, +z, -z). Colors
// come from captureEnvironmentAmbientProbe or can be authored directly.
export function setEnvironmentAmbientProbeColors(colors = []) {
  const slots = environmentSharedUniforms.ambientProbe.value;
  for (let i = 0; i < slots.length; i += 1) {
    const color = colors[i];
    if (color?.isColor) slots[i].copy(color);
    else if (Array.isArray(color)) slots[i].setRGB(color[0] ?? 1, color[1] ?? 1, color[2] ?? 1);
    environmentSharedUniformNodes.ambientProbe.array[i].copy(slots[i]);
  }
}

// Bind (or clear) the shared planar-reflection pass output consumed by
// glossFloor-role materials.
export function setEnvironmentPlanarReflection({ texture, matrix } = {}) {
  environmentSharedUniforms.planarReflectionMap.value = texture ?? fallbackEnvironmentBlackTexture;
  if (matrix) environmentSharedUniforms.planarReflectionMatrix.value.copy(matrix);
  environmentSharedUniformNodes.planarReflectionMap.value = environmentSharedUniforms.planarReflectionMap.value;
  environmentSharedUniformNodes.planarReflectionMatrix.value.copy(environmentSharedUniforms.planarReflectionMatrix.value);
}

export function createEnvironmentAoMaterial(mat, textureSet) {
  const material = createEnvironmentAoOverlayNodeMaterial({
    aoMap: textureSet.alphaMap ?? textureSet.baseMap ?? fallbackEnvironmentWhiteTexture,
    side: mat?.side ?? THREE.DoubleSide,
  });
  material.name = mat?.name ?? '';
  material.visible = mat?.visible ?? true;
  material.userData.environmentAoOverlay = true;
  return material;
}

export function createEnvironmentShadowMaterial(mat, { hasVertexColors = false } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x3d2d20,
    opacity: 0.18,
    side: mat?.side ?? THREE.DoubleSide,
    transparent: true,
    vertexColors: hasVertexColors,
    depthWrite: false,
  });
  material.name = mat?.name ?? '';
  material.visible = mat?.visible ?? true;
  material.userData.environmentShadow = true;
  return material;
}

export function createEnvironmentWindowOpeningMaterial(mat) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    opacity: 0,
    side: mat?.side ?? THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  material.name = mat?.name ?? '';
  material.visible = false;
  material.userData.windowCutout = true;
  return material;
}

function alphaCutoffFor(mat, isFoliage) {
  if (isFoliage) return Math.max(mat?.alphaTest ?? 0.12, 0.08);
  return usesAlphaCutout(mat) ? Math.max(mat?.alphaTest ?? 0.35, 0.35) : -1.0;
}

export function createEnvironmentMaterial(mat, textureSet, {
  assetId = '',
  environmentBox = null,
  environmentSettings = createEnvironmentSettings(),
  hasSun = false,
  hasUv2 = false,
  hasVertexAo = false,
  hasVertexColors = false,
  manufacturedClassification = null,
  manufacturedObjectClass = 'generic',
  materialProfile = null,
  openWindows = false,
  role = null,
} = {}) {
  const features = environmentSettings.features;
  const renderMode = manufacturedClassification?.renderMode ?? null;
  const isFoliage = role ? role === 'foliage' : isFoliageMaterial(mat);
  const isEmissive = role === 'emissive'
    || renderMode === 'unlit'
    || manufacturedClassification?.contentFlags?.includes('emissive')
    || (!role && isEmissiveEnvironmentMaterial(mat));
  const isWindow = role === 'window'
    || manufacturedClassification?.structuralRole === 'window'
    || (!role && isWindowCutoutMaterial(mat));
  const isGlossFloor = role === 'glossFloor';
  const alphaCutout = renderMode === 'alphaCutout' || usesAlphaCutout(mat);
  const alphaBlend = ['translucent', 'transmissive'].includes(renderMode)
    || (mat?.transparent === true && sourceOpacity(mat) < 0.999);
  const opacity = renderMode === 'transmissive'
    ? Math.min(sourceOpacity(mat), 0.68)
    : renderMode === 'translucent'
      ? Math.min(sourceOpacity(mat), 0.82)
      : sourceOpacity(mat);
  const windowCutout = features.windowCutout && openWindows && isWindow;
  if (windowCutout) return createEnvironmentWindowOpeningMaterial(mat);

  const useNormalMap = Boolean(textureSet.normalMap) && features.normalMap;
  const useAoMap = Boolean(textureSet.aoMap) && features.aoMap;
  const useLightMap = Boolean(textureSet.lightMap) && features.lightMap;
  const useEmissiveMap = Boolean(textureSet.emissiveMap) && features.emissiveMap;
  const useUntextured = Boolean(textureSet.untextured) && features.untexturedGradient;
  const usePlanarReflection = isGlossFloor && features.planarReflection;
  const aoUsesUv2 = hasUv2 && (textureSet.aoMap?.channel ?? 1) >= 1;
  const lightUsesUv2 = hasUv2 && (textureSet.lightMap?.channel ?? 1) >= 1;
  const useUv2 = (useAoMap && aoUsesUv2) || (useLightMap && lightUsesUv2);

  const material = createEnvironmentNodeMaterial({
    alphaBlend,
    alphaCutoff: alphaCutout
      ? isFoliage
        ? Math.max(mat?.alphaTest ?? 0.12, 0.08)
        : Math.max(mat?.alphaTest ?? 0.35, 0.35)
      : -1,
    baseColor: materialBaseColor(mat, textureSet),
    environmentBox,
    flags: {
      aoUsesUv2: useUv2 && aoUsesUv2,
      hasAlphaMap: Boolean(textureSet.alphaMap),
      hasAoMap: useAoMap,
      hasEmissiveMap: useEmissiveMap,
      hasLightMap: useLightMap,
      hasNormalMap: useNormalMap,
      hasPackedMap: Boolean(textureSet.packedMap),
      hasPlanarReflection: usePlanarReflection,
      hasUntextured: useUntextured,
      hasVertexAo,
      lightUsesUv2: useUv2 && lightUsesUv2,
      useUv2,
      useVertexColors: hasVertexColors,
    },
    hasSun,
    isEmissive,
    isFoliage,
    isGlossFloor,
    opacity,
    side: mat?.side ?? THREE.DoubleSide,
    textureSet,
  });

  const baseMapTexture = textureSet.baseMap;
  if (baseMapTexture?.isTexture) {
    if (baseMapTexture.matrixAutoUpdate) baseMapTexture.updateMatrix();
    material.uniforms.baseMapTransform.value.copy(baseMapTexture.matrix);
  }

  material.name = mat?.name ?? '';
  material.visible = mat?.visible ?? true;
  material.userData.windowCutout = windowCutout;
  material.userData.environmentMaterial = true;
  material.userData.environmentRole = role ?? (isFoliage ? 'foliage' : isEmissive ? 'emissive' : 'standard');
  material.userData.environmentFeatures = { ...features };
  material.userData.urbanMaterial = manufacturedClassification
    ? {
      ...manufacturedClassification,
      contentFlags: [...manufacturedClassification.contentFlags],
    }
    : undefined;
  material.userData.manufacturedObjectClass = manufacturedObjectClass;
  material.userData.manufacturedAssetId = assetId;
  material.userData.manufacturedAppliedProfiles = [
    ...(materialProfile?.appliedProfiles ?? []),
  ];
  return applyEnvironmentSettingsToMaterial(material, environmentSettings);
}

export function createDebugEnvironmentMaterial(mat, shaderMode, textureSet, { hasVertexColors = false } = {}) {
  if (shaderMode === 'basic') {
    const material = new THREE.MeshBasicMaterial({
      alphaTest: usesAlphaCutout(mat) ? Math.max(mat?.alphaTest ?? 0.35, 0.35) : mat?.alphaTest ?? 0,
      color: materialBaseColor(mat, textureSet),
      map: textureSet.baseMap === fallbackEnvironmentWhiteTexture ? null : textureSet.baseMap,
      opacity: sourceOpacity(mat),
      side: mat?.side ?? THREE.DoubleSide,
      transparent: mat?.transparent === true && sourceOpacity(mat) < 0.999,
      vertexColors: hasVertexColors,
    });
    material.visible = mat?.visible ?? true;
    return material;
  }

  const material = new THREE.MeshStandardMaterial({
    alphaTest: usesAlphaCutout(mat) ? Math.max(mat?.alphaTest ?? 0.35, 0.35) : mat?.alphaTest ?? 0,
    color: materialBaseColor(mat, textureSet),
    map: textureSet.baseMap === fallbackEnvironmentWhiteTexture ? null : textureSet.baseMap,
    normalMap: mat?.normalMap ?? null,
    roughness: 0.82,
    metalness: 0.02,
    opacity: sourceOpacity(mat),
    side: mat?.side ?? THREE.DoubleSide,
    transparent: mat?.transparent === true && sourceOpacity(mat) < 0.999,
    vertexColors: hasVertexColors,
  });
  material.visible = mat?.visible ?? true;
  return material;
}

export { ENVIRONMENT_DEBUG_MODES };
