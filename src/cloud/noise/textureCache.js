// Bound cache-owned retention without disposing textures still used by a
// renderer or host. Weak entries preserve identity for live consumers; the
// browser can reclaim unreferenced textures after they leave the recent set.
const recent = new Map();
const entries = new Map();
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 32;
let retainedBytes = 0;
const finalized = new FinalizationRegistry(({ key, ref }) => {
  if (entries.get(key)?.ref === ref) entries.delete(key);
});

function forget(key) {
  const item = recent.get(key);
  if (item) retainedBytes -= item.bytes;
  recent.delete(key);
  const entry = entries.get(key);
  if (entry) finalized.unregister(entry.ref);
  entries.delete(key);
}

function retain(key, texture, bytes) {
  const previous = recent.get(key);
  if (previous) retainedBytes -= previous.bytes;
  recent.delete(key);
  recent.set(key, { texture, bytes });
  retainedBytes += bytes;
  while (retainedBytes > MAX_BYTES || recent.size > MAX_ENTRIES) {
    const oldest = recent.keys().next().value;
    retainedBytes -= recent.get(oldest).bytes;
    recent.delete(oldest);
  }
}

export function getCloudTextureCacheStats() {
  return { retainedBytes, retainedEntries: recent.size, maxBytes: MAX_BYTES, maxEntries: MAX_ENTRIES };
}

export function createCloudTextureCache(namespace) {
  const prefix = `${namespace}:`;
  return {
    get(key) {
      const id = prefix + key;
      const entry = entries.get(id);
      const texture = entry?.ref.deref();
      if (!texture) { forget(id); return undefined; }
      retain(id, texture, entry.bytes);
      return texture;
    },
    set(key, texture) {
      const id = prefix + key;
      forget(id);
      const levels = texture.userData?.toonlabVolumeMipChain?.levels;
      const bytes = levels
        ? levels.reduce((sum, data) => sum + data.byteLength, 0)
        : (texture.image?.data?.byteLength ?? 0);
      const ref = new WeakRef(texture);
      entries.set(id, { ref, bytes });
      finalized.register(texture, { key: id, ref }, ref);
      texture.addEventListener('dispose', () => {
        if (entries.get(id)?.ref === ref) forget(id);
      });
      retain(id, texture, bytes);
    },
    *values() {
      for (const [key, entry] of entries) {
        if (key.startsWith(prefix)) {
          const texture = entry.ref.deref();
          if (texture) yield texture;
        }
      }
    },
    clear() {
      for (const key of entries.keys()) if (key.startsWith(prefix)) forget(key);
    },
  };
}
