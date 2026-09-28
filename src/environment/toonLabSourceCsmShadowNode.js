import {
  Matrix4,
  Vector3,
} from 'three';
import {
  Fn,
  If,
  float,
  mix,
  positionView,
  reference,
  renderGroup,
  vec4,
} from 'three/tsl';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import {
  applyToonLabDirectionalShadowFilterContract,
  computeToonLabDirectionalShadowBiasContract,
} from './toonLabSourceShadowFilter.js';

const _lightDirection = new Vector3();
const _lightOrientation = new Matrix4();
const _lightOrientationInverse = new Matrix4();
const _parentWorldInverse = new Matrix4();
const _cascadeCenterView = new Vector3();
const _cascadeCenterLocal = new Vector3();
const _cascadeCenterLight = new Vector3();
const _snappedCenterLocal = new Vector3();
const _receiverLightDirection = new Vector3();
const _up = new Vector3(0, 1, 0);

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

/**
 * CPU translation of FDirectionalLightSceneProxy::GetShadowSplitBoundsDepthRange.
 * The frustum vertices are Three view-space metres; ToonLab performs the same math
 * in centimetres, then rounds the final radius up to a whole centimetre.
 */
export function computeToonLabStableCascadeSphere({
  farVertices,
  nearVertices,
  projectionMatrix,
}) {
  if (!nearVertices?.length || !farVertices?.length || !projectionMatrix?.elements) {
    throw new Error('ToonLab cascade fitting requires near/far vertices and a projection matrix.');
  }

  const splitNear = Math.abs(nearVertices[0].z);
  const splitFar = Math.abs(farVertices[0].z);
  const frustumLength = Math.max(Number.EPSILON, splitFar - splitNear);
  const projection = projectionMatrix.elements;
  const tanHalfFovX = 1 / Math.abs(projection[0]);
  const tanHalfFovY = 1 / Math.abs(projection[5]);
  const farX = tanHalfFovX * splitFar;
  const farY = tanHalfFovY * splitFar;
  const nearX = tanHalfFovX * splitNear;
  const nearY = tanHalfFovY * splitNear;
  const farDiagonalSquared = farX * farX + farY * farY;
  const nearDiagonalSquared = nearX * nearX + nearY * nearY;
  const optimalOffset = (
    (nearDiagonalSquared - farDiagonalSquared) / (2 * frustumLength)
    + frustumLength * 0.5
  );
  const centerDepth = clamp(splitFar - optimalOffset, splitNear, splitFar);
  const center = new Vector3(0, 0, -centerDepth);
  let radiusSquared = 0;

  for (const vertex of [...nearVertices, ...farVertices]) {
    radiusSquared = Math.max(radiusSquared, vertex.distanceToSquared(center));
  }

  // ToonLab clamps to at least one centimetre and then CeilToFloat()s the sphere
  // radius before building the whole-scene shadow initializer.
  const radius = Math.ceil(Math.max(Math.sqrt(radiusSquared), 0.01) * 100) / 100;

  return {
    center,
    centerDepth,
    radius,
    splitFar,
    splitNear,
  };
}

/** ToonLab snaps in normalized shadow space by 2 * MaxDownsampleFactor / resolution. */
export function computeToonLabShadowSnapPeriod(
  radiusMeters,
  resolution,
  maxDownsampleFactor = 4,
) {
  const radius = Math.max(0.01, finiteNumber(radiusMeters, 0.01));
  const size = Math.max(1, Math.round(finiteNumber(resolution, 1)));
  const downsample = Math.max(1, Math.round(finiteNumber(maxDownsampleFactor, 4)));
  return (2 * downsample * radius) / size;
}

/**
 * ToonLab allocates classic Metal CSMs with a four-texel border inside the
 * r.Shadow.MaxCSMResolution physical target. ResolutionX/Y and all bias/snap
 * formulas use the interior size; ShadowBufferSize used by PCF is physical.
 */
