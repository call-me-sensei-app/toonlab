// TSL ground material shared by the Ground Shader Lab and Landscape runtime.
// The portable profile controls response; splat weights, textures, current
// lighting, weather, and water level are explicit scene/asset inputs.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  distance,
  dot,
  Fn,
  max,
  mix,
  normalWorldGeometry,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

import { worldFbm2 } from '../shaders-tsl/chunks/world-noise.js';
import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import {
  createGroundShaderSettings,
  GROUND_SHADER_FIELD_SCHEMA,
  GROUND_SHADER_SCHEMA_VERSION,
} from './groundShaderSettings.js';

function configureSplatTexture(map) {
  map.name = 'GroundShaderSplatWeights';
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.flipY = false;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  return map;
}

function configureLayerTexture(map) {
  if (!map) return null;
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

function makeUniform(value) {
  if (Array.isArray(value)) {
    return uniform(new THREE.Color().setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace));
  }
  return uniform(value);
}

function buildStyleUniforms(settings) {
  const uniforms = {};
  for (const [groupId, fields] of Object.entries(GROUND_SHADER_FIELD_SCHEMA)) {
    for (const [key, field] of Object.entries(fields)) {
      uniforms[field.uniform] = makeUniform(settings[groupId][key]);
    }
  }
  return uniforms;
}

function setUniformValue(node, value) {
  if (Array.isArray(value) && node.value?.isColor) {
    node.value.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace);
  } else {
    node.value = Array.isArray(value) ? [...value] : value;
  }
}

function cloneSettings(settings) {
  return Object.fromEntries(Object.entries(settings).map(([groupId, group]) => [
    groupId,
    Object.fromEntries(Object.entries(group).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ])),
  ]));
}

function collectMaterials(target, output = new Set()) {
  if (!target) return output;
  if (Array.isArray(target)) {
    target.forEach((entry) => collectMaterials(entry, output));
    return output;
  }
  if (target.isMaterial) {
    output.add(target);
    return output;
  }
  const append = (object) => {
    const materials = Array.isArray(object?.material) ? object.material : [object?.material];
    materials.filter(Boolean).forEach((material) => output.add(material));
  };
  append(target);
  target.traverse?.((object) => {
    if (object !== target) append(object);
  });
  return output;
}

const GROUND_SOURCE_TEXTURE_KEYS = Object.freeze([
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
]);

function collectGroundMeshes(target) {
  if (!target?.isObject3D) return [];
  const meshes = [];
  const append = (object) => {
    if (object?.isMesh && object.material) meshes.push(object);
  };
  append(target);
  target.traverse?.((object) => {
    if (object !== target) append(object);
  });
  return meshes;
}

function createConvertedGroundMaterial(source, settings) {
  const unsupportedTextures = GROUND_SOURCE_TEXTURE_KEYS
    .filter((key) => key !== 'map' && source?.[key]?.isTexture);
  if (unsupportedTextures.length > 0) {
    throw new TypeError(
      `Ground Shader cannot preserve source texture inputs: ${unsupportedTextures.join(', ')}.`,
    );
  }

  // Ground textures are sampled in world space and therefore need repeat
  // wrapping. Work on a clone so applying and reverting a style bundle never
  // mutates the developer's source texture object.
  const sourceMap = source?.map?.isTexture ? source.map : null;
  const layerMap = sourceMap?.clone?.() ?? null;
  const material = createGroundShaderMaterial({
    field: {
      splat: new Uint8Array([255, 0, 0, 0]),
      splatD: 1,
      splatW: 1,
    },
    layers: layerMap ? [{ texture: layerMap }] : [],
    settings,
  });
  material.name = source?.name
    ? `${source.name} — ToonLab Ground Shader`
    : 'ToonLab Ground Shader';
  material.userData.toonlabMaterialId = source?.userData?.toonlabMaterialId ?? 'GroundSurface';
  material.userData.toonlabConvertedFromMaterial = source?.uuid ?? null;
  material.userData.toonlabSourceTextureIds = sourceMap?.uuid ? [sourceMap.uuid] : [];
  if (layerMap) {
    material.userData.toonlabOwnedLayerTextures = [layerMap];
    material.addEventListener('dispose', () => layerMap.dispose());
  }
  return material;
}

