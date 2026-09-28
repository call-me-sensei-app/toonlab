// Exact ToonLab reference renderer Gaussian bloom path used by the supplied
// EnvironmentReferenceScene project. This is a renderer pass, not a material look:
// keep it independent from the source shader-family adapters.

import {
  ClampToEdgeWrapping,
  LinearFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RGBFormat,
  RenderTarget,
  RendererUtils,
  TempNode,
  UnsignedInt101111Type,
  Vector2,
} from 'three/webgpu';
import {
  Fn,
  clamp,
  float,
  max,
  min,
  mix,
  nodeObject,
  passTexture,
  texture,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl';

const BLOOM_MAX_ITERATIONS = 6;
const BLOOM_DOWNSCALE_SHIFT = 1;
const BLOOM_MIN_KNEE_DENOMINATOR = 1e-4;
const BLOOM_MIN_BRIGHTNESS = 1e-4;

const _quadMesh = new QuadMesh();
const _drawingBufferSize = new Vector2();
const _activeBloomRenderers = new WeakSet();
let _activeBloomUpdateDepth = 0;

function freezeArray(values) {
  return Object.freeze([...values]);
}

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export const TOONLAB_BLOOM_SOURCE = Object.freeze({
  projectVersion: 1,
  pipelineVersion: 1,
  packageFingerprint: 'toonlab-native',
  corePackageFingerprint: 'toonlab-native',
  projectVersionPath: 'package.json',
  projectVersionSha256: 'dc39b76877cad51588645e7b18e8c1c90e462ddcec948e3d9e60214dee3c09fc',
  projectSettingsPath: 'src/environment/toonLabBloom.js',
  projectSettingsSha256: 'b6ff894ad4c2e05ba0dcc244c408ef85ce3707ee2b6b3f915ed37a44cf7f61dc',
  volumeProfilePath: 'ToonLab/Materials/GlobalVolume.toonlab-data',
  volumeProfileSha256: '9dd78bd2cbf07d1ad5d5fbd8d7201879cd30c72e7c227742b3ffb97e2cf26724',
  pipelineAssetPath: 'ToonLab/Settings/RenderPipeline.toonlab-data',
  pipelineAssetSha256: '4d93ab2502566226745655f20650650e878d5a6e9e004b2079c89f0314c5331a',
  bloomOverridePath: 'src/environment/toonLabBloom.js',
  bloomOverrideSha256: '0c4e5f2e6d1f55c37e5d88a6b53538dc5ff21a56a1a3f783a4743d14f8f577a6',
  bloomPassPath: 'src/environment/toonLabBloom.js',
  bloomPassSha256: 'a6a1c7fe0b1ff5d5d5252e8716d151f4f257dab17bb5ddb399c160a5d6dd0951',
  bloomShaderPath: 'src/shaders-tsl/post-composite.js',
  bloomShaderSha256: '7c0fe7d6e3e79ecce5ddd0de29574298723789c650f4db60940b6fe2e4ca1942',
  uberPassPath: 'Runtime/Passes/PostProcess/UberPostProcessPass.cs',
  uberPassSha256: '546ba5b93d21c215a31bc05df25741d12bf99534443c539d8cbe89023f8e52fd',
  uberShaderPath: 'Shaders/PostProcessing/UberPost.shader',
  uberShaderSha256: '45844e94306f54d05090a75a7c12faa262dc552fbe02dff89cf4e747c33f3685',
  pipelineCorePath: 'Runtime/ToonLabRenderPipelineCore.cs',
  pipelineCoreSha256: 'ec477ef07f852a553ce324fe551721fd0ea462d4cad32a04c89e08f7b2b40da5',
  packagePath: 'package.json',
  packageSha256: 'cba551fe10d07d487ec66b4df208976fc6325a390cd9b4e87211bfeb5e983a6e',
  coreClampPath: 'ShaderLibrary/DynamicScalingClamping.hlsl',
  coreClampSha256: '5ddd7c916537b74608af51ad688985ac6e1d12ac7d984fa6b901a31a73aeb2ee',
  corePackagePath: 'package.json',
  corePackageSha256: 'c3034f7608fc39f0fca98c98ac325f11c89c3c4332b66915c328a18d69d246fd',
});

export const TOONLAB_BLOOM_HORIZONTAL = Object.freeze({
  // FragBlurH multiplies the source texel size by two before these offsets.
  sourceTexelStride: 2,
  offsets: freezeArray([-4, -3, -2, -1, 0, 1, 2, 3, 4]),
  weights: freezeArray([
    0.01621622,
    0.05405405,
    0.12162162,
    0.19459459,
    0.22702703,
    0.19459459,
    0.12162162,
    0.05405405,
    0.01621622,
  ]),
});

export const TOONLAB_BLOOM_VERTICAL = Object.freeze({
  // Five bilinear fetches reproduce the same nine-tap Gaussian vertically.
  offsets: freezeArray([
    -3.23076923,
    -1.38461538,
    0,
    1.38461538,
    3.23076923,
  ]),
  weights: freezeArray([
    0.07027027,
    0.31621622,
    0.22702703,
    0.31621622,
    0.07027027,
  ]),
});

export const TOONLAB_BLOOM_CONTRACT = Object.freeze({
  filter: 'Gaussian',
  downscale: 'Half',
  downscaleShift: BLOOM_DOWNSCALE_SHIFT,
  maxIterations: BLOOM_MAX_ITERATIONS,
  thresholdGamma: 1.1,
  // Native ToonLab probe: Mathf.GammaToLinearSpace(1.1f).
  thresholdLinear: 1.2332863807678223,
  kneeRatio: 0.5,
  thresholdKnee: 0.6166431903839111,
  clamp: 1,
  scatter: 0.741,
  scatterResolved: 0.7168999910354614,
  intensity: 6,
  tintSrgb: freezeArray([0.73014116, 0.760351, 0.8509804]),
  tintLinear: freezeArray([
    0.49211737513542175,
    0.5387921333312988,
    0.6938719153404236,
  ]),
  tintLuminanceLinear: 0.5400586128234863,
  // UberPostProcessPass.CalcBloomParams divides linear tint by Rec.709 luma.
  tintNormalizedLinear: freezeArray([
    0.9112295508384705,
    0.997654914855957,
    1.2848085165023804,
  ]),
  highQualityFiltering: false,
  alphaOutput: false,
  lensDirt: false,
  targetFormat: 'B10G11R11_UFloatPack32',
  threeTargetFormat: 'RGBFormat / UnsignedInt101111Type',
  minFilter: 'Linear',
  magFilter: 'Linear',
  wrap: 'Clamp',
  composition: 'scene + bloomTexture * intensity * normalizedLinearTint',
});

/** ToonLab BloomPostProcessPass.CalcBloomResolution. */
export function computeToonLabBloomBaseResolution(
  width,
  height,
  { downscaleShift = BLOOM_DOWNSCALE_SHIFT } = {},
) {
  const shift = Math.max(0, Math.trunc(finite(downscaleShift, 1)));
  const divisor = 2 ** shift;
  return {
    width: Math.max(1, Math.floor(Math.max(1, finite(width, 1)) / divisor)),
    height: Math.max(1, Math.floor(Math.max(1, finite(height, 1)) / divisor)),
  };
}

/** ToonLab BloomPostProcessPass.CalcBloomMipCount. */
export function computeToonLabBloomMipCount(
  width,
  height,
  {
    downscaleShift = BLOOM_DOWNSCALE_SHIFT,
    maxIterations = BLOOM_MAX_ITERATIONS,
  } = {},
) {
  const base = computeToonLabBloomBaseResolution(width, height, {
    downscaleShift,
  });
  const iterations = Math.floor(Math.log2(Math.max(base.width, base.height)) - 1);
  return clampNumber(
    iterations,
    1,
    Math.max(1, Math.trunc(finite(maxIterations, BLOOM_MAX_ITERATIONS))),
  );
}

export function computeToonLabBloomMipResolutions(
  width,
  height,
  options = {},
) {
  const base = computeToonLabBloomBaseResolution(width, height, options);
  const mipCount = computeToonLabBloomMipCount(width, height, options);
  let mipWidth = base.width;
  let mipHeight = base.height;
  return Array.from({ length: mipCount }, () => {
    const result = { width: mipWidth, height: mipHeight };
    mipWidth = Math.max(1, Math.floor(mipWidth / 2));
    mipHeight = Math.max(1, Math.floor(mipHeight / 2));
    return result;
  });
}

/** CPU oracle for Bloom.shader FragPrefilter's active LQ branch. */
export function evaluateToonLabBloomPrefilter(
  color,
  contract = TOONLAB_BLOOM_CONTRACT,
) {
  const source = [0, 1, 2].map((index) => Math.min(
    finite(color?.[index], 0),
    contract.clamp,
  ));
  const brightness = Math.max(source[0], source[1], source[2]);
  const knee = contract.thresholdKnee;
  let softness = clampNumber(
    brightness - contract.thresholdLinear + knee,
    0,
    2 * knee,
  );
  softness = (softness * softness) / (4 * knee + BLOOM_MIN_KNEE_DENOMINATOR);
  const multiplier = Math.max(
    brightness - contract.thresholdLinear,
    softness,
  ) / Math.max(brightness, BLOOM_MIN_BRIGHTNESS);
  return {
    brightness,
    multiplier,
    color: source.map((channel) => Math.max(channel * multiplier, 0)),
  };
}

/** Constant-field oracle: every Gaussian and lerp stage has unit DC gain. */
export function evaluateToonLabBloomComposite(
  color,
  contract = TOONLAB_BLOOM_CONTRACT,
) {
  const prefiltered = evaluateToonLabBloomPrefilter(color, contract);
  return prefiltered.color.map(
    (channel, index) => channel
      * contract.intensity
      * contract.tintNormalizedLinear[index],
  );
}

function createBloomRenderTarget(name) {
  const target = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RGBFormat,
    stencilBuffer: false,
    type: UnsignedInt101111Type,
  });
  target.texture.name = name;
  target.texture.generateMipmaps = false;
  target.texture.magFilter = LinearFilter;
  target.texture.minFilter = LinearFilter;
  target.texture.wrapS = ClampToEdgeWrapping;
  target.texture.wrapT = ClampToEdgeWrapping;
  return target;
}

