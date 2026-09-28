#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { compileStructuralFieldProgram } from '../src/rockgen/experimental/geology-v2/structure/program.node.js';
import { frameToWorld } from '../src/rockgen/experimental/geology-v2/structure/math.node.js';
import { compileFractureBlockStage } from '../src/rockgen/experimental/geology-v2/fractures/compiler.node.js';
import { extractImplicitBlocks } from '../src/rockgen/experimental/geology-v2/fractures/blockExtraction.node.js';
import { compileFractureNetworkProgram } from '../src/rockgen/experimental/geology-v2/fractures/network.node.js';
import { auditMeshTopology } from '../src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js';
import { createC6ProcessFixtures } from '../src/rockgen/experimental/geology-v2/process/fixtures.node.js';
import { createProcessField } from '../src/rockgen/experimental/geology-v2/process/field.node.js';
import { meshProcessStage } from '../src/rockgen/experimental/geology-v2/process/meshing.node.js';
import { compileProcessStage, createStableProcessField } from '../src/rockgen/experimental/geology-v2/process/stability.node.js';

function parseArguments(argv) {
  const options = {
    familySeedCount: 16,
    meshResolution: 36,
    outputDir: path.resolve('artifacts/research/rock-geology-v2/checkpoint-06-processes'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-dir') options.outputDir = path.resolve(argv[++index] ?? '');
    else if (argument === '--family-seed-count') options.familySeedCount = Number(argv[++index]);
    else if (argument === '--mesh-resolution') options.meshResolution = Number(argv[++index]);
    else throw new RangeError(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.familySeedCount) || options.familySeedCount < 4 || options.familySeedCount > 64) {
    throw new RangeError('--family-seed-count must be an integer from 4 through 64.');
  }
  if (!Number.isInteger(options.meshResolution) || options.meshResolution < 24 || options.meshResolution > 96) {
    throw new RangeError('--mesh-resolution must be an integer from 24 through 96.');
  }
  return options;
}

function round(value, digits = 9) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function writeJson(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}

function latticePoints(structuralProgram, divisions = 9) {
  const points = [];
  const extents = structuralProgram.bounds.halfExtentsMetres;
  for (let z = 0; z < divisions; z += 1) for (let y = 0; y < divisions; y += 1) for (let x = 0; x < divisions; x += 1) {
    const normalized = [x, y, z].map((value) => -0.92 + value / (divisions - 1) * 1.84);
    points.push(frameToWorld(structuralProgram.frames.formation, normalized.map((value, axis) => value * extents[axis])));
  }
  return points;
}

function compactSignature(values) {
  return sha256(values.map((value) => round(value, 10)));
}

function gridCoordinates(index, dimensions) {
  const x = index % dimensions[0];
  const yz = (index - x) / dimensions[0];
  const y = yz % dimensions[1];
  const z = (yz - y) / dimensions[1];
  return [x, y, z];
}

function blockCellWorldPoint(index, blockModel, structuralProgram) {
  const coordinates = gridCoordinates(index, blockModel.grid.dimensions);
  const local = coordinates.map((coordinate, axis) => (
    -blockModel.grid.halfExtentsMetres[axis]
      + (coordinate + 0.5) * blockModel.grid.cellSizeMetres[axis]
  ));
  return frameToWorld(structuralProgram.frames.formation, local);
}

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDir, { recursive: true });
await mkdir(path.join(options.outputDir, 'programs'), { recursive: true });

const catalog = loadGeologyCatalog();
const fixtures = createC6ProcessFixtures({ catalog });
const failures = [];
let checks = 0;

function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
  return condition;
}

