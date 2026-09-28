import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_ROOT = join(
  REPO_ROOT,
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission',
);

const C8_ROOT = 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology';
const REGISTER_PATH = `${C8_ROOT}/canonical-pilot/authoring-register.json`;
const REFERENCE_MANIFEST_PATH = `${C8_ROOT}/reference-final/review/master-manifest.json`;
const DEFECTS_PATH = 'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/registry-defects.json';
const SHARD_MANIFEST_PATH = 'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/manifest.json';
const PROVIDER_TRIAGE_PATH = 'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/provider-triage.json';

export const APPROVAL_ATTESTATION =
  'I visually reviewed every hash-bound evidence item and approve this exact source revision for canonical production use.';
export const REJECTION_ATTESTATION =
  'I visually reviewed every hash-bound evidence item and reject this exact source revision for canonical production use.';

const ADVANCED_EVIDENCE = {
  'hoodoo-caprock': {
    lineageLabel: 'H3.1-assisted hoodoo runtime derivative',
    providerManifest:
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/tripo-v31-ultra-claron/manifest.json',
    technical: [
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-template-bridge/template-bridge-audit.json',
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-scan-assisted-runtime-package/glb-audit.json',
      'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/verification.json',
      'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/checkpoint-status.json',
      'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/approval.md',
    ],
    review: [
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/review/hoodoo-v31-final-process-review.jpg',
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/review/hoodoo-v31-final-visual-audit.json',
      'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/production-scene/hoodoo-production-neutral-vs-stylized-six-view.png',
    ],
    hasClaySixView: true,
    hasNeutralBakeSixView: true,
  },
  'tor-block-pile': {
    lineageLabel: 'H3.1-donor tor R04 runtime derivative',
    providerManifest:
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/tripo-h31/manifest.json',
    technical: [
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/template-bridge-r01/template-bridge-audit.json',
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/technical-verification.json',
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/visual-checkpoint-audit.json',
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/r04-runtime-package-r01/glb-audit.json',
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/approval.md',
    ],
    review: [
      'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/tor-block-pile-r04-visual-checkpoint.png',
    ],
    hasClaySixView: true,
    hasNeutralBakeSixView: true,
  },
};

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

export function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

export function contentId(value) {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(REPO_ROOT, relativePath), 'utf8'));
}

function normalizeRepoPath(input) {
  const absolute = isAbsolute(input) ? resolve(input) : resolve(REPO_ROOT, input);
  const rel = relative(REPO_ROOT, absolute).split(sep).join('/');
  if (!rel || rel === '..' || rel.startsWith('../')) {
    throw new Error(`Evidence path escapes the repository: ${input}`);
  }
  return rel;
}

