#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards',
);

const INPUTS = {
  register:
    'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/canonical-pilot/authoring-register.json',
  referenceManifest:
    'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-final/review/master-manifest.json',
  providerTriage:
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/provider-triage.json',
  providerRollout:
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/rollout-plan.json',
};

const TOR_PROCESS_FILES = [
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/approval.md',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/technical-verification.json',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/visual-checkpoint-audit.json',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/template-bridge-r01/template-bridge-audit.json',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/r04-runtime-package-r01/glb-audit.json',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/r04-runtime-package-r01/mobile-package-audit.json',
];

const HOODOO_PROCESS_FILES = [
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/approval.md',
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/developer-visual-decision.json',
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/checkpoint-status.json',
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/verification.json',
  'artifacts/research/rock-geology-v2/checkpoint-14-public-release/hoodoo-caprock/approval.md',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-scan-assisted-runtime-package/exports/hoodoo-caprock-lod0-desktop-4k.glb',
];

const EXPECTED = Object.freeze({ workerCount: 11, subtypeCount: 100, slotCount: 892 });
const APPROVED_SOURCE_STATUSES = new Set(['approved', 'authored-approved', 'visually-approved']);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function absolute(relativePath) {
  assert(!path.isAbsolute(relativePath), `absolute path is forbidden: ${relativePath}`);
  const resolved = path.resolve(repoRoot, relativePath);
  assert(
    resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`),
    `path escapes repository root: ${relativePath}`,
  );
  return resolved;
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(relativePath) {
  const resolved = absolute(relativePath);
  assert(fs.existsSync(resolved), `required file is missing: ${relativePath}`);
  return sha256Bytes(fs.readFileSync(resolved));
}

function readJson(relativePath) {
  const resolved = absolute(relativePath);
  assert(fs.existsSync(resolved), `required JSON is missing: ${relativePath}`);
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    fail(`invalid JSON ${relativePath}: ${error.message}`);
  }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function contentId(value) {
  return `sha256:${sha256Bytes(jsonBytes(value))}`;
}

function writeJson(relativeFromOutput, value) {
  const target = path.join(outputRoot, relativeFromOutput);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, jsonBytes(value));
}

function bindFiles(relativePaths) {
  return relativePaths.map((relativePath) => ({
    relativePath,
    sha256: sha256File(relativePath),
  }));
}

function referenceBinding(entry) {
  const hashKeys = ['sourceRecord', 'sourceImage', 'prompt', 'sheet', 'audit'];
  const files = hashKeys.map((key) => {
    const relativePath = entry.paths?.[key];
    const declaredSha256 = entry.hashes?.[key];
    assert(relativePath, `reference ${entry.id} has no ${key} path`);
    assert(declaredSha256, `reference ${entry.id} has no ${key} hash`);
    const actualSha256 = sha256File(relativePath);
    assert(
      actualSha256 === declaredSha256,
      `reference hash drift for ${entry.id}/${key}: ${actualSha256} != ${declaredSha256}`,
    );
    return { key, relativePath, sha256: actualSha256 };
  });
  assert(entry.packageComplete === true, `reference package is incomplete: ${entry.id}`);
  assert(entry.verifier?.passed === true, `reference verifier is not green: ${entry.id}`);
  return {
    subtypeId: entry.id,
    packageId: entry.packageId,
    directory: entry.paths.directory,
    packageComplete: true,
    files,
    immutableContentId: contentId(files),
  };
}

function sourcePackageBinding(slot) {
  const canonicalRoot = path.posix.join(path.posix.dirname(INPUTS.register), slot.slotId);
  if (slot.status === 'planned-unassigned') {
    return {
      canonicalPrimarySlotId: slot.slotId,
      status: 'missing',
      approved: false,
      requiredBeforeDispatch: true,
      expectedRoot: canonicalRoot,
      files: [],
    };
  }

  const files = [
    path.posix.join(canonicalRoot, 'canonical-source/source-manifest.json'),
    path.posix.join(canonicalRoot, 'round-trip-report.json'),
  ];
  return {
    canonicalPrimarySlotId: slot.slotId,
    status: slot.status,
    approved: APPROVED_SOURCE_STATUSES.has(slot.status),
    requiredBeforeDispatch: true,
    sourceRevision: slot.authoredEvidence?.sourceRevision ?? null,
    independentProvenance: slot.authoredEvidence?.independentProvenance === true,
    expectedRoot: canonicalRoot,
    files: bindFiles(files),
  };
}

function providerPrerequisite(triage, rolloutJobsBySubtype) {
  if (triage.lane !== 'provider-anchor-candidate') {
    return {
      applicable: false,
      providerIsRequired: false,
      providerDonorUseAuthorized: false,
      classification: triage.providerPreflight,
      status: 'not-applicable',
    };
  }
  const job = rolloutJobsBySubtype.get(triage.subtypeId);
  assert(job, `provider candidate has no preflight job: ${triage.subtypeId}`);
  return {
    applicable: true,
    providerIsRequired: false,
    requiredBeforeProviderDonorUse: true,
    providerDonorUseAuthorized: false,
    preflightId: job.id,
    preflightSlotId: job.slotId,
    provider: job.provider,
    alternates: job.providerAlternates,
    fallback: job.fallback,
    status: job.status,
  };
}

function exactWholeSubtypeAllocation(subtypeGroups, workerCount) {
  const totalSlots = subtypeGroups.reduce((sum, group) => sum + group.slotCount, 0);
  const sizes = [...new Set(subtypeGroups.map((group) => group.slotCount))].sort((a, b) => b - a);
  const available = sizes.map(
    (size) => subtypeGroups.filter((group) => group.slotCount === size).length,
  );
  const average = totalSlots / workerCount;
  const highCapacity = Math.ceil(average / 2) * 2;
  const lowCapacity = highCapacity - 2;
  const highCount = (totalSlots - lowCapacity * workerCount) / 2;
  assert(Number.isInteger(highCount), 'cannot form exact even whole-subtype worker capacities');
  assert(highCount >= 0 && highCount <= workerCount, 'invalid exact capacity distribution');
  const targets = Array.from(
    { length: workerCount },
    (_, index) => (index < highCount ? highCapacity : lowCapacity),
  );
  const minSubtypeCount = Math.floor(subtypeGroups.length / workerCount);
  const maxSubtypeCount = Math.ceil(subtypeGroups.length / workerCount);

  function compositions(target) {
    const output = [];
    function visit(sizeIndex, remaining, counts, itemCount) {
      if (sizeIndex === sizes.length) {
        if (remaining === 0 && itemCount >= minSubtypeCount && itemCount <= maxSubtypeCount) {
          output.push([...counts]);
        }
        return;
      }
      const size = sizes[sizeIndex];
      const max = Math.min(available[sizeIndex], Math.floor(remaining / size));
      for (let count = 0; count <= max; count += 1) {
        if (itemCount + count > maxSubtypeCount) break;
        counts.push(count);
        visit(sizeIndex + 1, remaining - count * size, counts, itemCount + count);
        counts.pop();
      }
    }
    visit(0, target, [], 0);
    return output.sort((left, right) => {
      const leftCount = left.reduce((sum, value) => sum + value, 0);
      const rightCount = right.reduce((sum, value) => sum + value, 0);
      return (
        Math.abs(leftCount - minSubtypeCount) - Math.abs(rightCount - minSubtypeCount) ||
        JSON.stringify(left).localeCompare(JSON.stringify(right))
      );
    });
  }

  const candidatesByTarget = new Map(
    [...new Set(targets)].map((target) => [target, compositions(target)]),
  );
  let selected = null;
  function solve(workerIndex, used, plan) {
    if (workerIndex === targets.length) {
      if (used.every((count, index) => count === available[index])) selected = [...plan];
      return selected !== null;
    }
    for (const candidate of candidatesByTarget.get(targets[workerIndex]) ?? []) {
      const next = used.map((count, index) => count + candidate[index]);
      if (next.some((count, index) => count > available[index])) continue;
      if (solve(workerIndex + 1, next, [...plan, candidate])) return true;
    }
    return false;
  }
  assert(solve(0, sizes.map(() => 0), []), 'no exact whole-subtype shard packing exists');

  const providerAvailable = sizes.map(
    (size) =>
      subtypeGroups.filter(
        (group) => group.slotCount === size && group.lane === 'provider-anchor-candidate',
      ).length,
  );
  const providerTotal = providerAvailable.reduce((sum, count) => sum + count, 0);
  const providerBase = Math.floor(providerTotal / workerCount);
  const providerExtra = providerTotal % workerCount;
  const providerTargets = Array.from(
    { length: workerCount },
    (_, index) => providerBase + (index < providerExtra ? 1 : 0),
  );
  const providerCandidatesByWorker = selected.map((composition, workerIndex) => {
    const output = [];
    function visit(sizeIndex, remaining, counts) {
      if (sizeIndex === sizes.length) {
        if (remaining === 0) output.push([...counts]);
        return;
      }
      for (let count = 0; count <= Math.min(composition[sizeIndex], remaining); count += 1) {
        counts.push(count);
        visit(sizeIndex + 1, remaining - count, counts);
        counts.pop();
      }
    }
    visit(0, providerTargets[workerIndex], []);
    return output.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  });
  let selectedProvider = null;
  function solveProvider(workerIndex, used, plan) {
    if (workerIndex === workerCount) {
      if (used.every((count, index) => count === providerAvailable[index])) {
        selectedProvider = [...plan];
      }
      return selectedProvider !== null;
    }
    for (const candidate of providerCandidatesByWorker[workerIndex]) {
      const next = used.map((count, index) => count + candidate[index]);
      if (next.some((count, index) => count > providerAvailable[index])) continue;
      if (solveProvider(workerIndex + 1, next, [...plan, candidate])) return true;
    }
    return false;
  }
  assert(
    solveProvider(0, sizes.map(() => 0), []),
    'no balanced provider-candidate distribution exists for the exact slot packing',
  );

  const buckets = new Map(
    sizes.map((size) => {
      const matching = subtypeGroups
        .filter((group) => group.slotCount === size)
        .sort((a, b) => a.subtypeId.localeCompare(b.subtypeId));
      return [
        size,
        {
          provider: matching.filter((group) => group.lane === 'provider-anchor-candidate'),
          standard: matching.filter((group) => group.lane !== 'provider-anchor-candidate'),
        },
      ];
    }),
  );
  return targets.map((target, workerIndex) => {
    const subtypes = [];
    selected[workerIndex].forEach((count, sizeIndex) => {
      const bucket = buckets.get(sizes[sizeIndex]);
      const providerCount = selectedProvider[workerIndex][sizeIndex];
      subtypes.push(...bucket.provider.splice(0, providerCount));
      subtypes.push(...bucket.standard.splice(0, count - providerCount));
    });
    assert(
      subtypes.reduce((sum, subtype) => sum + subtype.slotCount, 0) === target,
      `worker ${workerIndex + 1} exact packing drift`,
    );
    return {
      workerId: `sol-high-worker-${String(workerIndex + 1).padStart(2, '0')}`,
      slotCount: target,
      subtypes,
    };
  });
}

function main() {
  const register = readJson(INPUTS.register);
  const referenceManifest = readJson(INPUTS.referenceManifest);
  const providerTriage = readJson(INPUTS.providerTriage);
  const providerRollout = readJson(INPUTS.providerRollout);

  assert(register.schema === 'toonlab/rock-canonical-authoring-register', 'unexpected register schema');
  assert(register.slots?.length === EXPECTED.slotCount, `expected ${EXPECTED.slotCount} slots`);
  assert(register.baselineCount === EXPECTED.slotCount, 'register baseline count drift');
  assert(referenceManifest.entries?.length === EXPECTED.subtypeCount, 'reference subtype count drift');
  assert(referenceManifest.counts?.completePackages === EXPECTED.subtypeCount, 'reference packages incomplete');
  assert(providerTriage.subtypes?.length === EXPECTED.subtypeCount, 'provider triage subtype count drift');
  assert(
    providerTriage.generatedFromRegisterSha256 === sha256File(INPUTS.register),
    'provider triage was generated from a different register',
  );

  const slotsById = new Map();
  const slotsBySubtype = new Map();
  for (const slot of register.slots) {
    assert(!slotsById.has(slot.slotId), `duplicate register slot: ${slot.slotId}`);
    slotsById.set(slot.slotId, slot);
    if (!slotsBySubtype.has(slot.subtypeId)) slotsBySubtype.set(slot.subtypeId, []);
    slotsBySubtype.get(slot.subtypeId).push(slot);
  }
  assert(slotsBySubtype.size === EXPECTED.subtypeCount, 'register subtype count drift');

  const referencesBySubtype = new Map(
    referenceManifest.entries.map((entry) => [entry.id, referenceBinding(entry)]),
  );
  assert(referencesBySubtype.size === EXPECTED.subtypeCount, 'duplicate reference subtype');

  const triageBySubtype = new Map(providerTriage.subtypes.map((entry) => [entry.subtypeId, entry]));
  assert(triageBySubtype.size === EXPECTED.subtypeCount, 'duplicate provider triage subtype');

  const providerJobs = (providerRollout.providerPreflight?.batches ?? []).flatMap(
    (batch) => batch.jobs ?? [],
  );
  const rolloutJobsBySubtype = new Map(providerJobs.map((job) => [job.subtypeId, job]));
  assert(rolloutJobsBySubtype.size === providerJobs.length, 'duplicate provider preflight subtype');

  const subtypeGroups = [];
  for (const [subtypeId, slots] of slotsBySubtype) {
    const orderedSlots = [...slots].sort((a, b) => a.index - b.index || a.slotId.localeCompare(b.slotId));
    const primary = orderedSlots.filter((slot) => slot.reviewRole === 'canonical-primary');
    assert(primary.length === 1, `${subtypeId} must have exactly one canonical primary`);
    assert(primary[0].index === 1, `${subtypeId} primary must be index 1`);
    const triage = triageBySubtype.get(subtypeId);
    const reference = referencesBySubtype.get(subtypeId);
    assert(triage, `missing provider triage: ${subtypeId}`);
    assert(reference, `missing immutable reference package: ${subtypeId}`);
    assert(triage.familyId === primary[0].familyId, `family mismatch in triage: ${subtypeId}`);
    assert(triage.slotCount === orderedSlots.length, `slot count mismatch in triage: ${subtypeId}`);
    assert(triage.canonicalPrimarySlotId === primary[0].slotId, `primary mismatch in triage: ${subtypeId}`);

    const sourcePackage = sourcePackageBinding(primary[0]);
    const provider = providerPrerequisite(triage, rolloutJobsBySubtype);
    subtypeGroups.push({
      subtypeId,
      familyId: primary[0].familyId,
      lane: triage.lane,
      rationale: triage.rationale,
      slotCount: orderedSlots.length,
      canonicalPrimarySlotId: primary[0].slotId,
      immutableReference: reference,
      sourcePackagePrerequisite: sourcePackage,
      providerCandidatePrerequisite: provider,
      slots: orderedSlots.map((slot) => ({
        slotId: slot.slotId,
        subtypeId: slot.subtypeId,
        familyId: slot.familyId,
        index: slot.index,
        reviewRole: slot.reviewRole,
        status: slot.status,
        baselineMode: slot.baselineMode,
        baselineCountRule: slot.baselineCountRule,
        referenceIds: slot.referenceIds,
        requiredDeliverables: slot.requiredDeliverables,
        dependencies:
          slot.reviewRole === 'canonical-primary'
            ? [`reference-package:${subtypeId}`, 'global-gate:tor-visual-acceptance']
            : [
                `reference-package:${subtypeId}`,
                `slot:${primary[0].slotId}`,
                `source-package:${primary[0].slotId}`,
                'global-gate:tor-visual-acceptance',
              ],
        optionalDependencies:
          triage.lane === 'provider-anchor-candidate'
            ? [`provider-preflight:${subtypeId}`]
            : [],
        statusForProduction: 'blocked-not-dispatchable',
        dispatchAuthorized: false,
      })),
    });
  }

  // Exact packing retains complete subtype ownership while achieving the closest
  // possible even capacities around 892 / 11: six workers at 82 and five at 80.
  const workers = exactWholeSubtypeAllocation(subtypeGroups, EXPECTED.workerCount);

  const registerStatusCounts = Object.fromEntries(
    [...new Set(register.slots.map((slot) => slot.status))]
      .sort()
      .map((status) => [status, register.slots.filter((slot) => slot.status === status).length]),
  );
  const sourceCounts = {
    approved: subtypeGroups.filter((group) => group.sourcePackagePrerequisite.approved).length,
    awaitingVisualReview: subtypeGroups.filter(
      (group) => group.sourcePackagePrerequisite.status === 'authored-awaiting-visual-review',
    ).length,
    missing: subtypeGroups.filter((group) => group.sourcePackagePrerequisite.status === 'missing').length,
  };
  const providerCounts = {
    candidates: subtypeGroups.filter((group) => group.providerCandidatePrerequisite.applicable).length,
    donorUseAuthorized: subtypeGroups.filter(
      (group) => group.providerCandidatePrerequisite.providerDonorUseAuthorized,
    ).length,
    preflightBlocked: subtypeGroups.filter(
      (group) =>
        group.providerCandidatePrerequisite.applicable &&
        !group.providerCandidatePrerequisite.providerDonorUseAuthorized,
    ).length,
  };

  const torTechnical = readJson(TOR_PROCESS_FILES[1]);
  const torVisual = readJson(TOR_PROCESS_FILES[2]);
  const hoodooStatus = readJson(HOODOO_PROCESS_FILES[2]);
  assert(torTechnical.passed === true, 'tor R04 technical verification is not green');
  assert(torVisual.visualApproval === false, 'tor visual state changed; re-audit dispatch gates');
  assert(torVisual.catalogFanoutBlocked === true, 'tor catalog fanout is unexpectedly unblocked');
  assert(hoodooStatus.developerVisualApproval === true, 'hoodoo MVP benchmark approval is missing');

  const sourceBindingsCore = {
    authoringRegister: {
      relativePath: INPUTS.register,
      sha256: sha256File(INPUTS.register),
      declaredSourceContentId: register.sourceContentId,
    },
    referenceMasterManifest: {
      relativePath: INPUTS.referenceManifest,
      sha256: sha256File(INPUTS.referenceManifest),
      taxonomySha256: referenceManifest.taxonomy?.sha256,
    },
    providerTriage: {
      relativePath: INPUTS.providerTriage,
      sha256: sha256File(INPUTS.providerTriage),
    },
    providerRollout: {
      relativePath: INPUTS.providerRollout,
      sha256: sha256File(INPUTS.providerRollout),
    },
    torProcessPackage: bindFiles(TOR_PROCESS_FILES),
    hoodooProcessPackage: bindFiles(HOODOO_PROCESS_FILES),
  };
  const sourceBindingId = contentId(sourceBindingsCore);

  const registryDefects = [
    {
      id: 'no-approved-canonical-production-sources',
      severity: 'blocking',
      count: EXPECTED.subtypeCount - sourceCounts.approved,
      detail: `${sourceCounts.awaitingVisualReview} canonical primaries await visual review and ${sourceCounts.missing} are missing; zero are approved for production dispatch.`,
    },
    {
      id: 'tor-register-revision-does-not-promote-r04',
      severity: 'blocking',
      count: 1,
      detail:
        'The tor register record remains sourceRevision 1 and authored-awaiting-visual-review; it does not promote the technically green R04 process package, whose visual gate is still false.',
    },
    {
      id: 'hoodoo-register-revision-does-not-promote-mature-process-package',
      severity: 'blocking',
      count: 1,
      detail:
        'The hoodoo MVP visual benchmark is developer-approved, but the full-catalog register remains sourceRevision 1 and has no promoted mapping to the later neutral/runtime/stylization package.',
    },
    {
      id: 'provider-candidate-preflights-not-authorized',
      severity: 'blocking-for-provider-donor-use-only',
      count: providerCounts.preflightBlocked,
      detail:
        'The legacy full-catalog provider preflights remain unauthorized. The separately authorized 20-candidate MVP batch does not authorize this 29-candidate/full-rollout plan.',
    },
    {
      id: 'authored-records-have-no-explicit-visual-decision-field',
      severity: 'blocking',
      count: sourceCounts.awaitingVisualReview,
      detail:
        'The register encodes an awaiting-review status but no immutable approver, decision, approval evidence hash, or promoted source-package content ID.',
    },
  ];

  const shardRecords = [];
  for (const worker of workers) {
    const shardCore = {
      schema: 'toonlab/rock-production-worker-shard',
      version: 1,
      workerId: worker.workerId,
      status: 'blocked-not-dispatchable',
      dispatchAuthorized: false,
      sourceBindingId,
      globalDependencies: [
        'tor-visual-acceptance',
        'approved-canonical-source-package-for-each-owned-subtype',
        'immutable-reference-hashes-still-match',
        'checkpoint-09-and-checkpoint-10-remain-parked-during-preparation',
      ],
      counts: {
        subtypes: worker.subtypes.length,
        slots: worker.slotCount,
        providerCandidates: worker.subtypes.filter(
          (subtype) => subtype.providerCandidatePrerequisite.applicable,
        ).length,
        approvedSourcePackages: worker.subtypes.filter(
          (subtype) => subtype.sourcePackagePrerequisite.approved,
        ).length,
      },
      subtypeOwnership: [...worker.subtypes].sort((a, b) => a.subtypeId.localeCompare(b.subtypeId)),
    };
    const shard = { ...shardCore, shardContentId: contentId(shardCore) };
    const relativePath = `shards/${worker.workerId}.json`;
    writeJson(relativePath, shard);
    const fileSha256 = sha256File(
      path.posix.join(
        'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards',
        relativePath,
      ),
    );
    shardRecords.push({
      workerId: worker.workerId,
      relativePath: path.posix.join(
        'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards',
        relativePath,
      ),
      sha256: fileSha256,
      shardContentId: shard.shardContentId,
      subtypeCount: worker.subtypes.length,
      slotCount: worker.slotCount,
      dispatchAuthorized: false,
    });
  }

  writeJson('registry-defects.json', {
    schema: 'toonlab/rock-production-registry-defects',
    version: 1,
    status: 'blocking',
    counts: sourceCounts,
    authoredAwaitingVisualReview: subtypeGroups
      .filter(
        (group) => group.sourcePackagePrerequisite.status === 'authored-awaiting-visual-review',
      )
      .map((group) => ({
        subtypeId: group.subtypeId,
        canonicalPrimarySlotId: group.canonicalPrimarySlotId,
        sourceRevision: group.sourcePackagePrerequisite.sourceRevision,
        immutableFiles: group.sourcePackagePrerequisite.files,
      }))
      .sort((a, b) => a.subtypeId.localeCompare(b.subtypeId)),
    missingCanonicalSources: subtypeGroups
      .filter((group) => group.sourcePackagePrerequisite.status === 'missing')
      .map((group) => ({
        subtypeId: group.subtypeId,
        canonicalPrimarySlotId: group.canonicalPrimarySlotId,
        expectedRoot: group.sourcePackagePrerequisite.expectedRoot,
      }))
      .sort((a, b) => a.subtypeId.localeCompare(b.subtypeId)),
    defects: registryDefects,
  });
  const registryDefectsBinding = {
    relativePath:
      'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/registry-defects.json',
    sha256: sha256File(
      'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/registry-defects.json',
    ),
  };

  const slotCounts = workers.map((worker) => worker.slotCount);
  const manifestCore = {
    schema: 'toonlab/rock-production-shard-manifest',
    version: 1,
    status: 'blocked-not-dispatchable',
    dispatchAuthorized: false,
    purpose:
      'Deterministic ownership preparation only. This manifest does not generate assets, un-park C9/C10, authorize providers, or authorize worker dispatch.',
    allocationPolicy: {
      algorithm: 'whole-subtype-deterministic-exact-capacity-packing',
      capacities: { 80: 5, 82: 6 },
      providerCandidateCountPerWorker: { min: 2, max: 3 },
      tieBreakers: ['subtype-count-nearest-floor-average', 'size-composition', 'subtype-id'],
      subtypeSplitAllowed: false,
      assetGenerationPerformed: false,
    },
    sourceBindingId,
    sourceBindings: sourceBindingsCore,
    supportingEvidence: {
      registryDefects: registryDefectsBinding,
    },
    gates: {
      torR04TechnicalVerification: true,
      torVisualAcceptance: false,
      torCatalogFanoutBlocked: true,
      allCanonicalSourcePackagesApproved: false,
      hoodooDeveloperVisualApproval: true,
      providerDonorLaunchAuthorized: false,
      c9FormationScaleWorkParked: true,
      c10FamilyRolloutParked: true,
      productionDispatchAuthorized: false,
    },
    counts: {
      workers: workers.length,
      subtypes: subtypeGroups.length,
      slots: register.slots.length,
      registerStatus: registerStatusCounts,
      sourcePackages: sourceCounts,
      provider: providerCounts,
      immutableReferencePackages: referencesBySubtype.size,
      minSlotsPerWorker: Math.min(...slotCounts),
      maxSlotsPerWorker: Math.max(...slotCounts),
    },
    blockers: registryDefects.map((defect) => defect.id),
    shards: shardRecords,
  };
  const manifest = { ...manifestCore, manifestContentId: contentId(manifestCore) };
  writeJson('manifest.json', manifest);

  const readme = `# Rock geology v2 production shards\n\n` +
    `Status: **blocked / not dispatchable**.\n\n` +
    `This directory assigns all ${EXPECTED.slotCount} registered slots in all ${EXPECTED.subtypeCount} subtypes to ${EXPECTED.workerCount} deterministic, disjoint workers. Whole subtypes stay with one owner. No asset generation occurred and C9/C10 remain parked.\n\n` +
    `The immutable nature-reference packages are complete (${referencesBySubtype.size}/${EXPECTED.subtypeCount}), but canonical production sources are not approved: ${sourceCounts.approved} approved, ${sourceCounts.awaitingVisualReview} awaiting visual review, ${sourceCounts.missing} missing. Tor R04 is technically green but its visual acceptance and catalog-fanout gates remain false. Hoodoo is approved as the separate MVP visual benchmark, but that does not promote its full-catalog register record.\n\n` +
    `Run \`node scripts/verify-rock-geology-v2-production-shards.mjs\` after generation and before any future dispatch decision. A green structural verification must never be interpreted as production authorization.\n`;
  fs.writeFileSync(path.join(outputRoot, 'README.md'), readme);

  console.log(
    JSON.stringify(
      {
        planningPassed: true,
        dispatchAuthorized: false,
        workers: workers.length,
        subtypes: subtypeGroups.length,
        slots: register.slots.length,
        minSlotsPerWorker: Math.min(...slotCounts),
        maxSlotsPerWorker: Math.max(...slotCounts),
        sourcePackages: sourceCounts,
        provider: providerCounts,
        manifestContentId: manifest.manifestContentId,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(`production shard planning failed closed: ${error.message}`);
  process.exitCode = 1;
}
