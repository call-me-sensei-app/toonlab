import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import { getPool, withTransaction } from './client.mjs';
import { normalizeCreationTags } from './creation-tags.mjs';

export { normalizeCreationTags } from './creation-tags.mjs';

const now = () => new Date().toISOString();
const hash = (value) => createHash('sha256').update(value).digest('hex');

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || !String(entry.id ?? '').trim()) {
    throw Object.assign(new Error('A library entry with an id is required.'), { statusCode: 400 });
  }
  const document = { ...entry };
  delete document._local;
  return {
    docKey: String(entry.id),
    type: String(entry.type ?? entry.kind ?? 'asset'),
    label: String(entry.label ?? entry.name ?? entry.id).slice(0, 120),
    description: entry.description ? String(entry.description).slice(0, 2000) : null,
    tags: normalizeCreationTags(entry.tags ?? entry.document?.tags),
    document,
    aiGenerated: entry.aiGenerated === true,
  };
}

function revisionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    creationId: row.creation_id,
    number: row.revision_number,
    label: row.label,
    description: row.description,
    tags: row.tags ?? [],
    document: row.document,
    aiGenerated: row.ai_generated,
    contentHash: row.content_hash,
    saveSource: row.save_source,
    dependencies: row.dependency_snapshot ?? {},
    restoredFromRevisionId: row.restored_from_revision_id,
    name: row.version_name,
    versionTags: row.version_tags ?? [],
    note: row.version_note,
    pinned: row.pinned,
    createdAt: row.created_at,
    annotationUpdatedAt: row.annotation_updated_at,
  };
}

function revisionSummaryRow(row) {
  const { document: _document, dependencies: _dependencies, ...summary } = revisionRow(row);
  return summary;
}

