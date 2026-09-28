#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CHECKPOINT_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families',
);
const OUTPUT_DIRECTORY = path.join(CHECKPOINT_DIRECTORY, 'geology-naturalness-review');
const PACKET_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-packet');
const SUBMISSION_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-submissions');
const CURRENT_SOURCE_DIRECTORY = path.join(
  CHECKPOINT_DIRECTORY,
  'clay-identification-review/current-v3-source',
);
const REFERENCE_DIRECTORY = path.join(
  CHECKPOINT_DIRECTORY,
  'morphology/reference-final',
);
const PROTOCOL_ID = 'toonlab-rock-geology-v2-c8-geology-naturalness-v1';
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

const REFERENCE_BINDINGS = {
  'granite-boulder': {
    packages: ['clasts/boulder-subrounded'],
    correspondence: 'exact',
    rationale: 'Joint-derived granite boulder with unevenly rounded corners and a stable broad base.',
  },
  'granite-tor': {
    packages: ['residuals/tor-block-pile'],
    correspondence: 'exact',
    rationale: 'In-situ joint-controlled granite residual with coherent blocks and a continuous plinth.',
  },
  'sandstone-cliff': {
    packages: ['cliffs/cliff-bedded'],
    correspondence: 'exact',
    rationale: 'Bedded sedimentary cliff with finite joints, unequal ledges, buttresses, and a connected toe.',
  },
  'sandstone-arch': {
    packages: ['cliffs/arch-sandstone'],
    correspondence: 'exact',
    rationale: 'Sandstone natural arch whose opening, roof, abutments, and bedding form one supported mass.',
  },
  'basalt-colonnade': {
    packages: ['forms/column-colonnade'],
    correspondence: 'exact',
    rationale: 'Cooling-jointed polygonal basalt columns with a coherent base and non-identical column heights.',
  },
  'basalt-entablature': {
    packages: ['forms/column-entablature'],
    correspondence: 'partial',
    rationale: 'The package has authoritative process support, but its nature photo does not isolate an entablature strongly enough for a final class-level judgment.',
  },
  'limestone-spire': {
    packages: ['forms/karst-spire-singular'],
    correspondence: 'exact',
    rationale: 'Dissolution-shaped limestone residual with a broad base, irregular crest, grooves, and non-periodic ledges.',
  },
  'limestone-cave': {
    packages: ['cliffs/cave-mouth-karst'],
    correspondence: 'exact',
    rationale: 'Finite karst entrance with thick roof, continuous host rock, side walls, and a descending support floor.',
  },
  'shale-slope': {
    packages: ['clasts/shard-platy', 'forms/sheet-scree'],
    correspondence: 'composite-partial',
    rationale: 'One source establishes fissile shale fragments and one establishes gravity-built scree; no exact shale-slope nature witness binds both at outcrop scale.',
  },
  'slate-outcrop': {
    packages: ['clasts/slab-cleavage'],
    correspondence: 'proxy-only',
    rationale: 'The current package establishes cleavage-controlled platy fabric from schist, not an exact slate outcrop.',
  },
  'gneiss-outcrop': {
    packages: ['residuals/outcrop-foliated'],
    correspondence: 'exact',
    rationale: 'Exact gneiss outcrop reference with connected, fabric-guided ribs, slabs, and joint-bounded external breaks.',
  },
  'schist-outcrop': {
    packages: ['clasts/slab-cleavage', 'residuals/outcrop-foliated'],
    correspondence: 'composite-partial',
    rationale: 'The sources separately establish schist fabric and foliated outcrop scale, but do not provide one exact schist-outcrop nature witness.',
  },
  'conglomerate-outcrop': {
    packages: ['residuals/outcrop-clastic'],
    correspondence: 'exact',
    rationale: 'Exact conglomerate bedrock reference with embedded rounded clasts that affect broken edges.',
  },
  'volcanic-breccia-outcrop': {
    packages: ['clasts/shard-splintery'],
    correspondence: 'proxy-only',
    rationale: 'The source establishes angular volcanic breccia fragments, not the macro silhouette and support of a volcanic-breccia outcrop.',
  },
  'river-boulder': {
    packages: ['clasts/boulder-river-worn'],
    correspondence: 'exact',
    rationale: 'Transport-rounded but asymmetric river boulder with an imbricated or broad stable pose.',
  },
  'talus-assembly': {
    packages: ['forms/fan-talus'],
    correspondence: 'exact',
    rationale: 'Gravity-built apron of angular blocks with a source edge, irregular toe, and non-uniform size distribution.',
  },
};

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeDeclaredHash(value) {
  return typeof value === 'string' ? value.replace(/^sha256:/, '') : null;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function natureMetadata(source) {
  const exact = source.exactNatureSource ?? {};
  const nature = source.naturePhoto ?? {};
  const local = typeof exact.localImage === 'object' ? exact.localImage : {};
  return {
    stablePageUrl: firstDefined(
      exact.pageUrl,
      nature.stablePageUrl,
      nature.pageUrl,
      source.stablePageUrl,
      source.sourcePageUrl,
      source.natureReferences?.[0]?.stablePageUrl,
    ),
    title: firstDefined(exact.title, nature.title, source.title, source.label, source.subtypeId),
    credit: firstDefined(exact.credit, nature.credit, source.credit, source.natureReferences?.[0]?.credit),
    license: firstDefined(exact.license, nature.license, source.license, source.natureReferences?.[0]?.license),
    rights: firstDefined(exact.rightsRecord, exact.rights, nature.rights, source.rights),
    declaredLocalHash: normalizeDeclaredHash(firstDefined(
      local.sha256,
      nature.localImageSha256,
      source.localImageSha256,
      source.localSha256,
      source.sourceSha256,
      source.sourceContentHash,
      source.natureReferences?.[0]?.sha256,
    )),
  };
}

function sourceCriteria(source) {
  return {
    requiredSilhouette: source.requiredSilhouette
      ?? source.taxonomy?.requiredSilhouette
      ?? source.identityChecks
      ?? [],
    requiredStructure: source.requiredStructure
      ?? source.taxonomy?.requiredStructure
      ?? source.structuralClues
      ?? [],
    forbiddenDrift: source.forbiddenDrift
      ?? source.taxonomy?.forbiddenDrift
      ?? [],
    shapeRationale: source.shapeRationale ?? source.featureRationale ?? null,
  };
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

await Promise.all([
  mkdir(PACKET_DIRECTORY, { recursive: true }),
  mkdir(SUBMISSION_DIRECTORY, { recursive: true }),
]);

const heroIndexPath = path.join(CURRENT_SOURCE_DIRECTORY, 'hero-output-index.json');
const lineagePath = path.join(CURRENT_SOURCE_DIRECTORY, 'lineage.json');
const [heroIndexBytes, lineageBytes] = await Promise.all([
  readFile(heroIndexPath),
  readFile(lineagePath),
]);
const heroIndex = JSON.parse(heroIndexBytes);
const lineage = JSON.parse(lineageBytes);
const witnesses = heroIndex
  .filter((record) => record.heroRole === 'median' || record.heroRole === 'challenging')
  .sort((left, right) => left.variantId.localeCompare(right.variantId));
assert(witnesses.length === 16, `Expected 16 current class witnesses, found ${witnesses.length}.`);
assert(new Set(witnesses.map((record) => record.variantId)).size === 16, 'Current witnesses do not cover 16 unique classes.');
assert(Object.keys(REFERENCE_BINDINGS).length === 16, 'Reference binding table must cover exactly 16 classes.');
assert(witnesses.every((record) => REFERENCE_BINDINGS[record.variantId]), 'A current witness lacks a nature-reference binding.');

const evidenceRecords = [];
const queueItems = [];
for (const record of witnesses) {
  const binding = REFERENCE_BINDINGS[record.variantId];
  const meshPath = path.join(CURRENT_SOURCE_DIRECTORY, record.file);
  const programPath = path.join(CURRENT_SOURCE_DIRECTORY, record.programFile);
  const [meshBytes, programBytes] = await Promise.all([readFile(meshPath), readFile(programPath)]);
  const capturePrefix = `${record.familyId}--${record.variantId}--${record.heroRole}--clay--`;
  const availableCaptures = [];
  for (const view of [...REQUIRED_VIEWS, 'threeQuarter']) {
    const capturePath = path.join(CURRENT_SOURCE_DIRECTORY, 'captures', `${capturePrefix}${view}.png`);
    try {
      const bytes = await readFile(capturePath);
      availableCaptures.push({
        view,
        path: path.relative(process.cwd(), capturePath),
        sha256: sha256(bytes),
        bytes: bytes.length,
      });
    } catch {
      // The queue below records any missing capture rather than fabricating one.
    }
  }
  const references = [];
  for (const packageRelativePath of binding.packages) {
    const packagePath = path.join(REFERENCE_DIRECTORY, packageRelativePath);
    const sourcePath = path.join(packagePath, 'source.json');
    const naturePath = path.join(packagePath, 'source-image.jpg');
    const hypothesisPath = path.join(packagePath, 'six-view.png');
    const [sourceBytes, natureBytes, hypothesisBytes] = await Promise.all([
      readFile(sourcePath),
      readFile(naturePath),
      readFile(hypothesisPath),
    ]);
    const source = JSON.parse(sourceBytes);
    const metadata = natureMetadata(source);
    references.push({
      package: packageRelativePath,
      subtypeId: source.subtypeId,
      sourceRecord: {
        path: path.relative(process.cwd(), sourcePath),
        sha256: sha256(sourceBytes),
      },
      exactNatureImage: {
        path: path.relative(process.cwd(), naturePath),
        sha256: sha256(natureBytes),
        bytes: natureBytes.length,
        stablePageUrl: metadata.stablePageUrl,
        title: metadata.title,
        credit: metadata.credit,
        license: metadata.license,
        rights: metadata.rights,
        declaredSha256: metadata.declaredLocalHash,
        declaredHashMatches: metadata.declaredLocalHash === sha256(natureBytes),
      },
      generatedSixViewHypothesis: {
        path: path.relative(process.cwd(), hypothesisPath),
        sha256: sha256(hypothesisBytes),
        geologyEvidence: false,
        role: 'authored hidden-view hypothesis only',
      },
      criteria: sourceCriteria(source),
    });
  }

  const availableViews = new Set(availableCaptures.map((capture) => capture.view));
  const missingViews = REQUIRED_VIEWS.filter((view) => !availableViews.has(view));
  const referenceReady = binding.correspondence === 'exact';
  const blockers = [];
  if (missingViews.length > 0) blockers.push(`missing-current-views:${missingViews.join(',')}`);
  if (!referenceReady) blockers.push(`nature-reference-correspondence:${binding.correspondence}`);
  if (references.some((reference) => !reference.exactNatureImage.declaredHashMatches)) {
    blockers.push('nature-source-declared-hash-mismatch');
  }
  if (references.some((reference) => !reference.exactNatureImage.stablePageUrl)) {
    blockers.push('nature-source-stable-page-missing');
  }
  const evidenceId = `GEO-${String(evidenceRecords.length + 1).padStart(2, '0')}`;
  const evidence = {
    evidenceId,
    classId: record.variantId,
    familyId: record.familyId,
    lithology: record.lithology,
    mechanism: record.mechanism,
    heroRole: record.heroRole,
    recipeId: record.recipeId,
    currentWitness: {
      basisCompilerVersion: record.basisCompilerVersion,
      basisFieldVersion: record.basisFieldVersion,
      meshResolution: record.meshResolution,
      fieldContentId: record.fieldContentId,
      meshContentId: record.meshContentId,
      meshContentSha256: record.meshContentSha256,
      mesh: {
        path: path.relative(process.cwd(), meshPath),
        sha256: sha256(meshBytes),
        declaredSha256: record.meshObjSha256,
      },
      program: {
        path: path.relative(process.cwd(), programPath),
        sha256: sha256(programBytes),
        declaredSha256: record.programSha256,
      },
      captures: availableCaptures,
      requiredViews: REQUIRED_VIEWS,
      missingViews,
    },
    natureReferenceBinding: {
      correspondence: binding.correspondence,
      rationale: binding.rationale,
      reviewReady: referenceReady,
      references,
    },
    reviewReady: blockers.length === 0,
    blockers,
  };
  evidenceRecords.push(evidence);
  if (blockers.length > 0) {
    queueItems.push({
      evidenceId,
      classId: record.variantId,
      priority: referenceReady ? 'required-view-capture' : 'reference-and-view-capture',
      blockers,
      requiredActions: [
        ...(missingViews.length > 0
          ? [`Render the exact bound OBJ in neutral clay from ${missingViews.join(', ')} using the same camera/lighting policy.`]
          : []),
        ...(!referenceReady
          ? ['Admit and locally retain an exact class-level nature photograph with stable page, rights, observed morphology, and geology-authority rationale.']
          : []),
      ],
    });
  }
}

const protocol = {
  protocolId: PROTOCOL_ID,
  checkpoint: 8,
  stage: 'geology-naturalness-after-blind-class-identification',
  purpose: 'Determine whether each identifiable C8 clay shape is geologically natural and defensible against exact nature evidence.',
  separationFromIdentificationGate: {
    separate: true,
    identificationQuestion: 'Can reviewers identify the intended class from clay alone?',
    naturalnessQuestion: 'Given the disclosed class and admitted nature evidence, is the current geometry natural, process-consistent, supported, and free of forbidden drift?',
    noSubstitution: 'Passing either gate cannot compensate for failing or not running the other.',
  },
  evidencePolicy: {
    admitted: [
      'the exact hash-bound current neutral-clay mesh and six required current views',
      'the exact locally retained nature photograph and stable provenance page',
      'geology authority claims recorded by the reference package',
    ],
    generatedReferenceViews: 'May aid hidden-side interpretation but are explicitly not geology evidence.',
    excluded: ['PBR texture persuasion', 'stylization', 'provider marketing claims', 'unbound web search thumbnails'],
  },
  requiredViews: REQUIRED_VIEWS,
  scoredDimensions: SCORED_DIMENSIONS,
  scoringScale: {
    1: 'clear geological failure or contradiction',
    2: 'major defect; class may read but naturalness is not credible',
    3: 'borderline; material correction is required before approval',
    4: 'credible natural result with only minor non-identity defects',
    5: 'strongly defensible correspondence to natural morphology and process',
  },
  dimensionDefinitions: {
    naturalSilhouette: 'Front, side, rear, plan, and support silhouettes have process-consistent proportions, asymmetry, termination, and massing.',
    macroFabric: 'Joints, beds, foliation, columns, clasts, fissility, or transport fabric organize the volume rather than appearing as unrelated noise.',
    processPlausibility: 'Weathering, erosion, fracture, cooling, dissolution, transport, or deposition explains the form at the represented scale.',
    supportStability: 'Contact, toe, plinth, abutments, roof, or clast packing provide a plausible load path with no unexplained floating or balancing mass.',
    topBottomPlausibility: 'True top and bottom-support views are compatible with the side silhouettes and reveal a plausible footprint, crest, roof, opening, or packing.',
    forbiddenDriftAbsence: 'The specimen avoids the class-specific forbidden shapes, repetitive procedural artifacts, blobs, crystals, masonry, stripes, and unsupported topology.',
    natureReferenceCorrespondence: 'Major silhouette, structural organization, and formation-process cues correspond to the exact admitted nature photograph, within documented scale/view limitations.',
  },
  reviewerRequirements: {
    minimumIndependentReviewers: 3,
    minimumQualifiedReviewers: 3,
    allowedQualifications: [
      'licensed-professional-geologist',
      'field-geology-researcher',
      'geomorphology-researcher',
      'engineering-geologist',
    ],
    minimumFieldGeologyReviewers: 1,
    minimumGeomorphologyOrProcessReviewers: 1,
    identityAndAffiliationRequired: true,
    independentWorkAttestationRequired: true,
    noGeneratorAuthorshipConflictAttestationRequired: true,
    exactEvidenceHashAttestationRequired: true,
  },
  passThresholds: {
    perClassPerDimensionMedianMinimum: 4,
    perClassOverallMeanMinimum: 4.1,
    individualScoreFloor: 3,
    unresolvedCriticalDefectsAllowed: 0,
    everyClassMustPass: true,
    developerApprovalRequiredAfterReviewerPass: true,
  },
  failClosedRules: [
    'Do not distribute a class packet while any required current view or exact nature binding is missing.',
    'Do not infer missing scores or treat absent reviewers as approval.',
    'Any hash drift invalidates affected submissions.',
    'Any score below 3 or critical defect fails that class pending a new bound witness.',
    'The review gate remains false until all 16 classes pass and a developer signs the exact adjudication hash.',
  ],
};

const reviewSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'toonlab-rock-geology-v2-c8-geology-naturalness-review.schema.json',
  type: 'object',
  additionalProperties: false,
  required: ['protocolId', 'evidenceManifestSha256', 'reviewer', 'startedAt', 'completedAt', 'classReviews'],
  properties: {
    protocolId: { const: PROTOCOL_ID },
    evidenceManifestSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    reviewer: {
      type: 'object',
      additionalProperties: false,
      required: ['reviewerId', 'fullName', 'affiliation', 'qualification', 'fieldGeologyExpertise', 'geomorphologyOrProcessExpertise', 'independentWorkAttestation', 'noGeneratorAuthorshipConflictAttestation', 'exactEvidenceHashAttestation'],
      properties: {
        reviewerId: { type: 'string', minLength: 3 },
        fullName: { type: 'string', minLength: 3 },
        affiliation: { type: 'string', minLength: 2 },
        qualification: { enum: protocol.reviewerRequirements.allowedQualifications },
        fieldGeologyExpertise: { type: 'boolean' },
        geomorphologyOrProcessExpertise: { type: 'boolean' },
        independentWorkAttestation: { const: true },
        noGeneratorAuthorshipConflictAttestation: { const: true },
        exactEvidenceHashAttestation: { const: true },
      },
    },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    classReviews: {
      type: 'array',
      minItems: 16,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['evidenceId', 'scores', 'criticalDefects', 'referenceCorrespondenceNotes', 'geologyReasoning', 'disposition'],
        properties: {
          evidenceId: { type: 'string', pattern: '^GEO-[0-9]{2}$' },
          scores: {
            type: 'object',
            additionalProperties: false,
            required: SCORED_DIMENSIONS,
            properties: Object.fromEntries(SCORED_DIMENSIONS.map((dimension) => [dimension, { type: 'integer', minimum: 1, maximum: 5 }])),
          },
          criticalDefects: { type: 'array', items: { type: 'string', minLength: 3 } },
          referenceCorrespondenceNotes: { type: 'string', minLength: 20 },
          geologyReasoning: { type: 'string', minLength: 40 },
          disposition: { enum: ['pass', 'revise', 'reject'] },
        },
      },
    },
  },
};

