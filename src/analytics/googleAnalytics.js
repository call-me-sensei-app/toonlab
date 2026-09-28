const DEFAULT_MEASUREMENT_ID = 'G-78D373M2C8';
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || DEFAULT_MEASUREMENT_ID;
const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const IS_LOCAL = LOCAL_HOSTS.has(window.location.hostname);
const DEBUG_ENABLED = new URLSearchParams(window.location.search).get('ga_debug') === '1';
const COLLECTION_ENABLED = !IS_LOCAL || DEBUG_ENABLED;
const MAX_PARAMETER_LENGTH = 100;

const ACTION_KEYWORDS = Object.freeze([
  ['subscribe', 'subscribe'],
  ['checkout', 'checkout'],
  ['upgrade', 'upgrade'],
  ['purchase', 'purchase'],
  ['generate', 'generate'],
  ['create', 'create'],
  ['reroll', 'reroll'],
  ['render', 'render'],
  ['preview', 'preview'],
  ['apply', 'apply'],
  ['save', 'save'],
  ['export', 'export'],
  ['download', 'download'],
  ['import', 'import'],
  ['upload', 'upload'],
  ['copy', 'copy'],
  ['share', 'share'],
  ['publish', 'publish'],
  ['delete', 'delete'],
  ['remove', 'remove'],
  ['reset', 'reset'],
  ['undo', 'undo'],
  ['redo', 'redo'],
  ['retry', 'retry'],
  ['run', 'run'],
  ['play', 'play'],
  ['pause', 'pause'],
  ['stop', 'stop'],
]);

function snakeCase(value, fallback = 'unknown') {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_PARAMETER_LENGTH);
  return normalized || fallback;
}

function safePath(url = window.location.href) {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return `${window.location.origin}${window.location.pathname}`;
  }
}

function pageContext() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const leaf = segments.at(-1) || 'home';
  const labId = leaf.endsWith('-lab')
    ? leaf
    : segments.find((segment) => segment.endsWith('-lab')) || leaf;
  let appArea = 'labs';
  if (segments[0] === 'asset') appArea = 'asset_detail';
  else if (segments[0] === 'examples') appArea = 'examples';
  else if (['docs', 'gallery', 'generate', 'library', 'settings', 'styles'].includes(segments[0])) {
    appArea = segments[0];
  } else if (segments.length === 0) {
    appArea = 'home';
  }
  return {
    app_area: snakeCase(appArea),
    lab_id: snakeCase(labId),
    page_path_clean: window.location.pathname,
  };
}

function durationBucket(milliseconds) {
  if (milliseconds < 250) return 'under_250ms';
  if (milliseconds < 1000) return '250ms_1s';
  if (milliseconds < 3000) return '1s_3s';
  if (milliseconds < 10000) return '3s_10s';
  return 'over_10s';
}

function statusCategory(status) {
  if (!Number.isFinite(status) || status <= 0) return 'network_error';
  return `${Math.floor(status / 100)}xx`;
}

function actionName(element) {
  const explicit = element.closest('[data-analytics-action]')?.dataset.analyticsAction;
  if (explicit) return snakeCase(explicit);
  const candidate = [
    element.id,
    element.getAttribute('name'),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.textContent,
  ].find(Boolean);
  const normalized = snakeCase(candidate, '');
  const match = ACTION_KEYWORDS.find(([keyword]) => normalized.includes(keyword));
  return match?.[1] || '';
}

function controlId(element) {
  const explicit = element.closest('[data-analytics-control]')?.dataset.analyticsControl;
  const labelledBy = element.getAttribute('aria-labelledby');
  const label = labelledBy
    ? document.getElementById(labelledBy)?.textContent
    : element.labels?.[0]?.textContent;
  return snakeCase(explicit || element.id || element.name || label || element.type);
}

window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}

