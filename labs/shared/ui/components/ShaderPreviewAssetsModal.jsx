import { useMemo, useState } from 'react';

import { Button, TextField } from './primitives.jsx';
import { Modal } from './overlays.jsx';

export function ShaderPreviewAssetsModal({
  artifactLabel,
  assets,
  onClose,
  onImport,
  onSelect,
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
    filtered.reduce((output, asset) => {
      const key = asset.source || 'Preview fixtures';
      output[key] = output[key] ?? [];
      output[key].push(asset);
      return output;
    }, {})
  ), [filtered]);

  return (
    <Modal
      onClose={onClose}
      testId="preview-assets-modal"
      title="Preview assets"
      width={720}
    >
      <div className="tk-preview-assets">
        <p>
          Switch the asset receiving this {artifactLabel}. The selected
          fixture, recipe, species, geometry, seed, and palette are preview
          state and are never exported with the shader profile.
        </p>
        <div className="tk-preview-assets__toolbar">
          <TextField
            onCommit={setQuery}
            placeholder="Search preview assets…"
            value={query}
          />
          {onImport && (
            <Button
              kind="secondary"
              onClick={onImport}
              testId="import-preview-asset"
            >
              Import recipe…
            </Button>
          )}
        </div>
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
                    onClick={() => onSelect(asset)}
                  >
                    <span className="tk-preview-assets__radio" aria-hidden="true" />
                    <span>
                      <strong>{asset.label}</strong>
                      <small>{asset.description}</small>
                    </span>
                    <em>{asset.kind === 'reference' ? 'Reference' : 'Procedural'}</em>
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
