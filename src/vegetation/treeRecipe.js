import {
  DEFAULT_STYLIZED_TREE_SETTINGS,
  STYLIZED_TREE_SETTING_FIELD_SCHEMA,
  StylizedTree,
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  TREE_TRUNK_STYLES,
  serializableTreeOptions,
} from './stylizedTree.js';
import { StylizedBush } from './stylizedBush.js';
import { StylizedFlower } from './stylizedFlower.js';
import { FLOWER_SPECIES } from './flowerSpecies.js';
import { resolveCanopyColor } from './stylizedTreeFoliage.js';
import { ProceduralSpeciesTree } from './proceduralSpeciesTree.js';
import {
  TREE_SPECIES_PROFILES,
  getTreeSpeciesProfile,
} from './treeSpeciesProfiles.js';
import {
  TREE_ARCHITECTURE_ENGINE_IDS,
  TREE_DEVELOPMENT_STAGE_SETS,
} from './treeArchitectureProfiles.js';
import {
  WOODY_BASELINE_CONTROL_SCHEMA_VERSION,
  WOODY_BASELINE_SPECIES_PROFILE_VERSION,
  WOODY_GROWTH_FORMS,
  WOODY_GROWTH_FORM_SUBTYPES,
  woodyBaselineInheritedControlsForSpecies,
  woodyBaselineAgeProfileForSpecies,
  woodyBaselineTrainingProfileForSpecies,
  validateWoodyBaselineAgeProfile,
  validateWoodyBaselineTrainingProfile,
  validateWoodyBaselineControlValues,
} from './woodyBaselineControls.js';

export { TREE_RECIPE_SCHEMA, TREE_RECIPE_VERSION };
export {
  WOODY_GROWTH_FORMS as TREE_GROWTH_FORMS,
  WOODY_GROWTH_FORM_SUBTYPES as TREE_GROWTH_FORM_SUBTYPES,
};

// Tree/bush recipe layer: the single source of truth Tree Lab's UI,
// preset files, and runtime rebuilds all share.
//
//   settings — flat { group: { key: value } } state edited by the panel
//              (TREE_SETTING_GROUPS / TREE_SETTING_FIELD_SCHEMA drive the UI)
//   recipe   — { schema: 'treeRecipe', version, type: 'tree'|'bush'|'flower',
//              options } where options feed the StylizedTree/StylizedBush/
//              StylizedFlower constructor
//
//   const recipe = recipeFromSettings(settings);
//   const plant = createPlantFromRecipe(recipe);        // deterministic
//   const settings2 = settingsFromRecipe(recipe);       // best-effort inverse
//
// Colors in settings are sRGB triplets [r, g, b] (0..1) — the same shape the
// debug panel's color controls round-trip — and resolveCanopyColor accepts
// them back verbatim.
//
// The canonical field metadata (ranges, labels, descriptions, defaults) lives
// in STYLIZED_TREE_SETTING_FIELD_SCHEMA / DEFAULT_STYLIZED_TREE_SETTINGS
// (stylizedTree.js) — the same source the generated settings reference uses.
// This module only re-shapes it for the editor (flat panel groups, trunk
// style presets, auto/pin toggles, wind heading) and hand-authors the few
// editor-only fields the constructor schema keeps opaque (plant type, blob
// layout numbers inside canopyLayout, palette pins).

const TRUNK_STYLE_KEYS = ['bend', 'lean', 'twist', 'gnarl', 'height', 'radiusBottom', 'leanOffset'];

const CANONICAL_DEFAULTS = DEFAULT_STYLIZED_TREE_SETTINGS;

export const TREE_SETTING_DEFAULTS = Object.freeze({
  // Curated starter plant (a pleasant mid-size tree), not the constructor
  // defaults: the editor should open on something worth looking at.
  plant: Object.freeze({
    type: 'tree',
    seed: 3,
    size: 1.7,
    speciesProfileId: '',
    lifeStageSlot: 'mature',
    developmentProgress: 0.5,
    foliageState: 'leaf-on',
    stylePreset: 'call_me_sensei',
    growthForm: 'natural',
    growthFormSubtype: 'species-default',
  }),
  structure: Object.freeze({
    engine: 'legacy-woody',
    crownMode: 'decurrent',
    stemCount: 1,
    nodeCount: 18,
    armCount: 4,
    whorlSize: 1,
  }),
  trunk: Object.freeze({
    style: 'straight',
    height: CANONICAL_DEFAULTS.trunk.height,
    radiusBottom: CANONICAL_DEFAULTS.trunk.radiusBottom,
    ...TREE_TRUNK_STYLES.straight,
    bendDirectionAuto: true,
    bendDirection: 0,
    leanOffsetAuto: true,
    leanOffset: Math.PI,
  }),
  skeleton: Object.freeze({
    generator: CANONICAL_DEFAULTS.skeleton.generator,
    levels: CANONICAL_DEFAULTS.skeleton.levels,
    childrenCount: CANONICAL_DEFAULTS.skeleton.childrenCount,
    branchAngle: CANONICAL_DEFAULTS.skeleton.branchAngle,
    branchStart: CANONICAL_DEFAULTS.skeleton.branchStart,
    lengthRatio: CANONICAL_DEFAULTS.skeleton.lengthRatio,
    radiusRatio: CANONICAL_DEFAULTS.skeleton.radiusRatio,
    gnarliness: CANONICAL_DEFAULTS.skeleton.gnarliness,
    forceStrength: CANONICAL_DEFAULTS.skeleton.forceStrength,
    phyllotaxisAngle: 137.5,
    branchInternodeSpacing: 0.65,
    gravitropism: 0.04,
    phototropism: 0.035,
    branchSag: 0.018,
    tipUpturn: 0.12,
    windBias: 0,
    pipeExponent: 2.18,
    junctionBulge: 1.1,
    conifer: CANONICAL_DEFAULTS.skeleton.conifer,
    attractionCount: CANONICAL_DEFAULTS.skeleton.attractionCount,
    segmentLength: CANONICAL_DEFAULTS.skeleton.segmentLength,
    influenceRadius: CANONICAL_DEFAULTS.skeleton.influenceRadius,
    killRadius: CANONICAL_DEFAULTS.skeleton.killRadius,
    maxNodes: CANONICAL_DEFAULTS.skeleton.maxNodes,
    radialSegments: CANONICAL_DEFAULTS.skeleton.radialSegments,
    tipRadius: CANONICAL_DEFAULTS.skeleton.tipRadius,
    minLimbRadius: CANONICAL_DEFAULTS.skeleton.minLimbRadius,
    attractionReachAuto: true,
    attractionReach: 0.65, // the canopy-mode auto value (canonical default is null)
  }),
  canopy: Object.freeze({
    width: CANONICAL_DEFAULTS.tree.canopyWidth,
    depth: CANONICAL_DEFAULTS.tree.canopyDepth,
    canopyScale: CANONICAL_DEFAULTS.tree.canopyScale,
    // createCanopyBlobs parameter defaults — opaque `canopyLayout` object in
    // the constructor schema, exploded into sliders here.
    flatten: 0.5,
    lobeCount: 6,
    spread: 1.25,
    coreRadius: 0.9,
  }),
  leaves: Object.freeze({
    architecture: CANONICAL_DEFAULTS.canopy.architecture,
    placement: CANONICAL_DEFAULTS.tree.leafPlacement,
    density: CANONICAL_DEFAULTS.tree.leafDensity,
    cardCount: CANONICAL_DEFAULTS.canopy.cardCount,
    cardSizeMin: CANONICAL_DEFAULTS.canopy.cardSizeRange[0],
    cardSizeMax: CANONICAL_DEFAULTS.canopy.cardSizeRange[1],
    cardsPerCluster: CANONICAL_DEFAULTS.canopy.cardsPerCluster,
    clusterRadius: CANONICAL_DEFAULTS.canopy.clusterRadius,
    frondCount: CANONICAL_DEFAULTS.canopy.frondCount,
    frondLength: CANONICAL_DEFAULTS.canopy.frondLength,
    shellFill: CANONICAL_DEFAULTS.canopy.shellFill,
    sprayLayers: CANONICAL_DEFAULTS.canopy.sprayLayers,
    spraySpread: CANONICAL_DEFAULTS.canopy.spraySpread,
    sprayThickness: CANONICAL_DEFAULTS.canopy.sprayThickness,
    whorlArms: CANONICAL_DEFAULTS.canopy.whorlArms,
    whorlRadius: CANONICAL_DEFAULTS.canopy.whorlRadius,
  }),
  color: Object.freeze({
    canopy: Object.freeze([...CANONICAL_DEFAULTS.tree.canopyColor]),
    pinLit: false,
    lit: Object.freeze([...CANONICAL_DEFAULTS.tree.canopyColor]),
    pinShadow: false,
    shadow: Object.freeze([0.18, 0.42, 0.28]),
    pinCrown: false,
    crown: Object.freeze([0.55, 0.78, 0.42]),
  }),
  flower: Object.freeze({
    species: 'daisy',
    pinHeadColor: false,
    headColor: Object.freeze([1, 0.98, 0.92]),
    headScale: 1,
  }),
  wind: Object.freeze({
    speed: CANONICAL_DEFAULTS.foliage.windSpeed,
    strength: CANONICAL_DEFAULTS.foliage.windStrength,
    heading: Math.round(Math.atan2(
      CANONICAL_DEFAULTS.foliage.windDirection[1],
      CANONICAL_DEFAULTS.foliage.windDirection[0]) * 100) / 100,
  }),
  // Sparse neutral overrides for the exact woody baseline. An absent key
  // means "inherit the selected Toonlab architecture/species tuning".
  baselineControls: Object.freeze({}),
});

