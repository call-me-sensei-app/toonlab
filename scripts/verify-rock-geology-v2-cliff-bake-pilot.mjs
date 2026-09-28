#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compileRockBakeV2, rockBakeBundleSignature } from '../src/rockgen/experimental/geology-v2/bake/compiler.node.js';
import { createDenseDetailField } from '../src/rockgen/experimental/geology-v2/bake/detailField.node.js';
import { c8BasisMeshBounds, compileC8BasisStages } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixtures } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { hash01 } from '../src/rockgen/experimental/geology-v2/structure/math.node.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

const OUTPUT_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/reference-profile-cliff-bake-pilot',
);
const EXPECTED_RECIPE_ID = 'c8-cross-bedded-sandstone-sandstone-cliff-hero-101000';
const EXPECTED_FIELD_CONTENT_ID = 'sha256:c01447205e96f783561cc4a2685e846b40cccd553c5df5550dabfe39d788e07d';
const ATLAS_RESOLUTION = 2048;
const COMPILE_OPTIONS = Object.freeze({
  atlasResolution: ATLAS_RESOLUTION,
  collisionResolution: 20,
  denseResolution: 60,
  fallbackResolutions: Object.freeze([49, 42, 36]),
  gutterTexels: 32,
  orientMeshesToField: false,
  renderResolution: 56,
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function derivedPage(source, mapper, channels) {
  const data = new Uint8Array(source.data.length);
  for (let texel = 0; texel < data.length / 4; texel += 1) {
    const sourceOffset = texel * 4;
    const values = mapper(source.data.subarray(sourceOffset, sourceOffset + 4));
    data.set(values, sourceOffset);
  }
  return { channels, colorSpace: 'linear', data, height: source.height, width: source.width };
}

function finiteRange(values, coverage, stride = 1) {
  let maximum = -Infinity;
  let minimum = Infinity;
  let nonFinite = 0;
  let samples = 0;
  for (let texel = 0; texel < coverage.length; texel += 1) {
    if (!coverage[texel]) continue;
    for (let component = 0; component < stride; component += 1) {
      const value = values[texel * stride + component];
      if (!Number.isFinite(value)) nonFinite += 1;
      else {
        maximum = Math.max(maximum, value);
        minimum = Math.min(minimum, value);
      }
      samples += 1;
    }
  }
  return { maximum, minimum, nonFinite, samples };
}

function normalLengthAudit(normals, coverage) {
  let maximumUnitLengthError = 0;
  let nonFinite = 0;
  let samples = 0;
  for (let texel = 0; texel < coverage.length; texel += 1) {
    if (!coverage[texel]) continue;
    const values = [normals[texel * 3], normals[texel * 3 + 1], normals[texel * 3 + 2]];
    if (!values.every(Number.isFinite)) nonFinite += 1;
    else maximumUnitLengthError = Math.max(maximumUnitLengthError, Math.abs(1 - Math.hypot(...values)));
    samples += 1;
  }
  return { maximumUnitLengthError, nonFinite, samples };
}

function morphologyBasis(recipe) {
  const radians = recipe.geologyTransform.strikeDegrees * Math.PI / 180;
  return {
    acrossStrike: [Math.cos(radians), 0, -Math.sin(radians)],
    origin: recipe.geologyTransform.originMetres,
    strike: [Math.sin(radians), 0, Math.cos(radians)],
  };
}

function worldToMorphology(point, basis) {
  const relative = point.map((value, axis) => value - basis.origin[axis]);
  return [
    relative[0] * basis.strike[0] + relative[2] * basis.strike[2],
    relative[1],
    relative[0] * basis.acrossStrike[0] + relative[2] * basis.acrossStrike[2],
  ];
}

function barycentric2(point, a, b, c) {
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denominator) < 1e-14) return null;
  const wa = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
  const wb = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
  const wc = 1 - wa - wb;
  return wa >= -1e-8 && wb >= -1e-8 && wc >= -1e-8 ? [wa, wb, wc] : null;
}

