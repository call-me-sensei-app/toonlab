#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { createStructuralField } from '../src/rockgen/experimental/geology-v2/structure/field.node.js';
import {
  createC4InvalidStructuralFixtures,
  createC4StructuralFixtures,
} from '../src/rockgen/experimental/geology-v2/structure/fixtures.node.js';
import {
  dot3,
  frameToWorld,
  length3,
  scale3,
  add3,
} from '../src/rockgen/experimental/geology-v2/structure/math.node.js';
import {
  compileStructuralFieldProgram,
  structuralProgramCompatibility,
} from '../src/rockgen/experimental/geology-v2/structure/program.node.js';

function parseArguments(argv) {
  const options = {
    outputDir: path.resolve('artifacts/research/rock-geology-v2/checkpoint-04-structural-fields'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-dir') options.outputDir = path.resolve(argv[++index] ?? '');
    else if (argument === '--help') {
      console.log('Usage: node scripts/verify-rock-geology-v2-structure.mjs [--output-dir DIR]');
      process.exit(0);
    } else throw new RangeError(`Unknown argument: ${argument}`);
  }
  return options;
}

function round(value, digits = 9) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function angleDegrees(a, b) {
  const cosine = Math.abs(dot3(a, b)) / Math.max(length3(a) * length3(b), 1e-15);
  return Math.acos(Math.min(1, cosine)) * 180 / Math.PI;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function correlation(values, lag) {
  const count = values.length - lag;
  const left = values.slice(0, count);
  const right = values.slice(lag);
  const leftMean = left.reduce((sum, value) => sum + value, 0) / count;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let index = 0; index < count; index += 1) {
    const x = left[index] - leftMean;
    const y = right[index] - rightMean;
    numerator += x * y;
    leftEnergy += x * x;
    rightEnergy += y * y;
  }
  return numerator / Math.max(Math.sqrt(leftEnergy * rightEnergy), 1e-15);
}

async function writeJson(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDir, { recursive: true });
await mkdir(path.join(options.outputDir, 'programs'), { recursive: true });

const catalog = loadGeologyCatalog();
const fixtures = createC4StructuralFixtures({ catalog });
const invalidFixtures = createC4InvalidStructuralFixtures({ catalog });
const failures = [];
let checks = 0;

function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
  return condition;
}

const compiledFixtures = {};
for (const [name, recipe] of Object.entries(fixtures)) {
  const program = compileStructuralFieldProgram(recipe, { catalog });
  const field = createStructuralField(program);
  compiledFixtures[name] = { field, program, recipe };
  await writeJson(path.join(options.outputDir, 'programs'), `${name}.json`, program);
  check(/^sha256:[a-f0-9]{64}$/.test(program.recipeContentId), 'FIXTURE_RECIPE_CONTENT_ID', { name });
  check(/^sha256:[a-f0-9]{64}$/.test(program.programContentId), 'FIXTURE_PROGRAM_CONTENT_ID', { name });
}

