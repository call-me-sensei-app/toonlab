// ToonLab-authoritative scene lighting and camera post stack for the supplied
// environment reference demonstration. This module intentionally has no ToonLab
// inputs and no visual tuning constants: every numeric source value comes
// from TOONLAB_RENDER_CONTRACT. Renderer-specific bridges are
// labelled in returned metadata instead of being presented as exact ports.

import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import {
  float,
  max,
  mix,
  mrt,
  normalView,
  output,
  pass,
  rtt,
  vec4,
  velocity,
} from 'three/tsl';

import {
  TOONLAB_RENDER_CONTRACT,
  applyToonLabBloomTint,
  applyToonLabFog,
  applyToonLabLdrGradeLut,
  applyToonLabVignette,
  assertToonLabSurfaceBlueNoiseTexturesReady,
  toonLabAmbientOcclusion,
  toonLabBloom,
  toonLabTraa,
} from './toonLabRendering.js';
import {
  TOONLAB_FOG_PARTICIPATION_MRT,
} from './toonLabSceneSkyMaterials.js';
import {
  TOONLAB_SHADOW_CONTRACT,
  configureToonLabShadowRenderer,
  createToonLabCsmShadowNode,
  installToonLabSceneShadowCasters,
} from './toonLabShadows.js';

const freezeArray = (values) => Object.freeze([...values]);

export const TOONLAB_STAGE_LIGHT_SOURCE = Object.freeze({
  manifest: 'assets-local/reference-environment/environment-scene/scene-manifest.json',
  manifestSha256: '17c48bdc1809a02eaa157eec3146f86e1ab9614bc25d00952870125deece4ccd',
  lightIndex: 0,
  lightNode: 1552,
  hierarchyPath: 'P_Sky/Directional Light',
  pipelineCore: '.local-reference/renderer/ToonLabRenderPipelineCore.cs',
  pipelineCoreSha256: 'ec477ef07f852a553ce324fe551721fd0ea462d4cad32a04c89e08f7b2b40da5',
  threeLights: 'three@0.185.1/src/nodes/accessors/Lights.js',
  threeLightsSha256: '5e374947db782dc73667eeb743a9e83c50abea7d67000bed4bf81d10ad822889',
  toonLabDirectionSource: 'Transform.forward / worldRotation applied to ToonLab local +Z',
  pipelineDirectionSource: 'ToonLabRenderPipelineCore.InitializeLightConstants_Common()',
  threeDirectionSource: 'DirectionalLightNode light.position - light.target.position',
});

/**
 * Deterministic convention decomposition for the ToonLab main light. This stops
 * the ray direction, surface-to-light direction, and Lambert PI conversion
 * from being conflated in renderer code or diagnostics.
 */
export function decomposeToonLabStageDirectLight({
  colorLinear = TOONLAB_RENDER_CONTRACT.sun.colorLinear,
  intensity = TOONLAB_RENDER_CONTRACT.sun.intensity,
  rayDirection = TOONLAB_RENDER_CONTRACT.sun.rayDirection,
  threeLambertInputScale = TOONLAB_RENDER_CONTRACT.sun
    .threeLambertInputScale,
} = {}) {
  const ray = new THREE.Vector3(...rayDirection);
  if (ray.lengthSq() === 0) throw new TypeError('ToonLab rayDirection must be non-zero.');
  ray.normalize();
  const surfaceToLight = ray.clone().negate();
  const resolvedColor = colorLinear.slice(0, 3).map(Number);
  const resolvedIntensity = Number(intensity);
  const inputScale = Number(threeLambertInputScale);
  if (resolvedColor.some((channel) => !Number.isFinite(channel))
      || !Number.isFinite(resolvedIntensity)
      || !Number.isFinite(inputScale)) {
    throw new TypeError('ToonLab direct-light color, intensity, and input scale must be finite.');
  }
  const toonLabFinalColorLinear = resolvedColor.map(
    (channel) => channel * resolvedIntensity,
  );
  const threeInputRadianceLinear = toonLabFinalColorLinear.map(
    (channel) => channel * inputScale,
  );
  const pipelineAdapterRadianceLinear = threeInputRadianceLinear.map(
    (channel) => channel / inputScale,
  );
  return Object.freeze({
    rayDirection: freezeArray(ray.toArray()),
    surfaceToLightDirection: freezeArray(surfaceToLight.toArray()),
    threeInputColorLinear: freezeArray(resolvedColor),
    threeInputIntensity: resolvedIntensity * inputScale,
    threeInputRadianceLinear: freezeArray(threeInputRadianceLinear),
    threeLambertInputScale: inputScale,
    toonLabFinalColorLinear: freezeArray(toonLabFinalColorLinear),
    pipelineAdapterInputDivisor: inputScale,
    pipelineAdapterRadianceLinear: freezeArray(pipelineAdapterRadianceLinear),
  });
}

