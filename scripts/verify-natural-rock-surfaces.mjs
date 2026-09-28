import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  NATURAL_ROCK_MAP_ROLES,
  NATURAL_ROCK_SURFACE_PROFILES,
  createNaturalRockMapData,
  createNaturalRockSurfaceSpecification,
  createRockDocument,
  deserializeRockDocument,
  serializeRockDocument,
} from '../src/rockgen/index.js';

const hashes = JSON.parse(await readFile(new URL('./fixtures/natural-rock-surface-hashes.json', import.meta.url)));
for (const [profileId, profile] of Object.entries(NATURAL_ROCK_SURFACE_PROFILES)) {
  const options = { assetId: 'release-fixture', profileId, seed: 1234, size: 64 };
  if (profile.requiresSemanticRegions) {
    assert.throws(() => createNaturalRockMapData(options), /requires semantic regions/);
    continue;
  }
  const generated = createNaturalRockMapData(options);
  assert.deepEqual(Object.keys(generated.maps), NATURAL_ROCK_MAP_ROLES);
  for (const map of Object.values(generated.maps)) assert.equal(map.length, 64 * 64 * 4);
  const hash = createHash('sha256').update(Buffer.concat(Object.values(generated.maps).map((map) => Buffer.from(map)))).digest('hex');
  assert.equal(hash, hashes[profileId], `${profileId} must preserve the released editor's exact texture bytes`);
}

const surfacePackage = createNaturalRockSurfaceSpecification({
  assetId: 'my-procedural-rock',
  profileId: 'coarse-granite-jointed',
  editedBoundsMetres: [2, 1, 3],
  geometrySha256: 'a'.repeat(64),
  seed: 1234,
});
const saved = createRockDocument({
  name: 'Realistic granite',
  reference: { id: 'my-procedural-rock', sourceMode: 'mesh-template', surfacePackage },
});
const restored = deserializeRockDocument(serializeRockDocument(saved));
assert.deepEqual(restored.reference.surfacePackage, saved.reference.surfacePackage, 'Library round-trip must retain the realistic surface recipe');
assert.throws(() => createNaturalRockMapData({ profileId: 'missing' }), /Unknown/);
console.log(`Realistic surfaces verified: ${Object.keys(hashes).length} byte-identical profiles, composite-region guards, and saved-library round-trip.`);
