// Canonical settings and field metadata for the ambient-VFX cluster
// (petals, falling leaves, fireflies, pollen motes, ground mist). Follows the
// library-wide convention: DEFAULT_AMBIENTFX_SETTINGS holds grouped values,
// AMBIENTFX_SETTING_GROUPS + AMBIENTFX_SETTING_FIELD_SCHEMA drive the debug
// panel and the generated settings reference. All five effects are presets
// over one shared particle backbone (see particleBackbone.js), so the shared
// group carries the wind/window state every effect reads.
//
// The wind trio (windDirection/windSpeed/windStrength) deliberately matches
// DEFAULT_GRASS_SETTINGS so a host can pipe the same values to grass, trees,
// and ambient fx and everything blows the same way.

/** Effect ids in backbone kind order — the per-instance `kind` attribute. */
export const AMBIENTFX_EFFECT_IDS = Object.freeze(['petals', 'leaves', 'fireflies', 'pollen', 'mist']);

/** Named time gates. Hours follow environmentTimeOfDay (sun up ≈ 6–18). */
export const AMBIENTFX_TIME_GATES = Object.freeze(['day', 'night', 'duskNight', 'dawnDusk', 'any']);

function ramp(hour, start, end) {
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (hour - start) / (end - start)));
}

/**
 * Pure 0..1 weight of a named time gate at `hour` (0–24, wraps). Keyed to the
 * environmentTimeOfDay day structure so fireflies ramp with the existing
 * clock instead of inventing a second one. Deliberately reaches EXACT 0/1 in
 * the plateaus (fireflies are hard-off at noon, pollen hard-off at night) so
 * gated effects cost nothing outside their hours.
 */
export function timeGateWeight(gate, hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  const day = ramp(h, 6, 8) * (1 - ramp(h, 17, 19));
  switch (gate) {
    case 'day': return day;
    case 'night': return h < 12 ? 1 - ramp(h, 4.5, 6.5) : ramp(h, 18.5, 20.5);
    case 'duskNight': return h > 12 ? ramp(h, 17.5, 19.5) : 1 - ramp(h, 4.5, 6.5);
    // Two soft shoulders around sunrise/sunset; mist burns off by mid-morning.
    case 'dawnDusk': return Math.max(
      ramp(h, 3.5, 5.5) * (1 - ramp(h, 7.5, 9.5)),
      ramp(h, 16.5, 18.5) * (1 - ramp(h, 21, 23)),
    );
    default: return 1;
  }
}

/**
 * Default ambient-fx settings. Densities are particles per m³ of each
 * effect's own emission domain (window disk × its height band, or bloom
 * volumes for canopy-bound effects); at the default 45 m window they total
 * ≈ 4k live particles, so 3× density stays well inside the 20k budget.
 */
export const DEFAULT_AMBIENTFX_SETTINGS = Object.freeze({
  shared: Object.freeze({
    windDirection: Object.freeze([1, 0.3]),
    windSpeed: 1.0,
    windStrength: 0.16,
    sunDirection: Object.freeze([0.35, 0.72, 0.42]),
    windowRadius: 45,
    maxParticles: 20000,
  }),
  petals: Object.freeze({
    enabled: true,
    density: 0.03,
    canopyDensity: 4.5,
    sizeRange: Object.freeze([0.06, 0.11]),
    colorA: Object.freeze([1.0, 0.52, 0.68]),
    colorB: Object.freeze([1.0, 0.75, 0.84]),
    emitHeight: Object.freeze([2, 9]),
    flutter: 1.0,
    windResponse: 1.0,
    gate: 'day',
  }),
  leaves: Object.freeze({
    enabled: true,
    density: 0.022,
    canopyDensity: 3.2,
    sizeRange: Object.freeze([0.09, 0.16]),
    colorA: Object.freeze([0.93, 0.64, 0.2]),
    colorB: Object.freeze([0.78, 0.4, 0.13]),
    emitHeight: Object.freeze([2, 10]),
    tumble: 1.0,
    windResponse: 1.35,
    gate: 'any',
  }),
  fireflies: Object.freeze({
    enabled: true,
    density: 0.045,
    sizeRange: Object.freeze([0.13, 0.2]),
    color: Object.freeze([1.0, 0.87, 0.42]),
    hoverHeight: Object.freeze([0.25, 2.2]),
    hoverRadius: 0.9,
    blinkSpeed: 1.0,
    intensity: 1.0,
    windResponse: 0.1,
    gate: 'duskNight',
  }),
  pollen: Object.freeze({
    enabled: true,
    density: 0.06,
    sizeRange: Object.freeze([0.045, 0.085]),
    color: Object.freeze([1.0, 0.93, 0.72]),
    hoverHeight: Object.freeze([0.3, 2.6]),
    driftRadius: 1.3,
    backlitStrength: 1.0,
    windResponse: 0.5,
    gate: 'day',
  }),
  mist: Object.freeze({
    enabled: true,
    density: 0.0045,
    sizeRange: Object.freeze([1.6, 3.0]),
    color: Object.freeze([0.84, 0.9, 0.97]),
    opacity: 0.34,
    scrollSpan: 26,
    marginWidth: 7,
    windResponse: 1.0,
    gate: 'dawnDusk',
  }),
});

