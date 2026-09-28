import { canonicalStringify, canonicalizeJson, contentId } from './canonical.node.js';
import { loadGeologyCatalog } from './catalog.node.js';
import { validationIssue, throwForValidationIssues } from './errors.js';

export const ROCK_RECIPE_SCHEMA = 'toonlab/rock-geology-recipe';
export const ROCK_RECIPE_VERSION = 1;
export const ROCK_QUALITY_TIERS = Object.freeze(['draft', 'production', 'hero']);
export const ROCK_SEED_NAMESPACES = Object.freeze([
  'structure', 'fractures', 'weathering', 'transport', 'denseSource',
  'renderMesh', 'fallbackMesh', 'collision', 'surfaceBake', 'style',
]);

const TOP_LEVEL_FIELDS = Object.freeze([
  'schema', 'version', 'id', 'label', 'description', 'formationId', 'hostLithology',
  'lithology', 'fabrics', 'processes', 'environment', 'landform', 'scale',
  'targetDimensionsMetres', 'geologyTransform', 'materialProperties', 'chronology',
  'depositionalHistory', 'metamorphicFabric', 'fractureHistory', 'weathering',
  'processContext', 'qualityTier', 'seed', 'seedNamespaces', 'overrides',
]);

const IDENTIFIER = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const CHRONOLOGY_KINDS = new Set([
  'deposition', 'intrusion', 'cooling', 'metamorphism', 'deformation',
  'fracture', 'weathering', 'erosion', 'transport',
]);
const CHRONOLOGY_RELATIONSHIPS = new Set([
  'precedes', 'cuts', 'terminates-at', 'deflects-along', 'offsets',
]);
const FRACTURE_KINDS = new Set(['joint', 'fault', 'cooling', 'sheet', 'cleavage']);
const SIZE_DISTRIBUTIONS = new Set(['uniform', 'lognormal', 'power-law']);
const METAMORPHIC_GRADES = new Set(['low', 'medium', 'high']);
const STABILITY_MODES = new Set(['not-required', 'support-graph', 'physical-simulation', 'art-override']);
const COLLAPSE_STAGES = new Set(['cave', 'arch', 'stack', 'stump']);
const STABILITY_LANDFORMS = new Set(['overhang', 'cave-mouth', 'arch', 'natural-bridge']);

export function parseRockRecipe(value, options = {}) {
  const result = validateRockRecipe(value, options);
  throwForValidationIssues(result.issues);
  return Object.freeze({
    recipe: canonicalizeJson(value),
    warnings: result.warnings,
    contentId: contentId(value),
  });
}

export function serializeRockRecipe(value, options = {}) {
  const parsed = parseRockRecipe(value, options);
  return `${canonicalStringify(parsed.recipe, { pretty: options.pretty === true })}\n`;
}

export function deserializeRockRecipe(text, options = {}) {
  if (typeof text !== 'string') {
    throwForValidationIssues([
      validationIssue('ROCK_RECIPE_TEXT_REQUIRED', '$', 'Serialized RockRecipe input must be a string.', 'Read the UTF-8 JSON document before deserializing.'),
    ]);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throwForValidationIssues([
      validationIssue('ROCK_RECIPE_JSON_INVALID', '$', `RockRecipe JSON could not be parsed: ${error.message}`, 'Correct the JSON syntax; partial documents are not accepted.'),
    ]);
  }
  return parseRockRecipe(value, options);
}

