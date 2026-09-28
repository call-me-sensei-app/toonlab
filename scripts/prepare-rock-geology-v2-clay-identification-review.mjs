#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const CHECKPOINT_DIRECTORY = path.resolve(
  'artifacts/research/rock-geology-v2/checkpoint-08-basis-families',
);
const OUTPUT_DIRECTORY = path.join(CHECKPOINT_DIRECTORY, 'clay-identification-review');
const CURRENT_SOURCE_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'current-v3-source');
const PACKET_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-packet');
const IMAGE_DIRECTORY = path.join(PACKET_DIRECTORY, 'images');
const ANSWER_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'adjudicator-only');
const SUBMISSION_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'reviewer-submissions');
const PROTOCOL_ID = 'toonlab-rock-geology-v2-c8-clay-identification-v1';
const RANDOMIZATION_SEED = 'toonlab-c8-clay-identification-v1-2026-08-17';
const SELECTED_ROLES = new Set(['median', 'challenging', 'worst-passing']);
const GEOLOGY_QUALIFICATIONS = [
  'geology-professional',
  'geology-graduate',
  'geology-student',
  'non-geology-reviewer',
];

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function titleCase(value) {
  return value.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function deterministicRank(record) {
  return sha256(`${RANDOMIZATION_SEED}\0${record.familyId}\0${record.variantId}\0${record.heroRole}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await Promise.all([
  mkdir(IMAGE_DIRECTORY, { recursive: true }),
  mkdir(ANSWER_DIRECTORY, { recursive: true }),
  mkdir(SUBMISSION_DIRECTORY, { recursive: true }),
]);

const heroIndexPath = path.join(CURRENT_SOURCE_DIRECTORY, 'hero-output-index.json');
const predeclaredGatesPath = path.join(CHECKPOINT_DIRECTORY, 'predeclared-gates.json');
const lineagePath = path.join(CURRENT_SOURCE_DIRECTORY, 'lineage.json');
const [heroIndexBytes, predeclaredGatesBytes, lineageBytes] = await Promise.all([
  readFile(heroIndexPath),
  readFile(predeclaredGatesPath),
  readFile(lineagePath),
]);
const heroIndex = JSON.parse(heroIndexBytes);
const predeclaredGates = JSON.parse(predeclaredGatesBytes);
const lineage = JSON.parse(lineageBytes);
const selected = heroIndex
  .filter((record) => SELECTED_ROLES.has(record.heroRole))
  .sort((left, right) => deterministicRank(left).localeCompare(deterministicRank(right)));

const families = [...new Set(heroIndex.map((record) => record.familyId))].sort();
const classes = [...new Set(heroIndex.map((record) => record.variantId))].sort();
assert(families.length === 8, `Expected 8 C8 basis families, found ${families.length}.`);
assert(classes.length === 16, `Expected 16 C8 intended classes, found ${classes.length}.`);
assert(selected.length === 24, `Expected 24 median/challenging/worst-passing specimens, found ${selected.length}.`);
assert(lineage.basisCompilerVersion === 3
  && lineage.basisFieldVersion === 3
  && lineage.standardizedMeshResolution === 64
  && lineage.recordCount === 24, 'Current source lineage is not a coherent 24-item v3/64 snapshot.');

const answerItems = [];
const publicItems = [];
for (const [index, record] of selected.entries()) {
  const sampleId = `CLAY-${String(index + 1).padStart(2, '0')}`;
  const sourceFilename = `${record.familyId}--${record.variantId}--${record.heroRole}--clay--threeQuarter.png`;
  const sourceRelativePath = `clay-identification-review/current-v3-source/captures/${sourceFilename}`;
  const sourcePath = path.join(CHECKPOINT_DIRECTORY, sourceRelativePath);
  const publicRelativePath = `images/${sampleId}.png`;
  const publicPath = path.join(PACKET_DIRECTORY, publicRelativePath);
  const programPath = path.join(CURRENT_SOURCE_DIRECTORY, record.programFile);
  const meshPath = path.join(CURRENT_SOURCE_DIRECTORY, record.file);
  const [bytes, programBytes, meshBytes] = await Promise.all([
    readFile(sourcePath),
    readFile(programPath),
    readFile(meshPath),
  ]);
  const program = JSON.parse(programBytes);
  assert(record.basisFieldVersion === 3 && program.basisField.version === 3, `${record.recipeId} is not a current v3 basis record.`);
  assert(record.basisCompilerVersion === 3 && record.meshResolution === 64, `${record.recipeId} is not a compiler-v3 raw 64-grid record.`);
  assert(program.basisField.fieldContentId === record.fieldContentId, `${record.recipeId} field content ID mismatch.`);
  assert(sha256(programBytes) === record.programSha256, `${record.recipeId} program hash mismatch.`);
  assert(sha256(meshBytes) === record.meshObjSha256, `${record.recipeId} OBJ hash mismatch.`);
  assert(bytes.subarray(1, 4).toString('ascii') === 'PNG', `${sourceRelativePath} is not a PNG.`);
  await copyFile(sourcePath, publicPath);
  const imageHash = sha256(bytes);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  publicItems.push({
    image: publicRelativePath,
    imageSha256: imageHash,
    sampleId,
    dimensionsPixels: [width, height],
  });
  answerItems.push({
    basisCompilerSchema: record.basisCompilerSchema,
    basisCompilerVersion: record.basisCompilerVersion,
    basisFieldVersion: record.basisFieldVersion,
    classId: record.variantId,
    familyId: record.familyId,
    fieldContentId: record.fieldContentId,
    heroRole: record.heroRole,
    imageSha256: imageHash,
    meshContentSha256: record.meshContentSha256,
    meshContentId: record.meshContentId,
    meshObjSha256: record.meshObjSha256,
    meshResolution: record.meshResolution,
    programSha256: record.programSha256,
    recipeId: record.recipeId,
    sampleId,
    sourceCapture: sourceRelativePath,
    sourceMesh: `clay-identification-review/current-v3-source/${record.file}`,
    sourceProgram: `clay-identification-review/current-v3-source/${record.programFile}`,
  });
}

const familyCounts = Object.fromEntries(families.map((familyId) => [
  familyId,
  answerItems.filter((item) => item.familyId === familyId).length,
]));
const classCounts = Object.fromEntries(classes.map((classId) => [
  classId,
  answerItems.filter((item) => item.classId === classId).length,
]));
assert(Object.values(familyCounts).every((count) => count === 3), 'Each family must contribute exactly three blind items.');
assert(Object.values(classCounts).every((count) => count >= 1), 'Every intended class must appear at least once.');
assert(answerItems.filter((item) => item.heroRole === 'worst-passing').length === 8, 'Every family must contribute its worst-passing hero.');

const predeclaredThresholdsByFamily = Object.fromEntries(
  predeclaredGates.families.map((family) => [family.id, family.threshold]),
);
assert(Object.keys(predeclaredThresholdsByFamily).length === 8, 'Expected exactly eight predeclared family thresholds.');
assert(families.every((familyId) => Number.isFinite(predeclaredThresholdsByFamily[familyId])), 'Every blind-review family must have a numeric predeclared threshold.');

const contactSheetPath = path.join(PACKET_DIRECTORY, 'blind-contact-sheet.png');
const contactCards = await Promise.all(publicItems.map(async ({ image, sampleId }) => {
  const bytes = await readFile(path.join(PACKET_DIRECTORY, image));
  return `<figure><img src="data:image/png;base64,${bytes.toString('base64')}"><figcaption>${escapeHtml(sampleId)}</figcaption></figure>`;
}));
const contactBrowser = await chromium.launch({ headless: true });
try {
  const page = await contactBrowser.newPage({ viewport: { width: 2048, height: 1400 } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#0f1514;color:#edf2ef;font-family:Inter,system-ui,sans-serif}h1{margin:0;font-size:29px}.lead{margin:7px 0 20px;color:#a9b7b0;font-size:12px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}figure{margin:0;overflow:hidden;border:1px solid #3b4944;border-radius:9px;background:#18201e}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}figcaption{padding:7px 9px;color:#dce4e0;font:11px ui-monospace,monospace}</style></head><body><h1>C8 blind clay identification · 24 items</h1><p class="lead">Opaque IDs only · standardized three-quarter neutral-clay view · answer mapping withheld</p><main>${contactCards.join('')}</main></body></html>`, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ fullPage: true, path: contactSheetPath });
} finally {
  await contactBrowser.close();
}
const contactSheetBytes = await readFile(contactSheetPath);
const answerKeyCommitmentBytes = Buffer.from(stableJson({
  protocolId: PROTOCOL_ID,
  items: answerItems,
}));
const answerKeyCommitmentHash = sha256(answerKeyCommitmentBytes);
const sourceHashByPath = new Map(lineage.sourceLineage.files.map((entry) => [entry.path, entry.sha256]));
const fieldSourcePath = 'src/rockgen/experimental/geology-v2/basis/field.node.js';
const compilerSourcePath = 'src/rockgen/experimental/geology-v2/basis/compiler.node.js';
const captureSourcePath = 'scripts/capture-rock-geology-v2-basis.mjs';
assert(sourceHashByPath.has(fieldSourcePath), 'Field source hash is absent from lineage.');
assert(sourceHashByPath.has(compilerSourcePath), 'Compiler source hash is absent from lineage.');
assert(sourceHashByPath.has(captureSourcePath), 'Capture pipeline hash is absent from lineage.');

