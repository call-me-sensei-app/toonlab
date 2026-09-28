// Tree, Grass, and Flower Shader Labs use one shared vegetation-family shell.
// The amber bar owns every scene-only fixture used to prove each independent
// profile under comparable palettes, weather, and time-of-day lighting.

import { useEffect, useMemo, useState } from 'react';

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
  ShaderPreviewAssetsModal,
  Slider,
  StyleBundleExportPrompt,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { VegetationPreviewStylesModal } from './PreviewStylesModal.jsx';
import {
  getVegetationShaderPresetOptions,
  getVegetationShaderScopeFieldSchema,
  getVegetationShaderScopeSettingGroups,
  isVegetationSharedShaderGroup,
  VEGETATION_SHADER_SCOPES,
  VEGETATION_SHADER_FIELD_SCHEMA,
  VEGETATION_SHADER_SETTING_GROUPS,
} from '../../../src/vegetation/vegetationShaders.js';
import {
  getFlowerShaderPreviewAssets,
  getTreeShaderPreviewAssets,
  parseFlowerShaderPreviewAsset,
  parseTreeShaderPreviewAsset,
} from '../previewAssets.js';
import { VEGETATION_PREVIEW_MODES } from './engine.js';

const SECTION_ICONS = Object.freeze({
  bark: 'stage-wood',
  flower: 'stage-flowers',
  foliage: 'stage-leaves',
  grass: 'stage-leaves',
  lighting: 'stage-look',
  stem: 'stage-shape',
  thinSurface: 'stage-leaves',
  weatherResponse: 'stage-animation',
});

const SECTION_LABELS = Object.freeze({
  bark: 'Bark',
  flower: 'Flower',
  foliage: 'Foliage',
  grass: 'Grass',
  lighting: 'Shared',
  stem: 'Stem',
  thinSurface: 'Thin',
  weatherResponse: 'Weather',
});

const LAB_META = Object.freeze({
  vegetation: Object.freeze({
    documentSuffix: 'vegetation-shader',
    label: 'Vegetation Shader Family',
    placeholder: 'Vegetation compatibility profile…',
    route: '/vegetation-shader-lab/',
  }),
  tree: Object.freeze({
    documentSuffix: 'tree-shader',
    label: 'Tree Shader Lab',
    placeholder: 'Tree shader name…',
    route: '/tree-shader-lab/',
  }),
  grass: Object.freeze({
    documentSuffix: 'grass-shader',
    label: 'Grass Shader Lab',
    placeholder: 'Grass shader name…',
    route: '/grass-shader-lab/',
  }),
  flower: Object.freeze({
    documentSuffix: 'flower-shader',
    label: 'Flower Shader Lab',
    placeholder: 'Flower shader name…',
    route: '/flower-shader-lab/',
  }),
});

