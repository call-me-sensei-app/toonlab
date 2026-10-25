// Verifies precomputed automatic roles (src/toon/autoRolesData.js) without a
// GPU: a generated chibi's roles exported offline and applied with
// `autoRoles: { mode: 'precomputed', data }` match the live analysis exactly
// (weights, role mask, head frame, alpha decisions, report); precomputed mode
// reads no texture pixel; a GPU-compressed (KTX2/Basis) base colour and role
// mask convert; a record for another model is refused; and the
// `toonlab auto-roles` CLI writes a record from a GLB that applies the same.
//
//   node scripts/verify-precomputed-auto-roles.mjs
//
// Set TOONLAB_AUTO_ROLES_GLB to a comma-separated list of GLB paths to also
// check real generated characters (CLI export vs live analysis, timed).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import * as THREE from 'three';

import { AUTO_ROLE_ATTRIBUTE } from '../src/toon/autoRoles.js';
import { loadGlbForAutoRoles } from '../src/toon/autoRolesGlb.node.js';
import { withoutTexturePixelReads } from '../src/toon/texturePixels.js';
import {
  applyToonShader,
  downsampleRoleMask,
  exportAutoRoles,
  parseAutoRoles,
  serializeAutoRoles,
} from '../src/toon/toonMaterialAdapter.js';

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write(`  ok  ${name}\n`);
}

// ---------------------------------------------------------------- the chibi
// A generated-style chibi: one skinned mesh, one atlased material named like
// a generator's ("Material_0"), a big low-poly head (so the per-texel role
// mask is baked) and a hand-painted atlas: skin face with eyes and mouth,
// dark hair over the crown and back, cloth body, legs in dark stockings
// (skinned to LeftLeg/RightLeg, so stocking detection runs). Two eye-white
// meshes (named "EyeWhite", so the lid-shade bake runs) sit on the face.

const ATLAS = 256;
const HEAD = { radius: 0.22, y: 0.98 };
const NECK_Y = 0.74;
const SKIN = [242, 204, 186];
const HAIR = [58, 44, 66];
const CLOTH = [70, 92, 150];
const INK = [36, 30, 40];
const STOCKING = [34, 32, 40];
const LEG_TOP = 0.3;
const LEG_X = 0.08;

// UV rectangles of the atlas: [u0, v0, u1, v1].
const REGIONS = { body: [0, 0, 0.5, 1], head: [0.5, 0.25, 1, 1], legs: [0.75, 0, 1, 0.25], neck: [0.5, 0, 0.75, 0.25] };

function remapUvs(geometry, [u0, v0, u1, v1]) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geometry;
}

// The colour of a point on the head sphere from its SphereGeometry UV
// (x = -cos(2πu) sin(θ), y = cos(θ), z = sin(2πu) sin(θ), θ = π(1 - v)).
function headColor(u, v) {
  const phi = u * Math.PI * 2;
  const theta = Math.PI * (1 - v);
  const x = -Math.cos(phi) * Math.sin(theta);
  const y = Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  if (y > 0.42 || z < 0.15) return HAIR;
  if (z > 0.6 && Math.hypot((Math.abs(x) - 0.32) / 0.12, (y - 0.02) / 0.16) < 1) return INK;
  if (z > 0.8 && Math.hypot(x / 0.12, (y + 0.45) / 0.04) < 1) return INK;
  return SKIN;
}

function paintAtlas() {
  const data = new Uint8Array(ATLAS * ATLAS * 4);
  for (let y = 0; y < ATLAS; y += 1) {
    for (let x = 0; x < ATLAS; x += 1) {
      const u = (x + 0.5) / ATLAS;
      const v = (y + 0.5) / ATLAS;
      let rgb = CLOTH;
      if (u >= REGIONS.head[0] && v >= REGIONS.head[1]) rgb = headColor((u - 0.5) / 0.5, (v - 0.25) / 0.75);
      else if (u >= REGIONS.legs[0]) rgb = STOCKING;
      else if (u >= REGIONS.neck[0]) rgb = SKIN;
      data.set([...rgb, 255], (y * ATLAS + x) * 4);
    }
  }
  return data;
}

