#!/usr/bin/env node

/**
 * C8 measured-morphology audit.
 *
 * This is deliberately independent of the basis field's declared feature vector.
 * Every value used for diagnosis is reconstructed from emitted triangle geometry.
 * Proposed thresholds are evidence-gathering aids, not C8 approval gates.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { meshC8BasisFixture } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixture, listC8BasisDefinitions } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';

const ROOT = process.cwd();
const C8_DIRECTORY = path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families');
const CURRENT_V3_DIRECTORY = path.join(C8_DIRECTORY, 'clay-identification-review/current-v3-source');
const OUTPUT_DIRECTORY = path.join(C8_DIRECTORY, 'measured-morphology');
const DIAGNOSTIC_RESOLUTION = 36;
const FRESH_SEED_INDICES = Object.freeze([0, 1, 2, 3, 4, 5]);
const RASTER_SIZE = 64;

const GENERATOR_SOURCE_FILES = Object.freeze([
  'src/rockgen/experimental/geology-v2/basis/compiler.node.js',
  'src/rockgen/experimental/geology-v2/basis/field.node.js',
  'src/rockgen/experimental/geology-v2/basis/fixtures.node.js',
  'src/rockgen/experimental/geology-v2/meshing/manifoldDualContouring.node.js',
  'src/rockgen/experimental/geology-v2/meshing/meshContract.node.js',
  'src/rockgen/experimental/geology-v2/meshing/scalarGrid.node.js',
]);

// These are declared before any measurement is performed. "predeclared" means
// an existing C8 topology contract; every other value is explicitly proposed.
const THRESHOLDS = Object.freeze({
  common: Object.freeze({
    minimumSupportAreaRatio: Object.freeze({ value: 0.004, status: 'proposed-diagnostic' }),
    maximumUnsupportedCentroidOffset: Object.freeze({ value: 0.12, status: 'proposed-diagnostic' }),
  }),
  classes: Object.freeze({
    'granite-boulder': Object.freeze({ minimumSphericity: 0.62, maximumHeightToHorizontal: 1.25 }),
    'granite-tor': Object.freeze({ minimumHeightToHorizontal: 1.28, minimumVerticalFaceAreaFraction: 0.24 }),
    'sandstone-cliff': Object.freeze({ minimumVerticalFaceAreaFraction: 0.2, minimumDominantPlaneAreaFraction: 0.04 }),
    'sandstone-arch': Object.freeze({ minimumPenetrativeOpeningEvidence: 0.025 }),
    'basalt-colonnade': Object.freeze({ minimumColumnSignature: 0.12, minimumUpperHorizontalPatchCount: 3 }),
    'basalt-entablature': Object.freeze({ minimumVerticalFaceAreaFraction: 0.16, minimumNormalEntropy: 0.3 }),
    'limestone-spire': Object.freeze({ minimumHeightToHorizontal: 1.45, minimumUpwardTaper: 0.08 }),
    'limestone-cave': Object.freeze({ maximumPenetrativeOpeningEvidence: 0.005 }),
    'shale-slope': Object.freeze({ maximumHeightToHorizontal: 0.95, maximumLongAxisVerticality: 0.82 }),
    'slate-outcrop': Object.freeze({ minimumDominantPlaneAreaFraction: 0.055, minimumAxisPlanarAreaFraction: 0.12 }),
    'gneiss-outcrop': Object.freeze({ minimumNormalEntropy: 0.28 }),
    'schist-outcrop': Object.freeze({ minimumNormalEntropy: 0.28 }),
    'conglomerate-outcrop': Object.freeze({ minimumClastSignature: 0.06 }),
    'volcanic-breccia-outcrop': Object.freeze({ minimumClastSignature: 0.075, minimumAngularEdgeFraction: 0.1 }),
    'river-boulder': Object.freeze({ minimumSphericity: 0.66, maximumHeightToHorizontal: 1.0 }),
    'talus-assembly': Object.freeze({ componentRange: Object.freeze([6, 17]), status: 'predeclared' }),
  }),
  comparisons: Object.freeze({
    minimumWithinClassFeatureDistance: Object.freeze({ value: 0.035, status: 'proposed-diagnostic' }),
    maximumCrossClassSimilarity: Object.freeze({ value: 0.8, status: 'proposed-diagnostic' }),
    minimumBrecciaAngularEdgeDeltaOverConglomerate: Object.freeze({ value: 0.012, status: 'proposed-diagnostic' }),
  }),
});

const REPAIR_CATALOG = Object.freeze({
  'granite-boulder': Object.freeze({ codeAnchor: 'basis/field.node.js::graniteField(form === granite-boulder)', action: 'Tune faceted-ellipsoid support planes and add a geometry-scale basal contact treatment; preserve a rounded detached mass without making it spherical.' }),
  'granite-tor': Object.freeze({ codeAnchor: 'basis/field.node.js::graniteField(pillarSpecs/baseRemnant)', action: 'Retune unequal upright joint blocks and basal remnant coupling; preserve vertical joint-controlled masses and avoid a generic mound or equal stacked lobes.' }),
  'sandstone-cliff': Object.freeze({ codeAnchor: 'basis/field.node.js::sandstoneField(isCliff wallCore/wallShell/buttresses)', action: 'Increase the readable truncated rock face and non-periodic ledge hierarchy while retaining an eroded perimeter rather than an architectural slab.' }),
  'sandstone-arch': Object.freeze({ codeAnchor: 'basis/field.node.js::sandstoneField(openingA/centralMass/upperCap/basalButtress)', action: 'Repair the finite through-opening, roof thickness, and two load paths together; do not enlarge the cutter without rechecking support.' }),
  'basalt-colonnade': Object.freeze({ codeAnchor: 'basis/field.node.js::basaltField(column loop/basalFlow/basalConnector)', action: 'Expose more distinct polygonal column caps and vertical faces while retaining one connected basal cooling flow.' }),
  'basalt-entablature': Object.freeze({ codeAnchor: 'basis/field.node.js::basaltField(entablature/capNotchA/capNotchB)', action: 'Strengthen the transition from ordered lower columns into a chaotic jointed cap; avoid a single smooth cap or horizontal-strata reading.' }),
  'limestone-spire': Object.freeze({ codeAnchor: 'basis/field.node.js::limestoneField(limestone-spire radiusX/radiusZ/baseLobe/crown)', action: 'Increase coherent upward taper and vertical residual continuity; keep runnels secondary to the large spire silhouette.' }),
  'limestone-cave': Object.freeze({ codeAnchor: 'basis/field.node.js::limestoneField(openingPoint/opening/hostA/hostB)', action: 'Keep the dissolution void face-breaching but finite with a back wall; adjust mouth readability without turning it into a through arch.' }),
  'shale-slope': Object.freeze({ codeAnchor: 'basis/field.node.js::fissileField(shale-slope slopePlane/shard loop)', action: 'Rebalance slope plane and deposited plates so the macro mass remains low and slope-forming instead of becoming an upright block.' }),
  'slate-outcrop': Object.freeze({ codeAnchor: 'basis/field.node.js::fissileField(slate-outcrop slab loop/cleavage)', action: 'Strengthen a few coherent slaty planes at geometry scale; keep dense cleavage in the bake rather than introducing periodic mesh stripes.' }),
  'gneiss-outcrop': Object.freeze({ codeAnchor: 'basis/field.node.js::foliatedField(gneiss jointedCore/jointedShell)', action: 'Add geometry-scale folded compositional massing distinct from schist, not only a semantic/bake band-frequency change.' }),
  'schist-outcrop': Object.freeze({ codeAnchor: 'basis/field.node.js::foliatedField(schist jointedCore/jointedShell)', action: 'Add geometry-scale schistose splitting and asymmetric foliated slabs distinct from gneiss; avoid relying only on material semantics.' }),
  'conglomerate-outcrop': Object.freeze({ codeAnchor: 'basis/field.node.js::coarseClasticField/clastSet(angular=false)', action: 'Increase mesh-resolvable rounded clast relief and breakout at the admitted render scale while preserving matrix support.' }),
  'volcanic-breccia-outcrop': Object.freeze({ codeAnchor: 'basis/field.node.js::coarseClasticField/clastSet(angular=true)', action: 'Increase mesh-resolvable angular clast facets and pits relative to conglomerate; preserve matrix continuity and avoid loose talus.' }),
  'river-boulder': Object.freeze({ codeAnchor: 'basis/field.node.js::transportedField(river-boulder)', action: 'Increase transport rounding and stable low resting posture without erasing large inherited facets.' }),
  'talus-assembly': Object.freeze({ codeAnchor: 'basis/field.node.js::talusPieces/transportedField', action: 'Repair component survival, imbrication, and stable contact distribution together; do not fuse the pile into one blob.' }),
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashMesh(mesh) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  hash.update(Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength));
  return hash.digest('hex');
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
}

function vectorAt(positions, index) {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(vector) {
  return Math.hypot(...vector);
}

function normalize(vector) {
  const magnitude = length(vector) || 1;
  return vector.map((value) => value / magnitude);
}

function parseObj(text) {
  const positions = [];
  const indices = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const values = line.trim().split(/\s+/).slice(1, 4).map(Number);
      if (values.length === 3 && values.every(Number.isFinite)) positions.push(...values);
    } else if (line.startsWith('f ')) {
      const face = line.trim().split(/\s+/).slice(1).map((token) => Number(token.split('/')[0]) - 1);
      for (let index = 1; index + 1 < face.length; index += 1) indices.push(face[0], face[index], face[index + 1]);
    }
  }
  if (positions.length === 0 || indices.length === 0) throw new Error('OBJ contains no triangle geometry.');
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

class UnionFind {
  constructor(size) {
    this.parent = Int32Array.from({ length: size }, (_, index) => index);
    this.rank = new Uint8Array(size);
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

  union(a, b) {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] += 1;
  }
}

function convexHull2(points) {
  const unique = [...new Map(points.map((point) => [`${point[0].toFixed(8)},${point[1].toFixed(8)}`, point])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length <= 2) return unique;
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function polygonArea(polygon) {
  if (polygon.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length;
    area += polygon[index][0] * polygon[next][1] - polygon[next][0] * polygon[index][1];
  }
  return Math.abs(area) * 0.5;
}

function distanceToPolygon(point, polygon) {
  if (polygon.length === 0) return Infinity;
  let inside = false;
  let nearest = Infinity;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous];
    const b = polygon[index];
    const intersects = ((a[1] > point[1]) !== (b[1] > point[1]))
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / ((b[1] - a[1]) || 1e-12) + a[0];
    if (intersects) inside = !inside;
    const ab = [b[0] - a[0], b[1] - a[1]];
    const denominator = ab[0] * ab[0] + ab[1] * ab[1] || 1;
    const t = clamp(((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / denominator);
    nearest = Math.min(nearest, Math.hypot(point[0] - (a[0] + ab[0] * t), point[1] - (a[1] + ab[1] * t)));
  }
  return inside ? -nearest : nearest;
}

function jacobiEigenSymmetric3(matrix) {
  const a = matrix.map((row) => [...row]);
  const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let iteration = 0; iteration < 32; iteration += 1) {
    let p = 0;
    let q = 1;
    if (Math.abs(a[0][2]) > Math.abs(a[p][q])) [p, q] = [0, 2];
    if (Math.abs(a[1][2]) > Math.abs(a[p][q])) [p, q] = [1, 2];
    if (Math.abs(a[p][q]) < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (let index = 0; index < 3; index += 1) {
      const aip = a[index][p];
      const aiq = a[index][q];
      a[index][p] = cosine * aip - sine * aiq;
      a[index][q] = sine * aip + cosine * aiq;
    }
    for (let index = 0; index < 3; index += 1) {
      const api = a[p][index];
      const aqi = a[q][index];
      a[p][index] = cosine * api - sine * aqi;
      a[q][index] = sine * api + cosine * aqi;
    }
    for (let index = 0; index < 3; index += 1) {
      const vip = vectors[index][p];
      const viq = vectors[index][q];
      vectors[index][p] = cosine * vip - sine * viq;
      vectors[index][q] = sine * vip + cosine * viq;
    }
  }
  return [0, 1, 2].map((index) => ({
    value: a[index][index],
    vector: normalize([vectors[0][index], vectors[1][index], vectors[2][index]]),
  })).sort((aEntry, bEntry) => bEntry.value - aEntry.value);
}

function rasterizeProjection(mesh, firstAxis, secondAxis, size = RASTER_SIZE) {
  const { positions, indices } = mesh;
  const bounds = [[Infinity, -Infinity], [Infinity, -Infinity]];
  for (let index = 0; index < positions.length; index += 3) {
    for (const [slot, axis] of [[0, firstAxis], [1, secondAxis]]) {
      bounds[slot][0] = Math.min(bounds[slot][0], positions[index + axis]);
      bounds[slot][1] = Math.max(bounds[slot][1], positions[index + axis]);
    }
  }
  const ranges = bounds.map(([minimum, maximum]) => maximum - minimum || 1);
  const project = (vertexIndex) => {
    const offset = vertexIndex * 3;
    return [
      1.5 + ((positions[offset + firstAxis] - bounds[0][0]) / ranges[0]) * (size - 3),
      1.5 + ((positions[offset + secondAxis] - bounds[1][0]) / ranges[1]) * (size - 3),
    ];
  };
  const occupied = new Uint8Array(size * size);
  for (let index = 0; index < indices.length; index += 3) {
    const triangle = [project(indices[index]), project(indices[index + 1]), project(indices[index + 2])];
    const minimumX = Math.max(0, Math.floor(Math.min(...triangle.map((point) => point[0]))));
    const maximumX = Math.min(size - 1, Math.ceil(Math.max(...triangle.map((point) => point[0]))));
    const minimumY = Math.max(0, Math.floor(Math.min(...triangle.map((point) => point[1]))));
    const maximumY = Math.min(size - 1, Math.ceil(Math.max(...triangle.map((point) => point[1]))));
    const edge = (a, b, point) => (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    const orientation = edge(triangle[0], triangle[1], triangle[2]);
    if (Math.abs(orientation) < 1e-10) continue;
    for (let y = minimumY; y <= maximumY; y += 1) for (let x = minimumX; x <= maximumX; x += 1) {
      const point = [x + 0.5, y + 0.5];
      const weights = [
        edge(triangle[0], triangle[1], point),
        edge(triangle[1], triangle[2], point),
        edge(triangle[2], triangle[0], point),
      ];
      if (orientation > 0 ? weights.every((value) => value >= -1e-8) : weights.every((value) => value <= 1e-8)) occupied[y * size + x] = 1;
    }
  }
  return occupied;
}

function analyzeSilhouette(occupied, size = RASTER_SIZE) {
  const outside = new Uint8Array(size * size);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const index = y * size + x;
    if (occupied[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let offset = 0; offset < size; offset += 1) {
    enqueue(offset, 0); enqueue(offset, size - 1); enqueue(0, offset); enqueue(size - 1, offset);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % size;
    const y = Math.floor(index / size);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  const visited = new Uint8Array(size * size);
  const holes = [];
  for (let start = 0; start < occupied.length; start += 1) {
    if (occupied[start] || outside[start] || visited[start]) continue;
    let area = 0;
    const pending = [start];
    visited[start] = 1;
    while (pending.length > 0) {
      const current = pending.pop();
      area += 1;
      const x = current % size;
      const y = Math.floor(current / size);
      for (const neighbor of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        const [nx, ny] = neighbor;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const next = ny * size + nx;
        if (!occupied[next] && !outside[next] && !visited[next]) { visited[next] = 1; pending.push(next); }
      }
    }
    if (area >= 3) holes.push(area);
  }
  let maximumInteriorGap = 0;
  let occupiedPixels = 0;
  for (const value of occupied) occupiedPixels += value;
  const scan = (horizontal) => {
    for (let outer = 0; outer < size; outer += 1) {
      const line = [];
      for (let inner = 0; inner < size; inner += 1) line.push(occupied[horizontal ? outer * size + inner : inner * size + outer]);
      const first = line.indexOf(1);
      const last = line.lastIndexOf(1);
      if (first < 0 || last <= first) continue;
      let run = 0;
      for (let index = first; index <= last; index += 1) {
        if (line[index]) run = 0;
        else { run += 1; maximumInteriorGap = Math.max(maximumInteriorGap, run / (last - first + 1)); }
      }
    }
  };
  scan(true);
  scan(false);
  return {
    enclosedHoleCount: holes.length,
    largestEnclosedHoleFraction: holes.length > 0 ? Math.max(...holes) / Math.max(occupiedPixels, 1) : 0,
    maximumInteriorGapFraction: maximumInteriorGap,
    occupiedFraction: occupiedPixels / occupied.length,
  };
}

function measureMesh(mesh) {
  const { positions, indices } = mesh;
  const vertexCount = positions.length / 3;
  const triangleCount = indices.length / 3;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  const centroid = [0, 0, 0];
  for (let index = 0; index < vertexCount; index += 1) {
    const point = vectorAt(positions, index);
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
      centroid[axis] += point[axis] / vertexCount;
    }
  }
  const dimensions = maximum.map((value, axis) => value - minimum[axis]);
  const diagonal = Math.hypot(...dimensions) || 1;
  const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let index = 0; index < vertexCount; index += 1) {
    const relative = subtract(vectorAt(positions, index), centroid);
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) covariance[row][column] += relative[row] * relative[column] / vertexCount;
  }
  const principalAxes = jacobiEigenSymmetric3(covariance);

  const union = new UnionFind(vertexCount);
  const triangleNormals = [];
  const triangleAreas = [];
  const triangleCentroids = [];
  const edgeMap = new Map();
  let surfaceArea = 0;
  let signedVolume = 0;
  let verticalArea = 0;
  let horizontalArea = 0;
  let axisPlanarArea = 0;
  const normalBins = new Float64Array(12 * 6);
  const addEdge = (a, b, triangleIndex, edgeLength) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const entries = edgeMap.get(key) ?? [];
    entries.push({ edgeLength, triangleIndex });
    edgeMap.set(key, entries);
  };
  for (let offset = 0, triangleIndex = 0; offset < indices.length; offset += 3, triangleIndex += 1) {
    const ids = [indices[offset], indices[offset + 1], indices[offset + 2]];
    union.union(ids[0], ids[1]); union.union(ids[1], ids[2]);
    const points = ids.map((id) => vectorAt(positions, id));
    const ab = subtract(points[1], points[0]);
    const ac = subtract(points[2], points[0]);
    const rawNormal = cross(ab, ac);
    const doubleArea = length(rawNormal);
    const area = doubleArea * 0.5;
    const normal = normalize(rawNormal);
    triangleNormals.push(normal);
    triangleAreas.push(area);
    triangleCentroids.push(points[0].map((value, axis) => (value + points[1][axis] + points[2][axis]) / 3));
    surfaceArea += area;
    signedVolume += dot(points[0], cross(points[1], points[2])) / 6;
    if (Math.abs(normal[1]) <= 0.25) verticalArea += area;
    if (Math.abs(normal[1]) >= 0.85) horizontalArea += area;
    if (Math.max(Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])) >= Math.cos(Math.PI / 12)) axisPlanarArea += area;
    const azimuth = (Math.atan2(normal[2], normal[0]) + Math.PI * 2) % (Math.PI * 2);
    const elevation = Math.asin(clamp(normal[1], -1, 1));
    const azimuthBin = Math.min(11, Math.floor(azimuth / (Math.PI * 2) * 12));
    const elevationBin = Math.min(5, Math.floor((elevation + Math.PI / 2) / Math.PI * 6));
    normalBins[elevationBin * 12 + azimuthBin] += area;
    addEdge(ids[0], ids[1], triangleIndex, length(ab));
    addEdge(ids[1], ids[2], triangleIndex, length(subtract(points[2], points[1])));
    addEdge(ids[2], ids[0], triangleIndex, length(ac));
  }
  const componentRoots = new Set(Array.from({ length: vertexCount }, (_, index) => union.find(index)));
  let sharedEdgeWeight = 0;
  let angularEdgeWeight = 0;
  let smallAngularEdgeWeight = 0;
  const topTriangleSet = new Set();
  const upperCutoff = minimum[1] + dimensions[1] * 0.5;
  for (let triangleIndex = 0; triangleIndex < triangleNormals.length; triangleIndex += 1) {
    if (triangleNormals[triangleIndex][1] > 0.75 && triangleCentroids[triangleIndex][1] > upperCutoff) topTriangleSet.add(triangleIndex);
  }
  const topAdjacency = new Map([...topTriangleSet].map((index) => [index, []]));
  for (const entries of edgeMap.values()) {
    if (entries.length === 2) {
      const [first, second] = entries;
      const weight = (first.edgeLength + second.edgeLength) * 0.5;
      const angle = Math.acos(clamp(dot(triangleNormals[first.triangleIndex], triangleNormals[second.triangleIndex]), -1, 1));
      sharedEdgeWeight += weight;
      if (angle >= 25 * Math.PI / 180) {
        angularEdgeWeight += weight;
        if (weight <= diagonal * 0.06) smallAngularEdgeWeight += weight;
      }
      if (topTriangleSet.has(first.triangleIndex) && topTriangleSet.has(second.triangleIndex)) {
        topAdjacency.get(first.triangleIndex).push(second.triangleIndex);
        topAdjacency.get(second.triangleIndex).push(first.triangleIndex);
      }
    }
  }
  let upperHorizontalPatchCount = 0;
  const visitedTop = new Set();
  for (const start of topTriangleSet) {
    if (visitedTop.has(start)) continue;
    let patchArea = 0;
    const pending = [start];
    visitedTop.add(start);
    while (pending.length > 0) {
      const current = pending.pop();
      patchArea += triangleAreas[current];
      for (const next of topAdjacency.get(current) ?? []) if (!visitedTop.has(next)) { visitedTop.add(next); pending.push(next); }
    }
    if (patchArea >= surfaceArea * 0.0008) upperHorizontalPatchCount += 1;
  }
  const totalNormalArea = normalBins.reduce((sum, value) => sum + value, 0) || 1;
  let normalEntropy = 0;
  let dominantPlaneAreaFraction = 0;
  for (const area of normalBins) {
    const probability = area / totalNormalArea;
    dominantPlaneAreaFraction = Math.max(dominantPlaneAreaFraction, probability);
    if (probability > 0) normalEntropy -= probability * Math.log(probability);
  }
  normalEntropy /= Math.log(normalBins.length);

  const supportCutoff = minimum[1] + dimensions[1] * 0.04;
  const supportVertexIndices = [];
  const supportPoints = [];
  const footprintPoints = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const point = vectorAt(positions, index);
    footprintPoints.push([point[0], point[2]]);
    if (point[1] <= supportCutoff) { supportVertexIndices.push(index); supportPoints.push([point[0], point[2]]); }
  }
  const supportHull = convexHull2(supportPoints);
  const footprintHull = convexHull2(footprintPoints);
  const supportArea = polygonArea(supportHull);
  const footprintArea = polygonArea(footprintHull);
  const supportDistance = distanceToPolygon([centroid[0], centroid[2]], supportHull);
  const supportContactComponents = new Set(supportVertexIndices.map((index) => union.find(index))).size;

  const binWidths = Array.from({ length: 10 }, () => []);
  for (let index = 0; index < vertexCount; index += 1) {
    const point = vectorAt(positions, index);
    const bin = Math.min(9, Math.floor((point[1] - minimum[1]) / (dimensions[1] || 1) * 10));
    binWidths[bin].push(point);
  }
  const widthProfile = binWidths.map((points) => {
    if (points.length < 3) return 0;
    const xs = points.map((point) => point[0]);
    const zs = points.map((point) => point[2]);
    return Math.sqrt((Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)));
  });
  const lowerWidth = median(widthProfile.slice(1, 4).filter((value) => value > 0));
  const upperWidth = median(widthProfile.slice(6, 9).filter((value) => value > 0));
  const upwardTaper = lowerWidth > 0 ? 1 - upperWidth / lowerWidth : 0;
  const volume = Math.abs(signedVolume);
  const sphericity = surfaceArea > 0 && volume > 0
    ? Math.cbrt(Math.PI) * Math.pow(6 * volume, 2 / 3) / surfaceArea
    : 0;

  const silhouettes = {
    front: analyzeSilhouette(rasterizeProjection(mesh, 0, 1)),
    side: analyzeSilhouette(rasterizeProjection(mesh, 2, 1)),
    top: analyzeSilhouette(rasterizeProjection(mesh, 0, 2)),
  };
  // An enclosed empty island in an orthographic projection is positive
  // evidence of a pass-through opening along that view. A row/column gap can
  // also be an exterior concavity, so keep it as an aperture candidate only.
  const penetrativeOpeningEvidence = Math.max(
    silhouettes.front.largestEnclosedHoleFraction,
    silhouettes.side.largestEnclosedHoleFraction,
  );
  const apertureCandidateEvidence = Math.max(
    silhouettes.front.maximumInteriorGapFraction,
    silhouettes.side.maximumInteriorGapFraction,
  );
  const horizontalMean = (dimensions[0] + dimensions[2]) * 0.5 || 1;
  const verticalFaceAreaFraction = verticalArea / Math.max(surfaceArea, 1e-12);
  const angularEdgeFraction = angularEdgeWeight / Math.max(sharedEdgeWeight, 1e-12);
  const smallAngularEdgeFraction = smallAngularEdgeWeight / Math.max(sharedEdgeWeight, 1e-12);
  const columnSignature = verticalFaceAreaFraction
    * clamp(dimensions[1] / horizontalMean / 1.8)
    * clamp(upperHorizontalPatchCount / 8);
  const clastSignature = clamp((normalEntropy * 0.42 + angularEdgeFraction * 0.34 + smallAngularEdgeFraction * 0.24)
    * (1 + Math.min(upperHorizontalPatchCount, 12) / 24));

  return {
    bounds: { center: minimum.map((value, axis) => (value + maximum[axis]) * 0.5).map(round), dimensions: dimensions.map(round), maximum: maximum.map(round), minimum: minimum.map(round) },
    components: componentRoots.size,
    geometry: { surfaceArea: round(surfaceArea), triangleCount, vertexCount, volume: round(volume) },
    orientation: {
      eigenvalueRatios: principalAxes.map((entry) => round(entry.value / Math.max(principalAxes[0].value, 1e-12))),
      longAxis: principalAxes[0].vector.map(round),
      longAxisVerticality: round(Math.abs(principalAxes[0].vector[1])),
    },
    opening: {
      apertureCandidateEvidence: round(apertureCandidateEvidence),
      inferenceLimit: 'An enclosed empty island in orthographic triangle projection is positive pass-through evidence. Exterior-connected row/column gaps are reported separately as aperture candidates because they can be concavities. Absence cannot disprove hidden connectivity.',
      penetrativeOpeningEvidence: round(penetrativeOpeningEvidence),
      projections: Object.fromEntries(Object.entries(silhouettes).map(([id, value]) => [id, Object.fromEntries(Object.entries(value).map(([key, number]) => [key, round(number)]))])),
    },
    signatures: {
      angularEdgeFraction: round(angularEdgeFraction),
      axisPlanarAreaFraction: round(axisPlanarArea / Math.max(surfaceArea, 1e-12)),
      clastSignature: round(clastSignature),
      columnSignature: round(columnSignature),
      dominantPlaneAreaFraction: round(dominantPlaneAreaFraction),
      heightToHorizontal: round(dimensions[1] / horizontalMean),
      horizontalFaceAreaFraction: round(horizontalArea / Math.max(surfaceArea, 1e-12)),
      normalEntropy: round(normalEntropy),
      sphericity: round(sphericity),
      smallAngularEdgeFraction: round(smallAngularEdgeFraction),
      upwardTaper: round(upwardTaper),
      verticalFaceAreaFraction: round(verticalFaceAreaFraction),
      widthProfileNormalized: widthProfile.map((value) => round(value / Math.max(...widthProfile, 1e-12))),
    },
    support: {
      centroidSupported: supportDistance <= 0,
      inferenceLimit: componentRoots.size === 1
        ? 'Basal hull support is a valid first-order single-component static test; it is not a load-path or material-strength solve.'
        : 'A global basal hull cannot establish load paths through disconnected pieces; use contact-graph/rigid-body qualification for the assembly.',
      normalizedCentroidOffset: round(Math.max(0, supportDistance) / horizontalMean),
      supportAreaRatio: round(supportArea / Math.max(footprintArea, 1e-12)),
      supportContactComponents,
      supportVertexFraction: round(supportVertexIndices.length / vertexCount),
    },
    upperHorizontalPatchCount,
  };
}

const FEATURE_KEYS = Object.freeze([
  'orientation.longAxisVerticality',
  'support.supportAreaRatio',
  'support.normalizedCentroidOffset',
  'opening.penetrativeOpeningEvidence',
  'signatures.heightToHorizontal',
  'signatures.upwardTaper',
  'signatures.sphericity',
  'signatures.verticalFaceAreaFraction',
  'signatures.horizontalFaceAreaFraction',
  'signatures.dominantPlaneAreaFraction',
  'signatures.axisPlanarAreaFraction',
  'signatures.normalEntropy',
  'signatures.angularEdgeFraction',
  'signatures.smallAngularEdgeFraction',
  'signatures.columnSignature',
  'signatures.clastSignature',
]);

function getPath(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], object);
}

function featureVector(measurement) {
  return FEATURE_KEYS.map((key) => getPath(measurement, key) ?? 0);
}

function standardizeVectors(records) {
  const vectors = records.map((record) => featureVector(record.measurements));
  const means = FEATURE_KEYS.map((_, index) => mean(vectors.map((vector) => vector[index])));
  const deviations = FEATURE_KEYS.map((_, index) => {
    const variance = mean(vectors.map((vector) => (vector[index] - means[index]) ** 2));
    return Math.sqrt(variance) || 1;
  });
  return records.map((record, recordIndex) => ({
    record,
    vector: vectors[recordIndex].map((value, index) => (value - means[index]) / deviations[index]),
  }));
}

function vectorDistance(a, b) {
  return Math.sqrt(mean(a.map((value, index) => (value - b[index]) ** 2)));
}

function aggregateClassVectors(standardized) {
  const byClass = Object.groupBy(standardized, (entry) => entry.record.variantId);
  return Object.fromEntries(Object.entries(byClass).map(([variantId, entries]) => [variantId, FEATURE_KEYS.map((_, index) => mean(entries.map((entry) => entry.vector[index])))]));
}

function compare(value, operation, threshold) {
  if (operation === 'minimum') return value >= threshold;
  if (operation === 'maximum') return value <= threshold;
  throw new Error(`Unknown comparison operation ${operation}`);
}

function classDiagnostics(record) {
  const thresholds = THRESHOLDS.classes[record.variantId];
  const metrics = record.measurements;
  const diagnostics = [];
  const add = (id, measured, operation, threshold, status = 'proposed-diagnostic') => diagnostics.push({
    id, measured: round(measured), operation, passed: compare(measured, operation, threshold), threshold, thresholdStatus: status,
  });
  // Do not pretend a convex hull beneath one disconnected piece proves or
  // disproves the load path of a talus pile. Component/contact simulation is a
  // separate qualification. A surprising multi-component single-mass class is
  // caught by its predeclared component check below.
  if (metrics.components === 1) {
    add('support-area', metrics.support.supportAreaRatio, 'minimum', THRESHOLDS.common.minimumSupportAreaRatio.value);
    add('centroid-support-offset', metrics.support.normalizedCentroidOffset, 'maximum', THRESHOLDS.common.maximumUnsupportedCentroidOffset.value);
  }
  if (thresholds.minimumSphericity !== undefined) add('sphericity', metrics.signatures.sphericity, 'minimum', thresholds.minimumSphericity);
  if (thresholds.maximumHeightToHorizontal !== undefined) add('height-to-horizontal', metrics.signatures.heightToHorizontal, 'maximum', thresholds.maximumHeightToHorizontal);
  if (thresholds.minimumHeightToHorizontal !== undefined) add('height-to-horizontal', metrics.signatures.heightToHorizontal, 'minimum', thresholds.minimumHeightToHorizontal);
  if (thresholds.minimumVerticalFaceAreaFraction !== undefined) add('vertical-face-area', metrics.signatures.verticalFaceAreaFraction, 'minimum', thresholds.minimumVerticalFaceAreaFraction);
  if (thresholds.minimumDominantPlaneAreaFraction !== undefined) add('dominant-plane-area', metrics.signatures.dominantPlaneAreaFraction, 'minimum', thresholds.minimumDominantPlaneAreaFraction);
  if (thresholds.minimumPenetrativeOpeningEvidence !== undefined) add('penetrative-opening', metrics.opening.penetrativeOpeningEvidence, 'minimum', thresholds.minimumPenetrativeOpeningEvidence);
  if (thresholds.maximumPenetrativeOpeningEvidence !== undefined) add('penetrative-opening', metrics.opening.penetrativeOpeningEvidence, 'maximum', thresholds.maximumPenetrativeOpeningEvidence);
  if (thresholds.minimumColumnSignature !== undefined) add('column-signature', metrics.signatures.columnSignature, 'minimum', thresholds.minimumColumnSignature);
  if (thresholds.minimumUpperHorizontalPatchCount !== undefined) add('upper-horizontal-patches', metrics.upperHorizontalPatchCount, 'minimum', thresholds.minimumUpperHorizontalPatchCount);
  if (thresholds.minimumNormalEntropy !== undefined) add('normal-entropy', metrics.signatures.normalEntropy, 'minimum', thresholds.minimumNormalEntropy);
  if (thresholds.minimumUpwardTaper !== undefined) add('upward-taper', metrics.signatures.upwardTaper, 'minimum', thresholds.minimumUpwardTaper);
  if (thresholds.maximumLongAxisVerticality !== undefined) add('long-axis-verticality', metrics.orientation.longAxisVerticality, 'maximum', thresholds.maximumLongAxisVerticality);
  if (thresholds.minimumAxisPlanarAreaFraction !== undefined) add('axis-planar-area', metrics.signatures.axisPlanarAreaFraction, 'minimum', thresholds.minimumAxisPlanarAreaFraction);
  if (thresholds.minimumClastSignature !== undefined) add('clast-signature', metrics.signatures.clastSignature, 'minimum', thresholds.minimumClastSignature);
  if (thresholds.minimumAngularEdgeFraction !== undefined) add('angular-edge-fraction', metrics.signatures.angularEdgeFraction, 'minimum', thresholds.minimumAngularEdgeFraction);
  if (thresholds.componentRange) {
    const [minimum, maximum] = thresholds.componentRange;
    diagnostics.push({ id: 'component-range', measured: metrics.components, operation: 'range', passed: metrics.components >= minimum && metrics.components <= maximum, threshold: thresholds.componentRange, thresholdStatus: thresholds.status });
  } else diagnostics.push({ id: 'component-count', measured: metrics.components, operation: 'equal', passed: metrics.components === 1, threshold: 1, thresholdStatus: 'predeclared' });
  return diagnostics;
}

async function writeJson(filename, value) {
  await writeFile(path.join(OUTPUT_DIRECTORY, filename), `${JSON.stringify(value, null, 2)}\n`);
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const [heroIndexBytes, lineageBytes] = await Promise.all([
  readFile(path.join(CURRENT_V3_DIRECTORY, 'hero-output-index.json')),
  readFile(path.join(CURRENT_V3_DIRECTORY, 'lineage.json')),
]);
const heroIndex = JSON.parse(heroIndexBytes);
const definitions = listC8BasisDefinitions();
const expectedClasses = definitions.flatMap((definition) => definition.variants.map((variant) => variant.id)).sort();
const records = [];
const boundFiles = [];

for (const hero of heroIndex) {
  const objectPath = path.join(CURRENT_V3_DIRECTORY, hero.file);
  const bytes = await readFile(objectPath);
  const mesh = parseObj(bytes.toString('utf8'));
  records.push({
    familyId: hero.familyId,
    heroRole: hero.heroRole,
    measurements: measureMesh(mesh),
    meshSha256: hashMesh(mesh),
    objectFileSha256: sha256(bytes),
    recipeId: hero.recipeId,
    sampleGroup: 'immutable-current-v3-hero',
    seed: Number(hero.recipeId.match(/(\d+)$/)?.[1]),
    variantId: hero.variantId,
  });
  boundFiles.push({ path: path.relative(ROOT, objectPath), sha256: sha256(bytes), size: bytes.length });
}

const catalog = loadGeologyCatalog();
for (const definition of definitions) {
  for (const seedIndex of FRESH_SEED_INDICES) {
    const fixture = createC8BasisFixture(definition.id, 'production', seedIndex, { catalog });
    const compiled = meshC8BasisFixture(fixture, {
      catalog,
      includeSelfIntersections: false,
      resolution: DIAGNOSTIC_RESOLUTION,
    });
    records.push({
      familyId: definition.id,
      heroRole: null,
      measurements: measureMesh(compiled.mesh),
      meshSha256: hashMesh(compiled.mesh),
      objectFileSha256: null,
      recipeId: fixture.recipe.id,
      sampleGroup: 'fresh-production-diagnostic',
      seed: fixture.recipe.seed,
      seedIndex,
      topologyPassedAtDiagnosticResolution: compiled.record.passed,
      variantId: fixture.variant.id,
    });
  }
}

const currentRecords = records.filter((record) => record.sampleGroup === 'immutable-current-v3-hero');
const freshRecords = records.filter((record) => record.sampleGroup === 'fresh-production-diagnostic');
const coveredClasses = [...new Set(records.map((record) => record.variantId))].sort();
const freshClassCounts = Object.fromEntries(expectedClasses.map((variantId) => [variantId, freshRecords.filter((record) => record.variantId === variantId).length]));
const recordDiagnostics = records.map((record) => ({
  diagnostics: classDiagnostics(record),
  meshSha256: record.meshSha256,
  recipeId: record.recipeId,
  sampleGroup: record.sampleGroup,
  seed: record.seed,
  variantId: record.variantId,
}));

const standardizedFresh = standardizeVectors(freshRecords);
const byClass = Object.groupBy(standardizedFresh, (entry) => entry.record.variantId);
const withinClass = Object.entries(byClass).map(([variantId, entries]) => {
  const distances = [];
  for (let first = 0; first < entries.length; first += 1) for (let second = first + 1; second < entries.length; second += 1) distances.push(vectorDistance(entries[first].vector, entries[second].vector));
  return {
    diagnosticPassed: median(distances) >= THRESHOLDS.comparisons.minimumWithinClassFeatureDistance.value,
    maximumFeatureDistance: round(Math.max(...distances)),
    medianFeatureDistance: round(median(distances)),
    minimumFeatureDistance: round(Math.min(...distances)),
    pairCount: distances.length,
    seedCount: entries.length,
    threshold: THRESHOLDS.comparisons.minimumWithinClassFeatureDistance,
    variantId,
  };
}).sort((a, b) => a.variantId.localeCompare(b.variantId));

const classVectors = aggregateClassVectors(standardizedFresh);
const crossClassPairs = [];
const classIds = Object.keys(classVectors).sort();
for (let first = 0; first < classIds.length; first += 1) for (let second = first + 1; second < classIds.length; second += 1) {
  const distance = vectorDistance(classVectors[classIds[first]], classVectors[classIds[second]]);
  crossClassPairs.push({
    classes: [classIds[first], classIds[second]],
    diagnosticPassed: Math.exp(-distance) <= THRESHOLDS.comparisons.maximumCrossClassSimilarity.value,
    featureDistance: round(distance),
    similarity: round(Math.exp(-distance)),
  });
}
crossClassPairs.sort((a, b) => b.similarity - a.similarity);

const classMeans = Object.fromEntries(expectedClasses.map((variantId) => {
  const samples = freshRecords.filter((record) => record.variantId === variantId);
  const metric = (key) => round(mean(samples.map((record) => getPath(record.measurements, key))));
  return [variantId, Object.fromEntries(FEATURE_KEYS.map((key) => [key, metric(key)]))];
}));
const brecciaAngularDelta = round(
  classMeans['volcanic-breccia-outcrop']['signatures.angularEdgeFraction']
  - classMeans['conglomerate-outcrop']['signatures.angularEdgeFraction'],
);
const comparisonDiagnostics = [{
  diagnosticPassed: brecciaAngularDelta >= THRESHOLDS.comparisons.minimumBrecciaAngularEdgeDeltaOverConglomerate.value,
  id: 'breccia-angularity-over-conglomerate',
  measuredDelta: brecciaAngularDelta,
  threshold: THRESHOLDS.comparisons.minimumBrecciaAngularEdgeDeltaOverConglomerate,
}];

const failedRecordDiagnostics = recordDiagnostics.flatMap((record) => record.diagnostics
  .filter((diagnostic) => !diagnostic.passed)
  .map((diagnostic) => ({ ...diagnostic, recipeId: record.recipeId, sampleGroup: record.sampleGroup, seed: record.seed, variantId: record.variantId })));
const failedDiversity = withinClass.filter((result) => !result.diagnosticPassed);
const failedSimilarity = crossClassPairs.filter((result) => !result.diagnosticPassed);
const failedComparisons = comparisonDiagnostics.filter((result) => !result.diagnosticPassed);
const affectedClasses = new Set([
  ...failedRecordDiagnostics.map((failure) => failure.variantId),
  ...failedDiversity.map((failure) => failure.variantId),
  ...failedSimilarity.flatMap((failure) => failure.classes),
  ...failedComparisons.flatMap(() => ['conglomerate-outcrop', 'volcanic-breccia-outcrop']),
]);
const repairs = [...affectedClasses].sort().map((variantId) => ({
  ...REPAIR_CATALOG[variantId],
  evidence: {
    failedRecordDiagnostics: failedRecordDiagnostics.filter((failure) => failure.variantId === variantId).map((failure) => ({ id: failure.id, measured: failure.measured, recipeId: failure.recipeId, threshold: failure.threshold })),
    failedWithinClassDiversity: failedDiversity.some((failure) => failure.variantId === variantId),
    confusedWith: failedSimilarity.filter((failure) => failure.classes.includes(variantId)).map((failure) => ({ otherClass: failure.classes.find((id) => id !== variantId), similarity: failure.similarity })),
  },
  priority: failedSimilarity.slice(0, 12).some((failure) => failure.classes.includes(variantId)) ? 'high' : 'normal',
  variantId,
}));

const sourceFiles = [];
for (const relativePath of GENERATOR_SOURCE_FILES) {
  const bytes = await readFile(path.resolve(relativePath));
  sourceFiles.push({ path: relativePath, sha256: sha256(bytes), size: bytes.length });
}
const sourceAggregateSha256 = sha256(Buffer.from(sourceFiles.map((file) => `${file.path}:${file.sha256}`).join('\n')));
const integrityFailures = [];
if (expectedClasses.length !== 16) integrityFailures.push({ code: 'EXACT_CLASS_COUNT_MISMATCH', expected: 16, actual: expectedClasses.length });
if (JSON.stringify(expectedClasses) !== JSON.stringify(coveredClasses)) integrityFailures.push({ code: 'CLASS_COVERAGE_MISMATCH', expectedClasses, coveredClasses });
for (const [variantId, count] of Object.entries(freshClassCounts)) if (count !== 3) integrityFailures.push({ code: 'FRESH_CLASS_SEED_COUNT_MISMATCH', variantId, expected: 3, actual: count });
if (currentRecords.length !== 24) integrityFailures.push({ code: 'CURRENT_V3_WITNESS_COUNT_MISMATCH', expected: 24, actual: currentRecords.length });
if (freshRecords.length !== 48) integrityFailures.push({ code: 'FRESH_WITNESS_COUNT_MISMATCH', expected: 48, actual: freshRecords.length });
if (sourceFiles.length !== GENERATOR_SOURCE_FILES.length) integrityFailures.push({ code: 'SOURCE_BINDING_INCOMPLETE' });
if (records.some((record) => !record.meshSha256 || !record.measurements.geometry.triangleCount)) integrityFailures.push({ code: 'MEASUREMENT_RECORD_INCOMPLETE' });

const diagnosticFindingCount = failedRecordDiagnostics.length + failedDiversity.length + failedSimilarity.length + failedComparisons.length;
const verification = {
  auditIntegrityPassed: integrityFailures.length === 0,
  c8Approved: false,
  checkpoint: 8,
  counts: {
    classes: coveredClasses.length,
    crossClassPairs: crossClassPairs.length,
    diagnosticFindings: diagnosticFindingCount,
    failedComparisons: failedComparisons.length,
    failedDiversityClasses: failedDiversity.length,
    failedRecordDiagnostics: failedRecordDiagnostics.length,
    failedSimilarityPairs: failedSimilarity.length,
    freshWitnesses: freshRecords.length,
    immutableCurrentV3Witnesses: currentRecords.length,
    measurementRecords: records.length,
    repairTargets: repairs.length,
  },
  diagnosticResolution: DIAGNOSTIC_RESOLUTION,
  integrityFailures,
  interpretation: 'A completed audit with findings is not a C8 approval. Proposed thresholds diagnose emitted geometry only; clay recognition and nature-reference review remain independent human gates.',
  rasterSize: RASTER_SIZE,
  status: integrityFailures.length > 0
    ? 'audit-invalid'
    : diagnosticFindingCount > 0 ? 'diagnostic-complete-repairs-required' : 'diagnostic-complete-no-proposed-threshold-findings-but-human-gates-open',
};

await writeJson('threshold-register.json', THRESHOLDS);
await writeJson('measurement-matrix.json', {
  exactClasses: expectedClasses,
  featureKeys: FEATURE_KEYS,
  records,
  witnessPolicy: {
    currentV3: 'All immutable raw current-v3 hero/outlier OBJs admitted by hero-output-index.json.',
    fresh: `Production fixtures seed indices ${FRESH_SEED_INDICES.join(', ')} compiled at resolution ${DIAGNOSTIC_RESOLUTION}; exactly three seeds per class.`,
  },
});
await writeJson('diagnostic-findings.json', {
  classMeans,
  comparisonDiagnostics,
  crossClassPairs,
  failedComparisons,
  failedDiversity,
  failedRecordDiagnostics,
  failedSimilarity,
  recordDiagnostics,
  withinClass,
});
await writeJson('repair-recommendations.json', repairs);
await writeJson('verification.json', verification);

const artifactNames = ['threshold-register.json', 'measurement-matrix.json', 'diagnostic-findings.json', 'repair-recommendations.json', 'verification.json'];
const artifacts = [];
for (const filename of artifactNames) {
  const bytes = await readFile(path.join(OUTPUT_DIRECTORY, filename));
  artifacts.push({ path: filename, sha256: sha256(bytes), size: bytes.length });
}
const evidenceIndex = {
  artifacts,
  currentV3Bindings: {
    boundObjFiles: boundFiles.sort((a, b) => a.path.localeCompare(b.path)),
    heroOutputIndex: { path: path.relative(ROOT, path.join(CURRENT_V3_DIRECTORY, 'hero-output-index.json')), sha256: sha256(heroIndexBytes), size: heroIndexBytes.length },
    lineage: { path: path.relative(ROOT, path.join(CURRENT_V3_DIRECTORY, 'lineage.json')), sha256: sha256(lineageBytes), size: lineageBytes.length },
  },
  generatorSource: { aggregateSha256: sourceAggregateSha256, files: sourceFiles },
  generatedMeshHashes: freshRecords.map((record) => ({ meshSha256: record.meshSha256, recipeId: record.recipeId, seed: record.seed, variantId: record.variantId })),
  schema: 'toonlab/rock-geology-v2/c8-measured-morphology-evidence-index/v1',
};
await writeJson('evidence-index.json', evidenceIndex);

const highestConfusions = crossClassPairs.slice(0, 12)
  .map((pair) => `| ${pair.classes.join(' ↔ ')} | ${pair.similarity.toFixed(3)} | ${pair.diagnosticPassed ? 'diagnostic pass' : 'repair review'} |`)
  .join('\n');
const readme = `# C8 measured-morphology audit\n\nStatus: **${verification.status}**. Audit integrity: **${verification.auditIntegrityPassed ? 'PASS' : 'FAIL'}**. C8 approval: **NO**.\n\nThis audit measures emitted triangle geometry. It never uses the basis descriptor's declared feature constants as evidence. It binds all 24 current-v3 hero/outlier OBJs and adds 48 same-resolution diagnostic witnesses: three deterministic production seeds for each of the 16 exact classes.\n\nMeasured channels include bounds and PCA orientation, mesh components, basal support, orthographic aperture evidence, verticality, taper, sphericity, dominant planarity, column-cap patches, angular/clast signatures, within-class seed diversity, and all 120 cross-class comparisons. An apparent opening is intentionally limited to what orthographic triangle projection can prove; a finite cave mouth with a back wall is not mislabeled as a through opening.\n\nAll numeric morphology thresholds in \`threshold-register.json\` are **proposed diagnostics**, except the already-predeclared component contract. A diagnostic pass cannot approve clay recognizability, nature-reference fidelity, or C8.\n\n## Counts\n\n- Classes: ${verification.counts.classes}/16\n- Measurement witnesses: ${verification.counts.measurementRecords} (${verification.counts.immutableCurrentV3Witnesses} immutable current-v3 + ${verification.counts.freshWitnesses} fresh diagnostic)\n- Diagnostic findings: ${verification.counts.diagnosticFindings}\n- Record-level misses: ${verification.counts.failedRecordDiagnostics}\n- Under-diverse classes: ${verification.counts.failedDiversityClasses}\n- Similar cross-class pairs above the proposed ceiling: ${verification.counts.failedSimilarityPairs}\n- Exact code repair targets: ${verification.counts.repairTargets}\n\n## Highest cross-class similarities\n\n| Pair | Similarity | Disposition |\n|---|---:|---|\n${highestConfusions}\n\n## Files\n\n- \`measurement-matrix.json\`: every measured witness and raw metric.\n- \`diagnostic-findings.json\`: per-record checks, diversity, class means, and 120 class pairs.\n- \`repair-recommendations.json\`: failures connected to exact \`field.node.js\` functions/branches.\n- \`threshold-register.json\`: proposed versus predeclared thresholds.\n- \`evidence-index.json\`: SHA-256 bindings for generator source, current-v3 outputs, generated meshes, and audit artifacts.\n- \`verification.json\`: fail-closed integrity/status summary.\n`;
await writeFile(path.join(OUTPUT_DIRECTORY, 'README.md'), readme);

console.log(JSON.stringify({
  ...verification,
  evidenceIndexSha256: sha256(await readFile(path.join(OUTPUT_DIRECTORY, 'evidence-index.json'))),
}, null, 2));
if (!verification.auditIntegrityPassed) process.exitCode = 1;
