#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  artifactOutputSpecifications,
  createPlannedArtifactManifest,
  finalizeArtifactManifest,
  validateArtifactManifest,
} from '../src/rockgen/experimental/geology-v2/artifactManifest.node.js';
import {
  canonicalStringify,
  canonicalizeJson,
  contentId,
} from '../src/rockgen/experimental/geology-v2/canonical.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import {
  planOfflineRecipeSelection,
} from '../src/rockgen/experimental/geology-v2/harness.node.js';
import {
  createDraftV0MigrationFixture,
  migrateRockRecipe,
} from '../src/rockgen/experimental/geology-v2/migrations.node.js';
import {
  ROCK_RECIPE_SCHEMA,
  ROCK_RECIPE_VERSION,
  ROCK_SEED_NAMESPACES,
  createHeroRockRecipe,
  deserializeRockRecipe,
  parseRockRecipe,
  serializeRockRecipe,
} from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import {
  MemoryContentAddressedCache,
  ROCK_COMPILER_STAGES,
  compareCompilationPlans,
  executeRockCompilationPlan,
  getRockCompilerDependencyGraph,
  planRockCompilation,
} from '../src/rockgen/experimental/geology-v2/stageGraph.node.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const catalog = loadGeologyCatalog();
const outputFlag = process.argv.indexOf('--output-dir');
const outputDirectory = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : null;
const checks = [];
const failures = [];

function check(name, condition, details = {}) {
  const passed = condition === true;
  checks.push({ name, passed, details });
  if (!passed) failures.push({ name, details });
}

function captureError(name, action, expectedCode = null) {
  let serialized = null;
  try {
    action();
  } catch (error) {
    serialized = typeof error?.toJSON === 'function' ? error.toJSON() : {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
    };
  }
  check(`invalid.${name}.rejected`, serialized !== null, { error: serialized });
  if (expectedCode) check(`invalid.${name}.code`, serialized?.code === expectedCode, { expectedCode, actualCode: serialized?.code ?? null });
  check(`invalid.${name}.actionable`, Boolean(serialized?.path && serialized?.suggestion), { error: serialized });
  return { name, expectedCode, error: serialized };
}

function clone(value) {
  return structuredClone(value);
}

function sameSet(actual, expected) {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function allFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(allFrozen);
}

