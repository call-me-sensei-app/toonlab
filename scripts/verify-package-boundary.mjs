import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { publicMcpCatalogEntries } from '../mcp/public-catalog.mjs';

const root = new URL('..', import.meta.url);
const rootPath = fileURLToPath(root);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const mcpServerSource = await readFile(new URL('../mcp/server.mjs', import.meta.url), 'utf8');
assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'package version must be semver');
assert.match(packageJson.description, /anime-style game/i);
assert.equal(packageJson.exports['./asset-policy']?.default, './src/asset-policy/index.js');
assert.equal(packageJson.exports['./asset-policy']?.types, './types/asset-policy/index.d.ts');
assert.equal(
  packageJson.publishConfig?.access,
  'public',
  'the scoped OSS package must default to public npm access',
);
assert.deepEqual(
  packageJson.bin,
  {
    toonlab: 'cli/toonlab.mjs',
    'toonlab-mcp': 'mcp/server.mjs',
  },
  'npm must preserve both executable command mappings without auto-correction',
);

const forbiddenRoots = ['assets-local', 'docs', 'examples', 'labs', 'public'];
for (const entry of packageJson.files) {
  assert.equal(
    forbiddenRoots.some((rootName) => entry === rootName || entry.startsWith(`${rootName}/`)),
    false,
    `npm files whitelist must not include repository-only ${entry}`,
  );
}
assert.ok(
  packageJson.files.includes('src/index.js') && packageJson.files.includes('src/version.js'),
  'npm package must include the public runtime roots',
);
assert.ok(
  packageJson.files.includes('agents/references/runtime-entry-points.md'),
  'npm package must include the public runtime reference',
);
assert.equal(packageJson.dependencies.pg, '^8.22.0', 'the packaged MCP/database runtime must install pg');
assert.equal(
  packageJson.dependencies['3d-tiles-renderer'],
  '^0.5.0',
  'the public assetlib barrel must install its eagerly imported PLATEAU renderer',
);
assert.equal(
  packageJson.peerDependencies?.['3d-tiles-renderer'],
  undefined,
  'an eagerly imported public assetlib dependency cannot be an optional peer',
);
assert.doesNotMatch(
  mcpServerSource,
  /from ['"]\.\.\/src\/assetlib\/index\.js['"]/,
  'The packaged MCP must import pure asset clients directly so optional renderer peers are not loaded at startup.',
);
assert.deepEqual(
  publicMcpCatalogEntries().filter((entry) => (
    entry.cluster === 'vegetation' || String(entry.id).startsWith('tree/')
  )),
  [],
  'packaged MCP catalog must not contain authored tree recipes',
);

const preBetaRuntimeRoots = [
  'ambientfx',
  'atmospheric-condition',
  'biome',
  'buildinggen',
  'camera',
  'climate',
  'debrisgen',
  'debug',
  'fauna',
  'game-feel',
  'landscape',
  'motion',
  'pathgen',
  'propgen',
  'soundscape',
  'vfxgen',
  'villagegen',
  'weather',
];
const experimentalTreeRuntimePaths = new Set([
  'src/vegetation/legacyTreePresets.js',
  'src/vegetation/stylizedTreeExamples.js',
  'src/vegetation/plantGraph.js',
  'src/vegetation/proceduralSpeciesTree.js',
  'src/vegetation/recursiveWoodyGrowth.js',
  'src/vegetation/recursiveWoodyMesh.js',
  'src/vegetation/treeArchitectureProfiles.js',
  'src/vegetation/treeLodCompiler.js',
  'src/vegetation/treeRecipe.js',
  'src/vegetation/treeRecipePresets.js',
  'src/vegetation/treeSpeciesProfiles.js',
  'src/vegetation/treeSpeciesResearch.generated.js',
  'src/vegetation/treeSpeciesRoster.js',
  'src/vegetation/treeSpeciesTaxonomy.generated.js',
  'src/vegetation/woodyBaselineControls.js',
]);
function stringTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringTargets);
}

