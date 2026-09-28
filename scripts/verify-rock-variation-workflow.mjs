import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
await import('./verify-rock-tool-correctness.mjs');
const tools = await import('../labs/rock-generation-lab/ui/catalogSourceMesh.js');
const { createRockGenerationStore } = await import('../labs/rock-generation-lab/ui/store.js');
const { getRockVariationCatalogEntry } = await import('../labs/rock-generation-lab/ui/catalog.js');
const { serializeRockDocument, deserializeRockDocument } = await import('../src/rockgen/index.js');
const { installViewportNavigation } = await import('../labs/rock-generation-lab/ui/viewportNavigation.js');

const base = new THREE.BoxGeometry(4, 4, 3, 5, 5, 5);
const root = new THREE.Group(); root.add(new THREE.Mesh(base, new THREE.MeshStandardMaterial()));
const source = { root, entry: getRockVariationCatalogEntry('rock-0026') };
const store = createRockGenerationStore({ urlParams: new URLSearchParams() });
store.actions.startCatalogVariation('rock-0026', 0);
let live;
const rebuild = () => {
  live?.dispose(); const ref = store.getState().document.reference;
  live = tools.createCatalogVariation(source, { ...ref, strength: ref.variation, seed: ref.variationSeed });
  return live;
};
rebuild();
store.actions.registerCatalogRuntime({
  captureVariationBase: () => tools.captureCatalogMeshSnapshots(live.meshes),
  variationProfile: () => live.fullStrengthProfile,
  validateVariation(ref) { tools.createCatalogVariation(source, { ...ref, strength: ref.variation, seed: ref.variationSeed }).dispose(); },
});
const startStrength = store.getState().document.reference.variation;
store.actions.beginVariationGesture();
store.actions.setCatalogVariationStrength(0.4); store.actions.setCatalogVariationStrength(0.8);
store.actions.endVariationGesture(); store.actions.undo();
assert.equal(store.getState().document.reference.variation, startStrength, 'one drag is one undo');
store.actions.redo(); assert.equal(store.getState().document.reference.variation, 0.8);
store.actions.setCatalogVariationStrength(0); rebuild();

const cut = (x) => ({ point: [x, 0, 1.5], normal: [0, 0, 1], radius: 0.4, depth: 5, through: true, seed: 7, roughness: 0 });
const hole1 = tools.drillCatalogGeometry(base, cut(-0.8));
const hole2 = tools.drillCatalogGeometry(hole1, cut(0.8));
assert.ok(hole2);
store.actions.commitCatalogMeshSnapshots([tools.serializeCatalogGeometry(hole2, 0)]); rebuild();
const indices = [...live.meshes[0].geometry.index.array];
const before = [...live.meshes[0].geometry.attributes.position.array];
assert.equal(store.actions.setCatalogVariationOptions({ strength: 1, settings: { width: 1.25, height: 1, depth: 1,
  leanX: 0, leanZ: 0, twist: 0, taper: 0, bulge: 0, noiseAmplitude: 0 } }), true);
rebuild();
assert.deepEqual([...live.meshes[0].geometry.index.array], indices, 'both holes preserve their topology');
assert.notDeepEqual([...live.meshes[0].geometry.attributes.position.array], before, 'snapshot variations visibly change geometry');
assert.equal(live.meshes[0].geometry.userData.toonlabFillPatches.length, 2, 'both fill volumes survive variation');
const filled = tools.fillCatalogGeometry(live.meshes[0].geometry, [-1, 0, 1.5]);
assert.ok(filled, 'a hole can still be filled after variation');

store.actions.setCatalogVariationOptions({ settings: { width: null, locks: { width: true } } }); rebuild();
const lockedWidth = live.profile.scale[0];
assert.equal(store.actions.varyCurrentRock(), true); rebuild();
assert.ok(Math.abs(live.profile.scale[0] - lockedWidth) < 1e-6, 'locked automatic proportion survives reroll');
const saved = serializeRockDocument(store.getState().document);
const restored = deserializeRockDocument(saved);
const replay = tools.createCatalogVariation(source, { ...restored.reference, strength: restored.reference.variation, seed: restored.reference.variationSeed });
assert.deepEqual(replay.meshes[0].geometry.attributes.position.array, live.meshes[0].geometry.attributes.position.array, 'reload is deterministic');

