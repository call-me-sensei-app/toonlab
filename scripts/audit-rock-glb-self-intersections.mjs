#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { auditSelfIntersections } from '../src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js';

const scriptFile = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptFile), '..');
const topologyModuleFile = path.resolve(
  repositoryRoot,
  'src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js',
);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArguments(argv) {
  const options = { supportToleranceMetres: 0.02, upAxis: 'Y' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input') options.input = path.resolve(argv[++index] ?? '');
    else if (argument === '--output') options.output = path.resolve(argv[++index] ?? '');
    else if (argument === '--expected-sha256') options.expectedSha256 = String(argv[++index] ?? '').replace(/^sha256:/u, '');
    else if (argument === '--support-tolerance-metres') options.supportToleranceMetres = Number(argv[++index]);
    else if (argument === '--up-axis') options.upAxis = String(argv[++index] ?? '').toUpperCase();
    else throw new RangeError(`Unknown argument: ${argument}`);
  }
  if (!options.input || !options.output || !/^[a-f0-9]{64}$/u.test(options.expectedSha256 ?? '')) {
    throw new RangeError('Usage: --input <glb> --output <json> --expected-sha256 <64 hex> [--up-axis X|Y|Z] [--support-tolerance-metres n]');
  }
  if (!['X', 'Y', 'Z'].includes(options.upAxis)) throw new RangeError('--up-axis must be X, Y, or Z.');
  if (!(options.supportToleranceMetres > 0 && Number.isFinite(options.supportToleranceMetres))) {
    throw new RangeError('--support-tolerance-metres must be finite and positive.');
  }
  return options;
}

function repositoryPath(file) {
  const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
  if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error(`Path escapes repository: ${file}`);
  return relative;
}

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = Object.freeze({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 });
const TYPE_COMPONENTS = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });

function parseGlb(bytes, label) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${label}: invalid GLB magic.`);
  if (bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error(`${label}: invalid GLB version or declared byte length.`);
  }
  let offset = 12;
  let document = null;
  let binary = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error(`${label}: truncated GLB chunk header.`);
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) throw new Error(`${label}: GLB chunk exceeds file bounds.`);
    if (type === JSON_CHUNK) {
      if (document) throw new Error(`${label}: multiple JSON chunks.`);
      document = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/[\0 ]+$/u, ''));
    } else if (type === BIN_CHUNK) {
      if (binary) throw new Error(`${label}: multiple BIN chunks.`);
      binary = bytes.subarray(start, end);
    }
    offset = end;
  }
  if (!document || !binary) throw new Error(`${label}: expected embedded JSON and BIN chunks.`);
  if (document.extensionsRequired?.some((entry) => /draco|meshopt/i.test(entry))) {
    throw new Error(`${label}: compressed geometry is unsupported by the exact audit.`);
  }
  return { binary, document };
}

function readComponent(buffer, offset, componentType) {
  if (componentType === 5120) return buffer.readInt8(offset);
  if (componentType === 5121) return buffer.readUInt8(offset);
  if (componentType === 5122) return buffer.readInt16LE(offset);
  if (componentType === 5123) return buffer.readUInt16LE(offset);
  if (componentType === 5125) return buffer.readUInt32LE(offset);
  if (componentType === 5126) return buffer.readFloatLE(offset);
  throw new Error(`Unsupported glTF accessor component type: ${componentType}`);
}

function readAccessor(document, binary, accessorIndex) {
  const accessor = document.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing glTF accessor ${accessorIndex}.`);
  if (accessor.sparse) throw new Error(`Sparse glTF accessor ${accessorIndex} is unsupported by the exact audit.`);
  const view = document.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`Accessor ${accessorIndex} has no bufferView.`);
  const components = TYPE_COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  if (!components || !componentBytes) throw new Error(`Accessor ${accessorIndex} has unsupported encoding.`);
  const elementBytes = componentBytes * components;
  const stride = view.byteStride ?? elementBytes;
  if (stride < elementBytes) throw new Error(`Accessor ${accessorIndex} byte stride is too small.`);
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const last = start + Math.max(0, accessor.count - 1) * stride + elementBytes;
  if (last > binary.length) throw new Error(`Accessor ${accessorIndex} exceeds the embedded buffer.`);
  const values = accessor.componentType === 5126
    ? new Float32Array(accessor.count * components)
    : new Uint32Array(accessor.count * components);
  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      values[element * components + component] = readComponent(
        binary,
        start + element * stride + component * componentBytes,
        accessor.componentType,
      );
    }
  }
  return { accessor, components, values };
}

