import fs from 'node:fs';
import path from 'node:path';

import { canonicalizeJson, contentId } from '../canonical.node.js';

const sourceDirectory = path.resolve(import.meta.dirname, '..');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(sourceDirectory, name), 'utf8'));
}

const taxonomy = loadJson('morphology-taxonomy.v1.json');

function slotId(subtypeId, index) {
  return `rock-v2-${subtypeId}-${String(index + 1).padStart(3, '0')}`;
}

function reviewRole(index, count) {
  const normalized = count <= 1 ? 0 : index / (count - 1);
  if (normalized === 0) return 'canonical-primary';
  if (normalized <= 0.25) return 'proportion-variant';
  if (normalized <= 0.5) return 'structure-variant';
  if (normalized <= 0.75) return 'weathering-stage-variant';
  return 'extreme-valid-variant';
}

export const CANONICAL_AUTHORING_REGISTER_SCHEMA = 'toonlab/rock-canonical-authoring-register';
export const CANONICAL_AUTHORING_REGISTER_VERSION = 1;

export function createCanonicalAuthoringRegister() {
  const slots = taxonomy.subtypes.flatMap((subtype) => Array.from(
    { length: subtype.minimumCanonicalBaselines },
    (_, index) => canonicalizeJson({
      baselineCountRule: 'requires-separately-reviewed-editable-source',
      baselineMode: subtype.baselineMode,
      familyId: subtype.familyId,
      index: index + 1,
      referenceIds: subtype.referenceIds,
      requiredDeliverables: [
        'source-manifest.json',
        'control-cage.glb',
        'recipe.json',
        'modifier-stack.json',
        'identity-landmarks.json',
        'nature-comparison.png',
        'clay-turntable.png',
        'neutral-bake-turntable.png',
        'round-trip-report.json',
      ],
      reviewRole: reviewRole(index, subtype.minimumCanonicalBaselines),
      slotId: slotId(subtype.id, index),
      status: 'planned-unassigned',
      subtypeId: subtype.id,
    }),
  ));
  return canonicalizeJson({
    baselineCount: slots.length,
    existing480CatalogRole: 'optional-reference-only',
    rules: {
      generatedSeedDoesNotCountAsBaseline: true,
      oldCatalogAssetDoesNotCountAsBaseline: true,
      separatelyReviewedSourceRevisionRequired: true,
      visualApprovalRequired: true,
    },
    schema: CANONICAL_AUTHORING_REGISTER_SCHEMA,
    slots,
    sourceContentId: contentId({
      schema: taxonomy.schema,
      subtypes: taxonomy.subtypes.map((subtype) => ({
        id: subtype.id,
        minimumCanonicalBaselines: subtype.minimumCanonicalBaselines,
      })),
      version: taxonomy.version,
    }),
    version: CANONICAL_AUTHORING_REGISTER_VERSION,
  });
}

export function summarizeCanonicalAuthoringRegister(register = createCanonicalAuthoringRegister()) {
  return canonicalizeJson({
    baselineCount: register.slots.length,
    byFamily: Object.fromEntries(taxonomy.families.map((family) => [
      family.id,
      register.slots.filter((slot) => slot.familyId === family.id).length,
    ])),
    byStatus: Object.fromEntries([...new Set(register.slots.map((slot) => slot.status))].map((status) => [
      status,
      register.slots.filter((slot) => slot.status === status).length,
    ])),
    bySubtype: Object.fromEntries(taxonomy.subtypes.map((subtype) => [
      subtype.id,
      register.slots.filter((slot) => slot.subtypeId === subtype.id).length,
    ])),
    schema: register.schema,
    sourceContentId: register.sourceContentId,
    version: register.version,
  });
}
