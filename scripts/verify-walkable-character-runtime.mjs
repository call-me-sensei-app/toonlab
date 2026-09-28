import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createCharacterControllerProfile,
  createWalkableCharacterRuntime,
  createWalkableCharacterSlot,
} from '../src/character/walkableCharacterRuntime.js';
import { resolveNativeLocomotionClips } from '../src/character/animationRetarget.js';

const namespacedNativeRoles = resolveNativeLocomotionClips([
  { name: 'Rig|Idle_Loop' },
  { name: 'Rig|Walk_Loop' },
  { name: 'Rig|Sprint_Loop' },
]);
assert.equal(namespacedNativeRoles.idle.name, 'Rig|Idle_Loop');
assert.equal(namespacedNativeRoles.walk.name, 'Rig|Walk_Loop');
assert.equal(namespacedNativeRoles.run.name, 'Rig|Sprint_Loop');

function action() {
  return {
    paused: false,
    time: 0,
    timeScale: 1,
    getClip: () => ({ duration: 1 }),
    play() { this.played = true; return this; },
    reset() { this.resetCalled = true; this.time = 0; return this; },
    setEffectiveWeight(value) { this.weight = value; },
  };
}

function characterFixture(format) {
  const actions = Object.fromEntries([
    'idle', 'walk', 'run', 'jump', 'swim', 'tread', 'dive', 'freestyle', 'sit',
  ].map((role) => [role, action()]));
  return {
    actions,
    disposed: false,
    format,
    updateCount: 0,
    dispose() { this.disposed = true; },
    setAnimationEnabled(enabled) { this.animationEnabled = enabled; return enabled; },
    update() { this.updateCount += 1; },
  };
}

function bodyFixture(y = 1) {
  return {
    userData: { canJump: true },
    gravity: 1,
    position: { x: 0, y, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 },
    rotationValue: { x: 0, y: 0, z: 0, w: 1 },
    angvel() { return this.angular; },
    gravityScale() { return this.gravity; },
    linvel() { return this.velocity; },
    rotation() { return this.rotationValue; },
    translation() { return this.position; },
    setAngvel(value) { this.angular = value; },
    setGravityScale(value) { this.gravity = value; },
    setLinvel(value) { this.velocity = value; },
    setRotation(value) { this.rotationValue = value; },
    setTranslation(value) { this.position = value; },
  };
}

const profile = createCharacterControllerProfile();
assert.equal(profile.bodyCenterAtRest, 1);
assert.equal(profile.modelOffsetY, -0.96);

for (const format of ['pmx', 'vrm', 'gltf-mannequin', 'fbx-mixamo']) {
  const character = characterFixture(format);
  const runtime = await createWalkableCharacterRuntime({
    characterRuntime: character,
    ground: (x) => x * 0.1,
  });
  const body = bodyFixture(0.91);
  let frame = runtime.update({ body, moving: true, move: { x: 1, z: 0 } }, 1 / 60);
  assert.equal(frame.ground.correction, 'lock', `${format} locks to ground`);
  assert.equal(body.position.y, 1, `${format} uses shared capsule offset`);
  assert.ok(character.actions.walk.weight > 0, `${format} receives walk role`);
  frame = runtime.update({ body, jumpPressed: true, moving: true }, 1 / 60);
  assert.equal(character.actions.jump.resetCalled, true, `${format} starts jump action`);
  assert.equal(character.updateCount, 2, `${format} animation runtime advances`);
  runtime.dispose();
  assert.equal(character.disposed, true);
}

const renderPassEvents = [];
let loadedCharacterOptions = null;
const managedPasses = {
  dispose() { renderPassEvents.push('dispose'); },
  registerCharacterRoot() {},
  setSize(width, height, pixelRatio) {
    renderPassEvents.push(`size:${width}x${height}@${pixelRatio}`);
  },
  unregisterCharacterRoot() {},
  update() { renderPassEvents.push('update'); },
};
const managedCharacter = characterFixture('pmx');
const managedRuntime = await createWalkableCharacterRuntime({
  camera: { name: 'camera' },
  createRenderPasses(context) {
    assert.equal(context.renderer.name, 'renderer');
    assert.equal(context.scene.name, 'scene');
    return managedPasses;
  },
  loadCharacter(options) {
    loadedCharacterOptions = options;
    return managedCharacter;
  },
  renderer: {
    name: 'renderer',
    getDrawingBufferSize(target) { return target.set(1280, 720); },
  },
  scene: { name: 'scene' },
});
assert.equal(loadedCharacterOptions.renderPasses, managedPasses,
  'the high-level runtime wires its package-owned character passes into loading');
managedRuntime.update({}, 1 / 60);
assert.deepEqual(renderPassEvents, ['size:1280x720@1', 'update']);
managedRuntime.dispose();
assert.deepEqual(renderPassEvents, ['size:1280x720@1', 'update', 'dispose']);

let existingRuntimePassCreations = 0;
const existingRuntime = await createWalkableCharacterRuntime({
  camera: {},
  characterRuntime: characterFixture('pmx'),
  createRenderPasses() {
    existingRuntimePassCreations += 1;
    return managedPasses;
  },
  ground: () => 0,
  renderer: {},
  scene: {},
});
assert.equal(existingRuntimePassCreations, 0,
  'an existing character runtime must not receive an unregistered duplicate pass owner');
existingRuntime.dispose();

const water = {
  contains: () => true,
  getFlowAt: () => ({ x: 0, y: 0 }),
  getHeightAt: () => 2,
  getLevel: () => 2,
};
const swimmer = await createWalkableCharacterRuntime({
  characterRuntime: characterFixture('pmx'),
  ground: () => 0,
});
const swimBody = bodyFixture(2.1);
const swimFrame = swimmer.update({ body: swimBody, moving: true, move: { x: 0, z: 1 }, water });
assert.equal(swimFrame.water.transition, 'enter');
assert.equal(swimFrame.locomotion.weights.swim > 0, true);
assert.equal(swimBody.gravity, 0);
swimmer.enforce(swimBody);
swimmer.dispose();

const disposals = [];
let resolveSlow;
const slot = createWalkableCharacterSlot({
  createRuntime: ({ id }) => id === 'slow'
    ? new Promise((resolve) => { resolveSlow = () => resolve({ id, dispose: () => disposals.push(id) }); })
    : Promise.resolve({ id, dispose: () => disposals.push(id) }),
});
const slow = slot.replace({ id: 'slow' });
const fast = await slot.replace({ id: 'fast' });
assert.equal(fast.id, 'fast');
resolveSlow();
await slow;
assert.deepEqual(disposals, ['slow'], 'stale load is disposed without replacing current');
await slot.replace({ id: 'next' });
assert.deepEqual(disposals, ['slow', 'fast'], 'successful replacement disposes prior runtime');
slot.dispose();
assert.deepEqual(disposals, ['slow', 'fast', 'next']);

const showcaseSource = await readFile(
  new URL('../labs/playground/ShowcaseCharacter.jsx', import.meta.url),
  'utf8',
);
assert.match(showcaseSource, /createWalkableCharacterRuntime/);
assert.doesNotMatch(showcaseSource, /createCharacterRuntime/);

console.log('Walkable character runtime verification passed.');
