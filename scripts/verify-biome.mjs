import assert from 'node:assert/strict';

import { stableStringify } from '../src/core/generation.js';
import {
  createBiomeGeneratorRecipe,
  createGeneratedBiomePresetDocument,
  parseBiomeGeneratorRecipe,
  resolveBiomeGeneratorRecipe,
  serializeBiomeGeneratorRecipe,
} from '../src/biome/biomeGenerator.js';
import { createStylizedTerrain } from '../src/stylizedTerrain.js';

const base = createBiomeGeneratorRecipe('verification-biome', { seed: 1 });
const serialized = serializeBiomeGeneratorRecipe(base);
const parsed = parseBiomeGeneratorRecipe(serialized);
assert.equal(parsed.ok, true, parsed.errors?.join(' '));
assert.deepEqual(parsed.value, base, 'recipe round-trip must be lossless');

const unique = new Set();
for (let seed = 1; seed <= 10_000; seed += 1) {
  unique.add(stableStringify(resolveBiomeGeneratorRecipe({ ...base, seed }, { quality: 'balanced' })));
}
assert.ok(unique.size >= 9_990, `expected effectively unbounded variety, got ${unique.size} unique results`);

const lockedRecipe = {
  ...base,
  configuration: { terrain: { waterCoverage: 0.333 } },
  locks: ['terrain.waterCoverage'],
  seed: 991,
};
assert.equal(resolveBiomeGeneratorRecipe(lockedRecipe).terrain.waterCoverage, 0.333);

const mobile = resolveBiomeGeneratorRecipe(base, { quality: 'mobile' });
const cinematic = resolveBiomeGeneratorRecipe(base, { quality: 'cinematic' });
assert.ok(mobile.runtime.terrainSegments < cinematic.runtime.terrainSegments);
assert.ok(mobile.vegetation.grassRadius <= cinematic.vegetation.grassRadius);

const preset = createGeneratedBiomePresetDocument(base, { quality: 'mobile' });
assert.equal(preset.type, 'toonlab/biome-preset');
assert.equal(preset.settings.runtime.quality, 'mobile');
assert.equal(preset.seed, base.seed, 'resolved preset keeps the authored terrain/scatter seed');
assert.equal(preset.basePreset, base.basePreset, 'resolved preset keeps the authored world preset');
assert.deepEqual(preset.source, { recipeId: base.id, recipeVersion: base.version, seed: base.seed });

const terrain = createStylizedTerrain({
  archetype: preset.settings.terrain.archetype,
  detailTexture: false,
  morphology: {
    mountains: {
      ...preset.settings.terrain.morphology.mountains,
      mask: [
        preset.settings.terrain.morphology.mountains.maskLow,
        preset.settings.terrain.morphology.mountains.maskHigh,
      ],
    },
  },
  seed: 73,
  segments: 12,
  size: 120,
  waterCoverage: preset.settings.terrain.waterCoverage,
});
assert.ok(Number.isFinite(terrain.waterLevel));
assert.ok(Number.isFinite(terrain.heightAt(4, 9)));
terrain.dispose();

console.log(`biome generator verifier passed (${unique.size} unique results / 10,000 seeds)`);
