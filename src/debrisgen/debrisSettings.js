// Canonical settings and field metadata for the procedural debris generator.
// The generator is intentionally texture-free: geometry, vertex color, and
// ToonLab's environment shader provide the final stylized read.

export const DEBRIS_TYPES = Object.freeze({
  wood: Object.freeze({
    label: 'Wood',
    description: 'Driftwood, branches, twigs, planks, and sawn logs.',
    icon: '🪵',
    variants: Object.freeze([
      Object.freeze({ id: 'driftwood', label: 'Driftwood' }),
      Object.freeze({ id: 'branch', label: 'Fallen branch' }),
      Object.freeze({ id: 'twigPile', label: 'Twig pile' }),
      Object.freeze({ id: 'planks', label: 'Broken planks' }),
      Object.freeze({ id: 'logs', label: 'Sawn logs' }),
      Object.freeze({ id: 'rootStump', label: 'Root stump' }),
      Object.freeze({ id: 'barkChips', label: 'Bark chips' }),
    ]),
  }),
  bone: Object.freeze({
    label: 'Bone',
    description: 'Animal bones, weathered skulls, and antlers.',
    icon: '🦴',
    variants: Object.freeze([
      Object.freeze({ id: 'longBone', label: 'Long bone' }),
      Object.freeze({ id: 'skull', label: 'Skull' }),
      Object.freeze({ id: 'jawBone', label: 'Jaw bone' }),
      Object.freeze({ id: 'antler', label: 'Antler' }),
    ]),
  }),
  stone: Object.freeze({
    label: 'Stone & masonry',
    description: 'Rubble, bricks, pebbles, obsidian, meteorites, and gems.',
    icon: '🪨',
    variants: Object.freeze([
      Object.freeze({ id: 'rubble', label: 'Rubble' }),
      Object.freeze({ id: 'bricks', label: 'Broken bricks' }),
      Object.freeze({ id: 'shards', label: 'Stone shards' }),
      Object.freeze({ id: 'riverstones', label: 'River stones' }),
      Object.freeze({ id: 'obsidian', label: 'Obsidian shards' }),
      Object.freeze({ id: 'meteor', label: 'Meteorites' }),
      Object.freeze({ id: 'gems', label: 'Rough gems' }),
    ]),
  }),
  metal: Object.freeze({
    label: 'Metal',
    description: 'Bent sheets, discarded cans, and mixed scrap.',
    icon: '⚙️',
    variants: Object.freeze([
      Object.freeze({ id: 'sheets', label: 'Bent sheets' }),
      Object.freeze({ id: 'cans', label: 'Crushed cans' }),
      Object.freeze({ id: 'scrapPile', label: 'Scrap pile' }),
    ]),
  }),
  organic: Object.freeze({
    label: 'Ground litter',
    description: 'Dry leaves, pinecones, and shoreline shells.',
    icon: '🍂',
    variants: Object.freeze([
      Object.freeze({ id: 'leafLitter', label: 'Leaf litter' }),
      Object.freeze({ id: 'pinecones', label: 'Pinecones' }),
      Object.freeze({ id: 'shells', label: 'Shell scatter' }),
    ]),
  }),
  ash: Object.freeze({
    label: 'Ash & piles',
    description: 'Ash mounds, campfires, charcoal, and sawdust heaps.',
    icon: '🔥',
    variants: Object.freeze([
      Object.freeze({ id: 'ashPile', label: 'Ash pile' }),
      Object.freeze({ id: 'campfire', label: 'Campfire remains' }),
      Object.freeze({ id: 'charcoal', label: 'Charcoal scatter' }),
      Object.freeze({ id: 'sawdust', label: 'Sawdust heap' }),
    ]),
  }),
});

const field = (key, label, min, max, step, caption) => Object.freeze({
  caption, key, label, max, min, step,
});

