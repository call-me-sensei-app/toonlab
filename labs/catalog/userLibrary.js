// Local user library backed by Postgres. IndexedDB is read once by the
// migration assistant, then retired after the server confirms the commit.

const DB_NAME = 'toonlab.catalog';
const STORE = 'entries';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, work) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = work(store);
      tx.oncomplete = () => resolve(result.result ?? result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

export async function listLibraryEntries() {
  try {
    const response = await fetch('/api/toonlab/library', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`workspace library: ${response.status}`);
    let state = await response.json();
    if (!state.migrated) {
      let legacy = [];
      try { legacy = await withStore('readonly', (store) => store.getAll()); } catch { /* no legacy DB */ }
      const migration = await fetch('/api/toonlab/library/migrate', {
        body: JSON.stringify({ entries: legacy }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!migration.ok) throw new Error(`workspace library migration: ${migration.status}`);
      state = await migration.json();
      if (state.migrated && (state.report?.failures?.length ?? 0) === 0) {
        indexedDB.deleteDatabase(DB_NAME);
      } else {
        throw new Error('workspace library migration retained IndexedDB because some entries failed');
      }
    }
    return state.entries ?? [];
  } catch (error) {
    console.error('Local Postgres library is unavailable.', error);
    return [];
  }
}

export async function saveLibraryEntry(entry) {
  const response = await fetch(`/api/toonlab/library/${encodeURIComponent(entry.id)}`, {
    body: JSON.stringify(entry),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });
  if (!response.ok) throw new Error(`workspace library: ${response.status}`);
  return entry.id;
}

export async function deleteLibraryEntry(id) {
  const response = await fetch(`/api/toonlab/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`workspace library: ${response.status}`);
}

/** Registers every stored entry into a catalog registry; returns count. */
export async function mountLibrary(catalog) {
  const entries = await listLibraryEntries();
  let mounted = 0;
  for (const entry of entries) {
    try {
      catalog.register(entry, { source: 'library' });
      mounted += 1;
    } catch {
      // ignore corrupt rows — the library must never brick the lab
    }
  }
  return mounted;
}
