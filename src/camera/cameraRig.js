import * as THREE from 'three';

import { createSeededRandom, hashSeed } from '../core/generation.js';
import { createCameraSettings } from './cameraSettings.js';
import { DEFAULT_CAMERA_OPERATORS, normalizeCameraOperators } from './cameraGenerator.js';

const operatorFactories = new Map();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const IDENTITY_QUATERNION = new THREE.Quaternion();
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const dampAlpha = (rate, delta) => Number(rate) <= 0 ? 1 : 1 - Math.exp(-Number(rate) * delta);

function copyVector(target, value, fallback = [0, 0, 0]) {
  if (value?.isVector3) return target.copy(value);
  const source = Array.isArray(value) ? value : fallback;
  return target.set(finite(source[0], fallback[0]), finite(source[1], fallback[1]), finite(source[2], fallback[2]));
}

function operatorSettings(context, definition, group, cache) {
  Object.assign(cache, context.settings[group] ?? {}, definition.settings ?? {});
  return cache;
}

/** Registers a runtime camera operator. Serialized recipes refer to its type. */
export function registerCameraOperator(type, factory, { overwrite = false } = {}) {
  const id = String(type ?? '').trim();
  if (!id) throw new Error('Camera operator type is required.');
  if (typeof factory !== 'function') throw new Error(`Camera operator "${id}" factory must be a function.`);
  if (!overwrite && operatorFactories.has(id)) throw new Error(`Camera operator "${id}" is already registered.`);
  operatorFactories.set(id, factory);
  return id;
}

export function getCameraOperatorOptions() {
  return [...operatorFactories.keys()];
}

function followFactory(definition) {
  const merged = {};
  const localOffset = new THREE.Vector3();
  const localAim = new THREE.Vector3();
  const yaw = new THREE.Euler(0, 0, 0, 'YXZ');
  const rotation = new THREE.Quaternion();
  return {
    update(context) {
      const settings = operatorSettings(context, definition, 'follow', merged);
      copyVector(localOffset, settings.offset, [0, 2.8, 6.4]);
      copyVector(localAim, settings.targetOffset, [0, 1.45, 0]);
      if (settings.yawOnly) {
        yaw.setFromQuaternion(context.targetQuaternion, 'YXZ');
        rotation.setFromAxisAngle(context.up, yaw.y);
      } else {
        rotation.copy(context.targetQuaternion);
      }
      localOffset.applyQuaternion(rotation);
      localAim.applyQuaternion(rotation);
      context.desiredPosition.copy(context.targetPosition).add(localOffset);
      context.desiredLookAt.copy(context.targetPosition).add(localAim);
    },
  };
}

function lookAheadFactory(definition) {
  const merged = {};
  const ahead = new THREE.Vector3();
  return {
    update(context) {
      const settings = operatorSettings(context, definition, 'lookAhead', merged);
      if (!settings.enabled) return;
      ahead.copy(context.targetVelocity);
      if (settings.horizontalOnly) ahead.addScaledVector(context.up, -ahead.dot(context.up));
      ahead.multiplyScalar(settings.time);
      const maxDistance = Math.max(0, settings.maxDistance);
      if (ahead.lengthSq() > maxDistance * maxDistance) ahead.setLength(maxDistance);
      context.desiredLookAt.addScaledVector(ahead, finite(definition.settings?.aimInfluence, 1));
      context.desiredPosition.addScaledVector(ahead, finite(definition.settings?.positionInfluence, 0.28));
    },
  };
}

function framingFactory(definition) {
  const merged = {};
  const direction = new THREE.Vector3();
  const right = new THREE.Vector3();
  return {
    update(context) {
      const settings = operatorSettings(context, definition, 'framing', merged);
      direction.subVectors(context.desiredLookAt, context.desiredPosition);
      const distance = Math.max(direction.length(), 0.001);
      direction.multiplyScalar(1 / distance);
      right.crossVectors(direction, context.up);
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      else right.normalize();
      const horizontal = (0.5 - settings.screenX) * distance * settings.horizontalScale;
      const vertical = (settings.screenY - 0.5) * distance * settings.verticalScale;
      context.desiredLookAt.addScaledVector(right, horizontal).addScaledVector(context.up, vertical);
    },
  };
}

