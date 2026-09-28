// Imported third-party assets → catalog entries. The catalog manifest froze
// kind 'imported-glb' for exactly this: the entry's recipe carries everything
// needed to re-download and re-shade the asset (source, id, urls, attribution),
// so a library-saved import browses next to procedural entries and survives
// reloads via the same IndexedDB user library.

import { createCatalogEntry } from '../catalog/manifest.js';
import { slugifyAssetId } from './assetRef.js';

export const IMPORTED_ENTRY_CLUSTER = 'assetlib';

/**
 * Normalized ref (+ the resolved download) → validated catalog entry.
 * For models pass `download` (resolvePolyhavenModelDownload result); for
 * texture sets pass `textureSet` (resolvePolyhavenTextureDownload result).
 */
export function importedAssetCatalogEntry(ref, { download = null, textureSet = null } = {}) {
  if (!ref?.source || !ref?.id) throw new Error('importedAssetCatalogEntry: ref with source and id required.');
  const recipe = {
    assetId: ref.id,
    attribution: { ...ref.attribution, authors: ref.authors ?? [] },
    kind: ref.kind,
    pageUrl: ref.pageUrl,
    source: ref.source,
  };
  if (download) recipe.download = download;
  if (textureSet) recipe.textureSet = textureSet;
  const resolution = download?.resolution ?? download?.attribute ?? textureSet?.resolution ?? null;
  return createCatalogEntry({
    cluster: IMPORTED_ENTRY_CLUSTER,
    description: `${ref.attribution.sourceLabel} · CC0${ref.authors?.length ? ` · by ${ref.authors.join(', ')}` : ''}${resolution ? ` · ${resolution}` : ''}`,
    id: `imported/${ref.source}/${slugifyAssetId(ref.id)}`,
    kind: 'imported-glb',
    label: ref.name,
    recipe,
    spawn: "import { loadImportedAsset } from '@call-me-sensei/toonlab/assetlib'; const { object3D } = await loadImportedAsset(entry.recipe);",
    tags: ['imported', ref.source, ref.kind, ...(ref.categories ?? [])],
    thumbnail: ref.thumbnailUrl ?? null,
  });
}