export function validateRockRecipe(value, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const issues = [];
  const warnings = [];
  if (!isPlainObject(value)) {
    issues.push(validationIssue('ROCK_RECIPE_OBJECT_REQUIRED', '$', 'RockRecipe must be a plain JSON object.', 'Supply a JSON object matching schema version 1.'));
    return Object.freeze({ valid: false, issues: Object.freeze(issues), warnings: Object.freeze(warnings) });
  }

  exactKeys(value, TOP_LEVEL_FIELDS, '$', issues);
  exactValue(value.schema, ROCK_RECIPE_SCHEMA, '$.schema', issues);
  exactValue(value.version, ROCK_RECIPE_VERSION, '$.version', issues);
  identifier(value.id, '$.id', issues);
  nonEmptyString(value.label, '$.label', issues, 120);
  nonEmptyString(value.description, '$.description', issues, 1000);
  identifier(value.formationId, '$.formationId', issues);
  nullableIdentifier(value.hostLithology, '$.hostLithology', issues);
  identifier(value.lithology, '$.lithology', issues);
  identifierArray(value.fabrics, '$.fabrics', issues, { minimum: 1 });
  identifierArray(value.processes, '$.processes', issues, { minimum: 1 });
  identifier(value.environment, '$.environment', issues);
  identifier(value.landform, '$.landform', issues);
  identifier(value.scale, '$.scale', issues);
  vector(value.targetDimensionsMetres, '$.targetDimensionsMetres', issues, { minimumExclusive: 0, maximum: 5000 });
  validateGeologyTransform(value.geologyTransform, issues);
  validateMaterialProperties(value.materialProperties, issues);
  validateChronology(value.chronology, issues);
  validateDepositionalHistory(value.depositionalHistory, issues);
  validateMetamorphicFabric(value.metamorphicFabric, issues);
  validateFractureHistory(value.fractureHistory, issues);
  validateWeathering(value.weathering, issues);
  validateProcessContext(value.processContext, issues);
  enumValue(value.qualityTier, ROCK_QUALITY_TIERS, '$.qualityTier', issues);
  integerRange(value.seed, '$.seed', issues, 1, 0xffffffff);
  validateSeedNamespaces(value.seedNamespaces, issues);
  validateOverrides(value.overrides, issues);

  if (Array.isArray(value.processes) && isPlainObject(value.weathering) && Array.isArray(value.weathering.processes)
    && (value.processes.length !== value.weathering.processes.length
      || value.processes.some((process, index) => process !== value.weathering.processes[index]))) {
    issues.push(validationIssue(
      'PROCESS_DECLARATION_MISMATCH',
      '$.weathering.processes',
      'weathering.processes must exactly match the ordered top-level processes list in schema v1.',
      'Keep one explicit ordered process selection; stage-specific interpretation belongs in compiler outputs.',
    ));
  }
  if (isPlainObject(value.depositionalHistory) && value.depositionalHistory.environment !== value.environment) {
    issues.push(validationIssue(
      'DEPOSITIONAL_ENVIRONMENT_MISMATCH',
      '$.depositionalHistory.environment',
      'Depositional history environment must match the recipe environment in schema v1.',
      'Use one declared environment until multi-environment chronology is introduced in a future schema version.',
    ));
  }

  if (isPlainObject(value.chronology) && Array.isArray(value.chronology.nodes)
    && isPlainObject(value.fractureHistory) && Array.isArray(value.fractureHistory.sets)) {
    const chronologyIds = new Set(value.chronology.nodes.map((node) => node?.id));
    value.fractureHistory.sets.forEach((set, index) => {
      if (isPlainObject(set) && typeof set.chronologyNodeId === 'string' && !chronologyIds.has(set.chronologyNodeId)) {
        issues.push(validationIssue(
          'FRACTURE_CHRONOLOGY_DANGLING',
          `$.fractureHistory.sets[${index}].chronologyNodeId`,
          `Fracture set references missing chronology node “${set.chronologyNodeId}”.`,
          'Reference a declared fracture or deformation event.',
        ));
      }
    });
  }

  if (issues.length === 0) {
    ontologyMembership(value, catalog, issues);
    validateClassRequirements(value, catalog, issues);
    if (issues.length === 0) {
      const compatibility = catalog.compatibilityFindings(value);
      if (value.overrides.allowFantasticalOverride) {
        for (const issue of compatibility.issues) {
          warnings.push(validationIssue(
            'GEOLOGY_COMBINATION_OVERRIDDEN', issue.path,
            `${issue.message} Explicit fantastical override accepted for compilation.`,
            'Keep all outputs labeled non-physical-art-directed.',
            { originalCode: issue.code, reason: value.overrides.overrideReason, author: value.overrides.author },
          ));
        }
      } else {
        issues.push(...compatibility.issues);
      }
      warnings.push(...compatibility.warnings);
    }
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    warnings: Object.freeze(warnings),
  });
}

