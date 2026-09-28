// ToonLab Gen4 temporal-AA resolve, camera jitter, and DitherTemporalAA for the
// licensed source renderer. The active ToonLabShowcase MainUpsampling / High path is
// reproduced here; renderer data that WebGPU does not expose remains listed in
// the public contract instead of being hidden behind Three's generic TRAA.

import * as THREE from 'three';
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
  mod,
  screenCoordinate,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export const DEFAULT_TOONLAB_SOURCE_TEMPORAL_DITHER_NOISE_URL = null;

export const TOONLAB_SOURCE_TEMPORAL_CONTRACT = Object.freeze({
  antiAliasingMethod: 2,
  catmullRom: false,
  currentFrameWeight: 0.04,
  dither: Object.freeze({
    alphaClip: 1 / 3,
    coefficient: 0.16665,
    noiseAsset:
      '/Engine/EngineMaterials/Good64x64TilingNoiseHighFreq.Good64x64TilingNoiseHighFreq',
    noiseAddressX: 'TA_Wrap',
    noiseAddressY: 'TA_Wrap',
    noiseColorSpace: 'linear-grayscale',
    noiseFilter: 'TF_Default-linear',
    noiseMipGen: 'TMGS_NoMipmaps',
    noiseResolution: Object.freeze([64, 64]),
    randomDefault: 1,
    regularPatternPeriod: 5,
  }),
  filterSize: 1,
  historyFilter: 'five-sample bicubic Catmull-Rom',
  historyFormat: 'PF_FloatRGBA',
  historyFormatReason:
    'quality High excludes the configured r.TemporalAA.R11G11B10History branch',
  historyPreExposureCorrection: 1,
  historyR11G11B10Cvar: 1,
  historyR11G11B10EnabledForActivePermutation: false,
  inputFilter: 'MainUpsampling High nine-tap polynomial + HDR weighting',
  neighborhoodClamp: 'YCoCg sample-distance min/max, threshold 1.51 at 100%',
  passConfig: 'MainUpsampling',
  quality: 2,
  qualityName: 'High',
  screenPercentage: 100,
  sequenceLength: 8,
  temporalUpsampling: true,
  workingColorSpace: 'YCoCg scaled by 4',
});

export const TOONLAB_SOURCE_TAA_SAMPLE_OFFSETS = Object.freeze([
  Object.freeze([-1, -1]),
  Object.freeze([0, -1]),
  Object.freeze([1, -1]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 0]),
  Object.freeze([1, 0]),
  Object.freeze([-1, 1]),
  Object.freeze([0, 1]),
  Object.freeze([1, 1]),
]);

const saturateNumber = (value) => Math.min(Math.max(Number(value) || 0, 0), 1);

/** ToonLab TemporalAA.usf's unnormalized, luma-times-four YCoCg transform. */
export function toonLabSourceRgbToYCoCg(rgb) {
  const [r = 0, g = 0, b = 0] = rgb ?? [];
  return [
    r + 2 * g + b,
    2 * r - 2 * b,
    -r + 2 * g - b,
  ];
}

/** Reciprocal of {@link toonLabSourceRgbToYCoCg}. */
export function toonLabSourceYCoCgToRgb(yCoCg) {
  const [scaledY = 0, scaledCo = 0, scaledCg = 0] = yCoCg ?? [];
  const y = scaledY * 0.25;
  const co = scaledCo * 0.25;
  const cg = scaledCg * 0.25;
  return [y + co - cg, y + cg, y - co - cg];
}

/** MainUpsampling's active polynomial reconstruction kernel. */
export function computeToonLabSourceTaaSpatialWeight(
  deltaX,
  deltaY,
  {
    invFilterScaleFactor = 1,
    upscaleFactor = 1,
  } = {},
) {
  const u2 = (Number(upscaleFactor) || 0) ** 2
    * (Number(invFilterScaleFactor) || 0) ** 2;
  const x2 = saturateNumber(
    u2 * ((Number(deltaX) || 0) ** 2 + (Number(deltaY) || 0) ** 2),
  );
  return (0.905 * x2 - 1.9) * x2 + 1;
}

