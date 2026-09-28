// Asset Browser HUD: search + filter the CC0 corpus on the left, results
// grid in the middle (the source's own thumbnails — instant), live styled
// preview fullscreen behind. Selecting a card downloads the asset once and
// re-shades it through the active style set; "Save to library" writes an
// imported-glb catalog entry so it browses/reloads beside procedural assets.
//
// Attribution is a feature, not a footnote: every card carries the source
// badge, and the source line links to Poly Haven — their API ToS asks for
// credit next to the content, and the badge doubles as a license filter
// (everything surfaced here is CC0 by construction).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getEnvironmentPresetOptions } from '@call-me-sensei/toonlab/environment';
import { catalog } from '@call-me-sensei/toonlab/catalog';
import {
  AMBIENTCG_PROXY_API,
  POLYPIZZA_PROXY_API,
  collectAssetCategories,
  curateAssetRefs,
  fetchKayKitIndex,
  fetchOs3dIndex,
  fetchPolyhavenIndex,
  filterAssetRefs,
  getAssetSource,
  importedAssetCatalogEntry,
  listAssetSources,
  searchAmbientcg,
  searchPolyPizza,
} from '@call-me-sensei/toonlab/assetlib';
import {
  readZipEntries,
  rewriteAmbientcgDownloadUrl,
} from '@call-me-sensei/toonlab/assetlib';
import { Badge, Button, Select, toast } from '../../shared/ui/index.js';
import { saveLibraryEntry } from '../../catalog/userLibrary.js';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { fileToTextureImage } from '../../texture-lab/ui/imageUpload.js';

const SOURCE_OPTIONS = [
  { label: 'Poly Haven', value: 'polyhaven' },
  { label: 'ambientCG', value: 'ambientcg' },
  { label: 'Poly Pizza (low-poly)', value: 'polypizza' },
  { label: 'KayKit packs (low-poly)', value: 'kaykit' },
  { label: 'Open Source 3D Assets', value: 'opensource3d' },
];

// Sources whose whole (CC0-only) index fits in memory — free-text search and
// category chips filter locally, no debounce. The rest search remotely.
const LOCAL_INDEX_SOURCES = ['polyhaven', 'kaykit', 'opensource3d'];
const MODEL_ONLY_SOURCES = ['polypizza', 'kaykit', 'opensource3d'];

const KIND_OPTIONS = [
  { label: 'Models', value: 'models' },
  { label: 'Textures', value: 'textures' },
];

const SOURCE_LINKS = {
  ambientcg: 'https://ambientcg.com',
  kaykit: 'https://kaylousberg.com',
  opensource3d: 'https://opensource3dassets.com',
  polyhaven: 'https://polyhaven.com',
  polypizza: 'https://poly.pizza',
};

const RESOLUTION_OPTIONS = ['1k', '2k', '4k'].map((value) => ({ label: value.toUpperCase(), value }));

const BACKDROP_OPTIONS = [
  { label: 'Studio (neutral)', value: 'studio' },
  { label: 'Outdoor', value: 'outdoor' },
  { label: 'Dark', value: 'dark' },
];

// Local per-user override for registry-disabled sources ({ sourceId: true })
// — the owner's review workflow: unreviewed sources ship enabled:false in
// sources.js, a reviewer flips them on locally to evaluate in this lab.
export const SOURCE_OVERRIDE_STORAGE = 'toonlab.asset-lab.enabled-sources.v1';

function readSourceOverrides() {
  try {
    return JSON.parse(localStorage.getItem(SOURCE_OVERRIDE_STORAGE)) ?? {};
  } catch {
    return {};
  }
}

