// Versioned, modular Grass Shader adapter for retained/source-authored grass.
//
// This is intentionally separate from the legacy vegetation material and
// style overlay. The accepted retained material remains an
// immutable fallback. V2 reconstructs a fresh source material, then layers
// independently switchable style modules whose Call Me Sensei correction is
// exactly zero in the neutral preview state.

import * as THREE from 'three';
import {
  abs,
  cameraPosition,
  clamp,
  cos,
  dot,
  faceDirection,
  Fn,
  fract,
  length,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

import {
  createToonLabSourceMaterialFromProfile,
} from '../environment/toonLabSourceMaterials.js';
import {
  buildSnowSurfaceLayer,
  createSnowSurfaceUniforms,
} from '../weather/snowSurfaceShader.js';
import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { stylizedCloudShadow } from '../shaders-tsl/chunks/stylized-cloud-shadow.js';
import { createVegetationStyleUniforms } from '../shaders-tsl/chunks/vegetation-style.js';
import {
  createVegetationShaderScopeSettings,
  getVegetationShaderScopeFieldSchema,
  tagVegetationMaterial,
  VEGETATION_MATERIAL_ROLES,
  VEGETATION_MATERIAL_VARIANTS,
} from './vegetationShaders.js';

export const RETAINED_GRASS_SHADER_V2_ID = 'retained-grass-v2';
export const RETAINED_GRASS_SHADER_V2_FALLBACK_ID = 'retained-legacy';

const SOURCE_MATERIAL_MATCH = '/MI_Grass.MI_Grass';
const LUMINANCE = vec3(0.2126, 0.7152, 0.0722);
const DEFORMATION_FIELDS = Object.freeze([
  'grass.bendExponent',
  'grass.interactionResponse',
]);
const DIRECT_SOURCE_BINDINGS = Object.freeze([
  Object.freeze(['grass.baseColor', 'vector', 'Base Color']),
  Object.freeze(['grass.tipBrightness', 'scalar', 'Tip Brightness']),
  Object.freeze(['grass.tipDesaturation', 'scalar', 'Tip Desaturation']),
  Object.freeze(['grass.tipHueShift', 'scalar', 'Tip Hue Shift']),
  Object.freeze(['grass.roughness', 'scalar', 'Roughness']),
  Object.freeze(['grass.specularStrength', 'scalar', 'Specular']),
  Object.freeze(['grass.emissiveStrength', 'scalar', 'Emissive Strength']),
]);
const DIRECT_SOURCE_FIELDS = new Set([
  'grass.styleColorStrength',
  ...DIRECT_SOURCE_BINDINGS.map(([path]) => path),
]);

function groupFields(groupId) {
  return Object.values(
    getVegetationShaderScopeFieldSchema('grass')[groupId] ?? {},
  ).map((field) => field.id);
}

const GRASS_SURFACE_FIELDS = Object.freeze(
  groupFields('grass').filter((path) => !DEFORMATION_FIELDS.includes(path)),
);

export const RETAINED_GRASS_SHADER_V2_MODULES = Object.freeze([
  Object.freeze({
    description: 'Shared vegetation shadow color, sun tint, sky fill, and rim.',
    fields: Object.freeze(groupFields('lighting')),
    id: 'lighting',
    label: 'Shared lighting',
  }),
  Object.freeze({
    description: 'Two-sided normals, diffuse wrap, and thin-card transmission.',
    fields: Object.freeze(groupFields('thinSurface')),
    id: 'thinSurface',
    label: 'Thin surface',
  }),
  Object.freeze({
    description: 'Wet and snow response over the retained source material.',
    fields: Object.freeze(groupFields('weatherResponse')),
    id: 'weather',
    label: 'Weather response',
  }),
  Object.freeze({
    description: 'Grass color, bands, dense-field response, and gust sheen.',
    fields: GRASS_SURFACE_FIELDS,
    id: 'surface',
    label: 'Grass surface',
  }),
  Object.freeze({
    description: 'Wind bend curve and response to a scene-owned interaction field.',
    fields: DEFORMATION_FIELDS,
    id: 'deformation',
    label: 'Grass deformation',
  }),
]);

const MODULE_BY_ID = new Map(
  RETAINED_GRASS_SHADER_V2_MODULES.map((module) => [module.id, module]),
);

export const RETAINED_GRASS_SHADER_V2_FIELD_EVIDENCE = Object.freeze(
  Object.fromEntries(RETAINED_GRASS_SHADER_V2_MODULES.flatMap((module) =>
    module.fields.map((field) => [
      field,
      Object.freeze({
        module: module.id,
        route: DEFORMATION_FIELDS.includes(field)
          ? 'vertex-node'
          : DIRECT_SOURCE_FIELDS.has(field)
            ? 'retained-source-profile'
            : 'fragment-node',
      }),
    ]))),
);

export function resolveRetainedGrassShaderV2Modules(selection = null) {
  if (selection == null) {
    return Object.freeze(RETAINED_GRASS_SHADER_V2_MODULES.map(({ id }) => id));
  }
  const requested = Array.isArray(selection)
    ? selection
    : typeof selection === 'string'
      ? selection.split(',')
      : Object.entries(selection)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([id]) => id);
  return Object.freeze([...new Set(requested
    .map((id) => String(id).trim())
    .filter((id) => MODULE_BY_ID.has(id)))]);
}

