import * as THREE from 'three';

import { StylizedTree } from './stylizedTree.js';
import { resolveTreeSurfaceProfileId } from './treeSurfaceTextures.js';

export const BRANCH_TREE_DOCUMENT_TYPE = 'toonlab/branch-tree';
export const BRANCH_TREE_DOCUMENT_VERSION = 1;

/**
 * BranchTree's architecture identity, used by the LOD compiler to pick its
 * triangle envelope. BranchTree is not a legacy aggregate-card tree: it hard-
 * sets the recursive `branching` generator and carries a four-level scaffold,
 * so it budgets like the other recursive woody engines rather than like the
 * legacy default.
 */
export const BRANCH_TREE_ARCHITECTURE = Object.freeze({
  id: 'branch-tree',
  engine: 'branch-tree',
  version: 1,
});

export const BRANCH_TREE_LEAF_SHAPES = Object.freeze([
  'teardrop',
  'round',
  'oak',
  'maple',
  // Acer palmatum's deeply dissected seven-lobe leaf. 'maple' above is the
  // blunt five-point sugar-maple star; the two are different species reads
  // and a garden's hero maple needs the dissected one.
  'palmate',
  'gingko',
  // Conifer organs. A needle-bearing BranchTree is not a contradiction: the
  // architecture is a recursive woody skeleton with foliage at the tips,
  // which is exactly how a cloud-pruned pine is built. What it must NOT do is
  // set `skeleton.conifer`, which shortens children toward the leader and
  // produces the excurrent cone a pruned garden pine is defined against.
  'needle',
  'needle-fascicle',
]);

/**
 * Canopy tuft architectures a BranchTree may select.
 *
 * `null` keeps StylizedTree's own choice, which is what every document
 * authored before this field existed relies on.
 */
export const BRANCH_TREE_CANOPY_ARCHITECTURES = Object.freeze([
  'cloud-cards',
  'layered-sprays',
  'needle-whorls',
]);

