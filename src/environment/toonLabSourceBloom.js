import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RGBFormat,
  RenderTarget,
  RendererUtils,
  TempNode,
  UnsignedInt101111Type,
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  Loop,
  abs,
  clamp,
  dot,
  float,
  int,
  max,
  nodeObject,
  passTexture,
  saturate,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

const BLOOM_STAGE_COUNT = 6;
const MAX_FILTER_SAMPLES = 32;
const MIN_KERNEL_RADIUS = 1e-4;
const LEGACY_COMPATIBILITY_CONSTANT = -16.7;
const PERCENT_TO_SCALE = 0.01;
const DIAMETER_TO_RADIUS = 0.5;
const TOONLAB_LEGACY_LUMINANCE = Object.freeze([0.3, 0.59, 0.11]);

const _quadMesh = new QuadMesh();
const _drawingBufferSize = new Vector2();
const _horizontalDirection = new Vector2(1, 0);
const _verticalDirection = new Vector2(0, 1);
const _activeBloomRenderers = new WeakSet();
let _activeBloomUpdateDepth = 0;

function reportBloomDebug(stage) {
  if (globalThis.__TOONLAB_BLOOM_DEBUG__ !== true) return;
  console.info(`[ToonLab Source Bloom] ${stage}`);
}

export const TOONLAB_SOURCE_STANDARD_BLOOM_STAGES = Object.freeze([
  Object.freeze({ size: 0.3, tint: Object.freeze([0.3465, 0.3465, 0.3465]) }),
  Object.freeze({ size: 1.0, tint: Object.freeze([0.1380, 0.1380, 0.1380]) }),
  Object.freeze({ size: 2.0, tint: Object.freeze([0.1176, 0.1176, 0.1176]) }),
  Object.freeze({ size: 10.0, tint: Object.freeze([0.0660, 0.0660, 0.0660]) }),
  Object.freeze({ size: 30.0, tint: Object.freeze([0.0660, 0.0660, 0.0660]) }),
  Object.freeze({ size: 64.0, tint: Object.freeze([0.0610, 0.0610, 0.0610]) }),
]);

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cloneStage(stage, fallback) {
  const tint = Array.isArray(stage?.tint) ? stage.tint : fallback.tint;
  return {
    size: Math.max(finite(stage?.size, fallback.size), 0),
    tint: fallback.tint.map((channel, index) => Math.max(
      finite(tint[index], channel),
      0,
    )),
  };
}

/**
 * Resolves the active desktop Gaussian bloom settings used by the supplied
 * ToonLabShowcase post-process volume. Values omitted by the asset export are ToonLab
 * ToonLab post-process defaults, not visual calibration knobs.
 */
export function resolveToonLabSourceBloomSettings(settings = {}) {
  const intensity = Math.max(finite(settings.bloom_intensity, 0.675), 0);
  const gaussianIntensity = Math.max(
    finite(settings.bloom_gaussian_intensity, 1),
    0,
  );
  const quality = Math.min(Math.max(
    Math.trunc(finite(settings.bloom_quality, 5)),
    0,
  ), 5);
  const stageCountByQuality = [0, 3, 3, 4, 5, 6];
  const stageCount = stageCountByQuality[quality];
  const stages = TOONLAB_SOURCE_STANDARD_BLOOM_STAGES.map((fallback, index) =>
    cloneStage(settings.bloom_stages?.[index], fallback));
  return {
    crossCenterWeight: finite(settings.bloom_cross, 0),
    filterSizeScale: Math.min(Math.max(
      finite(settings.filter_size_scale, 1),
      0.1,
    ), 10),
    gaussianIntensity,
    intensity,
    legacyLuminanceFactors: [...TOONLAB_LEGACY_LUMINANCE],
    method: settings.bloom_method ?? '<BloomMethod.BM_SOG: 0>',
    quality,
    resolutionScale: 0.5,
    sizeScale: Math.max(finite(settings.bloom_size_scale, 4), 0),
    stageCount,
    stages,
    threshold: finite(settings.bloom_threshold, -1),
    // AddGaussianBloomPasses divides by EBloomQuality::MAX (six), not by
    // the authored intensity or the number of active non-zero tints.
    tintScale: intensity * gaussianIntensity / BLOOM_STAGE_COUNT,
  };
}

