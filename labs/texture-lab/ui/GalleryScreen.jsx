// Full-screen start/browse screen: built-in preset gallery with live-baked
// thumbnails, category filter, the user's saved library, and import.

import { useMemo, useState } from 'react';

import { Button, Icon, Modal, toast } from '../../shared/ui/index.js';
import {
  BUILT_IN_TEXTURE_PRESETS,
  TEXTURE_PRESET_CATEGORIES,
} from '../../../src/texgen/index.js';
import { deleteLocalTexturePreset, loadLocalTexturePresets } from '../textureProjectStore.js';
import { pickTextureImage } from './imageUpload.js';
import { TextureThumbnail } from './TextureThumbnail.jsx';

function ImportDialog({ actions, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal onClose={onClose} testId="texture-import-dialog" title="Import texture recipe" width={580}>
      <div className="tx-import">
      <textarea
        className="tx-json"
        placeholder='Paste a texture recipe JSON ({"kind":"toonlab.textureRecipe", ...})'
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {error && <div className="tx-import-error">{error}</div>}
      <div className="tx-import-actions">
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => {
            const result = actions.importRecipe(text);
            if (!result.ok) setError(result.errors.join(' '));
          }}
        >
          Import recipe
        </Button>
      </div>
      </div>
    </Modal>
  );
}

