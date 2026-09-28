// Named environment presets: a preset is a STYLE — a coherent,
// reference-checked identity (shader features/parameters plus rig hints)
// that resolves in every canonical SCENARIO (venue × time of day), the same
// way a lighting style's dayCycle covers every hour and a sky style renders
// every scenario. Selecting "Call Me Sensei" never means "one baked moment";
// it means the Call Me Sensei rendition of whichever scenario the scene is
// in. Registry mirrors the character preset helpers in toonSettings.js.
//
// 'default' stays an empty override layer so the shipped baseline (the
// approved Liyue room look) never shifts underneath integrators.

import { ENVIRONMENT_SETTING_FIELD_SCHEMA } from './environmentSettings.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';
import {
  createManufacturedMaterialLook,
  validateManufacturedMaterialLook,
} from './manufacturedMaterialContract.js';

/** Document type tag stamped on shareable environment preset JSON documents. */
export const ENVIRONMENT_PRESET_DOCUMENT_TYPE = 'toonlab/environment-preset';

/**
 * Current schema version for environment preset documents.
 * v2 adds `preset.scenarios`; v3 adds `preset.materialLook`.
 */
export const ENVIRONMENT_PRESET_SCHEMA_VERSION = 3;

/**
 * Canonical environment scenarios — the world-state axis (venue × time of
 * day). Every style resolves in every scenario via
 * `resolveEnvironmentPreset(style, scenario)`; styles author variants under
 * `scenarios` and inherit the canonical rendition for the rest.
 */
export const ENVIRONMENT_SCENARIOS = Object.freeze([
  Object.freeze({ description: 'Sunlit interior at midday.', id: 'interiorDay', label: 'Interior Day' }),
  Object.freeze({ description: 'Warm lamps balanced against low evening sun.', id: 'interiorEvening', label: 'Interior Evening' }),
  Object.freeze({ description: 'Lamp-lit interior after dark, sun off.', id: 'interiorNight', label: 'Interior Night' }),
  Object.freeze({ description: 'Open-air daylight with sky tint and height fog.', id: 'exteriorDay', label: 'Exterior Day' }),
]);

const ENVIRONMENT_SCENARIO_IDS = new Set(ENVIRONMENT_SCENARIOS.map((scenario) => scenario.id));

/** Lists the canonical scenarios as `{ id, label, description }` (for HUDs). */
export function getEnvironmentScenarioOptions() {
  return ENVIRONMENT_SCENARIOS.map(({ description, id, label }) => ({ description, id, label }));
}

/**
 * Historical single-look preset ids. Each was the Default style's rendition
 * of one scenario; they now resolve as exactly that, byte-identical. Kept
 * indefinitely for saved bundles, lab links, and downstream games.
 */
export const ENVIRONMENT_PRESET_ALIASES = Object.freeze({
  exteriorDay: Object.freeze({ preset: 'default', scenario: 'exteriorDay' }),
  interiorDay: Object.freeze({ preset: 'default', scenario: 'interiorDay' }),
  interiorEvening: Object.freeze({ preset: 'default', scenario: 'interiorEvening' }),
  interiorNight: Object.freeze({ preset: 'default', scenario: 'interiorNight' }),
});

// Rig keys consumed by the shipped scene integrations. Unknown rig keys are
// kept (integrations may carry custom hints) but flagged with a warning.
const KNOWN_ENVIRONMENT_RIG_KEYS = Object.freeze(new Set([
  'bakeVertexAo',
  'dustMotes',
  'lampIntensity',
  'planarReflection',
  'probe',
  'spotShadows',
  'sun',
  'timeOfDayHour',
]));

const ENVIRONMENT_PRESETS = new Map();

function scenarioPartial(source) {
  const partial = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    features: { ...(partial.features ?? {}) },
    parameters: { ...(partial.parameters ?? {}) },
    rig: { ...(partial.rig ?? {}) },
  };
}

