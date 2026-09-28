// Canonical settings, field metadata, and validation for the procedural
// texture generator. The field schema below is the single source of truth:
// defaults, the lab UI, recipe validation, and the AI parameter mapping all
// derive from it (same pattern as rockgen/debrisgen *_SETTING_FIELD_SCHEMA).

import { TEXTURE_GENERATORS, TEXTURE_GENERATOR_IDS } from './textureGenerators.js';

export const TEXTURE_DETAIL_BLENDS = Object.freeze(['overlay', 'add', 'multiply', 'screen', 'min', 'max', 'mix']);
export const TEXTURE_ACCENT_BLENDS = Object.freeze(['normal', 'multiply', 'overlay', 'screen']);
export const TEXTURE_EMISSIVE_SOURCES = Object.freeze(['crevices', 'peaks', 'band', 'accentA', 'accentB', 'everywhere']);

const GENERATOR_LABELS = Object.freeze(Object.fromEntries(
  TEXTURE_GENERATOR_IDS.map((id) => [id, TEXTURE_GENERATORS[id].label]),
));

const num = (key, label, min, max, step, defaultValue, description, extra = {}) => Object.freeze({
  defaultValue, description, key, label, range: Object.freeze({ max, min, step }), type: 'number', ...extra,
});
const bool = (key, label, defaultValue, description, extra = {}) => Object.freeze({
  defaultValue, description, key, label, type: 'boolean', ...extra,
});
const sel = (key, label, options, optionLabels, defaultValue, description, extra = {}) => Object.freeze({
  defaultValue, description, key, label, optionLabels, options, type: 'select', ...extra,
});
const col = (key, label, defaultValue, description, extra = {}) => Object.freeze({
  defaultValue: Object.freeze(defaultValue), description, key, label, type: 'color', ...extra,
});

const generatorField = (defaultValue, description) => sel(
  'generator', 'Pattern', TEXTURE_GENERATOR_IDS, GENERATOR_LABELS, defaultValue, description,
);

// Layer parameters shared by base/detail/accent layers. Which ones a given
// generator reads is declared in TEXTURE_GENERATORS[id].uses — UIs filter
// on that so only meaningful sliders show.
const layerParamFields = ({ advancedShape = false } = {}) => [
  // Feature size is a property of the (scale, world tile) pairing, not of the
  // map: a tile bound at T metres resolves features of T / scale. At the old
  // cap of 64 a 2.4 m deck tile could not describe anything finer than 3.8 cm,
  // which is coarser than plank grain, asphalt aggregate or paver texture — the
  // cap, not the resolution, was setting the floor on feature size.
  num('scale', 'Scale', 1, 256, 1, 6, 'Feature cells across the tile. Higher = finer features. At a 2 m world tile, 200 resolves 1 cm detail.'),
  bool('rotate90', 'Rotate 90°', false, 'Turns the pattern a quarter turn (planks run vertical, strata run horizontal). Tiling stays exact.', { advanced: true }),
  num('detail', 'Detail octaves', 1, 8, 1, 4, 'Fractal octaves layered into the noise.'),
  num('detailGain', 'Detail strength', 0.15, 0.85, 0.01, 0.5, 'How much each finer octave contributes.', { advanced: true }),
  // Naming note: these multiply the FEATURE PERIOD COUNT on each axis, so
  // raising one makes features finer on that axis and therefore elongated
  // along the other. stretchX > 1 reads as vertical streaks, not horizontal
  // ones. The old labels claimed the opposite.
  num('stretchX', 'X frequency', 0.125, 16, 0.05, 1, 'Multiplies feature periods across U. Higher = finer in U, so features elongate along V and read as VERTICAL streaks (drips, fibers, strata). On grid patterns it instead widens the joint on the U axis.', { advanced: true }),
  num('stretchY', 'Y frequency', 0.125, 16, 0.05, 1, 'Multiplies feature periods down V. Higher = finer in V, so features elongate along U and read as HORIZONTAL streaks (brushed metal, boards lying across the frame). On grid patterns it instead widens the joint on the V axis.', { advanced: true }),
  num('warp', 'Warp', 0, 1, 0.01, 0, 'Domain warp: melts straight features into organic meanders.'),
  num('warpScale', 'Warp scale', 1, 32, 1, 3, 'Frequency of the warp field.', { advanced: true }),
  num('columns', 'Columns', 1, 256, 1, 4, 'Pattern cells across the tile.', { advanced: advancedShape }),
  num('rows', 'Rows', 1, 256, 1, 8, 'Pattern cells down the tile.', { advanced: advancedShape }),
  num('gap', 'Gap width', 0, 0.4, 0.005, 0.06, 'Mortar/groove width between pattern cells.', { advanced: advancedShape }),
  num('bevel', 'Bevel', 0, 0.5, 0.005, 0.12, 'Edge ramp from groove up to the cell face.', { advanced: advancedShape }),
  num('cellJitter', 'Cell jitter', 0, 1, 0.01, 1, 'Randomizes cell centers: 0 = perfect grid, 1 = organic.', { advanced: true }),
  num('cellVariation', 'Cell variation', 0, 1, 0.01, 0.35, 'Per-cell brightness variance (brick tint shifts).'),
  num('edgeWidth', 'Edge width', 0.01, 0.6, 0.005, 0.12, 'Width of cracks / caustic filaments / speckle chips.', { advanced: advancedShape }),
  num('rings', 'Rings / veins', 1, 128, 1, 6, 'Ring or vein count across the tile (wood, marble).', { advanced: advancedShape }),
  num('grain', 'Grain', 0, 1, 0.01, 0.5, 'Streak amount (wood) or vein sharpness (marble).', { advanced: advancedShape }),
];

