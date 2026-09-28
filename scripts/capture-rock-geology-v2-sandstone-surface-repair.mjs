#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDenseDetailField } from '../src/rockgen/experimental/geology-v2/bake/detailField.node.js';
import { compileC8BasisStages } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixtures } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

const OUTPUT_DIRECTORY = path.resolve('tmp/rock-geology-v2/sandstone-surface-repair');
const RECIPE_ID = 'c8-cross-bedded-sandstone-sandstone-cliff-hero-101000';

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function morphologyBasis(recipe) {
  const radians = recipe.geologyTransform.strikeDegrees * Math.PI / 180;
  return {
    across: [Math.cos(radians), 0, -Math.sin(radians)],
    origin: recipe.geologyTransform.originMetres,
    strike: [Math.sin(radians), 0, Math.cos(radians)],
  };
}

function morphologyToWorld(point, basis) {
  return [
    basis.origin[0] + point[0] * basis.strike[0] + point[2] * basis.across[0],
    basis.origin[1] + point[1],
    basis.origin[2] + point[0] * basis.strike[2] + point[2] * basis.across[2],
  ];
}

function fieldNormal(field, point, epsilon = 0.018) {
  const gradient = [0, 1, 2].map((axis) => {
    const ahead = [...point];
    const behind = [...point];
    ahead[axis] += epsilon;
    behind[axis] -= epsilon;
    return (field.evaluate(...ahead) - field.evaluate(...behind)) / (epsilon * 2);
  });
  return normalize(gradient);
}

function firstSurface(field, morphologyStart, morphologyEnd, basis, steps = 30) {
  let previousPoint = morphologyToWorld(morphologyStart, basis);
  let previousValue = field.evaluate(...previousPoint);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const morphologyPoint = morphologyStart.map((value, axis) => value + (morphologyEnd[axis] - value) * t);
    const point = morphologyToWorld(morphologyPoint, basis);
    const value = field.evaluate(...point);
    if (previousValue >= 0 && value <= 0) {
      let outside = previousPoint;
      let inside = point;
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const middle = outside.map((component, axis) => (component + inside[axis]) * 0.5);
        if (field.evaluate(...middle) > 0) outside = middle;
        else inside = middle;
      }
      return outside.map((component, axis) => (component + inside[axis]) * 0.5);
    }
    previousPoint = point;
    previousValue = value;
  }
  return null;
}

function raster(width, height, sampler) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgba = sampler(x, y) ?? [20, 26, 24, 255];
      data.set(rgba, (y * width + x) * 4);
    }
  }
  return { bytes: encodeRgbaPng(width, height, data), data, height, width };
}

function contactSheet(images, columns = 2, gutter = 8) {
  const rows = Math.ceil(images.length / columns);
  const cellWidth = Math.max(...images.map((entry) => entry.width));
  const cellHeight = Math.max(...images.map((entry) => entry.height));
  const width = columns * cellWidth + (columns + 1) * gutter;
  const height = rows * cellHeight + (rows + 1) * gutter;
  const data = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) data.set([12, 18, 16, 255], pixel * 4);
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const offsetX = gutter + (index % columns) * (cellWidth + gutter);
    const offsetY = gutter + Math.floor(index / columns) * (cellHeight + gutter);
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const source = (y * image.width + x) * 4;
        const target = ((offsetY + y) * width + offsetX + x) * 4;
        data.set(image.data.subarray(source, source + 4), target);
      }
    }
  }
  return encodeRgbaPng(width, height, data);
}

function linearToDisplay(value) {
  return Math.round(clamp(value) ** (1 / 2.2) * 255);
}

const catalog = loadGeologyCatalog();
const fixture = createC8BasisFixtures({ catalog })['cross-bedded-sandstone'].hero
  .find((candidate) => candidate.recipe.id === RECIPE_ID);
if (!fixture) throw new Error(`Missing fixture ${RECIPE_ID}.`);
const stages = compileC8BasisStages(fixture, { catalog });
const scale = Math.max(...fixture.recipe.targetDimensionsMetres);
const detail = createDenseDetailField(fixture.recipe, stages.basisField, {
  amplitudeMetres: scale * 0.0025,
  seed: stages.processStage.processProgram.seeds.denseSource ?? fixture.recipe.seed,
});
const basis = morphologyBasis(fixture.recipe);
const [halfX, halfY, halfZ] = fixture.recipe.targetDimensionsMetres.map((value) => value * 0.45);
const light = normalize([0.45, 0.72, 0.53]);
const frontWidth = 240;
const frontHeight = 224;
const topWidth = 240;
const topHeight = 224;
const closeWidth = 180;
const closeHeight = 224;
const frontHits = new Array(frontWidth * frontHeight);
const topHits = new Array(topWidth * topHeight);
const closeHits = new Array(closeWidth * closeHeight);