export const TREE_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'plant', label: 'Plant', description: 'Plant type, seed, and overall size.' }),
  Object.freeze({ id: 'structure', label: 'Species Structure', description: 'Architecture engine and engine-specific counts.' }),
  Object.freeze({ id: 'trunk', label: 'Trunk', description: 'Trunk silhouette: bow, lean, twist, gnarl. Trees only.' }),
  Object.freeze({ id: 'skeleton', label: 'Branches', description: 'Space-colonization limb growth. Trees only.' }),
  Object.freeze({ id: 'canopy', label: 'Crown Shape', description: 'Blob layout that defines the crown/bush silhouette.' }),
  Object.freeze({ id: 'leaves', label: 'Leaves', description: 'Leaf-card coverage, density, and tuft behavior.' }),
  Object.freeze({ id: 'flower', label: 'Bloom', description: 'Flower-head species, color, and size. Flower plants only.' }),
  Object.freeze({ id: 'color', label: 'Color', description: 'Canopy palette: base color plus pinnable lit/shadow/crown tones.' }),
  Object.freeze({ id: 'wind', label: 'Wind', description: 'Leaf flutter animation (live; not part of exported GLBs).' }),
]);

// Canonical constructor-schema metadata lookup; throws at module load if a
// mapped field is renamed upstream, so drift is caught immediately.
function canonicalField(ref) {
  const [group, key] = ref.split('.');
  const metadata = STYLIZED_TREE_SETTING_FIELD_SCHEMA[group]?.[key];
  if (!metadata) throw new Error(`treeRecipe: unknown canonical field "${ref}"`);
  return metadata;
}

// Editor field metadata. `from: 'group.key'` inherits label/description/type/
// range/options from STYLIZED_TREE_SETTING_FIELD_SCHEMA so the editor stays
// in lockstep with the constructor schema (and the generated settings
// reference); explicit values in `extra` win. Editor-only fields (type
// switch, style presets, auto/pin toggles, blob-layout sliders) author
// everything by hand.
// bake: 'rebuild' fields regenerate geometry; 'live' fields only write shader
// uniforms, so the designer applies them without a rebuild.
function field(group, key, extra = {}) {
  const base = extra.from ? canonicalField(extra.from) : null;
  const defaultValue = TREE_SETTING_DEFAULTS[group][key];
  const type = extra.type ?? base?.type ??
    (typeof defaultValue === 'boolean' ? 'boolean'
      : typeof defaultValue === 'number' ? 'number' : 'text');
  return Object.freeze({
    id: `${group}.${key}`,
    group,
    key,
    label: extra.label ?? base?.label ?? key,
    description: extra.description ?? base?.description ?? '',
    type,
    control: extra.control ?? base?.control ?? null,
    defaultValue,
    serializable: true,
    bake: extra.bake ?? 'rebuild',
    range: extra.range ?? base?.range ?? null,
    options: extra.options ?? base?.options ?? null,
    optionLabels: extra.optionLabels ?? base?.optionLabels ?? null,
    optionDisabled: extra.optionDisabled ?? base?.optionDisabled ?? null,
  });
}

const TRUNK_STYLE_OPTIONS = [...Object.keys(TREE_TRUNK_STYLES), 'custom'];
const SORTED_TREE_SPECIES_PROFILES = [...TREE_SPECIES_PROFILES].sort((left, right) => (
  left.commonName.localeCompare(right.commonName, 'en', { sensitivity: 'base' })
  || left.scientificName.localeCompare(right.scientificName, 'en', { sensitivity: 'base' })
));
const TREE_SPECIES_OPTIONS = ['', ...SORTED_TREE_SPECIES_PROFILES.map((profile) => profile.id)];
const TREE_SPECIES_OPTION_LABELS = Object.freeze({
  '': 'Classic / custom tree',
  ...Object.fromEntries(SORTED_TREE_SPECIES_PROFILES.map((profile) => [
    profile.id,
    `${profile.commonName} — ${profile.scientificName}${
      profile.treeLabEnabled ? '' : ' (experimental)'
    }`,
  ])),
});
const LIFE_STAGE_OPTIONS = [...new Set(Object.values(TREE_DEVELOPMENT_STAGE_SETS).flat())];
const FOLIAGE_STATE_OPTIONS = ['leaf-on', 'autumn', 'dormant', 'dry', 'wet', 'snow', 'green'];

