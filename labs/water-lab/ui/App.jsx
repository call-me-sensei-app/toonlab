// Water Lab workspace: top bar, left workflow rail, one focused schema group
// in the right inspector, camera controls, stage toys, and status bar.

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
  PresetRowShell,
  PreviewBar,
  PreviewToggle,
  RendererToggle,
  SearchSelect,
  SegmentedControl,
  Select,
  Slider,
  StyleBundleExportPrompt,
  toast,
  ToastStack,
  TextField,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { downloadBlob, pickFile } from '../../shared/download.js';
import {
  WATER_COLOR_TONES,
  WATER_DEBUG_MODES,
  WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
  WATER_SETTING_GROUPS,
  getWaterPresetOptions,
  getWaterStyleOptions,
} from '../../../src/water/index.js';
import { WATER_LAB_STAGES } from '../engine/waterLabEngine.js';
import { isWaterExperiment } from '../experiments/experimentModels.js';
import { SceneSettings } from '../experiments/SceneSettings.jsx';

const DEBUG_OPTIONS = Object.keys(WATER_DEBUG_MODES).map((id) => ({
  label: id === 'off' ? 'Debug: off' : `Debug: ${id}`,
  value: id,
}));

const SECTION_ICONS = Object.freeze({
  foam: 'stage-flowers',
  lighting: 'stage-look',
  quality: 'stage-export',
  ripples: 'stage-animation',
  splashes: 'tool-sculpt-add',
  stage: 'stage-pieces',
  surface: 'stage-look',
  waves: 'stage-detail',
});

const WATER_WORKSPACE_SECTIONS = Object.freeze(
  [{id:'stage',label:'Scene',description:'Scene-specific water motion and dimensions.'}, ...WATER_SETTING_GROUPS.map((group) => Object.freeze({
    description: group.id === 'waves' ? 'Spectral open water and depth-driven shore/river motion. Reference and stylized views share the same surface.' : group.description,
    id: group.id,
    label: group.label,
  }))],
);

const CAMERA_MODE_OPTIONS = Object.freeze([
  Object.freeze({ label: 'Rotate', value: 'rotate' }),
  Object.freeze({ label: 'Pan', value: 'pan' }),
  Object.freeze({ label: 'Zoom', value: 'zoom' }),
]);

/** Fields a non-classic color tone forces — edits would silently snap back. */
function toneDisabledReason(settings, field) {
  const tone = WATER_COLOR_TONES[settings.colorTone];
  if (!tone || settings.colorTone === 'classic') return false;
  if (field.key in tone && Array.isArray(tone[field.key])) return 'Color Tone overrides this — set tone to Classic to edit.';
  return false;
}

const LEGACY_MOTION_FIELDS = new Set(['waveSteepness', 'shoalingDepth', 'shorelineWaves',
  'shorelineRunup', 'runupDistance', 'breakerEnabled', 'breakerAmount', 'breakerCurl', 'breakerScale', 'breakerPeel',
  'causticsScale', 'causticsSpeed', 'underwaterTintStrength', 'foamContactDistance', 'foamLineSpacing',
  'sparkleStrength', 'sparkleScale', 'sparkleSpeed', 'specularStretch', 'fresnelStrength', 'fresnelPower',
  'fresnelBias', 'fresnelColor', 'reflectionStrength', 'rippleDamping', 'ripplePropagation',
  'rippleHeightScale', 'rippleFoamDecay', 'rippleFoamGain', 'rippleFoamStrength']);