export function computeToonLabShadowMapLayout(
  physicalResolution,
  borderTexels = 4,
) {
  const physical = Math.max(1, Math.round(finiteNumber(physicalResolution, 1)));
  const border = clamp(
    Math.round(finiteNumber(borderTexels, 4)),
    0,
    Math.max(0, Math.floor((physical - 1) / 2)),
  );
  const interior = Math.max(1, physical - border * 2);
  return {
    border,
    boundsScale: physical / interior,
    interior,
    physical,
    projectionScale: interior / physical,
  };
}

/**
 * Resolve ToonLab's raster-cascade fade extension in metres. The final raster
 * cascade is extended too when a distance-field cascade follows it.
 */
export function computeToonLabCascadeRange({
  splitFar,
  splitNear,
  transitionFraction = 0.1,
  extendsToAnotherCascade = false,
}) {
  const near = Math.max(0, finiteNumber(splitNear, 0));
  const far = Math.max(near, finiteNumber(splitFar, near));
  const fraction = Math.max(0, finiteNumber(transitionFraction, 0.1));
  const extension = extendsToAnotherCascade
    ? (far - near) * fraction
    : 0;
  return {
    splitNear: near,
    splitFar: far,
    extendedFar: far + extension,
    extension,
  };
}

/**
 * CSM implementation using ToonLab's stable-sphere fit, centimetre rounding,
 * four-texel stabilization period, ten-percent cascade overlap, and ±50 m
 * minimum subject-depth extent, quality-5 Manual5x5PCF receiver filter, soft
 * visibility transition, and the uniform part of ToonLab's cascade raster bias.
 *
 * The constant orthographic caster bias is algebraically moved into the
 * receiver comparison. ToonLab's caster-normal slope term still has to run while
 * writing the shadow map and remains an explicit renderer gap; applying a
 * receiver normal offset would not be the same algorithm.
 */
export class ToonLabSourceCsmShadowNode extends CSMShadowNode {
  constructor(light, data = {}) {
    super(light, data);
    this.transitionFraction = Math.max(
      0,
      finiteNumber(data.transitionFraction, 0.1),
    );
    this.hasDistanceFieldContinuation = data.hasDistanceFieldContinuation === true;
    this.maxDownsampleFactor = Math.max(
      1,
      Math.round(finiteNumber(data.maxDownsampleFactor, 4)),
    );
    this.shadowBorderTexels = Math.max(
      0,
      Math.round(finiteNumber(data.shadowBorderTexels, 4)),
    );
    this.minimumDepthExtent = Math.max(
      0.01,
      finiteNumber(data.minimumDepthExtent, 50),
    );
    this.cascadeBiasDistribution = clamp(
      finiteNumber(data.cascadeBiasDistribution, 1),
      0,
      1,
    );
    this.csmDepthBias = Math.max(0, finiteNumber(data.csmDepthBias, 10));
    this.csmSlopeScaleDepthBias = Math.max(
      0,
      finiteNumber(data.csmSlopeScaleDepthBias, 3),
    );
    this.maxSlopeDepthBias = Math.max(
      0,
      finiteNumber(data.maxSlopeDepthBias, 1),
    );
    this.receiverBias = clamp(finiteNumber(data.receiverBias, 0.9), 0, 1);
    this.userShadowBias = Math.max(
      0,
      finiteNumber(data.userShadowBias, 0.5),
    );
    this.userShadowSlopeBias = Math.max(
      0,
      finiteNumber(data.userShadowSlopeBias, 0.5),
    );
    this.useToonLabReceiverFilter = data.useToonLabReceiverFilter !== false;
    this._cascadeFits = [];
    this._cascadeRanges = [];
    this._shadowContracts = [];
    this._shadowLayouts = [];
  }

