import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  TREE_ARCHITECTURE_PROFILES,
  TREE_GROWTH_FORMS,
  TREE_GROWTH_FORM_SUBTYPES,
  TREE_SPECIES_PROFILES,
  compileTreeLodLevels,
  createPlantFromRecipe,
  createPlantGraph,
  createProceduralTreeLeafTexture,
  createTreeFoliageGeometry,
  createTreeSurfaceTextureData,
  createTreeSpeciesRecipe,
  parseTreeRecipeDocument,
  treeSurfaceProfileId,
  validatePlantGraph,
  validateWoodyBaselineTrainingProfile,
} from '../src/vegetation/experimental.js';
import { TREE_SETTING_FIELD_SCHEMA } from '../src/vegetation/treeRecipe.js';

assert.equal(TREE_ARCHITECTURE_PROFILES.length, 33, 'architecture profile count');
assert.equal(TREE_SPECIES_PROFILES.length, 165, 'species profile count');
assert.equal(new Set(TREE_SPECIES_PROFILES.map((profile) => profile.id)).size, 165);
assert.equal(new Set(TREE_SPECIES_PROFILES.map((profile) => profile.taxonId)).size, 165);
assert.equal(
  TREE_SPECIES_PROFILES.filter((profile) => profile.treeLabEnabled).length,
  0,
  'unreviewed v3 species remain excluded from approved catalog output',
);
assert.ok(
  TREE_SPECIES_PROFILES.every((profile) => profile.morphologyReview.status === 'needs-review'),
  'support requires explicit five-stage morphology approval',
);
assert.ok(
  TREE_SPECIES_PROFILES.every(
    (profile) => profile.morphologyReview.researchStatus === 'sources-collected'
      && profile.morphologyReview.referenceSources.length >= 3
      && profile.morphologyReview.referenceImagePath,
  ),
  'every experimental species exposes its saved reference evidence',
);
const speciesField = TREE_SETTING_FIELD_SCHEMA.plant.speciesProfileId;
assert.equal(speciesField.control, 'search-select', 'long species roster uses typeahead');
const speciesLabels = speciesField.options.slice(1).map(
  (id) => speciesField.optionLabels[id],
);
assert.equal(speciesLabels.length, 165);
assert.deepEqual(
  speciesLabels,
  [...speciesLabels].sort((left, right) => (
    left.localeCompare(right, 'en', { sensitivity: 'base' })
  )),
  'species typeahead is alphabetized by common name',
);
assert.deepEqual(
  TREE_GROWTH_FORMS,
  [
    'natural',
    'multi-stem',
    'columnar',
    'weeping',
    'pollarded',
    'coppiced',
    'bonsai',
    'topiary',
  ],
  'trained forms are separate from botanical species',
);
assert.equal(TREE_GROWTH_FORM_SUBTYPES.bonsai.length, 9);
const bonsaiRecipe = createTreeSpeciesRecipe('acer-palmatum', {
  lifeStage: 'mature',
  options: {
    growthForm: 'bonsai',
    growthFormSubtype: 'informal-upright',
  },
  seed: 41,
});
assert.equal(bonsaiRecipe.options.growthForm, 'bonsai');
assert.equal(bonsaiRecipe.options.growthFormSubtype, 'informal-upright');
assert.equal(bonsaiRecipe.options.woodyBaseline.trainingProfile.form, 'bonsai');
assert.equal(
  validateWoodyBaselineTrainingProfile(
    bonsaiRecipe.options.woodyBaseline.trainingProfile,
  ).ok,
  true,
  'species → age → training profile is serializable and valid',
);
assert.equal(
  parseTreeRecipeDocument(JSON.parse(JSON.stringify(bonsaiRecipe)))
    .options.woodyBaseline.trainingProfile.subtype,
  'informal-upright',
  'bonsai subtype round-trips through treeRecipe v3',
);
assert.equal(treeSurfaceProfileId('quercus-robur'), 'oak-fissured-v1');
assert.equal(treeSurfaceProfileId('phyllostachys-edulis'), 'bamboo-waxy-v1');
assert.equal(treeSurfaceProfileId('yucca-brevifolia'), 'yucca-fibrous-v1');
assert.equal(treeSurfaceProfileId('carnegiea-gigantea'), 'saguaro-waxy-v1');
assert.equal(
  treeSurfaceProfileId('picea-abies'),
  null,
  'surface treatments roll out only after an explicit reviewed assignment',
);
const oakSurfaceA = createTreeSurfaceTextureData({
  profileId: 'oak-fissured-v1',
  resolution: 32,
  seed: 41,
});
const oakSurfaceB = createTreeSurfaceTextureData({
  profileId: 'oak-fissured-v1',
  resolution: 32,
  seed: 41,
});
assert.deepEqual(oakSurfaceA.data, oakSurfaceB.data, 'surface textures are deterministic');
assert.equal(oakSurfaceA.width, 32);
assert.equal(oakSurfaceA.height, 64);
assert.ok(
  new Set(Array.from({ length: oakSurfaceA.width * oakSurfaceA.height }, (_, index) => (
    `${oakSurfaceA.data[index * 4]}:${oakSurfaceA.data[index * 4 + 1]}:${oakSurfaceA.data[index * 4 + 2]}`
  ))).size > 12,
  'stylized oak carries readable plate and fissure variation',
);
const bambooSurfaceA = createTreeSurfaceTextureData({
  profileId: 'bamboo-waxy-v1',
  resolution: 32,
  seed: 57,
});
const bambooSurfaceB = createTreeSurfaceTextureData({
  profileId: 'bamboo-waxy-v1',
  resolution: 32,
  seed: 57,
});
assert.deepEqual(
  bambooSurfaceA.data,
  bambooSurfaceB.data,
  'bamboo surface textures are deterministic',
);
assert.ok(
  new Set(Array.from({ length: bambooSurfaceA.width * bambooSurfaceA.height }, (_, index) => (
    `${bambooSurfaceA.data[index * 4]}:${bambooSurfaceA.data[index * 4 + 1]}:${bambooSurfaceA.data[index * 4 + 2]}`
  ))).size > 10,
  'stylized bamboo carries restrained wax and culm striation',
);
const yuccaSurfaceA = createTreeSurfaceTextureData({
  profileId: 'yucca-fibrous-v1',
  resolution: 32,
  seed: 73,
});
const yuccaSurfaceB = createTreeSurfaceTextureData({
  profileId: 'yucca-fibrous-v1',
  resolution: 32,
  seed: 73,
});
assert.deepEqual(
  yuccaSurfaceA.data,
  yuccaSurfaceB.data,
  'Joshua tree surface textures are deterministic',
);
assert.ok(
  new Set(Array.from({ length: yuccaSurfaceA.width * yuccaSurfaceA.height }, (_, index) => (
    `${yuccaSurfaceA.data[index * 4]}:${yuccaSurfaceA.data[index * 4 + 1]}:${yuccaSurfaceA.data[index * 4 + 2]}`
  ))).size > 12,
  'stylized Joshua bark carries restrained fiber and old leaf-scar variation',
);
const saguaroSurfaceA = createTreeSurfaceTextureData({
  profileId: 'saguaro-waxy-v1',
  resolution: 32,
  seed: 89,
});
const saguaroSurfaceB = createTreeSurfaceTextureData({
  profileId: 'saguaro-waxy-v1',
  resolution: 32,
  seed: 89,
});
assert.deepEqual(
  saguaroSurfaceA.data,
  saguaroSurfaceB.data,
  'saguaro epidermis textures are deterministic',
);
assert.ok(
  new Set(Array.from({ length: saguaroSurfaceA.width * saguaroSurfaceA.height }, (_, index) => (
    `${saguaroSurfaceA.data[index * 4]}:${saguaroSurfaceA.data[index * 4 + 1]}:${saguaroSurfaceA.data[index * 4 + 2]}`
  ))).size > 10,
  'stylized saguaro epidermis carries restrained wax bloom and vertical variation',
);

