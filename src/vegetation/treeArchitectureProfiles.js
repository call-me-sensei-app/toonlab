export const TREE_ARCHITECTURE_ENGINE_IDS = Object.freeze([
  // The stable first-party procedural broadleaf (src/vegetation/branchTree.js).
  // It carries its own recursive four-level scaffold and its own LOD triangle
  // envelope, so it is a distinct engine rather than a legacy-woody variant.
  'branch-tree',
  'woody-axis',
  'whorled-conifer',
  'culm-colony',
  'terminal-crown',
  'branched-rosette',
  'pseudostem-fan',
  'succulent-axis',
]);

export const TREE_DEVELOPMENT_STAGE_SETS = Object.freeze({
  woody: Object.freeze(['juvenile', 'young', 'mature', 'old', 'ancient']),
  bamboo: Object.freeze([
    'shoot',
    'juvenile-culm',
    'mature-culm',
    'established-clump',
    'mixed-age-grove',
  ]),
  'terminal-crown': Object.freeze([
    'juvenile-rosette',
    'trunk-forming',
    'young-trunk',
    'mature',
    'old',
  ]),
  'clumping-palm': Object.freeze([
    'juvenile-clump',
    'established-clump',
    'mature-clump',
    'old-clump',
    'mixed-age-colony',
  ]),
  rosette: Object.freeze([
    'juvenile-rosette',
    'unbranched-trunk',
    'first-branching',
    'mature-multi-head',
    'old-multi-head',
  ]),
  pseudostem: Object.freeze([
    'juvenile',
    'young-pseudostem',
    'mature',
    'sucker-clump',
    'old-clump',
  ]),
  succulent: Object.freeze([
    'juvenile',
    'column-forming',
    'first-branch',
    'mature',
    'old-multi-arm',
  ]),
});

const DEFAULT_WOODY_TRAITS = Object.freeze({
  height: 7,
  trunkRadius: 0.32,
  crownWidth: 4.2,
  crownDepth: 3.8,
  branchStart: 0.34,
  branchAngle: 54,
  children: 5,
  levels: 3,
  canopyDensity: 0.92,
  gnarl: 0.18,
  lean: 0.06,
  stemCount: 1,
});

function architectureGrowthTraits(definition) {
  if (definition.engine === 'whorled-conifer') {
    return {
      phyllotaxisAngle: 137.5,
      branchInternodeSpacing: 0.72,
      gravitropism: 0.025,
      phototropism: 0.018,
      branchSag: 0.022,
      tipUpturn: 0.075,
      pipeExponent: 2.08,
      junctionBulge: 1.06,
    };
  }
  const byAxisMode = {
    decurrent: {
      gravitropism: 0.008,
      phototropism: 0.012,
      branchSag: 0.03,
      tipUpturn: 0.028,
    },
    sympodial: {
      gravitropism: 0.012,
      phototropism: 0.016,
      branchSag: 0.026,
      tipUpturn: 0.045,
    },
    vase: {
      gravitropism: 0.018,
      phototropism: 0.018,
      branchSag: 0.022,
      tipUpturn: 0.07,
    },
    spreading: {
      gravitropism: 0.004,
      phototropism: 0.01,
      branchSag: 0.036,
      tipUpturn: 0.018,
    },
    umbrella: {
      gravitropism: 0.002,
      phototropism: 0.008,
      branchSag: 0.034,
      tipUpturn: 0.014,
    },
    weeping: {
      gravitropism: -0.012,
      phototropism: 0.012,
      branchSag: 0.12,
      tipUpturn: 0.055,
    },
    columnar: {
      gravitropism: 0.055,
      phototropism: 0.026,
      branchSag: 0.008,
      tipUpturn: 0.16,
    },
  };
  return {
    phyllotaxisAngle: 137.5,
    branchInternodeSpacing: 0.65,
    gravitropism: 0.035,
    phototropism: 0.025,
    branchSag: 0.016,
    tipUpturn: 0.095,
    pipeExponent: 2.08,
    junctionBulge: 1.08,
    ...(byAxisMode[definition.axisMode] ?? {}),
  };
}

