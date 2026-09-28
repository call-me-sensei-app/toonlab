import { canonicalizeJson, contentId } from './canonical.node.js';
import { loadGeologyCatalog } from './catalog.node.js';
import { RockGeologyError } from './errors.js';
import { parseRockRecipe } from './recipe.node.js';
import { ROCK_COMPILER_SCHEMA } from './stageGraph.node.js';

export const ROCK_ARTIFACT_MANIFEST_SCHEMA = 'toonlab/rock-geology-artifact-manifest';
export const ROCK_ARTIFACT_MANIFEST_VERSION = 1;

const OUTPUT_SPECS = Object.freeze([
  Object.freeze({ role: 'dense-source', stageId: 'dense-source', mediaType: 'application/vnd.toonlab.rock-dense-source+bin' }),
  Object.freeze({ role: 'render-mesh', stageId: 'render-mesh', mediaType: 'model/gltf-binary' }),
  Object.freeze({ role: 'fallback-lod-1', stageId: 'fallback-mesh', mediaType: 'model/gltf-binary' }),
  Object.freeze({ role: 'fallback-lod-2', stageId: 'fallback-mesh', mediaType: 'model/gltf-binary' }),
  Object.freeze({ role: 'fallback-lod-3', stageId: 'fallback-mesh', mediaType: 'model/gltf-binary' }),
  Object.freeze({ role: 'collision', stageId: 'collision', mediaType: 'model/gltf-binary' }),
  Object.freeze({ role: 'bake-base-color', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-normal', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-roughness', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-ambient-occlusion', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-height', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-material-id-mask', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-fracture-mask', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'bake-weathering-mask', stageId: 'surface-bake', mediaType: 'image/png' }),
  Object.freeze({ role: 'style', stageId: 'style', mediaType: 'application/vnd.toonlab.rock-style+json' }),
]);

export function createPlannedArtifactManifest(recipeValue, plan, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const parsed = parseRockRecipe(recipeValue, { ...options, catalog });
  assertPlanMatchesRecipe(plan, parsed);
  const stageById = new Map(plan.stages.map((stage) => [stage.id, stage]));
  const scaleContract = catalog.ontology.scaleContract;
  const base = {
    schema: ROCK_ARTIFACT_MANIFEST_SCHEMA,
    version: ROCK_ARTIFACT_MANIFEST_VERSION,
    status: 'planned',
    compilerVersion: plan.compilerVersion,
    recipe: {
      id: parsed.recipe.id,
      contentId: parsed.contentId,
      formationId: parsed.recipe.formationId,
      lithology: parsed.recipe.lithology,
      qualityTier: parsed.recipe.qualityTier,
      targetDimensionsMetres: parsed.recipe.targetDimensionsMetres,
      generatedDimensionsMetres: null,
      lengthUnit: 'metre',
    },
    qualification: {
      physicalityClaim: parsed.recipe.overrides.allowFantasticalOverride ? 'non-physical-art-directed' : 'geology-constrained',
      neutralRealismStatus: 'not-validated',
      topologyStatus: 'not-validated',
      bakeStatus: 'not-generated',
      runtimeScaleEnvelope: scaleContract.uniformRuntimeScaleEnvelope,
      maximumRuntimeAxisRatio: scaleContract.maximumRuntimeAxisRatio,
      outsideEnvelopeAction: scaleContract.outsideEnvelope,
    },
    outputs: OUTPUT_SPECS.map((spec) => ({
      ...spec,
      sourceStageContentId: stageById.get(spec.stageId).stageContentId,
      status: 'planned',
      contentId: null,
      relativePath: null,
      byteLength: null,
    })),
  };
  return withManifestIdentity(base);
}

