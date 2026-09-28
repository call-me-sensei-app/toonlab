import assert from 'node:assert/strict';
import { Scene } from 'three';

import {
  SCENE_QUALITY_PROFILES,
  SCENE_QUALITY_PROFILE_VERSION,
  createSceneQualityProfile,
  getSceneQualityProfileOptions,
  parseSceneQualityProfile,
  resolveSceneQualityProfile,
  serializeSceneQualityProfile,
  validateSceneQualityProfile,
} from '../src/styles/sceneQualityProfiles.js';
import { applySceneQualityProfile } from '../src/styles/sceneQualityApplication.js';
import { createSceneStyleRuntime } from '../src/styles/sceneStyleRuntime.js';
import { createSceneUpdateScheduler } from '../src/runtime/sceneUpdateScheduler.js';

assert.equal(SCENE_QUALITY_PROFILE_VERSION, 1);
assert.deepEqual(getSceneQualityProfileOptions().map(({ id }) => id), ['balanced', 'performance']);
assert.equal(Object.isFrozen(SCENE_QUALITY_PROFILES), true);
assert.equal(Object.isFrozen(SCENE_QUALITY_PROFILES.balanced.quality.renderer), true);

function topology(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return typeof value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, topology(value[key])]));
}

const balanced = resolveSceneQualityProfile('balanced');
const performance = resolveSceneQualityProfile('performance');
assert.deepEqual(topology(performance.quality), topology(balanced.quality));

function assertNoMoreExpensive(performanceValue, balancedValue, path = 'quality') {
  for (const key of Object.keys(balancedValue)) {
    const nextPath = `${path}.${key}`;
    if (typeof balancedValue[key] === 'number') {
      if (key === 'chunkWorldSize') continue;
      assert.ok(performanceValue[key] <= balancedValue[key], `${nextPath} must not increase cost`);
    } else assertNoMoreExpensive(performanceValue[key], balancedValue[key], nextPath);
  }
}
assertNoMoreExpensive(performance.quality, balanced.quality);

const serialized = serializeSceneQualityProfile(balanced);
assert.deepEqual(parseSceneQualityProfile(serialized).value, balanced);
assert.equal(validateSceneQualityProfile(performance).ok, true);

balanced.quality.renderer.maxPixelRatio = 99;
assert.equal(SCENE_QUALITY_PROFILES.balanced.quality.renderer.maxPixelRatio, 2,
  'resolved built-ins must be detached');

assert.throws(() => resolveSceneQualityProfile('ultra-secret'), /Unknown scene quality profile/);
assert.throws(() => createSceneQualityProfile('bad_style_leak', {
  label: 'Bad',
  quality: { ...performance.quality, styleBundleId: 'call-me-sensei' },
}), /styleBundleId/);
assert.throws(() => createSceneQualityProfile('bad_unknown_budget', {
  label: 'Bad',
  quality: {
    ...performance.quality,
    renderer: { ...performance.quality.renderer, bloomColor: '#ffffff' },
  },
}), /bloomColor/);
assert.throws(() => createSceneQualityProfile('bad_lod', {
  label: 'Bad',
  quality: {
    ...performance.quality,
    catalog: { ...performance.quality.catalog, lodNear: 90, lodMid: 40 },
  },
}), /LOD distances/);
for (const [system, field] of [
  ['cloud', 'cloudShadowResolution'],
  ['shadows', 'mapSize'],
  ['vegetation', 'maxInstances'],
  ['water', 'maxPasses'],
]) {
  assert.throws(() => createSceneQualityProfile(`fractional_${system}_${field}`, {
    label: 'Bad fractional discrete budget',
    quality: {
      ...performance.quality,
      [system]: { ...performance.quality[system], [field]: performance.quality[system][field] + 0.5 },
    },
  }), /must be an integer/);
}

const qualitySubjects = {
  lighting: {
    quality: { id: 'source', label: 'Source', maxDistance: 500, maxShadowedLights: 2 },
    setQuality(next) { this.quality = { ...next }; },
  },
  sky: {
    quality: { cloudHistoryDiv: 4 },
    qualityLevel: 'low',
    setQualityLevel(level, next) { this.qualityLevel = level; this.quality = { ...next }; },
  },
  vegetation: {
    qualityBudget: { lodDistances: [1, 2, 3], maxVisibleInstances: 5 },
    setQualityBudget(next) { this.qualityBudget = { ...next }; },
  },
  water: {
    passes: { stats: { quality: { maxPasses: 1 } } },
    setQualityBudget(next) { this.passes.stats.quality = { ...next }; },
  },
};
const qualityTransaction = await applySceneQualityProfile('balanced', qualitySubjects);
assert.deepEqual(
  qualityTransaction.applied,
  ['lighting', 'sky', 'water', 'vegetation:0'],
);
assert.equal(qualitySubjects.lighting.quality.maxDistance, balanced.quality.shadows.maxDistance);
assert.equal(qualitySubjects.sky.quality.cloudShadowResolution, balanced.quality.cloud.cloudShadowResolution);
assert.equal(qualitySubjects.water.passes.stats.quality.maxPasses, balanced.quality.water.maxPasses);
assert.deepEqual(
  qualitySubjects.vegetation.qualityBudget.lodDistances,
  [
    balanced.quality.vegetation.lodNear,
    balanced.quality.vegetation.lodMid,
    balanced.quality.vegetation.lodFar,
  ],
);
await qualityTransaction.revert();
assert.equal(qualitySubjects.lighting.quality.id, 'source');
assert.equal(qualitySubjects.sky.qualityLevel, 'low');
assert.equal(qualitySubjects.water.passes.stats.quality.maxPasses, 1);
assert.deepEqual(qualitySubjects.vegetation.qualityBudget.lodDistances, [1, 2, 3]);

let schedulerClock = 0;
const scheduler = createSceneUpdateScheduler({ clock: () => schedulerClock, maxFrameMs: 5 });
scheduler.register({ id: 'costly', update: () => { schedulerClock += 6; } });
assert.equal(scheduler.update().overBudget, true);
assert.equal(scheduler.lastFrame.budgetMs, 5);
scheduler.setFrameBudget(8);
assert.equal(scheduler.update().overBudget, false);
scheduler.dispose();

let runtimePixelRatio = 2.5;
const renderer = {
  isWebGPURenderer: false,
  shadowMap: { enabled: false, type: null },
  toneMappingExposure: 1,
  getPixelRatio: () => runtimePixelRatio,
  setPixelRatio: (value) => { runtimePixelRatio = value; },
};
const styleRuntime = createSceneStyleRuntime({
  quality: 'performance',
  renderer,
  rendererConfiguration: { devicePixelRatio: 3 },
  scene: new Scene(),
});
assert.equal(styleRuntime.quality.id, 'performance');
await styleRuntime.apply('call-me-sensei');
assert.equal(runtimePixelRatio, 1.25, 'style runtime applies the selected profile renderer budget');
await styleRuntime.dispose();
assert.equal(runtimePixelRatio, 2.5, 'style runtime restores the host pixel ratio');

console.log('Scene quality profile verification passed.');
