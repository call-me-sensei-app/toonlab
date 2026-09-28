import { Vector3 } from 'three';
import {
  Fn,
  float,
  floor,
  fract,
  ivec2,
  mix,
  normalWorld,
  reference,
  renderGroup,
  texture,
  vec2,
} from 'three/tsl';

const TOONLAB_CSM_DEPTH_BIAS = 10;
const TOONLAB_CSM_SLOPE_SCALE_DEPTH_BIAS = 3;
const TOONLAB_CSM_MAX_SLOPE_DEPTH_BIAS = 1;
const TOONLAB_CSM_RECEIVER_BIAS = 0.9;
const TOONLAB_MIN_TRANSITION_SIZE = 0.00001;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

/**
 * CPU translation of FProjectedShadowInfo::UpdateShaderDepthBias() and
 * ComputeTransitionSize() for a whole-scene directional cascade.
 *
 * `radius` and `subjectDepthRange` only need to use the same world unit. ToonLab
 * evaluates both in centimetres; their units cancel in the final normalized
 * shadow-map values, so ToonLab can pass metres without changing the result.
 */
export function computeToonLabDirectionalShadowBiasContract({
  cascadeBiasDistribution = 1,
  csmDepthBias = TOONLAB_CSM_DEPTH_BIAS,
  csmSlopeScaleDepthBias = TOONLAB_CSM_SLOPE_SCALE_DEPTH_BIAS,
  maxSlopeDepthBias = TOONLAB_CSM_MAX_SLOPE_DEPTH_BIAS,
  radius,
  receiverBias = TOONLAB_CSM_RECEIVER_BIAS,
  resolution,
  subjectDepthRange,
  userShadowBias = 0.5,
  userShadowSlopeBias = 0.5,
} = {}) {
  const safeRadius = Math.max(Number.EPSILON, finiteNumber(radius, 0));
  const safeRange = Math.max(Number.EPSILON, finiteNumber(subjectDepthRange, 0));
  const safeResolution = Math.max(1, finiteNumber(resolution, 1));
  const distribution = clamp(finiteNumber(cascadeBiasDistribution, 1), 0, 1);
  const depthBiasSetting = Math.max(0, finiteNumber(csmDepthBias, TOONLAB_CSM_DEPTH_BIAS));
  const userBias = Math.max(0, finiteNumber(userShadowBias, 0.5));
  const baseDepthBias = depthBiasSetting / safeRange;
  const worldSpaceTexelScale = safeRadius / safeResolution;
  const depthBias = Math.max(
    0,
    lerp(
      baseDepthBias,
      baseDepthBias * worldSpaceTexelScale,
      distribution,
    ) * userBias,
  );
  const slopeScaleDepthBias = Math.max(
    0,
    finiteNumber(csmSlopeScaleDepthBias, TOONLAB_CSM_SLOPE_SCALE_DEPTH_BIAS)
      * Math.max(0, finiteNumber(userShadowSlopeBias, 0.5)),
  );
  const transitionSize = Math.max(
    (baseDepthBias * worldSpaceTexelScale) * userBias,
    TOONLAB_MIN_TRANSITION_SIZE,
  );

  return {
    baseDepthBias,
    cascadeBiasDistribution: distribution,
    depthBias,
    maxSlopeDepthBias: Math.max(
      0,
      finiteNumber(maxSlopeDepthBias, TOONLAB_CSM_MAX_SLOPE_DEPTH_BIAS),
    ),
    radius: safeRadius,
    receiverBias: clamp(finiteNumber(receiverBias, TOONLAB_CSM_RECEIVER_BIAS), 0, 1),
    receiverTransitionFloor: 1 - clamp(
      finiteNumber(receiverBias, TOONLAB_CSM_RECEIVER_BIAS),
      0,
      1,
    ),
    resolution: safeResolution,
    slopeDepthBias: depthBias * slopeScaleDepthBias,
    slopeScaleDepthBias,
    subjectDepthRange: safeRange,
    transitionScale: 1 / transitionSize,
    transitionSize,
    userShadowBias: userBias,
    userShadowSlopeBias: Math.max(0, finiteNumber(userShadowSlopeBias, 0.5)),
    worldSpaceTexelScale,
  };
}

