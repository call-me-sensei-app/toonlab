// Neutral capability contract for ToonLab's procedural woody generator.
//
// This module contains no engine-specific object names, socket identifiers, UI
// labels, or preset names. Stable ToonLab paths map directly to the procedural
// graph without making implementation conventions part of treeRecipe.

const EXACT = 'exact-graph';
const TOONLAB = 'toonlab-replacement';
const RESOURCE = 'local-resource';
const HOST = 'host-integration';

function entries(group, names, {
  coverage = EXACT,
  valueType = 'number',
  recipe = true,
} = {}) {
  return names.map((name) => Object.freeze({
    id: `${group}.${name}`,
    group,
    name,
    coverage,
    valueType,
    recipe,
  }));
}

const CONTROLS = [
  ...entries('host', ['inputGeometry'], {
    coverage: HOST,
    valueType: 'geometry',
    recipe: false,
  }),
  ...entries('form', ['seed'], { valueType: 'integer' }),
  ...entries('form', ['curvePreviewOnly'], { valueType: 'boolean' }),
  ...entries('trunk', ['tipProfile'], { valueType: 'enum' }),
  ...entries('dimensions', ['height', 'baseRadius']),
  ...entries('appearance', ['structureMaterial'], {
    coverage: TOONLAB,
    valueType: 'material',
    recipe: false,
  }),
  ...entries('trunk', ['surfaceSmoothness']),
  ...entries('trunk', ['leaderCount'], { valueType: 'integer' }),
  ...entries('trunk', ['helicalSpan', 'helicalTurns']),
  ...entries('axisNoise', [
    'scale',
    'roughness',
    'strength',
    'trunkWeight',
    'branchWeight',
  ]),
  ...entries('branching', ['crownProfile'], { valueType: 'enum' }),
  ...entries('branching', ['orderCount'], { valueType: 'integer' }),
  ...entries('branching', ['evenDistribution'], { valueType: 'boolean' }),
  ...entries('branching', ['seed'], { valueType: 'integer' }),
  ...entries('branching', [
    'orderWidthDecay',
    'width',
    'length',
    'childLengthBoost',
    'density',
    'densityExponent',
    'spawnStart',
    'spawnEnd',
    'verticalAngle',
    'lateralAngle',
    'angleJitter',
  ]),
  ...entries('branching', ['uniformTips'], { valueType: 'boolean' }),
  ...entries('branching', ['tipAngle']),
  ...entries('foliage', ['seed'], { valueType: 'integer' }),
  ...entries('foliage', [
    'density',
    'weldDistance',
  ]),
  ...entries('foliage', ['cullInterior'], { valueType: 'boolean' }),
  ...entries('foliage', ['interiorThreshold']),
  ...entries('foliage', ['cullExterior'], { valueType: 'boolean' }),
  ...entries('foliage', [
    'exteriorThreshold',
    'dispersion',
  ]),
  ...entries('appearance', ['foliageMaterial'], {
    coverage: TOONLAB,
    valueType: 'material',
    recipe: false,
  }),
  ...entries('foliage', ['firstBranchOrder']),
  ...entries('foliage', ['geometryVariant'], { valueType: 'enum' }),
  ...entries('foliage', ['customGeometry'], {
    coverage: RESOURCE,
    valueType: 'collection',
    recipe: false,
  }),
  ...entries('foliage', [
    'preserveCustomMaterials',
    'centerOnBranches',
  ], { valueType: 'boolean' }),
  ...entries('foliage', ['subdivisions'], { valueType: 'integer' }),
  ...entries('foliage', [
    'rotationJitter',
    'rotationOffset',
    'scale',
    'deformation',
    'scaleJitter',
    'heightScaleBias',
    'width',
  ]),
  ...entries('reproductive', ['distribution'], { valueType: 'enum' }),
  ...entries('reproductive', ['density']),
  ...entries('reproductive', ['useCustomGeometry'], { valueType: 'boolean' }),
  ...entries('reproductive', ['customGeometry'], {
    coverage: RESOURCE,
    valueType: 'collection',
    recipe: false,
  }),
  ...entries('reproductive', ['scale']),
  ...entries('reproductive', ['coreForm'], { valueType: 'enum' }),
  ...entries('reproductive', ['coreRadius', 'coreWidth']),
  ...entries('reproductive', ['petalForm'], { valueType: 'enum' }),
  ...entries('reproductive', ['petalScale']),
  ...entries('reproductive', ['petalCount'], { valueType: 'integer' }),
  ...entries('reproductive', [
    'petalInclination',
    'petalLateralInclination',
    'petalBelly',
    'petalWidth',
    'petalEdge',
  ]),
  ...entries('reproductive', ['extraPetalLayers'], { valueType: 'integer' }),
  ...entries('reproductive', ['extraPetalAngle', 'stamenCount', 'stamenLength']),
  ...entries('reproductive', [
    'petalResolution',
    'coreResolution',
    'stamenResolution',
  ], { valueType: 'integer' }),
  ...entries('output', ['realizeInstances'], { valueType: 'boolean' }),
  ...entries('roots', ['scale', 'shape', 'complexity', 'verticalComplexity']),
  ...entries('motion', ['enabled', 'seamless'], { valueType: 'boolean' }),
  ...entries('motion', ['loopFrames'], { valueType: 'integer' }),
  ...entries('motion', ['useDirectionObject'], { valueType: 'boolean' }),
  ...entries('motion', ['directionObject'], {
    coverage: RESOURCE,
    valueType: 'object',
    recipe: false,
  }),
  ...entries('motion', ['speed', 'strength', 'heading']),
  ...entries('shedding', ['enabled'], { valueType: 'boolean' }),
  ...entries('shedding', ['scale']),
  ...entries('shedding', ['geometryVariant'], { valueType: 'enum' }),
  ...entries('shedding', ['customGeometry'], {
    coverage: RESOURCE,
    valueType: 'collection',
    recipe: false,
  }),
  ...entries('shedding', ['preserveCustomMaterials'], { valueType: 'boolean' }),
  ...entries('appearance', ['shedMaterial'], {
    coverage: TOONLAB,
    valueType: 'material',
    recipe: false,
  }),
  ...entries('shedding', ['burstCount'], { valueType: 'integer' }),
  ...entries('shedding', [
    'burstInterval',
    'fallSpeed',
    'windInfluence',
  ]),
  ...entries('shedding', ['fade'], { valueType: 'boolean' }),
  ...entries('shedding', ['lifetime']),
  ...entries('appearance', ['barkColor'], {
    coverage: TOONLAB,
    valueType: 'color',
  }),
  ...entries('appearance', ['mossEnabled'], {
    coverage: TOONLAB,
    valueType: 'boolean',
  }),
  ...entries('appearance', ['mossColor'], {
    coverage: TOONLAB,
    valueType: 'color',
  }),
  ...entries('appearance', ['mossScale', 'leafTextureDensity'], {
    coverage: TOONLAB,
  }),
  ...entries('appearance', ['leafColorA', 'leafColorB'], {
    coverage: TOONLAB,
    valueType: 'color',
  }),
  ...entries('appearance', ['leafGradientEnabled'], {
    coverage: TOONLAB,
    valueType: 'boolean',
  }),
  ...entries('appearance', ['leafGradientMode'], {
    coverage: TOONLAB,
    valueType: 'enum',
  }),
  ...entries('appearance', ['leafTranslucency', 'leafEmission'], {
    coverage: TOONLAB,
  }),
  ...entries('appearance', [
    'flowerColorA',
    'flowerColorB',
    'flowerCoreColor',
    'flowerStamenColor',
  ], {
    coverage: TOONLAB,
    valueType: 'color',
  }),
  ...entries('appearance', ['outlineEnabled'], {
    coverage: TOONLAB,
    valueType: 'boolean',
  }),
  ...entries('appearance', ['outlineWidth'], { coverage: TOONLAB }),
  ...entries('appearance', ['outlineColor'], {
    coverage: TOONLAB,
    valueType: 'color',
  }),
  ...entries('mapping', [
    'trunkTileScale',
    'trunkStretch',
    'branchTileScale',
    'branchStretch',
    'leafTileScale',
  ], { coverage: TOONLAB }),
  ...entries('mapping', ['debugChecker'], {
    coverage: TOONLAB,
    valueType: 'boolean',
  }),
  ...entries('resolution', [
    'trunkPathSteps',
    'trunkRadialSegments',
    'branchRadialSegments',
    'branchPathSteps',
  ], { valueType: 'integer' }),
];

const ids = CONTROLS.map((control) => control.id);
if (new Set(ids).size !== ids.length) {
  throw new Error('Woody baseline control ids must be unique.');
}
if (CONTROLS.length !== 131) {
  throw new Error(`Woody baseline registry must account for 131 meaningful controls; received ${CONTROLS.length}.`);
}

