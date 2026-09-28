import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-quality-integration-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  const report = JSON.parse(run(npmCommand, ['pack', '--dry-run=false', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot], {
    cwd: root,
    env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') },
  }))[0];
  const consumerRoot = join(temporaryRoot, 'consumer');
  const packageScope = join(consumerRoot, 'node_modules', '@call-me-sensei');
  await mkdir(packageScope, { recursive: true });
  run('tar', ['-xzf', join(temporaryRoot, report.filename), '-C', packageScope]);
  await rename(join(packageScope, 'package'), join(packageScope, 'toonlab'));
  await symlink(join(root, 'node_modules', 'three'), join(consumerRoot, 'node_modules', 'three'));
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const script = `
    import assert from 'node:assert/strict';
    import { resolveCatalogLodDistancesForQuality } from '@call-me-sensei/toonlab/official-catalog';
    import { resolveSceneQualityProfile } from '@call-me-sensei/toonlab/styles';
    import { createCallMeSenseiGrassField } from '@call-me-sensei/toonlab/vegetation';
    import { WaterScenePasses } from '@call-me-sensei/toonlab/water';
    const quality = resolveSceneQualityProfile('performance');
    assert.deepEqual(resolveCatalogLodDistancesForQuality(quality), [0, 22, 64, 150]);
    const field = await createCallMeSenseiGrassField({ placements: [{ x: 0, y: 0, z: 0 }] });
    assert.equal(typeof field.setQualityBudget, 'function');
    field.setQualityBudget({ maxVisibleInstances: 1 });
    const passes = new WaterScenePasses();
    passes.setQualityBudget(quality.quality.water);
    assert.equal(passes.stats.configuredMaximumSceneRenders, 2);
    assert.equal(passes.stats.enabled.reflection, false);
    field.dispose();
    passes.dispose();
    console.log(JSON.stringify({ lod: resolveCatalogLodDistancesForQuality(quality), passes: 2 }));
  `;
  const scriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(scriptPath, script);
  const evidence = JSON.parse(run(process.execPath, [scriptPath], { cwd: consumerRoot }).trim());
  assert.deepEqual(evidence, { lod: [0, 22, 64, 150], passes: 2 });
  console.log(`Packaged quality budget integration passed: ${JSON.stringify(evidence)}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