function sampleLinearClamp(textureNode, sampleUv, inverseSize) {
  const halfTexel = inverseSize.mul(0.5);
  const clampedUv = clamp(sampleUv, halfTexel, vec2(1).sub(halfTexel));
  return textureNode.sample(clampedUv).rgb;
}

/**
 * ToonLab renderer's active Gaussian bloom render-graph pass.
 *
 * Topology: half-resolution LQ prefilter; five progressively halved levels;
 * 9-fetch horizontal downsample; 5-fetch
 * bilinear vertical Gaussian; then broad-to-narrow bilinear lerp with .7169.
 * The returned texture is still untinted/unscaled, exactly like resourceData
 * .bloom before UberPost applies intensity and normalized tint.
 */
export class ToonLabGaussianBloomNode extends TempNode {
  static get type() {
    return 'ToonLabGaussianBloomNode';
  }

  constructor(inputNode, contract = TOONLAB_BLOOM_CONTRACT) {
    super('vec4');
    this.inputNode = nodeObject(inputNode);
    this.settings = contract;
    this._downTargets = Array.from(
      { length: BLOOM_MAX_ITERATIONS },
      (_, index) => createBloomRenderTarget(`ToonLab.TOONLAB.BloomMipDown${index}`),
    );
    this._upTargets = Array.from(
      { length: BLOOM_MAX_ITERATIONS },
      (_, index) => createBloomRenderTarget(`ToonLab.TOONLAB.BloomMipUp${index}`),
    );
    this._textureOutput = passTexture(this, this._upTargets[0].texture);
    this._prefilterMaterial = null;
    this._horizontalMaterial = null;
    this._verticalMaterial = null;
    this._upsampleMaterial = null;
    this._resolutions = [];
    this._mipCount = 0;
    this._lastWidth = 0;
    this._lastHeight = 0;
    this._rendererState = undefined;
    this._updating = false;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.contract = Object.freeze({
      engine: 'ToonLab reference renderer',
      method: 'Gaussian Bloom / LQ bilinear upsample',
      placement: 'after TOONLAB TAA, before vignette and LDR color grade',
      sourceExact: Object.freeze([
        'half-resolution prefilter and dynamic mip count',
        'threshold, soft knee, clamp, and positive clamp',
        '9-fetch horizontal downsample and 5-fetch vertical Gaussian',
        'broad-to-narrow .7169 bilinear reconstruction',
        'B10G11R11_UFloatPack32 target quantization',
        'UberPost intensity and luminance-normalized tint',
      ]),
      remainingBridges: Object.freeze([
        'ToonLab HLSL half arithmetic can round intermediate ALU values before the shared B10G11R11 render-target boundary; WebGPU TSL uses f32 ALU',
      ]),
    });
  }

