// Shared Tree/Flower workspace shell: top bar, workflow rail, right inspector
// / power drawer, floating tool strip + options bar, status bar, and modal
// layers. labKind narrows vocabulary and authoring scope; the engine renders
// underneath.

import { useEffect, useRef, useState } from 'react';
import {
  Badge, BrandLockup, Button, createLabEditorMenus, Icon, IconButton, LabEditorHeader, Modal, Popover,
  PreviewBar, PreviewToggle, RendererToggle, Select, Slider,
  TextField, toast, ToastStack, useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { isLabEditorLocation, syncLabHomeRoute } from '../../shared/labViewRouting.js';
import '../../shared/siteHeader.js';
import { WEATHER_PRESETS } from '../engine/skyWeather.js';
import { BARK_TEXTURE_PRESETS } from '../engine/barkTextures.js';
import { WALK_PREVIEW_TITLE } from '../../shared/walkPreview.js';
import { findTreePreset, loadLocalTreePresets } from '../treePresetStore.js';
import { stagesForLab } from './stageMap.js';
import { TREE_SETTING_FIELD_SCHEMA } from '../../../src/vegetation/treeRecipe.js';
import { getVegetationShaderPresetOptions } from '../../../src/vegetation/vegetationShaders.js';
import { StagePanel } from './panels/StagePanel.jsx';
import { PowerDrawer } from './panels/PowerDrawer.jsx';
import { WoodyBaselinePanel } from './panels/WoodyBaselinePanel.jsx';
import { ExportDialog } from './panels/ExportDialog.jsx';
import { AnimationPanel } from './panels/AnimationPanel.jsx';
import { FlowersPanel } from './panels/FlowersPanel.jsx';
import { CustomShapeDialog, LeafPaletteSection, LeafStyleSection } from './LeafStylePanel.jsx';
import { GalleryScreen } from './screens/GalleryScreen.jsx';
import { capturePresetThumbnails } from './thumbnails.js';
import { OptionsBar, SketchModeBar, ToolStrip } from './ToolStripTree.jsx';
import { BranchInspectorPopover } from './BranchInspectorPopover.jsx';

const WOODY_BASELINE_STAGE_GROUPS = Object.freeze({
  shape: Object.freeze(['form', 'dimensions']),
  wood: Object.freeze(['trunk', 'axisNoise', 'branching', 'roots', 'resolution']),
  leaves: Object.freeze(['foliage']),
  look: Object.freeze(['appearance', 'mapping']),
  animation: Object.freeze(['motion', 'shedding']),
  flowers: Object.freeze(['reproductive']),
});

function DocumentMenu({ actions, anchor, onClose, state }) {
  const preset = state.presetId ? findTreePreset(state.presetId) : null;
  const isLocal = loadLocalTreePresets().some(({ id }) => id === state.presetId);
  const [name, setName] = useState(preset?.label ?? '');

  function report(result, fallback) {
    if (result.ok) {
      onClose();
      return;
    }
    toast(result.error ?? fallback, { tone: 'danger' });
  }

  return (
    <Popover anchor={anchor} onClose={onClose} title="Asset document" width={310}>
      <div className="td-doc-menu">
        <div style={{ display: 'flex', gap: 8 }}>
          <TextField onCommit={setName} placeholder="Asset name…" testId="preset-name" value={name} />
          <Button
            disabled={!name.trim()}
            kind="primary"
            onClick={() => report(actions.savePresetAs(name), 'Could not save the asset.')}
            testId="preset-save"
          >
            Save As
          </Button>
        </div>
        {isLocal && (
          <Button
            kind="secondary"
            onClick={() => report(actions.updatePreset(), 'Could not update the asset.')}
            testId="preset-update"
          >
            Update saved asset
          </Button>
        )}
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>
            Revert to preset
          </Button>
        )}
        <Button kind="ghost" onClick={() => { actions.setView({ gallery: true }); onClose(); }}>
          Open searchable asset gallery
        </Button>
        <p className="td-doc-help">
          Changes autosave as the current draft. Save As creates a separate local asset;
          Update replaces only the selected local asset. Recipe JSON rebuilds the runtime plant,
          while GLB is the baked interchange asset.
        </p>
        <Button kind="danger" onClick={() => actions.resetLab()} testId="reset-lab">
          Reset designer…
        </Button>
      </div>
    </Popover>
  );
}

