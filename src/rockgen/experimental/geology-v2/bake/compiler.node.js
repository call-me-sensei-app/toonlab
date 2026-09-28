import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { canonicalizeJson, contentId } from '../canonical.node.js';
import { extractManifoldDualContouring } from '../meshing/manifoldDualContouring.node.js';
import { computeGradientNormals, orientMeshToField } from '../meshing/meshContract.node.js';
import { sampleScalarField } from '../meshing/scalarGrid.node.js';
import { auditHausdorff, auditMeshTopology } from '../meshing/topologyAudit.node.js';
import { processMeshBounds } from '../process/meshing.node.js';
import { createStableProcessField } from '../process/stability.node.js';
import { auditFiniteMeshAttributes, auditMeshSilhouettes } from './audits.node.js';
import { createDenseDetailField } from './detailField.node.js';
import { finalizeRockBakePolicy, ROCK_BAKE_COMPILER_SCHEMA, ROCK_BAKE_COMPILER_VERSION, selectRockBakePolicy } from './policy.node.js';
import { bakeRockChannels, runProjectionCageFixtures } from './projection.node.js';
import { unwrapRockMesh } from './unwrap.node.js';

function hashTypedArray(value) {
  return createHash('sha256').update(Buffer.from(value.buffer, value.byteOffset, value.byteLength)).digest('hex');
}

function meshHash(mesh) {
  const hash = createHash('sha256');
  for (const key of ['positions', 'normals', 'tangents', 'uvs', 'indices']) {
    if (!mesh[key]) continue;
    hash.update(key);
    hash.update(Buffer.from(mesh[key].buffer, mesh[key].byteOffset, mesh[key].byteLength));
  }
  return hash.digest('hex');
}

function pageHashes(pages) {
  return Object.fromEntries(Object.entries(pages).map(([id, page]) => [id, hashTypedArray(page.data)]));
}

function tangentAuditPassed(audit) {
  return audit.finiteTangents !== false
    && audit.zeroLengthTangents === 0
    && audit.maximumOrthogonalityError <= 1e-5
    && audit.maximumUnitLengthError <= 1e-5;
}

function extractMesh(evaluate, bounds, resolution, role, orientToField = true) {
  const started = performance.now();
  const grid = sampleScalarField({ bounds, evaluate, resolution, sourceId: `c7/${role}` });
  let mesh = extractManifoldDualContouring(grid, { evaluate });
  if (orientToField) mesh = orientMeshToField(mesh, evaluate);
  mesh = {
    ...mesh,
    metadata: { ...mesh.metadata, assetRole: role, resolution, units: 'metres' },
  };
  mesh.normals = computeGradientNormals(mesh, evaluate);
  return { grid, mesh, milliseconds: performance.now() - started };
}

function auditLod(role, extracted, dense, evaluate, maximumDimension, policy, includeSelfIntersections) {
  const topology = auditMeshTopology(extracted.mesh, {
    evaluate,
    grid: extracted.grid,
    includeSelfIntersections,
  });
  const hausdorff = role === 'dense-source'
    ? { maximum: 0, normalizedMaximum: 0, reference: 'self' }
    : auditHausdorff(extracted.mesh, dense.grid, evaluate, { maxGridSamples: 8000 });
  const silhouette = role === 'dense-source'
    ? { maximumBoundaryErrorPixels: 0, maximumMismatchFraction: 0, views: [] }
    : auditMeshSilhouettes(dense.mesh, extracted.mesh, { resolution: 128 });
  const allowedHausdorffMetres = maximumDimension * policy.tolerances.maximumGeometricErrorFraction
    * (role.startsWith('fallback-') ? Number(role.at(-1)) * 0.9 + 0.25 : role === 'collision' ? 4 : 1);
  const allowedSilhouettePixels = policy.tolerances.maximumSilhouetteErrorPixels
    * (role.startsWith('fallback-') ? Number(role.at(-1)) : role === 'collision' ? 5 : 1);
  return canonicalizeJson({
    finite: auditFiniteMeshAttributes(extracted.mesh),
    geometryGate: hausdorff.maximum <= allowedHausdorffMetres
      && silhouette.maximumBoundaryErrorPixels <= allowedSilhouettePixels,
    hausdorff,
    limits: { allowedHausdorffMetres, allowedSilhouettePixels },
    role,
    silhouette,
    topology,
    topologyGate: topology.topologyFailures === 0 && topology.selfIntersectionPairs === 0,
  });
}

/**
 * Compile one approved C4/C5/C6 result into a complete C7 high-to-low bundle.
 * Outputs remain repository-only and content-addressed; filesystem serialization
 * and engine import are deliberately left to later integration checkpoints.
 */
