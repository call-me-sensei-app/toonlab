#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { HUMANOID_ROLES, resolveCharacterRig } from '../src/character/characterRig.js';
import { classifyMaterialRole } from '../src/core/materialRoles.js';
import { parseToonPresetDocument } from '../src/toon/toonSettings.js';

const EXPECTED_MESHES = [
  'Body',
  'Buckles_low',
  'Fc_Body',
  'Hair',
  'HairBand_low',
  'Outer_low',
  'OuterHood_low',
  'Pants2_low',
  'Pants_low',
  'Shoes_low',
  'Top_low',
];

const EXPECTED_MATERIAL_ROLES = {
  costume_cloth: 'costume',
  costume_headband: 'costume',
  costume_outerwear: 'costume',
  costume_shoes: 'costume',
  eye_base: 'eye',
  face_lash: 'face',
  face_skin: 'face',
  hair_primary: 'hair',
  skin_body: 'skin',
};

const REQUIRED_MORPHS = [
  'vrc.v_aa',
  'Blink',
  'Blink.L',
  'Blink.R',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'jawOpen',
  'mouthSmileLeft',
  'mouthSmileRight',
  'tongueOut',
];

function parseGlb(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', 'GLB magic must be glTF');
  assert.equal(buffer.readUInt32LE(4), 2, 'GLB must use glTF 2.0');
  assert.equal(buffer.readUInt32LE(8), buffer.length, 'GLB byte length must match its header');

  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.toString('ascii', 16, 20), 'JSON', 'First GLB chunk must be JSON');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/[\u0000 ]+$/, ''));
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      output.push(key);
      collectStrings(item, output);
    });
  }
  return output;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

const assetDir = path.resolve(process.argv[2] || 'assets-local/models/yua');
const glbPath = path.join(assetDir, 'yua.glb');
const manifestPath = path.join(assetDir, 'yua-build.json');
const launchPresetPath = path.join(assetDir, 'yua-launch.toon.json');
const [buffer, manifestText, launchPresetText] = await Promise.all([
  readFile(glbPath),
  readFile(manifestPath, 'utf8'),
  readFile(launchPresetPath, 'utf8'),
]);
const gltf = parseGlb(buffer);
const manifest = JSON.parse(manifestText);
const launchPreset = parseToonPresetDocument(launchPresetText);
assert.equal(launchPreset.ok, true, 'Yua launch settings must be a valid portable ToonLab preset document');
assert.equal(launchPreset.value.id, 'yua_launch');

assert.equal(gltf.scenes?.length, 1, 'Yua must export as one scene');
assert.equal(gltf.skins?.length, 1, 'Yua must export as one armature/skin');
assert.equal(gltf.meshes?.length, 11, 'Yua must contain exactly 11 production meshes');

const meshNodes = gltf.nodes.filter((node) => node.mesh !== undefined);
assert.equal(meshNodes.length, 11, 'Every production mesh must have exactly one scene node');
assert.deepEqual(sorted(meshNodes.map((node) => node.name)), sorted(EXPECTED_MESHES));
assert(meshNodes.every((node) => node.skin === 0), 'Every production mesh must use the single Yua skin');

const materialNames = gltf.materials.map((material) => material.name);
assert.deepEqual(sorted(materialNames), sorted(Object.keys(EXPECTED_MATERIAL_ROLES)));
for (const material of gltf.materials) {
  const expectedRole = EXPECTED_MATERIAL_ROLES[material.name];
  assert.equal(material.extras?.toonRole, expectedRole, `${material.name} must embed toonRole=${expectedRole}`);
  assert.equal(material.extras?.surfaceModel, 'neutral-pbr', `${material.name} must remain neutral PBR`);
  const classified = classifyMaterialRole({ name: material.name, userData: material.extras });
  assert.equal(classified.role, expectedRole, `${material.name} must classify as ${expectedRole}`);
}

const maskedMaterials = gltf.materials.filter((material) => material.alphaMode === 'MASK');
assert.deepEqual(maskedMaterials.map((material) => material.name), ['costume_outerwear']);
assert(gltf.materials.every((material) => material.alphaMode !== 'BLEND'), 'Neutral Yua must not use broad alpha blending');

assert.equal(gltf.images?.length, 10, 'Neutral baseline must embed seven albedo/derived images and three normal maps');
assert(gltf.images.every((image) => image.bufferView !== undefined), 'Every runtime texture must be embedded in the GLB');
assert(gltf.images.every((image) => image.uri === undefined), 'No GLB image may reference an external URI');
assert(gltf.images.every((image) => image.mimeType === 'image/png'), 'Every embedded image must be a lossless PNG');
assert(gltf.images.some((image) => image.name === 'eye_albedo'), 'Converted Eye_Albedo.png must be embedded');

