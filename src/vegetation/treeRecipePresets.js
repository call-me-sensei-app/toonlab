// Repository-only tree/bush/flower recipe templates for Tree Lab and Gallery
// authoring. They are deliberately excluded from npm; reviewed publications
// are discovered through the public Gallery MCP tools instead.

import {
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  serializableTreeOptions,
} from './stylizedTree.js';
import { STYLIZED_TREE_EXAMPLES } from './stylizedTreeExamples.js';

const EXAMPLE_LABELS = [
  'Straight', 'Leaning', 'See-through', 'Curved', 'Forest Mix', 'Wide Crown',
  'Autumn Blend', 'Gnarled', 'Bonsai', 'Golden Gingko', 'Sumeru Tips', 'Massive Sumeru',
];

// Gallery order: the current-generation species (EZ-style branching,
// conifers, stylized signatures) lead; the twelve classic blob-crown
// examples follow as a legacy section.
const CLASSIC_EXAMPLES = STYLIZED_TREE_EXAMPLES.map((example, index) => {
  // pale/climbable are scene metadata, not constructor options.
  const { pale, climbable, ...options } = example;
  void pale;
  void climbable;
  return Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'tree',
    id: `example_${index + 1}`,
    label: `Example ${index + 1} — ${EXAMPLE_LABELS[index] ?? 'Tree'}`,
    builtIn: true,
    options: serializableTreeOptions(options),
  });
});

