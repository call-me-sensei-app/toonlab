import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-types-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  for (const [entry, definition] of Object.entries(packageJson.exports)) {
    if (entry.includes('*')) continue;
    assert.equal(typeof definition.types, 'string', `${entry} must publish a types condition`);
  }

  const report = JSON.parse(run(npmCommand, [
    'pack', '--dry-run=false', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], {
    cwd: root,
    env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') },
  }))[0];
  const consumerRoot = join(temporaryRoot, 'consumer');
  const packageScope = join(consumerRoot, 'node_modules', '@call-me-sensei');
  const packagePath = join(packageScope, 'toonlab');
  await mkdir(packageScope, { recursive: true });
  run('tar', ['-xzf', join(temporaryRoot, report.filename), '-C', packageScope]);
  await rename(join(packageScope, 'package'), packagePath);
  await symlink(join(root, 'node_modules', 'three'), join(consumerRoot, 'node_modules', 'three'));
  await mkdir(join(consumerRoot, 'node_modules', '@types'), { recursive: true });
  await symlink(
    join(root, 'node_modules', '@types', 'three'),
    join(consumerRoot, 'node_modules', '@types', 'three'),
  );

  const subpaths = [
    'toon', 'environment', 'water', 'vegetation', 'vegetation-shaders',
    'grass-palettes', 'styles', 'asset-policy', 'sky', 'cloud', 'post',
    'rock-shader', 'ground-shader', 'lighting', 'rockgen', 'texgen',
    'assetlib', 'official-catalog', 'character', 'renderer', 'runtime',
    'world-collision', 'loaders', 'toon-settings', 'water-settings', 'grass',
    'post-processing',
  ];
  const imports = subpaths.map((subpath, index) => (
    `import * as entry${index} from '@call-me-sensei/toonlab/${subpath}';\nvoid entry${index};`
  )).join('\n');
  const consumer = `
    import * as ToonLab from '@call-me-sensei/toonlab';
    import { createNaturalRockMapData } from '@call-me-sensei/toonlab/rockgen';
    const realisticMaps = createNaturalRockMapData({ assetId: 'typed-rock', profileId: 'coarse-granite-jointed', seed: 4, size: 64 });
    const realisticBaseColor: Uint8Array = realisticMaps.maps.baseColor;
    void realisticBaseColor;
    // @ts-expect-error texture size must be numeric
    createNaturalRockMapData({ assetId: 'typed-rock', size: 'large' });
    import {
      createStyleTarget,
      createStyleTargetLabel,
      createToonLabInspector,
    } from '@call-me-sensei/toonlab/styles';
    import {
      createCatalogLodRuntime,
      loadOfficialCatalogAsset,
    } from '@call-me-sensei/toonlab/official-catalog';
    import { inspectRockRegionBindings } from '@call-me-sensei/toonlab/rock-shader';
    ${imports}

    const label = createStyleTargetLabel('natural.rock', { targetId: 'scene/rock' });
    const target = createStyleTarget('scene/rock', 'natural.rock', {});
    const inspector = createToonLabInspector({ bundle: ToonLab.CALL_ME_SENSEI_STYLE_BUNDLE });
    void label;
    void target;
    void inspector.setDomainEnabled('natural.rock', false);
    void loadOfficialCatalogAsset({
      assetId: 'rock-0001',
      assetRuntime: { acquireAsset: async () => ({}) },
      styleBundle: ToonLab.CALL_ME_SENSEI_STYLE_BUNDLE,
    });
    declare const lodRoot: import('three').Object3D;
    const lodRuntime = createCatalogLodRuntime(lodRoot, { hysteresis: 0.12 });
    const hysteresis: number = lodRuntime.hysteresis;
    void hysteresis;
    const regionInspection = inspectRockRegionBindings(lodRoot);
    const regionVertexCount: number = regionInspection.totalVertices;
    void regionVertexCount;
    // @ts-expect-error unsupported domains must fail before runtime.
    createStyleTargetLabel('invented.shader');
    // @ts-expect-error target routing uses the same closed domain union.
    createStyleTarget('bad', 'environment-ish', {});
    // @ts-expect-error inspector toggles cannot address an unknown domain.
    inspector.setDomainEnabled('wet-rock', false);
    // @ts-expect-error catalog placement requires asset runtime and style bundle.
    loadOfficialCatalogAsset({ assetId: 'rock-0001' });
  `;
  await writeFile(join(consumerRoot, 'consumer.ts'), consumer);
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(consumerRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: 'ES2022',
    },
    files: ['./consumer.ts'],
  }, null, 2));
  const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tsc, '-p', join(consumerRoot, 'tsconfig.json')], { cwd: consumerRoot });

  const declarationPaths = report.files
    .map(({ path }) => path)
    .filter((path) => path.endsWith('.d.ts'));
  const declarationSources = await Promise.all(declarationPaths.map(async (path) => ({
    path,
    source: await readFile(join(packagePath, path), 'utf8'),
  })));
  assert.deepEqual(
    declarationPaths.filter((path) => /(?:legacyTreePresets|stylizedTreeExamples)/.test(path)),
    [],
    'published declarations must not contain predefined tree recipe modules',
  );
  const vegetationDeclaration = declarationSources.find(
    ({ path }) => path === 'types/vegetation/index.d.ts',
  );
  assert.ok(vegetationDeclaration, 'packed artifact is missing the vegetation declaration entry');
  for (const forbiddenTreeBinding of [
    'LEGACY_TREE_IDS',
    'LEGACY_TREE_PRESETS',
    'STYLIZED_TREE_EXAMPLES',
    'createLegacyTree',
    'layoutTreeRow',
  ]) {
    assert.equal(
      vegetationDeclaration.source.includes(forbiddenTreeBinding),
      false,
      `public vegetation declarations expose predefined tree binding ${forbiddenTreeBinding}`,
    );
  }
  const fallbackCount = declarationSources.filter(({ source }) => (
    source.includes('Source inference fallback:')
  )).length;
  const exactContracts = [
    'types/catalog/officialCatalogPlacement.d.ts',
    'types/catalog/officialCatalogLod.d.ts',
    'types/runtime/sceneSurfaceRuntime.d.ts',
    'types/styles/styleAdapters.d.ts',
    'types/styles/styleApplication.d.ts',
    'types/styles/styleInspector.d.ts',
    'types/styles/styleBundleProvider.d.ts',
    'types/styles/styleTargetLabels.d.ts',
    'types/styles/styleTypes.d.ts',
    'types/runtime/sceneCollisionRuntime.d.ts',
    'types/vegetation/treeSurfaceTextures.d.ts',
    'types/rock-shader/rockRegionRuntime.d.ts',
  'types/rockgen/surface/naturalRockSurface.d.ts',
  ];
  assert.ok(
    declarationPaths.length >= 314,
    'packed artifact must retain the linked source declaration graph',
  );
  assert.ok(fallbackCount <= 72, 'permissive declaration fallback count must not regress');
  for (const path of exactContracts) {
    const declaration = declarationSources.find((entry) => entry.path === path);
    assert.ok(declaration, `packed artifact is missing exact declaration ${path}`);
    assert.equal(
      declaration.source.includes('Source inference fallback:'),
      false,
      `${path} must remain an exact contract`,
    );
  }
  console.log(`Packaged TypeScript verification passed: ${JSON.stringify({
    declarationCount: declarationPaths.length,
    entryPoints: subpaths.length + 1,
    exactContracts: exactContracts.length,
    permissiveFallbacks: fallbackCount,
    negativeContracts: 4,
  })}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
