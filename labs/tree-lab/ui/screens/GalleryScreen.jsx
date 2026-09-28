// Start gallery: the tool's front door. Continue card (when work exists),
// blank/procedural entry cards, built-in preset grid with real rendered
// thumbnails, local library with manage menu, and recipe import.

import { useEffect, useMemo, useState } from 'react';
import {
  BrandLockup, Button, Icon, Modal, toast,
} from '../../../shared/ui/index.js';
import {
  BUILT_IN_TREE_PRESETS,
  createCuratedTreePresetDocuments,
  deleteLocalTreePreset,
  loadLocalTreePresets,
  upsertLocalTreePresets,
} from '../../treePresetStore.js';
import { capturePresetThumbnails, getPresetThumbnails } from '../thumbnails.js';

function ImportDialog({ actions, labKind, onClose }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal onClose={onClose} title="Import recipe">
      <textarea
        className="td-json"
        autoFocus
        placeholder={`Paste a ${labKind === 'flower' ? 'flower' : 'tree'} recipe JSON document…`}
        spellCheck={false}
        style={{ minHeight: 220 }}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error && <div className="td-json-error">{error}</div>}
      <div className="td-export-actions">
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => {
            const result = actions.importRecipe(draft);
            if (!result.ok) {
              setError(result.errors.join(' '));
              return;
            }
            actions.setView({ gallery: false });
            onClose();
          }}
        >
          Open
        </Button>
      </div>
    </Modal>
  );
}

