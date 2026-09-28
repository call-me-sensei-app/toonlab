#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKLIST = 'docs/rock-geology-v2-production-checklist.md';
const PROVIDER_BRIDGE = 'docs/rock-geology-v2-provider-template-bridge.md';
const OUTPUT_DIR = 'artifacts/research/rock-geology-v2/checkpoint-14-public-release/final-checklist-audit';
const C14_COMMAND_EVIDENCE = `${OUTPUT_DIR}/c14-command-evidence.json`;
const STATUS_VALUES = new Set(['passed', 'partial', 'blocked', 'missing']);
const EXPECTED_REQUIREMENTS = 399;
const EXPECTED_CHECKPOINT_REQUIREMENTS = 158;
const C10_SHARD_RECORDS = Array.from(
  { length: 11 },
  (_, index) => `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/shards/sol-high-worker-${String(index + 1).padStart(2, '0')}.json`,
);
const C8_CLAY_REVIEW_RECORDS = [
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/verification.json',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/confusion-matrix.json',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/README.md',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/adjudicator-only/answer-key.json',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/reviewer-packet/manifest.json',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/reviewer-packet/response-template.json',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/reviewer-packet/reviewer-worksheet.csv',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/reviewer-packet/review.html',
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/reviewer-packet/blind-contact-sheet.png',
];
const C10_SOURCE_ADMISSION_SUBTYPES = [
  'arch-sandstone',
  'cliff-module-straight',
  'hoodoo-caprock',
  'mountain-modular-bedrock',
  'pillar-residual',
  'tor-block-pile',
];
const C10_SOURCE_ADMISSION_RECORDS = [
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/verification.json',
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/index.json',
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/README.md',
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/source-admission-report.md',
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/schemas/human-visual-decision.schema.json',
  'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/schemas/source-admission-packet.schema.json',
  ...C10_SOURCE_ADMISSION_SUBTYPES.flatMap((subtype) => [
    `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/packets/${subtype}/packet.json`,
    `artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/packets/${subtype}/decision-template.json`,
  ]),
];
const C11_C12_STYLE_CONTRACT_RECORDS = [
  'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/styled-material-contract/contract.json',
  'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/styled-material-contract/verification.json',
  'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/styled-material-contract/README.md',
];

const checkpointRecords = {
  0: [
    'artifacts/research/rock-geology-v2/checkpoint-00-specification/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-00-specification/approval.md',
  ],
  1: [
    'artifacts/research/rock-geology-v2/checkpoint-01-research-ontology/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-01-research-ontology/ontology-verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-01-research-ontology/approval.md',
  ],
  2: [
    'artifacts/research/rock-geology-v2/checkpoint-02-recipe-compiler-contract/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-02-recipe-compiler-contract/approval.md',
  ],
  3: [
    'artifacts/research/rock-geology-v2/checkpoint-03-topology-mesher/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-03-topology-mesher/approval.md',
  ],
  4: [
    'artifacts/research/rock-geology-v2/checkpoint-04-structural-fields/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-04-structural-fields/approval.md',
  ],
  5: [
    'artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-05-finite-fractures-blocks/approval.md',
  ],
  6: [
    'artifacts/research/rock-geology-v2/checkpoint-06-processes/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-06-processes/approval.md',
  ],
  7: [
    'artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-07-bake-compiler/approval.md',
  ],
  8: [
    'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/verification-report.json',
    'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/morphology-verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-factory/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/blender-concurrency/verification.json',
    ...C8_CLAY_REVIEW_RECORDS,
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/review/hoodoo-v31-final-visual-audit.json',
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/review/approval.md',
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/technical-verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/approval.md',
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/known-issues.md',
    PROVIDER_BRIDGE,
  ],
  9: [
    'artifacts/research/rock-geology-v2/checkpoint-09-formations/checkpoint-status.json',
    'artifacts/research/rock-geology-v2/checkpoint-09-formations/verification.json',
  ],
  10: [
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/rollout-plan.json',
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/provider-triage.json',
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/manifest.json',
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/registry-defects.json',
    'artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/README.md',
    ...C10_SHARD_RECORDS,
    ...C10_SOURCE_ADMISSION_RECORDS,
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/review-r04/technical-verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/tor-block-pile/approval.md',
  ],
  11: [
    'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/checkpoint-status.json',
    'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/semantic-regions/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/visible-webgpu/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/approval.md',
    ...C11_C12_STYLE_CONTRACT_RECORDS,
  ],
  12: [
    'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/import-contract.json',
    'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/unreal/report.json',
    'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/unreal/rejected-attempt-01-default-material/report.json',
    'artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/unreal/rejected-attempt-02-compiled-graph-visual-failure/report.json',
    ...C11_C12_STYLE_CONTRACT_RECORDS,
  ],
  13: [
    'artifacts/research/rock-geology-v2/checkpoint-13-regression/hoodoo-caprock/checkpoint-status.json',
    'artifacts/research/rock-geology-v2/checkpoint-13-regression/hoodoo-caprock/verification.json',
    'artifacts/research/rock-geology-v2/checkpoint-13-regression/hoodoo-caprock/approval.md',
    'artifacts/research/rock-geology-v2/checkpoint-13-regression/hoodoo-caprock/known-issues.md',
    'scripts/verify-rockgen-lods.mjs',
  ],
  14: [
    'artifacts/research/rock-geology-v2/checkpoint-14-public-release/hoodoo-caprock/automated-results.json',
    'artifacts/research/rock-geology-v2/checkpoint-14-public-release/hoodoo-caprock/approval.md',
    'artifacts/research/rock-geology-v2/checkpoint-14-public-release/hoodoo-caprock/known-issues.md',
    C14_COMMAND_EVIDENCE,
  ],
};

function absolute(path) {
  return resolve(ROOT, path);
}

function read(path) {
  return readFileSync(absolute(path), 'utf8');
}

