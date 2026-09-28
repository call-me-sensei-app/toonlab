// /asset/?id=…&kind=… — the one asset-detail surface for Gallery and Library:
// full-bleed live stage, comparison wipe, floating stats panel. Public Gallery
// sources resolve from their catalog/API; src=library resolves the local entry
// and mounts editing/version controls into this same page.
//
// Textures/models render live through the same unlisted /asset-lab/ embed the
// Pro page iframes (engine contract: __assetLabEngine, body.dataset.modelReady,
// __assetLabHandoffToTextureLab, __assetLabRetexture). HDRIs aren't supported
// by that engine, so they show the source's tonemapped render instead.

import '../shared/siteHeader.js';
import { downloadPolyhavenAsset } from '../shared/polyhavenDownload.js';
import {
  fetchSmithsonianAsset,
  isSmithsonianGalleryReady,
} from '../../src/assetlib/smithsonian.js';
import { fetchPlateauBuildingIndex } from '../../src/assetlib/plateau.js';
import { findPlateauLandmark } from '../../src/assetlib/plateauLandmarks.js';
import { mountPlateauViewer } from '../../src/assetlib/plateauViewer.js';
import {
  resolveGalleryMaterialFamily,
} from '../../src/assetlib/galleryMaterialFamily.js';

const params = new URLSearchParams(window.location.search);
const requestedSource = params.get('src');
const assetSource = ['library', 'official', 'plateau', 'smithsonian'].includes(requestedSource)
  ? requestedSource
  : 'polyhaven';
const requestedId = params.get('id') ?? '';
const assetId = assetSource === 'library'
  ? requestedId.trim().slice(0, 512)
  : requestedId.replace(/[^a-z0-9_-]/gi, '');
let sourceLabel = assetSource === 'library'
  ? 'Your Library'
  : assetSource === 'official'
  ? 'ToonLab Official Catalog'
  : assetSource === 'smithsonian'
  ? 'Smithsonian 3D Open Access'
  : assetSource === 'plateau'
    ? 'Project PLATEAU'
    : 'Poly Haven';
let sourcePage = assetSource === 'library'
  ? '/library/'
  : assetSource === 'official'
  ? '/gallery/?src=official'
  : assetSource === 'smithsonian'
  ? 'https://3d.si.edu'
  : assetSource === 'plateau'
    ? 'https://www.mlit.go.jp/plateau/opendata/'
    : `https://polyhaven.com/a/${assetId}`;
const KIND_BY_TYPE = { 0: 'hdri', 1: 'texture', 2: 'model' };

