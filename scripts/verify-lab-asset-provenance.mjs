import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPLETE_LABS_SHOWCASE } from '../labs/home/labsShowcase.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const forbiddenProductionReference = /(?:shared\/p18|\.local-reference|assets-local\/(?:reference-materials|rock-references|rock-reference-variations))/i;
const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.ts`, `${base}.tsx`]) {
    if (sourceExtensions.has(extname(candidate)) && await exists(candidate)) return candidate;
  }
  return null;
}

async function assertCleanDependencyGraph(entryFile, labId) {
  const pending = [entryFile];
  const visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      `${file}\n${source}`,
      forbiddenProductionReference,
      `${labId} is Beta but still reaches a quarantined third-party/reference preview dependency via ${file}.`,
    );
    for (const match of source.matchAll(importPattern)) {
      const dependency = await resolveImport(file, match[1]);
      if (dependency && dependency.startsWith(root)) pending.push(dependency);
    }
  }
}

for (const lab of COMPLETE_LABS_SHOWCASE) {
  const pathname = new URL(lab.href, 'https://toonlab.invalid').pathname;
  const htmlPath = resolve(root, `.${pathname}`, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  assert.doesNotMatch(html, forbiddenProductionReference, `${lab.id} route contains a forbidden reference.`);
  const scriptSource = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)?.[1];
  assert.ok(scriptSource, `${lab.id} needs a module entry script.`);
  const entryFile = scriptSource.startsWith('/')
    ? resolve(root, `.${scriptSource}`)
    : resolve(dirname(htmlPath), scriptSource);
  await assertCleanDependencyGraph(entryFile, lab.id);
}

const rockCatalogSource = await readFile(
  resolve(root, 'labs/rock-generation-lab/ui/catalog.js'),
  'utf8',
);
assert.match(rockCatalogSource, /const pageSize = 500;/);
assert.ok(rockCatalogSource.includes('/api/toonlab/catalog?kind=model&source=toonlab-rock&limit=${pageSize}'));
assert.ok(rockCatalogSource.includes('&offset=${items.length}'), 'Catalog traversal must retain pagination');
assert.match(rockCatalogSource, /\/api\/v1\/rock-catalog/);
assert.match(rockCatalogSource, /sourceMode: 'official-glb'/);
assert.doesNotMatch(rockCatalogSource, /catalogInventory\.generated|toonlab-procedural-glb|generated-glb/);
assert.doesNotMatch(rockCatalogSource, /assets\.toonlab\.io\/official\/2026-08\/rock-/i);

const requiredProductionInputs = [
  'treeShaderLab',
  'grassShaderLab',
  'flowerShaderLab',
  'rockShaderLab',
  'groundShaderLab',
  'transparentShaderLab',
  'rockGenerationLab',
  'skyAtmosphereSourceLab',
];
const forbiddenReferenceInputs = [
  'rockCatalogPreview',
  'grassClumpParity',
  'sourceCatalog',
  'senseiSkyLab',
];
const viteConfig = await readFile(resolve(root, 'vite.config.js'), 'utf8');
for (const inputName of requiredProductionInputs) {
  assert.match(
    viteConfig,
    new RegExp(`\\b${inputName}\\s*:`),
    `${inputName} must ship as a first-party production entry point.`,
  );
}
for (const inputName of forbiddenReferenceInputs) {
  assert.doesNotMatch(
    viteConfig,
    new RegExp(`\\b${inputName}\\s*:`),
    `${inputName} must remain a local-only reference entry point.`,
  );
}

const packageFiles = ['package.json', 'package-lock.json'];
for (const relativePath of packageFiles) {
  const path = resolve(root, relativePath);
  if (!await exists(path)) continue;
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, forbiddenProductionReference);
}

console.log(
  `${COMPLETE_LABS_SHOWCASE.length} Beta lab dependency graphs and `
  + `${requiredProductionInputs.length} migrated production inputs are first-party clean; `
  + 'the Rock Lab consumes the same versioned first-party GLBs as the Gallery.',
);