const detailLayerFields = (defaults) => [
  bool('enabled', 'Enabled', defaults.enabled, 'Toggles this detail layer.'),
  generatorField(defaults.generator, 'Pattern blended over the base height.'),
  sel('blend', 'Blend', TEXTURE_DETAIL_BLENDS, {
    add: 'Add', max: 'Lighten', min: 'Darken', mix: 'Mix', multiply: 'Multiply', overlay: 'Overlay', screen: 'Screen',
  }, defaults.blend, 'How this layer combines with the height underneath.'),
  num('amount', 'Amount', 0, 1, 0.01, defaults.amount, 'Blend strength of this layer.'),
  bool('invert', 'Invert', false, 'Flips the layer before blending.', { advanced: true }),
  num('contrast', 'Contrast', -1, 1, 0.01, 0, 'Sharpens (+) or flattens (-) the layer.', { advanced: true }),
  ...layerParamFields({ advancedShape: true }).map((field) => (
    field.key === 'scale' ? { ...field, defaultValue: defaults.scale } : field
  )),
];

const accentLayerFields = (defaults) => [
  bool('enabled', 'Enabled', defaults.enabled, 'Toggles this overlay.'),
  generatorField(defaults.generator, 'Mask pattern deciding where the overlay lands.'),
  col('color', 'Color', defaults.color, 'Overlay color where the mask is strongest.'),
  col('colorB', 'Color B', defaults.colorB, 'Secondary overlay color for variation within the mask.'),
  num('coverage', 'Coverage', 0, 1, 0.01, defaults.coverage, 'How much of the surface the overlay claims.'),
  num('softness', 'Softness', 0.01, 0.6, 0.01, defaults.softness, 'Feather width of the overlay border.'),
  num('creviceBias', 'Crevice bias', -1, 1, 0.01, defaults.creviceBias, '+1 pools into crevices (moss, grime); -1 caps ridges and peaks (snow, wear).'),
  sel('blend', 'Blend', TEXTURE_ACCENT_BLENDS, {
    multiply: 'Multiply', normal: 'Paint', overlay: 'Overlay', screen: 'Screen',
  }, defaults.blend, 'How the overlay color mixes into the albedo.'),
  num('roughnessShift', 'Roughness shift', -1, 1, 0.01, defaults.roughnessShift, 'Overlay area gets rougher (+) or glossier (-).'),
  num('heightShift', 'Height shift', -0.5, 0.5, 0.01, defaults.heightShift, 'Overlay area rises (+) or sinks (-) in the height map.'),
  num('metalShift', 'Metal shift', -1, 1, 0.01, defaults.metalShift, 'Overlay area gains (+) or loses (-) metalness — rust strips metal.', { advanced: true }),
  num('contrast', 'Mask contrast', -1, 1, 0.01, 0, 'Sharpens (+) or flattens (-) the mask pattern.', { advanced: true }),
  bool('invert', 'Invert mask', false, 'Flips the mask before thresholding.', { advanced: true }),
  ...layerParamFields({ advancedShape: true }).map((field) => (
    field.key === 'scale' ? { ...field, defaultValue: defaults.scale }
      : field.key === 'warp' ? { ...field, defaultValue: defaults.warp }
        : field
  )),
];

