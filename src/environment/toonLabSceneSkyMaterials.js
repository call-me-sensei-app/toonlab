// Manifest-driven reconstruction of the supplied environment reference scene's
// S_StylizedSky and S_StylizedClouds ToonLab graph families.
//
// Exact graph work and renderer adaptation are deliberately separated:
// - TOONLAB_SCENE_*_GRAPH records the connected ToonLab graph.
// - build*Material transcribes those nodes to TSL and then maps the authored
//   TOONLAB render state onto Three's material flags.
//
// Both source graphs use UniversalUnlitSubTarget. Do not install the TOONLAB
// lighting bridge here: the absence of direct/ambient/shadow lighting is an
// authored source fact, not a visual approximation.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  clamp,
  float,
  max,
  mix,
  mrt,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import {
  indexToonLabMaterialProperties,
  linearizeToonLabColorProperty,
  loadToonLabSceneTexture,
  readToonLabScalar,
  readToonLabTextureIndex,
  readToonLabVector,
} from './toonLabSceneRecords.js';

export const TOONLAB_SCENE_SKY_SHADER =
  'ToonLab Graphs/S_StylizedSky';
export const TOONLAB_SCENE_CLOUDS_SHADER =
  'ToonLab Graphs/S_StylizedClouds';

export const DEFAULT_TOONLAB_SCENE_SKY_BASE_URL =
  '/assets-local/reference-environment/environment-scene';

export const TOONLAB_SCENE_SKY_TEXTURE_PROPERTY =
  '_Texture2DAsset_8ff54427fb104a16b9f878dc11b132ea_Out_0_Texture2D';
export const TOONLAB_SCENE_CLOUD_NOISE_PROPERTY =
  '_SampleTexture2D_2614000b65e24f6293e33a22289a2613_Texture_1_Texture2D';

// ToonLab graph's UniversalUnlitSubTarget forward include never calls
// MixFog. The stage carries this source-family fact as a material MRT output
// so its screen-space renderer bridge can fog PBR families once without
// incorrectly fogging the two unlit sky domes.
export const TOONLAB_FOG_PARTICIPATION_MRT =
  'toonLabFogParticipation';

const freezeGradientKey = (color, position) => Object.freeze({
  color: Object.freeze(color),
  position,
});

/**
 * Connected S_StylizedSky graph contract.
 *
 * The color-key positions are the serialized UInt16 times divided by 65535.
 * `_Vertical_Offset` is connected to the Y component of a float2, but the
 * Sample Gradient node reads X. It therefore moves only the background-cloud
 * texture and does not move the sky gradient.
 */
export const TOONLAB_SCENE_SKY_GRAPH = Object.freeze({
  sourceEngine: 'ToonLab reference renderer',
  sourceGraph: 'Environment/Sky/Shaders/S_StylizedSky.toonlabgraph',
  sourceGraphSha256: 'df157d748c40ba9f059be99e76b44217eccf802c7c30e3a767659f989ec068c2',
  sourceMaterial: 'Environment/Sky/Materials/M_StylizedSky.mat',
  sourceMaterialSha256: '2194bb7058ba6d13e8d9cb1bda09d595c07fbaa56514284976b3d775013489cd',
  generatedForwardPass:
    'passes/S_StylizedSky/sub-00-pass-00-Unlit.shader',
  generatedForwardPassSha256:
    'ef218577b105e923daca377fb06dc7a5c4f37a9be1404a80293226e51b8e2abd',
  connectedTopologySha256:
    '4f53e4c4536773de2c0444daeabd3f439af53d8284a8d68bc8d51e07c5bc1e56',
  shadingModel: 'UniversalUnlitSubTarget',
  renderState: Object.freeze({
    alphaMode: 'opaque',
    castShadows: false,
    cull: 'Back (render front faces)',
    depthTest: 'LessEqual',
    depthWrite: true,
    renderQueue: 2000,
  }),
  gradient: Object.freeze([
    freezeGradientKey(
      [0.323820561170578, 0.5988462567329407, 0.8650000095367432],
      3470 / 65535,
    ),
    freezeGradientKey(
      [0.2772783637046814, 0.6527227759361267, 0.8773584961891174],
      19082 / 65535,
    ),
    freezeGradientKey(
      [0.08266664296388626, 0.34963130950927734, 0.9725490212440491],
      27949 / 65535,
    ),
    freezeGradientKey(
      [0.12415449321269989, 0.3024090826511383, 0.849056601524353],
      40285 / 65535,
    ),
    freezeGradientKey(
      [0.03720184043049812, 0.13750654458999634, 0.4150943160057068],
      1,
    ),
  ]),
  connectedFormula: Object.freeze({
    gradientTime:
      '((UV0.g).xx * float2(1,1) + float2(0,_Vertical_Offset)).x = UV0.g',
    cloudUv: 'UV0.xy * float2(1,1) + float2(0,_Vertical_Offset)',
    cloudBlend: 'T_BackroundClouds1B.r * _Cloud_Color',
    screen: '1 - (1 - cloudBlend) * (1 - skyGradient)',
    baseColor:
      'lerp(skyGradient, screen(skyGradient, cloudBlend), _Cloud_Opacity).rgb * _Strength',
  }),
  generatedSurfaceOutputs: Object.freeze(['BaseColor']),
  disconnected: Object.freeze([
    'Sky Gradient alpha (the surface has no Alpha block)',
    '_Vertical_Offset from Sample Gradient time because the graph reads the float2 X component',
  ]),
});

