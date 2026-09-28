import { contentId } from '../canonical.node.js';
import { compileFractureBlockStage } from '../fractures/compiler.node.js';
import { computeGradientNormals } from '../meshing/meshContract.node.js';
import { extractManifoldDualContouring } from '../meshing/manifoldDualContouring.node.js';
import { sampleScalarField } from '../meshing/scalarGrid.node.js';
import { auditMeshTopology } from '../meshing/topologyAudit.node.js';
import { compileProcessStage, createStableProcessField } from '../process/stability.node.js';
import { compileStructuralFieldProgram } from '../structure/program.node.js';
import { createC8BasisField } from './field.node.js';
import { C8_BASIS_MATRIX } from './fixtures.node.js';

export const C8_BASIS_COMPILER_SCHEMA = 'toonlab/rock-geology-basis-specimen';
export const C8_BASIS_COMPILER_VERSION = 3;

export function c8BasisMeshBounds(fixture, paddingFraction = 0.18) {
  const halfExtents = fixture.recipe.targetDimensionsMetres.map((value) => value * 0.5);
  const horizontalRadius = Math.hypot(halfExtents[0], halfExtents[2]);
  const padding = Math.max(...halfExtents) * paddingFraction;
  const origin = fixture.recipe.geologyTransform.originMetres;
  return {
    max: [origin[0] + horizontalRadius + padding, origin[1] + halfExtents[1] + padding, origin[2] + horizontalRadius + padding],
    min: [origin[0] - horizontalRadius - padding, origin[1] - halfExtents[1] - padding, origin[2] - horizontalRadius - padding],
  };
}

export function compileC8BasisStages(fixture, options = {}) {
  const catalog = options.catalog;
  const structuralProgram = compileStructuralFieldProgram(fixture.recipe, { catalog });
  const fractureStage = compileFractureBlockStage(fixture.recipe, structuralProgram, { catalog });
  const processStage = compileProcessStage(fixture.recipe, structuralProgram, fractureStage, { catalog });
  const stable = createStableProcessField(processStage, structuralProgram, fractureStage);
  const processField = fixture.recipe.processContext.detached ? stable.raw : stable;
  const basisField = createC8BasisField(fixture, processField, structuralProgram);
  return Object.freeze({ basisField, fractureStage, processStage, structuralProgram });
}

export function meshC8BasisFixture(fixture, options = {}) {
  const stages = options.stages ?? compileC8BasisStages(fixture, options);
  const resolution = options.resolution ?? C8_BASIS_MATRIX[fixture.qualityTier].meshResolution;
  const bounds = options.bounds ?? c8BasisMeshBounds(fixture, 0.18);
  const grid = sampleScalarField({
    bounds,
    evaluate: stages.basisField.evaluate,
    resolution,
    sourceId: `c8/${fixture.definition.id}/${fixture.variant.id}/${fixture.qualityTier}/${fixture.recipe.seed}`,
  });
  // Manifold Dual Contouring already emits a consistent closed orientation.
  // Per-triangle gradient flipping is deliberately not applied here because a
  // sharply creased but valid family field can locally disagree at a centroid.
  const mesh = extractManifoldDualContouring(grid, { evaluate: stages.basisField.evaluate });
  mesh.normals = computeGradientNormals(mesh, stages.basisField.evaluate);
  const topology = auditMeshTopology(mesh, {
    evaluate: stages.basisField.evaluate,
    grid,
    includeSelfIntersections: options.includeSelfIntersections !== false,
  });
  const [minimumComponents, maximumComponents] = stages.basisField.descriptor.expectedComponentRange;
  const componentGate = topology.components >= minimumComponents && topology.components <= maximumComponents;
  const topologyGate = topology.topologyFailures === 0 && topology.selfIntersectionPairs === 0 && componentGate;
  const record = {
    compiler: { schema: C8_BASIS_COMPILER_SCHEMA, version: C8_BASIS_COMPILER_VERSION },
    componentGate,
    expectedComponentRange: stages.basisField.descriptor.expectedComponentRange,
    familyId: fixture.definition.id,
    fieldContentId: stages.basisField.descriptor.fieldContentId,
    heroRole: fixture.heroRole,
    meshContentId: contentId({
      fieldContentId: stages.basisField.descriptor.fieldContentId,
      indices: Array.from(mesh.indices),
      positions: Array.from(mesh.positions),
      resolution,
    }),
    passed: topologyGate,
    qualityTier: fixture.qualityTier,
    recipeContentId: stages.structuralProgram.recipeContentId,
    resolution,
    seed: fixture.recipe.seed,
    seedIndex: fixture.seedIndex,
    topology,
    variantId: fixture.variant.id,
  };
  return { bounds, grid, mesh, record, stages };
}
