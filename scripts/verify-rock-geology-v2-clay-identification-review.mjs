#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { meshC8BasisFixture } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import { createC8BasisFixtures } from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';

const INSTRUMENT_ONLY = process.argv.includes('--instrument-only');
const CHECKPOINT_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families',
);
const OUTPUT_DIRECTORY = path.join(CHECKPOINT_DIRECTORY, 'clay-identification-review');
const PACKET_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-packet');
const ANSWER_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'adjudicator-only');
const SUBMISSION_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-submissions');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashMesh(mesh) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength));
  hash.update(Buffer.from(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength));
  return hash.digest('hex');
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function matrix(labels) {
  return Object.fromEntries(labels.map((actual) => [actual, Object.fromEntries(labels.map((predicted) => [predicted, 0]))]));
}

function pngTextChunks(bytes) {
  const types = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (['tEXt', 'zTXt', 'iTXt'].includes(type)) types.push(type);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  return types;
}

const failures = [];
let checks = 0;
function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
}

const [manifestBytes, answerKeyBytes] = await Promise.all([
  readFile(path.join(PACKET_DIRECTORY, 'manifest.json')),
  readFile(path.join(ANSWER_DIRECTORY, 'answer-key.json')),
]);
const manifest = JSON.parse(manifestBytes);
const answerKey = JSON.parse(answerKeyBytes);
const manifestHash = sha256(manifestBytes);
const protocol = manifest.protocol;
const classLabels = manifest.choices.map((choice) => choice.classId);
const answerBySample = new Map(answerKey.items.map((item) => [item.sampleId, item]));
const familyLabels = [...new Set(answerKey.items.map((item) => item.familyId))].sort();
const classToFamily = new Map(answerKey.items.map((item) => [item.classId, item.familyId]));

check(manifest.checkpoint === 8, 'CHECKPOINT_MISMATCH');
check(manifest.gatePassed === false, 'PREMATURE_MANIFEST_APPROVAL');
check(manifest.gateDisposition === 'pending-real-independent-reviewers', 'MANIFEST_NOT_FAIL_CLOSED');
check(answerKey.protocolId === protocol.protocolId, 'PROTOCOL_ID_MISMATCH');
check(answerKey.manifestSha256 === manifestHash, 'ANSWER_KEY_MANIFEST_HASH_MISMATCH');
const recomputedAnswerKeyCommitment = sha256(stableJson({
  protocolId: answerKey.protocolId,
  items: answerKey.items,
}));
check(answerKey.mappingCommitmentSha256 === recomputedAnswerKeyCommitment, 'ANSWER_KEY_SELF_COMMITMENT_MISMATCH');
check(manifest.answerKeyCommitment.sha256 === recomputedAnswerKeyCommitment, 'ANSWER_KEY_MANIFEST_COMMITMENT_MISMATCH');
check(manifest.items.length === 24, 'SAMPLE_COUNT_MISMATCH', { actual: manifest.items.length, expected: 24 });
check(classLabels.length === 16 && new Set(classLabels).size === 16, 'CLASS_CATALOG_COVERAGE_MISMATCH');
check(familyLabels.length === 8, 'FAMILY_COVERAGE_MISMATCH');
check(answerKey.items.length === manifest.items.length, 'ANSWER_KEY_ITEM_COUNT_MISMATCH');
check(Object.values(answerKey.familyCounts).every((count) => count === 3), 'FAMILY_SAMPLE_BALANCE_MISMATCH', answerKey.familyCounts);
check(Object.values(answerKey.classCounts).every((count) => count >= 1), 'INTENDED_CLASS_NOT_COVERED', answerKey.classCounts);
check(answerKey.items.filter((item) => item.heroRole === 'worst-passing').length === 8, 'WORST_PASSING_COVERAGE_MISMATCH');

