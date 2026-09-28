import { canonicalizeJson, contentId } from '../canonical.node.js';
import { queryBlockAtPoint } from '../fractures/blockExtraction.node.js';
import { frameToWorld } from '../structure/math.node.js';
import { compileProcessFieldProgram } from './program.node.js';
import { createProcessField } from './field.node.js';

export const PROCESS_STAGE_SCHEMA = 'toonlab/rock-process-stage-output';
export const PROCESS_STAGE_VERSION = 1;

function gridCoordinates(index, dimensions) {
  const x = index % dimensions[0];
  const yz = (index - x) / dimensions[0];
  const y = yz % dimensions[1];
  const z = (yz - y) / dimensions[1];
  return [x, y, z];
}

function cellWorldPoint(index, blockModel, structuralProgram) {
  const coordinates = gridCoordinates(index, blockModel.grid.dimensions);
  const local = coordinates.map((coordinate, axis) => (
    -blockModel.grid.halfExtentsMetres[axis]
      + (coordinate + 0.5) * blockModel.grid.cellSizeMetres[axis]
  ));
  return frameToWorld(structuralProgram.frames.formation, local);
}

function expandRuns(runs) {
  const result = [];
  for (const [start, count] of runs) for (let offset = 0; offset < count; offset += 1) result.push(start + offset);
  return result;
}

function supportSolution(blockModel, blockStates, field) {
  const stateById = new Map(blockStates.map((state) => [state.blockId, state]));
  const originalNodeById = new Map(blockModel.supportGraph.nodes.map((node) => [node.blockId, node]));
  const grounded = blockStates
    .filter((state) => state.retainedCellCount > 0 && originalNodeById.get(state.blockId)?.grounded)
    .map((state) => state.blockId)
    .sort();
  const viableEdges = [];
  for (const edge of blockModel.supportGraph.edges) {
    const lower = stateById.get(edge.supportingBlockId);
    const upper = stateById.get(edge.supportedBlockId);
    if (!lower || !upper || lower.retainedCellCount === 0 || upper.retainedCellCount === 0) continue;
    const upperBlock = blockModel.blocks.find((block) => block.id === upper.blockId);
    const bond = 1 - field.sample(upperBlock.centroidMetres).environment.bondWeakening;
    const survivingContactFraction = Math.min(lower.retainedFraction, upper.retainedFraction) * bond;
    if (survivingContactFraction < 0.075) continue;
    viableEdges.push({
      ...edge,
      bondStrengthNormalized: bond,
      survivingContactAreaMetres2: edge.contactAreaMetres2 * survivingContactFraction,
      survivingContactFraction,
    });
  }
  const supported = new Set(grounded);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of viableEdges) {
      if (supported.has(edge.supportingBlockId) && !supported.has(edge.supportedBlockId)) {
        supported.add(edge.supportedBlockId);
        changed = true;
      }
    }
  }
  const unsupportedBlockIds = blockStates
    .filter((state) => state.retainedCellCount > 0 && !supported.has(state.blockId))
    .map((state) => state.blockId)
    .sort();
  return {
    groundedBlockIds: grounded,
    supportedBlockIds: [...supported].sort(),
    unsupportedBlockIds,
    viableEdges,
  };
}

function initialRoundness(shapeClass) {
  return ({ equidimensional: 0.22, polyhedral: 0.12, rhombohedral: 0.1, tabular: 0.08 })[shapeClass] ?? 0.1;
}

