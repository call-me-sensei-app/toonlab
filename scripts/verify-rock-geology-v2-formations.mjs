#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { contentId } from '../src/rockgen/experimental/geology-v2/canonical.node.js';
import { compileC9Formation } from '../src/rockgen/experimental/geology-v2/formation/compiler.node.js';
import { createC9FormationFixtures, listC9FormationDefinitions } from '../src/rockgen/experimental/geology-v2/formation/fixtures.node.js';
import { extractManifoldDualContouring } from '../src/rockgen/experimental/geology-v2/meshing/manifoldDualContouring.node.js';
import { sampleScalarField } from '../src/rockgen/experimental/geology-v2/meshing/scalarGrid.node.js';
import { auditMeshTopology } from '../src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js';
import { meshToObj } from '../src/rockgen/experimental/geology-v2/process/meshing.node.js';

const outputDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-09-formations');
const meshResolution = Number(process.env.TOONLAB_C9_MESH_RESOLUTION ?? 48);
const references = Object.freeze({
  'steep-stratified-ridge': 'checkpoint-08-basis-families/morphology/reference-final/forms/ridge-stratified',
  'folded-ridge': 'checkpoint-08-basis-families/morphology/reference-final/forms/ridge-folded',
  'fault-scarp': 'checkpoint-08-basis-families/morphology/reference-final/cliffs/fault-scarp',
  'shattered-alpine-ridge': 'checkpoint-08-basis-families/morphology/reference-final/forms/ridge-shattered-alpine',
  'exfoliation-massif': 'checkpoint-08-basis-families/morphology/reference-final/forms/massif-exfoliation',
  'volcanic-massif': 'checkpoint-08-basis-families/morphology/reference-final/forms/massif-volcanic',
  'karst-tower-field': 'checkpoint-08-basis-families/morphology/reference-final/forms/karst-tower-field',
});

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function compactTopology(audit) {
  return {
    boundaryEdges: audit.boundaryEdges,
    components: audit.components,
    degenerateTriangles: audit.degenerateTriangles,
    duplicateTriangles: audit.duplicateTriangles,
    nonManifoldEdges: audit.nonManifoldEdges,
    topologyFailures: audit.topologyFailures,
    triangles: audit.triangles,
    vertices: audit.vertices,
    windingEdges: audit.windingEdges,
  };
}

