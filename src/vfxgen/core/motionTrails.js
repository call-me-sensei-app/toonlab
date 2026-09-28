// Short speed-gated ribbons for vehicles, gliders, dashes, and fast fauna.
// The library owns the failure-prone defaults: no always-on white poles, no
// constant-width strips, and no long history hanging behind a slow target.

import * as THREE from 'three';
import { attribute, Fn } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

export const DEFAULT_MOTION_TRAIL_SETTINGS = Object.freeze({
  color: Object.freeze([0.68, 0.86, 1]),
  fullSpeed: 32,
  lifetime: 0.2,
  maxPoints: 24,
  opacity: 0.34,
  sampleDistance: 0.3,
  speedThreshold: 10,
  width: 0.11,
});

const scratchPosition = new THREE.Vector3();
const scratchTangent = new THREE.Vector3();
const scratchView = new THREE.Vector3();
const scratchSide = new THREE.Vector3();

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function colorArray(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : [...fallback];
}

export function createMotionTrailSettings(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  const speedThreshold = Math.max(finite(source.speedThreshold,
    DEFAULT_MOTION_TRAIL_SETTINGS.speedThreshold), 0);
  return {
    color: colorArray(source.color, DEFAULT_MOTION_TRAIL_SETTINGS.color),
    fullSpeed: Math.max(finite(source.fullSpeed, DEFAULT_MOTION_TRAIL_SETTINGS.fullSpeed),
      speedThreshold + 0.01),
    lifetime: THREE.MathUtils.clamp(
      finite(source.lifetime, DEFAULT_MOTION_TRAIL_SETTINGS.lifetime), 0.05, 0.65),
    maxPoints: Math.round(THREE.MathUtils.clamp(
      finite(source.maxPoints, DEFAULT_MOTION_TRAIL_SETTINGS.maxPoints), 4, 64)),
    opacity: THREE.MathUtils.clamp(
      finite(source.opacity, DEFAULT_MOTION_TRAIL_SETTINGS.opacity), 0, 1),
    sampleDistance: Math.max(
      finite(source.sampleDistance, DEFAULT_MOTION_TRAIL_SETTINGS.sampleDistance), 0.01),
    speedThreshold,
    width: THREE.MathUtils.clamp(
      finite(source.width, DEFAULT_MOTION_TRAIL_SETTINGS.width), 0.01, 1),
  };
}

function createRibbon(settings) {
  const { maxPoints } = settings;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(maxPoints * 2 * 3);
  const colors = new Float32Array(maxPoints * 2 * 4);
  const indices = new Uint16Array((maxPoints - 1) * 6);
  for (let index = 0; index < maxPoints - 1; index += 1) {
    const vertex = index * 2;
    indices.set([vertex, vertex + 1, vertex + 2, vertex + 2, vertex + 1, vertex + 3], index * 6);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)
    .setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4)
    .setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new NodeMaterial();
  material.name = 'ToonLabMotionTrail';
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.fragmentNode = Fn(() => attribute('color', 'vec4'))();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ToonLabMotionTrail';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.userData.waterExclude = true;
  return { colors, geometry, material, mesh, points: [], positions };
}

/**
 * Creates one short speed trail per target-local anchor.
 *
 * @example
 * const trails = createMotionTrails({
 *   target: glider,
 *   anchors: [[-1.2, 0, 0.4], [1.2, 0, 0.4]],
 * });
 * scene.add(trails.root);
 * // before render:
 * trails.update(delta, camera);
 */
