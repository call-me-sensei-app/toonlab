import * as THREE from 'three';

export const DEFAULT_ENVIRONMENT_FEATURES = Object.freeze({
  alphaCutout: true,
  alphaMap: true,
  ambientLight: true,
  ambientProbe: true,
  aoMap: true,
  aoOverlay: true,
  directionalLights: true,
  emissive: true,
  emissiveMap: true,
  foliageCutout: true,
  heightFog: true,
  interiorOcclusion: true,
  leftSideShadow: true,
  lightMap: true,
  normalMap: true,
  packedMap: true,
  planarReflection: true,
  pointLights: true,
  shadowMask: true,
  shadowMesh: true,
  skyTint: true,
  specular: true,
  spotLights: true,
  sunBoost: true,
  untexturedGradient: true,
  vertexAo: true,
  windowCutout: true,
});

// Debug view ids must match environmentDebugColor() in
// src/shaders/chunks/environment-fragment-debug.glsl.
export const ENVIRONMENT_DEBUG_MODES = Object.freeze({
  off: 0,
  albedo: 1,
  lit: 2,
  ambient: 3,
  direct: 4,
  shadowMask: 5,
  pointLight: 6,
  spotLight: 7,
  occlusion: 8,
  bakedGi: 9,
  normal: 10,
  vertexAo: 11,
  specular: 12,
  emissive: 13,
  windowMask: 14,
  roomOcclusion: 15,
  alpha: 16,
});

export function normalizeEnvironmentDebugMode(mode) {
  if (typeof mode === 'number' && Number.isFinite(mode)) {
    return Object.values(ENVIRONMENT_DEBUG_MODES).includes(mode) ? mode : 0;
  }
  return ENVIRONMENT_DEBUG_MODES[String(mode ?? 'off')] ?? 0;
}

// Uniforms shared by reference across every environment material (scene-wide
// clock + cloud shadows). They are excluded from the per-material baseline
// snapshot so re-applying settings on one material cannot reset the shared
// scene state for all of them.
export const ENVIRONMENT_SHARED_UNIFORM_NAMES = Object.freeze([
  'time',
  'cloudShadowStrength',
  'cloudShadowCoverage',
  'cloudShadowScale',
  'cloudShadowVelocity',
  'envDebugMode',
  'environmentOpenings',
  'environmentOpeningCount',
  'ambientProbe',
  'planarReflectionMap',
  'planarReflectionMatrix',
]);

export const DEFAULT_ENVIRONMENT_PARAMETERS = Object.freeze({
  ambientProbeBlend: null,
  ambientStrength: null,
  ambientLightInfluence: null,
  aoMapStrength: null,
  aoWarmth: null,
  bakedGlowStrength: null,
  cloudShadowCoverage: null,
  cloudShadowScale: null,
  cloudShadowStrength: null,
  directLightStrength: null,
  emissiveMapStrength: null,
  emissiveStrength: null,
  exposure: null,
  heightFogColor: null,
  heightFogDensity: null,
  heightFogFalloff: null,
  interiorOcclusionColor: null,
  interiorOcclusionStrength: null,
  leftSideShadow: null,
  leftSideShadowColor: null,
  lightMapLift: null,
  lightMapStrength: null,
  lightingInfluence: null,
  normalMapStrength: null,
  packedOcclusionStrength: null,
  planarReflectionFresnel: null,
  planarReflectionStrength: null,
  pointLightStrength: null,
  saturation: null,
  shadeSoftness: null,
  shadeStrength: null,
  shadowLift: null,
  sunShadowStrength: null,
  shadowTintColor: null,
  skyGroundTint: null,
  skyTintStrength: null,
  skyTopTint: null,
  specularColor: null,
  specularShininess: null,
  specularSoftness: null,
  specularStrength: null,
  spotLightStrength: null,
  sunBoost: null,
  sunBoostColor: null,
  cliffFade: null,
  cliffNoiseScale: null,
  cliffNoiseStrength: null,
  cliffStart: null,
  colormapDecode: null,
  colormapMode: null,
  colormapStrength: null,
  dualDetailMix: null,
  dualDetailScale: null,
  triplanarDetail: null,
  triplanarDetailScale: null,
  triplanarEdgeHighlight: null,
  untexturedGradientStrength: null,
  vtBlendHeight: null,
  vtBlendStrength: null,
  vertexAoStrength: null,
});