const morphNames = gltf.meshes.flatMap((mesh) => mesh.extras?.targetNames || []);
assert.equal(morphNames.length, 83, 'Yua must retain all 83 functional morph targets');
for (const name of REQUIRED_MORPHS) assert(morphNames.includes(name), `Required facial morph is missing: ${name}`);
assert(morphNames.every((name) => !/^=+$/.test(name)), 'Separator-only shape keys must be omitted');

const jointNames = gltf.skins[0].joints.map((nodeIndex) => gltf.nodes[nodeIndex]?.name).filter(Boolean);
assert(jointNames.length >= 228, 'The complete source skeleton must be represented in the GLB skin');
for (const name of ['Hair_Root', 'Outer_Hood_Root', 'Breast_Root_L', 'Breast_Root_R']) {
  assert(jointNames.includes(name), `Secondary skeleton root is missing: ${name}`);
}
const rig = resolveCharacterRig({ skeleton: { bones: jointNames.map((name) => ({ name })) } });
assert(rig, 'ToonLab must resolve Yua as a supported humanoid rig');
assert.equal(rig.type, 'mixamo', 'ToonLab must resolve Yua as Mixamo-compatible');
assert.equal(rig.targetToMixamo.size, HUMANOID_ROLES.length - 1, 'All source-supported Mixamo roles must resolve (upperChest is absent in the source)');

assert.deepEqual(sorted(manifest.meshes), sorted(EXPECTED_MESHES));
assert.equal(manifest.preservedBoneCount, 228);
assert.equal(Object.keys(manifest.boneRenames).length, HUMANOID_ROLES.length - 1);
for (const canonicalName of Object.values(manifest.boneRenames)) {
  assert.equal(rig.mixamoToTarget.get(canonicalName), canonicalName, `Canonical rig bone failed to resolve: ${canonicalName}`);
}
assert.equal(manifest.sourceBoundsZUpMeters.size[2] > 1.745, true);
assert.equal(manifest.sourceBoundsZUpMeters.size[2] < 1.746, true);
assert.equal(manifest.sourceBoundsZUpMeters.min[2] > 0, true);
assert.equal(manifest.sourceBoundsZUpMeters.min[2] < 0.011, true);
assert.equal(manifest.shaderNeutral, true);

const gltfStrings = collectStrings(gltf);
// Third-party Unity shader and middleware markers; one name is assembled so
// this file does not contain it.
const shaderMarker = String.fromCharCode(110, 105, 108, 111) + 'toon';
const forbidden = new RegExp(`${shaderMarker}|b4f674f383806e5419ee221e39445de0|magica\\s*cloth|unityengine|\\.prefab\\b|\\.mat\\b`, 'i');
assert(!gltfStrings.some((value) => forbidden.test(value)), 'GLB must not contain third-party Unity shader, Unity, Magica Cloth, prefab, or material-YAML identifiers');
assert(!gltfStrings.some((value) => /^\//.test(value) || /^[A-Za-z]:[\\/]/.test(value)), 'GLB must not contain absolute filesystem paths');
assert(!meshNodes.some((node) => /camera|light|cube|high|backup/i.test(node.name)), 'GLB must not contain scene junk or backup mesh nodes');
assert.equal(gltf.cameras, undefined, 'GLB must not contain a camera');
assert.equal(gltf.extensions?.KHR_lights_punctual, undefined, 'GLB must not contain lights');

const summary = {
  asset: glbPath,
  bytes: buffer.length,
  scenes: gltf.scenes.length,
  skins: gltf.skins.length,
  meshNodes: meshNodes.length,
  materials: gltf.materials.length,
  embeddedPngs: gltf.images.length,
  morphTargets: morphNames.length,
  sourceBones: manifest.preservedBoneCount,
  gltfSkinJoints: jointNames.length,
  rigType: rig.type,
  resolvedRoles: rig.targetToMixamo.size,
  heightMeters: manifest.sourceBoundsZUpMeters.size[2],
  footOffsetMeters: manifest.sourceBoundsZUpMeters.min[2],
  maskedMaterials: maskedMaterials.map((material) => material.name),
  auxiliaryTextures: manifest.auxiliaryTextures,
  launchPreset: path.basename(launchPresetPath),
};

console.log(JSON.stringify(summary, null, 2));
