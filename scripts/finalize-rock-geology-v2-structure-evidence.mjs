#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-04-structural-fields',
);

async function listFiles(root, relative = '') {
  const result = [];
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
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
const captureResults = JSON.parse(await readFile(path.join(directory, 'capture-results.json'), 'utf8'));
const approval = await readFile(path.join(directory, 'approval.md'), 'utf8');
if (!automated.passed) throw new Error('Cannot finalize failed Checkpoint 4 automated evidence.');
if (!captureResults.passed) throw new Error('Cannot finalize failed Checkpoint 4 captures.');

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
  checkpoint: 4,
  createdAtUtc: new Date().toISOString(),
  environment: {
    architecture: os.arch(),
    node: process.version,
    platform: os.platform(),
    release: os.release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  files,
  repository: {
    commit: git('rev-parse', 'HEAD'),
    dirtyPathCount: statusLines.length,
    worktreeDirty: statusLines.length > 0,
    preservationNote: 'Unrelated pre-existing changes were not reverted or rewritten.',
  },
  state: approved ? 'approved' : 'candidate-awaiting-developer-approval',
  structuralContract: {
    publicPackageExportAdded: false,
    recipeSchema: 'toonlab/rock-geology-recipe',
    recipeVersion: 1,
    structuralProgramSchema: 'toonlab/rock-structural-field-program',
    structuralProgramVersion: 1,
    units: 'SI metres and square metres',
    worldAxes: '+X east, +Y up, +Z north; azimuth clockwise from north',
  },
  verification: automated.counts,
};

await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  automatedGatePassed: manifest.automatedGatePassed,
  checkpoint: manifest.checkpoint,
  evidenceFiles: files.length,
  state: manifest.state,
}, null, 2));
