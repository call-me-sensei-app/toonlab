// Drives a weapon through a move and translates the move's event track into
// VFX spawns — the runtime glue a game uses for held-weapon attacks:
//
//   const weapon = createStylizedWeapon({ type: 'greatsword' });
//   actorGroup.add(weapon.root);
//   const attack = createMoveController({ weapon, vfx });
//   attack.play('overhead');            // on the attack input
//   attack.update(delta);               // per frame, before vfx.update
//
// The controller owns the trail lifecycle (start/stop beats live in the
// move data), fires impacts at the blade tip with the swing's real travel
// direction, and grounds landing/dust beats under the actor. Bring-your-own
// animation stays possible: skip the controller and drive vfx.spawn('slash',
// { follow: bone }) from your own clips — the moves are the batteries
// included, not a cage.

import * as THREE from 'three';

import { collectMoveEvents, getMove, sampleMovePose } from './moveLibrary.js';

const tipScratch = new THREE.Vector3();
const prevTipScratch = new THREE.Vector3();
const normalScratch = new THREE.Vector3();

export function createMoveController({ weapon, vfx, onEvent = null, groundY = 0 } = {}) {
  if (!weapon?.root) throw new Error('createMoveController needs a weapon from createStylizedWeapon().');
  const weight = weapon.profile?.weight ?? 1;

  let move = null;
  let time = 0;
  let trail = null;
  let hasPrevTip = false;

  const applyPose = (pose) => {
    weapon.root.position.set(pose.p[0], pose.p[1], pose.p[2]);
    weapon.root.rotation.set(pose.r[0], pose.r[1], pose.r[2], 'XYZ');
  };

  const tipWorld = (target) => {
    weapon.root.updateWorldMatrix(true, false);
    return target.fromArray(weapon.anchors.tip).applyMatrix4(weapon.root.matrixWorld);
  };

  const stopTrail = () => {
    trail?.stop();
    trail = null;
  };

  const controller = {
    get playing() { return move !== null; },
    get phase() { return move ? sampleMovePose(move, time, weight).phaseId : null; },

    /** Starts a move by id (restarts if one is already playing). */
    play(moveId) {
      const next = getMove(moveId);
      if (!next) {
        console.warn(`[vfxgen] Unknown move "${moveId}".`);
        return controller;
      }
      stopTrail();
      move = next;
      time = 0;
      hasPrevTip = false;
      applyPose(sampleMovePose(move, 0, weight));
      return controller;
    },

    stop() {
      stopTrail();
      move = null;
      return controller;
    },

    /** Per frame. Returns true while a move is playing. */
    update(delta) {
      if (!move) return false;
      const dt = Math.min(Math.max(delta ?? 0.016, 0), 0.1);
      const prevTime = time;
      time += dt;

      const pose = sampleMovePose(move, time, weight);
      applyPose(pose);

      // Track the tip across frames so impacts inherit the swing's real
      // travel direction (the spark spray leaves ALONG the blow).
      const tip = tipWorld(tipScratch);
      const travel = hasPrevTip
        ? normalScratch.copy(tip).sub(prevTipScratch)
        : normalScratch.set(0, 1, 0);
      if (travel.lengthSq() < 1e-8) travel.set(0, 1, 0);
      travel.normalize();

      for (const event of collectMoveEvents(move, prevTime, time, weight)) {
        onEvent?.(event);
        if (!vfx) continue;
        switch (event.do) {
          case 'trailStart': {
            stopTrail();
            // The arc reaches a touch past the physical tip — reference
            // trails overshoot the blade slightly.
            const { base, tip } = weapon.anchors;
            trail = vfx.spawn('slash', {
              base: [...base],
              follow: weapon.root,
              tip: base.map((b, i) => b + (tip[i] - b) * 1.15),
            });
            break;
          }
          case 'trailStop':
            stopTrail();
            break;
          case 'impact':
            vfx.spawn('impact', {
              at: [tip.x, Math.max(tip.y, groundY + 0.08), tip.z],
              normal: [travel.x, travel.y, travel.z],
              power: event.power ?? 1,
            });
            break;
          case 'landing':
            vfx.spawn('landing', {
              at: [weapon.root.position.x, groundY, weapon.root.position.z],
              power: event.power ?? 1,
            });
            break;
          case 'dust':
            vfx.spawn('footstep', {
              at: [weapon.root.position.x, groundY, weapon.root.position.z],
            });
            break;
          default:
            break;
        }
      }

      prevTipScratch.copy(tip);
      hasPrevTip = true;

      if (pose.done) {
        stopTrail();
        move = null;
      }
      return move !== null;
    },
  };
  return controller;
}