/** CPU oracle for the active source-current contribution before HDR weighting. */
export function computeToonLabSourceTaaBlendWeight({
  cameraCut = false,
  filteredTemporalWeight = 1,
  lumaFiltered = 0,
  lumaHistory = 0,
  responsive = false,
  velocityPixels = 0,
} = {}) {
  let blend = (Number(filteredTemporalWeight) || 0)
    * TOONLAB_SOURCE_TEMPORAL_CONTRACT.currentFrameWeight;
  const motion = saturateNumber((Number(velocityPixels) || 0) / 40);
  blend += (0.2 - blend) * motion;
  const difference = Math.abs(
    (Number(lumaFiltered) || 0) - (Number(lumaHistory) || 0),
  );
  const minimumContribution = difference <= Number.EPSILON
    ? (Number(lumaHistory) > 0 ? 1 : 0)
    : saturateNumber(0.01 * (Number(lumaHistory) || 0) / difference);
  blend = Math.max(blend, minimumContribution);
  if (responsive) blend = 0.25;
  if (cameraCut) blend = 1;
  return blend;
}

/** CPU oracle for the active nine-tap current-frame filter. */
export function evaluateToonLabSourceTaaCurrentFilter(samplesRgb, jitter, {
  frameExposureScale = 1,
  invFilterScaleFactor = 1,
  upscaleFactor = 1,
} = {}) {
  if (!Array.isArray(samplesRgb) || samplesRgb.length !== 9) {
    throw new Error('ToonLab Gen4 TAA current filter requires nine RGB samples.');
  }
  const dKo = [Number(jitter?.[0]) || 0, Number(jitter?.[1]) || 0];
  const weighted = [0, 0, 0];
  const finalWeights = [];
  let weightSum = 0;
  TOONLAB_SOURCE_TAA_SAMPLE_OFFSETS.forEach(([x, y], index) => {
    const transformed = toonLabSourceRgbToYCoCg(samplesRgb[index]);
    const spatialWeight = computeToonLabSourceTaaSpatialWeight(
      x - dKo[0],
      y - dKo[1],
      { invFilterScaleFactor, upscaleFactor },
    );
    const hdrWeight = 1 / (transformed[0] * frameExposureScale + 4);
    const finalWeight = spatialWeight * hdrWeight;
    finalWeights.push(finalWeight);
    weightSum += finalWeight;
    for (let channel = 0; channel < 3; channel += 1) {
      weighted[channel] += transformed[channel] * finalWeight;
    }
  });
  const filteredYCoCg = weighted.map((channel) => channel / weightSum);
  return {
    dKo,
    filteredRgb: toonLabSourceYCoCgToRgb(filteredYCoCg),
    filteredTemporalWeight: computeToonLabSourceTaaSpatialWeight(
      dKo[0],
      dKo[1],
      { invFilterScaleFactor, upscaleFactor },
    ) * upscaleFactor ** 2,
    filteredYCoCg,
    normalizedWeights: finalWeights.map((weight) => weight / weightSum),
  };
}

/** CPU oracle for High-quality MainUpsampling's sample-distance YCoCg box. */
export function evaluateToonLabSourceTaaNeighborhoodBounds(samplesRgb, jitter, {
  upscaleFactor = 1,
} = {}) {
  if (!Array.isArray(samplesRgb) || samplesRgb.length !== 9) {
    throw new Error('ToonLab Gen4 TAA neighborhood requires nine RGB samples.');
  }
  const dKo = [Number(jitter?.[0]) || 0, Number(jitter?.[1]) || 0];
  const transformed = samplesRgb.map(toonLabSourceRgbToYCoCg);
  const minimum = [...transformed[4]];
  const maximum = [...transformed[4]];
  const included = [4];
  const threshold = 1.51 + (1.3 - 1.51) * (Number(upscaleFactor) - 1);
  TOONLAB_SOURCE_TAA_SAMPLE_OFFSETS.forEach(([x, y], index) => {
    if (index === 4) return;
    const dx = x - dKo[0];
    const dy = y - dKo[1];
    if (dx * dx + dy * dy >= threshold * threshold) return;
    included.push(index);
    for (let channel = 0; channel < 3; channel += 1) {
      minimum[channel] = Math.min(minimum[channel], transformed[index][channel]);
      maximum[channel] = Math.max(maximum[channel], transformed[index][channel]);
    }
  });
  return { included, maximum, minimum, threshold };
}

