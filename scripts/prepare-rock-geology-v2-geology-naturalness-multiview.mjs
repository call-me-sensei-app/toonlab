#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const CHECKPOINT_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families',
);
const NATURALNESS_DIRECTORY = path.join(CHECKPOINT_DIRECTORY, 'geology-naturalness-review');
const WORK_DIRECTORY = path.join(NATURALNESS_DIRECTORY, 'multiview-capture');
const STAGING_DIRECTORY = path.join(WORK_DIRECTORY, 'staging');
const REFERENCE_DIRECTORY = path.join(CHECKPOINT_DIRECTORY, 'morphology/reference-final');
const CANONICAL_V4_TARGET_RELATIVE = 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/geology-naturalness-review/current-v4-source';
const CANONICAL_V4_TARGET = path.resolve(CANONICAL_V4_TARGET_RELATIVE);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const FREEZE_SCHEMA_ID = 'toonlab-rock-geology-v2-naturalness-source-freeze-v1';
const AUTHORIZATION_PHRASE = 'SOURCE FROZEN';
const VIEWS = ['front', 'rear', 'left', 'right', 'top', 'bottom', 'threeQuarter'];
const AXIS_VIEWS = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const MODE = option('--mode') ?? 'prepare';
const FREEZE_PATH_ARGUMENT = option('--freeze');
const SUPPLIED_FREEZE_HASH = normalizeHash(option('--frozen-hash'));
const SOURCE_FROZEN_ACK = option('--source-frozen-ack');

const CAPTURE_POLICY = Object.freeze({
  id: 'toonlab-c8-geology-naturalness-neutral-clay-7view-v1',
  resolutionPixels: [1024, 1024],
  projection: 'orthographic',
  framingRadiusMultiplier: 1.08,
  cameraDistanceRadiusMultiplier: 5,
  verticalAxis: 'positive-y',
  localBasis: 'x=strike, y=up, z=across-strike',
  directions: {
    front: [0, 0, 1],
    rear: [0, 0, -1],
    left: [-1, 0, 0],
    right: [1, 0, 0],
    top: [0, 1, 0],
    bottom: [0, -1, 0],
    threeQuarter: [1, 0.72, 1],
  },
  cameraUp: {
    front: 'world-positive-y',
    rear: 'world-positive-y',
    left: 'world-positive-y',
    right: 'world-positive-y',
    top: 'negative-across-strike',
    bottom: 'positive-across-strike',
    threeQuarter: 'world-positive-y',
  },
  material: {
    type: 'MeshStandardMaterial',
    colorSrgbHex: '#a39c8e',
    metalness: 0,
    roughness: 0.93,
  },
  lighting: {
    hemisphere: { sky: '#e9f0ec', ground: '#282622', intensity: 1.55 },
    key: { color: '#ffe7c7', intensity: 4.6, positionInRadii: [2.8, 4.4, 3.4] },
    fill: { color: '#86abc5', intensity: 1, positionInRadii: [-3, 1.4, -2.5] },
    undersideFill: { color: '#b7c8d6', intensity: 1.35, positionInRadii: [0, -3.5, 1.2] },
  },
  backgroundSrgbHex: '#151b19',
  groundPlane: false,
  textureInputs: false,
  stylization: false,
  preserveDrawingBuffer: true,
  devicePixelRatio: 1,
});