export const ENVIRONMENT_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Enables or disables individual environment shader feature paths.',
    id: 'features',
    label: 'Features',
  }),
  Object.freeze({
    description: 'Overrides numeric environment shader uniforms. Auto values preserve material defaults.',
    id: 'parameters',
    label: 'Shader Parameters',
  }),
]);

const COLOR_PARAMETER_KEYS = Object.freeze(new Set([
  'heightFogColor',
  'interiorOcclusionColor',
  'leftSideShadowColor',
  'shadowTintColor',
  'skyGroundTint',
  'skyTopTint',
  'specularColor',
  'sunBoostColor',
]));

const FIELD_LABEL_OVERRIDES = Object.freeze({
  alphaCutout: 'Alpha Cutout',
  alphaMap: 'Alpha Map',
  ambientLight: 'Ambient Light',
  ambientLightInfluence: 'Ambient Influence',
  ambientProbe: 'Ambient Probe',
  ambientProbeBlend: 'Ambient Probe Blend',
  ambientStrength: 'Ambient Strength',
  aoMap: 'AO Map',
  aoMapStrength: 'AO Map Strength',
  aoOverlay: 'AO Overlay',
  aoWarmth: 'AO Warmth',
  emissiveMap: 'Emissive Map',
  emissiveMapStrength: 'Emissive Map Strength',
  heightFog: 'Height Fog',
  heightFogColor: 'Height Fog Color',
  heightFogDensity: 'Height Fog Density',
  heightFogFalloff: 'Height Fog Falloff',
  interiorOcclusion: 'Interior Occlusion',
  interiorOcclusionColor: 'Interior Occlusion Color',
  interiorOcclusionStrength: 'Interior Occlusion Strength',
  lightMap: 'Lightmap',
  lightMapLift: 'Lightmap Lift',
  lightMapStrength: 'Lightmap Strength',
  normalMap: 'Normal Map',
  normalMapStrength: 'Normal Map Strength',
  planarReflection: 'Floor Reflection',
  planarReflectionFresnel: 'Floor Reflection Fresnel',
  planarReflectionStrength: 'Floor Reflection Strength',
  specular: 'Specular',
  specularColor: 'Specular Color',
  specularShininess: 'Specular Shininess',
  specularSoftness: 'Specular Softness',
  specularStrength: 'Specular Strength',
  untexturedGradient: 'Untextured Gradient',
  untexturedGradientStrength: 'Untextured Gradient Strength',
  vertexAo: 'Vertex AO',
  vertexAoStrength: 'Vertex AO Strength',
  bakedGlowStrength: 'Baked Glow',
  cloudShadowCoverage: 'Cloud Shadow Coverage',
  cloudShadowScale: 'Cloud Shadow Scale',
  cloudShadowStrength: 'Cloud Shadow',
  directLightStrength: 'Direct Light',
  directionalLights: 'Directional Lights',
  emissive: 'Emissive',
  emissiveStrength: 'Emissive Strength',
  exposure: 'Exposure',
  foliageCutout: 'Foliage Cutout',
  leftSideShadow: 'Side Shadow',
  leftSideShadowColor: 'Side Shadow Color',
  lightingInfluence: 'Lighting Influence',
  packedMap: 'Packed Map',
  packedOcclusionStrength: 'Packed Occlusion',
  pointLights: 'Point Lights',
  pointLightStrength: 'Point Light',
  saturation: 'Saturation',
  shadeSoftness: 'Shade Softness',
  shadeStrength: 'Shade Strength',
  shadowLift: 'Shadow Lift',
  sunShadowStrength: 'Sun Shadow Strength',
  shadowMask: 'Shadow Mask',
  shadowMesh: 'Shadow Mesh',
  shadowTintColor: 'Shadow Tint',
  skyGroundTint: 'Sky Ground Tint',
  skyTint: 'Sky Tint',
  skyTintStrength: 'Sky Tint Strength',
  skyTopTint: 'Sky Top Tint',
  spotLights: 'Spot Lights',
  spotLightStrength: 'Spot Light',
  sunBoost: 'Sun Boost',
  sunBoostColor: 'Sun Boost Color',
  cliffFade: 'Cliff Fade',
  cliffNoiseScale: 'Cliff Noise Scale',
  cliffNoiseStrength: 'Cliff Noise Strength',
  cliffStart: 'Cliff Start',
  colormapDecode: 'Colormap Decode',
  colormapMode: 'Colormap Mode',
  colormapStrength: 'Macro Colormap',
  dualDetailMix: 'Dual Detail Mix',
  dualDetailScale: 'Dual Detail Scale',
  triplanarDetail: 'Triplanar Detail',
  triplanarDetailScale: 'Triplanar Detail Scale',
  triplanarEdgeHighlight: 'Rock Edge Highlight',
  vtBlendHeight: 'Ground Melt Height',
  vtBlendStrength: 'Ground Melt',
  windowCutout: 'Window Cutout',
});