const resize = tools.resizeCatalogMeshesToDimensions(live.meshes, { width: 10, height: 2, depth: 1 });
const resized = tools.deserializeCatalogGeometry(resize[0]); resized.computeBoundingBox();
const dimensions = resized.boundingBox.getSize(new THREE.Vector3());
assert.ok(dimensions.distanceTo(new THREE.Vector3(10, 2, 1)) < 1e-5, 'exact dimensions have no arbitrary size cap');
assert.equal(resized.userData.toonlabFillPatches.length, 2);

const immutable = serializeRockDocument(store.getState().document);
assert.equal(store.actions.setCatalogVariationOptions({ settings: { width: 0 } }), false, 'collapsed geometry is rejected');
assert.equal(serializeRockDocument(store.getState().document), immutable, 'rejection preserves authored document');
assert.match(store.getState().status, /Variation rejected/);
store.actions.commitCatalogMeshEdit({ meshIndex: 0, deltas: [[0, 0.01, 0, 0]] }); rebuild();
assert.equal(store.actions.varyCurrentRock(), true); rebuild();
assert.equal(live.meshes[0].geometry.userData.toonlabFillPatches.length, 2, 'vary-current retains edited holes');
const revision = store.getState().docRevision;
store.actions.regenerateCatalogVariation();
assert.ok(store.getState().docRevision > revision, 'fresh variants always trigger a new build');
assert.equal(store.getState().document.reference.meshSnapshots.length, 0);
store.actions.undo(); assert.ok(store.getState().document.reference.meshSnapshots.length);

const pair = mergeGeometries([new THREE.BoxGeometry(1, 1, 1).translate(-2, 0, 0), new THREE.BoxGeometry(1, 1, 1).translate(2, 0, 0)]);
const pairRoot = new THREE.Group(); pairRoot.add(new THREE.Mesh(pair, new THREE.MeshStandardMaterial()));
const settings = { width: 2, height: 1, depth: 1, leanX: 0, leanZ: 0, taper: 0, twist: 0, bulge: 0, noiseAmplitude: 0 };
const whole = tools.createCatalogVariation({ root: pairRoot, entry: source.entry }, { strength: 1, variationSettings: settings });
const separate = tools.createCatalogVariation({ root: pairRoot, entry: source.entry }, { strength: 1, variationSettings: { ...settings, scope: 'component' } });
assert.notDeepEqual(whole.meshes[0].geometry.attributes.position.array, separate.meshes[0].geometry.attributes.position.array, 'component scope is not a whole-rock alias');
assert.equal(separate.meshes[0].geometry.boundingBox.max.x, 3);
assert.equal(whole.meshes[0].geometry.boundingBox.max.x, 5);

// Exercise the actual keyboard adapter without a browser or global hotkey leaks.
const previousWindow = globalThis.window, previousDocument = globalThis.document;
const listeners = new Map(), canvasListeners = new Map(), calls = [];
const canvas = { setAttribute() {}, focus() { document.activeElement = canvas; },
  addEventListener(key, fn) { canvasListeners.set(key, fn); }, removeEventListener(key) { canvasListeners.delete(key); } };
globalThis.window = { addEventListener(key, fn) { listeners.set(key, fn); }, removeEventListener(key) { listeners.delete(key); } };
globalThis.document = { activeElement: canvas };
const uninstall = installViewportNavigation({ canvas, orbit: (...args) => calls.push(['orbit', ...args]), frame: () => calls.push(['frame']),
  reset: () => calls.push(['reset']), setOrbitOverride: (value) => calls.push(['override', value]), finishStroke: () => calls.push(['finish']) });
const key = (value, extra = {}) => listeners.get('keydown')({ key: value, preventDefault() {}, ...extra });
key('ArrowLeft'); key('f'); key('Alt'); listeners.get('keyup')({ key: 'Alt' });
assert.ok(calls.some(([name]) => name === 'orbit')); assert.ok(calls.some(([name]) => name === 'frame'));
const count = calls.length; key('c', { metaKey: true }); document.activeElement = {}; key('ArrowRight');
assert.equal(calls.length, count, 'copy and input editing must not move the camera');
uninstall(); assert.equal(listeners.size, 0);
globalThis.window = previousWindow; globalThis.document = previousDocument;

for (const geometry of [base, hole1, hole2, filled, resized, pair]) geometry.dispose();
for (const variation of [live, replay, whole, separate]) variation.dispose();
console.log('Variation workflow passed: edited holes, fill, seed locks, scope, exact dimensions, rejection, grouped undo, reload, fresh variant revision, keyboard focus.');