export const DEFAULT_BRANCH_TREE_SETTINGS = Object.freeze({
  seed: 1,
  size: 1,
  branches: Object.freeze({
    angle: 54,
    children: 5,
    forceStrength: 0.018,
    gnarliness: 0.16,
    lengthRatio: 0.48,
    levels: 3,
    // Total branches the breadth-first skeleton may grow, and the ceiling on
    // foliage attachments. null = the generator's historical 420 / 380.
    //
    // These are authorable because the fixed budget is a silent quality trap:
    // the skeleton grows breadth-first, so at high `children` levels 1 and 2
    // consume the whole allowance before the leaf-bearing level-3 twigs are
    // ever queued and the tree ships nearly bare (D19-028 — measured 12
    // children → 19 leaf cards). Raising the budget is also the only way to
    // build a many-tipped structure such as a cloud-pruned pine, whose whole
    // silhouette is the count and separation of its foliage pads.
    maxAttachments: null,
    maxBranches: null,
    radialSegments: 8,
    radiusRatio: 0.68,
    start: 0.34,
  }),
  trunk: Object.freeze({
    bend: 0.18,
    // World heading of the trunk's bow, in radians. null = derived from the
    // seed. Authoring it is what makes a coherent windswept stand possible:
    // without it every seed leans a different way and a ridge of trees reads
    // as damage rather than as wind.
    bendDirection: null,
    color: Object.freeze([0.48, 0.29, 0.16]),
    gnarl: 0.18,
    height: 2.1,
    lean: 0.12,
    // Lean heading relative to the bow, in radians. null = derived from the
    // seed; 0 pins the lean along the bow, Math.PI pulls the top back against
    // it for an S-curve.
    leanOffset: null,
    radialSegments: 10,
    radiusBottom: 0.22,
    radiusTop: 0.075,
    // Whether the crown's own shadow map falls on the tree's wood. false is
    // the anime read StylizedTree already documents for pale-limbed trees,
    // and it matters most on a tips-placement tree, where bare limb crosses
    // the canopy in full view: with it on, those limbs render as near-black
    // scribbles inside the crown at close camera.
    receiveShadow: true,
    textureRef: null,
    twist: 0.08,
  }),
  leaves: Object.freeze({
    color: Object.freeze([0.19, 0.48, 0.22]),
    coverageScale: 1,
    // How one tuft of foliage is built at a branch tip. Every field is
    // nullable and every null forwards nothing, so a document authored before
    // this block existed resolves to exactly the geometry it always did.
    //
    // This is the lever the canopy actually needs. `coverageScale` saturates
    // at `clamp(size × coverageScale, 0.4)²` capped at 9, so on any tree
    // larger than size 3 it is inert; `density` only scales an already-fixed
    // per-tuft count; and `branches.children` buys cards by adding wood.
    // The tuft itself was the one thing an author could not reach.
    cluster: Object.freeze({
      // 'cloud-cards' (default): cards fill a small sphere at the tip.
      // 'layered-sprays': cards fill a flattened disc across the tip, which
      //   is how a cloud-pruned pad or a horizontally layered maple tier
      //   reads. 'needle-whorls': cards align their long axis to the twig,
      //   for needle-bearing branchlets.
      architecture: null,
      cards: null,        // cards per tuft
      // Bare every tuft below this fraction of the crown's own height. A
      // skeleton that forks low enough to read multi-stemmed also hangs
      // foliage down that low wood and buries the trunk it just built; in a
      // garden the bare trunk is as much of the subject as the canopy. This
      // lifts the foliage skirt without touching `branches.start`, so the
      // limb structure keeps its low fork and only the leaves move.
      crownBase: null,
      // Multiplies the card count of every tuft that SURVIVES pruning, so a
      // crown can be restructured at an unchanged card total rather than
      // simply losing the foliage that pruning removed.
      densityBoost: null,
      // Keep only this many well-separated tufts and bare every other branch
      // tip. This is what makes a cloud-pruned pine possible at all: a
      // recursive skeleton hangs foliage on every terminal twig, and terminal
      // twigs fill the crown evenly, so without pruning the crown is a dome
      // no matter how each individual tuft is shaped.
      pads: null,
      // Horizontal plates: { count, thickness, jitter }. `pads` spaces
      // masses isotropically, which is a pine's 3D scatter and is not a
      // layered broadleaf: an Acer palmatum's signature is flat tiers with
      // sky and limb showing BETWEEN them, and no isotropic count produces an
      // anisotropic structure. This keeps tufts inside `count` height bands
      // and bares the tufts in the gaps.
      plates: null,
      // 0..1, `layered-sprays` only. 0 builds each spray disc across the
      // twig, so a twig rising at 50 deg carries a disc tilted at 50 deg. 1
      // builds it flat with the GROUND, which is what makes a tier read as a
      // tier rather than as a thicket of tilted saucers.
      plateAlignment: null,
      // Drops each plate's outer rim as a fraction of its own radius. A
      // perfectly flat tier is a machined shelf — the Cornus controversa /
      // acacia read — and this is what makes it hang instead.
      plateDroop: null,
      radius: null,       // tuft radius, tree-local units
      sizeRange: null,    // [min, max] card size multiplier
      sprayLayers: null,  // layered-sprays: tiers stacked along the twig
      spraySpread: null,  // layered-sprays: pad radius across the twig
      sprayThickness: null, // layered-sprays: pad depth along the twig
      whorlArms: null,    // needle-whorls: branchlets per whorl
      whorlRadius: null,  // needle-whorls: whorl radius
    }),
    density: 1,
    palette: Object.freeze({}),
    shape: 'round',
    textureRef: null,
  }),
  roots: 'small',
});

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finite(value, fallback, minimum = -Infinity, maximum = Infinity) {
  const number = Number(value);
  return Number.isFinite(number)
    ? THREE.MathUtils.clamp(number, minimum, maximum)
    : fallback;
}

function integer(value, fallback, minimum, maximum) {
  return Math.round(finite(value, fallback, minimum, maximum));
}

function color(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map(Number);
    if (channels.every(Number.isFinite)) {
      return channels.map((channel) => THREE.MathUtils.clamp(channel, 0, 1));
    }
  }
  if (value?.isColor) return value.clone().convertLinearToSRGB().toArray();
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return new THREE.Color(value).convertLinearToSRGB().toArray();
    } catch {
      // Fall through to the documented default.
    }
  }
  return [...fallback];
}

function reference(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableAngle(value, fallback) {
  if (value === null) return null;
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number)
    ? THREE.MathUtils.euclideanModulo(number, Math.PI * 2)
    : fallback;
}

function nullableFinite(value, minimum, maximum) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number)
    ? THREE.MathUtils.clamp(number, minimum, maximum)
    : null;
}

function nullableInteger(value, minimum, maximum) {
  const resolved = nullableFinite(value, minimum, maximum);
  return resolved === null ? null : Math.round(resolved);
}

function nullableRange(value, minimum, maximum) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const low = nullableFinite(value[0], minimum, maximum);
  const high = nullableFinite(value[1], minimum, maximum);
  if (low === null || high === null) return null;
  return [Math.min(low, high), Math.max(low, high)];
}

