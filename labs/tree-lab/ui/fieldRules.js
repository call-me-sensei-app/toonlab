import {
  TREE_GROWTH_FORM_SUBTYPES,
  TREE_SPECIES_PROFILE_BY_ID,
} from '../../../src/vegetation/experimental.js';

// Field enablement rules, pure over (state, field). Shared by the legacy
// vanilla panel (P1) and the React inspector (P2+). Returning a string
// (instead of true) gives the UI a "why disabled" tooltip.

const COLONIZATION_FIELDS = new Set([
  'skeleton.attractionCount', 'skeleton.segmentLength', 'skeleton.influenceRadius',
  'skeleton.killRadius', 'skeleton.maxNodes', 'skeleton.attractionReachAuto',
  'skeleton.attractionReach',
]);
const BRANCHING_FIELDS = new Set([
  'skeleton.levels', 'skeleton.childrenCount', 'skeleton.branchAngle',
  'skeleton.branchStart', 'skeleton.lengthRatio', 'skeleton.radiusRatio',
  'skeleton.gnarliness', 'skeleton.forceStrength',
  'skeleton.phyllotaxisAngle', 'skeleton.branchInternodeSpacing',
  'skeleton.gravitropism', 'skeleton.phototropism', 'skeleton.branchSag',
  'skeleton.tipUpturn', 'skeleton.windBias', 'skeleton.pipeExponent',
  'skeleton.junctionBulge',
]);
export const CROWN_LAYOUT_FIELDS = new Set([
  'canopy.width', 'canopy.depth', 'canopy.flatten', 'canopy.lobeCount',
  'canopy.spread', 'canopy.coreRadius',
]);

function stageLabel(stage, index, count) {
  return `${index + 1}/${count} · ${String(stage)
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')}`;
}

// The runtime recipe schema intentionally remains polymorphic for backward
// compatibility. Lab UIs narrow only the Type control: Tree Lab authors
// trees/bushes, while Flower Lab's type is implicit and cannot drift.
export function fieldsForLab(fields, labKind = 'tree', state = null) {
  return Object.fromEntries(Object.entries(fields ?? {}).flatMap(([key, field]) => {
    const speciesProfileId = state?.settings?.plant?.speciesProfileId;
    const profile = speciesProfileId ? TREE_SPECIES_PROFILE_BY_ID[speciesProfileId] : null;
    const engine = profile?.engine;
    if (!profile && (
      field.group === 'structure'
      || [
        'plant.lifeStageSlot',
        'plant.developmentProgress',
        'plant.foliageState',
        'plant.growthForm',
        'plant.growthFormSubtype',
      ].includes(field.id)
    )) {
      return [];
    }
    if (field.id === 'plant.lifeStageSlot' && state?.settings?.plant?.speciesProfileId) {
      return [[key, {
        ...field,
        optionLabels: Object.fromEntries(profile.supportedStages.map((stage, index) => [
          stage,
          stageLabel(stage, index, profile.supportedStages.length),
        ])),
        options: [...profile.supportedStages],
      }]];
    }
    if (field.id === 'plant.foliageState' && state?.settings?.plant?.speciesProfileId) {
      return [[key, { ...field, options: [...profile.validFoliageStates] }]];
    }
    if (['plant.growthForm', 'plant.growthFormSubtype'].includes(field.id)
      && profile
      && !['woody-axis', 'whorled-conifer'].includes(engine)) {
      return [];
    }
    if (field.id === 'plant.growthFormSubtype' && profile) {
      const growthForm = state.settings.plant.growthForm ?? 'natural';
      const options = TREE_GROWTH_FORM_SUBTYPES[growthForm] ?? ['species-default'];
      if (options.length <= 1) return [];
      return [[key, {
        ...field,
        optionLabels: Object.fromEntries(options.map((option) => [
          option,
          option.split('-').map((part) => (
            part[0].toUpperCase() + part.slice(1)
          )).join(' '),
        ])),
        options: [...options],
      }]];
    }
    if (field.id === 'structure.engine' && profile) {
      return [];
    }
    if (profile && ['plant.type', 'skeleton.generator', 'skeleton.childrenCount', 'skeleton.conifer'].includes(field.id)) {
      return [];
    }
    if (profile && COLONIZATION_FIELDS.has(field.id) && profile.axisMode !== 'colonized') {
      return [];
    }
    if (profile && BRANCHING_FIELDS.has(field.id)
      && !['woody-axis', 'whorled-conifer'].includes(engine)) {
      return [];
    }
    if (field.id === 'structure.crownMode' && profile) {
      if (engine !== 'woody-axis') return [];
      return [[key, field]];
    }
    if (field.id === 'structure.whorlSize' && profile) {
      if (!['woody-axis', 'whorled-conifer'].includes(engine)) return [];
      return [[key, {
        ...field,
        label: engine === 'whorled-conifer' ? 'Branches per whorl' : 'Whorl size',
      }]];
    }
    if (field.id === 'structure.stemCount' && profile) {
      const supportsStemCount = engine === 'culm-colony'
        || engine === 'pseudostem-fan'
        || profile.architectureId === 'branching-clustering-palm';
      if (!supportsStemCount) return [];
      const label = engine === 'culm-colony' ? 'Culms'
        : engine === 'terminal-crown' ? 'Colony stems'
          : engine === 'pseudostem-fan' ? 'Pseudostems / suckers'
            : 'Colony stems';
      return [[key, { ...field, label }]];
    }
    if (field.id === 'structure.nodeCount' && profile) {
      if (engine !== 'culm-colony') return [];
      return [[key, { ...field, label: 'Bamboo culm nodes' }]];
    }
    if (field.id === 'structure.armCount' && profile) {
      if (![
        'succulent-axis',
        'branched-rosette',
        'woody-axis',
        'whorled-conifer',
        'culm-colony',
      ].includes(engine)) return [];
      const label = engine === 'woody-axis' ? 'Primary branches'
        : engine === 'whorled-conifer' ? 'Branches per whorl'
          : engine === 'culm-colony' ? 'Branches per node'
            : engine === 'succulent-axis' ? 'Mature arms / pads'
              : engine === 'branched-rosette' ? 'Terminal heads'
                : 'Branches / arms / heads';
      return [[key, {
        ...field,
        description: `Engine-specific structural count used by the ${engine} generator.`,
        label,
      }]];
    }
    if (field.id !== 'plant.type') return [[key, field]];
    if (labKind === 'flower') return [];
    return [[key, {
      ...field,
      optionLabels: { tree: 'Tree', bush: 'Bush / Shrub' },
      options: ['tree', 'bush'],
    }]];
  }));
}

