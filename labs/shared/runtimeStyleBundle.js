import {
  createStyleBundleDocument,
  serializeStyleBundle,
} from '../../src/styles/index.js';

function slug(value, fallback = 'style') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

/**
 * Wrap one lab-owned, runtime-validated style document in the canonical
 * ToonLab style-bundle envelope. Asset recipes and transient preview state
 * must never be passed here.
 */
export function createSingleSlotStyleBundle({
  description = '',
  label,
  slotId,
  styleDocument,
}) {
  if (!slotId) throw new Error('A ToonLab style-bundle slot id is required.');
  if (!styleDocument || typeof styleDocument !== 'object') {
    throw new Error('A validated runtime style document is required.');
  }
  const cleanLabel = String(label ?? '').trim() || 'Untitled style';
  return createStyleBundleDocument(`${slug(cleanLabel)}-bundle`, {
    description: description || `${cleanLabel} exported from ToonLab.`,
    label: `${cleanLabel} bundle`,
    slots: {
      [slotId]: { document: styleDocument },
    },
  });
}

export function serializeSingleSlotStyleBundle(options) {
  return serializeStyleBundle(createSingleSlotStyleBundle(options));
}
