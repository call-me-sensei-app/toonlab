// Character Shader Lab workspace: top bar, left workflow rail, focused schema
// groups in the right inspector, floating stage bar, and status bar — the
// same chrome as Tree/Water/Debris Lab. Pure view over the store; the engine
// renders the character underneath and hosts the walk-preview controller.

import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEntryChooser,
  LabEditorHeader,
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
import { CHARACTER_MODEL_OPTIONS, normalizeModelPath } from '../../shared/sceneHub.js';
import { TOON_SETTING_FIELDS_BY_GROUP, readToonSettingValue } from '../../shared/toonSettingFields.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import { TOON_SETTING_GROUP_METADATA } from '../../../src/toon/toonMaterialAdapter.js';
import { systemStyleLabel } from '../../../src/core/systemStylePolicy.js';
import { getCopy, localizeEditorText } from '../../../src/i18n/locales.js';
import { getBuiltInToonPresetOptions } from './store.js';

const WORKSPACE_SECTIONS = Object.freeze([
  Object.freeze({
    description: 'Source texture policy, automatic material roles, and alpha behavior.',
    groups: Object.freeze(['baseTexture', 'autoRoles', 'alpha']),
    icon: 'stage-look',
    id: 'base',
    label: 'Base',
  }),
  Object.freeze({
    description: 'How the sun, sky, camera-relative key, and local lights reach the character.',
    groups: Object.freeze(['light']),
    icon: 'stage-animation',
    id: 'light',
    label: 'Light',
  }),
  Object.freeze({
    description: 'The terminator, the lighting map, and the per-surface shadow tones.',
    groups: Object.freeze(['shading', 'ramp']),
    icon: 'stage-detail',
    id: 'shading',
    label: 'Shading',
  }),
  Object.freeze({
    description: 'Face map, face normals, head tracking, nose shadow, and eye-white shade.',
    groups: Object.freeze(['face']),
    icon: 'stage-flowers',
    id: 'face',
    label: 'Face',
  }),
  Object.freeze({
    description: 'Scenery shadows, the character shadow map, and the screen-space hair shadow.',
    groups: Object.freeze(['shadows']),
    icon: 'stage-wood',
    id: 'shadows',
    label: 'Shadow',
  }),
  Object.freeze({
    description: 'Depth rim, specular, the hair ring, the eye glint, and the stocking streak.',
    groups: Object.freeze(['rim', 'highlights']),
    icon: 'tool-crown',
    id: 'highlights',
    label: 'Highlights',
  }),
  Object.freeze({
    description: 'Source material maps, stickers, and fur.',
    groups: Object.freeze(['maps', 'sticker', 'fur']),
    icon: 'tool-sculpt-add',
    id: 'detail',
    label: 'Detail',
  }),
  Object.freeze({
    description: 'Ink outline width, color, and per-role behavior.',
    groups: Object.freeze(['outline']),
    icon: 'sketch',
    id: 'outline',
    label: 'Outline',
  }),
]);

function DocumentMenu({ actions, anchor, onClose, onExport, state }) {
  const [name, setName] = useState(state.name);
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not import the preset.']) toast(error, { tone: 'danger' });
  }

  const copy = getCopy();
  return (
    <Popover anchor={anchor} onClose={onClose} title={copy.document} width={290}>
      <div className="cs-doc-menu">
        <div className="cs-save-row">
          <TextField onCommit={setName} placeholder={localizeEditorText('Look name…')} value={name} />
          {isLocal && (
            <Button
              kind="primary"
              onClick={() => {
                const result = actions.updatePreset(name);
                if (result.ok) onClose();
                else for (const error of result.errors ?? ['Could not update the style.']) toast(error, { tone: 'danger' });
              }}
            >
              {copy.update}
            </Button>
          )}
        </div>
        <Button
          kind={isLocal ? 'secondary' : 'primary'}
          onClick={() => {
            const result = actions.savePresetAs(name);
            if (result.ok) onClose();
            else for (const error of result.errors ?? ['Could not save the style.']) toast(error, { tone: 'danger' });
          }}
        >
          {copy.saveAs}
        </Button>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            {copy.revertToPreset}
          </Button>
        )}
        <Button kind="secondary" onClick={() => { onClose(); onExport(); }}>{copy.export}</Button>
        <Button kind="secondary" onClick={importJson}>{copy.importPresetJson}</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>{copy.resetLab}</Button>
      </div>
    </Popover>
  );
}

