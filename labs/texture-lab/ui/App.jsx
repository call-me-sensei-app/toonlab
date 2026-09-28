// Texture Lab HUD: topbar (document, scene hub, export), stage rail,
// schema-driven inspector, floating preview options bar, and status bar.
// Same shell as rock/tree/debris; classes are prefixed tx-.

import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEditorHeader,
  Popover,
  SegmentedControl,
  Select,
  Slider,
  TextField,
  toast,
  ToastStack,
  Toggle,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { isLabEditorLocation, syncLabHomeRoute } from '../../shared/labViewRouting.js';
import '../../shared/siteHeader.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { PUBLIC_SCENE_HUB_OPTIONS, navigateSceneHub } from '../../shared/sceneHub.js';
import { persistLabScene } from '../../shared/labParams.js';
import {
  TEXTURE_GENERATORS,
  TEXTURE_SETTING_FIELD_SCHEMA,
  TEXTURE_SETTING_GROUPS,
} from '../../../src/texgen/index.js';
import { TEXTURE_PREVIEW_MESHES, TEXTURE_VIEW_MAPS } from '../engine/textureEngine.js';
import { getTexturePreviewStyleOptions } from '../previewStyles.js';
import { AiPanel } from './AiPanel.jsx';
import { ExportDialog } from './ExportDialog.jsx';
import { GalleryScreen } from './GalleryScreen.jsx';
import { pickTextureImage } from './imageUpload.js';

const STAGES = [
  { description: 'Primary pattern plus two detail layers.', icon: 'stage-shape', id: 'base', key: '1', label: 'Pattern' },
  { description: 'Height ramp, painterly jitter, cavity, sheen, grade.', icon: 'stage-look', id: 'color', key: '2', label: 'Color' },
  { description: 'Masked colored overlays: moss, rust, grime, snow…', icon: 'stage-detail', id: 'overlays', key: '3', label: 'Overlays' },
  { description: 'Relief, occlusion, roughness, metalness, glow.', icon: 'stage-wood', id: 'surface', key: '4', label: 'Surface' },
  { description: 'Describe any material in plain words.', icon: 'sketch', id: 'ai', key: '5', label: 'AI' },
];

const GROUPS_BY_ID = Object.fromEntries(TEXTURE_SETTING_GROUPS.map((group) => [group.id, group]));
const STAGE_GROUPS = {
  base: ['base', 'detailA', 'detailB'],
  color: ['color'],
  overlays: ['wear', 'accentA', 'accentB'],
  surface: ['surface', 'emissive'],
};
const LAYER_CORE_FIELDS = new Set(['enabled', 'generator', 'blend', 'amount', 'contrast', 'bias', 'invert', 'rotate90',
  'color', 'colorB', 'coverage', 'softness', 'creviceBias', 'roughnessShift', 'heightShift', 'metalShift']);

/** Hides layer-shape params the selected generator does not read. */
function layerFieldFilter(values) {
  const uses = new Set(TEXTURE_GENERATORS[values.generator]?.uses ?? []);
  return (field) => LAYER_CORE_FIELDS.has(field.key) || uses.has(field.key)
    || field.key === 'warp' || field.key === 'warpScale';
}

// Ramp/cell controls that the image base bypasses (its albedo replaces the
// height ramp) — disabled with a hint instead of hidden, so the model of
// "image replaces the base layer" stays visible.
const IMAGE_BYPASSED_COLOR_KEYS = new Set(['color0', 'color1', 'color2', 'color3', 'color4', 'pos1', 'pos2', 'pos3', 'rampSmooth', 'jitterCells']);

