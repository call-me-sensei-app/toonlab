// One settings-schema field rendered with kit controls: label (with help
// tooltip + reset affordance), typed control, scrubbable value. Schema shape
// per src/debug/fieldValues.js conventions: { type, label, description,
// range, options, optionLabels, defaultValue } plus the redesign's optional
// { unit, display, control } extensions.

import {
  ColorWell, SearchSelect, SegmentedControl, Select, TextField, Toggle,
} from '../components/primitives.jsx';
import { ScrubValue, Slider } from '../components/Slider.jsx';
import { Tooltip } from '../components/overlays.jsx';
import { localizeEditorText } from '../../../../src/i18n/locales.js';

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

function displayValue(field, value) {
  const scale = field.display?.scale ?? 1;
  return value * scale;
}

function storedValue(field, shown) {
  const scale = field.display?.scale ?? 1;
  return shown / scale;
}

export function SchemaField({
  disabled = false, disabledReason = null, field, onChange, value,
}) {
  const fieldLabel = localizeEditorText(field.label);
  const fieldDescription = localizeEditorText(field.description);
  const dirty = field.defaultValue !== undefined && !sameValue(value, field.defaultValue);
  const testId = `field-${field.group}-${field.key}`;

  let control = null;
  let readout = null;

  if (field.type === 'boolean') {
    control = <Toggle checked={Boolean(value)} disabled={disabled} onChange={onChange} testId={testId} />;
  } else if (field.type === 'select' && field.control === 'segmented' && (field.options?.length ?? 0) <= 4) {
    control = (
      <SegmentedControl
        disabled={disabled}
        onChange={(next) => onChange(typeof field.defaultValue === 'number' ? Number(next) : next)}
        options={field.options.map((option) => ({
          label: localizeEditorText(field.optionLabels?.[String(option)] ?? String(option)),
          value: option,
        }))}
        testId={testId}
        value={value}
      />
    );
  } else if (field.type === 'select' && field.control === 'search-select') {
    control = (
      <SearchSelect
        disabled={disabled}
        onChange={(next) => onChange(typeof field.defaultValue === 'number' ? Number(next) : next)}
        options={(field.options ?? []).map((option) => ({
          disabled: Boolean(field.optionDisabled?.[String(option)]),
          disabledReason: field.optionDisabled?.[String(option)]
            ? localizeEditorText(field.optionDisabled[String(option)])
            : null,
          label: localizeEditorText(field.optionLabels?.[String(option)] ?? String(option)),
          value: option,
        }))}
        testId={testId}
        value={value}
      />
    );
  } else if (field.type === 'select') {
    control = (
      <Select
        disabled={disabled}
        onChange={(next) => onChange(typeof field.defaultValue === 'number' ? Number(next) : next)}
        options={(field.options ?? []).map((option) => ({
          disabled: Boolean(field.optionDisabled?.[String(option)]),
          disabledReason: field.optionDisabled?.[String(option)]
            ? localizeEditorText(field.optionDisabled[String(option)])
            : null,
          label: localizeEditorText(field.optionLabels?.[String(option)] ?? String(option)),
          value: option,
        }))}
        testId={testId}
        value={value}
      />
    );
  } else if (field.type === 'color') {
    // Nullable colors ("unset — material default", e.g. environment
    // parameters) render a neutral well; editing commits a real value.
    if (value == null) {
      value = Array.isArray(field.defaultValue) ? field.defaultValue : [1, 1, 1];
    }
    // Multi-color specs (list of hex strings — e.g. autumn palettes) render
    // as a swatch strip; editing happens in the feature UI that set them.
    if (Array.isArray(value) && typeof value[0] === 'string') {
      control = (
        <span style={{ display: 'flex', gap: 3 }}>
          {value.map((hex, index) => (
            <span
              key={`${hex}-${index}`}
              style={{
                background: hex, border: '1px solid var(--border-strong)', borderRadius: 3, height: 16, width: 16,
              }}
            />
          ))}
        </span>
      );
    } else {
      control = <ColorWell disabled={disabled} onChange={onChange} testId={testId} value={value} />;
    }
  } else if (field.type === 'vector2' || field.type === 'vector3' || field.type === 'vector4') {
    // Direction/vector fields: one scrubbable value per component, emitting a
    // plain array (the settings-schema convention for vectors). Water uses
    // these for waveDirection/flowDirection (XZ) and sunDirection (XYZ); the
    // toon schema adds vector4 (RGBA-style color+strength quads).
    const size = field.type === 'vector2' ? 2 : field.type === 'vector3' ? 3 : 4;
    const min = field.min ?? field.range?.min ?? -1;
    const max = field.max ?? field.range?.max ?? 1;
    const step = field.step ?? field.range?.step ?? 0.01;
    const parts = Array.from({ length: size }, (_, index) => {
      const component = Array.isArray(value) ? Number(value[index]) : NaN;
      return Number.isFinite(component) ? component : 0;
    });
    control = (
      <span className="tk-vector" data-testid={testId} style={{ display: 'flex', gap: 4 }}>
        {parts.map((component, index) => (
          <ScrubValue
            disabled={disabled}
            key={index}
            max={max}
            min={min}
            onChange={(next) => {
              const updated = parts.slice();
              updated[index] = next;
              onChange(updated);
            }}
            step={step}
            value={component}
          />
        ))}
      </span>
    );
  } else if (field.type === 'number') {
    const range = field.range ?? { max: 1, min: 0, step: 0.01 };
    const scale = field.display?.scale ?? 1;
    // Nullable numbers ("unset — material default") sit at their default (or
    // the range floor) until edited.
    const inherited = value == null && field.defaultValue === null;
    if (value == null) value = Number.isFinite(field.defaultValue) ? field.defaultValue : range.min;
    control = (
      <Slider
        defaultValue={field.defaultValue}
        disabled={disabled}
        max={range.max}
        min={range.min}
        onChange={onChange}
        step={range.step}
        testId={testId}
        value={value}
      />
    );
    readout = inherited ? <span className="tk-field-value" title="Uses the material-specific lighting floor until overridden">Inherit</span> : (
      <ScrubValue
        disabled={disabled}
        max={displayValue(field, range.max)}
        min={displayValue(field, range.min)}
        onChange={(shown, interaction) => onChange(storedValue(field, shown), interaction)}
        step={range.step * scale}
        unit={field.unit ?? null}
        value={displayValue(field, value)}
      />
    );
  } else {
    control = <TextField disabled={disabled} onCommit={onChange} testId={testId} value={String(value ?? '')} />;
  }

  return (
    <div className="tk-field" data-disabled={disabled || undefined}>
      <Tooltip
        content={disabled && disabledReason ? localizeEditorText(disabledReason) : fieldDescription}
        meta={field.defaultValue !== undefined && !disabled
          ? `${localizeEditorText('Default')}: ${String(field.defaultValue)}`
          : null}
      >
        <span className="tk-field-label">
          <button
            type="button"
            className="tk-field-reset"
            data-dirty={dirty || undefined}
            aria-label={localizeEditorText(`Reset ${field.label} to default`)}
            disabled={disabled}
            onClick={() => onChange(field.defaultValue)}
          >
            ●
          </button>
          <span className="tk-field-label-text">{fieldLabel}</span>
        </span>
      </Tooltip>
      {control}
      {readout ?? <span />}
    </div>
  );
}