const RAW_FIELD_SCHEMA = {
  global: [
    num('seed', 'Seed', 0, 99999, 1, 1337, 'Deterministic seed — every value is a different texture with the same recipe.'),
  ],
  base: [
    generatorField('fbm', 'Primary structure of the material: this drives height, color banding, and pattern cells.'),
    num('contrast', 'Contrast', -1, 1, 0.01, 0, 'Sharpens (+) or flattens (-) the base pattern.'),
    num('bias', 'Brightness bias', -0.5, 0.5, 0.01, 0, 'Shifts the whole pattern up or down the ramp.', { advanced: true }),
    bool('invert', 'Invert', false, 'Flips the base pattern (crevices become ridges).'),
    ...layerParamFields(),
  ],
  detailA: detailLayerFields({ amount: 0.35, blend: 'overlay', enabled: true, generator: 'fbm', scale: 18 }),
  detailB: detailLayerFields({ amount: 0.2, blend: 'add', enabled: false, generator: 'speckle', scale: 24 }),
  color: [
    col('color0', 'Deepest', [0.16, 0.14, 0.13], 'Ramp stop at the darkest crevices.'),
    col('color1', 'Low', [0.35, 0.31, 0.28], 'Ramp stop between crevices and the mid tone.'),
    col('color2', 'Mid', [0.55, 0.5, 0.45], 'Ramp stop for the average surface.'),
    col('color3', 'High', [0.72, 0.68, 0.62], 'Ramp stop approaching the ridges.'),
    col('color4', 'Peak', [0.88, 0.85, 0.79], 'Ramp stop at the highest ridges.'),
    num('pos1', 'Low position', 0.02, 0.98, 0.01, 0.25, 'Where the Low stop sits on the height ramp.', { advanced: true }),
    num('pos2', 'Mid position', 0.02, 0.98, 0.01, 0.5, 'Where the Mid stop sits on the height ramp.', { advanced: true }),
    num('pos3', 'High position', 0.02, 0.98, 0.01, 0.75, 'Where the High stop sits on the height ramp.', { advanced: true }),
    num('rampSmooth', 'Band smoothness', 0, 1, 0.01, 1, '1 = smooth gradient, 0 = hard cel bands between the five stops.'),
    num('jitterHue', 'Hue jitter', 0, 0.5, 0.005, 0.04, 'Painterly hue drift across the surface.'),
    num('jitterValue', 'Value jitter', 0, 0.5, 0.005, 0.08, 'Painterly brightness drift across the surface.'),
    num('jitterScale', 'Jitter scale', 2, 256, 1, 24, 'Frequency of the painterly drift.', { advanced: true }),
    bool('jitterCells', 'Jitter per cell', false, 'Applies drift per pattern cell (per brick / plank / scale) instead of smoothly. Reads the BASE layer\'s cell id, so it is a no-op when the base pattern has no cells.'),
    // A periodic tile can only ever hold `columns * rows` cell ids, and the
    // legacy path derived hue and value from two overlapping 16-bit slices of
    // the same hash — so a 4x4 paver tile showed 16 flat tints whose hue and
    // value moved together. Raising this decorrelates hue from value with
    // independent hashes and keeps the painterly drift alive inside each cell,
    // so modules stop reading as N flat swatches. 0 keeps the legacy result
    // byte-for-byte.
    num('jitterCellVariety', 'Per-cell variety', 0, 1, 0.01, 0, 'Enriches per-cell drift: decorrelates each cell\'s hue from its value and keeps painterly drift running inside the cell, so a tile with N modules stops reading as N flat tints. 0 = legacy flat per-cell tint.'),
    num('cavity', 'Cavity shading', 0, 1, 0.01, 0.35, 'Darkens crevices toward the cavity tint — the hand-painted occlusion read.'),
    col('cavityTint', 'Cavity tint', [0.13, 0.09, 0.08], 'Color the crevices sink toward.', { advanced: true }),
    num('sheen', 'Ridge sheen', 0, 1, 0.01, 0.18, 'Screens the sheen tint over ridges and edges — worn highlight.'),
    col('sheenTint', 'Sheen tint', [1, 0.97, 0.88], 'Color of the ridge highlight.', { advanced: true }),
    num('hueShift', 'Hue shift', -0.5, 0.5, 0.005, 0, 'Rotates the final palette hue.'),
    num('saturation', 'Saturation', 0, 2, 0.01, 1, 'Final color saturation.'),
    num('brightness', 'Brightness', 0.25, 1.75, 0.01, 1, 'Final brightness multiplier.'),
    num('contrast', 'Color contrast', -1, 1, 0.01, 0, 'Final color contrast.'),
    num('gamma', 'Gamma', 0.4, 2.5, 0.01, 1, 'Final gamma on the albedo.', { advanced: true }),
  ],
  wear: [
    num('damage', 'Damage', 0, 1, 0.01, 0, 'Universal wear macro: carves seeded scratches and chips into the surface and roughens them. One knob, many parameters.'),
    num('dirt', 'Dirt', 0, 1, 0.01, 0, 'Grime macro: darkens crevices with pooled dirt and raises their roughness, independent of the overlay slots.'),
  ],
  accentA: accentLayerFields({
    blend: 'normal', color: [0.35, 0.48, 0.22], colorB: [0.52, 0.62, 0.28], coverage: 0.35,
    creviceBias: 0.5, enabled: false, generator: 'fbm', heightShift: 0.05, metalShift: 0,
    roughnessShift: 0.25, scale: 5, softness: 0.18, warp: 0.3,
  }),
  accentB: accentLayerFields({
    blend: 'multiply', color: [0.16, 0.12, 0.09], colorB: [0.3, 0.24, 0.18], coverage: 0.3,
    creviceBias: 0.6, enabled: false, generator: 'turbulence', heightShift: -0.03, metalShift: 0,
    roughnessShift: 0.2, scale: 4, softness: 0.22, warp: 0.25,
  }),
  surface: [
    num('heightScale', 'Height depth', 0, 1, 0.01, 0.5, 'Overall relief strength — feeds the normal map, AO, and displacement.'),
    num('normalStrength', 'Normal strength', 0, 3, 0.01, 1, 'Extra multiplier on the derived normal map.'),
    bool('invertHeight', 'Invert height', false, 'Flips the height map (grooves become ridges).'),
    num('aoStrength', 'Occlusion', 0, 1, 0.01, 0.55, 'Baked ambient occlusion depth in the crevices.'),
    num('roughness', 'Roughness', 0, 1, 0.01, 0.75, 'Base roughness: 0 = mirror gloss, 1 = fully matte.'),
    num('roughnessContrast', 'Roughness contrast', -1, 1, 0.01, 0.35, '+1 = crevices rough & ridges polished; -1 = the reverse.'),
    num('metalness', 'Metalness', 0, 1, 0.01, 0, 'Base metalness of the material.'),
  ],
  emissive: [
    bool('enabled', 'Enabled', false, 'Adds a glow map (lava cracks, sci-fi circuits, embers).'),
    col('color', 'Glow color', [1, 0.45, 0.12], 'Emissive color.'),
    num('intensity', 'Intensity', 0, 8, 0.05, 2, 'Emissive brightness (preview material intensity).'),
    sel('source', 'Glow from', TEXTURE_EMISSIVE_SOURCES, {
      accentA: 'Overlay A', accentB: 'Overlay B', band: 'Height band', crevices: 'Crevices', everywhere: 'Everywhere', peaks: 'Peaks',
    }, 'crevices', 'Which part of the surface glows.'),
    num('threshold', 'Level', 0, 1, 0.01, 0.5, 'Height level the glow hugs (band / crevices / peaks).'),
    num('width', 'Width', 0.02, 0.8, 0.01, 0.25, 'Thickness of the glowing region.'),
    num('softness', 'Softness', 0.01, 0.6, 0.01, 0.2, 'Feather on the glow border.'),
  ],
};

