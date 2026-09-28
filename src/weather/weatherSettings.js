// Canonical, serializable settings for the weather-state coordinator. This
// document is deliberately not a shader: it drives current sky, light, fog,
// precipitation, water, vegetation, fauna, accumulation, and ambient state.
// Portable rendered surface appearance is owned separately by modules such as
// snowSurfaceShader.js under the same public weather package.

export const WEATHER_PRECIPITATION_TYPES = Object.freeze([
  'none',
  'rain',
  'snow',
  'sleet',
  'hail',
  'dust',
]);

export const DEFAULT_WEATHER_SETTINGS = Object.freeze({
  atmosphere: Object.freeze({
    ambientIntensity: 1,
    cloudCoverage: 0.18,
    cloudShadowCoverage: 0.35,
    cloudShadowScale: 0.012,
    cloudShadowStrength: 0.15,
    cloudSpeed: 1,
    fogColor: null,
    fogRangeScale: 1,
    skyDarkening: 0,
    skyDesaturation: 0,
    skyTint: Object.freeze([1, 1, 1]),
    sunIntensity: 1,
    sunTint: Object.freeze([1, 1, 1]),
  }),
  wind: Object.freeze({
    direction: Object.freeze([1, 0.3]),
    gustFrequency: 0.35,
    gustSpeed: 1,
    speed: 1,
    strength: 0.16,
  }),
  precipitation: Object.freeze({
    areaSize: 42,
    color: Object.freeze([0.8, 0.88, 0.95]),
    fallHeight: 24,
    intensity: 0,
    maxParticles: 8000,
    opacity: 0.5,
    size: 0.12,
    speed: 16,
    streakLength: 0.42,
    type: 'none',
  }),
  lightning: Object.freeze({
    color: Object.freeze([0.72, 0.82, 1]),
    duration: 0.22,
    enabled: false,
    intensity: 4,
    strikesPerMinute: 0,
  }),
  surface: Object.freeze({
    ice: 0,
    snowCover: 0,
    waterRippleRate: 0,
    waterWaveBoost: 0,
    wetness: 0,
  }),
});

export const WEATHER_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'atmosphere', label: 'Atmosphere', description: 'Clouds, sunlight, ambient light, sky tone, and fog.' }),
  Object.freeze({ id: 'wind', label: 'Wind', description: 'One wind field shared by precipitation, grass, flowers, trees, and ambient effects.' }),
  Object.freeze({ id: 'precipitation', label: 'Precipitation', description: 'GPU-looping rain, snow, sleet, hail, or airborne dust in a camera-following volume.' }),
  Object.freeze({ id: 'lightning', label: 'Lightning & Thunder', description: 'Seeded lightning flashes and thunder events for host audio.' }),
  Object.freeze({ id: 'surface', label: 'Surface Response', description: 'Normalized outputs for water agitation, ripples, wetness, snow cover, and ice.' }),
]);