const ATLAS_TEXELS = paintAtlas();

function chibiGeometry() {
  const body = remapUvs(new THREE.CylinderGeometry(0.2, 0.17, 0.7 - LEG_TOP, 20, 6).translate(0, (0.7 + LEG_TOP) / 2, 0), REGIONS.body);
  const neck = remapUvs(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12, 2).translate(0, NECK_Y, 0), REGIONS.neck);
  const head = remapUvs(new THREE.SphereGeometry(HEAD.radius, 18, 14).translate(0, HEAD.y, 0), REGIONS.head);
  const legs = [-LEG_X, LEG_X].map((x) => remapUvs(new THREE.CylinderGeometry(0.05, 0.045, LEG_TOP, 10, 8).translate(x, LEG_TOP / 2, 0), REGIONS.legs));
  const parts = [body, neck, head, ...legs].map((geometry) => geometry.toNonIndexed());
  const count = parts.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const merged = { normal: new Float32Array(count * 3), position: new Float32Array(count * 3), uv: new Float32Array(count * 2) };
  let offset = 0;
  for (const geometry of parts) {
    merged.position.set(geometry.attributes.position.array, offset * 3);
    merged.normal.set(geometry.attributes.normal.array, offset * 3);
    merged.uv.set(geometry.attributes.uv.array, offset * 2);
    offset += geometry.attributes.position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(merged.uv, 2));
  return geometry;
}

function atlasTexture() {
  const texture = new THREE.DataTexture(new Uint8Array(ATLAS_TEXELS), ATLAS, ATLAS, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

// An ASTC 4×4 CompressedTexture of the atlas's size, as KTX2Loader returns
// on an iPhone: its texels exist only as GPU blocks.
function compressedAtlasTexture() {
  const blocks = new Uint8Array((ATLAS / 4) * (ATLAS / 4) * 16);
  const texture = new THREE.CompressedTexture([{ data: blocks, height: ATLAS, width: ATLAS }], ATLAS, ATLAS, THREE.RGBA_ASTC_4x4_Format);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function eyeWhite(x) {
  const geometry = new THREE.SphereGeometry(0.035, 10, 8).scale(1, 0.7, 0.4).translate(x, HEAD.y + 0.005, HEAD.radius * 0.93);
  const texture = new THREE.DataTexture(new Uint8Array([250, 250, 252, 255]), 1, 1);
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture, name: 'EyeWhite' }));
  mesh.name = x < 0 ? 'eye_white_r' : 'eye_white_l';
  return mesh;
}

function buildChibi({ map = atlasTexture() } = {}) {
  const geometry = chibiGeometry();
  const bone = (name, x, y, parent) => {
    const node = new THREE.Bone();
    node.name = name;
    node.position.set(x, y, 0);
    parent?.add(node);
    return node;
  };
  const hips = bone('Hips', 0, LEG_TOP + 0.05);
  const neck = bone('Neck', 0, NECK_Y - 0.04 - (LEG_TOP + 0.05), hips);
  const head = bone('Head', 0, 0.1, neck);
  const legBones = [-LEG_X, LEG_X].map((x) => {
    const leg = bone(x < 0 ? 'RightLeg' : 'LeftLeg', x, -0.05, hips);
    bone(x < 0 ? 'RightFoot' : 'LeftFoot', 0, -LEG_TOP + 0.01, leg);
    return leg;
  });
  const bones = [hips, neck, head, ...legBones, ...legBones.map((leg) => leg.children[0])];
  const position = geometry.attributes.position;
  const skinIndex = new Uint16Array(position.count * 4);
  const skinWeight = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    let index = 0;
    if (y > NECK_Y + 0.02) index = 2;
    else if (y > NECK_Y - 0.06) index = 1;
    else if (y < LEG_TOP - 1e-4) index = position.getX(i) < 0 ? 3 : 4;
    skinIndex[i * 4] = index;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const material = new THREE.MeshStandardMaterial({ map, name: 'Material_0' });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'chibi_body';
  const root = new THREE.Group();
  root.add(hips, mesh, eyeWhite(-0.085), eyeWhite(0.085));
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return { mesh, root };
}