function DocumentMenu({ actions, anchor, meta, onClose, onExport, state }) {
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
    if (result.ok) {
      for (const warning of result.warnings ?? []) toast(warning);
      onClose();
    } else for (const error of result.errors ?? ['Could not import the profile.']) {
      toast(error, { tone: 'danger' });
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={310}>
      <div className="gr-doc-menu">
        <p className="gr-doc-help">
          <strong>Current style:</strong> {state.name}
          {isLocal ? ' · saved locally' : ' · protected system style'}
        </p>
        <Button
          kind="ghost"
          onClick={() => {
            actions.setView({ entryChooser: true });
            onClose();
          }}
        >
          Open style browser
        </Button>
        <div className="gr-save-row">
          <TextField onCommit={setName} placeholder={meta.placeholder} value={name} />
          <Button
            kind="primary"
            onClick={() => report(actions.savePresetAs(name), 'Could not save the profile.')}
          >
            Save As
          </Button>
        </div>
        {isLocal && (
          <>
            <Button
              kind="secondary"
              onClick={() => report(actions.updatePreset(), 'Could not update the profile.')}
            >
              Update saved profile
            </Button>
            <Button
              kind="danger"
              onClick={() => {
                report(actions.deletePreset(state.presetId), 'Could not delete the profile.');
              }}
            >
              Delete saved profile
            </Button>
          </>
        )}
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to profile
          </Button>
        )}
        <Button kind="secondary" onClick={() => { onClose(); onExport(); }}>Export…</Button>
        <Button kind="secondary" onClick={importJson}>Import profile JSON…</Button>
        <p className="gr-doc-help">
          Changes autosave as the current draft. Save As creates a separate searchable profile;
          Update replaces only the selected saved profile. Profile JSON targets one shader,
          while the style bundle places it in the runtime’s canonical shader slot.
        </p>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function ExportDialog({ actions, meta, onClose, state }) {
  const slug = state.name.replace(/\s+/g, '-').toLowerCase() || state.scope;
  return (
    <Modal onClose={onClose} testId="vegetation-export-dialog" title={`Export ${meta.label} style`} width={620}>
      <div className="tk-export-dialog">
        <p>Export this focused shader profile for direct runtime use, or wrap it in its canonical style-bundle slot.</p>
        <div className="tk-export-dialog__actions">
          <Button kind="primary" onClick={() => downloadBlob(actions.exportDocument(), `${slug}.${meta.documentSuffix}.json`, 'application/json')}>
            Export profile JSON
          </Button>
          <Button
            kind="secondary"
            onClick={() => downloadBlob(actions.exportStyleBundle(), `${slug}.style-bundle.json`, 'application/json')}
            title="A runtime-ready ToonLab style-bundle document with this profile embedded in its canonical shader slot."
          >
            Export bundle with {VEGETATION_SHADER_SCOPES[state.scope].label} slot only
          </Button>
        </div>
        <StyleBundleExportPrompt />
      </div>
    </Modal>
  );
}

function FamilyNav({ scope }) {
  return (
    <nav className="vg-family-nav" aria-label="Vegetation shader family">
      {['tree', 'grass', 'flower'].map((id) => (
        <a
          key={id}
          data-active={scope === id}
          href={LAB_META[id].route}
          title={VEGETATION_SHADER_SCOPES[id].description}
        >
          {VEGETATION_SHADER_SCOPES[id].label.replace(' Shader', '')}
        </a>
      ))}
    </nav>
  );
}

function TopBar({ actions, meta, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const openHome = () => actions.setView({ entryChooser: true });
  const menus = createLabEditorMenus({
    canRedo: state.canRedo, canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }), onHome: openHome,
    onRedo: () => actions.redo(), onUndo: () => actions.undo(),
    fileItems: [{ icon: 'stage-export', label: 'Export…', onSelect: () => setExportOpen(true) }],
  });
  return (
    <>
    <LabEditorHeader className="gr-topbar" menus={menus}>
      <BrandLockup
        labName={meta.label}
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
      <FamilyNav scope={state.scope} />
      <span className="gr-topbar-spacer" />
      <Button
        icon="stage-export"
        kind="primary"
        onClick={() => setExportOpen(true)}
        testId="export-open"
      >
        Export
      </Button>
      <RendererToggle
        supportedKinds={['webgpu']}
        unsupportedReason="The procedural vegetation preview uses ToonLab's WebGPU shader graph. Portable WebGL validation remains a separate npm release gate."
      />
      {menuAnchor && (
        <DocumentMenu
          actions={actions}
          anchor={menuAnchor}
          meta={meta}
          onClose={() => setMenuAnchor(null)}
          onExport={() => setExportOpen(true)}
          state={state}
        />
      )}
    </LabEditorHeader>
    {exportOpen && (
      <ExportDialog actions={actions} meta={meta} onClose={() => setExportOpen(false)} state={state} />
    )}
    </>
  );
}

