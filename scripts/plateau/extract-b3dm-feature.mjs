import { readFile } from "node:fs/promises";
import draco3d from "draco3d";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BINARY = 0x004e4942;

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function parseJsonBytes(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes).trim());
}

function parseB3dm(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== "b3dm") {
    throw new Error("Expected a b3dm tile.");
  }
  if (view.getUint32(4, true) !== 1) throw new Error("Only b3dm version 1 is supported.");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("Truncated b3dm tile.");

  const featureJsonLength = view.getUint32(12, true);
  const featureBinaryLength = view.getUint32(16, true);
  const batchJsonLength = view.getUint32(20, true);
  const batchBinaryLength = view.getUint32(24, true);
  const featureStart = 28;
  const batchStart = featureStart + featureJsonLength + featureBinaryLength;
  const glbStart = batchStart + batchJsonLength + batchBinaryLength;

  return {
    featureTable: parseJsonBytes(bytes.subarray(featureStart, featureStart + featureJsonLength)),
    batchTable: parseJsonBytes(bytes.subarray(batchStart, batchStart + batchJsonLength)),
    glb: bytes.subarray(glbStart),
  };
}

function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) {
    throw new Error("The b3dm payload is not GLB 2.0.");
  }
  let json = null;
  let binary = new Uint8Array();
  let offset = 12;
  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_JSON) json = parseJsonBytes(chunk);
    if (type === GLB_BINARY) binary = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error("The GLB has no JSON chunk.");
  return { json, binary };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function componentTypeFor(array) {
  if (array instanceof Uint8Array) return 5121;
  if (array instanceof Uint16Array) return 5123;
  if (array instanceof Uint32Array) return 5125;
  return 5126;
}

function accessorType(itemSize) {
  return itemSize === 1 ? "SCALAR" : `VEC${itemSize}`;
}

function minMax(array, itemSize) {
  const min = Array(itemSize).fill(Infinity);
  const max = Array(itemSize).fill(-Infinity);
  for (let i = 0; i < array.length; i += itemSize) {
    for (let c = 0; c < itemSize; c += 1) {
      min[c] = Math.min(min[c], array[i + c]);
      max[c] = Math.max(max[c], array[i + c]);
    }
  }
  return { min, max };
}

function localRotation(longitude, latitude) {
  const lambda = longitude * Math.PI / 180;
  const phi = latitude * Math.PI / 180;
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  return (gltfX, gltfY, gltfZ) => {
    // Legacy b3dm embeds glTF Y-up geometry inside the ECEF/Z-up tiles
    // coordinate system. Apply the mandated glTF -> 3D Tiles axis rotation
    // before converting ECEF offsets to a local east/up/north frame.
    const x = gltfX;
    const y = -gltfZ;
    const z = gltfY;
    const east = -sinLambda * x + cosLambda * y;
    const north = -sinPhi * cosLambda * x - sinPhi * sinLambda * y + cosPhi * z;
    const up = cosPhi * cosLambda * x + cosPhi * sinLambda * y + sinPhi * z;
    return [east, up, -north];
  };
}

function readDracoAttribute(module, decoder, geometry, uniqueId) {
  const attribute = decoder.GetAttributeByUniqueId(geometry, uniqueId);
  if (!attribute || attribute.ptr === 0) throw new Error(`Draco attribute ${uniqueId} is missing.`);
  const itemSize = attribute.num_components();
  const values = new module.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(geometry, attribute, values);
  const output = new Float32Array(values.size());
  for (let i = 0; i < output.length; i += 1) output[i] = values.GetValue(i);
  module.destroy(values);
  return { itemSize, values: output };
}

function decodePrimitive(module, sourceJson, sourceBinary, primitive) {
  const extension = primitive.extensions?.KHR_draco_mesh_compression;
  if (!extension) throw new Error("PLATEAU primitive is not Draco-compressed.");
  const view = sourceJson.bufferViews?.[extension.bufferView];
  if (!view) throw new Error("Draco bufferView is missing.");
  const compressed = sourceBinary.subarray(
    Number(view.byteOffset ?? 0),
    Number(view.byteOffset ?? 0) + Number(view.byteLength),
  );

  const buffer = new module.DecoderBuffer();
  buffer.Init(new Int8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength), compressed.byteLength);
  const decoder = new module.Decoder();
  const geometry = new module.Mesh();
  const status = decoder.DecodeBufferToMesh(buffer, geometry);
  if (!status.ok() || geometry.ptr === 0) {
    const message = status.error_msg?.() || "unknown Draco error";
    module.destroy(geometry);
    module.destroy(decoder);
    module.destroy(buffer);
    throw new Error(`Could not decode PLATEAU primitive: ${message}`);
  }

  const face = new module.DracoInt32Array();
  const indices = new Uint32Array(geometry.num_faces() * 3);
  for (let i = 0; i < geometry.num_faces(); i += 1) {
    decoder.GetFaceFromMesh(geometry, i, face);
    indices[i * 3] = face.GetValue(0);
    indices[i * 3 + 1] = face.GetValue(1);
    indices[i * 3 + 2] = face.GetValue(2);
  }
  module.destroy(face);

  const attributes = {};
  for (const [semantic, uniqueId] of Object.entries(extension.attributes ?? {})) {
    attributes[semantic] = readDracoAttribute(module, decoder, geometry, uniqueId);
  }

  module.destroy(geometry);
  module.destroy(decoder);
  module.destroy(buffer);
  return { attributes, indices };
}

