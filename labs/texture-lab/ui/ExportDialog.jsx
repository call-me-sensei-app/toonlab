// Export modal: bake at a chosen resolution, download individual PNG maps,
// the all-in-one ZIP (maps + recipe.json + material.json), the recipe JSON,
// or a share URL with the recipe inlined.

import { useRef, useState } from 'react';

import { Button, IconButton, Modal, Select, Toggle, toast } from '../../shared/ui/index.js';
import {
  bakeForExport,
  downloadTextureMapPng,
  downloadTextureRecipe,
  downloadTextureZip,
  TEXTURE_EXPORT_MAPS,
  TEXTURE_EXPORT_RESOLUTIONS,
  textureShareUrl,
} from '../exporters.js';

export function ExportDialog({ actions, engine, state }) {
  const [resolution, setResolution] = useState(1024);
  const [selected, setSelected] = useState(() => new Set(
    TEXTURE_EXPORT_MAPS.map((spec) => spec.file).filter((file) => file !== 'orm'
      && (file !== 'emissive' || state.settings.emissive.enabled)),
  ));
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const bakeCache = useRef({ key: '', maps: null });

  const cacheKey = `${resolution}:${state.docRevision}`;

  async function ensureBake() {
    if (bakeCache.current.key === cacheKey && bakeCache.current.maps) return bakeCache.current.maps;
    setBusy(true);
    setProgress(0);
    try {
      const imagePixels = state.settings.image
        ? await engine.ensureImagePixels(state.settings.image)
        : null;
      const maps = await bakeForExport(state.settings, {
        imagePixels,
        onProgress: setProgress,
        resolution,
        shouldCancel: null,
      });
      bakeCache.current = { key: cacheKey, maps };
      return maps;
    } finally {
      setBusy(false);
    }
  }

  async function exportZip() {
    try {
      const maps = await ensureBake();
      const mapFiles = TEXTURE_EXPORT_MAPS.filter((spec) => selected.has(spec.file));
      if (!mapFiles.length) {
        toast('Select at least one map.', { tone: 'danger' });
        return;
      }
      await downloadTextureZip(maps, mapFiles, { name: state.name, settings: state.settings });
      actions.setStatus(`Exported ${mapFiles.length} maps at ${resolution}×${resolution}.`);
    } catch (error) {
      toast(error.message || 'Export failed.', { tone: 'danger' });
    }
  }

  async function exportOne(spec) {
    try {
      const maps = await ensureBake();
      await downloadTextureMapPng(maps, spec, state.name);
    } catch (error) {
      toast(error.message || 'Export failed.', { tone: 'danger' });
    }
  }

  async function copyShare() {
    try {
      const { url, strippedImage } = textureShareUrl(state.settings, state.name);
      await navigator.clipboard.writeText(url);
      toast(strippedImage
        ? 'Share link copied — the image base stays local; use Recipe JSON to carry it.'
        : 'Share link copied — the whole recipe travels in the URL.', { tone: 'success' });
    } catch {
      toast('Could not access the clipboard.', { tone: 'danger' });
    }
  }

  return (
    <Modal onClose={() => actions.setView({ export: false })} testId="export-dialog" title="Export texture" width={520}>
      <div className="tx-export">
        <div className="tx-export-row">
          <span className="tx-export-label">Resolution</span>
          <Select
            onChange={(value) => setResolution(Number(value))}
            options={TEXTURE_EXPORT_RESOLUTIONS.map((size) => ({
              label: `${size} × ${size}${size >= 2048 ? ' (takes a few seconds)' : ''}`,
              value: String(size),
            }))}
            value={String(resolution)}
          />
        </div>

        <div className="tx-export-maps">
          {TEXTURE_EXPORT_MAPS.map((spec) => (
            <div key={spec.file} className="tx-export-map">
              <Toggle
                checked={selected.has(spec.file)}
                onChange={(next) => {
                  const nextSet = new Set(selected);
                  if (next) nextSet.add(spec.file);
                  else nextSet.delete(spec.file);
                  setSelected(nextSet);
                }}
              />
              <span>{spec.label}</span>
              <IconButton disabled={busy} icon="download" label={`Download ${spec.label} PNG`} onClick={() => exportOne(spec)} />
            </div>
          ))}
        </div>

        {busy && (
          <div className="tx-progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        )}

        <div className="tx-export-actions">
          <Button disabled={busy} icon="download" kind="primary" onClick={exportZip}>
            {busy ? `Baking ${resolution}px…` : 'Download ZIP (maps + recipe)'}
          </Button>
          <Button kind="secondary" onClick={() => downloadTextureRecipe(state.settings, state.name)}>Recipe JSON</Button>
          <Button icon="link" kind="ghost" onClick={copyShare}>Copy share link</Button>
        </div>
        <p className="tx-export-note">
          Maps tile seamlessly. Albedo/emissive are sRGB; normal (OpenGL +Y), roughness, metalness,
          AO, height, and the glTF ORM pack are linear.
        </p>
      </div>
    </Modal>
  );
}