export const DEBRIS_TYPE_FIELDS = Object.freeze({
  wood: Object.freeze([
    field('length', 'Length', 0.6, 4, 0.05, 'Overall length of each branch or log.'),
    field('thickness', 'Thickness', 0.04, 0.45, 0.01, 'Radius of the main wood form.'),
    field('crookedness', 'Crookedness', 0, 1, 0.05, 'Smooth bend and wandering in the grain.'),
    field('kinks', 'Kinks', 0, 1, 0.05, 'Sharp elbow breaks at old fork points.'),
    field('branchiness', 'Branchiness', 0, 1, 0.05, 'Frequency of secondary branches and roots.'),
    field('splinters', 'Splinters', 0, 1, 0.05, 'Broken fibers and structural prongs at ends.'),
    field('barkStripped', 'Bark stripped', 0, 1, 0.05, 'How much bark has weathered away to pale wood.'),
  ]),
  bone: Object.freeze([
    field('length', 'Length', 0.5, 3.2, 0.05, 'Overall length or skull scale.'),
    field('thickness', 'Shaft weight', 0.05, 0.35, 0.01, 'Thickness of bone shafts and plates.'),
    field('jointSize', 'Joint size', 0.7, 1.8, 0.05, 'Size of knuckles, sockets, and crown forms.'),
    field('curvature', 'Curvature', 0, 1, 0.05, 'Arc in shafts, jaws, and antler tines.'),
    field('damage', 'Weathering', 0, 1, 0.05, 'Cracks, chips, and missing fragments.'),
  ]),
  stone: Object.freeze([
    field('chunkSize', 'Size', 0.12, 1.3, 0.02, 'Average footprint of each piece.'),
    field('sharpness', 'Angularity', 0, 1, 0.05, 'From worn round forms to hard fractured facets and tapers.'),
    field('detail', 'Surface detail', 0, 1, 0.05, 'Cellular lumps, chips, crater depth, and corner breakup.'),
    field('flatness', 'Flatness', 0, 1, 0.05, 'Squashes pieces toward plates and skipping stones.'),
    field('banding', 'Banding', 0, 1, 0.05, 'Conchoidal ridges, strata lines, and gem facet bevels.'),
    field('brickRatio', 'Brick mix', 0, 1, 0.05, 'Share of manufactured pieces in rubble.'),
  ]),
  metal: Object.freeze([
    field('sheetSize', 'Piece size', 0.25, 1.8, 0.05, 'Size of sheets, cans, and pipe sections.'),
    field('bend', 'Bend', 0, 1, 0.05, 'Warping and crushed deformation.'),
    field('corrugation', 'Corrugation', 0, 1, 0.05, 'Folded ridges across sheet pieces.'),
    field('rust', 'Rust', 0, 1, 0.05, 'Amount of oxidized accent color.'),
    field('wireChance', 'Wire mix', 0, 1, 0.05, 'Frequency of curled wire and narrow rods.'),
  ]),
  organic: Object.freeze([
    field('leafSize', 'Item size', 0.08, 0.65, 0.01, 'Size of leaves, cones, or shells.'),
    field('curl', 'Curl', 0, 1, 0.05, 'How much thin items lift and fold.'),
    field('coneRatio', 'Heavy pieces', 0, 1, 0.05, 'Mix of cones, nuts, or thicker shells.'),
    field('dryness', 'Dryness', 0, 1, 0.05, 'Shifts the palette from fresh to brittle.'),
    field('coverage', 'Coverage', 0.2, 1.8, 0.05, 'Density within the scatter footprint.'),
  ]),
  ash: Object.freeze([
    field('moundHeight', 'Mound height', 0.05, 0.8, 0.01, 'Vertical buildup of fine ash.'),
    field('footprint', 'Footprint', 0.3, 2.5, 0.05, 'Width of the burned area.'),
    field('charcoal', 'Charcoal', 0, 1, 0.05, 'Share of dark burned fragments.'),
    field('embers', 'Ember flecks', 0, 1, 0.05, 'Warm accents among the cold remains.'),
    field('rim', 'Scorched rim', 0, 1, 0.05, 'Darkened material around the perimeter.'),
  ]),
});

export const DEBRIS_ARRANGEMENTS = Object.freeze([
  Object.freeze({ caption: 'Loose natural spread', id: 'scatter', label: 'Scatter' }),
  Object.freeze({ caption: 'Aligned pieces gathered side by side', id: 'bundle', label: 'Bundle' }),
  Object.freeze({ caption: 'Dense stacked mound', id: 'heap', label: 'Heap' }),
  Object.freeze({ caption: 'Flat ground coverage', id: 'patch', label: 'Patch' }),
]);

export const DEBRIS_SCATTER_FIELDS = Object.freeze([
  field('count', 'Pieces', 1, 48, 1, 'Number of primary generated pieces.'),
  field('scale', 'Scale', 0.25, 3, 0.05, 'Uniform scale for the complete asset.'),
  field('spread', 'Spread', 0, 4, 0.05, 'Horizontal footprint of the arrangement.'),
  field('rotationJitter', 'Rotation', 0, 1, 0.05, 'Random rotation and tilt per piece.'),
  field('messiness', 'Messiness', 0, 1, 0.05, 'Placement chaos: tilt, jitter, and piece-to-piece size variety. 0.5 is neutral.'),
  field('damage', 'Damage', 0, 1, 0.05, 'Universal wear: splinters, chips, rust, cracks, and dryness. 0.5 is neutral.'),
]);

