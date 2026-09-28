import { useEffect, useMemo, useRef, useState } from 'react';

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
  RendererToggle,
  SegmentedControl,
  StyleBundleExportPrompt,
  TextField,
  toast,
  ToastStack,
} from '../../shared/ui/index.js';
import { downloadBlob, pickFile } from '../../shared/download.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';
import { listLibraryEntries } from '../../catalog/userLibrary.js';
import {
  createUrbanPropShaderProfileDocument,
  parseUrbanPropShaderProfileDocument,
  serializeUrbanPropShaderProfile,
} from '../../../src/environment/index.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
  systemStyleLabel,
} from '../../../src/core/systemStylePolicy.js';
import { writeRequiredLocalJson } from '../../shared/browserStorage.js';
import {
  MANUFACTURED_PREVIEW_ASSETS,
} from '../previewAssets.js';

const MANUFACTURED_STYLE_DRAFT_KEY = 'toonlab.manufacturedSurface.draft.v1';
const MANUFACTURED_STYLE_LIBRARY_KEY = 'toonlab.manufacturedSurface.library.v1';
const LOCAL_STYLE_LIMIT = 80;

function slug(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'manufactured_surface';
}

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // The lab remains usable when browser persistence is unavailable.
  }
}

function readSavedStyles() {
  const entries = readStorage(MANUFACTURED_STYLE_LIBRARY_KEY, []);
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => parseUrbanPropShaderProfileDocument(entry))
    .filter((result) => result.ok)
    .map((result) => result.value)
    .filter((entry) => !isProtectedSystemStyleId(entry.id))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function readDraftStyle() {
  const result = parseUrbanPropShaderProfileDocument(
    readStorage(MANUFACTURED_STYLE_DRAFT_KEY, null),
  );
  return result.ok ? result.value : null;
}

function upsertSavedStyle(document) {
  const parsed = parseUrbanPropShaderProfileDocument(document);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  assertUserStyleId(parsed.value.id);
  const next = readSavedStyles().filter((entry) => entry.id !== parsed.value.id);
  next.push(parsed.value);
  next.sort((a, b) => a.label.localeCompare(b.label));
  writeRequiredLocalJson(MANUFACTURED_STYLE_LIBRARY_KEY, next.slice(0, LOCAL_STYLE_LIMIT));
  return parsed.value;
}

function deleteSavedStyle(id) {
  if (isProtectedSystemStyleId(id)) return false;
  writeRequiredLocalJson(
    MANUFACTURED_STYLE_LIBRARY_KEY,
    readSavedStyles().filter((entry) => entry.id !== id),
  );
  return true;
}

function defaultStyleDocument() {
  return createUrbanPropShaderProfileDocument('call_me_sensei', {
    description: 'First-party ToonLab manufactured-surface treatment.',
    label: 'Call Me Sensei',
  });
}

function bootStyleState(urlParams = new URLSearchParams(window.location.search)) {
  const linkedId = urlParams.get('manufacturedStyle') ?? urlParams.get('style');
  const linkedStyle = linkedId === 'call_me_sensei'
    ? defaultStyleDocument()
    : readSavedStyles().find((entry) => entry.id === linkedId) ?? null;
  const hasPreviewDeepLink = urlParams.has('model')
    || urlParams.has('mode')
    || urlParams.has('lighting')
    || urlParams.get('editor') === '1'
    || urlParams.get('hud') === '0';
  return {
    document: linkedStyle ?? readDraftStyle() ?? defaultStyleDocument(),
    entryChooserOpen: !linkedStyle && !hasPreviewDeepLink,
  };
}

