// Verifies the character toon-shading pipeline without a GPU: role
// classification, head calibration, evidence-gated alpha, authored colour
// factors, VRM MToon and MMD import, importer outline slots, eye layering,
// automatic roles, the conversion-time bakes, outline flags, the settings
// schema and preset documents, live retuning, the scene-light collector and
// the render-pass API.
//
//   node scripts/verify-toon-character-shading.mjs
//
// Rendered look is judged separately in labs/toon-review (docs/toon-shading.md).

import assert from 'node:assert/strict';
import * as THREE from 'three';

import { classifyMaterialRole } from '../src/core/materialRoles.js';
import { ALPHA_COVERAGE_KINDS, classifyAlphaSamples, measureAlphaCoverage } from '../src/toon/alphaCoverage.js';
import { AUTO_ROLE_ATTRIBUTE, inferAutoRoleWeights } from '../src/toon/autoRoles.js';
import { bakedDetailAt, bakedOcclusionAt, hasBakedDetail, hasBakedFaceUv } from '../src/toon/bakeAttribute.js';
import { characterRoleKey, resolveCharacterParameters } from '../src/toon/characterParameters.js';
import { createCharacterRenderPasses, TOON_CHARACTER_LAYER } from '../src/toon/characterRenderPasses.js';
import { bakeFaceShadowMap } from '../src/toon/faceShadowBake.js';
import { bakeEyeWhiteLid, bakeSheerFabric } from '../src/toon/featureBakes.js';
import { createHeadTracker } from '../src/toon/headBone.js';
import { bakeLocalOcclusion } from '../src/toon/occlusionBake.js';
import { isSkinLikeColor } from '../src/toon/skinEvidence.js';
import { createAlphaSettings, resolveAlphaForMaterial } from '../src/toon/settings/alphaSettings.js';
import { resolveBaseMaterialColor } from '../src/toon/settings/baseTextureSettings.js';
import { resolveSourceShading } from '../src/toon/sourceShading.js';
import {
  applyToonSettingsToMaterial,
  applyToonShader,
  resolveToonDebugOutputMode,
  setToonDebugOutput,
  setToonDitherOpacity,
  TOON_DEBUG_OUTPUT_LABELS,
  TOON_DEBUG_OUTPUT_MODES,
} from '../src/toon/toonMaterialAdapter.js';
import { collectToonSceneLights, findToonMainLight, syncToonSceneLights, toonSceneLights } from '../src/shaders-tsl/character/sceneLights.js';
import { peekCharacterShadingState } from '../src/shaders-tsl/character/characterState.js';
import {
  createToonSettings,
  getToonPresetIds,
  getToonSettingFieldSchema,
  parseToonPresetDocument,
  registerToonPreset,
  sanitizeToonPresetSettings,
  serializeToonPreset,
  TOON_PRESET_IDS,
  TOON_PRESET_SCHEMA_VERSION,
  TOON_SETTING_DEFAULTS,
  TOON_SETTING_FIELD_SCHEMA,
  TOON_SETTING_GROUPS,
} from '../src/toon/toonSettings.js';

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  process.stdout.write(`  ok  ${name}\n`);
}

const near = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;
const uniformOf = (material, name) => material.uniforms[name].value;

// ---------------------------------------------------------------- roles
check('material names classify without substring false positives', () => {
  const expected = {
    Armor_Chest: 'default',
    Arm_L: 'skin',
    Body: 'skin',
    Bodysuit: 'default',
    Chair: 'default',
    Eyebrow: 'face',
    Eyelash: 'face',
    Face: 'face',
    Hair: 'hair',
    Hair_Highlight: 'hair',
    Hairpin_Metal: 'metal',
    Headphones: 'default',
    Leggings: 'default',
    Legwarmer: 'default',
    N00_000_00_EyeIris_00_EYE: 'iris',
    N00_000_00_EyeWhite_00_EYE: 'sclera',
    N00_000_00_FaceEyeline_00_FACE: 'face',
    Surface_Detail: 'default',
    Tongue: 'face',
  };
  for (const [name, role] of Object.entries(expected)) {
    assert.equal(classifyMaterialRole({ name, userData: {} }).role, role, name);
  }
});

check('material roles map onto the six shading roles', () => {
  const key = (name) => characterRoleKey(classifyMaterialRole({ name, userData: {} }));
  assert.equal(key('Face'), 'face');
  assert.equal(key('Body'), 'skin');
  assert.equal(key('Hair'), 'hair');
  assert.equal(key('N00_000_00_EyeWhite_00_EYE'), 'eye');
  assert.equal(key('Hairpin_Metal'), 'metal');
  assert.equal(key('Skirt'), 'cloth');
});

// ---------------------------------------------------------------- head frame
check('head tracking calibrates to the character, not world +Z', () => {
  for (const [yaw, nod, oblique] of [[0, 0, 0], [90, 0, 0], [180, 0, 0], [135, 12, 0], [60, 0, 90]]) {
    const carrier = new THREE.Group();
    const model = new THREE.Group();
    carrier.add(model);
    const head = new THREE.Bone();
    head.name = 'Head';
    model.add(head);
    head.rotation.set(THREE.MathUtils.degToRad(nod), 0, THREE.MathUtils.degToRad(oblique));
    carrier.rotation.y = THREE.MathUtils.degToRad(yaw);
    const tracker = createHeadTracker(model);
    carrier.rotation.y += Math.PI / 4;
    head.rotation.x = 0;
    carrier.updateMatrixWorld(true);
    tracker.update();
    const actual = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(tracker.state.forward.angleTo(actual) < 1e-3, `yaw ${yaw} nod ${nod} oblique ${oblique}`);
  }
});

check('an unrigged model tracks the estimated head anchor', () => {
  const model = new THREE.Group();
  model.userData.toonHeadEstimate = { center: [0, 1.6, 0.02], forward: [0, 0, 1], up: [0, 1, 0] };
  const tracker = createHeadTracker(model);
  assert.ok(tracker, 'anchor tracker');
  tracker.update();
  assert.ok(tracker.state.position.distanceTo(new THREE.Vector3(0, 1.6, 0.02)) < 1e-6);
});