for (let py = 0; py < frontHeight; py += 1) {
  const y = halfY * 1.08 - (py / (frontHeight - 1)) * halfY * 2.16;
  for (let px = 0; px < frontWidth; px += 1) {
    const x = -halfX * 1.08 + (px / (frontWidth - 1)) * halfX * 2.16;
    frontHits[py * frontWidth + px] = firstSurface(
      detail,
      [x, y, halfZ * 1.42],
      [x, y, -halfZ * 1.42],
      basis,
      22,
    );
  }
}
for (let py = 0; py < topHeight; py += 1) {
  const z = -halfZ * 1.18 + (py / (topHeight - 1)) * halfZ * 2.36;
  for (let px = 0; px < topWidth; px += 1) {
    const x = -halfX * 1.08 + (px / (topWidth - 1)) * halfX * 2.16;
    topHits[py * topWidth + px] = firstSurface(
      detail,
      [x, halfY * 1.34, z],
      [x, -halfY * 1.34, z],
      basis,
      22,
    );
  }
}
for (let py = 0; py < closeHeight; py += 1) {
  const y = 2.85 - (py / (closeHeight - 1)) * 3.7;
  for (let px = 0; px < closeWidth; px += 1) {
    const x = -1.55 + (px / (closeWidth - 1)) * 3.1;
    closeHits[py * closeWidth + px] = firstSurface(
      detail,
      [x, y, halfZ * 1.42],
      [x, y, -halfZ * 1.42],
      basis,
      22,
    );
  }
}

const background = [18, 24, 22, 255];
const frontClay = raster(frontWidth, frontHeight, (x, y) => {
  const point = frontHits[y * frontWidth + x];
  if (!point) return background;
  const normal = fieldNormal(detail, point);
  const shade = 0.34 + Math.max(normal.reduce((sum, value, axis) => sum + value * light[axis], 0), 0) * 0.66;
  return [0.54, 0.5, 0.43].map((value) => linearToDisplay(value * shade)).concat(255);
});
const frontMaterial = raster(frontWidth, frontHeight, (x, y) => {
  const point = frontHits[y * frontWidth + x];
  if (!point) return background;
  const normal = fieldNormal(detail, point);
  const shade = 0.42 + Math.max(normal.reduce((sum, value, axis) => sum + value * light[axis], 0), 0) * 0.58;
  const material = detail.sample(point, normal, 0.9, 0);
  return material.baseColorLinear.map((value) => linearToDisplay(value * shade)).concat(255);
});
const frontRoughness = raster(frontWidth, frontHeight, (x, y) => {
  const point = frontHits[y * frontWidth + x];
  if (!point) return background;
  const normal = fieldNormal(detail, point);
  const material = detail.sample(point, normal, 0.9, 0);
  const value = Math.round(material.roughness * 255);
  return [value, value, value, 255];
});
const topMaterial = raster(topWidth, topHeight, (x, y) => {
  const point = topHits[y * topWidth + x];
  if (!point) return background;
  const normal = fieldNormal(detail, point);
  const shade = 0.48 + Math.max(normal.reduce((sum, value, axis) => sum + value * light[axis], 0), 0) * 0.52;
  const material = detail.sample(point, normal, 0.94, 0);
  return material.baseColorLinear.map((value) => linearToDisplay(value * shade)).concat(255);
});
const grazingLight = normalize([0.94, 0.16, 0.3]);
const closeGrazingClay = raster(closeWidth, closeHeight, (x, y) => {
  const point = closeHits[y * closeWidth + x];
  if (!point) return background;
  const normal = fieldNormal(detail, point, 0.009);
  const shade = 0.25 + Math.max(normal.reduce((sum, value, axis) => sum + value * grazingLight[axis], 0), 0) * 0.75;
  return [0.54, 0.5, 0.43].map((value) => linearToDisplay(value * shade)).concat(255);
});
const closeMaterial = raster(closeWidth, closeHeight, (x, y) => {
  const point = closeHits[y * closeWidth + x];
  if (!point) return background;
  const normal = fieldNormal(detail, point, 0.009);
  const shade = 0.4 + Math.max(normal.reduce((sum, value, axis) => sum + value * light[axis], 0), 0) * 0.6;
  const material = detail.sample(point, normal, 0.9, 0);
  return material.baseColorLinear.map((value) => linearToDisplay(value * shade)).concat(255);
});

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const panels = {
  'front-dense-clay.png': frontClay.bytes,
  'front-material.png': frontMaterial.bytes,
  'front-roughness.png': frontRoughness.bytes,
  'top-material.png': topMaterial.bytes,
  'close-grazing-dense-clay.png': closeGrazingClay.bytes,
  'close-material.png': closeMaterial.bytes,
};
for (const [filename, bytes] of Object.entries(panels)) await writeFile(path.join(OUTPUT_DIRECTORY, filename), bytes);
await writeFile(
  path.join(OUTPUT_DIRECTORY, 'material-dense-clay-diagnostic-board.png'),
  contactSheet([frontClay, frontMaterial, topMaterial, frontRoughness, closeGrazingClay, closeMaterial], 3),
);
const files = [...Object.keys(panels), 'material-dense-clay-diagnostic-board.png'];
const manifest = {
  fieldContentId: stages.basisField.descriptor.fieldContentId,
  files: Object.fromEntries(await Promise.all(files.map(async (file) => {
    const bytes = await readFile(path.join(OUTPUT_DIRECTORY, file));
    return [file, { bytes: bytes.length, sha256: sha256(bytes) }];
  }))),
  generatedBy: 'scripts/capture-rock-geology-v2-sandstone-surface-repair.mjs',
  immutableBakeAttempt: false,
  knownMacroDefectsOutsideSurfaceRepairOwnership: [
    'Both narrow vertical slots persist in dense clay and can still read as artificial tool marks.',
    'Their mesh-scale recess is part of the accepted r5d macro field; this surface repair does not hide or mutate it.',
  ],
  panelOrder: [
    'front dense clay',
    'front material',
    'top material',
    'front roughness',
    'close grazing-light dense clay',
    'close material',
  ],
  recipeId: RECIPE_ID,
};
await writeFile(path.join(OUTPUT_DIRECTORY, 'diagnostic-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