const candidates = [];
for (const profile of TREE_SPECIES_PROFILES) {
  assert.equal(profile.supportedStages.length, 5, `${profile.id} stage count`);
  assert.ok(profile.taxonomyBackbone.version, `${profile.id} taxonomy backbone`);
  for (let slot = 0; slot < profile.supportedStages.length; slot += 1) {
    const lifeStage = profile.supportedStages[slot];
    const id = `tree-${profile.id}-${String(slot + 1).padStart(2, '0')}`;
    const graph = createPlantGraph({
      speciesProfileId: profile.id,
      lifeStage,
      geometrySeed: slot + 11,
    });
    const repeat = createPlantGraph({
      speciesProfileId: profile.id,
      lifeStage,
      geometrySeed: slot + 11,
    });
    const validation = validatePlantGraph(graph);
    assert.equal(validation.ok, true, `${id}: ${validation.errors.join(' ')}`);
    assert.equal(graph.structuralHash, repeat.structuralHash, `${id} deterministic hash`);
    assert.deepEqual(graph.segments, repeat.segments, `${id} deterministic segments`);
    assert.ok(graph.segments.length, `${id} has structure`);
    assert.equal(
      new Set(graph.parts.map((part) => part.id)).size,
      graph.parts.length,
      `${id} stable unique part ids`,
    );
    const recipe = createTreeSpeciesRecipe(profile.id, {
      lifeStage,
      seed: slot + 11,
    });
    assert.equal(parseTreeRecipeDocument(recipe).speciesProfileId, profile.id);
    candidates.push(id);
  }
}
assert.equal(candidates.length, 825);
assert.equal(new Set(candidates).size, 825);

const youngerOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'young',
  developmentProgress: 0.28,
  geometrySeed: 913,
});
const olderOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'old',
  developmentProgress: 0.82,
  geometrySeed: 913,
});
const graphHeight = (graph) => Math.max(
  ...graph.segments.flatMap((segment) => [segment.start[1], segment.end[1]]),
);
const graphHorizontalSpan = (graph) => {
  const points = graph.segments.flatMap((segment) => [segment.start, segment.end]);
  const x = points.map((point) => point[0]);
  const z = points.map((point) => point[2]);
  return Math.max(
    Math.max(...x) - Math.min(...x),
    Math.max(...z) - Math.min(...z),
  );
};
assert.ok(graphHeight(olderOak) > graphHeight(youngerOak), 'continuous growth increases height');
assert.notEqual(olderOak.structuralHash, youngerOak.structuralHash, 'growth participates in structural hashes');
assert.equal(youngerOak.developmentProgress, 0.28);
assert.equal(olderOak.developmentProgress, 0.82);

const matureOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'mature',
  geometrySeed: 41,
});
const oldOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'old',
  geometrySeed: 41,
});
const ancientOak = createPlantGraph({
  speciesProfileId: 'quercus-robur',
  lifeStage: 'ancient',
  geometrySeed: 41,
});
const oakProfile = TREE_SPECIES_PROFILES.find((profile) => profile.id === 'quercus-robur');
assert.equal(oakProfile?.leafShape, 'oak', 'English oak uses its rounded-lobed leaf mask');
assert.equal(
  oakProfile?.structuralTraits.individualBroadleafCards,
  true,
  'English oak uses individually oriented leaves instead of compound-looking cluster sprites',
);
assert.ok(
  oakProfile?.structuralTraits.foliageCardSizeRange?.[1] <= 0.38,
  'English oak leaf cards remain leaf-scaled',
);
assert.ok(
  oakProfile?.structuralTraits.foliageCardsPerCluster >= 12,
  'English oak replaces large cluster cards with enough individual terminal leaves',
);
const oakScaffoldTopology = (graph) => graph.axes.map((axis) => ({
  id: axis.id,
  kind: axis.kind,
  parentAxisId: axis.parentAxisId,
  level: axis.level ?? null,
  terminalContinuation: axis.terminalContinuation ?? null,
}));
assert.deepEqual(
  oakScaffoldTopology(oldOak),
  oakScaffoldTopology(matureOak),
  'old English oak preserves its mature scaffold topology',
);
assert.deepEqual(
  oakScaffoldTopology(ancientOak),
  oakScaffoldTopology(matureOak),
  'ancient English oak preserves its mature scaffold topology',
);
assert.deepEqual(
  [matureOak, oldOak, ancientOak].map((graph) => graph.attachments[0]?.densityScale),
  [1.35, 1.35, 1.35],
  'English oak crown density plateaus after maturity while spray extent grows',
);
assert.deepEqual(
  [matureOak, oldOak, ancientOak].map((graph) => graph.attachments[0]?.foliageSprayScale),
  [1, 1.08, 1.12],
  'English oak leaf sprays broaden conservatively with mature age',
);
assert.ok(
  graphHeight(oldOak) > graphHeight(matureOak)
    && graphHeight(ancientOak) > graphHeight(oldOak),
  'English oak mature stages grow without replacing their scaffold',
);
assert.ok(
  matureOak.segments.filter((segment) => segment.semantic === 'trunk').length >= 7,
  'woody trunks are segmented curved axes',
);
assert.ok(
  matureOak.axes.some((axis) => axis.kind === 'crown-leader'),
  'decurrent crowns fork instead of carrying one pole through the canopy',
);
assert.equal(
  matureOak.axes.filter((axis) => axis.kind === 'crown-leader').length,
  2,
  'reviewed English oak retains its authored bifurcating crown leaders',
);
assert.ok(
  Math.max(...matureOak.axes.map((axis) => axis.level ?? 0)) >= 4,
  'reviewed English oak retains a fine terminal twig order',
);
assert.ok(
  graphHorizontalSpan(matureOak) > graphHeight(matureOak) * 0.42,
  'mature oak develops a broad crown',
);
assert.ok(
  matureOak.axes.filter((axis) => axis.level === 3).length
    > matureOak.axes.filter((axis) => axis.level === 2).length * 2,
  'reviewed English oak adds restrained secondary ramification beyond binary continuation',
);

