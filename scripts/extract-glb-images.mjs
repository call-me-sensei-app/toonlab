#!/usr/bin/env node

/** Extract embedded image bytes from a GLB without recompression. */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') options.input = path.resolve(argv[++index] ?? '');
    else if (argv[index] === '--output') options.output = path.resolve(argv[++index] ?? '');
    else throw new RangeError(`Unknown argument: ${argv[index]}`);
  }
  if (!options.input || !options.output) throw new RangeError('--input and --output are required.');
  return options;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeName(value, fallback) {
  const candidate = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return candidate || fallback;
}

function extension(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  throw new RangeError(`Unsupported embedded image type: ${mimeType}`);
}

function parseGlb(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Input is not a valid GLB.');
  }
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Only a complete GLB version 2 file is supported.');
  }
  let offset = 12;
  const chunks = [];
  while (offset < bytes.length) {
    const byteLength = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + byteLength;
    if (end > bytes.length) throw new Error('GLB chunk exceeds file bounds.');
    chunks.push({ data: bytes.subarray(start, end), type });
    offset = end;
  }
  const jsonChunks = chunks.filter((chunk) => chunk.type === JSON_CHUNK);
  const binChunks = chunks.filter((chunk) => chunk.type === BIN_CHUNK);
  if (jsonChunks.length !== 1 || binChunks.length !== 1) {
    throw new Error(`Expected one JSON and one BIN chunk; found ${jsonChunks.length}/${binChunks.length}.`);
  }
  const json = JSON.parse(
    jsonChunks[0].data.toString('utf8').replace(/[\u0000\u0020]+$/u, ''),
  );
  return { binary: binChunks[0].data, json };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const input = await readFile(options.input);
  const { binary, json } = parseGlb(input);
  await mkdir(options.output, { recursive: true });
  const records = [];
  for (const [index, image] of (json.images ?? []).entries()) {
    if (!Number.isInteger(image.bufferView)) {
      throw new Error(`Image ${index} is external; this extractor only accepts embedded images.`);
    }
    const view = json.bufferViews?.[image.bufferView];
    if (!view || view.buffer !== 0) throw new Error(`Image ${index} has an invalid bufferView.`);
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (end > binary.length) throw new Error(`Image ${index} exceeds the BIN chunk.`);
    const imageBytes = binary.subarray(start, end);
    const filename = `${String(index).padStart(2, '0')}-${safeName(image.name, `image-${index}`)}.${extension(image.mimeType)}`;
    const file = path.join(options.output, filename);
    await writeFile(file, imageBytes);
    records.push({
      index,
      name: image.name ?? null,
      mimeType: image.mimeType,
      file,
      bytes: imageBytes.length,
      sha256: digest(imageBytes),
    });
  }
  const manifest = {
    schema: 'toonlab/glb-embedded-images',
    version: 1,
    source: {
      file: options.input,
      bytes: input.length,
      sha256: digest(input),
    },
    records,
  };
  const manifestFile = path.join(options.output, 'manifest.json');
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: manifestFile, records }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
