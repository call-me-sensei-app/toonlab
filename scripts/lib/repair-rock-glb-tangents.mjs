import { createHash } from 'node:crypto';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== 2) {
    throw new Error('Expected a glTF 2.0 binary payload.');
  }
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB byte length is inconsistent.');
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) throw new Error('GLB chunk is truncated.');
    chunks.push({ type, data });
    offset += 8 + length;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
  const binChunk = chunks.find((chunk) => chunk.type === BIN_CHUNK);
  if (!jsonChunk || !binChunk) throw new Error('GLB requires JSON and BIN chunks.');
  return {
    chunks,
    json: JSON.parse(jsonChunk.data.toString('utf8').replace(/[\u0000 ]+$/u, '')),
    bin: binChunk.data,
  };
}

function accessorReader(document, accessorIndex) {
  const accessor = document.json.accessors?.[accessorIndex];
  if (!accessor || accessor.sparse) throw new Error(`Unsupported tangent accessor ${accessorIndex}.`);
  const view = document.json.bufferViews?.[accessor.bufferView];
  if (!view || Number(view.buffer ?? 0) !== 0) {
    throw new Error(`Tangent accessor ${accessorIndex} is not in the GLB BIN chunk.`);
  }
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC4' || accessor.normalized === true) {
    return { accessor, invalidFormat: true, get: () => [NaN, NaN, NaN, NaN] };
  }
  const stride = view.byteStride ?? 16;
  const base = Number(view.byteOffset ?? 0) + Number(accessor.byteOffset ?? 0);
  const data = new DataView(document.bin.buffer, document.bin.byteOffset, document.bin.byteLength);
  return {
    accessor,
    invalidFormat: false,
    get(index) {
      const offset = base + index * stride;
      return [0, 4, 8, 12].map((delta) => data.getFloat32(offset + delta, true));
    },
  };
}

function inspectTangentAccessor(document, accessorIndex, epsilon = 1e-6) {
  const reader = accessorReader(document, accessorIndex);
  const report = {
    accessor: accessorIndex,
    vertices: Number(reader.accessor.count ?? 0),
    invalidVertices: 0,
    zeroLength: 0,
    nonFinite: 0,
    invalidHandedness: 0,
    invalidFormat: reader.invalidFormat,
  };
  if (reader.invalidFormat) {
    report.invalidVertices = report.vertices;
    return report;
  }
  const epsilonSquared = epsilon ** 2;
  for (let index = 0; index < report.vertices; index += 1) {
    const [x, y, z, w] = reader.get(index);
    const finite = [x, y, z, w].every(Number.isFinite);
    const lengthSquared = (x * x) + (y * y) + (z * z);
    let invalid = false;
    if (!finite) {
      report.nonFinite += 1;
      invalid = true;
    }
    if (!Number.isFinite(lengthSquared) || lengthSquared <= epsilonSquared) {
      report.zeroLength += 1;
      invalid = true;
    }
    if (!Number.isFinite(w) || Math.abs(w) < 0.5) {
      report.invalidHandedness += 1;
      invalid = true;
    }
    if (invalid) report.invalidVertices += 1;
  }
  return report;
}

function buildGlb(document, json) {
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonPadding = (4 - (rawJson.length % 4)) % 4;
  const jsonData = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const chunks = document.chunks.map((chunk) => (
    chunk.type === JSON_CHUNK ? { type: chunk.type, data: jsonData } : chunk
  ));
  const length = 12 + chunks.reduce((total, chunk) => total + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(length);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(length, 8);
  let offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

export function auditRockGlbTangents(bytes) {
  const document = parseGlb(bytes);
  const primitives = [];
  for (const [meshIndex, mesh] of (document.json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const tangentAccessor = primitive.attributes?.TANGENT;
      if (tangentAccessor === undefined) continue;
      primitives.push({
        meshIndex,
        meshName: mesh.name ?? null,
        primitiveIndex,
        ...inspectTangentAccessor(document, tangentAccessor),
      });
    }
  }
  return {
    meshes: document.json.meshes?.length ?? 0,
    primitivesWithTangents: primitives.length,
    invalidPrimitives: primitives.filter((primitive) => primitive.invalidVertices > 0).length,
    invalidVertices: primitives.reduce((total, primitive) => total + primitive.invalidVertices, 0),
    tangentVertices: primitives.reduce((total, primitive) => total + primitive.vertices, 0),
    primitives,
    binSha256: sha256(document.bin),
  };
}

export function repairRockGlbTangents(bytes) {
  const document = parseGlb(bytes);
  const json = structuredClone(document.json);
  const before = auditRockGlbTangents(bytes);
  const removed = [];
  for (const primitive of before.primitives) {
    if (primitive.invalidVertices === 0) continue;
    delete json.meshes[primitive.meshIndex].primitives[primitive.primitiveIndex].attributes.TANGENT;
    removed.push({
      meshIndex: primitive.meshIndex,
      meshName: primitive.meshName,
      primitiveIndex: primitive.primitiveIndex,
      tangentAccessor: primitive.accessor,
      invalidVertices: primitive.invalidVertices,
      tangentVertices: primitive.vertices,
    });
  }
  const output = buildGlb(document, json);
  const after = auditRockGlbTangents(output);
  if (after.invalidPrimitives !== 0) throw new Error('Tangent repair left invalid primitives behind.');
  if (after.binSha256 !== before.binSha256) throw new Error('Tangent repair changed the binary geometry/texture chunk.');
  return {
    bytes: output,
    report: {
      before,
      after,
      removed,
      repaired: removed.length > 0,
      sourceSha256: sha256(bytes),
      outputSha256: sha256(output),
      binaryPayloadUnchanged: true,
    },
  };
}
