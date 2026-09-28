// Gallery metadata comes from the local Postgres catalog. Versioned seed rows
// freeze the reviewed identity, license, attribution, and delivery URL without
// requiring a third-party metadata API at browse time.

import '../shared/siteHeader.js';
import {
  OPEN_GALLERY_SOURCE_LABELS,
  TOONLAB_GALLERY_SOURCE_LABELS,
} from './catalogContract.js';

const PAGE_SIZE = 36;

const SOURCE_LABELS = Object.freeze({
  ...OPEN_GALLERY_SOURCE_LABELS,
  ...TOONLAB_GALLERY_SOURCE_LABELS,
});

function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? source;
}

const els = {
  grid: document.getElementById('galGrid'),
  empty: document.getElementById('galEmpty'),
  emptyTitle: document.getElementById('galEmptyTitle'),
  emptyHint: document.getElementById('galEmptyHint'),
  status: document.getElementById('galStatus'),
  pager: document.getElementById('galPager'),
  pagerStatus: document.getElementById('galPagerStatus'),
  prev: document.getElementById('galPrev'),
  next: document.getElementById('galNext'),
  form: document.getElementById('galFilters'),
  search: document.getElementById('galSearch'),
  source: document.getElementById('galSource'),
  license: document.getElementById('galLicense'),
  type: document.getElementById('galType'),
  size: document.getElementById('galSize'),
};

const state = { q: '', src: '', license: '', type: '', size: '', page: 1 };

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  state.q = params.get('q') ?? '';
  state.src = params.get('src') ?? '';
  state.license = params.get('license') ?? '';
  state.type = ['texture', 'model', 'hdri', 'vfx', 'tree-recipe'].includes(params.get('type')) ? params.get('type') : '';
  state.size = ['small', 'medium', 'large'].includes(params.get('size')) ? params.get('size') : '';
  if (state.src !== 'toonlab-rock') state.size = '';
  state.page = Math.max(1, Number(params.get('page')) || 1);
}

function urlFor(overrides = {}) {
  const merged = { ...state, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.src) params.set('src', merged.src);
  if (merged.license) params.set('license', merged.license);
  if (merged.type) params.set('type', merged.type);
  if (merged.size) params.set('size', merged.size);
  if (merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
}

function syncControls() {
  els.search.value = state.q;
  els.source.value = state.src;
  els.license.value = state.license;
  els.type.value = state.type;
  els.size.value = state.size;
  els.size.hidden = state.src !== 'toonlab-rock';
}

async function loadFacets() {
  const response = await fetch('/api/toonlab/catalog-facets');
  if (!response.ok) throw new Error(`local catalog facets → HTTP ${response.status}`);
  const facets = await response.json();
  const sourceGroups = new Map();
  for (const entry of facets.sources ?? []) {
    const values = sourceGroups.get(entry.source) ?? { count: 0, licenses: new Set() };
    values.count += Number(entry.count) || 0;
    values.licenses.add(entry.license);
    sourceGroups.set(entry.source, values);
  }
  const sourceOptions = [...sourceGroups.entries()]
    .sort((a, b) => sourceLabel(a[0]).localeCompare(sourceLabel(b[0])))
    .map(([source, values]) => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = `${sourceLabel(source)} (${[...values.licenses].join(' / ')})`;
      return option;
    });
  els.source.replaceChildren(els.source.options[0], ...sourceOptions);

  const licenseOptions = (facets.licenses ?? []).map((entry) => {
    const option = document.createElement('option');
    option.value = entry.license;
    option.textContent = `${entry.license} (${Number(entry.count).toLocaleString()})`;
    return option;
  });
  els.license.replaceChildren(els.license.options[0], ...licenseOptions);
  const validLicenses = new Set((facets.licenses ?? []).map((entry) => entry.license));
  if (state.src && !sourceGroups.has(state.src)) state.src = '';
  if (state.license && !validLicenses.has(state.license)) state.license = '';
  if (state.src !== 'toonlab-rock') state.size = '';
  history.replaceState(null, '', urlFor());
  syncControls();
}

async function collect() {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((state.page - 1) * PAGE_SIZE),
  });
  if (state.q.trim()) params.set('q', state.q.trim());
  if (state.type) params.set('kind', state.type);
  if (state.src) params.set('source', state.src);
  if (state.license) params.set('license', state.license);
  if (state.size) params.set('size', state.size);
  const response = await fetch(`/api/toonlab/catalog?${params}`);
  if (!response.ok) throw new Error(`local catalog → HTTP ${response.status}`);
  const result = await response.json();
  const items = (result.items ?? []).map((asset) => ({
    actionLabel: 'Download ↓',
    badge: `${sourceLabel(asset.source)} · ${asset.license}`,
    directOpen: false,
    downloadHref: asset.download_url,
    downloadName: `${asset.name.replace(/[^a-z0-9._-]+/gi, '-') || asset.id}`,
    haystack: [asset.name, asset.description, ...(asset.tags ?? [])].join(' ').toLowerCase(),
    href: `/asset/?src=official&id=${encodeURIComponent(asset.id)}&kind=${encodeURIComponent(asset.kind)}`,
    id: asset.id,
    kind: asset.kind,
    label: asset.name,
    popularity: 0,
    externalDelivery: asset.redistribution_scope === 'external-only',
    source: asset.source,
    sourceHref: asset.source_url || asset.download_url,
    sourceId: asset.source_id || asset.id,
    thumbUrl: asset.thumbnail_url,
  }));
  return { items, total: Number(result.total) || 0, unavailable: 0 };
}

