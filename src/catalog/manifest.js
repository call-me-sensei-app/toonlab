// The catalog entry format — FROZEN during workstream 02 so every cluster
// (props, buildings, villages, trees, rocks, debris, pro imports) accretes
// entries from day one without retrofits. The browsing runtime and UI land
// with workstream 05; this module is only the contract.
//
//   {
//     id: 'prop/lantern/stone-toro',        // stable, path-like
//     cluster: 'propgen',                    // owning generator cluster
//     kind: 'recipe',                        // recipe | preset | imported-glb
//     label: 'Stone tōrō',
//     recipe: { … },                         // cluster-specific document
//     thumbnail: 'thumbs/prop-lantern-stone-toro.webp',
//     spawn: 'createPropAssetFromRecipe(recipe)',   // copy-paste snippet
//     tags: ['prop', 'lighting', 'shrine'],
//     budget: { triHi: 1800, triLo: 160 },   // optional, advisory
//   }

export const CATALOG_ENTRY_VERSION = 1;

export const CATALOG_ENTRY_KINDS = Object.freeze(['recipe', 'preset', 'imported-glb']);

const ID_PATTERN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

/** Normalizes + validates in one step; throws on unusable input. */
export function createCatalogEntry({
  id,
  cluster,
  kind = 'recipe',
  label = null,
  description = null,
  recipe = null,
  thumbnail = null,
  spawn = null,
  tags = [],
  budget = null,
  runtime = null,
} = {}) {
  const { ok, errors } = validateCatalogEntry({
    budget, cluster, description, id, kind, label, recipe, runtime, spawn, tags, thumbnail,
  });
  if (!ok) throw new Error(`Invalid catalog entry: ${errors.join(' ')}`);
  const entry = {
    cluster,
    id,
    kind,
    label: label ?? id.split('/').pop(),
    spawn,
    tags: [...new Set(tags.map((tag) => String(tag).toLowerCase()))],
    version: CATALOG_ENTRY_VERSION,
  };
  if (description) entry.description = description;
  if (recipe) entry.recipe = recipe;
  if (thumbnail) entry.thumbnail = thumbnail;
  if (budget) entry.budget = { ...budget };
  if (runtime) entry.runtime = { ...runtime };
  return entry;
}

export function validateCatalogEntry(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { errors: ['Entry must be an object.'], ok: false };
  }
  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) {
    errors.push('id must be a lowercase path-like string (e.g. "prop/lantern/stone-toro").');
  }
  if (typeof input.cluster !== 'string' || !input.cluster.trim()) {
    errors.push('cluster is required (owning generator, e.g. "propgen").');
  }
  if (!CATALOG_ENTRY_KINDS.includes(input.kind)) {
    errors.push(`kind must be one of ${CATALOG_ENTRY_KINDS.join(', ')}.`);
  }
  if (input.kind !== 'imported-glb' && (!input.recipe || typeof input.recipe !== 'object')) {
    errors.push('recipe object is required for recipe/preset entries.');
  }
  if (typeof input.spawn !== 'string' || !input.spawn.trim()) {
    errors.push('spawn snippet is required — the catalog is a contract, not a wiki.');
  }
  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    errors.push('tags must be an array when present.');
  }
  if (input.budget && (typeof input.budget !== 'object' || Array.isArray(input.budget))) {
    errors.push('budget must be an object when present.');
  }
  if (input.runtime !== undefined && input.runtime !== null) {
    if (typeof input.runtime !== 'object' || Array.isArray(input.runtime)) {
      errors.push('runtime must be an object when present.');
    } else if (input.runtime.format !== 'toonlab/compiled-tree'
      || typeof input.runtime.manifest !== 'string' || !input.runtime.manifest.trim()) {
      errors.push('compiled-tree runtime needs format "toonlab/compiled-tree" and a manifest URL.');
    }
  }
  return { errors, ok: errors.length === 0 };
}