// ---------------------------------------------------------------- alpha
function alphaTexture(alphaAt) {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) data.set([200, 180, 170, alphaAt(x, y)], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

check('alpha coverage separates masks, opaque alpha and packed data', () => {
  const plane = new THREE.PlaneGeometry(1, 1, 4, 4);
  assert.equal(measureAlphaCoverage(alphaTexture(() => 255), plane).kind, ALPHA_COVERAGE_KINDS.opaque);
  assert.equal(measureAlphaCoverage(alphaTexture((x) => (x < 8 ? 0 : 255)), plane).kind, ALPHA_COVERAGE_KINDS.mask);
  assert.equal(measureAlphaCoverage(alphaTexture((x, y) => 90 + ((x * 7 + y * 3) % 120)), plane).kind, ALPHA_COVERAGE_KINDS.data);
  assert.equal(classifyAlphaSamples({ intermediate: 0, total: 0, transparent: 0 }), ALPHA_COVERAGE_KINDS.unknown);
});

check('evidence vetoes inferred cutouts; trust mode keeps them', () => {
  const hair = { alphaTest: 0.5, map: {}, name: 'Hair', transparent: false, userData: {} };
  const roleInfo = classifyMaterialRole(hair);
  const auto = createAlphaSettings();
  assert.ok(resolveAlphaForMaterial(auto, hair, roleInfo, { kind: 'opaque' }).alphaTest < 0, 'opaque alpha is not cut');
  const data = resolveAlphaForMaterial(auto, hair, roleInfo, { kind: 'data' });
  assert.ok(data.alphaTest < 0 && data.textureAlpha === 0, 'packed data neither cuts nor blends');
  assert.ok(resolveAlphaForMaterial(auto, hair, roleInfo, { kind: 'mask' }).alphaTest > 0, 'a real mask is cut');
  assert.ok(resolveAlphaForMaterial(createAlphaSettings({ coverageMode: 'trust' }), hair, roleInfo, { kind: 'opaque' }).alphaTest > 0);
  assert.ok(resolveAlphaForMaterial(auto, hair, roleInfo, null).alphaTest > 0, 'unknown coverage keeps inference');
});

check('soft alpha on a declared glTF blend is blended, not treated as data', () => {
  const overlay = { map: {}, name: 'eye_trans', opacity: 1, transparent: true, userData: { toonSource: { alphaMode: 'BLEND', format: 'gltf' } } };
  const soft = resolveAlphaForMaterial(createAlphaSettings(), overlay, classifyMaterialRole(overlay), { kind: 'data' });
  assert.equal(soft.coverage, 'soft');
  assert.ok(soft.transparent && soft.alphaBlend && soft.textureAlpha === 1 && !soft.alphaCutout);
  const masked = { ...overlay, transparent: false, userData: { toonSource: { alphaMode: 'MASK', format: 'gltf' } } };
  assert.equal(resolveAlphaForMaterial(createAlphaSettings(), masked, classifyMaterialRole(masked), { kind: 'data' }).coverage, 'data');
});

check('converted materials carry the alpha policy', () => {
  const texture = alphaTexture((x) => (x < 8 ? 0 : 255));
  const hair = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2, 4, 4), new THREE.MeshStandardMaterial({ alphaTest: 0.5, map: texture, name: 'Hair' }));
  const root = new THREE.Group();
  root.add(hair);
  applyToonShader(root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
  assert.ok(hair.material.alphaTest > 0, 'cutout hair keeps an alpha test');
  assert.equal(hair.material.transparent, false);
  assert.equal(setToonDitherOpacity(root, 0.5) >= 1, true);
  assert.equal(uniformOf(hair.material, 'ditherOpacity'), 0.5);
});

// ---------------------------------------------------------------- colour
check('authored base colour factors survive; importer greys do not', () => {
  const texture = new THREE.Texture();
  const gltfBlack = { color: new THREE.Color(0.009, 0.012, 0.021), map: texture, userData: { toonSource: { format: 'gltf' } } };
  assert.ok(resolveBaseMaterialColor(gltfBlack).r < 0.02, 'glTF near-black factor kept');
  const fbxGrey = { color: new THREE.Color(0.8, 0.8, 0.8), map: texture, userData: { toonSource: { format: 'fbx' } } };
  assert.equal(resolveBaseMaterialColor(fbxGrey).r, 1, 'FBX default grey ignored');
  const fbxBlack = { color: new THREE.Color(0, 0, 0), map: texture, userData: { toonSource: { format: 'fbx' } } };
  assert.equal(resolveBaseMaterialColor(fbxBlack).r, 1, 'an FBX texture replaces the diffuse colour');
  const objBlack = { color: new THREE.Color(0.02, 0.02, 0.02), map: texture, userData: { toonSource: { format: 'obj' } } };
  assert.ok(resolveBaseMaterialColor(objBlack).r < 0.05, 'near-black is never an importer default');
});

check('skin colour: pale through dark skin, not greys, whites or visors', () => {
  const skin = { anime: [250, 225, 210], blush: [255, 200, 200], dark: [60, 40, 30], orangeBrown: [200, 110, 60], stylisedBrown: [180, 95, 36], pale: [255, 240, 230], tan: [200, 160, 130] };
  const notSkin = { grey: [128, 128, 128], greyBeige: [100, 95, 90], saturatedOrange: [230, 120, 40], visor: [40, 60, 90], white: [230, 230, 235] };
  for (const [name, [r, g, b]] of Object.entries(skin)) assert.ok(isSkinLikeColor(r / 255, g / 255, b / 255), name);
  for (const [name, [r, g, b]] of Object.entries(notSkin)) assert.ok(!isSkinLikeColor(r / 255, g / 255, b / 255), name);
});

check('name-only skin/face roles are demoted when the surface is not skin-coloured', () => {
  const root = new THREE.Group();
  const add = (name, color) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...color, THREE.SRGBColorSpace), name }));
    root.add(mesh);
    return mesh;
  };
  const arm = add('Arm_L', [0.9, 0.9, 0.92]);
  const roboFace = add('robo_face', [0.5, 0.5, 0.52]);
  const face = add('Face', [0.98, 0.9, 0.85]);
  const brow = add('Eyebrow', [0.2, 0.12, 0.1]);
  const { report } = applyToonShader(root, { preset: 'call_me_sensei' });
  const demoted = report.filter((entry) => entry.code === 'role-demoted-not-skin').map((entry) => entry.detail.material).sort();
  assert.deepEqual(demoted, ['Arm_L', 'robo_face']);
  assert.equal(arm.material.userData.toonRole, 'cloth');
  assert.equal(face.material.userData.toonRole, 'face');
  assert.equal(brow.material.userData.toonRole, 'face', 'facial features keep the face role');
  assert.equal(roboFace.material.userData.toonRole, 'cloth');
});