const protocol = {
  protocolId: PROTOCOL_ID,
  purpose: 'Test whether the intended C8 shape class can be identified from neutral clay geometry alone.',
  evidenceBoundary: {
    admitted: 'one standardized three-quarter neutral-clay capture of the raw current v3 compiled OBJ for each item',
    excluded: 'color, PBR, stylization, nature references, filenames, recipe IDs, family labels, and answer-key access',
  },
  randomization: {
    algorithm: 'ascending SHA-256 of seed, family ID, class ID, and hero role; then opaque sequential IDs',
    seedSha256: sha256(RANDOMIZATION_SEED),
  },
  coverage: {
    basisFamilies: 8,
    intendedClasses: 16,
    samples: 24,
    samplesPerFamily: 3,
    roles: ['median', 'challenging', 'worst-passing'],
    worstPassingSamples: 8,
    note: 'The primary matrix deliberately uses one identical view type per item. Front/top captures are reserved for post-sort diagnosis and do not affect the score.',
  },
  reviewers: {
    minimumCompleteIndependentReviewers: 3,
    minimumGeologyQualifiedReviewers: 2,
    geologyQualifiedValues: ['geology-professional', 'geology-graduate', 'geology-student'],
    allowedQualificationValues: GEOLOGY_QUALIFICATIONS,
    answerKeyNonAccessAttestationRequired: true,
    independentWorkAttestationRequired: true,
  },
  predeclaredSuccessThreshold: {
    primaryMetric: 'per-family top-1 intended-class recall',
    interpretation: 'Each specimen must be assigned to its exact intended shape class. Recall is grouped by its basis family and compared against that family’s unchanged predeclared numeric threshold.',
    thresholdsByFamily: predeclaredThresholdsByFamily,
    sourcePath: 'predeclared-gates.json',
    sourceSha256: sha256(predeclaredGatesBytes),
  },
};

