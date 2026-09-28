// Deterministic realistic surfaces for Nature Reference Rocks.
//
// This module deliberately shares no texture bytes, seeds, or asset identities
// with the released 480-rock/C7 library. It carries forward only the fixes that
// proved useful there: metre-isotropic world projection, bounds-driven
// reprojection after edits, non-uniform geological fabrics, independent PBR
// channels, and deterministic replaceable derivatives. Bedded profiles use an
// axis-conditioned side sampler; non-bedded profiles retain triplanar.

import { sha256Hex } from '../../core/sha256.js';

export const C8_FIRST12_SURFACE_SCHEMA = 'toonlab/c8-first12-geology-surface';
export const C8_FIRST12_SURFACE_VERSION = 2;

export const C8_SEMANTIC_SURFACE_REGIONS_SCHEMA = 'toonlab/c8-semantic-surface-regions';
export const C8_SEMANTIC_SURFACE_REGIONS_VERSION = 1;

export const C8_FIRST12_MAP_ROLES = Object.freeze([
  'ao',
  'baseColor',
  'heightMicro',
  'normalGL',
  'orm',
  'roughness',
  'smoothness',
]);

export const C8_FIRST12_ASSET_IDS = Object.freeze([
  'hoodoo-caprock',
  'tor-block-pile',
  'boulder-rounded',
  'block-jointed',
  'boulder-river-worn',
  'slab-bedded',
  'outcrop-jointed',
  'outcrop-bedded',
  'ledge-resistant',
  'pillar-residual',
  'sea-stack',
  'volcanic-neck',
]);

const PROFILE = (profile) => Object.freeze({
  ...profile,
  admissionLimits: profile.admissionLimits ? Object.freeze([...profile.admissionLimits]) : null,
  baseDark: Object.freeze(profile.baseDark),
  baseLight: Object.freeze(profile.baseLight),
  fractures: Object.freeze({
    ...profile.fractures,
    width: Object.freeze(profile.fractures.width),
  }),
  mineralDark: Object.freeze(profile.mineralDark),
  mineralLight: Object.freeze(profile.mineralLight),
  roughness: Object.freeze(profile.roughness),
  semanticRegionRoles: profile.semanticRegionRoles
    ? Object.freeze([...profile.semanticRegionRoles])
    : null,
  strata: profile.strata ? Object.freeze({
    ...profile.strata,
    dark: Object.freeze(profile.strata.dark),
    light: Object.freeze(profile.strata.light),
  }) : null,
});

/**
 * Lithology profiles are intentionally narrower than visual "rock families".
 * They control material/fabric only; morphology remains owned by the edited
 * high source and the subtype recipe.
 */
