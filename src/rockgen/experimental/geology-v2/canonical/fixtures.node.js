import { loadGeologyCatalog } from '../catalog.node.js';
import { createHeroRockRecipe, parseRockRecipe } from '../recipe.node.js';
import { validateEditableSourcePackage } from './sourcePackage.node.js';

function rescaleRecipe(recipe, dimensions) {
  const ratio = Math.max(...dimensions) / Math.max(...recipe.targetDimensionsMetres);
  recipe.targetDimensionsMetres = [...dimensions];
  if (recipe.depositionalHistory) {
    recipe.depositionalHistory.bedding.minimumThicknessMetres *= ratio;
    recipe.depositionalHistory.bedding.meanThicknessMetres *= ratio;
    recipe.depositionalHistory.bedding.maximumThicknessMetres *= ratio;
  }
  if (recipe.metamorphicFabric) recipe.metamorphicFabric.spacingMetres *= ratio;
  for (const set of recipe.fractureHistory.sets) {
    set.spacingMetres *= ratio;
    set.persistenceMetres *= ratio;
    set.apertureMetres *= ratio;
    set.roughnessMetres *= ratio;
    set.sizeDistribution.minimumMetres *= ratio;
    set.sizeDistribution.meanMetres *= ratio;
    set.sizeDistribution.maximumMetres *= ratio;
  }
}

function makeRecipe({ dimensions, id, landform, lithology, scale, seed, stability = false }, catalog) {
  const recipe = structuredClone(createHeroRockRecipe(lithology, { catalog, qualityTier: 'hero', seed }));
  rescaleRecipe(recipe, dimensions);
  recipe.id = id;
  recipe.label = `C8 authored canonical — ${id}`;
  recipe.description = `${recipe.description}; independent editable-source morphology pilot.`;
  recipe.landform = landform;
  recipe.scale = scale;
  if (stability) {
    recipe.processContext.stability = { mode: 'support-graph', passed: true };
    recipe.processContext.collapseStage = 'arch';
  }
  return parseRockRecipe(recipe, { catalog }).recipe;
}

function box(id, role, centerMetres, halfExtentsMetres, rotationDegrees, options = {}) {
  return {
    centerMetres,
    halfExtentsMetres,
    id,
    kind: 'rounded-box',
    operation: options.operation ?? 'union',
    role,
    rotationDegrees,
    roundingMetres: options.roundingMetres ?? Math.min(...halfExtentsMetres) * 0.14,
    smoothingMetres: options.smoothingMetres ?? 0,
  };
}

function ellipsoid(id, role, centerMetres, radiiMetres, rotationDegrees, options = {}) {
  return {
    centerMetres,
    id,
    kind: 'ellipsoid',
    operation: options.operation ?? 'union',
    radiiMetres,
    role,
    rotationDegrees,
    smoothingMetres: options.smoothingMetres ?? 0,
  };
}

function superellipsoid(id, role, centerMetres, radiiMetres, rotationDegrees, exponent, options = {}) {
  return {
    centerMetres,
    exponent,
    id,
    kind: 'superellipsoid',
    operation: options.operation ?? 'union',
    radiiMetres,
    role,
    rotationDegrees,
    smoothingMetres: options.smoothingMetres ?? 0,
  };
}

function extrudedPolygon(id, role, centerMetres, verticesMetres, halfDepthMetres, rotationDegrees, options = {}) {
  return {
    centerMetres,
    halfDepthMetres,
    id,
    kind: 'extruded-polygon',
    operation: options.operation ?? 'union',
    role,
    rotationDegrees,
    smoothingMetres: options.smoothingMetres ?? 0,
    verticesMetres,
  };
}

function polygonalLoft(id, role, centerMetres, levels, rotationDegrees, options = {}) {
  return {
    centerMetres,
    id,
    kind: 'polygonal-loft',
    levels,
    operation: options.operation ?? 'union',
    role,
    rotationDegrees,
    smoothingMetres: options.smoothingMetres ?? 0,
  };
}

function tapered(id, role, centerMetres, halfHeightMetres, baseRadiiMetres, topRadiiMetres, rotationDegrees, options = {}) {
  return {
    baseRadiiMetres,
    centerMetres,
    halfHeightMetres,
    id,
    kind: 'tapered-column',
    operation: options.operation ?? 'union',
    role,
    rotationDegrees,
    smoothingMetres: options.smoothingMetres ?? 0,
    topRadiiMetres,
  };
}

function taperedBox(id, role, centerMetres, halfHeightMetres, bottomHalfExtentsMetres, topHalfExtentsMetres, topOffsetMetres, rotationDegrees, options = {}) {
  return {
    bottomHalfExtentsMetres,
    centerMetres,
    halfHeightMetres,
    id,
    kind: 'tapered-box',
    operation: options.operation ?? 'union',
    role,
    rotationDegrees,
    roundingMetres: options.roundingMetres ?? Math.min(halfHeightMetres, ...bottomHalfExtentsMetres, ...topHalfExtentsMetres) * 0.12,
    smoothingMetres: options.smoothingMetres ?? 0,
    topHalfExtentsMetres,
    topOffsetMetres,
  };
}

function profiled(id, role, centerMetres, levels, rotationDegrees, options = {}) {
  return {
    centerMetres,
    id,
    kind: 'profiled-column',
    levels,
    operation: options.operation ?? 'union',
    role,
    rotationDegrees,
    roundingMetres: options.roundingMetres ?? 0.2,
    smoothingMetres: options.smoothingMetres ?? 0,
  };
}

function plane(normal, offsetMetres, widthMetres, strength) {
  return { normal, offsetMetres, strength, widthMetres };
}

const HOODOO_PROVIDER_TO_CANONICAL_SCALE = 1.5625;

const HOODOO_SECTION_PATTERN = Object.freeze([
  [-0.96, -0.34], [-0.7, -0.84], [-0.14, -1.0], [0.48, -0.91], [0.94, -0.48],
  [1.0, 0.12], [0.72, 0.72], [0.18, 0.98], [-0.46, 0.9], [-0.91, 0.48],
]);

