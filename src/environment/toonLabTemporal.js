// Source-exact ToonLab reference renderer TemporalAA High resolve used by the
// supplied EnvironmentReferenceScene spectator camera. Three's TRAANode constructor
// supplies common render-target/camera storage, but this node owns setup,
// pipeline hooks, resolve, and per-frame history in full; no Three TRAA
// weighting/clamping or previous-depth path remains.

import { QuadMesh, RendererUtils, Vector2 } from 'three/webgpu';
import TRAANode from 'three/examples/jsm/tsl/display/TRAANode.js';
import {
  Fn,
  If,
  convertToTexture,
  dot,
  float,
  floor,
  ivec2,
  max,
  min,
  mix,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';

const YCOCG_CHROMA_BIAS = 128 / 255;
const sourceTaaQuadMesh = new QuadMesh();
let sourceTaaRendererState;

export const TOONLAB_TAA_SOURCE = Object.freeze({
  engine: 'ToonLab',
  package: '@call-me-sensei/toonlab/environment',
  cameraPrefab: Object.freeze({
    path: 'ToonLab/Demo/P_SpectatorCamera.toonlab-object',
    sha256: 'a071678a49b45d5808d24f3267c9c47fa8b907c4b86e9af725e36a3d2992bb75',
  }),
  colorLibrary: Object.freeze({
    path: 'src/shaders-tsl/chunks/environment-color.js',
    sha256: '21ec6ebfa1ae02cce8b4966e669ddd0d437dd4c89422712e6b48d1ee3cf18c3e',
  }),
  runtime: Object.freeze({
    path: 'src/environment/toonLabTemporal.js',
    sha256: 'be4940f264204c5bf89595ed6c38df624080d5ddf6fd4083bd5f23114d7e3ab8',
  }),
  shader: Object.freeze({
    path: 'src/shaders-tsl/post-composite.js',
    sha256: '48b53bc4087c86a1e56976afbe1faefbd73a4e6452997a670de0a4d887488451',
  }),
  shaderLibrary: Object.freeze({
    path: 'src/environment/toonLabTemporal.js',
    sha256: 'b9c7613044fecf244be7929e90d42f086056857e75404799f67faaf3b0e2405e',
  }),
});

export const TOONLAB_TAA_CONTRACT = Object.freeze({
  alphaOutput: false,
  centralFiltering: 0,
  clampQuality: 2,
  depthHistory: false,
  frameInfluence: 0.1,
  historyQuality: 2,
  historySampling: 'SampleBicubic5TapHalf / five linear-clamp fetches',
  jitterScale: 1,
  motionQuality: 2,
  neighborhood: 'nine point-clamp taps / YCoCg variance + min-max clamp',
  quality: 3,
  qualityName: 'High',
  sequence: 'Halton(2,3), skip index zero',
  sequenceLength: 1024,
  targetFormat: 'R16G16B16A16_SFloat-compatible HalfFloat history/resolve',
  varianceClampScale: 0.9,
  workingColorSpace: 'linear RGB -> biased YCoCg -> perceptual compression',
});

export const TOONLAB_TAA_SAMPLE_OFFSETS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([0, 1]),
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, -1]),
  Object.freeze([-1, 1]),
  Object.freeze([1, -1]),
  Object.freeze([1, 1]),
  Object.freeze([-1, -1]),
]);

function wrapIndex(value, count) {
  const size = Math.max(1, Math.trunc(Number(count) || 1));
  return ((Math.trunc(Number(value) || 0) % size) + size) % size;
}

export function toonLabSurfaceHalton(index, base) {
  let value = Math.max(0, Math.trunc(Number(index) || 0));
  const radix = Math.max(2, Math.trunc(Number(base) || 2));
  let fraction = 1;
  let result = 0;
  while (value > 0) {
    fraction /= radix;
    result += fraction * (value % radix);
    value = Math.floor(value / radix);
  }
  return result;
}

export function computeToonLabTaaJitter(sampleIndex) {
  const contract = TOONLAB_TAA_CONTRACT;
  const index = wrapIndex(sampleIndex, contract.sequenceLength);
  return [
    (toonLabSurfaceHalton(index + 1, 2) - 0.5) * contract.jitterScale,
    (toonLabSurfaceHalton(index + 1, 3) - 0.5) * contract.jitterScale,
  ];
}

