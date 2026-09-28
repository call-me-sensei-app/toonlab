// Shared top-bar chrome for redesigned lab workspaces.
//
// BrandLockup uses the compact red ト mark as the way back to the Labs index.
// The product wordmark is intentionally omitted inside editors: the lab name
// and active document need the horizontal space. A lab with a start screen
// supplies onLabNameClick, making the entire labeled home control clickable.
//
// RendererToggle is the permanent top-right WebGPU/WebGL control. It replaces
// the floating pill from labs/shared/rendererSwitcher.js: same semantics —
// switching navigates with an updated `?renderer=` param (a renderer cannot
// be hot-swapped), and the badge shows the ACTUAL backend the factory stamped
// on document.body.dataset.rendererBackend after init.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { Icon } from './Icon.jsx';
import { Popover } from './overlays.jsx';
import { Toggle } from './primitives.jsx';
import { RENDERER_SWITCHER_KINDS, resolveRendererKind } from '../../rendererKind.js';
import {
  EXPECTED_BACKEND,
  urlForKind,
} from '../../rendererSwitcher.js';
import { liveLabDocumentationHref } from '../../liveLabDocumentation.js';
import {
  ACTIVE_STYLE_BUNDLE_EVENT,
  DEFAULT_STYLE_BUNDLE_OPTION,
  listLocalStyleBundleOptions,
  loadStyleBundleDocument,
  publishActiveStyleBundle,
} from '../../stylePreference.js';
import {
  getCopy,
  getLanguageFlagUrl,
  getLanguageOptions,
  getLocale,
  localizeEditorText,
  setLocale,
} from '../../../../src/i18n/locales.js';

/** The labs screen: /labs when mounted in the Pro app, the root grid otherwise. */
export function labsHomeHref() {
  return window.location.pathname.startsWith('/labs') ? '/labs' : '/';
}

function LanguageFlag({ language, className }) {
  return (
    <span className={className} aria-hidden="true">
      <img src={getLanguageFlagUrl(language)} alt="" />
    </span>
  );
}

/** The complete Style Bundle workspace lives outside the individual Lab host. */
export function styleBundleHomeHref() {
  return window.location.pathname.startsWith('/labs') ? '/styles' : '/styles/';
}

/**
 * A Lab exports the style slot it owns. Coordinated, multi-slot exports are
 * composed in the Style Bundle workspace reached through this shared handoff.
 */
export function StyleBundleExportPrompt({
  description = 'Build one coordinated style by assigning its treatment for every element: characters, trees, grass, flowers, rocks, ground, manufactured surfaces, water, sky, clouds, and the remaining runtime domains.',
}) {
  const copy = getCopy();
  return (
    <aside className="tk-style-bundle-prompt" data-testid="style-bundle-export-prompt">
      <span>
        <strong>{localizeEditorText('Want to export the whole style as a bundle?')}</strong>
        <small>{localizeEditorText(description)}</small>
      </span>
      <a
        className="tk-button"
        data-kind="secondary"
        href={styleBundleHomeHref()}
      >
        {copy.openStyleBundle}
      </a>
    </aside>
  );
}

export function BrandLockup({ labName, onLabNameClick }) {
  const copy = getCopy();
  const localizedLabName = localizeEditorText(labName);
  return (
    <span className="tk-brand">
      <a
        aria-label={copy.allLabs}
        className="tk-brand-home"
        href={labsHomeHref()}
        title={copy.allLabs}
      >
        <span aria-hidden="true" className="tk-brand-mark">ト</span>
      </a>
      {labName && (onLabNameClick ? (
        <button
          aria-label={`${copy.labHome}: ${localizedLabName}`}
          type="button"
          className="tk-brand-lab tk-brand-lab--link"
          title={`${copy.labHome}: ${localizedLabName}`}
          onClick={onLabNameClick}
        >
          <Icon name="home" />
          <span className="tk-brand-lab-label">{localizedLabName}</span>
        </button>
      ) : (
        <span className="tk-brand-lab" title={localizedLabName}>
          <span className="tk-brand-lab-label">{localizedLabName}</span>
        </span>
      ))}
    </span>
  );
}