export function bindFile(input, role) {
  const relativePath = normalizeRepoPath(input);
  const absolute = join(REPO_ROOT, relativePath);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Missing ${role}: ${relativePath}`);
  }
  const bytes = readFileSync(absolute);
  return {
    role,
    relativePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function packetSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'toonlab/rock-source-admission-packet.schema.json',
    title: 'ToonLab rock source admission packet',
    type: 'object',
    additionalProperties: false,
    required: [
      'schema',
      'version',
      'candidate',
      'globalBindings',
      'sourceBinding',
      'provenance',
      'technicalGates',
      'reviewEvidence',
      'reviewEvidenceContentId',
      'evidenceCoverage',
      'blockers',
      'promotionAuthorized',
      'packetContentId',
    ],
    properties: {
      schema: { const: 'toonlab/rock-source-admission-packet' },
      version: { const: 1 },
      candidate: { type: 'object' },
      globalBindings: { type: 'object' },
      sourceBinding: { type: 'object' },
      provenance: { type: 'object' },
      technicalGates: { type: 'object' },
      reviewEvidence: { type: 'array', minItems: 4 },
      reviewEvidenceContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      evidenceCoverage: { type: 'object' },
      blockers: { type: 'array', items: { type: 'string' } },
      promotionAuthorized: { const: false },
      packetContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
    },
  };
}

function decisionSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'toonlab/rock-source-human-visual-decision.schema.json',
    title: 'Immutable human visual decision for one exact rock source packet',
    type: 'object',
    additionalProperties: false,
    required: [
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
    ],
    properties: {
      schema: { const: 'toonlab/rock-source-human-visual-decision' },
      version: { const: 1 },
      candidateId: { type: 'string' },
      slotId: { type: 'string' },
      sourceRevision: { type: 'integer', minimum: 1 },
      editableSourceContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      packetContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      reviewEvidenceContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
      reviewedEvidence: { type: 'array', minItems: 4 },
      decision: { enum: ['pending', 'approved', 'rejected'] },
      reviewer: { anyOf: [{ type: 'null' }, { type: 'object' }] },
      decidedAt: { anyOf: [{ type: 'null' }, { type: 'string', format: 'date-time' }] },
      rationale: { anyOf: [{ type: 'null' }, { type: 'string', minLength: 20 }] },
      humanAttestation: { anyOf: [{ type: 'null' }, { type: 'string' }] },
      supersedesDecisionContentId: {
        anyOf: [{ type: 'null' }, { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }],
      },
      decisionContentId: {
        anyOf: [{ type: 'null' }, { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }],
      },
    },
    allOf: [
      {
        if: { properties: { decision: { const: 'pending' } } },
        then: {
          properties: {
            reviewer: { type: 'null' },
            decidedAt: { type: 'null' },
            rationale: { type: 'null' },
            humanAttestation: { type: 'null' },
            decisionContentId: { type: 'null' },
          },
        },
      },
      {
        if: { properties: { decision: { const: 'approved' } } },
        then: {
          properties: {
            reviewer: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'displayName'],
              properties: {
                id: { type: 'string', minLength: 2 },
                displayName: { type: 'string', minLength: 2 },
              },
            },
            decidedAt: { type: 'string', format: 'date-time' },
            rationale: { type: 'string', minLength: 20 },
            humanAttestation: { const: APPROVAL_ATTESTATION },
            decisionContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
          },
        },
      },
      {
        if: { properties: { decision: { const: 'rejected' } } },
        then: {
          properties: {
            reviewer: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'displayName'],
              properties: {
                id: { type: 'string', minLength: 2 },
                displayName: { type: 'string', minLength: 2 },
              },
            },
            decidedAt: { type: 'string', format: 'date-time' },
            rationale: { type: 'string', minLength: 20 },
            humanAttestation: { const: REJECTION_ATTESTATION },
            decisionContentId: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
          },
        },
      },
    ],
  };
}

function sourceFiles(sourceRoot, manifest) {
  const records = [];
  for (const [name, declared] of Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))) {
    const bound = bindFile(`${sourceRoot}/canonical-source/${name}`, `editable-source/${name}`);
    records.push({
      ...bound,
      declaredBytes: declared.bytes,
      declaredContentHash: declared.contentHash,
      declarationMatches:
        declared.bytes === bound.bytes && declared.contentHash === `sha256:${bound.sha256}`,
    });
  }
  records.push(bindFile(`${sourceRoot}/canonical-source/source-manifest.json`, 'editable-source/source-manifest'));
  records.push(bindFile(`${sourceRoot}/round-trip-report.json`, 'technical/round-trip-report'));
  return records;
}

function c8Captures(slotId) {
  const dir = join(REPO_ROOT, `${C8_ROOT}/canonical-pilot/captures`);
  return readdirSync(dir)
    .filter((name) => name.startsWith(`${slotId}--`) && name.endsWith('.png'))
    .sort()
    .map((name) => bindFile(`${C8_ROOT}/canonical-pilot/captures/${name}`, `review/clay/${name}`));
}

function extractAdvancedAssetInventory(subtypeId, advanced) {
  if (!advanced) return [];
  const records = [];
  if (subtypeId === 'tor-block-pile') {
    const audit = readJson(advanced.technical.find((path) => path.endsWith('technical-verification.json')));
    for (const item of audit.artifacts ?? []) {
      records.push(bindFile(item.file, 'advanced-asset/tor-r04'));
    }
  }
  if (subtypeId === 'hoodoo-caprock') {
    const verification = readJson(
      advanced.technical.find((path) => path.endsWith('checkpoint-11-stylization/hoodoo-caprock/verification.json')),
    );
    const protectedCheck = verification.checks?.find(
      (check) => check.id === 'protected-neutral-files-unchanged',
    );
    for (const item of protectedCheck?.evidence ?? []) {
      records.push(bindFile(item.file, 'advanced-asset/hoodoo-neutral'));
    }
  }
  const unique = new Map(records.map((record) => [record.relativePath, record]));
  return [...unique.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function makeDecisionTemplate(packet) {
  return {
    schema: 'toonlab/rock-source-human-visual-decision',
    version: 1,
    candidateId: packet.candidate.subtypeId,
    slotId: packet.candidate.slotId,
    sourceRevision: packet.candidate.sourceRevision,
    editableSourceContentId: packet.sourceBinding.editableSourceContentId,
    packetContentId: packet.packetContentId,
    reviewEvidenceContentId: packet.reviewEvidenceContentId,
    reviewedEvidence: packet.reviewEvidence.map(({ relativePath, bytes, sha256: hash }) => ({
      relativePath,
      bytes,
      sha256: hash,
    })),
    decision: 'pending',
    reviewer: null,
    decidedAt: null,
    rationale: null,
    humanAttestation: null,
    supersedesDecisionContentId: null,
    decisionContentId: null,
  };
}

function makePacket({ defect, register, references, providerTriage, globalBindings }) {
  const slot = register.slots.find((item) => item.slotId === defect.canonicalPrimarySlotId);
  if (!slot || slot.status !== 'authored-awaiting-visual-review') {
    throw new Error(`Register does not expose pending authored slot ${defect.canonicalPrimarySlotId}`);
  }
  const reference = references.entries.find((entry) => entry.id === defect.subtypeId);
  const triage = providerTriage.subtypes.find((entry) => entry.subtypeId === defect.subtypeId);
  if (!reference || !triage) throw new Error(`Missing reference/provider record for ${defect.subtypeId}`);

  const sourceRoot = `${C8_ROOT}/canonical-pilot/${defect.canonicalPrimarySlotId}`;
  const sourceManifestPath = `${sourceRoot}/canonical-source/source-manifest.json`;
  const roundTripPath = `${sourceRoot}/round-trip-report.json`;
  const sourceManifest = readJson(sourceManifestPath);
  const roundTrip = readJson(roundTripPath);
  const canonical = roundTrip.revisions?.canonical;
  const advanced = ADVANCED_EVIDENCE[defect.subtypeId] ?? null;
  const providerManifest = advanced ? readJson(advanced.providerManifest) : null;
  const captures = c8Captures(defect.canonicalPrimarySlotId);

  const referenceEvidence = [
    bindFile(reference.paths.sourceRecord, 'review/nature-source-record'),
    bindFile(reference.paths.sourceImage, 'review/nature-source-image'),
    bindFile(reference.paths.sheet, 'review/admitted-six-view'),
    bindFile(reference.paths.audit, 'review/reference-audit'),
  ];
  const advancedReview = (advanced?.review ?? []).map((path) => bindFile(path, 'review/advanced'));
  const reviewEvidence = [...referenceEvidence, ...captures, ...advancedReview].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath),
  );
  const sourceAssetInventory = sourceFiles(sourceRoot, sourceManifest);
  const advancedTechnicalEvidence = (advanced?.technical ?? []).map((path) =>
    bindFile(path, 'technical/advanced-process'),
  );
  const advancedAssetInventory = extractAdvancedAssetInventory(defect.subtypeId, advanced);

  const requiredClayViews = ['bottom', 'front', 'left', 'rear', 'right', 'top'];
  const hasC8ClaySixView = requiredClayViews.every((view) =>
    captures.some((record) => record.relativePath.endsWith(`--canonical--${view}.png`)),
  );
  const evidenceCoverage = {
    natureAuthorityAndAdmittedSixView: reference.packageComplete === true && reference.auditApproval === true,
    claySixView: hasC8ClaySixView || advanced?.hasClaySixView === true,
    neutralBakedSixView: advanced?.hasNeutralBakeSixView === true,
    exactTopAndBottomIncluded:
      hasC8ClaySixView || ['hoodoo-caprock', 'tor-block-pile'].includes(defect.subtypeId),
    explicitHumanVisualDecision: false,
  };

  const technicalGates = {
    passed:
      roundTrip.passed === true &&
      roundTrip.deterministicRebuild?.contentIdentity === true &&
      roundTrip.invalidEdit?.passed === true &&
      canonical?.passed === true &&
      canonical?.identity?.passed === true &&
      canonical?.topology?.topologyFailures === 0 &&
      sourceAssetInventory.every((file) => file.declarationMatches !== false),
    roundTrip: {
      passed: roundTrip.passed === true,
      deterministicContentIdentity: roundTrip.deterministicRebuild?.contentIdentity === true,
      invalidEditRejected: roundTrip.invalidEdit?.passed === true,
      canonicalIdentityPassed: canonical?.identity?.passed === true,
      topologyFailures: canonical?.topology?.topologyFailures,
      visualApprovalRequired: canonical?.visualApprovalRequired === true,
      evidence: bindFile(roundTripPath, 'technical/round-trip-report'),
    },
    advancedProcess: advanced
      ? {
          linked: true,
          label: advanced.lineageLabel,
          evidence: advancedTechnicalEvidence,
          promotedToNamedRegisterRevision: false,
        }
      : { linked: false, evidence: [], promotedToNamedRegisterRevision: false },
  };

  const blockers = ['missing-explicit-human-visual-decision'];
  if (!evidenceCoverage.neutralBakedSixView) blockers.push('missing-neutral-baked-six-view');
  if (advanced) blockers.push('advanced-derivative-not-bound-to-register-source-revision');
  if (!technicalGates.passed) blockers.push('technical-source-gate-failed');

  const packetWithoutId = {
    schema: 'toonlab/rock-source-admission-packet',
    version: 1,
    candidate: {
      subtypeId: defect.subtypeId,
      slotId: defect.canonicalPrimarySlotId,
      familyId: slot.familyId,
      reviewRole: slot.reviewRole,
      sourceRevision: defect.sourceRevision,
      registerStatus: slot.status,
      requiredDeliverables: slot.requiredDeliverables,
      referenceIds: slot.referenceIds,
    },
    globalBindings,
    sourceBinding: {
      sourceRoot,
      editableSourceContentId: sourceManifest.editableSourceContentId,
      sourceManifest: bindFile(sourceManifestPath, 'editable-source/source-manifest'),
      registryDeclaredImmutableFiles: defect.immutableFiles,
      sourceAssetInventory,
      roundTripSourceContentId: canonical?.sourceContentId,
      advancedAssetInventory,
    },
    provenance: {
      canonicalEditableSource: sourceManifest.artifactGraph?.canonicalEditableSource === true,
      canonicalSourceOrigin: sourceManifest.packageMetadata?.provenance,
      independentProvenance: roundTrip.independentProvenance === true,
      providerPolicy: {
        lane: triage.lane,
        providerPreflight: triage.providerPreflight,
        providerIsRequired: triage.providerIsRequired,
        rationale: triage.rationale,
      },
      runtimeDerivativeDonor: advanced
        ? {
            usedOutsideNamedCanonicalSourceRevision: true,
            provider: providerManifest.provider,
            modelVersion: providerManifest.modelVersion,
            providerTaskStatus: providerManifest.status,
            canonicalSourceEligible: providerManifest.canonicalSourceEligible,
            intendedUse: providerManifest.intendedUse,
            manifest: bindFile(advanced.providerManifest, 'provenance/provider-manifest'),
          }
        : {
            usedOutsideNamedCanonicalSourceRevision: false,
            canonicalSourceEligible: false,
          },
    },
    technicalGates,
    reviewEvidence,
    reviewEvidenceContentId: contentId(
      reviewEvidence.map(({ relativePath, bytes, sha256: hash }) => ({ relativePath, bytes, sha256: hash })),
    ),
    evidenceCoverage,
    blockers,
    promotionAuthorized: false,
  };
  return { ...packetWithoutId, packetContentId: contentId(packetWithoutId) };
}

export function buildSourceAdmissionState() {
  const register = readJson(REGISTER_PATH);
  const references = readJson(REFERENCE_MANIFEST_PATH);
  const defects = readJson(DEFECTS_PATH);
  const shardManifest = readJson(SHARD_MANIFEST_PATH);
  const providerTriage = readJson(PROVIDER_TRIAGE_PATH);
  const globalBindings = {
    authoringRegister: bindFile(REGISTER_PATH, 'global/authoring-register'),
    referenceMasterManifest: bindFile(REFERENCE_MANIFEST_PATH, 'global/reference-master-manifest'),
    registryDefects: bindFile(DEFECTS_PATH, 'global/registry-defects'),
    productionShardManifest: bindFile(SHARD_MANIFEST_PATH, 'global/production-shard-manifest'),
    providerTriage: bindFile(PROVIDER_TRIAGE_PATH, 'global/provider-triage'),
  };
  const packets = defects.authoredAwaitingVisualReview
    .map((defect) => makePacket({ defect, register, references, providerTriage, globalBindings }))
    .sort((a, b) => a.candidate.subtypeId.localeCompare(b.candidate.subtypeId));
  if (packets.length !== 6) throw new Error(`Expected six pending authored candidates, found ${packets.length}`);

  const blockerInstances = packets.flatMap((packet) => packet.blockers);
  const blockersById = Object.fromEntries(
    [...new Set(blockerInstances)].sort().map((id) => [id, blockerInstances.filter((item) => item === id).length]),
  );
  const packetRecords = packets.map((packet) => ({
    subtypeId: packet.candidate.subtypeId,
    slotId: packet.candidate.slotId,
    packetRelativePath: `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/packets/${packet.candidate.subtypeId}/packet.json`,
    decisionRelativePath: `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/packets/${packet.candidate.subtypeId}/decision.json`,
    decisionTemplateRelativePath: `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/packets/${packet.candidate.subtypeId}/decision-template.json`,
    packetContentId: packet.packetContentId,
    reviewEvidenceContentId: packet.reviewEvidenceContentId,
    blockers: packet.blockers,
    promotionAuthorized: false,
  }));
  const indexWithoutId = {
    schema: 'toonlab/rock-source-admission-index',
    version: 1,
    status: 'prepared-pending-human-decisions-not-promotable',
    purpose:
      'Hash-bind exact authored sources, provenance, technical gates and visual evidence without changing the canonical register or authorizing rollout.',
    canonicalRegisterModified: false,
    dispatchAuthorized: false,
    counts: {
      candidates: packets.length,
      technicallyPassed: packets.filter((packet) => packet.technicalGates.passed).length,
      approvedDecisions: 0,
      pendingHumanDecisions: packets.length,
      candidatesMissingNeutralBakeSixView: packets.filter(
        (packet) => !packet.evidenceCoverage.neutralBakedSixView,
      ).length,
      advancedDerivativesNotRegisterBound: packets.filter((packet) =>
        packet.blockers.includes('advanced-derivative-not-bound-to-register-source-revision'),
      ).length,
      candidateBlockerInstances: blockerInstances.length,
      candidateBlockersById: blockersById,
      productionRegistry: defects.counts,
      productionMissingCanonicalSources: defects.counts.missing,
      productionProviderPreflightsBlocked: shardManifest.counts.provider.preflightBlocked,
    },
    rolloutState: {
      c9FormationScaleWorkParked: shardManifest.gates.c9FormationScaleWorkParked,
      c10FamilyRolloutParked: shardManifest.gates.c10FamilyRolloutParked,
      productionDispatchAuthorized: shardManifest.gates.productionDispatchAuthorized,
      providerDonorLaunchAuthorized: shardManifest.gates.providerDonorLaunchAuthorized,
    },
    packets: packetRecords,
  };
  return {
    schemas: {
      packet: packetSchema(),
      decision: decisionSchema(),
    },
    packets,
    decisionTemplates: Object.fromEntries(
      packets.map((packet) => [packet.candidate.subtypeId, makeDecisionTemplate(packet)]),
    ),
    index: { ...indexWithoutId, indexContentId: contentId(indexWithoutId) },
  };
}

function readme(state) {
  return `# Rock source admission packets\n\n` +
    `Status: **prepared, fail-closed, not promotable**.\n\n` +
    `These ${state.packets.length} packets bind the exact editable source revision, every declared source asset hash, nature/reference evidence, technical-gate evidence, provider/template provenance and the currently available visual review evidence. They do not modify the canonical authoring register and do not authorize C9, C10, provider launch or worker dispatch.\n\n` +
    `A reviewer must copy \`decision-template.json\` to \`decision.json\`, choose \`approved\` or \`rejected\`, preserve the exact evidence bindings, provide reviewer identity/time/rationale and the exact attestation, then set \`decisionContentId\` to the SHA-256 content identity reported by the verifier. Approval is still refused when any non-decision packet blocker remains.\n\n` +
    `Run:\n\n` +
    `- \`node scripts/prepare-rock-geology-v2-source-admission.mjs\`\n` +
    `- \`node scripts/verify-rock-geology-v2-source-admission.mjs\`\n` +
    `- \`node scripts/verify-rock-geology-v2-source-admission.mjs --require-promotion\` (expected to fail until all admissions are valid)\n\n` +
    `Current blocker counts are recorded exactly in \`index.json\`; pending decisions are not approvals.\n`;
}

