// Scene-light collector shared by the toon character material and the
// environment shaders.
//
// Both material families do their own lighting from raw light data (a main
// light direction, a flat sky ambient, per-light cel bands), which three's
// node LightingModel does not hand out. This module mirrors the scene's
// lights into module-level uniform nodes once per render: every material
// built against these nodes sees the same values, so one sync per scene and
// camera updates them all. Converted meshes call syncToonSceneLights from
// Object3D.onBeforeRender, which both node backends invoke.
//
// Conventions (the environment shader depends on them):
//   mainLightDirection        view space, toward the light, normalised
//   mainLightColor            linear colour × intensity
//   point/spot positions      view space; *World variants in world space
//   spotLightDirections       view space, from the target toward the light
//   point/spotLightParams     (distance, decay, cone cos, penumbra cos)
//   ambientLightColor         ambient lights + light-probe L0 irradiance
//
// Characters additionally read the world-space variants and the hemisphere
// light (sky/ground colours and its up direction).

import * as THREE from 'three';
import { normalize, uniform, uniformArray, vec3 } from 'three/tsl';

export const MAX_TOON_POINT_LIGHTS = 4;
export const MAX_TOON_SPOT_LIGHTS = 4;

// Irradiance of the L0 spherical-harmonic band (three's SH convention).
const SH_L0_IRRADIANCE = 0.886227;

function vec3Array(count) {
  return Array.from({ length: count }, () => new THREE.Vector3());
}

function vec4Array(count) {
  return Array.from({ length: count }, () => new THREE.Vector4());
}

export const toonSceneLights = {
  ambientLightColor: uniform(new THREE.Color(0, 0, 0)),
  hasHemisphereLight: uniform(0),
  hasMainLight: uniform(0),
  hemisphereGroundColor: uniform(new THREE.Color(0, 0, 0)),
  hemisphereSkyColor: uniform(new THREE.Color(0, 0, 0)),
  hemisphereUpWorld: uniform(new THREE.Vector3(0, 1, 0)),
  mainLightColor: uniform(new THREE.Color(0, 0, 0)),
  mainLightDirection: uniform(new THREE.Vector3(0, 0, 1)),
  mainLightDirectionWorld: uniform(new THREE.Vector3(0, 1, 0)),
  pointLightColors: uniformArray(vec3Array(MAX_TOON_POINT_LIGHTS), 'vec3'),
  pointLightCount: uniform(0),
  pointLightParams: uniformArray(vec4Array(MAX_TOON_POINT_LIGHTS), 'vec4'),
  pointLightPositions: uniformArray(vec3Array(MAX_TOON_POINT_LIGHTS), 'vec3'),
  pointLightPositionsWorld: uniformArray(vec3Array(MAX_TOON_POINT_LIGHTS), 'vec3'),
  spotLightColors: uniformArray(vec3Array(MAX_TOON_SPOT_LIGHTS), 'vec3'),
  spotLightCount: uniform(0),
  spotLightDirections: uniformArray(vec3Array(MAX_TOON_SPOT_LIGHTS), 'vec3'),
  spotLightDirectionsWorld: uniformArray(vec3Array(MAX_TOON_SPOT_LIGHTS), 'vec3'),
  spotLightParams: uniformArray(vec4Array(MAX_TOON_SPOT_LIGHTS), 'vec4'),
  spotLightPositions: uniformArray(vec3Array(MAX_TOON_SPOT_LIGHTS), 'vec3'),
  spotLightPositionsWorld: uniformArray(vec3Array(MAX_TOON_SPOT_LIGHTS), 'vec3'),
};

/** The main light's view-space direction (toward the light), normalised. */
export function getMainLightDirection() {
  return normalize(toonSceneLights.mainLightDirection);
}

/** The main light's world-space direction (toward the light), normalised. */
export function getMainLightDirectionWorld() {
  return normalize(toonSceneLights.mainLightDirectionWorld);
}

/** Zero vector node, handy for disabled light inputs. */
export const NO_LIGHT = /*@__PURE__*/ vec3(0, 0, 0);

const scratchPosition = new THREE.Vector3();
const scratchTarget = new THREE.Vector3();
const scratchColor = new THREE.Color();

function lightStrength(light) {
  return light.intensity * Math.max(light.color.r, light.color.g, light.color.b);
}

/**
 * The scene's main directional light: the visible one marked
 * `userData.toonMainLight`, else the brightest visible one.
 */
export function findToonMainLight(scene) {
  let marked = null;
  let brightest = null;
  let brightestStrength = -Infinity;
  scene?.traverseVisible?.((object) => {
    if (!object.isDirectionalLight) return;
    if (object.userData?.toonMainLight && !marked) marked = object;
    const strength = lightStrength(object);
    if (strength > brightestStrength) {
      brightest = object;
      brightestStrength = strength;
    }
  });
  return marked ?? brightest;
}

function directionTowardLight(light, target) {
  light.getWorldPosition(scratchPosition);
  if (light.target) {
    light.target.updateMatrixWorld?.();
    light.target.getWorldPosition(scratchTarget);
  } else {
    scratchTarget.set(0, 0, 0);
  }
  target.subVectors(scratchPosition, scratchTarget);
  if (target.lengthSq() < 1e-12) target.set(0, 1, 0);
  return target.normalize();
}

let lastScene = null;
let lastCamera = null;
let lastFrame = -1;
let lastViewHash = '';

