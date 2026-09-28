#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const artifactDirectory = resolve(
  projectRoot,
  "artifacts/research/rock-geology-v2/mvp-v0.1",
);
const rosterPath = resolve(artifactDirectory, "roster.json");
const contractPath = resolve(artifactDirectory, "release-contract.json");
const workerPlanPath = resolve(artifactDirectory, "worker-plan.json");
const verificationPath = resolve(artifactDirectory, "verification.json");
const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write") || args.has("--allow-incomplete");
const allowIncomplete = args.has("--allow-incomplete");
const VERSION = "0.1.0";
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isNonEmpty(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
}

function deepEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function addCheck(checks, id, passed, detail) {
  checks.push({ id, passed: Boolean(passed), detail });
}

async function verifyEvidenceItem(item, context, blockers) {
  if (!item || typeof item.path !== "string" || !HASH_PATTERN.test(item.sha256 ?? "")) {
    blockers.push(`${context}: evidence must contain a project-relative path and lowercase SHA-256.`);
    return false;
  }
  const path = resolve(projectRoot, item.path);
  if (!(await exists(path))) {
    blockers.push(`${context}: missing evidence file ${item.path}.`);
    return false;
  }
  const actual = await sha256File(path);
  if (actual !== item.sha256) {
    blockers.push(`${context}: hash mismatch for ${item.path}.`);
    return false;
  }
  return true;
}

function expectedReferenceFiles(candidate) {
  return candidate.reference.files.map(({ role, path, sha256: hash }) => ({
    role,
    path,
    sha256: hash,
  }));
}

async function verifyProposal(admission, candidate, blockers) {
  const proposal = admission.proposal;
  if (!proposal || typeof proposal !== "object") {
    blockers.push("proposal: missing proposal provenance object.");
    return;
  }
  const policy = candidate.provider;
  if (proposal.disposition !== policy.disposition) {
    blockers.push(`proposal: disposition must be ${policy.disposition}.`);
  }

  const attempts = Array.isArray(proposal.attempts) ? proposal.attempts : [];
  if (policy.disposition === "procedural-comparison/no-provider") {
    if (proposal.providerUsed !== false) blockers.push("proposal: cliff-bedded must record providerUsed=false.");
    if (attempts.length !== 0) blockers.push("proposal: cliff-bedded must have zero provider attempts.");
    if (!isNonEmpty(proposal.proceduralSourceHashes)) {
      blockers.push("proposal: cliff-bedded needs exact procedural source hashes.");
    }
    return;
  }

  if (proposal.providerUsed !== true) blockers.push("proposal: providerUsed must be true.");
  if (proposal.provider !== "tripo") blockers.push("proposal: provider must be tripo.");
  if (proposal.modelVersion !== policy.modelVersion) {
    blockers.push(`proposal: modelVersion must be ${policy.modelVersion}.`);
  }
  if (attempts.length < 1) blockers.push("proposal: at least one selected provider attempt is required.");

  if (policy.disposition === "reuse-existing") {
    if (proposal.newProviderTasksSubmittedForMvp !== 0) {
      blockers.push("proposal: reuse-existing candidates must submit zero new provider tasks for MVP v0.1.");
    }
    if (proposal.selectedEvidenceManifest !== policy.existingEvidenceManifest) {
      blockers.push("proposal: selected existing provider manifest path differs from the roster.");
    }
    if (proposal.selectedEvidenceManifestSha256 !== policy.existingEvidenceManifestSha256) {
      blockers.push("proposal: selected existing provider manifest hash differs from the roster.");
    }
  } else {
    if (attempts.length > policy.maximumAttempts) {
      blockers.push(`proposal: at most ${policy.maximumAttempts} provider attempts are allowed.`);
    }
    if (attempts.length === 2) {
      if (attempts[0]?.classification !== "C") {
        blockers.push("proposal: retry requires the first attempt to have classification C.");
      }
      if (!isNonEmpty(attempts[1]?.retryJustification)) {
        blockers.push("proposal: the single retry needs a non-empty justification.");
      }
    }
  }

  for (const [index, attempt] of attempts.entries()) {
    const prefix = `proposal.attempts[${index}]`;
    if (!isNonEmpty(attempt?.taskId)) blockers.push(`${prefix}: exact taskId is required.`);
    if (!isNonEmpty(attempt?.requestParameters)) blockers.push(`${prefix}: exact requestParameters are required.`);
    if (!isNonEmpty(attempt?.inputHashes)) blockers.push(`${prefix}: exact transmitted inputHashes are required.`);
    if (!isNonEmpty(attempt?.outputHashes)) blockers.push(`${prefix}: exact outputHashes are required.`);
    if (!["A", "B", "C"].includes(attempt?.classification)) {
      blockers.push(`${prefix}: classification must be A, B, or C.`);
    }
    if (!isNonEmpty(attempt?.classificationEvidence)) {
      blockers.push(`${prefix}: classificationEvidence is required.`);
    }
  }
  if (attempts.at(-1)?.classification === "C") {
    blockers.push("proposal: a final C-classified proposal is not release-eligible.");
  }
}