export function getRetainedGrassShaderV2Fields(selection = null) {
  const enabled = resolveRetainedGrassShaderV2Modules(selection);
  return Object.freeze([...new Set(enabled.flatMap(
    (moduleId) => MODULE_BY_ID.get(moduleId).fields,
  ))]);
}

export function isRetainedGrassShaderV2FieldSupported(
  fieldOrPath,
  selection = null,
) {
  const path = typeof fieldOrPath === 'string'
    ? fieldOrPath
    : fieldOrPath?.id;
  return getRetainedGrassShaderV2Fields(selection).includes(path);
}

function profileValue(settings, path) {
  const [groupId, key] = path.split('.');
  return settings[groupId]?.[key];
}

function writeSourceBinding(
  profile,
  baseProfile,
  settings,
  [path, kind, sourceName],
) {
  const value = profileValue(settings, path);
  if (kind === 'vector') {
    const alpha = profile.parameters.vector?.[sourceName]?.[3] ?? 1;
    const strength = Number(settings.grass.styleColorStrength);
    const source = baseProfile.parameters.vector?.[sourceName] ?? value;
    profile.parameters.vector[sourceName] = [
      source[0] * (1 - strength) + value[0] * strength,
      source[1] * (1 - strength) + value[1] * strength,
      source[2] * (1 - strength) + value[2] * strength,
      alpha,
    ];
    return;
  }
  profile.parameters.scalar[sourceName] = Number(value);
}

function settingsForModules(settings, baseline, enabledModules) {
  const enabled = new Set(enabledModules);
  const resolved = structuredClone(settings);
  if (!enabled.has('lighting')) resolved.lighting = structuredClone(baseline.lighting);
  if (!enabled.has('thinSurface')) {
    resolved.thinSurface = structuredClone(baseline.thinSurface);
  }
  if (!enabled.has('weather')) {
    resolved.weatherResponse = structuredClone(baseline.weatherResponse);
  }
  const currentGrass = { ...resolved.grass };
  if (!enabled.has('surface')) {
    for (const path of GRASS_SURFACE_FIELDS) {
      const key = path.split('.')[1];
      currentGrass[key] = baseline.grass[key];
    }
  }
  if (!enabled.has('deformation')) {
    for (const path of DEFORMATION_FIELDS) {
      const key = path.split('.')[1];
      currentGrass[key] = baseline.grass[key];
    }
  }
  resolved.grass = currentGrass;
  return resolved;
}

function withWorldState(uniforms, state) {
  const world = state?.uniforms ?? {};
  if (world.rainWetness) uniforms.uWetness.value = world.rainWetness.value;
  if (world.snowCover) uniforms.uSnowCover.value = world.snowCover.value;
  return uniforms;
}

function sharedInputs(state) {
  const world = state?.uniforms ?? {};
  return {
    cloudShadow: stylizedCloudShadow(
      positionWorld.xz,
      world.time,
      0.62,
      0.58,
      0.035,
      vec2(0.007, -0.004),
    ),
    sceneShadow: sampleEnvironmentSunShadow(positionWorld),
    skyColor: world.skyColor,
    sunColor: world.sunColor,
    sunDirection: normalize(world.sunDirection.negate()),
    time: world.time,
    windAngle: world.windAngle,
    windIntensity: world.windIntensity,
  };
}

