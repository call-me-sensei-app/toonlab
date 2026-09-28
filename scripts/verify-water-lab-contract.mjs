import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createWaterStore } from '../labs/water-lab/store/waterStore.js';
import { parseStyleBundleDocument, resolveStyleBundleSettings } from '../src/styles/index.js';
import { parseWaterPresetDocument } from '../src/water/index.js';

const memory = new Map();
const localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  removeItem: (key) => memory.delete(key),
  setItem: (key, value) => memory.set(key, String(value)),
};
globalThis.localStorage = localStorage;
globalThis.window = { location: { search: '' }, localStorage };

const store = createWaterStore({ urlParams: new URLSearchParams('waterPreset=lake') });
assert.equal(store.actions.setStyle('default'), true);
store.actions.setSetting('opacity', 0.73);
const saved = store.actions.savePresetAs('Verifier Water');
assert.equal(saved.ok, true, saved.errors?.join(' '));
const presetId = saved.preset.id;

store.actions.setSetting('opacity', 0.61);
const updated = store.actions.updatePreset('Verifier Water Updated');
assert.equal(updated.ok, true, updated.errors?.join(' '));
assert.equal(store.actions.setStyle('call_me_sensei'), true);
assert.equal(store.actions.applyPreset(presetId), true);
assert.equal(store.getState().name, 'Verifier Water Updated');
assert.equal(store.getState().settings.opacity, 0.61);
assert.equal(store.getState().styleId, 'default', 'A saved water style must reopen its own material style.');

const document = parseWaterPresetDocument(store.actions.exportDocument());
assert.equal(document.ok, true, document.errors?.join(' '));
assert.equal(document.value.settings.opacity, 0.61);
assert.equal(document.value.settings.colorTone, 'classic');
const bundle = parseStyleBundleDocument(store.actions.exportStyleBundle());
assert.equal(bundle.ok, true, bundle.errors?.join(' '));
const runtimeWater = resolveStyleBundleSettings(bundle.value).water;
assert.equal(runtimeWater.opacity, 0.61);
assert.equal(runtimeWater.colorTone, 'classic');

const reloaded = createWaterStore({ urlParams: new URLSearchParams() });
assert.ok(reloaded.getState().localPresets.some(({ id }) => id === presetId));
assert.equal(reloaded.actions.applyPreset(presetId), true);
assert.equal(reloaded.getState().settings.opacity, 0.61);
assert.equal(reloaded.getState().styleId, 'default');

const sceneStore = createWaterStore({ urlParams: new URLSearchParams('waterPreset=coast&waterStage=barrel') });
assert.equal(sceneStore.getState().view.stage, 'barrel');
sceneStore.actions.setExperimentSetting('waveHeight', 3.4);
sceneStore.actions.setExperimentSetting('height', 6.2);
sceneStore.actions.setExperimentSetting('impactRocks', false);
sceneStore.actions.setExperimentSetting('lighting', 'neutral');
sceneStore.actions.setExperimentSetting('exposure', 1.1);
sceneStore.actions.setExperimentSetting('fluidQuality', 'standard');
sceneStore.actions.setExperimentSetting('height', Infinity);
sceneStore.actions.setExperimentSetting('unexpectedField', 17);
const sceneReload = createWaterStore({ urlParams: new URLSearchParams('waterStage=waterfall') });
assert.equal(sceneReload.getState().experimentSettings.waveHeight, 3.4);
assert.equal(sceneReload.getState().experimentSettings.height, 6.2);
assert.equal(sceneReload.getState().experimentSettings.impactRocks, false);
assert.equal(sceneReload.getState().experimentSettings.lighting, 'neutral');
assert.equal(sceneReload.getState().experimentSettings.exposure, 1.1);
assert.equal(sceneReload.getState().experimentSettings.fluidQuality, 'standard');
assert.equal(sceneReload.getState().experimentSettings.unexpectedField, undefined);
assert.equal(parseWaterPresetDocument(sceneStore.actions.exportDocument()).value.settings.waveHeight, undefined,
  'Preview geometry must not leak into an exported water appearance preset');
sceneStore.actions.setView({ stage: 'glass-box' });
assert.equal(sceneStore.getState().view.stage, 'glass-box');
assert.equal(sceneStore.getState().experimentSettings.waveHeight, 3.4, 'Scene switching preserves authored scene parameters');

const app = await readFile(new URL('../labs/water-lab/ui/App.jsx', import.meta.url), 'utf8');
const engine = await readFile(new URL('../labs/water-lab/engine/waterLabEngine.js', import.meta.url), 'utf8');
assert.match(app, /BrandLockup/);
assert.match(app, /SearchSelect/);
assert.match(app, /\bUpdate\b/);
assert.match(app, /Save As…/);
assert.match(app, /Export bundle with Water slot only/);
assert.match(app, /StyleBundleExportPrompt/);
assert.match(app, /Export preview PNG/);
assert.match(engine, /OrbitControls/);
assert.match(engine, /setCameraMode/);
assert.match(engine, /resetCamera/);

console.log('Water Lab contract verified: named preset save/update/reload, searchable UI, runtime style and bundle exports, branding, preview asset export, and explicit camera controls.');
