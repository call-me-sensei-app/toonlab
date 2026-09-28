export const ACTIVE_STYLE_BUNDLE_STORAGE_KEY = 'toonlab.active-style-bundle.v1';
export const ACTIVE_STYLE_BUNDLE_EVENT = 'toonlab:active-style-bundle-change';

export const DEFAULT_STYLE_BUNDLE_OPTION = Object.freeze({
  id: 'call-me-sensei',
  label: 'Call Me Sensei',
  scope: 'built-in',
});

function isStyleBundle(entry) {
  return entry?.type === 'style-bundle' || entry?.schema === 'toonlab/style-bundle';
}

export function resolveActiveStyleBundleId(requestedId, options) {
  const normalized = String(requestedId ?? '').trim();
  return options.some(({ id }) => id === normalized)
    ? normalized
    : DEFAULT_STYLE_BUNDLE_OPTION.id;
}

export function readStoredStyleBundleId() {
  try {
    return window.localStorage.getItem(ACTIVE_STYLE_BUNDLE_STORAGE_KEY)
      || DEFAULT_STYLE_BUNDLE_OPTION.id;
  } catch {
    return DEFAULT_STYLE_BUNDLE_OPTION.id;
  }
}

/**
 * Make the persisted preference synchronously visible to Labs before their
 * stores initialize. The async library lookup later replaces these fallback
 * options with the complete local bundle list.
 */
export function primeActiveStyleBundle() {
  const id = readStoredStyleBundleId();
  const host = window;
  host.__toonlabActiveStyleBundleId = id;
  host.__toonlabStyleBundleOptions ??= [DEFAULT_STYLE_BUNDLE_OPTION];
  document.documentElement.dataset.styleBundle = id;
  if (document.body) document.body.dataset.styleBundle = id;
  return id;
}

export function publishActiveStyleBundle({ id, label, options, bundle = null, persist = true }) {
  const detail = { id, label, options, bundle };
  document.documentElement.dataset.styleBundle = id;
  if (document.body) document.body.dataset.styleBundle = id;
  if (persist) {
    try {
      window.localStorage.setItem(ACTIVE_STYLE_BUNDLE_STORAGE_KEY, id);
    } catch {
      // Private storage modes still retain the choice for this document.
    }
  }
  window.__toonlabActiveStyleBundleId = id;
  window.__toonlabStyleBundleOptions = options;
  if (bundle) window.__toonlabActiveStyleBundle = bundle;
  window.dispatchEvent(new CustomEvent(ACTIVE_STYLE_BUNDLE_EVENT, { detail }));
  return detail;
}

/**
 * Resolve the complete portable document for a Lab-local bundle selection.
 * Hosted Pro bundles use the public/authenticated v1 endpoint, while OSS
 * workspace bundles resolve through the local Library server. First-party
 * bundles never require a network request.
 */
export async function loadStyleBundleDocument(id, {
  fetchImpl = window.fetch.bind(window),
  scope = '',
} = {}) {
  const normalizedId = String(id ?? '').trim();
  if (!normalizedId) throw new Error('Choose a style bundle.');

  const {
    getFirstPartyStyleBundle,
    parseStyleBundleDocument,
  } = await import('../../src/styles/styleBundle.js');
  const firstParty = getFirstPartyStyleBundle(normalizedId);
  if (firstParty) return structuredClone(firstParty);

  const localUrl = `/api/toonlab/library/${encodeURIComponent(normalizedId)}/resolved`;
  const hostedUrl = `/api/v1/bundles/${encodeURIComponent(normalizedId)}`;
  const hostedLab = window.location.pathname.startsWith('/labs/');
  const urls = hostedLab
    ? [hostedUrl]
    : scope === 'local' ? [localUrl, hostedUrl] : [hostedUrl, localUrl];
  let failure = null;
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!response.ok) {
        failure = new Error(`HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      const parsed = parseStyleBundleDocument(body.bundle ?? body);
      if (!parsed.ok) throw new Error(parsed.errors.join(' '));
      return parsed.value;
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(`Could not load style bundle “${normalizedId}”${failure ? `: ${failure.message}` : '.'}`);
}

export async function listLocalStyleBundleOptions({ fetchImpl = window.fetch.bind(window) } = {}) {
  const options = new Map([
    [DEFAULT_STYLE_BUNDLE_OPTION.id, DEFAULT_STYLE_BUNDLE_OPTION],
  ]);
  try {
    const response = await fetchImpl('/api/toonlab/library', {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return [...options.values()];
    const payload = await response.json();
    for (const entry of payload.entries ?? []) {
      if (!isStyleBundle(entry) || !entry.id || entry.id === DEFAULT_STYLE_BUNDLE_OPTION.id) {
        continue;
      }
      options.set(entry.id, {
        id: entry.id,
        label: entry.label || entry.name || entry.id,
        scope: 'local',
      });
    }
  } catch {
    // Static OSS builds have no workspace API and expose the built-in bundle.
  }
  return [...options.values()];
}

export async function loadActiveStyleBundlePreference(options = {}) {
  const hostedLab = window.location.pathname.startsWith('/labs/');
  const bundleOptions = hostedLab
    ? [...new Map([
      [DEFAULT_STYLE_BUNDLE_OPTION.id, DEFAULT_STYLE_BUNDLE_OPTION],
      ...(Array.isArray(window.__toonlabStyleBundleOptions)
        ? window.__toonlabStyleBundleOptions
          .filter((option) => option?.id)
          .map((option) => [option.id, option])
        : []),
    ]).values()]
    : await listLocalStyleBundleOptions(options);
  const requestedId = hostedLab
    ? window.__toonlabActiveStyleBundleId || DEFAULT_STYLE_BUNDLE_OPTION.id
    : readStoredStyleBundleId();
  const id = resolveActiveStyleBundleId(requestedId, bundleOptions);
  const selected = bundleOptions.find((option) => option.id === id)
    ?? DEFAULT_STYLE_BUNDLE_OPTION;
  return publishActiveStyleBundle({
    id: selected.id,
    label: selected.label,
    options: bundleOptions,
  });
}