function card(item) {
  // Every supported source has an OSS detail page. The explicit source-file
  // affordance still resolves the upstream asset directly.
  const el = document.createElement('a');
  el.className = 'gal-card';
  el.href = item.href;
  el.title = item.label;
  if (item.external) {
    el.target = '_blank';
    el.rel = 'noreferrer';
  }

  const media = document.createElement('div');
  media.className = 'gal-card-media';
  if (item.thumbUrl) media.style.backgroundImage = `url("${item.thumbUrl.replace(/"/g, '%22')}")`;
  else {
    media.classList.add('gal-card-media--empty');
    media.textContent = item.kind === 'model' ? '🧊' : '🧱';
  }

  const overlay = document.createElement('div');
  overlay.className = 'gal-card-overlay';
  const title = document.createElement('div');
  title.className = 'gal-card-title';
  title.textContent = item.label;
  const meta = document.createElement('div');
  meta.className = 'gal-card-meta';
  const badge = document.createElement('span');
  badge.className = 'gal-badge gal-badge--src';
  badge.textContent = item.badge;
  const download = document.createElement('span');
  download.className = 'author';
  download.style.textDecoration = 'underline';
  download.style.cursor = 'pointer';
  const actionLabel = item.actionLabel ?? 'Download ↓';
  download.textContent = actionLabel;
  download.setAttribute('role', 'link');
  download.tabIndex = 0;
  let busy = false;
  const startDownload = async (e) => {
    // Direct download in place — assembled off the source CDN, no account.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (item.downloadHref) {
      if (item.externalDelivery) {
        window.open(item.downloadHref, '_blank', 'noopener');
        return;
      }
      busy = true;
      download.textContent = 'Downloading…';
      try {
        const response = await fetch(item.downloadHref);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const objectUrl = URL.createObjectURL(await response.blob());
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = item.downloadName;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        console.error('Direct download failed:', error);
        window.open(item.sourceHref, '_blank', 'noopener');
      }
      download.textContent = actionLabel;
      busy = false;
      return;
    }
    window.open(item.sourceHref, '_blank', 'noopener');
  };
  download.addEventListener('click', startDownload);
  download.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') startDownload(e);
  });
  meta.append(badge, download);
  overlay.append(title, meta);
  el.append(media, overlay);
  return el;
}

function setSearching(on) {
  els.grid.classList.toggle('gal-grid--loading', on);
  if (!on) return;
  const wrap = document.createElement('span');
  wrap.className = 'gal-searching';
  const spinner = document.createElement('span');
  spinner.className = 'gal-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  wrap.append(spinner, ' Searching…');
  els.status.replaceChildren(wrap);
}

let renderId = 0;
async function render() {
  const id = ++renderId;
  setSearching(true);

  let items;
  let sourceFailures = 0;
  let total = 0;
  try {
    ({ items, total, unavailable: sourceFailures } = await collect());
  } catch (error) {
    if (id !== renderId) return;
    console.error('Gallery fetch failed:', error);
    els.grid.replaceChildren();
    els.status.textContent = 'Could not reach asset sources.';
    els.emptyTitle.textContent = 'Asset sources unreachable';
    els.emptyHint.textContent = 'Check your connection and try again.';
    els.empty.hidden = false;
    els.pager.hidden = true;
    setSearching(false);
    return;
  }
  if (id !== renderId) return;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > totalPages) {
    state.page = totalPages;
    history.replaceState(null, '', urlFor());
    render();
    return;
  }

  els.grid.replaceChildren(...items.map(card));
  els.status.textContent = `${total.toLocaleString()} assets${sourceFailures ? ` · ${sourceFailures} source unavailable` : ''}`;

  const q = state.q.trim();
  els.emptyTitle.textContent = q ? `Nothing matches “${q}”` : 'Nothing matches';
  els.emptyHint.textContent = 'Try different filters or a broader search.';
  els.empty.hidden = total > 0;

  els.pager.hidden = totalPages <= 1;
  els.pagerStatus.textContent = `Page ${state.page} / ${totalPages}`;
  els.prev.href = urlFor({ page: state.page - 1 });
  els.next.href = urlFor({ page: state.page + 1 });
  els.prev.style.visibility = state.page > 1 ? 'visible' : 'hidden';
  els.next.style.visibility = state.page < totalPages ? 'visible' : 'hidden';

  setSearching(false);
}

function apply({ resetPage = true } = {}) {
  state.q = els.search.value;
  state.src = els.source.value;
  state.license = els.license.value;
  state.type = els.type.value;
  state.size = state.src === 'toonlab-rock' ? els.size.value : '';
  syncControls();
  if (resetPage) state.page = 1;
  history.pushState(null, '', urlFor());
  render();
}

// Filters apply themselves: selects on change, search debounced while typing
// (changing any filter resets to page 1) — same behavior as Pro.
let searchTimer = null;
els.search.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(apply, 350);
});
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (searchTimer) clearTimeout(searchTimer);
  apply();
});
els.source.addEventListener('change', () => apply());
els.license.addEventListener('change', () => apply());
els.type.addEventListener('change', () => apply());
els.size.addEventListener('change', () => apply());

for (const [el, delta] of [[els.prev, -1], [els.next, 1]]) {
  el.addEventListener('click', (e) => {
    // Plain click paginates in place; the real href stays for middle-click.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    state.page += delta;
    history.pushState(null, '', urlFor());
    window.scrollTo({ top: 0 });
    render();
  });
}

window.addEventListener('popstate', () => {
  readUrl();
  syncControls();
  render();
});

// Deep links still work: /gallery/?type=texture (Texture Lab button), ?q=, ?src=.
readUrl();
syncControls();
Promise.all([loadFacets(), render()]).catch((error) => {
  console.error('Gallery initialization failed:', error);
});