const TREATMENT_SECTIONS = Object.freeze([
  {
    description: 'Rebuild source colors into controlled paint bands, then restore sparse wear and graphics.',
    icon: 'stage-look',
    id: 'reconstruction',
    label: 'Reconstruction',
    railLabel: 'Reconstruct',
    layers: [
      ['sourceAuthorityEnabled', 'Source authority', true],
      ['paintExtractionEnabled', 'Paint extract', true],
      ['paintBandsEnabled', 'Paint bands', true],
      ['colorLiftEnabled', 'Paint lift', true],
      ['pastelPaletteEnabled', 'Pastel gate', true],
      ['wearEnabled', 'Sparse wear', true],
      ['graphicsEnabled', 'Graphics', true],
    ],
    values: [
      ['sourceAuthorityStrength', 'Source authority', 0, 1, 0.01, 1],
      ['paintExtractionStrength', 'Paint extract', 0, 1, 0.01, 1],
      ['colorLiftStrength', 'Paint lift', 0, 1, 0.01, 0.58],
      ['pastelStrength', 'Pastel push', 0, 1, 0.01, 0.1],
      ['wearAmount', 'Wear amount', 0, 1, 0.01, 0.28],
      ['decalStrength', 'Graphics', 0, 1, 0.01, 0.95],
    ],
  },
  {
    description: 'Control the small-scale normal and roughness response independently from color reconstruction.',
    icon: 'stage-surface',
    id: 'surface',
    label: 'Surface response',
    railLabel: 'Surface',
    layers: [
      ['normalDetailEnabled', 'Normal detail', true],
      ['roughnessBreakupEnabled', 'Roughness breakup', true],
    ],
    values: [
      ['normalStrength', 'Normals', 0, 0.6, 0.01, 0.1],
      ['roughnessBreakupStrength', 'Roughness', 0, 1.5, 0.01, 1.15],
    ],
  },
  {
    description: 'Shape direct light, shadow color, highlight bands, and material response.',
    icon: 'stage-animation',
    id: 'lighting',
    label: 'Lighting response',
    railLabel: 'Lighting',
    layers: [
      ['celLightingEnabled', 'Cel light', true],
      ['coolShadowsEnabled', 'Cool shadows', true],
      ['shadowPastelEnabled', 'Shadow pastel', true],
      ['highlightBandEnabled', 'Highlight band', true],
      ['materialResponseEnabled', 'Material response', true],
    ],
    values: [
      ['coolShadowStrength', 'Cool shadows', 0, 1, 0.01, 0.72],
      ['shadowPastelStrength', 'Shadow pastel', 0, 1, 0.01, 0.8],
      ['highlightBandStrength', 'Highlights', 0, 1, 0.01, 0.42],
      ['materialResponseStrength', 'Material response', 0, 1.5, 0.01, 0.82],
    ],
  },
  {
    description: 'Tune sheen, view response, probe contribution, and grazing-angle reflections.',
    icon: 'stage-detail',
    id: 'reflections',
    label: 'Reflections + sheen',
    railLabel: 'Reflection',
    layers: [
      ['planarSheenEnabled', 'Top sheen', true],
      ['viewReflectionEnabled', 'View reflection', true],
      ['reflectionSelectivityEnabled', 'Reflection selectivity', true],
      ['reflectionNormalEnabled', 'Reflection normals', true],
      ['reflectionProbeLayerEnabled', 'Scene probe', true],
      ['fresnelEnabled', 'Fresnel edge', true],
    ],
    values: [
      ['planarSheenStrength', 'Top sheen', 0, 1.5, 0.01, 0.25],
      ['viewReflectionStrength', 'View reflection', 0, 1.5, 0.01, 0.62],
      ['reflectionSelectivityStrength', 'Reflection select.', 0, 1, 0.01, 0.82],
      ['reflectionNormalStrength', 'Reflection normals', 0, 1, 0.01, 0.8],
      ['reflectionProbeStrength', 'Probe reflection', 0, 1, 0.01, 0.82],
      ['fresnelStrength', 'Fresnel edge', 0, 1, 0.01, 0.22],
    ],
  },
  {
    description: 'Keep silhouette, crease, and optional rim work separate from surface shading.',
    icon: 'stage-shape',
    id: 'line-work',
    label: 'Line work',
    railLabel: 'Lines',
    layers: [
      ['silhouetteInkEnabled', 'Silhouette', true],
      ['edgeInkEnabled', 'Crease ink', true],
      ['rimEnabled', 'Neon rim', false],
    ],
    values: [
      ['highlightStrength', 'Neon rim', 0, 0.8, 0.01, 0.16],
    ],
  },
]);

