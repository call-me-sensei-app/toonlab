import assert from 'node:assert/strict';

const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  removeItem: (key) => storage.delete(key),
  setItem: (key, value) => storage.set(key, String(value)),
};

globalThis.window = {
  history: {
    replaceState(_state, _title, href) {
      window.location = new URL(href, window.location.href);
    },
  },
  localStorage,
  location: new URL('http://localhost/flower-lab/'),
};
globalThis.document = { body: { dataset: {} } };

const [{ createDesignerStore }, { createTextureStore }, previewStyles, { STYLE_BUNDLE_SLOTS }] = await Promise.all([
  import('../labs/tree-lab/store/designerStore.js'),
  import('../labs/texture-lab/store/textureStore.js'),
  import('../labs/texture-lab/previewStyles.js'),
  import('../src/styles/styleBundle.js'),
]);

const flowerStore = createDesignerStore({
  labKind: 'flower',
  storageKey: 'test.flower-style-boundary',
  urlParams: new URLSearchParams(),
});
assert.equal(flowerStore.getState().styleId, 'call_me_sensei');
assert.equal(flowerStore.actions.getRecipeDocument().type, 'flower');
const flowerRecipeBefore = JSON.stringify(flowerStore.actions.getRecipeDocument());
const authoredFlowerShader = JSON.parse(flowerRecipeBefore).options.vegetationShader;
const flowerRevisionBefore = flowerStore.getState().docRevision;
const flowerDirtyBefore = flowerStore.getState().presetDirty;
flowerStore.actions.setStyleId('default');
assert.equal(flowerStore.getState().styleId, 'default');
assert.equal(flowerStore.getState().docRevision, flowerRevisionBefore);
assert.equal(flowerStore.getState().presetDirty, flowerDirtyBefore);
assert.equal(JSON.stringify(flowerStore.actions.getRecipeDocument()), flowerRecipeBefore);
assert.equal(
  flowerStore.actions.getRecipeDocument().options.vegetationShader,
  authoredFlowerShader,
  'preview style changes must not rewrite the recipe-authored vegetation shader',
);
assert.equal(window.location.searchParams.get('vegetationStyle'), 'default');

window.location = new URL('http://localhost/texture-lab/');
const textureStore = createTextureStore({ urlParams: new URLSearchParams() });
assert.equal(textureStore.getState().view.previewStyle, 'neutral');
assert.equal(textureStore.getState().view.gallery, true, 'Texture Lab must open on its texture browser.');
const textureRecipeBefore = JSON.stringify(textureStore.actions.getRecipeDocument());
const textureRevisionBefore = textureStore.getState().docRevision;
const textureDirtyBefore = textureStore.getState().presetDirty;
textureStore.actions.setPreviewStyle('call_me_sensei');
assert.equal(textureStore.getState().view.previewStyle, 'call_me_sensei');
assert.equal(textureStore.getState().docRevision, textureRevisionBefore);
assert.equal(textureStore.getState().presetDirty, textureDirtyBefore);
assert.equal(JSON.stringify(textureStore.actions.getRecipeDocument()), textureRecipeBefore);
assert.equal(window.location.searchParams.get('texturePreviewStyle'), 'call_me_sensei');

const sharedTextureDocument = textureStore.actions.getRecipeDocument();
const sharedParams = new URLSearchParams({ recipe: JSON.stringify(sharedTextureDocument) });
const sharedTextureStore = createTextureStore({ urlParams: sharedParams });
assert.equal(sharedTextureStore.getState().view.gallery, false, 'Explicit recipe handoffs open directly in the editor.');

const previewStyleIds = previewStyles.getTexturePreviewStyleOptions().map(({ value }) => value);
assert.ok(previewStyleIds.includes('neutral'));
assert.ok(previewStyleIds.includes('default'));
assert.ok(previewStyleIds.includes('call_me_sensei'));

assert.equal(STYLE_BUNDLE_SLOTS.flowerShader.label, 'Flower shader');
assert.equal(STYLE_BUNDLE_SLOTS.flowerShader.selectionKind, 'style');
assert.equal(STYLE_BUNDLE_SLOTS.grassShader.selectionKind, 'style');
assert.equal(STYLE_BUNDLE_SLOTS.treeShader.selectionKind, 'style');
assert.equal(STYLE_BUNDLE_SLOTS.flowers, undefined);
assert.equal(STYLE_BUNDLE_SLOTS.vegetationShader, undefined);
assert.equal(STYLE_BUNDLE_SLOTS.texture, undefined, 'textures stay portable across IP styles');

console.log('Lab style boundaries verified.');
