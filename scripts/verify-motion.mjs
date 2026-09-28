import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import {
  MOTION_PRESET_DOCUMENT_TYPE,
  MOTION_SETTING_FIELD_SCHEMA,
  MOTION_SETTING_GROUPS,
  createDefaultMotionGeneratorRecipe,
  createHarmonicMotionClip,
  createKeyframeMotionClip,
  createMotionClipSlots,
  createMotionController,
  createMotionGeneratorRecipeDocument,
  createMotionGraph,
  createMotionSettings,
  createObjectMotionRig,
  parseMotionGeneratorRecipeDocument,
  parseMotionPresetDocument,
  resolveMotionGeneratorRecipe,
  serializeMotionGeneratorRecipeDocument,
  serializeMotionPresetDocument,
  validateMotionGraph,
  validateMotionPresetDocument,
} from '../src/motion/index.js';
import { stableStringify } from '../src/core/generation.js';

function section(label) {
  process.stdout.write(`motion: ${label}\n`);
}

function vector(x = 0, y = 0, z = 0) {
  return { x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; } };
}

function object(name = '') {
  return { name, position: vector(), rotation: vector(), scale: vector(1, 1, 1) };
}

section('settings schema and normalization');
assert.equal(MOTION_SETTING_GROUPS.length, 7);
for (const group of MOTION_SETTING_GROUPS) {
  assert.ok(MOTION_SETTING_FIELD_SCHEMA[group.id]);
  assert.ok(Object.keys(MOTION_SETTING_FIELD_SCHEMA[group.id]).length > 0);
}
const sanitized = createMotionSettings({
  playback: { cadence: 'stepped', sampleRate: 999, speed: -3 },
  rootMotion: { policy: 'extract', axes: [true, true, false] },
  squash: { amount: 0.22, verticalParameter: 'vy' },
});
assert.equal(sanitized.playback.cadence, 'stepped');
assert.equal(sanitized.playback.sampleRate, 240);
assert.equal(sanitized.playback.speed, 0);
assert.deepEqual(sanitized.rootMotion.axes, [true, true, false]);
assert.equal(sanitized.squash.verticalParameter, 'vy');

section('unbounded graph and clip-slot topology');
const arbitrarySlots = Object.fromEntries(Array.from({ length: 1200 }, (_, index) => [
  `project-slot-${index}`,
  { source: { uri: `asset://motions/${index}`, revision: index }, loop: index % 3 !== 0, speed: 0.5 + (index % 20) * 0.05 },
]));
const arbitraryStates = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [
  `state-${index}`,
  {
    node: index % 3 === 0
      ? {
        type: 'blend2d', parameterX: 'x', parameterY: 'y', children: [
          { x: -1, y: 0, slot: `project-slot-${index}` },
          { x: 1, y: 0, slot: `project-slot-${index + 1}` },
          { x: 0, y: 1, slot: `project-slot-${index + 2}` },
        ],
      }
      : { type: 'clip', slot: `project-slot-${index}` },
    transitions: index < 299 ? [{ to: `state-${index + 1}`, when: { parameter: 'advance', op: 'triggered' } }] : [],
    layers: [{ id: `layer-${index}`, mode: 'additive', weight: 0.2, mask: [`custom-role-${index}`], node: { type: 'clip', slot: `project-slot-${600 + index}` } }],
  },
]));
const arbitraryGraph = createMotionGraph({
  id: 'user-authored-thousands',
  initial: 'state-0',
  parameters: { x: { type: 'number' }, y: { type: 'number' }, advance: { type: 'trigger' } },
  states: arbitraryStates,
});
const arbitraryBindings = createMotionClipSlots(arbitrarySlots);
const graphValidation = validateMotionGraph(arbitraryGraph, { clipSlots: arbitraryBindings });
assert.equal(graphValidation.ok, true, graphValidation.errors.join(' '));
assert.equal(Object.keys(graphValidation.value.states).length, 300);
assert.equal(Object.keys(arbitraryBindings).length, 1200);
assert.equal(graphValidation.warnings.length, 0);

section('deterministic generator recipes and locks');
const recipe = createDefaultMotionGeneratorRecipe({ id: 'verification-family', seed: 9142 });
const first = resolveMotionGeneratorRecipe(recipe, { seed: 777 });
const second = resolveMotionGeneratorRecipe(recipe, { seed: 777 });
assert.equal(stableStringify(first), stableStringify(second));
assert.equal(first.type, MOTION_PRESET_DOCUMENT_TYPE);
assert.match(first.generation.signature, /^[0-9a-f]{8}$/);