/** CPU form of PostProcessBloom.usf's active threshold branch. */
export function evaluateToonLabSourceBloomThreshold(color, settings = {}) {
  const resolved = settings.stageCount === undefined
    ? resolveToonLabSourceBloomSettings(settings)
    : settings;
  const rgb = [0, 1, 2].map((index) => finite(color?.[index], 0));
  if (resolved.threshold <= -1) return { amount: 1, color: rgb };
  const luminance = rgb.reduce(
    (sum, channel, index) =>
      sum + channel * resolved.legacyLuminanceFactors[index],
    0,
  );
  const amount = Math.min(Math.max((luminance - resolved.threshold) * 0.5, 0), 1);
  return { amount, color: rgb.map((channel) => channel * amount), luminance };
}

function normalDistributionUnscaled(x, sigma, crossCenterWeight) {
  const distance = Math.abs(x);
  const linear = Math.max(0, 1 - distance);
  if (crossCenterWeight > 1) return linear ** crossCenterWeight;
  const gaussian = Math.exp(
    LEGACY_COMPATIBILITY_CONSTANT * (distance / sigma) ** 2,
  );
  return gaussian + (linear - gaussian) * crossCenterWeight;
}

/**
 * Exact CPU translation of Compute1DGaussianFilterKernel for the desktop
 * source capture (static-loop maximum of 32 bilinear taps).
 */
export function computeToonLabSourceGaussianKernel(kernelRadius, {
  crossCenterWeight = 0,
  filterSizeScale = 1,
  sampleCountMax = MAX_FILTER_SAMPLES,
} = {}) {
  const maximumRadius = Math.max(1, Math.trunc(sampleCountMax) - 1);
  const clampedRadius = Math.min(Math.max(
    finite(kernelRadius, MIN_KERNEL_RADIUS),
    MIN_KERNEL_RADIUS,
  ), maximumRadius);
  const scaledRadius = Math.min(Math.max(
    finite(kernelRadius, MIN_KERNEL_RADIUS) * Math.min(Math.max(
      finite(filterSizeScale, 1),
      0.1,
    ), 10),
    MIN_KERNEL_RADIUS,
  ), maximumRadius);
  const integerRadius = Math.min(Math.ceil(scaledRadius), maximumRadius);
  const samples = [];
  let weightSum = 0;
  for (let sampleIndex = -integerRadius;
    sampleIndex <= integerRadius;
    sampleIndex += 2) {
    const weight0 = normalDistributionUnscaled(
      sampleIndex,
      clampedRadius,
      crossCenterWeight,
    );
    const weight1 = sampleIndex === integerRadius
      ? 0
      : normalDistributionUnscaled(
        sampleIndex + 1,
        clampedRadius,
        crossCenterWeight,
      );
    const totalWeight = weight0 + weight1;
    samples.push({
      offset: sampleIndex + weight1 / totalWeight,
      weight: totalWeight,
    });
    weightSum += totalWeight;
  }
  for (const sample of samples) sample.weight /= weightSum;
  return {
    clampedRadius,
    integerRadius,
    requestedRadius: finite(kernelRadius, MIN_KERNEL_RADIUS),
    samples,
  };
}

export function computeToonLabSourceBloomStageResolutions(width, height) {
  let stageWidth = Math.max(1, Math.ceil(finite(width, 1) / 2));
  let stageHeight = Math.max(1, Math.ceil(finite(height, 1) / 2));
  return Array.from({ length: BLOOM_STAGE_COUNT }, () => {
    const resolution = { height: stageHeight, width: stageWidth };
    stageWidth = Math.max(1, Math.ceil(stageWidth / 2));
    stageHeight = Math.max(1, Math.ceil(stageHeight / 2));
    return resolution;
  });
}

export function computeToonLabSourceBloomDcGain(settings = {}) {
  const resolved = settings.stageCount === undefined
    ? resolveToonLabSourceBloomSettings(settings)
    : settings;
  return [0, 1, 2].map((channel) => resolved.stages
    .slice(BLOOM_STAGE_COUNT - resolved.stageCount)
    .reduce(
      (sum, stage) => sum + stage.tint[channel] * resolved.tintScale,
      0,
    ));
}