export const AMBIENTFX_SETTING_GROUPS = Object.freeze([
  Object.freeze({
    id: 'shared',
    label: 'Shared',
    description: 'Wind, sun, and the follow-window every effect emits into. Match windDirection/windSpeed/windStrength with the grass and tree wind so the whole world blows the same way.',
  }),
  Object.freeze({
    id: 'petals',
    label: 'Petals',
    description: 'Flutter-falling blossom petals. Emit from registered bloom volumes (flowering canopies) when any exist, otherwise from the open air above the ground.',
  }),
  Object.freeze({
    id: 'leaves',
    label: 'Falling Leaves',
    description: 'Tumble-falling leaves with strong gust response. Emit from bloom volumes tagged effect:"leaves", otherwise globally.',
  }),
  Object.freeze({
    id: 'fireflies',
    label: 'Fireflies',
    description: 'Hovering, blinking emissive motes over grass and shore margins. Unlit by design; they ramp with the time-of-day dusk.',
  }),
  Object.freeze({
    id: 'pollen',
    label: 'Pollen Motes',
    description: 'Slow curl-drifting dust motes, brightest looking toward the sun (backlit). Bind to flower masks via the effects config.',
  }),
  Object.freeze({
    id: 'mist',
    label: 'Ground Mist',
    description: 'Soft horizontal wisps scrolling with the wind, hugging water margins and low ground at dawn/dusk.',
  }),
]);

const gateField = {
  label: 'Time Gate',
  description: 'When the effect is visible; weights follow the environmentTimeOfDay hour.',
  type: 'select',
  options: [...AMBIENTFX_TIME_GATES],
  optionLabels: { any: 'Always', dawnDusk: 'Dawn & dusk', day: 'Day', duskNight: 'Dusk & night', night: 'Night' },
};
const densityField = (max, caption) => ({
  label: 'Density',
  description: caption,
  range: { min: 0, max, step: max / 200 },
});
const windResponseField = {
  label: 'Wind Response',
  description: 'Multiplier on the shared wind drift for this effect.',
  range: { min: 0, max: 3, step: 0.05 },
};