/** Connected S_StylizedClouds + SG_Clouds graph contract. */
export const TOONLAB_SCENE_CLOUDS_GRAPH = Object.freeze({
  sourceEngine: 'ToonLab reference renderer',
  sourceGraph: 'Environment/Sky/Shaders/S_StylizedClouds.toonlabgraph',
  sourceGraphSha256: '36f9fffbfd075f8c34c979e2995e1fac6966009ebb814c32de07c494a2593655',
  sourceSubgraph: 'Environment/Sky/Shaders/SG_Clouds.toonlabsubgraph',
  sourceSubgraphSha256: 'ed05bb3c27cf4d792f260e6ddbe6fc65220d5ec819b6b575a15caab5760eea81',
  sourceMaterial: 'Environment/Sky/Materials/M_Clouds.mat',
  sourceMaterialSha256: 'e0c568732b2b3f55e1b95f04eccbd58388b8c043441b897d170b8db4db317782',
  generatedForwardPass:
    'passes/S_StylizedClouds/sub-00-pass-00-Unlit.shader',
  generatedForwardPassSha256:
    'cecb1cde74dd02557cc0a82b17e5fc220d88d8ea78aa4a8a0d31d3ee4c38c51a',
  connectedTopologySha256:
    '07841df50af3733cbdc5db095b0ed0057e9b0f58eed427404f8f0334dcdcc8df',
  subgraphConnectedTopologySha256:
    'a6ccaf29c3f1a7bba8238cf48d723d3491d4edeb217096208b33d6da4f272d5f',
  shadingModel: 'UniversalUnlitSubTarget',
  renderState: Object.freeze({
    alphaMode: 'transparent-alpha',
    castShadows: false,
    cull: 'Back (render front faces)',
    depthTest: 'LessEqual',
    // UniversalTarget.m_ZWriteControl=1 is ForceEnabled, even though the
    // graph surface is transparent.
    depthWrite: true,
    renderQueue: 3000,
  }),
  gradient: Object.freeze([
    freezeGradientKey(
      [0.11406410485506058, 0.28699997067451477, 0.5740000009536743],
      0.01765468902885914,
    ),
    freezeGradientKey(
      [0.36858823895454407, 0.4218771755695343, 0.5098039507865906],
      0.38823530077934265,
    ),
    freezeGradientKey(
      [0.5135643482208252, 0.5405940413475037, 0.5460000038146973],
      0.9794155955314636,
    ),
  ]),
  connectedFormula: Object.freeze({
    noiseUv: 'UV0.xy * float2(6,4) + (Time * (_Cloud_Noise_Speed * -0.01)).xx',
    noiseOffset:
      'T_NoiseRough_MidContrast(noiseUv).r * (_Cloud_Noise_Strength * 0.05) * 0.2',
    layerUv:
      'UV0.xy * float2(1,VerticalSquash) + float2(Time * PanningSpeed * -0.001,-VerticalOffset) + noiseOffset.xx',
    layer:
      'float4(SampleGradient(SG_Clouds.gradient, CloudTexture(layerUv).r).rgb, CloudTexture(layerUv).a)',
    baseColor:
      'lerp(lerp(layer3.rgb,layer2.rgb,layer2.a),layer1.rgb,layer1.a) * _Strength',
    alpha: 'max(layer1.a,max(layer2.a,layer3.a))',
  }),
  generatedSurfaceOutputs: Object.freeze(['BaseColor', 'Alpha']),
  subgraphInvocationOrder: Object.freeze([3, 2, 1]),
  textureSamplesPerFragment: 6,
  disconnected: Object.freeze([
    '_Tint (serialized on M_Clouds but has no connected PropertyNode path)',
    'Texture scale/offset from material records (all graph samples use no-scale texture structs)',
  ]),
});

