// Amortized cloud reconstruction.
//
// The history grid is screen / historyDiv. The expensive cloud source is a
// further 4x smaller on each axis, so one source texel supplies one fresh pixel
// in each 4x4 history block per frame. A Bayer permutation visits all sixteen
// sub-pixels. The other fifteen carry Catmull-Rom-filtered history reprojected at
// the nearest first-hit distance in a 3x3 history neighbourhood.

import * as THREE from 'three';
import { NodeMaterial, QuadMesh, RenderTarget } from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  bool,
  clamp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  mrt,
  property,
  saturate,
  screenUV,
  select,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export const CLOUD_AMORTIZATION_BLOCK = 4;
export const CLOUD_HISTORY_WARMUP_FRAMES = 16;
export const CLOUD_HISTORY_FRESH_BLEND = 0.75;
export const CLOUD_HISTORY_STALE_BLEND = 0;
export const CLOUD_HISTORY_CLAMP_RADIUS = 1;
export const CLOUD_HISTORY_CUT_DISTANCE = 250;
export const CLOUD_HISTORY_CUT_COSINE = 0.985;
export const CLOUD_HISTORY_FAR_DEPTH = 65000;

export const CLOUD_HIT_DISTANCE_MAX = 60000;
export const CLOUD_HIT_DISTANCE_MISS_THRESHOLD = 64000;
export const CLOUD_HIT_DISTANCE_MISS = 65000;

const REJECT_THRESHOLD = 0.15;
const FRESH_HISTORY_WEIGHT_NEAR = 0.25;
const FRESH_HISTORY_WEIGHT_FAR = 0.65;
const FRESH_RETAIN_DISTANCE_NEAR = 8000;
const FRESH_RETAIN_DISTANCE_FAR = 30000;
const SUB_TEXEL_DISPLACEMENT = 0.5;
const MIN_CARRIED_DISTANCE = 1;
const DILATION_IGNORE = 1e9;
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;

const BAYER_4X4_CELLS = Object.freeze([
  Object.freeze([0, 0]), Object.freeze([2, 2]),
  Object.freeze([2, 0]), Object.freeze([0, 2]),
  Object.freeze([1, 1]), Object.freeze([3, 3]),
  Object.freeze([3, 1]), Object.freeze([1, 3]),
  Object.freeze([1, 0]), Object.freeze([3, 2]),
  Object.freeze([3, 0]), Object.freeze([1, 2]),
  Object.freeze([0, 1]), Object.freeze([2, 3]),
  Object.freeze([2, 1]), Object.freeze([0, 3]),
]);

export function cloudHistoryWarmupFrames() {
  return CLOUD_HISTORY_WARMUP_FRAMES;
}

/** Inverse-Bayer order shared by the march and temporal resolve. */
export function cloudHistoryJitterOffsets() {
  return BAYER_4X4_CELLS;
}

