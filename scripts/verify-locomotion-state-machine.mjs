import assert from 'node:assert/strict';

import {
  applyLocomotionFrame,
  createLocomotionStateMachine,
  LOCOMOTION_ROLES,
} from '../src/character/locomotionStateMachine.js';

function settle(machine, input, frames = 90) {
  let frame;
  for (let index = 0; index < frames; index += 1) frame = machine.update(input, 1 / 60);
  return frame;
}

const machine = createLocomotionStateMachine();
let frame = machine.update({ grounded: true }, 1 / 60);
assert.equal(frame.state, 'idle');
assert.ok(frame.weights.idle > 0.99);

frame = settle(machine, { grounded: true, moving: true, speed: 1.45 });
assert.equal(frame.state, 'walk');
assert.ok(frame.weights.walk > 0.99);
assert.ok(Math.abs(frame.timeScales.walk - 1) < 1e-6);

frame = settle(machine, { grounded: true, moving: true, speed: 4, sprinting: true });
assert.equal(frame.state, 'run');
assert.ok(frame.weights.run > 0.99);

frame = machine.update({ grounded: true, jumpPressed: true, moving: true, speed: 2 }, 1 / 60);
assert.deepEqual(frame.events, [{ type: 'jump-start' }]);
frame = settle(machine, { grounded: false, moving: true, speed: 2, verticalVelocity: 1 }, 12);
assert.ok(frame.weights.jump > 0.7);
frame = machine.update({ grounded: true, landed: true, verticalVelocity: -1 }, 1 / 60);
assert.equal(frame.events[0].type, 'land');

frame = settle(machine, { grounded: false, swimming: true, speed: 0 }, 90);
assert.equal(frame.state, 'tread');
assert.ok(frame.weights.tread > 0.99);
frame = settle(machine, { diving: true, grounded: false, moving: true, speed: 1.5, swimming: true }, 90);
assert.equal(frame.state, 'dive');
assert.ok(frame.weights.dive > 0.99);
frame = settle(machine, {
  grounded: false,
  moving: true,
  speed: 4,
  swimming: true,
  swimSprinting: true,
}, 90);
assert.equal(frame.state, 'freestyle');
assert.ok(frame.weights.freestyle > 0.95);

frame = settle(machine, { grounded: true, sitting: true }, 120);
assert.equal(frame.state, 'sit');
assert.ok(frame.weights.sit > 0.99);

const missingWaterRoles = createLocomotionStateMachine();
frame = settle(missingWaterRoles, {
  grounded: false,
  moving: true,
  roles: { idle: true, swim: true },
  speed: 1,
  swimming: true,
});
assert.equal(frame.weights.tread, 0);
assert.ok(frame.weights.swim > 0.99, 'missing tread falls back to swim');

const actions = Object.fromEntries(LOCOMOTION_ROLES.map((role) => [role, {
  setEffectiveWeight(value) { this.weight = value; },
  timeScale: 1,
}]));
applyLocomotionFrame(actions, frame);
assert.equal(actions.swim.weight, frame.weights.swim);
assert.equal(actions.walk.timeScale, frame.timeScales.walk);

const deterministicA = createLocomotionStateMachine();
const deterministicB = createLocomotionStateMachine();
const inputs = Array.from({ length: 180 }, (_, index) => ({
  grounded: index < 60,
  moving: index % 40 < 25,
  speed: (index % 7) * 0.7,
  sprinting: index % 30 < 10,
  swimming: index >= 120,
}));
for (const input of inputs) {
  assert.deepEqual(deterministicA.update(input, 1 / 60), deterministicB.update(input, 1 / 60));
}

console.log('Locomotion state machine verification passed.');