function meshFrontDepth(mesh, basis, x, y) {
  let maximumDepth = -Infinity;
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const points = [0, 1, 2].map((corner) => {
      const vertex = mesh.indices[face * 3 + corner];
      return worldToMorphology([
        mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2],
      ], basis);
    });
    const weights = barycentric2([x, y], points[0], points[1], points[2]);
    if (!weights) continue;
    const depth = points.reduce((sum, point, index) => sum + point[2] * weights[index], 0);
    maximumDepth = Math.max(maximumDepth, depth);
  }
  return Number.isFinite(maximumDepth) ? maximumDepth : null;
}

function meshMorphologyBounds(mesh, basis) {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  const points = [];
  for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
    const point = worldToMorphology([
      mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2],
    ], basis);
    points.push(point);
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
  }
  return { maximum, minimum, points };
}

function quantile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.floor((ordered.length - 1) * fraction)));
  return ordered[index];
}

function toeWidth(bounds) {
  const height = bounds.maximum[1] - bounds.minimum[1];
  const limit = bounds.minimum[1] + height * 0.18;
  const xs = bounds.points.filter((point) => point[1] <= limit).map((point) => point[0]);
  return quantile(xs, 0.97) - quantile(xs, 0.03);
}

function namedMorphologyAudit(bundle, fixture) {
  const recipe = fixture.recipe;
  const seed = recipe.seed;
  const [halfX, halfY] = recipe.targetDimensionsMetres.map((value) => value * 0.45);
  const lerp = (a, b, t) => a + (b - a) * t;
  const bedDip = lerp(-0.045, 0.065, hash01(seed, 3210));
  const benchCenterX = lerp(-0.24, -0.08, hash01(seed, 3213));
  const benchLevel = -0.25 + (hash01(seed, 3211) - 0.5) * 0.055;
  const benchWidth = lerp(0.043, 0.065, hash01(seed, 3212));
  const secondJointX = 0.38 + (hash01(seed, 1, 3217) - 0.5) * 0.1;
  const lossMinimumY = lerp(0.21, 0.29, hash01(seed, 3231));
  const lossMaximumY = lossMinimumY + lerp(0.2, 0.29, hash01(seed, 3233));
  const lossMiddleY = (lossMinimumY + lossMaximumY) * 0.5;
  const lossInnerX = secondJointX + lerp(0.035, 0.09, hash01(seed, 3230))
    + Math.sin(lossMiddleY * Math.PI * 2.3 + hash01(seed, 3232) * Math.PI) * 0.035;
  const basis = morphologyBasis(recipe);
  const sourceMesh = bundle.assets['dense-source'];
  const renderMesh = bundle.assets['render-mesh'];
  const featureRelief = (mesh, normalizedX, center, radius) => {
    const x = normalizedX * halfX;
    const depth = (bedCoordinate) => meshFrontDepth(mesh, basis, x, (bedCoordinate - normalizedX * bedDip) * halfY);
    const middle = depth(center);
    const lower = depth(center - radius);
    const upper = depth(center + radius);
    return middle !== null && lower !== null && upper !== null
      ? middle - (lower + upper) * 0.5
      : null;
  };
  const featureRecession = (mesh, normalizedX) => {
    const x = normalizedX * halfX;
    const depth = (bedCoordinate) => meshFrontDepth(mesh, basis, x, (bedCoordinate - normalizedX * bedDip) * halfY);
    const middle = depth(lossMiddleY);
    const below = depth(lossMinimumY - 0.11);
    return middle !== null && below !== null ? below - middle : null;
  };
  const benchSamples = [benchCenterX - 0.25, benchCenterX, benchCenterX + 0.25].map((normalizedX) => ({
    normalizedX,
    renderReliefMetres: featureRelief(renderMesh, normalizedX, benchLevel, benchWidth * 3.2),
    sourceReliefMetres: featureRelief(sourceMesh, normalizedX, benchLevel, benchWidth * 3.2),
  }));
  const recessSamples = [lossInnerX + 0.08, lossInnerX + 0.16].map((normalizedX) => ({
    normalizedX,
    renderRecessionMetres: featureRecession(renderMesh, normalizedX),
    sourceRecessionMetres: featureRecession(sourceMesh, normalizedX),
  }));
  const median = (values) => quantile(values.filter(Number.isFinite), 0.5);
  const bench = {
    minimumRenderReliefMetres: 0.06,
    minimumRetentionRatio: 0.5,
    renderReliefMetres: median(benchSamples.map((sample) => sample.renderReliefMetres)),
    samples: benchSamples,
    sourceReliefMetres: median(benchSamples.map((sample) => sample.sourceReliefMetres)),
  };
  bench.retentionRatio = bench.renderReliefMetres / Math.max(bench.sourceReliefMetres, 1e-9);
  bench.passed = bench.renderReliefMetres >= bench.minimumRenderReliefMetres
    && bench.retentionRatio >= bench.minimumRetentionRatio;
  const edgeOpenRecess = {
    minimumRenderRecessionMetres: 0.15,
    minimumRetentionRatio: 0.5,
    renderRecessionMetres: median(recessSamples.map((sample) => sample.renderRecessionMetres)),
    samples: recessSamples,
    sourceRecessionMetres: median(recessSamples.map((sample) => sample.sourceRecessionMetres)),
  };
  edgeOpenRecess.retentionRatio = edgeOpenRecess.renderRecessionMetres / Math.max(edgeOpenRecess.sourceRecessionMetres, 1e-9);
  edgeOpenRecess.passed = edgeOpenRecess.renderRecessionMetres >= edgeOpenRecess.minimumRenderRecessionMetres
    && edgeOpenRecess.retentionRatio >= edgeOpenRecess.minimumRetentionRatio;
  const sourceBounds = meshMorphologyBounds(sourceMesh, basis);
  const renderBounds = meshMorphologyBounds(renderMesh, basis);
  const maximumVerticalDriftMetres = 0.25;
  const crest = {
    driftMetres: Math.abs(renderBounds.maximum[1] - sourceBounds.maximum[1]),
    maximumDriftMetres: maximumVerticalDriftMetres,
    renderYMetres: renderBounds.maximum[1],
    sourceYMetres: sourceBounds.maximum[1],
  };
  crest.passed = crest.driftMetres <= crest.maximumDriftMetres;
  const sourceToeWidth = toeWidth(sourceBounds);
  const renderToeWidth = toeWidth(renderBounds);
  const toe = {
    minimumWidthRetentionRatio: 0.85,
    renderWidthMetres: renderToeWidth,
    sourceWidthMetres: sourceToeWidth,
    verticalDriftMetres: Math.abs(renderBounds.minimum[1] - sourceBounds.minimum[1]),
    widthRetentionRatio: renderToeWidth / Math.max(sourceToeWidth, 1e-9),
  };
  toe.passed = toe.verticalDriftMetres <= maximumVerticalDriftMetres
    && toe.widthRetentionRatio >= toe.minimumWidthRetentionRatio;
  const noInventedLooseTalus = bundle.report.audits.every((audit) => audit.topology.components === 1);
  return {
    bench,
    crest,
    edgeOpenRecess,
    method: 'morphology-frame front-depth probes plus dense/render crest and basal-width comparison',
    noInventedLooseTalus,
    passed: bench.passed && crest.passed && edgeOpenRecess.passed && toe.passed && noInventedLooseTalus,
    toe,
  };
}