/** CPU oracle for TextureSampling.ush's five-fetch Catmull-Rom footprint. */
export function computeToonLabSourceTaaHistoryTaps(uvValue, sizeValue) {
  const uvInput = [Number(uvValue?.[0]) || 0, Number(uvValue?.[1]) || 0];
  const size = [
    Math.max(1, Number(sizeValue?.[0]) || 1),
    Math.max(1, Number(sizeValue?.[1]) || 1),
  ];
  const inverseSize = [1 / size[0], 1 / size[1]];
  const pixel = [uvInput[0] * size[0], uvInput[1] * size[1]];
  const iuv = pixel.map((value) => Math.floor(value - 0.5) + 1);
  const f = pixel.map((value, index) => value - iuv[index]);
  const f2 = f.map((value) => value * value);
  const uvOffset = f.map((value, index) => (1.25 - f2[index]) * value + 0.5);
  const t0 = [
    (0.25 * f2[0] - 0.0625) * (1.125 - 0.5 * f2[1]),
    (0.25 * f2[1] - 0.0625) * (1.125 - 0.5 * f2[0]),
  ];
  const w0 = t0.map((value, index) => value - 2 * f[index] * value);
  const w3 = t0.map((value, index) => value + 2 * f[index] * value);
  const center = iuv.map((value, index) => (value - 0.5) * inverseSize[index]);
  const offset = uvOffset.map((value, index) => value * inverseSize[index]);
  return {
    uv: [
      [center[0] - inverseSize[0], center[1] + offset[1]],
      [center[0] + 2 * inverseSize[0], center[1] + offset[1]],
      [center[0] + offset[0], center[1] + offset[1]],
      [center[0] + offset[0], center[1] - inverseSize[1]],
      [center[0] + offset[0], center[1] + 2 * inverseSize[1]],
    ],
    uvDirection: [[-1, 0], [1, 0], [0, 0], [0, -1], [0, 1]],
    weights: [
      w0[0],
      w3[0],
      1 - w0[0] - w3[0] - w0[1] - w3[1],
      w0[1],
      w3[1],
    ],
  };
}

export const TOONLAB_DITHER_TEMPORAL_AA_GRAPHS = Object.freeze([
  '/Game/ToonLab/Environment/Foliage/Materials/M_Foliage.M_Foliage',
  '/Game/ToonLab/Environment/Rocks/Materials/M_Rock.M_Rock',
  '/Game/ToonLab/Environment/Sky/Materials/M_StylizedClouds_Lite.M_StylizedClouds_Lite',
  '/Game/ToonLab/Environment/Sky/Materials/M_StylizedClouds.M_StylizedClouds',
  '/Game/ToonLab/Environment/Trees/Materials/M_Leaves.M_Leaves',
  '/Game/ToonLab/Environment/Water/Materials/M_Sandfall.M_Sandfall',
  '/Game/ToonLab/Environment/Water/Materials/M_Waterfall.M_Waterfall',
  '/Game/ToonLab/Materials/MF_DesertSand.MF_DesertSand',
]);

// These are the source-scene families that currently bind the reusable graph
// in the live WebGPU adapter. The four remaining exported call sites belong to
// full clouds, sandfall, waterfall, and the desert-sand function; those
// families are still explicit shader-port work rather than hidden fallbacks.
export const TOONLAB_DITHER_TEMPORAL_AA_RUNTIME_BINDINGS = Object.freeze([
  '/Game/ToonLab/Environment/Foliage/Materials/M_Foliage.M_Foliage',
  '/Game/ToonLab/Environment/Rocks/Materials/M_Rock.M_Rock',
  '/Game/ToonLab/Environment/Sky/Materials/M_StylizedClouds_Lite.M_StylizedClouds_Lite',
  '/Game/ToonLab/Environment/Trees/Materials/M_Leaves.M_Leaves',
]);

function wrapIndex(value, count) {
  const size = Math.max(1, Math.trunc(Number(count) || 1));
  return ((Math.trunc(Number(value) || 0) % size) + size) % size;
}

export function toonLabHalton(index, base) {
  let next = Math.max(0, Math.trunc(Number(index) || 0));
  const radix = Math.max(2, Math.trunc(Number(base) || 2));
  let fraction = 1;
  let result = 0;
  while (next > 0) {
    fraction /= radix;
    result += fraction * (next % radix);
    next = Math.floor(next / radix);
  }
  return result;
}