function createBloomRenderTarget(name) {
  const target = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RGBFormat,
    stencilBuffer: false,
    // PostProcessing.cpp explicitly selects PF_FloatR11G11B10 when alpha
    // propagation is disabled, and every bloom pass preserves that format.
    type: UnsignedInt101111Type,
  });
  target.texture.name = name;
  target.texture.generateMipmaps = false;
  return target;
}

function sampleWithZeroBorder(textureNode, sampleUv, inverseSize) {
  const halfTexel = inverseSize.mul(0.5);
  const clampedUv = clamp(sampleUv, halfTexel, vec2(1).sub(halfTexel));
  const outsideTexels = abs(clampedUv.sub(sampleUv)).div(inverseSize);
  const borderWeight = saturate(vec2(1).sub(outsideTexels));
  return textureNode.sample(clampedUv).mul(borderWeight.x.mul(borderWeight.y));
}

/**
 * ToonLab desktop Standard/Gaussian bloom for source-renderer comparisons.
 *
 * The pass preserves ToonLab's half-resolution threshold setup, six-level
 * high-quality downsample chain, resolution-dependent Gaussian radii,
 * bilinear-packed kernel weights, broad-to-narrow additive reconstruction,
 * and the engine's 1/6 tint normalization. It intentionally does not reuse
 * Three's ToonLabBloomPass-derived node because that node has a different
 * high-pass curve, mip count, kernels, weights, and normalization.
 */
export class ToonLabSourceStandardBloomNode extends TempNode {
  static get type() {
    return 'ToonLabSourceStandardBloomNode';
  }

  constructor(inputNode, settings = {}) {
    super('vec4');
    this.inputNode = nodeObject(inputNode);
    this.settings = resolveToonLabSourceBloomSettings(settings);
    this._sourceTargets = Array.from(
      { length: BLOOM_STAGE_COUNT },
      (_, index) => createBloomRenderTarget(`ToonLab.SourceBloom.source${index + 1}`),
    );
    this._horizontalTargets = Array.from(
      { length: BLOOM_STAGE_COUNT },
      (_, index) => createBloomRenderTarget(`ToonLab.SourceBloom.horizontal${index + 1}`),
    );
    this._verticalTargets = Array.from(
      { length: BLOOM_STAGE_COUNT },
      (_, index) => createBloomRenderTarget(`ToonLab.SourceBloom.vertical${index + 1}`),
    );
    this._halfResolutionSceneTarget = createBloomRenderTarget(
      'ToonLab.SourceBloom.halfResolutionScene',
    );
    this._textureOutput = passTexture(this, this._verticalTargets[0].texture);
    this._halfResolutionMaterial = null;
    this._highPassMaterial = null;
    this._downsampleMaterial = null;
    this._filterMaterial = null;
    this._kernels = [];
    this._resolutions = [];
    this._lastWidth = 0;
    this._lastHeight = 0;
    // RendererUtils.saveRendererState() only creates its state object when the
    // argument is undefined. Passing null reaches `state.toneMapping = ...`
    // unchanged and aborts the bloom pass before its first render target.
    this._rendererState = undefined;
    this._updating = false;
    this._lastErrorReported = false;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.contract = Object.freeze({
      engine: 'ToonLab',
      method: 'BM_SOG desktop Gaussian bloom',
      placement: 'after depth of field and before tone mapping',
      remainingBridges: Object.freeze([
        'ToonLab half arithmetic versus WebGPU f32 shader arithmetic',
        'ToonLab pre-exposure is reduced to the ToonLabShowcase fixed-exposure identity',
        'exact edge results can differ where WebGPU emulates ToonLab border sampling',
        'ToonLab fast-blur optimization above the native source resolution is not active in this module',
      ]),
    });
  }

  getTextureNode() {
    return this._textureOutput;
  }

  get stageResolutions() {
    return this._resolutions.map((resolution) => ({ ...resolution }));
  }

  get stageKernels() {
    return this._kernels.map((kernel) => ({
      ...kernel,
      samples: kernel.samples.map((sample) => ({ ...sample })),
    }));
  }