export const C8_FIRST12_LITHOLOGY_PROFILES = Object.freeze({
  'claron-carbonate-bedded': PROFILE({
    label: 'Iron-stained bedded carbonate',
    lithology: 'limestone/dolostone caprock and weaker carbonate beds',
    fabric: 'bedded-carbonate',
    baseDark: [0.20, 0.055, 0.026],
    baseLight: [0.78, 0.31, 0.15],
    mineralDark: [0.10, 0.020, 0.012],
    mineralLight: [0.82, 0.56, 0.36],
    baseTileMetres: 1.25,
    heightMicroSpanMetres: 0.026,
    normalStrength: 1.15,
    roughness: [0.66, 0.94],
    grainScale: 0.074,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 4, branchCount: 3, width: [0.0012, 0.0046], depth: 0.040 },
    strata: { frequency: 7.2, spacingJitter: 0.10, warp: 0.18, curvature: 0.04, colorStrength: 0.22, reliefStrength: 0.30, dark: [0.12, 0.018, 0.012], light: [0.88, 0.48, 0.27] },
  }),
  'coarse-granite-jointed': PROFILE({
    label: 'Coarse jointed granite',
    lithology: 'coarse granite/monzogranite',
    fabric: 'crystalline-jointed',
    baseDark: [0.16, 0.17, 0.18],
    baseLight: [0.62, 0.58, 0.52],
    mineralDark: [0.035, 0.040, 0.045],
    mineralLight: [0.78, 0.72, 0.64],
    baseTileMetres: 1.10,
    heightMicroSpanMetres: 0.020,
    normalStrength: 1.05,
    roughness: [0.58, 0.88],
    grainScale: 0.090,
    fractures: { mode: 'orthogonal-joints', primaryCount: 5, branchCount: 4, width: [0.0009, 0.0038], depth: 0.043 },
    strata: null,
  }),
  'weathered-monzogranite': PROFILE({
    label: 'Weathered rounded monzogranite',
    lithology: 'granite/monzogranite with granular weathering',
    fabric: 'crystalline-rounded',
    baseDark: [0.17, 0.16, 0.15],
    baseLight: [0.67, 0.60, 0.51],
    mineralDark: [0.045, 0.042, 0.040],
    mineralLight: [0.82, 0.74, 0.64],
    baseTileMetres: 0.82,
    heightMicroSpanMetres: 0.016,
    normalStrength: 0.86,
    roughness: [0.56, 0.86],
    grainScale: 0.086,
    fractures: { mode: 'weathered-relict-joints', primaryCount: 3, branchCount: 2, width: [0.0010, 0.0032], depth: 0.024 },
    strata: null,
  }),
  'river-abraded-sandstone': PROFILE({
    label: 'River-abraded sandstone',
    lithology: 'quartz sandstone with transport abrasion',
    fabric: 'abraded-sandstone',
    baseDark: [0.24, 0.105, 0.045],
    baseLight: [0.79, 0.49, 0.25],
    mineralDark: [0.11, 0.046, 0.023],
    mineralLight: [0.91, 0.72, 0.48],
    baseTileMetres: 0.72,
    heightMicroSpanMetres: 0.012,
    normalStrength: 0.72,
    roughness: [0.48, 0.78],
    grainScale: 0.070,
    fractures: { mode: 'transport-impact', primaryCount: 3, branchCount: 2, width: [0.0008, 0.0026], depth: 0.020 },
    strata: { frequency: 5.1, spacingJitter: 0.08, warp: 0.12, curvature: 0.04, colorStrength: 0.10, reliefStrength: 0.18, dark: [0.17, 0.060, 0.026], light: [0.86, 0.59, 0.34] },
  }),
  'red-sandstone-bedded': PROFILE({
    label: 'Iron-rich bedded sandstone',
    lithology: 'cross-bedded quartz sandstone',
    fabric: 'bedded-sandstone',
    baseDark: [0.24, 0.030, 0.014],
    baseLight: [0.86, 0.25, 0.075],
    mineralDark: [0.085, 0.008, 0.006],
    mineralLight: [0.92, 0.54, 0.27],
    baseTileMetres: 1.05,
    heightMicroSpanMetres: 0.018,
    normalStrength: 0.92,
    roughness: [0.64, 0.92],
    grainScale: 0.076,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 4, branchCount: 3, width: [0.0010, 0.0042], depth: 0.036 },
    strata: { frequency: 8.2, spacingJitter: 0.14, warp: 0.28, curvature: 0.06, colorStrength: 0.44, reliefStrength: 0.38, dark: [0.095, 0.006, 0.004], light: [0.95, 0.52, 0.22] },
  }),
  'kaibab-limestone-ledge': PROFILE({
    label: 'Resistant pale limestone',
    lithology: 'massive to bedded limestone/dolostone',
    fabric: 'bedded-carbonate',
    baseDark: [0.24, 0.22, 0.17],
    baseLight: [0.74, 0.69, 0.55],
    mineralDark: [0.12, 0.11, 0.085],
    mineralLight: [0.88, 0.84, 0.70],
    baseTileMetres: 1.55,
    heightMicroSpanMetres: 0.024,
    normalStrength: 1.14,
    roughness: [0.68, 0.95],
    grainScale: 0.068,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 4, branchCount: 3, width: [0.0012, 0.0048], depth: 0.042 },
    strata: { frequency: 5.6, spacingJitter: 0.08, warp: 0.12, curvature: 0.03, colorStrength: 0.15, reliefStrength: 0.24, dark: [0.18, 0.16, 0.12], light: [0.83, 0.78, 0.62] },
  }),
  'quartz-sandstone-pillar': PROFILE({
    label: 'Weathered quartz-sandstone pillar',
    lithology: 'quartz sandstone with iron-stained bedding and joints',
    fabric: 'bedded-sandstone',
    baseDark: [0.19, 0.055, 0.025],
    baseLight: [0.73, 0.34, 0.15],
    mineralDark: [0.075, 0.017, 0.009],
    mineralLight: [0.89, 0.59, 0.32],
    baseTileMetres: 1.45,
    heightMicroSpanMetres: 0.024,
    normalStrength: 1.04,
    roughness: [0.62, 0.91],
    grainScale: 0.079,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 5, branchCount: 4, width: [0.0010, 0.0044], depth: 0.040 },
    strata: { frequency: 6.8, spacingJitter: 0.11, warp: 0.22, curvature: 0.05, colorStrength: 0.30, reliefStrength: 0.32, dark: [0.09, 0.015, 0.008], light: [0.91, 0.53, 0.27] },
  }),
  'coastal-sandstone-stack': PROFILE({
    label: 'Salt-weathered coastal sandstone',
    lithology: 'bedded coastal sandstone',
    fabric: 'coastal-bedded-sandstone',
    baseDark: [0.18, 0.12, 0.075],
    baseLight: [0.66, 0.49, 0.31],
    mineralDark: [0.07, 0.047, 0.032],
    mineralLight: [0.84, 0.73, 0.57],
    baseTileMetres: 1.62,
    heightMicroSpanMetres: 0.032,
    normalStrength: 1.20,
    roughness: [0.66, 0.96],
    grainScale: 0.072,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 5, branchCount: 4, width: [0.0013, 0.0054], depth: 0.050 },
    strata: { frequency: 5.9, spacingJitter: 0.10, warp: 0.18, curvature: 0.04, colorStrength: 0.20, reliefStrength: 0.30, dark: [0.12, 0.075, 0.047], light: [0.77, 0.62, 0.44] },
  }),
  'phonolite-porphyry-cooling': PROFILE({
    label: 'Porphyritic intrusive phonolite',
    lithology: 'phonolite porphyry / resistant intrusive volcanic rock',
    fabric: 'porphyritic-cooling-jointed',
    baseDark: [0.035, 0.040, 0.042],
    baseLight: [0.30, 0.32, 0.30],
    mineralDark: [0.012, 0.015, 0.016],
    mineralLight: [0.58, 0.61, 0.56],
    baseTileMetres: 1.35,
    heightMicroSpanMetres: 0.022,
    normalStrength: 1.18,
    roughness: [0.58, 0.88],
    grainScale: 0.084,
    fractures: { mode: 'cooling-joints', primaryCount: 6, branchCount: 4, width: [0.0009, 0.0040], depth: 0.047 },
    strata: null,
  }),
  'basalt-mafic-cooling': PROFILE({
    label: 'Mafic basalt with cooling joints',
    lithology: 'fine-grained basalt / mafic volcanic rock',
    fabric: 'crystalline-mafic-cooling-jointed',
    baseDark: [0.018, 0.022, 0.024],
    baseLight: [0.19, 0.21, 0.20],
    mineralDark: [0.006, 0.008, 0.009],
    mineralLight: [0.38, 0.41, 0.37],
    baseTileMetres: 1.18,
    heightMicroSpanMetres: 0.018,
    normalStrength: 1.10,
    roughness: [0.57, 0.87],
    grainScale: 0.060,
    fractures: { mode: 'cooling-joints', primaryCount: 6, branchCount: 4, width: [0.0008, 0.0038], depth: 0.045 },
    strata: null,
  }),
  'conglomerate-clastic': PROFILE({
    label: 'Matrix-supported conglomerate',
    lithology: 'conglomerate with rounded to subrounded clasts in a finer matrix',
    fabric: 'clastic-conglomerate',
    baseDark: [0.16, 0.12, 0.085],
    baseLight: [0.57, 0.48, 0.36],
    mineralDark: [0.055, 0.045, 0.038],
    mineralLight: [0.78, 0.70, 0.57],
    baseTileMetres: 0.92,
    heightMicroSpanMetres: 0.024,
    normalStrength: 1.04,
    roughness: [0.63, 0.92],
    grainScale: 0.095,
    fractures: { mode: 'matrix-cross-joints', primaryCount: 3, branchCount: 3, width: [0.0010, 0.0040], depth: 0.031 },
    strata: null,
  }),
  'fissile-shale': PROFILE({
    label: 'Dark fissile shale',
    lithology: 'thinly laminated shale',
    fabric: 'fine-clastic-fissile-bedded',
    baseDark: [0.055, 0.052, 0.048],
    baseLight: [0.31, 0.30, 0.27],
    mineralDark: [0.018, 0.018, 0.017],
    mineralLight: [0.47, 0.45, 0.39],
    baseTileMetres: 0.58,
    heightMicroSpanMetres: 0.010,
    normalStrength: 0.82,
    roughness: [0.60, 0.91],
    grainScale: 0.045,
    fractures: { mode: 'fissility-cross-joints', primaryCount: 5, branchCount: 3, width: [0.0005, 0.0024], depth: 0.025 },
    strata: { frequency: 12.4, spacingJitter: 0.17, warp: 0.10, curvature: 0.025, colorStrength: 0.19, reliefStrength: 0.29, dark: [0.026, 0.025, 0.023], light: [0.39, 0.37, 0.32] },
  }),
  'glassy-volcanic-vitrophyre': PROFILE({
    label: 'Glassy volcanic vitrophyre',
    lithology: 'vitrophyre / glass-rich volcanic rock',
    fabric: 'glassy-volcanic-conchoidal',
    baseDark: [0.010, 0.012, 0.014],
    baseLight: [0.20, 0.17, 0.15],
    mineralDark: [0.003, 0.004, 0.005],
    mineralLight: [0.40, 0.32, 0.26],
    baseTileMetres: 0.68,
    heightMicroSpanMetres: 0.009,
    normalStrength: 0.68,
    roughness: [0.34, 0.70],
    grainScale: 0.052,
    fractures: { mode: 'conchoidal-fracture', primaryCount: 4, branchCount: 4, width: [0.0005, 0.0028], depth: 0.034 },
    strata: null,
  }),
  'gneiss-foliated': PROFILE({
    label: 'Foliated gneiss',
    lithology: 'compositionally banded gneiss',
    fabric: 'crystalline-gneissic-foliation',
    baseDark: [0.08, 0.085, 0.088],
    baseLight: [0.55, 0.54, 0.50],
    mineralDark: [0.018, 0.020, 0.022],
    mineralLight: [0.78, 0.76, 0.69],
    baseTileMetres: 1.12,
    heightMicroSpanMetres: 0.018,
    normalStrength: 0.93,
    roughness: [0.54, 0.84],
    grainScale: 0.075,
    fractures: { mode: 'foliation-cross-joints', primaryCount: 4, branchCount: 3, width: [0.0008, 0.0035], depth: 0.034 },
    strata: { frequency: 6.3, spacingJitter: 0.16, warp: 0.34, curvature: 0.10, colorStrength: 0.42, reliefStrength: 0.20, dark: [0.025, 0.028, 0.032], light: [0.78, 0.76, 0.69] },
  }),
  'grey-siltstone-jointed': PROFILE({
    label: 'Grey jointed siltstone',
    lithology: 'fine grey siltstone with persistent joints',
    fabric: 'fine-clastic-jointed',
    baseDark: [0.105, 0.115, 0.115],
    baseLight: [0.52, 0.54, 0.51],
    mineralDark: [0.044, 0.049, 0.050],
    mineralLight: [0.70, 0.71, 0.66],
    baseTileMetres: 0.96,
    heightMicroSpanMetres: 0.014,
    normalStrength: 0.86,
    roughness: [0.64, 0.92],
    grainScale: 0.052,
    fractures: { mode: 'orthogonal-joints', primaryCount: 5, branchCount: 4, width: [0.0008, 0.0038], depth: 0.038 },
    strata: null,
  }),
  'quartzite-jointed': PROFILE({
    label: 'Hard jointed quartzite',
    lithology: 'quartzite with sparse persistent joints',
    fabric: 'crystalline-quartzite-jointed',
    baseDark: [0.17, 0.16, 0.15],
    baseLight: [0.69, 0.66, 0.61],
    mineralDark: [0.07, 0.065, 0.061],
    mineralLight: [0.88, 0.86, 0.81],
    baseTileMetres: 1.08,
    heightMicroSpanMetres: 0.014,
    normalStrength: 0.89,
    roughness: [0.50, 0.80],
    grainScale: 0.058,
    fractures: { mode: 'orthogonal-joints', primaryCount: 4, branchCount: 3, width: [0.0007, 0.0032], depth: 0.037 },
    strata: null,
  }),
  'schist-phyllite-cleavage': PROFILE({
    label: 'Phyllitic cleavage fabric',
    lithology: 'phyllite to fine schist with penetrative cleavage',
    fabric: 'metamorphic-cleavage-foliation',
    baseDark: [0.045, 0.055, 0.055],
    baseLight: [0.31, 0.35, 0.34],
    mineralDark: [0.014, 0.018, 0.019],
    mineralLight: [0.54, 0.58, 0.55],
    baseTileMetres: 0.72,
    heightMicroSpanMetres: 0.011,
    normalStrength: 0.78,
    roughness: [0.43, 0.78],
    grainScale: 0.043,
    fractures: { mode: 'cleavage-cross-joints', primaryCount: 5, branchCount: 3, width: [0.0005, 0.0026], depth: 0.029 },
    strata: { frequency: 10.1, spacingJitter: 0.14, warp: 0.17, curvature: 0.05, colorStrength: 0.16, reliefStrength: 0.23, dark: [0.020, 0.026, 0.027], light: [0.45, 0.49, 0.47] },
  }),
  'silicic-lava-blocky': PROFILE({
    label: 'Blocky silicic lava',
    lithology: 'silicic lava with blocky carapace',
    fabric: 'silicic-volcanic-blocky',
    baseDark: [0.06, 0.050, 0.047],
    baseLight: [0.39, 0.34, 0.31],
    mineralDark: [0.020, 0.017, 0.016],
    mineralLight: [0.62, 0.57, 0.52],
    baseTileMetres: 1.22,
    heightMicroSpanMetres: 0.025,
    normalStrength: 1.18,
    roughness: [0.62, 0.91],
    grainScale: 0.069,
    fractures: { mode: 'blocky-cooling-fracture', primaryCount: 6, branchCount: 5, width: [0.0010, 0.0046], depth: 0.050 },
    strata: null,
  }),
  'silicic-lava-flow-banded': PROFILE({
    label: 'Flow-banded silicic lava',
    lithology: 'silicic lava with coherent flow banding',
    fabric: 'silicic-volcanic-flow-banded',
    baseDark: [0.07, 0.050, 0.045],
    baseLight: [0.48, 0.37, 0.31],
    mineralDark: [0.022, 0.016, 0.015],
    mineralLight: [0.70, 0.61, 0.53],
    baseTileMetres: 1.16,
    heightMicroSpanMetres: 0.020,
    normalStrength: 0.98,
    roughness: [0.54, 0.84],
    grainScale: 0.062,
    fractures: { mode: 'flow-band-cross-fractures', primaryCount: 4, branchCount: 3, width: [0.0008, 0.0035], depth: 0.036 },
    strata: { frequency: 7.4, spacingJitter: 0.16, warp: 0.42, curvature: 0.13, colorStrength: 0.34, reliefStrength: 0.22, dark: [0.028, 0.018, 0.017], light: [0.67, 0.55, 0.46] },
  }),
  'soft-bedded-mudstone': PROFILE({
    label: 'Soft bedded mudstone',
    lithology: 'thinly bedded mudstone and silt-rich weak sediment',
    fabric: 'fine-clastic-soft-bedded',
    baseDark: [0.15, 0.075, 0.043],
    baseLight: [0.58, 0.32, 0.18],
    mineralDark: [0.055, 0.027, 0.019],
    mineralLight: [0.75, 0.48, 0.29],
    baseTileMetres: 0.84,
    heightMicroSpanMetres: 0.016,
    normalStrength: 0.88,
    roughness: [0.70, 0.96],
    grainScale: 0.049,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 3, branchCount: 3, width: [0.0008, 0.0035], depth: 0.027 },
    strata: { frequency: 9.6, spacingJitter: 0.21, warp: 0.24, curvature: 0.08, colorStrength: 0.31, reliefStrength: 0.34, dark: [0.065, 0.026, 0.017], light: [0.72, 0.42, 0.24] },
  }),
  'travertine-tufa-accretionary': PROFILE({
    label: 'Accretionary travertine and tufa',
    lithology: 'porous precipitated carbonate with accretionary laminae',
    fabric: 'carbonate-accretionary-banded',
    baseDark: [0.23, 0.16, 0.085],
    baseLight: [0.81, 0.70, 0.49],
    mineralDark: [0.10, 0.065, 0.037],
    mineralLight: [0.92, 0.86, 0.69],
    baseTileMetres: 0.78,
    heightMicroSpanMetres: 0.027,
    normalStrength: 1.12,
    roughness: [0.63, 0.94],
    grainScale: 0.056,
    fractures: { mode: 'accretionary-shrinkage', primaryCount: 3, branchCount: 3, width: [0.0007, 0.0030], depth: 0.025 },
    strata: { frequency: 8.7, spacingJitter: 0.20, warp: 0.31, curvature: 0.11, colorStrength: 0.28, reliefStrength: 0.31, dark: [0.12, 0.075, 0.040], light: [0.90, 0.79, 0.58] },
  }),
  'viscous-lava-spine': PROFILE({
    label: 'Dense viscous lava spine',
    lithology: 'dense silicic to intermediate lava spine',
    fabric: 'silicic-volcanic-spine-fractured',
    baseDark: [0.035, 0.032, 0.031],
    baseLight: [0.28, 0.26, 0.24],
    mineralDark: [0.010, 0.009, 0.009],
    mineralLight: [0.50, 0.47, 0.43],
    baseTileMetres: 1.04,
    heightMicroSpanMetres: 0.022,
    normalStrength: 1.12,
    roughness: [0.60, 0.89],
    grainScale: 0.064,
    fractures: { mode: 'spine-shear-fractures', primaryCount: 6, branchCount: 4, width: [0.0008, 0.0040], depth: 0.046 },
    strata: null,
  }),
  'volcanic-breccia': PROFILE({
    label: 'Volcanic breccia',
    lithology: 'angular volcanic fragments in a finer volcaniclastic matrix',
    fabric: 'volcanic-breccia-clastic',
    baseDark: [0.075, 0.055, 0.045],
    baseLight: [0.43, 0.33, 0.26],
    mineralDark: [0.022, 0.018, 0.016],
    mineralLight: [0.64, 0.54, 0.44],
    baseTileMetres: 0.90,
    heightMicroSpanMetres: 0.026,
    normalStrength: 1.16,
    roughness: [0.65, 0.94],
    grainScale: 0.083,
    fractures: { mode: 'matrix-cross-joints', primaryCount: 4, branchCount: 4, width: [0.0010, 0.0042], depth: 0.038 },
    strata: null,
  }),
  'volcaniclastic-tuff': PROFILE({
    label: 'Weakly bedded volcaniclastic tuff',
    lithology: 'weathered ash-rich volcaniclastic tuff',
    fabric: 'volcaniclastic-tuff-bedded',
    baseDark: [0.14, 0.105, 0.072],
    baseLight: [0.66, 0.54, 0.39],
    mineralDark: [0.055, 0.039, 0.028],
    mineralLight: [0.82, 0.73, 0.58],
    baseTileMetres: 1.06,
    heightMicroSpanMetres: 0.023,
    normalStrength: 1.00,
    roughness: [0.69, 0.95],
    grainScale: 0.060,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 4, branchCount: 3, width: [0.0009, 0.0040], depth: 0.034 },
    strata: { frequency: 5.4, spacingJitter: 0.18, warp: 0.20, curvature: 0.06, colorStrength: 0.19, reliefStrength: 0.25, dark: [0.085, 0.056, 0.037], light: [0.77, 0.65, 0.48] },
  }),
  'fault-scarp-regolith': PROFILE({
    label: 'Admission-limited fault-scarp regolith',
    lithology: 'neutral weathered bedrock and regolith; exact substrate not admitted',
    fabric: 'neutral-fault-regolith',
    admissionLimits: ['Do not infer a named host lithology.', 'Do not paint a continuous fault plane as a homogeneous material band.'],
    baseDark: [0.11, 0.095, 0.076],
    baseLight: [0.50, 0.45, 0.36],
    mineralDark: [0.042, 0.036, 0.030],
    mineralLight: [0.65, 0.61, 0.52],
    baseTileMetres: 1.15,
    heightMicroSpanMetres: 0.019,
    normalStrength: 0.96,
    roughness: [0.68, 0.95],
    grainScale: 0.072,
    fractures: { mode: 'fault-damage-fractures', primaryCount: 5, branchCount: 5, width: [0.0009, 0.0045], depth: 0.041 },
    strata: null,
  }),
  'neutral-coastal-bedrock': PROFILE({
    label: 'Admission-limited coastal bedrock',
    lithology: 'neutral coastal bedrock; exact lithology not admitted',
    fabric: 'neutral-coastal-weathered',
    admissionLimits: ['Retain only salt/wave weathering supported by the source.', 'Do not infer sandstone bedding.'],
    baseDark: [0.10, 0.105, 0.102],
    baseLight: [0.48, 0.49, 0.45],
    mineralDark: [0.038, 0.041, 0.040],
    mineralLight: [0.64, 0.65, 0.59],
    baseTileMetres: 1.42,
    heightMicroSpanMetres: 0.024,
    normalStrength: 1.07,
    roughness: [0.63, 0.93],
    grainScale: 0.070,
    fractures: { mode: 'coastal-relict-joints', primaryCount: 4, branchCount: 4, width: [0.0010, 0.0048], depth: 0.044 },
    strata: null,
  }),
  'neutral-massive-bedrock': PROFILE({
    label: 'Admission-limited massive bedrock',
    lithology: 'neutral massive bedrock; exact lithology not admitted',
    fabric: 'neutral-massive-jointed',
    admissionLimits: ['Do not infer sedimentary bedding, foliation, or volcanic flow bands.'],
    baseDark: [0.12, 0.12, 0.115],
    baseLight: [0.53, 0.52, 0.48],
    mineralDark: [0.045, 0.045, 0.043],
    mineralLight: [0.69, 0.68, 0.62],
    baseTileMetres: 1.50,
    heightMicroSpanMetres: 0.021,
    normalStrength: 1.00,
    roughness: [0.62, 0.90],
    grainScale: 0.077,
    fractures: { mode: 'weathered-relict-joints', primaryCount: 4, branchCount: 3, width: [0.0010, 0.0042], depth: 0.038 },
    strata: null,
  }),
  'neutral-sedimentary-bedded': PROFILE({
    label: 'Admission-limited bedded sedimentary rock',
    lithology: 'neutral bedded sedimentary rock; exact lithology not admitted',
    fabric: 'neutral-sedimentary-bedded',
    admissionLimits: ['Preserve only coherent bedding supported by the source.', 'Do not infer sandstone, limestone, or mudstone mineralogy.'],
    baseDark: [0.13, 0.115, 0.095],
    baseLight: [0.57, 0.53, 0.44],
    mineralDark: [0.050, 0.043, 0.035],
    mineralLight: [0.72, 0.68, 0.58],
    baseTileMetres: 1.38,
    heightMicroSpanMetres: 0.019,
    normalStrength: 0.93,
    roughness: [0.66, 0.93],
    grainScale: 0.065,
    fractures: { mode: 'bedding-cross-joints', primaryCount: 4, branchCount: 3, width: [0.0009, 0.0040], depth: 0.035 },
    strata: { frequency: 5.8, spacingJitter: 0.15, warp: 0.19, curvature: 0.055, colorStrength: 0.14, reliefStrength: 0.22, dark: [0.085, 0.071, 0.056], light: [0.68, 0.63, 0.53] },
  }),
  'neutral-structural-clast': PROFILE({
    label: 'Admission-limited structural clast',
    lithology: 'neutral joint- or fabric-bounded clast; exact lithology not admitted',
    fabric: 'neutral-structural-clast',
    admissionLimits: ['Retain planar structure without naming its mineralogy or parent fabric.'],
    baseDark: [0.12, 0.12, 0.115],
    baseLight: [0.55, 0.54, 0.50],
    mineralDark: [0.045, 0.045, 0.043],
    mineralLight: [0.70, 0.69, 0.64],
    baseTileMetres: 0.92,
    heightMicroSpanMetres: 0.016,
    normalStrength: 0.90,
    roughness: [0.61, 0.89],
    grainScale: 0.065,
    fractures: { mode: 'orthogonal-joints', primaryCount: 4, branchCount: 3, width: [0.0008, 0.0035], depth: 0.034 },
    strata: null,
  }),
  'diabase-intrusion-host-contact': PROFILE({
    label: 'Diabase intrusion and host contact',
    lithology: 'dark diabase intrusion in a compositionally distinct host',
    fabric: 'semantic-composite-intrusion-contact',
    requiresSemanticRegions: true,
    semanticRegionRoles: ['diabase-intrusion', 'host-bedrock', 'contact-zone'],
    baseDark: [0.025, 0.030, 0.031], baseLight: [0.25, 0.27, 0.25],
    mineralDark: [0.008, 0.010, 0.010], mineralLight: [0.45, 0.48, 0.43],
    baseTileMetres: 1.10, heightMicroSpanMetres: 0.020, normalStrength: 1.05,
    roughness: [0.58, 0.90], grainScale: 0.068,
    fractures: { mode: 'contact-cross-fractures', primaryCount: 4, branchCount: 3, width: [0.0008, 0.0038], depth: 0.040 },
    strata: null,
  }),
  'quartz-vein-phyllite-contact': PROFILE({
    label: 'Quartz vein in phyllite contact',
    lithology: 'quartz fracture fill in a phyllitic host',
    fabric: 'semantic-composite-vein-contact',
    requiresSemanticRegions: true,
    semanticRegionRoles: ['quartz-vein', 'phyllite-host', 'contact-zone'],
    baseDark: [0.045, 0.052, 0.052], baseLight: [0.36, 0.39, 0.37],
    mineralDark: [0.014, 0.018, 0.018], mineralLight: [0.82, 0.82, 0.77],
    baseTileMetres: 0.76, heightMicroSpanMetres: 0.012, normalStrength: 0.82,
    roughness: [0.42, 0.81], grainScale: 0.046,
    fractures: { mode: 'vein-contact-fractures', primaryCount: 4, branchCount: 4, width: [0.0005, 0.0028], depth: 0.030 },
    strata: null,
  }),
  'mixed-clast-abraded': PROFILE({
    label: 'Mixed abraded clast assembly',
    lithology: 'multiple transported clast lithologies',
    fabric: 'semantic-composite-mixed-abraded-clasts',
    requiresSemanticRegions: true,
    semanticRegionRoles: ['clast-material-groups', 'matrix-or-ground'],
    baseDark: [0.12, 0.11, 0.095], baseLight: [0.58, 0.53, 0.44],
    mineralDark: [0.040, 0.038, 0.034], mineralLight: [0.76, 0.71, 0.62],
    baseTileMetres: 0.72, heightMicroSpanMetres: 0.013, normalStrength: 0.78,
    roughness: [0.49, 0.84], grainScale: 0.062,
    fractures: { mode: 'transport-impact', primaryCount: 3, branchCount: 2, width: [0.0007, 0.0028], depth: 0.021 },
    strata: null,
  }),
  'mixed-clast-angular': PROFILE({
    label: 'Mixed angular clast assembly',
    lithology: 'multiple angular source-rock lithologies',
    fabric: 'semantic-composite-mixed-angular-clasts',
    requiresSemanticRegions: true,
    semanticRegionRoles: ['clast-material-groups', 'matrix-or-ground'],
    baseDark: [0.10, 0.095, 0.085], baseLight: [0.52, 0.49, 0.43],
    mineralDark: [0.034, 0.032, 0.029], mineralLight: [0.70, 0.67, 0.59],
    baseTileMetres: 0.86, heightMicroSpanMetres: 0.021, normalStrength: 1.06,
    roughness: [0.62, 0.93], grainScale: 0.070,
    fractures: { mode: 'orthogonal-joints', primaryCount: 5, branchCount: 4, width: [0.0009, 0.0040], depth: 0.040 },
    strata: null,
  }),
  'mixed-clast-glacial': PROFILE({
    label: 'Mixed glacial clast assembly',
    lithology: 'multiple glacially transported clast lithologies',
    fabric: 'semantic-composite-mixed-glacial-clasts',
    requiresSemanticRegions: true,
    semanticRegionRoles: ['clast-material-groups', 'matrix-or-ground', 'abraded-or-plucked-faces'],
    baseDark: [0.105, 0.105, 0.098], baseLight: [0.54, 0.53, 0.48],
    mineralDark: [0.038, 0.039, 0.037], mineralLight: [0.72, 0.71, 0.65],
    baseTileMetres: 0.94, heightMicroSpanMetres: 0.017, normalStrength: 0.91,
    roughness: [0.55, 0.88], grainScale: 0.067,
    fractures: { mode: 'glacial-relict-fractures', primaryCount: 4, branchCount: 3, width: [0.0008, 0.0034], depth: 0.030 },
    strata: null,
  }),
});