export function createMotionTrails({
  anchors = [[-0.5, 0, 0], [0.5, 0, 0]],
  target = null,
  settings: settingsInput = {},
} = {}) {
  const settings = createMotionTrailSettings(settingsInput);
  const localAnchors = (Array.isArray(anchors) ? anchors : [])
    .map((anchor) => anchor?.isVector3
      ? anchor.clone()
      : new THREE.Vector3(...(Array.isArray(anchor) ? anchor : [0, 0, 0])));
  const root = new THREE.Group();
  root.name = 'ToonLabMotionTrails';
  root.userData.waterExclude = true;
  const ribbons = localAnchors.map(() => createRibbon(settings));
  for (const ribbon of ribbons) root.add(ribbon.mesh);
  let trackedTarget = target;
  let initialized = false;
  const previous = localAnchors.map(() => new THREE.Vector3());

  const reset = () => {
    initialized = false;
    for (const ribbon of ribbons) {
      ribbon.points.length = 0;
      ribbon.geometry.setDrawRange(0, 0);
      ribbon.mesh.visible = false;
    }
  };

  const rebuildRibbon = (ribbon, camera) => {
    const { points } = ribbon;
    if (points.length < 2) {
      ribbon.geometry.setDrawRange(0, 0);
      ribbon.mesh.visible = false;
      return;
    }
    const viewPosition = camera?.position ?? scratchView.set(0, 1, 1);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const next = points[Math.min(index + 1, points.length - 1)];
      const prior = points[Math.max(index - 1, 0)];
      scratchTangent.copy(prior.position).sub(next.position);
      if (scratchTangent.lengthSq() < 1e-8) scratchTangent.set(0, 0, 1);
      scratchTangent.normalize();
      scratchView.copy(viewPosition).sub(point.position).normalize();
      scratchSide.crossVectors(scratchTangent, scratchView);
      if (scratchSide.lengthSq() < 1e-8) scratchSide.set(1, 0, 0);
      scratchSide.normalize();

      const ageT = THREE.MathUtils.clamp(point.age / settings.lifetime, 0, 1);
      // Both ends pinch: the ribbon grows cleanly from the emitter and dies
      // as a tapered stroke instead of becoming a rectangular pole.
      const headTaper = THREE.MathUtils.smoothstep(ageT, 0, 0.14);
      const tailTaper = (1 - ageT) ** 0.72;
      const width = settings.width * point.strength * headTaper * tailTaper;
      const alpha = settings.opacity * point.strength * headTaper * tailTaper;
      const vertex = index * 2;
      const left = scratchPosition.copy(point.position).addScaledVector(scratchSide, width);
      ribbon.positions.set([left.x, left.y, left.z], vertex * 3);
      const right = scratchPosition.copy(point.position).addScaledVector(scratchSide, -width);
      ribbon.positions.set([right.x, right.y, right.z], (vertex + 1) * 3);
      ribbon.colors.set([...settings.color, alpha, ...settings.color, alpha], vertex * 4);
    }
    ribbon.geometry.setDrawRange(0, (points.length - 1) * 6);
    ribbon.geometry.attributes.position.needsUpdate = true;
    ribbon.geometry.attributes.color.needsUpdate = true;
    ribbon.mesh.visible = true;
  };

  const api = {
    root,
    ribbons: ribbons.map((ribbon) => ribbon.mesh),
    settings,
    get active() {
      return ribbons.some((ribbon) => ribbon.geometry.drawRange.count > 0);
    },
    dispose() {
      for (const ribbon of ribbons) {
        ribbon.geometry.dispose();
        ribbon.material.dispose();
      }
      root.parent?.remove(root);
    },
    reset,
    setTarget(nextTarget) {
      trackedTarget = nextTarget;
      reset();
      return api;
    },
    update(delta = 1 / 60, camera = null) {
      const dt = Math.min(Math.max(finite(delta, 1 / 60), 1 / 1000), 0.1);
      for (const ribbon of ribbons) {
        for (const point of ribbon.points) point.age += dt;
        while (ribbon.points.at(-1)?.age >= settings.lifetime) ribbon.points.pop();
      }
      if (!trackedTarget?.isObject3D) {
        for (const ribbon of ribbons) rebuildRibbon(ribbon, camera);
        return api;
      }

      trackedTarget.updateWorldMatrix(true, false);
      for (let index = 0; index < ribbons.length; index += 1) {
        const ribbon = ribbons[index];
        const position = scratchPosition.copy(localAnchors[index]).applyMatrix4(trackedTarget.matrixWorld);
        if (!initialized) previous[index].copy(position);
        const speed = position.distanceTo(previous[index]) / dt;
        const strength = THREE.MathUtils.smoothstep(speed, settings.speedThreshold, settings.fullSpeed);
        const head = ribbon.points[0];
        if (strength > 0) {
          if (!head || head.position.distanceTo(position) >= settings.sampleDistance) {
            ribbon.points.unshift({ age: 0, position: position.clone(), strength });
            if (ribbon.points.length > settings.maxPoints) ribbon.points.length = settings.maxPoints;
          } else {
            head.position.copy(position);
            head.age = 0;
            head.strength = strength;
          }
        }
        previous[index].copy(position);
        rebuildRibbon(ribbon, camera);
      }
      initialized = true;
      return api;
    },
  };
  reset();
  return api;
}
