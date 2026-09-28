// Headless visual check for the debris generator: builds every built-in
// preset in Node and software-rasterizes each to a PNG (no GPU needed).
// Usage: node scripts/render-debris-presets.mjs [outDir] [presetIdFilter,...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { createDebrisAsset, createDebrisSettings, settleDebrisPhysics } from '../src/debrisgen/index.js';
import { BUILT_IN_DEBRIS_PRESETS } from '../src/debrisgen/debrisPresets.js';

const OUT = process.argv[2] || new URL('../dist/debris-renders', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writePng(path, width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function collectTriangles(root) {
  root.updateMatrixWorld(true);
  const tris = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry;
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    const matColor = obj.material?.color ?? new THREE.Color(1, 1, 1);
    const index = geo.index ? geo.index.array : null;
    const count = index ? index.length : pos.count;
    const v = new THREE.Vector3();
    const verts = [];
    const colors = [];
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      verts.push([v.x, v.y, v.z]);
      colors.push(col
        ? [col.getX(i) * matColor.r, col.getY(i) * matColor.g, col.getZ(i) * matColor.b]
        : [matColor.r, matColor.g, matColor.b]);
    }
    // Mirror-scaled meshes flip winding; normals are recomputed per face
    // below and lighting is double-sided, so ignore.
    for (let i = 0; i < count; i += 3) {
      const a = index ? index[i] : i;
      const b = index ? index[i + 1] : i + 1;
      const c = index ? index[i + 2] : i + 2;
      tris.push([verts[a], verts[b], verts[c], colors[a], colors[b], colors[c]]);
    }
  });
  return tris;
}

function render(tris, width, height, { yaw = 0.7, pitch = 0.42 } = {}) {
  // Fit bounds
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (let k = 0; k < 3; k += 1) for (let ax = 0; ax < 3; ax += 1) {
    min[ax] = Math.min(min[ax], t[k][ax]);
    max[ax] = Math.max(max[ax], t[k][ax]);
  }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const cy = Math.cos(yaw); const sy = Math.sin(yaw);
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const view = ([x, y, z]) => {
    const dx = x - center[0]; const dy = y - center[1]; const dz = z - center[2];
    const rx = dx * cy - dz * sy;
    const rz = dx * sy + dz * cy;
    const ry = dy * cp - rz * sp;
    const rz2 = dy * sp + rz * cp;
    return [rx, ry, rz2];
  };
  const scale = (Math.min(width, height) * 0.82) / size;
  const project = (p) => [width / 2 + p[0] * scale, height / 2 - p[1] * scale, p[2]];

  const rgba = Buffer.alloc(width * height * 4);
  const zbuf = new Float32Array(width * height).fill(-Infinity);
  // Background
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = 34; rgba[i * 4 + 1] = 36; rgba[i * 4 + 2] = 40; rgba[i * 4 + 3] = 255;
  }
  const lightA = [0.5, 0.78, 0.38];
  const lightB = [-0.6, 0.2, -0.77];
  for (const tri of tris) {
    const p = [view(tri[0]), view(tri[1]), view(tri[2])];
    const s = p.map(project);
    // Face normal in view space
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const lambert = Math.max(0, nx * lightA[0] + ny * lightA[1] + nz * lightA[2]) * 0.85
      + Math.max(0, nx * lightB[0] + ny * lightB[1] + nz * lightB[2]) * 0.3 + 0.22;
    const minX = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
    const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const w0 = ((s[1][0] - px) * (s[2][1] - py) - (s[2][0] - px) * (s[1][1] - py)) / area;
        const w1 = ((s[2][0] - px) * (s[0][1] - py) - (s[0][0] - px) * (s[2][1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * s[0][2] + w1 * s[1][2] + w2 * s[2][2];
        const idx = py * width + px;
        if (depth <= zbuf[idx]) continue;
        zbuf[idx] = depth;
        for (let ch = 0; ch < 3; ch += 1) {
          const base = w0 * tri[3][ch] + w1 * tri[4][ch] + w2 * tri[5][ch];
          rgba[idx * 4 + ch] = Math.min(255, Math.round(Math.sqrt(Math.min(base * lambert, 1)) * 255));
        }
        rgba[idx * 4 + 3] = 255;
      }
    }
  }
  return rgba;
}

const only = process.argv[3] ? process.argv[3].split(',') : null;
for (const preset of BUILT_IN_DEBRIS_PRESETS) {
  if (only && !only.some((o) => preset.id.includes(o))) continue;
  const t0 = performance.now();
  const asset = createDebrisAsset(createDebrisSettings(preset.settings));
  await settleDebrisPhysics(asset);
  const genMs = performance.now() - t0;
  const tris = collectTriangles(asset);
  const rgba = render(tris, 480, 360);
  writePng(`${OUT}/${preset.id}.png`, 480, 360, rgba);
  console.log(`${preset.id.padEnd(24)} ${String(tris.length).padStart(7)} tris  gen ${genMs.toFixed(0)}ms  ${JSON.stringify(asset.userData.stats)}`);
}
console.log('done ->', OUT);