async function verifyAsset(candidate, rosterHash, contractHash, contract) {
  const path = resolve(artifactDirectory, "assets", candidate.id, "admission.json");
  if (!(await exists(path))) {
    return {
      id: candidate.id,
      cohort: candidate.cohort,
      familyId: candidate.familyId,
      releaseSlot: null,
      status: "missing-admission",
      technicalReadiness: "not-proven",
      visualReadiness: candidate.id === "hoodoo-caprock" ? "benchmark-approved-only" : "not-proven",
      eligible: false,
      admissionPath: path.slice(projectRoot.length + 1),
      blockers: ["Missing hash-bound MVP v0.1 asset admission manifest."],
    };
  }

  const blockers = [];
  let admission;
  try {
    admission = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return {
      id: candidate.id,
      cohort: candidate.cohort,
      familyId: candidate.familyId,
      releaseSlot: null,
      status: "invalid-admission",
      technicalReadiness: "not-proven",
      visualReadiness: "not-proven",
      eligible: false,
      admissionPath: path.slice(projectRoot.length + 1),
      blockers: [`Admission JSON could not be parsed: ${error.message}`],
    };
  }

  if (admission.schema !== contract.assetAdmission.schema) blockers.push("admission: wrong schema.");
  if (admission.version !== contract.assetAdmission.version) blockers.push("admission: wrong version.");
  if (admission.assetId !== candidate.id) blockers.push("admission: assetId differs from roster candidate.");
  if (admission.rosterSha256 !== rosterHash) blockers.push("admission: stale or wrong roster hash.");
  if (admission.contractSha256 !== contractHash) blockers.push("admission: stale or wrong release-contract hash.");
  if (admission.canonical !== true) blockers.push("admission: canonical must be true.");
  if (admission.derivativeOf !== null) blockers.push("admission: derivativeOf must be null.");
  if (!Number.isInteger(admission.releaseSlot) || admission.releaseSlot < 1 || admission.releaseSlot > 12) {
    blockers.push("admission: releaseSlot must be an integer from 1 through 12.");
  }

  const actualReference = Array.isArray(admission.referenceFiles) ? admission.referenceFiles : [];
  if (!deepEqual(actualReference, expectedReferenceFiles(candidate))) {
    blockers.push("referenceFiles: exact five-file roster binding is required.");
  }
  for (const file of candidate.reference.files) {
    await verifyEvidenceItem(file, `referenceFiles.${file.role}`, blockers);
  }

  await verifyProposal(admission, candidate, blockers);

  const gateResults = [];
  for (const gate of contract.perAssetGates) {
    const result = admission.gates?.[gate.id];
    const gateBlockers = [];
    if (result?.decision !== gate.admissionDecision) {
      gateBlockers.push(`decision must be ${gate.admissionDecision}.`);
    }
    const facts = result?.assertions ?? {};
    for (const [key, expected] of Object.entries(gate.requiredAssertions)) {
      if (!deepEqual(facts[key], expected)) {
        gateBlockers.push(`assertions.${key} must equal ${JSON.stringify(expected)}.`);
      }
    }
    for (const key of gate.requiredNonEmpty) {
      if (!isNonEmpty(facts[key])) gateBlockers.push(`assertions.${key} must be non-empty.`);
    }
    const evidence = Array.isArray(result?.evidence) ? result.evidence : [];
    if (evidence.length < 1) gateBlockers.push("at least one hash-bound evidence artifact is required.");
    for (const [index, item] of evidence.entries()) {
      await verifyEvidenceItem(item, `gates.${gate.id}.evidence[${index}]`, gateBlockers);
    }
    if (gateBlockers.length > 0) {
      blockers.push(...gateBlockers.map((blocker) => `gate ${gate.id}: ${blocker}`));
    }
    gateResults.push({ id: gate.id, passed: gateBlockers.length === 0, blockers: gateBlockers });
  }

  const styleAssertions = admission.gates?.["reversible-stylization"]?.assertions ?? {};
  if (!["material-only", "geometry-changing"].includes(styleAssertions.stylizationMode)) {
    blockers.push("gate reversible-stylization: assertions.stylizationMode must be material-only or geometry-changing.");
  } else if (
    styleAssertions.stylizationMode === "geometry-changing" &&
    styleAssertions.shapeChangingStyleRebuiltDownstream !== true
  ) {
    blockers.push("gate reversible-stylization: geometry-changing style must rebuild and re-audit all downstream assets.");
  }

  const boardResults = [];
  for (const checkpoint of contract.checkpointBoards) {
    const board = admission.checkpointBoards?.[checkpoint.id];
    const boardBlockers = [];
    if (!board) {
      boardBlockers.push("board record is missing.");
    } else {
      await verifyEvidenceItem(board, `checkpointBoards.${checkpoint.id}`, boardBlockers);
      if (!deepEqual(board.requiredPanels, checkpoint.requiredPanels)) {
        boardBlockers.push("requiredPanels must exactly match the release contract.");
      }
    }
    if (boardBlockers.length > 0) {
      blockers.push(...boardBlockers.map((blocker) => `checkpoint ${checkpoint.id}: ${blocker}`));
    }
    boardResults.push({ id: checkpoint.id, passed: boardBlockers.length === 0, blockers: boardBlockers });
  }

  const decision = admission.developerDecision;
  if (decision?.decision !== contract.assetAdmission.developerDecisionBinding.decision) {
    blockers.push("developerDecision: decision must be approved.");
  }
  if (decision?.scope !== contract.assetAdmission.developerDecisionBinding.scope) {
    blockers.push("developerDecision: wrong approval scope.");
  }
  if (decision?.binding !== true) blockers.push("developerDecision: binding must be true.");
  for (const field of contract.assetAdmission.developerDecisionBinding.requiredFields) {
    if (!isNonEmpty(decision?.[field])) blockers.push(`developerDecision: ${field} is required.`);
  }
  if (decision?.contractSha256 !== contractHash) {
    blockers.push("developerDecision: contractSha256 does not bind this release contract.");
  }

  if (admission.overall?.technicalReadiness !== contract.assetAdmission.technicalReadinessMustEqual) {
    blockers.push("overall: technicalReadiness must be pass.");
  }
  if (admission.overall?.visualReadiness !== contract.assetAdmission.visualReadinessMustEqual) {
    blockers.push("overall: visualReadiness must be pass.");
  }
  if (admission.overall?.releaseEligible !== true) blockers.push("overall: releaseEligible must be true.");
  if (!Array.isArray(admission.blockers) || admission.blockers.length !== 0) {
    blockers.push("admission: blockers must be an empty array.");
  }
  if (admission.claims?.megascansParity !== contract.assetAdmission.claims.megascansParity) {
    blockers.push("claims: Megascans parity must remain not-claimed.");
  }

  return {
    id: candidate.id,
    cohort: candidate.cohort,
    familyId: candidate.familyId,
    releaseSlot: admission.releaseSlot ?? null,
    status: blockers.length === 0 ? "technical-pass-visual-pass" : "blocked",
    technicalReadiness: admission.overall?.technicalReadiness ?? "not-proven",
    visualReadiness: admission.overall?.visualReadiness ?? "not-proven",
    eligible: blockers.length === 0,
    admissionPath: path.slice(projectRoot.length + 1),
    admissionSha256: sha256(await readFile(path)),
    gates: gateResults,
    checkpointBoards: boardResults,
    blockers,
  };
}

