import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDatabase, getPool, withTransaction } from './client.mjs';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));

// Before the first OSS catalog commit, local development installs could apply
// one earlier 2026-08 snapshot. The released seed is an idempotent upsert and
// is the only approved replacement for those exact bytes. Every unknown
// checksum mismatch must continue to fail closed.
const APPROVED_PRE_RELEASE_REPLACEMENTS = Object.freeze({
  catalog_seed_batches: Object.freeze({
    '0002_2026-08.sql': Object.freeze({
      from: '08c9a8f921283cc04057cd42ece71f675c993b960398715f55026c62ae2fc7a0',
      to: '60cadd07df2b6942e77b823d7e3b1901cefdf48c76eded4ec0abceb1afab94ce',
    }),
  }),
});

export function isApprovedPreReleaseReplacement(ledger, name, from, to) {
  const replacement = APPROVED_PRE_RELEASE_REPLACEMENTS[ledger]?.[name];
  return replacement?.from === from && replacement?.to === to;
}

export async function applySqlDirectory(directory, ledger) {
  const pool = await getPool();
  if (ledger === 'schema_migrations') {
    await pool.query(
      `create table if not exists schema_migrations (
        name text primary key,
        sha256 text not null,
        applied_at timestamptz not null default now()
      )`,
    );
  } else {
    await pool.query(
      `create table if not exists catalog_seed_batches (
        name text primary key,
        sha256 text not null,
        release text,
        asset_count integer not null default 0,
        applied_at timestamptz not null default now()
      )`,
    );
  }
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const applied = [];
  for (const name of files) {
    const sql = await readFile(join(directory, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const status = await withTransaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`toonlab:${ledger}`]);
      const existing = await client.query(
        `select sha256 from ${ledger} where name = $1`,
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== hash) {
          if (!isApprovedPreReleaseReplacement(ledger, name, existing.rows[0].sha256, hash)) {
            throw new Error(`${ledger} entry ${name} changed after it was applied`);
          }
          await client.query(sql);
          const declaredCount = Number(sql.match(/^-- Asset count: (\d+)$/m)?.[1]);
          const declaredRelease = sql.match(/^-- Release: ([a-z0-9._-]+)$/im)?.[1];
          await client.query(
            `update catalog_seed_batches
             set sha256 = $2,
                 release = coalesce($3, release),
                 asset_count = case when $4::integer >= 0 then $4 else asset_count end,
                 applied_at = now()
             where name = $1`,
            [
              name,
              hash,
              declaredRelease ?? null,
              Number.isSafeInteger(declaredCount) ? declaredCount : -1,
            ],
          );
          return 'reconciled-pre-release';
        }
        return 'unchanged';
      }
      const beforeCount = ledger === 'catalog_seed_batches'
        ? Number((await client.query('select count(*)::int as count from catalog_assets')).rows[0].count)
        : 0;
      await client.query(sql);
      if (ledger === 'catalog_seed_batches') {
        const afterCount = Number(
          (await client.query('select count(*)::int as count from catalog_assets')).rows[0].count,
        );
        const declaredCount = Number(sql.match(/^-- Asset count: (\d+)$/m)?.[1]);
        const declaredRelease = sql.match(/^-- Release: ([a-z0-9._-]+)$/im)?.[1];
        await client.query(
          `insert into catalog_seed_batches (name, sha256, release, asset_count)
           values ($1, $2, $3, $4)`,
          [
            name,
            hash,
            declaredRelease ?? basename(name, '.sql'),
            Number.isSafeInteger(declaredCount)
              ? declaredCount
              : Math.max(0, afterCount - beforeCount),
          ],
        );
      } else {
        await client.query(
          `insert into schema_migrations (name, sha256) values ($1, $2)`,
          [name, hash],
        );
      }
      return 'applied';
    });
    applied.push({ name, status });
  }
  return applied;
}

export async function applyMigrations() {
  return applySqlDirectory(join(databaseDirectory, 'migrations'), 'schema_migrations');
}

export async function applyCatalogSeeds() {
  return applySqlDirectory(join(databaseDirectory, 'seeds', 'catalog'), 'catalog_seed_batches');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'all';
  try {
    const result = {};
    if (mode === 'all' || mode === 'migrate') result.migrations = await applyMigrations();
    if (mode === 'all' || mode === 'seed') result.seeds = await applyCatalogSeeds();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await closeDatabase();
  }
}
