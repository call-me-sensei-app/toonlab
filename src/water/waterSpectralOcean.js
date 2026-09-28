// Independent spectral ocean implementation: seeded Gaussian amplitudes,
// JONSWAP-shaped directional frequency density and finite-depth dispersion.
// Three non-overlapping wave-number bands. FFT evaluates the linear wave
// solution; it is not a nonlinear overturning/breaking solver.
const TAU = 2 * Math.PI;
const G = 9.81;
function random(seed) { let s = seed >>> 0; return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; }
export function inverseFFT2D(real, imaginary, size) {
    const line = (offset, stride) => {
        for (let i = 1, j = 0; i < size; i++) {
            let bit = size >> 1;
            for (; j & bit; bit >>= 1)
                j ^= bit;
            j ^= bit;
            if (i < j) {
                const a = offset + i * stride, b = offset + j * stride;
                let temp = real[a];
                real[a] = real[b];
                real[b] = temp;
                temp = imaginary[a];
                imaginary[a] = imaginary[b];
                imaginary[b] = temp;
            }
        }
        for (let len = 2; len <= size; len <<= 1) {
            const wr0 = Math.cos(TAU / len), wi0 = Math.sin(TAU / len);
            for (let start = 0; start < size; start += len) {
                let wr = 1, wi = 0;
                for (let j = 0; j < len / 2; j++) {
                    const a = offset + (start + j) * stride, b = offset + (start + j + len / 2) * stride;
                    const tr = real[b] * wr - imaginary[b] * wi, ti = real[b] * wi + imaginary[b] * wr;
                    real[b] = real[a] - tr;
                    imaginary[b] = imaginary[a] - ti;
                    real[a] += tr;
                    imaginary[a] += ti;
                    const next = wr * wr0 - wi * wi0;
                    wi = wr * wi0 + wi * wr0;
                    wr = next;
                }
            }
        }
    };
    for (let z = 0; z < size; z++)
        line(z * size, 1);
    for (let x = 0; x < size; x++)
        line(x, size);
    const norm = 1 / (size * size);
    for (let i = 0; i < real.length; i++) {
        real[i] *= norm;
        imaginary[i] *= norm;
    }
}
export class WaterSpectralOcean {
    constructor({ resolution = 64, seed = 731 } = {}) {
        if (resolution < 8 || (resolution & (resolution - 1)))
            throw new RangeError('FFT resolution must be a power of two');
        this.resolution = resolution;
        this.seed = seed;
        this.bands = [];
        this.signature = '';
        this.time = 0;
    }
    configure(settings, depth = 20, minWavelength = 0) {
        const { waveAmplitude = 0.3, waveIntensity = 0.3, waveLength = 13, waveDirection = [1, 0], waveDirectionSpread = 0.5 } = settings;
        const peakLength = Math.max(waveLength, waveAmplitude * Math.pow(waveIntensity, 1.35) * TAU / 0.18, 2);
        const signature = JSON.stringify([peakLength, waveAmplitude, waveIntensity, waveDirection, waveDirectionSpread, depth, minWavelength]);
        if (signature === this.signature)
            return;
        this.signature = signature;
        const targetRms = waveAmplitude * Math.pow(waveIntensity, 1.35) * 0.707;
        const n = this.resolution, dk0 = TAU / (peakLength * 8), kp = TAU / peakLength;
        const direction = Math.atan2(waveDirection[1], waveDirection[0]);
        this.bands = [];
        // Separate k ranges avoid counting the same energy in several cascades.
        for (let band = 0; band < 3; band++) {
            const length = peakLength * 8 / Math.pow(4, band), dk = TAU / length, rand = random(this.seed + band * 101);
            const data = { length, real: new Float64Array(n * n), imag: new Float64Array(n * n), h0r: new Float64Array(n * n), h0i: new Float64Array(n * n), omega: new Float64Array(n * n), size: n };
            for (let z = 0; z < n; z++)
                for (let x = 0; x < n; x++) {
                    const i = z * n + x, kx = (x <= n / 2 ? x : x - n) * dk, kz = (z <= n / 2 ? z : z - n) * dk, k = Math.hypot(kx, kz);
                    if (k < dk0 || k < (band === 0 ? 0 : dk * n / 16) || k >= dk * n / 4 || (minWavelength > 0 && k > TAU / minWavelength))
                        continue;
                    const omega = Math.sqrt(G * k * Math.tanh(k * Math.max(depth, 0.2))), wp = Math.sqrt(G * kp * Math.tanh(kp * Math.max(depth, 0.2)));
                    const sigma = omega <= wp ? 0.07 : 0.09, r = Math.exp(-((omega / wp - 1) ** 2) / (2 * sigma * sigma));
                    const density = Math.pow(omega, -5) * Math.exp(-1.25 * Math.pow(wp / omega, 4)) * Math.pow(3.3, r);
                    const c = Math.cos(Math.atan2(kz, kx) - direction);
                    const directional = Math.pow(Math.max(c, 0), 2 + 14 * (1 - waveDirectionSpread)) + 0.015 * waveDirectionSpread;
                    const kh = k * Math.max(depth, 0.2), t = Math.tanh(kh);
                    const derivative = G * (t + kh * (1 - t * t)) / (2 * omega);
                    const amplitude = Math.sqrt(Math.max(density * directional * derivative / k * dk * dk, 0));
                    const gaussian = Math.sqrt(-2 * Math.log(rand())), phase = TAU * rand();
                    data.h0r[i] = amplitude * gaussian * Math.cos(phase);
                    data.h0i[i] = amplitude * gaussian * Math.sin(phase);
                    data.omega[i] = omega;
                }
            this.bands.push(data);
        }
        const expectedVariance = this.bands.reduce((sum, b) => sum + b.h0r.reduce((a, v, i) => a + 2 * (v * v + b.h0i[i] ** 2), 0) / (n ** 4), 0);
        const scale = targetRms / Math.sqrt(Math.max(expectedVariance, 1e-30));
        for (const b of this.bands)
            for (let i = 0; i < n * n; i++) {
                b.h0r[i] *= scale;
                b.h0i[i] *= scale;
            }
        this.peakLength = peakLength;
        this.rms = targetRms;
    }
    update(time) {
        this.time = time;
        const n = this.resolution;
        for (const b of this.bands) {
            for (let z = 0; z < n; z++)
                for (let x = 0; x < n; x++) {
                    const i = z * n + x, j = ((n - z) % n) * n + (n - x) % n;
                    // Use negative phase: an h0(k) travelling component moves along +k.
                    const phase = b.omega[i] * time, c = Math.cos(phase), s = Math.sin(phase);
                    const cj = c, sj = s;
                    b.real[i] = b.h0r[i] * c + b.h0i[i] * s + b.h0r[j] * cj + b.h0i[j] * sj;
                    b.imag[i] = b.h0i[i] * c - b.h0r[i] * s - b.h0i[j] * cj + b.h0r[j] * sj;
                }
            inverseFFT2D(b.real, b.imag, n);
        }
    }
    sample(x, z, minWavelength = 0) {
        let h = 0;
        const n = this.resolution;
        for (const b of this.bands) {
            // Geometry excludes bands below its spatial sampling limit. Full-band
            // normals/caustics may use sample(...,0) on their denser grid.
            const gx = ((x / b.length % 1) + 1) % 1 * n, gz = ((z / b.length % 1) + 1) % 1 * n;
            const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
            const a = iz * n + ix, bb = iz * n + (ix + 1) % n, c = ((iz + 1) % n) * n + ix, d = ((iz + 1) % n) * n + (ix + 1) % n;
            h += (b.real[a] * (1 - tx) + b.real[bb] * tx) * (1 - tz) + (b.real[c] * (1 - tx) + b.real[d] * tx) * tz;
        }
        return h;
    }
}