function bladeHeightNode(hasUv2) {
  // The retained MI_Grass graph stores its root-to-tip ramp in UV2 with the
  // root at 1 and tip at 0. Match that authored orientation.
  return clamp((hasUv2 ? uv(2) : uv()).y.oneMinus(), 0, 1);
}

function stylizedNormal(u) {
  // Raw geometric normal: three's normalWorld is already flipped on
  // DoubleSide materials, so applying faceDirection to it undid the flip.
  const doubleSided = normalWorldGeometry.mul(faceDirection);
  const faceAware = mix(
    normalWorldGeometry,
    doubleSided,
    u.uStyleThinSurfaceTwoSidedLighting,
  );
  return normalize(mix(
    faceAware,
    vec3(0, 1, 0),
    u.uStyleThinSurfaceNormalUpBias,
  ));
}

function grassLightState(u, inputs) {
  const normal = stylizedNormal(u);
  const nDotL = clamp(dot(normal, inputs.sunDirection), 0, 1);
  const direct = clamp(
    nDotL.mul(u.uStyleThinSurfaceDiffuseWrap.oneMinus())
      .add(u.uStyleThinSurfaceDiffuseWrap),
    0,
    1,
  );
  const sceneVisibility = mix(
    1,
    inputs.sceneShadow,
    u.uStyleGrassSceneShadowResponse,
  );
  const cloudVisibility = mix(
    1,
    inputs.cloudShadow,
    u.uStyleGrassCloudShadowResponse,
  );
  const visibility = sceneVisibility.mul(cloudVisibility);
  const halfSoftness = max(u.uStyleGrassBandSoftness, 0.001).mul(0.5);
  const band = smoothstep(
    u.uStyleGrassBandThreshold.sub(halfSoftness),
    u.uStyleGrassBandThreshold.add(halfSoftness),
    direct,
  ).mul(visibility);
  return {
    band,
    direct,
    lit: direct.mul(visibility),
    normal,
    visibility,
  };
}

function applyGrassSurface(baseColor, u, inputs, light, height) {
  const color = baseColor.toVar();
  color.mulAssign(mix(u.uStyleGrassShadowFloor, 1, light.band));

  const rootFade = smoothstep(
    0,
    max(u.uStyleGrassRootOcclusionHeight, 0.001),
    height,
  );
  color.mulAssign(mix(
    u.uStyleGrassRootOcclusionStrength.oneMinus(),
    1,
    rootFade,
  ));

  const tip = smoothstep(
    u.uStyleGrassTipGradientStart,
    max(
      u.uStyleGrassTipGradientEnd,
      u.uStyleGrassTipGradientStart.add(0.001),
    ),
    height,
  );
  // The retained source already owns the root/tip palette. This module only
  // moves the authored transition, preserving that source identity.
  color.mulAssign(mix(0.94, 1.08, tip));

  const variation = fract(sin(
    dot(positionWorld.xz, vec2(12.9898, 78.233)),
  ).mul(43758.5453)).sub(0.5).mul(2);
  color.mulAssign(
    variation.mul(u.uStyleGrassColorVariationStrength).mul(0.28).add(1),
  );

  const gustSignal = sin(
    dot(positionWorld.xz, vec2(0.31, -0.23))
      .add(inputs.time.mul(2.4)),
  ).mul(0.5).add(0.5);
  const sheen = smoothstep(
    u.uStyleGrassGustSheenThreshold,
    1,
    gustSignal,
  ).mul(tip);
  const baseLuminance = max(dot(color, LUMINANCE), 0.025);
  color.addAssign(
    inputs.sunColor
      .mul(sheen)
      .mul(u.uStyleGrassGustSheenStrength)
      .mul(baseLuminance)
      .mul(0.55),
  );
  return color;
}