// `leaves.cluster.plates`. A count below 2 is not a plate structure — one
// band is the whole crown — so it resolves to null rather than silently
// pruning the tree down to a single slab of foliage.
function leafPlates(value) {
  if (value === null || value === undefined || typeof value !== 'object') return null;
  const count = nullableInteger(value.count, 2, 24);
  if (count === null) return null;
  return {
    count,
    jitter: nullableFinite(value.jitter, 0, 1) ?? 0,
    thickness: nullableFinite(value.thickness, 0.02, 1) ?? 0.5,
  };
}

function leafCluster(value) {
  const source = plainObject(value);
  return {
    architecture: BRANCH_TREE_CANOPY_ARCHITECTURES.includes(source.architecture)
      ? source.architecture
      : null,
    cards: nullableInteger(source.cards, 1, 64),
    crownBase: nullableFinite(source.crownBase, 0, 0.95),
    densityBoost: nullableFinite(source.densityBoost, 0.1, 12),
    pads: nullableInteger(source.pads, 1, 2000),
    plates: leafPlates(source.plates),
    plateAlignment: nullableFinite(source.plateAlignment, 0, 1),
    plateDroop: nullableFinite(source.plateDroop, 0, 2),
    radius: nullableFinite(source.radius, 0.01, 4),
    sizeRange: nullableRange(source.sizeRange, 0.02, 6),
    sprayLayers: nullableInteger(source.sprayLayers, 1, 12),
    spraySpread: nullableFinite(source.spraySpread, 0.05, 4),
    sprayThickness: nullableFinite(source.sprayThickness, 0, 2),
    whorlArms: nullableInteger(source.whorlArms, 3, 24),
    whorlRadius: nullableFinite(source.whorlRadius, 0.05, 3),
  };
}

function canopyPalette(value) {
  const source = plainObject(value);
  const result = {};
  for (const tone of ['lit', 'shadow', 'crown']) {
    if (source[tone] === undefined) continue;
    const resolved = color(source[tone], [NaN, NaN, NaN]);
    if (resolved.every(Number.isFinite)) result[tone] = resolved;
  }
  return result;
}

/**
 * Normalize the intentionally small supported BranchTree surface.
 *
 * `trunk.map` and `leaves.map` may be live THREE.Texture values. They are
 * runtime inputs and are omitted from portable documents; use textureRef to
 * retain the caller-owned asset identity beside the procedural recipe.
 */
export function createBranchTreeSettings(options = {}) {
  const source = plainObject(options);
  const branches = plainObject(source.branches);
  const trunk = plainObject(source.trunk);
  const leaves = plainObject(source.leaves);
  const defaults = DEFAULT_BRANCH_TREE_SETTINGS;
  return {
    seed: integer(source.seed, defaults.seed, -2147483648, 2147483647),
    size: finite(source.size, defaults.size, 0.05, 100),
    branches: {
      angle: finite(branches.angle, defaults.branches.angle, 10, 120),
      children: integer(branches.children, defaults.branches.children, 1, 12),
      forceStrength: finite(
        branches.forceStrength,
        defaults.branches.forceStrength,
        -0.08,
        0.15,
      ),
      gnarliness: finite(branches.gnarliness, defaults.branches.gnarliness, 0, 0.6),
      lengthRatio: finite(branches.lengthRatio, defaults.branches.lengthRatio, 0.15, 0.9),
      levels: integer(branches.levels, defaults.branches.levels, 1, 4),
      maxAttachments: nullableInteger(branches.maxAttachments, 8, 4000),
      maxBranches: nullableInteger(branches.maxBranches, 8, 6000),
      radialSegments: integer(
        branches.radialSegments,
        defaults.branches.radialSegments,
        3,
        16,
      ),
      radiusRatio: finite(branches.radiusRatio, defaults.branches.radiusRatio, 0.3, 0.9),
      start: finite(branches.start, defaults.branches.start, 0, 0.85),
    },
    trunk: {
      bend: finite(trunk.bend, defaults.trunk.bend, -1.2, 1.2),
      bendDirection: nullableAngle(trunk.bendDirection, defaults.trunk.bendDirection),
      color: color(trunk.color, defaults.trunk.color),
      gnarl: finite(trunk.gnarl, defaults.trunk.gnarl, 0, 1),
      height: finite(trunk.height, defaults.trunk.height, 0.2, 30),
      lean: finite(trunk.lean, defaults.trunk.lean, -1.2, 1.2),
      leanOffset: nullableAngle(trunk.leanOffset, defaults.trunk.leanOffset),
      map: trunk.map?.isTexture ? trunk.map : null,
      radialSegments: integer(
        trunk.radialSegments,
        defaults.trunk.radialSegments,
        3,
        24,
      ),
      radiusBottom: finite(trunk.radiusBottom, defaults.trunk.radiusBottom, 0.01, 5),
      radiusTop: finite(trunk.radiusTop, defaults.trunk.radiusTop, 0.002, 3),
      receiveShadow: trunk.receiveShadow === undefined
        ? defaults.trunk.receiveShadow
        : Boolean(trunk.receiveShadow),
      textureRef: reference(trunk.textureRef),
      twist: finite(trunk.twist, defaults.trunk.twist, -Math.PI * 4, Math.PI * 4),
    },
    leaves: {
      color: color(leaves.color, defaults.leaves.color),
      cluster: leafCluster(leaves.cluster),
      coverageScale: finite(
        leaves.coverageScale,
        defaults.leaves.coverageScale,
        0.25,
        4,
      ),
      density: finite(leaves.density, defaults.leaves.density, 0.1, 2),
      map: leaves.map?.isTexture ? leaves.map : null,
      palette: canopyPalette(leaves.palette),
      shape: BRANCH_TREE_LEAF_SHAPES.includes(leaves.shape)
        ? leaves.shape
        : defaults.leaves.shape,
      textureRef: reference(leaves.textureRef),
    },
    roots: ['none', 'small', 'medium', 'large'].includes(source.roots)
      ? source.roots
      : defaults.roots,
  };
}

