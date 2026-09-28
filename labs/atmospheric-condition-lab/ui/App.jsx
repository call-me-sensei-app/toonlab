import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEditorHeader,
  LabTimeOfDayControl,
  Popover,
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SegmentedControl,
  Select,
  Slider,
  TextField,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import {
  ATMOSPHERIC_CONDITION_FIELD_COUNT,
  ATMOSPHERIC_CONDITION_FIELD_SCHEMA,
  ATMOSPHERIC_CONDITION_GROUPS,
  getAtmosphericConditionOptions,
  getAtmosphericConditionSetOptions,
} from '../../../src/atmospheric-condition/index.js';
import {
  SKY_CLOUD_ATMOSPHERE_PREVIEW_MODES,
} from '../../shared/skyCloudAtmospherePreview.js';

const SECTION_ICONS = Object.freeze({
  air: 'stage-look',
  ceiling: 'stage-pieces',
  electric: 'stage-animation',
  flow: 'stage-animation',
  fog: 'stage-detail',
  light: 'stage-look',
  precipitation: 'stage-animation',
});

const WORKSPACE_SCOPE = Object.freeze({
  atmosphere: Object.freeze({
    initialSection: 'fog',
    label: 'Atmosphere, Fog & Volumetrics Lab',
    shortLabel: 'Atmosphere workspace',
  }),
  cloud: Object.freeze({
    initialSection: 'ceiling',
    label: 'Cloud Shader Lab',
    shortLabel: 'Cloud workspace',
  }),
  condition: Object.freeze({
    initialSection: 'air',
    label: 'Atmospheric Condition Lab',
    shortLabel: 'Condition workspace',
  }),
});

function valueAtPath(source, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], source);
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else {
      for (const error of result.errors ?? ['Could not import this condition.']) {
        toast(error, { tone: 'danger' });
      }
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Condition document" width={320}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField
            onCommit={setName}
            placeholder="Condition name…"
            value={name}
          />
          <Button
            kind="primary"
            onClick={() => {
              actions.setName(name);
              onClose();
            }}
          >
            Rename
          </Button>
        </div>
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(
              actions.exportDocument(),
              `${state.name.replace(/\s+/g, '-').toLowerCase()
                || 'atmospheric-condition'}.atmospheric-condition.json`,
              'application/json',
            );
            onClose();
          }}
        >
          Export condition JSON
        </Button>
        <Button kind="secondary" onClick={importJson}>
          Import condition JSON…
        </Button>
        <Button
          kind="danger"
          onClick={() => {
            actions.resetLab();
            onClose();
          }}
        >
          Reset lab
        </Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, labName, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const menus = createLabEditorMenus({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onRedo: () => actions.redo(),
    onUndo: () => actions.undo(),
  });
  return (
    <LabEditorHeader className="gr-topbar" menus={menus}>
      <BrandLockup labName={labName} />
      <button
        type="button"
        className="gr-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({
          x: event.clientX,
          y: event.clientY + 10,
        })}
      >
        {state.name}
        {state.presetDirty && <span className="gr-dirty">●</span>}
        <Icon name="chevron-down" />
      </button>
      <span className="gr-topbar-spacer" />
      <RendererToggle />
      {menuAnchor && (
        <DocumentMenu
          actions={actions}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          state={state}
        />
      )}
    </LabEditorHeader>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {ATMOSPHERIC_CONDITION_GROUPS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="gr-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id] ?? 'stage-look'} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = ATMOSPHERIC_CONDITION_GROUPS
    .find((entry) => entry.id === sectionId)
    ?? ATMOSPHERIC_CONDITION_GROUPS[0];
  const conditionOptions = [
    ...(state.conditionId === null
      ? [{ label: 'Custom…', value: '' }]
      : []),
    ...getAtmosphericConditionOptions({ set: state.setId })
      .map((entry) => ({ label: entry.label, value: entry.id })),
  ];
  const setOptions = getAtmosphericConditionSetOptions()
    .map((entry) => ({ label: entry.label, value: entry.id }));

  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRowShell
        label="Set"
        title="Condition collection identity. The transferred fifteen-profile collection is the Call Me Sensei set."
      >
        <Select
          disabled={setOptions.length === 1}
          onChange={() => {}}
          options={setOptions}
          testId="condition-set-select"
          value={state.setId}
        />
      </PresetRowShell>
      <PresetRowShell
        label="Condition"
        title="Current reusable world-state condition. It references independent shader styles and source assets."
      >
        <Select
          onChange={(id) => {
            if (id) actions.applyCondition(id);
          }}
          options={conditionOptions}
          testId="condition-select"
          value={state.conditionId ?? ''}
        />
      </PresetRowShell>
      {state.workspaceScope === 'condition' ? (
        <div className="ac-boundary-note">
          <strong>Condition state only.</strong>
          {' '}Shader treatment and generated sky/cloud/volume assets are separate documents.
        </div>
      ) : (
        <div className="ac-boundary-note">
          <strong>Shared preview host.</strong>
          {' '}Independent {state.workspaceScope} shader-profile controls are being migrated.
          The controls below edit the condition inputs consumed by that renderer.
        </div>
      )}
      <h2 className="gr-inspector-header">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <SchemaGroup
        fields={ATMOSPHERIC_CONDITION_FIELD_SCHEMA[section.id]}
        getValue={(field) => valueAtPath(state.settings, field.path)}
        group={section}
        onChange={(field, value) => actions.setSetting(field.path, value)}
        showCaption={false}
      />
    </aside>
  );
}

