import * as THREE from 'three';

export const TOONLAB_FRAME_OCCUPANCY_CONTRACT = Object.freeze({
  // The gate only answers "did the reconstruction draw image content?". It is
  // intentionally much looser than a visual-parity metric. A normal scene
  // frame clears these bounds by orders of magnitude, while an untouched
  // clear-color target cannot pass any of them.
  maximumDominantFraction: 0.995,
  minimumLumaRange: 8,
  minimumLumaStandardDeviation: 2,
  minimumRgbRange: 8,
  probeHeight: 54,
  probeWidth: 96,
  quantizationShift: 3,
  sampleFrames: 2,
});

function finiteByte(value) {
  const number = Number(value);
  return Number.isFinite(number) ? THREE.MathUtils.clamp(number, 0, 255) : 0;
}

/**
 * Reject a render that contains only its clear color (or another effectively
 * constant color). This is deliberately renderer-agnostic so the acceptance
 * behavior can be verified without a GPU.
 */
export function analyzeToonLabFrameOccupancy(
  pixels,
  width,
  height,
  {
    maximumDominantFraction = TOONLAB_FRAME_OCCUPANCY_CONTRACT
      .maximumDominantFraction,
    minimumLumaRange = TOONLAB_FRAME_OCCUPANCY_CONTRACT.minimumLumaRange,
    minimumLumaStandardDeviation = TOONLAB_FRAME_OCCUPANCY_CONTRACT
      .minimumLumaStandardDeviation,
    minimumRgbRange = TOONLAB_FRAME_OCCUPANCY_CONTRACT.minimumRgbRange,
    quantizationShift = TOONLAB_FRAME_OCCUPANCY_CONTRACT.quantizationShift,
  } = {},
) {
  const resolvedWidth = Math.max(0, Math.trunc(Number(width) || 0));
  const resolvedHeight = Math.max(0, Math.trunc(Number(height) || 0));
  const pixelCount = resolvedWidth * resolvedHeight;
  if (!pixels || pixelCount === 0 || pixels.length < pixelCount * 4) {
    return Object.freeze({
      exact: false,
      pixelCount,
      reason: 'missing-rgba-pixels',
    });
  }

  const buckets = new Map();
  const minimum = [255, 255, 255];
  const maximum = [0, 0, 0];
  let lumaMinimum = 255;
  let lumaMaximum = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const red = finiteByte(pixels[offset]);
    const green = finiteByte(pixels[offset + 1]);
    const blue = finiteByte(pixels[offset + 2]);
    const channels = [red, green, blue];
    for (let channel = 0; channel < 3; channel += 1) {
      minimum[channel] = Math.min(minimum[channel], channels[channel]);
      maximum[channel] = Math.max(maximum[channel], channels[channel]);
    }
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    lumaMinimum = Math.min(lumaMinimum, luma);
    lumaMaximum = Math.max(lumaMaximum, luma);
    lumaSum += luma;
    lumaSquareSum += luma * luma;

    // Ignore insignificant output-conversion dithering when identifying the
    // dominant clear color. Five bits per channel is still far more precise
    // than this binary occupancy decision requires.
    const key = [red, green, blue]
      .map((channel) => Math.trunc(channel) >> quantizationShift)
      .join(':');
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  let dominantPixelCount = 0;
  let dominantBucket = '';
  for (const [bucket, count] of buckets) {
    if (count > dominantPixelCount) {
      dominantBucket = bucket;
      dominantPixelCount = count;
    }
  }
  const lumaMean = lumaSum / pixelCount;
  const lumaVariance = Math.max(0, lumaSquareSum / pixelCount - lumaMean ** 2);
  const lumaStandardDeviation = Math.sqrt(lumaVariance);
  const lumaRange = lumaMaximum - lumaMinimum;
  const rgbRanges = maximum.map((value, channel) => value - minimum[channel]);
  const rgbRange = Math.max(...rgbRanges);
  const dominantFraction = dominantPixelCount / pixelCount;
  const gates = Object.freeze({
    dominantColor: dominantFraction <= maximumDominantFraction,
    lumaRange: lumaRange >= minimumLumaRange,
    lumaVariance: lumaStandardDeviation >= minimumLumaStandardDeviation,
    rgbRange: rgbRange >= minimumRgbRange,
  });
  const exact = Object.values(gates).every(Boolean);
  return Object.freeze({
    dominantBucket,
    dominantFraction,
    exact,
    gates,
    lumaMaximum,
    lumaMean,
    lumaMinimum,
    lumaRange,
    lumaStandardDeviation,
    lumaVariance,
    maximum: Object.freeze(maximum),
    minimum: Object.freeze(minimum),
    pixelCount,
    reason: exact ? 'image-content-present' : 'clear-color-or-near-constant-frame',
    rgbRange,
    rgbRanges: Object.freeze(rgbRanges),
  });
}