const lockedRecipe = createMotionGeneratorRecipeDocument('locked-family', {
  ...recipe,
  configuration: {
    ...recipe.configuration,
    settings: {
      ...recipe.configuration.settings,
      bob: { ...recipe.configuration.settings.bob, amplitude: 0.123 },
    },
  },
  locks: ['settings.bob.amplitude'],
});
assert.equal(resolveMotionGeneratorRecipe(lockedRecipe, { seed: 1 }).configuration.settings.bob.amplitude, 0.123);
assert.equal(resolveMotionGeneratorRecipe(lockedRecipe, { seed: 999999 }).configuration.settings.bob.amplitude, 0.123);

const generationStarted = performance.now();
const signatures = new Set();
for (let seed = 1; seed <= 10_000; seed += 1) {
  signatures.add(resolveMotionGeneratorRecipe(recipe, { seed }).generation.signature);
}
const generationMs = performance.now() - generationStarted;
assert.ok(signatures.size > 9_800, `Expected broad generator diversity, got ${signatures.size} / 10000`);
assert.ok(generationMs < 15_000, `10000 recipes took ${generationMs.toFixed(0)}ms`);
process.stdout.write(`motion: 10000 seeds -> ${signatures.size} signatures in ${generationMs.toFixed(0)}ms\n`);

section('preset and generator document round trips');
const presetJson = serializeMotionPresetDocument(first);
const parsedPreset = parseMotionPresetDocument(presetJson);
assert.equal(parsedPreset.ok, true, parsedPreset.errors.join(' '));
assert.equal(serializeMotionPresetDocument(parsedPreset.value), presetJson);
const recipeJson = serializeMotionGeneratorRecipeDocument(recipe);
const parsedRecipe = parseMotionGeneratorRecipeDocument(recipeJson);
assert.equal(parsedRecipe.ok, true, parsedRecipe.errors.join(' '));
assert.equal(serializeMotionGeneratorRecipeDocument(parsedRecipe.value), recipeJson);
assert.equal(parseMotionPresetDocument('{ nope').ok, false);
assert.equal(validateMotionPresetDocument({ ...first, version: 999 }).ok, false);
assert.equal(validateMotionGraph({ id: 'empty', initial: '', states: {} }).ok, false);

section('clip sampling, blend spaces, layers, events, and missing bones');
const idle = createHarmonicMotionClip({
  id: 'idle-source', duration: 1,
  channels: { chest: { rotation: [{ axis: 1, amplitude: 0.1, frequency: 1 }] } },
});
const walk = createKeyframeMotionClip({
  id: 'walk-source',
  duration: 1,
  root: [
    { time: 0, position: [0, 0, 0] },
    { time: 1, position: [0, 0, 1] },
  ],
  tracks: {
    hips: [
      { time: 0, rotation: [0, 0, 0] },
      { time: 1, rotation: [0.8, 0, 0] },
    ],
    optionalCape: [{ time: 0, rotation: [0, 0, 0.4] }],
  },
});
const wave = createKeyframeMotionClip({
  id: 'wave-source', duration: 1,
  tracks: { chest: [{ time: 0, rotation: [0, 0, 0.4] }] },
});
const air = createKeyframeMotionClip({
  id: 'air-source', duration: 1,
  tracks: { hips: [{ time: 0, rotation: [-0.3, 0, 0] }] },
});
const runtimeGraph = {
  id: 'runtime-test', initial: 'move',
  parameters: {
    speed: { type: 'number', default: 0 },
    grounded: { type: 'boolean', default: true },
    jump: { type: 'trigger', default: false },
  },
  states: {
    move: {
      node: { type: 'blend1d', parameter: 'speed', children: [{ threshold: 0, slot: 'idle' }, { threshold: 1, slot: 'walk' }] },
      layers: [{ id: 'upper', node: { type: 'clip', slot: 'wave' }, mode: 'additive', weight: 0.5, mask: ['chest'] }],
      transitions: [{ to: 'air', priority: 2, when: { parameter: 'grounded', op: 'falsy' }, duration: 0.05 }],
    },
    air: { node: { type: 'clip', slot: 'air' }, transitions: [{ to: 'move', when: { parameter: 'grounded', op: 'truthy' } }] },
  },
};
const runtimeSlots = {
  idle: { source: 'idle', loop: true },
  walk: { source: 'walk', loop: true, events: [{ time: 0.25, name: 'footstep', payload: { foot: 'left' } }] },
  wave: { source: 'wave', loop: true },
  air: { source: 'air', loop: true },
};
const root = object('root');
const hips = object('hips');
const chest = object('chest');
const rig = createObjectMotionRig(root, { roles: { hips, chest }, missingBonePolicy: 'ignore' });
const events = [];
const controller = createMotionController({
  graph: runtimeGraph,
  clipSlots: runtimeSlots,
  clips: { idle, walk, wave, air },
  rig,
  parameters: { speed: 1, grounded: true },
  settings: {
    playback: { maxDelta: 1 },
    rootMotion: { policy: 'extract', axes: [true, true, true] },
    lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false },
  },
  onEvent: (event) => events.push(event),
});
const start = controller.update(0.1);
assert.deepEqual(start.rootMotion, [0, 0, 0]);
const moving = controller.update(0.2);
assert.ok(Math.abs(moving.rootMotion[2] - 0.2) < 1e-6, `root delta ${moving.rootMotion[2]}`);
assert.ok(Math.abs(chest.rotation.z - 0.2) < 1e-6, `layered chest ${chest.rotation.z}`);
assert.equal(events.filter((event) => event.name === 'footstep').length, 1);
assert.equal(controller.stats().missingBoneCount, 1);
assert.deepEqual(controller.stats().missingBones, ['optionalCape']);
controller.setParameter('grounded', false);
const transitioning = controller.update(0.03);
assert.equal(transitioning.state, 'air');
assert.equal(transitioning.transitioning, true);
controller.update(0.04);
assert.equal(controller.stats().activeState, 'air');
assert.equal(controller.stats().transition, null);