export const TEXTURE_SETTING_GROUPS = Object.freeze([
  Object.freeze({ description: 'Deterministic seed shared by every layer.', id: 'global', label: 'Seed' }),
  Object.freeze({ description: 'The primary structure: pattern, frequency, warp.', id: 'base', label: 'Base pattern' }),
  Object.freeze({ description: 'Mid-frequency relief blended over the base.', id: 'detailA', label: 'Detail layer A' }),
  Object.freeze({ description: 'Fine grain, pores, chips.', id: 'detailB', label: 'Detail layer B' }),
  Object.freeze({ description: 'Five-stop height ramp, painterly jitter, cavity & sheen, final grade.', id: 'color', label: 'Color' }),
  Object.freeze({ description: 'One-knob damage and dirt macros layered over everything.', id: 'wear', label: 'Wear & tear' }),
  Object.freeze({ description: 'Masked colored overlay: moss, rust, dirt, snow, lichen…', id: 'accentA', label: 'Overlay A' }),
  Object.freeze({ description: 'Second masked overlay: grime, stains, scorch, drips…', id: 'accentB', label: 'Overlay B' }),
  Object.freeze({ description: 'PBR response: relief, occlusion, roughness, metalness.', id: 'surface', label: 'Surface' }),
  Object.freeze({ description: 'Optional emissive map.', id: 'emissive', label: 'Glow' }),
]);