export function createHeroRockRecipe(lithologyId, options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  const lithology = catalog.lithologyById.get(lithologyId);
  if (!lithology) {
    throwForValidationIssues([
      validationIssue('LITHOLOGY_UNKNOWN', '$.lithology', `Unknown lithology “${lithologyId}”.`, 'Choose an identifier from ontology.v1.json.'),
    ]);
  }
  const hero = lithology.hero;
  const dimensions = options.targetDimensionsMetres ?? defaultDimensions(hero.scale);
  const maximumDimension = Math.max(...dimensions);
  const isDeposited = lithology.class === 'sedimentary' || lithology.tags.includes('deposited');
  const hasBedding = hero.fabrics.some((fabric) => BEDDING_FOR_FACTORY.has(fabric));
  const hasCooling = hero.fabrics.some((fabric) => ['cooling-columns', 'entablature'].includes(fabric));
  const isDetached = catalog.ontology.landforms.find((item) => item.id === hero.landform)?.tags.includes('detached') === true;
  const needsStability = STABILITY_LANDFORMS.has(hero.landform);
  const hasSalt = hero.processes.includes('salt-weathering');
  const hasKarst = hero.processes.includes('karst-dissolution') || ['karst-spire', 'cave-mouth'].includes(hero.landform);
  const hasTransportRounding = hero.processes.includes('transport-rounding');
  const hasFold = hero.fabrics.some((fabric) => ['folded-bedding', 'folded-foliation', 'drag-fold', 'crenulation'].includes(fabric))
    || hero.landform === 'folded-ridge';
  const isTalus = ['talus-fan', 'scree'].includes(hero.landform);
  const isSeaStack = hero.landform === 'sea-stack';
  const formationKind = isDeposited ? 'deposition' : lithology.class === 'metamorphic' ? 'metamorphism' : 'intrusion';
  const nodes = [
    { id: 'formation', kind: formationKind, order: 10 },
    ...(hasFold ? [{ id: 'deformation', kind: 'deformation', order: 20 }] : []),
    { id: 'fracture', kind: 'fracture', order: hasFold ? 21 : 20 },
    ...hero.processes.map((process, index) => ({
      id: `process-${String(index + 1).padStart(2, '0')}`,
      kind: process === 'faulting' ? 'deformation' : TRANSPORT_PROCESSES.has(process) ? 'transport' : 'weathering',
      order: 30 + index,
    })),
  ];
  const edges = nodes.slice(1).map((node, index) => ({
    before: nodes[index].id,
    after: node.id,
    relationship: 'precedes',
  }));
  const faultEvent = nodes.find((node) => node.id.startsWith('process-') && node.kind === 'deformation');
  if (faultEvent) {
    edges.push({ before: 'formation', after: faultEvent.id, relationship: 'offsets' });
  }
  const porosity = hasSalt ? 0.12 : lithology.tags.includes('porous') ? 0.18 : lithology.tags.includes('soluble-carbonate') ? 0.08 : 0.035;
  const formationId = `formation-${lithology.id}-v1`;
  const recipe = {
    schema: ROCK_RECIPE_SCHEMA,
    version: ROCK_RECIPE_VERSION,
    id: hero.id,
    label: `${titleCase(lithology.id)} — ${titleCase(hero.landform)}`,
    description: lithology.signature,
    formationId,
    hostLithology: hero.hostLithology ?? null,
    lithology: lithology.id,
    fabrics: [...hero.fabrics],
    processes: [...hero.processes],
    environment: hero.environment,
    landform: hero.landform,
    scale: hero.scale,
    targetDimensionsMetres: [...dimensions],
    geologyTransform: {
      originMetres: [0, 0, 0],
      strikeDegrees: lithology.class === 'sedimentary' ? 32 : lithology.class === 'metamorphic' ? 51 : 0,
      dipDegrees: lithology.class === 'sedimentary' ? 12 : lithology.class === 'metamorphic' ? 58 : 0,
      dipDirectionDegrees: lithology.class === 'sedimentary' ? 122 : lithology.class === 'metamorphic' ? 141 : 90,
    },
    materialProperties: {
      hardnessNormalized: lithology.tags.includes('soft') ? 0.28 : 0.72,
      porosityFraction: porosity,
      permeabilitySquareMetres: porosity >= 0.1 ? 0.000000000001 : 0.00000000000001,
      cementationNormalized: lithology.tags.includes('porous') ? 0.55 : 0.82,
      densityKilogramsPerCubicMetre: lithology.class === 'metamorphic' ? 2820 : lithology.class === 'igneous' ? 2720 : 2420,
    },
    chronology: { nodes, edges },
    depositionalHistory: isDeposited || hasBedding ? {
      environment: hero.environment,
      bedding: {
        strikeDegrees: 32,
        dipDegrees: 12,
        minimumThicknessMetres: round6(maximumDimension * 0.025),
        meanThicknessMetres: round6(maximumDimension * 0.06),
        maximumThicknessMetres: round6(maximumDimension * 0.14),
      },
      sortingNormalized: 0.62,
      clastRoundnessNormalized: 0.48,
      depositionDurationYears: 100000,
    } : null,
    metamorphicFabric: lithology.class === 'metamorphic' ? {
      fabricId: hero.fabrics.find((fabric) => METAMORPHIC_FABRICS_FOR_FACTORY.has(fabric)) ?? hero.fabrics[0],
      grade: 'medium',
      strikeDegrees: 51,
      dipDegrees: 58,
      spacingMetres: round6(maximumDimension * 0.045),
    } : null,
    fractureHistory: {
      sets: [{
        id: 'primary-discontinuities',
        kind: hasCooling ? 'cooling' : 'joint',
        meanStrikeDegrees: 36,
        meanDipDegrees: hasCooling ? 88 : 76,
        orientationConcentration: 18,
        spacingMetres: round6(maximumDimension * 0.08),
        persistenceMetres: round6(maximumDimension * 0.65),
        apertureMetres: round6(Math.max(0.002, maximumDimension * 0.00015)),
        roughnessMetres: round6(Math.max(0.001, maximumDimension * 0.00008)),
        chronologyNodeId: 'fracture',
        sizeDistribution: {
          type: 'lognormal',
          minimumMetres: round6(maximumDimension * 0.08),
          meanMetres: round6(maximumDimension * 0.32),
          maximumMetres: round6(maximumDimension * 0.9),
          standardDeviationNormalized: 0.35,
        },
      }],
    },
    weathering: {
      processes: [...hero.processes],
      exposureYears: hasSalt ? 40000 : 60000,
      moistureNormalized: ['humid', 'coastal', 'fluvial'].includes(hero.environment) ? 0.78 : 0.32,
      thermalCyclesPerYear: ['arid', 'semi-arid'].includes(hero.environment) ? 300 : 80,
      freezeThawCyclesPerYear: ['alpine', 'glacial', 'periglacial'].includes(hero.environment) ? 90 : 8,
    },
    processContext: {
      coolingBoundary: hasCooling ? 'flow-top' : null,
      waterRoutingNormalized: hasKarst ? 0.75 : 0,
      saltExposureNormalized: hasSalt ? 0.7 : 0,
      transportDistanceMetres: hasTransportRounding ? 12000 : 0,
      detached: isDetached || hasTransportRounding,
      sourceFormationId: isTalus ? formationId : null,
      sourceLithology: isTalus ? lithology.id : null,
      parentCoastId: isSeaStack ? `coast-${lithology.id}-v1` : null,
      collapseStage: isSeaStack ? 'stack' : null,
      stability: {
        mode: needsStability ? 'support-graph' : 'not-required',
        passed: needsStability,
      },
    },
    qualityTier: options.qualityTier ?? 'hero',
    seed: options.seed ?? 1001,
    seedNamespaces: Object.fromEntries(ROCK_SEED_NAMESPACES.map((name) => [name, `${name}/v1`])),
    overrides: {
      allowFantasticalOverride: false,
      overrideReason: '',
      author: '',
    },
  };
  return parseRockRecipe(recipe, { catalog }).recipe;
}