function architecture(definition) {
  const traits = {
    ...DEFAULT_WOODY_TRAITS,
    ...architectureGrowthTraits(definition),
    ...(definition.traits ?? {}),
  };
  return Object.freeze({
    version: 2,
    rootProfile: 'standard-flare',
    foliageOrgan: 'broad-leaf',
    foliageArchitecture: 'layered-sprays',
    leafShape: 'teardrop',
    developmentKind: 'woody',
    ...definition,
    traits: Object.freeze(traits),
    stages: TREE_DEVELOPMENT_STAGE_SETS[definition.developmentKind ?? 'woody'],
  });
}

export const TREE_ARCHITECTURE_PROFILES = Object.freeze([
  architecture({
    id: 'massive-decurrent',
    label: 'Massive decurrent crown',
    engine: 'woody-axis',
    axisMode: 'decurrent',
    traits: { height: 8.4, trunkRadius: 0.56, crownWidth: 6.8, crownDepth: 5.7, branchStart: 0.25, branchAngle: 64, gnarl: 0.42 },
  }),
  architecture({
    id: 'high-crown-excurrent',
    label: 'High-crown excurrent broadleaf',
    engine: 'woody-axis',
    axisMode: 'monopodial',
    traits: { height: 11, trunkRadius: 0.42, crownWidth: 4.8, crownDepth: 4.4, branchStart: 0.45, branchAngle: 48 },
  }),
  architecture({
    id: 'vase-arching',
    label: 'Vase and arching crown',
    engine: 'woody-axis',
    axisMode: 'vase',
    traits: { height: 9, trunkRadius: 0.44, crownWidth: 6.4, crownDepth: 5.4, branchStart: 0.22, branchAngle: 38, gnarl: 0.28 },
  }),
  architecture({
    id: 'smooth-layered',
    label: 'Smooth layered crown',
    engine: 'woody-axis',
    axisMode: 'layered',
    foliageArchitecture: 'cloud-cards',
    traits: { height: 9.4, trunkRadius: 0.43, crownWidth: 5.5, crownDepth: 4.9, branchStart: 0.34, branchAngle: 52, gnarl: 0.1 },
  }),
  architecture({
    id: 'pale-clonal',
    label: 'Pale-barked clonal crown',
    engine: 'woody-axis',
    axisMode: 'monopodial',
    traits: { height: 10.2, trunkRadius: 0.25, crownWidth: 3.3, crownDepth: 3.1, branchStart: 0.3, branchAngle: 42, children: 4, gnarl: 0.08 },
  }),
  architecture({
    id: 'riparian-central-leader',
    label: 'Riparian central leader',
    engine: 'woody-axis',
    axisMode: 'monopodial',
    traits: { height: 12.2, trunkRadius: 0.38, crownWidth: 4.1, crownDepth: 4.1, branchStart: 0.28, branchAngle: 44, canopyDensity: 0.82 },
  }),
  architecture({
    id: 'maple-rounded',
    label: 'Rounded maple crown',
    engine: 'woody-axis',
    axisMode: 'decurrent',
    foliageArchitecture: 'cloud-cards',
    leafShape: 'maple',
    traits: { height: 7.5, trunkRadius: 0.36, crownWidth: 5.1, crownDepth: 4.6, branchStart: 0.3, branchAngle: 58 },
  }),
  architecture({
    id: 'flowering-ornamental',
    label: 'Flowering ornamental structure',
    engine: 'woody-axis',
    axisMode: 'sympodial',
    traits: { height: 5.8, trunkRadius: 0.28, crownWidth: 4.7, crownDepth: 4.1, branchStart: 0.2, branchAngle: 62, gnarl: 0.22 },
  }),
  architecture({
    id: 'orchard-fruit',
    label: 'Orchard and fruit-tree structure',
    engine: 'woody-axis',
    axisMode: 'sympodial',
    foliageArchitecture: 'cloud-cards',
    traits: { height: 4.8, trunkRadius: 0.3, crownWidth: 4.4, crownDepth: 3.8, branchStart: 0.22, branchAngle: 58, gnarl: 0.3 },
  }),
  architecture({
    id: 'mediterranean-evergreen',
    label: 'Mediterranean evergreen',
    engine: 'woody-axis',
    axisMode: 'decurrent',
    traits: { height: 6.2, trunkRadius: 0.4, crownWidth: 5, crownDepth: 4.2, branchStart: 0.2, branchAngle: 64, gnarl: 0.5, canopyDensity: 0.8 },
  }),
  architecture({
    id: 'tropical-buttressed',
    label: 'Buttressed tropical emergent',
    engine: 'woody-axis',
    axisMode: 'colonized',
    rootProfile: 'buttress',
    traits: { height: 16, trunkRadius: 0.8, crownWidth: 7.2, crownDepth: 6.2, branchStart: 0.5, branchAngle: 50, children: 6 },
  }),
  architecture({
    id: 'tropical-spreading',
    label: 'Spreading tropical shade tree',
    engine: 'woody-axis',
    axisMode: 'colonized',
    foliageOrgan: 'compound-leaf',
    traits: { height: 9.5, trunkRadius: 0.5, crownWidth: 8.4, crownDepth: 6.4, branchStart: 0.22, branchAngle: 72, canopyDensity: 0.84 },
  }),
  architecture({
    id: 'ficus-aerial-root',
    label: 'Ficus with aerial roots',
    engine: 'woody-axis',
    axisMode: 'colonized',
    rootProfile: 'aerial',
    foliageArchitecture: 'cloud-cards',
    traits: { height: 10.5, trunkRadius: 0.62, crownWidth: 9, crownDepth: 7, branchStart: 0.2, branchAngle: 70, children: 6 },
  }),
  architecture({
    id: 'mangrove-specialized-root',
    label: 'Mangrove specialized roots',
    engine: 'woody-axis',
    axisMode: 'sympodial',
    rootProfile: 'prop',
    traits: { height: 6.4, trunkRadius: 0.32, crownWidth: 4.8, crownDepth: 4.2, branchStart: 0.18, branchAngle: 58, stemCount: 2 },
  }),
  architecture({
    id: 'savanna-umbrella',
    label: 'Savanna umbrella and swollen trunk',
    engine: 'woody-axis',
    axisMode: 'umbrella',
    foliageOrgan: 'compound-leaf',
    traits: { height: 7.4, trunkRadius: 0.46, crownWidth: 8.8, crownDepth: 4.1, branchStart: 0.44, branchAngle: 78, canopyDensity: 0.7, gnarl: 0.32 },
  }),
  architecture({
    id: 'eucalypt-paperbark',
    label: 'Eucalypt and paperbark open crown',
    engine: 'woody-axis',
    axisMode: 'sparse-excurrent',
    traits: { height: 13.2, trunkRadius: 0.48, crownWidth: 5.6, crownDepth: 5, branchStart: 0.42, branchAngle: 50, canopyDensity: 0.64, lean: 0.12 },
  }),
  architecture({
    id: 'dense-whorled-conifer',
    label: 'Dense whorled spruce and fir',
    engine: 'whorled-conifer',
    axisMode: 'dense',
    foliageOrgan: 'single-needle',
    foliageArchitecture: 'needle-whorls',
    leafShape: 'needle',
    traits: { height: 13.5, trunkRadius: 0.48, crownWidth: 5.2, crownDepth: 5.2, branchStart: 0.1, branchAngle: 104, children: 8, canopyDensity: 1 },
  }),
  architecture({
    id: 'open-spreading-pine',
    label: 'Open spreading pine',
    engine: 'whorled-conifer',
    axisMode: 'open',
    foliageOrgan: 'needle-fascicle',
    foliageArchitecture: 'needle-whorls',
    leafShape: 'needle',
    traits: { height: 12, trunkRadius: 0.46, crownWidth: 6.1, crownDepth: 5.3, branchStart: 0.28, branchAngle: 100, children: 6, canopyDensity: 0.72, gnarl: 0.24 },
  }),
  architecture({
    id: 'tall-sparse-pine',
    label: 'Tall sparse pine',
    engine: 'whorled-conifer',
    axisMode: 'sparse',
    foliageOrgan: 'needle-fascicle',
    foliageArchitecture: 'needle-whorls',
    leafShape: 'needle',
    traits: { height: 15, trunkRadius: 0.48, crownWidth: 4.4, crownDepth: 4.2, branchStart: 0.4, branchAngle: 98, children: 5, canopyDensity: 0.58 },
  }),
  architecture({
    id: 'scale-spray-conifer',
    label: 'Scale-leaf spray conifer',
    engine: 'whorled-conifer',
    axisMode: 'scale-spray',
    foliageOrgan: 'scale-spray',
    foliageArchitecture: 'layered-sprays',
    leafShape: 'needle',
    traits: { height: 11, trunkRadius: 0.4, crownWidth: 3.8, crownDepth: 3.5, branchStart: 0.12, branchAngle: 76, children: 8, canopyDensity: 0.95 },
  }),
  architecture({
    id: 'deciduous-wetland-conifer',
    label: 'Deciduous and wetland conifer',
    engine: 'whorled-conifer',
    axisMode: 'deciduous',
    foliageOrgan: 'single-needle',
    foliageArchitecture: 'needle-whorls',
    leafShape: 'needle',
    rootProfile: 'knees',
    traits: { height: 15, trunkRadius: 0.62, crownWidth: 5.2, crownDepth: 4.9, branchStart: 0.16, branchAngle: 94, children: 7, canopyDensity: 0.78 },
  }),
  architecture({
    id: 'giant-ancient-conifer',
    label: 'Giant and ancient conifer',
    engine: 'whorled-conifer',
    axisMode: 'giant',
    foliageOrgan: 'single-needle',
    foliageArchitecture: 'needle-whorls',
    leafShape: 'needle',
    traits: { height: 22, trunkRadius: 1.05, crownWidth: 7, crownDepth: 6.6, branchStart: 0.2, branchAngle: 92, children: 9, canopyDensity: 0.9 },
  }),
  architecture({
    id: 'specialized-relict-gymnosperm',
    label: 'Specialized relict gymnosperm',
    engine: 'whorled-conifer',
    axisMode: 'relict',
    foliageOrgan: 'single-needle',
    foliageArchitecture: 'layered-sprays',
    traits: { height: 12, trunkRadius: 0.5, crownWidth: 5, crownDepth: 4.6, branchStart: 0.2, branchAngle: 84, children: 6, canopyDensity: 0.78 },
  }),
  architecture({
    id: 'single-stem-pinnate-palm',
    label: 'Single-stem pinnate palm',
    engine: 'terminal-crown',
    axisMode: 'single-pinnate',
    developmentKind: 'terminal-crown',
    foliageOrgan: 'pinnate-frond',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'fibrous',
    traits: { height: 12, trunkRadius: 0.32, crownWidth: 5.4, crownDepth: 4.6, branchStart: 0.9, branchAngle: 74, children: 1, levels: 1, canopyDensity: 0.9, frondCount: 14 },
  }),
  architecture({
    id: 'single-stem-fan-palm',
    label: 'Single-stem fan palm',
    engine: 'terminal-crown',
    axisMode: 'single-fan',
    developmentKind: 'terminal-crown',
    foliageOrgan: 'fan-frond',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'fibrous',
    traits: { height: 10, trunkRadius: 0.38, crownWidth: 4.8, crownDepth: 4.2, branchStart: 0.9, branchAngle: 68, children: 1, levels: 1, canopyDensity: 0.88, frondCount: 16 },
  }),
  architecture({
    id: 'branching-clustering-palm',
    label: 'Branching and clustering palm',
    engine: 'terminal-crown',
    axisMode: 'clumping',
    developmentKind: 'clumping-palm',
    foliageOrgan: 'pinnate-frond',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'fibrous',
    traits: { height: 7.5, trunkRadius: 0.22, crownWidth: 5.4, crownDepth: 4.8, branchStart: 0.86, branchAngle: 68, children: 1, levels: 1, canopyDensity: 0.9, stemCount: 4, frondCount: 12 },
  }),
  architecture({
    id: 'running-temperate-bamboo',
    label: 'Running temperate bamboo',
    engine: 'culm-colony',
    axisMode: 'running',
    developmentKind: 'bamboo',
    foliageOrgan: 'bamboo-leaf',
    foliageArchitecture: 'layered-sprays',
    leafShape: 'needle',
    rootProfile: 'rhizome',
    traits: { height: 11, trunkRadius: 0.1, crownWidth: 3.5, crownDepth: 3.3, branchStart: 0.55, branchAngle: 34, children: 3, levels: 1, canopyDensity: 0.82, stemCount: 7, nodeCount: 18 },
  }),
  architecture({
    id: 'clumping-tropical-bamboo',
    label: 'Clumping and tropical bamboo',
    engine: 'culm-colony',
    axisMode: 'clumping',
    developmentKind: 'bamboo',
    foliageOrgan: 'bamboo-leaf',
    foliageArchitecture: 'layered-sprays',
    leafShape: 'needle',
    rootProfile: 'rhizome',
    traits: { height: 14, trunkRadius: 0.15, crownWidth: 4.8, crownDepth: 4.2, branchStart: 0.5, branchAngle: 36, children: 4, levels: 1, canopyDensity: 0.86, stemCount: 9, nodeCount: 20 },
  }),
  architecture({
    id: 'cycad-terminal-crown',
    label: 'Cycad terminal crown',
    engine: 'terminal-crown',
    axisMode: 'cycad',
    developmentKind: 'terminal-crown',
    foliageOrgan: 'pinnate-frond',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'coralloid',
    traits: { height: 3.4, trunkRadius: 0.38, crownWidth: 3.8, crownDepth: 3.4, branchStart: 0.9, branchAngle: 76, levels: 1, canopyDensity: 0.9, frondCount: 18 },
  }),
  architecture({
    id: 'tree-fern-terminal-crown',
    label: 'Tree fern terminal crown',
    engine: 'terminal-crown',
    axisMode: 'tree-fern',
    developmentKind: 'terminal-crown',
    foliageOrgan: 'fern-frond',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'fibrous',
    traits: { height: 6.5, trunkRadius: 0.32, crownWidth: 5.4, crownDepth: 4.8, branchStart: 0.9, branchAngle: 72, levels: 1, canopyDensity: 0.96, frondCount: 20 },
  }),
  architecture({
    id: 'branched-rosette-tree',
    label: 'Branched rosette tree',
    engine: 'branched-rosette',
    axisMode: 'multi-head',
    developmentKind: 'rosette',
    foliageOrgan: 'rosette-leaf',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'fibrous',
    traits: { height: 6.8, trunkRadius: 0.42, crownWidth: 5, crownDepth: 4.5, branchStart: 0.68, branchAngle: 48, children: 3, levels: 2, canopyDensity: 0.9, frondCount: 18 },
  }),
  architecture({
    id: 'pandanus-giant-monocot',
    label: 'Pandanus and giant monocot',
    engine: 'pseudostem-fan',
    axisMode: 'fan',
    developmentKind: 'pseudostem',
    foliageOrgan: 'giant-monocot-leaf',
    foliageArchitecture: 'radial-fronds',
    rootProfile: 'fibrous',
    traits: { height: 7.5, trunkRadius: 0.45, crownWidth: 5.6, crownDepth: 4.8, branchStart: 0.7, branchAngle: 52, children: 2, levels: 1, canopyDensity: 0.95, stemCount: 2, frondCount: 16 },
  }),
  architecture({
    id: 'tree-form-cactus',
    label: 'Tree-form cactus',
    engine: 'succulent-axis',
    axisMode: 'columnar',
    developmentKind: 'succulent',
    foliageOrgan: 'spine',
    foliageArchitecture: 'layered-sprays',
    rootProfile: 'shallow-radial',
    traits: { height: 7.5, trunkRadius: 0.38, crownWidth: 3.8, crownDepth: 3.3, branchStart: 0.4, branchAngle: 18, children: 4, levels: 1, canopyDensity: 0, stemCount: 1 },
  }),
]);

