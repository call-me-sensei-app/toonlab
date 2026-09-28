// Asset Browser boot. URL params make every state headless-reachable (the
// MCP preview tool and lab-probe drive these):
//   ?asset=wooden_crate_01     auto-load this asset id
//   ?source=polyhaven|ambientcg|polypizza|kaykit|opensource3d
//                              which library it lives in (default polyhaven)
//   ?kind=model|texture        which index the asset lives in (default model)
//   ?style=call_me_sensei      style set applied to the preview
//   ?res=1k|2k|4k              download resolution (default 1k)
//   ?compare=1&split=0.5       original-vs-styled wipe at the split fraction
//   ?rockMaterialConfigUrl=…   apply a released ToonLab rock material sidecar
//   ?hud=0                     stage only, no React HUD

import React from 'react';
import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './asset.css';

import { installRendererSwitcher } from '../../shared/rendererSwitcher.js';
import {
  AMBIENTCG_PROXY_API,
  POLYPIZZA_PROXY_API,
  GALLERY_MATERIAL_FAMILY,
  fetchKayKitIndex,
  fetchOs3dIndex,
  fetchPolyPizzaModel,
  fetchPolyhavenIndex,
  importedAssetCatalogEntry,
  readZipEntries,
  rewriteAmbientcgDownloadUrl,
  searchAmbientcg,
} from '@call-me-sensei/toonlab/assetlib';
import { fileToTextureImage } from '../../texture-lab/ui/imageUpload.js';
import { setLabHandoff } from '../../shared/labHandoff.js';
import { saveLibraryEntry } from '../../catalog/userLibrary.js';
import { createAssetEngine } from '../engine/assetEngine.js';
import { App } from './App.jsx';