const analytic = [];
{
  const { field, program } = compiledFixtures.planarBedding;
  const points = [[0, 0, 0], [45, 12, -36], [-80, 22, 71]];
  const errors = points.map((point) => angleDegrees(field.orientationAt(point, 0.05), program.frames.primaryFabric.normal));
  analytic.push({ fixture: 'planar-bedding', maximumOrientationErrorDegrees: round(Math.max(...errors)), expectedStrikeDegrees: 37, expectedDipDegrees: 28 });
  check(Math.max(...errors) < 2, 'PLANAR_ORIENTATION_ERROR', { errors, toleranceDegrees: 2 });
}
{
  const { field, program } = compiledFixtures.foldedBedding;
  const fold = program.folds[0];
  const left = frameToWorld(program.frames.primaryFabric, [0, fold.centerAcrossMetres - fold.halfWidthMetres * 0.52, 0]);
  const right = frameToWorld(program.frames.primaryFabric, [0, fold.centerAcrossMetres + fold.halfWidthMetres * 0.52, 0]);
  const leftNormal = field.orientationAt(left, 0.08);
  const rightNormal = field.orientationAt(right, 0.08);
  const divergence = angleDegrees(leftNormal, rightNormal);
  analytic.push({ fixture: 'folded-bedding', foldAmplitudeMetres: round(fold.amplitudeMetres), limbNormalDivergenceDegrees: round(divergence) });
  check(divergence > 12, 'FOLD_LIMBS_NOT_DISTINCT', { divergence });
}
{
  const { field, program } = compiledFixtures.faultedFabric;
  const fault = program.faults[0];
  const hangingWall = frameToWorld(fault.frame, [0, 0, 1]);
  const restored = field.evaluate(hangingWall).chronology.restoredFaults[0];
  const restoredMagnitude = restored ? length3(restored.displacementMetres) : 0;
  const farPoint = frameToWorld(fault.frame, [fault.halfLengthMetres * 1.2, 0, 1]);
  const farRestorations = field.evaluate(farPoint).chronology.restoredFaults.length;
  analytic.push({ fixture: 'finite-fault', expectedOffsetMetres: round(fault.offsetMetres), restoredOffsetMetres: round(restoredMagnitude), outsideFiniteSupportRestorations: farRestorations });
  check(Math.abs(restoredMagnitude - fault.offsetMetres) < 1e-9, 'FAULT_OFFSET_ERROR', { expected: fault.offsetMetres, actual: restoredMagnitude });
  check(farRestorations === 0, 'FAULT_NOT_FINITE', { farRestorations });
}
{
  const { field, program } = compiledFixtures.unconformity;
  const below = frameToWorld(program.unconformity.surfaceFrame, [0, 0, -8]);
  const above = frameToWorld(program.unconformity.surfaceFrame, [0, 0, 8]);
  const belowSample = field.evaluate(below);
  const aboveSample = field.evaluate(above);
  const angularDiscordance = angleDegrees(program.frames.primaryFabric.normal, program.unconformity.youngerFrame.normal);
  analytic.push({ fixture: 'unconformity', belowPackage: belowSample.packageId, abovePackage: aboveSample.packageId, angularDiscordanceDegrees: round(angularDiscordance) });
  check(belowSample.packageId === 'older' && aboveSample.packageId === 'younger', 'UNCONFORMITY_TERMINATION_ERROR', { below: belowSample.packageId, above: aboveSample.packageId });
  check(angularDiscordance > 4.5, 'UNCONFORMITY_NO_DISCORDANCE', { angularDiscordance, minimumDegrees: 4.5 });
}
for (const [name, expectedKind] of [['dyke', 'dyke'], ['sill', 'sill'], ['vein', 'vein']]) {
  const { field, program } = compiledFixtures[name];
  const intrusion = program.intrusions[0];
  const center = frameToWorld(intrusion.frame, [0, 0, 0]);
  const outside = frameToWorld(intrusion.frame, [0, 0, intrusion.halfThicknessMetres * 1.1]);
  const centerSample = field.evaluate(center);
  const outsideSample = field.evaluate(outside);
  analytic.push({ fixture: name, kind: intrusion.kind, halfThicknessMetres: round(intrusion.halfThicknessMetres), centerMaterial: centerSample.materialId, outsideMaterial: outsideSample.materialId });
  check(intrusion.kind === expectedKind, 'INTRUSION_KIND_ERROR', { name, expectedKind, actual: intrusion.kind });
  check(centerSample.chronology.intrusion?.kind === expectedKind, 'INTRUSION_CENTER_MISSING', { name });
  check(outsideSample.chronology.intrusion === null, 'INTRUSION_THICKNESS_UNBOUNDED', { name });
}
{
  const { field, program } = compiledFixtures.terminatedDyke;
  const center = frameToWorld(program.intrusions[0].frame, [0, 0, 0]);
  const below = [...center]; below[1] -= 5;
  const above = [...center]; above[1] += 5;
  const belowSample = field.evaluate(below);
  const aboveSample = field.evaluate(above);
  analytic.push({ fixture: 'terminated-dyke', belowTermination: belowSample.chronology.intrusionSamples[0], aboveTermination: aboveSample.chronology.intrusionSamples[0] });
  check(belowSample.chronology.intrusion?.kind === 'dyke', 'TERMINATED_DYKE_BELOW_MISSING');
  check(aboveSample.chronology.intrusion === null && aboveSample.chronology.intrusionSamples[0].terminated, 'TERMINATED_DYKE_CROSSES_CONTACT');
}
{
  const { field, program } = compiledFixtures.faultedDyke;
  const fault = program.faults[0];
  const displacedPoint = add3(fault.slipVectorMetres, scale3(fault.frame.normal, 0.001));
  const sample = field.evaluate(displacedPoint);
  const restoredBy = sample.chronology.intrusionSamples[0].restoredFaultEventIds;
  analytic.push({ fixture: 'faulted-dyke', faultEventId: fault.eventId, intrusionRestoredBy: restoredBy, sampleInsideDyke: sample.chronology.intrusion?.kind === 'dyke' });
  check(restoredBy.includes(fault.eventId), 'FAULT_DID_NOT_RESTORE_OLDER_INTRUSION', { restoredBy });
}
{
  const { field, program } = compiledFixtures.faultedUnconformity;
  const fault = program.faults[0];
  const hangingWall = frameToWorld(fault.frame, [0, 0, 1]);
  const restoredBy = field.evaluate(hangingWall).chronology.unconformityRestoredFaultEventIds;
  analytic.push({ fixture: 'faulted-unconformity', faultEventId: fault.eventId, erosionSurfaceRestoredBy: restoredBy });
  check(restoredBy.includes(fault.eventId), 'FAULT_DID_NOT_RESTORE_EROSION_SURFACE', { restoredBy });
}

