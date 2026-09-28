import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEntryChooser,
  LabEditorHeader,
  LabTimeOfDayControl,
  Modal,
  Popover,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SegmentedControl,
  Select,
  StyleBundleExportPrompt,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { ShaderPreviewStylesModal } from '../../shared/shader-preview/PreviewStylesModal.jsx';
import {
  getGroundShaderPresetOptions,
  GROUND_SHADER_FIELD_SCHEMA,
  GROUND_SHADER_SETTING_GROUPS,
} from '../../../src/ground-shader/index.js';
import { systemStyleLabel } from '../../../src/core/systemStylePolicy.js';

const SECTION_ICONS = Object.freeze({
  distance: 'stage-look',
  layers: 'stage-surface',
  lighting: 'stage-look',
  macro: 'stage-detail',
  material: 'stage-surface',
  projection: 'stage-shape',
  printResponse: 'stage-detail',
  shoreline: 'stage-animation',
  slope: 'stage-shape',
  weatherResponse: 'stage-animation',
});

const PRINT_PREVIEW_OPTIONS = Object.freeze([
  { label: 'Boot trail', value: 'boot' },
  { label: 'Paw trail', value: 'paw' },
  { label: 'Hoof trail', value: 'hoof' },
  { label: 'Tire track', value: 'tire' },
  { label: 'Impact marks', value: 'impact' },
]);

