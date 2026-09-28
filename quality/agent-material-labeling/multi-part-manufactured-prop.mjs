import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { TOONLAB_VERSION } from '@call-me-sensei/toonlab';
import {
  analyzeManufacturedAsset,
  createManufacturedMaterialClassification,
} from '@call-me-sensei/toonlab/environment';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  StyleBundleApplicationError,
  applyStyleBundle,
  auditSceneStyleContract,
  collectStyleTargets,
  createStyleMaterialContract,
  createStyleTargetLabel,
  labelStyleTarget,
  serializeSceneStyleAudit,
} from '@call-me-sensei/toonlab/styles';

const OUTPUT_URL = new URL('./multi-part-manufactured-prop.result.json', import.meta.url);
const TARGET_ID = 'agent-fixture/camp-lantern-001';
const ASSET_ID = 'agent-authored:camp-lantern:v1';

const MATERIAL_DEFINITIONS = Object.freeze({
  LanternFrameMetal: Object.freeze({
    color: 0x31596b,
    metalness: 0.68,
    roughness: 0.42,
    classification: Object.freeze({
      baseMaterial: 'metal',
      finish: 'painted',
      renderMode: 'opaque',
      structuralRole: 'primaryMass',
      contentFlags: [],
    }),
  }),
  LanternLensGlass: Object.freeze({
    color: 0xffe7a8,
    metalness: 0,
    opacity: 0.58,
    roughness: 0.12,
    transparent: true,
    classification: Object.freeze({
      baseMaterial: 'glass',
      finish: 'polished',
      renderMode: 'transmissive',
      structuralRole: 'window',
      contentFlags: [],
    }),
  }),
  LanternHandleWood: Object.freeze({
    color: 0x8a5937,
    metalness: 0,
    roughness: 0.5,
    classification: Object.freeze({
      baseMaterial: 'wood',
      finish: 'varnished',
      renderMode: 'opaque',
      structuralRole: 'fastener',
      contentFlags: [],
    }),
  }),
  LanternEmitterCeramic: Object.freeze({
    color: 0xffd071,
    emissive: 0xff9d2e,
    emissiveIntensity: 1.4,
    metalness: 0,
    roughness: 0.28,
    classification: Object.freeze({
      baseMaterial: 'ceramic',
      finish: 'glazed',
      renderMode: 'opaque',
      structuralRole: 'lightEmitter',
      contentFlags: ['emissive'],
    }),
  }),
});

const PART_INVENTORY = Object.freeze([
  Object.freeze({ partId: 'lantern.base', materialId: 'LanternFrameMetal' }),
  Object.freeze({ partId: 'lantern.frame-post-left', materialId: 'LanternFrameMetal' }),
  Object.freeze({ partId: 'lantern.frame-post-right', materialId: 'LanternFrameMetal' }),
  Object.freeze({ partId: 'lantern.roof', materialId: 'LanternFrameMetal' }),
  Object.freeze({ partId: 'lantern.lens', materialId: 'LanternLensGlass' }),
  Object.freeze({ partId: 'lantern.handle-grip', materialId: 'LanternHandleWood' }),
  Object.freeze({ partId: 'lantern.emitter', materialId: 'LanternEmitterCeramic' }),
]);

class StrictScenePreflightError extends Error {
  constructor(report) {
    super('Strict ToonLab scene preflight rejected the asset before style mutation.');
    this.name = 'StrictScenePreflightError';
    this.report = report;
  }
}

function makeMaterial(materialId, definition) {
  const material = new THREE.MeshStandardMaterial({
    color: definition.color,
    emissive: definition.emissive ?? 0x000000,
    emissiveIntensity: definition.emissiveIntensity ?? 1,
    metalness: definition.metalness,
    opacity: definition.opacity ?? 1,
    roughness: definition.roughness,
    transparent: definition.transparent ?? false,
  });
  // Deliberately do not use material.name as a fallback. This proves the
  // fixture succeeds because the required public ToonLab ID is authored.
  material.name = '';
  material.userData.toonlabMaterialId = materialId;
  material.userData.urbanMaterial = createManufacturedMaterialClassification(
    definition.classification,
  );
  return material;
}

