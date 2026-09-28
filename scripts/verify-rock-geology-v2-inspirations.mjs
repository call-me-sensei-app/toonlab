#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  createMorphologyInspirationRegister,
  summarizeMorphologyInspirationRegister,
} from '../src/rockgen/experimental/geology-v2/canonical/inspirationRegister.node.js';

const taxonomyPath = path.resolve('src/rockgen/experimental/geology-v2/morphology-taxonomy.v1.json');
const outputDirectory = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/inspirations',
);

function checkHttps(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function markdownLink(label, url) {
  return `[${label.replaceAll('|', '\\|')}](${url})`;
}

function markdownCell(items, toText) {
  return items.length > 0 ? items.map(toText).join('<br>') : '—';
}

function makeMarkdown(register, taxonomy, summary) {
  const familyById = new Map(taxonomy.families.map((family) => [family.id, family]));
  const lines = [
    '# C8 rock morphology inspiration register',
    '',
    `Coverage: ${summary.entries} subtypes across ${summary.families} families; ${summary.candidateInspirations} named nature candidates; ${summary.approvedImageReferences} approved image-level references.`,
    '',
    '> Candidate galleries are discovery inputs, not approved baselines. A subtype remains authoring-blocked until at least one exact image, its license/credit, silhouette observations, and feature-level shape rationale are recorded.',
    '',
  ];
  for (const family of taxonomy.families) {
    const entries = register.entries.filter((entry) => entry.familyId === family.id);
    lines.push(`## ${family.label}`, '', family.definition, '');
    lines.push('| Subtype | Nature image candidates | Approved image / geology authority | Art direction | Gate |');
    lines.push('|---|---|---|---|---|');
    for (const entry of entries) {
      const candidates = markdownCell(entry.candidateInspirations, (item) => markdownLink(item.label, item.mediaSearchUrl));
      const approved = [
        ...entry.approvedReferences.map((item) => `${markdownLink(item.label, item.pageUrl)} — image`),
        ...entry.authorityReferences.map((item) => `${markdownLink(item.label, item.pageUrl)} — geology`),
      ];
      const art = markdownCell(entry.artDirectionReferences, (item) => markdownLink(item.label, item.pageUrl));
      const gate = entry.approvedReferences.length > 0 ? 'image approved for shape study' : 'blocked pending exact image approval';
      lines.push(`| ${entry.subtypeLabel}<br>\`${entry.subtypeId}\` | ${candidates} | ${markdownCell(approved, (item) => item)} | ${art} | ${gate} |`);
    }
    lines.push('');
  }
  const unknownFamilies = register.entries.filter((entry) => !familyById.has(entry.familyId));
  if (unknownFamilies.length > 0) lines.push(`Unknown family entries: ${unknownFamilies.map((entry) => entry.subtypeId).join(', ')}`);
  return `${lines.join('\n')}\n`;
}

const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
const register = createMorphologyInspirationRegister();
const summary = summarizeMorphologyInspirationRegister(register);
const failures = [];
const taxonomyIds = new Set(taxonomy.subtypes.map((subtype) => subtype.id));
const registerIds = new Set(register.entries.map((entry) => entry.subtypeId));

if (register.entries.length !== taxonomy.subtypes.length) failures.push('Register entry count does not match taxonomy subtype count.');
if (registerIds.size !== register.entries.length) failures.push('Register contains duplicate subtype IDs.');
for (const id of taxonomyIds) if (!registerIds.has(id)) failures.push(`Missing subtype inspiration entry: ${id}`);
for (const id of registerIds) if (!taxonomyIds.has(id)) failures.push(`Unexpected subtype inspiration entry: ${id}`);

for (const entry of register.entries) {
  if (entry.candidateInspirations.length < register.policy.minimumCandidateInspirationsPerSubtype) {
    failures.push(`${entry.subtypeId} has too few nature inspiration candidates.`);
  }
  for (const candidate of entry.candidateInspirations) {
    if (!candidate.label || !checkHttps(candidate.mediaSearchUrl)) failures.push(`${entry.subtypeId} has an invalid nature candidate.`);
    if (candidate.status !== 'candidate-gallery-requires-image-level-review') failures.push(`${entry.subtypeId} candidate status is not conservative.`);
  }
  for (const reference of entry.approvedReferences) {
    if (!reference.label || !reference.license || !checkHttps(reference.pageUrl) || reference.status !== 'approved-for-shape-study') {
      failures.push(`${entry.subtypeId} has an incomplete approved image reference.`);
    }
  }
  for (const reference of entry.authorityReferences) {
    if (!reference.claim || !reference.label || !checkHttps(reference.pageUrl) || reference.status !== 'approved-geology-authority') {
      failures.push(`${entry.subtypeId} has an incomplete geology authority reference.`);
    }
  }
  for (const reference of entry.artDirectionReferences) {
    if (
      !reference.label
      || !reference.rights
      || !checkHttps(reference.pageUrl)
      || reference.status !== 'candidate-art-direction-reference'
      || reference.borrowedCues.length === 0
      || reference.forbiddenAsEvidence.length === 0
    ) {
      failures.push(`${entry.subtypeId} has an incomplete art-direction reference.`);
    }
  }
}

const pillar = register.entries.find((entry) => entry.subtypeId === 'pillar-residual');
const limestoneTower = register.entries.find((entry) => entry.subtypeId === 'karst-tower-tiered');
const pillarEvidence = JSON.stringify({ approved: pillar.approvedReferences, authority: pillar.authorityReferences });
const towerNatureEvidence = JSON.stringify({ approved: limestoneTower.approvedReferences, candidates: limestoneTower.candidateInspirations });
if (!/Wulingyuan/.test(pillarEvidence) || !/quartz/.test(pillarEvidence)) {
  failures.push('Residual pillar does not preserve the Wulingyuan quartz-sandstone distinction.');
}
if (/Wulingyuan|Zhangjiajie/.test(towerNatureEvidence)) {
  failures.push('Limestone tower-karst nature evidence is contaminated by Wulingyuan/Zhangjiajie sandstone references.');
}
if (!pillar.artDirectionReferences.some((reference) => /Liyue/.test(reference.label))) {
  failures.push('Liyue art direction is not recorded separately on residual pillars.');
}
if (JSON.stringify(pillar.approvedReferences).includes('Liyue') || JSON.stringify(pillar.authorityReferences).includes('Liyue')) {
  failures.push('Liyue is incorrectly being used as nature or geology evidence.');
}
for (const requiredPolicy of [
  'artDirectionCannotOverrideGeology',
  'authoringBlockedWithoutApprovedImage',
  'everyAuthoredFeatureRequiresShapeRationale',
  'natureAndArtDirectionEvidenceMustRemainSeparate',
]) {
  if (register.policy[requiredPolicy] !== true) failures.push(`Required evidence policy is disabled: ${requiredPolicy}`);
}

await mkdir(outputDirectory, { recursive: true });
const report = {
  checkpoint: 8,
  failures,
  passed: failures.length === 0,
  policyAssertions: {
    exactImageApprovalRequiredBeforeAuthoring: true,
    featureLevelShapeRationaleRequired: true,
    fictionalArtDirectionNeverCountsAsGeologyEvidence: true,
    old480CatalogContribution: 0,
  },
  summary,
  version: 1,
};
await writeFile(path.join(outputDirectory, 'inspiration-register.json'), `${JSON.stringify(register, null, 2)}\n`);
await writeFile(path.join(outputDirectory, 'inspiration-summary.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outputDirectory, 'inspiration-list.md'), makeMarkdown(register, taxonomy, summary));

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
