import fs from 'node:fs';
import path from 'node:path';

import { createPlannedArtifactManifest } from './artifactManifest.node.js';
import { canonicalStringify, canonicalizeJson, contentId } from './canonical.node.js';
import { loadGeologyCatalog } from './catalog.node.js';
import { RockGeologyError } from './errors.js';
import { deserializeAndMigrateRockRecipe } from './migrations.node.js';
import { createHeroRockRecipe } from './recipe.node.js';
import { planRockCompilation } from './stageGraph.node.js';

export function selectOfflineRecipes(selection, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const modes = ['recipePath', 'family', 'all'].filter((key) => selection[key]);
  if (modes.length !== 1) {
    throw new RockGeologyError('HARNESS_SCOPE_INVALID', 'Choose exactly one offline scope: recipePath, family, or all.', {
      path: '$.selection',
      suggestion: 'Use --recipe <file>, --family <igneous|sedimentary|metamorphic|lithology>, or --all.',
      details: { selected: modes },
    });
  }
  if (selection.recipePath) {
    const migration = deserializeAndMigrateRockRecipe(fs.readFileSync(selection.recipePath, 'utf8'), { catalog });
    return canonicalizeJson({
      scope: 'recipe',
      selector: path.basename(selection.recipePath),
      recipes: [migration.recipe],
      migrations: migration.migrations,
    });
  }

  let lithologies;
  if (selection.all) {
    lithologies = catalog.ontology.lithologies;
  } else if (['igneous', 'sedimentary', 'metamorphic'].includes(selection.family)) {
    lithologies = catalog.ontology.lithologies.filter((item) => item.class === selection.family);
  } else {
    const one = catalog.lithologyById.get(selection.family);
    if (!one) {
      throw new RockGeologyError('HARNESS_FAMILY_UNKNOWN', `Unknown rock family or lithology “${selection.family}”.`, {
        path: '$.family',
        suggestion: 'Use igneous, sedimentary, metamorphic, or an ontology lithology identifier.',
      });
    }
    lithologies = [one];
  }
  return canonicalizeJson({
    scope: selection.all ? 'all' : 'family',
    selector: selection.all ? 'all-ontology-heroes' : selection.family,
    recipes: lithologies.map((lithology) => {
      const ontologyIndex = catalog.ontology.lithologies.findIndex((item) => item.id === lithology.id);
      return createHeroRockRecipe(lithology.id, { catalog, seed: 1001 + ontologyIndex });
    }),
    migrations: [],
  });
}

export function planOfflineRecipeSelection(selection, options = {}) {
  const selected = selectOfflineRecipes(selection, options);
  const records = selected.recipes.map((recipe) => {
    const plan = planRockCompilation(recipe, options);
    const manifest = createPlannedArtifactManifest(recipe, plan, options);
    return canonicalizeJson({ recipe, plan, manifest });
  });
  const indexBase = {
    schema: 'toonlab/rock-geology-offline-plan-index',
    version: 1,
    mode: 'contract-plan-only',
    scope: selected.scope,
    selector: selected.selector,
    count: records.length,
    migrations: selected.migrations,
    recipes: records.map((record) => ({
      id: record.recipe.id,
      lithology: record.recipe.lithology,
      recipeContentId: record.plan.recipeContentId,
      finalStageContentId: record.plan.stages.at(-1).stageContentId,
      manifestContentId: record.manifest.manifestContentId,
      files: {
        recipe: `${record.recipe.id}/recipe.json`,
        plan: `${record.recipe.id}/compiler-plan.json`,
        manifest: `${record.recipe.id}/artifact-manifest.json`,
      },
    })),
  };
  const index = canonicalizeJson({ ...indexBase, indexContentId: contentId(indexBase) });
  return canonicalizeJson({ index, records });
}

export function writeOfflineRecipePlan(result, outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  if (fs.existsSync(resolvedOutput) && fs.readdirSync(resolvedOutput).length > 0) {
    throw new RockGeologyError('HARNESS_OUTPUT_NOT_EMPTY', 'Offline plan output directory is not empty.', {
      path: '$.outputDirectory',
      suggestion: 'Choose a new or empty directory so stale artifacts cannot be mistaken for this deterministic run.',
      details: { outputDirectory: resolvedOutput },
    });
  }
  fs.mkdirSync(resolvedOutput, { recursive: true });
  for (const record of result.records) {
    const directory = path.join(resolvedOutput, record.recipe.id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'recipe.json'), `${canonicalStringify(record.recipe, { pretty: true })}\n`);
    fs.writeFileSync(path.join(directory, 'compiler-plan.json'), `${canonicalStringify(record.plan, { pretty: true })}\n`);
    fs.writeFileSync(path.join(directory, 'artifact-manifest.json'), `${canonicalStringify(record.manifest, { pretty: true })}\n`);
  }
  fs.writeFileSync(path.join(resolvedOutput, 'index.json'), `${canonicalStringify(result.index, { pretty: true })}\n`);
  return canonicalizeJson({
    outputDirectory: resolvedOutput,
    indexPath: path.join(resolvedOutput, 'index.json'),
    count: result.index.count,
    indexContentId: result.index.indexContentId,
  });
}
