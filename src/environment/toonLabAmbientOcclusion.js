// Literal ToonLab reference renderer BlueNoise Alchemy SSAO renderer feature.
//
// This module is intentionally independent from Three's GTAONode. The active
// supplied PC renderer uses TOONLAB's distance-based Alchemy estimator, a rotating
// eight-texture blue-noise sequence, an RGBA8 obscurance+normal intermediate,
// two geometry-aware bilateral passes, and a final diagonal blur/inversion to
// an R8 visibility texture.

import {
  ClampToEdgeWrapping,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RedFormat,
  RenderTarget,
  RendererUtils,
  RepeatWrapping,
  RGBAFormat,
  TempNode,
  TextureLoader,
  UnsignedByteType,
  Vector2,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  dot,
  float,
  floor,
  fract,
  getScreenPosition,
  getViewPosition,
  int,
  ivec2,
  max,
  mix,
  nodeObject,
  passTexture,
  perspectiveDepthToViewZ,
  pow,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

const BLUE_NOISE_TEXTURE_COUNT = 8;
const BLUE_NOISE_TEXTURE_SIZE = 256;
const SKY_DEPTH_EPSILON = 0.00001;
const K_BETA = 0.004;
const K_EPSILON = 0.0001;
const K_CONTRAST = 0.6;
const K_GEOMETRY_COEFFICIENT = 0.8;
const TWO_PI_TIMES_100 = Math.PI * 2 * 100;

const _quadMesh = new QuadMesh();
const _drawingBufferSize = new Vector2();
const _activeRenderers = new WeakSet();
let _activeUpdateDepth = 0;

export const TOONLAB_SURFACE_SSAO_RANDOM_UV = Object.freeze([
  0.00000000, 0.33984375, 0.75390625, 0.56640625, 0.98437500,
  0.07421875, 0.23828125, 0.64062500, 0.35937500, 0.50781250,
  0.38281250, 0.98437500, 0.17578125, 0.53906250, 0.28515625,
  0.23137260, 0.45882360, 0.54117650, 0.12941180, 0.64313730,
  0.92968750, 0.76171875, 0.13333330, 0.01562500, 0.00000000,
  0.10546875, 0.64062500, 0.74609375, 0.67968750, 0.35156250,
  0.49218750, 0.12500000, 0.26562500, 0.62500000, 0.44531250,
  0.17647060, 0.44705890, 0.93333340, 0.87058830, 0.56862750,
]);

export const TOONLAB_SURFACE_SSAO_BILATERAL_KERNEL = Object.freeze([
  Object.freeze({ offset: 0, weight: 0.2270270270 }),
  Object.freeze({ offset: -1.3846153846, weight: 0.3162162162 }),
  Object.freeze({ offset: 1.3846153846, weight: 0.3162162162 }),
  Object.freeze({ offset: -3.2307692308, weight: 0.0702702703 }),
  Object.freeze({ offset: 3.2307692308, weight: 0.0702702703 }),
]);

export const TOONLAB_SURFACE_BLUE_NOISE_SHA256 = Object.freeze([
  '90564273ed872da744aa7cc87d81b0090c7103eab2f223225c357909b41da803',
  '7360c0d8880110ec841114c6aea59c39123d1fb8b261e6bf9fc9573b65b0d0ea',
  'd7db3110bd3f60169e09066e061e161e522625b013a557e923eb384a97316d5f',
  '19c67a1256b2c20c779470719386737aaa3366bd2058197bbfc3ebea71e5de29',
  '2c928bfffc64c339f980c02a022bf0ac2e3b37df29b079e44625b97fdde76058',
  '5c9977b8fc9b7c83d00ca60937977824badc5eb2ce3c744539f96cb22796157b',
  'e35af946a68313ad0973bc298bfb2db18238f885ee04b4a7e760c75acafc777a',
  'c8cf3f8d5f95fc139f19676f5a34cba46f7e31d61ef6bf826df7aeefc09680d4',
]);

export const TOONLAB_SURFACE_SSAO_SOURCE = Object.freeze({
  authority: 'ToonLab reference renderer',
  blueNoiseBaseUrl:
    '/assets-local/reference-environment/renderer/blue-noise/LDR_LLL1_',
  screenSpaceAmbientOcclusionPassSha256:
    '4259a54ed2debe4add16651094af62ee3b3bc18587652fc1d8bc913d6398271d',
  screenSpaceAmbientOcclusionShaderSha256:
    'c80f2fcd4d166efe99b4e7110a1eaf9bbad7cff99b3d20726c80c45cb216aa9e',
  ssaoHlslSha256:
    '2a1699a786c557ed8d8aebe64a9d727e3d099bd502cb85e6a47d197d09154bd9',
  pcRendererSha256:
    '3d0b01d8ded3327263b6690be128a3de58d17c514943ae42fe743a3e084a9c79',
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function saturateCpu(value) {
  return Math.min(Math.max(value, 0), 1);
}

function dotCpu(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function smoothstepCpu(edge0, edge1, value) {
  const t = saturateCpu((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** CPU oracle for SSAO.hlsl PickSamplePoint() on the active BlueNoise branch. */
export function pickToonLabSurfaceBlueNoiseSamplePoint({
  noise,
  normal = [0, 1, 0],
  radius = 0.45,
  sampleCount = 8,
  sampleIndex = 0,
} = {}) {
  const count = Math.max(1, Math.trunc(finite(sampleCount, 8)));
  const index = Math.min(Math.max(Math.trunc(finite(sampleIndex)), 0), 19);
  const lerpValue = index / count;
  const resolvedNoise = finite(noise);
  const u = ((TOONLAB_SURFACE_SSAO_RANDOM_UV[index] + resolvedNoise) % 1 + 1) % 1
    * 2 - 1;
  const theta = (TOONLAB_SURFACE_SSAO_RANDOM_UV[20 + index] + resolvedNoise)
    * TWO_PI_TIMES_100;
  const radial = Math.sqrt(Math.max(1 - u * u, 0));
  let vector = [radial * Math.cos(theta), radial * Math.sin(theta), u];
  const hemisphere = dotCpu(normal.map((value) => finite(value)), vector) >= 0 ? 1 : -1;
  const radialScale = 0.1 + 0.9 * lerpValue * lerpValue;
  vector = vector.map((value) => value * hemisphere * radialScale * radius);
  return Object.freeze({
    lerpValue,
    radialScale,
    theta,
    u,
    vector: Object.freeze(vector),
  });
}

/** CPU oracle for one Alchemy sample before radius/count/intensity response. */
export function evaluateToonLabSurfaceAlchemySample({
  centerLinearDepth = 1,
  delta = [0, 0, 0],
  normal = [0, 1, 0],
  radius = 0.45,
  sampleLinearDepth = 1,
  samplePointLinearDepth = 1,
  sampleIsSky = false,
} = {}) {
  const resolvedRadius = finite(radius, 0.45);
  const inside = !sampleIsSky
    && Math.abs(finite(samplePointLinearDepth) - finite(sampleLinearDepth))
      < resolvedRadius;
  if (!inside) return 0;
  const resolvedDelta = delta.map((value) => finite(value));
  const dotValue = dotCpu(resolvedDelta, normal.map((value) => finite(value)))
    - K_BETA * finite(centerLinearDepth, 1);
  const denominator = dotCpu(resolvedDelta, resolvedDelta) + K_EPSILON;
  return Math.max(dotValue, 0) / denominator;
}

/** CPU oracle for SSAO.hlsl's normalization and final visibility response. */
export function evaluateToonLabSurfaceAlchemyVisibility(rawContributionSum, {
  centerLinearDepth = 1,
  falloffDistance = 100,
  intensity = 0.4,
  radius = 0.45,
  sampleCount = 8,
} = {}) {
  const depth = Math.max(finite(centerLinearDepth), 0);
  const falloff = Math.max(1 - depth / finite(falloffDistance, 100), 0) ** 2;
  const normalized = saturateCpu(
    Math.max(finite(rawContributionSum), 0)
      * finite(radius, 0.45)
      * finite(intensity, 0.4)
      * falloff
      / Math.max(1, finite(sampleCount, 8)),
  );
  const obscurance = normalized ** K_CONTRAST;
  return Object.freeze({ falloff, normalized, obscurance, visibility: 1 - obscurance });
}

/** CPU oracle for one TOONLAB geometry-aware five-tap bilateral pass. */
export function evaluateToonLabSurfaceSsaoBilateral(samples) {
  if (!Array.isArray(samples) || samples.length !== 5) {
    throw new TypeError('ToonLab SSAO bilateral oracle requires five samples.');
  }
  const centerNormal = (samples[0].normal ?? [0, 0, 0]).map((value) => finite(value));
  let weightedAo = 0;
  let weightSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const normalWeight = index === 0 ? 1 : smoothstepCpu(
      K_GEOMETRY_COEFFICIENT,
      1,
      dotCpu(
        centerNormal,
        (sample.normal ?? [0, 0, 0]).map((value) => finite(value)),
      ),
    );
    const weight = TOONLAB_SURFACE_SSAO_BILATERAL_KERNEL[index].weight * normalWeight;
    weightedAo += finite(sample.ao) * weight;
    weightSum += weight;
  }
  return weightedAo / weightSum;
}

/** CPU oracle for FinalBlur(): diagonal five-tap normal-aware blur + invert. */
export function evaluateToonLabSurfaceSsaoFinalVisibility(samples) {
  if (!Array.isArray(samples) || samples.length !== 5) {
    throw new TypeError('ToonLab SSAO final-blur oracle requires five samples.');
  }
  const centerNormal = (samples[0].normal ?? [0, 0, 0]).map((value) => finite(value));
  let weightedAo = finite(samples[0].ao);
  let weightSum = 1;
  for (let index = 1; index < samples.length; index += 1) {
    const weight = smoothstepCpu(
      K_GEOMETRY_COEFFICIENT,
      1,
      dotCpu(
        centerNormal,
        (samples[index].normal ?? [0, 0, 0]).map((value) => finite(value)),
      ),
    );
    weightedAo += finite(samples[index].ao) * weight;
    weightSum += weight;
  }
  return 1 - weightedAo / weightSum;
}

function configureBlueNoiseTexture(map, index) {
  map.name = `ToonLab.TOONLAB.BlueNoise.LDR_LLL1_${index}`;
  map.colorSpace = NoColorSpace;
  map.generateMipmaps = false;
  map.magFilter = NearestFilter;
  map.minFilter = NearestFilter;
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.flipY = false;
  // TextureLoader.load() returns before `image` exists. Bumping the version at
  // that point makes WebGPU's upload path dereference `image.complete` on
  // null. TextureLoader performs its own version bump in onLoad; an async
  // caller that reaches this function after decode may safely refresh again.
  if (isDecodedBlueNoiseImage(map.image)) map.needsUpdate = true;
  return map;
}

function isDecodedBlueNoiseImage(image) {
  if (!image || image.complete === false) return false;
  const width = finite(image.naturalWidth ?? image.videoWidth ?? image.width);
  const height = finite(image.naturalHeight ?? image.videoHeight ?? image.height);
  return width === BLUE_NOISE_TEXTURE_SIZE && height === BLUE_NOISE_TEXTURE_SIZE;
}

/** Fail closed rather than rendering a frame with fallback/uninitialized noise. */
export function assertToonLabSurfaceBlueNoiseTexturesReady(textures) {
  if (!Array.isArray(textures) || textures.length !== BLUE_NOISE_TEXTURE_COUNT) {
    throw new RangeError('ToonLab SSAO requires exactly eight blue-noise textures.');
  }
  for (let index = 0; index < textures.length; index += 1) {
    if (!isDecodedBlueNoiseImage(textures[index]?.image)) {
      throw new Error(
        `ToonLab SSAO blue-noise texture ${index} is not decoded at first render.`,
      );
    }
  }
  return textures;
}

/**
 * Decode all eight exact package PNGs before constructing the SSAO pass.
 * Production callers must await this path so frame zero cannot bind fallback
 * pixels or a TextureLoader object whose image is still null.
 */
export async function loadToonLabSurfaceBlueNoiseTexturesAsync({
  baseUrl = TOONLAB_SURFACE_SSAO_SOURCE.blueNoiseBaseUrl,
  textureLoader = new TextureLoader(),
} = {}) {
  const textures = await Promise.all(
    Array.from({ length: BLUE_NOISE_TEXTURE_COUNT }, async (_, index) => {
      const map = await textureLoader.loadAsync(`${baseUrl}${index}.png`);
      const image = map.image;
      if (typeof image?.decode === 'function') await image.decode();
      return configureBlueNoiseTexture(map, index);
    }),
  );
  return assertToonLabSurfaceBlueNoiseTexturesReady(textures);
}

function createIntermediateTarget(name) {
  const target = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RGBAFormat,
    magFilter: LinearFilter,
    minFilter: LinearFilter,
    stencilBuffer: false,
    type: UnsignedByteType,
  });
  target.texture.name = name;
  target.texture.colorSpace = NoColorSpace;
  target.texture.generateMipmaps = false;
  target.texture.wrapS = ClampToEdgeWrapping;
  target.texture.wrapT = ClampToEdgeWrapping;
  return target;
}

function createFinalTarget() {
  const target = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RedFormat,
    magFilter: LinearFilter,
    minFilter: LinearFilter,
    stencilBuffer: false,
    type: UnsignedByteType,
  });
  target.texture.name = 'ToonLab.TOONLAB.SSAO.ScreenSpaceOcclusionTexture';
  target.texture.colorSpace = NoColorSpace;
  target.texture.generateMipmaps = false;
  target.texture.wrapS = ClampToEdgeWrapping;
  target.texture.wrapT = ClampToEdgeWrapping;
  return target;
}

/**
 * Exact active TOONLAB BlueNoise/Alchemy SSAO pass for the environment reference renderer.
 *
 * `depthNode` must use the renderer-native device-depth convention. Three's
 * `perspectiveDepthToViewZ()` selects its equation from the active renderer,
 * and `getViewPosition()` consumes the camera projection matrix that Three
 * updates to the same convention. Feeding a pre-inverted depth texture into
 * either function under reversed Z reconstructs the wrong surface positions.
 * ToonLab also runs this shader with native reversed Z on Metal, so retaining
 * the raw depth is the source-literal path.
 */
export class ToonLabSurfaceBlueNoiseAmbientOcclusionNode extends TempNode {
  static get type() {
    return 'ToonLabSurfaceBlueNoiseAmbientOcclusionNode';
  }

  constructor(depthNode, normalNode, camera, settings, {
    blueNoiseTextures = null,
    random = Math.random,
  } = {}) {
    super('float');
    this.depthNode = nodeObject(depthNode);
    this.normalNode = nodeObject(normalNode);
    this.camera = camera;
    this.settings = Object.freeze({
      contrast: finite(settings?.contrast, K_CONTRAST),
      directLightingStrength: finite(settings?.directLightingStrength, 0.25),
      falloff: finite(settings?.falloff, 100),
      fullResolution: settings?.fullResolution !== false,
      intensity: finite(settings?.intensity, 0.4),
      radiusInShader: finite(settings?.radiusInShader, 0.45),
      sampleCount: Math.max(1, Math.trunc(finite(settings?.sampleCount, 8))),
    });
    if (this.settings.sampleCount !== 8) {
      throw new RangeError('The active environment reference SSAO contract requires exactly 8 samples.');
    }
    if (blueNoiseTextures === null) {
      throw new Error(
        'ToonLab SSAO requires awaited loadToonLabSurfaceBlueNoiseTexturesAsync() input.',
      );
    }
    this.blueNoiseTextures = assertToonLabSurfaceBlueNoiseTexturesReady(blueNoiseTextures);
    this.random = typeof random === 'function' ? random : Math.random;
    this.resolution = uniform(new Vector2(1, 1));
    this.inverseResolution = uniform(new Vector2(1, 1));
    this.blueNoiseScale = uniform(new Vector2(1 / BLUE_NOISE_TEXTURE_SIZE, 1 / BLUE_NOISE_TEXTURE_SIZE));
    this.blueNoiseOffset = uniform(new Vector2());
    this._cameraProjectionMatrix = uniform(camera.projectionMatrix);
    this._cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this._cameraViewMatrix = uniform(camera.matrixWorldInverse);
    this._cameraWorldMatrix = uniform(camera.matrixWorld);
    this._randomUv = uniformArray([...TOONLAB_SURFACE_SSAO_RANDOM_UV], 'float');
    this._blueNoiseTextureIndex = 0;
    this._blueNoiseTextureNode = texture(this.blueNoiseTextures[0]);
    this._aoTarget = createIntermediateTarget('ToonLab.TOONLAB.SSAO.OcclusionTexture0');
    this._blurTarget = createIntermediateTarget('ToonLab.TOONLAB.SSAO.OcclusionTexture1');
    this._finalTarget = createFinalTarget();
    this._textureNode = passTexture(this, this._finalTarget.texture);
    this._aoMaterial = null;
    this._horizontalMaterial = null;
    this._verticalMaterial = null;
    this._finalMaterial = null;
    this._rendererState = undefined;
    this._updating = false;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.outputNode = this._textureNode.r;
    this.contract = Object.freeze({
      authority: TOONLAB_SURFACE_SSAO_SOURCE.authority,
      blueNoise: 'rotating LDR_LLL1_0..7, point-repeat, Random.value XY offset',
      depth: 'renderer-native device depth; reversed-Z sky and reconstruction handled explicitly',
      estimator: 'Morgan 2011 Alchemy distance obscurance, 8 samples',
      formats: 'RGBA8 obscurance+normal -> RGBA8 bilateral scratch -> R8 visibility',
      normalSource: 'material normal MRT (ToonLab Source=DepthNormals)',
      order: Object.freeze([
        'Alchemy obscurance',
        'bilateral horizontal',
        'bilateral vertical',
        'diagonal final blur + visibility inversion',
      ]),
      remainingBridges: Object.freeze([
        'ToonLab HLSL half arithmetic is evaluated as WebGPU f32 before the source-exact UNorm8 pass boundaries',
        'ToonLabEngine.Random stream state is host-global; ToonLab preserves two random draws per frame but not unrelated ToonLab random consumers',
      ]),
    });
  }

  getTextureNode() {
    return this._textureNode;
  }

  /**
   * Read the final R8 visibility texture without any tone mapping or grading.
   * This is a runtime gate for the exact pass output, not a visual estimate.
   */
  async readVisibilityStats(renderer, { stride = 1 } = {}) {
    if (!renderer?.isWebGPURenderer
      || typeof renderer.readRenderTargetPixelsAsync !== 'function') {
      throw new TypeError('ToonLab SSAO visibility statistics require WebGPURenderer readback.');
    }
    const width = this._finalTarget.width;
    const height = this._finalTarget.height;
    const pixels = await renderer.readRenderTargetPixelsAsync(
      this._finalTarget,
      0,
      0,
      width,
      height,
    );
    const pixelCount = width * height;
    const channels = Math.max(1, Math.trunc(pixels.length / pixelCount));
    const resolvedStride = Math.max(1, Math.trunc(finite(stride, 1)));
    const integerScale = pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray
      ? 1 / 255
      : 1;
    const histogram = new Uint32Array(256);
    let count = 0;
    let minVisibility = 1;
    let maxVisibility = 0;
    let sum = 0;
    let belowHalf = 0;
    let belowThreeQuarters = 0;
    let atLeastNinetyFivePercent = 0;
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += resolvedStride) {
      const visibility = saturateCpu(finite(pixels[pixelIndex * channels]) * integerScale);
      const bucket = Math.min(255, Math.max(0, Math.round(visibility * 255)));
      histogram[bucket] += 1;
      minVisibility = Math.min(minVisibility, visibility);
      maxVisibility = Math.max(maxVisibility, visibility);
      sum += visibility;
      belowHalf += visibility < 0.5 ? 1 : 0;
      belowThreeQuarters += visibility < 0.75 ? 1 : 0;
      atLeastNinetyFivePercent += visibility >= 0.95 ? 1 : 0;
      count += 1;
    }
    const percentile = (fraction) => {
      const threshold = Math.max(0, Math.ceil(count * fraction) - 1);
      let accumulated = 0;
      for (let bucket = 0; bucket < histogram.length; bucket += 1) {
        accumulated += histogram[bucket];
        if (accumulated > threshold) return bucket / 255;
      }
      return 1;
    };
    return Object.freeze({
      atLeastNinetyFivePercentFraction: atLeastNinetyFivePercent / count,
      belowHalfFraction: belowHalf / count,
      belowThreeQuartersFraction: belowThreeQuarters / count,
      count,
      height,
      maximum: maxVisibility,
      mean: sum / count,
      minimum: minVisibility,
      p01: percentile(0.01),
      p05: percentile(0.05),
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      source: 'raw ToonLab-compatible R8 visibility target',
      width,
    });
  }

  get blueNoiseFrameState() {
    return Object.freeze({
      index: this._blueNoiseTextureIndex,
      offset: Object.freeze([
        this.blueNoiseOffset.value.x,
        this.blueNoiseOffset.value.y,
      ]),
    });
  }

  setSize(width, height) {
    const resolvedWidth = Math.max(1, Math.trunc(finite(width, 1)));
    const resolvedHeight = Math.max(1, Math.trunc(finite(height, 1)));
    this.resolution.value.set(resolvedWidth, resolvedHeight);
    this.inverseResolution.value.set(1 / resolvedWidth, 1 / resolvedHeight);
    this.blueNoiseScale.value.set(
      resolvedWidth / BLUE_NOISE_TEXTURE_SIZE,
      resolvedHeight / BLUE_NOISE_TEXTURE_SIZE,
    );
    this._aoTarget.setSize(resolvedWidth, resolvedHeight);
    this._blurTarget.setSize(resolvedWidth, resolvedHeight);
    this._finalTarget.setSize(resolvedWidth, resolvedHeight);
  }

  updateBefore(frame) {
    const { renderer } = frame;
    if (this._updating || _activeRenderers.has(renderer) || _activeUpdateDepth > 0) return;
    this._updating = true;
    _activeRenderers.add(renderer);
    _activeUpdateDepth += 1;
    let stateReset = false;
    try {
      assertToonLabSurfaceBlueNoiseTexturesReady(this.blueNoiseTextures);
      this._rendererState = RendererUtils.resetRendererState(renderer, this._rendererState);
      stateReset = true;
      const size = renderer.getDrawingBufferSize(_drawingBufferSize);
      this.setSize(size.width, size.height);
      this._blueNoiseTextureIndex = (
        this._blueNoiseTextureIndex + 1
      ) % this.blueNoiseTextures.length;
      this._blueNoiseTextureNode.value = this.blueNoiseTextures[
        this._blueNoiseTextureIndex
      ];
      this.blueNoiseOffset.value.set(this.random(), this.random());

      renderer.setRenderTarget(this._aoTarget);
      _quadMesh.material = this._aoMaterial;
      _quadMesh.name = 'ToonLab SSAO [ BlueNoise Alchemy ]';
      _quadMesh.render(renderer);

      renderer.setRenderTarget(this._blurTarget);
      _quadMesh.material = this._horizontalMaterial;
      _quadMesh.name = 'ToonLab SSAO [ Bilateral Horizontal ]';
      _quadMesh.render(renderer);

      renderer.setRenderTarget(this._aoTarget);
      _quadMesh.material = this._verticalMaterial;
      _quadMesh.name = 'ToonLab SSAO [ Bilateral Vertical ]';
      _quadMesh.render(renderer);

      renderer.setRenderTarget(this._finalTarget);
      _quadMesh.material = this._finalMaterial;
      _quadMesh.name = 'ToonLab SSAO [ Final Blur / Visibility ]';
      _quadMesh.render(renderer);
    } finally {
      if (stateReset) RendererUtils.restoreRendererState(renderer, this._rendererState);
      this._updating = false;
      _activeRenderers.delete(renderer);
      _activeUpdateDepth -= 1;
    }
  }

  setup(builder) {
    const sharedContext = builder.getSharedContext();
    const reversedDepth = builder.renderer.reversedDepthBuffer === true;
    const centerUv = uv();
    const maxPixel = max(this.resolution.sub(1), vec2(0));
    const pixelAt = (sampleUv) => ivec2(clamp(
      floor(clamp(sampleUv, 0, 1).mul(this.resolution)),
      vec2(0),
      maxPixel,
    ));
    const sampleDepth = (sampleUv) => this.depthNode.load(pixelAt(sampleUv)).r;
    const sampleNormal = (sampleUv) => this.normalNode.load(pixelAt(sampleUv)).rgb;
    const eyeDepth = (rawDepth) => max(
      perspectiveDepthToViewZ(
        rawDepth,
        float(this.camera.near),
        float(this.camera.far),
      ).negate(),
      0,
    );
    const isGeometryDepth = (rawDepth) => reversedDepth
      ? rawDepth.greaterThan(SKY_DEPTH_EPSILON)
      : rawDepth.lessThan(1 - SKY_DEPTH_EPSILON);

    const alchemy = Fn(() => {
      const rawDepth = sampleDepth(centerUv).toVar('toonLabSsaoRawDepth');
      const linearDepth = eyeDepth(rawDepth).toVar('toonLabSsaoLinearDepth');
      const validCenter = isGeometryDepth(rawDepth)
        .and(linearDepth.lessThanEqual(this.settings.falloff));
      const packed = vec4(0).toVar('toonLabSsaoPacked');
      If(validCenter, () => {
        const normalView = sampleNormal(centerUv).toVar('toonLabSsaoNormalView');
        const normalWorld = this._cameraWorldMatrix
          .mul(vec4(normalView, 0)).xyz
          .toVar('toonLabSsaoNormalWorld');
        const viewPosition = getViewPosition(
          centerUv,
          rawDepth,
          this._cameraProjectionMatrixInverse,
        ).toVar('toonLabSsaoViewPosition');
        const contribution = float(0).toVar('toonLabSsaoContribution');
        Loop({
          start: int(0),
          end: int(this.settings.sampleCount),
          type: 'int',
          condition: '<',
        }, ({ i }) => {
          const sampleIndex = float(i);
          const lerpValue = sampleIndex.div(this.settings.sampleCount);
          const noiseUv = centerUv.add(this.blueNoiseOffset)
            .mul(this.blueNoiseScale)
            .add(lerpValue);
          const noise = this._blueNoiseTextureNode.sample(noiseUv).a;
          const uValue = fract(this._randomUv.element(i).add(noise))
            .mul(2).sub(1);
          const theta = this._randomUv.element(i.add(20)).add(noise)
            .mul(TWO_PI_TIMES_100);
          const radial = sqrt(max(float(1).sub(uValue.mul(uValue)), 0));
          const sampleWorld = vec3(
            radial.mul(theta.cos()),
            radial.mul(theta.sin()),
            uValue,
          ).toVar('toonLabSsaoSampleWorld');
          sampleWorld.mulAssign(
            dot(normalWorld, sampleWorld).greaterThanEqual(0)
              .select(float(1), float(-1)),
          );
          sampleWorld.mulAssign(
            mix(float(0.1), float(1), lerpValue.mul(lerpValue))
              .mul(this.settings.radiusInShader),
          );
          const sampleViewOffset = this._cameraViewMatrix
            .mul(vec4(sampleWorld, 0)).xyz;
          const samplePointView = viewPosition.add(sampleViewOffset)
            .toVar('toonLabSsaoSamplePointView');
          const sampleScreenUv = clamp(getScreenPosition(
            samplePointView,
            this._cameraProjectionMatrix,
          ), 0, 1).toVar('toonLabSsaoSampleUv');
          const sampleRawDepth = sampleDepth(sampleScreenUv)
            .toVar('toonLabSsaoSampleRawDepth');
          const sampleLinearDepth = eyeDepth(sampleRawDepth)
            .toVar('toonLabSsaoSampleLinearDepth');
          const samplePointLinearDepth = samplePointView.z.negate();
          const insideRadius = abs(
            samplePointLinearDepth.sub(sampleLinearDepth),
          ).lessThan(this.settings.radiusInShader);
          const sampleNotSky = isGeometryDepth(sampleRawDepth);
          const inside = insideRadius.and(sampleNotSky).select(float(1), float(0));
          const sceneViewDelta = getViewPosition(
            sampleScreenUv,
            sampleRawDepth,
            this._cameraProjectionMatrixInverse,
          ).sub(viewPosition);
          const numerator = max(
            dot(sceneViewDelta, normalView)
              .sub(float(K_BETA).mul(linearDepth)),
            0,
          );
          contribution.addAssign(
            numerator.div(dot(sceneViewDelta, sceneViewDelta).add(K_EPSILON))
              .mul(inside),
          );
        });
        const falloff = float(1).sub(
          linearDepth.div(this.settings.falloff),
        ).mul(float(1).sub(linearDepth.div(this.settings.falloff)));
        const obscurance = pow(clamp(
          contribution
            .mul(this.settings.radiusInShader)
            .mul(this.settings.intensity)
            .mul(falloff)
            .div(this.settings.sampleCount),
          0,
          1,
        ), this.settings.contrast);
        packed.assign(vec4(obscurance, normalView.mul(0.5).add(0.5)));
      });
      return packed;
    });
    this._aoMaterial = this._aoMaterial ?? new NodeMaterial();
    this._aoMaterial.name = 'ToonLab.TOONLAB.SSAO.Alchemy';
    this._aoMaterial.toneMapped = false;
    this._aoMaterial.fragmentNode = alchemy().context(sharedContext);
    this._aoMaterial.needsUpdate = true;

    const unpackNormal = (packed) => packed.gba.mul(2).sub(1);
    const compareNormal = (center, sample) => smoothstep(
      K_GEOMETRY_COEFFICIENT,
      1,
      dot(center, sample),
    );
    const makeBilateral = (sourceTexture, direction) => Fn(() => {
      const samplePacked = (offset) => sourceTexture.sample(
        centerUv.add(this.inverseResolution.mul(direction).mul(offset)),
      );
      const samples = TOONLAB_SURFACE_SSAO_BILATERAL_KERNEL.map(
        ({ offset }) => samplePacked(offset),
      );
      const centerNormal = unpackNormal(samples[0]);
      const weights = TOONLAB_SURFACE_SSAO_BILATERAL_KERNEL.map(
        ({ weight }, index) => index === 0
          ? float(weight)
          : compareNormal(centerNormal, unpackNormal(samples[index])).mul(weight),
      );
      let weighted = samples[0].r.mul(weights[0]);
      let weightSum = weights[0];
      for (let index = 1; index < samples.length; index += 1) {
        weighted = weighted.add(samples[index].r.mul(weights[index]));
        weightSum = weightSum.add(weights[index]);
      }
      return vec4(weighted.div(weightSum), centerNormal.mul(0.5).add(0.5));
    });

    const horizontalTexture = texture(this._aoTarget.texture);
    this._horizontalMaterial = this._horizontalMaterial ?? new NodeMaterial();
    this._horizontalMaterial.name = 'ToonLab.TOONLAB.SSAO.BilateralHorizontal';
    this._horizontalMaterial.toneMapped = false;
    this._horizontalMaterial.fragmentNode = makeBilateral(
      horizontalTexture,
      vec2(1, 0),
    )().context(sharedContext);
    this._horizontalMaterial.needsUpdate = true;

    const verticalTexture = texture(this._blurTarget.texture);
    this._verticalMaterial = this._verticalMaterial ?? new NodeMaterial();
    this._verticalMaterial.name = 'ToonLab.TOONLAB.SSAO.BilateralVertical';
    this._verticalMaterial.toneMapped = false;
    this._verticalMaterial.fragmentNode = makeBilateral(
      verticalTexture,
      vec2(0, 1),
    )().context(sharedContext);
    this._verticalMaterial.needsUpdate = true;

    const finalTexture = texture(this._aoTarget.texture);
    const finalBlur = Fn(() => {
      const p0 = finalTexture.sample(centerUv);
      const p1 = finalTexture.sample(centerUv.add(this.inverseResolution.mul(vec2(-1, -1))));
      const p2 = finalTexture.sample(centerUv.add(this.inverseResolution.mul(vec2(1, -1))));
      const p3 = finalTexture.sample(centerUv.add(this.inverseResolution.mul(vec2(-1, 1))));
      const p4 = finalTexture.sample(centerUv.add(this.inverseResolution.mul(vec2(1, 1))));
      const centerNormal = unpackNormal(p0);
      const w1 = compareNormal(centerNormal, unpackNormal(p1));
      const w2 = compareNormal(centerNormal, unpackNormal(p2));
      const w3 = compareNormal(centerNormal, unpackNormal(p3));
      const w4 = compareNormal(centerNormal, unpackNormal(p4));
      const obscurance = p0.r
        .add(p1.r.mul(w1))
        .add(p2.r.mul(w2))
        .add(p3.r.mul(w3))
        .add(p4.r.mul(w4))
        .div(float(1).add(w1).add(w2).add(w3).add(w4));
      const visibility = float(1).sub(obscurance);
      return vec4(visibility, visibility, visibility, 1);
    });
    this._finalMaterial = this._finalMaterial ?? new NodeMaterial();
    this._finalMaterial.name = 'ToonLab.TOONLAB.SSAO.FinalBlur';
    this._finalMaterial.toneMapped = false;
    this._finalMaterial.fragmentNode = finalBlur().context(sharedContext);
    this._finalMaterial.needsUpdate = true;

    return this._textureNode;
  }

  dispose() {
    this._aoTarget.dispose();
    this._blurTarget.dispose();
    this._finalTarget.dispose();
    this._aoMaterial?.dispose();
    this._horizontalMaterial?.dispose();
    this._verticalMaterial?.dispose();
    this._finalMaterial?.dispose();
    for (const map of this.blueNoiseTextures) map.dispose();
  }
}

export function toonLabSurfaceBlueNoiseAmbientOcclusion(
  depthNode,
  normalNode,
  camera,
  settings,
  options,
) {
  return new ToonLabSurfaceBlueNoiseAmbientOcclusionNode(
    depthNode,
    normalNode,
    camera,
    settings,
    options,
  );
}
