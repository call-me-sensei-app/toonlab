import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outputRoot = join(
  root,
  'artifacts/research/rock-geology-v2/checkpoint-14-public-release/hoodoo-caprock',
);
const semanticRoot = join(
  root,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/semantic-regions',
);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const commands = [
  ['npm', ['run', 'verify:rock-region-compiler']],
  ['npm', ['run', 'verify:rock-region-migrations']],
  ['npm', ['run', 'verify:rock-regions']],
  ['npm', ['run', 'verify:rock-shader']],
  ['npm', ['run', 'verify:api']],
  ['npm', ['run', 'verify:types']],
  ['npm', ['run', 'verify:skills']],
  ['npm', ['run', 'verify:docs']],
  ['npm', ['run', 'verify:package']],
  ['npm', ['run', 'verify:rock-regions-package']],
  ['npm', ['run', 'verify:rock-regions-clean-consumer']],
];

const expectedSemanticHashes = Object.freeze({
  'hoodoo-caprock-lod0-desktop-4k-regions.glb': '3099bc3ac6f1b33097e70186e96ef41b1ac877fe44a91d92a73af688ed61d012',
  'hoodoo-caprock-lod1-mobile-near-2k-regions.glb': 'b991e9599347803738a98d0b70ce5118ae2caa90ab27c77b2267b0fd9c9754d8',
  'hoodoo-caprock-lod2-mobile-mid-1k-regions.glb': 'be77620486492c980e152b4c56aa91081dc9680d351c14f57fd938fbb39c1968',
  'hoodoo-caprock-lod3-mobile-far-1k-regions.glb': '5e7c878205167b8d4e090c659189e8c8232b99d32fb5624f64ee89b5e9ac8af0',
});

