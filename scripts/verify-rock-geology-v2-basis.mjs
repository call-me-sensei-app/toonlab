#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { meshToObj } from '../src/rockgen/experimental/geology-v2/process/meshing.node.js';
import { compileC8BasisStages, meshC8BasisFixture } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import {
  C8_BASIS_MATRIX,
  createC8BasisFixtures,
  listC8BasisDefinitions,
  scaleC8BasisFixture,
} from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';

function parseArguments(argv) {
  const options = {
    outputDirectory: path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families'),
    quick: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir') options.outputDirectory = path.resolve(argv[++index] ?? '');
    else if (argv[index] === '--quick') options.quick = true;
    else throw new RangeError(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function hashMesh(mesh) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  hash.update(Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength));
  return hash.digest('hex');
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

async function writeJson(name, value) {
  await writeFile(path.join(options.outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

const options = parseArguments(process.argv.slice(2));
const catalog = loadGeologyCatalog();
const definitions = listC8BasisDefinitions();
const fixtures = createC8BasisFixtures({ catalog });
await mkdir(options.outputDirectory, { recursive: true });
await mkdir(path.join(options.outputDirectory, 'meshes'), { recursive: true });
await mkdir(path.join(options.outputDirectory, 'programs'), { recursive: true });

const predeclared = {
  checkpoint: 8,
  boundary: {
    included: 'bounded family specimens and paired basis forms',
    excluded: 'formation-domain chunking, mountain assembly, stylization, UE import, and public API',
  },
  families: definitions,
  heroRoles: ['median', 'challenging', 'extreme-valid', 'worst-passing'],
  matrix: C8_BASIS_MATRIX,
  recognizability: {
    automatedMechanismTrace: 'dominant declared mechanism channel must exceed the family threshold',
    humanVisualGate: 'developer must identify intended class from clay/reference-ID board; automated trace cannot approve this gate',
  },
  scaleFactors: [0.25, 0.5, 1, 2, 4],
  topology: 'zero boundary/non-manifold/winding/degenerate/duplicate/self-intersection failures; expected component range is form-specific',
};
await writeJson('predeclared-gates.json', predeclared);

const failures = [];
let checks = 0;
function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
}

const tierResults = [];
const heroOutputs = [];
const tierOrder = ['draft', 'production', 'hero'];
for (const definition of definitions) {
  for (const qualityTier of tierOrder) {
    const population = options.quick
      ? fixtures[definition.id][qualityTier].slice(0, Math.min(2, fixtures[definition.id][qualityTier].length))
      : fixtures[definition.id][qualityTier];
    const seedResults = [];
    for (const fixture of population) {
      const compiled = meshC8BasisFixture(fixture, { catalog, includeSelfIntersections: true });
      const dominantMechanism = Math.max(...Object.values(compiled.stages.basisField.descriptor.features));
      const mechanismTracePassed = dominantMechanism >= definition.threshold;
      const result = {
        components: compiled.record.topology.components,
        expectedComponentRange: compiled.record.expectedComponentRange,
        genus: compiled.record.topology.closedOrientableGenus,
        heroRole: fixture.heroRole,
        mechanismTracePassed,
        mechanismTraceScore: round(dominantMechanism),
        meshHash: hashMesh(compiled.mesh),
        passed: compiled.record.passed && mechanismTracePassed,
        qualityTier,
        seed: fixture.recipe.seed,
        seedIndex: fixture.seedIndex,
        selfIntersectionPairs: compiled.record.topology.selfIntersectionPairs,
        surfaceAreaSquareMetres: round(compiled.record.topology.surfaceArea),
        topologyFailures: compiled.record.topology.topologyFailures,
        triangles: compiled.record.topology.triangles,
        variantId: fixture.variant.id,
        vertices: compiled.record.topology.vertices,
      };
      seedResults.push(result);
      check(result.passed, 'BASIS_SEED_GATE_FAILED', { familyId: definition.id, ...result });
      if (qualityTier === 'hero') {
        const filename = `${definition.id}--${fixture.variant.id}--${fixture.heroRole}.obj`;
        await writeFile(path.join(options.outputDirectory, 'meshes', filename), meshToObj(compiled.mesh, { name: filename.replace('.obj', '') }));
        heroOutputs.push({
          bounds: compiled.record.topology.bounds,
          familyId: definition.id,
          features: compiled.stages.basisField.descriptor.features,
          file: `meshes/${filename}`,
          heroRole: fixture.heroRole,
          lithology: fixture.recipe.lithology,
          mechanism: definition.mechanism,
          recipeId: fixture.recipe.id,
          variantId: fixture.variant.id,
        });
        await writeJson(`programs/${fixture.recipe.id}.json`, {
          basisField: compiled.stages.basisField.descriptor,
          fractureOutputContentId: compiled.stages.fractureStage.outputContentId,
          processOutputContentId: compiled.stages.processStage.outputContentId,
          recipe: fixture.recipe,
          structureProgramContentId: compiled.stages.structuralProgram.programContentId,
        });
      }
    }
    const variants = Object.groupBy(seedResults, (result) => result.variantId);
    const summary = {
      actualSeeds: seedResults.length,
      expectedSeeds: options.quick ? seedResults.length : C8_BASIS_MATRIX[qualityTier].seedsPerFamily,
      familyId: definition.id,
      passed: seedResults.every((result) => result.passed),
      qualityTier,
      seeds: seedResults,
      variantCoverage: Object.fromEntries(Object.entries(variants).map(([id, results]) => [id, results.length])),
    };
    tierResults.push(summary);
    check(summary.passed && summary.actualSeeds === summary.expectedSeeds, 'BASIS_TIER_POPULATION_FAILED', summary);
    check(Object.keys(summary.variantCoverage).length === definition.variants.length, 'BASIS_VARIANT_NOT_COVERED', summary);
  }
}

const determinismResults = [];
if (!options.quick) for (const definition of definitions) {
  for (const fixture of fixtures[definition.id].hero.slice(0, 3)) {
    const repeated = meshC8BasisFixture(fixture, { catalog, includeSelfIntersections: true });
    const original = tierResults.find((tier) => tier.familyId === definition.id && tier.qualityTier === 'hero')
      .seeds.find((seed) => seed.seedIndex === fixture.seedIndex);
    const result = {
      familyId: definition.id,
      first: original.meshHash,
      heroRole: fixture.heroRole,
      second: hashMesh(repeated.mesh),
      stable: original.meshHash === hashMesh(repeated.mesh),
      variantId: fixture.variant.id,
    };
    determinismResults.push(result);
    check(result.stable, 'BASIS_MESH_NONDETERMINISTIC', result);
  }
}

const scaleResults = [];
if (!options.quick) for (const definition of definitions) {
  const nominal = fixtures[definition.id].hero[0];
  for (const scaleFactor of predeclared.scaleFactors) {
    try {
      const scaled = scaleC8BasisFixture(nominal, scaleFactor, { catalog });
      const compiled = meshC8BasisFixture(scaled, { catalog, includeSelfIntersections: true, resolution: 32 });
      const result = {
        familyId: definition.id,
        maximumDimensionMetres: round(Math.max(...scaled.recipe.targetDimensionsMetres)),
        ontologyDisposition: 'compiled',
        passed: compiled.record.passed,
        scale: scaled.recipe.scale,
        scaleFactor,
        topologyFailures: compiled.record.topology.topologyFailures,
        variantId: scaled.variant.id,
      };
      scaleResults.push(result);
      check(result.passed, 'BASIS_RECOMPILE_SCALE_FAILED', result);
    } catch (error) {
      const expectedOntologyGuard = error?.code === 'ROCK_RECIPE_INVALID'
        && error?.details?.issues?.some((issue) => issue.code === 'GEOLOGY_COMBINATION_INVALID');
      const result = {
        code: error?.code ?? error?.name,
        familyId: definition.id,
        ontologyDisposition: expectedOntologyGuard ? 'rejected-invalid-landform-scale-pair' : 'unexpected-error',
        passed: expectedOntologyGuard,
        scaleFactor,
        variantId: nominal.variant.id,
      };
      scaleResults.push(result);
      check(result.passed, 'BASIS_SCALE_BOUNDARY_UNEXPECTED', result);
    }
  }
}

const baselineDefectDispositions = [
  ['boulder', 'resolved', 'C7 closed render mesh plus C8 transported/granite seed matrices'],
  ['river-boulder', 'resolved', 'dedicated rounded transport morphology and lineage-bearing recipe'],
  ['karst-spire', 'resolved', 'tapered residual mass with bedding and solution runnels'],
  ['shard-monolith', 'remaining', 'not a C8 basis family; retained for C10 rollout'],
  ['jointed-granite-boulder', 'resolved', 'orthogonal/sheet joint grammar replaces generic cuts'],
  ['sea-stack', 'remaining', 'coastal staged collapse belongs to C9 formation proof'],
  ['lowpoly-boulder', 'remaining', 'stylized topology belongs to C11, not neutral foundation'],
  ['mossy-boulder', 'remaining', 'biological surfacing belongs to C11'],
  ['granite-boulder', 'resolved', 'topology-safe jointed/exfoliating basis variant'],
  ['basalt-columns', 'resolved', 'polygonal columns plus entablature transition'],
  ['cliff-wall', 'resolved', 'family-specific bounded cliff specimens; formation continuity remains C9'],
  ['eroded-mesa', 'remaining', 'formation-scale landform belongs to C9/C10'],
  ['canyon-ridge', 'remaining', 'formation-scale landform belongs to C9/C10'],
  ['column-arch', 'resolved', 'finite supported arch opening with non-periodic seed variation'],
  ['cliff-face', 'resolved', 'sandstone/shale/gneiss family-specific bounded faces'],
  ['scree-cluster', 'resolved', 'multi-component inherited talus assembly with topology range'],
].map(([family, status, reason]) => ({ family, reason, status }));
check(baselineDefectDispositions.length === 16, 'BASELINE_DEFECT_DISPOSITION_INCOMPLETE', { baselineDefectDispositions });

const technicalSummary = definitions.map((definition) => {
  const tiers = tierResults.filter((tier) => tier.familyId === definition.id);
  const seeds = tiers.flatMap((tier) => tier.seeds);
  return {
    familyId: definition.id,
    maximumComponents: Math.max(...seeds.map((seed) => seed.components)),
    maximumSelfIntersections: Math.max(...seeds.map((seed) => seed.selfIntersectionPairs)),
    maximumTopologyFailures: Math.max(...seeds.map((seed) => seed.topologyFailures)),
    passedSeeds: seeds.filter((seed) => seed.passed).length,
    seedCount: seeds.length,
    variants: [...new Set(seeds.map((seed) => seed.variantId))],
    worstMechanismTraceScore: Math.min(...seeds.map((seed) => seed.mechanismTraceScore)),
  };
});

const report = {
  checkpoint: 8,
  checks,
  defects: baselineDefectDispositions,
  determinism: determinismResults,
  failures,
  heroOutputs,
  mode: options.quick ? 'quick-smoke' : 'full-predeclared-population',
  passed: failures.length === 0,
  pendingHumanGate: 'clay recognizability and neutral realistic A/B require developer review',
  scaleMatrix: scaleResults,
  technicalSummary,
  tiers: tierResults,
};
await writeJson('verification-report.json', report);
await writeJson('technical-summary.json', technicalSummary);
await writeJson('baseline-defect-dispositions.json', baselineDefectDispositions);
await writeJson('hero-output-index.json', heroOutputs);

console.log(JSON.stringify({
  checks,
  families: definitions.length,
  failures: failures.length,
  heroMeshes: heroOutputs.length,
  passed: report.passed,
  scaleCases: scaleResults.length,
  seedCases: tierResults.reduce((sum, tier) => sum + tier.seeds.length, 0),
}, null, 2));
if (!report.passed) process.exitCode = 1;