function SectionRail({ activeSection, onSectionChange, sections }) {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {sections.map((section) => (
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
          <span>{SECTION_LABELS[section.id] ?? section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, sections, state }) {
  const section = sections.find((entry) => entry.id === sectionId) ?? sections[0];
  const scopeSchema = state.scope === 'vegetation'
    ? VEGETATION_SHADER_FIELD_SCHEMA
    : getVegetationShaderScopeFieldSchema(state.scope);
  return (
    <aside className="gr-inspector tk" data-testid="inspector">
      <h2 className="gr-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      {isVegetationSharedShaderGroup(section.id) && (
        <div className="vg-shared-impact" data-testid="shared-base-impact">
          <strong>Shared vegetation base</strong>
          <span>
            Changes here affect Tree foliage, Bark / wood, Grass / groundcover,
            and Flower petals, centers, leaves, and stems. Per-profile splitting
            is not enabled; a future explicit override can detach one profile
            without changing this base.
          </span>
        </div>
      )}
      {section.id === 'weatherResponse' && (
        <div className="vg-shared-impact" data-testid="snow-surface-owner">
          <strong>Shared Snow Surface</strong>
          <span>
            Powder, blue shadow body, structure, roughness, sparkle, and melt
            come from the preview style bundle&apos;s Snow Surface shader.
            These vegetation controls only adjust wet response, coverage edge,
            tint multiplier, and light visibility on vegetation receivers.
            Use Preview styles to compare the shared Snow Surface style.
          </span>
        </div>
      )}
      {(state.scope === 'tree' || state.scope === 'flower')
        && section.id === 'foliage' && (
        <div className="vg-asset-owner" data-testid="foliage-palette-owner">
          <strong>
            Attached-leaf palette comes from the preview {state.scope === 'tree' ? 'tree' : 'flower'}
          </strong>
          <span>
            Main and gradient foliage colors identify the plant asset or
            species, so this canonical shader profile does not serialize them. Gradient
            shaping, hue treatment, lighting, surface response, and
            transmission remain shader-owned. Change preview assets to verify
            that the same profile preserves different authored palettes.
          </span>
        </div>
      )}
      {state.scope === 'flower' && section.id === 'flower' && (
        <div className="vg-asset-owner" data-testid="flower-palette-owner">
          <strong>Petal and center colors come from the preview flower</strong>
          <span>
            Species palette, authored flower texture, center mask, petal
            geometry, alpha cutoff, and stable variation seed belong to the
            flower asset. Flower Shader v3 owns how those inputs receive
            bands, highlights, transmission, subsurface light, petal-cup
            shading, and center light/shadow response.
          </span>
        </div>
      )}
      {state.scope === 'flower' && section.id === 'stem' && (
        <div className="vg-asset-owner" data-testid="stem-palette-owner">
          <strong>Stem base color comes from the preview flower</strong>
          <span>
            The plant recipe owns the botanical stem color and texture.
            Flower Shader v3 owns stem roughness, highlight, emission, bands,
            shadow floor, transmission, sky fill, and rim treatment.
          </span>
        </div>
      )}
      <SchemaGroup
        fields={scopeSchema[section.id]}
        getValue={(field) => state.settings[section.id][field.key]}
        group={section}
        isDisabled={() => false}
        onChange={(field, value) => actions.setSetting(section.id, field.key, value)}
        showCaption={false}
      />
    </aside>
  );
}

function VegetationPreviewBar({
  actions,
  engine,
  onPreviewAssetsOpen,
  onPreviewStylesOpen,
  state,
}) {
  return (
    <PreviewBar
      hint={`Left-drag ${state.view.cameraMode} · wheel zoom · right-drag pan`}
      title="First-party procedural garden. Geometry, asset palettes, surrounding styles, visibility, current wind/weather, time, and camera are preview-only."
    >
      <SegmentedControl
        onChange={(viewMode) => actions.setView({ viewMode })}
        options={VEGETATION_PREVIEW_MODES.map((entry) => ({
          label: entry.label,
          value: entry.id,
        }))}
        testId="preview-mode"
        value={state.view.viewMode}
      />
      <span className="vg-camera-mode" title="Choose what left-drag does. Wheel zoom and right-drag pan remain available in every mode.">
        <span>Camera</span>
        <SegmentedControl
          onChange={(cameraMode) => actions.setView({ cameraMode })}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="camera-mode"
          value={state.view.cameraMode}
        />
      </span>
      <span className="tk-previewbar-slider" title="Scene wind amount; response shape belongs to the profile.">
        <span>Wind</span>
        <Slider max={3} min={0} onChange={(windStrength) => actions.setView({ windStrength })} step={0.05} value={state.view.windStrength} />
      </span>
      <PreviewToggle
        checked={state.view.wetness > 0}
        label="Wet"
        onChange={(checked) => actions.setView({ wetness: checked ? 0.8 : 0 })}
        testId="preview-wet"
        title="Current scene wetness; only wetness response belongs to the profile."
      />
      <PreviewToggle
        checked={state.view.snowCover > 0}
        label="Snow"
        onChange={(checked) => actions.setView({ snowCover: checked ? 1 : 0 })}
        testId="preview-snow"
        title="Deep-snow preview: continuous ground accumulation plus the profile-owned vegetation response. Current snow amount is not saved."
      />
      {state.scope === 'grass' && (
        <PreviewToggle
          checked={state.view.interactionAmount > 0}
          label="Push"
          onChange={(checked) => actions.setView({
            interactionAmount: checked ? 1 : 0,
          })}
          testId="preview-grass-interaction"
          title="Preview-only interaction field used to verify Grass Interaction Response. The target itself is never saved into the shader profile."
        />
      )}
      {(state.scope === 'tree' || state.scope === 'flower') && (
        <Button
          icon="stage-shape"
          kind="secondary"
          onClick={onPreviewAssetsOpen}
          testId="preview-assets"
          title={`Switch between built-in, saved, and imported ToonLab ${state.scope} recipes. This selection is never saved in the shader profile.`}
        >
          {state.view.previewAsset?.label ?? 'Preview assets'}
        </Button>
      )}
      <Button
        icon="stage-look"
        kind="secondary"
        onClick={onPreviewStylesOpen}
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
      <IconButton icon="reset" label="Reset camera (C)" onClick={() => engine.resetCamera()} />
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  const {
    applied,
    fallback = 0,
    matched,
    unsupported,
    writes,
  } = state.coverage;
  const adapterLabel = state.runtimeAdapter === 'canonical-vegetation-procedural'
    ? `First-party procedural · canonical ${VEGETATION_SHADER_SCOPES[state.scope]?.label ?? 'Vegetation Shader'}`
    : null;
  const coverageLabel = `${writes} writes`;
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span className="gr-status-message">{state.status}</span>
      <span className="gr-status-spacer" />
      {adapterLabel && (
        <span className="gr-status-meta" data-testid="shader-adapter">
          {adapterLabel}{fallback > 0 ? ` · ${fallback} fallback` : ''}
        </span>
      )}
      <span className="gr-status-meta" data-testid="contract-coverage">
        {matched} materials · {applied} applied · {coverageLabel} · {unsupported} unsupported
      </span>
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const sections = state.scope === 'vegetation'
    ? VEGETATION_SHADER_SETTING_GROUPS
    : getVegetationShaderScopeSettingGroups(state.scope);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? 'lighting');
  const [previewAssetsOpen, setPreviewAssetsOpen] = useState(false);
  const [previewStylesOpen, setPreviewStylesOpen] = useState(false);
  const meta = LAB_META[state.scope] ?? LAB_META.vegetation;
  const localIds = new Set(state.localPresets.map(({ id }) => id));
  // LabEntryChooser owns the SearchSelect document browser; the inspector is
  // intentionally limited to fields of the currently open shader document.
  const entryOptions = getVegetationShaderPresetOptions()
    .filter((entry) => entry.id === 'call_me_sensei' || localIds.has(entry.id))
    .map((entry) => ({
      label: entry.id === 'call_me_sensei'
        ? `${entry.label} · system`
        : `${entry.label} · saved`,
      value: entry.value ?? entry.id,
    }));
  const authoredComponent = state.scope === 'flower'
    ? 'flowers'
    : state.scope === 'vegetation'
      ? ['tree', 'grass', 'flowers']
      : state.scope;
  const previewAssets = useMemo(() => {
    if (state.scope !== 'tree' && state.scope !== 'flower') return [];
    const available = state.scope === 'tree'
      ? getTreeShaderPreviewAssets()
      : getFlowerShaderPreviewAssets();
    const selected = state.view.previewAsset;
    if (selected && !available.some(({ id }) => id === selected.id)) {
      available.unshift(selected);
    }
    return available;
  }, [state.scope, state.view.previewAsset]);

  async function importPreviewAsset() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const parser = state.scope === 'flower'
      ? parseFlowerShaderPreviewAsset
      : parseTreeShaderPreviewAsset;
    const result = parser(await file.text(), {
      fallbackLabel: file.name.replace(/\.json$/i, ''),
    });
    if (!result.ok) {
      for (const error of result.errors ?? [`Could not import the ${state.scope} recipe.`]) {
        toast(error, { tone: 'danger' });
      }
      return;
    }
    actions.setPreviewAsset(result.value);
    toast(`Previewing ${result.value.label}.`, { tone: 'success' });
  }

  useEffect(() => { document.title = `${state.name} — ${meta.label}`; }, [meta.label, state.name]);

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar actions={actions} meta={meta} state={state} />
        <SectionRail
          activeSection={sectionId}
          onSectionChange={setSectionId}
          sections={sections}
        />
        <Inspector
          actions={actions}
          sectionId={sectionId}
          sections={sections}
          state={state}
        />
        <StatusBar state={state} />
      </div>
      <VegetationPreviewBar
        actions={actions}
        engine={engine}
        onPreviewAssetsOpen={() => setPreviewAssetsOpen(true)}
        onPreviewStylesOpen={() => setPreviewStylesOpen(true)}
        state={state}
      />
      {state.view.entryChooser && (
        <LabEntryChooser
          currentDescription={state.bootSource === 'persisted'
            ? 'Keep working with the shader profile restored from this browser.'
            : 'Keep working from the current Call Me Sensei shader starter.'}
          currentName={state.name}
          entries={entryOptions}
          labName={meta.label}
          newDescription="Reset to a clean Call Me Sensei profile without deleting your saved profiles."
          newLabel="Create clean profile"
          onContinue={() => actions.setView({ entryChooser: false })}
          onCreate={() => {
            actions.resetLab();
            actions.setView({ entryChooser: false });
          }}
          onOpenEntry={(id) => {
            actions.applyPreset(id);
            actions.setView({ entryChooser: false });
          }}
          openLabel="Open profile"
        />
      )}
      {previewAssetsOpen
        && (state.scope === 'tree' || state.scope === 'flower') && (
        <ShaderPreviewAssetsModal
          artifactLabel={`${VEGETATION_SHADER_SCOPES[state.scope].label} profile`}
          assets={previewAssets}
          onClose={() => setPreviewAssetsOpen(false)}
          onImport={importPreviewAsset}
          onSelect={actions.setPreviewAsset}
          selectedId={state.view.previewAsset?.id}
        />
      )}
      {previewStylesOpen && (
        <VegetationPreviewStylesModal
          actions={actions}
          artifactLabel={`${meta.label} profile`}
          authoredComponent={authoredComponent}
          onClose={() => setPreviewStylesOpen(false)}
          state={state}
        />
      )}
      <ToastStack />
    </div>
  );
}