export const DEBRIS_LOOK_FIELDS = Object.freeze([
  field('variation', 'Color variation', 0, 0.65, 0.01, 'Per-piece and per-vertex color drift.'),
  field('edgeLight', 'Edge light', 0, 1, 0.05, 'Lightens upward faces for a hand-painted read.'),
  field('toonContrast', 'Toon contrast', 0, 1, 0.05, 'Depth of ToonLab environment shade bands.'),
  field('roughness', 'Roughness', 0, 1, 0.05, 'Surface character retained in exported materials.'),
  field('textureScale', 'Texture scale', 0.5, 4, 0.1, 'Tiling density of the detail texture.'),
]);

export const DEFAULT_DEBRIS_SETTINGS = Object.freeze({
  asset: Object.freeze({
    arrangement: 'scatter',
    count: 5,
    damage: 0.5,
    messiness: 0.5,
    rotationJitter: 0.65,
    scale: 1,
    seed: 1827,
    spread: 1.15,
    type: 'wood',
    variant: 'driftwood',
  }),
  shape: Object.freeze({
    angularity: 0.7,
    barkStripped: 0.3,
    bend: 0.65,
    branchiness: 0.42,
    brickRatio: 0.4,
    charcoal: 0.45,
    chunkSize: 0.55,
    coneRatio: 0.35,
    corrugation: 0.32,
    coverage: 1,
    crookedness: 0.66,
    curl: 0.48,
    curvature: 0.34,
    damage: 0.4,
    dryness: 0.72,
    embers: 0.08,
    footprint: 1.3,
    fracture: 0.58,
    jointSize: 1.15,
    kinks: 0.25,
    leafSize: 0.25,
    length: 1.8,
    moundHeight: 0.28,
    rim: 0.42,
    rust: 0.65,
    sheetSize: 0.85,
    splinters: 0.5,
    stacking: 0.35,
    thickness: 0.16,
    wireChance: 0.25,
  }),
  surface: Object.freeze({
    accentColor: Object.freeze([0.68, 0.43, 0.2]),
    customTexture: null,
    edgeLight: 0.22,
    primaryColor: Object.freeze([0.34, 0.2, 0.11]),
    roughness: 0.9,
    secondaryColor: Object.freeze([0.55, 0.36, 0.2]),
    textureScale: 1,
    textureStyle: 'auto',
    toonContrast: 0.72,
    variation: 0.18,
  }),
});

export const DEBRIS_TYPE_DEFAULTS = Object.freeze({
  wood: Object.freeze({
    asset: Object.freeze({ count: 1, spread: 0, variant: 'driftwood' }),
    shape: Object.freeze({ barkStripped: 0.35, branchiness: 0.42, crookedness: 0.66, kinks: 0.3, length: 1.8, splinters: 0.5, thickness: 0.16 }),
    surface: Object.freeze({ accentColor: [0.7, 0.46, 0.24], primaryColor: [0.34, 0.2, 0.11], secondaryColor: [0.55, 0.36, 0.2] }),
  }),
  bone: Object.freeze({
    asset: Object.freeze({ count: 5, spread: 1.3, variant: 'longBone' }),
    shape: Object.freeze({ curvature: 0.25, damage: 0.42, jointSize: 1.15, length: 1.45, thickness: 0.13 }),
    surface: Object.freeze({ accentColor: [0.42, 0.31, 0.19], primaryColor: [0.78, 0.71, 0.56], secondaryColor: [0.93, 0.87, 0.7] }),
  }),
  stone: Object.freeze({
    asset: Object.freeze({ count: 12, spread: 1.5, variant: 'rubble' }),
    shape: Object.freeze({ banding: 0.3, brickRatio: 0.35, chunkSize: 0.48, detail: 0.62, flatness: 0.3, sharpness: 0.78, stacking: 0.38 }),
    surface: Object.freeze({ accentColor: [0.53, 0.3, 0.19], primaryColor: [0.39, 0.4, 0.38], secondaryColor: [0.58, 0.56, 0.51] }),
  }),
  metal: Object.freeze({
    asset: Object.freeze({ count: 5, spread: 1.35, variant: 'sheets' }),
    shape: Object.freeze({ bend: 0.68, corrugation: 0.32, rust: 0.64, sheetSize: 0.82, wireChance: 0.28 }),
    surface: Object.freeze({ accentColor: [0.72, 0.26, 0.08], primaryColor: [0.25, 0.31, 0.32], secondaryColor: [0.49, 0.54, 0.52] }),
  }),
  organic: Object.freeze({
    asset: Object.freeze({ count: 28, spread: 1.8, variant: 'leafLitter' }),
    shape: Object.freeze({ coneRatio: 0.28, coverage: 1.1, curl: 0.54, dryness: 0.76, leafSize: 0.23 }),
    surface: Object.freeze({ accentColor: [0.66, 0.23, 0.06], primaryColor: [0.34, 0.18, 0.05], secondaryColor: [0.64, 0.43, 0.12] }),
  }),
  ash: Object.freeze({
    asset: Object.freeze({ count: 14, spread: 0.65, variant: 'ashPile' }),
    shape: Object.freeze({ charcoal: 0.48, embers: 0.06, footprint: 1.35, moundHeight: 0.28, rim: 0.42 }),
    surface: Object.freeze({ accentColor: [0.55, 0.06, 0.01], primaryColor: [0.035, 0.03, 0.025], secondaryColor: [0.16, 0.15, 0.14] }),
  }),
});

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
  return value;
}

