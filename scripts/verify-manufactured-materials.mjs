import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  analyzeManufacturedAsset,
  applyEnvironmentShader,
  applyManufacturedMaterialManifest,
  classifyManufacturedMaterial,
  collectManufacturedMirrorMeshes,
  createEnvironmentPresetDocument,
  createManufacturedMaterialClassification,
  resolveEnvironmentPreset,
  resolveManufacturedMaterialLook,
  validateEnvironmentPresetDocument,
} from '../src/environment/index.js';
import {
  MANUFACTURED_LOCAL_TEST_ASSETS,
  MANUFACTURED_PUBLIC_SAMPLES,
} from '../labs/manufactured-material-lab/previewAssets.js';
import {
  ManufacturedStyleLabelingError,
  applyManufacturedStyleTargetLabelProposal,
  proposeManufacturedStyleTargetLabel,
  readStyleTargetLabel,
} from '../src/styles/index.js';

function createTestAsset() {
  const root = new THREE.Group();
  root.name = 'ClocktowerBuilding';
  const metal = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.8,
    name: 'M_PaintedSteel',
    roughness: 0.42,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    name: 'M_WindowGlass',
    roughness: 0.12,
    transmission: 0.85,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(), metal);
  body.name = 'PrimaryFrame';
  const window = new THREE.Mesh(new THREE.PlaneGeometry(), glass);
  window.name = 'Window';
  root.add(body, window);
  return { body, glass, metal, root, window };
}

const inferred = createTestAsset();
assert.equal(classifyManufacturedMaterial(inferred.body, inferred.metal).baseMaterial, 'metal');
assert.equal(classifyManufacturedMaterial(inferred.window, inferred.glass).renderMode, 'transmissive');

const labelProposal = proposeManufacturedStyleTargetLabel(inferred.root, {
  assetId: 'fixture:clocktower-a',
});
assert.equal(labelProposal.ready, true, JSON.stringify(labelProposal.issues));
assert.equal(labelProposal.summary.autoResolvedMaterials, 2);
assert.deepEqual(
  labelProposal.entries.map(({ materialId }) => materialId),
  ['M_PaintedSteel', 'M_WindowGlass'],
);
applyManufacturedStyleTargetLabelProposal(inferred.root, labelProposal);
assert.equal(readStyleTargetLabel(inferred.root).domain, 'manufactured.surface');
assert.equal(inferred.metal.userData.toonlabMaterialId, 'M_PaintedSteel');
assert.equal(inferred.glass.userData.toonlabMaterialId, 'M_WindowGlass');

const unresolvedRoot = new THREE.Group();
const unresolvedMaterial = new THREE.MeshStandardMaterial({ name: '' });
const unresolvedMesh = new THREE.Mesh(new THREE.BoxGeometry(), unresolvedMaterial);
unresolvedRoot.add(unresolvedMesh);
const unresolvedProposal = proposeManufacturedStyleTargetLabel(unresolvedRoot, {
  assetId: 'fixture:unresolved',
});
assert.equal(unresolvedProposal.ready, false);
assert.equal(unresolvedProposal.issues[0].code, 'generic-material-fallback');
assert.throws(
  () => applyManufacturedStyleTargetLabelProposal(unresolvedRoot, unresolvedProposal),
  ManufacturedStyleLabelingError,
);
assert.equal(readStyleTargetLabel(unresolvedRoot), null, 'blocked proposals must not mutate the root');
assert.equal(unresolvedMaterial.userData.toonlabMaterialId, undefined);
unresolvedMesh.geometry.dispose();
unresolvedMaterial.dispose();

const lampRoot = new THREE.Group();
lampRoot.name = 'StreetLamp';
const lampMetal = new THREE.MeshStandardMaterial({
  metalness: 0.82,
  name: 'PaintedMetalBody',
  roughness: 0.48,
});
const lampBody = new THREE.Mesh(new THREE.BoxGeometry(), lampMetal);
lampBody.name = 'MainPost';
lampRoot.add(lampBody);
const lampClassification = classifyManufacturedMaterial(lampBody, lampMetal);
assert.equal(lampClassification.baseMaterial, 'metal');
assert.equal(lampClassification.contentFlags.includes('emissive'), false,
  'a lamp ancestor must not make every descendant material emissive');
assert.notEqual(lampClassification.structuralRole, 'lightEmitter');
lampBody.geometry.dispose();
lampMetal.dispose();

