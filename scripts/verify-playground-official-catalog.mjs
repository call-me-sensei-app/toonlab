import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(
  new URL('../labs/playground/scenes/officialCatalogRock.jsx', import.meta.url),
  'utf8',
);
const composition = await readFile(
  new URL('../labs/playground/scenes/waterScenes.jsx', import.meta.url),
  'utf8',
);

assert.match(component, /loadOfficialCatalogAsset/u);
assert.match(component, /createOfficialCatalogAssetRuntime/u);
assert.match(component, /createOfficialCatalogProvider/u);
assert.match(component, /TRIMESH_DATA_COLLISION_ADAPTER/u);
assert.doesNotMatch(component, /\bfetch\s*\(/u);
assert.doesNotMatch(component, /\bloadModelAsset\b/u);
assert.doesNotMatch(component, /\bapplyRockShader\b/u);
assert.doesNotMatch(component, /\bsetCatalogLod\b/u);
assert.doesNotMatch(component, /\bcreateModelAssetTranscoders\b/u);
assert.doesNotMatch(component, /\bcollectEnvironmentTrimesh\b/u);
assert.ok(component.split('\n').length < 150, 'Playground catalog binding must stay minimal.');
assert.match(composition, /<OfficialCatalogRock/u);
assert.match(composition, /assetId=/u);

console.log('Playground official catalog migration verification passed.');