const REFERENCE_TARGETS = Object.freeze({
  'basalt-entablature': {
    candidates: ['forms/column-entablature', 'cliffs/cliff-columnar', 'forms/column-colonnade'],
    verdict: 'unresolved',
    exactPackage: null,
    reason: 'All local candidate photos primarily show regular colonnade. None isolates the dense irregular hackly entablature zone strongly enough for a class-level naturalness comparison.',
  },
  'shale-slope': {
    candidates: ['clasts/shard-platy', 'cliffs/sea-cliff-bedded', 'forms/sheet-scree'],
    verdict: 'unresolved',
    exactPackage: null,
    reason: 'The packages separately show fissile shale, a bedded shale/sandstone sea cliff, and generic scree. None shows the required shale-dominated slope morphology at the current witness scale.',
  },
  'slate-outcrop': {
    candidates: ['clasts/slab-cleavage', 'residuals/outcrop-foliated'],
    verdict: 'unresolved',
    exactPackage: null,
    reason: 'The local sources are a schist hand specimen and a gneiss outcrop. Neither is an exact slate outcrop.',
  },
  'schist-outcrop': {
    candidates: ['clasts/slab-cleavage', 'residuals/outcrop-foliated', 'cliffs/cliff-foliated'],
    verdict: 'unresolved',
    exactPackage: null,
    reason: 'The schist source is a detached hand specimen; the outcrop-scale sources are gneiss. The combination is useful context but is not one exact schist-outcrop nature witness.',
  },
  'volcanic-breccia-outcrop': {
    candidates: ['clasts/shard-splintery'],
    verdict: 'exact-nature-image-found',
    exactPackage: 'clasts/shard-splintery',
    reason: 'The exact retained USGS photograph visibly depicts an exposed vitrophyre breccia mass with angular volcanic fragments in matrix. Only its source photograph/provenance may be rebound; its generated shard six-view and shard-specific criteria are not valid outcrop evidence.',
  },
});

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeHash(value) {
  return typeof value === 'string' ? value.replace(/^sha256:/, '') : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function natureMetadata(source) {
  const exact = source.exactNatureSource ?? {};
  const nature = source.naturePhoto ?? {};
  const local = typeof exact.localImage === 'object' ? exact.localImage : {};
  const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
  return {
    stablePageUrl: first(
      exact.pageUrl,
      nature.stablePageUrl,
      nature.pageUrl,
      source.stablePageUrl,
      source.sourcePageUrl,
      source.natureReferences?.[0]?.stablePageUrl,
    ),
    declaredSha256: normalizeHash(first(
      local.sha256,
      nature.localImageSha256,
      source.localImageSha256,
      source.localSha256,
      source.sourceSha256,
      source.sourceContentHash,
      source.natureReferences?.[0]?.sha256,
    )),
    title: first(exact.title, nature.title, source.title, source.label, source.subtypeId),
  };
}

async function enumerateReferencePackages() {
  const packages = [];
  for (const group of (await readdir(REFERENCE_DIRECTORY)).sort()) {
    if (group === 'audit') continue;
    const groupPath = path.join(REFERENCE_DIRECTORY, group);
    if (!(await stat(groupPath)).isDirectory()) continue;
    for (const subtype of (await readdir(groupPath)).sort()) {
      const packagePath = path.join(groupPath, subtype);
      const sourcePath = path.join(packagePath, 'source.json');
      const naturePath = path.join(packagePath, 'source-image.jpg');
      if (!await exists(sourcePath)) continue;
      assert(await exists(naturePath), `Reference package ${group}/${subtype} has no source-image.jpg.`);
      const [sourceBytes, natureBytes] = await Promise.all([readFile(sourcePath), readFile(naturePath)]);
      const source = JSON.parse(sourceBytes);
      const metadata = natureMetadata(source);
      packages.push({
        package: `${group}/${subtype}`,
        subtypeId: source.subtypeId,
        sourceRecord: {
          path: path.relative(process.cwd(), sourcePath),
          sha256: sha256(sourceBytes),
        },
        exactNatureImage: {
          path: path.relative(process.cwd(), naturePath),
          sha256: sha256(natureBytes),
          bytes: natureBytes.length,
          declaredSha256: metadata.declaredSha256,
          declaredHashMatches: metadata.declaredSha256 === sha256(natureBytes),
          stablePageUrl: metadata.stablePageUrl,
          title: metadata.title,
        },
      });
    }
  }
  assert(packages.length === 100, `Expected all 100 source-bound reference packages, found ${packages.length}.`);
  assert(packages.every((entry) => entry.exactNatureImage.declaredHashMatches), 'One of the 100 exact nature images does not match its declared hash.');
  return packages;
}

function freezeSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${FREEZE_SCHEMA_ID}.schema.json`,
    type: 'object',
    additionalProperties: false,
    required: ['schema', 'frozen', 'sourceId', 'sourceRoot', 'heroIndex', 'lineage', 'generatorSourceAggregateSha256', 'uniformTier', 'selection', 'canonicalTarget', 'referenceInventorySha256'],
    properties: {
      schema: { const: FREEZE_SCHEMA_ID },
      frozen: { const: true },
      sourceId: { type: 'string', minLength: 3 },
      sourceRoot: { type: 'string', minLength: 3 },
      heroIndex: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'sha256'],
        properties: { path: { type: 'string' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
      },
      lineage: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'sha256'],
        properties: { path: { type: 'string' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
      },
      generatorSourceAggregateSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      uniformTier: {
        type: 'object',
        additionalProperties: false,
        required: ['basisCompilerVersion', 'basisFieldVersion', 'meshResolution'],
        properties: {
          basisCompilerVersion: { type: 'integer', minimum: 1 },
          basisFieldVersion: { type: 'integer', minimum: 1 },
          meshResolution: { type: 'integer', minimum: 16 },
        },
      },
      selection: {
        type: 'object',
        additionalProperties: false,
        required: ['roles', 'expectedClassCount'],
        properties: {
          roles: { const: ['median', 'challenging'] },
          expectedClassCount: { const: 16 },
        },
      },
      canonicalTarget: { const: CANONICAL_V4_TARGET_RELATIVE },
      referenceInventorySha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    },
  };
}

async function prepareSafeArtifacts() {
  await mkdir(WORK_DIRECTORY, { recursive: true });
  const packages = await enumerateReferencePackages();
  const packageByPath = new Map(packages.map((entry) => [entry.package, entry]));
  const targets = Object.entries(REFERENCE_TARGETS).map(([classId, target]) => {
    const candidates = target.candidates.map((packagePath) => {
      const entry = packageByPath.get(packagePath);
      assert(entry, `Reference inventory candidate is absent: ${packagePath}`);
      return entry;
    });
    return {
      classId,
      verdict: target.verdict,
      exactPackage: target.exactPackage,
      reason: target.reason,
      candidates,
      canonicalBindingAuthorized: false,
      note: 'Inventory decision only. No v4 canonical evidence is rebound before source freeze and developer review.',
    };
  });
  const inventory = {
    schema: 'toonlab-rock-geology-v2-naturalness-reference-inventory-v1',
    sourceBoundary: 'existing locally retained 100-package reference-final corpus only',
    packageCount: packages.length,
    packageGroupCounts: Object.fromEntries(['clasts', 'cliffs', 'forms', 'residuals'].map((group) => [
      group,
      packages.filter((entry) => entry.package.startsWith(`${group}/`)).length,
    ])),
    targetClassCount: targets.length,
    resolvedExactNatureImages: targets.filter((target) => target.verdict === 'exact-nature-image-found').map((target) => target.classId),
    unresolvedClasses: targets.filter((target) => target.verdict === 'unresolved').map((target) => target.classId),
    targets,
    inspectionBoundary: 'Preparation-level visual/source audit; not a qualified geology-review score or developer approval.',
    allPackages: packages,
  };
  const inventoryPath = path.join(WORK_DIRECTORY, 'reference-binding-inventory.json');
  await writeFile(inventoryPath, stableJson(inventory));
  const inventoryBytes = await readFile(inventoryPath);
  const schema = freezeSchema();
  const schemaPath = path.join(WORK_DIRECTORY, 'freeze-contract.schema.json');
  const template = {
    schema: FREEZE_SCHEMA_ID,
    frozen: false,
    sourceId: 'v4-pending-source-freeze',
    sourceRoot: 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/PENDING-v4-current-source',
    heroIndex: { path: 'PENDING/hero-output-index.json', sha256: null },
    lineage: { path: 'PENDING/lineage.json', sha256: null },
    generatorSourceAggregateSha256: null,
    uniformTier: { basisCompilerVersion: 4, basisFieldVersion: 4, meshResolution: 64 },
    selection: { roles: ['median', 'challenging'], expectedClassCount: 16 },
    canonicalTarget: CANONICAL_V4_TARGET_RELATIVE,
    referenceInventorySha256: sha256(inventoryBytes),
  };
  await Promise.all([
    writeFile(schemaPath, stableJson(schema)),
    writeFile(path.join(WORK_DIRECTORY, 'source-freeze-template.json'), stableJson(template)),
    writeFile(path.join(WORK_DIRECTORY, 'README.md'), `# Frozen-source seven-view capture\n\nThis staging compiler renders one uniform frozen mesh tier for all 16 current witnesses from front, rear, left, right, top, bottom-support, and three-quarter views. Preparation and the 100-package reference inventory are safe before freeze. Validation, staging, verification, and canonical commit require the exact freeze-file SHA-256 plus the literal acknowledgement \`${AUTHORIZATION_PHRASE}\`.\n\nThe tool never writes the root naturalness packet. Staging is immutable by freeze hash. Canonical commit accepts only the target in the freeze record, refuses a different existing freeze hash, and is idempotent only when every existing file already matches.\n`),
  ]);
  const report = {
    mode: 'prepare',
    safeBeforeSourceFreeze: true,
    canonicalWrites: 0,
    referencePackagesInventoried: packages.length,
    exactNatureBindingFound: inventory.resolvedExactNatureImages,
    unresolvedNatureBindings: inventory.unresolvedClasses,
    referenceInventorySha256: sha256(inventoryBytes),
    freezeSchemaSha256: sha256(await readFile(schemaPath)),
    sourceFreezeReceived: false,
    nextAction: 'Supply a completed frozen=true record, its exact SHA-256, and SOURCE FROZEN acknowledgement after v4 source freeze.',
  };
  await writeFile(path.join(WORK_DIRECTORY, 'preparation-report.json'), stableJson(report));
  return report;
}