function applySharedLighting(baseColor, u, inputs, light) {
  const color = baseColor.toVar();
  const shadowAmount = clamp(
    light.lit.oneMinus().mul(u.uStyleLightingShadowTintStrength),
    0,
    1,
  );
  const baseLuminance = max(dot(color, LUMINANCE), 0.025);
  const tintLuminance = max(dot(u.uStyleLightingShadowTint, LUMINANCE), 0.025);
  const luminancePreservingTint = u.uStyleLightingShadowTint
    .mul(baseLuminance.div(tintLuminance));
  color.assign(mix(color, luminancePreservingTint, shadowAmount));
  color.mulAssign(mix(
    vec3(1),
    inputs.sunColor,
    light.lit.mul(u.uStyleLightingSunTintStrength),
  ));
  color.addAssign(
    inputs.skyColor
      .mul(light.lit.oneMinus())
      .mul(u.uStyleLightingSkyFillStrength)
      .mul(baseLuminance),
  );

  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(
    clamp(abs(dot(light.normal, viewDirection)).oneMinus(), 0, 1),
    u.uStyleLightingRimPower,
  );
  color.addAssign(
    inputs.skyColor
      .mul(rim)
      .mul(u.uStyleLightingRimStrength)
      .mul(baseLuminance),
  );
  return { color, rim, viewDirection };
}

function applyThinSurface(baseColor, u, inputs, light, viewDirection) {
  const color = baseColor.toVar();
  const transmission = pow(
    clamp(dot(viewDirection, inputs.sunDirection.negate()), 0, 1),
    u.uStyleThinSurfaceTransmissionPower,
  ).mul(u.uStyleThinSurfaceTransmissionStrength)
    .mul(u.uStyleGrassBacklitStrength);
  const baseLuminance = max(dot(color, LUMINANCE), 0.025);
  color.addAssign(
    inputs.sunColor
      .mul(transmission)
      .mul(mix(
        u.uStyleThinSurfaceTransmissionShadowFloor,
        1,
        light.visibility,
      ))
      .mul(baseLuminance),
  );
  return color;
}

function applyWeather(
  baseColor,
  u,
  inputs,
  light,
  height,
  snowSurfaceUniforms,
) {
  const color = baseColor.toVar();
  const wet = clamp(u.uWetness.mul(u.uWetnessResponse), 0, 1);
  color.mulAssign(wet.mul(u.uStyleWeatherResponseWetDarkening).oneMinus());
  const wetLuminance = dot(color, LUMINANCE);
  color.assign(mix(
    color,
    vec3(wetLuminance),
    wet.mul(u.uStyleWeatherResponseWetDesaturation),
  ));
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const wetRim = pow(
    clamp(abs(dot(light.normal, viewDirection)).oneMinus(), 0, 1),
    u.uStyleLightingRimPower,
  );
  color.addAssign(
    inputs.sunColor
      .mul(wet)
      .mul(u.uStyleWeatherResponseWetHighlightStrength)
      .mul(wetRim.mul(0.5).add(0.08)),
  );

  const retentionNoise = fract(sin(
    dot(positionWorld.xz, vec2(43.17, 19.31)),
  ).mul(15731.743));
  const snowSoftness = max(
    u.uStyleWeatherResponseSnowEdgeSoftness,
    0.001,
  );
  const snowAmount = clamp(
    u.uSnowCover.mul(u.uSnowRetention),
    0,
    1,
  );
  const blanket = smoothstep(0.08, 0.72, snowAmount);
  const emergenceStart = mix(0.18, 0.55, retentionNoise);
  const exposedBlade = smoothstep(
    emergenceStart,
    emergenceStart.add(snowSoftness).add(0.1),
    height,
  );
  const upwardDeposit = smoothstep(
    floatHalf().sub(snowSoftness.mul(0.5)),
    floatHalf().add(snowSoftness.mul(0.5)),
    light.normal.y,
  );
  const tipDeposit = blanket
    .mul(exposedBlade)
    .mul(smoothstep(0.82, 1, height))
    .mul(upwardDeposit)
    .mul(0.8);
  const snow = clamp(tipDeposit, 0, 1);
  const snowLayer = buildSnowSurfaceLayer({
    baseColor: color,
    coverage: snow,
    geometryNormal: light.normal,
    position: positionWorld,
    uniforms: snowSurfaceUniforms,
  });
  const vegetationSnow = snowLayer.snowColor
    .mul(u.uStyleWeatherResponseSnowTint)
    .mul(mix(
      u.uStyleWeatherResponseSnowShadowStrength,
      1,
      light.visibility,
    ));
  color.assign(mix(color, vegetationSnow, snowLayer.coverage));
  return color;
}

function floatHalf() {
  return mix(0, 1, 0.5);
}

