import { useMemo, useState } from 'react';

import { Button, Icon, Modal, toast } from '../../shared/ui/index.js';
import { BUILT_IN_DEBRIS_PRESETS, DEBRIS_TYPES } from '../../../src/debrisgen/index.js';
import { deleteLocalDebrisPreset, loadLocalDebrisPresets } from '../debrisProjectStore.js';
import { DebrisThumbnail } from './DebrisThumbnail.jsx';

function ImportDialog({ actions, onClose }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal onClose={onClose} title="Import debris recipe" width={560}>
      <textarea
        className="db-json"
        autoFocus
        placeholder="Paste a toonlab.debrisRecipe JSON document…"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error && <div className="db-error">{error}</div>}
      <div className="db-dialog-actions">
        <Button kind="ghost" onClick={onClose}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => {
            const result = actions.importRecipe(draft);
            if (!result.ok) setError(result.errors.join(' '));
            else onClose();
          }}
        >
          Open recipe
        </Button>
      </div>
    </Modal>
  );
}

export function GalleryScreen({ actions, state }) {
  const [filter, setFilter] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [localVersion, setLocalVersion] = useState(0);
  const locals = useMemo(() => loadLocalDebrisPresets(), [localVersion]);
  const presets = filter === 'all'
    ? BUILT_IN_DEBRIS_PRESETS
    : BUILT_IN_DEBRIS_PRESETS.filter((preset) => preset.type === filter);
  const hasWork = state.bootSource !== 'fresh' || state.presetId || state.docRevision > 0;

  return (
    <div className="db-gallery" data-testid="gallery">
      <header className="db-gallery-header">
        <span className="db-gallery-eyebrow">Debris Lab · First-party procedural assets</span>
        <Button icon="download" kind="ghost" onClick={() => setImportOpen(true)} testId="gallery-import">
          Import recipe…
        </Button>
      </header>
      <h1 className="db-gallery-title">Scatter a story</h1>
      <p className="db-gallery-sub">Build stylized, game-ready debris from a preset, a clean piece, or a randomized recipe.</p>

      {hasWork && (
        <button type="button" className="db-continue" onClick={() => actions.setView({ gallery: false })}>
          <div>
            <strong>Continue where you left off</strong>
            <span>{state.name} · seed {state.settings.asset.seed}</span>
          </div>
          <span className="tk-button" data-kind="primary">Resume →</span>
        </button>
      )}

      <div className="db-gallery-section">Start fresh</div>
      <div className="db-gallery-grid db-gallery-grid-start">
        <button type="button" className="db-card db-card-special" data-testid="gallery-scratch" onClick={() => actions.startFromScratch()}>
          <Icon name="plus" />
          <div>From scratch</div>
          <span>One clean piece, neutral seed, every control ready</span>
        </button>
        <button type="button" className="db-card db-card-special" data-testid="gallery-procedural" onClick={() => actions.startProcedural()}>
          <Icon name="dice" />
          <div>Randomized debris</div>
          <span>Surprise me with a coherent type and recipe</span>
        </button>
      </div>

      <div className="db-gallery-section-row">
        <div className="db-gallery-section">Built-in presets ({presets.length})</div>
        <div className="db-filter" role="group" aria-label="Filter debris presets">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          {Object.entries(DEBRIS_TYPES).map(([id, type]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{type.icon} {type.label}</button>
          ))}
        </div>
      </div>
      <div className="db-gallery-grid">
        {presets.map((preset) => (
          <button key={preset.id} type="button" className="db-card" data-testid={`gallery-preset-${preset.id}`} onClick={() => actions.applyPreset(preset.id)}>
            <DebrisThumbnail preset={preset} />
            <div>{preset.label}</div>
            <span>{DEBRIS_TYPES[preset.type].label} · {preset.description}</span>
          </button>
        ))}
      </div>

      {locals.length > 0 && (
        <>
          <div className="db-gallery-section">Your library ({locals.length})</div>
          <div className="db-gallery-grid">
            {locals.map((preset) => (
              <div key={preset.id} className="db-card db-card-local">
                <button type="button" className="db-card-open" onClick={() => actions.applyPreset(preset.id)}>
                  <DebrisThumbnail preset={preset} />
                  <div>{preset.label}</div>
                  <span>{DEBRIS_TYPES[preset.type].label} · local preset</span>
                </button>
                <button
                  type="button"
                  className="tk-icon-button db-card-delete"
                  aria-label={`Delete ${preset.label}`}
                  onClick={() => {
                    deleteLocalDebrisPreset(preset.id);
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
      {importOpen && <ImportDialog actions={actions} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
