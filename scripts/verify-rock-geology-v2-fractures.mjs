#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { createHeroRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { createStructuralField, restoreStructuralPoint } from '../src/rockgen/experimental/geology-v2/structure/field.node.js';
import {
  add3,
  createOrientationFrame,
  dot3,
  frameToWorld,
  length3,
  scale3,
} from '../src/rockgen/experimental/geology-v2/structure/math.node.js';
import { compileStructuralFieldProgram } from '../src/rockgen/experimental/geology-v2/structure/program.node.js';
import { extractImplicitBlocks, queryBlockAtPoint } from '../src/rockgen/experimental/geology-v2/fractures/blockExtraction.node.js';
import { compileFractureBlockStage } from '../src/rockgen/experimental/geology-v2/fractures/compiler.node.js';
import { sampleTruncatedSize } from '../src/rockgen/experimental/geology-v2/fractures/distributions.node.js';
import { createC5FractureFixtures } from '../src/rockgen/experimental/geology-v2/fractures/fixtures.node.js';
import {
  compileFractureNetworkProgram,
  fractureIntersectsSegment,
} from '../src/rockgen/experimental/geology-v2/fractures/network.node.js';
import { querySpatialIndex } from '../src/rockgen/experimental/geology-v2/fractures/spatialIndex.node.js';

function parseArguments(argv) {
  const options = {
    outputDir: path.resolve('artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks'),
    seedCount: 32,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-dir') options.outputDir = path.resolve(argv[++index] ?? '');
    else if (argument === '--seed-count') options.seedCount = Number(argv[++index]);
    else if (argument === '--help') {
      console.log('Usage: node scripts/verify-rock-geology-v2-fractures.mjs [--output-dir DIR] [--seed-count N]');
      process.exit(0);
    } else throw new RangeError(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.seedCount) || options.seedCount < 4 || options.seedCount > 128) {
    throw new RangeError('--seed-count must be an integer from 4 through 128.');
  }
  return options;
}

function round(value, digits = 9) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function moments(values) {
  if (values.length === 0) return { count: 0, maximum: null, mean: null, minimum: null, standardDeviation: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    count: values.length,
    maximum: round(Math.max(...values)),
    mean: round(mean),
    minimum: round(Math.min(...values)),
    standardDeviation: round(Math.sqrt(variance)),
  };
}

const orientationModelCache = new Map();

function vmfCdf(value, concentration) {
  if (concentration < 1e-7) return (value + 1) * 0.5;
  const lower = Math.exp(-2 * concentration);
  return (Math.exp(concentration * (value - 1)) - lower) / (1 - lower);
}

function orientationModel(concentration) {
  if (orientationModelCache.has(concentration)) return orientationModelCache.get(concentration);
  const samples = [];
  const count = 16_384;
  for (let index = 0; index < count; index += 1) {
    const u = (index + 0.5) / count;
    const polarCosine = concentration < 1e-7
      ? 2 * u - 1
      : 1 + Math.log(u + (1 - u) * Math.exp(-2 * concentration)) / concentration;
    samples.push(Math.acos(Math.min(1, Math.abs(polarCosine))) * 180 / Math.PI);
  }
  const statistics = moments(samples);
  let lower = 0;
  let upper = 90;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (lower + upper) * 0.5;
    const cosine = Math.cos(middle * Math.PI / 180);
    const tailProbability = vmfCdf(cosine, concentration) - vmfCdf(-cosine, concentration);
    if (tailProbability > 1e-7) lower = middle;
    else upper = middle;
  }
  const result = { ...statistics, axialTailLimitDegrees: round((lower + upper) * 0.5) };
  orientationModelCache.set(concentration, result);
  return result;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function overlaps(left, right) {
  return left.minimum.every((value, axis) => value <= right.maximum[axis]
    && left.maximum[axis] >= right.minimum[axis]);
}

function gridCoordinates(index, dimensions) {
  const x = index % dimensions[0];
  const yz = (index - x) / dimensions[0];
  const y = yz % dimensions[1];
  const z = (yz - y) / dimensions[1];
  return [x, y, z];
}