function createColorCorrection({
  baselineUniforms,
  currentUniforms,
  enabledModules,
  hasUv2,
  retainedColor,
  snowSurfaceUniforms,
  state,
}) {
  const enabled = new Set(enabledModules);
  return Fn(() => {
    const inputs = sharedInputs(state);
    const height = bladeHeightNode(hasUv2);

    const evaluate = (u) => {
      const light = grassLightState(u, inputs);
      let color = retainedColor;
      if (enabled.has('surface')) {
        color = applyGrassSurface(color, u, inputs, light, height);
      }
      let lighting = {
        color,
        viewDirection: normalize(cameraPosition.sub(positionWorld)),
      };
      if (enabled.has('lighting')) {
        lighting = applySharedLighting(color, u, inputs, light);
        color = lighting.color;
      }
      if (enabled.has('thinSurface')) {
        color = applyThinSurface(
          color,
          u,
          inputs,
          light,
          lighting.viewDirection,
        );
      }
      return { color, light };
    };

    const current = evaluate(currentUniforms);
    const accepted = evaluate(baselineUniforms);
    let styled = retainedColor.add(current.color.sub(accepted.color));
    if (enabled.has('weather')) {
      styled = applyWeather(
        styled,
        currentUniforms,
        inputs,
        current.light,
        height,
        snowSurfaceUniforms,
      );
    }
    return styled.sub(retainedColor);
  })();
}

function createPositionCorrection({
  baselineUniforms,
  currentUniforms,
  enabledModules,
  hasUv2,
  interaction,
  state,
}) {
  const deformationEnabled = enabledModules.includes('deformation');
  const weatherEnabled = enabledModules.includes('weather');
  if (!deformationEnabled && !weatherEnabled) return vec3(0);
  return Fn(() => {
    const inputs = sharedInputs(state);
    const height = bladeHeightNode(hasUv2);
    const offset = vec3(0).toVar();
    if (deformationEnabled) {
      const currentBend = pow(
        max(height, 0.001),
        currentUniforms.uStyleGrassBendExponent,
      );
      const acceptedBend = pow(
        max(height, 0.001),
        baselineUniforms.uStyleGrassBendExponent,
      );
      const windDirection = normalize(vec2(
        cos(inputs.windAngle.mul(Math.PI * 2)),
        sin(inputs.windAngle.mul(Math.PI * 2)),
      ).add(vec2(0.0001, 0)));
      const windPhase = inputs.time.mul(2.1)
        .add(positionLocal.x.mul(0.37))
        .add(positionLocal.z.mul(0.29));
      const bendDelta = currentBend.sub(acceptedBend)
        .mul(sin(windPhase))
        .mul(inputs.windIntensity)
        .mul(0.16);
      offset.addAssign(vec3(
        windDirection.x.mul(bendDelta),
        0,
        windDirection.y.mul(bendDelta),
      ));

      const fromInteraction = positionLocal.xz.sub(interaction.position.xz);
      const distanceFromInteraction = length(fromInteraction);
      const interactionMask = smoothstep(
        interaction.radius,
        0,
        distanceFromInteraction,
      ).mul(interaction.amount)
        .mul(currentUniforms.uStyleGrassInteractionResponse)
        .mul(currentBend);
      const pushDirection = normalize(fromInteraction.add(vec2(0.0001, 0)));
      offset.addAssign(vec3(
        pushDirection.x.mul(0.28),
        -0.12,
        pushDirection.y.mul(0.28),
      ).mul(interactionMask));
    }
    if (weatherEnabled) {
      const burialNoise = fract(sin(
        dot(positionLocal.xz, vec2(37.71, 91.13)),
      ).mul(17423.873));
      const deepSnow = smoothstep(
        0.08,
        0.72,
        clamp(
          currentUniforms.uSnowCover.mul(currentUniforms.uSnowRetention),
          0,
          1,
        ),
      );
      offset.y.subAssign(
        deepSnow.mul(mix(0.2, 1, burialNoise)),
      );
    }
    return offset;
  })();
}

function createInteractionUniforms({
  interactionAmount = 0,
  interactionPositionLocal = [0, 0, 0],
  interactionRadius = 3,
} = {}) {
  return {
    amount: uniform(Number(interactionAmount) || 0),
    position: uniform(new THREE.Vector3(
      Number(interactionPositionLocal[0]) || 0,
      Number(interactionPositionLocal[1]) || 0,
      Number(interactionPositionLocal[2]) || 0,
    )),
    radius: uniform(Math.max(Number(interactionRadius) || 3, 0.001)),
  };
}