function transportAssembly(program, blockModel, blockStates, detachedBlockIds, structuralProgram, field) {
  const enabled = program.transport.enabledProcesses;
  const depositLandforms = new Set(['talus-fan', 'scree', 'rockfall-deposit', 'moraine', 'river-bar', 'beach-ridge', 'boulder-field']);
  const transportRequested = enabled.length > 0 || depositLandforms.has(program.source.landform) || program.source.detached;
  if (!transportRequested) {
    return {
      abrasionLossMetres3: 0,
      depositedVolumeMetres3: 0,
      inputDetachedVolumeMetres3: 0,
      massResidualMetres3: 0,
      pieces: [],
      stableAssembly: { passed: true, unsupportedPieceCount: 0 },
    };
  }
  const stateById = new Map(blockStates.map((state) => [state.blockId, state]));
  let sourceBlocks = blockModel.blocks.filter((block) => detachedBlockIds.includes(block.id));
  if (sourceBlocks.length === 0 && program.source.detached) {
    sourceBlocks = blockModel.blocks.filter((block) => stateById.get(block.id)?.retainedCellCount > 0);
  }
  sourceBlocks = sourceBlocks.sort((left, right) => right.volumeMetres3 - left.volumeMetres3 || left.id.localeCompare(right.id));
  const characteristic = Math.max(...program.targetDimensionsMetres);
  const waterTransport = enabled.some((process) => ['transport-rounding', 'sorting', 'imbrication'].includes(process))
    || ['river-bar', 'beach-ridge'].includes(program.source.landform);
  const distance = program.transport.distanceMetres || (waterTransport ? characteristic * 35 : characteristic * 2.4);
  const pieces = sourceBlocks.map((block, index) => {
    const sourceVolume = stateById.get(block.id)?.retainedCellCount
      ? stateById.get(block.id).retainedCellCount * blockModel.grid.cellSizeMetres.reduce((product, value) => product * value, 1)
      : block.volumeMetres3;
    const sample = field.sample(block.centroidMetres);
    const hardness = sample.base.materialFields.hardnessNormalized;
    const travelNormalized = Math.min(1, Math.log1p(distance / Math.max(characteristic, 1e-9)) / Math.log(101));
    const abrasionFraction = Math.min(0.28, travelNormalized * (0.025 + (1 - hardness) * 0.115) * (waterTransport ? 1.35 : 0.62));
    const depositedVolume = sourceVolume * (1 - abrasionFraction);
    const radius = Math.cbrt(depositedVolume * 0.2387324146);
    const sizeRank = sourceBlocks.length <= 1 ? 0.5 : index / (sourceBlocks.length - 1);
    const runout = distance * (waterTransport ? 0.22 + sizeRank * 0.58 : 0.2 + (1 - sizeRank) * 0.62);
    const crossSlope = ((index % 2 === 0 ? 1 : -1) * (Math.floor(index / 2) + 0.5)) * radius * 1.9;
    const beforeRoundness = initialRoundness(block.shapeClass);
    const afterRoundness = Math.min(0.96, beforeRoundness + travelNormalized * (waterTransport ? 0.58 : 0.19));
    const fabricKind = block.fabricKind;
    return {
      abrasionLossMetres3: sourceVolume - depositedVolume,
      depositedVolumeMetres3: depositedVolume,
      deposition: {
        burialFraction: Math.min(0.42, 0.08 + index / Math.max(sourceBlocks.length, 1) * 0.26),
        imbricationDegrees: waterTransport ? 18 + (index % 4) * 3 : 28 + (index % 3) * 5,
        positionMetres: [crossSlope, radius * 0.82, runout],
        sortedSizeRank: sizeRank,
        supportId: 'ground-plane',
      },
      id: `transport-piece-${String(index + 1).padStart(4, '0')}`,
      lineage: {
        sourceBlockId: block.id,
        sourceFabricKind: fabricKind,
        sourceFormationId: program.source.sourceFormationId ?? program.source.formationId,
        sourceLithology: program.source.sourceLithology ?? program.lithology,
      },
      shape: {
        afterRoundnessNormalized: afterRoundness,
        beforeRoundnessNormalized: beforeRoundness,
        sourceShapeClass: block.shapeClass,
      },
      sourceVolumeMetres3: sourceVolume,
    };
  });
  const input = pieces.reduce((sum, piece) => sum + piece.sourceVolumeMetres3, 0);
  const deposited = pieces.reduce((sum, piece) => sum + piece.depositedVolumeMetres3, 0);
  const abrasion = pieces.reduce((sum, piece) => sum + piece.abrasionLossMetres3, 0);
  return {
    abrasionLossMetres3: abrasion,
    depositedVolumeMetres3: deposited,
    inputDetachedVolumeMetres3: input,
    massResidualMetres3: input - deposited - abrasion,
    pieces,
    stableAssembly: {
      passed: pieces.every((piece) => piece.deposition.supportId === 'ground-plane' && piece.deposition.positionMetres[1] >= 0),
      unsupportedPieceCount: pieces.filter((piece) => !piece.deposition.supportId).length,
    },
  };
}

