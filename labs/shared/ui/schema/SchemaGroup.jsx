// A settings group as a titled section: curated fields inline, advanced
// fields behind a disclosure (or inline with a ◆ marker in "flat" mode —
// the power drawer). Field metadata drives everything; hosts supply
// getValue/onChange/isDisabled exactly like the legacy createSettingsPanel.

import { useState } from 'react';
import { SchemaField } from './SchemaField.jsx';
import { localizeEditorText } from '../../../../src/i18n/locales.js';

export function SchemaGroup({
  fieldFilter = () => true,
  fields,
  flat = false,
  getValue,
  group,
  isDisabled = () => false,
  onChange,
  showCaption = true,
}) {
  const [open, setOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const visible = Object.values(fields ?? {}).filter(fieldFilter);
  if (visible.length === 0) return null;
  const basic = flat ? visible : visible.filter((field) => !field.advanced);
  const advanced = flat ? [] : visible.filter((field) => field.advanced);

  const renderField = (field) => {
    const disabled = isDisabled(field);
    return (
      <SchemaField
        key={field.id}
        disabled={Boolean(disabled)}
        disabledReason={typeof disabled === 'string' ? disabled : null}
        field={field}
        onChange={(value, interaction) => onChange(field, value, interaction)}
        value={getValue(field)}
      />
    );
  };

  return (
    <section className="tk-section" data-testid={`group-${group.id}`}>
      <div
        className="tk-section-title"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setOpen(!open);
        }}
      >
        {localizeEditorText(group.label)}
        <span style={{ opacity: 0.6 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <>
          {showCaption && group.description && (
            <div className="tk-section-caption">{localizeEditorText(group.description)}</div>
          )}
          <div className="tk-section-fields">{basic.map(renderField)}</div>
          {advanced.length > 0 && (
            <>
              <button
                type="button"
                className="tk-advanced-toggle"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                {advancedOpen ? '▾' : '▸'} {localizeEditorText('Advanced')} ({advanced.length})
              </button>
              {advancedOpen && <div className="tk-section-fields">{advanced.map(renderField)}</div>}
            </>
          )}
        </>
      )}
    </section>
  );
}
