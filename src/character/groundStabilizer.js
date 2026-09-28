export const DEFAULT_GROUND_STABILIZER_CONFIG = Object.freeze({
  bodyOffset: 1,
  fallThroughDepth: 1.2,
  groundedTolerance: 0.1,
  lockGrounded: true,
  lockTolerance: 0.34,
  maxLockVerticalSpeed: 1.25,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function copyVector(value = {}) {
  return Object.freeze({
    x: finite(value.x),
    y: finite(value.y),
    z: finite(value.z),
  });
}

function normalizedGroundSample(sample) {
  if (Number.isFinite(sample)) return Object.freeze({ height: Number(sample), normal: null });
  if (!sample || !Number.isFinite(Number(sample.height))) return null;
  const normal = sample.normal ? copyVector(sample.normal) : null;
  return Object.freeze({ height: Number(sample.height), normal });
}

/** Normalize a height function or richer surface query to one ground sampler. */
export function createGroundSampler(sampleGround) {
  if (typeof sampleGround !== 'function') {
    throw new TypeError('createGroundSampler requires a (x, z) ground query.');
  }
  return Object.freeze({
    sample(x, z) {
      return normalizedGroundSample(sampleGround(finite(x), finite(z)));
    },
  });
}

/**
 * Pure uneven-ground stabilizer. It decides corrections but never imports or
 * calls a renderer, physics engine, controller, input system, or scene.
 */
export function createGroundStabilizer(options = {}) {
  const config = Object.freeze({
    ...DEFAULT_GROUND_STABILIZER_CONFIG,
    ...options,
  });
  const ground = options.ground?.sample
    ? options.ground
    : createGroundSampler(options.ground ?? options.heightAt);
  let revision = 0;

  function update(input = {}) {
    const position = copyVector(input.position);
    const velocity = copyVector(input.velocity);
    const sample = ground.sample(position.x, position.z);
    const enabled = input.enabled !== false && sample != null;
    const targetY = sample ? sample.height + finite(config.bodyOffset, 1) : position.y;
    const error = targetY - position.y;
    let correction = 'none';
    let canJump = Boolean(input.grounded);
    let nextPosition = position;
    let nextVelocity = velocity;

    if (enabled && position.y < targetY - config.fallThroughDepth) {
      correction = 'recover';
      canJump = true;
      nextPosition = Object.freeze({ ...position, y: targetY });
      nextVelocity = Object.freeze({ ...velocity, y: 0 });
    } else if (
      enabled
      && config.lockGrounded !== false
      && input.grounded
      && !input.jumpReleased
      && Math.abs(error) < config.lockTolerance
      && Math.abs(velocity.y) < config.maxLockVerticalSpeed
    ) {
      correction = 'lock';
      canJump = true;
      nextPosition = Object.freeze({ ...position, y: targetY });
      nextVelocity = Object.freeze({ ...velocity, y: 0 });
    } else if (enabled && position.y < targetY + config.groundedTolerance) {
      canJump = true;
    }

    revision += 1;
    return Object.freeze({
      canJump,
      correction,
      enabled,
      error,
      groundHeight: sample?.height ?? null,
      groundNormal: sample?.normal ?? null,
      position: nextPosition,
      revision,
      targetY,
      velocity: nextVelocity,
    });
  }

  return Object.freeze({ config, ground, update });
}

function uprightQuaternion(rotation = {}) {
  const x = finite(rotation.x);
  const y = finite(rotation.y);
  const z = finite(rotation.z);
  const w = finite(rotation.w, 1);
  const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  return Object.freeze({
    w: Math.cos(yaw / 2),
    x: 0,
    y: Math.sin(yaw / 2),
    z: 0,
  });
}

/** Apply a pure stabilizer frame to a Rapier-like rigid body adapter. */
export function applyGroundStabilizerFrame(body, frame, { upright = true, wake = true } = {}) {
  if (!body || !frame) return frame;
  if (frame.correction !== 'none') {
    body.setTranslation?.(frame.position, wake);
    body.setLinvel?.(frame.velocity, wake);
  }
  if (body.userData) body.userData.canJump = frame.canJump;
  if (upright && body.rotation && body.setRotation) {
    body.setRotation(uprightQuaternion(body.rotation()), wake);
    const angularVelocity = body.angvel?.();
    if (angularVelocity && body.setAngvel) {
      body.setAngvel({ x: 0, y: finite(angularVelocity.y), z: 0 }, wake);
    }
  }
  return frame;
}
