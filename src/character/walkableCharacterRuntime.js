import * as THREE from 'three';

import { createCharacterRuntime } from './characterRuntime.js';
import { createCharacterRenderPasses } from '../toon/characterRenderPasses.js';
import { sceneCollisionRuntimeFor } from '../runtime/sceneCollisionRuntime.js';
import {
  applyGroundStabilizerFrame,
  createGroundStabilizer,
} from './groundStabilizer.js';
import {
  applyLocomotionFrame,
  createLocomotionStateMachine,
} from './locomotionStateMachine.js';
import {
  applyWaterInteractionFrame,
  createWaterInteractionController,
  enforceWaterInteractionFrame,
} from './waterInteractionController.js';

export const DEFAULT_CHARACTER_CONTROLLER_PROFILE = Object.freeze({
  capsuleHalfHeight: 0.54,
  capsuleRadius: 0.28,
  floatHeight: 0.18,
  springSag: 0.04,
  targetHeight: 1.7,
});

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function createCharacterControllerProfile(input = {}) {
  const capsuleHalfHeight = positive(
    input.capsuleHalfHeight,
    DEFAULT_CHARACTER_CONTROLLER_PROFILE.capsuleHalfHeight,
  );
  const capsuleRadius = positive(
    input.capsuleRadius,
    DEFAULT_CHARACTER_CONTROLLER_PROFILE.capsuleRadius,
  );
  const floatHeight = positive(input.floatHeight, DEFAULT_CHARACTER_CONTROLLER_PROFILE.floatHeight);
  const springSag = positive(input.springSag, DEFAULT_CHARACTER_CONTROLLER_PROFILE.springSag);
  const bodyCenterAtRest = capsuleHalfHeight + capsuleRadius + floatHeight;
  return Object.freeze({
    bodyCenterAtRest,
    capsuleHalfHeight,
    capsuleRadius,
    floatHeight,
    modelOffsetY: -bodyCenterAtRest + springSag,
    springSag,
    targetHeight: positive(input.targetHeight, DEFAULT_CHARACTER_CONTROLLER_PROFILE.targetHeight),
  });
}

function readBody(body) {
  return {
    grounded: Boolean(body?.userData?.canJump),
    position: body?.translation?.() ?? { x: 0, y: 0, z: 0 },
    velocity: body?.linvel?.() ?? { x: 0, y: 0, z: 0 },
  };
}

function availableRoles(actions) {
  return Object.fromEntries(Object.entries(actions ?? {})
    .filter(([, action]) => typeof action?.setEffectiveWeight === 'function')
    .map(([role]) => [role, true]));
}

/**
 * High-level, framework-neutral composition of character loading, animation,
 * controller offsets, uneven ground, and water interaction.
 */