function multiplyMatrix(left, right) {
  const result = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) {
    let value = 0;
    for (let inner = 0; inner < 4; inner += 1) value += left[inner * 4 + row] * right[column * 4 + inner];
    result[column * 4 + row] = value;
  }
  return result;
}

function identityMatrix() {
  return Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return Float64Array.from(node.matrix);
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x; const y2 = y + y; const z2 = z + z;
  const xx = x * x2; const xy = x * y2; const xz = x * z2;
  const yy = y * y2; const yz = y * z2; const zz = z * z2;
  const wx = w * x2; const wy = w * y2; const wz = w * z2;
  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function transformPoint(matrix, x, y, z) {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const divisor = w || 1;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / divisor,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / divisor,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / divisor,
  ];
}

function extractTriangleMesh(glbBytes, label) {
  const { binary, document } = parseGlb(glbBytes, label);
  const scene = document.scenes?.[document.scene ?? 0];
  if (!scene) throw new Error(`${label}: GLB has no active scene.`);
  const chunks = [];
  const primitiveRecords = [];
  const activeStack = new Set();
  const walkNode = (nodeIndex, parentMatrix) => {
    if (activeStack.has(nodeIndex)) throw new Error(`${label}: cyclic node hierarchy.`);
    const node = document.nodes?.[nodeIndex];
    if (!node) throw new Error(`${label}: missing node ${nodeIndex}.`);
    activeStack.add(nodeIndex);
    const world = multiplyMatrix(parentMatrix, nodeMatrix(node));
    if (Number.isInteger(node.mesh)) {
      const sourceMesh = document.meshes?.[node.mesh];
      if (!sourceMesh) throw new Error(`${label}: missing mesh ${node.mesh}.`);
      for (const [primitiveIndex, primitive] of (sourceMesh.primitives ?? []).entries()) {
        if ((primitive.mode ?? 4) !== 4) throw new Error(`${label}: only TRIANGLES primitives are supported.`);
        if (!Number.isInteger(primitive.attributes?.POSITION)) throw new Error(`${label}: primitive has no POSITION.`);
        const position = readAccessor(document, binary, primitive.attributes.POSITION);
        if (position.components !== 3) throw new Error(`${label}: POSITION is not VEC3.`);
        const index = Number.isInteger(primitive.indices) ? readAccessor(document, binary, primitive.indices) : null;
        if (index && index.components !== 1) throw new Error(`${label}: indices are not SCALAR.`);
        const elementCount = index ? index.values.length : position.accessor.count;
        if (elementCount % 3 !== 0) throw new Error(`${label}: triangle index count is not divisible by three.`);
        const positions = new Float32Array(position.accessor.count * 3);
        for (let vertex = 0; vertex < position.accessor.count; vertex += 1) {
          const point = transformPoint(
            world,
            position.values[vertex * 3],
            position.values[vertex * 3 + 1],
            position.values[vertex * 3 + 2],
          );
          if (!point.every(Number.isFinite)) throw new Error(`${label}: non-finite transformed position.`);
          positions.set(point, vertex * 3);
        }
        const indices = new Uint32Array(elementCount);
        for (let item = 0; item < elementCount; item += 1) {
          const value = index ? index.values[item] : item;
          if (value >= position.accessor.count) throw new Error(`${label}: primitive index exceeds POSITION count.`);
          indices[item] = value;
        }
        chunks.push({ indices, positions });
        primitiveRecords.push({
          meshIndex: node.mesh,
          meshName: sourceMesh.name ?? null,
          nodeIndex,
          nodeName: node.name ?? null,
          primitiveIndex,
          triangles: elementCount / 3,
          vertices: position.accessor.count,
        });
      }
    }
    for (const child of node.children ?? []) walkNode(child, world);
    activeStack.delete(nodeIndex);
  };
  for (const nodeIndex of scene.nodes ?? []) walkNode(nodeIndex, identityMatrix());
  if (chunks.length === 0) throw new Error(`${label}: active scene contains no triangle primitives.`);
  const vertexCount = chunks.reduce((sum, chunk) => sum + chunk.positions.length / 3, 0);
  const indexCount = chunks.reduce((sum, chunk) => sum + chunk.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const chunk of chunks) {
    positions.set(chunk.positions, vertexOffset * 3);
    for (let index = 0; index < chunk.indices.length; index += 1) {
      indices[indexOffset + index] = chunk.indices[index] + vertexOffset;
    }
    vertexOffset += chunk.positions.length / 3;
    indexOffset += chunk.indices.length;
  }
  return {
    documentSummary: {
      meshes: document.meshes?.length ?? 0,
      nodes: document.nodes?.length ?? 0,
      materials: document.materials?.length ?? 0,
      textures: document.textures?.length ?? 0,
      images: document.images?.length ?? 0,
    },
    positions,
    indices,
    primitiveRecords,
  };
}

