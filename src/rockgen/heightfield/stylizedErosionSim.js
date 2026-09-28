// First-party stylized erosion for rock-scale heightfields.
//
// This model is deliberately not a droplet sim. It treats the heightfield as a
// drainage graph: flow is routed downhill, high-flow slopes are carved by
// stream power, flats and concavities collect sediment, then a multi-neighbor
// thermal pass sheds unstable banks into talus. The outputs match the
// heightfield patch contract: eroded heights plus flow, erosion, deposition,
// sediment, and slope masks for stylized surface shading.

const SQRT2 = Math.SQRT2;

const NEIGHBORS = Object.freeze([
  Object.freeze([-1, 0, 1]),
  Object.freeze([1, 0, 1]),
  Object.freeze([0, -1, 1]),
  Object.freeze([0, 1, 1]),
  Object.freeze([-1, -1, SQRT2]),
  Object.freeze([1, -1, SQRT2]),
  Object.freeze([-1, 1, SQRT2]),
  Object.freeze([1, 1, SQRT2]),
]);

export const DEFAULT_STYLIZED_EROSION_PARAMS = Object.freeze({
  bankDeposition: 0.5,
  depositionRate: 0.26,
  droplets: 40_000,
  erosionRadius: 2,
  erosionRate: 0.24,
  evaporation: 0.02,
  flowSharpness: 1.45,
  maxPasses: 14,
  minSlope: 0.01,
  seed: 1,
  sedimentCapacity: 3.2,
  smoothing: 0.05,
  strength: 1.0,
  talus: 0.6,
  thermalIterations: 28,
  thermalStrength: 0.36,
  valleyWidening: 0.55,
});

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function buildKernel(radius) {
  const r = Math.max(0, Math.round(radius));
  if (r <= 0) {
    return {
      offsets: [[0, 0]],
      weights: [1],
    };
  }

  const offsets = [];
  const weights = [];
  let sum = 0;
  const radiusSq = r * r;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      const sq = x * x + y * y;
      if (sq > radiusSq) continue;
      const normalized = Math.sqrt(sq) / Math.max(1, r);
      const weight = (1 - normalized) ** 2;
      offsets.push([x, y]);
      weights.push(weight);
      sum += weight;
    }
  }
  for (let i = 0; i < weights.length; i += 1) weights[i] /= sum || 1;
  return { offsets, weights };
}

function applyKernelDelta(map, mask, width, height, x, y, amount, kernel, sign) {
  if (amount <= 0) return 0;
  let applied = 0;
  for (let k = 0; k < kernel.offsets.length; k += 1) {
    const [ox, oy] = kernel.offsets[k];
    const px = x + ox;
    const py = y + oy;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const i = py * width + px;
    const delta = amount * kernel.weights[k];
    if (sign < 0) {
      const removed = Math.min(map[i], delta);
      map[i] -= removed;
      if (mask) mask[i] += removed;
      applied += removed;
    } else {
      map[i] += delta;
      if (mask) mask[i] += delta;
      applied += delta;
    }
  }
  return applied;
}

function normalizeInPlace(array) {
  let max = 1e-6;
  for (let i = 0; i < array.length; i += 1) {
    if (array[i] > max) max = array[i];
  }
  for (let i = 0; i < array.length; i += 1) array[i] /= max;
  return max;
}

function computeSlopeMap(map, width, height, slopeMap) {
  let slopeMax = 1e-6;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const xl = x > 0 ? map[i - 1] : map[i];
      const xr = x < width - 1 ? map[i + 1] : map[i];
      const yd = y > 0 ? map[i - width] : map[i];
      const yu = y < height - 1 ? map[i + width] : map[i];
      const slope = Math.hypot((xr - xl) * 0.5, (yu - yd) * 0.5);
      slopeMap[i] = slope;
      if (slope > slopeMax) slopeMax = slope;
    }
  }
  return slopeMax;
}