check('a texture that never loaded is treated as absent and reported', () => {
  const empty = new THREE.DataTexture(null, 1, 1);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ map: empty, name: 'Skirt' }));
  const root = new THREE.Group();
  root.add(mesh);
  const { report } = applyToonShader(root, { preset: 'call_me_sensei' });
  assert.ok(report.some((entry) => entry.code === 'texture-unavailable'));
  assert.notEqual(mesh.material.userData.toonFeatures.baseMap, empty, 'the empty texture is not bound');
});

// ---------------------------------------------------------------- MToon
function mockMToon(overrides = {}) {
  return {
    color: new THREE.Color(1, 1, 1),
    isMToonMaterial: true,
    isOutline: false,
    name: 'N00_007_02_Tops_01_CLOTH',
    outlineColorFactor: new THREE.Color(0.1, 0.08, 0.08),
    outlineLightingMixFactor: 1,
    outlineWidthFactor: 0.0008,
    outlineWidthMode: 'worldCoordinates',
    parametricRimColorFactor: new THREE.Color(0, 0, 0),
    shadeColorFactor: new THREE.Color(0.62, 0.67, 0.93),
    shadingShiftFactor: -0.05,
    shadingToonyFactor: 0.95,
    userData: {},
    ...overrides,
  };
}

check('MToon terminator, shade colour and outline colour import as authored', () => {
  const settings = createToonSettings();
  const source = resolveSourceShading(mockMToon(), { settings });
  assert.ok(near(source.parameterOverrides.terminator, 0.05), 'shading shift sets the terminator');
  assert.ok(near(source.parameterOverrides.softness, 0.05), 'toony sets the softness');
  assert.equal(source.parameterOverrides.outlineWidth, undefined, 'outline width stays with the preset');
  assert.equal(source.parameterOverrides.outlineColorOverride[3], 1);
  assert.equal(source.parameterOverrides.rimIntensity, undefined, 'black rim colour stays off');
  assert.ok(source.shadeOverride.color.b > 0.9);
  const disabled = resolveSourceShading(mockMToon(), { settings: createToonSettings({ ramp: { importMToon: false } }) });
  assert.deepEqual(disabled.parameterOverrides, {});
  assert.equal(disabled.shadeOverride, null);
});

check('a VRM outline slot is not converted into a second body', () => {
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const surface = mockMToon({ name: 'Body_00_SKIN' });
  const outline = mockMToon({ isOutline: true, name: 'Body_00_SKIN (Outline)', side: THREE.BackSide });
  const count = geometry.index.count;
  geometry.clearGroups();
  geometry.addGroup(0, count, 0);
  geometry.addGroup(0, count, 1);
  const mesh = new THREE.Mesh(geometry, [surface, outline]);
  const root = new THREE.Group();
  root.add(mesh);
  const result = applyToonShader(root, { preset: 'call_me_sensei' });
  assert.equal(mesh.material.length, 1);
  assert.equal(geometry.groups.length, 1);
  assert.ok(result.report.some((entry) => entry.code === 'importer-outline-slots-removed'));
  assert.ok(result.report.some((entry) => entry.code === 'mtoon-imported'));
  assert.equal(mesh.material[0].userData.toonFeatures.shadeOverride, true, 'MToon shade replaces the tone');
});

// ---------------------------------------------------------------- eyes
check('split eye meshes draw sclera, iris, highlight in order; painted highlights stay', () => {
  const root = new THREE.Group();
  const make = (name, renderOrder) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), new THREE.MeshStandardMaterial({ name }));
    mesh.renderOrder = renderOrder;
    root.add(mesh);
    return mesh;
  };
  const sclera = make('EyeWhite', 19);
  const iris = make('EyeIris', 17);
  const highlight = make('EyeHighlight', 18);
  make('Face', 19);
  const result = applyToonShader(root, { highlights: { eye: { enabled: true } }, preset: 'call_me_sensei' });
  assert.ok(sclera.renderOrder < iris.renderOrder && iris.renderOrder < highlight.renderOrder);
  assert.equal(uniformOf(iris.material, 'specularIntensity'), 0, 'painted highlights suppress the dynamic eye glint');
  assert.ok(result.report.some((entry) => entry.code === 'painted-eye-highlights'));
});

// ---------------------------------------------------------------- auto roles
function syntheticCharacter() {
  const body = new THREE.CylinderGeometry(0.18, 0.15, 1.3, 24, 20).translate(0, 0.65, 0);
  const neck = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16, 4).translate(0, 1.36, 0);
  const head = new THREE.SphereGeometry(0.11, 32, 24).translate(0, 1.52, 0);
  const merge = [body, neck, head].map((geometry) => geometry.toNonIndexed());
  const count = merge.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  let offset = 0;
  for (const geometry of merge) {
    positions.set(geometry.attributes.position.array, offset * 3);
    normals.set(geometry.attributes.normal.array, offset * 3);
    uvs.set(geometry.attributes.uv.array, offset * 2);
    offset += geometry.attributes.position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(0.95, 0.72, 0.6), name: 'Material_0' }));
  const root = new THREE.Group();
  root.add(mesh);
  return { mesh, root };
}

check('automatic roles find the face on an unrigged single-material character', () => {
  const { mesh, root } = syntheticCharacter();
  const result = inferAutoRoleWeights(root);
  assert.equal(result.applied, true, result.reason);
  assert.equal(result.method, 'silhouette');
  const weights = mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE];
  const position = mesh.geometry.attributes.position;
  let frontFace = 0;
  let bodyFace = 0;
  for (let i = 0; i < position.count; i += 1) {
    const face = weights.getY(i);
    if (position.getY(i) < 1.3 && face > 0.5) bodyFace += 1;
    if (position.getY(i) > 1.45 && position.getZ(i) > 0.08 && face > 0.5) frontFace += 1;
  }
  assert.ok(frontFace > 20, `front of the head is face (${frontFace})`);
  assert.equal(bodyFace, 0, 'the body is never face');
  assert.ok(root.userData.toonHeadEstimate.center[1] > 1.4);
});