function WaterSchemaGroup({ actions, group, settings, stage, showCaption = true }) {
  const experimentFields = new Set(['midColor','deepColor','detailNormalStrength','reflectionSoftness','deepFadeDistance','foamColor','sunDirection','sunColor','skyZenithColor','skyHorizonColor']);
  return (
    <SchemaGroup
      fields={WATER_SETTING_FIELD_SCHEMA_BY_GROUP[group.id]}
      fieldFilter={(field) => !LEGACY_MOTION_FIELDS.has(field.key)
        && (!isWaterExperiment(stage) || experimentFields.has(field.key))
        && !(['waveSetPeriod', 'waveSetStrength'].includes(field.key) && stage !== 'beach')}

      getValue={(field) => settings[field.key]}
      group={group}
      isDisabled={(field) => (stage === 'tank' || stage?.startsWith('river')) && field.key.startsWith('wave')
        ? 'This case solves flow through its channel; change Flow Speed or use a splash.'
        : field.key === 'flowDirection' && stage?.startsWith('river')
          ? 'The authored channel runs downstream along +X.'
          : toneDisabledReason(settings, field)}
      onChange={(field, value) => actions.setSetting(field.key, value)}
      showCaption={showCaption}
    />
  );
}

function PresetRow({ actions, state }) {
  const styles = getWaterStyleOptions();
  const coverage = styles.find((entry) => entry.id === state.styleId)?.presets;
  const options = [
    ...(state.presetId === null ? [{ label: 'Custom…', value: '' }] : []),
    ...getWaterPresetOptions().map((entry) => ({
      label: state.styleId !== 'default' && coverage?.[entry.id]
        ? `${entry.label} · ${coverage[entry.id]}`
        : entry.label,
      value: entry.id,
    })),
    ...state.localPresets.map((entry) => ({ label: `${entry.label} · saved`, value: entry.id })),
  ];
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);
  return (
      <PresetRowShell label="Water recipe" title="The water-body recipe rendered through this style document.">
        <SearchSelect
          onChange={(id) => { if (id) actions.applyPreset(id); }}
          options={options}
          testId="preset-select"
          value={state.presetId ?? ''}
        />
        {isLocal && (
          <IconButton
            icon="trash"
            label="Delete this saved preset"
            onClick={() => actions.deletePreset(state.presetId)}
          />
        )}
      </PresetRowShell>
  );
}

function DocumentMenu({ actions, anchor, onClose, onExport, state }) {
  const [name, setName] = useState(state.name);
  const isLocal = state.localPresets.some((entry) => entry.id === state.presetId);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (result.ok) {
      for (const warning of result.warnings) toast(warning, { tone: 'warning' });
      onClose();
    } else {
      for (const error of result.errors) toast(error, { tone: 'danger' });
    }
  }

  function saveResult(result) {
    if (result.ok) onClose();
    else for (const error of result.errors ?? ['Could not save the preset.']) toast(error, { tone: 'danger' });
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={290}>
      <div className="wl-doc-menu">
        <div className="wl-save-row">
          <TextField onCommit={setName} placeholder="Water name…" value={name} />
          {isLocal && (
            <Button kind="primary" onClick={() => saveResult(actions.updatePreset(name))} testId="update-preset">
              Update
            </Button>
          )}
        </div>
        <Button kind={isLocal ? 'secondary' : 'primary'} onClick={() => saveResult(actions.savePresetAs(name))} testId="save-preset-as">
          Save As…
        </Button>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to preset
          </Button>
        )}
        <Button kind="secondary" onClick={() => { onClose(); onExport(); }}>Export…</Button>
        <Button kind="secondary" onClick={importJson}>Import preset JSON…</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function ExportDialog({ actions, engine, onClose, state }) {
  const slug = state.name.replace(/\s+/g, '-').toLowerCase() || 'water';

  function exportPreview() {
    engine.renderer.domElement.toBlob((blob) => {
      if (!blob) {
        toast('Could not capture the water preview.', { tone: 'danger' });
        return;
      }
      downloadBlob(blob, `${slug}-preview.png`, 'image/png');
      toast('Water preview PNG exported.', { tone: 'success' });
    }, 'image/png');
  }

  return (
    <Modal onClose={onClose} testId="water-export-dialog" title="Export water style" width={620}>
      <div className="tk-export-dialog">
        <p>Export the runtime Water profile, its preview, or a one-slot style bundle.</p>
        <div className="tk-export-dialog__actions">
          <Button kind="primary" onClick={() => downloadBlob(actions.exportDocument(), `${slug}.water-preset.json`, 'application/json')}>
            Export runtime style
          </Button>
          <Button
            kind="secondary"
            onClick={() => downloadBlob(actions.exportStyleBundle(), `${slug}.style-bundle.json`, 'application/json')}
            testId="export-style-bundle"
          >
            Export bundle with Water slot only
          </Button>
          <Button kind="secondary" onClick={exportPreview} testId="export-preview-png">Export preview PNG</Button>
        </div>
        <StyleBundleExportPrompt />
      </div>
    </Modal>
  );
}