function styleBundleOptionsFromHost() {
  const merged = new Map([
    [DEFAULT_STYLE_BUNDLE_OPTION.id, DEFAULT_STYLE_BUNDLE_OPTION],
  ]);
  const injected = Array.isArray(window.__toonlabStyleBundleOptions)
    ? window.__toonlabStyleBundleOptions
    : [];
  for (const option of injected) {
    if (!option?.id) continue;
    merged.set(option.id, {
      id: option.id,
      label: option.label || option.id,
      scope: option.scope || 'local',
    });
  }
  return [...merged.values()];
}

function requestedStyleBundleId() {
  return new URLSearchParams(window.location.search).get('styleBundle')
    || window.__toonlabActiveStyleBundleId
    || DEFAULT_STYLE_BUNDLE_OPTION.id;
}

/**
 * The active cross-Lab Style Bundle selector. It consumes Pro's injected
 * personal/team list or the OSS local Library, resolves the full document,
 * and keeps the Lab deep-link self-contained without changing the account's
 * default bundle.
 */
export function StyleBundlePicker({ onChange = null } = {}) {
  const initialId = useMemo(requestedStyleBundleId, []);
  const [options, setOptions] = useState(() => {
    const initial = styleBundleOptionsFromHost();
    return initial.some(({ id }) => id === initialId)
      ? initial
      : [...initial, { id: initialId, label: initialId, scope: 'local' }];
  });
  const [selectedId, setSelectedId] = useState(initialId);
  const [loadingId, setLoadingId] = useState('');
  const [error, setError] = useState('');
  const optionsRef = useRef(options);
  const requestRef = useRef(0);
  optionsRef.current = options;

  const selectBundle = useCallback(async (nextId, nextOptions = optionsRef.current) => {
    const option = nextOptions.find(({ id }) => id === nextId)
      ?? DEFAULT_STYLE_BUNDLE_OPTION;
    const request = ++requestRef.current;
    setLoadingId(option.id);
    setError('');
    try {
      const bundle = window.__toonlabActiveStyleBundleId === option.id
        && window.__toonlabActiveStyleBundle?.id === option.id
        ? window.__toonlabActiveStyleBundle
        : await loadStyleBundleDocument(option.id, { scope: option.scope });
      if (request !== requestRef.current) return;
      const url = new URL(window.location.href);
      url.searchParams.set('styleBundle', option.id);
      window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
      setSelectedId(option.id);
      publishActiveStyleBundle({
        bundle,
        id: option.id,
        label: option.label,
        options: nextOptions,
        persist: false,
      });
      onChange?.({ bundle, id: option.id, option });
    } catch (cause) {
      if (request !== requestRef.current) return;
      setError(cause?.message || String(cause));
      setSelectedId(window.__toonlabActiveStyleBundleId || DEFAULT_STYLE_BUNDLE_OPTION.id);
    } finally {
      if (request === requestRef.current) setLoadingId('');
    }
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    const localOptionsRequest = window.location.pathname.startsWith('/labs/')
      ? Promise.resolve([])
      : listLocalStyleBundleOptions();
    localOptionsRequest.then((localOptions) => {
      if (cancelled) return;
      const merged = new Map(styleBundleOptionsFromHost().map((option) => [option.id, option]));
      for (const option of localOptions) merged.set(option.id, option);
      const nextOptions = [...merged.values()];
      setOptions(nextOptions);
      const validId = nextOptions.some(({ id }) => id === initialId)
        ? initialId
        : DEFAULT_STYLE_BUNDLE_OPTION.id;
      void selectBundle(validId, nextOptions);
    });
    const onActiveBundle = (event) => {
      if (!event.detail?.id) return;
      setOptions(event.detail.options ?? styleBundleOptionsFromHost());
      setSelectedId(event.detail.id);
    };
    window.addEventListener(ACTIVE_STYLE_BUNDLE_EVENT, onActiveBundle);
    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_STYLE_BUNDLE_EVENT, onActiveBundle);
    };
  }, [initialId, selectBundle]);

  return (
    <label
      className="tk-style-bundle-picker"
      data-loading={loadingId ? 'true' : undefined}
      title={error || 'Active Style Bundle for this Lab. The procedural surface preset remains an asset-generation setting.'}
    >
      <span>Style Bundle</span>
      <select
        aria-label="Style Bundle"
        className="tk-select"
        data-testid="style-bundle-select"
        disabled={Boolean(loadingId)}
        onChange={(event) => { void selectBundle(event.target.value); }}
        value={selectedId}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      {error ? <span className="tk-style-bundle-picker__error" aria-label={error}>!</span> : null}
    </label>
  );
}