export function toonLabSurfaceRgbToYCoCg(rgb) {
  const [r = 0, g = 0, b = 0] = rgb ?? [];
  return [
    0.25 * r + 0.5 * g + 0.25 * b,
    0.5 * r - 0.5 * b + YCOCG_CHROMA_BIAS,
    -0.25 * r + 0.5 * g - 0.25 * b + YCOCG_CHROMA_BIAS,
  ];
}

export function toonLabSurfaceYCoCgToRgb(yCoCg) {
  const [y = 0, biasedCo = YCOCG_CHROMA_BIAS, biasedCg = YCOCG_CHROMA_BIAS]
    = yCoCg ?? [];
  const co = biasedCo - YCOCG_CHROMA_BIAS;
  const cg = biasedCg - YCOCG_CHROMA_BIAS;
  return [y + co - cg, y + cg, y - co - cg];
}

/** CPU oracle for High's nine-tap variance-plus-neighborhood clamp. */
export function evaluateToonLabSurfaceTaaNeighborhood(samplesRgb, {
  varianceClampScale = TOONLAB_TAA_CONTRACT.varianceClampScale,
} = {}) {
  if (!Array.isArray(samplesRgb) || samplesRgb.length !== 9) {
    throw new TypeError('ToonLab TAA High requires exactly nine RGB samples.');
  }
  const samples = samplesRgb.map(toonLabSurfaceRgbToYCoCg);
  const minimum = [...samples[0]];
  const maximum = [...samples[0]];
  const moment1 = [0, 0, 0];
  const moment2 = [0, 0, 0];
  for (const sample of samples) {
    for (let channel = 0; channel < 3; channel += 1) {
      minimum[channel] = Math.min(minimum[channel], sample[channel]);
      maximum[channel] = Math.max(maximum[channel], sample[channel]);
      moment1[channel] += sample[channel];
      moment2[channel] += sample[channel] ** 2;
    }
  }
  const mean = moment1.map((value) => value / 9);
  const standardDeviation = moment2.map((value, channel) => Math.sqrt(Math.abs(
    value / 9 - mean[channel] ** 2,
  )));
  const devMinimum = mean.map(
    (value, channel) => value - varianceClampScale * standardDeviation[channel],
  );
  const devMaximum = mean.map(
    (value, channel) => value + varianceClampScale * standardDeviation[channel],
  );
  return {
    maximum: maximum.map((value, channel) => Math.min(value, devMaximum[channel])),
    mean,
    minimum: minimum.map((value, channel) => Math.max(value, devMinimum[channel])),
    standardDeviation,
  };
}

/** CPU oracle for TOONLAB SampleBicubic5TapHalf's exact footprint and weights. */
export function computeToonLabSurfaceTaaHistoryTaps(uvValue, sizeValue) {
  const inputUv = [Number(uvValue?.[0]) || 0, Number(uvValue?.[1]) || 0];
  const size = [
    Math.max(1, Number(sizeValue?.[0]) || 1),
    Math.max(1, Number(sizeValue?.[1]) || 1),
  ];
  const texel = [1 / size[0], 1 / size[1]];
  const samplePosition = [inputUv[0] * size[0], inputUv[1] * size[1]];
  const tc1 = samplePosition.map((value) => Math.floor(value - 0.5) + 0.5);
  const f = samplePosition.map((value, channel) => value - tc1[channel]);
  const f2 = f.map((value) => value * value);
  const f3 = f.map((value, channel) => value * f2[channel]);
  const c = 0.5;
  const w0 = f.map((value, channel) => (
    -c * f3[channel] + 2 * c * f2[channel] - c * value
  ));
  const w1 = f.map((_value, channel) => (
    (2 - c) * f3[channel] - (3 - c) * f2[channel] + 1
  ));
  const w2 = f.map((value, channel) => (
    -(2 - c) * f3[channel] + (3 - 2 * c) * f2[channel] + c * value
  ));
  const w3 = f.map((_value, channel) => (
    c * f3[channel] - c * f2[channel]
  ));
  const w12 = [w1[0] + w2[0], w1[1] + w2[1]];
  const tc0 = [(tc1[0] - 1) * texel[0], (tc1[1] - 1) * texel[1]];
  const tc3 = [(tc1[0] + 2) * texel[0], (tc1[1] + 2) * texel[1]];
  const tc12 = [
    (tc1[0] + w2[0] / w12[0]) * texel[0],
    (tc1[1] + w2[1] / w12[1]) * texel[1],
  ];
  const weights = [
    w12[0] * w0[1],
    w0[0] * w12[1],
    w12[0] * w12[1],
    w3[0] * w12[1],
    w12[0] * w3[1],
  ];
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  return {
    uv: [
      [tc12[0], tc0[1]],
      [tc0[0], tc12[1]],
      [tc12[0], tc12[1]],
      [tc3[0], tc12[1]],
      [tc12[0], tc3[1]],
    ],
    weights,
    weightSum,
  };
}