function validateFreezeShape(freeze) {
  assert(freeze.schema === FREEZE_SCHEMA_ID, 'Freeze schema ID mismatch.');
  assert(freeze.frozen === true, 'Freeze record is not frozen=true.');
  assert(typeof freeze.sourceId === 'string' && freeze.sourceId.length >= 3, 'Freeze sourceId is invalid.');
  for (const bound of [freeze.heroIndex, freeze.lineage]) {
    assert(typeof bound?.path === 'string', 'Freeze-bound path is missing.');
    assert(/^[a-f0-9]{64}$/.test(bound?.sha256 ?? ''), `Freeze hash is invalid for ${bound?.path ?? 'unknown source'}.`);
  }
  assert(/^[a-f0-9]{64}$/.test(freeze.generatorSourceAggregateSha256 ?? ''), 'Generator source aggregate hash is invalid.');
  assert(Number.isInteger(freeze.uniformTier?.basisCompilerVersion), 'Uniform compiler version is missing.');
  assert(Number.isInteger(freeze.uniformTier?.basisFieldVersion), 'Uniform field version is missing.');
  assert(Number.isInteger(freeze.uniformTier?.meshResolution), 'Uniform mesh resolution is missing.');
  assert(JSON.stringify(freeze.selection?.roles) === JSON.stringify(['median', 'challenging']), 'Freeze selection roles must be median and challenging.');
  assert(freeze.selection?.expectedClassCount === 16, 'Freeze must require exactly 16 classes.');
  assert(/^[a-f0-9]{64}$/.test(freeze.referenceInventorySha256 ?? ''), 'Reference inventory hash is invalid.');
  assert(freeze.canonicalTarget === CANONICAL_V4_TARGET_RELATIVE, 'Freeze canonicalTarget is not the one fixed v4 canonical location.');
}

