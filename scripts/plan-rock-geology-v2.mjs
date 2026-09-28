#!/usr/bin/env node

import path from 'node:path';

import {
  planOfflineRecipeSelection,
  writeOfflineRecipePlan,
} from '../src/rockgen/experimental/geology-v2/harness.node.js';

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/plan-rock-geology-v2.mjs --recipe <recipe.json> --output <dir>',
    '  node scripts/plan-rock-geology-v2.mjs --family <igneous|sedimentary|metamorphic|lithology> --output <dir>',
    '  node scripts/plan-rock-geology-v2.mjs --all --output <dir>',
    '',
    'Checkpoint 2 is contract-plan-only: it validates recipes and emits deterministic stage plans/manifests; it does not claim geometry or bake generation.',
  ].join('\n');
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(usage());
  process.exit(0);
}

const output = option('--output');
if (!output) {
  console.error(usage());
  process.exit(2);
}

const recipePath = option('--recipe');
const family = option('--family');
const all = args.includes('--all');

try {
  const result = planOfflineRecipeSelection({
    recipePath: recipePath ? path.resolve(recipePath) : null,
    family,
    all,
  });
  const written = writeOfflineRecipePlan(result, output);
  console.log(JSON.stringify({
    ok: true,
    mode: result.index.mode,
    scope: result.index.scope,
    selector: result.index.selector,
    count: written.count,
    indexContentId: written.indexContentId,
    outputDirectory: written.outputDirectory,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: typeof error?.toJSON === 'function' ? error.toJSON() : {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
