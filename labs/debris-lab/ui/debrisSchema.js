// Adapts the debris field descriptors to the shared UI schema shape so
// SchemaGroup/SchemaField render them with Tree Lab's control quality:
// help tooltips, default hints, dirty-state reset dots, scrub values.

import {
  DEBRIS_LOOK_FIELDS,
  DEBRIS_SCATTER_FIELDS,
  DEBRIS_TYPE_DEFAULTS,
  DEBRIS_TYPE_FIELDS,
  DEFAULT_DEBRIS_SETTINGS,
} from '../../../src/debrisgen/index.js';

function toSchemaField(field, group, defaultValue) {
  return {
    defaultValue,
    description: field.caption,
    group,
    id: `${group}-${field.key}`,
    key: field.key,
    label: field.label,
    range: { max: field.max, min: field.min, step: field.step },
    type: 'number',
  };
}

function shapeDefault(type, key) {
  return DEBRIS_TYPE_DEFAULTS[type]?.shape?.[key] ?? DEFAULT_DEBRIS_SETTINGS.shape[key];
}

export function debrisShapeSchema(type) {
  return {
    fields: (DEBRIS_TYPE_FIELDS[type] ?? []).map(
      (field) => toSchemaField(field, 'shape', shapeDefault(type, field.key)),
    ),
    group: { description: 'Form of each generated piece.', id: 'shape', label: 'Shape' },
  };
}

export function debrisScatterSchema(type) {
  const assetDefaults = {
    ...DEFAULT_DEBRIS_SETTINGS.asset,
    ...(DEBRIS_TYPE_DEFAULTS[type]?.asset ?? {}),
  };
  return {
    fields: DEBRIS_SCATTER_FIELDS.map(
      (field) => toSchemaField(field, 'asset', assetDefaults[field.key]),
    ),
    group: { description: 'How pieces fill the footprint.', id: 'scatter', label: 'Placement' },
  };
}

export function debrisLookSchema() {
  return {
    fields: DEBRIS_LOOK_FIELDS.map(
      (field) => toSchemaField(field, 'surface', DEFAULT_DEBRIS_SETTINGS.surface[field.key]),
    ),
    group: { description: 'Shading response and color behaviour.', id: 'look', label: 'Look' },
  };
}