const SEMANTIC_ROLE = ({
  allowedProfileIds,
  effect = null,
  minimumCoverageFraction = 0.005,
  minimumInstances = 1,
}) => Object.freeze({
  allowedProfileIds: Object.freeze([...allowedProfileIds]),
  effect: effect ? Object.freeze({ ...effect }) : null,
  minimumCoverageFraction,
  minimumInstances,
});

const COMPOSITE_RECIPE = ({ roles, distinctMaterialRole = null, minimumDistinctMaterials = 1 }) => Object.freeze({
  coordinateSpace: 'geometry-uv0',
  distinctMaterialRole,
  minimumDistinctMaterials,
  roles: Object.freeze(Object.fromEntries(Object.entries(roles).map(([role, contract]) => [
    role,
    SEMANTIC_ROLE(contract),
  ]))),
});

/**
 * Composite profiles may only be synthesized from author-authored UV0 region
 * masks bound to the exact edited geometry. These recipes define which
 * independently generated single-lithology surfaces each admitted role may
 * use. They do not infer contacts or clast membership from color or shape.
 */
export const C8_COMPOSITE_SURFACE_RECIPES = Object.freeze({
  'diabase-intrusion-host-contact': COMPOSITE_RECIPE({
    roles: {
      'diabase-intrusion': {
        allowedProfileIds: ['basalt-mafic-cooling'],
        minimumCoverageFraction: 0.04,
      },
      'host-bedrock': {
        allowedProfileIds: [
          'neutral-massive-bedrock', 'neutral-sedimentary-bedded',
          'red-sandstone-bedded', 'grey-siltstone-jointed',
        ],
        minimumCoverageFraction: 0.04,
      },
      'contact-zone': {
        allowedProfileIds: ['neutral-structural-clast', 'fault-scarp-regolith'],
        effect: { aoMultiplier: 0.88, heightMultiplier: 0.72, roughnessOffset: 0.055 },
        minimumCoverageFraction: 0.005,
      },
    },
  }),
  'quartz-vein-phyllite-contact': COMPOSITE_RECIPE({
    roles: {
      'quartz-vein': {
        allowedProfileIds: ['quartzite-jointed'],
        effect: { heightMultiplier: 0.82, roughnessOffset: -0.08 },
        minimumCoverageFraction: 0.01,
      },
      'phyllite-host': {
        allowedProfileIds: ['schist-phyllite-cleavage'],
        minimumCoverageFraction: 0.04,
      },
      'contact-zone': {
        allowedProfileIds: ['neutral-structural-clast'],
        effect: { aoMultiplier: 0.90, heightMultiplier: 0.70, roughnessOffset: 0.04 },
        minimumCoverageFraction: 0.005,
      },
    },
  }),
  'mixed-clast-abraded': COMPOSITE_RECIPE({
    distinctMaterialRole: 'clast-material-groups',
    minimumDistinctMaterials: 2,
    roles: {
      'clast-material-groups': {
        allowedProfileIds: [
          'weathered-monzogranite', 'basalt-mafic-cooling', 'quartzite-jointed',
          'river-abraded-sandstone', 'kaibab-limestone-ledge',
        ],
        effect: { heightMultiplier: 0.70, roughnessOffset: -0.035 },
        minimumCoverageFraction: 0.04,
        minimumInstances: 2,
      },
      'matrix-or-ground': {
        allowedProfileIds: ['neutral-structural-clast', 'grey-siltstone-jointed'],
        effect: { aoMultiplier: 0.90, heightMultiplier: 0.64, roughnessOffset: 0.07 },
        minimumCoverageFraction: 0.01,
      },
    },
  }),
  'mixed-clast-angular': COMPOSITE_RECIPE({
    distinctMaterialRole: 'clast-material-groups',
    minimumDistinctMaterials: 2,
    roles: {
      'clast-material-groups': {
        allowedProfileIds: [
          'coarse-granite-jointed', 'basalt-mafic-cooling', 'quartzite-jointed',
          'red-sandstone-bedded', 'kaibab-limestone-ledge',
        ],
        minimumCoverageFraction: 0.04,
        minimumInstances: 2,
      },
      'matrix-or-ground': {
        allowedProfileIds: ['neutral-structural-clast', 'fault-scarp-regolith'],
        effect: { aoMultiplier: 0.88, heightMultiplier: 0.68, roughnessOffset: 0.075 },
        minimumCoverageFraction: 0.01,
      },
    },
  }),
  'mixed-clast-glacial': COMPOSITE_RECIPE({
    distinctMaterialRole: 'clast-material-groups',
    minimumDistinctMaterials: 2,
    roles: {
      'clast-material-groups': {
        allowedProfileIds: [
          'weathered-monzogranite', 'basalt-mafic-cooling', 'quartzite-jointed',
          'red-sandstone-bedded', 'kaibab-limestone-ledge',
        ],
        effect: { heightMultiplier: 0.82, roughnessOffset: -0.015 },
        minimumCoverageFraction: 0.04,
        minimumInstances: 2,
      },
      'matrix-or-ground': {
        allowedProfileIds: ['fault-scarp-regolith', 'neutral-structural-clast'],
        effect: { aoMultiplier: 0.86, heightMultiplier: 0.60, roughnessOffset: 0.085 },
        minimumCoverageFraction: 0.01,
      },
      'abraded-or-plucked-faces': {
        allowedProfileIds: [
          'weathered-monzogranite', 'basalt-mafic-cooling', 'quartzite-jointed',
          'red-sandstone-bedded', 'kaibab-limestone-ledge',
        ],
        effect: { heightMultiplier: 0.48, roughnessOffset: -0.065 },
        minimumCoverageFraction: 0.005,
      },
    },
  }),
});