function createMrtTarget(width, height, name, distanceName) {
  const target = new RenderTarget(width, height, {
    count: 2,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  const color = target.textures[0];
  color.name = 'output';
  color.colorSpace = THREE.NoColorSpace;
  color.wrapS = THREE.ClampToEdgeWrapping;
  color.wrapT = THREE.ClampToEdgeWrapping;

  const distance = target.textures[1];
  distance.name = distanceName;
  distance.format = THREE.RGFormat;
  distance.type = THREE.HalfFloatType;
  distance.minFilter = THREE.NearestFilter;
  distance.magFilter = THREE.NearestFilter;
  distance.generateMipmaps = false;
  distance.colorSpace = THREE.NoColorSpace;
  distance.wrapS = THREE.ClampToEdgeWrapping;
  distance.wrapT = THREE.ClampToEdgeWrapping;

  target.name = name;
  return target;
}

/** Five bilinear taps approximating a separable 4x4 Catmull-Rom filter. */
function sampleCatmullRom5(textureNode, coord, textureSize) {
  const samplePosition = coord.mul(textureSize);
  const centerTexel = floor(samplePosition.sub(0.5)).add(0.5).toVar();
  const fractional = samplePosition.sub(centerTexel).toVar();

  const weight0 = fractional
    .mul(fractional.mul(fractional.mul(-0.5).add(1)).add(-0.5))
    .toVar();
  const weight1 = fractional
    .mul(fractional)
    .mul(fractional.mul(1.5).sub(2.5))
    .add(1)
    .toVar();
  const weight2 = fractional
    .mul(fractional.mul(fractional.mul(-1.5).add(2)).add(0.5))
    .toVar();
  const weight3 = fractional
    .mul(fractional)
    .mul(fractional.mul(0.5).sub(0.5))
    .toVar();

  const weight12 = weight1.add(weight2).toVar();
  const offset12 = weight2.div(weight12).toVar();
  const uv0 = centerTexel.sub(1).div(textureSize).toVar();
  const uv3 = centerTexel.add(2).div(textureSize).toVar();
  const uv12 = centerTexel.add(offset12).div(textureSize).toVar();

  const result = textureNode.sample(vec2(uv12.x, uv0.y))
    .mul(weight12.x.mul(weight0.y))
    .add(textureNode.sample(vec2(uv0.x, uv12.y)).mul(weight0.x.mul(weight12.y)))
    .add(textureNode.sample(vec2(uv12.x, uv12.y)).mul(weight12.x.mul(weight12.y)))
    .add(textureNode.sample(vec2(uv3.x, uv12.y)).mul(weight3.x.mul(weight12.y)))
    .add(textureNode.sample(vec2(uv12.x, uv3.y)).mul(weight12.x.mul(weight3.y)));
  const weightSum = weight12.x.mul(weight0.y)
    .add(weight0.x.mul(weight12.y))
    .add(weight12.x.mul(weight12.y))
    .add(weight3.x.mul(weight12.y))
    .add(weight12.x.mul(weight3.y));
  return result.div(weightSum);
}

export function createCloudReprojection({
  cloudVolume = null,
  cloudMaterial = cloudVolume?.material ?? null,
  cloudUniforms = cloudVolume?.uniforms ?? null,
  shape,
  wind = null,
  fade = null,
  historyDiv = 2,
  width = 1,
  height = 1,
  groundLevel = undefined,
  name = 'ToonLabCloudHistory',
} = {}) {
  void fade;
  if (!cloudMaterial?.isMaterial) {
    throw new TypeError('createCloudReprojection needs the cloud pass material.');
  }
  if (!cloudUniforms?.pixelJitter || !cloudUniforms?.marchJitter) {
    throw new TypeError('createCloudReprojection needs the cloud pass uniforms.');
  }
  if (!shape?.altitude || !shape?.thickness) {
    throw new TypeError('createCloudReprojection needs a cloud shape param group.');
  }

  const div = Math.max(1, Math.round(Number(historyDiv) || 1));
  const sourceDiv = div * CLOUD_AMORTIZATION_BLOCK;
  const jitterOffsets = cloudHistoryJitterOffsets();
  const warmupFrames = cloudHistoryWarmupFrames();

  let fullWidth = Math.max(1, Math.round(Number(width) || 1));
  let fullHeight = Math.max(1, Math.round(Number(height) || 1));
  let historyWidth = Math.max(1, Math.ceil(fullWidth / div));
  let historyHeight = Math.max(1, Math.ceil(fullHeight / div));
  let lowWidth = Math.max(1, Math.ceil(fullWidth / sourceDiv));
  let lowHeight = Math.max(1, Math.ceil(fullHeight / sourceDiv));

  const marchTarget = createMrtTarget(lowWidth, lowHeight, `${name}March`, 'rayHitDist');
  let historyRead = createMrtTarget(historyWidth, historyHeight, `${name}A`, 'hitDistHistory');
  let historyWrite = createMrtTarget(historyWidth, historyHeight, `${name}B`, 'hitDistHistory');

  const groundLevelUniform = cloudUniforms.groundLevel?.isUniformNode
    ? cloudUniforms.groundLevel
    : uniform(0);
  const requestedGroundLevel = Number(groundLevel);
  if (groundLevel !== undefined && groundLevel !== null
    && Number.isFinite(requestedGroundLevel)) {
    groundLevelUniform.value = requestedGroundLevel;
  }

  const uniforms = {
    cameraPosition: uniform(new THREE.Vector3()),
    previousCameraPosition: uniform(new THREE.Vector3()),
    historyValid: uniform(0),
    cameraStatic: uniform(1),
    windDelta: uniform(new THREE.Vector3()),
    sourceSize: uniform(new THREE.Vector2(lowWidth, lowHeight)),
    historySize: uniform(new THREE.Vector2(historyWidth, historyHeight)),
    freshSlot: uniform(new THREE.Vector2()),
    previousViewProjection: uniform(new THREE.Matrix4()),
    rayBasis: uniform(new THREE.Matrix3()),
    groundLevel: groundLevelUniform,
  };

  const marchTexture = texture(marchTarget.textures[0]);
  const marchDistanceTexture = texture(marchTarget.textures[1]);
  const historyTexture = texture(historyRead.textures[0]);
  const historyDistanceTexture = texture(historyRead.textures[1]);
  const temporalHitDistance = property('float', 'toonlabTemporalHitDistance');
  const temporalSceneDistance = property('float', 'toonlabTemporalSceneDistance');

  const resolveMaterial = new NodeMaterial();
  resolveMaterial.name = `${name}Resolve`;
  resolveMaterial.depthTest = false;
  resolveMaterial.depthWrite = false;
  resolveMaterial.transparent = false;
  resolveMaterial.toneMapped = false;
  resolveMaterial.blending = THREE.NoBlending;
  resolveMaterial.fog = false;
  resolveMaterial.uniforms = uniforms;

  const resolveColor = Fn(() => {
    const uvNode = screenUV.toVar();
    const sourceTexel = vec2(1).div(uniforms.sourceSize).toVar();
    const srcCenter = floor(uvNode.mul(uniforms.sourceSize))
      .add(0.5)
      .div(uniforms.sourceSize)
      .toVar();
    const freshSample = marchTexture.sample(srcCenter).toVar();
    const fallback = marchTexture.sample(uvNode).toVar();
    const currentHitDistance = marchDistanceTexture.sample(srcCenter).x.toVar();
    const currentSceneDistance = cloudVolume?.sceneDepthNode
      ? select(cloudUniforms.sceneDepthEnabled.greaterThan(0.5),
        min(cloudVolume.sceneDepthNode.sample(uvNode).r, 65000), float(65000)).toVar()
      : float(65000);
    temporalSceneDistance.assign(currentSceneDistance);

    const neighborhoodMin = vec4(freshSample).toVar();
    const neighborhoodMax = vec4(freshSample).toVar();
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        if (x === 0 && y === 0) continue;
        const neighbor = marchTexture.sample(
          srcCenter.add(vec2(x, y).mul(sourceTexel)),
        );
        neighborhoodMin.assign(min(neighborhoodMin, neighbor));
        neighborhoodMax.assign(max(neighborhoodMax, neighbor));
      }
    }

    // Derive the sub-slot from fractional position inside the actual source
    // texel. Using historyPixel % 4 fails whenever ceil-sized source/history
    // grids are not an exact 4:1 ratio (for example 188 -> 750), producing the
    // vertical carry streaks that mismatch exposed in the live lab.
    const subPixel = floor(
      fract(uvNode.mul(uniforms.sourceSize)).mul(CLOUD_AMORTIZATION_BLOCK),
    ).toVar();
    const isFresh = abs(subPixel.x.sub(uniforms.freshSlot.x)).lessThan(0.5)
      .and(abs(subPixel.y.sub(uniforms.freshSlot.y)).lessThan(0.5));

    const historyTexel = vec2(1).div(uniforms.historySize).toVar();
    const carriedSelfDistance = historyDistanceTexture.sample(uvNode).x.toVar();
    const dilatedDistance = select(
      carriedSelfDistance.lessThan(MIN_CARRIED_DISTANCE),
      float(DILATION_IGNORE),
      carriedSelfDistance,
    ).toVar();
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        if (x === 0 && y === 0) continue;
        const neighborDistance = historyDistanceTexture.sample(
          uvNode.add(vec2(x, y).mul(historyTexel)),
        ).x;
        dilatedDistance.assign(min(
          dilatedDistance,
          select(
            neighborDistance.lessThan(MIN_CARRIED_DISTANCE),
            float(DILATION_IGNORE),
            neighborDistance,
          ),
        ));
      }
    }
    const reprojectionDistance = select(
      dilatedDistance.greaterThanEqual(DILATION_IGNORE),
      currentHitDistance,
      dilatedDistance,
    ).toVar();

    const previousUv = vec2(uvNode).toVar();
    const inBounds = bool(true).toVar();
    const gateBypass = bool(true).toVar();
    const expectedPreviousDistance = float(0).toVar();

    If(uniforms.cameraStatic.lessThanEqual(0.5), () => {
      const ndc = vec2(
        uvNode.x.mul(2).sub(1),
        uvNode.y.mul(-2).add(1),
      ).toVar();
      const rayDirection = uniforms.rayBasis.mul(vec3(ndc, 1)).normalize().toVar();
      const worldHit = uniforms.cameraPosition
        .add(rayDirection.mul(reprojectionDistance))
        .sub(uniforms.windDelta)
        .toVar();
      const previousClip = uniforms.previousViewProjection.mul(vec4(worldHit, 1)).toVar();
      const previousNdc = previousClip.xy.div(max(abs(previousClip.w), 1e-6)).toVar();
      const projectedUv = vec2(
        previousNdc.x.mul(0.5).add(0.5),
        previousNdc.y.mul(-0.5).add(0.5),
      ).toVar();
      previousUv.assign(projectedUv);
      inBounds.assign(
        previousClip.w.greaterThan(0)
          .and(projectedUv.x.greaterThanEqual(0))
          .and(projectedUv.x.lessThanEqual(1))
          .and(projectedUv.y.greaterThanEqual(0))
          .and(projectedUv.y.lessThanEqual(1)),
      );
      expectedPreviousDistance.assign(length(
        worldHit.sub(uniforms.previousCameraPosition),
      ));
      gateBypass.assign(
        length(previousUv.sub(uvNode).mul(uniforms.historySize))
          .lessThanEqual(SUB_TEXEL_DISPLACEMENT),
      );
    });

    const history = sampleCatmullRom5(
      historyTexture,
      previousUv,
      uniforms.historySize,
    ).toVar();
    const previousHitDistance = historyDistanceTexture.sample(previousUv).x.toVar();
    const previousSceneDistance = historyDistanceTexture.sample(previousUv).y;
    history.assign(vec4(max(history.rgb, vec3(0)), clamp(history.a, 0, 1)));

    const depthMatches = abs(expectedPreviousDistance.sub(previousHitDistance))
      .lessThanEqual(float(REJECT_THRESHOLD).mul(max(expectedPreviousDistance, 1)));
    const historyUsable = inBounds
      .and(uniforms.historyValid.greaterThan(0.5))
      .and(carriedSelfDistance.greaterThanEqual(MIN_CARRIED_DISTANCE))
      .and(gateBypass.or(depthMatches))
      .and(abs(previousSceneDistance.sub(currentSceneDistance))
        .lessThanEqual(max(currentSceneDistance.mul(0.02), 10)))
      .toVar();
    const clampedHistory = select(
      uniforms.cameraStatic.greaterThan(0.5),
      history,
      clamp(history, neighborhoodMin, neighborhoodMax),
    ).toVar();
    const staleResolve = select(historyUsable, clampedHistory, fallback).toVar();

    const currentIsMiss = currentHitDistance
      .greaterThanEqual(CLOUD_HIT_DISTANCE_MISS_THRESHOLD);
    const opacityConfidence = select(
      uniforms.cameraStatic.greaterThan(0.5),
      float(1),
      saturate(abs(history.a.sub(freshSample.a)).mul(2).oneMinus()),
    );
    const freshHistoryWeight = select(
      currentIsMiss,
      float(FRESH_HISTORY_WEIGHT_NEAR),
      mix(
        float(FRESH_HISTORY_WEIGHT_NEAR),
        float(FRESH_HISTORY_WEIGHT_FAR),
        smoothstep(
          FRESH_RETAIN_DISTANCE_NEAR,
          FRESH_RETAIN_DISTANCE_FAR,
          currentHitDistance,
        ),
      ),
    ).mul(opacityConfidence);
    const freshResolve = select(
      historyUsable,
      mix(freshSample, clampedHistory, freshHistoryWeight),
      freshSample,
    ).toVar();
    const result = select(isFresh, freshResolve, staleResolve).toVar();

    const distanceTrusted = historyUsable.and(gateBypass.or(depthMatches));
    temporalHitDistance.assign(select(
      isFresh,
      currentHitDistance,
      select(distanceTrusted, previousHitDistance, currentHitDistance),
    ));

    return vec4(max(result.rgb, vec3(0)), saturate(result.a));
  })();

  resolveMaterial.fragmentNode = mrt({
    output: resolveColor,
    hitDistHistory: vec4(temporalHitDistance, temporalSceneDistance, 0, 1),
  });

  const quad = new QuadMesh(resolveMaterial);
  const previousViewProjection = new THREE.Matrix4();
  const previousProjection = new THREE.Matrix4();
  const previousCameraPosition = new THREE.Vector3();
  const previousQuaternion = new THREE.Quaternion();
  const currentPosition = new THREE.Vector3();
  const currentQuaternion = new THREE.Quaternion();
  const currentForward = new THREE.Vector3();
  const rightScratch = new THREE.Vector3();
  const upScratch = new THREE.Vector3();
  const previousWindOffset = new THREE.Vector3();
  const previousEvolutionOffset = new THREE.Vector3();
  const previousForward = new THREE.Vector3();
  let hasPreviousView = false;
  let frame = 0;
  let framesSinceReset = 0;

  function reset() {
    hasPreviousView = false;
    framesSinceReset = 0;
    uniforms.historyValid.value = 0;
    return framesSinceReset;
  }

  function setSize(nextWidth, nextHeight) {
    const w = Math.max(1, Math.round(Number(nextWidth) || 1));
    const h = Math.max(1, Math.round(Number(nextHeight) || 1));
    if (w === fullWidth && h === fullHeight) return false;
    fullWidth = w;
    fullHeight = h;
    historyWidth = Math.max(1, Math.ceil(fullWidth / div));
    historyHeight = Math.max(1, Math.ceil(fullHeight / div));
    lowWidth = Math.max(1, Math.ceil(fullWidth / sourceDiv));
    lowHeight = Math.max(1, Math.ceil(fullHeight / sourceDiv));
    marchTarget.setSize(lowWidth, lowHeight);
    historyRead.setSize(historyWidth, historyHeight);
    historyWrite.setSize(historyWidth, historyHeight);
    uniforms.sourceSize.value.set(lowWidth, lowHeight);
    uniforms.historySize.value.set(historyWidth, historyHeight);
    reset();
    return true;
  }

  function render(renderer, camera) {
    if (!renderer || !camera?.isCamera) return historyRead.textures[0];

    camera.updateMatrixWorld();
    currentPosition.setFromMatrixPosition(camera.matrixWorld);
    currentQuaternion.setFromRotationMatrix(camera.matrixWorld);
    const world = camera.matrixWorld.elements;
    currentForward.set(-world[8], -world[9], -world[10]).normalize();

    const cameraMoved = hasPreviousView
      && (currentPosition.distanceToSquared(previousCameraPosition) >= 1e-8
        || currentQuaternion.angleTo(previousQuaternion) >= 1e-6);
    const offset = wind?.offset?.value;
    const evolution = wind?.evolutionOffset?.value;
    uniforms.windDelta.value.set(0, 0, 0);
    if (hasPreviousView && offset) uniforms.windDelta.value.subVectors(offset, previousWindOffset);
    const fieldMoved = uniforms.windDelta.value.lengthSq() > 1e-8
      || (hasPreviousView && evolution && evolution.distanceToSquared(previousEvolutionOffset) > 1e-8);
    const cut = !hasPreviousView
      || !previousProjection.equals(camera.projectionMatrix)
      || currentPosition.distanceTo(previousCameraPosition) > CLOUD_HISTORY_CUT_DISTANCE
      || uniforms.windDelta.value.length() > CLOUD_HISTORY_CUT_DISTANCE
      || (hasPreviousView
        && currentForward.dot(previousForward.set(0, 0, -1).applyQuaternion(previousQuaternion))
          < CLOUD_HISTORY_CUT_COSINE);
    if (cut) reset();

    const [cellX, cellY] = jitterOffsets[frame % jitterOffsets.length];
    const jitterX = ((cellX + 0.5) / CLOUD_AMORTIZATION_BLOCK - 0.5)
      * 2 * (CLOUD_AMORTIZATION_BLOCK / historyWidth);
    const jitterY = ((cellY + 0.5) / CLOUD_AMORTIZATION_BLOCK - 0.5)
      * 2 * (CLOUD_AMORTIZATION_BLOCK / historyHeight);
    cloudUniforms.pixelJitter.value.set(jitterX, -jitterY);
    cloudUniforms.marchJitter.value = (frame * GOLDEN_RATIO_CONJUGATE) % 1;
    if (cloudUniforms.pixelConeAngle) {
      const projection = camera.projectionMatrix.elements;
      const tanY = projection[5] !== 0 ? 1 / projection[5] : 1;
      cloudUniforms.pixelConeAngle.value = (2 * tanY) / Math.max(1, fullHeight);
      cloudUniforms.stepConeAngle.value = (2 * tanY) / Math.max(1, historyHeight);
    }

    uniforms.cameraPosition.value.copy(currentPosition);
    uniforms.previousCameraPosition.value.copy(previousCameraPosition);
    uniforms.cameraStatic.value = cameraMoved || fieldMoved ? 0 : 1;
    uniforms.freshSlot.value.set(cellX, cellY);
    uniforms.previousViewProjection.value.copy(previousViewProjection);

    const projection = camera.projectionMatrix.elements;
    const tanX = projection[0] !== 0 ? 1 / projection[0] : 1;
    const tanY = projection[5] !== 0 ? 1 / projection[5] : 1;
    rightScratch.set(world[0], world[1], world[2]).normalize().multiplyScalar(tanX);
    upScratch.set(world[4], world[5], world[6]).normalize().multiplyScalar(tanY);
    uniforms.rayBasis.value.set(
      rightScratch.x, upScratch.x, currentForward.x,
      rightScratch.y, upScratch.y, currentForward.y,
      rightScratch.z, upScratch.z, currentForward.z,
    );
    cloudVolume?.prepareNoiseMipmaps?.(renderer);
    cloudVolume?.update?.(camera);

    const previousTarget = renderer.getRenderTarget();
    const previousMaterial = quad.material;

    quad.material = cloudMaterial;
    renderer.setRenderTarget(marchTarget);
    quad.render(renderer);

    historyTexture.value = historyRead.textures[0];
    historyDistanceTexture.value = historyRead.textures[1];
    quad.material = resolveMaterial;
    renderer.setRenderTarget(historyWrite);
    quad.render(renderer);

    renderer.setRenderTarget(previousTarget);
    quad.material = previousMaterial;

    const resolved = historyWrite;
    historyWrite = historyRead;
    historyRead = resolved;

    previousViewProjection
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    previousProjection.copy(camera.projectionMatrix);
    previousCameraPosition.copy(currentPosition);
    previousQuaternion.copy(currentQuaternion);
    if (offset) previousWindOffset.copy(offset);
    if (evolution) previousEvolutionOffset.copy(evolution);
    hasPreviousView = true;
    uniforms.historyValid.value = 1;
    frame += 1;
    framesSinceReset += 1;
    return resolved.textures[0];
  }

  return {
    historyDiv: div,
    sourceDiv,
    jitterOffsets,
    marchTarget,
    quad,
    render,
    reset,
    resolveMaterial,
    setSize,
    uniforms,
    warmupFrames,

    get texture() {
      return historyRead.textures[0];
    },
    get hitDistanceTexture() {
      return historyRead.textures[1];
    },
    get size() {
      return {
        fullHeight,
        fullWidth,
        historyHeight,
        historyWidth,
        lowHeight,
        lowWidth,
      };
    },
    get framesSinceReset() {
      return framesSinceReset;
    },
    get isWarm() {
      return framesSinceReset >= warmupFrames;
    },
    get groundLevel() {
      return uniforms.groundLevel.value;
    },
    set groundLevel(value) {
      const next = Number(value);
      if (Number.isFinite(next)) uniforms.groundLevel.value = next;
    },

    dispose() {
      marchTarget.dispose();
      historyRead.dispose();
      historyWrite.dispose();
      resolveMaterial.dispose();
    },
  };
}
