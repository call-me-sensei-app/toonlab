import fs from 'node:fs';

import { canonicalizeJson } from './canonical.node.js';
import { validationIssue } from './errors.js';

const ONTOLOGY_URL = new URL('./ontology.v1.json', import.meta.url);
const COMPATIBILITY_URL = new URL('./compatibility.v1.json', import.meta.url);

let cachedCatalog = null;

export function loadGeologyCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const ontology = canonicalizeJson(JSON.parse(fs.readFileSync(ONTOLOGY_URL, 'utf8')));
  const compatibility = canonicalizeJson(JSON.parse(fs.readFileSync(COMPATIBILITY_URL, 'utf8')));
  cachedCatalog = createGeologyCatalog(ontology, compatibility);
  return cachedCatalog;
}

export function createGeologyCatalog(ontology, compatibility) {
  const lithologyById = new Map(ontology.lithologies.map((item) => [item.id, item]));
  const ids = Object.freeze({
    lithology: new Set(ontology.lithologies.map((item) => item.id)),
    fabric: new Set(ontology.fabrics.map((item) => item.id)),
    process: new Set(ontology.processes.map((item) => item.id)),
    environment: new Set(ontology.environments),
    landform: new Set(ontology.landforms.map((item) => item.id)),
    scale: new Set(ontology.scales.map((item) => item.id)),
  });
  const profiles = Object.freeze({
    fabric: indexProfiles(compatibility.profiles.fabric),
    process: indexProfiles(compatibility.profiles.process),
    landform: indexProfiles(compatibility.profiles.landform),
    environmentLandform: indexProfiles(compatibility.environmentLandformProfiles),
  });
  const landformScalePairs = new Set();
  for (const profile of compatibility.landformScaleProfiles) {
    for (const landform of profile.members) landformScalePairs.add(`${landform}:${profile.scale}`);
  }
  const detachedLandforms = new Set(
    ontology.landforms.filter((item) => item.tags.includes('detached')).map((item) => item.id),
  );

  function classifyLithologyPair(lithologyId, memberId, axis) {
    const lithology = lithologyById.get(lithologyId);
    const profile = profiles[axis]?.get(memberId);
    if (!lithology || !profile) return 'invalid';
    if (profile.validWhen?.some((selector) => matchesSelector(lithology, selector))) return 'valid';
    if (profile.uncommonWhen?.some((selector) => matchesSelector(lithology, selector))) return 'valid-but-uncommon';
    return 'invalid';
  }

  function classifyEnvironmentLandform(environment, landform) {
    const profile = profiles.environmentLandform.get(landform);
    if (!profile || !ids.environment.has(environment)) return 'invalid';
    if (profile.validEnvironments.includes(environment)) return 'valid';
    if (profile.uncommonEnvironments?.includes(environment)) return 'valid-but-uncommon';
    return 'invalid';
  }

  function classifyLandformScale(landform, scale) {
    return landformScalePairs.has(`${landform}:${scale}`) ? 'valid' : 'invalid';
  }

  function compatibilityFindings(recipe) {
    const issues = [];
    const warnings = [];
    for (const [axis, values] of [['fabric', recipe.fabrics], ['process', recipe.processes]]) {
      for (const [index, value] of values.entries()) {
        addStatusFinding(
          classifyLithologyPair(recipe.lithology, value, axis),
          `$.${axis === 'fabric' ? 'fabrics' : 'processes'}[${index}]`,
          `${recipe.lithology} × ${value}`,
          issues,
          warnings,
        );
      }
    }
    addStatusFinding(
      classifyLithologyPair(recipe.lithology, recipe.landform, 'landform'),
      '$.landform',
      `${recipe.lithology} × ${recipe.landform}`,
      issues,
      warnings,
    );
    addStatusFinding(
      classifyEnvironmentLandform(recipe.environment, recipe.landform),
      '$.environment',
      `${recipe.environment} × ${recipe.landform}`,
      issues,
      warnings,
    );
    addStatusFinding(
      classifyLandformScale(recipe.landform, recipe.scale),
      '$.scale',
      `${recipe.landform} × ${recipe.scale}`,
      issues,
      warnings,
    );

    for (const finding of contextualFindings(recipe, lithologyById, detachedLandforms)) issues.push(finding);
    return Object.freeze({ issues: Object.freeze(issues), warnings: Object.freeze(warnings) });
  }

  return Object.freeze({
    ontology,
    compatibility,
    ids,
    lithologyById,
    classifyLithologyPair,
    classifyEnvironmentLandform,
    classifyLandformScale,
    compatibilityFindings,
  });
}