export const WOODY_BASELINE_CONTROL_SCHEMA_VERSION = 1;
export const WOODY_BASELINE_SPECIES_PROFILE_VERSION = 1;
export const WOODY_BASELINE_CONTROLS = Object.freeze(CONTROLS);
export const WOODY_BASELINE_CONTROL_BY_ID = Object.freeze(
  Object.fromEntries(CONTROLS.map((control) => [control.id, control])),
);

const FAST_WOODY_GENERA = new Set([
  'Alnus', 'Eucalyptus', 'Liquidambar', 'Melaleuca', 'Paulownia', 'Populus',
  'Salix',
]);
const LONG_LIVED_WOODY_GENERA = new Set([
  'Agathis', 'Araucaria', 'Cedrus', 'Fagus', 'Ginkgo', 'Juniperus', 'Olea',
  'Pinus', 'Podocarpus', 'Quercus', 'Sequoia', 'Sequoiadendron', 'Taxodium',
  'Thuja', 'Wollemia',
]);

function frozenStage(height, width, orderDelta, branching, roots, bend) {
  return Object.freeze({ height, width, orderDelta, branching, roots, bend });
}

export function woodyBaselineAgeProfileForSpecies(profile) {
  if (!profile || !['woody-axis', 'whorled-conifer'].includes(profile.engine)) return null;
  const fast = FAST_WOODY_GENERA.has(profile.genus);
  const longLived = LONG_LIVED_WOODY_GENERA.has(profile.genus);
  const ornamental = [
    'flowering-ornamental', 'maple-rounded', 'orchard-fruit',
  ].includes(profile.architectureId);
  return Object.freeze({
    juvenile: frozenStage(
      fast ? 0.38 : ornamental ? 0.30 : 0.26,
      fast ? 0.34 : 0.30,
      -2,
      fast ? 0.34 : 0.27,
      0.30,
      0.52,
    ),
    young: frozenStage(
      fast ? 0.68 : ornamental ? 0.60 : 0.56,
      fast ? 0.66 : 0.62,
      -1,
      fast ? 0.68 : 0.58,
      0.62,
      0.74,
    ),
    mature: frozenStage(1, 1, 0, 1, 1, 1),
    old: frozenStage(
      fast ? 1.04 : longLived ? 1.12 : 1.07,
      fast ? 1.10 : longLived ? 1.22 : 1.16,
      1,
      fast ? 1.06 : 1.14,
      longLived ? 1.22 : 1.16,
      longLived ? 1.18 : 1.10,
    ),
    ancient: frozenStage(
      fast ? 1.02 : longLived ? 1.20 : 1.10,
      fast ? 1.18 : longLived ? 1.42 : 1.30,
      1,
      fast ? 1.02 : longLived ? 1.22 : 1.16,
      longLived ? 1.42 : 1.30,
      longLived ? 1.32 : 1.20,
    ),
  });
}

export function validateWoodyBaselineAgeProfile(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['woodyBaseline.ageProfile must be an object.'] };
  }
  const errors = [];
  const normalized = {};
  const stages = ['juvenile', 'young', 'mature', 'old', 'ancient'];
  const numericFields = ['height', 'width', 'branching', 'roots', 'bend'];
  for (const stage of stages) {
    const record = value[stage];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push(`woodyBaseline.ageProfile.${stage} must be an object.`);
      continue;
    }
    for (const field of numericFields) {
      if (!Number.isFinite(record[field]) || record[field] <= 0) {
        errors.push(`woodyBaseline.ageProfile.${stage}.${field} must be positive and finite.`);
      }
    }
    if (!Number.isInteger(record.orderDelta)) {
      errors.push(`woodyBaseline.ageProfile.${stage}.orderDelta must be an integer.`);
    }
    normalized[stage] = {
      height: record.height,
      width: record.width,
      orderDelta: record.orderDelta,
      branching: record.branching,
      roots: record.roots,
      bend: record.bend,
    };
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: normalized };
}

export const WOODY_GROWTH_FORMS = Object.freeze([
  'natural',
  'multi-stem',
  'columnar',
  'weeping',
  'pollarded',
  'coppiced',
  'bonsai',
  'topiary',
]);

export const WOODY_GROWTH_FORM_SUBTYPES = Object.freeze({
  natural: Object.freeze(['species-default']),
  'multi-stem': Object.freeze(['clump']),
  columnar: Object.freeze(['narrow-upright']),
  weeping: Object.freeze(['pendant-crown']),
  pollarded: Object.freeze(['pollard-head']),
  coppiced: Object.freeze(['stool']),
  bonsai: Object.freeze([
    'formal-upright',
    'informal-upright',
    'slanting',
    'cascade',
    'semi-cascade',
    'windswept',
    'broom',
    'literati',
    'clump-forest',
  ]),
  topiary: Object.freeze(['sphere', 'cone', 'cloud']),
});

const TRAINING_FORM_PROFILES = Object.freeze({
  'multi-stem': Object.freeze({
    multipliers: Object.freeze({
      'dimensions.height': 0.9,
      'dimensions.baseRadius': 0.82,
      'branching.length': 0.96,
      'branching.density': 1.12,
      'foliage.density': 1.06,
      'roots.scale': 1.16,
    }),
    overrides: Object.freeze({
      'trunk.leaderCount': 3,
      'branching.spawnStart': 92,
    }),
  }),
  columnar: Object.freeze({
    multipliers: Object.freeze({
      'branching.length': 0.58,
      'branching.density': 1.12,
      'foliage.density': 0.96,
    }),
    overrides: Object.freeze({
      'branching.crownProfile': 'linear',
      'branching.verticalAngle': 0.3,
      'branching.tipAngle': 0.34,
    }),
  }),
  weeping: Object.freeze({
    multipliers: Object.freeze({
      'branching.length': 1.1,
      'branching.density': 0.92,
      'axisNoise.branchWeight': 1.28,
    }),
    overrides: Object.freeze({
      'branching.crownProfile': 'inverse-curved',
      'branching.verticalAngle': 1,
      'branching.tipAngle': 0,
    }),
  }),
  pollarded: Object.freeze({
    orderDelta: -1,
    multipliers: Object.freeze({
      'dimensions.height': 0.66,
      'dimensions.baseRadius': 1.18,
      'branching.length': 0.38,
      'branching.density': 0.72,
      'foliage.density': 0.9,
      'roots.scale': 1.12,
    }),
    overrides: Object.freeze({
      'branching.crownProfile': 'inverse-spherical',
      'branching.spawnStart': 58,
      'branching.spawnEnd': 4,
    }),
  }),
  coppiced: Object.freeze({
    multipliers: Object.freeze({
      'dimensions.height': 0.48,
      'dimensions.baseRadius': 0.72,
      'branching.length': 0.56,
      'branching.density': 1.16,
      'foliage.density': 1.08,
      'roots.scale': 1.28,
    }),
    overrides: Object.freeze({
      'trunk.leaderCount': 3,
      'branching.crownProfile': 'inverse-soft-curve',
      'branching.spawnStart': 96,
    }),
  }),
  bonsai: Object.freeze({
    multipliers: Object.freeze({
      'dimensions.height': 0.42,
      'dimensions.baseRadius': 1.35,
      'branching.length': 0.24,
      'branching.density': 0.9,
      'foliage.density': 1,
      'foliage.scale': 0.76,
      'roots.scale': 1.2,
      'axisNoise.strength': 1.14,
    }),
    overrides: Object.freeze({
      'trunk.tipProfile': 'smooth',
      'trunk.leaderCount': 1,
      'trunk.helicalSpan': 0.32,
      'trunk.helicalTurns': 0.76,
      'axisNoise.scale': 0.285,
      'axisNoise.roughness': 0,
      'axisNoise.trunkWeight': 0.16,
      'axisNoise.branchWeight': 3.4,
      'branching.crownProfile': 'linear',
      'branching.orderWidthDecay': 1,
      'branching.childLengthBoost': 0.63,
      'branching.spawnStart': 72,
      'branching.spawnEnd': 14,
      'branching.verticalAngle': 0.78,
      'branching.lateralAngle': 2.4,
      'branching.angleJitter': 20,
      'branching.tipAngle': 0.67,
      'foliage.cullInterior': false,
      'foliage.firstBranchOrder': 0,
      'foliage.dispersion': 0.12,
      'roots.shape': 0,
      'roots.complexity': 1.15,
    }),
  }),
  topiary: Object.freeze({
    multipliers: Object.freeze({
      'dimensions.height': 0.58,
      'branching.length': 0.5,
      'branching.density': 1.28,
      'foliage.density': 1.36,
      'foliage.scale': 0.78,
    }),
    overrides: Object.freeze({
      'branching.crownProfile': 'spherical',
      'branching.evenDistribution': true,
      'branching.angleJitter': 13.8,
      'foliage.cullExterior': true,
      'foliage.exteriorThreshold': 0.72,
    }),
  }),
});