function addPart(root, partId, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = partId;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function createCampLantern() {
  const materials = Object.fromEntries(
    Object.entries(MATERIAL_DEFINITIONS).map(([materialId, definition]) => (
      [materialId, makeMaterial(materialId, definition)]
    )),
  );
  const root = new THREE.Group();
  root.name = 'agent-fixture/camp-lantern';
  root.userData.toonlabAssetId = ASSET_ID;
  root.userData.urbanObjectClass = 'fixture';

  addPart(root, 'lantern.base', new THREE.CylinderGeometry(0.54, 0.62, 0.2, 12),
    materials.LanternFrameMetal, [0, 0.1, 0]);
  addPart(root, 'lantern.frame-post-left', new THREE.BoxGeometry(0.09, 1.15, 0.09),
    materials.LanternFrameMetal, [-0.43, 0.73, 0]);
  addPart(root, 'lantern.frame-post-right', new THREE.BoxGeometry(0.09, 1.15, 0.09),
    materials.LanternFrameMetal, [0.43, 0.73, 0]);
  addPart(root, 'lantern.roof', new THREE.ConeGeometry(0.68, 0.38, 4),
    materials.LanternFrameMetal, [0, 1.48, 0], [0, Math.PI / 4, 0]);
  addPart(root, 'lantern.lens', new THREE.CylinderGeometry(0.38, 0.42, 0.92, 12, 1, true),
    materials.LanternLensGlass, [0, 0.76, 0]);
  addPart(root, 'lantern.handle-grip', new THREE.CylinderGeometry(0.075, 0.075, 0.82, 10),
    materials.LanternHandleWood, [0, 1.94, 0], [0, 0, Math.PI / 2]);
  addPart(root, 'lantern.emitter', new THREE.SphereGeometry(0.21, 12, 8),
    materials.LanternEmitterCeramic, [0, 0.78, 0]);

  const assignments = Object.fromEntries(
    Object.entries(MATERIAL_DEFINITIONS).map(([materialId, definition]) => [
      materialId,
      { roles: [definition.classification.structuralRole] },
    ]),
  );
  labelStyleTarget(root, createStyleTargetLabel('manufactured.surface', {
    assetId: ASSET_ID,
    collision: 'solid',
    materials: createStyleMaterialContract('manufactured.surface', { assignments }),
    targetId: TARGET_ID,
  }));

  const scene = new THREE.Scene();
  scene.name = 'agent-material-labeling-fixture';
  scene.add(root);
  return { materials, root, scene };
}

function materialState(material) {
  return {
    color: material.color?.getHexString() ?? null,
    emissive: material.emissive?.getHexString() ?? null,
    emissiveIntensity: material.emissiveIntensity ?? null,
    metalness: material.metalness ?? null,
    opacity: material.opacity ?? null,
    roughness: material.roughness ?? null,
    transparent: material.transparent ?? null,
    type: material.type,
    userData: stableValue(material.userData ?? {}),
    uuid: material.uuid,
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function fingerprint(root) {
  const meshes = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes.push({
      castShadow: object.castShadow,
      materials: (Array.isArray(object.material) ? object.material : [object.material])
        .map(materialState),
      name: object.name,
      receiveShadow: object.receiveShadow,
    });
  });
  return JSON.stringify(meshes);
}

function strictAudit(scene) {
  return auditSceneStyleContract(scene, {
    bundle: CALL_ME_SENSEI_STYLE_BUNDLE,
    mode: 'strict',
    rendererBackend: 'webgl',
  });
}

async function applyAfterStrictPreflight(scene) {
  const report = strictAudit(scene);
  if (!report.readyToApply) throw new StrictScenePreflightError(report);
  const discovery = collectStyleTargets(scene);
  assert.equal(discovery.ok, true, 'public target discovery must succeed');
  return applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
    mode: 'strict',
    targets: discovery.targets,
  });
}

function compactAudit(report) {
  return {
    issueCodes: report.issues.map(({ code }) => code),
    ok: report.ok,
    readyToApply: report.readyToApply,
    routeCount: report.summary.routeCount,
    targetCount: report.summary.targetCount,
    warningCount: report.summary.warningCount,
  };
}

