import '../shared/siteHeader.js';
import {
  libraryEntryInfo,
  libraryImageUrl,
} from './libraryEntry.js';

const grid = document.getElementById('libraryGrid');
const empty = document.getElementById('libraryEmpty');
const emptyTitle = document.getElementById('libraryEmptyTitle');
const emptyHint = document.getElementById('libraryEmptyHint');
const search = document.getElementById('librarySearch');
const filtersForm = document.getElementById('libraryFilters');
const typeFilter = document.getElementById('libraryType');
const tagFilter = document.getElementById('libraryTag');
const clearFilters = document.getElementById('clearFilters');
const status = document.getElementById('libraryStatus');
const pager = document.getElementById('libraryPager');
const pagerStatus = document.getElementById('libraryPagerStatus');
const previousPage = document.getElementById('libraryPrev');
const nextPage = document.getElementById('libraryNext');

const PAGE_SIZE = 36;
let entries = [];
let currentPage = 1;

function card(entry) {
  const info = libraryEntryInfo(entry);
  const link = document.createElement('a');
  link.className = 'gal-card lib-card-link';
  link.href = `/asset/?src=library&id=${encodeURIComponent(entry.id)}`;
  link.title = entry.label ?? entry.name ?? entry.id;

  const media = document.createElement('div');
  const preview = libraryImageUrl(entry);
  media.className = `gal-card-media${preview ? '' : ' gal-card-media--empty'}`;
  if (preview) media.style.backgroundImage = `url("${String(preview).replaceAll('"', '%22')}")`;
  else media.textContent = info.icon;

  const overlay = document.createElement('div');
  overlay.className = 'gal-card-overlay';
  const title = document.createElement('div');
  title.className = 'gal-card-title';
  title.textContent = entry.label ?? entry.name ?? entry.id;
  const meta = document.createElement('div');
  meta.className = 'gal-card-meta';
  const badge = document.createElement('span');
  badge.className = 'gal-badge';
  badge.textContent = info.label;
  meta.append(badge);
  for (const tag of (Array.isArray(entry.tags) ? entry.tags : []).slice(0, 2)) {
    const tagBadge = document.createElement('span');
    tagBadge.className = 'gal-badge';
    tagBadge.textContent = `#${tag}`;
    meta.append(tagBadge);
  }
  if (entry.aiGenerated) {
    const ai = document.createElement('span');
    ai.className = 'gal-badge gal-badge--ai';
    ai.textContent = 'AI';
    meta.append(ai);
  }
  overlay.append(title, meta);
  link.append(media, overlay);
  return link;
}

function filterOption(value, label = value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function populateFilters() {
  const typeLabels = [...new Set(entries.map((entry) => libraryEntryInfo(entry).label))]
    .sort((a, b) => a.localeCompare(b));
  const tags = [...new Set(entries.flatMap((entry) => Array.isArray(entry.tags) ? entry.tags : []))]
    .sort((a, b) => a.localeCompare(b));
  typeFilter.replaceChildren(filterOption('', 'All types'), ...typeLabels.map((label) => filterOption(label)));
  tagFilter.replaceChildren(filterOption('', 'All tags'), ...tags.map((tag) => filterOption(tag, `#${tag}`)));
}

function applyInitialFilters() {
  const params = new URLSearchParams(window.location.search);
  search.value = params.get('q') ?? '';
  const requestedType = params.get('type') ?? '';
  const requestedTag = params.get('tag') ?? '';
  typeFilter.value = [...typeFilter.options].some((option) => option.value === requestedType) ? requestedType : '';
  tagFilter.value = [...tagFilter.options].some((option) => option.value === requestedTag) ? requestedTag : '';
  currentPage = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
}

function syncIndexUrl() {
  const params = new URLSearchParams();
  const query = search.value.trim();
  if (query) params.set('q', query);
  if (typeFilter.value) params.set('type', typeFilter.value);
  if (tagFilter.value) params.set('tag', tagFilter.value);
  if (currentPage > 1) params.set('page', String(currentPage));
  const queryString = params.toString();
  history.replaceState(null, '', `/library/${queryString ? `?${queryString}` : ''}`);
}

function renderIndex() {
  const query = search.value.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    const info = libraryEntryInfo(entry);
    const matchesQuery = JSON.stringify([
      entry.label, entry.name, entry.description, entry.type, entry.kind, entry.tags, info.label,
    ]).toLowerCase().includes(query);
    const matchesType = !typeFilter.value || info.label === typeFilter.value;
    const matchesTag = !tagFilter.value || (Array.isArray(entry.tags) && entry.tags.includes(tagFilter.value));
    return matchesQuery && matchesType && matchesTag;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  grid.replaceChildren(...visible.map(card));
  status.textContent = `${filtered.length} local ${filtered.length === 1 ? 'creation' : 'creations'}`;
  empty.hidden = filtered.length > 0;
  emptyTitle.textContent = entries.length === 0 ? 'Nothing saved yet' : 'No matching creations';
  emptyHint.textContent = entries.length === 0
    ? 'Make something in a lab, then save it with a name.'
    : 'Try another search, type, or tag.';
  clearFilters.hidden = !(query || typeFilter.value || tagFilter.value);
  pager.hidden = filtered.length <= PAGE_SIZE;
  previousPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;
  pagerStatus.textContent = filtered.length === 0
    ? '0 creations'
    : `${start + 1}–${start + visible.length} of ${filtered.length}`;
  syncIndexUrl();
}

async function load() {
  const legacyId = new URLSearchParams(window.location.search).get('id');
  if (legacyId) {
    window.location.replace(`/asset/?src=library&id=${encodeURIComponent(legacyId)}`);
    return;
  }
  const response = await fetch('/api/toonlab/library');
  if (!response.ok) throw new Error(`Library unavailable: HTTP ${response.status}`);
  entries = (await response.json()).entries ?? [];
  populateFilters();
  applyInitialFilters();
  renderIndex();
}

search.addEventListener('input', () => { currentPage = 1; renderIndex(); });
filtersForm.addEventListener('submit', (event) => {
  event.preventDefault();
  currentPage = 1;
  renderIndex();
});
typeFilter.addEventListener('change', () => { currentPage = 1; renderIndex(); });
tagFilter.addEventListener('change', () => { currentPage = 1; renderIndex(); });
clearFilters.addEventListener('click', () => {
  search.value = '';
  typeFilter.value = '';
  tagFilter.value = '';
  currentPage = 1;
  renderIndex();
  search.focus();
});
previousPage.addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  renderIndex();
});
nextPage.addEventListener('click', () => { currentPage += 1; renderIndex(); });
load().catch((error) => {
  status.textContent = error.message;
  empty.hidden = false;
});
