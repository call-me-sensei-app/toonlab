// Public Labs inventory. Only released, user-facing Labs belong here.
// Future product planning lives in issues rather than the OSS navigation.

import { LIVE_LAB_DOCUMENTATION } from '../shared/liveLabDocumentation.js';

export const LAB_EDITOR_STATUS = Object.freeze({
  beta: Object.freeze({
    description: 'Available for users to author, save, and export supported artifacts.',
    label: 'Beta',
  }),
  validation: Object.freeze({
    description: 'A user-facing example that validates several artifacts together.',
    label: 'Example',
  }),
});

export const LIBRARY_STATUS = Object.freeze({
  beta: Object.freeze({
    description: 'Available through the documented public runtime entry point.',
    label: 'Beta',
  }),
  notApplicable: Object.freeze({
    description: 'This example does not own a separate runtime artifact.',
    label: 'Not applicable',
  }),
});

export const LAB_STATUS = LAB_EDITOR_STATUS;

const LAB_CARD_METADATA = Object.freeze({
  shader: { href: '/shader-lab/', i: 'L01', jp: '人物', group: 'look' },
  'tree-shader': { href: '/tree-shader-lab/', i: 'L02a', jp: '樹影', group: 'look', family: 'Vegetation' },
  'grass-shader': { href: '/grass-shader-lab/', i: 'L02b', jp: '草影', group: 'look', family: 'Vegetation' },
  'flower-shader': { href: '/flower-shader-lab/', i: 'L02c', jp: '花影', group: 'look', family: 'Vegetation' },
  'rock-shader': { href: '/rock-shader-lab/', i: 'L03', jp: '岩肌', group: 'look' },
  'terrain-shader': { href: '/ground-shader-lab/', i: 'L04', jp: '地表', group: 'look', family: 'Ground & terrain' },
  'manufactured-material': { href: '/manufactured-material-lab/', i: 'L05', jp: '人工', group: 'look' },
  water: { href: '/water-lab/', i: 'L09', jp: '水面', group: 'look' },
  sky: { href: '/sky-lab/', i: 'L10a', jp: '天空', group: 'look' },
  'cloud-shader': { href: '/cloud-shader-lab/', i: 'L10b', jp: '雲影', group: 'look' },
  'sky-cloud': { href: '/sky-cloud-lab/', i: 'L10c', jp: '空雲', group: 'look' },
  rock: { href: '/rock-lab/', i: 'A04', jp: '岩石', group: 'asset' },
  tree: { href: '/tree-lab/', i: 'A05', jp: '樹木', group: 'asset' },
  grass: { href: '/grass-lab/', i: 'A07', jp: '下草', group: 'asset' },
  texture: { href: '/texture-lab/', i: 'A09', jp: '質感', group: 'asset' },
});

function labCard(documentation) {
  const metadata = LAB_CARD_METADATA[documentation.id];
  if (!metadata) throw new Error(`Missing public Lab card metadata for "${documentation.id}".`);
  return Object.freeze({
    artifact: documentation.artifact,
    desc: documentation.summary,
    ...metadata,
    id: documentation.id,
    npm: documentation.runtime,
    labStatus: 'beta',
    libraryStatus: 'beta',
    previewContract: 'toonlab/lab-preview-environment@1',
    title: documentation.title,
  });
}

export const LABS_SHOWCASE = Object.freeze(LIVE_LAB_DOCUMENTATION.map(labCard));
export const BETA_LABS_SHOWCASE = LABS_SHOWCASE;
export const COMPLETE_LABS_SHOWCASE = LABS_SHOWCASE;
export const IN_PROGRESS_LABS_SHOWCASE = Object.freeze([]);

export const LOOK_DEVELOPMENT_LABS_SHOWCASE = Object.freeze(
  LABS_SHOWCASE.filter((lab) => lab.group === 'look'),
);
export const ASSET_CREATION_LABS_SHOWCASE = Object.freeze(
  LABS_SHOWCASE.filter((lab) => lab.group === 'asset'),
);
export const MOTION_PERFORMANCE_LABS_SHOWCASE = Object.freeze([]);
export const EFFECTS_AUDIO_LABS_SHOWCASE = Object.freeze([]);
export const WORLD_BUILDING_LABS_SHOWCASE = Object.freeze([]);
export const PIPELINE_LABS_SHOWCASE = Object.freeze([]);

