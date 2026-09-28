// Export dialog: one surface for both exits (Recipe JSON / baked GLB),
// reached from the top bar and the rail's Export stage.

import { useState } from 'react';
import {
  Button, Modal, SegmentedControl, TextField, toast,
} from '../../../shared/ui/index.js';
import { downloadBlob } from '../../exporters.js';

export function ExportDialog({
  actions, engine, onClose, state,
}) {
  const recipe = actions.getRecipeDocument();
  const defaultName = recipe.id ?? `${recipe.type}-${state.settings.plant.seed}`;
  const [format, setFormat] = useState('json');
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (format === 'json') {
      downloadBlob(
        new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }),
        `${name}.json`,
      );
      toast('Recipe JSON downloaded', { tone: 'success' });
      onClose();
      return;
    }
    setBusy(true);
    try {
      const bytes = await engine.exportGlb({ filename: `${name}.glb`, mode: state.glbMode });
      toast(`GLB downloaded (${(bytes / 1024).toFixed(0)} KB, ${state.glbMode} quads)`, { tone: 'success' });
      onClose();
    } catch (error) {
      console.error('GLB export failed:', error);
      toast(`GLB export failed: ${error.message}`, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.search = `?recipe=${encodeURIComponent(JSON.stringify(recipe))}`;
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast('Link copied', { tone: 'success' });
    } catch {
      toast('Link written to the address bar');
    }
  }

  return (
    <Modal onClose={onClose} testId="export-dialog" title="Export">
      <div className="tk-field" style={{ gridTemplateColumns: '96px 1fr' }}>
        <span className="tk-field-label">Filename</span>
        <TextField onCommit={setName} testId="export-name" value={name} />
      </div>
      <div className="td-export-cards">
        <button
          type="button"
          className="td-export-card"
          data-active={format === 'json'}
          onClick={() => setFormat('json')}
        >
          <h4>Recipe (JSON)</h4>
          <p>
            Rebuilds this exact plant. Full fidelity — wind, toon ramp, and
            backlit stay live in-engine.
          </p>
        </button>
        <button
          type="button"
          className="td-export-card"
          data-active={format === 'glb'}
          onClick={() => setFormat('glb')}
        >
          <h4>Model (GLB)</h4>
          <p>Baked standard materials for any engine or DCC.</p>
          {format === 'glb' && (
            <div style={{ marginTop: 8 }}>
              <SegmentedControl
                onChange={(mode) => actions.setGlbMode(mode)}
                options={[
                  { label: 'Crossed quads', value: 'crossed' },
                  { label: 'Single ½△', value: 'single' },
                ]}
                testId="glb-mode"
                value={state.glbMode}
              />
            </div>
          )}
        </button>
      </div>
      <p style={{ color: 'var(--text-tertiary)', font: 'var(--type-caption)' }}>
        ⓘ GLB bakes the toon foliage to standard materials — wind, ramp, and
        backlit effects stay engine-side (use the JSON recipe for full fidelity).
      </p>
      <div className="td-export-actions">
        <Button kind="ghost" onClick={copyLink} testId="export-copy-link">Copy link</Button>
        <Button
          kind="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
            toast('Recipe JSON copied', { tone: 'success' });
          }}
        >
          Copy JSON
        </Button>
        <Button disabled={busy} icon="download" kind="primary" onClick={download} testId="export-download">
          {busy ? 'Baking…' : 'Download'}
        </Button>
      </div>
    </Modal>
  );
}
