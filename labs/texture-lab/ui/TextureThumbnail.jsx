// Live-baked preset thumbnails: every card renders the real generator at a
// small size through a shared sequential queue (69 presets ≈ well under a
// second total), cached per session. No prebaked assets to drift.

import { useEffect, useState } from 'react';

import { createTextureSettings, evaluateTextureMaps } from '../../../src/texgen/index.js';

const THUMB_SIZE = 96;
const cache = new Map();
let queue = Promise.resolve();

function bakeThumbnail(preset) {
  if (cache.has(preset.id)) return cache.get(preset.id);
  const job = queue.then(async () => {
    const maps = await evaluateTextureMaps(createTextureSettings(preset.settings), { size: THUMB_SIZE });
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext('2d');
    const image = new ImageData(new Uint8ClampedArray(maps.albedo.buffer, maps.albedo.byteOffset, maps.albedo.byteLength), THUMB_SIZE, THUMB_SIZE);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }).catch(() => null);
  cache.set(preset.id, job);
  queue = job;
  return job;
}

/** Invalidate a cached thumbnail (after overwriting a local preset). */
export function invalidateTextureThumbnail(id) {
  cache.delete(id);
}

export function TextureThumbnail({ preset }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    bakeThumbnail(preset).then((dataUrl) => { if (alive) setUrl(dataUrl); });
    return () => { alive = false; };
  }, [preset]);
  return url
    ? <img className="tx-thumb" src={url} alt={preset.label} draggable={false} />
    : <span className="tx-thumb tx-thumb-pending" aria-hidden="true" />;
}
