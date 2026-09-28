import {
  TREE_ARCHITECTURE_PROFILES,
  TREE_ARCHITECTURE_PROFILE_BY_ID,
  getTreeArchitectureProfile,
} from './treeArchitectureProfiles.js';
import { TREE_SPECIES_ROSTER } from './treeSpeciesRoster.js';
import {
  TREE_SPECIES_TAXONOMY,
  TREE_SPECIES_TAXONOMY_SOURCE,
} from './treeSpeciesTaxonomy.generated.js';
import { TREE_SPECIES_RESEARCH } from './treeSpeciesResearch.generated.js';

const EVERGREEN_GENERA = new Set([
  'Abies', 'Agathis', 'Araucaria', 'Arbutus', 'Borassus', 'Carnegiea',
  'Cedrus', 'Cereus', 'Chamaecyparis', 'Chamaerops', 'Cocos', 'Cordyline',
  'Cupressus', 'Cycas', 'Dioon', 'Dracaena', 'Elaeis', 'Encephalartos',
  'Ficus', 'Juniperus', 'Laurus', 'Livistona', 'Macrozamia', 'Mangifera',
  'Olea', 'Opuntia', 'Pachycereus', 'Phoenix', 'Pinus', 'Podocarpus',
  'Roystonea', 'Sabal', 'Sequoia', 'Sequoiadendron', 'Stenocereus',
  'Thuja', 'Trachycarpus', 'Washingtonia', 'Wollemia', 'Yucca',
]);
const AUTUMN_GENERA = new Set([
  'Acer', 'Alnus', 'Betula', 'Carpinus', 'Castanea', 'Celtis', 'Cornus',
  'Fagus', 'Fraxinus', 'Ginkgo', 'Juglans', 'Larix', 'Liquidambar', 'Malus',
  'Metasequoia', 'Paulownia', 'Populus', 'Prunus', 'Pyrus', 'Quercus',
  'Salix', 'Taxodium', 'Tilia', 'Ulmus', 'Zelkova',
]);
const WET_DRY_ARCHITECTURES = new Set([
  'mangrove-specialized-root', 'savanna-umbrella', 'eucalypt-paperbark',
  'tropical-buttressed', 'tropical-spreading',
]);
const TEMPERATE_DECIDUOUS_GENERA = new Set([
  ...AUTUMN_GENERA,
  'Cercis', 'Diospyros', 'Liriodendron', 'Magnolia',
]);
const EVERGREEN_SPECIES = new Set([
  'quercus-ilex',
  'quercus-suber',
]);

const BASE_PALETTES = Object.freeze({
  'woody-axis': Object.freeze([0.25, 0.55, 0.25]),
  'whorled-conifer': Object.freeze([0.17, 0.43, 0.24]),
  'culm-colony': Object.freeze([0.32, 0.64, 0.22]),
  'terminal-crown': Object.freeze([0.20, 0.52, 0.23]),
  'branched-rosette': Object.freeze([0.24, 0.47, 0.26]),
  'pseudostem-fan': Object.freeze([0.25, 0.61, 0.27]),
  'succulent-axis': Object.freeze([0.31, 0.55, 0.30]),
});

export const TREE_SPECIES_MORPHOLOGY_REVIEW_VERSION = 2;

