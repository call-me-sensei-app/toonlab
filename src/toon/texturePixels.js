import * as THREE from 'three';

// Conversion-time CPU access to texture pixels and to the surface a material
// covers. The toon adapter uses it to look at evidence (what an alpha channel
// actually contains, what colour a region is painted) instead of inferring it
// from names. Everything degrades to `null` where pixels are unreachable —
// Node, compressed textures, tainted canvases — and callers must keep their
// no-evidence behaviour in that case.

const pixelCache = new WeakMap();
const surfaceCache = new WeakMap();
const uvScratch = new THREE.Vector2();

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function readDataImage(image) {
  const { data, height, width } = image;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
  const channels = data.length / (width * height);
  if (channels !== 4 && channels !== 3) return null;
  return { channels, data, height, width };
}

function readDrawableImage(image, maxSize) {
  const sourceWidth = image.naturalWidth || image.videoWidth || image.width;
  const sourceHeight = image.naturalHeight || image.videoHeight || image.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  // Nearest sampling keeps a coverage mask binary; bilinear downscaling would
  // invent intermediate alpha along every mask edge.
  context.imageSmoothingEnabled = false;
  try {
    context.drawImage(image, 0, 0, width, height);
    return { channels: 4, data: context.getImageData(0, 0, width, height).data, height, width };
  } catch {
    return null;
  }
}

/**
 * Reads a texture's pixels once (cached per image), downscaled to at most
 * `maxSize` on the long edge. Returns `{ data, width, height, channels }` with
 * 8-bit channels, or `null` when the pixels cannot be read.
 */
export function readTexturePixels(texture, { maxSize = 1024 } = {}) {
  const image = texture?.image;
  if (!image || typeof image !== 'object' || texture.isCompressedTexture) return null;
  if (pixelCache.has(image)) return pixelCache.get(image);
  const pixels = image.data ? readDataImage(image) : readDrawableImage(image, maxSize);
  pixelCache.set(image, pixels);
  return pixels;
}

/**
 * Samples a texture at mesh UV `(u, v)` with the texture's own transform,
 * wrapping and flipY applied. Writes 0-255 RGBA into `target`.
 */
export function sampleTexturePixel(pixels, texture, u, v, target = [0, 0, 0, 255]) {
  uvScratch.set(u, v);
  texture.transformUv(uvScratch);
  const x = Math.min(pixels.width - 1, Math.max(0, Math.floor(uvScratch.x * pixels.width)));
  const y = Math.min(pixels.height - 1, Math.max(0, Math.floor(uvScratch.y * pixels.height)));
  const index = (y * pixels.width + x) * pixels.channels;
  target[0] = pixels.data[index];
  target[1] = pixels.data[index + 1];
  target[2] = pixels.data[index + 2];
  target[3] = pixels.channels === 4 ? pixels.data[index + 3] : 255;
  return target;
}

function triangleIndexRanges(geometry, materialIndex) {
  const indexCount = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  const drawStart = geometry.drawRange.start;
  const drawEnd = Math.min(indexCount, drawStart + geometry.drawRange.count);
  if (materialIndex === null || !geometry.groups?.length) return [[drawStart, drawEnd]];
  return geometry.groups
    .filter((group) => group.materialIndex === materialIndex)
    .map((group) => [Math.max(group.start, drawStart), Math.min(group.start + group.count, drawEnd)])
    .filter(([start, end]) => end > start);
}

// Deterministic so a conversion is reproducible run to run.
function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Area-weighted random points on the triangles a material slot draws
 * (`materialIndex = null` for the whole geometry). Returns a Float32Array of
 * `[u, v, triangleIndex, ...]` triples — the distribution of UVs the rendered
 * surface actually samples, independent of how the atlas is laid out.
 */
export function sampleSurfaceUvs(geometry, { count = 4096, materialIndex = null, seed = 7 } = {}) {
  const position = geometry?.attributes?.position;
  const uv = geometry?.attributes?.uv;
  if (!position || !uv) return new Float32Array(0);

  const key = `${materialIndex}:${count}:${seed}`;
  let perGeometry = surfaceCache.get(geometry);
  if (perGeometry?.has(key)) return perGeometry.get(key);

  const index = geometry.index;
  const vertexAt = (corner) => (index ? index.getX(corner) : corner);
  const triangles = [];
  const areas = [];
  let totalArea = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const [start, end] of triangleIndexRanges(geometry, materialIndex)) {
    for (let corner = start; corner + 2 < end; corner += 3) {
      const i0 = vertexAt(corner);
      const i1 = vertexAt(corner + 1);
      const i2 = vertexAt(corner + 2);
      a.fromBufferAttribute(position, i0);
      b.fromBufferAttribute(position, i1).sub(a);
      c.fromBufferAttribute(position, i2).sub(a);
      const area = b.cross(c).length() * 0.5;
      if (!(area > 0)) continue;
      totalArea += area;
      triangles.push(i0, i1, i2);
      areas.push(totalArea);
    }
  }

  const samples = new Float32Array(totalArea > 0 ? count * 3 : 0);
  const random = createRandom(seed);
  for (let sample = 0; sample < samples.length / 3; sample += 1) {
    // Stratified across the cumulative area so small parts are not skipped.
    const target = ((sample + random()) / count) * totalArea;
    let low = 0;
    let high = areas.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (areas[mid] < target) low = mid + 1;
      else high = mid;
    }
    let r1 = random();
    let r2 = random();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    const r0 = 1 - r1 - r2;
    const [i0, i1, i2] = [triangles[low * 3], triangles[low * 3 + 1], triangles[low * 3 + 2]];
    samples[sample * 3] = uv.getX(i0) * r0 + uv.getX(i1) * r1 + uv.getX(i2) * r2;
    samples[sample * 3 + 1] = uv.getY(i0) * r0 + uv.getY(i1) * r1 + uv.getY(i2) * r2;
    samples[sample * 3 + 2] = low;
  }

  if (!perGeometry) {
    perGeometry = new Map();
    surfaceCache.set(geometry, perGeometry);
  }
  perGeometry.set(key, samples);
  return samples;
}

// Pixel-centre rasteriser: calls visit(x, y, w0, w1, w2) for covered pixels.
export function rasterizeTriangle(ax, ay, bx, by, cx, cy, width, height, visit) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-12) return;
  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      visit(x, y, w0, w1, w2);
    }
  }
}
