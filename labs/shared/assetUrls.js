// Site-rooted asset URL resolution for lab pages served from subpaths
// (/playground/, /tree-lab/, ...). Bare paths like 'characters/mannequin.glb'
// or 'assets-local/models/tests/pmx/ganyu/ganyu.pmx' mean "from the repo root" — but
// three.js loaders resolve them against the page URL, so on any page other
// than / they fetch a nonexistent path and the dev server SPA-fallbacks to
// HTML (loaders then fail with "Unexpected token '<'"). Absolute paths and
// full URLs (https:, blob:, data:) pass through untouched.
export function rootedAssetUrl(url) {
  const value = String(url ?? '').trim();
  if (!value) return value;
  if (value.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `/${value.replace(/^(\.\/)+/, '')}`;
}
