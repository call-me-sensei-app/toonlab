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
  getRockShaderPresetOptions,
  ROCK_SHADER_FIELD_SCHEMA,
  ROCK_SHADER_SETTING_GROUPS,
} from '../../../src/rock-shader/index.js';
import { systemStyleLabel } from '../../../src/core/systemStylePolicy.js';
import { ROCK_SHADER_PREVIEW_FIXTURES } from './engine.js';

const SECTION_ICONS = Object.freeze({
  assetIntegration: 'stage-shape',
  distanceTint: 'stage-look',
  grassLayer: 'stage-leaves',
  layerMask: 'stage-surface',
  material: 'stage-surface',
  moss: 'stage-leaves',
  normals: 'stage-detail',
  projection: 'stage-look',
  sandLayer: 'stage-surface',
  snowLayer: 'stage-look',
  striping: 'stage-detail',
});

function DocumentMenu({ actions, anchor, onClose, onExport, state }) {
  const [name, setName] = useState(state.name);
  const selectedIsLocal = state.library.some((entry) => entry.id === state.selectedStyleId);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not import the profile.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Rock shader document" width={320}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder="Rock shader name…" value={name} />
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
        <Button kind="secondary" onClick={() => { onClose(); onExport(); }}>Export…</Button>
        <Button kind="secondary" onClick={importJson}>Import profile JSON…</Button>
        {selectedIsLocal && (
          <Button
            kind="secondary"
            onClick={() => {
              if (actions.saveStyle()) {
                toast(`Updated “${state.name}”.`, { tone: 'success' });
                onClose();
              }
            }}
            testId="update-style"
          >
            Update saved style
          </Button>
        )}
        <Button
          kind="secondary"
          onClick={() => {
            if (actions.saveStyleAs(name)) {
              toast(`Saved “${name}” as a new style.`, { tone: 'success' });
              onClose();
            }
          }}
          testId="save-style-as"
          title="Create a separate saved style without replacing the selected entry."
        >
          Save As…
        </Button>
        {selectedIsLocal && (
          <Button
            kind="danger"
            onClick={() => {
              if (window.confirm('Delete this saved style? Call Me Sensei will be restored.')) {
                actions.deleteStyle();
                onClose();
              }
            }}
          >
            Delete saved style
          </Button>
        )}
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function ExportDialog({ actions, onClose, state }) {
  const slug = state.name.replace(/\s+/g, '-').toLowerCase() || 'rock';
  return (
    <Modal onClose={onClose} testId="rock-shader-export-dialog" title="Export rock style" width={620}>
      <div className="tk-export-dialog">
        <p>Export this Rock Shader profile for direct runtime use, or wrap it in the rock slot of a style bundle.</p>
        <div className="tk-export-dialog__actions">
          <Button kind="primary" onClick={() => downloadBlob(actions.exportDocument(), `${slug}.rock-shader.json`, 'application/json')}>
            Export profile JSON
          </Button>
          <Button
            kind="secondary"
            onClick={() => downloadBlob(actions.exportStyleBundle(), `${slug}.style-bundle.json`, 'application/json')}
            testId="export-style-bundle"
            title="Exports a canonical toonlab/style-bundle with this profile in the rock slot."
          >
            Export bundle with Rock slot only
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
        labName="Rock Shader Lab"
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
      <span className="gr-topbar-spacer" />
      <RendererToggle
        supportedKinds={['webgpu']}
        unsupportedReason="The Rock Shader parity gate currently runs on WebGPU. Portable WebGL validation remains a separate release gate."
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
      {ROCK_SHADER_SETTING_GROUPS.map((section) => (
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
          <span>{section.label.replace(' Layer', '').replace(' Response', '')}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = ROCK_SHADER_SETTING_GROUPS
    .find((entry) => entry.id === sectionId) ?? ROCK_SHADER_SETTING_GROUPS[0];
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <SchemaGroup
        fields={ROCK_SHADER_FIELD_SCHEMA[section.id]}
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
        {state.coverage.matched} rock meshes · {state.coverage.applied} applied · {state.coverage.skipped} skipped
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('projection');
  const [previewStylesOpen, setPreviewStylesOpen] = useState(false);
  const [navigationMode, setNavigationMode] = useState('rotate');

  useEffect(() => { document.title = `${state.name} — Rock Shader Lab`; }, [state.name]);

  const entryOptions = [
    ...getRockShaderPresetOptions().map((entry) => ({
      label: entry.value === 'call_me_sensei'
        ? `${systemStyleLabel(entry.label, entry.value)} · read-only`
        : `${entry.label} · starter`,
      value: `preset:${entry.value}`,
    })),
    ...state.library.map((entry) => ({
      label: `${entry.name} · saved`,
      value: `saved:${entry.id}`,
    })),
  ];

  function openEntry(value) {
    if (value.startsWith('preset:')) {
      actions.applyPreset(value.slice('preset:'.length));
      actions.setEntryChooserOpen(false);
      return;
    }
    if (value.startsWith('saved:') && actions.loadStyle(value.slice('saved:'.length))) {
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
        title="ToonLab procedural geology range. Geometry, context styles, time, camera, lighting, and fixture selection are preview-only."
      >
        <label className="rock-preview-fixture">
          <span>Rock</span>
          <Select
            onChange={(fixture) => actions.setView({ fixture })}
            options={ROCK_SHADER_PREVIEW_FIXTURES.map((entry) => ({
              label: entry.label,
              value: entry.id,
            }))}
            testId="preview-fixture"
            value={state.view.fixture}
          />
        </label>
        <Button
          icon="stage-look"
          kind="secondary"
          onClick={() => setPreviewStylesOpen(true)}
          testId="preview-styles"
          title="Select a complete style bundle or override individual preview domains."
        >
          Preview styles
        </Button>
        <LabTimeOfDayControl
          autoCycle={state.previewAutoCycle}
          hour={state.previewHour}
          onAutoCycleChange={actions.setPreviewAutoCycle}
          onHourChange={actions.setPreviewHour}
        />
        <SegmentedControl
          onChange={(mode) => {
            setNavigationMode(mode);
            engine.setNavigationMode(mode);
          }}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="navigation-mode"
          value={navigationMode}
        />
        <IconButton icon="reset" label="Reset camera (C)" onClick={engine.resetCamera} />
      </PreviewBar>
      {previewStylesOpen && (
        <ShaderPreviewStylesModal
          actions={actions}
          artifactLabel="rock shader"
          authoredComponent="rock"
          onClose={() => setPreviewStylesOpen(false)}
          state={state}
        />
      )}
      {state.entryChooserOpen && (
        <LabEntryChooser
          currentDescription="Keep editing the rock material draft restored from this browser."
          currentName={state.name}
          entries={entryOptions}
          labName="Rock Shader Lab"
          newDescription="Reset to the clean Call Me Sensei rock profile and begin a separate style."
          newLabel="New rock style"
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
