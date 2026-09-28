import assert from 'node:assert/strict';

import { applyMigrations } from '../database/apply-sql.mjs';
import { closeDatabase, getPool } from '../database/client.mjs';
import {
  annotateCreationRevision,
  deleteLabState,
  deleteLibraryEntry,
  getCreationRevision,
  listCreationRevisions,
  migrateLegacy,
  resolveStyleBundleEntry,
  restoreCreationRevision,
  saveLibraryEntry,
  setLabState,
} from '../database/repository.mjs';

const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const dependencyId = `revision-dependency-${suffix}`;
const bundleId = `revision-bundle-${suffix}`;
const legacyId = `revision-legacy-${suffix}`;
const stateKey = `toonlab.revision-test.projects.${suffix}`;

try {
  await applyMigrations();

  const dependencyV1 = await saveLibraryEntry({
    id: dependencyId,
    label: 'Dependency v1',
    type: 'rock-shader-preset',
    settings: { roughness: 0.25 },
  });
  const bundle = await saveLibraryEntry({
    id: bundleId,
    label: 'Versioned bundle',
    schema: 'toonlab/style-bundle',
    type: 'style-bundle',
    version: 1,
    slots: { rock: { creation: dependencyId } },
  });
  const firstBundleRevision = bundle._local.currentRevisionId;

  await saveLibraryEntry({
    id: dependencyId,
    label: 'Dependency v2',
    type: 'rock-shader-preset',
    settings: { roughness: 0.75 },
  });
  assert.equal((await resolveStyleBundleEntry(bundleId)).slots.rock.document.settings.roughness, 0.25);

  await saveLibraryEntry({
    id: bundleId,
    label: 'Versioned bundle',
    schema: 'toonlab/style-bundle',
    type: 'style-bundle',
    version: 1,
    slots: { rock: { creation: dependencyId } },
  });
  assert.equal((await resolveStyleBundleEntry(bundleId)).slots.rock.document.settings.roughness, 0.75);

  const history = await listCreationRevisions(bundle._local.creationId, { limit: 1 });
  assert.equal(history.total, 2);
  assert.equal(history.revisions.length, 1);
  assert.equal(Object.hasOwn(history.revisions[0], 'document'), false);
  assert.equal(
    (await listCreationRevisions(bundle._local.creationId, { limit: 1, offset: 99 })).total,
    2,
  );

  const snapshot = await getCreationRevision(bundle._local.creationId, firstBundleRevision);
  assert.equal(snapshot.document.slots.rock.creation, dependencyId);
  await annotateCreationRevision(bundle._local.creationId, firstBundleRevision, {
    name: 'Original dependency lock',
    pinned: true,
    tags: ['preferred'],
  });
  await restoreCreationRevision(bundle._local.creationId, firstBundleRevision);
  assert.equal((await resolveStyleBundleEntry(bundleId)).slots.rock.document.settings.roughness, 0.25);

  const pool = await getPool();
  await assert.rejects(
    pool.query(
      'update creation_revisions set document = $2::jsonb where id = $1',
      [firstBundleRevision, JSON.stringify({ tampered: true })],
    ),
    /immutable/,
  );

  await migrateLegacy({
    libraryEntries: [{ id: legacyId, label: 'Imported original', type: 'toon-preset', value: 1 }],
    source: `revision-test-${suffix}`,
  });
  const legacy = await pool.query('select id, current_revision_id from creations where doc_key = $1', [legacyId]);
  assert.ok(legacy.rows[0]?.current_revision_id);
  assert.equal((await listCreationRevisions(legacy.rows[0].id)).total, 1);

  await setLabState(stateKey, JSON.stringify({ named: { id: 'stable', label: 'Stable', type: 'old-type' } }));
  const originalTypedRow = await pool.query(
    `select id from creations where source = 'lab-state' and doc_key = $1`,
    [`state:${stateKey}:stable`],
  );
  await setLabState(stateKey, JSON.stringify({ named: { id: 'stable', label: 'Stable', type: 'new-type' } }));
  const typedRows = await pool.query(
    `select id, type from creations where source = 'lab-state' and doc_key = $1`,
    [`state:${stateKey}:stable`],
  );
  assert.deepEqual(typedRows.rows.map((row) => row.type), ['new-type']);
  assert.equal(typedRows.rows[0].id, originalTypedRow.rows[0].id);

  // A restore link must not block the parent creation's cascade deletion.
  await deleteLibraryEntry(bundleId);
  const deletedBundle = await pool.query('select 1 from creations where id = $1', [bundle._local.creationId]);
  assert.equal(deletedBundle.rowCount, 0);

  console.log('Creation revision behavior verification passed.');
} finally {
  await deleteLibraryEntry(bundleId).catch(() => {});
  await deleteLibraryEntry(dependencyId).catch(() => {});
  await deleteLibraryEntry(legacyId).catch(() => {});
  await deleteLabState(stateKey).catch(() => {});
  await closeDatabase();
}