function labelFromFieldName(key) {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

function descriptionForField(group, key) {
  const label = labelFromFieldName(key).toLowerCase();
  if (group.id === 'features') return `Turns ${label} processing on or off for environment materials.`;
  if (COLOR_PARAMETER_KEYS.has(key)) return `Overrides ${label}; leave unset in code to use the material default.`;
  return `Overrides ${label}; leave unset in code to use the material default.`;
}

function rangeForParameter(key) {
  if (key === 'cloudShadowScale') return { max: 0.1, min: 0, step: 0.0005 };
  if (key === 'specularShininess') return { max: 256, min: 1, step: 1 };
  if (key === 'heightFogDensity') return { max: 0.5, min: 0, step: 0.001 };
  // Outdoor height fog commonly uses 200–500 m of vertical falloff. The old
  // 30 m authoring ceiling forced presets toward a low, opaque soup even
  // though the runtime accepted the correct larger values.
  if (key === 'heightFogFalloff') return { max: 600, min: 0.05, step: 1 };
  if (key === 'planarReflectionFresnel') return { max: 8, min: 0.1, step: 0.05 };
  if (key === 'triplanarDetailScale') return { max: 64, min: 0.25, step: 0.25 };
  if (key === 'exposure' || key === 'saturation') return { max: 2, min: 0, step: 0.01 };
  if (key.includes('Strength') || key.includes('Influence')) return { max: 2, min: 0, step: 0.01 };
  if (key.includes('LightStrength')) return { max: 4, min: 0, step: 0.01 };
  if (key === 'directLightStrength' || key === 'pointLightStrength' || key === 'spotLightStrength') {
    return { max: 4, min: 0, step: 0.01 };
  }
  if (key === 'shadeStrength') return { max: 2, min: 0, step: 0.01 };
  if (key === 'shadeSoftness') return { max: 1, min: 0, step: 0.001 };
  if (key === 'shadowLift') return { max: 1, min: 0, step: 0.01 };
  if (key === 'sunShadowStrength') return { max: 1, min: 0, step: 0.01 };
  if (key === 'sunBoost') return { max: 1, min: 0, step: 0.01 };
  return { max: 1, min: 0, step: 0.01 };
}

function createEnvironmentFieldMetadata(group, key, value) {
  const type = group.id === 'features'
    ? 'boolean'
    : COLOR_PARAMETER_KEYS.has(key)
      ? 'color'
      : 'number';
  return Object.freeze({
    defaultValue: value,
    description: descriptionForField(group, key),
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: labelFromFieldName(key),
    range: type === 'number' ? rangeForParameter(key) : undefined,
    type,
  });
}

export const ENVIRONMENT_SETTING_FIELD_SCHEMA = Object.freeze({
  features: Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_ENVIRONMENT_FEATURES)
      .map(([key, value]) => [
        key,
        createEnvironmentFieldMetadata(ENVIRONMENT_SETTING_GROUPS[0], key, value),
      ]),
  )),
  parameters: Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_ENVIRONMENT_PARAMETERS)
      .map(([key, value]) => [
        key,
        createEnvironmentFieldMetadata(ENVIRONMENT_SETTING_GROUPS[1], key, value),
      ]),
  )),
});