function creationRowToEntry(row) {
  return {
    ...row.document,
    id: row.doc_key,
    type: row.type,
    label: row.label,
    description: row.description ?? row.document?.description ?? '',
    tags: row.tags ?? [],
    aiGenerated: row.ai_generated || row.document?.aiGenerated === true,
    _local: {
      creationId: row.id,
      currentRevisionId: row.current_revision_id,
      dependencySnapshot: row.current_dependency_snapshot ?? {},
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

async function styleBundleDependencySnapshot(client, document) {
  const slots = document?.slots;
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return {};
  const references = Object.entries(slots).flatMap(([slotId, payload]) => {
    const reference = payload && typeof payload === 'object' ? String(payload.creation ?? '').trim() : '';
    return reference ? [{ reference, slotId }] : [];
  });
  if (!references.length) return {};
  const values = [...new Set(references.map(({ reference }) => reference))];
  const result = await client.query(
    `select id, doc_key, current_revision_id
     from creations
     where id::text = any($1::text[]) or doc_key = any($1::text[])`,
    [values],
  );
  const byReference = new Map();
  for (const reference of values) {
    const exactId = result.rows.find((row) => row.id === reference);
    const matches = exactId ? [exactId] : result.rows.filter((row) => row.doc_key === reference);
    if (matches.length > 1) {
      throw Object.assign(
        new Error(`Style bundle reference "${reference}" is ambiguous; use the creation UUID.`),
        { statusCode: 409 },
      );
    }
    if (matches[0]) byReference.set(reference, matches[0]);
  }
  const missing = references.filter(({ reference }) => !byReference.get(reference)?.current_revision_id);
  if (missing.length) {
    throw Object.assign(
      new Error(`Style bundle references must resolve to saved creations with version history: ${[...new Set(missing.map(({ reference }) => reference))].join(', ')}`),
      { statusCode: 409 },
    );
  }
  return Object.fromEntries(references.map(({ reference, slotId }) => {
    const row = byReference.get(reference);
    return [slotId, { creationId: row.id, revisionId: row.current_revision_id }];
  }));
}

async function commitCreationRevision(client, creation, {
  dependencies,
  force = false,
  restoredFromRevisionId = null,
  saveSource = 'manual',
} = {}) {
  const dependencySnapshot = dependencies
    ?? (creation.type === 'style-bundle'
      ? await styleBundleDependencySnapshot(client, creation.document)
      : {});
  const locked = await client.query(
    `select c.current_revision_id, r.content_hash
     from creations c
     left join creation_revisions r on r.id = c.current_revision_id
     where c.id = $1
     for update of c`,
    [creation.id],
  );
  if (!locked.rows[0]) throw Object.assign(new Error('Creation not found.'), { statusCode: 404 });
  const digest = await client.query(
    `select encode(digest(convert_to(jsonb_build_object(
       'label', $1::text,
       'description', $2::text,
       'tags', $3::text[],
       'document', $4::jsonb,
       'aiGenerated', $5::boolean,
       'dependencies', $6::jsonb
     )::text, 'UTF8'), 'sha256'), 'hex') as value`,
    [
      creation.label,
      creation.description,
      creation.tags,
      JSON.stringify(creation.document),
      creation.aiGenerated,
      JSON.stringify(dependencySnapshot),
    ],
  );
  const contentHash = digest.rows[0].value;
  if (!force && locked.rows[0].content_hash === contentHash) {
    return { created: false, id: locked.rows[0].current_revision_id };
  }
  const inserted = await client.query(
    `insert into creation_revisions (
       creation_id, revision_number, label, description, tags, document,
       ai_generated, content_hash, save_source, dependency_snapshot,
       restored_from_revision_id
     )
     values (
       $1,
       coalesce((select max(revision_number) + 1 from creation_revisions where creation_id = $1), 1),
       $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10
     )
     returning id`,
    [
      creation.id,
      creation.label,
      creation.description,
      creation.tags,
      JSON.stringify(creation.document),
      creation.aiGenerated,
      contentHash,
      saveSource,
      JSON.stringify(dependencySnapshot),
      restoredFromRevisionId,
    ],
  );
  await client.query(
    `update creations set
       label = $2,
       description = $3,
       tags = $4,
       document = $5::jsonb,
       ai_generated = $6,
       current_revision_id = $7,
       updated_at = now()
     where id = $1`,
    [
      creation.id,
      creation.label,
      creation.description,
      creation.tags,
      JSON.stringify(creation.document),
      creation.aiGenerated,
      inserted.rows[0].id,
    ],
  );
  return { created: true, id: inserted.rows[0].id };
}

export async function databaseInfo() {
  const pool = await getPool();
  const result = await pool.query(
    `select
       (select count(*)::int from creations) as creation_count,
       (select count(*)::int from catalog_assets) as catalog_count`,
  );
  return result.rows[0];
}

export async function listLibraryEntries() {
  const pool = await getPool();
  const result = await pool.query(
    `select c.id, c.doc_key, c.type, c.label, c.description, c.tags, c.document, c.source,
            c.ai_generated, c.current_revision_id, c.created_at, c.updated_at,
            r.dependency_snapshot as current_dependency_snapshot
     from creations c
     left join creation_revisions r on r.id = c.current_revision_id
     order by c.updated_at desc, c.label`,
  );
  return result.rows.map(creationRowToEntry);
}

export async function saveLibraryEntry(entry) {
  const value = normalizeEntry(entry);
  return withTransaction(async (client) => {
    const existing = await client.query(
      `select * from creations where type = $1 and doc_key = $2 for update`,
      [value.type, value.docKey],
    );
    let row = existing.rows[0];
    if (!row) {
      const inserted = await client.query(
        `insert into creations (doc_key, type, label, description, tags, document, ai_generated)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)
         returning *`,
        [
          value.docKey,
          value.type,
          value.label,
          value.description,
          value.tags,
          JSON.stringify(value.document),
          value.aiGenerated,
        ],
      );
      row = inserted.rows[0];
    }
    const snapshot = {
      ...row,
      label: value.label,
      description: value.description,
      tags: value.tags,
      document: value.document,
      aiGenerated: row.ai_generated || value.aiGenerated,
    };
    const revision = await commitCreationRevision(client, {
      ...snapshot,
      aiGenerated: snapshot.aiGenerated,
    });
    const fileId = entry?.result?.file?.id ?? entry?.file?.id ?? null;
    if (fileId) {
      await client.query(
        `update files set creation_id = $1
         where id = $2 and creation_id is null`,
        [row.id, fileId],
      );
    }
    const saved = await client.query(
      `select c.*, r.dependency_snapshot as current_dependency_snapshot
       from creations c
       left join creation_revisions r on r.id = c.current_revision_id
       where c.id = $1`,
      [row.id],
    );
    return {
      ...creationRowToEntry(saved.rows[0]),
      _local: {
        ...creationRowToEntry(saved.rows[0])._local,
        revisionCreated: revision.created,
      },
    };
  });
}

export async function listCreationRevisions(creationId, { limit = 25, offset = 0 } = {}) {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 25)));
  const boundedOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const pool = await getPool();
  const [result, countResult] = await Promise.all([
    pool.query(
      `select
         r.id, r.creation_id, r.revision_number, r.label, r.description, r.tags,
         r.ai_generated, r.content_hash, r.save_source, r.restored_from_revision_id,
         r.version_name, r.version_tags, r.version_note, r.pinned,
         r.annotation_updated_at, r.created_at,
         (r.id = c.current_revision_id) as is_current
       from creation_revisions r
       join creations c on c.id = r.creation_id
       where r.creation_id = $1
       order by r.pinned desc, r.revision_number desc
       limit $2 offset $3`,
      [creationId, boundedLimit, boundedOffset],
    ),
    pool.query(
      `select count(*)::int as total from creation_revisions where creation_id = $1`,
      [creationId],
    ),
  ]);
  return {
    revisions: result.rows.map((row) => ({ ...revisionSummaryRow(row), isCurrent: row.is_current })),
    total: countResult.rows[0]?.total ?? 0,
  };
}