function indexProfiles(profiles) {
  const result = new Map();
  for (const profile of profiles) {
    for (const member of profile.members) result.set(member, profile);
  }
  return result;
}

function matchesSelector(lithology, selector) {
  if (selector.any === true) return true;
  if (selector.classes && !selector.classes.includes(lithology.class)) return false;
  if (selector.lithologies && !selector.lithologies.includes(lithology.id)) return false;
  if (selector.tagsAny && !selector.tagsAny.some((tag) => lithology.tags.includes(tag))) return false;
  return Boolean(selector.classes || selector.lithologies || selector.tagsAny);
}

function addStatusFinding(status, path, pair, issues, warnings) {
  if (status === 'invalid') {
    issues.push(validationIssue(
      'GEOLOGY_COMBINATION_INVALID',
      path,
      `The declared geology combination ${pair} is invalid in compatibility matrix v1.`,
      'Select a valid or valid-but-uncommon combination, or declare an explicit fantastical override with reason and author.',
      { pair, status },
    ));
  } else if (status === 'valid-but-uncommon') {
    warnings.push(validationIssue(
      'GEOLOGY_COMBINATION_UNCOMMON',
      path,
      `The declared geology combination ${pair} is valid but uncommon.`,
      'Keep it only when the intended reference supports the uncommon combination.',
      { pair, status },
    ));
  }
}

const BEDDING = new Set([
  'laminated', 'planar-bedding', 'thin-bedding', 'medium-bedding', 'thick-bedding',
  'very-thick-bedding', 'cross-bedding', 'graded-bedding', 'folded-bedding',
]);
const METAMORPHIC_FABRICS = new Set([
  'slaty-cleavage', 'phyllitic-foliation', 'schistosity', 'crenulation', 'gneissic-banding',
  'migmatitic-banding', 'folded-foliation', 'lineation', 'boudinage', 'shear-foliation',
  'mylonitic-foliation',
]);
const JOINT_FABRICS = new Set([
  'orthogonal-joints', 'rhombohedral-joints', 'polyhedral-joints', 'tabular-joints',
  'sheet-joints', 'irregular-joints', 'fault-joints', 'cooling-columns', 'entablature',
]);
const STABILITY_LANDFORMS = new Set(['overhang', 'cave-mouth', 'arch', 'natural-bridge']);

