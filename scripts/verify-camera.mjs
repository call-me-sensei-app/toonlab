// Camera Lab/runtime verification. Run directly with:
//   node scripts/verify-camera.mjs

import process from 'node:process';
import * as THREE from 'three';

import {
  CAMERA_PRESET_DOCUMENT_TYPE,
  createCameraDirector,
  createCameraGeneratorRecipeDocument,
  createCameraPresetDocument,
  createCameraRig,
  generateCameraPreset,
  getCameraGeneratorArchetypeOptions,
  getCameraOperatorOptions,
  parseCameraGeneratorRecipeDocument,
  parseCameraPresetDocument,
  registerCameraGeneratorArchetype,
  serializeCameraGeneratorRecipeDocument,
  serializeCameraPresetDocument,
  validateCameraGeneratorRecipeDocument,
} from '../src/camera/index.js';
import { stableStringify } from '../src/core/generation.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function signature(preset) {
  return stableStringify({ operators: preset.operators, settings: preset.settings });
}

// --- generator documents and deterministic breadth ---------------------------
const recipe = createCameraGeneratorRecipeDocument('verify_camera', {
  basePreset: 'adventure',
  label: 'Verifier camera family',
  seed: 420,
});
check('generator recipe uses shared camera document contract', recipe.type === 'toonlab/camera-generator');
check('built-in archetypes are editable starting families', getCameraGeneratorArchetypeOptions().length >= 3);

const sameA = generateCameraPreset(recipe, { seed: 999 });
const sameB = generateCameraPreset(recipe, { seed: 999 });
const different = generateCameraPreset(recipe, { seed: 1000 });
check('same recipe + seed is exactly deterministic', signature(sameA) === signature(sameB));
check('a different seed changes the resolved camera', signature(sameA) !== signature(different));

const generatedSignatures = new Set();
for (let seed = 1; seed <= 10000; seed += 1) {
  generatedSignatures.add(signature(generateCameraPreset(recipe, { seed })));
}
check('10,000 seeds generate 10,000 resolved candidates', generatedSignatures.size === 10000, `${generatedSignatures.size} unique`);

const lockedRecipe = createCameraGeneratorRecipeDocument('locked_camera', {
  ...recipe,
  locks: ['parameters.distance', 'settings.lens.fov'],
});
const locked = generateCameraPreset(lockedRecipe, { current: sameA, seed: 1111 });
check('locked continuous distance survives reroll', locked.settings.follow.offset[2] === sameA.settings.follow.offset[2]);
check('locked lens survives reroll', locked.settings.lens.fov === sameA.settings.lens.fov);
check('unlocked dimensions continue to generate', locked.settings.follow.offset[0] !== sameA.settings.follow.offset[0]);

const zeroMutation = generateCameraPreset(recipe, { current: sameA, mutation: 0, seed: 2222 });
const fullMutation = generateCameraPreset(recipe, { current: sameA, mutation: 1, seed: 2222 });
const softMutation = generateCameraPreset(recipe, { current: sameA, mutation: 0.2, seed: 2222 });
const oldDistance = sameA.settings.follow.offset[2];
check('zero mutation preserves the current candidate', signature(zeroMutation) === signature(sameA));
check('full mutation reaches the seeded candidate', signature(fullMutation) !== signature(sameA));
check('soft mutation stays between current and generated continuous values',
  Math.abs(softMutation.settings.follow.offset[2] - oldDistance)
  <= Math.abs(fullMutation.settings.follow.offset[2] - oldDistance) + 1e-9);

registerCameraGeneratorArchetype('verify_custom_family', {
  configuration: { parameters: { distance: 22, height: 9 } },
  domains: { parameters: { distance: { $type: 'range', min: 20, max: 24, step: 0.01 } } },
  label: 'Verifier custom family',
});
const customRecipe = createCameraGeneratorRecipeDocument('custom_recipe', { basePreset: 'verify_custom_family', seed: 8 });
const customPreset = generateCameraPreset(customRecipe);
check('custom generator archetypes are not constrained to built-ins', customPreset.settings.follow.offset[2] >= 20);

