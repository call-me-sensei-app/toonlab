#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJointedGraniteBoulderSource } from '../src/rockgen/experimental/realisticBoulderFamily.js';
import { compileRealisticRock } from '../src/rockgen/experimental/realisticRockCompiler.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const seeds = String(readOption('--seeds', readOption('--seed', '11,29,53')))
  .split(',')
  .map((value) => positiveInteger(value, 0))
  .filter((value) => value > 0);
const atlasResolution = positiveInteger(readOption('--atlas', 512), 512);
const meshResolution = positiveInteger(readOption('--mesh', 52), 52);
const outputRoot = path.resolve(
  repositoryRoot,
  readOption('--out', 'assets-local/labs/toonlab-realistic-boulder'),
);

if (seeds.length === 0) throw new Error('At least one positive seed is required.');

const reports = [];
for (const seed of seeds) {
  const artifact = compileRealisticRock(createJointedGraniteBoulderSource({ seed }), {
    atlasResolution,
    meshResolution,
    rejectUnqualified: true,
  });
  const directory = path.join(outputRoot, `seed-${String(seed).padStart(3, '0')}`);
  await mkdir(directory, { recursive: true });
  const normalAoPng = encodeRgbaPng(
    artifact.bake.width,
    artifact.bake.height,
    artifact.bake.normalAo,
  );
  const surfacePng = encodeRgbaPng(
    artifact.bake.width,
    artifact.bake.height,
    artifact.bake.surface,
  );
  const meshJson = `${JSON.stringify(artifact.geometry)}\n`;
  const manifest = {
    ...artifact.manifest,
    files: {
      mesh: { bytes: Buffer.byteLength(meshJson), path: 'mesh.json' },
      normalAo: { bytes: normalAoPng.length, path: 'normal-ao.png' },
      surface: { bytes: surfacePng.length, path: 'surface.png' },
    },
  };
  await Promise.all([
    writeFile(path.join(directory, 'mesh.json'), meshJson),
    writeFile(path.join(directory, 'normal-ao.png'), normalAoPng),
    writeFile(path.join(directory, 'surface.png'), surfacePng),
    writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  reports.push({ directory, ...manifest });
}

console.log(JSON.stringify({
  atlasResolution,
  meshResolution,
  ok: true,
  reports,
}, null, 2));
