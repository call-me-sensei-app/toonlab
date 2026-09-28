import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { libraryLivePreview } from '../labs/library/libraryEntry.js';

globalThis.window = {
  location: { origin: 'https://toonlab.local' },
};

const expectedTypes = [
  'toon-preset',
  'tree-recipe',
  'rock-project',
  'debris-project',
  'grass-preset',
  'water-preset',
  'sky-preset',
  'weather-preset',
  'world-preset',
  'prop-asset',
  'environment-preset',
  'manufactured-surface-profile',
  'vegetation-shader-preset',
  'tree-shader-preset',
  'grass-shader-preset',
  'flower-shader-preset',
  'rock-shader-preset',
  'ground-shader-preset',
  'sky-params',
  'cloud-shader-preset',
  'texture-recipe',
  'style-bundle',
  'generated-image',
];

for (const type of expectedTypes) {
  const documentType = type === 'tree-recipe'
    ? 'tree'
    : type === 'vegetation-shader-preset'
      ? 'toonlab/vegetation-shader-preset'
      : `toonlab/${type}`;
  const preview = libraryLivePreview({
    document: { id: `preview-${type}`, settings: {}, type: documentType, version: 1 },
    id: `library-${type}`,
    type,
  });
  assert.ok(preview, `${type} must own a production Library preview`);
  assert.ok(['lab', 'model', 'image'].includes(preview.mode), `${type} must use a live or native media surface`);
  if (preview.mode === 'lab') {
    assert.match(preview.labUrl, /^\/.+\?/, `${type} must deep-link its exact document into a lab`);
  }
  assert.equal(Object.hasOwn(preview, 'thumbnailUrl'), false, `${type} must not declare a thumbnail fallback`);
}

const assetExtension = await readFile(new URL('../labs/library/assetExtension.js', import.meta.url), 'utf8');
const libraryIndex = await readFile(new URL('../library/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(assetExtension, /else if \(preview\)/, 'Library detail must not fall back to a stored thumbnail.');
assert.doesNotMatch(assetExtension, /libraryImageUrl/, 'Library detail must not resolve thumbnail media.');
assert.doesNotMatch(assetExtension, /Name current version/, 'The revision editor must not be duplicated above the current revision row.');
assert.match(libraryIndex, /<div class="gal-toolbar">[\s\S]*<form id="libraryFilters" class="gal-filters tl-control-row">/);
assert.doesNotMatch(libraryIndex, /lib-heading|home-sub/, 'Library index header must use the Gallery header contract without a second description row.');

console.log(`PASS ${expectedTypes.length}/${expectedTypes.length} OSS Library creation types own non-thumbnail previews.`);