function sha256(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

const schemaPath = path.join(repositoryRoot, 'src/rockgen/experimental/geology-v2/rock-recipe.schema.v1.json');
const manifestSchemaPath = path.join(repositoryRoot, 'src/rockgen/experimental/geology-v2/artifact-manifest.schema.v1.json');
const recipeSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const manifestSchema = JSON.parse(fs.readFileSync(manifestSchemaPath, 'utf8'));
check('schema.recipe.id', recipeSchema.properties.schema.const === ROCK_RECIPE_SCHEMA);
check('schema.recipe.version', recipeSchema.properties.version.const === ROCK_RECIPE_VERSION);
check('schema.recipe.closed', recipeSchema.additionalProperties === false);
check('schema.recipe.required-field-count', recipeSchema.required.length === 26, { count: recipeSchema.required.length });
check('schema.manifest.closed', manifestSchema.additionalProperties === false);
check('schema.manifest.outputs', manifestSchema.properties.outputs.minItems === artifactOutputSpecifications().length);

const classCounts = { igneous: 0, sedimentary: 0, metamorphic: 0 };
const heroRecords = [];
for (const [index, lithology] of catalog.ontology.lithologies.entries()) {
  classCounts[lithology.class] += 1;
  const recipe = createHeroRockRecipe(lithology.id, { catalog, seed: 1001 + index });
  const parsed = parseRockRecipe(recipe, { catalog });
  const serialized = serializeRockRecipe(recipe, { catalog, pretty: true });
  const roundTrip = deserializeRockRecipe(serialized, { catalog });
  const planA = planRockCompilation(recipe, { catalog });
  const planB = planRockCompilation(roundTrip.recipe, { catalog });
  check(`hero.${lithology.id}.strict-valid`, parsed.recipe.lithology === lithology.id);
  check(`hero.${lithology.id}.canonical-round-trip`, canonicalStringify(roundTrip.recipe) === canonicalStringify(recipe));
  check(`hero.${lithology.id}.recipe-hash`, parsed.contentId === roundTrip.contentId && sha256(parsed.contentId));
  check(`hero.${lithology.id}.plan-frozen`, allFrozen(planA));
  for (const [stageIndex, stage] of planA.stages.entries()) {
    check(`hero.${lithology.id}.stage.${stage.id}.repeat-hash`, stage.stageContentId === planB.stages[stageIndex].stageContentId && sha256(stage.stageContentId));
  }
  heroRecords.push({
    id: recipe.id,
    lithology: lithology.id,
    class: lithology.class,
    recipeContentId: parsed.contentId,
    stageContentIds: Object.fromEntries(planA.stages.map((stage) => [stage.id, stage.stageContentId])),
  });
}
check('catalog.hero-count', heroRecords.length === 65, { count: heroRecords.length });
check('catalog.class-counts', classCounts.igneous === 22 && classCounts.sedimentary === 26 && classCounts.metamorphic === 17, { classCounts });

const granite = createHeroRockRecipe('granite', { catalog, seed: 1001 });
const granitePlan = planRockCompilation(granite, { catalog });
const serializedGranite = serializeRockRecipe(granite, { catalog, pretty: true });
check('canonical.repeat-bytes', serializedGranite === serializeRockRecipe(deserializeRockRecipe(serializedGranite, { catalog }).recipe, { catalog, pretty: true }));
check('canonical.metadata-is-not-stage-input', (() => {
  const changed = clone(granite);
  changed.label = 'Granite metadata-only rename';
  return compareCompilationPlans(granitePlan, planRockCompilation(changed, { catalog })).changedStages.length === 0;
})());

const draftV0 = createDraftV0MigrationFixture(granite);
const migration = migrateRockRecipe(draftV0, { catalog });
check('migration.v0-v1.version', migration.sourceVersion === 0 && migration.targetVersion === 1);
check('migration.v0-v1.path', migration.migrations.length === 1 && migration.migrations[0] === 'v0-draft-to-v1');
check('migration.v0-v1.lossless-target', canonicalStringify(migration.recipe) === canonicalStringify(granite));
check('migration.v0-v1.content-identities', sha256(migration.sourceContentId) && sha256(migration.targetContentId) && migration.sourceContentId !== migration.targetContentId);
const noMigration = migrateRockRecipe(granite, { catalog });
check('migration.v1-noop', noMigration.migrations.length === 0 && noMigration.sourceContentId === noMigration.targetContentId);

const invalidInputs = [];
const invalidUnknown = clone(granite);
invalidUnknown.noiseAmount = 0.5;
invalidInputs.push(captureError('unknown-field', () => parseRockRecipe(invalidUnknown, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidDimension = clone(granite);
invalidDimension.targetDimensionsMetres[0] = 0;
invalidInputs.push(captureError('zero-dimension', () => parseRockRecipe(invalidDimension, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidDimensionType = clone(granite);
invalidDimensionType.targetDimensionsMetres[0] = '2';
invalidInputs.push(captureError('dimension-type-coercion', () => parseRockRecipe(invalidDimensionType, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidBedding = clone(granite);
invalidBedding.fabrics = ['coarse-granular', 'thin-bedding'];
invalidInputs.push(captureError('bedded-granite', () => parseRockRecipe(invalidBedding, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidFuture = clone(granite);
invalidFuture.version = 99;
invalidInputs.push(captureError('future-version', () => migrateRockRecipe(invalidFuture, { catalog }), 'ROCK_RECIPE_VERSION_UNSUPPORTED'));
const invalidCycle = clone(granite);
invalidCycle.chronology.edges.push({ before: 'fracture', after: 'formation', relationship: 'precedes' });
invalidInputs.push(captureError('chronology-cycle', () => parseRockRecipe(invalidCycle, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidFractureNode = clone(granite);
invalidFractureNode.fractureHistory.sets[0].chronologyNodeId = 'missing-event';
invalidInputs.push(captureError('dangling-fracture-chronology', () => parseRockRecipe(invalidFractureNode, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidNamespaces = clone(granite);
invalidNamespaces.seedNamespaces.fractures = invalidNamespaces.seedNamespaces.structure;
invalidInputs.push(captureError('duplicate-seed-namespace', () => parseRockRecipe(invalidNamespaces, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidSalt = clone(granite);
invalidSalt.processes = ['salt-weathering'];
invalidSalt.weathering.processes = ['salt-weathering'];
invalidInputs.push(captureError('salt-without-exposure', () => parseRockRecipe(invalidSalt, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidMeta = clone(granite);
invalidMeta.metamorphicFabric = { fabricId: 'gneissic-banding', grade: 'medium', strikeDegrees: 40, dipDegrees: 60, spacingMetres: 0.2 };
invalidInputs.push(captureError('metamorphic-fabric-on-granite', () => parseRockRecipe(invalidMeta, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidOverride = clone(invalidBedding);
invalidOverride.overrides = { allowFantasticalOverride: true, overrideReason: '', author: '' };
invalidInputs.push(captureError('incomplete-fantastical-override', () => parseRockRecipe(invalidOverride, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidProcessLists = clone(granite);
invalidProcessLists.weathering.processes = ['freeze-thaw'];
invalidInputs.push(captureError('process-list-mismatch', () => parseRockRecipe(invalidProcessLists, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidScale = clone(granite);
invalidScale.targetDimensionsMetres = [100, 40, 20];
invalidInputs.push(captureError('scale-dimension-mismatch', () => parseRockRecipe(invalidScale, { catalog }), 'ROCK_RECIPE_INVALID'));
const invalidHost = clone(granite);
invalidHost.hostLithology = 'not-a-lithology';
invalidInputs.push(captureError('unknown-host-lithology', () => parseRockRecipe(invalidHost, { catalog }), 'ROCK_RECIPE_INVALID'));

const explicitOverride = clone(invalidBedding);
explicitOverride.overrides = { allowFantasticalOverride: true, overrideReason: 'Deliberate impossible temple prop.', author: 'contract-test' };
const overrideResult = parseRockRecipe(explicitOverride, { catalog });
check('override.explicit-accepted', overrideResult.warnings.some((warning) => warning.code === 'GEOLOGY_COMBINATION_OVERRIDDEN'));
check('override.never-rewrites-geology', overrideResult.recipe.lithology === 'granite' && overrideResult.recipe.fabrics.includes('thin-bedding'));

const allStageIds = ROCK_COMPILER_STAGES.map((stage) => stage.id);
const isolationExpectation = {
  structure: allStageIds,
  fractures: allStageIds.slice(1),
  weathering: allStageIds.slice(2),
  transport: allStageIds.slice(3),
  denseSource: allStageIds.slice(4),
  renderMesh: ['render-mesh', 'surface-bake', 'style'],
  fallbackMesh: ['fallback-mesh'],
  collision: ['collision'],
  surfaceBake: ['surface-bake', 'style'],
  style: ['style'],
};
const isolationTable = [];
for (const namespace of ROCK_SEED_NAMESPACES) {
  const changed = clone(granite);
  changed.seedNamespaces[namespace] = `${changed.seedNamespaces[namespace]}/isolation-test`;
  const comparison = compareCompilationPlans(granitePlan, planRockCompilation(changed, { catalog }));
  const expected = isolationExpectation[namespace];
  check(`random-isolation.${namespace}`, sameSet(comparison.changedStages, expected), { expected, actual: comparison.changedStages });
  isolationTable.push({ namespace, expectedChangedStages: expected, actualChangedStages: comparison.changedStages, passed: sameSet(comparison.changedStages, expected) });
}

const invalidationCases = [
  { id: 'label', mutate: (recipe) => { recipe.label = 'Metadata-only label'; }, expected: [] },
  { id: 'description', mutate: (recipe) => { recipe.description = `${recipe.description} Metadata-only note.`; }, expected: [] },
  { id: 'formation-id', mutate: (recipe) => { recipe.formationId = 'formation-granite-v2'; }, expected: allStageIds },
  { id: 'target-dimensions', mutate: (recipe) => { recipe.targetDimensionsMetres = [25, 17, 19]; }, expected: allStageIds },
  { id: 'geology-transform', mutate: (recipe) => { recipe.geologyTransform.strikeDegrees = 1; }, expected: allStageIds },
  { id: 'material-density', mutate: (recipe) => { recipe.materialProperties.densityKilogramsPerCubicMetre += 1; }, expected: allStageIds },
  { id: 'fracture-history', mutate: (recipe) => { recipe.fractureHistory.sets[0].spacingMetres += 0.01; }, expected: allStageIds.slice(1) },
  { id: 'weathering', mutate: (recipe) => { recipe.weathering.exposureYears += 1; }, expected: allStageIds.slice(2) },
  { id: 'process-context', mutate: (recipe) => { recipe.processContext.waterRoutingNormalized = 0.1; }, expected: allStageIds.slice(2) },
  { id: 'quality-tier', mutate: (recipe) => { recipe.qualityTier = 'production'; }, expected: allStageIds.slice(4) },
  { id: 'root-seed', mutate: (recipe) => { recipe.seed += 1; }, expected: allStageIds },
];
const invalidationTable = [];
for (const fixture of invalidationCases) {
  const changed = clone(granite);
  fixture.mutate(changed);
  const changedPlan = planRockCompilation(changed, { catalog });
  const comparison = compareCompilationPlans(granitePlan, changedPlan);
  const passed = sameSet(comparison.changedStages, fixture.expected);
  check(`cache-invalidation.${fixture.id}`, passed, { expected: fixture.expected, actual: comparison.changedStages });
  invalidationTable.push({ field: fixture.id, expectedChangedStages: fixture.expected, actualChangedStages: comparison.changedStages, passed });
}
const dimensionRepeatA = planRockCompilation({ ...clone(granite), targetDimensionsMetres: [25, 17, 19] }, { catalog });
const dimensionRepeatB = planRockCompilation({ ...clone(granite), targetDimensionsMetres: [25, 17, 19] }, { catalog });
check('target-dimensions.repeat-identical', dimensionRepeatA.stages.every((stage, index) => stage.stageContentId === dimensionRepeatB.stages[index].stageContentId));
check('target-dimensions.invalidates-all-physical', compareCompilationPlans(granitePlan, dimensionRepeatA).changedStages.length === ROCK_COMPILER_STAGES.filter((stage) => stage.physicalScaleDependent).length);

const dependencyGraph = getRockCompilerDependencyGraph();
for (const [index, stage] of dependencyGraph.stages.entries()) {
  for (const dependency of stage.dependencies) {
    check(`graph.${stage.id}.dependency.${dependency}.topological`, dependencyGraph.stages.findIndex((candidate) => candidate.id === dependency) < index);
  }
}

const cache = new MemoryContentAddressedCache();
let executorCalls = 0;
const executors = Object.fromEntries(ROCK_COMPILER_STAGES.map((stage) => [stage.id, ({ stage: planned, dependencyOutputs }) => {
  executorCalls += 1;
  return { stageId: stage.id, stageContentId: planned.stageContentId, dependencyStageIds: Object.keys(dependencyOutputs) };
}]));
const firstExecution = await executeRockCompilationPlan(granitePlan, executors, { cache });
const callsAfterFirst = executorCalls;
const secondExecution = await executeRockCompilationPlan(granitePlan, executors, { cache });
check('cache.first-run-executes-all', callsAfterFirst === ROCK_COMPILER_STAGES.length, { callsAfterFirst });
check('cache.second-run-executes-none', executorCalls === callsAfterFirst, { executorCalls, callsAfterFirst });
check('cache.second-run-all-hits', secondExecution.events.every((event) => event.status === 'cache-hit'));
check('cache.output-identities-stable', canonicalStringify(firstExecution.outputs) === canonicalStringify(secondExecution.outputs));
const nondeterministicCache = new MemoryContentAddressedCache();
nondeterministicCache.put(granitePlan.stages[0].stageContentId, { result: 1 });
const nondeterminism = captureError('nondeterministic-stage-output', () => nondeterministicCache.put(granitePlan.stages[0].stageContentId, { result: 2 }), 'NONDETERMINISTIC_STAGE_OUTPUT');
invalidInputs.push(nondeterminism);

const plannedManifest = createPlannedArtifactManifest(granite, granitePlan, { catalog });
check('manifest.planned-valid', validateArtifactManifest(plannedManifest) === true);
check('manifest.roles-complete', plannedManifest.outputs.length === 15 && plannedManifest.outputs.every((output) => output.status === 'planned'));
const generatedOutputs = plannedManifest.outputs.map((output, index) => ({
  role: output.role,
  contentId: contentId({ role: output.role, fixture: 'checkpoint-2' }),
  relativePath: `outputs/${String(index).padStart(2, '0')}-${output.role}.${output.mediaType === 'image/png' ? 'png' : 'bin'}`,
  byteLength: 1024 + index,
}));
const completeManifest = finalizeArtifactManifest(plannedManifest, generatedOutputs, granite.targetDimensionsMetres);
check('manifest.complete-valid', validateArtifactManifest(completeManifest, { requireComplete: true }) === true);
invalidInputs.push(captureError('unsafe-artifact-path', () => finalizeArtifactManifest(
  plannedManifest,
  generatedOutputs.map((output, index) => index === 0 ? { ...output, relativePath: '../escape.bin' } : output),
  granite.targetDimensionsMetres,
), 'ARTIFACT_MANIFEST_INVALID'));

const familyPlan = planOfflineRecipeSelection({ family: 'sedimentary' }, { catalog });
const allPlanA = planOfflineRecipeSelection({ all: true }, { catalog });
const allPlanB = planOfflineRecipeSelection({ all: true }, { catalog });
check('harness.family-count', familyPlan.index.count === 26, { count: familyPlan.index.count });
check('harness.all-count', allPlanA.index.count === 65, { count: allPlanA.index.count });
check('harness.all-repeat-index', allPlanA.index.indexContentId === allPlanB.index.indexContentId);
const allByLithology = new Map(allPlanA.index.recipes.map((record) => [record.lithology, record]));
check('harness.subset-identities-stable', familyPlan.index.recipes.every((record) => record.recipeContentId === allByLithology.get(record.lithology)?.recipeContentId));

let mutationRejected = false;
try {
  granitePlan.stages[0].inputs.formationId = 'mutated';
} catch {
  mutationRejected = true;
}
check('immutability.plan-mutation-rejected', mutationRejected && granitePlan.stages[0].inputs.formationId === granite.formationId);

const cliAudit = runCliAudit(granite);
for (const run of cliAudit.runs) check(`cli.${run.scope}.exit-zero`, run.status === 0, { status: run.status, stderr: run.stderr });
check('cli.one-count', cliAudit.runs.find((run) => run.scope === 'one').summary?.count === 1);
check('cli.family-count', cliAudit.runs.find((run) => run.scope === 'family').summary?.count === 26);
check('cli.all-count', cliAudit.runs.find((run) => run.scope === 'all').summary?.count === 65);
check('cli.all-repeat-index', cliAudit.allRepeatMatches === true, cliAudit);

const result = canonicalizeJson({
  schema: 'toonlab/rock-geology-v2-contract-verification',
  version: 1,
  status: failures.length === 0 ? 'candidate-awaiting-developer-approval' : 'failed',
  passed: failures.length === 0,
  counts: {
    checks: checks.length,
    failures: failures.length,
    lithologies: catalog.ontology.lithologies.length,
    heroRecipes: heroRecords.length,
    stages: ROCK_COMPILER_STAGES.length,
    seedNamespaces: ROCK_SEED_NAMESPACES.length,
    invalidFixtures: invalidInputs.length,
    manifestRoles: artifactOutputSpecifications().length,
    cliScopes: cliAudit.runs.length,
  },
  classCounts,
  compilerStages: ROCK_COMPILER_STAGES.map((stage) => stage.id),
  failures,
  checks,
});

if (outputDirectory) writeEvidence();

console.log(JSON.stringify({
  passed: result.passed,
  status: result.status,
  counts: result.counts,
  classCounts: result.classCounts,
  failures: result.failures,
}, null, 2));
if (!result.passed) process.exitCode = 1;

function runCliAudit(recipe) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toonlab-rock-c2-cli-'));
  const recipePath = path.join(temporaryRoot, 'granite.json');
  fs.writeFileSync(recipePath, serializeRockRecipe(recipe, { catalog, pretty: true }));
  const cases = [
    { scope: 'one', args: ['--recipe', recipePath] },
    { scope: 'family', args: ['--family', 'sedimentary'] },
    { scope: 'all', args: ['--all'] },
  ];
  const runs = cases.map((fixture) => {
    const output = path.join(temporaryRoot, fixture.scope);
    const executed = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/plan-rock-geology-v2.mjs'), ...fixture.args, '--output', output], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    let summary = null;
    try {
      summary = JSON.parse(executed.stdout);
    } catch {}
    return {
      scope: fixture.scope,
      command: `node scripts/plan-rock-geology-v2.mjs ${fixture.scope === 'one' ? '--recipe <granite-v1.json>' : fixture.scope === 'family' ? '--family sedimentary' : '--all'} --output <temporary-output>`,
      status: executed.status,
      stdout: executed.stdout.replaceAll(temporaryRoot, '<temporary-output>'),
      stderr: executed.stderr.replaceAll(temporaryRoot, '<temporary-output>'),
      summary,
      index: executed.status === 0 ? JSON.parse(fs.readFileSync(path.join(output, 'index.json'), 'utf8')) : null,
    };
  });
  const repeatOutput = path.join(temporaryRoot, 'all-repeat');
  const repeat = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts/plan-rock-geology-v2.mjs'), '--all', '--output', repeatOutput], { cwd: repositoryRoot, encoding: 'utf8' });
  const allIndex = runs.find((run) => run.scope === 'all')?.index;
  const repeatIndex = repeat.status === 0 ? JSON.parse(fs.readFileSync(path.join(repeatOutput, 'index.json'), 'utf8')) : null;
  return canonicalizeJson({
    runs,
    repeatStatus: repeat.status,
    allRepeatMatches: allIndex?.indexContentId === repeatIndex?.indexContentId,
    allIndexContentId: allIndex?.indexContentId ?? null,
    repeatIndexContentId: repeatIndex?.indexContentId ?? null,
  });
}

function writeEvidence() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.join(outputDirectory, 'migration'), { recursive: true });
  fs.mkdirSync(path.join(outputDirectory, 'invalid-inputs'), { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'automated-results.json'), `${canonicalStringify(result, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'hero-recipe-hashes.json'), `${canonicalStringify(heroRecords, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'random-isolation-table.json'), `${canonicalStringify(isolationTable, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'cache-invalidation-table.json'), `${canonicalStringify(invalidationTable, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'invalid-input-results.json'), `${canonicalStringify(invalidInputs, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'migration/v0-granite.json'), `${canonicalStringify(draftV0, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'migration/v1-granite.json'), `${canonicalStringify(migration.recipe, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'migration/result.json'), `${canonicalStringify({
    sourceVersion: migration.sourceVersion,
    targetVersion: migration.targetVersion,
    sourceContentId: migration.sourceContentId,
    targetContentId: migration.targetContentId,
    migrations: migration.migrations,
    warnings: migration.warnings,
    targetMatchesCanonicalV1: canonicalStringify(migration.recipe) === canonicalStringify(granite),
  }, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'dependency-graph.json'), `${canonicalStringify(dependencyGraph, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'dependency-graph.mmd'), `${renderDependencyMermaid(dependencyGraph)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'dependency-graph.svg'), `${renderDependencySvg(dependencyGraph)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'planned-manifest-example.json'), `${canonicalStringify(plannedManifest, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'complete-manifest-fixture.json'), `${canonicalStringify(completeManifest, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'cli-results.json'), `${canonicalStringify(cliAudit, { pretty: true })}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'cli-transcript.txt'), cliAudit.runs.map((run) => [
    `$ ${run.command}`,
    run.stdout.trim(),
    run.stderr.trim(),
  ].filter(Boolean).join('\n')).join('\n\n'));
  fs.writeFileSync(path.join(outputDirectory, 'schema-api-review.json'), `${canonicalStringify({
    recipeSchema: path.relative(repositoryRoot, schemaPath),
    manifestSchema: path.relative(repositoryRoot, manifestSchemaPath),
    recipeSchemaId: recipeSchema.$id,
    recipeRequiredFields: recipeSchema.required,
    strictUnknownFields: recipeSchema.additionalProperties === false,
    units: ['metre', 'degree', 'year', 'kilogram-per-cubic-metre', 'square-metre'],
    compilerStages: ROCK_COMPILER_STAGES,
    manifestRoles: artifactOutputSpecifications(),
    publicPackageExportAdded: false,
    checkpointBoundary: 'contract-plan-only; no geometry, bake, or realism claim',
  }, { pretty: true })}\n`);
}

function renderDependencyMermaid(graph) {
  const lines = ['flowchart LR'];
  for (const stage of graph.stages) lines.push(`  ${stage.id.replaceAll('-', '_')}["${stage.id}"]`);
  for (const stage of graph.stages) {
    for (const dependency of stage.dependencies) lines.push(`  ${dependency.replaceAll('-', '_')} --> ${stage.id.replaceAll('-', '_')}`);
  }
  return lines.join('\n');
}

function renderDependencySvg(graph) {
  const positions = Object.fromEntries(graph.stages.map((stage, index) => [stage.id, {
    x: 70 + (index % 5) * 235,
    y: 160 + Math.floor(index / 5) * 230,
  }]));
  const lines = [];
  for (const stage of graph.stages) {
    for (const dependency of stage.dependencies) {
      const from = positions[dependency];
      const to = positions[stage.id];
      lines.push(`<path d="M ${from.x + 170} ${from.y + 36} C ${from.x + 200} ${from.y + 36}, ${to.x - 30} ${to.y + 36}, ${to.x} ${to.y + 36}" fill="none" stroke="#6f84a8" stroke-width="3" marker-end="url(#arrow)"/>`);
    }
  }
  const nodes = graph.stages.map((stage) => {
    const point = positions[stage.id];
    const seeds = stage.seedNamespaces.join(', ');
    return `<g><rect x="${point.x}" y="${point.y}" width="170" height="72" rx="12" fill="#1d2a42" stroke="#64d29a" stroke-width="2"/><text x="${point.x + 85}" y="${point.y + 28}" text-anchor="middle" class="node">${stage.id}</text><text x="${point.x + 85}" y="${point.y + 50}" text-anchor="middle" class="seed">seed: ${seeds}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="560" viewBox="0 0 1240 560"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6f84a8"/></marker></defs><rect width="100%" height="100%" fill="#0d1422"/><style>.title{font:700 24px system-ui;fill:#f4f7fb}.sub{font:14px system-ui;fill:#9eb0c9}.node{font:700 14px ui-monospace,monospace;fill:#f4f7fb}.seed{font:11px ui-monospace,monospace;fill:#a9bdd7}</style><text x="44" y="48" class="title">Rock geology v2 compiler dependency graph</text><text x="44" y="75" class="sub">Immutable stage inputs · SHA-256 identities · dependencies propagate invalidation only downstream</text>${lines.join('')}${nodes}</svg>`;
}
