import { surfaceNets } from '../../../mesh/surfaceNets.js';

import { assertScalarGrid } from './scalarGrid.node.js';

export function extractSurfaceNetsBaseline(grid, { evaluate = null } = {}) {
  assertScalarGrid(grid);
  const baseline = surfaceNets({
    cellSize: grid.cellSize,
    dims: [...grid.cellDims],
    origin: [...grid.origin],
    values: grid.values,
  }, { evaluate });
  return {
    indices: new Uint32Array(baseline.indices),
    metadata: {
      algorithm: 'toonlab-qef-surface-nets-baseline',
      baselineFrozen: true,
      cellSize: grid.cellSize,
      topologyGuarantee: 'none',
    },
    positions: new Float64Array(baseline.positions),
  };
}