  getTextureNode() {
    return this._textureOutput;
  }

  get mipCount() {
    return this._mipCount;
  }

  get mipResolutions() {
    return this._resolutions.map((resolution) => ({ ...resolution }));
  }

  setSize(width, height) {
    const resolvedWidth = Math.max(1, Math.trunc(finite(width, 1)));
    const resolvedHeight = Math.max(1, Math.trunc(finite(height, 1)));
    if (resolvedWidth === this._lastWidth && resolvedHeight === this._lastHeight) return;
    this._lastWidth = resolvedWidth;
    this._lastHeight = resolvedHeight;
    this._resolutions = computeToonLabBloomMipResolutions(
      resolvedWidth,
      resolvedHeight,
      this.settings,
    );
    this._mipCount = this._resolutions.length;
    for (let index = 0; index < BLOOM_MAX_ITERATIONS; index += 1) {
      const resolution = this._resolutions[index] ?? { width: 1, height: 1 };
      this._downTargets[index].setSize(resolution.width, resolution.height);
      this._upTargets[index].setSize(resolution.width, resolution.height);
    }
    this._textureOutput.value = this._mipCount === 1
      ? this._downTargets[0].texture
      : this._upTargets[0].texture;
  }

  updateBefore(frame) {
    const { renderer } = frame;
    if (this._updating
      || _activeBloomRenderers.has(renderer)
      || _activeBloomUpdateDepth > 0) return;
    this._updating = true;
    _activeBloomRenderers.add(renderer);
    _activeBloomUpdateDepth += 1;
    let rendererStateReset = false;
    try {
      this._rendererState = RendererUtils.resetRendererState(
        renderer,
        this._rendererState,
      );
      rendererStateReset = true;
      const drawingBufferSize = renderer.getDrawingBufferSize(_drawingBufferSize);
      this.setSize(drawingBufferSize.width, drawingBufferSize.height);

      renderer.setRenderTarget(this._downTargets[0]);
      _quadMesh.material = this._prefilterMaterial;
      _quadMesh.name = 'ToonLab Bloom [ Prefilter / Half ]';
      _quadMesh.render(renderer);

      for (let index = 1; index < this._mipCount; index += 1) {
        const previous = this._resolutions[index - 1];
        this._horizontalMaterial.colorTexture.value = this._downTargets[index - 1].texture;
        this._horizontalMaterial.invSize.value.set(
          1 / previous.width,
          1 / previous.height,
        );
        renderer.setRenderTarget(this._upTargets[index]);
        _quadMesh.material = this._horizontalMaterial;
        _quadMesh.name = `ToonLab Bloom [ Gaussian H ${index} ]`;
        _quadMesh.render(renderer);

        const current = this._resolutions[index];
        this._verticalMaterial.colorTexture.value = this._upTargets[index].texture;
        this._verticalMaterial.invSize.value.set(
          1 / current.width,
          1 / current.height,
        );
        renderer.setRenderTarget(this._downTargets[index]);
        _quadMesh.material = this._verticalMaterial;
        _quadMesh.name = `ToonLab Bloom [ Gaussian V ${index} ]`;
        _quadMesh.render(renderer);
      }

      for (let index = this._mipCount - 2; index >= 0; index -= 1) {
        const lowTarget = index === this._mipCount - 2
          ? this._downTargets[index + 1]
          : this._upTargets[index + 1];
        this._upsampleMaterial.highTexture.value = this._downTargets[index].texture;
        this._upsampleMaterial.lowTexture.value = lowTarget.texture;
        renderer.setRenderTarget(this._upTargets[index]);
        _quadMesh.material = this._upsampleMaterial;
        _quadMesh.name = `ToonLab Bloom [ Upsample ${index} ]`;
        _quadMesh.render(renderer);
      }
    } finally {
      if (rendererStateReset) {
        RendererUtils.restoreRendererState(renderer, this._rendererState);
      }
      this._updating = false;
      _activeBloomRenderers.delete(renderer);
      _activeBloomUpdateDepth -= 1;
    }
  }

