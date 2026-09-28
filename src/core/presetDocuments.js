export function isPlainPresetObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cleanPresetObject(value) {
  return isPlainPresetObject(value) ? value : {};
}

function invalidPresetResult(message, warnings = []) {
  return {
    errors: [message],
    ok: false,
    value: null,
    warnings,
  };
}

export function parsePresetDocument(input, validateDocument, { invalidJsonLabel = 'preset' } = {}) {
  try {
    const source = typeof input === 'string' ? JSON.parse(input) : input;
    return validateDocument(source);
  } catch (error) {
    return invalidPresetResult(`Invalid ${invalidJsonLabel} JSON: ${error.message}`);
  }
}

export function validateSettingsPresetDocument(input, {
  collectWarnings = () => [],
  documentType,
  normalizeId,
  sanitizeSettings,
  schemaVersion,
  migrateDocument,
} = {}) {
  const warnings = [];

  if (!isPlainPresetObject(input)) {
    return {
      errors: ['Preset document must be a JSON object.'],
      ok: false,
      value: null,
      warnings,
    };
  }

  const migrated = migrateDocument(input);
  if (migrated.type !== documentType) {
    warnings.push(`Preset type "${migrated.type}" was normalized to "${documentType}".`);
  }

  const errors = [];
  if (migrated.version > schemaVersion) {
    errors.push(`Preset schema version ${migrated.version} is newer than supported version ${schemaVersion}.`);
  }

  const presetId = normalizeId(migrated.id);
  if (!presetId) errors.push('Preset id is required.');

  const settings = cleanPresetObject(migrated.settings);
  warnings.push(...collectWarnings(settings));

  const value = errors.length === 0
    ? {
      description: String(migrated.description ?? ''),
      id: presetId,
      label: String(migrated.label || presetId),
      settings: sanitizeSettings(settings),
      type: documentType,
      version: schemaVersion,
    }
    : null;

  return {
    errors,
    ok: errors.length === 0,
    value,
    warnings,
  };
}

export function createSettingsPresetDocument(id, definition = {}, {
  collectSettings,
  documentType,
  schemaVersion,
  validateDocument,
} = {}) {
  const source = cleanPresetObject(definition);
  const document = {
    description: source.description ?? '',
    id: id ?? source.id ?? source.name ?? source.preset,
    label: source.label ?? source.title ?? source.name ?? id,
    settings: collectSettings(source),
    type: documentType,
    version: schemaVersion,
  };
  const result = validateDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function serializePresetDocument(idOrDocument, definition = {}, {
  argumentCount = 2,
  createDocument,
  pretty = true,
} = {}) {
  const document = isPlainPresetObject(idOrDocument) && argumentCount <= 2
    ? createDocument(idOrDocument.id, idOrDocument)
    : createDocument(idOrDocument, definition);
  return JSON.stringify(document, null, pretty ? 2 : 0);
}