function EnvironmentMenu({ actions, anchor, onClose, state }) {
  const hour = state.sky.hour;
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  return (
    <Popover anchor={anchor} onClose={onClose} title="Environment" width={360}>
      <div style={{ display: 'grid', gap: 10, padding: '4px 2px' }}>
        <div className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">Time of day</span></span>
          <Slider
            defaultValue={12}
            max={24}
            min={0}
            onChange={(value) => actions.setSky({ hour: value })}
            step={0.5}
            testId="sky-hour"
            value={hour}
          />
          <span style={{ font: 'var(--type-value)', textAlign: 'right' }}>{clock}</span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="tk-field-label"><span className="tk-field-label-text">Weather</span></span>
          <Select
            onChange={(weather) => actions.setSky({ weather })}
            options={Object.entries(WEATHER_PRESETS)
              .map(([value, preset]) => ({ label: preset.label, value }))}
            testId="sky-weather"
            value={state.sky.weather}
          />
        </div>
        <span style={{ font: 'var(--type-caption)', opacity: 0.6 }}>
          Presentation only — never part of the recipe or exports.
        </span>
      </div>
    </Popover>
  );
}

function TopBar({ actions, labKind, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [capturingThumbnail, setCapturingThumbnail] = useState(false);
  const preset = state.presetId ? findTreePreset(state.presetId) : null;
  const isFlowerLab = labKind === 'flower';
  const title = preset?.label ?? (isFlowerLab ? 'Untitled flower' : 'Untitled tree');
  const openHome = () => actions.setView({ gallery: true, drawer: false, export: false });
  const menus = createLabEditorMenus({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onHome: openHome,
    onRedo: () => actions.redo(),
    onUndo: () => actions.undo(),
    fileItems: [
      { icon: 'link', label: 'Copy Share Link', onSelect: () => { void share(); } },
      { icon: 'stage-export', label: 'Export…', onSelect: () => actions.setView({ export: true }) },
    ],
  });

  async function share() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('recipe', JSON.stringify(actions.getRecipeDocument()));
    url.searchParams.set('vegetationStyle', state.styleId);
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      actions.setStatus('Link copied to clipboard.');
    } catch {
      actions.setStatus('Link written to the address bar (clipboard unavailable).');
    }
  }

  async function captureThumbnail() {
    if (!state.presetId || capturingThumbnail) return;
    setCapturingThumbnail(true);
    try {
      await capturePresetThumbnails([actions.getRecipeDocument()]);
      toast(`Captured thumbnail for “${title}”.`, { tone: 'success' });
    } catch (error) {
      toast(`Thumbnail capture failed: ${error.message}`, { tone: 'danger' });
    } finally {
      setCapturingThumbnail(false);
    }
  }

  return (
    <LabEditorHeader className="td-topbar" menus={menus}>
      <BrandLockup
        labName={isFlowerLab ? 'Flower Lab' : 'Tree & Shrub Generation Lab'}
        onLabNameClick={openHome}
      />
      <button
        type="button"
        className="td-topbar-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {title}
        {state.presetDirty && <span className="td-dirty-dot">●</span>}
        <Icon name="chevron-down" />
      </button>
      <span className="td-topbar-spacer" />
      <RendererToggle />
      <Button icon="link" kind="ghost" onClick={share} testId="share">Share</Button>
      <Button
        disabled={!state.presetId || capturingThumbnail}
        icon="save"
        kind="ghost"
        onClick={captureThumbnail}
        testId="capture-thumbnail"
        title={state.presetId
          ? 'Render and cache this tree’s gallery thumbnail'
          : 'Save this tree as a local asset before capturing a gallery thumbnail'}
      >
        {capturingThumbnail ? 'Capturing…' : 'Capture thumbnail'}
      </Button>
      <Button
        icon="stage-export"
        kind="primary"
        onClick={() => actions.setView({ export: true })}
        testId="export-open"
      >
        Export
      </Button>
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

function StageRail({ actions, labKind, state }) {
  const stages = stagesForLab(labKind);
  return (
    <nav className="td-rail tk" data-testid="stage-rail">
      {/* Move is a UTILITY, not a stage: it shows whether your hands are on
          the camera (no tool held) and clicking it puts any tool down. Its
          active style is deliberately different from stage highlighting so
          the rail never shows two "selections". Hold Space to pan/orbit
          temporarily while a tool is held. */}
      <button
        type="button"
        className="td-rail-stage td-rail-mode"
        data-mode-active={state.tool === 'move'}
        data-testid="rail-move"
        title="Move (V) — select to choose what left-drag does: Rotate, Pan, or Zoom. Esc deselects (drag still rotates by default); hold Space for a quick pan mid-tool."
        onClick={() => {
          // Inside Sketch mode, Move only parks the brush — the pending
          // doodle stays so you can orbit and keep drawing from a new angle.
          const putDown = state.sketchMode ? 'doodleWood' : 'orbit';
          actions.setTool(state.tool === 'move' ? putDown : 'move');
        }}
      >
        <Icon name="tool-move" />
        <span>Move</span>
      </button>
      <div style={{ height: 1, width: 36, background: 'var(--border-subtle)' }} />
      {stages.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="td-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          data-testid={`stage-${stage.id}`}
          title={`${stage.label} (${stage.key}) — ${stage.description}`}
          onClick={() => {
            actions.setStage(stage.id);
            actions.setView({ drawer: false });
          }}
        >
          <Icon name={stage.icon} />
          <span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="td-rail-stage td-rail-bottom"
        data-active={state.view.drawer}
        data-testid="drawer-toggle"
        title="All controls (`)"
        onClick={() => actions.setView({ drawer: !state.view.drawer })}
      >
        <Icon name="drawer" />
        <span>All</span>
      </button>
    </nav>
  );
}

function BarkTextureSection({ actions, state }) {
  const fileRef = useRef(null);
  const current = state.barkTexture?.id ?? 'classic';

  function onUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // Downscale to 512px so the dataURL stays localStorage-friendly.
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      actions.setBarkTexture({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), id: 'custom' });
    };
    image.onerror = () => actions.setStatus('That file could not be read as an image.');
    image.src = url;
  }

  return (
    <section className="tk-section" data-testid="bark-texture-section">
      <div className="tk-section-title">Bark texture</div>
      <div className="tk-section-caption">
        Surface detail for trunk and branches — presets, your own image, or
        flat toon color.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 4px' }}>
        {[
          ...Object.entries(BARK_TEXTURE_PRESETS).map(([id, preset]) => [id, preset.label]),
          ['none', 'None'],
          ['custom', 'Custom'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="tk-button"
            data-kind={current === id ? 'primary' : 'secondary'}
            data-testid={`bark-${id}`}
            disabled={id === 'custom' && !state.barkTexture?.dataUrl}
            title={id === 'custom' && !state.barkTexture?.dataUrl
              ? 'Upload an image below first' : undefined}
            onClick={() => actions.setBarkTexture(
              { ...(state.barkTexture ?? {}), id })}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ margin: '8px 4px 0' }}>
        <Button kind="secondary" onClick={() => fileRef.current?.click()} testId="bark-upload">
          ⬆️ Upload texture…
        </Button>
        <input
          ref={fileRef}
          accept="image/*"
          hidden
          onChange={onUpload}
          type="file"
        />
      </div>
    </section>
  );
}

