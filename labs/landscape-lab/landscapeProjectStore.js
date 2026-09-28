// IndexedDB persistence for Landscape Lab. Unlike the localStorage labs, a
// landscape project carries multi-MB typed arrays (heights, splat, foliage
// instances) — IndexedDB stores them natively via structured clone with no
// encoding on the autosave path. localStorage would hit its ~5 MB quota on a
// default project. The portable JSON document (landscapeDocument.js) is only
// for export/import/share. All failures degrade to "editing continues
// unsaved" (private mode never breaks the lab).

const DB_NAME = 'toonlab.landscape-lab';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const AUTOSAVE_KEY = 'autosave';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = window.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Loads the autosaved project payload, or null. Shape:
 * `{ name, settings, palette, terrain: { tilesX, tilesZ, quadsPerTile,
 * spacing, origin, heights: Float32Array, splat: Uint8Array },
 * foliageLayers: [{ paletteId, instances: Float32Array }] }`.
 */
export async function loadLandscapeProject() {
  try {
    const db = await openDb();
    if (!db) return null;
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const saved = await requestToPromise(transaction.objectStore(STORE_NAME).get(AUTOSAVE_KEY));
    if (!saved?.terrain?.heights || !(saved.terrain.heights instanceof Float32Array)) return null;
    return saved;
  } catch {
    return null;
  }
}

/** Autosaves the project payload (structured clone snapshots the arrays). */
export async function saveLandscapeProject(payload) {
  try {
    const db = await openDb();
    if (!db) return false;
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ ...payload, savedAt: Date.now() }, AUTOSAVE_KEY);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch {
    return false; // quota/private mode: editing continues unsaved
  }
}

export async function clearLandscapeProject() {
  try {
    const db = await openDb();
    if (!db) return;
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(AUTOSAVE_KEY);
  } catch { /* ignore */ }
}