function ontologyMembership(value, catalog, issues) {
  membership(value.lithology, catalog.ids.lithology, '$.lithology', 'lithology', issues);
  if (value.hostLithology !== null) membership(value.hostLithology, catalog.ids.lithology, '$.hostLithology', 'lithology', issues);
  value.fabrics.forEach((item, index) => membership(item, catalog.ids.fabric, `$.fabrics[${index}]`, 'fabric', issues));
  value.processes.forEach((item, index) => membership(item, catalog.ids.process, `$.processes[${index}]`, 'process', issues));
  value.weathering.processes.forEach((item, index) => membership(item, catalog.ids.process, `$.weathering.processes[${index}]`, 'process', issues));
  membership(value.environment, catalog.ids.environment, '$.environment', 'environment', issues);
  membership(value.landform, catalog.ids.landform, '$.landform', 'landform', issues);
  membership(value.scale, catalog.ids.scale, '$.scale', 'scale', issues);
  if (value.depositionalHistory) membership(value.depositionalHistory.environment, catalog.ids.environment, '$.depositionalHistory.environment', 'environment', issues);
  if (value.metamorphicFabric) membership(value.metamorphicFabric.fabricId, catalog.ids.fabric, '$.metamorphicFabric.fabricId', 'fabric', issues);
  if (value.processContext.sourceLithology !== null) membership(value.processContext.sourceLithology, catalog.ids.lithology, '$.processContext.sourceLithology', 'lithology', issues);
}

function validateClassRequirements(value, catalog, issues) {
  const rockClass = catalog.lithologyById.get(value.lithology)?.class;
  if (rockClass === 'sedimentary' && value.depositionalHistory === null) {
    issues.push(validationIssue('DEPOSITIONAL_HISTORY_REQUIRED', '$.depositionalHistory', 'Sedimentary recipes require explicit depositional history.', 'Provide bedding, sorting, roundness, environment, and deposition duration in SI units.'));
  }
  if (rockClass === 'metamorphic' && value.metamorphicFabric === null) {
    issues.push(validationIssue('METAMORPHIC_FABRIC_REQUIRED', '$.metamorphicFabric', 'Metamorphic recipes require explicit metamorphic fabric.', 'Provide fabric, grade, orientation, and spacing.'));
  }
  if (rockClass !== 'metamorphic' && value.metamorphicFabric !== null) {
    issues.push(validationIssue('METAMORPHIC_FABRIC_FORBIDDEN', '$.metamorphicFabric', 'Non-metamorphic recipes cannot declare metamorphicFabric.', 'Set metamorphicFabric to null or choose a metamorphic lithology.'));
  }
  const scale = catalog.ontology.scales.find((item) => item.id === value.scale);
  const maximumDimension = Math.max(...value.targetDimensionsMetres);
  if (scale && (maximumDimension < scale.typicalMetres[0] || maximumDimension > scale.typicalMetres[1])) {
    issues.push(validationIssue(
      'TARGET_DIMENSIONS_SCALE_MISMATCH',
      '$.targetDimensionsMetres',
      `Maximum target dimension ${maximumDimension} m is outside the ${scale.id} range ${scale.typicalMetres[0]}–${scale.typicalMetres[1]} m.`,
      'Choose the matching ontology scale or change targetDimensionsMetres and regenerate/rebake.',
    ));
  }
}

function validateGeologyTransform(value, issues) {
  if (!objectWithKeys(value, ['originMetres', 'strikeDegrees', 'dipDegrees', 'dipDirectionDegrees'], '$.geologyTransform', issues)) return;
  vector(value.originMetres, '$.geologyTransform.originMetres', issues, { minimum: -10000000, maximum: 10000000 });
  numberRange(value.strikeDegrees, '$.geologyTransform.strikeDegrees', issues, 0, 360, { maximumExclusive: true });
  numberRange(value.dipDegrees, '$.geologyTransform.dipDegrees', issues, 0, 90);
  numberRange(value.dipDirectionDegrees, '$.geologyTransform.dipDirectionDegrees', issues, 0, 360, { maximumExclusive: true });
}

