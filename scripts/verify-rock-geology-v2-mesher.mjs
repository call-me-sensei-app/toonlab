#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  ADVERSARIAL_MESHER_FIXTURES,
  countAmbiguousGridFaces,
} from '../src/rockgen/experimental/geology-v2/meshing/adversarialFixtures.node.js';
import {
  EXISTING_EXPERIMENTAL_ROCK_FAMILIES,
  createExistingExperimentalFamilySource,
} from '../src/rockgen/experimental/geology-v2/meshing/existingFamilyMatrix.node.js';
import {
  extractManifoldDualContouring,
  extractManifoldDualContouringChunks,
  simplifyManifoldDualContouring,
} from '../src/rockgen/experimental/geology-v2/meshing/manifoldDualContouring.node.js';
import {
  auditMesherOutput,
  createMesherBakeOffAdapters,
} from '../src/rockgen/experimental/geology-v2/meshing/mesherAdapters.node.js';
import {
  buildCreaseAwareRenderMesh,
} from '../src/rockgen/experimental/geology-v2/meshing/meshContract.node.js';
import { sampleScalarField } from '../src/rockgen/experimental/geology-v2/meshing/scalarGrid.node.js';
import { auditHausdorff, auditMeshTopology } from '../src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js';

const SELECTED_MESHER = 'toonlab-manifold-dual-contouring';
const MATRIX_RESOLUTION = 24;
const MATRIX_SEEDS = 32;
const RESOLUTION_SWEEP = Object.freeze([16, 24, 32, 40]);
const ADAPTIVE_OPTIONS = Object.freeze({ maxLevel: 2, qefErrorTolerance: 0.04 });
const SLIVER_WARNING_DEGREES = 0.5;
const SLIVER_FRACTION_BUDGET = 0.001;
const PER_FAMILY_SLIVER_FRACTION_BUDGET = 0.002;

