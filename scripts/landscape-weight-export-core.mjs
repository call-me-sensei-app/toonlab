import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function encodeLinearGrayscalePng(width, height, pixels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid PNG dimensions ${width}x${height}`);
  }
  if (pixels.length !== width * height) {
    throw new Error(`Expected ${width * height} grayscale samples, received ${pixels.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no Adam7 interlace

  const scanlines = Buffer.allocUnsafe((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const outputOffset = y * (width + 1);
    scanlines[outputOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width, width).copy(
      scanlines,
      outputOffset + 1,
    );
  }

  // Deliberately omit gAMA/sRGB chunks. Landscape weights are linear scalar
  // data, not display color; every byte must round-trip unchanged.
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function encodeLinearRgbaPng(width, height, pixels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid PNG dimensions ${width}x${height}`);
  }
  if (pixels.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA samples, received ${pixels.length}`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const outputOffset = y * (stride + 1);
    scanlines[outputOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      scanlines,
      outputOffset + 1,
    );
  }

  // As with the scalar masks, omit display-transfer chunks. Every channel is
  // an independent linear Landscape weight and must survive byte-for-byte.
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

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
  if (!Buffer.from(buffer.subarray(0, 8)).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file');
  }
  let offset = 8;
  let header = null;
  const idat = [];
  const chunkTypes = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(buffer.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) throw new Error(`PNG ${type} CRC mismatch`);
    chunkTypes.push(type);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (!header) throw new Error('PNG has no IHDR');
  if (header.bitDepth !== 8 || header.compression !== 0 || header.filter !== 0) {
    throw new Error(`Unsupported PNG format ${JSON.stringify(header)}`);
  }
  if (header.interlace !== 0) throw new Error('Adam7 PNGs are not supported');
  const channelsByColorType = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = channelsByColorType[header.colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${header.colorType}`);

  const stride = header.width * channels;
  const filtered = inflateSync(Buffer.concat(idat));
  const expectedLength = (stride + 1) * header.height;
  if (filtered.length !== expectedLength) {
    throw new Error(`PNG scanline size mismatch: ${filtered.length} != ${expectedLength}`);
  }
  const pixels = Buffer.allocUnsafe(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filterType = filtered[y * (stride + 1)];
    const inputOffset = y * (stride + 1) + 1;
    const outputOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[inputOffset + x];
      const left = x >= channels ? pixels[outputOffset + x - channels] : 0;
      const up = y > 0 ? pixels[outputOffset + x - stride] : 0;
      const upLeft = y > 0 && x >= channels
        ? pixels[outputOffset + x - stride - channels]
        : 0;
      let value;
      if (filterType === 0) value = raw;
      else if (filterType === 1) value = raw + left;
      else if (filterType === 2) value = raw + up;
      else if (filterType === 3) value = raw + Math.floor((left + up) / 2);
      else if (filterType === 4) value = raw + paeth(left, up, upLeft);
      else throw new Error(`Unsupported PNG filter ${filterType}`);
      pixels[outputOffset + x] = value & 0xff;
    }
  }
  return { ...header, channels, chunkTypes, pixels };
}

export function maskStatistics(pixels) {
  let min = 255;
  let max = 0;
  let sum = 0;
  let nonZero = 0;
  let full = 0;
  for (const value of pixels) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    if (value !== 0) nonZero += 1;
    if (value === 255) full += 1;
  }
  return {
    min,
    max,
    sum,
    nonZeroSamples: nonZero,
    fullWeightSamples: full,
    mean: sum / pixels.length,
  };
}
