import { useEffect, useState } from 'react';

import {
  BrandLockup,
  Button,
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
  BUILDING_TYPES,
  BUILT_IN_BUILDING_PRESETS,
  findBuildingPreset,
} from '../../../src/buildinggen/index.js';
import { buildingGroupSchema } from './buildingSchema.js';
import { downloadBuildingGLB, downloadBuildingRecipe } from '../exporters.js';

const STAGES = [
  { description: 'Pick a building type, deterministic seed, and starting preset.', icon: 'home', id: 'type', key: '1', label: 'Type' },
  { description: 'Ground plan and massing: plan shape, floors, inset, lean.', icon: 'stage-shape', id: 'shape', key: '2', label: 'Shape' },
  { description: 'Roof form: pitch, overhang, curvature, ridge decoration.', icon: 'stage-detail', id: 'roof', key: '3', label: 'Roof' },
  { description: 'Timber framing, window rhythm, and the door.', icon: 'stage-pieces', id: 'facade', key: '4', label: 'Facade' },
  { description: 'Material role palette the toon shader bands.', icon: 'stage-look', id: 'look', key: '5', label: 'Look' },
  { description: 'LOD preview and the slope-test rehearsal.', icon: 'tool-move', id: 'place', key: '6', label: 'Place' },
];

// Bridges a building schema group (buildingSchema.js) into the shared
// SchemaGroup: every field gets Tree Lab's treatment — tooltip with default
// hint, dirty-state reset dot, default tick on the track, scrub-or-type
// value — plus native selects and color wells for kind/palette fields.
function BuildingSchemaGroup({ actions, isDisabled, schema, values }) {
  return (
    <SchemaGroup
      fields={schema.fields}
      getValue={(field) => values[field.key]}
      group={schema.group}
      isDisabled={isDisabled ?? (() => false)}
      onChange={(field, value) => actions.setField(schema.group.id, field.key, value)}
      showCaption
    />
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.name);
  return (
    <Popover anchor={anchor} onClose={onClose} title="Document" width={280}>
      <div className="bl-doc-menu">
        <div className="bl-save-row">
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
    <LabEditorHeader className="bl-topbar" menus={menus}>
      <BrandLockup labName="Building Lab" />
      <button
        type="button"
        className="bl-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="bl-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="bl-topbar-spacer" />
      <span className="bl-scene-select">
        <Select
          onChange={(id) => {
            if (id === 'buildingLab') return;
            persistLabScene(id);
            navigateSceneHub(id);
          }}
          options={[
            // The hub already lists Building Lab once INTEGRATION.md step 2
            // is applied — only prepend the local option until then.
            ...(SCENE_HUB_OPTIONS.some((entry) => entry.id === 'buildingLab')
              ? []
              : [{ label: 'Building Lab', value: 'buildingLab' }]),
            ...SCENE_HUB_OPTIONS.map((entry) => ({ label: entry.label, value: entry.id })),
          ]}
          value="buildingLab"
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
    <nav className="bl-rail tk" data-testid="stage-rail">
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="bl-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          title={`${stage.description} (${stage.key})`}
          onClick={() => { actions.setStage(stage.id); actions.setView({ drawer: false }); }}
        >
          <Icon name={stage.icon} /><span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="bl-rail-stage bl-rail-bottom"
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
  const type = state.settings.type;
  const matchingPresets = BUILT_IN_BUILDING_PRESETS.filter(
    (preset) => preset.recipe.type === type,
  );
  return (
    <>
      <section className="bl-section">
        <div className="bl-section-title">Building type</div>
        <div className="bl-type-grid">
          {Object.entries(BUILDING_TYPES).map(([id, item]) => (
            <button key={id} type="button" data-active={id === type} onClick={() => actions.setType(id)}>
              <span>{item.icon}</span><strong>{item.label}</strong><small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="bl-section">
        <div className="bl-section-title">Seed</div>
        <div className="bl-section-caption">The same seed always rebuilds the exact same building — window rhythm, chimney, and all.</div>
        <div className="bl-seed-row">
          <ScrubValue
            max={99999}
            min={0}
            onChange={(value) => actions.setSeed(value)}
            step={1}
            value={state.settings.seed}
          />
          <Button icon="dice" kind="secondary" onClick={() => actions.setSeed(Math.floor(Math.random() * 100000))}>New seed</Button>
        </div>
      </section>
      {matchingPresets.length > 0 && (
        <section className="bl-section">
          <div className="bl-section-title">Presets</div>
          <div className="bl-section-caption">Built-in recipes tuned for {BUILDING_TYPES[type].label.toLowerCase()}s.</div>
          <div className="bl-preset-list">
            {matchingPresets.map((preset) => (
              <button key={preset.id} type="button" data-active={state.presetId === preset.id} onClick={() => actions.applyPreset(preset.id)}>
                <strong>{preset.label}</strong><span>{preset.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ShapePanel({ actions, state }) {
  const type = state.settings.type;
  const rectPlan = state.settings.footprint.kind === 'rect';
  return (
    <div className="tk">
      <BuildingSchemaGroup
        actions={actions}
        isDisabled={(field) => (field.key === 'wingRatio' && rectPlan
          ? 'Wing size applies to L- and T-shaped plans.'
          : false)}
        schema={buildingGroupSchema('footprint', type)}
        values={state.settings.footprint}
      />
      <BuildingSchemaGroup
        actions={actions}
        schema={buildingGroupSchema('massing', type)}
        values={state.settings.massing}
      />
    </div>
  );
}

function RoofPanel({ actions, state }) {
  return (
    <div className="tk">
      <BuildingSchemaGroup
        actions={actions}
        schema={buildingGroupSchema('roof', state.settings.type)}
        values={state.settings.roof}
      />
    </div>
  );
}

function FacadePanel({ actions, state }) {
  return (
    <div className="tk">
      <BuildingSchemaGroup
        actions={actions}
        schema={buildingGroupSchema('facade', state.settings.type)}
        values={state.settings.facade}
      />
    </div>
  );
}

function LookPanel({ actions, state }) {
  return (
    <>
      <div className="tk">
        <BuildingSchemaGroup
          actions={actions}
          schema={buildingGroupSchema('palette', state.settings.type)}
          values={state.settings.palette}
        />
      </div>
      <div className="bl-shader-note"><Icon name="check" /><span><strong>ToonLab shader active</strong> · stylized sun bands, ambient gradient, and native shadows.</span></div>
    </>
  );
}

function PlacePanel({ actions, state }) {
  return (
    <>
      <section className="bl-section">
        <div className="bl-section-title">LOD preview</div>
        <div className="bl-section-caption">World placement swaps to the lo mesh at distance — check both silhouettes here.</div>
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
      <section className="bl-section">
        <div className="bl-section-title">Slope test</div>
        <div className="bl-section-caption">Drops the building onto a ~16° hillside — the buried foundation skirt must keep every corner grounded, exactly like world placement on terrain.</div>
        <label className="bl-place-toggle">
          <Toggle checked={state.view.slopeTest} onChange={(value) => actions.setSlopeTest(value)} testId="slope-test" />
          <span>Drop onto the test slope</span>
        </label>
      </section>
    </>
  );
}

function Inspector({ actions, state }) {
  const stage = STAGES.find((entry) => entry.id === state.stage) ?? STAGES[0];
  return (
    <aside className="bl-inspector tk" data-drawer={state.view.drawer || undefined}>
      <div className="bl-inspector-header">{state.view.drawer ? 'All controls' : stage.label}</div>
      <div className="bl-inspector-caption">{state.view.drawer ? 'Every setting for the active building type.' : stage.description}</div>
      {(state.view.drawer || stage.id === 'type') && <TypePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'shape') && <ShapePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'roof') && <RoofPanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'facade') && <FacadePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'look') && <LookPanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'place') && <PlacePanel actions={actions} state={state} />}
    </aside>
  );
}

function StatusBar({ actions, engine, state }) {
  const [, setTick] = useState(0);
  useEffect(() => engine.onRebuilt(() => setTick((tick) => tick + 1)), [engine]);
  const vertices = Number(document.body.dataset.buildingVertexCount || 0).toLocaleString();
  const triangles = Number(document.body.dataset.buildingTriangleCount || 0).toLocaleString();
  const currentPreset = state.presetId ? findBuildingPreset(state.presetId) : null;
  return (
    <footer className="bl-status tk">
      <span className="bl-status-message">{state.status || (currentPreset ? currentPreset.description : 'Procedural building ready.')}</span>
      <span className="bl-status-stats">seed {state.settings.seed} · {vertices} verts · {triangles} tris</span>
      <span className="bl-view-buttons">
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
      const bytes = await downloadBuildingGLB(state.settings, state.name);
      setMessage(`Exported ${(bytes / 1024).toFixed(0)} KB GLB.`);
      actions.setStatus('GLB export complete.');
    } catch (error) {
      setMessage(`Export failed: ${error.message}`);
    } finally {
      actions.setExporting(false);
    }
  }
  return (
    <Modal onClose={onClose} title="Export building" width={520}>
      <div className="bl-export-summary">
        <span>{BUILDING_TYPES[state.settings.type].icon}</span>
        <div><strong>{state.name}</strong><small>{BUILDING_TYPES[state.settings.type].label} · seed {state.settings.seed}</small></div>
      </div>
      <p className="bl-export-message">{message}</p>
      <div className="bl-export-options">
        <button type="button" onClick={() => downloadBuildingRecipe(state.settings, state.name)}>
          <Icon name="download" /><strong>Recipe JSON</strong><span>Small, deterministic, and fully editable.</span>
        </button>
        <button type="button" disabled={state.exporting} onClick={exportGlb}>
          <Icon name="stage-export" /><strong>{state.exporting ? 'Building…' : 'Game-ready GLB'}</strong><span>Geometry, normals, vertex color, and materials.</span>
        </button>
      </div>
      <div className="bl-dialog-actions"><Button kind="primary" onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  return (
    <div className="tk">
      <div className="bl-root">
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
