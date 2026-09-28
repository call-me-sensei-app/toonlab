#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const sourceDirectory = path.join(repositoryRoot, 'src/rockgen/experimental/geology-v2');
const outputFlag = process.argv.indexOf('--output-dir');
const outputDirectory = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1] ?? '') : null;

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(sourceDirectory, name), 'utf8'));
}

const ontology = readJson('ontology.v1.json');
const references = readJson('reference-index.v1.json');
const taxonomy = readJson('morphology-taxonomy.v1.json');
const sourceContract = readJson('editable-source-contract.v1.json');
const checks = [];
const failures = [];

function check(name, condition, details = {}) {
  const passed = condition === true;
  checks.push({ name, passed, details });
  if (!passed) failures.push({ name, details });
}

function checkUnique(name, values) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  check(name, duplicates.length === 0, { duplicates: [...new Set(duplicates)] });
}

function validRange(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(Number.isFinite)
    && value[0] <= value[1];
}

const landformIds = new Set(ontology.landforms.map((item) => item.id));
const scaleIds = new Set(ontology.scales.map((item) => item.id));
const referenceIds = new Set(references.references.map((item) => item.id));
const familyIds = new Set(taxonomy.families.map((item) => item.id));
const profileIds = new Set(taxonomy.variationProfiles.map((item) => item.id));
const subtypeIds = new Set(taxonomy.subtypes.map((item) => item.id));

check('schema.taxonomy', taxonomy.schema === 'toonlab/rock-morphology-taxonomy');
check('schema.source-contract', sourceContract.schema === 'toonlab/editable-rock-source-contract');
check('scope.new-library-independent', sourceContract.independence.newLibrary === true);
check('scope.480-reference-only', sourceContract.independence.existing480CatalogRole === 'optional-reference-only');
check('scope.480-cannot-satisfy-coverage', sourceContract.independence.existing480MaySatisfyCoverage === false);
check('scope.480-cannot-satisfy-baselines', sourceContract.independence.existing480MaySatisfyCanonicalBaselineMinimums === false);
check('scope.480-cannot-be-copied-silently', sourceContract.independence.existing480MayBeSilentlyCopied === false);

checkUnique('unique.family-ids', taxonomy.families.map((item) => item.id));
checkUnique('unique.profile-ids', taxonomy.variationProfiles.map((item) => item.id));
checkUnique('unique.subtype-ids', taxonomy.subtypes.map((item) => item.id));
check('counts.morphology-families', taxonomy.families.length >= 10, { actual: taxonomy.families.length });
check('counts.subtypes', taxonomy.subtypes.length >= 100, { actual: taxonomy.subtypes.length });

for (const profile of taxonomy.variationProfiles) {
  check(`profile.${profile.id}.safe-ranges`, Object.keys(profile.safeRanges ?? {}).length >= 3, { safeRanges: profile.safeRanges });
  check(`profile.${profile.id}.ranges-valid`, Object.values(profile.safeRanges ?? {}).every(validRange), { safeRanges: profile.safeRanges });
  check(`profile.${profile.id}.locked`, Array.isArray(profile.locked) && profile.locked.length >= 3, { locked: profile.locked });
}

const coveredLandforms = new Map([...landformIds].map((id) => [id, []]));
let minimumCanonicalBaselines = 0;
for (const subtype of taxonomy.subtypes) {
  minimumCanonicalBaselines += subtype.minimumCanonicalBaselines;
  check(`subtype.${subtype.id}.family`, familyIds.has(subtype.familyId), { familyId: subtype.familyId });
  check(`subtype.${subtype.id}.variation-profile`, profileIds.has(subtype.variationProfileId), { variationProfileId: subtype.variationProfileId });
  check(`subtype.${subtype.id}.landforms`, subtype.landforms?.length > 0 && subtype.landforms.every((id) => landformIds.has(id)), { landforms: subtype.landforms });
  check(`subtype.${subtype.id}.scales`, subtype.scales?.length > 0 && subtype.scales.every((id) => scaleIds.has(id)), { scales: subtype.scales });
  check(`subtype.${subtype.id}.baseline-mode`, ['authored-required', 'authored-preferred', 'procedural-qualified'].includes(subtype.baselineMode), { baselineMode: subtype.baselineMode });
  check(`subtype.${subtype.id}.minimum-baselines`, Number.isInteger(subtype.minimumCanonicalBaselines) && subtype.minimumCanonicalBaselines >= 6, { minimumCanonicalBaselines: subtype.minimumCanonicalBaselines });
  check(`subtype.${subtype.id}.required-silhouette`, subtype.requiredSilhouette?.length >= 2, { requiredSilhouette: subtype.requiredSilhouette });
  check(`subtype.${subtype.id}.required-structure`, subtype.requiredStructure?.length >= 1, { requiredStructure: subtype.requiredStructure });
  check(`subtype.${subtype.id}.forbidden-drift`, subtype.forbiddenDrift?.length >= 3, { forbiddenDrift: subtype.forbiddenDrift });
  check(`subtype.${subtype.id}.identity-metrics`, Object.keys(subtype.identityMetrics ?? {}).length >= 2 && Object.values(subtype.identityMetrics ?? {}).every(validRange), { identityMetrics: subtype.identityMetrics });
  check(`subtype.${subtype.id}.references`, subtype.referenceIds?.length > 0 && subtype.referenceIds.every((id) => referenceIds.has(id)), { referenceIds: subtype.referenceIds });
  for (const landform of subtype.landforms ?? []) coveredLandforms.get(landform)?.push(subtype.id);
}

