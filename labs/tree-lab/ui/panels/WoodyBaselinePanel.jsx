import { useEffect, useState } from 'react';
import {
  WOODY_BASELINE_CONTROLS,
  WOODY_BASELINE_CONTROL_GROUPS,
  WOODY_BASELINE_ENUM_OPTIONS,
  TREE_SPECIES_PROFILE_BY_ID,
  woodyBaselineInheritedControlsForSpecies,
  woodyBaselineControlLabel,
} from '../../../../src/vegetation/experimental.js';
import { colorToHex, hexToColorArray } from '../../../../src/debug/fieldValues.js';

const CONTROLS_BY_GROUP = Object.freeze(Object.fromEntries(
  WOODY_BASELINE_CONTROL_GROUPS.map((group) => [
    group.id,
    WOODY_BASELINE_CONTROLS.filter((control) => control.group === group.id),
  ]),
));

function valueControl(control, value, onChange) {
  const options = WOODY_BASELINE_ENUM_OPTIONS[control.id];
  if (options) {
    return (
      <select
        className="tk-select"
        data-testid={`baseline-${control.id}`}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>{woodyBaselineControlLabel(option)}</option>
        ))}
      </select>
    );
  }
  if (control.valueType === 'boolean') {
    return (
      <input
        checked={Boolean(value)}
        data-testid={`baseline-${control.id}`}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    );
  }
  if (control.valueType === 'color') {
    return (
      <input
        data-testid={`baseline-${control.id}`}
        onChange={(event) => onChange(hexToColorArray(event.target.value, value))}
        type="color"
        value={colorToHex(value)}
      />
    );
  }
  return (
    <input
      className="tk-input"
      data-testid={`baseline-${control.id}`}
      inputMode="decimal"
      onChange={(event) => {
        const next = control.valueType === 'integer'
          ? Number.parseInt(event.target.value, 10)
          : Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      step={control.valueType === 'integer' ? 1 : 'any'}
      type="number"
      value={value}
    />
  );
}

function coverageCopy(control) {
  if (control.coverage === 'exact-graph') {
    return 'Evaluated by Toonlab’s native recursive woody growth runtime.';
  }
  if (control.coverage === 'toonlab-replacement') {
    return 'Implemented by Toonlab’s own stylized material/output layer.';
  }
  if (control.coverage === 'local-resource') {
    return 'Requires a local object or collection binding; recipes store no external datablock.';
  }
  return 'Owned by the host scene and intentionally not serialized in the tree recipe.';
}

function BaselineControlRow({
  actions,
  control,
  inheritedValue,
  overridden,
  value,
}) {
  const editable = control.recipe;
  const effectiveValue = overridden ? value : inheritedValue;
  return (
    <div
      className="tk-field"
      data-coverage={control.coverage}
      data-testid={`baseline-row-${control.id}`}
      title={coverageCopy(control)}
    >
      <span className="tk-field-label">
        <span className="tk-field-label-text">{woodyBaselineControlLabel(control)}</span>
        <span style={{ display: 'block', font: 'var(--type-caption)', opacity: 0.52 }}>
          {control.id}
        </span>
      </span>
      {editable ? (
        <span className="tk-baseline-editor">
          {valueControl(
            control,
            effectiveValue,
            (next) => actions.setBaselineControl(control.id, next, { snapshot: false }),
          )}
          {overridden && (
            <button
              className="tk-baseline-reset"
              onClick={() => actions.clearBaselineControl(control.id)}
              title="Reset this value to the selected species baseline"
              type="button"
            >
              Reset
            </button>
          )}
        </span>
      ) : (
        <span style={{ gridColumn: '2 / -1', font: 'var(--type-caption)', opacity: 0.6 }}>
          {control.coverage === 'local-resource' ? 'Local binding' : 'Pipeline-owned'}
        </span>
      )}
    </div>
  );
}

function BaselineControlGroup({
  actions,
  group,
  inheritedControls,
  initiallyOpen,
  needle,
  overrides,
}) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => {
    if (needle) setOpen(true);
  }, [needle]);

  return (
    <details
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
      style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '7px 2px',
      }}
    >
      <summary style={{ cursor: 'pointer', font: 'var(--type-label)' }}>
        {group.label} · {group.controls.length}
      </summary>
      <div style={{ font: 'var(--type-caption)', margin: '5px 4px 8px', opacity: 0.58 }}>
        {group.description}
      </div>
      {group.controls.map((control) => (
        <BaselineControlRow
          key={control.id}
          actions={actions}
          control={control}
          inheritedValue={inheritedControls?.[control.id]}
          overridden={Object.hasOwn(overrides, control.id)}
          value={overrides[control.id]}
        />
      ))}
    </details>
  );
}

export function WoodyBaselinePanel({
  actions,
  filter = '',
  groupIds = null,
  labKind,
  state,
  title = 'Woody generation · 131 controls',
}) {
  if (labKind !== 'tree') return null;
  const profile = state.settings.plant.speciesProfileId
    ? TREE_SPECIES_PROFILE_BY_ID[state.settings.plant.speciesProfileId]
    : null;
  const applicable = profile && ['woody-axis', 'whorled-conifer'].includes(profile.engine);
  const inheritedControls = applicable
    ? woodyBaselineInheritedControlsForSpecies(profile)
    : {};
  const overrides = state.settings.baselineControls ?? {};
  const needle = filter.trim().toLowerCase();
  const visibleGroups = WOODY_BASELINE_CONTROL_GROUPS
    .filter((group) => !groupIds || groupIds.includes(group.id))
    .map((group) => ({
      ...group,
      controls: CONTROLS_BY_GROUP[group.id].filter((control) => (
        !needle
        || control.id.toLowerCase().includes(needle)
        || group.label.toLowerCase().includes(needle)
        || woodyBaselineControlLabel(control).toLowerCase().includes(needle)
      )),
    }))
    .filter((group) => group.controls.length > 0);

  return (
    <section className="tk-section" data-testid="woody-baseline-controls">
      <div className="tk-section-title">{title}</div>
      <div className="tk-section-caption">
        {applicable
          ? `Testing ${profile.commonName}. Every recipe value is directly editable; Reset restores its researched species baseline.`
          : 'Choose an experimental woody or conifer species to edit this baseline. Other plant architectures use their own control sections.'}
      </div>
      {applicable && visibleGroups.map((group, groupIndex) => (
        <BaselineControlGroup
          key={`${group.id}:${needle ? 'filtered' : 'all'}`}
          actions={actions}
          group={group}
          inheritedControls={inheritedControls}
          initiallyOpen={Boolean(needle) || groupIndex < 3}
          needle={needle}
          overrides={overrides}
        />
      ))}
    </section>
  );
}
