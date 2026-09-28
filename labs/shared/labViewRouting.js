/**
 * Home/catalog screens are document pages; editors are full-bleed tools.
 * Keep that distinction in the URL so the hosted shell can use normal site
 * chrome for the former and avoid booting a renderer behind it.
 */
export function isLabEditorLocation({ directParams = [] } = {}) {
  const params = new URLSearchParams(window.location.search);
  return params.get('editor') === '1'
    || params.get('hud') === '0'
    || params.has('cloudDoc')
    || directParams.some((key) => params.has(key));
}

export function stampLabHomeDocument(home) {
  const value = home ? 'true' : 'false';
  document.documentElement.dataset.labHome = value;
  document.body.dataset.labHome = value;
}

export function syncLabHomeRoute(home, { directParams = [] } = {}) {
  const editor = isLabEditorLocation({ directParams });
  if (Boolean(home) === !editor) return false;

  const url = new URL(window.location.href);
  if (home) {
    url.searchParams.delete('editor');
    url.searchParams.delete('cloudDoc');
    for (const key of directParams) url.searchParams.delete(key);
  } else {
    url.searchParams.set('editor', '1');
  }
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  return true;
}