function cellWorldPoint(index, blockModel, structuralProgram) {
  const coordinates = gridCoordinates(index, blockModel.grid.dimensions);
  const local = coordinates.map((coordinate, axis) => (
    -blockModel.grid.halfExtentsMetres[axis] + (coordinate + 0.5) * blockModel.grid.cellSizeMetres[axis]
  ));
  return frameToWorld(structuralProgram.frames.formation, local);
}

function firstCell(block) {
  return block.cellRuns[0][0];
}

function groupCounts(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function inferBasisClass(stage) {
  const sets = stage.fractureNetwork.sets;
  if (sets.length === 1) return 'tabular';
  if (sets.length >= 4) return 'polyhedral';
  const normals = sets.map((set) => {
    const member = stage.fractureNetwork.fractures.find((fracture) => fracture.setId === set.id);
    return member.frame.normal;
  });
  const products = [];
  for (let left = 0; left < normals.length; left += 1) for (let right = left + 1; right < normals.length; right += 1) {
    products.push(Math.abs(dot3(normals[left], normals[right])));
  }
  return Math.max(...products) < 0.28 ? 'equidimensional' : 'rhombohedral';
}

async function writeJson(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDir, { recursive: true });
await mkdir(path.join(options.outputDir, 'programs'), { recursive: true });

const catalog = loadGeologyCatalog();
const fixtures = createC5FractureFixtures({ catalog });
const failures = [];
let checks = 0;

function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
  return condition;
}

// Independent sampler proof: all three declared size laws remain truncated and
// their empirical means agree with the requested bounded mean.
const distributionResults = [];
for (const type of ['uniform', 'lognormal', 'power-law']) {
  const distribution = {
    maximumMetres: 12,
    meanMetres: 7,
    minimumMetres: 2,
    standardDeviationNormalized: 0.45,
    type,
  };
  const samples = Array.from({ length: 16_384 }, (_, index) => sampleTruncatedSize(0x5c21a11, index, distribution));
  const statistics = moments(samples);
  const relativeMeanError = Math.abs(statistics.mean - distribution.meanMetres) / distribution.meanMetres;
  const result = {
    bounded: statistics.minimum >= distribution.minimumMetres && statistics.maximum <= distribution.maximumMetres,
    distribution,
    relativeMeanError: round(relativeMeanError),
    statistics,
  };
  distributionResults.push(result);
  check(result.bounded, 'SIZE_DISTRIBUTION_ESCAPED_TRUNCATION', result);
  check(relativeMeanError <= 0.035, 'SIZE_DISTRIBUTION_MEAN_OUTSIDE_CONFIDENCE_BAND', result);
}

// Eight focused chronology/geometry fixtures, with the four block bases run at
// the production compiler resolution fixed by Checkpoint 5.
const compiledFixtures = {};
for (const [name, recipe] of Object.entries(fixtures)) {
  const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
  const fractureNetwork = compileFractureNetworkProgram(recipe, structuralProgram, { catalog });
  compiledFixtures[name] = { fractureNetwork, recipe, structuralProgram };
  await writeJson(path.join(options.outputDir, 'programs'), `${name}-fractures.json`, fractureNetwork);
  check(fractureNetwork.recipeContentId === structuralProgram.recipeContentId, 'FIXTURE_STRUCTURE_DEPENDENCY_MISMATCH', { name });
  check(fractureNetwork.fractures.every((fracture) => (
    fracture.sizeMetres > 0
    && fracture.persistenceMetres > 0
    && fracture.bounds.minimum.every(Number.isFinite)
    && fracture.bounds.maximum.every(Number.isFinite)
  )), 'FIXTURE_NONFINITE_FRACTURE', { name });
  const fixtureField = createStructuralField(structuralProgram);
  check(fractureNetwork.intersections.every((intersection) => (
    intersection.lengthMetres > 0
    && fixtureField.evaluate(intersection.startMetres).insideFormation
    && fixtureField.evaluate(intersection.endMetres).insideFormation
  )), 'FIXTURE_INTERSECTION_ESCAPES_PARENT', { name });
}

