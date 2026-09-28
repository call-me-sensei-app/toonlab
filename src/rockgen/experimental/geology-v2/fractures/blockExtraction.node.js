import { canonicalizeJson, contentId } from '../canonical.node.js';
import { createStructuralField } from '../structure/field.node.js';
import {
  add3,
  dot3,
  frameToWorld,
  length3,
  scale3,
  subtract3,
  worldToFrame,
} from '../structure/math.node.js';
import { fractureIntersectsSegment } from './network.node.js';
import { buildFlatSpatialIndex, querySpatialIndex, segmentQueryBounds } from './spatialIndex.node.js';

export const IMPLICIT_BLOCK_MODEL_SCHEMA = 'toonlab/rock-implicit-block-model';
export const IMPLICIT_BLOCK_MODEL_VERSION = 1;

class UnionFind {
  constructor(size, active) {
    this.parent = new Int32Array(size).fill(-1);
    this.rank = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) if (active[index]) this.parent[index] = index;
  }

  find(value) {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[value] !== value) {
      const next = this.parent[value];
      this.parent[value] = root;
      value = next;
    }
    return root;
  }

  union(left, right) {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    if (this.rank[leftRoot] < this.rank[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    this.parent[rightRoot] = leftRoot;
    if (this.rank[leftRoot] === this.rank[rightRoot]) this.rank[leftRoot] += 1;
  }
}

function gridIndex(x, y, z, dimensions) {
  return x + dimensions[0] * (y + dimensions[1] * z);
}

function gridCoordinates(index, dimensions) {
  const x = index % dimensions[0];
  const yz = (index - x) / dimensions[0];
  const y = yz % dimensions[1];
  const z = (yz - y) / dimensions[1];
  return [x, y, z];
}

function cellLocalPoint(coordinates, dimensions, halfExtents) {
  return coordinates.map((coordinate, axis) => (
    -halfExtents[axis] + (coordinate + 0.5) * (halfExtents[axis] * 2 / dimensions[axis])
  ));
}

function runs(indices) {
  if (indices.length === 0) return [];
  const result = [];
  let start = indices[0];
  let previous = start;
  for (let index = 1; index < indices.length; index += 1) {
    if (indices[index] !== previous + 1) {
      result.push([start, previous - start + 1]);
      start = indices[index];
    }
    previous = indices[index];
  }
  result.push([start, previous - start + 1]);
  return result;
}

function blockBounds(worldPoints, cellDiagonal) {
  const padding = cellDiagonal * 0.5;
  return {
    maximum: [0, 1, 2].map((axis) => Math.max(...worldPoints.map((point) => point[axis])) + padding),
    minimum: [0, 1, 2].map((axis) => Math.min(...worldPoints.map((point) => point[axis])) - padding),
  };
}

function uniqueNormals(fractureIds, fractureById) {
  const normals = [];
  for (const id of fractureIds) {
    const normal = fractureById.get(id)?.frame.normal;
    if (!normal) continue;
    if (!normals.some((candidate) => Math.abs(dot3(candidate, normal)) > 0.94)) normals.push(normal);
  }
  return normals;
}

function classifyShape(localDimensions, normals) {
  const sorted = [...localDimensions].sort((a, b) => a - b);
  const aspect = sorted[0] / Math.max(sorted[2], 1e-12);
  if (aspect < 0.32) return 'tabular';
  if (normals.length >= 4) return 'polyhedral';
  if (normals.length >= 3) {
    const dotProducts = [];
    for (let left = 0; left < normals.length; left += 1) for (let right = left + 1; right < normals.length; right += 1) {
      dotProducts.push(Math.abs(dot3(normals[left], normals[right])));
    }
    const maximum = Math.max(...dotProducts);
    const mean = dotProducts.reduce((sum, value) => sum + value, 0) / dotProducts.length;
    if (maximum < 0.28) return 'equidimensional';
    if (mean >= 0.18 && mean <= 0.82) return 'rhombohedral';
  }
  if (aspect > 0.66) return 'equidimensional';
  return 'polyhedral';
}

function pairKey(left, right) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function extractImplicitBlocks(fractureProgram, structuralProgram, options = {}) {
  if (fractureProgram.structureProgramContentId !== structuralProgram.programContentId) {
    throw new RangeError('Implicit block extraction requires the StructuralFieldProgram used by the fracture network.');
  }
  const field = createStructuralField(structuralProgram);
  const longestAxisCells = options.longestAxisCells ?? 28;
  if (!Number.isInteger(longestAxisCells) || longestAxisCells < 8 || longestAxisCells > 96) {
    throw new RangeError('Block extraction longestAxisCells must be an integer from 8 through 96.');
  }
  const physicalDimensions = structuralProgram.bounds.halfExtentsMetres.map((value) => value * 2);
  const longestPhysical = Math.max(...physicalDimensions);
  const dimensions = physicalDimensions.map((value) => Math.max(8, Math.round(value / longestPhysical * longestAxisCells)));
  const cellSize = physicalDimensions.map((value, axis) => value / dimensions[axis]);
  const cellVolume = cellSize[0] * cellSize[1] * cellSize[2];
  const cellDiagonal = Math.hypot(...cellSize);
  const cellCount = dimensions[0] * dimensions[1] * dimensions[2];
  const active = new Uint8Array(cellCount);
  const worldPoints = new Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    const local = cellLocalPoint(gridCoordinates(index, dimensions), dimensions, structuralProgram.bounds.halfExtentsMetres);
    const world = frameToWorld(structuralProgram.frames.formation, local);
    worldPoints[index] = world;
    if (field.evaluate(world).insideFormation) active[index] = 1;
  }
  const fractureById = new Map(fractureProgram.fractures.map((fracture) => [fracture.id, fracture]));
  const fracturesByEventId = new Map();
  for (const fracture of fractureProgram.fractures) {
    if (!fracturesByEventId.has(fracture.eventId)) fracturesByEventId.set(fracture.eventId, []);
    fracturesByEventId.get(fracture.eventId).push(fracture);
  }
  const maximumRoughnessMetres = Math.max(...fractureProgram.fractures.map((fracture) => fracture.roughnessMetres), 0);
  const union = new UnionFind(cellCount, active);
  const blockedFaces = [];
  const directions = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let index = 0; index < cellCount; index += 1) {
    if (!active[index]) continue;
    const coordinate = gridCoordinates(index, dimensions);
    for (let axis = 0; axis < 3; axis += 1) {
      const neighborCoordinate = coordinate.map((value, currentAxis) => value + directions[axis][currentAxis]);
      if (neighborCoordinate[axis] >= dimensions[axis]) continue;
      const neighbor = gridIndex(...neighborCoordinate, dimensions);
      if (!active[neighbor]) continue;
      const start = worldPoints[index];
      const end = worldPoints[neighbor];
      const candidates = querySpatialIndex(
        fractureProgram.spatialIndex,
        segmentQueryBounds(start, end, maximumRoughnessMetres),
      );
      const hits = [];
      for (const fractureId of candidates) {
        const fracture = fractureById.get(fractureId);
        const hit = fractureIntersectsSegment(fractureProgram, structuralProgram, fracture, start, end, {
          fracturesByEventId,
          structuralField: field,
        });
        if (hit) hits.push(fractureId);
      }
      if (hits.length === 0) union.union(index, neighbor);
      else blockedFaces.push({ axis, fractureIds: hits.sort(), leftCell: index, rightCell: neighbor });
    }
  }

  const componentCells = new Map();
  for (let index = 0; index < cellCount; index += 1) {
    if (!active[index]) continue;
    const root = union.find(index);
    if (!componentCells.has(root)) componentCells.set(root, []);
    componentCells.get(root).push(index);
  }
  const orderedComponents = [...componentCells.values()].sort((left, right) => left[0] - right[0]);
  const blockIndexByCell = new Int32Array(cellCount).fill(-1);
  orderedComponents.forEach((cells, blockIndex) => {
    for (const cell of cells) blockIndexByCell[cell] = blockIndex;
  });
  const fractureIdsByBlock = orderedComponents.map(() => new Set());
  for (const face of blockedFaces) {
    const left = blockIndexByCell[face.leftCell];
    const right = blockIndexByCell[face.rightCell];
    for (const id of face.fractureIds) {
      fractureIdsByBlock[left].add(id);
      fractureIdsByBlock[right].add(id);
    }
  }
  const blocks = orderedComponents.map((cells, blockIndex) => {
    const coordinates = cells.map((cell) => gridCoordinates(cell, dimensions));
    const minimum = [0, 1, 2].map((axis) => Math.min(...coordinates.map((point) => point[axis])));
    const maximum = [0, 1, 2].map((axis) => Math.max(...coordinates.map((point) => point[axis])));
    const localDimensions = maximum.map((value, axis) => (value - minimum[axis] + 1) * cellSize[axis]);
    const centroidMetres = scale3(cells.reduce((sum, cell) => add3(sum, worldPoints[cell]), [0, 0, 0]), 1 / cells.length);
    const material = field.evaluate(centroidMetres);
    const boundaryFractureIds = [...fractureIdsByBlock[blockIndex]].sort();
    const normals = uniqueNormals(boundaryFractureIds, fractureById);
    const id = `block-${String(blockIndex + 1).padStart(5, '0')}`;
    return {
      boundaryFractureIds,
      bounds: blockBounds(cells.map((cell) => worldPoints[cell]), cellDiagonal),
      cellCount: cells.length,
      cellRuns: runs(cells),
      centroidMetres,
      fabricKind: material.fabricFields.kind,
      id,
      inheritedMaterialId: material.materialId,
      localDimensionsMetres: localDimensions,
      shapeClass: classifyShape(localDimensions, normals),
      volumeMetres3: cells.length * cellVolume,
    };
  });
  const blockByIndex = blocks;
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const adjacency = new Map();
  for (const face of blockedFaces) {
    const leftIndex = blockIndexByCell[face.leftCell];
    const rightIndex = blockIndexByCell[face.rightCell];
    if (leftIndex === rightIndex) continue;
    const key = pairKey(leftIndex, rightIndex);
    if (!adjacency.has(key)) adjacency.set(key, {
      contactAreaMetres2: 0,
      faceCount: 0,
      fractureIds: new Set(),
      leftIndex: Math.min(leftIndex, rightIndex),
      rightIndex: Math.max(leftIndex, rightIndex),
      verticalNormalWeight: 0,
    });
    const record = adjacency.get(key);
    const faceArea = cellSize[(face.axis + 1) % 3] * cellSize[(face.axis + 2) % 3];
    record.contactAreaMetres2 += faceArea;
    record.faceCount += 1;
    for (const id of face.fractureIds) record.fractureIds.add(id);
    const axisVector = [
      structuralProgram.frames.formation.strike,
      structuralProgram.frames.formation.downDip,
      structuralProgram.frames.formation.normal,
    ][face.axis];
    record.verticalNormalWeight += Math.abs(axisVector[1]) * faceArea;
  }
  const adjacencyEdges = [...adjacency.values()].map((record, index) => ({
    contactAreaMetres2: record.contactAreaMetres2,
    faceCount: record.faceCount,
    fractureIds: [...record.fractureIds].sort(),
    id: `adjacency-${String(index + 1).padStart(5, '0')}`,
    leftBlockId: blockByIndex[record.leftIndex].id,
    rightBlockId: blockByIndex[record.rightIndex].id,
    verticalContactFraction: record.verticalNormalWeight / Math.max(record.contactAreaMetres2, 1e-12),
  })).sort((left, right) => left.leftBlockId.localeCompare(right.leftBlockId) || left.rightBlockId.localeCompare(right.rightBlockId));

  const minimumWorldY = Math.min(...worldPoints.filter((_, index) => active[index]).map((point) => point[1]));
  const supportNodes = blocks.map((block) => {
    const grounded = block.bounds.minimum[1] <= minimumWorldY + cellDiagonal;
    return {
      blockId: block.id,
      grounded,
      massProxyKilograms: block.volumeMetres3 * structuralProgram.baseMaterialProperties.densityKilogramsPerCubicMetre,
    };
  });
  const supportEdges = adjacencyEdges.filter((edge) => edge.verticalContactFraction >= 0.35).map((edge, index) => {
    const left = blockById.get(edge.leftBlockId);
    const right = blockById.get(edge.rightBlockId);
    const lower = left.centroidMetres[1] <= right.centroidMetres[1] ? left : right;
    const upper = lower === left ? right : left;
    return {
      contactAreaMetres2: edge.contactAreaMetres2,
      id: `support-${String(index + 1).padStart(5, '0')}`,
      supportedBlockId: upper.id,
      supportingBlockId: lower.id,
    };
  });
  const assignedCells = blocks.reduce((sum, block) => sum + block.cellCount, 0);
  const activeCells = active.reduce((sum, value) => sum + value, 0);
  const base = {
    schema: IMPLICIT_BLOCK_MODEL_SCHEMA,
    version: IMPLICIT_BLOCK_MODEL_VERSION,
    fractureProgramContentId: fractureProgram.programContentId,
    structureProgramContentId: structuralProgram.programContentId,
    grid: {
      activeCells,
      cellSizeMetres: cellSize,
      dimensions,
      halfExtentsMetres: structuralProgram.bounds.halfExtentsMetres,
      longestAxisCells,
      sampledParentVolumeMetres3: activeCells * cellVolume,
    },
    blocks,
    cellBlockIndices: [...blockIndexByCell],
    adjacencyGraph: { nodes: blocks.map((block) => block.id), edges: adjacencyEdges },
    supportGraph: { nodes: supportNodes, edges: supportEdges },
    occupancyAudit: {
      activeCells,
      assignedCells,
      gapCells: activeCells - assignedCells,
      overlapCells: 0,
      relativeResidual: (activeCells - assignedCells) / Math.max(activeCells, 1),
    },
    spatialIndex: buildFlatSpatialIndex(blocks),
  };
  return canonicalizeJson({ ...base, modelContentId: contentId(base) });
}

export function queryBlockAtPoint(blockModel, structuralProgram, worldPoint) {
  const candidates = querySpatialIndex(blockModel.spatialIndex, { maximum: worldPoint, minimum: worldPoint });
  if (candidates.length === 0) return null;
  const local = worldToFrame(structuralProgram.frames.formation, worldPoint);
  const coordinates = local.map((value, axis) => Math.floor(
    (value + blockModel.grid.halfExtentsMetres[axis]) / blockModel.grid.cellSizeMetres[axis],
  ));
  if (coordinates.some((value, axis) => value < 0 || value >= blockModel.grid.dimensions[axis])) return null;
  const index = gridIndex(...coordinates, blockModel.grid.dimensions);
  const blockIndex = blockModel.cellBlockIndices[index];
  return blockIndex >= 0 ? blockModel.blocks[blockIndex] : null;
}
