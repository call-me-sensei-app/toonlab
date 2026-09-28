import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const source = path.resolve(
  process.argv[2]
    ?? 'assets-local/rock-references/SM_CliffClassic2/authored.glb',
);
const output = path.resolve(
  process.argv[3]
    ?? 'assets-local/parity/single-rock/shared/SM_CliffClassic2-authored-4096',
);

const bytes = await fs.readFile(source);
if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== 2) {
  throw new Error(`${source} is not a GLB 2.0 file.`);
}

let json = null;
let binary = null;
let offset = 12;
while (offset < bytes.length) {
  const length = bytes.readUInt32LE(offset);
  const type = bytes.readUInt32LE(offset + 4);
  const data = bytes.subarray(offset + 8, offset + 8 + length);
  if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8').trimEnd());
  if (type === BIN_CHUNK) binary = data;
  offset += 8 + length;
}
if (!json || !binary) throw new Error(`${source} has no JSON or BIN chunk.`);

const material = json.materials?.[0];
if (!material) throw new Error(`${source} has no material.`);

const roles = [
  ['baseColor', material.pbrMetallicRoughness?.baseColorTexture?.index, 'srgb'],
  ['metallicRoughness', material.pbrMetallicRoughness?.metallicRoughnessTexture?.index, 'linear'],
  ['emissive', material.emissiveTexture?.index, 'srgb'],
  ['normal', material.normalTexture?.index, 'linear-normal'],
  ['specular', material.extensions?.KHR_materials_specular?.specularTexture?.index, 'linear'],
];

await fs.mkdir(output, { recursive: true });
const extracted = {};
for (const [role, textureIndex, colorSpace] of roles) {
  if (!Number.isInteger(textureIndex)) continue;
  const texture = json.textures?.[textureIndex];
  const image = json.images?.[texture?.source];
  const view = json.bufferViews?.[image?.bufferView];
  if (!image || !view) throw new Error(`Missing embedded ${role} image data.`);
  if (image.mimeType !== 'image/png') {
    throw new Error(`Expected ${role} to be image/png, got ${image.mimeType}.`);
  }
  const payload = binary.subarray(
    view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength,
  );
  const filename = `${role}.png`;
  await fs.writeFile(path.join(output, filename), payload);
  const textureInfo = role === 'baseColor'
    ? material.pbrMetallicRoughness.baseColorTexture
    : role === 'metallicRoughness'
      ? material.pbrMetallicRoughness.metallicRoughnessTexture
      : role === 'emissive'
        ? material.emissiveTexture
        : role === 'normal'
          ? material.normalTexture
          : material.extensions.KHR_materials_specular.specularTexture;
  extracted[role] = {
    file: filename,
    byteLength: payload.byteLength,
    sha256: crypto.createHash('sha256').update(payload).digest('hex'),
    colorSpace,
    texCoord: textureInfo.texCoord ?? 0,
    textureTransform: textureInfo.extensions?.KHR_texture_transform ?? null,
  };
}

const manifest = {
  schema: 'toonlab.authored-rock-bake',
  version: 1,
  source: path.relative(process.cwd(), source),
  sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  sourceGenerator: json.asset?.generator ?? null,
  material: material.name ?? null,
  alphaMode: material.alphaMode ?? 'OPAQUE',
  alphaCutoff: material.alphaCutoff ?? 0.5,
  emissiveFactor: material.emissiveFactor ?? [0, 0, 0],
  images: extracted,
};
await fs.writeFile(
  path.join(output, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Extracted ${Object.keys(extracted).length} authored maps to ${output}`);
