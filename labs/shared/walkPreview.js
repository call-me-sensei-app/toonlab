import * as THREE from 'three';
import {
  createLocomotionActions,
  NATIVE_LOCOMOTION_CLIP_NAMES,
  resolveNativeLocomotionClips,
} from '@call-me-sensei/toonlab/character';

const WALK_FORWARD_CODES = Object.freeze(['KeyW', 'ArrowUp']);
const WALK_BACK_CODES = Object.freeze(['KeyS', 'ArrowDown']);
const WALK_RIGHT_CODES = Object.freeze(['KeyD', 'ArrowRight']);
const WALK_LEFT_CODES = Object.freeze(['KeyA', 'ArrowLeft']);
const WALK_RUN_CODES = Object.freeze(['ShiftLeft', 'ShiftRight']);
export const WALK_PREVIEW_ECCTRL_DEFAULTS = Object.freeze({
  accDeltaTime: 8,
  airDragMultiplier: 0.2,
  dragDampingC: 0.15,
  gravity: 9.81,
  jumpVel: 4.2,
  maxVelLimit: 2.6,
  rejectVelMult: 4,
  sprintJumpMult: 1.2,
  sprintMult: 1.85,
  turnSpeed: 13,
  turnVelMultiplier: 0.2,
});

const WALK_ACTION_REFERENCE_SPEED = 1.45;
const RUN_ACTION_REFERENCE_SPEED = 3.0;
const RUN_BLEND_MIN_SPEED = 3.1;

export const WALK_PREVIEW_INPUT_CODES = Object.freeze([
  ...WALK_FORWARD_CODES,
  ...WALK_BACK_CODES,
  ...WALK_RIGHT_CODES,
  ...WALK_LEFT_CODES,
  ...WALK_RUN_CODES,
  'Space',
]);
export const WALK_PREVIEW_TITLE = 'Walk preview: WASD/arrows move, Shift runs, Space jumps';
export const WALK_PREVIEW_STATUS = 'Walk preview - WASD/arrows move, Shift runs, Space jumps. Toggle off to stop.';

const WALK_PREVIEW_INPUT_CODE_SET = new Set(WALK_PREVIEW_INPUT_CODES);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);

export function isWalkPreviewInputCode(code) {
  return WALK_PREVIEW_INPUT_CODE_SET.has(code);
}

export function createWalkPreviewActions({ clips, mixer }) {
  return createLocomotionActions({ clips, mixer });
}

export { NATIVE_LOCOMOTION_CLIP_NAMES, resolveNativeLocomotionClips };

function isEditableTarget(target) {
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || tagName === 'button';
}

function anyPressed(pressed, codes) {
  return codes.some((code) => pressed.has(code));
}

