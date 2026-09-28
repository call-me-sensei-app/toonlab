import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Scene } from 'three';

import {
  SCENE_UPDATE_PHASES,
  SCENE_UPDATE_SCHEDULER_VERSION,
  SceneUpdateSchedulerError,
  createSceneUpdateScheduler,
} from '../src/runtime/index.js';
import { createSceneStyleRuntime } from '../src/styles/sceneStyleRuntime.js';

assert.equal(SCENE_UPDATE_SCHEDULER_VERSION, 1);
assert.deepEqual(SCENE_UPDATE_PHASES, [
  'input', 'character', 'environment', 'lighting', 'shadows',
  'simulation', 'visibility', 'render-passes', 'diagnostics',
]);

const calls = [];
let tick = 0;
const scheduler = createSceneUpdateScheduler({ clock: () => tick++ });
scheduler.register({ id: 'diagnostics', phase: 'diagnostics', update: () => calls.push('diagnostics') });
scheduler.register({ id: 'light-late', phase: 'lighting', priority: 10, update: () => calls.push('light-late') });
scheduler.register({ id: 'environment', phase: 'environment', update: () => calls.push('environment') });
scheduler.register({ id: 'light-first', phase: 'lighting', priority: -10, update: () => calls.push('light-first') });
scheduler.register({ id: 'light-equal-a', phase: 'lighting', update: () => calls.push('light-equal-a') });
scheduler.register({ id: 'light-equal-b', phase: 'lighting', update: () => calls.push('light-equal-b') });
const ordered = scheduler.update({ delta: 1 / 60 });
assert.deepEqual(calls, [
  'environment', 'light-first', 'light-equal-a', 'light-equal-b', 'light-late', 'diagnostics',
]);
assert.deepEqual(ordered.completedTaskIds, calls);
assert.equal(ordered.frameIndex, 0);
assert.ok(ordered.durationMs >= 0);
assert.equal(Object.isFrozen(ordered), true);
assert.equal(Object.isFrozen(ordered.taskTimings), true);
assert.throws(() => scheduler.register({ id: 'environment', update() {} }), /already registered/);

const mutationCalls = [];
const mutationScheduler = createSceneUpdateScheduler();
let added = false;
let laterRegistration;
mutationScheduler.register({
  id: 'mutator',
  phase: 'input',
  update: ({ scheduler: activeScheduler }) => {
    mutationCalls.push('mutator');
    if (!added) {
      added = true;
      activeScheduler.register({ id: 'next-frame', phase: 'character', update: () => mutationCalls.push('next-frame') });
      laterRegistration.dispose();
    }
  },
});
laterRegistration = mutationScheduler.register({
  id: 'removed-during-frame',
  phase: 'simulation',
  update: () => mutationCalls.push('removed-during-frame'),
});
mutationScheduler.update();
assert.deepEqual(mutationCalls, ['mutator', 'removed-during-frame']);
mutationCalls.length = 0;
mutationScheduler.update();
assert.deepEqual(mutationCalls, ['mutator', 'next-frame']);

const continueScheduler = createSceneUpdateScheduler({ errorMode: 'continue' });
continueScheduler.register({ id: 'bad', phase: 'input', update: () => { throw new Error('expected'); } });
continueScheduler.register({ id: 'good', phase: 'lighting', update: () => {} });
const continued = continueScheduler.update();
assert.deepEqual(continued.completedTaskIds, ['good']);
assert.deepEqual(continued.errors.map(({ taskId }) => taskId), ['bad']);

const throwScheduler = createSceneUpdateScheduler();
throwScheduler.register({ id: 'async', update: () => Promise.resolve() });
assert.throws(
  () => throwScheduler.update(),
  (error) => error instanceof SceneUpdateSchedulerError
    && error.taskId === 'async'
    && error.frame.errors[0].message === 'Scene update tasks must be synchronous.',
);
assert.equal(throwScheduler.dispose(), true);
assert.equal(throwScheduler.dispose(), false);
assert.throws(() => throwScheduler.update(), /disposed/);

const styleRuntimeSource = await readFile(
  new URL('../src/styles/sceneStyleRuntime.js', import.meta.url),
  'utf8',
);
const playgroundSource = await readFile(
  new URL('../labs/playground/ecctrlMain.jsx', import.meta.url),
  'utf8',
);
assert.match(styleRuntimeSource, /id: 'toonlab:ground-field',[\s\S]*phase: 'render-passes'/);
assert.match(styleRuntimeSource, /id: 'toonlab:lighting',[\s\S]*phase: 'lighting'/);
assert.match(styleRuntimeSource, /id: 'toonlab:sun-shadows',[\s\S]*phase: 'shadows'/);
assert.match(styleRuntimeSource, /shadowPass\?\.update\([\s\S]*groundFieldPass\?\.invalidateColor\(\)/);
assert.match(styleRuntimeSource, /id: 'toonlab:style-discovery',[\s\S]*phase: 'diagnostics'/);
assert.doesNotMatch(styleRuntimeSource, /groundFieldPass\?\.update\(\);[\s\S]*lighting\.update\(delta, camera\)/);
assert.match(playgroundSource, /schedulerFrame\.completedTaskIds\.join/);

const styleRuntime = createSceneStyleRuntime({ scene: new Scene() });
await styleRuntime.apply('call-me-sensei');
const styleFrame = styleRuntime.update(1 / 60, null);
assert.deepEqual(styleFrame.completedTaskIds, [
  'toonlab:lighting',
  'toonlab:sun-shadows',
  'toonlab:ground-field',
  'toonlab:style-discovery',
]);
assert.equal(styleRuntime.scheduler, styleRuntime.scheduler);
styleRuntime.dispose();

console.log('Scene update scheduler verification passed.');