const compiledFixtures = {};
const stabilityTransferResults = [];
for (const [name, recipe] of Object.entries(fixtures)) {
  const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
  const fractureStage = compileFractureBlockStage(recipe, structuralProgram, { catalog });
  const processStage = compileProcessStage(recipe, structuralProgram, fractureStage, { catalog });
  compiledFixtures[name] = { fractureStage, processStage, recipe, structuralProgram };
  await writeJson(path.join(options.outputDir, 'programs'), `${name}-process-stage.json`, processStage);
  check(processStage.massAccounting.residualCells === 0 && processStage.massAccounting.residualMetres3 === 0,
    'FIXTURE_SOURCE_MASS_DID_NOT_CLOSE', { name, massAccounting: processStage.massAccounting });
  const stableField = createStableProcessField(processStage, structuralProgram, fractureStage);
  let detachedCellCount = 0;
  let retainedCellCount = 0;
  let retainedCellsChanged = 0;
  let transferredDetachedCells = 0;
  processStage.cellState.forEach((state, cell) => {
    if (state !== 1 && state !== 2) return;
    const point = blockCellWorldPoint(cell, fractureStage.blockModel, structuralProgram);
    const raw = stableField.raw.evaluate(...point);
    const stable = stableField.evaluate(...point);
    if (state === 2) {
      detachedCellCount += 1;
      if (raw <= 0 && stable > 0) transferredDetachedCells += 1;
    } else {
      retainedCellCount += 1;
      if (stable > 0 || Math.abs(stable - raw) > 1e-10) retainedCellsChanged += 1;
    }
  });
  const stabilityTransfer = {
    detachedCellCount,
    name,
    passed: processStage.stabilityResult.unsupportedFloatingComponentsAfterStage === 0
      && detachedCellCount === processStage.massAccounting.detachedCells
      && transferredDetachedCells === detachedCellCount
      && retainedCellsChanged === 0,
    retainedCellCount,
    retainedCellsChanged,
    transferredDetachedCells,
    unsupportedFloatingComponentsAfterStage: processStage.stabilityResult.unsupportedFloatingComponentsAfterStage,
  };
  stabilityTransferResults.push(stabilityTransfer);
  check(stabilityTransfer.passed, 'FIXTURE_UNSUPPORTED_FLOAT_REMAINED', stabilityTransfer);
  check(Math.abs(processStage.transport.massResidualMetres3) <= Math.max(1e-10, processStage.transport.inputDetachedVolumeMetres3 * 1e-12),
    'FIXTURE_TRANSPORT_MASS_DID_NOT_CLOSE', { name, transport: processStage.transport });
  check(processStage.transport.stableAssembly.passed && processStage.transport.stableAssembly.unsupportedPieceCount === 0,
    'FIXTURE_DEPOSIT_ASSEMBLY_UNSTABLE', { name, stableAssembly: processStage.transport.stableAssembly });
}

const expectedKernels = ['aeolian', 'exfoliation', 'fluvial', 'freeze-thaw', 'glacial', 'karst', 'marine', 'spheroidal', 'tafoni', 'thermal-salt'];
const actualKernels = [...new Set(Object.values(compiledFixtures).flatMap((fixture) => (
  fixture.processStage.processProgram.kernels.map((kernel) => kernel.kernelId)
)))].sort();
check(JSON.stringify(actualKernels) === JSON.stringify(expectedKernels), 'KERNEL_LIBRARY_COVERAGE_INCOMPLETE', { actualKernels, expectedKernels });