function parseArguments(argv) {
  const result = {
    full: false,
    mc33Binary: null,
    outputDir: path.resolve('artifacts/research/rock-geology-v2/checkpoint-03-topology-mesher'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--full') result.full = true;
    else if (argument === '--mc33-binary') result.mc33Binary = path.resolve(argv[++index] ?? '');
    else if (argument === '--output-dir') result.outputDir = path.resolve(argv[++index] ?? '');
    else if (argument === '--help') {
      console.log('Usage: node scripts/verify-rock-geology-v2-mesher.mjs --mc33-binary PATH [--full] [--output-dir DIR]');
      process.exit(0);
    } else throw new RangeError(`Unknown argument: ${argument}`);
  }
  if (!result.mc33Binary) throw new TypeError('--mc33-binary is required.');
  return result;
}

function sha256Bytes(...arrays) {
  const hash = createHash('sha256');
  for (const array of arrays) {
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  }
  return hash.digest('hex');
}

function meshHash(mesh) {
  return sha256Bytes(mesh.positions, mesh.indices);
}

function round(value, digits = 9) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

function compactAudit(audit) {
  return {
    boundaryEdges: audit.boundaryEdges,
    closedOrientableGenus: audit.closedOrientableGenus,
    componentOrientation: audit.componentOrientation.map((component) => ({
      comparableTriangles: component.comparableTriangles,
      fieldDisagreementRatio: round(component.fieldDisagreementRatio),
      fieldDisagreements: component.fieldDisagreements,
      invertedAgainstField: component.invertedAgainstField,
      signedVolume: round(component.signedVolume),
      triangles: component.triangles,
    })),
    components: audit.components,
    degenerateTriangles: audit.degenerateTriangles,
    duplicateTriangles: audit.duplicateTriangles,
    invertedFieldOrientationComponents: audit.invertedFieldOrientationComponents,
    minimumAngleDegrees: round(audit.minimumAngleDegrees),
    nonFiniteVertices: audit.nonFiniteVertices,
    nonManifoldEdges: audit.nonManifoldEdges,
    nonManifoldVertices: audit.nonManifoldVertices,
    selfIntersectionPairs: audit.selfIntersectionPairs,
    signedVolume: round(audit.signedVolume),
    sliverTriangles: audit.sliverTriangles,
    surfaceArea: round(audit.surfaceArea),
    topologyFailures: audit.topologyFailures,
    triangles: audit.triangles,
    vertices: audit.vertices,
    windingEdges: audit.windingEdges,
    windingFieldDisagreements: audit.windingFieldDisagreements,
  };
}

function compactHausdorff(audit) {
  if (!audit) return null;
  return {
    cellSize: round(audit.cellSize),
    fieldToMeshMaximum: round(audit.fieldToMesh.maximum),
    fieldToMeshNormalizedMaximum: round(audit.fieldToMesh.normalizedMaximum),
    fieldToMeshRms: round(audit.fieldToMesh.rms),
    fieldToMeshSamples: audit.fieldToMesh.samples,
    maximum: round(audit.maximum),
    meshToFieldMaximum: round(audit.meshToField.maximum),
    meshToFieldNormalizedMaximum: round(audit.meshToField.normalizedMaximum),
    meshToFieldRms: round(audit.meshToField.rms),
    meshToFieldSamples: audit.meshToField.samples,
    normalizedMaximum: round(audit.normalizedMaximum),
  };
}

function fixtureGrid(fixture, resolution = fixture.resolution) {
  return sampleScalarField({
    bounds: fixture.bounds,
    evaluate: fixture.evaluate,
    resolution,
    sourceId: `${fixture.id}@${resolution}`,
  });
}

function familyGrid(familyId, seed, resolution) {
  const source = createExistingExperimentalFamilySource(familyId, seed);
  return {
    grid: sampleScalarField({
      bounds: source.bounds,
      evaluate: source.evaluateHigh,
      resolution,
      sourceId: `${familyId}/seed-${seed}@${resolution}`,
    }),
    source,
  };
}

function expectedFixturePassed(fixture, audit, ambiguousFaces) {
  if (audit.components !== fixture.expected.components) return false;
  if (fixture.expected.maximumGenus !== undefined
      && audit.closedOrientableGenus > fixture.expected.maximumGenus) return false;
  if (fixture.expected.minimumAmbiguousFaces !== undefined
      && ambiguousFaces < fixture.expected.minimumAmbiguousFaces) return false;
  return true;
}

function meshToObj(mesh, label) {
  const lines = [`# ${label}`, `# sha256 ${meshHash(mesh)}`];
  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    lines.push(`v ${mesh.positions[offset]} ${mesh.positions[offset + 1]} ${mesh.positions[offset + 2]}`);
  }
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    lines.push(`f ${mesh.indices[offset] + 1} ${mesh.indices[offset + 1] + 1} ${mesh.indices[offset + 2] + 1}`);
  }
  return `${lines.join('\n')}\n`;
}

