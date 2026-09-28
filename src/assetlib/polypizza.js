// Asset source: Poly Pizza (poly.pizza) — low-poly stylized models (the
// Quaternius catalog, Google Poly CC0/CC-BY survivors, and more). The best
// STYLE fit for a toon renderer of all our sources: authored low-poly takes
// cel shading and outlines far better than photoscans.
//
// BYO API KEY (free: https://poly.pizza/settings/api; their terms: hobby use
// free, commercial pay-as-you-go — a commercial toonlab-pro deployment needs
// its own arrangement). The API sends no CORS headers AND wants the key in a
// header, so browsers go through a backend route that injects it server-side
// (Vite dev proxy: /api/polypizza with TOONLAB_POLYPIZZA_KEY from env; the
// key never reaches the client). Node callers pass `apiKey` directly.
//
// LICENSING: unlike Poly Haven/ambientCG this corpus is NOT all-CC0 — models
// carry Licence 'CC0' or 'CC-BY' (ready-made credit string in Attribution).
// Callers default to CC0-only; CC-BY may be surfaced with its license badge
// and attribution shown, but must never be bundled/redistributed by us.

export const POLYPIZZA_API_URL = 'https://api.poly.pizza/v1.1';
export const POLYPIZZA_STATIC_URL = 'https://static.poly.pizza';

/** Backend/dev-proxy routes the browser uses instead of poly.pizza hosts. */
export const POLYPIZZA_PROXY_API = '/api/polypizza';
export const POLYPIZZA_PROXY_STATIC = '/api/polypizza-static';

export const POLYPIZZA_SOURCE = Object.freeze({
  sourceLabel: 'Poly Pizza',
  sourceUrl: 'https://poly.pizza',
});

/** Absolute static.poly.pizza url → same request through the proxy route. */
export function rewritePolyPizzaDownloadUrl(url, base = POLYPIZZA_PROXY_STATIC) {
  return String(url ?? '').replace(POLYPIZZA_STATIC_URL, base);
}

function normalizeLicence(licence) {
  const value = String(licence ?? '').toUpperCase().replace(/\s+/g, '-');
  return value.includes('CC0') ? 'CC0' : value || 'unknown';
}

/** One API model object → normalized ref (kind is always 'model'). */
export function normalizePolyPizzaModel(model) {
  if (!model?.ID) return null;
  return {
    animated: Boolean(model.Animated),
    attribution: {
      license: normalizeLicence(model.Licence),
      // Poly Pizza ships the exact credit line CC-BY requires — keep it.
      text: model.Attribution ?? null,
      ...POLYPIZZA_SOURCE,
    },
    authors: model.Creator?.Username ? [model.Creator.Username] : [],
    categories: model.Category ? [String(model.Category).toLowerCase()] : [],
    download: { format: 'glb', url: model.Download },
    id: model.ID,
    kind: 'model',
    name: model.Title ?? model.ID,
    pageUrl: `https://poly.pizza/m/${encodeURIComponent(model.ID)}`,
    polycount: model['Tri Count'] ?? null,
    source: 'polypizza',
    tags: (model.Tags ?? []).map((value) => String(value).toLowerCase()),
    thumbnailUrl: model.Thumbnail ?? null,
  };
}

function keyHeaders(apiKey) {
  return apiKey ? { 'x-auth-token': apiKey } : {};
}

async function requireOk(response, what) {
  if (response.status === 401) {
    throw new Error(`Poly Pizza ${what}: 401 — API key missing or invalid. Get a free key at poly.pizza/settings/api, then paste it in the sidebar (or set TOONLAB_POLYPIZZA_KEY for the dev server / MCP).`);
  }
  if (!response.ok) throw new Error(`Poly Pizza ${what}: ${response.status}`);
  return response;
}

/**
 * Keyword search. The endpoint requires a search term; callers with an empty
 * query should supply a starter word. `cc0Only` (default true) drops CC-BY
 * results — flip it off only where the license badge + attribution show.
 */
export async function searchPolyPizza({
  query,
  limit = 32,
  page = 0,
  cc0Only = true,
  apiUrl = POLYPIZZA_API_URL,
  apiKey = null,
  fetchImpl = fetch,
} = {}) {
  const keyword = String(query ?? '').trim() || 'low poly';
  const params = new URLSearchParams({ Limit: String(limit), Page: String(page) });
  const response = await fetchImpl(
    `${apiUrl}/search/${encodeURIComponent(keyword)}?${params}`,
    { headers: keyHeaders(apiKey) },
  );
  await requireOk(response, 'search');
  const payload = await response.json();
  const refs = (payload?.results ?? []).map(normalizePolyPizzaModel).filter(Boolean);
  return cc0Only ? refs.filter((ref) => ref.attribution.license === 'CC0') : refs;
}

/** Exact lookup by model id (headless boot, MCP get/import). */
export async function fetchPolyPizzaModel(id, {
  apiUrl = POLYPIZZA_API_URL,
  apiKey = null,
  fetchImpl = fetch,
} = {}) {
  const response = await fetchImpl(
    `${apiUrl}/model/${encodeURIComponent(id)}`,
    { headers: keyHeaders(apiKey) },
  );
  await requireOk(response, `model/${id}`);
  return normalizePolyPizzaModel(await response.json());
}