const causalFixtureNames = ['aeolian', 'exfoliation', 'fluvial', 'freezeThaw', 'glacial', 'karst', 'marine', 'spheroidal', 'tafoni', 'thermalSalt'];
const timeFractions = [0, 0.25, 0.5, 0.75, 1];
const causalResults = [];
for (const name of causalFixtureNames) {
  const fixture = compiledFixtures[name];
  const points = latticePoints(fixture.structuralProgram, 11);
  const fields = timeFractions.map((timeFraction) => createProcessField(
    fixture.processStage.processProgram,
    fixture.structuralProgram,
    fixture.fractureStage,
    { timeFraction },
  ));
  const valueSets = fields.map((field) => points.map((point) => field.evaluate(...point)));
  let monotonicViolations = 0;
  let changedSamples = 0;
  for (let point = 0; point < points.length; point += 1) {
    if (Math.abs(valueSets.at(-1)[point] - valueSets[0][point]) > 1e-8) changedSamples += 1;
    for (let time = 1; time < valueSets.length; time += 1) {
      if (valueSets[time][point] + 1e-10 < valueSets[time - 1][point]) monotonicViolations += 1;
    }
  }
  const retainedSamples = valueSets.map((values) => values.filter((value) => value <= 0).length);
  const environment = fields.at(-1).sample(points[Math.floor(points.length / 2)]).environment;
  const result = {
    changedSamples,
    environmentFieldsFinite: Object.values(environment).every(Number.isFinite),
    monotonicViolations,
    name,
    retainedSamples,
    signatures: valueSets.map(compactSignature),
    timeFractions,
  };
  causalResults.push(result);
  check(changedSamples > 0, 'KERNEL_CAUSAL_FIXTURE_DID_NOT_CHANGE', result);
  check(monotonicViolations === 0, 'KERNEL_TIME_SEQUENCE_NOT_MONOTONIC', result);
  check(retainedSamples.every((value, index) => index === 0 || value <= retainedSamples[index - 1]), 'KERNEL_RETAINED_VOLUME_INCREASED', result);
  check(result.environmentFieldsFinite, 'ENVIRONMENT_FIELD_NONFINITE', result);
}

const combinedA = compiledFixtures.combinedA;
const combinedB = compiledFixtures.combinedB;
const orderPoints = latticePoints(combinedA.structuralProgram, 9);
const combinedAField = createProcessField(combinedA.processStage.processProgram, combinedA.structuralProgram, combinedA.fractureStage);
const combinedBField = createProcessField(combinedB.processStage.processProgram, combinedB.structuralProgram, combinedB.fractureStage);
const orderResults = {
  orderA: combinedA.recipe.processes,
  orderB: combinedB.recipe.processes,
  signatureA: compactSignature(orderPoints.map((point) => combinedAField.evaluate(...point))),
  signatureB: compactSignature(orderPoints.map((point) => combinedBField.evaluate(...point))),
};
orderResults.orderSensitive = orderResults.signatureA !== orderResults.signatureB;
check(orderResults.orderSensitive, 'COMBINED_KERNEL_ORDER_WAS_FLATTENED', orderResults);

const fabricFixture = compiledFixtures.marine;
const fabricField = createProcessField(fabricFixture.processStage.processProgram, fabricFixture.structuralProgram, fabricFixture.fractureStage);
const fabricSamples = latticePoints(fabricFixture.structuralProgram, 13).map((point) => fabricField.sample(point))
  .filter((sample) => sample.base.insideFormation)
  .sort((left, right) => left.environment.fabricWeakness - right.environment.fabricWeakness);
const quartile = Math.max(1, Math.floor(fabricSamples.length / 4));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
const fabricResults = {
  highContactMeanDifferentialMetres: mean(fabricSamples.slice(-quartile).map((sample) => sample.differentialErosionMetres)),
  lowContactMeanDifferentialMetres: mean(fabricSamples.slice(0, quartile).map((sample) => sample.differentialErosionMetres)),
  samples: fabricSamples.length,
};
fabricResults.followsFabric = fabricResults.highContactMeanDifferentialMetres >= fabricResults.lowContactMeanDifferentialMetres;
check(fabricResults.followsFabric, 'DIFFERENTIAL_EROSION_IGNORED_FABRIC', fabricResults);

function adjustedRecipe(source, id, properties) {
  const recipe = structuredClone(source);
  recipe.id = id;
  Object.assign(recipe.materialProperties, properties);
  return recipe;
}