/**
 * Render the live reconstruction (including the active post chain) into a
 * small offscreen target and read back the final pixels. Keeping the regular
 * drawing-buffer size intact is important: scene/depth/temporal passes still
 * execute with their production dimensions, while only the final quad is
 * sampled at 96x54 for this binary gate.
 */
export async function verifyToonLabFrameOccupancy({
  renderer,
  render,
  height = TOONLAB_FRAME_OCCUPANCY_CONTRACT.probeHeight,
  sampleFrames = TOONLAB_FRAME_OCCUPANCY_CONTRACT.sampleFrames,
  warmupFrames = 1,
  width = TOONLAB_FRAME_OCCUPANCY_CONTRACT.probeWidth,
} = {}) {
  if (!renderer?.isWebGPURenderer || typeof renderer.readRenderTargetPixelsAsync !== 'function') {
    throw new TypeError('Frame occupancy verification requires an initialized WebGPURenderer.');
  }
  if (typeof render !== 'function') {
    throw new TypeError('Frame occupancy verification requires a render callback.');
  }

  const probe = new THREE.RenderTarget(width, height, {
    depthBuffer: false,
    format: THREE.RGBAFormat,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
  probe.texture.name = 'ToonLab comparison final-frame occupancy probe';
  const previousRenderTarget = renderer.getRenderTarget();
  const previousMrt = renderer.getMRT();

  try {
    // Render the real presentation target first. Several WebGPU post nodes
    // (TRAA and the authored Gaussian bloom in particular) allocate or bind
    // their internal render-target textures during their first live update.
    // Entering the tiny probe target before that update can compile a quad
    // against a still-null texture and fail before occupancy can be measured.
    // A successful production-frame warm-up is therefore part of the gate,
    // not a bypass of it: only after the exact active stack has rendered do we
    // repeat it into the readback target below.
    renderer.setRenderTarget(null);
    renderer.setMRT(null);
    for (let frame = 0; frame < Math.max(1, Math.trunc(warmupFrames)); frame += 1) {
      render();
    }

    // Allocate the probe explicitly after the production pass has initialized
    // every upstream texture. This removes backend-dependent lazy-allocation
    // ordering from the acceptance check itself.
    renderer.initRenderTarget(probe);
    renderer.setRenderTarget(probe);
    renderer.setMRT(null);
    for (let frame = 0; frame < Math.max(1, Math.trunc(sampleFrames)); frame += 1) {
      render();
    }
    const pixels = await renderer.readRenderTargetPixelsAsync(
      probe,
      0,
      0,
      width,
      height,
    );
    const report = analyzeToonLabFrameOccupancy(pixels, width, height);
    if (!report.exact) {
      const error = new Error(
        'The live reconstruction post output is an empty/near-constant frame: '
        + JSON.stringify(report),
      );
      error.name = 'ToonLabFrameOccupancyError';
      error.frameOccupancyReport = report;
      throw error;
    }
    return report;
  } finally {
    renderer.setRenderTarget(previousRenderTarget);
    renderer.setMRT(previousMrt);
    probe.dispose();
  }
}
