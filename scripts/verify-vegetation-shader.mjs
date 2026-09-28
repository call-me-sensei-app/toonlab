import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { getCurrentStack, setCurrentStack, stack } from 'three/tsl';
import { createGrassNodeMaterial } from '../src/shaders-tsl/grass.js';
import { createTreeLeafNodeMaterial } from '../src/shaders-tsl/tree-leaf.js';
import {
  createFlowerBloomNodeMaterial,
  createFlowerHeadBillboardNodeMaterial,
  createFlowerHeadNodeMaterial,
  createFlowerNodeMaterial,
  createFlowerStemNodeMaterial,
} from '../src/shaders-tsl/flower.js';
import { createWoodySurfaceNodeMaterial } from '../src/shaders-tsl/woody-surface.js';
import { createGrassSettings } from '../src/vegetation/stylizedGrass.js';
import {
  CALL_ME_SENSEI_GRASS_PROVENANCE,
  createCallMeSenseiGrassField,
} from '../src/vegetation/callMeSenseiGrass.js';
import { createFlowerSettings } from '../src/vegetation/stylizedFlowers.js';
import {
  createStylizedTreeSettings,
  deriveCanopyPalette,
} from '../src/vegetation/index.js';
import {
  FLOWER_SPECIES,
  createFlowerHeadGeometry,
} from '../src/vegetation/flowerSpecies.js';
import { BUILT_IN_TREE_PRESETS } from '../labs/tree-lab/treePresetStore.js';
import {
  DEFAULT_FLOWER_SHADER_PREVIEW_ASSET,
  DEFAULT_TREE_SHADER_PREVIEW_ASSET,
  getFlowerShaderPreviewAssets,
  getTreeShaderPreviewAssets,
  parseFlowerShaderPreviewAsset,
} from '../labs/vegetation-shader-lab/previewAssets.js';

import {
  BARK_SHADER,
  DEFAULT_VEGETATION_SHADER_SETTINGS,
  FOLIAGE_SHADER,
  GRASS_SHADER,
  VEGETATION_MATERIAL_ROLES,
  VEGETATION_SHADER_DOCUMENT_TYPE,
  VEGETATION_SHADER_FIELD_SCHEMA,
  VEGETATION_SHADER_UNIFORM_BY_FIELD,
  applyBarkShader,
  applyFlowerShader,
  applyFoliageShader,
  applyGrassShader,
  applyVegetationShader,
  applyVegetationShaderScope,
  createFlowerShaderProfilePresetDocument,
  createGrassShaderProfilePresetDocument,
  createGrassShaderSettings,
  createTreeShaderPresetDocument,
  createVegetationSharedShaderSettings,
  createVegetationShaderPresetDocument,
  createVegetationShaderSettings,
  FLOWER_SHADER_PROFILE_DOCUMENT_TYPE,
  FLOWER_SHADER_PROFILE_SCHEMA_VERSION,
  GRASS_SHADER_PROFILE_DOCUMENT_TYPE,
  GRASS_SHADER_PROFILE_SCHEMA_VERSION,
  getVegetationMaterialContract,
  getVegetationShaderPresetOptions,
  getVegetationShaderScopeExcludedFields,
  getVegetationShaderScopeFieldSchema,
  mergeVegetationSharedShaderSettings,
  parseFlowerShaderProfilePresetDocument,
  parseGrassShaderProfilePresetDocument,
  parseTreeShaderPresetDocument,
  migrateLegacyVegetationShaderDocuments,
  parseVegetationShaderPresetDocument,
  resolveVegetationShaderRoleSettings,
  serializeVegetationShaderPreset,
  tagVegetationMaterial,
  TREE_SHADER_DOCUMENT_TYPE,
  TREE_SHADER_SCHEMA_VERSION,
  VEGETATION_SHARED_SHADER_GROUP_IDS,
  VEGETATION_SHADER_SCOPES,
} from '../src/vegetation/vegetationShaders.js';

const defaults = createVegetationShaderSettings();
assert.deepEqual(defaults, DEFAULT_VEGETATION_SHADER_SETTINGS,
  'canonical settings must preserve the declared complete defaults');
assert.notEqual(defaults.lighting.shadowTint, DEFAULT_VEGETATION_SHADER_SETTINGS.lighting.shadowTint,
  'resolved color arrays must not mutate frozen defaults');

const clamped = createVegetationShaderSettings({
  bark: { bandCount: 99 },
  grass: { bandSoftness: -4 },
  lighting: { rimPower: 'not-a-number', shadowTint: [0.8, 0.1, 0.9] },
});
assert.equal(clamped.bark.bandCount, 6);
assert.equal(clamped.grass.bandSoftness, 0);
assert.equal(clamped.lighting.rimPower, defaults.lighting.rimPower);
assert.deepEqual(clamped.lighting.shadowTint, [0.8, 0.1, 0.9]);

