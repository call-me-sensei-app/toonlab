import {
  DataTexture,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three/webgpu';
import GTAONode from 'three/examples/jsm/tsl/display/GTAONode.js';
import {
  Fn,
  If,
  Loop,
  PI,
  abs,
  acos,
  add,
  clamp,
  cos,
  cross,
  div,
  dot,
  float,
  getNormalFromDepth,
  getScreenPosition,
  getViewPosition,
  int,
  logarithmicDepthToViewZ,
  mat3,
  max,
  mix,
  mul,
  nodeObject,
  normalize,
  pow,
  sin,
  texture,
  textureSize,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
} from 'three/tsl';

const TOONLAB_SSAO_REORDER = Object.freeze([
  0, 11, 7, 3,
  10, 4, 15, 12,
  6, 8, 1, 14,
  13, 2, 9, 5,
]);

const POST_PROCESS_RADIUS_SCALES = Object.freeze({
  0: 1.2,
  1: 1.5,
  2: 1.5,
  3: 1,
  Cine: 1,
});

const TOONLAB_SSAO_SAMPLE_OFFSETS = Object.freeze([
  Object.freeze([0, -0.43]),
  Object.freeze([0.406, 0.5698]),
  Object.freeze([-0.58, 0.814]),
]);

export const TOONLAB_SOURCE_AMBIENT_OCCLUSION_CONTRACT = Object.freeze({
  application: 'deferred indirect-lighting and reflection composite',
  compute: false,
  method: 'classic deferred SSAO',
  methodCvar: 0,
  noiseExtent: 64,
  noisePattern: Object.freeze([4, 4]),
  pixelFormat: 'PF_B8G8R8A8 final / PF_FloatRGBA half-resolution setup',
  runtimeBridge: 'screen-radius Three GTAO horizon sampler with ToonLab noise and response',
  sourceFiles: Object.freeze([
    'Engine/Source/Runtime/Renderer/Private/CompositionLighting/PostProcessAmbientOcclusion.cpp',
    'Engine/Shaders/Private/PostProcessAmbientOcclusion.usf',
    'Engine/Shaders/Private/PostProcessAmbientOcclusionCommon.ush',
    'Engine/Source/Runtime/Renderer/Private/SystemTextures.cpp',
  ]),
  remainingBridges: Object.freeze([
    'ToonLab classic WedgeWithNormal sampler and HZB mip selection (runtime currently uses Three GTAO horizon integration)',
    'ToonLab half-resolution setup pass, 24-look-up coarse AO, and four-tap normal/depth-aware upsample blend',
    'ToonLab deferred application to material AO, SkyLight/indirect diffuse, and reflection environment instead of multiplying completed scene color',
    'ToonLab PF_B8G8R8A8/PF_FloatRGBA quantization and pixel-exact temporal randomization ordering',
  ]),
});

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(finite(value, minimum), minimum), maximum);
}

function cvarNumber(cvars, name, fallback) {
  return finite(cvars?.[name], fallback);
}

function cvarBoolean(cvars, name, fallback) {
  const value = cvars?.[name];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !/^(?:0|false|off|no)$/i.test(String(value).trim());
}

export function computeToonLabSourceSsaoLevel(settings, scaleToFullRes = 1) {
  const scale = Math.max(finite(scaleToFullRes, 1), 1);
  const mipExponent = Math.log2(scale);
  const scaledRadius = settings.radiusInWorldSpace
    ? settings.radiusCm
    : settings.radiusCm / 400;
  return {
    inverseMipThreshold: settings.mipThreshold / scale,
    mipBlend: settings.mipBlend,
    radiusInShader: scaledRadius * (settings.mipScale ** mipExponent) / 4,
    sampleLookups: scale > 1
      ? 6 * settings.sampleSteps * 2
      : TOONLAB_SSAO_SAMPLE_OFFSETS.length * settings.sampleSteps * 2,
    sampleSetSize: scale > 1 ? 6 : TOONLAB_SSAO_SAMPLE_OFFSETS.length,
    scaleRadiusInWorldSpace: settings.radiusInWorldSpace ? 1 : 0,
    scaleToFullRes: scale,
  };
}

