// Grass Lab workspace — the standard redesigned-lab chrome: product-only
// rail/inspector (the grass preset), shared amber PreviewBar at the bottom
// (clump/cluster/patch/meadow planting, scene lights, walking).

import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEntryChooser,
  LabEditorHeader,
  Popover,
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SearchSelect,
  SegmentedControl,
  Slider,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import { systemStyleLabel } from '../../../src/core/systemStylePolicy.js';
import { getCopy, localizeEditorText } from '../../../src/i18n/locales.js';
import {
  GRASS_COLOR_PALETTES,
  getGrassPresetOptions,
  GRASS_SETTING_FIELD_SCHEMA,
  GRASS_SETTING_GROUPS,
  matchGrassColorPalette,
} from '../../../src/vegetation/stylizedGrass.js';
import { GRASS_PREVIEW_MODES } from './engine.js';

const SECTION_ICONS = Object.freeze({
  blades: 'stage-leaves',
  interaction: 'tool-move',
  lighting: 'stage-look',
  palette: 'stage-flowers',
  shadows: 'stage-wood',
  wind: 'stage-animation',
});

// Scene-owned groups (group.scene) never appear as product settings — the
// engine wires those uniforms from the preview rig, a game wires them from
// its own sun/sky/weather.
const WORKSPACE_SECTIONS = Object.freeze(
  GRASS_SETTING_GROUPS.filter((group) => !group.scene).map((group) => Object.freeze({
    description: group.description,
    id: group.id,
    label: group.label,
  })),
);

const GRASS_PALETTE_COPY_KEYS = Object.freeze({
  autumn_amber: ['grassPaletteAutumnAmber', 'grassPaletteAutumnAmberDescription'],
  crimson_field: ['grassPaletteCrimsonField', 'grassPaletteCrimsonFieldDescription'],
  deep_forest: ['grassPaletteDeepForest', 'grassPaletteDeepForestDescription'],
  dry_prairie: ['grassPaletteDryPrairie', 'grassPaletteDryPrairieDescription'],
  moonlit_blue: ['grassPaletteMoonlitBlue', 'grassPaletteMoonlitBlueDescription'],
  sage_field: ['grassPaletteSageField', 'grassPaletteSageFieldDescription'],
  sakura_field: ['grassPaletteSakuraField', 'grassPaletteSakuraFieldDescription'],
  sensei_meadow: ['grassPaletteSenseiMeadow', 'grassPaletteSenseiMeadowDescription'],
  spring_lime: ['grassPaletteSpringLime', 'grassPaletteSpringLimeDescription'],
  wisteria: ['grassPaletteWisteria', 'grassPaletteWisteriaDescription'],
});

function PresetRow({ actions, state }) {
  const copy = getCopy();
  const localIds = new Set(state.localPresets.map((entry) => entry.id));
  const options = [
    ...(state.presetId === null ? [{ label: copy.customGrass, value: '' }] : []),
    ...getGrassPresetOptions().map((entry) => ({
      label: localIds.has(entry.id)
        ? `${entry.label} · ${copy.styleSaved}`
        : systemStyleLabel(entry.label, entry.id).replace(' · system', ` · ${copy.systemStyle}`),
      value: entry.value ?? entry.id,
    })),
  ];
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  return (
    <PresetRowShell label={copy.styleLabel} title={copy.grassPresetTitle}>
      <SearchSelect
        onChange={(id) => { if (id) actions.applyPreset(id); }}
        options={options}
        placeholder={copy.grassSearchPlaceholder}
        testId="preset-select"
        value={state.presetId ?? ''}
      />
      {isLocal && (
        <IconButton icon="trash" label={copy.deleteSavedPreset} onClick={() => actions.deletePreset(state.presetId)} />
      )}
    </PresetRowShell>
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const copy = getCopy();
  const [name, setName] = useState(state.name);
  const isLocal = state.localPresets.some(({ id }) => id === state.presetId);

  function report(result, fallback) {
    if (result.ok) {
      onClose();
      return;
    }
    for (const error of result.errors ?? [fallback]) toast(error, { tone: 'danger' });
  }

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not import the preset.']) toast(error, { tone: 'danger' });
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title={copy.document} width={290}>
      <div className="gr-doc-menu">
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder={copy.grassNamePlaceholder} value={name} />
          <Button
            kind="primary"
            onClick={() => report(actions.savePresetAs(name), 'Could not save the grass asset.')}
          >
            {copy.saveAs}
          </Button>
        </div>
        {isLocal && (
          <Button
            kind="secondary"
            onClick={() => report(actions.updatePreset(), 'Could not update the grass asset.')}
          >
            {copy.updateSavedAsset}
          </Button>
        )}
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            {copy.revertToPreset}
          </Button>
        )}
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(actions.exportDocument(), `${state.name.replace(/\s+/g, '-').toLowerCase() || 'grass'}.grass-preset.json`, 'application/json');
            onClose();
          }}
        >
          {copy.exportGrassJson}
        </Button>
        <Button kind="secondary" onClick={importJson}>{copy.importPresetJson}</Button>
        <p className="gr-doc-help">
          {copy.grassDocumentHelp}
        </p>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>{copy.resetLab}</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const openHome = () => actions.setView({ entryChooser: true });
  const menus = createLabEditorMenus({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onHome: openHome,
    onRedo: () => actions.redo(),
    onUndo: () => actions.undo(),
    fileItems: [{ icon: 'stage-export', label: 'Export…', onSelect: () => setMenuAnchor({ x: 12, y: 80 }) }],
  });
  return (
    <LabEditorHeader className="gr-topbar" menus={menus}>
      <BrandLockup
        labName="Grass & Groundcover Generation Lab"
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
      <Button
        icon="stage-export"
        kind="primary"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
        testId="export-open"
      >
        {getCopy().export}
      </Button>
      <RendererToggle />
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </LabEditorHeader>
  );
}