for (const [groupId, fields] of Object.entries(VEGETATION_SHADER_FIELD_SCHEMA)) {
  for (const [key, field] of Object.entries(fields)) {
    assert.equal(field.uniform, VEGETATION_SHADER_UNIFORM_BY_FIELD[`${groupId}.${key}`]);
    assert.match(field.uniform, /^uStyle[A-Z]/,
      `${groupId}.${key} must publish a canonical style uniform`);
    assert.ok(field.roles.length > 0, `${groupId}.${key} must name its consuming roles`);
  }
}

const document = createVegetationShaderPresetDocument('purple-ip', {
  description: 'Purple vegetation uses material albedo with one shared treatment.',
  label: 'Purple IP',
  settings: { flower: { unlitPetalLift: 0.67 } },
});
const serialized = serializeVegetationShaderPreset(document);
const parsed = parseVegetationShaderPresetDocument(serialized);
assert.equal(parsed.ok, true, parsed.errors.join(' '));
assert.deepEqual(parsed.value, document);
assert.equal(parsed.value.type, VEGETATION_SHADER_DOCUMENT_TYPE);
assert.equal(parsed.value.settings.flower.unlitPetalLift, 0.67);

assert.deepEqual(Object.keys(VEGETATION_SHADER_SCOPES), ['tree', 'grass', 'flower']);
const treeDocument = createTreeShaderPresetDocument('tree-ip', {
  settings: { bark: { shadowFloor: 0.62 }, grass: { shadowFloor: 0.01 } },
});
const grassProfileDocument = createGrassShaderProfilePresetDocument('grass-ip', {
  settings: { grass: { shadowFloor: 0.59 }, bark: { shadowFloor: 0.01 } },
});
const flowerProfileDocument = createFlowerShaderProfilePresetDocument('flower-ip', {
  settings: { flower: { unlitPetalLift: 0.61 }, bark: { shadowFloor: 0.01 } },
});
assert.equal(treeDocument.type, TREE_SHADER_DOCUMENT_TYPE);
assert.equal(grassProfileDocument.type, GRASS_SHADER_PROFILE_DOCUMENT_TYPE);
assert.equal(flowerProfileDocument.type, FLOWER_SHADER_PROFILE_DOCUMENT_TYPE);
assert.equal(treeDocument.version, TREE_SHADER_SCHEMA_VERSION);
assert.equal(grassProfileDocument.version, GRASS_SHADER_PROFILE_SCHEMA_VERSION);
assert.equal(flowerProfileDocument.version, FLOWER_SHADER_PROFILE_SCHEMA_VERSION);
assert.equal(treeDocument.settings.bark.shadowFloor, 0.62);
assert.equal(treeDocument.settings.grass, undefined);
assert.equal(treeDocument.settings.foliage.mainColor, undefined);
assert.equal(treeDocument.settings.foliage.gradientColor, undefined);
assert.equal(treeDocument.settings.foliage.styleColorStrength, undefined);
assert.equal(grassProfileDocument.settings.grass.shadowFloor, 0.59);
assert.equal(grassProfileDocument.settings.bark, undefined);
assert.equal(flowerProfileDocument.settings.flower.unlitPetalLift, 0.61);
assert.equal(flowerProfileDocument.settings.bark, undefined);
assert.equal(parseTreeShaderPresetDocument(treeDocument).ok, true);
assert.equal(parseGrassShaderProfilePresetDocument(grassProfileDocument).ok, true);
assert.equal(parseFlowerShaderProfilePresetDocument(flowerProfileDocument).ok, true);
assert.deepEqual(
  getVegetationShaderScopeExcludedFields('tree').map(({ path }) => path).sort(),
  [
    'foliage.gradientColor',
    'foliage.mainColor',
    'foliage.styleColorStrength',
  ],
);
assert.deepEqual(
  getVegetationShaderScopeExcludedFields('flower').map(({ path }) => path).sort(),
  [
    'flower.textureTint',
    'flower.tintStrength',
    'foliage.gradientColor',
    'foliage.mainColor',
    'foliage.styleColorStrength',
    'stem.color',
    'stem.colorStrength',
  ],
);
const migratedTreeV1 = parseTreeShaderPresetDocument({
  ...treeDocument,
  settings: {
    ...treeDocument.settings,
    foliage: {
      ...treeDocument.settings.foliage,
      gradientColor: [0.2, 0.3, 0.4],
      mainColor: [0.1, 0.2, 0.3],
      styleColorStrength: 1,
    },
  },
  version: 1,
});
assert.equal(migratedTreeV1.ok, true);
assert.equal(migratedTreeV1.value.version, TREE_SHADER_SCHEMA_VERSION);
assert.equal(migratedTreeV1.value.settings.foliage.mainColor, undefined);
assert.equal(migratedTreeV1.warnings.length, 3);
assert.ok(migratedTreeV1.warnings.every((warning) => /does not serialize/.test(warning)));
const migratedFlowerV2 = parseFlowerShaderProfilePresetDocument({
  ...flowerProfileDocument,
  settings: {
    ...flowerProfileDocument.settings,
    flower: {
      ...flowerProfileDocument.settings.flower,
      textureTint: [1, 0.2, 0.4],
      tintStrength: 0.8,
    },
    foliage: {
      ...flowerProfileDocument.settings.foliage,
      gradientColor: [0.2, 0.4, 0.1],
      mainColor: [0.1, 0.3, 0.05],
      styleColorStrength: 1,
    },
    stem: {
      ...flowerProfileDocument.settings.stem,
      color: [0.1, 0.4, 0.1],
      colorStrength: 1,
    },
  },
  version: 2,
});
assert.equal(migratedFlowerV2.ok, true);
assert.equal(migratedFlowerV2.value.version, FLOWER_SHADER_PROFILE_SCHEMA_VERSION);
assert.equal(migratedFlowerV2.value.settings.flower.textureTint, undefined);
assert.equal(migratedFlowerV2.value.settings.stem.color, undefined);
assert.equal(migratedFlowerV2.warnings.length, 7);
assert.ok(migratedFlowerV2.warnings.every((warning) => /does not serialize/.test(warning)));