function layerTintOverrides(layers) {
  const keys = ['grassTint', 'dirtTint', 'rockTint', 'sandTint'];
  const overrides = {};
  keys.forEach((key, index) => {
    if (Array.isArray(layers[index]?.tint)) overrides[key] = layers[index].tint;
  });
  return overrides;
}

function resolveGroundPrintLayer(value) {
  if (value == null) return null;
  if (!value.texture?.isTexture) {
    throw new TypeError('Ground Shader printLayer needs a GroundPrintLayer or an object with a texture.');
  }
  return value;
}

/**
 * Creates the canonical Ground Shader material.
 *
 * `field` owns the RGBA splat brick. `layers` may provide asset textures and
 * compatibility tints. `settings` is the reusable Ground Shader profile.
 */
export function createGroundShaderMaterial({
  field,
  layers = [],
  printLayer = null,
  settings = {},
} = {}) {
  if (!field?.splat || !field.splatW || !field.splatD) {
    throw new TypeError('Ground Shader needs a field with RGBA splat weights.');
  }

  let resolvedSettings = createGroundShaderSettings({
    ...settings,
    layers: {
      ...(settings.layers ?? {}),
      ...layerTintOverrides(layers),
    },
  });
  const splatTexture = configureSplatTexture(new THREE.DataTexture(
    field.splat,
    field.splatW,
    field.splatD,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  ));
  const layerTextures = Array.from({ length: 4 }, (_, index) => (
    configureLayerTexture(layers[index]?.texture ?? layers[index]?.map ?? null)
  ));
  let groundPrintLayer = resolveGroundPrintLayer(printLayer);
  let printTexture = groundPrintLayer?.texture ?? null;
  const printTexelSize = uniform(new THREE.Vector2(
    1 / Math.max(printTexture?.image?.width ?? 1, 1),
    1 / Math.max(printTexture?.image?.height ?? 1, 1),
  ));
  const styleUniforms = buildStyleUniforms(resolvedSettings);
  const sceneUniforms = {
    uSceneGroundPrintVisibility: uniform(1),
    uSceneGroundSnowCover: uniform(0),
    uSceneGroundSnowDepth: uniform(0),
    uSceneGroundShadowDebug: uniform(0),
    uSceneGroundSunColor: uniform(new THREE.Color(0xfff0d2)),
    uSceneGroundSunIntensity: uniform(1),
    uSceneGroundSkyIntensity: uniform(1),
    uSceneGroundSunDirection: uniform(new THREE.Vector3(0.45, 0.75, 0.5).normalize()),
    uSceneGroundSkyColor: uniform(new THREE.Color(0xc7dcff)),
    uSceneGroundWaterLevel: uniform(-10000),
    uSceneGroundWetness: uniform(0),
  };

  const u = (groupId, key) => styleUniforms[GROUND_SHADER_FIELD_SCHEMA[groupId][key].uniform];
  // The graph below computes the complete stylized sun/sky/shadow response.
  // A lit NodeMaterial would apply renderer lighting a second time and crush
  // the accepted ground colors, especially under the blue daytime fill.
  const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  material.name = 'ToonLab Ground Shader';
  material.uniforms = { ...styleUniforms, ...sceneUniforms };
  let groundColorVariant = null;

  function sampleProjectedLayer(index, scale) {
    const map = layerTextures[index];
    if (!map) return vec3(1);
    // World-space scale is the Ground Shader contract. Imported textures
    // often carry legacy repeat/offset matrices for mesh UV materials; TSL's
    // TextureNode applies that matrix even to an explicit sample UV unless it
    // is disabled. Applying both transforms turns (for example) a 16 m style
    // tile with repeat=64 into a 0.25 m tile and produces severe distance
    // moire that resembles striped shadows.
    const mapNode = texture(map).setUpdateMatrix(false);
    const safeScale = max(scale, 0.001);
    const planar = mapNode.sample(positionWorld.xz.div(safeScale)).rgb;
    const weights = pow(abs(normalWorldGeometry), vec3(u('projection', 'triplanarSharpness'))).toVar();
    const total = max(weights.x.add(weights.y).add(weights.z), 0.0001);
    const triplanar = mapNode.sample(positionWorld.zy.div(safeScale)).rgb.mul(weights.x)
      .add(mapNode.sample(positionWorld.xz.div(safeScale)).rgb.mul(weights.y))
      .add(mapNode.sample(positionWorld.xy.div(safeScale)).rgb.mul(weights.z))
      .div(total);
    const steepness = abs(normalWorldGeometry.y).oneMinus();
    const projectionBlend = steepness.mul(u('projection', 'triplanarStrength')).clamp(0, 1);
    return mix(planar, triplanar, projectionBlend);
  }

  function shoreWetMaskNode() {
    return smoothstep(
      0,
      u('shoreline', 'wetBandWidth').add(0.001),
      abs(positionWorld.y.sub(sceneUniforms.uSceneGroundWaterLevel)),
    ).oneMinus();
  }

  function currentWetnessNode() {
    return clamp(
      sceneUniforms.uSceneGroundWetness.add(shoreWetMaskNode().mul(0.55)),
      0,
      1,
    );
  }

  function sampleWorldFbmTriplanar(scale) {
    const safeScale = max(scale, 0.0001);
    const weights = pow(abs(normalWorldGeometry), vec3(u('projection', 'triplanarSharpness'))).toVar();
    const total = max(weights.x.add(weights.y).add(weights.z), 0.0001);
    return worldFbm2(positionWorld.zy.mul(safeScale)).mul(weights.x)
      .add(worldFbm2(positionWorld.xz.mul(safeScale)).mul(weights.y))
      .add(worldFbm2(positionWorld.xy.mul(safeScale)).mul(weights.z))
      .div(total);
  }

  function buildGroundColorNode({ includeLighting = true } = {}) {
    return Fn(() => {
    const weights = texture(splatTexture, uv());
    const total = max(weights.r.add(weights.g).add(weights.b).add(weights.a), 0.0001);
    const channels = [weights.r, weights.g, weights.b, weights.a];
    const tintNodes = [
      u('layers', 'grassTint'),
      u('layers', 'dirtTint'),
      u('layers', 'rockTint'),
      u('layers', 'sandTint'),
    ];
    const scaleNodes = [
      u('projection', 'grassScale'),
      u('projection', 'dirtScale'),
      u('projection', 'rockScale'),
      u('projection', 'sandScale'),
    ];
    const layerNodes = tintNodes.map((tintNode, index) => {
      const detail = sampleProjectedLayer(index, scaleNodes[index]);
      return tintNode.mul(mix(vec3(1), detail, u('layers', 'textureStrength')));
    });

    let groundColor = vec3(0).toVar();
    layerNodes.forEach((layerNode, index) => {
      groundColor.addAssign(layerNode.mul(channels[index].div(total)));
    });

    const viewDistance = distance(cameraPosition, positionWorld).toVar();
    const distanceMask = smoothstep(
      u('distance', 'start'),
      max(u('distance', 'end'), u('distance', 'start').add(0.001)),
      viewDistance,
    ).toVar();
    const detailRetention = clamp(
      distanceMask.mul(u('distance', 'detailFade')).oneMinus(),
      0,
      1,
    ).toVar();

    const slopeNoise = worldFbm2(
      positionWorld.xz.mul(max(u('slope', 'noiseScale'), 0.0001)),
    ).sub(0.5).mul(2).mul(u('slope', 'noiseStrength'));
    const slopeValue = abs(normalWorldGeometry.y).oneMinus().add(slopeNoise).toVar();
    const steepMask = smoothstep(
      u('slope', 'start'),
      u('slope', 'start').add(max(u('slope', 'fade'), 0.001)),
      slopeValue,
    ).toVar();
    groundColor.assign(mix(
      groundColor,
      layerNodes[2],
      steepMask.mul(u('slope', 'autoRockStrength')).clamp(0, 1),
    ));
    const lip = steepMask.mul(steepMask.oneMinus()).mul(4)
      .mul(clamp(normalWorldGeometry.y, 0, 1))
      .mul(u('slope', 'edgeHighlight'));
    groundColor.mulAssign(mix(vec3(1), vec3(1.22, 1.15, 1.03), lip));

    const shoreDistance = abs(positionWorld.y.sub(sceneUniforms.uSceneGroundWaterLevel));
    const shoreMask = smoothstep(
      u('shoreline', 'bandWidth'),
      u('shoreline', 'bandWidth').add(u('shoreline', 'softness')),
      shoreDistance,
    ).oneMinus().mul(steepMask.oneMinus()).toVar();
    groundColor.assign(mix(
      groundColor,
      layerNodes[3],
      shoreMask.mul(u('shoreline', 'autoSandStrength')).clamp(0, 1),
    ));
    const shoreWetMask = shoreWetMaskNode();
    groundColor.mulAssign(
      vec3(1).sub(shoreWetMask.mul(u('shoreline', 'wetBandDarkening'))),
    );

    const macroPrimary = worldFbm2(positionWorld.xz.mul(u('macro', 'scale')));
    const macroSecondary = worldFbm2(
      positionWorld.xz.mul(u('macro', 'secondaryScale')).add(vec2(37.2, 11.9)),
    );
    const macroDelta = macroPrimary.sub(0.5).mul(u('macro', 'amount'))
      .add(macroSecondary.sub(0.5).mul(u('macro', 'secondaryAmount')))
      .mul(detailRetention);
    groundColor.mulAssign(vec3(1).add(macroDelta));
    groundColor.assign(mix(
      groundColor,
      groundColor.mul(u('macro', 'tint')),
      macroPrimary.mul(u('macro', 'tintStrength')).mul(detailRetention).clamp(0, 1),
    ));

    // A camera-visible cliff must never collapse to a flat tint merely
    // because the consumer omitted optional authored layer maps. Add a
    // triplanar geological breakup plus predominantly horizontal strata,
    // limited to steep surfaces and faded with the normal detail budget.
    const rockDetail = sampleWorldFbmTriplanar(u('macro', 'rockDetailScale')).toVar();
    const rockStrata = worldFbm2(vec2(
      positionWorld.y.mul(u('macro', 'rockStrataScale')),
      positionWorld.x.add(positionWorld.z).mul(0.075),
    )).toVar();
    const geologicalDelta = rockDetail.sub(0.5).mul(u('macro', 'rockDetailAmount'))
      .add(rockStrata.sub(0.5).mul(u('macro', 'rockStrataAmount')))
      .mul(steepMask)
      .mul(detailRetention);
    groundColor.mulAssign(vec3(1).add(geologicalDelta));
    groundColor.assign(mix(
      groundColor,
      groundColor.mul(mix(vec3(0.72, 0.79, 0.86), vec3(1.08, 1.02, 0.92), rockDetail)),
      steepMask.mul(0.18).mul(detailRetention),
    ));

    const luminance = dot(groundColor, vec3(0.2126, 0.7152, 0.0722));
    groundColor.assign(mix(vec3(luminance), groundColor, u('layers', 'saturation')));
    groundColor.assign(
      groundColor.sub(0.5).mul(u('layers', 'contrast')).add(0.5)
        .add(u('layers', 'brightness')),
    );
    const microOcclusion = slopeValue.mul(0.55)
      .add(macroSecondary.oneMinus().mul(0.45))
      .mul(u('material', 'microOcclusionStrength'));
    groundColor.mulAssign(vec3(1).sub(microOcclusion.clamp(0, 0.75)));

    const wetness = currentWetnessNode().toVar();
    const wetLuminance = dot(groundColor, vec3(0.2126, 0.7152, 0.0722));
    groundColor.assign(mix(
      groundColor,
      vec3(wetLuminance),
      wetness.mul(u('weatherResponse', 'wetDesaturation')),
    ));
    groundColor.mulAssign(
      vec3(1).sub(wetness.mul(u('weatherResponse', 'wetDarkening'))),
    );

    const substrateColor = groundColor.toVar();
    const snowSlope = smoothstep(
      u('weatherResponse', 'snowSlopeStart'),
      u('weatherResponse', 'snowSlopeStart').add(max(u('weatherResponse', 'snowSoftness'), 0.001)),
      normalWorldGeometry.y,
    );
    const snowMask = sceneUniforms.uSceneGroundSnowCover
      .mul(u('weatherResponse', 'snowStrength'))
      .mul(snowSlope)
      .clamp(0, 1);
    groundColor.assign(mix(groundColor, u('weatherResponse', 'snowTint'), snowMask));

    let printCompression = null;
    let printEligibility = null;
    if (printTexture) {
      const printSample = texture(printTexture, uv()).rgb.toVar();
      const dirtWeight = channels[1].div(total).toVar();
      const sandWeight = channels[3].div(total).toVar();
      const dirtPrintable = smoothstep(0.025, 0.45, dirtWeight)
        .mul(u('printResponse', 'dirtStrength'));
      const sandPrintable = smoothstep(0.015, 0.18, sandWeight)
        .mul(u('printResponse', 'sandStrength'));
      const snowPrintable = snowMask
        .mul(smoothstep(0.005, 0.04, sceneUniforms.uSceneGroundSnowDepth))
        .mul(u('printResponse', 'snowStrength'));
      printEligibility = max(max(dirtPrintable, sandPrintable), snowPrintable)
        .mul(u('printResponse', 'strength'))
        .mul(sceneUniforms.uSceneGroundPrintVisibility)
        .clamp(0, 1)
        .toVar();
      printCompression = printSample.r.mul(printEligibility).clamp(0, 1).toVar();
      const raisedRim = printSample.g.mul(printEligibility).clamp(0, 1).toVar();
      const snowReveal = printSample.r
        .mul(snowPrintable)
        .mul(u('printResponse', 'strength'))
        .mul(sceneUniforms.uSceneGroundPrintVisibility)
        .clamp(0, 1);
      const compressedSnow = mix(
        substrateColor,
        u('weatherResponse', 'snowTint').mul(vec3(0.62, 0.68, 0.78)),
        0.72,
      );
      groundColor.assign(mix(groundColor, compressedSnow, snowReveal));
      groundColor.mulAssign(
        vec3(1).sub(printCompression.mul(u('printResponse', 'depressionDarkening'))),
      );
      groundColor.mulAssign(
        vec3(1).add(raisedRim.mul(u('printResponse', 'rimLightening'))),
      );
    }

    // Ground-field writers need the same splat/detail/weather albedo without
    // the view-dependent sun, sky, rim, or specular response. The reference
    // virtual-texture path provides surface color here; consumers light that
    // color for themselves.
    if (!includeLighting) return groundColor.clamp(0, 4);

    let normal = normalize(normalWorldGeometry);
    if (printTexture && printEligibility) {
      const printMap = texture(printTexture);
      const printUv = uv().toVar();
      const left = printMap.sample(printUv.sub(vec2(printTexelSize.x, 0))).r;
      const right = printMap.sample(printUv.add(vec2(printTexelSize.x, 0))).r;
      const down = printMap.sample(printUv.sub(vec2(0, printTexelSize.y))).r;
      const up = printMap.sample(printUv.add(vec2(0, printTexelSize.y))).r;
      const normalStrength = u('printResponse', 'normalStrength').mul(printEligibility);
      normal = normalize(normal.add(vec3(
        left.sub(right).mul(normalStrength),
        0,
        up.sub(down).mul(normalStrength),
      )));
    }
    const sceneShadow = sampleEnvironmentSunShadow(positionWorld).toVar();
    const cloudShadow = sampleEnvironmentCloudShadow(positionWorld, 1).toVar();
    const sunVisibility = sceneShadow.mul(cloudShadow).toVar();
    const direct = clamp(dot(normal, normalize(sceneUniforms.uSceneGroundSunDirection)), 0, 1)
      .mul(sunVisibility).toVar();
    const shade = smoothstep(0.06, 0.72, direct).oneMinus().toVar();
    const shadowColor = groundColor.mul(mix(
      vec3(1),
      u('lighting', 'shadowTint'),
      u('lighting', 'shadowTintStrength'),
    ));
    const liftedShadow = mix(
      shadowColor,
      groundColor.mul(0.82).add(sceneUniforms.uSceneGroundSkyColor.mul(0.18)),
      u('lighting', 'shadowLift'),
    );
    const directionalBackShadow = liftedShadow.mul(
      vec3(1).sub(shade.mul(u('lighting', 'backShadowStrength'))),
    );
    groundColor.assign(mix(groundColor, directionalBackShadow, shade));
    groundColor.mulAssign(mix(
      1,
      u('lighting', 'sunIntensity'),
      smoothstep(0.06, 0.72, direct),
    ));
    groundColor.assign(mix(
      groundColor,
      groundColor.mul(sceneUniforms.uSceneGroundSunColor),
      direct.mul(u('lighting', 'sunTintStrength')),
    ));
    groundColor.addAssign(
      sceneUniforms.uSceneGroundSkyColor
        .mul(shade)
        .mul(u('lighting', 'skyFillStrength'))
        .mul(groundColor),
    );
    const viewDirection = normalize(cameraPosition.sub(positionWorld));
    const rim = clamp(dot(normal, viewDirection), 0, 1).oneMinus().mul(u('lighting', 'rimStrength'));
    groundColor.assign(mix(groundColor, sceneUniforms.uSceneGroundSkyColor, rim.clamp(0, 1)));
    let effectiveRoughness = mix(
      u('material', 'roughness'),
      u('weatherResponse', 'wetRoughness'),
      currentWetnessNode(),
    );
    if (printCompression) {
      effectiveRoughness = mix(
        effectiveRoughness,
        u('printResponse', 'compactedRoughness'),
        printCompression,
      );
    }
    const halfVector = normalize(
      normalize(sceneUniforms.uSceneGroundSunDirection).add(viewDirection),
    );
    const specularPower = mix(128, 4, effectiveRoughness);
    const specularAmount = pow(
      clamp(dot(normal, halfVector), 0, 1),
      specularPower,
    ).mul(mix(0.04, 1, u('material', 'metalness')))
      .mul(sceneShadow)
      .mul(u('lighting', 'sunIntensity'));
    const specularColor = mix(
      sceneUniforms.uSceneGroundSunColor,
      groundColor.mul(sceneUniforms.uSceneGroundSunColor),
      u('material', 'metalness'),
    );
    groundColor.addAssign(specularColor.mul(specularAmount));
    const emission = groundColor.mul(u('material', 'emissiveStrength')).toVar();
    // Defaults of one preserve the authored look. Scene intensity remains
    // transient, and can reach zero without erasing intentional emission.
    groundColor.mulAssign(mix(sceneUniforms.uSceneGroundSkyIntensity,
      sceneUniforms.uSceneGroundSunIntensity, smoothstep(0.06, 0.72, direct)));
    groundColor.addAssign(emission);

    groundColor.assign(mix(
      groundColor,
      u('distance', 'color'),
      distanceMask.mul(u('distance', 'strength')).clamp(0, 1),
    ));

    groundColor.assign(mix(
      groundColor,
      vec3(sceneShadow),
      sceneUniforms.uSceneGroundShadowDebug,
    ));
    return groundColor.clamp(0, 4);
    })();
  }

  function rebuildNodes() {
    material.colorNode = buildGroundColorNode();
    if (groundColorVariant) {
      groundColorVariant.colorNode = buildGroundColorNode();
      groundColorVariant.needsUpdate = true;
    }
    material.needsUpdate = true;
  }

  function applySettings(next) {
    resolvedSettings = createGroundShaderSettings(next);
    for (const [groupId, fields] of Object.entries(GROUND_SHADER_FIELD_SCHEMA)) {
      for (const [key, field] of Object.entries(fields)) {
        setUniformValue(styleUniforms[field.uniform], resolvedSettings[groupId][key]);
      }
    }
    material.userData.toonlabGroundShader.settings = cloneSettings(resolvedSettings);
    return cloneSettings(resolvedSettings);
  }

  function setSceneState({
    printVisibility,
    snowCover,
    snowDepth,
    sunColor,
    sunDirection,
    sunIntensity,
    skyColor,
    skyIntensity,
    shadowDebug,
    waterLevel,
    wetness,
  } = {}) {
    if (Number.isFinite(Number(printVisibility))) {
      sceneUniforms.uSceneGroundPrintVisibility.value = THREE.MathUtils.clamp(
        Number(printVisibility),
        0,
        1,
      );
    }
    if (Number.isFinite(Number(snowCover))) {
      sceneUniforms.uSceneGroundSnowCover.value = THREE.MathUtils.clamp(Number(snowCover), 0, 1);
    }
    if (Number.isFinite(Number(snowDepth))) {
      sceneUniforms.uSceneGroundSnowDepth.value = Math.max(Number(snowDepth), 0);
    }
    if (shadowDebug !== undefined) {
      sceneUniforms.uSceneGroundShadowDebug.value = shadowDebug ? 1 : 0;
    }
    if (sunColor !== undefined) sceneUniforms.uSceneGroundSunColor.value.set(sunColor);
    if (Number.isFinite(sunIntensity)) sceneUniforms.uSceneGroundSunIntensity.value = Math.max(0, sunIntensity);
    if (Number.isFinite(skyIntensity)) sceneUniforms.uSceneGroundSkyIntensity.value = Math.max(0, skyIntensity);
    if (Array.isArray(sunDirection) && sunDirection.length >= 3) {
      sceneUniforms.uSceneGroundSunDirection.value.set(...sunDirection).normalize();
    } else if (sunDirection?.isVector3) {
      sceneUniforms.uSceneGroundSunDirection.value.copy(sunDirection).normalize();
    }
    if (skyColor !== undefined) sceneUniforms.uSceneGroundSkyColor.value.set(skyColor);
    if (Number.isFinite(Number(waterLevel))) {
      sceneUniforms.uSceneGroundWaterLevel.value = Number(waterLevel);
    }
    if (Number.isFinite(Number(wetness))) {
      sceneUniforms.uSceneGroundWetness.value = THREE.MathUtils.clamp(Number(wetness), 0, 1);
    }
  }

  material.userData.toonlabGroundShader = {
    applySettings,
    refreshSplat() {
      splatTexture.needsUpdate = true;
    },
    printLayer: groundPrintLayer,
    sceneUniforms,
    settings: cloneSettings(resolvedSettings),
    setLayerTexture(index, map) {
      if (index < 0 || index > 3) return;
      layerTextures[index] = configureLayerTexture(map);
      rebuildNodes();
    },
    setPrintLayer(next) {
      groundPrintLayer = resolveGroundPrintLayer(next);
      printTexture = groundPrintLayer?.texture ?? null;
      printTexelSize.value.set(
        1 / Math.max(printTexture?.image?.width ?? 1, 1),
        1 / Math.max(printTexture?.image?.height ?? 1, 1),
      );
      material.userData.toonlabGroundShader.printLayer = groundPrintLayer;
      rebuildNodes();
      return groundPrintLayer;
    },
    setSceneState,
    splatTexture,
    styleUniforms,
    version: GROUND_SHADER_SCHEMA_VERSION,
  };
  material.userData.createGroundColorVariant = () => {
    if (!groundColorVariant) {
      groundColorVariant = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
      groundColorVariant.name = 'ToonLab Ground Shader — Ground Field Visible Color';
      // Ground adoption is a visible-color contract, not a base-palette hint.
      // Render the same sun/sky/shared-shadow graph used by the ground so a
      // moving cast shadow changes the sampled grass color as well.
      groundColorVariant.colorNode = buildGroundColorNode();
      groundColorVariant.isShadowPassMaterial = true;
    }
    return groundColorVariant;
  };
  material.addEventListener('dispose', () => {
    groundColorVariant?.dispose();
    groundColorVariant = null;
  });

  rebuildNodes();
  return markFactoryStyleMaterial(material, 'GroundSurface');
}