const TOON_OPTIONS = { autoRoles: { mode: 'auto' }, preset: 'call_me_sensei', shaderMode: 'anime' };

function roleMaskOf(mesh) {
  return mesh.geometry.userData.toonAutoRoleMask;
}

// The record as a runtime loads it: JSON text plus the masks it names.
function roundTrip(record, options = {}) {
  const { json, masks } = serializeAutoRoles(record, options);
  return parseAutoRoles(json, { masks: Object.fromEntries(masks.map((mask) => [mask.uri, { data: mask.data, height: mask.height, width: mask.width }])) });
}

function reportCodes(result) {
  return result.report.map((entry) => `${entry.level}:${entry.code}`).sort();
}

function withoutSource(result) {
  const { source, ...rest } = result;
  return rest;
}

function assertSameRoles(live, precomputed) {
  assert.deepEqual(precomputed.mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE].array, live.mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE].array, 'per-vertex role weights');
  assert.equal(precomputed.mesh.geometry.userData.toonRoleWeightsHasHair, live.mesh.geometry.userData.toonRoleWeightsHasHair);
  assert.deepEqual(precomputed.root.userData.toonHeadEstimate, live.root.userData.toonHeadEstimate, 'head frame');
  assert.deepEqual(precomputed.root.userData.toonForward, live.root.userData.toonForward, 'rest forward');
}

// ---------------------------------------------------------------- live vs precomputed

const live = buildChibi();
const liveResult = applyToonShader(live.root, TOON_OPTIONS);

await check('the generated chibi gets automatic roles and a baked role mask live', () => {
  assert.equal(liveResult.autoRoles?.applied, true, liveResult.autoRoles?.reason);
  assert.equal(liveResult.autoRoles.method, 'skin-weights');
  assert.equal(liveResult.autoRoles.maskedMeshes, 1, 'the low-poly head bakes a per-texel mask');
  assert.ok(liveResult.autoRoles.counts.face > 20 && liveResult.autoRoles.counts.hair > 20, JSON.stringify(liveResult.autoRoles.counts));
});

const exported = buildChibi();
const { conversion: exportConversion, record } = exportAutoRoles(exported.root, TOON_OPTIONS);

await check('exportAutoRoles records exactly what the live analysis produces', () => {
  assert.deepEqual(exportConversion.autoRoles, liveResult.autoRoles);
  assert.equal(record.meshes.length, 1);
  assert.deepEqual(record.meshes[0].roleWeights, live.mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE].array);
  assert.deepEqual(record.meshes[0].mask.data, roleMaskOf(live.mesh).image.data);
  assert.deepEqual(Object.keys(record.evidence.alphaCoverage).sort(), ['0:0', '1:0', '2:0'], 'the alpha coverage of every textured slot is recorded');
});

const precomputed = buildChibi();
const precomputedResult = applyToonShader(precomputed.root, { ...TOON_OPTIONS, autoRoles: { data: roundTrip(record), mode: 'precomputed' } });

await check('precomputed and live produce the same role mask, weights and head frame', () => {
  assertSameRoles(live, precomputed);
  const liveMask = roleMaskOf(live.mesh);
  const mask = roleMaskOf(precomputed.mesh);
  assert.equal(mask.image.width, liveMask.image.width);
  assert.deepEqual(mask.image.data, liveMask.image.data, 'role mask texels');
  assert.equal(mask.colorSpace, THREE.NoColorSpace);
  assert.equal(mask.flipY, false);
});

await check('precomputed conversion makes the same materials and report as live', () => {
  const liveFeatures = live.mesh.material.userData.toonFeatures;
  const features = precomputed.mesh.material.userData.toonFeatures;
  assert.equal(features.roleWeights, 'mask');
  assert.equal(features.roleWeights, liveFeatures.roleWeights);
  assert.equal(features.roleMaskMap, roleMaskOf(precomputed.mesh), 'the shader samples the precomputed mask');
  assert.equal(precomputed.mesh.material.transparent, live.mesh.material.transparent, 'alpha decision from the recorded coverage');
  assert.equal(precomputed.mesh.material.alphaTest, live.mesh.material.alphaTest);
  assert.equal(precomputed.mesh.material.userData.alphaCoverage, live.mesh.material.userData.alphaCoverage);
  assert.deepEqual(withoutSource(precomputedResult.autoRoles), liveResult.autoRoles);
  assert.equal(precomputedResult.autoRoles.source, 'precomputed');
  assert.deepEqual(reportCodes(precomputedResult), reportCodes(liveResult));
});