const FIELDS = Object.freeze({
  atmosphere: Object.freeze({
    ambientIntensity: { label: 'Ambient Intensity', description: 'Multiplier for ambient and hemisphere lights.', range: { min: 0, max: 2, step: 0.01 } },
    cloudCoverage: { label: 'Cloud Coverage', description: 'Fraction of the procedural sky occupied by clouds.', range: { min: 0, max: 1, step: 0.01 } },
    cloudShadowCoverage: { label: 'Shadow Coverage', description: 'Coverage threshold for the shared cloud-shadow field.', range: { min: 0, max: 1, step: 0.01 } },
    cloudShadowScale: { label: 'Shadow Scale', description: 'World-space noise scale of the cloud-shadow field.', range: { min: 0.001, max: 0.08, step: 0.001 } },
    cloudShadowStrength: { label: 'Cloud Shadow', description: 'Strength shared by terrain, water, vegetation, and fauna.', range: { min: 0, max: 1, step: 0.01 } },
    cloudSpeed: { label: 'Cloud Speed', description: 'Cloud animation speed multiplier.', range: { min: 0, max: 5, step: 0.01 } },
    fogColor: { label: 'Fog Color', description: 'Weather fog color. Null preserves the scene baseline.', type: 'nullableColor' },
    fogRangeScale: { label: 'Fog Density', description: 'Scales the scene fog range; larger values bring fog closer.', range: { min: 0.25, max: 8, step: 0.01 } },
    skyDarkening: { label: 'Sky Darkening', description: 'Darkens the sky without changing its hue.', range: { min: 0, max: 0.9, step: 0.01 } },
    skyDesaturation: { label: 'Sky Desaturation', description: 'Pulls sky and cloud colors toward gray.', range: { min: 0, max: 1, step: 0.01 } },
    skyTint: { label: 'Sky Tint', description: 'RGB multiplier applied after the scene sky baseline.', type: 'color' },
    sunIntensity: { label: 'Sun Intensity', description: 'Multiplier over the current time-of-day sun intensity.', range: { min: 0, max: 1.5, step: 0.01 } },
    sunTint: { label: 'Sun Tint', description: 'RGB multiplier over the current sun color.', type: 'color' },
  }),
  wind: Object.freeze({
    direction: { label: 'Direction', description: 'Horizontal XZ direction the wind blows toward.', type: 'vector2' },
    gustFrequency: { label: 'Gust Frequency', description: 'Spatial frequency of vegetation gust bands.', range: { min: 0, max: 3, step: 0.01 } },
    gustSpeed: { label: 'Gust Speed', description: 'Travel speed of vegetation gust bands.', range: { min: 0, max: 6, step: 0.01 } },
    speed: { label: 'Wind Speed', description: 'Animation and precipitation advection speed.', range: { min: 0, max: 8, step: 0.01 } },
    strength: { label: 'Wind Strength', description: 'Displacement strength shared by weather consumers.', range: { min: 0, max: 2, step: 0.01 } },
  }),
  precipitation: Object.freeze({
    type: { label: 'Type', description: 'Rendered precipitation family.', type: 'select', options: WEATHER_PRECIPITATION_TYPES },
    intensity: { label: 'Intensity', description: 'Draw-count and opacity multiplier.', range: { min: 0, max: 1, step: 0.01 } },
    color: { label: 'Color', description: 'Precipitation color.', type: 'color' },
    opacity: { label: 'Opacity', description: 'Maximum particle opacity.', range: { min: 0, max: 1, step: 0.01 } },
    areaSize: { label: 'Follow Area', description: 'Width and depth of the precipitation volume in meters.', range: { min: 10, max: 140, step: 1 } },
    fallHeight: { label: 'Fall Height', description: 'Height of the precipitation volume in meters.', range: { min: 4, max: 80, step: 1 } },
    speed: { label: 'Fall Speed', description: 'Vertical fall speed in meters per second.', range: { min: 0.2, max: 40, step: 0.1 } },
    size: { label: 'Particle Size', description: 'Snow, hail, sleet, and dust particle size.', range: { min: 0.02, max: 0.8, step: 0.01 } },
    streakLength: { label: 'Streak Length', description: 'Rain and sleet streak length.', range: { min: 0.05, max: 1.5, step: 0.01 } },
    maxParticles: { label: 'Particle Budget', description: 'Maximum instances allocated at construction.', range: { min: 500, max: 20000, step: 500 }, serializable: true },
  }),
  lightning: Object.freeze({
    enabled: { label: 'Enabled', description: 'Allows seeded lightning strikes.', type: 'boolean' },
    strikesPerMinute: { label: 'Strikes / Minute', description: 'Average strike rate with deterministic timing jitter.', range: { min: 0, max: 30, step: 0.1 } },
    intensity: { label: 'Flash Intensity', description: 'Peak intensity of the camera-enclosing lightning flash.', range: { min: 0, max: 20, step: 0.1 } },
    duration: { label: 'Flash Duration', description: 'Visible flash envelope in seconds.', range: { min: 0.05, max: 1, step: 0.01 } },
    color: { label: 'Flash Color', description: 'Lightning flash color.', type: 'color' },
  }),
  surface: Object.freeze({
    waterWaveBoost: { label: 'Water Wave Boost', description: 'Added to the water system’s baseline wave-intensity dial.', range: { min: 0, max: 0.75, step: 0.01 } },
    waterRippleRate: { label: 'Rain Ripple Rate', description: 'Average water ripple impulses per second.', range: { min: 0, max: 20, step: 0.1 } },
    wetness: { label: 'Wetness', description: 'Normalized host-facing wet-surface output.', range: { min: 0, max: 1, step: 0.01 } },
    snowCover: { label: 'Snow Cover', description: 'Normalized host-facing snow accumulation target.', range: { min: 0, max: 1, step: 0.01 } },
    ice: { label: 'Ice', description: 'Normalized host-facing ice accumulation target.', range: { min: 0, max: 1, step: 0.01 } },
  }),
});

