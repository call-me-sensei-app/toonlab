import * as THREE from 'three';
import { inverseFFT2D } from './waterSpectralOcean.js';

// Short wind waves: many independently seeded Fourier modes, rather than
// a handful of full-strength plane waves. Both optics paths sample this field.
export class WaterDetailSpectrum {
  constructor() {
    this.size = 64;
    this.signature = '';
    this.time = NaN;
    this.bands = [17, 7.3].map((length) => {
      const n = this.size ** 2;
      const band = { length, baseLength: length };
      for (const key of ['r', 'i', 'kx', 'kz', 'omega', 'xr', 'xi', 'zr', 'zi']) band[key] = new Float64Array(n);
      band.data = new Float32Array(n * 4);
      band.texture = new THREE.DataTexture(band.data, this.size, this.size, THREE.RGBAFormat, THREE.FloatType);
      band.texture.wrapS = band.texture.wrapT = THREE.RepeatWrapping;
      band.texture.minFilter = THREE.LinearMipmapLinearFilter;
      band.texture.magFilter = THREE.LinearFilter;
      band.texture.generateMipmaps = true;
      return band;
    });
  }
  configure(settings) {
    const direction = Math.atan2(settings.waveDirection[1], settings.waveDirection[0]);
    const signature = JSON.stringify([direction, settings.detailScale]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.time = NaN;
    const n = this.size, tau = 2 * Math.PI;
    this.bands.forEach((band, index) => {
      let seed = 9731 + index * 1237;
      const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296;
      band.length = band.baseLength / settings.detailScale;
      let variance = 0;
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const fx = x < n / 2 ? x : x - n, fz = z < n / 2 ? z : z - n;
        const baseK = Math.hypot(fx, fz) * tau / band.baseLength;
        const wavelength = tau / Math.max(baseK, 1e-8);
        const valid = index === 0 ? wavelength >= 0.95 && wavelength < 3.6 : wavelength >= 0.34 && wavelength < 0.95;
        const kx = fx * tau / band.length, kz = fz * tau / band.length, k = Math.hypot(kx, kz);
        band.kx[i] = kx; band.kz[i] = kz;
        band.omega[i] = Math.sqrt(9.81 * k + 0.000074 * k ** 3);
        // Broad directional spread and a broad frequency envelope keep one
        // orientation or wavelength from becoming visible as a repeated grid.
        const wind = Math.max(0, Math.cos(Math.atan2(kz, kx) - direction));
        const envelope = Math.exp(-0.5 * (Math.log(wavelength / (index ? 0.6 : 1.7)) / 0.6) ** 2);
        const amplitude = valid ? Math.sqrt(envelope * (0.12 + wind ** 4)) / Math.max(k * k, 1e-8) : 0;
        const gaussian = Math.sqrt(-2 * Math.log(random())), phase = tau * random();
        band.r[i] = amplitude * gaussian * Math.cos(phase);
        band.i[i] = amplitude * gaussian * Math.sin(phase);
        variance += 2 * (band.r[i] ** 2 + band.i[i] ** 2) * k * k / n ** 4;
      }
      const gain = (index ? 0.045 : 0.075) / Math.sqrt(Math.max(variance, 1e-20));
      for (let i = 0; i < n * n; i++) { band.r[i] *= gain; band.i[i] *= gain; }
    });
  }
  update(time) {
    if (time === this.time) return;
    this.time = time;
    const n = this.size;
    for (const b of this.bands) {
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const i = z * n + x, j = ((n - z) % n) * n + (n - x) % n;
        const phase = b.omega[i] * time, c = Math.cos(phase), s = Math.sin(phase);
        const r = b.r[i] * c + b.i[i] * s + b.r[j] * c + b.i[j] * s;
        const im = b.i[i] * c - b.r[i] * s - b.i[j] * c + b.r[j] * s;
        b.xr[i] = -im * b.kx[i]; b.xi[i] = r * b.kx[i];
        b.zr[i] = -im * b.kz[i]; b.zi[i] = r * b.kz[i];
      }
      inverseFFT2D(b.xr, b.xi, n); inverseFFT2D(b.zr, b.zi, n);
      for (let i = 0; i < n * n; i++) { b.data[i * 4] = b.xr[i]; b.data[i * 4 + 1] = b.zr[i]; }
      b.texture.needsUpdate = true;
    }
  }
  sample(x, z, out) {
    out.x = out.z = 0;
    const n = this.size;
    for (const b of this.bands) {
      const gx = ((x / b.length % 1) + 1) % 1 * n, gz = ((z / b.length % 1) + 1) % 1 * n;
      const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
      const a = (iz * n + ix) * 4, c = (((iz + 1) % n) * n + ix) * 4;
      const bb = (iz * n + (ix + 1) % n) * 4, d = (((iz + 1) % n) * n + (ix + 1) % n) * 4;
      out.x += (b.data[a] * (1 - tx) + b.data[bb] * tx) * (1 - tz) + (b.data[c] * (1 - tx) + b.data[d] * tx) * tz;
      out.z += (b.data[a + 1] * (1 - tx) + b.data[bb + 1] * tx) * (1 - tz) + (b.data[c + 1] * (1 - tx) + b.data[d + 1] * tx) * tz;
    }
    return out;
  }
  dispose() { for (const b of this.bands) b.texture.dispose(); }
}