/** CPU copy of ComputeDepthBiasDirectionalSpot(), retained as a test oracle. */
export function computeToonLabDirectionalCasterDepthBias(noL, contract) {
  const absoluteNoL = Math.abs(finiteNumber(noL, 0));
  const maxSlope = Math.max(
    0,
    finiteNumber(contract?.maxSlopeDepthBias, TOONLAB_CSM_MAX_SLOPE_DEPTH_BIAS),
  );
  const slope = clamp(
    absoluteNoL > 0
      ? Math.sqrt(Math.max(0, 1 - absoluteNoL * absoluteNoL)) / absoluteNoL
      : maxSlope,
    0,
    maxSlope,
  );
  const constantDepthBias = Math.max(0, finiteNumber(contract?.depthBias, 0));
  const slopeDepthBias = Math.max(0, finiteNumber(contract?.slopeDepthBias, 0));
  return {
    constantDepthBias,
    slope,
    slopeBias: slopeDepthBias * slope,
    totalDepthBias: constantDepthBias + slopeDepthBias * slope,
  };
}

/** CPU copy of CalculateShadowVisibilityTransmittanceFactor() for opaque CSM. */
export function computeToonLabShadowVisibility({
  constantDepthBias = 0,
  reversedDepth = false,
  sceneDepth,
  shadowDepth,
  transitionScale,
} = {}) {
  const scene = finiteNumber(sceneDepth, 0);
  const stored = finiteNumber(shadowDepth, 0);
  const scale = Math.max(0, finiteNumber(transitionScale, 0));
  // Applying a uniform orthographic caster bias to the stored depth is
  // algebraically identical to applying it here to every receiver sample.
  const depthDelta = reversedDepth ? scene - stored : stored - scene;
  return clamp(
    (depthDelta + Math.max(0, finiteNumber(constantDepthBias, 0))) * scale + 1,
    0,
    1,
  );
}

/**
 * CPU oracle for ToonLab's quality-5 6x6 tent reconstruction. `samples` is six
 * rows of six already-compared visibility values, ordered left-to-right and
 * top-to-bottom. Its separable weights are [1-f, 1, 1, 1, 1, f].
 */
export function computeToonLabManual5x5Pcf(samples, fraction = [0, 0]) {
  if (!Array.isArray(samples) || samples.length !== 6
      || samples.some((row) => !Array.isArray(row) || row.length !== 6)) {
    throw new Error('ToonLab Manual5x5PCF requires a 6x6 visibility sample grid.');
  }
  const fractionX = clamp(finiteNumber(fraction?.[0], 0), 0, 1);
  const fractionY = clamp(finiteNumber(fraction?.[1], 0), 0, 1);
  const weightsX = [1 - fractionX, 1, 1, 1, 1, fractionX];
  const weightsY = [1 - fractionY, 1, 1, 1, 1, fractionY];
  let result = 0;
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      result += finiteNumber(samples[y][x], 0) * weightsX[x] * weightsY[y];
    }
  }
  return result * 0.04;
}

/**
 * Literal TSL translation of ToonLab ShadowFilteringCommon.ush:
 * Manual5x5PCF(), HorizontalPCF5x2(), and the opaque visibility function.
 * It deliberately uses nine raw gather4 reads, not hardware compare PCF.
 */
