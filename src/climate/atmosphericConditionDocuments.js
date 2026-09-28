import {
  DEFAULT_ATMOSPHERIC_CONDITION_SET,
  resolveAtmosphericCondition,
  resolveAtmosphericConditionSet,
} from './climateProfiles.js';

export const ATMOSPHERIC_CONDITION_DOCUMENT_TYPE =
  'toonlab-atmospheric-condition';
export const ATMOSPHERIC_CONDITION_DOCUMENT_VERSION = 1;

function settingsFromProfile(profile) {
  const { id: _id, label: _label, ...settings } = profile;
  return structuredClone(settings);
}

export function createAtmosphericConditionSettings(
  input = 'openSky',
  { set = DEFAULT_ATMOSPHERIC_CONDITION_SET } = {},
) {
  const source = typeof input === 'string'
    ? resolveAtmosphericCondition(input, { set })
    : resolveAtmosphericCondition({
      id: input.id ?? 'custom',
      label: input.label ?? 'Custom',
      ...input,
    }, { set });
  return settingsFromProfile(source);
}

export function createAtmosphericConditionDocument(
  id,
  {
    label = 'Untitled atmospheric condition',
    set = DEFAULT_ATMOSPHERIC_CONDITION_SET,
    settings = 'openSky',
  } = {},
) {
  const setDefinition = resolveAtmosphericConditionSet(set);
  const documentId = String(id || '').trim();
  if (!documentId) throw new TypeError('Atmospheric-condition documents require an id.');
  return {
    id: documentId,
    label: String(label || 'Untitled atmospheric condition'),
    setId: setDefinition.id,
    settings: createAtmosphericConditionSettings(settings, { set: setDefinition.id }),
    type: ATMOSPHERIC_CONDITION_DOCUMENT_TYPE,
    version: ATMOSPHERIC_CONDITION_DOCUMENT_VERSION,
  };
}

export function parseAtmosphericConditionDocument(input) {
  try {
    const value = typeof input === 'string' ? JSON.parse(input) : input;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Atmospheric-condition document must be an object.');
    }
    if (value.type !== ATMOSPHERIC_CONDITION_DOCUMENT_TYPE) {
      throw new TypeError(
        `Expected document type "${ATMOSPHERIC_CONDITION_DOCUMENT_TYPE}".`,
      );
    }
    if (value.version !== ATMOSPHERIC_CONDITION_DOCUMENT_VERSION) {
      throw new RangeError(
        `Unsupported atmospheric-condition document version "${value.version}".`,
      );
    }
    return {
      errors: [],
      ok: true,
      value: createAtmosphericConditionDocument(value.id, {
        label: value.label,
        set: value.setId,
        settings: value.settings,
      }),
    };
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      ok: false,
      value: null,
    };
  }
}

export function serializeAtmosphericConditionDocument(
  document,
  { pretty = true } = {},
) {
  const parsed = parseAtmosphericConditionDocument(document);
  if (!parsed.ok) throw new TypeError(parsed.errors.join(' '));
  return JSON.stringify(parsed.value, null, pretty ? 2 : 0);
}
