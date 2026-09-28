#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-06-processes',
);

async function listFiles(root, relative = '') {
  const result = [];
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, child));
    else if (entry.isFile() && child !== 'manifest.json' && !entry.name.startsWith('.')) result.push(child);
  }
  return result;
}

function git(...arguments_) {
  return execFileSync('git', arguments_, { cwd: process.cwd(), encoding: 'utf8' }).trim();
}

const automated = JSON.parse(await readFile(path.join(directory, 'automated-results.json'), 'utf8'));
const captures = JSON.parse(await readFile(path.join(directory, 'capture-results.json'), 'utf8'));
const approval = await readFile(path.join(directory, 'approval.md'), 'utf8');
if (!automated.passed) throw new Error('Cannot finalize failed Checkpoint 6 automated evidence.');
if (!captures.passed) throw new Error('Cannot finalize failed Checkpoint 6 capture evidence.');
if (automated.counts.catalogFamilies !== 65 || automated.counts.catalogSeedPrograms !== 1040) {
  throw new Error('Checkpoint 6 requires all 65 families and 1,040 fixed-seed programs.');
}
if (captures.familyPairs !== 65 || captures.kernelPairs !== 10 || captures.captureCount !== 173) {
  throw new Error('Checkpoint 6 requires 65 family pairs, 10 kernel pairs, and 173 captures.');
}
if (!Object.values(automated.gates).every(Boolean)) {
  throw new Error('Checkpoint 6 contains a false named gate despite its composite pass result.');
}

const files = [];
for (const relativePath of await listFiles(directory)) {
  const bytes = await readFile(path.join(directory, relativePath));
  files.push({
    bytes: bytes.length,
    path: relativePath.replaceAll(path.sep, '/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const statusLines = git('status', '--porcelain=v1').split('\n').filter(Boolean);
const approved = /> \*\*State:\*\* approved/i.test(approval);
const manifest = {
  algorithm: 'sha256',
  automatedGatePassed: true,
  captureGatePassed: true,
  checkpoint: 6,
  createdAtUtc: new Date().toISOString(),
  environment: {
    architecture: os.arch(),
    node: process.version,
    platform: os.platform(),
    release: os.release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  files,
  processContract: {
    c4DependencyMustMatchRecipe: true,
    c5DependencyMustMatchRecipeAndC4: true,
    fieldSign: 'negative-is-retained-rock',
    massAccounting: 'c5-cell-volume-exact',
    mesher: 'ToonLab Manifold Dual Contouring',
    processFieldSchema: 'toonlab/rock-process-field-program',
    processFieldVersion: 1,
    processStageSchema: 'toonlab/rock-process-stage-output',
    processStageVersion: 1,
    publicPackageExportAdded: false,
    stability: 'weathered-c5-support-graph-reachability',
    timeLaw: 'monotonic-normalized-exposure',
    units: 'SI metres',
  },
  repository: {
    commit: git('rev-parse', 'HEAD'),
    dirtyPathCount: statusLines.length,
    preservationNote: 'Unrelated pre-existing changes were not reverted or rewritten.',
    worktreeDirty: statusLines.length > 0,
  },
  state: approved ? 'approved' : 'candidate-awaiting-developer-approval',
  verification: {
    ...automated.counts,
    captures: captures.captureCount,
    familyPairs: captures.familyPairs,
    kernelPairs: captures.kernelPairs,
  },
};

await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  automatedGatePassed: manifest.automatedGatePassed,
  captureGatePassed: manifest.captureGatePassed,
  checkpoint: manifest.checkpoint,
  evidenceFiles: files.length,
  state: manifest.state,
}, null, 2));