const seamPrograms = ['planarBedding', 'foldedBedding', 'faultedFabric', 'unconformity'];
let seamSamples = 0;
let seamMismatches = 0;
const firstSeamMismatches = [];
for (const name of seamPrograms) {
  const program = compiledFixtures[name].program;
  const leftField = createStructuralField(program);
  const rightField = createStructuralField(program);
  for (let row = 0; row <= 40; row += 1) {
    for (let column = 0; column <= 40; column += 1) {
      const leftOrigin = [0, -100, -100];
      const rightOrigin = [200, -100, -100];
      const leftWorld = [leftOrigin[0] + 200, leftOrigin[1] + row * 5, leftOrigin[2] + column * 5];
      const rightWorld = [rightOrigin[0], rightOrigin[1] + row * 5, rightOrigin[2] + column * 5];
      const left = leftField.evaluate(leftWorld);
      const right = rightField.evaluate(rightWorld);
      seamSamples += 1;
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        seamMismatches += 1;
        if (firstSeamMismatches.length < 10) firstSeamMismatches.push({ name, leftWorld, rightWorld });
      }
    }
  }
}
const seamProof = { chunkSizeMetres: 200, fixtures: seamPrograms, mismatchCount: seamMismatches, sampleSpacingMetres: 5, sharedBoundarySamples: seamSamples, firstMismatches: firstSeamMismatches };
check(seamMismatches === 0, 'CHUNK_SEAM_MISMATCH', seamProof);

let lodSharedSamples = 0;
let lodMismatches = 0;
for (const name of seamPrograms) {
  const coarse = createStructuralField(compiledFixtures[name].program);
  const fine = createStructuralField(compiledFixtures[name].program);
  for (let x = -100; x <= 100; x += 20) {
    for (let y = -100; y <= 100; y += 20) {
      for (let z = -100; z <= 100; z += 20) {
        lodSharedSamples += 1;
        if (JSON.stringify(coarse.evaluate([x, y, z])) !== JSON.stringify(fine.evaluate([x, y, z]))) lodMismatches += 1;
      }
    }
  }
}
check(lodMismatches === 0, 'LOD_SHARED_COORDINATE_MISMATCH', { lodMismatches, lodSharedSamples });