function validateUniformRecordTier(records, uniformTier, expectedClassCount = 16) {
  assert(records.length === expectedClassCount, `Frozen selection produced ${records.length}, not ${expectedClassCount} witnesses.`);
  assert(new Set(records.map((record) => record.variantId)).size === expectedClassCount, 'Frozen selection contains duplicate/missing classes.');
  const tiers = new Set(records.map((record) => `${record.basisCompilerVersion}/${record.basisFieldVersion}/${record.meshResolution}`));
  assert(tiers.size === 1, `Mixed generator/mesh tiers are forbidden: ${[...tiers].join(', ')}.`);
  const expectedTier = `${uniformTier.basisCompilerVersion}/${uniformTier.basisFieldVersion}/${uniformTier.meshResolution}`;
  assert([...tiers][0] === expectedTier, `Frozen records use tier ${[...tiers][0]}, expected ${expectedTier}.`);
}

function assertCanonicalFreezeCompatible(existingFreezeHash, suppliedFreezeHash) {
  assert(existingFreezeHash === suppliedFreezeHash, `Existing canonical packet is bound to ${existingFreezeHash}; supplied freeze is ${suppliedFreezeHash}. Refusing overwrite.`);
}

function expectRefusal(action, expectedMessage) {
  try {
    action();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `Expected refusal containing "${expectedMessage}", received "${error.message}".`);
    return error.message;
  }
  throw new Error(`Expected refusal containing "${expectedMessage}".`);
}

async function runStructuralSelfTest() {
  const uniformTier = { basisCompilerVersion: 4, basisFieldVersion: 4, meshResolution: 64 };
  const records = Array.from({ length: 16 }, (_, index) => ({
    variantId: `class-${String(index + 1).padStart(2, '0')}`,
    ...uniformTier,
  }));
  validateUniformRecordTier(records, uniformTier);
  const mixedRecords = records.map((record) => ({ ...record }));
  mixedRecords[9].basisFieldVersion = 3;
  const mixedTierRefusal = expectRefusal(
    () => validateUniformRecordTier(mixedRecords, uniformTier),
    'Mixed generator/mesh tiers are forbidden',
  );
  const canonicalMismatchRefusal = expectRefusal(
    () => assertCanonicalFreezeCompatible('a'.repeat(64), 'b'.repeat(64)),
    'Refusing overwrite',
  );
  const unfrozenRefusal = expectRefusal(
    () => validateFreezeShape({ schema: FREEZE_SCHEMA_ID, frozen: false }),
    'not frozen=true',
  );
  const report = {
    mode: 'self-test',
    passed: true,
    canonicalWrites: 0,
    renderWrites: 0,
    cases: {
      uniformSixteenClassTierAccepted: true,
      mixedTierRefused: mixedTierRefusal,
      differentCanonicalFreezeRefused: canonicalMismatchRefusal,
      unfrozenRecordRefused: unfrozenRefusal,
    },
  };
  await mkdir(WORK_DIRECTORY, { recursive: true });
  await writeFile(path.join(WORK_DIRECTORY, 'self-test-report.json'), stableJson(report));
  return report;
}