const FIELD_DEFINITIONS = Object.freeze({
  shared: Object.freeze({
    windDirection: {
      label: 'Wind Direction',
      description: 'Horizontal (XZ) heading the wind blows toward — share with grass/trees. Magnitude is ignored.',
      type: 'vector2',
    },
    windSpeed: {
      label: 'Wind Speed',
      description: 'How fast wind-driven motion oscillates and mist scrolls.',
      range: { min: 0, max: 4, step: 0.01 },
    },
    windStrength: {
      label: 'Wind Strength',
      description: 'How far particles drift downwind.',
      range: { min: 0, max: 1, step: 0.005 },
    },
    sunDirection: {
      label: 'Sun Direction',
      description: 'World-space direction toward the sun (normalized on apply); drives the pollen backlight and petal sheen.',
      type: 'vector3',
    },
    windowRadius: {
      label: 'Window Radius',
      description: 'Meters of the follow window particles exist in around the follow target. Construction-only.',
      range: { min: 15, max: 120, step: 1 },
    },
    maxParticles: {
      label: 'Max Particles',
      description: 'Hard budget; effect densities are scaled down proportionally when their sum would exceed it. Construction-only.',
      range: { min: 1000, max: 40000, step: 500 },
    },
  }),
  petals: Object.freeze({
    enabled: { label: 'Enabled', description: 'Master toggle for the effect.', type: 'boolean' },
    density: densityField(0.15, 'Petals per m³ of the emission volume.'),
    canopyDensity: {
      label: 'Canopy Density',
      description: 'Petals per m³ inside registered bloom volumes (crowns shed far more than open air).',
      range: { min: 0, max: 20, step: 0.1 },
    },
    sizeRange: { label: 'Size Range', description: 'Min/max petal size in meters.', type: 'vector2' },
    colorA: { label: 'Color A', description: 'Primary petal color.', type: 'color' },
    colorB: { label: 'Color B', description: 'Secondary petal color; each petal picks between the two.', type: 'color' },
    emitHeight: {
      label: 'Emit Height',
      description: 'Min/max meters above ground petals spawn at when not bound to canopies. Construction-only.',
      type: 'vector2',
    },
    flutter: { label: 'Flutter', description: 'Side-to-side rocking amplitude while falling.', range: { min: 0, max: 3, step: 0.05 } },
    windResponse: windResponseField,
    gate: gateField,
  }),
  leaves: Object.freeze({
    enabled: { label: 'Enabled', description: 'Master toggle for the effect.', type: 'boolean' },
    density: densityField(0.15, 'Leaves per m³ of the emission volume.'),
    canopyDensity: {
      label: 'Canopy Density',
      description: 'Leaves per m³ inside bloom volumes tagged effect:"leaves".',
      range: { min: 0, max: 20, step: 0.1 },
    },
    sizeRange: { label: 'Size Range', description: 'Min/max leaf size in meters.', type: 'vector2' },
    colorA: { label: 'Color A', description: 'Primary leaf color.', type: 'color' },
    colorB: { label: 'Color B', description: 'Secondary leaf color; each leaf picks between the two.', type: 'color' },
    emitHeight: {
      label: 'Emit Height',
      description: 'Min/max meters above ground leaves spawn at when not bound to canopies. Construction-only.',
      type: 'vector2',
    },
    tumble: { label: 'Tumble', description: 'Rotational tumbling speed while falling.', range: { min: 0, max: 3, step: 0.05 } },
    windResponse: windResponseField,
    gate: gateField,
  }),
  fireflies: Object.freeze({
    enabled: { label: 'Enabled', description: 'Master toggle for the effect.', type: 'boolean' },
    density: densityField(0.2, 'Fireflies per m³ of the near-ground hover band.'),
    sizeRange: { label: 'Size Range', description: 'Min/max glow-sprite size in meters.', type: 'vector2' },
    color: { label: 'Glow Color', description: 'Emissive glow color (unlit; never touched by scene lights).', type: 'color' },
    hoverHeight: { label: 'Hover Height', description: 'Min/max meters above ground fireflies hover at. Construction-only.', type: 'vector2' },
    hoverRadius: { label: 'Hover Radius', description: 'Meters of wander around each spawn point.', range: { min: 0, max: 4, step: 0.05 } },
    blinkSpeed: { label: 'Blink Speed', description: 'How fast the blink program pulses.', range: { min: 0, max: 4, step: 0.05 } },
    intensity: { label: 'Intensity', description: 'Emissive brightness multiplier.', range: { min: 0, max: 4, step: 0.05 } },
    windResponse: windResponseField,
    gate: gateField,
  }),
  pollen: Object.freeze({
    enabled: { label: 'Enabled', description: 'Master toggle for the effect.', type: 'boolean' },
    density: densityField(0.3, 'Motes per m³ of the near-ground drift band.'),
    sizeRange: { label: 'Size Range', description: 'Min/max mote size in meters.', type: 'vector2' },
    color: { label: 'Color', description: 'Mote color (additive, so it reads as light).', type: 'color' },
    hoverHeight: { label: 'Hover Height', description: 'Min/max meters above ground motes drift at. Construction-only.', type: 'vector2' },
    driftRadius: { label: 'Drift Radius', description: 'Meters of curl-drift wander around each spawn point.', range: { min: 0, max: 5, step: 0.05 } },
    backlitStrength: { label: 'Backlit Strength', description: 'Brightness boost when the camera looks toward the sun through the motes.', range: { min: 0, max: 3, step: 0.05 } },
    windResponse: windResponseField,
    gate: gateField,
  }),
  mist: Object.freeze({
    enabled: { label: 'Enabled', description: 'Master toggle for the effect.', type: 'boolean' },
    density: densityField(0.02, 'Wisps per m³ of the ground-hugging band — a few dozen quads, not thousands.'),
    sizeRange: { label: 'Size Range', description: 'Min/max wisp height in meters (width is ~3–5× the height).', type: 'vector2' },
    color: { label: 'Color', description: 'Wisp color.', type: 'color' },
    opacity: { label: 'Opacity', description: 'Peak alpha at a wisp center; the sprite falls off softly from there.', range: { min: 0, max: 0.6, step: 0.01 } },
    scrollSpan: { label: 'Scroll Span', description: 'Meters a wisp travels downwind before wrapping (fades at both ends).', range: { min: 5, max: 60, step: 1 } },
    marginWidth: {
      label: 'Margin Width',
      description: 'Meters of |ground − waterLevel| that count as the water-margin emission band. Construction-only.',
      range: { min: 1, max: 20, step: 0.5 },
    },
    windResponse: windResponseField,
    gate: gateField,
  }),
});

