export const LOCOMOTION_ROLES = Object.freeze([
  'idle',
  'walk',
  'run',
  'jump',
  'swim',
  'tread',
  'dive',
  'freestyle',
  'sit',
]);

export const DEFAULT_LOCOMOTION_STATE_MACHINE_CONFIG = Object.freeze({
  blendDamping: 10,
  jumpBlendDamping: 14,
  jumpDuration: 1.25,
  landingGrace: 0.15,
  runSpeed: 3.1,
  sitBlendDamping: 8,
  swimBlendDamping: 8,
  swimSprintSpeed: 3,
  swimStrokeGrace: 0.6,
  walkSpeed: 1.45,
});

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function damp(current, target, damping, delta) {
  return current + (target - current) * (1 - Math.exp(-Math.max(damping, 0) * delta));
}

function roleAvailable(roles, role) {
  if (roles == null) return true;
  if (Array.isArray(roles) || roles instanceof Set) return roles.includes?.(role) ?? roles.has(role);
  return Boolean(roles[role]);
}

function stateName(weights, input) {
  if (weights.sit > 0.5) return 'sit';
  if (weights.dive > 0.5) return 'dive';
  if (weights.freestyle > 0.5) return 'freestyle';
  if (weights.swim > 0.5) return 'swim';
  if (weights.tread > 0.5) return 'tread';
  if (weights.jump > 0.5) return 'jump';
  if (weights.run > weights.walk && weights.run > 0.25) return 'run';
  if (weights.walk > 0.25) return 'walk';
  return input.grounded === false ? 'airborne' : 'idle';
}

/**
 * Framework-neutral locomotion role blender. It consumes controller facts and
 * produces animation-role weights; it never reads keys, Rapier, Three actions,
 * scene refs, or model-specific clip names.
 */
