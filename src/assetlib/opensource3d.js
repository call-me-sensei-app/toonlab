// CC0 asset source: Open Source 3D Assets (opensource3dassets.com) — a
// keyless curated registry (github.com/ToxSam/open-source-3D-assets) built
// FOR asset browsers: static JSON with direct GLB urls, thumbnails, tags,
// and per-collection license metadata. ~991 models today, all from the
// Polygonal Mind CC0 collections (park/museum/sci-fi/vaporwave/medieval
// environment sets + creatures). The registry metadata itself is CC0 too.
//
// Everything is served from raw.githubusercontent.com (CORS `*`), so this
// client runs in the browser with no proxy and in Node unchanged.
//
// LICENSING: collections declare their license in projects.json; today all
// are CC0 but the registry accepts CC-BY submissions, so we filter to
// license === 'CC0' exactly — never assume.

export const OS3D_DATA_URL = 'https://raw.githubusercontent.com/ToxSam/open-source-3d-assets/main/data';

export const OS3D_SOURCE = Object.freeze({
  sourceLabel: 'Open Source 3D Assets',
  sourceUrl: 'https://opensource3dassets.com',
});

/**
 * Raw projects.json → CC0-only collection descriptors:
 *   { id, name, creator, description, license, assetDataFile, pageUrl }
 */
export function normalizeOs3dProjects(raw) {
  const projects = [];
  for (const project of raw ?? []) {
    if (!project?.id || !project.asset_data_file) continue;
    if (project.is_public === false) continue;
    if (project.license !== 'CC0') continue; // exact — future collections may be CC-BY
    projects.push({
      assetDataFile: project.asset_data_file,
      creator: project.creator_id ?? null,
      description: project.description ?? '',
      id: project.id,
      license: project.license,
      name: project.name ?? project.id,
      pageUrl: project.github_url ?? OS3D_SOURCE.sourceUrl,
    });
  }
  return projects;
}

/** metadata.attributes trait list → lowercase tag values. */
function attributeValues(asset) {
  return (asset?.metadata?.attributes ?? [])
    .map((attribute) => String(attribute?.value ?? '').toLowerCase())
    .filter(Boolean);
}

/**
 * One collection's assets/*.json + its project descriptor → normalized refs
 * (kind is always 'model'; download embedded like Poly Pizza's). Drafts,
 * non-public rows, and non-glTF formats are dropped.
 */
export function normalizeOs3dAssets(raw, project) {
  const refs = [];
  for (const asset of raw ?? []) {
    if (!asset?.id || !asset.model_file_url) continue;
    if (asset.is_public === false || asset.is_draft === true) continue;
    const format = String(asset.format ?? 'GLB').toLowerCase();
    if (format !== 'glb' && format !== 'gltf') continue;
    refs.push({
      attribution: { license: project.license, ...OS3D_SOURCE },
      authors: project.creator ? [project.creator] : [],
      categories: [String(project.name ?? project.id).toLowerCase()],
      download: {
        format,
        resources: {},
        sizeBytes: asset.metadata?.file_size ?? 0,
        url: asset.model_file_url,
      },
      id: asset.id,
      kind: 'model',
      name: asset.name ?? asset.id,
      pageUrl: project.pageUrl,
      source: 'opensource3d',
      tags: attributeValues(asset),
      thumbnailUrl: asset.thumbnail_url ?? null,
    });
  }
  return refs;
}

let indexCache = null;

/**
 * Full CC0 index (projects.json + every CC0 collection's asset file, fetched
 * in parallel), normalized and cached per session. A collection that fails
 * to fetch is skipped rather than blanking the browser; the projects.json
 * fetch itself failing throws.
 */
export function fetchOs3dIndex({ dataUrl = OS3D_DATA_URL, fetchImpl = fetch } = {}) {
  if (!indexCache) {
    indexCache = (async () => {
      const response = await fetchImpl(`${dataUrl}/projects.json`);
      if (!response.ok) throw new Error(`Open Source 3D Assets projects.json: ${response.status}`);
      const projects = normalizeOs3dProjects(await response.json());
      const settled = await Promise.allSettled(projects.map(async (project) => {
        const assetsResponse = await fetchImpl(`${dataUrl}/${project.assetDataFile}`);
        if (!assetsResponse.ok) throw new Error(`Open Source 3D Assets ${project.assetDataFile}: ${assetsResponse.status}`);
        return normalizeOs3dAssets(await assetsResponse.json(), project);
      }));
      return settled
        .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        .sort((a, b) => a.name.localeCompare(b.name));
    })();
    // a failed fetch must not poison the session cache
    indexCache.catch(() => { indexCache = null; });
  }
  return indexCache;
}