check('a root turned 180° by its importer (VRM 0.x) keeps its face frame', () => {
  const { mesh, root } = syntheticCharacter();
  mesh.geometry.rotateY(Math.PI);
  root.rotation.y = Math.PI;
  root.userData.toonForward = [0, 0, -1];
  const result = inferAutoRoleWeights(root);
  assert.equal(result.applied, true, result.reason);
  const weights = mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE];
  const position = mesh.geometry.attributes.position;
  let front = 0;
  let back = 0;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < 1.45 || weights.getY(i) < 0.5) continue;
    if (position.getZ(i) < -0.08) front += 1;
    if (position.getZ(i) > 0.08) back += 1;
  }
  assert.ok(front > 20 && back === 0, `face on the modelled front (${front}), not the back (${back})`);
  const tracker = createHeadTracker(root);
  tracker.update();
  assert.ok(tracker.state.forward.z > 0.99, 'the head frame faces the world front');
});

check('automatic roles use the rig when the head is a rigid attachment', () => {
  const { mesh: body, root } = syntheticCharacter();
  const hips = new THREE.Bone();
  const neck = new THREE.Bone();
  const head = new THREE.Bone();
  hips.name = 'Hips';
  neck.name = 'Neck';
  head.name = 'Head';
  neck.position.y = 1.36;
  head.position.y = 0.06;
  hips.add(neck);
  neck.add(head);
  root.add(hips);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), body.material);
  headMesh.position.y = 0.1;
  head.add(headMesh);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06).translate(0.25, 1.6, -0.15), body.material.clone());
  prop.material.name = 'Backpack';
  hips.add(prop);
  root.remove(body);
  hips.add(body);
  const result = inferAutoRoleWeights(root, { headBone: head });
  assert.equal(result.applied, true, result.reason);
  assert.equal(result.method, 'skin-weights');
  const weights = headMesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE];
  let front = 0;
  for (let i = 0; i < weights.count; i += 1) {
    if (headMesh.geometry.attributes.position.getZ(i) > 0.06 && weights.getY(i) > 0.5) front += 1;
  }
  assert.ok(front > 20, `front of the rigid head is face (${front})`);
  const propWeights = prop.geometry.attributes[AUTO_ROLE_ATTRIBUTE];
  for (let i = 0; i < propWeights.count; i += 1) assert.ok(propWeights.getY(i) < 0.5, 'the prop is never face');
});

check('automatic roles run through applyToonShader, report, and blend role parameters', () => {
  const { mesh, root } = syntheticCharacter();
  const result = applyToonShader(root, { preset: 'call_me_sensei' });
  assert.ok(result.report.some((entry) => entry.code === 'auto-roles-applied'));
  assert.equal(mesh.material.userData.toonFlags.hasRoleWeights, true);
  // Per-role parameters exist for the weighted roles (blended in the shader).
  for (const name of ['terminatorFace', 'toneSkin', 'toneHair', 'rimIntensityHair', 'outlineWidthFace']) {
    assert.ok(mesh.material.uniforms[name], name);
  }
  assert.ok(near(uniformOf(mesh.material, 'terminatorFace'), createToonSettings({ preset: 'call_me_sensei' }).face.terminator));
  const off = syntheticCharacter();
  const offResult = applyToonShader(off.root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
  assert.ok(offResult.report.some((entry) => entry.code === 'no-face-role'));
  assert.equal(off.mesh.geometry.attributes[AUTO_ROLE_ATTRIBUTE], undefined);
});

// ---------------------------------------------------------------- face map
function syntheticFace({ nose = true } = {}) {
  const root = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.95, 0.8, 0.72), name: 'Face' });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 64, 48).translate(0, 1.5, 0), material);
  root.add(head);
  if (nose) {
    const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 16).rotateX(Math.PI / 2).translate(0, 1.485, 0.115), material);
    root.add(noseMesh);
  }
  return { head, material, root };
}

function mapValue(result, u, v) {
  const { data, width, height } = result.texture.image;
  const x = Math.min(width - 1, Math.floor(u * width));
  const y = Math.min(height - 1, Math.floor(v * height));
  return data[(y * width + x) * 4] / 255;
}

check('face map bake: the lit side outlasts the far side and the nose casts', () => {
  const plain = bakeFaceShadowMap(syntheticFace({ nose: false }).root, { isFaceMaterial: (mat) => mat.name === 'Face' });
  const withNose = bakeFaceShadowMap(syntheticFace().root, { isFaceMaterial: (mat) => mat.name === 'Face' });
  assert.ok(plain && withNose, 'baked');
  assert.ok(mapValue(plain, 0.75, 0.5) > mapValue(plain, 0.25, 0.5) + 0.3, 'right side stays lit longer');
  assert.ok(Math.abs(mapValue(plain, 0.5, 0.5) - 0.5) < 0.12, 'the centre line splits at a side light');
  let deepest = 0;
  for (let u = 0.25; u <= 0.47; u += 0.02) {
    for (let v = 0.2; v <= 0.42; v += 0.02) deepest = Math.min(deepest, mapValue(withNose, u, v) - mapValue(plain, u, v));
  }
  assert.ok(deepest < -0.15, `nose shadow on the far cheek (${deepest.toFixed(2)})`);
  assert.ok(withNose.noseTip, 'nose found');
  assert.equal(plain.noseTip, null, 'the front of a smooth head is not a nose');
  assert.ok(withNose.noseMark && !withNose.noseMark.drawn, 'nose mark placed');
  assert.ok(Math.abs(withNose.noseMark.center[0] - 0.5) < 0.02, 'on the centre line');
  assert.equal(plain.noseMark, null);
});

check('face map bake is wired onto face materials through planar coordinates', () => {
  const { head, root } = syntheticFace();
  const { report } = applyToonShader(root, { preset: 'call_me_sensei' });
  assert.ok(report.some((entry) => entry.code === 'face-shadow-map-baked'));
  assert.ok(hasBakedFaceUv(head.geometry), 'planar face coordinates written');
  assert.equal(head.material.userData.toonFlags.hasFaceShadowMap, true);
  assert.equal(head.material.userData.toonFlags.hasFaceUv, true);
  assert.equal(head.material.userData.toonFeatures.faceMapCoords, 'bake');
  assert.equal(head.material.userData.toonFeatures.noseMark, true, 'the nose shadow is painted');
  assert.equal(uniformOf(head.material, 'faceMapStrength'), 1);
  const state = peekCharacterShadingState(root);
  assert.equal(state.headReady.value, 1, 'the static head frame is set at conversion');
  assert.ok(state.faceFrame, 'the face frame is kept for head tracking');
  const off = syntheticFace();
  applyToonShader(off.root, { face: { map: { auto: false } }, preset: 'call_me_sensei' });
  assert.equal(off.head.material.userData.toonFlags.hasFaceShadowMap, false);
  assert.equal(uniformOf(off.head.material, 'faceMapStrength'), 0);
});

