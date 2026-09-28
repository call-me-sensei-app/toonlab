#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { encodeRgbaPng } from './lib/png-rgba.mjs';
import { compileRockBakeV2, rockBakeBundleSignature } from '../src/rockgen/experimental/geology-v2/bake/compiler.node.js';
import { selectRockBakePolicy } from '../src/rockgen/experimental/geology-v2/bake/policy.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { compileFractureBlockStage } from '../src/rockgen/experimental/geology-v2/fractures/compiler.node.js';
import { createC6ProcessFixtures } from '../src/rockgen/experimental/geology-v2/process/fixtures.node.js';
import { compileProcessStage } from '../src/rockgen/experimental/geology-v2/process/stability.node.js';
import { parseRockRecipe } from '../src/rockgen/experimental/geology-v2/recipe.node.js';
import { compileStructuralFieldProgram } from '../src/rockgen/experimental/geology-v2/structure/program.node.js';

function parseArguments(argv) {
  const options = {
    outputDirectory: path.resolve('artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler'),
    quick: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir') options.outputDirectory = path.resolve(argv[++index] ?? '');
    else if (argv[index] === '--quick') options.quick = true;
    else throw new RangeError(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function meshToObj(mesh, name) {
  const lines = [`o ${name}`];
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    lines.push(`v ${mesh.positions[vertex * 3]} ${mesh.positions[vertex * 3 + 1]} ${mesh.positions[vertex * 3 + 2]}`);
  }
  if (mesh.uvs) for (let vertex = 0; vertex < mesh.uvs.length / 2; vertex += 1) {
    lines.push(`vt ${mesh.uvs[vertex * 2]} ${mesh.uvs[vertex * 2 + 1]}`);
  }
  if (mesh.normals) for (let vertex = 0; vertex < mesh.normals.length / 3; vertex += 1) {
    lines.push(`vn ${mesh.normals[vertex * 3]} ${mesh.normals[vertex * 3 + 1]} ${mesh.normals[vertex * 3 + 2]}`);
  }
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const indices = [mesh.indices[face * 3], mesh.indices[face * 3 + 1], mesh.indices[face * 3 + 2]];
    lines.push(`f ${indices.map((index) => {
      const one = index + 1;
      if (mesh.uvs && mesh.normals) return `${one}/${one}/${one}`;
      if (mesh.normals) return `${one}//${one}`;
      return one;
    }).join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function coveragePage(coverage, width, color = [48, 217, 187]) {
  const data = new Uint8Array(width * width * 4);
  for (let texel = 0; texel < coverage.length; texel += 1) {
    data[texel * 4] = coverage[texel] ? color[0] : 17;
    data[texel * 4 + 1] = coverage[texel] ? color[1] : 21;
    data[texel * 4 + 2] = coverage[texel] ? color[2] : 22;
    data[texel * 4 + 3] = 255;
  }
  return data;
}

function heightPage(height, coverage, width) {
  let maximum = 0;
  for (let index = 0; index < height.length; index += 1) if (coverage[index]) maximum = Math.max(maximum, Math.abs(height[index]));
  const data = new Uint8Array(width * width * 4);
  for (let texel = 0; texel < height.length; texel += 1) {
    const normalized = maximum > 0 ? height[texel] / maximum : 0;
    data[texel * 4] = Math.round(127 + Math.max(normalized, 0) * 128);
    data[texel * 4 + 1] = Math.round(127 - Math.abs(normalized) * 64);
    data[texel * 4 + 2] = Math.round(127 + Math.max(-normalized, 0) * 128);
    data[texel * 4 + 3] = coverage[texel] ? 255 : 32;
  }
  return { data, maximumAbsoluteHeightMetres: maximum };
}

async function fileRecord(file) {
  const info = await stat(file);
  return { bytes: info.size, path: path.relative(options.outputDirectory, file).replaceAll(path.sep, '/') };
}

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDirectory, { recursive: true });
await mkdir(path.join(options.outputDirectory, 'textures'), { recursive: true });
await mkdir(path.join(options.outputDirectory, 'mips'), { recursive: true });
await mkdir(path.join(options.outputDirectory, 'meshes'), { recursive: true });
await mkdir(path.join(options.outputDirectory, 'intermediates'), { recursive: true });

const catalog = loadGeologyCatalog();
const sourceRecipe = structuredClone(createC6ProcessFixtures({ catalog }).freezeThaw);
sourceRecipe.id = 'c7-neutral-realistic-granodiorite-boulder';
sourceRecipe.label = 'C7 neutral realistic granodiorite boulder';
sourceRecipe.qualityTier = 'production';
const recipe = parseRockRecipe(sourceRecipe, { catalog }).recipe;
const structuralProgram = compileStructuralFieldProgram(recipe, { catalog });
const fractureStage = compileFractureBlockStage(recipe, structuralProgram, { catalog });
const processStage = compileProcessStage(recipe, structuralProgram, fractureStage, { catalog });
const compileOptions = options.quick ? {
  atlasResolution: 256,
  collisionResolution: 14,
  denseResolution: 28,
  fallbackResolutions: [20, 18, 16],
  gutterTexels: 8,
  renderResolution: 24,
} : {};

const first = compileRockBakeV2({ recipe, structuralProgram, fractureStage, processStage }, compileOptions);
const firstSignature = rockBakeBundleSignature(first);
const second = compileRockBakeV2({ recipe, structuralProgram, fractureStage, processStage }, compileOptions);
const secondSignature = rockBakeBundleSignature(second);
const deterministic = firstSignature === secondSignature
  && first.report.contentId === second.report.contentId
  && JSON.stringify(first.report.hashes) === JSON.stringify(second.report.hashes);

const failures = [];
let checks = 0;
function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
}

