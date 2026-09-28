#!/usr/bin/env node

import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compileRockBakeV2, rockBakeBundleSignature } from '../src/rockgen/experimental/geology-v2/bake/compiler.node.js';
import { createDenseDetailField } from '../src/rockgen/experimental/geology-v2/bake/detailField.node.js';
import { c8BasisMeshBounds, compileC8BasisStages } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixtures, listC8BasisDefinitions } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { encodeRgbaPng } from './lib/png-rgba.mjs';

function parseArguments(argv) {
  const options = {
    atlasResolution: 256,
    filter: null,
    outputDirectory: path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/bakes'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--atlas-resolution') options.atlasResolution = Number(argv[++index]);
    else if (argv[index] === '--filter') options.filter = new RegExp(argv[++index] ?? '');
    else if (argv[index] === '--output-dir') options.outputDirectory = path.resolve(argv[++index] ?? '');
    else throw new RangeError(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(options.atlasResolution) || options.atlasResolution < 128) {
    throw new RangeError('C8 preview atlas resolution must be an integer of at least 128.');
  }
  return options;
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

function previewIntegrity(report) {
  return report.gates.cageDisambiguation
    && report.gates.colorSpaceMetadata
    && report.gates.highPrecisionIntermediates
    && report.gates.separateAssetRoles
    && report.gates.tangentSpace
    && report.gates.uvBake
    && report.audits.every((audit) => audit.finite.passed && audit.topologyGate);
}

const options = parseArguments(process.argv.slice(2));
const catalog = loadGeologyCatalog();
const fixtures = createC8BasisFixtures({ catalog });
const selected = listC8BasisDefinitions().flatMap((definition) => fixtures[definition.id].hero.slice(0, 2))
  .filter((fixture) => !options.filter || options.filter.test(`${fixture.definition.id}/${fixture.variant.id}`));
await mkdir(options.outputDirectory, { recursive: true });

const results = [];
for (const fixture of selected) {
  const assetId = `${fixture.definition.id}--${fixture.variant.id}`;
  const assetDirectory = path.join(options.outputDirectory, assetId);
  const textureDirectory = path.join(assetDirectory, 'textures');
  const meshDirectory = path.join(assetDirectory, 'meshes');
  await mkdir(textureDirectory, { recursive: true });
  await mkdir(meshDirectory, { recursive: true });
  try {
    const stages = compileC8BasisStages(fixture, { catalog });
    const detailField = createDenseDetailField(fixture.recipe, stages.basisField, {
      amplitudeMetres: Math.max(...fixture.recipe.targetDimensionsMetres) * 0.0025,
      seed: stages.processStage.processProgram.seeds.denseSource ?? fixture.recipe.seed,
    });
    const bundle = compileRockBakeV2({
      recipe: fixture.recipe,
      structuralProgram: stages.structuralProgram,
      fractureStage: stages.fractureStage,
      processStage: stages.processStage,
    }, {
      atlasResolution: options.atlasResolution,
      bounds: c8BasisMeshBounds(fixture),
      collisionResolution: 20,
      denseResolution: 60,
      detailField,
      // C8 preview LODs remain deliberately above the unresolved C10 runtime
      // policy floor. Very coarse grids can make separate talus blocks cross
      // geometrically even when the source field is disjoint.
      fallbackResolutions: [46, 42, 36],
      fieldContentId: stages.basisField.descriptor.fieldContentId,
      fieldKind: 'c8-basis-field-v2',
      gutterTexels: Math.max(8, Math.ceil(options.atlasResolution / 64)),
      orientMeshesToField: false,
      productionField: stages.basisField,
      renderResolution: 52,
    });
    const meshFile = path.join(meshDirectory, 'render-mesh-uv.obj');
    await writeFile(meshFile, meshToObj(bundle.atlas.mesh, assetId));
    for (const [id, page] of Object.entries(bundle.bake.pages)) {
      await writeFile(path.join(textureDirectory, `${id}.png`), encodeRgbaPng(page.width, page.height, page.data));
    }
    const requestedProductionStrategy = bundle.report.policy.atlas.strategy;
    const productionReady = requestedProductionStrategy === 'single-atlas'
      && bundle.report.policy.texelDensity.passesMinimum
      && bundle.report.passed;
    const record = {
      assetId,
      atlas: {
        actualPreviewResolution: bundle.atlas.atlasResolution,
        achievedPixelsPerMetre: bundle.report.policy.texelDensity.achievedPixelsPerMetre,
        desiredPixelsPerMetre: bundle.report.policy.texelDensity.desiredPixelsPerMetre,
        requestedProductionResolution: bundle.report.policy.atlas.requestedResolution,
        requestedProductionStrategy,
      },
      bakeIntegrityPassed: previewIntegrity(bundle.report),
      compilerPassed: bundle.report.passed,
      compilerReport: bundle.report,
      familyId: fixture.definition.id,
      fieldContentId: stages.basisField.descriptor.fieldContentId,
      heroRole: fixture.heroRole,
      mesh: 'meshes/render-mesh-uv.obj',
      productionReady,
      productionStatus: productionReady
        ? 'production-policy-satisfied'
        : 'preview-only; C10 must implement the requested production atlas/UDIM/VT policy',
      previewGeometryStatus: bundle.report.gates.geometry
        ? 'meets hero LOD error policy'
        : 'topology-valid preview mesh; hero LOD error policy remains a C10 gate',
      signature: rockBakeBundleSignature(bundle),
      texturePages: Object.fromEntries(Object.keys(bundle.bake.pages).map((id) => [id, `textures/${id}.png`])),
      variantId: fixture.variant.id,
    };
    await writeFile(path.join(assetDirectory, 'report.json'), `${JSON.stringify(record, null, 2)}\n`);
    results.push(record);
    console.log(`${assetId}: integrity=${record.bakeIntegrityPassed} production=${record.productionReady} atlas=${bundle.atlas.atlasResolution}`);
  } catch (error) {
    const record = {
      assetId,
      bakeIntegrityPassed: false,
      error: { message: error?.message ?? String(error), name: error?.name ?? 'Error' },
      familyId: fixture.definition.id,
      productionReady: false,
      variantId: fixture.variant.id,
    };
    results.push(record);
    console.error(`${assetId}: ${record.error.message}`);
  }
}

const outputFiles = [];
for (const result of results) {
  if (!result.mesh) continue;
  for (const relative of [result.mesh, ...Object.values(result.texturePages)]) {
    const file = path.join(options.outputDirectory, result.assetId, relative);
    const info = await stat(file);
    outputFiles.push({ bytes: info.size, path: path.relative(options.outputDirectory, file).replaceAll(path.sep, '/') });
  }
}
const report = {
  atlasResolution: options.atlasResolution,
  checkpoint: 8,
  counts: {
    failedIntegrity: results.filter((result) => !result.bakeIntegrityPassed).length,
    forms: results.length,
    productionReady: results.filter((result) => result.productionReady).length,
  },
  passed: results.length === selected.length && results.every((result) => result.bakeIntegrityPassed),
  policy: {
    checkpointUse: 'actual C7 high-to-low bake at preview resolution for C8 family review',
    productionClaim: false,
    productionTextureWorkDeferredTo: 'C10 scale/LOD/streaming policy implementation',
  },
  results,
  outputFiles,
};
await writeFile(path.join(options.outputDirectory, 'basis-bake-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ counts: report.counts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
