import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scriptsRoot = dirname(new URL(import.meta.url).pathname);
const repositoryRoot = dirname(scriptsRoot);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const typesRoot = join(repositoryRoot, 'types');

const publicEntries = Object.entries(packageJson.exports)
  .filter(([entry]) => !entry.includes('*'))
  .map(([entry, definition]) => {
    const runtimePath = typeof definition === 'string' ? definition : definition.default;
    const typePath = typeof definition === 'string' ? null : definition.types;
    assert.ok(runtimePath && typePath, `${entry} needs runtime and type export conditions.`);
    assert.match(runtimePath, /^\.\/src\/.+\.js$/u, `${entry} must point at package JavaScript.`);
    return { entry, runtimePath, typePath };
  });

await rm(typesRoot, { force: true, recursive: true });

const tsc = join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const declarationBuild = spawnSync(process.execPath, [
  tsc,
  '--allowJs',
  '--declaration',
  '--emitDeclarationOnly',
  '--skipLibCheck',
  '--module', 'ESNext',
  '--moduleResolution', 'Bundler',
  '--target', 'ES2022',
  '--rootDir', 'src',
  '--outDir', 'types',
  '--pretty', 'false',
  ...publicEntries.map(({ runtimePath }) => runtimePath.slice(2)),
], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
assert.equal(
  declarationBuild.status,
  0,
  declarationBuild.stderr || declarationBuild.stdout || 'TypeScript declaration generation failed.',
);

const overrides = [
  'catalog/officialCatalogPlacement.d.ts',
  'catalog/officialCatalogLod.d.ts',
  'catalog/officialCatalogRockPackage.d.ts',
  'runtime/sceneSurfaceRuntime.d.ts',
  'styles/styleAdapters.d.ts',
  'styles/styleApplication.d.ts',
  'styles/styleInspector.d.ts',
  'styles/styleBundleProvider.d.ts',
  'styles/styleTargetLabels.d.ts',
  'styles/styleTypes.d.ts',
  'runtime/sceneCollisionRuntime.d.ts',
  'vegetation/treeSurfaceTextures.d.ts',
  'rock-shader/rockRegionRuntime.d.ts',
  'rockgen/surface/naturalRockSurface.d.ts',
];
const overrideSet = new Set(overrides);
await Promise.all(overrides.map(async (path) => {
  const destination = join(typesRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(repositoryRoot, 'type-overrides', path), destination);
}));

function permissiveDeclaration(name, value) {
  if (typeof value === 'function') {
    const source = Function.prototype.toString.call(value);
    if (/^class\s/u.test(source)) {
      return `export class ${name} { constructor(...args: any[]); [key: string]: any; }`;
    }
    return `export function ${name}(...args: any[]): any;`;
  }
  return `export const ${name}: any;`;
}

async function replaceInvalidInference(relativeTypePath) {
  if (overrideSet.has(relativeTypePath)) {
    throw new Error(`Exact declaration override ${relativeTypePath} does not pass strict checking.`);
  }
  const runtimePath = `./src/${relativeTypePath.replace(/\.d\.ts$/u, '.js')}`;
  const runtimeFile = join(repositoryRoot, runtimePath);
  await access(runtimeFile).catch(() => {
    throw new Error(`Cannot map invalid inferred declaration ${relativeTypePath} to package source.`);
  });
  const runtime = await import(pathToFileURL(runtimeFile).href);
  const declarations = ['// Source inference fallback: public names retained with permissive signatures.'];
  for (const name of Object.keys(runtime).sort()) {
    if (name === 'default') continue;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name)) {
      declarations.push(permissiveDeclaration(name, runtime[name]));
    }
  }
  if (Object.hasOwn(runtime, 'default')) {
    declarations.push('declare const defaultExport: any;', 'export default defaultExport;');
  }
  declarations.push('');
  await writeFile(join(typesRoot, relativeTypePath), declarations.join('\n'));
}

const fallbackDeclarations = new Set();
for (let attempt = 0; attempt < 8; attempt += 1) {
  const declarationCheck = spawnSync(process.execPath, [
    tsc,
    '--noEmit',
    '--strict',
    '--skipLibCheck', 'false',
    '--module', 'ESNext',
    '--moduleResolution', 'Bundler',
    '--target', 'ES2022',
    '--pretty', 'false',
    ...publicEntries.map(({ typePath }) => typePath.slice(2)),
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (declarationCheck.status === 0) break;
  const diagnostics = `${declarationCheck.stdout}\n${declarationCheck.stderr}`;
  const invalid = new Set();
  for (const match of diagnostics.matchAll(/(?:^|\n)types\/([^\n(]+\.d\.ts)\(\d+,\d+\): error/gmu)) {
    invalid.add(match[1]);
  }
  if (invalid.size === 0) throw new Error(diagnostics.trim());
  await Promise.all([...invalid].map(async (path) => {
    fallbackDeclarations.add(path);
    await replaceInvalidInference(path);
  }));
  if (attempt === 7) throw new Error(`Declarations remain invalid after fallbacks:\n${diagnostics}`);
}

for (const { entry, typePath } of publicEntries) {
  const declaration = join(repositoryRoot, typePath);
  await readFile(declaration, 'utf8').catch(() => {
    throw new Error(`${entry} did not generate its declared type target ${typePath}.`);
  });
}

async function declarationCount(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += await declarationCount(path);
    else if (entry.name.endsWith('.d.ts')) count += 1;
  }
  return count;
}

let publicSymbolCount = 0;
for (const { runtimePath } of publicEntries) {
  const runtime = await import(pathToFileURL(join(repositoryRoot, runtimePath)).href);
  publicSymbolCount += Object.keys(runtime).length;
}
const generatedDeclarationCount = await declarationCount(typesRoot);
console.log(
  `Generated ${generatedDeclarationCount} source-inferred declarations for ` +
  `${publicEntries.length} entry points and ${publicSymbolCount} public runtime symbols; ` +
  `${fallbackDeclarations.size} modules required permissive inference fallbacks.`,
);
