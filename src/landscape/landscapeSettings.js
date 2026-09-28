// Landscape Lab settings schema — the flat, schema-driven settings object the
// lab store owns (waterSettings pattern: FIELD_METADATA drives the inspector
// via SchemaGroup, so adding a parameter is one metadata entry + one default).
// Bulk project data (heights, splat, foliage instances) is NOT settings — it
// lives in the landscape document and is edited through stroke commands.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function color3(value, fallback) {
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 3).map((channel) => finiteNumber(channel, null));
    if (channels.every((channel) => channel !== null)) {
      return channels.map((channel) => clamp(channel, 0, 1));
    }
  }
  return [...fallback];
}

function booleanValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return fallback;
}

/** Fixed identity of the four splat layers; tints come from settings. */
export const LANDSCAPE_LAYER_DEFAULTS = Object.freeze([
  Object.freeze({ id: 'grass', label: 'Grass', channel: 0 }),
  Object.freeze({ id: 'dirt', label: 'Dirt', channel: 1 }),
  Object.freeze({ id: 'rock', label: 'Rock', channel: 2 }),
  Object.freeze({ id: 'sand', label: 'Sand', channel: 3 }),
]);

export const DEFAULT_LANDSCAPE_SETTINGS = Object.freeze({
  brushRadius: 6,
  brushStrength: 0.5,
  brushHardness: 0.35,
  brushShape: 'round',
  noiseScale: 0.1,
  noiseAmplitude: 2,
  terraceStep: 2,
  rampWidth: 5,
  tunnelHeight: 4,
  grassTint: Object.freeze([0.42, 0.62, 0.31]),
  dirtTint: Object.freeze([0.52, 0.4, 0.27]),
  rockTint: Object.freeze([0.47, 0.47, 0.52]),
  sandTint: Object.freeze([0.85, 0.76, 0.56]),
  macroNoiseAmount: 0.16,
  macroNoiseScale: 0.045,
  waterLevel: -0.6,
  showWater: true,
  groundwaterOffset: 6,
  foliageDensity: 1,
});

export const LANDSCAPE_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'brush', label: 'Brush', description: 'Shared sculpt/paint brush response: size, falloff, and strength (ToonLab Landscape triplet).' }),
  Object.freeze({ id: 'material', label: 'Material', description: 'Splat layer tints and world-space macro variation.' }),
  Object.freeze({ id: 'environment', label: 'Environment', description: 'Stage water level and preview toys around the terrain.' }),
  Object.freeze({ id: 'foliage', label: 'Foliage', description: 'Global foliage paint response.' }),
]);

const FIELD_METADATA = {
  brushRadius: { group: 'brush', label: 'Brush Size', min: 0.5, max: 40, step: 0.1, description: 'Brush radius in meters ( [ and ] adjust it, ToonLab-style).' },
  brushStrength: { group: 'brush', label: 'Tool Strength', min: 0.01, max: 1, step: 0.01, description: 'How strongly each stroke sample applies; Shift inverts sculpt direction.' },
  brushHardness: { group: 'brush', label: 'Brush Falloff', min: 0, max: 1, step: 0.01, description: '0 feathers from the center outward; 1 is a hard-edged disc.' },
  brushShape: {
    group: 'brush',
    label: 'Brush Shape',
    type: 'select',
    options: Object.freeze(['round', 'square']),
    optionLabels: Object.freeze({ round: 'Round', square: 'Square' }),
    description: 'Round for organic shapes; Square for clean straight edges (pits, holes, plots). Holes and dry zones snap to terrain quads either way — square edges hide that best.',
  },
  noiseScale: { group: 'brush', label: 'Noise Scale', min: 0.01, max: 0.5, step: 0.005, description: 'Spatial frequency of the Noise tool; world-anchored so re-strokes stay stable.' },
  noiseAmplitude: { group: 'brush', label: 'Noise Height', min: 0, max: 8, step: 0.05, description: 'Peak-to-valley meters the Noise tool sculpts at full strength.' },
  terraceStep: { group: 'brush', label: 'Terrace Step', min: 0.25, max: 10, step: 0.05, description: 'Vertical band spacing in meters the Terrace tool quantizes toward.' },
  rampWidth: { group: 'brush', label: 'Ramp Width', min: 0.5, max: 20, step: 0.1, description: 'Half-width in meters of the two-click Ramp gesture.' },
  tunnelHeight: { group: 'brush', label: 'Tunnel Height', min: 2, max: 12, step: 0.5, description: 'Interior height in meters of the two-click Tunnel bore; Brush Size sets its half-width.' },

  grassTint: { group: 'material', label: 'Grass Tint', type: 'color', description: 'Base color of splat layer 1 when it has no texture.' },
  dirtTint: { group: 'material', label: 'Dirt Tint', type: 'color', description: 'Base color of splat layer 2 when it has no texture.' },
  rockTint: { group: 'material', label: 'Rock Tint', type: 'color', description: 'Base color of splat layer 3 when it has no texture.' },
  sandTint: { group: 'material', label: 'Sand Tint', type: 'color', description: 'Base color of splat layer 4 when it has no texture.' },
  macroNoiseAmount: { group: 'material', label: 'Macro Variation', min: 0, max: 1, step: 0.01, description: 'World-space brightness variation that breaks up flat layer color.' },
  macroNoiseScale: { group: 'material', label: 'Macro Scale', min: 0.005, max: 0.3, step: 0.005, description: 'Spatial frequency of the macro variation.' },

  waterLevel: { group: 'environment', label: 'Water Level', min: -10, max: 10, step: 0.05, description: 'World-space stage water height; foliage rules can avoid painting below it.' },
  showWater: { group: 'environment', label: 'Show Water', type: 'boolean', description: 'Preview-only translucent water plane at the water level.' },
  groundwaterOffset: { group: 'environment', label: 'Groundwater Depth', min: 0, max: 30, step: 0.5, description: 'Meters BELOW the water level where water reappears inside painted Dry zones (0 keeps dry zones bone-dry at any depth).' },

  foliageDensity: { group: 'foliage', label: 'Density Multiplier', min: 0, max: 3, step: 0.05, description: 'Global multiplier over each palette entry’s paint density.' },
};