let lineage = null;
let lineageBytes = null;
try {
  lineageBytes = await readFile(path.join(OUTPUT_DIRECTORY, 'current-v3-source/lineage.json'));
  lineage = JSON.parse(lineageBytes);
} catch (error) {
  check(false, 'CURRENT_V3_LINEAGE_MISSING_OR_UNREADABLE', { message: error.message });
}
check(lineage?.basisFieldVersion === 3, 'CURRENT_BASIS_VERSION_NOT_V3', { actual: lineage?.basisFieldVersion });
check(lineage?.basisCompilerVersion === 3, 'CURRENT_COMPILER_VERSION_NOT_V3', { actual: lineage?.basisCompilerVersion });
check(lineage?.standardizedMeshResolution === 64, 'CURRENT_MESH_RESOLUTION_NOT_64', { actual: lineage?.standardizedMeshResolution });
check(lineage?.recordCount === 24, 'CURRENT_LINEAGE_RECORD_COUNT_MISMATCH', { actual: lineage?.recordCount });
check(manifest.sourceLineage?.basisFieldVersion === 3, 'MANIFEST_BASIS_VERSION_NOT_V3');
check(manifest.sourceLineage?.basisCompilerVersion === 3, 'MANIFEST_COMPILER_VERSION_NOT_V3');
check(manifest.sourceLineage?.standardizedMeshResolution === 64, 'MANIFEST_MESH_RESOLUTION_NOT_64');
check(lineageBytes && manifest.sourceLineage?.lineageSha256 === sha256(lineageBytes), 'MANIFEST_LINEAGE_HASH_MISMATCH');
check(manifest.sourceLineage?.captureScriptPolicy === 'Every role renders the raw current compiled OBJ; the explicit no-bakes path prevents render-mesh-uv substitution.', 'NONUNIFORM_RENDER_SOURCE_POLICY');
if (lineage?.sourceLineage?.files) {
  const currentEntries = [];
  for (const entry of lineage.sourceLineage.files) {
    try {
      const currentHash = sha256(await readFile(path.resolve(entry.path)));
      check(currentHash === entry.sha256, 'GENERATOR_SOURCE_HASH_CHANGED', { path: entry.path, captured: entry.sha256, current: currentHash });
      currentEntries.push({ path: entry.path, sha256: currentHash });
    } catch (error) {
      check(false, 'GENERATOR_SOURCE_FILE_UNREADABLE', { path: entry.path, message: error.message });
    }
  }
  const aggregate = currentEntries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join('');
  const aggregateHash = sha256(aggregate);
  check(aggregateHash === lineage.sourceLineage.aggregateSha256, 'GENERATOR_SOURCE_AGGREGATE_CHANGED');
  check(aggregateHash === manifest.sourceLineage?.sourceTreeAggregateSha256, 'MANIFEST_SOURCE_AGGREGATE_MISMATCH');
  const currentHashByPath = new Map(currentEntries.map((entry) => [entry.path, entry.sha256]));
  check(currentHashByPath.get('src/rockgen/experimental/geology-v2/basis/field.node.js') === manifest.sourceLineage?.fieldSourceSha256, 'FIELD_SOURCE_HASH_MISMATCH');
  check(currentHashByPath.get('src/rockgen/experimental/geology-v2/basis/compiler.node.js') === manifest.sourceLineage?.compilerSourceSha256, 'COMPILER_SOURCE_HASH_MISMATCH');
  check(currentHashByPath.get('scripts/capture-rock-geology-v2-basis.mjs') === manifest.sourceLineage?.capturePipelineSha256, 'CAPTURE_PIPELINE_HASH_MISMATCH');
}

const predeclaredGatesBytes = await readFile(path.join(CHECKPOINT_DIRECTORY, 'predeclared-gates.json'));
const predeclaredGates = JSON.parse(predeclaredGatesBytes);
const sourceThresholdsByFamily = Object.fromEntries(predeclaredGates.families.map((family) => [family.id, family.threshold]));
check(manifest.protocol.predeclaredSuccessThreshold.sourceSha256 === sha256(predeclaredGatesBytes), 'PREDECLARED_GATE_HASH_MISMATCH');
check(JSON.stringify(manifest.protocol.predeclaredSuccessThreshold.thresholdsByFamily) === JSON.stringify(sourceThresholdsByFamily), 'PREDECLARED_THRESHOLD_VALUES_CHANGED');
check(Object.keys(sourceThresholdsByFamily).length === 8, 'PREDECLARED_THRESHOLD_FAMILY_COUNT_MISMATCH');
check(familyLabels.every((familyId) => Number.isFinite(sourceThresholdsByFamily[familyId])), 'PREDECLARED_THRESHOLD_MISSING');