  _updateShadowBounds() {
    const projectionMatrix = this.camera.projectionMatrix;

    for (let index = 0; index < this.frustums.length; index += 1) {
      const frustum = this.frustums[index];
      const nearDepth = Math.abs(frustum.vertices.near[0].z);
      const baseFarDepth = Math.abs(frustum.vertices.far[0].z);
      const extendsToAnotherCascade = (
        index < this.frustums.length - 1
        || this.hasDistanceFieldContinuation
      );
      const range = computeToonLabCascadeRange({
        splitFar: baseFarDepth,
        splitNear: nearDepth,
        transitionFraction: this.transitionFraction,
        extendsToAnotherCascade,
      });
      const extendedFarDepth = range.extendedFar;

      if (extendedFarDepth > baseFarDepth) {
        const scale = extendedFarDepth / Math.max(Number.EPSILON, baseFarDepth);
        for (const vertex of frustum.vertices.far) vertex.multiplyScalar(scale);
      }

      const fit = computeToonLabStableCascadeSphere({
        farVertices: frustum.vertices.far,
        nearVertices: frustum.vertices.near,
        projectionMatrix,
      });
      const shadowCamera = this.lights[index].shadow.camera;
      const layoutX = computeToonLabShadowMapLayout(
        this.lights[index].shadow.mapSize.width,
        this.shadowBorderTexels,
      );
      const layoutY = computeToonLabShadowMapLayout(
        this.lights[index].shadow.mapSize.height,
        this.shadowBorderTexels,
      );
      shadowCamera.left = -fit.radius * layoutX.boundsScale;
      shadowCamera.right = fit.radius * layoutX.boundsScale;
      shadowCamera.top = fit.radius * layoutY.boundsScale;
      shadowCamera.bottom = -fit.radius * layoutY.boundsScale;
      shadowCamera.updateProjectionMatrix();

      const depthExtent = Math.max(fit.radius, this.minimumDepthExtent);
      const shadowContract = computeToonLabDirectionalShadowBiasContract({
        cascadeBiasDistribution: this.cascadeBiasDistribution,
        csmDepthBias: this.csmDepthBias,
        csmSlopeScaleDepthBias: this.csmSlopeScaleDepthBias,
        maxSlopeDepthBias: this.maxSlopeDepthBias,
        radius: fit.radius,
        receiverBias: this.receiverBias,
        resolution: layoutX.interior,
        subjectDepthRange: depthExtent * 2,
        userShadowBias: this.userShadowBias,
        userShadowSlopeBias: this.userShadowSlopeBias,
      });
      if (this.useToonLabReceiverFilter) {
        applyToonLabDirectionalShadowFilterContract(
          this.lights[index].shadow,
          shadowContract,
        );
      } else {
        // Diagnostic only: retain ToonLab's cascade fit while asking Three to
        // perform its stock depth comparison/filter. This keeps projection
        // errors separable from receiver-filter errors in the parity harness.
        this.lights[index].shadow.filterNode = null;
        this.lights[index].shadow.toonLabSourceFilter = 'Three diagnostic';
        if (!this.lights[index].shadow.toonLabLightDirectionToLight?.isVector3) {
          this.lights[index].shadow.toonLabLightDirectionToLight = new Vector3(0, 1, 0);
        }
      }

      this._cascadeFits[index] = fit;
      this._shadowContracts[index] = shadowContract;
      this._shadowLayouts[index] = {
        x: layoutX,
        y: layoutY,
      };
      this._cascadeRanges[index] = new Vector3(
        range.splitNear,
        range.splitFar,
        extendedFarDepth,
      );
    }
  }

