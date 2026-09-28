import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'https://assets.toonlab.io';
const prefix = `${origin}/official/2026-08-fixture/example/`;
const nextPrefix = `${origin}/official/2026-09-fixture/example/`;
const model = { path: 'model.glb', downloadUrl: `${prefix}model.glb`, sha256: 'a'.repeat(64), byteSize: 100, contentType: 'model/gltf-binary' };
const material = { path: 'material.json', downloadUrl: `${prefix}material.json`, sha256: 'b'.repeat(64), byteSize: 20, contentType: 'application/json' };
const base = {
  schema: 'toonlab.oss-catalog-release.v2', release: '2026-08-fixture', publicBaseUrl: origin,
  assets: [{
    ...model, id: 'example', source: 'test', sourceUrl: 'https://example.com/model',
    name: 'Example', kind: 'model', license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    redistributionScope: 'archive-and-files', reviewedAt: '2026-08-01',
    licenseReview: { reviewer: 'Fixture', reviewedAt: '2026-08-01', allowedScope: 'archive-and-files', requiredCredit: 'None', evidenceSha256: 'c'.repeat(64) },
    files: [model, material],
  }],
};
const next = structuredClone(base);
next.release = '2026-09-fixture';
next.assets[0].files[1] = { ...material, downloadUrl: `${nextPrefix}material.json`, sha256: 'd'.repeat(64) };
const directory = await mkdtemp(join(tmpdir(), 'toonlab-seed-reuse-'));
const generator = fileURLToPath(new URL('./generate-catalog-seed.mjs', import.meta.url));
const input = join(directory, 'next.json');
const previous = join(directory, 'base.json');
const output = join(directory, 'seed.sql');
async function run(manifest, baseline = base) {
  await writeFile(input, JSON.stringify(manifest));
  const args = [generator, '--manifest', input, '--out', output];
  if (baseline) {
    await writeFile(previous, JSON.stringify(baseline));
    args.push('--base-manifest', previous);
  }
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}
async function reject(change, expected, baseline = base) {
  const manifest = structuredClone(next);
  change(manifest);
  const result = await run(manifest, baseline);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, expected);
}
try {
  const accepted = await run(next);
  assert.equal(accepted.status, 0, accepted.stderr);
  const sql = await readFile(output, 'utf8');
  assert.ok(sql.includes(model.downloadUrl));
  assert.ok(sql.includes(`${nextPrefix}material.json`));
  await reject(() => {}, /immutable prefix/, null);
  await reject((m) => { m.assets[0].sha256 = 'e'.repeat(64); }, /sha256 differs/);
  await reject((m) => { m.assets[0].files[0].byteSize += 1; }, /byteSize differs/);
  await reject((m) => { m.assets[0].files[0].path = 'renamed.glb'; }, /relative path/);
  await reject((m) => { m.assets[0].id = 'another'; }, /immutable prefix/);
  await reject((m) => { m.assets[0].downloadUrl += '?token=example'; }, /immutable prefix/);
  await reject(() => {}, /Invalid base manifest/, { ...base, publicBaseUrl: 'https://example.com' });
  await reject(() => {}, /immutable prefix/, { ...base, withdrawals: [{ id: 'example', reason: 'Withdrawn fixture' }] });
  console.log('Catalog seed reuse verified: immutable files preserved; changed integrity, paths, identities, signed URLs, and withdrawn bases rejected.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
