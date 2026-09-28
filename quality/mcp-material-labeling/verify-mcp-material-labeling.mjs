import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  ManufacturedStyleLabelingError,
  StyleBundleApplicationError,
  applyManufacturedStyleTargetLabelProposal,
  applyStyleBundle,
  auditStyleBundleApplication,
  collectStyleTargets,
  proposeManufacturedStyleTargetLabel,
} from '@call-me-sensei/toonlab/styles';

const FIXTURES = [
  {
    assetId: 'polyhaven:painted_wooden_bench',
    attribution: 'Painted Wooden Bench by Kirill Sannikov — Poly Haven (CC0)',
    file: './assets/painted_wooden_bench/painted_wooden_bench_1k.gltf',
    expected: {
      painted_wooden_bench: { baseMaterial: 'wood', renderMode: 'opaque', structuralRole: 'primaryMass' },
    },
  },
  {
    assetId: 'polyhaven:wooden_picnic_table',
    attribution: 'Wooden Picnic Table by Ulan Cabanilla — Poly Haven (CC0)',
    file: './assets/wooden_picnic_table/wooden_picnic_table_1k.gltf',
    expected: {
      wooden_picnic_table_bottom: { baseMaterial: 'wood', renderMode: 'opaque', structuralRole: 'secondaryStructure' },
      wooden_picnic_table_table: { baseMaterial: 'wood', renderMode: 'opaque', structuralRole: 'primaryMass' },
    },
  },
  {
    assetId: 'polyhaven:street_lamp_01',
    attribution: 'Street Lamp 01 by Josh Dean — Poly Haven (CC0)',
    file: './assets/street_lamp_01/street_lamp_01_1k.gltf',
    expected: {
      street_lamp_01: { baseMaterial: 'metal', renderMode: 'opaque', structuralRole: 'primaryMass' },
      street_lamp_01_glass: { baseMaterial: 'glass', renderMode: 'translucent', structuralRole: 'window' },
      street_lamp_01_bulb: { baseMaterial: 'glass', renderMode: 'opaque', structuralRole: 'lightEmitter' },
    },
    overrides: {
      street_lamp_01: {
        baseMaterial: 'metal',
        finish: 'painted',
        renderMode: 'opaque',
        structuralRole: 'primaryMass',
      },
    },
  },
];

function textureFor(gltf, textureInfo) {
  if (!textureInfo) return null;
  const texture = new THREE.Texture();
  const textureDefinition = gltf.textures?.[textureInfo.index];
  const image = gltf.images?.[textureDefinition?.source];
  texture.name = image?.uri ?? '';
  texture.image = { name: image?.uri ?? '', src: image?.uri ?? '' };
  return texture;
}

function makeMaterial(gltf, definition) {
  const pbr = definition.pbrMetallicRoughness ?? {};
  const material = new THREE.MeshStandardMaterial({
    metalness: pbr.metallicFactor ?? 1,
    opacity: definition.alphaMode === 'BLEND' ? 0.5 : 1,
    roughness: pbr.roughnessFactor ?? 1,
    transparent: definition.alphaMode === 'BLEND',
  });
  material.name = definition.name ?? '';
  material.map = textureFor(gltf, pbr.baseColorTexture);
  material.normalMap = textureFor(gltf, definition.normalTexture);
  material.roughnessMap = textureFor(gltf, pbr.metallicRoughnessTexture);
  material.metalnessMap = material.roughnessMap;
  return material;
}

async function loadGraph(fixture) {
  const url = new URL(fixture.file, import.meta.url);
  const gltf = JSON.parse(await readFile(url, 'utf8'));
  const materials = (gltf.materials ?? []).map((definition) => makeMaterial(gltf, definition));
  const root = new THREE.Group();
  root.name = fixture.assetId;
  root.userData.sourceUrl = `https://polyhaven.com/a/${fixture.assetId.split(':')[1]}`;
  for (const [index, node] of (gltf.nodes ?? []).entries()) {
    if (node.mesh === undefined) continue;
    const meshDefinition = gltf.meshes[node.mesh];
    const meshMaterials = meshDefinition.primitives.map(({ material }) => materials[material]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      meshMaterials.length === 1 ? meshMaterials[0] : meshMaterials,
    );
    mesh.name = node.name || meshDefinition.name || `node-${index}`;
    root.add(mesh);
  }
  return { gltf, materials, root };
}

function snapshot(root) {
  const materialData = [];
  root.traverse((node) => {
    const slots = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of slots) {
      materialData.push({ name: material.name, userData: structuredClone(material.userData) });
    }
  });
  return JSON.stringify({ root: root.userData, materials: materialData });
}