export const ToonLabManual5x5PcfShadowFilter = /* @__PURE__ */ Fn(({
  depthLayer,
  depthTexture,
  shadow,
  shadowCoord,
}, builder) => {
  const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup);
  const constantDepthBias = reference(
    'toonLabConstantDepthBias',
    'float',
    shadow,
  ).setGroup(renderGroup);
  const baseTransitionScale = reference(
    'toonLabTransitionScale',
    'float',
    shadow,
  ).setGroup(renderGroup);
  const receiverTransitionFloor = reference(
    'toonLabReceiverTransitionFloor',
    'float',
    shadow,
  ).setGroup(renderGroup);
  const lightDirectionToLight = reference(
    'toonLabLightDirectionToLight',
    'vec3',
    shadow,
  ).setGroup(renderGroup);

  const texelPosition = shadowCoord.xy.mul(mapSize).sub(0.5).toVar(
    'toonLabShadowTexelPosition',
  );
  const fraction = fract(texelPosition).toVar('toonLabShadowTexelFraction');
  const samplePosition = floor(texelPosition)
    .add(1)
    .div(mapSize)
    .toVar('toonLabShadowGatherPosition');
  const noL = normalWorld.dot(lightDirectionToLight).clamp(0, 1);
  const transitionScale = baseTransitionScale.mul(
    mix(receiverTransitionFloor, float(1), noL),
  );

  const visibility = (depths) => {
    const delta = builder.renderer.reversedDepthBuffer
      ? shadowCoord.z.sub(depths)
      : depths.sub(shadowCoord.z);
    return delta
      .add(constantDepthBias)
      .mul(transitionScale)
      .add(1)
      .clamp(0, 1);
  };
  const gatherVisibility = (x, y) => {
    const offsetLabel = (value) => value < 0 ? `m${-value}` : `p${value}`;
    let depths = texture(depthTexture, samplePosition)
      .offset(ivec2(x, y))
      .gather();
    if (depthTexture.isArrayTexture) depths = depths.depth(depthLayer);
    return visibility(depths).toVar(
      `toonLabShadowValues_${offsetLabel(x)}_${offsetLabel(y)}`,
    );
  };
  const horizontalPcf5x2 = (values0, values2, values4, suffix) => {
    const oneMinusX = fraction.x.oneMinus();
    const firstRow = values0.w.mul(oneMinusX)
      .add(values0.z)
      .add(values2.w)
      .add(values2.z)
      .add(values4.w)
      .add(values4.z.mul(fraction.x));
    const secondRow = values0.x.mul(oneMinusX)
      .add(values0.y)
      .add(values2.x)
      .add(values2.y)
      .add(values4.x)
      .add(values4.y.mul(fraction.x));
    return vec2(firstRow, secondRow).toVar(`toonLabShadowHorizontal_${suffix}`);
  };

  const values00 = gatherVisibility(-2, -2);
  const values20 = gatherVisibility(0, -2);
  const values40 = gatherVisibility(2, -2);
  const row0 = horizontalPcf5x2(values00, values20, values40, '0');
  const result = row0.x.mul(fraction.y.oneMinus())
    .add(row0.y)
    .toVar('toonLabShadowPcfResult');

  const values02 = gatherVisibility(-2, 0);
  const values22 = gatherVisibility(0, 0);
  const values42 = gatherVisibility(2, 0);
  const row1 = horizontalPcf5x2(values02, values22, values42, '1');
  result.addAssign(row1.x.add(row1.y));

  const values04 = gatherVisibility(-2, 2);
  const values24 = gatherVisibility(0, 2);
  const values44 = gatherVisibility(2, 2);
  const row2 = horizontalPcf5x2(values04, values24, values44, '2');
  result.addAssign(row2.x.add(row2.y.mul(fraction.y)));

  return result.mul(0.04);
});

/** Install the source filter and its uniforms on a Three LightShadow clone. */
export function applyToonLabDirectionalShadowFilterContract(shadow, contract) {
  if (!shadow) throw new Error('A Three LightShadow is required.');
  shadow.toonLabConstantDepthBias = Math.max(0, finiteNumber(contract?.depthBias, 0));
  shadow.toonLabTransitionScale = Math.max(
    0,
    finiteNumber(contract?.transitionScale, 0),
  );
  shadow.toonLabReceiverTransitionFloor = clamp(
    finiteNumber(contract?.receiverTransitionFloor, 0.1),
    0,
    1,
  );
  if (!shadow.toonLabLightDirectionToLight?.isVector3) {
    shadow.toonLabLightDirectionToLight = new Vector3(0, 1, 0);
  }
  shadow.toonLabSourceBiasContract = contract;
  shadow.toonLabSourceFilter = 'Manual5x5PCF';
  shadow.filterNode = ToonLabManual5x5PcfShadowFilter;
  return shadow;
}