async function verifyWorkflowFreeze(contract, reports) {
  const hoodoo = reports.find((report) => report.id === "hoodoo-caprock");
  const tor = reports.find((report) => report.id === "tor-block-pile");
  const bothEligible = hoodoo?.eligible === true && tor?.eligible === true;
  const path = resolve(projectRoot, contract.workflowFreeze.evidencePath);

  if (!(await exists(path))) {
    return {
      processVersion: contract.workflowFreeze.processVersion,
      hoodooEligible: hoodoo?.eligible === true,
      torEligible: tor?.eligible === true,
      prerequisitesPassed: bothEligible,
      frozen: false,
      evidencePath: contract.workflowFreeze.evidencePath,
      blockers: [
        bothEligible
          ? "Workflow v0.1 freeze record is missing."
          : "Workflow v0.1 cannot freeze until hoodoo-caprock and tor-block-pile are both fully release-eligible.",
      ],
    };
  }

  const blockers = [];
  let record;
  try {
    record = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    blockers.push(`Workflow freeze record is invalid JSON: ${error.message}`);
    return {
      processVersion: contract.workflowFreeze.processVersion,
      hoodooEligible: hoodoo?.eligible === true,
      torEligible: tor?.eligible === true,
      prerequisitesPassed: bothEligible,
      frozen: false,
      evidencePath: contract.workflowFreeze.evidencePath,
      blockers,
    };
  }

  if (!bothEligible) blockers.push("Workflow freeze exists before hoodoo and tor both pass; fail closed.");
  if (record.schema !== contract.workflowFreeze.evidenceSchema) blockers.push("Workflow freeze schema is wrong.");
  if (record.version !== VERSION) blockers.push("Workflow freeze version is wrong.");
  if (record.processVersion !== contract.workflowFreeze.processVersion) blockers.push("Workflow process version is wrong.");
  if (record.state !== "frozen") blockers.push("Workflow freeze state must be frozen.");
  if (record.developerDecision?.decision !== "approved" || record.developerDecision?.binding !== true) {
    blockers.push("Workflow freeze requires a binding approved developer decision.");
  }
  if (!isNonEmpty(record.processArtifacts)) blockers.push("Workflow freeze requires hash-bound process artifacts.");

  return {
    processVersion: contract.workflowFreeze.processVersion,
    hoodooEligible: hoodoo?.eligible === true,
    torEligible: tor?.eligible === true,
    prerequisitesPassed: bothEligible,
    frozen: blockers.length === 0,
    evidencePath: contract.workflowFreeze.evidencePath,
    evidenceSha256: sha256(await readFile(path)),
    blockers,
  };
}