function TextureSchemaGroup({ actions, flat, group, settings }) {
  const values = settings[group];
  const isLayer = group === 'base' || group.startsWith('detail') || group.startsWith('accent');
  const hasImage = Boolean(settings.image);
  return (
    <SchemaGroup
      fieldFilter={isLayer ? layerFieldFilter(values) : undefined}
      fields={TEXTURE_SETTING_FIELD_SCHEMA[group]}
      flat={flat}
      getValue={(field) => values[field.key]}
      group={GROUPS_BY_ID[group]}
      isDisabled={(field) => {
        if ('enabled' in values && !values.enabled && field.key !== 'enabled') return 'Enable this layer first.';
        if (hasImage && group === 'base') return 'The image base replaces the base pattern.';
        if (hasImage && group === 'color' && IMAGE_BYPASSED_COLOR_KEYS.has(field.key)) return 'The image base replaces the height ramp.';
        return false;
      }}
      onChange={(field, value) => actions.setField(group, field.key, value)}
    />
  );
}

/** Number row for the non-schema image params (reuses the kit field row). */
function ImageParamRow({ actions, image, field }) {
  return (
    <div className="tk-field">
      <span className="tk-field-label"><span className="tk-field-label-text">{field.label}</span></span>
      <Slider
        max={field.max}
        min={field.min}
        onChange={(value) => actions.setImage({ [field.key]: value })}
        step={field.step}
        value={image[field.key]}
      />
      <ScrubValue
        max={field.max}
        min={field.min}
        onChange={(value) => actions.setImage({ [field.key]: value })}
        step={field.step}
        value={image[field.key]}
      />
    </div>
  );
}

function ImageBasePanel({ actions, settings }) {
  const image = settings.image;
  async function upload() {
    const layer = await pickTextureImage().catch((error) => {
      toast(error.message, { tone: 'danger' });
      return null;
    });
    if (layer) actions.setImage(layer);
  }
  return (
    <section className="tk-section tx-image">
      <h3 className="tk-section-title">Image base</h3>
      {image ? (
        <>
          <div className="tx-image-row">
            <img alt={image.name} className="tx-image-thumb" src={image.dataUrl} />
            <div className="tx-image-meta">
              <strong>{image.name}</strong>
              <span>Base pattern replaced — details, overlays, wear &amp; glow still apply.</span>
              <div className="tx-image-actions">
                <Button kind="secondary" onClick={upload}>Replace</Button>
                <Button kind="ghost" onClick={() => actions.setImage(null)}>Remove</Button>
              </div>
            </div>
          </div>
          <div className="tk-field">
            <span className="tk-field-label"><span className="tk-field-label-text">Seamless</span></span>
            <Toggle checked={image.seamless} onChange={(next) => actions.setImage({ seamless: next })} />
            <span />
          </div>
          <ImageParamRow actions={actions} field={{ key: 'heightDetail', label: 'Relief detail', max: 1, min: 0, step: 0.01 }} image={image} />
          <ImageParamRow actions={actions} field={{ key: 'heightBase', label: 'Relief base', max: 1, min: 0, step: 0.01 }} image={image} />
          <ImageParamRow actions={actions} field={{ key: 'bands', label: 'Cel bands', max: 10, min: 0, step: 1 }} image={image} />
        </>
      ) : (
        <>
          <Button icon="download" kind="secondary" onClick={upload}>Use an image as the base…</Button>
          <p className="tx-image-hint">
            Turns a photo of <strong>one surface</strong> — a wall, bark, fabric, a crop from your
            concept art — into a seamless toon material (no AI: seam blend + relief from
            brightness). A whole scene or screenshot just becomes repeating wallpaper — crop the
            material you want first. Stays in this browser.
          </p>
        </>
      )}
    </section>
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);
  const isLocal = Boolean(state.presetId?.startsWith('local-'));
  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={280}>
      <div className="tx-doc-menu">
        <div className="tx-save-row">
          <TextField onCommit={setName} placeholder="Texture name…" value={name} />
          {isLocal && (
            <Button
              kind="primary"
              onClick={() => {
                const result = actions.updatePreset(name);
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
            const result = actions.savePresetAs(name);
            if (result.ok) onClose();
            else for (const error of result.errors ?? []) toast(error, { tone: 'danger' });
          }}
        >
          Save As…
        </Button>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.applyPreset(state.presetId); onClose(); }}>Revert to preset</Button>
        )}
        <Button kind="ghost" onClick={() => { actions.setView({ gallery: true }); onClose(); }}>Open gallery</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const openHome = () => actions.setView({ gallery: true });
  const menus = createLabEditorMenus({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onHome: openHome,
    onRedo: () => actions.redo(),
    onUndo: () => actions.undo(),
    fileItems: [{ icon: 'stage-export', label: 'Export…', onSelect: () => actions.setView({ export: true }) }],
    editItems: [{ icon: 'dice', label: 'Reseed', onSelect: () => actions.reseed() }],
  });
  return (
    <LabEditorHeader className="tx-topbar" menus={menus}>
      <BrandLockup labName="Texture Lab" onLabNameClick={openHome} />
      <button
        type="button"
        className="tx-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="tx-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="tx-topbar-spacer" />
      <span className="tx-scene-select">
        <Select
          onChange={(id) => { persistLabScene(id); navigateSceneHub(id); }}
          options={PUBLIC_SCENE_HUB_OPTIONS.map((entry) => ({ label: entry.label, value: entry.id }))}
          value="textureLab"
        />
      </span>
      <Button icon="dice" kind="secondary" onClick={() => actions.reseed()} testId="reseed">Reseed</Button>
      <Button icon="stage-export" kind="primary" onClick={() => actions.setView({ export: true })}>Export</Button>
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </LabEditorHeader>
  );
}