function isolateFeature(decoded, batchId) {
  const batches = decoded.attributes._BATCHID;
  if (!batches) throw new Error("PLATEAU primitive has no _BATCHID attribute.");
  const retained = [];
  for (let i = 0; i < decoded.indices.length; i += 3) {
    const a = decoded.indices[i];
    const b = decoded.indices[i + 1];
    const c = decoded.indices[i + 2];
    if (
      Math.round(batches.values[a * batches.itemSize]) === batchId
      && Math.round(batches.values[b * batches.itemSize]) === batchId
      && Math.round(batches.values[c * batches.itemSize]) === batchId
    ) {
      retained.push(a, b, c);
    }
  }
  if (retained.length === 0) return null;

  const sourceToOutput = new Map();
  const compactIndices = [];
  for (const sourceIndex of retained) {
    if (!sourceToOutput.has(sourceIndex)) sourceToOutput.set(sourceIndex, sourceToOutput.size);
    compactIndices.push(sourceToOutput.get(sourceIndex));
  }
  const IndexArray = sourceToOutput.size <= 65_535 ? Uint16Array : Uint32Array;
  const attributes = {};
  for (const [semantic, source] of Object.entries(decoded.attributes)) {
    if (semantic === "_BATCHID") continue;
    const values = new Float32Array(sourceToOutput.size * source.itemSize);
    for (const [sourceIndex, outputIndex] of sourceToOutput) {
      const start = sourceIndex * source.itemSize;
      values.set(source.values.subarray(start, start + source.itemSize), outputIndex * source.itemSize);
    }
    attributes[semantic] = { itemSize: source.itemSize, values };
  }
  return { attributes, indices: new IndexArray(compactIndices) };
}

function orientAndCenter(primitives, longitude, latitude) {
  const rotate = localRotation(longitude, latitude);
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const primitive of primitives) {
    const position = primitive.attributes.POSITION;
    if (!position || position.itemSize !== 3) throw new Error("PLATEAU primitive has no VEC3 POSITION.");
    for (let i = 0; i < position.values.length; i += 3) {
      const [x, y, z] = rotate(position.values[i], position.values[i + 1], position.values[i + 2]);
      position.values[i] = x;
      position.values[i + 1] = y;
      position.values[i + 2] = z;
      bounds.min[0] = Math.min(bounds.min[0], x);
      bounds.min[1] = Math.min(bounds.min[1], y);
      bounds.min[2] = Math.min(bounds.min[2], z);
      bounds.max[0] = Math.max(bounds.max[0], x);
      bounds.max[1] = Math.max(bounds.max[1], y);
      bounds.max[2] = Math.max(bounds.max[2], z);
    }
    const normal = primitive.attributes.NORMAL;
    if (normal?.itemSize === 3) {
      for (let i = 0; i < normal.values.length; i += 3) {
        const [x, y, z] = rotate(normal.values[i], normal.values[i + 1], normal.values[i + 2]);
        const length = Math.hypot(x, y, z) || 1;
        normal.values[i] = x / length;
        normal.values[i + 1] = y / length;
        normal.values[i + 2] = z / length;
      }
    }
  }

  const offset = [
    -(bounds.min[0] + bounds.max[0]) / 2,
    -bounds.min[1],
    -(bounds.min[2] + bounds.max[2]) / 2,
  ];
  for (const primitive of primitives) {
    const position = primitive.attributes.POSITION.values;
    for (let i = 0; i < position.length; i += 3) {
      position[i] += offset[0];
      position[i + 1] += offset[1];
      position[i + 2] += offset[2];
    }
  }
  return {
    height: bounds.max[1] - bounds.min[1],
    size: [
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    ],
  };
}

