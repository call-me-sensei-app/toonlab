#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const WORK_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/geology-naturalness-review/multiview-capture',
);
const FILES = {
  inventory: path.join(WORK_DIRECTORY, 'reference-binding-inventory.json'),
  schema: path.join(WORK_DIRECTORY, 'freeze-contract.schema.json'),
  template: path.join(WORK_DIRECTORY, 'source-freeze-template.json'),
  preparation: path.join(WORK_DIRECTORY, 'preparation-report.json'),
  selfTest: path.join(WORK_DIRECTORY, 'self-test-report.json'),
  readme: path.join(WORK_DIRECTORY, 'README.md'),
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const failures = [];
let checks = 0;
function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
}

const bytes = Object.fromEntries(await Promise.all(Object.entries(FILES).map(async ([key, file]) => [key, await readFile(file)])));
const inventory = JSON.parse(bytes.inventory);
const schema = JSON.parse(bytes.schema);
const template = JSON.parse(bytes.template);
const preparation = JSON.parse(bytes.preparation);
const selfTest = JSON.parse(bytes.selfTest);
const readme = bytes.readme.toString('utf8');

check(inventory.schema === 'toonlab-rock-geology-v2-naturalness-reference-inventory-v1', 'INVENTORY_SCHEMA_MISMATCH');
check(inventory.packageCount === 100 && inventory.allPackages.length === 100, 'REFERENCE_PACKAGE_COUNT_MISMATCH');
check(JSON.stringify(inventory.packageGroupCounts) === JSON.stringify({ clasts: 21, cliffs: 23, forms: 35, residuals: 21 }), 'REFERENCE_GROUP_COUNTS_MISMATCH', inventory.packageGroupCounts);
check(inventory.targetClassCount === 5 && inventory.targets.length === 5, 'TARGET_CLASS_COUNT_MISMATCH');
check(JSON.stringify(inventory.resolvedExactNatureImages) === JSON.stringify(['volcanic-breccia-outcrop']), 'EXACT_BINDING_INVENTORY_CHANGED', inventory.resolvedExactNatureImages);
check(JSON.stringify(inventory.unresolvedClasses) === JSON.stringify(['basalt-entablature', 'shale-slope', 'slate-outcrop', 'schist-outcrop']), 'UNRESOLVED_BINDING_INVENTORY_CHANGED', inventory.unresolvedClasses);
check(inventory.targets.every((target) => target.canonicalBindingAuthorized === false), 'PREMATURE_REFERENCE_REBIND_AUTHORIZATION');

const packagePaths = inventory.allPackages.map((entry) => entry.package);
check(new Set(packagePaths).size === 100, 'REFERENCE_PACKAGE_DUPLICATE');
check(JSON.stringify(packagePaths) === JSON.stringify([...packagePaths].sort()), 'REFERENCE_PACKAGE_ORDER_NOT_DETERMINISTIC');
for (const entry of inventory.allPackages) {
  try {
    const [sourceBytes, natureBytes] = await Promise.all([
      readFile(path.resolve(entry.sourceRecord.path)),
      readFile(path.resolve(entry.exactNatureImage.path)),
    ]);
    check(sha256(sourceBytes) === entry.sourceRecord.sha256, 'REFERENCE_SOURCE_HASH_DRIFT', { package: entry.package });
    check(sha256(natureBytes) === entry.exactNatureImage.sha256, 'NATURE_IMAGE_HASH_DRIFT', { package: entry.package });
    check(entry.exactNatureImage.declaredHashMatches === true && entry.exactNatureImage.declaredSha256 === entry.exactNatureImage.sha256, 'NATURE_DECLARED_HASH_MISMATCH', { package: entry.package });
    check(typeof entry.exactNatureImage.stablePageUrl === 'string' && entry.exactNatureImage.stablePageUrl.startsWith('http'), 'NATURE_STABLE_PAGE_MISSING', { package: entry.package });
  } catch (error) {
    check(false, 'REFERENCE_PACKAGE_UNREADABLE', { package: entry.package, message: error.message });
  }
}

const volcanicTarget = inventory.targets.find((target) => target.classId === 'volcanic-breccia-outcrop');
check(volcanicTarget?.verdict === 'exact-nature-image-found', 'VOLCANIC_BRECCIA_NOT_RESOLVED');
check(volcanicTarget?.exactPackage === 'clasts/shard-splintery', 'VOLCANIC_BRECCIA_SOURCE_PACKAGE_CHANGED');
check(volcanicTarget?.reason.includes('source photograph/provenance') && volcanicTarget?.reason.includes('generated shard six-view') && volcanicTarget?.reason.includes('not valid outcrop evidence'), 'VOLCANIC_BRECCIA_EVIDENCE_BOUNDARY_MISSING');
for (const classId of inventory.unresolvedClasses) {
  const target = inventory.targets.find((entry) => entry.classId === classId);
  check(target?.verdict === 'unresolved' && target?.exactPackage === null, 'UNRESOLVED_CLASS_APPROXIMATED', { classId });
}