function TrunkShapeSection({ actions, labKind, state }) {
  const [drawing, setDrawing] = useState(false);
  const isFlowerLab = labKind === 'flower';
  return (
    <section className="tk-section" data-testid="trunk-shape-section">
      <div className="tk-section-title">{isFlowerLab ? 'Stem shape' : 'Trunk shape'}</div>
      <div className="tk-section-caption">
        {isFlowerLab
          ? 'Draw the stem cross-section used by this flower and its secondary stems.'
          : 'Draw the trunk cross-section — the grounded stems sweep it instead of a circle (buttress, fluted, gnarled bases).'}
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '0 4px' }}>
        <Button kind="secondary" onClick={() => setDrawing(true)} testId="trunk-shape-draw">
          ✏️ Draw base shape…
        </Button>
        {state.trunkProfile && (
          <Button kind="ghost" onClick={() => actions.setTrunkProfile(null)} testId="trunk-shape-clear">
            Reset to round
          </Button>
        )}
      </div>
      {drawing && (
        <CustomShapeDialog
          onClose={() => setDrawing(false)}
          onSave={(outline) => {
            actions.setTrunkProfile({ outline });
            setDrawing(false);
          }}
          title={`Draw the ${isFlowerLab ? 'stem' : 'trunk'} cross-section`}
        />
      )}
    </section>
  );
}

