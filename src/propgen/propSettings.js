// Canonical settings and field metadata for the parametric prop generators.
// Same texture-free discipline as debrisgen: geometry + baked vertex color
// + ToonLab's environment shader produce the final read. Every prop is
// seeded, palette-driven, and rebuildable from a recipe document forever.

export const PROP_TYPES = Object.freeze({
  fence: Object.freeze({
    label: 'Fence',
    description: 'Post-and-rail runs that follow terrain. Linear: built along a spline, not instanced.',
    icon: '🚧',
    linear: true,
    variants: Object.freeze([
      Object.freeze({ id: 'ranch', label: 'Ranch rails' }),
      Object.freeze({ id: 'log', label: 'Log rail' }),
      Object.freeze({ id: 'rope', label: 'Rope & posts' }),
      Object.freeze({ id: 'picket', label: 'Picket' }),
    ]),
  }),
  lantern: Object.freeze({
    label: 'Lantern',
    description: 'Stone tōrō pedestals, hanging chōchin, and wooden post lamps.',
    icon: '🏮',
    variants: Object.freeze([
      Object.freeze({ id: 'stoneToro', label: 'Stone tōrō' }),
      Object.freeze({ id: 'chochin', label: 'Hanging chōchin' }),
      Object.freeze({ id: 'woodPost', label: 'Wood post lamp' }),
    ]),
  }),
  signpost: Object.freeze({
    label: 'Signpost',
    description: 'Direction boards on a post — junction dressing.',
    icon: '🪧',
    variants: Object.freeze([
      Object.freeze({ id: 'single', label: 'Single board' }),
      Object.freeze({ id: 'double', label: 'Two boards' }),
      Object.freeze({ id: 'crossroads', label: 'Crossroads' }),
    ]),
  }),
  stoneStairs: Object.freeze({
    label: 'Stone stairs',
    description: 'Free-standing stone step runs for gardens and shrine approaches.',
    icon: '🪜',
    variants: Object.freeze([
      Object.freeze({ id: 'straight', label: 'Straight' }),
      Object.freeze({ id: 'worn', label: 'Worn & uneven' }),
    ]),
  }),
  milestone: Object.freeze({
    label: 'Milestone',
    description: 'Way markers: road stones, small obelisks, mossy jizō markers.',
    icon: '🗿',
    variants: Object.freeze([
      Object.freeze({ id: 'roadStone', label: 'Road stone' }),
      Object.freeze({ id: 'obelisk', label: 'Obelisk' }),
      Object.freeze({ id: 'jizo', label: 'Jizō marker' }),
    ]),
  }),
  well: Object.freeze({
    label: 'Well',
    description: 'Village stone well, optionally roofed with a bucket winch.',
    icon: '🕳️',
    variants: Object.freeze([
      Object.freeze({ id: 'roofed', label: 'Roofed' }),
      Object.freeze({ id: 'open', label: 'Open ring' }),
    ]),
  }),
  crateStack: Object.freeze({
    label: 'Crates & barrels',
    description: 'Market and dock clutter: crate stacks, barrel groups, sack piles.',
    icon: '📦',
    variants: Object.freeze([
      Object.freeze({ id: 'crates', label: 'Crates' }),
      Object.freeze({ id: 'barrels', label: 'Barrels' }),
      Object.freeze({ id: 'mixed', label: 'Mixed' }),
    ]),
  }),
  firewood: Object.freeze({
    label: 'Firewood pile',
    description: 'Stacked split logs against winter.',
    icon: '🪵',
    variants: Object.freeze([
      Object.freeze({ id: 'stacked', label: 'Neat stack' }),
      Object.freeze({ id: 'loose', label: 'Loose pile' }),
    ]),
  }),
  torii: Object.freeze({
    label: 'Torii gate',
    description: 'Shrine gates: curved myōjin or straight shinmei.',
    icon: '⛩️',
    variants: Object.freeze([
      Object.freeze({ id: 'myojin', label: 'Myōjin (curved)' }),
      Object.freeze({ id: 'shinmei', label: 'Shinmei (straight)' }),
    ]),
  }),
  pier: Object.freeze({
    label: 'Pier',
    description: 'Plank dock on posts, reaching from the shore over water.',
    icon: '🛶',
    variants: Object.freeze([
      Object.freeze({ id: 'straight', label: 'Straight' }),
      Object.freeze({ id: 'tShape', label: 'T-head' }),
    ]),
  }),
  stoneWall: Object.freeze({
    label: 'Stone wall',
    description: 'Dry-stacked field walls. Linear: built along a spline.',
    icon: '🧱',
    linear: true,
    variants: Object.freeze([
      Object.freeze({ id: 'dry', label: 'Dry stack' }),
      Object.freeze({ id: 'dressed', label: 'Dressed courses' }),
    ]),
  }),
  bench: Object.freeze({
    label: 'Bench',
    description: 'Plank or split-log seating.',
    icon: '🪑',
    variants: Object.freeze([
      Object.freeze({ id: 'plank', label: 'Plank bench' }),
      Object.freeze({ id: 'log', label: 'Split log' }),
    ]),
  }),
});