/**
 * Resolve the effective ToonLabShowcase desktop SSAO state after project defaults,
 * the unbound post-process volume, and Epic post-process scalability.
 */
export function resolveToonLabSourceAmbientOcclusionSettings(
  postProcessSettings = {},
  {
    cvars = {},
    postProcessQuality = 3,
    projectEnabled = true,
    projectStaticFraction = true,
  } = {},
) {
  const qualityTier = String(postProcessQuality) === 'Cine'
    ? 'Cine'
    : Math.min(Math.max(Math.trunc(finite(postProcessQuality, 3)), 0), 3);
  const defaultRadiusScale = POST_PROCESS_RADIUS_SCALES[qualityTier];
  const radiusScale = clampNumber(
    cvarNumber(cvars, 'r.AmbientOcclusionRadiusScale', defaultRadiusScale),
    0.1,
    15,
  );
  const authoredRadiusCm = Math.max(
    finite(postProcessSettings.ambient_occlusion_radius, 200),
    0.1,
  );
  const radiusCm = authoredRadiusCm * radiusScale;
  const requestedQuality = clampNumber(
    postProcessSettings.ambient_occlusion_quality,
    0,
    100,
  );
  const qualityDefault = Number.isFinite(Number(postProcessSettings.ambient_occlusion_quality))
    ? requestedQuality
    : 50;
  const maxQuality = cvarNumber(
    cvars,
    'r.AmbientOcclusionMaxQuality',
    qualityTier === 0 ? 0 : 100,
  );
  const quality = maxQuality < 0
    ? clampNumber(-maxQuality, 0, 100)
    : Math.min(maxQuality, qualityDefault);
  const shaderQuality = Number(quality > 5)
    + Number(quality > 25)
    + Number(quality > 55)
    + Number(quality > 75);
  const forcedLevels = Math.trunc(cvarNumber(
    cvars,
    'r.AmbientOcclusionLevels',
    qualityTier === 0 ? 0 : -1,
  ));
  const automaticLevels = Math.min(
    1 + Number(quality > 35) + Number(quality > 70),
    3,
  );
  const levels = forcedLevels >= 0
    ? Math.min(Math.max(forcedLevels, 0), 3)
    : automaticLevels;
  const methodCvar = Math.trunc(cvarNumber(cvars, 'r.AmbientOcclusion.Method', 0));
  const enabled = cvarBoolean(
    cvars,
    'r.DefaultFeature.AmbientOcclusion',
    projectEnabled,
  ) && levels > 0;
  const staticFractionEnabled = cvarBoolean(
    cvars,
    'r.DefaultFeature.AmbientOcclusionStaticFraction',
    projectStaticFraction,
  );
  const radiusInWorldSpace = Boolean(
    postProcessSettings.ambient_occlusion_radius_in_ws
      ?? postProcessSettings.ambient_occlusion_radius_in_world_space
      ?? false,
  );
  const settings = {
    authoredRadiusCm,
    bias: Math.max(finite(postProcessSettings.ambient_occlusion_bias, 3), 0),
    biasDistance: Math.max(finite(postProcessSettings.ambient_occlusion_bias, 3), 0) / 1000,
    compute: cvarNumber(cvars, 'r.AmbientOcclusion.Compute', 0) >= 1,
    enabled,
    fadeDistanceCm: Math.max(
      finite(postProcessSettings.ambient_occlusion_fade_distance, 8000),
      0,
    ),
    fadeRadiusCm: Math.max(
      finite(postProcessSettings.ambient_occlusion_fade_radius, 5000),
      1,
    ),
    hzbMipLevelFactor: clampNumber(
      cvarNumber(
        cvars,
        'r.AmbientOcclusionMipLevelFactor',
        qualityTier >= 3 || qualityTier === 'Cine' ? 0.4 : 0.6,
      ),
      0,
      100,
    ),
    intensity: enabled
      ? clampNumber(
        finite(postProcessSettings.ambient_occlusion_intensity, 0.5),
        0,
        1,
      )
      : 0,
    levels,
    method: methodCvar === 1 ? 'GTAO' : 'SSAO',
    methodCvar,
    mipBlend: clampNumber(
      finite(postProcessSettings.ambient_occlusion_mip_blend, 0.6),
      0,
      1,
    ),
    mipScale: Math.max(finite(postProcessSettings.ambient_occlusion_mip_scale, 1.7), 0),
    mipThreshold: Math.max(
      finite(postProcessSettings.ambient_occlusion_mip_threshold, 0.01),
      0,
    ),
    pixelShader: cvarNumber(cvars, 'r.AmbientOcclusion.Compute', 0) < 1,
    postProcessQuality: qualityTier,
    power: Math.max(finite(postProcessSettings.ambient_occlusion_power, 2), 0.1),
    quality,
    radiusCm,
    radiusInWorldSpace,
    radiusScale,
    sampleOffsets: TOONLAB_SSAO_SAMPLE_OFFSETS.map((offset) => [...offset]),
    sampleSteps: [1, 1, 2, 3, 3][shaderQuality],
    shaderQuality,
    staticFraction: staticFractionEnabled
      ? clampNumber(
        finite(postProcessSettings.ambient_occlusion_static_fraction, 1),
        0,
        1,
      )
      : 0,
  };
  settings.fullResolution = computeToonLabSourceSsaoLevel(settings, 1);
  settings.halfResolution = levels >= 2
    ? computeToonLabSourceSsaoLevel(settings, 2)
    : null;
  settings.fadeStartCm = Math.max(
    settings.fadeDistanceCm - settings.fadeRadiusCm,
    0,
  );
  return settings;
}

