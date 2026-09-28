import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-packaged-grass-'));
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
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
    },
  }))[0];
  assert.equal(report.name, '@call-me-sensei/toonlab');
  assert.equal(report.version, packageJson.version);

  const redistributedAssetPattern =
    /\.(?:bin|exr|fbx|gif|glb|gltf|hdr|jpe?g|ktx2|mp3|mp4|ogg|png|ttf|wasm|wav|webm|webp|woff2?|zip)$/i;
  assert.deepEqual(
    report.files.filter(({ path }) => redistributedAssetPattern.test(path)),
    [],
    'the grass package must not redistribute reference meshes or textures',
  );

  const consumerRoot = join(temporaryRoot, 'consumer');
  const packageScope = join(consumerRoot, 'node_modules', '@call-me-sensei');
  const packagePath = join(packageScope, 'toonlab');
  await mkdir(packageScope, { recursive: true });
  run('tar', ['-xzf', join(temporaryRoot, report.filename), '-C', packageScope]);
  await rename(join(packageScope, 'package'), packagePath);
  await symlink(join(root, 'node_modules', 'three'), join(consumerRoot, 'node_modules', 'three'));
  await writeFile(join(consumerRoot, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
  }));

  const consumerScript = `
    import assert from 'node:assert/strict';
    import * as THREE from 'three';
    import {
      CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS,
      CALL_ME_SENSEI_GRASS_MATERIAL_TEXTURE_URLS,
      CALL_ME_SENSEI_GRASS_PROVENANCE,
      DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP,
      GRASS_CLUMP_GEOMETRY_RECIPE,
      StylizedGrassClumpField,
      createCallMeSenseiGrassField,
      createCallMeSenseiGrassMaterial,
      loadCallMeSenseiGrassClump,
    } from '@call-me-sensei/toonlab/grass';

    assert.equal(DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP, 'primary');
    assert.deepEqual(Object.keys(CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS), ['primary', 'secondary']);
    assert.deepEqual(Object.keys(CALL_ME_SENSEI_GRASS_MATERIAL_TEXTURE_URLS), []);
    assert.equal(CALL_ME_SENSEI_GRASS_PROVENANCE.referenceGeometryUsed, false);
    assert.equal(CALL_ME_SENSEI_GRASS_PROVENANCE.geometryRecipeVersion, 3);
    assert.equal(GRASS_CLUMP_GEOMETRY_RECIPE.version, 3);
    assert.deepEqual(GRASS_CLUMP_GEOMETRY_RECIPE.mediaDependencies, []);
    assert.equal(typeof createCallMeSenseiGrassField, 'function');
    assert.equal(typeof createCallMeSenseiGrassMaterial, 'function');
    assert.equal(typeof loadCallMeSenseiGrassClump, 'function');

    const expectedTriangles = {
      primary: [280, 98, 42],
      secondary: [392, 140, 56],
    };
    const expectedVertices = {
      primary: [360, 126, 54],
      secondary: [504, 180, 72],
    };
    for (const variant of Object.keys(CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS)) {
      const { descriptor, geometryLods } = await loadCallMeSenseiGrassClump({ variant });
      assert.equal(descriptor.id, variant);
      assert.deepEqual(
        geometryLods.map((geometry) => geometry.userData.grassClump.triangleCount),
        expectedTriangles[variant],
      );
      assert.deepEqual(
        geometryLods.map((geometry) => geometry.userData.grassClump.vertexCount),
        expectedVertices[variant],
      );
      for (const geometry of geometryLods) {
        assert.ok(geometry.getAttribute('aBladeOrigin'));
        assert.ok(geometry.getAttribute('aBladeInfo'));
        assert.equal(geometry.userData.grassClump.referenceGeometryUsed, false);
        assert.equal(geometry.userData.grassClump.recipeVersion, 3);
        assert.ok(Math.abs(geometry.userData.grassClump.effectiveCoverageRatio - 1) <= 0.12);
        assert.doesNotMatch(geometry.name, /SM_Grass/i);
        geometry.dispose();
      }
    }

    const field = await createCallMeSenseiGrassField({
      placements: [{ normal: [0, 1, 0], scale: 1, x: 0, y: 0, yaw: 0, z: 0 }],
    });
    assert.ok(field instanceof StylizedGrassClumpField);
    assert.equal(field.instanceCount, 1);
    assert.equal(field.userData.callMeSenseiGrass.firstParty, true);
    assert.equal(field.userData.callMeSenseiGrass.procedural, true);
    assert.equal(field.userData.callMeSenseiGrass.preset, 'call_me_sensei_clump');
    assert.equal(field.userData.callMeSenseiGrass.provenance.referenceGeometryUsed, false);
    assert.equal(field.settings.groundAdoptStrength, 1);
    assert.deepEqual(field.settings.groundAdoptTint, [1, 1, 1]);
    assert.equal(field.settings.leanStrength, 0.24);
    assert.equal(field.settings.washLift, 0.68);
    assert.equal(field.settings.washOpacity, 0.82);
    assert.equal(typeof field.bladeBudget, 'function');
    assert.equal(field.lodMeshes[0].material.uniforms.uStyleGrassBendExponent.value, 1.3);
    assert.deepEqual(field.bladeBudget(), {
      authored: 40,
      drawn: 40,
      instances: 1,
      perLod: [
        { bladesPerInstance: 40, drawn: 40, instances: 1, level: 0 },
        { bladesPerInstance: 14, drawn: 0, instances: 0, level: 1 },
        { bladesPerInstance: 6, drawn: 0, instances: 0, level: 2 },
      ],
    });
    assert.ok(field.lodMeshes.every((mesh) => mesh.material.transparent));
    assert.deepEqual(
      field.lodMeshes.map((mesh) => mesh.geometry.userData.grassClump.triangleCount),
      expectedTriangles.primary,
    );
    field.dispose();

    const animeField = await createCallMeSenseiGrassField({
      frustumCulling: false,
      placements: [{ normal: [0, 1, 0], scale: 1, x: 250, y: 0, yaw: 0, z: 0 }],
      preset: 'anime_clump',
    });
    assert.equal(animeField.userData.callMeSenseiGrass.preset, 'anime_clump');
    assert.equal(animeField.settings.bladesPerClump, 6);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1, 0);
    camera.updateMatrixWorld(true);
    animeField.updateLods(camera);
    assert.deepEqual(
      animeField.lodMeshes.map((mesh) => mesh.geometry.instanceCount),
      [0, 0, 1],
      'the terminal LOD must retain distant grass instead of hard-culling it',
    );
    const animeBudget = animeField.bladeBudget();
    assert.equal(animeBudget.instances, 1);
    assert.equal(animeBudget.perLod.reduce((sum, lod) => sum + lod.instances, 0), 1);
    assert.ok(animeBudget.drawn > 0 && animeBudget.drawn <= animeBudget.authored);
    assert.equal(animeBudget.perLod[2].instances, 1);
    animeField.dispose();

    console.log(JSON.stringify({
      assetAuthority: 'first-party-procedural-code',
      defaultFactory: 'createCallMeSenseiGrassField',
      geometryRecipeVersion: GRASS_CLUMP_GEOMETRY_RECIPE.version,
      packagedBinaryAssets: 0,
      variants: Object.values(CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS)
        .map(({ bladeCount, dimensionsMeters, id, seed }) => ({
          bladeCount,
          dimensionsMeters,
          id,
          seed,
        })),
    }));
  `;
  const consumerScriptPath = join(consumerRoot, 'verify.mjs');
  await writeFile(consumerScriptPath, consumerScript);
  const evidence = run(process.execPath, [consumerScriptPath], { cwd: consumerRoot }).trim();
  const parsedEvidence = JSON.parse(evidence);
  assert.equal(parsedEvidence.assetAuthority, 'first-party-procedural-code');
  assert.equal(parsedEvidence.geometryRecipeVersion, 3);
  assert.equal(parsedEvidence.packagedBinaryAssets, 0);
  console.log(`Packaged grass verification passed: ${evidence}`);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
