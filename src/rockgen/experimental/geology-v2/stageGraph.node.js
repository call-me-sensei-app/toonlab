import {
  canonicalizeJson,
  contentId,
  deriveNamespacedSeed,
} from './canonical.node.js';
import { RockGeologyError } from './errors.js';
import { parseRockRecipe } from './recipe.node.js';

export const ROCK_COMPILER_SCHEMA = 'toonlab/rock-geology-compiler-plan';
export const ROCK_COMPILER_VERSION = '2.0.0-contract.1';

export const ROCK_COMPILER_STAGES = Object.freeze([
  Object.freeze({
    id: 'structure-field',
    version: 1,
    dependencies: Object.freeze([]),
    seedNamespaces: Object.freeze(['structure']),
    recipeFields: Object.freeze([
      'formationId', 'hostLithology', 'lithology', 'fabrics', 'scale',
      'targetDimensionsMetres', 'geologyTransform', 'materialProperties',
      'chronology', 'depositionalHistory', 'metamorphicFabric',
    ]),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'fracture-network',
    version: 1,
    dependencies: Object.freeze(['structure-field']),
    seedNamespaces: Object.freeze(['fractures']),
    recipeFields: Object.freeze(['fractureHistory']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'weathering-field',
    version: 1,
    dependencies: Object.freeze(['structure-field', 'fracture-network']),
    seedNamespaces: Object.freeze(['weathering']),
    recipeFields: Object.freeze(['processes', 'environment', 'weathering', 'materialProperties', 'processContext']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'stability-transport',
    version: 1,
    dependencies: Object.freeze(['structure-field', 'fracture-network', 'weathering-field']),
    seedNamespaces: Object.freeze(['transport']),
    recipeFields: Object.freeze(['landform', 'processes', 'processContext', 'targetDimensionsMetres']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'dense-source',
    version: 1,
    dependencies: Object.freeze(['structure-field', 'fracture-network', 'weathering-field', 'stability-transport']),
    seedNamespaces: Object.freeze(['denseSource']),
    recipeFields: Object.freeze(['qualityTier', 'targetDimensionsMetres']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'render-mesh',
    version: 1,
    dependencies: Object.freeze(['dense-source']),
    seedNamespaces: Object.freeze(['renderMesh']),
    recipeFields: Object.freeze(['qualityTier', 'targetDimensionsMetres']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'fallback-mesh',
    version: 1,
    dependencies: Object.freeze(['dense-source']),
    seedNamespaces: Object.freeze(['fallbackMesh']),
    recipeFields: Object.freeze(['qualityTier', 'targetDimensionsMetres']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'collision',
    version: 1,
    dependencies: Object.freeze(['dense-source']),
    seedNamespaces: Object.freeze(['collision']),
    recipeFields: Object.freeze(['qualityTier', 'targetDimensionsMetres']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'surface-bake',
    version: 1,
    dependencies: Object.freeze(['dense-source', 'render-mesh']),
    seedNamespaces: Object.freeze(['surfaceBake']),
    recipeFields: Object.freeze(['materialProperties', 'qualityTier', 'targetDimensionsMetres']),
    physicalScaleDependent: true,
  }),
  Object.freeze({
    id: 'style',
    version: 1,
    dependencies: Object.freeze(['render-mesh', 'surface-bake']),
    seedNamespaces: Object.freeze(['style']),
    recipeFields: Object.freeze(['qualityTier']),
    physicalScaleDependent: true,
  }),
]);

const STAGE_BY_ID = new Map(ROCK_COMPILER_STAGES.map((stage) => [stage.id, stage]));

export function planRockCompilation(recipeValue, options = {}) {
  const parsed = parseRockRecipe(recipeValue, options);
  const compilerVersion = options.compilerVersion ?? ROCK_COMPILER_VERSION;
  if (typeof compilerVersion !== 'string' || compilerVersion.trim().length === 0) {
    throw new RockGeologyError('COMPILER_VERSION_INVALID', 'Compiler version must be a non-empty string.', {
      path: '$.compilerVersion',
      suggestion: 'Use the frozen compiler version or an explicit versioned experimental implementation identifier.',
    });
  }
  const planned = [];
  const keyByStage = new Map();
  for (const stage of ROCK_COMPILER_STAGES) {
    const inputs = Object.fromEntries(stage.recipeFields.map((field) => [field, parsed.recipe[field]]));
    const dependencies = Object.fromEntries(stage.dependencies.map((id) => [id, keyByStage.get(id)]));
    const randomStreams = Object.fromEntries(stage.seedNamespaces.map((name) => [name, {
      namespace: parsed.recipe.seedNamespaces[name],
      seed: deriveNamespacedSeed(parsed.recipe.seed, parsed.recipe.seedNamespaces[name]),
    }]));
    const keyInput = {
      schema: 'toonlab/rock-geology-stage-key',
      version: 1,
      compilerVersion,
      stage: { id: stage.id, version: stage.version },
      dependencies,
      inputs,
      randomStreams,
    };
    const stageContentId = contentId(keyInput);
    keyByStage.set(stage.id, stageContentId);
    planned.push({
      id: stage.id,
      version: stage.version,
      stageContentId,
      dependencies,
      inputs,
      randomStreams,
      physicalScaleDependent: stage.physicalScaleDependent,
    });
  }
  return canonicalizeJson({
    schema: ROCK_COMPILER_SCHEMA,
    version: 1,
    compilerVersion,
    recipeId: parsed.recipe.id,
    recipeContentId: parsed.contentId,
    qualityTier: parsed.recipe.qualityTier,
    targetDimensionsMetres: parsed.recipe.targetDimensionsMetres,
    warnings: parsed.warnings,
    stages: planned,
  });
}

export function compareCompilationPlans(before, after) {
  assertPlan(before);
  assertPlan(after);
  const beforeById = new Map(before.stages.map((stage) => [stage.id, stage]));
  return canonicalizeJson({
    changedStages: after.stages.filter((stage) => beforeById.get(stage.id)?.stageContentId !== stage.stageContentId).map((stage) => stage.id),
    unchangedStages: after.stages.filter((stage) => beforeById.get(stage.id)?.stageContentId === stage.stageContentId).map((stage) => stage.id),
  });
}

export async function executeRockCompilationPlan(plan, executors, options = {}) {
  assertPlan(plan);
  const cache = options.cache ?? new MemoryContentAddressedCache();
  const signal = options.signal ?? null;
  assertAbortSignal(signal);
  throwIfCompilationCancelled(signal, null, 'before-execution');
  const outputs = new Map();
  const events = [];
  for (const stage of plan.stages) {
    throwIfCompilationCancelled(signal, stage.id, 'before-stage');
    const cached = cache.get(stage.stageContentId);
    if (cached) {
      outputs.set(stage.id, cached.output);
      events.push({ stageId: stage.id, status: 'cache-hit', outputContentId: cached.outputContentId });
      continue;
    }
    const executor = executors?.[stage.id];
    if (typeof executor !== 'function') {
      throw new RockGeologyError('STAGE_EXECUTOR_MISSING', `No executor was supplied for stage “${stage.id}”.`, {
        path: `$.stages.${stage.id}`,
        suggestion: 'Register the checkpoint implementation for every planned stage before execution.',
      });
    }
    const dependencyOutputs = Object.fromEntries(
      Object.keys(stage.dependencies).map((dependency) => [dependency, outputs.get(dependency)]),
    );
    let output;
    try {
      output = await executor(Object.freeze({
        stage,
        inputs: stage.inputs,
        randomStreams: stage.randomStreams,
        dependencyOutputs: canonicalizeJson(dependencyOutputs),
        signal,
      }));
    } catch (error) {
      if (signal?.aborted) {
        throw compilationCancelledError(signal, stage.id, 'during-stage', error);
      }
      throw error;
    }
    // A cooperative executor may return after observing cancellation. Never
    // publish that partial result into the content-addressed cache.
    throwIfCompilationCancelled(signal, stage.id, 'after-stage-before-cache');
    const record = cache.put(stage.stageContentId, output);
    outputs.set(stage.id, record.output);
    events.push({ stageId: stage.id, status: 'executed', outputContentId: record.outputContentId });
  }
  return canonicalizeJson({
    recipeContentId: plan.recipeContentId,
    finalStageContentId: plan.stages.at(-1).stageContentId,
    events,
    outputs: Object.fromEntries(outputs),
  });
}

function assertAbortSignal(signal) {
  if (signal === null) return;
  if (typeof signal !== 'object'
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function') {
    throw new TypeError('Compilation signal must be an AbortSignal.');
  }
}

function compilationCancelledError(signal, stageId, phase, cause = null) {
  return new RockGeologyError('COMPILATION_CANCELLED', 'Rock compilation was cancelled.', {
    cause: cause ?? (signal?.reason instanceof Error ? signal.reason : null),
    path: stageId ? `$.stages.${stageId}` : '$.stages',
    suggestion: 'Restart from the same immutable plan; completed stage cache entries remain reusable.',
    details: { phase, stageId },
  });
}

function throwIfCompilationCancelled(signal, stageId, phase) {
  if (signal?.aborted) throw compilationCancelledError(signal, stageId, phase);
}

export class MemoryContentAddressedCache {
  #records = new Map();

  get size() {
    return this.#records.size;
  }

  has(stageContentId) {
    return this.#records.has(stageContentId);
  }

  get(stageContentId) {
    return this.#records.get(stageContentId) ?? null;
  }

  put(stageContentId, output) {
    assertContentId(stageContentId, '$.stageContentId');
    const immutableOutput = canonicalizeJson(output);
    const outputContentId = contentId(immutableOutput);
    const prior = this.#records.get(stageContentId);
    if (prior && prior.outputContentId !== outputContentId) {
      throw new RockGeologyError('NONDETERMINISTIC_STAGE_OUTPUT', 'A stage content identity produced two different output identities.', {
        path: '$.output',
        suggestion: 'Audit undeclared inputs, global randomness, platform variance, and concurrency ordering.',
        details: { stageContentId, priorOutputContentId: prior.outputContentId, outputContentId },
      });
    }
    const record = canonicalizeJson({ stageContentId, outputContentId, output: immutableOutput });
    this.#records.set(stageContentId, record);
    return record;
  }
}

export function getRockCompilerDependencyGraph() {
  return canonicalizeJson({
    schema: 'toonlab/rock-geology-stage-graph',
    version: 1,
    compilerVersion: ROCK_COMPILER_VERSION,
    stages: ROCK_COMPILER_STAGES,
  });
}

export function stageDefinition(stageId) {
  return STAGE_BY_ID.get(stageId) ?? null;
}

function assertPlan(plan) {
  if (plan?.schema !== ROCK_COMPILER_SCHEMA || plan?.version !== 1 || !Array.isArray(plan?.stages)) {
    throw new RockGeologyError('COMPILER_PLAN_INVALID', 'Compiler plan does not match the checkpoint-2 contract.', {
      path: '$',
      suggestion: 'Create the plan with planRockCompilation.',
    });
  }
  if (typeof plan.compilerVersion !== 'string' || plan.compilerVersion.length === 0) {
    throw new RockGeologyError('COMPILER_VERSION_INVALID', 'Compiler plan has no valid compiler version.', {
      path: '$.compilerVersion',
      suggestion: 'Create the plan with planRockCompilation.',
    });
  }
  if (plan.stages.length !== ROCK_COMPILER_STAGES.length) {
    throw new RockGeologyError('COMPILER_STAGE_COUNT_INVALID', 'Compiler plan does not contain the exact frozen stage set.', {
      path: '$.stages',
      suggestion: 'Recreate the plan with the current compiler contract.',
      details: { expected: ROCK_COMPILER_STAGES.length, received: plan.stages.length },
    });
  }
  const precedingKeys = new Map();
  for (const [index, expected] of ROCK_COMPILER_STAGES.entries()) {
    const stage = plan.stages[index];
    if (stage?.id !== expected.id) {
      throw new RockGeologyError('COMPILER_STAGE_ORDER_INVALID', 'Compiler stages are missing or out of topological order.', {
        path: `$.stages[${index}]`,
        suggestion: 'Use the immutable plan returned by planRockCompilation.',
      });
    }
    assertContentId(stage.stageContentId, `$.stages[${index}].stageContentId`);
    const dependencyIds = Object.keys(stage.dependencies ?? {});
    if (dependencyIds.length !== expected.dependencies.length
      || dependencyIds.some((dependency) => !expected.dependencies.includes(dependency))
      || expected.dependencies.some((dependency) => stage.dependencies[dependency] !== precedingKeys.get(dependency))) {
      throw new RockGeologyError('COMPILER_STAGE_DEPENDENCIES_INVALID', 'Compiler stage dependencies do not match the frozen graph.', {
        path: `$.stages[${index}].dependencies`,
        suggestion: 'Recreate the plan with planRockCompilation.',
        details: { expected: expected.dependencies, received: dependencyIds },
      });
    }
    precedingKeys.set(stage.id, stage.stageContentId);
  }
}

function assertContentId(value, path) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new RockGeologyError('CONTENT_ID_INVALID', 'Content identity must be a lowercase SHA-256 identifier.', {
      path,
      suggestion: 'Use the contentId helper over canonical input.',
      details: { received: value },
    });
  }
}