/** Blender-style command menus shared by Lab editor top bars. */
export function LabMenuBar({ menus = [] }) {
  const [open, setOpen] = useState(null);
  const active = menus.find((menu) => menu.id === open?.id) ?? null;

  function openMenu(event, menu) {
    const rect = event.currentTarget.getBoundingClientRect();
    setOpen((current) => current?.id === menu.id
      ? null
      : { anchor: { x: rect.left - 14, y: rect.bottom + 8 }, id: menu.id });
  }

  function run(item) {
    if (item.disabled) return;
    setOpen(null);
    item.onSelect?.();
  }

  return (
    <nav aria-label={getCopy().labCommands} className="tk-lab-menu-bar">
      {menus.map((menu) => (
        <button
          key={menu.id}
          aria-expanded={open?.id === menu.id}
          aria-haspopup="menu"
          className="tk-lab-menu-trigger"
          onClick={(event) => openMenu(event, menu)}
          onPointerEnter={(event) => {
            if (open && open.id !== menu.id) openMenu(event, menu);
          }}
          type="button"
        >
          {menu.label}
        </button>
      ))}
      {active && (
        <Popover
          anchor={open.anchor}
          onClose={() => setOpen(null)}
          testId={`lab-menu-${active.id}`}
          width={active.width ?? 248}
        >
          <div className="tk-lab-menu" role="menu">
            {active.items.filter((item) => !item.hidden).map((item, index) => (
              item.separator ? (
                <div
                  // Separators have no identity beyond their position.
                  key={`separator-${index}`}
                  className="tk-lab-menu-separator"
                  role="separator"
                />
              ) : item.href ? (
                <a
                  key={item.id ?? item.label}
                  className="tk-lab-menu-item"
                  data-testid={item.testId ?? item.id}
                  data-danger={item.danger || undefined}
                  href={item.href}
                  onClick={() => setOpen(null)}
                  role="menuitem"
                >
                  <span className="tk-lab-menu-item__icon">
                    {item.icon && <Icon name={item.icon} />}
                  </span>
                  <span>{item.label}</span>
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
                </a>
              ) : (
                <button
                  key={item.id ?? item.label}
                  className="tk-lab-menu-item"
                  data-testid={item.testId ?? item.id}
                  data-danger={item.danger || undefined}
                  disabled={item.disabled}
                  onClick={() => run(item)}
                  role="menuitem"
                  type="button"
                >
                  <span className="tk-lab-menu-item__icon">
                    {item.checked ? <span aria-hidden="true">✓</span> : item.icon && <Icon name={item.icon} />}
                  </span>
                  <span>{item.label}</span>
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
                </button>
              )
            ))}
          </div>
        </Popover>
      )}
    </nav>
  );
}