function validateMaterialProperties(value, issues) {
  const path = '$.materialProperties';
  if (!objectWithKeys(value, ['hardnessNormalized', 'porosityFraction', 'permeabilitySquareMetres', 'cementationNormalized', 'densityKilogramsPerCubicMetre'], path, issues)) return;
  numberRange(value.hardnessNormalized, `${path}.hardnessNormalized`, issues, 0, 1);
  numberRange(value.porosityFraction, `${path}.porosityFraction`, issues, 0, 1, { maximumExclusive: true });
  numberRange(value.permeabilitySquareMetres, `${path}.permeabilitySquareMetres`, issues, 0, 1, { minimumExclusive: true });
  numberRange(value.cementationNormalized, `${path}.cementationNormalized`, issues, 0, 1);
  numberRange(value.densityKilogramsPerCubicMetre, `${path}.densityKilogramsPerCubicMetre`, issues, 100, 8000);
}

function validateChronology(value, issues) {
  const path = '$.chronology';
  if (!objectWithKeys(value, ['nodes', 'edges'], path, issues)) return;
  if (!arrayRange(value.nodes, `${path}.nodes`, issues, 1)) return;
  if (!arrayRange(value.edges, `${path}.edges`, issues, 0)) return;
  const nodeIds = new Set();
  const orders = new Map();
  value.nodes.forEach((node, index) => {
    const nodePath = `${path}.nodes[${index}]`;
    if (!objectWithKeys(node, ['id', 'kind', 'order'], nodePath, issues)) return;
    identifier(node.id, `${nodePath}.id`, issues);
    enumValue(node.kind, CHRONOLOGY_KINDS, `${nodePath}.kind`, issues);
    integerRange(node.order, `${nodePath}.order`, issues, 0, 1000000);
    if (nodeIds.has(node.id)) issues.push(validationIssue('CHRONOLOGY_NODE_DUPLICATE', `${nodePath}.id`, `Chronology node “${node.id}” is duplicated.`, 'Use stable unique event identifiers.'));
    nodeIds.add(node.id);
    orders.set(node.id, node.order);
  });
  const adjacency = new Map([...nodeIds].map((id) => [id, []]));
  value.edges.forEach((edge, index) => {
    const edgePath = `${path}.edges[${index}]`;
    if (!objectWithKeys(edge, ['before', 'after', 'relationship'], edgePath, issues)) return;
    identifier(edge.before, `${edgePath}.before`, issues);
    identifier(edge.after, `${edgePath}.after`, issues);
    enumValue(edge.relationship, CHRONOLOGY_RELATIONSHIPS, `${edgePath}.relationship`, issues);
    if (!nodeIds.has(edge.before) || !nodeIds.has(edge.after)) {
      issues.push(validationIssue('CHRONOLOGY_EDGE_DANGLING', edgePath, 'Chronology edge references a node that does not exist.', 'Reference declared node identifiers only.', { before: edge.before, after: edge.after }));
      return;
    }
    adjacency.get(edge.before).push(edge.after);
    if (orders.get(edge.before) >= orders.get(edge.after)) {
      issues.push(validationIssue('CHRONOLOGY_ORDER_CONFLICT', edgePath, 'Chronology edge conflicts with numeric event order.', 'Set the before node to a lower order than the after node.'));
    }
  });
  if (hasDirectedCycle(adjacency)) issues.push(validationIssue('CHRONOLOGY_CYCLE', path, 'Chronology graph contains a cycle.', 'Remove circular event dependencies; geologic time order must be acyclic.'));
}

function validateDepositionalHistory(value, issues) {
  const path = '$.depositionalHistory';
  if (value === null) return;
  if (!objectWithKeys(value, ['environment', 'bedding', 'sortingNormalized', 'clastRoundnessNormalized', 'depositionDurationYears'], path, issues)) return;
  identifier(value.environment, `${path}.environment`, issues);
  if (objectWithKeys(value.bedding, ['strikeDegrees', 'dipDegrees', 'minimumThicknessMetres', 'meanThicknessMetres', 'maximumThicknessMetres'], `${path}.bedding`, issues)) {
    numberRange(value.bedding.strikeDegrees, `${path}.bedding.strikeDegrees`, issues, 0, 360, { maximumExclusive: true });
    numberRange(value.bedding.dipDegrees, `${path}.bedding.dipDegrees`, issues, 0, 90);
    numberRange(value.bedding.minimumThicknessMetres, `${path}.bedding.minimumThicknessMetres`, issues, 0, 5000, { minimumExclusive: true });
    numberRange(value.bedding.meanThicknessMetres, `${path}.bedding.meanThicknessMetres`, issues, 0, 5000, { minimumExclusive: true });
    numberRange(value.bedding.maximumThicknessMetres, `${path}.bedding.maximumThicknessMetres`, issues, 0, 5000, { minimumExclusive: true });
    if (Number.isFinite(value.bedding.minimumThicknessMetres) && Number.isFinite(value.bedding.meanThicknessMetres) && Number.isFinite(value.bedding.maximumThicknessMetres)
      && !(value.bedding.minimumThicknessMetres <= value.bedding.meanThicknessMetres && value.bedding.meanThicknessMetres <= value.bedding.maximumThicknessMetres)) {
      issues.push(validationIssue('BED_THICKNESS_ORDER_INVALID', `${path}.bedding`, 'Bed thickness must satisfy minimum ≤ mean ≤ maximum.', 'Correct the explicit metre values; the compiler will not reorder them.'));
    }
  }
  numberRange(value.sortingNormalized, `${path}.sortingNormalized`, issues, 0, 1);
  numberRange(value.clastRoundnessNormalized, `${path}.clastRoundnessNormalized`, issues, 0, 1);
  numberRange(value.depositionDurationYears, `${path}.depositionDurationYears`, issues, 0, 10000000000, { minimumExclusive: true });
}

