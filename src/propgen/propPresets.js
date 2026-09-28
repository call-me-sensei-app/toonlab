// Built-in prop presets. Every preset doubles as a catalog entry source:
// scripts/generate-catalog-thumbs.mjs walks this list, and the catalog
// (workstream 05) turns each into `{ id, cluster, recipe, thumbnail, spawn,
// tags }` automatically — content accretes from day one.

import { createPropRecipeDocument } from './propSettings.js';

const preset = (id, label, tags, settings, description = '') => Object.freeze({
  description,
  id,
  label,
  recipe: Object.freeze(createPropRecipeDocument(settings, { name: label })),
  tags: Object.freeze(tags),
});

export const BUILT_IN_PROP_PRESETS = Object.freeze([
  // --- wave 1: path dressing ------------------------------------------------
  preset('prop/fence/ranch', 'Ranch fence', ['prop', 'fence', 'wave-1', 'linear'], {
    asset: { seed: 41, type: 'fence', variant: 'ranch' },
  }, 'Two-rail weathered ranch fence — the default road liner.'),
  preset('prop/fence/rope', 'Rope fence', ['prop', 'fence', 'wave-1', 'linear'], {
    asset: { seed: 43, type: 'fence', variant: 'rope' },
    shape: { sag: 0.55 },
  }, 'Posts with sagging rope — shrine approaches and garden edges.'),
  preset('prop/lantern/stone-toro', 'Stone tōrō', ['prop', 'lantern', 'lighting', 'shrine', 'wave-1'], {
    asset: { seed: 7, type: 'lantern', variant: 'stoneToro' },
  }, 'The classic shrine-path stone lantern with a warm lit core.'),
  preset('prop/lantern/chochin', 'Hanging chōchin', ['prop', 'lantern', 'lighting', 'village', 'wave-1'], {
    asset: { seed: 11, type: 'lantern', variant: 'chochin' },
  }, 'Paper lantern hanging from a post arm — street and stall dressing.'),
  preset('prop/signpost/crossroads', 'Crossroads signpost', ['prop', 'signpost', 'road', 'wave-1'], {
    asset: { seed: 17, type: 'signpost', variant: 'crossroads' },
  }, 'Four direction boards on a crooked post.'),
  preset('prop/stairs/stone', 'Stone stairs', ['prop', 'stairs', 'stone', 'wave-1'], {
    asset: { seed: 23, type: 'stoneStairs', variant: 'straight' },
  }, 'Free-standing worn step run for garden slopes.'),
  preset('prop/milestone/road-stone', 'Road stone', ['prop', 'milestone', 'road', 'wave-1'], {
    asset: { seed: 29, type: 'milestone', variant: 'roadStone' },
  }, 'Mossy way marker.'),
  preset('prop/milestone/jizo', 'Jizō marker', ['prop', 'milestone', 'shrine', 'wave-1'], {
    asset: { seed: 31, type: 'milestone', variant: 'jizo' },
  }, 'Small stone guardian with a red bib.'),

  // --- wave 2: rural set ------------------------------------------------------
  preset('prop/well/roofed', 'Roofed well', ['prop', 'well', 'village', 'wave-2'], {
    asset: { seed: 37, type: 'well', variant: 'roofed' },
  }, 'Stone ring, winch beam, bucket, gable roof — village-square anchor.'),
  preset('prop/crates/market', 'Market crates', ['prop', 'crates', 'village', 'market', 'wave-2'], {
    asset: { seed: 41, type: 'crateStack', variant: 'mixed' },
    shape: { count: 5, stackiness: 0.6 },
  }, 'Mixed crate-and-barrel stack for docks and stalls.'),
  preset('prop/firewood/stacked', 'Firewood stack', ['prop', 'firewood', 'village', 'wave-2'], {
    asset: { seed: 43, type: 'firewood', variant: 'stacked' },
  }, 'Neat split-log pile with pale cut faces.'),
  preset('prop/torii/vermilion', 'Vermilion torii', ['prop', 'torii', 'shrine', 'gate', 'wave-2'], {
    asset: { seed: 47, type: 'torii', variant: 'myojin' },
  }, 'Curved-lintel shrine gate, vermilion with black caps.'),
  preset('prop/pier/fishing', 'Fishing pier', ['prop', 'pier', 'water', 'wave-2'], {
    asset: { seed: 53, type: 'pier', variant: 'straight' },
  }, 'Plank dock on posts — place at a shore point, reaching over water.'),

  // --- wave 3: garden / urban prep ---------------------------------------------
  preset('prop/wall/dry-stone', 'Dry stone wall', ['prop', 'wall', 'garden', 'wave-3', 'linear'], {
    asset: { seed: 59, type: 'stoneWall', variant: 'dry' },
  }, 'Stacked field wall with mossy base stones.'),
  preset('prop/bench/plank', 'Plank bench', ['prop', 'bench', 'garden', 'village', 'wave-3'], {
    asset: { seed: 61, type: 'bench', variant: 'plank' },
  }, 'Simple two-leg plank seat.'),
]);

// The studio look: what `call_me_sensei` worlds dress their paths with.
export const CALL_ME_SENSEI_PROP_SET = Object.freeze({
  fence: 'prop/fence/ranch',
  lantern: 'prop/lantern/stone-toro',
  milestone: 'prop/milestone/jizo',
  signpost: 'prop/signpost/crossroads',
  torii: 'prop/torii/vermilion',
});

export function findPropPreset(id) {
  return BUILT_IN_PROP_PRESETS.find((entry) => entry.id === id) ?? null;
}
