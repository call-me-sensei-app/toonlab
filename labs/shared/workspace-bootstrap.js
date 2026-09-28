// Vite's local workspace bridge. It runs as a classic blocking script before
// lab modules so synchronous localStorage-based stores can keep their public
// API while local Postgres becomes the durable source of truth.
// Static/hosted builds receive a 404 and fall back to normal browser storage.
(function bootstrapToonLabWorkspace() {
  const storageUrl = '/api/toonlab/storage';
  const sensitiveKeys = new Set([
    'toonlab.asset-lab.polypizza-key.v1',
    'toonlab.texture-lab.ai.v1',
  ]);
  const persistable = (key) => {
    const value = String(key ?? '');
    return !sensitiveKeys.has(value)
      && !/(?:api.?key|auth|credential|password|secret|token)/i.test(value)
      && !value.includes('.thumb')
      && !value.endsWith('.__probe__')
      && (value.startsWith('toonlab.') || value.startsWith('threejs-toon-shader.'));
  };

  const prototype = globalThis.Storage?.prototype;
  if (!prototype) return;
  const native = {
    clear: prototype.clear,
    getItem: prototype.getItem,
    key: prototype.key,
    removeItem: prototype.removeItem,
    setItem: prototype.setItem,
  };

  function syncRequest(method, url, payload = null) {
    try {
      const request = new XMLHttpRequest();
      request.open(method, url, false);
      request.setRequestHeader('accept', 'application/json');
      if (payload !== null) request.setRequestHeader('content-type', 'application/json');
      request.send(payload === null ? null : JSON.stringify(payload));
      if (request.status < 200 || request.status >= 300) return null;
      return JSON.parse(request.responseText);
    } catch {
      return null;
    }
  }

  const disk = syncRequest('GET', storageUrl);
  if (!disk) {
    globalThis.__TOONLAB_WORKSPACE__ = { connected: false, mode: 'browser' };
    return;
  }

  const local = globalThis.localStorage;
  if (!disk.initialized) {
    const entries = {};
    for (let index = 0; index < local.length; index += 1) {
      const key = native.key.call(local, index);
      if (persistable(key)) entries[key] = native.getItem.call(local, key);
    }
    const migrated = syncRequest('POST', `${storageUrl}/import`, { entries });
    if (!migrated?.initialized) {
      globalThis.__TOONLAB_WORKSPACE__ = {
        connected: false,
        migrationFailed: true,
        mode: 'browser',
      };
      return;
    }
    disk.entries = migrated.entries ?? entries;
  }

  // Retire durable browser copies after the database import has committed.
  // A Map preserves the synchronous Storage-shaped API for existing labs.
  const memory = new Map(Object.entries(disk.entries ?? {}));
  const browserKeys = [];
  for (let index = 0; index < local.length; index += 1) {
    const key = native.key.call(local, index);
    if (persistable(key)) browserKeys.push(key);
  }
  for (const key of browserKeys) native.removeItem.call(local, key);

  prototype.getItem = function getItem(key) {
    if (isLocalStorage(this) && persistable(key)) {
      return memory.has(String(key)) ? memory.get(String(key)) : null;
    }
    return native.getItem.call(this, key);
  };

  prototype.key = function key(index) {
    if (isLocalStorage(this) && index < memory.size) return [...memory.keys()][index] ?? null;
    return native.key.call(this, index - (isLocalStorage(this) ? memory.size : 0));
  };

  let writeQueue = Promise.resolve();
  let lastWriteSucceeded = true;
  function enqueue(path, options) {
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        // Keepalive requests share a 64 KiB in-flight body quota. Mesh drafts
        // routinely exceed it; normal fetch is required for those payloads.
        const response = await fetch(path, { ...options,
          keepalive: !options.body || new TextEncoder().encode(options.body).byteLength < 60_000,
        });
        if (!response.ok) throw new Error(`Workspace save failed (${response.status}).`);
        lastWriteSucceeded = true;
      })
      .catch((error) => {
        lastWriteSucceeded = false;
        console.error('ToonLab workspace save failed:', error);
      });
  }

  function isLocalStorage(target) {
    try {
      return target === globalThis.localStorage;
    } catch {
      return false;
    }
  }

  prototype.setItem = function setItem(key, value) {
    if (isLocalStorage(this) && persistable(key)) {
      memory.set(String(key), String(value));
      enqueue(`${storageUrl}/${encodeURIComponent(key)}`, {
        body: JSON.stringify({ value: String(value) }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      });
      return;
    }
    native.setItem.call(this, key, value);
  };

  prototype.removeItem = function removeItem(key) {
    if (isLocalStorage(this) && persistable(key)) {
      memory.delete(String(key));
      enqueue(`${storageUrl}/${encodeURIComponent(key)}`, { method: 'DELETE' });
      return;
    }
    native.removeItem.call(this, key);
  };

  prototype.clear = function clear() {
    if (isLocalStorage(this)) {
      memory.clear();
      native.clear.call(this);
      enqueue(storageUrl, { method: 'DELETE' });
      return;
    }
    native.clear.call(this);
  };

  globalThis.__TOONLAB_WORKSPACE__ = {
    connected: true,
    flush: () => writeQueue.then(() => lastWriteSucceeded),
    mode: 'postgres',
  };
  globalThis.dispatchEvent(new CustomEvent('toonlab:workspace-ready', {
    detail: globalThis.__TOONLAB_WORKSPACE__,
  }));
}());