export function registerEnvironmentPreset(name, preset, { overwrite = false } = {}) {
  const key = String(name ?? '').trim();
  if (!key) throw new Error('Environment preset name is required.');
  if (overwrite && isProtectedSystemStyleId(key) && ENVIRONMENT_PRESETS.has(key)) {
    throw new Error(`System style "${key}" is read-only.`);
  }
  if (!overwrite && ENVIRONMENT_PRESETS.has(key)) {
    throw new Error(`Environment preset "${key}" is already registered.`);
  }
  const source = preset && typeof preset === 'object' ? preset : {};
  const scenarios = {};
  for (const [scenarioId, partial] of Object.entries(source.scenarios ?? {})) {
    if (!ENVIRONMENT_SCENARIO_IDS.has(scenarioId)) continue;
    scenarios[scenarioId] = scenarioPartial(partial);
  }
  ENVIRONMENT_PRESETS.set(key, {
    features: {},
    label: key,
    parameters: {},
    rig: {},
    ...source,
    materialLook: createManufacturedMaterialLook(source.materialLook),
    scenarios,
  });
  return key;
}

/**
 * Folds any reference — style id, legacy single-look id, or unknown — to a
 * resolvable id. Legacy scenario ids stay themselves (they resolve through
 * {@link ENVIRONMENT_PRESET_ALIASES}); unknown ids fall back to 'default'.
 */
export function normalizeEnvironmentPresetName(name) {
  const key = String(name ?? 'default').trim();
  if (ENVIRONMENT_PRESETS.has(key) || ENVIRONMENT_PRESET_ALIASES[key]) return key;
  return 'default';
}

/**
 * Lists registered environment STYLES as `{ label, value, scenarios }`,
 * where `scenarios` reports per-scenario coverage (`'authored'` vs
 * `'inherited'`). Every style covers every scenario either way.
 */
export function getEnvironmentPresetOptions() {
  return Array.from(ENVIRONMENT_PRESETS.entries())
    .map(([value, preset]) => ({
      label: preset.label,
      scenarios: Object.fromEntries(ENVIRONMENT_SCENARIOS.map((scenario) => [
        scenario.id,
        preset.scenarios?.[scenario.id] ? 'authored' : 'inherited',
      ])),
      value,
    }));
}

// A style's complete payload for one scenario: authored variant over the
// style base when the style ships one, otherwise the canonical rendition
// (the Default style's variant) over the style base. Sections merge
// shallowly (features / parameters / rig). `materialLook` is stable style
// identity and does not vary with scene time/venue.
function resolveEnvironmentStyleVariant(preset, scenarioId) {
  const base = {
    features: { ...preset.features },
    materialLook: createManufacturedMaterialLook(preset.materialLook),
    parameters: { ...preset.parameters },
    rig: { ...preset.rig },
  };
  const partial = preset.scenarios?.[scenarioId]
    ?? ENVIRONMENT_PRESETS.get('default')?.scenarios?.[scenarioId];
  if (!partial) return base;
  return {
    features: { ...base.features, ...partial.features },
    materialLook: base.materialLook,
    parameters: { ...base.parameters, ...partial.parameters },
    rig: { ...base.rig, ...partial.rig },
  };
}

/**
 * Returns { features, materialLook, parameters, rig } ready to spread into
 * applyEnvironmentShader options and the rig constructors.
 *
 * `name` selects a STYLE; the optional `scenario` (one of
 * {@link ENVIRONMENT_SCENARIOS}) selects that style's rendition of a venue ×
 * time of day. Without a scenario the style's base look is returned
 * unchanged. Legacy single-look ids (`interiorDay`, `interiorEvening`,
 * `interiorNight`, `exteriorDay`) resolve as the Default style at that
 * scenario with identical settings.
 */
export function resolveEnvironmentPreset(name, scenario = undefined) {
  const key = String(name ?? 'default').trim();
  const alias = ENVIRONMENT_PRESETS.has(key) ? undefined : ENVIRONMENT_PRESET_ALIASES[key];
  const preset = ENVIRONMENT_PRESETS.get(alias?.preset ?? normalizeEnvironmentPresetName(key));
  const scenarioId = ENVIRONMENT_SCENARIO_IDS.has(scenario) ? scenario : alias?.scenario;
  if (scenarioId === undefined) {
    return {
      features: { ...preset.features },
      materialLook: createManufacturedMaterialLook(preset.materialLook),
      parameters: { ...preset.parameters },
      rig: { ...preset.rig },
    };
  }
  return resolveEnvironmentStyleVariant(preset, scenarioId);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function booleanFromValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  if (value === 0 || value === 1) return value === 1;
  return null;
}