// Schema groups remain runtime-generic; Flower Lab translates tree-centric
// authoring nouns without forking the underlying recipe contract.
const FLOWER_GROUP_COPY = Object.freeze({
  plant: Object.freeze({ description: 'Seed and overall flower size.', label: 'Flower' }),
  trunk: Object.freeze({ description: 'Main-stem height, thickness, bend, lean, and twist.', label: 'Stem' }),
  skeleton: Object.freeze({ description: 'Secondary-stem growth and branching structure.', label: 'Stems' }),
  canopy: Object.freeze({ description: 'The supporting silhouette around the blooms.', label: 'Silhouette' }),
  leaves: Object.freeze({ description: 'Leaf-card coverage, density, and tuft behavior.', label: 'Leaves' }),
  flower: Object.freeze({ description: 'Flower-head species, petal color, and bloom size.', label: 'Bloom' }),
  color: Object.freeze({ description: 'Leaf palette and pinnable light/shadow tones.', label: 'Leaf Color' }),
  wind: Object.freeze({ description: 'Live stem and leaf motion preview.', label: 'Wind' }),
});

export function groupForLab(group, labKind = 'tree') {
  if (labKind !== 'flower' || !FLOWER_GROUP_COPY[group?.id]) return group;
  return { ...group, ...FLOWER_GROUP_COPY[group.id] };
}