let previousOakTerminalAxes = 0;
for (const [slot, lifeStage] of [
  [0, 'juvenile'],
  [1, 'young'],
  [2, 'mature'],
  [3, 'old'],
  [4, 'ancient'],
]) {
  const graph = createPlantGraph({
    speciesProfileId: 'quercus-robur',
    lifeStage,
    geometrySeed: slot + 11,
  });
  const maxAxisLevel = Math.max(...graph.axes.map((axis) => axis.level ?? 0));
  const terminalAxes = graph.axes.filter((axis) => axis.level === maxAxisLevel).length;
  assert.ok(
    terminalAxes >= previousOakTerminalAxes,
    `English oak ${lifeStage} does not lose terminal ramification`,
  );
  previousOakTerminalAxes = terminalAxes;
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe('quercus-robur', {
    lifeStage,
    seed: slot + 11,
  }));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    const ratios = triangles.map((count) => count / triangles[0]);
    assert.equal(compilation.report.valid, true, `English oak ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `English oak ${lifeStage} LOD triangle counts decrease`,
    );
    assert.ok(
      ratios[1] >= 0.55 && ratios[1] <= 0.78,
      `English oak ${lifeStage} LOD1 family ratio`,
    );
    assert.ok(
      ratios[2] >= 0.24 && ratios[2] <= 0.42,
      `English oak ${lifeStage} LOD2 family ratio`,
    );
  } finally {
    compilation.dispose();
  }
}

const columnarPoplar = createPlantGraph({
  speciesProfileId: 'populus-nigra',
  lifeStage: 'mature',
  geometrySeed: 41,
});
const umbrellaAcacia = createPlantGraph({
  speciesProfileId: 'vachellia-tortilis',
  lifeStage: 'mature',
  geometrySeed: 41,
});
assert.ok(
  graphHorizontalSpan(umbrellaAcacia) > graphHorizontalSpan(columnarPoplar) * 3,
  'umbrella and central-leader architectures produce different silhouettes',
);
assert.ok(
  graphHorizontalSpan(umbrellaAcacia) > graphHeight(umbrellaAcacia),
  'savanna umbrella crowns are wider than they are tall',
);

for (const version of [1, 2]) {
  const upgraded = parseTreeRecipeDocument({
    schema: 'treeRecipe',
    version,
    type: 'tree',
    options: { seed: 9 },
  });
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.architecture.engine, 'legacy-woody');
  assert.equal(upgraded.options.seed, 9);
}

const bamboo = createPlantGraph({
  speciesProfileId: 'phyllostachys-edulis',
  lifeStage: 'mixed-age-grove',
  geometrySeed: 4,
});
const bambooNodeKeys = new Set(
  bamboo.segments.filter((segment) => segment.semantic === 'node')
    .map((node) => node.end.map((value) => value.toFixed(5)).join(':')),
);
for (const branch of bamboo.segments.filter((segment) => segment.axisId.startsWith('axis')
  && segment.semantic === 'branch')) {
  assert.ok(Number.isInteger(branch.node), 'bamboo branch records its node');
  const matchingInternode = bamboo.segments.some((segment) =>
    segment.semantic === 'internode'
    && segment.culm === branch.culm
    && segment.node === branch.node
    && segment.end.every((value, index) => Math.abs(value - branch.start[index]) < 1e-7));
  assert.ok(matchingInternode, 'bamboo branches start at culm nodes');
}
assert.ok(bambooNodeKeys.size > 0);
assert.ok(bamboo.roots.some((root) => root.semantic === 'rhizome'));
assert.ok(
  new Set(bamboo.segments
    .filter((segment) => segment.semantic === 'internode')
    .map((segment) => segment.culm)).size > 3,
  'mixed-age bamboo is a culm colony',
);
const bambooShoot = createPlantGraph({
  speciesProfileId: 'phyllostachys-edulis',
  lifeStage: 'shoot',
  geometrySeed: 4,
});
assert.equal(
  bambooShoot.segments.some((segment) => segment.semantic === 'branch'),
  false,
  'bamboo shoots do not carry lateral branches',
);
assert.equal(bambooShoot.attachments.length, 0, 'bamboo shoots are not leafed culms');
const bambooRecipe = createTreeSpeciesRecipe('phyllostachys-edulis', {
  lifeStage: 'established-clump',
  seed: 4,
});
const bambooLeafTexture = createProceduralTreeLeafTexture({ seed: 4 });
const bambooPlant = createPlantFromRecipe({
  ...bambooRecipe,
  options: {
    ...bambooRecipe.options,
    foliage: { ...(bambooRecipe.options.foliage ?? {}), leafMap: bambooLeafTexture },
  },
});
const bambooCardShapes = bambooPlant.canopyMesh.geometry.getAttribute('aCardShape');
assert.ok(bambooCardShapes, 'bamboo leaves carry explicit blade aspect ratios');
assert.ok(
  Array.from({ length: bambooCardShapes.count }, (_, index) => (
    bambooCardShapes.getY(index) / Math.max(bambooCardShapes.getX(index), 1e-6)
  )).every((aspect) => aspect >= 1.5),
  'bamboo uses narrow leaf-card geometry before the alpha mask applies its additional blade taper',
);
bambooPlant.dispose();
bambooLeafTexture.dispose();

const commonBambooProfile = TREE_SPECIES_PROFILES.find(
  (profile) => profile.id === 'bambusa-vulgaris',
);
assert.ok(commonBambooProfile, 'Bambusa vulgaris profile exists');
assert.equal(commonBambooProfile.treeLabEnabled, false, 'unapproved common bamboo stays disabled');
assert.ok(
  commonBambooProfile.morphologyReview.referenceSources.some((source) => source.includes('powo.science.kew.org')),
  'common bamboo records its Kew morphology source',
);
assert.ok(
  commonBambooProfile.morphologyReview.referenceSources.some((source) => source.includes('nparks.gov.sg')),
  'common bamboo records its NParks morphology source',
);
assert.ok(
  commonBambooProfile.morphologyReview.referenceSources.filter(
    (source) => source.includes('commons.wikimedia.org/wiki/File:Bambus_vulga'),
  ).length >= 2,
  'common bamboo records exact-species shoot and culm-sheath references',
);
assert.ok(
  commonBambooProfile.morphologyReview.referenceSources.some(
    (source) => source.includes('Bambusa_vulgaris_at_veluppadam'),
  ),
  'common bamboo records an exact-species full-clump reference',
);
const commonBamboo = createPlantGraph({
  speciesProfileId: 'bambusa-vulgaris',
  lifeStage: 'established-clump',
  geometrySeed: 31,
});
const commonBambooMatureCulm = createPlantGraph({
  speciesProfileId: 'bambusa-vulgaris',
  lifeStage: 'mature-culm',
  geometrySeed: 31,
});
assert.equal(
  new Set(commonBambooMatureCulm.segments
    .filter((segment) => segment.semantic === 'internode')
    .map((segment) => segment.culm)).size,
  1,
  'the mature-culm slot remains one fully developed culm rather than a premature clump',
);
assert.equal(
  new Set(commonBamboo.segments
    .filter((segment) => segment.semantic === 'internode')
    .map((segment) => segment.culm)).size,
  Math.max(
    4,
    Math.round(
      commonBambooProfile.structuralTraits.stemCount
        * commonBambooProfile.structuralTraits.bambooCulmCountStageScales[3],
    ),
  ),
  'established common bamboo uses the reviewed clump-stage culm count',
);
const matureCulmBranchNodes = commonBambooMatureCulm.axes
  .filter((entry) => entry.kind === 'node-branch')
  .map((entry) => entry.node);
const matureCulmNodeCount = commonBambooMatureCulm.segments.filter(
  (segment) => segment.semantic === 'internode',
).length;
assert.ok(
  matureCulmBranchNodes.length > 0
    && Math.min(...matureCulmBranchNodes) / Math.max(1, matureCulmNodeCount - 1) >= 0.34
    && Math.min(...matureCulmBranchNodes) / Math.max(1, matureCulmNodeCount - 1) <= 0.43,
  'mature common bamboo begins its node-born branch complements near mid-culm',
);
assert.ok(
  commonBamboo.axes.some((entry) => entry.kind === 'node-branch' && entry.dominant),
  'common bamboo branch complements contain a dominant node branch',
);
assert.ok(
  commonBamboo.axes.some((entry) => entry.kind === 'leafy-branchlet'),
  'common bamboo produces real dendroid leafy branchlets',
);
assert.ok(
  commonBamboo.axes.some((entry) => entry.kind === 'leafy-spray'),
  'mature common bamboo branchlets fork into semantic tertiary leafy sprays',
);
const commonBambooSpraysByParent = new Map();
for (const entry of commonBamboo.axes.filter((axis) => axis.kind === 'leafy-spray')) {
  const entries = commonBambooSpraysByParent.get(entry.parentAxisId) ?? [];
  entries.push(entry);
  commonBambooSpraysByParent.set(entry.parentAxisId, entries);
}
assert.ok(
  [...commonBambooSpraysByParent.values()].every((entries) => entries.length >= 2),
  'each mature common bamboo branchlet carries at least two tertiary sprays',
);
assert.ok(
  commonBamboo.attachments.every((entry) => (
    entry.semantic !== 'bamboo-leaf'
      || (entry.cardsPerCluster >= 3 && Number.isFinite(entry.leafRunLength))
  )),
  'common bamboo ramified sprays retain explicit lanceolate leaf counts and extents',
);
const commonBambooShoot = createPlantGraph({
  speciesProfileId: 'bambusa-vulgaris',
  lifeStage: 'shoot',
  geometrySeed: 31,
});
const shootInternodes = commonBambooShoot.segments.filter(
  (segment) => segment.semantic === 'internode',
);
const shootSheaths = commonBambooShoot.segments.filter(
  (segment) => segment.semantic === 'culm-sheath',
);
assert.ok(shootInternodes.length >= 4, 'common bamboo shoot remains visibly segmented');
assert.equal(
  shootSheaths.length,
  shootInternodes.length,
  'every common bamboo shoot internode carries an overlapping culm sheath',
);
assert.ok(
  shootSheaths.every((segment) => (
    segment.geometryKind === 'culm-sheath'
      && segment.sheathWrap > Math.PI * 1.5
      && segment.sheathBladeLength > 0
  )),
  'common bamboo shoot sheaths retain open wraps and pointed blades',
);
assert.ok(
  shootInternodes[0].radiusStart > shootInternodes.at(-1).radiusEnd * 8,
  'common bamboo shoot has a strongly tapered emerging-shoot silhouette',
);

// Every bamboo development slot must survive the real compiler. In
// particular, a leafless shoot used to crash the foliage builder, while a
// mixed-age grove could exceed the LOD2 budget after adding node-born
// branches. Keep the engine-family ratio envelope here as a regression gate,
// not merely the compiler's absolute triangle caps.
for (const [slot, lifeStage] of [
  [0, 'shoot'],
  [1, 'juvenile-culm'],
  [2, 'mature-culm'],
  [3, 'established-clump'],
  [4, 'mixed-age-grove'],
]) {
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe('phyllostachys-edulis', {
    lifeStage,
    seed: slot + 8,
  }));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    const ratios = triangles.map((count) => count / triangles[0]);
    assert.equal(compilation.report.valid, true, `Moso ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `Moso ${lifeStage} LOD triangle counts decrease`,
    );
    assert.ok(
      ratios[1] >= 0.55 && ratios[1] <= 0.88,
      `Moso ${lifeStage} LOD1 family ratio`,
    );
    assert.ok(
      ratios[2] >= 0.22 && ratios[2] <= 0.7,
      `Moso ${lifeStage} LOD2 family ratio`,
    );
  } finally {
    compilation.dispose();
  }
}