function colorArrayFromValue(value) {
  const source = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? [value.r, value.g, value.b]
      : null;
  if (!source || source.length < 3) return null;
  const channels = source.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : null;
}

/**
 * Validates and coerces an environment preset definition against the
 * environment settings schema. Feature values are coerced to booleans and
 * must name known feature toggles; parameter values must be finite numbers
 * (or `[r, g, b]` arrays for color parameters, or `null` for auto) and must
 * name known shader parameters; rig hints must be JSON scalars (boolean,
 * finite number, or string) — unknown rig keys are kept but produce a warning.
 *
 * @param {object} preset Preset definition ({ label, description, features, parameters, rig }).
 * @returns {{ ok: boolean, errors: string[], warnings: string[], value: object | null }}
 *   `value` is the sanitized `{ label, description, features, parameters, rig }` when `ok`.
 */
export function sanitizeEnvironmentPreset(preset) {
  const errors = [];
  const warnings = [];
  const source = cleanObject(preset);

  const features = {};
  for (const [key, entry] of Object.entries(cleanObject(source.features))) {
    if (!ENVIRONMENT_SETTING_FIELD_SCHEMA.features[key]) {
      errors.push(`Unknown environment feature "${key}".`);
      continue;
    }
    const coerced = booleanFromValue(entry);
    if (coerced === null) {
      errors.push(`Environment feature "${key}" must be a boolean.`);
      continue;
    }
    features[key] = coerced;
  }

  const parameters = {};
  for (const [key, entry] of Object.entries(cleanObject(source.parameters))) {
    const field = ENVIRONMENT_SETTING_FIELD_SCHEMA.parameters[key];
    if (!field) {
      errors.push(`Unknown environment parameter "${key}".`);
      continue;
    }
    if (entry === null) {
      parameters[key] = null;
      continue;
    }
    if (field.type === 'color') {
      const color = colorArrayFromValue(entry);
      if (!color) {
        errors.push(`Environment parameter "${key}" must be an [r, g, b] color array.`);
        continue;
      }
      parameters[key] = color;
      continue;
    }
    const number = typeof entry === 'boolean' ? Number.NaN : Number(entry);
    if (!Number.isFinite(number)) {
      errors.push(`Environment parameter "${key}" must be a finite number.`);
      continue;
    }
    parameters[key] = number;
  }

  const rig = {};
  for (const [key, entry] of Object.entries(cleanObject(source.rig))) {
    const type = typeof entry;
    const isScalar = type === 'boolean'
      || type === 'string'
      || (type === 'number' && Number.isFinite(entry));
    if (!isScalar) {
      errors.push(`Environment rig value "${key}" must be a boolean, finite number, or string.`);
      continue;
    }
    if (!KNOWN_ENVIRONMENT_RIG_KEYS.has(key)) {
      warnings.push(`Unknown environment rig key "${key}" was kept as-is.`);
    }
    rig[key] = entry;
  }

  const materialLookResult = validateManufacturedMaterialLook(source.materialLook);
  errors.push(...materialLookResult.errors);
  warnings.push(...materialLookResult.warnings);

  const ok = errors.length === 0;
  return {
    errors,
    ok,
    value: ok
      ? {
        description: String(source.description ?? ''),
        features,
        label: String(source.label ?? ''),
        materialLook: materialLookResult.value,
        parameters,
        rig,
      }
      : null,
    warnings,
  };
}