check('eye-white lid shade: 0 under the upper lid, 1 at the lower edge; painted eyes keep theirs', () => {
  const eyeWhite = (texture) => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ map: texture ?? null, name: 'EyeWhite' });
    const geometry = new THREE.PlaneGeometry(0.03, 0.016, 6, 6);
    const left = geometry.clone().translate(-0.03, 1.5, 0.08);
    const right = geometry.clone().translate(0.03, 1.5, 0.08);
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute([...left.attributes.position.array, ...right.attributes.position.array], 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute([...left.attributes.uv.array, ...right.attributes.uv.array], 2));
    merged.setIndex([...left.index.array, ...[...right.index.array].map((i) => i + left.attributes.position.count)]);
    const mesh = new THREE.Mesh(merged, material);
    root.add(mesh);
    return { mesh, result: bakeEyeWhiteLid(root, { isScleraMaterial: (mat) => mat.name === 'EyeWhite' }) };
  };
  const plain = eyeWhite();
  assert.equal(plain.result.eyes, 2, 'two eyes found');
  assert.ok(hasBakedDetail(plain.mesh.geometry, 'lid'));
  const position = plain.mesh.geometry.attributes.position;
  let top = -1;
  let bottom = -1;
  for (let i = 0; i < position.count; i += 1) {
    if (top < 0 || position.getY(i) > position.getY(top)) top = i;
    if (bottom < 0 || position.getY(i) < position.getY(bottom)) bottom = i;
  }
  assert.ok(bakedDetailAt(plain.mesh.geometry, top) < 0.05 && bakedDetailAt(plain.mesh.geometry, bottom) > 0.95);
  const shaded = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255, 150, 150, 160, 255]), 1, 2);
  shaded.needsUpdate = true;
  const painted = eyeWhite(shaded);
  assert.equal(painted.result.painted.length, 1);
  assert.ok(!hasBakedDetail(painted.mesh.geometry, 'lid'));
});

check('sheer fabric: tight dark cloth down the shin, not loose trousers or shorts', () => {
  const leg = ({ radius, from, to, name = 'Cloth', color = 0x2a2230 }) => {
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    const upper = new THREE.Bone();
    upper.name = 'LeftUpperLeg';
    upper.position.set(0.1, 0.9, 0);
    const lower = new THREE.Bone();
    lower.name = 'LeftLowerLeg';
    lower.position.set(0, -0.45, 0);
    const foot = new THREE.Bone();
    foot.name = 'LeftFoot';
    foot.position.set(0, -0.42, 0);
    hips.add(upper);
    upper.add(lower);
    lower.add(foot);
    const geometry = new THREE.CylinderGeometry(radius, radius, to - from, 12, 12, true).translate(0.1, (from + to) / 2, 0);
    const position = geometry.attributes.position;
    const skinIndex = [];
    const skinWeight = [];
    for (let i = 0; i < position.count; i += 1) {
      skinIndex.push(position.getY(i) < 0.45 ? 2 : 1, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ color, name }));
    const root = new THREE.Group();
    root.add(hips, mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([hips, upper, lower, foot]));
    return { mesh, result: bakeSheerFabric(root, { isEligibleMaterial: () => true }), root };
  };
  const stockings = leg({ from: 0.05, radius: 0.04, to: 0.9 });
  assert.deepEqual(stockings.result?.materials, ['Cloth'], 'tight, dark, down the shin');
  assert.ok(bakedDetailAt(stockings.mesh.geometry, 0) > 0.5);
  assert.equal(leg({ from: 0.05, radius: 0.13, to: 0.9 }).result, null, 'loose trousers');
  assert.equal(leg({ from: 0.42, radius: 0.05, to: 0.9 }).result, null, 'shorts end at the knee');
  assert.equal(leg({ from: 0.05, radius: 0.04, to: 0.9, color: 0xe8e0dc }).result, null, 'light cloth');
  assert.equal(leg({ from: 0.05, radius: 0.04, name: 'Jeans', to: 0.9 }).result, null, 'named trousers');
  // Through the pipeline the stocking material reads the streak detail.
  const converted = leg({ from: 0.05, radius: 0.04, to: 0.9 });
  applyToonShader(converted.root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
  assert.equal(converted.mesh.material.userData.toonFeatures.bake.detail, 'sheer');
});

// ---------------------------------------------------------------- occlusion
function occlusionOf(mesh, predicate) {
  const position = mesh.geometry.attributes.position;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < position.count; i += 1) {
    if (!predicate(position.getX(i), position.getY(i), position.getZ(i))) continue;
    sum += bakedOcclusionAt(mesh.geometry, i);
    count += 1;
  }
  return count ? sum / count : NaN;
}

check('local occlusion: creases and facing surfaces, not convex or stacked layers', () => {
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.1, 48, 32).translate(0, 1, 0));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3, 30, 30).rotateX(-Math.PI / 2).translate(0.15, 0.5, 0));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3, 30, 30).rotateY(Math.PI / 2).translate(0, 0.65, 0));
  const facingA = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2, 20, 20).translate(-1, 1, 0));
  const facingB = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2, 20, 20).rotateY(Math.PI).translate(-1, 1, 0.03));
  const stackedA = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2, 20, 20).translate(1, 1, 0));
  const stackedB = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2, 20, 20).translate(1, 1, 0.03));
  const root = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.01, 1.7, 0.01).translate(3, 0.85, 0));
  root.add(marker, sphere, floor, wall, facingA, facingB, stackedA, stackedB);
  bakeLocalOcclusion(root);
  const convex = occlusionOf(sphere, () => true);
  const corner = occlusionOf(floor, (x) => x < 0.02);
  const open = occlusionOf(floor, (x) => x > 0.2);
  const facing = occlusionOf(facingA, (x, y) => Math.abs(x + 1) < 0.05 && Math.abs(y - 1) < 0.05);
  const stacked = occlusionOf(stackedA, (x, y) => Math.abs(x - 1) < 0.05 && Math.abs(y - 1) < 0.05);
  assert.ok(convex < 0.05, `a sphere is unoccluded (${convex.toFixed(2)})`);
  assert.ok(corner > 0.35 && open < 0.05, `the crease corner darkens (${corner.toFixed(2)}), open floor does not (${open.toFixed(2)})`);
  assert.ok(facing > 0.5, `surfaces facing each other (${facing.toFixed(2)})`);
  assert.ok(stacked < facing / 3, `stacked layers count little (${stacked.toFixed(2)})`);
});