for (const [slot, lifeStage] of [
  [0, 'shoot'],
  [1, 'juvenile-culm'],
  [2, 'mature-culm'],
  [3, 'established-clump'],
  [4, 'mixed-age-grove'],
]) {
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe('bambusa-vulgaris', {
    lifeStage,
    seed: slot + 31,
  }));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    assert.equal(compilation.report.valid, true, `Bambusa vulgaris ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `Bambusa vulgaris ${lifeStage} LOD triangle counts decrease`,
    );
    assert.ok(
      compilation.report.levels.every((level) => level.triangles <= level.triangleCap),
      `Bambusa vulgaris ${lifeStage} stays within the culm-colony benchmark envelope`,
    );
  } finally {
    compilation.dispose();
  }
}

const palm = createPlantGraph({
  speciesProfileId: 'cocos-nucifera',
  lifeStage: 'old',
  geometrySeed: 4,
});
assert.ok(palm.attachments.every((attachment) => attachment.semantic === 'pinnate-frond'));
assert.ok(palm.attachments.every((attachment) =>
  palm.segments.some((segment) => segment.end.every(
    (value, index) => Math.abs(value - attachment.position[index]) < 1e-7,
  ))), 'palm organs are terminal');
assert.ok(palm.attachments.every((attachment) => attachment.terminalCrown));
assert.ok(
  palm.attachments.every((attachment) => (
    attachment.leafletPairs === 34
      && attachment.crownDropScale >= 0.4
      && attachment.emergingLeafletScale <= 0.25
      && attachment.pinnaAlongJitter > 0
      && attachment.pinnaLengthJitter > 0
      && attachment.pinnaTipSweep > 0.3
      && attachment.pinnaDownfold >= 0.3
  )),
  'old coconut fronds retain dense grouped pinnae with restrained deterministic variation',
);
const palmFrondCount = palm.attachments.reduce(
  (total, attachment) => total + attachment.frondCount,
  0,
);
assert.equal(
  palm.axes.filter((axis) => axis.kind === 'terminal-frond').length,
  palmFrondCount,
  'every palm frond has a semantic rachis axis',
);
assert.ok(
  palm.segments.filter((segment) => segment.semantic === 'frond-rachis').length
    >= palmFrondCount * 4,
  'palm rachises curve through multiple segments',
);
const palmRecipe = createTreeSpeciesRecipe('cocos-nucifera', {
  lifeStage: 'old',
  seed: 4,
});
const palmLeafTexture = createProceduralTreeLeafTexture({ seed: 4 });
const palmPlant = createPlantFromRecipe({
  ...palmRecipe,
  options: {
    ...palmRecipe.options,
    foliage: { ...(palmRecipe.options.foliage ?? {}), leafMap: palmLeafTexture },
  },
});
const palmCardShapes = palmPlant.canopyMesh.geometry.getAttribute('aCardShape');
const palmCardFrames = palmPlant.canopyMesh.geometry.getAttribute('aCardFrame');
assert.ok(palmCardShapes, 'palm organs carry explicit card aspect ratios');
assert.ok(palmCardFrames, 'palm organs carry a packed fixed-orientation frame');
assert.ok(
  Array.from({ length: palmCardFrames.count }, (_, index) => palmCardFrames.getW(index))
    .every((mode) => mode === 1),
  'coconut pinnae are world-oriented organ cards rather than camera-facing canopy puffs',
);
assert.ok(
  Array.from({ length: palmCardShapes.count }, (_, index) => (
    palmCardShapes.getY(index) / Math.max(palmCardShapes.getX(index), 1e-6)
  )).some((aspect) => aspect >= 4),
  'coconut pinnae are narrow leaflets rather than broadleaf blobs',
);
palmPlant.dispose();
palmLeafTexture.dispose();
const juvenilePalm = createPlantGraph({
  speciesProfileId: 'cocos-nucifera',
  lifeStage: 'juvenile-rosette',
  geometrySeed: 4,
});
assert.ok(
  juvenilePalm.attachments.every((attachment) => (
    attachment.juvenileEntireLeaf && attachment.leafletPairs === 0
  )),
  'coconut juvenile rosettes use entire pleated leaves before pinnate fronds',
);
assert.ok(
  graphHeight(palm) > graphHeight(juvenilePalm) * 8,
  'terminal-crown development grows a trunk from a juvenile rosette',
);
const maturePalm = createPlantGraph({
  speciesProfileId: 'cocos-nucifera',
  lifeStage: 'mature',
  geometrySeed: 4,
});
assert.ok(
  maturePalm.attachments.every((attachment) => attachment.leafletPairs === 36),
  'mature coconut crown retains its reviewed pinna-group density',
);
for (const [slot, lifeStage] of [
  [0, 'juvenile-rosette'],
  [1, 'trunk-forming'],
  [2, 'young-trunk'],
  [3, 'mature'],
  [4, 'old'],
]) {
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe('cocos-nucifera', {
    lifeStage,
    seed: slot + 21,
  }));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    const ratios = triangles.map((count) => count / triangles[0]);
    assert.equal(compilation.report.valid, true, `Coconut ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `Coconut ${lifeStage} LOD triangle counts decrease`,
    );
    assert.ok(
      ratios[1] >= (slot >= 3 ? 0.65 : 0.72) && ratios[1] <= 0.99,
      `Coconut ${lifeStage} LOD1 family ratio`,
    );
    // Entire juvenile blades and early fronds preserve their silhouette with
    // far fewer cards than a mature pinnate crown. Their lower ratio is an
    // intentional terminal-crown stage rule, not a weakened global palm gate.
    const lod2Minimum = lifeStage === 'juvenile-rosette'
      ? 0.1
      : lifeStage === 'trunk-forming'
        ? 0.28
        // Dense mature coconut crowns legitimately saturate the fixed
        // terminal-crown LOD1/LOD2 caps while LOD0 continues to gain pinna
        // groups. Preserve the engine cap and monotonic reduction as the
        // hard gates rather than penalizing the higher-fidelity source mesh.
        : slot >= 3
          ? 0.3
          : 0.35;
    assert.ok(
      ratios[2] >= lod2Minimum && ratios[2] <= 0.72,
      `Coconut ${lifeStage} LOD2 family ratio`,
    );
  } finally {
    compilation.dispose();
  }
}
const clumpingPalm = createPlantGraph({
  speciesProfileId: 'rhapis-excelsa',
  lifeStage: 'mixed-age-colony',
  geometrySeed: 4,
});
assert.ok(clumpingPalm.attachments.length > 3, 'clumping palms retain multiple terminal crowns');

