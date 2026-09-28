import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-walkable-character-'));
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
  assert.equal(report.version, packageJson.version);

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
      createCharacterControllerProfile,
      createWalkableCharacterRuntime,
      createWalkableCharacterSlot,
    } from '@call-me-sensei/toonlab/character';

    const makeAction = () => ({
      timeScale: 1,
      setEffectiveWeight(value) { this.weight = value; },
    });
    const character = {
      actions: { idle: makeAction(), walk: makeAction(), swim: makeAction(), tread: makeAction() },
      dispose() { this.disposed = true; },
      update() { this.updated = true; },
    };
    const body = {
      userData: { canJump: true },
      position: { x: 2, y: 1.05, z: 0 },
      velocity: { x: 1, y: -0.2, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
      angvel() { return this.angular; },
      linvel() { return this.velocity; },
      rotation() { return { x: 0, y: 0, z: 0, w: 1 }; },
      translation() { return this.position; },
      setAngvel(value) { this.angular = value; },
      setLinvel(value) { this.velocity = value; },
      setRotation() {},
      setTranslation(value) { this.position = value; },
    };
    const runtime = await createWalkableCharacterRuntime({
      characterRuntime: character,
      ground: (x) => x * 0.1,
    });
    const frame = runtime.update({ body, moving: true }, 1 / 60);
    assert.equal(frame.ground.correction, 'lock');
    assert.equal(body.position.y, 1.2);
    assert.ok(character.actions.walk.weight > 0);
    assert.equal(createCharacterControllerProfile().bodyCenterAtRest, 1);
    const slot = createWalkableCharacterSlot({ createRuntime: async ({ id }) => ({ id, dispose() {} }) });
    assert.equal((await slot.replace({ id: 'packed' })).id, 'packed');
    slot.dispose();
    runtime.dispose();
    assert.equal(character.disposed, true);
    console.log(JSON.stringify({ correction: frame.ground.correction, targetY: body.position.y }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = JSON.parse(run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim());
  assert.deepEqual(evidence, { correction: 'lock', targetY: 1.2 });
  console.log(`Packaged walkable character verification passed: ${JSON.stringify(evidence)}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
