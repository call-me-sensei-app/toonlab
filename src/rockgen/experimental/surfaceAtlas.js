// Repository-only six-chart atlas for convex and near-convex rock assets.
// It is intentionally conservative: overhang-heavy families need a proper
// chart unwrap before they can pass this compiler's projection-overlap gate.

import * as THREE from 'three';

export const ROCK_ATLAS_CHARTS = Object.freeze([
  Object.freeze({ axis: 0, col: 0, direction: 1, row: 0 }),
  Object.freeze({ axis: 0, col: 1, direction: -1, row: 0 }),
  Object.freeze({ axis: 1, col: 2, direction: 1, row: 0 }),
  Object.freeze({ axis: 1, col: 0, direction: -1, row: 1 }),
  Object.freeze({ axis: 2, col: 1, direction: 1, row: 1 }),
  Object.freeze({ axis: 2, col: 2, direction: -1, row: 1 }),
]);

function chartIndexForNormal(nx, ny, nz) {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= ay && ax >= az) return nx >= 0 ? 0 : 1;
  if (ay >= ax && ay >= az) return ny >= 0 ? 2 : 3;
  return nz >= 0 ? 4 : 5;
}

function normalize(value, min, max) {
  return Math.min(Math.max((value - min) / Math.max(max - min, 1e-6), 0), 1);
}

function projectToChart(position, chartIndex, bounds, atlasResolution, gutterTexels) {
  const x = normalize(position[0], bounds.min.x, bounds.max.x);
  const y = normalize(position[1], bounds.min.y, bounds.max.y);
  const z = normalize(position[2], bounds.min.z, bounds.max.z);
  let localU;
  let localV;
  if (chartIndex === 0) [localU, localV] = [z, y];
  else if (chartIndex === 1) [localU, localV] = [1 - z, y];
  else if (chartIndex === 2) [localU, localV] = [x, 1 - z];
  else if (chartIndex === 3) [localU, localV] = [x, z];
  else if (chartIndex === 4) [localU, localV] = [1 - x, y];
  else [localU, localV] = [x, y];

  const chart = ROCK_ATLAS_CHARTS[chartIndex];
  const gutterU = gutterTexels / atlasResolution;
  const gutterV = gutterTexels / atlasResolution;
  const u0 = chart.col / 3 + gutterU;
  const u1 = (chart.col + 1) / 3 - gutterU;
  const v0 = chart.row / 2 + gutterV;
  const v1 = (chart.row + 1) / 2 - gutterV;
  return [u0 + localU * (u1 - u0), v0 + localV * (v1 - v0)];
}

export function createSixChartRockAtlas(geometry, {
  atlasResolution = 512,
  gutterTexels = 5,
} = {}) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const index = geometry.index;
  if (!position || !normal || !index) {
    throw new Error('Rock atlas requires indexed position and normal attributes.');
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox.clone();

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const triangleCharts = new Uint8Array(index.count / 3);
  const remap = new Map();
  const sourcePosition = [0, 0, 0];

  for (let offset = 0; offset < index.count; offset += 3) {
    const sourceIndices = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const sourceIndex of sourceIndices) {
      nx += normal.getX(sourceIndex);
      ny += normal.getY(sourceIndex);
      nz += normal.getZ(sourceIndex);
    }
    const chartIndex = chartIndexForNormal(nx, ny, nz);
    triangleCharts[offset / 3] = chartIndex;

    for (const sourceIndex of sourceIndices) {
      const key = `${sourceIndex}:${chartIndex}`;
      let targetIndex = remap.get(key);
      if (targetIndex === undefined) {
        targetIndex = positions.length / 3;
        remap.set(key, targetIndex);
        sourcePosition[0] = position.getX(sourceIndex);
        sourcePosition[1] = position.getY(sourceIndex);
        sourcePosition[2] = position.getZ(sourceIndex);
        const uv = projectToChart(
          sourcePosition,
          chartIndex,
          bounds,
          atlasResolution,
          gutterTexels,
        );
        positions.push(...sourcePosition);
        normals.push(
          normal.getX(sourceIndex),
          normal.getY(sourceIndex),
          normal.getZ(sourceIndex),
        );
        uvs.push(...uv);
      }
      indices.push(targetIndex);
    }
  }

  const atlasGeometry = new THREE.BufferGeometry();
  atlasGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  atlasGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  atlasGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  atlasGeometry.setIndex(indices);
  atlasGeometry.computeBoundingBox();
  atlasGeometry.computeBoundingSphere();
  return {
    bounds,
    geometry: atlasGeometry,
    gutterTexels,
    triangleCharts,
  };
}

