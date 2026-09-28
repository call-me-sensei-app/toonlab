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
  RendererToggle,
  SegmentedControl,
  Select,
  Slider,
  TextField,
  ToastStack,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { isLabEditorLocation, syncLabHomeRoute } from '../../shared/labViewRouting.js';
import '../../shared/siteHeader.js';
import { SchemaGroup } from '../../shared/ui/schema/SchemaGroup.jsx';
import {
  BUILT_IN_DEBRIS_PRESETS,
  DEBRIS_ARRANGEMENTS,
  DEBRIS_TEXTURE_STYLES,
  DEBRIS_TYPES,
  debrisTextureAuto,
  findDebrisPreset,
  getDebrisStyleOptions,
} from '../../../src/debrisgen/index.js';
import { DEBRIS_PALETTES, matchDebrisPalette } from '../../../src/debrisgen/debrisPalettes.js';
import { debrisLookSchema, debrisScatterSchema, debrisShapeSchema } from './debrisSchema.js';
import { downloadDebrisGLB, downloadDebrisRecipe } from '../exporters.js';
import { GalleryScreen } from './GalleryScreen.jsx';

const STAGES = [
  { description: 'Choose a debris family, variant, or starting preset.', icon: 'stage-shape', id: 'type', key: '1', label: 'Type' },
  { description: 'Controls specific to this kind of debris.', icon: 'stage-detail', id: 'shape', key: '2', label: 'Shape' },
  { description: 'Piece count, scale, arrangement, and deterministic seed.', icon: 'stage-pieces', id: 'scatter', key: '3', label: 'Scatter' },
  { description: 'Toon palette, variation, and surface response.', icon: 'stage-look', id: 'look', key: '4', label: 'Look' },
];

// Bridges a debris schema (debrisSchema.js) into the shared SchemaGroup:
// every field gets Tree Lab's treatment — tooltip with default hint,
// dirty-state reset dot, default tick on the track, scrub-or-type value.
function DebrisSchemaGroup({ actions, schema, section, values }) {
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
      <div className="db-doc-menu">
        <div className="db-save-row">
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
        <Button kind="ghost" onClick={() => { actions.setView({ gallery: true }); onClose(); }}>Open gallery</Button>
        <Button kind="danger" onClick={() => { actions.resetLab(); onClose(); }}>Reset lab</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const openHome = () => actions.setView({ gallery: true });
  async function share() {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      debrisRecipe: JSON.stringify(actions.getRecipeDocument()),
      debrisStyle: state.styleId,
    }).toString();
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      actions.setStatus('Share link copied to the clipboard.');
    } catch {
      actions.setStatus('Share link written to the address bar.');
    }
  }
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
    editItems: [{ icon: 'dice', label: 'Randomize', onSelect: () => actions.randomizeCurrent() }],
  });
  return (
    <LabEditorHeader className="db-topbar" menus={menus}>
      <BrandLockup labName="Debris Lab" onLabNameClick={openHome} />
      <button
        type="button"
        className="db-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.name}{state.presetDirty && <span className="db-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="db-style-select">
        <span>Style</span>
        <Select
          onChange={(id) => actions.setStyle(id)}
          options={getDebrisStyleOptions().map((entry) => ({ label: entry.label, value: entry.id }))}
          testId="debris-style"
          value={state.styleId}
        />
      </span>
      <span className="db-topbar-spacer" />
      <RendererToggle />
      <Button icon="dice" kind="secondary" onClick={() => actions.randomizeCurrent()} testId="randomize">Randomize</Button>
      <Button icon="link" kind="ghost" onClick={share}>Share</Button>
      <Button icon="stage-export" kind="primary" onClick={() => actions.setView({ export: true })}>Export</Button>
      {menuAnchor && <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />}
    </LabEditorHeader>
  );
}

