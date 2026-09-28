// Named ambient-fx presets: 'default' is the baseline; 'call_me_sensei' is
// the studio-managed signature look, curated and updated over releases.
// Community presets register alongside them via registerAmbientFxPreset().
// Preset settings are nested partials over DEFAULT_AMBIENTFX_SETTINGS.

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const ambientFxPresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline ambient atmosphere.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature atmosphere, curated by Call Me Sensei and updated over releases. Denser blossom fall, warm slow fireflies, and a touch more dawn mist.',
    label: 'Call Me Sensei',
    settings: Object.freeze({
      petals: Object.freeze({
        canopyDensity: 6.5,
        colorA: Object.freeze([1.0, 0.5, 0.7]),
        colorB: Object.freeze([1.0, 0.78, 0.87]),
        density: 0.04,
        flutter: 1.25,
      }),
      leaves: Object.freeze({
        colorA: Object.freeze([0.95, 0.66, 0.18]),
        colorB: Object.freeze([0.82, 0.42, 0.12]),
        windResponse: 1.5,
      }),
      fireflies: Object.freeze({
        blinkSpeed: 0.85,
        color: Object.freeze([1.0, 0.82, 0.38]),
        density: 0.06,
        intensity: 1.2,
      }),
      pollen: Object.freeze({
        backlitStrength: 1.3,
        density: 0.075,
      }),
      mist: Object.freeze({
        density: 0.0055,
        opacity: 0.4,
      }),
    }),
  })],
]);

/**
 * Registers a named ambient-fx preset so it resolves in
 * `createAmbientFx({ preset })` exactly like the built-ins. Accepts
 * `{ label?, description?, settings? }` or flat (nested) settings.
 */
export function registerAmbientFxPreset(name, preset = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('Ambient-fx preset name is required.');
  if (!overwrite && ambientFxPresetRegistry.has(id)) {
    throw new Error(`Ambient-fx preset "${id}" already exists.`);
  }
  const { label, description, settings, ...flat } = cleanObject(preset);
  const entry = Object.freeze({
    description: typeof description === 'string' ? description : '',
    label: typeof label === 'string' && label ? label : id,
    settings: Object.freeze({ ...cleanObject(settings ?? flat) }),
  });
  ambientFxPresetRegistry.set(id, entry);
  return { description: entry.description, id, label: entry.label };
}

/** Lists registered presets as `{ id, label, description }` (for HUDs). */
export function getAmbientFxPresetOptions() {
  return Array.from(ambientFxPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

/** Nested settings partial for a preset name; `{}` for unknown names. */
export function resolveAmbientFxPreset(name) {
  return ambientFxPresetRegistry.get(name)?.settings ?? {};
}