const conifer = createPlantGraph({
  speciesProfileId: 'picea-abies',
  lifeStage: 'ancient',
  geometrySeed: 4,
});
assert.ok(conifer.segments.filter((segment) => segment.semantic === 'branch')
  .every((segment) => Number.isInteger(segment.whorl)), 'conifer branches belong to whorls');
assert.ok(
  new Set(conifer.segments
    .filter((segment) => segment.semantic === 'branch')
    .map((segment) => segment.whorl)).size >= 6,
  'mature conifers carry repeated annual whorls',
);
assert.equal(
  new Set(conifer.segments
    .filter((segment) => segment.semantic === 'branch')
    .map((segment) => segment.whorl)).size,
  11,
  'Norway spruce retains the reviewed eleven-tier ancient crown cap',
);
assert.ok(
  [...new Set(conifer.axes
    .filter((axis) => axis.kind === 'whorl-branch')
    .map((axis) => axis.whorl))].every((whorl) => (
    conifer.axes.filter((axis) => axis.kind === 'whorl-branch' && axis.whorl === whorl)
      .length === 5
  )),
  'Norway spruce builds five pseudo-whorled boughs per annual tier',
);
assert.equal(
  conifer.attachments.filter((attachment) => (
    attachment.organType === 'conifer-leader-tip'
  )).length,
  3,
  'Norway spruce leader foliage is distributed across several upper sprays',
);

const spruceMatureRecipe = createTreeSpeciesRecipe('picea-abies', {
  lifeStage: 'mature',
  seed: 31,
});
const spruceLeafTexture = createProceduralTreeLeafTexture({ seed: 31 });
const sprucePlant = createPlantFromRecipe({
  ...spruceMatureRecipe,
  options: {
    ...spruceMatureRecipe.options,
    foliage: { ...(spruceMatureRecipe.options.foliage ?? {}), leafMap: spruceLeafTexture },
  },
});
const spruceCardShapes = sprucePlant.canopyMesh.geometry.getAttribute('aCardShape');
const spruceCardFrames = sprucePlant.canopyMesh.geometry.getAttribute('aCardFrame');
assert.ok(spruceCardShapes, 'spruce branchlets carry an explicit narrow spray silhouette');
assert.ok(spruceCardFrames, 'spruce branchlets carry orientation frames');
const spruceFrameModes = Array.from(
  { length: spruceCardFrames.count },
  (_, index) => spruceCardFrames.getW(index),
);
assert.ok(
  spruceFrameModes.some((mode) => mode === 1)
    && spruceFrameModes.some((mode) => mode === 0),
  'spruce combines world-oriented and view-robust stylized branchlet sprays',
);
assert.ok(
  Array.from({ length: spruceCardShapes.count }, (_, index) => (
    spruceCardShapes.getY(index) / Math.max(spruceCardShapes.getX(index), 1e-6)
  )).every((aspect) => aspect >= 1.5),
  'spruce foliage uses elongated needle-bearing branchlets rather than broadleaf puffs',
);
sprucePlant.dispose();
spruceLeafTexture.dispose();