async function loadAndValidateFrozenSource() {
  assert(FREEZE_PATH_ARGUMENT, '--freeze is required for this mode.');
  assert(SUPPLIED_FREEZE_HASH, '--frozen-hash is required for this mode.');
  assert(SOURCE_FROZEN_ACK === AUTHORIZATION_PHRASE, `--source-frozen-ack must equal "${AUTHORIZATION_PHRASE}".`);
  const freezePath = path.resolve(FREEZE_PATH_ARGUMENT);
  const freezeBytes = await readFile(freezePath);
  const freezeSha256 = sha256(freezeBytes);
  assert(freezeSha256 === SUPPLIED_FREEZE_HASH, `Supplied frozen hash ${SUPPLIED_FREEZE_HASH} does not match freeze bytes ${freezeSha256}.`);
  const freeze = JSON.parse(freezeBytes);
  validateFreezeShape(freeze);

  const inventoryPath = path.join(WORK_DIRECTORY, 'reference-binding-inventory.json');
  const inventoryBytes = await readFile(inventoryPath);
  assert(sha256(inventoryBytes) === freeze.referenceInventorySha256, 'Reference inventory changed after source freeze.');
  const sourceRoot = path.resolve(freeze.sourceRoot);
  const heroIndexPath = path.resolve(freeze.heroIndex.path);
  const lineagePath = path.resolve(freeze.lineage.path);
  assert(heroIndexPath.startsWith(`${sourceRoot}${path.sep}`), 'Hero index is outside the frozen source root.');
  assert(lineagePath.startsWith(`${sourceRoot}${path.sep}`), 'Lineage is outside the frozen source root.');
  const [heroIndexBytes, lineageBytes] = await Promise.all([readFile(heroIndexPath), readFile(lineagePath)]);
  assert(sha256(heroIndexBytes) === freeze.heroIndex.sha256, 'Frozen hero index hash drifted.');
  assert(sha256(lineageBytes) === freeze.lineage.sha256, 'Frozen lineage hash drifted.');
  const heroIndex = JSON.parse(heroIndexBytes);
  const lineage = JSON.parse(lineageBytes);
  assert(lineage.sourceLineage?.aggregateSha256 === freeze.generatorSourceAggregateSha256, 'Lineage aggregate does not equal frozen generator aggregate.');

  const currentSourceEntries = [];
  for (const entry of lineage.sourceLineage?.files ?? []) {
    const bytes = await readFile(path.resolve(entry.path));
    const currentHash = sha256(bytes);
    assert(currentHash === entry.sha256, `Generator source drifted after freeze: ${entry.path}.`);
    currentSourceEntries.push({ path: entry.path, sha256: currentHash });
  }
  const currentAggregate = sha256(currentSourceEntries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''));
  assert(currentAggregate === freeze.generatorSourceAggregateSha256, 'Current generator source aggregate differs from the frozen aggregate.');

  const records = heroIndex
    .filter((record) => freeze.selection.roles.includes(record.heroRole))
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
  validateUniformRecordTier(records, freeze.uniformTier, freeze.selection.expectedClassCount);

  const boundRecords = [];
  for (const record of records) {
    const meshPath = path.join(sourceRoot, record.file);
    const programPath = path.join(sourceRoot, record.programFile);
    assert(meshPath.startsWith(`${sourceRoot}${path.sep}`), `Mesh escaped source root: ${record.file}.`);
    assert(programPath.startsWith(`${sourceRoot}${path.sep}`), `Program escaped source root: ${record.programFile}.`);
    const [meshBytes, programBytes] = await Promise.all([readFile(meshPath), readFile(programPath)]);
    assert(sha256(meshBytes) === record.meshObjSha256, `Frozen OBJ declaration mismatch: ${record.variantId}.`);
    assert(sha256(programBytes) === record.programSha256, `Frozen program declaration mismatch: ${record.variantId}.`);
    const program = JSON.parse(programBytes);
    assert(program.basisField?.version === freeze.uniformTier.basisFieldVersion, `Program field version mismatch: ${record.variantId}.`);
    assert(program.basisField?.fieldContentId === record.fieldContentId, `Program field content mismatch: ${record.variantId}.`);
    boundRecords.push({ record, meshPath, meshBytes, programPath, programBytes, program });
  }

  const canonicalTarget = path.resolve(freeze.canonicalTarget);
  assert(canonicalTarget === CANONICAL_V4_TARGET, 'Resolved canonical target differs from the fixed v4 canonical location.');
  assert(canonicalTarget.startsWith(`${NATURALNESS_DIRECTORY}${path.sep}`), 'Canonical target is outside the naturalness review directory.');
  assert(canonicalTarget !== NATURALNESS_DIRECTORY, 'Canonical target cannot overwrite the root naturalness packet.');
  if (await exists(canonicalTarget)) {
    const canonicalFreezePath = path.join(canonicalTarget, 'source-freeze.json');
    assert(await exists(canonicalFreezePath), 'Existing canonical target lacks source-freeze.json; refusing overwrite.');
    const canonicalFreezeHash = sha256(await readFile(canonicalFreezePath));
    assertCanonicalFreezeCompatible(canonicalFreezeHash, freezeSha256);
  }
  return {
    freeze,
    freezeBytes,
    freezeSha256,
    freezePath,
    sourceRoot,
    heroIndexBytes,
    lineageBytes,
    records: boundRecords,
    canonicalTarget,
    generatorFiles: currentSourceEntries,
  };
}