let capacityGuard = null;
{
  const recipe = structuredClone(fixtures.equidimensional);
  recipe.fractureHistory.sets[0].spacingMetres = 0.01;
  const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
  try {
    compileFractureNetworkProgram(recipe, structuralProgram, { catalog });
    capacityGuard = { rejected: false, errorCode: null };
  } catch (error) {
    capacityGuard = { rejected: true, errorCode: error.code ?? error.name };
  }
  check(capacityGuard.rejected && capacityGuard.errorCode === 'FRACTURE_SET_CAPACITY_EXCEEDED', 'FRACTURE_CAPACITY_SILENTLY_TRUNCATED', capacityGuard);
}

const expectedBasis = {
  equidimensional: 'equidimensional',
  polyhedral: 'polyhedral',
  rhombohedral: 'rhombohedral',
  tabular: 'tabular',
};
const basisResults = [];
for (const [name, expected] of Object.entries(expectedBasis)) {
  const fixture = compiledFixtures[name];
  const stage = compileFractureBlockStage(fixture.recipe, fixture.structuralProgram, { catalog });
  fixture.stage = stage;
  await writeJson(path.join(options.outputDir, 'programs'), `${name}-block-stage.json`, stage);
  const blockModel = stage.blockModel;
  const blockIds = new Set(blockModel.blocks.map((block) => block.id));
  const graphReferencesValid = blockModel.adjacencyGraph.edges.every((edge) => (
    blockIds.has(edge.leftBlockId)
    && blockIds.has(edge.rightBlockId)
    && edge.leftBlockId !== edge.rightBlockId
    && edge.contactAreaMetres2 > 0
  ));
  const supportReferencesValid = blockModel.supportGraph.edges.every((edge) => {
    const lower = blockModel.blocks.find((block) => block.id === edge.supportingBlockId);
    const upper = blockModel.blocks.find((block) => block.id === edge.supportedBlockId);
    return lower && upper && lower.centroidMetres[1] <= upper.centroidMetres[1] + 1e-9 && edge.contactAreaMetres2 > 0;
  });
  const inherited = blockModel.blocks.every((block) => block.inheritedMaterialId && block.fabricKind);
  const volumeSum = blockModel.blocks.reduce((sum, block) => sum + block.volumeMetres3, 0);
  const inferred = inferBasisClass(stage);
  const result = {
    adjacencyEdges: blockModel.adjacencyGraph.edges.length,
    blockCount: blockModel.blocks.length,
    dominantClass: Object.entries(groupCounts(blockModel.blocks.map((block) => block.shapeClass))).sort((a, b) => b[1] - a[1])[0][0],
    expected,
    fractureCount: stage.fractureNetwork.fractures.length,
    graphReferencesValid,
    inferredWithoutFixtureIdentity: inferred,
    inheritedMaterialAndFabric: inherited,
    intersectionCount: stage.fractureNetwork.intersections.length,
    name,
    occupancyAudit: blockModel.occupancyAudit,
    shapeClassCounts: groupCounts(blockModel.blocks.map((block) => block.shapeClass)),
    supportEdges: blockModel.supportGraph.edges.length,
    supportReferencesValid,
    volumeResidualMetres3: round(volumeSum - blockModel.grid.sampledParentVolumeMetres3),
  };
  basisResults.push(result);
  check(blockModel.blocks.length > 1, 'BASIS_DID_NOT_PARTITION', result);
  check(blockModel.occupancyAudit.gapCells === 0 && blockModel.occupancyAudit.overlapCells === 0, 'BASIS_OCCUPANCY_RESIDUAL', result);
  check(Math.abs(result.volumeResidualMetres3) < 1e-6, 'BASIS_VOLUME_RESIDUAL', result);
  check(graphReferencesValid && supportReferencesValid, 'BASIS_GRAPH_INVALID', result);
  check(inherited, 'BASIS_INHERITANCE_MISSING', result);
  check(inferred === expected, 'BLIND_BASIS_SORT_FAILED', result);
}