export const TREE_SETTING_FIELD_SCHEMA = Object.freeze({
  plant: Object.freeze({
    type: field('plant', 'type', {
      label: 'Type',
      description: 'Tree (trunk + crown), bush (foliage mass on the ground), or flower (stem + branches tipped with blooms).',
      type: 'select',
      options: ['tree', 'bush', 'flower'],
      optionLabels: { tree: 'Tree', bush: 'Bush / Shrub', flower: 'Flower' },
    }),
    seed: field('plant', 'seed', { from: 'tree.seed' }),
    size: field('plant', 'size', { from: 'tree.size' }),
    speciesProfileId: field('plant', 'speciesProfileId', {
      label: 'Species',
      description: 'A botanical species preset backed by its architecture-specific procedural engine. Experimental profiles are available for testing but remain excluded from approved catalog output.',
      type: 'select',
      control: 'search-select',
      options: TREE_SPECIES_OPTIONS,
      optionLabels: TREE_SPECIES_OPTION_LABELS,
    }),
    lifeStageSlot: field('plant', 'lifeStageSlot', {
      label: 'Life stage',
      description: 'A named checkpoint for the selected species; choosing one also positions the growth slider.',
      type: 'select',
      options: LIFE_STAGE_OPTIONS,
    }),
    developmentProgress: field('plant', 'developmentProgress', {
      label: 'Growth / age',
      description: 'Continuously grow the same individual from its youngest to oldest supported form.',
      range: { min: 0, max: 1, step: 0.01 },
    }),
    foliageState: field('plant', 'foliageState', {
      label: 'Foliage state',
      description: 'Biologically valid seasonal appearance for the selected species.',
      type: 'select',
      options: FOLIAGE_STATE_OPTIONS,
    }),
    stylePreset: field('plant', 'stylePreset', {
      label: 'Art style',
      description: 'The vegetation shading language used consistently by trunks, culms, fronds, needles, and leaves.',
      type: 'select',
      options: ['call_me_sensei', 'default'],
      optionLabels: {
        call_me_sensei: 'Call Me Sensei',
        default: 'Neutral toon',
      },
    }),
    growthForm: field('plant', 'growthForm', {
      label: 'Growth / training form',
      description: 'A structural transform applied after species and biological age. Bonsai and cultivated forms never change the botanical identity.',
      type: 'select',
      options: WOODY_GROWTH_FORMS,
      optionLabels: {
        natural: 'Natural / species default',
        'multi-stem': 'Multi-stem',
        columnar: 'Columnar',
        weeping: 'Weeping',
        pollarded: 'Pollarded',
        coppiced: 'Coppiced',
        bonsai: 'Bonsai',
        topiary: 'Topiary',
      },
    }),
    growthFormSubtype: field('plant', 'growthFormSubtype', {
      label: 'Form subtype',
      description: 'Training-system subtype. The available choices follow the selected growth form.',
      type: 'select',
      options: [...new Set(Object.values(WOODY_GROWTH_FORM_SUBTYPES).flat())],
    }),
  }),
  structure: Object.freeze({
    engine: field('structure', 'engine', {
      label: 'Architecture engine',
      description: 'The structural generator selected by the species profile.',
      type: 'select',
      options: ['legacy-woody', ...TREE_ARCHITECTURE_ENGINE_IDS],
    }),
    crownMode: field('structure', 'crownMode', {
      label: 'Crown growth mode',
      description: 'Leader and crown-envelope behavior for recursive woody trees.',
      type: 'select',
      options: [
        'monopodial',
        'excurrent',
        'sparse-excurrent',
        'decurrent',
        'sympodial',
        'vase',
        'layered',
        'columnar',
        'weeping',
        'spreading',
        'umbrella',
        'colonized',
      ],
    }),
    stemCount: field('structure', 'stemCount', {
      label: 'Stems / culms',
      description: 'Colony stem count for bamboo, clustering palms, and giant monocots.',
      range: { min: 1, max: 24, step: 1 },
    }),
    nodeCount: field('structure', 'nodeCount', {
      label: 'Culm nodes',
      description: 'Node and internode count along each bamboo culm.',
      range: { min: 4, max: 36, step: 1 },
    }),
    armCount: field('structure', 'armCount', {
      label: 'Arms / heads',
      description: 'Mature arm count for cacti or terminal-head count for branched rosettes.',
      range: { min: 1, max: 16, step: 1 },
    }),
    whorlSize: field('structure', 'whorlSize', {
      label: 'Branches per whorl',
      description: 'One gives spiral phyllotaxis; larger values initiate evenly spaced branches at the same internode.',
      range: { min: 1, max: 8, step: 1 },
    }),
  }),
  trunk: Object.freeze({
    style: field('trunk', 'style', {
      label: 'Style',
      description: 'Ready-made trunk personality; editing any slider below switches to Custom.',
      type: 'select',
      options: TRUNK_STYLE_OPTIONS,
      optionLabels: {
        straight: 'Straight', leaning: 'Leaning', curved: 'Curved', gnarled: 'Gnarled',
        bonsai: 'Bonsai', swooping: 'Swooping (Liyue)', custom: 'Custom',
      },
    }),
    height: field('trunk', 'height', { from: 'trunk.height' }),
    radiusBottom: field('trunk', 'radiusBottom', { from: 'trunk.radiusBottom' }),
    bend: field('trunk', 'bend', { from: 'trunk.bend' }),
    lean: field('trunk', 'lean', { from: 'trunk.lean' }),
    twist: field('trunk', 'twist', { from: 'trunk.twist' }),
    gnarl: field('trunk', 'gnarl', { from: 'trunk.gnarl' }),
    bendDirectionAuto: field('trunk', 'bendDirectionAuto', {
      label: 'Auto Bend Heading',
      description: 'Pick the bow heading from the seed instead of the slider below.',
    }),
    bendDirection: field('trunk', 'bendDirection', { from: 'trunk.bendDirection' }),
    leanOffsetAuto: field('trunk', 'leanOffsetAuto', {
      label: 'Auto Lean Offset',
      description: 'Pick the lean heading from the seed; off + \u03c0 gives the serpentine S-trunk.',
    }),
    leanOffset: field('trunk', 'leanOffset', { from: 'trunk.leanOffset' }),
  }),
  skeleton: Object.freeze({
    generator: field('skeleton', 'generator', { from: 'skeleton.generator' }),
    levels: field('skeleton', 'levels', { from: 'skeleton.levels' }),
    childrenCount: field('skeleton', 'childrenCount', { from: 'skeleton.childrenCount' }),
    branchAngle: field('skeleton', 'branchAngle', { from: 'skeleton.branchAngle' }),
    branchStart: field('skeleton', 'branchStart', { from: 'skeleton.branchStart' }),
    lengthRatio: field('skeleton', 'lengthRatio', { from: 'skeleton.lengthRatio' }),
    radiusRatio: field('skeleton', 'radiusRatio', { from: 'skeleton.radiusRatio' }),
    gnarliness: field('skeleton', 'gnarliness', { from: 'skeleton.gnarliness' }),
    forceStrength: field('skeleton', 'forceStrength', { from: 'skeleton.forceStrength' }),
    phyllotaxisAngle: field('skeleton', 'phyllotaxisAngle', {
      label: 'Divergence angle',
      description: 'Azimuthal rotation in degrees between successive branch initiations.',
      range: { min: 30, max: 180, step: 0.5 },
    }),
    branchInternodeSpacing: field('skeleton', 'branchInternodeSpacing', {
      label: 'Branch internode',
      description: 'Average vertical spacing between primary branch initiations.',
      range: { min: 0.08, max: 3, step: 0.02 },
    }),
    gravitropism: field('skeleton', 'gravitropism', {
      label: 'Upward growth',
      description: 'Long-term correction of growing axes against gravity.',
      range: { min: -0.1, max: 0.25, step: 0.005 },
    }),
    phototropism: field('skeleton', 'phototropism', {
      label: 'Light seeking',
      description: 'Bias growing tips toward the crown light direction.',
      range: { min: 0, max: 0.2, step: 0.005 },
    }),
    branchSag: field('skeleton', 'branchSag', {
      label: 'Branch sag',
      description: 'Downward compliance accumulated along horizontal, slender branches.',
      range: { min: 0, max: 0.25, step: 0.005 },
    }),
    tipUpturn: field('skeleton', 'tipUpturn', {
      label: 'Tip recovery',
      description: 'Upward correction near branch endpoints after sag and wind.',
      range: { min: 0, max: 0.4, step: 0.005 },
    }),
    windBias: field('skeleton', 'windBias', {
      label: 'Prevailing wind',
      description: 'Persistent growth bias from the prevailing wind, separate from live animation.',
      range: { min: -0.2, max: 0.2, step: 0.005 },
    }),
    pipeExponent: field('skeleton', 'pipeExponent', {
      label: 'Pipe exponent',
      description: 'Area-preserving exponent used to distribute parent radius across child axes.',
      range: { min: 1.6, max: 3.2, step: 0.02 },
    }),
    junctionBulge: field('skeleton', 'junctionBulge', {
      label: 'Branch collar',
      description: 'Subtle radius reinforcement at the first ring of a child axis.',
      range: { min: 1, max: 1.24, step: 0.01 },
    }),
    conifer: field('skeleton', 'conifer', { from: 'skeleton.conifer' }),
    attractionCount: field('skeleton', 'attractionCount', { from: 'skeleton.attractionCount' }),
    segmentLength: field('skeleton', 'segmentLength', { from: 'skeleton.segmentLength' }),
    influenceRadius: field('skeleton', 'influenceRadius', { from: 'skeleton.influenceRadius' }),
    killRadius: field('skeleton', 'killRadius', { from: 'skeleton.killRadius' }),
    maxNodes: field('skeleton', 'maxNodes', { from: 'skeleton.maxNodes' }),
    radialSegments: field('skeleton', 'radialSegments', { from: 'skeleton.radialSegments' }),
    tipRadius: field('skeleton', 'tipRadius', { from: 'skeleton.tipRadius' }),
    minLimbRadius: field('skeleton', 'minLimbRadius', { from: 'skeleton.minLimbRadius' }),
    attractionReachAuto: field('skeleton', 'attractionReachAuto', {
      label: 'Auto Reach',
      description: 'Derive attraction depth from leaf placement (buried for canopy, near-shell for tips).',
    }),
    attractionReach: field('skeleton', 'attractionReach', { from: 'skeleton.attractionReach' }),
  }),
  canopy: Object.freeze({
    width: field('canopy', 'width', { from: 'tree.canopyWidth' }),
    depth: field('canopy', 'depth', { from: 'tree.canopyDepth' }),
    flatten: field('canopy', 'flatten', {
      label: 'Flatten',
      description: 'Vertical squash of the lobes; low values give the wide layered look.',
      range: { min: 0.1, max: 1, step: 0.05 },
    }),
    lobeCount: field('canopy', 'lobeCount', {
      label: 'Lobes',
      description: 'Satellite blobs ringing the crown core.',
      range: { min: 2, max: 10, step: 1 },
    }),
    spread: field('canopy', 'spread', {
      label: 'Spread',
      description: 'Horizontal reach of the lobes (1 \u2248 core radius).',
      range: { min: 0.5, max: 2, step: 0.05 },
    }),
    coreRadius: field('canopy', 'coreRadius', {
      label: 'Core Radius',
      description: 'Central blob radius.',
      range: { min: 0.4, max: 1.2, step: 0.05 },
    }),
    canopyScale: field('canopy', 'canopyScale', { from: 'tree.canopyScale' }),
  }),
  leaves: Object.freeze({
    architecture: field('leaves', 'architecture', { from: 'canopy.architecture' }),
    placement: field('leaves', 'placement', { from: 'tree.leafPlacement' }),
    density: field('leaves', 'density', { from: 'tree.leafDensity' }),
    cardCount: field('leaves', 'cardCount', { from: 'canopy.cardCount' }),
    cardSizeMin: field('leaves', 'cardSizeMin', {
      label: 'Card Size Min',
      description: canonicalField('canopy.cardSizeRange').description,
      range: { min: 0.4, max: 2, step: 0.05 },
    }),
    cardSizeMax: field('leaves', 'cardSizeMax', {
      label: 'Card Size Max',
      description: canonicalField('canopy.cardSizeRange').description,
      range: { min: 0.4, max: 2.4, step: 0.05 },
    }),
    cardsPerCluster: field('leaves', 'cardsPerCluster', { from: 'canopy.cardsPerCluster' }),
    clusterRadius: field('leaves', 'clusterRadius', { from: 'canopy.clusterRadius' }),
    sprayLayers: field('leaves', 'sprayLayers', { from: 'canopy.sprayLayers' }),
    spraySpread: field('leaves', 'spraySpread', { from: 'canopy.spraySpread' }),
    sprayThickness: field('leaves', 'sprayThickness', { from: 'canopy.sprayThickness' }),
    whorlArms: field('leaves', 'whorlArms', { from: 'canopy.whorlArms' }),
    whorlRadius: field('leaves', 'whorlRadius', { from: 'canopy.whorlRadius' }),
    frondCount: field('leaves', 'frondCount', { from: 'canopy.frondCount' }),
    frondLength: field('leaves', 'frondLength', { from: 'canopy.frondLength' }),
    shellFill: field('leaves', 'shellFill', { from: 'canopy.shellFill' }),
  }),
  flower: Object.freeze({
    species: field('flower', 'species', {
      label: 'Species',
      description: 'Common-flower head at every branch tip (see FLOWER_SPECIES).',
      type: 'select',
      options: FLOWER_SPECIES.map((entry) => entry.id),
      optionLabels: Object.fromEntries(FLOWER_SPECIES.map((entry) => [entry.id, entry.label])),
    }),
    pinHeadColor: field('flower', 'pinHeadColor', {
      label: 'Pin Head Color',
      description: 'Use the explicit petal color below instead of the species default.',
    }),
    headColor: field('flower', 'headColor', {
      label: 'Head Color',
      description: 'Bloom petal color (when pinned).',
      type: 'color',
    }),
    headScale: field('flower', 'headScale', {
      label: 'Head Size',
      description: 'Bloom size relative to the leaf tufts.',
      range: { min: 0.4, max: 2, step: 0.05 },
    }),
  }),
  color: Object.freeze({
    canopy: field('color', 'canopy', { from: 'tree.canopyColor', bake: 'live' }),
    pinLit: field('color', 'pinLit', {
      label: 'Pin Lit',
      description: 'Use the explicit lit tone below instead of the base color.',
      bake: 'live',
    }),
    lit: field('color', 'lit', {
      label: 'Lit Tone', description: 'Sunlit leaf tone (when pinned).', type: 'color', bake: 'live',
    }),
    pinShadow: field('color', 'pinShadow', {
      label: 'Pin Shadow',
      description: 'Use the explicit shadow tone below instead of deriving it.',
      bake: 'live',
    }),
    shadow: field('color', 'shadow', {
      label: 'Shadow Tone', description: 'Shaded leaf tone (when pinned).', type: 'color', bake: 'live',
    }),
    pinCrown: field('color', 'pinCrown', {
      label: 'Pin Crown',
      description: 'Use the explicit crown-crest tone below instead of deriving it.',
      bake: 'live',
    }),
    crown: field('color', 'crown', {
      label: 'Crown Tone',
      description: 'Sun-struck crest tone on the crown top (when pinned).',
      type: 'color',
      bake: 'live',
    }),
  }),
  wind: Object.freeze({
    speed: field('wind', 'speed', { from: 'foliage.windSpeed', bake: 'live' }),
    strength: field('wind', 'strength', { from: 'foliage.windStrength', bake: 'live' }),
    heading: field('wind', 'heading', {
      label: 'Heading',
      description: canonicalField('foliage.windDirection').description,
      range: { min: 0, max: 6.29, step: 0.01 },
      bake: 'live',
    }),
  }),
});

