// Amortized top-down cloud-shadow bake.
//
// One low-resolution pass marches the same density field the view ray uses and
// stores light transmittance over a camera-centred world-XZ footprint. Scene
// materials and the god-ray march then pay one filtered texture lookup instead
// of repeating a cloud march per receiver fragment.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  dot,
  exp,
  float,
  max,
  mix,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { CLOUD_PLANET_RADIUS } from '../cloud/cloudVolume.js';

export const CLOUD_SHADOW_DEFAULT_EXTENT = 4000;
export const CLOUD_SHADOW_DEFAULT_LIGHT_STEPS = 8;
export const CLOUD_SHADOW_EDGE_FADE_START = 0.8;
export const CLOUD_SHADOW_NIGHT_THRESHOLD = (-6 * Math.PI) / 180;

const fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fullscreenGeometry = new THREE.PlaneGeometry(2, 2);
const cameraPositionScratch = new THREE.Vector3();

const intersectSphereNode = Fn(([rayOrigin, rayDirection, center, radius]) => {
  const toCenter = rayOrigin.sub(center);
  const halfB = dot(toCenter, rayDirection);
  const c = dot(toCenter, toCenter).sub(radius.mul(radius));
  const discriminant = halfB.mul(halfB).sub(c);
  const hit = vec2(-1, -1).toVar();
  If(discriminant.greaterThanEqual(0), () => {
    const rootOffset = sqrt(discriminant);
    hit.assign(vec2(
      halfB.negate().sub(rootOffset),
      halfB.negate().add(rootOffset),
    ));
  });
  return hit;
});

/** Samples a baked cloud-shadow projection. Returns 1 in full light, 0 in shadow. */
export function sampleCloudShadowNode(worldPosition, shadowMapNode, projection) {
  const relative = worldPosition.sub(projection.center);
  const u = dot(relative, projection.axisU)
    .div(projection.extent)
    .mul(0.5)
    .add(0.5);
  const v = dot(relative, projection.axisV)
    .div(projection.extent)
    .mul(0.5)
    .add(0.5);
  // Render-target UVs are vertically opposite the top-down world projection.
  const sampled = shadowMapNode.sample(vec2(
    clamp(u, 0, 1),
    clamp(float(1).sub(v), 0, 1),
  )).r;
  const edge = max(abs(u.sub(0.5)), abs(v.sub(0.5))).mul(2);
  const edgeFade = float(1).sub(smoothstep(CLOUD_SHADOW_EDGE_FADE_START, 1, edge));
  const effectiveIntensity = projection.intensity
    .mul(edgeFade)
    .mul(projection.enabled);
  return mix(float(1), sampled, effectiveIntensity);
}

// Scene-wide receiver bridge. The Sky System owns the authoritative cloud
// transmittance bake; every ToonLab surface samples these stable uniform nodes
// so visible clouds and their ground/object shadows cannot drift apart.
const environmentCloudShadowFallback = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
);
environmentCloudShadowFallback.needsUpdate = true;

export const environmentCloudShadow = {
  axisU: uniform(new THREE.Vector3(1, 0, 0)),
  axisV: uniform(new THREE.Vector3(0, 0, 1)),
  center: uniform(new THREE.Vector3()),
  enabled: uniform(0),
  extent: uniform(CLOUD_SHADOW_DEFAULT_EXTENT),
  intensity: uniform(1),
  map: texture(environmentCloudShadowFallback),
  ready: uniform(false, 'bool'),
};

const environmentCloudShadowProjection = {
  axisU: environmentCloudShadow.axisU,
  axisV: environmentCloudShadow.axisV,
  center: environmentCloudShadow.center,
  enabled: environmentCloudShadow.enabled,
  extent: environmentCloudShadow.extent,
  intensity: environmentCloudShadow.intensity,
};