function requiredProperty(properties, name, materialName) {
  const property = properties.get(name);
  if (!property) {
    throw new Error(`${materialName} is missing required sky/cloud property ${name}.`);
  }
  return property;
}

function requiredScalar(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  const value = readToonLabScalar(properties, name, Number.NaN);
  if (!Number.isFinite(value)) {
    throw new Error(`${materialName}.${name} is not a finite scalar.`);
  }
  return value;
}

function requiredVector(properties, name, materialName) {
  const property = requiredProperty(properties, name, materialName);
  if (!Array.isArray(property.value) || property.value.length < 4) {
    throw new Error(`${materialName}.${name} is not a four-channel color/vector.`);
  }
  return readToonLabVector(properties, name, [0, 0, 0, 0]);
}

function requiredTextureIndex(properties, name, materialName) {
  requiredProperty(properties, name, materialName);
  const index = readToonLabTextureIndex(properties, name);
  if (index < 0) throw new Error(`${materialName}.${name} has no exported texture.`);
  return index;
}

function requiredSourceTextureRecord(manifest, index, materialName) {
  const record = manifest?.textures?.[index];
  if (!record?.exactSourceCopy || record?.importer?.present !== true) {
    throw new Error(
      `${materialName} texture ${index} is missing an exact source copy or texture import record.`,
    );
  }
  return record;
}

function textureRecordSummary(manifest, index) {
  const record = requiredSourceTextureRecord(manifest, index, 'sky/cloud material');
  return {
    assetGuid: record.asset?.guid ?? null,
    exactSourceCopy: record.exactSourceCopy,
    importer: { ...record.importer },
    index,
    name: record.name,
  };
}

/** Resolve exact M_StylizedSky values from its scene-manifest record. */
export function resolveToonLabSceneSkyInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_SKY_SHADER) {
    throw new TypeError(
      `Expected ${TOONLAB_SCENE_SKY_SHADER}; received `
      + `${materialRecord?.shaderName ?? 'no shader'}.`,
    );
  }
  const materialName = materialRecord.name ?? `material-${materialRecord.index ?? 'unknown'}`;
  const properties = indexToonLabMaterialProperties(materialRecord);
  return Object.freeze({
    backgroundCloudTextureIndex: requiredTextureIndex(
      properties,
      TOONLAB_SCENE_SKY_TEXTURE_PROPERTY,
      materialName,
    ),
    cloudColor: Object.freeze(requiredVector(properties, '_Cloud_Color', materialName)),
    cloudOpacity: requiredScalar(properties, '_Cloud_Opacity', materialName),
    materialIndex: materialRecord.index,
    materialName,
    renderQueue: materialRecord.renderQueue,
    strength: requiredScalar(properties, '_Strength', materialName),
    verticalOffset: requiredScalar(properties, '_Vertical_Offset', materialName),
  });
}

const CLOUD_LAYER_PROPERTIES = Object.freeze([
  Object.freeze({
    layer: 1,
    texture: '_1_Cloud_Texture',
    verticalOffset: '_1_Vertical_Offset',
    verticalSquash: '_1_Vertical_Squash',
    panningSpeed: '_1_Panning_Speed',
  }),
  Object.freeze({
    layer: 2,
    texture: '_2_Cloud_Texture_1',
    verticalOffset: '_2_Vertical_Offset_1',
    verticalSquash: '_2_Vertical_Squash_1',
    panningSpeed: '_2_Panning_Speed_1',
  }),
  Object.freeze({
    layer: 3,
    texture: '_3_Cloud_Texture_2',
    verticalOffset: '_3_Vertical_Offset_2',
    verticalSquash: '_3_Vertical_Squash_2',
    panningSpeed: '_3_Panning_Speed_2',
  }),
]);

