#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const INSTRUMENT_ONLY = process.argv.includes('--instrument-only');
const OUTPUT_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/geology-naturalness-review',
);
const PACKET_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-packet');
const SUBMISSION_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-submissions');
const REQUIRED_VIEWS = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const SCORED_DIMENSIONS = [
  'naturalSilhouette',
  'macroFabric',
  'processPlausibility',
  'supportStability',
  'topBottomPlausibility',
  'forbiddenDriftAbsence',
  'natureReferenceCorrespondence',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const integrityFailures = [];
const gateBlockers = [];
let checks = 0;
function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) integrityFailures.push({ code, details });
}

const files = {
  manifest: path.join(OUTPUT_DIRECTORY, 'evidence-manifest.json'),
  protocol: path.join(OUTPUT_DIRECTORY, 'protocol.json'),
  schema: path.join(OUTPUT_DIRECTORY, 'review-schema.json'),
  rubric: path.join(OUTPUT_DIRECTORY, 'rubric.md'),
  queue: path.join(OUTPUT_DIRECTORY, 'queue.json'),
  approval: path.join(OUTPUT_DIRECTORY, 'developer-approval.json'),
  template: path.join(PACKET_DIRECTORY, 'response-template.json'),
};
const bytes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file)])));
const manifest = JSON.parse(bytes.manifest);
const protocol = JSON.parse(bytes.protocol);
const schema = JSON.parse(bytes.schema);
const queue = JSON.parse(bytes.queue);
const approval = JSON.parse(bytes.approval);
const template = JSON.parse(bytes.template);
const manifestSha256 = sha256(bytes.manifest);

check(manifest.checkpoint === 8, 'CHECKPOINT_MISMATCH');
check(manifest.protocolId === protocol.protocolId, 'PROTOCOL_ID_MISMATCH');
check(protocol.stage === 'geology-naturalness-after-blind-class-identification', 'REVIEW_STAGE_NOT_SEPARATE');
check(protocol.separationFromIdentificationGate?.separate === true, 'IDENTIFICATION_GATE_CONFLATED');
check(protocol.separationFromIdentificationGate?.noSubstitution?.includes('cannot compensate'), 'GATE_NON_SUBSTITUTION_MISSING');
check(manifest.instrumentIntegrityReady === true, 'INSTRUMENT_NOT_MARKED_READY');
check(manifest.distributionAuthorized === (manifest.readiness.blockedClasses === 0), 'MANIFEST_DISTRIBUTION_STATUS_INCORRECT');
check(manifest.reviewGatePassed === false, 'PREMATURE_REVIEW_GATE_PASS');
check(manifest.protocol.sha256 === sha256(bytes.protocol), 'PROTOCOL_HASH_MISMATCH');
check(manifest.reviewSchema.sha256 === sha256(bytes.schema), 'SCHEMA_HASH_MISMATCH');
check(manifest.rubric.sha256 === sha256(bytes.rubric), 'RUBRIC_HASH_MISMATCH');
check(JSON.stringify(protocol.requiredViews) === JSON.stringify(REQUIRED_VIEWS), 'REQUIRED_VIEW_CONTRACT_MISMATCH');
check(JSON.stringify(protocol.scoredDimensions) === JSON.stringify(SCORED_DIMENSIONS), 'SCORED_DIMENSION_CONTRACT_MISMATCH');
check(protocol.reviewerRequirements.minimumIndependentReviewers >= 3, 'REVIEWER_QUORUM_TOO_SMALL');
check(protocol.reviewerRequirements.minimumQualifiedReviewers >= 3, 'QUALIFIED_REVIEWER_QUORUM_TOO_SMALL');
check(protocol.reviewerRequirements.minimumFieldGeologyReviewers >= 1, 'FIELD_GEOLOGY_COVERAGE_MISSING');
check(protocol.reviewerRequirements.minimumGeomorphologyOrProcessReviewers >= 1, 'PROCESS_EXPERT_COVERAGE_MISSING');
check(protocol.passThresholds.developerApprovalRequiredAfterReviewerPass === true, 'DEVELOPER_APPROVAL_NOT_REQUIRED');
check(protocol.passThresholds.everyClassMustPass === true, 'ALL_CLASS_PASS_NOT_REQUIRED');
check(protocol.passThresholds.perClassPerDimensionMedianMinimum === 4, 'DIMENSION_THRESHOLD_CHANGED');
check(protocol.passThresholds.perClassOverallMeanMinimum === 4.1, 'OVERALL_THRESHOLD_CHANGED');
check(protocol.passThresholds.individualScoreFloor === 3, 'INDIVIDUAL_SCORE_FLOOR_CHANGED');
check(protocol.passThresholds.unresolvedCriticalDefectsAllowed === 0, 'CRITICAL_DEFECTS_ALLOWED');
check(schema.properties?.classReviews?.minItems === 16 && schema.properties?.classReviews?.maxItems === 16, 'SCHEMA_CLASS_COUNT_NOT_EXACT');
check(SCORED_DIMENSIONS.every((dimension) => schema.properties.classReviews.items.properties.scores.required.includes(dimension)), 'SCHEMA_DIMENSION_MISSING');
check(manifest.coverage.families === 8, 'FAMILY_COVERAGE_MISMATCH', manifest.coverage);
check(manifest.coverage.classes === 16 && manifest.coverage.currentWitnesses === 16, 'CLASS_COVERAGE_MISMATCH', manifest.coverage);
check(manifest.evidence.length === 16 && new Set(manifest.evidence.map((record) => record.classId)).size === 16, 'EVIDENCE_CLASS_UNIQUENESS_MISMATCH');
check(new Set(manifest.evidence.map((record) => record.evidenceId)).size === 16, 'EVIDENCE_ID_UNIQUENESS_MISMATCH');