/** group id -> { fieldKey -> field descriptor } (UI SchemaGroup shape). */
export const TEXTURE_SETTING_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  Object.entries(RAW_FIELD_SCHEMA).map(([group, fields]) => [
    group,
    Object.freeze(Object.fromEntries(fields.map((field) => [
      field.key,
      Object.freeze({ ...field, group, id: `${group}-${field.key}` }),
    ]))),
  ]),
));

export const DEFAULT_TEXTURE_SETTINGS = Object.freeze(Object.fromEntries(
  Object.entries(TEXTURE_SETTING_FIELD_SCHEMA).map(([group, fields]) => [
    group,
    Object.freeze(Object.fromEntries(Object.values(fields).map((field) => [
      field.key,
      Array.isArray(field.defaultValue) ? Object.freeze([...field.defaultValue]) : field.defaultValue,
    ]))),
  ]),
));

/** '#rrggbb' or '#rgb' -> [r, g, b] in 0..1, or null when not parseable. */
export function hexToRgb01(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 1, 2].map((i) => parseInt(s.slice(i * 2, i * 2 + 2), 16) / 255);
}

export function rgb01ToHex(rgb) {
  const channel = (v) => Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 255).toString(16).padStart(2, '0');
  return `#${channel(rgb?.[0])}${channel(rgb?.[1])}${channel(rgb?.[2])}`;
}

function clampFieldValue(field, value, fallback) {
  if (field.type === 'number') {
    const v = Number(value);
    if (!Number.isFinite(v)) return fallback;
    const { min, max, step } = field.range;
    const clamped = Math.min(max, Math.max(min, v));
    return step >= 1 ? Math.round(clamped) : clamped;
  }
  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1) return true;
    if (value === 'false' || value === 0) return false;
    return fallback;
  }
  if (field.type === 'select') {
    return field.options.includes(value) ? value : fallback;
  }
  if (field.type === 'color') {
    const fromHex = hexToRgb01(value);
    const rgb = fromHex ?? value;
    if (Array.isArray(rgb) && rgb.length >= 3 && rgb.every((c) => Number.isFinite(Number(c)))) {
      return rgb.slice(0, 3).map((c) => Math.min(1, Math.max(0, Number(c))));
    }
    return [...fallback];
  }
  return value === undefined ? fallback : value;
}