function validateMetamorphicFabric(value, issues) {
  const path = '$.metamorphicFabric';
  if (value === null) return;
  if (!objectWithKeys(value, ['fabricId', 'grade', 'strikeDegrees', 'dipDegrees', 'spacingMetres'], path, issues)) return;
  identifier(value.fabricId, `${path}.fabricId`, issues);
  enumValue(value.grade, METAMORPHIC_GRADES, `${path}.grade`, issues);
  numberRange(value.strikeDegrees, `${path}.strikeDegrees`, issues, 0, 360, { maximumExclusive: true });
  numberRange(value.dipDegrees, `${path}.dipDegrees`, issues, 0, 90);
  numberRange(value.spacingMetres, `${path}.spacingMetres`, issues, 0, 5000, { minimumExclusive: true });
}

function validateFractureHistory(value, issues) {
  const path = '$.fractureHistory';
  if (!objectWithKeys(value, ['sets'], path, issues) || !arrayRange(value.sets, `${path}.sets`, issues, 1)) return;
  const ids = new Set();
  value.sets.forEach((set, index) => {
    const setPath = `${path}.sets[${index}]`;
    if (!objectWithKeys(set, ['id', 'kind', 'meanStrikeDegrees', 'meanDipDegrees', 'orientationConcentration', 'spacingMetres', 'persistenceMetres', 'apertureMetres', 'roughnessMetres', 'chronologyNodeId', 'sizeDistribution'], setPath, issues)) return;
    identifier(set.id, `${setPath}.id`, issues);
    if (ids.has(set.id)) issues.push(validationIssue('FRACTURE_SET_DUPLICATE', `${setPath}.id`, `Fracture set “${set.id}” is duplicated.`, 'Use unique stable identifiers.'));
    ids.add(set.id);
    enumValue(set.kind, FRACTURE_KINDS, `${setPath}.kind`, issues);
    numberRange(set.meanStrikeDegrees, `${setPath}.meanStrikeDegrees`, issues, 0, 360, { maximumExclusive: true });
    numberRange(set.meanDipDegrees, `${setPath}.meanDipDegrees`, issues, 0, 90);
    numberRange(set.orientationConcentration, `${setPath}.orientationConcentration`, issues, 0, 1000000);
    numberRange(set.spacingMetres, `${setPath}.spacingMetres`, issues, 0, 5000, { minimumExclusive: true });
    numberRange(set.persistenceMetres, `${setPath}.persistenceMetres`, issues, 0, 5000, { minimumExclusive: true });
    numberRange(set.apertureMetres, `${setPath}.apertureMetres`, issues, 0, 5000);
    numberRange(set.roughnessMetres, `${setPath}.roughnessMetres`, issues, 0, 5000);
    identifier(set.chronologyNodeId, `${setPath}.chronologyNodeId`, issues);
    validateSizeDistribution(set.sizeDistribution, `${setPath}.sizeDistribution`, issues);
  });
}

function validateSizeDistribution(value, path, issues) {
  if (!objectWithKeys(value, ['type', 'minimumMetres', 'meanMetres', 'maximumMetres', 'standardDeviationNormalized'], path, issues)) return;
  enumValue(value.type, SIZE_DISTRIBUTIONS, `${path}.type`, issues);
  numberRange(value.minimumMetres, `${path}.minimumMetres`, issues, 0, 5000, { minimumExclusive: true });
  numberRange(value.meanMetres, `${path}.meanMetres`, issues, 0, 5000, { minimumExclusive: true });
  numberRange(value.maximumMetres, `${path}.maximumMetres`, issues, 0, 5000, { minimumExclusive: true });
  numberRange(value.standardDeviationNormalized, `${path}.standardDeviationNormalized`, issues, 0, 10);
  if (Number.isFinite(value.minimumMetres) && Number.isFinite(value.meanMetres) && Number.isFinite(value.maximumMetres)
    && !(value.minimumMetres <= value.meanMetres && value.meanMetres <= value.maximumMetres)) {
    issues.push(validationIssue('SIZE_DISTRIBUTION_ORDER_INVALID', path, 'Size distribution must satisfy minimum ≤ mean ≤ maximum.', 'Correct the explicit metre values; the compiler will not reorder them.'));
  }
}