export async function getCreationRevision(creationId, revisionId) {
  const pool = await getPool();
  const result = await pool.query(
    `select r.*, (r.id = c.current_revision_id) as is_current
     from creation_revisions r
     join creations c on c.id = r.creation_id
     where r.creation_id = $1 and r.id = $2`,
    [creationId, revisionId],
  );
  if (!result.rows[0]) throw Object.assign(new Error('Revision not found.'), { statusCode: 404 });
  return { ...revisionRow(result.rows[0]), isCurrent: result.rows[0].is_current };
}

export async function resolveStyleBundleEntry(selector) {
  const value = String(selector ?? '').trim();
  const pool = await getPool();
  const result = await pool.query(
    `select c.*, r.dependency_snapshot
     from creations c
     join creation_revisions r on r.id = c.current_revision_id
     where c.type = 'style-bundle' and (c.id::text = $1 or c.doc_key = $1)
     order by (c.id::text = $1) desc
     limit 1`,
    [value],
  );
  const bundle = result.rows[0];
  if (!bundle) throw Object.assign(new Error('Style bundle not found.'), { statusCode: 404 });
  const slots = { ...(bundle.document?.slots ?? {}) };
  const dependencies = bundle.dependency_snapshot ?? {};
  for (const [slotId, payload] of Object.entries(slots)) {
    if (!payload?.creation) continue;
    const lock = dependencies[slotId];
    if (!lock?.creationId || !lock?.revisionId) {
      throw Object.assign(new Error(`Style bundle slot "${slotId}" has no locked dependency revision.`), { statusCode: 409 });
    }
    const locked = await pool.query(
      `select r.document, c.doc_key
       from creation_revisions r
       join creations c on c.id = r.creation_id
       where r.id = $1 and r.creation_id = $2`,
      [lock.revisionId, lock.creationId],
    );
    if (
      !locked.rows[0]
      || (payload.creation !== lock.creationId && payload.creation !== locked.rows[0].doc_key)
    ) {
      throw Object.assign(new Error(`Locked dependency for style bundle slot "${slotId}" is unavailable.`), { statusCode: 409 });
    }
    slots[slotId] = { document: locked.rows[0].document };
  }
  return { ...bundle.document, slots };
}

