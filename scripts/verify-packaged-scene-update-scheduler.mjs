import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-scheduler-'));
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
    import * as root from '@call-me-sensei/toonlab';
    import { createSceneUpdateScheduler } from '@call-me-sensei/toonlab/runtime';
    const calls = [];
    const scheduler = createSceneUpdateScheduler();
    scheduler.register({ id: 'shadow', phase: 'shadows', update: () => calls.push('shadow') });
    scheduler.register({ id: 'environment', phase: 'environment', update: () => calls.push('environment') });
    scheduler.register({ id: 'lighting', phase: 'lighting', update: () => calls.push('lighting') });
    const frame = scheduler.update({ delta: 1 / 60 });
    assert.deepEqual(calls, ['environment', 'lighting', 'shadow']);
    assert.deepEqual(frame.completedTaskIds, calls);
    assert.equal(root.createSceneUpdateScheduler, createSceneUpdateScheduler);
    scheduler.dispose();
    console.log(JSON.stringify(frame.completedTaskIds));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = JSON.parse(run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim());
  assert.deepEqual(evidence, ['environment', 'lighting', 'shadow']);
  console.log(`Packaged scene update scheduler verification passed: ${JSON.stringify(evidence)}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