const periodicProgram = compiledFixtures.largestFormation.program;
const periodicField = compiledFixtures.largestFormation.field;
const residuals = [];
const sampleSpacingMetres = 5;
for (let x = -2500; x <= 2500; x += sampleSpacingMetres) {
  const point = frameToWorld(periodicProgram.frames.primaryFabric, [x, 0, 0]);
  residuals.push(periodicField.evaluate(point).stratigraphicCoordinateMetres);
}
const minimumLag = Math.ceil(periodicProgram.layers.contactNoiseScaleMetres * 1.25 / sampleSpacingMetres);
const maximumLag = Math.floor(residuals.length * 0.42);
const correlations = [];
for (let lag = minimumLag; lag <= maximumLag; lag += 5) correlations.push({ lag, value: correlation(residuals, lag) });
const strongest = correlations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
const thicknesses = periodicProgram.layers.units.map((unit) => round(unit.topMetres - unit.bottomMetres, 6));
let repeatedThicknessWindow = false;
for (let window = 4; window <= 8 && !repeatedThicknessWindow; window += 1) {
  const seen = new Set();
  for (let index = 0; index <= thicknesses.length - window; index += 1) {
    const key = thicknesses.slice(index, index + window).join(',');
    if (seen.has(key)) { repeatedThicknessWindow = true; break; }
    seen.add(key);
  }
}
let exactSpatialPeriod = null;
for (let lag = minimumLag; lag <= maximumLag && exactSpatialPeriod === null; lag += 1) {
  let exact = true;
  for (let index = 0; index < residuals.length - lag; index += 1) {
    if (Math.abs(residuals[index] - residuals[index + lag]) > 1e-10) { exact = false; break; }
  }
  if (exact) exactSpatialPeriod = lag * sampleSpacingMetres;
}
const periodicity = {
  contactNoiseScaleMetres: round(periodicProgram.layers.contactNoiseScaleMetres),
  exactSpatialPeriodMetres: exactSpatialPeriod,
  formationDimensionsMetres: fixtures.largestFormation.targetDimensionsMetres,
  layerCount: periodicProgram.layers.units.length,
  repeatedThicknessWindow,
  sampleCount: residuals.length,
  sampleSpacingMetres,
  strongestLongLagCorrelation: { lagMetres: strongest.lag * sampleSpacingMetres, value: round(strongest.value) },
};
check(exactSpatialPeriod === null, 'GLOBAL_EXACT_PERIOD_DETECTED', periodicity);
check(!repeatedThicknessWindow, 'LAYER_THICKNESS_SEQUENCE_REPEATS', periodicity);
check(Math.abs(strongest.value) < 0.72, 'GLOBAL_LONG_LAG_CORRELATION_EXCESSIVE', periodicity);

const compatibility = [];
const expectedCompatibilityCodes = {
  incompatibleCoolingLimestone: 'ROCK_RECIPE_INVALID',
  inconsistentOrientation: 'STRUCTURE_ORIENTATION_INCONSISTENT',
  missingFaultOffset: 'STRUCTURE_FAULT_OFFSET_RELATIONSHIP_REQUIRED',
  missingFoldEvent: 'STRUCTURE_FOLD_CHRONOLOGY_REQUIRED',
  missingUnconformityEvents: 'STRUCTURE_UNCONFORMITY_CHRONOLOGY_REQUIRED',
};
for (const [name, recipe] of Object.entries(invalidFixtures)) {
  const result = structuralProgramCompatibility(recipe, { catalog });
  compatibility.push({ name, compatible: result.compatible, error: result.error });
  check(!result.compatible && result.error.code === expectedCompatibilityCodes[name], 'INVALID_COMBINATION_ACCEPTED', { name, actual: result.error?.code, expected: expectedCompatibilityCodes[name] });
}

const familyResults = [];
for (const [index, lithology] of catalog.ontology.lithologies.entries()) {
  const recipe = createHeroRockRecipe(lithology.id, { catalog, seed: 5001 + index });
  const program = compileStructuralFieldProgram(recipe, { catalog });
  const field = createStructuralField(program);
  let samples = 0;
  let finiteSamples = 0;
  let lostPositivePermeability = 0;
  let rangeFailures = 0;
  const extents = program.bounds.halfExtentsMetres;
  for (const xFactor of [-0.65, 0, 0.65]) {
    for (const yFactor of [-0.65, 0, 0.65]) {
      for (const zFactor of [-0.65, 0, 0.65]) {
        const point = frameToWorld(program.frames.formation, [extents[0] * xFactor, extents[1] * yFactor, extents[2] * zFactor]);
        const sample = field.evaluate(point);
        samples += 1;
        if (Number.isFinite(sample.stratigraphicCoordinateMetres)
          && Object.values(sample.materialFields).every(Number.isFinite)) finiteSamples += 1;
        if (recipe.materialProperties.permeabilitySquareMetres > 0
          && !(sample.materialFields.permeabilitySquareMetres > 0)) lostPositivePermeability += 1;
        if (sample.materialFields.hardnessNormalized < 0 || sample.materialFields.hardnessNormalized > 1
          || sample.materialFields.porosityFraction < 0 || sample.materialFields.porosityFraction > 0.65
          || sample.materialFields.cementationNormalized < 0 || sample.materialFields.cementationNormalized > 1
          || sample.materialFields.weatheringSusceptibilityNormalized < 0 || sample.materialFields.weatheringSusceptibilityNormalized > 1) rangeFailures += 1;
      }
    }
  }
  const originA = field.evaluate([0, 0, 0]);
  const originB = createStructuralField(program).evaluate([0, 0, 0]);
  const deterministic = JSON.stringify(originA) === JSON.stringify(originB);
  const result = {
    deterministic,
    fabricKind: originA.fabricFields.kind,
    faults: program.faults.length,
    finiteSamples,
    folds: program.folds.length,
    intrusions: program.intrusions.length,
    lithology: lithology.id,
    lithologyClass: lithology.class,
    lostPositivePermeability,
    programContentId: program.programContentId,
    rangeFailures,
    samples,
  };
  familyResults.push(result);
  check(finiteSamples === samples, 'FAMILY_NONFINITE_FIELD', result);
  check(lostPositivePermeability === 0, 'FAMILY_PERMEABILITY_LOST', result);
  check(rangeFailures === 0, 'FAMILY_PROPERTY_RANGE', result);
  check(deterministic, 'FAMILY_NONDETERMINISTIC_FIELD', result);
}

