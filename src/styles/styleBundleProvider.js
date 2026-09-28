import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  getFirstPartyStyleBundle,
  listFirstPartyStyleBundles,
  parseStyleBundleDocument,
} from './styleBundle.js';

export const STYLE_BUNDLE_PROVIDER_VERSION = 1;

function clone(value) {
  return structuredClone(value);
}

function normalizeList(bundles) {
  const unique = new Map();
  for (const input of bundles ?? []) {
    const parsed = parseStyleBundleDocument(input);
    if (!parsed.ok) throw new TypeError(parsed.errors.join(' '));
    const bundle = parsed.value;
    unique.set(bundle.id, bundle);
  }
  return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function createStyleBundleProvider({
  getBundle,
  listBundles,
  defaultBundleId = CALL_ME_SENSEI_STYLE_BUNDLE.id,
  id = 'custom',
} = {}) {
  if (typeof listBundles !== 'function') {
    throw new TypeError('createStyleBundleProvider requires listBundles(context).');
  }
  return Object.freeze({
    defaultBundleId,
    id,
    version: STYLE_BUNDLE_PROVIDER_VERSION,
    async get(bundleId, context = {}) {
      const direct = typeof getBundle === 'function'
        ? await getBundle(bundleId, context)
        : (await listBundles(context)).find((bundle) => bundle.id === bundleId);
      if (!direct) return null;
      const parsed = parseStyleBundleDocument(direct);
      if (!parsed.ok) throw new TypeError(parsed.errors.join(' '));
      return clone(parsed.value);
    },
    async list(context = {}) {
      return clone(normalizeList(await listBundles(context)));
    },
  });
}

export function createOssStyleBundleProvider({ bundles = null } = {}) {
  const documents = bundles ?? listFirstPartyStyleBundles();
  return createStyleBundleProvider({
    id: 'oss',
    getBundle: (bundleId) => documents.find((bundle) => bundle.id === bundleId)
      ?? getFirstPartyStyleBundle(bundleId),
    listBundles: () => documents,
  });
}

export function createUserStyleBundleProvider({ loadUserBundles } = {}) {
  if (typeof loadUserBundles !== 'function') {
    throw new TypeError('createUserStyleBundleProvider requires loadUserBundles(user, context).');
  }
  return createStyleBundleProvider({
    id: 'user',
    async listBundles(context = {}) {
      if (!context.user) return [CALL_ME_SENSEI_STYLE_BUNDLE];
      return [CALL_ME_SENSEI_STYLE_BUNDLE, ...((await loadUserBundles(context.user, context)) ?? [])];
    },
  });
}

export async function resolveStyleBundleSelection(provider, requestedId, context = {}) {
  const options = await provider.list(context);
  const selected = options.find((bundle) => bundle.id === requestedId)
    ?? options.find((bundle) => bundle.id === provider.defaultBundleId)
    ?? options[0]
    ?? null;
  return { options, selected };
}
