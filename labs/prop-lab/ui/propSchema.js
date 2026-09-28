// Adapts the prop field descriptors to the shared UI schema shape so
// SchemaGroup/SchemaField render them with Tree Lab's control quality:
// help tooltips, default hints, dirty-state reset dots, scrub values.

import {
  DEFAULT_PROP_SETTINGS,
  PROP_LOOK_FIELDS,
  PROP_TYPE_DEFAULTS,
  PROP_TYPE_FIELDS,
} from '../../../src/propgen/index.js';

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
  return PROP_TYPE_DEFAULTS[type]?.shape?.[key] ?? DEFAULT_PROP_SETTINGS.shape[key];
}

export function propShapeSchema(type) {
  return {
    fields: (PROP_TYPE_FIELDS[type] ?? []).map(
      (field) => toSchemaField(field, 'shape', shapeDefault(type, field.key)),
    ),
    group: { description: 'Form of this kind of prop.', id: 'shape', label: 'Shape' },
  };
}

export function propSizeSchema() {
  return {
    fields: [toSchemaField({
      caption: 'Uniform scale applied to the whole prop.',
      key: 'scale',
      label: 'Scale',
      max: 4,
      min: 0.25,
      step: 0.05,
    }, 'asset', DEFAULT_PROP_SETTINGS.asset.scale)],
    group: { description: 'Overall size in world meters.', id: 'size', label: 'Size' },
  };
}

export function propLookSchema() {
  return {
    fields: PROP_LOOK_FIELDS.map(
      (field) => toSchemaField(field, 'surface', DEFAULT_PROP_SETTINGS.surface[field.key]),
    ),
    group: { description: 'Shading response and color behaviour.', id: 'look', label: 'Look' },
  };
}
