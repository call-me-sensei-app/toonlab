import { canonicalizeJson, contentId } from './canonical.node.js';
import { RockGeologyError } from './errors.js';
import {
  ROCK_RECIPE_SCHEMA,
  ROCK_RECIPE_VERSION,
  parseRockRecipe,
} from './recipe.node.js';

export const ROCK_RECIPE_DRAFT_SCHEMA = 'toonlab/rock-geology-recipe-draft';

const V1_RENAMED_FIELDS = new Set([
  'targetDimensionsMetres', 'geologyTransform', 'qualityTier', 'seedNamespaces',
]);
const V0_FIELDS = Object.freeze([
  'schema', 'version', 'id', 'label', 'description', 'formationId', 'hostLithology',
  'lithology', 'fabrics', 'processes', 'environment', 'landform', 'scale',
  'dimensionsMetres', 'transform', 'materialProperties', 'chronology',
  'depositionalHistory', 'metamorphicFabric', 'fractureHistory', 'weathering',
  'processContext', 'quality', 'seed', 'seedStreams', 'overrides',
]);

export function migrateRockRecipe(value, options = {}) {
  if (value?.schema === ROCK_RECIPE_SCHEMA && value?.version === ROCK_RECIPE_VERSION) {
    const parsed = parseRockRecipe(value, options);
    return Object.freeze({
      recipe: parsed.recipe,
      sourceVersion: ROCK_RECIPE_VERSION,
      targetVersion: ROCK_RECIPE_VERSION,
      sourceContentId: parsed.contentId,
      targetContentId: parsed.contentId,
      migrations: Object.freeze([]),
      warnings: parsed.warnings,
    });
  }
  if (value?.schema !== ROCK_RECIPE_DRAFT_SCHEMA || value?.version !== 0) {
    throw new RockGeologyError('ROCK_RECIPE_VERSION_UNSUPPORTED', 'No migration path exists for this RockRecipe schema/version.', {
      path: '$.version',
      suggestion: `Provide ${ROCK_RECIPE_DRAFT_SCHEMA} version 0 or ${ROCK_RECIPE_SCHEMA} version ${ROCK_RECIPE_VERSION}.`,
      details: { schema: value?.schema ?? null, version: value?.version ?? null },
    });
  }

  assertExactDraftFields(value);
  assertDraftTransform(value.transform);
  const migrated = {};
  for (const [key, child] of Object.entries(value)) {
    if (['schema', 'version', 'dimensionsMetres', 'transform', 'quality', 'seedStreams'].includes(key)) continue;
    migrated[key] = child;
  }
  migrated.schema = ROCK_RECIPE_SCHEMA;
  migrated.version = ROCK_RECIPE_VERSION;
  migrated.targetDimensionsMetres = value.dimensionsMetres;
  migrated.geologyTransform = {
    originMetres: value.transform.originMetres,
    strikeDegrees: value.transform.strike,
    dipDegrees: value.transform.dip,
    dipDirectionDegrees: value.transform.dipDirection,
  };
  migrated.qualityTier = value.quality;
  migrated.seedNamespaces = value.seedStreams;

  const parsed = parseRockRecipe(migrated, options);
  return Object.freeze({
    recipe: parsed.recipe,
    sourceVersion: 0,
    targetVersion: ROCK_RECIPE_VERSION,
    sourceContentId: contentId(value),
    targetContentId: parsed.contentId,
    migrations: Object.freeze(['v0-draft-to-v1']),
    warnings: Object.freeze([
      Object.freeze({
        code: 'ROCK_RECIPE_DRAFT_MIGRATED',
        path: '$.version',
        message: 'Draft version 0 was explicitly migrated to RockRecipe version 1.',
        suggestion: 'Save the canonical version 1 document; future compiles should not depend on draft migration.',
        details: Object.freeze({ renamedFields: Object.freeze([
          'dimensionsMetres→targetDimensionsMetres',
          'transform→geologyTransform',
          'quality→qualityTier',
          'seedStreams→seedNamespaces',
        ]) }),
      }),
      ...parsed.warnings,
    ]),
  });
}

export function deserializeAndMigrateRockRecipe(text, options = {}) {
  if (typeof text !== 'string') {
    throw new RockGeologyError('ROCK_RECIPE_TEXT_REQUIRED', 'Serialized RockRecipe input must be a string.', {
      path: '$',
      suggestion: 'Read the UTF-8 JSON document before migrating it.',
    });
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new RockGeologyError('ROCK_RECIPE_JSON_INVALID', `RockRecipe JSON could not be parsed: ${error.message}`, {
      path: '$',
      suggestion: 'Correct the JSON syntax; partial documents are not accepted.',
      cause: error,
    });
  }
  return migrateRockRecipe(value, options);
}

export function createDraftV0MigrationFixture(v1Recipe) {
  const parsed = parseRockRecipe(v1Recipe).recipe;
  const fixture = {};
  for (const [key, child] of Object.entries(parsed)) {
    if (['schema', 'version', ...V1_RENAMED_FIELDS].includes(key)) continue;
    fixture[key] = child;
  }
  fixture.schema = ROCK_RECIPE_DRAFT_SCHEMA;
  fixture.version = 0;
  fixture.dimensionsMetres = parsed.targetDimensionsMetres;
  fixture.transform = {
    originMetres: parsed.geologyTransform.originMetres,
    strike: parsed.geologyTransform.strikeDegrees,
    dip: parsed.geologyTransform.dipDegrees,
    dipDirection: parsed.geologyTransform.dipDirectionDegrees,
  };
  fixture.quality = parsed.qualityTier;
  fixture.seedStreams = parsed.seedNamespaces;
  return canonicalizeJson(fixture);
}

function assertExactDraftFields(value) {
  const missing = V0_FIELDS.filter((key) => !Object.hasOwn(value, key));
  const unknown = Object.keys(value).filter((key) => !V0_FIELDS.includes(key));
  if (missing.length === 0 && unknown.length === 0) return;
  throw new RockGeologyError('ROCK_RECIPE_DRAFT_SHAPE_INVALID', 'Draft recipe cannot be migrated because its field set is not exact.', {
    path: '$',
    suggestion: 'Restore the complete draft v0 document and remove unknown fields before migration.',
    details: { missing, unknown },
  });
}

function assertDraftTransform(value) {
  const expected = ['originMetres', 'strike', 'dip', 'dipDirection'];
  const missing = expected.filter((key) => !Object.hasOwn(value ?? {}, key));
  const unknown = Object.keys(value ?? {}).filter((key) => !expected.includes(key));
  if (value && typeof value === 'object' && !Array.isArray(value) && missing.length === 0 && unknown.length === 0) return;
  throw new RockGeologyError('ROCK_RECIPE_DRAFT_TRANSFORM_INVALID', 'Draft transform cannot be migrated safely.', {
    path: '$.transform',
    suggestion: 'Provide originMetres, strike, dip, and dipDirection exactly.',
    details: { missing, unknown },
  });
}