export function cloneDebrisSettings(settings = DEFAULT_DEBRIS_SETTINGS) {
  return cloneValue(settings);
}

// Legacy recipe migration: the 'masonry' type merged into 'stone'
// (2026-07); its angularity/fracture fields map onto the unified
// sharpness/detail sliders.
function migrateLegacyOverrides(overrides) {
  if (overrides?.asset?.type !== 'masonry') return overrides;
  const migrated = cloneValue(overrides);
  migrated.asset.type = 'stone';
  if (migrated.shape) {
    if (migrated.shape.angularity !== undefined && migrated.shape.sharpness === undefined) {
      migrated.shape.sharpness = migrated.shape.angularity;
    }
    if (migrated.shape.fracture !== undefined && migrated.shape.detail === undefined) {
      migrated.shape.detail = migrated.shape.fracture;
    }
  }
  return migrated;
}

export function createDebrisSettings(rawOverrides = {}) {
  const overrides = migrateLegacyOverrides(rawOverrides);
  const requestedType = overrides.asset?.type;
  const type = DEBRIS_TYPES[requestedType] ? requestedType : (requestedType ? 'wood' : null);
  const typeDefaults = type ? DEBRIS_TYPE_DEFAULTS[type] : null;
  const result = cloneDebrisSettings(DEFAULT_DEBRIS_SETTINGS);
  if (typeDefaults) {
    Object.assign(result.asset, cloneValue(typeDefaults.asset));
    Object.assign(result.shape, cloneValue(typeDefaults.shape));
    Object.assign(result.surface, cloneValue(typeDefaults.surface));
  }
  Object.assign(result.asset, cloneValue(overrides.asset ?? {}));
  Object.assign(result.shape, cloneValue(overrides.shape ?? {}));
  Object.assign(result.surface, cloneValue(overrides.surface ?? {}));
  result.asset.type = DEBRIS_TYPES[result.asset.type] ? result.asset.type : 'wood';
  const variants = DEBRIS_TYPES[result.asset.type].variants;
  if (!variants.some((entry) => entry.id === result.asset.variant)) {
    result.asset.variant = variants[0].id;
  }
  if (!DEBRIS_ARRANGEMENTS.some((entry) => entry.id === result.asset.arrangement)) {
    result.asset.arrangement = 'scatter';
  }
  result.asset.seed = Math.max(0, Math.round(Number(result.asset.seed) || 0)) >>> 0;
  result.asset.count = Math.min(48, Math.max(1, Math.round(Number(result.asset.count) || 1)));
  const custom = result.surface.customTexture;
  result.surface.customTexture = custom && typeof custom.dataUrl === 'string'
    ? { dataUrl: custom.dataUrl, name: String(custom.name ?? 'Custom texture') }
    : null;
  result.surface.textureStyle = typeof result.surface.textureStyle === 'string'
    ? result.surface.textureStyle
    : 'auto';
  result.surface.textureScale = Math.min(4, Math.max(0.5, Number(result.surface.textureScale) || 1));
  return result;
}

export function createDebrisRecipeDocument(settings, { name = 'Untitled debris' } = {}) {
  return {
    kind: 'toonlab.debrisRecipe',
    name,
    settings: createDebrisSettings(settings),
    version: 1,
  };
}

export function validateDebrisRecipeDocument(document) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('Recipe must be an object.');
  else {
    if (document.kind !== 'toonlab.debrisRecipe') errors.push('Unknown recipe kind.');
    if (document.version !== 1) errors.push('Unsupported recipe version.');
    if (!document.settings?.asset) errors.push('Recipe settings are missing.');
    const requestedType = document.settings?.asset?.type;
    if (requestedType && requestedType !== 'masonry' && !DEBRIS_TYPES[requestedType]) {
      errors.push(`Unknown debris type “${requestedType}”.`);
    }
  }
  return { errors, ok: errors.length === 0 };
}