const field = (key, label, min, max, step, caption) => Object.freeze({
  caption, key, label, max, min, step,
});

// Per-type shape fields (the sliders each generator understands).
export const PROP_TYPE_FIELDS = Object.freeze({
  fence: Object.freeze([
    field('postSpacing', 'Post spacing', 1.2, 4, 0.1, 'Meters between posts along the run.'),
    field('postHeight', 'Post height', 0.6, 1.6, 0.05, 'Height of each post above ground.'),
    field('thickness', 'Thickness', 0.05, 0.18, 0.005, 'Post and rail cross-section.'),
    field('railCount', 'Rails', 1, 3, 1, 'Horizontal rails between posts.'),
    field('sag', 'Sag', 0, 1, 0.05, 'Rope droop / rail bow between posts.'),
    field('lean', 'Lean', 0, 1, 0.05, 'Random post lean — weathered fences lean.'),
    field('gapChance', 'Gaps', 0, 0.5, 0.05, 'Chance a rail span is missing (broken-down look).'),
  ]),
  lantern: Object.freeze([
    field('height', 'Height', 0.7, 2.4, 0.05, 'Total lantern height.'),
    field('lampSize', 'Lamp size', 0.6, 1.6, 0.05, 'Firebox / paper body scale.'),
    field('roofOverhang', 'Roof overhang', 0.8, 1.8, 0.05, 'Cap overhang beyond the body.'),
    field('glow', 'Glow', 0, 1, 0.05, 'Warm emissive strength of the lamp body.'),
    field('wear', 'Wear', 0, 1, 0.05, 'Chips and moss on stone, patches on paper.'),
  ]),
  signpost: Object.freeze([
    field('height', 'Height', 1.4, 3, 0.05, 'Post height.'),
    field('boardLength', 'Board length', 0.5, 1.4, 0.05, 'Length of each direction board.'),
    field('tilt', 'Tilt', 0, 1, 0.05, 'How crooked the post and boards sit.'),
    field('wear', 'Wear', 0, 1, 0.05, 'Cracks and fading.'),
  ]),
  stoneStairs: Object.freeze([
    field('width', 'Width', 0.8, 3, 0.05, 'Step width.'),
    field('stepCount', 'Steps', 3, 14, 1, 'Number of steps in the run.'),
    field('stepHeight', 'Step height', 0.12, 0.28, 0.01, 'Riser height per step.'),
    field('wear', 'Wear', 0, 1, 0.05, 'Rounding, tilt, and chipping of old steps.'),
  ]),
  milestone: Object.freeze([
    field('height', 'Height', 0.4, 1.6, 0.05, 'Marker height.'),
    field('girth', 'Girth', 0.5, 1.6, 0.05, 'Marker thickness relative to height.'),
    field('moss', 'Moss', 0, 1, 0.05, 'Green weathering from the base up.'),
    field('inscription', 'Inscription', 0, 1, 0.05, 'Carved band detail strength.'),
  ]),
  well: Object.freeze([
    field('radius', 'Ring radius', 0.5, 1.3, 0.05, 'Inner stone ring radius.'),
    field('wallHeight', 'Wall height', 0.5, 1.2, 0.05, 'Stone ring height.'),
    field('roofHeight', 'Roof height', 1.6, 3, 0.05, 'Peak height of the roof frame (roofed variant).'),
    field('bucket', 'Bucket', 0, 1, 1, 'Hang a bucket from the winch beam.'),
  ]),
  crateStack: Object.freeze([
    field('count', 'Pieces', 1, 9, 1, 'Crates / barrels in the group.'),
    field('size', 'Size', 0.4, 1, 0.02, 'Base size of each piece in meters.'),
    field('stackiness', 'Stacking', 0, 1, 0.05, 'Chance pieces stack instead of spreading.'),
    field('jitter', 'Jitter', 0, 1, 0.05, 'Rotation and offset chaos.'),
  ]),
  firewood: Object.freeze([
    field('length', 'Length', 0.8, 2.6, 0.05, 'Stack length.'),
    field('height', 'Height', 0.4, 1.2, 0.05, 'Stack height.'),
    field('logRadius', 'Log radius', 0.05, 0.14, 0.005, 'Split log radius.'),
  ]),
  torii: Object.freeze([
    field('height', 'Height', 2, 7, 0.1, 'Gate height to the top lintel.'),
    field('width', 'Width', 0.8, 1.6, 0.05, 'Span relative to height.'),
    field('pillarRadius', 'Pillar radius', 0.06, 0.16, 0.005, 'Pillar thickness relative to height.'),
    field('curvature', 'Curvature', 0, 1, 0.05, 'Upsweep of the top lintel (myōjin).'),
  ]),
  pier: Object.freeze([
    field('length', 'Length', 3, 14, 0.5, 'Reach from the shore anchor point.'),
    field('width', 'Width', 1, 2.6, 0.1, 'Deck width.'),
    field('deckHeight', 'Deck height', 0.4, 1.4, 0.05, 'Deck above the waterline.'),
    field('rails', 'Rails', 0, 2, 1, 'Railed sides (0, 1, or both).'),
  ]),
  stoneWall: Object.freeze([
    field('height', 'Height', 0.4, 1.4, 0.05, 'Wall height.'),
    field('thickness', 'Thickness', 0.25, 0.7, 0.05, 'Wall thickness.'),
    field('stoneSize', 'Stone size', 0.5, 1.5, 0.05, 'Relative size of individual stones.'),
    field('topCourse', 'Top course', 0, 1, 1, 'Finish with upright coping stones.'),
  ]),
  bench: Object.freeze([
    field('length', 'Length', 0.9, 2.4, 0.05, 'Seat length.'),
    field('height', 'Height', 0.35, 0.55, 0.01, 'Seat height.'),
    field('backrest', 'Backrest', 0, 1, 1, 'Add a backrest.'),
  ]),
});

