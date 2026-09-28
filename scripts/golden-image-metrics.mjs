import { inflateSync } from 'node:zlib';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new TypeError('Expected a PNG buffer.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
      interlace = buffer[start + 12];
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }
    offset = end + 4;
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new TypeError(
      `Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`,
    );
  }
  if (width < 1 || height < 1 || idat.length === 0) {
    throw new TypeError('PNG is missing dimensions or image data.');
  }

  const sourceChannels = colorType === 6 ? 4 : 3;
  const sourceStride = width * sourceChannels;
  const inflated = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);
  let readOffset = 0;
  let previous = Buffer.alloc(sourceStride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const row = Buffer.from(inflated.subarray(readOffset, readOffset + sourceStride));
    readOffset += sourceStride;
    if (row.length !== sourceStride || filter > 4) throw new TypeError('Corrupt PNG scanline.');

    for (let index = 0; index < sourceStride; index += 1) {
      const left = index >= sourceChannels ? row[index - sourceChannels] : 0;
      const up = previous[index];
      const upperLeft = index >= sourceChannels ? previous[index - sourceChannels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 0xff;
      else if (filter === 2) row[index] = (row[index] + up) & 0xff;
      else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[index] = (row[index] + paeth(left, up, upperLeft)) & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * sourceChannels;
      const target = (y * width + x) * 4;
      rgba[target] = row[source];
      rgba[target + 1] = row[source + 1];
      rgba[target + 2] = row[source + 2];
      rgba[target + 3] = sourceChannels === 4 ? row[source + 3] : 255;
    }
    previous = row;
  }

  return { data: rgba, height, width };
}

function srgbToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function xyzPivot(value) {
  const delta = 6 / 29;
  return value > delta ** 3
    ? Math.cbrt(value)
    : value / (3 * delta ** 2) + 4 / 29;
}

function labAt(data, index) {
  const r = srgbToLinear(data[index]);
  const g = srgbToLinear(data[index + 1]);
  const b = srgbToLinear(data[index + 2]);
  const x = xyzPivot((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = xyzPivot(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = xyzPivot((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function lumaAt(data, index) {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
}

function blockSsim(before, after, width, height, blockSize = 8) {
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let total = 0;
  let blocks = 0;
  for (let y0 = 0; y0 < height; y0 += blockSize) {
    for (let x0 = 0; x0 < width; x0 += blockSize) {
      const beforeValues = [];
      const afterValues = [];
      for (let y = y0; y < Math.min(y0 + blockSize, height); y += 1) {
        for (let x = x0; x < Math.min(x0 + blockSize, width); x += 1) {
          const index = (y * width + x) * 4;
          beforeValues.push(lumaAt(before, index));
          afterValues.push(lumaAt(after, index));
        }
      }
      const count = beforeValues.length;
      const meanBefore = beforeValues.reduce((sum, value) => sum + value, 0) / count;
      const meanAfter = afterValues.reduce((sum, value) => sum + value, 0) / count;
      let varianceBefore = 0;
      let varianceAfter = 0;
      let covariance = 0;
      for (let index = 0; index < count; index += 1) {
        const beforeDelta = beforeValues[index] - meanBefore;
        const afterDelta = afterValues[index] - meanAfter;
        varianceBefore += beforeDelta ** 2;
        varianceAfter += afterDelta ** 2;
        covariance += beforeDelta * afterDelta;
      }
      const denominator = Math.max(count - 1, 1);
      varianceBefore /= denominator;
      varianceAfter /= denominator;
      covariance /= denominator;
      total += ((2 * meanBefore * meanAfter + c1) * (2 * covariance + c2)) /
        ((meanBefore ** 2 + meanAfter ** 2 + c1) *
          (varianceBefore + varianceAfter + c2));
      blocks += 1;
    }
  }
  return total / Math.max(blocks, 1);
}

export function compareRgbaImages(before, after, {
  pixelDeltaE = 6,
} = {}) {
  if (before.width !== after.width || before.height !== after.height) {
    return {
      comparable: false,
      before: { width: before.width, height: before.height },
      after: { width: after.width, height: after.height },
    };
  }
  const deltaE = [];
  let above = 0;
  let sum = 0;
  const pixelCount = before.width * before.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const alpha = Math.max(before.data[index + 3], after.data[index + 3]) / 255;
    const beforeLab = labAt(before.data, index);
    const afterLab = labAt(after.data, index);
    const value = Math.hypot(
      beforeLab[0] - afterLab[0],
      beforeLab[1] - afterLab[1],
      beforeLab[2] - afterLab[2],
    ) * alpha;
    deltaE.push(value);
    sum += value;
    if (value > pixelDeltaE) above += 1;
  }
  deltaE.sort((a, b) => a - b);
  return {
    comparable: true,
    height: before.height,
    maxDeltaE: deltaE.at(-1) ?? 0,
    meanDeltaE: sum / Math.max(pixelCount, 1),
    p95DeltaE: deltaE[Math.min(deltaE.length - 1, Math.floor(deltaE.length * 0.95))] ?? 0,
    pixelRatioAboveDeltaE: above / Math.max(pixelCount, 1),
    ssim: blockSsim(before.data, after.data, before.width, before.height),
    width: before.width,
  };
}

export function comparePngBuffers(before, after, options) {
  return compareRgbaImages(decodePng(before), decodePng(after), options);
}

export function analyzeRgbaContent({ data, height, width }) {
  const pixelCount = width * height;
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  let nonBlackPixels = 0;
  let clippedPixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const index = pixel * 4;
    const luma = lumaAt(data, index);
    lumaSum += luma;
    lumaSquaredSum += luma ** 2;
    if (luma > 12 && data[index + 3] > 0) nonBlackPixels += 1;
    if (data[index] >= 250 && data[index + 1] >= 250 && data[index + 2] >= 250 &&
      data[index + 3] > 0) clippedPixels += 1;
  }
  const meanLuma = lumaSum / Math.max(pixelCount, 1);
  return {
    height,
    clippedPixelRatio: clippedPixels / Math.max(pixelCount, 1),
    lumaStandardDeviation: Math.sqrt(Math.max(
      0,
      lumaSquaredSum / Math.max(pixelCount, 1) - meanLuma ** 2,
    )),
    meanLuma,
    nonBlackPixelRatio: nonBlackPixels / Math.max(pixelCount, 1),
    width,
  };
}

export function analyzePngContent(buffer) {
  return analyzeRgbaContent(decodePng(buffer));
}

export function contentPass(content, thresholds) {
  return content.nonBlackPixelRatio >= thresholds.minNonBlackPixelRatio &&
    content.lumaStandardDeviation >= thresholds.minLumaStandardDeviation &&
    content.clippedPixelRatio <= thresholds.maxClippedPixelRatio;
}

export function metricsPass(metrics, thresholds) {
  return metrics.comparable === true &&
    metrics.meanDeltaE <= thresholds.meanDeltaE &&
    metrics.p95DeltaE <= thresholds.p95DeltaE &&
    metrics.pixelRatioAboveDeltaE <= thresholds.pixelRatioAboveDeltaE &&
    metrics.ssim >= thresholds.ssim;
}