function cleanObject(value) {
  return value && typeof value === 'object' ? value : {};
}

export function createEnvironmentSettings(options = {}) {
  const source = cleanObject(options);
  const featureOverrides = cleanObject(source.features);
  const parameterOverrides = cleanObject(source.parameters);

  return {
    features: {
      ...DEFAULT_ENVIRONMENT_FEATURES,
      ...featureOverrides,
    },
    parameters: {
      ...DEFAULT_ENVIRONMENT_PARAMETERS,
      ...parameterOverrides,
    },
  };
}

function featureValue(features, name) {
  return features[name] ? 1.0 : 0.0;
}

function setUniform(uniforms, name, value) {
  const uniform = uniforms?.[name];
  if (!uniform) return;
  uniform.value = value;
}

function setNumberUniform(uniforms, name, value) {
  if (!Number.isFinite(value)) return;
  setUniform(uniforms, name, value);
}

function colorFromParameter(value) {
  if (value?.isColor) return value;
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value.map(Number);
    return [r, g, b].every(Number.isFinite) ? new THREE.Color(r, g, b) : null;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return new THREE.Color(value);
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object') {
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    return [r, g, b].every(Number.isFinite) ? new THREE.Color(r, g, b) : null;
  }
  return null;
}

function setColorUniform(uniforms, name, value) {
  const color = colorFromParameter(value);
  if (!color) return;

  const uniform = uniforms?.[name];
  if (!uniform) return;
  if (uniform.value?.isColor && uniform.value.copy) {
    uniform.value.copy(color);
    return;
  }
  uniform.value = color.clone();
}

function cloneUniformValue(value) {
  if (value?.isTexture) return value;
  if (value?.clone) return value.clone();
  if (Array.isArray(value)) return value.slice();
  return value;
}

function restoreUniformValue(uniform, value) {
  if (!uniform) return;
  const current = uniform.value;
  if (current?.isColor && value?.isColor && current.copy) {
    current.copy(value);
    return;
  }
  if (current?.isVector2 && value?.isVector2 && current.copy) {
    current.copy(value);
    return;
  }
  if (current?.isVector3 && value?.isVector3 && current.copy) {
    current.copy(value);
    return;
  }
  if (current?.isVector4 && value?.isVector4 && current.copy) {
    current.copy(value);
    return;
  }
  uniform.value = cloneUniformValue(value);
}

function resetEnvironmentUniformsToBase(material) {
  const uniforms = material?.uniforms;
  if (!uniforms) return;

  material.userData ??= {};
  const existingDefaults = material.userData.environmentBaseUniformValues;
  if (!existingDefaults) {
    material.userData.environmentBaseUniformValues = Object.fromEntries(
      Object.entries(uniforms)
        .filter(([name]) => !ENVIRONMENT_SHARED_UNIFORM_NAMES.includes(name))
        .map(([name, uniform]) => [name, cloneUniformValue(uniform.value)]),
    );
    return;
  }

  for (const [name, value] of Object.entries(existingDefaults)) {
    restoreUniformValue(uniforms[name], value);
  }
}