function weldExactPositions(mesh) {
  const keyToVertex = new Map();
  const remap = new Uint32Array(mesh.positions.length / 3);
  const values = [];
  for (let vertex = 0; vertex < remap.length; vertex += 1) {
    const x = mesh.positions[vertex * 3];
    const y = mesh.positions[vertex * 3 + 1];
    const z = mesh.positions[vertex * 3 + 2];
    const key = `${Object.is(x, -0) ? 0 : x},${Object.is(y, -0) ? 0 : y},${Object.is(z, -0) ? 0 : z}`;
    let weldedVertex = keyToVertex.get(key);
    if (weldedVertex === undefined) {
      weldedVertex = values.length / 3;
      keyToVertex.set(key, weldedVertex);
      values.push(x, y, z);
    }
    remap[vertex] = weldedVertex;
  }
  const indices = new Uint32Array(mesh.indices.length);
  let degenerateTriangles = 0;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = remap[mesh.indices[offset]];
    const b = remap[mesh.indices[offset + 1]];
    const c = remap[mesh.indices[offset + 2]];
    indices[offset] = a;
    indices[offset + 1] = b;
    indices[offset + 2] = c;
    if (a === b || b === c || c === a) degenerateTriangles += 1;
  }
  if (degenerateTriangles > 0) {
    throw new Error(`Exact-position welding exposed ${degenerateTriangles} degenerate triangles; refusing to audit.`);
  }
  return {
    positions: Float32Array.from(values),
    indices,
    rawVertices: remap.length,
    weldedVertices: values.length / 3,
    mergedVertices: remap.length - values.length / 3,
  };
}

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return { min, max, dimensions: max.map((value, axis) => value - min[axis]) };
}