function makeGlb(source, primitives, metadata) {
  const binaryParts = [];
  let binaryLength = 0;
  const json = {
    asset: {
      version: "2.0",
      generator: "ToonLab Project PLATEAU single-feature extractor",
      extras: metadata,
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: metadata.name }],
    meshes: [{ name: metadata.name, primitives: [] }],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };

  function appendBytes(bytes, target) {
    const alignedOffset = align4(binaryLength);
    if (alignedOffset > binaryLength) binaryParts.push(new Uint8Array(alignedOffset - binaryLength));
    const copy = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    binaryParts.push(copy);
    const viewIndex = json.bufferViews.push({
      buffer: 0,
      byteOffset: alignedOffset,
      byteLength: copy.byteLength,
      ...(target ? { target } : {}),
    }) - 1;
    binaryLength = alignedOffset + copy.byteLength;
    return viewIndex;
  }

  function appendAccessor(array, itemSize, target, includeBounds = false) {
    const bufferView = appendBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), target);
    const accessor = {
      bufferView,
      componentType: componentTypeFor(array),
      count: array.length / itemSize,
      type: accessorType(itemSize),
    };
    if (includeBounds) Object.assign(accessor, minMax(array, itemSize));
    return json.accessors.push(accessor) - 1;
  }

  const usedMaterials = [...new Set(primitives.map((primitive) => primitive.material))];
  const materialMap = new Map(usedMaterials.map((material, index) => [material, index]));
  if (usedMaterials.length) json.materials = usedMaterials.map((index) => clone(source.json.materials[index]));

  const usesTexture = json.materials?.some((material) => material.pbrMetallicRoughness?.baseColorTexture);
  if (usesTexture) {
    json.samplers = clone(source.json.samplers ?? []);
    json.textures = clone(source.json.textures ?? []);
    json.images = (source.json.images ?? []).map((image) => {
      if (!Number.isInteger(image.bufferView)) return clone(image);
      const view = source.json.bufferViews[image.bufferView];
      const bytes = source.binary.subarray(
        Number(view.byteOffset ?? 0),
        Number(view.byteOffset ?? 0) + Number(view.byteLength),
      );
      return {
        ...clone(image),
        bufferView: appendBytes(bytes),
      };
    });
    json.extensionsUsed = ["EXT_texture_webp"];
    json.extensionsRequired = ["EXT_texture_webp"];
  }

  let triangleCount = 0;
  let vertexCount = 0;
  for (const primitive of primitives) {
    const attributes = {};
    for (const [semantic, attribute] of Object.entries(primitive.attributes)) {
      attributes[semantic] = appendAccessor(
        attribute.values,
        attribute.itemSize,
        34962,
        semantic === "POSITION",
      );
    }
    json.meshes[0].primitives.push({
      attributes,
      indices: appendAccessor(primitive.indices, 1, 34963),
      material: materialMap.get(primitive.material),
      mode: 4,
    });
    triangleCount += primitive.indices.length / 3;
    vertexCount += primitive.attributes.POSITION.values.length / 3;
  }
  json.asset.extras.triangleCount = triangleCount;
  json.asset.extras.vertexCount = vertexCount;

  const binary = new Uint8Array(align4(binaryLength));
  let offset = 0;
  for (const part of binaryParts) {
    binary.set(part, offset);
    offset += part.byteLength;
  }
  json.buffers[0].byteLength = binary.byteLength;

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.byteLength);
  const output = new Uint8Array(12 + 8 + jsonLength + 8 + binary.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, GLB_JSON, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(jsonBytes, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, binary.byteLength, true);
  view.setUint32(binaryHeader + 4, GLB_BINARY, true);
  output.set(binary, binaryHeader + 8);

  return {
    bytes: output,
    triangleCount,
    vertexCount,
  };
}

async function sourceBytes({ sourceFile, sourceUrl, fetchImpl = fetch }) {
  if (sourceFile) return new Uint8Array(await readFile(sourceFile));
  if (!sourceUrl) throw new Error("A sourceFile or sourceUrl is required.");
  const response = await fetchImpl(sourceUrl, {
    headers: { accept: "application/octet-stream" },
  });
  if (!response.ok) throw new Error(`PLATEAU tile HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Extract one CityGML feature from a PLATEAU b3dm tile into a portable,
 * origin-centered, Y-up GLB. Neighboring buildings are removed by their
 * per-triangle `_BATCHID`.
 */
export async function extractB3dmFeature({
  sourceFile,
  sourceUrl,
  gmlId,
  longitude,
  latitude,
  name,
  metadata = {},
  fetchImpl,
}) {
  const tile = parseB3dm(await sourceBytes({ sourceFile, sourceUrl, fetchImpl }));
  const gmlIds = tile.batchTable.gml_id;
  if (!Array.isArray(gmlIds)) throw new Error("PLATEAU batch table has no gml_id list.");
  const batchId = gmlIds.indexOf(gmlId);
  if (batchId < 0) throw new Error(`Feature ${gmlId} is not present in this tile.`);
  if (Number(tile.featureTable.BATCH_LENGTH) !== gmlIds.length) {
    throw new Error("PLATEAU batch table length does not match BATCH_LENGTH.");
  }

  const source = parseGlb(tile.glb);
  const module = await draco3d.createDecoderModule({});
  const primitives = [];
  try {
    for (const primitive of source.json.meshes?.[0]?.primitives ?? []) {
      const isolated = isolateFeature(decodePrimitive(module, source.json, source.binary, primitive), batchId);
      if (isolated) primitives.push({ ...isolated, material: primitive.material });
    }
  } finally {
    // Decoder objects are released per primitive. Emscripten owns the module.
  }
  if (primitives.length === 0) throw new Error(`Feature ${gmlId} has no triangles.`);

  const bounds = orientAndCenter(primitives, longitude, latitude);
  return {
    ...makeGlb(source, primitives, {
      ...metadata,
      name,
      sourceGmlId: gmlId,
      sourceTileUrl: sourceUrl ?? null,
      processing: "Extracted and re-centered by ToonLab; neighboring PLATEAU features removed.",
      coordinateSystem: "local Y-up metres",
      boundsMetres: bounds.size,
    }),
    batchId,
    bounds,
  };
}