/**
 * Creates a production-safe ground mesh around the canonical material.
 * Shadow reception and ground-field participation are defaults. The shader
 * already owns directional terrain/back-shadow response, so the full terrain
 * is receive-only unless a host explicitly needs overhangs to cast.
 */
export function createGroundShaderMesh({
  geometry,
  name = 'ToonLab Ground',
  castShadow = false,
  receiveShadow = true,
  groundFieldWrite = true,
  frustumCulled = false,
  styleTarget = {},
  ...materialOptions
} = {}) {
  if (!geometry?.isBufferGeometry) {
    throw new TypeError('createGroundShaderMesh needs a BufferGeometry.');
  }
  const mesh = new THREE.Mesh(geometry, createGroundShaderMaterial(materialOptions));
  mesh.name = name;
  mesh.castShadow = Boolean(castShadow);
  mesh.receiveShadow = Boolean(receiveShadow);
  mesh.frustumCulled = Boolean(frustumCulled);
  mesh.userData.groundFieldWrite = Boolean(groundFieldWrite);
  mesh.userData.toonlabGroundShaderMesh = {
    castShadow: mesh.castShadow,
    groundFieldWrite: mesh.userData.groundFieldWrite,
    receiveShadow: mesh.receiveShadow,
  };
  attachFactoryStyleTarget(mesh, 'terrain.ground', {
    targetId: 'toonlab/ground',
    ...styleTarget,
    materials: {
      assignments: { GroundSurface: { roles: ['ground'] } },
      ...(styleTarget.materials ?? {}),
    },
  });
  return mesh;
}