function DocumentMenu({ actions, anchor, onClose, onExport, state }) {
  const [name, setName] = useState(state.name);
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) {
      for (const warning of result.warnings ?? []) {
        toast(warning, { tone: 'warning' });
      }
      onClose();
    } else for (const error of result.errors ?? ['Could not import the Ground Shader profile.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Ground Shader document" width={320}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Ground Shader name…" value={name} />
          {isLocal && (
            <Button
              kind="primary"
              onClick={() => {
                const result = actions.updateStyle(name);
                if (result.ok) onClose();
                else for (const error of result.errors ?? []) toast(error, { tone: 'danger' });
              }}
            >
              Update
            </Button>
          )}
        </div>
        <Button
          kind={isLocal ? 'secondary' : 'primary'}
          onClick={() => {
            const result = actions.saveStyleAs(name);
            if (result.ok) onClose();
            else for (const error of result.errors ?? []) toast(error, { tone: 'danger' });
          }}
        >
          Save As…
        </Button>
        <Button kind="secondary" onClick={() => { onClose(); onExport(); }}>Export…</Button>
        <Button kind="secondary" onClick={importJson}>Import profile JSON…</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function ExportDialog({ actions, onClose, state }) {
  const slug = state.name.replace(/\s+/g, '-').toLowerCase() || 'ground';
  return (
    <Modal onClose={onClose} testId="ground-export-dialog" title="Export ground style" width={620}>
      <div className="tk-export-dialog">
        <p>Export this Ground Shader profile for direct runtime use, or wrap it in the ground slot of a style bundle.</p>
        <div className="tk-export-dialog__actions">
          <Button kind="primary" onClick={() => downloadBlob(actions.exportDocument(), `${slug}.ground-shader.json`, 'application/json')}>
            Export profile JSON
          </Button>
          <Button kind="secondary" onClick={() => downloadBlob(actions.exportStyleBundle(), `${slug}.style-bundle.json`, 'application/json')}>
            Export bundle with Ground slot only
          </Button>
        </div>
        <StyleBundleExportPrompt />
      </div>
    </Modal>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const selectedIsLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  const openHome = () => actions.setEntryChooserOpen(true);
  const menus = createLabEditorMenus({
    canRedo: state.canRedo, canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }), onHome: openHome,
    onRedo: actions.redo, onUndo: actions.undo,
    fileItems: [{ icon: 'stage-export', label: 'Export…', onSelect: () => setExportOpen(true) }],
  });
  return (
    <>
    <LabEditorHeader className="gr-topbar" menus={menus}>
      <BrandLockup
        labName="Ground Shader Lab"
        onLabNameClick={openHome}
      />
      <button
        type="button"
        className="gr-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="gr-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      {selectedIsLocal && (
        <IconButton
          icon="trash"
          label="Delete selected saved style"
          onClick={() => {
            if (window.confirm('Delete this saved style? Call Me Sensei will be restored.')) {
              actions.deleteStyle(state.presetId);
            }
          }}
          testId="delete-style"
        />
      )}
      <span className="gr-topbar-spacer" />
      <RendererToggle
        supportedKinds={['webgpu']}
        unsupportedReason="The Ground Shader parity gate currently runs on WebGPU. Portable WebGL validation remains a separate release gate."
      />
      {menuAnchor && (
        <DocumentMenu
          actions={actions}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          onExport={() => setExportOpen(true)}
          state={state}
        />
      )}
    </LabEditorHeader>
    {exportOpen && <ExportDialog actions={actions} onClose={() => setExportOpen(false)} state={state} />}
    </>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {GROUND_SHADER_SETTING_GROUPS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="gr-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id] ?? 'stage-shape'} />
          <span>{section.label.replace(' Response', '').replace(' Treatment', '')}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = GROUND_SHADER_SETTING_GROUPS
    .find((entry) => entry.id === sectionId) ?? GROUND_SHADER_SETTING_GROUPS[0];
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      {section.id === 'layers' && (
        <div className="vg-asset-owner" data-testid="vegetated-ground-owner">
          <strong>Terrain substrate, not grass blades</strong>
          <span>
            These controls shade the painted terrain beneath vegetation.
            Blade color, wind, bending, density, burial, and snow caps belong
            to Grass Shader and its asset/runtime inputs.
          </span>
        </div>
      )}
      {section.id === 'weatherResponse' && (
        <div className="vg-shared-impact" data-testid="coverage-response-owner">
          <strong>Receiver response only</strong>
          <span>
            This Ground profile controls how the terrain responds after a
            host supplies wetness. Current wetness is preview state. Snow
            appearance comes from the selected cross-domain Snow Surface
            profile; this document never saves either condition.
          </span>
        </div>
      )}
      {section.id === 'printResponse' && (
        <div className="vg-shared-impact" data-testid="print-response-owner">
          <strong>Receiver response, not stamp history</strong>
          <span>
            This profile saves how dirt, sand, and sufficiently deep snow
            receive prints. Footstep, paw, wheel, drag, and impact events stay
            in the transient Ground Print Layer supplied by the host game.
          </span>
        </div>
      )}
      <SchemaGroup
        fields={GROUND_SHADER_FIELD_SCHEMA[section.id]}
        getValue={(field) => state.settings[section.id][field.key]}
        group={section}
        onChange={(field, value) => actions.setSetting(section.id, field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">{state.status}</span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta" data-testid="contract-coverage">
        {state.coverage.matched} ground material · {state.coverage.writes} profile writes · {state.printCount} transient prints
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState(GROUND_SHADER_SETTING_GROUPS[0].id);
  const [previewStylesOpen, setPreviewStylesOpen] = useState(false);
  const [navigationMode, setNavigationMode] = useState('rotate');

  useEffect(() => { document.title = `${state.name} — Ground Shader Lab`; }, [state.name]);
  useEffect(() => { engine.setNavigationMode(navigationMode); }, [engine, navigationMode]);

  const entryOptions = [
    ...getGroundShaderPresetOptions().map((entry) => ({
      label: entry.value === 'call_me_sensei'
        ? `${systemStyleLabel(entry.label, entry.value)} · read-only`
        : `${entry.label} · starter`,
      value: `preset:${entry.value}`,
    })),
    ...state.localPresets.map((entry) => ({
      label: `${entry.label} · saved`,
      value: `saved:${entry.id}`,
    })),
  ];

  function openEntry(value) {
    const separator = value.indexOf(':');
    const kind = value.slice(0, separator);
    const id = value.slice(separator + 1);
    if ((kind === 'preset' || kind === 'saved') && id) {
      actions.applyPreset(id);
      actions.setEntryChooserOpen(false);
    }
  }

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <PreviewBar
        hint="Left-drag rotate · wheel zoom · right-drag pan"
        title="ToonLab procedural terrain range. Geometry, painted splat weights, texture inputs, surrounding styles, visibility, current weather, time, and camera are preview-only."
      >
        <SegmentedControl
          onChange={setNavigationMode}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="navigation-mode"
          value={navigationMode}
        />
        <SegmentedControl
          onChange={(viewMode) => actions.setView({ viewMode })}
          options={[
            { label: 'Composition', value: 'composition' },
            { label: 'Surface', value: 'surface' },
            { label: 'Top', value: 'top' },
          ]}
          testId="preview-mode"
          value={state.view.viewMode}
        />
        <label className="ground-print-preview">
          <span>Print</span>
          <Select
            onChange={(printShape) => actions.setView({ printShape })}
            options={PRINT_PREVIEW_OPTIONS}
            testId="preview-print-shape"
            value={state.view.printShape}
          />
        </label>
        <PreviewToggle
          checked={state.view.printsVisible}
          label="Prints"
          onChange={(printsVisible) => actions.setView({ printsVisible })}
          testId="preview-prints"
          title="Show or hide transient footprints and tracks without changing the saved Ground profile."
        />
        <Button
          icon="stage-detail"
          kind="secondary"
          onClick={() => engine.stampPrints(state.view.printShape)}
          testId="preview-stamp-prints"
          title="Stamp another preview trail into the transient Ground Print Layer."
        >
          Stamp
        </Button>
        <Button
          kind="secondary"
          onClick={engine.clearPrints}
          testId="preview-clear-prints"
          title="Clear all transient prints."
        >
          Clear
        </Button>
        <PreviewToggle
          checked={state.view.wetness > 0}
          label="Wet"
          onChange={(checked) => actions.setView({ wetness: checked ? 0.8 : 0 })}
          testId="preview-wet"
          title="Current scene wetness. The Ground profile saves only its receiving response."
        />
        <PreviewToggle
          checked={state.view.snowCover > 0}
          label="Snow"
          onChange={(checked) => actions.setView({ snowCover: checked ? 1 : 0 })}
          testId="preview-snow"
          title="Preview 12 cm of printable snow. Snow amount is current scene state and is not saved in the Ground profile."
        />
        <Button
          icon="stage-look"
          kind="secondary"
          onClick={() => setPreviewStylesOpen(true)}
          testId="preview-styles"
          title="Select a complete style bundle, override surrounding shaders, or hide scene components."
        >
          Preview styles
        </Button>
        <LabTimeOfDayControl
          autoCycle={state.previewAutoCycle}
          hour={state.previewHour}
          onAutoCycleChange={actions.setPreviewAutoCycle}
          onHourChange={actions.setPreviewHour}
        />
        <IconButton icon="reset" label="Reset camera (C)" onClick={engine.resetCamera} />
      </PreviewBar>
      {previewStylesOpen && (
        <ShaderPreviewStylesModal
          actions={actions}
          artifactLabel="ground shader"
          authoredComponent="ground"
          onClose={() => setPreviewStylesOpen(false)}
          state={state}
        />
      )}
      {state.entryChooserOpen && (
        <LabEntryChooser
          currentDescription="Keep editing the terrain material draft restored from this browser."
          currentName={state.name}
          entries={entryOptions}
          labName="Terrain & Ground Shader Lab"
          newDescription="Reset to the clean Call Me Sensei ground profile and begin a separate style."
          newLabel="New ground style"
          onContinue={() => actions.setEntryChooserOpen(false)}
          onCreate={() => {
            actions.resetLab();
            actions.setEntryChooserOpen(false);
          }}
          onOpenEntry={openEntry}
          openLabel="Open style"
        />
      )}
      <ToastStack />
    </div>
  );
}