const contactSheetBytes = await readFile(path.join(PACKET_DIRECTORY, manifest.blindContactSheet.path));
check(sha256(contactSheetBytes) === manifest.blindContactSheet.sha256, 'BLIND_CONTACT_SHEET_HASH_MISMATCH');
check(pngTextChunks(contactSheetBytes).length === 0, 'CONTACT_SHEET_TEXT_METADATA_LEAK', { chunks: pngTextChunks(contactSheetBytes) });

const opaqueIds = manifest.items.map((item) => item.sampleId);
check(opaqueIds.every((id, index) => id === `CLAY-${String(index + 1).padStart(2, '0')}`), 'OPAQUE_ID_SEQUENCE_INVALID');

for (const item of manifest.items) {
  const answer = answerBySample.get(item.sampleId);
  check(Boolean(answer), 'ANSWER_KEY_ITEM_MISSING', { sampleId: item.sampleId });
  check(item.image === `images/${item.sampleId}.png`, 'BLIND_IMAGE_NAME_NOT_OPAQUE', { item });
  const blindBytes = await readFile(path.join(PACKET_DIRECTORY, item.image));
  const sourceBytes = answer ? await readFile(path.join(CHECKPOINT_DIRECTORY, answer.sourceCapture)) : Buffer.alloc(0);
  check(sha256(blindBytes) === item.imageSha256, 'BLIND_IMAGE_HASH_MISMATCH', { sampleId: item.sampleId });
  check(answer?.imageSha256 === item.imageSha256, 'ANSWER_IMAGE_HASH_MISMATCH', { sampleId: item.sampleId });
  check(sha256(sourceBytes) === item.imageSha256, 'SOURCE_IMAGE_HASH_MISMATCH', { sampleId: item.sampleId });
  check(blindBytes.readUInt32BE(16) === item.dimensionsPixels[0]
    && blindBytes.readUInt32BE(20) === item.dimensionsPixels[1], 'IMAGE_DIMENSIONS_MISMATCH', { sampleId: item.sampleId });
  check(pngTextChunks(blindBytes).length === 0, 'PNG_TEXT_METADATA_LEAK', { sampleId: item.sampleId, chunks: pngTextChunks(blindBytes) });
}