const rubric = `# C8 geology-naturalness review rubric\n\nThis is a disclosed, evidence-bound naturalness review. It is deliberately separate from the blind class-identification matrix. Review the exact current clay mesh through all six required views, then compare it to the exact nature photograph and recorded geology authority. Generated six-view references are hypothesis aids only.\n\n## Scored dimensions\n\n${SCORED_DIMENSIONS.map((dimension) => `- **${dimension}** — ${protocol.dimensionDefinitions[dimension]}`).join('\n')}\n\n## Scale\n\n- **1** — clear geological contradiction.\n- **2** — major defect; not credible.\n- **3** — borderline and requires revision.\n- **4** — credible natural result with minor non-identity defects only.\n- **5** — strongly defensible natural morphology and process correspondence.\n\nA class passes only when every dimension has a reviewer median of at least 4, its overall mean is at least 4.1, no individual score is below 3, no critical defect remains, and the reviewer disposition is pass. All 16 classes, reviewer quorum, and explicit developer approval are mandatory.\n`;

await Promise.all([
  writeFile(path.join(OUTPUT_DIRECTORY, 'protocol.json'), stableJson(protocol)),
  writeFile(path.join(OUTPUT_DIRECTORY, 'review-schema.json'), stableJson(reviewSchema)),
  writeFile(path.join(OUTPUT_DIRECTORY, 'rubric.md'), rubric),
]);
const [protocolBytes, schemaBytes, rubricBytes] = await Promise.all([
  readFile(path.join(OUTPUT_DIRECTORY, 'protocol.json')),
  readFile(path.join(OUTPUT_DIRECTORY, 'review-schema.json')),
  readFile(path.join(OUTPUT_DIRECTORY, 'rubric.md')),
]);

