// File -> image-base layer: re-encodes uploads to a bounded data URL so
// documents stay localStorage-friendly (same discipline as debris-lab's
// customTexture). PNG is kept when the source has meaningful alpha,
// otherwise JPEG at quality 0.85.
//
// The converter tiles ONE surface — it has no scene understanding. Because
// people will inevitably drop in whole screenshots/concept scenes, a cheap
// 3x3 luminance-statistics check flags images that look like scenes (strong
// sky-to-ground gradient or divergent regions) and warns without blocking.

import { pickFile } from '../../shared/download.js';
import { toast } from '../../shared/ui/index.js';

const MAX_SIDE = 1024;

/**
 * Heuristic: a material crop is STATIONARY — every region has similar
 * brightness, color, and busyness. Scenes are not: sky-to-ground
 * gradients, divergent region colors, or flat dead zones next to busy
 * ones (dark screenshots). Checked over a 3x3 grid in one pass.
 */
function looksLikeScene(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  const n = 9;
  const sumL = new Float64Array(n);
  const sumL2 = new Float64Array(n);
  const sumR = new Float64Array(n);
  const sumG = new Float64Array(n);
  const sumB = new Float64Array(n);
  const counts = new Float64Array(n);
  for (let y = 0; y < height; y += 2) {
    const row = Math.min(2, Math.floor((y * 3) / height));
    for (let x = 0; x < width; x += 2) {
      const cell = row * 3 + Math.min(2, Math.floor((x * 3) / width));
      const o = (y * width + x) * 4;
      const r = data[o] / 255;
      const g = data[o + 1] / 255;
      const b = data[o + 2] / 255;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      sumL[cell] += luma;
      sumL2[cell] += luma * luma;
      sumR[cell] += r;
      sumG[cell] += g;
      sumB[cell] += b;
      counts[cell] += 1;
    }
  }
  const meanL = [...sumL].map((s, i) => s / (counts[i] || 1));
  const stdL = [...sumL2].map((s, i) => Math.sqrt(Math.max(0, s / (counts[i] || 1) - meanL[i] * meanL[i])));
  const grand = meanL.reduce((a, b) => a + b, 0) / n;
  const lumaSpread = Math.sqrt(meanL.reduce((a, b) => a + (b - grand) ** 2, 0) / n);
  const topBottom = Math.abs((meanL[0] + meanL[1] + meanL[2]) - (meanL[6] + meanL[7] + meanL[8])) / 3;
  // Color divergence between region means (sky vs ground vs props).
  const meanC = [...sumR].map((s, i) => [s / (counts[i] || 1), sumG[i] / (counts[i] || 1), sumB[i] / (counts[i] || 1)]);
  const grandC = [0, 1, 2].map((ch) => meanC.reduce((a, c) => a + c[ch], 0) / n);
  const colorSpread = Math.sqrt(meanC.reduce((a, c) => a + (c[0] - grandC[0]) ** 2 + (c[1] - grandC[1]) ** 2 + (c[2] - grandC[2]) ** 2, 0) / n);
  // Non-stationary busyness: flat dead zones next to detailed ones. This is
  // the strongest separator — measured: material crops ~0.9-1.2, scenes 4+.
  const maxStd = Math.max(...stdL);
  const minStd = Math.min(...stdL);
  const patchy = maxStd > 0.05 && maxStd / (minStd + 0.008) > 2.5;
  return lumaSpread > 0.15 || topBottom > 0.2 || colorSpread > 0.1 || patchy;
}

export async function fileToTextureImage(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not read “${file.name}” as an image.`));
      img.src = objectUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(bitmap.width * scale));
    canvas.height = Math.max(8, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const keepPng = /png|webp/i.test(file.type) && hasAlpha(context, canvas.width, canvas.height);
    const dataUrl = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
    if (looksLikeScene(context, canvas.width, canvas.height)) {
      toast('That looks like a whole scene — this tool tiles ONE surface. Crop the single material you want (wall, ground, fabric) for a clean result.', { ttl: 6500 });
    }
    return { dataUrl, name: file.name.replace(/\.[a-z0-9]+$/i, '') || 'Image' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function hasAlpha(context, width, height) {
  const sample = context.getImageData(0, 0, width, height).data;
  for (let i = 3; i < sample.length; i += 4) {
    if (sample[i] < 255) return true;
  }
  return false;
}

/** Opens the picker and returns an image layer, or null when cancelled. */
export async function pickTextureImage() {
  const file = await pickFile('image/*');
  if (!file) return null;
  return fileToTextureImage(file);
}
