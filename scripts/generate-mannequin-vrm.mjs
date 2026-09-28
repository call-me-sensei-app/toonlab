import { readFile, writeFile } from 'node:fs/promises';

const inputUrl = new URL('../public/characters/mannequin.glb', import.meta.url);
const outputUrl = new URL('../public/characters/mannequin.vrm', import.meta.url);

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function alignedLength(length) {
  return Math.ceil(length / 4) * 4;
}

function findNode(json, name) {
  const index = json.nodes?.findIndex((node) => node.name === name) ?? -1;
  if (index < 0) throw new Error(`The source mannequin is missing required bone ${name}.`);
  return index;
}

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Source is not a GLB file.');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('Only GLB 2.0 is supported.');
  const chunks = [];
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    chunks.push({ data: buffer.subarray(offset + 8, offset + 8 + length), type });
    offset += 8 + length;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
  if (!jsonChunk) throw new Error('Source GLB has no JSON chunk.');
  return {
    chunks,
    json: JSON.parse(jsonChunk.data.toString('utf8').trim()),
  };
}

function addVrmExtension(json) {
  const bone = (name) => ({ node: findNode(json, name) });
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_vrm'])];
  json.extensions = {
    ...(json.extensions ?? {}),
    VRMC_vrm: {
      specVersion: '1.0',
      meta: {
        name: 'ToonLab CC0 Mannequin',
        version: '1.0',
        authors: ['Quaternius'],
        copyrightInformation: 'CC0 1.0 Universal',
        contactInformation: 'https://quaternius.com',
        references: ['https://quaternius.com/packs/universalanimationlibrary.html'],
        thirdPartyLicenses: 'CC0 1.0 Universal public domain dedication',
        avatarPermission: 'everyone',
        commercialUsage: 'corporation',
        creditNotation: 'unnecessary',
        allowExcessivelyViolentUsage: true,
        allowExcessivelySexualUsage: true,
        allowPoliticalOrReligiousUsage: true,
        allowAntisocialOrHateUsage: true,
        allowRedistribution: true,
        modification: 'allowModificationRedistribution',
        licenseUrl: 'https://vrm.dev/licenses/1.0/',
        otherLicenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      },
      humanoid: {
        humanBones: {
          hips: bone('DEF-hips'),
          spine: bone('DEF-spine.001'),
          chest: bone('DEF-spine.002'),
          upperChest: bone('DEF-spine.003'),
          neck: bone('DEF-neck'),
          head: bone('DEF-head'),
          leftShoulder: bone('DEF-shoulder.L'),
          leftUpperArm: bone('DEF-upper_arm.L'),
          leftLowerArm: bone('DEF-forearm.L'),
          leftHand: bone('DEF-hand.L'),
          rightShoulder: bone('DEF-shoulder.R'),
          rightUpperArm: bone('DEF-upper_arm.R'),
          rightLowerArm: bone('DEF-forearm.R'),
          rightHand: bone('DEF-hand.R'),
          leftUpperLeg: bone('DEF-thigh.L'),
          leftLowerLeg: bone('DEF-shin.L'),
          leftFoot: bone('DEF-foot.L'),
          leftToes: bone('DEF-toe.L'),
          rightUpperLeg: bone('DEF-thigh.R'),
          rightLowerLeg: bone('DEF-shin.R'),
          rightFoot: bone('DEF-foot.R'),
          rightToes: bone('DEF-toe.R'),
        },
      },
    },
  };
  return json;
}

function encodeGlb(json, sourceChunks) {
  const encoded = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLength = alignedLength(encoded.length);
  const jsonData = Buffer.alloc(jsonLength, 0x20);
  encoded.copy(jsonData);
  const remainingChunks = sourceChunks.filter((chunk) => chunk.type !== JSON_CHUNK);
  const totalLength = 12 + 8 + jsonData.length + remainingChunks.reduce(
    (total, chunk) => total + 8 + chunk.data.length,
    0,
  );
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  for (const chunk of [{ data: jsonData, type: JSON_CHUNK }, ...remainingChunks]) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

const source = await readFile(inputUrl);
const { chunks, json } = parseGlb(source);
const output = encodeGlb(addVrmExtension(json), chunks);
await writeFile(outputUrl, output);
console.log(`Wrote ${outputUrl.pathname} (${output.length} bytes).`);
