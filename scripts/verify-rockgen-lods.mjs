// Focused deterministic verifier for the retained procedural Surface Nets LOD
// planner. Actual source-mesh references bypass this planner entirely.
//
//   node scripts/verify-rockgen-lods.mjs

import * as THREE from 'three';
import { auditSceneStyleContract } from '@call-me-sensei/toonlab/styles';

import {
  createRockDocument,
  hashGeometry,
} from '../src/rockgen/index.js';
import {
  REFERENCE_ROCK_LOD_ROLE_BUDGETS,
  createReferenceRockLodPolicy,
  createReferenceRockLodPolicyForDocument,
  createRockLodObject,
  createRockLodTriangleTargets,
  estimateSurfaceNetsResolution,
  planRockLodMeshes,
  searchSurfaceNetsResolution,
  validateRockLodLevels,
} from '../src/rockgen/lod/index.js';

let failures = 0;

function check(condition, message) {
  if (condition) console.log(`  ok  ${message}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

function compactPlan(plan) {
  return plan.levels.map((level) => ({
    hash: hashGeometry(level.geometry),
    level: level.level,
    limitedByMinimum: level.limitedByMinimum,
    resolution: level.resolution,
    retainedTopology: level.retainedTopology,
    retentionReason: level.retentionReason,
    triangleCount: level.triangleCount,
  }));
}

console.log('policy');
check(
  JSON.stringify(REFERENCE_ROCK_LOD_ROLE_BUDGETS.boulder) === JSON.stringify([320, 160, 80]),
  'single-boulder budgets preserve the reference low-poly range',
);
check(
  JSON.stringify(REFERENCE_ROCK_LOD_ROLE_BUDGETS.cluster) === JSON.stringify([960, 480, 240]),
  'cluster budgets preserve the reference clump range',
);
check(
  JSON.stringify(REFERENCE_ROCK_LOD_ROLE_BUDGETS.cliff) === JSON.stringify([512, 256, 128]),
  'cliff budgets preserve the reference cliff range',
);
const customPolicy = createReferenceRockLodPolicy({
  role: 'boulder',
  triangleBudgets: [1000, null, null],
});
check(
  JSON.stringify(customPolicy.triangleBudgets) === JSON.stringify([1000, 500, 250]),
  'custom LOD0 budgets derive deterministic half/quarter caps',
);
check(
  JSON.stringify(createRockLodTriangleTargets(280, 'boulder').map((entry) => entry.targetTriangles))
    === JSON.stringify([280, 140, 70]),
  'actual LOD0 count drives 50% and 25% targets beneath role ceilings',
);
const aliasExpectations = {
  rock: 'boulder',
  boulder: 'boulder',
  'rock-clump': 'cluster',
  'boulder-clump': 'cluster',
  shelf: 'cluster',
  platform: 'cluster',
  cliff: 'cliff',
  'cliff-piece': 'cliff',
  'metric-block': 'boulder',
  'layered-rock': 'boulder',
  hoodoo: 'cliff',
  'hoodoo-cliff': 'cliff',
  'column-piece': 'cliff',
  'column-rock': 'cliff',
  'slanted-rock': 'boulder',
  spire: 'landmark',
  'mountain-backdrop': 'landmark',
  'vertical-clump': 'cluster',
  'ridge-clump': 'cluster',
};
check(
  Object.entries(aliasExpectations).every(([alias, role]) => (
    createReferenceRockLodPolicy({ role: alias }).role === role
  )),
  'every catalog rock archetype resolves to a supported LOD role',
);
const referencedPolicy = createReferenceRockLodPolicyForDocument({
  reference: { role: 'rock-clump', targetTriangles: 740 },
});
check(
  referencedPolicy.role === 'cluster'
    && JSON.stringify(referencedPolicy.triangleBudgets) === JSON.stringify([740, 370, 185]),
  'document reference targetTriangles derives custom half/quarter budgets',
);
const explicitPolicy = createReferenceRockLodPolicyForDocument(
  { reference: { role: 'rock-clump', targetTriangles: 740 } },
  { triangleBudgets: [600, 280, 120] },
);
check(
  JSON.stringify(explicitPolicy.triangleBudgets) === JSON.stringify([600, 280, 120]),
  'explicit per-level budgets override document reference metadata',
);

console.log('\nresolution helpers');
check(
  estimateSurfaceNetsResolution({
    maxResolution: 128,
    minResolution: 8,
    referenceResolution: 64,
    referenceTriangles: 8192,
    targetTriangles: 2048,
  }) === 32,
  'Surface Nets estimate uses square-root triangle scaling',
);
let syntheticCalls = 0;
const syntheticMeasure = (resolution) => {
  syntheticCalls += 1;
  return resolution * resolution * 2;
};
const syntheticFirst = searchSurfaceNetsResolution({
  maxResolution: 96,
  measureTriangles: syntheticMeasure,
  minResolution: 8,
  reference: { resolution: 64, triangleCount: 8192 },
  targetTriangles: 2048,
});
const syntheticSecond = searchSurfaceNetsResolution({
  maxResolution: 96,
  measureTriangles: (resolution) => resolution * resolution * 2,
  minResolution: 8,
  reference: { resolution: 64, triangleCount: 8192 },
  targetTriangles: 2048,
});
check(syntheticFirst.resolution === 32 && syntheticFirst.triangleCount === 2048,
  'resolution search hits an exact synthetic target');
check(
  syntheticFirst.resolution === syntheticSecond.resolution
    && syntheticFirst.triangleCount === syntheticSecond.triangleCount,
  'resolution search is deterministic',
);
check(syntheticCalls < 20, 'adaptive search avoids exhaustive high-resolution sampling');

const referencedDocument = createRockDocument({ preset: 'scree-cluster', seed: 11 });
referencedDocument.reference = { role: 'rock-clump', targetTriangles: 740 };
const referencedPlan = planRockLodMeshes(referencedDocument, {
  maxResolution: 40,
  meshOptions: { attributes: { ao: false, color: false }, normals: 'gradient' },
});
check(
  referencedPlan.policy.role === 'cluster'
    && JSON.stringify(referencedPlan.policy.triangleBudgets) === JSON.stringify([740, 370, 185])
    && referencedPlan.levels[0].triangleCount <= 740,
  'planner consumes document reference role and targetTriangles without a policy override',
);

let sourceReferenceRejected = false;
try {
  planRockLodMeshes(createRockDocument({
    preset: 'shard-monolith',
    reference: {
      archetype: 'cliff-piece',
      id: 'test/source-mesh',
      lodTriangles: [126, 64],
      sourceMode: 'mesh-template',
      targetTriangles: 126,
    },
  }), {
    maxResolution: 32,
    meshOptions: { attributes: { ao: false, color: false }, normals: 'gradient' },
  });
} catch (error) {
  sourceReferenceRejected = /cannot be SDF-meshed/i.test(error.message);
}
check(
  sourceReferenceRejected,
  'source-mesh reference documents cannot fall through to the legacy SDF planner',
);

console.log('\nruntime THREE.LOD');
const runtimeMaterials = [];
const runtime = createRockLodObject(createRockDocument({ preset: 'boulder', seed: 13 }), {
  distances: [0, 10, 20],
  materialFactory: ({ level }) => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    material.name = `test-LOD${level.level}`;
    runtimeMaterials.push(material);
    return material;
  },
  planOptions: {
    maxResolution: 32,
    meshOptions: { attributes: { ao: false, color: false }, normals: 'gradient' },
    policy: 'boulder',
  },
});
check(runtime.lod.isLOD && runtime.lod.levels.length === 3,
  'runtime helper returns a native three-level THREE.LOD');
const runtimeAudit = auditSceneStyleContract(runtime.lod);
check(runtimeAudit.readyToApply && runtimeAudit.targets[0]?.domain === 'natural.rock',
  'runtime LOD factory emits an audit-ready rock label and material role');
check(
  JSON.stringify(runtime.report.distances) === JSON.stringify([0, 10, 20])
    && runtime.report.levels.every((level, index) => (
      level.triangleCount === runtime.plan.levels[index].triangleCount
    )),
  'runtime report preserves switch distances and planned mesh counts',
);
check(
  runtime.lod.levels.every((entry, index) => (
    entry.object.geometry === runtime.plan.levels[index].geometry
      && entry.object.material === runtimeMaterials[index]
      && entry.object.castShadow
      && entry.object.receiveShadow
  )),
  'runtime meshes reuse planned geometry, factory materials, and rock shadow defaults',
);
const runtimeCamera = new THREE.PerspectiveCamera();
runtime.lod.updateMatrixWorld(true);
runtimeCamera.position.set(0, 15, 0);
runtimeCamera.updateMatrixWorld(true);
runtime.lod.update(runtimeCamera);
check(
  runtime.lod.levels[1].object.visible
    && !runtime.lod.levels[0].object.visible
    && !runtime.lod.levels[2].object.visible,
  'vertical-only camera distance selects LOD1 using true 3D distance',
);
runtimeCamera.position.set(0, 0, 25);
runtimeCamera.updateMatrixWorld(true);
runtime.lod.update(runtimeCamera);
check(runtime.lod.levels[2].object.visible, 'far 3D camera distance selects LOD2');
runtime.plan.levels.forEach((level) => level.geometry.dispose());
runtimeMaterials.forEach((material) => material.dispose());

const fixtures = [
  { preset: 'boulder', role: 'boulder', seed: 7 },
  { preset: 'scree-cluster', role: 'cluster', seed: 5 },
  { preset: 'cliff-face', role: 'cliff', seed: 2 },
  { preset: 'karst-spire', role: 'landmark', seed: 3 },
];

for (const fixture of fixtures) {
  console.log(`\n${fixture.preset} (${fixture.role})`);
  const document = createRockDocument({
    meshing: { normalsMode: 'gradient' },
    preset: fixture.preset,
    seed: fixture.seed,
  });
  const options = {
    maxResolution: 64,
    meshOptions: { attributes: { ao: false, color: false }, normals: 'gradient' },
    policy: fixture.role,
  };
  const first = planRockLodMeshes(document, options);
  const second = planRockLodMeshes(document, options);
  const compactFirst = compactPlan(first);
  const compactSecond = compactPlan(second);
  console.log(`  ${compactFirst.map((entry) => `LOD${entry.level} ${entry.triangleCount}t@${entry.resolution}`).join('  ')}`);
  check(JSON.stringify(compactFirst) === JSON.stringify(compactSecond),
    'same document produces identical resolutions, counts, and hashes');
  check(first.validation.valid,
    `bounds, silhouettes, ratios, and budgets validate${first.validation.valid ? '' : `: ${first.validation.errors.map((entry) => entry.text).join(' | ')}`}`);
  for (let level = 0; level < first.levels.length; level += 1) {
    const entry = first.levels[level];
    const budget = first.policy.triangleBudgets[level];
    check(
      entry.triangleCount <= budget || entry.limitedByMinimum,
      `LOD${level} respects ${budget}-triangle role budget or reports minimum limitation`,
    );
    if (level === 0) continue;
    const previous = first.levels[level - 1];
    check(
      entry.triangleCount < previous.triangleCount || entry.retainedTopology,
      `LOD${level} strictly reduces triangles or explicitly retains irreducible topology`,
    );
  }
  for (const comparison of first.validation.comparisons) {
    check(
      comparison.bounds.maxSizeError <= first.policy.boundsSizeTolerance,
      `LOD${comparison.level} bounds stay within tolerance`,
    );
    check(
      comparison.silhouette.min >= (
        first.policy.silhouetteThresholds?.[comparison.level]
          ?? first.policy.silhouetteThreshold
      ),
      `LOD${comparison.level} three-view silhouette remains stable`,
    );
  }
}

console.log('\ntiny topology retention');
const tinyGeometry = new THREE.BoxGeometry(1, 1, 1);
const tinyPolicy = createReferenceRockLodPolicy({ role: 'boulder', tinyTriangleThreshold: 24 });
const tinyLevels = [0, 1, 2].map((level) => ({
  geometry: tinyGeometry,
  level,
  limitedByMinimum: level > 0,
  resolution: 8,
  retainedTopology: level > 0,
  retentionReason: level > 0 ? 'minimum-resolution' : null,
  triangleCount: 12,
}));
const tinyValidation = validateRockLodLevels(tinyLevels, { policy: tinyPolicy });
check(tinyValidation.valid, 'a tiny mesh may legally retain identical topology at lower LOD names');
check(tinyValidation.warnings.length >= 2, 'legal topology retention is visible in validation warnings');

console.log(failures === 0
  ? '\nverify-rockgen-lods: all checks passed'
  : `\nverify-rockgen-lods: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