  setSize(width, height) {
    const resolvedWidth = Math.max(1, Math.trunc(finite(width, 1)));
    const resolvedHeight = Math.max(1, Math.trunc(finite(height, 1)));
    if (resolvedWidth === this._lastWidth && resolvedHeight === this._lastHeight) return;
    this._lastWidth = resolvedWidth;
    this._lastHeight = resolvedHeight;
    this._resolutions = computeToonLabSourceBloomStageResolutions(
      resolvedWidth,
      resolvedHeight,
    );
    this._kernels = this._resolutions.map((resolution, index) => {
      const stage = this.settings.stages[index];
      const kernelSizePercent = stage.size * this.settings.sizeScale;
      const radius = resolution.width
        * kernelSizePercent
        * PERCENT_TO_SCALE
        * DIAMETER_TO_RADIUS;
      return computeToonLabSourceGaussianKernel(radius, this.settings);
    });
    const firstResolution = this._resolutions[0];
    this._halfResolutionSceneTarget.setSize(
      firstResolution.width,
      firstResolution.height,
    );
    for (let index = 0; index < BLOOM_STAGE_COUNT; index += 1) {
      const { width: stageWidth, height: stageHeight } = this._resolutions[index];
      this._sourceTargets[index].setSize(stageWidth, stageHeight);
      this._horizontalTargets[index].setSize(stageWidth, stageHeight);
      this._verticalTargets[index].setSize(stageWidth, stageHeight);
    }
  }

  _setKernelUniforms(kernel) {
    const values = this._filterMaterial.offsetWeights.array;
    for (let index = 0; index < MAX_FILTER_SAMPLES; index += 1) {
      const sample = kernel.samples[index];
      values[index].set(sample?.offset ?? 0, sample?.weight ?? 0);
    }
    this._filterMaterial.sampleCount.value = kernel.samples.length;
  }

