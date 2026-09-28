import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { createNaturalRockSurfaceSpecification, deserializeRockDocument } from '../src/rockgen/index.js';
import { createRockCatalogStartDocument, applyLabDocumentOperation } from '../mcp/lab-management.mjs';
import { getLibraryState, saveLibraryEntry } from '../mcp/workspace.mjs';
import { applyCatalogGeologySurface, disposeCatalogC7SurfaceCache } from '../labs/rock-generation-lab/ui/c7CatalogSurface.js';
import { readRockSurfaceProvenance } from './lib/rock-surface-provenance.mjs';
import { createSemanticRegionFixture } from './fixtures/natural-rock-semantic-regions.mjs';

const originalProvenance = await readRockSurfaceProvenance();
for (const file of ['src/rockgen/surface/naturalRockSurface.js', 'src/core/sha256.js']) {
  assert.ok(originalProvenance.files.some((entry) => entry.path === file));
  const altered = await readRockSurfaceProvenance({ readSource: async (path) => {
    const bytes = await readFile(path);
    return path.endsWith(file) ? Buffer.concat([bytes, Buffer.from('\n// changed implementation')]) : bytes;
  } });
  assert.notEqual(altered.sha256, originalProvenance.sha256, `${file} changes must invalidate production provenance and retry keys`);
}

const surfacePackage = createNaturalRockSurfaceSpecification({
  assetId: 'field-boulder', profileId: 'mixed-clast-angular',
  editedBoundsMetres: [1, 1, 1], geometrySha256: 'b'.repeat(64), seed: 42,
  semanticRegions: createSemanticRegionFixture(),
});
assert.ok(surfacePackage.semanticRegions.regions.every((region) => region.mask.encoding === 'rle-u8-v1'));
assert.ok(JSON.stringify(surfacePackage).length < 64 * 1024, 'Simple authored masks must remain compact enough for library storage');
const created = createRockCatalogStartDocument({ id: 'field-boulder', metadata: { surfacePackage } });
assert.deepEqual(created.reference.surfacePackage, surfacePackage, 'MCP must carry the exact source surface recipe');
const edited = applyLabDocumentOperation('rock', created, 'append_mesh_edit', { edit: { meshIndex: 0, deltas: [[0, 0.01, 0, 0]] } });
assert.deepEqual(edited.reference.surfacePackage, surfacePackage, 'MCP geometry edits must preserve the saved material recipe');
assert.throws(() => createRockCatalogStartDocument({ id: 'bad', surfacePackage: { schema: 'invalid' } }), /invalid realistic surface recipe/);

const workspace = await mkdtemp(join(tmpdir(), 'toonlab-surface-replay-'));
try {
  await saveLibraryEntry(workspace, { id: 'user/composite-rock', cluster: 'rockgen', kind: 'recipe', recipe: edited });
  const loaded = (await getLibraryState(workspace)).entries.find((entry) => entry.id === 'user/composite-rock');
  const reopened = deserializeRockDocument(loaded.recipe);
  assert.deepEqual(reopened.reference.surfacePackage, surfacePackage);
  const original = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), original);
  const applied = await applyCatalogGeologySurface(mesh, reopened.reference.surfacePackage, { width: 1, height: 1, depth: 1 });
  assert.equal(applied.projection.runtimeMode, 'semantic-regions-uv0-bake');
  assert.equal(mesh.material.userData.toonlabRockProjectionContract.mode, 'semantic-regions-uv0-bake');
  assert.equal(mesh.material.userData.toonLabRockTextureComposition.sourceAlbedoStrength, 1);
  assert.ok(mesh.material.normalNode && mesh.material.aoNode && mesh.material.roughnessNode);
  assert.equal(applied.audit.semanticRegions.contractSha256, surfacePackage.semanticRegionSurface.contractSha256);
  const byteHash = applied.audit.byteHash;
  applied.dispose();
  assert.equal(mesh.material, original, 'Disposing the adapter restores the original material');
  disposeCatalogC7SurfaceCache();
  const repeat = await applyCatalogGeologySurface(mesh, reopened.reference.surfacePackage, { width: 2, height: 1, depth: 1 });
  assert.equal(repeat.audit.byteHash, byteHash, 'Authored UV masks retain their placement after bounds edits and cache eviction');
  repeat.dispose();
  const damaged = structuredClone(surfacePackage);
  damaged.semanticRegions.regions[0].mask.runs[1] = 0;
  await assert.rejects(() => applyCatalogGeologySurface(mesh, damaged, { width: 1, height: 1, depth: 1 }), /mask hash mismatch/);
  assert.equal(mesh.material, original);
  const stale = structuredClone(surfacePackage);
  stale.geometrySha256 = 'c'.repeat(64);
  await assert.rejects(() => applyCatalogGeologySurface(mesh, stale, { width: 1, height: 1, depth: 1 }), /geometry/);
  mesh.geometry.dispose(); original.dispose();
} finally {
  disposeCatalogC7SurfaceCache();
  await rm(workspace, { recursive: true, force: true });
}
console.log('Rock provenance, MCP creation/edit, disk library save/reopen, composite UV replay, and stale-mask rejection passed.');