async function run() {
  const { materials, root, scene } = createCampLantern();
  const sourceFingerprint = fingerprint(root);
  const completeAudit = strictAudit(scene);
  assert.equal(completeAudit.ok, true);
  assert.equal(completeAudit.readyToApply, true);
  assert.equal(completeAudit.summary.targetCount, 1);
  assert.equal(completeAudit.summary.routeCount, 1);
  assert.deepEqual(
    completeAudit.targets[0].materials.map(({ materialId }) => materialId).sort(),
    Object.keys(MATERIAL_DEFINITIONS).sort(),
  );

  const manufacturedAudit = analyzeManufacturedAsset(root);
  assert.equal(manufacturedAudit.summary.uniqueMaterialCount, 4);
  assert.equal(manufacturedAudit.summary.fallbackCount, 0);
  assert.equal(manufacturedAudit.summary.lowConfidenceCount, 0);
  assert.equal(
    manufacturedAudit.summary.explicitCount,
    manufacturedAudit.summary.materialUseCount,
  );

  delete materials.LanternLensGlass.userData.toonlabMaterialId;
  const brokenBefore = fingerprint(root);
  const brokenDiscovery = collectStyleTargets(scene);
  let directStrictRejection = null;
  try {
    await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
      mode: 'strict',
      targets: brokenDiscovery.targets,
    });
  } catch (error) {
    directStrictRejection = error;
  }
  assert.ok(directStrictRejection instanceof StyleBundleApplicationError);
  assert.ok(directStrictRejection.audit.issues.some(({ code }) => code === 'missing-material-id'));
  assert.equal(fingerprint(root), brokenBefore, 'direct strict application must reject before mutation');
  let rejection = null;
  try {
    await applyAfterStrictPreflight(scene);
  } catch (error) {
    rejection = error;
  }
  assert.ok(rejection instanceof StrictScenePreflightError);
  const rejectedBeforeMutation = fingerprint(root) === brokenBefore;
  assert.equal(rejectedBeforeMutation, true, 'strict rejection must occur before mutation');
  assert.equal(rejection.report.readyToApply, false);
  assert.ok(rejection.report.issues.some(({ code }) => code === 'missing-material-id'));
  assert.ok(rejection.report.issues.some(({ code }) => code === 'unconsumed-material-assignment'));

  materials.LanternLensGlass.userData.toonlabMaterialId = 'LanternLensGlass';
  const repairedFingerprint = fingerprint(root);
  assert.equal(repairedFingerprint, sourceFingerprint);
  const repairedAudit = strictAudit(scene);
  assert.equal(repairedAudit.ok, true);
  assert.equal(repairedAudit.readyToApply, true);
  assert.deepEqual(JSON.parse(serializeSceneStyleAudit(repairedAudit)), repairedAudit);

  const application = await applyAfterStrictPreflight(scene);
  assert.equal(application.applied.length, 1);
  assert.equal(application.applied[0].targetId, TARGET_ID);
  assert.notEqual(fingerprint(root), repairedFingerprint, 'successful style application must mutate materials');
  const revertResult = await application.revert();
  assert.equal(revertResult.reverted, true);
  assert.equal(fingerprint(root), repairedFingerprint, 'transaction revert must restore exact source state');

  const result = {
    type: 'toonlab/agent-material-labeling-test',
    version: 1,
    package: {
      name: '@call-me-sensei/toonlab',
      version: TOONLAB_VERSION,
    },
    fixture: {
      assetId: ASSET_ID,
      targetId: TARGET_ID,
      domain: 'manufactured.surface',
      partCount: PART_INVENTORY.length,
      parts: PART_INVENTORY,
      distinctMaterialCount: Object.keys(MATERIAL_DEFINITIONS).length,
      materialAssignments: Object.fromEntries(
        Object.entries(MATERIAL_DEFINITIONS).map(([materialId, definition]) => [
          materialId,
          {
            role: definition.classification.structuralRole,
            urbanMaterial: materials[materialId].userData.urbanMaterial,
          },
        ]),
      ),
    },
    completeAsset: {
      strictAudit: compactAudit(completeAudit),
      discoveredMaterialIds: completeAudit.targets[0].materials
        .map(({ materialId }) => materialId).sort(),
      manufacturedClassification: manufacturedAudit.summary,
      passed: true,
    },
    missingLabelTrial: {
      removedMaterialId: 'LanternLensGlass',
      directStrictApplication: {
        rejectionClass: directStrictRejection.name,
        issueCodes: directStrictRejection.audit.issues.map(({ code }) => code),
        rejectedBeforeMutation: true,
      },
      rejectionClass: rejection.name,
      rejectedBeforeMutation,
      strictAudit: compactAudit(rejection.report),
      relevantIssues: rejection.report.issues
        .filter(({ code }) => ['missing-material-id', 'unconsumed-material-assignment'].includes(code))
        .map(({ code, materialId = null, message, severity }) => ({ code, materialId, message, severity })),
      passed: true,
    },
    repairTrial: {
      repairedMaterialId: 'LanternLensGlass',
      strictAudit: compactAudit(repairedAudit),
      styleApplicationCount: application.applied.length,
      styleTarget: application.applied[0],
      exactSourceStateRestoredAfterRevert: fingerprint(root) === repairedFingerprint,
      passed: true,
    },
    overall: {
      passed: true,
      publicToonLabImportsOnly: true,
      strictPreflightRequiredByFixture: true,
    },
    skillAssessment: {
      clearRequirements: [
        'Every authored render material needs a stable toonlabMaterialId.',
        'Every material ID needs a valid role in the versioned material contract.',
        'Strict workflow audits before atomic bundle application.',
        'Manufactured materials need durable physical classification independent of style.',
      ],
      boundaries: [
        'Strict apply now reconciles the declared contract against live material slots and rejects a stale declaration before mutation; auditSceneStyleContract remains the richer whole-scene reporting surface.',
        'The general public semantic-part record is documented as illustrative rather than a published shared schema, so this fixture preserves part identity through stable Three.js node names and the machine-readable fixture inventory instead of inventing an ad hoc ToonLab userData field.',
        'Full Call Me Sensei contains unrelated populated slots, so an isolated manufactured-prop audit reports unused-bundle-slot warnings; these are non-blocking and readyToApply remains true.',
      ],
    },
  };

  await writeFile(OUTPUT_URL, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: fileURLToPath(OUTPUT_URL),
    passed: result.overall.passed,
    completeMaterials: result.fixture.distinctMaterialCount,
    completeParts: result.fixture.partCount,
    missingLabelRejected: result.missingLabelTrial.rejectedBeforeMutation,
    repairPassed: result.repairTrial.passed,
  }));
}

await run();
