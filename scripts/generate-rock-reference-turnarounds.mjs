#!/usr/bin/env node

/*
 * Repository-only C8 reference factory.  Generated sheets are reconstruction
 * hypotheses: they never promote, replace, or count as geology evidence.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import '../database/env.mjs';
import { runProvider } from '../database/providers.mjs';
import { createMorphologyInspirationRegister } from '../src/rockgen/experimental/geology-v2/canonical/inspirationRegister.node.js';

const ROOT = path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-factory');
const TAXONOMY_PATH = path.resolve('src/rockgen/experimental/geology-v2/morphology-taxonomy.v1.json');
const QUEUE_PATH = path.join(ROOT, 'queue.json');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const REPORT_PATH = path.join(ROOT, 'verification.json');
const SHEETS_DIRECTORY = path.join(ROOT, 'sheets');
const PILOT_SUBTYPE_IDS = Object.freeze(['tor-block-pile', 'arch-sandstone', 'cliff-module-straight']);
const VIEW_ORDER = Object.freeze(['front', 'rear', 'left', 'right', 'top', 'bottom']);
const MODEL = 'gemini-3-pro-image';
const RESOLUTION = '2k';
const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 2;

const SCALE_ENVELOPES_METRES = Object.freeze({
  clast: [0.064, 0.256],
  prop: [0.256, 4],
  outcrop: [4, 24],
  module: [6, 48],
  formation: [24, 400],
});

const args = new Set(process.argv.slice(2));
if ([...args].some((argument) => !['--prepare', '--pilot', '--retry-failed', '--verify', '--help'].includes(argument))) {
  throw new Error('Usage: node scripts/generate-rock-reference-turnarounds.mjs [--prepare] [--pilot] [--retry-failed] [--verify]');
}
if (args.has('--help')) {
  console.log('Creates the 100-subtype / 892-slot reference queue. --pilot runs only the three approved pilot sheets; --retry-failed explicitly requeues failed pilot jobs.');
  process.exit(0);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return sha256(JSON.stringify(canonicalJson(value)));
}

function compactError(error) {
  const message = String(error?.message ?? error ?? 'Unknown failure').replaceAll(/(?:AIza|sk-|Bearer\s+)[A-Za-z0-9._-]+/g, '[redacted]');
  return message.slice(0, 500);
}

function primaryNatureReference(entry) {
  return entry.approvedReferences[0] ?? null;
}

function scaleEnvelope(subtype) {
  const envelopes = subtype.scales.map((scale) => SCALE_ENVELOPES_METRES[scale]).filter(Boolean);
  return [Math.min(...envelopes.map(([minimum]) => minimum)), Math.max(...envelopes.map(([, maximum]) => maximum))];
}

function hypothesisPrompt(subtype, evidence) {
  const nature = primaryNatureReference(evidence);
  if (!nature) return null;
  return [
    'Use case: reconstruction hypothesis only, not geological evidence.',
    `Asset: ToonLab ${subtype.label} (${subtype.id}).`,
    `Exact nature shape-study reference: ${nature.label} (${nature.pageUrl}).`,
    `Create one six-panel orthographic-like clay turnaround on a neutral light-gray background in this exact reading order: ${VIEW_ORDER.join(', ')}.`,
    'The same single rock mass must be shown consistently in all six views; no labels, scenery, vegetation, people, props, ground plane, text, or color/material study.',
    `Required silhouette: ${subtype.requiredSilhouette.join('; ')}.`,
    `Required structure: ${subtype.requiredStructure.join('; ')}.`,
    `Do not produce: ${subtype.forbiddenDrift.join('; ')}.`,
    'Preserve gravity support, coherent contacts, and non-periodic natural fracture or bedding logic. Generated imagery is an art-directed reconstruction hypothesis and cannot be used as geology proof.',
  ].join(' ');
}

function makeSheetJob(subtype, evidence) {
  const nature = primaryNatureReference(evidence);
  const isPilot = PILOT_SUBTYPE_IDS.includes(subtype.id);
  const prompt = hypothesisPrompt(subtype, evidence);
  const plannedStatus = nature
    ? (isPilot ? 'queued-pilot' : 'awaiting-human-provider-authorization')
    : 'blocked-missing-exact-nature-reference';
  const [minimumMetres, maximumMetres] = scaleEnvelope(subtype);
  const promptPayload = prompt && {
    model: MODEL,
    prompt,
    resolution: RESOLUTION,
    viewOrder: VIEW_ORDER,
  };
  return {
    artifactKind: 'six-view-turnaround-hypothesis',
    artDirectionReferences: evidence.artDirectionReferences,
    contentHash: hashJson({ subtype, evidence, viewOrder: VIEW_ORDER, model: MODEL, resolution: RESOLUTION }),
    generatedViewsAreGeologyEvidence: false,
    geologyAuthorityReferences: evidence.authorityReferences,
    hypothesisOnly: true,
    id: `sheet/${subtype.id}`,
    lengthUnit: 'metre',
    model: MODEL,
    natureReferences: evidence.approvedReferences,
    output: null,
    plannedDimensionsMetres: { maximum: maximumMetres, minimum: minimumMetres },
    prompt,
    promptHash: promptPayload ? hashJson(promptPayload) : null,
    resolution: RESOLUTION,
    retries: 0,
    failureReason: null,
    status: plannedStatus,
    subtypeId: subtype.id,
    viewOrder: VIEW_ORDER,
  };
}

function makeSlotJob(subtype, slot) {
  return {
    artifactKind: 'canonical-slot-plan',
    contentHash: hashJson({ subtypeId: subtype.id, slot, taxonomyVersion: 1 }),
    dependsOn: `sheet/${subtype.id}`,
    failureReason: null,
    generatedViewsAreGeologyEvidence: false,
    id: `slot/${subtype.id}/${String(slot).padStart(3, '0')}`,
    lengthUnit: 'metre',
    slot,
    status: 'planned-after-reference-audit',
    subtypeId: subtype.id,
  };
}

function makeQueue(taxonomy, register) {
  const evidenceBySubtypeId = new Map(register.entries.map((entry) => [entry.subtypeId, entry]));
  const sheets = taxonomy.subtypes.map((subtype) => makeSheetJob(subtype, evidenceBySubtypeId.get(subtype.id)));
  const slots = taxonomy.subtypes.flatMap((subtype) =>
    Array.from({ length: subtype.minimumCanonicalBaselines }, (_, index) => makeSlotJob(subtype, index + 1)),
  );
  return {
    boundedConcurrency: MAX_CONCURRENCY,
    createdFor: 'C8 morphology reference generation',
    generatedViewsAreGeologyEvidence: false,
    hypothesisPolicy: 'Generated six-view sheets are art-directed reconstruction hypotheses; exact nature references and geology authorities remain independent evidence.',
    jobs: [...sheets, ...slots],
    lengthUnit: 'metre',
    plannedCanonicalSlots: slots.length,
    plannedSubtypeSheets: sheets.length,
    schema: 'toonlab/rock-reference-factory-queue',
    version: 1,
  };
}

async function readExistingQueue() {
  try {
    return JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function mergeQueue(freshQueue, existingQueue) {
  if (!existingQueue || existingQueue.schema !== freshQueue.schema || existingQueue.version !== freshQueue.version) return freshQueue;
  const oldById = new Map(existingQueue.jobs.map((job) => [job.id, job]));
  freshQueue.jobs = freshQueue.jobs.map((job) => {
    const old = oldById.get(job.id);
    // A changed content hash invalidates a completed provider result.
    return old && old.contentHash === job.contentHash && old.promptHash === job.promptHash
      ? { ...job, ...pickRuntimeState(old) }
      : job;
  });
  return freshQueue;
}

function pickRuntimeState(job) {
  const keys = ['failureReason', 'output', 'retries', 'status', 'updatedAt'];
  return Object.fromEntries(keys.filter((key) => key in job).map((key) => [key, job[key]]));
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function manifestFromQueue(queue) {
  const sheets = queue.jobs.filter((job) => job.artifactKind === 'six-view-turnaround-hypothesis');
  const slots = queue.jobs.filter((job) => job.artifactKind === 'canonical-slot-plan');
  return {
    boundedConcurrency: MAX_CONCURRENCY,
    counts: {
      blockedSheets: sheets.filter((job) => job.status === 'blocked-missing-exact-nature-reference').length,
      canonicalSlots: slots.length,
      completedPilotSheets: sheets.filter((job) => job.status === 'completed').length,
      subtypeSheets: sheets.length,
    },
    generatedViewsAreGeologyEvidence: false,
    lengthUnit: 'metre',
    provider: { id: 'gemini', model: MODEL, resolution: RESOLUTION },
    schema: 'toonlab/rock-reference-factory-manifest',
    status: 'pilot-only; remaining provider calls require audit authorization',
    version: 1,
    viewOrder: VIEW_ORDER,
  };
}

async function persist(queue) {
  await atomicJson(QUEUE_PATH, queue);
  await atomicJson(MANIFEST_PATH, manifestFromQueue(queue));
}

async function runPilot(queue) {
  await mkdir(SHEETS_DIRECTORY, { recursive: true });
  const byId = new Map(queue.jobs.map((job) => [job.id, job]));
  const pilotJobs = PILOT_SUBTYPE_IDS.map((id) => byId.get(`sheet/${id}`));
  for (const job of pilotJobs) {
    if (!job) throw new Error(`Pilot job is missing: ${job?.subtypeId ?? 'unknown'}`);
    if (job.status === 'completed') continue;
    if (job.status === 'failed') {
      if (!args.has('--retry-failed')) throw new Error(`${job.id} previously failed; rerun only with --retry-failed after reviewing its recorded failure reason.`);
      job.status = 'queued-pilot';
      job.retries = 0;
      job.updatedAt = new Date().toISOString();
      await persist(queue);
    }
    if (!job.prompt || job.status === 'blocked-missing-exact-nature-reference') throw new Error(`${job.id} is not authorized by an exact nature reference.`);
    let lastFailure = null;
    for (let attempt = job.retries; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const result = await runProvider('gemini', {
          aspectRatio: '1:1',
          kind: 'concept_image',
          model: MODEL,
          prompt: job.prompt,
          resolution: RESOLUTION,
        });
        const extension = result.contentType === 'image/jpeg' ? 'jpg' : 'png';
        const outputName = `${job.subtypeId}-nano-banana-pro-six-view.${extension}`;
        const outputPath = path.join(SHEETS_DIRECTORY, outputName);
        await writeFile(outputPath, result.bytes);
        job.output = {
          byteHash: sha256(result.bytes),
          contentType: result.contentType,
          file: path.relative(ROOT, outputPath),
          generatedAt: new Date().toISOString(),
          sizeBytes: result.bytes.byteLength,
        };
        job.retries = attempt;
        job.status = 'completed';
        job.failureReason = null;
        job.updatedAt = new Date().toISOString();
        await persist(queue);
        lastFailure = null;
        break;
      } catch (error) {
        lastFailure = compactError(error);
        job.retries = attempt + 1;
        job.failureReason = lastFailure;
        job.status = attempt >= MAX_RETRIES ? 'failed' : 'queued-pilot';
        job.updatedAt = new Date().toISOString();
        await persist(queue);
      }
    }
    if (lastFailure) throw new Error(`${job.id} failed after ${job.retries} attempts: ${lastFailure}`);
  }
}

async function verify(queue) {
  const failures = [];
  const sheets = queue.jobs.filter((job) => job.artifactKind === 'six-view-turnaround-hypothesis');
  const slots = queue.jobs.filter((job) => job.artifactKind === 'canonical-slot-plan');
  if (sheets.length !== 100) failures.push(`Expected 100 subtype sheets; found ${sheets.length}.`);
  if (slots.length !== 892) failures.push(`Expected 892 canonical slots; found ${slots.length}.`);
  if (new Set(queue.jobs.map((job) => job.id)).size !== queue.jobs.length) failures.push('Queue has duplicate job IDs.');
  if (queue.boundedConcurrency > 2) failures.push('Provider concurrency is above the allowed maximum of two.');
  for (const sheet of sheets) {
    if (sheet.lengthUnit !== 'metre') failures.push(`${sheet.id} does not use metre units.`);
    if (JSON.stringify(sheet.viewOrder) !== JSON.stringify(VIEW_ORDER)) failures.push(`${sheet.id} has an invalid view order.`);
    if (sheet.generatedViewsAreGeologyEvidence !== false || sheet.hypothesisOnly !== true) failures.push(`${sheet.id} permits generated imagery as evidence.`);
    if (!Array.isArray(sheet.natureReferences) || !Array.isArray(sheet.geologyAuthorityReferences) || !Array.isArray(sheet.artDirectionReferences)) {
      failures.push(`${sheet.id} does not keep source categories separate.`);
    }
    if (sheet.status === 'completed') {
      if (!sheet.output?.file || !sheet.output?.byteHash) failures.push(`${sheet.id} is completed without output provenance.`);
      else {
        const target = path.join(ROOT, sheet.output.file);
        try {
          const bytes = await readFile(target);
          if (sha256(bytes) !== sheet.output.byteHash) failures.push(`${sheet.id} output hash does not match.`);
          if ((await stat(target)).size === 0) failures.push(`${sheet.id} output is empty.`);
        } catch {
          failures.push(`${sheet.id} output is missing.`);
        }
      }
    }
  }
  const result = {
    checkedAt: new Date().toISOString(),
    failures,
    passed: failures.length === 0,
    pilot: Object.fromEntries(PILOT_SUBTYPE_IDS.map((id) => [id, sheets.find((job) => job.subtypeId === id)?.status ?? 'missing'])),
    queue: { canonicalSlots: slots.length, subtypeSheets: sheets.length, totalJobs: queue.jobs.length },
    schema: 'toonlab/rock-reference-factory-verification',
    version: 1,
  };
  await atomicJson(REPORT_PATH, result);
  return result;
}

const taxonomy = JSON.parse(await readFile(TAXONOMY_PATH, 'utf8'));
const register = createMorphologyInspirationRegister();
const queue = mergeQueue(makeQueue(taxonomy, register), await readExistingQueue());
await persist(queue);

if (args.has('--pilot')) await runPilot(queue);
const verification = await verify(queue);
console.log(JSON.stringify(verification, null, 2));
if (!verification.passed) process.exitCode = 1;
