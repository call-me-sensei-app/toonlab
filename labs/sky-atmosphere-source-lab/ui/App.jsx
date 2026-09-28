import { useEffect, useRef, useState } from 'react';

import {
  Badge,
  BrandLockup,
  Button,
  ColorWell,
  createLabEditorMenus,
  Icon,
  IconButton,
  LabEditorHeader,
  Popover,
  PreviewBar,
  PreviewToggle,
  Select,
  Slider,
  TextField,
  ToastStack,
  toast,
  useStoreState,
} from '../../shared/ui/index.js';
import { ScrubValue } from '../../shared/ui/components/Slider.jsx';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { SOURCE_OUTPUT_SPECS, sourceResultPngBlob } from '../sourceGenerator.js';

const CHANNEL_OPTIONS = Object.freeze([
  { label: 'RGBA', value: 'rgba' },
  { label: 'Red', value: 'r' },
  { label: 'Green', value: 'g' },
  { label: 'Blue', value: 'b' },
  { label: 'Alpha', value: 'a' },
]);

function sourceFilename(label, output, extension) {
  const safe = String(label ?? 'sky-source').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'sky-source'}-${output}.${extension}`;
}

function channelPixels(result, channel) {
  if (channel === 'rgba') return result.data;
  const sourceChannel = { r: 0, g: 1, b: 2, a: 3 }[channel] ?? 0;
  const output = new Uint8ClampedArray(result.data.length);
  for (let index = 0; index < result.data.length; index += 4) {
    const value = result.data[index + sourceChannel];
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return output;
}

function SourceCanvas({ channel, checker, result }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !result) return;
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext('2d');
    context.putImageData(
      new ImageData(channelPixels(result, channel), result.width, result.height),
      0,
      0,
    );
  }, [channel, result]);
  return (
    <div className="sas-canvas-shell" data-checker={checker || undefined}>
      {result
        ? <canvas ref={ref} aria-label={`${result.label} generated source`} />
        : <div className="sas-empty"><Icon name="stage-export" /><span>Bake a source to preview it.</span></div>}
    </div>
  );
}

function NumberField({ label, max, min, onChange, step, value }) {
  return (
    <div className="tk-field">
      <span className="tk-field-label"><span className="tk-field-label-text">{label}</span></span>
      <Slider max={max} min={min} onChange={onChange} step={step} value={value} />
      <ScrubValue max={max} min={min} onChange={onChange} step={step} value={value} />
    </div>
  );
}

function DocumentMenu({ actions, anchor, onClose, state }) {
  const [name, setName] = useState(state.document.label);

  async function importJson() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    const result = actions.importDocument(await file.text());
    if (!result.ok) {
      for (const error of result.errors) toast(error, { tone: 'danger' });
      return;
    }
    toast(`Imported “${result.value.label}”.`, { tone: 'success' });
    onClose();
  }

  const savedOptions = [
    { label: 'Open a saved source…', value: '' },
    ...state.savedDocuments.map((entry) => ({ label: entry.label, value: entry.id })),
  ];

  return (
    <Popover anchor={anchor} onClose={onClose} title="Source document" width={310}>
      <div className="sas-doc-menu">
        <div className="sas-save-row">
          <TextField onCommit={setName} placeholder="Source recipe name…" value={name} />
          <Button
            kind="primary"
            onClick={() => {
              const result = actions.saveAs(name);
              if (result.ok) {
                toast(`Saved “${result.value.label}” locally.`, { tone: 'success' });
                onClose();
              } else {
                for (const error of result.errors) toast(error, { tone: 'danger' });
              }
            }}
          >
            Save
          </Button>
        </div>
        <div className="sas-library-row">
          <Select
            onChange={(id) => {
              if (id && actions.loadSaved(id)) onClose();
            }}
            options={savedOptions}
            value=""
          />
          <IconButton
            disabled={!state.selectedSavedId}
            icon="trash"
            label="Delete open saved source"
            onClick={() => actions.deleteSaved(state.selectedSavedId)}
          />
        </div>
        <Button
          kind="secondary"
          onClick={() => {
            downloadBlob(
              actions.exportDocument(),
              sourceFilename(state.document.label, 'recipe', 'json'),
              'application/json',
            );
            onClose();
          }}
        >
          Export recipe JSON
        </Button>
        <Button kind="secondary" onClick={importJson}>Import recipe JSON…</Button>
        <Button kind="danger" onClick={() => { actions.reset(); onClose(); }}>New default recipe</Button>
      </div>
    </Popover>
  );
}

function TopBar({ actions, sourceDirty, state }) {
  const [menuAnchor, setMenuAnchor] = useState(null);

  async function exportPng() {
    if (!state.result || sourceDirty) {
      toast('Bake the current recipe before exporting its PNG.', { tone: 'warning' });
      return;
    }
    try {
      const blob = await sourceResultPngBlob(state.result);
      downloadBlob(
        blob,
        sourceFilename(state.document.label, state.result.id, 'png'),
        'image/png',
      );
      toast('Source PNG exported.', { tone: 'success' });
    } catch (error) {
      toast(error.message, { tone: 'danger' });
    }
  }
  const menus = createLabEditorMenus({
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    fileItems: [
      { disabled: state.bakeStatus === 'baking', icon: 'stage-export', label: 'Bake Source', onSelect: () => actions.bake() },
      { disabled: !state.result || sourceDirty, icon: 'download', label: 'Export PNG', onSelect: () => { void exportPng(); } },
    ],
  });

  return (
    <LabEditorHeader className="sas-topbar" menus={menus}>
      <BrandLockup labName="Atmosphere Source Lab" />
      <button
        type="button"
        className="sas-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {state.document.label}{sourceDirty && <span className="sas-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      <span className="sas-topbar-spacer" />
      <Badge tone="neutral">First-party procedural</Badge>
      <Button
        disabled={state.bakeStatus === 'baking'}
        icon="stage-export"
        kind="primary"
        onClick={() => actions.bake()}
        testId="bake-source"
      >
        {state.bakeStatus === 'baking' ? 'Baking…' : 'Bake source'}
      </Button>
      <Button disabled={!state.result || sourceDirty} icon="download" kind="secondary" onClick={exportPng}>
        Export PNG
      </Button>
      {menuAnchor && (
        <DocumentMenu actions={actions} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} state={state} />
      )}
    </LabEditorHeader>
  );
}

function SourceRail({ actions, output }) {
  return (
    <nav className="sas-rail tk" data-testid="source-rail">
      {SOURCE_OUTPUT_SPECS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className="sas-rail-stage"
          data-active={output === entry.id}
          title={`${entry.label} — ${entry.description}`}
          onClick={() => actions.setRecipe({ output: entry.id })}
        >
          <Icon name={entry.icon} /><span>{entry.railLabel ?? entry.label}</span>
        </button>
      ))}
    </nav>
  );
}

function WeatherFields({ actions, recipe }) {
  return (
    <section className="tk-section">
      <h3 className="tk-section-title">Weather field</h3>
      <NumberField label="Coverage bias" max={1} min={-1} onChange={(value) => actions.setWeather({ coverageBias: value })} step={0.005} value={recipe.weather.coverageBias} />
      <NumberField label="Coverage contrast" max={4} min={0.1} onChange={(value) => actions.setWeather({ coverageContrast: value })} step={0.01} value={recipe.weather.coverageContrast} />
      <NumberField label="Precipitation" max={1} min={-1} onChange={(value) => actions.setWeather({ precipitationBias: value })} step={0.005} value={recipe.weather.precipitationBias} />
    </section>
  );
}

function AtmosphereFields({ actions, recipe }) {
  return (
    <section className="tk-section">
      <h3 className="tk-section-title">Atmospheric medium</h3>
      <NumberField label="Rayleigh" max={3} min={0} onChange={(value) => actions.setAtmosphere({ rayleigh: value })} step={0.01} value={recipe.atmosphere.rayleigh} />
      <NumberField label="Turbidity" max={15} min={1} onChange={(value) => actions.setAtmosphere({ turbidity: value })} step={0.01} value={recipe.atmosphere.turbidity} />
      <div className="tk-field">
        <span className="tk-field-label"><span className="tk-field-label-text">Ground albedo</span></span>
        <ColorWell onChange={(value) => actions.setAtmosphere({ groundAlbedo: value })} value={recipe.atmosphere.groundAlbedo} />
        <span className="sas-color-value">linear RGB</span>
      </div>
    </section>
  );
}

function ResultDetails({ result }) {
  if (!result) return null;
  return (
    <section className="tk-section sas-result-details">
      <h3 className="tk-section-title">Generated output</h3>
      <dl>
        <div><dt>Canvas</dt><dd>{result.width} × {result.height}</dd></div>
        <div><dt>Bake</dt><dd>{Math.max(1, Math.round(result.elapsedMs))} ms</dd></div>
        {Object.entries(result.metadata).map(([key, value]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
            <dd>{Array.isArray(value) ? value.join(' × ') : typeof value === 'object' ? 'embedded in recipe' : String(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Inspector({ actions, state }) {
  const recipe = state.document.recipe;
  const selected = SOURCE_OUTPUT_SPECS.find((entry) => entry.id === recipe.output) ?? SOURCE_OUTPUT_SPECS[0];
  const isAtmosphere = recipe.output.startsWith('atmosphere-');
  return (
    <aside className="sas-inspector tk" data-testid="inspector">
      <h2 className="sas-inspector-header">{selected.label}</h2>
      <p className="sas-inspector-caption">{selected.description}</p>
      <section className="tk-section">
        <h3 className="tk-section-title">Source recipe</h3>
        <div className="sas-select-field"><span>Output</span><Select onChange={(output) => actions.setRecipe({ output })} options={SOURCE_OUTPUT_SPECS.map((entry) => ({ label: entry.label, value: entry.id }))} value={recipe.output} /></div>
        <div className="sas-select-field"><span>Quality</span><Select onChange={(quality) => actions.setRecipe({ quality })} options={[{ label: 'Draft', value: 'draft' }, { label: 'Production', value: 'production' }]} value={recipe.quality} /></div>
        <NumberField label="Seed" max={99999} min={0} onChange={(value) => actions.setRecipe({ seed: Math.round(value) })} step={1} value={recipe.seed} />
        <Button icon="dice" kind="secondary" onClick={() => actions.reseed()}>Random seed</Button>
      </section>
      {recipe.output === 'weather-map' && <WeatherFields actions={actions} recipe={recipe} />}
      {isAtmosphere && <AtmosphereFields actions={actions} recipe={recipe} />}
      <ResultDetails result={state.result} />
      <section className="sas-source-note">
        <Icon name="info" />
        <p>2D maps and volume atlases preserve generated RGBA bytes. Atmosphere LUT PNGs are tone-mapped visualizations; the portable recipe retains their authored parameters.</p>
      </section>
    </aside>
  );
}

function StatusBar({ sourceDirty, state }) {
  return (
    <footer className="sas-status tk" data-testid="status-bar">
      <span>{state.status}</span>
      <span className="sas-status-spacer" />
      {sourceDirty && state.result && <span className="sas-status-dirty">Output is older than the recipe</span>}
      <span>CPU · deterministic · local only</span>
    </footer>
  );
}

export function App({ store }) {
  const state = useStoreState(store);
  const { actions } = store;
  const [channel, setChannel] = useState('rgba');
  const [checker, setChecker] = useState(true);
  const sourceDirty = store.isSourceDirty();

  useEffect(() => {
    document.title = `${state.document.label} — Atmosphere Source Lab`;
  }, [state.document.label]);

  return (
    <div className="sas-root">
      <TopBar actions={actions} sourceDirty={sourceDirty} state={state} />
      <SourceRail actions={actions} output={state.document.recipe.output} />
      <main className="sas-workspace">
        <div className="sas-preview-heading">
          <div><span>Generated source</span><strong>{state.result?.label ?? 'Waiting for bake'}</strong></div>
          {state.result && <span>{state.result.width} × {state.result.height}</span>}
        </div>
        <SourceCanvas channel={channel} checker={checker} result={state.result} />
        {state.bakeStatus === 'baking' && <div className="sas-baking"><span />Baking procedural source…</div>}
        {state.bakeError && <div className="sas-error"><Icon name="warning" />{state.bakeError}</div>}
      </main>
      <Inspector actions={actions} state={state} />
      <PreviewBar hint="Channel and checker affect only this preview.">
        <Select onChange={setChannel} options={CHANNEL_OPTIONS} value={channel} />
        <PreviewToggle checked={checker} label="Checker" onChange={setChecker} />
      </PreviewBar>
      <StatusBar sourceDirty={sourceDirty} state={state} />
      <ToastStack />
    </div>
  );
}