function StageRail({ actions, state }) {
  return (
    <nav className="tx-rail tk" data-testid="stage-rail">
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="tx-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          title={`${stage.description} (${stage.key})`}
          onClick={() => { actions.setStage(stage.id); actions.setView({ drawer: false }); }}
        >
          <Icon name={stage.icon} /><span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="tx-rail-stage tx-rail-bottom"
        data-active={state.view.drawer}
        title="All controls (`)"
        onClick={() => actions.setView({ drawer: !state.view.drawer })}
      >
        <Icon name="drawer" /><span>All</span>
      </button>
    </nav>
  );
}

function SeedRow({ actions, state }) {
  return (
    <div className="tk-field tx-seed-row">
      <span className="tk-field-label"><span className="tk-field-label-text">Seed</span></span>
      <ScrubValue max={99999} min={0} onChange={(value) => actions.setSeed(Math.round(value))} step={1} value={state.settings.global.seed} />
      <IconButton icon="dice" label="Random seed (R)" onClick={() => actions.reseed()} />
    </div>
  );
}

function Inspector({ actions, state }) {
  const stage = STAGES.find((entry) => entry.id === state.stage) ?? STAGES[0];
  const groups = state.view.drawer
    ? ['base', 'detailA', 'detailB', 'color', 'wear', 'accentA', 'accentB', 'surface', 'emissive']
    : STAGE_GROUPS[state.stage] ?? [];
  return (
    <aside className="tx-inspector tk" data-drawer={state.view.drawer} data-testid="inspector">
      <h2 className="tx-inspector-header">{state.view.drawer ? 'All controls' : stage.label}</h2>
      <p className="tx-inspector-caption">{state.view.drawer ? 'Every parameter, flat.' : stage.description}</p>
      <SeedRow actions={actions} state={state} />
      {(state.stage === 'base' || state.view.drawer) && <ImageBasePanel actions={actions} settings={state.settings} />}
      {state.stage === 'ai' && !state.view.drawer
        ? <AiPanel actions={actions} state={state} />
        : groups.map((group) => (
          <TextureSchemaGroup actions={actions} flat={state.view.drawer} group={group} key={group} settings={state.settings} />
        ))}
    </aside>
  );
}

