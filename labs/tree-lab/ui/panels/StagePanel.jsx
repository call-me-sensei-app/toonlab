// The right inspector's body for one workflow stage. Tree Lab deliberately
// exposes the complete baseline in its named sections; there is no
// basic/advanced split until the exhaustive control model has been tuned.

import {
  TREE_SETTING_FIELD_SCHEMA,
  TREE_SETTING_GROUPS,
} from '../../../../src/vegetation/experimental.js';
import { readFieldValueFromSettings } from '../../../../src/debug/fieldValues.js';
import { SchemaGroup } from '../../../shared/ui/index.js';
import { fieldsForLab, groupForLab, isFieldDisabled } from '../fieldRules.js';

const GROUPS_BY_ID = Object.fromEntries(TREE_SETTING_GROUPS.map((group) => [group.id, group]));

const TREE_PLANT_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Botanical identity and plant category.',
    fieldIds: Object.freeze(['plant.type', 'plant.speciesProfileId', 'plant.stylePreset']),
    id: 'identity',
    label: 'Plant identity',
  }),
  Object.freeze({
    description: 'Deterministic individual, biological stage, overall size, and seasonal state.',
    fieldIds: Object.freeze([
      'plant.seed',
      'plant.size',
      'plant.lifeStageSlot',
      'plant.developmentProgress',
      'plant.foliageState',
    ]),
    id: 'development',
    label: 'Development',
  }),
  Object.freeze({
    description: 'Cultivated or trained structure applied after species and age.',
    fieldIds: Object.freeze(['plant.growthForm', 'plant.growthFormSubtype']),
    id: 'form-training',
    label: 'Form and training',
  }),
]);

export function PlantSections({ actions, fieldFilter = () => true, state }) {
  const fields = fieldsForLab(TREE_SETTING_FIELD_SCHEMA.plant, 'tree', state);
  return TREE_PLANT_SECTIONS.map((section) => {
    const sectionFields = Object.fromEntries(Object.entries(fields).filter(([, field]) => (
      section.fieldIds.includes(field.id) && fieldFilter(field)
    )));
    if (!Object.keys(sectionFields).length) return null;
    return (
      <SchemaGroup
        key={section.id}
        fields={sectionFields}
        flat
        getValue={(field) => readFieldValueFromSettings(state.settings, field)}
        group={section}
        isDisabled={(field) => isFieldDisabled(state, field)}
        onChange={(field, value, interaction) => actions.setField(field, value, {
          snapshot: interaction ? Boolean(interaction.gestureStart) : true,
          transient: Boolean(interaction?.transient),
        })}
      />
    );
  });
}

export function StagePanel({
  actions, flat = false, groupIds, labKind = 'tree', state,
}) {
  return groupIds.map((groupId) => {
    if (groupId === 'plant' && labKind === 'tree') {
      return <PlantSections key={groupId} actions={actions} state={state} />;
    }
    return (
      <SchemaGroup
        key={groupId}
        fields={fieldsForLab(TREE_SETTING_FIELD_SCHEMA[groupId], labKind, state)}
        flat={labKind === 'tree' ? true : flat}
        getValue={(field) => readFieldValueFromSettings(state.settings, field)}
        group={groupForLab(GROUPS_BY_ID[groupId], labKind)}
        isDisabled={(field) => isFieldDisabled(state, field)}
        onChange={(field, value, interaction) => actions.setField(field, value, {
          snapshot: interaction ? Boolean(interaction.gestureStart) : true,
          transient: Boolean(interaction?.transient),
        })}
      />
    );
  });
}