export function App({ engine, boot = {} }) {
  const [source, setSource] = useState(
    SOURCE_OPTIONS.some((option) => option.value === boot.source) ? boot.source : 'polyhaven',
  );
  const [kind, setKind] = useState(boot.kind === 'texture' ? 'textures' : 'models');
  const [query, setQuery] = useState(boot.query ?? '');
  const [category, setCategory] = useState('all');
  const [refs, setRefs] = useState([]);
  const [indexError, setIndexError] = useState(null);
  const [selectedId, setSelectedId] = useState(boot.asset ?? null);
  const [resolution, setResolution] = useState(boot.res ?? '1k');
  const [style, setStyle] = useState(boot.style ?? 'default');
  const [loading, setLoading] = useState(false);
  const [compareOn, setCompareOn] = useState(Boolean(boot.compare));
  const [split, setSplit] = useState(boot.split ?? 0.5);
  const [lightsOn, setLightsOn] = useState({ fill: false, sky: true, sun: true });
  const [backdrop, setBackdrop] = useState(boot.backdrop ?? 'studio');
  const [sourceOverrides, setSourceOverrides] = useState(readSourceOverrides);
  const lastShow = useRef(null);

  const sourceInfo = getAssetSource(source);
  const sourceEnabled = !sourceInfo || sourceInfo.enabled !== false || sourceOverrides[source] === true;

  const enableSourceLocally = () => {
    const next = { ...sourceOverrides, [source]: true };
    try { localStorage.setItem(SOURCE_OVERRIDE_STORAGE, JSON.stringify(next)); } catch { /* session only */ }
    setSourceOverrides(next);
  };

  const styleOptions = useMemo(() => getEnvironmentPresetOptions(), []);

  useEffect(() => { engine.setBackdrop(backdrop); }, [backdrop]);
  useEffect(() => { engine.setCompare(compareOn); }, [compareOn]);
  useEffect(() => { engine.setSplit(split); }, [split]);
  useEffect(() => {
    for (const [name, on] of Object.entries(lightsOn)) engine.setLight(name, on);
  }, [lightsOn]);

  const dragSplit = (event) => {
    // preventDefault + user-select lock: without them the drag runs a text
    // selection across the HUD panels while wiping
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = 'none';
    const move = (pointerEvent) => setSplit(pointerEvent.clientX / window.innerWidth);
    const stop = () => {
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  // Local-index sources (Poly Haven / KayKit / Open Source 3D): whole CC0
  // index once, filter locally. ambientCG (materials) and Poly Pizza
  // (low-poly models, BYO key injected by the proxy): remote search through
  // the backend/dev proxy, debounced. Registry-disabled sources list nothing
  // until the local evaluation override is flipped; sources with a curated
  // include list only surface the keepers.
  useEffect(() => {
    let cancelled = false;
    setIndexError(null);
    if (!sourceEnabled) {
      setRefs([]);
      return undefined;
    }
    if (LOCAL_INDEX_SOURCES.includes(source)) {
      const index = source === 'kaykit'
        ? fetchKayKitIndex()
        : source === 'opensource3d'
          ? fetchOs3dIndex()
          : fetchPolyhavenIndex({ type: kind });
      index
        .then((loaded) => { if (!cancelled) setRefs(curateAssetRefs(loaded, sourceInfo)); })
        .catch((error) => { if (!cancelled) setIndexError(error.message); });
      return () => { cancelled = true; };
    }
    const timer = setTimeout(() => {
      const search = source === 'polypizza'
        ? searchPolyPizza({ apiKey: null, apiUrl: POLYPIZZA_PROXY_API, limit: 48, query })
        : searchAmbientcg({ apiUrl: AMBIENTCG_PROXY_API, limit: 80, query });
      search
        .then((loaded) => { if (!cancelled) setRefs(curateAssetRefs(loaded, sourceInfo)); })
        .catch((error) => {
          if (cancelled) return;
          setIndexError(source === 'polypizza'
            ? error.message
            : 'ambientCG needs a backend route — run the dev server (npm run dev).');
        });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, kind, sourceEnabled, LOCAL_INDEX_SOURCES.includes(source) ? null : query]);

  const categories = useMemo(() => collectAssetCategories(refs).slice(0, 16), [refs]);
  const results = useMemo(() => filterAssetRefs(refs, {
    category: category === 'all' ? null : category,
    text: LOCAL_INDEX_SOURCES.includes(source) ? (query || null) : null,
  }), [refs, query, category, source]);

  const selected = useMemo(
    () => refs.find((ref) => ref.id === selectedId) ?? null,
    [refs, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    engine.show(selected, { resolution, stylePreset: style }).then((result) => {
      if (result.stale) return;
      setLoading(false);
      if (!result.ok) toast(`Load failed: ${result.error}`);
      else lastShow.current = { ref: selected, ...result };
    });
  }, [selected, resolution, style]);

  const [savedId, setSavedId] = useState(null);

  const saveToLibrary = async () => {
    const shown = lastShow.current;
    if (!shown || shown.ref.id !== selected?.id) { toast('Load an asset first.'); return; }
    try {
      const entry = importedAssetCatalogEntry(shown.ref, {
        download: shown.download ?? null,
        textureSet: shown.textureSet ?? null,
      });
      await saveLibraryEntry(entry);
      try { catalog.register(entry, { source: 'library' }); } catch { /* already mounted */ }
      setSavedId(entry.id);
      toast(`Saved to library as ${entry.id}`);
    } catch (error) {
      toast(`Save failed: ${error.message}`);
    }
  };

  // Cross-pollination: hand the diffuse to Texture Lab as its image base
  // layer, where the toonify pipeline (seamless-ize, cel bands, palette,
  // wear) takes over. Uses the exact converter uploads go through.
  const sendToTextureLab = async () => {
    const shown = lastShow.current;
    if (!shown || shown.ref.id !== selected?.id || selected.kind !== 'texture') {
      toast('Load a texture asset first.');
      return;
    }
    try {
      let blob = null;
      if (shown.textureSet?.maps?.diffuse?.url) {
        blob = await (await fetch(shown.textureSet.maps.diffuse.url)).blob();
      } else if (shown.download?.url) {
        const response = await fetch(rewriteAmbientcgDownloadUrl(shown.download.url));
        const entries = await readZipEntries(await response.arrayBuffer());
        const color = entries.find((entry) => /_Color\.(jpg|png)$/i.test(entry.name));
        if (color) {
          blob = new Blob([color.data], {
            type: color.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          });
        }
      }
      if (!blob) { toast('No diffuse map found on this asset.'); return; }
      const layer = await fileToTextureImage(new File([blob], `${selected.name}.jpg`, { type: blob.type }));
      if (!setLabHandoff('texture-image', layer)) { toast('Could not stage the handoff (storage blocked).'); return; }
      window.location.href = '/texture-lab/?importImage=1';
    } catch (error) {
      toast(`Handoff failed: ${error.message}`);
    }
  };

  // Manual-import flow for the no-API sources (Kenney, Quaternius, The Base
  // Mesh, Sketchfab downloads, …): the user downloads from the source site,
  // then drops the .glb/.gltf/.zip here. Zips extract in-memory via the
  // shared reader; companion files become object-urls resolved by
  // loadImportedModel's suffix matcher. Session-only by design — object-urls
  // cannot be re-downloaded, so these never save to the library.
  const importLocalFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // re-selecting the same file must re-fire
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      let download = null;
      if (lower.endsWith('.zip')) {
        const entries = await readZipEntries(await file.arrayBuffer());
        const model = entries.find((entry) => /\.(glb|gltf)$/i.test(entry.name));
        if (!model) { toast('No .glb/.gltf inside that zip.'); return; }
        const resources = {};
        for (const entry of entries) {
          if (entry === model) continue;
          resources[entry.name] = URL.createObjectURL(new Blob([entry.data]));
        }
        download = {
          format: model.name.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf',
          resources,
          url: URL.createObjectURL(new Blob([model.data])),
        };
      } else if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
        download = { format: lower.endsWith('.glb') ? 'glb' : 'gltf', resources: {}, url: URL.createObjectURL(file) };
      } else {
        toast('Import a .glb, .gltf, or a .zip containing one.');
        return;
      }
      const ref = {
        attribution: { license: 'see source site', sourceLabel: 'Manual import', sourceUrl: null },
        authors: [],
        categories: [],
        download,
        id: `${file.name}@${Date.now()}`, // unique — never reuse a stale cache entry
        kind: 'model',
        name: file.name,
        pageUrl: null,
        source: 'manual',
        tags: [],
        thumbnailUrl: null,
      };
      setSelectedId(null);
      setLoading(true);
      const result = await engine.show(ref, { stylePreset: style });
      setLoading(false);
      if (!result.ok && !result.stale) toast(`Import failed: ${result.error}`);
    } catch (error) {
      setLoading(false);
      toast(`Import failed: ${error.message}`);
    }
  };

  const moreSources = useMemo(
    () => listAssetSources({ includeDisabled: true, integration: ['manual', 'linkout', 'reference'] }),
    [],
  );

  return (
    <div className="asset-shell">
      <aside className="asset-side">
        <h1>Asset Browser</h1>
        <p className="asset-sub">
          CC0 assets, previewed in your style set — from{' '}
          <a href={SOURCE_LINKS[source]} rel="noreferrer" target="_blank">
            {SOURCE_OPTIONS.find((option) => option.value === source)?.label}
          </a>
        </p>
        <Select
          onChange={(next) => {
            setSource(next);
            setCategory('all');
            setSelectedId(null);
            if (next === 'ambientcg') setKind('textures'); // materials only
            if (MODEL_ONLY_SOURCES.includes(next)) setKind('models');
          }}
          options={SOURCE_OPTIONS.map((option) => ({
            ...option,
            label: getAssetSource(option.value)?.enabled === false && !sourceOverrides[option.value]
              ? `${option.label} · off (unreviewed)`
              : option.label,
          }))}
          value={source}
        />
        {sourceInfo ? (
          <p className="asset-source-facts">
            {sourceInfo.license} · quality: {sourceInfo.qualityTier}
            {sourceInfo.keyed ? ' · key required' : ''}
          </p>
        ) : null}
        {!sourceEnabled ? (
          <div className="asset-source-disabled">
            <p>
              Disabled pending quality review — the curation bar is Poly
              Haven-tier (or approved stylized). Enable locally to evaluate;
              flip <code>enabled</code> in sources.js to ship it.
            </p>
            <Button onClick={enableSourceLocally}>Enable locally for evaluation</Button>
          </div>
        ) : null}
        <Select
          onChange={setKind}
          options={KIND_OPTIONS.filter((option) => {
            if (source === 'ambientcg') return option.value === 'textures';
            if (MODEL_ONLY_SOURCES.includes(source)) return option.value === 'models';
            return true;
          })}
          value={kind}
        />
        <input
          className="tk-text-field"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search crate, brick, rock…"
          type="search"
          value={query}
        />
        <div className="asset-tags">
          <button
            className={category === 'all' ? 'tag on' : 'tag'}
            onClick={() => setCategory('all')}
            type="button"
          >all</button>
          {categories.map((name) => (
            <button
              className={category === name ? 'tag on' : 'tag'}
              key={name}
              onClick={() => setCategory(category === name ? 'all' : name)}
              type="button"
            >{name}</button>
          ))}
        </div>
        <div className="asset-style">
          <label>Style set</label>
          <Select onChange={setStyle} options={styleOptions} value={style} />
          <label>Resolution</label>
          <Select onChange={setResolution} options={RESOLUTION_OPTIONS} value={resolution} />
          <label>Backdrop</label>
          <Select onChange={setBackdrop} options={BACKDROP_OPTIONS} value={backdrop} />
          <label>Lighting</label>
          <div className="asset-checks">
            {[['sun', 'Key sun'], ['sky', 'Sky fill'], ['fill', 'Front fill']].map(([name, label]) => (
              <label className="asset-check" key={name}>
                <input
                  checked={lightsOn[name]}
                  onChange={(event) => setLightsOn({ ...lightsOn, [name]: event.target.checked })}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          <label className="asset-check asset-compare-toggle">
            <input
              checked={compareOn}
              onChange={(event) => setCompareOn(event.target.checked)}
              type="checkbox"
            />
            Compare original (wipe)
          </label>
        </div>
        {source === 'polypizza' ? (
          <div className="asset-key">
            <p className="asset-key-status">
              Configure <span className="mono">POLYPIZZA_API_KEY</span> in the local server environment.
              The key is never sent to browser code.
            </p>
          </div>
        ) : null}
        {indexError ? <p className="asset-error">{indexError}</p> : null}
        <p className="asset-count">{results.length} of {refs.length} assets · all CC0</p>
        <details className="asset-more">
          <summary>More CC0 sources · manual import</summary>
          <p className="asset-more-hint">
            No public file API on these — download from the site, then import
            the file here (previewed through the style set, session-only).
          </p>
          <label className="asset-import">
            Import a downloaded .glb / .gltf / .zip
            <input accept=".glb,.gltf,.zip" onChange={importLocalFile} type="file" />
          </label>
          {moreSources.map((entry) => (
            <div className="asset-more-source" key={entry.id}>
              <a href={entry.url} rel="noreferrer" target="_blank">{entry.label} ↗</a>
              <span className="asset-more-license">{entry.license}</span>
              <p title={entry.notes}>{entry.goodFor}</p>
              {entry.restrictions ? (
                <p className="asset-more-warning">{entry.restrictions}</p>
              ) : null}
            </div>
          ))}
        </details>
      </aside>

      <main className="asset-grid" data-count={results.length}>
        {results.map((ref) => (
          <button
            className={`card${selectedId === ref.id ? ' selected' : ''}`}
            key={ref.id}
            onClick={() => setSelectedId(ref.id)}
            type="button"
          >
            <img alt="" loading="lazy" src={ref.thumbnailUrl} />
            <div className="card-label">{ref.name}</div>
            <div className="card-meta">
              <Badge>{ref.attribution.sourceLabel}</Badge>
              <Badge>{ref.attribution.license ?? 'CC0'}</Badge>
              {ref.polycount ? <span className="card-tris">{(ref.polycount / 1000).toFixed(1)}k tris</span> : null}
            </div>
          </button>
        ))}
        {results.length === 0 && !indexError ? (
          <div className="empty">
            {sourceEnabled ? 'Nothing matches.' : 'Source disabled pending quality review — enable it locally (sidebar) to evaluate.'}
          </div>
        ) : null}
      </main>

      {compareOn && selected ? (
        <div
          className="asset-divider"
          onPointerDown={dragSplit}
          style={{ left: `${split * 100}%` }}
        >
          <span className="asset-divider-label left">original</span>
          <span className="asset-divider-handle" />
          <span className="asset-divider-label right">{style}</span>
        </div>
      ) : null}

      {selected ? (
        <section className="asset-detail">
          <h2>{selected.name}{loading ? ' · loading…' : ''}</h2>
          <p className="asset-attrib">
            <a href={selected.pageUrl} rel="noreferrer" target="_blank">
              {selected.attribution.sourceLabel}
            </a>
            {` · ${selected.attribution.license ?? 'CC0'}`}
            {selected.authors.length ? ` · by ${selected.authors.join(', ')}` : ''}
          </p>
          {selected.attribution.text ? (
            <p className="asset-attrib">{selected.attribution.text}</p>
          ) : null}
          <div className="asset-actions">
            <Button onClick={saveToLibrary}>Save to library</Button>
            {selected.kind === 'texture' ? (
              <Button onClick={sendToTextureLab}>Toonify in Texture Lab</Button>
            ) : null}
            {savedId ? <a className="lab-link" href="/catalog/">Open Catalog ↗</a> : null}
            <a className="lab-link" href={selected.pageUrl} rel="noreferrer" target="_blank">
              View on {selected.attribution.sourceLabel} ↗
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