function cross2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point[0]},${point[1]}`, point])).values()]
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (unique.length <= 2) return unique;
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross2(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross2(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function polygonArea(polygon) {
  let doubled = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = polygon[(index + 1) % polygon.length];
    doubled += polygon[index][0] * next[1] - polygon[index][1] * next[0];
  }
  return Math.abs(doubled) * 0.5;
}

function pointInsideConvex(polygon, point) {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const value = cross2(polygon[index], polygon[(index + 1) % polygon.length], point);
    if (Math.abs(value) <= 1e-10) continue;
    const nextSign = Math.sign(value);
    if (sign !== 0 && sign !== nextSign) return false;
    sign = nextSign;
  }
  return true;
}

function volumeProperties(positions, indices) {
  let volumeTimesSix = 0;
  const momentTimes24 = [0, 0, 0];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    const ax = positions[a]; const ay = positions[a + 1]; const az = positions[a + 2];
    const bx = positions[b]; const by = positions[b + 1]; const bz = positions[b + 2];
    const cx = positions[c]; const cy = positions[c + 1]; const cz = positions[c + 2];
    const signedSix = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    volumeTimesSix += signedSix;
    momentTimes24[0] += (ax + bx + cx) * signedSix;
    momentTimes24[1] += (ay + by + cy) * signedSix;
    momentTimes24[2] += (az + bz + cz) * signedSix;
  }
  const signedVolume = volumeTimesSix / 6;
  const centroid = Math.abs(volumeTimesSix) > 1e-15
    ? momentTimes24.map((value) => value / (4 * volumeTimesSix))
    : [null, null, null];
  return { centroid, signedVolume };
}

function supportAudit(positions, indices, bounds, upAxis, tolerance) {
  const upIndex = { X: 0, Y: 1, Z: 2 }[upAxis];
  const planeAxes = [0, 1, 2].filter((axis) => axis !== upIndex);
  const bottom = bounds.min[upIndex];
  const contacts = [];
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (positions[offset + upIndex] <= bottom + tolerance) {
      contacts.push([positions[offset + planeAxes[0]], positions[offset + planeAxes[1]]]);
    }
  }
  const hull = convexHull(contacts);
  const area = polygonArea(hull);
  const volume = volumeProperties(positions, indices);
  const projectedCentroid = [volume.centroid[planeAxes[0]], volume.centroid[planeAxes[1]]];
  const extent = [0, 1].map((axis) => {
    const values = hull.map((point) => point[axis]);
    return values.length ? Math.max(...values) - Math.min(...values) : 0;
  });
  return {
    upAxis: `+${upAxis}`,
    toleranceMetres: tolerance,
    bottomMetres: bottom,
    contactVertexCount: contacts.length,
    convexHullVertexCount: hull.length,
    convexHullAreaSquareMetres: area,
    footprintDimensionsMetres: extent,
    signedVolumeCubicMetres: volume.signedVolume,
    centreOfVolumeMetres: volume.centroid,
    centreProjectionInsideSupportHull: pointInsideConvex(hull, projectedCentroid),
    stable: contacts.length >= 3 && area > 0 && pointInsideConvex(hull, projectedCentroid),
  };
}

const options = parseArguments(process.argv.slice(2));
const [bytes, topologyBytes, scriptBytes] = await Promise.all([
  readFile(options.input),
  readFile(topologyModuleFile),
  readFile(scriptFile),
]);
const inputSha256 = sha256(bytes);
if (inputSha256 !== options.expectedSha256) {
  throw new Error(`Fail-closed GLB hash mismatch: ${inputSha256}`);
}

const rawMesh = extractTriangleMesh(bytes, repositoryPath(options.input));
const mesh = weldExactPositions(rawMesh);
const bounds = boundsOf(mesh.positions);
const selfIntersections = auditSelfIntersections(mesh, { maxExamples: 24 });
const support = supportAudit(
  mesh.positions,
  mesh.indices,
  bounds,
  options.upAxis,
  options.supportToleranceMetres,
);

const record = {
  schema: 'toonlab/rock-glb-self-intersection-and-support-audit',
  version: 2,
  method: {
    selfIntersectionModule: 'src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js#auditSelfIntersections',
    topologyModuleSha256: sha256(topologyBytes),
    auditScript: 'scripts/audit-rock-glb-self-intersections.mjs',
    auditScriptSha256: sha256(scriptBytes),
    accelerator: 'three-mesh-bvh MeshBVH',
    geometryReader: 'direct GLB 2.0 JSON/BIN reader; material and texture resources are not loaded',
    adjacencyPolicy: 'exact-position duplicate vertices are welded before auditing; triangle pairs sharing a welded vertex are excluded',
    weldPolicy: 'world-transformed Float32 positions with identical numeric XYZ values, treating signed zero as equal; no tolerance weld',
    exhaustive: true,
    nodeWorldTransformApplied: true,
  },
  input: {
    file: repositoryPath(options.input),
    bytes: bytes.length,
    sha256: inputSha256,
    document: rawMesh.documentSummary,
    primitives: rawMesh.primitiveRecords,
    rawVertices: mesh.rawVertices,
    weldedVertices: mesh.weldedVertices,
    exactPositionVerticesMerged: mesh.mergedVertices,
    triangles: mesh.indices.length / 3,
    boundsMetres: bounds,
  },
  selfIntersections: {
    pairs: selfIntersections.pairs,
    examples: selfIntersections.examples,
    pass: selfIntersections.pairs === 0,
  },
  support,
  pass: selfIntersections.pairs === 0 && support.stable && support.signedVolumeCubicMetres > 0,
};

await writeFile(options.output, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