export function cloneTreeSettings(settings = TREE_SETTING_DEFAULTS) {
  return JSON.parse(JSON.stringify(settings));
}

function paletteFromSettings(color) {
  const palette = {};
  if (color.pinLit) palette.lit = [...color.lit];
  if (color.pinShadow) palette.shadow = [...color.shadow];
  if (color.pinCrown) palette.crown = [...color.crown];
  return palette;
}

export function windOptionsFromSettings(settings) {
  const { speed, strength, heading } = settings.wind;
  return {
    windDirection: [Math.cos(heading), Math.sin(heading)],
    windSpeed: speed,
    windStrength: strength,
  };
}

// Panel state → constructor options. Trunk style is UI sugar: the sliders
// always hold the concrete values, so options stay explicit and recipes never
// depend on preset tables.
export function treeOptionsFromSettings(settings) {
  const {
    plant, structure = TREE_SETTING_DEFAULTS.structure, trunk, skeleton, canopy, leaves, color,
  } = settings;
  const shared = {
    size: plant.size,
    seed: plant.seed,
    canopyColor: [...color.canopy],
    canopyPalette: paletteFromSettings(color),
    leafDensity: leaves.density,
    canopy: {
      architecture: leaves.architecture,
      cardCount: leaves.cardCount,
      cardSizeRange: [leaves.cardSizeMin, Math.max(leaves.cardSizeMax, leaves.cardSizeMin)],
      cardsPerCluster: leaves.cardsPerCluster,
      clusterRadius: leaves.clusterRadius,
      frondCount: leaves.frondCount,
      frondLength: leaves.frondLength,
      shellFill: leaves.shellFill,
      sprayLayers: leaves.sprayLayers,
      spraySpread: leaves.spraySpread,
      sprayThickness: leaves.sprayThickness,
      whorlArms: leaves.whorlArms,
      whorlRadius: leaves.whorlRadius,
    },
    foliage: windOptionsFromSettings(settings),
    vegetationShader: plant.stylePreset,
  };

  if (plant.type === 'bush') {
    return {
      ...shared,
      width: canopy.width,
      depth: canopy.depth,
      flatten: canopy.flatten,
      canopyLayout: {
        lobeCount: canopy.lobeCount,
        spread: canopy.spread,
        coreRadius: canopy.coreRadius,
      },
    };
  }

  const treeOptions = {
    ...shared,
    canopyWidth: canopy.width,
    canopyDepth: canopy.depth,
    canopyScale: canopy.canopyScale,
    leafPlacement: leaves.placement,
    canopyLayout: {
      lobeCount: canopy.lobeCount,
      spread: canopy.spread,
      flatten: canopy.flatten,
      coreRadius: canopy.coreRadius,
    },
    trunk: {
      height: trunk.height,
      radiusBottom: trunk.radiusBottom,
      bend: trunk.bend,
      lean: trunk.lean,
      twist: trunk.twist,
      gnarl: trunk.gnarl,
      bendDirection: trunk.bendDirectionAuto ? null : trunk.bendDirection,
      leanOffset: trunk.leanOffsetAuto ? null : trunk.leanOffset,
    },
    skeleton: {
      generator: skeleton.generator,
      levels: skeleton.levels,
      childrenCount: skeleton.childrenCount,
      branchAngle: skeleton.branchAngle,
      branchStart: skeleton.branchStart,
      lengthRatio: skeleton.lengthRatio,
      radiusRatio: skeleton.radiusRatio,
      gnarliness: skeleton.gnarliness,
      forceStrength: skeleton.forceStrength,
      conifer: skeleton.conifer,
      attractionCount: skeleton.attractionCount,
      segmentLength: skeleton.segmentLength,
      influenceRadius: skeleton.influenceRadius,
      killRadius: skeleton.killRadius,
      maxNodes: skeleton.maxNodes,
      radialSegments: skeleton.radialSegments,
      tipRadius: skeleton.tipRadius,
      minLimbRadius: skeleton.minLimbRadius,
      attractionReach: skeleton.attractionReachAuto ? null : skeleton.attractionReach,
    },
  };

  if (plant.speciesProfileId) {
    treeOptions.speciesProfileId = plant.speciesProfileId;
    treeOptions.lifeStage = plant.lifeStageSlot;
    treeOptions.developmentProgress = plant.developmentProgress;
    treeOptions.foliageState = plant.foliageState;
    treeOptions.growthForm = plant.growthForm;
    treeOptions.growthFormSubtype = plant.growthFormSubtype;
    treeOptions.geometrySeed = plant.seed;
    treeOptions.radialSegments = skeleton.radialSegments;
    treeOptions.traitOverrides = {
      height: trunk.height,
      trunkRadius: trunk.radiusBottom,
      crownWidth: canopy.width,
      crownDepth: canopy.depth,
      branchStart: skeleton.branchStart,
      branchAngle: skeleton.branchAngle,
      children: structure.armCount,
      levels: skeleton.levels,
      gnarl: trunk.gnarl,
      lean: trunk.lean,
      bend: trunk.bend,
      twist: trunk.twist,
      lengthRatio: skeleton.lengthRatio,
      radiusRatio: skeleton.radiusRatio,
      gnarliness: skeleton.gnarliness,
      forceStrength: skeleton.forceStrength,
      crownMode: structure.crownMode,
      branchWhorlSize: structure.whorlSize,
      whorlArmCount: structure.whorlSize,
      phyllotaxisAngle: skeleton.phyllotaxisAngle,
      branchInternodeSpacing: skeleton.branchInternodeSpacing,
      gravitropism: skeleton.gravitropism,
      phototropism: skeleton.phototropism,
      branchSag: skeleton.branchSag,
      tipUpturn: skeleton.tipUpturn,
      windBias: skeleton.windBias,
      pipeExponent: skeleton.pipeExponent,
      junctionBulge: skeleton.junctionBulge,
      attractionCount: skeleton.attractionCount,
      segmentLength: skeleton.segmentLength,
      influenceRadius: skeleton.influenceRadius,
      killRadius: skeleton.killRadius,
      maxNodes: skeleton.maxNodes,
      stemCount: structure.stemCount,
      nodeCount: structure.nodeCount,
      frondCount: leaves.frondCount,
    };
    const baselineControls = settings.baselineControls ?? {};
    if (Object.keys(baselineControls).length) {
      const validation = validateWoodyBaselineControlValues(baselineControls);
      if (!validation.ok) {
        throw new Error(`Invalid woody baseline settings: ${validation.errors.join(' ')}`);
      }
      treeOptions.woodyBaseline = {
        schemaVersion: WOODY_BASELINE_CONTROL_SCHEMA_VERSION,
        controls: validation.value,
      };
    }
  }

  if (plant.type === 'flower') {
    // A flower is a tree with blooms: same wood/leaf options plus the head.
    const flower = settings.flower ?? TREE_SETTING_DEFAULTS.flower;
    return {
      ...treeOptions,
      species: flower.species,
      headColor: flower.pinHeadColor ? [...flower.headColor] : null,
      headScale: flower.headScale,
    };
  }
  return treeOptions;
}

