// Direct, account-free downloads straight from Poly Haven's CDN.
// dl.polyhaven.org answers cross-origin (ACAO *), so the browser fetches the
// asset's file set itself and packs a ZIP client-side — no ToonLab backend.
// HDRIs are a single .hdr; textures zip their map set; models zip the glTF
// bundle (gltf + bin + textures, relative paths preserved).

// Browser JavaScript cannot override User-Agent. The dev/host proxy attaches
// ToonLab's identifying header before forwarding these metadata requests.
const API = '/api/polyhaven';

// Bundle/scene formats — not part of a texture's per-map file set.
const BUNDLE_KEYS = new Set(['blend', 'gltf', 'mtlx', 'usd', 'fbx']);
// 4k matches Poly Haven's own default download; neighbours as fallback.
const RES_PREFERENCE = ['4k', '2k', '8k', '1k', '16k'];
const FORMAT_PREFERENCE = ['jpg', 'png', 'hdr', 'exr'];

function pickRes(byRes) {
  return RES_PREFERENCE.find((r) => byRes?.[r]) ?? Object.keys(byRes ?? {})[0];
}

function pickFormat(byFormat) {
  const key = FORMAT_PREFERENCE.find((f) => byFormat?.[f]) ?? Object.keys(byFormat ?? {})[0];
  return key ? byFormat[key] : null;
}

function basename(url) {
  return decodeURIComponent(new URL(url).pathname.split('/').pop());
}

function licenseEntry(id) {
  const text = `${id} — from Poly Haven (https://polyhaven.com/a/${id})\nLicense: CC0 (https://creativecommons.org/publicdomain/zero/1.0/)\nAttribution isn't required — the makers earn it anyway.\n`;
  return { name: 'LICENSE.txt', data: new TextEncoder().encode(text) };
}

/** Resolve the asset's file plan: what to fetch and what to save it as. */
async function filePlan(id, kind) {
  const res = await fetch(`${API}/files/${id}`);
  if (!res.ok) throw new Error(`polyhaven files → HTTP ${res.status}`);
  const files = await res.json();

  if (kind === 'hdri') {
    const byRes = files.hdri ?? {};
    const resKey = pickRes(byRes);
    const file = pickFormat(byRes[resKey] ?? {});
    if (!file?.url) throw new Error('no hdri file listed');
    return { files: [{ name: basename(file.url), url: file.url }], saveAs: basename(file.url), zip: false };
  }

  if (kind === 'model') {
    // The glTF bundle is the engine-friendly pick; fall back to fbx/blend.
    for (const bundle of ['gltf', 'fbx', 'blend']) {
      const byRes = files[bundle];
      if (!byRes) continue;
      const resKey = pickRes(byRes);
      const main = byRes[resKey]?.[bundle];
      if (!main?.url) continue;
      const list = [{ name: basename(main.url), url: main.url }];
      for (const [rel, f] of Object.entries(main.include ?? {})) {
        if (f?.url) list.push({ name: rel, url: f.url });
      }
      return { files: list, saveAs: `${id}_${resKey}_${bundle}.zip`, zip: true };
    }
    throw new Error('no model bundle listed');
  }

  // texture: one file per map at the preferred resolution.
  const list = [];
  let resLabel = '';
  for (const [map, byRes] of Object.entries(files)) {
    if (BUNDLE_KEYS.has(map)) continue;
    const resKey = pickRes(byRes);
    const file = pickFormat(byRes?.[resKey] ?? {});
    if (!file?.url) continue;
    resLabel = resLabel || resKey;
    list.push({ name: basename(file.url), url: file.url });
  }
  if (!list.length) throw new Error('no texture maps listed');
  return { files: list, saveAs: `${id}_${resLabel}.zip`, zip: true };
}

// ---- store-only ZIP writer (maps are already-compressed jpg/png) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // utf-8 names
    local.setUint16(8, 0, true); // method: store
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(local.buffer, nameBytes, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true); // made by
    dir.setUint16(6, 20, true); // version needed
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    central.push(dir.buffer, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dirSize = central.reduce((sum, c) => sum + (c.byteLength ?? c.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
}

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/**
 * Download a Poly Haven asset directly — resolves once the save dialog has
 * been handed the file; throws on any failure (callers fall back to the
 * source page). onProgress(done, total, phase: 'fetch'|'pack') drives button
 * labels.
 */
export async function downloadPolyhavenAsset({ id, kind, onProgress }) {
  const plan = await filePlan(id, kind);
  const total = plan.files.length;
  let done = 0;
  onProgress?.(0, total, 'fetch');

  // A few fetches in flight at a time; CDN files can be tens of MB each.
  const results = new Array(total);
  let next = 0;
  async function worker() {
    while (next < total) {
      const i = next++;
      const file = plan.files[i];
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`${file.name} → HTTP ${res.status}`);
      results[i] = { name: file.name, data: new Uint8Array(await res.arrayBuffer()) };
      done += 1;
      onProgress?.(done, total, 'fetch');
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, total) }, worker));

  if (!plan.zip) {
    saveBlob(new Blob([results[0].data]), plan.saveAs);
    return plan.saveAs;
  }
  onProgress?.(total, total, 'pack');
  saveBlob(buildZip([...results, licenseEntry(id)]), plan.saveAs);
  return plan.saveAs;
}