/** Validates + clamps a flat landscape settings object. */
export function createLandscapeSettings(options = {}) {
  const settings = {};
  for (const [key, fallback] of Object.entries(DEFAULT_LANDSCAPE_SETTINGS)) {
    const metadata = FIELD_METADATA[key];
    const provided = options[key];
    if (metadata?.type === 'boolean') {
      settings[key] = booleanValue(provided, fallback);
    } else if (metadata?.type === 'select') {
      settings[key] = metadata.options?.includes(provided) ? provided : fallback;
    } else if (metadata?.type === 'color' || Array.isArray(fallback)) {
      settings[key] = color3(provided, fallback);
    } else {
      const value = finiteNumber(provided, fallback);
      settings[key] = metadata?.min !== undefined
        ? clamp(value, metadata.min, metadata.max)
        : value;
    }
  }
  return settings;
}

/** Drops unknown keys; the serializable settings half of a project document. */
export function sanitizeLandscapeSettings(settings = {}) {
  return createLandscapeSettings(settings);
}

function inferFieldType(key, value) {
  const metadata = FIELD_METADATA[key];
  if (metadata?.type) return metadata.type;
  if (Array.isArray(value)) return value.length === 2 ? 'vector2' : 'color';
  return 'number';
}

export const LANDSCAPE_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_METADATA).map(([key, metadata]) => {
      const defaultValue = DEFAULT_LANDSCAPE_SETTINGS[key];
      const type = inferFieldType(key, defaultValue);
      return [key, Object.freeze({
        key,
        id: `${metadata.group}.${key}`,
        group: metadata.group,
        label: metadata.label,
        type,
        min: metadata.min,
        max: metadata.max,
        step: metadata.step,
        range: type === 'number'
          ? Object.freeze({ min: metadata.min ?? 0, max: metadata.max ?? 1, step: metadata.step ?? 0.01 })
          : null,
        options: metadata.options ? Object.freeze([...metadata.options]) : null,
        optionLabels: metadata.optionLabels ?? null,
        description: metadata.description,
        defaultValue,
        serializable: true,
      })];
    }),
  ),
);

export const LANDSCAPE_SETTING_FIELD_SCHEMA_BY_GROUP = Object.freeze(
  Object.fromEntries(
    LANDSCAPE_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(LANDSCAPE_SETTING_FIELD_SCHEMA)
            .filter(([, field]) => field.group === group.id),
        ),
      ),
    ]),
  ),
);

/** Layer definitions resolved against the current settings tints. */
export function resolveLandscapeLayers(settings) {
  const tints = [settings.grassTint, settings.dirtTint, settings.rockTint, settings.sandTint];
  return LANDSCAPE_LAYER_DEFAULTS.map((layer, index) => ({
    ...layer,
    tint: [...(tints[index] ?? [0.5, 0.5, 0.5])],
  }));
}