/** Resolve exact M_Clouds values from its scene-manifest record. */
export function resolveToonLabSceneCloudInputs(materialRecord) {
  if (materialRecord?.shaderName !== TOONLAB_SCENE_CLOUDS_SHADER) {
    throw new TypeError(
      `Expected ${TOONLAB_SCENE_CLOUDS_SHADER}; received `
      + `${materialRecord?.shaderName ?? 'no shader'}.`,
    );
  }
  const materialName = materialRecord.name ?? `material-${materialRecord.index ?? 'unknown'}`;
  const properties = indexToonLabMaterialProperties(materialRecord);
  const layers = CLOUD_LAYER_PROPERTIES.map((propertyNames) => Object.freeze({
    layer: propertyNames.layer,
    panningSpeed: requiredScalar(properties, propertyNames.panningSpeed, materialName),
    textureIndex: requiredTextureIndex(properties, propertyNames.texture, materialName),
    textureProperty: propertyNames.texture,
    verticalOffset: requiredScalar(properties, propertyNames.verticalOffset, materialName),
    verticalSquash: requiredScalar(properties, propertyNames.verticalSquash, materialName),
  }));
  return Object.freeze({
    layers: Object.freeze(layers),
    materialIndex: materialRecord.index,
    materialName,
    noiseSpeed: requiredScalar(properties, '_Cloud_Noise_Speed', materialName),
    noiseStrength: requiredScalar(properties, '_Cloud_Noise_Strength', materialName),
    noiseTextureIndex: requiredTextureIndex(
      properties,
      TOONLAB_SCENE_CLOUD_NOISE_PROPERTY,
      materialName,
    ),
    renderQueue: materialRecord.renderQueue,
    strength: requiredScalar(properties, '_Strength', materialName),
    // Required and reported, but deliberately not consumed by the TSL graph.
    tint: Object.freeze(requiredVector(properties, '_Tint', materialName)),
  });
}

export function isToonLabSceneSkyRecord(materialRecord) {
  return materialRecord?.shaderName === TOONLAB_SCENE_SKY_SHADER;
}

export function isToonLabSceneCloudRecord(materialRecord) {
  return materialRecord?.shaderName === TOONLAB_SCENE_CLOUDS_SHADER;
}

export function isToonLabSceneSkyFamilyRecord(materialRecord) {
  return isToonLabSceneSkyRecord(materialRecord)
    || isToonLabSceneCloudRecord(materialRecord);
}

function sampleGradientNode(value, keys) {
  let result = vec3(...keys[0].color);
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const current = keys[index];
    const amount = clamp(
      value.sub(previous.position).div(current.position - previous.position),
      0,
      1,
    );
    result = mix(result, vec3(...current.color), amount);
  }
  return result;
}

function sampleGradientCpu(value, keys) {
  let result = [...keys[0].color];
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const current = keys[index];
    const amount = THREE.MathUtils.clamp(
      (value - previous.position) / (current.position - previous.position),
      0,
      1,
    );
    result = result.map((channel, channelIndex) => THREE.MathUtils.lerp(
      channel,
      current.color[channelIndex],
      amount,
    ));
  }
  return result;
}

/** CPU mirror of S_StylizedSky's serialized Sample Gradient node. */
export function sampleToonLabSceneSkyGradient(value) {
  return sampleGradientCpu(value, TOONLAB_SCENE_SKY_GRAPH.gradient);
}

/** CPU mirror of SG_Clouds' serialized Sample Gradient node. */
export function sampleToonLabSceneCloudGradient(value) {
  return sampleGradientCpu(value, TOONLAB_SCENE_CLOUDS_GRAPH.gradient);
}

/** CPU mirror of the final two cloud Lerps and Maximum chain. */
export function composeToonLabSceneCloudSurface(
  layer1,
  layer2,
  layer3,
  strength = 1,
) {
  const mixRgb = (a, b, amount) => a.map(
    (channel, index) => THREE.MathUtils.lerp(channel, b[index], amount),
  );
  const backAndMiddle = mixRgb(layer3.rgb, layer2.rgb, layer2.alpha);
  return Object.freeze({
    alpha: Math.max(layer1.alpha, Math.max(layer2.alpha, layer3.alpha)),
    baseColor: Object.freeze(
      mixRgb(backAndMiddle, layer1.rgb, layer1.alpha)
        .map((channel) => channel * strength),
    ),
  });
}