const BONSAI_SUBTYPE_OVERRIDES = Object.freeze({
  'formal-upright': Object.freeze({
    'trunk.helicalSpan': 0.18,
    'trunk.helicalTurns': 0.3,
    'axisNoise.trunkWeight': 0.16,
    'branching.crownProfile': 'linear',
  }),
  'informal-upright': Object.freeze({
    'trunk.helicalSpan': 0.46,
    'trunk.helicalTurns': 0.82,
    'axisNoise.trunkWeight': 0.24,
  }),
  slanting: Object.freeze({
    'trunk.helicalSpan': 0.5,
    'trunk.helicalTurns': 0.72,
    'axisNoise.trunkWeight': 0.9,
    'branching.crownProfile': 'inverse-soft-linear',
  }),
  cascade: Object.freeze({
    'trunk.helicalSpan': 1.05,
    'trunk.helicalTurns': 1.25,
    'axisNoise.trunkWeight': 1.25,
    'branching.crownProfile': 'inverse-curved',
    'branching.verticalAngle': 0.9,
  }),
  'semi-cascade': Object.freeze({
    'trunk.helicalSpan': 0.9,
    'trunk.helicalTurns': 1.1,
    'axisNoise.trunkWeight': 1.05,
    'branching.crownProfile': 'inverse-soft-curve',
    'branching.verticalAngle': 0.82,
  }),
  windswept: Object.freeze({
    'trunk.helicalSpan': 0.72,
    'trunk.helicalTurns': 0.86,
    'axisNoise.trunkWeight': 1.1,
    'axisNoise.branchWeight': 7.2,
    'branching.crownProfile': 'inverse-soft-linear',
    'branching.verticalAngle': 0.66,
  }),
  broom: Object.freeze({
    'trunk.helicalSpan': 0.2,
    'trunk.helicalTurns': 0.35,
    'axisNoise.trunkWeight': 0.4,
    'branching.crownProfile': 'inverse-spherical',
    'branching.spawnStart': 64,
  }),
  literati: Object.freeze({
    'trunk.leaderCount': 1,
    'trunk.helicalSpan': 0.96,
    'trunk.helicalTurns': 1.45,
    'axisNoise.trunkWeight': 0.72,
    'branching.crownProfile': 'inverse-soft-linear',
    'branching.density': 3.2,
    'foliage.density': 2.4,
  }),
  'clump-forest': Object.freeze({
    'trunk.leaderCount': 3,
    'trunk.helicalSpan': 0.36,
    'trunk.helicalTurns': 0.7,
    'branching.crownProfile': 'spherical',
    'branching.spawnStart': 94,
  }),
});

const TOPIARY_SUBTYPE_OVERRIDES = Object.freeze({
  sphere: Object.freeze({ 'branching.crownProfile': 'spherical' }),
  cone: Object.freeze({
    'branching.crownProfile': 'linear',
    'branching.verticalAngle': 0.38,
  }),
  cloud: Object.freeze({
    'branching.crownProfile': 'inverse-soft-curve',
    'foliage.dispersion': 0.08,
  }),
});

export function woodyBaselineTrainingProfileForSpecies(
  profile,
  growthForm = 'natural',
  subtype = null,
) {
  if (!profile || !['woody-axis', 'whorled-conifer'].includes(profile.engine)) return null;
  const form = WOODY_GROWTH_FORMS.includes(growthForm) ? growthForm : 'natural';
  const supportedSubtypes = WOODY_GROWTH_FORM_SUBTYPES[form];
  const resolvedSubtype = supportedSubtypes.includes(subtype)
    ? subtype
    : supportedSubtypes[0];
  if (form === 'natural') {
    return Object.freeze({
      form,
      subtype: resolvedSubtype,
      orderDelta: 0,
      multipliers: Object.freeze({}),
      overrides: Object.freeze({}),
    });
  }
  const base = TRAINING_FORM_PROFILES[form];
  const subtypeOverrides = form === 'bonsai'
    ? BONSAI_SUBTYPE_OVERRIDES[resolvedSubtype]
    : form === 'topiary'
      ? TOPIARY_SUBTYPE_OVERRIDES[resolvedSubtype]
      : null;
  return Object.freeze({
    form,
    subtype: resolvedSubtype,
    orderDelta: base.orderDelta ?? 0,
    multipliers: Object.freeze({ ...base.multipliers }),
    overrides: Object.freeze({
      ...base.overrides,
      ...(subtypeOverrides ?? {}),
    }),
  });
}

export function validateWoodyBaselineTrainingProfile(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['woodyBaseline.trainingProfile must be an object.'] };
  }
  const errors = [];
  if (!WOODY_GROWTH_FORMS.includes(value.form)) {
    errors.push(`woodyBaseline.trainingProfile.form must be one of ${WOODY_GROWTH_FORMS.join(', ')}.`);
  }
  const subtypes = WOODY_GROWTH_FORM_SUBTYPES[value.form] ?? [];
  if (!subtypes.includes(value.subtype)) {
    errors.push(`woodyBaseline.trainingProfile.subtype must be one of ${subtypes.join(', ')}.`);
  }
  if (!Number.isInteger(value.orderDelta)) {
    errors.push('woodyBaseline.trainingProfile.orderDelta must be an integer.');
  }
  if (!value.multipliers || typeof value.multipliers !== 'object'
    || Array.isArray(value.multipliers)) {
    errors.push('woodyBaseline.trainingProfile.multipliers must be an object.');
  } else {
    for (const [id, multiplier] of Object.entries(value.multipliers)) {
      if (!WOODY_BASELINE_CONTROL_BY_ID[id]) {
        errors.push(`woodyBaseline.trainingProfile multiplier "${id}" is not registered.`);
      }
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        errors.push(`woodyBaseline.trainingProfile multiplier "${id}" must be positive and finite.`);
      }
    }
  }
  const overrides = validateWoodyBaselineControlValues(value.overrides);
  if (!overrides.ok) {
    errors.push(...overrides.errors.map(
      (error) => error.replace('woodyBaseline.controls', 'woodyBaseline.trainingProfile.overrides'),
    ));
  }
  return errors.length
    ? { ok: false, errors }
    : {
      ok: true,
      value: {
        form: value.form,
        subtype: value.subtype,
        orderDelta: value.orderDelta,
        multipliers: structuredClone(value.multipliers),
        overrides: overrides.value,
      },
    };
}

export const WOODY_BASELINE_CONTROL_GROUPS = Object.freeze([
  Object.freeze({ id: 'form', label: 'Overall form', description: 'Primary seed and curve-only inspection.' }),
  Object.freeze({ id: 'dimensions', label: 'Dimensions', description: 'Independent height and base thickness.' }),
  Object.freeze({ id: 'trunk', label: 'Trunk construction', description: 'Leader count, tip profile, twist, and smoothing.' }),
  Object.freeze({ id: 'axisNoise', label: 'Axis deformation', description: 'Frequency and strength of trunk and branch centerline variation.' }),
  Object.freeze({ id: 'branching', label: 'Branch topology', description: 'Recursive order, crown profile, spawn bands, taper, distribution, and orientation.' }),
  Object.freeze({ id: 'foliage', label: 'Leaf generation', description: 'Leaf geometry variants, placement, culling, deformation, scale, and rotation.' }),
  Object.freeze({ id: 'reproductive', label: 'Flowers and reproductive geometry', description: 'Distribution plus core, petal, and stamen construction.' }),
  Object.freeze({ id: 'roots', label: 'Root base', description: 'Visible root scale, shape, horizontal complexity, and vertical complexity.' }),
  Object.freeze({ id: 'motion', label: 'Wind deformation', description: 'Procedural wind direction, intensity, timing, and seamless loops.' }),
  Object.freeze({ id: 'shedding', label: 'Leaf shedding', description: 'Falling-leaf bursts, geometry, lifetime, velocity, and wind response.' }),
  Object.freeze({ id: 'appearance', label: 'Stylized appearance', description: 'Toonlab-owned bark, leaf, flower, moss, translucency, and outline treatment.' }),
  Object.freeze({ id: 'mapping', label: 'Surface mapping', description: 'Toonlab texture scale, stretch, and mapping diagnostics.' }),
  Object.freeze({ id: 'resolution', label: 'Geometry resolution', description: 'Path and radial tessellation, independent from growth topology.' }),
  Object.freeze({ id: 'output', label: 'Output realization', description: 'Instance realization for export.' }),
  Object.freeze({ id: 'host', label: 'Host integration', description: 'Non-serializable scene inputs owned by the local host.' }),
]);