function parseBounds(obj) {
  const points = obj.split('\n')
    .filter((line) => line.startsWith('v '))
    .map((line) => line.slice(2).trim().split(/\s+/).map(Number));
  assert(points.length > 0, 'OBJ contains no vertices.');
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const radius = Math.max(...points.map((point) => Math.hypot(...point.map((value, axis) => value - center[axis]))), 1e-6);
  return { min, max, center, radius };
}

function morphologyBasis(program) {
  const radians = program.recipe.geologyTransform.strikeDegrees * Math.PI / 180;
  return {
    acrossStrike: [Math.cos(radians), 0, -Math.sin(radians)],
    strike: [Math.sin(radians), 0, Math.cos(radians)],
  };
}

async function startRenderServer() {
  const threeModulePath = path.resolve('node_modules/three/build/three.module.js');
  const threeCorePath = path.resolve('node_modules/three/build/three.core.js');
  const objLoaderPath = path.resolve('node_modules/three/examples/jsm/loaders/OBJLoader.js');
  const [three, core, loader] = await Promise.all([readFile(threeModulePath), readFile(threeCorePath), readFile(objLoaderPath)]);
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(renderShell(server.address().port));
    } else if (request.url === '/three.module.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(three);
    } else if (request.url === '/three.core.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(core);
    } else if (request.url === '/OBJLoader.js') {
      response.setHeader('Content-Type', 'text/javascript'); response.end(loader);
    } else {
      response.statusCode = 404; response.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    server,
    dependencies: {
      threeModuleSha256: sha256(three),
      threeCoreSha256: sha256(core),
      objLoaderSha256: sha256(loader),
    },
  };
}

function renderShell(port) {
  return String.raw`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#151b19}canvas{display:block}</style><script type="importmap">{"imports":{"three":"http://127.0.0.1:${port}/three.module.js"}}</script></head><body><script type="module">
import * as THREE from 'three';
import {OBJLoader} from 'http://127.0.0.1:${port}/OBJLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;document.body.append(renderer.domElement);
const loader=new OBJLoader();
function vec(local,basis){return new THREE.Vector3(local[0]*basis.strike[0]+local[2]*basis.acrossStrike[0],local[1],local[0]*basis.strike[2]+local[2]*basis.acrossStrike[2]);}
window.rendererInfo=()=>{const gl=renderer.getContext();const debug=gl.getExtension('WEBGL_debug_renderer_info');return {threeRevision:THREE.REVISION,webglVersion:gl.getParameter(gl.VERSION),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};};
window.renderWitness=async({obj,basis,bounds,view,policy})=>{const scene=new THREE.Scene();scene.background=new THREE.Color(policy.backgroundSrgbHex);const extent=bounds.radius*policy.framingRadiusMultiplier;const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,bounds.radius*.01,bounds.radius*20);const direction=vec(policy.directions[view],basis).normalize();camera.position.fromArray(bounds.center).addScaledVector(direction,bounds.radius*policy.cameraDistanceRadiusMultiplier);if(view==='top')camera.up.copy(vec([0,0,-1],basis).normalize());else if(view==='bottom')camera.up.copy(vec([0,0,1],basis).normalize());else camera.up.set(0,1,0);camera.lookAt(...bounds.center);
scene.add(new THREE.HemisphereLight(policy.lighting.hemisphere.sky,policy.lighting.hemisphere.ground,policy.lighting.hemisphere.intensity));
for(const id of ['key','fill','undersideFill']){const spec=policy.lighting[id],light=new THREE.DirectionalLight(spec.color,spec.intensity);light.position.fromArray(bounds.center).add(new THREE.Vector3(...spec.positionInRadii).multiplyScalar(bounds.radius));scene.add(light);}
const object=loader.parse(obj);const material=new THREE.MeshStandardMaterial({color:policy.material.colorSrgbHex,metalness:policy.material.metalness,roughness:policy.material.roughness});object.traverse(child=>{if(!child.isMesh)return;child.geometry.computeVertexNormals();child.material=material});scene.add(object);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
</script></body></html>`;
}

function pngTextChunks(bytes) {
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (['tEXt', 'zTXt', 'iTXt'].includes(type)) chunks.push(type);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  return chunks;
}