function LabLanguagePicker() {
  const [locale, setCurrentLocale] = useState(() => getLocale());
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const copy = getCopy(locale);
  const activeLanguage = getLanguageOptions().find(({ code }) => code === locale);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const selectLocale = (next) => {
    setCurrentLocale(next);
    setOpen(false);
    setLocale(next);
  };

  return (
    <div
      ref={menuRef}
      className="tk-language-picker tk-language-menu"
      data-open={open ? 'true' : 'false'}
    >
      <span className="tk-visually-hidden">{copy.language}</span>
      <button
        className="tk-language-trigger"
        type="button"
        aria-label={copy.language}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="tk-language-options"
        onClick={() => setOpen((current) => !current)}
      >
        <LanguageFlag className="tk-language-trigger__flag" language={activeLanguage} />
        <span className="tk-language-trigger__current">{activeLanguage?.nativeName || 'English'}</span>
        <span className="tk-language-trigger__chevron" aria-hidden="true">⌄</span>
      </button>
      <div
        className="tk-language-list"
        id="tk-language-options"
        role="listbox"
        aria-label={copy.language}
        hidden={!open}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          const options = [...event.currentTarget.querySelectorAll('[role="option"]')];
          const index = options.indexOf(document.activeElement);
          const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          event.preventDefault();
          options[nextIndex]?.focus();
        }}
      >
        {getLanguageOptions().map(({ code, nativeName, flagCode }) => (
          <button
            key={code}
            className="tk-language-option"
            type="button"
            role="option"
            aria-selected={code === locale}
            onClick={() => selectLocale(code)}
          >
            <LanguageFlag className="tk-language-option__flag" language={{ code, flagCode }} />
            <span className="tk-language-option__name">{nativeName}</span>
            <span className="tk-language-option__check" aria-hidden="true">✓</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The editor-wide two-row header. Identity, document context, and renderer
 * live in the first row; predictable application commands live in the second.
 */
export function LabEditorHeader({ children, className = '', menus = [] }) {
  const copy = getCopy();
  const editorMenus = menus.some((menu) => menu.id === 'help')
    ? menus
    : [
      ...menus,
      {
        id: 'help',
        label: copy.help,
        items: [
          {
            href: liveLabDocumentationHref(),
            icon: 'info',
            label: copy.documentation,
            testId: 'lab-documentation',
          },
        ],
      },
    ];
  return (
    <header className={`${className} tk tk-lab-editor-header`}>
      <div className="tk-lab-editor-header__main">
        {children}
        <LabLanguagePicker />
      </div>
      <div className="tk-lab-editor-header__commands">
        <LabMenuBar menus={editorMenus} />
      </div>
    </header>
  );
}

/** Common File/Edit/View skeleton; labs add only commands they actually own. */
export function createLabEditorMenus({
  canRedo = false,
  canUndo = false,
  editItems = [],
  fileItems = [],
  onDocument,
  onHome,
  onRedo,
  onUndo,
  viewItems = [],
} = {}) {
  return [
    {
      id: 'file',
      label: getCopy().file,
      items: [
        ...(onHome ? [{ icon: 'home', label: getCopy().labHome, onSelect: onHome }] : []),
        ...(onDocument ? [{ label: getCopy().document, onSelect: onDocument }] : []),
        ...fileItems,
        { separator: true },
        { href: labsHomeHref(), icon: 'home', label: getCopy().allLabs },
      ],
    },
    {
      id: 'edit',
      label: getCopy().edit,
      items: [
        { disabled: !onUndo || !canUndo, icon: 'undo', label: getCopy().undo, onSelect: onUndo, shortcut: '⌘Z' },
        { disabled: !onRedo || !canRedo, icon: 'redo', label: getCopy().redo, onSelect: onRedo, shortcut: '⇧⌘Z' },
        ...editItems,
      ],
    },
    {
      id: 'view',
      label: getCopy().view,
      items: viewItems.length ? viewItems : [
        { icon: 'reset', label: getCopy().reloadPreview, onSelect: () => window.location.reload() },
      ],
    },
  ];
}

function useRendererBackend() {
  const [backend, setBackend] = useState(() => document.body.dataset.rendererBackend || null);
  useEffect(() => {
    // rendererFactory stamps the dataset only after async backend init.
    const read = () => setBackend(document.body.dataset.rendererBackend || null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-renderer-backend'] });
    return () => observer.disconnect();
  }, []);
  return backend;
}

export function RendererToggle({
  supportedKinds = RENDERER_SWITCHER_KINDS,
  unsupportedReason = 'This preview does not support that renderer.',
} = {}) {
  const copy = getCopy();
  const requested = resolveRendererKind();
  const requestedChoice = requested === 'webgpu-forced-gl' ? 'webgl' : requested;
  const backend = useRendererBackend();
  const matches = backend === EXPECTED_BACKEND[requested];
  const supported = new Set(supportedKinds);

  return (
    <span className="tk-renderer" data-testid="renderer-toggle">
      <span className="tk-segmented" role="group">
        {RENDERER_SWITCHER_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={kind === requestedChoice}
            data-renderer-choice={kind}
            disabled={!supported.has(kind)}
            title={supported.has(kind) ? undefined : unsupportedReason}
            onClick={() => {
              if (kind !== requestedChoice) window.location.assign(urlForKind(kind));
            }}
          >
            {kind === 'webgpu' ? copy.rendererWebGpu : copy.rendererWebGl}
          </button>
        ))}
      </span>
      <span
        className="tk-renderer-backend"
        data-state={backend ? (matches ? 'ok' : 'fallback') : 'booting'}
        data-testid="renderer-backend"
        title={!backend
          ? copy.rendererStillStarting
          : matches
            ? copy.rendererBackendMatches
            : copy.rendererRequestedButGot
              .replace('{requested}', requested === 'webgpu' ? copy.rendererWebGpu : copy.rendererWebGl)
              .replace('{actual}', backend === 'webgpu' ? copy.rendererWebGpu : copy.rendererWebGl2)}
      >
        {backend ? `● ${backend === 'webgpu' ? copy.rendererWebGpu : copy.rendererWebGl2}` : copy.rendererBooting}
      </span>
    </span>
  );
}


/**
 * The ONE scene-preview bar: floating bottom-center over the viewport, amber
 * (= never saved into the document). Labs put their preview controls inside:
 * stage/model selects, debug views, scene-light sliders, walk toggles.
 */
export function PreviewBar({ children, hint = null, title = 'Preview only — nothing here is saved into your document.' }) {
  const copy = getCopy();
  return (
    <div className="tk-previewbar tk" data-testid="preview-bar" title={localizeEditorText(title)}>
      <span className="tk-previewbar-chip">{copy.preview}</span>
      {children}
      {hint && <span className="tk-previewbar-hint">{localizeEditorText(hint)}</span>}
    </div>
  );
}

/** Labeled toggle for the preview bar (Walk, Idle, Rain, Spin, …). */
export function PreviewToggle({ checked, disabled = false, label, onChange, testId, title }) {
  return (
    <label className="tk-previewbar-toggle" title={title}>
      <Toggle
        checked={checked}
        disabled={disabled}
        onChange={(next) => {
          onChange(next);
          // Drop focus so keyboard input (WASD walks) reaches the scene.
          document.activeElement?.blur?.();
        }}
        testId={testId}
      />
      <span>{label}</span>
    </label>
  );
}

/** The labeled style/preset picker heading every product inspector. */
export function PresetRowShell({
  children,
  label = 'Preset',
  title = 'The preset you are editing — switching replaces every value in this panel.',
}) {
  return (
    <div className="tk-preset-row">
      <span className="tk-preset-label" title={localizeEditorText(title)}>{localizeEditorText(label)}</span>
      {children}
    </div>
  );
}
