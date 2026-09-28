#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const outputDirectory = path.resolve(process.argv[2] ?? 'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout');
const morphologyRoot = path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology');
const registerPath = path.join(morphologyRoot, 'canonical-pilot/authoring-register.json');
const referenceRoot = path.join(morphologyRoot, 'reference-final');
const providerConcurrency = 16;
const workerCount = 11;

// Provider meshes are never the geology source of truth. This set identifies
// reference-bound singular silhouettes for which a disposable image-to-3D donor
// is worth testing before hand/procedural authoring. A failed donor routes back
// to ToonLab-only construction; nothing is blocked on provider success.
const PROVIDER_ANCHOR_CANDIDATES = new Set([
  'tor-block-pile', 'tor-castellated', 'tor-freestanding',
  'monolith-massive', 'monolith-jointed', 'fin-sandstone', 'blade-narrow',
  'spire-rock-needle', 'volcanic-spine', 'pinnacle-residual', 'pillar-residual',
  'karst-spire-singular', 'karst-tower-tiered', 'hoodoo-caprock', 'hoodoo-tapered',
  'overhang-supported', 'cave-mouth-karst', 'cave-mouth-volcanic', 'sea-cave',
  'arch-sandstone', 'arch-sea', 'natural-bridge', 'sea-stack', 'sea-stump',
  'mesa-tabular', 'butte-tabular', 'volcanic-neck', 'lava-dome-blocky',
  'lava-dome-flow-banded',
]);

const FORMATION_PARENT_ONLY = new Set([
  'wall-broad', 'cliff-massive', 'cliff-jointed', 'cliff-bedded', 'cliff-foliated',
  'cliff-columnar', 'sea-cliff-massive', 'sea-cliff-bedded', 'canyon-wall',
  'gorge-paired', 'escarpment-continuous', 'fault-scarp', 'slope-bedrock',
  'cliff-module-straight', 'cliff-module-corner', 'cliff-module-termination',
  'badlands-dissected', 'ridge-massive', 'ridge-stratified', 'ridge-folded',
  'ridge-shattered-alpine', 'massif-exfoliation', 'massif-volcanic',
  'karst-tower-field', 'mountain-modular-bedrock', 'field-boulder', 'fan-talus',
  'sheet-scree', 'deposit-rockfall', 'moraine-bouldery', 'bar-river', 'ridge-beach',
]);

const PROVIDER_DISADVANTAGES = Object.freeze([
  'provider topology is not accepted as canonical geology',
  'provider PBR is evidence only and never replaces ToonLab independent bake',
  'donor must survive watertight repair, semantic-template transfer, scale, LOD, collision, and visual gates',
  'formation/chunk continuity is authored by ToonLab even if a local landmark donor is consulted',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function referencePackages() {
  const result = new Map();
  for (const group of ['clasts', 'residuals', 'cliffs', 'forms']) {
    const directory = path.join(referenceRoot, group);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) result.set(entry.name, `${group}/${entry.name}`);
    }
  }
  return result;
}

function classify(subtypeId) {
  if (FORMATION_PARENT_ONLY.has(subtypeId)) return {
    lane: 'toonlab-continuous-formation',
    providerPreflight: 'prohibited-as-parent-volume',
    rationale: 'Requires common-volume topology, deterministic chunks, seamless global structure/material phase, or transported assembly lineage.',
  };
  if (PROVIDER_ANCHOR_CANDIDATES.has(subtypeId)) return {
    lane: 'provider-anchor-candidate',
    providerPreflight: 'one-canonical-primary-only',
    rationale: 'Singular reference-bound silhouette may benefit from a disposable H3.1 donor; ToonLab remains authoritative and can reject the donor.',
  };
  return {
    lane: 'toonlab-template-first',
    providerPreflight: 'not-scheduled',
    rationale: 'Analytic geology, transport grammar, fracture controls, and/or a low-complexity silhouette should be faster and more editable without provider debt.',
  };
}

await mkdir(outputDirectory, { recursive: true });
const rawRegister = await readFile(registerPath, 'utf8');
const register = JSON.parse(rawRegister);
const packages = await referencePackages();
const bySubtype = Map.groupBy(register.slots, (slot) => slot.subtypeId);
const subtypeRecords = [...bySubtype.entries()].map(([subtypeId, slots]) => {
  const classification = classify(subtypeId);
  const primary = slots.find((slot) => slot.reviewRole === 'canonical-primary') ?? slots[0];
  return {
    ...classification,
    canonicalPrimarySlotId: primary.slotId,
    familyId: primary.familyId,
    providerIsRequired: false,
    referencePackage: packages.get(subtypeId) ?? null,
    slotCount: slots.length,
    subtypeId,
  };
}).sort((left, right) => left.subtypeId.localeCompare(right.subtypeId));

const providerPreflightJobs = subtypeRecords.filter((record) => record.lane === 'provider-anchor-candidate').map((record, index) => ({
  attemptLimit: 1,
  fallback: 'toonlab-template-first',
  id: `provider-preflight/${record.subtypeId}`,
  ordinal: index + 1,
  provider: 'tripo-h3.1-default',
  providerAlternates: ['meshy-7-one-audited-comparison-only'],
  referencePackage: record.referencePackage,
  requiredOutput: ['raw-glb', 'provider-provenance.json', 'timing-cost.json', 'six-view-clay-audit'],
  slotId: record.canonicalPrimarySlotId,
  status: record.subtypeId === 'tor-block-pile' ? 'active-in-parallel-sol-max-task' : 'blocked-until-tor-visual-acceptance',
  subtypeId: record.subtypeId,
}));
const providerBatches = chunks(providerPreflightJobs, providerConcurrency).map((jobs, index) => ({
  batchId: `provider-preflight-${String(index + 1).padStart(2, '0')}`,
  concurrency: Math.min(providerConcurrency, jobs.length),
  jobs,
  status: index === 0 ? 'blocked-except-active-tor-pilot' : 'blocked-until-prior-batch-gate',
}));