export async function annotateCreationRevision(creationId, revisionId, patch) {
  const assignments = [];
  const values = [creationId, revisionId];
  const assign = (column, value) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };
  if (Object.hasOwn(patch, 'name')) {
    assign(
      'version_name',
      patch.name == null || !String(patch.name).trim()
        ? null
        : String(patch.name).trim().slice(0, 120),
    );
  }
  if (Object.hasOwn(patch, 'tags')) assign('version_tags', normalizeCreationTags(patch.tags));
  if (Object.hasOwn(patch, 'note')) {
    assign(
      'version_note',
      patch.note == null || !String(patch.note).trim()
        ? null
        : String(patch.note).trim().slice(0, 2000),
    );
  }
  if (Object.hasOwn(patch, 'pinned')) assign('pinned', patch.pinned === true);
  assignments.push('annotation_updated_at = now()');
  const pool = await getPool();
  try {
    const result = await pool.query(
      `update creation_revisions set
         ${assignments.join(', ')}
       where creation_id = $1 and id = $2
       returning *`,
      values,
    );
    if (!result.rows[0]) throw Object.assign(new Error('Revision not found.'), { statusCode: 404 });
    return revisionRow(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      throw Object.assign(new Error('Version names must be unique within a creation.'), { statusCode: 409 });
    }
    throw error;
  }
}

export async function restoreCreationRevision(creationId, revisionId) {
  return withTransaction(async (client) => {
    const target = await client.query(
      `select r.*, c.doc_key, c.type, c.source, c.created_at
       from creation_revisions r
       join creations c on c.id = r.creation_id
       where r.creation_id = $1 and r.id = $2`,
      [creationId, revisionId],
    );
    const revision = target.rows[0];
    if (!revision) throw Object.assign(new Error('Revision not found.'), { statusCode: 404 });
    await commitCreationRevision(client, {
      aiGenerated: revision.ai_generated,
      description: revision.description,
      document: revision.document,
      id: creationId,
      label: revision.label,
      tags: revision.tags,
    }, {
      dependencies: revision.dependency_snapshot,
      force: true,
      restoredFromRevisionId: revisionId,
      saveSource: 'restore',
    });
    const saved = await client.query(
      `select c.*, r.dependency_snapshot as current_dependency_snapshot
       from creations c
       left join creation_revisions r on r.id = c.current_revision_id
       where c.id = $1`,
      [creationId],
    );
    return creationRowToEntry(saved.rows[0]);
  });
}

export function resolveUnambiguousLibraryDeletion(matches, docKey) {
  if (matches.length > 1) {
    throw new Error(
      `Creation document key "${docKey}" is ambiguous across types (${matches.map((row) => row.type).join(', ')}). Use the managementId returned by list_my_creations, or pass type.`,
    );
  }
  return matches[0]?.id ?? null;
}

export async function deleteLibraryEntry(selector) {
  const pool = await getPool();
  const creationId = selector && typeof selector === 'object'
    ? String(selector.creationId ?? '').trim()
    : '';
  const docKey = selector && typeof selector === 'object'
    ? String(selector.docKey ?? '').trim()
    : String(selector ?? '').trim();
  const type = selector && typeof selector === 'object'
    ? String(selector.type ?? '').trim()
    : '';
  if (creationId) {
    const result = await pool.query('delete from creations where id = $1', [creationId]);
    return result.rowCount > 0;
  }
  if (!docKey) throw new Error('A creation management id or document key is required.');
  if (type) {
    const result = await pool.query(
      'delete from creations where doc_key = $1 and type = $2',
      [docKey, type],
    );
    return result.rowCount > 0;
  }
  const matches = await pool.query(
    'select id, type from creations where doc_key = $1 order by type',
    [docKey],
  );
  const targetId = resolveUnambiguousLibraryDeletion(matches.rows, docKey);
  if (!targetId) return false;
  const result = await pool.query('delete from creations where id = $1', [targetId]);
  return result.rowCount > 0;
}

export async function readLabState() {
  const pool = await getPool();
  const result = await pool.query('select key, value from lab_state order by key');
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

export function extractNamedLabStateDocuments(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.map((document) => ({ document, storeKey: null }));
  }
  if (!parsed || typeof parsed !== 'object') return [];
  return Object.entries(parsed)
    .filter(([storeKey]) => !storeKey.startsWith('__'))
    .map(([storeKey, stored]) => {
      if (!stored || typeof stored !== 'object') return { document: null, storeKey };
      if (!('json' in stored)) return { document: stored, storeKey };
      try {
        return {
          document: typeof stored.json === 'string' ? JSON.parse(stored.json) : stored.json,
          storeKey,
        };
      } catch {
        return { document: null, storeKey };
      }
    });
}

