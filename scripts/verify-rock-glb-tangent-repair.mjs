import assert from 'node:assert/strict';

import { auditRockGlbTangents, repairRockGlbTangents } from './lib/repair-rock-glb-tangents.mjs';

function glb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonData = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
  const binData = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const output = Buffer.alloc(12 + 8 + jsonData.length + 8 + binData.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonData.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonData.copy(output, 20);
  const binHeader = 20 + jsonData.length;
  output.writeUInt32LE(binData.length, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  binData.copy(output, binHeader + 8);
  return output;
}

const tangentBytes = Buffer.alloc(3 * 16);
const tangents = new DataView(tangentBytes.buffer, tangentBytes.byteOffset, tangentBytes.byteLength);
for (let index = 0; index < 3; index += 1) {
  tangents.setFloat32(index * 16, index === 0 ? 0 : 1, true);
  tangents.setFloat32(index * 16 + 4, 0, true);
  tangents.setFloat32(index * 16 + 8, 0, true);
  tangents.setFloat32(index * 16 + 12, 1, true);
}
const source = glb({
  asset: { version: '2.0' },
  buffers: [{ byteLength: tangentBytes.length }],
  bufferViews: [{ buffer: 0, byteLength: tangentBytes.length }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC4' }],
  meshes: [{ name: 'fixture_LOD0', primitives: [{ attributes: { TANGENT: 0 }, mode: 4 }] }],
}, tangentBytes);

const before = auditRockGlbTangents(source);
assert.equal(before.invalidPrimitives, 1);
assert.equal(before.invalidVertices, 1);
const repaired = repairRockGlbTangents(source);
assert.equal(repaired.report.removed.length, 1);
assert.equal(repaired.report.binaryPayloadUnchanged, true);
assert.notEqual(repaired.report.sourceSha256, repaired.report.outputSha256);
assert.equal(repaired.report.after.invalidPrimitives, 0);
assert.equal(repaired.report.after.primitivesWithTangents, 0);

const second = repairRockGlbTangents(repaired.bytes);
assert.equal(second.report.repaired, false);
assert.equal(second.report.sourceSha256, second.report.outputSha256);
console.log('1 rock GLB tangent repair check passed.');
