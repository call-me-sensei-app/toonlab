import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-quality-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
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
    import {
      SCENE_QUALITY_PROFILES,
      resolveSceneQualityProfile,
      serializeSceneQualityProfile,
    } from '@call-me-sensei/toonlab/styles';
    const balanced = resolveSceneQualityProfile();
    const performance = resolveSceneQualityProfile('performance');
    assert.equal(balanced.id, 'balanced');
    assert.equal(performance.id, 'performance');
    assert.ok(performance.quality.renderer.maxPixelRatio < balanced.quality.renderer.maxPixelRatio);
    assert.equal(JSON.parse(serializeSceneQualityProfile(performance)).id, 'performance');
    performance.quality.water.reflectionScale = 1;
    assert.equal(SCENE_QUALITY_PROFILES.performance.quality.water.reflectionScale, 0.35);
    console.log(JSON.stringify({ balanced: balanced.id, performance: performance.id }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = JSON.parse(run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim());
  assert.deepEqual(evidence, { balanced: 'balanced', performance: 'performance' });
  console.log(`Packaged scene quality profile verification passed: ${JSON.stringify(evidence)}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
