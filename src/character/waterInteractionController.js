export const DEFAULT_WATER_INTERACTION_CONFIG = Object.freeze({
  bedClearance: 0.88,
  enterDepth: 1.25,
  enterSurfaceAllowance: 0.35,
  exitDepth: 1.02,
  facingMinimum: 0.12,
  flowDamping: 2,
  inputDamping: 6,
  idleDamping: 3,
  maxDelta: 0.05,
  speed: 2,
  sprintSpeed: 3,
  diveSpeed: 1.7,
  surfaceGain: 3.2,
  surfaceOffset: 0.2,
  surfaceTolerance: 0.35,
  verticalSpeed: 1.7,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function vector3(value = {}) {
  return Object.freeze({ x: finite(value.x), y: finite(value.y), z: finite(value.z) });
}

function waterFlow(water, x, z) {
  const flow = water?.getFlowAt?.(x, z);
  return Object.freeze({ x: finite(flow?.x), z: finite(flow?.z ?? flow?.y) });
}

function sampleGround(ground, x, z) {
  const sample = typeof ground === 'function' ? ground(x, z) : ground?.sample?.(x, z);
  return finite(typeof sample === 'number' ? sample : sample?.height, 0);
}

/**
 * Framework-neutral swim controller. The host supplies a water-query object,
 * a ground sampler, controller facts, and a camera-relative move vector.
 */
export function createWaterInteractionController(options = {}) {
  const { ground: groundInput, heightAt, ...configInput } = options;
  const config = Object.freeze({ ...DEFAULT_WATER_INTERACTION_CONFIG, ...configInput });
  const ground = groundInput ?? heightAt ?? (() => 0);
  let swimming = false;
  let revision = 0;

  function reset() {
    swimming = false;
    revision += 1;
  }

  function update(input = {}, deltaInput = 1 / 60) {
    const delta = Math.min(Math.max(finite(deltaInput, 1 / 60), 1e-4), config.maxDelta);
    const position = vector3(input.position);
    const velocity = vector3(input.velocity);
    const water = input.water;
    const inWater = Boolean(water?.contains?.(position.x, position.z));
    const waterHeight = inWater
      ? finite(water?.getHeightAt?.(position.x, position.z), -Infinity)
      : -Infinity;
    const waterLevel = inWater ? finite(water?.getLevel?.(), waterHeight) : -Infinity;
    const groundHeight = sampleGround(ground, position.x, position.z);
    const depth = waterLevel - groundHeight;
    const wasSwimming = swimming;
    swimming = wasSwimming
      ? inWater && depth > config.exitDepth
      : inWater && depth > config.enterDepth
        && position.y < waterHeight + config.enterSurfaceAllowance;
    const transition = swimming === wasSwimming ? null : (swimming ? 'enter' : 'exit');

    revision += 1;
    if (!swimming) {
      return Object.freeze({
        active: false,
        constraints: null,
        depth,
        diving: false,
        gravityScale: transition === 'exit' ? 1 : null,
        groundHeight,
        inWater,
        planarSpeed: Math.hypot(velocity.x, velocity.z),
        position,
        revision,
        sprinting: false,
        state: 'ground',
        surfaced: false,
        surfaceTargetY: null,
        swimming: false,
        transition,
        velocity,
        waterHeight,
        waterLevel,
      });
    }

    const move = input.move ?? {};
    let moveX = finite(move.x);
    let moveZ = finite(move.z);
    const moveLength = Math.hypot(moveX, moveZ);
    const moving = moveLength > 1e-3;
    if (moving) { moveX /= moveLength; moveZ /= moveLength; }
    const diving = Boolean(input.diving);
    const sprinting = Boolean(input.sprinting) && moving && !diving;
    const targetSpeed = diving ? config.diveSpeed : (sprinting ? config.sprintSpeed : config.speed);
    const flow = waterFlow(water, position.x, position.z);
    const flowSpeed = Math.hypot(flow.x, flow.z);
    let facingScale = 1;
    let facingError = null;
    if (moving && Number.isFinite(Number(input.facingYaw))) {
      const desiredYaw = Math.atan2(moveX, moveZ);
      facingError = Math.atan2(
        Math.sin(desiredYaw - Number(input.facingYaw)),
        Math.cos(desiredYaw - Number(input.facingYaw)),
      );
      facingScale = Math.max(
        config.facingMinimum,
        Math.cos(Math.min(Math.abs(facingError), Math.PI / 2)),
      );
    }
    const targetVx = (moving ? moveX * targetSpeed * facingScale : 0) + flow.x;
    const targetVz = (moving ? moveZ * targetSpeed * facingScale : 0) + flow.z;
    const damping = (moving ? config.inputDamping : config.idleDamping)
      + flowSpeed * config.flowDamping;
    const horizontalBlend = 1 - Math.exp(-damping * delta);
    const nextVelocity = Object.freeze({
      x: velocity.x + (targetVx - velocity.x) * horizontalBlend,
      y: 0,
      z: velocity.z + (targetVz - velocity.z) * horizontalBlend,
    });

    const surfaceTargetY = waterHeight - config.surfaceOffset;
    let verticalRate;
    if (diving) verticalRate = -config.verticalSpeed;
    else if (input.rising) {
      verticalRate = position.y < surfaceTargetY - 0.05 ? config.verticalSpeed : 0;
    } else {
      verticalRate = Math.min(Math.max(
        (surfaceTargetY - position.y) * config.surfaceGain,
        -config.verticalSpeed,
      ), config.verticalSpeed * 1.1);
    }
    let nextY = position.y + verticalRate * delta;
    if (!diving) {
      const ceilingY = surfaceTargetY + 0.02;
      if (nextY > ceilingY) {
        nextY = Math.max(ceilingY, position.y - config.verticalSpeed * 1.6 * delta);
      }
    }
    nextY = Math.max(nextY, groundHeight + config.bedClearance);
    const nextPosition = Object.freeze({ ...position, y: nextY });
    const constraints = Object.freeze({
      maxPlanarSpeed: targetSpeed + flowSpeed + 0.5,
      maxY: diving ? Infinity : Math.max(surfaceTargetY + 0.02, position.y - 0.12),
      minY: groundHeight + config.bedClearance,
    });

    return Object.freeze({
      active: true,
      constraints,
      depth,
      diving,
      facingError,
      gravityScale: 0,
      groundHeight,
      inWater,
      planarSpeed: Math.hypot(nextVelocity.x, nextVelocity.z),
      position: nextPosition,
      revision,
      sprinting,
      state: diving ? 'dive' : 'surface',
      surfaced: Math.abs(nextY - surfaceTargetY) < config.surfaceTolerance,
      surfaceTargetY,
      swimming: true,
      transition,
      velocity: nextVelocity,
      waterHeight,
      waterLevel,
    });
  }

  return Object.freeze({ config, get swimming() { return swimming; }, reset, update });
}

/** Apply the current swim target before the physics step. */
export function applyWaterInteractionFrame(body, frame, { wake = true } = {}) {
  if (!body || !frame) return frame;
  if (frame.gravityScale != null) body.setGravityScale?.(frame.gravityScale, wake);
  if (frame.active) {
    body.setLinvel?.(frame.velocity, wake);
    body.setTranslation?.(frame.position, wake);
  }
  if (body.userData && frame.active) body.userData.canJump = false;
  return frame;
}

/** Re-apply swim constraints after third-party controller forces run. */
export function enforceWaterInteractionFrame(body, frame, { wake = true } = {}) {
  if (!body || !frame?.active || !frame.constraints) return frame;
  if (body.gravityScale?.() !== 0) body.setGravityScale?.(0, wake);
  const velocity = vector3(body.linvel?.());
  const speed = Math.hypot(velocity.x, velocity.z);
  const scale = speed > frame.constraints.maxPlanarSpeed
    ? frame.constraints.maxPlanarSpeed / speed
    : 1;
  if (scale < 1 || Math.abs(velocity.y) > 1e-6) {
    body.setLinvel?.({ x: velocity.x * scale, y: 0, z: velocity.z * scale }, wake);
  }
  const position = vector3(body.translation?.());
  const y = Math.min(Math.max(position.y, frame.constraints.minY), frame.constraints.maxY);
  if (Math.abs(y - position.y) > 1e-5) {
    body.setTranslation?.({ x: position.x, y, z: position.z }, wake);
  }
  return frame;
}
