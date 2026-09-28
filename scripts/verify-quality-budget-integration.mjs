import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector2 } from 'three';

import { resolveCatalogLodDistancesForQuality } from '../src/catalog/officialCatalogPlacement.js';
import { resolveSceneQualityProfile } from '../src/styles/sceneQualityProfiles.js';
import { createCallMeSenseiGrassField } from '../src/vegetation/callMeSenseiGrass.js';
import { WaterScenePasses } from '../src/water/waterScenePasses.js';
import { WaterSurface } from '../src/water/waterSurface.js';

const balanced = resolveSceneQualityProfile('balanced');
const performance = resolveSceneQualityProfile('performance');

assert.deepEqual(resolveCatalogLodDistancesForQuality(balanced), [0, 32, 95, 220]);
assert.deepEqual(resolveCatalogLodDistancesForQuality(performance), [0, 22, 64, 150]);
assert.deepEqual(resolveCatalogLodDistancesForQuality(null, [0, 12, 40]), [0, 12, 40]);

const placements = [];
for (let index = 0; index < 12; index += 1) {
  placements.push({ x: (index % 4) - 1.5, y: 0, z: -18 - Math.floor(index / 4) * 2 });
  placements.push({ x: (index % 4) - 1.5, y: 0, z: 45 + Math.floor(index / 4) * 2 });
}
const grass = await createCallMeSenseiGrassField({ placements });
assert.deepEqual(grass.qualityBudget.lodDistances, [24, 70, 400],
  'the first-party grass factory must apply Balanced without scene wiring');
const camera = new PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 2, 0);
camera.lookAt(0, 0, -10);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
grass.setQualityBudget({
  chunkSize: balanced.quality.vegetation.chunkWorldSize,
  cullPadding: balanced.quality.vegetation.cullPadding,
  lodDistances: [
    balanced.quality.vegetation.lodNear,
    balanced.quality.vegetation.lodMid,
    balanced.quality.vegetation.lodFar,
  ],
  maxVisibleChunks: balanced.quality.vegetation.maxVisibleChunks,
  maxVisibleInstances: 5,
});
grass.updateLods(camera);
const grassStats = grass.cullingStats;
assert.ok(grassStats.visibleInstances > 0 && grassStats.visibleInstances <= 5);
assert.ok(grassStats.culledInstances > 0, 'rear-facing instances must be culled');
assert.ok(grassStats.visibleChunks < grassStats.totalChunks, 'rear-facing chunks must be culled');
assert.equal(grass.userData.grassSpatialCulling.chunkSize, 16);
grass.dispose();

const passes = new WaterScenePasses();
passes.setQualityBudget(balanced.quality.water);
assert.equal(passes.stats.configuredMaximumSceneRenders, 3);
assert.equal(passes.stats.enabled.reflection, true);
const sizeRenderer = { getDrawingBufferSize: (target) => target.copy(new Vector2(1000, 500)) };
passes.ensureGrabTarget(sizeRenderer);
passes.ensureReflectionTarget(sizeRenderer);
assert.deepEqual(passes.stats.targets.grab, { height: 500, width: 1000 });
assert.deepEqual(passes.stats.targets.depth, { height: 375, width: 750 });
assert.deepEqual(passes.stats.targets.reflection, { height: 250, width: 500 });
passes.setQualityBudget(performance.quality.water);
passes.ensureGrabTarget(sizeRenderer);
assert.equal(passes.stats.configuredMaximumSceneRenders, 2);
assert.equal(passes.stats.enabled.reflection, false);
assert.deepEqual(passes.stats.targets.grab, { height: 375, width: 750 });
assert.deepEqual(passes.stats.targets.depth, { height: 250, width: 500 });
passes.dispose();

const defaultWater = new WaterSurface({
  maxSegments: 16,
  segmentsPerMeter: 1,
  simulation: false,
  splashes: false,
  width: 2,
  depth: 2,
});
assert.deepEqual(defaultWater.passes.stats.quality, balanced.quality.water,
  'WaterSurface must apply Balanced without scene wiring');
defaultWater.dispose();

const vegetationSource = await readFile(
  new URL('../labs/playground/scenes/vegetation.jsx', import.meta.url),
  'utf8',
);
const waterSource = await readFile(
  new URL('../labs/playground/scenes/waterScenes.jsx', import.meta.url),
  'utf8',
);
const catalogSource = await readFile(
  new URL('../labs/playground/scenes/officialCatalogRock.jsx', import.meta.url),
  'utf8',
);
assert.match(vegetationSource, /WALKABLE_QUALITY_PROFILE/,
  'scene composition may read profile distances while authoring a sparse far field');
assert.match(vegetationSource, /grassBudgetCulledClumps/);
assert.doesNotMatch(waterSource, /setQualityBudget\(/,
  'WaterSurface owns the default quality mapping');
assert.doesNotMatch(catalogSource, /quality:/,
  'official catalog placement owns the default quality mapping');

console.log('Quality budget integration verification passed.');