export function compileRockBakeV2({
  recipe,
  structuralProgram,
  fractureStage,
  processStage,
}, options = {}) {
  const started = performance.now();
  const policy = selectRockBakePolicy(recipe, options);
  const hasFieldOverride = options.productionField !== undefined;
  const stableField = hasFieldOverride
    ? null
    : createStableProcessField(processStage, structuralProgram, fractureStage);
  // A detached prop is the transported asset, not the source void left after
  // detachment. Attached formations use the post-stability field; detached
  // objects preserve the approved causal process field for downstream baking.
  const productionField = options.productionField
    ?? (recipe.processContext.detached ? stableField.raw : stableField);
  if (typeof productionField?.evaluate !== 'function' || typeof productionField?.sample !== 'function') {
    throw new TypeError('C7 bake productionField must expose evaluate(x, y, z) and sample(point).');
  }
  if (hasFieldOverride && typeof options.fieldContentId !== 'string') {
    throw new TypeError('C7 bake field overrides require an explicit fieldContentId.');
  }
  const detailField = options.detailField ?? createDenseDetailField(recipe, productionField, {
    seed: processStage.processProgram.seeds.denseSource ?? recipe.seed,
  });
  if (typeof detailField?.evaluate !== 'function' || typeof detailField?.sample !== 'function') {
    throw new TypeError('C7 bake detailField must expose evaluate(x, y, z) and sample(point, normal, ao, curvature).');
  }
  const bounds = options.bounds ?? processMeshBounds(structuralProgram, 0.1);
  const geometry = policy.geometry;
  const orientToField = options.orientMeshesToField !== false;
  const dense = extractMesh(detailField.evaluate, bounds, geometry.denseResolution, 'dense-source', orientToField);
  const render = extractMesh(productionField.evaluate, bounds, geometry.renderResolution, 'render-mesh', orientToField);
  const fallbacks = geometry.fallbackResolutions.map((resolution, index) => (
    extractMesh(productionField.evaluate, bounds, resolution, `fallback-${index + 1}`, orientToField)
  ));
  const collision = extractMesh(productionField.evaluate, bounds, geometry.collisionResolution, 'collision', orientToField);
  const atlas = unwrapRockMesh(render.mesh, {
    atlasResolution: policy.atlas.selectedResolution,
    gutterTexels: policy.atlas.gutterTexels,
  });
  const cageDistance = Math.max(dense.grid.cellSize * 3.2, render.grid.cellSize * 2.4, detailField.amplitudeMetres * 10);
  const bakeStarted = performance.now();
  const bake = bakeRockChannels({ atlas, cageDistance, detailField });
  const bakeMilliseconds = performance.now() - bakeStarted;
  const maximumDimension = Math.max(...recipe.targetDimensionsMetres);
  const assets = [dense, render, ...fallbacks, collision];
  const roles = ['dense-source', 'render-mesh', ...fallbacks.map((_, index) => `fallback-${index + 1}`), 'collision'];
  const audits = roles.map((role, index) => auditLod(
    role,
    assets[index],
    dense,
    index === 0 ? detailField.evaluate : productionField.evaluate,
    maximumDimension,
    policy,
    options.includeSelfIntersections !== false,
  ));
  const finalizedPolicy = finalizeRockBakePolicy(policy, audits[0].topology.surfaceArea, bake.stats.coveredTexels);
  const cages = runProjectionCageFixtures();
  const uvBakeGate = bake.stats.hitRate === 1
    && bake.stats.projectionConflicts === 0
    && bake.stats.flippedUvTriangles === 0
    && bake.stats.zeroAreaUvTriangles === 0
    && bake.stats.finiteHighPrecisionIntermediates
    && tangentAuditPassed(atlas.tangentAudit);
  const geometryGate = audits.every((audit) => audit.geometryGate && audit.topologyGate && audit.finite.passed);
  const policyGate = finalizedPolicy.atlas.strategy === 'udim-or-virtual-texture'
    || finalizedPolicy.texelDensity.passesMinimum;
  const passed = geometryGate && uvBakeGate && policyGate && cages.every((fixture) => fixture.pass);
  const hashes = {
    atlasMesh: meshHash(atlas.mesh),
    meshAssets: Object.fromEntries(roles.map((role, index) => [role, meshHash(assets[index].mesh)])),
    pages: pageHashes(bake.pages),
  };
  const report = canonicalizeJson({
    audits,
    bake: bake.stats,
    cages,
    compiler: { schema: ROCK_BAKE_COMPILER_SCHEMA, version: ROCK_BAKE_COMPILER_VERSION },
    contentId: contentId({
      compilerVersion: ROCK_BAKE_COMPILER_VERSION,
      ...(hasFieldOverride ? { fieldContentId: options.fieldContentId } : {}),
      processStageContentId: processStage.outputContentId,
      recipeContentId: structuralProgram.recipeContentId,
      policy: finalizedPolicy,
      hashes,
    }),
    gates: {
      cageDisambiguation: cages.every((fixture) => fixture.pass),
      colorSpaceMetadata: Object.values(bake.pages).every((page) => page.colorSpace === 'linear' || page.colorSpace === 'sRGB'),
      deterministicContentAddressing: true,
      geometry: geometryGate,
      highPrecisionIntermediates: bake.stats.finiteHighPrecisionIntermediates,
      policy: policyGate,
      separateAssetRoles: new Set(roles).size === roles.length,
      tangentSpace: tangentAuditPassed(atlas.tangentAudit),
      uvBake: uvBakeGate,
    },
    hashes,
    passed,
    policy: finalizedPolicy,
    recipeId: recipe.id,
    sourceField: hasFieldOverride
      ? { contentId: options.fieldContentId, kind: options.fieldKind ?? 'explicit-override' }
      : { contentId: processStage.outputContentId, kind: 'c6-stable-process-field' },
    timings: {
      bakeMilliseconds,
      geometryMilliseconds: Object.fromEntries(roles.map((role, index) => [role, assets[index].milliseconds])),
      totalMilliseconds: performance.now() - started,
    },
  });
  return {
    assets: Object.fromEntries(roles.map((role, index) => [role, assets[index].mesh])),
    atlas,
    bake,
    detailField,
    report,
  };
}

export function rockBakeBundleSignature(bundle) {
  return createHash('sha256').update(JSON.stringify({
    atlas: meshHash(bundle.atlas.mesh),
    contentId: bundle.report.contentId,
    gates: bundle.report.gates,
    meshAssets: bundle.report.hashes.meshAssets,
    pages: pageHashes(bundle.bake.pages),
  })).digest('hex');
}