export const PROP_LOOK_FIELDS = Object.freeze([
  field('variation', 'Color variation', 0, 0.5, 0.01, 'Per-piece and per-vertex color drift.'),
  field('edgeLight', 'Edge light', 0, 1, 0.05, 'Lightens upward faces for the hand-painted read.'),
  field('roughness', 'Roughness', 0, 1, 0.05, 'Surface character retained in exported materials.'),
]);

export const DEFAULT_PROP_SETTINGS = Object.freeze({
  asset: Object.freeze({
    scale: 1,
    seed: 2107,
    type: 'lantern',
    variant: 'stoneToro',
  }),
  shape: Object.freeze({
    backrest: 0,
    boardLength: 0.85,
    bucket: 1,
    count: 4,
    curvature: 0.55,
    deckHeight: 0.7,
    gapChance: 0,
    girth: 1,
    glow: 0.55,
    height: 1.6,
    inscription: 0.5,
    jitter: 0.5,
    lampSize: 1,
    lean: 0.25,
    length: 1.6,
    logRadius: 0.08,
    moss: 0.35,
    pillarRadius: 0.1,
    postHeight: 1.05,
    postSpacing: 2.2,
    radius: 0.8,
    railCount: 2,
    rails: 1,
    roofHeight: 2.3,
    roofOverhang: 1.25,
    sag: 0.35,
    stackiness: 0.55,
    size: 0.62,
    stepCount: 6,
    stepHeight: 0.18,
    stoneSize: 1,
    thickness: 0.09,
    tilt: 0.2,
    topCourse: 1,
    wallHeight: 0.85,
    wear: 0.35,
    width: 1.15,
  }),
  surface: Object.freeze({
    accentColor: Object.freeze([0.85, 0.42, 0.16]),
    edgeLight: 0.3,
    primaryColor: Object.freeze([0.4, 0.41, 0.39]),
    roughness: 0.9,
    secondaryColor: Object.freeze([0.5, 0.36, 0.22]),
    variation: 0.14,
  }),
});

