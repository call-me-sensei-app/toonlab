import {
  abs,
  asin,
  clamp,
  float,
  max,
  sign,
  sin,
  uniform,
} from 'three/tsl';
import { dof } from 'three/examples/jsm/tsl/display/DepthOfFieldNode.js';

export const TOONLAB_DOF_MAX_FOREGROUND_RADIUS = -0.025;
export const TOONLAB_DOF_MAX_BACKGROUND_RADIUS = 0.025;

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function field(serialized, name, fallback) {
  const match = String(serialized ?? '').match(
    new RegExp(`${name}:\\s*([-+]?\\d*\\.?\\d+(?:e[-+]?\\d+)?)`, 'i'),
  );
  return match ? finite(match[1], fallback) : fallback;
}

/**
 * Resolve the physical inputs written by UCineCameraComponent::UpdateCameraLens.
 * ToonLab works in centimetres internally; the public contract also exposes metres
 * for direct use with the glTF/Three scene.
 */
export function resolveToonLabSourceDepthOfFieldContract(cameraState = {}, {
  horizontalResolution = 1280,
} = {}) {
  const properties = cameraState.properties ?? cameraState;
  const renderingAspectRatio = Math.max(
    finite(properties.aspect_ratio, 16 / 9),
    1e-6,
  );
  const sensorWidthMm = Math.max(
    field(properties.filmback, 'sensor_width', 23.76),
    1e-6,
  );
  const sensorHeightMm = Math.max(
    field(properties.filmback, 'sensor_height', sensorWidthMm / renderingAspectRatio),
    1e-6,
  );
  const squeezeFactor = Math.max(
    field(properties.lens_settings, 'squeeze_factor', 1),
    0.1,
  );
  const fieldOfViewDegrees = finite(properties.field_of_view, 65.0972900390625);
  const verticalHalfFov = Math.atan(
    Math.tan(fieldOfViewDegrees * Math.PI / 360) / renderingAspectRatio,
  );
  const sensorHeightCm = sensorHeightMm * 0.1;
  const sensorWidthCm = sensorWidthMm * 0.1;
  // DiaphragmDOFUtils.cpp deliberately reconstructs focal length from the
  // sensor height and vertical projection, rather than trusting camera metadata.
  const verticalFocalLengthCm = 0.5 * sensorHeightCm / Math.tan(verticalHalfFov);
  const focusDistanceCm = Math.max(
    field(properties.focus_settings, 'manual_focus_distance', 0),
    0,
  );
  const fStop = Math.max(finite(properties.current_aperture, 0), 0);
  let infinityBackgroundCocRadius = 0;
  if (fStop > 0 && focusDistanceCm > verticalFocalLengthCm) {
    const verticalDiameterCm = verticalFocalLengthCm ** 2
      / (fStop * (focusDistanceCm - verticalFocalLengthCm));
    const uncroppedVerticalRadius = verticalDiameterCm * 0.5 / sensorHeightCm;
    const desqueezedAspectRatio = sensorWidthCm / sensorHeightCm * squeezeFactor;
    const verticalRadius = uncroppedVerticalRadius * Math.max(
      renderingAspectRatio / desqueezedAspectRatio,
      1,
    );
    infinityBackgroundCocRadius = verticalRadius / renderingAspectRatio;
  }
  return {
    bladeCount: Math.min(Math.max(
      Math.trunc(field(properties.lens_settings, 'diaphragm_blade_count', 5)),
      4,
    ), 16),
    engine: 'ToonLab DiaphragmDOF',
    fStop,
    fieldOfViewDegrees,
    focusDistanceCm,
    focusDistanceMeters: focusDistanceCm * 0.01,
    horizontalResolution: Math.max(Math.trunc(finite(horizontalResolution, 1280)), 1),
    infinityBackgroundCocRadius,
    infinityBackgroundCocRadiusPixels:
      Math.max(Math.trunc(finite(horizontalResolution, 1280)), 1)
      * Math.min(infinityBackgroundCocRadius, TOONLAB_DOF_MAX_BACKGROUND_RADIUS),
    maxBackgroundCocRadius: TOONLAB_DOF_MAX_BACKGROUND_RADIUS,
    maxForegroundCocRadius: TOONLAB_DOF_MAX_FOREGROUND_RADIUS,
    maxKernelRadiusPixels: Math.max(finite(horizontalResolution, 1280), 1)
      * TOONLAB_DOF_MAX_BACKGROUND_RADIUS,
    renderingAspectRatio,
    sensorHeightMm,
    sensorWidthMm,
    squeezeFactor,
    verticalFocalLengthMm: verticalFocalLengthCm * 10,
  };
}

/** Exact active ToonLab physical CoC equation, without inactive depth blur/offset. */
export function evaluateToonLabSourceCocRadius(sceneDepthMeters, contract) {
  const depth = Math.max(finite(sceneDepthMeters, 0), 1e-8);
  const initial = ((depth - contract.focusDistanceMeters) / depth)
    * contract.infinityBackgroundCocRadius;
  return Math.min(Math.max(
    initial,
    contract.maxForegroundCocRadius,
  ), contract.maxBackgroundCocRadius);
}

/** Inverse of GLSL smoothstep(0, 1, x), used to feed Three's blur backend. */
export function inverseSmoothstep(value) {
  const y = Math.min(Math.max(finite(value, 0), 0), 1);
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);
}

/**
 * Uses ToonLab's exact physical CoC and clamp with Three's existing gather backend.
 * The gather/scatter, bokeh blade, half-resolution and compositing differences
 * remain explicit renderer bridges; this function does not claim those match.
 */
export function createToonLabSourceDepthOfFieldNode(
  inputNode,
  viewZNode,
  contract,
) {
  const focusDistance = uniform(contract.focusDistanceMeters);
  const infinityRadius = uniform(contract.infinityBackgroundCocRadius);
  const maxRadius = float(contract.maxBackgroundCocRadius);
  const sceneDepth = max(viewZNode.negate(), 1e-8);
  const cocRadius = clamp(
    sceneDepth.sub(focusDistance).div(sceneDepth).mul(infinityRadius),
    contract.maxForegroundCocRadius,
    contract.maxBackgroundCocRadius,
  );
  const normalizedCoc = abs(cocRadius).div(maxRadius);
  const inverse = float(0.5).sub(sin(
    asin(float(1).sub(normalizedCoc.mul(2))).div(3),
  ));
  // DepthOfFieldNode reconstructs `signedDist = -viewZ - focusDistance`.
  // Encoding inverse-smoothstep here makes its resulting CoC exactly equal
  // to abs(ToonLab physical CoC / 0.025), including foreground/far classification.
  const encodedViewZ = sign(cocRadius).mul(inverse).negate();
  const kernelRadiusPixels = uniform(contract.maxKernelRadiusPixels);
  const node = dof(inputNode, encodedViewZ, 0, 1, kernelRadiusPixels);
  node.toonLabContract = contract;
  node.toonLabUniforms = {
    focusDistance,
    infinityRadius,
    kernelRadiusPixels,
  };
  node.toonLabRemainingBridges = Object.freeze([
    'ToonLab DiaphragmDOF gather/scatter classification and dilation',
    'ToonLab energy-conserving authored blade shape and squeeze',
    'ToonLab half-resolution tile flattening and temporal stability',
    'ToonLab foreground hole filling and translucency scheduling',
  ]);
  return node;
}
