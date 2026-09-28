// The catalog browser: thumbnail grid + filters on the left, live preview +
// recipe/snippet detail on the right. toonlab.io serves this page as the
// public showcase — it IS the proof of depth.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { catalog } from '@call-me-sensei/toonlab/catalog';
import { Badge, Button, Select, toast } from '../../shared/ui/index.js';
import { downloadBlob } from '../../shared/download.js';
import { createCatalogPreview } from '../catalogEngine.js';
import { deleteLibraryEntry, saveLibraryEntry } from '../userLibrary.js';

const CLUSTER_LABELS = {
  all: 'All clusters',
  debrisgen: 'Debris',
  lighting: 'Lighting',
  pathgen: 'Paths',
  post: 'Post',
  propgen: 'Props',
  rockgen: 'Rocks',
  sky: 'Sky',
  toon: 'Toon',
  vegetation: 'Vegetation',
  water: 'Water',
};

const LAB_LINKS = {
  debrisgen: (entry) => `/debris-lab/?debrisRecipe=${encodeURIComponent(JSON.stringify({ kind: 'toonlab.debrisRecipe', name: entry.label, settings: entry.recipe.settings, version: 1 }))}`,
  lighting: (entry) => `/lighting-lab/?preset=${encodeURIComponent(`${entry.recipe.kind}:${entry.recipe.preset}`)}`,
  propgen: (entry) => `/prop-lab/?recipe=${encodeURIComponent(JSON.stringify(entry.recipe))}`,
  water: (entry) => `/water-lab/?waterPreset=${encodeURIComponent(entry.recipe.preset)}`,
};

function snippetFor(entry, seed) {
  const recipeJson = JSON.stringify(entry.recipe, null, 2);
  return [
    `import { catalog } from '@call-me-sensei/toonlab/catalog';`,
    '',
    `const asset = catalog.spawn('${entry.id}'${seed !== undefined ? `, { seed: ${seed} }` : ''});`,
    `// or, without the catalog — the entry's recipe inlined:`,
    `// ${entry.spawn}`,
    `// entry.recipe = ${recipeJson.split('\n').join('\n// ')}`,
  ].join('\n');
}

export function App({ initialCount }) {
  const [query, setQuery] = useState('');
  const [cluster, setCluster] = useState('all');
  const [tag, setTag] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [seed, setSeed] = useState(7);
  const [revision, setRevision] = useState(0);
  const [spawnable, setSpawnable] = useState(true);
  const previewMount = useRef(null);
  const previewRef = useRef(null);

  const entries = useMemo(() => catalog.list({
    cluster: cluster === 'all' ? null : cluster,
    tags: tag === 'all' ? null : [tag],
    text: query || null,
  }), [query, cluster, tag, revision]);

  const allTags = useMemo(() => {
    const counts = new Map();
    for (const entry of catalog.list()) {
      for (const entryTag of entry.tags) counts.set(entryTag, (counts.get(entryTag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([name]) => name);
  }, [revision]);

  const selected = selectedId ? catalog.get(selectedId) : null;

  useEffect(() => {
    if (!previewMount.current || previewRef.current) return;
    previewRef.current = createCatalogPreview({ mount: previewMount.current });
  }, []);

  useEffect(() => {
    if (!previewRef.current || !selected) return;
    previewRef.current.show(selected.id, { seed }).then((result) => {
      setSpawnable(result.spawnable);
      document.body.dataset.catalogPreviewReady = 'true';
    });
  }, [selectedId, seed]);

  const exportGlb = async () => {
    const object = previewRef.current?.getCurrentObject();
    if (!object) { toast('Nothing spawned to export.'); return; }
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const buffer = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
    downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), `${selected.id.replaceAll('/', '-')}.glb`);
    toast('GLB exported.');
  };

  const saveToLibrary = async () => {
    if (!selected) return;
    const id = `user/${selected.id}-${Date.now() % 100000}`;
    const entry = { ...selected, id, source: undefined, tags: [...selected.tags, 'user'] };
    delete entry.source;
    await saveLibraryEntry(entry);
    try { catalog.register(entry, { source: 'library' }); } catch { /* already mounted */ }
    setRevision((value) => value + 1);
    toast(`Saved to library as ${id}`);
  };

  const removeFromLibrary = async (entry) => {
    await deleteLibraryEntry(entry.id);
    catalog.unregister(entry.id);
    setRevision((value) => value + 1);
    if (selectedId === entry.id) setSelectedId(null);
    toast('Removed from library.');
  };

  return (
    <div className="catalog-shell">
      <aside className="catalog-side">
        <h1>ToonLab Catalog</h1>
        <p className="catalog-sub">{catalog.list().length} recipes &amp; presets · every one seeded, procedural, and spawnable</p>
        <input
          className="tk-text-field"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search lantern, shrine, koi…"
          type="search"
          value={query}
        />
        <Select
          onChange={setCluster}
          options={Object.entries(CLUSTER_LABELS).map(([value, label]) => ({ label, value }))}
          value={cluster}
        />
        <div className="catalog-tags">
          <button
            className={tag === 'all' ? 'tag on' : 'tag'}
            onClick={() => setTag('all')}
            type="button"
          >all</button>
          {allTags.map((name) => (
            <button
              className={tag === name ? 'tag on' : 'tag'}
              key={name}
              onClick={() => setTag(tag === name ? 'all' : name)}
              type="button"
            >{name}</button>
          ))}
        </div>
      </aside>

      <main className="catalog-grid" data-count={entries.length}>
        {entries.map((entry) => (
          <button
            className={`card${selectedId === entry.id ? ' selected' : ''}`}
            key={entry.id}
            onClick={() => { setSelectedId(entry.id); }}
            type="button"
          >
            {entry.thumbnail
              ? <img alt="" loading="lazy" src={`../labs/catalog/${entry.thumbnail}`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
              : <div className="card-icon">{CLUSTER_LABELS[entry.cluster]?.[0] ?? '·'}</div>}
            <div className="card-label">{entry.label}</div>
            <div className="card-meta">
              <Badge>{entry.cluster}</Badge>
              {entry.source === 'library' ? <Badge>library</Badge> : null}
            </div>
          </button>
        ))}
        {entries.length === 0 ? <div className="empty">Nothing matches.</div> : null}
      </main>

      <section className="catalog-detail">
        <div className="preview" ref={previewMount} />
        {selected ? (
          <div className="detail-body">
            <h2>{selected.label}</h2>
            <p className="detail-id">{selected.id}</p>
            {selected.description ? <p>{selected.description}</p> : null}
            <div className="detail-actions">
              <Button onClick={() => setSeed(Math.floor(Math.random() * 100000))}>Re-roll seed ({seed})</Button>
              <Button disabled={!spawnable} onClick={exportGlb}>Export GLB</Button>
              <Button onClick={saveToLibrary}>Save to library</Button>
              {LAB_LINKS[selected.cluster]
                ? <a className="lab-link" href={LAB_LINKS[selected.cluster](selected)}>Open in lab ↗</a>
                : null}
              {selected.source === 'library'
                ? <Button onClick={() => removeFromLibrary(selected)}>Delete</Button>
                : null}
            </div>
            {!spawnable ? (
              <p className="detail-note">Settings preset — copy the snippet below into your scene.</p>
            ) : null}
            <pre className="snippet">{snippetFor(selected, spawnable ? seed : undefined)}</pre>
          </div>
        ) : (
          <div className="detail-body empty">Pick anything — the preview spawns it through the same
            <code> catalog.spawn()</code> your game would use.</div>
        )}
      </section>
    </div>
  );
}
