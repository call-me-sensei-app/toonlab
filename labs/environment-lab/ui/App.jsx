// Environment Shader Lab workspace: the Character Shader Lab chrome (top bar, workflow
// rail, focused schema groups in the right inspector, floating stage bar,
// status bar) pointed at the environment shader — customize your own
// environment look, save it as a style, walk it at character scale.

import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEditorHeader,
  Popover,
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  Select,
  Slider,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import {
  ENVIRONMENT_DEBUG_MODES,
  ENVIRONMENT_SETTING_FIELD_SCHEMA,
  ENVIRONMENT_SETTING_GROUPS,
} from '../../../src/environment/environmentMaterialAdapter.js';
import {
  getEnvironmentPresetOptions,
  getEnvironmentScenarioOptions,
} from '../../../src/environment/environmentPresets.js';
import { ENVIRONMENT_STAGE_OPTIONS } from './engine.js';

const DEBUG_OPTIONS = Object.keys(ENVIRONMENT_DEBUG_MODES).map((id) => ({
  label: id === 'off' ? 'Debug: off' : `Debug: ${id}`,
  value: id,
}));

// The environment schema has two groups: a feature-toggle board and the big
// shader parameter sheet. Split the parameter sheet across curated rail
// sections by key prefix so each section stays scannable.
const GROUP_BY_ID = Object.fromEntries(ENVIRONMENT_SETTING_GROUPS.map((group) => [group.id, group]));

const PARAMETER_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'How the material RESPONDS to scene lights — ambient acceptance, sun boost, shadow shaping. The lights themselves are preview-scene fixtures.',
    icon: 'stage-look',
    id: 'lightShadow',
    label: 'Response',
    match: (key) => /^(ambient|sun|shadow|direct|light)/i.test(key),
  }),
  Object.freeze({
    description: 'Occlusion, baked GI, and interior response.',
    icon: 'stage-wood',
    id: 'occlusion',
    label: 'Interior',
    match: (key) => /(occlusion|ao|gi|room|interior|window)/i.test(key),
  }),
  Object.freeze({
    description: 'Color, specular, emissive, fog, and everything else.',
    icon: 'stage-detail',
    id: 'surface',
    label: 'Surface',
    match: () => true,
  }),
]);

function parameterFieldsForSection(sectionId) {
  const fields = ENVIRONMENT_SETTING_FIELD_SCHEMA.parameters ?? {};
  const claimed = new Set();
  const result = {};
  for (const section of PARAMETER_SECTIONS) {
    for (const [key, field] of Object.entries(fields)) {
      if (claimed.has(key) || !section.match(key)) continue;
      claimed.add(key);
      if (section.id === sectionId) result[key] = field;
    }
  }
  return result;
}

// The rail and inspector hold ONLY the product — the environment shader
// style. Everything about the preview scene (stage model, debug view,
// walking) lives in the floating bar over the viewport, the same spatial
// split as the other labs: right panel = what you're making, controls on
// the 3D view = how you're looking at it.
const WORKSPACE_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Master switches per shader subsystem. Styles shape their look in the parameter sections (Light / Interior / Surface) — a feature turned OFF silences its parameters entirely.',
    icon: 'stage-pieces',
    id: 'features',
    label: 'Features',
  }),
  ...PARAMETER_SECTIONS.map((section) => Object.freeze({
    description: section.description,
    icon: section.icon,
    id: section.id,
    label: section.label,
  })),
]);