function WoodDetailsSection({ actions, state }) {
  const details = state.woodDetails ?? { knots: 0, scars: 0 };
  const set = (patch) => actions.setWoodDetails({ ...details, ...patch });
  return (
    <section className="tk-section" data-testid="wood-details-section">
      <div className="tk-section-title">Details</div>
      <div className="tk-section-caption">
        Knots and scars on the lower trunk — real trees are never perfect.
      </div>
      {[['Knots', 'knots'], ['Scars', 'scars']].map(([label, key]) => (
        <div key={key} className="tk-field">
          <span className="tk-field-label"><span className="tk-field-label-text">{label}</span></span>
          <Slider
            defaultValue={0}
            max={1}
            min={0}
            onChange={(value) => set({ [key]: value })}
            step={0.05}
            testId={`wood-${key}`}
            value={details[key]}
          />
          <ScrubValue
            max={1}
            min={0}
            onChange={(value) => set({ [key]: value })}
            step={0.05}
            value={details[key]}
          />
        </div>
      ))}
    </section>
  );
}

// Top-down root layout: draw each root as a stroke from the trunk (center
// dot) outward — exact plan-view control instead of the uniform radial
// presets. Paths are normalized to [-1, 1] around the trunk.
function RootLayoutDialog({ onClose, onSave }) {
  const canvasRef = useRef(null);
  const pathsRef = useRef([]);
  const activeRef = useRef(null);

  function redraw() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const mid = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    // Trunk cross-section at the center for reference.
    ctx.fillStyle = 'rgba(176,122,74,0.9)';
    ctx.beginPath();
    ctx.arc(mid, mid, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(138,90,58,0.9)';
    for (const path of [...pathsRef.current, activeRef.current].filter(Boolean)) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0][0], path[0][1]);
      for (const [x, y] of path.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  useEffect(redraw, []);

  return (
    <Modal onClose={onClose} title="Draw the root layout (top view)" width={340}>
      <p style={{ color: 'var(--text-secondary)', font: 'var(--type-caption)', marginBottom: 8 }}>
        You&apos;re looking straight down at the trunk (center dot). Draw each
        root from the trunk outward — length and direction are exactly what
        you draw.
      </p>
      <canvas
        ref={canvasRef}
        data-testid="root-layout-canvas"
        height={260}
        width={260}
        style={{
          background: 'var(--surface-2)', borderRadius: 8, cursor: 'crosshair', touchAction: 'none',
        }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          activeRef.current = [[event.clientX - rect.left, event.clientY - rect.top]];
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch { /* synthetic pointers */ }
        }}
        onPointerMove={(event) => {
          if (!activeRef.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          activeRef.current.push([event.clientX - rect.left, event.clientY - rect.top]);
          redraw();
        }}
        onPointerUp={() => {
          if (activeRef.current && activeRef.current.length >= 3) {
            pathsRef.current.push(activeRef.current);
          }
          activeRef.current = null;
          redraw();
        }}
      />
      <div className="td-export-actions">
        <Button kind="ghost" onClick={() => { pathsRef.current = []; activeRef.current = null; redraw(); }}>
          Clear
        </Button>
        <Button
          kind="primary"
          onClick={() => {
            const size = canvasRef.current.width;
            const paths = pathsRef.current
              .map((path) => {
                const step = Math.max(1, Math.floor(path.length / 20));
                return path
                  .filter((_, index) => index % step === 0)
                  .map(([x, y]) => [
                    Number(((x / size) * 2 - 1).toFixed(3)),
                    Number(((y / size) * 2 - 1).toFixed(3)),
                  ]);
              })
              .filter((path) => path.length >= 2);
            if (!paths.length) return;
            onSave(paths);
            onClose();
          }}
          testId="root-layout-save"
        >
          Use this layout
        </Button>
      </div>
    </Modal>
  );
}

