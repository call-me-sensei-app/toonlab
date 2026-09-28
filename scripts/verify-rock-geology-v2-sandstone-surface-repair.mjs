#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDenseDetailField } from '../src/rockgen/experimental/geology-v2/bake/detailField.node.js';
import { compileC8BasisStages } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixtures } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';

const OUTPUT_DIRECTORY = path.resolve('tmp/rock-geology-v2/sandstone-surface-repair');
const RECIPE_ID = 'c8-cross-bedded-sandstone-sandstone-cliff-hero-101000';
const PRE_REPAIR_FIELD_CONTENT_ID = 'sha256:c01447205e96f783561cc4a2685e846b40cccd553c5df5550dabfe39d788e07d';
const EXPECTED_FIELD_CONTENT_ID = 'sha256:7f2810b7f8fbf12066488cacdc328869250c9d32adca22d82bcb1ee901988962';
const EXPECTED_MACRO_PROGRAM_CONTENT_ID = 'sha256:3ef82543f0d68c7c24c3874fd6e0ce70809b9ca3eb5755566204f0c731ef747e';
const MACRO_PROBES = Object.freeze([
  [[-4, -3, 2], 1.733120535805352],
  [[-2, 0, 2], 0.12558159308076744],
  [[0, 2, 2], -0.6288088178197621],
  [[3, 3, 0], 3.26985348370194],
  [[4, -2, -1], 2.1878937964465255],
  [[0, 4, 0], 1.3529437559381632],
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function autocorrelation(values, lag) {
  const average = mean(values);
  let numerator = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < values.length - lag; index += 1) {
    const a = values[index] - average;
    const b = values[index + lag] - average;
    numerator += a * b;
    left += a * a;
    right += b * b;
  }
  return numerator / Math.max(Math.sqrt(left * right), 1e-12);
}

const catalog = loadGeologyCatalog();
const fixture = createC8BasisFixtures({ catalog })['cross-bedded-sandstone'].hero
  .find((candidate) => candidate.recipe.id === RECIPE_ID);
assert.ok(fixture, `Missing fixture ${RECIPE_ID}.`);
const first = compileC8BasisStages(fixture, { catalog });
const second = compileC8BasisStages(fixture, { catalog });
const field = first.basisField;
const rerunField = second.basisField;
const scale = Math.max(...fixture.recipe.targetDimensionsMetres);
const denseSeed = first.processStage.processProgram.seeds.denseSource ?? fixture.recipe.seed;
const detailOptions = { amplitudeMetres: scale * 0.0025, seed: denseSeed };
const detail = createDenseDetailField(fixture.recipe, field, detailOptions);
const rerunDetail = createDenseDetailField(fixture.recipe, rerunField, detailOptions);

assert.equal(field.descriptor.fieldContentId, EXPECTED_FIELD_CONTENT_ID);
assert.notEqual(field.descriptor.fieldContentId, PRE_REPAIR_FIELD_CONTENT_ID);
assert.equal(field.descriptor.fieldContentId, rerunField.descriptor.fieldContentId);
assert.equal(field.descriptor.macroTemplate.macroProgramContentId, EXPECTED_MACRO_PROGRAM_CONTENT_ID);
assert.equal(field.descriptor.macroTemplate.surfaceProgramVersion, 9);

let maximumMacroProbeErrorMetres = 0;
for (const [point, expected] of MACRO_PROBES) {
  maximumMacroProbeErrorMetres = Math.max(maximumMacroProbeErrorMetres, Math.abs(field.evaluate(...point) - expected));
}
assert.ok(maximumMacroProbeErrorMetres <= 1e-12, `Macro field changed by ${maximumMacroProbeErrorMetres}m.`);

const deterministicProbePoints = [];
for (let x = -4; x <= 4; x += 0.8) {
  for (let y = -3.8; y <= 3.8; y += 0.76) deterministicProbePoints.push([x, y, 2.35]);
}
for (const point of deterministicProbePoints) {
  assert.deepEqual(field.surfaceSemantics(point), rerunField.surfaceSemantics(point));
  assert.deepEqual(detail.sample(point, [0, 0, 1], 0.83, -0.04), rerunDetail.sample(point, [0, 0, 1], 0.83, -0.04));
  assert.equal(detail.evaluate(...point), rerunDetail.evaluate(...point));
}

const epsilon = 0.01;
const stratigraphicAlignments = [];
for (let x = -4; x <= 4; x += 1) {
  for (let z = -2; z <= 2; z += 1) {
    const point = [x, 0.2, z];
    const gradient = [0, 1, 2].map((axis) => {
      const ahead = [...point];
      const behind = [...point];
      ahead[axis] += epsilon;
      behind[axis] -= epsilon;
      return (field.surfaceSemantics(ahead).stratigraphicCoordinateMetres
        - field.surfaceSemantics(behind).stratigraphicCoordinateMetres) / (epsilon * 2);
    });
    stratigraphicAlignments.push(Math.abs(gradient[1]) / Math.hypot(...gradient));
  }
}
const dominantBeddingNormal = {
  declaredAxis: [0, 1, 0],
  meanAbsoluteDot: mean(stratigraphicAlignments),
  minimumAbsoluteDot: Math.min(...stratigraphicAlignments),
  samples: stratigraphicAlignments.length,
};
assert.ok(dominantBeddingNormal.meanAbsoluteDot >= 0.995);
assert.ok(dominantBeddingNormal.minimumAbsoluteDot >= 0.99);

const verticalSamples = 1024;
const repairedBedding = [];
const legacySine = [];
for (let index = 0; index < verticalSamples; index += 1) {
  const y = -4.2 + (8.4 * index) / (verticalSamples - 1);
  repairedBedding.push(field.surfaceSemantics([0, y, 2.4]).bedding);
  legacySine.push(Math.sin(y / (scale * 0.055) * Math.PI * 2) * 0.5 + 0.5);
}
const lagRange = Array.from({ length: 106 }, (_, index) => index + 35);
const repetition = {
  lagRangeSamples: [lagRange[0], lagRange.at(-1)],
  legacyPeakAutocorrelation: Math.max(...lagRange.map((lag) => autocorrelation(legacySine, lag))),
  repairedPeakAutocorrelation: Math.max(...lagRange.map((lag) => autocorrelation(repairedBedding, lag))),
  sampleSpacingMetres: 8.4 / (verticalSamples - 1),
};
assert.ok(repetition.legacyPeakAutocorrelation >= 0.99);
assert.ok(repetition.repairedPeakAutocorrelation <= 0.35);
assert.ok(repetition.repairedPeakAutocorrelation <= repetition.legacyPeakAutocorrelation * 0.4);

const luminance = [];
const roughness = [];
const reliefMetres = [];
for (const point of deterministicProbePoints) {
  const material = detail.sample(point, [0, 0, 1], 0.85, 0);
  luminance.push(material.baseColorLinear[0] * 0.2126 + material.baseColorLinear[1] * 0.7152 + material.baseColorLinear[2] * 0.0722);
  roughness.push(material.roughness);
  reliefMetres.push(detail.evaluate(...point) - field.evaluate(...point));
}
const denseSurface = {
  luminanceRange: Math.max(...luminance) - Math.min(...luminance),
  luminanceStandardDeviation: standardDeviation(luminance),
  maximumReliefMetres: Math.max(...reliefMetres),
  maximumReliefToScaleRatio: Math.max(...reliefMetres) / scale,
  roughnessStandardDeviation: standardDeviation(roughness),
};
assert.ok(denseSurface.luminanceRange >= 0.025);
assert.ok(denseSurface.luminanceStandardDeviation >= 0.005);
assert.ok(denseSurface.roughnessStandardDeviation >= 0.025);
assert.ok(denseSurface.maximumReliefMetres <= detail.amplitudeMetres * 1.24 + 1e-12);
assert.ok(denseSurface.maximumReliefToScaleRatio <= 0.0031);

const sourceFiles = [
  'src/rockgen/experimental/geology-v2/basis/field.node.js',
  'src/rockgen/experimental/geology-v2/bake/detailField.node.js',
  'scripts/verify-rock-geology-v2-sandstone-surface-repair.mjs',
];
const report = {
  denseSurface,
  deterministicProbeCount: deterministicProbePoints.length,
  dominantBeddingNormal,
  fieldContentId: field.descriptor.fieldContentId,
  macroIntegrity: {
    macroProgramContentId: field.descriptor.macroTemplate.macroProgramContentId,
    maximumProbeErrorMetres: maximumMacroProbeErrorMetres,
    probeCount: MACRO_PROBES.length,
  },
  passed: true,
  preRepairFieldContentId: PRE_REPAIR_FIELD_CONTENT_ID,
  recipeId: RECIPE_ID,
  repetition,
  sourceFiles: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, sha256(await readFile(file))]))),
  surfaceProgramVersion: field.descriptor.macroTemplate.surfaceProgramVersion,
};
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(path.join(OUTPUT_DIRECTORY, 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