export const WOODY_BASELINE_ENUM_OPTIONS = Object.freeze({
  'trunk.tipProfile': Object.freeze(['linear', 'sharp', 'smooth']),
  'branching.crownProfile': Object.freeze([
    'linear',
    'soft-curve',
    'curved',
    'soft-linear',
    'spherical',
    'inverse-soft-curve',
    'inverse-curved',
    'inverse-soft-linear',
    'inverse-spherical',
  ]),
  'foliage.geometryVariant': Object.freeze([
    'single',
    'stylized-needle',
    'box-cluster',
    'sphere-cluster',
    'half-sphere-cluster',
    'polyhedral-cluster',
    'blob-cluster',
    'custom',
  ]),
  'reproductive.distribution': Object.freeze(['clustered', 'random']),
  'reproductive.coreForm': Object.freeze(['simple', 'pistil']),
  'reproductive.petalForm': Object.freeze([
    'oval',
    'outward',
    'recurved',
    'spherical',
  ]),
  'shedding.geometryVariant': Object.freeze(['single', 'custom']),
  'appearance.leafGradientMode': Object.freeze(['position', 'uv']),
});

const DEFAULT_CONTROLS = Object.freeze({
  'form.seed': 1,
  'form.curvePreviewOnly': false,
  'trunk.tipProfile': 'smooth',
  'dimensions.height': 10,
  'dimensions.baseRadius': 0.6,
  'trunk.surfaceSmoothness': 0,
  'trunk.leaderCount': 1,
  'trunk.helicalSpan': 0.04,
  'trunk.helicalTurns': 0.8,
  'axisNoise.scale': 0.3,
  'axisNoise.roughness': 0,
  'axisNoise.strength': 1.5,
  'axisNoise.trunkWeight': 0,
  'axisNoise.branchWeight': 2,
  'branching.crownProfile': 'soft-linear',
  'branching.orderCount': 3,
  'branching.evenDistribution': true,
  'branching.seed': 1,
  'branching.orderWidthDecay': 0.86,
  'branching.width': 1,
  'branching.length': 15,
  'branching.childLengthBoost': 0.6,
  'branching.density': 9,
  'branching.densityExponent': 1,
  'branching.spawnStart': 65,
  'branching.spawnEnd': 20,
  'branching.verticalAngle': 0.6,
  'branching.lateralAngle': 2.3998277,
  'branching.angleJitter': 20,
  'branching.uniformTips': false,
  'branching.tipAngle': 0.22,
  'foliage.seed': 1,
  'foliage.density': 5,
  'foliage.weldDistance': 0.045,
  'foliage.cullInterior': false,
  'foliage.interiorThreshold': 0,
  'foliage.cullExterior': false,
  'foliage.exteriorThreshold': 0,
  'foliage.dispersion': 0.18,
  'foliage.firstBranchOrder': 0,
  'foliage.geometryVariant': 'single',
  'foliage.preserveCustomMaterials': false,
  'foliage.centerOnBranches': true,
  'foliage.subdivisions': 1,
  'foliage.rotationJitter': 0.1,
  'foliage.rotationOffset': 0,
  'foliage.scale': 1.25,
  'foliage.deformation': 0.9,
  'foliage.scaleJitter': 1,
  'foliage.heightScaleBias': 0.2,
  'foliage.width': 1,
  'reproductive.distribution': 'clustered',
  'reproductive.density': 0,
  'reproductive.useCustomGeometry': false,
  'reproductive.scale': 0.1,
  'reproductive.coreForm': 'pistil',
  'reproductive.coreRadius': 0.45,
  'reproductive.coreWidth': 0.8,
  'reproductive.petalForm': 'outward',
  'reproductive.petalScale': 1,
  'reproductive.petalCount': 7,
  'reproductive.petalInclination': 0,
  'reproductive.petalLateralInclination': 0,
  'reproductive.petalBelly': 0.55,
  'reproductive.petalWidth': 1.77,
  'reproductive.petalEdge': -0.4,
  'reproductive.extraPetalLayers': 2,
  'reproductive.extraPetalAngle': -14.9,
  'reproductive.stamenCount': 18,
  'reproductive.stamenLength': 0.8,
  'reproductive.petalResolution': 8,
  'reproductive.coreResolution': 8,
  'reproductive.stamenResolution': 8,
  'output.realizeInstances': true,
  'roots.scale': 0.5,
  'roots.shape': 0,
  'roots.complexity': 1.15,
  'roots.verticalComplexity': 0,
  'motion.enabled': false,
  'motion.seamless': true,
  'motion.loopFrames': 120,
  'motion.useDirectionObject': false,
  'motion.speed': 1,
  'motion.strength': 0.25,
  'motion.heading': 0,
  'shedding.enabled': false,
  'shedding.scale': 1,
  'shedding.geometryVariant': 'single',
  'shedding.preserveCustomMaterials': false,
  'shedding.burstCount': 12,
  'shedding.burstInterval': 8,
  'shedding.fallSpeed': 1,
  'shedding.windInfluence': 0.5,
  'shedding.fade': true,
  'shedding.lifetime': 120,
  'appearance.barkColor': [0.2, 0.105, 0.045],
  'appearance.mossEnabled': false,
  'appearance.mossColor': [0.18, 0.32, 0.12],
  'appearance.mossScale': 1,
  'appearance.leafTextureDensity': 1,
  'appearance.leafColorA': [0.24, 0.52, 0.18],
  'appearance.leafColorB': [0.16, 0.36, 0.12],
  'appearance.leafGradientEnabled': true,
  'appearance.leafGradientMode': 'position',
  'appearance.leafTranslucency': 0.22,
  'appearance.leafEmission': 0,
  'appearance.flowerColorA': [0.86, 0.52, 0.62],
  'appearance.flowerColorB': [0.98, 0.78, 0.82],
  'appearance.flowerCoreColor': [0.92, 0.68, 0.12],
  'appearance.flowerStamenColor': [0.96, 0.82, 0.28],
  'appearance.outlineEnabled': false,
  'appearance.outlineWidth': 0.015,
  'appearance.outlineColor': [0.04, 0.035, 0.03],
  'mapping.trunkTileScale': 1,
  'mapping.trunkStretch': 1,
  'mapping.branchTileScale': 1,
  'mapping.branchStretch': 1,
  'mapping.leafTileScale': 1,
  'mapping.debugChecker': false,
  'resolution.trunkPathSteps': 36,
  'resolution.trunkRadialSegments': 12,
  'resolution.branchRadialSegments': 6,
  'resolution.branchPathSteps': 16,
});

const serializableControlIds = CONTROLS
  .filter((control) => control.recipe)
  .map((control) => control.id);
if (Object.keys(DEFAULT_CONTROLS).length !== serializableControlIds.length
  || serializableControlIds.some((id) => !Object.hasOwn(DEFAULT_CONTROLS, id))) {
  throw new Error('Every serializable woody baseline control requires a neutral Toonlab default.');
}

export const WOODY_BASELINE_DEFAULT_CONTROLS = DEFAULT_CONTROLS;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function crownProfileForSpecies(profile) {
  if (profile.engine === 'whorled-conifer') {
    return ['open', 'relict'].includes(profile.axisMode) ? 'soft-linear' : 'linear';
  }
  const researchedArchitectureProfiles = {
    'eucalypt-paperbark': 'soft-linear',
    'ficus-aerial-root': 'inverse-spherical',
    'flowering-ornamental': 'inverse-soft-curve',
    'high-crown-excurrent': 'soft-linear',
    'mangrove-specialized-root': 'spherical',
    'maple-rounded': 'spherical',
    'massive-decurrent': 'inverse-soft-linear',
    'mediterranean-evergreen': 'spherical',
    'orchard-fruit': 'spherical',
    'pale-clonal': 'linear',
    'riparian-central-leader': 'soft-linear',
    'savanna-umbrella': 'inverse-soft-linear',
    'smooth-layered': 'soft-curve',
    'tropical-buttressed': 'soft-linear',
    'tropical-spreading': 'inverse-spherical',
    'vase-arching': 'inverse-curved',
  };
  if (researchedArchitectureProfiles[profile.architectureId]) {
    return researchedArchitectureProfiles[profile.architectureId];
  }
  if (['monopodial', 'sparse-excurrent', 'columnar'].includes(profile.axisMode)) {
    return 'linear';
  }
  if (['decurrent', 'colonized', 'spreading', 'umbrella'].includes(profile.axisMode)) {
    return 'spherical';
  }
  return 'soft-linear';
}

function barkColorForSpecies(profile) {
  if (profile.architectureId === 'pale-clonal') return [0.54, 0.5, 0.43];
  if (profile.architectureId === 'eucalypt-paperbark') return [0.4, 0.3, 0.2];
  if (profile.engine === 'whorled-conifer') return [0.19, 0.115, 0.065];
  if (profile.architectureId === 'mediterranean-evergreen') return [0.24, 0.15, 0.075];
  return [...DEFAULT_CONTROLS['appearance.barkColor']];
}

function darkerColor(color, factor = 0.72) {
  return color.map((channel) => Number(clamp(channel * factor, 0, 1).toFixed(4)));
}

