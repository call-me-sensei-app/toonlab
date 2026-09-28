#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJointedGraniteBoulderSource } from '../src/rockgen/experimental/realisticBoulderFamily.js';
import { compileRealisticRock } from '../src/rockgen/experimental/realisticRockCompiler.js';
import {
  createRockgenPresetBakeSource,
  ROCKGEN_FAMILY_PROFILES,
} from '../src/rockgen/experimental/rockgenPresetBakeSource.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUSTOM_FAMILY = Object.freeze({
  geology: 'granite',
  id: 'jointed-granite-boulder',
  label: 'Jointed Granite Boulder v1',
});
export const QUALIFIED_ROCK_FAMILIES = Object.freeze([CUSTOM_FAMILY, ...ROCKGEN_FAMILY_PROFILES]);

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function requestedFamilies() {
  const option = String(readOption('--families', 'all')).trim();
  if (!option || option === 'all') return QUALIFIED_ROCK_FAMILIES;
  const ids = new Set(option.split(',').map((entry) => entry.trim()).filter(Boolean));
  const profiles = QUALIFIED_ROCK_FAMILIES.filter((entry) => ids.has(entry.id));
  const missing = [...ids].filter((id) => !profiles.some((entry) => entry.id === id));
  if (missing.length > 0) throw new Error(`Unknown rock families: ${missing.join(', ')}`);
  return profiles;
}

function sourceFor(profile, seed) {
  return profile.id === CUSTOM_FAMILY.id
    ? createJointedGraniteBoulderSource({ seed })
    : createRockgenPresetBakeSource({ family: profile.id, seed });
}

async function writeArtifact(directory, artifact, profile) {
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
    familyId: profile.id,
    familyLabel: profile.label,
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
  return manifest;
}

const seed = positiveInteger(readOption('--seed', 11), 11);
const atlasResolution = positiveInteger(readOption('--atlas', 384), 384);
const meshResolution = positiveInteger(readOption('--mesh', 42), 42);
const outputRoot = path.resolve(
  repositoryRoot,
  readOption('--out', 'assets-local/labs/toonlab-rock-family-matrix'),
);
const reports = [];

for (const profile of requestedFamilies()) {
  const started = performance.now();
  try {
    const artifact = compileRealisticRock(sourceFor(profile, seed), {
      atlasResolution,
      meshResolution,
      rejectUnqualified: false,
    });
    const directory = path.join(outputRoot, profile.id, `seed-${String(seed).padStart(3, '0')}`);
    const manifest = await writeArtifact(directory, artifact, profile);
    reports.push({
      accepted: manifest.acceptance.accepted,
      buildMs: Math.round((performance.now() - started) * 10) / 10,
      directory,
      familyId: profile.id,
      familyLabel: profile.label,
      manifest,
      ok: true,
    });
    console.log(`${profile.id}: ${manifest.acceptance.accepted ? 'accepted' : 'captured with gate failures'}`);
  } catch (error) {
    reports.push({
      buildMs: Math.round((performance.now() - started) * 10) / 10,
      error: error instanceof Error ? error.message : String(error),
      familyId: profile.id,
      familyLabel: profile.label,
      ok: false,
    });
    console.error(`${profile.id}: ${reports.at(-1).error}`);
  }
}

await mkdir(outputRoot, { recursive: true });
const index = {
  atlasResolution,
  generatedAt: new Date().toISOString(),
  meshResolution,
  ok: reports.every((entry) => entry.ok),
  reports,
  seed,
};
await writeFile(path.join(outputRoot, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({
  accepted: reports.filter((entry) => entry.accepted).length,
  compiled: reports.filter((entry) => entry.ok).length,
  failed: reports.filter((entry) => !entry.ok).length,
  outputRoot,
  total: reports.length,
}, null, 2));