const rustyMetal = new THREE.MeshStandardMaterial({
  metalness: 0.9,
  name: 'Bicycle_Rusty',
  roughness: 0.82,
});
const rustyMesh = new THREE.Mesh(new THREE.BoxGeometry(), rustyMetal);
assert.equal(
  classifyManufacturedMaterial(rustyMesh, rustyMetal).finish,
  'raw',
  'Oxidized metal without an explicit coating must not become red paint.',
);
const rustyPaintedMetal = new THREE.MeshStandardMaterial({
  metalness: 0.9,
  name: 'PaintedSteel_Rusted',
  roughness: 0.82,
});
const rustyPaintedMesh = new THREE.Mesh(
  new THREE.BoxGeometry(),
  rustyPaintedMetal,
);
assert.equal(
  classifyManufacturedMaterial(rustyPaintedMesh, rustyPaintedMetal).finish,
  'painted',
  'An explicit painted/coated identity remains authoritative over condition.',
);

const audit = analyzeManufacturedAsset(inferred.root);
assert.equal(audit.objectClass, 'buildingExterior');
assert.equal(audit.summary.materialUseCount, 2);
assert.equal(audit.summary.fallbackCount, 0);

const reflectionAsset = createTestAsset();
reflectionAsset.glass.userData.urbanMaterial =
  createManufacturedMaterialClassification({
    baseMaterial: 'glass',
    finish: 'mirror',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  });
assert.deepEqual(
  collectManufacturedMirrorMeshes(reflectionAsset.root),
  [reflectionAsset.window],
);

const manifest = {
  type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  version: 1,
  assetId: 'clocktower-a',
  objectClass: 'buildingExterior',
  assignments: [
    {
      selector: { materialName: 'M_PaintedSteel' },
      classification: {
        version: 1,
        baseMaterial: 'metal',
        finish: 'painted',
        renderMode: 'opaque',
        structuralRole: 'primaryMass',
        contentFlags: [],
      },
    },
  ],
};
const manifestResult = applyManufacturedMaterialManifest(inferred.root, manifest);
assert.equal(manifestResult.appliedAssignmentCount, 1);
assert.equal(inferred.metal.userData.urbanMaterial.baseMaterial, 'metal');
assert.equal(inferred.root.userData.toonlabAssetId, 'clocktower-a');
assert.equal(classifyManufacturedMaterial(inferred.body, inferred.metal).classificationSource, 'manifest');

const classification = createManufacturedMaterialClassification({
  baseMaterial: 'metal',
  contentFlags: ['graphic'],
  finish: 'painted',
  renderMode: 'opaque',
  structuralRole: 'primaryMass',
});
const look = {
  version: 1,
  default: { parameters: { specularStrength: 0.1 } },
  baseMaterials: { metal: { parameters: { specularStrength: 0.2 } } },
  finishes: { painted: { parameters: { specularStrength: 0.3 } } },
  contentFlags: { graphic: { parameters: { specularStrength: 0.4 } } },
  objectClasses: { buildingExterior: { parameters: { specularStrength: 0.5 } } },
  assets: { 'clocktower-a': { parameters: { specularStrength: 0.6 } } },
};
const resolved = resolveManufacturedMaterialLook(look, {
  assetId: 'clocktower-a',
  classification,
  objectClass: 'buildingExterior',
});
assert.equal(resolved.parameters.specularStrength, 0.6);
assert.deepEqual(resolved.appliedProfiles, [
  'default',
  'baseMaterials.metal',
  'finishes.painted',
  'contentFlags.graphic',
  'objectClasses.buildingExterior',
  'assets.clocktower-a',
]);

const converted = createTestAsset();
converted.metal.userData.urbanMaterial = classification;
const conversion = await applyEnvironmentShader(converted.root, {
  assetId: 'clocktower-a',
  bakeVertexAo: false,
  materialLook: look,
  objectClass: 'buildingExterior',
});
assert.equal(conversion.manufacturedAssetId, 'clocktower-a');
assert.equal(converted.body.material.userData.urbanMaterial.baseMaterial, 'metal');
assert.ok(converted.body.material.userData.manufacturedAppliedProfiles.includes('assets.clocktower-a'));
assert.equal(converted.body.material.uniforms.specularStrength.value, 0.6);

