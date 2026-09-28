import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import {
  ATMOSPHERIC_CONDITION_DOCUMENT_TYPE,
  ATMOSPHERIC_CONDITION_FIELD_COUNT,
  ATMOSPHERIC_CONDITION_SETS,
  DEFAULT_ATMOSPHERIC_CONDITION_SET,
  createAtmosphericConditionDocument,
  createAtmosphericConditionSettings,
  getAtmosphericConditionOptions,
  getAtmosphericConditionSetOptions,
  parseAtmosphericConditionDocument,
  serializeAtmosphericConditionDocument,
} from '../src/atmospheric-condition/index.js';
import {
  SKY_CLOUD_ATMOSPHERE_PREVIEW_DOMAINS,
  SKY_CLOUD_ATMOSPHERE_PREVIEW_MODES,
  atmosphericPreviewPhaseForHour,
} from '../labs/shared/skyCloudAtmospherePreview.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

assert.equal(DEFAULT_ATMOSPHERIC_CONDITION_SET, 'call_me_sensei');
assert.deepEqual(Object.keys(ATMOSPHERIC_CONDITION_SETS), ['call_me_sensei']);
assert.equal(getAtmosphericConditionSetOptions()[0].label, 'Call Me Sensei');
assert.equal(getAtmosphericConditionOptions().length, 15);
assert.equal(ATMOSPHERIC_CONDITION_FIELD_COUNT, 48);

const settings = createAtmosphericConditionSettings('steadyShower');
assert.equal(settings.rain.amount, 0.66);
assert.equal('id' in settings, false);
assert.equal('label' in settings, false);

const document = createAtmosphericConditionDocument('steady_shower_test', {
  label: 'Steady Shower Test',
  settings,
});
assert.equal(document.type, ATMOSPHERIC_CONDITION_DOCUMENT_TYPE);
assert.equal(document.setId, 'call_me_sensei');
const parsed = parseAtmosphericConditionDocument(
  serializeAtmosphericConditionDocument(document),
);
assert.equal(parsed.ok, true);
assert.deepEqual(parsed.value.settings, settings);
assert.equal(parseAtmosphericConditionDocument('{}').ok, false);

assert.equal(atmosphericPreviewPhaseForHour(13), 0);
assert.equal(atmosphericPreviewPhaseForHour(18), 0.25);
assert.equal(atmosphericPreviewPhaseForHour(22), 0.5);
assert.equal(atmosphericPreviewPhaseForHour(6), 0.75);
assert.deepEqual(
  SKY_CLOUD_ATMOSPHERE_PREVIEW_DOMAINS,
  ['sky', 'cloud', 'atmosphere', 'atmospheric-condition'],
);
assert.deepEqual(
  SKY_CLOUD_ATMOSPHERE_PREVIEW_MODES.map((entry) => entry.id),
  ['diagnostic', 'native'],
);

for (const path of [
  '../atmospheric-condition-lab/index.html',
  '../labs/atmospheric-condition-lab/ui/App.jsx',
  '../labs/atmospheric-condition-lab/ui/engine.js',
  '../labs/atmospheric-condition-lab/ui/store.js',
  '../labs/shared/skyCloudAtmospherePreview.js',
]) {
  await access(new URL(path, import.meta.url));
}

const page = await read('../atmospheric-condition-lab/index.html');
const app = await read('../labs/atmospheric-condition-lab/ui/App.jsx');
const engine = await read('../labs/atmospheric-condition-lab/ui/engine.js');
const renderer = await read('../labs/shared/climatePreviewRenderer.js');
const rainRenderer = await read('../src/weather/rainFieldRenderer.js');
const effectsRenderer = await read('../src/weather/atmosphericEffectsRenderer.js');
const vite = await read('../vite.config.js');
const hub = await read('../labs/shared/sceneHub.js');

assert.match(page, /Atmospheric Condition Lab/);
assert.match(page, /labs\/atmospheric-condition-lab\/ui\/main\.jsx/);
assert.match(app, /Call Me Sensei set/);
assert.match(app, /Shader treatment and generated sky\/cloud\/volume assets are separate/);
assert.match(app, /LabTimeOfDayControl/);
assert.match(app, /atmospheric-preview-mode/);
assert.match(engine, /createSkyCloudAtmospherePreview/);
assert.match(engine, /setAuthoredBaselinesEnabled/);
assert.match(renderer, /authoredBaselines = true/);
assert.match(renderer, /!this\.useAuthoredBaselines \|\| !entry/);
assert.match(renderer, /atmospheric diagnostic depth stage/);
assert.match(renderer, /RainFieldRenderer/);
assert.match(renderer, /AtmosphericEffectsRenderer/);
assert.doesNotMatch(renderer, /function drawRain/);
assert.doesNotMatch(renderer, /function drawFlakes/);
assert.doesNotMatch(renderer, /function drawMist/);
assert.doesNotMatch(renderer, /function drawEmbers/);
assert.doesNotMatch(renderer, /function drawFlowStreaks/);
assert.doesNotMatch(renderer, /function drawElectrical/);
assert.doesNotMatch(renderer, /uv\(3\)/);
assert.match(rainRenderer, /TOONLAB_RAIN_FIELD_PROFILE/);
assert.match(rainRenderer, /cameraForwardOffsetMeters:\s*10/);
assert.match(rainRenderer, /cameraVerticalOffsetMeters:\s*8/);
assert.match(rainRenderer, /cylinderRadiusMeters:\s*12/);
assert.match(rainRenderer, /velocityMetersPerSecond:\s*Object\.freeze\(\[30,\s*40\]\)/);
assert.match(effectsRenderer, /TOONLAB_WEATHER_FIELD_PROFILES/);
assert.match(effectsRenderer, /cylinderRadiusMeters:\s*20/);
assert.match(effectsRenderer, /AtmosphericEffectsRenderer/);
assert.doesNotMatch(
  `${rainRenderer}\n${effectsRenderer}`,
  /so[\s_-]?stylized|\/Game\/|sourceAsset/i,
);
assert.match(
  vite,
  /atmosphericConditionLab:\s*resolve\(__dirname, 'atmospheric-condition-lab\/index\.html'\)/,
);
assert.match(
  hub,
  /id:\s*'atmosphericConditionLab'[\s\S]*path:\s*'\/atmospheric-condition-lab\/'/,
);

console.log(
  'Atmospheric Condition Lab verified: Call Me Sensei set, 48-field document, native/live shared preview, world-space weather fields, and route wiring.',
);