function PresetRow({ actions, state }) {
  const styleOptions = getEnvironmentPresetOptions();
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...styleOptions.map((entry) => ({ label: entry.label, value: entry.value })),
    ...state.localPresets.map((entry) => ({ label: `${entry.label} · saved`, value: entry.id })),
  ];
  // Every style resolves in every canonical scenario (venue × time of day);
  // flag the ones the selected style has not authored itself.
  const coverage = styleOptions.find((entry) => entry.value === state.presetId)?.scenarios;
  const scenarioOptions = [
    { label: 'Style base', value: '' },
    ...getEnvironmentScenarioOptions().map((scenario) => ({
      label: coverage?.[scenario.id] === 'inherited'
        ? `${scenario.label} · inherited`
        : scenario.label,
      value: scenario.id,
    })),
  ];
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  return (
    <>
      <PresetRowShell label="Style" title="The IP-wide environment-shader identity. It resolves across every venue and time scenario.">
        <Select
          onChange={(id) => { if (id) actions.applyPreset(id); }}
          options={options}
          testId="style-select"
          value={state.presetId ?? ''}
        />
        {isLocal && (
          <IconButton
            icon="trash"
            label="Delete this saved environment style"
            onClick={() => actions.deletePreset(state.presetId)}
          />
        )}
      </PresetRowShell>
      <PresetRowShell label="Scenario" title="The current venue and time rendered through the selected IP style.">
        <Select
          onChange={(scenario) => actions.setScenario(scenario || null)}
          options={scenarioOptions}
          testId="scenario-select"
          value={state.scenarioId ?? ''}
        />
      </PresetRowShell>
    </>
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not import the style.']) toast(error, { tone: 'danger' });
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={290}>
      <div className="el-doc-menu">
        <div className="el-save-row">
          <TextField onCommit={setName} placeholder="Environment name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
              else for (const error of result.errors ?? ['Could not save the style.']) toast(error, { tone: 'danger' });
            }}
          >
            Save
          </Button>
        </div>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to style
          </Button>
        )}
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(actions.exportDocument(), `${state.name.replace(/\s+/g, '-').toLowerCase() || 'environment'}.environment-preset.json`, 'application/json');
            onClose();
          }}
        >
          Export style JSON
        </Button>
        <Button kind="secondary" onClick={importJson}>Import style JSON…</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const menus = createLabEditorMenus({
    canRedo: state.canRedo, canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onRedo: () => actions.redo(), onUndo: () => actions.undo(),
  });
  return (
    <LabEditorHeader className="el-topbar" menus={menus}>
      <BrandLockup labName="Environment Shader Lab" />
      <button
        type="button"
        className="el-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="el-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="el-topbar-spacer" />
      <RendererToggle />
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </LabEditorHeader>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="el-rail tk" data-testid="section-rail">
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="el-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={section.icon} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId) ?? WORKSPACE_SECTIONS[0];
  const isParameterSection = PARAMETER_SECTIONS.some((entry) => entry.id === section.id);
  return (
    <aside className="el-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="el-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="el-inspector-caption">{section.description}</p>
      {section.id === 'features' && (
        <SchemaGroup
          fields={ENVIRONMENT_SETTING_FIELD_SCHEMA.features}
          getValue={(field) => state.settings.features?.[field.key]}
          group={GROUP_BY_ID.features}
          onChange={(field, value) => actions.setSetting('features', field.key, value)}
          showCaption={false}
        />
      )}
      {isParameterSection && (
        <SchemaGroup
          fields={parameterFieldsForSection(section.id)}
          getValue={(field) => state.settings.parameters?.[field.key]}
          group={{ ...GROUP_BY_ID.parameters, id: `parameters-${section.id}`, label: section.label }}
          onChange={(field, value) => actions.setSetting('parameters', field.key, value)}
          showCaption={false}
        />
      )}
    </aside>
  );
}

// Scene-preview configuration — the bottom floating bar over the viewport,
// the same home the Texture Lab gives its view options. Everything here is
// about LOOKING at the shader; the amber accent marks it as never saved.
function EnvironmentPreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar
      hint={state.view.walkPreview
        ? 'WASD/arrows move · Shift runs · Space jumps'
        : 'Left-drag rotate · wheel zoom · right-drag pan'}
      title="Preview only — the stage, debug view, scene lights, walking, and camera are never saved into your style."
    >
      <span className="el-stagebar-select">
        <Select
          onChange={(stage) => actions.setView({ stage })}
          options={ENVIRONMENT_STAGE_OPTIONS.map((entry) => ({ label: entry.label, value: entry.id }))}
          testId="stage-environment"
          value={state.view.stage}
        />
      </span>
      <span className="el-stagebar-select el-stagebar-select--debug">
        <Select
          onChange={(debug) => actions.setView({ debug })}
          options={DEBUG_OPTIONS}
          testId="stage-debug"
          value={state.view.debug}
        />
      </span>
      <span className="tk-previewbar-slider" title="Scene sun intensity — a preview fixture, not part of the style (the style holds the material's RESPONSE to it).">
        <span>Sun</span>
        <Slider
          max={2.5}
          min={0}
          onChange={(sunIntensity) => actions.setView({ sunIntensity })}
          step={0.05}
          testId="preview-sun"
          value={state.view.sunIntensity}
        />
      </span>
      <span className="tk-previewbar-slider" title="Scene ambient intensity — a preview fixture, not part of the style.">
        <span>Amb</span>
        <Slider
          max={1.2}
          min={0}
          onChange={(ambientIntensity) => actions.setView({ ambientIntensity })}
          step={0.02}
          testId="preview-ambient"
          value={state.view.ambientIntensity}
        />
      </span>
      <PreviewToggle
        checked={state.view.walkPreview}
        label="Walk"
        onChange={(walkPreview) => actions.setView({ walkPreview })}
        testId="walk-preview"
        title={WALK_PREVIEW_TITLE}
      />
      <IconButton icon="reset" label="Reset camera (C)" onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const stage = ENVIRONMENT_STAGE_OPTIONS.find((entry) => entry.id === state.view.stage);
  return (
    <footer className="el-status tk" data-testid="status-bar">
      <span className="el-status-message">{state.status}</span>
      <span className="el-status-spacer" />
      <span className="el-status-meta">
        {state.convertedMeshCount} materials · {stage?.label ?? state.view.stage}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('features');

  useEffect(() => { document.title = `${state.name} — Environment Shader Lab`; }, [state.name]);

  return (
    <div className="tk">
      <div className="el-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <EnvironmentPreviewBar actions={actions} engine={engine} state={state} />
      <ToastStack />
    </div>
  );
}