// Per-type defaults layered over DEFAULT_PROP_SETTINGS (same mechanism as
// DEBRIS_TYPE_DEFAULTS): sensible starting shapes and palettes per type.
export const PROP_TYPE_DEFAULTS = Object.freeze({
  fence: Object.freeze({
    asset: Object.freeze({ variant: 'ranch' }),
    shape: Object.freeze({ gapChance: 0, lean: 0.3, postHeight: 1.05, postSpacing: 2.2, railCount: 2, sag: 0.3, thickness: 0.08 }),
    surface: Object.freeze({ accentColor: [0.55, 0.4, 0.24], primaryColor: [0.38, 0.27, 0.16], secondaryColor: [0.48, 0.35, 0.21] }),
  }),
  lantern: Object.freeze({
    asset: Object.freeze({ variant: 'stoneToro' }),
    shape: Object.freeze({ glow: 0.55, height: 1.6, lampSize: 1, roofOverhang: 1.25, wear: 0.4 }),
    surface: Object.freeze({ accentColor: [1, 0.72, 0.32], primaryColor: [0.42, 0.43, 0.41], secondaryColor: [0.52, 0.52, 0.48] }),
  }),
  signpost: Object.freeze({
    asset: Object.freeze({ variant: 'double' }),
    shape: Object.freeze({ boardLength: 0.85, height: 2.1, tilt: 0.25, wear: 0.35 }),
    surface: Object.freeze({ accentColor: [0.82, 0.74, 0.55], primaryColor: [0.36, 0.26, 0.16], secondaryColor: [0.5, 0.38, 0.24] }),
  }),
  stoneStairs: Object.freeze({
    asset: Object.freeze({ variant: 'straight' }),
    shape: Object.freeze({ stepCount: 6, stepHeight: 0.18, wear: 0.45, width: 1.4 }),
    surface: Object.freeze({ accentColor: [0.45, 0.52, 0.38], primaryColor: [0.42, 0.43, 0.41], secondaryColor: [0.55, 0.54, 0.5] }),
  }),
  milestone: Object.freeze({
    asset: Object.freeze({ variant: 'roadStone' }),
    shape: Object.freeze({ girth: 1, height: 0.8, inscription: 0.5, moss: 0.4 }),
    surface: Object.freeze({ accentColor: [0.4, 0.5, 0.32], primaryColor: [0.44, 0.45, 0.43], secondaryColor: [0.56, 0.55, 0.5] }),
  }),
  well: Object.freeze({
    asset: Object.freeze({ variant: 'roofed' }),
    shape: Object.freeze({ bucket: 1, radius: 0.8, roofHeight: 2.3, wallHeight: 0.85 }),
    surface: Object.freeze({ accentColor: [0.5, 0.36, 0.22], primaryColor: [0.45, 0.46, 0.44], secondaryColor: [0.4, 0.29, 0.18] }),
  }),
  crateStack: Object.freeze({
    asset: Object.freeze({ variant: 'mixed' }),
    shape: Object.freeze({ count: 4, jitter: 0.5, size: 0.62, stackiness: 0.55 }),
    surface: Object.freeze({ accentColor: [0.32, 0.33, 0.36], primaryColor: [0.5, 0.37, 0.22], secondaryColor: [0.6, 0.47, 0.28] }),
  }),
  firewood: Object.freeze({
    asset: Object.freeze({ variant: 'stacked' }),
    shape: Object.freeze({ height: 0.7, length: 1.6, logRadius: 0.08 }),
    surface: Object.freeze({ accentColor: [0.72, 0.62, 0.46], primaryColor: [0.35, 0.24, 0.14], secondaryColor: [0.52, 0.4, 0.26] }),
  }),
  torii: Object.freeze({
    asset: Object.freeze({ variant: 'myojin' }),
    shape: Object.freeze({ curvature: 0.55, height: 4.2, pillarRadius: 0.1, width: 1.15 }),
    surface: Object.freeze({ accentColor: [0.16, 0.16, 0.18], primaryColor: [0.78, 0.2, 0.12], secondaryColor: [0.62, 0.16, 0.1] }),
  }),
  pier: Object.freeze({
    asset: Object.freeze({ variant: 'straight' }),
    shape: Object.freeze({ deckHeight: 0.7, length: 8, rails: 1, width: 1.8 }),
    surface: Object.freeze({ accentColor: [0.36, 0.3, 0.24], primaryColor: [0.42, 0.3, 0.18], secondaryColor: [0.52, 0.4, 0.26] }),
  }),
  stoneWall: Object.freeze({
    asset: Object.freeze({ variant: 'dry' }),
    shape: Object.freeze({ height: 0.8, stoneSize: 1, thickness: 0.45, topCourse: 1 }),
    surface: Object.freeze({ accentColor: [0.42, 0.5, 0.34], primaryColor: [0.46, 0.46, 0.44], secondaryColor: [0.56, 0.55, 0.51] }),
  }),
  bench: Object.freeze({
    asset: Object.freeze({ variant: 'plank' }),
    shape: Object.freeze({ backrest: 0, height: 0.45, length: 1.5 }),
    surface: Object.freeze({ accentColor: [0.55, 0.42, 0.26], primaryColor: [0.4, 0.29, 0.18], secondaryColor: [0.5, 0.38, 0.24] }),
  }),
});