if (!window.__assetLabBooted) {
  window.__assetLabBooted = true;
  const reportBootError = (message) => {
    const error = String(message ?? 'Asset preview failed').slice(0, 160);
    document.body.dataset.modelReady = 'error';
    document.body.dataset.modelError = error;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'toonlab:asset-preview-state', state: 'error', error }, window.location.origin);
    }
  };
  const urlParams = new URLSearchParams(window.location.search);
  const boot = {
    asset: urlParams.get('asset'),
    backdrop: urlParams.get('backdrop') ?? 'studio',
    compare: urlParams.get('compare') === '1',
    kind: urlParams.get('kind') === 'texture' ? 'texture' : 'model',
    materialFamily: Object.values(GALLERY_MATERIAL_FAMILY).includes(
      urlParams.get('materialFamily'),
    )
      ? urlParams.get('materialFamily')
      : null,
    query: urlParams.get('q') ?? '',
    res: urlParams.get('res') ?? '1k',
    rockMaterialConfigUrl: urlParams.get('rockMaterialConfigUrl'),
    scanStylize: urlParams.get('scanStylize') !== '0',
    source: ['ambientcg', 'polypizza', 'kaykit', 'opensource3d'].includes(urlParams.get('source'))
      ? urlParams.get('source')
      : 'polyhaven',
    split: Number.parseFloat(urlParams.get('split')) || 0.5,
    style: urlParams.get('style') ?? 'default',
    // Direct GLB url (same-origin embedders, e.g. the pro Generate screen's
    // detail modal): bypasses every catalog and loads the model straight in.
    url: urlParams.get('url'),
  };
  const engine = createAssetEngine({ mount: document.getElementById('stage') });
  // Automation/embed hook: same-origin embedders (toonlab-pro asset pages)
  // and headless probes drive the wipe/backdrop live without the HUD.
  window.__assetLabEngine = engine;
  engine.setBackdrop(boot.backdrop);
  engine.setCompare(boot.compare); // headless probes get the wipe without the HUD
  engine.setSplit(boot.split);

  engine.start()
    .then(async () => {
      if (boot.url && boot.kind === 'model') {
        // Direct-url model (generated props): the engine's imported-ref path
        // fetches ref.download.url as-is — no proxy, no catalog lookup.
        const ref = {
          kind: 'model',
          source: 'imported',
          id: boot.asset ?? 'generated-prop',
          name: boot.asset ?? 'Generated prop',
          download: { url: boot.url },
        };
        let rockMaterialConfig = null;
        if (boot.rockMaterialConfigUrl) {
          const response = await fetch(boot.rockMaterialConfigUrl);
          if (!response.ok) {
            throw new Error(`Rock material config failed: ${response.status}`);
          }
          rockMaterialConfig = await response.json();
        }
        const result = await engine.show(ref, {
          materialFamily: boot.materialFamily,
          resolution: boot.res,
          rockMaterialConfig,
          scanStylize: boot.scanStylize,
          stylePreset: boot.style,
        });
        if (!result.ok && !result.stale) console.error('Asset Browser direct-url load failed:', result.error);
        if (result.ok) window.__assetLabShown = { ref, result };
        return;
      }
      if (!boot.asset) return;
      // headless path: load the requested asset even with the HUD hidden
      // headless probes bypass the registry enabled flags on purpose — this
      // IS the evaluation surface for unreviewed sources
      const refs = boot.source === 'ambientcg'
        ? await searchAmbientcg({ apiUrl: AMBIENTCG_PROXY_API, id: boot.asset })
        : boot.source === 'polypizza'
          ? [await fetchPolyPizzaModel(boot.asset, {
            apiKey: null,
            apiUrl: POLYPIZZA_PROXY_API,
          })].filter(Boolean)
          : boot.source === 'kaykit'
            ? await fetchKayKitIndex()
            : boot.source === 'opensource3d'
              ? await fetchOs3dIndex()
              : await fetchPolyhavenIndex({ type: boot.kind === 'texture' ? 'textures' : 'models' });
      const ref = refs.find((candidate) => candidate.id === boot.asset)
        ?? refs.find((candidate) => candidate.id.toLowerCase() === boot.asset.toLowerCase());
      if (!ref) {
        reportBootError(`Unknown asset "${boot.asset}".`);
        console.error(`Asset Browser: unknown asset "${boot.asset}".`);
        return;
      }
      const result = await engine.show(ref, {
        materialFamily: boot.materialFamily,
        resolution: boot.res,
        scanStylize: boot.scanStylize,
        stylePreset: boot.style,
      });
      if (!result.ok && !result.stale) console.error('Asset Browser auto-load failed:', result.error);
      if (result.ok) window.__assetLabShown = { ref, result };
    })
    .catch((error) => {
      console.error('Asset Browser failed to start:', error);
      reportBootError(error?.message ?? String(error));
    });

  // Embed hook: stage the loaded texture's diffuse for the Texture Lab
  // (same flow as the HUD's "Toonify in Texture Lab"); the embedder
  // navigates to the texture lab after this resolves true.
  window.__assetLabHandoffToTextureLab = async () => {
    const shown = window.__assetLabShown;
    if (!shown || shown.ref.kind !== 'texture') return false;
    try {
      let blob = null;
      if (shown.result.textureSet?.maps?.diffuse?.url) {
        blob = await (await fetch(shown.result.textureSet.maps.diffuse.url)).blob();
      } else if (shown.result.download?.url) {
        const response = await fetch(rewriteAmbientcgDownloadUrl(shown.result.download.url));
        const entries = await readZipEntries(await response.arrayBuffer());
        const color = entries.find((entry) => /_Color\.(jpg|png)$/i.test(entry.name));
        if (color) {
          blob = new Blob([color.data], {
            type: color.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
          });
        }
      }
      if (!blob) return false;
      const layer = await fileToTextureImage(new File([blob], `${shown.ref.id}.jpg`, { type: blob.type }));
      return setLabHandoff('texture-image', layer);
    } catch (error) {
      console.error('texture-lab handoff failed:', error);
      return false;
    }
  };

  // Embed hooks: retexture support for the pro model showcase pages.
  window.__assetLabListParts = () => engine.listParts();
  window.__assetLabRetexture = async ({ source, id, partIndex = null }) => {
    try {
      const ref = source === 'ambientcg'
        ? (await searchAmbientcg({ apiUrl: AMBIENTCG_PROXY_API, id }))[0]
        : { source: 'polyhaven', id, kind: 'texture' };
      if (!ref) return { error: 'texture not found', ok: false };
      return await engine.applyTexture(ref, { resolution: boot.res, partIndex });
    } catch (error) {
      return { error: error?.message ?? String(error), ok: false };
    }
  };

  // Embed hook: persist the loaded model as an imported-glb library entry
  // (the Catalog/Model Lab re-shades it through the active style set) and
  // return its id; the embedder then navigates to the Model Lab.
  window.__assetLabSaveToCatalog = async () => {
    const shown = window.__assetLabShown;
    if (!shown) return null;
    try {
      const entry = importedAssetCatalogEntry(shown.ref, {
        download: shown.result.download ?? null,
        textureSet: shown.result.textureSet ?? null,
      });
      await saveLibraryEntry(entry);
      return entry.id;
    } catch (error) {
      console.error('catalog handoff failed:', error);
      return null;
    }
  };

  if (urlParams.get('hud') === '0') {
    document.body.dataset.hideHud = 'true';
  } else {
    installRendererSwitcher();
    createRoot(document.getElementById('app')).render(<App boot={boot} engine={engine} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