export function GalleryScreen({ actions, state }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [libraryTick, setLibraryTick] = useState(0);
  const local = useMemo(() => loadLocalTexturePresets(), [libraryTick]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (preset) => tokens.every((token) => (
      preset.label.toLowerCase().includes(token)
      || preset.tags.some((tag) => tag.includes(token))
    ));
    const pool = BUILT_IN_TEXTURE_PRESETS.filter((preset) => category === 'all' || preset.category === category);
    return tokens.length ? pool.filter(matches) : pool;
  }, [category, query]);

  const filteredLocal = useMemo(() => {
    const tokens = libraryQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return local;
    return local.filter((preset) => tokens.every((token) => (
      preset.label.toLowerCase().includes(token)
      || preset.tags.some((tag) => tag.includes(token))
    )));
  }, [libraryQuery, local]);

  const currentDraft = useMemo(() => ({
    category: 'local',
    id: `current-draft-${state.docRevision}`,
    label: state.name,
    settings: state.settings,
    tags: ['editable', 'working draft'],
  }), [state.docRevision, state.name, state.settings]);

  const startFromImage = async () => {
    const layer = await pickTextureImage().catch((error) => {
      toast(error.message, { tone: 'danger' });
      return null;
    });
    if (!layer) return;
    actions.startFromScratch();
    actions.setImage(layer);
  };

  const openCc0Gallery = () => {
    window.location.href = window.location.pathname.startsWith('/labs')
      ? '/gallery?type=texture'
      : '/gallery/?type=texture';
  };

  return (
    <main className="tx-gallery tk" data-testid="texture-home-screen">
      <div className="tx-gallery__content">
        <section className="tx-gallery__hero">
          <div className="tx-gallery__hero-copy">
            <span className="tx-gallery__eyebrow">Texture Lab · First-party procedural materials</span>
            <h1>Build production-ready surfaces.</h1>
            <p>
              Start with an authored material, a clean layered recipe, or a tightly cropped source
              image. Every texture stays seamless and editable, with PBR maps and runtime-ready JSON.
            </p>
            <div className="tx-gallery__hero-tags" aria-label="Texture generation capabilities">
              <span>Seamless PBR maps</span>
              <span>Editable layered recipes</span>
              <span>Runtime JSON + textures</span>
            </div>
          </div>
          <button
            className="tx-gallery__resume"
            data-testid="texture-home-continue"
            onClick={() => actions.setView({ gallery: false })}
            type="button"
          >
            <TextureThumbnail preset={currentDraft} />
            <span className="tx-gallery__resume-shade" />
            <span className="tx-gallery__resume-copy">
              <small>Current editable draft</small>
              <strong>{state.name}</strong>
              <span>Continue in the texture editor <Icon name="play" /></span>
            </span>
          </button>
        </section>

        {local.length > 0 ? (
          <section className="tx-gallery__section tx-gallery__saved-section">
            <div className="tx-gallery__section-title">
              <div>
                <span className="tx-gallery__section-kicker">Your library</span>
                <h2>Saved textures</h2>
                <p>Search and reopen an editable material recipe saved in this browser.</p>
              </div>
              <strong>{local.length} saved</strong>
            </div>
            <input
              aria-label="Search your saved textures"
              className="tk-text-field tx-gallery__library-search"
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Search your saved textures…"
              type="search"
              value={libraryQuery}
            />
            <div className="tx-gallery-grid tx-gallery-grid--saved">
              {filteredLocal.map((preset) => (
                <TextureCard
                  key={preset.id}
                  onDelete={() => {
                    try { deleteLocalTexturePreset(preset.id); }
                    catch (error) { toast(error.message, { tone: 'danger' }); return; }
                    setLibraryTick((tick) => tick + 1);
                  }}
                  onOpen={() => actions.applyPreset(preset.id)}
                  preset={preset}
                />
              ))}
              {filteredLocal.length === 0 && (
                <p className="tx-gallery-empty">No saved texture matches that search.</p>
              )}
            </div>
          </section>
        ) : (
          <div className="tx-gallery__empty-library">
            <Icon name="stage-export" />
            <div>
              <strong>No saved textures yet</strong>
              <span>Use Save As in the editor and your material recipes will appear here.</span>
            </div>
          </div>
        )}

        <section className="tx-gallery__section">
          <div className="tx-gallery__section-title">
            <div>
              <span className="tx-gallery__section-kicker">Choose how to begin</span>
              <h2>Create a texture</h2>
              <p>Pick the source that best matches the material you are authoring.</p>
            </div>
          </div>
          <div className="tx-gallery__start-grid">
            <button
              className="tx-gallery__start-card tx-gallery__start-card--primary"
              onClick={() => { actions.startFromScratch(); actions.setStage('ai'); }}
              type="button"
            >
              <Icon name="sketch" />
              <span><strong>Describe with AI</strong><small>Turn a material description into an editable recipe.</small></span>
            </button>
            <button className="tx-gallery__start-card" onClick={() => actions.startFromScratch()} type="button">
              <Icon name="plus" />
              <span><strong>Start from scratch</strong><small>Begin with a neutral layered material.</small></span>
            </button>
            <button
              className="tx-gallery__start-card"
              onClick={startFromImage}
              title="Use a tightly cropped photo of one surface, such as stone, bark, fabric, or a wall."
              type="button"
            >
              <Icon name="download" />
              <span><strong>Use an image</strong><small>Build a seamless base from one cropped surface.</small></span>
            </button>
            <button className="tx-gallery__start-card" onClick={openCc0Gallery} type="button">
              <Icon name="download" />
              <span><strong>Browse CC0 sources</strong><small>Choose a reusable source set from the Gallery.</small></span>
            </button>
            <button className="tx-gallery__start-card" onClick={() => setImporting(true)} type="button">
              <Icon name="download" />
              <span><strong>Import recipe JSON</strong><small>Continue from a portable ToonLab texture recipe.</small></span>
            </button>
          </div>
        </section>

        <section className="tx-gallery__section tx-gallery__catalog-section">
          <div className="tx-gallery__section-title">
            <div>
              <span className="tx-gallery__section-kicker">Designed starting points</span>
              <h2>Authored material library</h2>
              <p>Choose a production-minded surface, then tune every layer in the editor.</p>
            </div>
            <strong>{filtered.length} matches</strong>
          </div>

          <div className="tx-gallery-filter">
            <button type="button" className="tx-chip" data-active={category === 'all'} onClick={() => setCategory('all')}>All</button>
            {TEXTURE_PRESET_CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="tx-chip"
                data-active={category === entry.id}
                onClick={() => setCategory(entry.id)}
              >
                {entry.label}
              </button>
            ))}
            <span className="tx-gallery-search">
              <input
                aria-label="Search texture presets"
                className="tk-text-field"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search authored materials…"
                type="search"
                value={query}
              />
            </span>
          </div>

          <div className="tx-gallery-grid" data-testid="texture-gallery">
            {filtered.map((preset) => (
              <TextureCard key={preset.id} onOpen={() => actions.applyPreset(preset.id)} preset={preset} />
            ))}
            {filtered.length === 0 && (
              <p className="tx-gallery-empty">No authored material matches that search.</p>
            )}
          </div>
        </section>
      </div>

      {importing && <ImportDialog actions={actions} onClose={() => setImporting(false)} />}
    </main>
  );
}

function TextureCard({ onDelete = null, onOpen, preset }) {
  return (
    <div className="tx-card-wrap">
      <button
        type="button"
        className="tx-card"
        data-testid={`preset-${preset.id}`}
        onClick={onOpen}
      >
        <TextureThumbnail preset={preset} />
        <span className="tx-card-copy">
          <strong>{preset.label}</strong>
          <small>{preset.tags.slice(0, 3).join(' · ')}</small>
        </span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="tx-card-delete"
          title={`Delete ${preset.label} from your library`}
          onClick={onDelete}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