export const TREE_ARCHITECTURE_PROFILE_BY_ID = Object.freeze(
  Object.fromEntries(TREE_ARCHITECTURE_PROFILES.map((profile) => [profile.id, profile])),
);

if (TREE_ARCHITECTURE_PROFILES.length !== 33) {
  throw new Error(`Tree architecture registry must contain 33 profiles; received ${TREE_ARCHITECTURE_PROFILES.length}.`);
}
if (new Set(TREE_ARCHITECTURE_PROFILES.map((profile) => profile.id)).size !== 33) {
  throw new Error('Tree architecture profile ids must be unique.');
}
for (const profile of TREE_ARCHITECTURE_PROFILES) {
  if (!TREE_ARCHITECTURE_ENGINE_IDS.includes(profile.engine)) {
    throw new Error(`Unknown tree architecture engine "${profile.engine}" for ${profile.id}.`);
  }
  if (!profile.stages || profile.stages.length !== 5) {
    throw new Error(`Tree architecture ${profile.id} must define exactly five life stages.`);
  }
}

export function getTreeArchitectureProfile(id) {
  const profile = TREE_ARCHITECTURE_PROFILE_BY_ID[id];
  if (!profile) throw new Error(`Unknown tree architecture profile: ${id}`);
  return profile;
}
