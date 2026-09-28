// Public authoring schema for one atmospheric-condition document. These are
// world-state inputs consumed by Sky, Cloud, Atmosphere, Weather Rendering,
// Lighting, Water, materials, and audio. Renderer algorithms and source
// textures intentionally do not enter this schema.

const field = (
  group,
  path,
  label,
  description,
  {
    defaultValue,
    range = { max: 1, min: 0, step: 0.01 },
    type = 'number',
  } = {},
) => Object.freeze({
  defaultValue,
  description,
  group,
  id: `${group}.${path}`,
  key: path,
  label,
  path,
  ...(type === 'number' ? { range } : {}),
  type,
});

const amount = { max: 1, min: 0, step: 0.01 };
const color = { max: 10, min: 0, step: 0.01 };
const signed = { max: 5, min: -5, step: 0.05 };

export const ATMOSPHERIC_CONDITION_GROUPS = Object.freeze([
  Object.freeze({
    description: 'Distance-based air tint and the four cyclic time anchors.',
    id: 'air',
    label: 'Air',
  }),
  Object.freeze({
    description: 'Cloud-ceiling coverage and visibility modulation supplied to sky and cloud renderers.',
    id: 'ceiling',
    label: 'Ceiling',
  }),
  Object.freeze({
    description: 'Depth, local mist, and volume-fog state supplied to the atmosphere renderer.',
    id: 'fog',
    label: 'Fog',
  }),
  Object.freeze({
    description: 'Normalized rain, flake, and ember state. Source textures and particle shaders live in their own labs.',
    id: 'precipitation',
    label: 'Precipitation',
  }),
  Object.freeze({
    description: 'Condition-driven sun, moon, and ambient modulation. The lighting style remains independently authored.',
    id: 'light',
    label: 'Light',
  }),
  Object.freeze({
    description: 'Electrical-event rates and colors. Bolt assets and weather rendering remain separate artifacts.',
    id: 'electric',
    label: 'Electric',
  }),
  Object.freeze({
    description: 'Wind range and atmospheric streak state published to world systems.',
    id: 'flow',
    label: 'Flow',
  }),
]);

