// Deterministic C7 geology-map source for the released 480-rock catalog.
// This module is deliberately renderer-free: Node batch tools and the browser
// editor consume the same byte-identical map fields. Geometry remains the
// editable authority; these maps are replaceable derivatives.

export const C7_GEOLOGY_SURFACE_SCHEMA = 'toonlab/c7-geology-surface';
export const C7_GEOLOGY_SURFACE_VERSION = 1;

export const C7_GEOLOGY_PROFILES = Object.freeze({
  'weathered-limestone': Object.freeze({ low: [0.24, 0.23, 0.18], high: [0.72, 0.67, 0.54], scale: 2.8, microScale: 0.075, fabric: 1, roughness: [0.68, 0.94], normal: 1.5 }),
  'blocky-granite': Object.freeze({ low: [0.18, 0.20, 0.23], high: [0.63, 0.59, 0.53], scale: 2.5, microScale: 0.095, fabric: 2, roughness: [0.58, 0.88], normal: 1.2 }),
  'layered-sandstone': Object.freeze({
    low: [0.26, 0.035, 0.018],
    high: [0.86, 0.24, 0.09],
    strataDark: [0.10, 0.008, 0.006],
    strataLight: [0.90, 0.46, 0.22],
    scale: 3.2,
    microScale: 0.08,
    fabric: 3,
    roughness: [0.68, 0.96],
    normal: 0.95,
  }),
  'alpine-granite': Object.freeze({ low: [0.17, 0.20, 0.24], high: [0.67, 0.65, 0.59], scale: 2.7, microScale: 0.10, fabric: 4, roughness: [0.56, 0.88], normal: 1.25 }),
  'columnar-basalt': Object.freeze({ low: [0.025, 0.03, 0.034], high: [0.24, 0.27, 0.26], scale: 3.0, microScale: 0.09, fabric: 5, roughness: [0.60, 0.90], normal: 1.3 }),
  'sharp-karst': Object.freeze({ low: [0.21, 0.24, 0.20], high: [0.68, 0.71, 0.61], scale: 2.4, microScale: 0.075, fabric: 6, roughness: [0.70, 0.96], normal: 1.55 }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function lerp(left, right, amount) {
  return left + ((right - left) * amount);
}

function smoothstep(minimum, maximum, value) {
  const amount = clamp01((value - minimum) / Math.max(1e-6, maximum - minimum));
  return amount * amount * (3 - (2 * amount));
}

function linearToSrgb(value) {
  const channel = clamp01(value);
  // Match Three.js Color.convertLinearToSRGB byte-for-byte. Its deliberately
  // rounded exponent is part of the accepted C7 pilot hashes.
  return channel < 0.0031308
    ? channel * 12.92
    : (1.055 * (channel ** 0.41666)) - 0.055;
}

function fnv(value, hash) {
  return Math.imul((hash ^ value) >>> 0, 16777619) >>> 0;
}

export function c7SurfaceSeed(value) {
  let hash = 2166136261 >>> 0;
  for (const character of String(value ?? '')) {
    hash = fnv(character.charCodeAt(0), hash);
  }
  return hash >>> 0;
}

function dimensionsArray(dimensions) {
  if (Array.isArray(dimensions)) return dimensions.slice(0, 3).map(Number);
  return [dimensions?.width, dimensions?.height, dimensions?.depth].map(Number);
}

/**
 * Resolve one isotropic, metre-based triplanar projection. The same scale is
 * used on all three axes, so even highly elongated assets never inherit UV
 * stretching. Scale grows sublinearly for large formations and is capped to
 * keep mountain surfaces detailed instead of smearing one tile over 100 m.
 */
export function resolveC7Projection({ dimensionsMetres, geology } = {}) {
  const profile = C7_GEOLOGY_PROFILES[geology];
  if (!profile) throw new RangeError(`Unknown C7 geology profile “${String(geology)}”.`);
  const dimensions = dimensionsArray(dimensionsMetres);
  if (dimensions.length !== 3 || dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('C7 projection requires positive width, height, and depth in metres.');
  }
  const sorted = [...dimensions].sort((left, right) => left - right);
  const geometricMean = (dimensions[0] * dimensions[1] * dimensions[2]) ** (1 / 3);
  const characteristicMetres = Math.sqrt(Math.max(geometricMean * sorted[1], 1e-6));
  const scaleFactor = clamp(Math.sqrt(characteristicMetres / 1.5), 0.78, 4);
  const scaleMetres = profile.scale * scaleFactor;
  const nearDetailScaleMetres = profile.microScale * clamp(Math.sqrt(characteristicMetres), 0.8, 2.5);
  return Object.freeze({
    characteristicMetres,
    dimensionsMetres: Object.freeze([...dimensions]),
    mode: 'world-metre-triplanar-isotropic',
    nearDetailScaleMetres,
    scaleMetres,
    axisScale: Object.freeze([scaleMetres, scaleMetres, scaleMetres]),
    tileSpan: Object.freeze(dimensions.map((value) => value / scaleMetres)),
  });
}

function latticeHash(x, y, period, seed) {
  const wrappedX = ((x % period) + period) % period;
  const wrappedY = ((y % period) + period) % period;
  const value = Math.sin((wrappedX * 127.1) + (wrappedY * 311.7) + (seed * 74.7)) * 43758.5453;
  return value - Math.floor(value);
}

function tileNoise(u, v, frequency, seed) {
  const x = u * frequency;
  const y = v * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx0 = x - x0;
  const fy0 = y - y0;
  const fx = fx0 * fx0 * (3 - (2 * fx0));
  const fy = fy0 * fy0 * (3 - (2 * fy0));
  const a = latticeHash(x0, y0, frequency, seed);
  const b = latticeHash(x0 + 1, y0, frequency, seed);
  const c = latticeHash(x0, y0 + 1, frequency, seed);
  const d = latticeHash(x0 + 1, y0 + 1, frequency, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

function tileFbm(u, v, baseFrequency, seed, octaves = 4) {
  let amplitude = 0.56;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += tileNoise(u, v, baseFrequency * (2 ** octave), seed + (octave * 19)) * amplitude;
    weight += amplitude;
    amplitude *= 0.48;
  }
  return total / weight;
}

function c7Field(u, v, profile, seed) {
  const macro = tileFbm(u, v, 3, seed + 3, 4);
  const micro = tileFbm(u, v, 17, seed + 11, 3);
  const fine = tileNoise(u, v, 61, seed + 29);
  let height = (macro * 0.70) + (micro * 0.24) + (fine * 0.06);
  if (profile.fabric === 1 || profile.fabric === 6) {
    const pitMask = 1 - smoothstep(0.10, 0.30, micro);
    const pitBreakup = smoothstep(0.34, 0.68, tileFbm(u, v, 7, seed + 53, 2));
    height -= pitMask * pitBreakup * (profile.fabric === 6 ? 0.10 : 0.075);
  } else if (profile.fabric === 2 || profile.fabric === 4) {
    const mineralPatch = smoothstep(0.48, 0.70, tileFbm(u, v, 5, seed + 67, 2));
    height += smoothstep(0.88, 0.975, fine) * mineralPatch * 0.014;
  } else if (profile.fabric === 3) {
    const beddingWarp = (Math.sin(u * Math.PI * 2) * 0.16)
      + (Math.sin(u * Math.PI * 4) * 0.06);
    height += Math.sin((v * 8 + beddingWarp) * Math.PI * 2) * lerp(0.009, 0.024, macro);
  } else if (profile.fabric === 5) {
    height -= (1 - smoothstep(0.08, 0.26, micro)) * 0.085;
  }
  let value = clamp01(0.5 + ((macro - 0.5) * 0.44) + ((micro - 0.5) * 0.34) + ((fine - 0.5) * 0.18));
  if (profile.fabric === 3) {
    value = clamp01(value + Math.sin(
      (v * 9 + (Math.sin(u * Math.PI * 2) * 0.18)) * Math.PI * 2,
    ) * 0.08);
  }
  return { fine, height, macro, micro, value };
}

function pointToSegmentDistance(px, py, segment) {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const amount = clamp01((((px - segment.ax) * dx) + ((py - segment.ay) * dy)) / Math.max(1e-6, (dx * dx) + (dy * dy)));
  return Math.hypot(px - (segment.ax + (dx * amount)), py - (segment.ay + (dy * amount)));
}

function createFractureSegments(profile, seed) {
  const segments = [];
  const primaryCount = profile.fabric === 3 ? 4 : 3;
  for (let index = 0; index < primaryCount; index += 1) {
    const cx = 0.14 + (latticeHash(index, 17, 97, seed + 151) * 0.72);
    const cy = 0.14 + (latticeHash(index, 31, 101, seed + 163) * 0.72);
    const randomAngle = latticeHash(index, 47, 103, seed + 179);
    let angle;
    if (profile.fabric === 3) angle = (randomAngle - 0.5) * 0.34;
    else if (profile.fabric === 5) angle = (Math.PI * 0.5) + ((randomAngle - 0.5) * 0.48);
    else if (profile.fabric === 2 || profile.fabric === 4) {
      angle = index % 2 === 0
        ? (Math.PI * 0.5) + ((randomAngle - 0.5) * 0.72)
        : 0.55 + (randomAngle * 0.58);
    } else angle = randomAngle * Math.PI;
    const length = profile.fabric === 2 || profile.fabric === 4
      ? 0.10 + (latticeHash(index, 59, 107, seed + 191) * 0.19)
      : 0.20 + (latticeHash(index, 59, 107, seed + 191) * 0.30);
    const width = profile.fabric === 2 || profile.fabric === 4
      ? 0.0011 + (latticeHash(index, 71, 109, seed + 211) * 0.0018)
      : 0.0018 + (latticeHash(index, 71, 109, seed + 211) * 0.0028);
    const half = length * 0.5;
    const start = { x: cx - (Math.cos(angle) * half), y: cy - (Math.sin(angle) * half) };
    const end = { x: cx + (Math.cos(angle) * half), y: cy + (Math.sin(angle) * half) };
    const perpendicularX = -Math.sin(angle);
    const perpendicularY = Math.cos(angle);
    const points = [start];
    for (let step = 1; step < 4; step += 1) {
      const amount = step / 4;
      const jitter = (latticeHash(index * 7 + step, 79, 131, seed + 217) - 0.5)
        * (profile.fabric === 3 ? 0.022 : 0.055);
      points.push({
        x: lerp(start.x, end.x, amount) + (perpendicularX * jitter),
        y: lerp(start.y, end.y, amount) + (perpendicularY * jitter),
      });
    }
    points.push(end);
    for (let step = 0; step < points.length - 1; step += 1) {
      segments.push({
        ax: points[step].x,
        ay: points[step].y,
        bx: points[step + 1].x,
        by: points[step + 1].y,
        width: width * lerp(1, 0.72, step / (points.length - 2)),
      });
    }
    if (index < 2 && profile.fabric !== 3) {
      const branchStart = 0.40 + (latticeHash(index, 83, 113, seed + 223) * 0.28);
      const branchX = lerp(start.x, end.x, branchStart);
      const branchY = lerp(start.y, end.y, branchStart);
      const branchAngle = angle + (index % 2 === 0 ? 0.78 : -0.92);
      const branchLength = 0.10 + (latticeHash(index, 97, 127, seed + 227) * 0.13);
      segments.push({
        ax: branchX,
        ay: branchY,
        bx: branchX + (Math.cos(branchAngle) * branchLength),
        by: branchY + (Math.sin(branchAngle) * branchLength),
        width: width * 0.58,
      });
    }
  }
  return segments;
}

function fractureField(u, v, segments, seed) {
  let fracture = 0;
  for (const segment of segments) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        fracture = Math.max(fracture, 1 - smoothstep(
          segment.width,
          segment.width * 2.8,
          pointToSegmentDistance(u + offsetX, v + offsetY, segment),
        ));
      }
    }
  }
  return fracture * lerp(0.22, 1, smoothstep(0.28, 0.70, tileFbm(u, v, 11, seed + 241, 2)));
}

/** Generate the accepted C7 BaseColor/NormalGL/Height/AO/Roughness map set. */
export function createC7GeologyMapData({ geology, seed, size = 512 } = {}) {
  const profile = C7_GEOLOGY_PROFILES[geology];
  if (!profile) throw new RangeError(`Unknown C7 geology profile “${String(geology)}”.`);
  if (!Number.isInteger(size) || size < 32 || size > 2048) throw new RangeError('C7 map size must be an integer from 32 to 2048.');
  const resolvedSeed = Math.round(Number(seed) || 0) >>> 0;
  const fields = new Array(size * size);
  const maps = Object.fromEntries([
    'baseColor', 'normalGL', 'height', 'ao', 'roughness', 'smoothness', 'ormHeight',
  ].map((role) => [role, new Uint8Array(size * size * 4)]));
  const fractureSegments = createFractureSegments(profile, resolvedSeed);
  let minimumHeight = Infinity;
  let maximumHeight = -Infinity;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const field = c7Field(x / size, y / size, profile, resolvedSeed);
      field.fracture = fractureField(x / size, y / size, fractureSegments, resolvedSeed);
      const fractureDepth = profile.fabric === 3 ? 0.018
        : profile.fabric === 2 || profile.fabric === 4 ? 0.024 : 0.034;
      field.height -= field.fracture * fractureDepth;
      fields[(y * size) + x] = field;
      minimumHeight = Math.min(minimumHeight, field.height);
      maximumHeight = Math.max(maximumHeight, field.height);
    }
  }
  const sampleHeight = (x, y) => fields[
    ((((y % size) + size) % size) * size) + (((x % size) + size) % size)
  ].height;
  let hash = 2166136261 >>> 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = (y * size) + x;
      const offset = pixel * 4;
      const field = fields[pixel];
      let color = profile.low.map((channel, index) => lerp(channel, profile.high[index], smoothstep(0.06, 0.94, field.value)));
      if (profile.fabric === 2 || profile.fabric === 4) {
        const u = x / size;
        const v = y / size;
        const darkPatch = smoothstep(0.50, 0.72, tileFbm(u, v, 5, resolvedSeed + 67, 2));
        const quartzPatch = smoothstep(0.46, 0.68, tileFbm(u, v, 4, resolvedSeed + 73, 2));
        const darkGrain = smoothstep(0.91, 0.985, field.fine) * darkPatch;
        const quartz = smoothstep(0.92, 0.985, tileNoise(u, v, 83, resolvedSeed + 47)) * quartzPatch;
        color = color.map((channel) => lerp(channel, 0.055, darkGrain * 0.46));
        color = color.map((channel) => lerp(channel, 0.72, quartz * 0.34));
      }
      if (profile.fabric === 3) {
        const u = x / size;
        const v = y / size;
        const warpedBed = (v * 6) + ((field.macro - 0.5) * 1.35)
          + (Math.sin(u * Math.PI * 2) * 0.18)
          + (Math.sin(u * Math.PI * 4) * 0.12);
        const bed = 0.5 + (0.5 * Math.sin(warpedBed * Math.PI * 2));
        const seamVariation = lerp(0.12, 1, tileNoise(u, v, 5, resolvedSeed + 91));
        const fineBed = 0.5 + (0.5 * Math.sin(((v * 16)
          + (Math.sin(u * Math.PI * 2) * 0.22)
          + ((field.micro - 0.5) * 0.72)) * Math.PI * 2));
        const creamSeam = Math.max(
          smoothstep(0.90, 0.992, bed) * seamVariation,
          smoothstep(0.955, 0.998, fineBed) * 0.34,
        );
        const burgundySeam = 1 - smoothstep(0.025, 0.18, bed);
        color = color.map((channel, index) => lerp(channel, profile.strataLight[index], creamSeam * 0.72));
        color = color.map((channel, index) => lerp(channel, profile.strataDark[index], burgundySeam * 0.58));
      }
      const topLeft = sampleHeight(x - 1, y + 1);
      const top = sampleHeight(x, y + 1);
      const topRight = sampleHeight(x + 1, y + 1);
      const left = sampleHeight(x - 1, y);
      const right = sampleHeight(x + 1, y);
      const bottomLeft = sampleHeight(x - 1, y - 1);
      const bottom = sampleHeight(x, y - 1);
      const bottomRight = sampleHeight(x + 1, y - 1);
      const gradientX = (topLeft + (2 * left) + bottomLeft) - (topRight + (2 * right) + bottomRight);
      const gradientY = (bottomLeft + (2 * bottom) + bottomRight) - (topLeft + (2 * top) + topRight);
      let normalX = gradientX * profile.normal * 0.55;
      let normalY = gradientY * profile.normal * 0.55;
      let normalZ = 1;
      const normalLength = Math.hypot(normalX, normalY, normalZ);
      normalX /= normalLength;
      normalY /= normalLength;
      normalZ /= normalLength;
      const neighbourAverage = (left + right + top + bottom) * 0.25;
      const concavity = clamp01(((neighbourAverage - field.height) * 18) + ((0.5 - field.micro) * 0.18));
      const ao = clamp01(1 - (concavity * 0.68) - ((1 - field.macro) * 0.08) - (field.fracture * 0.16));
      const roughness = clamp01(lerp(profile.roughness[0], profile.roughness[1], field.micro)
        + (concavity * 0.06) + (field.fracture * 0.025));
      const height = clamp01((field.height - minimumHeight) / Math.max(1e-6, maximumHeight - minimumHeight));
      const colorBytes = color.map((channel) => Math.round(linearToSrgb(channel) * 255));
      const normalBytes = [normalX, normalY, normalZ].map((channel) => Math.round((channel * 0.5 + 0.5) * 255));
      const heightByte = Math.round(height * 255);
      const aoByte = Math.round(ao * 255);
      const roughnessByte = Math.round(roughness * 255);
      const smoothnessByte = 255 - roughnessByte;
      const values = {
        baseColor: [...colorBytes, 255],
        normalGL: [...normalBytes, 255],
        height: [heightByte, heightByte, heightByte, 255],
        ao: [aoByte, aoByte, aoByte, 255],
        roughness: [roughnessByte, roughnessByte, roughnessByte, 255],
        smoothness: [smoothnessByte, smoothnessByte, smoothnessByte, 255],
        ormHeight: [aoByte, roughnessByte, 0, heightByte],
      };
      for (const [role, channels] of Object.entries(values)) maps[role].set(channels, offset);
      for (const value of [...colorBytes, normalBytes[0], normalBytes[1], heightByte, aoByte, roughnessByte, smoothnessByte]) {
        hash = fnv(value, hash);
      }
    }
  }
  let horizontalEdgeDelta = 0;
  let verticalEdgeDelta = 0;
  for (let index = 0; index < size; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      horizontalEdgeDelta += Math.abs(
        maps.baseColor[((index * size) * 4) + channel]
          - maps.baseColor[((index * size + size - 1) * 4) + channel],
      ) / 255;
      verticalEdgeDelta += Math.abs(
        maps.baseColor[(index * 4) + channel]
          - maps.baseColor[((((size - 1) * size) + index) * 4) + channel],
      ) / 255;
    }
  }
  return {
    audit: Object.freeze({
      fractureSegments: fractureSegments.length,
      hash: hash.toString(16).padStart(8, '0'),
      heightRange: Object.freeze([minimumHeight, maximumHeight]),
      profile: geology,
      roles: Object.freeze(Object.keys(maps)),
      seed: resolvedSeed,
      size,
      tileEdgeMeanAbsoluteDelta: Object.freeze({
        horizontal: horizontalEdgeDelta / (size * 3),
        vertical: verticalEdgeDelta / (size * 3),
      }),
    }),
    maps,
  };
}

export function createC7SurfaceSpecification({ assetId, dimensionsMetres, geology, seed = null } = {}) {
  const resolvedSeed = seed === null ? c7SurfaceSeed(`${assetId}:c7-v1`) : Math.round(Number(seed) || 0) >>> 0;
  return Object.freeze({
    assetId: String(assetId ?? ''),
    geology,
    mapResolution: 512,
    projection: resolveC7Projection({ dimensionsMetres, geology }),
    schema: C7_GEOLOGY_SURFACE_SCHEMA,
    seed: resolvedSeed,
    version: C7_GEOLOGY_SURFACE_VERSION,
  });
}
