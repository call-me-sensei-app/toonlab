// Schema-driven settings panel: renders the setting groups exported by the
// settings modules (TOON_SETTING_GROUPS / TOON_SETTING_FIELD_SCHEMA and
// friends) as collapsible groups of typed controls, without knowing anything
// about what the settings do.
//
//   const panel = createSettingsPanel({
//     container: document.getElementById('toonSettingGroups'),
//     groups: TOON_SETTING_GROUPS,
//     fieldSchema: TOON_SETTING_FIELD_SCHEMA,
//     getValue: (field) => readFieldValueFromSettings(settings, field),
//     onChange: (field, value) => applyOverride(field, value),
//   });
//   panel.refresh(); // re-pull every control value via getValue
//
// The host owns the settings state; the panel only reads through getValue and
// reports edits through onChange (after echoing the value back into the
// control and its <output>).

import { formatFieldValue, readFieldValueFromControl, writeFieldControlValue } from './fieldValues.js';

function createFieldControl(field, options) {
  const {
    dataAttribute, idPrefix, rowClassName, getValue, onChange, isDisabled, formatValue,
  } = options;

  const row = document.createElement('div');
  row.className = rowClassName;
  row.dataset[dataAttribute] = field.id;

  const controlId = `${idPrefix}_${field.group}_${field.key}`.replace(/[^a-z0-9_]/gi, '_');
  const label = document.createElement('label');
  label.htmlFor = controlId;
  label.textContent = field.label;
  label.title = field.description;

  let control;
  if (field.type === 'boolean') {
    control = document.createElement('input');
    control.type = 'checkbox';
  } else if (field.type === 'select') {
    control = document.createElement('select');
    for (const option of field.options ?? []) {
      const element = document.createElement('option');
      element.value = String(option);
      element.textContent = field.optionLabels?.[String(option)] ?? String(option);
      const disabledReason = field.optionDisabled?.[String(option)];
      element.disabled = Boolean(disabledReason);
      if (typeof disabledReason === 'string') element.title = disabledReason;
      control.append(element);
    }
  } else if (field.type === 'color') {
    control = document.createElement('input');
    control.type = 'color';
  } else if (field.type === 'number') {
    control = document.createElement('input');
    control.type = 'range';
    control.min = String(field.range?.min ?? 0);
    control.max = String(field.range?.max ?? 1);
    control.step = String(field.range?.step ?? 0.01);
  } else {
    control = document.createElement('input');
    control.type = 'text';
  }
  control.id = controlId;
  control.title = field.description;
  control.disabled = Boolean(isDisabled(field));

  const output = document.createElement('output');
  output.id = `${controlId}Value`;
  output.htmlFor = controlId;

  const eventName = field.type === 'number' || field.type === 'color' ? 'input' : 'change';
  control.addEventListener(eventName, () => {
    const value = readFieldValueFromControl(control, field);
    writeFieldControlValue(control, output, field, value, formatValue);
    onChange(field, value);
  });

  row.append(label, control, output);
  return row;
}

export function createSettingsPanel({
  container,
  groups,
  fieldSchema,
  getValue,
  onChange,
  fieldFilter = () => true,
  isDisabled = () => false,
  formatValue = formatFieldValue,
  dataAttribute = 'settingsField',
  idPrefix = 'setting',
  rowClassName = 'hud-control settings-field-control',
  groupClassName = 'toon-setting-group',
  fieldsClassName = 'toon-setting-fields',
  isGroupOpen = () => false,
  prepend = [],
}) {
  const fieldRows = [];
  const controlOptions = { dataAttribute, idPrefix, rowClassName, getValue, onChange, isDisabled, formatValue };

  function refresh() {
    for (const { field, control, output } of fieldRows) {
      control.disabled = Boolean(isDisabled(field));
      writeFieldControlValue(control, output, field, getValue(field), formatValue);
    }
  }

  if (container && container.childElementCount === 0) {
    for (const node of prepend) container.append(node);

    for (const group of groups) {
      const fields = Object.values(fieldSchema[group.id] ?? {}).filter(fieldFilter);
      if (fields.length === 0) continue;

      const details = document.createElement('details');
      details.className = groupClassName;
      details.dataset.settingsGroup = group.id;
      details.open = Boolean(isGroupOpen(group));

      const summary = document.createElement('summary');
      summary.textContent = group.label;
      summary.title = group.description;

      const fieldList = document.createElement('div');
      fieldList.className = fieldsClassName;
      for (const field of fields) {
        const row = createFieldControl(field, controlOptions);
        fieldList.append(row);
        fieldRows.push({
          control: row.querySelector('input, select'),
          field,
          output: row.querySelector('output'),
        });
      }

      details.append(summary, fieldList);
      container.append(details);
    }

    refresh();
  }

  return { container, refresh };
}

// A plain labelled <select> row for panel headers (preset pickers, debug view
// selectors) that live alongside the schema-generated groups.
export function createSelectRow({ id, label, title, options, value, onChange, rowClassName = 'hud-control' }) {
  const row = document.createElement('div');
  row.className = rowClassName;

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  labelEl.title = title;

  const select = document.createElement('select');
  select.id = id;
  select.title = title;
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    if (option.value === value) el.selected = true;
    select.append(el);
  }
  select.addEventListener('change', () => onChange(select.value));

  row.append(labelEl, select);
  return row;
}