function hoodooLoftLevel(halfExtentsMetres, offsetMetres, yMetres, morphologyZone, phase) {
  const verticesMetres = HOODOO_SECTION_PATTERN.map(([x, z], index) => {
    const radialVariation = 1 + Math.sin(index * 1.73 + phase) * 0.045;
    return [
      (offsetMetres[0] + x * halfExtentsMetres[0] * radialVariation) * HOODOO_PROVIDER_TO_CANONICAL_SCALE,
      (offsetMetres[1] + z * halfExtentsMetres[1] * radialVariation) * HOODOO_PROVIDER_TO_CANONICAL_SCALE,
    ];
  });
  return {
    morphologyZone,
    verticesMetres,
    yMetres: yMetres * HOODOO_PROVIDER_TO_CANONICAL_SCALE,
  };
}

const SHAPE_RATIONALES = Object.freeze({
  'rock-v2-tor-block-pile-001': Object.freeze([
    {
      featureId: 'joint-derived-block-hierarchy',
      rationale: 'The silhouette is built from unequal residual blocks because the NPS tor examples preserve large joint-bounded masses rather than one inflated blob.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Granite tors at Serpentine Hot Springs',
      referenceUrl: 'https://www.nps.gov/articles/000/geology-of-serpentine-hot-springs.htm',
    },
    {
      featureId: 'deep-cross-cutting-joints',
      rationale: 'Deep finite clefts separate major masses and terminate inside the tor, matching the visible joint control in the reference rather than decorative surface cracks.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Granite tors at Serpentine Hot Springs',
      referenceUrl: 'https://www.nps.gov/articles/000/geology-of-serpentine-hot-springs.htm',
    },
    {
      featureId: 'bedrock-connected-base',
      rationale: 'The broad continuous base keeps the pile recognizable as an in-place erosional residual instead of a gravity-deposited heap of detached boulders.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Granite tors at Serpentine Hot Springs',
      referenceUrl: 'https://www.nps.gov/articles/000/geology-of-serpentine-hot-springs.htm',
    },
  ]),
  'rock-v2-pillar-residual-001': Object.freeze([
    {
      featureId: 'slender-quartz-sandstone-shaft',
      rationale: 'The main mass stays vertically dominant with an irregular shaft because the approved Wulingyuan panorama shows narrow quartz-sandstone residual pillars, not limestone cones.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Wulingyuan quartzite sandstone pillars panorama',
      referenceUrl: 'https://commons.wikimedia.org/wiki/File:1_zhangjiajie_huangshizhai_wulingyuan_panorama_2012.jpg',
    },
    {
      featureId: 'continuous-base-body-crown',
      rationale: 'UNESCO describes Wulingyuan as narrow quartz-sandstone columns and peaks, supporting one continuous erosional mass with readable base, shaft, and crown.',
      referenceKind: 'approved-geology-authority',
      referenceLabel: 'UNESCO — Wulingyuan Scenic and Historic Interest Area',
      referenceUrl: 'https://whc.unesco.org/en/list/640/',
    },
    {
      featureId: 'landmark-ledge-composition',
      geologyOverrideAllowed: false,
      rationale: 'Liyue contributes only the dramatic ledge hierarchy and mist-readable composition; it cannot add unsupported masses, periodic bands, or change the sandstone geology.',
      referenceKind: 'art-direction',
      referenceLabel: 'Genshin Impact — Liyue/Jueyun Karst stone-forest composition',
      referenceUrl: 'https://www.hoyolab.com/article/10028',
    },
  ]),
  'rock-v2-arch-sandstone-001': Object.freeze([
    {
      featureId: 'asymmetric-through-opening',
      rationale: 'The opening and outer profile borrow their asymmetry from Delicate Arch instead of using a centered architectural doorway or a perfect mathematical ellipse.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Delicate Arch profile',
      referenceUrl: 'https://commons.wikimedia.org/wiki/File:Delicate_arch.jpg',
    },
    {
      featureId: 'jointed-fin-host',
      rationale: 'The retained host mass is treated as a sandstone fin because USGS identifies jointed sandstone fins as the precursor geometry from which openings develop.',
      referenceKind: 'approved-geology-authority',
      referenceLabel: 'USGS — Geology of Arches National Park',
      referenceUrl: 'https://www.usgs.gov/geology-and-ecology-of-national-parks/geology-arches-national-park',
    },
    {
      featureId: 'load-bearing-roof-and-abutments',
      rationale: 'The roof remains continuously supported by unequal abutments so erosion removes an opening without producing a separate capstone balanced on two columns.',
      referenceKind: 'approved-geology-authority',
      referenceLabel: 'USGS — Geology of Arches National Park',
      referenceUrl: 'https://www.usgs.gov/geology-and-ecology-of-national-parks/geology-arches-national-park',
    },
  ]),
  'rock-v2-cliff-module-straight-001': Object.freeze([
    {
      featureId: 'continuous-cliff-face',
      rationale: 'The module keeps an uninterrupted bedrock wall between crest and toe because the Zion reference is a continuous exposure, not a row of attached boulder props.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Sandstone cliff at Emerald Pools, Zion National Park',
      referenceUrl: 'https://www.usgs.gov/media/images/sandstone-cliff',
    },
    {
      featureId: 'partial-resistant-ledges',
      rationale: 'Major ledges cover only part of the face and terminate at gullies or buttresses, avoiding the non-geological appearance of evenly wrapped horizontal rings.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Sandstone cliff at Emerald Pools, Zion National Park',
      referenceUrl: 'https://www.usgs.gov/media/images/sandstone-cliff',
    },
    {
      featureId: 'buttress-gully-relief',
      rationale: 'Alternating projecting buttresses and recessed drainage gullies give the wall a plausible erosional face hierarchy while preserving module seam continuity.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Sandstone cliff at Emerald Pools, Zion National Park',
      referenceUrl: 'https://www.usgs.gov/media/images/sandstone-cliff',
    },
  ]),
  'rock-v2-mountain-modular-bedrock-001': Object.freeze([
    {
      featureId: 'dipping-stratified-silhouette',
      rationale: 'The mountain module must use a coherent dipping bed direction visible from crest to toe, following Mount Rundle rather than a tapered procedural cone.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Mount Rundle dipping layered mountain',
      referenceUrl: 'https://commons.wikimedia.org/wiki/File:Mount_Rundle.jpg',
    },
    {
      featureId: 'cliff-bench-hierarchy',
      rationale: 'Castle Mountain supports broad cliff bands, benches, and stepped buttresses at formation scale, with unequal spacing instead of decorative horizontal stripes.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Castle Mountain cliff-forming limestone hierarchy',
      referenceUrl: 'https://commons.wikimedia.org/wiki/File:Castle_mountain_2003.jpg',
    },
    {
      featureId: 'primary-secondary-tertiary-massing',
      rationale: 'Large bedrock slabs establish the peak and buttresses before smaller ledges and fractures, preserving the scale hierarchy readable in both mountain references.',
      referenceKind: 'approved-nature-image',
      referenceLabel: 'Mount Rundle dipping layered mountain',
      referenceUrl: 'https://commons.wikimedia.org/wiki/File:Mount_Rundle.jpg',
    },
  ]),
  'rock-v2-hoodoo-caprock-001': Object.freeze([
    {
      featureId: 'resistant-cap-over-narrow-shaft',
      rationale: "The cap is wider and asymmetric over a visibly narrower attached shaft because Thor's Hammer exhibits that defining caprock silhouette rather than a loose balanced boulder.",
      referenceKind: 'approved-nature-image',
      referenceLabel: "Thor's Hammer hoodoo",
      referenceUrl: 'https://commons.wikimedia.org/wiki/File:Thors_hammer_hoodoo.jpg',
    },
    {
      featureId: 'contrasting-resistance-profile',
      rationale: 'The authored profile narrows below the cap because NPS identifies protection by a more resistant cap over less resistant material as a controlling hoodoo mechanism.',
      referenceKind: 'approved-geology-authority',
      referenceLabel: 'NPS — Geodiversity Atlas: Cedar Breaks National Monument',
      referenceUrl: 'https://www.nps.gov/articles/nps-geodiversity-atlas-cedar-breaks-national-monument-utah.htm',
    },
    {
      featureId: 'irregular-bedded-column',
      rationale: 'Non-periodic setbacks and ledges replace equal horizontal rings because Bryce Canyon NPS attributes hoodoo development to differential weathering across variably resistant sedimentary layers.',
      referenceKind: 'approved-geology-authority',
      referenceLabel: 'NPS — Hoodoos at Bryce Canyon',
      referenceUrl: 'https://www.nps.gov/brca/learn/nature/hoodoos.htm',
    },
  ]),
});