export const BUILT_IN_TREE_PRESETS = Object.freeze([
  // Recursive-branching showcase: tall central leader, open airy silhouette,
  // small leaf clusters along the outer branches (open broadleaf look).
  Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'tree',
    id: 'example_branching',
    label: 'Example — Open Broadleaf (Branching)',
    builtIn: true,
    options: Object.freeze({
      seed: 21,
      size: 2.2,
      canopyColor: '#4b944f',
      leafDensity: 0.9,
      trunkColor: '#805b3d',
      trunk: Object.freeze({ height: 2.6, radiusBottom: 0.14, bend: 0.06, lean: 0.08 }),
      skeleton: Object.freeze({
        generator: 'branching', levels: 3, childrenCount: 6, branchAngle: 62,
        branchStart: 0.42, lengthRatio: 0.45, radiusRatio: 0.62,
        gnarliness: 0.18, forceStrength: 0.014, tipRadius: 0.012,
      }),
      canopy: Object.freeze({}),
    }),
  }),
  // --- Species pack (realistic branching roster, stylized) ------------------
  // Each species is a silhouette recipe: broadleaves through the two
  // generators, conifers through a PINNED conical blob stack (canopy.blobs)
  // — the layered-cone pine silhouette can't emerge from the generated
  // ellipsoid layout.
  ...[
    {
      id: 'species_oak_small',
      label: 'Oak — Small',
      options: {
        canopyColor: '#4d8f47',
        canopyWidth: 1.35,
        leafDensity: 1,
        canopyLayout: { flatten: 0.55, lobeCount: 7, spread: 1.35 },
        seed: 31,
        size: 1.6,
        trunkColor: '#745136',
        trunk: {
          bend: 0.14, gnarl: 0.45, height: 1.35, radiusBottom: 0.17, twist: 0.3,
        },
      },
    },
    {
      id: 'species_oak_large',
      label: 'Oak — Large',
      options: {
        canopyColor: '#47874a',
        canopyWidth: 1.45,
        leafDensity: 1,
        canopyLayout: { flatten: 0.5, lobeCount: 8, spread: 1.45 },
        seed: 33,
        size: 2.6,
        trunkColor: '#6f4d34',
        trunk: {
          bend: 0.12, gnarl: 0.5, height: 1.6, radiusBottom: 0.2, twist: 0.35,
        },
      },
    },
    {
      id: 'species_ash',
      label: 'Ash — Medium',
      options: {
        canopyColor: '#63a558',
        leafDensity: 0.95,
        seed: 41,
        size: 2.1,
        trunkColor: '#887052',
        skeleton: {
          branchAngle: 48, branchStart: 0.3, childrenCount: 5,
          forceStrength: 0.015, generator: 'branching', gnarliness: 0.22,
          lengthRatio: 0.5, levels: 3, radiusRatio: 0.65,
        },
        canopy: {
          cardSizeRange: [0.42, 0.66], cardsPerCluster: 3, clusterRadius: 0.28,
        },
        trunk: { height: 2.3, radiusBottom: 0.13 },
      },
    },
    {
      id: 'species_aspen',
      label: 'Aspen — Medium',
      options: {
        canopyColor: '#8fbf4d',
        leafDensity: 0.85,
        seed: 47,
        size: 2.3,
        trunkColor: '#c0bdad',
        skeleton: {
          branchAngle: 62, branchStart: 0.55, childrenCount: 10,
          forceStrength: 0.045, generator: 'branching', gnarliness: 0.1,
          lengthRatio: 0.22, levels: 2, radiusRatio: 0.6,
        },
        canopy: {
          cardSizeRange: [0.38, 0.6], cardsPerCluster: 3, clusterRadius: 0.26,
        },
        trunk: { height: 3.0, radiusBottom: 0.09 },
      },
    },
    {
      // The pre-EZ stylized conifer: a PINNED cone of stacked blobs filled by
      // the limbs generator — kept as its own look (chunky, Ghibli-flat).
      id: 'species_pine_stylized',
      label: 'Pine — Stylized Blob Stack',
      options: {
        canopyColor: '#326b43',
        leafDensity: 1,
        seed: 53,
        size: 1.7,
        trunkColor: '#6a4b35',
        canopy: {
          blobs: [
            { offset: [0, 0, 0], radius: 0.9 },
            { offset: [0, 1.3, 0], radius: 0.6 },
            { offset: [0, 2.35, 0], radius: 0.36 },
            { offset: [0, 3.1, 0], radius: 0.17 },
          ],
          cardCount: 240,
          cardSizeRange: [0.42, 0.62],
          cardsPerCluster: 3,
          clusterRadius: 0.28,
        },
        trunk: { bend: 0.02, height: 2.1, radiusBottom: 0.13 },
      },
    },
    {
      id: 'species_pine_small',
      label: 'Pine — Small',
      options: {
        canopyColor: '#356f47',
        leafDensity: 1,
        seed: 53,
        size: 1.7,
        trunkColor: '#684932',
        skeleton: {
          branchAngle: 100, branchStart: 0.3, childrenCount: 44,
          conifer: true, forceStrength: -0.006, generator: 'branching',
          gnarliness: 0.06, lengthRatio: 0.34, levels: 1, radiusRatio: 0.4,
        },
        canopy: {
          cardSizeRange: [0.34, 0.5], cardsPerCluster: 3, clusterRadius: 0.24,
        },
        trunk: { height: 2.6, radiusBottom: 0.13 },
      },
    },
    {
      id: 'species_pine_large',
      label: 'Pine — Large',
      options: {
        canopyColor: '#2f6542',
        leafDensity: 1,
        seed: 59,
        size: 2.9,
        trunkColor: '#62452f',
        skeleton: {
          branchAngle: 104, branchStart: 0.24, childrenCount: 56,
          conifer: true, forceStrength: -0.008, generator: 'branching',
          gnarliness: 0.05, lengthRatio: 0.32, levels: 1, radiusRatio: 0.38,
        },
        canopy: {
          cardSizeRange: [0.32, 0.48], cardsPerCluster: 3, clusterRadius: 0.22,
        },
        trunk: { height: 3.1, radiusBottom: 0.16 },
      },
    },
  ].map((species) => Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'tree',
    id: species.id,
    label: species.label,
    builtIn: true,
    options: Object.freeze(species.options),
  })),
  Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'bush',
    id: 'example_bush',
    label: 'Example — Bush',
    builtIn: true,
    options: Object.freeze({
      seed: 4,
      size: 0.9,
      canopyColor: '#4d9250',
      leafDensity: 1,
      trunkColor: '#745136',
    }),
  }),
  // Flower plants: stem + branches tipped with blooms (species catalog in
  // src/vegetation/flowerSpecies.js).
  Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'flower',
    id: 'species_sunflower',
    label: 'Sunflower',
    builtIn: true,
    options: Object.freeze({
      seed: 7,
      size: 0.9,
      species: 'sunflower',
      headScale: 1,
      leafDensity: 0.6,
      trunk: Object.freeze({ height: 1.3, radiusBottom: 0.05, bend: 0.1, lean: 0.06 }),
      skeleton: Object.freeze({
        generator: 'branching', levels: 1, childrenCount: 2, branchAngle: 40,
        branchStart: 0.55, lengthRatio: 0.4,
      }),
    }),
  }),
  Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'flower',
    id: 'species_daisy_clump',
    label: 'Daisy Clump',
    builtIn: true,
    options: Object.freeze({
      seed: 12,
      size: 0.55,
      species: 'daisy',
      headScale: 1,
      leafDensity: 0.8,
      trunk: Object.freeze({ height: 0.8, radiusBottom: 0.035, bend: 0.14, lean: 0.1 }),
      skeleton: Object.freeze({
        generator: 'branching', levels: 2, childrenCount: 3, branchAngle: 48,
        branchStart: 0.35, lengthRatio: 0.55,
      }),
    }),
  }),
  Object.freeze({
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'flower',
    id: 'species_rose_shrub',
    label: 'Rose Shrub',
    builtIn: true,
    options: Object.freeze({
      seed: 23,
      size: 0.75,
      species: 'rose',
      headScale: 1,
      leafDensity: 1,
      trunk: Object.freeze({ height: 0.9, radiusBottom: 0.05, bend: 0.18, lean: 0.12 }),
      skeleton: Object.freeze({
        generator: 'branching', levels: 2, childrenCount: 4, branchAngle: 55,
        branchStart: 0.25, lengthRatio: 0.6,
      }),
    }),
  }),
  ...CLASSIC_EXAMPLES,
]);

/** Find a built-in preset document by id (tree, bush, or flower). */
export function getBuiltInTreePreset(id) {
  return BUILT_IN_TREE_PRESETS.find((preset) => preset.id === id) ?? null;
}