function collisionFactory(definition, rig) {
  const merged = {};
  const ray = new THREE.Vector3();
  const resolved = new THREE.Vector3();

  function readResult(result, from, direction, desiredDistance, settings) {
    if (result == null || result === false) return false;
    if (typeof result === 'number') {
      resolved.copy(from).addScaledVector(direction, clamp(result - settings.padding, settings.minimumDistance, desiredDistance));
      return true;
    }
    const position = result?.position ?? result?.point ?? result;
    if (position?.isVector3 || Array.isArray(position)) {
      copyVector(resolved, position);
      const distance = resolved.distanceTo(from);
      resolved.copy(from).addScaledVector(direction, clamp(distance - settings.padding, settings.minimumDistance, desiredDistance));
      return result?.hit !== false;
    }
    if (Number.isFinite(Number(result?.distance))) {
      resolved.copy(from).addScaledVector(direction, clamp(Number(result.distance) - settings.padding, settings.minimumDistance, desiredDistance));
      return result.hit !== false;
    }
    return false;
  }

  return {
    reset(context) {
      context.collisionPosition.copy(context.desiredPosition);
      context.collisionInitialized = false;
    },
    update(context) {
      const settings = operatorSettings(context, definition, 'collision', merged);
      if (!context.collisionInitialized) {
        context.collisionPosition.copy(context.desiredPosition);
        context.collisionInitialized = true;
      }
      let hit = false;
      ray.subVectors(context.desiredPosition, context.desiredLookAt);
      const desiredDistance = Math.max(ray.length(), 0.001);
      ray.multiplyScalar(1 / desiredDistance);
      if (settings.enabled && typeof context.collisionQuery === 'function') {
        context.counters.collisionQueries += 1;
        const result = context.collisionQuery({
          camera: context.camera,
          from: context.desiredLookAt,
          padding: settings.padding,
          radius: settings.radius,
          rig,
          target: context.target,
          to: context.desiredPosition,
        });
        hit = readResult(result, context.desiredLookAt, ray, desiredDistance, settings);
      }
      if (hit) {
        context.counters.collisionHits += 1;
        context.collisionPosition.copy(resolved);
      } else {
        context.collisionPosition.lerp(
          context.desiredPosition,
          dampAlpha(settings.recoveryDamping, context.delta),
        );
      }
      context.desiredPosition.copy(context.collisionPosition);
      context.collisionHit = hit;
    },
  };
}

function dampingFactory(definition) {
  const merged = {};
  return {
    update(context) {
      const settings = operatorSettings(context, definition, 'damping', merged);
      if (!context.initialized || context.teleported) {
        context.currentPosition.copy(context.desiredPosition);
        context.currentLookAt.copy(context.desiredLookAt);
      } else {
        context.currentPosition.lerp(context.desiredPosition, dampAlpha(settings.position, context.delta));
        context.currentLookAt.lerp(context.desiredLookAt, dampAlpha(settings.aim, context.delta));
      }
      context.outputPosition.copy(context.currentPosition);
      context.outputLookAt.copy(context.currentLookAt);
    },
  };
}

function lensFactory(definition) {
  const merged = {};
  return {
    update(context) {
      const lens = operatorSettings(context, definition, 'lens', merged);
      const damping = context.settings.damping;
      const speedAmount = clamp(context.targetVelocity.length() / Math.max(lens.speedReference, 0.001), 0, 1);
      context.desiredFov = clamp(lens.fov + lens.speedFov * speedAmount, 5, 150);
      if (!context.initialized || context.teleported) context.currentFov = context.desiredFov;
      else context.currentFov += (context.desiredFov - context.currentFov) * dampAlpha(damping.lens, context.delta);
      context.outputFov = context.currentFov;
      context.outputNear = Math.min(lens.near, lens.far - 0.001);
      context.outputFar = Math.max(lens.far, lens.near + 0.001);
    },
  };
}

function noiseFactory(definition) {
  const merged = {};
  let elapsed = 0;
  let bandSignature = '';
  let bands = [];

  function prepare(settings) {
    const octaveCount = Math.max(1, Math.round(finite(settings.octaves, 1)));
    const signature = `${hashSeed(settings.seed)}:${octaveCount}`;
    if (signature === bandSignature) return;
    bandSignature = signature;
    const random = createSeededRandom(settings.seed, `camera-noise:${definition.id}`);
    bands = Array.from({ length: octaveCount }, () => ({
      phases: Array.from({ length: 6 }, () => random.float(0, Math.PI * 2)),
      rate: random.float(0.92, 1.08),
    }));
  }

  function sample(settings, channel) {
    let amplitude = 1;
    let frequency = settings.frequency;
    let totalAmplitude = 0;
    let value = 0;
    for (const band of bands) {
      value += Math.sin(elapsed * frequency * band.rate * Math.PI * 2 + band.phases[channel]) * amplitude;
      totalAmplitude += amplitude;
      amplitude *= settings.persistence;
      frequency *= settings.lacunarity;
    }
    return totalAmplitude > 0 ? value / totalAmplitude : 0;
  }

  return {
    reset() {
      elapsed = 0;
    },
    update(context) {
      const settings = operatorSettings(context, definition, 'noise', merged);
      elapsed += context.delta;
      if (!settings.enabled) return;
      prepare(settings);
      context.outputPosition.x += sample(settings, 0) * settings.positionAmplitude;
      context.outputPosition.y += sample(settings, 1) * settings.positionAmplitude * 0.65;
      context.outputPosition.z += sample(settings, 2) * settings.positionAmplitude;
      context.outputRotation.x += sample(settings, 3) * settings.rotationAmplitude * 0.7;
      context.outputRotation.y += sample(settings, 4) * settings.rotationAmplitude;
      context.outputRotation.z += sample(settings, 5) * settings.rotationAmplitude * 0.65;
    },
  };
}