export async function createWalkableCharacterRuntime(options = {}) {
  const profile = createCharacterControllerProfile(options.controller);
  const loadCharacter = options.loadCharacter ?? createCharacterRuntime;
  const renderContext = {
    camera: options.camera ?? options.character?.camera,
    renderer: options.renderer ?? options.character?.renderer,
    scene: options.scene ?? options.character?.scene,
  };
  let renderPasses = options.renderPasses === false
    ? null
    : options.renderPasses ?? options.character?.renderPasses ?? null;
  let ownsRenderPasses = false;
  if (!options.characterRuntime
    && !renderPasses
    && renderContext.camera
    && renderContext.renderer
    && renderContext.scene) {
    const createRenderPasses = options.createRenderPasses ?? createCharacterRenderPasses;
    renderPasses = createRenderPasses(renderContext);
    ownsRenderPasses = true;
  }
  const characterOptions = {
    targetHeight: profile.targetHeight,
    ...(options.character ?? {}),
  };
  if (renderPasses && !characterOptions.renderPasses) characterOptions.renderPasses = renderPasses;
  const character = options.characterRuntime ?? await loadCharacter(characterOptions);
  const collisionRuntime = options.collision === false
    ? null
    : options.collision
      ?? sceneCollisionRuntimeFor(renderContext.scene);
  const collisionWorld = collisionRuntime?.world ?? collisionRuntime;
  const locomotion = createLocomotionStateMachine(options.locomotion);
  const ground = createGroundStabilizer({
    bodyOffset: profile.bodyCenterAtRest,
    ground: options.ground ?? (() => 0),
    ...(options.groundStabilizer ?? {}),
  });
  const water = createWaterInteractionController({
    ground: options.ground ?? (() => 0),
    ...(options.waterInteraction ?? {}),
  });
  const roles = availableRoles(character.actions);
  let disposed = false;
  let frame = null;
  const renderSize = new THREE.Vector2();
  let renderWidth = 0;
  let renderHeight = 0;

  function updateRenderPasses() {
    if (!renderPasses) return;
    if (ownsRenderPasses && renderContext.renderer?.getDrawingBufferSize) {
      renderContext.renderer.getDrawingBufferSize(renderSize);
      if (renderSize.x !== renderWidth || renderSize.y !== renderHeight) {
        renderWidth = renderSize.x;
        renderHeight = renderSize.y;
        renderPasses.setSize?.(renderWidth, renderHeight, 1);
      }
    }
    renderPasses.update?.();
  }

  function update(input = {}, delta = 1 / 60) {
    if (disposed) return null;
    const body = input.body;
    const initial = readBody(body);
    const waterFrame = water.update({
      diving: input.diving,
      facingYaw: input.facingYaw,
      move: input.move,
      position: input.position ?? initial.position,
      rising: input.rising,
      sprinting: input.swimSprinting ?? input.sprinting,
      velocity: input.velocity ?? initial.velocity,
      water: input.water,
    }, delta);
    if (body) applyWaterInteractionFrame(body, waterFrame);

    const afterWater = waterFrame.active
      ? { position: waterFrame.position, velocity: waterFrame.velocity }
      : initial;
    const groundFrame = ground.update({
      enabled: input.groundEnabled !== false && !waterFrame.active,
      grounded: waterFrame.active ? false : (input.grounded ?? initial.grounded),
      jumpReleased: input.jumpReleased,
      position: afterWater.position,
      velocity: afterWater.velocity,
    });
    if (body) applyGroundStabilizerFrame(body, groundFrame, { upright: input.upright !== false });
    const collisionPosition = {
      x: groundFrame.position.x,
      y: groundFrame.position.y,
      z: groundFrame.position.z,
    };
    const collisionEnabled = input.collisionEnabled !== false
      && typeof collisionWorld?.resolve === 'function';
    if (collisionEnabled) {
      collisionWorld.resolve(collisionPosition, profile.capsuleRadius);
    }
    const collisionCorrected = collisionEnabled && (
      collisionPosition.x !== groundFrame.position.x
      || collisionPosition.z !== groundFrame.position.z
    );
    if (body && collisionCorrected) body.setTranslation?.(collisionPosition, true);
    const collisionFrame = Object.freeze({
      corrected: collisionCorrected,
      enabled: collisionEnabled,
      position: Object.freeze(collisionPosition),
      radius: profile.capsuleRadius,
    });

    const actions = character.actions;
    const jumpAction = actions?.jump;
    if (input.jumpPressed && groundFrame.canJump && !waterFrame.active && jumpAction) {
      jumpAction.reset?.();
      jumpAction.play?.();
    }
    const jumpDuration = jumpAction?.getClip?.()?.duration;
    const jumpFinished = input.jumpFinished ?? Boolean(
      jumpAction && (jumpAction.paused
        || (Number.isFinite(jumpDuration) && jumpAction.time >= jumpDuration - 0.2)),
    );
    const speed = waterFrame.active
      ? waterFrame.planarSpeed
      : Math.hypot(groundFrame.velocity.x, groundFrame.velocity.z);
    const locomotionFrame = locomotion.update({
      diving: waterFrame.diving,
      grounded: groundFrame.canJump && !waterFrame.active,
      jumpFinished,
      jumpPressed: input.jumpPressed,
      landed: input.landed,
      moving: input.moving ?? speed > 0.1,
      roles,
      sitting: input.sitting,
      speed,
      sprinting: input.sprinting,
      swimming: waterFrame.active,
      swimSprinting: waterFrame.sprinting,
      verticalVelocity: groundFrame.velocity.y,
    }, delta);
    applyLocomotionFrame(actions, locomotionFrame);
    character.update?.(delta);
    updateRenderPasses();
    frame = Object.freeze({
      collision: collisionFrame,
      ground: groundFrame,
      locomotion: locomotionFrame,
      position: collisionFrame.position,
      profile,
      revision: locomotionFrame.revision,
      velocity: groundFrame.velocity,
      water: waterFrame,
    });
    return frame;
  }

  return Object.freeze({
    character,
    collision: collisionRuntime,
    get frame() { return frame; },
    ground,
    locomotion,
    profile,
    renderPasses,
    update,
    water,
    enforce(body) {
      return enforceWaterInteractionFrame(body, frame?.water);
    },
    dispose(options) {
      if (disposed) return;
      disposed = true;
      character.dispose?.(options);
      if (ownsRenderPasses) renderPasses?.dispose?.();
    },
    setAnimationEnabled(enabled) {
      return character.setAnimationEnabled?.(enabled);
    },
  });
}

/** Safe replace-in-place owner for character picker and scene transitions. */
export function createWalkableCharacterSlot({ createRuntime = createWalkableCharacterRuntime } = {}) {
  let current = null;
  let generation = 0;
  let disposed = false;

  return Object.freeze({
    get current() { return current; },
    async replace(options) {
      if (disposed) throw new Error('Walkable character slot is disposed.');
      const request = ++generation;
      const next = await createRuntime(options);
      if (disposed || request !== generation) {
        next.dispose?.();
        return current;
      }
      const previous = current;
      current = next;
      previous?.dispose?.();
      return current;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      current?.dispose?.();
      current = null;
    },
  });
}