const controlBase = fixtures.spheroidal;
const materialControls = [];
for (const [label, properties] of [
  ['resistant', { cementationNormalized: 0.95, hardnessNormalized: 0.94, porosityFraction: 0.015, permeabilitySquareMetres: 1e-16 }],
  ['weak', { cementationNormalized: 0.32, hardnessNormalized: 0.26, porosityFraction: 0.24, permeabilitySquareMetres: 1e-11 }],
]) {
  const recipe = adjustedRecipe(controlBase, `c6-material-${label}`, properties);
  const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
  const fractureStage = compileFractureBlockStage(recipe, structuralProgram, { catalog });
  const stage = compileProcessStage(recipe, structuralProgram, fractureStage, { catalog });
  const field = createProcessField(stage.processProgram, structuralProgram, fractureStage);
  const samples = latticePoints(structuralProgram, 9).map((point) => field.sample(point)).filter((sample) => sample.base.insideFormation);
  materialControls.push({
    label,
    meanDifferentialMetres: mean(samples.map((sample) => sample.differentialErosionMetres)),
    meanTotalRemovalMetres: mean(samples.map((sample) => sample.signedDistanceMetres - sample.base.envelopeDistanceMetres)),
  });
}
const materialResults = {
  controls: materialControls,
  weakErodesFaster: materialControls[1].meanDifferentialMetres > materialControls[0].meanDifferentialMetres
    && materialControls[1].meanTotalRemovalMetres > materialControls[0].meanTotalRemovalMetres,
};
check(materialResults.weakErodesFaster, 'MATERIAL_PROPERTIES_DID_NOT_CONTROL_EROSION', materialResults);

const transportResults = ['transport', 'talus'].map((name) => {
  const stage = compiledFixtures[name].processStage;
  const sortingRanks = [...new Set(stage.transport.pieces.map((piece) => piece.deposition.sortedSizeRank))];
  const imbricationAngles = [...new Set(stage.transport.pieces.map((piece) => piece.deposition.imbricationDegrees))];
  const expectedMinimumPieceCount = name === 'talus' ? 4 : 1;
  return {
    allPiecesRoundedOrEqual: stage.transport.pieces.every((piece) => (
      piece.shape.afterRoundnessNormalized >= piece.shape.beforeRoundnessNormalized
    )),
    allPiecesRetainLineage: stage.transport.pieces.every((piece) => (
      piece.lineage.sourceLithology === compiledFixtures[name].recipe.lithology
      && piece.lineage.sourceFabricKind
      && piece.lineage.sourceFormationId
    )),
    massResidualMetres3: stage.transport.massResidualMetres3,
    name,
    pieceCount: stage.transport.pieces.length,
    expectedMinimumPieceCount,
    sortingRankCount: sortingRanks.length,
    sortingRanks,
    imbricationAngleCount: imbricationAngles.length,
    imbricationAngles,
    sortingAndImbricationExpressed: name !== 'talus'
      || (sortingRanks.length >= 4 && imbricationAngles.length >= 2),
    stable: stage.transport.stableAssembly.passed,
  };
});
for (const result of transportResults) {
  check(result.pieceCount >= result.expectedMinimumPieceCount
      && result.sortingAndImbricationExpressed
      && result.allPiecesRoundedOrEqual
      && result.allPiecesRetainLineage
      && result.stable,
    'TRANSPORT_LINEAGE_OR_SHAPE_GATE_FAILED', result);
}

const determinismResults = [];
for (const name of [...causalFixtureNames, 'talus', 'transport']) {
  const first = compiledFixtures[name];
  const second = compileProcessStage(first.recipe, first.structuralProgram, first.fractureStage, { catalog });
  const result = { first: first.processStage.outputContentId, name, second: second.outputContentId };
  result.stable = result.first === result.second;
  determinismResults.push(result);
  check(result.stable, 'PROCESS_STAGE_NONDETERMINISTIC', result);
}