const manifest = {
  checkpoint: 8,
  protocolId: PROTOCOL_ID,
  generatedBy: 'scripts/prepare-rock-geology-v2-geology-naturalness-review.mjs',
  instrumentIntegrityReady: true,
  distributionAuthorized: queueItems.length === 0,
  reviewGatePassed: false,
  coverage: {
    families: new Set(evidenceRecords.map((record) => record.familyId)).size,
    classes: evidenceRecords.length,
    currentWitnesses: evidenceRecords.length,
  },
  sourceSnapshot: {
    heroIndex: {
      path: path.relative(process.cwd(), heroIndexPath),
      sha256: sha256(heroIndexBytes),
    },
    lineage: {
      path: path.relative(process.cwd(), lineagePath),
      sha256: sha256(lineageBytes),
      basisCompilerVersion: lineage.basisCompilerVersion,
      basisFieldVersion: lineage.basisFieldVersion,
      sourceTreeAggregateSha256: lineage.sourceLineage.aggregateSha256,
    },
  },
  protocol: { path: 'protocol.json', sha256: sha256(protocolBytes) },
  reviewSchema: { path: 'review-schema.json', sha256: sha256(schemaBytes) },
  rubric: { path: 'rubric.md', sha256: sha256(rubricBytes) },
  evidence: evidenceRecords,
  readiness: {
    readyClasses: evidenceRecords.filter((record) => record.reviewReady).length,
    blockedClasses: queueItems.length,
    missingRequiredViewCount: evidenceRecords.reduce((sum, record) => sum + record.currentWitness.missingViews.length, 0),
    nonExactReferenceClassCount: evidenceRecords.filter((record) => !record.natureReferenceBinding.reviewReady).length,
    reviewerSubmissions: 0,
    developerApproval: false,
  },
};
await writeFile(path.join(OUTPUT_DIRECTORY, 'evidence-manifest.json'), stableJson(manifest));
const manifestBytes = await readFile(path.join(OUTPUT_DIRECTORY, 'evidence-manifest.json'));
const manifestSha256 = sha256(manifestBytes);