const generatorJson = serializeCameraGeneratorRecipeDocument(recipe);
const parsedGenerator = parseCameraGeneratorRecipeDocument(generatorJson);
check('generator JSON round-trips exactly', parsedGenerator.ok && stableStringify(parsedGenerator.value) === stableStringify(recipe));
const futureRecipe = { ...recipe, version: 999 };
check('future generator versions are rejected', !validateCameraGeneratorRecipeDocument(futureRecipe).ok);

const presetJson = serializeCameraPresetDocument(sameA);
const parsedPreset = parseCameraPresetDocument(presetJson);
check('resolved preset JSON round-trips exactly', parsedPreset.ok && serializeCameraPresetDocument(parsedPreset.value) === presetJson);
check('resolved preset is flat runtime data', parsedPreset.value.type === CAMERA_PRESET_DOCUMENT_TYPE && !('domains' in parsedPreset.value));
check('future preset versions are rejected', !parseCameraPresetDocument({ ...sameA, version: 999 }).ok);

// Unknown serialized operator types remain valid documents so a host can
// register them without asking ToonLab to add to a closed enum.
const portableCustomPreset = createCameraPresetDocument('custom_operator', {
  ...sameA,
  operators: [...sameA.operators, { id: 'custom', order: 450, type: 'verifyLift', settings: { height: 2 } }],
});
check('custom operator definitions remain portable in presets', portableCustomPreset.operators.some((entry) => entry.type === 'verifyLift'));

// --- composable rig ------------------------------------------------------------
function makeCamera() {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  camera.position.set(0, 3, 8);
  camera.updateMatrixWorld();
  return camera;
}

const target = new THREE.Object3D();
target.position.set(0, 0, 0);
target.updateMatrixWorld();
const customCamera = makeCamera();
const customRig = createCameraRig({
  camera: customCamera,
  operatorFactories: {
    verifyLift(definition) {
      return { update(context) { context.desiredPosition.y += definition.settings.height; } };
    },
  },
  operators: [
    { id: 'follow', order: 100, type: 'follow' },
    { id: 'lift', order: 200, type: 'verifyLift', settings: { height: 2 } },
    { id: 'damping', order: 500, type: 'damping' },
    { id: 'lens', order: 600, type: 'lens' },
  ],
  target,
});
customRig.update(1 / 60);
check('custom runtime operator participates in the ordered stack', customCamera.position.y > 4);
check('rig reports active composable operators', customRig.stats.activeOperators === 4);

// Exponential damping should converge identically under different frame rates
// for a constant desired target.
function simulate(frameRate) {
  const camera = makeCamera();
  const movingTarget = new THREE.Object3D();
  const rig = createCameraRig({
    camera,
    operators: [
      { id: 'follow', order: 100, type: 'follow' },
      { id: 'damping', order: 500, type: 'damping' },
      { id: 'lens', order: 600, type: 'lens' },
    ],
    settings: { damping: { position: 6, aim: 8 }, follow: { offset: [1, 3, 7] } },
    target: movingTarget,
  });
  rig.update(0);
  movingTarget.position.set(8, 0, -4);
  movingTarget.updateMatrixWorld();
  for (let frame = 0; frame < frameRate; frame += 1) rig.update(1 / frameRate);
  return camera.position.clone();
}
const at30 = simulate(30);
const at120 = simulate(120);
check('camera damping is frame-rate independent', at30.distanceTo(at120) < 1e-8, `${at30.distanceTo(at120)}`);

const collisionCamera = makeCamera();
let collisionCalls = 0;
const collisionRig = createCameraRig({
  camera: collisionCamera,
  collisionQuery: () => { collisionCalls += 1; return { distance: 2, hit: true }; },
  settings: { collision: { minimumDistance: 0.5, padding: 0.2 }, follow: { offset: [0, 2, 9], targetOffset: [0, 1.5, 0] } },
  target,
});
collisionRig.update(1 / 60);
check('optional collision query runs without a physics dependency', collisionCalls === 1);
check('collision response moves camera inside desired distance', collisionCamera.position.distanceTo(target.position) < 5);
check('collision hit is visible in runtime stats', collisionRig.stats.collisionHit && collisionRig.stats.collisionHits === 1);