export const WEATHER_SETTING_FIELD_SCHEMA = Object.freeze(Object.fromEntries(
  WEATHER_SETTING_GROUPS.map((group) => {
    const fields = Object.fromEntries(
      Object.entries(FIELDS[group.id]).map(([key, field]) => [key, Object.freeze({
        defaultValue: DEFAULT_WEATHER_SETTINGS[group.id][key],
        description: field.description,
        group: group.id,
        id: `${group.id}.${key}`,
        key,
        label: field.label,
        options: field.options ?? null,
        range: field.range ?? null,
        serializable: field.serializable ?? true,
        type: field.type ?? 'number',
      })]),
    );
    return [group.id, Object.freeze(fields)];
  }),
));

const clamp = (value, min, max) => Math.min(Math.max(Number(value), min), max);
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function vector(value, fallback, size) {
  if (!Array.isArray(value) || value.length < size) return [...fallback];
  const next = value.slice(0, size).map(Number);
  return next.every(Number.isFinite) ? next : [...fallback];
}

function groupSource(options, id) {
  return options?.[id] && typeof options[id] === 'object' && !Array.isArray(options[id])
    ? options[id]
    : {};
}

/** Normalizes partial grouped settings into a complete, mutable plain object. */
export function createWeatherSettings(options = {}) {
  const atmosphere = groupSource(options, 'atmosphere');
  const wind = groupSource(options, 'wind');
  const precipitation = groupSource(options, 'precipitation');
  const lightning = groupSource(options, 'lightning');
  const surface = groupSource(options, 'surface');
  const da = DEFAULT_WEATHER_SETTINGS.atmosphere;
  const dw = DEFAULT_WEATHER_SETTINGS.wind;
  const dp = DEFAULT_WEATHER_SETTINGS.precipitation;
  const dl = DEFAULT_WEATHER_SETTINGS.lightning;
  const ds = DEFAULT_WEATHER_SETTINGS.surface;
  const fogColor = atmosphere.fogColor === null || atmosphere.fogColor === undefined
    ? null
    : vector(atmosphere.fogColor, [0.72, 0.83, 0.94], 3);
  const precipitationType = WEATHER_PRECIPITATION_TYPES.includes(precipitation.type)
    ? precipitation.type
    : dp.type;

  return {
    atmosphere: {
      ambientIntensity: clamp(finite(atmosphere.ambientIntensity, da.ambientIntensity), 0, 2),
      cloudCoverage: clamp(finite(atmosphere.cloudCoverage, da.cloudCoverage), 0, 1),
      cloudShadowCoverage: clamp(finite(atmosphere.cloudShadowCoverage, da.cloudShadowCoverage), 0, 1),
      cloudShadowScale: clamp(finite(atmosphere.cloudShadowScale, da.cloudShadowScale), 0.0001, 0.2),
      cloudShadowStrength: clamp(finite(atmosphere.cloudShadowStrength, da.cloudShadowStrength), 0, 1),
      cloudSpeed: clamp(finite(atmosphere.cloudSpeed, da.cloudSpeed), 0, 10),
      fogColor,
      fogRangeScale: clamp(finite(atmosphere.fogRangeScale, da.fogRangeScale), 0.1, 20),
      skyDarkening: clamp(finite(atmosphere.skyDarkening, da.skyDarkening), 0, 0.95),
      skyDesaturation: clamp(finite(atmosphere.skyDesaturation, da.skyDesaturation), 0, 1),
      skyTint: vector(atmosphere.skyTint, da.skyTint, 3),
      sunIntensity: clamp(finite(atmosphere.sunIntensity, da.sunIntensity), 0, 2),
      sunTint: vector(atmosphere.sunTint, da.sunTint, 3),
    },
    wind: {
      direction: vector(wind.direction, dw.direction, 2),
      gustFrequency: clamp(finite(wind.gustFrequency, dw.gustFrequency), 0, 5),
      gustSpeed: clamp(finite(wind.gustSpeed, dw.gustSpeed), 0, 10),
      speed: clamp(finite(wind.speed, dw.speed), 0, 12),
      strength: clamp(finite(wind.strength, dw.strength), 0, 3),
    },
    precipitation: {
      areaSize: clamp(finite(precipitation.areaSize, dp.areaSize), 4, 300),
      color: vector(precipitation.color, dp.color, 3),
      fallHeight: clamp(finite(precipitation.fallHeight, dp.fallHeight), 2, 160),
      intensity: clamp(finite(precipitation.intensity, dp.intensity), 0, 1),
      maxParticles: Math.round(clamp(finite(precipitation.maxParticles, dp.maxParticles), 100, 40000)),
      opacity: clamp(finite(precipitation.opacity, dp.opacity), 0, 1),
      size: clamp(finite(precipitation.size, dp.size), 0.005, 2),
      speed: clamp(finite(precipitation.speed, dp.speed), 0.05, 80),
      streakLength: clamp(finite(precipitation.streakLength, dp.streakLength), 0.01, 4),
      type: precipitationType,
    },
    lightning: {
      color: vector(lightning.color, dl.color, 3),
      duration: clamp(finite(lightning.duration, dl.duration), 0.02, 2),
      enabled: lightning.enabled === undefined ? dl.enabled : Boolean(lightning.enabled),
      intensity: clamp(finite(lightning.intensity, dl.intensity), 0, 40),
      strikesPerMinute: clamp(finite(lightning.strikesPerMinute, dl.strikesPerMinute), 0, 60),
    },
    surface: {
      ice: clamp(finite(surface.ice, ds.ice), 0, 1),
      snowCover: clamp(finite(surface.snowCover, ds.snowCover), 0, 1),
      waterRippleRate: clamp(finite(surface.waterRippleRate, ds.waterRippleRate), 0, 60),
      waterWaveBoost: clamp(finite(surface.waterWaveBoost, ds.waterWaveBoost), 0, 1),
      wetness: clamp(finite(surface.wetness, ds.wetness), 0, 1),
    },
  };
}