export function GalleryScreen({ actions, labKind = 'tree', state }) {
  const isFlowerLab = labKind === 'flower';
  const [importOpen, setImportOpen] = useState(false);
  const [localVersion, setLocalVersion] = useState(0);
  const [query, setQuery] = useState('');
  const acceptsType = (preset) => isFlowerLab ? preset.type === 'flower' : preset.type !== 'flower';
  const builtInPresets = useMemo(
    () => BUILT_IN_TREE_PRESETS.filter(acceptsType),
    [isFlowerLab],
  );
  const localPresets = useMemo(
    () => loadLocalTreePresets().filter(acceptsType),
    [isFlowerLab, localVersion],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (preset) => !normalizedQuery || [
    preset.id,
    preset.label,
    preset.type,
    preset.options?.speciesProfileId,
    preset.options?.growthForm,
  ].some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery));
  const visibleBuiltIns = builtInPresets.filter(matchesQuery);
  const visibleLocal = localPresets.filter(matchesQuery);
  const allPresets = useMemo(
    () => [...builtInPresets, ...localPresets],
    [builtInPresets, localPresets],
  );
  const [thumbs, setThumbs] = useState({});
  const [thumbnailCapture, setThumbnailCapture] = useState({
    busy: false,
    completed: 0,
    total: 0,
  });

  useEffect(() => {
    // Thumbnails render synchronously but after first paint, so the gallery
    // shell appears instantly even on a cold cache. On node backends,
    // cache-miss thumbnails render asynchronously (RT readback) and arrive
    // later via onUpdate — guarded so a late arrival after unmount (e.g. the
    // user opens a preset before rendering finishes) is a no-op.
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setThumbs(getPresetThumbnails(allPresets, {
        onUpdate: (rendered) => {
          if (!cancelled) setThumbs((previous) => ({ ...previous, ...rendered }));
        },
      }));
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [allPresets]);

  const hasWork = state.bootSource === 'persisted'
    || state.sketch.branchSpines.length > 0 || state.presetId;

  function openPreset(presetId) {
    // Presets are direct editor documents. Navigate so bootPlantLab creates
    // the renderer for the new route; applying into the gallery's renderer-
    // free store would briefly render the editor with a null engine.
    const url = new URL(window.location.href);
    url.search = `?${labKind === 'flower' ? 'flowerPreset' : 'treePreset'}=${encodeURIComponent(presetId)}`;
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  }

  async function captureGalleryThumbnails() {
    if (thumbnailCapture.busy || !allPresets.length) return;
    setThumbnailCapture({ busy: true, completed: 0, total: allPresets.length });
    try {
      const rendered = await capturePresetThumbnails(allPresets, {
        onProgress: ({ completed, total }) => {
          setThumbnailCapture({ busy: true, completed, total });
        },
      });
      // Include cache hits in the immediate update too. This makes the
      // explicit capture action useful even when the gallery mounted before
      // its background thumbnail pass completed.
      setThumbs((previous) => ({
        ...previous,
        ...getPresetThumbnails(allPresets),
        ...rendered,
      }));
      setThumbnailCapture({ busy: false, completed: allPresets.length, total: allPresets.length });
      toast(`Captured ${allPresets.length} gallery thumbnails.`);
    } catch (error) {
      setThumbnailCapture({ busy: false, completed: 0, total: allPresets.length });
      toast(`Could not capture thumbnails: ${error.message}`, { tone: 'danger' });
    }
  }

  return (
    <div className="td-gallery" data-testid="gallery">
      <header className="td-gallery-header">
        <BrandLockup labName={isFlowerLab ? 'Flower Lab' : 'Tree & Shrub Generation Lab'} />
        <span className="td-gallery-eyebrow">
          {isFlowerLab
            ? 'Flower Lab · First-party procedural plants'
            : 'Tree & Shrub Generation Lab · First-party procedural plants'}
        </span>
        <Button icon="download" kind="ghost" onClick={() => setImportOpen(true)} testId="gallery-import">
          Import recipe…
        </Button>
        <Button
          disabled={thumbnailCapture.busy}
          icon="save"
          kind="ghost"
          onClick={captureGalleryThumbnails}
          testId="gallery-capture-thumbnails"
          title="Render and cache a thumbnail for every gallery asset"
        >
          {thumbnailCapture.busy
            ? `Capturing ${thumbnailCapture.completed}/${thumbnailCapture.total}…`
            : 'Capture thumbnails'}
        </Button>
      </header>
      <h1 className="td-gallery-title">{isFlowerLab ? 'Grow a flower' : 'Grow a tree'}</h1>
      <p className="td-gallery-sub">
        {isFlowerLab
          ? 'Start from a flower species or grow a fresh seeded variation.'
          : 'Start from a tree preset, a blank canvas, or a random seed.'}
      </p>
      <label className="td-gallery-search">
        <span>Search assets</span>
        <input
          type="search"
          data-testid="gallery-search"
          placeholder={isFlowerLab ? 'Name, species, or type…' : 'Name, species, tree, or shrub…'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {hasWork && (
        <button
          type="button"
          className="td-continue"
          data-testid="gallery-continue"
          onClick={() => actions.setView({ gallery: false })}
        >
          <div>
            <div style={{ font: 'var(--type-label)' }}>Continue where you left off</div>
            <div style={{ color: 'var(--text-tertiary)', font: 'var(--type-caption)' }}>
              seed {state.settings.plant.seed}
              {state.presetId ? ` · from “${state.presetId}”` : ''}
              {state.sketch.branchSpines.length ? ` · ${state.sketch.branchSpines.length} drawn strokes` : ''}
            </div>
          </div>
          <span className="tk-button" data-kind="primary">Resume →</span>
        </button>
      )}

      <div className="td-gallery-section">Start fresh</div>
      <div className="td-gallery-grid">
        {isFlowerLab ? (
          <button
            type="button"
            className="td-card td-card-special"
            data-testid="gallery-blank"
            onClick={() => {
              actions.newTree({ drawn: false, randomize: false });
              actions.setView({ gallery: false });
            }}
          >
            <Icon name="stage-flowers" />
            <div>New Flower</div>
            <span>Start from a clean daisy structure</span>
          </button>
        ) : (
          <button
            type="button"
            className="td-card td-card-special"
            data-testid="gallery-blank"
            onClick={() => {
              actions.newTree({ drawn: true });
              actions.setSketchMode(true);
              actions.setView({ gallery: false });
            }}
          >
            <Icon name="tool-trunk" />
            <div>Blank Canvas</div>
            <span>Doodle it — wood + leaves, then Convert</span>
          </button>
        )}
        <button
          type="button"
          className="td-card td-card-special"
          data-testid="gallery-procedural"
          onClick={() => {
            actions.newTree({ drawn: false });
            actions.setView({ gallery: false });
          }}
        >
          <Icon name="dice" />
          <div>{isFlowerLab ? 'Random Flower' : 'Procedural Seed'}</div>
          <span>Surprise me</span>
        </button>
        {!isFlowerLab && (
          <button
            type="button"
            className="td-card td-card-special"
            data-testid="gallery-batch-100"
            onClick={() => {
              try {
                const saved = upsertLocalTreePresets(createCuratedTreePresetDocuments(100));
                setLocalVersion((version) => version + 1);
                toast(`Generated ${saved.length} monochrome tree candidates for your library.`);
              } catch (error) {
                toast(`Could not generate the tree batch: ${error.message}`, { tone: 'danger' });
              }
            }}
          >
            <Icon name="dice" />
            <div>Generate 100 Candidates</div>
            <span>Monochrome foliage · varied leaves, branches &amp; bark</span>
          </button>
        )}
      </div>

      <div className="td-gallery-section">Presets ({visibleBuiltIns.length} of {builtInPresets.length})</div>
      <div className="td-gallery-grid">
        {visibleBuiltIns.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="td-card"
            data-testid={`gallery-preset-${preset.id}`}
            onClick={() => openPreset(preset.id)}
          >
            {thumbs[preset.id]
              ? <img alt="" src={thumbs[preset.id]} />
              : <span className="td-card-thumb-empty" />}
            <div>{preset.label}</div>
            <span>{preset.type} · seed {preset.options?.seed ?? '—'}</span>
          </button>
        ))}
      </div>

      {localPresets.length > 0 && (
        <>
          <div className="td-gallery-section">Your library ({visibleLocal.length} of {localPresets.length})</div>
          <div className="td-gallery-grid">
            {visibleLocal.map((preset) => (
              <div key={preset.id} className="td-card td-card-local">
                <button type="button" className="td-card-open" onClick={() => openPreset(preset.id)}>
                  {thumbs[preset.id]
                    ? <img alt="" src={thumbs[preset.id]} />
                    : <span className="td-card-thumb-empty" />}
                  <div>{preset.label}</div>
                  <span>local</span>
                </button>
                <button
                  type="button"
                  className="tk-icon-button td-card-delete"
                  aria-label={`Delete ${preset.label}`}
                  title="Delete preset"
                  onClick={() => {
                    try { deleteLocalTreePreset(preset.id); }
                    catch (error) { toast(error.message, { tone: 'danger' }); return; }
                    toast(`Deleted “${preset.label}”`);
                    setLocalVersion((version) => version + 1);
                  }}
                >
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {normalizedQuery && visibleBuiltIns.length === 0 && visibleLocal.length === 0 && (
        <div className="td-gallery-empty" data-testid="gallery-empty">
          No saved or built-in assets match “{query}”.
        </div>
      )}
      {importOpen && (
        <ImportDialog actions={actions} labKind={labKind} onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