const meshResults = [];
for (const name of causalFixtureNames) {
  const fixture = compiledFixtures[name];
  const generated = meshProcessStage(fixture.processStage, fixture.structuralProgram, fixture.fractureStage, {
    applyStability: false,
    resolution: options.meshResolution,
    timeFraction: 1,
  });
  const audit = auditMeshTopology(generated.mesh, { evaluate: generated.field.evaluate, grid: generated.grid, includeSelfIntersections: true });
  const result = {
    boundaryEdges: audit.boundaryEdges,
    components: audit.components,
    degenerateTriangles: audit.degenerateTriangles,
    name,
    nonManifoldEdges: audit.nonManifoldEdges,
    nonManifoldVertices: audit.nonManifoldVertices,
    selfIntersectionPairs: audit.selfIntersectionPairs,
    triangles: audit.triangles,
    vertices: audit.vertices,
    windingEdges: audit.windingEdges,
  };
  meshResults.push(result);
  check(result.vertices > 0 && result.triangles > 0, 'PROCESS_MESH_EMPTY', result);
  check(result.components === 1 && result.boundaryEdges === 0 && result.nonManifoldEdges === 0 && result.nonManifoldVertices === 0
    && result.degenerateTriangles === 0 && result.selfIntersectionPairs === 0
    && result.windingEdges === 0, 'PROCESS_MESH_TOPOLOGY_FAILED', result);
}

const familyResults = [];
for (const [familyIndex, lithology] of catalog.ontology.lithologies.entries()) {
  const seedResults = [];
  for (let seedIndex = 0; seedIndex < options.familySeedCount; seedIndex += 1) {
    const recipe = createHeroRockRecipe(lithology.id, {
      catalog,
      seed: 60_000 + familyIndex * options.familySeedCount + seedIndex,
    });
    const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
    const fractureNetwork = compileFractureNetworkProgram(recipe, structuralProgram, { catalog });
    const blockModel = extractImplicitBlocks(fractureNetwork, structuralProgram, { longestAxisCells: 10 });
    const diagnosticFractureStage = {
      blockModel,
      fractureNetwork,
      outputContentId: `diagnostic-c6-${recipe.id}-${recipe.seed}`,
      recipeContentId: fractureNetwork.recipeContentId,
      structureProgramContentId: structuralProgram.programContentId,
    };
    const stage = compileProcessStage(recipe, structuralProgram, diagnosticFractureStage, { catalog });
    const field0 = createProcessField(stage.processProgram, structuralProgram, diagnosticFractureStage, { timeFraction: 0 });
    const field1 = createProcessField(stage.processProgram, structuralProgram, diagnosticFractureStage, { timeFraction: 1 });
    const points = latticePoints(structuralProgram, 4);
    let monotonic = true;
    let finite = true;
    for (const point of points) {
      const before = field0.evaluate(...point);
      const after = field1.evaluate(...point);
      finite &&= Number.isFinite(before) && Number.isFinite(after);
      monotonic &&= after + 1e-10 >= before;
    }
    const passed = finite && monotonic && stage.massAccounting.residualCells === 0
      && stage.stabilityResult.unsupportedFloatingComponentsAfterStage === 0
      && Math.abs(stage.transport.massResidualMetres3) <= Math.max(1e-10, stage.transport.inputDetachedVolumeMetres3 * 1e-12);
    seedResults.push({
      blockCount: blockModel.blocks.length,
      detachedCells: stage.massAccounting.detachedCells,
      directErodedCells: stage.massAccounting.directErodedCells,
      finite,
      monotonic,
      passed,
      seed: recipe.seed,
      transportedPieces: stage.transport.pieces.length,
    });
    check(passed, 'FAMILY_SEED_PROCESS_GATE_FAILED', { lithology: lithology.id, result: seedResults.at(-1) });
  }
  // Match the fixed representative seed used by the visual capture. The 16
  // diagnostic seeds above remain an independent broader population.
  const representative = createHeroRockRecipe(lithology.id, { catalog, seed: 80_000 + familyIndex });
  const representativeStructure = compileStructuralFieldProgram(representative, { catalog });
  const representativeFractures = compileFractureBlockStage(representative, representativeStructure, { catalog });
  const representativeStage = compileProcessStage(representative, representativeStructure, representativeFractures, { catalog });
  const productionPassed = representativeStage.massAccounting.residualCells === 0
    && representativeStage.stabilityResult.unsupportedFloatingComponentsAfterStage === 0;
  check(productionPassed, 'FAMILY_PRODUCTION_GRID_PROCESS_GATE_FAILED', { lithology: lithology.id });
  familyResults.push({
    class: lithology.class,
    lithology: lithology.id,
    passed: productionPassed && seedResults.every((result) => result.passed),
    productionBlockCount: representativeFractures.blockModel.blocks.length,
    productionDetachedCells: representativeStage.massAccounting.detachedCells,
    productionErodedCells: representativeStage.massAccounting.directErodedCells,
    seedCount: seedResults.length,
    seedResults,
  });
}
check(familyResults.length === 65, 'CATALOG_PROCESS_FAMILY_COUNT_FAILED', { actual: familyResults.length, expected: 65 });