// Finite-joint test: a center-normal segment intersects, while an otherwise
// identical segment beyond the ellipse tip does not.
const finiteFixture = compiledFixtures.equidimensional;
const finiteFracture = finiteFixture.fractureNetwork.fractures[0];
const insideStart = add3(finiteFracture.centerMetres, scale3(finiteFracture.frame.normal, -2));
const insideEnd = add3(finiteFracture.centerMetres, scale3(finiteFracture.frame.normal, 2));
const beyondTip = add3(finiteFracture.centerMetres, scale3(finiteFracture.frame.strike, finiteFracture.halfLengthMetres * 1.12));
const outsideStart = add3(beyondTip, scale3(finiteFracture.frame.normal, -2));
const outsideEnd = add3(beyondTip, scale3(finiteFracture.frame.normal, 2));
const finiteJointProof = {
  centerHit: fractureIntersectsSegment(finiteFixture.fractureNetwork, finiteFixture.structuralProgram, finiteFracture, insideStart, insideEnd),
  outsideTipHit: fractureIntersectsSegment(finiteFixture.fractureNetwork, finiteFixture.structuralProgram, finiteFracture, outsideStart, outsideEnd),
  testedFractureId: finiteFracture.id,
};
check(finiteJointProof.centerHit !== null && finiteJointProof.outsideTipHit === null, 'FINITE_JOINT_TIP_FAILED', finiteJointProof);

// Search the authored old fracture panels on both sides of the unconformity.
// Crossings below must remain; crossings above must be rejected as eroded.
const terminationFixture = compiledFixtures.terminatedAtUnconformity;
const terminationField = createStructuralField(terminationFixture.structuralProgram);
let acceptedBelow = 0;
let rejectedAbove = 0;
let testedBelow = 0;
let testedAbove = 0;
for (const fracture of terminationFixture.fractureNetwork.fractures) {
  for (const across of [-0.75, -0.35, 0, 0.35, 0.75]) {
    for (const down of [-0.75, -0.35, 0, 0.35, 0.75]) {
      if (across * across + down * down >= 0.92) continue;
      const point = add3(fracture.centerMetres, add3(
        scale3(fracture.frame.strike, fracture.halfLengthMetres * across),
        scale3(fracture.frame.downDip, fracture.halfPersistenceMetres * down),
      ));
      const side = terminationField.evaluate(point).chronology.unconformitySignedDistanceMetres;
      const start = add3(point, scale3(fracture.frame.normal, -2));
      const end = add3(point, scale3(fracture.frame.normal, 2));
      const hit = fractureIntersectsSegment(
        terminationFixture.fractureNetwork,
        terminationFixture.structuralProgram,
        fracture,
        start,
        end,
        { structuralField: terminationField },
      );
      if (side <= -1) { testedBelow += 1; if (hit) acceptedBelow += 1; }
      if (side >= 1) { testedAbove += 1; if (!hit) rejectedAbove += 1; }
    }
  }
}
const terminationProof = { acceptedBelow, rejectedAbove, testedAbove, testedBelow };
check(testedBelow > 0 && acceptedBelow === testedBelow, 'JOINT_BELOW_UNCONFORMITY_MISSING', terminationProof);
check(testedAbove > 0 && rejectedAbove === testedAbove, 'JOINT_CROSSES_UNCONFORMITY', terminationProof);

const offsetFixture = compiledFixtures.faultOffsetJoints;
const offsetFault = offsetFixture.structuralProgram.faults[0];
const offsetFracture = offsetFixture.fractureNetwork.fractures[0];
const hangingPoint = frameToWorld(offsetFault.frame, [0, 0, 1]);
const restored = restoreStructuralPoint(
  offsetFixture.structuralProgram,
  hangingPoint,
  offsetFracture.eventId,
  offsetFracture.eventOrder,
);
const offsetProof = {
  actualRestorationMetres: round(length3(restored.appliedFaults[0]?.displacementMetres ?? [0, 0, 0])),
  expectedOffsetMetres: round(offsetFault.offsetMetres),
  faultEventId: offsetFault.eventId,
  fractureSetRecordsOffset: offsetFixture.fractureNetwork.sets.every((set) => set.interactions.offsetByFaultEventIds.includes(offsetFault.eventId)),
};
check(offsetProof.fractureSetRecordsOffset && Math.abs(offsetProof.actualRestorationMetres - offsetProof.expectedOffsetMetres) < 1e-9, 'FAULT_OFFSET_JOINT_RESTORATION_FAILED', offsetProof);