function SectionRail({ activeSection, onSectionChange }) {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {WORKSPACE_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className="gr-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${localizeEditorText(section.label)} — ${localizeEditorText(section.description)}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id] ?? 'stage-shape'} />
          <span>{localizeEditorText(section.label)}</span>
        </button>
      ))}
    </nav>
  );
}

function grassColorCss(value) {
  return `rgb(${value.map((channel) => Math.round(channel * 255)).join(', ')})`;
}

function GrassPaletteSection({ actions, state }) {
  const copy = getCopy();
  const active = matchGrassColorPalette(state.settings);
  return (
    <section className="tk-section gr-palette-section" data-testid="grass-palette-section">
      <div className="tk-section-title">{copy.presetPalettes}</div>
      <div className="tk-section-caption">
        {copy.grassPaletteCaption} {copy.grassPaletteShadowHint}
      </div>
      <div className="gr-palette-grid">
        {GRASS_COLOR_PALETTES.map((palette) => {
          const [labelKey, descriptionKey] = GRASS_PALETTE_COPY_KEYS[palette.id] ?? [];
          const label = copy[labelKey] ?? palette.label;
          const description = copy[descriptionKey] ?? palette.description;
          return (
            <button
              key={palette.id}
              type="button"
              aria-pressed={active?.id === palette.id}
              data-active={active?.id === palette.id}
              data-testid={`grass-palette-${palette.id}`}
              title={`${description} ${copy.grassPaletteTitleSuffix}`}
              onClick={() => actions.applyColorPalette(palette)}
            >
              <span className="gr-palette-swatches" aria-hidden="true">
                {['baseColor', 'tipColor', 'shadowTint'].map((key) => (
                  <span key={key} style={{ background: grassColorCss(palette[key]) }} />
                ))}
              </span>
              <span className="gr-palette-label">{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId) ?? WORKSPACE_SECTIONS[0];
  const group = GRASS_SETTING_GROUPS.find((entry) => entry.id === section.id);
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="gr-inspector-header" data-testid="inspector-title">{localizeEditorText(section.label)}</h2>
      <p className="gr-inspector-caption">{localizeEditorText(section.description)}</p>
      {group?.id === 'palette' && <GrassPaletteSection actions={actions} state={state} />}
      {group && (
        <SchemaGroup
          fields={GRASS_SETTING_FIELD_SCHEMA[group.id]}
          getValue={(field) => state.settings[field.key]}
          group={group.id === 'palette' ? { ...group, label: 'Fine Tune' } : group}
          onChange={(field, value) => actions.setSetting(field.key, value)}
          showCaption={false}
        />
      )}
    </aside>
  );
}

function GrassPreviewBar({ actions, engine, state }) {
  const copy = getCopy();
  return (
    <PreviewBar
      hint={state.view.walkPreview
        ? localizeEditorText(WALK_PREVIEW_TITLE)
        : localizeEditorText(`Left-drag ${state.view.cameraMode} · wheel zoom · right-drag pan`)}
      title={copy.grassPreviewTitle}
    >
      <SegmentedControl
        onChange={(mode) => actions.setView({ mode })}
        options={GRASS_PREVIEW_MODES.map((entry) => ({ label: localizeEditorText(entry.label), value: entry.id }))}
        testId="preview-mode"
        value={state.view.mode}
      />
      <span className="gr-camera-mode" title={copy.grassPreviewCameraHint}>
        <span>{copy.camera}</span>
        <SegmentedControl
          onChange={(cameraMode) => actions.setView({ cameraMode })}
          options={[
            { label: copy.rotate, value: 'rotate' },
            { label: copy.pan, value: 'pan' },
            { label: copy.zoom, value: 'zoom' },
          ]}
          testId="camera-mode"
          value={state.view.cameraMode}
        />
      </span>
      <span className="tk-previewbar-slider" title={copy.grassPreviewSunHint}>
        <span>{copy.sun}</span>
        <Slider max={2.5} min={0} onChange={(sunIntensity) => actions.setView({ sunIntensity })} step={0.05} value={state.view.sunIntensity} />
      </span>
      <span className="tk-previewbar-slider" title={copy.grassPreviewAmbientHint}>
        <span>{copy.ambient}</span>
        <Slider max={1.2} min={0} onChange={(ambientIntensity) => actions.setView({ ambientIntensity })} step={0.02} value={state.view.ambientIntensity} />
      </span>
      <span className="tk-previewbar-slider" title={copy.grassPreviewWindHint}>
        <span>{copy.wind}</span>
        <Slider max={0.6} min={0} onChange={(windStrength) => actions.setView({ windStrength })} step={0.01} value={state.view.windStrength} />
      </span>
      <PreviewToggle
        checked={state.view.cloudShadowStrength > 0}
        label={copy.cloud}
        onChange={(enabled) => actions.setView({ cloudShadowStrength: enabled ? 0.45 : 0 })}
        testId="cloud-shadow-preview"
        title={copy.grassPreviewCloudHint}
      />
      <PreviewToggle
        checked={state.view.walkPreview}
        label={copy.walk}
        onChange={(walkPreview) => actions.setView({ walkPreview })}
        testId="walk-preview"
        title={localizeEditorText(WALK_PREVIEW_TITLE)}
      />
      <IconButton icon="reset" label={copy.resetCamera} onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const copy = getCopy();
  const previewMode = GRASS_PREVIEW_MODES.find((entry) => entry.id === state.view.mode)?.label
    ? localizeEditorText(GRASS_PREVIEW_MODES.find((entry) => entry.id === state.view.mode).label)
    : localizeEditorText(state.view.mode);
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">{localizeEditorText(state.status)}</span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta">
        {state.clumpCount.toLocaleString()} {copy.grassClumps} · {state.bladeCount.toLocaleString()} {copy.grassBladesCount} · {previewMode}
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState('blades');
  const copy = getCopy();
  const entryOptions = getGrassPresetOptions().map((entry) => ({
    label: state.localPresets.some(({ id }) => id === (entry.value ?? entry.id))
      ? `${localizeEditorText(entry.label)} · ${copy.styleSaved}`
      : systemStyleLabel(localizeEditorText(entry.label), entry.value ?? entry.id)
        .replace(' · system', ` · ${copy.systemStyle}`),
    value: entry.value ?? entry.id,
  }));

  useEffect(() => { document.title = `${state.name} — ${localizeEditorText('Grass & Groundcover Generation Lab')}`; }, [state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} state={state} />
        <SectionRail activeSection={sectionId} onSectionChange={setSectionId} />
        <Inspector actions={actions} sectionId={sectionId} state={state} />
        <StatusBar state={state} />
      </div>
      <GrassPreviewBar actions={actions} engine={engine} state={state} />
      {state.view.entryChooser && (
      <LabEntryChooser
        currentDescription={state.bootSource === 'persisted'
            ? copy.grassDraftRestored
            : copy.grassStarterDescription}
          currentName={state.name}
          entries={entryOptions}
          labName="Grass & Groundcover Generation Lab"
          newDescription={copy.grassNewDescription}
          newLabel={copy.createCleanGrass}
          onContinue={() => actions.setView({ entryChooser: false })}
          onCreate={() => {
            actions.resetLab();
            actions.setView({ entryChooser: false });
          }}
          onOpenEntry={(id) => {
            actions.applyPreset(id);
            actions.setView({ entryChooser: false });
          }}
          openLabel={copy.grassOpen}
        />
      )}
      <ToastStack />
    </div>
  );
}