function localAverage(map, width, height, x, y) {
  let sum = 0;
  let count = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const px = x + dx;
    const py = y + dy;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    sum += map[py * width + px];
    count += 1;
  }
  return count > 0 ? sum / count : map[y * width + x];
}

function routeFlow(map, width, height, order, flow, flowSharpness, evaporation) {
  flow.fill(1);
  order.sort((a, b) => map[b] - map[a] || a - b);

  const keep = clamp(1 - evaporation * 0.35, 0.75, 1);
  let maxFlow = 1;
  for (const i of order) {
    const x = i % width;
    const y = Math.floor(i / width);
    const h = map[i];
    let weightSum = 0;

    for (const [dx, dy, dist] of NEIGHBORS) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const drop = (h - map[py * width + px]) / dist;
      if (drop <= 1e-6) continue;
      weightSum += drop ** flowSharpness;
    }

    if (weightSum > 0) {
      const routed = flow[i] * keep;
      for (const [dx, dy, dist] of NEIGHBORS) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const target = py * width + px;
        const drop = (h - map[target]) / dist;
        if (drop <= 1e-6) continue;
        flow[target] += routed * ((drop ** flowSharpness) / weightSum);
      }
    }

    if (flow[i] > maxFlow) maxFlow = flow[i];
  }
  return maxFlow;
}

function hydraulicWeather(map, width, height, p, flowMask, erosionMask, depositionMask) {
  const N = width * height;
  const droplets = Math.max(0, Math.round(p.droplets));
  if (droplets <= 0) return;

  const intensity = clamp01(droplets / 80_000);
  const passes = Math.max(1, Math.round(4 + Math.sqrt(intensity) * p.maxPasses));
  const order = Array.from({ length: N }, (_, i) => i);
  const flow = new Float32Array(N);
  const slopeMap = new Float32Array(N);
  const channelKernel = buildKernel(Math.max(1, p.erosionRadius * (1 + p.valleyWidening * 0.65)));
  const depositKernel = buildKernel(Math.max(1, p.erosionRadius));
  const erosionScale = 0.0015 + p.erosionRate * 0.012;
  const depositScale = 0.001 + p.depositionRate * 0.006;
  const sedimentScale = clamp(p.sedimentCapacity * 0.25, 0.45, 1.4);

  for (let pass = 0; pass < passes; pass += 1) {
    const flowMax = routeFlow(map, width, height, order, flow, p.flowSharpness, p.evaporation);
    const slopeMax = computeSlopeMap(map, width, height, slopeMap);
    const logFlowMax = Math.log1p(flowMax);
    const passWeight = 1 - pass / Math.max(1, passes * 1.35);

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        const flowNorm = Math.log1p(flow[i]) / (logFlowMax || 1);
        const slopeNorm = clamp01(slopeMap[i] / slopeMax);
        const channel = (flowNorm ** 1.15) * Math.max(p.minSlope, slopeNorm) ** 0.72;
        const neighborhood = localAverage(map, width, height, x, y);
        const concavity = clamp01((neighborhood - map[i]) * 7);
        const flatness = (1 - slopeNorm) ** 2;

        const carve = channel * erosionScale * sedimentScale * (0.55 + passWeight * 0.45);
        applyKernelDelta(map, erosionMask, width, height, x, y, carve, channelKernel, -1);

        const basinDeposit = concavity * p.bankDeposition * depositScale * 1.4;
        const barDeposit = (flowNorm ** 0.9) * flatness * depositScale * sedimentScale;
        applyKernelDelta(
          map,
          depositionMask,
          width,
          height,
          x,
          y,
          (basinDeposit + barDeposit) * (0.65 + passWeight * 0.35),
          depositKernel,
          1,
        );

        flowMask[i] += flowNorm;
      }
    }
  }
}