function configureExactUnlitRenderState(material, {
  transparent,
}) {
  material.side = THREE.FrontSide;
  material.depthTest = true;
  material.depthFunc = THREE.LessEqualDepth;
  // Both graphs write depth. M_Clouds is unusual: it is transparent but its
  // UniversalTarget has ZWriteControl.ForceEnabled.
  material.depthWrite = true;
  material.transparent = transparent;
  material.blending = transparent ? THREE.NormalBlending : THREE.NoBlending;
  material.premultipliedAlpha = false;
  material.alphaToCoverage = false;
  material.fog = false;
  material.lights = false;
  material.mrtNode = mrt({
    [TOONLAB_FOG_PARTICIPATION_MRT]: vec4(0, 0, 0, 1),
  });
  // ToonLab's graph output is linear HDR input to the camera post stack.
  material.toneMapped = false;
}

function rendererBridgeMetadata(materialRecord, transparent) {
  return Object.freeze({
    exactGraphBoundary:
      'colorNode/opacityNode reproduce generated SurfaceDescription outputs before TOONLAB renderer features',
    materialClass:
      'Three MeshBasicNodeMaterial maps UniversalUnlitSubTarget; no lighting nodes are installed',
    renderState:
      `Three ${transparent ? 'NormalBlending' : 'NoBlending'} + LessEqualDepth + depthWrite=true maps the UniversalTarget state`,
    sceneResponsibilities: Object.freeze([
      'Use exported TEXCOORD_0 and the canonical sky/cloud dome mesh transforms',
      'Apply scene-manifest MeshRenderer shadowCastingMode=Off on the owning meshes',
      'Preserve opaque/transparent queue ordering at the scene dispatcher',
      'Run TOONLAB camera-stack SSAO/fog/TAA/bloom/color-grade bridges outside this material',
      'Exclude the material-disabled MOTIONVECTORS pass in velocity-history integration',
    ]),
    sourceRenderQueue: materialRecord.renderQueue,
  });
}

/** Build M_StylizedSky from its canonical scene-manifest material record. */
export async function buildToonLabSceneSkyMaterial(
  materialRecord,
  manifest,
  {
    baseUrl = DEFAULT_TOONLAB_SCENE_SKY_BASE_URL,
    geometryHints = {},
    textureLoader,
  } = {},
) {
  const values = resolveToonLabSceneSkyInputs(materialRecord);
  const cloudColorLinear = Object.freeze(
    linearizeToonLabColorProperty(values.cloudColor),
  );
  requiredSourceTextureRecord(
    manifest,
    values.backgroundCloudTextureIndex,
    values.materialName,
  );
  const backgroundCloudMap = await loadToonLabSceneTexture(
    manifest,
    values.backgroundCloudTextureIndex,
    { baseUrl, ...(textureLoader ? { textureLoader } : {}) },
  );
  if (!backgroundCloudMap) {
    throw new Error(`${values.materialName} could not load its background-cloud texture.`);
  }

  const surfaceUv = (geometryHints.uvNode ?? uv()).xy;
  const skyGradient = sampleGradientNode(
    // The connected float2's X is UV0.g; `_Vertical_Offset` is in Y.
    surfaceUv.y,
    TOONLAB_SCENE_SKY_GRAPH.gradient,
  );
  const backgroundCloud = texture(backgroundCloudMap)
    .sample(surfaceUv.add(vec2(0, values.verticalOffset)))
    .r
    .mul(vec3(...cloudColorLinear.slice(0, 3)));
  const screened = vec3(1).sub(
    vec3(1).sub(backgroundCloud).mul(vec3(1).sub(skyGradient)),
  );
  const baseColorNode = mix(
    skyGradient,
    screened,
    values.cloudOpacity,
  ).mul(values.strength);

  const material = new MeshBasicNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  material.colorNode = baseColorNode;
  configureExactUnlitRenderState(material, { transparent: false });
  material.userData.toonLabMaterial = {
    exactGraph: TOONLAB_SCENE_SKY_GRAPH,
    exactInputs: true,
    fogParticipation: false,
    fogSource:
      'ToonLabGraph UniversalUnlitSubTarget -> UnlitPass.hlsl -> UniversalFragmentUnlit; no MixFog call',
    graphExact: true,
    linearColorProperties: Object.freeze({ cloudColor: cloudColorLinear }),
    materialIndex: values.materialIndex,
    reconstruction: 'toonlab-s-stylized-sky-record',
    rendererBridge: rendererBridgeMetadata(materialRecord, false),
    sourceMaterial: values.materialName,
    sourceShader: TOONLAB_SCENE_SKY_SHADER,
    textures: {
      backgroundCloud: textureRecordSummary(
        manifest,
        values.backgroundCloudTextureIndex,
      ),
    },
    tslRuntimeGraph: {
      gradientKeyCount: TOONLAB_SCENE_SKY_GRAPH.gradient.length,
      inputSemantic: 'TEXCOORD_0.xy',
      operations: Object.freeze([
        'SampleGradientV1(uv0.y)',
        'SampleTexture2D(backgroundCloud,uv0+float2(0,verticalOffset)).r',
        'Multiply(cloudR,cloudColor)',
        'Blend.Screen(baseGradient,cloudColor,cloudOpacity)',
        'Multiply(result,strength)',
      ]),
      sourceTopologySha256:
        TOONLAB_SCENE_SKY_GRAPH.connectedTopologySha256,
      surfaceOutputs: Object.freeze(['colorNode:BaseColor']),
      textureSampleCount: 1,
    },
  };
  return material;
}