const hierarchyRelations = groupCounts(compiledFixtures.hierarchy.fractureNetwork.intersections.map((entry) => entry.kind));
const deflectionEvents = compiledFixtures.beddingDeflection.fractureNetwork.sets.flatMap((set) => set.interactions.deflectsAlongEventIds);
let hierarchyRetainedSamples = 0;
let hierarchyTerminatedSamples = 0;
for (const fracture of compiledFixtures.hierarchy.fractureNetwork.fractures.filter((entry) => entry.interactions.termination)) {
  for (const across of [-0.7, -0.4, 0, 0.4, 0.7]) for (const down of [-0.7, -0.4, 0, 0.4, 0.7]) {
    if (across * across + down * down > 0.8) continue;
    const point = add3(fracture.centerMetres, add3(
      scale3(fracture.frame.strike, fracture.halfLengthMetres * across),
      scale3(fracture.frame.downDip, fracture.halfPersistenceMetres * down),
    ));
    const start = add3(point, scale3(fracture.frame.normal, -1));
    const end = add3(point, scale3(fracture.frame.normal, 1));
    if (fractureIntersectsSegment(
      compiledFixtures.hierarchy.fractureNetwork,
      compiledFixtures.hierarchy.structuralProgram,
      fracture,
      start,
      end,
    )) hierarchyRetainedSamples += 1;
    else hierarchyTerminatedSamples += 1;
  }
}
const beddingField = createStructuralField(compiledFixtures.beddingDeflection.structuralProgram);
const beddingSet = compiledFixtures.beddingDeflection.fractureNetwork.sets[0];
const authoredBeddingFrame = createOrientationFrame({
  dipDegrees: beddingSet.meanDipDegrees,
  dipDirectionDegrees: (beddingSet.meanStrikeDegrees + 90) % 360,
  originMetres: [0, 0, 0],
  strikeDegrees: beddingSet.meanStrikeDegrees,
});
const axialAngle = (left, right) => Math.acos(Math.min(1, Math.abs(dot3(left, right)))) * 180 / Math.PI;
const beddingAngles = compiledFixtures.beddingDeflection.fractureNetwork.fractures.map((fracture) => {
  const fabricNormal = beddingField.orientationAt(fracture.centerMetres, 0.08);
  return {
    authoredToFabricDegrees: axialAngle(authoredBeddingFrame.normal, fabricNormal),
    deflectedToFabricDegrees: axialAngle(fracture.frame.normal, fabricNormal),
  };
});
const beddingDeflectionProof = {
  authoredMeanDegrees: round(beddingAngles.reduce((sum, entry) => sum + entry.authoredToFabricDegrees, 0) / beddingAngles.length),
  deflectedMeanDegrees: round(beddingAngles.reduce((sum, entry) => sum + entry.deflectedToFabricDegrees, 0) / beddingAngles.length),
  eventIds: [...new Set(deflectionEvents)].sort(),
  panelCount: beddingAngles.length,
};
const chronologyResults = {
  beddingDeflection: beddingDeflectionProof,
  faultOffset: offsetProof,
  finiteJoint: finiteJointProof,
  hierarchy: { intersectionRelations: hierarchyRelations, retainedInteriorSamples: hierarchyRetainedSamples, terminatedInteriorSamples: hierarchyTerminatedSamples },
  unconformityTermination: terminationProof,
};
check(deflectionEvents.length > 0, 'BEDDING_DEFLECTION_METADATA_MISSING', chronologyResults.beddingDeflection);
check(beddingDeflectionProof.deflectedMeanDegrees < beddingDeflectionProof.authoredMeanDegrees * 0.5, 'BEDDING_DEFLECTION_NOT_APPLIED', chronologyResults.beddingDeflection);
check((hierarchyRelations.terminates ?? 0) > 0, 'JOINT_HIERARCHY_TERMINATION_MISSING', chronologyResults.hierarchy);
check(hierarchyRetainedSamples > 0 && hierarchyTerminatedSamples > 0, 'JOINT_HIERARCHY_NOT_PHYSICALLY_CLIPPED', chronologyResults.hierarchy);