async function main() {
  const checks = [];
  const [rosterBytes, contractBytes, workerPlanBytes] = await Promise.all([
    readFile(rosterPath),
    readFile(contractPath),
    readFile(workerPlanPath),
  ]);
  const rosterHash = sha256(rosterBytes);
  const contractHash = sha256(contractBytes);
  const workerPlanHash = sha256(workerPlanBytes);
  const roster = JSON.parse(rosterBytes);
  const contract = JSON.parse(contractBytes);
  const workerPlan = JSON.parse(workerPlanBytes);

  addCheck(checks, "roster-schema", roster.schema === "toonlab/rock-geology-v2-mvp-roster" && roster.version === VERSION, "Roster schema/version must be v0.1.0.");
  addCheck(checks, "contract-schema", contract.schema === "toonlab/rock-geology-v2-mvp-release-contract" && contract.version === VERSION, "Release contract schema/version must be v0.1.0.");
  addCheck(checks, "worker-plan-schema", workerPlan.schema === "toonlab/rock-geology-v2-mvp-worker-plan" && workerPlan.version === VERSION, "Worker plan schema/version must be v0.1.0.");
  addCheck(checks, "contract-roster-binding", contract.roster?.sha256 === rosterHash, "Release contract must bind the exact roster bytes.");
  addCheck(checks, "worker-roster-binding", workerPlan.roster?.sha256 === rosterHash, "Worker plan must bind the exact roster bytes.");
  addCheck(checks, "worker-contract-binding", workerPlan.releaseContract?.sha256 === contractHash, "Worker plan must bind the exact release contract bytes.");

  const expectedIds = [
    "hoodoo-caprock", "tor-block-pile", "boulder-rounded", "block-jointed",
    "boulder-river-worn", "slab-bedded", "outcrop-jointed", "outcrop-bedded",
    "ledge-resistant", "pillar-residual", "sea-stack", "volcanic-neck",
    "arch-sandstone", "boulder-angular", "sea-stump", "erratic-glacial",
    "fin-sandstone", "monolith-jointed", "overhang-supported", "cliff-bedded",
  ];
  const actualIds = roster.candidates?.map((candidate) => candidate.id) ?? [];
  addCheck(checks, "exact-roster-order", deepEqual(actualIds, expectedIds), "Roster must contain the exact ordered 20-candidate selection.");
  addCheck(checks, "candidate-count", roster.candidates?.length === 20, "Exactly 20 candidates are required.");
  addCheck(checks, "first-twelve-count", roster.candidates?.filter((candidate) => candidate.cohort === "first-12").length === 12, "Exactly 12 candidates must be marked first-12.");
  addCheck(checks, "reserve-count", roster.candidates?.filter((candidate) => candidate.cohort === "reserve").length === 8, "Exactly eight reserves are required.");
  addCheck(checks, "first-twelve-family-coverage", new Set(roster.candidates?.slice(0, 12).map((candidate) => candidate.familyId)).size >= 6, "The priority cohort must span at least six families.");

  const dispositions = roster.candidates?.reduce((counts, candidate) => {
    counts[candidate.provider?.disposition] = (counts[candidate.provider?.disposition] ?? 0) + 1;
    return counts;
  }, {}) ?? {};
  addCheck(checks, "provider-dispositions", dispositions["reuse-existing"] === 3 && dispositions["procedural-comparison/no-provider"] === 1 && dispositions["new-h31"] === 16, "Provider dispositions must be 3 reuse, 1 no-provider comparison, and 16 new H3.1.");
  addCheck(checks, "provider-concurrency", contract.providerLimits?.maximumConcurrentProviderJobs === 10 && workerPlan.coordination?.maximumConcurrentProviderJobs === 10, "Provider concurrency must be capped at ten.");
  addCheck(checks, "retry-limit", contract.providerLimits?.maximumRetriesPerFailedCandidate === 1, "Only one justified retry is allowed per failed candidate.");
  addCheck(checks, "six-checkpoint-boards", contract.checkpointBoards?.length === 6, "Every candidate must have six checkpoint boards.");
  addCheck(checks, "all-per-asset-gates", contract.perAssetGates?.length === 15, "All fifteen MVP per-asset gates must be present.");
  addCheck(
    checks,
    "per-asset-gate-schema",
    contract.perAssetGates?.every((entry) =>
      typeof entry?.id === "string" &&
      typeof entry?.title === "string" &&
      typeof entry?.requirement === "string" &&
      entry?.admissionDecision === "pass" &&
      entry?.requiredAssertions &&
      typeof entry.requiredAssertions === "object" &&
      !Array.isArray(entry.requiredAssertions) &&
      Array.isArray(entry.requiredNonEmpty),
    ),
    "Every per-asset gate must have an object assertion contract and an array of non-empty fields.",
  );
  const stylizationGate = contract.perAssetGates?.find(({ id }) => id === "reversible-stylization");
  addCheck(
    checks,
    "conditional-stylization-policy",
    stylizationGate?.requiredAssertions?.stylizationModeDeclared === true &&
      stylizationGate?.requiredAssertions?.downstreamInvalidationPolicyVerified === true &&
      stylizationGate?.requiredAssertions?.shapeChangingStyleRebuiltDownstream === undefined &&
      stylizationGate?.requiredNonEmpty?.includes("stylizationMode") &&
      stylizationGate?.requiredNonEmpty?.includes("shapeChangePolicy"),
    "Material-only style may pass with exact neutral restoration; geometry-changing style remains conditionally required to rebuild downstream assets.",
  );
  const developerGate = contract.perAssetGates?.find(({ id }) => id === "developer-visual-approval");
  addCheck(
    checks,
    "developer-gate-schema",
    deepEqual(developerGate?.requiredAssertions, { developerApproved: true, decisionIsBinding: true }) &&
      deepEqual(developerGate?.requiredNonEmpty, ["decisionId", "developerIdentity", "decidedAt", "decisionEvidenceHash"]),
    "The developer approval gate must remain machine-verifiable.",
  );
  addCheck(checks, "hoodoo-benchmark-scope", contract.visualBenchmark?.assetId === "hoodoo-caprock" && contract.visualBenchmark?.status === "developer-approved-benchmark" && contract.visualBenchmark?.releaseEligibilityConferred === false, "Hoodoo must be approved only as the current visual benchmark, not auto-admitted.");
  addCheck(checks, "workflow-freeze-order", contract.workflowFreeze?.freezeBeforeBothPassForbidden === true && contract.workflowFreeze?.initialState === "not-frozen", "Workflow v0.1 must begin unfrozen and cannot freeze until hoodoo and tor pass.");
  addCheck(checks, "release-boundary", contract.releaseBoundary?.releaseAssetCount === 12 && contract.releaseBoundary?.minimumDistinctFamilyCount === 6 && deepEqual(contract.releaseBoundary?.mandatoryAssetIds, ["hoodoo-caprock", "tor-block-pile"]), "Release must be exactly 12 assets across at least six families including hoodoo and tor.");
  addCheck(checks, "derivative-exclusion", contract.releaseBoundary?.seededDerivativesCount === false && contract.releaseBoundary?.canonicalAssetsOnly === true, "Derivatives must not count as canonical release assets.");
  addCheck(checks, "megascans-claim-forbidden", contract.claimsPolicy?.megascansParityClaimAllowed === false && contract.assetAdmission?.claims?.megascansParity === "not-claimed", "No Megascans-parity claim is allowed.");

  const referenceHashFailures = [];
  for (const candidate of roster.candidates ?? []) {
    if (candidate.reference?.files?.length !== 5) {
      referenceHashFailures.push(`${candidate.id}: expected five bound reference files.`);
      continue;
    }
    for (const file of candidate.reference.files) {
      if (!HASH_PATTERN.test(file.sha256 ?? "")) {
        referenceHashFailures.push(`${candidate.id}/${file.role}: invalid hash syntax.`);
        continue;
      }
      const absolute = resolve(projectRoot, file.path);
      if (!(await exists(absolute))) {
        referenceHashFailures.push(`${candidate.id}/${file.role}: file missing.`);
        continue;
      }
      const actual = await sha256File(absolute);
      if (actual !== file.sha256) referenceHashFailures.push(`${candidate.id}/${file.role}: hash mismatch.`);
    }
    if (candidate.provider?.disposition === "reuse-existing") {
      const manifestPath = resolve(projectRoot, candidate.provider.existingEvidenceManifest);
      if (!(await exists(manifestPath))) {
        referenceHashFailures.push(`${candidate.id}: reused provider manifest missing.`);
      } else if ((await sha256File(manifestPath)) !== candidate.provider.existingEvidenceManifestSha256) {
        referenceHashFailures.push(`${candidate.id}: reused provider manifest hash mismatch.`);
      }
    }
  }
  addCheck(checks, "exact-reference-and-reuse-hashes", referenceHashFailures.length === 0, referenceHashFailures.length === 0 ? "All 20 five-file bindings and reused provider manifests match current bytes." : referenceHashFailures.join(" "));

  const contractValid = checks.every((check) => check.passed);
  const reports = [];
  if (contractValid) {
    for (const candidate of roster.candidates) {
      reports.push(await verifyAsset(candidate, rosterHash, contractHash, contract));
    }
  }

  const eligible = reports.filter((report) => report.eligible);
  const releaseSlots = eligible.map((report) => report.releaseSlot);
  const distinctFamilies = new Set(eligible.map((report) => report.familyId));
  const mandatoryPresent = contract.releaseBoundary.mandatoryAssetIds.every((id) =>
    eligible.some((report) => report.id === id),
  );
  const exactSlots = releaseSlots.length === 12 && new Set(releaseSlots).size === 12 && [...releaseSlots].sort((a, b) => a - b).every((slot, index) => slot === index + 1);
  const workflowFreeze = contractValid
    ? await verifyWorkflowFreeze(contract, reports)
    : {
        processVersion: "0.1",
        prerequisitesPassed: false,
        frozen: false,
        blockers: ["Contract integrity failed; workflow freeze was not evaluated."],
      };

  const releaseReady =
    contractValid &&
    eligible.length === 12 &&
    distinctFamilies.size >= 6 &&
    mandatoryPresent &&
    exactSlots &&
    workflowFreeze.frozen;

  const releaseBlockers = [];
  if (!contractValid) releaseBlockers.push("MVP contract integrity failed.");
  if (eligible.length !== 12) releaseBlockers.push(`Exactly 12 assets must be eligible; current count is ${eligible.length}.`);
  if (distinctFamilies.size < 6) releaseBlockers.push(`At least six families must be represented; current eligible count is ${distinctFamilies.size}.`);
  if (!mandatoryPresent) releaseBlockers.push("Both hoodoo-caprock and tor-block-pile must be eligible.");
  if (!exactSlots) releaseBlockers.push("Eligible assets must occupy each unique release slot 1 through 12 exactly once.");
  if (!workflowFreeze.frozen) releaseBlockers.push(...workflowFreeze.blockers);

  const verification = {
    schema: "toonlab/rock-geology-v2-mvp-verification",
    version: VERSION,
    generatedAt: new Date().toISOString(),
    failClosed: true,
    sourceDocuments: {
      roster: { path: rosterPath.slice(projectRoot.length + 1), sha256: rosterHash },
      releaseContract: { path: contractPath.slice(projectRoot.length + 1), sha256: contractHash },
      workerPlan: { path: workerPlanPath.slice(projectRoot.length + 1), sha256: workerPlanHash },
    },
    contractIntegrity: {
      passed: contractValid,
      checks,
    },
    benchmark: {
      assetId: "hoodoo-caprock",
      visualBenchmarkApproved: contract.visualBenchmark?.status === "developer-approved-benchmark",
      scope: contract.visualBenchmark?.benchmarkScope,
      releaseEligibleFromBenchmarkDecision: false,
    },
    workflowFreeze,
    counts: {
      rosterCandidates: roster.candidates?.length ?? 0,
      admissionsPresent: reports.filter((report) => report.status !== "missing-admission").length,
      fullyEligibleCanonicalAssets: eligible.length,
      eligibleDistinctFamilies: distinctFamilies.size,
      requiredEligibleCanonicalAssets: 12,
      requiredDistinctFamilies: 6,
    },
    assets: reports,
    release: {
      status: releaseReady ? "technical-pass-visual-pass" : "blocked-incomplete",
      ready: releaseReady,
      eligibleAssetIds: eligible.map((report) => report.id),
      mandatoryAssetsEligible: mandatoryPresent,
      exactUniqueReleaseSlotsOneThroughTwelve: exactSlots,
      megascansParity: "not-claimed",
      blockers: releaseReady ? [] : [...new Set(releaseBlockers)],
    },
  };

  if (shouldWrite) await writeFile(verificationPath, stableJson(verification));
  console.log(stableJson(verification));

  if (!contractValid) process.exitCode = 2;
  else if (!releaseReady && !allowIncomplete) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 2;
});