gtag('consent', 'default', {
  ad_personalization: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  analytics_storage: 'granted',
  functionality_storage: 'granted',
  security_storage: 'granted',
});
gtag('js', new Date());
gtag('config', MEASUREMENT_ID, {
  allow_ad_personalization_signals: false,
  allow_google_signals: false,
  debug_mode: DEBUG_ENABLED,
  page_location: safePath(),
  page_referrer: document.referrer ? safePath(document.referrer) : undefined,
  send_page_view: false,
  transport_type: 'beacon',
});

if (COLLECTION_ENABLED) {
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.append(script);
}

export function trackEvent(name, parameters = {}) {
  if (!COLLECTION_ENABLED) return;
  const safeParameters = Object.fromEntries(
    Object.entries({ ...pageContext(), ...parameters })
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [
        snakeCase(key),
        typeof value === 'string' ? value.slice(0, MAX_PARAMETER_LENGTH) : value,
      ]),
  );
  gtag('event', snakeCase(name), safeParameters);
}

export function setAnalyticsUser(userId, properties = {}) {
  gtag('set', 'user_properties', Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [snakeCase(key), snakeCase(value)]),
  ));
  gtag('config', MEASUREMENT_ID, {
    user_id: userId ? String(userId).slice(0, 256) : undefined,
  });
}

export function setAnalyticsConsent(granted) {
  gtag('consent', 'update', {
    analytics_storage: granted ? 'granted' : 'denied',
  });
}

export function trackFunnelStep(funnelName, stepName, parameters = {}) {
  trackEvent('funnel_step', {
    ...parameters,
    funnel_name: snakeCase(funnelName),
    funnel_step: snakeCase(stepName),
  });
}

const context = pageContext();
trackEvent('page_view', {
  page_location: safePath(),
  page_referrer: document.referrer ? safePath(document.referrer) : undefined,
  page_title: document.title.slice(0, MAX_PARAMETER_LENGTH),
});

if (context.app_area === 'labs' && context.lab_id !== 'home') {
  trackEvent('lab_open');
  trackFunnelStep('product_activation', 'lab_opened');
}

if (context.app_area === 'asset_detail') {
  trackEvent('view_item', {
    item_category: 'asset',
    item_id: snakeCase(window.location.pathname.split('/').filter(Boolean).at(-1)),
  });
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const interactive = target?.closest('a, button, [role="button"], [data-analytics-event]');
  if (!interactive) return;

  const explicitEvent = interactive.dataset.analyticsEvent;
  if (explicitEvent) {
    trackEvent(explicitEvent, {
      action_name: actionName(interactive) || undefined,
      component_id: snakeCase(interactive.id || interactive.dataset.analyticsComponent),
    });
    return;
  }

  if (interactive instanceof HTMLAnchorElement) {
    const destination = new URL(interactive.href, window.location.origin);
    const destinationSegments = destination.pathname.split('/').filter(Boolean);
    const destinationLeaf = destinationSegments.at(-1) || 'home';
    if (destination.origin === window.location.origin && destinationLeaf.endsWith('-lab')) {
      trackEvent('select_item', {
        item_category: 'lab',
        item_id: snakeCase(destinationLeaf),
      });
      trackFunnelStep('product_activation', 'lab_selected', {
        selected_lab: snakeCase(destinationLeaf),
      });
    }
  }

  const action = actionName(interactive);
  if (!action) return;
  trackEvent('tool_action', {
    action_name: action,
    component_id: snakeCase(interactive.id || interactive.getAttribute('name')),
  });
  if (['generate', 'create', 'render', 'run'].includes(action)) {
    trackFunnelStep('creation', 'creation_started', { action_name: action });
  } else if (action === 'save') {
    trackFunnelStep('creation', 'save_started');
  } else if (['export', 'download'].includes(action)) {
    trackFunnelStep('creation', 'export_started', { action_name: action });
  } else if (['checkout', 'subscribe', 'upgrade'].includes(action)) {
    trackFunnelStep('subscription', `${action}_started`);
  }
}, { capture: true });

