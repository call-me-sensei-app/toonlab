import assert from 'node:assert/strict';
import { createPatinaInput, normalizePatinaResult } from '../database/fal-patina.mjs';

const input = createPatinaInput({
  prompt: 'weathered copper',
  resolution: '1k',
  maps: ['basecolor', 'normal'],
  numImages: 2,
  tileSize: 32,
  tileStride: 16,
});
assert.equal(input.tile_size, 32);
assert.equal(input.tile_stride, 16);

const images = [0, 1].flatMap((index) => [
  { url: `https://fal.media/preview-${index}.png` },
  { url: `https://fal.media/base-${index}.png`, map_type: 'basecolor' },
  { url: `https://fal.media/normal-${index}.png`, map_type: 'normal' },
]);
assert.equal(normalizePatinaResult({ images }, input).images.length, 6);
assert.throws(
  () => normalizePatinaResult({ images: images.slice(0, -1) }, input),
  /normal maps; expected 2/,
);
assert.throws(
  () => normalizePatinaResult({ images: [{ url: 'https://fal.media/x.png', map_type: 'unknown' }] }, { ...input, maps: [] }),
  /unsupported map type/,
);

console.log('verify-fal-patina.mjs: all green');