const grassSchemaFields = Object.values(
  getVegetationShaderScopeFieldSchema('grass'),
).flatMap((group) => Object.values(group).map(({ id }) => id));
assert.equal(grassSchemaFields.length, 41);
const treeV2SchemaFields = Object.values(
  getVegetationShaderScopeFieldSchema('tree'),
).flatMap((group) => Object.values(group).map(({ id }) => id));
assert.equal(treeV2SchemaFields.length, 51);
assert.equal(treeV2SchemaFields.includes('foliage.mainColor'), false);
assert.equal(treeV2SchemaFields.includes('foliage.gradientColor'), false);
assert.equal(treeV2SchemaFields.includes('foliage.styleColorStrength'), false);
const flowerV3SchemaFields = Object.values(
  getVegetationShaderScopeFieldSchema('flower'),
).flatMap((group) => Object.values(group).map(({ id }) => id));
assert.equal(flowerV3SchemaFields.length, 61);
for (const excludedField of [
  'foliage.mainColor',
  'foliage.gradientColor',
  'foliage.styleColorStrength',
  'flower.textureTint',
  'flower.tintStrength',
  'stem.color',
  'stem.colorStrength',
]) {
  assert.equal(flowerV3SchemaFields.includes(excludedField), false, excludedField);
}
assert.equal(CALL_ME_SENSEI_GRASS_PROVENANCE.referenceGeometryUsed, false);
assert.equal(CALL_ME_SENSEI_GRASS_PROVENANCE.mediaDependencies.length, 0);
const firstPartyMeadow = await createCallMeSenseiGrassField({
  groundAdoptStrength: 1,
  groundField: true,
  placements: [
    { x: -2, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
  ],
});
assert.equal(firstPartyMeadow.userData.callMeSenseiGrass.firstParty, true);
assert.equal(firstPartyMeadow.userData.callMeSenseiGrass.procedural, true);
assert.equal(firstPartyMeadow.settings.groundAdoptStrength, 1);
assert.equal(firstPartyMeadow.instanceCount, 3);
const firstPartyMeadowReport = applyVegetationShaderScope(
  firstPartyMeadow,
  'grass',
  { preset: 'call_me_sensei' },
);
assert.equal(firstPartyMeadowReport.matched, 3);
assert.equal(firstPartyMeadowReport.applied, 3);
assert.equal(firstPartyMeadowReport.unsupported.length, 0);
firstPartyMeadow.dispose();

const flowerPreviewAssets = getFlowerShaderPreviewAssets();
assert.equal(flowerPreviewAssets[0], DEFAULT_FLOWER_SHADER_PREVIEW_ASSET);
assert.deepEqual(
  flowerPreviewAssets.map(({ recipe }) => recipe.type),
  ['flower', 'flower', 'flower'],
);
assert.ok(flowerPreviewAssets.every(({ kind }) => kind === 'procedural'));
const treePreviewAssets = getTreeShaderPreviewAssets();
assert.equal(treePreviewAssets[0], DEFAULT_TREE_SHADER_PREVIEW_ASSET);
assert.ok(treePreviewAssets.every(({ kind }) => kind === 'procedural'));
const importedFlowerPreview = parseFlowerShaderPreviewAsset(
  JSON.stringify(flowerPreviewAssets[1].recipe),
);
assert.equal(importedFlowerPreview.ok, true);
assert.equal(importedFlowerPreview.value.recipe.type, 'flower');
const rejectedTreePreview = parseFlowerShaderPreviewAsset({
  ...flowerPreviewAssets[1].recipe,
  type: 'tree',
});
assert.equal(rejectedTreePreview.ok, false);
for (const species of FLOWER_SPECIES) {
  const geometry = createFlowerHeadGeometry({ species: species.id });
  const positions = geometry.getAttribute('position');
  assert.ok(positions?.count > 0, `${species.id} flower head has no positions`);
  assert.ok(
    Array.from(positions.array).every(Number.isFinite),
    `${species.id} flower head contains non-finite positions`,
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  assert.ok(
    geometry.boundingBox.min.toArray().every(Number.isFinite)
      && geometry.boundingBox.max.toArray().every(Number.isFinite)
      && Number.isFinite(geometry.boundingSphere.radius),
    `${species.id} flower head has non-finite bounds`,
  );
  geometry.dispose();
}

const sharedBase = createVegetationSharedShaderSettings({
  preset: 'call_me_sensei',
  lighting: { rimStrength: 0.73 },
});
assert.deepEqual(Object.keys(sharedBase), VEGETATION_SHARED_SHADER_GROUP_IDS);
const mergedTree = mergeVegetationSharedShaderSettings(
  'tree',
  { lighting: { rimStrength: 0.01 }, bark: { shadowFloor: 0.62 } },
  sharedBase,
);
assert.equal(mergedTree.lighting.rimStrength, 0.73,
  'the shared vegetation base must win over a scope document snapshot');
assert.equal(mergedTree.bark.shadowFloor, 0.62);

const warnings = parseVegetationShaderPresetDocument({
  ...document,
  settings: { ...document.settings, mystery: { x: 1 }, grass: { ...document.settings.grass, nope: 2 } },
});
assert.equal(warnings.ok, true);
assert.equal(warnings.warnings.length, 2);
const future = parseVegetationShaderPresetDocument({ ...document, version: 999 });
assert.equal(future.ok, false);
assert.match(future.errors.join(' '), /newer than supported/);

const presetIds = new Set(getVegetationShaderPresetOptions().map((entry) => entry.id));
assert.ok(presetIds.has('default'));
assert.ok(presetIds.has('call_me_sensei'));
const callMeSenseiSettings = createVegetationShaderSettings('call_me_sensei');
assert.equal(callMeSenseiSettings.flower.unlitPetalLift, 0.4);
assert.equal(callMeSenseiSettings.foliage.hueVariation, 0.025,
  'the signature profile must preserve species hue instead of creating rainbow cards');
assert.equal(callMeSenseiSettings.foliage.emissiveStrength, 0,
  'canonical foliage must not use emission to imitate retained-scene exposure');
assert.equal(callMeSenseiSettings.bark.emissiveStrength, 0,
  'canonical bark must remain light-responsive');

const authoredBark = createStylizedTreeSettings({ trunkColor: '#805b3d' });
const expectedBarkSrgb = [0x80 / 255, 0x5b / 255, 0x3d / 255];
authoredBark.tree.trunkColor.forEach((channel, index) => {
  assert.ok(Math.abs(channel - expectedBarkSrgb[index]) < 1e-4,
    'tree recipe colors must remain authored sRGB values');
});
const authoredBarkFromColor = createStylizedTreeSettings({
  trunkColor: new THREE.Color('#805b3d'),
});
authoredBarkFromColor.tree.trunkColor.forEach((channel, index) => {
  assert.ok(Math.abs(channel - expectedBarkSrgb[index]) < 1e-4,
    'THREE.Color recipe values must not be decoded from sRGB twice');
});

const representativeTreeRecipes = BUILT_IN_TREE_PRESETS.filter(({ id }) =>
  id === 'example_branching'
  || id === 'species_oak_small'
  || id === 'species_pine_small'
  || id === 'example_bush');
assert.equal(representativeTreeRecipes.length, 4);
for (const recipe of representativeTreeRecipes) {
  assert.ok(recipe.options.canopyColor,
    `${recipe.id} must carry an asset-owned botanical palette`);
  assert.ok(recipe.options.trunkColor,
    `${recipe.id} must carry an asset-owned woody palette`);
}
const verificationCanopy = deriveCanopyPalette('#4b944f');
const verificationCanopyLuma = (color) =>
  color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
assert.ok(verificationCanopyLuma(verificationCanopy.shadow)
  < verificationCanopyLuma(verificationCanopy.lit));
assert.ok(verificationCanopyLuma(verificationCanopy.lit)
  < verificationCanopyLuma(verificationCanopy.crown));

const grassUniform = VEGETATION_SHADER_UNIFORM_BY_FIELD['grass.backlitStrength'];
const tintUniform = VEGETATION_SHADER_UNIFORM_BY_FIELD['lighting.shadowTint'];
const taggedGrass = tagVegetationMaterial(new THREE.MeshBasicMaterial(), {
  role: VEGETATION_MATERIAL_ROLES.grassBlade,
  variant: 'procedural',
});
taggedGrass.name = 'VerificationGrass';
taggedGrass.uniforms = {
  [grassUniform]: { value: 0 },
  [tintUniform]: { value: new THREE.Color() },
};
const untagged = new THREE.MeshBasicMaterial();
untagged.uniforms = { [grassUniform]: { value: 123 } };
const root = new THREE.Group();
root.add(
  new THREE.Mesh(new THREE.PlaneGeometry(1, 1), taggedGrass),
  new THREE.Mesh(new THREE.PlaneGeometry(1, 1), untagged),
);
const report = applyVegetationShader(root, {
  grass: { backlitStrength: 0.91 },
  lighting: { shadowTint: [0.7, 0.2, 0.9] },
});
assert.equal(report.visited, 2);
assert.equal(report.matched, 1);
assert.equal(report.applied, 1);
assert.equal(report.skipped, 1);
assert.equal(report.roles.grassBlade.matched, 1);
assert.deepEqual(report.roles.grassBlade.variants, ['procedural']);
assert.deepEqual(getVegetationMaterialContract(taggedGrass).roles, ['grassBlade']);
assert.equal(taggedGrass.uniforms[grassUniform].value, 0.91);
assert.deepEqual(taggedGrass.uniforms[tintUniform].value.toArray(),
  new THREE.Color().setRGB(0.7, 0.2, 0.9, THREE.SRGBColorSpace).toArray());
assert.equal(untagged.uniforms[grassUniform].value, 123);
assert.ok(report.unsupported.some((entry) => entry.field === 'grass.bandThreshold'));
const wrongScopeReport = applyVegetationShaderScope(root, 'tree', treeDocument.settings);
assert.equal(wrongScopeReport.matched, 0);
assert.ok(wrongScopeReport.warnings.some((warning) => /outside this shader profile/.test(warning)));
const grassScopeReport = applyVegetationShaderScope(
  root,
  'grass',
  grassProfileDocument.settings,
);
assert.equal(grassScopeReport.matched, 1);
assert.equal(taggedGrass.uniforms[grassUniform].value, defaults.grass.backlitStrength);

const roleSlice = resolveVegetationShaderRoleSettings(VEGETATION_MATERIAL_ROLES.flowerCenter);
assert.ok(roleSlice.flower.centerLightResponse !== undefined);
assert.equal(roleSlice.flower.unlitPetalLift, undefined);
assert.equal(roleSlice.thinSurface, undefined);
const petalRoleSlice = resolveVegetationShaderRoleSettings(VEGETATION_MATERIAL_ROLES.flowerPetal);
assert.ok(petalRoleSlice.thinSurface.diffuseWrap !== undefined);
assert.equal(petalRoleSlice.flower.centerLightResponse, undefined);
assert.throws(() => tagVegetationMaterial(new THREE.MeshBasicMaterial(), { role: 'tree' }), /Unknown/);

const compositeContractMaterial = tagVegetationMaterial(new THREE.MeshBasicMaterial(), {
  role: VEGETATION_MATERIAL_ROLES.flowerPetal,
  roles: [VEGETATION_MATERIAL_ROLES.flowerCenter],
  variant: 'mesh',
});
assert.deepEqual(getVegetationMaterialContract(compositeContractMaterial), {
  role: VEGETATION_MATERIAL_ROLES.flowerPetal,
  roles: [VEGETATION_MATERIAL_ROLES.flowerPetal, VEGETATION_MATERIAL_ROLES.flowerCenter],
  variant: 'mesh',
  version: 1,
});

function nodeGraphContains(roots, target) {
  const stack = [...roots];
  const visited = new WeakSet();
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === target) return true;
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    for (const key of Object.keys(value)) {
      let child;
      try { child = value[key]; } catch { continue; }
      if (Array.isArray(child)) stack.push(...child);
      else if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function materialNodeRoots(material) {
  const roots = [
    material.alphaTestNode,
    material.castShadowPositionNode,
    material.colorNode,
    material.fragmentNode,
    material.maskNode,
    material.positionNode,
    material.vertexNode,
  ].filter(Boolean);
  return roots.flatMap((rootNode) => {
    const shaderCall = rootNode?.isShaderCallNodeInternal
      ? rootNode
      : (rootNode?.node?.isShaderCallNodeInternal ? rootNode.node : null);
    if (!shaderCall || shaderCall.rawInputs.length > 0) return [rootNode];
    const previousStack = getCurrentStack();
    const materializedStack = stack();
    let outputNode = null;
    try {
      setCurrentStack(materializedStack);
      outputNode = shaderCall.shaderNode.jsFunc();
    } finally {
      setCurrentStack(previousStack);
    }
    materializedStack.outputNode = outputNode;
    return [rootNode, materializedStack, outputNode].filter(Boolean);
  });
}

function requiredFieldsForMaterial(material) {
  const contract = getVegetationMaterialContract(material);
  return Object.values(VEGETATION_SHADER_FIELD_SCHEMA).flatMap((fields) =>
    Object.values(fields).filter((field) =>
      field.roles.some((role) => contract.roles.includes(role))));
}

// Every shipped material variant must consume every canonical field required
// by its semantic roles. Identity traversal proves the uniform is in the TSL
// graph, rather than merely present in material.uniforms as a decorative slot.
const verificationTexture = new THREE.Texture();
verificationTexture.userData.toonlabFlower = { centerRadius: 0.1 };
const flowerMaterials = [
  createFlowerNodeMaterial(createFlowerSettings(), defaults),
  createFlowerHeadNodeMaterial({ map: verificationTexture, vegetationShader: defaults }),
  createFlowerHeadBillboardNodeMaterial({ map: verificationTexture, vegetationShader: defaults }),
  createFlowerBloomNodeMaterial({ vegetationShader: defaults }),
];
const stemMaterial = createFlowerStemNodeMaterial({ vegetationShader: defaults });
const grassMaterial = createGrassNodeMaterial(createGrassSettings(), defaults);
const treeLeafMaterial = createTreeLeafNodeMaterial(
  { leafMap: verificationTexture },
  defaults,
);
const treeLeafDepthMaterial = treeLeafMaterial.userData.createDepthColorVariant();
assert.equal(treeLeafMaterial.side, THREE.DoubleSide,
  'view-facing leaf cards must remain visible from either side');
assert.equal(treeLeafMaterial.shadowSide, THREE.DoubleSide,
  'light-facing leaf cards must not be culled when Three reverses ordinary shadow sides');
assert.equal(treeLeafDepthMaterial.side, THREE.DoubleSide);
assert.ok(treeLeafMaterial.castShadowPositionNode,
  'procedural leaf cards need a billboard-aware native shadow position');
assert.ok(nodeGraphContains(
  [treeLeafMaterial.maskNode],
  treeLeafMaterial.uniforms.uAlphaCutoff,
), 'procedural leaf shadows must use the same alpha cutout as visible leaves');
const shippedMaterials = [
  grassMaterial,
  treeLeafMaterial,
  ...flowerMaterials,
  stemMaterial,
  createWoodySurfaceNodeMaterial({ vegetationShader: defaults }),
];
for (const material of flowerMaterials) {
  assert.deepEqual(getVegetationMaterialContract(material).roles, [
    VEGETATION_MATERIAL_ROLES.flowerPetal,
    VEGETATION_MATERIAL_ROLES.flowerCenter,
  ], `${material.name} must declare both semantic flower-head roles`);
}
assert.equal(stemMaterial.uniforms.uStyleThinSurfaceDiffuseWrap, undefined,
  'herbaceous stems must not silently consume the thin-surface profile');
for (const material of shippedMaterials) {
  const roots = materialNodeRoots(material);
  for (const field of requiredFieldsForMaterial(material)) {
    const uniformNode = material.uniforms[field.uniform];
    assert.ok(uniformNode, `${material.name} is missing ${field.id}`);
    assert.ok(nodeGraphContains(roots, uniformNode),
      `${material.name} exposes ${field.id}, but its TSL graph never consumes it`);
  }
  if (material === grassMaterial) {
    assert.ok(nodeGraphContains(roots, material.uniforms.uShadowTint),
      'grass exposes material shadow tint, but its TSL graph never consumes it');
  }
}

for (const uniformName of ['uWetness', 'uSnowCover', 'uWindStrength', 'uSunDirection']) {
  assert.equal(Object.values(VEGETATION_SHADER_UNIFORM_BY_FIELD).includes(uniformName), false,
    `${uniformName} is world/instance state and must not enter the profile contract`);
}
const worldStateBeforeApply = shippedMaterials.map((material) => {
  if (material.uniforms.uWetness) material.uniforms.uWetness.value = 0.37;
  if (material.uniforms.uSnowCover) material.uniforms.uSnowCover.value = 0.61;
  if (material.uniforms.uSunIntensity) material.uniforms.uSunIntensity.value = 0.23;
  if (material.uniforms.uSkyIntensity) material.uniforms.uSkyIntensity.value = 0.41;
  return {
    snowCover: material.uniforms.uSnowCover?.value,
    skyIntensity: material.uniforms.uSkyIntensity?.value,
    sunIntensity: material.uniforms.uSunIntensity?.value,
    wetness: material.uniforms.uWetness?.value,
  };
});
const shippedReport = applyVegetationShader(shippedMaterials, clamped);
assert.equal(shippedReport.matched, shippedMaterials.length);
assert.equal(shippedReport.roles.flowerCenter.matched, flowerMaterials.length);
assert.equal(shippedReport.roles.flowerPetal.matched, flowerMaterials.length);
assert.deepEqual(shippedReport.unsupported, [],
  `shipped material contract gaps: ${JSON.stringify(shippedReport.unsupported)}`);
shippedMaterials.forEach((material, index) => {
  assert.equal(material.uniforms.uWetness?.value, worldStateBeforeApply[index].wetness,
    `${material.name} profile application changed scene wetness`);
  assert.equal(material.uniforms.uSnowCover?.value, worldStateBeforeApply[index].snowCover,
    `${material.name} profile application changed scene snow`);
  assert.equal(material.uniforms.uSunIntensity?.value, worldStateBeforeApply[index].sunIntensity,
    `${material.name} profile application changed current sun intensity`);
  assert.equal(material.uniforms.uSkyIntensity?.value, worldStateBeforeApply[index].skyIntensity,
    `${material.name} profile application changed current sky intensity`);
});

const flowerShaderSource = readFileSync(
  new URL('../src/shaders-tsl/flower.js', import.meta.url),
  'utf8',
);
const vegetationStyleSource = readFileSync(
  new URL('../src/shaders-tsl/chunks/vegetation-style.js', import.meta.url),
  'utf8',
);
const treeLeafShaderSource = readFileSync(
  new URL('../src/shaders-tsl/tree-leaf.js', import.meta.url),
  'utf8',
);
const woodySurfaceShaderSource = readFileSync(
  new URL('../src/shaders-tsl/woody-surface.js', import.meta.url),
  'utf8',
);
const callMeSenseiGrassSource = readFileSync(
  new URL('../src/vegetation/callMeSenseiGrass.js', import.meta.url),
  'utf8',
);
const vegetationLabSource = readFileSync(
  new URL('../labs/vegetation-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const vegetationLabAppSource = readFileSync(
  new URL('../labs/vegetation-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const vegetationLabStoreSource = readFileSync(
  new URL('../labs/vegetation-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
const vegetationPreviewSettingsSource = readFileSync(
  new URL('../labs/vegetation-shader-lab/ui/previewSettings.js', import.meta.url),
  'utf8',
);
const vegetationPreviewAssetsSource = readFileSync(
  new URL('../labs/vegetation-shader-lab/previewAssets.js', import.meta.url),
  'utf8',
);
const labelingDocs = readFileSync(
  new URL('../docs/generated-asset-labeling.md', import.meta.url),
  'utf8',
);
assert.match(callMeSenseiGrassSource, /independently authored ToonLab procedural recipe/);
assert.match(callMeSenseiGrassSource, /referenceGeometryUsed: false/);
assert.match(callMeSenseiGrassSource, /createCallMeSenseiGrassField/);
assert.match(vegetationStyleSource, /baseColor\.mul\(skyColor\)/,
  'vegetation sky fill and rim must remain albedo-relative');
assert.match(vegetationStyleSource, /baseColor\.mul\(sunColor\)/,
  'vegetation transmission must remain albedo-relative');
assert.match(treeLeafShaderSource, /bandShadowColor:\s*shadowColor/,
  'procedural foliage must route its asset-owned shadow palette through the canonical band');
assert.doesNotMatch(treeLeafShaderSource, /const litBand\s*=/,
  'procedural foliage must not apply a private lighting band before the shared shader');
assert.match(woodySurfaceShaderSource, /styledAlbedo\.mul\(u\.uSkyColor\)/,
  'woody sky fill and rim must remain albedo-relative');
assert.doesNotMatch(vegetationLabSource, /So\s*Stylized|assets-local/i);
assert.match(vegetationLabSource, /createLabRenderer/);
assert.match(vegetationLabSource, /createCallMeSenseiGrassField/);
assert.match(vegetationLabSource, /createEnvironmentGroundFieldPass/);
assert.match(vegetationLabSource, /MEADOW_GROUND_ZONES/);
assert.match(vegetationLabSource, /groundAdoptStrength: 1/);
assert.match(vegetationLabSource, /groundField: true/);
assert.match(vegetationLabSource, /flowerClearing: scope === 'flower'/);
assert.match(vegetationLabSource, /createPlantFromRecipe/);
assert.match(vegetationLabSource, /applyVegetationShaderScope/);
assert.match(vegetationLabSource, /canonical-vegetation-procedural/);
assert.match(vegetationLabSource, /sampleLabPreviewReferenceState/);
assert.match(vegetationLabSource, /ToonLab procedural vegetation preview/);
assert.match(vegetationLabSource, /view\.viewMode === 'isolate'/);
assert.doesNotMatch(vegetationLabAppSource, /So\s*Stylized|assets-local/i);
assert.match(vegetationLabAppSource, /ShaderPreviewAssetsModal/);
assert.match(vegetationLabAppSource, /Attached-leaf palette comes from the preview/);
assert.match(vegetationLabAppSource, /Petal and center colors come from the preview flower/);
assert.match(vegetationLabAppSource, /Stem base color comes from the preview flower/);
assert.match(vegetationLabAppSource, /Shared vegetation base/);
assert.match(vegetationLabAppSource, /Tree foliage/);
assert.match(vegetationLabAppSource, /Per-profile splitting\s+is not enabled/);
assert.match(vegetationLabStoreSource, /resolvedScope === 'grass'\s*\? 'ground_adoption_zones'/);
assert.match(vegetationLabStoreSource, /resolvedScope === 'flower' \? \{ tree: false \}/);
assert.match(vegetationPreviewSettingsSource, /id: 'natural_meadow'/);
assert.match(vegetationPreviewSettingsSource, /id: 'ground_adoption_zones'/);
assert.match(vegetationPreviewSettingsSource, /scenePreset: 'natural_meadow'/);
assert.match(vegetationPreviewAssetsSource, /DEFAULT_TREE_SHADER_PREVIEW_ASSET/);
assert.match(vegetationPreviewAssetsSource, /DEFAULT_FLOWER_SHADER_PREVIEW_ASSET/);
assert.doesNotMatch(vegetationPreviewAssetsSource, /kind:\s*'reference'|So\s*Stylized/i);
assert.match(vegetationPreviewAssetsSource, /BUILT_IN_TREE_PRESETS/);
assert.match(vegetationPreviewAssetsSource, /loadLocalTreePresets/);
assert.match(vegetationPreviewAssetsSource, /parseTreeShaderPreviewAsset/);
assert.match(vegetationPreviewAssetsSource, /parseFlowerShaderPreviewAsset/);
assert.match(labelingDocs, /tree\.root/);
assert.match(labelingDocs, /tree\.leaf/);
assert.match(labelingDocs, /woodySurface/);
assert.match(labelingDocs, /grassCoverage/);
assert.match(labelingDocs, /Actual grass blades growing from the rock/);
const stemShaderSource = flowerShaderSource.slice(
  flowerShaderSource.indexOf('export function createFlowerStemNodeMaterial'),
);
assert.match(stemShaderSource,
  /mul\(intervals\)\.add\(1e-4\)\)\.div\(intervals\)/,
  'stem band quantization must use bandCount - 1 intervals and remain <= 1');
assert.doesNotMatch(stemShaderSource, /uStyleThinSurface/,
  'stem shader graph must stay independent from thin-surface settings');

const noMatch = applyVegetationShader(new THREE.MeshBasicMaterial(), defaults);
assert.equal(noMatch.matched, 0);
assert.match(noMatch.warnings.join(' '), /No tagged vegetation materials/);

const legacyFoliage = FOLIAGE_SHADER.createDocument('foliage-ip', {
  label: 'Foliage IP',
  settings: { alphaCutoff: 0.22, backlitStrength: 0.62 },
});
const legacyGrass = GRASS_SHADER.createDocument('grass-ip', {
  label: 'Grass IP',
  settings: { pushRadius: 1.4, shadowTint: [0.2, 0.3, 0.8] },
});
const legacyBark = BARK_SHADER.createDocument('bark-ip', {
  label: 'Bark IP',
  settings: { bandCount: 5, shadowFloor: 0.5 },
});
const migrated = migrateLegacyVegetationShaderDocuments({
  bark: legacyBark,
  foliage: legacyFoliage,
  grass: legacyGrass,
}, { id: 'unified-ip', label: 'Unified IP' });
assert.equal(migrated.ok, true, migrated.errors.join(' '));
assert.equal(migrated.value.id, 'unified-ip');
assert.equal(migrated.value.settings.foliage.backlitStrength, 0.62);
assert.equal(migrated.value.settings.bark.bandCount, 5);
assert.deepEqual(migrated.value.settings.lighting.shadowTint, [0.2, 0.3, 0.8]);
assert.ok(migrated.warnings.some((warning) => warning.includes('alphaCutoff')));
assert.ok(migrated.warnings.some((warning) => warning.includes('pushRadius')));
assert.equal('alphaCutoff' in migrated.value.settings.foliage, false);
assert.equal('pushRadius' in migrated.value.settings.grass, false);

// Legacy return values and direct writes remain stable.
assert.deepEqual(createGrassShaderSettings(), {
  backlitStrength: 0.4,
  shadowStrength: 0.7,
  shadowTint: [0.36, 0.4, 0.58],
  cloudShadowStrength: 0.35,
  pushRadius: 0.6,
});
let appliedGrass = null;
const legacyGrassReturn = applyGrassShader({ applySettings(value) { appliedGrass = value; } },
  { backlitStrength: 0.8 });
assert.deepEqual(appliedGrass, legacyGrassReturn);

const foliageMaterial = new THREE.MeshBasicMaterial();
foliageMaterial.uniforms = {
  uAlphaCutoff: { value: 0 },
  uBacklitStrength: { value: 0 },
  uCloudShadowStrength: { value: 0 },
  uSceneShadowStrength: { value: 0 },
};
const foliageRoot = new THREE.Group();
foliageRoot.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), foliageMaterial));
assert.equal(applyFoliageShader(foliageRoot, { alphaCutoff: 0.28 }), 1);
assert.equal(foliageMaterial.uniforms.uAlphaCutoff.value, 0.28);

const flowerMaterial = new THREE.MeshBasicMaterial();
flowerMaterial.uniforms = { uUnlitLift: { value: 0 } };
const flowerRoot = new THREE.Group();
flowerRoot.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flowerMaterial));
assert.equal(applyFlowerShader(flowerRoot, { unlitPetalLift: 0.52 }), 1);
assert.equal(flowerMaterial.uniforms.uUnlitLift.value, 0.52);

const barkMaterial = new THREE.MeshToonMaterial();
const barkRoot = new THREE.Group();
barkRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), barkMaterial));
assert.equal(applyBarkShader(barkRoot, { bandCount: 4 }), 1);
assert.ok(barkMaterial.gradientMap?.isDataTexture);
barkMaterial.gradientMap.dispose();

root.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
foliageRoot.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
flowerRoot.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
barkRoot.traverse((object) => {
  object.geometry?.dispose?.();
  object.material?.dispose?.();
});
for (const material of shippedMaterials) material.dispose();
treeLeafDepthMaterial.dispose();
compositeContractMaterial.dispose();
verificationTexture.dispose();

console.log(`vegetation shader verifier passed (${Object.keys(VEGETATION_SHADER_UNIFORM_BY_FIELD).length} canonical fields)`);
