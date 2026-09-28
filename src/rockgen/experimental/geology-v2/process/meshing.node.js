import { sampleScalarField } from '../meshing/scalarGrid.node.js';
import { extractManifoldDualContouring } from '../meshing/manifoldDualContouring.node.js';
import { frameToWorld } from '../structure/math.node.js';
import { createProcessField } from './field.node.js';
import { createStableProcessField } from './stability.node.js';

export function processMeshBounds(structuralProgram, paddingFraction = 0.08) {
  const points = [];
  const extents = structuralProgram.bounds.halfExtentsMetres;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    points.push(frameToWorld(structuralProgram.frames.formation, [x * extents[0], y * extents[1], z * extents[2]]));
  }
  const padding = Math.max(...extents) * paddingFraction;
  return {
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])) + padding),
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])) - padding),
  };
}

export function meshProcessStage(stage, structuralProgram, fractureStage, options = {}) {
  const timeFraction = options.timeFraction ?? 1;
  const field = options.applyStability === false
    ? createProcessField(stage.processProgram, structuralProgram, fractureStage, { timeFraction })
    : createStableProcessField(stage, structuralProgram, fractureStage, { timeFraction });
  const bounds = options.bounds ?? processMeshBounds(structuralProgram);
  const grid = sampleScalarField({
    bounds,
    evaluate: field.evaluate,
    resolution: options.resolution ?? 64,
    sourceId: `${stage.outputContentId}/time-${timeFraction}/${options.applyStability === false ? 'pre-detachment' : 'stable'}`,
  });
  const mesh = extractManifoldDualContouring(grid, { evaluate: field.evaluate });
  return { bounds, field, grid, mesh };
}

export function meshToObj(mesh, options = {}) {
  const name = options.name ?? 'toonlab-c6-process-rock';
  const lines = [`o ${name}`];
  for (let index = 0; index < mesh.positions.length; index += 3) {
    lines.push(`v ${mesh.positions[index]} ${mesh.positions[index + 1]} ${mesh.positions[index + 2]}`);
  }
  for (let index = 0; index < mesh.indices.length; index += 3) {
    lines.push(`f ${mesh.indices[index] + 1} ${mesh.indices[index + 1] + 1} ${mesh.indices[index + 2] + 1}`);
  }
  return `${lines.join('\n')}\n`;
}