function RootsSection({ actions, state }) {
  const [drawing, setDrawing] = useState(false);
  const current = state.roots?.preset ?? 'none';
  return (
    <section className="tk-section" data-testid="roots-section">
      <div className="tk-section-title">Roots</div>
      <div className="tk-section-caption">
        Surface roots radiating from the base collar. Draw the exact layout
        from above, or add individual ones with the 🫚 Root brush in Sketch
        mode.
      </div>
      <div className="tk-segmented" style={{ margin: '0 4px' }}>
        {['none', 'small', 'medium', 'large'].map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={current === preset}
            data-testid={`roots-${preset}`}
            onClick={() => actions.setRoots(preset === 'none' ? null : { preset })}
          >
            {preset[0].toUpperCase() + preset.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '8px 4px 0' }}>
        <Button
          kind={current === 'custom' ? 'primary' : 'secondary'}
          onClick={() => setDrawing(true)}
          testId="roots-draw"
        >
          ✏️ Draw layout…
        </Button>
        {current === 'custom' && (
          <Badge>{state.roots.paths.length} drawn</Badge>
        )}
      </div>
      {drawing && (
        <RootLayoutDialog
          onClose={() => setDrawing(false)}
          onSave={(paths) => actions.setRoots({ paths, preset: 'custom' })}
        />
      )}
    </section>
  );
}

function Inspector({ actions, labKind, state }) {
  const isFlowerLab = labKind === 'flower';
  if (state.view.drawer) {
    return (
      <aside className="td-inspector tk" data-drawer="true" data-testid="inspector">
        <PowerDrawer actions={actions} labKind={labKind} state={state} />
      </aside>
    );
  }
  const stages = stagesForLab(labKind);
  const stage = stages.find((entry) => entry.id === state.stage) ?? stages[0];
  const baselineSpecies = !isFlowerLab
    && ['woody-axis', 'whorled-conifer'].includes(state.settings.structure.engine);
  const standardGroups = baselineSpecies
    ? (stage.id === 'shape' ? ['plant'] : stage.id === 'look' ? ['color'] : [])
    : stage.groups;
  return (
    <aside className="td-inspector tk" data-testid="inspector">
      <div className="td-inspector-header">{stage.label}</div>
      <div className="td-inspector-caption">{stage.description}</div>
      {stage.id === 'animation' && !isFlowerLab && !baselineSpecies
        && <AnimationPanel actions={actions} state={state} />}
      {stage.id === 'flowers' && !isFlowerLab && !baselineSpecies
        && <FlowersPanel actions={actions} state={state} />}
      {stage.id === 'look' && <LeafStyleSection actions={actions} state={state} />}
      {stage.id === 'look' && <LeafPaletteSection actions={actions} state={state} />}
      {stage.id === 'look' && !isFlowerLab && <BarkTextureSection actions={actions} state={state} />}
      {stage.id === 'wood' && !baselineSpecies
        && <TrunkShapeSection actions={actions} labKind={labKind} state={state} />}
      {stage.id === 'wood' && !isFlowerLab && !baselineSpecies
        && <WoodDetailsSection actions={actions} state={state} />}
      {stage.id === 'wood' && !isFlowerLab && !baselineSpecies
        && <RootsSection actions={actions} state={state} />}
      <StagePanel actions={actions} groupIds={standardGroups} labKind={labKind} state={state} />
      {baselineSpecies && (
        <WoodyBaselinePanel
          actions={actions}
          groupIds={WOODY_BASELINE_STAGE_GROUPS[stage.id] ?? []}
          labKind={labKind}
          state={state}
          title={`${stage.label} baseline controls`}
        />
      )}
    </aside>
  );
}