  _setupToonLabTransitions() {
    const ranges = reference('_cascadeRanges', 'vec3', this)
      .setGroup(renderGroup)
      .setName('toonLabCascadeRanges');
    const pixelDepth = positionView.z.negate().toVar('toonLabPixelDepthMeters');
    const lastCascade = this.cascades - 1;

    return Fn((builder) => {
      this.setupShadowPosition(builder);
      const result = vec4(1, 1, 1, 1).toVar('toonLabCsmShadowValue');

      for (let index = 0; index < this.cascades; index += 1) {
        const range = ranges.element(index);
        const inBaseRange = pixelDepth
          .greaterThanEqual(range.x)
          .and(pixelDepth.lessThanEqual(range.y));
        let shadowValue = this._shadowNodes[index];

        if (index > 0) {
          const previousRange = ranges.element(index - 1);
          const transitionLength = previousRange.z
            .sub(range.x)
            .max(float(Number.EPSILON));
          const transitionRatio = pixelDepth
            .sub(range.x)
            .div(transitionLength)
            .clamp(0, 1);
          const transitionValue = mix(
            this._shadowNodes[index - 1],
            shadowValue,
            transitionRatio,
          );
          shadowValue = pixelDepth.lessThanEqual(previousRange.z)
            .select(transitionValue, shadowValue);
        }

        If(inBaseRange, () => {
          result.assign(shadowValue);
        });
      }

      const lastRange = ranges.element(lastCascade);
      const inFinalExtension = pixelDepth
        .greaterThan(lastRange.y)
        .and(pixelDepth.lessThanEqual(lastRange.z));
      const finalLength = lastRange.z.sub(lastRange.y).max(float(Number.EPSILON));
      const finalRatio = pixelDepth
        .sub(lastRange.y)
        .div(finalLength)
        .clamp(0, 1);
      If(inFinalExtension, () => {
        result.assign(mix(this._shadowNodes[lastCascade], vec4(1), finalRatio));
      });

      return result;
    })();
  }

  setup(builder) {
    if (this.camera === null) this._init(builder);
    return this._setupToonLabTransitions();
  }

  updateBefore() {
    const { camera, light } = this;
    const parent = light.parent;
    if (!parent || !camera) return;

    parent.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    for (const cascadeLight of this.lights) {
      if (cascadeLight.parent === null) {
        parent.add(cascadeLight.target);
        parent.add(cascadeLight);
      }
    }

    _lightDirection.subVectors(light.target.position, light.position).normalize();
    _receiverLightDirection
      .copy(_lightDirection)
      .transformDirection(parent.matrixWorld)
      .negate();
    _lightOrientation.lookAt(light.position, light.target.position, _up);
    _lightOrientationInverse.copy(_lightOrientation).invert();
    _parentWorldInverse.copy(parent.matrixWorld).invert();

    for (let index = 0; index < this.frustums.length; index += 1) {
      const fit = this._cascadeFits[index];
      const cascadeLight = this.lights[index];
      const shadowCamera = cascadeLight.shadow.camera;
      if (!fit) continue;

      _cascadeCenterView.copy(fit.center);
      _cascadeCenterLocal
        .copy(_cascadeCenterView)
        .applyMatrix4(camera.matrixWorld)
        .applyMatrix4(_parentWorldInverse);
      _cascadeCenterLight
        .copy(_cascadeCenterLocal)
        .applyMatrix4(_lightOrientationInverse);

      const snapX = computeToonLabShadowSnapPeriod(
        fit.radius,
        this._shadowLayouts[index].x.interior,
        this.maxDownsampleFactor,
      );
      const snapY = computeToonLabShadowSnapPeriod(
        fit.radius,
        this._shadowLayouts[index].y.interior,
        this.maxDownsampleFactor,
      );
      // JS remainder has the same sign behavior as FMath::Fmod.
      _cascadeCenterLight.x -= _cascadeCenterLight.x % snapX;
      _cascadeCenterLight.y -= _cascadeCenterLight.y % snapY;
      _snappedCenterLocal
        .copy(_cascadeCenterLight)
        .applyMatrix4(_lightOrientation);

      const depthExtent = Math.max(fit.radius, this.minimumDepthExtent);
      cascadeLight.position
        .copy(_snappedCenterLocal)
        .addScaledVector(_lightDirection, -depthExtent);
      cascadeLight.target.position.copy(_snappedCenterLocal);
      // ToonLab's clamped directional subject interval is symmetric around the
      // snapped cascade center. Positioning the light at -extent means that
      // interval maps exactly to a zero-to-2*extent orthographic depth range.
      shadowCamera.near = 0;
      shadowCamera.far = depthExtent * 2;
      shadowCamera.updateProjectionMatrix();
      cascadeLight.shadow.toonLabLightDirectionToLight
        .copy(_receiverLightDirection);
    }
  }
}