function ExportDialog({ actions, onClose, state }) {
  const slug = state.name.replace(/\s+/g, '-').toLowerCase() || 'toon';
  return (
    <Modal onClose={onClose} testId="character-export-dialog" title={localizeEditorText('Export character style')} width={620}>
      <div className="tk-export-dialog">
        <p>{localizeEditorText('Export this shader document for direct runtime use, or wrap this style in its canonical bundle slot.')}</p>
        <div className="tk-export-dialog__actions">
          <Button kind="primary" onClick={() => downloadBlob(actions.exportDocument(), `${slug}.toon-preset.json`, 'application/json')}>
            {localizeEditorText('Export style JSON')}
          </Button>
          <Button kind="secondary" onClick={() => downloadBlob(actions.exportStyleBundle(), `${slug}.style-bundle.json`, 'application/json')}>
            {localizeEditorText('Export bundle with Character slot only')}
          </Button>
        </div>
        <StyleBundleExportPrompt />
      </div>
    </Modal>
  );
}

function TopBar({ actions, onOpenHome, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const menus = createLabEditorMenus({
    canRedo: state.canRedo, canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }), onHome: onOpenHome,
    onRedo: () => actions.redo(), onUndo: () => actions.undo(),
    fileItems: [{ icon: 'stage-export', label: getCopy().export, onSelect: () => setExportOpen(true) }],
  });
  return (
    <>
      <LabEditorHeader className="cs-topbar" menus={menus}>
        <BrandLockup labName="Character Shader Lab" onLabNameClick={onOpenHome} />
        <button
          type="button"
          className="cs-title"
          data-testid="doc-title"
          onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
        >
          {state.name}{state.presetDirty && <span className="cs-dirty">●</span>}<Icon name="chevron-down" />
        </button>
        <span className="cs-topbar-spacer" />
        <RendererToggle />
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
    <nav className="cs-rail tk" data-testid="section-rail">
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="cs-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${localizeEditorText(section.label)} — ${localizeEditorText(section.description)}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={section.icon} />
          <span>{localizeEditorText(section.label)}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId) ?? WORKSPACE_SECTIONS[0];
  return (
    <aside className="cs-inspector tk" data-testid="inspector">
      <h2 className="cs-inspector-header" data-testid="inspector-title">{localizeEditorText(section.label)}</h2>
      <p className="cs-inspector-caption">{localizeEditorText(section.description)}</p>
      {section.groups.map((groupId) => (
        <SchemaGroup
          key={groupId}
          fieldFilter={(field) => field.serializable}
          fields={TOON_SETTING_FIELDS_BY_GROUP[groupId]}
          getValue={(field) => readToonSettingValue(state.settings, field)}
          group={TOON_SETTING_GROUP_METADATA[groupId]}
          onChange={(field, value) => actions.setSetting(groupId, field.key, value)}
        />
      ))}
    </aside>
  );
}