const PLANT_TYPES = new Set(['tree', 'bush', 'flower']);

export const TREE_AGE_CLASSES = Object.freeze(['young', 'mature', 'old', 'ancient', 'dead']);

function normalizePlantType(type) {
  return PLANT_TYPES.has(type) ? type : 'tree';
}

export function recipeFromSettings(settings, { taxonomy = null, surfaceLooks = null } = {}) {
  if (settings.plant.speciesProfileId) {
    return createTreeSpeciesRecipe(settings.plant.speciesProfileId, {
      foliageState: settings.plant.foliageState,
      lifeStage: settings.plant.lifeStageSlot,
      options: treeOptionsFromSettings(settings),
      seed: settings.plant.seed,
      surfaceLooks,
    });
  }
  const recipe = {
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: normalizePlantType(settings.plant.type),
    architecture: { id: 'legacy-woody', engine: 'legacy-woody', version: 2 },
    options: serializableTreeOptions(treeOptionsFromSettings(settings)),
  };
  if (taxonomy) recipe.taxonomy = JSON.parse(JSON.stringify(taxonomy));
  if (surfaceLooks) recipe.surfaceLooks = JSON.parse(JSON.stringify(surfaceLooks));
  return recipe;
}

// Which trunk style matches these explicit values? Best-effort for the UI.
export function matchTrunkStyle(trunk) {
  for (const [name, style] of Object.entries(TREE_TRUNK_STYLES)) {
    const matches = TRUNK_STYLE_KEYS.every((key) => {
      if (style[key] === undefined) return true;
      return Math.abs((trunk[key] ?? Number.NaN) - style[key]) < 1e-6;
    });
    if (matches) return name;
  }
  return 'custom';
}

function srgbTriplet(spec, seed) {
  const color = resolveCanopyColor(spec, seed).convertLinearToSRGB();
  return [color.r, color.g, color.b];
}