function contextualFindings(recipe, lithologyById, detachedLandforms) {
  const issues = [];
  const lithology = lithologyById.get(recipe.lithology);
  const hasAny = (values, candidates) => values.some((value) => candidates.has(value));
  const fail = (rule, path, message, suggestion) => issues.push(validationIssue(
    'GEOLOGY_CONTEXT_INVALID', path, message, suggestion, { rule },
  ));

  if (hasAny(recipe.fabrics, BEDDING)
    && lithology?.class !== 'sedimentary'
    && !['tuff', 'ignimbrite', 'volcanic-breccia'].includes(recipe.lithology)) {
    fail('bedding-requires-deposition', '$.fabrics', 'Bedding requires a deposited unit; the selected lithology is not depositional.', 'Remove bedding or choose a sedimentary/pyroclastic deposited lithology.');
  }
  if (hasAny(recipe.fabrics, new Set(['cooling-columns', 'entablature']))
    && (!lithology?.tags.includes('cooling-joint-capable') || !recipe.processContext.coolingBoundary)) {
    fail('cooling-columns-require-cooling-body', '$.processContext.coolingBoundary', 'Cooling columns require a cooling-joint-capable body and an explicit cooling boundary.', 'Declare the flow, sill, or cooling-surface boundary that controls column orientation.');
  }
  if (hasAny(recipe.fabrics, METAMORPHIC_FABRICS) && lithology?.class !== 'metamorphic') {
    fail('metamorphic-fabric-requires-metamorphism', '$.fabrics', 'Metamorphic fabric cannot be assigned to a non-metamorphic lithology.', 'Choose a metamorphic lithology or remove the metamorphic fabric.');
  }
  if (hasAny(recipe.fabrics, BEDDING) && hasAny(recipe.fabrics, JOINT_FABRICS)) {
    const deposition = recipe.chronology.nodes.find((node) => node.kind === 'deposition');
    const fracture = recipe.chronology.nodes.find((node) => node.kind === 'fracture');
    if (!deposition || !fracture || fracture.order <= deposition.order) {
      fail('cross-cutting-needs-chronology', '$.chronology', 'Bedding and joints require chronology proving that fracture postdates deposition.', 'Add ordered deposition and fracture nodes with an explicit precedes edge.');
    }
  }
  if ((recipe.processes.includes('karst-dissolution') || ['karst-spire', 'cave-mouth'].includes(recipe.landform))
    && (!lithology?.tags.includes('soluble-carbonate') || recipe.processContext.waterRoutingNormalized <= 0 || recipe.weathering.exposureYears <= 0)) {
    fail('karst-requires-solubility-water-exposure-time', '$.processContext.waterRoutingNormalized', 'Karst requires soluble rock, routed water, and non-zero exposure time.', 'Use a soluble-carbonate lithology and declare water routing plus exposure years.');
  }
  if (recipe.processes.includes('salt-weathering')
    && (recipe.materialProperties.porosityFraction < 0.05 || recipe.processContext.saltExposureNormalized <= 0 || recipe.weathering.exposureYears < 100)) {
    fail('tafoni-needs-material-climate-exposure', '$.processContext.saltExposureNormalized', 'Salt weathering requires sufficient porosity, salt exposure, and time.', 'Increase the physically justified porosity/exposure inputs or remove salt weathering.');
  }
  if (recipe.processes.includes('transport-rounding')
    && (!recipe.processContext.detached || !detachedLandforms.has(recipe.landform) || recipe.processContext.transportDistanceMetres <= 0)) {
    fail('transport-rounding-requires-detachment', '$.processContext.transportDistanceMetres', 'Transport rounding requires a detached landform and non-zero transport distance.', 'Mark the rock detached, use a detached landform, and declare transport distance in metres.');
  }
  if (['talus-fan', 'scree'].includes(recipe.landform)
    && (!recipe.processContext.sourceFormationId || recipe.processContext.sourceLithology !== recipe.lithology)) {
    fail('talus-inherits-source', '$.processContext.sourceFormationId', 'Talus and scree must identify a source formation with matching lithology.', 'Set sourceFormationId and sourceLithology to the coherent parent geology.');
  }
  if (recipe.landform === 'sea-stack'
    && (recipe.environment !== 'coastal' || !recipe.processes.includes('marine-abrasion')
      || !recipe.processContext.parentCoastId || !recipe.processContext.collapseStage)) {
    fail('sea-stack-requires-coastal-history', '$.processContext.parentCoastId', 'A sea stack requires coastal setting, marine abrasion, parent coast, and collapse stage.', 'Declare the coastal history instead of generating an isolated generic pillar.');
  }
  if (STABILITY_LANDFORMS.has(recipe.landform)
    && (!recipe.processContext.stability.passed || recipe.processContext.stability.mode === 'not-required')) {
    fail('overhang-requires-stability', '$.processContext.stability', 'Overhangs, caves, and arches require an explicit passing stability evaluation.', 'Use the support graph or physical simulation and record a passing result.');
  }
  return issues;
}