function impulseFactory(definition) {
  const merged = {};
  return {
    update(context) {
      const settings = operatorSettings(context, definition, 'impulse', merged);
      context.impulsePosition.set(0, 0, 0);
      context.impulseRotation.set(0, 0, 0);
      for (let index = context.impulses.length - 1; index >= 0; index -= 1) {
        const impulse = context.impulses[index];
        impulse.elapsed += context.delta;
        if (impulse.elapsed >= impulse.duration) {
          context.impulses.splice(index, 1);
          continue;
        }
        const envelope = Math.exp(-impulse.decay * impulse.elapsed) * (1 - impulse.elapsed / impulse.duration);
        const wave = impulse.frequency > 0 ? Math.cos(impulse.phase + impulse.elapsed * impulse.frequency * Math.PI * 2) : 1;
        context.impulsePosition.addScaledVector(impulse.position, envelope * wave * settings.positionScale);
        context.impulseRotation.addScaledVector(impulse.rotation, envelope * wave * settings.rotationScale);
      }
      if (context.impulsePosition.lengthSq() > settings.maxPosition ** 2) context.impulsePosition.setLength(settings.maxPosition);
      const maxRotation = Math.max(Math.abs(context.impulseRotation.x), Math.abs(context.impulseRotation.y), Math.abs(context.impulseRotation.z));
      if (maxRotation > settings.maxRotation && maxRotation > 0) context.impulseRotation.multiplyScalar(settings.maxRotation / maxRotation);
      context.outputPosition.add(context.impulsePosition);
      context.outputRotation.copy(context.impulseRotation);
    },
  };
}

registerCameraOperator('follow', followFactory);
registerCameraOperator('lookAhead', lookAheadFactory);
registerCameraOperator('framing', framingFactory);
registerCameraOperator('collision', collisionFactory);
registerCameraOperator('damping', dampingFactory);
registerCameraOperator('lens', lensFactory);
registerCameraOperator('noise', noiseFactory);
registerCameraOperator('impulse', impulseFactory);

function resolveTarget(source, position, quaternion) {
  const target = typeof source === 'function' ? source() : source;
  quaternion.identity();
  if (target?.isObject3D) {
    target.updateWorldMatrix(true, false);
    target.getWorldPosition(position);
    target.getWorldQuaternion(quaternion);
  } else if (target?.position?.isVector3) {
    position.copy(target.position);
    if (target.quaternion?.isQuaternion) quaternion.copy(target.quaternion);
  } else if (target?.isVector3 || Array.isArray(target)) {
    copyVector(position, target);
  } else {
    position.set(0, 0, 0);
  }
  return target;
}

/**
 * Creates a vanilla Three.js camera rig. Operator factories are open-ended;
 * pass `operatorFactories` for local modules or call registerCameraOperator().
 */
