#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-03-topology-mesher',
);

async function walk(current, prefix = '') {
  const results = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (relative === 'manifest.json') continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) results.push(...await walk(absolute, relative));
    else if (entry.isFile()) results.push(relative);
  }
  return results;
}

const automated = JSON.parse(await readFile(path.join(directory, 'automated-results.json'), 'utf8'));
const approval = await readFile(path.join(directory, 'approval.md'), 'utf8');
const files = [];
for (const relative of (await walk(directory)).sort()) {
  const absolute = path.join(directory, ...relative.split('/'));
  const bytes = await readFile(absolute);
  const info = await stat(absolute);
  files.push({
    bytes: info.size,
    path: relative,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const manifest = {
  algorithm: 'sha256',
  automatedGatePassed: automated.allPassed,
  checkpoint: 3,
  files,
  selectedMesher: automated.selectedMesher,
  state: approval.includes('> **State:** approved') ? 'approved' : 'candidate-awaiting-developer-approval',
};
await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${files.length} Checkpoint 3 evidence files hashed.`);