export function computeToonLabSourceTaaJitter(sampleIndex, {
  filterSize = TOONLAB_SOURCE_TEMPORAL_CONTRACT.filterSize,
  sequenceLength = TOONLAB_SOURCE_TEMPORAL_CONTRACT.sequenceLength,
  temporalUpsampling = TOONLAB_SOURCE_TEMPORAL_CONTRACT.temporalUpsampling,
} = {}) {
  const index = wrapIndex(sampleIndex, sequenceLength);
  const u1 = toonLabHalton(index + 1, 2);
  const u2 = toonLabHalton(index + 1, 3);

  // r.TemporalAA.Upsampling=1 makes the ToonLabShowcase view take this exact ToonLab
  // branch, even at the authored 100% screen percentage.
  if (temporalUpsampling) return [u1 - 0.5, u2 - 0.5];

  // Preserve the ordinary perspective-TAA branch for diagnostics. ToonLab windows
  // a Box-Muller normal distribution to +/-0.5 pixels with sigma .47.
  const sigma = 0.47 * Math.max(Number(filterSize) || 0, 1e-8);
  const inWindow = Math.exp(-0.5 * (0.5 / sigma) ** 2);
  const theta = 2 * Math.PI * u2;
  const radius = sigma * Math.sqrt(-2 * Math.log((1 - u1) * inWindow + u1));
  return [radius * Math.cos(theta), radius * Math.sin(theta)];
}

export function computeToonLabSourceTemporalDither({
  alpha,
  noise = 0,
  pixelX,
  pixelY,
  random = TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither.randomDefault,
  sampleIndex = 0,
} = {}) {
  const x = Math.trunc((Number(pixelX) || 0) + (Number(sampleIndex) || 0));
  const y = Math.trunc((Number(pixelY) || 0) + (Number(sampleIndex) || 0));
  const period = TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither.regularPatternPeriod;
  const regular = ((x + 2 * y) % period + period) % period;
  return (Number(alpha) || 0)
    + (regular + (Number(noise) || 0) * (Number(random) || 0))
      * TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither.coefficient
    - 0.5;
}

const noiseTexturePromises = new Map();

export async function loadToonLabSourceTemporalDitherNoiseTexture({
  textureLoader = new THREE.TextureLoader(),
  url = DEFAULT_TOONLAB_SOURCE_TEMPORAL_DITHER_NOISE_URL,
} = {}) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('A configured temporal dither noise URL is required.');
  }
  const key = String(url);
  if (!noiseTexturePromises.has(key)) {
    noiseTexturePromises.set(key, textureLoader.loadAsync(key).then((result) => {
      result.name = 'Good64x64TilingNoiseHighFreq';
      result.colorSpace = THREE.NoColorSpace;
      result.flipY = false;
      result.wrapS = THREE.RepeatWrapping;
      result.wrapT = THREE.RepeatWrapping;
      result.minFilter = THREE.LinearFilter;
      result.magFilter = THREE.LinearFilter;
      result.generateMipmaps = false;
      result.anisotropy = 1;
      result.userData.toonLabSourceTemporalDither = TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither;
      result.needsUpdate = true;
      return result;
    }).catch((error) => {
      noiseTexturePromises.delete(key);
      throw error;
    }));
  }
  return noiseTexturePromises.get(key);
}

export function toonLabSourceDitherTemporalAA(
  alphaNode,
  state,
  randomNode = float(TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither.randomDefault),
) {
  const sampleIndex = state?.uniforms?.temporalSampleIndex ?? float(0);
  const pixel = screenCoordinate.xy;
  const shiftedPixel = pixel.add(vec2(sampleIndex));
  const regular = mod(
    floor(shiftedPixel.x).add(floor(shiftedPixel.y).mul(2)),
    TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither.regularPatternPeriod,
  );
  const noiseTexture = state?.temporal?.ditherNoiseTexture;
  const noise = noiseTexture
    ? texture(noiseTexture).sample(pixel.div(64)).r.mul(randomNode)
    : float(0);
  return float(alphaNode)
    .add(regular.add(noise).mul(TOONLAB_SOURCE_TEMPORAL_CONTRACT.dither.coefficient))
    .sub(0.5);
}

