import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  applyWaterInteractionFrame,
  createWaterInteractionController,
  enforceWaterInteractionFrame,
} from '../src/character/waterInteractionController.js';

const waterState = { contains: true, height: 2, level: 2 };
const water = {
  contains: () => waterState.contains,
  getFlowAt: () => ({ x: 0.3, y: -0.1 }),
  getHeightAt: () => waterState.height,
  getLevel: () => waterState.level,
};
const controller = createWaterInteractionController({ ground: () => 0 });

let frame = controller.update({
  position: { x: 0, y: 2.1, z: 0 },
  velocity: { x: 0, y: -0.2, z: 0 },
  water,
});
assert.equal(frame.transition, 'enter');
assert.equal(frame.swimming, true);
assert.equal(frame.gravityScale, 0);

for (let index = 0; index < 180; index += 1) {
  frame = controller.update({ position: frame.position, velocity: frame.velocity, water }, 1 / 60);
}
assert.equal(frame.state, 'surface');
assert.ok(Math.abs(frame.position.y - 1.8) < 0.03, 'surface mode follows the wave height');
assert.equal(frame.surfaced, true);

const surfaceY = frame.position.y;
frame = controller.update({
  diving: true,
  move: { x: 0, z: 1 },
  position: frame.position,
  velocity: frame.velocity,
  water,
}, 1 / 60);
assert.equal(frame.state, 'dive');
assert.ok(frame.position.y < surfaceY, 'dive moves below the surface');

frame = controller.update({
  move: { x: 1, z: 0 },
  position: frame.position,
  sprinting: true,
  velocity: frame.velocity,
  water,
}, 1 / 60);
assert.equal(frame.sprinting, true);
assert.ok(frame.constraints.maxPlanarSpeed > 3, 'flow headroom extends sprint cap');

const calls = [];
const body = {
  userData: {},
  gravity: 1,
  position: { x: 0, y: frame.position.y + 3, z: 0 },
  velocity: { x: 20, y: 5, z: 0 },
  gravityScale() { return this.gravity; },
  linvel() { return this.velocity; },
  translation() { return this.position; },
  setGravityScale(value) { this.gravity = value; calls.push('gravity'); },
  setLinvel(value) { this.velocity = value; calls.push('velocity'); },
  setTranslation(value) { this.position = value; calls.push('position'); },
};
applyWaterInteractionFrame(body, frame);
assert.equal(body.gravity, 0);
assert.equal(body.userData.canJump, false);
body.velocity = { x: 20, y: 5, z: 0 };
body.position = { x: 0, y: frame.constraints.maxY + 3, z: 0 };
enforceWaterInteractionFrame(body, frame);
assert.ok(Math.hypot(body.velocity.x, body.velocity.z) <= frame.constraints.maxPlanarSpeed + 1e-9);
assert.equal(body.velocity.y, 0);
assert.equal(body.position.y, frame.constraints.maxY);

waterState.level = 0.8;
frame = controller.update({ position: frame.position, velocity: frame.velocity, water });
assert.equal(frame.transition, 'exit');
assert.equal(frame.swimming, false);
assert.equal(frame.gravityScale, 1);

waterState.level = 2;
waterState.contains = false;
controller.reset();
frame = controller.update({ position: { x: 0, y: 0, z: 0 }, velocity: {}, water });
assert.equal(frame.swimming, false);

const playgroundSource = await readFile(
  new URL('../labs/playground/ecctrlMain.jsx', import.meta.url),
  'utf8',
);
const showcaseSource = await readFile(
  new URL('../labs/playground/ShowcaseCharacter.jsx', import.meta.url),
  'utf8',
);
assert.match(showcaseSource, /createWalkableCharacterRuntime/);
for (const retiredLocalImplementation of [
  'createWaterInteractionController',
  'applyWaterInteractionFrame',
  'enforceWaterInteractionFrame',
  'swimEnforceRef',
  'horizontalBlend',
  'surfaceTargetY =',
  'swimmingRef',
]) {
  assert.equal(
    `${playgroundSource}\n${showcaseSource}`.includes(retiredLocalImplementation),
    false,
    `Playground must not restore local swim runtime: ${retiredLocalImplementation}`,
  );
}

console.log('Water interaction controller verification passed.');