function OptionsBar({ actions, engine, state }) {
  const view = state.view;
  const [navigationMode, setNavigationMode] = useState('rotate');
  useEffect(() => { engine.setNavigationMode(navigationMode); }, [engine, navigationMode]);
  return (
    <div className="tx-optionsbar tk">
      <SegmentedControl
        onChange={(mode) => actions.setView({ mode })}
        options={[
          { label: '3D', title: 'Lit preview mesh', value: '3d' },
          { label: '2D', title: 'Flat tiled sheet', value: '2d' },
        ]}
        value={view.mode}
      />
      <span
        className="tx-preview-style"
        title="3D preview only — changes the renderer, never the generated maps, recipe, saved preset, or export."
      >
        <span>Style</span>
        <Select
          disabled={view.mode !== '3d'}
          onChange={(style) => actions.setPreviewStyle(style)}
          options={getTexturePreviewStyleOptions()}
          testId="texture-preview-style"
          value={view.previewStyle}
        />
      </span>
      {view.mode === '3d' ? (
        <Select
          onChange={(mesh) => actions.setView({ mesh })}
          options={TEXTURE_PREVIEW_MESHES.map((spec) => ({ label: spec.label, value: spec.id }))}
          value={view.mesh}
        />
      ) : (
        <Select
          onChange={(map) => actions.setView({ map })}
          options={TEXTURE_VIEW_MAPS.map((spec) => ({ label: spec.label, value: spec.id }))}
          value={view.map}
        />
      )}
      <SegmentedControl
        onChange={(tiling) => actions.setView({ tiling: Number(tiling) })}
        options={[1, 2, 3, 4].map((t) => ({ label: String(t), title: `Repeat the tile ${t}×${t}`, value: t }))}
        value={view.tiling}
      />
      {view.mode === '3d' && (
        <label className="tx-spin">
          <Toggle checked={view.spin} onChange={(next) => actions.setView({ spin: next })} />
          <span>Spin</span>
        </label>
      )}
      <label className="tx-spin" title="Bake the live preview at 512 instead of 256">
        <Toggle checked={view.hq} onChange={(next) => actions.setView({ hq: next })} />
        <span>HQ</span>
      </label>
      {view.mode === '3d' && (
        <>
          <SegmentedControl
            onChange={setNavigationMode}
            options={[
              { label: 'Rotate', value: 'rotate' },
              { label: 'Pan', value: 'pan' },
              { label: 'Zoom', value: 'zoom' },
            ]}
            value={navigationMode}
          />
          <span className="tx-camera-hint">Left-drag rotate · wheel zoom · right-drag pan</span>
          <IconButton icon="reset" label="Reset camera" onClick={() => engine.resetCamera()} />
        </>
      )}
    </div>
  );
}

function StatusBar({ state }) {
  const gen = state.gen;
  return (
    <footer className="tx-status tk" data-testid="status-bar">
      <span className="tx-status-message">{state.status}</span>
      <span className="tx-status-spacer" />
      {gen.busy
        ? (
          <span className="tx-status-gen">
            baking… <span className="tx-progress tx-progress-inline"><span style={{ width: `${Math.round(gen.progress * 100)}%` }} /></span>
          </span>
        )
        : gen.size > 0 && <span className="tx-status-gen">{gen.size}×{gen.size} · {Math.max(1, Math.round(gen.ms))} ms · seamless</span>}
    </footer>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;

  // Keep the browser tab readable when the document changes.
  useEffect(() => { document.title = `${state.name} — Texture Lab`; }, [state.name]);

  const homeRoute = !isLabEditorLocation({ directParams: ['textureRecipe', 'importImage'] });
  useEffect(() => {
    syncLabHomeRoute(state.view.gallery, { directParams: ['textureRecipe', 'importImage'] });
  }, [state.view.gallery]);

  if (homeRoute) {
    return (
      <div className="tk">
        <toonlab-site-header active="labs" />
        <GalleryScreen actions={actions} state={state} />
        <ToastStack />
      </div>
    );
  }

  return (
    <div className="tk">
      <div className="tx-root">
        <TopBar actions={actions} state={state} />
        <StageRail actions={actions} state={state} />
        <Inspector actions={actions} state={state} />
        <StatusBar state={state} />
      </div>
      <OptionsBar actions={actions} engine={engine} state={state} />
      {state.view.export && <ExportDialog actions={actions} engine={engine} state={state} />}
      <ToastStack />
    </div>
  );
}
