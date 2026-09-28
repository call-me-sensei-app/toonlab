import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-world-collision-'));
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
    'pack',
    '--dry-run=false',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    temporaryRoot,
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
    import { createWorldCollision as fromRoot } from '@call-me-sensei/toonlab';
    import {
      COLLISION_METADATA_VERSION,
      createCollisionAdapter,
      createCollisionMetadata,
      createWorldCollision as fromSubpath,
      registerCollisionTarget,
    } from '@call-me-sensei/toonlab/world-collision';

    assert.equal(fromRoot, fromSubpath);
    const collision = fromSubpath({
      cellSize: 4,
      heightAt: (x, z) => x * 0.5 + z * 0.25,
    });
    collision.addCircles([
      { x: 0, z: 0, radius: 2 },
      { x: 8, z: 0, radius: 1 },
    ]);
    const centre = { x: 0, y: 7, z: 0 };
    collision.resolve(centre, 0.5);
    assert.deepEqual(centre, { x: 2.5, y: 7, z: 0 });
    const edge = { x: 1.8, y: 3, z: 0 };
    collision.resolve(edge, 0.5);
    assert.ok(Math.abs(edge.x - 2.5) < 1e-9);
    assert.equal(collision.groundHeight(4, 8), 4);
    assert.equal(collision.circles.length, 2);
    const trimesh = createCollisionMetadata('trimesh', { source: 'collider' });
    const registrations = [];
    const adapter = createCollisionAdapter('consumer/physics', {
      kinds: ['trimesh'],
      register: ({ metadata, targetId }) => {
        registrations.push({ kind: metadata.kind, targetId });
        return { registered: 1 };
      },
    });
    await registerCollisionTarget({
      adapter,
      metadata: trimesh,
      subject: {},
      targetId: 'consumer/cliff',
    });
    assert.equal(COLLISION_METADATA_VERSION, 1);
    assert.deepEqual(registrations, [{ kind: 'trimesh', targetId: 'consumer/cliff' }]);
    console.log(JSON.stringify({
      blockers: collision.circles.length,
      centreX: centre.x,
      collisionMetadataVersion: COLLISION_METADATA_VERSION,
      groundHeight: collision.groundHeight(4, 8),
    }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim();
  assert.deepEqual(JSON.parse(evidence), {
    blockers: 2,
    centreX: 2.5,
    collisionMetadataVersion: 1,
    groundHeight: 4,
  });
  console.log(`Packaged world collision verification passed: ${evidence}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
