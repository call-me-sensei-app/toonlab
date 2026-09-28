import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-launch-packed-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  const packed = JSON.parse(run('npm', [
    'pack', '--dry-run=false', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], { cwd: root, env: { ...process.env, npm_config_cache: join(temporaryRoot, 'npm-cache') } }))[0];
  const consumerRoot = join(temporaryRoot, 'consumer');
  const scope = join(consumerRoot, 'node_modules', '@call-me-sensei');
  await mkdir(scope, { recursive: true });
  run('tar', ['-xzf', join(temporaryRoot, packed.filename), '-C', scope]);
  await rename(join(scope, 'package'), join(scope, 'toonlab'));
  for (const dependency of ['three', 'react', '@react-three']) {
    const source = join(root, 'node_modules', dependency);
    const destination = join(consumerRoot, 'node_modules', dependency);
    await mkdir(join(destination, '..'), { recursive: true });
    await symlink(source, destination);
  }
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }));

  const consumerScript = `
    import assert from 'node:assert/strict';
    import { Scene } from 'three';
    import {
      CALL_ME_SENSEI_STYLE_BUNDLE,
      createOssStyleBundleProvider,
      createSceneUpdateScheduler,
      createWalkableCharacterRuntime,
      runSceneStyleOperation,
    } from '@call-me-sensei/toonlab';
    import { ToonLabScene, useStyleBundles, useToonLabScene } from '@call-me-sensei/toonlab/react';

    assert.equal(typeof ToonLabScene, 'function');
    assert.equal(typeof useStyleBundles, 'function');
    assert.equal(typeof useToonLabScene, 'function');
    const provider = createOssStyleBundleProvider();
    assert.equal((await provider.list())[0].id, CALL_ME_SENSEI_STYLE_BUNDLE.id);
    const manifest = {
      schema: 'toonlab/scene-style-manifest', version: 1, name: 'Packed labeled scene',
      targets: [
        { domain: 'natural.rock', id: 'packed-rock' },
        { domain: 'terrain.ground', id: 'packed-ground' },
        { domain: 'manufactured.surface', id: 'packed-bench' },
      ],
    };
    const audit = runSceneStyleOperation('audit', manifest, { mode: 'advisory' });
    const applied = runSceneStyleOperation('apply', manifest, { mode: 'advisory' });
    const verified = runSceneStyleOperation('verify', applied.manifest, { mode: 'advisory' });
    assert.equal(audit.ok && applied.ok && verified.ok, true);
    assert.equal(audit.audit.summary.targetCount, 3);
    assert.equal(applied.plan.operations.length, 3);

    const action = () => ({ setEffectiveWeight(value) { this.weight = value; }, timeScale: 1 });
    const character = {
      actions: { idle: action(), jump: action(), swim: action(), tread: action(), walk: action() },
      dispose() { this.disposed = true; }, update() {},
    };
    const body = {
      position: { x: 2, y: 1.05, z: 0 }, velocity: { x: 1, y: -0.2, z: 0 }, angular: { x: 0, y: 0, z: 0 },
      angvel() { return this.angular; }, linvel() { return this.velocity; }, rotation() { return { x: 0, y: 0, z: 0, w: 1 }; },
      translation() { return this.position; }, setAngvel(value) { this.angular = value; }, setLinvel(value) { this.velocity = value; },
      setRotation() {}, setTranslation(value) { this.position = value; }, userData: { canJump: true },
    };
    const runtime = await createWalkableCharacterRuntime({ characterRuntime: character, ground: (x) => x * 0.1 });
    const frame = runtime.update({ body, moving: true }, 1 / 60);
    assert.equal(frame.ground.correction, 'lock');
    assert.equal(body.position.y, 1.2);
    const scheduler = createSceneUpdateScheduler();
    let updates = 0;
    scheduler.register({ id: 'packed-update', phase: 'simulation', update: () => { updates += 1; } });
    scheduler.update({ camera: null, delta: 1 / 60, scene: new Scene() });
    assert.equal(updates, 1);
    runtime.dispose();

    console.log(JSON.stringify({
      levelB: { audit: audit.audit.summary, bundleId: applied.manifest.appliedStyle.bundle.id, verified: verified.ok },
      levelC: { correction: frame.ground.correction, schedulerUpdates: updates, targetY: body.position.y },
      package: { name: '@call-me-sensei/toonlab', version: '${packageJson.version}' },
    }));
  `;
  const scriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(scriptPath, consumerScript);
  const evidence = JSON.parse(run(process.execPath, [scriptPath], { cwd: consumerRoot }).trim());
  assert.equal(evidence.levelB.verified, true);
  assert.equal(evidence.levelC.correction, 'lock');
  await mkdir(join(root, 'quality', 'reports'), { recursive: true });
  await writeFile(join(root, 'quality', 'reports', 'level-b-packed-consumer.json'), `${JSON.stringify({
    gate: 'Level B', ...evidence.levelB, package: evidence.package,
  }, null, 2)}\n`);
  await writeFile(join(root, 'quality', 'reports', 'level-c-packed-consumer.json'), `${JSON.stringify({
    gate: 'Level C', ...evidence.levelC, package: evidence.package,
  }, null, 2)}\n`);
  console.log('Packed Level B and C launch gates passed.');
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
