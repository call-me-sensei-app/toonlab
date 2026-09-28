import { auditHausdorff, auditMeshTopology } from './topologyAudit.node.js';
import { extractManifoldDualContouring } from './manifoldDualContouring.node.js';
import { extractMc33Reference } from './mc33Reference.node.js';
import { extractSurfaceNetsBaseline } from './surfaceNetsBaseline.node.js';

export function createMesherBakeOffAdapters({ mc33BinaryPath } = {}) {
  return Object.freeze([
    Object.freeze({
      id: 'surface-nets-baseline',
      label: 'Existing QEF Surface Nets',
      license: 'ToonLab MIT',
      role: 'frozen failing baseline',
      async extract(grid, evaluate) {
        return extractSurfaceNetsBaseline(grid, { evaluate });
      },
    }),
    Object.freeze({
      id: 'vega-mc33-reference',
      label: 'Vega MC33 v5.5',
      license: 'MIT; David E. Vega M. and Javier E. Abache R.',
      role: 'correct-interior-test topology reference; not copied into ToonLab',
      async extract(grid, evaluate) {
        return extractMc33Reference(grid, { binaryPath: mc33BinaryPath, evaluate });
      },
    }),
    Object.freeze({
      id: 'toonlab-manifold-dual-contouring',
      label: 'ToonLab Manifold Dual Contouring',
      license: 'ToonLab MIT; independent implementation from the 2007 paper',
      role: 'production candidate',
      async extract(grid, evaluate) {
        return extractManifoldDualContouring(grid, { evaluate });
      },
    }),
  ]);
}

export function auditMesherOutput(mesh, grid, evaluate, {
  includeHausdorff = true,
  includeSelfIntersections = true,
  maxGridSamples = 12_000,
} = {}) {
  const topology = auditMeshTopology(mesh, { evaluate, grid, includeSelfIntersections });
  const hausdorff = includeHausdorff
    ? auditHausdorff(mesh, grid, evaluate, { maxGridSamples })
    : null;
  return { hausdorff, topology };
}