function ConditionPreviewBar({ actions, state }) {
  const nativeReference = state.view.previewMode === 'native';
  return (
    <PreviewBar title="Shared sky · cloud · atmosphere · weather preview. Preview mode, time, exposure, and effects visibility are never saved into the condition document.">
      <span className="ac-preview-family" title="The same stage contract is used by Sky, Cloud, Atmosphere, and Atmospheric Condition Labs.">
        Sky · Cloud · Atmosphere · Weather
      </span>
      <SegmentedControl
        onChange={(previewMode) => actions.setView({ previewMode })}
        options={SKY_CLOUD_ATMOSPHERE_PREVIEW_MODES.map((entry) => ({
          label: entry.label,
          title: entry.title,
          value: entry.id,
        }))}
        testId="atmospheric-preview-mode"
        value={state.view.previewMode}
      />
      <LabTimeOfDayControl
        autoCycle={state.previewAutoCycle}
        hour={state.previewHour}
        onAutoCycleChange={(value) => actions.setPreviewAutoCycle(value)}
        onHourChange={(value) => actions.setPreviewHour(value)}
      />
      <PreviewToggle
        checked={!nativeReference && state.view.effectsEnabled}
        disabled={nativeReference}
        label="Particles"
        onChange={(effectsEnabled) => actions.setView({ effectsEnabled })}
        testId="preview-effects"
        title={nativeReference
          ? 'Native reference captures are shown without ToonLab diagnostic overlays.'
          : 'Preview precipitation and atmospheric flow effects.'}
      />
      <span className="tk-previewbar-slider" title="Indoor/exposure suppression preview; condition atmosphere remains active.">
        <span>Exposure</span>
        <Slider
          max={1}
          min={0}
          onChange={(exposure) => actions.setView({ exposure })}
          step={0.01}
          value={state.view.exposure}
        />
      </span>
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const previewLabel = state.view.previewMode === 'native'
    ? 'native reference at exact time anchors'
    : 'live diagnostic depth stage';
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">
        {state.status || (state.engineReady
          ? 'Live shared environment preview ready.'
          : 'Loading shared environment preview…')}
      </span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta">
        Call Me Sensei set · {ATMOSPHERIC_CONDITION_FIELD_COUNT} authored inputs · {previewLabel}
      </span>
    </footer>
  );
}

export function App({ store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const workspace = WORKSPACE_SCOPE[state.workspaceScope]
    ?? WORKSPACE_SCOPE.condition;
  const [sectionId, setSectionId] = useState(workspace.initialSection);

  useEffect(() => {
    document.title = `${state.name} — ${workspace.label}`;
  }, [state.name, workspace.label]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} labName={workspace.label} state={state} />
        <SectionRail
          activeSection={sectionId}
          onSectionChange={setSectionId}
        />
        <Inspector
          actions={actions}
          sectionId={sectionId}
          state={state}
        />
        <StatusBar state={state} />
      </div>
      <ConditionPreviewBar actions={actions} state={state} />
      <ToastStack />
    </div>
  );
}