const queue = {
  protocolId: PROTOCOL_ID,
  evidenceManifestSha256: manifestSha256,
  status: queueItems.length > 0 ? 'blocked-evidence-preparation' : 'ready-for-independent-review',
  distributionAuthorized: queueItems.length === 0,
  itemCount: queueItems.length,
  items: queueItems,
};
const emptyScores = Object.fromEntries(SCORED_DIMENSIONS.map((dimension) => [dimension, null]));
const responseTemplate = {
  protocolId: PROTOCOL_ID,
  evidenceManifestSha256: manifestSha256,
  reviewer: {
    reviewerId: '',
    fullName: '',
    affiliation: '',
    qualification: '',
    fieldGeologyExpertise: false,
    geomorphologyOrProcessExpertise: false,
    independentWorkAttestation: false,
    noGeneratorAuthorshipConflictAttestation: false,
    exactEvidenceHashAttestation: false,
  },
  startedAt: '',
  completedAt: '',
  classReviews: evidenceRecords.map((record) => ({
    evidenceId: record.evidenceId,
    scores: { ...emptyScores },
    criticalDefects: [],
    referenceCorrespondenceNotes: '',
    geologyReasoning: '',
    disposition: '',
  })),
};
const worksheetRows = [
  ['evidenceId', 'classId', ...SCORED_DIMENSIONS, 'criticalDefects', 'referenceCorrespondenceNotes', 'geologyReasoning', 'disposition'],
  ...evidenceRecords.map((record) => [record.evidenceId, record.classId, ...SCORED_DIMENSIONS.map(() => ''), '', '', '', '']),
];