await check('colour-dependent bakes (nose line, eye-white lid, stockings) decide the same from the record', () => {
  assert.equal(typeof record.evidence.noseDrawn.model, 'boolean', 'the nose decision is recorded');
  assert.ok(Object.keys(record.evidence.vertexTexels).length >= 2, 'texels for the eye whites and the stocking slot are recorded');
  assert.equal(live.mesh.material.userData.toonFeatures.bake.detail, 'sheer', 'the dark stockings are detected live');
  assert.equal(precomputed.mesh.material.userData.toonFeatures.bake.detail, 'sheer');
  assert.deepEqual(precomputed.mesh.geometry.attributes.toonBake.array, live.mesh.geometry.attributes.toonBake.array, 'face UVs, occlusion and the sheer weight');
  assert.deepEqual(precomputed.mesh.geometry.userData.toonNoseMark, live.mesh.geometry.userData.toonNoseMark === null ? null : {
    ...live.mesh.geometry.userData.toonNoseMark,
    evidence: precomputed.mesh.geometry.userData.toonNoseMark.evidence,
  });
  const eyes = (chibi) => chibi.root.children.filter((child) => child.name.startsWith('eye_white'));
  eyes(live).forEach((eye, index) => {
    const twin = eyes(precomputed)[index];
    assert.ok(eye.material.userData.toonFeatures.bake.detail === 'lid', 'the lid shade is baked live');
    assert.equal(twin.material.userData.toonFeatures.bake.detail, eye.material.userData.toonFeatures.bake.detail);
    assert.deepEqual(twin.geometry.attributes.toonBake.array, eye.geometry.attributes.toonBake.array);
  });
});

await check('precomputed mode reads no texture pixel; live mode reads them back', () => {
  // Browser-style images: readTexturePixels draws them into an OffscreenCanvas
  // and calls getImageData, counted here.
  let readbacks = 0;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return {
        drawImage() {},
        getImageData: (x, y, width, height) => {
          readbacks += 1;
          assert.equal(width, ATLAS);
          return { data: new Uint8ClampedArray(ATLAS_TEXELS), height, width };
        },
      };
    }
  };
  const imageTexture = () => {
    const texture = new THREE.Texture({ height: ATLAS, width: ATLAS });
    texture.flipY = false;
    return texture;
  };
  try {
    const liveImage = buildChibi({ map: imageTexture() });
    const liveImageResult = applyToonShader(liveImage.root, TOON_OPTIONS);
    assert.ok(readbacks > 0, 'the live analysis reads the base colour back');
    assert.equal(liveImageResult.autoRoles.applied, true);
    readbacks = 0;
    const offline = buildChibi({ map: imageTexture() });
    const { record: imageRecord } = exportAutoRoles(offline.root, TOON_OPTIONS);
    readbacks = 0;
    const runtime = buildChibi({ map: imageTexture() });
    const result = applyToonShader(runtime.root, { ...TOON_OPTIONS, autoRoles: { data: roundTrip(imageRecord), mode: 'precomputed' } });
    assert.equal(readbacks, 0, 'precomputed mode never reads the base colour back');
    assert.equal(result.autoRoles.applied, true);
    const { blockedReads } = withoutTexturePixelReads(() => applyToonShader(buildChibi({ map: imageTexture() }).root, TOON_OPTIONS));
    assert.ok(blockedReads > 0 && readbacks === 0, 'every pixel read in the toon path goes through the gate');
    assertSameRoles(liveImage, runtime);
  } finally {
    delete globalThis.OffscreenCanvas;
  }
});

