import { contentId } from '../canonical.node.js';
import { compileFractureBlockStage } from '../fractures/compiler.node.js';
import { computeGradientNormals } from '../meshing/meshContract.node.js';
import { extractManifoldDualContouring } from '../meshing/manifoldDualContouring.node.js';
import { sampleScalarField } from '../meshing/scalarGrid.node.js';
import { auditMeshTopology } from '../meshing/topologyAudit.node.js';
import { compileProcessStage, createStableProcessField } from '../process/stability.node.js';
import { compileStructuralFieldProgram } from '../structure/program.node.js';
import { authoredCanonicalBounds, createAuthoredCanonicalField } from './field.node.js';
import { validateCanonicalIdentity } from './identity.node.js';

export const AUTHORED_CANONICAL_COMPILER_SCHEMA = 'toonlab/rock-authored-canonical-compiler';
export const AUTHORED_CANONICAL_COMPILER_VERSION = 1;

export function compileAuthoredCanonicalStages(fixture, options = {}) {
  const structuralProgram = compileStructuralFieldProgram(fixture.recipe, { catalog: options.catalog });
  const fractureStage = compileFractureBlockStage(fixture.recipe, structuralProgram, { catalog: options.catalog });
  const processStage = compileProcessStage(fixture.recipe, structuralProgram, fractureStage, { catalog: options.catalog });
  const stableProcessField = createStableProcessField(processStage, structuralProgram, fractureStage);
  const authoredField = createAuthoredCanonicalField(fixture.source, stableProcessField, {
    customMeshAuthorities: options.customMeshAuthorities ?? options.customMeshSamplers,
  });
  const identity = validateCanonicalIdentity(fixture.source);
  return Object.freeze({ authoredField, fractureStage, identity, processStage, structuralProgram });
}

export function meshAuthoredCanonicalFixture(fixture, options = {}) {
  const stages = options.stages ?? compileAuthoredCanonicalStages(fixture, options);
  const resolution = options.resolution ?? 56;
  const bounds = options.bounds ?? authoredCanonicalBounds(fixture.source, 0.14);
  const grid = sampleScalarField({
    bounds,
    evaluate: stages.authoredField.evaluate,
    resolution,
    sourceId: `c8-authored/${fixture.definition.id}/${fixture.source.sourceRevision}`,
  });
  const mesh = extractManifoldDualContouring(grid, { evaluate: stages.authoredField.evaluate });
  mesh.normals = computeGradientNormals(mesh, stages.authoredField.evaluate);
  const topology = auditMeshTopology(mesh, {
    evaluate: stages.authoredField.evaluate,
    grid,
    includeSelfIntersections: options.includeSelfIntersections !== false,
  });
  const topologyGate = topology.topologyFailures === 0 && topology.selfIntersectionPairs === 0;
  const record = {
    compiler: { schema: AUTHORED_CANONICAL_COMPILER_SCHEMA, version: AUTHORED_CANONICAL_COMPILER_VERSION },
    fieldContentId: stages.authoredField.descriptor.fieldContentId,
    identity: stages.identity,
    meshContentId: contentId({
      fieldContentId: stages.authoredField.descriptor.fieldContentId,
      indices: Array.from(mesh.indices),
      positions: Array.from(mesh.positions),
      resolution,
    }),
    passed: topologyGate && stages.identity.passed,
    resolution,
    sourceContentId: stages.authoredField.descriptor.sourceContentId,
    sourceId: fixture.source.sourceId,
    sourceRevision: fixture.source.sourceRevision,
    subtypeId: fixture.source.subtypeId,
    topology,
    topologyGate,
    visualApprovalRequired: true,
  };
  return { bounds, grid, mesh, record, stages };
}
