// Renderer switcher pill, shown on every lab screen: pick WebGPU or the TSL
// WebGL2 fallback and see the ACTUAL backend the renderer initialized with
// (the two differ when WebGPU is unavailable and the request falls back).
//
// Switching navigates with an updated `?renderer=` param — a renderer cannot
// be hot-swapped, every render target and compiled program belongs to its
// context — so the pill is also the truth signal after reload: the badge
// reads dataset.rendererBackend, which rendererFactory.js stamps only after
// backend init resolves.
//
// Deliberately NOT persisted via labParams: capture/baseline URLs choose the
// renderer explicitly; a persisted kind would leak into them and silently
// change what a baseline measures.

import { RENDERER_SWITCHER_KINDS, resolveRendererKind } from './rendererKind.js';

// Shared with the top-bar renderer control (labs/shared/ui/components/
// LabChrome.jsx), which replaces this floating pill on redesigned labs.
export const KIND_LABELS = Object.freeze({
  webgl: 'TSL WebGL',
  webgpu: 'WebGPU',
  'webgpu-forced-gl': 'TSL WebGL',
});

export const BACKEND_LABELS = Object.freeze({
  webgpu: 'WebGPU',
  'webgl2-fallback': 'TSL WebGL2',
});

// The backend the factory is expected to report for each requested kind; a
// mismatch (e.g. webgpu requested, webgl2-fallback delivered) turns the badge
// amber so an unintended fallback is impossible to miss.
export const EXPECTED_BACKEND = Object.freeze({
  webgl: 'webgl2-fallback',
  webgpu: 'webgpu',
  'webgpu-forced-gl': 'webgl2-fallback',
});

export function urlForKind(kind) {
  const url = new URL(window.location.href);
  if (kind === 'webgpu') {
    url.searchParams.delete('renderer'); // default stays a clean URL
  } else {
    url.searchParams.set('renderer', kind);
  }
  return url.href;
}

export function installRendererSwitcher() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('hud') === '0') return; // capture determinism: never in screenshots

  const requested = resolveRendererKind();
  const requestedChoice = requested === 'webgpu-forced-gl' ? 'webgl' : requested;

  const root = document.createElement('div');
  root.id = 'rendererSwitcher';
  root.style.cssText = [
    'position:fixed', 'left:12px', 'bottom:12px', 'z-index:9999',
    'display:flex', 'align-items:center', 'gap:8px',
    'padding:6px 8px', 'border-radius:999px',
    'background:rgba(16,18,24,0.82)', 'border:1px solid rgba(255,255,255,0.14)',
    'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace', 'color:#cfd3dc',
    'user-select:none', 'backdrop-filter:blur(6px)',
  ].join(';');

  for (const kind of RENDERER_SWITCHER_KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = KIND_LABELS[kind];
    button.dataset.rendererChoice = kind;
    const active = kind === requestedChoice;
    button.style.cssText = [
      'padding:3px 9px', 'border-radius:999px', 'cursor:pointer',
      'font:inherit', 'border:1px solid transparent',
      active
        ? 'background:#3b82f6;color:#fff'
        : 'background:transparent;color:#9aa1ad;border-color:rgba(255,255,255,0.12)',
    ].join(';');
    if (!active) {
      button.addEventListener('click', () => window.location.assign(urlForKind(kind)));
    }
    root.appendChild(button);
  }

  const badge = document.createElement('span');
  badge.id = 'rendererBackendBadge';
  badge.style.cssText = 'padding:3px 9px;border-radius:999px;background:rgba(255,255,255,0.08)';
  root.appendChild(badge);

  function renderBadge() {
    const backend = document.body.dataset.rendererBackend;
    if (!backend) {
      badge.textContent = 'booting…';
      badge.style.color = '#9aa1ad';
      return;
    }
    const matches = backend === EXPECTED_BACKEND[requested];
    badge.textContent = `● ${BACKEND_LABELS[backend] || backend}`;
    badge.style.color = matches ? '#4ade80' : '#fbbf24';
    badge.title = matches
      ? 'Active backend matches the requested renderer'
      : `Requested ${KIND_LABELS[requested]} but got ${BACKEND_LABELS[backend] || backend}`;
  }

  // rendererFactory stamps dataset.rendererBackend only after async backend
  // init — watch for it instead of assuming it exists at install time.
  renderBadge();
  new MutationObserver(renderBadge).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-renderer-backend'],
  });

  document.body.appendChild(root);
}