async function writeJson(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function runThreeWay({ mc33Binary, meshesDirectory }) {
  const adapters = createMesherBakeOffAdapters({ mc33BinaryPath: mc33Binary });
  const records = [];
  const summary = Object.fromEntries(adapters.map((adapter) => [adapter.id, {
    extractionMilliseconds: 0,
    fixtures: 0,
    topologyFailures: 0,
    totalTriangles: 0,
    totalVertices: 0,
  }]));
  for (const fixture of ADVERSARIAL_MESHER_FIXTURES) {
    const grid = fixtureGrid(fixture);
    const ambiguousFaces = countAmbiguousGridFaces(grid);
    for (const adapter of adapters) {
      const before = process.memoryUsage();
      const started = performance.now();
      const mesh = await adapter.extract(grid, fixture.evaluate);
      const extractionMilliseconds = performance.now() - started;
      const after = process.memoryUsage();
      const audit = auditMesherOutput(mesh, grid, fixture.evaluate, {
        includeHausdorff: true,
        includeSelfIntersections: true,
      });
      const record = {
        ambiguousFaces,
        candidate: adapter.id,
        extractionMilliseconds: round(extractionMilliseconds, 3),
        fixture: fixture.id,
        hausdorff: compactHausdorff(audit.hausdorff),
        heapDeltaBytes: after.heapUsed - before.heapUsed,
        meshHash: meshHash(mesh),
        metadata: mesh.metadata,
        rssDeltaBytes: after.rss - before.rss,
        topology: compactAudit(audit.topology),
      };
      records.push(record);
      const aggregate = summary[adapter.id];
      aggregate.extractionMilliseconds += extractionMilliseconds;
      aggregate.fixtures += 1;
      aggregate.topologyFailures += audit.topology.topologyFailures;
      aggregate.totalTriangles += audit.topology.triangles;
      aggregate.totalVertices += audit.topology.vertices;
      await writeFile(
        path.join(meshesDirectory, `${fixture.id}--${adapter.id}.obj`),
        meshToObj(mesh, `${fixture.label} — ${adapter.label}`),
      );
    }
  }
  for (const aggregate of Object.values(summary)) {
    aggregate.extractionMilliseconds = round(aggregate.extractionMilliseconds, 3);
  }
  return { records, summary };
}

async function runAdaptiveAndChunk() {
  const adaptive = [];
  let chunk = null;
  for (const fixture of ADVERSARIAL_MESHER_FIXTURES) {
    const grid = fixtureGrid(fixture);
    const uniform = extractManifoldDualContouring(grid, { evaluate: fixture.evaluate });
    const uniformAudit = auditMeshTopology(uniform, { evaluate: fixture.evaluate, grid });
    const simplified = simplifyManifoldDualContouring(uniform, {
      evaluate: fixture.evaluate,
      ...ADAPTIVE_OPTIONS,
    });
    const simplifiedAudit = auditMeshTopology(simplified, { evaluate: fixture.evaluate, grid });
    adaptive.push({
      adaptive: compactAudit(simplifiedAudit),
      fixture: fixture.id,
      metadata: simplified.metadata,
      triangleReduction: round(1 - simplifiedAudit.triangles / uniformAudit.triangles),
      uniform: compactAudit(uniformAudit),
    });
    if (fixture.id === 'chunk-seam') {
      const chunked = extractManifoldDualContouringChunks(grid, {
        chunkCells: fixture.chunkCells,
        evaluate: fixture.evaluate,
        monolithic: uniform,
      });
      chunk = {
        chunked: compactAudit(auditMeshTopology(chunked, { evaluate: fixture.evaluate, grid })),
        meshHash: meshHash(chunked),
        monolithicHash: meshHash(uniform),
        proof: chunked.seamProof,
      };
    }
  }
  return { adaptive, chunk };
}

function runFeatureNormals() {
  const fixture = ADVERSARIAL_MESHER_FIXTURES.find((entry) => entry.id === 'sharp-crease');
  const grid = fixtureGrid(fixture);
  const source = extractManifoldDualContouring(grid, { evaluate: fixture.evaluate });
  const sourceHashBefore = meshHash(source);
  const render = buildCreaseAwareRenderMesh(source, { creaseAngleDegrees: 55 });
  const sourceHashAfter = meshHash(source);
  let nonFiniteNormals = 0;
  let maximumNormalLengthError = 0;
  for (let offset = 0; offset < render.normals.length; offset += 3) {
    const values = [render.normals[offset], render.normals[offset + 1], render.normals[offset + 2]];
    if (!values.every(Number.isFinite)) nonFiniteNormals += 1;
    maximumNormalLengthError = Math.max(maximumNormalLengthError, Math.abs(Math.hypot(...values) - 1));
  }
  const audit = auditMeshTopology(source, { evaluate: fixture.evaluate, grid });
  const passed = sourceHashBefore === sourceHashAfter
    && audit.topologyFailures === 0
    && render.positions.length > source.positions.length
    && nonFiniteNormals === 0
    && maximumNormalLengthError < 1e-5;
  return {
    creaseAngleDegrees: 55,
    maximumNormalLengthError: round(maximumNormalLengthError, 12),
    nonFiniteNormals,
    passed,
    policy: render.metadata.normalPolicy,
    renderVertices: render.positions.length / 3,
    sourceHashAfter,
    sourceHashBefore,
    sourceTopology: compactAudit(audit),
    sourceVertices: source.positions.length / 3,
  };
}

function runDeterminism() {
  const cases = [
    { id: 'fixture/ambiguous-cell', make() {
      const fixture = ADVERSARIAL_MESHER_FIXTURES.find((entry) => entry.id === 'ambiguous-cell');
      return extractManifoldDualContouring(fixtureGrid(fixture), { evaluate: fixture.evaluate });
    } },
    { id: 'family/basalt-columns/seed-15', make() {
      const { grid, source } = familyGrid('basalt-columns', 15, MATRIX_RESOLUTION);
      return extractManifoldDualContouring(grid, { evaluate: source.evaluateHigh });
    } },
    { id: 'family/scree-cluster/seed-26', make() {
      const { grid, source } = familyGrid('scree-cluster', 26, MATRIX_RESOLUTION);
      return extractManifoldDualContouring(grid, { evaluate: source.evaluateHigh });
    } },
  ];
  return cases.map((entry) => {
    const hashes = [meshHash(entry.make()), meshHash(entry.make())];
    return { hashes, id: entry.id, passed: hashes[0] === hashes[1] };
  });
}

function runResolutionSweep({ full }) {
  const fixtureRecords = [];
  const familyRecords = [];
  for (const fixture of ADVERSARIAL_MESHER_FIXTURES) {
    for (const resolution of RESOLUTION_SWEEP) {
      const grid = fixtureGrid(fixture, resolution);
      const mesh = extractManifoldDualContouring(grid, { evaluate: fixture.evaluate });
      const topology = auditMeshTopology(mesh, { evaluate: fixture.evaluate, grid });
      const hausdorff = auditHausdorff(mesh, grid, fixture.evaluate, { maxGridSamples: 6_000 });
      const ambiguousFaces = countAmbiguousGridFaces(grid);
      fixtureRecords.push({
        ambiguousFaces,
        expectedPassed: expectedFixturePassed(fixture, topology, ambiguousFaces),
        fixture: fixture.id,
        hausdorff: compactHausdorff(hausdorff),
        resolution,
        topology: compactAudit(topology),
      });
    }
  }
  const families = full ? EXISTING_EXPERIMENTAL_ROCK_FAMILIES : EXISTING_EXPERIMENTAL_ROCK_FAMILIES.slice(0, 4);
  for (const family of families) {
    for (const resolution of RESOLUTION_SWEEP) {
      const { grid, source } = familyGrid(family.id, 7, resolution);
      const started = performance.now();
      const mesh = extractManifoldDualContouring(grid, { evaluate: source.evaluateHigh });
      const extractionMilliseconds = performance.now() - started;
      const topology = auditMeshTopology(mesh, { evaluate: source.evaluateHigh, grid });
      familyRecords.push({
        extractionMilliseconds: round(extractionMilliseconds, 3),
        family: family.id,
        resolution,
        seed: 7,
        topology: compactAudit(topology),
      });
    }
  }
  return { familyRecords, fixtureRecords, resolutions: [...RESOLUTION_SWEEP] };
}

function runFamilyMatrix({ full }) {
  const records = [];
  const familySummary = [];
  const seedCount = full ? MATRIX_SEEDS : 4;
  for (const family of EXISTING_EXPERIMENTAL_ROCK_FAMILIES) {
    const familyStarted = performance.now();
    let failures = 0;
    let sliverTriangles = 0;
    let splitParallelDualEdges = 0;
    let triangles = 0;
    for (let seed = 0; seed < seedCount; seed += 1) {
      const { grid, source } = familyGrid(family.id, seed, MATRIX_RESOLUTION);
      const started = performance.now();
      const mesh = extractManifoldDualContouring(grid, { evaluate: source.evaluateHigh });
      const extractionMilliseconds = performance.now() - started;
      const topology = auditMeshTopology(mesh, { evaluate: source.evaluateHigh, grid });
      failures += Number(topology.topologyFailures > 0);
      sliverTriangles += topology.sliverTriangles;
      splitParallelDualEdges += mesh.metadata.splitParallelDualEdges;
      triangles += topology.triangles;
      records.push({
        extractionMilliseconds: round(extractionMilliseconds, 3),
        family: family.id,
        meshHash: meshHash(mesh),
        metadata: { splitParallelDualEdges: mesh.metadata.splitParallelDualEdges },
        resolution: MATRIX_RESOLUTION,
        seed,
        topology: compactAudit(topology),
      });
    }
    familySummary.push({
      elapsedMilliseconds: round(performance.now() - familyStarted, 3),
      failures,
      family: family.id,
      seeds: seedCount,
      sliverFraction: round(sliverTriangles / Math.max(triangles, 1), 12),
      sliverTriangles,
      splitParallelDualEdges,
      triangles,
    });
    console.log(`family ${family.id}: ${seedCount} seeds, ${failures} failures`);
  }
  return { familySummary, records, resolution: MATRIX_RESOLUTION, seedCount };
}

async function buildManifest(directory, names) {
  const files = [];
  for (const name of names) {
    const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(path.join(directory, name)));
    files.push({ bytes: bytes.length, path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return { algorithm: 'sha256', files };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await stat(options.mc33Binary);
  await mkdir(options.outputDir, { recursive: true });
  const meshesDirectory = path.join(options.outputDir, 'meshes');
  await mkdir(meshesDirectory, { recursive: true });
  const started = performance.now();
  console.log('C3 three-way adversarial bake-off');
  const threeWay = await runThreeWay({ mc33Binary: options.mc33Binary, meshesDirectory });
  console.log('C3 adaptive and chunk seam audit');
  const { adaptive, chunk } = await runAdaptiveAndChunk();
  console.log('C3 feature-normal and determinism audit');
  const featureNormals = runFeatureNormals();
  const determinism = runDeterminism();
  console.log('C3 resolution sweep');
  const resolutionSweep = runResolutionSweep(options);
  console.log('C3 existing-family seed matrix');
  const familyMatrix = runFamilyMatrix(options);

  const selectedFixtureRecords = threeWay.records.filter((entry) => entry.candidate === SELECTED_MESHER);
  const baselineRecords = threeWay.records.filter((entry) => entry.candidate === 'surface-nets-baseline');
  const mc33Records = threeWay.records.filter((entry) => entry.candidate === 'vega-mc33-reference');
  const matrixTopologyFailures = familyMatrix.records.reduce(
    (total, entry) => total + entry.topology.topologyFailures,
    0,
  );
  const matrixTriangles = familyMatrix.records.reduce((total, entry) => total + entry.topology.triangles, 0);
  const matrixSlivers = familyMatrix.records.reduce((total, entry) => total + entry.topology.sliverTriangles, 0);
  const matrixSliverFraction = matrixSlivers / Math.max(matrixTriangles, 1);
  const gates = {
    adaptiveTopology: adaptive.every((entry) => entry.adaptive.topologyFailures === 0),
    baselineReproducesKnownFailure: baselineRecords.some((entry) => entry.topology.topologyFailures > 0),
    chunkSeam: chunk?.proof.passed === true && chunk.chunked.topologyFailures === 0,
    determinism: determinism.every((entry) => entry.passed),
    familySeedMatrixTopology: options.full
      && familyMatrix.seedCount === MATRIX_SEEDS
      && matrixTopologyFailures === 0,
    featureNormals: featureNormals.passed,
    fixtureExpectations: selectedFixtureRecords.every((entry) => {
      const fixture = ADVERSARIAL_MESHER_FIXTURES.find((candidate) => candidate.id === entry.fixture);
      return expectedFixturePassed(fixture, entry.topology, entry.ambiguousFaces);
    }),
    mc33ReferenceTopology: mc33Records.every((entry) => entry.topology.topologyFailures === 0),
    resolutionSweepTopology: resolutionSweep.fixtureRecords.every((entry) => entry.topology.topologyFailures === 0)
      && resolutionSweep.familyRecords.every((entry) => entry.topology.topologyFailures === 0),
    selectedFixtureTopology: selectedFixtureRecords.every((entry) => entry.topology.topologyFailures === 0),
    perFamilySliverDistributionBudget: familyMatrix.familySummary.every(
      (entry) => entry.sliverFraction <= PER_FAMILY_SLIVER_FRACTION_BUDGET,
    ),
    sliverDistributionBudget: matrixSliverFraction <= SLIVER_FRACTION_BUDGET,
  };
  const allPassed = Object.values(gates).every(Boolean);
  const elapsedMilliseconds = performance.now() - started;
  const environment = {
    architecture: process.arch,
    cpus: os.cpus().map((cpu) => cpu.model),
    full: options.full,
    maxRssRaw: process.resourceUsage().maxRSS,
    memoryBytes: os.totalmem(),
    node: process.version,
    platform: process.platform,
    release: os.release(),
  };
  const licenseMethodAudit = {
    selected: {
      implementation: 'clean ToonLab implementation from the 2007 paper; no third-party source copied',
      license: 'ToonLab repository license (MIT)',
      method: 'Schaefer, Ju, and Warren, Manifold Dual Contouring, TVCG 2007',
      role: 'production candidate',
    },
    references: [
      {
        commit: 'eef8f8f4d70527af74b988869e34f887ef9ed7ba',
        license: 'MIT',
        name: 'dvega68/MC33_c_header-only v5.5',
        role: 'external corrected-MC33 topology reference; header not copied into ToonLab',
        source: 'https://github.com/dvega68/MC33_c_header-only',
      },
      {
        license: 'paper methodology',
        name: 'Manifold Dual Contouring',
        role: 'method description and adaptive sufficient criterion',
        source: 'https://doi.org/10.1109/TVCG.2007.1012',
      },
      {
        license: 'MIT',
        name: 'Lin20/isosurface',
        role: 'methodology cross-check only; rejected as a dependency because its own README says implementations are not 100% paper-compliant',
        source: 'https://github.com/Lin20/isosurface',
      },
    ],
  };
  const automated = {
    allPassed,
    elapsedMilliseconds: round(elapsedMilliseconds, 3),
    gates,
    matrix: {
      families: EXISTING_EXPERIMENTAL_ROCK_FAMILIES.length,
      meshes: familyMatrix.records.length,
      resolution: MATRIX_RESOLUTION,
      seedsPerFamily: familyMatrix.seedCount,
      perFamilySliverFractionBudget: PER_FAMILY_SLIVER_FRACTION_BUDGET,
      sliverFraction: round(matrixSliverFraction, 12),
      sliverFractionBudget: SLIVER_FRACTION_BUDGET,
      sliverTriangles: matrixSlivers,
      topologyFailures: matrixTopologyFailures,
      triangles: matrixTriangles,
    },
    selectedMesher: SELECTED_MESHER,
    sliverAuditAngleDegrees: SLIVER_WARNING_DEGREES,
    status: allPassed ? 'candidate-ready-for-developer-review' : 'failed',
  };

  const outputs = {
    'adaptive-results.json': { options: ADAPTIVE_OPTIONS, records: adaptive },
    'automated-results.json': automated,
    'chunk-seam-proof.json': chunk,
    'determinism-results.json': determinism,
    'environment.json': environment,
    'family-seed-matrix.json': familyMatrix,
    'feature-normal-results.json': featureNormals,
    'license-method-audit.json': licenseMethodAudit,
    'resolution-sweep.json': resolutionSweep,
    'three-way-metrics.json': threeWay,
  };
  for (const [name, value] of Object.entries(outputs)) await writeJson(options.outputDir, name, value);
  const manifest = await buildManifest(options.outputDir, Object.keys(outputs).sort());
  await writeJson(options.outputDir, 'manifest.json', manifest);
  console.log(JSON.stringify(automated, null, 2));
  if (!allPassed) process.exitCode = 1;
}

await main();