for (const audit of first.report.audits) {
  check(audit.finite.passed, 'NONFINITE_OR_INDEX_RANGE', { role: audit.role, finite: audit.finite });
  check(audit.topology.topologyFailures === 0, 'TOPOLOGY_FAILURE', { role: audit.role, topology: audit.topology });
  check(audit.topology.components === 1, 'UNINTENDED_COMPONENTS', { role: audit.role, components: audit.topology.components });
  check(audit.topology.selfIntersectionPairs === 0, 'SELF_INTERSECTION', { role: audit.role, selfIntersectionPairs: audit.topology.selfIntersectionPairs });
  check(audit.geometryGate, 'GEOMETRY_ERROR_LIMIT', { role: audit.role, hausdorff: audit.hausdorff, silhouette: audit.silhouette, limits: audit.limits });
}
check(first.report.bake.hitRate === 1, 'INCOMPLETE_SOURCE_HITS', first.report.bake);
check(first.report.bake.projectionConflicts === 0, 'AMBIGUOUS_PROJECTION', first.report.bake);
check(first.report.bake.flippedUvTriangles === 0, 'UV_FLIPS', first.report.bake);
check(first.report.bake.zeroAreaUvTriangles === 0, 'ZERO_AREA_UV', first.report.bake);
check(first.report.bake.finiteHighPrecisionIntermediates, 'NONFINITE_HIGH_PRECISION_INTERMEDIATE');
check(first.atlas.tangentAudit.finiteTangents
  && first.atlas.tangentAudit.zeroLengthTangents === 0
  && first.atlas.tangentAudit.maximumOrthogonalityError <= 1e-5
  && first.atlas.tangentAudit.maximumUnitLengthError <= 1e-5, 'TANGENT_FRAME_INVALID', first.atlas.tangentAudit);
check(Object.keys(first.bake.pages).sort().join(',') === 'baseColor,cavityCurvature,fracture,materialFabric,normal,ormHeight,weathering', 'CHANNEL_SET_INCOMPLETE', { pages: Object.keys(first.bake.pages) });
check(first.bake.pages.baseColor.colorSpace === 'sRGB' && Object.entries(first.bake.pages).filter(([id]) => id !== 'baseColor').every(([, page]) => page.colorSpace === 'linear'), 'COLOR_SPACE_METADATA_INVALID');
check(first.report.policy.texelDensity.passesMinimum || options.quick, 'TEXEL_DENSITY_FAILED', first.report.policy.texelDensity);
check(first.report.gates.separateAssetRoles, 'ASSET_ROLES_NOT_SEPARATE');
check(first.report.cages.every((fixture) => fixture.pass), 'CAGE_FIXTURE_FAILED', { cages: first.report.cages });
check(deterministic, 'REPEATED_HASH_MISMATCH', { firstSignature, secondSignature });
const semanticA = first.detailField.sample([0.13, 0.21, -0.11], [0, 1, 0], 0.2, 0.1).baseColorLinear;
const semanticB = first.detailField.sample([0.13, 0.21, -0.11], [0, 1, 0], 0.9, -0.5).baseColorLinear;
check(JSON.stringify(semanticA) === JSON.stringify(semanticB), 'BASE_COLOR_CONTAINS_BAKED_LIGHTING', { semanticA, semanticB });

const scalePolicy = [
  { dimensions: [2, 1.4, 1.2], scale: 'prop' },
  { dimensions: [10, 6, 4], scale: 'outcrop' },
  { dimensions: [40, 20, 10], scale: 'module' },
  { dimensions: [200, 80, 60], scale: 'formation' },
].map(({ dimensions, scale }) => {
  const value = { ...recipe, scale, targetDimensionsMetres: dimensions };
  const policy = selectRockBakePolicy(value);
  return { dimensions, scale, atlas: policy.atlas, minimumViewDistanceMetres: policy.minimumViewDistanceMetres, desiredPixelsPerMetre: policy.texelDensity.desiredPixelsPerMetre };
});
check(scalePolicy.slice(2).every((item) => item.atlas.strategy === 'udim-or-virtual-texture'), 'LARGE_SCALE_POLICY_NOT_VIRTUALIZED', { scalePolicy });