export function createLocomotionStateMachine(configInput = {}) {
  const config = Object.freeze({
    ...DEFAULT_LOCOMOTION_STATE_MACHINE_CONFIG,
    ...configInput,
  });
  const blend = {
    dive: 0,
    freestyle: 0,
    jump: 0,
    jumping: false,
    jumpTime: 0,
    run: 0,
    sit: 0,
    sprintGrace: 0,
    strokeGrace: 0,
    swim: 0,
    swimMove: 0,
    walk: 0,
  };
  let revision = 0;
  let lastFrame = null;

  function reset() {
    Object.assign(blend, {
      dive: 0,
      freestyle: 0,
      jump: 0,
      jumping: false,
      jumpTime: 0,
      run: 0,
      sit: 0,
      sprintGrace: 0,
      strokeGrace: 0,
      swim: 0,
      swimMove: 0,
      walk: 0,
    });
    revision += 1;
    lastFrame = null;
  }

  function update(input = {}, deltaInput = 1 / 60) {
    const delta = clamp(deltaInput, 0, 0.1);
    const events = [];
    const speed = Math.max(Number(input.speed) || 0, 0);
    const grounded = input.grounded !== false;
    const moving = Boolean(input.moving);
    const roles = input.roles;
    const waterRoles = ['swim', 'tread', 'freestyle'].some((role) => roleAvailable(roles, role));
    const swimming = Boolean(input.swimming) && waterRoles;

    if (blend.jumping) {
      blend.jumpTime += delta;
      const landed = Boolean(input.landed)
        || (grounded && blend.jumpTime >= config.landingGrace
          && Number(input.verticalVelocity) <= 0);
      if (input.jumpFinished || landed || blend.jumpTime >= config.jumpDuration || swimming) {
        blend.jumping = false;
        events.push(Object.freeze({ type: landed ? 'land' : 'jump-end' }));
      }
    }
    if (input.jumpPressed && grounded && !swimming && !blend.jumping
      && roleAvailable(roles, 'jump')) {
      blend.jumping = true;
      blend.jumpTime = 0;
      events.push(Object.freeze({ type: 'jump-start' }));
    }

    blend.jump = damp(blend.jump, blend.jumping ? 1 : 0, config.jumpBlendDamping, delta);
    blend.walk = damp(
      blend.walk,
      grounded && moving && !swimming ? 1 : 0,
      config.blendDamping,
      delta,
    );
    const runTarget = roleAvailable(roles, 'run') && moving
      && (input.sprinting || speed > config.runSpeed) ? 1 : 0;
    blend.run = damp(blend.run, runTarget, config.blendDamping, delta);
    blend.swim = damp(blend.swim, swimming ? 1 : 0, config.swimBlendDamping, delta);

    const strokeActive = Boolean(input.diving) || moving || speed > 0.4;
    blend.strokeGrace = strokeActive
      ? config.swimStrokeGrace
      : Math.max(0, blend.strokeGrace - delta);
    blend.swimMove = damp(
      blend.swimMove,
      swimming && (strokeActive || blend.strokeGrace > 0) ? 1 : 0,
      config.swimBlendDamping,
      delta,
    );
    blend.dive = damp(
      blend.dive,
      swimming && input.diving && roleAvailable(roles, 'dive') ? 1 : 0,
      config.swimBlendDamping,
      delta,
    );
    const sprintActive = Boolean(input.swimSprinting ?? input.sprinting)
      || speed > config.runSpeed;
    blend.sprintGrace = sprintActive
      ? config.swimStrokeGrace
      : Math.max(0, blend.sprintGrace - delta);
    blend.freestyle = damp(
      blend.freestyle,
      swimming && !input.diving && roleAvailable(roles, 'freestyle')
        && (sprintActive || blend.sprintGrace > 0) ? 1 : 0,
      config.swimBlendDamping,
      delta,
    );
    blend.sit = damp(
      blend.sit,
      input.sitting && !swimming && roleAvailable(roles, 'sit') ? 1 : 0,
      config.sitBlendDamping,
      delta,
    );

    const groundScale = 1 - blend.swim;
    const seatScale = 1 - blend.sit;
    const locomotion = blend.walk * (1 - blend.jump) * groundScale * seatScale;
    const run = roleAvailable(roles, 'run') ? locomotion * blend.run : 0;
    const walk = roleAvailable(roles, 'walk') ? locomotion - run : 0;
    const idle = roleAvailable(roles, 'idle')
      ? (1 - blend.walk) * (1 - blend.jump) * groundScale * seatScale
      : 0;
    const sit = roleAvailable(roles, 'sit') ? blend.sit * groundScale : 0;
    let dive = roleAvailable(roles, 'dive') ? blend.swim * blend.dive : 0;
    let swim = (blend.swim - dive) * blend.swimMove;
    let tread = blend.swim - dive - swim;
    let freestyle = roleAvailable(roles, 'freestyle') ? swim * blend.freestyle : 0;
    swim -= freestyle;
    if (!roleAvailable(roles, 'swim')) { tread += swim; swim = 0; }
    if (!roleAvailable(roles, 'tread') && roleAvailable(roles, 'swim')) {
      swim += tread;
      tread = 0;
    }
    if (!roleAvailable(roles, 'dive')) { swim += dive; dive = 0; }
    if (!roleAvailable(roles, 'freestyle')) { swim += freestyle; freestyle = 0; }

    const weights = Object.freeze({
      dive: clamp(dive),
      freestyle: clamp(freestyle),
      idle: clamp(idle),
      jump: clamp(roleAvailable(roles, 'jump') ? blend.jump * groundScale * seatScale : 0),
      run: clamp(run),
      sit: clamp(sit),
      swim: clamp(swim),
      tread: clamp(tread),
      walk: clamp(walk),
    });
    const timeScales = Object.freeze({
      freestyle: clamp(speed / config.swimSprintSpeed, 0.8, 1.3),
      run: clamp(speed / 3, 0.75, 1.35),
      swim: clamp(speed / 1.7, 0.75, 1.35),
      walk: clamp(speed / config.walkSpeed, 0.65, 1.45),
    });
    revision += 1;
    lastFrame = Object.freeze({
      events: Object.freeze(events),
      revision,
      state: stateName(weights, { grounded }),
      timeScales,
      weights,
    });
    return lastFrame;
  }

  return Object.freeze({
    config,
    get frame() { return lastFrame; },
    reset,
    update,
  });
}

/** Apply a state-machine frame to normalized ToonLab locomotion actions. */
export function applyLocomotionFrame(actions, frame) {
  if (!actions || !frame) return actions;
  const { timeScales, weights } = frame;
  for (const role of LOCOMOTION_ROLES) {
    actions[role]?.setEffectiveWeight?.(weights[role] ?? 0);
  }
  for (const role of ['walk', 'run', 'swim', 'freestyle']) {
    if (actions[role] && Number.isFinite(timeScales[role])) actions[role].timeScale = timeScales[role];
  }
  return actions;
}
