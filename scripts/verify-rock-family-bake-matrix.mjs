import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { createJointedGraniteBoulderSource } from '../src/rockgen/experimental/realisticBoulderFamily.js';
import { compileRealisticRock } from '../src/rockgen/experimental/realisticRockCompiler.js';
import {
  createRockgenPresetBakeSource,
  ROCKGEN_FAMILY_PROFILES,
} from '../src/rockgen/experimental/rockgenPresetBakeSource.js';

const customProfile = Object.freeze({
  geology: 'granite',
  id: 'jointed-granite-boulder',
  label: 'Jointed Granite Boulder v1',
});
const profiles = [customProfile, ...ROCKGEN_FAMILY_PROFILES];
const seeds = [11, 29, 47];

function sourceFor(profile, seed) {
  return profile.id === customProfile.id
    ? createJointedGraniteBoulderSource({ seed })
    : createRockgenPresetBakeSource({ family: profile.id, seed });
}

function compile(profile, seed) {
  return compileRealisticRock(sourceFor(profile, seed), {
    atlasResolution: 96,
    meshResolution: profile.id === customProfile.id ? 52 : 36,
    rejectUnqualified: false,
  });
}

const compilerSources = await Promise.all([
  '../src/rockgen/experimental/realisticRockCompiler.js',
  '../src/rockgen/experimental/surfaceBakeCompiler.js',
  '../src/rockgen/experimental/surfaceAtlas.js',
].map((relative) => readFile(new URL(relative, import.meta.url), 'utf8')));
for (const source of compilerSources) {
  assert.doesNotMatch(source, /vibe3d|vibeDualContour|referenceModel/i, 'compiler must remain ToonLab-owned');
}

const reports = [];
for (const profile of profiles) {
  const familyReports = [];
  for (const seed of seeds) {
    const artifact = compile(profile, seed);
    const { manifest } = artifact;
    assert.equal(manifest.seed, seed);
    assert.equal(manifest.geology, profile.geology);
    assert.equal(manifest.geometry.sourceAudit.nonFiniteVertices, 0);
    assert.equal(manifest.geometry.sourceAudit.components >= 1, true);
    assert.equal(artifact.bake.normalAo.length, 96 * 96 * 4);
    assert.equal(artifact.bake.surface.length, 96 * 96 * 4);
    assert.ok(manifest.atlas.stats.atlasCoverage > 0.05, `${profile.id} seed ${seed} has atlas coverage`);
    assert.ok(manifest.atlas.stats.hitRate >= 0.98, `${profile.id} seed ${seed} traces its detailed surface`);
    familyReports.push({
      acceptance: manifest.acceptance,
      atlasCoverage: manifest.atlas.stats.atlasCoverage,
      buildMs: manifest.buildMs,
      contentHash: manifest.contentHash,
      hitRate: manifest.atlas.stats.hitRate,
      projectionConflictRate: manifest.atlas.stats.projectionConflictRate,
      seed,
      sourceAudit: manifest.geometry.sourceAudit,
    });
  }
  const deterministicA = compile(profile, seeds[0]);
  const deterministicB = compile(profile, seeds[0]);
  assert.equal(
    deterministicA.manifest.contentHash,
    deterministicB.manifest.contentHash,
    `${profile.id} compilation is deterministic`,
  );
  reports.push({
    acceptedSeeds: familyReports.filter((entry) => entry.acceptance.accepted).map((entry) => entry.seed),
    familyId: profile.id,
    familyLabel: profile.label,
    geology: profile.geology,
    reports: familyReports,
    testedSeeds: seeds,
  });
}

const summary = {
  atlasResolution: 96,
  compiler: 'toonlab-high-to-low-v1',
  familyCount: reports.length,
  fullyAcceptedFamilies: reports
    .filter((entry) => entry.acceptedSeeds.length === seeds.length)
    .map((entry) => entry.familyId),
  meshResolution: { custom: 52, rockgenPresets: 36 },
  ok: true,
  partiallyAcceptedFamilies: reports
    .filter((entry) => entry.acceptedSeeds.length > 0 && entry.acceptedSeeds.length < seeds.length)
    .map((entry) => entry.familyId),
  rejectedFamilies: reports
    .filter((entry) => entry.acceptedSeeds.length === 0)
    .map((entry) => entry.familyId),
  reports,
  seeds,
};
const outputDirectory = new URL('../artifacts/research/toonlab-rock-family-matrix/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL('qualification.json', outputDirectory), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  familyCount: summary.familyCount,
  fullyAcceptedFamilies: summary.fullyAcceptedFamilies,
  ok: true,
  partiallyAcceptedFamilies: summary.partiallyAcceptedFamilies,
  rejectedFamilies: summary.rejectedFamilies,
}, null, 2));