const catalog = loadGeologyCatalog();
const currentFixtures = createC8BasisFixtures({ catalog });
const fixtureByRecipeId = new Map(
  Object.values(currentFixtures).flatMap((tiers) => tiers.hero).map((fixture) => [fixture.recipe.id, fixture]),
);
for (const answer of answerKey.items) {
  check(answer.basisFieldVersion === 3, 'ANSWER_BASIS_VERSION_NOT_V3', { sampleId: answer.sampleId, actual: answer.basisFieldVersion });
  check(answer.basisCompilerVersion === 3, 'ANSWER_COMPILER_VERSION_NOT_V3', { sampleId: answer.sampleId, actual: answer.basisCompilerVersion });
  check(answer.meshResolution === 64, 'ANSWER_MESH_RESOLUTION_NOT_64', { sampleId: answer.sampleId, actual: answer.meshResolution });
  const fixture = fixtureByRecipeId.get(answer.recipeId);
  check(Boolean(fixture), 'CURRENT_FIXTURE_NOT_FOUND', { recipeId: answer.recipeId });
  if (!fixture) continue;
  const compiled = meshC8BasisFixture(fixture, { catalog, includeSelfIntersections: true });
  check(compiled.stages.basisField.descriptor.version === 3, 'FRESH_COMPILE_BASIS_VERSION_NOT_V3', { recipeId: answer.recipeId });
  check(compiled.record.compiler.version === 3, 'FRESH_COMPILE_COMPILER_VERSION_NOT_V3', { recipeId: answer.recipeId });
  check(compiled.record.resolution === 64, 'FRESH_COMPILE_MESH_RESOLUTION_NOT_64', { recipeId: answer.recipeId, actual: compiled.record.resolution });
  check(compiled.record.meshContentId === answer.meshContentId, 'FRESH_COMPILE_MESH_CONTENT_ID_MISMATCH', { recipeId: answer.recipeId });
  check(compiled.stages.basisField.descriptor.fieldContentId === answer.fieldContentId, 'FRESH_COMPILE_FIELD_CONTENT_ID_MISMATCH', {
    recipeId: answer.recipeId,
    expected: answer.fieldContentId,
    current: compiled.stages.basisField.descriptor.fieldContentId,
  });
  check(hashMesh(compiled.mesh) === answer.meshContentSha256, 'FRESH_COMPILE_MESH_HASH_MISMATCH', {
    recipeId: answer.recipeId,
    expected: answer.meshContentSha256,
    current: hashMesh(compiled.mesh),
  });
  try {
    const [programBytes, meshBytes] = await Promise.all([
      readFile(path.join(CHECKPOINT_DIRECTORY, answer.sourceProgram)),
      readFile(path.join(CHECKPOINT_DIRECTORY, answer.sourceMesh)),
    ]);
    const program = JSON.parse(programBytes);
    check(sha256(programBytes) === answer.programSha256, 'BOUND_PROGRAM_HASH_MISMATCH', { recipeId: answer.recipeId });
    check(sha256(meshBytes) === answer.meshObjSha256, 'BOUND_OBJ_HASH_MISMATCH', { recipeId: answer.recipeId });
    check(program.basisField?.version === 3, 'BOUND_PROGRAM_BASIS_VERSION_NOT_V3', { recipeId: answer.recipeId });
    check(program.basisField?.fieldContentId === answer.fieldContentId, 'BOUND_PROGRAM_FIELD_CONTENT_ID_MISMATCH', { recipeId: answer.recipeId });
  } catch (error) {
    check(false, 'BOUND_CURRENT_SOURCE_UNREADABLE', { recipeId: answer.recipeId, message: error.message });
  }
}

const packetTextFiles = ['README.md', 'manifest.json', 'response-template.json', 'reviewer-worksheet.csv', 'review.html'];
const packetText = (await Promise.all(packetTextFiles.map((file) => readFile(path.join(PACKET_DIRECTORY, file), 'utf8')))).join('\n');
for (const answer of answerKey.items) {
  check(!packetText.includes(answer.recipeId), 'RECIPE_ID_LEAKED_TO_REVIEWER_PACKET', { recipeId: answer.recipeId });
  check(!packetText.includes(path.basename(answer.sourceCapture)), 'SOURCE_FILENAME_LEAKED_TO_REVIEWER_PACKET', { sourceCapture: answer.sourceCapture });
}

const responseFiles = (await readdir(SUBMISSION_DIRECTORY))
  .filter((file) => file.endsWith('.json'))
  .sort();
