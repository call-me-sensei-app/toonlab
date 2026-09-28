import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
  ColorWell,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEditorHeader,
  Modal,
  Popover,
  SegmentedControl,
  Select,
  TextField,
  ToastStack,
  Toggle,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import { SCENE_HUB_OPTIONS, navigateSceneHub } from '../../shared/sceneHub.js';
import { persistLabScene } from '../../shared/labParams.js';
import { pickFile } from '../../shared/download.js';
import {
  BUILT_IN_PROP_PRESETS,
  PROP_TYPES,
  findPropPreset,
} from '../../../src/propgen/index.js';
import { propLookSchema, propShapeSchema, propSizeSchema } from './propSchema.js';
import { downloadPropGLB, downloadPropRecipe } from '../exporters.js';

const STAGES = [
  { description: 'Pick a prop family, variant, and deterministic seed.', icon: 'stage-shape', id: 'type', key: '1', label: 'Type' },
  { description: 'Controls specific to this kind of prop.', icon: 'stage-detail', id: 'shape', key: '2', label: 'Shape' },
  { description: 'Toon palette, presets, and surface response.', icon: 'stage-look', id: 'look', key: '3', label: 'Look' },
  { description: 'LOD preview and world-placement rehearsal.', icon: 'stage-pieces', id: 'place', key: '4', label: 'Place' },
];

// Bridges a prop schema (propSchema.js) into the shared SchemaGroup:
// every field gets Tree Lab's treatment — tooltip with default hint,
// dirty-state reset dot, default tick on the track, scrub-or-type value.
function PropSchemaGroup({ actions, schema, section, values }) {
  return (
    <SchemaGroup
      fields={schema.fields}
      getValue={(field) => values[field.key]}
      group={schema.group}
      onChange={(field, value) => actions.setField(section, field.key, value)}
      showCaption
    />
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);
  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={280}>
      <div className="pl-doc-menu">
        <div className="pl-save-row">
          <TextField onCommit={setName} placeholder="Preset name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.savePresetAs(name);
              if (result.ok) onClose();
            }}
          >
            Save
          </Button>
        </div>
        {state.presetId && state.presetDirty && (
          <Button kind="secondary" onClick={() => { actions.revertPreset(); onClose(); }}>Revert to preset</Button>
        )}
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  async function importRecipeFile() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    const result = actions.importRecipe(await file.text());
    if (!result.ok) toast(result.errors[0] ?? 'Import failed.', { tone: 'danger' });
  }
  const menus = createLabEditorMenus({
    canRedo: state.canRedo,
    canUndo: state.canUndo,
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onRedo: () => actions.redo(),
    onUndo: () => actions.undo(),
    fileItems: [
      { icon: 'plus', label: 'Import Recipe…', onSelect: () => { void importRecipeFile(); } },
      { icon: 'stage-export', label: 'Export…', onSelect: () => actions.setView({ export: true }) },
    ],
    editItems: [{ icon: 'dice', label: 'Randomize', onSelect: () => actions.randomizeCurrent() }],
  });
  return (
    <LabEditorHeader className="pl-topbar" menus={menus}>
      <BrandLockup labName="Prop Lab" />
      <button
        type="button"
        className="pl-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="pl-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="pl-topbar-spacer" />
      <span className="pl-scene-select">
        <Select
          onChange={(id) => {
            if (id === 'propLab') return;
            persistLabScene(id);
            navigateSceneHub(id);
          }}
          options={[
            // Prepend a local option only while the hub doesn't know this
            // lab (it does now — kept as a guard against hub edits).
            ...(SCENE_HUB_OPTIONS.some((entry) => entry.id === 'propLab')
              ? []
              : [{ label: 'Prop Lab', value: 'propLab' }]),
            ...SCENE_HUB_OPTIONS.map((entry) => ({ label: entry.label, value: entry.id })),
          ]}
          value="propLab"
        />
      </span>
      <Button icon="dice" kind="secondary" onClick={() => actions.randomizeCurrent()} testId="randomize">Randomize</Button>
      <Button icon="plus" kind="ghost" onClick={importRecipeFile} testId="import">Import</Button>
      <Button icon="stage-export" kind="primary" onClick={() => actions.setView({ export: true })}>Export</Button>
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </LabEditorHeader>
  );
}

