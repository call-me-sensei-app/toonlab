// Binary FBX 7.4 writer for static mesh scenes.
//
// three.js ships an FBX loader but no exporter, so this implements the
// binary container (node records, typed properties, zlib'd arrays, footer)
// plus the minimal document set every mainstream importer expects:
// header/global settings, Documents, Definitions, Model/Geometry/Material
// objects, and OO connections. Skin deformers and animation are out of
// scope — meshes export as static geometry in their current pose.
//
// Interop notes baked into the format below:
// - Binary object names are "Name\x00\x01Class" (ASCII shows "Class::Name").
// - FBX RotationOrder 0 (XYZ) corresponds to three.js Euler order 'ZYX',
//   mirroring FBXLoader's import mapping.
// - Arrays use encoding 1 (zlib) via CompressionStream when available.

import * as THREE from 'three';

const FBX_VERSION = 7400;
const FILE_ID_CREATION_TIME = '1970-01-01 10:00:00:000';

// ---------------------------------------------------------------------------
// Low-level growable little-endian writer with offset patching.

class BinWriter {
  constructor() {
    this.buffer = new ArrayBuffer(1 << 16);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
    this.length = 0;
  }

  ensure(extra) {
    if (this.length + extra <= this.buffer.byteLength) return;
    let size = this.buffer.byteLength * 2;
    while (size < this.length + extra) size *= 2;
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(this.bytes.subarray(0, this.length));
    this.buffer = next;
    this.view = new DataView(next);
    this.bytes = new Uint8Array(next);
  }

  u8(value) { this.ensure(1); this.view.setUint8(this.length, value); this.length += 1; }
  i16(value) { this.ensure(2); this.view.setInt16(this.length, value, true); this.length += 2; }
  u32(value) { this.ensure(4); this.view.setUint32(this.length, value, true); this.length += 4; }
  i32(value) { this.ensure(4); this.view.setInt32(this.length, value, true); this.length += 4; }
  i64(value) { this.ensure(8); this.view.setBigInt64(this.length, BigInt(value), true); this.length += 8; }
  f32(value) { this.ensure(4); this.view.setFloat32(this.length, value, true); this.length += 4; }
  f64(value) { this.ensure(8); this.view.setFloat64(this.length, value, true); this.length += 8; }

  raw(data) {
    this.ensure(data.length);
    this.bytes.set(data, this.length);
    this.length += data.length;
  }

  patchU32(offset, value) { this.view.setUint32(offset, value, true); }

  result() { return this.buffer.slice(0, this.length); }
}

const textEncoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Property constructors. A node's props array holds these tagged values.

export const P = {
  bool: (value) => ({ t: 'C', v: value ? 1 : 0 }),
  f64: (value) => ({ t: 'D', v: value }),
  f64Array: (value) => ({ t: 'd', v: Float64Array.from(value) }),
  i32: (value) => ({ t: 'I', v: value }),
  i32Array: (value) => ({ t: 'i', v: Int32Array.from(value) }),
  i64: (value) => ({ t: 'L', v: value }),
  rawBytes: (value) => ({ t: 'R', v: Uint8Array.from(value) }),
  string: (value) => ({ t: 'S', v: String(value) }),
};

function node(name, props = [], children = []) {
  return { children, name, props };
}

// zlib-deflates `bytes` when the platform can and it actually helps;
// otherwise the array is stored raw (encoding 0), which is equally valid.
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined' || bytes.length < 1024) return null;
  try {
    // 'deflate' produces an RFC1950 zlib stream — FBX array encoding 1.
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return compressed.length < bytes.length ? compressed : null;
  } catch {
    return null;
  }
}