/**
 * Applies a Ground Shader profile to a labeled ground target.
 *
 * Ordinary materials on Object3D targets are converted to the canonical
 * package material. A direct Material input remains update-only because it
 * has no owning mesh whose material reference can be replaced.
 */
export function applyGroundShader(target, profile = {}) {
  const settings = createGroundShaderSettings(profile);
  const materials = collectMaterials(target);
  const report = {
    applied: 0,
    matched: 0,
    skipped: 0,
    visited: materials.size,
    writes: 0,
  };

  const writesPerMaterial = Object.values(GROUND_SHADER_FIELD_SCHEMA)
    .reduce((count, fields) => count + Object.keys(fields).length, 0);
  const meshes = collectGroundMeshes(target);
  if (meshes.length > 0) {
    const replacements = new Map();
    for (const mesh of meshes) {
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const nextMaterials = sourceMaterials.map((source) => {
        const existing = source?.userData?.toonlabGroundShader;
        if (existing?.version === GROUND_SHADER_SCHEMA_VERSION) {
          if (!replacements.has(source)) {
            existing.applySettings(settings);
            replacements.set(source, source);
            report.matched += 1;
            report.applied += 1;
            report.writes += writesPerMaterial;
          }
          return source;
        }
        if (!source?.isMaterial) {
          report.skipped += 1;
          return source;
        }
        if (!replacements.has(source)) {
          replacements.set(source, createConvertedGroundMaterial(source, settings));
          report.applied += 1;
          report.writes += writesPerMaterial;
        }
        return replacements.get(source);
      });
      mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
      mesh.receiveShadow = true;
    }
    return report;
  }

  for (const material of materials) {
    const adapter = material.userData?.toonlabGroundShader;
    if (!adapter || adapter.version !== GROUND_SHADER_SCHEMA_VERSION) {
      report.skipped += 1;
      continue;
    }
    report.matched += 1;
    adapter.applySettings(settings);
    report.applied += 1;
    report.writes += writesPerMaterial;
  }
  return report;
}