async function stageCaptures(context) {
  const stageDirectory = path.join(STAGING_DIRECTORY, context.freezeSha256);
  const pendingStageDirectory = `${stageDirectory}.pending`;
  assert(!await exists(stageDirectory), `Immutable staging directory already exists: ${stageDirectory}. Refusing overwrite.`);
  assert(!await exists(pendingStageDirectory), `Pending staging directory requires manual audit before retry: ${pendingStageDirectory}.`);
  await mkdir(STAGING_DIRECTORY, { recursive: true });
  await mkdir(pendingStageDirectory);
  await mkdir(path.join(pendingStageDirectory, 'captures'));
  await writeFile(path.join(pendingStageDirectory, 'source-freeze.json'), context.freezeBytes);
  const { server, dependencies } = await startRenderServer();
  const browser = await chromium.launch({ headless: true });
  const chromiumVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
  const outputRecords = [];
  let rendererInfo = null;
  try {
    for (const bound of context.records) {
      const obj = bound.meshBytes.toString('utf8');
      const captureFiles = [];
      for (const view of VIEWS) {
        await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.renderWitness === 'function');
        if (!rendererInfo) rendererInfo = await page.evaluate(() => window.rendererInfo());
        await page.evaluate((payload) => window.renderWitness(payload), {
          obj,
          basis: morphologyBasis(bound.program),
          bounds: parseBounds(obj),
          view,
          policy: CAPTURE_POLICY,
        });
        const filename = `${bound.record.variantId}--${view}.png`;
        const capturePath = path.join(pendingStageDirectory, 'captures', filename);
        await page.screenshot({ path: capturePath });
        const bytes = await readFile(capturePath);
        assert(bytes.subarray(1, 4).toString('ascii') === 'PNG', `${filename} is not PNG.`);
        assert(bytes.readUInt32BE(16) === 1024 && bytes.readUInt32BE(20) === 1024, `${filename} dimensions changed.`);
        assert(pngTextChunks(bytes).length === 0, `${filename} contains PNG text metadata.`);
        captureFiles.push({
          view,
          path: `captures/${filename}`,
          sha256: sha256(bytes),
          bytes: bytes.length,
          dimensionsPixels: [1024, 1024],
        });
      }
      outputRecords.push({
        classId: bound.record.variantId,
        familyId: bound.record.familyId,
        heroRole: bound.record.heroRole,
        recipeId: bound.record.recipeId,
        tier: {
          basisCompilerVersion: bound.record.basisCompilerVersion,
          basisFieldVersion: bound.record.basisFieldVersion,
          meshResolution: bound.record.meshResolution,
        },
        mesh: { path: path.relative(process.cwd(), bound.meshPath), sha256: sha256(bound.meshBytes) },
        program: { path: path.relative(process.cwd(), bound.programPath), sha256: sha256(bound.programBytes) },
        captures: captureFiles,
      });
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  assert(pageErrors.length === 0, `Renderer errors occurred: ${pageErrors.join(' | ')}`);
  const capturePolicyContentId = `sha256:${sha256(stableJson(CAPTURE_POLICY))}`;
  const manifest = {
    schema: 'toonlab-rock-geology-v2-naturalness-multiview-stage-v1',
    freezeSha256: context.freezeSha256,
    sourceId: context.freeze.sourceId,
    canonicalCommitted: false,
    capturePolicy: CAPTURE_POLICY,
    capturePolicyContentId,
    uniformTier: context.freeze.uniformTier,
    coverage: { classes: outputRecords.length, viewsPerClass: VIEWS.length, images: outputRecords.length * VIEWS.length },
    viewOrder: VIEWS,
    axisViews: AXIS_VIEWS,
    renderer: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      chromium: chromiumVersion,
      ...rendererInfo,
      dependencies,
      captureScriptSha256: sha256(await readFile(SCRIPT_PATH)),
    },
    generatorSourceAggregateSha256: context.freeze.generatorSourceAggregateSha256,
    records: outputRecords,
    pageErrors,
  };
  await writeFile(path.join(pendingStageDirectory, 'stage-manifest.json'), stableJson(manifest));
  const stageManifestSha256 = sha256(await readFile(path.join(pendingStageDirectory, 'stage-manifest.json')));
  assert(!await exists(stageDirectory), `Immutable stage appeared concurrently: ${stageDirectory}. Refusing overwrite.`);
  await rename(pendingStageDirectory, stageDirectory);
  return { stageDirectory, manifest, stageManifestSha256 };
}