let previousSpruceWhorls = 0;
for (const [slot, lifeStage] of [
  [0, 'juvenile'],
  [1, 'young'],
  [2, 'mature'],
  [3, 'old'],
  [4, 'ancient'],
]) {
  const graph = createPlantGraph({
    speciesProfileId: 'picea-abies',
    lifeStage,
    geometrySeed: slot + 12,
  });
  const branchAxes = graph.axes.filter((axis) => axis.kind === 'whorl-branch');
  const whorlCount = new Set(branchAxes.map((axis) => axis.whorl)).size;
  assert.ok(
    whorlCount >= previousSpruceWhorls,
    `Norway spruce ${lifeStage} does not lose annual whorls`,
  );
  previousSpruceWhorls = whorlCount;
  assert.equal(
    graph.axes.filter((axis) => axis.kind === 'needle-spray').length,
    branchAxes.length * 3,
    `Norway spruce ${lifeStage} distributes three sprays along every bough`,
  );
  if (slot >= 2) {
    const branchTipLifts = branchAxes.filter((axis) => {
      const segments = graph.segments.filter((segment) => segment.axisId === axis.id);
      const verticalDirection = (segment) => {
        const vector = segment.end.map((value, index) => value - segment.start[index]);
        return vector[1] / Math.max(Math.hypot(...vector), 1e-6);
      };
      return segments.length >= 2
        && verticalDirection(segments.at(-1)) > verticalDirection(segments.at(-2));
    }).length;
    assert.ok(
      branchTipLifts >= branchAxes.length * 0.8,
      `Norway spruce ${lifeStage} boughs recover upward at their tips`,
    );
  }
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe('picea-abies', {
    lifeStage,
    seed: slot + 12,
  }));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    const ratios = triangles.map((count) => count / triangles[0]);
    assert.equal(compilation.report.valid, true, `Norway spruce ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `Norway spruce ${lifeStage} LOD triangle counts decrease`,
    );
    assert.ok(
      ratios[1] >= 0.5 && ratios[1] <= 0.82,
      `Norway spruce ${lifeStage} LOD1 family ratio`,
    );
    // Conifers use a dedicated three-band support-hull proxy at LOD2. Mature
    // crowns therefore retain their tiered front/side/top silhouette with a
    // few hundred triangles instead of preserving thousands of hidden needle
    // cards. Very small juvenile sources naturally have a higher relative
    // ratio, so gate both the absolute useful range and monotonic reduction.
    assert.ok(
      triangles[2] >= 110
        && triangles[2] <= 220
        && ratios[2] >= 0.009
        && ratios[2] <= 0.34,
      `Norway spruce ${lifeStage} LOD2 family ratio`,
    );
  } finally {
    compilation.dispose();
  }
}
const ginkgo = createPlantGraph({
  speciesProfileId: 'ginkgo-biloba',
  lifeStage: 'mature',
  geometrySeed: 4,
});
assert.ok(ginkgo.attachments.every((entry) => entry.semantic === 'broad-leaf'));
assert.equal(
  ginkgo.axes.some((axis) => axis.kind === 'whorl-branch'),
  false,
  'ginkgo uses woody branching instead of conifer whorls',
);

const ficus = createPlantGraph({
  speciesProfileId: 'ficus-benghalensis',
  lifeStage: 'ancient',
  geometrySeed: 4,
});
assert.ok(ficus.roots.some((root) => root.semantic === 'aerial-root'));
assert.ok(
  ficus.segments.some((segment) => segment.algorithm === 'space-colonization'),
  'colonizing tropical crowns use an attraction-point growth field',
);

const mangrove = createPlantGraph({
  speciesProfileId: 'rhizophora-mangle',
  lifeStage: 'ancient',
  geometrySeed: 4,
});
assert.ok(mangrove.roots.some((root) => root.semantic === 'prop-root'));

let previousSaguaroHeight = 0;
for (const [lifeStage, expectedArms] of [
  ['juvenile', 0],
  ['column-forming', 0],
  ['first-branch', 1],
  ['mature', 3],
  ['old-multi-arm', 6],
]) {
  const graph = createPlantGraph({
    speciesProfileId: 'carnegiea-gigantea',
    lifeStage,
    geometrySeed: 41,
  });
  const arms = graph.axes.filter((axis) => axis.kind === 'succulent-arm');
  const stemSegments = graph.segments.filter((entry) => entry.semantic === 'succulent-stem');
  const armSegments = graph.segments.filter((entry) => entry.semantic === 'succulent-arm');
  const apices = graph.segments.filter((entry) => entry.semantic === 'succulent-apex');
  assert.equal(arms.length, expectedArms, `saguaro ${lifeStage} delayed arm count`);
  assert.equal(apices.length, expectedArms + 1, `saguaro ${lifeStage} rounded growing tips`);
  assert.ok(
    [...stemSegments, ...armSegments].every((entry) =>
      entry.geometryKind === 'ribbed' && entry.ribCount >= 14),
    `saguaro ${lifeStage} uses real 14+ rib structural geometry`,
  );
  assert.ok(graphHeight(graph) > previousSaguaroHeight, `saguaro ${lifeStage} height progression`);
  previousSaguaroHeight = graphHeight(graph);
  if (expectedArms) {
    assert.ok(
      arms.every((arm) =>
        graph.segments.filter((entry) => entry.axisId === arm.id
          && entry.semantic === 'succulent-arm').length === 5),
      `saguaro ${lifeStage} arms use a five-section quarter curve`,
    );
    assert.ok(
      armSegments.every((entry) => entry.start[1] >= graphHeight(graph) * 0.34),
      `saguaro ${lifeStage} arms originate high on the central column`,
    );
  }
  assert.ok(
    graph.attachments
      .filter((entry) => entry.semantic === 'spine')
      .some((entry) => Math.hypot(entry.position[0], entry.position[2]) > 0.1),
    `saguaro ${lifeStage} spine bundles originate on rib surfaces`,
  );
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe(
    'carnegiea-gigantea',
    { lifeStage, seed: 41 },
  ));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    assert.equal(compilation.report.valid, true, `saguaro ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `saguaro ${lifeStage} LOD triangle counts decrease`,
    );
  } finally {
    compilation.dispose();
  }
}