const preset = resolveEnvironmentPreset('call_me_sensei');
assert.ok(preset.materialLook.baseMaterials.metal);
const presetApplied = createTestAsset();
const presetApplication = await applyEnvironmentShader(presetApplied.root, {
  bakeVertexAo: false,
  preset: 'call_me_sensei',
  scenario: 'exteriorDay',
  settings: { parameters: { exposure: 0.9, shadowLift: 0.5 } },
  parameters: { exposure: 1.12 },
});
assert.equal(presetApplication.preset, 'call_me_sensei');
assert.equal(presetApplication.scenario, 'exteriorDay');
assert.equal(presetApplied.body.material.uniforms.exposure.value, 1.12);
assert.equal(presetApplied.body.material.uniforms.ambientStrength.value, 0.38);
assert.equal(presetApplied.body.material.uniforms.shadowLift.value, 0.5);
const document = createEnvironmentPresetDocument('call_me_sensei');
assert.equal(document.schemaVersion, 3);
assert.ok(document.preset.materialLook.objectClasses.buildingExterior);
const validated = validateEnvironmentPresetDocument(document);
assert.equal(validated.ok, true, validated.errors.join(' '));
assert.ok(validated.value.materialLook.contentFlags.graphic);

assert.equal(
  MANUFACTURED_LOCAL_TEST_ASSETS.length,
  9,
  'The private manufactured-material regression grid must retain all nine fixtures.',
);
assert.deepEqual(
  MANUFACTURED_PUBLIC_SAMPLES.map((asset) => asset.id),
  ['wooden-crate-01'],
);

const labIndex = readFileSync(
  new URL('../manufactured-material-lab/index.html', import.meta.url),
  'utf8',
);
const labApp = readFileSync(
  new URL('../labs/manufactured-material-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const labRuntime = readFileSync(
  new URL('../examples/urban-prop-shader/main.js', import.meta.url),
  'utf8',
);
const sharedSurfaceLighting = readFileSync(
  new URL('../src/environment/toonLabSurfaceLighting.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(sharedSurfaceLighting, /toVar\(['"]toonLabRadiance['"]\)/,
  'shared TSL graphs must not reuse one global declaration symbol');
assert.match(labIndex, /labs\/manufactured-material-lab\/ui\/main\.jsx/);
assert.doesNotMatch(`${labIndex}\n${labApp}`, /Mint override/i);
assert.doesNotMatch(labApp, /Blue treatment checkpoint/i);
for (const sectionId of [
  'reconstruction',
  'surface',
  'lighting',
  'reflections',
  'line-work',
  'materials',
]) {
  assert.match(
    labApp,
    new RegExp(`id: '${sectionId}'|data-panel-view="${sectionId}"`),
    `Missing the ${sectionId} manufactured-material inspector section.`,
  );
}
assert.ok(
  existsSync(new URL('../manufactured-material-lab/legacy/index.html', import.meta.url)),
  'The previous one-off lab page must remain available as the legacy page.',
);
for (const asset of MANUFACTURED_LOCAL_TEST_ASSETS) {
  assert.match(
    labRuntime,
    new RegExp(`assets-local/labs/manufactured-material/test-cases/${asset.id}/model\\.glb`),
    `Missing organized local fixture path for ${asset.id}.`,
  );
}

const sampleManifest = JSON.parse(readFileSync(
  new URL('../public/manufactured-material-lab/cc0/manifest.json', import.meta.url),
  'utf8',
));
assert.equal(sampleManifest.assets[0].assetId, 'polyhaven/wooden_crate_01');
assert.equal(sampleManifest.assets[0].license, 'CC0-1.0');
assert.equal(
  sampleManifest.assets[0].callMeSenseiSupport,
  'mixed-atlas compatibility',
);
assert.ok(existsSync(new URL(
  '../public/manufactured-material-lab/cc0/polyhaven/wooden_crate_01/wooden_crate_01_1k.gltf',
  import.meta.url,
)));
for (const [relativePath, expected] of Object.entries(
  sampleManifest.assets[0].sourceFileHashesMd5,
)) {
  const bytes = readFileSync(new URL(
    `../public/manufactured-material-lab/cc0/${relativePath}`,
    import.meta.url,
  ));
  assert.equal(createHash('md5').update(bytes).digest('hex'), expected);
}

console.log('Manufactured material contract verified.');