function previewInScene(actions) {
  const stashed = setLabHandoff('water-lab-preview', actions.getHandoffPayload());
  if (!stashed) {
    toast('Could not stash the settings for the preview scene.', { tone: 'danger' });
    return;
  }
  window.location.href = '/playground/?scene=water';
}

function TopBar({ actions, engine, onOpenHome, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const menus = createLabEditorMenus({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onHome: onOpenHome,
    onRedo: () => actions.redo(),
    onUndo: () => actions.undo(),
    fileItems: [
      { icon: 'stage-export', label: 'Export…', onSelect: () => setExportOpen(true) },
      { icon: 'play', label: 'Preview in Scene', onSelect: () => previewInScene(actions) },
    ],
  });
  return (
    <>
    <LabEditorHeader className="wl-topbar" menus={menus}>
      <BrandLockup labName="Water Lab" onLabNameClick={onOpenHome} />
      <button
        type="button"
        className="wl-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="wl-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="wl-topbar-spacer" />
      <RendererToggle />
      <Button icon="play" kind="primary" onClick={() => previewInScene(actions)} testId="preview-scene">
        Preview in scene
      </Button>
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
    {exportOpen && (
      <ExportDialog actions={actions} engine={engine} onClose={() => setExportOpen(false)} state={state} />
    )}
    </>
  );
}

function SectionRail({ activeSection, onSectionChange, stage }) {
  return (
    <nav className="wl-rail tk" data-testid="section-rail">
      <button
        type="button"
        className="wl-rail-stage wl-rail-camera"
        data-mode-active="true"
        data-testid="rail-camera"
        title="Camera — choose Rotate, Pan, or Zoom from the control bar above the viewport."
      >
        <Icon name="tool-move" />
        <span>Camera</span>
      </button>
      <div className="wl-rail-divider" />
      {WATER_WORKSPACE_SECTIONS.filter(section=>!isWaterExperiment(stage)||['stage','surface','foam','lighting'].includes(section.id)).map((section) => (
        <button
          key={section.id}
          type="button"
          className="wl-rail-stage"
          data-active={activeSection === section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
          onClick={() => onSectionChange(section.id)}
        >
          <Icon name={SECTION_ICONS[section.id]} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Inspector({ actions, sectionId, state }) {
  const section = WATER_WORKSPACE_SECTIONS.find((entry) => entry.id === sectionId)
    ?? WATER_WORKSPACE_SECTIONS[0];
  const group = WATER_SETTING_GROUPS.find((entry) => entry.id === section.id);
  return (
    <aside className="wl-inspector tk" data-testid="inspector">
      <PresetRow actions={actions} state={state} />
      <h2 className="wl-inspector-header" data-testid="inspector-title">{section.label}</h2>
      <p className="wl-inspector-caption">
        {section.description}
        <span className="wl-info" title={section.id==='stage'?'Scene parameters are remembered locally for this lab preview; water appearance is saved in the style document.':`${section.label} settings are saved in the water style document; amber preview controls are not exported.`}>i</span>
      </p>
      {section.id==='stage' && (isWaterExperiment(state.view.stage)
        ? <SceneSettings state={state} actions={actions}/>
        : <p className="wl-inspector-caption">Choose a scene in the preview bar. Surf, Waterfall, and Glass box expose their dimensions and motion controls here.</p>)}
      {group && (
        <WaterSchemaGroup
          actions={actions}
          group={group}
          settings={state.settings}
          stage={state.view.stage}
          showCaption={false}
        />
      )}
    </aside>
  );
}

function CameraBar({ engine, mode, onModeChange, stage, preparing, breakerMode }) {
  return (
    <div className="wl-camerabar tk" data-testid="camera-bar">
      <span>Camera</span>
      <SegmentedControl
        onChange={onModeChange}
        options={CAMERA_MODE_OPTIONS}
        testId="camera-mode"
        value={mode}
      />
      <IconButton icon="reset" label="Reset camera" onClick={() => engine.resetCamera()} />
      <Button kind="secondary" onClick={() => engine.setCameraView('overview')} testId="camera-overview">
        Overview
      </Button>
      <Button kind="secondary" disabled={stage==='barrel'&&preparing} onClick={() => engine.setCameraView('close-up')} testId="camera-close-up">
        {stage==='barrel'?(breakerMode==='spilling'?'Wave face':'Inside barrel'):'Close-up'}
      </Button>
      <Button
        kind="secondary"
        onClick={() => engine.setCameraView('underwater-up')}
        testId="camera-underwater-up"
      >
        {isWaterExperiment(stage)?'Detail':'From below'}
      </Button>
      <Button
        kind="secondary"
        onClick={() => engine.setCameraView('underwater-floor')}
        testId="camera-underwater-floor"
      >
        {isWaterExperiment(stage)?'Side':'Seabed'}
      </Button>
      <span className="wl-camerabar-hint">Left-drag selected mode · wheel zoom · right-drag pan</span>
    </div>
  );
}

// The scene around the water — ground, test objects, weather toys, debug
// views. All preview; the preset carries only the water settings. (The
// Ground pick nudges wave-direction settings as an editing convenience.)
function WaterPreviewBar({ actions, engine, state }) {
  return (
    <PreviewBar
      hint={['barrel','glass-box'].includes(state.view.stage)?'':isWaterExperiment(state.view.stage)?'Scene controls in inspector':'⇧-drag the water to splash'}
      title="Preview only — the stage, test objects, and debug view are never exported with your water preset."
    >
      <span className="wl-previewbar-select">
        <Select
          onChange={(stage) => actions.setView({ stage })}
          options={WATER_LAB_STAGES.map((entry) => ({ label: entry.label, value: entry.id }))}
          testId="stage-ground"
          value={state.view.stage}
        />
      </span>
      <PreviewToggle checked={state.view.reference} label="Reference"
        title="Physical reference appearance; uses the same water motion as the stylized view"
        onChange={(reference) => actions.setView({ reference })} testId="water-reference" />
      <PreviewToggle checked={state.view.paused} label="Pause"
        onChange={(paused) => actions.setView({ paused })} testId="water-pause" />
      <Button kind="secondary" disabled={isWaterExperiment(state.view.stage)&&state.view.preparing} onClick={() => engine.stepFrame()} testId="water-step">Step</Button>
      {isWaterExperiment(state.view.stage) && <Button kind="secondary" disabled={state.view.preparing} onClick={()=>engine.replay()} testId="water-replay">Replay</Button>}
      {['barrel','glass-box'].includes(state.view.stage)&&<label className="wl-fluid-timeline">Time <input type="range" aria-label="Simulation time" data-testid="fluid-timeline" min="0" max={state.view.stage==='barrel'?3:4} step={1/60} defaultValue="0" disabled={state.view.preparing} onChange={event=>engine.seek(Number(event.target.value))}/></label>}
      {!isWaterExperiment(state.view.stage) && <>
      <PreviewToggle
        checked={state.view.rocks}
        label={state.view.stage === 'tank' ? 'Gauges' : 'Rocks'}
        onChange={(rocks) => actions.setView({ rocks })}
        testId="stage-rocks"
        title="Depth-fade reference rocks"
      />
      <span className="tk-previewbar-slider" title="Koi school size">
        <span>Fish</span>
        <Slider max={90} min={0} onChange={(fish) => actions.setView({ fish: Math.round(fish) })} step={1} value={state.view.fish} />
      </span>
      <span className="tk-previewbar-slider" title="Flow-reactive underwater plants">
        <span>Plants</span>
        <Slider max={160} min={0} onChange={(kelp) => actions.setView({ kelp: Math.round(kelp) })} step={1} value={state.view.kelp} />
      </span>
      <span className="wl-previewbar-select wl-previewbar-select--debug">
        <Select onChange={(debug) => actions.setView({ debug })} options={DEBUG_OPTIONS} value={state.view.debug} />
      </span>
      <Button kind="secondary" onClick={() => engine.dropBall()} testId="drop-ball">Ball</Button>
      <Button kind="secondary" onClick={() => engine.dropBall({ sinker: true })} testId="drop-sinker">Sinker</Button>
      <PreviewToggle
        checked={state.view.rain}
        label="Rain"
        onChange={(rain) => actions.setView({ rain })}
        testId="stage-rain"
        title="Rain splashes on the surface"
      />
      </>}
    </PreviewBar>
  );
}

function StatusBar({ state }) {
  return (
    <footer className="wl-status tk" data-testid="status-bar">
      <span className="wl-status-message">{state.status}</span>
      <output data-testid="water-diagnostics" className="wl-water-diagnostics" />
      <span className="wl-status-spacer" />
      <span className="wl-status-meta">
        {state.settings.mode} · {state.settings.colorTone} · {state.settings.quality}
      </span>
    </footer>
  );
}

export function App({ engine, showEntryChooser = true, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [sectionId, setSectionId] = useState(isWaterExperiment(state.view.stage)?'stage':WATER_SETTING_GROUPS[0].id);
  const [cameraMode, setCameraModeState] = useState('rotate');
  const [entryChooserOpen, setEntryChooserOpen] = useState(showEntryChooser);
  const entryOptions = [
    { label: 'Call Me Sensei · system · read-only', value: 'system-style:call_me_sensei' },
    ...getWaterPresetOptions().map((entry) => ({ label: `${entry.label} · starter`, value: entry.id })),
    ...state.localPresets.map((entry) => ({ label: `${entry.label} · saved`, value: entry.id })),
  ];

  useEffect(() => { document.title = `${state.name} — Water Lab`; }, [state.name]);
  useEffect(() => { engine.setCameraMode(cameraMode); }, [cameraMode, engine]);
  useEffect(() => { if(isWaterExperiment(state.view.stage))setSectionId('stage'); }, [state.view.stage]);

  return (
    <>
      {entryChooserOpen && (
        <LabEntryChooser
          currentDescription={state.bootSource === 'persisted'
            ? 'Continue the water draft restored from this browser.'
            : 'Continue with the current Water Lab starter.'}
          currentName={state.name}
          entries={entryOptions}
          labName="Water Lab"
          newDescription="Start a clean Lake treatment without changing any saved preset."
          newLabel="New water style"
          onContinue={() => setEntryChooserOpen(false)}
          onCreate={() => {
            actions.resetLab();
            setEntryChooserOpen(false);
          }}
          openLabel="Open style"
          onOpenEntry={(id) => {
            if (id === 'system-style:call_me_sensei') {
              actions.setStyle('call_me_sensei');
              setEntryChooserOpen(false);
              return;
            }
            if (actions.applyPreset(id)) setEntryChooserOpen(false);
          }}
        />
      )}
      <div className="tk">
        <div className="wl-root">
          <TopBar actions={actions} engine={engine} onOpenHome={() => setEntryChooserOpen(true)} state={state} />
          <SectionRail activeSection={sectionId} onSectionChange={setSectionId} stage={state.view.stage} preparing={state.view.preparing} breakerMode={state.experimentSettings.breakerMode} />
          <Inspector actions={actions} sectionId={sectionId} state={state} />
          <StatusBar state={state} />
        </div>
        <CameraBar engine={engine} mode={cameraMode} onModeChange={setCameraModeState} stage={state.view.stage} preparing={state.view.preparing} breakerMode={state.experimentSettings.breakerMode} />
        <WaterPreviewBar actions={actions} engine={engine} state={state} />
        <ToastStack />
      </div>
    </>
  );
}