function previewIntegrity(report) {
  return report.gates.cageDisambiguation
    && report.gates.colorSpaceMetadata
    && report.gates.highPrecisionIntermediates
    && report.gates.separateAssetRoles
    && report.gates.tangentSpace
    && report.gates.uvBake
    && report.audits.every((audit) => audit.finite.passed && audit.topologyGate);
}

async function fileRecord(file, root = OUTPUT_DIRECTORY) {
  const bytes = await readFile(file);
  return {
    bytes: (await stat(file)).size,
    path: path.relative(root, file).replaceAll(path.sep, '/'),
    sha256: sha256(bytes),
  };
}

const catalog = loadGeologyCatalog();
const fixture = createC8BasisFixtures({ catalog })['cross-bedded-sandstone'].hero
  .find((candidate) => candidate.recipe.id === EXPECTED_RECIPE_ID);
if (!fixture) throw new Error(`Missing exact pilot fixture ${EXPECTED_RECIPE_ID}.`);
const stages = compileC8BasisStages(fixture, { catalog });
if (stages.basisField.descriptor.fieldContentId !== EXPECTED_FIELD_CONTENT_ID) {
  throw new Error(`Pilot field drift: expected ${EXPECTED_FIELD_CONTENT_ID}, got ${stages.basisField.descriptor.fieldContentId}.`);
}
const detailOptions = {
  amplitudeMetres: Math.max(...fixture.recipe.targetDimensionsMetres) * 0.0025,
  seed: stages.processStage.processProgram.seeds.denseSource ?? fixture.recipe.seed,
};