function graphSvg(compiled) {
  const { formationProgram: program } = compiled;
  const width = 1120;
  const height = 590;
  const margin = 58;
  const cellWidth = (width - margin * 2) / program.grid.countX;
  const cellHeight = (height - margin * 2) / program.grid.countZ;
  const colors = { slab: '#667e79', wedge: '#927f66', ledge: '#7d8e63', crown: '#ad8c57', pillar: '#6c7f9a', buttress: '#8f6e72', talus: '#8b7761' };
  const cells = program.modules.map((module) => {
    const x = margin + module.coordinate.x * cellWidth;
    const z = margin + (program.grid.countZ - module.coordinate.z - 1) * cellHeight;
    return `<g><rect x="${x}" y="${z}" width="${cellWidth}" height="${cellHeight}" fill="${colors[module.role]}" stroke="#cbd5d0" stroke-width="1.4"/><text x="${x + 7}" y="${z + 17}" fill="#f5f7f4" font-size="11" font-family="ui-monospace,monospace">${module.coordinate.x},${module.coordinate.z} · ${module.role}</text><text x="${x + 7}" y="${z + cellHeight - 8}" fill="#dbe5df" font-size="9" font-family="ui-monospace,monospace">overlap ${module.overlapMetres}m</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#121817"/><text x="${margin}" y="31" fill="#eff5f1" font-size="18" font-family="system-ui,sans-serif" font-weight="700">${escapeXml(program.fixtureId)} · deterministic module graph</text><text x="${width - margin}" y="31" text-anchor="end" fill="#9fb0a8" font-size="11" font-family="ui-monospace,monospace">green seam gate · max Δ 0m</text>${cells}</svg>`;
}

function sliceSvg(compiled) {
  const width = 1120;
  const height = 560;
  const margin = 66;
  const bounds = compiled.formationProgram.formationBounds;
  const horizontal = [];
  const transverse = [];
  for (let index = 0; index <= 320; index += 1) {
    const t = index / 320;
    const x = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * t;
    const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * t;
    horizontal.push([t, compiled.field.surfaceHeight([x, 0, (bounds.min[2] + bounds.max[2]) * 0.5])]);
    transverse.push([t, compiled.field.surfaceHeight([(bounds.min[0] + bounds.max[0]) * 0.5, 0, z])]);
  }
  const yMin = bounds.min[1];
  const yMax = bounds.max[1];
  const points = (values) => values.map(([t, y]) => `${round(margin + t * (width - margin * 2), 2)},${round(height - margin - (y - yMin) / (yMax - yMin) * (height - margin * 2), 2)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#121817"/><path d="M${margin},${height - margin}H${width - margin}M${margin},${margin}V${height - margin}" stroke="#5a6863"/><polyline points="${points(horizontal)}" fill="none" stroke="#e9b86b" stroke-width="3"/><polyline points="${points(transverse)}" fill="none" stroke="#72b8a2" stroke-width="3"/><text x="${margin}" y="31" fill="#eef4f0" font-size="18" font-family="system-ui,sans-serif" font-weight="700">${escapeXml(compiled.formationProgram.fixtureId)} · parent-field profiles</text><text x="${margin}" y="51" fill="#e9b86b" font-size="11" font-family="ui-monospace,monospace">along strike</text><text x="${margin + 112}" y="51" fill="#72b8a2" font-size="11" font-family="ui-monospace,monospace">across strike</text><text x="${width - margin}" y="51" text-anchor="end" fill="#9fb0a8" font-size="11" font-family="ui-monospace,monospace">world-space phase · one parent volume</text></svg>`;
}

await mkdir(outputDirectory, { recursive: true });
for (const child of ['graphs', 'meshes', 'programs', 'reports', 'slices']) await mkdir(path.join(outputDirectory, child), { recursive: true });

const predeclared = {
  checkpoint: 9,
  boundary: {
    included: 'repository-only continuous formation domain, chunk graph, crops, seams, lineage, deterministic streaming, neutral clay evidence',
    excluded: 'public package API, final UE 5.8 runtime budget, stylization, provider-generated mountain meshes, and user visual approval',
  },
  budgets: {
    compileMillisecondsPerTarget: 250,
    fieldMicrosecondsPerSample: 250,
    maximumModulesPerFormation: 64,
    moduleRangeMetres: [10, 200],
  },
  meshResolution,
  requiredRoles: ['slab', 'wedge', 'ledge', 'crown', 'pillar', 'buttress', 'talus'],
  targets: listC9FormationDefinitions().map((entry) => entry.id),
  views: ['top-down', 'flyover', 'base-of-cliff', 'silhouette', 'gameplay'],
};
await writeFile(path.join(outputDirectory, 'predeclared-gates.json'), `${JSON.stringify(predeclared, null, 2)}\n`);

const fixtures = createC9FormationFixtures();
const failures = [];
const results = [];
for (const [id, fixture] of Object.entries(fixtures)) {
  const compileStart = performance.now();
  const compiled = compileC9Formation(fixture);
  const compileMilliseconds = performance.now() - compileStart;
  const repeated = compileC9Formation(fixture);
  const deterministic = compiled.formationProgram.programContentId === repeated.formationProgram.programContentId
    && contentId(compiled.report) === contentId(repeated.report);

  const sampleStart = performance.now();
  let sampleAccumulator = 0;
  const sampleCount = 4096;
  const bounds = compiled.formationProgram.formationBounds;
  for (let index = 0; index < sampleCount; index += 1) {
    const x = bounds.min[0] + (bounds.max[0] - bounds.min[0]) * ((index * 3571 % sampleCount) / (sampleCount - 1));
    const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * ((index * 2377 % sampleCount) / (sampleCount - 1));
    const y = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * ((index * 1877 % sampleCount) / (sampleCount - 1));
    sampleAccumulator += compiled.field.evaluate(x, y, z);
  }
  const fieldMicrosecondsPerSample = (performance.now() - sampleStart) * 1000 / sampleCount;

  const padding = Math.max(1.5, compiled.formationProgram.overlapMetres * 0.45);
  const wholeCropBounds = {
    min: bounds.min.map((value) => value - padding),
    max: bounds.max.map((value) => value + padding),
  };
  const samplingBounds = {
    min: wholeCropBounds.min.map((value) => value - padding),
    max: wholeCropBounds.max.map((value) => value + padding),
  };
  const wholeField = compiled.field.createModuleField({ id: `${id}/whole-formation-audit`, cropBounds: wholeCropBounds });
  const grid = sampleScalarField({ bounds: samplingBounds, evaluate: wholeField.evaluate, resolution: meshResolution, sourceId: `c9/${id}` });
  const mesh = extractManifoldDualContouring(grid, { evaluate: wholeField.evaluate });
  const topology = auditMeshTopology(mesh, { evaluate: wholeField.evaluate, grid, includeSelfIntersections: false });
  const compact = compactTopology(topology);
  const topologyPassed = compact.topologyFailures === 0 && compact.components === 1;
  const budgetPassed = compileMilliseconds <= predeclared.budgets.compileMillisecondsPerTarget
    && fieldMicrosecondsPerSample <= predeclared.budgets.fieldMicrosecondsPerSample
    && compiled.report.moduleCount <= predeclared.budgets.maximumModulesPerFormation;
  const passed = compiled.report.passed && deterministic && topologyPassed && budgetPassed && Number.isFinite(sampleAccumulator);
  const result = {
    budgetPassed,
    compileMilliseconds: round(compileMilliseconds),
    deterministic,
    fieldMicrosecondsPerSample: round(fieldMicrosecondsPerSample),
    fixtureId: id,
    meshFile: `meshes/${id}.obj`,
    moduleCount: compiled.report.moduleCount,
    passed,
    programContentId: compiled.formationProgram.programContentId,
    referencePackage: references[id],
    reportFile: `reports/${id}.json`,
    roleCoverage: compiled.report.roleCoverage,
    seamCount: compiled.report.seamCount,
    topology: compact,
    uniqueCropSignatures: compiled.report.uniqueCropSignatures,
  };
  if (!passed) failures.push(result);
  results.push(result);
  await Promise.all([
    writeFile(path.join(outputDirectory, 'meshes', `${id}.obj`), meshToObj(mesh, { name: `c9-${id}` })),
    writeFile(path.join(outputDirectory, 'programs', `${id}.json`), `${JSON.stringify({ fixture, formationProgram: compiled.formationProgram, structuralProgram: compiled.structuralProgram }, null, 2)}\n`),
    writeFile(path.join(outputDirectory, 'reports', `${id}.json`), `${JSON.stringify({ ...compiled.report, budgetPassed, compileMilliseconds: round(compileMilliseconds), deterministic, fieldMicrosecondsPerSample: round(fieldMicrosecondsPerSample), topology: compact }, null, 2)}\n`),
    writeFile(path.join(outputDirectory, 'graphs', `${id}.svg`), graphSvg(compiled)),
    writeFile(path.join(outputDirectory, 'slices', `${id}.svg`), sliceSvg(compiled)),
  ]);
}

const summary = {
  checkpoint: 9,
  failed: failures.length,
  failures,
  passed: failures.length === 0,
  resultContentId: contentId(results),
  results,
  visualGate: {
    approved: false,
    reason: 'Technical generation cannot approve top-down/flyover/base/silhouette/gameplay views; captures and developer review are separate.',
  },
};
await writeFile(path.join(outputDirectory, 'verification.json'), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(path.join(outputDirectory, 'output-index.json'), `${JSON.stringify(results, null, 2)}\n`);
await writeFile(path.join(outputDirectory, 'README.md'), `# Checkpoint 9 — formation proof\n\nThis directory is generated by \`node scripts/verify-rock-geology-v2-formations.mjs\`.\n\nThe technical result is **${summary.passed ? 'PASS' : 'FAIL'}** across ${results.length} formation targets. The meshes are neutral, low-resolution audit meshes from one continuous parent field; they are not provider assets and not a public API. Visual approval and UE 5.8 runtime budgets remain fail-closed until their dedicated evidence is reviewed.\n`);

console.log(JSON.stringify({ failed: failures.length, outputDirectory, passed: summary.passed, targets: results.length }, null, 2));
if (!summary.passed) process.exitCode = 1;