function validateWeathering(value, issues) {
  const path = '$.weathering';
  if (!objectWithKeys(value, ['processes', 'exposureYears', 'moistureNormalized', 'thermalCyclesPerYear', 'freezeThawCyclesPerYear'], path, issues)) return;
  identifierArray(value.processes, `${path}.processes`, issues, { minimum: 1 });
  numberRange(value.exposureYears, `${path}.exposureYears`, issues, 0, 10000000000);
  numberRange(value.moistureNormalized, `${path}.moistureNormalized`, issues, 0, 1);
  numberRange(value.thermalCyclesPerYear, `${path}.thermalCyclesPerYear`, issues, 0, 1000000);
  numberRange(value.freezeThawCyclesPerYear, `${path}.freezeThawCyclesPerYear`, issues, 0, 1000000);
}

function validateProcessContext(value, issues) {
  const path = '$.processContext';
  if (!objectWithKeys(value, ['coolingBoundary', 'waterRoutingNormalized', 'saltExposureNormalized', 'transportDistanceMetres', 'detached', 'sourceFormationId', 'sourceLithology', 'parentCoastId', 'collapseStage', 'stability'], path, issues)) return;
  nullableEnum(value.coolingBoundary, ['flow-top', 'flow-base', 'intrusion-contact'], `${path}.coolingBoundary`, issues);
  numberRange(value.waterRoutingNormalized, `${path}.waterRoutingNormalized`, issues, 0, 1);
  numberRange(value.saltExposureNormalized, `${path}.saltExposureNormalized`, issues, 0, 1);
  numberRange(value.transportDistanceMetres, `${path}.transportDistanceMetres`, issues, 0, 100000000);
  booleanValue(value.detached, `${path}.detached`, issues);
  nullableIdentifier(value.sourceFormationId, `${path}.sourceFormationId`, issues);
  nullableIdentifier(value.sourceLithology, `${path}.sourceLithology`, issues);
  nullableIdentifier(value.parentCoastId, `${path}.parentCoastId`, issues);
  nullableEnum(value.collapseStage, COLLAPSE_STAGES, `${path}.collapseStage`, issues);
  if (objectWithKeys(value.stability, ['mode', 'passed'], `${path}.stability`, issues)) {
    enumValue(value.stability.mode, STABILITY_MODES, `${path}.stability.mode`, issues);
    booleanValue(value.stability.passed, `${path}.stability.passed`, issues);
  }
}

function validateSeedNamespaces(value, issues) {
  const path = '$.seedNamespaces';
  if (!objectWithKeys(value, ROCK_SEED_NAMESPACES, path, issues)) return;
  const seen = new Set();
  for (const name of ROCK_SEED_NAMESPACES) {
    nonEmptyString(value[name], `${path}.${name}`, issues, 120);
    if (seen.has(value[name])) issues.push(validationIssue('SEED_NAMESPACE_DUPLICATE', `${path}.${name}`, `Seed namespace “${value[name]}” is duplicated.`, 'Each random stage must have an independent namespace.'));
    seen.add(value[name]);
  }
}

function validateOverrides(value, issues) {
  const path = '$.overrides';
  if (!objectWithKeys(value, ['allowFantasticalOverride', 'overrideReason', 'author'], path, issues)) return;
  booleanValue(value.allowFantasticalOverride, `${path}.allowFantasticalOverride`, issues);
  if (typeof value.overrideReason !== 'string') typeIssue(`${path}.overrideReason`, 'string', value.overrideReason, issues);
  if (typeof value.author !== 'string') typeIssue(`${path}.author`, 'string', value.author, issues);
  if (value.allowFantasticalOverride === true) {
    nonEmptyString(value.overrideReason, `${path}.overrideReason`, issues, 500);
    nonEmptyString(value.author, `${path}.author`, issues, 120);
  } else if (value.overrideReason !== '' || value.author !== '') {
    issues.push(validationIssue('OVERRIDE_METADATA_WITHOUT_FLAG', path, 'Override reason and author require allowFantasticalOverride=true.', 'Clear both fields or explicitly enable the override.'));
  }
}

function exactKeys(value, expected, path, issues) {
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0) issues.push(validationIssue('FIELD_REQUIRED', path, `Missing required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`, 'Provide every schema v1 field explicitly; defaults are applied only by named authoring helpers.', { missing }));
  if (unknown.length > 0) issues.push(validationIssue('FIELD_UNKNOWN', path, `Unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`, 'Remove unknown fields or migrate the document with a supported migration.', { unknown }));
}

function objectWithKeys(value, keys, path, issues) {
  if (!isPlainObject(value)) {
    typeIssue(path, 'plain object', value, issues);
    return false;
  }
  exactKeys(value, keys, path, issues);
  return true;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactValue(value, expected, path, issues) {
  if (value !== expected) issues.push(validationIssue('VALUE_UNSUPPORTED', path, `Expected ${JSON.stringify(expected)} but received ${JSON.stringify(value)}.`, 'Use the exact schema identifier and supported version.'));
}

function identifier(value, path, issues) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value) || value.length > 120) {
    issues.push(validationIssue('IDENTIFIER_INVALID', path, 'Expected a lowercase kebab-case identifier no longer than 120 characters.', 'Use letters, digits, and internal hyphens only.', { received: value }));
  }
}