function compile() {
  const detailField = createDenseDetailField(fixture.recipe, stages.basisField, detailOptions);
  return compileRockBakeV2({
    recipe: fixture.recipe,
    structuralProgram: stages.structuralProgram,
    fractureStage: stages.fractureStage,
    processStage: stages.processStage,
  }, {
    ...COMPILE_OPTIONS,
    bounds: c8BasisMeshBounds(fixture),
    detailField,
    fieldContentId: EXPECTED_FIELD_CONTENT_ID,
    fieldKind: 'c8-basis-field-v2',
    productionField: stages.basisField,
  });
}

const first = compile();
const second = compile();
const firstSignature = rockBakeBundleSignature(first);
const secondSignature = rockBakeBundleSignature(second);
const deterministicRerun = firstSignature === secondSignature
  && JSON.stringify(first.report.hashes) === JSON.stringify(second.report.hashes)
  && first.report.contentId === second.report.contentId;

const meshesDirectory = path.join(OUTPUT_DIRECTORY, 'meshes');
const texturesDirectory = path.join(OUTPUT_DIRECTORY, 'textures');
const rawTexturesDirectory = path.join(texturesDirectory, 'raw-packed');
await mkdir(meshesDirectory, { recursive: true });
await mkdir(texturesDirectory, { recursive: true });
await mkdir(rawTexturesDirectory, { recursive: true });

const writtenFiles = [];
for (const [role, mesh] of Object.entries(first.assets)) {
  const filename = path.join(meshesDirectory, `${role}.obj`);
  await writeFile(filename, meshToObj(mesh, `sandstone-cliff-${role}`));
  writtenFiles.push(filename);
}
const uvMeshFile = path.join(meshesDirectory, 'render-mesh-uv.obj');
await writeFile(uvMeshFile, meshToObj(first.atlas.mesh, 'sandstone-cliff-render-mesh-uv'));
writtenFiles.push(uvMeshFile);

for (const [id, page] of Object.entries(first.bake.pages)) {
  const filename = path.join(rawTexturesDirectory, `${id}.png`);
  await writeFile(filename, encodeRgbaPng(page.width, page.height, page.data));
  writtenFiles.push(filename);
}