section('stepped cadence and loop-safe event tracks');
const cadenceClip = createKeyframeMotionClip({
  id: 'cadence', duration: 1,
  tracks: { hips: [{ time: 0, rotation: [0, 0, 0] }, { time: 1, rotation: [1, 0, 0] }] },
});
const cadenceController = createMotionController({
  graph: { id: 'cadence', initial: 'only', parameters: {}, states: { only: { node: { type: 'clip', slot: 'motion' } } } },
  clipSlots: { motion: { source: 'motion', loop: true, events: [{ time: 0.25, name: 'beat' }] } },
  clips: { motion: cadenceClip },
  settings: { playback: { cadence: 'stepped', sampleRate: 10, maxDelta: 2 }, lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false } },
});
const heldA = cadenceController.update(0.04).pose.bones.hips.rotation[0];
const heldB = cadenceController.update(0.04).pose.bones.hips.rotation[0];
const nextFrame = cadenceController.update(0.04).pose.bones.hips.rotation[0];
assert.equal(heldA, 0);
assert.equal(heldB, 0);
assert.ok(Math.abs(nextFrame - 0.1) < 1e-6);
cadenceController.reset();
const loopEvents = [
  ...cadenceController.update(1).events,
  ...cadenceController.update(0.3).events,
].filter((event) => event.name === 'beat');
assert.equal(loopEvents.length, 2, `Expected events at .25 and 1.25, got ${loopEvents.length}`);

section('bounded extreme-speed event traversal and missing-slot statistics');
const tinyEmptyClip = createHarmonicMotionClip({ id: 'tiny-empty', duration: 0.001 });
const emptyEventController = createMotionController({
  graph: { id: 'empty-events', initial: 'only', parameters: {}, states: { only: { node: { type: 'clip', slot: 'tiny' } } } },
  clipSlots: { tiny: { source: 'tiny', loop: true, speed: 1_000_000_000, events: [] } },
  clips: { tiny: tinyEmptyClip },
  settings: { playback: { maxDelta: 1 }, events: { maxPerUpdate: 4 }, lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false } },
});
const emptyStarted = performance.now();
assert.equal(emptyEventController.update(1).events.length, 0);
assert.ok(performance.now() - emptyStarted < 500, 'empty event tracks must not traverse elapsed loop cycles');