function nullableIdentifier(value, path, issues) {
  if (value !== null) identifier(value, path, issues);
}

function nonEmptyString(value, path, issues, maximumLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximumLength) {
    issues.push(validationIssue('STRING_INVALID', path, `Expected a non-empty string no longer than ${maximumLength} characters.`, 'Provide an explicit human-readable value.', { received: value }));
  }
}

function identifierArray(value, path, issues, options = {}) {
  if (!arrayRange(value, path, issues, options.minimum ?? 0)) return;
  const seen = new Set();
  value.forEach((item, index) => {
    identifier(item, `${path}[${index}]`, issues);
    if (seen.has(item)) issues.push(validationIssue('ARRAY_VALUE_DUPLICATE', `${path}[${index}]`, `Identifier “${item}” is duplicated.`, 'Remove duplicate declarations.'));
    seen.add(item);
  });
}

function arrayRange(value, path, issues, minimum) {
  if (!Array.isArray(value)) {
    typeIssue(path, 'array', value, issues);
    return false;
  }
  if (value.length < minimum) issues.push(validationIssue('ARRAY_TOO_SHORT', path, `Expected at least ${minimum} item${minimum === 1 ? '' : 's'}.`, 'Provide the required explicit entries.'));
  return true;
}

function vector(value, path, issues, options) {
  if (!Array.isArray(value) || value.length !== 3) {
    issues.push(validationIssue('VECTOR3_REQUIRED', path, 'Expected exactly three numeric components.', 'Provide [x, y, z] in the unit named by the field.'));
    return;
  }
  value.forEach((item, index) => numberRange(item, `${path}[${index}]`, issues, options.minimum ?? options.minimumExclusive, options.maximum, { minimumExclusive: options.minimumExclusive !== undefined }));
}

function numberRange(value, path, issues, minimum, maximum, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    typeIssue(path, 'finite non-negative-zero number', value, issues);
    return;
  }
  const below = options.minimumExclusive ? value <= minimum : value < minimum;
  const above = options.maximumExclusive ? value >= maximum : value > maximum;
  if (below || above) {
    const minSymbol = options.minimumExclusive ? '>' : '≥';
    const maxSymbol = options.maximumExclusive ? '<' : '≤';
    issues.push(validationIssue('NUMBER_OUT_OF_RANGE', path, `Expected ${minSymbol} ${minimum} and ${maxSymbol} ${maximum}; received ${value}.`, 'Use an explicit value within the documented unit/range.'));
  }
}

function integerRange(value, path, issues, minimum, maximum) {
  if (!Number.isInteger(value)) {
    typeIssue(path, 'integer', value, issues);
    return;
  }
  if (value < minimum || value > maximum) issues.push(validationIssue('INTEGER_OUT_OF_RANGE', path, `Expected integer from ${minimum} through ${maximum}; received ${value}.`, 'Use an integer within the documented range.'));
}

function enumValue(value, candidates, path, issues) {
  const allowed = candidates instanceof Set ? candidates : new Set(candidates);
  if (!allowed.has(value)) issues.push(validationIssue('ENUM_VALUE_INVALID', path, `Unsupported value ${JSON.stringify(value)}.`, `Choose one of: ${[...allowed].join(', ')}.`));
}

function nullableEnum(value, candidates, path, issues) {
  if (value !== null) enumValue(value, candidates, path, issues);
}

function booleanValue(value, path, issues) {
  if (typeof value !== 'boolean') typeIssue(path, 'boolean', value, issues);
}

function typeIssue(path, expected, received, issues) {
  issues.push(validationIssue('TYPE_INVALID', path, `Expected ${expected}.`, 'Supply the exact JSON type; values are not coerced.', { received, receivedType: received === null ? 'null' : typeof received }));
}

function membership(value, candidates, path, type, issues) {
  if (!candidates.has(value)) issues.push(validationIssue(`${type.toUpperCase()}_UNKNOWN`, path, `Unknown ${type} “${value}”.`, `Choose a ${type} identifier from ontology.v1.json.`));
}

function hasDirectedCycle(adjacency) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

function defaultDimensions(scale) {
  return {
    prop: [2, 1.4, 1.2],
    outcrop: [24, 16, 18],
    module: [96, 48, 64],
    formation: [640, 360, 520],
  }[scale];
}

function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}

function titleCase(value) {
  return value.split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(' ');
}

const BEDDING_FOR_FACTORY = new Set([
  'laminated', 'planar-bedding', 'thin-bedding', 'medium-bedding', 'thick-bedding',
  'very-thick-bedding', 'cross-bedding', 'graded-bedding', 'folded-bedding',
]);
const METAMORPHIC_FABRICS_FOR_FACTORY = new Set([
  'slaty-cleavage', 'phyllitic-foliation', 'schistosity', 'crenulation', 'gneissic-banding',
  'migmatitic-banding', 'folded-foliation', 'lineation', 'boudinage', 'shear-foliation',
  'mylonitic-foliation',
]);
const TRANSPORT_PROCESSES = new Set([
  'rockfall', 'collapse', 'transport-rounding', 'sorting', 'imbrication', 'burial', 'talus-deposition',
]);