check('the occlusion bake drives the lighting-map bias (faces excluded, hair lighter)', () => {
  const settings = createToonSettings();
  assert.equal(resolveCharacterParameters(settings, { role: 'cloth' }).autoBiasStrength, 0.8);
  assert.equal(resolveCharacterParameters(settings, { role: 'hair' }).autoBiasStrength, 0.4);
  assert.equal(resolveCharacterParameters(settings, { role: 'face' }).autoBiasStrength, 0);
  assert.equal(resolveCharacterParameters(createToonSettings({ shading: { lightingMap: { auto: false } } }), { role: 'cloth' }).autoBiasStrength, 0);
});

// ---------------------------------------------------------------- outlines
check('outline hulls: back faces, role widths, face push, source edge flags', () => {
  const root = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.98, 0.9, 0.85), name: 'Face' }));
  // A flat-shaded octagonal prism: split normals at every crease.
  const prism = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8).toNonIndexed();
  prism.computeVertexNormals();
  const cloth = new THREE.Mesh(prism, new THREE.MeshStandardMaterial({ name: 'Skirt' }));
  root.add(face, cloth);
  applyToonShader(root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
  const hullOf = (mesh) => mesh.children.find((child) => child.userData.isToonOutline);
  const clothHull = hullOf(cloth);
  const faceHull = hullOf(face);
  assert.ok(clothHull && faceHull, 'every converted mesh gets a hull');
  assert.equal(clothHull.material.side, THREE.BackSide);
  assert.equal(typeof clothHull.material.viewOffset, 'function', 'the hull expands in view space');
  assert.ok(clothHull.geometry.attributes.normal === cloth.geometry.attributes.outlineSmoothNormal, 'hard-edged meshes expand along baked smooth normals');
  assert.ok(near(uniformOf(clothHull.material, 'outlineWidth'), 0.0055));
  assert.ok(near(uniformOf(faceHull.material, 'outlineWidth'), 0.003));
  assert.ok(near(uniformOf(faceHull.material, 'outlineFaceDepthPush'), 0.02));
  assert.deepEqual(uniformOf(clothHull.material, 'ink').toArray().map((v) => +v.toFixed(3)), [0.22, 0.21, 0.28]);
  assert.equal(clothHull.castShadow, false);

  // An MMD edge flag turned off (eyes, lashes, mouth) means no outline hull.
  const outlined = (visible) => {
    const model = new THREE.Group();
    const material = new THREE.MeshToonMaterial({ name: 'Cloth' });
    material.userData.outlineParameters = { alpha: 1, color: [0, 0, 0], thickness: 0.002, visible };
    model.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), material));
    applyToonShader(model, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
    let hull = null;
    model.traverse((object) => { if (object.userData?.isToonOutline) hull = object; });
    return { hull, model };
  };
  assert.equal(outlined(true).hull.material.visible, true, 'edge on keeps its outline');
  const off = outlined(false);
  assert.equal(off.hull.material.visible, false, 'edge off draws no outline');
  applyToonSettingsToMaterial(off.model, createToonSettings({ autoRoles: { mode: 'off' }, preset: 'call_me_sensei' }));
  assert.equal(off.hull.material.visible, false, 'a retune keeps it off');
  applyToonSettingsToMaterial(off.model, createToonSettings({ outline: { honourSourceOff: false }, preset: 'call_me_sensei' }));
  assert.equal(off.hull.material.visible, true, 'honourSourceOff can be turned off live');
});

// ---------------------------------------------------------------- settings
check('settings schema: groups, fields and defaults', () => {
  const ids = TOON_SETTING_GROUPS.map((group) => group.id);
  for (const id of ['light', 'shading', 'ramp', 'face', 'shadows', 'rim', 'highlights', 'outline', 'maps', 'baseTexture', 'alpha', 'autoRoles', 'sticker', 'fur']) {
    assert.ok(ids.includes(id), id);
    assert.ok(TOON_SETTING_FIELD_SCHEMA[id], `${id} schema`);
  }
  for (const id of ['light', 'shading', 'ramp', 'face', 'shadows', 'rim', 'highlights', 'outline', 'maps']) {
    assert.equal(TOON_SETTING_DEFAULTS[id].enabled, true, `${id}.enabled`);
  }
  const field = getToonSettingFieldSchema('light', 'cameraLight.strength');
  assert.equal(field.type, 'number');
  assert.equal(field.id, 'light.cameraLight.strength');
  assert.deepEqual([field.range.min, field.range.max], [0, 1]);
  assert.equal(getToonSettingFieldSchema('shading', 'lightingMap.map').serializable, false, 'textures are runtime-only');
  const defaults = createToonSettings();
  assert.deepEqual(defaults.ramp.tone.skin, [0.92, 0.79, 0.74]);
  assert.deepEqual(defaults.ramp.tone.cloth, [0.77, 0.835, 0.91]);
  assert.equal(defaults.face.terminator, -0.48);
  assert.equal(defaults.rim.silhouette.body, 0, 'baseline keeps the silhouette rim off');
  assert.equal(defaults.highlights.specular.clothNeedsMask, false);
  assert.equal(defaults.shadows.character.normalBias, 0.005);
});

