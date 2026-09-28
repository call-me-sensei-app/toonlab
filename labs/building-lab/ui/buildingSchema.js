// Adapts the building field metadata to the shared UI schema shape so
// SchemaGroup/SchemaField render it with Tree Lab's control quality.
// BUILDING_SETTING_FIELD_SCHEMA is already field-shaped ({ type, label,
// description, range, options, optionLabels, defaultValue }); the adapter
// only swaps per-type defaults in so dirty dots, reset affordances, and
// default hints track the active building type.

import {
  BUILDING_SETTING_FIELD_SCHEMA,
  BUILDING_SETTING_GROUPS,
  BUILDING_TYPE_DEFAULTS,
} from '../../../src/buildinggen/index.js';

function withTypeDefault(field, type) {
  const override = BUILDING_TYPE_DEFAULTS[type]?.[field.group]?.[field.key];
  if (override === undefined) return field;
  return { ...field, defaultValue: Array.isArray(override) ? [...override] : override };
}

export function buildingGroupSchema(groupId, type) {
  const group = BUILDING_SETTING_GROUPS.find((entry) => entry.id === groupId);
  return {
    fields: Object.values(BUILDING_SETTING_FIELD_SCHEMA[groupId] ?? {}).map(
      (field) => withTypeDefault(field, type),
    ),
    group: { description: group.description, id: group.id, label: group.label },
  };
}