async function writeArrayProp(writer, typeChar, typedArray, bytesPerElement) {
  writer.u8(typeChar.charCodeAt(0));
  writer.u32(typedArray.length);
  const raw = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const compressed = await deflate(raw);
  if (compressed) {
    writer.u32(1);
    writer.u32(compressed.length);
    writer.raw(compressed);
  } else {
    writer.u32(0);
    writer.u32(typedArray.byteLength);
    if (LITTLE_ENDIAN) {
      writer.raw(raw);
    } else {
      for (let i = 0; i < typedArray.length; i += 1) {
        if (bytesPerElement === 8) writer.f64(typedArray[i]);
        else if (typedArray instanceof Float32Array) writer.f32(typedArray[i]);
        else writer.i32(typedArray[i]);
      }
    }
  }
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

async function writeProp(writer, prop) {
  switch (prop.t) {
    case 'C': writer.u8(0x43); writer.u8(prop.v); break;
    case 'I': writer.u8(0x49); writer.i32(prop.v); break;
    case 'L': writer.u8(0x4c); writer.i64(prop.v); break;
    case 'D': writer.u8(0x44); writer.f64(prop.v); break;
    case 'S': {
      const encoded = textEncoder.encode(prop.v);
      writer.u8(0x53);
      writer.u32(encoded.length);
      writer.raw(encoded);
      break;
    }
    case 'R':
      writer.u8(0x52);
      writer.u32(prop.v.length);
      writer.raw(prop.v);
      break;
    case 'd': await writeArrayProp(writer, 'd', prop.v, 8); break;
    case 'i': await writeArrayProp(writer, 'i', prop.v, 4); break;
    default: throw new Error(`Unknown FBX property type "${prop.t}"`);
  }
}

// v7.4 node record: u32 endOffset, u32 numProps, u32 propListLen, u8 nameLen,
// name, props, children, then a 13-byte null record when the node has
// children (or is completely empty).
const NULL_RECORD_LENGTH = 13;

async function writeNode(writer, current) {
  const recordStart = writer.length;
  writer.u32(0); // endOffset, patched below
  writer.u32(current.props.length);
  writer.u32(0); // propertyListLen, patched below
  const nameBytes = textEncoder.encode(current.name);
  writer.u8(nameBytes.length);
  writer.raw(nameBytes);

  const propsStart = writer.length;
  for (const prop of current.props) await writeProp(writer, prop);
  writer.patchU32(recordStart + 8, writer.length - propsStart);

  for (const child of current.children) await writeNode(writer, child);
  if (current.children.length > 0 || current.props.length === 0) {
    for (let i = 0; i < NULL_RECORD_LENGTH; i += 1) writer.u8(0);
  }
  writer.patchU32(recordStart, writer.length);
}

// The 16-byte footer ids are the constants every third-party writer uses
// (originally sampled from official SDK output; importers do not verify).
const FOOTER_SOURCE_ID = [
  0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66,
  0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e,
];
const FOOTER_MAGIC = [
  0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e,
  0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b,
];

async function serializeDocument(rootNodes) {
  const writer = new BinWriter();
  writer.raw(textEncoder.encode('Kaydara FBX Binary  '));
  writer.u8(0x00);
  writer.u8(0x1a);
  writer.u8(0x00);
  writer.u32(FBX_VERSION);

  for (const rootNode of rootNodes) await writeNode(writer, rootNode);
  for (let i = 0; i < NULL_RECORD_LENGTH; i += 1) writer.u8(0);

  writer.raw(Uint8Array.from(FOOTER_SOURCE_ID));
  writer.raw(new Uint8Array(4));
  const misalignment = writer.length % 16;
  writer.raw(new Uint8Array(misalignment === 0 ? 16 : 16 - misalignment));
  writer.u32(FBX_VERSION);
  writer.raw(new Uint8Array(120));
  writer.raw(Uint8Array.from(FOOTER_MAGIC));
  return writer.result();
}

// ---------------------------------------------------------------------------
// Properties70 helpers.

function p70(name, type, label, flags, ...values) {
  return node('P', [
    P.string(name), P.string(type), P.string(label), P.string(flags),
    ...values,
  ]);
}

function objectName(name, className) {
  return `${name}\x00\x01${className}`;
}

// ---------------------------------------------------------------------------
// three.js scene graph → FBX object set.

function timestampNode() {
  const now = new Date();
  return node('CreationTimeStamp', [], [
    node('Version', [P.i32(1000)]),
    node('Year', [P.i32(now.getFullYear())]),
    node('Month', [P.i32(now.getMonth() + 1)]),
    node('Day', [P.i32(now.getDate())]),
    node('Hour', [P.i32(now.getHours())]),
    node('Minute', [P.i32(now.getMinutes())]),
    node('Second', [P.i32(now.getSeconds())]),
    node('Millisecond', [P.i32(now.getMilliseconds())]),
  ]);
}

function headerNodes(creator, documentUrl) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const creationTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}:`
    + `${String(now.getMilliseconds()).padStart(3, '0')}`;

  const sceneInfo = node('SceneInfo', [P.string(objectName('GlobalInfo', 'SceneInfo')), P.string('UserData')], [
    node('Type', [P.string('UserData')]),
    node('Version', [P.i32(100)]),
    node('MetaData', [], [
      node('Version', [P.i32(100)]),
      node('Title', [P.string('')]),
      node('Subject', [P.string('')]),
      node('Author', [P.string('')]),
      node('Keywords', [P.string('')]),
      node('Revision', [P.string('')]),
      node('Comment', [P.string('')]),
    ]),
    node('Properties70', [], [
      p70('DocumentUrl', 'KString', 'Url', '', P.string(documentUrl)),
      p70('SrcDocumentUrl', 'KString', 'Url', '', P.string(documentUrl)),
      p70('Original', 'Compound', '', ''),
      p70('Original|ApplicationVendor', 'KString', '', '', P.string('ToonLab')),
      p70('Original|ApplicationName', 'KString', '', '', P.string(creator)),
      p70('Original|ApplicationVersion', 'KString', '', '', P.string('1.0')),
      p70('Original|DateTime_GMT', 'DateTime', '', '', P.string(creationTime)),
      p70('Original|FileName', 'KString', '', '', P.string(documentUrl)),
      p70('LastSaved', 'Compound', '', ''),
      p70('LastSaved|ApplicationVendor', 'KString', '', '', P.string('ToonLab')),
      p70('LastSaved|ApplicationName', 'KString', '', '', P.string(creator)),
      p70('LastSaved|ApplicationVersion', 'KString', '', '', P.string('1.0')),
      p70('LastSaved|DateTime_GMT', 'DateTime', '', '', P.string(creationTime)),
    ]),
  ]);

  return [
    node('FBXHeaderExtension', [], [
      node('FBXHeaderVersion', [P.i32(1003)]),
      node('FBXVersion', [P.i32(FBX_VERSION)]),
      node('EncryptionType', [P.i32(0)]),
      timestampNode(),
      node('Creator', [P.string(creator)]),
      sceneInfo,
    ]),
    // FileId, this CreationTime and the footer id are one matched set: the
    // Autodesk FBX SDK (Unity, Maya, Max) checks them against each other and
    // rejects the file as corrupted if the time differs. Third-party writers
    // all use this fixed epoch; the real time lives in CreationTimeStamp.
    node('FileId', [P.rawBytes([
      0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2,
      0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1,
    ])]),
    node('CreationTime', [P.string(FILE_ID_CREATION_TIME)]),
    node('Creator', [P.string(creator)]),
  ];
}

function globalSettingsNode() {
  return node('GlobalSettings', [], [
    node('Version', [P.i32(1000)]),
    node('Properties70', [], [
      p70('UpAxis', 'int', 'Integer', '', P.i32(1)),
      p70('UpAxisSign', 'int', 'Integer', '', P.i32(1)),
      p70('FrontAxis', 'int', 'Integer', '', P.i32(2)),
      p70('FrontAxisSign', 'int', 'Integer', '', P.i32(1)),
      p70('CoordAxis', 'int', 'Integer', '', P.i32(0)),
      p70('CoordAxisSign', 'int', 'Integer', '', P.i32(1)),
      p70('OriginalUpAxis', 'int', 'Integer', '', P.i32(1)),
      p70('OriginalUpAxisSign', 'int', 'Integer', '', P.i32(1)),
      // Centimetres per unit. three.js scenes are in metres; 1 (the FBX
      // default, centimetres) made Unity and Blender import at 1/100 scale.
      // FBXLoader ignores this, so the lab's own round trip is unchanged.
      p70('UnitScaleFactor', 'double', 'Number', '', P.f64(100)),
      p70('OriginalUnitScaleFactor', 'double', 'Number', '', P.f64(100)),
      p70('AmbientColor', 'ColorRGB', 'Color', '', P.f64(0), P.f64(0), P.f64(0)),
      p70('DefaultCamera', 'KString', '', '', P.string('Producer Perspective')),
      p70('TimeMode', 'enum', '', '', P.i32(11)),
      p70('TimeSpanStart', 'KTime', 'Time', '', P.i64(0)),
      p70('TimeSpanStop', 'KTime', 'Time', '', P.i64(46186158000)),
      p70('CustomFrameRate', 'double', 'Number', '', P.f64(-1)),
    ]),
  ]);
}

// Deduplicates control points by exact position so downstream DCC tools see
// welded topology again; normals/UVs/colors stay per-polygon-vertex, so no
// shading data is lost by the weld.
function convertGeometry(mesh, geometryId) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  // FBXLoader imports UV sets as uv, uv1, uv2, … — export them all
  // (game meshes rely on the extra sets for lightmaps).
  const uvAttributes = [];
  for (let i = 0; i < 8; i += 1) {
    const attribute = geometry.getAttribute(i === 0 ? 'uv' : `uv${i}`);
    if (attribute) uvAttributes.push(attribute);
  }
  const index = geometry.getIndex();
  const polygonVertexCount = index ? index.count : position.count;
  const triangleCount = Math.floor(polygonVertexCount / 3);

  const controlPoints = [];
  const controlPointIndexByKey = new Map();
  const polygonVertexIndex = new Int32Array(polygonVertexCount);
  const normals = normal ? new Float64Array(polygonVertexCount * 3) : null;
  const uvSets = uvAttributes.map(() => new Float64Array(polygonVertexCount * 2));
  const colors = color ? new Float64Array(polygonVertexCount * 4) : null;

  for (let i = 0; i < polygonVertexCount; i += 1) {
    const vertexIndex = index ? index.getX(i) : i;
    const x = position.getX(vertexIndex);
    const y = position.getY(vertexIndex);
    const z = position.getZ(vertexIndex);
    const key = `${x}|${y}|${z}`;
    let controlPointIndex = controlPointIndexByKey.get(key);
    if (controlPointIndex === undefined) {
      controlPointIndex = controlPoints.length / 3;
      controlPointIndexByKey.set(key, controlPointIndex);
      controlPoints.push(x, y, z);
    }
    // The final index of each triangle is stored negated (~i) per FBX spec.
    polygonVertexIndex[i] = i % 3 === 2 ? ~controlPointIndex : controlPointIndex;

    if (normals) {
      normals[i * 3] = normal.getX(vertexIndex);
      normals[i * 3 + 1] = normal.getY(vertexIndex);
      normals[i * 3 + 2] = normal.getZ(vertexIndex);
    }
    for (let setIndex = 0; setIndex < uvAttributes.length; setIndex += 1) {
      uvSets[setIndex][i * 2] = uvAttributes[setIndex].getX(vertexIndex);
      uvSets[setIndex][i * 2 + 1] = uvAttributes[setIndex].getY(vertexIndex);
    }
    if (colors) {
      // Same linear→sRGB conversion as materials (FBXLoader imports vertex
      // colors through the color-management pipeline).
      _color.setRGB(color.getX(vertexIndex), color.getY(vertexIndex), color.getZ(vertexIndex))
        .convertLinearToSRGB();
      colors[i * 4] = _color.r;
      colors[i * 4 + 1] = _color.g;
      colors[i * 4 + 2] = _color.b;
      colors[i * 4 + 3] = color.itemSize > 3 ? color.getW(vertexIndex) : 1;
    }
  }

  const layerChildren = [
    node('LayerElement', [], [
      node('Type', [P.string('LayerElementNormal')]),
      node('TypedIndex', [P.i32(0)]),
    ]),
    node('LayerElement', [], [
      node('Type', [P.string('LayerElementMaterial')]),
      node('TypedIndex', [P.i32(0)]),
    ]),
  ];

  const children = [
    node('GeometryVersion', [P.i32(124)]),
    node('Vertices', [P.f64Array(controlPoints)]),
    node('PolygonVertexIndex', [{ t: 'i', v: polygonVertexIndex }]),
  ];

  if (normals) {
    children.push(node('LayerElementNormal', [P.i32(0)], [
      node('Version', [P.i32(101)]),
      node('Name', [P.string('')]),
      node('MappingInformationType', [P.string('ByPolygonVertex')]),
      node('ReferenceInformationType', [P.string('Direct')]),
      node('Normals', [{ t: 'd', v: normals }]),
    ]));
  }

  const extraLayers = [];
  uvSets.forEach((uvs, setIndex) => {
    const identity = new Int32Array(polygonVertexCount);
    for (let i = 0; i < polygonVertexCount; i += 1) identity[i] = i;
    children.push(node('LayerElementUV', [P.i32(setIndex)], [
      node('Version', [P.i32(101)]),
      node('Name', [P.string(`map${setIndex + 1}`)]),
      node('MappingInformationType', [P.string('ByPolygonVertex')]),
      node('ReferenceInformationType', [P.string('IndexToDirect')]),
      node('UV', [{ t: 'd', v: uvs }]),
      node('UVIndex', [{ t: 'i', v: identity }]),
    ]));
    const uvLayerElement = node('LayerElement', [], [
      node('Type', [P.string('LayerElementUV')]),
      node('TypedIndex', [P.i32(setIndex)]),
    ]);
    if (setIndex === 0) layerChildren.push(uvLayerElement);
    // Secondary UV sets get their own Layer node (the FBX convention DCC
    // importers expect for lightmap channels).
    else extraLayers.push(node('Layer', [P.i32(setIndex)], [
      node('Version', [P.i32(100)]),
      uvLayerElement,
    ]));
  });

  if (colors) {
    const identity = new Int32Array(polygonVertexCount);
    for (let i = 0; i < polygonVertexCount; i += 1) identity[i] = i;
    children.push(node('LayerElementColor', [P.i32(0)], [
      node('Version', [P.i32(101)]),
      node('Name', [P.string('col')]),
      node('MappingInformationType', [P.string('ByPolygonVertex')]),
      node('ReferenceInformationType', [P.string('IndexToDirect')]),
      node('Colors', [{ t: 'd', v: colors }]),
      node('ColorIndex', [{ t: 'i', v: identity }]),
    ]));
    layerChildren.push(node('LayerElement', [], [
      node('Type', [P.string('LayerElementColor')]),
      node('TypedIndex', [P.i32(0)]),
    ]));
  }

  // Per-triangle material indices from geometry.groups (multi-material
  // meshes); a single-material mesh collapses to the cheaper AllSame form.
  const materialCount = Array.isArray(mesh.material) ? mesh.material.length : 1;
  let materialLayer;
  if (materialCount > 1 && geometry.groups.length > 0) {
    const perTriangle = new Int32Array(triangleCount);
    for (const group of geometry.groups) {
      const start = Math.floor(group.start / 3);
      const end = Math.min(triangleCount, Math.floor((group.start + group.count) / 3));
      for (let t = start; t < end; t += 1) {
        perTriangle[t] = Math.min(group.materialIndex ?? 0, materialCount - 1);
      }
    }
    materialLayer = node('LayerElementMaterial', [P.i32(0)], [
      node('Version', [P.i32(101)]),
      node('Name', [P.string('')]),
      node('MappingInformationType', [P.string('ByPolygon')]),
      node('ReferenceInformationType', [P.string('IndexToDirect')]),
      node('Materials', [{ t: 'i', v: perTriangle }]),
    ]);
  } else {
    materialLayer = node('LayerElementMaterial', [P.i32(0)], [
      node('Version', [P.i32(101)]),
      node('Name', [P.string('')]),
      node('MappingInformationType', [P.string('AllSame')]),
      node('ReferenceInformationType', [P.string('IndexToDirect')]),
      node('Materials', [P.i32Array([0])]),
    ]);
  }
  children.push(materialLayer);

  children.push(node('Layer', [P.i32(0)], [
    node('Version', [P.i32(100)]),
    ...layerChildren,
  ]));
  children.push(...extraLayers);

  return node('Geometry', [
    P.i64(geometryId),
    P.string(objectName(`${mesh.name || 'Mesh'}Geometry`, 'Geometry')),
    P.string('Mesh'),
  ], children);
}

function materialNode(material, materialId) {
  // FBX stores sRGB colors; three's working space is linear (FBXLoader
  // converts on import, so export must convert back or colors darken on
  // every round trip).
  const toColor = (value, fallback) => {
    const color = value instanceof THREE.Color ? value : fallback;
    const srgb = new THREE.Color().copy(color).convertLinearToSRGB();
    return [srgb.r, srgb.g, srgb.b];
  };
  const white = new THREE.Color(1, 1, 1);
  const black = new THREE.Color(0, 0, 0);
  const diffuse = toColor(material.color, white);
  const emissive = toColor(material.emissive, black);
  const specular = toColor(material.specular, black);
  // MeshStandardMaterial has roughness instead of shininess.
  const shininess = typeof material.shininess === 'number'
    ? material.shininess
    : (1 - (material.roughness ?? 0.8)) * 100;

  return node('Material', [
    P.i64(materialId),
    P.string(objectName(material.name || 'Material', 'Material')),
    P.string(''),
  ], [
    node('Version', [P.i32(102)]),
    node('ShadingModel', [P.string('phong')]),
    node('MultiLayer', [P.i32(0)]),
    node('Properties70', [], [
      p70('DiffuseColor', 'Color', '', 'A', P.f64(diffuse[0]), P.f64(diffuse[1]), P.f64(diffuse[2])),
      p70('AmbientColor', 'Color', '', 'A', P.f64(0), P.f64(0), P.f64(0)),
      p70('EmissiveColor', 'Color', '', 'A', P.f64(emissive[0]), P.f64(emissive[1]), P.f64(emissive[2])),
      p70('EmissiveFactor', 'Number', '', 'A', P.f64(1)),
      p70('SpecularColor', 'Color', '', 'A', P.f64(specular[0]), P.f64(specular[1]), P.f64(specular[2])),
      p70('Shininess', 'double', 'Number', '', P.f64(Math.max(0, shininess))),
      p70('ShininessExponent', 'Number', '', 'A', P.f64(Math.max(0, shininess))),
      p70('Opacity', 'double', 'Number', '', P.f64(material.opacity ?? 1)),
    ]),
  ]);
}

const _euler = new THREE.Euler();
const _color = new THREE.Color();

function modelNode(object, modelId, className) {
  // FBX RotationOrder 0 (XYZ) == three.js 'ZYX' — FBXLoader's own mapping.
  _euler.setFromQuaternion(object.quaternion, 'ZYX');
  const degrees = THREE.MathUtils.radToDeg;

  return node('Model', [
    P.i64(modelId),
    P.string(objectName(object.name || className, 'Model')),
    P.string(className),
  ], [
    node('Version', [P.i32(232)]),
    node('Properties70', [], [
      p70('InheritType', 'enum', '', '', P.i32(1)),
      p70('DefaultAttributeIndex', 'int', 'Integer', '', P.i32(0)),
      p70('Lcl Translation', 'Lcl Translation', '', 'A',
        P.f64(object.position.x), P.f64(object.position.y), P.f64(object.position.z)),
      p70('Lcl Rotation', 'Lcl Rotation', '', 'A',
        P.f64(degrees(_euler.x)), P.f64(degrees(_euler.y)), P.f64(degrees(_euler.z))),
      p70('Lcl Scaling', 'Lcl Scaling', '', 'A',
        P.f64(object.scale.x), P.f64(object.scale.y), P.f64(object.scale.z)),
      p70('Visibility', 'Visibility', '', 'A', P.f64(object.visible ? 1 : 0)),
    ]),
    node('Shading', [P.bool(true)]),
    node('Culling', [P.string('CullingOff')]),
  ]);
}

function isExportableMesh(object) {
  return (object.isMesh || object.isSkinnedMesh) && object.geometry?.getAttribute('position');
}

/**
 * Serializes the children of `root` to a binary FBX 7.4 ArrayBuffer.
 * Skips cameras/lights/points/lines (counted in `result.skipped`); groups
 * and bones become Null models so hierarchy survives.
 */
export async function exportSceneToFBX(root, { creator = 'ToonLab FBX Editor', fileName = 'scene.fbx' } = {}) {
  let nextId = 100000000;
  const objectNodes = [];
  const connections = [];
  const materialIdByMaterial = new Map();
  let modelCount = 0;
  let geometryCount = 0;
  let skipped = 0;

  const connect = (childId, parentId) => {
    connections.push(node('C', [P.string('OO'), P.i64(childId), P.i64(parentId)]));
  };

  const visit = (object, parentModelId) => {
    if (object.isCamera || object.isLight || object.isPoints || object.isLine) {
      skipped += 1;
      return;
    }
    const modelId = nextId += 1;
    modelCount += 1;

    if (isExportableMesh(object)) {
      objectNodes.push(modelNode(object, modelId, 'Mesh'));
      const geometryId = nextId += 1;
      geometryCount += 1;
      objectNodes.push(convertGeometry(object, geometryId));
      connect(geometryId, modelId);

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        let materialId = materialIdByMaterial.get(material);
        if (materialId === undefined) {
          materialId = nextId += 1;
          materialIdByMaterial.set(material, materialId);
          objectNodes.push(materialNode(material, materialId));
        }
        connect(materialId, modelId);
      }
    } else {
      objectNodes.push(modelNode(object, modelId, 'Null'));
    }

    connect(modelId, parentModelId);
    for (const child of object.children) visit(child, modelId);
  };

  for (const child of root.children) visit(child, 0);

  const documentId = nextId += 1;
  const rootNodes = [
    ...headerNodes(creator, `/${fileName}`),
    globalSettingsNode(),
    node('Documents', [], [
      node('Count', [P.i32(1)]),
      node('Document', [P.i64(documentId), P.string(''), P.string('Scene')], [
        node('Properties70', [], [
          p70('SourceObject', 'object', '', ''),
          p70('ActiveAnimStackName', 'KString', '', '', P.string('')),
        ]),
        node('RootNode', [P.i64(0)]),
      ]),
    ]),
    node('References', []),
    node('Definitions', [], [
      node('Version', [P.i32(100)]),
      node('Count', [P.i32(1 + modelCount + geometryCount + materialIdByMaterial.size)]),
      node('ObjectType', [P.string('GlobalSettings')], [node('Count', [P.i32(1)])]),
      node('ObjectType', [P.string('Model')], [node('Count', [P.i32(modelCount)])]),
      node('ObjectType', [P.string('Geometry')], [node('Count', [P.i32(geometryCount)])]),
      node('ObjectType', [P.string('Material')], [node('Count', [P.i32(materialIdByMaterial.size)])]),
    ]),
    node('Objects', [], objectNodes),
    node('Connections', [], connections),
    node('Takes', [], [node('Current', [P.string('')])]),
  ];

  const buffer = await serializeDocument(rootNodes);
  return {
    buffer,
    geometryCount,
    materialCount: materialIdByMaterial.size,
    modelCount,
    skipped,
  };
}