const responses = [];
for (const filename of responseFiles) {
  try {
    const response = JSON.parse(await readFile(path.join(SUBMISSION_DIRECTORY, filename), 'utf8'));
    const localFailures = [];
    const localCheck = (condition, code) => { if (!condition) localFailures.push(code); };
    localCheck(response.protocolId === protocol.protocolId, 'PROTOCOL_ID_MISMATCH');
    localCheck(response.manifestSha256 === manifestHash, 'MANIFEST_HASH_MISMATCH');
    localCheck(typeof response.reviewer?.reviewerId === 'string' && response.reviewer.reviewerId.trim().length > 0, 'REVIEWER_ID_MISSING');
    localCheck(protocol.reviewers.allowedQualificationValues.includes(response.reviewer?.qualification), 'QUALIFICATION_INVALID');
    localCheck(response.reviewer?.independenceAttestation === true, 'INDEPENDENCE_ATTESTATION_MISSING');
    localCheck(response.reviewer?.answerKeyNotAccessedAttestation === true, 'ANSWER_KEY_ATTESTATION_MISSING');
    localCheck(typeof response.startedAt === 'string' && !Number.isNaN(Date.parse(response.startedAt)), 'STARTED_AT_INVALID');
    localCheck(typeof response.completedAt === 'string' && !Number.isNaN(Date.parse(response.completedAt)), 'COMPLETED_AT_INVALID');
    localCheck(Array.isArray(response.answers) && response.answers.length === manifest.items.length, 'ANSWER_COUNT_MISMATCH');
    const answers = Array.isArray(response.answers) ? response.answers : [];
    localCheck(new Set(answers.map((answer) => answer.sampleId)).size === manifest.items.length, 'DUPLICATE_OR_MISSING_SAMPLE');
    for (const answer of answers) {
      localCheck(answerBySample.has(answer.sampleId), 'UNKNOWN_SAMPLE_ID');
      localCheck(answer.unidentifiable === true
        ? answer.selectedClassId === ''
        : classLabels.includes(answer.selectedClassId), 'CLASS_CHOICE_INVALID');
      localCheck(Number.isInteger(answer.confidence1To5)
        && answer.confidence1To5 >= 1
        && answer.confidence1To5 <= 5, 'CONFIDENCE_INVALID');
      localCheck(Array.isArray(answer.defectTags), 'DEFECT_TAGS_INVALID');
      localCheck(typeof answer.notes === 'string', 'NOTES_INVALID');
    }
    check(localFailures.length === 0, 'REVIEWER_RESPONSE_INVALID', { filename, failures: localFailures });
    if (localFailures.length === 0) responses.push({ filename, ...response });
  } catch (error) {
    check(false, 'REVIEWER_RESPONSE_UNREADABLE', { filename, message: error.message });
  }
}

const reviewerIds = responses.map((response) => response.reviewer.reviewerId.trim());
check(new Set(reviewerIds).size === reviewerIds.length, 'DUPLICATE_REVIEWER_ID', { reviewerIds });

const classConfusion = matrix(classLabels);
const familyConfusion = matrix(familyLabels);
let correctClass = 0;
let correctFamily = 0;
let unidentifiable = 0;
let worstPassingFamilyCorrect = 0;
let worstPassingTotal = 0;
const familyActualTotals = Object.fromEntries(familyLabels.map((label) => [label, 0]));
const familyCorrectTotals = Object.fromEntries(familyLabels.map((label) => [label, 0]));
const classCorrectTotalsByFamily = Object.fromEntries(familyLabels.map((label) => [label, 0]));
for (const response of responses) for (const answer of response.answers) {
  const expected = answerBySample.get(answer.sampleId);
  const predictedClass = answer.unidentifiable ? null : answer.selectedClassId;
  const predictedFamily = predictedClass ? classToFamily.get(predictedClass) : null;
  if (predictedClass) classConfusion[expected.classId][predictedClass] += 1;
  if (predictedFamily) familyConfusion[expected.familyId][predictedFamily] += 1;
  if (predictedClass === expected.classId) {
    correctClass += 1;
    classCorrectTotalsByFamily[expected.familyId] += 1;
  }
  if (predictedFamily === expected.familyId) {
    correctFamily += 1;
    familyCorrectTotals[expected.familyId] += 1;
  }
  familyActualTotals[expected.familyId] += 1;
  if (answer.unidentifiable) unidentifiable += 1;
  if (expected.heroRole === 'worst-passing') {
    worstPassingTotal += 1;
    if (predictedFamily === expected.familyId) worstPassingFamilyCorrect += 1;
  }
}

const totalAnswers = responses.length * manifest.items.length;
const score = {
  aggregateClassAccuracy: totalAnswers ? round(correctClass / totalAnswers) : null,
  aggregateFamilyAccuracy: totalAnswers ? round(correctFamily / totalAnswers) : null,
  perFamilyClassRecall: Object.fromEntries(familyLabels.map((familyId) => [
    familyId,
    familyActualTotals[familyId] ? round(classCorrectTotalsByFamily[familyId] / familyActualTotals[familyId]) : null,
  ])),
  perFamilyRecall: Object.fromEntries(familyLabels.map((familyId) => [
    familyId,
    familyActualTotals[familyId] ? round(familyCorrectTotals[familyId] / familyActualTotals[familyId]) : null,
  ])),
  unidentifiableRate: totalAnswers ? round(unidentifiable / totalAnswers) : null,
  worstPassingFamilyAccuracy: worstPassingTotal ? round(worstPassingFamilyCorrect / worstPassingTotal) : null,
};