/** CPU oracle for ApplyHistoryColorLerp in perceptual YCoCg space. */
export function evaluateToonLabSurfaceTaaPerceptualBlend(
  historyRgb,
  currentRgb,
  frameInfluence = TOONLAB_TAA_CONTRACT.frameInfluence,
) {
  const history = toonLabSurfaceRgbToYCoCg(historyRgb);
  const current = toonLabSurfaceRgbToYCoCg(currentRgb);
  const compress = (value) => value.map(
    (channel) => channel / (value[0] + 1),
  );
  const compressedHistory = compress(history);
  const compressedCurrent = compress(current);
  const compressed = compressedHistory.map(
    (value, channel) => value + (compressedCurrent[channel] - value) * frameInfluence,
  );
  const working = compressed.map((value) => value / (1 - compressed[0]));
  return toonLabSurfaceYCoCgToRgb(working);
}

function resolveBeautyRenderTarget(beautyNode) {
  const resolved = convertToTexture(beautyNode);
  const renderTarget = resolved.isRTTNode
    ? resolved.renderTarget
    : resolved.passNode?.renderTarget;
  if (!renderTarget) {
    throw new TypeError(
      'ToonLab TAA beauty must own an RTT renderTarget or reference a PassTextureNode renderTarget.',
    );
  }
  return { renderTarget, resolved };
}

/**
 * ToonLab renderer's exact TemporalAA High fragment resolve on top of Three's WebGPU
 * history-target lifecycle. The source uses pass `(2, 2, 2, 0)`:
 * variance/min-max clamp, 9-tap motion dilation, bicubic history, and no
 * current-center filter.
 */
export class ToonLabTemporalAANode extends TRAANode {
  constructor(beautyNode, depthNode, velocityNode, camera, {
    initialSampleIndex = 0,
  } = {}) {
    const { renderTarget, resolved } = resolveBeautyRenderTarget(beautyNode);
    super(resolved, depthNode, velocityNode, camera);
    const contract = TOONLAB_TAA_CONTRACT;
    this.beautyRenderTarget = renderTarget;
    this.sequenceLength = contract.sequenceLength;
    this._jitterIndex = wrapIndex(initialSampleIndex, this.sequenceLength);
    this.currentJitter = new Vector2();
    this._sourceFrameInfluence = uniform(1);
    this._forceSourceHistoryReset = true;
    this.useSubpixelCorrection = false;
    this.usesDepthHistory = false;
    this._historyRenderTarget.texture.name = 'ToonLab TAA High history';
    this._resolveRenderTarget.texture.name = 'ToonLab TAA High resolve';
    // TOONLAB High's DoTemporalAA(2,2,2,0) has no previous-depth input. Three's
    // base TRAA node allocates both a history depth attachment and a separate
    // placeholder depth texture for its disocclusion resolve. Remove both at
    // construction time so later material/pipeline rebuilds cannot revive a
    // backend-only depth-history path that the source permutation never owns.
    this._historyRenderTarget.depthTexture?.dispose();
    this._historyRenderTarget.depthTexture = null;
    this._previousDepthNode?.value?.dispose?.();
    this._previousDepthNode = null;
    this.contract = Object.freeze({
      ...contract,
      historyResolve:
        'literal ToonLab renderer TemporalAA.shader High pass DoTemporalAA(2,2,2,0)',
      jitter: 'literal 1024-sample Halton(2,3), index (frame & 1023) + 1',
      method: 'ToonLab TemporalAntiAliasing / High',
      remainingBridges: Object.freeze([
        'Three/WGSL exposes float arithmetic rather than source HLSL half arithmetic; history and resolve boundaries remain RGBA16F',
        'Three velocity MRT is converted from NDC to ToonLab forward screen-UV convention instead of sharing ToonLab MotionVectors.hlsl packing',
        'WebGPU history copy/frame scheduling substitutes for ToonLab RenderGraph/TaaHistory version ownership',
      ]),
      source: TOONLAB_TAA_SOURCE,
    });
  }