await check('a KTX2 / Basis (CompressedTexture) base colour converts in precomputed mode', () => {
  const ktx2 = buildChibi({ map: compressedAtlasTexture() });
  const result = applyToonShader(ktx2.root, { ...TOON_OPTIONS, autoRoles: { data: roundTrip(record), mode: 'precomputed' } });
  assert.equal(result.autoRoles.applied, true);
  assertSameRoles(live, ktx2);
  assert.deepEqual(roleMaskOf(ktx2.mesh).image.data, roleMaskOf(live.mesh).image.data, 'same role mask as the uncompressed live analysis');
  const features = ktx2.mesh.material.userData.toonFeatures;
  assert.equal(features.baseMap, ktx2.mesh.material.map ?? features.baseMap);
  assert.ok(features.baseMap?.isCompressedTexture, 'the compressed map is the shader base colour');
  assert.ok(!result.report.some((entry) => entry.code === 'texture-unavailable'), 'a compressed map is a usable texture');
});

await check('a compressed role mask and the face-map bake work without CPU texels', () => {
  const maskRecord = roundTrip(record);
  const { width, height } = maskRecord.meshes[0].mask;
  const compressedMask = new THREE.CompressedTexture([{ data: new Uint8Array((width / 4) * (height / 4) * 16), height, width }], width, height, THREE.RGBA_ASTC_4x4_Format);
  maskRecord.meshes[0].mask = compressedMask;
  const chibi = buildChibi({ map: compressedAtlasTexture() });
  const result = applyToonShader(chibi.root, {
    ...TOON_OPTIONS,
    autoRoles: { data: maskRecord, mode: 'precomputed' },
    face: { enabled: true, map: { auto: true } },
  });
  assert.equal(result.autoRoles.applied, true);
  assert.equal(chibi.mesh.material.userData.toonFeatures.roleMaskMap, compressedMask);
  assert.equal(compressedMask.colorSpace, THREE.NoColorSpace);
  assert.ok(result.report.some((entry) => entry.code === 'face-shadow-map-baked'), 'the face map bakes from the vertex weights');
});

await check('the live analysis on a compressed base colour finds no evidence (why precomputed exists)', () => {
  const chibi = buildChibi({ map: compressedAtlasTexture() });
  const result = applyToonShader(chibi.root, TOON_OPTIONS);
  assert.equal(result.autoRoles.applied, false);
  assert.ok(result.report.some((entry) => entry.code === 'auto-roles-skipped'));
});

await check('a record for another model is refused and nothing is applied', () => {
  const other = buildChibi();
  const trimmed = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(other.mesh.geometry.attributes)) {
    trimmed.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(0, attribute.itemSize * 600), attribute.itemSize));
  }
  other.mesh.geometry = trimmed;
  const result = applyToonShader(other.root, { ...TOON_OPTIONS, autoRoles: { data: roundTrip(record), mode: 'precomputed' } });
  assert.equal(result.autoRoles.applied, false);
  assert.equal(result.autoRoles.reason, 'precomputed-mismatch');
  assert.ok(result.report.some((entry) => entry.code === 'auto-roles-precomputed-mismatch'));
  assert.equal(other.mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE], undefined);
  // A model whose materials name a face runs no automatic roles; the record's
  // texture evidence is refused all the same.
  const named = buildChibi();
  named.mesh.material.name = 'Face';
  const trimmedNamed = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(named.mesh.geometry.attributes)) {
    trimmedNamed.setAttribute(name, new THREE.BufferAttribute(attribute.array.slice(0, attribute.itemSize * 600), attribute.itemSize));
  }
  named.mesh.geometry = trimmedNamed;
  const namedResult = applyToonShader(named.root, { ...TOON_OPTIONS, autoRoles: { data: roundTrip(record), mode: 'precomputed' } });
  assert.equal(namedResult.autoRoles, null);
  assert.ok(namedResult.report.some((entry) => entry.code === 'auto-roles-precomputed-mismatch'));
});

