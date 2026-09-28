// Lighting Lab contract verification: the lab authors styles + fixtures on
// top of createLightingSystem. Checks the HTML/element contract, lifecycle
// markers, deterministic scene definitions, and the thin recipe surface the
// lab shares with verify-lighting.mjs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as lighting from '../src/lighting/index.js';
import { createLabLight, exportToonLabManifest, normalizeRecipe } from '../labs/lighting-lab/lightingApi.js';
import { SCENES } from '../labs/lighting-lab/scenes.js';

const TYPES = ['ambient', 'hemisphere', 'directional', 'point', 'spot', 'rectArea', 'discArea', 'tubeArea'];
let checks = 0;

function check(label, run) {
  run();
  checks += 1;
  console.log(`ok   ${label}`);
}

const mainSource = readFileSync(new URL('../labs/lighting-lab/main.js', import.meta.url), 'utf8');
const scenesSource = readFileSync(new URL('../labs/lighting-lab/scenes.js', import.meta.url), 'utf8');
const stageSource = readFileSync(new URL('../labs/lighting-lab/lightingStage.js', import.meta.url), 'utf8');
// The ported playground water stage (browser-only module, loaded via a
// dynamic import in scenes.js).
const waterStageSource = readFileSync(new URL('../labs/lighting-lab/waterStage.js', import.meta.url), 'utf8');