function StatusBar({ actions, engine, state }) {
  // Re-read the engine's dataset stats after every rebuild.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!engine) return undefined;
    return engine.onRebuilt(() => setTick((tick) => tick + 1));
  }, [engine]);
  useEffect(() => {
    if (!engine) return undefined;
    return engine.onPreviewChanged(() => setTick((tick) => tick + 1));
  }, [engine]);
  const cards = document.body.dataset.treeCardCount ?? '0';
  const previewLevel = state.previewLod;
  const previewTriangles = document.body.dataset.treePreviewTriangles;
  const previewMaterials = document.body.dataset.treePreviewMaterials;
  const previewCap = document.body.dataset.treePreviewTriangleCap;
  const previewOverage = Math.max(0, Number(previewTriangles) - Number(previewCap));
  return (
    <footer className="td-status tk" data-testid="status-bar">
      <span>{state.status}</span>
      <span
        className="td-status-stats"
        data-over-cap={previewLevel !== null && previewOverage > 0 ? 'true' : undefined}
      >
        {previewLevel === null
          ? <>seed {state.settings.plant.seed} · {Number(cards).toLocaleString()} cards</>
          : previewTriangles
            ? (
              <>
                LOD{previewLevel} · {Number(previewTriangles).toLocaleString()} triangles ·{' '}
                {previewMaterials} material{previewMaterials === '1' ? '' : 's'} · cap{' '}
                {Number(previewCap).toLocaleString()}
                {previewOverage > 0 && <> · {previewOverage.toLocaleString()} over cap</>}
              </>
            )
            : <>LOD{previewLevel} preview unavailable</>}
      </span>
    </footer>
  );
}

function LodPreviewControl({ actions, state }) {
  const options = [
    { label: 'Edit', title: 'Editable live tree with wind and authoring handles.', value: null },
    { label: 'LOD0', title: 'Preview the exact compiled LOD0 export mesh.', value: 0 },
    { label: 'LOD1', title: 'Preview the exact compiled LOD1 export mesh.', value: 1 },
    { label: 'LOD2', title: 'Preview the exact compiled LOD2 export mesh.', value: 2 },
    { label: 'LOD3', title: 'Preview the exact compiled LOD3 far mesh.', value: 3 },
  ];
  return (
    <span
      className="td-lod-preview"
      data-testid="lod-preview-control"
      title="Inspect the exact meshes produced by the tree LOD compiler. This choice is preview-only."
    >
      <span className="td-lod-preview-label">Mesh</span>
      <span className="tk-segmented" role="group" aria-label="Tree mesh preview level">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={state.previewLod === option.value}
            data-testid={`preview-${option.label.toLowerCase()}`}
            title={option.title}
            onClick={() => {
              actions.setPreviewLod(option.value);
              document.activeElement?.blur?.();
            }}
          >
            {option.label}
          </button>
        ))}
      </span>
    </span>
  );
}