let previousOpuntiaPads = 0;
for (const [lifeStage, expectedPads] of [
  ['juvenile', 1],
  ['column-forming', 3],
  ['first-branch', 7],
  ['mature', 15],
  ['old-multi-arm', 24],
]) {
  const graph = createPlantGraph({
    speciesProfileId: 'opuntia-ficus-indica',
    lifeStage,
    geometrySeed: 41,
  });
  const pads = graph.segments.filter((entry) => entry.semantic === 'pad');
  const areoles = graph.attachments.filter((entry) => entry.glochidOnly);
  assert.equal(pads.length, expectedPads, `Opuntia ${lifeStage} pad count`);
  assert.ok(pads.length > previousOpuntiaPads, `Opuntia ${lifeStage} pad progression`);
  previousOpuntiaPads = pads.length;
  assert.ok(
    pads.every((pad) =>
      pad.geometryKind === 'pad'
      && Array.isArray(pad.padNormal)
      && pad.padWidth * 2 / Math.hypot(
        pad.end[0] - pad.start[0],
        pad.end[1] - pad.start[1],
        pad.end[2] - pad.start[2],
      ) >= 0.45
      && pad.padThickness / Math.max(pad.padWidth, 1e-6) <= 0.12),
    `Opuntia ${lifeStage} pads remain broad, flattened biological cladodes`,
  );
  assert.equal(areoles.length, pads.length * 6, `Opuntia ${lifeStage} sparse areole grid`);
  if (lifeStage === 'mature' || lifeStage === 'old-multi-arm') {
    assert.ok(
      graph.segments.some((entry) => entry.semantic === 'succulent-cork'),
      `Opuntia ${lifeStage} carries a cylindrical woody support trunk`,
    );
  }
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe(
    'opuntia-ficus-indica',
    { lifeStage, seed: 41 },
  ));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    assert.equal(compilation.report.valid, true, `Opuntia ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `Opuntia ${lifeStage} LOD triangle counts decrease`,
    );
  } finally {
    compilation.dispose();
  }
}

const juvenileRosette = createPlantGraph({
  speciesProfileId: 'yucca-brevifolia',
  lifeStage: 'juvenile-rosette',
  geometrySeed: 41,
});
const oldRosette = createPlantGraph({
  speciesProfileId: 'yucca-brevifolia',
  lifeStage: 'old-multi-head',
  geometrySeed: 41,
});
assert.equal(
  juvenileRosette.axes.some((axis) => axis.kind === 'rosette-dichotomy'),
  false,
);
assert.equal(juvenileRosette.attachments.length, 1, 'juveniles are one basal rosette');
assert.equal(oldRosette.attachments.length, 14, 'old Joshua trees carry fourteen terminal heads');
assert.ok(oldRosette.attachments.every((attachment) => attachment.rosetteHead));
assert.ok(
  oldRosette.attachments.every((attachment) =>
    attachment.individualRosette
      && attachment.cardsPerCluster === attachment.frondCount
      && attachment.leafWidthScale <= 0.14),
  'Joshua terminal heads are explicit dense narrow-blade rosettes',
);
assert.ok(
  graphHorizontalSpan(oldRosette) > graphHeight(oldRosette) * 0.72,
  'old Joshua trees develop a broad irregular crown instead of a vertical pole',
);
assert.ok(
  oldRosette.segments.filter((segment) => segment.semantic === 'retained-leaf-base').length
    >= oldRosette.attachments.length * 16,
  'old terminal axes retain dense dry leaf-base skirts',
);
const oldJoshuaBranchLengths = oldRosette.segments
  .filter((segment) => segment.semantic === 'rosette-branch')
  .map((segment) => Math.hypot(
    segment.end[0] - segment.start[0],
    segment.end[1] - segment.start[1],
    segment.end[2] - segment.start[2],
  ).toFixed(3));
assert.ok(
  new Set(oldJoshuaBranchLengths).size >= 8,
  'sympodial Joshua axes vary in reach instead of repeating one balanced binary fork',
);

let previousJoshuaHeads = 0;
let previousJoshuaDichotomies = 0;
for (const [slot, lifeStage, expectedHeads] of [
  [0, 'juvenile-rosette', 1],
  [1, 'unbranched-trunk', 1],
  [2, 'first-branching', 3],
  [3, 'mature-multi-head', 8],
  [4, 'old-multi-head', 14],
]) {
  const graph = createPlantGraph({
    speciesProfileId: 'yucca-brevifolia',
    lifeStage,
    geometrySeed: 41,
  });
  const dichotomies = graph.axes.filter((axis) => axis.kind === 'rosette-dichotomy').length;
  const heads = graph.attachments.filter((attachment) => attachment.rosetteHead);
  assert.equal(heads.length, expectedHeads, `Joshua tree ${lifeStage} terminal head count`);
  assert.ok(heads.length >= previousJoshuaHeads, `Joshua tree ${lifeStage} head progression`);
  assert.ok(
    dichotomies >= previousJoshuaDichotomies,
    `Joshua tree ${lifeStage} sympodial axis progression`,
  );
  assert.ok(
    heads.every((head) => head.individualRosette && head.cardsPerCluster === head.frondCount),
    `Joshua tree ${lifeStage} one-card-per-blade rosette contract`,
  );
  previousJoshuaHeads = heads.length;
  previousJoshuaDichotomies = dichotomies;

  const retainedLeaves = graph.segments
    .filter((segment) => segment.semantic === 'retained-leaf-base');
  if (slot === 0) {
    assert.equal(retainedLeaves.length, 0, 'juvenile rosette has no artificial woody skirt');
  } else {
    assert.ok(retainedLeaves.length >= 18, `Joshua tree ${lifeStage} retained leaf bases`);
    assert.ok(
      retainedLeaves.some((segment) => Math.hypot(segment.start[0], segment.start[2]) > 0.05),
      `Joshua tree ${lifeStage} retained leaves originate on the axis surface`,
    );
  }

  const recipe = createTreeSpeciesRecipe(
    'yucca-brevifolia',
    { lifeStage, seed: 41 },
  );
  const rosetteGeometry = createTreeFoliageGeometry({
    architecture: 'radial-fronds',
    attachments: heads.map((head) => ({
      direction: new THREE.Vector3(...head.direction),
      frondCount: head.frondCount,
      individualRosette: true,
      organType: head.semantic,
      position: new THREE.Vector3(...head.position),
      preserveRadialCrown: true,
      tangent: new THREE.Vector3(...head.direction),
    })),
    attachmentOverrides: Object.fromEntries(heads.map((head, index) => [index, {
      cardsPerCluster: head.cardsPerCluster,
      frondCount: head.frondCount,
      frondLength: head.size,
      individualRosette: true,
      leafWidthScale: head.leafWidthScale,
      organType: head.semantic,
    }])),
    cardsPerCluster: 4,
    cardSizeRange: [0.28, 0.58],
    clusterRadius: 0.5,
    frondCount: Math.max(...heads.map((head) => head.frondCount)),
    leafDensity: 0.96,
    seed: 41,
    shellFill: false,
  });
  try {
    const cardFrames = rosetteGeometry.getAttribute('aCardFrame');
    const cardShapes = rosetteGeometry.getAttribute('aCardShape');
    assert.ok(cardFrames?.count, `Joshua tree ${lifeStage} organ card frames`);
    assert.ok(cardShapes?.count, `Joshua tree ${lifeStage} narrow blade shapes`);
    assert.equal(
      cardFrames.count,
      heads.reduce((sum, head) => sum + head.frondCount, 0) * 4,
      `Joshua tree ${lifeStage} exactly one card per biological blade`,
    );
    for (let index = 0; index < cardFrames.count; index += 1) {
      assert.equal(cardFrames.getW(index), 1, `Joshua tree ${lifeStage} world-oriented blade`);
      assert.ok(
        cardShapes.getX(index) >= 0.035 && cardShapes.getX(index) <= 0.14,
        `Joshua tree ${lifeStage} blade aspect`,
      );
    }
  } finally {
    rosetteGeometry.dispose();
  }
  const compilation = compileTreeLodLevels(recipe);
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    assert.equal(compilation.report.valid, true, `Joshua tree ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count <= triangles[level - 1]),
      `Joshua tree ${lifeStage} LOD triangle counts do not increase`,
    );
  } finally {
    compilation.dispose();
  }
}

const matureBanana = createPlantGraph({
  speciesProfileId: 'musa-acuminata',
  lifeStage: 'mature',
  geometrySeed: 4,
});
const oldBananaClump = createPlantGraph({
  speciesProfileId: 'musa-acuminata',
  lifeStage: 'old-clump',
  geometrySeed: 4,
});
assert.ok(
  oldBananaClump.axes.filter((axis) => axis.kind === 'pseudostem').length
    > matureBanana.axes.filter((axis) => axis.kind === 'pseudostem').length,
  'old banana stages develop sucker clumps',
);