const automated = {
  passed: failures.length === 0,
  status: failures.length === 0 ? 'candidate-awaiting-developer-approval' : 'failed',
  counts: {
    catalogFamilies: familyResults.length,
    catalogSeedPrograms: familyResults.reduce((sum, family) => sum + family.seedResults.length, 0),
    causalFixtures: causalResults.length,
    checks,
    failures: failures.length,
    kernelImplementations: actualKernels.length,
    meshedFixtures: meshResults.length,
    transportFixtures: transportResults.length,
  },
  gates: {
    allFamiliesAndSeeds: familyResults.length === 65 && familyResults.every((family) => family.passed),
    combinedOrderSensitive: orderResults.orderSensitive,
    deterministic: determinismResults.every((result) => result.stable),
    environmentAndTimeFields: causalResults.every((result) => result.environmentFieldsFinite && result.monotonicViolations === 0),
    fabricAndMaterialControlled: fabricResults.followsFabric && materialResults.weakErodesFaster,
    kernelCausalFixtures: causalResults.every((result) => result.changedSamples > 0),
    massAndDetachmentClose: Object.values(compiledFixtures).every((fixture) => (
      fixture.processStage.massAccounting.residualCells === 0
      && Math.abs(fixture.processStage.transport.massResidualMetres3) <= Math.max(1e-10, fixture.processStage.transport.inputDetachedVolumeMetres3 * 1e-12)
    )),
    selectedMesherTopology: meshResults.every((result) => result.vertices > 0 && result.components === 1 && result.boundaryEdges === 0
      && result.nonManifoldEdges === 0 && result.nonManifoldVertices === 0 && result.degenerateTriangles === 0
      && result.selfIntersectionPairs === 0 && result.windingEdges === 0),
    transportLineageAndStableDeposition: transportResults.every((result) => (
      result.pieceCount >= result.expectedMinimumPieceCount
      && result.sortingAndImbricationExpressed
      && result.allPiecesRoundedOrEqual
      && result.allPiecesRetainLineage
      && result.stable
    )),
    zeroFloatingAfterStability: stabilityTransferResults.every((result) => result.passed),
  },
  evidenceHash: sha256({ causalResults, determinismResults, fabricResults, familyResults, materialResults, meshResults, orderResults, stabilityTransferResults, transportResults }),
  failures,
};

await Promise.all([
  writeJson(options.outputDir, 'automated-results.json', automated),
  writeJson(options.outputDir, 'causal-kernel-results.json', causalResults),
  writeJson(options.outputDir, 'combined-order-results.json', orderResults),
  writeJson(options.outputDir, 'determinism-results.json', determinismResults),
  writeJson(options.outputDir, 'fabric-material-results.json', { fabricResults, materialResults }),
  writeJson(options.outputDir, 'family-process-results.json', familyResults),
  writeJson(options.outputDir, 'mesh-results.json', meshResults),
  writeJson(options.outputDir, 'stability-transfer-results.json', stabilityTransferResults),
  writeJson(options.outputDir, 'transport-lineage-results.json', transportResults),
]);

console.log(JSON.stringify(automated, null, 2));
if (!automated.passed) process.exitCode = 1;