// Scene-preview configuration — the bottom bar over the viewport (shared
// PreviewBar): time of day, weather, scale mannequin, walking. All
// presentation, never part of the recipe or the shader preset.
function TreePreviewBar({ actions, labKind, state }) {
  const hour = state.sky.hour;
  const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  return (
    <PreviewBar
      hint={state.walkPreview
        ? 'WASD/arrows move · Shift runs · Space jumps'
        : 'Move tool: choose Rotate, Pan, or Zoom for left-drag · wheel zoom · right-drag pan'}
      title="Preview only — style, LOD selection, time, weather, mannequin, and walking are presentation; never saved into the recipe."
    >
      {labKind === 'tree' && <LodPreviewControl actions={actions} state={state} />}
      <span
        className="td-previewbar-style"
        title="IP-wide vegetation rendition — applies across every tree and flower preset without changing its recipe."
      >
        <span>Style</span>
        <Select
          onChange={(styleId) => actions.setStyleId(styleId)}
          options={getVegetationShaderPresetOptions().map((entry) => ({
            label: entry.label,
            value: entry.id,
          }))}
          testId="vegetation-style"
          value={state.styleId}
        />
      </span>
      <span className="tk-previewbar-slider" title={`Time of day — ${clock}`}>
        <span>{clock}</span>
        <Slider defaultValue={12} max={24} min={0} onChange={(value) => actions.setSky({ hour: value })} step={0.5} testId="sky-hour" value={hour} />
      </span>
      <span className="td-previewbar-select">
        <Select
          onChange={(weather) => actions.setSky({ weather })}
          options={Object.entries(WEATHER_PRESETS).map(([value, preset]) => ({ label: preset.label, value }))}
          testId="sky-weather"
          value={state.sky.weather}
        />
      </span>
      <span className="tk-previewbar-slider" title="Wind strength — scene atmosphere; the canopy flutter it drives is live, never baked into exports.">
        <span>Wind</span>
        <Slider
          max={TREE_SETTING_FIELD_SCHEMA.wind.strength.range?.max ?? 0.3}
          min={0}
          onChange={(value) => actions.setField(TREE_SETTING_FIELD_SCHEMA.wind.strength, value)}
          step={TREE_SETTING_FIELD_SCHEMA.wind.strength.range?.step ?? 0.005}
          testId="wind-strength"
          value={state.settings.wind.strength}
        />
      </span>
      <span className="tk-previewbar-slider" title="Wind speed — how fast the flutter oscillates.">
        <span>Speed</span>
        <Slider
          max={TREE_SETTING_FIELD_SCHEMA.wind.speed.range?.max ?? 3}
          min={0}
          onChange={(value) => actions.setField(TREE_SETTING_FIELD_SCHEMA.wind.speed, value)}
          step={TREE_SETTING_FIELD_SCHEMA.wind.speed.range?.step ?? 0.05}
          testId="wind-speed"
          value={state.settings.wind.speed}
        />
      </span>
      <PreviewToggle
        checked={Boolean(state.mannequin)}
        label="Scale"
        onChange={(mannequin) => actions.setMannequin(mannequin)}
        testId="mannequin-toggle"
        title="Show a 1.8m mannequin next to the tree for scale"
      />
      <PreviewToggle
        checked={Boolean(state.walkPreview)}
        label="Walk"
        onChange={(on) => {
          if (on) actions.setMannequin(true);
          actions.setWalkPreview(on);
        }}
        testId="walk-toggle"
        title={WALK_PREVIEW_TITLE}
      />
    </PreviewBar>
  );
}

export function App({ engine, labKind = 'tree', sketchBindings, store }) {
  const state = useStoreState(store);
  const { actions } = store;

  useEffect(() => {
    document.title = labKind === 'flower'
      ? 'Flower Lab · ToonLab'
      : 'Tree & Shrub Generation Lab · ToonLab';
  }, [labKind]);

  const directParams = ['recipe', labKind === 'flower' ? 'flowerPreset' : 'treePreset'];
  const homeRoute = !isLabEditorLocation({ directParams });
  useEffect(() => {
    syncLabHomeRoute(state.view.gallery, { directParams });
  }, [state.view.gallery]);

  if (homeRoute) {
    return (
      <div className="tk">
        <toonlab-site-header active="labs" />
        <GalleryScreen actions={actions} labKind={labKind} state={state} />
        <ToastStack />
      </div>
    );
  }

  return (
    <div className="tk">
      <div className="td-root">
        <TopBar actions={actions} labKind={labKind} state={state} />
        <StageRail actions={actions} labKind={labKind} state={state} />
        <Inspector actions={actions} labKind={labKind} state={state} />
        <StatusBar actions={actions} engine={engine} state={state} />
      </div>
      {state.sketchMode
        ? <SketchModeBar actions={actions} sketchBindings={sketchBindings} state={state} />
        : (
          <>
            <ToolStrip actions={actions} labKind={labKind} state={state} />
            <OptionsBar actions={actions} labKind={labKind} state={state} />
          </>
        )}
      <TreePreviewBar actions={actions} labKind={labKind} state={state} />
      <BranchInspectorPopover actions={actions} state={state} />
      {state.view.export && (
        <ExportDialog
          actions={actions}
          engine={engine}
          onClose={() => actions.setView({ export: false })}
          state={state}
        />
      )}
      <ToastStack />
    </div>
  );
}