async function setLabStateWithClient(client, key, value) {
  const stateKey = String(key);
  const stateValue = String(value);
  await client.query(
    `insert into lab_state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [stateKey, stateValue],
  );
  let parsed;
  try {
    parsed = JSON.parse(stateValue);
  } catch {
    return;
  }
  const labId = stateKey.match(/^toonlab\.([a-z0-9-]+)/i)?.[1] ?? 'lab';
  if (/\.document(?:\.|$)/.test(stateKey) && parsed && typeof parsed === 'object') {
    await client.query(
      `insert into lab_drafts (lab_id, draft_key, document)
       values ($1, $2, $3::jsonb)
       on conflict (lab_id, draft_key) do update set
         document = excluded.document,
         updated_at = now()`,
      [labId, stateKey, JSON.stringify(parsed)],
    );
  }
  if (!/\.(?:presets|projects)(?:\.|$)/.test(stateKey)) return;
  const storedEntries = extractNamedLabStateDocuments(parsed);
  const retainedDocKeys = [];
  for (const { document, storeKey } of storedEntries) {
    if (!document || typeof document !== 'object' || Array.isArray(document)) continue;
    const identity = String(
      document.id
      ?? document.presetId
      ?? storeKey
      ?? '',
    ).trim();
    const explicitLabel = String(document.label ?? document.name ?? storeKey ?? '').trim();
    // A working draft/autosave has no stable user-facing identity and belongs
    // in lab_state/lab_drafts, not in the Library.
    if (!identity || !explicitLabel || identity.startsWith('__')) continue;
    const docKey = `state:${stateKey}:${identity}`;
    retainedDocKeys.push(docKey);
    const type = String(document.type ?? `${labId}-${stateKey.includes('.projects') ? 'project' : 'preset'}`);
    const label = explicitLabel.slice(0, 120);
    const entry = {
      document,
      id: docKey,
      label,
      source: 'lab',
      tags: normalizeCreationTags(document.tags),
      type,
    };
    // The doc key is the stable identity. Preserve its creation id and history
    // even if a document-schema migration changes the type discriminator.
    const matches = await client.query(
      `select * from creations
       where source = 'lab-state' and doc_key = $1
       order by (type = $2) desc, updated_at desc
       for update`,
      [docKey, type],
    );
    let saved;
    if (matches.rows.length) {
      const keeper = matches.rows[0];
      if (matches.rows.length > 1) {
        await client.query(
          `delete from creations where id = any($1::uuid[])`,
          [matches.rows.slice(1).map((row) => row.id)],
        );
      }
      saved = await client.query(
        `update creations set
           type = $2,
           label = $3,
           tags = $4,
           document = $5::jsonb,
           updated_at = now()
         where id = $1
         returning *`,
        [keeper.id, type, label, entry.tags, JSON.stringify(entry)],
      );
    } else {
      saved = await client.query(
        `insert into creations (doc_key, type, label, tags, document, source)
         values ($1, $2, $3, $4, $5::jsonb, 'lab-state')
         returning *`,
        [docKey, type, label, entry.tags, JSON.stringify(entry)],
      );
    }
    await commitCreationRevision(client, {
      ...saved.rows[0],
      aiGenerated: saved.rows[0].ai_generated,
    }, { saveSource: 'lab-state' });
  }
  await client.query(
    `delete from creations
     where source = 'lab-state'
       and left(doc_key, char_length($1)) = $1
       and not (doc_key = any($2::text[]))`,
    [`state:${stateKey}:`, retainedDocKeys],
  );
}

export async function setLabState(key, value) {
  await withTransaction((client) => setLabStateWithClient(client, key, value));
}

export async function deleteLabState(key) {
  const stateKey = String(key);
  await withTransaction(async (client) => {
    await client.query('delete from lab_state where key = $1', [stateKey]);
    await client.query('delete from lab_drafts where draft_key = $1', [stateKey]);
    await client.query(
      `delete from creations
       where source = 'lab-state'
         and left(doc_key, char_length($1)) = $1`,
      [`state:${stateKey}:`],
    );
  });
}

export async function clearLabState() {
  await withTransaction(async (client) => {
    await client.query('truncate lab_state');
    await client.query('truncate lab_drafts');
    await client.query(`delete from creations where source = 'lab-state'`);
  });
}

export async function hasLegacyImport(source) {
  const pool = await getPool();
  const result = await pool.query(
    `select 1 from legacy_import_runs
     where source = $1 and failures = '[]'::jsonb
     limit 1`,
    [source],
  );
  return result.rowCount > 0;
}

export async function migrateLegacy({
  browserEntries = {},
  libraryEntries = [],
  source = 'browser-workspace',
} = {}) {
  const report = await withTransaction(async (client) => {
    const failures = [];
    let imported = 0;
    let skipped = 0;
    const seen = new Set();
    for (const entry of Array.isArray(libraryEntries) ? libraryEntries : []) {
      try {
        const value = normalizeEntry(entry);
        const fingerprint = `${value.type}:${value.docKey}`;
        if (seen.has(fingerprint)) {
          skipped += 1;
          continue;
        }
        seen.add(fingerprint);
        const insert = await client.query(
          `insert into creations (doc_key, type, label, description, document, ai_generated)
           values ($1, $2, $3, $4, $5::jsonb, $6)
           on conflict (type, doc_key) do nothing
           returning *`,
          [value.docKey, value.type, value.label, value.description, JSON.stringify(entry), value.aiGenerated],
        );
        if (insert.rowCount) {
          await commitCreationRevision(client, {
            ...insert.rows[0],
            aiGenerated: insert.rows[0].ai_generated,
          }, { saveSource: 'legacy-import' });
          imported += 1;
        } else skipped += 1;
      } catch (error) {
        failures.push({ id: entry?.id ?? null, error: error.message });
      }
    }
    for (const [key, value] of Object.entries(browserEntries ?? {})) {
      if (typeof value !== 'string') {
        failures.push({ id: key, error: 'Browser storage value is not a string.' });
        skipped += 1;
        continue;
      }
      const existing = await client.query(
        'select 1 from lab_state where key = $1',
        [key],
      );
      await setLabStateWithClient(client, key, value);
      if (!existing.rowCount) imported += 1;
      else skipped += 1;
    }
    const result = await client.query(
      `insert into legacy_import_runs (source, imported, skipped, failures)
       values ($4, $1, $2, $3::jsonb)
       returning *`,
      [imported, skipped, JSON.stringify(failures), source],
    );
    return result.rows[0];
  });
  return report;
}

export async function listCatalogAssets({
  q = '',
  kind = '',
  source = '',
  license = '',
  size = '',
  limit = 60,
  offset = 0,
} = {}) {
  const pool = await getPool();
  const values = [];
  const where = [`availability_status = 'active'`];
  if (q) {
    values.push(q);
    where.push(`(
      search_tsv @@ plainto_tsquery('simple', $${values.length})
      or source ilike '%' || $${values.length} || '%'
      or exists (select 1 from unnest(tags) tag where tag ilike '%' || $${values.length} || '%')
    )`);
  }
  if (kind) {
    values.push(kind);
    where.push(`kind = $${values.length}`);
  }
  if (source) {
    values.push(source);
    where.push(`source = $${values.length}`);
  }
  if (license) {
    values.push(license);
    where.push(`license = $${values.length}`);
  }
  if (size) {
    values.push(size);
    where.push(`metadata->>'catalog' = 'rocks' and $${values.length} = any(tags)`);
  }
  values.push(Math.min(Math.max(Number(limit) || 60, 1), 500));
  const limitIndex = values.length;
  values.push(Math.max(Number(offset) || 0, 0));
  const offsetIndex = values.length;
  const clause = `where ${where.join(' and ')}`;
  const result = await pool.query(
    `select *, count(*) over()::int as total
     from catalog_assets ${clause}
     order by created_at desc, id
     limit $${limitIndex} offset $${offsetIndex}`,
    values,
  );
  return {
    items: result.rows.map(({ total: _total, ...row }) => row),
    total: result.rows[0]?.total ?? 0,
  };
}

export async function listCatalogFacets() {
  const pool = await getPool();
  const [sources, licenses, kinds] = await Promise.all([
    pool.query(
      `select source, license, count(*)::int as count
       from catalog_assets
       where availability_status = 'active'
       group by source, license
       order by source, license`,
    ),
    pool.query(
      `select license, count(*)::int as count
       from catalog_assets
       where availability_status = 'active'
       group by license
       order by license`,
    ),
    pool.query(
      `select kind, count(*)::int as count
       from catalog_assets
       where availability_status = 'active'
       group by kind
       order by kind`,
    ),
  ]);
  return {
    sources: sources.rows,
    licenses: licenses.rows,
    kinds: kinds.rows,
  };
}

export async function getCatalogAsset(id) {
  const pool = await getPool();
  const asset = await pool.query(
    'select * from catalog_assets where id = $1 limit 1',
    [String(id)],
  );
  if (!asset.rowCount) return null;
  const files = await pool.query(
    `select asset_id, relative_path, kind, download_url, sha256,
            byte_size, content_type, notice, compatibility, created_at
     from catalog_asset_files
     where asset_id = $1
     order by relative_path`,
    [String(id)],
  );
  return { ...asset.rows[0], files: files.rows };
}

export async function saveObject(workspacePath, bytes, { name, contentType, creationId = null, kind = 'asset' }) {
  const digest = hash(bytes);
  const extension = String(name ?? '').includes('.') ? `.${String(name).split('.').pop()}` : '';
  const objectKey = `${digest.slice(0, 2)}/${digest}${extension}`;
  const destination = join(workspacePath, 'objects', objectKey);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination).catch(async (error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  const pool = await getPool();
  const result = await pool.query(
    `insert into files (creation_id, kind, object_key, content_type, byte_size, sha256)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (creation_id, object_key) do update set object_key = excluded.object_key
     returning *`,
    [creationId, kind, objectKey, contentType, bytes.byteLength, digest],
  );
  return {
    ...result.rows[0],
    absolutePath: destination,
    mimeType: contentType,
    modifiedAt: now(),
    name,
    relativePath: `objects/${objectKey}`,
    sizeBytes: bytes.byteLength,
  };
}

export async function readObject(workspacePath, relativePath) {
  const normalized = String(relativePath ?? '').replaceAll('\\', '/').replace(/^objects\//, '');
  if (!normalized || normalized.split('/').includes('..')) throw new Error('Invalid object path.');
  const root = resolve(workspacePath, 'objects');
  const absolutePath = resolve(root, normalized);
  if (!absolutePath.startsWith(`${root}${sep}`)) throw new Error('Object path escapes the workspace.');
  const pool = await getPool();
  const result = await pool.query(
    'select content_type, byte_size from files where object_key = $1',
    [normalized],
  );
  if (!result.rowCount) throw Object.assign(new Error('Object not found.'), { statusCode: 404 });
  const info = await stat(absolutePath);
  return {
    data: await readFile(absolutePath),
    mimeType: result.rows[0].content_type,
    name: normalized.split('/').pop(),
    relativePath: `objects/${normalized}`,
    sizeBytes: Number(info.size),
  };
}

export async function listObjects(workspacePath) {
  const pool = await getPool();
  const result = await pool.query('select * from files order by created_at desc');
  return result.rows.map((file) => ({
    absolutePath: join(workspacePath, 'objects', file.object_key),
    id: `file:objects/${file.object_key}`,
    kind: file.kind,
    mimeType: file.content_type,
    modifiedAt: file.created_at,
    name: file.object_key.split('/').pop(),
    relativePath: `objects/${file.object_key}`,
    sizeBytes: Number(file.byte_size),
    source: 'workspace',
  }));
}

export async function saveCreationDocument({
  document,
  kind = 'creation',
  name = 'Untitled',
  description = null,
  tags = null,
} = {}) {
  if (document === undefined) throw new Error('document is required.');
  const id = `creation:${randomUUID()}`;
  const entry = {
    document,
    id,
    kind,
    label: name,
    description,
    source: 'library',
    tags: tags ?? document?.tags ?? [],
    type: kind,
  };
  await saveLibraryEntry(entry);
  return entry;
}

export function providerConfiguration() {
  const providers = {
    tripo: Boolean(process.env.TRIPO_API_KEY || process.env.TRIPO_API_KEYS),
    meshy: Boolean(process.env.MESHY_API_KEY || process.env.MESHY_API_KEYS),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS),
    openai: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEYS),
    ark: Boolean(process.env.ARK_API_KEY || process.env.ARK_API_KEYS),
    fal: Boolean(process.env.FAL_KEY || process.env.FAL_KEYS),
    polypizza: Boolean(process.env.POLYPIZZA_API_KEY),
  };
  return {
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    modelProviders: [
      { configured: providers.meshy, id: 'meshy', label: 'Meshy 7', kinds: ['text_to_model', 'image_to_model', 'multiview_to_model'] },
      { configured: providers.tripo, id: 'tripo', label: 'Tripo', kinds: ['text_to_model', 'image_to_model', 'multiview_to_model', 'model_segment'] },
    ],
    imageModels: [
      {
        configured: providers.gemini,
        id: 'nano-banana-2-lite',
        label: 'Nano Banana 2 Lite',
        model: 'gemini-3.1-flash-lite-image',
        provider: 'gemini',
        resolutions: ['1k'],
      },
      {
        configured: providers.gemini,
        id: 'nano-banana-2',
        label: 'Nano Banana 2',
        model: 'gemini-3.1-flash-image',
        provider: 'gemini',
        resolutions: ['1k', '2k', '4k'],
      },
      {
        configured: providers.gemini,
        id: 'nano-banana-pro',
        label: 'Nano Banana Pro',
        model: 'gemini-3-pro-image',
        provider: 'gemini',
        resolutions: ['1k', '2k', '4k'],
      },
    ],
    materialModels: [
      {
        configured: providers.fal,
        id: 'patina',
        label: 'Patina PBR Material',
        maps: ['basecolor', 'normal', 'roughness', 'metalness', 'height'],
        model: 'fal-ai/patina/material',
        provider: 'fal',
        resolutions: ['1k', '2k', '4k', '8k'],
      },
    ],
    promptEnhancementConfigured: providers.gemini || providers.openai,
    providers,
    styles: [
      { id: 'stylized', label: 'Stylized (game asset)' },
      { id: 'cartoon', label: 'Cartoon / toon' },
      { id: 'raw', label: 'Raw (no style hint)' },
    ],
  };
}

export async function createGenerationJob(provider, kind, request) {
  const pool = await getPool();
  const result = await pool.query(
    `insert into generation_jobs (provider, kind, status, request, started_at)
     values ($1, $2, 'running', $3::jsonb, now())
     returning *`,
    [provider, kind, JSON.stringify(request ?? {})],
  );
  return result.rows[0];
}

export async function finishGenerationJob(id, { result = null, error = null } = {}) {
  const pool = await getPool();
  const updated = await pool.query(
    `update generation_jobs set
       status = $2,
       result = $3::jsonb,
       error = $4,
       completed_at = now(),
       updated_at = now()
     where id = $1
     returning *`,
    [id, error ? 'failed' : 'succeeded', JSON.stringify(result), error],
  );
  return updated.rows[0] ?? null;
}

export async function updateGenerationJob(id, result) {
  const pool = await getPool();
  const updated = await pool.query(
    `update generation_jobs set
       status = 'running',
       result = $2::jsonb,
       error = null,
       updated_at = now()
     where id = $1 and status in ('queued', 'running')
     returning *`,
    [id, JSON.stringify(result ?? {})],
  );
  return updated.rows[0] ?? null;
}

export async function getGenerationJob(id) {
  const pool = await getPool();
  const result = await pool.query('select * from generation_jobs where id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function listGenerationJobs({
  kind = '',
  limit = 60,
  q = '',
} = {}) {
  const pool = await getPool();
  const values = [];
  const where = [];
  if (kind) {
    values.push(kind);
    where.push(`kind = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    where.push(`coalesce(request->>'prompt', request->>'user', '') ilike $${values.length}`);
  }
  values.push(Math.min(Math.max(Number(limit) || 60, 1), 100));
  const result = await pool.query(
    `select * from generation_jobs
     ${where.length ? `where ${where.join(' and ')}` : ''}
     order by created_at desc
     limit $${values.length}`,
    values,
  );
  return result.rows;
}

export async function cancelGenerationJob(id) {
  const pool = await getPool();
  const result = await pool.query(
    `update generation_jobs set
       status = 'cancelled',
       error = 'Cancelled locally',
       completed_at = now(),
       updated_at = now()
     where id = $1 and status in ('queued', 'running')
     returning *`,
    [id],
  );
  return result.rows[0] ?? getGenerationJob(id);
}