for (const source of [manifest.sourceSnapshot.heroIndex, manifest.sourceSnapshot.lineage]) {
  try {
    const current = await readFile(path.resolve(source.path));
    check(sha256(current) === source.sha256, 'SOURCE_SNAPSHOT_HASH_DRIFT', { path: source.path });
  } catch (error) {
    check(false, 'SOURCE_SNAPSHOT_UNREADABLE', { path: source.path, message: error.message });
  }
}

const derivedQueue = [];
for (const record of manifest.evidence) {
  const blockerSet = new Set(record.blockers);
  check(record.currentWitness.requiredViews.join(',') === REQUIRED_VIEWS.join(','), 'RECORD_VIEW_CONTRACT_MISMATCH', { evidenceId: record.evidenceId });
  check(record.currentWitness.mesh.sha256 === record.currentWitness.mesh.declaredSha256, 'BOUND_MESH_DECLARATION_MISMATCH', { evidenceId: record.evidenceId });
  check(record.currentWitness.program.sha256 === record.currentWitness.program.declaredSha256, 'BOUND_PROGRAM_DECLARATION_MISMATCH', { evidenceId: record.evidenceId });
  for (const bound of [record.currentWitness.mesh, record.currentWitness.program, ...record.currentWitness.captures]) {
    try {
      const current = await readFile(path.resolve(bound.path));
      check(sha256(current) === bound.sha256, 'BOUND_CURRENT_WITNESS_HASH_DRIFT', { evidenceId: record.evidenceId, path: bound.path });
    } catch (error) {
      check(false, 'BOUND_CURRENT_WITNESS_UNREADABLE', { evidenceId: record.evidenceId, path: bound.path, message: error.message });
    }
  }
  const captureViews = new Set(record.currentWitness.captures.map((capture) => capture.view));
  const actualMissingViews = REQUIRED_VIEWS.filter((view) => !captureViews.has(view));
  check(JSON.stringify(actualMissingViews) === JSON.stringify(record.currentWitness.missingViews), 'MISSING_VIEW_LIST_INCORRECT', { evidenceId: record.evidenceId, actualMissingViews });
  check(actualMissingViews.length === 0 || [...blockerSet].some((blocker) => blocker.startsWith('missing-current-views:')), 'MISSING_VIEW_NOT_QUEUED', { evidenceId: record.evidenceId });
  check(record.natureReferenceBinding.references.length >= 1, 'NATURE_REFERENCE_ABSENT', { evidenceId: record.evidenceId });
  for (const reference of record.natureReferenceBinding.references) {
    for (const bound of [reference.sourceRecord, reference.exactNatureImage, reference.generatedSixViewHypothesis]) {
      try {
        const current = await readFile(path.resolve(bound.path));
        check(sha256(current) === bound.sha256, 'BOUND_REFERENCE_HASH_DRIFT', { evidenceId: record.evidenceId, path: bound.path });
      } catch (error) {
        check(false, 'BOUND_REFERENCE_UNREADABLE', { evidenceId: record.evidenceId, path: bound.path, message: error.message });
      }
    }
    check(reference.exactNatureImage.declaredHashMatches === true, 'DECLARED_NATURE_HASH_MISMATCH', { evidenceId: record.evidenceId, package: reference.package });
    check(reference.exactNatureImage.declaredSha256 === reference.exactNatureImage.sha256, 'NATURE_HASH_DECLARATION_INCORRECT', { evidenceId: record.evidenceId, package: reference.package });
    check(typeof reference.exactNatureImage.stablePageUrl === 'string' && reference.exactNatureImage.stablePageUrl.startsWith('http'), 'NATURE_STABLE_PAGE_MISSING', { evidenceId: record.evidenceId, package: reference.package });
    check(reference.generatedSixViewHypothesis.geologyEvidence === false, 'GENERATED_VIEW_MISREPRESENTED_AS_GEOLOGY', { evidenceId: record.evidenceId, package: reference.package });
  }
  check(record.natureReferenceBinding.reviewReady === (record.natureReferenceBinding.correspondence === 'exact'), 'REFERENCE_READINESS_INCORRECT', { evidenceId: record.evidenceId });
  check(record.reviewReady === (record.blockers.length === 0), 'RECORD_READINESS_INCORRECT', { evidenceId: record.evidenceId });
  if (record.blockers.length > 0) derivedQueue.push(record.evidenceId);
}
check(queue.evidenceManifestSha256 === manifestSha256, 'QUEUE_MANIFEST_HASH_MISMATCH');
check(template.evidenceManifestSha256 === manifestSha256, 'TEMPLATE_MANIFEST_HASH_MISMATCH');
check(approval.evidenceManifestSha256 === manifestSha256, 'APPROVAL_MANIFEST_HASH_MISMATCH');
check(queue.itemCount === queue.items.length, 'QUEUE_ITEM_COUNT_MISMATCH');
check(JSON.stringify(queue.items.map((item) => item.evidenceId)) === JSON.stringify(derivedQueue), 'QUEUE_DERIVATION_MISMATCH');
check(queue.distributionAuthorized === (derivedQueue.length === 0), 'QUEUE_DISTRIBUTION_STATUS_INCORRECT');
check(template.classReviews.length === 16, 'RESPONSE_TEMPLATE_CLASS_COUNT_MISMATCH');
check(template.classReviews.every((review) => SCORED_DIMENSIONS.every((dimension) => review.scores[dimension] === null)), 'RESPONSE_TEMPLATE_FABRICATES_SCORES');
check(approval.protocolId === protocol.protocolId, 'APPROVAL_PROTOCOL_ID_MISMATCH');
check(approval.approved === true || approval.approved === false, 'APPROVAL_BOOLEAN_INVALID');
check(approval.approved === true || approval.adjudicationSha256 === null, 'PENDING_APPROVAL_HAS_ADJUDICATION_HASH');

