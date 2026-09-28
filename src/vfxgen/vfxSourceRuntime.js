import * as THREE from 'three';

const SIZE = 256;
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createCanvasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, SIZE, SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return { canvas, context, texture };
}

function drawFlowBands(context, source, time) {
  const parameters = source.procedural.parameters;
  const density = Math.max(parameters.density ?? 5, 1);
  const warp = parameters.warp ?? 0.42;
  const contrast = parameters.contrast ?? 0.72;
  const drift = (parameters.drift ?? 0.55) * source.playback.speed;
  const image = context.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x += 1) {
      const u = x / SIZE;
      const bend = Math.sin(v * TAU * 2.1 + time * drift * 1.7) * warp;
      const primary = Math.sin((u + bend) * TAU * density - time * drift * TAU);
      const secondary = Math.sin((u * 0.43 - v * 0.9) * TAU * (density * 0.7) + time * drift * 2.3);
      const signal = Math.max(0, (primary * 0.72 + secondary * 0.28) * 0.5 + 0.5);
      const value = Math.round(255 * Math.pow(signal, 0.35 + contrast * 2.2));
      const index = (y * SIZE + x) * 4;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function drawLightningVeins(context, source, time) {
  const parameters = source.procedural.parameters;
  const branches = Math.max(2, Math.round(parameters.branches ?? 7));
  const width = Math.max(parameters.width ?? 0.12, 0.02);
  const contrast = parameters.contrast ?? 0.84;
  const drift = (parameters.drift ?? 0.7) * source.playback.speed;
  const rng = mulberry32(source.procedural.seed + Math.floor(time * 8 * Math.max(drift, 0.1)));
  context.fillStyle = '#050505';
  context.fillRect(0, 0, SIZE, SIZE);
  context.lineCap = 'round';
  context.shadowColor = '#ffffff';
  context.shadowBlur = 3 + contrast * 7;
  for (let branch = 0; branch < branches; branch += 1) {
    const offset = (branch / branches + time * drift * 0.08) % 1;
    context.beginPath();
    let y = rng() * SIZE;
    context.moveTo(-10, y);
    const segments = 9 + Math.round(rng() * 5);
    for (let segment = 1; segment <= segments; segment += 1) {
      const x = (segment / segments) * (SIZE + 20) - 10;
      y += (rng() - 0.5) * SIZE * (0.12 + width * 0.55);
      y = (y + SIZE) % SIZE;
      context.lineTo(x, y + Math.sin(offset * TAU + segment) * 7);
    }
    context.strokeStyle = `rgba(255,255,255,${0.42 + contrast * 0.52})`;
    context.lineWidth = 0.6 + width * 10;
    context.stroke();
  }
  context.shadowBlur = 0;
}

function drawRadialShards(context, source, time) {
  const parameters = source.procedural.parameters;
  const density = Math.max(4, Math.round(parameters.density ?? 12));
  const width = Math.max(parameters.width ?? 0.2, 0.03);
  const contrast = parameters.contrast ?? 0.78;
  const drift = (parameters.drift ?? 0.32) * source.playback.speed;
  const rng = mulberry32(source.procedural.seed);
  context.fillStyle = '#030303';
  context.fillRect(0, 0, SIZE, SIZE);
  context.save();
  context.translate(SIZE / 2, SIZE / 2);
  context.rotate(time * drift);
  for (let index = 0; index < density; index += 1) {
    const angle = (index / density) * TAU + (rng() - 0.5) * 0.24;
    const inner = 18 + rng() * 28;
    const outer = 74 + rng() * 58;
    const halfWidth = (3 + rng() * 12) * width;
    context.beginPath();
    context.moveTo(Math.cos(angle - halfWidth / inner) * inner, Math.sin(angle - halfWidth / inner) * inner);
    context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    context.lineTo(Math.cos(angle + halfWidth / inner) * inner, Math.sin(angle + halfWidth / inner) * inner);
    context.closePath();
    const value = Math.round(150 + contrast * 105);
    context.fillStyle = `rgb(${value},${value},${value})`;
    context.fill();
  }
  context.restore();
}

function createProceduralRuntime(source) {
  const surface = createCanvasTexture();
  let lastFrame = -1;
  return {
    ...surface,
    source,
    update(time) {
      const frame = Math.floor(time * source.playback.fps);
      if (frame === lastFrame) return;
      lastFrame = frame;
      switch (source.procedural.generator) {
        case 'lightning-veins':
          drawLightningVeins(surface.context, source, time);
          break;
        case 'radial-shards':
          drawRadialShards(surface.context, source, time);
          break;
        default:
          drawFlowBands(surface.context, source, time);
          break;
      }
      surface.texture.needsUpdate = true;
    },
    dispose() {
      surface.texture.dispose();
    },
  };
}

function createFileRuntime(source, runtimeUrl) {
  const surface = createCanvasTexture();
  const isVideo = source.file.mimeType.startsWith('video/');
  const media = document.createElement(isVideo ? 'video' : 'img');
  let ready = false;
  if (isVideo) {
    media.autoplay = true;
    media.loop = source.playback.loop;
    media.muted = true;
    media.playsInline = true;
    media.addEventListener('loadeddata', () => {
      ready = true;
      media.playbackRate = Math.max(source.playback.speed, 0.01);
      media.play().catch(() => {});
    });
  } else {
    media.addEventListener('load', () => { ready = true; });
  }
  media.src = runtimeUrl;
  return {
    ...surface,
    media,
    source,
    update() {
      if (!ready) return;
      const width = media.videoWidth || media.naturalWidth || SIZE;
      const height = media.videoHeight || media.naturalHeight || SIZE;
      const scale = Math.max(SIZE / width, SIZE / height);
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      surface.context.fillStyle = '#000';
      surface.context.fillRect(0, 0, SIZE, SIZE);
      surface.context.drawImage(
        media,
        (SIZE - drawWidth) / 2,
        (SIZE - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
      surface.texture.needsUpdate = true;
    },
    dispose() {
      if (isVideo) media.pause();
      media.removeAttribute('src');
      media.load?.();
      surface.texture.dispose();
    },
  };
}

export function createVfxSourceRuntime({
  runtimeUrls = {},
  sourceAssets = {},
} = {}) {
  const entries = new Map();
  for (const source of Object.values(sourceAssets)) {
    if (source.mode === 'file') {
      const url = runtimeUrls[source.id]?.url;
      if (!url) continue;
      entries.set(source.id, createFileRuntime(source, url));
    } else {
      entries.set(source.id, createProceduralRuntime(source));
    }
  }
  return {
    textures: Object.fromEntries([...entries].map(([id, entry]) => [id, entry.texture])),
    update(time) {
      for (const entry of entries.values()) entry.update(time);
    },
    dispose() {
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
    },
  };
}
