// Project PLATEAU open-data client. Unlike the object-oriented GLB sources in
// assetlib, PLATEAU publishes georeferenced Japanese city models as streamed
// 3D Tiles plus municipality-wide CityGML archives. The Gallery therefore
// treats one municipality/ward as one searchable model dataset and links to
// the official `-latest` endpoints; it does not pretend a city is one GLB.

import { ASSETLIB_USER_AGENT } from './assetRef.js';

export const PLATEAU_CATALOG_API_URL =
  'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets';
export const PLATEAU_OPEN_DATA_URL = 'https://www.mlit.go.jp/plateau/opendata/';
export const PLATEAU_SITE_POLICY_URL = 'https://www.mlit.go.jp/plateau/site-policy/';
export const PLATEAU_LICENSE = 'PDL 1.0 / CC BY 4.0 compatible';

export const PLATEAU_ATTRIBUTION = Object.freeze({
  license: PLATEAU_LICENSE,
  requiresAttribution: true,
  sourceLabel: 'Project PLATEAU',
  sourceUrl: PLATEAU_OPEN_DATA_URL,
});

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function areaCode(dataset) {
  return String(dataset.ward_code || dataset.city_code || '').trim();
}

function numericLod(dataset) {
  const lod = Number(dataset.lod);
  return Number.isFinite(lod) ? lod : 0;
}

function candidateScore(dataset) {
  const version = Number.parseFloat(dataset.format_version) || 0;
  return numericLod(dataset) * 100 + (dataset.texture === true ? 10 : 0) + version;
}

function locality(dataset) {
  const parts = [dataset.pref, dataset.city];
  if (dataset.ward && dataset.ward !== dataset.city) parts.push(dataset.ward);
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
}

function actualDatasetYear(payload, selected) {
  let year = null;
  for (const dataset of payload.datasets ?? []) {
    if (dataset?.id !== selected.id || dataset?.format !== '3D Tiles') continue;
    const candidate = Number(dataset.year);
    if (Number.isFinite(candidate) && (year == null || candidate > year)) year = candidate;
  }
  return year;
}

/**
 * Official catalog payload -> one best building dataset per municipality or
 * ward. Highest LOD wins; texture wins within the same LOD. Stable `latest`
 * URLs keep saved refs current when PLATEAU publishes a new survey year.
 */
export function normalizePlateauBuildingDatasets(payload) {
  const source = record(payload);
  if (!source) throw new Error('PLATEAU catalog response must be an object.');

  const bestByArea = new Map();
  for (const dataset of source.latest_datasets ?? []) {
    if (!record(dataset)) continue;
    if (dataset.type_en !== 'bldg' || dataset.format !== '3D Tiles') continue;
    const code = areaCode(dataset);
    if (!/^\d{5}$/.test(code)) continue;
    if (!String(dataset.url ?? '').startsWith('https://api.plateauview.mlit.go.jp/')) continue;
    const current = bestByArea.get(code);
    if (!current || candidateScore(dataset) > candidateScore(current)) {
      bestByArea.set(code, dataset);
    }
  }

  const citygmlByCity = new Map();
  for (const dataset of source.latest_citygml ?? []) {
    if (!record(dataset)) continue;
    const code = String(dataset.city_code ?? dataset.id ?? '').trim();
    if (!/^\d{5}$/.test(code)) continue;
    if (!String(dataset.url ?? '').startsWith('https://api.plateauview.mlit.go.jp/')) continue;
    citygmlByCity.set(code, dataset);
  }

  return [...bestByArea.entries()]
    .map(([code, dataset]) => {
      const place = locality(dataset);
      const citygml = citygmlByCity.get(String(dataset.city_code ?? '').trim()) ?? null;
      const dataYear = actualDatasetYear(source, dataset);
      const lod = numericLod(dataset);
      const attributionText = `出典：国土交通省 Project PLATEAU（${place} 3D都市モデル）`;
      return {
        attribution: Object.freeze({
          ...PLATEAU_ATTRIBUTION,
          text: attributionText,
        }),
        authors: [place].filter(Boolean),
        categories: [
          'japanese architecture',
          '3d city models',
          dataset.pref,
          dataset.city,
          dataset.ward,
        ].map((value) => String(value ?? '').trim()).filter(Boolean),
        citygml: citygml ? {
          featureTypes: Array.isArray(citygml.feature_types) ? [...citygml.feature_types] : [],
          sizeBytes: Number(citygml.file_size) || 0,
          url: citygml.url,
        } : null,
        download: {
          format: '3d-tiles',
          resources: {},
          sizeBytes: Number(dataset.file_size) || 0,
          url: dataset.url,
        },
        id: `${code}-bldg`,
        kind: 'model',
        metadata: {
          catalogId: dataset.id,
          city: dataset.city ?? null,
          cityCode: dataset.city_code ?? null,
          dataYear,
          format: dataset.format,
          formatVersion: dataset.format_version ?? null,
          lod,
          payloadType: '3d-tiles',
          prefecture: dataset.pref ?? null,
          prefectureCode: dataset.pref_code ?? null,
          textured: dataset.texture === true,
          ward: dataset.ward ?? null,
          wardCode: dataset.ward_code ?? null,
        },
        name: `${place} — PLATEAU 建築物モデル`,
        openAccess: true,
        pageUrl: PLATEAU_OPEN_DATA_URL,
        source: 'plateau',
        streamOnly: true,
        tags: [
          'japan',
          'japanese',
          'architecture',
          'building',
          'citygml',
          '3d tiles',
          'plateau',
          `lod${lod}`,
          dataset.texture === true ? 'textured' : 'untextured',
          dataset.pref,
          dataset.city,
          dataset.ward,
        ].map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean),
        thumbnailUrl: null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

let indexPromise = null;

/** Fetch and normalize the live official catalog once per browser/Node process. */
export function fetchPlateauBuildingIndex({
  apiUrl = PLATEAU_CATALOG_API_URL,
  fetchImpl = fetch,
  headers = {},
} = {}) {
  if (!indexPromise || apiUrl !== PLATEAU_CATALOG_API_URL || fetchImpl !== fetch) {
    const promise = (async () => {
      const requestHeaders = new Headers(headers);
      requestHeaders.set('accept', 'application/json');
      if (typeof window === 'undefined' && !requestHeaders.has('user-agent')) {
        requestHeaders.set('user-agent', ASSETLIB_USER_AGENT);
      }
      const response = await fetchImpl(apiUrl, { headers: requestHeaders });
      if (!response.ok) throw new Error(`PLATEAU data catalog: ${response.status}`);
      return normalizePlateauBuildingDatasets(await response.json());
    })();
    if (apiUrl === PLATEAU_CATALOG_API_URL && fetchImpl === fetch) {
      promise.catch(() => {
        if (indexPromise === promise) indexPromise = null;
      });
      indexPromise = promise;
    }
    return promise;
  }
  return indexPromise;
}