function allGrassFields() {
  return Object.values(getVegetationShaderScopeFieldSchema('grass'))
    .flatMap((group) => Object.values(group));
}

export async function createRetainedGrassShaderV2Material(
  sourceMaterial,
  settings = {},
  {
    hasUv2 = false,
    hasVertexColors = false,
    library,
    modules = null,
    sourceAssetName = 'Demonstration_ToonLabShowcase',
    sourceSceneVariant = 'landscape-auto-grass',
    state,
    ...interactionOptions
  } = {},
) {
  if (!sourceMaterial?.isMaterial || !library || !state?.uniforms) return null;
  const originalMaterial =
    sourceMaterial.userData?.toonlabRetainedGrassShaderV2?.originalMaterial
    ?? sourceMaterial;
  const materialPath = originalMaterial.userData?.toonLabSource?.materialPath;
  if (!materialPath?.endsWith(SOURCE_MATERIAL_MATCH)) return null;

  const baseline = createVegetationShaderScopeSettings('grass', {
    preset: 'call_me_sensei',
  });
  const enabledModules = resolveRetainedGrassShaderV2Modules(modules);
  const requested = createVegetationShaderScopeSettings('grass', settings);
  const resolvedSettings = settingsForModules(
    requested,
    baseline,
    enabledModules,
  );
  const baseProfile = library.resolveMaterial(materialPath);
  if (!baseProfile) {
    throw new Error(`Grass V2 could not resolve retained material ${materialPath}.`);
  }
  const sourceProfile = structuredClone(baseProfile);
  if (enabledModules.includes('surface')) {
    for (const binding of DIRECT_SOURCE_BINDINGS) {
      writeSourceBinding(sourceProfile, baseProfile, resolvedSettings, binding);
    }
  }
  // V2 owns its weather response. Keep the retained MI_Grass graph dry so its
  // legacy full-card whitening cannot stack under the modular accumulation,
  // burial, and exposed-tip treatment below.
  const retainedSourceState = {
    ...state,
    uniforms: {
      ...state.uniforms,
      snowCover: uniform(0),
    },
  };
  const material = await createToonLabSourceMaterialFromProfile(sourceProfile, {
    hasUv2,
    hasVertexColors,
    library,
    sourceAssetName,
    sourceSceneVariant,
    state: retainedSourceState,
  });
  material.name = 'ToonLab Grass Shader V2 · retained source';
  tagVegetationMaterial(material, {
    roles: [VEGETATION_MATERIAL_ROLES.grassBlade],
    variant: VEGETATION_MATERIAL_VARIANTS.cutout,
  });

  const currentUniforms = withWorldState(
    createVegetationStyleUniforms(
      resolvedSettings,
      VEGETATION_MATERIAL_ROLES.grassBlade,
    ),
    state,
  );
  const baselineUniforms = createVegetationStyleUniforms(
    baseline,
    VEGETATION_MATERIAL_ROLES.grassBlade,
  );
  const interaction = createInteractionUniforms(interactionOptions);
  const snowSurfaceUniforms = createSnowSurfaceUniforms();
  const retainedColor = material.colorNode;
  const colorCorrection = createColorCorrection({
    baselineUniforms,
    currentUniforms,
    enabledModules,
    hasUv2,
    retainedColor,
    snowSurfaceUniforms,
    state,
  });
  // Apply the modular delta to albedo. Adding it to emissive would make snow,
  // shadow tint, and wet response bypass scene lighting and blow out under the
  // accepted daylight rig.
  material.colorNode = retainedColor.add(colorCorrection);
  material.positionNode = (material.positionNode ?? positionLocal).add(
    createPositionCorrection({
      baselineUniforms,
      currentUniforms,
      enabledModules,
      hasUv2,
      interaction,
      state,
    }),
  );
  material.uniforms = {
    ...(material.uniforms ?? {}),
    ...currentUniforms,
    ...snowSurfaceUniforms,
    uGrassV2InteractionAmount: interaction.amount,
    uGrassV2InteractionPosition: interaction.position,
    uGrassV2InteractionRadius: interaction.radius,
  };
  material.needsUpdate = true;
  const mappedFields = getRetainedGrassShaderV2Fields(enabledModules);
  material.userData.toonlabRetainedGrassShaderV2 = {
    adapter: RETAINED_GRASS_SHADER_V2_ID,
    fieldEvidence: RETAINED_GRASS_SHADER_V2_FIELD_EVIDENCE,
    mappedFields,
    modules: enabledModules,
    originalMaterial,
    settings: resolvedSettings,
    sourceMaterial: materialPath,
  };
  return material;
}

