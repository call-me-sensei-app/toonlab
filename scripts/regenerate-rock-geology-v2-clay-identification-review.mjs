#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { meshToObj } from '../src/rockgen/experimental/geology-v2/process/meshing.node.js';
import { meshC8BasisFixture } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import {
  createC8BasisFixtures,
  listC8BasisDefinitions,
} from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';

const CHECKPOINT_DIRECTORY = path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families');
const REVIEW_DIRECTORY = path.join(CHECKPOINT_DIRECTORY, 'clay-identification-review');
const SOURCE_DIRECTORY = path.join(REVIEW_DIRECTORY, 'current-v3-source');
const MESH_DIRECTORY = path.join(SOURCE_DIRECTORY, 'meshes');
const PROGRAM_DIRECTORY = path.join(SOURCE_DIRECTORY, 'programs');
const SELECTED_ROLES = new Set(['median', 'challenging', 'worst-passing']);
const GEOLOGY_SOURCE_DIRECTORY = path.resolve('src/rockgen/experimental/geology-v2');
const CAPTURE_SCRIPT = path.resolve('scripts/capture-rock-geology-v2-basis.mjs');
const PREPARE_SCRIPT = path.resolve('scripts/prepare-rock-geology-v2-clay-identification-review.mjs');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashMesh(mesh) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  hash.update(Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength));
  return hash.digest('hex');
}

async function sourceFiles(directory) {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (/\.(?:js|json)$/.test(entry.name)) result.push(target);
    }
  }
  await visit(directory);
  return result.sort();
}

async function captureSourceLineage() {
  const files = await sourceFiles(GEOLOGY_SOURCE_DIRECTORY);
  files.push(CAPTURE_SCRIPT);
  const entries = [];
  for (const file of files.sort()) {
    const relativePath = path.relative(process.cwd(), file);
    entries.push({ path: relativePath, sha256: sha256(await readFile(file)) });
  }
  const aggregate = entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join('');
  return { aggregateSha256: sha256(aggregate), files: entries };
}

await Promise.all([
  mkdir(MESH_DIRECTORY, { recursive: true }),
  mkdir(PROGRAM_DIRECTORY, { recursive: true }),
]);

const sourceLineageBefore = await captureSourceLineage();
const catalog = loadGeologyCatalog();
const definitions = listC8BasisDefinitions();
const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
const fixtures = createC8BasisFixtures({ catalog });
const records = [];

for (const definition of definitions) {
  for (const fixture of fixtures[definition.id].hero.filter((entry) => SELECTED_ROLES.has(entry.heroRole))) {
    const compiled = meshC8BasisFixture(fixture, { catalog, includeSelfIntersections: true });
    if (compiled.stages.basisField.descriptor.version !== 3) {
      throw new Error(`Current ${fixture.recipe.id} compiled basis descriptor version ${compiled.stages.basisField.descriptor.version}, expected 3.`);
    }
    const filename = `${definition.id}--${fixture.variant.id}--${fixture.heroRole}.obj`;
    const meshBytes = Buffer.from(meshToObj(compiled.mesh, { name: filename.replace('.obj', '') }));
    const meshPath = path.join(MESH_DIRECTORY, filename);
    await writeFile(meshPath, meshBytes);
    const program = {
      basisField: compiled.stages.basisField.descriptor,
      fractureOutputContentId: compiled.stages.fractureStage.outputContentId,
      processOutputContentId: compiled.stages.processStage.outputContentId,
      recipe: fixture.recipe,
      structureProgramContentId: compiled.stages.structuralProgram.programContentId,
    };
    const programBytes = Buffer.from(stableJson(program));
    const programRelativePath = `programs/${fixture.recipe.id}.json`;
    await writeFile(path.join(SOURCE_DIRECTORY, programRelativePath), programBytes);
    records.push({
      basisCompilerSchema: compiled.record.compiler.schema,
      basisCompilerVersion: compiled.record.compiler.version,
      basisFieldVersion: compiled.stages.basisField.descriptor.version,
      bounds: compiled.record.topology.bounds,
      familyId: definition.id,
      features: compiled.stages.basisField.descriptor.features,
      fieldContentId: compiled.stages.basisField.descriptor.fieldContentId,
      file: `meshes/${filename}`,
      heroRole: fixture.heroRole,
      lithology: fixture.recipe.lithology,
      mechanism: definitionById.get(definition.id).mechanism,
      meshContentSha256: hashMesh(compiled.mesh),
      meshContentId: compiled.record.meshContentId,
      meshObjSha256: sha256(meshBytes),
      meshResolution: compiled.record.resolution,
      programFile: programRelativePath,
      programSha256: sha256(programBytes),
      recipeId: fixture.recipe.id,
      variantId: fixture.variant.id,
    });
  }
}

if (records.length !== 24) throw new Error(`Expected exactly 24 current C8 review records, found ${records.length}.`);
await writeFile(path.join(SOURCE_DIRECTORY, 'hero-output-index.json'), stableJson(records));

const sourceLineageAfterCompile = await captureSourceLineage();
if (sourceLineageAfterCompile.aggregateSha256 !== sourceLineageBefore.aggregateSha256) {
  throw new Error('Geology/capture source changed during the current-v3 compile; refusing a mixed snapshot.');
}

const lineage = {
  basisCompilerVersion: 3,
  basisFieldVersion: 3,
  captureCommand: [
    process.execPath,
    path.relative(process.cwd(), CAPTURE_SCRIPT),
    path.relative(process.cwd(), SOURCE_DIRECTORY),
    path.relative(process.cwd(), path.join(SOURCE_DIRECTORY, 'no-bakes-admitted')),
  ],
  includedRoles: [...SELECTED_ROLES],
  recordCount: records.length,
  renderPolicy: 'Every role renders the raw current compiled OBJ; the explicit no-bakes path prevents render-mesh-uv substitution.',
  standardizedMeshResolution: 64,
  sourceLineage: sourceLineageBefore,
};
await writeFile(path.join(SOURCE_DIRECTORY, 'lineage.json'), stableJson(lineage));

execFileSync(process.execPath, [
  CAPTURE_SCRIPT,
  SOURCE_DIRECTORY,
  path.join(SOURCE_DIRECTORY, 'no-bakes-admitted'),
], { cwd: process.cwd(), stdio: 'inherit' });

const sourceLineageAfterCapture = await captureSourceLineage();
if (sourceLineageAfterCapture.aggregateSha256 !== sourceLineageBefore.aggregateSha256) {
  throw new Error('Geology/capture source changed during rendering; refusing a mixed snapshot.');
}

execFileSync(process.execPath, [PREPARE_SCRIPT], { cwd: process.cwd(), stdio: 'inherit' });

console.log(JSON.stringify({
  basisFieldVersion: 3,
  currentSource: path.relative(process.cwd(), SOURCE_DIRECTORY),
  records: records.length,
  renderPolicy: lineage.renderPolicy,
  sourceLineageAggregateSha256: sourceLineageBefore.aggregateSha256,
  status: 'current-v3-rerender-complete',
}, null, 2));