/**
 * Builds a complete, clamped settings object. Unknown groups/keys in the
 * overrides are ignored; colors accept hex strings or [r,g,b] triplets.
 */
export function createTextureSettings(overrides = {}) {
  const result = {};
  for (const [group, fields] of Object.entries(TEXTURE_SETTING_FIELD_SCHEMA)) {
    const groupOverrides = overrides?.[group] ?? {};
    const groupResult = {};
    for (const field of Object.values(fields)) {
      const fallback = Array.isArray(field.defaultValue) ? [...field.defaultValue] : field.defaultValue;
      groupResult[field.key] = field.key in groupOverrides
        ? clampFieldValue(field, groupOverrides[field.key], fallback)
        : fallback;
    }
    result[group] = groupResult;
  }
  result.global.seed = Math.max(0, Math.round(Number(result.global.seed) || 0)) % 100000;

  // Optional image base layer — not schema-driven (no slider maps to a
  // bitmap). Same shape/discipline as debrisgen's surface.customTexture:
  // a data URL plus clamped derivation params, preserved through clones.
  const image = overrides?.image;
  const clampNum = (value, min, max, fallback) => {
    const v = Number(value);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  };
  result.image = image && typeof image.dataUrl === 'string' && image.dataUrl
    ? {
      bands: Math.round(clampNum(image.bands, 0, 10, 0)),
      dataUrl: image.dataUrl,
      heightBase: clampNum(image.heightBase, 0, 1, 0.35),
      heightDetail: clampNum(image.heightDetail, 0, 1, 0.65),
      name: String(image.name ?? 'Image'),
      seamless: image.seamless !== false,
    }
    : null;
  return result;
}

export function cloneTextureSettings(settings) {
  return createTextureSettings(settings);
}

/** Flattens settings to { 'group.key': value } — the AI patch space. */
export function flattenTextureSettings(settings) {
  const flat = {};
  for (const [group, fields] of Object.entries(TEXTURE_SETTING_FIELD_SCHEMA)) {
    for (const field of Object.values(fields)) {
      const value = settings?.[group]?.[field.key];
      flat[`${group}.${field.key}`] = Array.isArray(value) ? rgb01ToHex(value) : value;
    }
  }
  return flat;
}

/**
 * Applies { 'group.key': value } patches onto settings with schema
 * clamping. Returns { settings, applied, ignored } — ignored lists the
 * patch keys that named no known field.
 */
export function applyTextureSettingsPatch(settings, patch = {}) {
  const next = createTextureSettings(settings);
  const applied = [];
  const ignored = [];
  for (const [path, value] of Object.entries(patch)) {
    const [group, key] = String(path).split('.');
    const field = TEXTURE_SETTING_FIELD_SCHEMA[group]?.[key];
    if (!field) {
      ignored.push(path);
      continue;
    }
    const fallback = next[group][key];
    next[group][key] = clampFieldValue(field, value, fallback);
    applied.push(path);
  }
  return { applied, ignored, settings: next };
}

export const TEXTURE_RECIPE_KIND = 'toonlab.textureRecipe';

export function createTextureRecipeDocument(settings, { name = 'Untitled texture' } = {}) {
  return {
    kind: TEXTURE_RECIPE_KIND,
    name,
    settings: createTextureSettings(settings),
    version: 1,
  };
}

export function validateTextureRecipeDocument(document) {
  const errors = [];
  if (!document || typeof document !== 'object') errors.push('Recipe must be an object.');
  else {
    if (document.kind !== TEXTURE_RECIPE_KIND) errors.push('Unknown recipe kind.');
    if (document.version !== 1) errors.push('Unsupported recipe version.');
    if (!document.settings || typeof document.settings !== 'object') errors.push('Recipe settings are missing.');
  }
  return { errors, ok: errors.length === 0 };
}