  updateBefore(frame) {
    // The half-resolution source material samples this node's upstream post
    // graph from a nested fullscreen render. WebGPU assigns that nested render
    // a fresh node frame, so it can request this update hook again even though
    // the bloom output is not part of the source material. Guard that benign
    // re-entry or the first bloom pass recursively renders forever.
    const { renderer } = frame;
    if (this._updating
      || _activeBloomRenderers.has(renderer)
      || _activeBloomUpdateDepth > 0) {
      reportBloomDebug('nested update skipped');
      return;
    }
    this._updating = true;
    _activeBloomRenderers.add(renderer);
    _activeBloomUpdateDepth += 1;
    reportBloomDebug(`begin materials=${[
      this._halfResolutionMaterial,
      this._highPassMaterial,
      this._downsampleMaterial,
      this._filterMaterial,
    ].map(Boolean).join(',')}`);
    let rendererStateReset = false;
    try {
      this._rendererState = RendererUtils.resetRendererState(
        renderer,
        this._rendererState,
      );
      rendererStateReset = true;
      reportBloomDebug('renderer state reset');
      const drawingBufferSize = renderer.getDrawingBufferSize(_drawingBufferSize);
      this.setSize(drawingBufferSize.width, drawingBufferSize.height);
      reportBloomDebug(`size ${drawingBufferSize.width}x${drawingBufferSize.height}`);

      renderer.setRenderTarget(this._halfResolutionSceneTarget);
      _quadMesh.material = this._halfResolutionMaterial;
      _quadMesh.name = 'ToonLab Source Bloom [ Scene Downsample / 1:2 ]';
      reportBloomDebug('half-resolution scene begin');
      _quadMesh.render(renderer);
      reportBloomDebug('half-resolution scene');

      this._highPassMaterial.colorTexture.value = this._halfResolutionSceneTarget.texture;
      renderer.setRenderTarget(this._sourceTargets[0]);
      _quadMesh.material = this._highPassMaterial;
      _quadMesh.name = 'ToonLab Source Bloom [ Threshold Setup / 1:2 ]';
      _quadMesh.render(renderer);
      reportBloomDebug('threshold');

      for (let index = 1; index < BLOOM_STAGE_COUNT; index += 1) {
        const previous = this._resolutions[index - 1];
        this._downsampleMaterial.colorTexture.value = this._sourceTargets[index - 1].texture;
        this._downsampleMaterial.invSize.value.set(
          1 / previous.width,
          1 / previous.height,
        );
        renderer.setRenderTarget(this._sourceTargets[index]);
        _quadMesh.material = this._downsampleMaterial;
        _quadMesh.name = `ToonLab Source Bloom [ Downsample ${index + 1} / 6 ]`;
        _quadMesh.render(renderer);
        reportBloomDebug(`downsample ${index + 1}`);
      }

      const firstActiveStage = BLOOM_STAGE_COUNT - this.settings.stageCount;
      for (let index = BLOOM_STAGE_COUNT - 1; index >= firstActiveStage; index -= 1) {
        const resolution = this._resolutions[index];
        this._setKernelUniforms(this._kernels[index]);
        this._filterMaterial.colorTexture.value = this._sourceTargets[index].texture;
        this._filterMaterial.invSize.value.set(
          1 / resolution.width,
          1 / resolution.height,
        );
        this._filterMaterial.direction.value.copy(_horizontalDirection);
        this._filterMaterial.tint.value.set(1, 1, 1);
        this._filterMaterial.useAdditive.value = 0;
        this._filterMaterial.additiveTexture.value = this._sourceTargets[index].texture;
        this._filterMaterial.additiveInvSize.value.copy(
          this._filterMaterial.invSize.value,
        );
        renderer.setRenderTarget(this._horizontalTargets[index]);
        _quadMesh.material = this._filterMaterial;
        _quadMesh.name = `ToonLab Source Bloom [ Gaussian X ${index + 1} / 6 ]`;
        _quadMesh.render(renderer);
        reportBloomDebug(`gaussian x ${index + 1}`);

        const stage = this.settings.stages[index];
        this._filterMaterial.colorTexture.value = this._horizontalTargets[index].texture;
        this._filterMaterial.direction.value.copy(_verticalDirection);
        this._filterMaterial.tint.value.set(
          stage.tint[0] * this.settings.tintScale,
          stage.tint[1] * this.settings.tintScale,
          stage.tint[2] * this.settings.tintScale,
        );
        if (index < BLOOM_STAGE_COUNT - 1) {
          const additiveResolution = this._resolutions[index + 1];
          this._filterMaterial.useAdditive.value = 1;
          this._filterMaterial.additiveTexture.value = this._verticalTargets[index + 1].texture;
          this._filterMaterial.additiveInvSize.value.set(
            1 / additiveResolution.width,
            1 / additiveResolution.height,
          );
        } else {
          this._filterMaterial.useAdditive.value = 0;
        }
        renderer.setRenderTarget(this._verticalTargets[index]);
        _quadMesh.name = `ToonLab Source Bloom [ Gaussian Y ${index + 1} / 6 ]`;
        _quadMesh.render(renderer);
        reportBloomDebug(`gaussian y ${index + 1}`);
      }

      this._lastErrorReported = false;
      reportBloomDebug('complete');
    } catch (error) {
      if (!this._lastErrorReported) {
        console.error('[ToonLab Source Bloom] update failed', error);
        this._lastErrorReported = true;
      }
      throw error;
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
    const threshold = float(this.settings.threshold);
    const legacyLuminance = vec3(...this.settings.legacyLuminanceFactors);
    const halfResolution = Fn(() => vec4(this.inputNode.rgb, 0));
    this._halfResolutionMaterial = this._halfResolutionMaterial ?? new NodeMaterial();
    this._halfResolutionMaterial.name = 'ToonLab.SourceBloom.HalfResolutionScene';
    this._halfResolutionMaterial.fragmentNode = halfResolution().context(sharedContext);
    this._halfResolutionMaterial.needsUpdate = true;

    const highPassTexture = texture(null);
    const highPass = Fn(() => {
      const linearColor = highPassTexture.sample(uv()).rgb;
      const amount = this.settings.threshold > -1
        ? saturate(dot(linearColor, legacyLuminance).sub(threshold).mul(0.5))
        : float(1);
      return vec4(linearColor.mul(amount), 0);
    });
    this._highPassMaterial = this._highPassMaterial ?? new NodeMaterial();
    this._highPassMaterial.name = 'ToonLab.SourceBloom.Setup';
    this._highPassMaterial.fragmentNode = highPass().context(sharedContext);
    this._highPassMaterial.colorTexture = highPassTexture;
    this._highPassMaterial.needsUpdate = true;

    const downsampleTexture = texture(null);
    const downsampleInvSize = uniform(new Vector2());
    const downsample = Fn(() => {
      const centerUv = uv();
      const halfTexel = downsampleInvSize.mul(0.5);
      const sample = (offsetX, offsetY) => downsampleTexture.sample(clamp(
        centerUv.add(downsampleInvSize.mul(vec2(offsetX, offsetY))),
        halfTexel,
        vec2(1).sub(halfTexel),
      ));
      const color = sample(-1, -1)
        .add(sample(1, -1))
        .add(sample(-1, 1))
        .add(sample(1, 1))
        .mul(0.25);
      return vec4(max(color.rgb, 0), 0);
    });
    this._downsampleMaterial = this._downsampleMaterial ?? new NodeMaterial();
    this._downsampleMaterial.name = 'ToonLab.SourceBloom.DownsampleHigh';
    this._downsampleMaterial.fragmentNode = downsample().context(sharedContext);
    this._downsampleMaterial.colorTexture = downsampleTexture;
    this._downsampleMaterial.invSize = downsampleInvSize;
    this._downsampleMaterial.needsUpdate = true;

    const colorTexture = texture(null);
    const additiveTexture = texture(null);
    const invSize = uniform(new Vector2());
    const additiveInvSize = uniform(new Vector2());
    const direction = uniform(new Vector2());
    const tint = uniform(new Vector3(1, 1, 1));
    const useAdditive = uniform(0);
    const sampleCount = uniform(1, 'int');
    const offsetWeightValues = Array.from(
      { length: MAX_FILTER_SAMPLES },
      () => new Vector2(),
    );
    const offsetWeights = uniformArray(offsetWeightValues, 'vec2');
    const filter = Fn(() => {
      const centerUv = uv();
      const color = vec3(0).toVar('toonLabBloomFilterColor');
      Loop({ start: int(0), end: sampleCount, type: 'int', condition: '<' }, ({ i }) => {
        const offsetWeight = offsetWeights.element(i);
        const sampleUv = centerUv.add(
          direction.mul(invSize).mul(offsetWeight.x),
        );
        color.addAssign(
          sampleWithZeroBorder(colorTexture, sampleUv, invSize)
            .rgb
            .mul(offsetWeight.y),
        );
      });
      const additive = sampleWithZeroBorder(
        additiveTexture,
        centerUv,
        additiveInvSize,
      ).rgb.mul(useAdditive);
      return vec4(color.mul(tint).add(additive), 0);
    });
    this._filterMaterial = this._filterMaterial ?? new NodeMaterial();
    this._filterMaterial.name = 'ToonLab.SourceBloom.Gaussian';
    this._filterMaterial.fragmentNode = filter().context(sharedContext);
    this._filterMaterial.colorTexture = colorTexture;
    this._filterMaterial.additiveTexture = additiveTexture;
    this._filterMaterial.invSize = invSize;
    this._filterMaterial.additiveInvSize = additiveInvSize;
    this._filterMaterial.direction = direction;
    this._filterMaterial.tint = tint;
    this._filterMaterial.useAdditive = useAdditive;
    this._filterMaterial.sampleCount = sampleCount;
    this._filterMaterial.offsetWeights = offsetWeights;
    this._filterMaterial.needsUpdate = true;

    return this._textureOutput;
  }

  dispose() {
    for (const target of [
      this._halfResolutionSceneTarget,
      ...this._sourceTargets,
      ...this._horizontalTargets,
      ...this._verticalTargets,
    ]) target.dispose();
    this._halfResolutionMaterial?.dispose();
    this._highPassMaterial?.dispose();
    this._downsampleMaterial?.dispose();
    this._filterMaterial?.dispose();
  }
}

export function toonLabSourceStandardBloom(node, settings = {}) {
  return new ToonLabSourceStandardBloomNode(node, settings);
}