// Scene-preview configuration — bottom bar over the viewport (texture-lab
// pattern). Amber = never saved into the preset.
function CharacterPreviewBar({ actions, engine, navigationMode, onNavigationModeChange, state }) {
  const copy = getCopy();
  const hostedLab = window.location.pathname.startsWith('/labs');
  const matched = CHARACTER_MODEL_OPTIONS.some(
    (option) => normalizeModelPath(option.model) === normalizeModelPath(state.modelUrl),
  );
  const options = [
    ...CHARACTER_MODEL_OPTIONS.map((option) => ({ label: option.label, value: option.model })),
    ...(matched ? [] : [{
      label: `Custom: ${state.modelUrl.slice(state.modelUrl.lastIndexOf('/') + 1)}`,
      value: state.modelUrl,
    }]),
  ];
  return (
    <PreviewBar
      hint={state.walkPreview ? copy.previewHintWalk : copy.previewHintOrbit}
      title={hostedLab ? copy.previewTitleHosted : copy.previewTitleLocal}
    >
      <SegmentedControl
        onChange={onNavigationModeChange}
        options={[
          { label: copy.rotate, value: 'rotate' },
          { label: copy.pan, value: 'pan' },
          { label: copy.zoom, value: 'zoom' },
        ]}
        testId="navigation-mode"
        value={navigationMode}
      />
      <span className="cs-stagebar-select">
        <Select
          onChange={(model) => {
            const option = CHARACTER_MODEL_OPTIONS.find((entry) => entry.model === model);
            actions.setModel(model, option?.mtl ?? null);
            engine.setModel(model, option?.mtl ?? null);
            const params = new URLSearchParams(window.location.search);
            params.set('model', model);
            window.history.replaceState(null, '', `?${params}`);
          }}
          options={options}
          testId="stage-model"
          value={matched ? CHARACTER_MODEL_OPTIONS.find(
            (option) => normalizeModelPath(option.model) === normalizeModelPath(state.modelUrl),
          ).model : state.modelUrl}
        />
      </span>
      <PreviewToggle
        checked={state.animate && state.hasClips}
        disabled={!state.hasClips}
        label={copy.idle}
        onChange={(animate) => actions.setAnimate(animate)}
        testId="stage-animate"
        title={localizeEditorText("Play the character's idle clip")}
      />
      <PreviewToggle
        checked={state.walkPreview}
        label={copy.walk}
        onChange={(walkPreview) => actions.setWalkPreview(walkPreview)}
        testId="walk-preview"
        title={localizeEditorText(WALK_PREVIEW_TITLE)}
      />
      <IconButton icon="reset" label={copy.resetCamera} onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const copy = getCopy();
  const status = String(state.status || '');
  const localizeStatus = () => {
    const loaded = status.match(/^Loaded (.+)\.$/);
    if (loaded) return copy.loaded.replace('{name}', loaded[1]);
    const opened = status.match(/^Opened (.+)\.$/);
    if (opened) return copy.opened.replace('{name}', opened[1]);
    const imported = status.match(/^Imported (.+)\.$/);
    if (imported) return copy.imported.replace('{name}', imported[1]);
    const saved = status.match(/^Saved “(.+)” to your presets\.$/);
    if (saved) return copy.savedToPresets.replace('{name}', saved[1]);
    const updated = status.match(/^Updated “(.+)”\.$/);
    if (updated) return copy.updated.replace('{name}', updated[1]);
    const failed = status.match(/^Could not load the character: (.+)$/);
    if (failed) return copy.couldNotLoadCharacter.replace('{message}', failed[1]);
    const exact = {
      'Restored your last look.': copy.restoredLastLook,
      'History restored.': copy.historyRestored,
      'Saved style deleted. Call Me Sensei restored.': copy.savedStyleDeleted,
      'Character Shader Lab reset.': copy.labReset,
    };
    return exact[status] || localizeEditorText(status);
  };
  return (
    <footer className="cs-status tk" data-testid="status-bar">
      <span className="cs-status-message">{localizeStatus()}</span>
      <span className="cs-status-spacer" />
      <span className="cs-status-meta">
        {localizeEditorText(state.settings.presetLabel)} · {state.convertedMeshCount} {copy.materials} · {state.modelUrl.split('/').pop()}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('base');
  const [navigationMode, setNavigationMode] = useState('rotate');
  const [entryChooserOpen, setEntryChooserOpen] = useState(state.bootSource !== 'url');

  useEffect(() => { document.title = `${state.name} — ${localizeEditorText('Character Shader Lab')}`; }, [state.name]);
  useEffect(() => { engine.setNavigationMode(navigationMode); }, [engine, navigationMode]);

  return (
    <div className="tk">
      <div className="cs-root">
        <TopBar actions={actions} onOpenHome={() => setEntryChooserOpen(true)} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <CharacterPreviewBar
        actions={actions}
        engine={engine}
        navigationMode={navigationMode}
        onNavigationModeChange={setNavigationMode}
        state={state}
      />
      {entryChooserOpen && (
        <LabEntryChooser
          currentDescription={state.bootSource === 'persisted'
            ? 'Continue with the character look restored from this browser.'
            : 'Continue with the current starter look.'}
          currentName={state.name}
          entries={[
            ...getBuiltInToonPresetOptions()
              .filter((entry) => entry.id === 'call_me_sensei')
              .map((entry) => ({
              label: `${systemStyleLabel(entry.label, entry.id).replace(' · system', ` · ${getCopy().systemStyle}`)} · ${getCopy().styleReadOnly}`,
              value: entry.id,
            })),
            ...state.localPresets.map((entry) => ({ label: `${entry.label} · ${getCopy().styleSaved}`, value: entry.id })),
          ]}
          labName="Character Shader Lab"
          newDescription="Start a clean character look from the default ToonLab treatment."
          newLabel="New character look"
          onContinue={() => setEntryChooserOpen(false)}
          onCreate={() => {
            actions.resetLab();
            setEntryChooserOpen(false);
          }}
          onOpenEntry={(id) => {
            actions.applyPreset(id);
            setEntryChooserOpen(false);
          }}
          openLabel="Open style"
        />
      )}
      <ToastStack />
    </div>
  );
}