await check('precomputed mode without data and with different inputs warns', () => {
  const missing = buildChibi();
  const missingResult = applyToonShader(missing.root, { ...TOON_OPTIONS, autoRoles: { mode: 'precomputed' } });
  assert.ok(missingResult.report.some((entry) => entry.code === 'auto-roles-precomputed-missing'));
  assert.equal(missing.mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE], undefined);
  const differing = buildChibi();
  const result = applyToonShader(differing.root, { ...TOON_OPTIONS, autoRoles: { data: roundTrip(record), mode: 'precomputed', skinTolerance: 0.1 } });
  const warning = result.report.find((entry) => entry.code === 'auto-roles-precomputed-inputs-differ');
  assert.deepEqual(warning?.detail.inputs, ['skinTolerance']);
});

await check('serialised records are JSON with base64 weights; masks downsample by box filter', () => {
  const { json, masks } = serializeAutoRoles(record, { maskSize: 512 });
  const document = JSON.parse(json);
  assert.equal(document.format, 'toonlab.auto-roles');
  assert.equal(typeof document.meshes[0].roleWeights, 'string');
  assert.deepEqual(document.meshes[0].mask, { height: 512, uri: 'role-mask-0.png', width: 512 });
  assert.equal(masks[0].width, 512);
  assert.deepEqual(masks[0].data, downsampleRoleMask(record.meshes[0].mask, 512).data);
  // A partition stays a partition up to rounding.
  for (let i = 0; i < masks[0].data.length; i += 4) {
    assert.ok(masks[0].data[i] + masks[0].data[i + 1] + masks[0].data[i + 2] <= 257);
  }
});

// ---------------------------------------------------------------- CLI on a GLB