function removeImportedLights(root) {
  const lights = [];
  root.traverse((object) => {
    if (object.isLight) lights.push(object);
  });
  for (const light of lights) {
    light.target?.removeFromParent?.();
    light.removeFromParent();
  }
  return lights.length;
}

/**
 * Install the exact ToonLab sun and constant SH0 ambient probe values.
 *
 * ToonLab's direct and baked-GI diffuse branches omit the Lambert 1/PI
 * factor used by Three's PhysicalLightingModel, so both inputs are multiplied
 * by PI before reaching Three. That is a convention conversion, not tuning.
 */
export function createToonLabStageLights(root, {
  castShadow = true,
  installCasterBias = true,
  rayDirection = TOONLAB_RENDER_CONTRACT.sun.rayDirection,
  target = [0, -35, 0],
} = {}) {
  const contract = TOONLAB_RENDER_CONTRACT;
  const importedLightCountRemoved = removeImportedLights(root);
  const directLight = decomposeToonLabStageDirectLight({ rayDirection });

  const ambient = new THREE.AmbientLight();
  ambient.name = 'ToonLab RenderSettings constant SH0 ambient probe';
  ambient.color.setRGB(
    ...contract.ambientProbe.coefficient0Linear,
    THREE.LinearSRGBColorSpace,
  );
  ambient.intensity = contract.ambientProbe.intensity
    * contract.ambientProbe.threeLambertInputScale;
  ambient.userData.toonLab = {
    exactSourceValue: true,
    ...contract.ambientProbe,
  };
  root.add(ambient);

  const light = new THREE.DirectionalLight();
  light.name = 'ToonLab Main Directional Light';
  light.color.setRGB(
    ...directLight.threeInputColorLinear,
    THREE.LinearSRGBColorSpace,
  );
  light.intensity = directLight.threeInputIntensity;
  light.castShadow = castShadow;
  light.shadow.camera.near = contract.sun.nearPlane;
  light.shadow.camera.far = contract.shadows.distance * 2;

  // ToonLab biases caster vertices in world space. Receiver controls remain
  // neutral because the source-equivalent caster hook is installed on each
  // ToonLab material; applying both would double the offset.
  light.shadow.bias = 0;
  light.shadow.normalBias = 0;
  light.shadow.radius = 1;

  const resolvedRayDirection = new THREE.Vector3(...directLight.rayDirection);
  const directionToLight = new THREE.Vector3(...directLight.surfaceToLightDirection);
  const targetWorld = new THREE.Vector3(...target);
  light.position.copy(targetWorld).addScaledVector(resolvedRayDirection, -250);
  light.target.position.copy(targetWorld);
  root.add(light, light.target);
  light.target.updateWorldMatrix(true, false);

  const csm = createToonLabCsmShadowNode(light, {
    lightMargin: contract.shadows.distance,
  });
  csm.userData.toonLab.exact = {
    atlasResolution: TOONLAB_SHADOW_CONTRACT.atlasResolution,
    cascadeBorder: TOONLAB_SHADOW_CONTRACT.cascadeBorder,
    cascadeCount: TOONLAB_SHADOW_CONTRACT.cascadeCount,
    cascadeSplits: [...TOONLAB_SHADOW_CONTRACT.cascadeSplits],
    comparisonSamples: TOONLAB_SHADOW_CONTRACT.filter.comparisonSamples,
    depthBufferBits: TOONLAB_SHADOW_CONTRACT.depthBufferBits,
    effectiveBias: { ...TOONLAB_SHADOW_CONTRACT.effectiveBias },
    maxDistance: TOONLAB_SHADOW_CONTRACT.distance,
    nativeCasterPlaneCountPerCascade: 8,
    rayDirection: resolvedRayDirection.toArray(),
    sharedAtlas: true,
    shadowFilter: TOONLAB_SHADOW_CONTRACT.filter.name,
    tileResolution: TOONLAB_SHADOW_CONTRACT.cascadeTileResolution,
  };
  csm.userData.toonLab.remainingBridges = [
    ...csm.userData.toonLab.remainingRendererBridges,
  ];
  light.shadow.shadowNode = csm;
  light.userData.toonLab = csm.userData.toonLab;
  const casterReport = castShadow && installCasterBias
    ? installToonLabSceneShadowCasters(root, { directionToLight })
    : null;
  light.userData.toonLab.directLight = {
    ...directLight,
    colorSpace: 'Linear-sRGB working space',
    directionContract: 'ray = target - position; surfaceToLight = position - target',
    source: { ...TOONLAB_STAGE_LIGHT_SOURCE },
  };
  light.userData.toonLab.casterReport = casterReport;
  light.userData.toonLab.shadowDepthSpan = {
    cascadeRuntime: 'per-cascade orthographic depth span',
    derivation: 'ToonLab native oracle for the supplied reference camera/sun pose; conservative fitted-sphere radius plus light margin for other poses',
    maxReceiverDistance: TOONLAB_SHADOW_CONTRACT.distance,
    nativeOracle: csm.userData.toonLab.nativeOracle,
    rasterDepthBias: { ...TOONLAB_SHADOW_CONTRACT.rasterDepthBias },
  };
  root.userData.toonLabStageLights = {
    casterReport,
    directLight,
    importedLightCountRemoved,
    shadowEnabled: Boolean(castShadow),
    source: { ...TOONLAB_STAGE_LIGHT_SOURCE },
  };

  return {
    ambient,
    cascadedShadows: [csm],
    casterReport,
    directLight,
    direction: resolvedRayDirection,
    directionToLight,
    importedLightCountRemoved,
    light,
    remainingBridges: [...csm.userData.toonLab.remainingBridges],
  };
}