const pages = first.bake.pages;
const deliverablePages = {
  baseColor: pages.baseColor,
  cavity: derivedPage(pages.cavityCurvature, (rgba) => [rgba[0], rgba[0], rgba[0], rgba[3]], 'rgb=cavity; a=coverage'),
  fabric: derivedPage(pages.materialFabric, (rgba) => [rgba[1], rgba[1], rgba[1], rgba[3]], 'rgb=fabric weakness; a=coverage'),
  fracture: derivedPage(pages.fracture, (rgba) => [rgba[0], rgba[0], rgba[0], rgba[3]], 'rgb=fracture influence; a=coverage'),
  normal: pages.normal,
  orm: derivedPage(pages.ormHeight, (rgba) => [rgba[0], rgba[1], 0, rgba[3]], 'r=AO; g=roughness; b=metallic=0; a=coverage'),
  signedHeight: derivedPage(pages.ormHeight, (rgba) => [rgba[2], rgba[2], rgba[2], rgba[3]], 'rgb=signed height UNORM; decode=(u*2-1)*cageDistance; a=coverage'),
  weathering: derivedPage(pages.weathering, (rgba) => [rgba[0], rgba[0], rgba[0], rgba[3]], 'rgb=weathering; a=coverage'),
};
for (const [id, page] of Object.entries(deliverablePages)) {
  const filename = path.join(texturesDirectory, `${id}.png`);
  await writeFile(filename, encodeRgbaPng(page.width, page.height, page.data));
  writtenFiles.push(filename);
}

const highPrecision = {
  ao: finiteRange(first.bake.highPrecision.ao, first.bake.coverage),
  curvature: finiteRange(first.bake.highPrecision.curvature, first.bake.coverage),
  heightMetres: finiteRange(first.bake.highPrecision.height, first.bake.coverage),
  normalComponents: finiteRange(first.bake.highPrecision.normal, first.bake.coverage, 3),
  normalUnitLength: normalLengthAudit(first.bake.highPrecision.normal, first.bake.coverage),
  roughness: finiteRange(first.bake.highPrecision.roughness, first.bake.coverage),
};
const finiteRangesPassed = Object.values(highPrecision).every((entry) => entry.nonFinite === 0)
  && highPrecision.ao.minimum >= 0 && highPrecision.ao.maximum <= 1
  && highPrecision.roughness.minimum >= 0 && highPrecision.roughness.maximum <= 1
  && highPrecision.normalComponents.minimum >= -1.000001 && highPrecision.normalComponents.maximum <= 1.000001
  && highPrecision.normalUnitLength.maximumUnitLengthError <= 1e-5;
const namedMorphology = namedMorphologyAudit(first, fixture);
const silhouetteAuditPassed = first.report.audits
  .filter((audit) => audit.role !== 'dense-source' && audit.role !== 'collision')
  .every((audit) => audit.silhouette.maximumBoundaryErrorPixels <= audit.limits.allowedSilhouettePixels);
const topologyPassed = first.report.audits.every((audit) => audit.topologyGate && audit.finite.passed);
const bakeChannelsPassed = previewIntegrity(first.report)
  && Object.keys(deliverablePages).sort().join(',') === 'baseColor,cavity,fabric,fracture,normal,orm,signedHeight,weathering';
const previewTechnicalPassed = deterministicRerun
  && topologyPassed
  && bakeChannelsPassed
  && finiteRangesPassed
  && silhouetteAuditPassed
  && namedMorphology.passed;