const packageExportTargets = stringTargets(packageJson.exports);
const packageImportTargets = stringTargets(packageJson.imports ?? {});
const packageRuntimeTargets = [...packageExportTargets, ...packageImportTargets];
for (const runtimeRoot of preBetaRuntimeRoots) {
  assert.equal(
    packageRuntimeTargets.some((target) => target.startsWith(`./src/${runtimeRoot}/`)),
    false,
    `pre-beta ${runtimeRoot} must not have an npm export`,
  );
}

function normalizeLocalPath(path) {
  return path.split(sep).join('/');
}

function resolveRuntimeDependency(importerPath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const isBundlerAssetUrl = /[?&]url(?:[&#]|$)/.test(specifier);
  const cleanSpecifier = specifier.replace(/[?#].*$/, '');
  const unresolved = resolve(rootPath, dirname(importerPath), cleanSpecifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.json`,
    join(unresolved, 'index.js'),
  ];
  const absolutePath = candidates.find((candidate) => existsSync(candidate));
  if (!absolutePath) {
    throw new Error(`Unable to resolve ${specifier} imported by ${importerPath}.`);
  }
  const localPath = normalizeLocalPath(relative(rootPath, absolutePath));
  assert.ok(
    localPath.startsWith('src/'),
    `published runtime ${importerPath} reaches repository-only ${localPath}`,
  );
  // `?url` imports are verified for existence above and against the exact
  // approved package-asset allowlist below; they are not JavaScript runtime
  // modules and therefore do not belong in the module-closure graph.
  if (isBundlerAssetUrl) return null;
  return localPath;
}

function importedSpecifiers(source) {
  const specifiers = new Set();
  const staticPattern =
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

async function collectPublishedRuntimeClosure() {
  const entries = new Set(
    packageRuntimeTargets
      .filter((target) => target.startsWith('./src/'))
      .map((target) => target.slice(2)),
  );
  for (const target of [packageJson.main, packageJson.module]) {
    if (typeof target === 'string' && target.startsWith('./src/')) {
      entries.add(target.slice(2));
    }
  }

  const pending = [...entries];
  const closure = new Set();
  while (pending.length > 0) {
    const path = pending.pop();
    if (closure.has(path)) continue;
    closure.add(path);
    if (!path.endsWith('.js')) continue;
    const source = await readFile(resolve(rootPath, path), 'utf8');
    for (const specifier of importedSpecifiers(source)) {
      const dependency = resolveRuntimeDependency(path, specifier);
      if (dependency && !closure.has(dependency)) pending.push(dependency);
    }
  }
  return closure;
}

const runtimeClosure = await collectPublishedRuntimeClosure();
for (const runtimeRoot of preBetaRuntimeRoots) {
  const leakedPaths = [...runtimeClosure].filter(
    (path) => path.startsWith(`src/${runtimeRoot}/`),
  );
  assert.deepEqual(
    leakedPaths,
    [],
    `published entry points transitively reach pre-beta ${runtimeRoot}`,
  );
}
for (const path of runtimeClosure) {
  if (!path.endsWith('.js')) continue;
  const source = await readFile(resolve(rootPath, path), 'utf8');
  assert.equal(
    source.includes('/assets-local/'),
    false,
    `published runtime ${path} contains a repository-local asset URL`,
  );
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-package-boundary-'));
try {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
    },
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const report = JSON.parse(result.stdout)[0];
  const paths = report.files.map((file) => file.path);
  const packedRuntimePaths = paths.filter(
    (path) => path.startsWith('src/') && /\.(?:js|json)$/i.test(path),
  );
  const packedRuntimePathSet = new Set(packedRuntimePaths);
  for (const repositoryOnlyPath of [
    'src/rockgen/node.js',
    'src/rockgen/rockRegionGlbCompiler.node.js',
    'types/rockgen/node.d.ts',
    'types/rockgen/rockRegionGlbCompiler.node.d.ts',
    'cli/rockRegions.mjs',
  ]) {
    assert.equal(
      paths.includes(repositoryOnlyPath),
      false,
      `npm tarball must not publish repository-only ${repositoryOnlyPath}`,
    );
  }
  assert.deepEqual(
    paths.filter((path) => experimentalTreeRuntimePaths.has(path)),
    [],
    'npm tarball must not publish the experimental species/taxonomy tree engine',
  );
  assert.deepEqual(
    paths.filter((path) => /(?:legacyTreePresets|stylizedTreeExamples)/.test(path)),
    [],
    'npm tarball must not contain repository-only predefined tree recipes',
  );
  const redistributedAssetPattern =
    /\.(?:7z|aiff?|bin|blend|bmp|dae|dll|dylib|eot|exr|fbx|gif|glb|gltf|hdr|ico|jpe?g|ktx2|mp3|mp4|obj|ogg|otf|pdf|png|so|stl|svg|tiff?|ttf|usdz|wasm|wav|webm|webp|woff2?|zip)$/i;
  const applicationArtifactPattern = /\.(?:css|html|jsx|tsx)$/i;
  const allowedTextFilePattern = /(?:^LICENSE$|\.(?:d\.ts|js|json|md|mdc|mjs|sql|txt|ya?ml)$)/i;
  const internalReferencePattern = /(?:p18|reference-materials)/i;
  const privateCdnPattern = /https?:\/\/private-cdn\.toonlab\.io/i;

  assert.deepEqual(report.bundled ?? [], [], 'npm tarball must not bundle dependencies');

  for (const path of paths) {
    assert.match(path, allowedTextFilePattern, `npm tarball contains a non-text/code file ${path}`);
    assert.equal(path.includes('node_modules/'), false, `npm tarball bundles a dependency: ${path}`);
    assert.equal(
      internalReferencePattern.test(path),
      false,
      `npm tarball path exposes an internal reference: ${path}`,
    );
    assert.equal(
      forbiddenRoots.some((rootName) => path === rootName || path.startsWith(`${rootName}/`)),
      false,
      `npm tarball contains repository-only path ${path}`,
    );
    assert.equal(
      redistributedAssetPattern.test(path),
      false,
      `npm tarball contains a redistributed binary/media asset ${path}`,
    );
    assert.equal(
      applicationArtifactPattern.test(path),
      false,
      `npm tarball contains application UI artifact ${path}`,
    );
    if (path.startsWith('src/')) {
      assert.match(
        path,
        /\.(?:js|json)$/i,
        `npm runtime source contains non-code file ${path}`,
      );
    }
    if (/\.(?:d\.ts|js|json|md|mdc|mjs|sql|txt|ya?ml)$/i.test(path)) {
      const source = await readFile(resolve(rootPath, path), 'utf8');
      assert.equal(
        internalReferencePattern.test(source),
        false,
        `npm tarball file ${path} exposes an internal reference`,
      );
      assert.equal(
        privateCdnPattern.test(source),
        false,
        `npm tarball file ${path} points to the private CDN`,
      );
      if (path.startsWith('agents/') && path.endsWith('.md')) {
        assert.doesNotMatch(
          source,
          /(?:^|[\s`(])docs\//m,
          `packaged agent resource ${path} points to unpackaged repository docs`,
        );
      }
    }
  }
  assert.deepEqual(
    paths.filter((path) => redistributedAssetPattern.test(path)),
    [],
    'npm tarball must remain free of redistributed binary/media assets',
  );

  for (const path of packedRuntimePaths) {
    if (!path.endsWith('.js')) continue;
    const source = await readFile(resolve(rootPath, path), 'utf8');
    for (const specifier of importedSpecifiers(source)) {
      const dependency = resolveRuntimeDependency(path, specifier);
      assert.ok(
        dependency === null || packedRuntimePathSet.has(dependency),
        `packed runtime ${path} imports unpacked dependency ${dependency}`,
      );
    }
  }

  const missingRuntimePaths = [...runtimeClosure]
    .filter((path) => !packedRuntimePaths.includes(path))
    .sort();
  const unreachableRuntimePaths = packedRuntimePaths
    .filter((path) => !runtimeClosure.has(path))
    .sort();
  assert.deepEqual(
    missingRuntimePaths,
    [],
    `npm tarball is missing public runtime dependencies:\n${missingRuntimePaths.join('\n')}`,
  );
  assert.deepEqual(
    unreachableRuntimePaths,
    [],
    `npm tarball contains source outside the public runtime closure:\n`
      + unreachableRuntimePaths.join('\n'),
  );

  const skillPaths = paths.filter((path) => path.endsWith('/SKILL.md'));
  assert.ok(
    skillPaths.includes('agents/skills/codex/game-dev/SKILL.md'),
    'npm tarball must include the Codex game-development skill',
  );
  assert.ok(
    skillPaths.includes('agents/skills/claude/game-dev/SKILL.md'),
    'npm tarball must include the Claude game-development skill',
  );
  const expectedSkillNames = [
    'asset-sourcing',
    'environment',
    'game-dev',
    'lighting',
    'post-processing',
    'rock-ground-shaders',
    'rockgen',
    'scene-style-application',
    'style-presets',
    'toon-shading',
    'vegetation-sky',
    'visual-verification',
    'water',
  ];
  const expectedSkillPaths = ['claude', 'codex']
    .flatMap((agent) => expectedSkillNames.map(
      (name) => `agents/skills/${agent}/${name}/SKILL.md`,
    ))
    .sort();
  assert.deepEqual(
    skillPaths.sort(),
    expectedSkillPaths,
    'npm tarball must include exactly the approved paired support skills',
  );
  for (const incompleteSkill of ['/camera/', '/game-feel/', '/weather/']) {
    assert.equal(
      skillPaths.some((path) => path.includes(incompleteSkill)),
      false,
      `npm tarball exposes incomplete skill ${incompleteSkill}`,
    );
  }
  assert.ok(paths.includes('mcp/server.mjs'), 'npm tarball must include the local MCP helper');
  assert.ok(paths.includes('NPM-LIBRARY.md'), 'npm tarball must include its package-first guide');
  assert.ok(paths.includes('agents/README.md'), 'npm tarball must include the agent resource index');
  assert.ok(paths.includes('agents/PROMPTS.md'), 'npm tarball must include supported agent prompts');
  assert.ok(paths.includes('agents/codex/AGENTS.md'), 'npm tarball must include Codex guidance');
  assert.ok(paths.includes('agents/claude/CLAUDE.md'), 'npm tarball must include Claude guidance');
  assert.ok(paths.includes('agents/cursor/toonlab.mdc'), 'npm tarball must include Cursor guidance');
  assert.match(
    mcpServerSource,
    /legacyWorkspaceMode !== '0' && !process\.env\.DATABASE_URL/,
    'the packaged MCP must default to its disk workspace when DATABASE_URL is absent',
  );
  assert.ok(paths.includes('scripts/setup-local.mjs'), 'npm tarball must include its setup command');
  assert.ok(paths.includes('scripts/generate-catalog-seed.mjs'), 'npm tarball must include its catalog seed command');
  assert.ok(paths.includes('compose.yaml'), 'npm tarball setup must include the referenced Postgres Compose service');
  for (const reference of [
    'agents/references/anime-art-direction.md',
    'agents/references/asset-sourcing-policy.md',
    'agents/references/custom-gap-report.md',
    'agents/references/mcp-asset-discovery.md',
    'agents/references/runtime-entry-points.md',
    'agents/references/style-bundles.md',
  ]) {
    assert.ok(paths.includes(reference), `npm tarball must include ${reference}`);
  }

  console.log(
    `Package boundary verified: ${report.entryCount} files, `
      + `${report.size} packed bytes, ${report.unpackedSize} unpacked bytes, `
      + `${packedRuntimePaths.length} runtime modules, `
      + `${skillPaths.length} skills, zero redistributed binary/media assets, `
      + 'zero labs/pre-beta code.',
  );
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