/** Deep-merges grouped overrides, then normalizes the result. */
export function mergeWeatherSettings(base, overrides = {}) {
  const source = createWeatherSettings(base);
  const merged = {};
  for (const group of WEATHER_SETTING_GROUPS) {
    merged[group.id] = {
      ...source[group.id],
      ...groupSource(overrides, group.id),
    };
  }
  return createWeatherSettings(merged);
}

function interpolateValue(a, b, t) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.map((value, index) => value + ((b[index] ?? value) - value) * t);
  }
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  return t < 0.5 ? a : b;
}

/** Interpolates weather settings for smooth preset transitions. */
export function interpolateWeatherSettings(from, to, amount) {
  const a = createWeatherSettings(from);
  const b = createWeatherSettings(to);
  const t = clamp(finite(amount, 0), 0, 1);
  const output = {};
  for (const group of WEATHER_SETTING_GROUPS) {
    output[group.id] = {};
    for (const key of Object.keys(a[group.id])) {
      output[group.id][key] = interpolateValue(a[group.id][key], b[group.id][key], t);
    }
  }
  // Null fog colors are baseline-preserving, so they cannot be numerically
  // interpolated. Switch only after the transition midpoint.
  if (a.atmosphere.fogColor === null || b.atmosphere.fogColor === null) {
    output.atmosphere.fogColor = t < 0.5 ? a.atmosphere.fogColor : b.atmosphere.fogColor;
  }
  return createWeatherSettings(output);
}