/** Configure ToonLab's linear HDR pre-post state without browser color filters. */
export function configureToonLabStageRenderer(renderer, scene) {
  scene.fog = null;
  scene.fogNode = null;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  configureToonLabShadowRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.filter = 'none';
  return {
    colorSpace: TOONLAB_RENDER_CONTRACT.pipeline.colorSpace,
    fogPlacement: 'post-opaque before TAA/bloom/vignette/LDR grade',
    hdr: TOONLAB_RENDER_CONTRACT.pipeline.hdr,
    renderScale: TOONLAB_RENDER_CONTRACT.pipeline.renderScale,
    toneMapping: TOONLAB_RENDER_CONTRACT.colorGrade.tonemapper,
  };
}

/**
 * Reproduce Camera 0's clear fallback. The source Camera uses Skybox clear,
 * while RenderSettings.skybox is null; ToonLab therefore clears with the
 * serialized Camera background before the world-space P_Sky domes render.
 */
export function configureToonLabStageCameraClear(scene, cameraRecord) {
  const source = cameraRecord?.backgroundColor;
  if (!Array.isArray(source) || source.length < 3) {
    throw new TypeError('ToonLab Camera backgroundColor must contain RGB channels.');
  }
  if (String(cameraRecord.clearFlags) !== 'Skybox') {
    throw new Error(`Expected ToonLab Camera Skybox clear; received ${cameraRecord.clearFlags}.`);
  }
  const srgb = source.slice(0, 3).map(Number);
  if (srgb.some((channel) => !Number.isFinite(channel))) {
    throw new TypeError('ToonLab Camera backgroundColor channels must be finite.');
  }
  scene.background = new THREE.Color().setRGB(
    ...srgb,
    THREE.SRGBColorSpace,
  );
  scene.userData.toonLabCameraClear = {
    clearFlags: cameraRecord.clearFlags,
    renderSettingsSkybox: null,
    sourceColorSrgb: [...source],
    workingColorLinear: scene.background.toArray(),
  };
  return scene.userData.toonLabCameraClear;
}

function createLightingDecompositionScene(scene, mode) {
  const clone = scene.clone(true);
  clone.name = `ToonLab ${mode} lighting decomposition`;
  clone.fog = null;
  clone.fogNode = null;
  const lights = [];
  clone.traverse((object) => {
    if (!object.isLight) return;
    const keepAmbient = mode === 'indirect' && object.isAmbientLight;
    if (!keepAmbient) lights.push(object);
  });
  for (const light of lights) {
    light.target?.removeFromParent?.();
    light.removeFromParent();
  }
  clone.userData.toonLabLightingPass = mode;
  return clone;
}