for (const [landform, subtypes] of coveredLandforms) {
  check(`coverage.landform.${landform}`, subtypes.length > 0, { subtypes });
}

check('coverage.no-unknown-landforms', taxonomy.subtypes.every((subtype) => subtype.landforms.every((id) => landformIds.has(id))));
check('coverage.no-unknown-reference-ids', taxonomy.subtypes.every((subtype) => subtype.referenceIds.every((id) => referenceIds.has(id))));
check('baselines.exceeds-existing-480', minimumCanonicalBaselines > 480, { minimumCanonicalBaselines });
check('baselines.meets-declared-floor', minimumCanonicalBaselines >= taxonomy.scope.minimumTotalCanonicalBaselines, {
  declared: taxonomy.scope.minimumTotalCanonicalBaselines,
  actual: minimumCanonicalBaselines,
});
check('baselines.claim-is-bounded', taxonomy.scope.claim.includes('not a claim to enumerate every landform on Earth'), { claim: taxonomy.scope.claim });
check('baselines.seed-is-not-baseline', taxonomy.scope.canonicalBaselineRule.includes('not a new baseline'), { canonicalBaselineRule: taxonomy.scope.canonicalBaselineRule });

const criticalSubtypeTraits = {
  'tor-block-pile': ['stackedMassCount', 'heightWidthRatio', 'contactSupportFraction'],
  'karst-tower-tiered': ['heightWidthRatio', 'majorLedgeCount', 'beddingSpacingCoefficientOfVariation'],
  'arch-sandstone': ['openingWidthHeightRatio', 'roofThicknessSpanRatio', 'supportGraphPass'],
  'sea-stack': ['heightWidthRatio', 'shoreSeparationMetres', 'waveCutBaseFraction'],
  'cliff-module-straight': ['seamProfileToleranceMetres', 'faceContinuity'],
  'mountain-modular-bedrock': ['moduleCount', 'seamProfileToleranceMetres', 'silhouetteScaleLevels'],
};
for (const [subtypeId, metrics] of Object.entries(criticalSubtypeTraits)) {
  const subtype = taxonomy.subtypes.find((item) => item.id === subtypeId);
  check(`critical.${subtypeId}.exists`, subtypeIds.has(subtypeId));
  check(`critical.${subtypeId}.metrics`, Boolean(subtype) && metrics.every((metric) => metric in subtype.identityMetrics), { expected: metrics, actual: Object.keys(subtype?.identityMetrics ?? {}) });
}

const requiredSourceFiles = new Set(sourceContract.sourcePackage.requiredFiles.map((item) => item.name));
for (const file of ['source-manifest.json', 'control-cage.glb', 'recipe.json', 'modifier-stack.json', 'identity-landmarks.json']) {
  check(`source-package.required.${file}`, requiredSourceFiles.has(file));
}
checkUnique('source-package.required-files-unique', [...requiredSourceFiles]);
checkUnique('source-package.optional-files-unique', sourceContract.sourcePackage.optionalFiles.map((item) => item.name));

const editModes = new Set(sourceContract.editModes.map((item) => item.id));
for (const mode of ['procedural-safe', 'manual-control-cage', 'manual-high-detail', 'freeform-reclassify']) {
  check(`edit-mode.${mode}`, editModes.has(mode));
}
for (const mode of sourceContract.editModes) {
  check(`edit-mode.${mode.id}.commit-rebakes`, /rebake/u.test(mode.commit), { commit: mode.commit });
  check(`edit-mode.${mode.id}.blocked`, mode.blocked.length >= 2, { blocked: mode.blocked });
}

const compileStages = sourceContract.compileGraph.map((item) => item.stage);
check('compile-graph.stages-contiguous', compileStages.length === 11 && compileStages.every((stage, index) => stage === index + 1), { compileStages });
check('compile-graph.identity-before-high-detail', sourceContract.compileGraph.find((item) => item.id === 'identity-preflight')?.stage < sourceContract.compileGraph.find((item) => item.id === 'geology-high-detail')?.stage);
check('compile-graph.visual-before-publish', sourceContract.compileGraph.find((item) => item.id === 'visual-gate')?.stage < sourceContract.compileGraph.find((item) => item.id === 'atomic-publish')?.stage);

