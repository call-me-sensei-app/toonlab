import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-renderer-'));
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
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));

  const consumerScript = `
    import assert from 'node:assert/strict';
    import { NoToneMapping, SRGBColorSpace } from 'three';
    import * as root from '@call-me-sensei/toonlab';
    import {
      configureToonLabRenderer,
      detectToonLabRendererBackend,
    } from '@call-me-sensei/toonlab/renderer';

    const results = [];
    for (const fixture of [
      { backend: { isWebGPUBackend: true }, expected: 'webgpu', isWebGPURenderer: true, shadows: true },
      { backend: { isWebGPUBackend: false }, expected: 'webgl2-fallback', isWebGPURenderer: true, shadows: false },
      { backend: undefined, expected: 'webgl', isWebGPURenderer: false, shadows: true },
    ]) {
      let pixelRatio = 1.25;
      const renderer = {
        backend: fixture.backend,
        isWebGPURenderer: fixture.isWebGPURenderer,
        outputColorSpace: 'source-space',
        shadowMap: { enabled: false, type: 'source-shadow' },
        toneMapping: 'source-tone',
        toneMappingExposure: 1.4,
        getPixelRatio: () => pixelRatio,
        setPixelRatio: (value) => { pixelRatio = value; },
      };
      const handle = configureToonLabRenderer(renderer, { devicePixelRatio: 3 });
      assert.equal(detectToonLabRendererBackend(renderer), fixture.expected);
      assert.equal(handle.backend, fixture.expected);
      assert.equal(renderer.outputColorSpace, SRGBColorSpace);
      assert.equal(renderer.toneMapping, NoToneMapping);
      assert.equal(renderer.shadowMap.enabled, fixture.shadows);
      assert.equal(pixelRatio, 2);
      handle.dispose();
      assert.equal(renderer.outputColorSpace, 'source-space');
      assert.equal(renderer.toneMapping, 'source-tone');
      assert.equal(renderer.shadowMap.enabled, false);
      assert.equal(pixelRatio, 1.25);
      results.push(fixture.expected);
    }
    assert.equal(root.configureToonLabRenderer, configureToonLabRenderer);
    console.log(JSON.stringify(results));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = JSON.parse(run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim());
  assert.deepEqual(evidence, ['webgpu', 'webgl2-fallback', 'webgl']);
  console.log(`Packaged renderer configuration verification passed: ${JSON.stringify(evidence)}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