export function compileProcessStage(recipeValue, structuralProgram, fractureStage, options = {}) {
  const program = compileProcessFieldProgram(recipeValue, structuralProgram, fractureStage, options);
  const field = createProcessField(program, structuralProgram, fractureStage, { timeFraction: 1 });
  const blockModel = fractureStage.blockModel;
  const cellVolume = blockModel.grid.cellSizeMetres.reduce((product, value) => product * value, 1);
  const cellState = new Int8Array(blockModel.cellBlockIndices.length).fill(-1);
  const blockStates = blockModel.blocks.map((block) => {
    const cells = expandRuns(block.cellRuns);
    let retainedCellCount = 0;
    let damageSum = 0;
    for (const cell of cells) {
      const sample = field.sample(cellWorldPoint(cell, blockModel, structuralProgram));
      damageSum += sample.damageNormalized;
      if (sample.signedDistanceMetres <= 0) {
        retainedCellCount += 1;
        cellState[cell] = 1;
      } else cellState[cell] = 0;
    }
    return {
      blockId: block.id,
      meanDamageNormalized: damageSum / Math.max(cells.length, 1),
      originalCellCount: cells.length,
      retainedCellCount,
      retainedFraction: retainedCellCount / Math.max(cells.length, 1),
    };
  });
  const support = supportSolution(blockModel, blockStates, field);
  const detached = new Set(support.unsupportedBlockIds);
  let directErodedCells = 0;
  let detachedCells = 0;
  let retainedCells = 0;
  const transferredDetachedBlockIds = new Set();
  for (let cell = 0; cell < cellState.length; cell += 1) {
    if (blockModel.cellBlockIndices[cell] < 0) continue;
    if (cellState[cell] === 0) directErodedCells += 1;
    else if (detached.has(blockModel.blocks[blockModel.cellBlockIndices[cell]].id)) {
      cellState[cell] = 2;
      detachedCells += 1;
      transferredDetachedBlockIds.add(blockModel.blocks[blockModel.cellBlockIndices[cell]].id);
    } else retainedCells += 1;
  }
  const unsupportedFloatingBlockIdsAfterStage = support.unsupportedBlockIds.filter((blockId) => (
    !transferredDetachedBlockIds.has(blockId)
    && blockStates.find((state) => state.blockId === blockId)?.retainedCellCount > 0
  ));
  const parentCells = blockModel.grid.activeCells;
  const massAccounting = {
    cellVolumeMetres3: cellVolume,
    detachedCells,
    detachedVolumeMetres3: detachedCells * cellVolume,
    directErodedCells,
    directErodedVolumeMetres3: directErodedCells * cellVolume,
    parentCells,
    parentVolumeMetres3: parentCells * cellVolume,
    residualCells: parentCells - retainedCells - directErodedCells - detachedCells,
    residualMetres3: (parentCells - retainedCells - directErodedCells - detachedCells) * cellVolume,
    retainedCells,
    retainedVolumeMetres3: retainedCells * cellVolume,
  };
  const transport = transportAssembly(program, blockModel, blockStates, support.unsupportedBlockIds, structuralProgram, field);
  const base = {
    schema: PROCESS_STAGE_SCHEMA,
    version: PROCESS_STAGE_VERSION,
    blockStates,
    cellState: [...cellState],
    fractureBlockOutputContentId: fractureStage.outputContentId,
    massAccounting,
    processProgram: program,
    recipeContentId: program.recipeContentId,
    stabilityResult: {
      ...support,
      passed: unsupportedFloatingBlockIdsAfterStage.length === 0,
      transferredDetachedBlockIds: [...transferredDetachedBlockIds].sort(),
      unsupportedFloatingBlockIdsAfterStage,
      unsupportedFloatingComponentsAfterStage: unsupportedFloatingBlockIdsAfterStage.length,
    },
    structureProgramContentId: structuralProgram.programContentId,
    transport,
  };
  return canonicalizeJson({ ...base, outputContentId: contentId(base) });
}

export function createStableProcessField(stage, structuralProgram, fractureStage, options = {}) {
  const raw = createProcessField(stage.processProgram, structuralProgram, fractureStage, options);
  const detached = new Set(stage.stabilityResult.unsupportedBlockIds);
  const minimumRemoval = Math.min(...fractureStage.blockModel.grid.cellSizeMetres) * 0.2;
  return Object.freeze({
    evaluate(x, y, z) {
      const value = raw.evaluate(x, y, z);
      if (value > 0 || detached.size === 0) return value;
      const block = queryBlockAtPoint(fractureStage.blockModel, structuralProgram, [x, y, z]);
      return block && detached.has(block.id) ? Math.max(minimumRemoval, value) : value;
    },
    raw,
    sample: raw.sample,
  });
}