// Resolve a complete mature-stage control set from ToonLab's own species
// profile. No source-graph preset can silently define a ToonLab species.
export function woodyBaselineInheritedControlsForSpecies(profile) {
  if (!profile || !['woody-axis', 'whorled-conifer'].includes(profile.engine)) {
    return null;
  }
  const traits = profile.structuralTraits ?? {};
  const conifer = profile.engine === 'whorled-conifer';
  const height = clamp(Number(traits.height ?? 10), 0.5, 60);
  const radius = clamp(Number(traits.trunkRadius ?? 0.3), 0.02, 4);
  const crownWidth = clamp(Number(traits.crownWidth ?? height * 0.45), 0.2, 50);
  const branchStart = clamp(Number(traits.branchStart ?? 0.34), 0.02, 0.92);
  const branchSpawnEnd = clamp(Number(traits.branchSpawnEnd ?? 0.82), branchStart, 0.99);
  const branchAngle = clamp(Number(traits.branchAngle ?? 54), 0, 115);
  const children = clamp(Math.round(Number(traits.children ?? 5)), 1, 32);
  // Preserve a researched fourth living-shoot order. Total geometry is
  // governed by the independent axis budget, so silently truncating the
  // species hierarchy here only produces bare scaffolds.
  const levels = clamp(Math.round(Number(traits.levels ?? 3)), 1, 4);
  const density = clamp(Number(traits.canopyDensity ?? 0.9), 0, 1.5);
  const gnarl = clamp(Number(traits.gnarl ?? 0.18), 0, 1);
  const lean = clamp(Number(traits.lean ?? 0.06), 0, 1);
  const phyllotaxis = Number(traits.phyllotaxisAngle ?? 137.5) * Math.PI / 180;
  const cardRange = traits.foliageCardSizeRange ?? (conifer ? [0.45, 0.7] : [0.55, 0.9]);
  const cardScale = (Number(cardRange[0]) + Number(cardRange[1] ?? cardRange[0])) * 0.5;
  const foliageColor = [...(profile.foliageColor ?? DEFAULT_CONTROLS['appearance.leafColorA'])];
  const rootScale = Number(traits.baselineRootScale ?? ({
    // Root size is an absolute carrier-space input. Scaling every ordinary
    // tree to 0.5 made small ornamentals look like hollow, cut-open stumps.
    // Tie the visible flare to the researched mature trunk radius instead.
    'standard-flare': clamp(radius * 0.5, 0.08, 0.45),
    buttress: 1.55,
    aerial: 1.2,
    prop: 1.25,
    pneumatophore: 1.1,
    knees: 1.15,
  }[profile.rootProfile] ?? 0.5));
  const branchLengthFactor = {
    'eucalypt-paperbark': 1.28,
    'ficus-aerial-root': 1.72,
    'flowering-ornamental': 1.42,
    'high-crown-excurrent': 1.24,
    'mangrove-specialized-root': 1.32,
    'maple-rounded': 1.38,
    'massive-decurrent': 1.58,
    'mediterranean-evergreen': 1.42,
    'orchard-fruit': 1.34,
    'pale-clonal': 1.1,
    'riparian-central-leader': 1.18,
    'savanna-umbrella': 1.72,
    'smooth-layered': 1.34,
    'tropical-buttressed': 1.25,
    'tropical-spreading': 1.7,
    'vase-arching': 1.48,
  }[profile.architectureId] ?? (conifer ? 1.12 : 1.35);
  const childLengthBoost = {
    'eucalypt-paperbark': 0.5,
    'ficus-aerial-root': 0.66,
    'flowering-ornamental': 0.5,
    'high-crown-excurrent': 0.42,
    'mangrove-specialized-root': 0.5,
    'maple-rounded': 0.46,
    'massive-decurrent': 0.62,
    'mediterranean-evergreen': 0.56,
    'orchard-fruit': 0.48,
    'pale-clonal': 0.36,
    'riparian-central-leader': 0.4,
    'savanna-umbrella': 0.66,
    'smooth-layered': 0.48,
    'tropical-buttressed': 0.42,
    'tropical-spreading': 0.68,
    'vase-arching': 0.56,
  }[profile.architectureId] ?? (conifer ? 0.4 : 0.5);
  const seed = Math.max(1, hashString(profile.id) % 10000);
  return Object.freeze({
    ...structuredClone(DEFAULT_CONTROLS),
    'form.seed': seed,
    'trunk.tipProfile': conifer ? 'sharp' : gnarl > 0.35 ? 'smooth' : 'linear',
    'dimensions.height': Number(height.toFixed(4)),
    // treeSpeciesProfiles stores a radius already. The first baseline pass
    // treated it as a diameter and doubled it, producing the cut-stump trunks
    // seen on small ornamental species such as Acer palmatum.
    'dimensions.baseRadius': Number(radius.toFixed(4)),
    'trunk.leaderCount': clamp(
      Math.round(Number(traits.crownLeaderCount ?? traits.stemCount ?? 1)),
      1,
      3,
    ),
    'trunk.helicalSpan': Number(clamp(gnarl * 0.42 + lean * 0.25, 0, 1.2).toFixed(4)),
    'trunk.helicalTurns': Number(clamp(gnarl * 2.4 + lean * 1.2, 0, 4.7).toFixed(4)),
    'axisNoise.scale': Number(clamp(0.24 + gnarl * 0.72, 0.2, 2.5).toFixed(4)),
    'axisNoise.roughness': Number(clamp(gnarl * 0.2, 0, 0.25).toFixed(4)),
    'axisNoise.strength': Number(clamp(gnarl * 5.2 + lean * 1.5, 0, 4.5).toFixed(4)),
    'axisNoise.trunkWeight': Number(clamp(lean * 3 - gnarl * 0.45, -0.5, 3.3).toFixed(4)),
    'axisNoise.branchWeight': Number(clamp(1.1 + gnarl * 5.5, 1, 8).toFixed(4)),
    'branching.crownProfile': traits.baselineCrownProfile
      ?? crownProfileForSpecies(profile),
    'branching.orderCount': levels,
    'branching.evenDistribution': traits.evenBranchDistribution ?? conifer,
    'branching.seed': (seed * 31 + 7) % 100000,
    'branching.orderWidthDecay': Number(clamp(0.72 + (traits.pipeExponent ?? 2.08) * 0.07, 0.7, 1).toFixed(4)),
    'branching.width': Number(clamp(
      Number(traits.baselineBranchWidth ?? (0.55 + (radius / 0.5) * 0.35)),
      0.4,
      1.35,
    ).toFixed(4)),
    'branching.length': Number(clamp(
      Number(traits.baselineBranchLength ?? Math.max(
        crownWidth * branchLengthFactor,
        height * (conifer ? 0.64 : 0.58),
      )),
      3,
      50,
    ).toFixed(4)),
    'branching.childLengthBoost': Number(clamp(
      Number(traits.baselineChildLengthBoost ?? childLengthBoost),
      0,
      1.5,
    ).toFixed(4)),
    'branching.density': Number(clamp(
      Number(traits.baselineBranchDensity ?? children * (conifer ? 1.25 : 1.8)),
      1,
      48,
    ).toFixed(4)),
    'branching.densityExponent': Number(clamp(traits.branchingExponent ?? 1, 0.05, 1.62).toFixed(4)),
    'branching.spawnStart': Number(clamp((1 - branchStart) * 100, 46.67, 100).toFixed(4)),
    'branching.spawnEnd': Number(clamp((1 - branchSpawnEnd) * 100, 0, 42.4).toFixed(4)),
    // This carrier value is radians. Limiting it to 1 radian silently turned
    // the 90–106° whorls researched for spruce/fir into 57° ascending limbs.
    'branching.verticalAngle': Number(clamp(
      branchAngle * Math.PI / 180,
      0,
      Math.PI * 0.49,
    ).toFixed(4)),
    'branching.lateralAngle': Number((((phyllotaxis % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).toFixed(4)),
    'branching.angleJitter': Number(clamp(13.8 + gnarl * 30, 13.8, 36).toFixed(4)),
    'branching.tipAngle': Number(clamp((traits.tipUpturn ?? 0.08) * 3.2, 0, 1.42).toFixed(4)),
    'foliage.seed': (seed * 47 + 11) % 100000,
    'foliage.density': Number(clamp(
      Number(traits.baselineFoliageDensity ?? density * (conifer ? 5.4 : 8.5)),
      0,
      12,
    ).toFixed(4)),
    'foliage.weldDistance': Number(clamp(cardScale * 0.06, 0, 1).toFixed(4)),
    'foliage.dispersion': Number(clamp((traits.foliageClusterRadius ?? 0.5) * 0.38, 0, 1.5).toFixed(4)),
    'foliage.firstBranchOrder': conifer ? 1 : Math.max(0, levels - 3),
    'foliage.geometryVariant': conifer ? 'stylized-needle' : 'single',
    'foliage.subdivisions': conifer ? 0 : 1,
    'foliage.rotationJitter': Number(clamp(0.06 + gnarl * 0.3, 0, 1).toFixed(4)),
    'foliage.scale': Number(clamp(cardScale * (conifer ? 0.85 : 1.35), 0.2, 4.5).toFixed(4)),
    'foliage.scaleJitter': Number(clamp(0.75 + gnarl * 1.2, 0, 2).toFixed(4)),
    'foliage.heightScaleBias': Number(clamp(conifer ? 0.08 : branchStart * 0.5, 0, 0.8).toFixed(4)),
    // This is the card aspect multiplier, not the width of one biological
    // needle. A value of 0.2 collapsed an entire authored spray into a thin
    // starburst line. Keep the spray broad enough to show the lateral needle
    // rows encoded by the native alpha texture.
    'foliage.width': conifer ? 0.82 : 1,
    'roots.scale': rootScale,
    'roots.shape': profile.rootProfile === 'standard-flare' ? 0 : 1.1,
    'roots.complexity': profile.rootProfile === 'standard-flare' ? 1.15 : 3.81,
    'roots.verticalComplexity': ['aerial', 'prop', 'knees', 'pneumatophore'].includes(profile.rootProfile)
      ? 1
      : 0,
    'appearance.barkColor': barkColorForSpecies(profile),
    'appearance.leafColorA': foliageColor,
    'appearance.leafColorB': darkerColor(foliageColor),
    'appearance.leafTranslucency': conifer ? 0.1 : 0.24,
    'mapping.trunkTileScale': Number(clamp(height / 8, 0.5, 4).toFixed(4)),
    'mapping.branchTileScale': Number(clamp(crownWidth / 5, 0.5, 3).toFixed(4)),
    'mapping.leafTileScale': Number(clamp(1 / Math.max(cardScale, 0.1), 0.4, 4).toFixed(4)),
    // Species-authored structural resolution must survive the baseline
    // carrier. Without these overrides every species silently inherited the
    // generic 12-sided trunk, including the explicitly six-sided stylized
    // Norway spruce profile.
    'resolution.trunkRadialSegments': clamp(
      Math.round(Number(traits.radialSegments) || 12),
      3,
      24,
    ),
    'resolution.branchRadialSegments': clamp(
      Math.round(Number(traits.branchRadialSegments) || Math.min(6, Number(traits.radialSegments) || 12)),
      3,
      24,
    ),
  });
}

const CROWN_MODE_BY_BASELINE_PROFILE = Object.freeze({
  linear: 'excurrent',
  'soft-curve': 'layered',
  curved: 'vase',
  'soft-linear': 'monopodial',
  spherical: 'decurrent',
  'inverse-soft-curve': 'weeping',
  'inverse-curved': 'weeping',
  'inverse-soft-linear': 'spreading',
  'inverse-spherical': 'umbrella',
});

function resolvedBaselineControls(profile, options) {
  const baseline = options?.woodyBaseline ?? {};
  const inherited = baseline.inheritedControls
    ?? woodyBaselineInheritedControlsForSpecies(profile);
  if (!inherited) return null;
  const training = baseline.trainingProfile
    ?? woodyBaselineTrainingProfileForSpecies(
      profile,
      options?.growthForm,
      options?.growthFormSubtype,
    );
  const effective = structuredClone(inherited);
  for (const [id, multiplier] of Object.entries(training?.multipliers ?? {})) {
    if (Number.isFinite(effective[id])) effective[id] *= multiplier;
  }
  Object.assign(effective, training?.overrides ?? {}, baseline.controls ?? {});
  if (Number.isInteger(training?.orderDelta)) {
    effective['branching.orderCount'] = clamp(
      Math.round(effective['branching.orderCount'] + training.orderDelta),
      1,
      4,
    );
  }
  return { effective, inherited };
}

// Independent Three.js runtime mapping for the exhaustive woody control
// contract. The control relationships are translated into Toonlab semantic
// traits; no host application, external executable, or retained mesh is
// involved in recipe -> graph -> geometry.
export function resolveWoodyBaselineThreeRuntime(profile, options = {}) {
  if (!['woody-axis', 'whorled-conifer'].includes(profile?.engine)) return null;
  const controls = resolvedBaselineControls(profile, options);
  if (!controls) return null;
  const { effective, inherited } = controls;
  const traits = profile.structuralTraits ?? {};
  const relative = (id, fallback = 1) => {
    const base = Number(inherited[id]);
    const value = Number(effective[id]);
    return Number.isFinite(base) && Math.abs(base) > 1e-7 && Number.isFinite(value)
      ? value / base
      : fallback;
  };
  const branchLengthScale = relative('branching.length') * relative('branching.width');
  const densityScale = Math.sqrt(Math.max(0.02, relative('branching.density')));
  const foliageScale = Math.max(0.05, relative('foliage.scale'));
  const foliageDensityScale = Math.max(0, relative('foliage.density'));
  const authoredCardRange = traits.foliageCardSizeRange ?? (
    profile.engine === 'whorled-conifer' ? [0.34, 0.58] : [0.42, 0.72]
  );
  // The previous renderer treated each terminal attachment as a large anime
  // canopy puff. The native curve evaluator carries many real terminal shoots,
  // so each card now represents a leaf or needle-bearing spray at a restrained
  // biological/stylized scale instead of another crown-sized blob.
  const baseCardRange = profile.engine === 'whorled-conifer'
    ? [
      clamp(Number(authoredCardRange[0]) * 0.45, 0.18, 0.42),
      clamp(Number(authoredCardRange[1] ?? authoredCardRange[0]) * 0.45, 0.28, 0.56),
    ]
    : [
      clamp(Number(authoredCardRange[0]) * 0.24, 0.075, 0.16),
      clamp(Number(authoredCardRange[1] ?? authoredCardRange[0]) * 0.24, 0.11, 0.22),
    ];
  const rootScale = Math.max(0.02, relative('roots.scale'));
  const axisStrength = Number(effective['axisNoise.strength']) || 0;
  const axisScale = Number(effective['axisNoise.scale']) || 0;
  const trunkWeight = Number(effective['axisNoise.trunkWeight']) || 0;
  const branchWeight = Number(effective['axisNoise.branchWeight']) || 0;
  const helicalSpan = Number(effective['trunk.helicalSpan']) || 0;
  const helicalTurns = Number(effective['trunk.helicalTurns']) || 0;
  // Crown profile controls the branch-length envelope. It must not replace
  // the species' growth architecture: a colonizing mahogany remains
  // colonizing even when its envelope uses a soft-linear profile.
  const crownMode = traits.crownMode ?? profile.axisMode;
  const radialSegments = clamp(
    Math.round(effective['resolution.trunkRadialSegments'] ?? 8),
    3,
    24,
  );
  const branchRadialSegments = clamp(
    Math.round(effective['resolution.branchRadialSegments'] ?? radialSegments),
    3,
    radialSegments,
  );
  const mappedTraits = {
    formSeed: Math.round(Number(effective['form.seed']) || 1),
    curvePreviewOnly: Boolean(effective['form.curvePreviewOnly']),
    tipProfile: effective['trunk.tipProfile'],
    surfaceSmoothness: clamp(Number(effective['trunk.surfaceSmoothness']), 0, 1),
    branchSeed: Math.round(Number(effective['branching.seed']) || 1),
    foliageSeed: Math.round(Number(effective['foliage.seed']) || 1),
    height: clamp(Number(effective['dimensions.height']), 0.2, 80),
    trunkRadius: clamp(Number(effective['dimensions.baseRadius']), 0.01, 5),
    crownWidth: clamp(
      Number(traits.crownWidth ?? 4) * branchLengthScale,
      0.15,
      70,
    ),
    crownDepth: clamp(
      Number(traits.crownDepth ?? traits.crownWidth ?? 4)
        * Math.sqrt(Math.max(0.05, branchLengthScale)),
      0.15,
      70,
    ),
    crownMode,
    crownLeaderCount: clamp(Math.round(effective['trunk.leaderCount']), 1, 6),
    stemCount: clamp(Math.round(effective['trunk.leaderCount']), 1, 8),
    levels: clamp(Math.round(effective['branching.orderCount']), 1, 4),
    children: clamp(
      Math.round(Number(traits.children ?? 5) * densityScale),
      1,
      18,
    ),
    branchStart: clamp(1 - Number(effective['branching.spawnStart']) / 100, 0.02, 0.92),
    branchSpawnEnd: clamp(1 - Number(effective['branching.spawnEnd']) / 100, 0.08, 0.99),
    branchAngle: clamp(Number(effective['branching.verticalAngle']) * 180 / Math.PI, 0, 115),
    branchAngleJitter: clamp(Number(effective['branching.angleJitter']), 0, 45),
    branchDensity: clamp(Number(effective['branching.density']), 1, 48),
    branchDensityExponent: clamp(
      Number(effective['branching.densityExponent']),
      0.05,
      1.8,
    ),
    baselineCrownProfile: effective['branching.crownProfile'],
    baselineBranchLength: clamp(Number(effective['branching.length']), 0.2, 50),
    baselineBranchWidth: clamp(Number(effective['branching.width']), 0.05, 2),
    uniformBranchTips: Boolean(effective['branching.uniformTips']),
    phyllotaxisAngle: (
      Number(effective['branching.lateralAngle']) * 180 / Math.PI + 360
    ) % 360,
    evenBranchDistribution: Boolean(effective['branching.evenDistribution']),
    lengthRatio: clamp(
      0.48 + Number(effective['branching.childLengthBoost']) * 0.32,
      0.2,
      0.9,
    ),
    radiusRatio: clamp(Number(effective['branching.orderWidthDecay']), 0.48, 0.96),
    pipeExponent: clamp(
      (Number(effective['branching.orderWidthDecay']) - 0.58) / 0.13,
      1.65,
      3,
    ),
    gnarl: clamp(
      axisStrength * 0.1 + helicalTurns * 0.08 + Number(effective['axisNoise.roughness']),
      0,
      1,
    ),
    gnarliness: clamp(axisStrength * 0.16 + branchWeight * 0.055, 0, 1.25),
    bend: clamp(helicalSpan * 0.65 + axisScale * 0.06, 0, 1.5),
    lean: clamp(Math.max(0, trunkWeight) * 0.12 + helicalSpan * 0.08, 0, 0.85),
    twist: clamp(helicalTurns * Math.PI * 0.28, -Math.PI * 2, Math.PI * 2),
    helicalSpan: clamp(helicalSpan, 0, 2.5),
    helicalTurns: clamp(helicalTurns, -8, 8),
    trunkNoise: clamp(axisStrength * axisScale * 0.018, 0, 0.24),
    branchNoise: clamp(axisStrength * branchWeight * 0.012, 0, 0.34),
    branchSag: clamp(
      Number(effective['branching.verticalAngle']) * 0.08
        + Math.max(0, branchWeight - 2) * 0.006,
      0,
      0.2,
    ),
    tipUpturn: clamp(Number(effective['branching.tipAngle']) / 3.2, 0, 0.5),
    baseFlare: clamp(
      Number(traits.baseFlare ?? 1.08) * Math.pow(rootScale, 0.28),
      1,
      1.45,
    ),
    rootScale,
    rootComplexity: Math.max(0, Number(effective['roots.complexity']) || 0),
    rootVerticalComplexity: Math.max(
      0,
      Number(effective['roots.verticalComplexity']) || 0,
    ),
    canopyDensity: clamp(
      Number(traits.canopyDensity ?? 0.9) * foliageDensityScale,
      0,
      1.5,
    ),
    foliageCardsPerCluster: clamp(
      Math.round(
        Number(traits.foliageCardsPerCluster ?? 7)
          * Math.sqrt(Math.max(0.05, foliageDensityScale)),
      ),
      1,
      16,
    ),
    foliageCardSizeRange: baseCardRange.map((value) => (
      Number(value) * foliageScale
    )),
    foliageClusterRadius: clamp(
      Number(effective['foliage.dispersion'])
        || Number(traits.foliageClusterRadius)
        || 0.5,
      0.03,
      2.5,
    ),
    foliageRotationJitter: clamp(Number(effective['foliage.rotationJitter']), 0, 1),
    foliageRotationOffset: Number(effective['foliage.rotationOffset']) || 0,
    foliageDeformation: clamp(Number(effective['foliage.deformation']), 0, 2),
    foliageScaleJitter: clamp(Number(effective['foliage.scaleJitter']), 0, 2),
    foliageWeldDistance: Math.max(0, Number(effective['foliage.weldDistance']) || 0),
    foliageCullInterior: Boolean(effective['foliage.cullInterior']),
    foliageInteriorThreshold: Math.max(
      0,
      Number(effective['foliage.interiorThreshold']) || 0,
    ),
    foliageCullExterior: Boolean(effective['foliage.cullExterior']),
    foliageExteriorThreshold: Math.max(
      0,
      Number(effective['foliage.exteriorThreshold']) || 0,
    ),
    foliageGeometryVariant: effective['foliage.geometryVariant'],
    foliageCenterOnBranches: Boolean(effective['foliage.centerOnBranches']),
    foliageSubdivisions: clamp(
      Math.round(Number(effective['foliage.subdivisions']) || 0),
      0,
      6,
    ),
    foliageHeightScaleBias: clamp(
      Number(effective['foliage.heightScaleBias']),
      -1,
      1,
    ),
    foliageWidth: clamp(Number(effective['foliage.width']), 0.05, 4),
    preserveCustomFoliageMaterials: Boolean(
      effective['foliage.preserveCustomMaterials'],
    ),
    foliageDensityScale,
    foliageFirstBranchOrder: clamp(
      Math.round(Number(effective['foliage.firstBranchOrder'])),
      0,
      4,
    ),
    individualBroadleafCards: profile.engine === 'woody-axis'
      && profile.foliageOrgan === 'broad-leaf',
    reproductiveDistribution: effective['reproductive.distribution'],
    reproductiveDensity: Math.max(0, Number(effective['reproductive.density']) || 0),
    reproductiveUseCustomGeometry: Boolean(
      effective['reproductive.useCustomGeometry'],
    ),
    reproductiveScale: Math.max(0.001, Number(effective['reproductive.scale']) || 0.1),
    reproductiveCoreForm: effective['reproductive.coreForm'],
    reproductiveCoreRadius: Math.max(
      0.01,
      Number(effective['reproductive.coreRadius']) || 0.45,
    ),
    reproductiveCoreWidth: Math.max(
      0.01,
      Number(effective['reproductive.coreWidth']) || 0.8,
    ),
    reproductivePetalForm: effective['reproductive.petalForm'],
    reproductivePetalScale: Math.max(
      0.01,
      Number(effective['reproductive.petalScale']) || 1,
    ),
    reproductivePetalCount: clamp(
      Math.round(Number(effective['reproductive.petalCount']) || 7),
      1,
      64,
    ),
    reproductivePetalInclination: Number(effective['reproductive.petalInclination']) || 0,
    reproductivePetalLateralInclination:
      Number(effective['reproductive.petalLateralInclination']) || 0,
    reproductivePetalBelly: Number(effective['reproductive.petalBelly']) || 0,
    reproductivePetalWidth: Math.max(
      0.02,
      Number(effective['reproductive.petalWidth']) || 1,
    ),
    reproductivePetalEdge: Number(effective['reproductive.petalEdge']) || 0,
    reproductiveExtraPetalLayers: clamp(
      Math.round(Number(effective['reproductive.extraPetalLayers']) || 0),
      0,
      8,
    ),
    reproductiveExtraPetalAngle: Number(effective['reproductive.extraPetalAngle']) || 0,
    reproductiveStamenCount: clamp(
      Math.round(Number(effective['reproductive.stamenCount']) || 0),
      0,
      96,
    ),
    reproductiveStamenLength: Math.max(
      0,
      Number(effective['reproductive.stamenLength']) || 0,
    ),
    reproductivePetalResolution: clamp(
      Math.round(Number(effective['reproductive.petalResolution']) || 3),
      3,
      32,
    ),
    reproductiveCoreResolution: clamp(
      Math.round(Number(effective['reproductive.coreResolution']) || 3),
      3,
      32,
    ),
    reproductiveStamenResolution: clamp(
      Math.round(Number(effective['reproductive.stamenResolution']) || 3),
      3,
      16,
    ),
    realizeInstances: Boolean(effective['output.realizeInstances']),
    rootShape: Number(effective['roots.shape']) || 0,
    trunkSections: clamp(
      Math.round(Number(effective['resolution.trunkPathSteps']) / 3),
      6,
      24,
    ),
    branchSections: clamp(
      Math.round(Number(effective['resolution.branchPathSteps']) / 3),
      3,
      10,
    ),
    radialSegments,
    branchRadialSegments,
    barkColor: Array.isArray(effective['appearance.barkColor'])
      ? [...effective['appearance.barkColor']]
      : [0.2, 0.105, 0.045],
    mossEnabled: Boolean(effective['appearance.mossEnabled']),
    mossColor: Array.isArray(effective['appearance.mossColor'])
      ? [...effective['appearance.mossColor']]
      : [0.18, 0.32, 0.12],
    mossScale: Math.max(0.01, Number(effective['appearance.mossScale']) || 1),
    leafTextureDensity: Math.max(
      0.05,
      Number(effective['appearance.leafTextureDensity']) || 1,
    ),
    leafColorA: Array.isArray(effective['appearance.leafColorA'])
      ? [...effective['appearance.leafColorA']]
      : null,
    leafColorB: Array.isArray(effective['appearance.leafColorB'])
      ? [...effective['appearance.leafColorB']]
      : null,
    leafGradientEnabled: Boolean(effective['appearance.leafGradientEnabled']),
    leafGradientMode: effective['appearance.leafGradientMode'],
    leafTranslucency: clamp(Number(effective['appearance.leafTranslucency']), 0, 1),
    leafEmission: Math.max(0, Number(effective['appearance.leafEmission']) || 0),
    flowerColorA: Array.isArray(effective['appearance.flowerColorA'])
      ? [...effective['appearance.flowerColorA']]
      : null,
    flowerColorB: Array.isArray(effective['appearance.flowerColorB'])
      ? [...effective['appearance.flowerColorB']]
      : null,
    flowerCoreColor: Array.isArray(effective['appearance.flowerCoreColor'])
      ? [...effective['appearance.flowerCoreColor']]
      : null,
    flowerStamenColor: Array.isArray(effective['appearance.flowerStamenColor'])
      ? [...effective['appearance.flowerStamenColor']]
      : null,
    outlineEnabled: Boolean(effective['appearance.outlineEnabled']),
    outlineWidth: Math.max(0, Number(effective['appearance.outlineWidth']) || 0),
    outlineColor: Array.isArray(effective['appearance.outlineColor'])
      ? [...effective['appearance.outlineColor']]
      : [0.04, 0.035, 0.03],
    trunkTileScale: Math.max(0.01, Number(effective['mapping.trunkTileScale']) || 1),
    trunkStretch: Math.max(0.01, Number(effective['mapping.trunkStretch']) || 1),
    branchTileScale: Math.max(0.01, Number(effective['mapping.branchTileScale']) || 1),
    branchStretch: Math.max(0.01, Number(effective['mapping.branchStretch']) || 1),
    leafTileScale: Math.max(0.01, Number(effective['mapping.leafTileScale']) || 1),
    mappingDebugChecker: Boolean(effective['mapping.debugChecker']),
    motionSeamless: Boolean(effective['motion.seamless']),
    motionLoopFrames: Math.max(1, Math.round(Number(effective['motion.loopFrames']) || 120)),
    motionUsesDirectionObject: Boolean(effective['motion.useDirectionObject']),
    sheddingEnabled: Boolean(effective['shedding.enabled']),
    sheddingScale: Math.max(0.01, Number(effective['shedding.scale']) || 1),
    sheddingGeometryVariant: effective['shedding.geometryVariant'],
    sheddingPreserveCustomMaterials: Boolean(
      effective['shedding.preserveCustomMaterials'],
    ),
    sheddingBurstCount: Math.max(
      0,
      Math.round(Number(effective['shedding.burstCount']) || 0),
    ),
    sheddingBurstInterval: Math.max(
      0.01,
      Number(effective['shedding.burstInterval']) || 1,
    ),
    sheddingFallSpeed: Math.max(0, Number(effective['shedding.fallSpeed']) || 0),
    sheddingWindInfluence: Math.max(
      0,
      Number(effective['shedding.windInfluence']) || 0,
    ),
    sheddingFade: Boolean(effective['shedding.fade']),
    sheddingLifetime: Math.max(0.01, Number(effective['shedding.lifetime']) || 1),
    axisBudget: clamp(
      Math.round(
        Number(traits.axisBudget ?? 360) * densityScale,
      ),
      80,
      900,
    ),
  };
  const explicitControlIds = Object.keys(options?.woodyBaseline?.controls ?? {});
  const training = options?.woodyBaseline?.trainingProfile;
  const activeGroups = new Set([
    ...explicitControlIds,
    ...Object.keys(training?.multipliers ?? {}),
    ...Object.keys(training?.overrides ?? {}),
  ].map((id) => id.split('.')[0]));
  if ((training?.orderDelta ?? 0) !== 0) activeGroups.add('branching');
  const traitKeysByGroup = {
    dimensions: ['height', 'trunkRadius'],
    trunk: ['crownLeaderCount', 'stemCount', 'bend', 'twist'],
    axisNoise: ['gnarl', 'gnarliness', 'bend', 'lean', 'trunkNoise', 'branchNoise'],
    branching: [
      'crownWidth', 'crownDepth', 'crownMode', 'levels', 'children',
      'branchStart', 'branchSpawnEnd', 'branchAngle', 'phyllotaxisAngle',
      'evenBranchDistribution', 'lengthRatio', 'radiusRatio', 'pipeExponent',
      'branchSag', 'tipUpturn', 'axisBudget',
    ],
    foliage: [
      'canopyDensity', 'foliageCardsPerCluster', 'foliageCardSizeRange',
      'foliageClusterRadius', 'foliageRotationJitter', 'foliageDeformation',
      'foliageScaleJitter',
    ],
    roots: ['baseFlare', 'rootScale', 'rootComplexity', 'rootVerticalComplexity'],
    resolution: [
      'trunkSections', 'branchSections', 'radialSegments', 'branchRadialSegments',
    ],
  };
  // Species baselines are the evaluator's complete input, not a dormant set
  // of UI suggestions. Every inherited relationship drives generation by
  // default; explicit Tree Lab edits replace individual values.
  const activeTraits = mappedTraits;
  const motionActive = activeGroups.has('motion');
  return Object.freeze({
    controls: Object.freeze(effective),
    traits: Object.freeze(activeTraits),
    radialSegments,
    canopy: Object.freeze({
      cardSizeRange: mappedTraits.foliageCardSizeRange,
      cardsPerCluster: mappedTraits.foliageCardsPerCluster,
      clusterRadius: mappedTraits.foliageClusterRadius,
    }),
    canopyColor: Array.isArray(effective['appearance.leafColorA'])
      ? Object.freeze([...effective['appearance.leafColorA']])
      : null,
    wind: Object.freeze(motionActive ? {
      windDirection: [
        Math.cos(Number(effective['motion.heading']) || 0),
        Math.sin(Number(effective['motion.heading']) || 0),
      ],
      windSpeed: Math.max(0, Number(effective['motion.speed']) || 0),
      windStrength: effective['motion.enabled']
        ? Math.max(0, Number(effective['motion.strength']) || 0)
        : 0,
    } : {}),
  });
}

export function woodyBaselineControlLabel(control) {
  const name = typeof control === 'string'
    ? control.split('.').at(-1)
    : control.name;
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

export function woodyBaselineSuggestedValue(control) {
  const spec = typeof control === 'string'
    ? WOODY_BASELINE_CONTROL_BY_ID[control]
    : control;
  if (Object.hasOwn(DEFAULT_CONTROLS, spec.id)) {
    return structuredClone(DEFAULT_CONTROLS[spec.id]);
  }
  const options = WOODY_BASELINE_ENUM_OPTIONS[spec.id];
  if (options) return options[0];
  if (spec.valueType === 'boolean') return false;
  if (spec.valueType === 'integer') return 1;
  if (spec.valueType === 'color') return [0.25, 0.5, 0.2];
  return 1;
}

export function validateWoodyBaselineControlValues(values, {
  allowLocalResources = false,
} = {}) {
  const errors = [];
  if (values === undefined) return { ok: true, value: {} };
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, errors: ['woodyBaseline.controls must be an object.'] };
  }
  const normalized = {};
  for (const [id, value] of Object.entries(values)) {
    const control = WOODY_BASELINE_CONTROL_BY_ID[id];
    if (!control) {
      errors.push(`woodyBaseline.controls contains unknown control "${id}".`);
      continue;
    }
    if (!control.recipe && !allowLocalResources) {
      errors.push(`woodyBaseline control "${id}" is local-only and cannot be serialized.`);
      continue;
    }
    if (control.valueType === 'number' && !Number.isFinite(value)) {
      errors.push(`woodyBaseline control "${id}" must be a finite number.`);
      continue;
    }
    if (control.valueType === 'integer' && !Number.isInteger(value)) {
      errors.push(`woodyBaseline control "${id}" must be an integer.`);
      continue;
    }
    if (control.valueType === 'boolean' && typeof value !== 'boolean') {
      errors.push(`woodyBaseline control "${id}" must be a boolean.`);
      continue;
    }
    if (control.valueType === 'color'
      && !(Array.isArray(value) && value.length >= 3
        && value.slice(0, 4).every(Number.isFinite))) {
      errors.push(`woodyBaseline control "${id}" must be an RGB or RGBA numeric array.`);
      continue;
    }
    if (control.valueType === 'enum') {
      const options = WOODY_BASELINE_ENUM_OPTIONS[id] ?? [];
      if (typeof value !== 'string' || !options.includes(value)) {
        errors.push(
          `woodyBaseline control "${id}" must be one of: ${options.join(', ')}.`,
        );
        continue;
      }
    }
    normalized[id] = JSON.parse(JSON.stringify(value));
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: normalized };
}