export async function applyRetainedGrassShaderV2(
  root,
  settings = {},
  context = {},
) {
  const enabledModules = resolveRetainedGrassShaderV2Modules(context.modules);
  const mappedFields = getRetainedGrassShaderV2Fields(enabledModules);
  const jobs = [];
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const sources = Array.isArray(object.material)
      ? object.material
      : [object.material];
    jobs.push(Promise.all(sources.map(async (source) => {
      const original =
        source.userData?.toonlabRetainedGrassShaderV2?.originalMaterial
        ?? source;
      try {
        const material = await createRetainedGrassShaderV2Material(
          original,
          settings,
          {
            ...context,
            hasUv2: Boolean(object.geometry?.attributes?.uv2),
            hasVertexColors: Boolean(object.geometry?.attributes?.color),
          },
        );
        return { fallback: false, material: material ?? original };
      } catch (error) {
        return { error, fallback: true, material: original };
      }
    })).then((results) => ({
      object,
      results,
      wasArray: Array.isArray(object.material),
    })));
  });

  const assignments = await Promise.all(jobs);
  const errors = [];
  let applied = 0;
  let fallback = 0;
  let visited = 0;
  for (const { object, results, wasArray } of assignments) {
    visited += results.length;
    for (const result of results) {
      if (result.material.userData?.toonlabRetainedGrassShaderV2) applied += 1;
      if (result.fallback) {
        fallback += 1;
        errors.push(result.error?.message ?? 'Grass V2 material creation failed.');
      }
    }
    const materials = results.map(({ material }) => material);
    object.material = wasArray ? materials : materials[0];
  }
  const supported = new Set(mappedFields);
  const unsupported = allGrassFields()
    .filter((field) => !supported.has(field.id))
    .map((field) => ({
      field: field.id,
      reason: `Grass V2 module for ${field.id} is disabled.`,
    }));
  return {
    adapter: RETAINED_GRASS_SHADER_V2_ID,
    applied,
    errors,
    fallback,
    fallbackAdapter: RETAINED_GRASS_SHADER_V2_FALLBACK_ID,
    matched: applied,
    modules: enabledModules,
    skipped: visited - applied,
    unsupported,
    visited,
    writes: applied > 0 ? mappedFields.length : 0,
  };
}

export function syncRetainedGrassShaderV2Runtime(
  root,
  {
    interactionAmount,
    interactionPositionLocal,
    interactionRadius,
    snowCover,
    wetness,
  } = {},
) {
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!material?.userData?.toonlabRetainedGrassShaderV2) continue;
      if (interactionAmount !== undefined) {
        material.uniforms.uGrassV2InteractionAmount.value = interactionAmount;
      }
      if (interactionPositionLocal !== undefined) {
        material.uniforms.uGrassV2InteractionPosition.value.fromArray(
          interactionPositionLocal,
        );
      }
      if (interactionRadius !== undefined) {
        material.uniforms.uGrassV2InteractionRadius.value = Math.max(
          interactionRadius,
          0.001,
        );
      }
      if (snowCover !== undefined) material.uniforms.uSnowCover.value = snowCover;
      if (wetness !== undefined) material.uniforms.uWetness.value = wetness;
    }
  });
}

export function restoreRetainedGrassShaderV2(root) {
  let restored = 0;
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const next = materials.map((material) => {
      const original =
        material.userData?.toonlabRetainedGrassShaderV2?.originalMaterial;
      if (!original) return material;
      restored += 1;
      return original;
    });
    object.material = Array.isArray(object.material) ? next : next[0];
  });
  return restored;
}

export function disposeRetainedGrassShaderV2Materials(root) {
  const disposed = new Set();
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (
        material?.userData?.toonlabRetainedGrassShaderV2
        && !disposed.has(material)
      ) {
        disposed.add(material);
        material.dispose?.();
      }
    }
  });
  return disposed.size;
}