function json(path) {
  return JSON.parse(read(path));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(absolute(path))).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function git(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function parseChecklist(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = [];
  const requirements = [];
  let currentCheckpoint = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      headings.length = level - 1;
      headings[level - 1] = heading[2].trim();
      if (level === 2) currentCheckpoint = null;
      const checkpointMatch = /^Checkpoint\s+(\d+)\b/i.exec(heading[2]);
      if (checkpointMatch) currentCheckpoint = Number(checkpointMatch[1]);
      continue;
    }

    const checkbox = /^- \[([ xX])\]\s+(.+)$/.exec(line);
    if (!checkbox) continue;

    const textParts = [checkbox[2].trim()];
    let continuation = index + 1;
    while (continuation < lines.length) {
      const next = lines[continuation];
      if (!/^\s{2,}\S/.test(next) || /^\s*- \[/.test(next) || /^\s*#/.test(next)) break;
      textParts.push(next.trim());
      continuation += 1;
    }

    const lineNumber = index + 1;
    requirements.push({
      id: currentCheckpoint === null ? `GLOBAL-L${lineNumber}` : `C${currentCheckpoint}-L${lineNumber}`,
      checkpoint: currentCheckpoint,
      line: lineNumber,
      section: headings.filter(Boolean).join(' > '),
      sourceChecked: checkbox[1].toLowerCase() === 'x',
      text: textParts.join(' '),
    });
  }
  return requirements;
}

const checklistText = read(CHECKLIST);
const requirements = parseChecklist(checklistText);
const records = Object.fromEntries(
  Object.entries(checkpointRecords).map(([checkpoint, paths]) => [
    checkpoint,
    paths.map((path) => ({
      path,
      exists: existsSync(absolute(path)),
      bytes: existsSync(absolute(path)) ? statSync(absolute(path)).size : null,
      sha256: existsSync(absolute(path)) ? sha256(path) : null,
    })),
  ]),
);

const c0 = json(checkpointRecords[0][0]);
const c1 = json(checkpointRecords[1][0]);
const c2 = json(checkpointRecords[2][0]);
const c3 = json(checkpointRecords[3][0]);
const c4 = json(checkpointRecords[4][0]);
const c5 = json(checkpointRecords[5][0]);
const c6 = json(checkpointRecords[6][0]);
const c7 = json(checkpointRecords[7][0]);
const c8 = json(checkpointRecords[8][0]);
const c8Morphology = json(checkpointRecords[8][1]);
const c8References = json(checkpointRecords[8][2]);
const c8ClayReview = json('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/verification.json');
const c8ClayMatrix = json('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/clay-identification-review/confusion-matrix.json');
const c9Status = json(checkpointRecords[9][0]);
const c9 = json(checkpointRecords[9][1]);
const c10 = json(checkpointRecords[10][0]);
const c10ShardPlanning = json('artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/verification.json');
const c10ShardManifest = json('artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/production-shards/manifest.json');
const c10SourceAdmission = json('artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/verification.json');
const c10SourceAdmissionIndex = json('artifacts/research/rock-geology-v2/checkpoint-10-family-rollout/source-admission/index.json');
const c11Status = json(checkpointRecords[11][0]);
const c11 = json(checkpointRecords[11][1]);
const c12 = json(checkpointRecords[12][1]);
const c12StyleContract = json('artifacts/research/rock-geology-v2/checkpoint-12-unreal-engine-5-8/hoodoo-caprock/styled-material-contract/verification.json');
const c13Status = json(checkpointRecords[13][0]);
const c13 = json(checkpointRecords[13][1]);
const c14 = json(checkpointRecords[14][0]);
const c14CommandEvidence = json(C14_COMMAND_EVIDENCE);

const approvedFoundations = [
  c0.ok === true && c0.gate?.developerApprovalReceived === true,
  c1.allTechnicalGatesPassed === true && c1.developerApproval === true,
  c2.passed === true && c2.status === 'approved',
  Object.values(c3.gates ?? {}).every(Boolean),
  c4.passed === true,
  c5.passed === true,
  c6.passed === true,
  c7.passed === true,
];

const checkpointState = {
  0: { status: 'passed', reason: 'The execution contract and rejected-v1 boundary have developer authorization.' },
  1: { status: 'passed', reason: 'Research, provenance, ontology, compatibility, and scale-contract gates are approved.' },
  2: { status: 'passed', reason: 'Recipe, schema, determinism, cache, migration, manifest, and CLI contract is approved.' },
  3: { status: 'passed', reason: 'The topology-safe mesher bake-off is approved with Manifold Dual Contouring frozen.' },
  4: { status: 'passed', reason: 'Structural fields, chronology, chunk coordinates, and compatibility behavior are approved.' },
  5: { status: 'passed', reason: 'Finite fractures, blocks, inheritance, statistics, and topology gates are approved.' },
  6: { status: 'passed', reason: 'Process, stability, transport lineage, causal fixtures, and catalog compiler coverage are approved.' },
  7: { status: 'passed', reason: 'The representative high-to-low compiler methodology is approved for C8 input.' },
  8: { status: 'partial', reason: 'Basis-family populations, one hoodoo process candidate, and a current-v3 source-bound 651-check clay-review instrument exist; current technical seed gates and the actual review/generalization gates remain open.' },
  9: { status: 'blocked', reason: 'Formation substrate passes, but C9 is explicitly parked until finished C8 modules are integrated and visual/UE gates pass.' },
  10: { status: 'blocked', reason: 'Shard planning passes 2,150 checks and six admission packets pass 39 integrity checks, but decisions/promotions remain zero, 94 sources are missing, and dispatch is false.' },
  11: { status: 'partial', reason: 'The hoodoo reversible-stylization slice and C11→C12 contract preparation pass; developer art approval, UE execution, and full-catalog evidence are open.' },
  12: { status: 'blocked', reason: `The current UE report is ${c12.status}; the styled handoff passes 31 contract checks only, while material execution, parity captures, and full C12 approval are false.` },
  13: { status: 'partial', reason: 'The hoodoo adversarial slice and repaired public-fixture LOD verifier pass, but the full family/platform/formation matrix is absent.' },
  14: { status: 'partial', reason: 'The hoodoo packaging slice passes, but the full public release gate and developer release approval are open.' },
};

function c8Classification(item) {
  const text = item.text.toLowerCase();
  if (text.includes('exact source-bound six-view references')) {
    return ['passed', 'The 100 subtype reference packages have a passing reference/morphology audit.'];
  }
  if (text.includes('one provider-assisted hoodoo process candidate')) {
    return ['passed', 'The exact hoodoo provider/template process candidate passes its recorded technical gates.'];
  }
  if (text.includes('developer accepts')) {
    return ['blocked', 'The normative C8 developer visual-baseline checkbox remains open.'];
  }
  if (text.includes('representative multi-family calibration')) {
    return ['blocked', 'No completed representative provider-versus-ToonLab calibration pack exists across the basis mechanisms.'];
  }
  if (text.includes('32 draft') || text.includes('8 production') || text.includes('4 hero')) {
    return ['partial', 'The technical 44-seed population exists for eight basis families, but completed final-bake/visual qualification is not recorded.'];
  }
  if (text.includes('geology review can identify')) {
    return [
      'blocked',
      `The blinded instrument passes ${c8ClayReview.checks} checks, but the actual gate is false with ${c8ClayReview.reviewerCoverage.validCompleteReviewers}/${c8ClayReview.reviewerCoverage.requiredCompleteReviewers} complete reviewers and ${c8ClayReview.reviewerCoverage.qualifiedReviewers}/${c8ClayReview.reviewerCoverage.requiredQualifiedReviewers} geology-qualified reviewers; score fields remain null.`,
    ];
  }
  if (text.includes('every current v1 defect')) {
    const remaining = c8.defects?.filter((entry) => entry.status !== 'resolved').length ?? 0;
    return ['partial', `${remaining} v1 defect dispositions remain assigned to later checkpoints.`];
  }
  if (text.includes('neutral realistic a/b')) {
    return ['blocked', 'The full neutral-realistic basis-family A/B board has not received developer approval.'];
  }
  return ['partial', 'A technical basis mesh exists, but the exact basis family lacks completed neutral bake, comparison, and approval evidence.'];
}

function c14Classification(item) {
  const text = item.text.toLowerCase();
  const command = (name) => c14CommandEvidence.commands?.find((entry) => entry.command === name)
    ?? c14.commands?.find((entry) => entry.command === name);
  if (text.includes('package contains no generated research artifacts')) {
    const passed = c14.package?.mediaFiles === 0 && c14.package?.researchArtifactFiles === 0;
    return passed
      ? ['passed', 'The representative npm tarball records zero media and zero research-artifact files.']
      : ['blocked', 'The package-boundary record does not prove a zero-media, zero-research tarball.'];
  }
  if (text === '`npm run verify:skills`') {
    return command('npm run verify:skills')?.passed
      ? ['passed', 'The exact command is recorded passing.']
      : ['missing', 'No passing exact-command record exists.'];
  }
  if (text === '`npm run verify:docs`') {
    return command('npm run verify:docs')?.passed
      ? ['passed', 'The exact command is recorded passing.']
      : ['missing', 'No passing exact-command record exists.'];
  }
  if (text === '`npm run verify:package`') {
    return command('npm run verify:package')?.passed
      ? ['passed', 'The exact command is recorded passing.']
      : ['missing', 'No passing exact-command record exists.'];
  }
  if (text === '`npm run verify:rockgen`') {
    return command('npm run verify:rockgen')?.passed
      ? ['passed', 'The exact verify:rockgen command is recorded passing with exit code 0 and hash-bound output.']
      : ['missing', 'No passing exact-command record exists.'];
  }
  if (text === '`npm run verify:release`') {
    const release = command('npm run verify:release');
    return release?.status === 'external-execution-blocked'
      ? ['blocked', 'The exact release command reached rock-regions-package, then was interrupted after its empty-cache npm install stalled under restricted network. No weaker substitute was accepted.']
      : ['missing', 'No passing exact-command record exists.'];
  }
  if (text === '`npm pack --dry-run`') {
    const dryRun = c14CommandEvidence.commands?.find((entry) => entry.command.startsWith('npm pack --dry-run'));
    return dryRun?.passed
      ? ['passed', `The exact dry-run execution passed with ${dryRun.package.entryCount} entries and shasum ${dryRun.package.shasum}.`]
      : ['missing', 'No passing exact dry-run command record exists.'];
  }
  if (text.includes('install tarball into a clean consumer')) {
    return ['partial', 'A genuine hoodoo-only clean consumer passes WebGL2/WebGPU; this is not a full-family public-package smoke.'];
  }
  if (text.includes('final family, ue, toonlab')) {
    return ['blocked', 'Family, UE, performance, and final approval reports are not all green.'];
  }
  return ['partial', 'The hoodoo packaging slice supplies representative evidence only; the full product-scoped C14 requirement remains open.'];
}

function crossCuttingClassification(item) {
  const line = item.line;
  if (item.sourceChecked) return ['passed', 'The normative checklist marks this contract/gate complete and its owning approved checkpoint record is present.'];
  if (line === 39) return ['blocked', 'Production-ready language remains forbidden until full C8–C14 qualification and developer release approval.'];
  if (line >= 87 && line <= 137) return ['partial', 'Earlier checkpoints contain this evidence discipline, but incomplete later checkpoints do not yet satisfy it globally.'];
  if (line >= 196 && line <= 221) return ['passed', 'C1/C2 approve the physical-dimension, static-export, warning, and host-orchestration contract.'];
  if (line >= 222 && line <= 226) return ['partial', 'Representative scale records exist, but formation and all-family scale matrices remain open.'];
  if (line >= 231 && line <= 264) return ['passed', 'These stop-work and allowed-shortcut policies are part of the developer-authorized C0 execution contract.'];
  if (line >= 269 && line <= 278) return ['partial', 'No cited checkpoint intentionally authorizes the forbidden shortcut, but full-repository absence is not proven by this audit.'];
  if (line >= 315 && line <= 322) return ['blocked', 'C9 has substrate-only evidence and is parked pending real C8 modules and formation approval.'];
  if (line >= 339 && line <= 346) return ['passed', 'C2 directly verifies the schema, deterministic namespaces, strict validation, migration, and manifest contract.'];
  if (line >= 387 && line <= 408) return ['partial', 'Representative runtime/package work exists, but the UE, all-family, resize, and fallback contract is not fully qualified.'];
  if (line >= 414 && line <= 430) return ['partial', 'C4–C8 demonstrate representative mechanisms; final family-wide clay/visual validity remains open.'];
  if (line >= 431 && line <= 432) return ['blocked', 'Formation-scale visual continuity is an open C9 gate.'];
  if (line >= 437 && line <= 445) return ['blocked', 'Full UE, browser, mobile-device, formation, and family performance budgets are not recorded.'];
  if (line >= 458 && line <= 565) return ['blocked', 'The explicit geology/fabric/process/landform catalog is owned by the incomplete C10 rollout.'];
  if (line >= 573 && line <= 590) return ['passed', 'C1 compatibility fixtures plus C4–C6 causal programs directly cover the declared accept/reject relationships.'];
  if (line >= 601 && line <= 643) return ['blocked', 'The complete per-recipe, family, renderer, platform, and aggregation population belongs to incomplete C8/C10/C13 work.'];
  return ['missing', 'No current qualifying completion record was found for this cross-cutting requirement.'];
}

function c10Classification(item) {
  const text = item.text.toLowerCase();
  if (text.includes('produce one family index with status')) {
    return [
      'partial',
      'The deterministic 11-shard plan covers all 100 subtypes and 892 slots exactly once, but it is an ownership/preflight index only; no asset generation or dispatch is authorized.',
    ];
  }
  return [
    'blocked',
    `C10 planning passes ${c10ShardPlanning.checkCount} checks and admission integrity passes ${c10SourceAdmission.counts.checks}/${c10SourceAdmission.counts.checks}; however approved decisions/promotions are ${c10SourceAdmission.counts.approvedAndPromotable}, ${c10SourceAdmission.counts.productionMissingCanonicalSources} sources remain missing, dispatch is false, and outputs are unqualified.`,
  ];
}

function classify(item) {
  if (item.checkpoint === null) return crossCuttingClassification(item);
  if (item.checkpoint <= 7) {
    return ['passed', `Checkpoint ${item.checkpoint} is technically passed and explicitly developer-approved.`];
  }
  if (item.checkpoint === 8) return c8Classification(item);
  if (item.checkpoint === 9) {
    return item.sourceChecked
      ? ['partial', 'The checked implementation item is substrate evidence only; the checklist explicitly says it cannot satisfy C9.']
      : ['blocked', 'C9 is parked behind the C8 integration dependency and its visual/UE gates are false.'];
  }
  if (item.checkpoint === 10) return c10Classification(item);
  if (item.checkpoint === 11) return ['partial', 'The hoodoo representative slice passes technically, but developer art review and full-catalog evidence are open.'];
  if (item.checkpoint === 12) {
    return item.line < 1000
      ? ['partial', `A hoodoo UE import attempt and a 31-check styled-material handoff exist, but the current report is ${c12.status}; contract preparation is not UE material execution or parity.`]
      : ['blocked', 'The current UE report and styled-contract verification both refuse full parity/approval, so no C12 gate may pass.'];
  }
  if (item.checkpoint === 13) {
    return item.line < 1032
      ? ['partial', 'The 187-check hoodoo slice covers a subset; full family/platform/formation regression is absent.']
      : ['blocked', 'The full-family, measured-platform C13 gate cannot pass on representative hoodoo evidence.'];
  }
  if (item.checkpoint === 14) return c14Classification(item);
  return ['missing', 'No classification rule exists.'];
}

function crossCuttingEvidenceCheckpoints(line) {
  if (line <= 83) return [0, 14];
  if (line <= 137) return [0, 8, 9, 11, 13, 14];
  if (line <= 226) return [1, 2, 13];
  if (line <= 278) return [0, 13, 14];
  if (line <= 322) return [9];
  if (line <= 346) return [2];
  if (line <= 361) return [3, 7, 13];
  if (line <= 383) return [7];
  if (line <= 408) return [11, 12, 13, 14];
  if (line <= 432) return [4, 5, 6, 8, 9, 10];
  if (line <= 445) return [12, 13];
  if (line <= 565) return [8, 10];
  if (line <= 590) return [1, 4, 5, 6];
  if (line <= 643) return [8, 9, 10, 13];
  return [0];
}

function evidenceFor(item) {
  const checkpoints = item.checkpoint === null ? crossCuttingEvidenceCheckpoints(item.line) : [item.checkpoint];
  const paths = [...new Set(checkpoints.flatMap((checkpoint) => checkpointRecords[checkpoint] ?? []))];
  return [
    { path: CHECKLIST, line: item.line, pointer: null, sha256: sha256(CHECKLIST) },
    ...paths.map((path) => ({
      path,
      line: null,
      pointer: null,
      sha256: existsSync(absolute(path)) ? sha256(path) : null,
    })),
  ];
}

const mappedRequirements = requirements.map((item) => {
  const [status, reason] = classify(item);
  return { ...item, status, reason, evidence: evidenceFor(item) };
});

const statusCounts = Object.fromEntries(
  [...STATUS_VALUES].map((status) => [status, mappedRequirements.filter((item) => item.status === status).length]),
);
const checkpointStatusCounts = Object.fromEntries(
  Array.from({ length: 15 }, (_, checkpoint) => [
    `C${checkpoint}`,
    Object.fromEntries(
      [...STATUS_VALUES].map((status) => [
        status,
        mappedRequirements.filter((item) => item.checkpoint === checkpoint && item.status === status).length,
      ]),
    ),
  ]),
);

const allRecordPaths = [...new Set(Object.values(checkpointRecords).flat())];
const integrityChecks = [
  {
    id: 'checklist-requirement-count-current-contract',
    passed: requirements.length === EXPECTED_REQUIREMENTS,
    actual: requirements.length,
    expected: EXPECTED_REQUIREMENTS,
  },
  {
    id: 'checkpoint-plan-requirement-count-current-contract',
    passed: requirements.filter((item) => item.checkpoint !== null).length === EXPECTED_CHECKPOINT_REQUIREMENTS,
    actual: requirements.filter((item) => item.checkpoint !== null).length,
    expected: EXPECTED_CHECKPOINT_REQUIREMENTS,
  },
  {
    id: 'all-requirements-mapped-exactly-once',
    passed: mappedRequirements.length === requirements.length && new Set(mappedRequirements.map((item) => item.id)).size === requirements.length,
  },
  {
    id: 'all-status-values-valid',
    passed: mappedRequirements.every((item) => STATUS_VALUES.has(item.status)),
  },
  {
    id: 'every-requirement-has-present-hash-bound-evidence',
    passed: mappedRequirements.every((item) => item.evidence.length >= 2
      && item.evidence.every((entry) => existsSync(absolute(entry.path)) && typeof entry.sha256 === 'string')),
  },
  {
    id: 'all-evidence-records-present',
    passed: allRecordPaths.every((path) => existsSync(absolute(path))),
    missing: allRecordPaths.filter((path) => !existsSync(absolute(path))),
  },
  {
    id: 'c0-through-c7-approved-foundations',
    passed: approvedFoundations.every(Boolean),
    values: approvedFoundations,
  },
  {
    id: 'c8-technical-green-human-and-generalization-gates-open',
    passed: c8.passed === true
      && c8.checks === 465
      && c8.failures.length === 0
      && typeof c8.pendingHumanGate === 'string'
      && checkpointState[8].status !== 'passed',
  },
  {
    id: 'c8-clay-review-instrument-passed-human-gate-open',
    passed: c8ClayReview.instrumentPassed === true
      && c8ClayReview.checks === 651
      && c8ClayReview.failures.length === 0
      && c8ClayReview.gatePassed === false
      && c8ClayReview.status === 'pending-reviewer-submissions'
      && c8ClayReview.reviewerCoverage.validCompleteReviewers === 0
      && c8ClayReview.reviewerCoverage.requiredCompleteReviewers === 3
      && c8ClayReview.reviewerCoverage.qualifiedReviewers === 0
      && c8ClayReview.reviewerCoverage.requiredQualifiedReviewers === 2
      && c8ClayMatrix.reviewerCount === 0
      && c8ClayMatrix.qualifiedReviewerCount === 0
      && Object.values(c8ClayReview.score.perFamilyRecall).every((value) => value === null),
  },
  {
    id: 'c9-parked-state-represented',
    passed: c9Status.approved === false && c9Status.c8IntegrationGatePassed === false && checkpointState[9].status === 'blocked',
  },
  {
    id: 'c10-rollout-block-represented',
    passed: c10.providerLaunchAuthorized === false && checkpointState[10].status === 'blocked',
  },
  {
    id: 'c10-production-shard-planning-represented-without-dispatch',
    passed: c10ShardPlanning.planningPassed === true
      && c10ShardPlanning.dispatchAuthorized === false
      && c10ShardPlanning.fullCheckpoint10Approved === false
      && c10ShardPlanning.checkCount === 2151
      && c10ShardPlanning.failureCount === 0
      && c10ShardPlanning.metrics.workersSeen === 11
      && c10ShardPlanning.metrics.subtypesSeen === 100
      && c10ShardPlanning.metrics.slotsSeen === 892
      && c10ShardManifest.dispatchAuthorized === false
      && C10_SHARD_RECORDS.every((path) => existsSync(absolute(path))),
  },
  {
    id: 'c10-source-admission-integrity-passed-promotion-open',
    passed: c10SourceAdmission.integrityPassed === true
      && c10SourceAdmission.counts.checks === 39
      && c10SourceAdmission.counts.passedChecks === 39
      && c10SourceAdmission.counts.failedChecks === 0
      && c10SourceAdmission.counts.candidates === 6
      && c10SourceAdmission.counts.approvedAndPromotable === 0
      && c10SourceAdmission.counts.pendingOrNonapprovedDecisions === 6
      && c10SourceAdmission.counts.blockerInstances === 12
      && c10SourceAdmission.counts.productionMissingCanonicalSources === 94
      && c10SourceAdmissionIndex.counts.approvedDecisions === 0
      && c10SourceAdmissionIndex.status === 'prepared-pending-human-decisions-not-promotable'
      && C10_SOURCE_ADMISSION_RECORDS.every((path) => existsSync(absolute(path))),
  },
  {
    id: 'c11-representative-only-represented',
    passed: c11.representativeTechnicalPassed === true && c11.fullCheckpointApproved === false && c11Status.developerVisualApproval === true,
  },
  {
    id: 'c12-full-approval-refused',
    passed: c12.fullCheckpointApproved === false && checkpointState[12].status === 'blocked',
    currentStatus: c12.status,
    currentError: c12.error ?? null,
  },
  {
    id: 'c11-to-c12-styled-contract-prepared-not-executed',
    passed: c12StyleContract.contractPreparedPassed === true
      && c12StyleContract.checks.length === 31
      && c12StyleContract.checks.every((check) => check.passed === true)
      && c12StyleContract.materialEvidencePassed === false
      && c12StyleContract.captureEvidencePassed === false
      && c12StyleContract.fullStyledParityPassed === false
      && c12StyleContract.passed === false,
  },
  {
    id: 'c13-representative-only-represented',
    passed: c13.representativeTechnicalPassed === true && c13.fullCheckpointApproved === false && c13Status.fullCheckpointApproved === false,
  },
  {
    id: 'c13-obsolete-private-lod-import-blocker-removed',
    passed: !c13.blockers.some((blocker) => blocker.includes('createRockDocumentFromReference') || blocker.includes('verify:rockgen-lods')),
  },
  {
    id: 'c14-representative-only-and-release-approval-open',
    passed: c14.representativePackagingSlicePassed === true && c14.fullCheckpointApproved === false,
  },
  {
    id: 'c14-exact-command-evidence-is-fail-closed',
    passed: c14CommandEvidence.commands.find((entry) => entry.command === 'npm run verify:rockgen')?.passed === true
      && c14CommandEvidence.commands.find((entry) => entry.command.startsWith('npm pack --dry-run'))?.passed === true
      && c14CommandEvidence.commands.find((entry) => entry.command === 'npm run verify:release')?.status === 'external-execution-blocked'
      && c14CommandEvidence.commands.find((entry) => entry.command === 'npm run verify:release')?.passed === false,
  },
];

const auditIntegrityPassed = integrityChecks.every((check) => check.passed);
const developerFinalApproval = false;
const fullGoalApproved = auditIntegrityPassed
  && mappedRequirements.every((item) => item.status === 'passed')
  && Object.values(checkpointState).every((entry) => entry.status === 'passed')
  && developerFinalApproval;

const blockingConditions = [
  {
    id: 'C8',
    status: checkpointState[8].status,
    reason: checkpointState[8].reason,
    machineFacts: {
      technicalPopulationPassed: c8.passed,
      pendingHumanGate: c8.pendingHumanGate,
      morphologySubtypes: c8Morphology.counts?.subtypes,
      morphologyBaselineMinimum: c8Morphology.counts?.minimumCanonicalBaselines,
      referenceFactoryPassed: c8References.passed,
      clayInstrumentPassed: c8ClayReview.instrumentPassed,
      clayInstrumentChecks: c8ClayReview.checks,
      clayGatePassed: c8ClayReview.gatePassed,
      completeReviewers: `${c8ClayReview.reviewerCoverage.validCompleteReviewers}/${c8ClayReview.reviewerCoverage.requiredCompleteReviewers}`,
      geologyQualifiedReviewers: `${c8ClayReview.reviewerCoverage.qualifiedReviewers}/${c8ClayReview.reviewerCoverage.requiredQualifiedReviewers}`,
    },
  },
  {
    id: 'C9',
    status: checkpointState[9].status,
    reason: checkpointState[9].reason,
    machineFacts: c9Status,
  },
  {
    id: 'C10',
    status: checkpointState[10].status,
    reason: checkpointState[10].reason,
    machineFacts: {
      providerLaunchAuthorized: c10.providerLaunchAuthorized,
      planningPassed: c10ShardPlanning.planningPassed,
      planningChecks: c10ShardPlanning.checkCount,
      planningFailures: c10ShardPlanning.failureCount,
      workers: c10ShardPlanning.metrics.workersSeen,
      subtypes: c10ShardPlanning.metrics.subtypesSeen,
      slots: c10ShardPlanning.metrics.slotsSeen,
      sourcePackages: c10ShardPlanning.metrics.sourcePackages,
      dispatchAuthorized: c10ShardPlanning.dispatchAuthorized,
      fullCheckpoint10Approved: c10ShardPlanning.fullCheckpoint10Approved,
      sourceAdmissionIntegrityPassed: c10SourceAdmission.integrityPassed,
      sourceAdmissionChecks: c10SourceAdmission.counts.checks,
      sourceAdmissionFailures: c10SourceAdmission.counts.failedChecks,
      admissionCandidates: c10SourceAdmission.counts.candidates,
      admissionApprovedAndPromotable: c10SourceAdmission.counts.approvedAndPromotable,
      admissionPendingDecisions: c10SourceAdmission.counts.pendingOrNonapprovedDecisions,
      admissionBlockerInstances: c10SourceAdmission.counts.blockerInstances,
    },
  },
  {
    id: 'C11',
    status: checkpointState[11].status,
    reason: checkpointState[11].reason,
    machineFacts: {
      representativeTechnicalPassed: c11.representativeTechnicalPassed,
      fullCheckpointApproved: c11.fullCheckpointApproved,
      developerVisualApproval: c11Status.developerVisualApproval,
    },
  },
  {
    id: 'C12',
    status: checkpointState[12].status,
    reason: checkpointState[12].reason,
    machineFacts: {
      reportStatus: c12.status,
      representativeTechnicalPassed: c12.representativeTechnicalPassed,
      importCaptureTechnicalPassed: c12.importCaptureTechnicalPassed,
      fullCheckpointApproved: c12.fullCheckpointApproved,
      error: c12.error ?? null,
      styledContractPreparedPassed: c12StyleContract.contractPreparedPassed,
      styledContractChecks: c12StyleContract.checks.length,
      styledMaterialEvidencePassed: c12StyleContract.materialEvidencePassed,
      styledCaptureEvidencePassed: c12StyleContract.captureEvidencePassed,
      fullStyledParityPassed: c12StyleContract.fullStyledParityPassed,
    },
  },
  {
    id: 'C13',
    status: checkpointState[13].status,
    reason: checkpointState[13].reason,
    machineFacts: {
      representativeTechnicalPassed: c13.representativeTechnicalPassed,
      fullCheckpointApproved: c13.fullCheckpointApproved,
      checks: c13.counts?.checks,
      obsoletePrivateLodImportBlockerPresent: c13.blockers.some((blocker) => blocker.includes('createRockDocumentFromReference') || blocker.includes('verify:rockgen-lods')),
    },
  },
  {
    id: 'C14',
    status: checkpointState[14].status,
    reason: checkpointState[14].reason,
    machineFacts: {
      representativePackagingSlicePassed: c14.representativePackagingSlicePassed,
      fullCheckpointApproved: c14.fullCheckpointApproved,
      exactRockgenPassed: c14CommandEvidence.commands.find((entry) => entry.command === 'npm run verify:rockgen')?.passed,
      exactPackDryRunPassed: c14CommandEvidence.commands.find((entry) => entry.command.startsWith('npm pack --dry-run'))?.passed,
      exactReleaseStatus: c14CommandEvidence.commands.find((entry) => entry.command === 'npm run verify:release')?.status,
    },
  },
  {
    id: 'developer-final-release-approval',
    status: 'blocked',
    reason: 'No signed final developer release approval exists; the C14 approval record explicitly says the full checkpoint is open.',
    machineFacts: { developerFinalApproval },
  },
];

const actionableNonUe = [
  {
    priority: 1,
    checkpoints: ['C8'],
    action: 'Finish the representative eight-mechanism calibration pack using final neutral C7 bakes, exact nature comparisons, and explicit H3.1/Meshy/ToonLab-only routing plus per-family LOD/material presets.',
    completionEvidence: 'Per-family process decision records and neutral six-view/close/top/bottom/reference boards for all eight C8 basis mechanisms.',
  },
  {
    priority: 2,
    checkpoints: ['C8'],
    action: 'Run the completed 32 draft, 8 production, and 4 preselected hero outputs through final bake/visual qualification, then use the completed blinded instrument to collect at least three independent locked reviews, including two geology-qualified reviewers.',
    completionEvidence: 'Seed manifests, worst-passing evidence, full technical tables, non-null confusion scores meeting every predeclared family threshold, reviewer coverage 3/3 and 2/2 qualified, and explicit v1 defect dispositions.',
  },
  {
    priority: 3,
    checkpoints: ['C9'],
    action: 'Integrate approved C8 high-to-low modules into the existing formation substrate and prove cross-module structure/material continuity, source-derived talus, support, non-repetition, and the required non-UE camera boards.',
    completionEvidence: 'Real-module formation manifests, seam/phase heat maps, stability/talus lineage, and top-down/flyover/base/silhouette/gameplay captures. UE performance remains a separate C12/C9 gate.',
  },
  {
    priority: 4,
    checkpoints: ['C10'],
    action: 'Resolve all 12 blockers in the six prepared admission packets, record human decisions, promote approved source revisions, author the remaining 94 source packages, then authorize the already planned 11 disjoint shards and execute all 100 subtypes/892 slots.',
    completionEvidence: 'Approved canonical sources and register promotions, explicit tor/hoodoo decisions, zero packet blockers, a dispatch-authorized immutable shard manifest, generated asset/family indexes, complete comparison boards, parameter coverage, and failure-free per-family result JSON.',
  },
  {
    priority: 5,
    checkpoints: ['C11'],
    action: 'Use the developer-approved hoodoo MVP benchmark as the visual floor, then apply the already-proven reversible semantic-mask workflow to every qualified family without mutating neutral outputs.',
    completionEvidence: 'The bound hoodoo decision plus neutral/stylized/restored hashes and WebGPU/WebGL2 multi-view evidence for every qualified family.',
  },
  {
    priority: 6,
    checkpoints: ['C13'],
    action: 'Expand the representative regression harness to the full family/seed/scale/chunk/cache/cancellation/corruption matrix and real supported browser/mobile platforms. The stale private LOD import is already repaired and no longer a blocker.',
    completionEvidence: 'Full aggregate and worst-case tables, platform determinism, actual-device budgets, long rendered scenes, and adversarial review.',
  },
  {
    priority: 7,
    checkpoints: ['C14'],
    action: 'Resolve the restricted-network dependency install and rerun the exact verify:release gate; then finish migration/deprecation/rollback documentation, release notes, immutable catalog admission, and final known limits. Exact verify:rockgen and npm pack --dry-run now pass.',
    completionEvidence: 'Exact command transcript, release-candidate manifest, package listing, clean consumer over qualified behavior, final linked reports, and signed developer approval.',
  },
];

const worktreeStatus = git(['status', '--short'], 'unavailable').split('\n').filter(Boolean);
const audit = {
  schema: 'toonlab/rock-geology-v2-final-checklist-audit',
  version: 1,
  generatedAt: new Date().toISOString(),
  authority: {
    root: relative(resolve(ROOT, '..'), ROOT) || '.',
    gitHead: git(['rev-parse', 'HEAD'], 'unavailable'),
    dirtyPathCount: worktreeStatus.length,
    checklist: { path: CHECKLIST, sha256: sha256(CHECKLIST) },
    providerBridge: { path: PROVIDER_BRIDGE, sha256: sha256(PROVIDER_BRIDGE) },
    policy: 'current worktree files and machine-readable checkpoint records; prose never upgrades an explicit false/open status',
  },
  auditIntegrityPassed,
  fullGoalApproved,
  decision: fullGoalApproved ? 'approved' : 'refused-incomplete',
  expectedExitCode: auditIntegrityPassed ? (fullGoalApproved ? 0 : 2) : 1,
  requirementCounts: {
    total: mappedRequirements.length,
    checkpointPlan: mappedRequirements.filter((item) => item.checkpoint !== null).length,
    crossCutting: mappedRequirements.filter((item) => item.checkpoint === null).length,
    byStatus: statusCounts,
    byCheckpointAndStatus: checkpointStatusCounts,
  },
  completedFoundations: approvedFoundations.map((passed, checkpoint) => ({ checkpoint, passed })),
  checkpointState,
  blockingConditions,
  developerFinalApproval,
  integrityChecks,
  actionableNonUe,
  outputFiles: [
    `${OUTPUT_DIR}/verification.json`,
    `${OUTPUT_DIR}/requirement-matrix.json`,
    `${OUTPUT_DIR}/evidence-index.json`,
    C14_COMMAND_EVIDENCE,
    `${OUTPUT_DIR}/README.md`,
    `${OUTPUT_DIR}/actionable-non-ue.md`,
    `${OUTPUT_DIR}/known-issues.md`,
    `${OUTPUT_DIR}/commands.txt`,
  ],
};

const evidenceIndex = {
  schema: 'toonlab/rock-geology-v2-final-checklist-evidence-index',
  version: 1,
  generatedAt: audit.generatedAt,
  records,
};

const matrix = {
  schema: 'toonlab/rock-geology-v2-final-checklist-requirement-matrix',
  version: 1,
  generatedAt: audit.generatedAt,
  checklist: audit.authority.checklist,
  statusDefinitions: {
    passed: 'Direct current evidence proves the complete scope of the exact requirement.',
    partial: 'Evidence proves a subset, mechanism, representative asset, or infrastructure slice only.',
    blocked: 'The requirement cannot currently close because an explicit dependency, failed gate, or human decision remains.',
    missing: 'No current qualifying completion evidence was found.',
  },
  requirements: mappedRequirements,
};

const checkpointRows = Object.entries(checkpointState)
  .map(([checkpoint, entry]) => `| C${checkpoint} | ${entry.status} | ${entry.reason} |`)
  .join('\n');
const readme = `# Rock geology v2 final checklist audit\n\n`
  + `**Decision:** ${audit.decision}. **Audit integrity:** ${auditIntegrityPassed ? 'passed' : 'failed'}. **Full goal approved:** ${fullGoalApproved}.\n\n`
  + `This is a fail-closed audit of the current worktree. It maps all ${mappedRequirements.length} checkbox requirements in the production checklist, including ${audit.requirementCounts.checkpointPlan} requirements inside the C0–C14 checkpoint plan. A checked checklist box is not treated as sufficient evidence: machine records and explicit approvals control. Representative hoodoo or formation-substrate slices never upgrade a full checkpoint.\n\n`
  + `| Checkpoint | Classification | Current authority |\n| --- | --- | --- |\n${checkpointRows}\n\n`
  + `Requirement totals: ${statusCounts.passed} passed, ${statusCounts.partial} partial, ${statusCounts.blocked} blocked, and ${statusCounts.missing} missing. Full approval requires every requirement and checkpoint to pass plus an explicit final developer release approval.\n\n`
  + `The detailed one-to-one mapping is in \`requirement-matrix.json\`; exact source hashes are in \`evidence-index.json\`. Non-UE work that can proceed now is prioritized in \`actionable-non-ue.md\`.\n`;

const actionsMarkdown = `# Actionable non-UE work\n\n`
  + `These tasks can advance without treating the current failed/open Unreal gate as complete. They remain checkpoint-gated.\n\n`
  + actionableNonUe.map((item) => `${item.priority}. **${item.checkpoints.join('/')} — ${item.action}**\n\n   Required completion evidence: ${item.completionEvidence}`).join('\n\n')
  + `\n`;

const issuesMarkdown = `# Open conditions and non-claims\n\n`
  + blockingConditions.map((item) => `- **${item.id} (${item.status})** — ${item.reason}`).join('\n')
  + `\n\nThe C0–C7 foundation remains usable; this audit does not invalidate it. It refuses only the unsupported inference that approved foundations plus representative hoodoo slices equal the complete geology-v2 product. No Megascans-equivalence, full-family, formation, Unreal, exhaustive-regression, or supported-public-release claim is approved.\n`;

mkdirSync(absolute(OUTPUT_DIR), { recursive: true });
writeFileSync(absolute(`${OUTPUT_DIR}/verification.json`), stableJson(audit));
writeFileSync(absolute(`${OUTPUT_DIR}/requirement-matrix.json`), stableJson(matrix));
writeFileSync(absolute(`${OUTPUT_DIR}/evidence-index.json`), stableJson(evidenceIndex));
writeFileSync(absolute(`${OUTPUT_DIR}/README.md`), readme);
writeFileSync(absolute(`${OUTPUT_DIR}/actionable-non-ue.md`), actionsMarkdown);
writeFileSync(absolute(`${OUTPUT_DIR}/known-issues.md`), issuesMarkdown);
writeFileSync(
  absolute(`${OUTPUT_DIR}/commands.txt`),
  `npm run verify:rockgen\nnpm run verify:skills\nnpm run verify:docs\nnpm run verify:package\nnpm pack --dry-run --json --cache /private/tmp/toonlab-rock-v2-npm-cache\nnpm run verify:release # BLOCKED: restricted-network npm install in verify:rock-regions-package; interrupted, no substitute\nnode scripts/verify-rock-geology-v2-final-checklist.mjs\n\nExit 0: full goal approved\nExit 1: audit integrity failure\nExit 2: audit valid, full goal refused as incomplete\n`,
);

console.log(`Rock geology v2 final audit: ${audit.decision}`);
console.log(`Audit integrity: ${auditIntegrityPassed ? 'PASS' : 'FAIL'}`);
console.log(`Requirements: ${mappedRequirements.length} (${statusCounts.passed} passed, ${statusCounts.partial} partial, ${statusCounts.blocked} blocked, ${statusCounts.missing} missing)`);
console.log(`Full goal approved: ${fullGoalApproved}`);
console.log(`Evidence: ${OUTPUT_DIR}/verification.json`);
process.exitCode = audit.expectedExitCode;