const BINDING = (familyId, profileId, surfaceRationale) => Object.freeze({
  familyId,
  profileId,
  surfaceRationale,
});

export const C8_FIRST12_ASSET_SURFACE_BINDINGS = Object.freeze({
  'hoodoo-caprock': BINDING('fins-spires-and-hoodoos', 'claron-carbonate-bedded', 'Warm iron-stained carbonate beds, differential resistance, cross-joints, and granular weathering support a caprock hoodoo without deriving its silhouette.'),
  'tor-block-pile': BINDING('residuals-and-outcrops', 'coarse-granite-jointed', 'Coarse crystalline variation and intersecting joint traces support a granite tor; the editable high source owns every block boundary.'),
  'boulder-rounded': BINDING('detached-clasts', 'weathered-monzogranite', 'Granular weathering, sparse relict joints, and broad mineral patches complement rounded granite morphology without inflating it.'),
  'block-jointed': BINDING('detached-clasts', 'coarse-granite-jointed', 'Coarse mineral fabric and unequal joint traces reinforce, but never generate, the joint-bounded planar mass.'),
  'boulder-river-worn': BINDING('detached-clasts', 'river-abraded-sandstone', 'Subdued sandstone bedding, elongated abrasion scars, and lower-amplitude relief preserve the transported river-worn read.'),
  'slab-bedded': BINDING('detached-clasts', 'red-sandstone-bedded', 'Non-periodic iron-rich beds and sparse cross-fractures align with a thin sandstone slab while the mesh owns its broken perimeter.'),
  'outcrop-jointed': BINDING('residuals-and-outcrops', 'coarse-granite-jointed', 'Coarse granite and coherent multi-directional joints support an attached jointed outcrop without turning it into detached cubes.'),
  'outcrop-bedded': BINDING('residuals-and-outcrops', 'red-sandstone-bedded', 'Warped, terminating sandstone beds and cross-joints support one attached strike-and-dip mass rather than uniform rings.'),
  'ledge-resistant': BINDING('rock-surfaces-and-steps', 'kaibab-limestone-ledge', 'Pale resistant carbonate bedding, pitting, and terminating seams support the hard ledge above recessed rock.'),
  'pillar-residual': BINDING('fins-spires-and-hoodoos', 'quartz-sandstone-pillar', 'Iron-stained quartz-sandstone bedding and vertical joints support a continuous residual pillar; texture does not manufacture shelves.'),
  'sea-stack': BINDING('coastal-residuals', 'coastal-sandstone-stack', 'Salt-weathered sandstone beds, cavities, and cross-joints support a detached coastal remnant while the high source owns its wave-cut base.'),
  'volcanic-neck': BINDING('volcanic-and-cooling-forms', 'phonolite-porphyry-cooling', 'Dark porphyritic variation and non-uniform cooling joints support a resistant volcanic plug without implying cone symmetry.'),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function lerp(left, right, amount) {
  return left + ((right - left) * amount);
}

function smoothstep(minimum, maximum, value) {
  const amount = clamp01((value - minimum) / Math.max(1e-9, maximum - minimum));
  return amount * amount * (3 - (2 * amount));
}

function linearToSrgb(value) {
  const channel = clamp01(value);
  return channel < 0.0031308
    ? channel * 12.92
    : (1.055 * (channel ** (1 / 2.4))) - 0.055;
}

function srgbToLinear(value) {
  const channel = clamp01(value);
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function fnv(value, hash) {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

export function c8First12SurfaceSeed(value) {
  let hash = 2166136261 >>> 0;
  for (const character of String(value ?? '')) hash = fnv(character.charCodeAt(0), hash);
  return hash >>> 0;
}

function resolveC8First12Seed(seed, assetId) {
  if (seed === null) return c8First12SurfaceSeed(`${assetId}:c8-first12-surface-v1`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new RangeError('Nature Reference Rock surface seed must be an integer from 0 through 4294967295.');
  }
  return seed >>> 0;
}

function assetBinding(assetId, bindingOverride = null, profileIdOverride = null) {
  const binding = bindingOverride ?? (profileIdOverride
    ? { familyId: 'unresolved-family', profileId: profileIdOverride, surfaceRationale: 'Explicit production lithology binding; morphology remains owned by the edited high source.' }
    : C8_FIRST12_ASSET_SURFACE_BINDINGS[assetId]);
  if (!binding) throw new RangeError(`Unknown Nature Reference Rock first-12 asset “${String(assetId)}”.`);
  if (!C8_FIRST12_LITHOLOGY_PROFILES[binding.profileId]) {
    throw new RangeError(`Unknown Nature Reference Rock lithology profile “${String(binding.profileId)}”.`);
  }
  return binding;
}

function assertHomogeneousSurfaceAllowed(binding, profile, operation, semanticRegions = null) {
  if (binding.requiresSemanticRegions === true || profile.requiresSemanticRegions === true) {
    if (semanticRegions) return;
    const roles = profile.semanticRegionRoles?.join(', ') ?? 'explicit material regions';
    throw new RangeError(
      `Nature Reference Rock ${operation} for composite profile “${binding.profileId}” requires semantic regions (${roles}); homogeneous synthesis is forbidden.`,
    );
  }
}

function sha256Bytes(bytes) {
  return sha256Hex(bytes);
}

// Compact JSON masks retain authored pixels without serializing typed-array keys.
function packSemanticMask(mask) {
  const runs = [];
  for (let start = 0; start < mask.length;) {
    let end = start + 1;
    while (end < mask.length && mask[end] === mask[start]) end += 1;
    runs.push(end - start, mask[start]);
    start = end;
  }
  return { encoding: 'rle-u8-v1', length: mask.length, runs };
}

function unpackSemanticMask(mask, pixelCount) {
  if (mask instanceof Uint8Array && mask.length === pixelCount) return mask;
  if (mask?.encoding !== 'rle-u8-v1' || mask.length !== pixelCount
    || !Array.isArray(mask.runs) || mask.runs.length % 2 || mask.runs.length > pixelCount * 2) {
    throw new RangeError('Semantic mask requires exact raw bytes or the supported packed encoding.');
  }
  const decoded = new Uint8Array(pixelCount);
  let offset = 0;
  for (let index = 0; index < mask.runs.length; index += 2) {
    const count = mask.runs[index], value = mask.runs[index + 1];
    if (!Number.isSafeInteger(count) || count <= 0 || offset + count > pixelCount
      || !Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError('Invalid semantic mask run.');
    }
    decoded.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== pixelCount) throw new RangeError('Semantic mask runs do not cover the declared dimensions.');
  return decoded;
}

function portableSemanticRegions(regionSet) {
  return {
    ...semanticRegionAudit(regionSet),
    regions: regionSet.regions.map(({ mask, effect, ...region }) => ({ ...region, mask: packSemanticMask(mask) })),
  };
}

function normalizeCompositeSemanticRegions({
  binding,
  geometrySha256,
  profile,
  semanticRegions,
  size,
}) {
  const recipe = C8_COMPOSITE_SURFACE_RECIPES[binding.profileId];
  if (!recipe) throw new RangeError(`Missing composite surface recipe for “${binding.profileId}”.`);
  assertHomogeneousSurfaceAllowed(binding, profile, 'semantic-region synthesis', semanticRegions);
  if (semanticRegions.schema !== C8_SEMANTIC_SURFACE_REGIONS_SCHEMA
    || semanticRegions.version !== C8_SEMANTIC_SURFACE_REGIONS_VERSION) {
    throw new RangeError(
      `Nature Reference Rock composite surface requires ${C8_SEMANTIC_SURFACE_REGIONS_SCHEMA} v${C8_SEMANTIC_SURFACE_REGIONS_VERSION}.`,
    );
  }
  if (semanticRegions.coordinateSpace !== recipe.coordinateSpace) {
    throw new RangeError(`Nature Reference Rock composite semantic masks must use ${recipe.coordinateSpace}.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(String(geometrySha256 ?? ''))
    || semanticRegions.geometrySha256 !== geometrySha256) {
    throw new RangeError('Nature Reference Rock composite semantic masks must be SHA-256-bound to the exact edited geometry.');
  }
  if (semanticRegions.width !== size || semanticRegions.height !== size) {
    throw new RangeError(`Nature Reference Rock composite semantic masks must exactly match the ${size}x${size} output map.`);
  }
  if (!Array.isArray(semanticRegions.regions) || semanticRegions.regions.length < 2) {
    throw new RangeError('Nature Reference Rock composite semantic surface requires an explicit authored region array.');
  }
  const pixelCount = size * size;
  const ids = new Set();
  const coverageByRole = new Map();
  const regionsByRole = new Map();
  const coverageSum = new Float32Array(pixelCount);
  const normalizedRegions = semanticRegions.regions.map((region, index) => {
    const id = String(region?.id ?? '');
    const role = String(region?.role ?? '');
    const roleContract = recipe.roles[role];
    if (!id || ids.has(id)) throw new RangeError(`Nature Reference Rock composite semantic region ${index} requires a unique non-empty id.`);
    ids.add(id);
    if (!roleContract) throw new RangeError(`Nature Reference Rock composite semantic region “${id}” has forbidden role “${role}”.`);
    if (region.sourceKind !== 'authored-geometry-semantic-mask'
      || typeof region.geometryRegionId !== 'string'
      || region.geometryRegionId.length === 0) {
      throw new RangeError(`Nature Reference Rock composite semantic region “${id}” must identify its authored geometry region source.`);
    }
    const materialProfileId = String(region.materialProfileId ?? '');
    if (!roleContract.allowedProfileIds.includes(materialProfileId)
      || C8_FIRST12_LITHOLOGY_PROFILES[materialProfileId]?.requiresSemanticRegions === true) {
      throw new RangeError(
        `Nature Reference Rock composite semantic region “${id}” cannot use material profile “${materialProfileId}” for role “${role}”.`,
      );
    }
    const mask = unpackSemanticMask(region.mask, pixelCount);
    if (region.maskSha256 && region.maskSha256 !== sha256Bytes(mask)) {
      throw new RangeError(`Semantic mask hash mismatch for “${id}”.`);
    }
    let coverageWeight = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const weight = mask[pixel] / 255;
      coverageWeight += weight;
      coverageSum[pixel] += weight;
    }
    const coverageFraction = coverageWeight / pixelCount;
    if (coverageFraction < 0.005) {
      throw new RangeError(`Nature Reference Rock composite semantic region “${id}” has only dummy coverage (${coverageFraction}).`);
    }
    coverageByRole.set(role, (coverageByRole.get(role) ?? 0) + coverageFraction);
    const roleRegions = regionsByRole.get(role) ?? [];
    roleRegions.push({ materialProfileId });
    regionsByRole.set(role, roleRegions);
    return Object.freeze({
      coverageFraction,
      effect: roleContract.effect,
      geometryRegionId: region.geometryRegionId,
      id,
      mask,
      maskSha256: sha256Bytes(mask),
      materialProfileId,
      role,
      sourceKind: region.sourceKind,
    });
  });
  for (const [role, roleContract] of Object.entries(recipe.roles)) {
    const roleRegions = regionsByRole.get(role) ?? [];
    if (roleRegions.length < roleContract.minimumInstances) {
      throw new RangeError(`Nature Reference Rock composite semantic role “${role}” requires at least ${roleContract.minimumInstances} authored regions.`);
    }
    if ((coverageByRole.get(role) ?? 0) < roleContract.minimumCoverageFraction) {
      throw new RangeError(`Nature Reference Rock composite semantic role “${role}” has insufficient authored coverage.`);
    }
  }
  if (recipe.distinctMaterialRole) {
    const distinct = new Set((regionsByRole.get(recipe.distinctMaterialRole) ?? [])
      .map(({ materialProfileId }) => materialProfileId));
    if (distinct.size < recipe.minimumDistinctMaterials) {
      throw new RangeError(
        `Nature Reference Rock composite semantic role “${recipe.distinctMaterialRole}” requires at least ${recipe.minimumDistinctMaterials} distinct admitted materials.`,
      );
    }
  }
  let uncoveredPixels = 0;
  for (const coverage of coverageSum) if (coverage <= (1 / 255)) uncoveredPixels += 1;
  if (uncoveredPixels > 0) {
    throw new RangeError(`Nature Reference Rock composite semantic masks leave ${uncoveredPixels} output pixels without an authored material region.`);
  }
  const contractHashParts = [
    `${semanticRegions.schema}:${semanticRegions.version}:${geometrySha256}:${size}`,
  ];
  for (const region of normalizedRegions) {
    contractHashParts.push(
      `${region.id}:${region.role}:${region.materialProfileId}:${region.geometryRegionId}:${region.maskSha256}`,
    );
  }
  return Object.freeze({
    contractSha256: sha256Hex(contractHashParts.join('')),
    coordinateSpace: recipe.coordinateSpace,
    geometrySha256,
    height: size,
    profileId: binding.profileId,
    regions: Object.freeze(normalizedRegions),
    roles: Object.freeze(Object.fromEntries([...coverageByRole].map(([role, coverageFraction]) => [
      role,
      Object.freeze({
        coverageFraction,
        regionCount: regionsByRole.get(role).length,
      }),
    ]))),
    schema: C8_SEMANTIC_SURFACE_REGIONS_SCHEMA,
    version: C8_SEMANTIC_SURFACE_REGIONS_VERSION,
    width: size,
  });
}

function semanticRegionAudit(regionSet) {
  return Object.freeze({
    contractSha256: regionSet.contractSha256,
    coordinateSpace: regionSet.coordinateSpace,
    geometrySha256: regionSet.geometrySha256,
    height: regionSet.height,
    profileId: regionSet.profileId,
    regions: Object.freeze(regionSet.regions.map((region) => Object.freeze({
      coverageFraction: region.coverageFraction,
      geometryRegionId: region.geometryRegionId,
      id: region.id,
      maskSha256: region.maskSha256,
      materialProfileId: region.materialProfileId,
      role: region.role,
      sourceKind: region.sourceKind,
    }))),
    roles: regionSet.roles,
    schema: regionSet.schema,
    version: regionSet.version,
    width: regionSet.width,
  });
}

function dimensionsFromBounds(editedBoundsMetres) {
  if (Array.isArray(editedBoundsMetres)) {
    return { dimensions: editedBoundsMetres.slice(0, 3).map(Number), maximum: null, minimum: null };
  }
  const minimum = editedBoundsMetres?.minimum ?? editedBoundsMetres?.min ?? null;
  const maximum = editedBoundsMetres?.maximum ?? editedBoundsMetres?.max ?? null;
  if (Array.isArray(minimum) && Array.isArray(maximum)) {
    const resolvedMinimum = minimum.slice(0, 3).map(Number);
    const resolvedMaximum = maximum.slice(0, 3).map(Number);
    return {
      dimensions: resolvedMaximum.map((value, index) => value - resolvedMinimum[index]),
      maximum: resolvedMaximum,
      minimum: resolvedMinimum,
    };
  }
  const dimensions = editedBoundsMetres?.dimensionsMetres
    ?? editedBoundsMetres?.dimensions
    ?? [editedBoundsMetres?.width, editedBoundsMetres?.height, editedBoundsMetres?.depth];
  return { dimensions: Array.from(dimensions ?? []).slice(0, 3).map(Number), maximum: null, minimum: null };
}

export function normalizeC8First12EditedBounds(editedBoundsMetres) {
  const resolved = dimensionsFromBounds(editedBoundsMetres);
  if (resolved.dimensions.length !== 3
    || resolved.dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Nature Reference Rock surface projection requires positive edited X/Y/Z bounds in metres.');
  }
  if (resolved.minimum && resolved.maximum
    && resolved.maximum.some((value, index) => !Number.isFinite(value)
      || !Number.isFinite(resolved.minimum[index])
      || value <= resolved.minimum[index])) {
    throw new RangeError('Nature Reference Rock edited bounds require finite maximum values greater than minimum values.');
  }
  return Object.freeze({
    axisOrder: 'x-y-z',
    dimensionsMetres: Object.freeze(resolved.dimensions),
    maximumMetres: resolved.maximum ? Object.freeze(resolved.maximum) : null,
    minimumMetres: resolved.minimum ? Object.freeze(resolved.minimum) : null,
    upAxis: 'y',
  });
}

export function resolveC8First12Projection({ assetId, binding: bindingOverride = null, editedBoundsMetres, profileId = null } = {}) {
  const binding = assetBinding(assetId, bindingOverride, profileId);
  const profile = C8_FIRST12_LITHOLOGY_PROFILES[binding.profileId];
  if (profile.requiresSemanticRegions === true) {
    throw new RangeError(
      `Nature Reference Rock projection for composite profile “${binding.profileId}” requires semantic regions; resolve it through the geometry-bound surface specification.`,
    );
  }
  const bounds = normalizeC8First12EditedBounds(editedBoundsMetres);
  const dimensions = bounds.dimensionsMetres;
  const sorted = [...dimensions].sort((left, right) => left - right);
  const geometricMean = (dimensions[0] * dimensions[1] * dimensions[2]) ** (1 / 3);
  const characteristicMetres = Math.sqrt(Math.max(geometricMean * sorted[1], 1e-9));
  const formationScale = clamp(Math.sqrt(characteristicMetres / 1.5), 0.82, 3.6);
  const scaleMetres = profile.baseTileMetres * formationScale;
  const fingerprint = c8First12SurfaceSeed(JSON.stringify(bounds)).toString(16).padStart(8, '0');
  const mode = profile.strata ? 'directional-bedding' : 'triplanar';
  const upAxis = bounds.upAxis;
  const mapRoleProjection = Object.freeze(Object.fromEntries(
    C8_FIRST12_MAP_ROLES.map((role) => [role, Object.freeze({
      mode,
      upAxis,
    })]),
  ));
  return Object.freeze({
    axisScaleMetres: Object.freeze([scaleMetres, scaleMetres, scaleMetres]),
    bounds,
    boundsRole: 'derive metre texture scale and edit invalidation only; bounds do not set the world-space sampling origin',
    boundsFingerprint: fingerprint,
    characteristicMetres,
    coordinateFrame: 'absolute-world-position-y-up',
    mapRoleProjection,
    mode,
    recalculatedFromEditedBounds: true,
    scaleMetres,
    structuralFabricProjection: Object.freeze({
      coherentBedPlaneRequired: profile.strata !== null,
      directGenericSymmetricTriplanarAllowed: profile.strata === null,
      directionalFabricHandoff: profile.strata
        ? 'Runtime directional-bedding sampler preserves one world-up bed coordinate across both lateral projections and suppresses the top-axis projection.'
        : 'Generic world-space triplanar is permitted after normal/tangent integrity review.',
      genericSymmetricTriplanarCannotApproveBeddedAssets: profile.strata !== null,
      runtimeAxisConditionedSamplerImplemented: profile.strata !== null,
    }),
    textureCoordinateScalePerMetre: Object.freeze([1 / scaleMetres, 1 / scaleMetres, 1 / scaleMetres]),
    tileSpan: Object.freeze(dimensions.map((value) => value / scaleMetres)),
    translationChangesWorldAnchoredPhase: true,
    upAxis,
    directionalBeddingAxisUv: mode === 'directional-bedding' ? Object.freeze({
      distributedTopNormalWeight: 'abs(normal.y) split equally across xProjection and zProjection before normalization',
      suppressedProjection: 'yProjection/XZ',
      xProjection: 'u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres',
      zProjection: 'u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres',
    }) : null,
    triplanarAxisUv: Object.freeze({
      xProjection: 'u=worldPosition.z/scaleMetres,v=worldPosition.y/scaleMetres',
      yProjection: 'u=worldPosition.x/scaleMetres,v=worldPosition.z/scaleMetres',
      zProjection: 'u=worldPosition.x/scaleMetres,v=worldPosition.y/scaleMetres',
    }),
  });
}

function latticeHash(x, y, period, seed) {
  const wrappedX = ((x % period) + period) % period;
  const wrappedY = ((y % period) + period) % period;
  const value = Math.sin((wrappedX * 127.1) + (wrappedY * 311.7) + (seed * 0.0137)) * 43758.5453123;
  return value - Math.floor(value);
}

function tileNoise(u, v, frequency, seed) {
  const x = u * frequency;
  const y = v * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx0 = x - x0;
  const fy0 = y - y0;
  const fx = fx0 * fx0 * (3 - (2 * fx0));
  const fy = fy0 * fy0 * (3 - (2 * fy0));
  const a = latticeHash(x0, y0, frequency, seed);
  const b = latticeHash(x0 + 1, y0, frequency, seed);
  const c = latticeHash(x0, y0 + 1, frequency, seed);
  const d = latticeHash(x0 + 1, y0 + 1, frequency, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

function tileFbm(u, v, baseFrequency, seed, octaves = 3) {
  let amplitude = 0.56;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += tileNoise(u, v, baseFrequency * (2 ** octave), seed + (octave * 37)) * amplitude;
    weight += amplitude;
    amplitude *= 0.48;
  }
  return total / weight;
}

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fractureAngle(mode, index, random) {
  if (mode === 'orthogonal-joints') {
    return (index % 2 === 0 ? Math.PI * 0.5 : 0.12) + ((random() - 0.5) * 0.46);
  }
  if (mode === 'bedding-cross-joints') {
    return (index % 3 === 0 ? 0.28 : Math.PI * 0.5) + ((random() - 0.5) * 0.58);
  }
  if (mode === 'cooling-joints') return (Math.PI * 0.5) + ((random() - 0.5) * 0.38);
  if (mode === 'transport-impact') return 0.30 + ((random() - 0.5) * 0.82);
  if (mode === 'weathered-relict-joints') return (random() * Math.PI) + ((index % 2) * 0.24);
  if (mode === 'fissility-cross-joints') {
    return (index % 3 === 0 ? Math.PI * 0.5 : 0.04) + ((random() - 0.5) * 0.32);
  }
  if (mode === 'foliation-cross-joints' || mode === 'cleavage-cross-joints') {
    return (index % 3 === 0 ? Math.PI * 0.5 : 0.18) + ((random() - 0.5) * 0.48);
  }
  if (mode === 'flow-band-cross-fractures') {
    return (index % 2 === 0 ? Math.PI * 0.5 : 0.32) + ((random() - 0.5) * 0.62);
  }
  if (mode === 'spine-shear-fractures') {
    return (Math.PI * 0.5) + ((random() - 0.5) * 0.54);
  }
  return random() * Math.PI;
}

function createFractureNetwork(profile, seed) {
  const random = randomSequence(seed ^ 0xA5831F29);
  const segments = [];
  const widths = [];
  const primaryPaths = [];
  for (let index = 0; index < profile.fractures.primaryCount; index += 1) {
    const angle = fractureAngle(profile.fractures.mode, index, random);
    const centreX = 0.12 + (random() * 0.76);
    const centreY = 0.12 + (random() * 0.76);
    const length = 0.19 + (random() * 0.43);
    const width = lerp(profile.fractures.width[0], profile.fractures.width[1], random() ** 1.7);
    const tangentX = Math.cos(angle);
    const tangentY = Math.sin(angle);
    const perpendicularX = -tangentY;
    const perpendicularY = tangentX;
    const points = [];
    const pointCount = 6;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const amount = pointIndex / (pointCount - 1);
      const along = (amount - 0.5) * length;
      const taper = Math.sin(amount * Math.PI);
      const jitter = (random() - 0.5) * 0.082 * taper;
      points.push({
        x: centreX + (tangentX * along) + (perpendicularX * jitter),
        y: centreY + (tangentY * along) + (perpendicularY * jitter),
      });
    }
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const segmentWidth = width * lerp(1.12, 0.62, pointIndex / (points.length - 2));
      widths.push(segmentWidth);
      segments.push({
        ...points[pointIndex],
        ax: points[pointIndex].x,
        ay: points[pointIndex].y,
        bx: points[pointIndex + 1].x,
        by: points[pointIndex + 1].y,
        kind: 'primary',
        width: segmentWidth,
      });
    }
    primaryPaths.push({ angle, points, width });
  }
  for (let branchIndex = 0; branchIndex < profile.fractures.branchCount; branchIndex += 1) {
    const parent = primaryPaths[branchIndex % primaryPaths.length];
    const pointIndex = 1 + Math.floor(random() * (parent.points.length - 2));
    const origin = parent.points[pointIndex];
    const direction = parent.angle + (branchIndex % 2 === 0 ? 1 : -1) * lerp(0.58, 1.12, random());
    const branchLength = 0.075 + (random() * 0.19);
    const bend = (random() - 0.5) * 0.42;
    const middle = {
      x: origin.x + (Math.cos(direction) * branchLength * 0.52),
      y: origin.y + (Math.sin(direction) * branchLength * 0.52),
    };
    const end = {
      x: middle.x + (Math.cos(direction + bend) * branchLength * 0.48),
      y: middle.y + (Math.sin(direction + bend) * branchLength * 0.48),
    };
    const branchWidth = parent.width * lerp(0.32, 0.64, random());
    for (const [start, finish, taper] of [[origin, middle, 1], [middle, end, 0.62]]) {
      const segmentWidth = branchWidth * taper;
      widths.push(segmentWidth);
      segments.push({
        ax: start.x,
        ay: start.y,
        bx: finish.x,
        by: finish.y,
        kind: 'branch',
        width: segmentWidth,
      });
    }
  }
  return {
    audit: Object.freeze({
      branchCount: profile.fractures.branchCount,
      mode: profile.fractures.mode,
      primaryCount: profile.fractures.primaryCount,
      segmentCount: segments.length,
      widthMaximum: Math.max(...widths),
      widthMinimum: Math.min(...widths),
      widthRatio: Math.max(...widths) / Math.max(1e-9, Math.min(...widths)),
    }),
    segments,
  };
}

function pointToSegmentDistance(px, py, segment) {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const amount = clamp01((((px - segment.ax) * dx) + ((py - segment.ay) * dy))
    / Math.max(1e-9, (dx * dx) + (dy * dy)));
  return Math.hypot(px - (segment.ax + (dx * amount)), py - (segment.ay + (dy * amount)));
}

function toroidalPointToSegmentDistance(px, py, segment) {
  const centreX = (segment.ax + segment.bx) * 0.5;
  const centreY = (segment.ay + segment.by) * 0.5;
  const wrappedX = px + Math.round(centreX - px);
  const wrappedY = py + Math.round(centreY - py);
  return pointToSegmentDistance(wrappedX, wrappedY, segment);
}

function fractureField(u, v, network, seed) {
  // A small periodic domain warp keeps joints coherent while avoiding the
  // ruler-straight/polyline read that was rejected in the 480-rock review.
  const warpedU = u + ((tileFbm(u, v, 7, seed + 773, 2) - 0.5) * 0.036);
  const warpedV = v + ((tileFbm(u, v, 7, seed + 787, 2) - 0.5) * 0.036);
  const localWidth = lerp(0.58, 1.32, tileFbm(u, v, 13, seed + 797, 2));
  let fracture = 0;
  for (const segment of network.segments) {
    const distance = toroidalPointToSegmentDistance(warpedU, warpedV, segment);
    const width = segment.width * localWidth;
    const line = 1 - smoothstep(width, width * 3.1, distance);
    fracture = Math.max(fracture, line);
  }
  const breakup = lerp(0.03, 1, smoothstep(0.30, 0.70, tileFbm(u, v, 11, seed + 811, 2)));
  const intermittent = lerp(0.12, 1, smoothstep(0.24, 0.74, tileNoise(u, v, 23, seed + 829)));
  return fracture * breakup * intermittent;
}

function strataField(u, v, strata, seed) {
  if (!strata) return { dark: 0, light: 0, relief: 0, value: 0.5 };
  const cross = u;
  const along = v;
  const bandCount = Math.max(3, Math.round(strata.frequency));
  const warp = (tileFbm(u, v, 3, seed + 347, 3) - 0.5) * strata.warp;
  const spacingWarp = Math.sin((cross * 3 + (tileNoise(u, v, 5, seed + 359) * 0.28)) * Math.PI * 2)
    * strata.spacingJitter;
  const curvature = Math.sin((along * 2 + (tileNoise(u, v, 4, seed + 367) * 0.12)) * Math.PI * 2)
    * strata.curvature;
  // Whole-band cycles on the along axis keep the field tileable. Periodic
  // warp bends and changes spacing without forcing a diagonal grille.
  const coordinate = (along * bandCount) + warp + spacingWarp + curvature;
  const bandIndex = Math.floor(coordinate);
  const phase = coordinate - bandIndex;
  const wave = 0.5 + (0.5 * Math.sin(coordinate * Math.PI * 2));
  const termination = smoothstep(0.18, 0.78, tileFbm(u, v, 5, seed + 389, 2));
  const darkRandom = latticeHash(bandIndex, 0, bandCount, seed + 401);
  const lightRandom = latticeHash(bandIndex, 1, bandCount, seed + 409);
  const darkWidth = lerp(0.018, 0.095, latticeHash(bandIndex, 2, bandCount, seed + 419));
  const lightWidth = lerp(0.010, 0.050, latticeHash(bandIndex, 3, bandCount, seed + 431));
  const lightCentre = lerp(0.32, 0.68, latticeHash(bandIndex, 4, bandCount, seed + 439));
  const boundaryDistance = Math.min(phase, 1 - phase);
  const lightDistance = Math.abs(phase - lightCentre);
  const darkContinuity = smoothstep(0.22, 0.76, termination + ((darkRandom - 0.5) * 0.44));
  const lightContinuity = smoothstep(0.20, 0.78, (1 - termination) + ((lightRandom - 0.5) * 0.38));
  // Each bed has its own width/strength and a regional continuity mask, so
  // bands pinch, fade, and terminate instead of repeating as wallpaper.
  const dark = (1 - smoothstep(darkWidth, darkWidth * 2.1, boundaryDistance))
    * darkContinuity * lerp(0.22, 1, darkRandom ** 1.4);
  const light = (1 - smoothstep(lightWidth, lightWidth * 2.2, lightDistance))
    * lightContinuity * lerp(0.16, 1, lightRandom ** 1.3);
  return {
    dark,
    light,
    relief: (((wave - 0.5) * 0.016)
      + (light * 0.044) - (dark * 0.032)) * strata.reliefStrength,
    value: wave,
  };
}

function surfaceField(u, v, profile, seed, grainFrequency) {
  const macro = tileFbm(u, v, 3, seed + 17, 4);
  const meso = tileFbm(u, v, 9, seed + 43, 3);
  const micro = tileFbm(u, v, Math.max(13, Math.round(grainFrequency / 3)), seed + 71, 2);
  const fine = tileNoise(u, v, grainFrequency, seed + 101);
  let height = ((macro - 0.5) * 0.56) + ((meso - 0.5) * 0.30)
    + ((micro - 0.5) * 0.11) + ((fine - 0.5) * 0.03);
  if (profile.fabric.includes('carbonate')) {
    const pit = (1 - smoothstep(0.11, 0.31, micro))
      * smoothstep(0.34, 0.72, tileFbm(u, v, 7, seed + 131, 2));
    height -= pit * 0.095;
  }
  if (profile.fabric.includes('coastal')) {
    const tafoni = (1 - smoothstep(0.13, 0.37, meso))
      * smoothstep(0.42, 0.75, tileFbm(u, v, 5, seed + 149, 2));
    height -= tafoni * 0.115;
  }
  if (profile.fabric.includes('abraded')) {
    const scarCoordinate = (u * 3) + v + ((macro - 0.5) * 0.7);
    const impactScar = (1 - smoothstep(0.04, 0.20, Math.abs(Math.sin(scarCoordinate * Math.PI * 2))))
      * smoothstep(0.48, 0.78, meso);
    height -= impactScar * 0.025;
  }
  if (profile.fabric.includes('crystalline') || profile.fabric.includes('porphyritic')) {
    const crystal = smoothstep(0.91, 0.985, fine)
      * smoothstep(0.42, 0.75, tileFbm(u, v, 5, seed + 163, 2));
    height += crystal * 0.020;
  }
  return { fine, height, macro, meso, micro };
}

function mixColor(left, right, amount) {
  return left.map((channel, index) => lerp(channel, right[index], amount));
}

function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 1e-9) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function measureStrataVariation(strataDark, strataLight, size) {
  const rowMeans = new Float32Array(size);
  for (let y = 0; y < size; y += 1) {
    let total = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size) + x;
      total += Math.max(strataDark[offset], strataLight[offset]);
    }
    rowMeans[y] = total / size;
  }
  const peaks = [];
  for (let y = 0; y < size; y += 1) {
    const previous = rowMeans[(y + size - 1) % size];
    const current = rowMeans[y];
    const next = rowMeans[(y + 1) % size];
    if (current >= 0.025 && current > previous && current >= next) peaks.push({ strength: current, y });
  }
  const spacings = peaks.map((peak, index) => {
    const next = peaks[(index + 1) % peaks.length];
    return ((next?.y ?? peak.y) - peak.y + size) % size;
  }).filter((spacing) => spacing > 0);
  const spacingCoefficientOfVariation = coefficientOfVariation(spacings);
  const strengthCoefficientOfVariation = coefficientOfVariation(peaks.map((peak) => peak.strength));
  return Object.freeze({
    measuredNonUniform: peaks.length >= 3
      && (spacingCoefficientOfVariation >= 0.045 || strengthCoefficientOfVariation >= 0.075),
    peakCount: peaks.length,
    spacingCoefficientOfVariation,
    strengthCoefficientOfVariation,
  });
}

function createCompositeGeologyMapData({
  assetId,
  binding,
  geometrySha256,
  profile,
  projectionScaleMetres,
  resolvedSeed,
  semanticRegions,
  size,
}) {
  const regionSet = normalizeCompositeSemanticRegions({
    binding,
    geometrySha256,
    profile,
    semanticRegions,
    size,
  });
  const constituents = regionSet.regions.map((region) => {
    const regionSeed = c8First12SurfaceSeed(
      `${resolvedSeed}:${assetId}:${region.id}:${region.materialProfileId}`,
    );
    const maps = createC8First12GeologyMapData({
      assetId: `${assetId}:${region.id}`,
      binding: Object.freeze({
        familyId: binding.familyId,
        profileId: region.materialProfileId,
        surfaceRationale: `Authored composite region ${region.id} (${region.role}).`,
      }),
      projectionScaleMetres,
      seed: regionSeed,
      size,
    });
    return Object.freeze({ maps, region, regionSeed });
  });
  const pixelCount = size * size;
  const maps = Object.fromEntries(C8_FIRST12_MAP_ROLES.map((role) => [role, new Uint8Array(pixelCount * 4)]));
  const physicalSpanMetres = Math.max(...constituents.map(({ maps: generated }) => (
    generated.heightMicroDecode.physicalSpanMetres
  )));
  const physicalHeights = new Float32Array(pixelCount);
  let byteHash = 2166136261 >>> 0;
  let normalMinimumZ = 1;
  let roughnessMinimum = Infinity;
  let roughnessMaximum = -Infinity;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const byteOffset = pixel * 4;
    let totalWeight = 0;
    let linearRed = 0;
    let linearGreen = 0;
    let linearBlue = 0;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;
    let physicalHeight = 0;
    let ao = 0;
    let roughness = 0;
    for (const constituent of constituents) {
      const weight = constituent.region.mask[pixel] / 255;
      if (weight <= 0) continue;
      totalWeight += weight;
      const effect = constituent.region.effect ?? {};
      const base = constituent.maps.maps.baseColor;
      linearRed += srgbToLinear(base[byteOffset] / 255) * weight;
      linearGreen += srgbToLinear(base[byteOffset + 1] / 255) * weight;
      linearBlue += srgbToLinear(base[byteOffset + 2] / 255) * weight;
      const normal = constituent.maps.maps.normalGL;
      const reliefMultiplier = effect.heightMultiplier ?? 1;
      normalX += (((normal[byteOffset] / 255) * 2) - 1) * reliefMultiplier * weight;
      normalY += (((normal[byteOffset + 1] / 255) * 2) - 1) * reliefMultiplier * weight;
      normalZ += (((normal[byteOffset + 2] / 255) * 2) - 1) * weight;
      const heightSample = constituent.maps.maps.heightMicro[byteOffset] / 255;
      physicalHeight += ((heightSample - 0.5)
        * constituent.maps.heightMicroDecode.physicalSpanMetres
        * reliefMultiplier) * weight;
      const constituentAo = constituent.maps.maps.ao[byteOffset] / 255;
      ao += clamp01(constituentAo * (effect.aoMultiplier ?? 1)) * weight;
      const constituentRoughness = constituent.maps.maps.roughness[byteOffset] / 255;
      roughness += clamp01(constituentRoughness + (effect.roughnessOffset ?? 0)) * weight;
    }
    const inverseWeight = 1 / totalWeight;
    const colorBytes = [linearRed, linearGreen, linearBlue]
      .map((channel) => Math.round(linearToSrgb(channel * inverseWeight) * 255));
    normalX *= inverseWeight;
    normalY *= inverseWeight;
    normalZ *= inverseWeight;
    const normalLength = Math.max(1e-9, Math.hypot(normalX, normalY, normalZ));
    normalX /= normalLength;
    normalY /= normalLength;
    normalZ /= normalLength;
    normalMinimumZ = Math.min(normalMinimumZ, normalZ);
    physicalHeight *= inverseWeight;
    physicalHeights[pixel] = physicalHeight;
    ao = clamp01(ao * inverseWeight);
    roughness = clamp01(roughness * inverseWeight);
    roughnessMinimum = Math.min(roughnessMinimum, roughness);
    roughnessMaximum = Math.max(roughnessMaximum, roughness);
    const normalBytes = [normalX, normalY, normalZ]
      .map((channel) => Math.round((channel * 0.5 + 0.5) * 255));
    const heightByte = Math.round(clamp01((physicalHeight / physicalSpanMetres) + 0.5) * 255);
    const aoByte = Math.round(ao * 255);
    const roughnessByte = Math.round(roughness * 255);
    const smoothnessByte = 255 - roughnessByte;
    const values = {
      ao: [aoByte, aoByte, aoByte, 255],
      baseColor: [...colorBytes, 255],
      heightMicro: [heightByte, heightByte, heightByte, 255],
      normalGL: [...normalBytes, 255],
      orm: [aoByte, roughnessByte, 0, 255],
      roughness: [roughnessByte, roughnessByte, roughnessByte, 255],
      smoothness: [smoothnessByte, smoothnessByte, smoothnessByte, 255],
    };
    for (const [role, channels] of Object.entries(values)) maps[role].set(channels, byteOffset);
    for (const role of C8_FIRST12_MAP_ROLES) {
      for (let channel = 0; channel < 4; channel += 1) byteHash = fnv(values[role][channel], byteHash);
    }
  }
  let horizontalEdgeDelta = 0;
  let verticalEdgeDelta = 0;
  for (let index = 0; index < size; index += 1) {
    horizontalEdgeDelta += Math.abs(physicalHeights[index * size]
      - physicalHeights[(index * size) + size - 1]) / physicalSpanMetres;
    verticalEdgeDelta += Math.abs(physicalHeights[index]
      - physicalHeights[((size - 1) * size) + index]) / physicalSpanMetres;
  }
  return Object.freeze({
    audit: Object.freeze({
      byteHash: byteHash.toString(16).padStart(8, '0'),
      constituentSurfaces: Object.freeze(constituents.map(({ maps: generated, region, regionSeed }) => Object.freeze({
        byteHash: generated.audit.byteHash,
        id: region.id,
        materialProfileId: region.materialProfileId,
        role: region.role,
        seed: regionSeed,
      }))),
      mapRoles: C8_FIRST12_MAP_ROLES,
      normalMinimumZ,
      patternChecks: Object.freeze({
        authoredSemanticRegionBoundaries: true,
        homogeneousCompositeForbidden: true,
        uniformGridPatternForbidden: true,
      }),
      profileId: binding.profileId,
      projectionScaleMetres: projectionScaleMetres ?? null,
      roughnessRange: Object.freeze([roughnessMinimum, roughnessMaximum]),
      seed: resolvedSeed,
      semanticRegions: semanticRegionAudit(regionSet),
      size,
      tileEdgeMeanAbsoluteDelta: Object.freeze({
        horizontal: horizontalEdgeDelta / size,
        vertical: verticalEdgeDelta / size,
      }),
    }),
    heightMicroDecode: Object.freeze({
      encoding: 'UNORM8',
      formula: '(sample - 0.5) * physicalSpanMetres',
      midlevel: 0.5,
      physicalSpanMetres,
      role: 'bounded material/surface relief; not silhouette authority',
    }),
    maps: Object.freeze(maps),
    normalGLDerivation: Object.freeze({
      compositeBlend: 'decode tangent NormalGL, apply admitted role relief, weight, and renormalize',
      encoding: 'tangent-space OpenGL (+Y), RGB UNORM8',
      source: 'geometry-bound semantic masks plus independently generated single-lithology HeightMicro surfaces',
    }),
  });
}

/**
 * Generate independent, AO-free BaseColor and PBR support channels. The output
 * is a tileable material field. It cannot replace a real high-to-LOD signed
 * residual bake and never mutates geometry.
 */
export function createC8First12GeologyMapData({
  assetId,
  binding: bindingOverride = null,
  geometrySha256 = null,
  profileId = null,
  projectionScaleMetres = null,
  seed = null,
  semanticRegions = null,
  size = 1024,
} = {}) {
  const binding = assetBinding(assetId, bindingOverride, profileId);
  const profile = C8_FIRST12_LITHOLOGY_PROFILES[binding.profileId];
  assertHomogeneousSurfaceAllowed(binding, profile, 'map generation', semanticRegions);
  if (!Number.isInteger(size) || size < 64 || size > 4096) {
    throw new RangeError('Nature Reference Rock map size must be an integer from 64 to 4096; production packages enforce 1024+.');
  }
  const resolvedSeed = resolveC8First12Seed(seed, assetId);
  if (profile.requiresSemanticRegions === true) {
    return createCompositeGeologyMapData({
      assetId,
      binding,
      geometrySha256,
      profile,
      projectionScaleMetres,
      resolvedSeed,
      semanticRegions,
      size,
    });
  }
  const resolvedProjectionScale = projectionScaleMetres === null
    ? profile.baseTileMetres
    : Number(projectionScaleMetres);
  if (!Number.isFinite(resolvedProjectionScale) || resolvedProjectionScale <= 0) {
    throw new RangeError('Nature Reference Rock map generation requires a positive projection scale in metres.');
  }
  const pixelCount = size * size;
  const grainFrequency = clamp(Math.round(resolvedProjectionScale / profile.grainScale), 16, 96);
  const heightRaw = new Float32Array(pixelCount);
  const value = new Float32Array(pixelCount);
  const macro = new Float32Array(pixelCount);
  const meso = new Float32Array(pixelCount);
  const micro = new Float32Array(pixelCount);
  const fine = new Float32Array(pixelCount);
  const fracture = new Float32Array(pixelCount);
  const strataDark = new Float32Array(pixelCount);
  const strataLight = new Float32Array(pixelCount);
  const network = createFractureNetwork(profile, resolvedSeed);
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  let fractureCoverage = 0;
  let strataCoverage = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size) + x;
      const u = x / size;
      const v = y / size;
      const field = surfaceField(u, v, profile, resolvedSeed, grainFrequency);
      const bed = strataField(u, v, profile.strata, resolvedSeed);
      const cracks = fractureField(u, v, network, resolvedSeed);
      const resolvedHeight = field.height + bed.relief - (cracks * profile.fractures.depth);
      heightRaw[offset] = resolvedHeight;
      macro[offset] = field.macro;
      meso[offset] = field.meso;
      micro[offset] = field.micro;
      fine[offset] = field.fine;
      fracture[offset] = cracks;
      strataDark[offset] = bed.dark;
      strataLight[offset] = bed.light;
      value[offset] = clamp01(0.5 + ((field.macro - 0.5) * 0.45)
        + ((field.meso - 0.5) * 0.31) + ((field.micro - 0.5) * 0.18)
        + ((field.fine - 0.5) * 0.06));
      minimumHeight = Math.min(minimumHeight, resolvedHeight);
      maximumHeight = Math.max(maximumHeight, resolvedHeight);
      if (cracks > 0.18) fractureCoverage += 1;
      if (bed.dark > 0.12 || bed.light > 0.12) strataCoverage += 1;
    }
  }
  const heightRange = Math.max(1e-9, maximumHeight - minimumHeight);
  const strataVariation = profile.strata
    ? measureStrataVariation(strataDark, strataLight, size)
    : Object.freeze({
      measuredNonUniform: true,
      peakCount: 0,
      spacingCoefficientOfVariation: null,
      strengthCoefficientOfVariation: null,
    });
  const heightNormalized = new Float32Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    heightNormalized[index] = clamp01((heightRaw[index] - minimumHeight) / heightRange);
  }
  let horizontalEdgeDelta = 0;
  let verticalEdgeDelta = 0;
  for (let index = 0; index < size; index += 1) {
    horizontalEdgeDelta += Math.abs(heightNormalized[index * size]
      - heightNormalized[(index * size) + size - 1]);
    verticalEdgeDelta += Math.abs(heightNormalized[index]
      - heightNormalized[((size - 1) * size) + index]);
  }
  const maps = Object.fromEntries(C8_FIRST12_MAP_ROLES.map((role) => [role, new Uint8Array(pixelCount * 4)]));
  const sample = (x, y) => heightNormalized[
    ((((y % size) + size) % size) * size) + (((x % size) + size) % size)
  ];
  let byteHash = 2166136261 >>> 0;
  let roughnessMinimum = Infinity;
  let roughnessMaximum = -Infinity;
  let normalMinimumZ = 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size) + x;
      const byteOffset = pixel * 4;
      const grainPatch = smoothstep(0.46, 0.72, tileFbm(x / size, y / size, 5, resolvedSeed + 617, 2));
      const darkGrain = smoothstep(0.91, 0.986, fine[pixel]) * grainPatch;
      const lightGrain = smoothstep(0.92, 0.992, tileNoise(
        x / size,
        y / size,
        Math.min(127, grainFrequency + 17),
        resolvedSeed + 631,
      ))
        * (1 - grainPatch * 0.42);
      // Macro variation should modulate one rock material, not paint large
      // agate-like swirls between the profile's darkest and lightest extremes.
      const baseAmount = lerp(0.30, 0.70, smoothstep(0.08, 0.92, value[pixel]));
      let color = mixColor(profile.baseDark, profile.baseLight, baseAmount);
      color = mixColor(color, profile.mineralDark, darkGrain * 0.48);
      color = mixColor(color, profile.mineralLight, lightGrain * 0.34);
      if (profile.strata) {
        color = mixColor(color, profile.strata.dark,
          strataDark[pixel] * profile.strata.colorStrength);
        color = mixColor(color, profile.strata.light,
          strataLight[pixel] * profile.strata.colorStrength * 0.92);
      }
      // This is a mineral/oxidation tint only. AO and direct lighting never
      // feed BaseColor.
      color = mixColor(color, profile.mineralDark, fracture[pixel] * 0.18);
      const topLeft = sample(x - 1, y + 1);
      const top = sample(x, y + 1);
      const topRight = sample(x + 1, y + 1);
      const left = sample(x - 1, y);
      const right = sample(x + 1, y);
      const bottomLeft = sample(x - 1, y - 1);
      const bottom = sample(x, y - 1);
      const bottomRight = sample(x + 1, y - 1);
      const gradientX = ((topLeft + (2 * left) + bottomLeft)
        - (topRight + (2 * right) + bottomRight)) / 8;
      const gradientY = ((bottomLeft + (2 * bottom) + bottomRight)
        - (topLeft + (2 * top) + topRight)) / 8;
      const physicalSlopeScale = (size * profile.heightMicroSpanMetres
        / resolvedProjectionScale) * profile.normalStrength;
      let normalX = gradientX * physicalSlopeScale;
      let normalY = gradientY * physicalSlopeScale;
      let normalZ = 1;
      const normalLength = Math.hypot(normalX, normalY, normalZ);
      normalX /= normalLength;
      normalY /= normalLength;
      normalZ /= normalLength;
      normalMinimumZ = Math.min(normalMinimumZ, normalZ);
      // Derive authored micro-occlusion from resolution-independent scalar
      // fields. A one-pixel Laplacian would change the material when exporting
      // 1K versus 4K maps.
      const concavity = clamp01(((0.54 - micro[pixel]) * 0.38)
        + ((0.52 - meso[pixel]) * 0.20)
        + (fracture[pixel] * 0.34)
        + (strataDark[pixel] * 0.10));
      const ao = clamp01(1 - (concavity * 0.62) - ((1 - macro[pixel]) * 0.07));
      const roughness = clamp01(lerp(profile.roughness[0], profile.roughness[1], micro[pixel])
        + ((0.5 - meso[pixel]) * 0.05) + (fracture[pixel] * 0.035));
      roughnessMinimum = Math.min(roughnessMinimum, roughness);
      roughnessMaximum = Math.max(roughnessMaximum, roughness);
      const colorBytes = color.map((channel) => Math.round(linearToSrgb(channel) * 255));
      const normalBytes = [normalX, normalY, normalZ].map((channel) => Math.round((channel * 0.5 + 0.5) * 255));
      const heightByte = Math.round(heightNormalized[pixel] * 255);
      const aoByte = Math.round(ao * 255);
      const roughnessByte = Math.round(roughness * 255);
      const smoothnessByte = 255 - roughnessByte;
      const values = {
        ao: [aoByte, aoByte, aoByte, 255],
        baseColor: [...colorBytes, 255],
        heightMicro: [heightByte, heightByte, heightByte, 255],
        normalGL: [...normalBytes, 255],
        orm: [aoByte, roughnessByte, 0, 255],
        roughness: [roughnessByte, roughnessByte, roughnessByte, 255],
        smoothness: [smoothnessByte, smoothnessByte, smoothnessByte, 255],
      };
      for (const [role, channels] of Object.entries(values)) maps[role].set(channels, byteOffset);
      for (const role of C8_FIRST12_MAP_ROLES) {
        for (let channel = 0; channel < 4; channel += 1) byteHash = fnv(values[role][channel], byteHash);
      }
    }
  }
  return Object.freeze({
    audit: Object.freeze({
      byteHash: byteHash.toString(16).padStart(8, '0'),
      fractureCoverageFraction: fractureCoverage / pixelCount,
      fractureNetwork: network.audit,
      heightRawRange: Object.freeze([minimumHeight, maximumHeight]),
      grainFrequency,
      grainScaleMetres: profile.grainScale,
      mapRoles: C8_FIRST12_MAP_ROLES,
      normalMinimumZ,
      patternChecks: Object.freeze({
        branchedFractures: network.audit.branchCount > 0,
        nonUniformCrackWidths: network.audit.widthRatio > 1.5,
        nonUniformStrata: strataVariation.measuredNonUniform,
        uniformGridPatternForbidden: true,
      }),
      profileId: binding.profileId,
      projectionScaleMetres: resolvedProjectionScale,
      roughnessRange: Object.freeze([roughnessMinimum, roughnessMaximum]),
      seed: resolvedSeed,
      size,
      strataCoverageFraction: strataCoverage / pixelCount,
      strataVariation,
      tileEdgeMeanAbsoluteDelta: Object.freeze({
        horizontal: horizontalEdgeDelta / size,
        vertical: verticalEdgeDelta / size,
      }),
    }),
    heightMicroDecode: Object.freeze({
      encoding: 'UNORM8',
      formula: '(sample - 0.5) * physicalSpanMetres',
      midlevel: 0.5,
      physicalSpanMetres: profile.heightMicroSpanMetres,
      role: 'bounded material/surface relief; not silhouette authority',
    }),
    maps: Object.freeze(maps),
    normalGLDerivation: Object.freeze({
      artisticSlopeStrength: profile.normalStrength,
      encoding: 'tangent-space OpenGL (+Y), RGB UNORM8',
      exactPhysicalHeightNormalWhenStrengthIsOne: true,
      source: 'HeightMicro physicalSpanMetres and projection scaleMetres',
    }),
  });
}

export function createC8First12SurfaceSpecification({
  assetId,
  binding: bindingOverride = null,
  boundsAuthority,
  editedBoundsMetres,
  geometrySha256,
  mapResolution = 1024,
  profileId = null,
  seed = null,
  semanticRegions = null,
} = {}) {
  const binding = assetBinding(assetId, bindingOverride, profileId);
  const profile = C8_FIRST12_LITHOLOGY_PROFILES[binding.profileId];
  assertHomogeneousSurfaceAllowed(binding, profile, 'surface specification', semanticRegions);
  if (!/^[a-f0-9]{64}$/u.test(String(geometrySha256 ?? ''))) {
    throw new RangeError('Nature Reference Rock surface specification requires the current edited geometry SHA-256.');
  }
  if (!Number.isInteger(mapResolution) || mapResolution < 1024 || mapResolution > 4096) {
    throw new RangeError('Nature Reference Rock production map resolution must be an integer from 1024 to 4096.');
  }
  let semanticRegionSurface = null;
  let portableRegions = null;
  let projection;
  if (profile.requiresSemanticRegions === true) {
    const regionSet = normalizeCompositeSemanticRegions({
      binding,
      geometrySha256,
      profile,
      semanticRegions,
      size: mapResolution,
    });
    const bounds = normalizeC8First12EditedBounds(editedBoundsMetres);
    const constituentProjections = Object.freeze(Object.fromEntries(regionSet.regions.map((region) => [
      region.id,
      resolveC8First12Projection({
        assetId: `${assetId}:${region.id}`,
        binding: Object.freeze({
          familyId: binding.familyId,
          profileId: region.materialProfileId,
          surfaceRationale: `Authored composite region ${region.id} (${region.role}).`,
        }),
        editedBoundsMetres,
      }),
    ])));
    const mapRoleProjection = Object.freeze(Object.fromEntries(C8_FIRST12_MAP_ROLES.map((role) => [
      role,
      Object.freeze({ mode: 'semantic-regions-uv0-bake', upAxis: bounds.upAxis }),
    ])));
    projection = Object.freeze({
      bounds,
      boundsFingerprint: c8First12SurfaceSeed(JSON.stringify(bounds)).toString(16).padStart(8, '0'),
      constituentProjections,
      coordinateFrame: 'geometry-uv0-authored-semantic-mask',
      mapRoleProjection,
      mode: 'semantic-regions-uv0-bake',
      recalculatedFromEditedBounds: true,
      semanticRegionContractSha256: regionSet.contractSha256,
      upAxis: bounds.upAxis,
    });
    semanticRegionSurface = semanticRegionAudit(regionSet);
    portableRegions = portableSemanticRegions(regionSet);
  } else {
    projection = resolveC8First12Projection({ assetId, binding, editedBoundsMetres });
  }
  const resolvedSeed = resolveC8First12Seed(seed, assetId);
  return Object.freeze({
    assetId,
    boundsAuthority: String(boundsAuthority ?? 'edited-high-source-bounds'),
    familyId: binding.familyId,
    geometrySha256,
    heightResidual: Object.freeze({
      encoding: 'signed high-to-LOD geometric difference with explicit physical decode',
      fakeResidualForbidden: true,
      file: null,
      midlevel: 0.5,
      placeholderIsTextureMap: false,
      requiredBakeInputs: Object.freeze([
        'approved high-source positions',
        'target LOD positions and object normals',
        'UV0 coverage and ray/cage metrics',
      ]),
      role: 'HeightResidual',
      sha256: null,
      status: 'required-real-high-to-lod-bake-pending',
    }),
    lithology: profile.lithology,
    mapResolution,
    mapRoles: C8_FIRST12_MAP_ROLES,
    profileId: binding.profileId,
    projection,
    schema: C8_FIRST12_SURFACE_SCHEMA,
    seed: resolvedSeed,
    ...(semanticRegionSurface ? { semanticRegionSurface, semanticRegions: portableRegions } : {}),
    surfaceRationale: binding.surfaceRationale,
    version: C8_FIRST12_SURFACE_VERSION,
  });
}
