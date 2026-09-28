#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { contentId } from '../src/rockgen/experimental/geology-v2/canonical.node.js';
import { meshAuthoredCanonicalFixture } from '../src/rockgen/experimental/geology-v2/canonical/compiler.node.js';
import { createAuthoredCanonicalFixtures } from '../src/rockgen/experimental/geology-v2/canonical/fixtures.node.js';
import {
  createCanonicalAuthoringRegister,
  summarizeCanonicalAuthoringRegister,
} from '../src/rockgen/experimental/geology-v2/canonical/register.node.js';
import { validateEditableSourcePackage } from '../src/rockgen/experimental/geology-v2/canonical/sourcePackage.node.js';
import {
  createAuthoredCanonicalRevisions,
  expectOutOfEnvelopeRejection,
} from '../src/rockgen/experimental/geology-v2/canonical/variants.node.js';
import { meshToObj } from '../src/rockgen/experimental/geology-v2/process/meshing.node.js';
import { encodeMeshGlb } from './lib/mesh-glb.mjs';

function parseArguments(argv) {
  const options = {
    outputDirectory: path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/canonical-pilot'),
    resolution: 48,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir') options.outputDirectory = path.resolve(argv[++index] ?? '');
    else if (argv[index] === '--resolution') options.resolution = Number(argv[++index]);
    else throw new RangeError(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(options.resolution) || options.resolution < 32) {
    throw new RangeError('Canonical pilot mesh resolution must be an integer of at least 32.');
  }
  return options;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function writeJson(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(file, text);
  return { bytes: Buffer.byteLength(text), contentHash: hashBytes(text) };
}

function sourceMetadata(source) {
  const separated = new Set(['controlProgram', 'identityLandmarks', 'modifierStack']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !separated.has(key)));
}

function reconstructSource(manifest, controlProgram, identityLandmarks, modifierStack) {
  return {
    ...manifest.packageMetadata,
    controlProgram,
    identityLandmarks,
    modifierStack,
  };
}

function expectMissingShapeRationaleRejection(source) {
  const invalid = structuredClone(source);
  delete invalid.shapeRationale;
  try {
    validateEditableSourcePackage(invalid);
  } catch (error) {
    return { code: error?.code ?? null, passed: error?.code === 'missing-shape-rationale' };
  }
  return { code: null, passed: false };
}

async function writeSourceRevision({ assetDirectory, fixture, kind, meshResult, source }) {
  const directory = path.join(assetDirectory, `${kind}-source`);
  await mkdir(directory, { recursive: true });
  const validated = validateEditableSourcePackage(source);
  const files = {};
  files['control-program.json'] = await writeJson(path.join(directory, 'control-program.json'), source.controlProgram);
  files['identity-landmarks.json'] = await writeJson(path.join(directory, 'identity-landmarks.json'), source.identityLandmarks);
  files['modifier-stack.json'] = await writeJson(path.join(directory, 'modifier-stack.json'), source.modifierStack);
  files['recipe.json'] = await writeJson(path.join(directory, 'recipe.json'), fixture.recipe);
  const glb = encodeMeshGlb(meshResult.mesh, { name: `${source.sourceId}-${kind}-control-cage` });
  await writeFile(path.join(directory, 'control-cage.glb'), glb);
  files['control-cage.glb'] = { bytes: glb.byteLength, contentHash: hashBytes(glb) };
  const obj = meshToObj(meshResult.mesh, { name: `${source.sourceId}-${kind}-clay` });
  await writeFile(path.join(directory, 'clay-mesh.obj'), obj);
  files['clay-mesh.obj'] = { bytes: Buffer.byteLength(obj), contentHash: hashBytes(obj) };
  const manifest = {
    artifactGraph: {
      canonicalEditableSource: true,
      clayMeshRole: 'review-only-derived-artifact',
      runtimeAndBakeOutputsDiscardable: true,
    },
    compiler: meshResult.record.compiler,
    editableSourceContentId: validated.contentId,
    files,
    kind,
    packageMetadata: sourceMetadata(source),
    schema: 'toonlab/editable-rock-source-manifest',
    status: 'authored-awaiting-visual-review',
    unit: 'metre',
    version: 1,
  };
  files['source-manifest.json'] = await writeJson(path.join(directory, 'source-manifest.json'), manifest);

  const loadedManifest = JSON.parse(await readFile(path.join(directory, 'source-manifest.json'), 'utf8'));
  const roundTripped = reconstructSource(
    loadedManifest,
    JSON.parse(await readFile(path.join(directory, 'control-program.json'), 'utf8')),
    JSON.parse(await readFile(path.join(directory, 'identity-landmarks.json'), 'utf8')),
    JSON.parse(await readFile(path.join(directory, 'modifier-stack.json'), 'utf8')),
  );
  const roundTrip = validateEditableSourcePackage(roundTripped);
  return {
    directory: path.relative(assetDirectory, directory).replaceAll(path.sep, '/'),
    files,
    identity: meshResult.record.identity,
    mesh: {
      components: meshResult.record.topology.connectedComponents,
      contentId: meshResult.record.meshContentId,
      selfIntersectionPairs: meshResult.record.topology.selfIntersectionPairs,
      triangles: meshResult.mesh.indices.length / 3,
      vertices: meshResult.mesh.positions.length / 3,
    },
    passed: meshResult.record.passed && roundTrip.contentId === validated.contentId,
    roundTrip: {
      contentIdAfterRead: roundTrip.contentId,
      exactContentIdentity: roundTrip.contentId === validated.contentId,
    },
    sourceContentId: validated.contentId,
    sourceRevision: source.sourceRevision,
    shapeRationale: {
      featureCount: source.shapeRationale.length,
      referenceKinds: [...new Set(source.shapeRationale.map((item) => item.referenceKind))].sort(),
    },
    topology: meshResult.record.topology,
    visualApprovalRequired: true,
  };
}

const options = parseArguments(process.argv.slice(2));
await mkdir(options.outputDirectory, { recursive: true });
const fixtures = createAuthoredCanonicalFixtures();
const results = [];

for (const fixture of fixtures) {
  const assetDirectory = path.join(options.outputDirectory, fixture.source.sourceId);
  await mkdir(assetDirectory, { recursive: true });
  const revisions = createAuthoredCanonicalRevisions(fixture);
  const revisionResults = {};
  for (const kind of ['canonical', 'procedural', 'manual']) {
    const revisedFixture = { ...fixture, source: revisions[kind] };
    const meshResult = meshAuthoredCanonicalFixture(revisedFixture, {
      includeSelfIntersections: true,
      resolution: options.resolution,
    });
    revisionResults[kind] = await writeSourceRevision({
      assetDirectory,
      fixture: revisedFixture,
      kind,
      meshResult,
      source: revisions[kind],
    });
  }
  const deterministicRebuild = meshAuthoredCanonicalFixture(fixture, {
    includeSelfIntersections: true,
    resolution: options.resolution,
  });
  const invalidEdit = expectOutOfEnvelopeRejection(fixture);
  const missingShapeRationale = expectMissingShapeRationaleRejection(fixture.source);
  const record = {
    deterministicRebuild: {
      contentIdentity: deterministicRebuild.record.meshContentId === revisionResults.canonical.mesh.contentId,
      meshContentId: deterministicRebuild.record.meshContentId,
    },
    independentProvenance: fixture.source.provenance.existing480CatalogAsset === false,
    invalidEdit,
    label: fixture.definition.label,
    passed: Object.values(revisionResults).every((revision) => revision.passed)
      && deterministicRebuild.record.meshContentId === revisionResults.canonical.mesh.contentId
      && invalidEdit.passed
      && missingShapeRationale.passed,
    shapeRationaleGate: missingShapeRationale,
    revisions: revisionResults,
    sourceId: fixture.source.sourceId,
    subtypeId: fixture.source.subtypeId,
    visualStatus: 'awaiting-clay-and-bake-review',
  };
  await writeJson(path.join(assetDirectory, 'round-trip-report.json'), record);
  results.push(record);
  console.log(`${record.sourceId}: roundtrip=${record.passed} canonical=${record.revisions.canonical.mesh.vertices}v/${record.revisions.canonical.mesh.triangles}t`);
}

const register = structuredClone(createCanonicalAuthoringRegister());
const producedById = new Map(results.map((result) => [result.sourceId, result]));
register.slots = register.slots.map((slot) => {
  const produced = producedById.get(slot.slotId);
  if (!produced) return slot;
  return {
    ...slot,
    authoredEvidence: {
      independentProvenance: produced.independentProvenance,
      roundTripReport: `${slot.slotId}/round-trip-report.json`,
      sourceRevision: produced.revisions.canonical.sourceRevision,
    },
    status: 'authored-awaiting-visual-review',
  };
});
const registerSummary = summarizeCanonicalAuthoringRegister(register);
await writeJson(path.join(options.outputDirectory, 'authoring-register.json'), register);
await writeJson(path.join(options.outputDirectory, 'authoring-register-summary.json'), registerSummary);

const files = [];
for (const result of results) {
  for (const revision of Object.values(result.revisions)) {
    for (const [name] of Object.entries(revision.files)) {
      const file = path.join(options.outputDirectory, result.sourceId, revision.directory, name);
      const information = await stat(file);
      files.push({ bytes: information.size, path: path.relative(options.outputDirectory, file).replaceAll(path.sep, '/') });
    }
  }
}
const report = {
  checkpoint: 8,
  counts: {
    authoredAwaitingVisualReview: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    plannedCanonicalSources: register.slots.length,
    stillUnassigned: register.slots.filter((slot) => slot.status === 'planned-unassigned').length,
  },
  files,
  passed: results.length === fixtures.length && results.every((result) => result.passed),
  policy: {
    existing480CatalogContribution: 0,
    productionClaim: false,
    visualApprovalRequired: true,
  },
  registerContentId: contentId(register),
  resolution: options.resolution,
  results,
  schema: 'toonlab/rock-canonical-pilot-verification',
  version: 1,
};
await writeJson(path.join(options.outputDirectory, 'canonical-pilot-report.json'), report);
console.log(JSON.stringify({ counts: report.counts, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
