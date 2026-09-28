import assert from 'node:assert/strict';

import {
  applyGroundStabilizerFrame,
  createGroundSampler,
  createGroundStabilizer,
} from '../src/character/groundStabilizer.js';

const terrain = (x, z) => 0.35 * Math.sin(x * 0.4) + 0.2 * Math.cos(z * 0.3);
const sampler = createGroundSampler(terrain);
const stabilizer = createGroundStabilizer({ bodyOffset: 1, ground: sampler });

const suspensionOwned = createGroundStabilizer({
  bodyOffset: 0.9,
  ground: () => 0,
  lockGrounded: false,
});
const suspensionFrame = suspensionOwned.update({
  grounded: true,
  position: { x: 0, y: 0.78, z: 0 },
  velocity: { x: 0, y: 0.05, z: 0 },
});
assert.equal(suspensionFrame.correction, 'none');
assert.equal(suspensionFrame.canJump, true);
assert.equal(suspensionFrame.position.y, 0.78);

for (let index = -80; index <= 80; index += 1) {
  const x = index * 0.25;
  const z = index * -0.17;
  const targetY = terrain(x, z) + 1;
  const frame = stabilizer.update({
    grounded: true,
    position: { x, y: targetY - 0.12, z },
    velocity: { x: 1.2, y: -0.4, z: 0.2 },
  });
  assert.equal(frame.correction, 'lock');
  assert.ok(Math.abs(frame.position.y - targetY) < 1e-12, 'feet follow uneven ground');
  assert.equal(frame.velocity.x, 1.2, 'horizontal velocity is preserved');
  assert.equal(frame.velocity.y, 0, 'residual vertical bounce is cleared');
}

let frame = stabilizer.update({
  grounded: false,
  position: { x: 2, y: terrain(2, 3) - 2, z: 3 },
  velocity: { x: 0.3, y: -12, z: 0.4 },
});
assert.equal(frame.correction, 'recover');
assert.equal(frame.canJump, true);

frame = stabilizer.update({
  grounded: true,
  jumpReleased: true,
  position: { x: 0, y: terrain(0, 0) + 1.15, z: 0 },
  velocity: { x: 0, y: 0.8, z: 0 },
});
assert.equal(frame.correction, 'none', 'jump release prevents ground pinning');

frame = stabilizer.update({
  enabled: false,
  grounded: true,
  position: { x: 0, y: -20, z: 0 },
  velocity: { x: 0, y: -5, z: 0 },
});
assert.equal(frame.correction, 'none', 'water/controller modes can suspend stabilization');

const calls = [];
const body = {
  userData: {},
  rotation: () => ({ x: 0.2, y: 0.3, z: -0.1, w: 0.92 }),
  angvel: () => ({ x: 2, y: 0.4, z: 3 }),
  setTranslation: (value) => calls.push(['translation', value]),
  setLinvel: (value) => calls.push(['velocity', value]),
  setRotation: (value) => calls.push(['rotation', value]),
  setAngvel: (value) => calls.push(['angular', value]),
};
applyGroundStabilizerFrame(body, stabilizer.update({
  grounded: true,
  position: { x: 1, y: terrain(1, 1) + 0.9, z: 1 },
  velocity: { x: 1, y: -0.2, z: 0 },
}));
assert.equal(body.userData.canJump, true);
assert.deepEqual(calls.map(([kind]) => kind), ['translation', 'velocity', 'rotation', 'angular']);
assert.equal(calls[2][1].x, 0);
assert.equal(calls[2][1].z, 0);
assert.equal(calls[3][1].x, 0);
assert.equal(calls[3][1].z, 0);

assert.throws(() => createGroundSampler(), /ground query/);
console.log('Ground stabilizer verification passed.');