if (derivedQueue.length > 0) gateBlockers.push({ code: 'EVIDENCE_PREPARATION_QUEUE_NOT_EMPTY', count: derivedQueue.length });

const submissionFiles = (await readdir(SUBMISSION_DIRECTORY))
  .filter((file) => file.endsWith('.json'))
  .sort();
const validSubmissions = [];
for (const filename of submissionFiles) {
  try {
    const submission = JSON.parse(await readFile(path.join(SUBMISSION_DIRECTORY, filename)));
    const localFailures = [];
    const localCheck = (condition, code) => { if (!condition) localFailures.push(code); };
    localCheck(submission.protocolId === protocol.protocolId, 'PROTOCOL_ID_MISMATCH');
    localCheck(submission.evidenceManifestSha256 === manifestSha256, 'MANIFEST_HASH_MISMATCH');
    localCheck(typeof submission.reviewer?.reviewerId === 'string' && submission.reviewer.reviewerId.trim().length >= 3, 'REVIEWER_ID_INVALID');
    localCheck(typeof submission.reviewer?.fullName === 'string' && submission.reviewer.fullName.trim().length >= 3, 'REVIEWER_NAME_INVALID');
    localCheck(typeof submission.reviewer?.affiliation === 'string' && submission.reviewer.affiliation.trim().length >= 2, 'REVIEWER_AFFILIATION_INVALID');
    localCheck(protocol.reviewerRequirements.allowedQualifications.includes(submission.reviewer?.qualification), 'REVIEWER_QUALIFICATION_INVALID');
    localCheck(submission.reviewer?.independentWorkAttestation === true, 'INDEPENDENCE_ATTESTATION_MISSING');
    localCheck(submission.reviewer?.noGeneratorAuthorshipConflictAttestation === true, 'AUTHORSHIP_CONFLICT_ATTESTATION_MISSING');
    localCheck(submission.reviewer?.exactEvidenceHashAttestation === true, 'EVIDENCE_HASH_ATTESTATION_MISSING');
    localCheck(typeof submission.startedAt === 'string' && !Number.isNaN(Date.parse(submission.startedAt)), 'START_TIME_INVALID');
    localCheck(typeof submission.completedAt === 'string' && !Number.isNaN(Date.parse(submission.completedAt)), 'COMPLETION_TIME_INVALID');
    localCheck(Array.isArray(submission.classReviews) && submission.classReviews.length === 16, 'CLASS_REVIEW_COUNT_MISMATCH');
    const classReviews = Array.isArray(submission.classReviews) ? submission.classReviews : [];
    localCheck(new Set(classReviews.map((review) => review.evidenceId)).size === 16, 'CLASS_REVIEW_DUPLICATE_OR_MISSING');
    for (const review of classReviews) {
      localCheck(manifest.evidence.some((record) => record.evidenceId === review.evidenceId), 'UNKNOWN_EVIDENCE_ID');
      localCheck(SCORED_DIMENSIONS.every((dimension) => Number.isInteger(review.scores?.[dimension]) && review.scores[dimension] >= 1 && review.scores[dimension] <= 5), 'SCORE_INVALID');
      localCheck(Array.isArray(review.criticalDefects), 'CRITICAL_DEFECTS_INVALID');
      localCheck(typeof review.referenceCorrespondenceNotes === 'string' && review.referenceCorrespondenceNotes.trim().length >= 20, 'REFERENCE_NOTES_TOO_SHORT');
      localCheck(typeof review.geologyReasoning === 'string' && review.geologyReasoning.trim().length >= 40, 'GEOLOGY_REASONING_TOO_SHORT');
      localCheck(['pass', 'revise', 'reject'].includes(review.disposition), 'DISPOSITION_INVALID');
    }
    check(localFailures.length === 0, 'REVIEWER_SUBMISSION_INVALID', { filename, failures: localFailures });
    if (localFailures.length === 0) validSubmissions.push({ filename, ...submission });
  } catch (error) {
    check(false, 'REVIEWER_SUBMISSION_UNREADABLE', { filename, message: error.message });
  }
}