function StageRail({ actions, state }) {
  return (
    <nav className="db-rail tk" data-testid="stage-rail">
      {STAGES.map((stage) => (
        <button
          key={stage.id}
          type="button"
          className="db-rail-stage"
          data-active={!state.view.drawer && state.stage === stage.id}
          title={`${stage.description} (${stage.key})`}
          onClick={() => { actions.setStage(stage.id); actions.setView({ drawer: false }); }}
        >
          <Icon name={stage.icon} /><span>{stage.label}</span>
        </button>
      ))}
      <button
        type="button"
        className="db-rail-stage db-rail-bottom"
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
  const definition = DEBRIS_TYPES[type];
  const matchingPresets = BUILT_IN_DEBRIS_PRESETS.filter((preset) => preset.type === type);
  return (
    <>
      <section className="db-section">
        <div className="db-section-title">Debris family</div>
        <div className="db-type-grid">
          {Object.entries(DEBRIS_TYPES).map(([id, item]) => (
            <button key={id} type="button" data-active={id === type} onClick={() => actions.setType(id)}>
              <span>{item.icon}</span><strong>{item.label}</strong><small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="db-section">
        <div className="db-section-title">Variant</div>
        <div className="db-variant-grid">
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
      <section className="db-section">
        <div className="db-section-head">
          <div><div className="db-section-title">Quick presets</div><div className="db-section-caption">Presets tuned for {definition.label.toLowerCase()}.</div></div>
          <Button kind="ghost" onClick={() => actions.setView({ gallery: true })}>{`All ${BUILT_IN_DEBRIS_PRESETS.length} →`}</Button>
        </div>
        <div className="db-preset-list">
          {matchingPresets.map((preset) => (
            <button key={preset.id} type="button" data-active={state.presetId === preset.id} onClick={() => actions.applyPreset(preset.id)}>
              <strong>{preset.label}</strong><span>{preset.description}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function ShapePanel({ actions, state }) {
  const type = state.settings.asset.type;
  return (
    <div className="tk">
      <DebrisSchemaGroup
        actions={actions}
        schema={debrisShapeSchema(type)}
        section="shape"
        values={state.settings.shape}
      />
    </div>
  );
}

function ScatterPanel({ actions, state }) {
  const type = state.settings.asset.type;
  const arrangement = DEBRIS_ARRANGEMENTS.find(
    (entry) => entry.id === state.settings.asset.arrangement,
  ) ?? DEBRIS_ARRANGEMENTS[0];
  return (
    <>
      <section className="db-section">
        <div className="db-section-title">Arrangement</div>
        <SegmentedControl
          onChange={(id) => actions.setArrangement(id)}
          options={DEBRIS_ARRANGEMENTS.map((entry) => ({ label: entry.label, value: entry.id }))}
          value={arrangement.id}
        />
        <div className="db-section-caption">{arrangement.caption}.</div>
      </section>
      <div className="tk">
        <DebrisSchemaGroup
          actions={actions}
          schema={debrisScatterSchema(type)}
          section="asset"
          values={state.settings.asset}
        />
      </div>
      <section className="db-section">
        <div className="db-section-title">Seed</div>
        <div className="db-section-caption">The same seed always rebuilds the exact same geometry and placement.</div>
        <div className="db-seed-row">
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

const MAX_TEXTURE_UPLOAD_BYTES = 1.5 * 1024 * 1024;

// Texture block: procedural style per material, tiling scale (in the Look
// sliders), and a user-uploaded image that overrides the procedural map.
// Uploads persist inside the recipe document so shares/exports carry them.
function TextureSection({ actions, state }) {
  const { type, variant } = state.settings.asset;
  const { customTexture, textureStyle } = state.settings.surface;
  const auto = debrisTextureAuto(type, variant);
  const styles = DEBRIS_TEXTURE_STYLES[auto.kind] ?? [];
  const autoLabel = styles.find((entry) => entry.id === auto.style)?.label ?? 'Procedural';
  const options = [
    { label: `Auto (${autoLabel})`, value: 'auto' },
    ...styles.map((entry) => ({ label: entry.label, value: entry.id })),
  ];
  function onUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_TEXTURE_UPLOAD_BYTES) {
      actions.setStatus('Texture upload is limited to 1.5 MB — try a smaller image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => actions.setCustomTexture({ dataUrl: String(reader.result), name: file.name });
    reader.readAsDataURL(file);
  }
  return (
    <section className="db-section">
      <div className="db-section-title">Texture</div>
      <div className="db-section-caption">Procedural detail maps multiply the palette; an uploaded image replaces them.</div>
      {!customTexture && styles.length > 1 && (
        <Select
          onChange={(value) => actions.setTextureStyle(value)}
          options={options}
          value={textureStyle}
        />
      )}
      <div className="db-texture-row">
        {customTexture ? (
          <>
            <img alt="" className="db-texture-chip" src={customTexture.dataUrl} />
            <span className="db-texture-name">{customTexture.name}</span>
            <IconButton icon="close" label="Remove custom texture" onClick={() => actions.setCustomTexture(null)} />
          </>
        ) : (
          <>
            <input
              accept="image/*"
              hidden
              id="db-texture-upload-input"
              type="file"
              onChange={onUpload}
            />
            <Button
              icon="stage-look"
              kind="secondary"
              onClick={() => document.getElementById('db-texture-upload-input')?.click()}
            >
              Upload texture…
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

// One-click palette combinations per material family, Tree Lab style:
// swatch-strip cards, active when the current colors match.
function PaletteCards({ actions, state }) {
  const type = state.settings.asset.type;
  const palettes = DEBRIS_PALETTES[type] ?? [];
  if (palettes.length === 0) return null;
  const active = matchDebrisPalette(type, state.settings.surface);
  return (
    <div className="db-palette-grid">
      {palettes.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-active={active?.id === entry.id}
          onClick={() => actions.applyPalette(entry)}
        >
          <span className="db-palette-swatches">
            {['primaryColor', 'secondaryColor', 'accentColor'].map((key) => (
              <span
                key={key}
                style={{
                  background: `rgb(${entry[key].map((channel) => Math.round(Math.sqrt(channel) * 255)).join(',')})`,
                }}
              />
            ))}
          </span>
          <span className="db-palette-label">{entry.label}</span>
        </button>
      ))}
    </div>
  );
}

function LookPanel({ actions, state }) {
  const colors = [
    ['Primary', 'primaryColor'], ['Secondary', 'secondaryColor'], ['Accent', 'accentColor'],
  ];
  return (
    <>
      <section className="db-section">
        <div className="db-section-title">Stylized palette</div>
        <div className="db-section-caption">One-click combinations tuned for this material, or fine-tune each tone below.</div>
        <PaletteCards actions={actions} state={state} />
        <div className="db-color-grid">
          {colors.map(([label, key]) => (
            <label key={key}><ColorWell size="large" value={state.settings.surface[key]} onChange={(value) => actions.setSurfaceColor(key, value)} /><span>{label}</span></label>
          ))}
        </div>
      </section>
      <TextureSection actions={actions} state={state} />
      <div className="tk">
        <DebrisSchemaGroup
          actions={actions}
          schema={debrisLookSchema()}
          section="surface"
          values={state.settings.surface}
        />
      </div>
      <div className="db-shader-note"><Icon name="check" /><span><strong>ToonLab shader active</strong> · stylized sun bands, ambient gradient, and native shadows.</span></div>
    </>
  );
}

function Inspector({ actions, state }) {
  const stage = STAGES.find((entry) => entry.id === state.stage) ?? STAGES[0];
  return (
    <aside className="db-inspector tk" data-drawer={state.view.drawer || undefined}>
      <div className="db-inspector-header">{state.view.drawer ? 'All controls' : stage.label}</div>
      <div className="db-inspector-caption">{state.view.drawer ? 'Every relevant setting for the active debris family.' : stage.description}</div>
      {(state.view.drawer || stage.id === 'type') && <TypePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'shape') && <ShapePanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'scatter') && <ScatterPanel actions={actions} state={state} />}
      {(state.view.drawer || stage.id === 'look') && <LookPanel actions={actions} state={state} />}
    </aside>
  );
}

function StatusBar({ actions, engine, state }) {
  const [, setTick] = useState(0);
  useEffect(() => engine.onRebuilt(() => setTick((tick) => tick + 1)), [engine]);
  const vertices = Number(document.body.dataset.debrisVertexCount || 0).toLocaleString();
  const triangles = Number(document.body.dataset.debrisTriangleCount || 0).toLocaleString();
  const currentPreset = state.presetId ? findDebrisPreset(state.presetId) : null;
  return (
    <footer className="db-status tk">
      <span className="db-status-message">{state.status || (currentPreset ? currentPreset.description : 'Procedural debris ready.')}</span>
      <span className="db-status-stats">seed {state.settings.asset.seed} · {vertices} verts · {triangles} tris</span>
      <span className="db-view-buttons">
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
      const bytes = await downloadDebrisGLB(state.settings, state.name);
      setMessage(`Exported ${(bytes / 1024).toFixed(0)} KB GLB.`);
      actions.setStatus('GLB export complete.');
    } catch (error) {
      setMessage(`Export failed: ${error.message}`);
    } finally {
      actions.setExporting(false);
    }
  }
  return (
    <Modal onClose={onClose} title="Export debris" width={520}>
      <div className="db-export-summary">
        <span>{DEBRIS_TYPES[state.settings.asset.type].icon}</span>
        <div><strong>{state.name}</strong><small>{DEBRIS_TYPES[state.settings.asset.type].label} · {state.settings.asset.variant} · seed {state.settings.asset.seed}</small></div>
      </div>
      <p className="db-export-message">{message}</p>
      <div className="db-export-options">
        <button type="button" onClick={() => downloadDebrisRecipe(state.settings, state.name)}>
          <Icon name="download" /><strong>Recipe JSON</strong><span>Small, deterministic, and fully editable.</span>
        </button>
        <button type="button" disabled={state.exporting} onClick={exportGlb}>
          <Icon name="stage-export" /><strong>{state.exporting ? 'Building…' : 'Game-ready GLB'}</strong><span>Geometry, normals, vertex color, and materials.</span>
        </button>
      </div>
      <div className="db-dialog-actions"><Button kind="primary" onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

export function App({ engine, store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const directParams = ['debrisRecipe', 'recipe', 'debrisPreset', 'debrisStyle'];
  const homeRoute = !isLabEditorLocation({ directParams });
  useEffect(() => {
    syncLabHomeRoute(state.view.gallery, { directParams });
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
      <div className="db-root">
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