const pendingControlEvents = new Map();
document.addEventListener('change', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement
    || control instanceof HTMLSelectElement
    || control instanceof HTMLTextAreaElement)) return;

  const id = controlId(control);
  window.clearTimeout(pendingControlEvents.get(id));
  pendingControlEvents.set(id, window.setTimeout(() => {
    pendingControlEvents.delete(id);
    if (control instanceof HTMLInputElement && control.type === 'file') {
      trackEvent('file_selected', {
        control_id: id,
        file_count: control.files?.length || 0,
      });
      return;
    }
    trackEvent('parameter_changed', {
      control_id: id,
      control_type: snakeCase(control.type || control.tagName),
    });
    trackFunnelStep('product_activation', 'parameter_changed');
  }, 400));
}, { capture: true });

const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const startedAt = Date.now();
  const request = args[0] instanceof Request ? args[0] : null;
  const url = new URL(request?.url || String(args[0]), window.location.origin);
  const method = String(args[1]?.method || request?.method || 'GET').toUpperCase();
  const shouldMeasure = url.origin === window.location.origin && url.pathname.startsWith('/api/');
  try {
    const response = await originalFetch(...args);
    if (shouldMeasure) {
      const durationMs = Date.now() - startedAt;
      const apiArea = snakeCase(url.pathname.split('/').filter(Boolean).slice(1, 3).join('_'));
      trackEvent('api_request', {
        api_area: apiArea,
        duration_bucket: durationBucket(durationMs),
        request_method: method,
        result: response.ok ? 'success' : 'failure',
        status_category: statusCategory(response.status),
      });
      if (method !== 'GET' && response.ok && url.pathname.includes('/library')) {
        trackEvent('artifact_saved', { api_area: apiArea });
        trackFunnelStep('creation', 'artifact_saved');
      }
      if (method !== 'GET' && response.ok && url.pathname.includes('/generate')) {
        trackEvent('generation_completed', { api_area: apiArea });
        trackFunnelStep('creation', 'generation_completed');
      }
      if (method !== 'GET' && response.ok && url.pathname.includes('/files/')) {
        trackEvent('export_completed', { api_area: apiArea });
        trackFunnelStep('creation', 'export_completed');
      }
    }
    return response;
  } catch (error) {
    if (shouldMeasure) {
      trackEvent('api_request', {
        api_area: snakeCase(url.pathname.split('/').filter(Boolean).slice(1, 3).join('_')),
        duration_bucket: durationBucket(Date.now() - startedAt),
        request_method: method,
        result: 'network_error',
        status_category: 'network_error',
      });
    }
    throw error;
  }
};

window.addEventListener('error', (event) => {
  trackEvent('app_error', {
    error_type: snakeCase(event.error?.name || 'runtime_error'),
    source_area: snakeCase(event.filename?.split('/').slice(-2, -1)[0] || 'unknown'),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  trackEvent('app_error', {
    error_type: snakeCase(event.reason?.name || 'unhandled_rejection'),
    source_area: 'promise',
  });
});

window.addEventListener('load', () => {
  window.setTimeout(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (!navigation) return;
    trackEvent('performance_snapshot', {
      dom_ready_bucket: durationBucket(navigation.domContentLoadedEventEnd),
      load_time_bucket: durationBucket(navigation.loadEventEnd),
      renderer: snakeCase(new URLSearchParams(window.location.search).get('renderer') || 'default'),
    });
  }, 0);
}, { once: true });

for (const milestoneSeconds of [30, 120, 300, 600]) {
  window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      trackEvent('engagement_milestone', {
        engagement_seconds: milestoneSeconds,
      });
    }
  }, milestoneSeconds * 1000);
}

document.addEventListener('webglcontextlost', () => {
  trackEvent('render_context_lost', { renderer: 'webgl' });
}, { capture: true });

window.toonlabAnalytics = Object.freeze({
  measurementId: MEASUREMENT_ID,
  setConsent: setAnalyticsConsent,
  setUser: setAnalyticsUser,
  track: trackEvent,
  trackFunnelStep,
});
