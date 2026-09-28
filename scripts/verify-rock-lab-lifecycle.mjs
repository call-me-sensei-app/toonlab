import assert from 'node:assert/strict';

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  },
};

const [{ createRockDocument, deserializeRockDocument, serializeRockDocument }, {
  createRockGenerationStore,
}] = await Promise.all([
  import('../src/rockgen/rockDocument.js'),
  import('../labs/rock-generation-lab/ui/store.js'),
]);

const document = createRockDocument({ preset: 'boulder', seed: 7 });
const store = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(store.actions.importDocument(serializeRockDocument(document)).ok, true);
assert.equal(store.actions.saveLocalAs('Quarry Study'), true);
const namedId = store.getState().selectedLocalId;
assert.ok(namedId);
assert.equal(store.getState().library.length, 1);
assert.equal(deserializeRockDocument(store.getState().library[0].document).name, 'Quarry Study');

store.actions.setName('Quarry Study Revised');
assert.equal(store.actions.saveLocal(), true);
assert.equal(store.getState().selectedLocalId, namedId);
assert.equal(store.getState().library.length, 1, 'Save updates the selected entry instead of duplicating it');

const reopened = createRockGenerationStore({ urlParams: new URLSearchParams() });
assert.equal(reopened.getState().library.length, 1, 'Named saves survive reopening the store');
assert.equal(reopened.actions.loadLocal(namedId), true);
assert.equal(reopened.getState().document.name, 'Quarry Study Revised');
assert.equal(reopened.getState().document.seed, 7);
assert.equal(reopened.getState().dirty, false);
assert.equal(reopened.actions.saveLocalAs('Quarry Alternative'), true);
assert.equal(reopened.getState().library.length, 2, 'Save As preserves the original entry');
assert.notEqual(reopened.getState().selectedLocalId, namedId);
assert.equal(reopened.actions.deleteLocal(), true);
assert.equal(reopened.getState().library.length, 1);
assert.equal(reopened.actions.loadLocal(namedId), true);
assert.equal(reopened.getState().document.name, 'Quarry Study Revised');

const first100SurfacePackage = {
  schema: 'toonlab/c8-first100-geology-surface',
  version: 3,
  assetId: 'arch-sandstone',
  profileId: 'red-sandstone-bedded',
  mapResolution: 1024,
  projection: {
    mode: 'directional-bedding',
    scaleMetres: 3.78,
    upAxis: 'y',
  },
  seed: 42,
};
const first100Document = createRockDocument({
  preset: 'column-arch',
  style: 'call_me_sensei',
  reference: {
    id: 'rock-c8-arch-sandstone',
    sourceMode: 'mesh-template',
    surfaceMode: 'generated',
    surfacePackage: first100SurfacePackage,
  },
});
assert.deepEqual(first100Document.reference.surfacePackage, first100SurfacePackage);
assert.deepEqual(
  deserializeRockDocument(serializeRockDocument(first100Document)).reference.surfacePackage,
  first100SurfacePackage,
  'future and user-authored deterministic geology packages survive document round-trips',
);

console.log('Rock Lab named-save lifecycle verified.');