const manifest = {
  checkpoint: 8,
  answerKeyCommitment: {
    algorithm: 'SHA-256 of canonical indented JSON containing protocolId and ordered adjudicator items',
    sha256: answerKeyCommitmentHash,
  },
  generatedBy: 'scripts/prepare-rock-geology-v2-clay-identification-review.mjs',
  gateDisposition: 'pending-real-independent-reviewers',
  gatePassed: false,
  blindContactSheet: {
    path: 'blind-contact-sheet.png',
    sha256: sha256(contactSheetBytes),
  },
  items: publicItems,
  choices: classes.map((classId) => ({ classId, label: titleCase(classId) })),
  protocol,
  sourceIndex: {
    path: 'clay-identification-review/current-v3-source/hero-output-index.json',
    sha256: sha256(heroIndexBytes),
  },
  sourceLineage: {
    basisCompilerVersion: lineage.basisCompilerVersion,
    basisFieldVersion: lineage.basisFieldVersion,
    capturePipelineSha256: sourceHashByPath.get(captureSourcePath),
    captureScriptPolicy: lineage.renderPolicy,
    compilerSourceSha256: sourceHashByPath.get(compilerSourcePath),
    fieldSourceSha256: sourceHashByPath.get(fieldSourcePath),
    lineagePath: 'clay-identification-review/current-v3-source/lineage.json',
    lineageSha256: sha256(lineageBytes),
    sourceTreeAggregateSha256: lineage.sourceLineage.aggregateSha256,
    standardizedMeshResolution: lineage.standardizedMeshResolution,
  },
};
const manifestBytes = Buffer.from(stableJson(manifest));
const manifestHash = sha256(manifestBytes);
await writeFile(path.join(PACKET_DIRECTORY, 'manifest.json'), manifestBytes);