// Recipe options → panel state, best-effort: advanced color specs collapse to
// their seed-resolved color, unknown option keys survive only in the recipe.
export function settingsFromRecipe(recipe) {
  const settings = cloneTreeSettings();
  const options = recipe?.options ?? {};
  const type = normalizePlantType(recipe?.type);
  const defaults = TREE_SETTING_DEFAULTS;
  const woodyBaseline = options.woodyBaseline;
  if (woodyBaseline?.controls) {
    const validation = validateWoodyBaselineControlValues(woodyBaseline.controls);
    if (validation.ok) settings.baselineControls = validation.value;
  }

  settings.plant.type = type;
  if (recipe?.speciesProfileId) {
    const profile = getTreeSpeciesProfile(recipe.speciesProfileId);
    const traits = profile.structuralTraits;
    settings.plant.speciesProfileId = recipe.speciesProfileId;
    settings.plant.lifeStageSlot = recipe.lifeStageSlot ?? options.lifeStage;
    const stageIndex = profile.supportedStages.indexOf(settings.plant.lifeStageSlot);
    settings.plant.developmentProgress = options.developmentProgress
      ?? Math.max(0, stageIndex) / Math.max(1, profile.supportedStages.length - 1);
    settings.plant.foliageState = options.foliageState ?? profile.validFoliageStates[0];
    settings.plant.growthForm = WOODY_GROWTH_FORMS.includes(options.growthForm)
      ? options.growthForm
      : 'natural';
    const growthFormSubtypes = WOODY_GROWTH_FORM_SUBTYPES[settings.plant.growthForm];
    settings.plant.growthFormSubtype = growthFormSubtypes.includes(options.growthFormSubtype)
      ? options.growthFormSubtype
      : growthFormSubtypes[0];
    settings.structure.engine = profile.engine;
    settings.structure.crownMode = traits.crownMode ?? profile.axisMode;
    settings.structure.stemCount = traits.stemCount ?? settings.structure.stemCount;
    settings.structure.nodeCount = traits.nodeCount ?? settings.structure.nodeCount;
    settings.structure.armCount = traits.children ?? settings.structure.armCount;
    settings.structure.whorlSize = traits.branchWhorlSize
      ?? traits.whorlArmCount
      ?? settings.structure.whorlSize;
    settings.trunk.height = traits.height ?? settings.trunk.height;
    settings.trunk.radiusBottom = traits.trunkRadius ?? settings.trunk.radiusBottom;
    settings.trunk.gnarl = traits.gnarl ?? settings.trunk.gnarl;
    settings.trunk.lean = traits.lean ?? settings.trunk.lean;
    settings.canopy.width = traits.crownWidth ?? settings.canopy.width;
    settings.canopy.depth = traits.crownDepth ?? settings.canopy.depth;
    settings.skeleton.branchStart = traits.branchStart ?? settings.skeleton.branchStart;
    settings.skeleton.branchAngle = traits.branchAngle ?? settings.skeleton.branchAngle;
    settings.skeleton.childrenCount = traits.children ?? settings.skeleton.childrenCount;
    settings.skeleton.levels = traits.levels ?? settings.skeleton.levels;
    for (const key of [
      'phyllotaxisAngle',
      'branchInternodeSpacing',
      'gravitropism',
      'phototropism',
      'branchSag',
      'tipUpturn',
      'windBias',
      'pipeExponent',
      'junctionBulge',
    ]) {
      if (traits[key] !== undefined) settings.skeleton[key] = traits[key];
    }
    settings.leaves.frondCount = traits.frondCount ?? settings.leaves.frondCount;
    settings.leaves.density = traits.canopyDensity ?? settings.leaves.density;
    settings.leaves.architecture = profile.foliageArchitecture;
    if (traits.foliageCardSizeRange) {
      settings.leaves.cardSizeMin = traits.foliageCardSizeRange[0];
      settings.leaves.cardSizeMax = traits.foliageCardSizeRange[1]
        ?? traits.foliageCardSizeRange[0];
    }
    settings.leaves.cardsPerCluster = traits.foliageCardsPerCluster
      ?? settings.leaves.cardsPerCluster;
    settings.leaves.clusterRadius = traits.foliageClusterRadius
      ?? settings.leaves.clusterRadius;
    settings.leaves.sprayLayers = traits.foliageSprayLayers
      ?? settings.leaves.sprayLayers;
    settings.leaves.spraySpread = traits.foliageSpraySpread
      ?? settings.leaves.spraySpread;
    settings.leaves.sprayThickness = traits.foliageSprayThickness
      ?? settings.leaves.sprayThickness;
    settings.color.canopy = [...profile.foliageColor];
  }
  settings.plant.seed = options.seed ?? defaults.plant.seed;
  settings.plant.size = options.size ?? defaults.plant.size;
  settings.plant.stylePreset = typeof options.vegetationShader === 'string'
    ? options.vegetationShader
    : defaults.plant.stylePreset;

  if (options.canopyColor !== undefined) {
    settings.color.canopy = srgbTriplet(options.canopyColor, settings.plant.seed);
  }
  const palette = options.canopyPalette ?? {};
  for (const tone of ['lit', 'shadow', 'crown']) {
    if (palette[tone] !== undefined) {
      const pin = `pin${tone[0].toUpperCase()}${tone.slice(1)}`;
      settings.color[pin] = true;
      settings.color[tone] = srgbTriplet(palette[tone], settings.plant.seed);
    }
  }

  settings.leaves.density = options.leafDensity ?? settings.leaves.density;
  const canopyOptions = options.canopy ?? {};
  if (canopyOptions.architecture !== undefined) settings.leaves.architecture = canopyOptions.architecture;
  if (canopyOptions.cardCount !== undefined) settings.leaves.cardCount = canopyOptions.cardCount;
  if (canopyOptions.cardSizeRange) {
    settings.leaves.cardSizeMin = canopyOptions.cardSizeRange[0];
    settings.leaves.cardSizeMax = canopyOptions.cardSizeRange[1] ?? canopyOptions.cardSizeRange[0];
  }
  if (canopyOptions.cardsPerCluster !== undefined) settings.leaves.cardsPerCluster = canopyOptions.cardsPerCluster;
  if (canopyOptions.clusterRadius !== undefined) settings.leaves.clusterRadius = canopyOptions.clusterRadius;
  for (const key of ['frondCount', 'frondLength', 'sprayLayers', 'spraySpread',
    'sprayThickness', 'whorlArms', 'whorlRadius']) {
    if (canopyOptions[key] !== undefined) settings.leaves[key] = canopyOptions[key];
  }
  if (canopyOptions.shellFill !== undefined) settings.leaves.shellFill = canopyOptions.shellFill;

  const layout = options.canopyLayout ?? {};
  if (layout.lobeCount !== undefined) settings.canopy.lobeCount = layout.lobeCount;
  if (layout.spread !== undefined) settings.canopy.spread = layout.spread;
  if (layout.coreRadius !== undefined) settings.canopy.coreRadius = layout.coreRadius;
  if (layout.flatten !== undefined) settings.canopy.flatten = layout.flatten;

  const foliage = options.foliage ?? {};
  if (foliage.windSpeed !== undefined) settings.wind.speed = foliage.windSpeed;
  if (foliage.windStrength !== undefined) settings.wind.strength = foliage.windStrength;
  if (foliage.windDirection) {
    settings.wind.heading =
      (Math.atan2(foliage.windDirection[1], foliage.windDirection[0]) + Math.PI * 2) % (Math.PI * 2);
  }

  if (type === 'bush') {
    settings.canopy.width = options.width ?? defaults.canopy.width;
    settings.canopy.depth = options.depth ?? defaults.canopy.depth;
    settings.canopy.flatten = options.flatten ?? settings.canopy.flatten;
    return settings;
  }

  settings.canopy.width = options.canopyWidth ?? settings.canopy.width;
  settings.canopy.depth = options.canopyDepth ?? settings.canopy.depth;
  settings.canopy.canopyScale = options.canopyScale ?? settings.canopy.canopyScale;
  settings.leaves.placement = options.leafPlacement ?? settings.leaves.placement;

  const trunk = options.trunk ?? {};
  for (const key of ['height', 'radiusBottom', 'bend', 'lean', 'twist', 'gnarl']) {
    if (trunk[key] !== undefined) settings.trunk[key] = trunk[key];
  }
  settings.trunk.bendDirectionAuto = trunk.bendDirection == null;
  if (trunk.bendDirection != null) settings.trunk.bendDirection = trunk.bendDirection;
  settings.trunk.leanOffsetAuto = trunk.leanOffset == null;
  if (trunk.leanOffset != null) settings.trunk.leanOffset = trunk.leanOffset;
  settings.trunk.style = matchTrunkStyle(settings.trunk);

  const skeleton = options.skeleton ?? {};
  for (const key of ['generator', 'levels', 'childrenCount', 'branchAngle', 'branchStart',
    'lengthRatio', 'radiusRatio', 'gnarliness', 'forceStrength', 'conifer',
    'attractionCount', 'segmentLength', 'influenceRadius', 'killRadius',
    'maxNodes', 'radialSegments', 'tipRadius', 'minLimbRadius']) {
    if (skeleton[key] !== undefined) settings.skeleton[key] = skeleton[key];
  }
  settings.skeleton.attractionReachAuto = skeleton.attractionReach == null;
  if (skeleton.attractionReach != null) settings.skeleton.attractionReach = skeleton.attractionReach;

  const traitOverrides = options.traitOverrides ?? {};
  if (traitOverrides.crownMode !== undefined) {
    settings.structure.crownMode = traitOverrides.crownMode;
  }
  if (traitOverrides.branchWhorlSize !== undefined) {
    settings.structure.whorlSize = traitOverrides.branchWhorlSize;
  } else if (traitOverrides.whorlArmCount !== undefined) {
    settings.structure.whorlSize = traitOverrides.whorlArmCount;
  }
  if (traitOverrides.height !== undefined) settings.trunk.height = traitOverrides.height;
  if (traitOverrides.trunkRadius !== undefined) settings.trunk.radiusBottom = traitOverrides.trunkRadius;
  if (traitOverrides.crownWidth !== undefined) settings.canopy.width = traitOverrides.crownWidth;
  if (traitOverrides.crownDepth !== undefined) settings.canopy.depth = traitOverrides.crownDepth;
  if (traitOverrides.branchStart !== undefined) settings.skeleton.branchStart = traitOverrides.branchStart;
  if (traitOverrides.branchAngle !== undefined) settings.skeleton.branchAngle = traitOverrides.branchAngle;
  if (traitOverrides.levels !== undefined) settings.skeleton.levels = traitOverrides.levels;
  if (traitOverrides.gnarl !== undefined) settings.trunk.gnarl = traitOverrides.gnarl;
  if (traitOverrides.lean !== undefined) settings.trunk.lean = traitOverrides.lean;
  if (traitOverrides.bend !== undefined) settings.trunk.bend = traitOverrides.bend;
  if (traitOverrides.twist !== undefined) settings.trunk.twist = traitOverrides.twist;
  if (traitOverrides.lengthRatio !== undefined) settings.skeleton.lengthRatio = traitOverrides.lengthRatio;
  if (traitOverrides.radiusRatio !== undefined) settings.skeleton.radiusRatio = traitOverrides.radiusRatio;
  if (traitOverrides.gnarliness !== undefined) settings.skeleton.gnarliness = traitOverrides.gnarliness;
  if (traitOverrides.forceStrength !== undefined) settings.skeleton.forceStrength = traitOverrides.forceStrength;
  for (const key of [
    'phyllotaxisAngle',
    'branchInternodeSpacing',
    'gravitropism',
    'phototropism',
    'branchSag',
    'tipUpturn',
    'windBias',
    'pipeExponent',
    'junctionBulge',
  ]) {
    if (traitOverrides[key] !== undefined) settings.skeleton[key] = traitOverrides[key];
  }
  if (traitOverrides.attractionCount !== undefined) {
    settings.skeleton.attractionCount = traitOverrides.attractionCount;
  }
  if (traitOverrides.segmentLength !== undefined) {
    settings.skeleton.segmentLength = traitOverrides.segmentLength;
  }
  if (traitOverrides.influenceRadius !== undefined) {
    settings.skeleton.influenceRadius = traitOverrides.influenceRadius;
  }
  if (traitOverrides.killRadius !== undefined) settings.skeleton.killRadius = traitOverrides.killRadius;
  if (traitOverrides.maxNodes !== undefined) settings.skeleton.maxNodes = traitOverrides.maxNodes;
  if (traitOverrides.stemCount !== undefined) settings.structure.stemCount = traitOverrides.stemCount;
  if (traitOverrides.nodeCount !== undefined) settings.structure.nodeCount = traitOverrides.nodeCount;
  if (traitOverrides.children !== undefined) settings.structure.armCount = traitOverrides.children;
  if (traitOverrides.frondCount !== undefined) settings.leaves.frondCount = traitOverrides.frondCount;

  if (type === 'flower') {
    settings.flower.species = options.species ?? defaults.flower.species;
    settings.flower.pinHeadColor = options.headColor != null;
    if (options.headColor != null) settings.flower.headColor = [...options.headColor];
    settings.flower.headScale = options.headScale ?? defaults.flower.headScale;
  }

  return settings;
}