export function isFieldDisabled(state, field) {
  const { settings, sketch } = state;
  const isBush = settings.plant.type === 'bush';
  const isFlower = settings.plant.type === 'flower';
  const speciesProfile = settings.plant.speciesProfileId
    ? TREE_SPECIES_PROFILE_BY_ID[settings.plant.speciesProfileId]
    : null;
  const engine = speciesProfile?.engine ?? 'legacy-woody';
  if (field.id === 'structure.engine') return 'Chosen by the species profile.';
  if (field.group === 'structure' && !speciesProfile) {
    return 'Choose a procedural species to use architecture controls.';
  }
  if (field.id === 'structure.stemCount'
    && engine !== 'culm-colony'
    && engine !== 'pseudostem-fan'
    && speciesProfile?.architectureId !== 'branching-clustering-palm') {
    return 'This architecture grows a single primary stem.';
  }
  if (field.id === 'structure.nodeCount' && engine !== 'culm-colony') {
    return 'Culm nodes are specific to bamboo.';
  }
  if (field.id === 'structure.crownMode' && engine !== 'woody-axis') {
    return 'Crown growth modes belong to recursive woody trees.';
  }
  if (
    field.id === 'structure.whorlSize'
    && !['woody-axis', 'whorled-conifer'].includes(engine)
  ) {
    return 'Whorl controls belong to recursive woody trees and conifers.';
  }
  if (field.id === 'structure.armCount'
    && !['succulent-axis', 'branched-rosette', 'woody-axis', 'whorled-conifer', 'culm-colony'].includes(engine)) {
    return 'This architecture does not use procedural arms or heads.';
  }
  if (speciesProfile && field.id === 'plant.type') return 'Species profiles are tree-form plants.';
  if (!speciesProfile && [
    'plant.lifeStageSlot',
    'plant.developmentProgress',
    'plant.foliageState',
    'plant.growthForm',
    'plant.growthFormSubtype',
  ].includes(field.id)) {
    return 'Choose a procedural species first.';
  }
  if (speciesProfile && field.id === 'skeleton.generator') {
    return `The ${engine} engine is fixed by the species profile.`;
  }
  if (speciesProfile && field.id === 'skeleton.childrenCount') {
    return 'Use the engine-specific branch count under Species Structure.';
  }
  if (speciesProfile && field.id === 'skeleton.conifer') {
    return 'Conifer structure is selected by the botanical species profile.';
  }
  if (isBush && (field.group === 'trunk' || field.group === 'skeleton')) {
    return 'Bushes have no wood.';
  }
  if (!isFlower && field.group === 'flower') {
    return 'Pick the Flower plant type in Shape.';
  }
  if (field.id === 'flower.headColor' && !settings.flower?.pinHeadColor) {
    return 'Pin the head color to edit it.';
  }
  const generator = settings.skeleton.generator;
  if (speciesProfile && COLONIZATION_FIELDS.has(field.id)) {
    if (speciesProfile.axisMode === 'colonized') return false;
    return `The ${speciesProfile.axisMode} crown uses recursive axes, not crown-attraction points.`;
  }
  if (speciesProfile && BRANCHING_FIELDS.has(field.id)) {
    if (['woody-axis', 'whorled-conifer'].includes(engine)) return false;
    return `This parameter belongs to recursive woody and conifer growth, not ${engine}.`;
  }
  // Hand-drawn trees have no procedural wood: every trunk/growth knob idles.
  if (generator === 'drawn' && !isBush) {
    if (field.group === 'trunk') return 'Hand-drawn wood — draw with the Trunk and Branch tools.';
    if (field.group === 'skeleton' && field.key !== 'generator') {
      return 'Hand-drawn wood — draw with the Trunk and Branch tools.';
    }
    if (CROWN_LAYOUT_FIELDS.has(field.id)) return 'Hand-drawn mode fills scribbled foliage directly.';
  }
  if (COLONIZATION_FIELDS.has(field.id) && generator !== 'limbs') {
    return 'Only used by the Grown Limbs generator.';
  }
  if (BRANCHING_FIELDS.has(field.id) && generator !== 'branching') {
    return 'Only used by the Branching generator.';
  }
  // A drawn crown pins the blob layout; the generated-layout sliders idle.
  if (sketch.crownBlobs.length && CROWN_LAYOUT_FIELDS.has(field.id)) {
    return 'Crown pinned to your drawn outline.';
  }
  if (isBush && field.id === 'canopy.canopyScale') return true;
  if (isBush && field.id === 'leaves.placement') return true;
  if (isBush && field.id === 'leaves.shellFill') return true;
  if (field.id === 'trunk.bendDirection' && settings.trunk.bendDirectionAuto) {
    return 'Off while Auto Bend Heading is on.';
  }
  if (field.id === 'trunk.leanOffset' && settings.trunk.leanOffsetAuto) {
    return 'Off while Auto Lean Heading is on.';
  }
  if (field.id === 'skeleton.attractionReach' && settings.skeleton.attractionReachAuto) {
    return 'Off while Auto Reach is on.';
  }
  if (field.id === 'color.lit' && !settings.color.pinLit) return 'Pin the lit color to edit it.';
  if (field.id === 'color.shadow' && !settings.color.pinShadow) return 'Pin the shadow color to edit it.';
  if (field.id === 'color.crown' && !settings.color.pinCrown) return 'Pin the crown color to edit it.';
  return false;
}