export function evaluateToonLabSourceAmbientOcclusionResponse(
  rawOcclusion,
  settings = {},
  sceneDepthCm = 0,
) {
  const resolved = settings.fullResolution
    ? settings
    : resolveToonLabSourceAmbientOcclusionSettings(settings);
  const raw = clampNumber(rawOcclusion, 0, 1);
  const fade = clampNumber(
    (finite(sceneDepthCm, 0) - resolved.fadeStartCm) / resolved.fadeRadiusCm,
    0,
    1,
  );
  const faded = raw + (1 - raw) * fade;
  return 1 - (1 - Math.abs(faded) ** resolved.power) * resolved.intensity;
}

function quantize8SignedByte(value) {
  return Math.min(Math.max(Math.trunc((value * 0.5 + 0.5) * 255 + 0.5), 0), 255);
}

export function computeToonLabSourceSsaoRandomizationData(extent = 64) {
  const size = Math.max(4, Math.trunc(finite(extent, 64)));
  const bases = TOONLAB_SSAO_REORDER.map((reordered) => {
    const angle = (reordered / 16) * Math.PI;
    const length = 1 - (Math.sin(198 * reordered * 0.01) * 0.5 + 0.5) * 0.23;
    return {
      alpha: Math.min(Math.max(Math.trunc((2 * length - 1) * 255 + 0.5), 0), 255),
      reordered,
      length,
      r: quantize8SignedByte(Math.cos(angle) * length),
      g: quantize8SignedByte(Math.sin(angle) * length),
    };
  });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const basis = bases[(x % 4) + (y % 4) * 4];
      const offset = (x + y * size) * 4;
      data[offset] = basis.r;
      data[offset + 1] = basis.g;
      data[offset + 2] = 128;
      // GTAONode uses alpha as a radial multiplier. Encoding `2*len-1`
      // makes its `0.5 + 0.5*a` reconstruction equal ToonLab's basis length.
      data[offset + 3] = basis.alpha;
    }
  }
  return { bases, data, extent: size };
}

