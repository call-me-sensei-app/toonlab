// HUD tab strip (Character / Environment / Demo Settings), shared by every
// lab page that renders the #info panel. CSS lives in labs/shared/hud.css:
// body[data-hud-tab] controls which .hud-tab-panel is visible.

export const HUD_TABS = new Set(['character', 'environment', 'demo']);

export function setHudTab(tabName) {
  const tab = HUD_TABS.has(tabName) ? tabName : 'character';
  document.body.dataset.hudTab = tab;
  document.querySelectorAll('[data-hud-tab-target]').forEach((button) => {
    const selected = button.dataset.hudTabTarget === tab;
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

export function initializeHudTabs(initialTab) {
  document.querySelectorAll('[data-hud-tab-target]').forEach((button) => {
    button.addEventListener('click', () => setHudTab(button.dataset.hudTabTarget));
  });
  setHudTab(initialTab);
}
