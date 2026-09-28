#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const artifactDirectory = resolve(
  projectRoot,
  "artifacts/research/rock-geology-v2/mvp-v0.1",
);
const masterManifestPath = resolve(
  projectRoot,
  "artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-final/review/master-manifest.json",
);

const VERSION = "0.1.0";
const H31_VERSION = "v3.1-20260211";
const FIRST_TWELVE = [
  "hoodoo-caprock",
  "tor-block-pile",
  "boulder-rounded",
  "block-jointed",
  "boulder-river-worn",
  "slab-bedded",
  "outcrop-jointed",
  "outcrop-bedded",
  "ledge-resistant",
  "pillar-residual",
  "sea-stack",
  "volcanic-neck",
];
const RESERVES = [
  "arch-sandstone",
  "boulder-angular",
  "sea-stump",
  "erratic-glacial",
  "fin-sandstone",
  "monolith-jointed",
  "overhang-supported",
  "cliff-bedded",
];
const ROSTER = [...FIRST_TWELVE, ...RESERVES];

const REFERENCE_FILES = [
  ["source-record", "sourceRecord", "sourceRecord"],
  ["nature-anchor", "sourceImage", "sourceImage"],
  ["subtype-prompt", "prompt", "prompt"],
  ["admitted-six-view", "sheet", "sheet"],
  ["six-view-audit", "audit", "audit"],
];

const REUSED_PROVIDER_MANIFESTS = {
  "hoodoo-caprock":
    "artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/tripo-v31-ultra-claron/manifest.json",
  "tor-block-pile":
    "artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/tripo-h31/manifest.json",
  "arch-sandstone":
    "artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/arch-sandstone/provider-h31-proof-r01/provider-task.json",
};

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