check('presets: default, call_me_sensei and showcase', () => {
  assert.deepEqual([...TOON_PRESET_IDS], ['default', 'call_me_sensei', 'showcase']);
  for (const id of TOON_PRESET_IDS) assert.ok(getToonPresetIds().includes(id), id);
  const sensei = createToonSettings({ preset: 'call_me_sensei' });
  assert.equal(sensei.light.sunTint, 0.35);
  assert.deepEqual(sensei.rim.silhouette, { body: 1, hair: 0.5 });
  assert.equal(sensei.highlights.specular.clothNeedsMask, true);
  assert.equal(sensei.outline.inkSaturation.hair, 0.47);
  assert.equal(sensei.outline.inkHueShift, 0.044);
  assert.equal(sensei.shadows.hairOnFace.strength.face, 0.75);
  assert.deepEqual(sensei.ramp.tone.cloth, createToonSettings().ramp.tone.cloth, 'tones as default');
  const showcase = createToonSettings({ preset: 'showcase' });
  assert.equal(showcase.light.sunTint, 0.35, 'showcase builds on the product look');
  assert.equal(createToonSettings({ preset: 'Call Me Sensei' }).preset, 'call_me_sensei');
  const overridden = createToonSettings({ preset: 'call_me_sensei', rim: { intensity: { hair: 0.1 } } });
  assert.equal(overridden.rim.intensity.hair, 0.1);
  assert.equal(overridden.rim.intensity.cloth, 0.16, 'overrides merge onto the preset');
});

check('preset documents: version 2 round-trips, version 1 is rejected', () => {
  assert.equal(TOON_PRESET_SCHEMA_VERSION, 2);
  const json = serializeToonPreset('verify_look', {
    settings: { autoRoles: { mode: 'off' }, light: { cameraLight: { strength: 0.5 } }, rim: { intensity: { hair: 0.4 } } },
  });
  const parsed = parseToonPresetDocument(json);
  assert.ok(parsed.ok, parsed.errors?.join(' '));
  assert.equal(parsed.value.version, 2);
  assert.equal(parsed.value.settings.light.cameraLight.strength, 0.5);
  assert.equal(parsed.value.settings.autoRoles.mode, 'off');
  const legacy = parseToonPresetDocument({ id: 'old', settings: { celShade: {} }, type: 'toonlab/toon-preset', version: 1 });
  assert.equal(legacy.ok, false);
  assert.match(legacy.errors[0], /version 1 is not supported/);
  const unknown = parseToonPresetDocument({ id: 'x', settings: { rimLight: {} }, type: 'toonlab/toon-preset', version: 2 });
  assert.ok(unknown.ok && unknown.warnings.some((warning) => warning.includes('rimLight')));
  const sanitized = sanitizeToonPresetSettings({ face: { map: { texture: new THREE.Texture(), strength: 0.5 } }, outline: { width: 0.001 } });
  assert.equal(sanitized.face.map.texture, undefined, 'textures are not serialised');
  assert.equal(sanitized.outline.width.hair, 0.001, 'one value spreads over a per-role block');
  registerToonPreset('verify_registered', { settings: { light: { sunTint: 0.6 } } }, { overwrite: true });
  assert.equal(createToonSettings({ preset: 'verify_registered' }).light.sunTint, 0.6);
});

check('retired settings groups are reported, not silently mis-applied', () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ name: 'Cloth' })));
  const { report } = applyToonShader(root, { autoRoles: { mode: 'off' }, celShade: { enabled: false }, preset: 'call_me_sensei' });
  assert.ok(report.some((entry) => entry.code === 'retired-settings-group'));
});

// ---------------------------------------------------------------- retune
check('live retuning writes uniforms and keeps authored per-material overrides', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mockMToon({ name: 'Onepiece_CLOTH' }));
  root.add(mesh);
  applyToonShader(root, { preset: 'call_me_sensei' });
  const material = mesh.material;
  assert.ok(near(uniformOf(material, 'terminator'), 0.05), 'MToon shift applied');
  const result = applyToonSettingsToMaterial(root, createToonSettings({ light: { sunTint: 0.8 }, shading: { terminator: { cloth: -0.3 } } }));
  assert.ok(result.updatedMaterialCount >= 1);
  assert.equal(mesh.material, material, 'a retune does not rebuild the material');
  assert.ok(near(uniformOf(material, 'terminator'), 0.05), 'MToon shift survives a retune');
  assert.equal(uniformOf(material, 'sunTint'), 0.8, 'retune applied the light');
});

check('product preset: unmasked cloth is matte, the silhouette rim is on and live', () => {
  const root = new THREE.Group();
  const meshFor = (material) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), material);
    root.add(mesh);
    return mesh;
  };
  const mask = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  mask.needsUpdate = true;
  const belt = new THREE.MeshStandardMaterial({ name: 'Belt' });
  belt.userData.toonSpecularMaskMap = mask;
  const dress = meshFor(new THREE.MeshStandardMaterial({ name: 'Dress' }));
  const masked = meshFor(belt);
  const hair = meshFor(new THREE.MeshStandardMaterial({ name: 'Hair' }));
  applyToonShader(root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
  assert.equal(uniformOf(dress.material, 'specularIntensity'), 0, 'unmasked cloth has no highlight');
  assert.ok(uniformOf(masked.material, 'specularIntensity') > 0, 'a specular mask still shines');
  assert.ok(uniformOf(hair.material, 'specularIntensity') > 0, 'hair keeps its highlight');
  assert.ok(uniformOf(hair.material, 'hairRingIntensity') > 0, 'hair ring on');
  assert.equal(uniformOf(dress.material, 'rimSilhouette'), 1);
  assert.equal(uniformOf(hair.material, 'rimSilhouette'), 0.5);
  applyToonSettingsToMaterial(root, createToonSettings({ autoRoles: { mode: 'off' }, preset: 'call_me_sensei', rim: { silhouette: { body: 0.7 } } }));
  assert.equal(uniformOf(dress.material, 'rimSilhouette'), 0.7, 'retune reaches the silhouette rim');
  assert.equal(uniformOf(dress.material, 'specularIntensity'), 0, 'retune keeps unmasked cloth matte');
});