function compactProposal(proposal, expected) {
  const materials = proposal.entries.map((entry) => {
    const wanted = expected[entry.materialId];
    const fieldsCorrect = wanted && Object.entries(wanted).every(([key, value]) => (
      entry.classification[key] === value
    ));
    return {
      classification: entry.classification,
      fieldsCorrect: Boolean(fieldsCorrect),
      materialId: entry.materialId,
      unresolved: proposal.issues.some((issue) => issue.materialId === entry.materialId),
      useCount: entry.useCount,
    };
  });
  return {
    issues: proposal.issues,
    materials,
    ready: proposal.ready,
    summary: proposal.summary,
  };
}

async function run() {
  const scene = new THREE.Scene();
  const results = [];
  let exactIdentificationCount = 0;
  let totalMaterialCount = 0;
  let automaticReadyCount = 0;
  let automaticMaterialCount = 0;

  for (const fixture of FIXTURES) {
    const { root } = await loadGraph(fixture);
    const before = snapshot(root);
    const automatic = proposeManufacturedStyleTargetLabel(root, {
      assetId: fixture.assetId,
      targetId: `mcp/${fixture.assetId.split(':')[1]}`,
    });
    const compactAutomatic = compactProposal(automatic, fixture.expected);
    exactIdentificationCount += compactAutomatic.materials.filter(({ fieldsCorrect }) => fieldsCorrect).length;
    totalMaterialCount += compactAutomatic.materials.length;
    automaticMaterialCount += automatic.summary.autoResolvedMaterials;
    if (automatic.ready) automaticReadyCount += 1;

    if (!automatic.ready) {
      assert.throws(
        () => applyManufacturedStyleTargetLabelProposal(root, automatic),
        ManufacturedStyleLabelingError,
      );
      assert.equal(snapshot(root), before, 'blocked proposal must not mutate the imported asset');
    }

    const repaired = fixture.overrides
      ? proposeManufacturedStyleTargetLabel(root, {
        assetId: fixture.assetId,
        materialOverrides: fixture.overrides,
        targetId: `mcp/${fixture.assetId.split(':')[1]}`,
      })
      : automatic;
    assert.equal(repaired.ready, true, `${fixture.assetId} must be ready after explicit repairs`);
    applyManufacturedStyleTargetLabelProposal(root, repaired);
    scene.add(root);
    results.push({
      assetId: fixture.assetId,
      attribution: fixture.attribution,
      automatic: compactAutomatic,
      repaired: compactProposal(repaired, fixture.expected),
    });
  }

  const discovery = collectStyleTargets(scene);
  assert.equal(discovery.ok, true);
  assert.equal(discovery.targets.length, FIXTURES.length);
  const strictAudit = auditStyleBundleApplication(CALL_ME_SENSEI_STYLE_BUNDLE, discovery.targets);
  assert.equal(strictAudit.ok, true, 'strict bundle preflight must reconcile all live material slots');

  // Prove strict apply itself now rejects stale declarations before mutation.
  const target = discovery.targets[0];
  const material = target.subject.children[0].material;
  const originalName = material.name;
  const originalId = material.userData.toonlabMaterialId;
  material.name = '';
  delete material.userData.toonlabMaterialId;
  const brokenBefore = snapshot(target.subject);
  await assert.rejects(
    applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, { mode: 'strict', targets: [target] }),
    (error) => error instanceof StyleBundleApplicationError
      && error.audit.issues.some(({ code }) => code === 'missing-material-id'),
  );
  assert.equal(snapshot(target.subject), brokenBefore, 'strict direct apply must reject before mutation');
  material.name = originalName;
  material.userData.toonlabMaterialId = originalId;

  const application = await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
    mode: 'strict',
    targets: discovery.targets,
  });
  assert.equal(application.applied.length, FIXTURES.length);
  const reverted = await application.revert();
  assert.equal(reverted.reverted, true);

  const report = {
    type: 'toonlab/mcp-material-labeling-qualification',
    version: 1,
    assets: results,
    policy: {
      id: 'material-labeling-qualification-advisory',
      mode: 'advisory',
      note: 'Qualification-only policy; external CC0 assets are not promoted into the Call Me Sensei library.',
    },
    rates: {
      assistedAssetReadiness: `${FIXTURES.length}/${FIXTURES.length}`,
      assistedAssetReadinessRate: 1,
      automaticAssetReadiness: `${automaticReadyCount}/${FIXTURES.length}`,
      automaticAssetReadinessRate: automaticReadyCount / FIXTURES.length,
      automaticMaterialReadiness: `${automaticMaterialCount}/${totalMaterialCount}`,
      automaticMaterialReadinessRate: automaticMaterialCount / totalMaterialCount,
      exactSemanticIdentification: `${exactIdentificationCount}/${totalMaterialCount}`,
      exactSemanticIdentificationRate: exactIdentificationCount / totalMaterialCount,
    },
    strictLiveCoverage: {
      directApplyRejectsStaleContract: true,
      rejectedBeforeMutation: true,
      repairedTargetCount: discovery.targets.length,
    },
  };
  await writeFile(new URL('./mcp-material-labeling.result.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.rates, null, 2));
}

await run();