// Same contract as validateToonPresetDocument: { ok, value?, errors? }.
// Structural checks only — options intentionally may exceed the panel's
// slider ranges (recipes are a superset of what the UI edits).
export function upgradeTreeRecipeDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  if (input.schema !== TREE_RECIPE_SCHEMA || ![1, 2].includes(input.version)) return input;
  const options = serializableTreeOptions(input.options ?? {});
  if (input.version === 1) {
    options.canopy = {
      architecture: CANONICAL_DEFAULTS.canopy.architecture,
      sprayLayers: CANONICAL_DEFAULTS.canopy.sprayLayers,
      spraySpread: CANONICAL_DEFAULTS.canopy.spraySpread,
      sprayThickness: CANONICAL_DEFAULTS.canopy.sprayThickness,
      whorlArms: CANONICAL_DEFAULTS.canopy.whorlArms,
      whorlRadius: CANONICAL_DEFAULTS.canopy.whorlRadius,
      frondCount: CANONICAL_DEFAULTS.canopy.frondCount,
      frondLength: CANONICAL_DEFAULTS.canopy.frondLength,
      ...(options.canopy ?? {}),
    };
  }
  return {
    ...input,
    version: TREE_RECIPE_VERSION,
    architecture: { id: 'legacy-woody', engine: 'legacy-woody', version: input.version },
    options,
  };
}

