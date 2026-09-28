import * as THREE from 'three';

import { resolveNativeLocomotionClips } from './animationRetarget.js';

/**
 * Creates one normalized locomotion action set from native or retargeted clips.
 * Callers drive weights through setLocomotionActionWeights() or use their own
 * controller; clip naming and one-shot setup no longer belong to a Lab.
 */
export function createLocomotionActions({ clips, mixer, roles = null } = {}) {
  const resolved = roles ?? resolveNativeLocomotionClips(clips);
  if (!resolved || !mixer) return null;

  const actions = { clips: resolved };
  const loop = (clip, weight) => {
    const action = mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveWeight(weight);
    action.play();
    return action;
  };

  actions.idle = loop(resolved.idle, 1);
  actions.walk = loop(resolved.walk, 0);
  if (resolved.run) actions.run = loop(resolved.run, 0);
  if (resolved.swim) actions.swim = loop(resolved.swim, 0);
  if (resolved.tread) actions.tread = loop(resolved.tread, 0);
  if (resolved.dive) actions.dive = loop(resolved.dive, 0);
  if (resolved.freestyle) actions.freestyle = loop(resolved.freestyle, 0);
  if (resolved.sit) actions.sit = loop(resolved.sit, 0);
  if (resolved.jump) {
    const jump = mixer.clipAction(resolved.jump);
    jump.reset();
    jump.enabled = true;
    jump.setLoop(THREE.LoopOnce, 0);
    jump.clampWhenFinished = true;
    jump.timeScale = Math.max(1, resolved.jump.duration / 1.25);
    jump.setEffectiveWeight(0);
    actions.jump = jump;
  }

  return actions;
}

export function setLocomotionActionWeights(actions, {
  idle = 0,
  jump = 0,
  run = 0,
  sit = 0,
  swim = 0,
  tread = 0,
  walk = 0,
  runTimeScale = 1,
  walkTimeScale = 1,
} = {}) {
  actions?.idle?.setEffectiveWeight(idle);
  actions?.walk?.setEffectiveWeight(walk);
  actions?.run?.setEffectiveWeight(run);
  actions?.jump?.setEffectiveWeight(jump);
  actions?.swim?.setEffectiveWeight(swim);
  actions?.tread?.setEffectiveWeight(tread);
  actions?.sit?.setEffectiveWeight(sit);
  if (actions?.walk) actions.walk.timeScale = walkTimeScale;
  if (actions?.run) actions.run.timeScale = runTimeScale;
  return actions;
}

export function resetLocomotionActions(actions) {
  if (!actions) return;
  setLocomotionActionWeights(actions, { idle: 1 });
  actions.jump?.stop();
}