/** Updates current scene inputs without modifying the portable profile. */
export function setGroundShaderSceneState(target, state = {}) {
  const materials = collectMaterials(target);
  let updated = 0;
  for (const material of materials) {
    const adapter = material.userData?.toonlabGroundShader;
    if (!adapter || adapter.version !== GROUND_SHADER_SCHEMA_VERSION) continue;
    adapter.setSceneState(state);
    updated += 1;
  }
  return updated;
}

/** Attaches or detaches a transient Ground Print Layer without changing the profile. */
export function setGroundShaderPrintLayer(target, printLayer = null) {
  const materials = collectMaterials(target);
  let updated = 0;
  for (const material of materials) {
    const adapter = material.userData?.toonlabGroundShader;
    if (!adapter || adapter.version !== GROUND_SHADER_SCHEMA_VERSION) continue;
    adapter.setPrintLayer(printLayer);
    updated += 1;
  }
  return updated;
}

export function disposeGroundShaderMaterial(material) {
  material?.userData?.toonlabGroundShader?.splatTexture?.dispose?.();
  material?.dispose?.();
}

// Repository-only Landscape and lab code used these names while the canonical
// implementation was being promoted. They do not refer to a different graph.
export const createCompatibilityGroundShaderMaterial = createGroundShaderMaterial;
export const applyCompatibilityGroundShader = applyGroundShader;
export const setCompatibilityGroundShaderSceneState = setGroundShaderSceneState;
export const disposeCompatibilityGroundShaderMaterial = disposeGroundShaderMaterial;
