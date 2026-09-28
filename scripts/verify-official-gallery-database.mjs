import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { closeDatabase, getPool } from '../database/client.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const manifestPath = argument('--manifest');
if (!manifestPath) {
  throw new Error('Usage: npm run verify:gallery-database -- --manifest <verified-release.json>');
}

const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
assert.equal(manifest.schema, 'toonlab.oss-catalog-release.v2');
const expected = manifest.assets.filter((asset) => asset.source === 'toonlab-rock');
assert.equal(expected.length, 480, 'verified Gallery release must contain all 480 ToonLab rocks');

try {
  const pool = await getPool();
  const [assetResult, fileResult, batchResult] = await Promise.all([
    pool.query(`select * from catalog_assets where source = 'toonlab-rock' order by id`),
    pool.query(`select * from catalog_asset_files
                where asset_id in (select id from catalog_assets where source = 'toonlab-rock')
                order by asset_id, relative_path`),
    pool.query(`select name, release, asset_count from catalog_seed_batches
                where release = $1 order by name`, [manifest.release]),
  ]);
  assert.equal(assetResult.rowCount, expected.length);
  assert.ok(batchResult.rows.some((row) => Number(row.asset_count) === expected.length));

  const expectedById = new Map(expected.map((asset) => [asset.id, asset]));
  const filesByAsset = new Map();
  for (const file of fileResult.rows) {
    const files = filesByAsset.get(file.asset_id) ?? new Map();
    files.set(file.relative_path, file);
    filesByAsset.set(file.asset_id, files);
  }

  for (let index = 0; index < assetResult.rows.length; index += 1) {
    const row = assetResult.rows[index];
    const expectedId = `rock-${String(index + 1).padStart(4, '0')}`;
    assert.equal(row.id, expectedId);
    const asset = expectedById.get(row.id);
    assert.ok(asset, `${row.id}: missing from verified manifest`);
    assert.equal(row.release, manifest.release);
    assert.equal(row.download_url, asset.downloadUrl);
    assert.equal(row.thumbnail_url, asset.thumbnailUrl);
    assert.equal(row.sha256, asset.sha256);
    assert.equal(Number(row.byte_size), asset.byteSize);
    assert.equal(row.content_type, 'model/gltf-binary');
    assert.equal(row.metadata?.catalog, 'rocks');
    assert.equal(row.metadata?.recipe?.kind, 'toonlab/rock-recipe');
    assert.equal(row.metadata?.recipe?.version, 1);
    assert.equal(row.metadata?.recipeHash, asset.metadata.recipeHash);
    assert.equal(Number(row.metadata?.revision), Number(asset.metadata.revision));
    for (const axis of ['width', 'height', 'depth']) {
      assert.ok(Number(row.metadata?.dimensionsMeters?.[axis]) > 0, `${row.id}: invalid ${axis}`);
    }
    const files = filesByAsset.get(row.id);
    assert.ok(files, `${row.id}: no artifact rows`);
    for (const required of ['rock.glb', 'material-config.json', 'thumbnail.png', 'recipe.json', 'manifest.json']) {
      assert.ok(files.has(required), `${row.id}: missing ${required}`);
    }
    for (const expectedFile of asset.files) {
      const file = files.get(expectedFile.path);
      assert.ok(file, `${row.id}: missing ${expectedFile.path}`);
      assert.equal(file.download_url, expectedFile.downloadUrl);
      assert.equal(file.sha256, expectedFile.sha256);
      assert.equal(Number(file.byte_size), expectedFile.byteSize);
      assert.equal(file.content_type, expectedFile.contentType);
    }
    const primary = files.get('rock.glb');
    assert.equal(primary.sha256, row.sha256);
    assert.equal(Number(primary.byte_size), Number(row.byte_size));
  }

  const serialized = JSON.stringify({ assets: assetResult.rows, files: fileResult.rows });
  assert.doesNotMatch(serialized, /assets-local|reference-materials|private-cdn|shared\/p18/i);
  process.stdout.write(`${JSON.stringify({
    release: manifest.release,
    assets: assetResult.rowCount,
    artifactRows: fileResult.rowCount,
    firstId: assetResult.rows[0]?.id,
    lastId: assetResult.rows.at(-1)?.id,
  }, null, 2)}\n`);
} finally {
  await closeDatabase();
}