function cloneValue(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
  return value;
}

export function clonePropSettings(settings = DEFAULT_PROP_SETTINGS) {
  return cloneValue(settings);
}

export function createPropSettings(overrides = {}) {
  const requestedType = overrides.asset?.type;
  const type = PROP_TYPES[requestedType] ? requestedType : (requestedType ? 'lantern' : null);
  const typeDefaults = type ? PROP_TYPE_DEFAULTS[type] : null;
  const result = clonePropSettings(DEFAULT_PROP_SETTINGS);
  if (typeDefaults) {
    Object.assign(result.asset, cloneValue(typeDefaults.asset ?? {}));
    Object.assign(result.shape, cloneValue(typeDefaults.shape ?? {}));
    Object.assign(result.surface, cloneValue(typeDefaults.surface ?? {}));
    result.asset.type = type;
  }
  Object.assign(result.asset, cloneValue(overrides.asset ?? {}));
  Object.assign(result.shape, cloneValue(overrides.shape ?? {}));
  Object.assign(result.surface, cloneValue(overrides.surface ?? {}));
  result.asset.type = PROP_TYPES[result.asset.type] ? result.asset.type : 'lantern';
  const variants = PROP_TYPES[result.asset.type].variants;
  if (!variants.some((entry) => entry.id === result.asset.variant)) {
    result.asset.variant = variants[0].id;
  }
  result.asset.seed = Math.max(0, Math.round(Number(result.asset.seed) || 0)) >>> 0;
  result.asset.scale = Math.min(4, Math.max(0.25, Number(result.asset.scale) || 1));
  return result;
}

export const PROP_RECIPE_KIND = 'toonlab.propRecipe';
export const PROP_RECIPE_VERSION = 1;

export function createPropRecipeDocument(settings, { name = 'Untitled prop' } = {}) {
  return {
    kind: PROP_RECIPE_KIND,
    name,
    settings: createPropSettings(settings),
    version: PROP_RECIPE_VERSION,
  };
}

export function validatePropRecipeDocument(document) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('Recipe must be an object.');
  else {
    if (document.kind !== PROP_RECIPE_KIND) errors.push('Unknown recipe kind.');
    if (document.version !== PROP_RECIPE_VERSION) errors.push('Unsupported recipe version.');
    if (!document.settings?.asset) errors.push('Recipe settings are missing.');
    const requestedType = document.settings?.asset?.type;
    if (requestedType && !PROP_TYPES[requestedType]) {
      errors.push(`Unknown prop type “${requestedType}”.`);
    }
  }
  return { errors, ok: errors.length === 0 };
}