  setup(builder) {
    const sharedContext = builder.getSharedContext();

    const prefilter = Fn(() => {
      const source = min(this.inputNode.rgb, float(this.settings.clamp));
      const brightness = max(source.r, source.g, source.b);
      const knee = this.settings.thresholdKnee;
      const softnessLinear = clamp(
        brightness.sub(this.settings.thresholdLinear).add(knee),
        0,
        2 * knee,
      );
      const softness = softnessLinear.mul(softnessLinear)
        .div(4 * knee + BLOOM_MIN_KNEE_DENOMINATOR);
      const multiplier = max(
        brightness.sub(this.settings.thresholdLinear),
        softness,
      ).div(max(brightness, BLOOM_MIN_BRIGHTNESS));
      return vec4(max(source.mul(multiplier), 0), 1);
    });
    this._prefilterMaterial = this._prefilterMaterial ?? new NodeMaterial();
    this._prefilterMaterial.name = 'ToonLab.TOONLAB.Bloom.PrefilterLQ';
    this._prefilterMaterial.fragmentNode = prefilter().context(sharedContext);
    this._prefilterMaterial.needsUpdate = true;

    // Prime every sampler with a valid packed-HDR target. WebGPU may inspect a
    // binding before the first render-pass assignment during pipeline warmup.
    const horizontalTexture = texture(this._downTargets[0].texture);
    const horizontalInvSizeNode = uniform(new Vector2());
    const horizontal = Fn(() => {
      const centerUv = uv();
      const texel = horizontalInvSizeNode.mul(
        TOONLAB_BLOOM_HORIZONTAL.sourceTexelStride,
      );
      let color = sampleLinearClamp(
        horizontalTexture,
        centerUv.add(texel.mul(vec2(
          TOONLAB_BLOOM_HORIZONTAL.offsets[0],
          0,
        ))),
        texel,
      ).mul(TOONLAB_BLOOM_HORIZONTAL.weights[0]);
      for (let index = 1; index < TOONLAB_BLOOM_HORIZONTAL.offsets.length; index += 1) {
        color = color.add(sampleLinearClamp(
          horizontalTexture,
          centerUv.add(texel.mul(vec2(
            TOONLAB_BLOOM_HORIZONTAL.offsets[index],
            0,
          ))),
          texel,
        ).mul(TOONLAB_BLOOM_HORIZONTAL.weights[index]));
      }
      return vec4(color, 1);
    });
    this._horizontalMaterial = this._horizontalMaterial ?? new NodeMaterial();
    this._horizontalMaterial.name = 'ToonLab.TOONLAB.Bloom.GaussianHorizontal';
    this._horizontalMaterial.fragmentNode = horizontal().context(sharedContext);
    this._horizontalMaterial.colorTexture = horizontalTexture;
    this._horizontalMaterial.invSize = horizontalInvSizeNode;
    this._horizontalMaterial.needsUpdate = true;

    const verticalTexture = texture(this._upTargets[0].texture);
    const verticalInvSizeNode = uniform(new Vector2());
    const vertical = Fn(() => {
      const centerUv = uv();
      let color = sampleLinearClamp(
        verticalTexture,
        centerUv.add(verticalInvSizeNode.mul(vec2(
          0,
          TOONLAB_BLOOM_VERTICAL.offsets[0],
        ))),
        verticalInvSizeNode,
      ).mul(TOONLAB_BLOOM_VERTICAL.weights[0]);
      for (let index = 1; index < TOONLAB_BLOOM_VERTICAL.offsets.length; index += 1) {
        color = color.add(sampleLinearClamp(
          verticalTexture,
          centerUv.add(verticalInvSizeNode.mul(vec2(
            0,
            TOONLAB_BLOOM_VERTICAL.offsets[index],
          ))),
          verticalInvSizeNode,
        ).mul(TOONLAB_BLOOM_VERTICAL.weights[index]));
      }
      return vec4(color, 1);
    });
    this._verticalMaterial = this._verticalMaterial ?? new NodeMaterial();
    this._verticalMaterial.name = 'ToonLab.TOONLAB.Bloom.GaussianVertical';
    this._verticalMaterial.fragmentNode = vertical().context(sharedContext);
    this._verticalMaterial.colorTexture = verticalTexture;
    this._verticalMaterial.invSize = verticalInvSizeNode;
    this._verticalMaterial.needsUpdate = true;

    const highTexture = texture(this._downTargets[0].texture);
    const lowTexture = texture(this._downTargets[1].texture);
    const upsample = Fn(() => vec4(
      mix(
        highTexture.sample(uv()).rgb,
        lowTexture.sample(uv()).rgb,
        this.settings.scatterResolved,
      ),
      1,
    ));
    this._upsampleMaterial = this._upsampleMaterial ?? new NodeMaterial();
    this._upsampleMaterial.name = 'ToonLab.TOONLAB.Bloom.UpsampleLQ';
    this._upsampleMaterial.fragmentNode = upsample().context(sharedContext);
    this._upsampleMaterial.highTexture = highTexture;
    this._upsampleMaterial.lowTexture = lowTexture;
    this._upsampleMaterial.needsUpdate = true;

    return this._textureOutput;
  }

  dispose() {
    for (const target of [...this._downTargets, ...this._upTargets]) {
      target.dispose();
    }
    this._prefilterMaterial?.dispose();
    this._horizontalMaterial?.dispose();
    this._verticalMaterial?.dispose();
    this._upsampleMaterial?.dispose();
  }
}

export function toonLabBloom(inputNode) {
  return new ToonLabGaussianBloomNode(inputNode);
}

/** UberPost's bloom scale/tint boundary; the stage performs the final add. */
export function applyToonLabBloomTint(inputNode) {
  const contract = TOONLAB_BLOOM_CONTRACT;
  return inputNode.mul(vec4(
    contract.tintNormalizedLinear[0] * contract.intensity,
    contract.tintNormalizedLinear[1] * contract.intensity,
    contract.tintNormalizedLinear[2] * contract.intensity,
    1,
  ));
}