check('an MMD model\'s own toon ramp imports as its display-space tone on request', () => {
  const rampFor = (shared) => {
    const ramp = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255, 164, 162, 180, 255]), 2, 1);
    ramp.needsUpdate = true;
    ramp.userData.mmdToon = { file: shared ? 'toon01.bmp' : 'toon_defo.bmp', shared };
    return ramp;
  };
  const convert = (shared, settings) => {
    const root = new THREE.Group();
    const material = new THREE.MeshToonMaterial({ gradientMap: rampFor(shared), name: 'Cloth' });
    material.userData.outlineParameters = { alpha: 1, color: [0.17, 0.08, 0.08], thickness: 0.002, visible: true };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), material);
    root.add(mesh);
    const { report } = applyToonShader(root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei', ...settings });
    return { report, tone: uniformOf(mesh.material, 'toneOverride') };
  };
  assert.equal(convert(false, {}).tone.w, 0, 'off by default');
  const imported = convert(false, { ramp: { importMmdRamp: true } });
  assert.equal(imported.tone.w, 1);
  // MMD multiplies in display space; the tone stays a display multiplier.
  assert.ok(Math.abs(imported.tone.x - 164 / 255) < 0.01 && imported.tone.z > imported.tone.x, `tone ${imported.tone.x.toFixed(3)},${imported.tone.z.toFixed(3)}`);
  assert.ok(imported.report.some((entry) => entry.code === 'mmd-toon-imported'));
  assert.equal(convert(true, { ramp: { importMmdRamp: true } }).tone.w, 0, 'shared toon01–10 presets are not authored');
});

// ---------------------------------------------------------------- lights
check('scene lights: probes join the sky ambient; the marked main light wins', () => {
  const scene = new THREE.Scene();
  const probe = new THREE.LightProbe();
  probe.sh.coefficients[0].set(0.1, 0.3, 1.0);
  probe.intensity = 2;
  const bright = new THREE.DirectionalLight(0xffffff, 8);
  bright.position.set(5, 5, 0);
  const marked = new THREE.DirectionalLight(0xffaa66, 1);
  marked.position.set(0, 5, 5);
  marked.userData.toonMainLight = true;
  const point = new THREE.PointLight(0xff0000, 3, 4, 2);
  point.position.set(0, 1, 1);
  scene.add(probe, new THREE.AmbientLight(0xffffff, 0.1), bright, marked, point);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 3);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld();
  assert.equal(findToonMainLight(scene), marked);
  collectToonSceneLights(scene, camera);
  const ambient = toonSceneLights.ambientLightColor.value;
  assert.ok(Math.abs(ambient.b - (0.886227 * 2 + 0.1)) < 1e-3 && ambient.b > ambient.r * 5, `probe ambient ${ambient.toArray().map((v) => v.toFixed(3))}`);
  assert.equal(toonSceneLights.hasMainLight.value, 1);
  assert.ok(toonSceneLights.mainLightDirectionWorld.value.distanceTo(new THREE.Vector3(0, 1, 1).normalize()) < 1e-6);
  assert.equal(toonSceneLights.pointLightCount.value, 1);
  assert.equal(toonSceneLights.pointLightParams.array[0].x, 4);
  assert.equal(syncToonSceneLights(scene, camera, { info: { render: { calls: 7 } } }), true);
  assert.equal(syncToonSceneLights(scene, camera, { info: { render: { calls: 7 } } }), false, 'one collection per render call');
});

check('light settings reach the material and retune live', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ name: 'Cloth' }));
  root.add(mesh);
  applyToonShader(root, { autoRoles: { mode: 'off' }, preset: 'call_me_sensei' });
  assert.ok(uniformOf(mesh.material, 'sunTint') < 1, 'product preset softens the sun hue');
  assert.ok(uniformOf(mesh.material, 'shadeSkyTint') > 0);
  applyToonSettingsToMaterial(root, createToonSettings({ autoRoles: { mode: 'off' }, light: { maxSunElevation: 60, shadeSkyTint: 0, sunTint: 1 } }));
  assert.equal(uniformOf(mesh.material, 'sunTint'), 1);
  assert.equal(uniformOf(mesh.material, 'shadeSkyTint'), 0);
  assert.ok(near(uniformOf(mesh.material, 'maxSunElevationSin'), Math.sin(Math.PI / 3)));
});

// ---------------------------------------------------------------- debug views
check('debug views resolve by name and alias and are a uniform write', () => {
  assert.equal(Object.keys(TOON_DEBUG_OUTPUT_MODES).length, 22);
  for (const name of Object.keys(TOON_DEBUG_OUTPUT_MODES)) assert.ok(TOON_DEBUG_OUTPUT_LABELS[name], name);
  assert.equal(resolveToonDebugOutputMode('band').name, 'litAmount');
  assert.equal(resolveToonDebugOutputMode('self-shadow').name, 'characterShadow');
  assert.equal(resolveToonDebugOutputMode('Face Map').name, 'faceMap');
  assert.equal(resolveToonDebugOutputMode(TOON_DEBUG_OUTPUT_MODES.rim).name, 'rim');
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ name: 'Cloth' }));
  root.add(mesh);
  applyToonShader(root, { autoRoles: { mode: 'off' } });
  const material = mesh.material;
  const version = material.version;
  setToonDebugOutput(root, 'shadowColor');
  assert.equal(uniformOf(material, 'debugMode'), TOON_DEBUG_OUTPUT_MODES.shadowColor);
  assert.equal(material.version, version, 'no recompile');
});

// ---------------------------------------------------------------- render passes
check('character render passes: API, layer and state binding', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, getDrawingBufferSize: (target) => target.set(64, 64) };
  const passes = createCharacterRenderPasses({ camera, renderer, scene });
  for (const name of ['registerCharacterRoot', 'unregisterCharacterRoot', 'update', 'setSize', 'setCharacterMaskEnabled', 'dispose']) {
    assert.equal(typeof passes[name], 'function', name);
  }
  assert.equal(passes.TOON_CHARACTER_LAYER, TOON_CHARACTER_LAYER);
  assert.equal(passes.characterMaskTexture, null, 'no mask until enabled');
  const { head, root } = syntheticFace();
  scene.add(root);
  applyToonShader(root, { preset: 'call_me_sensei' });
  passes.registerCharacterRoot(root);
  assert.ok(head.layers.isEnabled(TOON_CHARACTER_LAYER), 'body meshes join the character layer');
  const hull = head.children.find((child) => child.userData.isToonOutline);
  assert.ok(!hull.layers.isEnabled(TOON_CHARACTER_LAYER), 'outline hulls do not');
  passes.setCharacterMaskEnabled(true);
  assert.ok(passes.characterMaskTexture?.isTexture);
  passes.unregisterCharacterRoot(root);
  assert.ok(!head.layers.isEnabled(TOON_CHARACTER_LAYER));
  passes.dispose();
});

process.stdout.write(`\ncharacter toon shading: ${checks} checks passed\n`);