const productionJobs = register.slots.map((slot, index) => {
  const subtype = subtypeRecords.find((record) => record.subtypeId === slot.subtypeId);
  return {
    assignedWorker: `sol-high-worker-${String(index % workerCount + 1).padStart(2, '0')}`,
    canonicalPrimaryDependency: subtype.canonicalPrimarySlotId,
    lane: subtype.lane,
    providerDonorDependency: subtype.lane === 'provider-anchor-candidate' ? `provider-preflight/${slot.subtypeId}` : null,
    referencePackage: subtype.referencePackage,
    requiredDeliverables: slot.requiredDeliverables,
    reviewRole: slot.reviewRole,
    slotId: slot.slotId,
    status: 'blocked-until-tor-process-acceptance-and-worker-fanout',
    subtypeId: slot.subtypeId,
  };
});
const workerQueues = Array.from({ length: workerCount }, (_, workerIndex) => {
  const workerId = `sol-high-worker-${String(workerIndex + 1).padStart(2, '0')}`;
  const jobs = productionJobs.filter((job) => job.assignedWorker === workerId);
  return { jobCount: jobs.length, jobs: jobs.map((job) => job.slotId), workerId };
});

const triage = {
  schema: 'toonlab/rock-provider-triage',
  version: 1,
  generatedFromRegisterSha256: sha256(rawRegister),
  invariants: {
    disadvantages: PROVIDER_DISADVANTAGES,
    providerIsNeverRequiredByClassification: subtypeRecords.every((record) => record.providerIsRequired === false),
    onePreflightPerCandidateSubtype: true,
    providerPreflightDoesNotAuthorizeProduction: true,
  },
  counts: {
    canonicalSlots: register.slots.length,
    formationParentOnlySubtypes: subtypeRecords.filter((record) => record.lane === 'toonlab-continuous-formation').length,
    providerAnchorCandidateSubtypes: providerPreflightJobs.length,
    subtypeCount: subtypeRecords.length,
    toonlabTemplateFirstSubtypes: subtypeRecords.filter((record) => record.lane === 'toonlab-template-first').length,
  },
  subtypes: subtypeRecords,
};
const rollout = {
  schema: 'toonlab/rock-production-fanout-plan',
  version: 1,
  providerPreflight: {
    batches: providerBatches,
    boundedConcurrency: providerConcurrency,
    jobCount: providerPreflightJobs.length,
    policy: 'prepare at most one canonical-primary donor per candidate subtype; never launch 892 provider jobs',
  },
  productionFanout: {
    jobCount: productionJobs.length,
    jobs: productionJobs,
    policy: 'fan out only after tor-block-pile process and visual acceptance; workers own disjoint slot IDs',
    workerCount,
    workerQueues,
  },
};

const failures = [];
if (subtypeRecords.length !== 100) failures.push({ code: 'SUBTYPE_COUNT', actual: subtypeRecords.length, expected: 100 });
if (register.slots.length !== 892) failures.push({ code: 'SLOT_COUNT', actual: register.slots.length, expected: 892 });
if (subtypeRecords.some((record) => !record.referencePackage)) failures.push({ code: 'REFERENCE_PACKAGE_MISSING', subtypeIds: subtypeRecords.filter((record) => !record.referencePackage).map((record) => record.subtypeId) });
if (new Set(productionJobs.map((job) => job.slotId)).size !== productionJobs.length) failures.push({ code: 'DUPLICATE_SLOT_OWNERSHIP' });
if (providerPreflightJobs.some((job) => !job.slotId || !job.referencePackage)) failures.push({ code: 'PROVIDER_PREFLIGHT_INPUT_MISSING' });
if (Math.max(...workerQueues.map((worker) => worker.jobCount)) - Math.min(...workerQueues.map((worker) => worker.jobCount)) > 1) failures.push({ code: 'WORKER_QUEUE_IMBALANCE', workerQueues });
const verification = {
  failures,
  passed: failures.length === 0,
  providerLaunchAuthorized: false,
  reason: 'Tor-block-pile is still under the separate representative process/visual gate.',
};

await Promise.all([
  writeFile(path.join(outputDirectory, 'provider-triage.json'), `${JSON.stringify(triage, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'rollout-plan.json'), `${JSON.stringify(rollout, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'README.md'), `# C10 provider triage and production fanout\n\n${verification.passed ? '**PASS**' : '**FAIL**'}: ${subtypeRecords.length} reference-bound subtypes and ${productionJobs.length} canonical slots are deterministically classified. ${providerPreflightJobs.length} singular silhouettes are candidates for one H3.1 donor preflight; H3.1 is required for **zero** subtypes. Terrain/formation families remain ToonLab continuous-parent outputs.\n\nProvider preflight uses bounded concurrency ${providerConcurrency}; the 892 production slots are evenly assigned to ${workerCount} future Sol High workers but remain blocked until the representative tor process and visual gate are accepted.\n`),
]);
console.log(JSON.stringify({ counts: triage.counts, outputDirectory, passed: verification.passed, providerBatches: providerBatches.length, workerQueues: workerQueues.map((entry) => entry.jobCount) }, null, 2));
if (!verification.passed) process.exitCode = 1;
