import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVAL_ATTESTATION,
  OUTPUT_ROOT,
  REJECTION_ATTESTATION,
  REPO_ROOT,
  buildSourceAdmissionState,
  contentId,
  stableJson,
} from './prepare-rock-geology-v2-source-admission.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function withoutContentId(decision) {
  const clone = structuredClone(decision);
  delete clone.decisionContentId;
  return clone;
}

function evidenceProjection(packet) {
  return packet.reviewEvidence.map(({ relativePath, bytes, sha256 }) => ({
    relativePath,
    bytes,
    sha256,
  }));
}

export function validateDecision(decision, packet) {
  const failures = [];
  const requiredKeys = [
    'schema',
    'version',
    'candidateId',
    'slotId',
    'sourceRevision',
    'editableSourceContentId',
    'packetContentId',
    'reviewEvidenceContentId',
    'reviewedEvidence',
    'decision',
    'reviewer',
    'decidedAt',
    'rationale',
    'humanAttestation',
    'supersedesDecisionContentId',
    'decisionContentId',
  ];
  const actualKeys = Object.keys(decision ?? {}).sort();
  if (stableJson(actualKeys) !== stableJson([...requiredKeys].sort())) {
    failures.push('decision-fields-not-exact');
  }
  if (decision?.schema !== 'toonlab/rock-source-human-visual-decision') failures.push('decision-schema');
  if (decision?.version !== 1) failures.push('decision-version');
  if (!['approved', 'rejected'].includes(decision?.decision)) failures.push('decision-not-final');
  if (decision?.candidateId !== packet.candidate.subtypeId) failures.push('candidate-binding');
  if (decision?.slotId !== packet.candidate.slotId) failures.push('slot-binding');
  if (decision?.sourceRevision !== packet.candidate.sourceRevision) failures.push('source-revision-binding');
  if (decision?.editableSourceContentId !== packet.sourceBinding.editableSourceContentId) {
    failures.push('editable-source-binding');
  }
  if (decision?.packetContentId !== packet.packetContentId) failures.push('packet-binding');
  if (decision?.reviewEvidenceContentId !== packet.reviewEvidenceContentId) {
    failures.push('review-evidence-content-binding');
  }
  if (stableJson(decision?.reviewedEvidence) !== stableJson(evidenceProjection(packet))) {
    failures.push('reviewed-evidence-not-exact');
  }
  if (
    !decision?.reviewer ||
    typeof decision.reviewer.id !== 'string' ||
    decision.reviewer.id.trim().length < 2 ||
    typeof decision.reviewer.displayName !== 'string' ||
    decision.reviewer.displayName.trim().length < 2
  ) {
    failures.push('reviewer-identity');
  }
  if (
    typeof decision?.decidedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(decision.decidedAt) ||
    Number.isNaN(Date.parse(decision.decidedAt))
  ) {
    failures.push('decision-timestamp');
  }
  if (typeof decision?.rationale !== 'string' || decision.rationale.trim().length < 20) {
    failures.push('decision-rationale');
  }
  const expectedAttestation =
    decision?.decision === 'approved' ? APPROVAL_ATTESTATION : REJECTION_ATTESTATION;
  if (decision?.humanAttestation !== expectedAttestation) failures.push('human-attestation');
  if (
    decision?.supersedesDecisionContentId !== null &&
    !/^sha256:[a-f0-9]{64}$/.test(decision?.supersedesDecisionContentId ?? '')
  ) {
    failures.push('supersedes-decision-content-id');
  }
  const expectedDecisionContentId = contentId(withoutContentId(decision ?? {}));
  if (decision?.decisionContentId !== expectedDecisionContentId) failures.push('decision-content-id');
  return {
    valid: failures.length === 0,
    failures,
    expectedDecisionContentId,
  };
}

function assertArtifact(checks, id, actualPath, expected) {
  if (!existsSync(actualPath)) {
    checks.push({ id, passed: false, detail: 'missing' });
    return;
  }
  let actual;
  try {
    actual = readJson(actualPath);
  } catch (error) {
    checks.push({ id, passed: false, detail: `invalid-json:${error.message}` });
    return;
  }
  checks.push({
    id,
    passed: stableJson(actual) === stableJson(expected),
    detail: relative(REPO_ROOT, actualPath),
  });
}