  setViewOffset(width, height) {
    this.camera.updateProjectionMatrix();
    this._originalProjectionMatrix.copy(this.camera.projectionMatrix);
    this._velocityNode?.setProjectionMatrix(this._originalProjectionMatrix);
    const jitter = computeToonLabTaaJitter(this._jitterIndex);
    this.currentJitter.set(jitter[0], jitter[1]);
    this.camera.setViewOffset(width, height, jitter[0], jitter[1], width, height);
  }

  clearViewOffset() {
    this.camera.clearViewOffset();
    this._velocityNode?.setProjectionMatrix(null);
    this._jitterIndex = (this._jitterIndex + 1) % this.sequenceLength;
  }

  updateBefore(frame) {
    const { renderer } = frame;
    const width = this.beautyRenderTarget.texture.width;
    const height = this.beautyRenderTarget.texture.height;
    const needsRestart = this._forceSourceHistoryReset
      || this._historyRenderTarget.width !== width
      || this._historyRenderTarget.height !== height;
    this._sourceFrameInfluence.value = needsRestart
      ? 1
      : TOONLAB_TAA_CONTRACT.frameInfluence;

    if (this._needsPostProcessingSync === true) {
      this.setViewOffset(width, height);
      this._needsPostProcessingSync = false;
    }

    sourceTaaRendererState = RendererUtils.resetRendererState(
      renderer,
      sourceTaaRendererState,
    );
    try {
      this.setSize(width, height);
      if (needsRestart) {
        renderer.initRenderTarget(this._historyRenderTarget);
        renderer.initRenderTarget(this._resolveRenderTarget);
        renderer.copyTextureToTexture(
          this.beautyRenderTarget.texture,
          this._historyRenderTarget.texture,
        );
      }

      renderer.setRenderTarget(this._resolveRenderTarget);
      sourceTaaQuadMesh.material = this._resolveMaterial;
      sourceTaaQuadMesh.name = 'ToonLab TAA High';
      sourceTaaQuadMesh.render(renderer);
      renderer.setRenderTarget(null);
      renderer.copyTextureToTexture(
        this._resolveRenderTarget.texture,
        this._historyRenderTarget.texture,
      );
    } finally {
      RendererUtils.restoreRendererState(renderer, sourceTaaRendererState);
    }

    this._forceSourceHistoryReset = false;
  }

