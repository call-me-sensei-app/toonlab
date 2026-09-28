import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fixture = join(
  root,
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/',
  'v31-scan-assisted-runtime-package/exports/hoodoo-caprock-lod0-desktop-4k.glb',
);
const expectedInputSha256 = 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().trim());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  return {
    json,
    binary: bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength),
  };
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-rock-regions-package-'));
const npmEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryRoot, 'npm-cache'),
  npm_config_logs_dir: join(temporaryRoot, 'npm-logs'),
  npm_config_update_notifier: 'false',
};
try {
  const packReport = JSON.parse(run(npmCommand, [
    'pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], { cwd: root, env: npmEnvironment }))[0];
  const tarball = join(temporaryRoot, packReport.filename);
  const paths = packReport.files.map((file) => file.path);
  for (const required of [
    'src/rockgen/node.js',
    'src/rockgen/rockRegionGlbCompiler.node.js',
    'types/rockgen/node.d.ts',
    'types/rockgen/rockRegionGlbCompiler.node.d.ts',
    'types/rock-shader/rockRegionRuntime.d.ts',
    'cli/rockRegions.mjs',
    'cli/toonlab.mjs',
  ]) {
    assert.ok(paths.includes(required), `tarball is missing ${required}`);
  }
  assert.deepEqual(
    paths.filter((path) => /(?:^|\/)(?:artifacts|labs|quality|StylizedExploration)(?:\/|$)/u.test(path)),
    [],
    'npm tarball must not contain research, lab, quality, or Unreal artifacts',
  );
  assert.deepEqual(
    paths.filter((path) => /\.(?:blend|exr|glb|gltf|jpe?g|ktx2|png|tiff?|webp)$/iu.test(path)),
    [],
    'npm tarball must not contain rock or other media',
  );

  const consumer = join(temporaryRoot, 'consumer');
  await mkdir(consumer, { recursive: true });
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
  run(npmCommand, [
    'install', tarball, 'three@0.185.1',
    '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps',
  ], { cwd: consumer, env: npmEnvironment });

  const npmTree = JSON.parse(run(npmCommand, [
    'ls', '--json', '--depth=0', '@call-me-sensei/toonlab', 'three',
  ], { cwd: consumer, env: npmEnvironment }));
  assert.equal(npmTree.dependencies?.['@call-me-sensei/toonlab']?.version, '0.4.21');
  assert.equal(npmTree.dependencies?.three?.version, '0.185.1');

  const input = join(consumer, 'hoodoo.glb');
  const output = join(consumer, 'hoodoo-regions.glb');
  const auditPath = join(consumer, 'hoodoo-regions.audit.json');
  await copyFile(fixture, input);
  assert.equal(sha256(await readFile(input)), expectedInputSha256);
  const cli = join(consumer, 'node_modules/.bin/toonlab');
  const cliOutput = run(cli, [
    'rock-regions', 'compile',
    '--input', input,
    '--input-sha256', expectedInputSha256,
    '--profile', 'hoodoo-caprock-normalized-height-v1',
    '--output', output,
    '--audit', auditPath,
  ], { cwd: consumer });
  const stdoutAudit = JSON.parse(cliOutput);
  const fileAudit = JSON.parse(await readFile(auditPath, 'utf8'));
  assert.deepEqual(stdoutAudit, fileAudit);
  assert.equal(fileAudit.passed, true);
  assert.equal(fileAudit.input.sha256, expectedInputSha256);
  assert.doesNotMatch(JSON.stringify(fileAudit), /(?:\/Users\/|CascadeProjects|artifacts\/research)/u);

  const secondCli = spawnSync(cli, [
    'rock-regions', 'compile',
    '--input', input,
    '--input-sha256', expectedInputSha256,
    '--output', output,
    '--audit', auditPath,
  ], { cwd: consumer, encoding: 'utf8' });
  assert.equal(secondCli.status, 1);
  assert.match(secondCli.stderr, /OUTPUT_EXISTS/u);

  const sourceGlb = parseGlb(await readFile(input));
  const outputBytes = await readFile(output);
  const compiledGlb = parseGlb(outputBytes);
  const primitive = compiledGlb.json.meshes[0].primitives[0];
  const regionAccessor = compiledGlb.json.accessors[primitive.attributes._TL_ROCK_REGION];
  assert.equal(regionAccessor.count, 134_981);
  assert.equal(regionAccessor.componentType, 5121);
  assert.equal(regionAccessor.normalized, true);
  assert.deepEqual(regionAccessor.min, [0, 0, 0, 0]);
  assert.deepEqual(regionAccessor.max, [255, 255, 255, 255]);
  assert.equal(compiledGlb.json.images.length, 3);
  assert.deepEqual(
    compiledGlb.binary.subarray(0, sourceGlb.json.buffers[0].byteLength),
    sourceGlb.binary.subarray(0, sourceGlb.json.buffers[0].byteLength),
  );
  assert.equal(sha256(outputBytes), fileAudit.output.sha256);

  const smoke = join(consumer, 'smoke.mjs');
  await writeFile(smoke, `
    import assert from 'node:assert/strict';
    import * as rockShader from '@call-me-sensei/toonlab/rock-shader';
    import * as compiler from '@call-me-sensei/toonlab/rockgen/node';
    import * as browserRockgen from '@call-me-sensei/toonlab/rockgen';
    assert.equal(typeof rockShader.inspectRockRegionBinding, 'function');
    assert.equal(typeof compiler.compileRockRegionGlb, 'function');
    assert.equal(compiler.HOODOO_CAPROCK_INPUT_SHA256, '${expectedInputSha256}');
    assert.equal(browserRockgen.compileRockRegionGlb, undefined);
  `);
  run(process.execPath, [smoke], { cwd: consumer });

  console.log(`Packaged rock-region verification passed: ${JSON.stringify({
    tarball: packReport.filename,
    tarballSha256: sha256(await readFile(tarball)),
    packedFiles: paths.length,
    outputSha256: fileAudit.output.sha256,
    vertices: regionAccessor.count,
    images: compiledGlb.json.images.length,
    noOverwrite: true,
    publicImports: 3,
  })}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
