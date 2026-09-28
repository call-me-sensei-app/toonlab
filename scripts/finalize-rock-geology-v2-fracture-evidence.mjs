#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks',
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
if (!automated.passed) throw new Error('Cannot finalize failed Checkpoint 5 automated evidence.');
if (!captures.passed) throw new Error('Cannot finalize failed Checkpoint 5 capture evidence.');

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
  checkpoint: 5,
  createdAtUtc: new Date().toISOString(),
  environment: {
    architecture: os.arch(),
    node: process.version,
    platform: os.platform(),
    release: os.release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  files,
  fractureBlockContract: {
    blockGridLongestAxisCells: 28,
    blockModelSchema: 'toonlab/rock-implicit-block-model',
    blockModelVersion: 1,
    fractureNetworkSchema: 'toonlab/rock-fracture-network-program',
    fractureNetworkVersion: 1,
    maximumPanelsPerSet: 512,
    publicPackageExportAdded: false,
    stageOutputSchema: 'toonlab/rock-fracture-block-stage-output',
    stageOutputVersion: 1,
    units: 'SI metres',
  },
  repository: {
    commit: git('rev-parse', 'HEAD'),
    dirtyPathCount: statusLines.length,
    preservationNote: 'Unrelated pre-existing changes were not reverted or rewritten.',
    worktreeDirty: statusLines.length > 0,
  },
  state: approved ? 'approved' : 'candidate-awaiting-developer-approval',
  verification: automated.counts,
};

await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  automatedGatePassed: manifest.automatedGatePassed,
  captureGatePassed: manifest.captureGatePassed,
  checkpoint: manifest.checkpoint,
  evidenceFiles: files.length,
  state: manifest.state,
}, null, 2));