const classCounts = Object.fromEntries(['igneous', 'sedimentary', 'metamorphic'].map((classId) => [
  classId,
  familyResults.filter((result) => result.lithologyClass === classId).length,
]));
check(familyResults.length === 65, 'CATALOG_COVERAGE_COUNT', { actual: familyResults.length, expected: 65 });
check(classCounts.igneous === 22 && classCounts.sedimentary === 26 && classCounts.metamorphic === 17, 'CATALOG_CLASS_COVERAGE', classCounts);

const deterministicPrograms = Object.fromEntries(Object.entries(compiledFixtures).map(([name, value]) => [name, {
  first: value.program.programContentId,
  second: compileStructuralFieldProgram(value.recipe, { catalog }).programContentId,
}]));
for (const [name, hashes] of Object.entries(deterministicPrograms)) check(hashes.first === hashes.second, 'PROGRAM_NONDETERMINISTIC', { name, hashes });

const automated = {
  passed: failures.length === 0,
  status: failures.length === 0 ? 'candidate-awaiting-developer-approval' : 'failed',
  counts: {
    analyticFixtures: analytic.length,
    catalogFamilies: familyResults.length,
    checks,
    failures: failures.length,
    invalidFixtures: compatibility.length,
    lodSharedSamples,
    seamSamples,
  },
  classCounts,
  gates: {
    analyticOrientationsOffsetsTerminations: !failures.some((failure) => /PLANAR|FOLD|FAULT|UNCONFORMITY|INTRUSION|TERMINATED/.test(failure.code)),
    catalogCoverage: familyResults.length === 65 && familyResults.every((result) => (
      result.finiteSamples === result.samples
      && result.rangeFailures === 0
      && result.lostPositivePermeability === 0
    )),
    chronologyControlsCrossCutting: !failures.some((failure) => /RESTORE|TERMINATED|UNCONFORMITY/.test(failure.code)),
    deterministic: familyResults.every((result) => result.deterministic),
    noVisibleGlobalPeriodicity: exactSpatialPeriod === null && !repeatedThicknessWindow && Math.abs(strongest.value) < 0.72,
    sharedChunkAndLodCoordinates: seamMismatches === 0 && lodMismatches === 0,
    unsupportedCombinationsFail: compatibility.every((entry) => !entry.compatible),
  },
  evidenceHash: sha256({ analytic, compatibility, familyResults, periodicity, seamProof }),
  failures,
};

await Promise.all([
  writeJson(options.outputDir, 'analytic-fixtures.json', analytic),
  writeJson(options.outputDir, 'automated-results.json', automated),
  writeJson(options.outputDir, 'catalog-family-results.json', familyResults),
  writeJson(options.outputDir, 'chunk-seam-proof.json', { ...seamProof, lodMismatches, lodSharedSamples }),
  writeJson(options.outputDir, 'compatibility-results.json', compatibility),
  writeJson(options.outputDir, 'determinism-results.json', deterministicPrograms),
  writeJson(options.outputDir, 'periodicity-results.json', periodicity),
]);

console.log(JSON.stringify(automated, null, 2));
if (!automated.passed) process.exitCode = 1;