function relativeProjectPath(path) {
  return relative(projectRoot, path).split("\\").join("/");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(name, value) {
  const bytes = Buffer.from(stableJson(value));
  const path = resolve(artifactDirectory, name);
  await writeFile(path, bytes);
  return { path: relativeProjectPath(path), sha256: sha256(bytes), bytes: bytes.length };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function providerPolicy(id) {
  if (id === "cliff-bedded") {
    return {
      disposition: "procedural-comparison/no-provider",
      providerUsed: false,
      role: "C0-C7 deterministic procedural-first comparison",
      providerAttemptsAllowed: 0,
      requiredAlternativeProvenance:
        "Record exact generator program, parameters, seeds, source hashes, and output hashes.",
    };
  }

  if (REUSED_PROVIDER_MANIFESTS[id]) {
    return {
      disposition: "reuse-existing",
      providerUsed: true,
      provider: "tripo",
      modelVersion: H31_VERSION,
      role: "anchor/detail-donor only",
      existingEvidenceManifest: REUSED_PROVIDER_MANIFESTS[id],
      newInitialAttemptAllowed: false,
      retryAllowed: false,
      regenerationPolicy:
        "Do not submit another provider task; repair or reject the admitted existing donor.",
    };
  }

  return {
    disposition: "new-h31",
    providerUsed: true,
    provider: "tripo",
    modelVersion: H31_VERSION,
    role: "anchor/detail-donor only",
    initialAttemptsAllowed: 1,
    retriesAllowed: 1,
    maximumAttempts: 2,
    requestPolicy: {
      taskType: "multiview_to_model",
      inputOrder: ["front", "left", "rear", "right"],
      retainedAuditOnlyViews: ["top", "bottom-support"],
      geometryQuality: "detailed",
      faceLimit: 2_000_000,
      geometryOnly: true,
      texture: false,
      pbr: false,
      exportUv: false,
      exactSeedsRequired: true,
    },
    retryPolicy:
      "A retry is permitted only after a recorded C classification, with an exact failure diagnosis and a materially changed justified request. A second failure retires the candidate and promotes a reserve.",
  };
}

function gate(
  id,
  title,
  requirement,
  requiredAssertions,
  requiredNonEmpty = [],
) {
  return {
    id,
    title,
    requirement,
    admissionDecision: "pass",
    evidencePolicy: "At least one existing hash-bound evidence artifact is required.",
    requiredAssertions,
    requiredNonEmpty,
  };
}

async function main() {
  const masterBytes = await readFile(masterManifestPath);
  const master = JSON.parse(masterBytes);
  assert(master.schema === "toonlab/rock-reference-final-review-manifest", "Wrong reference manifest schema.");
  assert(master.counts?.completePackages === 100, "The admitted reference manifest is not 100/100 complete.");

  const byId = new Map(master.entries.map((entry) => [entry.id, entry]));
  assert(new Set(ROSTER).size === 20, "The MVP roster must contain 20 unique candidates.");

  const candidates = [];
  for (const [index, id] of ROSTER.entries()) {
    const entry = byId.get(id);
    assert(entry, `Missing admitted reference package: ${id}`);
    assert(entry.packageComplete && entry.auditApproval && entry.verifier?.passed, `Reference package is not admitted: ${id}`);

    const files = [];
    for (const [role, pathKey, hashKey] of REFERENCE_FILES) {
      const path = entry.paths?.[pathKey];
      const declaredHash = entry.hashes?.[hashKey];
      assert(typeof path === "string" && typeof declaredHash === "string", `${id} lacks ${role} binding.`);
      const actualHash = await sha256File(resolve(projectRoot, path));
      assert(actualHash === declaredHash, `${id} ${role} hash differs from the master manifest.`);
      files.push({ role, path, sha256: declaredHash });
    }

    const provider = providerPolicy(id);
    if (provider.existingEvidenceManifest) {
      provider.existingEvidenceManifestSha256 = await sha256File(
        resolve(projectRoot, provider.existingEvidenceManifest),
      );
    }

    candidates.push({
      mvpOrdinal: index + 1,
      id,
      label: entry.label,
      familyId: entry.familyId,
      familyLabel: entry.familyLabel,
      packageId: entry.packageId,
      cohort: index < FIRST_TWELVE.length ? "first-12" : "reserve",
      canonicalBaselineOnly: true,
      derivativesCountTowardRelease: false,
      reference: {
        manifestOrdinal: entry.ordinal,
        directory: entry.paths.directory,
        files,
        generatedHiddenViewsAreHypotheses: true,
        generatedHiddenViewsAreGeologyEvidence: false,
      },
      provider,
    });
  }

  const firstTwelveFamilies = [...new Set(candidates.slice(0, 12).map((entry) => entry.familyId))];
  assert(firstTwelveFamilies.length >= 6, "The first-12 cohort must cover at least six taxonomy families.");

  await mkdir(artifactDirectory, { recursive: true });

  const rosterDocument = {
    schema: "toonlab/rock-geology-v2-mvp-roster",
    version: VERSION,
    status: "selected-reference-bound-candidates",
    referenceManifest: {
      path: relativeProjectPath(masterManifestPath),
      sha256: sha256(masterBytes),
      fiveFileBindingsPerCandidate: true,
    },
    selection: {
      totalCandidates: 20,
      firstTwelvePriorityCount: 12,
      reserveCount: 8,
      firstTwelveIds: FIRST_TWELVE,
      reserveIds: RESERVES,
      firstTwelveFamilyIds: firstTwelveFamilies,
      firstTwelveFamilyCount: firstTwelveFamilies.length,
      releaseSelectionPolicy:
        "Prioritize the first-12 cohort. A reserve may replace a retired C candidate after its single justified retry; the release still contains exactly 12 canonical assets and must include hoodoo-caprock and tor-block-pile across at least six families.",
    },
    providerSummary: {
      candidateLimit: 20,
      reuseExisting: 3,
      proceduralComparisonNoProvider: 1,
      newH31: 16,
      maximumConcurrentNewH31Jobs: 10,
      maximumJustifiedRetriesPerFailedCandidate: 1,
      rawProviderIsFinalAsset: false,
      providerTexturesAreProductionAuthority: false,
    },
    candidates,
  };
  const rosterFile = await writeJson("roster.json", rosterDocument);

  const perAssetGates = [
    gate(
      "reference-provenance",
      "Admitted evidence binding",
      "Bind the exact admitted nature source, source record, subtype prompt, six-view hypothesis, and six-view audit to the roster hashes.",
      {
        fiveReferenceFilesMatchRoster: true,
        natureReferenceAdmitted: true,
        sixViewAdmitted: true,
        hiddenViewsLabeledHypotheses: true,
      },
    ),
    gate(
      "provider-or-procedural-provenance",
      "Exact proposal provenance",
      "For a provider donor, record provider, exact model version, all request parameters, task ID, transmitted input order/hashes, seeds, and output hashes. For the no-provider comparison, record exact generator/program/parameter/seed/output hashes.",
      { proposalProvenanceComplete: true, rawProposalTreatedAsFinal: false },
      ["proposalIdentity", "requestOrGeneratorParameters", "proposalOutputHashes"],
    ),
    gate(
      "visual-geology",
      "Recognizable geological identity",
      "The six-view silhouette must be recognizable as the named subtype and geologically defensible in macro, meso, micro, erosion, top, bottom, and support structure.",
      {
        sixViewRecognizable: true,
        geologicallyDefensible: true,
        topBottomCompatible: true,
        prohibitedDriftAbsent: true,
      },
      ["morphologyRationale", "geologyAuthority"],
    ),
    gate(
      "orientation-scale-support",
      "Orientation, dimensions, pivot, and support",
      "Prove correct front/up axes, physical scale or labeled hypothesis, applied transforms, intentional pivot, true top/bottom, and stable support contacts.",
      {
        orientationCorrect: true,
        scaleResolved: true,
        transformsApplied: true,
        pivotIntentional: true,
        topAudited: true,
        bottomAudited: true,
        supportContactsStable: true,
      },
      ["dimensionsMetres", "pivotMetres", "supportContactMetrics"],
    ),
    gate(
      "production-topology",
      "One production surface",
      "Produce one appropriate finite positive-volume surface with no helper geometry, exactly one connected component, and zero boundary, wire, non-manifold, loose, degenerate, and genuine self-intersection defects.",
      {
        productionSurfaceCount: 1,
        connectedComponents: 1,
        boundaryEdges: 0,
        wireEdges: 0,
        nonManifoldEdges: 0,
        looseVertices: 0,
        degenerateFaces: 0,
        genuineSelfIntersections: 0,
        positiveFiniteVolume: true,
        helperObjectsAbsent: true,
      },
      ["meshHash", "topologyAuditHash"],
    ),
    gate(
      "editable-semantic-template",
      "Editable ToonLab/Blender template",
      "The saved high/template checkpoint retains a recoverable accepted source, named landmarks, semantic family regions, deterministic rebuild inputs, and ToonLab-owned control authority.",
      {
        semanticRegionsPresent: true,
        namedLandmarksPresent: true,
        deterministicFreshRebuildMatches: true,
        acceptedSourceRecoverable: true,
        toonlabControlAuthority: true,
      },
      ["templateHash", "semanticRegions", "namedLandmarks"],
    ),
    gate(
      "edit-rebake-roundtrip",
      "Procedural and manual edit rebake",
      "Prove at least one fixed-seed procedural edit and one grab-like manual edit preserve subtype identity and regenerate LODs, collision, maps, residuals, package hashes, and evidence.",
      {
        proceduralEditRebuilt: true,
        proceduralEditPreservesIdentity: true,
        manualEditRebuilt: true,
        manualEditPreservesIdentity: true,
        staleDownstreamArtifactsRejected: true,
      },
      ["proceduralEditHash", "manualEditHash", "rebakeEvidenceHashes"],
    ),
    gate(
      "independent-bake",
      "Independent PBR and displacement preservation",
      "Bake ToonLab-owned Base Color, tangent NormalGL, Roughness, AO, ORM, HeightMicro, signed HeightResidual, and family-required semantic maps. Provider textures remain non-authoritative.",
      {
        baseColorAOFree: true,
        normalIsTangentNormalGL: true,
        resizedNormalsRenormalized: true,
        roughnessIndependent: true,
        aoIndependent: true,
        ormPackingIsAORoughnessMetallic: true,
        metallicZeroForOrdinaryRock: true,
        heightMicroSeparate: true,
        heightResidualSignedAndSeparate: true,
        residualClippingZero: true,
        projectionMissesWithinDeclaredLimit: true,
        providerTextureIsAuthority: false,
      },
      ["mapHashes", "heightMicroDecode", "heightResidualDecode", "projectionMetrics"],
    ),
    gate(
      "desktop-mobile-textures",
      "Desktop and mobile texture packages",
      "Ship audited authoring/desktop and mobile texture sets with declared resolutions, transcode policy, channel roles, byte sizes, and hashes.",
      { desktopTexturePackageComplete: true, mobileTexturePackageComplete: true },
      ["desktopTexturePackage", "mobileTexturePackage"],
    ),
    gate(
      "lod-ladder",
      "Measured LOD ladder",
      "Derive near, mid, far, and very-far LODs from the approved high source. Start near 180k/60k/20k/6k triangles, but permit per-asset changes only with measured six-view silhouette and screen-size justification.",
      {
        allLodsDerivedFromApprovedHigh: true,
        nearPresent: true,
        midPresent: true,
        farPresent: true,
        veryFarPresent: true,
        sixViewSilhouetteMeasured: true,
        landmarkRetentionReviewed: true,
      },
      ["lodTriangleCounts", "silhouetteMetrics", "screenSizeJustification"],
    ),
    gate(
      "collision",
      "Collision policy",
      "Provide an audited collision mesh or an explicit measured static-complex collision policy appropriate to the asset and target runtime.",
      { collisionPolicyDeclared: true, collisionAudited: true },
      ["collisionPolicy", "collisionEvidenceHash"],
    ),
    gate(
      "reversible-stylization",
      "Neutral and reversible ToonLab style",
      "Keep neutral and stylized outputs independently accessible. Disabling style must restore the exact neutral source. Declare whether the admitted style is material-only or geometry-changing; any geometry-changing style must regenerate and re-audit downstream assets.",
      {
        neutralOutputPresent: true,
        stylizedOutputPresent: true,
        exactNeutralRestoreVerified: true,
        stylizationModeDeclared: true,
        downstreamInvalidationPolicyVerified: true,
      },
      [
        "neutralHash",
        "stylizedHash",
        "restoredNeutralHash",
        "styleParameters",
        "stylizationMode",
        "shapeChangePolicy",
      ],
    ),
    gate(
      "glb-export",
      "Audited GLB delivery",
      "Byte-audit the expected visual and collision GLBs for exact hashes, dimensions, pivots, mesh/material identities, texture bindings, triangle totals, and absence of cameras, lights, animations, helpers, and accidental paths.",
      {
        glbAuditPassed: true,
        dimensionsVerified: true,
        pivotsVerified: true,
        materialsVerified: true,
        textureBindingsVerified: true,
        helpersAbsent: true,
        camerasLightsAnimationsAbsent: true,
      },
      ["glbFiles", "glbAuditHash"],
    ),
    gate(
      "mobile-runtime",
      "Measured mobile/runtime validation",
      "Validate the packaged asset on declared target hardware/runtime with measured draw calls, material slots, texture memory, vertex bandwidth, transitions, and frame/GPU cost.",
      { actualTargetRuntimeTested: true, runtimePass: true },
      ["runtimeProfiles", "runtimeMetrics", "runtimeEvidenceHashes"],
    ),
    gate(
      "developer-visual-approval",
      "Binding developer visual decision",
      "A developer must explicitly approve this exact asset and final checkpoint board for MVP v0.1. Automated scores can reject but cannot approve.",
      { developerApproved: true, decisionIsBinding: true },
      ["decisionId", "developerIdentity", "decidedAt", "decisionEvidenceHash"],
    ),
  ];

  const checkpointBoards = [
    {
      id: "01-reference-six-view-raw-aligned",
      title: "Nature reference + admitted six-view + raw aligned proposal clay",
      requiredPanels: ["nature-reference", "admitted-six-view", "raw-aligned-proposal-clay"],
      noProviderAlternative:
        "For cliff-bedded, use the raw aligned procedural-comparison clay and label the provider panel not used; the board remains required.",
    },
    {
      id: "02-raw-versus-repaired-six-view",
      title: "Raw versus topology-repaired six views",
      requiredPanels: ["raw-six-view", "topology-repaired-six-view"],
    },
    {
      id: "03-neutral-versus-independent-bake",
      title: "Neutral clay versus independently baked result",
      requiredPanels: ["approved-neutral-clay", "independently-baked-result"],
    },
    {
      id: "04-desktop-versus-mobile-lods",
      title: "Desktop versus mobile LOD comparison",
      requiredPanels: ["desktop-near", "mobile-near", "mobile-mid", "mobile-far", "mobile-very-far"],
    },
    {
      id: "05-neutral-versus-stylized",
      title: "Neutral versus reversible stylized result",
      requiredPanels: ["neutral", "stylized", "style-disabled-restored-neutral"],
    },
    {
      id: "06-final-admission-decision",
      title: "Final admission decision and exact blockers",
      requiredPanels: ["nature-anchor", "final-neutral", "final-stylized", "near-lod", "far-lod", "decision-and-blockers"],
    },
  ];

  const releaseContract = {
    schema: "toonlab/rock-geology-v2-mvp-release-contract",
    version: VERSION,
    contractState: "active",
    roster: rosterFile,
    strategy: {
      name: "Tripo-first, ToonLab-owned afterward",
      rawProviderOutputCanShip: false,
      providerTextureCanBeProductionAuthority: false,
      c0ThroughC7Role:
        "Preserved deterministic geology, editing, meshing, baking, scaling, caching, and variation infrastructure; it is not required to invent every canonical starting silhouette.",
      downstreamOwnership: [
        "orientation",
        "topology repair",
        "geology-controlled high source",
        "editable semantic template",
        "independent baking",
        "procedural and manual edits",
        "LODs",
        "collision",
        "stylization",
        "export",
      ],
    },
    visualBenchmark: {
      assetId: "hoodoo-caprock",
      status: "developer-approved-benchmark",
      decisionDate: "2026-08-18",
      decisionBasis: "Developer stated that the hoodoo is good enough and may benchmark the remaining MVP assets.",
      benchmarkScope: "Visual quality floor for MVP comparison.",
      releaseEligibilityConferred: false,
      reason:
        "Benchmark acceptance does not substitute for topology, edit/rebake, bake, LOD, collision, export, runtime, checkpoint-board, or per-asset final approval evidence.",
    },
    workflowFreeze: {
      processVersion: "0.1",
      initialState: "not-frozen",
      currentStateAuthority: "The hash-bound workflow-freeze evidence record, evaluated fail-closed by the verifier.",
      evidencePath:
        "artifacts/research/rock-geology-v2/mvp-v0.1/workflow-freeze-v0.1.json",
      evidenceSchema: "toonlab/rock-geology-v2-mvp-workflow-freeze",
      prerequisites: [
        "hoodoo-caprock satisfies every per-asset gate and has a binding final developer approval",
        "tor-block-pile satisfies every per-asset gate and has a binding final developer approval",
      ],
      freezeBeforeBothPassForbidden: true,
      universalFamilyCoverageRequiredBeforeFreeze: false,
      freezeDoesNotConferAssetEligibility: true,
      bindingDeveloperDecisionRequired: true,
      admittedHoodooAndTorHashesRequired: true,
    },
    perAssetGates,
    checkpointBoards,
    assetAdmission: {
      schema: "toonlab/rock-geology-v2-mvp-asset-admission",
      version: VERSION,
      pathTemplate:
        "artifacts/research/rock-geology-v2/mvp-v0.1/assets/{assetId}/admission.json",
      canonicalRequired: true,
      derivativeOfMustBeNull: true,
      releaseSlotRange: [1, 12],
      allGateDecisionsMustEqual: "pass",
      everyGateRequiresExistingHashBoundEvidence: true,
      everyCheckpointBoardRequired: true,
      technicalReadinessMustEqual: "pass",
      visualReadinessMustEqual: "pass",
      blockersMustBeEmpty: true,
      claims: { megascansParity: "not-claimed" },
      developerDecisionBinding: {
        required: true,
        scope: "mvp-v0.1-release",
        decision: "approved",
        automatedApprovalAllowed: false,
        requiredFields: [
          "decisionId",
          "developerIdentity",
          "decidedAt",
          "decisionEvidenceHash",
          "contractSha256",
        ],
      },
    },
    providerLimits: {
      candidatePoolSize: 20,
      maximumConcurrentProviderJobs: 10,
      defaultProvider: "tripo",
      defaultModelVersion: H31_VERSION,
      maximumRetriesPerFailedCandidate: 1,
      retryRequiresPriorClassification: "C",
      retryRequiresJustification: true,
      secondFailureAction: "retire candidate and promote a reserve",
      existingOutputsNotRegenerated: ["hoodoo-caprock", "tor-block-pile", "arch-sandstone"],
      providerFreeComparison: ["cliff-bedded"],
    },
    releaseBoundary: {
      releaseAssetCount: 12,
      minimumDistinctFamilyCount: 6,
      mandatoryAssetIds: ["hoodoo-caprock", "tor-block-pile"],
      candidateIdsRestrictedToRoster: true,
      canonicalAssetsOnly: true,
      uniqueReleaseSlotsRequired: true,
      seededDerivativesCount: false,
      technicallyGreenVisualFailuresCount: false,
      referencePackagesAreFinishedRocks: false,
      stopAfterFirstTwelveEligible: true,
      workflowV01FreezeEvidenceRequired: true,
      releaseDefinition:
        "Exactly 12 fully qualified canonical rocks from this roster, including hoodoo-caprock and tor-block-pile and covering at least six taxonomy families, usable in ToonLab with editing, rebaking, reversible stylization, mobile LODs, collision, independently baked materials, and verified GLB export.",
    },
    excludedFromMvpBlockingBoundary: [
      "892-slot catalog completion",
      "C9 formation-scale rollout",
      "complete C10 family rollout",
      "final C12-C14 qualification beyond the per-asset MVP runtime/export evidence",
    ],
    claimsPolicy: {
      megascansParityClaimAllowed: false,
      directNormalizedCloseupApprovalWouldBeRequiredForFutureClaim: true,
      approvedLanguage: [
        "technical pass / visual pass",
        "technical pass / visual fail",
        "technical fail",
        "reference blocked",
      ],
    },
  };
  const contractFile = await writeJson("release-contract.json", releaseContract);

  const primaryNewH31Ids = FIRST_TWELVE.filter(
    (id) => providerPolicy(id).disposition === "new-h31",
  );
  const reserveNewH31Ids = RESERVES.filter(
    (id) => providerPolicy(id).disposition === "new-h31",
  );
  assert(primaryNewH31Ids.length === 10, "The first provider batch must contain ten primary H3.1 jobs.");
  assert(reserveNewH31Ids.length === 6, "The reserve provider batch must contain six H3.1 jobs.");

  const logicalLanes = Array.from({ length: 10 }, (_, index) => ({
    laneId: `asset-lane-${String(index + 1).padStart(2, "0")}`,
    productionModelClass: "GPT-5.6 Sol High",
    difficultShapeOrRepairEscalation: "GPT-5.6 Sol Extra High",
    finalIndependentAuditEscalation: "GPT-5.6 Sol Max only when unusually difficult or for final independent audit",
    firstProviderAssignment: primaryNewH31Ids[index],
    reserveProviderAssignment: reserveNewH31Ids[index] ?? null,
    ownershipRule: "One immutable candidate input and one disjoint candidate output directory at a time.",
  }));

  const workerPlan = {
    schema: "toonlab/rock-geology-v2-mvp-worker-plan",
    version: VERSION,
    roster: rosterFile,
    releaseContract: contractFile,
    coordination: {
      rootRole: "Coordinate provider queue, ownership, checkpoint reviews, reserve promotion, and release selection.",
      maximumConcurrentCandidatePipelines: 10,
      maximumConcurrentProviderJobs: 10,
      independentAuditCapacityReserved: true,
      noOverlappingFileOwnership: true,
      immutableInputs: true,
    },
    modelAllocation: {
      solExtraHigh: ["canonical-shape judgment", "difficult repair", "asset-level approval preparation"],
      solHigh: ["repeatable Blender repair", "baking", "LODs", "collision", "manifests", "verification"],
      max: ["workflow redesign only", "unusually difficult failure", "final independent audit"],
    },
    immediatePriority: [
      {
        order: 1,
        assetId: "tor-block-pile",
        assignment: "Sol Extra High shape/finish lane plus Sol High downstream packaging",
        objective: "Become the second complete end-to-end asset after hoodoo-caprock.",
      },
      {
        order: 2,
        assetId: "hoodoo-caprock",
        assignment: "independent audit capacity",
        objective:
          "Bind existing evidence to the v0.1 admission contract without regenerating the provider donor; retain developer-approved benchmark status while closing missing release gates.",
      },
      {
        order: 3,
        assetId: "arch-sandstone",
        assignment: "difficult topology-repair stress lane",
        objective: "Preserve and continue the existing H3.1 repair evidence without blocking MVP release.",
      },
      {
        order: 4,
        assetId: "cliff-bedded",
        assignment: "procedural comparison lane",
        objective: "Preserve C0-C7 procedural-first comparison evidence without blocking provider production.",
      },
    ],
    providerWaves: [
      {
        waveId: "primary-h31-10",
        status: "authorized-not-implied-complete",
        maximumConcurrentJobs: 10,
        assets: primaryNewH31Ids,
        launchRule: "Submit exact admitted inputs in one controlled batch; provider success is only triage input.",
      },
      {
        waveId: "reserve-h31-6",
        status: "standby",
        maximumConcurrentJobs: 6,
        assets: reserveNewH31Ids,
        launchRule:
          "Launch only as capacity permits or after a primary is retired; do not wait for all reserves before shipping the first 12 eligible assets.",
      },
    ],
    logicalLanes,
    triage: {
      A: "Recognizable and structurally straightforward: proceed through ToonLab-owned high source and downstream gates.",
      B: "Recognizable but repairable: perform bounded Blender repair, preserving the donor classification and exact evidence.",
      C: "Incorrect silhouette or impractical topology: permit one justified retry; on second C retire and promote a reserve.",
      automaticApprovalForbidden: true,
    },
    checkpointCadence: {
      boardsPerCandidate: 6,
      continueIndependentWorkWhileReviewPending: true,
      userReviewDoesNotWaiveTechnicalGates: true,
    },
    workflowFreezeSequence: [
      "complete hoodoo-caprock v0.1 admission",
      "complete tor-block-pile v0.1 admission",
      "obtain binding final developer decisions for both",
      "freeze skill/process v0.1",
      "continue parallel production without waiting for universal family support",
    ],
  };
  const workerPlanFile = await writeJson("worker-plan.json", workerPlan);

  const readme = `# ToonLab rock MVP v0.1\n\nThis directory is the fail-closed machine-readable boundary for the first usable ToonLab rock milestone. It does not rename the 100 admitted reference packages as finished rocks.\n\n## Current decision\n\n- Hoodoo caprock is the developer-approved visual benchmark for the remaining MVP assets. That visual benchmark alone does **not** make hoodoo release-eligible.\n- Tor block pile remains the next complete end-to-end target.\n- The release is exactly 12 canonical assets from the 20-candidate roster, including hoodoo and tor, across at least six taxonomy families.\n- Seeded or manual derivatives never count as separate canonical baselines.\n- No Megascans-parity claim is made.\n\n## Authoritative files\n\n- \`roster.json\`: exact first-12 and reserve ordering, taxonomy families, five-file admitted-reference hashes, and provider dispositions.\n- \`release-contract.json\`: all per-asset gates, six visual checkpoints, retry/concurrency rules, workflow-freeze prerequisites, and release boundary.\n- \`worker-plan.json\`: logical disjoint ownership lanes, model allocation, provider waves, and A/B/C triage.\n- \`verification.json\`: current fail-closed eligibility report written by the verifier.\n\nThe generated binding hashes are:\n\n- Roster: \`${rosterFile.sha256}\`\n- Release contract: \`${contractFile.sha256}\`\n- Worker plan: \`${workerPlanFile.sha256}\`\n\n## Commands\n\nFrom the \`toonlab\` package root:\n\n\`\`\`sh\nnode scripts/prepare-rock-geology-v2-mvp-v01.mjs\nnode scripts/verify-rock-geology-v2-mvp-v01.mjs --write\n\`\`\`\n\nThe verifier intentionally exits nonzero until exactly 12 admissions satisfy every gate. During production, use \`--allow-incomplete\` only to refresh the truthful blocked snapshot; integrity failures still exit nonzero.\n\n## Asset admission location\n\nEach future canonical asset writes \`artifacts/research/rock-geology-v2/mvp-v0.1/assets/<asset-id>/admission.json\` using the schema and evidence rules in \`release-contract.json\`. The verifier checks the admission, every evidence hash, every checkpoint board, reference binding, provider/retry policy, release slot, and binding developer decision.\n`;
  await writeFile(resolve(artifactDirectory, "README.md"), readme);

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactDirectory: relativeProjectPath(artifactDirectory),
        files: {
          roster: rosterFile,
          releaseContract: contractFile,
          workerPlan: workerPlanFile,
          readme: relativeProjectPath(resolve(artifactDirectory, "README.md")),
        },
        counts: {
          candidates: candidates.length,
          firstTwelve: FIRST_TWELVE.length,
          reserves: RESERVES.length,
          firstTwelveFamilies: firstTwelveFamilies.length,
          newH31: candidates.filter((entry) => entry.provider.disposition === "new-h31").length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
