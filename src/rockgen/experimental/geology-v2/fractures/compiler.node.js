import { canonicalizeJson, contentId } from '../canonical.node.js';
import { extractImplicitBlocks } from './blockExtraction.node.js';
import { compileFractureNetworkProgram } from './network.node.js';

export const FRACTURE_BLOCK_STAGE_SCHEMA = 'toonlab/rock-fracture-block-stage-output';
export const FRACTURE_BLOCK_STAGE_VERSION = 1;
export const FRACTURE_BLOCK_GRID_LONGEST_AXIS_CELLS = 28;

/**
 * Checkpoint-5 implementation of the frozen fracture-network stage. The grid
 * setting is compiler-version state, not an undeclared recipe input.
 */
export function compileFractureBlockStage(recipeValue, structuralProgram, options = {}) {
  const fractureNetwork = compileFractureNetworkProgram(recipeValue, structuralProgram, options);
  const blockModel = extractImplicitBlocks(fractureNetwork, structuralProgram, {
    longestAxisCells: FRACTURE_BLOCK_GRID_LONGEST_AXIS_CELLS,
  });
  const base = {
    schema: FRACTURE_BLOCK_STAGE_SCHEMA,
    version: FRACTURE_BLOCK_STAGE_VERSION,
    blockGridLongestAxisCells: FRACTURE_BLOCK_GRID_LONGEST_AXIS_CELLS,
    blockModel,
    fractureNetwork,
    recipeContentId: fractureNetwork.recipeContentId,
    structureProgramContentId: structuralProgram.programContentId,
  };
  return canonicalizeJson({ ...base, outputContentId: contentId(base) });
}