// BVH has no false negatives against brute AABB overlap; block lookup agrees
// with its authoritative active-cell assignment.
const spatialQueries = [];
let spatialFalseNegatives = 0;
let blockLookupMismatches = 0;
for (const name of Object.keys(expectedBasis)) {
  const fixture = compiledFixtures[name];
  const network = fixture.stage.fractureNetwork;
  const bounds = fixture.structuralProgram.bounds.halfExtentsMetres;
  for (let index = 0; index < 96; index += 1) {
    const factor = (axis, phase) => ((((index * (37 + axis * 18) + phase) % 197) / 196) * 2 - 1) * bounds[axis];
    const center = [factor(0, 11), factor(1, 53), factor(2, 97)];
    const radius = Math.max(...bounds) * (0.015 + (index % 7) * 0.009);
    const query = { maximum: center.map((value) => value + radius), minimum: center.map((value) => value - radius) };
    const indexed = new Set(querySpatialIndex(network.spatialIndex, query));
    const brute = network.fractures.filter((fracture) => overlaps(fracture.bounds, query)).map((fracture) => fracture.id);
    const missed = brute.filter((id) => !indexed.has(id));
    spatialFalseNegatives += missed.length;
    if (spatialQueries.length < 16) spatialQueries.push({ bruteCount: brute.length, indexedCount: indexed.size, missed, name, query });
  }
  for (const block of fixture.stage.blockModel.blocks.slice(0, 96)) {
    const point = cellWorldPoint(firstCell(block), fixture.stage.blockModel, fixture.structuralProgram);
    if (queryBlockAtPoint(fixture.stage.blockModel, fixture.structuralProgram, point)?.id !== block.id) blockLookupMismatches += 1;
  }
}
const spatialResults = { blockLookupMismatches, fractureBvhFalseNegatives: spatialFalseNegatives, queryCount: 96 * 4, sampleQueries: spatialQueries };
check(spatialFalseNegatives === 0, 'FRACTURE_SPATIAL_INDEX_FALSE_NEGATIVE', spatialResults);
check(blockLookupMismatches === 0, 'BLOCK_SPATIAL_LOOKUP_MISMATCH', spatialResults);