function StageRail({ actions, state }) {
  return (
    <nav className="pl-rail tk" data-testid="stage-rail">
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="pl-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          title={`${stage.description} (${stage.key})`}
          onClick={() => { actions.setStage(stage.id); actions.setView({ drawer: false }); }}
        >
          <Icon name={stage.icon} /><span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="pl-rail-stage pl-rail-bottom"
        data-active={state.view.drawer}
        title="All controls (`)"
        onClick={() => actions.setView({ drawer: !state.view.drawer })}
      >
        <Icon name="drawer" /><span>All</span>
      </button>
    </nav>
  );
}

function TypePanel({ actions, state }) {
  const type = state.settings.asset.type;
  const definition = PROP_TYPES[type];
  return (
    <>
      <section className="pl-section">
        <div className="pl-section-title">Prop family</div>
        <div className="pl-type-grid">
          {Object.entries(PROP_TYPES).map(([id, item]) => (
            <button key={id} type="button" data-active={id === type} onClick={() => actions.setType(id)}>
              <span>{item.icon}</span><strong>{item.label}</strong><small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="pl-section">
        <div className="pl-section-title">Variant</div>
        <div className="pl-variant-grid">
          {definition.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              data-active={state.settings.asset.variant === variant.id}
              onClick={() => actions.setVariant(variant.id)}
            >
              {variant.label}
            </button>
          ))}
        </div>
      </section>
      <section className="pl-section">
        <div className="pl-section-title">Seed</div>
        <div className="pl-section-caption">The same seed always rebuilds the exact same geometry.</div>
        <div className="pl-seed-row">
          <ScrubValue
            max={99999}
            min={0}
            onChange={(value) => actions.setSeed(value)}
            step={1}
            value={state.settings.asset.seed}
          />
          <Button icon="dice" kind="secondary" onClick={() => actions.setSeed(Math.floor(Math.random() * 100000))}>New seed</Button>
        </div>
      </section>
    </>
  );
}

function ShapePanel({ actions, state }) {
  const type = state.settings.asset.type;
  return (
    <div className="tk">
      <PropSchemaGroup
        actions={actions}
        schema={propShapeSchema(type)}
        section="shape"
        values={state.settings.shape}
      />
      <PropSchemaGroup
        actions={actions}
        schema={propSizeSchema()}
        section="asset"
        values={state.settings.asset}
      />
    </div>
  );
}

function LookPanel({ actions, state }) {
  const type = state.settings.asset.type;
  const colors = [
    ['Primary', 'primaryColor'], ['Secondary', 'secondaryColor'], ['Accent', 'accentColor'],
  ];
  const matchingPresets = BUILT_IN_PROP_PRESETS.filter(
    (preset) => preset.recipe.settings.asset.type === type,
  );
  return (
    <>
      <section className="pl-section">
        <div className="pl-section-title">Stylized palette</div>
        <div className="pl-section-caption">Vertex-painted tones the environment shader bands and shadows.</div>
        <div className="pl-color-grid">
          {colors.map(([label, key]) => (
            <label key={key}><ColorWell size="large" value={state.settings.surface[key]} onChange={(value) => actions.setSurfaceColor(key, value)} /><span>{label}</span></label>
          ))}
        </div>
      </section>
      <div className="tk">
        <PropSchemaGroup
          actions={actions}
          schema={propLookSchema()}
          section="surface"
          values={state.settings.surface}
        />
      </div>
      {matchingPresets.length > 0 && (
        <section className="pl-section">
          <div className="pl-section-title">Presets</div>
          <div className="pl-section-caption">Built-in recipes tuned for {PROP_TYPES[type].label.toLowerCase()}.</div>
          <div className="pl-preset-list">
            {matchingPresets.map((preset) => (
              <button key={preset.id} type="button" data-active={state.presetId === preset.id} onClick={() => actions.applyPreset(preset.id)}>
                <strong>{preset.label}</strong><span>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="pl-shader-note"><Icon name="check" /><span><strong>ToonLab shader active</strong> · stylized sun bands, ambient gradient, and native shadows.</span></div>
    </>
  );
}

function PlacePanel({ actions, state }) {
  const type = state.settings.asset.type;
  const linear = Boolean(PROP_TYPES[type].linear);
  return (
    <>
      <section className="pl-section">
        <div className="pl-section-title">LOD preview</div>
        <div className="pl-section-caption">World placement swaps to the lo mesh at distance — check both silhouettes here.</div>
        <SegmentedControl
          onChange={(value) => actions.setLodPreview(value)}
          options={[
            { label: 'Hi', value: 'hi' },
            { label: 'Lo', value: 'lo' },
            { label: 'Side by side', value: 'both' },
          ]}
          testId="lod-preview"
          value={state.view.lodPreview}
        />
      </section>
      <section className="pl-section">
        <div className="pl-section-title">Scatter rehearsal</div>
        <div className="pl-section-caption">scatterProps drops ~24 seeded copies across the terrain swell — grounding, spacing, and LOD behave exactly like world placement.</div>
        <label className="pl-place-toggle">
          <Toggle checked={state.view.scatter} onChange={(value) => actions.setScatter(value)} testId="scatter-toggle" />
          <span>Scatter across the ground</span>
        </label>
      </section>
      {linear && (
        <div className="pl-linear-note">
          <Icon name="info" />
          <span><strong>Linear prop</strong> · the run preview builds along a gentle sloped S-curve, so posts and courses follow the terrain exactly like placeAlongSpline in game.</span>
        </div>
      )}
    </>
  );
}

function Inspector({ actions, state }) {
  const stage = STAGES.find((entry) => entry.id === state.stage) ?? STAGES[0];
  return (
    <aside className="pl-inspector tk" data-drawer={state.view.drawer || undefined}>
      <div className="pl-inspector-header">{state.view.drawer ? 'All controls' : stage.label}</div>
      <div className="pl-inspector-caption">{state.view.drawer ? 'Every relevant setting for the active prop family.' : stage.description}</div>
      {(state.view.drawer || stage.id === 'type') && <TypePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'shape') && <ShapePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'look') && <LookPanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'place') && <PlacePanel actions={actions} state={state} />}
    </aside>
  );
}

function StatusBar({ actions, engine, state }) {
  const [, setTick] = useState(0);
  useEffect(() => engine.onRebuilt(() => setTick((tick) => tick + 1)), [engine]);
  const vertices = Number(document.body.dataset.propVertexCount || 0).toLocaleString();
  const triangles = Number(document.body.dataset.propTriangleCount || 0).toLocaleString();
  const currentPreset = state.presetId ? findPropPreset(state.presetId) : null;
  return (
    <footer className="pl-status tk">
      <span className="pl-status-message">{state.status || (currentPreset ? currentPreset.description : 'Procedural prop ready.')}</span>
      <span className="pl-status-stats">seed {state.settings.asset.seed} · {vertices} verts · {triangles} tris</span>
      <span className="pl-view-buttons">
        <button type="button" onClick={() => engine.frameComposition('hero')}>Hero</button>
        <button type="button" onClick={() => engine.frameComposition('front')}>Front</button>
        <button type="button" onClick={() => engine.frameComposition('top')}>Top</button>
      </span>
    </footer>
  );
}

function ExportDialog({ actions, onClose, state }) {
  const [message, setMessage] = useState('Recipes are editable; GLB files contain generated geometry and vertex colors.');
  async function exportGlb() {
    actions.setExporting(true);
    setMessage('Building GLB…');
    try {
      const bytes = await downloadPropGLB(state.settings, state.name);
      setMessage(`Exported ${(bytes / 1024).toFixed(0)} KB GLB.`);
      actions.setStatus('GLB export complete.');
    } catch (error) {
      setMessage(`Export failed: ${error.message}`);
    } finally {
      actions.setExporting(false);
    }
  }
  return (
    <Modal onClose={onClose} title="Export prop" width={520}>
      <div className="pl-export-summary">
        <span>{PROP_TYPES[state.settings.asset.type].icon}</span>
        <div><strong>{state.name}</strong><small>{PROP_TYPES[state.settings.asset.type].label} · {state.settings.asset.variant} · seed {state.settings.asset.seed}</small></div>
      </div>
      <p className="pl-export-message">{message}</p>
      <div className="pl-export-options">
        <button type="button" onClick={() => downloadPropRecipe(state.settings, state.name)}>
          <Icon name="download" /><strong>Recipe JSON</strong><span>Small, deterministic, and fully editable.</span>
        </button>
        <button type="button" disabled={state.exporting} onClick={exportGlb}>
          <Icon name="stage-export" /><strong>{state.exporting ? 'Building…' : 'Game-ready GLB'}</strong><span>Geometry, normals, vertex color, and materials.</span>
        </button>
      </div>
      <div className="pl-dialog-actions"><Button kind="primary" onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  return (
    <div className="tk">
      <div className="pl-root">
        <TopBar actions={actions} state={state} />
        <StageRail actions={actions} state={state} />
        <Inspector actions={actions} state={state} />
        <StatusBar actions={actions} engine={engine} state={state} />
      </div>
      {state.view.export && <ExportDialog actions={actions} onClose={() => actions.setView({ export: false })} state={state} />}
      <ToastStack />
    </div>
  );
}