/** Publish the active Sky System cloud bake to every ToonLab receiver. */
export function syncEnvironmentCloudShadowPass(pass) {
  if (!pass?.texture || !pass?.projection) return false;
  environmentCloudShadow.map.value = pass.texture;
  environmentCloudShadow.axisU.value.copy(pass.projection.axisU.value);
  environmentCloudShadow.axisV.value.copy(pass.projection.axisV.value);
  environmentCloudShadow.center.value.copy(pass.projection.center.value);
  environmentCloudShadow.extent.value = pass.projection.extent.value;
  environmentCloudShadow.intensity.value = pass.projection.intensity.value;
  environmentCloudShadow.enabled.value = pass.projection.enabled.value;
  environmentCloudShadow.ready.value = true;
  return true;
}

export function clearEnvironmentCloudShadowPass(pass = null) {
  if (pass?.texture && environmentCloudShadow.map.value !== pass.texture) return false;
  environmentCloudShadow.map.value = environmentCloudShadowFallback;
  environmentCloudShadow.enabled.value = 0;
  environmentCloudShadow.ready.value = false;
  return true;
}

/**
 * Authoritative cloud visibility for a ToonLab receiver. `fallbackVisibility`
 * preserves legacy/standalone procedural clouds until a Sky System publishes
 * its actual volumetric-cloud transmittance map.
 */
export const sampleEnvironmentCloudShadow = /*@__PURE__*/ Fn(([
  worldPosition,
  fallbackVisibility,
]) => {
  const visibility = float(fallbackVisibility).toVar();
  If(environmentCloudShadow.ready, () => {
    visibility.assign(sampleCloudShadowNode(
      worldPosition,
      environmentCloudShadow.map,
      environmentCloudShadowProjection,
    ));
  });
  return visibility;
});

/**
 * Builds the top-down transmittance pass. `cloudVolume.densityField` is shared
 * with the primary marcher, including its live textures and wind uniforms.
 */