const outputFiles = [];
for (const [role, mesh] of Object.entries(first.assets)) {
  const file = path.join(options.outputDirectory, 'meshes', `${role}.obj`);
  await writeFile(file, meshToObj(mesh, role));
  outputFiles.push(file);
}
const atlasObj = path.join(options.outputDirectory, 'meshes', 'render-mesh-uv.obj');
await writeFile(atlasObj, meshToObj(first.atlas.mesh, 'render-mesh-uv'));
outputFiles.push(atlasObj);
for (const [id, page] of Object.entries(first.bake.pages)) {
  const file = path.join(options.outputDirectory, 'textures', `${id}.png`);
  await writeFile(file, encodeRgbaPng(page.width, page.height, page.data));
  outputFiles.push(file);
}
for (const [id, levels] of Object.entries(first.bake.mipChains)) for (let level = 1; level < levels.length; level += 1) {
  const page = levels[level];
  const file = path.join(options.outputDirectory, 'mips', `${id}-mip-${String(level).padStart(2, '0')}.png`);
  await writeFile(file, encodeRgbaPng(page.width, page.height, page.data));
  outputFiles.push(file);
}
const uvFile = path.join(options.outputDirectory, 'textures', 'uv-coverage.png');
await writeFile(uvFile, encodeRgbaPng(first.atlas.atlasResolution, first.atlas.atlasResolution, coveragePage(first.bake.coverage, first.atlas.atlasResolution)));
outputFiles.push(uvFile);
const heightDiagnostic = heightPage(first.bake.highPrecision.height, first.bake.coverage, first.atlas.atlasResolution);
const cageFile = path.join(options.outputDirectory, 'textures', 'cage-height-diagnostic.png');
await writeFile(cageFile, encodeRgbaPng(first.atlas.atlasResolution, first.atlas.atlasResolution, heightDiagnostic.data));
outputFiles.push(cageFile);
for (const [id, data] of Object.entries(first.bake.highPrecision)) {
  const file = path.join(options.outputDirectory, 'intermediates', `${id}.f32`);
  await writeFile(file, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  outputFiles.push(file);
}

const records = await Promise.all(outputFiles.map(fileRecord));
const outputSizes = {
  files: records.sort((a, b) => a.path.localeCompare(b.path)),
  totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
};
const report = {
  passed: failures.length === 0 && first.report.passed,
  status: 'candidate-awaiting-developer-approval',
  quick: options.quick,
  counts: {
    checks,
    failures: failures.length,
    meshAssets: Object.keys(first.assets).length,
    outputFiles: outputFiles.length,
    texturePages: Object.keys(first.bake.pages).length,
  },
  gates: first.report.gates,
  compilerReport: first.report,
  determinism: { deterministic, firstSignature, secondSignature },
  scalePolicy,
  heightDiagnostic: { maximumAbsoluteHeightMetres: heightDiagnostic.maximumAbsoluteHeightMetres },
  failures,
};
if (options.quick) report.passed = failures.length === 0;
await writeFile(path.join(options.outputDirectory, 'automated-results.json'), json(report));
await writeFile(path.join(options.outputDirectory, 'geometry-audit.json'), json(first.report.audits));
await writeFile(path.join(options.outputDirectory, 'uv-bake-audit.json'), json({ ...first.report.bake, atlas: {
  atlasResolution: first.atlas.atlasResolution,
  gutterTexels: first.atlas.gutterTexels,
  initialIslandCount: first.atlas.initialIslandCount,
  packedIslandCount: first.atlas.packedIslandCount,
  packingPixelsPerMetre: first.atlas.packingPixelsPerMetre,
  tangentAudit: first.atlas.tangentAudit,
} }));
await writeFile(path.join(options.outputDirectory, 'cage-fixtures.json'), json(first.report.cages));
await writeFile(path.join(options.outputDirectory, 'channel-contract.json'), json(Object.fromEntries(Object.entries(first.bake.pages).map(([id, page]) => [id, { channels: page.channels, colorSpace: page.colorSpace, height: page.height, width: page.width, sha256: first.report.hashes.pages[id] }]))));
await writeFile(path.join(options.outputDirectory, 'scale-policy.json'), json(scalePolicy));
await writeFile(path.join(options.outputDirectory, 'timings.json'), json(first.report.timings));
await writeFile(path.join(options.outputDirectory, 'output-sizes.json'), json(outputSizes));
await writeFile(path.join(options.outputDirectory, 'determinism-results.json'), json(report.determinism));
console.log(json({
  atlasResolution: first.atlas.atlasResolution,
  checks,
  failures: failures.length,
  passed: report.passed,
  signature: firstSignature,
  texturePages: report.counts.texturePages,
  totalSeconds: Number((first.report.timings.totalMilliseconds / 1000).toFixed(2)),
}));
if (!report.passed) process.exitCode = 1;