export class ToonLabSourceTemporalAANode extends TRAANode {
  constructor(beautyNode, depthNode, velocityNode, camera, {
    initialSampleIndex = 0,
    sequenceLength = TOONLAB_SOURCE_TEMPORAL_CONTRACT.sequenceLength,
    state = null,
    temporalUpsampling = TOONLAB_SOURCE_TEMPORAL_CONTRACT.temporalUpsampling,
  } = {}) {
    super(beautyNode, depthNode, velocityNode, camera);
    this.sequenceLength = Math.max(1, Math.trunc(Number(sequenceLength) || 1));
    this.temporalUpsampling = Boolean(temporalUpsampling);
    this.sourceState = state;
    this._jitterIndex = wrapIndex(initialSampleIndex, this.sequenceLength);
    // This correction is specific to Three's generic TRAA resolve and has no
    // matching branch in ToonLab Gen4 TAA. setup() replaces that resolve entirely.
    this.useSubpixelCorrection = false;
    this.currentJitter = new THREE.Vector2();
    this._sourceTemporalJitter = uniform(this.currentJitter);
    this._sourceCameraCut = uniform(1);
    this._forceSourceHistoryReset = true;
    this.contract = Object.freeze({
      activeHistoryFormat: TOONLAB_SOURCE_TEMPORAL_CONTRACT.historyFormat,
      activePermutation: 'MainUpsampling / High / nine samples / YCoCg',
      currentFrameFilter: TOONLAB_SOURCE_TEMPORAL_CONTRACT.inputFilter,
      dynamicAntighost:
        'ported from raw Three velocity; exact ToonLab encoded mobility ownership is unavailable',
      historyFilter: TOONLAB_SOURCE_TEMPORAL_CONTRACT.historyFilter,
      sourceCurrentFrameWeight: TOONLAB_SOURCE_TEMPORAL_CONTRACT.currentFrameWeight,
      historyResolve:
        'ToonLab Gen4 MainUpsampling High resolve; explicit WebGPU boundary gaps remain',
      jitter: 'ToonLab exact 8-sample Halton(2,3) temporal-upsample sequence',
      materialDither: 'ToonLab DitherTemporalAA exact graph and noise texture',
      method: 'AAM_TemporalAA / MainUpsampling',
      neighborhoodClamp: TOONLAB_SOURCE_TEMPORAL_CONTRACT.neighborhoodClamp,
      remainingBridges: Object.freeze([
        'ToonLab responsive-AA stencil classification (no stencil MRT is available)',
        'ToonLab encoded primitive mobility ownership; raw velocity only identifies actual motion',
        'ToonLab stochastic PF_FloatRGBA half quantization and exact half arithmetic',
        'generic pre-exposure changes (identity for frozen ToonLabShowcase exposure)',
        'per-instance fade values and evaluated LOD transitions from the source renderer',
      ]),
      r11g11b10History:
        'configured cvar=1 but inactive because quality High requires PF_FloatRGBA',
      runtimeResolveCurrentFrameWeight: TOONLAB_SOURCE_TEMPORAL_CONTRACT.currentFrameWeight,
      sequenceLength: this.sequenceLength,
      workingColorSpace: TOONLAB_SOURCE_TEMPORAL_CONTRACT.workingColorSpace,
    });
    this._writeSampleIndex();
  }

  _writeSampleIndex() {
    if (this.sourceState?.uniforms?.temporalSampleIndex) {
      this.sourceState.uniforms.temporalSampleIndex.value = this._jitterIndex;
    }
  }

  setViewOffset(width, height) {
    this.camera.updateProjectionMatrix();
    this._originalProjectionMatrix.copy(this.camera.projectionMatrix);
    this._velocityNode?.setProjectionMatrix(this._originalProjectionMatrix);
    this._writeSampleIndex();
    const jitter = computeToonLabSourceTaaJitter(this._jitterIndex, {
      sequenceLength: this.sequenceLength,
      temporalUpsampling: this.temporalUpsampling,
    });
    this.currentJitter.set(jitter[0], jitter[1]);
    this.camera.setViewOffset(width, height, jitter[0], jitter[1], width, height);
  }

  clearViewOffset() {
    this.camera.clearViewOffset();
    this._velocityNode?.setProjectionMatrix(null);
    this._jitterIndex = (this._jitterIndex + 1) % this.sequenceLength;
  }

