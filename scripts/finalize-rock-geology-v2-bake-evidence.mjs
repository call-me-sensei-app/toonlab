#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const directory = path.resolve(
  process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler',
);

async function listFiles(root, relative = '') {
  const result = [];
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, child));
    else if (entry.isFile() && child !== 'manifest.json' && !entry.name.startsWith('.')) result.push(child);
  }
  return result;
}

function git(...arguments_) {
  return execFileSync('git', arguments_, { cwd: process.cwd(), encoding: 'utf8' }).trim();
}

const automated = JSON.parse(await readFile(path.join(directory, 'automated-results.json'), 'utf8'));
const captures = JSON.parse(await readFile(path.join(directory, 'capture-results.json'), 'utf8'));
const visual = JSON.parse(await readFile(path.join(directory, 'visual-audit.json'), 'utf8'));
const approval = await readFile(path.join(directory, 'approval.md'), 'utf8');
if (!automated.passed || automated.counts.checks !== 44 || automated.counts.failures !== 0) {
  throw new Error('Cannot finalize C7 without all 44 automated checks passing.');
}
if (!captures.passed || captures.captureCount !== 6) throw new Error('Cannot finalize C7 without all six required captures.');
if (!visual.passed) throw new Error('Cannot finalize C7 without the corrected visual audit.');
if (automated.compilerReport.bake.hitRate !== 1 || automated.compilerReport.bake.projectionConflicts !== 0) {
  throw new Error('C7 requires 100% high-source hits and zero projection conflicts.');
}
if (automated.compilerReport.policy.atlas.selectedResolution !== automated.compilerReport.policy.atlas.requestedResolution) {
  throw new Error('C7 final evidence must use the scale-selected atlas resolution.');
}
if (!automated.compilerReport.policy.texelDensity.passesMinimum) throw new Error('C7 texel-density gate is red.');
if (!automated.determinism.deterministic) throw new Error('C7 repeated production hashes differ.');
for (const required of ['captures/contact-sheet.png', 'captures/outliers.png', 'captures/manifest.json']) {
  await readFile(path.join(directory, required));
}

const files = [];
for (const relativePath of await listFiles(directory)) {
  const bytes = await readFile(path.join(directory, relativePath));
  files.push({
    bytes: bytes.length,
    path: relativePath.replaceAll(path.sep, '/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const statusLines = git('status', '--porcelain=v1').split('\n').filter(Boolean);
const approved = /> \*\*State:\*\* approved/i.test(approval);
const report = automated.compilerReport;
const manifest = {
  algorithm: 'sha256',
  automatedGatePassed: true,
  bakeContract: {
    atlasResolution: report.policy.atlas.selectedResolution,
    channelPages: automated.counts.texturePages,
    compilerSchema: report.compiler.schema,
    compilerVersion: report.compiler.version,
    coveredTexels: report.bake.coveredTexels,
    dilationPasses: report.bake.dilationPasses,
    maximumQualifiedMipLevel: report.bake.maximumQualifiedMipLevel,
    normalConvention: '+Y/OpenGL tangent-space; Unreal import conversion deferred C12',
    outputBundleSha256: automated.determinism.firstSignature,
    outputContentId: report.contentId,
    units: 'SI metres',
  },
  captureGatePassed: true,
  checkpoint: 7,
  commands: (await readFile(path.join(directory, 'commands.txt'), 'utf8')).trim().split('\n'),
  createdAtUtc: new Date().toISOString(),
  environment: {
    architecture: os.arch(),
    node: process.version,
    platform: os.platform(),
    release: os.release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  files,
  geometryContract: {
    assets: report.audits.map((audit) => ({
      hausdorffMetres: audit.hausdorff.maximum,
      role: audit.role,
      selfIntersectionPairs: audit.topology.selfIntersectionPairs,
      silhouettePixels: audit.silhouette.maximumBoundaryErrorPixels,
      topologyFailures: audit.topology.topologyFailures,
      triangles: audit.topology.triangles,
      vertices: audit.topology.vertices,
    })),
    mesher: 'ToonLab Manifold Dual Contouring',
  },
  recipe: {
    id: report.recipeId,
    lithology: 'granodiorite',
    minimumViewDistanceMetres: report.policy.minimumViewDistanceMetres,
    qualityTier: report.policy.qualityTier,
    seed: 6287,
    targetDimensionsMetres: report.policy.targetDimensionsMetres,
  },
  repository: {
    commit: git('rev-parse', 'HEAD'),
    dirtyPathCount: statusLines.length,
    preservationNote: 'Unrelated pre-existing changes were not reverted or rewritten.',
    publicPackageExportAdded: false,
    worktreeDirty: statusLines.length > 0,
  },
  state: approved ? 'approved' : 'candidate-awaiting-developer-approval',
  verification: {
    achievedPixelsPerMetre: report.policy.texelDensity.achievedPixelsPerMetre,
    automatedChecks: automated.counts.checks,
    captures: captures.captureCount,
    highSourceHitRate: report.bake.hitRate,
    projectionConflicts: report.bake.projectionConflicts,
    repeatedHashesIdentical: automated.determinism.deterministic,
    requiredPixelsPerMetre: report.policy.texelDensity.desiredPixelsPerMetre,
    visualGatePassed: visual.passed,
  },
};
await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  automatedGatePassed: manifest.automatedGatePassed,
  captureGatePassed: manifest.captureGatePassed,
  checkpoint: manifest.checkpoint,
  evidenceFiles: files.length,
  state: manifest.state,
  totalEvidenceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
}, null, 2));