const reviewerIds = validSubmissions.map((submission) => submission.reviewer.reviewerId.trim());
check(new Set(reviewerIds).size === reviewerIds.length, 'DUPLICATE_REVIEWER_IDENTITY', { reviewerIds });
const quorum = validSubmissions.length >= protocol.reviewerRequirements.minimumIndependentReviewers
  && validSubmissions.length >= protocol.reviewerRequirements.minimumQualifiedReviewers
  && validSubmissions.filter((submission) => submission.reviewer.fieldGeologyExpertise).length >= protocol.reviewerRequirements.minimumFieldGeologyReviewers
  && validSubmissions.filter((submission) => submission.reviewer.geomorphologyOrProcessExpertise).length >= protocol.reviewerRequirements.minimumGeomorphologyOrProcessReviewers;
if (!quorum) gateBlockers.push({ code: 'INDEPENDENT_QUALIFIED_REVIEWER_QUORUM_NOT_MET', validSubmissions: validSubmissions.length });

const classResults = [];
if (quorum && derivedQueue.length === 0) {
  for (const evidence of manifest.evidence) {
    const reviews = validSubmissions.map((submission) => submission.classReviews.find((review) => review.evidenceId === evidence.evidenceId));
    const medians = Object.fromEntries(SCORED_DIMENSIONS.map((dimension) => [dimension, median(reviews.map((review) => review.scores[dimension]))]));
    const scores = reviews.flatMap((review) => SCORED_DIMENSIONS.map((dimension) => review.scores[dimension]));
    const overallMean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const criticalDefects = reviews.flatMap((review) => review.criticalDefects);
    const passed = Object.values(medians).every((score) => score >= protocol.passThresholds.perClassPerDimensionMedianMinimum)
      && overallMean >= protocol.passThresholds.perClassOverallMeanMinimum
      && scores.every((score) => score >= protocol.passThresholds.individualScoreFloor)
      && criticalDefects.length === 0
      && reviews.every((review) => review.disposition === 'pass');
    classResults.push({ evidenceId: evidence.evidenceId, classId: evidence.classId, medians, overallMean: Number(overallMean.toFixed(4)), criticalDefects, passed });
    if (!passed) gateBlockers.push({ code: 'CLASS_NATURALNESS_GATE_FAILED', evidenceId: evidence.evidenceId, classId: evidence.classId });
  }
}