function conciseReport(state) {
  const counts = state.index.counts;
  return `# Rock source admission report\n\n` +
    `Integrity preparation: **complete**. Promotion: **not authorized**. Dispatch: **not authorized**.\n\n` +
    `- Pending authored candidates: ${counts.candidates}\n` +
    `- Technical source packages passing: ${counts.technicallyPassed}\n` +
    `- Explicit approved human decisions: ${counts.approvedDecisions}\n` +
    `- Missing explicit human decisions: ${counts.pendingHumanDecisions}\n` +
    `- Missing neutral baked six-view evidence: ${counts.candidatesMissingNeutralBakeSixView}\n` +
    `- Advanced hoodoo/tor derivatives not bound to the named register revision: ${counts.advancedDerivativesNotRegisterBound}\n` +
    `- Total candidate blocker instances: ${counts.candidateBlockerInstances}\n` +
    `- Production subtypes with no authored source package: ${counts.productionMissingCanonicalSources}\n` +
    `- Provider preflights still blocked: ${counts.productionProviderPreflightsBlocked}\n\n` +
    `The six packet identities and every exact blocker are in \`index.json\`. No canonical register was modified.\n`;
}

export function writeSourceAdmissionState(state = buildSourceAdmissionState()) {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeJson(join(OUTPUT_ROOT, 'schemas/source-admission-packet.schema.json'), state.schemas.packet);
  writeJson(join(OUTPUT_ROOT, 'schemas/human-visual-decision.schema.json'), state.schemas.decision);
  for (const packet of state.packets) {
    const root = join(OUTPUT_ROOT, 'packets', packet.candidate.subtypeId);
    writeJson(join(root, 'packet.json'), packet);
    writeJson(join(root, 'decision-template.json'), state.decisionTemplates[packet.candidate.subtypeId]);
  }
  writeJson(join(OUTPUT_ROOT, 'index.json'), state.index);
  writeFileSync(join(OUTPUT_ROOT, 'README.md'), readme(state));
  writeFileSync(join(OUTPUT_ROOT, 'source-admission-report.md'), conciseReport(state));
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const state = writeSourceAdmissionState();
  console.log(
    JSON.stringify(
      {
        output: relative(REPO_ROOT, OUTPUT_ROOT),
        indexContentId: state.index.indexContentId,
        counts: state.index.counts,
        dispatchAuthorized: false,
      },
      null,
      2,
    ),
  );
}