// All ontology families, 32 independent seed sets each. Every individual seed
// must remain in support; each family aggregate must meet the declared bands.
const familyResults = [];
for (const [familyIndex, lithology] of catalog.ontology.lithologies.entries()) {
  const seedResults = [];
  const pooled = { aperture: [], orientation: [], orientationModelMean: [], persistence: [], roughness: [], size: [], spacing: [] };
  let representative = null;
  for (let seedIndex = 0; seedIndex < options.seedCount; seedIndex += 1) {
    const recipe = createHeroRockRecipe(lithology.id, {
      catalog,
      seed: 50_000 + familyIndex * options.seedCount + seedIndex,
    });
    const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
    const network = compileFractureNetworkProgram(recipe, structuralProgram, { catalog });
    if (seedIndex === 0) representative = { network, recipe, structuralProgram };
    let seedPassed = true;
    for (const [setIndex, set] of recipe.fractureHistory.sets.entries()) {
      const members = network.fractures.filter((fracture) => fracture.setId === set.id);
      const statistics = network.statisticsBySet.find((entry) => entry.setId === set.id);
      const bounded = members.every((fracture) => (
        fracture.sizeMetres >= set.sizeDistribution.minimumMetres
        && fracture.sizeMetres <= set.sizeDistribution.maximumMetres
        && fracture.apertureMetres >= set.apertureMetres * 0.82 - 1e-12
        && fracture.apertureMetres <= set.apertureMetres * 1.18 + 1e-12
        && fracture.roughnessMetres >= set.roughnessMetres * 0.8 - 1e-12
        && fracture.roughnessMetres <= set.roughnessMetres * 1.2 + 1e-12
      ));
      const spacingRatio = statistics.spacingMetres.mean === null ? null : statistics.spacingMetres.mean / set.spacingMetres;
      const sizeRatio = statistics.sizeMetres.mean / set.sizeDistribution.meanMetres;
      const expectedOrientation = orientationModel(set.orientationConcentration);
      const orientationMeanHalfBand = 4 * expectedOrientation.standardDeviation / Math.sqrt(members.length) + 0.5;
      const orientationMeanBand = [
        Math.max(0, expectedOrientation.mean - orientationMeanHalfBand),
        expectedOrientation.mean + orientationMeanHalfBand,
      ];
      const setPassed = bounded
        && (spacingRatio === null || (spacingRatio >= 0.7 && spacingRatio <= 1.3))
        && sizeRatio >= 0.6 && sizeRatio <= 1.4
        && statistics.orientationDeviationDegrees.mean >= orientationMeanBand[0]
        && statistics.orientationDeviationDegrees.mean <= orientationMeanBand[1]
        && statistics.orientationDeviationDegrees.maximum <= expectedOrientation.axialTailLimitDegrees;
      seedPassed &&= setPassed;
      pooled.aperture.push(...members.map((fracture) => fracture.apertureMetres / set.apertureMetres));
      pooled.orientation.push(...members.map((fracture) => fracture.orientationDeviationDegrees));
      pooled.orientationModelMean.push(...members.map(() => expectedOrientation.mean));
      pooled.persistence.push(...members.map((fracture) => fracture.persistenceMetres / set.persistenceMetres));
      pooled.roughness.push(...members.map((fracture) => fracture.roughnessMetres / set.roughnessMetres));
      pooled.size.push(...members.map((fracture) => fracture.sizeMetres / set.sizeDistribution.meanMetres));
      if (spacingRatio !== null) pooled.spacing.push(spacingRatio);
      seedResults.push({
        bounded,
        fractureCount: members.length,
        orientationMaximumDegrees: round(statistics.orientationDeviationDegrees.maximum),
        orientationMeanBandDegrees: orientationMeanBand.map((value) => round(value)),
        orientationMeanDegrees: round(statistics.orientationDeviationDegrees.mean),
        orientationTailLimitDegrees: expectedOrientation.axialTailLimitDegrees,
        passed: setPassed,
        seed: recipe.seed,
        setId: set.id,
        setIndex,
        sizeRatio: round(sizeRatio),
        spacingRatio: round(spacingRatio),
      });
    }
    check(seedPassed, 'FAMILY_SEED_SET_OUTSIDE_CONFIDENCE_BAND', { lithology: lithology.id, seed: recipe.seed, seedResults: seedResults.slice(-recipe.fractureHistory.sets.length) });
  }
  const diagnosticBlocks = extractImplicitBlocks(representative.network, representative.structuralProgram, { longestAxisCells: 14 });
  const aggregate = Object.fromEntries(Object.entries(pooled).map(([key, values]) => [key, moments(values)]));
  const aggregateOrientationHalfBand = 4 * aggregate.orientation.standardDeviation / Math.sqrt(aggregate.orientation.count) + 0.25;
  const aggregatePassed = aggregate.size.mean >= 0.92 && aggregate.size.mean <= 1.08
    && (aggregate.spacing.mean === null || (aggregate.spacing.mean >= 0.92 && aggregate.spacing.mean <= 1.08))
    && Math.abs(aggregate.orientation.mean - aggregate.orientationModelMean.mean) <= aggregateOrientationHalfBand;
  const result = {
    aggregate,
    aggregatePassed,
    blockDiagnostic: {
      blockCount: diagnosticBlocks.blocks.length,
      gapCells: diagnosticBlocks.occupancyAudit.gapCells,
      inheritedMaterialAndFabric: diagnosticBlocks.blocks.every((block) => block.inheritedMaterialId && block.fabricKind),
      overlapCells: diagnosticBlocks.occupancyAudit.overlapCells,
    },
    lithology: lithology.id,
    lithologyClass: lithology.class,
    seedCount: options.seedCount,
    seedResults,
  };
  familyResults.push(result);
  check(aggregatePassed, 'FAMILY_AGGREGATE_OUTSIDE_CONFIDENCE_BAND', result);
  check(result.blockDiagnostic.gapCells === 0 && result.blockDiagnostic.overlapCells === 0, 'FAMILY_BLOCK_OCCUPANCY_RESIDUAL', result);
  check(result.blockDiagnostic.inheritedMaterialAndFabric, 'FAMILY_BLOCK_INHERITANCE_MISSING', result);
}
const classCounts = groupCounts(familyResults.map((entry) => entry.lithologyClass));
check(familyResults.length === 65, 'CATALOG_FAMILY_COVERAGE_COUNT', { actual: familyResults.length, expected: 65 });
check(classCounts.igneous === 22 && classCounts.sedimentary === 26 && classCounts.metamorphic === 17, 'CATALOG_CLASS_COVERAGE_COUNT', classCounts);