export function finalizeArtifactManifest(plannedManifest, generatedOutputs, generatedDimensionsMetres) {
  validateArtifactManifest(plannedManifest, { requireComplete: false });
  const supplied = new Map(generatedOutputs.map((output) => [output.role, output]));
  const expectedRoles = new Set(OUTPUT_SPECS.map((spec) => spec.role));
  const unknown = [...supplied.keys()].filter((role) => !expectedRoles.has(role));
  const missing = [...expectedRoles].filter((role) => !supplied.has(role));
  if (unknown.length > 0 || missing.length > 0 || supplied.size !== generatedOutputs.length) {
    throw new RockGeologyError('ARTIFACT_SET_INVALID', 'Generated artifact set does not match the manifest contract.', {
      path: '$.outputs',
      suggestion: 'Provide exactly one artifact for every required output role.',
      details: { missing, unknown, suppliedCount: generatedOutputs.length, uniqueCount: supplied.size },
    });
  }
  assertDimensions(generatedDimensionsMetres, '$.recipe.generatedDimensionsMetres');
  const outputs = plannedManifest.outputs.map((planned) => {
    const generated = supplied.get(planned.role);
    const record = {
      ...planned,
      status: 'generated',
      contentId: generated.contentId,
      relativePath: generated.relativePath,
      byteLength: generated.byteLength,
    };
    validateArtifactRecord(record, '$.outputs');
    return record;
  });
  const base = {
    ...withoutManifestIdentity(plannedManifest),
    status: 'complete',
    recipe: { ...plannedManifest.recipe, generatedDimensionsMetres },
    qualification: {
      ...plannedManifest.qualification,
      bakeStatus: 'generated-unvalidated',
    },
    outputs,
  };
  const complete = withManifestIdentity(base);
  validateArtifactManifest(complete, { requireComplete: true });
  return complete;
}

export function validateArtifactManifest(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) manifestError('$', 'Manifest must be a plain object.');
  exactKeys(manifest, ['schema', 'version', 'status', 'compilerVersion', 'recipe', 'qualification', 'outputs', 'manifestContentId'], '$');
  if (manifest.schema !== ROCK_ARTIFACT_MANIFEST_SCHEMA || manifest.version !== ROCK_ARTIFACT_MANIFEST_VERSION) manifestError('$.schema', 'Manifest schema/version is unsupported.');
  if (!['planned', 'complete'].includes(manifest.status)) manifestError('$.status', 'Manifest status must be planned or complete.');
  if (options.requireComplete && manifest.status !== 'complete') manifestError('$.status', 'A complete artifact manifest is required.');
  assertContentId(manifest.manifestContentId, '$.manifestContentId');
  const recalculated = contentId(withoutManifestIdentity(manifest));
  if (recalculated !== manifest.manifestContentId) manifestError('$.manifestContentId', 'Manifest content identity does not match its canonical payload.', { expected: recalculated, received: manifest.manifestContentId });

  exactKeys(manifest.recipe, ['id', 'contentId', 'formationId', 'lithology', 'qualityTier', 'targetDimensionsMetres', 'generatedDimensionsMetres', 'lengthUnit'], '$.recipe');
  assertContentId(manifest.recipe.contentId, '$.recipe.contentId');
  assertDimensions(manifest.recipe.targetDimensionsMetres, '$.recipe.targetDimensionsMetres');
  if (manifest.recipe.generatedDimensionsMetres !== null) assertDimensions(manifest.recipe.generatedDimensionsMetres, '$.recipe.generatedDimensionsMetres');
  if (manifest.recipe.lengthUnit !== 'metre') manifestError('$.recipe.lengthUnit', 'Length unit must be metre.');

  exactKeys(manifest.qualification, ['physicalityClaim', 'neutralRealismStatus', 'topologyStatus', 'bakeStatus', 'runtimeScaleEnvelope', 'maximumRuntimeAxisRatio', 'outsideEnvelopeAction'], '$.qualification');
  if (!['geology-constrained', 'non-physical-art-directed'].includes(manifest.qualification.physicalityClaim)) manifestError('$.qualification.physicalityClaim', 'Physicality claim is unsupported.');
  if (!Array.isArray(manifest.qualification.runtimeScaleEnvelope)
    || manifest.qualification.runtimeScaleEnvelope.length !== 2
    || manifest.qualification.runtimeScaleEnvelope.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    || manifest.qualification.runtimeScaleEnvelope[0] > manifest.qualification.runtimeScaleEnvelope[1]) manifestError('$.qualification.runtimeScaleEnvelope', 'Runtime scale envelope must be two ordered positive numbers.');
  if (typeof manifest.qualification.maximumRuntimeAxisRatio !== 'number' || !Number.isFinite(manifest.qualification.maximumRuntimeAxisRatio) || manifest.qualification.maximumRuntimeAxisRatio < 1) manifestError('$.qualification.maximumRuntimeAxisRatio', 'Maximum runtime axis ratio must be finite and at least 1.');
  if (manifest.qualification.outsideEnvelopeAction !== 'recompile-and-rebake') manifestError('$.qualification.outsideEnvelopeAction', 'Outside-envelope action must be recompile-and-rebake.');
  if (manifest.status === 'planned' && manifest.recipe.generatedDimensionsMetres !== null) manifestError('$.recipe.generatedDimensionsMetres', 'Planned manifests cannot claim generated dimensions.');
  if (manifest.status === 'complete' && manifest.recipe.generatedDimensionsMetres === null) manifestError('$.recipe.generatedDimensionsMetres', 'Complete manifests require measured generated dimensions.');
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length !== OUTPUT_SPECS.length) manifestError('$.outputs', `Manifest must contain exactly ${OUTPUT_SPECS.length} artifact records.`);
  const byRole = new Map(manifest.outputs.map((output) => [output.role, output]));
  if (byRole.size !== manifest.outputs.length) manifestError('$.outputs', 'Artifact roles must be unique.');
  for (const spec of OUTPUT_SPECS) {
    const record = byRole.get(spec.role);
    if (!record) manifestError('$.outputs', `Artifact role ${spec.role} is missing.`);
    if (record.stageId !== spec.stageId || record.mediaType !== spec.mediaType) manifestError('$.outputs', `Artifact role ${spec.role} has incorrect stage or media type.`);
    validateArtifactRecord(record, `$.outputs.${spec.role}`);
    if (manifest.status === 'complete' && record.status !== 'generated') manifestError(`$.outputs.${spec.role}.status`, 'Complete manifests require generated artifacts.');
  }
  return true;
}

