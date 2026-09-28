#!/usr/bin/env node

// Resumable production bake for the released 480-rock catalog. This never
// rewrites source GLBs or the archived 60-texture library. Each output package
// is bound to the immutable catalog GLB hash and carries an editable C7 source
// specification; PNG maps are replaceable derivatives.

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  C7_GEOLOGY_SURFACE_SCHEMA,
  C7_GEOLOGY_SURFACE_VERSION,
  createC7GeologyMapData,
  createC7SurfaceSpecification,
} from '../src/rockgen/surface/c7GeologySurface.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

const CATALOG_SQL = 'database/seeds/catalog/0002_2026-08.sql';
const DEFAULT_OUTPUT = 'assets-local/rock-c7-surfaces/v1';
const LIBRARY_SCHEMA = 'toonlab/c7-rock-surface-library';
const LIBRARY_VERSION = 1;

function parseArguments(argv) {
  const options = {
    filter: null,
    limit: 480,
    outputDirectory: path.resolve(DEFAULT_OUTPUT),
    resolution: 512,
    retryFailed: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--filter') options.filter = new RegExp(argv[++index] ?? '');
    else if (argument === '--limit') options.limit = Number(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = path.resolve(argv[++index] ?? '');
    else if (argument === '--resolution') options.resolution = Number(argv[++index]);
    else if (argument === '--retry-failed') options.retryFailed = true;
    else throw new RangeError(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 480) {
    throw new RangeError('--limit must be an integer from 1 to 480.');
  }
  if (!Number.isInteger(options.resolution) || options.resolution < 32 || options.resolution > 2048) {
    throw new RangeError('--resolution must be an integer from 32 to 2048.');
  }
  return options;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function repositoryPath(file) {
  return path.relative(path.resolve('.'), file).split(path.sep).join('/');
}

function parseCatalog(sql) {
  const assetBlocks = [...sql.matchAll(/\(\n\s*'(rock-\d{4})',[\s\S]*?\n\)/g)].slice(0, 480);
  const assets = new Map();
  for (const match of assetBlocks) {
    const block = match[0];
    const name = block.match(/'model',\s*'([^']*)'/)?.[1];
    const metadataText = block.match(/array\[[^\n]*\]::text\[],\s*'(\{.*\})'::jsonb,/)?.[1];
    const downloadUrl = block.match(/'(https:\/\/assets\.toonlab\.io\/official\/2026-08\/rock-\d{4}\/rock\.glb)'/)?.[1];
    if (!name || !metadataText || !downloadUrl) continue;
    const metadata = JSON.parse(metadataText.replaceAll("''", "'"));
    assets.set(match[1], { downloadUrl, id: match[1], metadata, name });
  }
  const filePattern = /\(\n\s*'(rock-\d{4})',\s*'rock\.glb',\s*'primary',[\s\S]*?\n\s*'https:\/\/assets\.toonlab\.io\/official\/2026-08\/rock-\d{4}\/rock\.glb',\s*'([a-f0-9]{64})',\s*(\d+),/g;
  for (const match of sql.matchAll(filePattern)) {
    const asset = assets.get(match[1]);
    if (asset) Object.assign(asset, { sourceBytes: Number(match[3]), sourceSha256: match[2] });
  }
  const result = [...assets.values()].sort((left, right) => left.id.localeCompare(right.id));
  if (result.length !== 480) throw new Error(`Catalog contains ${result.length} complete rocks; expected 480.`);
  result.forEach((asset, index) => {
    const expected = `rock-${String(index + 1).padStart(4, '0')}`;
    if (asset.id !== expected || !asset.sourceSha256 || !asset.sourceBytes) {
      throw new Error(`Catalog integrity metadata is incomplete at ${expected}.`);
    }
  });
  return result;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function currentPackage(assetDirectory, specification) {
  const manifestFile = path.join(assetDirectory, 'manifest.json');
  if (!await exists(manifestFile)) return null;
  try {
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    if (manifest.schema !== C7_GEOLOGY_SURFACE_SCHEMA
      || manifest.version !== C7_GEOLOGY_SURFACE_VERSION
      || manifest.assetId !== specification.assetId
      || manifest.geology !== specification.geology
      || manifest.seed !== specification.seed
      || manifest.mapResolution !== specification.mapResolution) return null;
    for (const record of Object.values(manifest.maps ?? {})) {
      if (!await exists(path.join(assetDirectory, record.file))) return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

async function bakeAsset(asset, options) {
  const dimensionsMetres = asset.metadata.dimensionsMeters;
  const geology = asset.metadata.taxonomy?.geology;
  const specification = {
    ...createC7SurfaceSpecification({
      assetId: asset.id,
      dimensionsMetres,
      geology,
    }),
    mapResolution: options.resolution,
  };
  const assetDirectory = path.join(options.outputDirectory, asset.id);
  await mkdir(assetDirectory, { recursive: true });
  const current = await currentPackage(assetDirectory, specification);
  if (current) return { manifest: current, status: 'skipped' };

  const generated = createC7GeologyMapData({
    geology,
    seed: specification.seed,
    size: options.resolution,
  });
  const maps = {};
  for (const [role, bytes] of Object.entries(generated.maps)) {
    const filename = `${role}.png`;
    const png = encodeRgbaPng(options.resolution, options.resolution, bytes);
    await writeFile(path.join(assetDirectory, filename), png);
    maps[role] = { bytes: png.length, file: filename, sha256: sha256(png) };
  }
  const manifest = {
    ...specification,
    generatedMapAudit: generated.audit,
    maps,
    policy: {
      editableAuthority: 'immutable catalog GLB + portable variation seed + portable sculpt deltas',
      embeddedTextureContribution: 0,
      geometryMutation: false,
      legacySixtyTextureLibraryContribution: 0,
      sourceGlbMutable: false,
      textureProjection: 'isotropic world-metre triplanar; recalculated from edited mesh bounds',
    },
    source: {
      bytes: asset.sourceBytes,
      sha256: asset.sourceSha256,
      url: asset.downloadUrl,
    },
  };
  await writeFile(path.join(assetDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, status: 'generated' };
}

const options = parseArguments(process.argv.slice(2));
const sql = await readFile(CATALOG_SQL, 'utf8');
const catalog = parseCatalog(sql);
const selected = catalog
  .filter((asset) => !options.filter || options.filter.test(`${asset.id}/${asset.metadata.familyId}/${asset.metadata.taxonomy?.geology}`))
  .slice(0, options.limit);
if (selected.length === 0) throw new Error('No catalog assets matched the requested filter.');
await mkdir(options.outputDirectory, { recursive: true });

const stateFile = path.join(options.outputDirectory, 'state.json');
let priorState = { failures: {} };
try { priorState = JSON.parse(await readFile(stateFile, 'utf8')); } catch { /* new run */ }
const failures = options.retryFailed ? { ...(priorState.failures ?? {}) } : {};
const results = [];
for (const [index, asset] of selected.entries()) {
  try {
    const result = await bakeAsset(asset, options);
    delete failures[asset.id];
    results.push({ assetId: asset.id, geology: asset.metadata.taxonomy.geology, status: result.status });
    console.log(`[${index + 1}/${selected.length}] ${asset.id} ${result.status}`);
  } catch (error) {
    const failure = { message: error?.message ?? String(error), name: error?.name ?? 'Error' };
    failures[asset.id] = failure;
    results.push({ assetId: asset.id, error: failure, status: 'failed' });
    console.error(`[${index + 1}/${selected.length}] ${asset.id} failed: ${failure.message}`);
  }
  await writeFile(stateFile, `${JSON.stringify({
    completed: results.filter((entry) => entry.status !== 'failed').length,
    failures,
    generatedAt: new Date().toISOString(),
    schema: `${LIBRARY_SCHEMA}/state`,
    selected: selected.length,
    version: LIBRARY_VERSION,
  }, null, 2)}\n`);
}

const manifest = {
  counts: {
    failed: results.filter((entry) => entry.status === 'failed').length,
    generated: results.filter((entry) => entry.status === 'generated').length,
    selected: selected.length,
    skipped: results.filter((entry) => entry.status === 'skipped').length,
  },
  generatedAt: new Date().toISOString(),
  outputDirectory: repositoryPath(options.outputDirectory),
  passed: results.length === selected.length && results.every((entry) => entry.status !== 'failed'),
  policy: {
    catalogSourceCount: 480,
    legacySixtyTextureLibraryPreserved: true,
    originalsPreserved: true,
    rolloutAuthorized: true,
  },
  resolution: options.resolution,
  results,
  schema: LIBRARY_SCHEMA,
  version: LIBRARY_VERSION,
};
await writeFile(path.join(options.outputDirectory, 'library-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ counts: manifest.counts, outputDirectory: manifest.outputDirectory, passed: manifest.passed }, null, 2));
if (!manifest.passed) process.exitCode = 1;