function sourceBase({ controlProgram, dimensions, id, landmarks, providerBridge, semanticProgram, silhouetteTrace, subtypeId }) {
  const shapeRationale = SHAPE_RATIONALES[id];
  if (!shapeRationale) throw new RangeError(`Missing authored shape rationale for ${id}.`);
  return {
    controlProgram,
    identityLandmarks: landmarks,
    modifierStack: [],
    provenance: {
      existing480CatalogAsset: false,
      origin: 'toonlab-independent-authored-control-program',
      rights: 'ToonLab original source',
    },
    recipeId: `c8-authored-${id}`,
    schema: 'toonlab/editable-rock-source-package',
    semanticProgram,
    shapeRationale,
    ...(providerBridge ? { providerBridge } : {}),
    ...(silhouetteTrace ? { silhouetteTrace } : {}),
    sourceId: id,
    sourceRevision: 1,
    subtypeId,
    targetDimensionsMetres: dimensions,
    unit: 'metre',
    version: 1,
  };
}

const DEFINITIONS = [
  {
    id: 'rock-v2-tor-block-pile-001',
    label: 'Granite block-pile tor 001',
    recipe: { dimensions: [11, 10, 8], landform: 'tor', lithology: 'granite', scale: 'outcrop', seed: 310001 },
    source: sourceBase({
      id: 'rock-v2-tor-block-pile-001',
      subtypeId: 'tor-block-pile',
      dimensions: [11, 10, 8],
      controlProgram: {
        macroRoughness: { amplitudeMetres: 0.045, frequencyCyclesPerMetre: 0.42, seed: 410001 },
        primitives: [
          extrudedPolygon('tor-silhouette', 'base', [0, -0.05, -0.35], [
            [-4.8, -4.35], [-4.35, -2.45], [-3.5, -1.55], [-3.15, 0.2], [-2.35, 0.95],
            [-2.55, 2.1], [-1.6, 3.55], [-0.5, 4.18], [0.72, 4.0], [1.12, 3.15],
            [2.18, 2.72], [2.55, 1.45], [3.4, 0.82], [3.28, -0.55], [4.25, -1.42], [4.7, -4.35],
          ], 2.7, [0, -4, 0], { smoothingMetres: 0.08 }),
          superellipsoid('tor-lower-left', 'joint-block', [-1.85, -2.7, 1.25], [2.45, 1.55, 1.62], [4, -10, -4], 3.2, { smoothingMetres: 0.06 }),
          superellipsoid('tor-lower-right', 'joint-block', [2.05, -2.45, 0.75], [1.95, 1.42, 1.5], [-3, 8, 5], 3.5, { smoothingMetres: 0.05 }),
          superellipsoid('tor-middle-left', 'joint-block', [-1.3, -0.35, 1.16], [1.95, 1.5, 1.48], [2, 8, -7], 3.3, { smoothingMetres: 0.05 }),
          superellipsoid('tor-middle-right', 'joint-block', [1.35, 0.45, 0.7], [1.62, 1.45, 1.34], [-3, -10, 8], 3.4, { smoothingMetres: 0.045 }),
          superellipsoid('tor-upper-left', 'joint-block', [-1.2, 2.25, 0.72], [1.48, 1.3, 1.16], [-4, -9, 4], 3.1, { smoothingMetres: 0.04 }),
          superellipsoid('tor-crown', 'joint-block', [0.18, 3.56, 0.35], [1.58, 0.78, 1.08], [-2, 7, 5], 3.4, { smoothingMetres: 0.035 }),
          superellipsoid('tor-cleft-front', 'deep-joint', [0.12, 1.05, 2.15], [0.32, 1.42, 0.86], [0, 0, -5], 2.2, { operation: 'subtract', smoothingMetres: 0.055 }),
          superellipsoid('tor-cleft-left', 'deep-joint', [-2.82, -0.15, 2.03], [0.4, 1.0, 0.74], [0, 0, 13], 2.2, { operation: 'subtract', smoothingMetres: 0.05 }),
          superellipsoid('tor-cleft-low', 'deep-joint', [1.0, -2.0, 2.05], [1.2, 0.22, 0.78], [0, 0, -4], 2.4, { operation: 'subtract', smoothingMetres: 0.04 }),
        ],
      },
      landmarks: [
        { id: 'base-left', positionMetres: [-4.75, -4.8, 0], role: 'support' },
        { id: 'base-right', positionMetres: [4.75, -4.8, 0], role: 'support' },
        { id: 'crown', positionMetres: [0, 4.84, 0], role: 'crest' },
        { id: 'major-notch-left', positionMetres: [-2.7, 1.25, 0], role: 'silhouette-notch' },
        { id: 'major-notch-right', positionMetres: [2.65, 1.05, 0], role: 'silhouette-notch' },
      ],
      semanticProgram: {
        jointPlanes: [
          plane([0.98, 0.08, 0.16], -2.72, 0.1, 0.78),
          plane([0.94, -0.12, -0.31], 2.86, 0.11, 0.74),
          plane([0.08, 0.98, 0.17], -0.62, 0.09, 0.65),
          plane([-0.12, 0.97, -0.2], 1.86, 0.1, 0.68),
        ],
      },
    }),
  },
  {
    id: 'rock-v2-pillar-residual-001',
    label: 'Wulingyuan-type quartz-sandstone residual pillar 001',
    recipe: { dimensions: [8, 14, 7], landform: 'pillar', lithology: 'quartz-arenite', scale: 'outcrop', seed: 310002 },
    source: sourceBase({
      id: 'rock-v2-pillar-residual-001',
      subtypeId: 'pillar-residual',
      dimensions: [8, 14, 7],
      silhouetteTrace: {
        method: 'multi-view-authored-control-cage',
        primaryNatureReference: {
          label: 'Wulingyuan quartzite sandstone pillars panorama',
          pageUrl: 'https://commons.wikimedia.org/wiki/File:1_zhangjiajie_huangshizhai_wulingyuan_panorama_2012.jpg',
        },
        projections: ['front', 'left-side', 'rear', 'top'],
        reconciliationPriority: ['outer-silhouette', 'support-continuity', 'major-ledge-placement', 'top-footprint', 'minor-occluded-relief'],
        generatedTurnaround: {
          assetPath: 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/generated-turnarounds/pillar-residual-gpt-image-turnaround.png',
          generatedViewsAreEvidence: false,
          generator: 'OpenAI image generation',
          status: 'approved-shape-hypothesis',
        },
      },
      controlProgram: {
        macroRoughness: { amplitudeMetres: 0.038, frequencyCyclesPerMetre: 0.6, seed: 410002 },
        primitives: [
          polygonalLoft('pillar-body', 'tower-body', [-0.04, 0, -0.12], [
            { yMetres: -6.35, verticesMetres: [[-1.58, -0.62], [-1.2, -1.42], [-0.08, -1.58], [1.18, -1.36], [1.62, -0.26], [1.45, 1.04], [0.18, 1.48], [-1.16, 1.2], [-1.64, 0.18]] },
            { yMetres: -5.0, verticesMetres: [[-1.52, -0.58], [-1.14, -1.36], [-0.04, -1.52], [1.16, -1.3], [1.56, -0.22], [1.4, 1.0], [0.2, 1.42], [-1.1, 1.16], [-1.58, 0.18]] },
            { yMetres: -3.72, verticesMetres: [[-1.5, -0.56], [-1.12, -1.34], [-0.02, -1.5], [1.14, -1.28], [1.54, -0.2], [1.38, 0.98], [0.2, 1.4], [-1.08, 1.14], [-1.56, 0.16]] },
            { yMetres: -2.18, verticesMetres: [[-1.46, -0.54], [-1.08, -1.3], [0, -1.46], [1.12, -1.24], [1.5, -0.18], [1.34, 0.96], [0.2, 1.36], [-1.04, 1.1], [-1.52, 0.16]] },
            { yMetres: -0.42, verticesMetres: [[-1.4, -0.52], [-1.02, -1.24], [0.02, -1.4], [1.08, -1.18], [1.44, -0.16], [1.3, 0.92], [0.22, 1.3], [-0.98, 1.06], [-1.46, 0.16]] },
            { yMetres: 1.28, verticesMetres: [[-1.36, -0.5], [-0.98, -1.2], [0.04, -1.36], [1.06, -1.14], [1.4, -0.14], [1.26, 0.9], [0.22, 1.26], [-0.94, 1.02], [-1.42, 0.14]] },
            { yMetres: 2.78, verticesMetres: [[-1.34, -0.48], [-0.96, -1.16], [0.06, -1.32], [1.04, -1.1], [1.36, -0.12], [1.22, 0.88], [0.2, 1.22], [-0.92, 0.98], [-1.4, 0.14]] },
            { yMetres: 4.18, verticesMetres: [[-1.3, -0.46], [-0.92, -1.1], [0.06, -1.26], [1.0, -1.04], [1.3, -0.1], [1.16, 0.84], [0.18, 1.16], [-0.88, 0.94], [-1.36, 0.12]] },
            { yMetres: 5.25, verticesMetres: [[-1.18, -0.4], [-0.82, -0.98], [0.06, -1.12], [0.9, -0.9], [1.14, -0.04], [1.0, 0.76], [0.12, 1.02], [-0.8, 0.82], [-1.22, 0.1]] },
            { yMetres: 6.28, verticesMetres: [[-0.94, -0.3], [-0.64, -0.76], [0.08, -0.88], [0.72, -0.62], [0.86, 0.08], [0.66, 0.66], [-0.06, 0.82], [-0.72, 0.56], [-0.98, 0.04]] },
          ], [0, -2, -0.5], { smoothingMetres: 0.065 }),
          polygonalLoft('pillar-left-spine', 'buttress', [-1.48, -0.2, 0.42], [
            { yMetres: -5.95, verticesMetres: [[-1.02, -0.92], [0.28, -1.22], [0.92, -0.38], [0.74, 0.92], [-0.42, 1.18], [-1.08, 0.32]] },
            { yMetres: -3.65, verticesMetres: [[-0.9, -0.82], [0.22, -1.04], [0.78, -0.3], [0.66, 0.8], [-0.36, 1.0], [-0.96, 0.24]] },
            { yMetres: -0.7, verticesMetres: [[-0.78, -0.7], [0.18, -0.9], [0.66, -0.24], [0.56, 0.66], [-0.32, 0.86], [-0.82, 0.18]] },
            { yMetres: 2.18, verticesMetres: [[-0.68, -0.58], [0.12, -0.74], [0.54, -0.18], [0.46, 0.58], [-0.26, 0.7], [-0.72, 0.14]] },
            { yMetres: 4.55, verticesMetres: [[-0.52, -0.42], [0.08, -0.54], [0.42, -0.12], [0.34, 0.42], [-0.2, 0.5], [-0.56, 0.08]] },
          ], [0, -4, -1], { smoothingMetres: 0.055 }),
          polygonalLoft('pillar-right-spine', 'buttress', [1.38, -1.1, -0.06], [
            { yMetres: -5.2, verticesMetres: [[-0.72, -0.92], [0.48, -1.0], [0.94, -0.2], [0.68, 0.88], [-0.4, 1.04], [-0.88, 0.22]] },
            { yMetres: -3.2, verticesMetres: [[-0.62, -0.8], [0.4, -0.86], [0.8, -0.16], [0.6, 0.74], [-0.34, 0.9], [-0.76, 0.18]] },
            { yMetres: -0.55, verticesMetres: [[-0.52, -0.68], [0.34, -0.74], [0.68, -0.12], [0.52, 0.62], [-0.28, 0.74], [-0.64, 0.14]] },
            { yMetres: 1.78, verticesMetres: [[-0.44, -0.54], [0.26, -0.58], [0.54, -0.08], [0.42, 0.48], [-0.22, 0.58], [-0.52, 0.1]] },
            { yMetres: 3.35, verticesMetres: [[-0.32, -0.4], [0.18, -0.44], [0.4, -0.06], [0.3, 0.36], [-0.16, 0.42], [-0.38, 0.06]] },
          ], [0, 5, 1], { smoothingMetres: 0.05 }),
          polygonalLoft('pillar-front-buttress', 'buttress', [-0.12, -3.2, 1.45], [
            { yMetres: -3.05, verticesMetres: [[-1.52, -0.7], [1.3, -0.82], [1.64, 0.12], [0.82, 1.0], [-0.72, 1.08], [-1.66, 0.28]] },
            { yMetres: -1.55, verticesMetres: [[-1.32, -0.62], [1.14, -0.7], [1.42, 0.1], [0.7, 0.86], [-0.64, 0.94], [-1.46, 0.24]] },
            { yMetres: 0.1, verticesMetres: [[-1.08, -0.5], [0.94, -0.58], [1.18, 0.08], [0.6, 0.7], [-0.52, 0.76], [-1.2, 0.2]] },
            { yMetres: 1.65, verticesMetres: [[-0.82, -0.38], [0.7, -0.44], [0.88, 0.06], [0.46, 0.52], [-0.4, 0.58], [-0.92, 0.16]] },
          ], [0, -3, 0], { smoothingMetres: 0.06 }),
          superellipsoid('pillar-ledge-low', 'major-ledge', [-0.76, -2.05, 1.48], [1.0, 0.3, 0.48], [0, -7, -1], 4.4, { smoothingMetres: 0.024 }),
          superellipsoid('pillar-ledge-high', 'major-ledge', [0.68, 2.82, 1.28], [0.7, 0.24, 0.4], [0, 8, 2], 4.4, { smoothingMetres: 0.02 }),
          superellipsoid('pillar-crown', 'crown', [-0.12, 6.0, 0.02], [1.06, 0.46, 0.94], [1, 5, 4], 4.6, { smoothingMetres: 0.028 }),
        ],
      },
      landmarks: [
        { id: 'base-left', positionMetres: [-3.0, -6.85, 0], role: 'support' },
        { id: 'base-right', positionMetres: [3.0, -6.85, 0], role: 'support' },
        { id: 'crown', positionMetres: [-0.38, 6.65, 0.08], role: 'crest' },
        { id: 'ledge-low', positionMetres: [-2.9, -2.72, 0], role: 'ledge' },
        { id: 'ledge-mid', positionMetres: [2.35, 0.42, 0], role: 'ledge' },
        { id: 'ledge-high', positionMetres: [-1.8, 3.22, 0], role: 'ledge' },
      ],
      semanticProgram: {
        beddingPlanes: [
          plane([0.07, 0.99, -0.05], -5.2, 0.065, 0.31),
          plane([0.12, 0.99, 0.04], -2.78, 0.075, 0.5),
          plane([-0.08, 0.99, 0.07], 0.38, 0.06, 0.42),
          plane([0.14, 0.98, -0.08], 3.18, 0.055, 0.38),
          plane([-0.06, 0.99, 0.09], 4.5, 0.05, 0.3),
        ],
        jointPlanes: [
          plane([0.97, 0.08, 0.2], -1.25, 0.08, 0.62),
          plane([0.95, -0.1, -0.28], 1.58, 0.075, 0.58),
        ],
      },
    }),
  },
  {
    id: 'rock-v2-arch-sandstone-001',
    label: 'Sandstone natural arch 001',
    recipe: { dimensions: [13, 9, 6], landform: 'arch', lithology: 'quartz-arenite', scale: 'outcrop', seed: 310003, stability: true },
    source: sourceBase({
      id: 'rock-v2-arch-sandstone-001',
      subtypeId: 'arch-sandstone',
      dimensions: [13, 9, 6],
      controlProgram: {
        macroRoughness: { amplitudeMetres: 0.034, frequencyCyclesPerMetre: 0.52, seed: 410003 },
        primitives: [
          taperedBox('arch-host', 'host-mass', [0, -0.15, -0.2], 4.0, [5.82, 2.48], [4.52, 1.82], [-0.48, -0.08], [0, -2, 0], { roundingMetres: 0.46, smoothingMetres: 0.1 }),
          taperedBox('arch-left-buttress', 'abutment', [-4.65, -1.55, 0.08], 2.62, [2.05, 2.55], [1.42, 1.82], [0.18, -0.08], [0, -5, 3], { roundingMetres: 0.4, smoothingMetres: 0.12 }),
          taperedBox('arch-right-buttress', 'abutment', [4.45, -1.4, -0.08], 2.78, [2.12, 2.48], [1.36, 1.72], [-0.18, 0.1], [0, 7, -2], { roundingMetres: 0.38, smoothingMetres: 0.11 }),
          box('arch-crown', 'roof', [-0.52, 3.34, -0.12], [4.68, 1.02, 1.92], [0, -3, 2], { roundingMetres: 0.42, smoothingMetres: 0.085 }),
          ellipsoid('arch-opening', 'opening', [-0.28, -1.12, 0], [3.64, 2.78, 3.2], [0, 0, -2], { operation: 'subtract', smoothingMetres: 0.16 }),
          ellipsoid('arch-left-notch', 'erosion-notch', [-5.62, 1.72, 0.42], [1.12, 1.35, 1.75], [0, 0, -8], { operation: 'subtract', smoothingMetres: 0.08 }),
          ellipsoid('arch-right-notch', 'erosion-notch', [5.42, 2.0, -0.26], [0.92, 1.1, 1.45], [0, 0, 7], { operation: 'subtract', smoothingMetres: 0.07 }),
          ellipsoid('arch-crest-notch', 'erosion-notch', [1.55, 4.0, 0.35], [1.45, 0.55, 1.5], [0, 0, 0], { operation: 'subtract', smoothingMetres: 0.065 }),
        ],
      },
      landmarks: [
        { id: 'left-foot', positionMetres: [-5.2, -4.2, 0], role: 'support' },
        { id: 'right-foot', positionMetres: [5.1, -4.2, 0], role: 'support' },
        { id: 'roof-crown', positionMetres: [-0.35, 4.42, 0], role: 'crest' },
        { id: 'opening-left', positionMetres: [-3.97, -1.15, 0], role: 'opening-edge' },
        { id: 'opening-right', positionMetres: [3.47, -1.15, 0], role: 'opening-edge' },
        { id: 'opening-top', positionMetres: [-0.25, 1.55, 0], role: 'opening-edge' },
      ],
      semanticProgram: {
        beddingPlanes: [
          plane([0.18, 0.98, 0.04], -2.95, 0.07, 0.45),
          plane([0.22, 0.97, -0.05], -0.82, 0.06, 0.38),
          plane([0.16, 0.98, 0.08], 2.08, 0.065, 0.42),
          plane([0.24, 0.97, -0.03], 3.42, 0.055, 0.36),
        ],
        jointPlanes: [plane([0.95, 0.12, 0.28], -4.25, 0.08, 0.5), plane([0.94, -0.08, -0.33], 4.0, 0.08, 0.5)],
      },
    }),
  },
  {
    id: 'rock-v2-cliff-module-straight-001',
    label: 'Bedded sandstone straight cliff module 001',
    recipe: { dimensions: [24, 15, 10], landform: 'cliff', lithology: 'quartz-arenite', scale: 'module', seed: 310004 },
    source: sourceBase({
      id: 'rock-v2-cliff-module-straight-001',
      subtypeId: 'cliff-module-straight',
      dimensions: [24, 15, 10],
      controlProgram: {
        macroRoughness: { amplitudeMetres: 0.052, frequencyCyclesPerMetre: 0.34, seed: 410004 },
        primitives: [
          taperedBox('cliff-wall', 'continuous-wall', [0, -0.25, -0.78], 6.7, [12, 3.72], [11.62, 2.92], [-0.58, -0.28], [0, 0, 0], { roundingMetres: 0.5, smoothingMetres: 0.07 }),
          taperedBox('cliff-buttress-left', 'buttress', [-7.92, -1.55, 1.28], 4.85, [2.72, 2.82], [1.28, 1.05], [0.42, -0.18], [0, -4, -3], { roundingMetres: 0.36, smoothingMetres: 0.14 }),
          taperedBox('cliff-buttress-mid', 'buttress', [0.72, -2.15, 1.52], 4.25, [3.02, 2.72], [1.48, 1.02], [-0.35, -0.14], [0, 6, 2], { roundingMetres: 0.34, smoothingMetres: 0.13 }),
          taperedBox('cliff-buttress-right', 'buttress', [8.35, -1.92, 1.15], 4.55, [2.48, 2.62], [1.18, 0.95], [-0.36, -0.15], [0, -7, 3], { roundingMetres: 0.33, smoothingMetres: 0.13 }),
          box('cliff-ledge-low', 'major-ledge', [-5.15, -3.72, 2.58], [4.05, 0.3, 1.02], [0, 0, -1], { roundingMetres: 0.19, smoothingMetres: 0.04 }),
          box('cliff-ledge-mid', 'major-ledge', [3.42, -0.02, 2.48], [4.12, 0.25, 0.88], [0, 0, 1.5], { roundingMetres: 0.16, smoothingMetres: 0.035 }),
          box('cliff-ledge-high', 'major-ledge', [-4.62, 3.48, 2.06], [2.72, 0.22, 0.72], [0, 0, -2], { roundingMetres: 0.14, smoothingMetres: 0.03 }),
          ellipsoid('cliff-gully-left', 'gully', [-4.72, 2.15, 4.12], [0.82, 3.15, 1.38], [0, 0, -8], { operation: 'subtract', smoothingMetres: 0.1 }),
          ellipsoid('cliff-gully-right', 'gully', [5.45, 0.2, 4.05], [0.72, 2.55, 1.28], [0, 0, 7], { operation: 'subtract', smoothingMetres: 0.09 }),
          ellipsoid('cliff-crest-notch', 'crest-notch', [1.65, 6.82, 0.75], [1.72, 0.92, 2.05], [0, 0, 0], { operation: 'subtract', smoothingMetres: 0.09 }),
        ],
      },
      landmarks: [
        { id: 'left-seam-crest', positionMetres: [-12, 6.5, -0.65], role: 'module-seam' },
        { id: 'left-seam-toe', positionMetres: [-12, -7.1, -0.65], role: 'module-seam' },
        { id: 'right-seam-crest', positionMetres: [12, 6.5, -0.65], role: 'module-seam' },
        { id: 'right-seam-toe', positionMetres: [12, -7.1, -0.65], role: 'module-seam' },
        { id: 'crest-high', positionMetres: [-4.2, 6.65, -0.5], role: 'crest' },
        { id: 'toe-forward', positionMetres: [0.8, -6.6, 4.35], role: 'toe' },
      ],
      semanticProgram: {
        beddingPlanes: [
          plane([0.08, 0.99, 0.05], -5.28, 0.1, 0.44),
          plane([0.12, 0.99, -0.04], -3.62, 0.08, 0.48),
          plane([-0.06, 0.99, 0.07], 0.12, 0.075, 0.42),
          plane([0.1, 0.99, -0.05], 3.5, 0.07, 0.4),
          plane([-0.04, 0.99, 0.08], 5.42, 0.065, 0.34),
        ],
        jointPlanes: [
          plane([0.97, 0.1, 0.21], -6.4, 0.1, 0.45),
          plane([0.95, -0.05, -0.3], 4.65, 0.09, 0.48),
        ],
      },
    }),
  },
  {
    id: 'rock-v2-mountain-modular-bedrock-001',
    label: 'Stratified bedrock mountain module 001',
    recipe: { dimensions: [36, 45, 30], landform: 'modular-bedrock-mountain', lithology: 'micritic-limestone', scale: 'module', seed: 310005 },
    source: sourceBase({
      id: 'rock-v2-mountain-modular-bedrock-001',
      subtypeId: 'mountain-modular-bedrock',
      dimensions: [36, 45, 30],
      controlProgram: {
        macroRoughness: { amplitudeMetres: 0.09, frequencyCyclesPerMetre: 0.18, seed: 410005 },
        primitives: [
          profiled('mountain-core', 'primary-mass', [0, -1.2, -2.3], [
            { halfExtentsMetres: [13.2, 10.8], offsetMetres: [0, 0], yMetres: -18.0 },
            { halfExtentsMetres: [12.5, 10.1], offsetMetres: [0.2, 0.15], yMetres: -12.2 },
            { halfExtentsMetres: [10.9, 8.9], offsetMetres: [-0.55, 0.35], yMetres: -5.4 },
            { halfExtentsMetres: [9.25, 7.5], offsetMetres: [-1.15, 0.48], yMetres: 2.2 },
            { halfExtentsMetres: [7.65, 6.15], offsetMetres: [-1.75, 0.42], yMetres: 8.7 },
            { halfExtentsMetres: [5.6, 4.65], offsetMetres: [-2.45, 0.25], yMetres: 14.0 },
            { halfExtentsMetres: [2.25, 2.05], offsetMetres: [-3.15, 0.18], yMetres: 18.6 },
          ], [0, -2, 0], { roundingMetres: 0.62, smoothingMetres: 0.34 }),
          taperedBox('mountain-left-buttress', 'secondary-buttress', [-9.2, -6.0, 0.82], 13.9, [7.7, 8.2], [3.25, 3.4], [2.15, 0.25], [2, 0, -9], { roundingMetres: 0.62, smoothingMetres: 0.44 }),
          taperedBox('mountain-right-buttress', 'secondary-buttress', [9.55, -7.85, -0.15], 12.3, [7.0, 7.5], [2.75, 2.85], [-1.85, 0.2], [-2, 0, 10], { roundingMetres: 0.58, smoothingMetres: 0.42 }),
          taperedBox('mountain-front-rib', 'secondary-buttress', [0.75, -8.1, 7.35], 11.4, [7.2, 6.35], [2.45, 1.85], [0.7, -0.45], [-5, 0, 1], { roundingMetres: 0.56, smoothingMetres: 0.4 }),
          taperedBox('mountain-left-spur', 'secondary-buttress', [-13.1, -11.2, 3.75], 8.6, [4.75, 5.3], [1.55, 1.7], [1.2, -0.3], [2, -4, -11], { roundingMetres: 0.5, smoothingMetres: 0.36 }),
          ellipsoid('mountain-base', 'base', [0, -19.0, 0], [16.8, 3.55, 13.5], [0, 0, 0], { smoothingMetres: 0.4 }),
          taperedBox('mountain-crown-left', 'crown', [-4.05, 16.55, -1.42], 4.0, [3.25, 2.75], [1.15, 0.95], [0.55, -0.08], [0, 0, -6], { roundingMetres: 0.38, smoothingMetres: 0.22 }),
          taperedBox('mountain-crown-right', 'crown', [2.75, 15.45, -2.05], 3.3, [2.7, 2.3], [1.0, 0.82], [-0.45, 0.08], [0, 0, 7], { roundingMetres: 0.34, smoothingMetres: 0.2 }),
          ellipsoid('mountain-gully-left', 'drainage-gully', [-6.65, 2.8, 10.05], [1.65, 8.7, 4.15], [0, 0, -12], { operation: 'subtract', smoothingMetres: 0.28 }),
          ellipsoid('mountain-gully-right', 'drainage-gully', [6.95, -1.0, 9.7], [1.55, 7.6, 3.85], [0, 0, 11], { operation: 'subtract', smoothingMetres: 0.27 }),
          ellipsoid('mountain-saddle', 'crown-saddle', [-0.2, 18.6, -1.4], [1.6, 2.0, 2.6], [0, 0, 0], { operation: 'subtract', smoothingMetres: 0.23 }),
        ],
      },
      landmarks: [
        { id: 'base-left', positionMetres: [-16.8, -22.45, 0], role: 'support' },
        { id: 'base-right', positionMetres: [16.8, -22.45, 0], role: 'support' },
        { id: 'primary-peak', positionMetres: [-3.9, 21.25, -1.5], role: 'primary-peak' },
        { id: 'secondary-peak', positionMetres: [3.25, 19.5, -2.2], role: 'secondary-peak' },
        { id: 'left-buttress-toe', positionMetres: [-14.8, -18.2, 2], role: 'buttress' },
        { id: 'right-buttress-toe', positionMetres: [15.0, -18.2, 0], role: 'buttress' },
        { id: 'front-rib-toe', positionMetres: [0.9, -18.8, 13.0], role: 'buttress' },
      ],
      semanticProgram: {
        beddingPlanes: [
          plane([0.52, 0.84, 0.13], -13.8, 0.24, 0.48),
          plane([0.55, 0.82, 0.15], -7.2, 0.2, 0.44),
          plane([0.51, 0.85, 0.12], 1.6, 0.22, 0.46),
          plane([0.57, 0.8, 0.17], 9.9, 0.19, 0.42),
          plane([0.53, 0.84, 0.11], 15.4, 0.17, 0.36),
        ],
        jointPlanes: [
          plane([0.96, 0.12, 0.24], -7.2, 0.18, 0.55),
          plane([0.93, -0.08, -0.36], 8.1, 0.2, 0.5),
          plane([0.06, 0.97, 0.23], -6.5, 0.16, 0.42),
          plane([-0.08, 0.96, -0.27], 8.8, 0.17, 0.4),
        ],
      },
    }),
  },
  {
    id: 'rock-v2-hoodoo-caprock-001',
    label: "Thor's Hammer-type Claron caprock hoodoo 001",
    recipe: { dimensions: [3.125, 5.0, 3.328125], landform: 'hoodoo', lithology: 'marl', scale: 'outcrop', seed: 310006 },
    source: sourceBase({
      id: 'rock-v2-hoodoo-caprock-001',
      subtypeId: 'hoodoo-caprock',
      dimensions: [3.125, 5.0, 3.328125],
      silhouetteTrace: {
        method: 'multi-view-authored-control-cage',
        primaryNatureReference: {
          label: "Thor's Hammer hoodoo",
          pageUrl: 'https://commons.wikimedia.org/wiki/File:Thors_hammer_hoodoo.jpg',
        },
        projections: ['front', 'left-side', 'rear', 'right-side', 'top', 'bottom-support'],
        reconciliationPriority: ['cap-to-shaft-ratio', 'continuous-support', 'front-silhouette', 'side-depth', 'top-footprint', 'minor-occluded-relief'],
        generatedTurnaround: {
          assetPath: 'artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-final/forms/hoodoo-caprock/six-view.png',
          generatedViewsAreEvidence: false,
          generator: 'OpenAI image generation',
          status: 'approved-shape-hypothesis',
        },
      },
      providerBridge: {
        authoritativeSource: 'toonlab-authored-control-program-and-semantic-zones',
        canonicalSourceEligible: false,
        intendedUse: 'non-authoritative morphology reconstruction aid and high-frequency donor',
        modelVersion: 'v3.1-20260211',
        provider: 'tripo',
        providerTaskId: 'c4b6bc30-8def-4e13-89a1-0698cf6585a0',
        providerMetricHeightMetres: 3.2,
        canonicalTargetHeightMetres: 5.0,
        providerToCanonicalUniformScale: HOODOO_PROVIDER_TO_CANONICAL_SCALE,
        rawProviderGlb: {
          assetPath: 'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/tripo-v31-ultra-claron/reconstruction-target.glb',
          sha256: '482a986aa5cafab99b43c88827ebe5db5f0dd49dd52eabf383655a712dbb7e17',
        },
        repairedHighGlb: {
          assetPath: 'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-repaired-high/hoodoo-caprock-repaired-high.glb',
          sha256: '85300a53551a2abceab3284354c611950426b537a5d5cfc4827077b714f87fbd',
        },
        templateBridgeBlend: {
          assetPath: 'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-template-bridge/hoodoo-caprock-template-bridge.blend',
          sha256: '3b1beca65044766a77512851b0f2d2a91082922bdd2c07d13e435b74cb694f2d',
        },
      },
      controlProgram: {
        macroRoughness: {
          amplitudeMetres: 0.018 * HOODOO_PROVIDER_TO_CANONICAL_SCALE,
          frequencyCyclesPerMetre: 1.15 / HOODOO_PROVIDER_TO_CANONICAL_SCALE,
          seed: 410006,
        },
        primitives: [
          polygonalLoft('hoodoo-body', 'hoodoo-profile', [0, 0, 0], [
            hoodooLoftLevel([0.82, 0.78], [0.0, 0.0], -1.58, 'base', 0.1),
            hoodooLoftLevel([0.98, 0.88], [-0.03, 0.02], -1.35, 'base', 0.28),
            hoodooLoftLevel([0.72, 0.65], [-0.08, 0.03], -1.08, 'shaft', 0.44),
            hoodooLoftLevel([0.58, 0.54], [-0.04, 0.02], -0.62, 'shaft', 0.62),
            hoodooLoftLevel([0.48, 0.44], [0.02, 0.0], -0.08, 'shaft', 0.82),
            hoodooLoftLevel([0.43, 0.38], [0.06, -0.02], 0.48, 'shaft', 1.02),
            hoodooLoftLevel([0.34, 0.31], [0.09, -0.04], 0.78, 'neck', 1.18),
            hoodooLoftLevel([0.36, 0.33], [0.12, -0.04], 0.96, 'neck', 1.36),
            hoodooLoftLevel([0.64, 0.52], [0.1, -0.02], 1.1, 'cap', 1.5),
            hoodooLoftLevel([1.0, 0.93], [0.08, 0.02], 1.28, 'cap', 1.72),
            hoodooLoftLevel([0.88, 0.78], [0.02, 0.05], 1.48, 'cap', 1.92),
            hoodooLoftLevel([0.72, 0.62], [-0.03, 0.05], 1.58, 'cap', 2.08),
          ], [0, -2.5, 0.5], {
            smoothingMetres: 0.025 * HOODOO_PROVIDER_TO_CANONICAL_SCALE,
          }),
        ],
      },
      landmarks: [
        { id: 'base-left', positionMetres: [-0.98, -1.58, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'support' },
        { id: 'base-right', positionMetres: [0.95, -1.58, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'support' },
        { id: 'shaft-left', positionMetres: [-0.52, -0.08, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'shaft-edge' },
        { id: 'shaft-right', positionMetres: [0.5, -0.08, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'shaft-edge' },
        { id: 'neck-left', positionMetres: [-0.25, 0.86, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'neck-edge' },
        { id: 'neck-right', positionMetres: [0.45, 0.86, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'neck-edge' },
        { id: 'cap-left', positionMetres: [-0.92, 1.3, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'cap-edge' },
        { id: 'cap-right', positionMetres: [1.08, 1.3, 0].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'cap-edge' },
        { id: 'crown', positionMetres: [-0.03, 1.58, 0.05].map((value) => value * HOODOO_PROVIDER_TO_CANONICAL_SCALE), role: 'crest' },
      ],
      semanticProgram: {
        beddingPlanes: [
          plane([0.06, 0.99, 0.04], -1.12 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.04 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.32),
          plane([-0.08, 0.99, 0.03], -0.6 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.035 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.28),
          plane([0.1, 0.99, -0.04], -0.08 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.04 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.34),
          plane([-0.05, 0.99, 0.06], 0.48 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.035 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.3),
          plane([0.08, 0.99, -0.03], 1.18 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.045 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.38),
        ],
        jointPlanes: [
          plane([0.96, 0.12, 0.24], -0.34 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.035 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.42),
          plane([0.92, -0.08, -0.38], 0.52 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.04 * HOODOO_PROVIDER_TO_CANONICAL_SCALE, 0.38),
        ],
      },
    }),
  },
];

export function listAuthoredCanonicalDefinitions() {
  return DEFINITIONS.map((definition) => ({ id: definition.id, label: definition.label, subtypeId: definition.source.subtypeId }));
}

export function createAuthoredCanonicalFixtures(options = {}) {
  const catalog = options.catalog ?? loadGeologyCatalog();
  return DEFINITIONS.map((definition) => {
    const source = validateEditableSourcePackage(definition.source).package;
    const recipe = makeRecipe({ ...definition.recipe, id: source.recipeId }, catalog);
    return Object.freeze({
      definition: Object.freeze({ id: definition.id, label: definition.label, subtypeId: source.subtypeId }),
      recipe,
      source,
    });
  });
}
