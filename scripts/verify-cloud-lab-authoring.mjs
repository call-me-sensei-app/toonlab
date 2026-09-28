import assert from 'node:assert/strict';
import { createSkyCloudLabStore, SKY_CLOUD_LAB_STORAGE_KEY } from '../labs/sky-cloud-lab/ui/store.js';
import { resolveComparisonExposure } from '../labs/sky-cloud-lab/ui/comparisonViews.js';
import { AutoExposure } from '../labs/sky-cloud-lab/ui/autoExposure.js';
import { heroCloudSkyOverrides } from '../src/cloud/index.js';

const previousWindow = globalThis.window;
const previousStorage = globalThis.localStorage;
const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
};
globalThis.window = { localStorage: storage };
globalThis.localStorage = storage;
const make = (workspace = 'cloud') => createSkyCloudLabStore({ workspace, urlParams: new URLSearchParams() });
const saved = () => JSON.parse(memory.get(SKY_CLOUD_LAB_STORAGE_KEY));
const styleOnly = ({ heroRecipe, workspaceViews, ...style }) => style;

try {
  const cloud = make();
  const sky = make('sky');
  sky.actions.setParam(['atmosphere', 'rayleigh'], 2.77);
  const authoredSky = styleOnly(saved());
  cloud.actions.setHeroRecipe(['bounds', 'diameter'], 7000);
  assert.deepEqual(styleOnly(saved()), authoredSky);
  assert.equal(saved().heroRecipe.bounds.diameter, 7000);
  assert.equal(make().getState().heroRecipe.bounds.diameter, 7000);
  // A sky edit must likewise leave a newer recipe alone.
  sky.actions.setParam(['atmosphere', 'exposure'], 1.9);
  assert.equal(saved().heroRecipe.bounds.diameter, 7000);

  for (const tab of ['cloud-look', 'cloud-style', 'preview']) {
    cloud.actions.setActiveTab('hero-cloud');
    assert.equal(cloud.getState().heroPreview, true);
    cloud.actions.setActiveTab(tab);
    assert.equal(cloud.getState().heroPreview, false, `${tab} must use authored settings`);
  }
  cloud.actions.setParam(['cloud', 'shape', 'erosionShape'], 0);
  const state = cloud.getState();
  const renderedShape = state.heroPreview
    ? heroCloudSkyOverrides(state.heroRecipe).cloud.shape
    : state.params.cloud.shape;
  assert.equal(renderedShape.erosionShape, 0);

  const savedStyle = cloud.actions.saveStyleAs('Cloud regression');
  assert.equal(savedStyle.ok, true);
  const beforeDetail = JSON.parse(cloud.actions.exportStyleDocument()).params;
  cloud.actions.preserveCloudVolumeDetail();
  const afterDetail = cloud.getState().params;
  assert.deepEqual(afterDetail.cloud.shape, beforeDetail.cloud.shape);
  assert.deepEqual(afterDetail.cloud.lighting, beforeDetail.cloud.lighting);
  assert.deepEqual(afterDetail.cloud.style.tone, beforeDetail.cloud.style.tone);
  assert.equal(afterDetail.cloud.style.innerPaint.amount, 0.55);
  assert.equal(afterDetail.cloud.style.whiteTop.detail, 0.65);
  const exported = cloud.actions.exportStyleDocument();
  for (const action of [
    () => cloud.actions.openStyle(savedStyle.document.id),
    () => cloud.actions.openStyle('call_me_sensei'),
    () => cloud.actions.importJson(exported),
    () => cloud.actions.resetPreset(),
    () => cloud.actions.setPreset('hazy'),
  ]) {
    cloud.actions.setActiveTab('hero-cloud');
    action();
    assert.equal(cloud.getState().heroPreview, false);
  }
  cloud.actions.setActiveTab('hero-cloud');
  cloud.actions.clearHeroFootprint();
  assert.equal(cloud.getState().heroRecipe.footprint.strokes.length, 0);
  cloud.actions.setActiveTab('cloud-look');
  cloud.actions.setActiveTab('hero-cloud');
  assert.equal(cloud.getState().heroRecipe.footprint.strokes.length, 0, 'Tab changes retain the recipe');

  const meter = new AutoExposure();
  meter.enabled = true;
  try {
    for (const lighting of ['preset', 'custom', 'morning', 'high-daylight', 'night']) {
      const fixed = resolveComparisonExposure(lighting, { workspace: 'cloud' });
      assert.ok(fixed > 0, `${lighting} must hold exposure for cloud comparisons`);
      meter.setFixedExposure(fixed);
      const values = [0.05, 4].map((luminance) => {
        meter.targetLuminance = luminance;
        meter.adaptedLuminance = luminance;
        meter.update({}, 1, 1.9);
        return meter.exposureUniform.value;
      });
      assert.deepEqual(values, [fixed * 1.9, fixed * 1.9]);
    }
    assert.equal(resolveComparisonExposure('preset', { workspace: 'sky' }), null);
    assert.equal(resolveComparisonExposure('custom', { workspace: 'integration' }), null);
  } finally {
    meter.dispose();
  }

  for (const windowValue of [
    {},
    { get localStorage() { throw new Error('Storage disabled'); } },
    { localStorage: { ...storage, setItem() { throw new Error('Quota exceeded'); } } },
  ]) {
    globalThis.window = windowValue;
    const before = [...memory];
    const result = cloud.actions.saveStyleAs('Must not report saved');
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /storage rejected/);
    assert.deepEqual([...memory], before);
  }
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

console.log('Cloud authoring verified: hero isolation, independent recipe persistence, fixed comparison exposure, and honest storage failures.');