export const SHADER_LABS_SHOWCASE = LOOK_DEVELOPMENT_LABS_SHOWCASE;
export const RENDERING_STYLE_LABS_SHOWCASE = Object.freeze([]);
export const MATERIAL_SHADER_LABS_SHOWCASE = Object.freeze(
  LOOK_DEVELOPMENT_LABS_SHOWCASE.filter((lab) => [
    'shader', 'tree-shader', 'grass-shader', 'flower-shader',
    'rock-shader', 'terrain-shader', 'manufactured-material',
  ].includes(lab.id)),
);
export const VISUAL_SYSTEM_LABS_SHOWCASE = RENDERING_STYLE_LABS_SHOWCASE;
export const ASSET_GENERATION_LABS_SHOWCASE = ASSET_CREATION_LABS_SHOWCASE;
export const ASSET_LABS_SHOWCASE = ASSET_CREATION_LABS_SHOWCASE;
export const WORLD_SYSTEMS_SHOWCASE = WORLD_BUILDING_LABS_SHOWCASE;
export const RUNTIME_SYSTEM_LABS_SHOWCASE = WORLD_BUILDING_LABS_SHOWCASE;
export const LOOK_LABS_SHOWCASE = LOOK_DEVELOPMENT_LABS_SHOWCASE;

function group({ description, id, label, labIds }) {
  const byId = new Map(LABS_SHOWCASE.map((lab) => [lab.id, lab]));
  return Object.freeze({
    description,
    entries: Object.freeze(labIds.map((labId) => byId.get(labId))),
    id,
    label,
  });
}

export const BETA_LAB_GROUPS = Object.freeze([
  group({
    description: 'Reusable character, vegetation, geology, terrain, manufactured, liquid, sky, and cloud treatments.',
    id: 'shaders',
    label: 'Shaders',
    labIds: [
      'shader', 'tree-shader', 'grass-shader', 'flower-shader', 'rock-shader',
      'terrain-shader', 'manufactured-material', 'water', 'sky', 'cloud-shader', 'sky-cloud',
    ],
  }),
  group({
    description: 'Procedural geometry recipes and editable template-based rock generation.',
    id: 'asset-generation',
    label: 'Asset Generation',
    labIds: ['rock', 'tree', 'grass'],
  }),
  group({
    description: 'Portable procedural material maps for user-authored surfaces.',
    id: 'source-texture-generation',
    label: 'Source & Texture Generation',
    labIds: ['texture'],
  }),
]);

function example(definition) {
  return Object.freeze({
    ...definition,
    artifact: 'Example scene',
    group: 'example',
    labStatus: 'validation',
    libraryStatus: 'notApplicable',
    npm: 'Uses documented public runtimes',
    previewContract: 'toonlab/lab-preview-environment@1',
  });
}

export const DEMOS_SHOWCASE = Object.freeze([
  example({ href: '/playground/', i: 'V01', id: 'playground', jp: '遊場', title: 'Character & Interaction Playground', desc: 'Walk a character through composed ToonLab systems.' }),
  example({ href: '/examples/walkable-reference/', i: 'V02', id: 'water-playground', jp: '散策', title: 'Walkable Reference Scene', desc: 'Walk through the exact Scene Three clean-consumer baseline using only documented ToonLab npm APIs.' }),
  example({ href: '/examples/outdoor-world/?villages=2&shrines=1', i: 'V03', id: 'outdoor-world', jp: '世界', title: 'Outdoor World Example', desc: 'Inspect terrain, water, vegetation, paths, and settlements together.' }),
  example({ href: '/examples/vfx-arena/', i: 'V04', id: 'vfx-arena', jp: '闘技', title: 'VFX & Game Feel Arena', desc: 'Inspect combat effects, timing, feedback, and performance.' }),
  example({ href: '/examples/fauna-demo/', i: 'V05', id: 'fauna', jp: '動物', title: 'Fauna & Population Example', desc: 'Inspect wildlife variants, movement, habitat rules, and budgets.' }),
  example({ href: '/examples/ambientfx-demo/', i: 'V06', id: 'ambientfx', jp: '気配', title: 'Ambient VFX Example', desc: 'Inspect fireflies, motes, leaves, petals, pollen, and mist.' }),
]);