export function applyEnvironmentSettingsToMaterial(material, settingsInput = {}) {
  resetEnvironmentUniformsToBase(material);

  const settings = createEnvironmentSettings(settingsInput);
  const { features, parameters } = settings;
  const uniforms = material?.uniforms;
  if (!uniforms) return material;

  setUniform(uniforms, 'enableAlphaCutout', featureValue(features, 'alphaCutout'));
  setUniform(uniforms, 'enableAlphaMap', featureValue(features, 'alphaMap'));
  setUniform(uniforms, 'enableAmbientLight', featureValue(features, 'ambientLight'));
  setUniform(uniforms, 'enableAmbientProbe', featureValue(features, 'ambientProbe'));
  setUniform(uniforms, 'enableAoMap', featureValue(features, 'aoMap'));
  setUniform(uniforms, 'enableDirectionalLights', featureValue(features, 'directionalLights'));
  setUniform(uniforms, 'enableEmissive', featureValue(features, 'emissive'));
  setUniform(uniforms, 'enableFoliageCutout', featureValue(features, 'foliageCutout'));
  setUniform(uniforms, 'enableHeightFog', featureValue(features, 'heightFog'));
  setUniform(uniforms, 'enableInteriorOcclusion', featureValue(features, 'interiorOcclusion'));
  setUniform(uniforms, 'enableLeftSideShadow', featureValue(features, 'leftSideShadow'));
  setUniform(uniforms, 'enableLightMap', featureValue(features, 'lightMap'));
  setUniform(uniforms, 'enableNormalMap', featureValue(features, 'normalMap'));
  setUniform(uniforms, 'enablePackedMap', featureValue(features, 'packedMap'));
  setUniform(uniforms, 'enablePlanarReflection', featureValue(features, 'planarReflection'));
  setUniform(uniforms, 'enablePointLights', featureValue(features, 'pointLights'));
  setUniform(uniforms, 'enableShadowMask', featureValue(features, 'shadowMask'));
  setUniform(uniforms, 'enableSkyTint', featureValue(features, 'skyTint'));
  setUniform(uniforms, 'enableSpecular', featureValue(features, 'specular'));
  setUniform(uniforms, 'enableSpotLights', featureValue(features, 'spotLights'));
  setUniform(uniforms, 'enableSunBoost', featureValue(features, 'sunBoost'));
  setUniform(uniforms, 'enableUntexturedGradient', featureValue(features, 'untexturedGradient'));
  setUniform(uniforms, 'enableVertexAo', featureValue(features, 'vertexAo'));
  setUniform(uniforms, 'enableWindowCutout', featureValue(features, 'windowCutout'));

  setNumberUniform(uniforms, 'ambientProbeBlend', parameters.ambientProbeBlend);
  setNumberUniform(uniforms, 'ambientStrength', parameters.ambientStrength);
  setNumberUniform(uniforms, 'ambientLightInfluence', parameters.ambientLightInfluence);
  setNumberUniform(uniforms, 'aoMapStrength', parameters.aoMapStrength);
  setNumberUniform(uniforms, 'aoWarmth', parameters.aoWarmth);
  setNumberUniform(uniforms, 'bakedGlowStrength', parameters.bakedGlowStrength);
  setNumberUniform(uniforms, 'emissiveMapStrength', parameters.emissiveMapStrength);
  setNumberUniform(uniforms, 'heightFogDensity', parameters.heightFogDensity);
  setNumberUniform(uniforms, 'heightFogFalloff', parameters.heightFogFalloff);
  setNumberUniform(uniforms, 'interiorOcclusionStrength', parameters.interiorOcclusionStrength);
  setNumberUniform(uniforms, 'lightMapLift', parameters.lightMapLift);
  setNumberUniform(uniforms, 'lightMapStrength', parameters.lightMapStrength);
  setNumberUniform(uniforms, 'normalMapStrength', parameters.normalMapStrength);
  setNumberUniform(uniforms, 'planarReflectionFresnel', parameters.planarReflectionFresnel);
  setNumberUniform(uniforms, 'planarReflectionStrength', parameters.planarReflectionStrength);
  setNumberUniform(uniforms, 'specularShininess', parameters.specularShininess);
  setNumberUniform(uniforms, 'specularSoftness', parameters.specularSoftness);
  setNumberUniform(uniforms, 'specularStrength', parameters.specularStrength);
  setNumberUniform(uniforms, 'untexturedGradientStrength', parameters.untexturedGradientStrength);
  setNumberUniform(uniforms, 'vertexAoStrength', parameters.vertexAoStrength);
  setNumberUniform(uniforms, 'cloudShadowCoverage', parameters.cloudShadowCoverage);
  setNumberUniform(uniforms, 'cloudShadowScale', parameters.cloudShadowScale);
  setNumberUniform(uniforms, 'cloudShadowStrength', parameters.cloudShadowStrength);
  setNumberUniform(uniforms, 'directLightStrength', parameters.directLightStrength);
  setNumberUniform(uniforms, 'emissiveStrength', parameters.emissiveStrength);
  setNumberUniform(uniforms, 'exposure', parameters.exposure);
  setNumberUniform(uniforms, 'leftSideShadow', parameters.leftSideShadow);
  setNumberUniform(uniforms, 'lightingInfluence', parameters.lightingInfluence);
  setNumberUniform(uniforms, 'packedOcclusionStrength', parameters.packedOcclusionStrength);
  setNumberUniform(uniforms, 'pointLightStrength', parameters.pointLightStrength);
  setNumberUniform(uniforms, 'saturation', parameters.saturation);
  setNumberUniform(uniforms, 'shadeSoftness', parameters.shadeSoftness);
  setNumberUniform(uniforms, 'shadeStrength', parameters.shadeStrength);
  setNumberUniform(uniforms, 'shadowLift', parameters.shadowLift);
  setNumberUniform(uniforms, 'sunShadowStrength', parameters.sunShadowStrength);
  setNumberUniform(uniforms, 'skyTintStrength', parameters.skyTintStrength);
  setNumberUniform(uniforms, 'spotLightStrength', parameters.spotLightStrength);
  setNumberUniform(uniforms, 'sunBoost', parameters.sunBoost);
  setNumberUniform(uniforms, 'triplanarDetail', parameters.triplanarDetail);
  setNumberUniform(uniforms, 'triplanarDetailScale', parameters.triplanarDetailScale);
  setNumberUniform(uniforms, 'triplanarEdgeHighlight', parameters.triplanarEdgeHighlight);
  setNumberUniform(uniforms, 'cliffStart', parameters.cliffStart);
  setNumberUniform(uniforms, 'cliffFade', parameters.cliffFade);
  setNumberUniform(uniforms, 'cliffNoiseScale', parameters.cliffNoiseScale);
  setNumberUniform(uniforms, 'cliffNoiseStrength', parameters.cliffNoiseStrength);
  setNumberUniform(uniforms, 'dualDetailMix', parameters.dualDetailMix);
  setNumberUniform(uniforms, 'dualDetailScale', parameters.dualDetailScale);
  setNumberUniform(uniforms, 'colormapStrength', parameters.colormapStrength);
  setNumberUniform(uniforms, 'colormapDecode', parameters.colormapDecode);
  setNumberUniform(uniforms, 'colormapMode', parameters.colormapMode);
  setNumberUniform(uniforms, 'vtBlendStrength', parameters.vtBlendStrength);
  setNumberUniform(uniforms, 'vtBlendHeight', parameters.vtBlendHeight);
  setColorUniform(uniforms, 'heightFogColor', parameters.heightFogColor);
  setColorUniform(uniforms, 'interiorOcclusionColor', parameters.interiorOcclusionColor);
  setColorUniform(uniforms, 'leftSideShadowColor', parameters.leftSideShadowColor);
  setColorUniform(uniforms, 'shadowTintColor', parameters.shadowTintColor);
  setColorUniform(uniforms, 'skyGroundTint', parameters.skyGroundTint);
  setColorUniform(uniforms, 'skyTopTint', parameters.skyTopTint);
  setColorUniform(uniforms, 'specularColor', parameters.specularColor);
  setColorUniform(uniforms, 'sunBoostColor', parameters.sunBoostColor);

  return material;
}

export function updateEnvironmentBoundsUniforms(material, environmentBox) {
  const uniforms = material?.uniforms;
  if (!uniforms || !environmentBox) return material;

  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  uniforms.environmentCenter?.value?.copy?.(center);
  uniforms.environmentSize?.value?.copy?.(size);
  return material;
}