const bakeProfiles = new Map(sourceContract.bakeProfiles.map((item) => [item.id, item]));
check('bake.shape-review-not-production', bakeProfiles.get('shape-review')?.resolution === 512 && bakeProfiles.get('shape-review')?.productionReady === false);
check('bake.standard-2k', bakeProfiles.get('standard-2k')?.resolution === 2048 && bakeProfiles.get('standard-2k')?.productionReady === true);
check('bake.hero-4k', bakeProfiles.get('hero-4k')?.resolution === 4096 && bakeProfiles.get('hero-4k')?.productionReady === true);
check('bake.hero-8k-conditional', bakeProfiles.get('hero-8k')?.resolution === 8192 && bakeProfiles.get('hero-8k')?.productionReady === 'conditional');
check('round-trip.six-gates', sourceContract.roundTripQualification.requiredPerSubtype.length >= 6, { requiredPerSubtype: sourceContract.roundTripQualification.requiredPerSubtype });
check('round-trip.before-after-evidence', sourceContract.roundTripQualification.requiredEvidence.includes('before-after comparison'));
check('round-trip.visual-approval-explicit', sourceContract.roundTripQualification.successRule.includes('never substitutes for morphology and visual approval'));

const subtypeCountsByFamily = Object.fromEntries(taxonomy.families.map((family) => [
  family.id,
  taxonomy.subtypes.filter((subtype) => subtype.familyId === family.id).length,
]));
const baselineCountsByFamily = Object.fromEntries(taxonomy.families.map((family) => [
  family.id,
  taxonomy.subtypes
    .filter((subtype) => subtype.familyId === family.id)
    .reduce((sum, subtype) => sum + subtype.minimumCanonicalBaselines, 0),
]));
const result = {
  schema: 'toonlab/rock-geology-v2-morphology-verification',
  version: 1,
  passed: failures.length === 0,
  counts: {
    morphologyFamilies: taxonomy.families.length,
    subtypes: taxonomy.subtypes.length,
    ontologyLandforms: ontology.landforms.length,
    coveredOntologyLandforms: [...coveredLandforms.values()].filter((items) => items.length > 0).length,
    minimumCanonicalBaselines,
    variationProfiles: taxonomy.variationProfiles.length,
    editModes: sourceContract.editModes.length,
    bakeProfiles: sourceContract.bakeProfiles.length,
    checks: checks.length,
    failures: failures.length,
  },
  independence: sourceContract.independence,
  subtypeCountsByFamily,
  baselineCountsByFamily,
  landformCoverage: Object.fromEntries(coveredLandforms),
  failures,
  checks,
};

function markdownTable(rows) {
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

function renderMarkdown() {
  const familyRows = taxonomy.families.map((family) => [
    family.label,
    String(subtypeCountsByFamily[family.id]),
    String(baselineCountsByFamily[family.id]),
  ]);
  const subtypeRows = taxonomy.subtypes.map((subtype) => [
    subtype.label,
    subtype.landforms.join(', '),
    subtype.baselineMode,
    String(subtype.minimumCanonicalBaselines),
    subtype.requiredSilhouette.join('; '),
    subtype.forbiddenDrift.join('; '),
  ]);
  return [
    '# Rock morphology coverage and editable-source gate',
    '',
    `Status: **${result.passed ? 'PASS' : 'FAIL'}** — ${result.counts.checks} checks, ${result.counts.failures} failures.`,
    '',
    `This is an independent new library: the existing 480 assets are ${sourceContract.independence.existing480CatalogRole.replaceAll('-', ' ')} and satisfy **zero** new coverage or baseline requirements.`,
    '',
    `The production-complete-v1 target contains **${result.counts.subtypes} subtypes** covering all **${result.counts.coveredOntologyLandforms} ontology landforms**, with a floor of **${result.counts.minimumCanonicalBaselines} separately approved canonical sources** before procedural variations.`,
    '',
    '## Family totals',
    '',
    markdownTable([['Family', 'Subtypes', 'Minimum canonical baselines'], ['---', '---:', '---:'], ...familyRows]),
    '',
    '## Subtype identity checklist',
    '',
    markdownTable([['Subtype', 'Ontology landform', 'Source mode', 'Minimum', 'Required silhouette', 'Forbidden drift'], ['---', '---', '---', '---:', '---', '---'], ...subtypeRows]),
    '',
    '## Edit and rebake promise',
    '',
    '- The editable control cage, recipe, modifier stack, and identity landmarks are authoritative.',
    '- Safe procedural edits and manual control-cage or high-detail edits create source revisions.',
    '- Every committed edit re-validates subtype identity and regenerates runtime geometry, UVs, and all bake maps.',
    '- Freeform edits outside the subtype envelope are rejected or explicitly reclassified; they are never silently clamped.',
    '- 512px is review-only; production profiles are 2K, 4K, and conditional 8K.',
    '',
  ].join('\n');
}

if (outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'morphology-verification.json'), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, 'morphology-taxonomy.md'), renderMarkdown());
}

console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
