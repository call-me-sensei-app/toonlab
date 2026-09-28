// Bark texture presets for Tree Lab. Two are photo-sourced; the
// rest are generated on a canvas at boot — hand-authored stylized bark
// (flat fills + simple marks) that reads better in a toon scene than any
// photo would. Each canvas is seeded so it's identical every session.
//
// tint: the MeshToonMaterial color under the map. Photo textures keep the
// classic warm tint; painted canvases author their own color and take white.

import * as THREE from 'three';
import { createWoodySurfaceNodeMaterial } from '../../../src/vegetation/index.js';

import treeTrunkTextureUrl from '../../shared/textures/tree-trunk-texture.jpg';
import rockTextureUrl from '../../shared/textures/rock-texture.jpg';

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function barkCanvas(paint, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  paint(canvas.getContext('2d'), seededRng(seed), canvas.width, canvas.height);
  return canvas;
}

function paintBirch(ctx, rng, w, h) {
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(0, 0, w, h);
  // Faint vertical shading bands.
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = `rgba(160,158,150,${0.05 + rng() * 0.07})`;
    const x = rng() * w;
    ctx.fillRect(x, 0, 12 + rng() * 30, h);
  }
  // Dark horizontal lenticel dashes — the birch signature.
  for (let i = 0; i < 46; i += 1) {
    const y = rng() * h;
    const x = rng() * w;
    const len = 10 + rng() * 34;
    ctx.strokeStyle = `rgba(40,38,36,${0.55 + rng() * 0.3})`;
    ctx.lineWidth = 2 + rng() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y + (rng() - 0.5) * 4, x + len, y);
    ctx.stroke();
  }
  // A few big dark patches where limbs shed.
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = `rgba(52,48,44,${0.5 + rng() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(rng() * w, rng() * h, 8 + rng() * 16, 5 + rng() * 8, rng(), 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBeech(ctx, rng, w, h) {
  ctx.fillStyle = '#9b968c';
  ctx.fillRect(0, 0, w, h);
  // Smooth bark: soft mottled patches, no fissures.
  for (let i = 0; i < 40; i += 1) {
    const light = rng() > 0.5;
    ctx.fillStyle = light
      ? `rgba(190,186,176,${0.10 + rng() * 0.12})`
      : `rgba(88,92,86,${0.08 + rng() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(rng() * w, rng() * h, 14 + rng() * 30, 20 + rng() * 46, rng() * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintOak(ctx, rng, w, h) {
  ctx.fillStyle = '#6f5843';
  ctx.fillRect(0, 0, w, h);
  // Deep wavy vertical fissures with highlighted ridges between them.
  for (let x = -10; x < w + 10; x += 14 + rng() * 14) {
    ctx.strokeStyle = `rgba(30,22,16,${0.5 + rng() * 0.35})`;
    ctx.lineWidth = 3 + rng() * 5;
    ctx.beginPath();
    let px = x;
    ctx.moveTo(px, -8);
    for (let y = 0; y <= h + 16; y += 32) {
      px += (rng() - 0.5) * 16;
      ctx.lineTo(px, y);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(150,124,96,${0.25 + rng() * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, 0);
    ctx.lineTo(x + 6 + (rng() - 0.5) * 10, h);
    ctx.stroke();
  }
}

function paintPine(ctx, rng, w, h) {
  ctx.fillStyle = '#4a3226';
  ctx.fillRect(0, 0, w, h);
  // Jigsaw plates in warm red-browns with dark gaps between them.
  for (let i = 0; i < 90; i += 1) {
    const shade = 120 + rng() * 60;
    ctx.fillStyle = `rgb(${shade}, ${shade * 0.62 | 0}, ${shade * 0.42 | 0})`;
    const x = rng() * w;
    const y = rng() * h;
    const pw = 18 + rng() * 34;
    const ph = 26 + rng() * 52;
    ctx.beginPath();
    ctx.moveTo(x + (rng() - 0.5) * 6, y);
    ctx.lineTo(x + pw, y + (rng() - 0.5) * 8);
    ctx.lineTo(x + pw + (rng() - 0.5) * 6, y + ph);
    ctx.lineTo(x + (rng() - 0.5) * 8, y + ph + (rng() - 0.5) * 6);
    ctx.closePath();
    ctx.fill();
  }
}

function paintAsh(ctx, rng, w, h) {
  ctx.fillStyle = '#8b8578';
  ctx.fillRect(0, 0, w, h);
  // Tight diamond-ridge lattice.
  ctx.strokeStyle = 'rgba(52,48,42,0.45)';
  for (let x = -20; x < w + 20; x += 22) {
    for (const dir of [1, -1]) {
      ctx.lineWidth = 2 + rng() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + dir * h * 0.35, h);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 24; i += 1) {
    ctx.fillStyle = `rgba(170,164,150,${0.1 + rng() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(rng() * w, rng() * h, 10 + rng() * 18, 16 + rng() * 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const BARK_TEXTURE_PRESETS = {
  classic: { label: 'Classic', src: treeTrunkTextureUrl, tint: 0xc9ab8a },
  birch: { label: 'Birch', paint: paintBirch, seed: 11, tint: 0xffffff },
  beech: { label: 'Beech', paint: paintBeech, seed: 23, tint: 0xffffff },
  oak: { label: 'Oak', paint: paintOak, seed: 37, tint: 0xffffff },
  pine: { label: 'Pine', paint: paintPine, seed: 51, tint: 0xffffff },
  ash: { label: 'Ash', paint: paintAsh, seed: 67, tint: 0xffffff },
  craggy: { label: 'Craggy', src: rockTextureUrl, tint: 0xc9ab8a },
};

const textureLoader = new THREE.TextureLoader();
const barkTextureCache = new Map();

function configureBarkTexture(texture, id) {
  texture.name = `ToonlabBark.${id}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Canvas for a painted preset (cached by the engine as a CanvasTexture). */
export function paintedBarkCanvas(id) {
  const preset = BARK_TEXTURE_PRESETS[id];
  if (!preset?.paint) return null;
  return barkCanvas(preset.paint, preset.seed);
}

export function barkTextureFor(id, dataUrl) {
  const key = id === 'custom' ? dataUrl : id;
  if (!key || id === 'none') return null;
  if (!barkTextureCache.has(key)) {
    const preset = BARK_TEXTURE_PRESETS[id];
    let texture = null;
    if (id === 'custom' && dataUrl) texture = textureLoader.load(dataUrl);
    else if (preset?.src) texture = textureLoader.load(preset.src);
    else if (preset?.paint) texture = new THREE.CanvasTexture(paintedBarkCanvas(id));
    if (!texture) return null;
    barkTextureCache.set(key, configureBarkTexture(texture, id));
  }
  return barkTextureCache.get(key);
}

export function createBarkMaterial(choice = {}, { height = 1, vegetationShader = null } = {}) {
  const id = choice?.id ?? 'classic';
  const map = id === 'none' ? null : barkTextureFor(id, choice?.dataUrl);
  const tint = BARK_TEXTURE_PRESETS[id]?.tint ?? 0xc9ab8a;
  return createWoodySurfaceNodeMaterial({
    color: map ? tint : 0xc9ab8a,
    height,
    map,
    vegetationShader,
  });
}