function thermalRelax(map, width, height, p, erosionMask, depositionMask) {
  const iterations = Math.max(0, Math.round(p.thermalIterations));
  if (iterations <= 0 || p.thermalStrength <= 0) return;

  const delta = new Float32Array(width * height);
  const talus = Math.max(0, p.talus);
  const strength = clamp01(p.thermalStrength);

  for (let iter = 0; iter < iterations; iter += 1) {
    delta.fill(0);

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        const h = map[i];
        let excessSum = 0;
        const transfers = [];

        for (const [dx, dy, dist] of NEIGHBORS) {
          const px = x + dx;
          const py = y + dy;
          const target = py * width + px;
          const slope = (h - map[target]) / dist;
          if (slope <= talus) continue;
          const excess = (slope - talus) * dist;
          transfers.push([target, excess]);
          excessSum += excess;
        }

        if (excessSum <= 0) continue;
        const moveTotal = Math.min(h * 0.18, excessSum * 0.22 * strength);
        if (moveTotal <= 0) continue;
        delta[i] -= moveTotal;
        for (const [target, excess] of transfers) {
          delta[target] += moveTotal * (excess / excessSum);
        }
      }
    }

    for (let i = 0; i < map.length; i += 1) {
      const d = delta[i];
      map[i] += d;
      if (d < 0) erosionMask[i] += -d;
      else if (d > 0) depositionMask[i] += d;
    }
  }
}

function flowAwareSmooth(map, width, height, amount, flowMask) {
  if (amount <= 0) return;
  const src = Float32Array.from(map);
  let flowMax = 1e-6;
  for (let i = 0; i < flowMask.length; i += 1) {
    if (flowMask[i] > flowMax) flowMax = flowMask[i];
  }
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const avg = (
        src[i]
        + src[i - 1]
        + src[i + 1]
        + src[i - width]
        + src[i + width]
      ) / 5;
      const protectedFlow = clamp01(flowMask[i] / flowMax);
      map[i] = src[i] + (avg - src[i]) * amount * (1 - protectedFlow * 0.65);
    }
  }
}

/**
 * Erodes a row-major heightfield with a deterministic drainage/weathering
 * model. Heights are mutated on a copy; the master `strength` blends eroded
 * vs base.
 *
 * @returns {{eroded: Float32Array, flow: Float32Array,
 *   erosionMask: Float32Array, depositionMask: Float32Array,
 *   sedimentMap: Float32Array, slopeMap: Float32Array}}
 */
export function erodeHeightfieldStylized({ width, height, heightmap, params = {} }) {
  const p = { ...DEFAULT_STYLIZED_EROSION_PARAMS, ...params };
  const N = width * height;
  const base = heightmap;
  const map = Float32Array.from(base);
  const flow = new Float32Array(N);
  const erosionMask = new Float32Array(N);
  const depositionMask = new Float32Array(N);

  hydraulicWeather(map, width, height, p, flow, erosionMask, depositionMask);
  thermalRelax(map, width, height, p, erosionMask, depositionMask);
  flowAwareSmooth(map, width, height, clamp01(p.smoothing), flow);

  const strength = clamp01(p.strength);
  const eroded = new Float32Array(N);
  const slopeMap = new Float32Array(N);
  const sedimentMap = new Float32Array(N);

  for (let i = 0; i < N; i += 1) {
    eroded[i] = base[i] + (map[i] - base[i]) * strength;
  }

  computeSlopeMap(eroded, width, height, slopeMap);
  normalizeInPlace(flow);
  normalizeInPlace(erosionMask);
  normalizeInPlace(depositionMask);
  normalizeInPlace(slopeMap);

  for (let i = 0; i < N; i += 1) {
    sedimentMap[i] = clamp01(depositionMask[i] * 0.85 + flow[i] * (1 - slopeMap[i]) * 0.15);
  }

  return {
    depositionMask,
    eroded,
    erosionMask,
    flow,
    sedimentMap,
    slopeMap,
  };
}