// Every renderer.render() call bumps info.render.calls, so all meshes drawn by
// one call share one collection.
function frameOf(renderer) {
  const calls = renderer?.info?.render?.calls;
  return Number.isFinite(calls) ? calls : -1;
}

function viewHash(camera) {
  const e = camera.matrixWorldInverse.elements;
  return `${e[0]},${e[1]},${e[2]},${e[4]},${e[5]},${e[6]},${e[8]},${e[9]},${e[10]},${e[12]},${e[13]},${e[14]}`;
}

/**
 * Mirrors the scene's lights into the shared uniforms. Cheap to call from
 * every mesh's onBeforeRender: it re-collects only when the scene, camera or
 * frame changed. Pass `renderer` when available.
 */
export function syncToonSceneLights(scene, camera, renderer = null) {
  if (!scene || !camera) return false;
  const frame = frameOf(renderer);
  const hash = viewHash(camera);
  if (scene === lastScene && camera === lastCamera && frame === lastFrame && frame >= 0 && hash === lastViewHash) return false;
  lastScene = scene;
  lastCamera = camera;
  lastFrame = frame;
  lastViewHash = hash;
  collectToonSceneLights(scene, camera);
  return true;
}

/** Unconditionally re-collects the scene's lights into the shared uniforms. */
export function collectToonSceneLights(scene, camera) {
  const s = toonSceneLights;
  const viewMatrix = camera.matrixWorldInverse;
  const ambient = new THREE.Color(0, 0, 0);
  const hemiSky = new THREE.Color(0, 0, 0);
  const hemiGround = new THREE.Color(0, 0, 0);
  const hemiUp = new THREE.Vector3(0, 0, 0);
  let hemiCount = 0;
  let pointCount = 0;
  let spotCount = 0;

  const main = findToonMainLight(scene);
  if (main) {
    const world = directionTowardLight(main, s.mainLightDirectionWorld.value);
    s.mainLightDirection.value.copy(world).transformDirection(viewMatrix);
    s.mainLightColor.value.copy(main.color).multiplyScalar(main.intensity);
    s.hasMainLight.value = 1;
  } else {
    s.mainLightColor.value.setRGB(0, 0, 0);
    s.mainLightDirectionWorld.value.set(0, 1, 0);
    s.mainLightDirection.value.set(0, 1, 0).transformDirection(viewMatrix);
    s.hasMainLight.value = 0;
  }

  scene.traverseVisible((object) => {
    if (!object.isLight) return;
    if (object.isAmbientLight) {
      ambient.add(scratchColor.copy(object.color).multiplyScalar(object.intensity));
    } else if (object.isLightProbe) {
      const band = object.sh?.coefficients?.[0];
      if (band) ambient.add(scratchColor.setRGB(band.x, band.y, band.z).multiplyScalar(SH_L0_IRRADIANCE * object.intensity));
    } else if (object.isHemisphereLight) {
      hemiSky.add(scratchColor.copy(object.color).multiplyScalar(object.intensity));
      hemiGround.add(scratchColor.copy(object.groundColor).multiplyScalar(object.intensity));
      hemiUp.add(object.getWorldPosition(scratchPosition).normalize());
      hemiCount += 1;
    } else if (object.isPointLight && pointCount < MAX_TOON_POINT_LIGHTS) {
      const index = pointCount;
      object.getWorldPosition(scratchPosition);
      s.pointLightPositionsWorld.array[index].copy(scratchPosition);
      s.pointLightPositions.array[index].copy(scratchPosition).applyMatrix4(viewMatrix);
      const color = scratchColor.copy(object.color).multiplyScalar(object.intensity);
      s.pointLightColors.array[index].set(color.r, color.g, color.b);
      s.pointLightParams.array[index].set(object.distance, object.decay, 0, 0);
      pointCount += 1;
    } else if (object.isSpotLight && spotCount < MAX_TOON_SPOT_LIGHTS) {
      const index = spotCount;
      object.getWorldPosition(scratchPosition);
      s.spotLightPositionsWorld.array[index].copy(scratchPosition);
      s.spotLightPositions.array[index].copy(scratchPosition).applyMatrix4(viewMatrix);
      const direction = directionTowardLight(object, s.spotLightDirectionsWorld.array[index]);
      s.spotLightDirections.array[index].copy(direction).transformDirection(viewMatrix);
      const color = scratchColor.copy(object.color).multiplyScalar(object.intensity);
      s.spotLightColors.array[index].set(color.r, color.g, color.b);
      s.spotLightParams.array[index].set(
        object.distance,
        object.decay,
        Math.cos(object.angle),
        Math.cos(object.angle * (1 - object.penumbra)),
      );
      spotCount += 1;
    }
  });

  s.ambientLightColor.value.copy(ambient);
  s.hemisphereSkyColor.value.copy(hemiSky);
  s.hemisphereGroundColor.value.copy(hemiGround);
  if (hemiUp.lengthSq() > 1e-10) s.hemisphereUpWorld.value.copy(hemiUp.normalize());
  else s.hemisphereUpWorld.value.set(0, 1, 0);
  s.hasHemisphereLight.value = hemiCount > 0 ? 1 : 0;
  s.pointLightCount.value = pointCount;
  s.spotLightCount.value = spotCount;
  for (let index = pointCount; index < MAX_TOON_POINT_LIGHTS; index += 1) s.pointLightColors.array[index].set(0, 0, 0);
  for (let index = spotCount; index < MAX_TOON_SPOT_LIGHTS; index += 1) s.spotLightColors.array[index].set(0, 0, 0);
  return s;
}