const qualifiedReviewerCount = responses.filter((response) => (
  protocol.reviewers.geologyQualifiedValues.includes(response.reviewer.qualification)
)).length;
const reviewerCoveragePassed = responses.length >= protocol.reviewers.minimumCompleteIndependentReviewers
  && qualifiedReviewerCount >= protocol.reviewers.minimumGeologyQualifiedReviewers
  && new Set(reviewerIds).size === responses.length;
const accuracyPassed = totalAnswers > 0
  && Object.entries(sourceThresholdsByFamily).every(([familyId, threshold]) => (
    score.perFamilyClassRecall[familyId] >= threshold
  ));
const instrumentFailures = failures.filter((failure) => ![
  'REVIEWER_RESPONSE_INVALID',
  'REVIEWER_RESPONSE_UNREADABLE',
  'DUPLICATE_REVIEWER_ID',
].includes(failure.code));
const instrumentPassed = instrumentFailures.length === 0;
const gatePassed = instrumentPassed
  && failures.length === 0
  && reviewerCoveragePassed
  && accuracyPassed;
const status = gatePassed
  ? 'passed'
  : !instrumentPassed
    ? 'stale-or-unbound-generator-lineage'
    : responses.length === 0
    ? 'pending-reviewer-submissions'
    : !reviewerCoveragePassed
      ? 'insufficient-valid-reviewer-coverage'
      : 'failed-predeclared-accuracy-thresholds';

const confusion = {
  protocolId: protocol.protocolId,
  manifestSha256: manifestHash,
  reviewerCount: responses.length,
  qualifiedReviewerCount,
  classLabels,
  familyLabels,
  classConfusion,
  familyConfusion,
  score,
};
await writeFile(path.join(OUTPUT_DIRECTORY, 'confusion-matrix.json'), `${JSON.stringify(confusion, null, 2)}\n`);

const verification = {
  checkpoint: 8,
  checks,
  failures,
  gatePassed,
  instrumentPassed,
  manifestSha256: manifestHash,
  protocolId: protocol.protocolId,
  reviewerCoverage: {
    validCompleteReviewers: responses.length,
    qualifiedReviewers: qualifiedReviewerCount,
    requiredCompleteReviewers: protocol.reviewers.minimumCompleteIndependentReviewers,
    requiredQualifiedReviewers: protocol.reviewers.minimumGeologyQualifiedReviewers,
    passed: reviewerCoveragePassed,
  },
  score,
  status,
  thresholdBinding: {
    primaryMetric: protocol.predeclaredSuccessThreshold.primaryMetric,
    sourcePath: protocol.predeclaredSuccessThreshold.sourcePath,
    sourceSha256: sha256(predeclaredGatesBytes),
    thresholdsByFamily: sourceThresholdsByFamily,
    valuesUsedUnchanged: true,
  },
  nextAction: gatePassed
    ? 'Record explicit developer/geology approval without changing the immutable response set.'
    : !instrumentPassed
      ? 'Run `node scripts/regenerate-rock-geology-v2-clay-identification-review.mjs` to compile, uniformly raw-render, prepare, and bind all 24 cases from the active source tree; then rerun this verifier.'
      : 'Obtain real independent locked responses from at least three reviewers, including two geology-qualified reviewers, then rerun this verifier.',
  rerenderCommand: 'node scripts/regenerate-rock-geology-v2-clay-identification-review.mjs',
};
await writeFile(path.join(OUTPUT_DIRECTORY, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`);

console.log(JSON.stringify({
  checks,
  failures: failures.length,
  gatePassed,
  instrumentPassed,
  qualifiedReviewers: qualifiedReviewerCount,
  reviewers: responses.length,
  status,
  predeclaredGatesSha256: sha256(predeclaredGatesBytes),
  verification: path.relative(process.cwd(), path.join(OUTPUT_DIRECTORY, 'verification.json')),
}, null, 2));

if (INSTRUMENT_ONLY) process.exitCode = instrumentPassed ? 0 : 1;
else process.exitCode = gatePassed ? 0 : 2;
