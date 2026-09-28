// Workflow-rail stage map + UI-side field metadata (advanced sets, stage
// grouping). Lives UI-side so the canonical settings schema stays purely
// descriptive; if this ever needs to drive docs, promote it into the
// treeRecipe field factory per the redesign plan's schema extensions.

export const STAGES = [
  {
    description: 'Botanical identity, biological development, trained form, and crown silhouette.',
    groups: ['plant', 'structure', 'canopy'],
    icon: 'stage-shape',
    id: 'shape',
    key: '1',
    label: 'Shape',
  },
  {
    description: 'Trunk character and how the wood grows.',
    groups: ['trunk', 'skeleton'],
    icon: 'stage-wood',
    id: 'wood',
    key: '2',
    label: 'Wood',
  },
  {
    description: 'Foliage coverage and the tufts at branch ends.',
    groups: ['leaves'],
    icon: 'stage-leaves',
    id: 'leaves',
    key: '3',
    label: 'Leaves',
  },
  {
    description: 'Leaf style, palette, and season.',
    groups: ['color'],
    icon: 'stage-look',
    id: 'look',
    key: '4',
    label: 'Look',
  },
  {
    description: 'Falling-leaf effects — live in-engine, like wind.',
    groups: [],
    icon: 'stage-animation',
    id: 'animation',
    key: '5',
    label: 'Animate',
  },
  {
    description: 'Blossoms attached to this tree’s canopy — species, color, and coverage.',
    groups: [],
    icon: 'stage-flowers',
    id: 'flowers',
    key: '6',
    label: 'Blossoms',
  },
];

export const FLOWER_STAGES = [
  {
    description: 'Overall flower scale and the silhouette supporting its blooms.',
    groups: ['plant', 'canopy'],
    icon: 'stage-shape',
    id: 'shape',
    key: '1',
    label: 'Shape',
  },
  {
    description: 'Stem proportions and how secondary stems grow.',
    groups: ['trunk', 'skeleton'],
    icon: 'stage-wood',
    id: 'wood',
    key: '2',
    label: 'Stem',
  },
  {
    description: 'Leaf coverage and the tufts supporting each bloom.',
    groups: ['leaves'],
    icon: 'stage-leaves',
    id: 'leaves',
    key: '3',
    label: 'Leaves',
  },
  {
    description: 'Leaf style, palette, and season.',
    groups: ['color'],
    icon: 'stage-look',
    id: 'look',
    key: '4',
    label: 'Look',
  },
  {
    description: 'Live wind response for stems and leaves.',
    groups: ['wind'],
    icon: 'stage-animation',
    id: 'animation',
    key: '5',
    label: 'Motion',
  },
  {
    description: 'Flower-head species, petal color, and bloom size.',
    groups: ['flower'],
    icon: 'stage-flowers',
    id: 'flowers',
    key: '6',
    label: 'Bloom',
  },
];

export function stagesForLab(labKind = 'tree') {
  return labKind === 'flower' ? FLOWER_STAGES : STAGES;
}

// Fields tucked behind the ▸ Advanced disclosure in stage panels (shown
// inline, ◆-marked, in the power drawer).
export const ADVANCED_FIELD_IDS = new Set([
  'canopy.coreRadius',
  'canopy.canopyScale',
  'skeleton.radiusRatio',
  'skeleton.phyllotaxisAngle',
  'skeleton.branchInternodeSpacing',
  'skeleton.gravitropism',
  'skeleton.phototropism',
  'skeleton.branchSag',
  'skeleton.tipUpturn',
  'skeleton.windBias',
  'skeleton.pipeExponent',
  'skeleton.junctionBulge',
  'skeleton.attractionCount',
  'skeleton.segmentLength',
  'skeleton.killRadius',
  'skeleton.maxNodes',
  'skeleton.radialSegments',
  'skeleton.tipRadius',
  'skeleton.minLimbRadius',
  'skeleton.attractionReachAuto',
  'skeleton.attractionReach',
  'trunk.bendDirectionAuto',
  'trunk.bendDirection',
  'trunk.leanOffsetAuto',
  'trunk.leanOffset',
  'leaves.cardCount',
  'leaves.shellFill',
]);

export const TOOLS = [
  { icon: 'tool-move', id: 'orbit', key: 'v', label: 'Move / Orbit (V)' },
  { icon: 'tool-trunk', id: 'trunk', key: 't', label: 'Trunk (T) — drag up from the ground' },
  { icon: 'tool-branch', id: 'branch', key: 'b', label: 'Branch (B) — drag from the trunk' },
  { icon: 'tool-leaves', id: 'leaves', key: 'l', label: 'Leaves (L) — stroke = run, loop = fill' },
  { icon: 'tool-crown', id: 'crown', key: 'c', label: 'Crown (C) — outline the crown' },
  { icon: 'tool-size', id: 'thicken', key: 's', label: 'Size (S) — click thickens, Alt thins' },
  { icon: 'tool-erase', id: 'erase', key: 'e', label: 'Erase (E) — click a drawn stroke' },
];