function portableSettings(options = {}) {
  const settings = createBranchTreeSettings(options);
  const { map: trunkMap, ...trunk } = settings.trunk;
  const { map: leafMap, ...leaves } = settings.leaves;
  void trunkMap;
  void leafMap;
  return {
    ...settings,
    branches: { ...settings.branches },
    leaves,
    trunk,
  };
}

export function createBranchTreeDocument(options = {}) {
  return {
    type: BRANCH_TREE_DOCUMENT_TYPE,
    version: BRANCH_TREE_DOCUMENT_VERSION,
    settings: portableSettings(options),
  };
}

export function parseBranchTreeDocument(input) {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return { errors: ['BranchTree document is not valid JSON.'], ok: false, value: null };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { errors: ['BranchTree document must be an object.'], ok: false, value: null };
  }
  if (value.type !== BRANCH_TREE_DOCUMENT_TYPE) {
    return { errors: [`Expected type "${BRANCH_TREE_DOCUMENT_TYPE}".`], ok: false, value: null };
  }
  if (value.version !== BRANCH_TREE_DOCUMENT_VERSION) {
    return {
      errors: [`Unsupported BranchTree document version ${String(value.version)}.`],
      ok: false,
      value: null,
    };
  }
  return {
    errors: [],
    ok: true,
    value: createBranchTreeDocument(value.settings),
  };
}

/**
 * The StylizedTree option object a BranchTree builds from its settings.
 *
 * Shared by the constructor and by createBranchTreeRecipe so the LOD compiler
 * meshes exactly the tree the runtime renders. Runtime-only inputs (live
 * textures, foliage/wind state, shader profile) are layered on by the caller.
 */