function sampleCloudLayerNode({
  layerMap,
  layerValues,
  noiseMap,
  noiseSpeed,
  noiseStrength,
  surfaceUv,
  timeNode,
}) {
  const effectiveNoiseSpeed = noiseSpeed * -0.01;
  const effectiveNoiseStrength = noiseStrength * 0.05;
  const noiseUv = surfaceUv
    .mul(vec2(6, 4))
    .add(vec2(
      timeNode.mul(effectiveNoiseSpeed),
      timeNode.mul(effectiveNoiseSpeed),
    ));
  const noiseOffset = texture(noiseMap)
    .sample(noiseUv)
    .r
    .mul(effectiveNoiseStrength)
    .mul(0.2);
  const layerUv = surfaceUv
    .mul(vec2(1, layerValues.verticalSquash))
    .add(vec2(
      timeNode.mul(layerValues.panningSpeed).mul(-0.001),
      -layerValues.verticalOffset,
    ))
    .add(vec2(noiseOffset, noiseOffset));
  const layerSample = texture(layerMap).sample(layerUv);
  return {
    alpha: layerSample.a,
    rgb: sampleGradientNode(
      layerSample.r,
      TOONLAB_SCENE_CLOUDS_GRAPH.gradient,
    ),
  };
}

/** Build M_Clouds from its canonical scene-manifest material record. */
export async function buildToonLabSceneCloudMaterial(
  materialRecord,
  manifest,
  {
    baseUrl = DEFAULT_TOONLAB_SCENE_SKY_BASE_URL,
    geometryHints = {},
    state = null,
    textureLoader,
  } = {},
) {
  const values = resolveToonLabSceneCloudInputs(materialRecord);
  for (const layer of values.layers) {
    requiredSourceTextureRecord(manifest, layer.textureIndex, values.materialName);
  }
  requiredSourceTextureRecord(manifest, values.noiseTextureIndex, values.materialName);
  const textureOptions = { baseUrl, ...(textureLoader ? { textureLoader } : {}) };
  const [layer1Map, layer2Map, layer3Map, noiseMap] = await Promise.all([
    ...values.layers.map((layer) => loadToonLabSceneTexture(
      manifest,
      layer.textureIndex,
      textureOptions,
    )),
    loadToonLabSceneTexture(
      manifest,
      values.noiseTextureIndex,
      textureOptions,
    ),
  ]);
  if (!layer1Map || !layer2Map || !layer3Map || !noiseMap) {
    throw new Error(`${values.materialName} could not load all four cloud textures.`);
  }

  const surfaceUv = (geometryHints.uvNode ?? uv()).xy;
  const timeNode = geometryHints.timeNode ?? state?.uniforms?.time ?? float(0);
  // Keep all three SG_Clouds invocations distinct. Each invocation contains
  // its own noise and layer sample in the connected/generated source graph.
  const [layer1, layer2, layer3] = [layer1Map, layer2Map, layer3Map].map(
    (layerMap, index) => sampleCloudLayerNode({
      layerMap,
      layerValues: values.layers[index],
      noiseMap,
      noiseSpeed: values.noiseSpeed,
      noiseStrength: values.noiseStrength,
      surfaceUv,
      timeNode,
    }),
  );
  const backAndMiddle = mix(layer3.rgb, layer2.rgb, layer2.alpha);
  const baseColorNode = mix(backAndMiddle, layer1.rgb, layer1.alpha)
    .mul(values.strength);
  const opacityNode = max(layer1.alpha, max(layer2.alpha, layer3.alpha));

  const material = new MeshBasicNodeMaterial();
  material.name = `ToonLab:${values.materialName}`;
  material.colorNode = baseColorNode;
  material.opacityNode = opacityNode;
  configureExactUnlitRenderState(material, { transparent: true });
  material.userData.toonLabMaterial = {
    exactGraph: TOONLAB_SCENE_CLOUDS_GRAPH,
    exactInputs: true,
    fogParticipation: false,
    fogSource:
      'ToonLabGraph UniversalUnlitSubTarget -> UnlitPass.hlsl -> UniversalFragmentUnlit; no MixFog call',
    graphExact: true,
    materialIndex: values.materialIndex,
    reconstruction: 'toonlab-s-stylized-clouds-record',
    rendererBridge: rendererBridgeMetadata(materialRecord, true),
    sourceMaterial: values.materialName,
    sourceShader: TOONLAB_SCENE_CLOUDS_SHADER,
    switches: {
      depthWriteForcedOnForTransparentSurface: true,
      tintPropertyConnected: false,
    },
    textures: {
      layers: values.layers.map((layer) => textureRecordSummary(
        manifest,
        layer.textureIndex,
      )),
      noise: textureRecordSummary(manifest, values.noiseTextureIndex),
    },
    tslRuntimeGraph: {
      gradientKeyCount: TOONLAB_SCENE_CLOUDS_GRAPH.gradient.length,
      inputSemantic: 'TEXCOORD_0.xy',
      operations: Object.freeze([
        'SG_Clouds(layer3)',
        'SG_Clouds(layer2)',
        'Lerp(layer3.rgb,layer2.rgb,layer2.a)',
        'SG_Clouds(layer1)',
        'Lerp(previous,layer1.rgb,layer1.a)',
        'Multiply(result,strength)',
        'Maximum(layer1.a,Maximum(layer2.a,layer3.a))',
      ]),
      sourceSubgraphTopologySha256:
        TOONLAB_SCENE_CLOUDS_GRAPH.subgraphConnectedTopologySha256,
      sourceTopologySha256:
        TOONLAB_SCENE_CLOUDS_GRAPH.connectedTopologySha256,
      surfaceOutputs: Object.freeze([
        'colorNode:BaseColor',
        'opacityNode:Alpha',
      ]),
      textureSampleCount:
        TOONLAB_SCENE_CLOUDS_GRAPH.textureSamplesPerFragment,
      timeSource: geometryHints.timeNode
        ? 'geometryHints.timeNode'
        : state?.uniforms?.time
          ? 'state.uniforms.time'
          : 'literal zero',
    },
  };
  return material;
}

/** Isolated family dispatcher for integration into the reference scene loader. */
export async function buildToonLabSceneSkyFamilyMaterial(
  materialRecord,
  manifest,
  options = {},
) {
  if (isToonLabSceneSkyRecord(materialRecord)) {
    return buildToonLabSceneSkyMaterial(materialRecord, manifest, options);
  }
  if (isToonLabSceneCloudRecord(materialRecord)) {
    return buildToonLabSceneCloudMaterial(materialRecord, manifest, options);
  }
  throw new TypeError(
    `Expected ${TOONLAB_SCENE_SKY_SHADER} or `
    + `${TOONLAB_SCENE_CLOUDS_SHADER}; received `
    + `${materialRecord?.shaderName ?? 'no shader'}.`,
  );
}