await Promise.all([
  writeFile(path.join(OUTPUT_DIRECTORY, 'queue.json'), stableJson(queue)),
  writeFile(path.join(PACKET_DIRECTORY, 'response-template.json'), stableJson(responseTemplate)),
  writeFile(path.join(PACKET_DIRECTORY, 'reviewer-worksheet.csv'), `${worksheetRows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`),
  writeFile(path.join(OUTPUT_DIRECTORY, 'developer-approval.json'), stableJson({
    protocolId: PROTOCOL_ID,
    evidenceManifestSha256: manifestSha256,
    adjudicationSha256: null,
    approved: false,
    developerName: null,
    approvedAt: null,
    notes: 'Pending all evidence, independent qualified reviewer quorum, and all-class pass.',
  })),
  writeFile(path.join(PACKET_DIRECTORY, 'README.md'), `# Reviewer packet\n\nDistribution is **not authorized** while \`../queue.json\` contains blockers. Once the verifier reports evidence readiness, each qualified reviewer works independently from the exact paths and hashes in \`../evidence-manifest.json\`, completes all 16 records, and saves a JSON submission under \`../reviewer-submissions/\`. Do not use generated six-view reference sheets as geology evidence.\n`),
  writeFile(path.join(SUBMISSION_DIRECTORY, 'README.md'), '# Independent reviewer submissions\n\nPlace completed JSON submissions here. No submission is bundled or inferred by the preparation tool.\n'),
  writeFile(path.join(OUTPUT_DIRECTORY, 'README.md'), `# C8 geology-naturalness review\n\nThis second-stage protocol is separate from clay class identification. It binds all 16 current v3 witnesses to exact mesh/program/capture hashes and locally retained nature-source hashes, then scores silhouette, fabric, process, support, top/bottom plausibility, forbidden drift, and nature correspondence.\n\nCurrent status: **blocked before reviewer distribution**. The queue records missing current orthographic views and non-exact reference pairings. No reviewer score or approval has been fabricated. Run \`node scripts/verify-rock-geology-v2-geology-naturalness-review.mjs --instrument-only\` to verify the instrument without treating the pending human gate as a tooling failure.\n`),
]);

console.log(stableJson({
  outputDirectory: path.relative(process.cwd(), OUTPUT_DIRECTORY),
  evidenceManifestSha256: manifestSha256,
  classes: evidenceRecords.length,
  readyClasses: manifest.readiness.readyClasses,
  blockedClasses: queueItems.length,
  missingRequiredViewCount: manifest.readiness.missingRequiredViewCount,
  nonExactReferenceClassCount: manifest.readiness.nonExactReferenceClassCount,
  distributionAuthorized: queueItems.length === 0,
  reviewGatePassed: false,
}));