export function branchTreeStylizedOptions(settingsInput = {}) {
  const settings = settingsInput?.branches && settingsInput?.leaves && settingsInput?.trunk
    ? settingsInput
    : createBranchTreeSettings(settingsInput);
  // Only forward what was actually authored. StylizedTree keeps its
  // tips-placement and branching-generator canopy presets unless a caller
  // hands it a value that differs from the module default, so forwarding a
  // resolved default here would silently overwrite those presets and move
  // every existing document's geometry.
  const cluster = settings.leaves.cluster ?? {};
  const canopyCluster = {};
  const forward = (key, value) => {
    if (value !== null && value !== undefined) canopyCluster[key] = value;
  };
  forward('architecture', cluster.architecture);
  forward('cardsPerCluster', cluster.cards);
  forward('padCount', cluster.pads);
  forward('crownBase', cluster.crownBase);
  forward('padDensityBoost', cluster.densityBoost);
  forward('padLayers', cluster.plates);
  forward('plateAlignment', cluster.plateAlignment);
  forward('plateDroop', cluster.plateDroop);
  forward('clusterRadius', cluster.radius);
  forward('cardSizeRange', cluster.sizeRange);
  forward('sprayLayers', cluster.sprayLayers);
  forward('spraySpread', cluster.spraySpread);
  forward('sprayThickness', cluster.sprayThickness);
  forward('whorlArms', cluster.whorlArms);
  forward('whorlRadius', cluster.whorlRadius);

  const skeletonBudget = {};
  if (settings.branches.maxBranches !== null) {
    skeletonBudget.maxBranches = settings.branches.maxBranches;
  }
  if (settings.branches.maxAttachments !== null) {
    skeletonBudget.maxAttachments = settings.branches.maxAttachments;
  }
  return {
    tree: {
      canopyColor: settings.leaves.color,
      canopyPalette: settings.leaves.palette,
      canopyDepth: 0.92,
      canopyScale: 1,
      canopyWidth: 1.18,
      leafDensity: settings.leaves.density,
      leafPlacement: 'tips',
      seed: settings.seed,
      size: settings.size,
      trunkColor: settings.trunk.color,
      trunkReceiveShadow: settings.trunk.receiveShadow,
    },
    trunk: {
      bend: settings.trunk.bend,
      bendDirection: settings.trunk.bendDirection,
      gnarl: settings.trunk.gnarl,
      height: settings.trunk.height,
      lean: settings.trunk.lean,
      leanOffset: settings.trunk.leanOffset,
      radialSegments: settings.trunk.radialSegments,
      radiusBottom: settings.trunk.radiusBottom,
      radiusTop: settings.trunk.radiusTop,
      twist: settings.trunk.twist,
    },
    skeleton: {
      branchAngle: settings.branches.angle,
      branchStart: settings.branches.start,
      childrenCount: settings.branches.children,
      forceStrength: settings.branches.forceStrength,
      generator: 'branching',
      gnarliness: settings.branches.gnarliness,
      lengthRatio: settings.branches.lengthRatio,
      levels: settings.branches.levels,
      radialSegments: settings.branches.radialSegments,
      radiusRatio: settings.branches.radiusRatio,
      ...skeletonBudget,
    },
    canopy: {
      // Physical tree size still participates so leaf cards retain a useful
      // world-space density. The explicit factor lets an author tune that
      // coverage independently instead of enlarging the whole tree.
      coverageScale: settings.size * settings.leaves.coverageScale,
      ...canopyCluster,
      // BranchTree knows exactly which tuft fields the author supplied,
      // because every unauthored one is null. Declaring them keeps a value
      // that happens to equal a module default from being mistaken for
      // "unset" and quietly replaced by the branching-generator preset.
      explicit: Object.keys(canopyCluster),
    },
    leafShape: settings.leaves.map ? null : { preset: settings.leaves.shape },
    roots: { preset: settings.roots },
    // A trunk textureRef that names a registered bark profile (or one of its
    // short aliases, e.g. 'beech') selects that profile. An unrecognized ref
    // stays caller-owned provenance and falls through to the style default,
    // so existing documents keep working unchanged.
    trunkSurfaceProfile: settings.trunk.map
      ? null
      : resolveTreeSurfaceProfileId(settings.trunk.textureRef),
  };
}

/**
 * Stable first-party procedural broadleaf tree.
 *
 * This deliberately exposes one branch architecture. Leaf silhouette/color/
 * texture and trunk color/texture are inputs; botanical species claims are
 * outside the 0.4.6 contract.
 */
export class BranchTree extends StylizedTree {
  constructor(options = {}) {
    const settings = createBranchTreeSettings(options);
    const source = plainObject(options);
    super({
      ...branchTreeStylizedOptions(settings),
      foliage: {
        ...plainObject(source.foliage),
        ...(settings.leaves.map ? { leafMap: settings.leaves.map } : {}),
      },
      styleTarget: source.styleTarget ?? {},
      trunkMap: settings.trunk.map,
      vegetationShader: source.vegetationShader ?? null,
    });
    this.name = 'BranchTree';
    this.branchTreeSettings = settings;
  }

  toJSON() {
    return createBranchTreeDocument(this.branchTreeSettings);
  }
}

/**
 * Wrap BranchTree settings in the tree-recipe envelope the LOD compiler
 * consumes, tagged with BranchTree's own architecture so it is budgeted
 * against the BranchTree triangle envelope rather than the legacy default.
 *
 * The portable BranchTree document stays the asset's identity; this is the
 * adapter that lets `compileTreeLodLevels` build its three LODs from it.
 */
export function createBranchTreeRecipe(options = {}, { id = null, label = null } = {}) {
  const settings = createBranchTreeSettings(options);
  const recipe = {
    schema: 'treeRecipe',
    version: 3,
    type: 'tree',
    architecture: { ...BRANCH_TREE_ARCHITECTURE },
    options: branchTreeStylizedOptions(settings),
  };
  if (id) recipe.id = id;
  if (label) recipe.label = label;
  return recipe;
}

export function createBranchTree(options = {}) {
  return new BranchTree(options);
}