// A minimal binary glTF of the chibi (unrigged: the silhouette analysis) with
// its atlas embedded as PNG.
async function writeChibiGlb(path) {
  const geometry = chibiGeometry();
  const png = await sharp(Buffer.from(ATLAS_TEXELS), { raw: { channels: 4, height: ATLAS, width: ATLAS } }).png().toBuffer();
  const views = [geometry.attributes.position.array, geometry.attributes.normal.array, geometry.attributes.uv.array].map((array) => Buffer.from(array.buffer));
  const chunks = [...views, png];
  const padded = chunks.map((chunk) => Buffer.concat([chunk, Buffer.alloc((4 - (chunk.length % 4)) % 4)]));
  let offset = 0;
  const bufferViews = padded.map((chunk, index) => {
    const view = { buffer: 0, byteLength: chunks[index].length, byteOffset: offset };
    offset += chunk.length;
    return view;
  });
  const count = geometry.attributes.position.count;
  const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  const json = {
    accessors: [
      { bufferView: 0, componentType: 5126, count, max: box.max.toArray(), min: box.min.toArray(), type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count, type: 'VEC2' },
    ],
    asset: { version: '2.0' },
    bufferViews,
    buffers: [{ byteLength: offset }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    materials: [{ name: 'Material_0', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 } }],
    meshes: [{ name: 'chibi_body', primitives: [{ attributes: { NORMAL: 1, POSITION: 0, TEXCOORD_0: 2 }, material: 0 }] }],
    nodes: [{ mesh: 0, name: 'chibi_body' }],
    scene: 0,
    scenes: [{ nodes: [0] }],
    textures: [{ source: 0 }],
  };
  const jsonChunk = Buffer.from(JSON.stringify(json));
  const jsonPadded = Buffer.concat([jsonChunk, Buffer.alloc((4 - (jsonChunk.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(padded);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + bin.length, 8);
  const chunkHeader = (length, type) => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(length, 0);
    buffer.writeUInt32LE(type, 4);
    return buffer;
  };
  await writeFile(path, Buffer.concat([header, chunkHeader(jsonPadded.length, 0x4e4f534a), jsonPadded, chunkHeader(bin.length, 0x004e4942), bin]));
}

const cli = fileURLToPath(new URL('../cli/toonlab.mjs', import.meta.url));

function runCli(args) {
  const run = spawnSync(process.execPath, [cli, 'auto-roles', ...args], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

// Applies the files the CLI wrote to a fresh load of `glbPath` and compares
// them with the live analysis of another fresh load. Returns timings.
async function compareCliExport(glbPath, directory, cliArgs = []) {
  const [summary] = runCli([glbPath, '--out-dir', directory, ...cliArgs]);
  const jsonPath = summary.files.find((file) => file.endsWith('.json'));
  const document = JSON.parse(await readFile(jsonPath, 'utf8'));
  const masks = {};
  for (const entry of document.meshes) {
    if (!entry.mask) continue;
    const { data, info } = await sharp(join(directory, entry.mask.uri)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    masks[entry.mask.uri] = { data: new Uint8Array(data), height: info.height, width: info.width };
  }
  const data = parseAutoRoles(document, { masks });

  const options = { autoRoles: { mode: 'auto' } };
  const liveGltf = await loadGlbForAutoRoles(glbPath);
  let started = performance.now();
  const liveRun = applyToonShader(liveGltf.scene, options);
  const liveMs = performance.now() - started;
  const runtimeGltf = await loadGlbForAutoRoles(glbPath);
  started = performance.now();
  const runtimeRun = applyToonShader(runtimeGltf.scene, { autoRoles: { data, mode: 'precomputed' } });
  const precomputedMs = performance.now() - started;

  assert.equal(summary.applied, Boolean(liveRun.autoRoles?.applied));
  assert.deepEqual(withoutSource(runtimeRun.autoRoles ?? {}), liveRun.autoRoles ?? {});
  const liveMeshes = [];
  const runtimeMeshes = [];
  liveGltf.scene.traverse((obj) => obj.isMesh && !obj.userData.isToonOutline && liveMeshes.push(obj));
  runtimeGltf.scene.traverse((obj) => obj.isMesh && !obj.userData.isToonOutline && runtimeMeshes.push(obj));
  let maskTexels = 0;
  liveMeshes.forEach((mesh, index) => {
    const runtimeMesh = runtimeMeshes[index];
    assert.deepEqual(runtimeMesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE]?.array, mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE]?.array, `${mesh.name}: role weights`);
    const liveMask = roleMaskOf(mesh)?.image.data;
    const mask = roleMaskOf(runtimeMesh)?.image.data;
    assert.equal(Boolean(mask), Boolean(liveMask), `${mesh.name}: role mask present`);
    if (!liveMask) return;
    // The PNG is RGB (mask alpha is unused): compare the role channels.
    for (let i = 0; i < liveMask.length; i += 4) {
      for (let k = 0; k < 3; k += 1) assert.equal(mask[i + k], liveMask[i + k], `${mesh.name}: mask texel ${i / 4} channel ${k}`);
    }
    maskTexels += liveMask.length / 4;
  });
  assert.deepEqual(runtimeGltf.scene.userData.toonHeadEstimate, liveGltf.scene.userData.toonHeadEstimate);
  return { liveMs, maskTexels, precomputedMs, summary };
}

const workDirectory = await mkdtemp(join(tmpdir(), 'toonlab-auto-roles-'));
try {
  await check('toonlab auto-roles writes a record from a GLB that applies exactly as the live analysis', async () => {
    const glbPath = join(workDirectory, 'chibi.glb');
    await writeChibiGlb(glbPath);
    const { maskTexels, summary } = await compareCliExport(glbPath, workDirectory);
    assert.equal(summary.applied, true, summary.reason);
    assert.equal(summary.method, 'silhouette');
    assert.equal(summary.maskedMeshes, 1);
    assert.equal(maskTexels, 1024 * 1024);
    assert.deepEqual(summary.files.map((file) => file.slice(workDirectory.length + 1)), ['chibi.toonroles.json', 'chibi.toonroles.0.png']);
  });

  for (const glbPath of (process.env.TOONLAB_AUTO_ROLES_GLB ?? '').split(',').filter(Boolean)) {
    await check(`real model ${glbPath.split('/').pop()}: CLI record applies exactly as the live analysis`, async () => {
      const { liveMs, precomputedMs, summary } = await compareCliExport(glbPath, workDirectory);
      process.stdout.write(`      applied ${summary.applied} (${summary.method ?? summary.reason}); conversion live ${liveMs.toFixed(0)} ms, precomputed ${precomputedMs.toFixed(0)} ms (Node)\n`);
    });
  }
} finally {
  await rm(workDirectory, { force: true, recursive: true });
}

process.stdout.write(`\nprecomputed automatic roles: ${checks} checks passed\n`);