const reviewersPassed = classResults.length === 16 && classResults.every((result) => result.passed);
const adjudication = {
  protocolId: protocol.protocolId,
  evidenceManifestSha256: manifestSha256,
  reviewerFiles: validSubmissions.map((submission) => ({ filename: submission.filename, sha256: null })),
  classResults,
  reviewersPassed,
};
for (const reviewerFile of adjudication.reviewerFiles) {
  reviewerFile.sha256 = sha256(await readFile(path.join(SUBMISSION_DIRECTORY, reviewerFile.filename)));
}
const adjudicationBytes = Buffer.from(stableJson(adjudication));
const adjudicationSha256 = sha256(adjudicationBytes);
const developerApproved = reviewersPassed
  && approval.approved === true
  && typeof approval.developerName === 'string'
  && approval.developerName.trim().length >= 2
  && typeof approval.approvedAt === 'string'
  && !Number.isNaN(Date.parse(approval.approvedAt))
  && approval.adjudicationSha256 === adjudicationSha256;
if (!developerApproved) gateBlockers.push({ code: 'EXPLICIT_DEVELOPER_APPROVAL_NOT_BOUND_TO_ADJUDICATION' });

const instrumentIntegrityPassed = integrityFailures.length === 0;
const reviewGatePassed = instrumentIntegrityPassed && gateBlockers.length === 0 && developerApproved;
const verification = {
  checkpoint: 8,
  protocolId: protocol.protocolId,
  instrumentOnlyMode: INSTRUMENT_ONLY,
  checks,
  instrumentIntegrityPassed,
  integrityFailures,
  evidenceManifestSha256: manifestSha256,
  evidenceReadiness: {
    ready: derivedQueue.length === 0,
    blockedClasses: derivedQueue.length,
    queueStatus: queue.status,
  },
  reviewerReadiness: {
    submissionFiles: submissionFiles.length,
    validSubmissions: validSubmissions.length,
    quorum,
  },
  classResults,
  adjudicationSha256,
  reviewersPassed,
  developerApproved,
  gateBlockers,
  reviewGatePassed,
  disposition: reviewGatePassed
    ? 'approved'
    : instrumentIntegrityPassed
      ? 'instrument-valid-human-and-evidence-gates-pending'
      : 'instrument-integrity-failed',
};
await Promise.all([
  writeFile(path.join(OUTPUT_DIRECTORY, 'adjudication.json'), stableJson(adjudication)),
  writeFile(path.join(OUTPUT_DIRECTORY, 'verification.json'), stableJson(verification)),
]);

console.log(stableJson(verification));
if (!instrumentIntegrityPassed || (!INSTRUMENT_ONLY && !reviewGatePassed)) process.exitCode = 2;