export function createCloudShadowPass({
  cloudVolume,
  clouds,
  sun,
  timeOfDay = null,
  resolution = 512,
  extent = CLOUD_SHADOW_DEFAULT_EXTENT,
  groundReferenceY = 0,
  bakeInterval = 1,
} = {}) {
  if (!cloudVolume?.densityField?.sampleShadowDensityNode) {
    throw new TypeError('createCloudShadowPass needs a cloud volume density field.');
  }
  if (!clouds?.shape || !sun?.direction) {
    throw new TypeError('createCloudShadowPass needs live clouds and sun state.');
  }

  const center = uniform(new THREE.Vector3(0, groundReferenceY, 0));
  const axisU = uniform(new THREE.Vector3(1, 0, 0));
  const axisV = uniform(new THREE.Vector3(0, 0, 1));
  const extentUniform = uniform(extent);
  const intensity = uniform(1);
  const enabledUniform = uniform(1);
  const lightSteps = uniform(CLOUD_SHADOW_DEFAULT_LIGHT_STEPS);
  const mipLevel = uniform(0);
  const planetCenter = uniform(new THREE.Vector3(0, groundReferenceY - CLOUD_PLANET_RADIUS, 0));
  const lightDirection = uniform(new THREE.Vector3().copy(sun.direction.value));
  const projection = {
    axisU,
    axisV,
    center,
    enabled: enabledUniform,
    extent: extentUniform,
    intensity,
  };

  const size = Math.max(64, Math.round(Number(resolution) || 512));
  const target = new THREE.RenderTarget(size, size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  target.texture.name = 'ToonLabCloudShadowMap';
  target.texture.colorSpace = THREE.NoColorSpace;

  const shape = clouds.shape;
  const sampleShadowDensityNode = cloudVolume.densityField.sampleShadowDensityNode;
  const planetRadius = float(CLOUD_PLANET_RADIUS);
  const material = new MeshBasicNodeMaterial();
  material.name = 'ToonLabCloudShadowBake';
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;
  material.fog = false;
  material.colorNode = Fn(() => {
    const innerRadius = planetRadius.add(shape.altitude);
    const outerRadius = innerRadius.add(shape.thickness);
    const offset = uv().mul(2).sub(1).mul(extentUniform);
    const groundPosition = center
      .add(axisU.mul(offset.x))
      .add(axisV.mul(offset.y))
      .toVar();

    const start = max(
      intersectSphereNode(groundPosition, lightDirection, planetCenter, innerRadius).y,
      0,
    ).toVar();
    const end = max(
      intersectSphereNode(groundPosition, lightDirection, planetCenter, outerRadius).y,
      0,
    ).toVar();
    const transmittance = float(1).toVar();

    If(
      lightDirection.y.greaterThan(0).and(end.greaterThan(start.add(1))),
      () => {
        const stepLength = end.sub(start).div(lightSteps).toVar();
        const opticalDepth = float(0).toVar();
        const distance = start.add(stepLength.mul(0.5)).toVar();
        Loop(lightSteps, () => {
          const position = groundPosition.add(lightDirection.mul(distance));
          opticalDepth.addAssign(
            sampleShadowDensityNode(position, mipLevel)
              .mul(max(shape.density, 0))
              .mul(stepLength),
          );
          distance.addAssign(stepLength);
        });
        transmittance.assign(exp(opticalDepth.negate()));
      },
    );

    return vec4(vec3(transmittance), 1);
  })();

  const mesh = new THREE.Mesh(fullscreenGeometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.name = 'toonlab:cloud-shadow';
  scene.add(mesh);

  let enabled = true;
  let frame = 0;
  let cadence = Math.max(1, Math.round(Number(bakeInterval) || 1));
  let groundY = Number.isFinite(Number(groundReferenceY)) ? Number(groundReferenceY) : 0;
  let lightDirectionOverride = null;

  const api = {
    axisU,
    axisV,
    center,
    enabledUniform,
    extent: extentUniform,
    intensity,
    lightDirection,
    lightSteps,
    material,
    mipLevel,
    planetCenter,
    projection,
    target,
    texture: target.texture,

    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = value === true;
      enabledUniform.value = enabled ? 1 : 0;
    },
    get resolution() {
      return target.width;
    },
    get bakeInterval() {
      return cadence;
    },
    set bakeInterval(value) {
      cadence = Math.max(1, Math.round(Number(value) || cadence));
    },
    get groundReferenceY() {
      return groundY;
    },
    set groundReferenceY(value) {
      const next = Number(value);
      if (Number.isFinite(next)) groundY = next;
    },

    setLightDirection(value = null) {
      if (value === null) {
        lightDirectionOverride = null;
        return null;
      }
      const next = value?.isVector3
        ? value.clone()
        : Array.isArray(value) || ArrayBuffer.isView(value)
          ? new THREE.Vector3().fromArray(Array.from(value))
          : null;
      if (!next || next.lengthSq() === 0) {
        throw new TypeError('Cloud-shadow light direction must be a non-zero Vector3 or numeric array.');
      }
      lightDirectionOverride = next.normalize();
      lightDirection.value.copy(lightDirectionOverride);
      return lightDirectionOverride.toArray();
    },

    setResolution(value) {
      const next = Math.max(64, Math.round(Number(value) || target.width));
      if (next !== target.width) target.setSize(next, next);
    },

    updateFrame(camera) {
      if (!camera?.isCamera) return;
      camera.updateMatrixWorld();
      cameraPositionScratch.setFromMatrixPosition(camera.matrixWorld);
      center.value.set(cameraPositionScratch.x, groundY, cameraPositionScratch.z);
      planetCenter.value.set(
        cameraPositionScratch.x,
        groundY - CLOUD_PLANET_RADIUS,
        cameraPositionScratch.z,
      );

      // Stylized time-of-day rigs can deliberately keep their gameplay key
      // above the horizon after the physical sky sun reaches it. The cloud
      // transmittance field must follow the light it attenuates; otherwise the
      // near-horizontal physical ray becomes opaque and removes that elevated
      // key from every surface.
      const sunDirection = lightDirectionOverride ?? sun.direction.value;
      const elevation = Math.asin(Math.max(-1, Math.min(1, sunDirection.y)));
      const sunIsActive = !timeOfDay || elevation >= CLOUD_SHADOW_NIGHT_THRESHOLD;
      lightDirection.value.copy(
        sunIsActive ? sunDirection : timeOfDay.moonDirection.value,
      );
    },

    bake(renderer) {
      if (!enabled) return false;
      const due = frame % cadence === 0;
      frame += 1;
      if (!due) return false;
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, fullscreenCamera);
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
      return true;
    },

    dispose() {
      target.dispose();
      material.dispose();
    },
  };

  return api;
}
