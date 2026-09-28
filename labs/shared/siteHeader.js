import './siteHeader.css';
import { getCopy, getLanguageFlagUrl, getLanguageOptions, getLocale, mountLanguagePicker } from '../../src/i18n/locales.js';
import {
  DEFAULT_STYLE_BUNDLE_OPTION,
  loadActiveStyleBundlePreference,
  publishActiveStyleBundle,
} from './stylePreference.js';

const NAV_ITEMS = Object.freeze([
  { id: 'labs', href: '/' },
  { id: 'generate', href: '/generate/' },
  { id: 'gallery', href: '/gallery/' },
  { id: 'library', href: '/library/' },
  { id: 'styles', href: '/styles/' },
  { id: 'settings', href: '/settings/' },
  { id: 'docs', href: '/docs/' },
  {
    id: 'github',
    href: 'https://github.com/call-me-sensei-app/toonlab',
    external: true,
  },
  {
    id: 'pro',
    href: 'https://toonlab.io',
    external: true,
  },
]);

function navLink(item, active, copy) {
  const current = item.id === active ? ' aria-current="page"' : '';
  const external = item.external ? ' target="_blank" rel="noreferrer"' : '';
  return `<a href="${item.href}"${current}${external}>${copy[item.id]}</a>`;
}

/**
 * Shared site chrome for the OSS home, gallery, asset, docs, and settings
 * pages. Lab workspaces intentionally keep their purpose-built toolbars.
 */
export class SiteHeader extends HTMLElement {
  static observedAttributes = ['active'];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const active = this.getAttribute('active') ?? '';
    const locale = getLocale();
    const copy = getCopy(locale);
    this.querySelectorAll('[data-language-menu]').forEach((menu) => {
      menu.__languageMenuCleanup?.();
    });
    this.__styleMenuCleanup?.();
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    this.innerHTML = `
      <header class="site-header">
        <a class="site-header__brand" href="/" aria-label="${copy.allLabs}">
          <span class="site-header__brand-mark" aria-hidden="true">ト</span>
          <span class="site-header__brand-word">TOONLAB</span>
          <span class="site-header__brand-tag">Open Source</span>
        </a>
        <nav class="site-header__nav" aria-label="Primary">
          ${NAV_ITEMS.map((item) => navLink(item, active, copy)).join('')}
        </nav>
        <div class="site-header__actions">
          <div class="site-header__style" data-style-menu data-open="false">
            <button
              class="tl-style-trigger"
              type="button"
              data-style-trigger
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-controls="site-header-style-options"
              aria-label="Global style: ${DEFAULT_STYLE_BUNDLE_OPTION.label}"
              title="Global style bundle — used by live previews and preselected in Labs"
            >
              <span class="tl-style-trigger__mark" aria-hidden="true">◈</span>
              <span class="tl-style-trigger__label">Style</span>
              <span class="tl-style-trigger__current" data-style-current>${DEFAULT_STYLE_BUNDLE_OPTION.label}</span>
              <span class="tl-style-trigger__chevron" aria-hidden="true">⌄</span>
            </button>
            <div
              id="site-header-style-options"
              class="tl-style-list"
              data-style-options
              role="listbox"
              aria-label="Global style bundle"
              hidden
            >
              <div class="tl-style-list__head">
                <strong>Global style</strong>
                <span>Live previews · Lab default</span>
              </div>
              <div data-style-option-list></div>
              <a class="tl-style-manage" href="/styles/">Manage style bundles →</a>
            </div>
          </div>
          <div class="site-header__language tl-language-menu" data-language-menu data-language-picker>
            <span class="sr-only">${copy.language}</span>
            <button
              class="tl-language-trigger"
              type="button"
              data-language-trigger
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label="${copy.language}"
            >
              <span class="tl-language-trigger__flag" data-language-flag aria-hidden="true"><img src="${getLanguageFlagUrl(locale)}" alt=""></span>
              <span class="tl-language-trigger__current" data-language-current>${getLanguageOptions().find(({ code }) => code === locale)?.nativeName || 'English'}</span>
              <span class="tl-language-trigger__chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="tl-language-list" data-language-options role="listbox" hidden></div>
          </div>
        </div>
      </header>
    `;
    mountLanguagePicker(this);
    this.bindStyleMenu();
  }

  bindStyleMenu() {
    const menu = this.querySelector('[data-style-menu]');
    const trigger = this.querySelector('[data-style-trigger]');
    const list = this.querySelector('[data-style-options]');
    const optionList = this.querySelector('[data-style-option-list]');
    const current = this.querySelector('[data-style-current]');
    if (!menu || !trigger || !list || !optionList || !current) return;

    let detail = {
      id: DEFAULT_STYLE_BUNDLE_OPTION.id,
      label: DEFAULT_STYLE_BUNDLE_OPTION.label,
      options: [DEFAULT_STYLE_BUNDLE_OPTION],
    };

    const close = () => {
      menu.dataset.open = 'false';
      trigger.setAttribute('aria-expanded', 'false');
      list.hidden = true;
    };
    const open = () => {
      menu.dataset.open = 'true';
      trigger.setAttribute('aria-expanded', 'true');
      list.hidden = false;
    };
    const renderOptions = () => {
      current.textContent = detail.label;
      trigger.setAttribute('aria-label', `Global style: ${detail.label}`);
      optionList.replaceChildren(...detail.options.map((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tl-style-option';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.id === detail.id));

        const name = document.createElement('span');
        name.className = 'tl-style-option__name';
        name.textContent = option.label;
        const scope = document.createElement('span');
        scope.className = 'tl-style-option__scope';
        scope.textContent = option.scope;
        const check = document.createElement('span');
        check.className = 'tl-style-option__check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        button.append(name, scope, check);
        button.addEventListener('click', () => {
          detail = publishActiveStyleBundle({
            id: option.id,
            label: option.label,
            options: detail.options,
          });
          renderOptions();
          close();
        });
        return button;
      }));
    };

    const onTrigger = () => (list.hidden ? open() : close());
    const onPointerDown = (event) => {
      if (!menu.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
      if (list.hidden || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...optionList.querySelectorAll('[role="option"]')];
      const index = buttons.indexOf(document.activeElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[nextIndex]?.focus();
    };

    trigger.addEventListener('click', onTrigger);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    this.__styleMenuCleanup = () => {
      trigger.removeEventListener('click', onTrigger);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };

    renderOptions();
    const renderVersion = Symbol('style-menu-render');
    this.__styleMenuRenderVersion = renderVersion;
    loadActiveStyleBundlePreference().then((nextDetail) => {
      if (this.__styleMenuRenderVersion !== renderVersion || !this.isConnected) return;
      detail = nextDetail;
      renderOptions();
    });
  }

  disconnectedCallback() {
    this.__styleMenuCleanup?.();
  }
}

if (!customElements.get('toonlab-site-header')) {
  customElements.define('toonlab-site-header', SiteHeader);
}