export function artifactOutputSpecifications() {
  return OUTPUT_SPECS;
}

function withManifestIdentity(base) {
  const canonicalBase = canonicalizeJson(base);
  return canonicalizeJson({ ...canonicalBase, manifestContentId: contentId(canonicalBase) });
}

function withoutManifestIdentity(manifest) {
  const { manifestContentId: _ignored, ...base } = manifest;
  return base;
}

function validateArtifactRecord(record, path) {
  exactKeys(record, ['role', 'stageId', 'mediaType', 'sourceStageContentId', 'status', 'contentId', 'relativePath', 'byteLength'], path);
  assertContentId(record.sourceStageContentId, `${path}.sourceStageContentId`);
  if (!['planned', 'generated'].includes(record.status)) manifestError(`${path}.status`, 'Artifact status must be planned or generated.');
  if (record.status === 'planned') {
    if (record.contentId !== null || record.relativePath !== null || record.byteLength !== null) manifestError(path, 'Planned artifacts must not claim generated hash, path, or byte length.');
  } else {
    assertContentId(record.contentId, `${path}.contentId`);
    if (!isSafeRelativePath(record.relativePath)) manifestError(`${path}.relativePath`, 'Generated artifact path must be a safe forward-slash relative path.');
    if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 1) manifestError(`${path}.byteLength`, 'Generated artifact byte length must be a positive safe integer.');
  }
}

function assertPlanMatchesRecipe(plan, parsed) {
  if (plan?.schema !== ROCK_COMPILER_SCHEMA || plan?.recipeContentId !== parsed.contentId) {
    throw new RockGeologyError('PLAN_RECIPE_MISMATCH', 'Compiler plan was not created from the supplied RockRecipe content.', {
      path: '$.recipeContentId',
      suggestion: 'Re-plan after every recipe change, including target-dimension changes.',
      details: { planRecipeContentId: plan?.recipeContentId ?? null, recipeContentId: parsed.contentId },
    });
  }
}

function assertDimensions(value, path) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item) || item <= 0)) manifestError(path, 'Dimensions must be three finite positive values in metres.');
}

function assertContentId(value, path) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) manifestError(path, 'Expected a lowercase SHA-256 content identity.');
}

function exactKeys(value, expected, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) manifestError(path, 'Expected an object.');
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unknown = Object.keys(value).filter((key) => !expected.includes(key));
  if (missing.length > 0 || unknown.length > 0) manifestError(path, 'Object field set does not match the manifest schema.', { missing, unknown });
}

function isSafeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').includes('..');
}

function manifestError(path, message, details = {}) {
  throw new RockGeologyError('ARTIFACT_MANIFEST_INVALID', message, {
    path,
    suggestion: 'Recreate the manifest through the versioned manifest helpers; do not repair it implicitly.',
    details,
  });
}
