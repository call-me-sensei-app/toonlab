import assert from 'node:assert/strict';
import {
  createSkyCloudLabStore,
  SKY_CLOUD_LAB_STORAGE_KEY,
} from '../labs/sky-cloud-lab/ui/store.js';
import { AutoExposure } from '../labs/sky-cloud-lab/ui/autoExposure.js';
import {
  createWorkspaceStyleDocument,
  upsertSkyCloudStyle,
} from '../labs/sky-cloud-lab/ui/workspaceStyleStore.js';
import { resolveStyleBundleSettings } from '../src/styles/index.js';
import { createSkyParams } from '../src/sky/index.js';

const previousWindow = globalThis.window;
const previousStorage = globalThis.localStorage;
const values = new Map();
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};
globalThis.window = { localStorage };
globalThis.localStorage = localStorage;
const makeStore = (query = '', workspace = 'sky') => createSkyCloudLabStore({
  urlParams: new URLSearchParams(query), workspace,
});
const saved = () => JSON.parse(values.get(SKY_CLOUD_LAB_STORAGE_KEY));
const documentOnly = ({ workspaceViews, ...document }) => document;

try {
  // Two stale tabs must not rewrite each other's document or preview fields.
  const skyA = makeStore();
  const skyB = makeStore();
  const cloud = makeStore('', 'cloud');
  skyA.actions.setParam(['atmosphere', 'rayleigh'], 2.77);
  skyA.actions.saveStyleAs('Concurrent draft');
  skyA.actions.setParam(['atmosphere', 'exposure'], 1.9);
  const authored = documentOnly(saved());
  skyA.actions.setQuality('ultra');
  skyB.actions.setCameraView('upward');
  assert.equal(saved().workspaceViews.sky.quality, 'ultra');
  for (const store of [skyB, cloud]) {
    store.actions.setWeatherCondition('rain');
    store.actions.setLightingView('night');
    store.actions.setComparisonMode('physical');
    store.actions.setHeroPreview(true);
    assert.deepEqual(documentOnly(saved()), authored);
  }
  assert.equal(makeStore().getState().params.atmosphere.rayleigh, 2.77);
  assert.equal(makeStore().getState().params.atmosphere.exposure, 1.9);
  // An intentional authored edit still saves the tab's coherent document,
  // rather than mixing its parameters with another tab's saved-style ID.
  skyB.actions.setParam(['atmosphere', 'rayleigh'], 1.5);
  assert.equal(saved().activeStyleId, skyB.getState().activeStyleId);
  assert.equal(saved().styleName, skyB.getState().styleName);
  assert.deepEqual(saved().params, skyB.getState().params);

  // Preview-only first use must not create an authored draft, and migration
  // must retain an existing legacy draft when the first action changes a view.
  values.clear();
  makeStore().actions.setCameraView('skyward');
  assert.equal(saved().params, undefined);
  assert.equal(makeStore().getState().activeStyleId, 'call_me_sensei');
  values.clear();
  localStorage.setItem('toonlab.volumetricSkyLab.v12', JSON.stringify(authored));
  makeStore().actions.setQuality('low');
  assert.deepEqual(documentOnly(saved()), authored);

  values.clear();
  const document = createWorkspaceStyleDocument('audit_link', {
    label: 'Linked sky',
    params: createSkyParams({ atmosphere: { rayleigh: 2.77, exposure: 1.9 } }),
  });
  upsertSkyCloudStyle({ document, workspace: 'sky' });
  for (const key of ['skyStyle', 'style']) {
    const linked = makeStore(`${key}=audit_link&preset=hazy`);
    assert.equal(linked.getState().activeStyleId, document.id);
    assert.equal(linked.getState().styleName, document.label);
    assert.equal(linked.getState().lightingView, 'custom');
    assert.deepEqual(JSON.parse(linked.actions.exportStyleDocument()).params, document.params);
  }
  const beforeCapture = [...values];
  assert.equal(makeStore('capture=1&skyStyle=audit_link').getState().activeStyleId, document.id);
  assert.deepEqual([...values], beforeCapture);
  const missing = makeStore('skyStyle=unavailable');
  assert.match(missing.getState().entryError, /Could not open sky style/);
  missing.actions.adoptEngineState({ status: 'Preview ready.' });
  assert.ok(missing.getState().entryError, 'Renderer readiness must not hide a missing link.');
  missing.actions.openStyle('audit_link');
  assert.equal(missing.getState().entryError, null);
  const system = makeStore('skyStyle=call_me_sensei');
  assert.equal(system.getState().activeStyleId, 'call_me_sensei');
  assert.equal(system.getState().entryError, null);

  const sky = makeStore('skyStyle=audit_link');
  assert.throws(() => sky.actions.exportStyleBundle(), /full SkyParams export/);
  assert.deepEqual(JSON.parse(sky.actions.exportStyleDocument()).params, document.params);
  for (const workspace of ['cloud', 'integration']) {
    const store = makeStore('skyStyle=audit_link', workspace);
    const bundle = JSON.parse(store.actions.exportStyleBundle());
    assert.deepEqual(Object.keys(bundle.slots), ['cloud']);
    assert.equal(resolveStyleBundleSettings(bundle).cloud.shape.coverage, document.params.cloud.shape.coverage);
  }

  // A fixed meter input isolates authored brightness from adaptation. The
  // multiplier also applies after metering clamps, so it cannot be cancelled.
  const exposure = new AutoExposure();
  try {
    exposure.enabled = true;
    for (const fixed of [null, 0.7]) {
      exposure.setFixedExposure(fixed);
      exposure.update({}, 0, 1);
      const neutral = exposure.exposureUniform.value;
      for (const authored of [0, 0.1, 4]) {
        exposure.update({}, 0, authored);
        assert.ok(Math.abs(exposure.exposureUniform.value - neutral * authored) < 1e-9);
      }
    }
    exposure.setFixedExposure(null);
    exposure.adaptedLuminance = 1e-8;
    exposure.update({}, 0, 2);
    assert.equal(exposure.exposureUniform.value, exposure.maxExposure * 2);
    exposure.enabled = false;
    exposure.update({}, 0, 1.9);
    assert.equal(exposure.exposureUniform.value, 1.9);
  } finally {
    exposure.dispose();
  }
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

console.log('Sky authoring verified: concurrent preview persistence, linked documents, domain exports, and authored exposure.');