check(schema.$id === 'toonlab-rock-geology-v2-naturalness-source-freeze-v1.schema.json', 'FREEZE_SCHEMA_ID_MISMATCH');
check(schema.properties?.frozen?.const === true, 'FREEZE_TRUE_NOT_REQUIRED');
check(schema.properties?.selection?.properties?.expectedClassCount?.const === 16, 'FREEZE_16_CLASS_COVERAGE_NOT_REQUIRED');
check(JSON.stringify(schema.properties?.selection?.properties?.roles?.const) === JSON.stringify(['median', 'challenging']), 'FREEZE_UNIFORM_ROLE_SELECTION_CHANGED');
check(schema.required.includes('generatorSourceAggregateSha256') && schema.required.includes('uniformTier') && schema.required.includes('referenceInventorySha256'), 'FREEZE_REQUIRED_BINDING_MISSING');
check(schema.properties?.canonicalTarget?.const === 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/geology-naturalness-review/current-v4-source', 'CANONICAL_TARGET_NOT_SCHEMA_FIXED');
check(template.frozen === false, 'TEMPLATE_PRETENDS_SOURCE_IS_FROZEN');
check(template.heroIndex.sha256 === null && template.lineage.sha256 === null && template.generatorSourceAggregateSha256 === null, 'TEMPLATE_FABRICATES_FROZEN_HASHES');
check(template.referenceInventorySha256 === sha256(bytes.inventory), 'TEMPLATE_INVENTORY_HASH_MISMATCH');
check(template.canonicalTarget.endsWith('/geology-naturalness-review/current-v4-source'), 'TEMPLATE_CANONICAL_TARGET_CHANGED');

check(preparation.mode === 'prepare' && preparation.safeBeforeSourceFreeze === true, 'PREPARATION_NOT_SAFE');
check(preparation.canonicalWrites === 0 && preparation.sourceFreezeReceived === false, 'PREPARATION_CLAIMS_CANONICAL_WRITE_OR_FREEZE');
check(preparation.referencePackagesInventoried === 100, 'PREPARATION_PACKAGE_COUNT_MISMATCH');
check(preparation.referenceInventorySha256 === sha256(bytes.inventory), 'PREPARATION_INVENTORY_HASH_MISMATCH');
check(preparation.freezeSchemaSha256 === sha256(bytes.schema), 'PREPARATION_SCHEMA_HASH_MISMATCH');
check(selfTest.mode === 'self-test' && selfTest.passed === true, 'STRUCTURAL_SELF_TEST_FAILED');
check(selfTest.canonicalWrites === 0 && selfTest.renderWrites === 0, 'SELF_TEST_MUTATED_RENDER_OR_CANONICAL_STATE');
check(selfTest.cases.uniformSixteenClassTierAccepted === true, 'UNIFORM_TIER_SELF_TEST_MISSING');
check(selfTest.cases.mixedTierRefused.includes('Mixed generator/mesh tiers are forbidden'), 'MIXED_TIER_REFUSAL_SELF_TEST_MISSING');
check(selfTest.cases.differentCanonicalFreezeRefused.includes('Refusing overwrite'), 'CANONICAL_HASH_REFUSAL_SELF_TEST_MISSING');
check(selfTest.cases.unfrozenRecordRefused.includes('not frozen=true'), 'UNFROZEN_REFUSAL_SELF_TEST_MISSING');
check(readme.includes('seven-view') && readme.includes('front, rear, left, right, top, bottom-support, and three-quarter'), 'README_VIEW_CONTRACT_MISSING');
check(readme.includes('never writes the root naturalness packet') && readme.includes('refuses a different existing freeze hash'), 'README_FAIL_CLOSED_BOUNDARY_MISSING');

const verification = {
  schema: 'toonlab-rock-geology-v2-naturalness-multiview-preparation-verification-v1',
  checks,
  passed: failures.length === 0,
  failures,
  canonicalWrites: 0,
  renderWrites: 0,
  sourceFreezeReceived: false,
  referenceInventorySha256: sha256(bytes.inventory),
  freezeSchemaSha256: sha256(bytes.schema),
  exactExistingNatureBindingFound: inventory.resolvedExactNatureImages,
  unresolvedNatureBindings: inventory.unresolvedClasses,
  disposition: failures.length === 0
    ? 'preparation-verified-waiting-for-source-freeze'
    : 'preparation-integrity-failed',
};
await writeFile(path.join(WORK_DIRECTORY, 'verification.json'), stableJson(verification));
console.log(stableJson(verification));
if (failures.length > 0) process.exitCode = 2;