export function createCameraRig({
  camera,
  collisionQuery = null,
  operatorFactories: localFactories = {},
  operators = null,
  preset = null,
  settings = null,
  target = null,
  up = WORLD_UP,
} = {}) {
  if (!camera?.isCamera) throw new Error('createCameraRig requires a Three.js Camera.');
  let disposed = false;
  let targetSource = target;
  let rigSettings = createCameraSettings(settings ?? preset?.settings);
  let query = collisionQuery;
  let definitions = normalizeCameraOperators(operators ?? preset?.operators ?? DEFAULT_CAMERA_OPERATORS);
  let instances = [];
  let impulseSerial = 0;
  const lookMatrix = new THREE.Matrix4();
  const impulseQuaternion = new THREE.Quaternion();
  const impulseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const previousTarget = new THREE.Vector3();
  const measuredVelocity = new THREE.Vector3();
  const sampleState = {
    far: rigSettings.lens.far,
    fov: rigSettings.lens.fov,
    lookAt: [0, 0, 0],
    near: rigSettings.lens.near,
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
  };
  const state = {
    camera,
    collisionHit: false,
    collisionInitialized: false,
    collisionPosition: new THREE.Vector3(),
    collisionQuery: query,
    counters: { collisionHits: 0, collisionQueries: 0, updates: 0 },
    currentFov: finite(camera.fov, rigSettings.lens.fov),
    currentLookAt: new THREE.Vector3(),
    currentPosition: camera.position.clone(),
    delta: 0,
    desiredFov: rigSettings.lens.fov,
    desiredLookAt: new THREE.Vector3(),
    desiredPosition: camera.position.clone(),
    impulsePosition: new THREE.Vector3(),
    impulseRotation: new THREE.Vector3(),
    impulses: [],
    initialized: false,
    outputFar: rigSettings.lens.far,
    outputFov: rigSettings.lens.fov,
    outputLookAt: new THREE.Vector3(),
    outputNear: rigSettings.lens.near,
    outputPosition: camera.position.clone(),
    outputQuaternion: camera.quaternion.clone(),
    outputRotation: new THREE.Vector3(),
    settings: rigSettings,
    target: null,
    targetPosition: new THREE.Vector3(),
    targetQuaternion: new THREE.Quaternion(),
    targetVelocity: new THREE.Vector3(),
    teleported: false,
    up: new THREE.Vector3().copy(up?.isVector3 ? up : WORLD_UP).normalize(),
  };

  const rig = {
    camera,
    root: camera,
    addImpulse(options = {}) {
      if (disposed) return null;
      const source = typeof options === 'number' ? { position: [0, options, 0] } : options;
      const seed = hashSeed(source.seed ?? ++impulseSerial);
      const random = createSeededRandom(seed, 'camera-impulse');
      const position = copyVector(new THREE.Vector3(), source.position ?? source.translation, [0, 0, 0]);
      const rotation = copyVector(new THREE.Vector3(), source.rotation, [0, 0, 0]);
      if (source.position === undefined && source.translation === undefined && Number.isFinite(Number(source.power))) {
        position.set(random.float(-1, 1), random.float(-0.35, 1), random.float(-1, 1)).normalize().multiplyScalar(Number(source.power) * 0.12);
      }
      if (source.rotation === undefined && Number.isFinite(Number(source.power))) {
        rotation.set(random.float(-1, 1), random.float(-1, 1), random.float(-0.4, 0.4)).multiplyScalar(Number(source.power) * 0.025);
      }
      const impulse = {
        decay: Math.max(0.01, finite(source.decay, rigSettings.impulse.decay)),
        duration: Math.max(1 / 1000, finite(source.duration, 0.55)),
        elapsed: 0,
        frequency: Math.max(0, finite(source.frequency, 13)),
        id: impulseSerial,
        phase: finite(source.phase, random.float(0, Math.PI * 2)),
        position,
        rotation,
        seed,
      };
      state.impulses.push(impulse);
      return { id: impulse.id, stop: () => { impulse.duration = impulse.elapsed; } };
    },
    applyState(sample) {
      if (disposed || !sample) return;
      copyVector(camera.position, sample.position, [0, 0, 0]);
      if (sample.quaternion?.isQuaternion) camera.quaternion.copy(sample.quaternion);
      else if (Array.isArray(sample.quaternion)) camera.quaternion.fromArray(sample.quaternion);
      if (camera.isPerspectiveCamera) {
        camera.fov = finite(sample.fov, camera.fov);
        camera.near = finite(sample.near, camera.near);
        camera.far = finite(sample.far, camera.far);
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of instances) entry.instance.dispose?.();
      instances = [];
      state.impulses.length = 0;
      query = null;
      targetSource = null;
    },
    getState() {
      sampleState.far = state.outputFar;
      sampleState.fov = state.outputFov;
      sampleState.near = state.outputNear;
      state.outputLookAt.toArray(sampleState.lookAt);
      state.outputPosition.toArray(sampleState.position);
      state.outputQuaternion.toArray(sampleState.quaternion);
      return sampleState;
    },
    reset({ snap = true } = {}) {
      state.initialized = false;
      state.collisionInitialized = false;
      state.targetVelocity.set(0, 0, 0);
      state.impulses.length = 0;
      for (const entry of instances) entry.instance.reset?.(state);
      if (snap) rig.update(0, { apply: true });
    },
    setCollisionQuery(next) {
      query = typeof next === 'function' ? next : null;
      state.collisionQuery = query;
      return rig;
    },
    setOperators(next) {
      const nextDefinitions = normalizeCameraOperators(next);
      const enabledDefinitions = nextDefinitions
        .filter((definition) => definition.enabled)
        .sort((a, b) => a.order - b.order);
      for (const definition of enabledDefinitions) {
        const factory = localFactories[definition.type] ?? operatorFactories.get(definition.type);
        if (typeof factory !== 'function') {
          throw new Error(`Unknown camera operator "${definition.type}". Register it before creating the rig.`);
        }
      }
      const nextInstances = [];
      try {
        for (const definition of enabledDefinitions) {
          const factory = localFactories[definition.type] ?? operatorFactories.get(definition.type);
          const instance = factory(definition, rig);
          if (!instance || typeof instance.update !== 'function') {
            throw new Error(`Camera operator "${definition.type}" must return an object with update(context).`);
          }
          nextInstances.push({ definition, instance });
        }
      } catch (error) {
        for (const entry of nextInstances) entry.instance.dispose?.();
        throw error;
      }
      for (const entry of instances) entry.instance.dispose?.();
      definitions = nextDefinitions;
      instances = nextInstances;
      state.initialized = false;
      return rig;
    },
    setSettings(next) {
      rigSettings = createCameraSettings(next);
      state.settings = rigSettings;
      return rig;
    },
    setTarget(next) {
      targetSource = next;
      state.initialized = false;
      return rig;
    },
    syncFromCamera() {
      state.currentPosition.copy(camera.position);
      state.outputPosition.copy(camera.position);
      state.outputQuaternion.copy(camera.quaternion);
      state.currentFov = finite(camera.fov, rigSettings.lens.fov);
      state.outputFov = state.currentFov;
      state.initialized = false;
      return rig;
    },
    update(delta = 0, { apply = true } = {}) {
      if (disposed) return rig.getState();
      const dt = clamp(finite(delta, 0), 0, 0.25);
      state.delta = dt;
      state.collisionQuery = query;
      state.settings = rigSettings;
      state.target = resolveTarget(targetSource, state.targetPosition, state.targetQuaternion);
      state.teleported = state.initialized && state.targetPosition.distanceTo(previousTarget) > rigSettings.damping.teleportDistance;
      if (!state.initialized || dt <= 0 || state.teleported) {
        measuredVelocity.set(0, 0, 0);
        state.targetVelocity.set(0, 0, 0);
      } else {
        measuredVelocity.subVectors(state.targetPosition, previousTarget).multiplyScalar(1 / dt);
        state.targetVelocity.lerp(measuredVelocity, dampAlpha(rigSettings.lookAhead.smoothing, dt));
      }
      previousTarget.copy(state.targetPosition);
      state.desiredPosition.copy(state.currentPosition);
      state.desiredLookAt.copy(state.targetPosition);
      state.outputPosition.copy(state.currentPosition);
      state.outputLookAt.copy(state.currentLookAt);
      state.outputRotation.set(0, 0, 0);
      state.collisionHit = false;
      for (const entry of instances) entry.instance.update(state, entry.definition);
      state.initialized = true;
      state.counters.updates += 1;

      lookMatrix.lookAt(state.outputPosition, state.outputLookAt, state.up);
      state.outputQuaternion.setFromRotationMatrix(lookMatrix);
      impulseEuler.set(state.outputRotation.x, state.outputRotation.y, state.outputRotation.z, 'YXZ');
      impulseQuaternion.setFromEuler(impulseEuler);
      state.outputQuaternion.multiply(impulseQuaternion);
      if (apply) {
        camera.position.copy(state.outputPosition);
        camera.quaternion.copy(state.outputQuaternion);
        if (camera.isPerspectiveCamera) {
          camera.fov = state.outputFov;
          camera.near = state.outputNear;
          camera.far = state.outputFar;
          camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld();
      }
      return rig.getState();
    },
  };

  Object.defineProperties(rig, {
    disposed: { get: () => disposed },
    operators: { get: () => definitions.map((operator) => ({ ...operator, settings: { ...operator.settings } })) },
    settings: { get: () => createCameraSettings(rigSettings) },
    stats: {
      get: () => ({
        activeImpulses: state.impulses.length,
        activeOperators: instances.length,
        collisionHit: state.collisionHit,
        collisionHits: state.counters.collisionHits,
        collisionQueries: state.counters.collisionQueries,
        disposed,
        lastDelta: state.delta,
        updates: state.counters.updates,
      }),
    },
  });

  rig.setOperators(definitions);
  return rig;
}