// `groundY` may be a number (flat stage) or a function `(x, z) => height`
// (terrain stages): grounded walkers snap to the sampled height, jumps land
// on it, and the camera follow target tracks it.
export function installWalkPreviewController({
  camera,
  controls,
  engine,
  followHeight = 1.2,
  getActions = () => null,
  getEnabled,
  getWalkAction = () => null,
  getWalker,
  accDeltaTime = WALK_PREVIEW_ECCTRL_DEFAULTS.accDeltaTime,
  airDragMultiplier = WALK_PREVIEW_ECCTRL_DEFAULTS.airDragMultiplier,
  dragDampingC = WALK_PREVIEW_ECCTRL_DEFAULTS.dragDampingC,
  gravity = WALK_PREVIEW_ECCTRL_DEFAULTS.gravity,
  groundY = 0,
  jumpVelocity = WALK_PREVIEW_ECCTRL_DEFAULTS.jumpVel,
  maxVelLimit = WALK_PREVIEW_ECCTRL_DEFAULTS.maxVelLimit,
  moveHorizontal,
  rejectVelMult = WALK_PREVIEW_ECCTRL_DEFAULTS.rejectVelMult,
  runSpeedMultiplier = WALK_PREVIEW_ECCTRL_DEFAULTS.sprintMult,
  setWalking,
  speed = null,
  sprintJumpMult = WALK_PREVIEW_ECCTRL_DEFAULTS.sprintJumpMult,
  turnSpeed = WALK_PREVIEW_ECCTRL_DEFAULTS.turnSpeed,
  turnVelMultiplier = WALK_PREVIEW_ECCTRL_DEFAULTS.turnVelMultiplier,
}) {
  const pressed = new Set();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movingDirection = new THREE.Vector3();
  const targetVelocity = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const moveStep = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const wantToMoveVelocity = new THREE.Vector3();
  const rejectVelocity = new THREE.Vector3();
  const moveAcceleration = new THREE.Vector3();
  const followTarget = new THREE.Vector3();
  let grounded = true;
  let jumpPlaying = false;
  let jumpRequested = false;
  let jumpWeight = 0;
  let runBlend = 0;
  let verticalVelocity = 0;
  let walkWeight = 0;

  const groundHeightAt = typeof groundY === 'function'
    ? groundY
    : () => groundY;

  function enabled() {
    return Boolean(getEnabled?.());
  }

  function resetJump(walker = getWalker?.()) {
    verticalVelocity = 0;
    grounded = true;
    if (walker) walker.position.y = groundHeightAt(walker.position.x, walker.position.z);
  }

  function clearInput() {
    pressed.clear();
    resetAnimationWeights();
  }

  function handleKeyDown(event) {
    if (!isWalkPreviewInputCode(event.code) || !enabled() || !getWalker?.() || isEditableTarget(event.target)) {
      return;
    }
    event.preventDefault();
    if (event.code === 'Space') {
      if (!event.repeat) jumpRequested = true;
      if (!event.repeat && grounded) {
        verticalVelocity = jumpVelocity * (anyPressed(pressed, WALK_RUN_CODES) ? sprintJumpMult : 1);
        grounded = false;
      }
      return;
    }
    pressed.add(event.code);
  }

  function handleKeyUp(event) {
    if (!isWalkPreviewInputCode(event.code)) return;
    pressed.delete(event.code);
    if (enabled() && !isEditableTarget(event.target)) event.preventDefault();
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', clearInput);

  function currentActions() {
    const actions = getActions?.();
    if (actions) return actions;
    const walk = getWalkAction?.();
    return walk ? { walk } : null;
  }

  function resetAnimationWeights() {
    walkWeight = 0;
    runBlend = 0;
    jumpWeight = 0;
    jumpPlaying = false;
    jumpRequested = false;
    const actions = currentActions();
    if (actions?.idle) actions.idle.setEffectiveWeight(1);
    if (actions?.walk) {
      actions.walk.setEffectiveWeight(actions.idle ? 0 : 1);
      actions.walk.timeScale = 1;
    }
    if (actions?.run) {
      actions.run.setEffectiveWeight(0);
      actions.run.timeScale = 1;
    }
    if (actions?.jump) {
      actions.jump.setEffectiveWeight(0);
      actions.jump.stop();
    }
  }

  function updateAnimation(delta, moving, running, planarSpeed) {
    const actions = currentActions();
    if (!actions?.idle || !actions?.walk) {
      setWalking?.(moving);
      if (actions?.walk) actions.walk.timeScale = running ? runSpeedMultiplier : 1;
      return;
    }

    const clampedDelta = Math.min(delta, 0.05);
    if (actions.jump) {
      if (jumpRequested && !jumpPlaying) {
        actions.jump.reset().play();
        jumpPlaying = true;
      }
      const jumpDuration = actions.jump.getClip().duration;
      if (jumpPlaying && (actions.jump.paused || actions.jump.time >= jumpDuration - 0.2)) {
        jumpPlaying = false;
      }
      jumpWeight = THREE.MathUtils.damp(jumpWeight, jumpPlaying ? 1 : 0, 14, clampedDelta);
    }
    jumpRequested = false;

    // This mirrors Controller Test / Water Lab: movement input gates the
    // locomotion layer, while actual planar velocity times the clips.
    const locomotionTarget = grounded && moving ? 1 : 0;
    walkWeight = THREE.MathUtils.damp(walkWeight, locomotionTarget, 10, clampedDelta);
    const sprinting = running || planarSpeed > RUN_BLEND_MIN_SPEED;
    runBlend = THREE.MathUtils.damp(runBlend, actions.run && sprinting && moving ? 1 : 0, 10, clampedDelta);

    const activeJumpWeight = actions.jump ? jumpWeight : 0;
    const locomotionWeight = walkWeight * (1 - activeJumpWeight);
    const runWeight = locomotionWeight * runBlend;
    const walkActionWeight = locomotionWeight - runWeight;
    const idleWeight = (1 - walkWeight) * (1 - activeJumpWeight);

    actions.idle.setEffectiveWeight(idleWeight);
    actions.walk.setEffectiveWeight(walkActionWeight);
    actions.walk.timeScale = THREE.MathUtils.clamp(planarSpeed / WALK_ACTION_REFERENCE_SPEED, 0.65, 1.45);
    if (actions.run) {
      actions.run.setEffectiveWeight(runWeight);
      actions.run.timeScale = THREE.MathUtils.clamp(planarSpeed / RUN_ACTION_REFERENCE_SPEED, 0.75, 1.35);
    }
    actions.jump?.setEffectiveWeight(activeJumpWeight);
  }

  function rotateWalkerToward(walker, targetYaw, delta) {
    const current = walker.rotation.y;
    const diff = Math.atan2(Math.sin(targetYaw - current), Math.cos(targetYaw - current));
    const step = THREE.MathUtils.clamp(diff, -turnSpeed * delta, turnSpeed * delta);
    walker.rotation.y = current + step;
  }

  engine.onFrame((delta) => {
    const walker = getWalker?.();
    if (!enabled() || !walker) {
      setWalking?.(false);
      clearInput();
      resetJump(walker);
      return;
    }

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    else forward.normalize();
    right.crossVectors(forward, DEFAULT_UP);

    targetVelocity.set(0, 0, 0);
    if (anyPressed(pressed, WALK_FORWARD_CODES)) targetVelocity.add(forward);
    if (anyPressed(pressed, WALK_BACK_CODES)) targetVelocity.sub(forward);
    if (anyPressed(pressed, WALK_RIGHT_CODES)) targetVelocity.add(right);
    if (anyPressed(pressed, WALK_LEFT_CODES)) targetVelocity.sub(right);

    const moving = targetVelocity.lengthSq() > 0;
    const running = moving && anyPressed(pressed, WALK_RUN_CODES);
    const baseSpeed = speed ?? maxVelLimit;
    const horizontalSpeed = baseSpeed * (running ? runSpeedMultiplier : 1);
    if (moving) {
      movingDirection.copy(targetVelocity).normalize();
      targetVelocity.copy(movingDirection).multiplyScalar(horizontalSpeed);
    }

    if (moving) {
      const wantToMoveMagnitude = velocity.dot(movingDirection);
      wantToMoveVelocity.copy(movingDirection).multiplyScalar(wantToMoveMagnitude);
      rejectVelocity.copy(velocity).sub(wantToMoveVelocity);
      moveAcceleration.set(
        (targetVelocity.x - (velocity.x + rejectVelocity.x * rejectVelMult)) / accDeltaTime,
        0,
        (targetVelocity.z - (velocity.z + rejectVelocity.z * rejectVelMult)) / accDeltaTime,
      );
      const targetYaw = Math.atan2(movingDirection.x, movingDirection.z);
      const yawDelta = Math.atan2(
        Math.sin(targetYaw - walker.rotation.y),
        Math.cos(targetYaw - walker.rotation.y),
      );
      const characterRotated = Math.abs(Math.sin(yawDelta)) < 0.001;
      const impulseScale = (characterRotated ? 1 : turnVelMultiplier)
        * (grounded ? 1 : airDragMultiplier);
      velocity.addScaledVector(moveAcceleration, impulseScale);
      rotateWalkerToward(walker, targetYaw, delta);
    } else if (grounded) {
      velocity.x += -velocity.x * dragDampingC;
      velocity.z += -velocity.z * dragDampingC;
    }

    previousPosition.copy(walker.position);
    if (velocity.lengthSq() > 0) {
      moveStep.copy(velocity).multiplyScalar(delta);
      if (moveHorizontal) moveHorizontal(moveStep, { delta, moving, running, walker });
      else walker.position.add(moveStep);
    }

    const walkerGroundY = groundHeightAt(walker.position.x, walker.position.z);
    if (grounded && walker.position.y !== walkerGroundY) {
      // Grounded walkers follow the terrain profile under their feet.
      walker.position.y = walkerGroundY;
    } else if (!grounded || walker.position.y > walkerGroundY) {
      verticalVelocity -= gravity * delta;
      walker.position.y += verticalVelocity * delta;
      if (walker.position.y <= walkerGroundY) resetJump(walker);
    }

    const actualPlanarSpeed = Math.hypot(
      walker.position.x - previousPosition.x,
      walker.position.z - previousPosition.z,
    ) / Math.max(delta, 1e-5);
    updateAnimation(delta, moving, running, actualPlanarSpeed);

    // Follow only while the walker is actually in motion so an idle walker
    // never hijacks an authored camera view.
    if (moving || !grounded || velocity.lengthSq() > 1e-4) {
      controls.target.lerp(
        followTarget.set(walker.position.x, walkerGroundY + followHeight, walker.position.z),
        0.08,
      );
    }
  });

  return {
    clearInput,
    dispose() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearInput);
    },
    resetJump,
  };
}