export function validateTreeRecipeDocument(input, { requireIdentity = false } = {}) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Recipe document must be an object.'] };
  }
  if (input.schema !== TREE_RECIPE_SCHEMA) {
    errors.push(`schema must be "${TREE_RECIPE_SCHEMA}".`);
  }
  if (!Number.isInteger(input.version) || input.version < 1 || input.version > TREE_RECIPE_VERSION) {
    errors.push(`version must be an integer between 1 and ${TREE_RECIPE_VERSION}.`);
  }
  if (!PLANT_TYPES.has(input.type)) {
    errors.push('type must be "tree", "bush", or "flower".');
  }
  if (!input.options || typeof input.options !== 'object' || Array.isArray(input.options)) {
    errors.push('options must be an object.');
  } else if (input.options.woodyBaseline !== undefined) {
    const baseline = input.options.woodyBaseline;
    if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
      errors.push('options.woodyBaseline must be an object when present.');
    } else {
      if (baseline.schemaVersion !== WOODY_BASELINE_CONTROL_SCHEMA_VERSION) {
        errors.push(
          `options.woodyBaseline.schemaVersion must be ${WOODY_BASELINE_CONTROL_SCHEMA_VERSION}.`,
        );
      }
      const controls = validateWoodyBaselineControlValues(baseline.controls);
      if (!controls.ok) errors.push(...controls.errors);
      const ageProfile = validateWoodyBaselineAgeProfile(baseline.ageProfile);
      if (!ageProfile.ok) errors.push(...ageProfile.errors);
      const trainingProfile = validateWoodyBaselineTrainingProfile(baseline.trainingProfile);
      if (!trainingProfile.ok) errors.push(...trainingProfile.errors);
      if (baseline.inheritedControls !== undefined) {
        if (baseline.speciesProfileVersion !== WOODY_BASELINE_SPECIES_PROFILE_VERSION) {
          errors.push(
            `options.woodyBaseline.speciesProfileVersion must be ${WOODY_BASELINE_SPECIES_PROFILE_VERSION}.`,
          );
        }
        const inheritedControls = validateWoodyBaselineControlValues(
          baseline.inheritedControls,
        );
        if (!inheritedControls.ok) {
          errors.push(...inheritedControls.errors.map(
            (error) => error.replace('woodyBaseline.controls', 'woodyBaseline.inheritedControls'),
          ));
        }
      }
    }
  }
  if (input.options && typeof input.options === 'object' && !Array.isArray(input.options)) {
    const growthForm = input.options.growthForm ?? 'natural';
    if (!WOODY_GROWTH_FORMS.includes(growthForm)) {
      errors.push(`options.growthForm must be one of ${WOODY_GROWTH_FORMS.join(', ')}.`);
    } else {
      const subtypes = WOODY_GROWTH_FORM_SUBTYPES[growthForm];
      const subtype = input.options.growthFormSubtype ?? subtypes[0];
      if (!subtypes.includes(subtype)) {
        errors.push(`options.growthFormSubtype must be one of ${subtypes.join(', ')} for ${growthForm}.`);
      }
    }
  }
  // v3 architecture/species contracts apply to procedural trees and bushes.
  // Flower recipes share the historical document envelope but are generated
  // by the flower engine and therefore do not carry a tree architecture.
  if (input.version === 3 && input.type !== 'flower') {
    if (!input.architecture || typeof input.architecture !== 'object') {
      errors.push('architecture must be an object in recipe v3.');
    } else {
      for (const key of ['id', 'engine']) {
        if (typeof input.architecture[key] !== 'string' || !input.architecture[key].trim()) {
          errors.push(`architecture.${key} must be a non-empty string.`);
        }
      }
      if (!Number.isInteger(input.architecture.version) || input.architecture.version < 1) {
        errors.push('architecture.version must be a positive integer.');
      }
    }
    if (input.speciesProfileId !== undefined) {
      let profile = null;
      try {
        profile = getTreeSpeciesProfile(input.speciesProfileId);
      } catch {
        errors.push(`speciesProfileId "${input.speciesProfileId}" is not registered.`);
      }
      if (profile) {
        if (!profile.supportedStages.includes(input.lifeStageSlot)) {
          errors.push(`lifeStageSlot must be one of ${profile.supportedStages.join(', ')}.`);
        }
        if (input.architecture?.id !== profile.architectureId
          || input.architecture?.engine !== profile.engine) {
          errors.push(`architecture must match species profile ${profile.id}.`);
        }
      }
    }
  }
  if (requireIdentity) {
    if (typeof input.id !== 'string' || !input.id.trim()) errors.push('id must be a non-empty string.');
    if (typeof input.label !== 'string' || !input.label.trim()) errors.push('label must be a non-empty string.');
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    errors.push('description must be a string when present.');
  }
  if (input.taxonomy !== undefined) {
    if (!input.taxonomy || typeof input.taxonomy !== 'object' || Array.isArray(input.taxonomy)) {
      errors.push('taxonomy must be an object when present.');
    } else {
      const requiredTaxonomyKeys = input.version === 3 && input.speciesProfileId
        ? ['acceptedScientificName', 'commonName', 'family', 'genus', 'powoTaxonId', 'backboneVersion']
        : ['family', 'growthForm', 'ageClass'];
      for (const key of requiredTaxonomyKeys) {
        if (typeof input.taxonomy[key] !== 'string' || !input.taxonomy[key].trim()) {
          errors.push(`taxonomy.${key} must be a non-empty string.`);
        }
      }
    }
  }
  if (input.surfaceLooks !== undefined) {
    if (!Array.isArray(input.surfaceLooks) || input.surfaceLooks.length === 0) {
      errors.push('surfaceLooks must be a non-empty array when present.');
    } else {
      const ids = new Set();
      for (const look of input.surfaceLooks) {
        if (!look || typeof look !== 'object' || Array.isArray(look)
          || typeof look.id !== 'string' || !/^[a-z0-9-]+$/.test(look.id)) {
          errors.push('every surface look needs a lowercase path-safe id.');
          break;
        }
        if (ids.has(look.id)) errors.push(`surface look id "${look.id}" is duplicated.`);
        ids.add(look.id);
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  const upgraded = upgradeTreeRecipeDocument(input);
  const value = {
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: upgraded.type,
    options: upgraded.options,
  };
  if (upgraded.architecture) value.architecture = JSON.parse(JSON.stringify(upgraded.architecture));
  if (upgraded.speciesProfileId) value.speciesProfileId = upgraded.speciesProfileId;
  if (upgraded.lifeStageSlot) value.lifeStageSlot = upgraded.lifeStageSlot;
  if (upgraded.rootProfile) value.rootProfile = upgraded.rootProfile;
  if (upgraded.organProfiles) value.organProfiles = JSON.parse(JSON.stringify(upgraded.organProfiles));
  if (upgraded.structuralHash) value.structuralHash = upgraded.structuralHash;
  if (typeof input.id === 'string' && input.id.trim()) value.id = input.id.trim();
  if (typeof input.label === 'string' && input.label.trim()) value.label = input.label.trim();
  if (input.description) value.description = input.description;
  if (input.taxonomy) value.taxonomy = JSON.parse(JSON.stringify(input.taxonomy));
  if (input.surfaceLooks) value.surfaceLooks = JSON.parse(JSON.stringify(input.surfaceLooks));
  return { ok: true, value };
}

export function parseTreeRecipeDocument(input, options) {
  const result = validateTreeRecipeDocument(input, options);
  if (!result.ok) throw new Error(`Invalid tree recipe: ${result.errors.join(' ')}`);
  return result.value;
}

export function createTreeSpeciesRecipe(speciesProfileId, {
  lifeStage = null,
  seed = 1,
  foliageState = null,
  options = {},
  surfaceLooks = null,
} = {}) {
  const profile = getTreeSpeciesProfile(speciesProfileId);
  const lifeStageSlot = lifeStage ?? profile.supportedStages[2];
  if (!profile.supportedStages.includes(lifeStageSlot)) {
    throw new Error(
      `Unsupported life stage "${lifeStageSlot}" for ${profile.id}; expected ${profile.supportedStages.join(', ')}.`,
    );
  }
  const resolvedFoliageState = foliageState ?? profile.validFoliageStates[0];
  if (!profile.validFoliageStates.includes(resolvedFoliageState)) {
    throw new Error(
      `Unsupported foliage state "${resolvedFoliageState}" for ${profile.id}; expected ${profile.validFoliageStates.join(', ')}.`,
    );
  }
  const inheritedControls = woodyBaselineInheritedControlsForSpecies(profile);
  const ageProfile = woodyBaselineAgeProfileForSpecies(profile);
  const growthForm = WOODY_GROWTH_FORMS.includes(options.growthForm)
    ? options.growthForm
    : 'natural';
  const growthFormSubtypes = WOODY_GROWTH_FORM_SUBTYPES[growthForm];
  const growthFormSubtype = growthFormSubtypes.includes(options.growthFormSubtype)
    ? options.growthFormSubtype
    : growthFormSubtypes[0];
  const trainingProfile = woodyBaselineTrainingProfileForSpecies(
    profile,
    growthForm,
    growthFormSubtype,
  );
  const suppliedBaseline = options.woodyBaseline;
  const woodyBaseline = inheritedControls
    ? {
      schemaVersion: WOODY_BASELINE_CONTROL_SCHEMA_VERSION,
      speciesProfileVersion: WOODY_BASELINE_SPECIES_PROFILE_VERSION,
      inheritedControls,
      ageProfile,
      trainingProfile,
      controls: suppliedBaseline?.controls ?? {},
    }
    : suppliedBaseline;
  const recipe = {
    schema: TREE_RECIPE_SCHEMA,
    version: TREE_RECIPE_VERSION,
    type: 'tree',
    speciesProfileId: profile.id,
    architecture: {
      id: profile.architectureId,
      engine: profile.engine,
      version: profile.architectureVersion,
    },
    lifeStageSlot,
    rootProfile: profile.rootProfile,
    organProfiles: [profile.foliageOrgan],
    options: serializableTreeOptions({
      ...options,
      ...(woodyBaseline ? { woodyBaseline } : {}),
      seed,
      geometrySeed: options.geometrySeed ?? seed,
      speciesProfileId: profile.id,
      lifeStage: lifeStageSlot,
      foliageState: resolvedFoliageState,
      growthForm,
      growthFormSubtype,
    }),
    taxonomy: {
      acceptedScientificName: profile.scientificName,
      aliases: profile.aliases,
      commonName: profile.commonName,
      family: profile.family,
      genus: profile.genus,
      powoTaxonId: profile.taxonId,
      backboneVersion: profile.taxonomyBackbone.version,
    },
  };
  if (surfaceLooks) recipe.surfaceLooks = JSON.parse(JSON.stringify(surfaceLooks));
  return parseTreeRecipeDocument(recipe);
}

// Rebuild a plant from a recipe (or bare constructor options). Deterministic:
// the same recipe always grows the identical plant.
//   import { createPlantFromRecipe } from '@call-me-sensei/toonlab/vegetation';
function legacyPreviewOptionsForSpecies(document) {
  const profile = getTreeSpeciesProfile(document.speciesProfileId);
  const options = document.options ?? {};
  const traits = profile.structuralTraits;
  const conifer = profile.engine === 'whorled-conifer';
  const crownRatio = traits.crownWidth / Math.max(traits.height, 0.01);
  const depthRatio = traits.crownDepth / Math.max(traits.crownWidth, 0.01);
  return {
    ...options,
    preset: 'call_me_sensei',
    seed: options.geometrySeed ?? options.seed ?? 1,
    size: options.size ?? 1.7,
    canopyColor: profile.foliageColor,
    canopyDepth: Math.max(0.62, Math.min(1.3, depthRatio)),
    canopyWidth: Math.max(0.72, Math.min(1.75, crownRatio * 1.75)),
    leafDensity: Math.max(0.72, Math.min(1.25, traits.canopyDensity ?? 1)),
    leafPlacement: conifer ? 'canopy' : 'tips',
    skeleton: {
      conifer,
      generator: 'branching',
      branchAngle: traits.branchAngle ?? 55,
      branchStart: traits.branchStart ?? 0.4,
      childrenCount: Math.max(3, Math.min(8, traits.children ?? 6)),
      levels: Math.max(2, Math.min(4, traits.levels ?? 3)),
    },
    trunk: {
      ...(conifer ? TREE_TRUNK_STYLES.straight : TREE_TRUNK_STYLES.curved),
      bend: conifer ? 0.07 : Math.max(0.12, Math.min(0.32, traits.gnarl * 0.42)),
      gnarl: conifer ? 0.06 : Math.max(0.1, Math.min(0.48, traits.gnarl)),
      height: 1.9,
      lean: Math.max(0.04, Math.min(0.24, traits.lean ?? 0.12)),
      radiusBottom: conifer ? 0.17 : 0.22,
    },
  };
}

export function createPlantFromRecipe(
  recipe,
  {
    trunkMaterial = null,
    previewUnreviewedAsLegacy = false,
  } = {},
) {
  const document = recipe?.options
    ? parseTreeRecipeDocument(recipe)
    : { schema: TREE_RECIPE_SCHEMA, version: TREE_RECIPE_VERSION, type: 'tree', options: recipe ?? {} };
  if (document.type === 'bush') {
    return new StylizedBush(document.options);
  }
  if (document.type === 'flower') {
    // No bark material: the flower grows its own toon stem material.
    return new StylizedFlower(document.options);
  }
  if (document.speciesProfileId) {
    const profile = getTreeSpeciesProfile(document.speciesProfileId);
    if (previewUnreviewedAsLegacy && !profile.treeLabEnabled) {
      const preview = new StylizedTree(legacyPreviewOptionsForSpecies(document));
      preview.userData.toonlabSpeciesPreviewFallback = Object.freeze({
        requestedSpeciesProfileId: profile.id,
        runtime: 'legacy-woody',
        reason: 'morphology-needs-review',
      });
      return preview;
    }
    return new ProceduralSpeciesTree(
      trunkMaterial ? { ...document.options, trunkMaterial } : document.options,
    );
  }
  return new StylizedTree(
    trunkMaterial ? { ...document.options, trunkMaterial } : document.options,
  );
}