function makeValidSyntheticDecision(template) {
  const decision = {
    ...structuredClone(template),
    decision: 'approved',
    reviewer: { id: 'verification-reviewer', displayName: 'Verification Reviewer' },
    decidedAt: '2026-08-17T00:00:00.000Z',
    rationale: 'Synthetic verifier fixture only; this is not an asset approval or catalog decision.',
    humanAttestation: APPROVAL_ATTESTATION,
  };
  decision.decisionContentId = contentId(withoutContentId(decision));
  return decision;
}

export function verifySourceAdmission({ requirePromotion = false, write = true } = {}) {
  const state = buildSourceAdmissionState();
  const checks = [];
  assertArtifact(
    checks,
    'packet-schema-byte-semantics',
    join(OUTPUT_ROOT, 'schemas/source-admission-packet.schema.json'),
    state.schemas.packet,
  );
  assertArtifact(
    checks,
    'decision-schema-byte-semantics',
    join(OUTPUT_ROOT, 'schemas/human-visual-decision.schema.json'),
    state.schemas.decision,
  );
  assertArtifact(checks, 'index-current-source-state', join(OUTPUT_ROOT, 'index.json'), state.index);
  checks.push({
    id: 'packet-schema-covers-exact-top-level-fields',
    passed: state.packets.every((packet) => {
      const keys = Object.keys(packet);
      return (
        state.schemas.packet.required.every((key) => keys.includes(key)) &&
        keys.every((key) => Object.hasOwn(state.schemas.packet.properties, key))
      );
    }),
    detail: 'additionalProperties=false is consistent with all six generated packets',
  });
  checks.push({
    id: 'decision-schema-covers-exact-top-level-fields',
    passed: Object.values(state.decisionTemplates).every((decision) => {
      const keys = Object.keys(decision);
      return (
        state.schemas.decision.required.every((key) => keys.includes(key)) &&
        keys.every((key) => Object.hasOwn(state.schemas.decision.properties, key))
      );
    }),
    detail: 'additionalProperties=false is consistent with all six decision templates',
  });

  const candidates = [];
  for (const expectedPacket of state.packets) {
    const subtypeId = expectedPacket.candidate.subtypeId;
    const packetPath = join(OUTPUT_ROOT, 'packets', subtypeId, 'packet.json');
    const templatePath = join(OUTPUT_ROOT, 'packets', subtypeId, 'decision-template.json');
    const decisionPath = join(OUTPUT_ROOT, 'packets', subtypeId, 'decision.json');
    assertArtifact(checks, `packet-current-${subtypeId}`, packetPath, expectedPacket);
    assertArtifact(
      checks,
      `decision-template-current-${subtypeId}`,
      templatePath,
      state.decisionTemplates[subtypeId],
    );

    const { packetContentId, ...packetWithoutId } = expectedPacket;
    const packetIdentityPassed = contentId(packetWithoutId) === packetContentId;
    checks.push({
      id: `packet-content-id-${subtypeId}`,
      passed: packetIdentityPassed,
      detail: packetContentId,
    });
    const reviewIdentityPassed =
      contentId(evidenceProjection(expectedPacket)) === expectedPacket.reviewEvidenceContentId;
    checks.push({
      id: `review-evidence-content-id-${subtypeId}`,
      passed: reviewIdentityPassed,
      detail: expectedPacket.reviewEvidenceContentId,
    });
    const sourceDeclarationsPassed = expectedPacket.sourceBinding.sourceAssetInventory.every(
      (record) => record.declarationMatches !== false,
    );
    checks.push({
      id: `source-declared-hashes-${subtypeId}`,
      passed: sourceDeclarationsPassed,
      detail: `${expectedPacket.sourceBinding.sourceAssetInventory.length} exact source records`,
    });

    let decisionState = 'pending-missing-decision-file';
    let decisionValidation = null;
    let decision = null;
    if (existsSync(decisionPath)) {
      try {
        decision = readJson(decisionPath);
        decisionValidation = validateDecision(decision, expectedPacket);
        decisionState = decisionValidation.valid ? decision.decision : 'invalid';
      } catch (error) {
        decisionState = 'invalid-json';
        decisionValidation = { valid: false, failures: [`invalid-json:${error.message}`] };
      }
    }
    const nonDecisionBlockers = expectedPacket.blockers.filter(
      (blocker) => blocker !== 'missing-explicit-human-visual-decision',
    );
    const promotionAuthorized =
      decisionValidation?.valid === true &&
      decision?.decision === 'approved' &&
      expectedPacket.technicalGates.passed === true &&
      nonDecisionBlockers.length === 0;
    candidates.push({
      subtypeId,
      slotId: expectedPacket.candidate.slotId,
      technicalPassed: expectedPacket.technicalGates.passed,
      decisionState,
      decisionValidation,
      nonDecisionBlockers,
      promotionAuthorized,
    });
  }

  const firstPacket = state.packets[0];
  const firstTemplate = state.decisionTemplates[firstPacket.candidate.subtypeId];
  const syntheticValid = makeValidSyntheticDecision(firstTemplate);
  const pendingResult = validateDecision(firstTemplate, firstPacket);
  const forgedResult = validateDecision(
    { ...syntheticValid, reviewer: null, decisionContentId: syntheticValid.decisionContentId },
    firstPacket,
  );
  const tamperedResult = validateDecision(
    { ...syntheticValid, packetContentId: `sha256:${'0'.repeat(64)}` },
    firstPacket,
  );
  const validFixtureResult = validateDecision(syntheticValid, firstPacket);
  const selfTests = [
    {
      id: 'pending-template-is-not-final-decision',
      passed: pendingResult.valid === false && pendingResult.failures.includes('decision-not-final'),
    },
    {
      id: 'forged-reviewer-is-rejected',
      passed: forgedResult.valid === false && forgedResult.failures.includes('reviewer-identity'),
    },
    {
      id: 'tampered-packet-binding-is-rejected',
      passed: tamperedResult.valid === false && tamperedResult.failures.includes('packet-binding'),
    },
    {
      id: 'fully-bound-synthetic-fixture-validates',
      passed: validFixtureResult.valid === true,
    },
  ];
  for (const test of selfTests) checks.push({ ...test, detail: 'in-memory verifier self-test' });

  const integrityPassed = checks.every((check) => check.passed);
  const promotionAuthorized =
    integrityPassed && candidates.length === 6 && candidates.every((candidate) => candidate.promotionAuthorized);
  const blockerInstances = candidates.flatMap((candidate) => [
    ...(candidate.decisionState === 'approved' ? [] : ['missing-or-nonapproved-human-decision']),
    ...candidate.nonDecisionBlockers,
  ]);
  const blockerCounts = Object.fromEntries(
    [...new Set(blockerInstances)].sort().map((id) => [id, blockerInstances.filter((item) => item === id).length]),
  );
  const resultWithoutId = {
    schema: 'toonlab/rock-source-admission-verification',
    version: 1,
    integrityPassed,
    promotionAuthorized,
    dispatchAuthorized: false,
    counts: {
      checks: checks.length,
      passedChecks: checks.filter((check) => check.passed).length,
      failedChecks: checks.filter((check) => !check.passed).length,
      candidates: candidates.length,
      technicallyPassed: candidates.filter((candidate) => candidate.technicalPassed).length,
      approvedAndPromotable: candidates.filter((candidate) => candidate.promotionAuthorized).length,
      pendingOrNonapprovedDecisions: candidates.filter((candidate) => candidate.decisionState !== 'approved').length,
      blockerInstances: blockerInstances.length,
      blockerCounts,
      productionMissingCanonicalSources: state.index.counts.productionMissingCanonicalSources,
      productionProviderPreflightsBlocked: state.index.counts.productionProviderPreflightsBlocked,
    },
    checks,
    selfTests,
    candidates,
    failClosedDecision:
      promotionAuthorized
        ? 'All six exact source revisions have valid approved decisions and no remaining packet blockers.'
        : 'No canonical promotion or worker dispatch is authorized. Pending, invalid, rejected, stale, incomplete or differently bound decisions fail closed.',
  };
  const result = { ...resultWithoutId, verificationContentId: contentId(resultWithoutId) };
  if (write) writeJson(join(OUTPUT_ROOT, 'verification.json'), result);
  if (requirePromotion && !promotionAuthorized) process.exitCode = 2;
  else if (!integrityPassed) process.exitCode = 1;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requirePromotion = process.argv.includes('--require-promotion');
  const result = verifySourceAdmission({ requirePromotion });
  console.log(
    JSON.stringify(
      {
        output: relative(REPO_ROOT, join(OUTPUT_ROOT, 'verification.json')),
        integrityPassed: result.integrityPassed,
        promotionAuthorized: result.promotionAuthorized,
        dispatchAuthorized: false,
        counts: result.counts,
        verificationContentId: result.verificationContentId,
      },
      null,
      2,
    ),
  );
}