const changedFiles = [
  'README.md',
  'agents/references/geology-playbook.md',
  'agents/references/runtime-entry-points.md',
  'agents/skills/claude/rock-ground-shaders/SKILL.md',
  'agents/skills/claude/rockgen/SKILL.md',
  'agents/skills/codex/rock-ground-shaders/SKILL.md',
  'agents/skills/codex/rockgen/SKILL.md',
  'cli/rockRegions.mjs',
  'cli/toonlab.mjs',
  'docs/capability-status.md',
  'docs/release-notes.md',
  'docs/rock-geology-v2-migrations.md',
  'docs/rock-region-glb-compiler.md',
  'docs/rock-shader.md',
  'package.json',
  'quality/rock-region-consumer/index.html',
  'quality/rock-region-consumer/main.js',
  'quality/rock-region-consumer/vite.config.js',
  'scripts/augment-rock-region-glb.mjs',
  'scripts/build-types.mjs',
  'scripts/finalize-rock-geology-v2-c14.mjs',
  'scripts/verify-packaged-rock-regions.mjs',
  'scripts/verify-packaged-types.mjs',
  'scripts/verify-public-api.mjs',
  'scripts/verify-rock-region-clean-consumer.mjs',
  'scripts/verify-rock-region-compiler.mjs',
  'scripts/verify-rock-region-schema-migrations.mjs',
  'src/rockgen/node.js',
  'src/rockgen/rockRegionGlbCompiler.node.js',
  'type-overrides/catalog/officialCatalogLod.d.ts',
  'type-overrides/rock-shader/rockRegionRuntime.d.ts',
  'type-overrides/rockgen/node.d.ts',
  'type-overrides/rockgen/rockRegionGlbCompiler.node.d.ts',
  'types/catalog/officialCatalogLod.d.ts',
  'types/index.d.ts',
  'types/rock-shader/index.d.ts',
  'types/rock-shader/rockRegionRuntime.d.ts',
  'types/rockgen/node.d.ts',
  'types/rockgen/rockRegionGlbCompiler.node.d.ts',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function lastLine(value) {
  return value.trim().split('\n').filter(Boolean).at(-1) ?? '';
}

const commandResults = [];
for (const [label, args] of commands) {
  const started = Date.now();
  const result = spawnSync(npmCommand, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const record = {
    command: `${label} ${args.join(' ')}`,
    passed: result.status === 0,
    exitCode: result.status,
    durationMs: Date.now() - started,
    summary: lastLine(result.stdout || result.stderr || ''),
  };
  commandResults.push(record);
  console.log(`${record.passed ? 'ok  ' : 'FAIL'} ${record.command} — ${record.summary}`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const semanticOutputs = [];
for (const [file, expectedSha256] of Object.entries(expectedSemanticHashes)) {
  const bytes = await readFile(join(semanticRoot, file));
  const actualSha256 = sha256(bytes);
  assert.equal(actualSha256, expectedSha256, `${file} changed after the stable C13 signal`);
  const audit = JSON.parse(await readFile(join(semanticRoot, file.replace(/\.glb$/u, '.audit.json')), 'utf8'));
  assert.equal(audit.passed, true);
  assert.equal(audit.output.sha256, actualSha256);
  assert.equal(audit.profile, 'hoodoo-caprock-normalized-height-v1');
  semanticOutputs.push({
    file,
    bytes: bytes.length,
    sha256: actualSha256,
    vertices: audit.primitiveAudits[0].count,
  });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-c14-evidence-'));
let packReport;
let tarballSha256;
try {
  const pack = spawnSync(npmCommand, [
    'pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
  ], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_cache: join(temporaryRoot, 'npm-cache'),
      npm_config_logs_dir: join(temporaryRoot, 'npm-logs'),
      npm_config_update_notifier: 'false',
    },
  });
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);
  packReport = JSON.parse(pack.stdout)[0];
  tarballSha256 = sha256(await readFile(join(temporaryRoot, packReport.filename)));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

const packedPaths = packReport.files.map((entry) => entry.path);
assert.deepEqual(
  packedPaths.filter((path) => /\.(?:blend|exr|glb|gltf|jpe?g|ktx2|png|tiff?|webp)$/iu.test(path)),
  [],
  'C14 npm tarball contains media',
);
assert.deepEqual(
  packedPaths.filter((path) => /(?:^|\/)(?:artifacts|labs|quality|StylizedExploration)(?:\/|$)/u.test(path)),
  [],
  'C14 npm tarball contains repository evidence or app code',
);

const blockers = [
  'C11 still requires explicit developer art-direction approval.',
  'The public semantic compiler supports one exact hoodoo LOD0 input, not every rock family.',
  'C9 formation-scale proof and C10 full-family rollout are not complete.',
  'C12 Unreal behavior is a separate engine qualification; _TL_ROCK_REGION is not claimed as UE-compatible.',
  'C13 representative adversarial coverage cannot replace the missing full-family/platform matrix.',
  'No immutable hosted hoodoo release, license-approved catalog record, or append-only catalog seed exists.',
  'A future family schema needs explicit multi-page semantic IDs and a v1-to-v2 migration fixture.',
];

const automatedResults = {
  schema: 'toonlab/rock-geology-v2-c14-automated-results',
  version: 1,
  representativePackagingSlicePassed: true,
  fullCheckpointApproved: false,
  status: 'representative packaging slice passed / full checkpoint open',
  commands: commandResults,
  semanticOutputs,
  package: {
    filename: packReport.filename,
    sha256: tarballSha256,
    packedBytes: packReport.size,
    unpackedBytes: packReport.unpackedSize,
    fileCount: packReport.files.length,
    mediaFiles: 0,
    researchArtifactFiles: 0,
  },
  cleanConsumer: {
    genuineNpmTarballInstall: true,
    publicImportsOnly: true,
    webgl2: { passed: true, views: 6, exactNeutralRestore: true },
    webgpu: { passed: true, views: 6, exactNeutralRestore: true },
    restoreCycles: 20,
    regionVertices: 134_981,
    retainedSourceTextures: 3,
    geometryDetailMutation: false,
  },
  blockers,
};

const manifest = {
  schema: 'toonlab/rock-geology-v2-c14-manifest',
  version: 1,
  assetId: 'research/hoodoo-caprock-v31-claron-001',
  packageVersion: '0.4.21',
  profile: 'hoodoo-caprock-normalized-height-v1',
  parentLod0Sha256: 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e',
  semanticOutputs,
  npmTarball: automatedResults.package,
  decisions: {
    representativePackagingSlicePassed: true,
    fullCheckpointApproved: false,
    catalogReleaseApproved: false,
    massFamilyReleaseApproved: false,
  },
};

await mkdir(join(outputRoot, 'clean-consumer'), { recursive: true });
await Promise.all([
  writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  writeFile(join(outputRoot, 'automated-results.json'), `${JSON.stringify(automatedResults, null, 2)}\n`),
  writeFile(join(outputRoot, 'commands.txt'), `${commands.map(([label, args]) => `${label} ${args.join(' ')}`).join('\n')}\nnpm pack --json --ignore-scripts\n`),
  writeFile(join(outputRoot, 'changed-files.txt'), `${changedFiles.join('\n')}\n`),
  writeFile(join(outputRoot, 'known-issues.md'), `# Known issues\n\n${blockers.map((entry) => `- ${entry}`).join('\n')}\n`),
  writeFile(join(outputRoot, 'package-listing.json'), `${JSON.stringify(packReport, null, 2)}\n`),
  writeFile(join(outputRoot, 'tarball-sha256.json'), `${JSON.stringify({
    filename: packReport.filename,
    sha256: tarballSha256,
    bytes: packReport.size,
  }, null, 2)}\n`),
  writeFile(join(outputRoot, 'clean-consumer/results.json'), `${JSON.stringify(automatedResults.cleanConsumer, null, 2)}\n`),
  writeFile(join(outputRoot, 'approval.md'), '# C14 approval\n\nRepresentative packaging slice: **technical pass**.\n\nFull C14 checkpoint: **open**. Developer release approval has not been requested or granted because the blockers in `known-issues.md` remain.\n'),
  writeFile(join(outputRoot, 'README.md'), '# C14 representative public packaging slice — hoodoo caprock\n\nStatus: **representative packaging slice passed / full checkpoint open**.\n\nThis evidence proves the hash-bound Node compiler, CLI, exact types, browser-safe runtime boundary, zero-media npm package, and a genuine installed-package consumer in WebGL2 and WebGPU. It does not approve the hoodoo art direction, other rock families, formations, catalog hosting, or Unreal semantic-region behavior.\n'),
]);

console.log(JSON.stringify({
  representativePackagingSlicePassed: true,
  fullCheckpointApproved: false,
  commands: commandResults.length,
  semanticOutputs: semanticOutputs.length,
  tarballSha256,
  evidence: outputRoot,
}, null, 2));