export const ATMOSPHERIC_CONDITION_FIELD_SCHEMA = Object.freeze({
  air: Object.freeze({
    mix: field('air', 'air.mix', 'Style mix', 'Blend from the active atmosphere style toward this condition.', { defaultValue: 0 }),
    strength: field('air', 'air.strength', 'Strength', 'Condition atmosphere strength.', {
      defaultValue: 0.99,
      range: { max: 4, min: 0, step: 0.01 },
    }),
    range: field('air', 'air.range', 'Range', 'Maximum atmospheric range in world meters.', {
      defaultValue: 30000,
      range: { max: 50000, min: 100, step: 100 },
    }),
    falloff: field('air', 'air.falloff', 'Falloff', 'Distance falloff exponent.', {
      defaultValue: 1,
      range: { max: 8, min: 0.05, step: 0.05 },
    }),
    noon: field('air', 'air.tint.noon', 'Day tint', 'Air tint at the Day reference anchor (RGBA/HDR).', {
      defaultValue: [0.06301, 0.116971, 0.187821, 1],
      range: color,
      type: 'vector4',
    }),
    dusk: field('air', 'air.tint.dusk', 'Sunset tint', 'Air tint at the Sunset reference anchor (RGBA/HDR).', {
      defaultValue: [0.061246, 0.093059, 0.147027, 1],
      range: color,
      type: 'vector4',
    }),
    midnight: field('air', 'air.tint.midnight', 'Night tint', 'Air tint at the Night reference anchor (RGBA/HDR).', {
      defaultValue: [0.020289, 0.048172, 0.099899, 1],
      range: color,
      type: 'vector4',
    }),
    dawn: field('air', 'air.tint.dawn', 'Dawn tint', 'Air tint at the Dawn reference anchor (RGBA/HDR).', {
      defaultValue: [0.072272, 0.084376, 0.099899, 1],
      range: color,
      type: 'vector4',
    }),
  }),
  ceiling: Object.freeze({
    amount: field('ceiling', 'ceiling.amount', 'Ceiling amount', 'Coverage of the condition-driven cloud ceiling.', { defaultValue: 0 }),
    tint: field('ceiling', 'ceiling.tint', 'Ceiling tint', 'Cloud-ceiling tint (RGBA/HDR).', {
      defaultValue: [0.48515, 0.571125, 1, 1],
      range: color,
      type: 'vector4',
    }),
    cloudOcclusion: field('ceiling', 'ceiling.cloudOcclusion', 'Cloud occlusion', 'How much the condition hides authored cloud layers.', { defaultValue: 0 }),
    celestialOcclusion: field('ceiling', 'ceiling.celestialOcclusion', 'Celestial occlusion', 'How much the ceiling hides the sun, moon, and stars.', { defaultValue: 0 }),
    starsVisible: field('ceiling', 'ceiling.starsVisible', 'Stars visible', 'Whether the condition permits the sky renderer to show stars.', {
      defaultValue: true,
      type: 'boolean',
    }),
  }),
  fog: Object.freeze({
    depthAmount: field('fog', 'depthFog.amount', 'Depth fog', 'Normalized depth-fog contribution.', { defaultValue: 0 }),
    depthTint: field('fog', 'depthFog.tint', 'Depth tint', 'Depth-fog tint (RGBA/HDR).', {
      defaultValue: [0.119538, 0.198069, 0.3564, 1],
      range: color,
      type: 'vector4',
    }),
    mistAmount: field('fog', 'mist.amount', 'Mist amount', 'Normalized local-mist amount.', { defaultValue: 0 }),
    mistTint: field('fog', 'mist.tint', 'Mist tint', 'Mist tint and opacity (RGBA/HDR).', {
      defaultValue: [0.412543, 0.545725, 1, 0.06],
      range: color,
      type: 'vector4',
    }),
    mistGravity: field('fog', 'mist.gravity', 'Mist gravity', 'Vertical drift applied to mist particles.', {
      defaultValue: 0,
      range: signed,
    }),
    volumeMix: field('fog', 'volumeFog.mix', 'Volume mix', 'Blend into volumetric fog.', { defaultValue: 0 }),
    volumeDensity: field('fog', 'volumeFog.density', 'Volume density', 'Normalized volumetric density.', { defaultValue: 0 }),
    volumeTint: field('fog', 'volumeFog.tint', 'Volume tint', 'Volumetric-fog tint (RGBA/HDR).', {
      defaultValue: [0.06301, 0.116971, 0.187821, 1],
      range: color,
      type: 'vector4',
    }),
  }),
  precipitation: Object.freeze({
    rainAmount: field('precipitation', 'rain.amount', 'Rain', 'Normalized rain amount.', { defaultValue: 0 }),
    rainTint: field('precipitation', 'rain.tint', 'Rain tint', 'Rain tint and opacity (RGBA/HDR).', {
      defaultValue: [0.701102, 0.947307, 1, 0.7],
      range: color,
      type: 'vector4',
    }),
    flakeAmount: field('precipitation', 'flakes.amount', 'Flakes', 'Normalized snow, ash, or other flake amount.', { defaultValue: 0 }),
    flakeTint: field('precipitation', 'flakes.tint', 'Flake tint', 'Flake tint and opacity (RGBA/HDR).', {
      defaultValue: [1.35, 1.425, 1.5, 0.6],
      range: color,
      type: 'vector4',
    }),
    flakeSize: field('precipitation', 'flakes.size', 'Flake size', 'Relative flake size.', {
      defaultValue: 1,
      range: { max: 5, min: 0.05, step: 0.05 },
    }),
    flakeTurbulence: field('precipitation', 'flakes.turbulence', 'Flake turbulence', 'Lateral flake turbulence.', {
      defaultValue: 1.2,
      range: { max: 5, min: 0, step: 0.05 },
    }),
    flakeGravity: field('precipitation', 'flakes.gravity', 'Flake gravity', 'Vertical flake acceleration.', {
      defaultValue: 0,
      range: signed,
    }),
    emberAmount: field('precipitation', 'embers.amount', 'Embers', 'Normalized ember amount.', { defaultValue: 0 }),
    emberTint: field('precipitation', 'embers.tint', 'Ember tint', 'Ember tint and opacity (RGBA/HDR).', {
      defaultValue: [1, 0.381326, 0.168269, 1],
      range: color,
      type: 'vector4',
    }),
    emberSize: field('precipitation', 'embers.size', 'Ember size', 'Relative ember size.', {
      defaultValue: 1,
      range: { max: 5, min: 0.05, step: 0.05 },
    }),
    emberTurbulence: field('precipitation', 'embers.turbulence', 'Ember turbulence', 'Lateral ember turbulence.', {
      defaultValue: 1,
      range: { max: 5, min: 0, step: 0.05 },
    }),
  }),
  light: Object.freeze({
    sunLevel: field('light', 'light.sunLevel', 'Sun level', 'Condition multiplier for the active sun style.', {
      defaultValue: 1,
      range: { max: 2, min: 0, step: 0.01 },
    }),
    moonLevel: field('light', 'light.moonLevel', 'Moon level', 'Condition multiplier for the active moon style.', {
      defaultValue: 1,
      range: { max: 2, min: 0, step: 0.01 },
    }),
    ambientLevel: field('light', 'light.ambientLevel', 'Ambient level', 'Condition multiplier for ambient light.', {
      defaultValue: 1,
      range: { max: 2, min: 0, step: 0.01 },
    }),
    ambientTint: field('light', 'light.ambientTint', 'Ambient tint', 'Condition ambient-light tint (RGBA/HDR).', {
      defaultValue: [0.309469, 0.723055, 0.955974, 1],
      range: color,
      type: 'vector4',
    }),
    colorMix: field('light', 'light.colorMix', 'Color mix', 'Blend from lighting style colors toward condition colors.', { defaultValue: 0 }),
    sunTint: field('light', 'light.sunTint', 'Sun tint', 'Condition sun tint (RGBA/HDR).', {
      defaultValue: [1, 1, 1, 1],
      range: color,
      type: 'vector4',
    }),
    moonTint: field('light', 'light.moonTint', 'Moon tint', 'Condition moon tint (RGBA/HDR).', {
      defaultValue: [1, 1, 1, 1],
      range: color,
      type: 'vector4',
    }),
  }),
  electric: Object.freeze({
    farArc: field('electric', 'electric.farArc', 'Far arc rate', 'Distant electrical-arc rate.', {
      defaultValue: 0,
      range: { max: 6, min: 0, step: 0.01 },
    }),
    farFlash: field('electric', 'electric.farFlash', 'Far flash rate', 'Distant cloud-flash rate.', {
      defaultValue: 0,
      range: { max: 6, min: 0, step: 0.01 },
    }),
    nearRate: field('electric', 'electric.nearRate', 'Near strike rate', 'Nearby strike-event rate.', { defaultValue: 0 }),
    tintLow: field('electric', 'electric.tintLow', 'Low tint', 'Low electrical tint (RGBA/HDR).', {
      defaultValue: [0.039546, 0.198069, 1, 1],
      range: color,
      type: 'vector4',
    }),
    tintHigh: field('electric', 'electric.tintHigh', 'High tint', 'High electrical tint (RGBA/HDR).', {
      defaultValue: [0.039546, 0.072272, 1, 1],
      range: color,
      type: 'vector4',
    }),
  }),
  flow: Object.freeze({
    minimum: field('flow', 'flow.minimum', 'Minimum speed', 'Minimum condition wind speed.', {
      defaultValue: 1,
      range: { max: 20, min: 0, step: 0.1 },
    }),
    maximum: field('flow', 'flow.maximum', 'Maximum speed', 'Maximum condition wind speed.', {
      defaultValue: 3,
      range: { max: 20, min: 0, step: 0.1 },
    }),
    streakAmount: field('flow', 'flow.streakAmount', 'Streak amount', 'Normalized atmospheric flow-streak amount.', {
      defaultValue: 1,
      range: { max: 2, min: 0, step: 0.01 },
    }),
    streakOpacity: field('flow', 'flow.streakOpacity', 'Streak opacity', 'Atmospheric flow-streak opacity.', {
      defaultValue: 0.3,
      range: amount,
    }),
  }),
});

export const ATMOSPHERIC_CONDITION_FIELD_COUNT = Object.values(
  ATMOSPHERIC_CONDITION_FIELD_SCHEMA,
).reduce((count, group) => count + Object.keys(group).length, 0);