// Sanitizes a `scenarios` map: unknown scenario ids are dropped with a
// warning; each variant is a partial {features, parameters, rig} validated
// against the same schema as the base payload.
function sanitizeEnvironmentScenarios(input) {
  const errors = [];
  const warnings = [];
  const scenarios = {};
  for (const [scenarioId, partial] of Object.entries(cleanObject(input))) {
    if (!ENVIRONMENT_SCENARIO_IDS.has(scenarioId)) {
      warnings.push(`Unknown environment scenario "${scenarioId}" was ignored.`);
      continue;
    }
    const sanitized = sanitizeEnvironmentPreset(cleanObject(partial));
    errors.push(...sanitized.errors.map((error) => `Scenario "${scenarioId}": ${error}`));
    warnings.push(...sanitized.warnings.map((warning) => `Scenario "${scenarioId}": ${warning}`));
    if (sanitized.ok) {
      scenarios[scenarioId] = {
        features: sanitized.value.features,
        parameters: sanitized.value.parameters,
        rig: sanitized.value.rig,
      };
    }
  }
  return {
    errors,
    scenarios: Object.keys(scenarios).length > 0 ? scenarios : undefined,
    warnings,
  };
}

/**
 * Serializes a registered environment preset into a shareable JSON document
 * (`{ type, schemaVersion, id, label, description, preset }`, with
 * `preset.scenarios` when the style authors variants). The registered
 * preset itself is untouched; `label`/`description` overrides only affect the
 * emitted document.
 *
 * @param {string} name Registered preset name (e.g. 'call_me_sensei').
 * @param {{ label?: string, description?: string }} [overrides] Optional label/description overrides.
 * @returns {object} Environment preset document ready for `JSON.stringify`.
 * @throws {Error} If the preset is not registered or fails sanitization.
 */
export function createEnvironmentPresetDocument(name, { description, label } = {}) {
  const key = String(name ?? '').trim();
  const preset = ENVIRONMENT_PRESETS.get(key);
  if (!preset) throw new Error(`Environment preset "${key}" is not registered.`);

  const sanitized = sanitizeEnvironmentPreset({
    ...preset,
    description: description ?? preset.description ?? '',
    label: label ?? preset.label ?? key,
  });
  if (!sanitized.ok) throw new Error(sanitized.errors.join(' '));
  const scenarioResult = sanitizeEnvironmentScenarios(preset.scenarios);
  if (scenarioResult.errors.length > 0) throw new Error(scenarioResult.errors.join(' '));

  return {
    description: sanitized.value.description,
    id: key,
    label: sanitized.value.label,
    preset: {
      features: sanitized.value.features,
      materialLook: sanitized.value.materialLook,
      parameters: sanitized.value.parameters,
      rig: sanitized.value.rig,
      ...(scenarioResult.scenarios === undefined ? {} : { scenarios: scenarioResult.scenarios }),
    },
    schemaVersion: ENVIRONMENT_PRESET_SCHEMA_VERSION,
    type: ENVIRONMENT_PRESET_DOCUMENT_TYPE,
  };
}

/**
 * Validates an environment preset document (a parsed object or a JSON string)
 * without registering it. Mirrors `validateToonPresetDocument` in
 * toonSettings.js.
 *
 * @param {object | string} input Document object or JSON string.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], value: object | null }}
 *   On `ok`, `value` is `{ id, label, description, features, parameters, rig }`,
 *   ready to pass to `registerEnvironmentPreset(value.id, value)`.
 */
