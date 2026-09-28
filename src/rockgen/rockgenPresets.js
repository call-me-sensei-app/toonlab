// Rockgen's historical `style` axis is an asset-generation surface base. It
// changes baked color/zones and generator defaults; it is not the reusable
// runtime rock shader. New code selects the material independently through
// @call-me-sensei/toonlab/rock-shader. The public names remain for project and
// URL compatibility.

/** Document type tag for shareable rockgen preset JSON documents. */
export const ROCKGEN_PRESET_DOCUMENT_TYPE = 'toonlab/rockgen-preset';

/** Current schema version for rockgen preset documents. */
export const ROCKGEN_PRESET_SCHEMA_VERSION = 1;

const ROCKGEN_PRESETS = new Map();
const ROCKGEN_STYLES = new Map();

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergePartial(base, ...partials) {
  let result = structuredClone(cleanObject(base));
  for (const partial of partials) {
    for (const [key, value] of Object.entries(cleanObject(partial))) {
      result[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? mergePartial(result[key], value)
        : structuredClone(value);
    }
  }
  return result;
}

export function registerRockgenPreset(name, preset, { overwrite = false } = {}) {
  const key = String(name ?? '').trim();
  if (!key) throw new Error('Rockgen preset name is required.');
  if (!overwrite && ROCKGEN_PRESETS.has(key)) {
    throw new Error(`Rockgen preset "${key}" is already registered.`);
  }
  ROCKGEN_PRESETS.set(key, {
    kind: 'piece', // 'document' presets carry a `pieces` array instead
    label: key,
    meshing: null,
    piece: {},
    pieces: null,
    surface: null,
    ...preset,
  });
  return key;
}

export function normalizeRockgenPresetName(name) {
  const key = String(name ?? 'boulder').trim();
  // Legacy links/calls used the IP style as though it were an asset preset.
  if (ROCKGEN_STYLES.has(key)) return 'boulder';
  return ROCKGEN_PRESETS.has(key) ? key : 'boulder';
}

export function registerRockgenStyle(name, style = {}, { overwrite = false } = {}) {
  const key = String(name ?? '').trim();
  if (!key) throw new Error('Rockgen style name is required.');
  if (!overwrite && ROCKGEN_STYLES.has(key)) {
    throw new Error(`Rockgen style "${key}" is already registered.`);
  }
  const source = cleanObject(style);
  ROCKGEN_STYLES.set(key, {
    description: String(source.description ?? ''),
    label: String(source.label ?? key),
    meshing: cleanObject(source.meshing),
    piece: cleanObject(source.piece),
    presets: cleanObject(source.presets),
    surface: cleanObject(source.surface),
  });
  return key;
}

export function normalizeRockgenStyleName(name) {
  const key = String(name ?? 'default').trim();
  return ROCKGEN_STYLES.has(key) ? key : 'default';
}

export function getRockgenPresetOptions(kind = null) {
  return Array.from(ROCKGEN_PRESETS.entries())
    .filter(([, preset]) => kind === null || preset.kind === kind)
    .map(([value, preset]) => ({ label: preset.label, value }));
}

/** Lists legacy baked surface bases, never runtime rock-shader presets. */
export function getRockgenStyleOptions() {
  return Array.from(ROCKGEN_STYLES.entries()).map(([value, style]) => ({
    description: style.description,
    label: style.label,
    value,
  }));
}

/**
 * Returns a deep copy of the preset (`{ kind, label, piece, surface,
 * meshing }`) safe to mutate; unknown names fall back to 'boulder'.
 */
export function resolveRockgenPreset(name, { style } = {}) {
  const requested = String(name ?? 'boulder').trim();
  const legacyStyle = ROCKGEN_STYLES.has(requested) ? requested : null;
  const presetName = normalizeRockgenPresetName(requested);
  const styleName = normalizeRockgenStyleName(style ?? legacyStyle);
  const preset = structuredClone(ROCKGEN_PRESETS.get(presetName));
  const styleEntry = ROCKGEN_STYLES.get(styleName);
  const variant = cleanObject(styleEntry?.presets?.[presetName]);
  return {
    ...preset,
    meshing: mergePartial(preset.meshing, styleEntry?.meshing, variant.meshing),
    piece: mergePartial(preset.piece, styleEntry?.piece, variant.piece),
    surface: mergePartial(preset.surface, styleEntry?.surface, variant.surface),
  };
}

registerRockgenStyle('default', {
  description: 'Preset-authored asset color and geometry without a project-specific baked surface base.',
  label: 'Default',
});

// Preset doctrine (learned the hard way): rocks are flat or round with
// some jagged sides. Jaggedness comes from planar cuts; facet grooves and
// domain warp past ~0.15 read as melted organic tissue, and gradient
// normals on blobby geometry amplify it. Round presets stay smooth and
// QUIET (river stones); everything else gets flat normals + cuts.

registerRockgenPreset('boulder', {
  label: 'Boulder',
  meshing: { normalsMode: 'flat' },
  piece: {
    cuts: {
      bevel: 0.03, count: 7, depth: 0.24, enabled: true, verticalBias: 0.3,
    },
    falloff: { bottomFlatten: 0.4 },
    name: 'Boulder',
    noise: { amplitude: 0.07, frequency: 1.1, octaves: 3 },
    shape: { sizeX: 1.15, sizeY: 0.8, sizeZ: 1.0 },
    warp: { frequency: 0.7, strength: 0.08 },
  },
});

registerRockgenPreset('river-boulder', {
  label: 'River Boulder',
  piece: {
    falloff: { bottomFlatten: 0.2 },
    name: 'River Boulder',
    // Water-worn = genuinely smooth: one gentle noise octave pair, a
    // whisper of warp, gradient normals. The one preset meant to be round.
    noise: { amplitude: 0.05, frequency: 0.8, octaves: 2 },
    shape: { sizeX: 1.1, sizeY: 0.7, sizeZ: 0.9 },
    warp: { frequency: 0.6, strength: 0.12 },
  },
  surface: {
    baseColor: [0.58, 0.57, 0.55],
    cavityColor: [0.4, 0.38, 0.35],
    topColor: [0.82, 0.84, 0.85],
  },
});

registerRockgenPreset('karst-spire', {
  label: 'Karst Spire',
  meshing: { normalsMode: 'flat' },
  piece: {
    cuts: {
      bevel: 0.02, count: 8, depth: 0.3, enabled: true, verticalBias: 0.6,
    },
    falloff: { bottomFlatten: 0.35, topTaper: 0.5 },
    name: 'Karst Spire',
    noise: {
      amplitude: 0.07, frequency: 2.0, octaves: 4, ridged: true,
    },
    shape: { capsuleLength: 3.4, sizeX: 0.75, type: 'capsule' },
    strata: {
      enabled: true, frequency: 2.2, sharpness: 0.6, strength: 0.07, tiltDegrees: 4,
    },
    warp: { enabled: false, frequency: 0.55, strength: 0.1 },
  },
  surface: {
    baseColor: [0.6, 0.58, 0.52],
    cavityColor: [0.35, 0.32, 0.27],
    mossColor: [0.28, 0.43, 0.19],
    mossCoverage: 0.24,
    topColor: [0.78, 0.82, 0.8],
    topSlopeStart: 0.75,
  },
});

registerRockgenPreset('sea-stack', {
  label: 'Sea Stack',
  meshing: { normalsMode: 'flat' },
  piece: {
    cuts: {
      bevel: 0.025, count: 8, depth: 0.3, enabled: true, verticalBias: 0.75,
    },
    falloff: { bottomFlatten: 0.5, radialPinch: 0.25 },
    name: 'Sea Stack',
    noise: { amplitude: 0.06, frequency: 1.4, octaves: 3 },
    shape: { capsuleLength: 2.4, sizeX: 0.95, type: 'capsule' },
    strata: {
      enabled: true, frequency: 3.6, sharpness: 0.7, strength: 0.1, tiltDegrees: 6,
    },
    warp: { enabled: false, frequency: 0.6, strength: 0.1 },
  },
  surface: {
    baseColor: [0.45, 0.44, 0.42],
    cavityColor: [0.26, 0.25, 0.23],
    topColor: [0.75, 0.78, 0.76],
    topHeightStart: 0.65,
  },
});

// --- Showcase presets: tuned looks meant to sell the generator ------------
// Flat normals + strong Voronoi faceting is the signature stylized-rock
// recipe: surface nets' even topology turns into clean angular planes that
// cel-shade beautifully.

registerRockgenPreset('granite-boulder', {
  label: 'Granite Block (Angular)',
  meshing: { normalsMode: 'flat' },
  piece: {
    // Angular granite = many all-direction planar cuts on a squat
    // ellipsoid. (The old facet-groove version read as a brain.)
    cracks: {
      coverage: 0.45, depth: 0.06, enabled: true, scale: 1.1, width: 0.07,
    },
    cuts: {
      bevel: 0.02, count: 11, depth: 0.3, enabled: true, verticalBias: 0.2,
    },
    falloff: { bottomFlatten: 0.45 },
    name: 'Granite Block',
    noise: {
      amplitude: 0.05, frequency: 1.3, octaves: 3,
    },
    shape: { sizeX: 1.15, sizeY: 0.85, sizeZ: 1.0 },
    warp: { frequency: 0.7, strength: 0.06 },
  },
  surface: {
    baseColor: [0.55, 0.54, 0.53],
    cavityColor: [0.3, 0.29, 0.3],
    colorNoise: 0.04,
    topColor: [0.78, 0.79, 0.77],
    topHeightStart: 0.45,
    topSlopeStart: 0.6,
  },
});

// Columnar basalt cliff (Liyue / Giant's Causeway): vertical prismatic
// columns with stepped tops and offset horizontal joints. The columns
// stage defines the structure; strata adds the per-column break lines.
registerRockgenPreset('basalt-columns', {
  label: 'Basalt Columns',
  meshing: { exportResolution: 256, normalsMode: 'flat', previewResolution: 96 },
  piece: {
    columns: {
      enabled: true, grooveDepth: 0.17, grooveWidth: 0.13, heightVariation: 1.2, scale: 1.7,
    },
    falloff: { bottomFlatten: 0.35 },
    name: 'Basalt Columns',
    noise: { amplitude: 0.035, frequency: 2.4, octaves: 3 },
    shape: {
      cornerRadius: 0.2, sizeX: 1.6, sizeY: 2.4, sizeZ: 1.1, type: 'box',
    },
    strata: {
      enabled: true, frequency: 2.0, sharpness: 0.9, strength: 0.04, tiltDegrees: 0, warpAmount: 0.05,
    },
    warp: { frequency: 0.4, strength: 0.08 },
  },
  surface: {
    baseColor: [0.68, 0.58, 0.48],
    cavityColor: [0.4, 0.31, 0.24],
    colorNoise: 0.05,
    topColor: [0.8, 0.73, 0.62],
    topHeightStart: 0.3,
    topSlopeStart: 0.6,
  },
});

// A single sheer cliff wall: near-raw box silhouette, planar cuts with a
// strong vertical bias for stepped rock faces, whisper-quiet noise so the
// faces stay planar, subtle strata joints. Warp stays OFF — it would bow
// the wall back into a blob.
registerRockgenPreset('cliff-wall', {
  label: 'Cliff Wall (Flat)',
  meshing: { exportResolution: 288, normalsMode: 'flat', previewResolution: 96 },
  piece: {
    // Columns give the stepped skyline and vertical joints; cuts stagger
    // the wall plane itself so the face isn't one flat sheet.
    columns: {
      enabled: true, grooveDepth: 0.1, grooveWidth: 0.14, heightVariation: 0.9, scale: 1.2,
    },
    cuts: {
      bevel: 0.02, count: 10, depth: 0.32, enabled: true, verticalBias: 0.85,
    },
    falloff: { bottomFlatten: 0.45 },
    name: 'Cliff Wall',
    noise: { amplitude: 0.03, frequency: 2.2, octaves: 3 },
    shape: {
      cornerRadius: 0.02, sizeX: 2.6, sizeY: 2.4, sizeZ: 1.0, type: 'box',
    },
    strata: {
      enabled: true, frequency: 1.6, sharpness: 0.85, strength: 0.045, tiltDegrees: 2, warpAmount: 0.08,
    },
    warp: { enabled: false, frequency: 0.4, strength: 0.08 },
  },
  surface: {
    baseColor: [0.68, 0.58, 0.48],
    cavityColor: [0.4, 0.31, 0.24],
    colorNoise: 0.05,
    topColor: [0.8, 0.73, 0.62],
    topHeightStart: 0.3,
    topSlopeStart: 0.6,
  },
});

// Eroded landforms ('heightfield' shape): stylized drainage gullies + thermal
// talus — the terrain-tool look at rock-piece scale.
// Displacement stages stay quiet; the erosion IS the detail.
registerRockgenPreset('eroded-mesa', {
  label: 'Eroded Mesa',
  meshing: { exportResolution: 288, normalsMode: 'flat', previewResolution: 96 },
  piece: {
    falloff: { bottomFlatten: 0 },
    heightfield: {
      droplets: 0.55, erosion: 0.75, profile: 'mesa', relief: 0.55,
      roughness: 0.45, terrace: 0.5, terraceSteps: 7, thermal: 0.65,
    },
    name: 'Eroded Mesa',
    noise: { amplitude: 0.02, frequency: 2.6, octaves: 2 },
    shape: {
      sizeX: 2.6, sizeY: 1.3, sizeZ: 2.2, type: 'heightfield',
    },
    warp: { enabled: false },
  },
  surface: {
    baseColor: [0.72, 0.5, 0.34],
    cavityColor: [0.44, 0.26, 0.18],
    colorNoise: 0.05,
    topColor: [0.84, 0.7, 0.5],
    topHeightStart: 0.55,
    topSlopeStart: 0.6,
  },
});

registerRockgenPreset('canyon-ridge', {
  label: 'Canyon Ridge',
  meshing: { exportResolution: 288, normalsMode: 'flat', previewResolution: 96 },
  piece: {
    falloff: { bottomFlatten: 0 },
    heightfield: {
      // Relief past ~0.6 with 9 terrace steps out-runs what the droplets
      // can smooth at patch resolution — the ridge shatters into hoodoo
      // needles. Keep the backbone moderate and let erosion carve it.
      droplets: 0.7, erosion: 0.85, profile: 'ridge', relief: 0.52,
      roughness: 0.38, terrace: 0.55, terraceSteps: 7, thermal: 0.7,
    },
    name: 'Canyon Ridge',
    noise: { amplitude: 0.02, frequency: 2.4, octaves: 2 },
    shape: {
      sizeX: 1.6, sizeY: 1.6, sizeZ: 2.8, type: 'heightfield',
    },
    warp: { enabled: false },
  },
  surface: {
    baseColor: [0.68, 0.44, 0.3],
    cavityColor: [0.4, 0.22, 0.16],
    colorNoise: 0.06,
    topColor: [0.82, 0.66, 0.46],
    topHeightStart: 0.5,
    topSlopeStart: 0.55,
  },
});

// --- Document presets (multi-piece compositions) ---------------------------

const ARCH_COLUMN_PIECE = {
  columns: {
    enabled: true, grooveDepth: 0.17, grooveWidth: 0.13, heightVariation: 1.2, scale: 1.7,
  },
  falloff: { bottomFlatten: 0.35 },
  noise: { amplitude: 0.035, frequency: 2.4, octaves: 3 },
  strata: {
    enabled: true, frequency: 2.0, sharpness: 0.9, strength: 0.04, tiltDegrees: 0, warpAmount: 0.05,
  },
  warp: { frequency: 0.4, strength: 0.08 },
};

// A natural stone arch (Liyue-style): one wide columnar wall with an
// ellipsoid subtracted through it for the opening, flanked by a second
// bundle for an asymmetric skyline.
registerRockgenPreset('column-arch', {
  kind: 'document',
  label: 'Column Arch',
  meshing: { exportResolution: 288, normalsMode: 'flat', previewResolution: 96 },
  pieces: [
    {
      ...ARCH_COLUMN_PIECE,
      name: 'Arch Wall',
      shape: {
        cornerRadius: 0.2, sizeX: 3.0, sizeY: 2.6, sizeZ: 1.0, type: 'box',
      },
    },
    {
      ...ARCH_COLUMN_PIECE,
      combine: { blend: 0.5, op: 'smoothUnion' },
      name: 'Flank Bundle',
      seed: 3,
      shape: {
        cornerRadius: 0.25, sizeX: 1.1, sizeY: 1.9, sizeZ: 1.2, type: 'box',
      },
      transform: { position: [-2.9, -0.7, 0.4] },
    },
    {
      combine: { blend: 0.18, op: 'subtract' },
      name: 'Opening',
      noise: { amplitude: 0.12, frequency: 1.6, octaves: 3 },
      shape: { sizeX: 1.6, sizeY: 2.05, sizeZ: 3.2, type: 'ellipsoid' },
      transform: { position: [0.45, -1.45, 0] },
      warp: { frequency: 0.6, strength: 0.2 },
    },
  ],
  surface: {
    baseColor: [0.68, 0.58, 0.48],
    cavityColor: [0.4, 0.31, 0.24],
    colorNoise: 0.05,
    topColor: [0.8, 0.73, 0.62],
    topHeightStart: 0.3,
    topSlopeStart: 0.6,
  },
});

// Shared slab recipe for the cliff-face composition below.
const CLIFF_SLAB_PIECE = {
  cuts: {
    bevel: 0.02, count: 8, depth: 0.3, enabled: true, verticalBias: 0.8,
  },
  noise: { amplitude: 0.03, frequency: 2.2, octaves: 3 },
  strata: {
    enabled: true, frequency: 1.8, sharpness: 0.85, strength: 0.04, tiltDegrees: 2, warpAmount: 0.08,
  },
  warp: { enabled: false, frequency: 0.4, strength: 0.08 },
};

// A stacked cliff face (anime-style): staggered flat-cut slabs joined
// with HARD unions — smoothUnion would round the seams away; the crisp
// slab-on-slab joints are the look.
registerRockgenPreset('cliff-face', {
  kind: 'document',
  label: 'Cliff Face',
  meshing: { exportResolution: 288, normalsMode: 'flat', previewResolution: 96 },
  pieces: [
    {
      ...CLIFF_SLAB_PIECE,
      falloff: { bottomFlatten: 0.5 },
      name: 'Lower Wall',
      shape: {
        cornerRadius: 0.02, sizeX: 2.9, sizeY: 1.9, sizeZ: 1.15, type: 'box',
      },
    },
    {
      ...CLIFF_SLAB_PIECE,
      combine: { blend: 0, op: 'union' },
      name: 'Mid Wall',
      seed: 4,
      shape: {
        cornerRadius: 0.02, sizeX: 2.4, sizeY: 1.5, sizeZ: 0.95, type: 'box',
      },
      transform: { position: [0.35, 2.6, -0.3], rotation: [0, 0.12, 0] },
    },
    {
      ...CLIFF_SLAB_PIECE,
      combine: { blend: 0, op: 'union' },
      name: 'Crown Slab',
      seed: 9,
      shape: {
        cornerRadius: 0.03, sizeX: 1.7, sizeY: 1.0, sizeZ: 0.8, type: 'box',
      },
      transform: { position: [-0.5, 4.4, -0.55], rotation: [0, -0.2, 0] },
    },
    {
      ...CLIFF_SLAB_PIECE,
      combine: { blend: 0, op: 'union' },
      falloff: { bottomFlatten: 0.4 },
      name: 'Shoulder Block',
      seed: 13,
      shape: {
        cornerRadius: 0.03, sizeX: 1.1, sizeY: 1.1, sizeZ: 0.9, type: 'box',
      },
      transform: { position: [2.9, -0.8, 0.35], rotation: [0, 0.35, 0] },
    },
  ],
  surface: {
    baseColor: [0.68, 0.58, 0.48],
    cavityColor: [0.4, 0.31, 0.24],
    colorNoise: 0.05,
    topColor: [0.8, 0.73, 0.62],
    topHeightStart: 0.3,
    topSlopeStart: 0.6,
  },
});

// A boulder with satellite rubble — demonstrates hard-union clustering.
const SCREE_ROCK_PIECE = {
  cuts: {
    bevel: 0.025, count: 6, depth: 0.25, enabled: true, verticalBias: 0.3,
  },
  falloff: { bottomFlatten: 0.35 },
  noise: { amplitude: 0.06, frequency: 1.4, octaves: 3 },
  warp: { frequency: 0.7, strength: 0.06 },
};

registerRockgenPreset('scree-cluster', {
  kind: 'document',
  label: 'Scree Cluster',
  meshing: { normalsMode: 'flat' },
  pieces: [
    {
      ...SCREE_ROCK_PIECE,
      falloff: { bottomFlatten: 0.4 },
      name: 'Main Boulder',
      shape: { sizeX: 1.15, sizeY: 0.8, sizeZ: 1.0 },
    },
    {
      ...SCREE_ROCK_PIECE,
      combine: { blend: 0, op: 'union' },
      name: 'Rubble A',
      seed: 5,
      shape: { sizeX: 0.5, sizeY: 0.35, sizeZ: 0.45 },
      transform: { position: [1.3, -0.5, 0.4], rotation: [0, 0.7, 0] },
    },
    {
      ...SCREE_ROCK_PIECE,
      combine: { blend: 0, op: 'union' },
      name: 'Rubble B',
      seed: 9,
      shape: { sizeX: 0.4, sizeY: 0.3, sizeZ: 0.5 },
      transform: { position: [-1.15, -0.55, -0.5], rotation: [0, -0.4, 0] },
    },
  ],
  surface: {
    baseColor: [0.56, 0.53, 0.48],
    cavityColor: [0.36, 0.33, 0.29],
    topColor: [0.75, 0.76, 0.72],
    topHeightStart: 0.5,
    topSlopeStart: 0.6,
  },
});

// The classic low-poly look: the COARSE GRID is the art style. Preview and
// export mesh at the same resolution so exports are exactly what you see;
// flat normals turn every surface-nets quad into a readable facet.
registerRockgenPreset('lowpoly-boulder', {
  label: 'Low-Poly Boulder',
  meshing: { exportResolution: 32, normalsMode: 'flat', previewResolution: 32 },
  piece: {
    falloff: { bottomFlatten: 0.4 },
    name: 'Low-Poly Boulder',
    noise: { amplitude: 0.16, frequency: 1.0, octaves: 3 },
    shape: { sizeX: 1.2, sizeY: 0.85, sizeZ: 1.0 },
    warp: { frequency: 0.7, strength: 0.25 },
  },
  surface: {
    baseColor: [0.56, 0.53, 0.48],
    cavityColor: [0.36, 0.33, 0.29],
    colorNoise: 0.03,
    topColor: [0.75, 0.76, 0.72],
    topHeightStart: 0.5,
    topSlopeStart: 0.6,
  },
});

registerRockgenPreset('mossy-boulder', {
  label: 'Mossy Boulder',
  meshing: { normalsMode: 'flat' },
  piece: {
    cuts: {
      bevel: 0.04, count: 5, depth: 0.2, enabled: true, verticalBias: 0.3,
    },
    falloff: { bottomFlatten: 0.42 },
    name: 'Mossy Boulder',
    noise: { amplitude: 0.06, frequency: 1.2, octaves: 3 },
    shape: { sizeX: 1.1, sizeY: 0.8, sizeZ: 0.95 },
    warp: { frequency: 0.7, strength: 0.08 },
  },
  surface: {
    baseColor: [0.5, 0.47, 0.42],
    cavityColor: [0.28, 0.26, 0.22],
    colorNoise: 0.05,
    lichenCoverage: 0.16,
    mossColor: [0.24, 0.39, 0.18],
    mossCoverage: 0.62,
    textureScale: 1.2,
    textureStrength: 0.18,
    textureStyle: 'granite',
    topColor: [0.55, 0.61, 0.43],
    topHeightStart: 0.4,
    topSlopeStart: 0.5,
  },
});

// ('desert-mesa' retired: the eroded-mesa heightfield preset supersedes the
// old box-with-strata approximation. normalizeRockgenPresetName falls saved
// documents back to 'boulder' gracefully.)

registerRockgenPreset('shard-monolith', {
  label: 'Shard Monolith (Flat)',
  meshing: { normalsMode: 'flat' },
  piece: {
    // The shard look comes from planar cuts, not facet grooves — cuts leave
    // dead-flat faces and sharp edges; heavy facet strength just shatters
    // the box into rounded blobs.
    cuts: {
      bevel: 0.015, count: 7, depth: 0.4, enabled: true, verticalBias: 0.45,
    },
    falloff: { bottomFlatten: 0.4 },
    name: 'Shard Monolith',
    noise: { amplitude: 0.025, frequency: 1.8, octaves: 3 },
    shape: {
      cornerRadius: 0.04, sizeX: 0.7, sizeY: 2.0, sizeZ: 0.55, type: 'box',
    },
    warp: { frequency: 0.45, strength: 0.05 },
  },
  surface: {
    baseColor: [0.5, 0.54, 0.6],
    cavityColor: [0.26, 0.28, 0.34],
    colorNoise: 0.03,
    topColor: [0.72, 0.77, 0.82],
    topHeightStart: 0.55,
    topSlopeStart: 0.55,
  },
});

// Historical studio asset base. It covers every rock preset with one set of
// baked color/zoning defaults and does not configure the runtime rock shader.
// The boulder variant keeps the historical shallow signature strata for legacy
// `preset: 'call_me_sensei'` calls; other presets retain their own geometry.
registerRockgenStyle('call_me_sensei', {
  description: 'Legacy asset-generation base: bakes warm limestone zones, dark seams, lifted tops, and restrained moss into generated asset channels.',
  label: 'Call Me Sensei asset base',
  presets: {
    boulder: {
      piece: {
        strata: {
          enabled: true,
          frequency: 5.2,
          sharpness: 0.82,
          strength: 0.045,
          tiltDegrees: 2,
          warpAmount: 0.12,
        },
      },
    },
  },
  surface: {
    baseColor: [0.6, 0.51, 0.39],
    cavityColor: [0.25, 0.21, 0.17],
    colorNoise: 0.04,
    lichenCoverage: 0.08,
    mossColor: [0.29, 0.46, 0.19],
    mossCoverage: 0.34,
    stainColor: [0.62, 0.39, 0.2],
    stainStrength: 0.16,
    textureScale: 1.35,
    textureStrength: 0.58,
    textureStyle: 'limestone',
    topColor: [0.78, 0.72, 0.6],
    topHeightStart: 0.48,
    topSlopeStart: 0.68,
  },
});
