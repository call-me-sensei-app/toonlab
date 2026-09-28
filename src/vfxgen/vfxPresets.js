// Named gameplay-VFX presets: 'default' is the baseline; 'call_me_sensei' is
// the studio-managed signature look, curated and updated over releases.
// Community presets register alongside them via registerVfxPreset().
// Preset settings are nested partials over DEFAULT_VFX_SETTINGS.

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const vfxPresetRegistry = new Map([
  ['default', Object.freeze({
    description: 'Baseline gameplay VFX.',
    label: 'Default',
    settings: Object.freeze({}),
  })],
  ['call_me_sensei', Object.freeze({
    description: 'Studio-managed signature combat feel, curated by Call Me Sensei and updated over releases. Tuned to the reference-class action-RPG (Genshin-style) hit language: smooth luminous sword arcs with a white leading edge, four-point star glints with a fast shockwave circle on every hit, and a hard-saturated two-tone pyro fireball.',
    label: 'Call Me Sensei',
    settings: Object.freeze({
      // Smooth, luminous arc — many fade bands read as the reference games'
      // gradient trails; the crisp cel look stays available in 'default'.
      // Physical-attack gold with the white leading band — the reference
      // trail. Element variants are one `look.color` swap at spawn.
      slash: Object.freeze({
        bands: 6,
        color: Object.freeze([1.0, 0.78, 0.2]),
        coreColor: Object.freeze([1.0, 1.0, 1.0]),
        intensity: 1.05,
        lifetime: 0.45,
        sparkle: 90,
      }),
      // Four-point glint + shockwave circle: the signature hit read.
      impact: Object.freeze({
        flashColor: Object.freeze([1.0, 0.98, 0.9]),
        flashSize: 1.2,
        intensity: 1.15,
        shockwave: true,
        sparkColor: Object.freeze([1.0, 0.85, 0.35]),
        sparkCount: 34,
        spikes: 4,
      }),
      // Pyro: near-white core, deep saturated orange skin, dense embers.
      fireball: Object.freeze({
        coreColor: Object.freeze([1.0, 0.97, 0.72]),
        emberRate: 150,
        explosionPower: 2.0,
        flameColor: Object.freeze([1.0, 0.34, 0.08]),
        intensity: 1.45,
        ringColor: Object.freeze([1.0, 0.5, 0.15]),
      }),
      // Charged energy: cool-white core, saturated blue shell, and a lighter
      // cyan filament accent. Identity stays "charged projectile"; this entry
      // selects only the IP-wide rendering treatment.
      chargedShot: Object.freeze({
        accentColor: Object.freeze([0.55, 0.86, 1.0]),
        coreColor: Object.freeze([0.92, 0.99, 1.0]),
        coreIntensity: 2.65,
        edgeColor: Object.freeze([0.22, 0.54, 1.0]),
        filamentDensity: 1.4,
        filamentSpeed: 1.35,
        circulationEnabled: true,
        energyMotionTheme: 'electric-orbit',
        circulationCount: 6,
        circulationSpeed: 1.65,
        circulationDirection: 'alternating',
        circulationCoverage: 0.3,
        circulationIrregularity: 0.74,
        circulationBranching: 0.46,
        circulationThickness: 0.022,
        circulationSurfaceOffset: 1.72,
        circulationAxialWander: 0.56,
        circulationPlaneVariation: 0.8,
        circulationFlicker: 0.7,
        releaseDepth: 0.3,
        releaseIrregularity: 0.4,
        releaseLobes: 3,
        lightIntensity: 2.8,
        particleRate: 190,
        shellIntensity: 1.5,
      }),
      // Ground feedback stays subtle and cool so the glows own the frame.
      footstep: Object.freeze({
        color: Object.freeze([0.72, 0.7, 0.66]),
        puffCount: 6,
      }),
      landing: Object.freeze({
        color: Object.freeze([0.72, 0.7, 0.66]),
        puffCount: 16,
        ringRadius: 1.3,
      }),
    }),
  })],
]);

/**
 * Registers a named VFX preset so it resolves in
 * `createVfxSystem({ preset })` exactly like the built-ins. Accepts
 * `{ label?, description?, settings? }` or flat (nested) settings.
 */
export function registerVfxPreset(name, preset = {}, { overwrite = false } = {}) {
  const id = String(name ?? '').trim();
  if (!id) throw new Error('VFX preset name is required.');
  if (!overwrite && vfxPresetRegistry.has(id)) {
    throw new Error(`VFX preset "${id}" already exists.`);
  }
  const { label, description, settings, ...flat } = cleanObject(preset);
  const entry = Object.freeze({
    description: typeof description === 'string' ? description : '',
    label: typeof label === 'string' && label ? label : id,
    settings: Object.freeze({ ...cleanObject(settings ?? flat) }),
  });
  vfxPresetRegistry.set(id, entry);
  return { description: entry.description, id, label: entry.label };
}

/**
 * Preferred style-axis name. `registerVfxPreset` remains the compatibility
 * API because VFX looks were historically called presets.
 */
export function registerVfxStyle(name, style = {}, options = {}) {
  return registerVfxPreset(name, style, options);
}

/** Lists registered presets as `{ id, label, description }` (for HUDs). */
export function getVfxPresetOptions() {
  return Array.from(vfxPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description,
    id,
    label: preset.label,
  }));
}

/** Lists IP-wide VFX styles. Effect ids (slash, impact, fireball, …) stay separate. */
export function getVfxStyleOptions() {
  return getVfxPresetOptions();
}

/** Resolves a style id without letting an unknown id masquerade as a preset. */
export function resolveVfxStyleName(name) {
  const id = String(name ?? 'default').trim();
  return vfxPresetRegistry.has(id) ? id : 'default';
}

/** Nested settings partial for a preset name; `{}` for unknown names. */
export function resolveVfxPreset(name) {
  return vfxPresetRegistry.get(name)?.settings ?? {};
}

/** Preferred style-axis resolver; unknown ids fall back to the Default style. */
export function resolveVfxStyle(name) {
  return resolveVfxPreset(resolveVfxStyleName(name));
}