const els = {
  stage: document.getElementById('assetStage'),
  wipe: document.getElementById('assetWipe'),
  controls: document.getElementById('assetControls'),
  stageLabel: document.getElementById('stageLabel'),
  crumbSource: document.getElementById('crumbSource'),
  name: document.getElementById('assetName'),
  stats: document.getElementById('assetStats'),
  actions: document.getElementById('assetActions'),
  desc: document.getElementById('assetDesc'),
  tags: document.getElementById('assetTags'),
  download: document.getElementById('assetDownload'),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function stat(key, value) {
  const row = el('div', 'asset-stat');
  const k = el('span', 'k');
  const ico = el('span', 'ico', '◆');
  ico.setAttribute('aria-hidden', 'true');
  k.append(ico, key);
  const v = el('span', 'v');
  if (value instanceof Node) v.appendChild(value);
  else v.textContent = value;
  row.append(k, v);
  return row;
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function renderNatureEvidence(provenance) {
  if (!provenance || typeof provenance !== 'object') return;

  const sourceUrl = validHttpsUrl(provenance.sourcePageUrl);
  const licenseUrl = validHttpsUrl(provenance.photoLicenseUrl);
  const imageUrl = provenance.publicImageStatus === 'approved'
    ? validHttpsUrl(provenance.image?.url)
    : '';
  const card = el('section', `asset-nature-evidence${imageUrl ? '' : ' asset-nature-evidence--metadata-only'}`);
  card.setAttribute('aria-label', 'Nature evidence');
  if (imageUrl) {
    const image = el('img', 'asset-nature-evidence__image');
    image.src = imageUrl;
    image.alt = provenance.title
      ? `Nature reference: ${provenance.title}`
      : 'Nature morphology reference';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    card.appendChild(image);
  }

  const copy = el('div', 'asset-nature-evidence__copy');
  copy.append(
    el('strong', 'asset-nature-evidence__label', 'Nature evidence'),
    el('span', 'asset-nature-evidence__relationship', 'Morphology reference — not a copied texture'),
  );
  const title = sourceUrl ? el('a', 'asset-nature-evidence__title') : el('span', 'asset-nature-evidence__title');
  title.textContent = String(provenance.title ?? 'Open nature source');
  if (sourceUrl) {
    title.href = sourceUrl;
    title.target = '_blank';
    title.rel = 'noreferrer';
  }
  copy.appendChild(title);

  const creditParts = [provenance.author, provenance.photoLicense].filter(Boolean).map(String);
  if (creditParts.length) {
    const credit = licenseUrl ? el('a', 'asset-nature-evidence__credit') : el('span', 'asset-nature-evidence__credit');
    credit.textContent = creditParts.join(' · ');
    if (licenseUrl) {
      credit.href = licenseUrl;
      credit.target = '_blank';
      credit.rel = 'noreferrer';
    }
    copy.appendChild(credit);
  }
  if (provenance.featureRationale) {
    copy.appendChild(el('p', 'asset-nature-evidence__rationale', String(provenance.featureRationale)));
  }
  card.appendChild(copy);
  els.actions.appendChild(card);
}

function fail(title, hint) {
  els.name.textContent = title;
  els.desc.textContent = hint;
  els.crumbSource.textContent = sourceLabel;
}

if (!assetId) {
  fail('Asset not found', 'This page needs an ?id= from the Gallery or Library.');
} else {
  boot().catch((error) => {
    console.error('Asset page failed:', error);
    fail(
      assetSource === 'library' ? 'Library asset unavailable' : 'Asset source unreachable',
      assetSource === 'library'
        ? error.message
        : `Could not reach the ${sourceLabel} API — check your connection and reload.`,
    );
  });
}

async function boot() {
  if (assetSource === 'library') {
    const { bootLibraryAsset } = await import('../library/assetExtension.js');
    await bootLibraryAsset({ assetId, el, els, setupEmbeddedStage, setupStage, stat });
    return;
  }
  if (assetSource === 'official') {
    await bootOfficial();
    return;
  }
  if (assetSource === 'plateau') {
    await bootPlateau();
    return;
  }
  if (assetSource === 'smithsonian') {
    await bootSmithsonian();
    return;
  }
  const res = await fetch(`/api/polyhaven/info/${assetId}`);
  if (!res.ok) {
    fail('Asset not found', `Poly Haven has no asset “${assetId}”.`);
    return;
  }
  const info = await res.json();
  const kind = ['texture', 'model', 'hdri'].includes(params.get('kind'))
    ? params.get('kind')
    : (KIND_BY_TYPE[info.type] ?? 'texture');
  const authors = Object.keys(info.authors ?? {});

  document.title = `${info.name} — ToonLab`;
  els.crumbSource.textContent = sourceLabel;
  els.name.textContent = info.name;

  // ----- stats (same rows as Pro, minus account-bound ratings) -----
  const sourceLink = el('a', null, `${sourceLabel} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  els.stats.append(stat('Source', sourceLink), stat('License', 'CC0 — free for any use'), stat('Type', kind));
  if (authors.length) els.stats.append(stat('Created by', authors.join(', ')));
  const resPx = info.max_resolution ?? info.dimensions;
  if (Array.isArray(resPx) && kind !== 'model') {
    els.stats.append(stat('Max resolution', resPx.map((n) => Number(n).toLocaleString()).join(' × ')));
  }
  els.stats.append(stat('Source downloads', Number(info.download_count ?? 0).toLocaleString()));

  els.desc.textContent = `${info.name} by ${authors.join(', ') || sourceLabel} on ${sourceLabel}. Attribution isn't required by CC0 — the makers earn it anyway.`;

  for (const tag of [...(info.tags ?? []), ...(info.categories ?? [])].slice(0, 10)) {
    const a = el('a', null, tag);
    a.href = `/gallery/?q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(a);
  }

  setupDownload(kind);

  if (kind === 'hdri') {
    // No live engine for HDRIs — show the source's tonemapped render.
    els.stage.style.backgroundImage = `url("https://cdn.polyhaven.com/asset_img/primary/${assetId}.png?width=1600")`;
    return;
  }
  setupStage(kind, null, {
    materialFamily: resolveGalleryMaterialFamily({
      categories: info.categories,
      id: assetId,
      kind,
      name: info.name,
      source: 'polyhaven',
      tags: info.tags,
    }),
  });
}

function humanBytes(value) {
  if (value == null) return 'External delivery';
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function browserCompatibleSkyFile(file) {
  const path = file.relative_path.toLowerCase();
  return file.compatibility?.skyCloudLab === true
    || /\.(png|jpe?g|webp|hdr|exr)$/i.test(path);
}

function browserCompatibleModelFile(file) {
  const path = String(file?.relative_path ?? '').toLowerCase();
  const contentType = String(file?.content_type ?? '').toLowerCase();
  return /\.(glb|gltf)$/i.test(path)
    || contentType === 'model/gltf-binary'
    || contentType === 'model/gltf+json';
}

function contentTypeForUrl(url) {
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = String(url ?? '').toLowerCase();
  }
  if (path.endsWith('.glb')) return 'model/gltf-binary';
  if (path.endsWith('.gltf')) return 'model/gltf+json';
  if (path.endsWith('.png')) return 'image/png';
  if (/\.jpe?g$/.test(path)) return 'image/jpeg';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.hdr')) return 'image/vnd.radiance';
  if (path.endsWith('.exr')) return 'image/x-exr';
  if (path.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

function externalMetadataFiles(asset) {
  if (asset.redistribution_scope !== 'external-only') return [];
  const output = [];
  const add = (relativePath, value, kind) => {
    const url = typeof value === 'string' ? value : value?.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) return;
    output.push({
      asset_id: asset.id,
      byte_size: Number(value?.sizeBytes ?? 0) || null,
      compatibility: {},
      content_type: contentTypeForUrl(url),
      download_url: url,
      kind,
      relative_path: relativePath,
    });
  };
  if (asset.download_url) {
    let fileName = 'original-download';
    try {
      fileName = decodeURIComponent(new URL(asset.download_url).pathname.split('/').filter(Boolean).pop()) || fileName;
    } catch { /* The seed verifier already rejects invalid public URLs. */ }
    add(fileName, asset.download_url, 'primary');
  }
  for (const [slot, file] of Object.entries(asset.metadata?.textureFiles ?? {})) {
    let extension = '';
    try { extension = new URL(file?.url).pathname.match(/\.[a-z0-9]+$/i)?.[0] ?? ''; } catch { /* no file */ }
    add(`${slot}${extension}`, file, 'texture');
  }
  for (const [relativePath, file] of Object.entries(asset.metadata?.modelResources ?? {})) {
    add(relativePath, file, 'dependency');
  }
  return [...new Map(output.map((file) => [file.download_url, file])).values()];
}

function officialModelUrl(asset) {
  if (asset.kind !== 'model' || asset.availability_status !== 'active') return null;
  if (asset.download_url && browserCompatibleModelFile({
    content_type: asset.content_type,
    relative_path: asset.download_url,
  })) {
    return asset.download_url;
  }
  return (asset.files ?? []).find((file) =>
    file.download_url && browserCompatibleModelFile(file))?.download_url ?? null;
}

async function bootOfficial() {
  const response = await fetch(`/api/toonlab/catalog/${encodeURIComponent(assetId)}`);
  if (!response.ok) {
    fail('Catalog asset not found', `The official catalog has no asset “${assetId}”.`);
    return;
  }
  const { asset } = await response.json();
  const packFiles = [...(asset.files ?? []), ...externalMetadataFiles(asset)];
  sourcePage = asset.source_url || '/gallery/?src=official';
  document.title = `${asset.name} — ToonLab`;
  els.crumbSource.textContent = asset.source || sourceLabel;
  els.name.textContent = asset.name;
  const modelUrl = officialModelUrl(asset);
  if (asset.kind === 'tree-recipe' && asset.availability_status === 'active') {
    const recipeResponse = await fetch(asset.download_url);
    if (!recipeResponse.ok) throw new Error(`Tree recipe download failed: HTTP ${recipeResponse.status}`);
    const { validateTreeRecipeDocument } = await import('../../src/vegetation/experimental.js');
    const recipe = validateTreeRecipeDocument(await recipeResponse.json());
    if (!recipe.ok) throw new Error(`Invalid tree recipe: ${recipe.errors.join(' ')}`);
    const labUrl = `/tree-lab/?recipe=${encodeURIComponent(JSON.stringify(recipe.value))}`;
    setupEmbeddedStage({ kind: 'tree-recipe', labUrl, thumbnailUrl: asset.thumbnail_url });
    const openLab = el('a', 'pill', 'Open Tree Lab');
    openLab.href = labUrl;
    els.actions.appendChild(openLab);
  } else if (modelUrl) {
    const rockMaterialConfigUrl = asset.source === 'toonlab-rock'
      ? packFiles.find((file) => file.relative_path === 'material-config.json')?.download_url ?? null
      : null;
    setupStage('model', {
      download: { url: modelUrl },
      thumbnailUrl: asset.thumbnail_url,
    }, {
      materialFamily: resolveGalleryMaterialFamily({
        ...asset,
        materialFamily: asset.source === 'toonlab-rock' ? 'environment' : undefined,
      }),
      rockMaterialConfigUrl,
      scanStylize: false,
    });
  } else {
    if (asset.thumbnail_url) {
      els.stage.style.backgroundImage = `url("${asset.thumbnail_url.replace(/"/g, '%22')}")`;
    }
    els.stage.classList.add('asset-stage--pack');
  }
  const sourceLink = el('a', null, `${asset.source || 'Upstream source'} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  const licenseLink = el('a', null, `${asset.license} ↗`);
  licenseLink.href = asset.license_url || sourcePage;
  licenseLink.target = '_blank';
  licenseLink.rel = 'noreferrer';
  els.stats.append(
    stat('Source', sourceLink),
    stat('License', licenseLink),
    stat('Type', asset.kind),
    stat('Release', asset.release),
    stat('Original archive', humanBytes(asset.byte_size)),
    stat('Formats', [...new Set(packFiles.map((file) => file.relative_path.split('.').pop()?.toUpperCase()).filter(Boolean))].join(' · ') || asset.content_type || 'External'),
    stat('Availability', asset.availability_status),
  );
  if (asset.attribution_required) {
    els.stats.append(stat('Credit', 'Required'));
  }
  renderNatureEvidence(asset.metadata?.natureProvenance);
  els.desc.textContent = [asset.description, asset.attribution].filter(Boolean).join(' ');
  for (const tag of (asset.tags ?? []).filter((value) => typeof value === 'string' && value.trim())) {
    const link = el('a', null, tag);
    link.href = `/gallery/?src=official&q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(link);
  }

  if (asset.availability_status === 'active' && asset.download_url) {
    els.download.textContent = asset.redistribution_scope === 'external-only'
      ? 'Open original download ↗'
      : 'Download original ↓';
    els.download.href = asset.download_url;
    if (asset.redistribution_scope === 'external-only') {
      els.download.target = '_blank';
      els.download.rel = 'noreferrer';
    } else {
      els.download.download = '';
    }
    els.download.hidden = false;
  } else {
    const warning = el('p', 'asset-pack-warning',
      `Downloads withdrawn${asset.withdrawal_reason ? `: ${asset.withdrawal_reason}` : '.'}`);
    els.actions.appendChild(warning);
  }

  const compatibleFiles = packFiles.filter(browserCompatibleSkyFile);
  if (asset.kind === 'skybox' && compatibleFiles.length > 0 && asset.availability_status === 'active') {
    const openLab = el('a', 'pill', 'Open Sky Shader Lab');
    openLab.href = '/sky-lab/?tab=preview';
    els.actions.appendChild(openLab);
  }

  const pack = el('section', 'asset-pack-files');
  const heading = el('div', 'asset-pack-files__heading');
  heading.append(el('strong', null, 'Files in this pack'), el('span', null, `${packFiles.length} files`));
  const search = el('input', 'asset-pack-files__search');
  search.type = 'search';
  search.placeholder = 'Search paths and formats…';
  const list = el('div', 'asset-pack-files__list');
  const renderFiles = () => {
    const query = search.value.trim().toLowerCase();
    const files = packFiles.filter((file) =>
      `${file.relative_path} ${file.content_type}`.toLowerCase().includes(query));
    list.replaceChildren(...files.map((file) => {
      const row = el('div', 'asset-pack-file');
      const name = el('span', 'asset-pack-file__name', file.relative_path);
      const meta = el('span', 'asset-pack-file__meta', `${file.content_type} · ${humanBytes(file.byte_size)}`);
      const action = file.download_url && asset.availability_status === 'active'
        ? el('a', 'asset-pack-file__download', 'Download')
        : el('span', 'asset-pack-file__unavailable', 'Unavailable');
      if (action.tagName === 'A') {
        action.href = file.download_url;
        action.download = '';
      }
      if (!browserCompatibleSkyFile(file)) action.title = 'Discoverable download; browser import is not claimed for this format.';
      row.append(name, meta, action);
      return row;
    }));
  };
  search.addEventListener('input', renderFiles);
  renderFiles();
  pack.append(heading, search, list);
  els.actions.appendChild(pack);
  document.body.dataset.officialAssetReady = 'true';
}

async function bootSmithsonian() {
  const ref = await fetchSmithsonianAsset(assetId);
  if (!ref || !isSmithsonianGalleryReady(ref)) {
    fail('Asset not found', `Smithsonian 3D has no gallery-ready asset “${assetId}”.`);
    return;
  }
  sourcePage = ref.pageUrl;
  document.title = `${ref.name} — ToonLab`;
  els.crumbSource.textContent = sourceLabel;
  els.name.textContent = ref.name;

  const sourceLink = el('a', null, `${sourceLabel} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  els.stats.append(
    stat('Source', sourceLink),
    stat('License', 'CC0 — free for any use'),
    stat('Type', 'model'),
    stat('Format', 'GLB · browser-ready'),
  );
  els.desc.textContent = `${ref.name} from Smithsonian 3D Open Access, previewed live in ToonLab. Attribution isn't required by CC0; the source link preserves the museum record and context.`;
  for (const tag of [...ref.tags, ...ref.categories].slice(0, 10)) {
    const a = el('a', null, tag);
    a.href = `/gallery/?src=smithsonian&q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(a);
  }
  setupDownload('model', ref.download);
  setupStage('model', ref, {
    materialFamily: resolveGalleryMaterialFamily(ref),
  });
}

async function bootPlateau() {
  const landmark = findPlateauLandmark(assetId);
  if (landmark) {
    bootPlateauLandmark(landmark);
    return;
  }
  const refs = await fetchPlateauBuildingIndex();
  const ref = refs.find((candidate) => candidate.id === assetId);
  if (!ref) {
    fail('City model not found', `Project PLATEAU has no current building dataset “${assetId}”.`);
    return;
  }

  sourcePage = ref.pageUrl;
  document.title = `${ref.name} — ToonLab`;
  els.crumbSource.textContent = sourceLabel;
  els.name.textContent = ref.name;

  const sourceLink = el('a', null, `${sourceLabel} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  const place = [
    ref.metadata.prefecture,
    ref.metadata.city,
    ref.metadata.ward,
  ].filter(Boolean).join(' · ');
  els.stats.append(
    stat('Source', sourceLink),
    stat('License', `${ref.attribution.license} — attribution required`),
    stat('Type', '3D city model'),
    stat('Location', place),
    stat('Detail', `LOD${ref.metadata.lod}${ref.metadata.textured ? ' · textured' : ''}`),
    stat('Survey year', ref.metadata.dataYear ?? 'latest'),
    stat('Format', `3D Tiles ${ref.metadata.formatVersion ?? ''}`.trim()),
  );

  els.desc.textContent =
    `${ref.attribution.text}. The official Japanese building model streams live here in ToonLab; ` +
    'the CityGML source and government provenance remain attached.';
  for (const tag of [...ref.tags, ...ref.categories].slice(0, 10)) {
    const a = el('a', null, tag);
    a.href = `/gallery/?src=plateau&q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(a);
  }

  if (ref.citygml?.url) {
    const citygml = el('a', 'pill', 'Download source CityGML');
    citygml.href = ref.citygml.url;
    citygml.target = '_blank';
    citygml.rel = 'noreferrer';
    els.actions.appendChild(citygml);
  }

  els.download.textContent = 'Open official 3D Tiles ↗';
  els.download.href = ref.download.url;
  els.download.target = '_blank';
  els.download.rel = 'noreferrer';
  els.download.hidden = false;
  setupPlateauStage(ref);
}

function bootPlateauLandmark(ref) {
  sourcePage = ref.pageUrl;
  document.title = `${ref.name} — ToonLab`;
  els.crumbSource.textContent = sourceLabel;
  els.name.textContent = ref.name;

  const sourceLink = el('a', null, `${sourceLabel} ↗`);
  sourceLink.href = sourcePage;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noreferrer';
  const featureLink = el('a', null, ref.metadata.buildingId);
  featureLink.href = ref.citygml.url;
  featureLink.target = '_blank';
  featureLink.rel = 'noreferrer';
  els.stats.append(
    stat('Source', sourceLink),
    stat('License', `${ref.attribution.license} — attribution required`),
    stat('Type', 'Isolated landmark mesh'),
    stat('Location', `${ref.metadata.prefecture} · ${ref.metadata.city}`),
    stat('Height', `${ref.metadata.measuredHeight.toLocaleString()} m`),
    stat('Format', 'GLB · local Y-up metres'),
    stat('PLATEAU feature', featureLink),
  );

  els.desc.textContent =
    `${ref.attribution.text}. ToonLab extracted only ${ref.metadata.nameJa} from its official ` +
    'LOD3 building tile, removed every neighboring feature, and re-centered the result for normal 3D tools.';
  for (const tag of [...ref.tags, ...ref.categories].slice(0, 10)) {
    const a = el('a', null, tag);
    a.href = `/gallery/?src=plateau&q=${encodeURIComponent(tag)}`;
    els.tags.appendChild(a);
  }

  const citygml = el('a', 'pill', 'Open source CityGML feature');
  citygml.href = ref.citygml.url;
  citygml.target = '_blank';
  citygml.rel = 'noreferrer';
  els.actions.appendChild(citygml);

  els.download.textContent = 'Download Tokyo Tower GLB ↓';
  els.download.href = ref.download.url;
  els.download.download = `${ref.id}.glb`;
  els.download.hidden = false;
  setupStage('model', ref, {
    materialFamily: resolveGalleryMaterialFamily(ref),
  });
}

function setupPlateauStage(ref) {
  els.stage.classList.add('asset-stage--plateau');
  els.stageLabel.hidden = false;
  els.stageLabel.innerHTML =
    'Live official Japanese city model · <b>drag to orbit</b> · scroll to zoom · PDL attribution retained';

  let viewer = null;
  const loading = el('div', 'asset-loading');
  const spinner = el('span', 'gal-spinner');
  const loadingText = el('span', null, 'Streaming official PLATEAU building tiles…');
  spinner.setAttribute('aria-hidden', 'true');
  loading.append(spinner, loadingText);

  const errorBox = el('div', 'asset-loading asset-loading--error');
  const errorText = el('span');
  const sourceOut = el('a', null, 'open the official tileset ↗');
  sourceOut.href = ref.download.url;
  sourceOut.target = '_blank';
  sourceOut.rel = 'noreferrer';
  const retry = el('button', null, 'Retry viewer');
  retry.type = 'button';
  errorBox.append(errorText, sourceOut, retry);

  function start() {
    viewer?.dispose();
    els.stage.querySelectorAll('.plateau-viewer-canvas').forEach((node) => node.remove());
    errorBox.remove();
    els.stage.appendChild(loading);
    document.body.dataset.plateauReady = 'loading';
    viewer = mountPlateauViewer(els.stage, {
      tilesetUrl: ref.download.url,
      onProgress(progress) {
        if (progress > 0 && progress < 1) {
          loadingText.textContent = `Streaming official PLATEAU building tiles… ${Math.round(progress * 100)}%`;
        }
      },
      onReady() {
        loading.remove();
        document.body.dataset.plateauReady = 'true';
      },
      onError(error) {
        loading.remove();
        document.body.dataset.plateauReady = 'error';
        errorText.textContent = `The live city tiles could not load (${error.message.slice(0, 140)}) — `;
        if (!errorBox.isConnected) els.stage.appendChild(errorBox);
      },
    });
  }
  retry.addEventListener('click', start);
  window.addEventListener('pagehide', () => viewer?.dispose(), { once: true });
  start();
}

// ----- live stage (texture/model): same embed contract as the Pro page -----

function setupStage(kind, directRef = null, {
  materialFamily = resolveGalleryMaterialFamily({
    id: assetId,
    kind,
    source: assetSource,
  }),
  rockMaterialConfigUrl = null,
  scanStylize = true,
} = {}) {
  const labUrl = directRef
    ? `/asset-lab/?url=${encodeURIComponent(directRef.download.url)}&asset=${encodeURIComponent(assetId)}&kind=${encodeURIComponent(kind)}&style=call_me_sensei`
    : `/asset-lab/?source=polyhaven&asset=${encodeURIComponent(assetId)}&kind=${kind}&style=call_me_sensei`;
  const stageThumb = directRef?.thumbnailUrl
    ?? `https://cdn.polyhaven.com/asset_img/thumbs/${assetId}.png?width=1280&height=960`;
  const rockMaterialParam = rockMaterialConfigUrl
    ? `&rockMaterialConfigUrl=${encodeURIComponent(rockMaterialConfigUrl)}`
    : '';
  setupEmbeddedStage({
    assetLabControls: true,
    kind,
    labUrl: `${labUrl}&materialFamily=${encodeURIComponent(materialFamily)}&scanStylize=${scanStylize ? '1' : '0'}${rockMaterialParam}`,
    supportsCompare: true,
    thumbnailUrl: stageThumb,
  });
}

// The single Gallery/Library preview mount. Sources only provide the embed
// URL and metadata; loading, retry, comparison wipe and stage chrome stay here.
function setupEmbeddedStage({
  assetLabControls = false,
  kind,
  labUrl,
  supportsCompare = false,
  thumbnailUrl = null,
}) {
  if (thumbnailUrl) {
    els.stage.style.backgroundImage = `url("${String(thumbnailUrl).replace(/"/g, '%22')}")`;
  }

  const frame = document.createElement('iframe');
  const separator = labUrl.includes('?') ? '&' : '?';
  frame.src = `${labUrl}${separator}hud=0&embed=1&compare=${supportsCompare ? '1' : '0'}&split=0.2`;
  frame.title = `${assetId} — source vs Call Me Sensei style, live`;
  frame.allow = 'fullscreen';
  els.stage.appendChild(frame);
  let frameLoaded = false;

  const engine = () => frame.contentWindow?.__assetLabEngine;
  const frameWin = () => frame.contentWindow;

  // Loading overlay tracks EVERY in-flight show via the automation contract.
  const loading = el('div', 'asset-loading');
  const spinner = el('span', 'gal-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  loading.append(spinner, el('span', null, `Loading ${kind} — downloading & applying Call Me Sensei style…`));
  els.stage.appendChild(loading);
  frame.addEventListener('load', () => {
    frameLoaded = true;
  });

  const errorBox = el('div', 'asset-loading asset-loading--error');
  const errorText = el('span');
  const sourceOut = el('a', null, `view it on ${sourceLabel} ↗`);
  sourceOut.href = sourcePage;
  sourceOut.target = '_blank';
  sourceOut.rel = 'noreferrer';
  const retry = el('button', null, 'Retry preview');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    errorBox.remove();
    els.stage.appendChild(loading);
    frame.contentWindow?.location.reload();
  });
  errorBox.append(errorText, sourceOut, retry);

  setInterval(() => {
    let ready;
    let message = '';
    try {
      const dataset = frame.contentDocument?.body?.dataset;
      ready = dataset?.modelReady;
      message = (dataset?.modelError ?? '').slice(0, 160);
      if (!message) message = (dataset?.runtimeError ?? '').slice(0, 160);
      if (!assetLabControls && frameLoaded && frame.contentDocument?.querySelector('canvas')) {
        ready = 'true';
      }
    } catch {
      return; // iframe not ready yet
    }
    if (ready === 'true') {
      loading.remove();
      errorBox.remove();
    } else if (ready === 'error') {
      loading.remove();
      errorText.textContent = `Live preview couldn't load this asset${message ? ` (${message})` : ''} — `;
      if (!errorBox.isConnected) els.stage.appendChild(errorBox);
    } else if (assetLabControls && !errorBox.isConnected && !loading.isConnected) {
      els.stage.appendChild(loading); // style/res switch kicked off a new load
    }
  }, 300);

  if (supportsCompare) {
    // Wipe: styled view dominates; the handle drives the embedded engine live.
    let split = 0.2;
    els.wipe.hidden = false;
    els.wipe.style.left = `${split * 100}%`;
    const dragSplit = (clientX) => {
      const rect = els.stage.getBoundingClientRect();
      if (rect.width === 0) return;
      split = Math.min(0.95, Math.max(0.02, (clientX - rect.left) / rect.width));
      els.wipe.style.left = `${split * 100}%`;
      els.wipe.setAttribute('aria-valuenow', String(Math.round(split * 100)));
      engine()?.setSplit(split);
    };
    els.wipe.addEventListener('pointerdown', (e) => {
      els.wipe.setPointerCapture(e.pointerId);
      dragSplit(e.clientX);
    });
    els.wipe.addEventListener('pointermove', (e) => {
      if (e.buttons > 0) dragSplit(e.clientX);
    });
    els.wipe.addEventListener('keydown', (e) => {
      const rect = els.stage.getBoundingClientRect();
      if (e.key === 'ArrowLeft') dragSplit(rect.left + (split - 0.05) * rect.width);
      if (e.key === 'ArrowRight') dragSplit(rect.left + (split + 0.05) * rect.width);
    });
  }

  els.stageLabel.hidden = false;
  els.stageLabel.innerHTML = supportsCompare
    ? 'Live on your GPU — left <b>source</b> · right <b>Call Me Sensei</b> · drag to orbit'
    : 'Live on your GPU · drag to orbit';

  if (assetLabControls && kind === 'texture') {
    setupTextureControls(engine);
    setupTextureLabHandoff(frameWin, labUrl);
  } else if (assetLabControls && kind === 'model') {
    setupRetexture(frameWin);
  }
}

// Bottom controls — textures only (models are pure orbit): 3D shapes, or the
// 2D raw-map inspector.
function setupTextureControls(engine) {
  els.controls.hidden = false;
  els.controls.classList.add('tl-control-row');
  const modeButtons = new Map();
  const shapeButtons = new Map();
  let shapesWrap;
  let channelSelect;

  const setMode = (mode) => {
    for (const [m, b] of modeButtons) b.classList.toggle('on', m === mode);
    engine()?.setViewMode(mode);
    if (mode === '2d') {
      engine()?.setTextureShape('plane');
      channelSelect.value = 'lit';
    }
    shapesWrap.style.display = mode === '3d' ? '' : 'none';
    channelSelect.style.display = mode === '2d' ? '' : 'none';
    if (mode === '2d') engine()?.setMapChannel('lit');
  };

  for (const mode of ['3d', '2d']) {
    const b = el('button', mode === '3d' ? 'on' : '', mode.toUpperCase());
    b.type = 'button';
    b.addEventListener('click', () => setMode(mode));
    modeButtons.set(mode, b);
    els.controls.appendChild(b);
  }
  const div = el('span', 'div');
  div.setAttribute('aria-hidden', 'true');
  els.controls.appendChild(div);

  shapesWrap = el('span');
  shapesWrap.style.display = 'contents';
  for (const [id, label] of [
    ['duo', '◐ Both'], ['sphere', '● Sphere'], ['cube', '■ Cube'], ['cylinder', '▮ Cylinder'],
    ['torus', '◯ Torus'], ['knot', '✾ Knot'], ['plane', '▬ Flat'],
  ]) {
    const b = el('button', id === 'duo' ? 'on' : '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      for (const [s, btn] of shapeButtons) btn.classList.toggle('on', s === id);
      engine()?.setTextureShape(id);
    });
    shapeButtons.set(id, b);
    shapesWrap.appendChild(b);
  }
  els.controls.appendChild(shapesWrap);

  channelSelect = document.createElement('select');
  channelSelect.className = 'channel';
  channelSelect.setAttribute('aria-label', 'Texture map channel');
  for (const [value, label] of [
    ['lit', 'Lit material'], ['albedo', 'Albedo'], ['height', 'Height'], ['normal', 'Normal'],
    ['roughness', 'Roughness'], ['metalness', 'Metalness'], ['occlusion', 'Occlusion'], ['emissive', 'Emissive'],
  ]) {
    channelSelect.appendChild(new Option(label, value));
  }
  channelSelect.style.display = 'none';
  channelSelect.addEventListener('change', () => engine()?.setMapChannel(channelSelect.value));
  els.controls.appendChild(channelSelect);
}

function setupTextureLabHandoff(frameWin, labUrl) {
  const pill = el('button', 'pill', 'Edit in Texture Lab');
  pill.type = 'button';
  pill.addEventListener('click', async () => {
    // Stage the diffuse via the embedded lab, then jump to the Texture Lab
    // with it imported (same-origin sessionStorage handoff).
    pill.disabled = true;
    pill.textContent = 'Preparing texture…';
    const ok = await frameWin()?.__assetLabHandoffToTextureLab?.().catch(() => false);
    pill.disabled = false;
    pill.textContent = 'Edit in Texture Lab';
    if (ok) window.location.href = '/texture-lab/?importImage=1';
    else window.location.href = labUrl; // fallback: the full browser, HUD on
  });
  els.actions.appendChild(pill);
}

// Retexture — models only, free and client-side: rebind any Poly Haven
// texture onto the model (or one part), re-shaded through the style set.
// Search runs against the same public index the gallery uses.
function setupRetexture(frameWin) {
  const wrap = el('div', 'retex');
  const head = el('div', 'retex-head', 'Retexture');
  const partSelect = document.createElement('select');
  partSelect.className = 'retex-part';
  partSelect.appendChild(new Option('All parts', 'all'));
  let partsLoaded = false;
  partSelect.addEventListener('focus', () => {
    if (partsLoaded) return;
    const parts = frameWin()?.__assetLabListParts?.() ?? [];
    if (parts.length === 0) return;
    partsLoaded = true;
    parts.forEach((name, i) => partSelect.appendChild(new Option(name, String(i))));
  });
  head.appendChild(partSelect);

  const search = document.createElement('input');
  search.className = 'retex-search';
  search.placeholder = 'Search textures — wood, brick, moss…';
  const results = el('div', 'retex-results');
  const errorLine = el('div', 'retex-error');
  errorLine.hidden = true;

  let index = null;
  async function textureIndex() {
    if (!index) {
      const res = await fetch('/api/polyhaven/assets?type=textures');
      if (!res.ok) throw new Error(`polyhaven textures → HTTP ${res.status}`);
      index = Object.entries(await res.json())
        .map(([id, a]) => ({
          id,
          name: a.name ?? id,
          popularity: a.download_count ?? 0,
          haystack: [a.name ?? '', id, ...(a.tags ?? []), ...(a.categories ?? [])].join(' ').toLowerCase(),
        }))
        .sort((a, b) => b.popularity - a.popularity);
    }
    return index;
  }

  let busyId = null;
  async function renderResults(query) {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (await textureIndex())
      .filter((t) => terms.every((term) => t.haystack.includes(term)))
      .slice(0, 8);
    results.replaceChildren(...matches.map((t) => {
      const b = el('button');
      b.type = 'button';
      b.title = t.name;
      b.style.backgroundImage = `url("https://cdn.polyhaven.com/asset_img/thumbs/${t.id}.png?width=256&height=256")`;
      b.appendChild(el('span', null, t.name));
      b.addEventListener('click', async () => {
        if (busyId) return;
        busyId = t.id;
        b.classList.add('busy');
        errorLine.hidden = true;
        const partIndex = partSelect.value === 'all' ? null : Number(partSelect.value);
        const result = await frameWin()
          ?.__assetLabRetexture?.({ source: 'polyhaven', id: t.id, partIndex })
          .catch((e) => ({ ok: false, error: e.message }));
        busyId = null;
        b.classList.remove('busy');
        if (!result?.ok) {
          errorLine.textContent = result?.error ?? 'Retexture failed — is the model loaded yet?';
          errorLine.hidden = false;
        }
      });
      return b;
    }));
  }

  let timer = null;
  search.addEventListener('focus', () => {
    if (results.childElementCount === 0) renderResults(search.value).catch(() => {});
  });
  search.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => renderResults(search.value).catch(() => {}), 250);
  });

  wrap.append(head, search, results, errorLine);
  els.actions.appendChild(wrap);
}

// ----- download CTA — no account, fetched straight off the source CDN and
// saved directly (multi-file sets are zipped in the browser) -----

function setupDownload(kind, directDownload = null) {
  const idle = `Download ${kind} ↓`;
  els.download.textContent = idle;
  // Real href kept for middle-click/copy-link; plain clicks download in place.
  els.download.href = directDownload?.url ?? sourcePage;
  els.download.target = '_blank';
  els.download.rel = 'noreferrer';
  els.download.hidden = false;
  let busy = false;
  els.download.addEventListener('click', async (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      if (directDownload?.url) {
        els.download.textContent = 'Downloading…';
        const response = await fetch(directDownload.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `${els.name.textContent.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || assetId}.glb`;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        await downloadPolyhavenAsset({
          id: assetId,
          kind,
          onProgress: (done, total, phase) => {
            els.download.textContent = phase === 'pack' ? 'Packing zip…' : `Downloading ${done}/${total}…`;
          },
        });
      }
    } catch (error) {
      console.error('Direct download failed:', error);
      window.open(sourcePage, '_blank', 'noopener'); // fallback: source's picker
    }
    els.download.textContent = idle;
    busy = false;
  });
}
