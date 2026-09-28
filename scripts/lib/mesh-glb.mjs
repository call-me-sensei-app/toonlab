function align4(value) {
  return (value + 3) & ~3;
}

function accessorBounds(values, itemSize) {
  const minimum = Array(itemSize).fill(Infinity);
  const maximum = Array(itemSize).fill(-Infinity);
  for (let index = 0; index < values.length; index += itemSize) {
    for (let axis = 0; axis < itemSize; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], values[index + axis]);
      maximum[axis] = Math.max(maximum[axis], values[index + axis]);
    }
  }
  return { maximum, minimum };
}

export function encodeMeshGlb(mesh, options = {}) {
  const positions = mesh.positions instanceof Float32Array ? mesh.positions : new Float32Array(mesh.positions);
  const normals = mesh.normals instanceof Float32Array ? mesh.normals : new Float32Array(mesh.normals);
  const indices = mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices);
  const uvs = mesh.uvs ? (mesh.uvs instanceof Float32Array ? mesh.uvs : new Float32Array(mesh.uvs)) : null;
  const chunks = [
    { bytes: Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength), target: 34962 },
    { bytes: Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength), target: 34962 },
  ];
  if (uvs) chunks.push({ bytes: Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength), target: 34962 });
  chunks.push({ bytes: Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength), target: 34963 });
  let binaryLength = 0;
  for (const chunk of chunks) {
    chunk.byteOffset = binaryLength;
    binaryLength = align4(binaryLength + chunk.bytes.length);
  }
  const binary = Buffer.alloc(binaryLength);
  for (const chunk of chunks) chunk.bytes.copy(binary, chunk.byteOffset);
  const positionBounds = accessorBounds(positions, 3);
  const bufferViews = chunks.map((chunk) => ({
    buffer: 0,
    byteLength: chunk.bytes.length,
    byteOffset: chunk.byteOffset,
    target: chunk.target,
  }));
  const accessors = [
    { bufferView: 0, byteOffset: 0, componentType: 5126, count: positions.length / 3, max: positionBounds.maximum, min: positionBounds.minimum, type: 'VEC3' },
    { bufferView: 1, byteOffset: 0, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
  ];
  const attributes = { NORMAL: 1, POSITION: 0 };
  let indexBufferView = 2;
  if (uvs) {
    const uvBounds = accessorBounds(uvs, 2);
    accessors.push({ bufferView: 2, byteOffset: 0, componentType: 5126, count: uvs.length / 2, max: uvBounds.maximum, min: uvBounds.minimum, type: 'VEC2' });
    attributes.TEXCOORD_0 = 2;
    indexBufferView = 3;
  }
  const indexAccessor = accessors.length;
  accessors.push({ bufferView: indexBufferView, byteOffset: 0, componentType: 5125, count: indices.length, max: [Math.max(...indices)], min: [Math.min(...indices)], type: 'SCALAR' });
  const document = {
    accessors,
    asset: { generator: 'ToonLab rock geology v2 editable-source pilot', version: '2.0' },
    bufferViews,
    buffers: [{ byteLength: binary.length }],
    meshes: [{ name: options.name ?? 'rock-control-cage', primitives: [{ attributes, indices: indexAccessor, mode: 4 }] }],
    nodes: [{ mesh: 0, name: options.name ?? 'rock-control-cage' }],
    scene: 0,
    scenes: [{ nodes: [0] }],
  };
  const jsonBytes = Buffer.from(JSON.stringify(document));
  const paddedJsonLength = align4(jsonBytes.length);
  const jsonChunk = Buffer.alloc(paddedJsonLength, 0x20);
  jsonBytes.copy(jsonChunk);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binary.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}