  setup(builder) {
    // Retain only TRAANode's render-pipeline jitter hook and velocity-node
    // binding. Calling super.setup() would build Three's unrelated previous-
    // depth/disocclusion resolve and, on an idempotent material rebuild, try to
    // mutate the deliberately absent history depth attachment. TOONLAB High has no
    // previous-depth input, so its exact setup must not enter that base path.
    const renderPipeline = builder.context.renderPipeline;
    if (renderPipeline) {
      this._needsPostProcessingSync = true;
      renderPipeline.context.onBeforeRenderPipeline = () => {
        const size = builder.renderer.getDrawingBufferSize(new Vector2());
        this.setViewOffset(size.width, size.height);
      };
      renderPipeline.context.onAfterRenderPipeline = () => {
        this.clearViewOffset();
      };
    }
    this._velocityNode = builder.context.velocity ?? velocity;
    const historyNode = texture(this._historyRenderTarget.texture);

    const rgbToYCoCg = (rgb) => vec3(
      dot(rgb, vec3(0.25, 0.5, 0.25)),
      dot(rgb, vec3(0.5, 0, -0.5)).add(YCOCG_CHROMA_BIAS),
      dot(rgb, vec3(-0.25, 0.5, -0.25)).add(YCOCG_CHROMA_BIAS),
    );
    const yCoCgToRgb = (yCoCg) => {
      const co = yCoCg.y.sub(YCOCG_CHROMA_BIAS);
      const cg = yCoCg.z.sub(YCOCG_CHROMA_BIAS);
      return vec3(
        yCoCg.x.add(co).sub(cg),
        yCoCg.x.add(cg),
        yCoCg.x.sub(co).sub(cg),
      );
    };
    const sceneToWorking = (sceneColor) => vec4(
      rgbToYCoCg(sceneColor.rgb),
      sceneColor.a,
    );
    const workingToScene = (workingColor) => vec4(
      yCoCgToRgb(workingColor.rgb),
      workingColor.a,
    );
    const workingToPerceptual = (workingColor) => workingColor.mul(
      float(1).div(workingColor.x.add(1)),
    );
    const perceptualToWorking = (perceptualColor) => perceptualColor.mul(
      float(1).div(float(1).sub(perceptualColor.x)),
    );

    const sampleHistoryBicubic5Tap = (inputUv, textureSize) => {
      const size = vec2(textureSize);
      const texel = size.reciprocal();
      const samplePosition = inputUv.mul(size);
      const tc1 = floor(samplePosition.sub(0.5)).add(0.5);
      const f = samplePosition.sub(tc1);
      const f2 = f.mul(f);
      const f3 = f.mul(f2);
      const c = float(0.5);
      const w0 = f3.mul(c.negate())
        .add(f2.mul(c.mul(2)))
        .sub(f.mul(c));
      const w1 = f3.mul(float(2).sub(c))
        .sub(f2.mul(float(3).sub(c)))
        .add(1);
      const w2 = f3.mul(float(2).sub(c).negate())
        .add(f2.mul(float(3).sub(c.mul(2))))
        .add(f.mul(c));
      const w3 = f3.mul(c).sub(f2.mul(c));
      const w12 = w1.add(w2);
      const tc0 = tc1.sub(1).mul(texel);
      const tc3 = tc1.add(2).mul(texel);
      const tc12 = tc1.add(w2.div(w12)).mul(texel);
      const sampleUvs = [
        vec2(tc12.x, tc0.y),
        vec2(tc0.x, tc12.y),
        vec2(tc12.x, tc12.y),
        vec2(tc3.x, tc12.y),
        vec2(tc12.x, tc3.y),
      ];
      const weights = [
        w12.x.mul(w0.y),
        w0.x.mul(w12.y),
        w12.x.mul(w12.y),
        w3.x.mul(w12.y),
        w12.x.mul(w3.y),
      ];
      const historyFiltered = vec4(0).toVar('toonLabTaaHistoryFiltered');
      const weightSum = float(0).toVar('toonLabTaaHistoryWeightSum');
      for (let index = 0; index < sampleUvs.length; index += 1) {
        historyFiltered.addAssign(
          sceneToWorking(historyNode.sample(sampleUvs[index])).mul(weights[index]),
        );
        weightSum.addAssign(weights[index]);
      }
      return historyFiltered.div(max(weightSum, 1e-8));
    };

    const resolve = Fn(() => {
      const uvNode = uv();
      const textureSize = this.beautyNode.size();
      const textureSizeF = vec2(textureSize);
      const maximumTexel = textureSize.sub(1);
      const centerTexel = ivec2(floor(uvNode.mul(textureSizeF)))
        .clamp(ivec2(0), maximumTexel);
      const clampTexel = (coord) => coord.clamp(ivec2(0), maximumTexel);
      const sampleWorking = (offset) => sceneToWorking(
        this.beautyNode.load(clampTexel(centerTexel.add(ivec2(...offset)))),
      );

      // High uses the point-sampled center, not Very High's filtered center.
      const colorCenter = sampleWorking([0, 0]);
      const boxMinimum = colorCenter.toVar('toonLabTaaBoxMinimum');
      const boxMaximum = colorCenter.toVar('toonLabTaaBoxMaximum');
      const moment1 = colorCenter.toVar('toonLabTaaMoment1');
      const moment2 = colorCenter.mul(colorCenter).toVar('toonLabTaaMoment2');
      for (const offset of TOONLAB_TAA_SAMPLE_OFFSETS.slice(1)) {
        const sample = sampleWorking(offset);
        boxMinimum.assign(min(boxMinimum, sample));
        boxMaximum.assign(max(boxMaximum, sample));
        moment1.addAssign(sample);
        moment2.addAssign(sample.mul(sample));
      }
      const mean = moment1.div(9);
      const standardDeviation = moment2.div(9)
        .sub(mean.mul(mean))
        .abs()
        .sqrt();
      const scaledDeviation = standardDeviation.mul(
        TOONLAB_TAA_CONTRACT.varianceClampScale,
      );
      boxMinimum.assign(max(boxMinimum, mean.sub(scaledDeviation)));
      boxMaximum.assign(min(boxMaximum, mean.add(scaledDeviation)));

      // Source order and strict `<` comparisons preserve its tie-breaks.
      const bestDepth = float(1).toVar('toonLabTaaBestDepth');
      const bestOffset = vec2(0).toVar('toonLabTaaBestDepthOffset');
      for (const [x, y] of TOONLAB_TAA_SAMPLE_OFFSETS) {
        const texel = clampTexel(centerTexel.add(ivec2(x, y)));
        let depth = this.depthNode.load(texel).r;
        if (builder.renderer.reversedDepthBuffer) depth = depth.oneMinus();
        If(depth.lessThan(bestDepth), () => {
          bestDepth.assign(depth);
          bestOffset.assign(vec2(x, y));
        });
      }

      // Three velocity is current-minus-previous NDC. Convert it to ToonLab's
      // forward screen-UV motion, then negate exactly as GetVelocityWithOffset.
      const velocityTexel = clampTexel(centerTexel.add(ivec2(bestOffset)));
      const threeVelocityNdc = this.velocityNode.load(velocityTexel).xy;
      const toonLabForwardVelocityUv = threeVelocityNdc.mul(vec2(0.5, -0.5));
      const backwardVelocityUv = toonLabForwardVelocityUv.negate();
      const historyUv = uvNode.add(backwardVelocityUv);
      const accumulation = sampleHistoryBicubic5Tap(historyUv, textureSize);
      const clampedAccumulation = accumulation
        .clamp(boxMinimum, boxMaximum);

      // High rejects history only when reprojection leaves the buffer. Camera
      // movement is already represented by the motion-vector texture.
      const outsideHistory = historyUv.sub(0.5).abs().greaterThan(0.5).any();
      const frameInfluence = outsideHistory.select(1, this._sourceFrameInfluence);
      const perceptualHistory = workingToPerceptual(clampedAccumulation);
      const perceptualCenter = workingToPerceptual(colorCenter);
      const perceptualResolved = mix(
        perceptualHistory,
        perceptualCenter,
        frameInfluence,
      );
      const workingResolved = perceptualToWorking(perceptualResolved);
      const sceneResolved = workingToScene(workingResolved);
      return vec4(sceneResolved.rgb.max(0), 1);
    });

    this._resolveMaterial.colorNode = resolve();
    this._resolveMaterial.name = 'ToonLab TAA High resolve';
    this._resolveMaterial.needsUpdate = true;
    return this._textureNode;
  }

  reset(sampleIndex = 0) {
    this._jitterIndex = wrapIndex(sampleIndex, this.sequenceLength);
    this.currentJitter.set(0, 0);
    this._forceSourceHistoryReset = true;
    this._sourceFrameInfluence.value = 1;
    this._historyRenderTarget.setSize(1, 1);
    return this;
  }
}

export function toonLabTraa(
  beautyNode,
  depthNode,
  velocityNode,
  camera,
  options = {},
) {
  return new ToonLabTemporalAANode(
    beautyNode,
    depthNode,
    velocityNode,
    camera,
    options,
  );
}