check('HTML contains every required UI and readiness control', () => {
  const html = readFileSync(new URL('../lighting-lab/index.html', import.meta.url), 'utf8');
  const elementBlock = mainSource.match(/const elements = Object\.fromEntries\(\[([\s\S]*?)\]\.map/);
  assert.ok(elementBlock, 'could not inspect the required element contract');
  const requiredIds = [...elementBlock[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(requiredIds.length >= 30, 'element contract unexpectedly small');
  assert.deepEqual(requiredIds.filter((id) => !html.includes(`id="${id}"`)), []);
  assert.match(mainSource, /dataset\.labReady = 'true'/);
  assert.match(mainSource, /dataset\.runtimeReady/);
  assert.match(mainSource, /pagehide.*disposeLab/);
  assert.match(mainSource, /beforeunload.*disposeLab/);
});

check('the lab drives lighting exclusively through createLightingSystem', () => {
  assert.match(mainSource, /createLightingSystem\(/);
  assert.match(mainSource, /\.attach\(\{\s*driveSunPosition: true,\s*fog:/);
  assert.match(mainSource, /setWeatherModulation/);
  assert.match(mainSource, /advanceTime/);
  // No direct light construction outside the system (scene dressing is
  // meshes only — the ported water stage swapped the playground's scene
  // lights for the system's, so it must stay light-free too).
  for (const source of [mainSource, scenesSource, stageSource, waterStageSource]) {
    assert.ok(!/new THREE\.(Ambient|Directional|Point|Spot|RectArea|Hemisphere)Light/.test(source),
      'lab files must not create THREE lights directly');
  }
});

check('generated artifacts never depend on Math.random', () => {
  for (const source of [mainSource, scenesSource, stageSource]) {
    assert.ok(!source.includes('Math.random('), 'lab files must stay seed-deterministic');
  }
});

check('local persistence uses the lighting-lab storage keys', () => {
  assert.match(mainSource, /'toonlab\.lighting-lab\.styles'/);
  assert.match(mainSource, /'toonlab\.lighting-lab\.fixtures'/);
});

check('scene presets are data-driven and built from the composed-world systems', () => {
  assert.ok(Array.isArray(SCENES) && SCENES.length >= 3);
  for (const id of ['outdoor', 'night-camp', 'interior']) {
    const entry = SCENES.find((scene) => scene.id === id);
    assert.ok(entry, `missing scene ${id}`);
    assert.equal(typeof entry.build, 'function');
    assert.ok(Array.isArray(entry.camera) && Array.isArray(entry.target));
    assert.ok(Array.isArray(entry.fixtures));
    for (const fixtureDef of entry.fixtures) {
      assert.ok(Number.isFinite(fixtureDef.seed), `${id} fixture placements must carry explicit seeds`);
      assert.doesNotThrow(() => lighting.resolveLightFixture(fixtureDef.fixture));
    }
  }
  assert.equal(SCENES.find((scene) => scene.id === 'night-camp').timeOfDay, 21.5, 'night-camp must land at night');
  // Studio-standard content only: the outdoor/night-camp scenes are the
  // playground water scene ported verbatim (same stage module, same
  // src/water surface, same stylized sky, same broadleaf trees + grass
  // carpet), the interior is the environment-shader pipeline (adapter +
  // lamp rig) over original geometry, rockgen builds the fire ring, and the
  // walkable mannequin ships everywhere.
  assert.match(waterStageSource, /from '\.\.\/playground\/scenes\/stage\.js'/);
  assert.match(waterStageSource, /new WaterSurface\(/);
  assert.match(waterStageSource, /new StylizedSky\(/);
  assert.match(waterStageSource, /createBroadleafTreeInstance/);
  assert.match(waterStageSource, /StylizedGrassField/);
  assert.match(waterStageSource, /applyEnvironmentShader\(/);
  assert.match(scenesSource, /applyEnvironmentShader\(/);
  assert.match(scenesSource, /createEnvironmentLampRig\(/);
  assert.match(scenesSource, /applyEnvironmentLampEmissive\(/);
  assert.match(scenesSource, /createRockDocument\(/);
  assert.match(scenesSource, /mannequin\.glb/);
  assert.match(scenesSource, /createWalkPreviewActions/);
  for (const fixtureId of ['campfire', 'cms-lantern', 'paper-lantern', 'window-glow', 'shrine-candle']) {
    assert.ok(scenesSource.includes(`'${fixtureId}'`), `scenes must place ${fixtureId}`);
  }
  // The interior hands its lamp rig to the system so the style's
  // fixtureScale drives the practicals.
  assert.match(scenesSource, /attach: \{ lampRig \}/);
  assert.match(mainSource, /installWalkPreviewController\(/);
  // Rejected content stays out: no KayKit/CC0-pack code paths in scenes.
  assert.ok(!/kaykit/i.test(scenesSource + waterStageSource), 'KayKit models are rejected for lighting scenes');
});

check('all public descriptor families remain authorable through the thin API', () => {
  const recipe = normalizeRecipe({
    id: 'all-types',
    lights: TYPES.map((type, index) => createLabLight(type, { id: `${type}-${index}` })),
  });
  assert.deepEqual(recipe.lights.map((light) => light.type), TYPES);
});

check('advanced descriptor metadata survives normalization', () => {
  const light = createLabLight('spot', {
    artistic: { bandSoftness: 0.31, role: 'key' },
    color: { temperatureKelvin: 4300, tint: [1, 0.92, 0.86] },
    cookie: { channel: 'r', intensity: 0.7, key: 'window' },
    ies: { intensity: 1.4, uri: 'profiles/studio.ies' },
    linking: { excludeTags: ['ui'], includeTags: ['hero'] },
    shadow: { enabled: true, extent: 72, far: 180, mapSize: 2048 },
  });
  assert.equal(light.color.temperatureKelvin, 4300);
  assert.equal(light.cookie.key, 'window');
  assert.equal(light.ies.uri, 'profiles/studio.ies');
  assert.deepEqual(light.linking.includeTags, ['hero']);
  assert.equal(light.artistic.bandSoftness, 0.31);
  assert.equal(light.shadow.extent, 72);
});

check('the ToonLab manifest exports a rig built from placement descriptors', () => {
  const fixture = lighting.resolveLightFixture('cms-street-lamp');
  const placement = lighting.resolveFixturePlacement(fixture, { position: [4, 4.6, -8], seed: 7 });
  const manifest = JSON.parse(exportToonLabManifest({
    id: 'lab-rig',
    name: 'Lighting Lab Rig',
    lights: [placement.descriptor],
  }));
  assert.equal(manifest.type, lighting.TOONLAB_LIGHTING_MANIFEST_TYPE);
  assert.equal(manifest.platform.name, 'ToonLab');
  assert.equal(manifest.lights.length, 1);
  assert.equal(manifest.lights[0].toonlabType, 'point');
});

console.log(`\nverify-lighting-lab: ${checks} checks passed`);
