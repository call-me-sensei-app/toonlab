#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  C7_GEOLOGY_PROFILES,
  C7_GEOLOGY_SURFACE_SCHEMA,
  C7_GEOLOGY_SURFACE_VERSION,
  resolveC7Projection,
} from '../src/rockgen/surface/c7GeologySurface.js';

const root = path.resolve(process.argv[2] ?? 'assets-local/rock-c7-surfaces/v1');
const MAP_ROLES = Object.freeze([
  'ao', 'baseColor', 'height', 'normalGL', 'ormHeight', 'roughness', 'smoothness',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const libraryManifestBytes = await readFile(path.join(root, 'library-manifest.json'));
const library = JSON.parse(libraryManifestBytes);
assert(library.schema === 'toonlab/c7-rock-surface-library', 'Wrong C7 library schema.');
assert(library.version === 1, 'Wrong C7 library version.');
assert(library.passed === true, 'C7 library manifest is not passing.');
assert(library.counts.selected === 480, `C7 library selected ${library.counts.selected}; expected 480.`);
assert(library.counts.failed === 0, `C7 library reports ${library.counts.failed} failures.`);
assert(library.results.length === 480, 'C7 library result count is not 480.');

const geologyCounts = {};
let totalBytes = 0;
for (let index = 0; index < 480; index += 1) {
  const assetId = `rock-${String(index + 1).padStart(4, '0')}`;
  const assetRoot = path.join(root, assetId);
  const manifestBytes = await readFile(path.join(assetRoot, 'manifest.json'));
  totalBytes += manifestBytes.length;
  const manifest = JSON.parse(manifestBytes);
  assert(manifest.schema === C7_GEOLOGY_SURFACE_SCHEMA, `${assetId}: wrong surface schema.`);
  assert(manifest.version === C7_GEOLOGY_SURFACE_VERSION, `${assetId}: wrong surface version.`);
  assert(manifest.assetId === assetId, `${assetId}: manifest identity drift.`);
  assert(Boolean(C7_GEOLOGY_PROFILES[manifest.geology]), `${assetId}: unknown geology ${manifest.geology}.`);
  assert(manifest.mapResolution === library.resolution, `${assetId}: resolution drift.`);
  assert(/^[a-f0-9]{64}$/u.test(manifest.source?.sha256 ?? ''), `${assetId}: missing source GLB hash.`);
  assert(manifest.policy?.sourceGlbMutable === false, `${assetId}: source GLB is not immutable.`);
  assert(manifest.policy?.embeddedTextureContribution === 0, `${assetId}: embedded maps contribute.`);
  assert(manifest.policy?.legacySixtyTextureLibraryContribution === 0, `${assetId}: legacy 60 maps contribute.`);
  assert(manifest.projection?.mode === 'world-metre-triplanar-isotropic', `${assetId}: projection is not isotropic triplanar.`);
  const expectedProjection = resolveC7Projection({
    dimensionsMetres: manifest.projection.dimensionsMetres,
    geology: manifest.geology,
  });
  assert(JSON.stringify(manifest.projection) === JSON.stringify(expectedProjection), `${assetId}: projection calibration drift.`);
  assert(new Set(manifest.projection.axisScale).size === 1, `${assetId}: anisotropic projection would stretch maps.`);
  assert(Object.keys(manifest.maps ?? {}).sort().join(',') === MAP_ROLES.join(','), `${assetId}: map role set is incomplete.`);
  for (const role of MAP_ROLES) {
    const record = manifest.maps[role];
    const file = path.join(assetRoot, record.file);
    const bytes = await readFile(file);
    const metadata = await stat(file);
    totalBytes += bytes.length;
    assert(metadata.size === record.bytes, `${assetId}/${role}: byte count drift.`);
    assert(sha256(bytes) === record.sha256, `${assetId}/${role}: SHA-256 drift.`);
  }
  geologyCounts[manifest.geology] = (geologyCounts[manifest.geology] ?? 0) + 1;
}

const report = {
  assets: 480,
  geologies: geologyCounts,
  libraryManifestSha256: sha256(libraryManifestBytes),
  mapFiles: 480 * MAP_ROLES.length,
  outputDirectory: path.relative(path.resolve('.'), root).split(path.sep).join('/'),
  passed: true,
  totalBytes,
};
const evidenceDirectory = path.resolve('artifacts/research/rock-geology-v2/latest-480-c7-surface-library-v1');
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(path.join(evidenceDirectory, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