/**
 * Build the ToonLab camera stack in its authored order:
 * SSAO lighting split -> fog -> TAA -> bloom -> vignette -> LDR LUT graph.
 */
export function createToonLabStagePostPipeline({
  camera,
  renderer,
  scene,
  ambientOcclusion = true,
  bloom = true,
  fog = true,
  grade = true,
  ssaoBlueNoiseTextures = null,
  taa = true,
  taaSampleIndex = 0,
  vignette = true,
} = {}) {
  const contract = TOONLAB_RENDER_CONTRACT;
  // The source camera uses TOONLAB TAA, not MSAA. Three otherwise inherits the
  // renderer's 4x presentation MSAA for PassNode depth while TRAA allocates a
  // single-sample history depth texture; WebGPU correctly rejects that depth
  // copy. Force every source decomposition pass to one sample and let the
  // authored temporal stage own anti-aliasing.
  const sourcePassOptions = { samples: 0 };
  const scenePass = pass(scene, camera, sourcePassOptions);
  scenePass.setMRT(mrt({
    [TOONLAB_FOG_PARTICIPATION_MRT]: vec4(1),
    normal: normalView,
    output,
    velocity,
  }));
  const sceneColor = scenePass.getTextureNode('output');
  const sceneDepth = scenePass.getTextureNode('depth');
  const sceneFogParticipation = scenePass
    .getTextureNode(TOONLAB_FOG_PARTICIPATION_MRT)
    .r;
  const sceneNormal = scenePass.getTextureNode('normal');
  const sceneVelocity = scenePass.getTextureNode('velocity');

  // Keep the renderer-native device depth. Both Three's
  // perspectiveDepthToViewZ() and the camera projection matrices switch to
  // reversed Z with the renderer. Pre-inverting the texture while retaining
  // those reversed equations reconstructs invalid eye/view positions. ToonLab
  // likewise executes SSAO/fog against native reversed depth on Metal.
  const resolvedSsaoBlueNoiseTextures = ssaoBlueNoiseTextures
    ? assertToonLabSurfaceBlueNoiseTexturesReady(ssaoBlueNoiseTextures)
    : null;
  const aoNode = ambientOcclusion
    ? toonLabAmbientOcclusion(sceneDepth, sceneNormal, camera, {
        blueNoiseTextures: resolvedSsaoBlueNoiseTextures,
      })
    : null;
  const aoFactor = aoNode?.outputNode ?? float(1);
  let occluded = sceneColor;
  let indirectScene = null;
  let emissiveScene = null;

  if (aoNode) {
    indirectScene = createLightingDecompositionScene(scene, 'indirect');
    emissiveScene = createLightingDecompositionScene(scene, 'emissive');
    const indirectPass = pass(indirectScene, camera, sourcePassOptions);
    const emissivePass = pass(emissiveScene, camera, sourcePassOptions);
    const indirectWithEmission = indirectPass.getTextureNode('output');
    const emissionAndUnlit = emissivePass.getTextureNode('output');
    const directLighting = max(sceneColor.rgb.sub(indirectWithEmission.rgb), 0);
    const indirectLighting = max(indirectWithEmission.rgb.sub(emissionAndUnlit.rgb), 0);
    const directAoFactor = mix(
      float(1),
      aoFactor,
      contract.ssao.directLightingStrength,
    );
    const occludedRgb = directLighting.mul(directAoFactor)
      .add(indirectLighting.mul(aoFactor))
      .add(emissionAndUnlit.rgb);
    // Explicit scalar construction avoids a TSL inference bug where this
    // composed vec3 is reported as vec4 to JoinNode and the alpha becomes an
    // invalid fifth component under WebGPU.
    occluded = vec4(
      occludedRgb.r,
      occludedRgb.g,
      occludedRgb.b,
      sceneColor.a,
    );
  }

  const fogged = fog
    ? applyToonLabFog(
      occluded,
      sceneDepth,
      camera,
      sceneFogParticipation,
    )
    : occluded;
  // GTAO/decomposition and TRAA can each own the shadowed scene pass, but
  // nesting the former inside TRAA's implicit convertToTexture RTT leaves the
  // WebGPU final target at clear color when CSM is active. Materialize the AO
  // beauty through an explicitly invoked pipeline. TRAA still owns the real
  // scene depth/velocity PassTextureNodes, so its jittered reprojection inputs
  // retain normal Three update ordering instead of sampling detached textures.
  const explicitTemporalBeauty = Boolean(taa && aoNode);
  let preTemporalBeautyPipeline = null;
  let preTemporalBeautyTarget = null;
  let temporalBeauty = fogged;
  if (explicitTemporalBeauty) {
    // TRAANode only supports an RTTNode (`.renderTarget`) or PassTextureNode
    // (`.passNode.renderTarget`) as beauty input. A generic texture(target)
    // silently has neither ownership path. Use a dormant RTTNode as the stable
    // adapter and fill its target explicitly before temporal rendering.
    temporalBeauty = rtt(vec4(0, 0, 0, 1), null, null, {
      depthBuffer: false,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    });
    temporalBeauty.autoUpdate = false;
    temporalBeauty.textureNeedsUpdate = false;
    preTemporalBeautyTarget = temporalBeauty.renderTarget;
    preTemporalBeautyTarget.texture.name = 'ToonLab AO/fog beauty before TRAA';
    preTemporalBeautyPipeline = new RenderPipeline(renderer);
    preTemporalBeautyPipeline.outputColorTransform = false;
    preTemporalBeautyPipeline.outputNode = fogged;
  }
  const temporal = taa
    ? toonLabTraa(
      temporalBeauty,
      sceneDepth,
      sceneVelocity,
      camera,
      { initialSampleIndex: taaSampleIndex },
    )
    : null;
  const temporallyResolved = temporal ?? fogged;
  const bloomNode = bloom ? toonLabBloom(temporallyResolved) : null;
  const bloomTinted = bloomNode ? applyToonLabBloomTint(bloomNode) : null;
  const bloomed = bloomTinted
    ? temporallyResolved.add(vec4(bloomTinted.rgb, 0))
    : temporallyResolved;
  const vignetted = vignette ? applyToonLabVignette(bloomed) : bloomed;
  // TOONLAB does not evaluate the grading graph analytically per scene pixel. It
  // builds a 32^3 R8 strip and samples it with blue-slice interpolation. Keep
  // that quantization/interpolation boundary in the production stage.
  const graded = grade ? applyToonLabLdrGradeLut(vignetted) : vignetted;

  const beautyPipeline = new RenderPipeline(renderer);
  beautyPipeline.outputNode = fogged;
  const aoPipeline = aoNode ? new RenderPipeline(renderer) : null;
  if (aoPipeline) {
    aoPipeline.outputColorTransform = false;
    aoPipeline.outputNode = vec4(aoFactor, aoFactor, aoFactor, 1);
  }
  const temporalPipeline = temporal ? new RenderPipeline(renderer) : beautyPipeline;
  if (temporal) temporalPipeline.outputNode = temporal;
  const outputPipeline = new RenderPipeline(renderer);
  outputPipeline.outputNode = graded;

  // Expose deterministic stage outputs and actual cascade state. These are
  // deliberately separate RenderPipelines so choosing the AO beauty probe does
  // not compile or execute TRAA, and choosing the temporal probe cannot be
  // confused with bloom/vignette/grade output.
  const csmOwners = [];
  scene.traverse((object) => {
    const shadowNode = object.isDirectionalLight && object.castShadow
      ? object.shadow?.shadowNode
      : null;
    if (shadowNode?.userData?.toonLab && Array.isArray(shadowNode.lights)) {
      csmOwners.push(shadowNode);
    }
  });
  const getShadowState = () => ({
    activeOwnerCount: csmOwners.length,
    cascadeCount: csmOwners.reduce((sum, owner) => sum + owner.lights.length, 0),
    cascades: csmOwners.flatMap((owner, ownerIndex) => owner.lights.map(
      (cascadeLight, cascadeIndex) => {
        const shadowNode = owner._shadowNodes?.[cascadeIndex] ?? null;
        return {
          autoUpdate: cascadeLight.shadow.autoUpdate,
          cascadeIndex,
          mapAllocated: Boolean(shadowNode?.shadowMap),
          mapDepthVersion: shadowNode?.shadowMap?.depthTexture?.version ?? null,
          needsUpdate: cascadeLight.shadow.needsUpdate,
          ownerIndex,
        };
      },
    )),
    nativeFrameExact: csmOwners.every(
      (owner) => owner.userData.toonLab.currentFrame?.exactNativeProjectionDepth !== false,
    ),
  });
  const drawingSize = new THREE.Vector2();
  const renderPhaseState = {
    active: 'idle',
    completed: null,
    failed: null,
  };
  const runRenderPhase = (phase, render) => {
    renderPhaseState.active = phase;
    try {
      render();
      renderPhaseState.completed = phase;
      renderPhaseState.failed = null;
    } catch (error) {
      renderPhaseState.failed = phase;
      if (error && typeof error === 'object') {
        error.toonLabRenderPhase = phase;
      }
      throw error;
    } finally {
      renderPhaseState.active = 'idle';
    }
  };
  const renderPreTemporalBeauty = () => {
    if (!preTemporalBeautyPipeline) return;
    renderer.getDrawingBufferSize(drawingSize);
    preTemporalBeautyTarget.setSize(drawingSize.x, drawingSize.y);
    const previousRenderTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT();
    try {
      renderer.setRenderTarget(preTemporalBeautyTarget);
      renderer.setMRT(null);
      preTemporalBeautyPipeline.render();
    } finally {
      renderer.setRenderTarget(previousRenderTarget);
      renderer.setMRT(previousMrt);
    }
  };
  const renderStage = (stage = 'final') => {
    if (stage === 'ao' && aoPipeline) {
      runRenderPhase('ao-visibility', () => aoPipeline.render());
      return;
    }
    if (stage === 'beauty') {
      runRenderPhase('beauty-ao-fog', () => beautyPipeline.render());
      return;
    }
    runRenderPhase('pre-temporal-beauty-ao-fog', renderPreTemporalBeauty);
    if (stage === 'temporal') {
      runRenderPhase('temporal-resolve', () => temporalPipeline.render());
    } else {
      runRenderPhase(
        'final-temporal-bloom-vignette-grade',
        () => outputPipeline.render(),
      );
    }
  };
  const pipeline = explicitTemporalBeauty
    ? {
        isToonLabExplicitTemporalBeautyPipeline: true,
        outputPipeline,
        render: () => renderStage('final'),
        dispose() {
          preTemporalBeautyPipeline.dispose();
          preTemporalBeautyTarget.dispose();
          aoPipeline?.dispose();
          if (temporalPipeline !== beautyPipeline) temporalPipeline.dispose();
          beautyPipeline.dispose();
          outputPipeline.dispose();
        },
      }
    : outputPipeline;
  return {
    ambientOcclusion: aoNode,
    aoPipeline,
    beautyPipeline,
    bloom: bloomNode,
    diagnostics: {
      getAoVisibilityStats: (options) => aoNode?.readVisibilityStats(renderer, options) ?? null,
      getRenderPhaseState: () => ({ ...renderPhaseState }),
      getShadowState,
      stages: aoNode ? ['ao', 'beauty', 'temporal', 'final'] : ['beauty', 'temporal', 'final'],
    },
    emissiveScene,
    indirectScene,
    pipeline,
    outputPipeline,
    preTemporalBeautyPipeline,
    preTemporalBeautyTarget,
    render(stage = 'final') {
      renderStage(stage);
    },
    temporalPipeline,
    temporalAA: temporal,
    update() {
      temporal?.reset(taaSampleIndex);
    },
    metadata: {
      aoApplication: aoNode
        ? 'ToonLab split: indirect 1.0 / direct 0.25 / emission 0.0'
        : 'disabled',
      fogParticipation:
        'material MRT: PBR forward=1; S_StylizedSky/S_StylizedClouds UniversalUnlitSubTarget=0',
      depthConvention: renderer.reversedDepthBuffer
        ? 'raw renderer-native reversed depth for SSAO/fog/TRAA'
        : 'raw renderer-native conventional depth for SSAO/fog/TRAA',
      passOwnership: explicitTemporalBeauty
        ? 'explicit AO/fog beauty call, then TRAA with live scene depth/velocity dependencies'
        : 'single production graph plus isolated beauty/temporal diagnostics',
      order: ['opaque', 'ssao', 'fog', 'taa', 'bloom', 'vignette', 'ldr-grade'],
      remainingBridges: [
        ...(aoNode?.contract?.remainingBridges ?? []),
        ...(temporal?.contract?.remainingBridges ?? []),
        ...(bloomNode?.contract?.remainingBridges ?? []),
      ],
    },
  };
}
