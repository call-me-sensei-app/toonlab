import assert from 'node:assert/strict';

import {
  TEXTURE_GENERATORS,
  compileTextureLayer,
} from '../src/texgen/index.js';

assert.deepEqual(
  TEXTURE_GENERATORS.stripes.uses,
  ['columns', 'rows', 'cellVariation', 'warp', 'warpScale'],
);

const sampler = compileTextureLayer({
  generator: 'stripes',
  columns: 8,
  rows: 7,
  cellVariation: 0.8,
  warp: 0,
}, 42, 9);
const upper = Array.from({ length: 32 }, (_, index) => sampler(index / 32, 0.1).v);
const lower = Array.from({ length: 32 }, (_, index) => sampler(index / 32, 0.63).v);
assert.notDeepEqual(
  upper,
  lower,
  'stripe generator must vary along V so geological bands can break organically',
);
assert.deepEqual(
  upper,
  Array.from({ length: 32 }, (_, index) => sampler(index / 32, 0.1).v),
  'stripe variation must remain deterministic',
);

console.log('Texgen verified: deterministic stripes vary in both U and V.');
