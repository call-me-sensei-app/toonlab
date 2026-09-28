#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot =
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards';
const outputRoot = path.join(repoRoot, evidenceRoot);
const manifestPath = `${evidenceRoot}/manifest.json`;
const registerPath =
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/canonical-pilot/authoring-register.json';
const referenceManifestPath =
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-final/review/master-manifest.json';
const providerTriagePath =
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/provider-triage.json';
const providerRolloutPath =
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/rollout-plan.json';
const EXPECTED = Object.freeze({ workers: 11, subtypes: 100, slots: 892 });

const checks = [];
const failures = [];

function absolute(relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
    throw new Error(`absolute or invalid path is forbidden: ${relativePath}`);
  }
  const resolved = path.resolve(repoRoot, relativePath);
  if (!(resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`))) {
    throw new Error(`path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

function readBytes(relativePath) {
  const resolved = absolute(relativePath);
  if (!fs.existsSync(resolved)) throw new Error(`missing file: ${relativePath}`);
  return fs.readFileSync(resolved);
}

function readJson(relativePath) {
  try {
    return JSON.parse(readBytes(relativePath).toString('utf8'));
  } catch (error) {
    throw new Error(`cannot read JSON ${relativePath}: ${error.message}`);
  }
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(relativePath) {
  return sha256Bytes(readBytes(relativePath));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function contentId(value) {
  return `sha256:${sha256Bytes(jsonBytes(value))}`;
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function check(id, condition, detail) {
  const passed = Boolean(condition);
  checks.push({ id, passed, detail });
  if (!passed) failures.push({ id, detail });
  return passed;
}

function collectAbsolutePaths(value, pointer = '$', result = []) {
  if (typeof value === 'string' && path.isAbsolute(value)) result.push({ pointer, value });
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAbsolutePaths(item, `${pointer}[${index}]`, result));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectAbsolutePaths(item, `${pointer}.${key}`, result);
    }
  }
  return result;
}

function expectedAllocation(register, triageBySubtype) {
  const groups = new Map();
  for (const slot of register.slots) {
    if (!groups.has(slot.subtypeId)) groups.set(slot.subtypeId, []);
    groups.get(slot.subtypeId).push(slot);
  }
  const subtypeGroups = [...groups.entries()].map(([subtypeId, slots]) => ({
    subtypeId,
    slotCount: slots.length,
  }));
  const totalSlots = subtypeGroups.reduce((sum, group) => sum + group.slotCount, 0);
  const sizes = [...new Set(subtypeGroups.map((group) => group.slotCount))].sort((a, b) => b - a);
  const available = sizes.map(
    (size) => subtypeGroups.filter((group) => group.slotCount === size).length,
  );
  const average = totalSlots / EXPECTED.workers;
  const highCapacity = Math.ceil(average / 2) * 2;
  const lowCapacity = highCapacity - 2;
  const highCount = (totalSlots - lowCapacity * EXPECTED.workers) / 2;
  const targets = Array.from(
    { length: EXPECTED.workers },
    (_, index) => (index < highCount ? highCapacity : lowCapacity),
  );
  const minSubtypeCount = Math.floor(subtypeGroups.length / EXPECTED.workers);
  const maxSubtypeCount = Math.ceil(subtypeGroups.length / EXPECTED.workers);

  function compositions(target) {
    const output = [];
    function visit(sizeIndex, remaining, counts, itemCount) {
      if (sizeIndex === sizes.length) {
        if (remaining === 0 && itemCount >= minSubtypeCount && itemCount <= maxSubtypeCount) {
          output.push([...counts]);
        }
        return;
      }
      const max = Math.min(available[sizeIndex], Math.floor(remaining / sizes[sizeIndex]));
      for (let count = 0; count <= max; count += 1) {
        if (itemCount + count > maxSubtypeCount) break;
        counts.push(count);
        visit(
          sizeIndex + 1,
          remaining - count * sizes[sizeIndex],
          counts,
          itemCount + count,
        );
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
  if (!solve(0, sizes.map(() => 0), [])) throw new Error('cannot recompute exact shard packing');

  const providerAvailable = sizes.map(
    (size) =>
      subtypeGroups.filter(
        (group) =>
          group.slotCount === size &&
          triageBySubtype.get(group.subtypeId)?.lane === 'provider-anchor-candidate',
      ).length,
  );
  const providerTotal = providerAvailable.reduce((sum, count) => sum + count, 0);
  const providerBase = Math.floor(providerTotal / EXPECTED.workers);
  const providerExtra = providerTotal % EXPECTED.workers;
  const providerTargets = Array.from(
    { length: EXPECTED.workers },
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
    if (workerIndex === EXPECTED.workers) {
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
  if (!solveProvider(0, sizes.map(() => 0), [])) {
    throw new Error('cannot recompute balanced provider distribution');
  }

  const buckets = new Map(
    sizes.map((size) => {
      const matching = subtypeGroups
        .filter((group) => group.slotCount === size)
        .sort((a, b) => a.subtypeId.localeCompare(b.subtypeId));
      return [
        size,
        {
          provider: matching.filter(
            (group) =>
              triageBySubtype.get(group.subtypeId)?.lane === 'provider-anchor-candidate',
          ),
          standard: matching.filter(
            (group) =>
              triageBySubtype.get(group.subtypeId)?.lane !== 'provider-anchor-candidate',
          ),
        },
      ];
    }),
  );
  const workers = targets.map((target, workerIndex) => {
    const subtypes = [];
    selected[workerIndex].forEach((count, sizeIndex) => {
      const bucket = buckets.get(sizes[sizeIndex]);
      const providerCount = selectedProvider[workerIndex][sizeIndex];
      subtypes.push(...bucket.provider.splice(0, providerCount));
      subtypes.push(...bucket.standard.splice(0, count - providerCount));
    });
    return {
      workerId: `sol-high-worker-${String(workerIndex + 1).padStart(2, '0')}`,
      target,
      subtypes: subtypes.map((subtype) => subtype.subtypeId).sort((a, b) => a.localeCompare(b)),
    };
  });
  return new Map(workers.map((worker) => [worker.workerId, worker.subtypes]));
}

function verify() {
  const manifest = readJson(manifestPath);
  const register = readJson(registerPath);
  const referenceManifest = readJson(referenceManifestPath);
  const providerTriage = readJson(providerTriagePath);
  const providerRollout = readJson(providerRolloutPath);

  check('manifest-schema', manifest.schema === 'toonlab/rock-production-shard-manifest', manifest.schema);
  check('manifest-version', manifest.version === 1, manifest.version);
  check(
    'manifest-blocked-not-dispatchable',
    manifest.status === 'blocked-not-dispatchable' && manifest.dispatchAuthorized === false,
    `${manifest.status}; dispatch=${manifest.dispatchAuthorized}`,
  );
  const { manifestContentId, ...manifestCore } = manifest;
  check(
    'manifest-content-id',
    manifestContentId === contentId(manifestCore),
    `${manifestContentId} vs ${contentId(manifestCore)}`,
  );
  check(
    'manifest-has-no-absolute-paths',
    collectAbsolutePaths(manifest).length === 0,
    JSON.stringify(collectAbsolutePaths(manifest)),
  );

  check('register-schema', register.schema === 'toonlab/rock-canonical-authoring-register', register.schema);
  check('register-slot-count', register.slots?.length === EXPECTED.slots, register.slots?.length);
  check(
    'register-source-count',
    register.slots.filter((slot) => slot.reviewRole === 'canonical-primary').length === EXPECTED.subtypes,
    register.slots.filter((slot) => slot.reviewRole === 'canonical-primary').length,
  );
  check(
    'reference-package-count',
    referenceManifest.entries?.length === EXPECTED.subtypes &&
      referenceManifest.counts?.completePackages === EXPECTED.subtypes,
    JSON.stringify(referenceManifest.counts),
  );
  check(
    'provider-triage-register-binding',
    providerTriage.generatedFromRegisterSha256 === sha256File(registerPath),
    `${providerTriage.generatedFromRegisterSha256} vs ${sha256File(registerPath)}`,
  );

  const bindingExpectations = {
    authoringRegister: registerPath,
    referenceMasterManifest: referenceManifestPath,
    providerTriage: providerTriagePath,
    providerRollout: providerRolloutPath,
  };
  for (const [key, relativePath] of Object.entries(bindingExpectations)) {
    const binding = manifest.sourceBindings?.[key];
    check(
      `source-binding-${key}`,
      binding?.relativePath === relativePath && binding?.sha256 === sha256File(relativePath),
      `${binding?.relativePath}:${binding?.sha256} vs ${relativePath}:${sha256File(relativePath)}`,
    );
  }
  for (const packageName of ['torProcessPackage', 'hoodooProcessPackage']) {
    const packageBindings = manifest.sourceBindings?.[packageName];
    check(
      `source-binding-${packageName}-present`,
      Array.isArray(packageBindings) && packageBindings.length > 0,
      packageBindings?.length,
    );
    for (const binding of packageBindings ?? []) {
      let actual = null;
      try {
        actual = sha256File(binding.relativePath);
      } catch (error) {
        actual = `ERROR:${error.message}`;
      }
      check(
        `source-binding-${packageName}-${binding.relativePath}`,
        actual === binding.sha256,
        `${actual} vs ${binding.sha256}`,
      );
    }
  }
  check(
    'source-binding-content-id',
    manifest.sourceBindingId === contentId(manifest.sourceBindings),
    `${manifest.sourceBindingId} vs ${contentId(manifest.sourceBindings)}`,
  );
  const defectsBinding = manifest.supportingEvidence?.registryDefects;
  check(
    'registry-defects-hash-binding',
    defectsBinding?.relativePath === `${evidenceRoot}/registry-defects.json` &&
      defectsBinding?.sha256 === sha256File(`${evidenceRoot}/registry-defects.json`),
    `${defectsBinding?.relativePath}:${defectsBinding?.sha256}`,
  );

  const torTechnicalPath = manifest.sourceBindings?.torProcessPackage?.find((entry) =>
    entry.relativePath.endsWith('/technical-verification.json'),
  )?.relativePath;
  const torVisualPath = manifest.sourceBindings?.torProcessPackage?.find((entry) =>
    entry.relativePath.endsWith('/visual-checkpoint-audit.json'),
  )?.relativePath;
  const hoodooStatusPath = manifest.sourceBindings?.hoodooProcessPackage?.find((entry) =>
    entry.relativePath.endsWith('/checkpoint-status.json'),
  )?.relativePath;
  const torTechnical = torTechnicalPath ? readJson(torTechnicalPath) : {};
  const torVisual = torVisualPath ? readJson(torVisualPath) : {};
  const hoodooStatus = hoodooStatusPath ? readJson(hoodooStatusPath) : {};
  check('tor-technical-green', torTechnical.passed === true, torTechnical.passed);
  check(
    'tor-visual-still-blocked',
    torVisual.visualApproval === false && torVisual.catalogFanoutBlocked === true,
    `visual=${torVisual.visualApproval}; fanoutBlocked=${torVisual.catalogFanoutBlocked}`,
  );
  check(
    'hoodoo-mvp-visual-benchmark-approved',
    hoodooStatus.developerVisualApproval === true,
    hoodooStatus.developerVisualApproval,
  );
  check(
    'c9-c10-explicitly-parked',
    manifest.gates?.c9FormationScaleWorkParked === true &&
      manifest.gates?.c10FamilyRolloutParked === true,
    JSON.stringify(manifest.gates),
  );
  check(
    'all-dispatch-gates-false',
    manifest.gates?.torVisualAcceptance === false &&
      manifest.gates?.allCanonicalSourcePackagesApproved === false &&
      manifest.gates?.providerDonorLaunchAuthorized === false &&
      manifest.gates?.productionDispatchAuthorized === false &&
      manifest.gates?.hoodooDeveloperVisualApproval === true,
    JSON.stringify(manifest.gates),
  );

  const referenceBySubtype = new Map(referenceManifest.entries.map((entry) => [entry.id, entry]));
  const triageBySubtype = new Map(providerTriage.subtypes.map((entry) => [entry.subtypeId, entry]));
  const providerJobs = (providerRollout.providerPreflight?.batches ?? []).flatMap(
    (batch) => batch.jobs ?? [],
  );
  const providerJobBySubtype = new Map(providerJobs.map((job) => [job.subtypeId, job]));
  const registerSlotById = new Map(register.slots.map((slot) => [slot.slotId, slot]));
  const expectedWorkers = expectedAllocation(register, triageBySubtype);

  check('shard-record-count', manifest.shards?.length === EXPECTED.workers, manifest.shards?.length);
  const expectedShardPaths = new Set((manifest.shards ?? []).map((record) => record.relativePath));
  const actualShardPaths = fs
    .readdirSync(path.join(outputRoot, 'shards'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => `${evidenceRoot}/shards/${entry.name}`)
    .sort();
  check(
    'no-extra-or-missing-shard-files',
    actualShardPaths.length === EXPECTED.workers &&
      actualShardPaths.every((relativePath) => expectedShardPaths.has(relativePath)),
    JSON.stringify(actualShardPaths),
  );
  const seenWorkers = new Set();
  const seenSubtypes = new Map();
  const seenSlots = new Map();
  let referenceFilesChecked = 0;
  let sourceFilesChecked = 0;
  let providerCandidatesChecked = 0;
  const slotCounts = [];

  for (const record of manifest.shards ?? []) {
    check(`worker-unique-${record.workerId}`, !seenWorkers.has(record.workerId), record.workerId);
    seenWorkers.add(record.workerId);
    let shard;
    try {
      shard = readJson(record.relativePath);
    } catch (error) {
      check(`shard-readable-${record.workerId}`, false, error.message);
      continue;
    }
    const actualHash = sha256File(record.relativePath);
    check(
      `shard-file-hash-${record.workerId}`,
      actualHash === record.sha256,
      `${actualHash} vs ${record.sha256}`,
    );
    const { shardContentId, ...shardCore } = shard;
    check(
      `shard-content-id-${record.workerId}`,
      shardContentId === contentId(shardCore) && shardContentId === record.shardContentId,
      `${shardContentId} vs ${contentId(shardCore)} vs ${record.shardContentId}`,
    );
    check(
      `shard-identity-${record.workerId}`,
      shard.workerId === record.workerId && shard.schema === 'toonlab/rock-production-worker-shard',
      `${shard.workerId}:${shard.schema}`,
    );
    check(
      `shard-blocked-${record.workerId}`,
      shard.status === 'blocked-not-dispatchable' &&
        shard.dispatchAuthorized === false &&
        record.dispatchAuthorized === false,
      `${shard.status}; shard=${shard.dispatchAuthorized}; record=${record.dispatchAuthorized}`,
    );
    check(
      `shard-source-binding-${record.workerId}`,
      shard.sourceBindingId === manifest.sourceBindingId,
      `${shard.sourceBindingId} vs ${manifest.sourceBindingId}`,
    );
    check(
      `shard-no-absolute-paths-${record.workerId}`,
      collectAbsolutePaths(shard).length === 0,
      JSON.stringify(collectAbsolutePaths(shard)),
    );

    const actualSubtypeIds = (shard.subtypeOwnership ?? [])
      .map((subtype) => subtype.subtypeId)
      .sort((a, b) => a.localeCompare(b));
    check(
      `deterministic-allocation-${record.workerId}`,
      equalJson(actualSubtypeIds, expectedWorkers.get(record.workerId) ?? []),
      `${JSON.stringify(actualSubtypeIds)} vs ${JSON.stringify(expectedWorkers.get(record.workerId))}`,
    );
    const actualSlotCount = (shard.subtypeOwnership ?? []).reduce(
      (sum, subtype) => sum + (subtype.slots?.length ?? 0),
      0,
    );
    const actualProviderCount = (shard.subtypeOwnership ?? []).filter(
      (subtype) => subtype.providerCandidatePrerequisite?.applicable === true,
    ).length;
    slotCounts.push(actualSlotCount);
    check(
      `shard-counts-${record.workerId}`,
      actualSlotCount === record.slotCount &&
        actualSlotCount === shard.counts?.slots &&
        actualSubtypeIds.length === record.subtypeCount &&
        actualSubtypeIds.length === shard.counts?.subtypes &&
        actualProviderCount === shard.counts?.providerCandidates,
      `${actualSlotCount}/${actualSubtypeIds.length}/${actualProviderCount}`,
    );

    for (const subtype of shard.subtypeOwnership ?? []) {
      if (seenSubtypes.has(subtype.subtypeId)) {
        check(
          `subtype-disjoint-${subtype.subtypeId}`,
          false,
          `${seenSubtypes.get(subtype.subtypeId)} and ${record.workerId}`,
        );
      } else {
        seenSubtypes.set(subtype.subtypeId, record.workerId);
      }
      const triage = triageBySubtype.get(subtype.subtypeId);
      check(
        `subtype-triage-${subtype.subtypeId}`,
        triage &&
          subtype.familyId === triage.familyId &&
          subtype.lane === triage.lane &&
          subtype.canonicalPrimarySlotId === triage.canonicalPrimarySlotId &&
          subtype.slotCount === triage.slotCount,
        `${subtype.familyId}:${subtype.lane}:${subtype.canonicalPrimarySlotId}:${subtype.slotCount}`,
      );

      const reference = referenceBySubtype.get(subtype.subtypeId);
      const binding = subtype.immutableReference;
      check(
        `reference-binding-${subtype.subtypeId}`,
        reference &&
          binding?.subtypeId === reference.id &&
          binding?.packageComplete === true &&
          binding?.files?.length === 5,
        `${binding?.subtypeId}:${binding?.files?.length}`,
      );
      for (const file of binding?.files ?? []) {
        const expectedPath = reference?.paths?.[file.key];
        const expectedHash = reference?.hashes?.[file.key];
        let actualHash = null;
        try {
          actualHash = sha256File(file.relativePath);
        } catch (error) {
          actualHash = `ERROR:${error.message}`;
        }
        referenceFilesChecked += 1;
        check(
          `reference-file-${subtype.subtypeId}-${file.key}`,
          file.relativePath === expectedPath &&
            file.sha256 === expectedHash &&
            actualHash === expectedHash,
          `${file.relativePath}:${file.sha256}:${actualHash} vs ${expectedPath}:${expectedHash}`,
        );
      }
      check(
        `reference-content-id-${subtype.subtypeId}`,
        binding?.immutableContentId === contentId(binding?.files ?? []),
        `${binding?.immutableContentId} vs ${contentId(binding?.files ?? [])}`,
      );

      const primary = (subtype.slots ?? []).find((slot) => slot.reviewRole === 'canonical-primary');
      const source = subtype.sourcePackagePrerequisite;
      const registerPrimary = primary ? registerSlotById.get(primary.slotId) : null;
      const expectedSourceApproved = ['approved', 'authored-approved', 'visually-approved'].includes(
        registerPrimary?.status,
      );
      const expectedSourceStatus =
        registerPrimary?.status === 'planned-unassigned' ? 'missing' : registerPrimary?.status;
      check(
        `source-prerequisite-${subtype.subtypeId}`,
        primary &&
          source?.canonicalPrimarySlotId === primary.slotId &&
          source?.status === expectedSourceStatus &&
          source?.approved === expectedSourceApproved &&
          source?.requiredBeforeDispatch === true,
        `${source?.canonicalPrimarySlotId}:${source?.status}:${source?.approved}`,
      );
      for (const file of source?.files ?? []) {
        sourceFilesChecked += 1;
        let actualHash = null;
        try {
          actualHash = sha256File(file.relativePath);
        } catch (error) {
          actualHash = `ERROR:${error.message}`;
        }
        check(
          `source-file-${subtype.subtypeId}-${file.relativePath}`,
          actualHash === file.sha256,
          `${actualHash} vs ${file.sha256}`,
        );
      }
      check(
        `source-not-approved-${subtype.subtypeId}`,
        source?.approved === false,
        `approved=${source?.approved}`,
      );

      const provider = subtype.providerCandidatePrerequisite;
      const isCandidate = triage?.lane === 'provider-anchor-candidate';
      if (isCandidate) providerCandidatesChecked += 1;
      const job = providerJobBySubtype.get(subtype.subtypeId);
      check(
        `provider-prerequisite-${subtype.subtypeId}`,
        isCandidate
          ? provider?.applicable === true &&
              provider?.providerIsRequired === false &&
              provider?.providerDonorUseAuthorized === false &&
              provider?.preflightId === job?.id &&
              provider?.preflightSlotId === job?.slotId &&
              provider?.status === job?.status
          : provider?.applicable === false &&
            provider?.providerIsRequired === false &&
            provider?.providerDonorUseAuthorized === false &&
            provider?.status === 'not-applicable',
        JSON.stringify(provider),
      );

      for (const slot of subtype.slots ?? []) {
        if (seenSlots.has(slot.slotId)) {
          check(
            `slot-disjoint-${slot.slotId}`,
            false,
            `${seenSlots.get(slot.slotId)} and ${record.workerId}`,
          );
        } else {
          seenSlots.set(slot.slotId, record.workerId);
        }
        const canonical = registerSlotById.get(slot.slotId);
        const expectedDependencies =
          slot.reviewRole === 'canonical-primary'
            ? [`reference-package:${subtype.subtypeId}`, 'global-gate:tor-visual-acceptance']
            : [
                `reference-package:${subtype.subtypeId}`,
                `slot:${subtype.canonicalPrimarySlotId}`,
                `source-package:${subtype.canonicalPrimarySlotId}`,
                'global-gate:tor-visual-acceptance',
              ];
        const expectedOptional = isCandidate ? [`provider-preflight:${subtype.subtypeId}`] : [];
        check(
          `slot-contract-${slot.slotId}`,
          canonical &&
            slot.subtypeId === canonical.subtypeId &&
            slot.familyId === canonical.familyId &&
            slot.index === canonical.index &&
            slot.reviewRole === canonical.reviewRole &&
            slot.status === canonical.status &&
            slot.baselineMode === canonical.baselineMode &&
            slot.baselineCountRule === canonical.baselineCountRule &&
            equalJson(slot.referenceIds, canonical.referenceIds) &&
            equalJson(slot.requiredDeliverables, canonical.requiredDeliverables) &&
            equalJson(slot.dependencies, expectedDependencies) &&
            equalJson(slot.optionalDependencies, expectedOptional) &&
            slot.statusForProduction === 'blocked-not-dispatchable' &&
            slot.dispatchAuthorized === false,
          canonical ? `${canonical.subtypeId}:${canonical.index}` : 'not in register',
        );
      }
    }
  }

  check('worker-completeness', seenWorkers.size === EXPECTED.workers, seenWorkers.size);
  check('subtype-completeness', seenSubtypes.size === EXPECTED.subtypes, seenSubtypes.size);
  check('slot-completeness', seenSlots.size === EXPECTED.slots, seenSlots.size);
  check(
    'no-unregistered-subtypes',
    [...seenSubtypes.keys()].every((id) => referenceBySubtype.has(id) && triageBySubtype.has(id)),
    seenSubtypes.size,
  );
  check(
    'no-unregistered-slots',
    [...seenSlots.keys()].every((id) => registerSlotById.has(id)),
    seenSlots.size,
  );
  check('reference-files-complete', referenceFilesChecked === EXPECTED.subtypes * 5, referenceFilesChecked);
  check('provider-candidates-complete', providerCandidatesChecked === 29, providerCandidatesChecked);
  const providerCountsPerWorker = (manifest.shards ?? []).map((record) => {
    const shard = readJson(record.relativePath);
    return shard.counts?.providerCandidates;
  });
  check(
    'provider-candidates-balanced',
    providerCountsPerWorker.length === EXPECTED.workers &&
      Math.min(...providerCountsPerWorker) === 2 &&
      Math.max(...providerCountsPerWorker) === 3 &&
      providerCountsPerWorker.reduce((sum, count) => sum + count, 0) === 29,
    JSON.stringify(providerCountsPerWorker),
  );
  check(
    'whole-subtype-load-envelope',
    Math.min(...slotCounts) === manifest.counts?.minSlotsPerWorker &&
      Math.max(...slotCounts) === manifest.counts?.maxSlotsPerWorker &&
      Math.min(...slotCounts) === 80 &&
      Math.max(...slotCounts) === 82 &&
      slotCounts.filter((count) => count === 80).length === 5 &&
      slotCounts.filter((count) => count === 82).length === 6,
    `${Math.min(...slotCounts)}-${Math.max(...slotCounts)}`,
  );

  const approvedSources = register.slots.filter(
    (slot) =>
      slot.reviewRole === 'canonical-primary' &&
      ['approved', 'authored-approved', 'visually-approved'].includes(slot.status),
  ).length;
  const awaitingSources = register.slots.filter(
    (slot) =>
      slot.reviewRole === 'canonical-primary' && slot.status === 'authored-awaiting-visual-review',
  ).length;
  const missingSources = EXPECTED.subtypes - approvedSources - awaitingSources;
  check(
    'source-counts-fail-closed',
    approvedSources === 0 &&
      awaitingSources === 6 &&
      missingSources === 94 &&
      manifest.counts?.sourcePackages?.approved === approvedSources &&
      manifest.counts?.sourcePackages?.awaitingVisualReview === awaitingSources &&
      manifest.counts?.sourcePackages?.missing === missingSources,
    `${approvedSources}/${awaitingSources}/${missingSources}`,
  );

  const defectEvidence = readJson(`${evidenceRoot}/registry-defects.json`);
  const expectedAwaitingIds = register.slots
    .filter(
      (slot) =>
        slot.reviewRole === 'canonical-primary' && slot.status === 'authored-awaiting-visual-review',
    )
    .map((slot) => slot.slotId)
    .sort();
  const expectedMissingIds = register.slots
    .filter(
      (slot) => slot.reviewRole === 'canonical-primary' && slot.status === 'planned-unassigned',
    )
    .map((slot) => slot.slotId)
    .sort();
  check(
    'registry-defects-remain-blocking',
    defectEvidence.status === 'blocking' &&
      defectEvidence.counts?.approved === 0 &&
      defectEvidence.counts?.awaitingVisualReview === 6 &&
      defectEvidence.counts?.missing === 94 &&
      defectEvidence.authoredAwaitingVisualReview?.length === 6 &&
      defectEvidence.missingCanonicalSources?.length === 94 &&
      equalJson(
        defectEvidence.authoredAwaitingVisualReview
          .map((entry) => entry.canonicalPrimarySlotId)
          .sort(),
        expectedAwaitingIds,
      ) &&
      equalJson(
        defectEvidence.missingCanonicalSources
          .map((entry) => entry.canonicalPrimarySlotId)
          .sort(),
        expectedMissingIds,
      ) &&
      defectEvidence.defects?.length >= 5,
    JSON.stringify(defectEvidence.counts),
  );

  return {
    manifestSha256: sha256File(manifestPath),
    manifestContentId: manifest.manifestContentId,
    sourceBindingId: manifest.sourceBindingId,
    referenceFilesChecked,
    sourceFilesChecked,
    providerCandidatesChecked,
    workersSeen: seenWorkers.size,
    subtypesSeen: seenSubtypes.size,
    slotsSeen: seenSlots.size,
    minSlotsPerWorker: Math.min(...slotCounts),
    maxSlotsPerWorker: Math.max(...slotCounts),
    sourcePackages: { approvedSources, awaitingSources, missingSources },
  };
}

let metrics = {};
try {
  metrics = verify();
} catch (error) {
  failures.push({ id: 'verifier-exception', detail: error.message });
}

const result = {
  schema: 'toonlab/rock-production-shard-verification',
  version: 1,
  planningPassed: failures.length === 0,
  dispatchAuthorized: false,
  status: failures.length === 0 ? 'planning-verified-but-blocked' : 'failed-closed',
  fullCheckpoint10Approved: false,
  c9FormationScaleWorkParked: true,
  c10FamilyRolloutParked: true,
  metrics,
  checkCount: checks.length,
  failureCount: failures.length,
  checks,
  failures,
  expectedBlockers: [
    'tor visual acceptance is false',
    'zero canonical production source packages are approved',
    'six canonical primary records await visual review',
    'ninety-four canonical source packages are missing',
    'all twenty-nine provider-candidate donor preflights remain unauthorized',
    'hoodoo developer visual approval is false',
  ],
  commands: [
    'node scripts/plan-rock-geology-v2-production-shards.mjs',
    'node scripts/verify-rock-geology-v2-production-shards.mjs',
  ],
};

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'verification.json'), jsonBytes(result));
console.log(
  JSON.stringify(
    {
      planningPassed: result.planningPassed,
      dispatchAuthorized: false,
      status: result.status,
      checkCount: result.checkCount,
      failureCount: result.failureCount,
      metrics: result.metrics,
      failures: result.failures,
    },
    null,
    2,
  ),
);
if (failures.length > 0) process.exitCode = 1;
