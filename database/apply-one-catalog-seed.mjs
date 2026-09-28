#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { closeDatabase, getPool, withTransaction } from './client.mjs';

const fileArgument = process.argv[2];
if (!fileArgument) throw new Error('Usage: node database/apply-one-catalog-seed.mjs database/seeds/catalog/NNNN_release.sql');
const file = path.resolve(fileArgument);
const catalogSeedRoot = `${path.resolve('database/seeds/catalog')}${path.sep}`;
if (!file.startsWith(catalogSeedRoot) || !/^\d{4}_[a-z0-9._-]+\.sql$/iu.test(path.basename(file))) {
  throw new Error('Only one numbered catalog seed below database/seeds/catalog may be applied.');
}

const sql = await readFile(file, 'utf8');
const hash = createHash('sha256').update(sql).digest('hex');
const name = path.basename(file);
const release = sql.match(/^-- Release: ([a-z0-9._-]+)$/im)?.[1];
const assetCount = Number(sql.match(/^-- Asset count: (\d+)$/m)?.[1]);
if (!release || !Number.isSafeInteger(assetCount) || assetCount < 0) {
  throw new Error(`${name}: missing generated release metadata.`);
}

try {
  const pool = await getPool();
  await pool.query(
    `create table if not exists catalog_seed_batches (
      name text primary key,
      sha256 text not null,
      release text,
      asset_count integer not null default 0,
      applied_at timestamptz not null default now()
    )`,
  );
  const result = await withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', ['toonlab:catalog_seed_batches']);
    const existing = await client.query('select sha256 from catalog_seed_batches where name = $1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== hash) throw new Error(`${name} changed after it was applied`);
      return { status: 'unchanged' };
    }
    await client.query(sql);
    await client.query(
      `insert into catalog_seed_batches (name, sha256, release, asset_count)
       values ($1, $2, $3, $4)`,
      [name, hash, release, assetCount],
    );
    const published = await client.query(
      `select count(*)::int as count from catalog_assets
       where release = $1 and availability_status = 'active'`,
      [release],
    );
    if (Number(published.rows[0].count) !== assetCount) {
      throw new Error(`${release}: expected ${assetCount} active assets after seed.`);
    }
    return { published: Number(published.rows[0].count), status: 'applied' };
  });
  process.stdout.write(`${JSON.stringify({ assetCount, hash, name, release, ...result }, null, 2)}\n`);
} finally {
  await closeDatabase();
}