const report = {
  approvals: {
    megascansParity: false,
    productionReady: false,
    userVisualApproval: false,
    visualImprovementApproval: false,
  },
  bake: {
    atlasResolution: ATLAS_RESOLUTION,
    channelContracts: Object.fromEntries(Object.entries(deliverablePages).map(([id, page]) => [id, {
      channels: page.channels,
      colorSpace: page.colorSpace,
    }])),
    compilerReport: first.report,
    detailAmplitudeMetres: detailOptions.amplitudeMetres,
    detailSeed: detailOptions.seed,
    signature: firstSignature,
  },
  checkpoint: 8,
  compileOptions: COMPILE_OPTIONS,
  resolutionSelection: {
    auditResolutionPixels: 128,
    baseline: {
      fallback1: { boundaryErrorPixels: 2.23606797749979, passed: false, resolution: 46 },
      render: { boundaryErrorPixels: 2.23606797749979, passed: false, resolution: 52 },
    },
    limitPixels: 2,
    method: 'pre-bake dense-source silhouette probe; gate was retained and sampling was increased',
    selected: {
      fallback1: { boundaryErrorPixels: 2, passed: true, resolution: 49 },
      render: { boundaryErrorPixels: 2, passed: true, resolution: 56 },
    },
  },
  decisions: {
    bakeLegitimatelyImprovesDefinition: null,
    note: 'Set only after inspecting the matched clay/PBR board; maps cannot repair silhouette.',
    productionTextureStatus: 'blocked: compiler requests 16K UDIM/virtual texture; this 2K atlas is a review preview',
  },
  deterministicRerun: {
    firstContentId: first.report.contentId,
    firstSignature,
    passed: deterministicRerun,
    secondContentId: second.report.contentId,
    secondSignature,
  },
  field: {
    descriptor: stages.basisField.descriptor,
    expectedFieldContentId: EXPECTED_FIELD_CONTENT_ID,
    exactFieldBound: stages.basisField.descriptor.fieldContentId === EXPECTED_FIELD_CONTENT_ID,
    recipeContentId: stages.structuralProgram.recipeContentId,
    recipeId: fixture.recipe.id,
  },
  gates: {
    bakeChannels: bakeChannelsPassed,
    deterministicRerun,
    exactHashLineage: stages.basisField.descriptor.fieldContentId === EXPECTED_FIELD_CONTENT_ID
      && first.report.sourceField.contentId === EXPECTED_FIELD_CONTENT_ID,
    finiteRanges: finiteRangesPassed,
    heroHausdorffProductionPolicy: first.report.gates.geometry,
    namedMorphology: namedMorphology.passed,
    noInventedLooseTalus: namedMorphology.noInventedLooseTalus,
    previewTechnicalPassed,
    productionTexelDensity: first.report.policy.texelDensity.passesMinimum,
    silhouettePreservation: silhouetteAuditPassed,
    topology: topologyPassed,
  },
  highPrecision,
  limitations: [
    'The 2048 atlas is review-only; the current scale-aware policy requests a 16384 atlas and UDIM/virtual-texture strategy.',
    'The C8 preview mesh ladder started at 60/52/46/42/36/20. The unchanged two-pixel silhouette gate required audited uplifts to 60/56/49/42/36/20. A failed hero Hausdorff gate remains visible and must not be relabeled as production geometry.',
    'The source turnaround contains inferred hidden views and is not measured photogrammetry.',
    'No Megascans-equivalence claim is made; close-up reference-scene and target-device evidence remain absent.',
  ],
  morphology: namedMorphology,
  passed: previewTechnicalPassed,
  productionReady: false,
  schema: 'toonlab/rock-geology-v2-cliff-bake-pilot-report',
  version: 1,
};

const reportFile = path.join(OUTPUT_DIRECTORY, 'technical-report.json');
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
writtenFiles.push(reportFile);
const manifest = {
  files: await Promise.all(writtenFiles.sort().map((file) => fileRecord(file))),
  root: path.relative(path.resolve('.'), OUTPUT_DIRECTORY).replaceAll(path.sep, '/'),
  schema: 'toonlab/rock-geology-v2-cliff-bake-pilot-files',
  sourceFieldContentId: EXPECTED_FIELD_CONTENT_ID,
  version: 1,
};
const manifestFile = path.join(OUTPUT_DIRECTORY, 'artifact-manifest.json');
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  atlasResolution: ATLAS_RESOLUTION,
  fieldContentId: EXPECTED_FIELD_CONTENT_ID,
  gates: report.gates,
  outputDirectory: OUTPUT_DIRECTORY,
  signature: firstSignature,
}, null, 2));
if (!report.passed) process.exitCode = 1;