const WORKSPACE_SECTIONS = Object.freeze([
  ...TREATMENT_SECTIONS,
  {
    description: 'Review detected material roles and export an approved classification sidecar.',
    icon: 'stage-surface',
    id: 'materials',
    label: 'Material classification',
    railLabel: 'Materials',
  },
]);

function libraryAsset(entry) {
  if (
    entry?.kind !== 'imported-glb'
    || entry.recipe?.kind !== 'model'
    || !entry.recipe.download?.url
  ) return null;
  return {
    description: entry.description || 'Saved imported model.',
    engineId: `library:${entry.id}`,
    id: `library:${entry.id}`,
    kind: 'library',
    label: entry.label,
    source: 'Your library',
    spec: {
      assetId: entry.recipe.assetId ?? entry.id,
      download: entry.recipe.download,
      fitWidth: 3,
      label: entry.label,
      objectClass: 'prop',
      targetY: 0.8,
    },
  };
}

function assetBadge(asset) {
  if (asset.kind === 'local') return 'Local';
  if (asset.kind === 'sample') return 'CC0 sample';
  if (asset.kind === 'library') return 'Library';
  if (asset.kind === 'upload') return 'Session';
  return 'Preview';
}

function PreviewAssetsModal({
  api,
  assets,
  busyId,
  onClose,
  onRefreshLibrary,
  onSelect,
  onUpload,
  selectedId,
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return assets;
    return assets.filter((asset) => (
      `${asset.label} ${asset.description} ${asset.source}`
        .toLowerCase()
        .includes(normalized)
    ));
  }, [assets, query]);
  const groups = useMemo(() => (
    filtered.reduce((result, asset) => {
      result[asset.source] = result[asset.source] ?? [];
      result[asset.source].push(asset);
      return result;
    }, {})
  ), [filtered]);

  return (
    <Modal onClose={onClose} testId="preview-assets-modal" title="Preview assets" width={760}>
      <div className="tk-preview-assets mm-preview-assets">
        <p>
          Switch the fixture receiving the current manufactured-material look.
          Local test cases stay private, uploads last for this browser session,
          and library entries keep their source recipe and provenance.
        </p>
        <div className="tk-preview-assets__toolbar mm-preview-assets__toolbar">
          <input
            className="tk-text-field"
            placeholder="Search preview assets…"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button disabled={!api} icon="download" onClick={onUpload} testId="upload-preview-asset">
            Upload GLB…
          </Button>
          <Button
            icon="search"
            kind="secondary"
            onClick={() => window.open(
              '/asset-lab/?source=polyhaven&kind=model&materialFamily=urban&style=call_me_sensei',
              '_blank',
              'noopener,noreferrer',
            )}
            testId="browse-open-gallery"
            title="Browse open assets, then use Save to library to make one selectable here."
          >
            Browse gallery
          </Button>
          <Button kind="ghost" onClick={onRefreshLibrary}>Refresh library</Button>
        </div>
        <p className="mm-preview-assets__path">
          Persistent private fixtures: <code>assets-local/labs/manufactured-material/test-cases/&lt;id&gt;/model.glb</code>
        </p>
        <div className="tk-preview-assets__list">
          {Object.entries(groups).map(([source, entries]) => (
            <section key={source}>
              <h3>{source}</h3>
              <div>
                {entries.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="tk-preview-assets__asset"
                    data-active={selectedId === asset.id}
                    data-testid={`preview-asset-${asset.id}`}
                    disabled={Boolean(busyId)}
                    onClick={() => onSelect(asset)}
                  >
                    <span className="tk-preview-assets__radio" aria-hidden="true" />
                    <span>
                      <strong>{asset.label}</strong>
                      <small>{asset.description}</small>
                    </span>
                    <em>{busyId === asset.id ? 'Loading…' : assetBadge(asset)}</em>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <div className="tk-preview-assets__empty">No matching preview assets.</div>
          )}
        </div>
        <div className="tk-preview-assets__actions">
          <Button kind="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

function DocumentMenu({
  anchor,
  canUpdate,
  name,
  onClose,
  onExport,
  onImport,
  onReset,
  onSaveAs,
  onUpdate,
}) {
  const [nextName, setNextName] = useState(name);
  return (
    <Popover anchor={anchor} onClose={onClose} title="Manufactured surface style" width={320}>
      <div className="mm-doc-menu">
        <div className="mm-save-row">
          <TextField onCommit={setNextName} placeholder="Style name…" value={nextName} />
          {canUpdate && (
            <Button kind="primary" onClick={() => { if (onUpdate(nextName)) onClose(); }}>
              Update
            </Button>
          )}
        </div>
        <Button
          kind={canUpdate ? 'secondary' : 'primary'}
          onClick={() => { if (onSaveAs(nextName)) onClose(); }}
        >
          Save As…
        </Button>
        <Button kind="secondary" onClick={() => { onClose(); onExport(); }}>Export…</Button>
        <Button
          kind="secondary"
          onClick={async () => { if (await onImport()) onClose(); }}
        >
          Import style JSON…
        </Button>
        <Button kind="danger" onClick={() => { onReset(); onClose(); }}>Reset style</Button>
      </div>
    </Popover>
  );
}

function ExportDialog({ onClose, onExportBundle, onExportStyle }) {
  return (
    <Modal onClose={onClose} testId="manufactured-export-dialog" title="Export manufactured-surface style" width={620}>
      <div className="tk-export-dialog">
        <p>Export this manufactured-surface profile for direct runtime use, or wrap it in its canonical style-bundle slot.</p>
        <div className="tk-export-dialog__actions">
          <Button kind="primary" onClick={onExportStyle}>Export style JSON</Button>
          <Button kind="secondary" onClick={onExportBundle}>Export bundle with Manufactured Surface slot only</Button>
        </div>
        <StyleBundleExportPrompt />
      </div>
    </Modal>
  );
}

function TopBar({ canDelete, documentMenu, dirty, name, onDelete, onOpenEntryChooser }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const menus = createLabEditorMenus({
    onDocument: () => setMenuAnchor({ x: 12, y: 80 }),
    onHome: onOpenEntryChooser,
    fileItems: [{ icon: 'stage-export', label: 'Export…', onSelect: () => setExportOpen(true) }],
  });
  return (
    <>
    <LabEditorHeader className="gr-topbar" menus={menus}>
      <BrandLockup labName="Manufactured Material Lab" onLabNameClick={onOpenEntryChooser} />
      <button
        type="button"
        className="gr-title mm-title"
        data-testid="doc-title"
        onClick={(event) => setMenuAnchor({ x: event.clientX, y: event.clientY + 10 })}
      >
        {name}{dirty && <span className="gr-dirty">●</span>}<Icon name="chevron-down" />
      </button>
      {canDelete && (
        <IconButton
          icon="trash"
          label="Delete selected saved style"
          onClick={() => {
            if (window.confirm('Delete this saved style? Call Me Sensei will be restored.')) {
              onDelete();
            }
          }}
          testId="delete-style"
        />
      )}
      <span className="gr-topbar-spacer" />
      <RendererToggle
        supportedKinds={['webgl']}
        unsupportedReason="The retained manufactured-material benchmark currently uses its canonical WebGL shader."
      />
      {menuAnchor && (
        <DocumentMenu
          {...documentMenu}
          anchor={menuAnchor}
          name={name}
          onClose={() => setMenuAnchor(null)}
          onExport={() => setExportOpen(true)}
        />
      )}
    </LabEditorHeader>
    {exportOpen && (
      <ExportDialog
        onClose={() => setExportOpen(false)}
        onExportBundle={documentMenu.onExportBundle}
        onExportStyle={documentMenu.onExportStyle}
      />
    )}
    </>
  );
}

function SectionRail() {
  return (
    <nav className="gr-rail tk" data-testid="section-rail">
      {WORKSPACE_SECTIONS.map((section, index) => (
        <button
          key={section.id}
          type="button"
          className="gr-rail-stage"
          data-active={index === 0}
          data-panel-view-button={section.id}
          data-testid={`section-${section.id}`}
          title={`${section.label} — ${section.description}`}
        >
          <Icon name={section.icon} />
          <span>{section.railLabel}</span>
        </button>
      ))}
    </nav>
  );
}

function LayerGrid({ description, entries }) {
  return (
    <div className="mm-layer-grid">
      {entries.map(([key, label, active]) => (
        <button
          key={key}
          type="button"
          data-active={active}
          data-layer-button={key}
          title={`${label}. ${description}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ValueControls({ description, entries }) {
  return (
    <div className="mm-value-controls">
      {entries.map(([key, label, min, max, step, value]) => (
        <label key={key} className="mm-value-field" title={`${label}. ${description}`}>
          <span>{label}</span>
          <input
            data-control={key}
            type="range"
            min={min}
            max={max}
            step={step}
            defaultValue={value}
          />
          <output>{Number(value).toFixed(2)}</output>
        </label>
      ))}
    </div>
  );
}

function TreatmentInspector({ section, hidden }) {
  return (
    <section
      id={`${section.id}-settings-panel`}
      data-panel-view={section.id}
      hidden={hidden}
    >
      <h2 className="gr-inspector-header">{section.label}</h2>
      <p className="gr-inspector-caption">{section.description}</p>
      <div className="mm-inspector-section">
        <h3>Layers</h3>
        <LayerGrid description={section.description} entries={section.layers} />
      </div>
      <div className="mm-inspector-section">
        <h3>Strengths</h3>
        <ValueControls description={section.description} entries={section.values} />
      </div>
    </section>
  );
}

function MaterialsInspector() {
  return (
    <section id="material-tags-panel" data-panel-view="materials" hidden>
      <h2 className="gr-inspector-header">Material classification</h2>
      <p className="gr-inspector-caption">
        Runtime review overlay only. Export an approved sidecar or embed the
        same facts in glTF extras; the source model is never rewritten here.
      </p>
      <div id="material-inspector" className="material-inspector" aria-live="polite">
        <p className="inspector-empty">Loading material tags…</p>
      </div>
      <div className="inspector-actions">
        <button className="tk-button" id="reset-material-tags" type="button">
          Reset detected tags
        </button>
        <button className="tk-button" id="export-material-manifest" type="button">
          Export sidecar JSON
        </button>
      </div>
    </section>
  );
}

function Inspector() {
  return (
    <aside className="gr-inspector panel tk" data-testid="inspector">
      {TREATMENT_SECTIONS.map((section, index) => (
        <TreatmentInspector
          key={section.id}
          section={section}
          hidden={index !== 0}
        />
      ))}
      <MaterialsInspector />
    </aside>
  );
}

function StatusBar({ dirty, name }) {
  return (
    <footer className="gr-status tk" data-testid="status-bar">
      <span id="classification-summary">Resolved materials: loading…</span>
      <span className="gr-status-spacer" />
      <span className="gr-status-meta">
        {name}{dirty ? ' · unsaved changes' : ' · saved'} · source identity preserved
      </span>
    </footer>
  );
}

export function App() {
  const boot = useMemo(() => bootStyleState(), []);
  const initialStyle = boot.document;
  const [api, setApi] = useState(() => window.__manufacturedMaterialLab ?? null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [sessionAssets, setSessionAssets] = useState([]);
  const [selectedId, setSelectedId] = useState('wooden-crate-01');
  const [navigationMode, setNavigationMode] = useState('rotate');
  const [entryChooserOpen, setEntryChooserOpen] = useState(boot.entryChooserOpen);
  const [savedStyles, setSavedStyles] = useState(readSavedStyles);
  const [styleDirty, setStyleDirty] = useState(false);
  const [styleId, setStyleId] = useState(initialStyle.id);
  const [styleName, setStyleName] = useState(initialStyle.label);
  const objectUrls = useRef([]);
  const pendingStyle = useRef(null);
  const restoredApi = useRef(null);

  useEffect(() => {
    const ready = () => setApi(window.__manufacturedMaterialLab ?? null);
    ready();
    window.addEventListener('toonlab:manufactured-material-ready', ready);
    return () => window.removeEventListener('toonlab:manufactured-material-ready', ready);
  }, []);

  useEffect(() => {
    if (!api || restoredApi.current === api) return;
    restoredApi.current = api;
    try {
      const pending = pendingStyle.current;
      const applied = api.applyStyleDocument(pending?.document ?? initialStyle);
      setStyleId(applied.id);
      setStyleName(applied.label);
      setStyleDirty(pending?.dirty ?? false);
      writeStorage(MANUFACTURED_STYLE_DRAFT_KEY, applied);
      pendingStyle.current = null;
    } catch (error) {
      toast(`Could not restore the last manufactured style: ${error.message}`, { tone: 'danger' });
    }
  }, [api, initialStyle]);

  useEffect(() => {
    if (!api) return undefined;
    const onStyleChange = () => {
      const document = api.getStyleDocument(styleId, styleName);
      writeStorage(MANUFACTURED_STYLE_DRAFT_KEY, document);
      setStyleDirty(true);
    };
    window.addEventListener('toonlab:manufactured-style-change', onStyleChange);
    return () => window.removeEventListener('toonlab:manufactured-style-change', onStyleChange);
  }, [api, styleId, styleName]);

  useEffect(() => {
    if (!api) return undefined;
    const frame = requestAnimationFrame(() => api.syncStyleControls());
    return () => cancelAnimationFrame(frame);
  }, [api, styleId, styleName, styleDirty]);

  useEffect(() => { api?.setNavigationMode(navigationMode); }, [api, navigationMode]);

  useEffect(() => {
    const read = () => {
      const current = document.body.dataset.model;
      if (current) setSelectedId(current);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-model'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function refreshLibrary() {
    try {
      const entries = await listLibraryEntries();
      setLibraryAssets(entries.map(libraryAsset).filter(Boolean));
    } catch (error) {
      toast(`Could not read your library: ${error.message}`, { tone: 'danger' });
    }
  }

  async function selectAsset(asset) {
    if (!api) return;
    const engineId = asset.engineId ?? asset.id;
    setBusyId(asset.id);
    try {
      if (asset.spec) api.registerModel(engineId, asset.spec);
      await api.setModel(engineId);
      setSelectedId(asset.id);
      setAssetsOpen(false);
    } catch (error) {
      toast(`Could not load ${asset.label}: ${error.message}`, { tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  }

  async function uploadAsset() {
    const file = await pickFile('.glb,model/gltf-binary');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      toast('Upload a self-contained .glb. Multi-file glTF belongs in the Asset Browser import flow.', { tone: 'danger' });
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    const id = `upload:${Date.now()}:${file.name}`;
    const asset = {
      description: 'Session-only browser upload. Move durable private fixtures into the documented assets-local folder.',
      engineId: id,
      id,
      kind: 'upload',
      label: file.name,
      source: 'Session uploads',
      spec: {
        assetId: `session-upload/${file.name}`,
        download: {
          format: 'glb',
          resources: {},
          url,
        },
        fitWidth: 3,
        label: file.name,
        objectClass: 'prop',
        targetY: 0.8,
      },
    };
    setSessionAssets((current) => [asset, ...current]);
    await selectAsset(asset);
  }

  function currentStyleDocument(id = styleId, label = styleName) {
    return api?.getStyleDocument(id || slug(label), label)
      ?? createUrbanPropShaderProfileDocument(id || slug(label), { label });
  }

  function applyStyle(document, { dirty = false } = {}) {
    if (!api) {
      pendingStyle.current = { dirty, document };
      setStyleId(document.id);
      setStyleName(document.label);
      setStyleDirty(dirty);
      return true;
    }
    try {
      const applied = api.applyStyleDocument(document);
      setStyleId(applied.id);
      setStyleName(applied.label);
      setStyleDirty(dirty);
      writeStorage(MANUFACTURED_STYLE_DRAFT_KEY, applied);
      return true;
    } catch (error) {
      toast(error.message, { tone: 'danger' });
      return false;
    }
  }

  function openStyle(id) {
    const document = id === 'call_me_sensei'
      ? defaultStyleDocument()
      : savedStyles.find((entry) => entry.id === id);
    return document ? applyStyle(document) : false;
  }

  function saveStyleAs(name) {
    const clean = String(name ?? '').trim();
    if (!clean) {
      toast('A style name is required.', { tone: 'danger' });
      return false;
    }
    try {
      const document = currentStyleDocument(
        `local_${slug(clean)}_${Date.now().toString(36)}`,
        clean,
      );
      const saved = upsertSavedStyle(document);
      setSavedStyles(readSavedStyles());
      setStyleId(saved.id);
      setStyleName(saved.label);
      setStyleDirty(false);
      writeStorage(MANUFACTURED_STYLE_DRAFT_KEY, saved);
      toast(`Saved “${saved.label}”.`, { tone: 'success' });
      return true;
    } catch (error) {
      toast(error.message, { tone: 'danger' });
      return false;
    }
  }

  function updateStyle(name) {
    if (!savedStyles.some((entry) => entry.id === styleId)) {
      toast('Built-in styles are read-only. Use Save As to create an editable copy.', { tone: 'danger' });
      return false;
    }
    const clean = String(name ?? '').trim();
    if (!clean) {
      toast('A style name is required.', { tone: 'danger' });
      return false;
    }
    try {
      const saved = upsertSavedStyle(currentStyleDocument(styleId, clean));
      setSavedStyles(readSavedStyles());
      setStyleName(saved.label);
      setStyleDirty(false);
      writeStorage(MANUFACTURED_STYLE_DRAFT_KEY, saved);
      toast(`Updated “${saved.label}”.`, { tone: 'success' });
      return true;
    } catch (error) {
      toast(error.message, { tone: 'danger' });
      return false;
    }
  }

  function removeStyle(id) {
    if (!savedStyles.some((entry) => entry.id === id)) return false;
    try { if (!deleteSavedStyle(id)) return false; }
    catch (error) { toast(error.message, { tone: 'danger' }); return false; }
    setSavedStyles(readSavedStyles());
    if (styleId === id) applyStyle(defaultStyleDocument());
    return true;
  }

  async function importStyle() {
    const file = await pickFile('application/json,.json');
    if (!file) return false;
    const result = parseUrbanPropShaderProfileDocument(await file.text());
    if (!result.ok) {
      for (const error of result.errors) toast(error, { tone: 'danger' });
      return false;
    }
    for (const warning of result.warnings ?? []) toast(warning, { tone: 'warning' });
    return applyStyle(result.value, { dirty: true });
  }

  function exportStyle() {
    const document = currentStyleDocument(slug(styleName), styleName);
    downloadBlob(
      serializeUrbanPropShaderProfile(document),
      `${slug(styleName)}.manufactured-surface.json`,
      'application/json',
    );
  }

  function exportStyleBundle() {
    const document = currentStyleDocument(slug(styleName), styleName);
    downloadBlob(
      serializeSingleSlotStyleBundle({
        description: 'Manufactured-surface shader style exported from ToonLab.',
        label: styleName,
        slotId: 'manufacturedSurface',
        styleDocument: document,
      }),
      `${slug(styleName)}.style-bundle.json`,
      'application/json',
    );
  }

  const assets = useMemo(
    () => [...MANUFACTURED_PREVIEW_ASSETS, ...libraryAssets, ...sessionAssets],
    [libraryAssets, sessionAssets],
  );
  const entryOptions = [
    { label: `${systemStyleLabel('Call Me Sensei', 'call_me_sensei')} · read-only`, value: 'call_me_sensei' },
    ...savedStyles.map((entry) => ({
      label: `${entry.label} · saved`,
      value: entry.id,
    })),
  ];

  return (
    <div className="tk">
      <div className="gr-root">
        <TopBar
          canDelete={savedStyles.some((entry) => entry.id === styleId)}
          dirty={styleDirty}
          name={styleName}
          onDelete={() => removeStyle(styleId)}
          onOpenEntryChooser={() => setEntryChooserOpen(true)}
          documentMenu={{
            canUpdate: savedStyles.some((entry) => entry.id === styleId),
            onExportBundle: exportStyleBundle,
            onExportStyle: exportStyle,
            onImport: importStyle,
            onReset: () => applyStyle(defaultStyleDocument()),
            onSaveAs: saveStyleAs,
            onUpdate: updateStyle,
          }}
        />
        <SectionRail />
        <Inspector />
        <StatusBar dirty={styleDirty} name={styleName} />
      </div>
      <PreviewBar hint="Left-drag rotate · wheel zoom · right-drag pan · C resets camera">
        <SegmentedControl
          onChange={setNavigationMode}
          options={[
            { label: 'Rotate', value: 'rotate' },
            { label: 'Pan', value: 'pan' },
            { label: 'Zoom', value: 'zoom' },
          ]}
          testId="navigation-mode"
          value={navigationMode}
        />
        <Button
          disabled={!api}
          icon="stage-shape"
          kind="secondary"
          onClick={() => {
            setAssetsOpen(true);
            refreshLibrary();
          }}
          testId="preview-assets"
        >
          Preview assets
        </Button>
        <div className="tk-segmented" aria-label="Comparison mode">
          <button type="button" data-mode-button="original">Original</button>
          <button type="button" data-active="true" data-mode-button="split">Split</button>
          <button type="button" data-mode-button="styled">Styled</button>
        </div>
        <div className="tk-segmented mm-time" aria-label="Time of day">
          <button type="button" data-lighting-button="dawn">Dawn</button>
          <button type="button" data-active="true" data-lighting-button="day">Day</button>
          <button type="button" data-lighting-button="sunset">Sunset</button>
          <button type="button" data-lighting-button="night">Night</button>
        </div>
        <IconButton
          icon="reset"
          label="Reset camera (C)"
          onClick={() => api?.frameCamera()}
        />
      </PreviewBar>
      {assetsOpen && (
        <PreviewAssetsModal
          api={api}
          assets={assets}
          busyId={busyId}
          onClose={() => setAssetsOpen(false)}
          onRefreshLibrary={refreshLibrary}
          onSelect={selectAsset}
          onUpload={uploadAsset}
          selectedId={selectedId}
        />
      )}
      {entryChooserOpen && (
        <LabEntryChooser
          currentDescription="Keep editing the manufactured-surface draft restored from this browser."
          currentName={styleName}
          entries={entryOptions}
          labName="Manufactured Surface Shader Lab"
          newDescription="Reset to the clean Call Me Sensei manufactured-surface profile and begin a separate style."
          newLabel="New surface style"
          onContinue={() => setEntryChooserOpen(false)}
          onCreate={() => {
            if (applyStyle(defaultStyleDocument())) setEntryChooserOpen(false);
          }}
          onOpenEntry={(id) => {
            if (openStyle(id)) setEntryChooserOpen(false);
          }}
          openLabel="Open style"
        />
      )}
      <ToastStack />
    </div>
  );
}