const onceEventController = createMotionController({
  graph: { id: 'once-events', initial: 'only', parameters: {}, states: { only: { node: { type: 'clip', slot: 'tiny' } } } },
  clipSlots: { tiny: { source: 'tiny', loop: true, speed: 1_000_000_000, events: [{ time: 0.0005, name: 'once', once: true }] } },
  clips: { tiny: tinyEmptyClip },
  settings: { playback: { maxDelta: 1 }, events: { maxPerUpdate: 4 }, lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false } },
});
const onceStarted = performance.now();
assert.equal(onceEventController.update(1).events.filter((event) => event.name === 'once').length, 1);
assert.ok(performance.now() - onceStarted < 500, 'once-only event tracks must have a bounded cycle budget');

const unboundController = createMotionController({
  graph: {
    id: 'unbound-stats', initial: 'only', parameters: {},
    states: { only: { node: { type: 'clip', slot: 'ghost-a' }, layers: [{ id: 'missing-layer', node: { type: 'clip', slot: 'ghost-b' } }] } },
  },
  clipSlots: {},
});
unboundController.update(0.016);
assert.equal(unboundController.stats().boundClipCount, 0);
assert.ok(unboundController.stats().missingSlotCount >= 2);

section('root-motion apply adapter and controller disposal');
const applied = [];
const applyController = createMotionController({
  graph: { id: 'apply', initial: 'only', parameters: {}, states: { only: { node: { type: 'clip', slot: 'walk' } } } },
  clipSlots: { walk: { source: 'walk' } },
  clips: { walk },
  rig: { applyPose() {}, applyRootMotion(delta) { applied.push(delta); }, stats: () => ({}) },
  settings: { playback: { maxDelta: 1 }, rootMotion: { policy: 'apply', axes: [true, true, true] }, lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false } },
});
applyController.update(0.1);
applyController.update(0.2);
assert.ok(Math.abs(applied.at(-1)[2] - 0.2) < 1e-6);

const turn = createKeyframeMotionClip({
  id: 'turn-source', duration: 1,
  root: [
    { time: 0, rotation: [0, 0, 0] },
    { time: 1, rotation: [0, Math.PI / 2, 0] },
  ],
});
const appliedTurns = [];
const yawController = createMotionController({
  graph: { id: 'turn-apply', initial: 'only', parameters: {}, states: { only: { node: { type: 'clip', slot: 'turn' } } } },
  clipSlots: { turn: { source: 'turn', loop: true } },
  clips: { turn },
  rig: { applyPose() {}, applyRootMotion(delta, yaw) { appliedTurns.push({ delta, yaw }); }, stats: () => ({}) },
  settings: {
    playback: { maxDelta: 1 },
    rootMotion: { policy: 'apply', axes: [true, true, true], applyYaw: true },
    lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false },
  },
});
yawController.update(0.1);
const turning = yawController.update(0.2);
assert.ok(Math.abs(turning.rootYaw - Math.PI * 0.1) < 1e-6, `root yaw ${turning.rootYaw}`);
assert.ok(Math.abs(appliedTurns.at(-1).yaw - turning.rootYaw) < 1e-9, 'applyYaw must reach the rig adapter');
assert.equal(turning.pose.root.rotation[1], 0, 'applied yaw must be removed from the local pose to avoid double rotation');

const ignoredYaw = [];
const noYawController = createMotionController({
  graph: { id: 'turn-no-yaw', initial: 'only', parameters: {}, states: { only: { node: { type: 'clip', slot: 'turn' } } } },
  clipSlots: { turn: { source: 'turn', loop: true } },
  clips: { turn },
  rig: { applyPose() {}, applyRootMotion(delta, yaw) { ignoredYaw.push(yaw); }, stats: () => ({}) },
  settings: { playback: { maxDelta: 1 }, rootMotion: { policy: 'apply', applyYaw: false }, lean: { enabled: false }, bob: { enabled: false }, squash: { enabled: false } },
});
noYawController.update(0.1);
noYawController.update(0.2);
assert.equal(ignoredYaw.at(-1), 0, 'disabled applyYaw must pass zero yaw to the adapter');
const updateCount = controller.stats().updateCount;
controller.dispose({ disposeRig: true });
controller.dispose();
assert.equal(controller.stats().disposed, true);
controller.update(1);
assert.equal(controller.stats().updateCount, updateCount);
cadenceController.dispose();
applyController.dispose();
emptyEventController.dispose();
onceEventController.dispose();
unboundController.dispose();
yawController.dispose();
noYawController.dispose();

process.stdout.write('motion: all checks passed\n');