  updateBefore(frame) {
    const beautyRenderTarget = this.beautyNode.isRTTNode
      ? this.beautyNode.renderTarget
      : this.beautyNode.passNode.renderTarget;
    const needsRestart = this._forceSourceHistoryReset
      || this._historyRenderTarget.width !== beautyRenderTarget.texture.width
      || this._historyRenderTarget.height !== beautyRenderTarget.texture.height;
    this._sourceCameraCut.value = needsRestart ? 1 : 0;
    super.updateBefore(frame);
    this._forceSourceHistoryReset = false;
  }

  setup(builder) {
    // Retain Three's render-target lifecycle, camera jitter hooks, and history
    // copy plumbing, then replace only its resolve graph with ToonLab's active
    // MainUpsampling / High permutation.
    const outputNode = super.setup(builder);
    const historyNode = texture(this._historyRenderTarget.texture);

    const rgbToYCoCg = (rgb) => vec3(
      dot(rgb, vec3(1, 2, 1)),
      dot(rgb, vec3(2, 0, -2)),
      dot(rgb, vec3(-1, 2, -1)),
    );
    const yCoCgToRgb = (yCoCg) => {
      const y = yCoCg.x.mul(0.25);
      const co = yCoCg.y.mul(0.25);
      const cg = yCoCg.z.mul(0.25);
      return vec3(y.add(co).sub(cg), y.add(cg), y.sub(co).sub(cg));
    };
    const spatialWeight = (delta) => {
      // At the authored 100% screen percentage UpscaleFactor and the adaptive
      // filter scale are both exactly one.
      const x2 = dot(delta, delta).clamp(0, 1);
      return x2.mul(0.905).sub(1.9).mul(x2).add(1);
    };

    const sampleHistoryCatmullRom = (inputUv, textureSize) => {
      const textureSizeF = vec2(textureSize);
      const inverseSize = textureSizeF.reciprocal();
      const minUv = inverseSize.mul(0.5);
      const maxUv = vec2(1).sub(minUv);
      const historyUv = inputUv.clamp(minUv, maxUv);
      const pixelCoord = historyUv.mul(textureSizeF);
      const iuv = floor(pixelCoord.sub(0.5)).add(1);
      const f = pixelCoord.sub(iuv);
      const f2 = f.mul(f);
      const uvOffset = float(1.25).sub(f2).mul(f).add(0.5);
      const t0 = vec2(
        f2.x.mul(0.25).sub(0.0625).mul(float(1.125).sub(f2.y.mul(0.5))),
        f2.y.mul(0.25).sub(0.0625).mul(float(1.125).sub(f2.x.mul(0.5))),
      );
      const doubledF = f.mul(2);
      const w0 = t0.sub(doubledF.mul(t0));
      const w3 = t0.add(doubledF.mul(t0));
      const centerUv = iuv.sub(0.5).mul(inverseSize);
      const uvDelta = uvOffset.mul(inverseSize);
      const sampleUvs = [
        centerUv.add(vec2(inverseSize.x.negate(), uvDelta.y)),
        centerUv.add(vec2(inverseSize.x.mul(2), uvDelta.y)),
        centerUv.add(uvDelta),
        centerUv.add(vec2(uvDelta.x, inverseSize.y.negate())),
        centerUv.add(vec2(uvDelta.x, inverseSize.y.mul(2))),
      ];
      const sampleWeights = [
        w0.x,
        w3.x,
        float(1).sub(w0.x).sub(w3.x).sub(w0.y).sub(w3.y),
        w0.y,
        w3.y,
      ];
      const result = vec4(0).toVar('toonLabTaaCatmullRomHistory');
      for (let index = 0; index < sampleUvs.length; index += 1) {
        result.addAssign(
          historyNode.sample(sampleUvs[index].clamp(minUv, maxUv))
            .mul(sampleWeights[index]),
        );
      }
      return result;
    };

    const resolve = Fn(() => {
      const uvNode = uv();
      const textureSize = this.beautyNode.size();
      const textureSizeF = vec2(textureSize);
      const maximumTexel = textureSize.sub(1);
      const clampTexel = (coord) => coord.clamp(ivec2(0), maximumTexel);

      // TemporalAA.usf MainUpsampling maps the output pixel center into the
      // jittered input grid. At 100% this still matters to all nine weights.
      const ppCo = uvNode.mul(textureSizeF).add(this._sourceTemporalJitter);
      const nearestPixel = floor(ppCo).toVar('toonLabTaaNearestPixel');
      const nearestTexel = clampTexel(ivec2(nearestPixel));
      const dKo = ppCo.sub(nearestPixel.add(0.5));

      const samples = TOONLAB_SOURCE_TAA_SAMPLE_OFFSETS.map(([x, y]) => {
        const texel = clampTexel(nearestTexel.add(ivec2(x, y)));
        return rgbToYCoCg(this.beautyNode.load(texel).rgb);
      });

      // Nine-tap current-frame reconstruction with ToonLab's HDR luma weighting.
      const filteredAccumulator = vec3(0).toVar('toonLabTaaFilteredAccumulator');
      const filteredWeight = float(0).toVar('toonLabTaaFilteredWeight');
      TOONLAB_SOURCE_TAA_SAMPLE_OFFSETS.forEach(([x, y], index) => {
        const delta = vec2(x, y).sub(dKo);
        const sampleSpatialWeight = spatialWeight(delta);
        const sampleHdrWeight = float(1).div(samples[index].x.add(4));
        const finalWeight = sampleSpatialWeight.mul(sampleHdrWeight);
        filteredAccumulator.addAssign(samples[index].mul(finalWeight));
        filteredWeight.addAssign(finalWeight);
      });
      const filtered = filteredAccumulator.div(max(filteredWeight, 1e-8));
      const filteredTemporalWeight = spatialWeight(dKo);

      // High-quality MainUpsampling uses the sample-distance box in YCoCg.
      // At 100% its distance threshold resolves to exactly 1.51 pixels.
      const neighborMinimum = samples[4].toVar('toonLabTaaNeighborMinimum');
      const neighborMaximum = samples[4].toVar('toonLabTaaNeighborMaximum');
      TOONLAB_SOURCE_TAA_SAMPLE_OFFSETS.forEach(([x, y], index) => {
        if (index === 4) return;
        const delta = vec2(x, y).sub(dKo);
        const isInside = dot(delta, delta).lessThan(1.51 ** 2);
        neighborMinimum.assign(isInside.select(
          min(neighborMinimum, samples[index]),
          neighborMinimum,
        ));
        neighborMaximum.assign(isInside.select(
          max(neighborMaximum, samples[index]),
          neighborMaximum,
        ));
      });

      // Use ToonLab's diagonal AA_CROSS=1 depth dilation to select a foreground
      // velocity tap. Three stores decoded NDC velocity directly.
      const closestTexel = nearestTexel.toVar('toonLabTaaClosestVelocityTexel');
      let centerDepth = this.depthNode.load(nearestTexel).r;
      if (builder.renderer.reversedDepthBuffer) centerDepth = centerDepth.oneMinus();
      const diagonalOffsets = [
        ivec2(-1, -1),
        ivec2(1, -1),
        ivec2(-1, 1),
        ivec2(1, 1),
      ];
      const diagonalTexels = diagonalOffsets.map((offset) => clampTexel(
        nearestTexel.add(offset),
      ));
      const diagonalDepths = diagonalTexels.map((texel) => {
        const rawDepth = this.depthNode.load(texel).r;
        return builder.renderer.reversedDepthBuffer
          ? rawDepth.oneMinus()
          : rawDepth;
      });
      // Preserve TemporalAA.usf's strict comparisons and +X/+Y tie break:
      // select the nearer diagonal in each row, then the nearer row.
      const topUsesLeft = diagonalDepths[0].lessThan(diagonalDepths[1]);
      const bottomUsesLeft = diagonalDepths[2].lessThan(diagonalDepths[3]);
      const topDepth = topUsesLeft.select(diagonalDepths[0], diagonalDepths[1]);
      const bottomDepth = bottomUsesLeft.select(diagonalDepths[2], diagonalDepths[3]);
      const topTexel = topUsesLeft.select(diagonalTexels[0], diagonalTexels[1]);
      const bottomTexel = bottomUsesLeft.select(diagonalTexels[2], diagonalTexels[3]);
      const usesTopRow = topDepth.lessThan(bottomDepth);
      const diagonalDepth = usesTopRow.select(topDepth, bottomDepth);
      const diagonalTexel = usesTopRow.select(topTexel, bottomTexel);
      If(diagonalDepth.lessThan(centerDepth), () => {
        closestTexel.assign(diagonalTexel);
      });
      const velocityNdc = this.velocityNode.load(closestTexel).xy;
      const historyUv = uvNode.sub(velocityNdc.mul(vec2(0.5, -0.5)));
      const offScreen = historyUv.lessThanEqual(0).any()
        .or(historyUv.greaterThanEqual(1).any());
      const rawHistory = sampleHistoryCatmullRom(historyUv, textureSize);
      const historyBeforeClamp = rgbToYCoCg(rawHistory.rgb);
      const clampedHistory = historyBeforeClamp
        .clamp(neighborMinimum, neighborMaximum)
        .toVar('toonLabTaaClampedHistory');

      // ToonLab's encoded velocity distinguishes movable ownership even at zero
      // motion. Three exposes decoded velocity only, so actual motion is the
      // strongest source-backed classifier available in this MRT.
      const velocityIsDynamic = (texel) => this.velocityNode.load(
        clampTexel(texel),
      ).xy.length().greaterThan(1e-8);
      const centerIsDynamic = velocityIsDynamic(nearestTexel);
      const anyCurrentDynamic = centerIsDynamic.toVar('toonLabTaaAnyCurrentDynamic');
      for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        anyCurrentDynamic.assign(anyCurrentDynamic.or(
          velocityIsDynamic(nearestTexel.add(ivec2(x, y))),
        ));
      }
      const ignoreHistory = offScreen
        .or(this._sourceCameraCut.greaterThan(0.5))
        .or(anyCurrentDynamic.not().and(rawHistory.a.greaterThan(0)));
      clampedHistory.assign(ignoreHistory.select(filtered, clampedHistory));

      // Exact active blend: .04 source current weight, velocity ramp to .2,
      // minimum luma-change contribution, then luma/HDR weighted lerp.
      const velocityPixels = velocityNdc.mul(textureSizeF).length();
      const motionAmount = velocityPixels.div(40).clamp(0, 1);
      const blendFinal = mix(
        filteredTemporalWeight.mul(TOONLAB_SOURCE_TEMPORAL_CONTRACT.currentFrameWeight),
        0.2,
        motionAmount,
      ).toVar('toonLabTaaBlendFinal');
      const lumaDifference = filtered.x.sub(historyBeforeClamp.x).abs();
      const minimumContribution = lumaDifference.lessThanEqual(1e-8).select(
        historyBeforeClamp.x.greaterThan(0).select(1, 0),
        historyBeforeClamp.x.mul(0.01).div(lumaDifference).clamp(0, 1),
      );
      blendFinal.assign(max(blendFinal, minimumContribution));
      blendFinal.assign(this._sourceCameraCut.greaterThan(0.5).select(
        1,
        blendFinal,
      ));

      const filteredHdrWeight = float(1).div(filtered.x.add(4));
      const historyHdrWeight = float(1).div(clampedHistory.x.add(4));
      const historyBlendWeight = blendFinal.oneMinus().mul(historyHdrWeight);
      const filteredBlendWeight = blendFinal.mul(filteredHdrWeight);
      const inverseBlendWeight = float(1).div(max(
        historyBlendWeight.add(filteredBlendWeight),
        1e-8,
      ));
      const resolvedYCoCg = clampedHistory.mul(historyBlendWeight)
        .add(filtered.mul(filteredBlendWeight))
        .mul(inverseBlendWeight);
      const resolvedRgb = yCoCgToRgb(resolvedYCoCg).max(0);

      // PF_FloatRGBA alpha carries ToonLab's current-center mobility bit for the
      // next frame's dynamic anti-ghosting decision.
      return vec4(resolvedRgb, centerIsDynamic.select(1, 0));
    });

    this._resolveMaterial.colorNode = resolve();
    this._resolveMaterial.needsUpdate = true;
    return outputNode;
  }

  reset(sampleIndex = 0) {
    this._jitterIndex = wrapIndex(sampleIndex, this.sequenceLength);
    this.currentJitter.set(0, 0);
    this._writeSampleIndex();
    // Force the inherited render-target lifecycle to seed history from the
    // next beauty buffer, matching ToonLab's history invalidation on a camera cut.
    this._forceSourceHistoryReset = true;
    this._sourceCameraCut.value = 1;
    this._historyRenderTarget.setSize(1, 1);
    return this;
  }
}

export function toonLabSourceTraa(beautyNode, depthNode, velocityNode, camera, options = {}) {
  return new ToonLabSourceTemporalAANode(
    convertToTexture(beautyNode),
    depthNode,
    velocityNode,
    camera,
    options,
  );
}