function createAmbientFxFieldMetadata(group, key, field) {
  const defaultValue = DEFAULT_AMBIENTFX_SETTINGS[group.id][key];
  return Object.freeze({
    defaultValue: Array.isArray(defaultValue) ? [...defaultValue] : defaultValue,
    description: field.description,
    group: group.id,
    id: `${group.id}.${key}`,
    key,
    label: field.label,
    optionLabels: field.optionLabels ?? null,
    options: field.options ?? null,
    range: field.range ?? null,
    serializable: true,
    type: field.type ?? (typeof defaultValue === 'boolean' ? 'boolean'
      : typeof defaultValue === 'number' ? 'number' : 'text'),
  });
}

export const AMBIENTFX_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    AMBIENTFX_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(FIELD_DEFINITIONS[group.id] ?? {})
            .map(([key, field]) => [key, createAmbientFxFieldMetadata(group, key, field)]),
        ),
      ),
    ]),
  ),
);

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
  );
  return value;
}

export function cloneAmbientFxSettings(settings = DEFAULT_AMBIENTFX_SETTINGS) {
  return cloneValue(settings);
}

function clampNumber(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * Normalizes nested partial overrides over the defaults; unknown keys are
 * dropped, malformed values fall back. Presets resolve in
 * `createAmbientFx({ preset })` (see ambientFxPresets.js) — this function is
 * the plain merge/validate step.
 */
export function createAmbientFxSettings(overrides = {}) {
  const result = cloneAmbientFxSettings(DEFAULT_AMBIENTFX_SETTINGS);
  for (const groupId of Object.keys(result)) {
    const group = overrides?.[groupId];
    if (!group || typeof group !== 'object') continue;
    for (const key of Object.keys(result[groupId])) {
      if (group[key] === undefined) continue;
      result[groupId][key] = cloneValue(group[key]);
    }
  }
  const shared = result.shared;
  shared.windowRadius = clampNumber(shared.windowRadius, 45, 10, 200);
  shared.maxParticles = Math.round(clampNumber(shared.maxParticles, 20000, 100, 200000));
  shared.windSpeed = clampNumber(shared.windSpeed, 1);
  shared.windStrength = clampNumber(shared.windStrength, 0.16, 0);
  for (const id of AMBIENTFX_EFFECT_IDS) {
    const effect = result[id];
    effect.enabled = Boolean(effect.enabled);
    effect.density = clampNumber(effect.density, 0, 0);
    effect.windResponse = clampNumber(effect.windResponse, 1, 0);
    if (!AMBIENTFX_TIME_GATES.includes(effect.gate)) {
      effect.gate = DEFAULT_AMBIENTFX_SETTINGS[id].gate;
    }
  }
  result.mist.opacity = clampNumber(result.mist.opacity, 0.34, 0, 1);
  return result;
}