const impulseCamera = makeCamera();
const impulseRig = createCameraRig({ camera: impulseCamera, target });
impulseRig.update(1 / 60);
impulseRig.addImpulse({ position: [0.5, 0.2, 0], rotation: [0.02, 0.03, 0], duration: 0.2, seed: 4 });
impulseRig.update(1 / 60);
check('impulse layer tracks active recoil/shake', impulseRig.stats.activeImpulses === 1);
for (let frame = 0; frame < 30; frame += 1) impulseRig.update(1 / 60);
check('impulse layer releases expired entries', impulseRig.stats.activeImpulses === 0);

function simulateNoise(seed, frameCount) {
  const camera = makeCamera();
  const rig = createCameraRig({
    camera,
    settings: {
      noise: {
        enabled: true,
        frequency: 1.37,
        lacunarity: 1.83,
        octaves: 3,
        persistence: 0.56,
        positionAmplitude: 0.08,
        rotationAmplitude: 0.02,
        seed,
      },
    },
    target,
  });
  rig.update(0);
  for (let frame = 0; frame < frameCount; frame += 1) rig.update(1 / frameCount);
  const sample = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
  };
  rig.dispose();
  return sample;
}
const noiseA = simulateNoise(77, 60);
const noiseB = simulateNoise(77, 60);
const noiseDifferentSeed = simulateNoise(78, 60);
const noiseAt240 = simulateNoise(77, 240);
check('built-in procedural noise operator is registered', getCameraOperatorOptions().includes('noise'));
check('equal seed and elapsed time produce deterministic camera noise',
  stableStringify({ position: noiseA.position.toArray(), quaternion: noiseA.quaternion.toArray() })
    === stableStringify({ position: noiseB.position.toArray(), quaternion: noiseB.quaternion.toArray() }));
check('procedural noise seed changes the resolved motion',
  noiseA.position.distanceTo(noiseDifferentSeed.position) > 1e-4 || noiseA.quaternion.angleTo(noiseDifferentSeed.quaternion) > 1e-4);
check('time-based procedural noise reaches the same sample across frame rates',
  noiseA.position.distanceTo(noiseAt240.position) < 1e-9 && noiseA.quaternion.angleTo(noiseAt240.quaternion) < 1e-6);
check('noise settings are generator dimensions, not a fixed catalog entry', recipe.domains.settings.noise?.seed?.$type === 'range');

// --- director ------------------------------------------------------------------
const directorCamera = makeCamera();
const director = createCameraDirector(directorCamera, { defaultBlendDuration: 0.2 });
const low = director.addRig('low', { settings: { follow: { offset: [-2, 2, 6] } }, target }, { priority: 1 });
const high = director.addRig('high', { settings: { follow: { offset: [2, 4, 10] } }, target }, { priority: 10 });
director.update(1 / 60);
check('director selects highest-priority enabled rig', director.activeId === 'high');
director.setEnabled('high', false, { duration: 0 });
director.update(1 / 60);
check('director falls back when a rig is disabled', director.activeId === 'low');
director.setActive('high', { duration: 0.1 });
director.setEnabled('high', true, { duration: 0.1 });
for (let frame = 0; frame < 12; frame += 1) director.update(1 / 60);
check('director blends explicit rig transitions to completion', director.activeId === 'high' && director.stats.transitionProgress === 1);
check('director exposes lifecycle statistics', director.stats.rigCount === 2 && director.stats.switches >= 2);

// --- lifecycle -----------------------------------------------------------------
const updatesBeforeDispose = customRig.stats.updates;
customRig.dispose();
customRig.update(1 / 60);
check('disposed rig is inert and reports disposal', customRig.stats.disposed && customRig.stats.updates === updatesBeforeDispose);
collisionRig.dispose();
impulseRig.dispose();
director.dispose();
check('director disposes owned rigs and becomes inert', director.stats.disposed && low.disposed && high.disposed);

if (failures > 0) {
  console.error(`\n${failures} camera verification check(s) failed.`);
  process.exit(1);
}
console.log('\nCamera generator, documents, composable rig, collision, impulses, director, and lifecycle verified.');