const determinismResults = {};
for (const name of Object.keys(expectedBasis)) {
  const fixture = compiledFixtures[name];
  const second = compileFractureBlockStage(fixture.recipe, fixture.structuralProgram, { catalog });
  determinismResults[name] = {
    first: fixture.stage.outputContentId,
    second: second.outputContentId,
    stable: fixture.stage.outputContentId === second.outputContentId,
  };
  check(determinismResults[name].stable, 'BLOCK_STAGE_NONDETERMINISTIC', { name, ...determinismResults[name] });
}

const automated = {
  passed: failures.length === 0,
  status: failures.length === 0 ? 'candidate-awaiting-developer-approval' : 'failed',
  counts: {
    basisFixtures: basisResults.length,
    catalogFamilies: familyResults.length,
    catalogSeedSets: familyResults.reduce((sum, family) => sum + family.seedResults.length, 0),
    checks,
    chronologyFixtures: 4,
    failures: failures.length,
    rejectedCapacityFixtures: capacityGuard.rejected ? 1 : 0,
    spatialQueries: spatialResults.queryCount,
  },
  classCounts,
  gates: {
    blockGraphsAndInheritance: basisResults.every((entry) => entry.graphReferencesValid && entry.supportReferencesValid && entry.inheritedMaterialAndFabric),
    blocksOccupyParentWithoutGapsOrOverlaps: basisResults.every((entry) => entry.occupancyAudit.gapCells === 0 && entry.occupancyAudit.overlapCells === 0),
    deterministic: Object.values(determinismResults).every((entry) => entry.stable),
    finiteAndChronologyAware: finiteJointProof.centerHit !== null
      && finiteJointProof.outsideTipHit === null
      && acceptedBelow === testedBelow
      && rejectedAbove === testedAbove
      && (hierarchyRelations.terminates ?? 0) > 0
      && hierarchyRetainedSamples > 0
      && hierarchyTerminatedSamples > 0
      && beddingDeflectionProof.deflectedMeanDegrees < beddingDeflectionProof.authoredMeanDegrees * 0.5,
    fourBasisBlindSort: basisResults.every((entry) => entry.inferredWithoutFixtureIdentity === entry.expected),
    fullCatalogSeedConfidence: familyResults.length === 65 && familyResults.every((entry) => entry.aggregatePassed && entry.seedResults.every((seed) => seed.passed)),
    spatialIndexNoFalseNegatives: spatialFalseNegatives === 0 && blockLookupMismatches === 0,
    truncatedDistributionStatistics: distributionResults.every((entry) => entry.bounded && entry.relativeMeanError <= 0.035),
    unsupportedDensityFailsExplicitly: capacityGuard.rejected && capacityGuard.errorCode === 'FRACTURE_SET_CAPACITY_EXCEEDED',
  },
  evidenceHash: sha256({ basisResults, capacityGuard, chronologyResults, distributionResults, familyResults, spatialResults }),
  failures,
};

await Promise.all([
  writeJson(options.outputDir, 'automated-results.json', automated),
  writeJson(options.outputDir, 'basis-block-results.json', basisResults),
  writeJson(options.outputDir, 'capacity-guard-result.json', capacityGuard),
  writeJson(options.outputDir, 'catalog-family-results.json', familyResults),
  writeJson(options.outputDir, 'chronology-results.json', chronologyResults),
  writeJson(options.outputDir, 'determinism-results.json', determinismResults),
  writeJson(options.outputDir, 'distribution-results.json', distributionResults),
  writeJson(options.outputDir, 'spatial-index-results.json', spatialResults),
]);

console.log(JSON.stringify(automated, null, 2));
if (!automated.passed) process.exitCode = 1;