export function createToonLabSourceSsaoRandomizationTexture() {
  const { data, extent } = computeToonLabSourceSsaoRandomizationData();
  const result = new DataTexture(
    data,
    extent,
    extent,
    RGBAFormat,
    UnsignedByteType,
  );
  result.name = 'ToonLab.SourceSSAO.Randomization';
  result.colorSpace = NoColorSpace;
  result.wrapS = RepeatWrapping;
  result.wrapT = RepeatWrapping;
  result.minFilter = NearestFilter;
  result.magFilter = NearestFilter;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

/**
 * WebGPU bridge for ToonLab's view-locked SSAO radius and random basis.
 *
 * The horizon integral remains Three GTAO, which is intentionally exposed in
 * `contract.remainingBridges`; the source radius, temporal noise addressing,
 * lookup budget, fade, power, and intensity no longer use unrelated Three
 * defaults.
 */
export class ToonLabSourceAmbientOcclusionNode extends GTAONode {
  static get type() {
    return 'ToonLabSourceAmbientOcclusionNode';
  }

  constructor(depthNode, normalNode, camera, settings = {}, {
    temporalSampleIndex = null,
  } = {}) {
    super(nodeObject(depthNode), nodeObject(normalNode), camera);
    this.settings = settings.fullResolution
      ? settings
      : resolveToonLabSourceAmbientOcclusionSettings(settings);
    this.contract = TOONLAB_SOURCE_AMBIENT_OCCLUSION_CONTRACT;
    this.temporalSampleIndex = nodeObject(temporalSampleIndex ?? uniform(0));
    this._sourceNoiseTexture = createToonLabSourceSsaoRandomizationTexture();
    this._noiseNode = texture(this._sourceNoiseTexture);
    this.radius.value = this.settings.fullResolution.radiusInShader;
    // Three's exponent controls sample placement; ToonLab AO Power is an output
    // response and is applied separately below.
    this.distanceExponent.value = 1;
    this.distanceFallOff.value = 0;
    this.scale.value = 1;
    this.thickness.value = 1e6;
    // Three's loop emits two depth lookups per direction and step. Four here
    // resolves to three directions * two steps * two sides = 12 lookups, the
    // same full-resolution budget as ToonLab shader-quality 2.
    this.samples.value = 4;
    this.resolutionScale = 1;
    // ToonLab offsets its exact 4x4 random basis using the active 8-sample TAA
    // index. Disable GTAONode's separate six-angle temporal rotation.
    this.useTemporalFiltering = false;
  }

  setup(builder) {
    const uvNode = uv();
    const sampleDepth = (sampleUv) => {
      const depth = this.depthNode.sample(sampleUv).r;
      if (builder.renderer.logarithmicDepthBuffer === true) {
        const viewZ = logarithmicDepthToViewZ(
          depth,
          this._cameraNear,
          this._cameraFar,
        );
        return viewZToPerspectiveDepth(viewZ, this._cameraNear, this._cameraFar);
      }
      return depth;
    };
    const sampleNoise = (sampleUv) => this._noiseNode.sample(sampleUv);
    const sampleNormal = (sampleUv) => (this.normalNode !== null
      ? this.normalNode.sample(sampleUv).rgb.normalize()
      : getNormalFromDepth(
        sampleUv,
        this.depthNode.value,
        this._cameraProjectionMatrixInverse,
      ));

    const sourceAo = Fn(() => {
      const depth = sampleDepth(uvNode).toVar();
      depth.greaterThanEqual(1).discard();
      const viewPosition = getViewPosition(
        uvNode,
        depth,
        this._cameraProjectionMatrixInverse,
      ).toVar();
      const viewNormal = sampleNormal(uvNode).toVar();
      // Source AmbientOcclusionRadiusInWS=false: ActualAORadius is the
      // normalized radius multiplied by per-pixel scene depth.
      const radiusToUse = this.settings.radiusInWorldSpace
        ? this.radius.div(100)
        : this.radius.mul(abs(viewPosition.z));
      const noiseResolution = textureSize(this._noiseNode, 0);
      let noiseUv = vec2(uvNode.x, uvNode.y.oneMinus());
      noiseUv = noiseUv.mul(this.resolution.div(noiseResolution));
      noiseUv = noiseUv.add(
        vec2(2.48 / 64, 7.52 / 64).mul(this.temporalSampleIndex),
      );
      const noiseTexel = sampleNoise(noiseUv);
      const randomVec = noiseTexel.xyz.mul(2).sub(1);
      const tangent = vec3(randomVec.xy, 0).normalize();
      const bitangent = vec3(tangent.y.mul(-1), tangent.x, 0);
      const kernelMatrix = mat3(tangent, bitangent, vec3(0, 0, 1));
      const directions = this.samples.lessThan(30).select(3, 5).toVar();
      const steps = add(this.samples, directions.sub(1)).div(directions).toVar();
      const result = float(0).toVar();

      Loop({ start: int(0), end: directions, type: 'int', condition: '<' }, ({ i }) => {
        const angle = float(i).div(float(directions)).mul(PI).toVar();
        const sampleDir = vec4(
          cos(angle),
          sin(angle),
          0,
          add(0.5, mul(0.5, noiseTexel.w)),
        );
        sampleDir.xyz = normalize(kernelMatrix.mul(sampleDir.xyz));
        const viewDir = normalize(viewPosition.xyz.negate()).toVar();
        const sliceBitangent = normalize(cross(sampleDir.xyz, viewDir)).toVar();
        const sliceTangent = cross(sliceBitangent, viewDir).toVar();
        const projectedNormalRaw = viewNormal.sub(
          sliceBitangent.mul(dot(viewNormal, sliceBitangent)),
        ).toVar();
        const projectedNormalLength = projectedNormalRaw.length().toVar();
        const projectedNormal = projectedNormalRaw.div(
          max(projectedNormalLength, float(0.0001)),
        ).toVar();
        const normalSin = dot(projectedNormal, sliceTangent).toVar();
        const normalCos = clamp(dot(projectedNormal, viewDir), 0, 1).toVar();
        const normalSinSign = normalSin.greaterThanEqual(0)
          .select(float(1), float(-1));
        const normalAngle = normalSinSign.mul(acos(normalCos)).toVar();
        const tangentToNormal = cross(projectedNormal, sliceBitangent).toVar();
        const cosineHorizons = vec2(
          dot(viewDir, tangentToNormal),
          dot(viewDir, tangentToNormal.negate()),
        ).toVar();

        Loop({ end: steps, type: 'int', name: 'j', condition: '<' }, ({ j }) => {
          const sampleViewOffset = sampleDir.xyz
            .mul(radiusToUse)
            .mul(sampleDir.w)
            .mul(pow(
              div(float(j).add(1), float(steps)),
              this.distanceExponent,
            ));
          const sampleScreenX = getScreenPosition(
            viewPosition.add(sampleViewOffset),
            this._cameraProjectionMatrix,
          ).toVar();
          const sampleDepthX = sampleDepth(sampleScreenX).toVar();
          const sceneViewPositionX = getViewPosition(
            sampleScreenX,
            sampleDepthX,
            this._cameraProjectionMatrixInverse,
          ).toVar();
          const viewDeltaX = sceneViewPositionX.sub(viewPosition).toVar();
          If(abs(viewDeltaX.z).lessThan(this.thickness), () => {
            const sampleHorizon = dot(viewDir, normalize(viewDeltaX));
            cosineHorizons.x.addAssign(max(
              0,
              mul(
                sampleHorizon.sub(cosineHorizons.x),
                mix(
                  1,
                  float(2).div(float(j).add(2)),
                  this.distanceFallOff,
                ),
              ),
            ));
          });
          const sampleScreenY = getScreenPosition(
            viewPosition.sub(sampleViewOffset),
            this._cameraProjectionMatrix,
          ).toVar();
          const sampleDepthY = sampleDepth(sampleScreenY).toVar();
          const sceneViewPositionY = getViewPosition(
            sampleScreenY,
            sampleDepthY,
            this._cameraProjectionMatrixInverse,
          ).toVar();
          const viewDeltaY = sceneViewPositionY.sub(viewPosition).toVar();
          If(abs(viewDeltaY.z).lessThan(this.thickness), () => {
            const sampleHorizon = dot(viewDir, normalize(viewDeltaY));
            cosineHorizons.y.addAssign(max(
              0,
              mul(
                sampleHorizon.sub(cosineHorizons.y),
                mix(
                  1,
                  float(2).div(float(j).add(2)),
                  this.distanceFallOff,
                ),
              ),
            ));
          });
        });

        const positiveHorizon = acos(cosineHorizons.y).toVar();
        const negativeHorizon = acos(cosineHorizons.x).negate().toVar();
        const positiveTerm = cos(positiveHorizon.mul(2).sub(normalAngle))
          .negate()
          .add(normalCos)
          .add(positiveHorizon.mul(2).mul(normalSin));
        const negativeTerm = cos(negativeHorizon.mul(2).sub(normalAngle))
          .negate()
          .add(normalCos)
          .add(negativeHorizon.mul(2).mul(normalSin));
        result.addAssign(
          projectedNormalLength.mul(positiveTerm.add(negativeTerm).mul(0.25)),
        );
      });

      result.assign(clamp(result.div(directions), 0, 1));
      result.assign(pow(result, this.scale));
      return result;
    });
    this._material.fragmentNode = sourceAo().context(builder.getSharedContext());
    this._material.needsUpdate = true;
    return this._textureNode;
  }

  dispose() {
    this._sourceNoiseTexture.dispose();
    super.dispose();
  }
}

export function createToonLabSourceAmbientOcclusionResponseNode(
  rawOcclusionNode,
  sceneViewZNode,
  settings = {},
) {
  const resolved = settings.fullResolution
    ? settings
    : resolveToonLabSourceAmbientOcclusionSettings(settings);
  const depthCm = abs(sceneViewZNode).mul(100);
  const fade = clamp(
    depthCm.sub(resolved.fadeStartCm).div(resolved.fadeRadiusCm),
    0,
    1,
  );
  const faded = mix(clamp(rawOcclusionNode, 0, 1), float(1), fade);
  return float(1).sub(
    float(1).sub(pow(abs(faded), resolved.power)).mul(resolved.intensity),
  );
}

export function toonLabSourceAmbientOcclusion(
  depthNode,
  normalNode,
  sceneViewZNode,
  camera,
  postProcessSettings = {},
  options = {},
) {
  const settings = resolveToonLabSourceAmbientOcclusionSettings(
    postProcessSettings,
    options,
  );
  const node = new ToonLabSourceAmbientOcclusionNode(
    depthNode,
    normalNode,
    camera,
    settings,
    {
      temporalSampleIndex: options.temporalSampleIndex,
    },
  );
  if (Number.isFinite(Number(options.samples))) {
    node.samples.value = Math.max(Number(options.samples), 1);
  }
  if (Number.isFinite(Number(options.resolutionScale))) {
    node.resolutionScale = Math.min(Math.max(Number(options.resolutionScale), 0.1), 1);
  }
  node.outputNode = settings.enabled
    ? createToonLabSourceAmbientOcclusionResponseNode(
      node.getTextureNode().r,
      sceneViewZNode,
      settings,
    )
    : float(1);
  return node;
}