export function validateEnvironmentPresetDocument(input) {
  const errors = [];
  const warnings = [];

  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid environment preset JSON: ${error.message}`],
        ok: false,
        value: null,
        warnings,
      };
    }
  }

  if (!isPlainObject(source)) {
    return {
      errors: ['Environment preset document must be a JSON object.'],
      ok: false,
      value: null,
      warnings,
    };
  }

  if (source.type !== ENVIRONMENT_PRESET_DOCUMENT_TYPE) {
    errors.push(`Environment preset document type must be "${ENVIRONMENT_PRESET_DOCUMENT_TYPE}".`);
  }

  if (source.schemaVersion === undefined) {
    warnings.push(`Environment preset schemaVersion was missing and defaulted to ${ENVIRONMENT_PRESET_SCHEMA_VERSION}.`);
  } else if (!Number.isFinite(source.schemaVersion)) {
    errors.push('Environment preset schemaVersion must be a number.');
  } else if (source.schemaVersion > ENVIRONMENT_PRESET_SCHEMA_VERSION) {
    errors.push(`Environment preset schema version ${source.schemaVersion} is newer than supported version ${ENVIRONMENT_PRESET_SCHEMA_VERSION}.`);
  }

  const id = String(source.id ?? '').trim();
  if (!id) errors.push('Environment preset id is required.');

  const presetSource = cleanObject(source.preset);
  const sanitized = sanitizeEnvironmentPreset({
    ...presetSource,
    description: source.description ?? presetSource.description ?? '',
    label: source.label ?? presetSource.label ?? id,
  });
  errors.push(...sanitized.errors);
  warnings.push(...sanitized.warnings);
  // v1 documents carry a single flat look and no scenarios; they stay valid
  // as a style whose scenarios inherit the canonical renditions.
  const scenarioResult = sanitizeEnvironmentScenarios(presetSource.scenarios);
  errors.push(...scenarioResult.errors);
  warnings.push(...scenarioResult.warnings);

  const ok = errors.length === 0;
  return {
    errors,
    ok,
    value: ok
      ? {
        description: sanitized.value.description,
        features: sanitized.value.features,
        id,
        label: sanitized.value.label,
        materialLook: sanitized.value.materialLook,
        parameters: sanitized.value.parameters,
        rig: sanitized.value.rig,
        ...(scenarioResult.scenarios === undefined ? {} : { scenarios: scenarioResult.scenarios }),
      }
      : null,
    warnings,
  };
}

/**
 * Validates an environment preset document and registers it in one call.
 *
 * @param {object | string} document Document object or JSON string.
 * @param {{ overwrite?: boolean }} [options] Pass `overwrite: true` to replace an existing preset.
 * @returns {string} The registered preset name.
 * @throws {Error} If the document fails validation or the name is taken and `overwrite` is false.
 */
export function registerEnvironmentPresetDocument(document, { overwrite = false } = {}) {
  const result = validateEnvironmentPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerEnvironmentPreset(result.value.id, result.value, { overwrite });
}

// Built-in STYLES. Every style resolves in every canonical scenario; the
// historical single-look ids (interiorDay/interiorEvening/interiorNight/
// exteriorDay) resolve through ENVIRONMENT_PRESET_ALIASES as the Default
// style at that scenario, byte-identical to the presets they replaced.

registerEnvironmentPreset('default', {
  label: 'Default (Baseline)',
  // Canonical scenario renditions — settings identical to the historical
  // flat presets of the same name. Styles that do not author a scenario
  // inherit these over their own base.
  scenarios: {
    interiorDay: {
      parameters: {
        ambientProbeBlend: 0.35,
        ambientStrength: 0.22,
        aoWarmth: 0.6,
        interiorOcclusionStrength: 0.5,
      },
      rig: {
        dustMotes: true,
        probe: true,
        sun: true,
        timeOfDayHour: 12,
      },
    },
    interiorEvening: {
      parameters: {
        ambientProbeBlend: 0.4,
        ambientStrength: 0.42,
        directLightStrength: 0.85,
        interiorOcclusionStrength: 0.42,
        shadowLift: 0.3,
        spotLightStrength: 0.55,
      },
      rig: {
        dustMotes: true,
        lampIntensity: 0.8,
        probe: true,
        spotShadows: true,
        sun: true,
        timeOfDayHour: 18,
      },
    },
    interiorNight: {
      parameters: {
        ambientProbeBlend: 0.4,
        emissiveStrength: 0.7,
        pointLightStrength: 0.36,
        shadowLift: 0.56,
        spotLightStrength: 0.85,
      },
      rig: {
        lampIntensity: 1.3,
        probe: true,
        spotShadows: true,
        sun: false,
        timeOfDayHour: 22,
      },
    },
    exteriorDay: {
      features: {
        leftSideShadow: false,
        windowCutout: false,
      },
      parameters: {
        cloudShadowStrength: 0.35,
        heightFogDensity: 0.012,
        heightFogFalloff: 9,
        skyTintStrength: 0.4,
      },
      rig: {
        sun: true,
        timeOfDayHour: 12,
      },
    },
  },
});

// Flat-color / untextured scenes: strong grounding, gentle gradient interest,
// no room-specific darkening.
registerEnvironmentPreset('interiorStudio', {
  label: 'Interior Studio (Untextured)',
  features: {
    leftSideShadow: false,
  },
  parameters: {
    ambientProbeBlend: 0.3,
    ambientStrength: 0.9,
    aoWarmth: 0.45,
    lightingInfluence: 0.6,
    shadowLift: 0.5,
    specularStrength: 0.1,
    untexturedGradientStrength: 0.5,
    vertexAoStrength: 1.0,
  },
  rig: {
    bakeVertexAo: true,
    probe: true,
    spotShadows: true,
    sun: true,
  },
});

// Everything on with demo values: a feature tour, not a production look
// (pairs with the character 'showcase' preset).
registerEnvironmentPreset('showcase', {
  label: 'Showcase (All Features)',
  parameters: {
    ambientProbeBlend: 0.45,
    aoWarmth: 0.6,
    heightFogDensity: 0.006,
    interiorOcclusionStrength: 0.35,
    planarReflectionStrength: 0.32,
    specularStrength: 0.2,
    spotLightStrength: 0.6,
  },
  rig: {
    dustMotes: true,
    planarReflection: true,
    probe: true,
    spotShadows: true,
    sun: true,
    timeOfDayHour: 15,
  },
});

// Studio-managed signature look, curated by Call Me Sensei and updated over
// releases (unlike 'showcase', this is a production grade, not a feature
// tour). Community presets register alongside it via
// registerEnvironmentPreset / environment preset documents.
registerEnvironmentPreset('call_me_sensei', {
  label: 'Call Me Sensei',
  // Sparse material/object response over the base look. These are IP-owned
  // settings; assets keep the same stable classification under other styles.
  materialLook: {
    version: 1,
    baseMaterials: {
      glass: {
        parameters: {
          normalMapStrength: 0.35,
          specularShininess: 78,
          specularStrength: 0.42,
        },
      },
      metal: {
        parameters: {
          normalMapStrength: 0.68,
          specularShininess: 58,
          specularStrength: 0.26,
        },
      },
      mineral: {
        parameters: {
          normalMapStrength: 0.82,
          specularStrength: 0.05,
        },
      },
      rubber: {
        parameters: {
          normalMapStrength: 0.5,
          specularStrength: 0.025,
        },
      },
    },
    contentFlags: {
      emissive: {
        parameters: { emissiveStrength: 0.82 },
      },
      graphic: {
        parameters: {
          normalMapStrength: 0.2,
          specularStrength: 0.035,
        },
      },
    },
    // The finish axis is the one an audience actually reads at a glance:
    // brushed stainless next to charcoal powder coat is the same base material
    // and must not look like the same surface. Without these profiles the
    // finish was validated by the contract, stored on the material, and then
    // had no effect on the frame, so `metal`/`brushed` converted to the same
    // response as `mineral`/`raw`. Resolution order puts finishes AFTER
    // baseMaterials, so a finish refines its base rather than fighting it.
    finishes: {
      anodized: {
        parameters: {
          specularShininess: 70,
          specularSoftness: 0.3,
          specularStrength: 0.34,
        },
      },
      brushed: {
        // Anisotropic metal: a broad, smeared highlight (low shininess, wide
        // softness) rather than a point hit, plus a real sky pickup — that
        // cool skylight in the mid-tones is what says "metal" in an anime
        // frame, not the metalness channel the toon shader does not have.
        parameters: {
          skyTintStrength: 0.34,
          specularColor: [0.86, 0.9, 1],
          specularShininess: 26,
          specularSoftness: 0.42,
          specularStrength: 0.55,
        },
      },
      clearCoated: {
        parameters: {
          specularShininess: 140,
          specularSoftness: 0.14,
          specularStrength: 0.42,
        },
      },
      glazed: {
        parameters: {
          specularShininess: 120,
          specularSoftness: 0.16,
          specularStrength: 0.46,
        },
      },
      matte: {
        parameters: {
          specularShininess: 10,
          specularSoftness: 0.55,
          specularStrength: 0.03,
        },
      },
      mirror: {
        parameters: {
          skyTintStrength: 0.6,
          specularShininess: 240,
          specularSoftness: 0.08,
          specularStrength: 0.9,
        },
      },
      // Powder coat and enamel are dielectric films: a soft, broad sheen that
      // must stay clearly below `brushed` so painted metal and bare metal
      // separate at a glance.
      painted: {
        parameters: {
          specularShininess: 34,
          specularSoftness: 0.34,
          specularStrength: 0.14,
        },
      },
      polished: {
        parameters: {
          skyTintStrength: 0.45,
          specularShininess: 180,
          specularSoftness: 0.1,
          specularStrength: 0.7,
        },
      },
      raw: {
        parameters: {
          specularShininess: 12,
          specularSoftness: 0.5,
          specularStrength: 0.04,
        },
      },
      varnished: {
        parameters: {
          specularShininess: 90,
          specularSoftness: 0.2,
          specularStrength: 0.3,
        },
      },
    },
    objectClasses: {
      buildingExterior: {
        parameters: { normalMapStrength: 0.66 },
      },
    },
    structuralRoles: {
      cavity: {
        parameters: { shadowLift: 0.28 },
      },
    },
  },
  // Identity base: luminous blue-filled shade, restrained aerial haze, and
  // enough contrast for the light to stay alive. This preset is frequently
  // applied directly by games (without createStylizedWorld), so its base
  // must itself be production-safe at outdoor scale.
  parameters: {
    ambientProbeBlend: 0.45,
    ambientStrength: 0.38,
    aoWarmth: 0.5,
    cloudShadowCoverage: 0.55,
    cloudShadowScale: 0.008,
    cloudShadowStrength: 0.52,
    directLightStrength: 1.12,
    exposure: 1.06,
    heightFogColor: [0.63, 0.8, 0.98],
    heightFogDensity: 0.00055,
    heightFogFalloff: 400,
    lightingInfluence: 0.96,
    saturation: 1.2,
    shadowLift: 0.42,
    shadowTintColor: [0.68, 0.74, 0.94],
    skyTintStrength: 0.16,
    sunShadowStrength: 0.72,
    triplanarDetail: 1,
    triplanarDetailScale: 28,
    triplanarEdgeHighlight: 0.7,
    untexturedGradientStrength: 0.52,
  },
  rig: {
    probe: true,
    sun: true,
    timeOfDayHour: 14,
  },
  // The signature style authors every scenario itself — vivid variants of
  // the canonical venue × time renditions, never a single baked moment.
  scenarios: {
    interiorDay: {
      parameters: {
        ambientStrength: 0.24,
        aoWarmth: 0.55,
        interiorOcclusionStrength: 0.45,
      },
      rig: {
        dustMotes: true,
        timeOfDayHour: 12,
      },
    },
    interiorEvening: {
      parameters: {
        ambientProbeBlend: 0.4,
        ambientStrength: 0.4,
        directLightStrength: 0.85,
        interiorOcclusionStrength: 0.4,
        shadowLift: 0.32,
        spotLightStrength: 0.6,
      },
      rig: {
        dustMotes: true,
        lampIntensity: 0.85,
        spotShadows: true,
        timeOfDayHour: 18,
      },
    },
    interiorNight: {
      parameters: {
        ambientProbeBlend: 0.4,
        emissiveStrength: 0.75,
        pointLightStrength: 0.4,
        shadowLift: 0.58,
        spotLightStrength: 0.9,
      },
      rig: {
        lampIntensity: 1.35,
        spotShadows: true,
        sun: false,
        timeOfDayHour: 22,
      },
    },
    exteriorDay: {
      features: {
        leftSideShadow: false,
        windowCutout: false,
      },
      parameters: {
        cloudShadowCoverage: 0.55,
        cloudShadowScale: 0.008,
        cloudShadowStrength: 0.52,
        heightFogDensity: 0.00055,
        heightFogFalloff: 400,
      },
      rig: {
        timeOfDayHour: 14,
      },
    },
  },
});