async function verifyStage(context) {
  const stageDirectory = path.join(STAGING_DIRECTORY, context.freezeSha256);
  const manifestPath = path.join(stageDirectory, 'stage-manifest.json');
  assert(await exists(manifestPath), `No staged manifest for freeze ${context.freezeSha256}.`);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert(manifest.freezeSha256 === context.freezeSha256, 'Stage manifest freeze hash mismatch.');
  assert(manifest.generatorSourceAggregateSha256 === context.freeze.generatorSourceAggregateSha256, 'Stage generator aggregate mismatch.');
  assert(JSON.stringify(manifest.uniformTier) === JSON.stringify(context.freeze.uniformTier), 'Stage contains the wrong uniform tier.');
  assert(manifest.records.length === 16 && new Set(manifest.records.map((record) => record.classId)).size === 16, 'Stage does not contain exactly 16 classes.');
  assert(manifest.records.every((record) => JSON.stringify(record.captures.map((capture) => capture.view)) === JSON.stringify(VIEWS)), 'A staged witness lacks the exact seven-view order.');
  let filesChecked = 0;
  for (const record of manifest.records) {
    const frozen = context.records.find((entry) => entry.record.variantId === record.classId);
    assert(frozen, `Staged unknown class ${record.classId}.`);
    assert(record.mesh.sha256 === sha256(frozen.meshBytes), `Staged mesh hash mismatch: ${record.classId}.`);
    assert(record.program.sha256 === sha256(frozen.programBytes), `Staged program hash mismatch: ${record.classId}.`);
    for (const capture of record.captures) {
      const bytes = await readFile(path.join(stageDirectory, capture.path));
      assert(sha256(bytes) === capture.sha256, `Staged capture drift: ${record.classId}/${capture.view}.`);
      assert(bytes.readUInt32BE(16) === 1024 && bytes.readUInt32BE(20) === 1024, `Staged dimensions drift: ${record.classId}/${capture.view}.`);
      assert(pngTextChunks(bytes).length === 0, `Staged PNG metadata drift: ${record.classId}/${capture.view}.`);
      filesChecked += 1;
    }
  }
  assert(filesChecked === 112, `Expected 112 staged captures, checked ${filesChecked}.`);
  return { stageDirectory, manifest, stageManifestSha256: sha256(manifestBytes), filesChecked, passed: true };
}

async function commitCanonical(context) {
  const verified = await verifyStage(context);
  const target = context.canonicalTarget;
  if (await exists(target)) {
    const canonicalManifestBytes = await readFile(path.join(target, 'stage-manifest.json'));
    assert(sha256(canonicalManifestBytes) === verified.stageManifestSha256, 'Existing same-freeze canonical manifest differs; refusing overwrite.');
    for (const record of verified.manifest.records) for (const capture of record.captures) {
      const existing = await readFile(path.join(target, capture.path));
      assert(sha256(existing) === capture.sha256, `Existing canonical file differs: ${capture.path}.`);
    }
    const commitRecord = JSON.parse(await readFile(path.join(target, 'canonical-commit.json')));
    assert(commitRecord.freezeSha256 === context.freezeSha256 && commitRecord.stageManifestSha256 === verified.stageManifestSha256, 'Existing canonical commit record differs; refusing overwrite.');
    return { committed: true, idempotent: true, canonicalTarget: target, freezeSha256: context.freezeSha256 };
  }
  const pendingTarget = `${target}.pending-${context.freezeSha256.slice(0, 12)}`;
  assert(!await exists(pendingTarget), `Pending target already exists; manual audit required: ${pendingTarget}.`);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(verified.stageDirectory, pendingTarget, { recursive: true, errorOnExist: true, force: false });
  await writeFile(path.join(pendingTarget, 'canonical-commit.json'), stableJson({
    schema: 'toonlab-rock-geology-v2-naturalness-canonical-commit-v1',
    freezeSha256: context.freezeSha256,
    stageManifestSha256: verified.stageManifestSha256,
    canonicalTarget: path.relative(process.cwd(), target),
    immutable: true,
  }));
  assert(!await exists(target), `Canonical target appeared concurrently: ${target}. Refusing overwrite.`);
  await rename(pendingTarget, target);
  return { committed: true, idempotent: false, canonicalTarget: target, freezeSha256: context.freezeSha256 };
}

let result;
if (MODE === 'prepare') {
  result = await prepareSafeArtifacts();
} else if (MODE === 'self-test') {
  result = await runStructuralSelfTest();
} else {
  assert(['validate', 'stage', 'verify-stage', 'commit'].includes(MODE), `Unknown --mode ${MODE}.`);
  const context = await loadAndValidateFrozenSource();
  if (MODE === 'validate') {
    result = {
      mode: MODE,
      freezeSha256: context.freezeSha256,
      sourceId: context.freeze.sourceId,
      classes: context.records.length,
      uniformTier: context.freeze.uniformTier,
      generatorFiles: context.generatorFiles.length,
      canonicalTarget: context.canonicalTarget,
      canonicalWrite: false,
      passed: true,
    };
  } else if (MODE === 'stage') {
    result = { mode: MODE, canonicalWrite: false, ...await stageCaptures(context) };
  } else if (MODE === 'verify-stage') {
    result = { mode: MODE, canonicalWrite: false, ...await verifyStage(context) };
  } else {
    result = { mode: MODE, ...await commitCanonical(context) };
  }
}

console.log(stableJson(result));