const answerKey = {
  warning: 'ADJUDICATOR ONLY. Do not share this directory with reviewers before their responses are locked.',
  protocolId: PROTOCOL_ID,
  manifestSha256: manifestHash,
  mappingCommitmentSha256: answerKeyCommitmentHash,
  familyCounts,
  classCounts,
  items: answerItems,
};
await writeFile(path.join(ANSWER_DIRECTORY, 'answer-key.json'), stableJson(answerKey));

const responseTemplate = {
  protocolId: PROTOCOL_ID,
  manifestSha256: manifestHash,
  reviewer: {
    reviewerId: '',
    qualification: '',
    independenceAttestation: false,
    answerKeyNotAccessedAttestation: false,
  },
  startedAt: '',
  completedAt: '',
  answers: publicItems.map(({ sampleId }) => ({
    sampleId,
    selectedClassId: '',
    confidence1To5: null,
    unidentifiable: false,
    defectTags: [],
    notes: '',
  })),
};
await writeFile(path.join(PACKET_DIRECTORY, 'response-template.json'), stableJson(responseTemplate));

const worksheetRows = [
  ['sampleId', 'selectedClassId', 'confidence1To5', 'unidentifiable', 'defectTagsPipeSeparated', 'notes'],
  ...publicItems.map(({ sampleId }) => [sampleId, '', '', 'false', '', '']),
];
await writeFile(
  path.join(PACKET_DIRECTORY, 'reviewer-worksheet.csv'),
  `${worksheetRows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`,
);

const choicesHtml = manifest.choices.map(({ classId, label }) => (
  `<option value="${escapeHtml(classId)}">${escapeHtml(label)}</option>`
)).join('');
const cardsHtml = publicItems.map(({ image, sampleId }, index) => `
  <article data-sample="${escapeHtml(sampleId)}">
    <header><strong>${escapeHtml(sampleId)}</strong><span>${index + 1} / ${publicItems.length}</span></header>
    <img src="${escapeHtml(image)}" alt="Neutral clay specimen ${escapeHtml(sampleId)}">
    <label>Intended class<select class="class-choice"><option value="">Select one</option><option value="__unidentifiable__">Unidentifiable / none defensible</option>${choicesHtml}</select></label>
    <label>Confidence (1 low – 5 high)<input class="confidence" type="number" min="1" max="5" step="1"></label>
    <label>Optional defect tags<input class="defects" placeholder="blob, repetition, silhouette, support…"></label>
    <label>Optional notes<textarea class="notes" rows="2"></textarea></label>
  </article>`).join('');

const reviewHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C8 blind clay identification</title><style>
*{box-sizing:border-box}body{margin:0;background:#101615;color:#edf2ef;font-family:Inter,system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:28px}.lead{color:#aab8b1;line-height:1.5}.meta,.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0;padding:16px;border:1px solid #405049;border-radius:10px;background:#18201e}label{display:grid;gap:6px;color:#cbd5d0;font-size:12px}input,select,textarea,button{font:inherit;color:#edf2ef;background:#111817;border:1px solid #53655d;border-radius:6px;padding:9px}button{cursor:pointer;background:#2e5546}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}article{padding:13px;display:grid;gap:10px;border:1px solid #394842;border-radius:10px;background:#19211f}header{display:flex;justify-content:space-between}header span{color:#87968f;font:11px ui-monospace,monospace}img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#0d1211}.attest{display:flex;align-items:center;gap:8px}.attest input{width:auto}.status{grid-column:1/-1;color:#f0c985}@media(max-width:720px){.grid,.meta,.actions{grid-template-columns:1fr}}</style></head><body><main>
<h1>C8 blind clay identification review</h1><p class="lead">Classify geometry only. Do not consult nature references, source filenames, colored/baked boards, or the adjudicator answer key. Work independently. Choose “unidentifiable” when no class is defensible; that response is scored as incorrect and tracked separately.</p>
<section class="meta"><label>Reviewer ID (stable pseudonym)<input id="reviewerId"></label><label>Qualification<select id="qualification"><option value="">Select one</option>${GEOLOGY_QUALIFICATIONS.map((value) => `<option value="${value}">${titleCase(value)}</option>`).join('')}</select></label><label class="attest"><input id="independent" type="checkbox">I completed this review independently.</label><label class="attest"><input id="noKey" type="checkbox">I did not access the answer key.</label></section>
<section class="grid">${cardsHtml}</section>
<section class="actions"><button id="save" type="button">Save draft in this browser</button><button id="export" type="button">Export locked-response JSON</button><div class="status" id="status">No answer is submitted automatically.</div></section>
</main><script>
const protocolId=${JSON.stringify(PROTOCOL_ID)};const manifestSha256=${JSON.stringify(manifestHash)};const storageKey=protocolId+'-'+manifestSha256;
const cards=[...document.querySelectorAll('article[data-sample]')];
function snapshot(){return{protocolId,manifestSha256,reviewer:{reviewerId:document.querySelector('#reviewerId').value.trim(),qualification:document.querySelector('#qualification').value,independenceAttestation:document.querySelector('#independent').checked,answerKeyNotAccessedAttestation:document.querySelector('#noKey').checked},startedAt:localStorage.getItem(storageKey+'-startedAt')||new Date().toISOString(),completedAt:'',answers:cards.map(card=>{const value=card.querySelector('.class-choice').value;return{sampleId:card.dataset.sample,selectedClassId:value==='__unidentifiable__'?'':value,confidence1To5:Number(card.querySelector('.confidence').value)||null,unidentifiable:value==='__unidentifiable__',defectTags:card.querySelector('.defects').value.split(',').map(v=>v.trim()).filter(Boolean),notes:card.querySelector('.notes').value.trim()}})}}
function apply(data){document.querySelector('#reviewerId').value=data.reviewer?.reviewerId||'';document.querySelector('#qualification').value=data.reviewer?.qualification||'';document.querySelector('#independent').checked=Boolean(data.reviewer?.independenceAttestation);document.querySelector('#noKey').checked=Boolean(data.reviewer?.answerKeyNotAccessedAttestation);for(const answer of data.answers||[]){const card=cards.find(c=>c.dataset.sample===answer.sampleId);if(!card)continue;card.querySelector('.class-choice').value=answer.unidentifiable?'__unidentifiable__':answer.selectedClassId||'';card.querySelector('.confidence').value=answer.confidence1To5||'';card.querySelector('.defects').value=(answer.defectTags||[]).join(', ');card.querySelector('.notes').value=answer.notes||''}}
if(!localStorage.getItem(storageKey+'-startedAt'))localStorage.setItem(storageKey+'-startedAt',new Date().toISOString());const saved=localStorage.getItem(storageKey);if(saved)try{apply(JSON.parse(saved))}catch{}
document.querySelector('#save').onclick=()=>{localStorage.setItem(storageKey,JSON.stringify(snapshot()));document.querySelector('#status').textContent='Draft saved locally; this is not a submission.'};
document.querySelector('#export').onclick=()=>{const data=snapshot();const incomplete=data.answers.filter(a=>(!a.selectedClassId&&!a.unidentifiable)||!Number.isInteger(a.confidence1To5)||a.confidence1To5<1||a.confidence1To5>5);if(!data.reviewer.reviewerId||!data.reviewer.qualification||!data.reviewer.independenceAttestation||!data.reviewer.answerKeyNotAccessedAttestation||incomplete.length){document.querySelector('#status').textContent='Cannot export: complete reviewer metadata, attestations, all 24 choices, and every confidence score.';return}data.completedAt=new Date().toISOString();const blob=new Blob([JSON.stringify(data,null,2)+'\\n'],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='clay-review-'+data.reviewer.reviewerId.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json';a.click();URL.revokeObjectURL(a.href);document.querySelector('#status').textContent='Exported. Place the JSON in reviewer-submissions/; the verifier scores only complete locked responses.'};
</script></body></html>`;
await writeFile(path.join(PACKET_DIRECTORY, 'review.html'), reviewHtml);

await writeFile(path.join(PACKET_DIRECTORY, 'README.md'), `# Blind C8 clay-identification packet

Open \`review.html\` locally and classify all 24 specimens. This packet intentionally contains no answer mapping, recipe IDs, source filenames, family labels, realistic renders, or stylized renders.

The 24 primary items cover all 8 basis families, all 16 intended classes, and every predeclared worst-passing hero. Every item uses the same three-quarter neutral-clay view. Do not inspect \`../adjudicator-only\` before exporting your response.

Save the exported JSON into \`../reviewer-submissions/\`. Three complete independent reviews are required, including at least two geology-qualified reviewers. No file in this packet records approval.
`);

await writeFile(path.join(SUBMISSION_DIRECTORY, 'README.md'), `# Reviewer submissions

Place one exported JSON file per independent reviewer here. Do not edit the answer key or manufacture responses. The verifier rejects incomplete answers, duplicate reviewer IDs, missing attestations, incorrect protocol hashes, and insufficient geology-qualified coverage.
`);

await writeFile(path.join(OUTPUT_DIRECTORY, 'README.md'), `# C8 clay-identification confusion review

This directory closes the *instrumentation* gap, not the human-review gate.

- Reviewer-safe packet: \`reviewer-packet/\`
- Withheld answer key: \`adjudicator-only/answer-key.json\`
- Locked responses: \`reviewer-submissions/*.json\`
- Verifier output: \`verification.json\` and \`confusion-matrix.json\`

Current disposition: **pending real independent reviewers**. The verifier hash-binds \`predeclared-gates.json\` and uses its eight existing family thresholds unchanged. The C8 gate remains false until reviewer-count, qualification, completeness, and every per-family intended-class recall threshold pass.
`);

console.log(JSON.stringify({
  answerKey: path.relative(process.cwd(), path.join(ANSWER_DIRECTORY, 'answer-key.json')),
  families: families.length,
  gatePassed: false,
  manifestSha256: manifestHash,
  packet: path.relative(process.cwd(), PACKET_DIRECTORY),
  samples: publicItems.length,
  predeclaredGatesSha256: sha256(predeclaredGatesBytes),
  status: 'pending-real-independent-reviewers',
  intendedClasses: classes.length,
}, null, 2));