// A species is not a supported Tree Lab preset merely because its taxonomy
// and recipe compile. IDs move into this set only after all five stages pass
// deterministic structural/export gates and front/side/back morphology review
// against botanical references. The v3 roster intentionally starts closed:
// catalog QA can render every candidate, while the public selector cannot
// promise species fidelity before a human has approved it.
const MORPHOLOGY_APPROVED_SPECIES = new Set([]);
const MORPHOLOGY_REFERENCE_SOURCES = Object.freeze({
  'quercus-robur': Object.freeze([
    'https://commons.wikimedia.org/wiki/File:Quercus_robur_-_alone_tree.jpg',
    'https://commons.wikimedia.org/wiki/File:Solitaire_eik_(Quercus_robur)_in_een_imponerend_landschap._Locatie,_natuurgebied_Delleboersterheide_%E2%80%93_Catspoele_01.jpg',
  ]),
  'cocos-nucifera': Object.freeze([
    'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:666160-1/general-information',
    'https://ntbg.org/database/plants/detail/cocos-nucifera',
    'https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5618',
  ]),
  'phyllostachys-edulis': Object.freeze([
    'https://www.gbif.org/occurrence/6159209360',
    'https://www.gbif.org/occurrence/6334271941',
    'https://www.gbif.org/occurrence/6352779781',
  ]),
  'bambusa-vulgaris': Object.freeze([
    'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:392574-1/general-information',
    'https://www.nparks.gov.sg/florafaunaweb/flora/3/6/3600',
    'https://www.gbif.org/occurrence/6129969906',
    'https://www.gbif.org/occurrence/6130107524',
    'https://www.gbif.org/occurrence/6130443196',
    'https://commons.wikimedia.org/wiki/File:Bambus_vulga_160426-0195_tdp.JPG',
    'https://commons.wikimedia.org/wiki/File:Bambus_vulga_160426-0203_tdp.JPG',
    'https://commons.wikimedia.org/wiki/File:Starr_030807-0120_Bambusa_vulgaris.jpg',
    'https://commons.wikimedia.org/wiki/File:Bambusa_vulgaris_at_veluppadam.JPG',
  ]),
  'picea-abies': Object.freeze([
    'https://www.gbif.org/occurrence/5938035985',
    'https://www.gbif.org/occurrence/5938051400',
    'https://www.gbif.org/occurrence/5938054982',
  ]),
  'ravenala-madagascariensis': Object.freeze([
    'https://www.gbif.org/occurrence/5938249151',
    'https://www.gbif.org/occurrence/6130377268',
    'https://www.gbif.org/occurrence/6130732166',
  ]),
  'yucca-brevifolia': Object.freeze([
    'https://www.gbif.org/occurrence/5938040364',
    'https://www.gbif.org/occurrence/5938093501',
    'https://www.gbif.org/occurrence/5938098122',
    'https://www.gbif.org/occurrence/5938201514',
  ]),
  'carnegiea-gigantea': Object.freeze([
    'https://home.nps.gov/sagu/learn/nature/how-saguaros-grow.htm',
    'https://www.nps.gov/sagu/learn/nature/saguaro-growth.htm',
    'https://arboretum.arizona.edu/snyder-preserve-carnegiea-gigantea',
    'https://www.gbif.org/occurrence/5938027770',
    'https://www.gbif.org/occurrence/5938030535',
    'https://www.gbif.org/occurrence/5938049800',
  ]),
  'opuntia-ficus-indica': Object.freeze([
    'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1151735-2/general-information',
    'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1151735-2/images',
    'https://www.gbif.org/occurrence/5938150722',
    'https://www.gbif.org/occurrence/5938201188',
    'https://www.gbif.org/occurrence/5938264278',
  ]),
});

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function noise(hash, shift) {
  let value = (hash ^ Math.imul(shift + 1, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 3266489917) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function speciesTraits(roster, architecture) {
  const hash = hashString(roster.id);
  const genus = roster.scientificName.split(/\s+/)[0];
  const vary = (value, amount, shift) => Number(
    (value * (1 + (noise(hash, shift) * 2 - 1) * amount)).toFixed(4),
  );
  const traits = {};
  for (const [key, value] of Object.entries(architecture.traits)) {
    traits[key] = typeof value === 'number' ? value : value;
  }
  for (const [index, key] of [
    'height', 'trunkRadius', 'crownWidth', 'crownDepth', 'branchAngle',
    'branchStart', 'canopyDensity', 'gnarl', 'lean',
  ].entries()) {
    if (Number.isFinite(traits[key])) {
      const amount = key === 'height' || key === 'crownWidth' ? 0.16 : 0.10;
      traits[key] = vary(traits[key], amount, index);
    }
  }
  if (Number.isFinite(traits.children)) {
    traits.children = Math.max(1, Math.round(vary(traits.children, 0.18, 12)));
  }
  if (Number.isFinite(traits.stemCount)) {
    traits.stemCount = Math.max(1, Math.round(vary(traits.stemCount, 0.22, 13)));
  }
  if (Number.isFinite(traits.nodeCount)) {
    traits.nodeCount = Math.max(4, Math.round(vary(traits.nodeCount, 0.16, 14)));
  }
  if (Number.isFinite(traits.frondCount)) {
    traits.frondCount = Math.max(5, Math.round(vary(traits.frondCount, 0.18, 15)));
  }

  // Species-defining structural differences which cannot be expressed by
  // cohort jitter alone.
  if (roster.id === 'quercus-robur') {
    // Whole-tree summer and dormant references show a stout lower bole that
    // divides into broad, subhorizontal scaffold limbs. The recursive growth
    // still needs overlapping terminal masses, but the lower scaffold must
    // stay readable through deliberate canopy windows.
    traits.height = 7.8;
    traits.trunkRadius = 0.46;
    traits.crownWidth = 8.1;
    traits.crownDepth = 6.8;
    traits.branchStart = 0.5;
    traits.branchAngle = 79;
    traits.children = 5;
    traits.primaryBranchCount = 4;
    traits.lateralChildTarget = 3;
    traits.minBranchLength = 0.04;
    traits.minBranchRadiusScale = 0.25;
    traits.stableMatureTopology = true;
    traits.levels = 4;
    traits.axisBudget = 150;
    traits.canopyDensity = 0.9;
    traits.gnarl = 0.42;
    traits.lean = 0.045;
    traits.trunkHeightScale = 0.46;
    traits.baseFlare = 1.4;
    traits.baseFlareTransition = 0.38;
    traits.primaryReachScale = 1.58;
    traits.crownLeaderCount = 2;
    traits.crownLeaderAngleScale = 0.94;
    traits.crownLeaderLengthScale = 0.78;
    traits.evenBranchDistribution = false;
    traits.branchSpawnEnd = 0.84;
    traits.branchNoise = 0.14;
    traits.trunkNoise = 0.065;
    traits.endpointGrowthBias = 0.01;
    traits.forceStrength = 0.01;
    traits.levelLengthDecay = 0.52;
    traits.levelRadiusDecay = 0.71;
    traits.levelChildDecay = 0.82;
    traits.branchingExponent = 1.08;
    traits.lateralSpawnStart = 0.22;
    traits.lateralSpawnStartLate = 0.34;
    traits.lateralSpawnEnd = 0.88;
    traits.lateralSpawnEndLate = 0.8;
    traits.additionalLateralChanceByLevel = { 2: 0.42, 3: 0.25 };
    traits.individualBroadleafCards = true;
    traits.foliageCardsPerCluster = 12;
    traits.foliageCardSizeRange = [0.25, 0.38];
    traits.foliageClusterRadius = 0.76;
    traits.foliageDensityScaleStages = [0.5, 0.85, 1.35, 1.35, 1.35];
    traits.foliageSprayScaleStages = [0.48, 0.72, 1, 1.08, 1.12];
    traits.foliageSprayLayers = 3;
    traits.foliageSpraySpread = 0.84;
    traits.foliageSprayThickness = 0.17;
  }
  if (genus === 'Acer' && roster.id !== 'acer-palmatum') {
    // Full-size maples build a rounded crown from several co-dominant
    // scaffold axes and a dense fourth order of fine opposite shoots.
    traits.levels = 4;
    traits.axisBudget = 420;
    traits.crownLeaderCount = 3;
    traits.primaryBranchCount = 11;
    traits.branchInternodeSpacing = 0.42;
    traits.stableMatureTopology = true;
    traits.branchSag = 0.025;
    traits.tipUpturn = 0.15;
    traits.foliageCardsPerCluster = 10;
    traits.foliageClusterRadius = 0.66;
  }
  if (roster.id === 'acer-palmatum') {
    // Whole-plant references show a small, broad ornamental tree with one
    // short bole, fine ascending scaffold branches, irregular layered crown
    // margins, and comparatively small palmate leaves. It must not inherit
    // the two-leader massive-maple proportions used by larger Acer species.
    traits.height = 3.8;
    traits.trunkRadius = 0.09;
    traits.crownWidth = 5.2;
    traits.crownDepth = 4.1;
    traits.branchStart = 0.1;
    traits.branchAngle = 70;
    traits.children = 5;
    traits.levels = 4;
    traits.axisBudget = 280;
    traits.canopyDensity = 0.82;
    traits.gnarl = 0.28;
    traits.lean = 0.07;
    traits.stemCount = 1;
    traits.crownLeaderCount = 3;
    traits.primaryBranchCount = 6;
    traits.branchInternodeSpacing = 0.42;
    traits.evenBranchDistribution = false;
    traits.branchSpawnEnd = 0.86;
    traits.branchingExponent = 0.92;
    traits.tipUpturn = 0.12;
    traits.foliageCardsPerCluster = 8;
    traits.foliageCardSizeRange = [0.34, 0.56];
    traits.foliageClusterRadius = 0.42;
    traits.baselineCrownProfile = 'inverse-curved';
    traits.baselineBranchLength = 22;
    traits.baselineBranchWidth = 0.45;
    traits.baselineChildLengthBoost = 0.66;
    traits.baselineBranchDensity = 10.5;
    traits.baselineRootScale = 0.1;
    traits.baselineFoliageDensity = 7.8;
  }
  if (roster.id === 'phyllostachys-edulis') {
    // The archived grove observations show tall, mostly upright gray-green
    // culms with legible internodes and a permeable upper crown. Keep leaf
    // sprays compact enough that node-born branches remain visible instead
    // of merging into a single spherical canopy.
    traits.height = 10.9;
    traits.trunkRadius = 0.105;
    traits.crownWidth = 3.7;
    traits.crownDepth = 3.25;
    traits.branchStart = 0.58;
    traits.branchNodeInterval = 1;
    traits.children = 2;
    traits.canopyDensity = 0.68;
    traits.lean = 0.042;
    traits.stemCount = 8;
    traits.nodeCount = 20;
    traits.foliageCardsPerCluster = 6;
    traits.foliageCardSizeRange = [0.13, 0.24];
    traits.foliageClusterRadius = 0.22;
    traits.foliageSprayLayers = 3;
    traits.foliageSpraySpread = 0.34;
    traits.foliageSprayThickness = 0.1;
  }
  if (roster.id === 'bambusa-vulgaris') {
    // Kew and NParks describe a large, erect but moderately open pachymorph
    // clump: mostly cylindrical 4–10 cm culms, several node-born branches
    // with one dominant axis, and lanceolate leaves distributed along
    // repeatedly forked fine sprays. The slightly enlarged stylized culm
    // radius remains conservative enough to read at Tree Lab scale without
    // becoming a pole.
    traits.height = 13.6;
    traits.trunkRadius = 0.07;
    traits.crownWidth = 5.2;
    traits.crownDepth = 4.7;
    traits.branchStart = 0.36;
    traits.branchNodeInterval = 1;
    traits.children = 4;
    traits.canopyDensity = 0.96;
    traits.lean = 0.052;
    traits.stemCount = 11;
    traits.nodeCount = 24;
    traits.bambooCulmCountStageScales = [1, 1, 1, 0.82, 1];
    traits.culmColonySpread = 0.32;
    traits.culmTaperStart = 0.72;
    traits.culmTipTaper = 0.44;
    traits.bambooHeightStages = [0.045, 0.43, 0.76, 0.94, 1];
    traits.bambooNodeStages = [0.24, 0.5, 0.78, 0.92, 1];
    traits.bambooRadiusStages = [1, 0.78, 0.9, 0.96, 1];
    traits.shootBaseRadiusScale = 1.55;
    traits.shootTipRadiusScale = 0.1;
    traits.culmSheathBodyScale = 1.08;
    traits.culmSheathBladeLength = 0.58;
    traits.culmSheathBladeOutset = 1.38;
    traits.culmSheathColor = [0.38, 0.43, 0.12];
    traits.juvenileBranchStart = 0.3;
    // B. vulgaris develops several branch complements from the mid-culm
    // upward. Keep the mature single culm open below that zone, then let
    // the shorter culms in established and mixed-age clumps begin slightly
    // lower so the full colony does not become a transparent topiary.
    traits.bambooBranchStartStages = [1, 0.3, 0.36, 0.34, 0.3];
    traits.juvenileBranchesPerNode = 2;
    traits.juvenileDominantBranchlets = 3;
    traits.juvenileSecondaryBranchlets = 2;
    traits.dominantBranchScale = 1;
    traits.secondaryBranchScale = 0.62;
    traits.dominantBranchElevation = -0.08;
    traits.secondaryBranchElevation = 0.08;
    traits.dominantBranchElevationJitter = 0.4;
    traits.secondaryBranchElevationJitter = 0.45;
    traits.bambooBranchLengthBase = 0.18;
    traits.bambooBranchLengthHeight = 0.025;
    traits.bambooBranchLengthJitter = 0.16;
    traits.bambooCrownEnvelopeBase = 0.5;
    traits.bambooCrownEnvelopeAmplitude = 0.82;
    traits.bambooBranchTipDroop = 0.25;
    traits.bambooBranchletElevation = -0.22;
    traits.bambooBranchletElevationStep = 0.012;
    traits.bambooBranchletElevationJitter = 0.5;
    traits.bambooBranchletLengthScale = 0.42;
    traits.bambooTertiarySprayCount = 2;
    traits.bambooTertiaryAzimuth = 0.5;
    traits.bambooTertiaryElevationSpread = 0.24;
    traits.bambooTertiaryElevationJitter = 0.28;
    traits.bambooTertiaryLengthScale = 0.58;
    traits.dominantBranchletCount = 4;
    traits.secondaryBranchletCount = 2;
    traits.bambooBranchReachScale = 1.72;
    traits.bambooJuvenileLeafCount = 10;
    traits.bambooPrimaryLeafCount = 6;
    traits.bambooTertiaryLeafCount = 6;
    traits.bambooLeafLengthScale = 1.3;
    traits.bambooSingleBladeCards = true;
    traits.bambooLeafWidthScale = 1.04;
    traits.bambooLeafRunScale = 0.72;
    traits.foliageCardsPerCluster = 9;
    traits.foliageCardSizeRange = [0.65, 0.9];
    traits.foliageClusterRadius = 0.48;
    traits.foliageSprayLayers = 4;
    traits.foliageSpraySpread = 0.42;
    traits.foliageSprayThickness = 0.12;
  }
  if (roster.id === 'picea-abies') {
    // Norway spruce references show a straight monopodial leader, a narrow
    // conical crown, drooping annual branch whorls, pendant secondary sprays,
    // and short upturned branch tips. Use compact needle bundles so the
    // authored bough hierarchy remains visible instead of becoming a stack
    // of broadleaf-like spherical puffs.
    traits.height = 13.8;
    traits.trunkRadius = 0.38;
    traits.crownWidth = 5.8;
    traits.crownDepth = 5.5;
    traits.branchStart = 0.1;
    traits.branchSpawnEnd = 0.98;
    traits.branchAngle = 106;
    traits.children = 7;
    traits.whorlArmCount = 5;
    traits.canopyDensity = 0.92;
    traits.gnarl = 0.08;
    traits.lean = 0.015;
    traits.whorlCountMax = 11;
    traits.branchSections = 4;
    traits.branchDroop = 0.022;
    traits.branchTipLift = 0.085;
    traits.sprayCount = 3;
    traits.sprayDroop = 0.2;
    traits.foliageCardsPerCluster = 5;
    // One card represents a compact needle-bearing branchlet, not one
    // literal needle. This is the smallest readable unit at Tree Lab and
    // catalog distances while preserving the characteristic narrow spray.
    traits.foliageCardSizeRange = [0.68, 0.92];
    traits.foliageClusterRadius = 0.48;
    traits.foliageWhorlRadius = 0.2;
    traits.leaderSprayCount = 3;
    traits.leaderSprayStart = 0.9;
    traits.leaderCardsPerCluster = 4;
    traits.leaderClusterRadius = 0.12;
    traits.leaderWhorlRadius = 0.055;
    // A five-sided stylized tube keeps all annual-whorl centerlines while
    // leaving enough of the fixed LOD2 support-hull budget to preserve the
    // reviewed conifer family ratio through ancient stages.
    traits.radialSegments = 5;
  }
  if (roster.id === 'adansonia-digitata' || roster.id === 'adansonia-grandidieri') {
    traits.trunkRadius *= 2.4;
    traits.crownDepth *= 0.72;
    traits.branchStart = 0.58;
  }
  if (roster.id === 'pinus-pinea') {
    traits.branchStart = 0.62;
    traits.crownWidth *= 1.35;
    traits.crownDepth *= 0.65;
  }
  if (roster.id === 'cupressus-sempervirens') {
    traits.crownWidth *= 0.48;
    traits.crownDepth *= 0.55;
    traits.height *= 1.14;
  }
  if (roster.id === 'nypa-fruticans') {
    traits.height *= 0.38;
    traits.trunkRadius *= 0.55;
    traits.stemCount = 7;
    traits.acaulescent = true;
  }
  if (roster.id === 'hyphaene-thebaica') traits.dichotomousBranching = true;
  if (roster.id === 'cocos-nucifera') {
    // Full-tree NTBG and GBIF references constrain the readable coconut
    // silhouette to a broad, heavy crown on a moderately slender stem. Keep
    // the old stage capable of becoming tall, but do not let the cohort's
    // generic palm height turn every stage into a pole with a small umbrella.
    traits.height *= 0.52;
    traits.trunkRadius *= 0.68;
    traits.crownWidth *= 1.38;
    traits.crownDepth *= 1.18;
    // The stylized crown stays inside the botanical 20–40-leaf range. Each
    // card represents a small group of the real frond's 90–120 pinnae per
    // side, keeping the feather silhouette readable within the LOD0 budget.
    traits.frondCount = Math.max(26, traits.frondCount);
    traits.frondCountStages = [7, 15, 20, 24, 26];
    traits.leafletPairs = 32;
    traits.leafletPairsStages = [0, 20, 32, 36, 34];
    traits.leafletLengthRatio = 0.32;
    traits.leafletLengthScale = 1.1;
    traits.leafletWidthScale = 0.78;
    traits.pinnaAlongJitter = 0.3;
    traits.pinnaLengthJitter = 0.12;
    traits.pinnaTipSweep = 0.36;
    traits.pinnaDownfold = 0.34;
    traits.pinnaDownfoldJitter = 0.06;
    traits.pinnaRoll = 0.2;
    traits.palmRachisColor = [0.26, 0.43, 0.11];
    traits.palmLean = 0.085;
    traits.palmCurve = 0.034;
    traits.palmBaseFlare = 0.3;
    traits.crownArch = 0.34;
    traits.crownDroop = 0.82;
    traits.crownDropScale = 0.42;
    traits.emergingLeafletScale = 0.22;
    traits.uprightFrondFraction = 0.25;
    traits.juvenileEntireLeaves = true;
    traits.terminalHeightStages = [0.008, 0.15, 0.44, 0.68, 0.86];
  }
  if (roster.id === 'phoenix-dactylifera' || roster.id === 'elaeis-guineensis') {
    traits.retainedLeafBases = true;
    traits.crownDroop = 0.58;
  }
  if (roster.id === 'roystonea-regia') traits.crownshaft = true;
  if (roster.id === 'carnegiea-gigantea') {
    // NPS life-cycle imagery establishes an extremely delayed arm program:
    // decades as a short column, a tall unbranched spear, then high-origin
    // arms that curve upward while the central leader remains dominant.
    // University of Arizona measurements constrain the adult to 12–25 ribs
    // and a 30–60 cm trunk diameter rather than the cohort's inflated tube.
    traits.height = 11.8;
    traits.trunkRadius = 0.27;
    traits.crownWidth = 4.9;
    traits.crownDepth = 4.2;
    traits.branchStart = 0.42;
    traits.branchAngle = 18;
    traits.children = 5;
    traits.levels = 1;
    traits.canopyDensity = 0;
    traits.gnarl = 0.04;
    traits.lean = 0.008;
    traits.succulentLean = 0.006;
    traits.succulentHeightStages = [0.035, 0.19, 0.47, 0.74, 1];
    traits.succulentRadiusStages = [0.52, 0.66, 0.8, 0.92, 1];
    traits.armCountStages = [0, 0, 1, 3, 6];
    traits.armOriginMin = 0.36;
    traits.ribCount = 16;
    traits.ribGrooveDepth = 0.17;
    traits.radialSegments = 8;
  }
  if (roster.id === 'opuntia-ficus-indica') {
    // Kew describes O. ficus-indica as a 4–5 m shrub or small tree with a
    // cylindrical support trunk and flattened 30–40 × 15–20 cm cladodes only
    // 1–1.5 cm thick. The runtime keeps those ratios while slightly enlarging
    // areoles for ToonLab readability; fruit and flowers remain excluded.
    traits.padForm = true;
    traits.height = 3.8;
    traits.trunkRadius = 0.2;
    traits.crownWidth = 3.7;
    traits.crownDepth = 2.5;
    traits.stemCount = 1;
    traits.canopyDensity = 0;
    traits.succulentHeightStages = [0.14, 0.28, 0.48, 0.76, 1];
    traits.succulentRadiusStages = [0.48, 0.6, 0.72, 0.86, 1];
    traits.padCountStages = [1, 3, 7, 15, 24];
    traits.padLengthStages = [0.7, 0.83, 0.92, 1, 1.06];
    traits.padLength = 0.64;
    traits.padWidthRatio = 0.5;
    traits.padThicknessRatio = 0.052;
    traits.radialSegments = 10;
  }
  if (roster.id === 'stenocereus-thurberi') traits.basalColumns = true;
  if (roster.id === 'ravenala-madagascariensis') {
    // Observation photographs show the defining two-ranked fan: long,
    // green petioles radiate in one shallow plane and carry one broad,
    // wind-torn blade each. The trunk is markedly slimmer than the generic
    // giant-monocot cohort and juveniles begin nearly acaulescent.
    traits.fanPlane = true;
    traits.height = 7.4;
    traits.trunkRadius = 0.27;
    traits.crownWidth = 6.6;
    traits.crownDepth = 1.25;
    traits.canopyDensity = 0.92;
    traits.lean = 0.012;
    traits.stemCount = 2;
    traits.frondCount = 17;
    traits.fanPetioleLength = 2.9;
    traits.giantLeafLength = 2.25;
    traits.giantLeafWidthScale = 0.44;
    traits.fanAngle = 1.36;
    traits.fanDepth = 0.18;
    traits.fanPetioleRadius = 0.045;
    traits.pseudostemHeightStages = [0.035, 0.24, 0.72, 0.9, 1];
    traits.radialSegments = 7;
  }
  if (roster.id === 'yucca-brevifolia') {
    // Archived Mojave observations and the USFS botanical description show
    // delayed, irregular sympodial branching—not a balanced binary tree.
    // Each terminal axis carries one dense ball of rigid, narrow blades, and
    // persistent dead leaf bases form a fibrous skirt below that green head.
    traits.height = 6.6;
    traits.trunkRadius = 0.37;
    traits.crownWidth = 5.8;
    traits.crownDepth = 4.9;
    traits.branchStart = 0.5;
    traits.branchAngle = 48;
    traits.children = 3;
    traits.levels = 4;
    traits.canopyDensity = 0.96;
    traits.gnarl = 0.34;
    traits.lean = 0.035;
    traits.frondCount = 64;
    traits.rosetteHeadCountStages = [1, 1, 3, 8, 14];
    traits.rosetteHeightStages = [0.08, 0.42, 0.68, 0.9, 1];
    traits.rosetteForkHeightStages = [1, 1, 0.58, 0.53, 0.48];
    traits.rosetteLeafCountStages = [24, 36, 48, 58, 64];
    traits.rosetteLeafLength = 0.48;
    traits.rosetteLeafWidthScale = 0.13;
    traits.rosetteBranchLengthScale = 0.34;
    traits.retainedLeafBaseCount = 18;
    traits.retainedLeafBaseLength = 0.3;
    traits.radialSegments = 7;
  }
  if (roster.id === 'pandanus-tectorius') {
    traits.propRoots = true;
    traits.woodyPseudostem = true;
  }
  if (roster.id === 'avicennia-marina' || roster.id === 'sonneratia-alba') {
    traits.pneumatophores = true;
  }
  if (roster.id === 'ginkgo-biloba') traits.ginkgoBranching = true;
  return Object.freeze(traits);
}

function validFoliageStates(roster, architecture, taxonomy) {
  if (architecture.engine === 'succulent-axis') return Object.freeze(['green', 'dry']);
  if (architecture.engine === 'culm-colony') return Object.freeze(['leaf-on', 'dry', 'wet']);
  if (WET_DRY_ARCHITECTURES.has(roster.architectureId)) {
    return Object.freeze(['leaf-on', 'dry', 'wet']);
  }
  if (TEMPERATE_DECIDUOUS_GENERA.has(taxonomy.genus)
    && !EVERGREEN_GENERA.has(taxonomy.genus)
    && !EVERGREEN_SPECIES.has(roster.id)) {
    return Object.freeze(['leaf-on', 'autumn', 'dormant', 'snow']);
  }
  if (architecture.engine === 'whorled-conifer') {
    return Object.freeze(['leaf-on', 'dry', 'wet', 'snow']);
  }
  return Object.freeze(['leaf-on', 'dry', 'wet']);
}

function foliageColor(roster, architecture) {
  if (roster.id === 'bambusa-vulgaris') {
    // Exact-species clump references read as a coherent medium-dark olive
    // green, including in open light. Keep the base restrained so the toon
    // lighting can introduce variation without washing the crown into lime.
    return Object.freeze([0.18, 0.42, 0.14]);
  }
  if (roster.id === 'picea-abies') {
    // The reference observations consistently read as a deep, cool spruce
    // green. A muted base also keeps the per-card toon-light variation from
    // drifting into the lime/teal confetti seen with the cohort palette.
    return Object.freeze([0.105, 0.315, 0.17]);
  }
  if (roster.id === 'yucca-brevifolia') {
    // Joshua foliage is a muted gray/olive green in the reference set. Keep
    // the palette narrow so the rigid rosettes read as coherent heads rather
    // than the lime/teal confetti produced by the generic cohort palette.
    return Object.freeze([0.28, 0.43, 0.2]);
  }
  if (roster.id === 'carnegiea-gigantea') {
    return Object.freeze([0.34, 0.6, 0.4]);
  }
  if (roster.id === 'opuntia-ficus-indica') {
    return Object.freeze([0.43, 0.64, 0.36]);
  }
  const base = BASE_PALETTES[architecture.engine];
  const hash = hashString(roster.id);
  return Object.freeze(base.map((channel, index) => Number(
    Math.max(0.04, Math.min(0.92, channel + (noise(hash, 30 + index) - 0.5) * 0.12))
      .toFixed(4),
  )));
}

export const TREE_SPECIES_PROFILES = Object.freeze(TREE_SPECIES_ROSTER.map((roster) => {
  const taxonomy = TREE_SPECIES_TAXONOMY[roster.id];
  const architecture = TREE_ARCHITECTURE_PROFILE_BY_ID[roster.architectureId];
  const research = TREE_SPECIES_RESEARCH[roster.id];
  if (!taxonomy) throw new Error(`Missing pinned taxonomy for ${roster.scientificName}.`);
  if (!architecture) throw new Error(`Missing architecture ${roster.architectureId}.`);
  const aliases = [...new Set([
    ...roster.aliases,
    ...(taxonomy.scientificName !== roster.scientificName ? [roster.scientificName] : []),
  ])];
  const isGinkgo = roster.id === 'ginkgo-biloba';
  return Object.freeze({
    id: roster.id,
    commonName: roster.commonName,
    scientificName: taxonomy.scientificName,
    rosterScientificName: roster.scientificName,
    aliases: Object.freeze(aliases),
    family: taxonomy.family,
    genus: taxonomy.genus,
    taxonId: taxonomy.taxonId,
    scientificNameId: taxonomy.scientificNameId,
    powoUrl: taxonomy.references,
    taxonomyBackbone: TREE_SPECIES_TAXONOMY_SOURCE,
    architectureId: architecture.id,
    engine: architecture.engine,
    axisMode: architecture.axisMode,
    architectureVersion: architecture.version,
    rootProfile: architecture.rootProfile,
    foliageOrgan: isGinkgo ? 'broad-leaf' : architecture.foliageOrgan,
    foliageArchitecture: isGinkgo ? 'layered-sprays' : architecture.foliageArchitecture,
    leafShape: isGinkgo ? 'fan'
      : roster.id === 'quercus-robur' ? 'oak'
        : architecture.leafShape,
    supportedStages: architecture.stages,
    validFoliageStates: validFoliageStates(roster, architecture, taxonomy),
    foliageColor: foliageColor(roster, architecture),
    structuralTraits: speciesTraits(roster, architecture),
    morphologyReview: Object.freeze({
      status: MORPHOLOGY_APPROVED_SPECIES.has(roster.id) ? 'approved' : 'needs-review',
      version: TREE_SPECIES_MORPHOLOGY_REVIEW_VERSION,
      reviewedStages: Object.freeze([]),
      reviewedViews: Object.freeze([]),
      referenceSources: Object.freeze([...new Set([
        ...(research?.referenceSources ?? []),
        ...(MORPHOLOGY_REFERENCE_SOURCES[roster.id] ?? []),
      ])]),
      referenceImagePath: research?.referenceImagePath ?? null,
      referenceImageLicense: research?.referenceImageLicense ?? null,
      researchStatus: research ? 'sources-collected' : 'missing-sources',
    }),
    treeLabEnabled: MORPHOLOGY_APPROVED_SPECIES.has(roster.id),
  });
}));

export const TREE_SPECIES_PROFILE_BY_ID = Object.freeze(
  Object.fromEntries(TREE_SPECIES_PROFILES.map((profile) => [profile.id, profile])),
);

export const TREE_SPECIES_PROFILE_BY_NAME = Object.freeze(Object.fromEntries(
  TREE_SPECIES_PROFILES.flatMap((profile) => [
    [profile.scientificName.toLowerCase(), profile],
    [profile.rosterScientificName.toLowerCase(), profile],
    [profile.commonName.toLowerCase(), profile],
    ...profile.aliases.map((alias) => [alias.toLowerCase(), profile]),
  ]),
));

if (TREE_SPECIES_PROFILES.length !== 165) {
  throw new Error(`Tree species registry must contain 165 profiles; received ${TREE_SPECIES_PROFILES.length}.`);
}
if (new Set(TREE_SPECIES_PROFILES.map((profile) => profile.taxonId)).size !== 165) {
  throw new Error('Tree species registry contains duplicate accepted WCVP taxa.');
}
for (const profile of TREE_SPECIES_PROFILES) {
  if (profile.supportedStages.length !== 5) {
    throw new Error(`Species ${profile.id} must expose exactly five life stages.`);
  }
}

export function getTreeSpeciesProfile(idOrName) {
  const key = String(idOrName ?? '').toLowerCase();
  const profile = TREE_SPECIES_PROFILE_BY_ID[key] ?? TREE_SPECIES_PROFILE_BY_NAME[key];
  if (!profile) throw new Error(`Unknown tree species profile: ${idOrName}`);
  return profile;
}

export { TREE_ARCHITECTURE_PROFILES, getTreeArchitectureProfile };