const juvenileRavenala = createPlantGraph({
  speciesProfileId: 'ravenala-madagascariensis',
  lifeStage: 'juvenile',
  geometrySeed: 37,
});
const matureRavenala = createPlantGraph({
  speciesProfileId: 'ravenala-madagascariensis',
  lifeStage: 'mature',
  geometrySeed: 37,
});
assert.ok(
  graphHeight(matureRavenala) > graphHeight(juvenileRavenala) * 5,
  'Traveller’s tree develops from a near-ground juvenile fan into a trunk-forming adult',
);
const ravenalaPetioles = matureRavenala.segments.filter(
  (segment) => segment.semantic === 'petiole',
);
const ravenalaLeaves = matureRavenala.attachments.filter(
  (attachment) => attachment.individualLeaf,
);
assert.equal(ravenalaPetioles.length, ravenalaLeaves.length);
assert.ok(ravenalaLeaves.length >= 12, 'mature Traveller’s tree carries a complete leaf fan');
assert.ok(
  ravenalaLeaves.every((leaf) => (
    leaf.semantic === 'giant-monocot-leaf'
      && Array.isArray(leaf.leafNormal)
      && leaf.cardsPerCluster === 1
  )),
  'every Traveller’s tree petiole terminates in one explicit world-oriented blade',
);
const ravenalaX = ravenalaLeaves.map((leaf) => leaf.position[0]);
const ravenalaZ = ravenalaLeaves.map((leaf) => leaf.position[2]);
const ravenalaFanWidth = Math.max(...ravenalaX) - Math.min(...ravenalaX);
const ravenalaFanDepth = Math.max(...ravenalaZ) - Math.min(...ravenalaZ);
assert.ok(
  ravenalaFanWidth > ravenalaFanDepth * 7,
  'Traveller’s tree leaves remain in a shallow two-ranked fan',
);
assert.ok(
  Math.min(...ravenalaLeaves.map((leaf) => leaf.direction[0])) < -0.75
    && Math.max(...ravenalaLeaves.map((leaf) => leaf.direction[0])) > 0.75
    && Math.max(...ravenalaLeaves.map((leaf) => leaf.direction[1])) > 0.95,
  'Traveller’s tree fan includes lateral outer leaves and an upright central spear',
);

const ravenalaRecipe = createTreeSpeciesRecipe('ravenala-madagascariensis', {
  lifeStage: 'mature',
  seed: 37,
});
const ravenalaLeafTexture = createProceduralTreeLeafTexture({ seed: 37 });
const ravenalaPlant = createPlantFromRecipe({
  ...ravenalaRecipe,
  options: {
    ...ravenalaRecipe.options,
    foliage: {
      ...(ravenalaRecipe.options.foliage ?? {}),
      leafMap: ravenalaLeafTexture,
    },
  },
});
const ravenalaCardShapes = ravenalaPlant.canopyMesh.geometry.getAttribute('aCardShape');
const ravenalaCardFrames = ravenalaPlant.canopyMesh.geometry.getAttribute('aCardFrame');
assert.equal(
  ravenalaCardShapes.count / 4,
  ravenalaLeaves.length,
  'Traveller’s tree emits one blade card per biological leaf',
);
assert.ok(
  Array.from(
    { length: ravenalaCardFrames.count },
    (_, index) => ravenalaCardFrames.getW(index),
  ).every((mode) => mode === 1),
  'Traveller’s tree blades are world-oriented rather than camera-facing puffs',
);
assert.ok(
  Array.from({ length: ravenalaCardShapes.count }, (_, index) => (
    ravenalaCardShapes.getY(index) / Math.max(ravenalaCardShapes.getX(index), 1e-6)
  )).every((aspect) => aspect >= 2),
  'Traveller’s tree uses broad elongated blades instead of broadleaf clusters',
);
const ravenalaBounds = ravenalaPlant.canopyMesh.geometry.boundingBox;
assert.ok(
  ravenalaBounds
    && ravenalaBounds.max.y - ravenalaBounds.min.y > 2,
  'large giant-monocot organs expand renderer and export bounds',
);
ravenalaPlant.dispose();
ravenalaLeafTexture.dispose();

let previousRavenalaStems = 0;
let previousRavenalaLeaves = 0;
for (const [slot, lifeStage] of [
  [0, 'juvenile'],
  [1, 'young-pseudostem'],
  [2, 'mature'],
  [3, 'sucker-clump'],
  [4, 'old-clump'],
]) {
  const graph = createPlantGraph({
    speciesProfileId: 'ravenala-madagascariensis',
    lifeStage,
    geometrySeed: slot + 19,
  });
  const stemCount = graph.axes.filter((axis) => axis.kind === 'pseudostem').length;
  const leafCount = graph.attachments.filter((attachment) => attachment.individualLeaf).length;
  assert.ok(stemCount >= previousRavenalaStems, `Traveller’s tree ${lifeStage} stem progression`);
  assert.ok(leafCount >= previousRavenalaLeaves, `Traveller’s tree ${lifeStage} leaf progression`);
  previousRavenalaStems = stemCount;
  previousRavenalaLeaves = leafCount;
  assert.equal(
    graph.axes.filter((axis) => axis.kind === 'giant-monocot-petiole').length,
    leafCount,
    `Traveller’s tree ${lifeStage} petiole-to-leaf topology`,
  );
  const compilation = compileTreeLodLevels(createTreeSpeciesRecipe(
    'ravenala-madagascariensis',
    { lifeStage, seed: slot + 19 },
  ));
  try {
    const triangles = compilation.report.levels.map((level) => level.triangles);
    const ratios = triangles.map((count) => count / triangles[0]);
    assert.equal(compilation.report.valid, true, `Traveller’s tree ${lifeStage} LOD budgets`);
    assert.ok(
      triangles.every((count, level) => level === 0 || count < triangles[level - 1]),
      `Traveller’s tree ${lifeStage} LOD triangle counts decrease`,
    );
    assert.ok(
      ratios[1] >= 0.8 && ratios[1] <= 0.96,
      `Traveller’s tree ${lifeStage} LOD1 family ratio`,
    );
    assert.ok(
      ratios[2] >= 0.38 && ratios[2] <= 0.58,
      `Traveller’s tree ${lifeStage} LOD2 family ratio`,
    );
  } finally {
    compilation.dispose();
  }
}

const representativeSpecies = [
  'quercus-robur',
  'picea-abies',
  'phyllostachys-edulis',
  'cocos-nucifera',
  'yucca-brevifolia',
  'ravenala-madagascariensis',
  'carnegiea-gigantea',
  'opuntia-ficus-indica',
];
for (const speciesId of representativeSpecies) {
  const compiled = compileTreeLodLevels(createTreeSpeciesRecipe(speciesId, { seed: 8 }));
  try {
    assert.equal(compiled.report.valid, true, `${speciesId} LOD budgets`);
    for (const level of compiled.levels) {
      level.traverse((object) => {
        if (!object.isMesh || !object.geometry.getAttribute('position')?.count) return;
        if (object.userData.toonlabSemanticRole) {
          assert.ok(object.geometry.getAttribute('toonlabPartId'), `${speciesId} semantic ids`);
        }
      });
    }
  } finally {
    compiled.dispose();
  }
}

console.log(
  `Structurally validated ${TREE_SPECIES_PROFILES.length} registered species, `
    + `${TREE_ARCHITECTURE_PROFILES.length} architectures, and ${candidates.length} deterministic `
    + 'life-stage candidates; all remain experimental and 0 count toward approved catalog output.',
);
