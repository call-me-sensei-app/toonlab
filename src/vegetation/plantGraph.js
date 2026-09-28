import { getTreeSpeciesProfile } from './treeSpeciesProfiles.js';
import { growRecursiveWoody } from './recursiveWoodyGrowth.js';

export const PLANT_GRAPH_SCHEMA = 'toonlabPlantGraph';
export const PLANT_GRAPH_VERSION = 1;

const STAGE_SCALE = Object.freeze([0.24, 0.48, 0.72, 1, 1.12]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function stageScaleAt(position) {
  const clamped = Math.max(0, Math.min(STAGE_SCALE.length - 1, position));
  const lower = Math.floor(clamped);
  const upper = Math.ceil(clamped);
  const mix = clamped - lower;
  return STAGE_SCALE[lower] * (1 - mix) + STAGE_SCALE[upper] * mix;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableHash(value) {
  return hashString(JSON.stringify(value)).toString(16).padStart(8, '0');
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function direction(azimuth, elevation) {
  const horizontal = Math.cos(elevation);
  return [
    Math.cos(azimuth) * horizontal,
    Math.sin(elevation),
    Math.sin(azimuth) * horizontal,
  ];
}

function addScaled(origin, vector, scale) {
  return [
    origin[0] + vector[0] * scale,
    origin[1] + vector[1] * scale,
    origin[2] + vector[2] * scale,
  ];
}

function vectorLength(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalizeVector(vector, fallback = [0, 1, 0]) {
  const length = vectorLength(vector);
  if (length < 1e-8) return [...fallback];
  return vector.map((component) => component / length);
}

function crossVector(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function mixVector(a, b, amount) {
  return [
    a[0] * (1 - amount) + b[0] * amount,
    a[1] * (1 - amount) + b[1] * amount,
    a[2] * (1 - amount) + b[2] * amount,
  ];
}

function smoothstep(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function radialFrame(parentDirection) {
  const directionVector = normalizeVector(parentDirection);
  const reference = Math.abs(directionVector[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const tangent = normalizeVector(crossVector(reference, directionVector), [1, 0, 0]);
  const bitangent = normalizeVector(crossVector(directionVector, tangent), [0, 0, 1]);
  return { tangent, bitangent };
}

function childDirection(parentDirection, azimuth, angle) {
  const parent = normalizeVector(parentDirection);
  const { tangent, bitangent } = radialFrame(parent);
  const radial = [
    tangent[0] * Math.cos(azimuth) + bitangent[0] * Math.sin(azimuth),
    tangent[1] * Math.cos(azimuth) + bitangent[1] * Math.sin(azimuth),
    tangent[2] * Math.cos(azimuth) + bitangent[2] * Math.sin(azimuth),
  ];
  return normalizeVector([
    parent[0] * Math.cos(angle) + radial[0] * Math.sin(angle),
    parent[1] * Math.cos(angle) + radial[1] * Math.sin(angle),
    parent[2] * Math.cos(angle) + radial[2] * Math.sin(angle),
  ]);
}

function wanderDirection(currentDirection, rng, wobble, growthForce) {
  const directionVector = normalizeVector(currentDirection);
  const { tangent, bitangent } = radialFrame(directionVector);
  const phase = rng() * Math.PI * 2;
  const amount = (rng() * 2 - 1) * wobble;
  const radial = [
    tangent[0] * Math.cos(phase) + bitangent[0] * Math.sin(phase),
    tangent[1] * Math.cos(phase) + bitangent[1] * Math.sin(phase),
    tangent[2] * Math.cos(phase) + bitangent[2] * Math.sin(phase),
  ];
  const wandered = normalizeVector([
    directionVector[0] + radial[0] * amount,
    directionVector[1] + radial[1] * amount,
    directionVector[2] + radial[2] * amount,
  ]);
  if (Math.abs(growthForce) < 1e-8) return wandered;
  if (growthForce > 0) {
    return normalizeVector(mixVector(wandered, [0, 1, 0], Math.min(0.42, growthForce)));
  }
  return normalizeVector([
    wandered[0],
    wandered[1] + Math.max(-0.35, growthForce),
    wandered[2],
  ]);
}

function applyAxisTropisms(currentDirection, {
  branchSag = 0,
  development = 1,
  gravitropism = 0,
  level = 1,
  lightDirection = [0.28, 1, 0.16],
  phototropism = 0,
  sectionProgress = 0,
  slenderness = 1,
  tipUpturn = 0,
  windBias = 0,
  windDirection = [1, 0, 0],
} = {}) {
  let result = normalizeVector(currentDirection);
  const horizontalness = Math.sqrt(result[0] ** 2 + result[2] ** 2);
  const compliance = Math.min(3.5, Math.max(0.35, slenderness));

  if (phototropism > 0) {
    result = normalizeVector(mixVector(
      result,
      normalizeVector(lightDirection),
      Math.min(0.3, phototropism * compliance * (0.45 + sectionProgress * 0.55)),
    ));
  }
  if (gravitropism !== 0) {
    const target = gravitropism > 0 ? [0, 1, 0] : [result[0], -0.35, result[2]];
    result = normalizeVector(mixVector(
      result,
      target,
      Math.min(0.34, Math.abs(gravitropism) * compliance),
    ));
  }
  if (branchSag > 0 && level > 0) {
    result = normalizeVector([
      result[0],
      result[1] - branchSag
        * horizontalness
        * compliance
        * (0.25 + sectionProgress ** 1.5)
        * (0.75 + development * 0.25),
      result[2],
    ]);
  }
  if (windBias !== 0) {
    const wind = normalizeVector([windDirection[0], 0, windDirection[2]], [1, 0, 0]);
    result = normalizeVector(mixVector(
      result,
      [wind[0], result[1] * 0.8, wind[2]],
      Math.min(0.24, Math.abs(windBias) * compliance),
    ));
  }
  if (tipUpturn > 0) {
    const tipWeight = smoothstep(0.42, 1, sectionProgress);
    result = normalizeVector(mixVector(
      result,
      [result[0] * 0.48, 1, result[2] * 0.48],
      Math.min(0.48, tipUpturn * tipWeight * compliance),
    ));
  }
  return result;
}

function crownEnvelopeRadius(mode, normalizedHeight) {
  const t = clamp01(normalizedHeight);
  if (mode === 'columnar') return 0.48 + Math.sin(Math.PI * t) * 0.16;
  if (mode === 'vase') return 0.28 + t ** 0.72 * 0.82;
  if (mode === 'weeping') return 0.7 + Math.sin(Math.PI * t) * 0.34;
  if (mode === 'spreading' || mode === 'umbrella') {
    return 0.76 + Math.sin(Math.PI * Math.min(1, t * 1.12)) * 0.5;
  }
  if (
    mode === 'monopodial'
    || mode === 'excurrent'
    || mode === 'sparse-excurrent'
    || mode === 'layered'
  ) {
    return 0.3 + (1 - t) ** 0.72 * 0.82;
  }
  return 0.58 + Math.sin(Math.PI * t) * 0.46;
}

function constrainDirectionToCrown(currentPosition, currentDirection, stepLength, {
  bottom,
  center,
  mode,
  radiusX,
  radiusY,
  radiusZ,
  top,
} = {}) {
  if (!center || !(radiusX > 0) || !(radiusY > 0) || !(radiusZ > 0)) {
    return currentDirection;
  }
  // Umbrella/spreading reach is already allocated by the recursive-series
  // length calculation. Pulling each section back toward the center turns the
  // defining horizontal scaffold into a narrow pole.
  if (mode === 'umbrella' || mode === 'spreading') return currentDirection;
  const candidate = addScaled(currentPosition, currentDirection, stepLength);
  const normalizedHeight = clamp01((candidate[1] - bottom) / Math.max(0.001, top - bottom));
  const envelope = Math.max(0.12, crownEnvelopeRadius(mode, normalizedHeight));
  const dx = (candidate[0] - center[0]) / (radiusX * envelope);
  const dz = (candidate[2] - center[2]) / (radiusZ * envelope);
  const dy = (candidate[1] - center[1]) / radiusY;
  const radialScore = dx * dx + dz * dz;
  const verticalScore = Math.max(0, Math.abs(dy) - 1);
  const outside = Math.max(0, Math.sqrt(radialScore) - 1) + verticalScore;
  if (outside <= 0) return currentDirection;

  const inwardTarget = normalizeVector([
    center[0] - candidate[0],
    mode === 'weeping'
      ? Math.min(0, center[1] - candidate[1])
      : Math.max(-0.08, center[1] - candidate[1]),
    center[2] - candidate[2],
  ]);
  return normalizeVector(mixVector(
    currentDirection,
    inwardTarget,
    Math.min(0.58, 0.18 + outside * 0.42),
  ));
}

function createBuilder(profile, lifeStageSlot, geometrySeed) {
  let nextPartId = 1;
  const graph = {
    schema: PLANT_GRAPH_SCHEMA,
    version: PLANT_GRAPH_VERSION,
    speciesProfileId: profile.id,
    architectureProfileId: profile.architectureId,
    architectureVersion: profile.architectureVersion,
    engine: profile.engine,
    lifeStageSlot,
    geometrySeed,
    structuralHash: '',
    axes: [],
    segments: [],
    attachments: [],
    roots: [],
    organs: [],
    parts: [],
  };
  const part = (semantic, parentPartId = null, metadata = {}) => {
    const entry = {
      id: nextPartId,
      stableId: `${profile.id}:${lifeStageSlot}:${semantic}:${nextPartId}`,
      semantic,
      parentPartId,
      ...metadata,
    };
    nextPartId += 1;
    graph.parts.push(entry);
    return entry;
  };
  const axis = (kind, parentAxisId = null, metadata = {}) => {
    const entry = {
      id: `axis-${graph.axes.length + 1}`,
      kind,
      parentAxisId,
      ...metadata,
    };
    graph.axes.push(entry);
    return entry;
  };
  const segment = (axisEntry, semantic, start, end, radiusStart, radiusEnd, metadata = {}) => {
    const partEntry = part(semantic, metadata.parentPartId ?? null, metadata);
    const entry = {
      id: `segment-${graph.segments.length + 1}`,
      axisId: axisEntry.id,
      partId: partEntry.id,
      semantic,
      start,
      end,
      radiusStart,
      radiusEnd,
      ...metadata,
    };
    graph.segments.push(entry);
    return entry;
  };
  const attachment = (semantic, position, facing, size, parentPartId = null, metadata = {}) => {
    const partEntry = part(semantic, parentPartId, metadata);
    const entry = {
      id: `attachment-${graph.attachments.length + 1}`,
      partId: partEntry.id,
      semantic,
      position,
      direction: facing,
      size,
      parentPartId,
      ...metadata,
    };
    graph.attachments.push(entry);
    graph.organs.push(entry);
    return entry;
  };
  return { graph, part, axis, segment, attachment };
}

function resolvedStage(profile, requestedStage) {
  if (Number.isInteger(requestedStage)) {
    const slot = Math.max(0, Math.min(4, requestedStage));
    return { slot, id: profile.supportedStages[slot] };
  }
  const slot = profile.supportedStages.indexOf(requestedStage);
  if (slot < 0) {
    throw new Error(
      `Unsupported life stage "${requestedStage}" for ${profile.id}; expected ${profile.supportedStages.join(', ')}.`,
    );
  }
  return { slot, id: profile.supportedStages[slot] };
}

function resolveStructuralTraits(profile, traitOverrides) {
  const overrides = traitOverrides ?? {};
  const traits = {
    ...profile.structuralTraits,
    ...overrides,
  };
  for (const [trait, scaleKey] of [
    ['crownWidth', 'crownWidthScale'],
    ['crownDepth', 'crownDepthScale'],
    ['lean', 'leanScale'],
    ['branchAngle', 'branchAngleScale'],
    ['trunkRadius', 'trunkRadiusScale'],
  ]) {
    if (Number.isFinite(overrides[scaleKey])) {
      traits[trait] = profile.structuralTraits[trait] * overrides[scaleKey];
    }
  }
  if (Number.isFinite(overrides.branchStartOffset)) {
    traits.branchStart = Math.max(
      0,
      Math.min(0.9, profile.structuralTraits.branchStart + overrides.branchStartOffset),
    );
  }
  return Object.freeze(traits);
}

function addRootModules(builder, profile, traits, rng, stageScale) {
  const { graph, axis, segment } = builder;
  const rootProfile = traits.propRoots ? 'prop' : profile.rootProfile;
  if (stageScale < 0.35 && rootProfile !== 'standard-flare') return;
  const rootAxis = axis('root-system');
  const rootScale = Math.max(0.05, Number(traits.rootScale) || 1);
  const rootComplexity = Math.max(0.15, Number(traits.rootComplexity) || 1);
  const rootShape = Number(traits.rootShape) || 0;
  const verticalComplexity = Math.max(
    0,
    Number(traits.rootVerticalComplexity) || 0,
  );
  const baseRadius = traits.trunkRadius
    * Math.max(0.55, stageScale)
    * Math.pow(rootScale, 0.24);
  const radialRoot = (
    index,
    count,
    lengthScale = 1,
    semantic = 'root',
    exposure = 1,
  ) => {
    const angle = index / count * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const inner = [
      Math.cos(angle) * baseRadius * 0.42,
      baseRadius * (0.22 + verticalComplexity * 0.08) * exposure,
      Math.sin(angle) * baseRadius * 0.42,
    ];
    const outer = [
      Math.cos(angle) * baseRadius * lengthScale,
      0.01 - (1 - exposure) * baseRadius * (0.22 + rootShape * 0.04),
      Math.sin(angle) * baseRadius * lengthScale,
    ];
    const radiusScale = 0.5 + exposure * 0.5;
    const entry = segment(rootAxis, semantic, inner, outer,
      baseRadius * 0.34 * radiusScale, baseRadius * 0.07 * radiusScale, {
      rootProfile,
    });
    graph.roots.push(entry);
  };

  if (rootProfile === 'buttress') {
    const count = Math.max(4, Math.min(12, Math.round(4 + rootComplexity * 2.6)));
    for (let index = 0; index < count; index += 1) {
      radialRoot(index, count, 4.2 + rootScale * 1.4 + rootShape * 0.35, 'buttress-root');
    }
  } else if (rootProfile === 'prop' || rootProfile === 'aerial') {
    const count = Math.max(
      3,
      Math.min(14, Math.round((rootProfile === 'aerial' ? 5 : 4) + rootComplexity * 2)),
    );
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + rng() * 0.3;
      const topSpread = rootProfile === 'aerial'
        ? traits.crownWidth * 0.18 * stageScale
        : baseRadius * (0.35 + rng() * 0.28);
      const top = [
        Math.cos(angle) * topSpread,
        traits.height * stageScale * (
          rootProfile === 'aerial' ? 0.25 + rng() * 0.25 : 0.12 + rng() * 0.18
        ),
        Math.sin(angle) * topSpread,
      ];
      const foot = [
        top[0] * (rootProfile === 'aerial' ? 1.25 + rng() * 0.35 : 2.6 + rng()),
        0,
        top[2] * (rootProfile === 'aerial' ? 1.25 + rng() * 0.35 : 2.6 + rng()),
      ];
      const entry = segment(rootAxis, rootProfile === 'aerial' ? 'aerial-root' : 'prop-root',
        top, foot, baseRadius * 0.16, baseRadius * 0.24, { rootProfile });
      graph.roots.push(entry);
    }
  } else if (rootProfile === 'knees' || traits.pneumatophores) {
    const count = Math.max(5, Math.min(20, Math.round(6 + rootComplexity * 3.5)));
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + rng() * 0.3;
      const distance = baseRadius * (2 + rng() * 4.5);
      const start = [Math.cos(angle) * distance, 0, Math.sin(angle) * distance];
      const end = [
        start[0],
        baseRadius * (0.7 + rng() * 1.1 + verticalComplexity * 0.3),
        start[2],
      ];
      const entry = segment(rootAxis, traits.pneumatophores ? 'pneumatophore' : 'cypress-knee',
        start, end, baseRadius * 0.13, baseRadius * 0.05, { rootProfile });
      graph.roots.push(entry);
    }
  } else if (rootProfile === 'fibrous') {
    for (let index = 0; index < 8; index += 1) {
      radialRoot(index, 8, 1.5 + rng() * 0.7, 'fibrous-root', 0.05);
    }
  } else if (rootProfile === 'rhizome') {
    const rhizomeCount = Math.max(2, Math.round(2 + stageScale * 3));
    for (let index = 0; index < rhizomeCount; index += 1) {
      const angle = index / rhizomeCount * Math.PI * 2 + rng() * 0.28;
      const mid = [
        Math.cos(angle) * baseRadius * (1.5 + rng()),
        0.015,
        Math.sin(angle) * baseRadius * (1.5 + rng()),
      ];
      const end = [
        Math.cos(angle) * baseRadius * (4 + stageScale * 3 + rng()),
        0.012,
        Math.sin(angle) * baseRadius * (4 + stageScale * 3 + rng()),
      ];
      const first = segment(
        rootAxis,
        'rhizome',
        [0, baseRadius * 0.08, 0],
        mid,
        baseRadius * 0.2,
        baseRadius * 0.15,
        { rhizome: index, rootProfile },
      );
      const second = segment(
        rootAxis,
        'rhizome',
        mid,
        end,
        baseRadius * 0.15,
        baseRadius * 0.08,
        { parentPartId: first.partId, rhizome: index, rootProfile },
      );
      graph.roots.push(first, second);
    }
  } else if (rootProfile === 'coralloid') {
    for (let index = 0; index < 6; index += 1) {
      radialRoot(index, 6, 1.35 + rng() * 0.45, 'coralloid-root', 0.16);
    }
  } else if (rootProfile === 'shallow-radial') {
    for (let index = 0; index < 6; index += 1) {
      // Cactus feeder roots are shallow but normally remain below grade.
      // Preserve their semantic graph/export parts without rendering a
      // biologically false star of exposed spikes around the stem.
      const angle = index / 6 * Math.PI * 2 + (rng() - 0.5) * 0.35;
      const lengthScale = 2.2 + rng() * 0.8;
      const inner = [
        Math.cos(angle) * baseRadius * 0.42,
        -baseRadius * 0.48,
        Math.sin(angle) * baseRadius * 0.42,
      ];
      const outer = [
        Math.cos(angle) * baseRadius * lengthScale,
        -baseRadius * 0.54,
        Math.sin(angle) * baseRadius * lengthScale,
      ];
      const entry = segment(
        rootAxis,
        'shallow-root',
        inner,
        outer,
        baseRadius * 0.11,
        baseRadius * 0.025,
        { rootProfile },
      );
      graph.roots.push(entry);
    }
  } else {
    // A standard woody flare is the widened lower trunk continuing into
    // mostly buried structural roots. Keep the distal tips below grade and
    // leave both ends open so the renderer cannot expose circular "claws"
    // around the stem. The enlarged proximal section remains inside the
    // trunk-base envelope and blends into it.
    const count = Math.max(4, Math.min(9, Math.round(4 + rootComplexity)));
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + (rng() - 0.5) * 0.24;
      const inner = [
        Math.cos(angle) * baseRadius * 0.12,
        -baseRadius * 1.08,
        Math.sin(angle) * baseRadius * 0.12,
      ];
      const outer = [
        Math.cos(angle) * baseRadius * (1.3 + rootScale * 0.4 + rng() * 0.22),
        -baseRadius * (1.12 + rng() * 0.08),
        Math.sin(angle) * baseRadius * (1.3 + rootScale * 0.4 + rng() * 0.22),
      ];
      const entry = segment(
        rootAxis,
        'root-flare',
        inner,
        outer,
        baseRadius * 0.16,
        Math.max(0.0025, baseRadius * 0.008),
        {
          openEnded: true,
          rootProfile,
          transitionKind: 'buried-root-flare',
        },
      );
      graph.roots.push(entry);
    }
  }
}

const WOODY_MODE_RULES = Object.freeze({
  monopodial: Object.freeze({
    crownStartScale: 1,
    primaryAngleScale: 0.86,
    primaryReach: 0.86,
    primaryTaper: 0.72,
    trunkHeight: 1,
    trunkTaper: 0.93,
    upForce: 0.035,
  }),
  excurrent: Object.freeze({
    crownStartScale: 1,
    primaryAngleScale: 0.88,
    primaryReach: 0.88,
    primaryTaper: 0.7,
    trunkHeight: 1,
    trunkTaper: 0.93,
    upForce: 0.04,
  }),
  'sparse-excurrent': Object.freeze({
    crownStartScale: 1,
    primaryAngleScale: 0.92,
    primaryReach: 0.92,
    primaryTaper: 0.67,
    trunkHeight: 1,
    trunkTaper: 0.94,
    upForce: 0.025,
  }),
  layered: Object.freeze({
    crownStartScale: 0.94,
    primaryAngleScale: 0.96,
    primaryReach: 0.94,
    primaryTaper: 0.72,
    trunkHeight: 0.95,
    trunkTaper: 0.9,
    upForce: 0.035,
  }),
  decurrent: Object.freeze({
    crownStartScale: 0.82,
    primaryAngleScale: 1,
    primaryReach: 1.08,
    primaryTaper: 0.82,
    trunkHeight: 0.56,
    trunkTaper: 0.98,
    upForce: 0.045,
  }),
  sympodial: Object.freeze({
    crownStartScale: 0.72,
    primaryAngleScale: 1.02,
    primaryReach: 1.08,
    primaryTaper: 0.86,
    trunkHeight: 0.48,
    trunkTaper: 1,
    upForce: 0.04,
  }),
  vase: Object.freeze({
    crownStartScale: 0.62,
    primaryAngleScale: 1.28,
    primaryReach: 1.46,
    primaryTaper: 0.9,
    trunkHeight: 0.44,
    trunkTaper: 1,
    upForce: 0.02,
  }),
  colonized: Object.freeze({
    crownStartScale: 0.84,
    primaryAngleScale: 1.02,
    primaryReach: 1.14,
    primaryTaper: 0.82,
    trunkHeight: 0.68,
    trunkTaper: 0.98,
    upForce: 0.035,
  }),
  umbrella: Object.freeze({
    crownStartScale: 1.08,
    primaryAngleScale: 1.06,
    primaryReach: 1.28,
    primaryTaper: 0.86,
    trunkHeight: 0.58,
    trunkTaper: 0.98,
    upForce: 0.012,
  }),
  spreading: Object.freeze({
    crownStartScale: 0.76,
    primaryAngleScale: 1.16,
    primaryReach: 1.38,
    primaryTaper: 0.9,
    trunkHeight: 0.52,
    trunkTaper: 1,
    upForce: 0.018,
  }),
  columnar: Object.freeze({
    crownStartScale: 0.9,
    primaryAngleScale: 0.58,
    primaryReach: 0.55,
    primaryTaper: 0.76,
    trunkHeight: 1,
    trunkTaper: 0.91,
    upForce: 0.08,
  }),
  weeping: Object.freeze({
    crownStartScale: 0.84,
    primaryAngleScale: 1.08,
    primaryReach: 1.18,
    primaryTaper: 0.84,
    trunkHeight: 0.62,
    trunkTaper: 0.98,
    upForce: -0.025,
  }),
});

// Structural controls shared by recursive tree systems: a finite branch
// spawn band, generation-specific length/radius/child decay, independent
// trunk and branch noise, and a modest endpoint response toward light.
// These are architecture defaults; exact species can override every value.
const WOODY_AXIS_GENERATION_RULES = Object.freeze({
  monopodial: Object.freeze({
    branchSpawnEnd: 0.94,
    branchNoise: 0.1,
    endpointGrowthBias: 0.12,
    levelChildDecay: 0.6,
    levelLengthDecay: 0.44,
    levelRadiusDecay: 0.58,
    trunkNoise: 0.035,
  }),
  excurrent: Object.freeze({
    branchSpawnEnd: 0.95,
    branchNoise: 0.1,
    endpointGrowthBias: 0.14,
    levelChildDecay: 0.6,
    levelLengthDecay: 0.45,
    levelRadiusDecay: 0.58,
    trunkNoise: 0.035,
  }),
  'sparse-excurrent': Object.freeze({
    branchSpawnEnd: 0.9,
    branchNoise: 0.17,
    endpointGrowthBias: 0.08,
    levelChildDecay: 0.56,
    levelLengthDecay: 0.46,
    levelRadiusDecay: 0.58,
    trunkNoise: 0.075,
  }),
  layered: Object.freeze({
    branchSpawnEnd: 0.92,
    branchNoise: 0.08,
    endpointGrowthBias: 0.1,
    levelChildDecay: 0.62,
    levelLengthDecay: 0.46,
    levelRadiusDecay: 0.6,
    trunkNoise: 0.03,
  }),
  decurrent: Object.freeze({
    branchSpawnEnd: 0.84,
    branchNoise: 0.17,
    endpointGrowthBias: 0.1,
    levelChildDecay: 0.72,
    levelLengthDecay: 0.56,
    levelRadiusDecay: 0.66,
    trunkNoise: 0.09,
  }),
  sympodial: Object.freeze({
    branchSpawnEnd: 0.74,
    branchNoise: 0.2,
    endpointGrowthBias: 0.07,
    levelChildDecay: 0.75,
    levelLengthDecay: 0.58,
    levelRadiusDecay: 0.68,
    trunkNoise: 0.1,
  }),
  vase: Object.freeze({
    branchSpawnEnd: 0.56,
    branchNoise: 0.15,
    endpointGrowthBias: 0.05,
    levelChildDecay: 0.76,
    levelLengthDecay: 0.61,
    levelRadiusDecay: 0.7,
    trunkNoise: 0.07,
  }),
  colonized: Object.freeze({
    branchSpawnEnd: 0.88,
    branchNoise: 0.13,
    endpointGrowthBias: 0.08,
    levelChildDecay: 0.68,
    levelLengthDecay: 0.52,
    levelRadiusDecay: 0.64,
    trunkNoise: 0.055,
  }),
  umbrella: Object.freeze({
    branchSpawnEnd: 0.92,
    branchNoise: 0.16,
    endpointGrowthBias: 0.025,
    levelChildDecay: 0.74,
    levelLengthDecay: 0.62,
    levelRadiusDecay: 0.68,
    trunkNoise: 0.085,
  }),
  spreading: Object.freeze({
    branchSpawnEnd: 0.86,
    branchNoise: 0.16,
    endpointGrowthBias: 0.045,
    levelChildDecay: 0.74,
    levelLengthDecay: 0.6,
    levelRadiusDecay: 0.68,
    trunkNoise: 0.08,
  }),
  columnar: Object.freeze({
    branchSpawnEnd: 0.96,
    branchNoise: 0.07,
    endpointGrowthBias: 0.18,
    levelChildDecay: 0.56,
    levelLengthDecay: 0.4,
    levelRadiusDecay: 0.56,
    trunkNoise: 0.025,
  }),
  weeping: Object.freeze({
    branchSpawnEnd: 0.88,
    branchNoise: 0.14,
    endpointGrowthBias: 0.16,
    levelChildDecay: 0.72,
    levelLengthDecay: 0.58,
    levelRadiusDecay: 0.66,
    trunkNoise: 0.07,
  }),
});

function growWoody(builder, profile, traits, rng, stageScale, stageSlot) {
  const { axis, segment, attachment } = builder;
  const axisMode = traits.crownMode ?? profile.axisMode ?? 'decurrent';
  const mode = WOODY_MODE_RULES[axisMode] ?? WOODY_MODE_RULES.decurrent;
  const development = clamp01(
    builder.graph.developmentProgress ?? stageSlot / 4,
  );
  const height = traits.height * stageScale;
  const trunkHeightFraction = Math.max(
    0.28,
    Math.min(1, traits.trunkHeightScale ?? mode.trunkHeight),
  );
  const matureTrunkHeight = traits.height * trunkHeightFraction;
  const trunkHeight = matureTrunkHeight * stageScale;
  const trunkRadius = traits.trunkRadius * Math.max(0.48, stageScale ** 0.72);
  const tipRadius = Math.max(0.008, trunkRadius * 0.018);
  const configuredLevels = Math.max(1, Math.min(4, Math.round(traits.levels ?? 3)));
  // Axis births are continuous below; do not round age to a different
  // generator topology. A given seed grows one stable maximum scaffold.
  const maxLevel = Math.max(2, configuredLevels);
  const generationRules = WOODY_AXIS_GENERATION_RULES[axisMode]
    ?? WOODY_AXIS_GENERATION_RULES.decurrent;
  const lengthRatio = Math.max(
    0.28,
    Math.min(
      0.72,
      traits.levelLengthDecay ?? traits.lengthRatio ?? generationRules.levelLengthDecay,
    ),
  );
  const radiusRatio = Math.max(
    0.38,
    Math.min(
      0.82,
      traits.levelRadiusDecay ?? traits.radiusRatio ?? generationRules.levelRadiusDecay,
    ),
  );
  const childDecay = Math.max(
    0.35,
    Math.min(0.9, traits.levelChildDecay ?? generationRules.levelChildDecay),
  );
  const branchingExponent = Math.max(
    0.5,
    Math.min(2.4, traits.branchingExponent ?? 1.1),
  );
  const branchNoise = Math.max(0, traits.branchNoise ?? generationRules.branchNoise);
  const trunkNoise = Math.max(0, traits.trunkNoise ?? generationRules.trunkNoise);
  const endpointGrowthBias = Math.max(
    0,
    Math.min(0.3, traits.endpointGrowthBias ?? generationRules.endpointGrowthBias),
  );
  const gnarliness = Math.max(0, traits.gnarliness ?? (0.08 + traits.gnarl * 0.22));
  const forceStrength = axisMode === 'umbrella' || axisMode === 'spreading'
    ? Math.min(0, Number(traits.forceStrength) || 0)
    : Number.isFinite(traits.forceStrength)
      ? traits.forceStrength
      : mode.upForce;
  const phyllotaxisAngle = Number.isFinite(traits.phyllotaxisAngle)
    ? traits.phyllotaxisAngle * Math.PI / 180
    : 2.399963229728653;
  const gravitropism = Number.isFinite(traits.gravitropism)
    ? traits.gravitropism
    : axisMode === 'umbrella' || axisMode === 'spreading'
      ? 0
      : Math.max(0, forceStrength) * 1.9;
  const phototropism = Math.max(
    0,
    Number(traits.phototropism)
      || (axisMode === 'umbrella' || axisMode === 'spreading' ? 0.004 : 0.035),
  );
  const branchSag = Math.max(
    0,
    Number.isFinite(traits.branchSag)
      ? traits.branchSag
      : axisMode === 'weeping'
        ? 0.13
        : Math.max(0, -forceStrength) * 1.8 + 0.012,
  );
  const tipUpturn = Math.max(
    0,
    Number.isFinite(traits.tipUpturn)
      ? traits.tipUpturn
      : axisMode === 'weeping' ? 0.11
        : axisMode === 'umbrella' || axisMode === 'spreading' ? 0.004
          : endpointGrowthBias,
  );
  const lightDirection = Array.isArray(traits.lightDirection)
    ? normalizeVector(traits.lightDirection)
    : [0.28, 0.95, 0.16];
  const windDirection = Array.isArray(traits.windDirection)
    ? normalizeVector(traits.windDirection)
    : [1, 0, 0.18];
  const windBias = Number(traits.windBias) || 0;
  const foliageSprayScale = Array.isArray(traits.foliageSprayScaleStages)
    ? traits.foliageSprayScaleStages[
      Math.min(stageSlot, traits.foliageSprayScaleStages.length - 1)
    ] ?? 1
    : 1;
  const foliageDensityScale = Array.isArray(traits.foliageDensityScaleStages)
    ? traits.foliageDensityScaleStages[
      Math.min(stageSlot, traits.foliageDensityScaleStages.length - 1)
    ] ?? 1
    : 1;
  const branchAngle = Math.max(
    12,
    Math.min(112, traits.branchAngle * (traits.primaryAngleScale ?? mode.primaryAngleScale)),
  )
    * Math.PI / 180;
  const twist = Number(traits.twist) || 0;
  const bend = Number(traits.bend) || traits.gnarl * 0.08;
  // Section count is a geometric resolution choice, not a life-stage trait.
  // Changing it with age consumed a different number of RNG samples before
  // branch growth, so a mature tree became an unrelated silhouette when the
  // user moved the age control to old or ancient.
  const trunkSections = Math.max(6, Math.round(traits.trunkSections ?? 10));
  const leanHeading = rng() * Math.PI * 2;
  const bendHeading = leanHeading + Math.PI * (0.35 + rng() * 0.3);
  const profileLean = traits.lean <= 0.25 ? traits.lean * height : traits.lean;
  const trunkAxis = axis('primary-trunk', null, { axisMode, level: 0 });
  const trunkRings = [{
    direction: [0, 1, 0],
    parentPartId: null,
    position: [0, 0, 0],
    radius: trunkRadius,
  }];
  let trunkParentPartId = null;
  let trunkPosition = [0, 0, 0];
  for (let sectionIndex = 0; sectionIndex < trunkSections; sectionIndex += 1) {
    const startT = sectionIndex / trunkSections;
    const endT = (sectionIndex + 1) / trunkSections;
    const startRadius = Math.max(
      tipRadius * 2.4,
      trunkRadius * ((1 - startT) ** mode.trunkTaper * 0.94 + 0.06),
    );
    const endRadius = sectionIndex === trunkSections - 1
      ? Math.max(tipRadius * 2.4, trunkRadius * (axisMode === 'monopodial' ? 0.075 : 0.045))
      : Math.max(
        tipRadius * 2.4,
        trunkRadius * ((1 - endT) ** mode.trunkTaper * 0.94 + 0.06),
      );
    const leanOffset = profileLean * endT ** 1.35;
    const bendOffset = bend * Math.sin(Math.PI * endT);
    const gnarlOffset = trunkNoise * trunkRadius * Math.sin(
      endT * Math.PI * (3.5 + stageSlot) + rng() * 0.35,
    );
    const end = [
      Math.cos(leanHeading) * leanOffset
        + Math.cos(bendHeading) * bendOffset
        + Math.cos(bendHeading + Math.PI / 2) * gnarlOffset,
      trunkHeight * endT,
      Math.sin(leanHeading) * leanOffset
        + Math.sin(bendHeading) * bendOffset
        + Math.sin(bendHeading + Math.PI / 2) * gnarlOffset,
    ];
    const trunkSegment = segment(
      trunkAxis,
      'trunk',
      trunkPosition,
      end,
      startRadius,
      endRadius,
      {
        axisMode,
        baseFlare: sectionIndex === 0
          ? Math.max(
            1,
            Number(traits.baseFlare)
              || (profile.rootProfile === 'standard-flare' ? 1.28 : 1.08),
          )
          : 1,
        baseFlareTransition: sectionIndex === 0
          ? Math.max(0.12, Math.min(0.42, Number(traits.baseFlareTransition) || 0.26))
          : undefined,
        level: 0,
        openEnded: true,
        parentPartId: trunkParentPartId,
        sectionIndex,
      },
    );
    const trunkDirection = normalizeVector([
      end[0] - trunkPosition[0],
      end[1] - trunkPosition[1],
      end[2] - trunkPosition[2],
    ]);
    trunkParentPartId = trunkSegment.partId;
    trunkPosition = end;
    trunkRings.push({
      direction: trunkDirection,
      parentPartId: trunkSegment.partId,
      position: end,
      radius: endRadius,
    });
  }

  const trunkRingAt = (fraction) => {
    const scaled = Math.max(0, Math.min(1, fraction)) * trunkSections;
    const index = Math.min(Math.floor(scaled), trunkSections - 1);
    const alpha = scaled - index;
    const start = trunkRings[index];
    const end = trunkRings[index + 1];
    return {
      direction: normalizeVector(mixVector(start.direction, end.direction, alpha)),
      parentPartId: end.parentPartId,
      position: mixVector(start.position, end.position, alpha),
      radius: start.radius * (1 - alpha) + end.radius * alpha,
    };
  };

  const crownStart = Math.max(
    0.08,
    Math.min(0.78, traits.branchStart * mode.crownStartScale),
  );
  const branchSpawnEnd = Math.max(
    crownStart + 0.12,
    Math.min(0.96, traits.branchSpawnEnd ?? generationRules.branchSpawnEnd),
  );
  const crownSpan = Math.max(0.12, branchSpawnEnd - crownStart);
  const crownEnvelope = {
    bottom: trunkHeight * Math.max(0.04, crownStart * 0.84),
    center: [
      trunkRings.at(-1).position[0],
      trunkHeight * (crownStart + (1 - crownStart) * 0.5),
      trunkRings.at(-1).position[2],
    ],
    mode: axisMode,
    radiusX: Math.max(
      0.2,
      traits.crownWidth * stageScale * 0.5
        * (axisMode === 'umbrella' || axisMode === 'spreading' ? 1.35 : 1),
    ),
    radiusY: Math.max(0.25, height * (1 - crownStart) * 0.58),
    radiusZ: Math.max(
      0.2,
      traits.crownDepth * stageScale * 0.5
        * (axisMode === 'umbrella' || axisMode === 'spreading' ? 1.35 : 1),
    ),
    top: Math.max(trunkHeight, height),
  };
  const axisGrowthAt = (birthProgress, duration = 0.24) =>
    smoothstep(
      birthProgress,
      Math.min(0.5, birthProgress + duration),
      development,
    );

  // Keep the recursive axis tree inside the semantic LOD budget. Multiple
  // decurrent crown leaders spend this budget on real forks instead of
  // multiplying an unbounded full subtree per leader.
  let axisBudget = Math.max(
    80,
    Math.min(220, Math.round(traits.axisBudget ?? 112)),
  );
  const growBranchAxis = ({
    axisKind = 'branch',
    birthProgress = 0.12,
    initialDirection,
    length,
    level,
    origin,
    parentAxisId,
    parentPartId,
    radius,
    terminalContinuation = false,
  }) => {
    const growthScale = axisGrowthAt(
      birthProgress,
      level <= 1 ? 0.22 : 0.18 + level * 0.035,
    );
    const matureLength = length;
    const grownLength = matureLength * Math.max(0.025, growthScale);
    const grownRadius = radius * Math.max(0.22, Math.sqrt(growthScale));
    const minBranchLength = Math.max(0.025, Number(traits.minBranchLength) || 0.08);
    const minBranchRadiusScale = Math.max(
      0.15,
      Number(traits.minBranchRadiusScale) || 0.45,
    );
    if (
      axisBudget <= 0
      || growthScale < 0.001
      // Topology decisions use the species-normalized mature length. A
      // branch must not appear merely because age scales the same scaffold
      // past an absolute world-unit threshold.
      || matureLength < minBranchLength * Math.max(0.01, stageScale)
      || radius <= tipRadius * minBranchRadiusScale
    ) return;
    axisBudget -= 1;
    const branchAxis = axis(axisKind, parentAxisId, {
      axisMode,
      birthProgress: Number(birthProgress.toFixed(4)),
      growthScale: Number(growthScale.toFixed(4)),
      level,
      terminalContinuation,
    });
    const leafLevel = level >= maxLevel;
    const sectionCount = leafLevel ? 2 : Math.max(3, 6 - Math.min(level, 4));
    const rings = [{
      direction: normalizeVector(initialDirection),
      parentPartId,
      position: [...origin],
      radius: grownRadius,
    }];
    let currentDirection = normalizeVector(initialDirection);
    let currentPosition = [...origin];
    let currentParentPartId = parentPartId;
    for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
      const startT = sectionIndex / sectionCount;
      const endT = (sectionIndex + 1) / sectionCount;
      const startRadius = Math.max(
        tipRadius * (leafLevel ? 0.65 : 1.15),
        grownRadius * (1 - startT * (leafLevel ? 0.9 : 0.7)),
      );
      const endRadius = sectionIndex === sectionCount - 1 && leafLevel
        ? tipRadius * 0.38
        : Math.max(
          tipRadius * (leafLevel ? 0.65 : 1.15),
          grownRadius * (1 - endT * (leafLevel ? 0.9 : 0.7)),
        );
      currentDirection = constrainDirectionToCrown(
        currentPosition,
        currentDirection,
        grownLength / sectionCount,
        crownEnvelope,
      );
      const end = addScaled(
        currentPosition,
        currentDirection,
        grownLength / sectionCount,
      );
      const branchSegment = segment(
        branchAxis,
        leafLevel ? 'twig' : 'branch',
        currentPosition,
        end,
        startRadius,
        Math.max(endRadius, tipRadius * 0.25),
        {
          axisMode,
          birthProgress: Number(birthProgress.toFixed(4)),
          growthScale: Number(growthScale.toFixed(4)),
          level,
          openEnded: true,
          parentPartId: currentParentPartId,
          sectionIndex,
          terminalContinuation,
        },
      );
      currentParentPartId = branchSegment.partId;
      currentPosition = end;
      const thinness = Math.sqrt(trunkRadius / Math.max(endRadius, tipRadius));
      const wobble = (gnarliness * 0.42 + branchNoise)
        * (0.12 + level * 0.16) * Math.min(2.2, thinness);
      const compliance = forceStrength * Math.min(4, trunkRadius / Math.max(endRadius, tipRadius));
      currentDirection = wanderDirection(
        currentDirection,
        rng,
        wobble,
        compliance,
      );
      currentDirection = applyAxisTropisms(currentDirection, {
        branchSag,
        development,
        gravitropism,
        level,
        lightDirection,
        phototropism,
        sectionProgress: endT,
        slenderness: Math.min(4, thinness),
        tipUpturn,
        windBias,
        windDirection,
      });
      rings.push({
        direction: currentDirection,
        parentPartId: branchSegment.partId,
        position: end,
        radius: Math.max(endRadius, tipRadius * 0.25),
      });
    }

    const ringAt = (fraction) => {
      const scaled = Math.max(0, Math.min(1, fraction)) * sectionCount;
      const index = Math.min(Math.floor(scaled), sectionCount - 1);
      const alpha = scaled - index;
      const start = rings[index];
      const end = rings[index + 1];
      return {
        direction: normalizeVector(mixVector(start.direction, end.direction, alpha)),
        parentPartId: end.parentPartId,
        position: mixVector(start.position, end.position, alpha),
        radius: start.radius * (1 - alpha) + end.radius * alpha,
      };
    };

    if (leafLevel) {
      if (growthScale < 0.3) return;
      const foliageSites = Math.max(1, Math.min(3, Math.round(grownLength / 0.8)));
      for (let siteIndex = 0; siteIndex < foliageSites; siteIndex += 1) {
        // Foliage-site placement must not advance the structural RNG stream.
        // Its count may increase as an existing twig grows, and consuming
        // random samples here used to reroll every subsequently generated
        // axis when the age control moved from mature to old. A stable
        // per-axis hash keeps leaf placement varied without changing the
        // mature scaffold topology.
        const siteJitter = traits.stableMatureTopology
          ? hashString(`${branchAxis.id}:${siteIndex}:foliage-site`) / 4294967296
          : rng();
        const fraction = 0.28
          + ((siteIndex + 0.45 + siteJitter * 0.25) / foliageSites) * 0.68;
        const ring = ringAt(fraction);
        attachment(
          profile.foliageOrgan,
          ring.position,
          ring.direction,
          Math.max(
            0.04,
            Math.max(0.12, traits.crownWidth * stageScale * 0.045)
              * smoothstep(0.3, 0.72, growthScale),
          ),
          ring.parentPartId,
          {
            axisMode,
            densityScale: foliageDensityScale,
            foliageSprayScale,
            level,
          },
        );
      }
      const tip = rings.at(-1);
      attachment(
        profile.foliageOrgan,
        tip.position,
        tip.direction,
        Math.max(
          0.05,
          Math.max(0.14, traits.crownWidth * stageScale * 0.052)
            * smoothstep(0.3, 0.72, growthScale),
        ),
        tip.parentPartId,
        {
          axisMode,
          densityScale: foliageDensityScale,
          foliageSprayScale,
          level,
          terminal: true,
        },
      );
      return;
    }

    const nextLevel = level + 1;
    const generationLengthRatio = Math.max(
      0.24,
      lengthRatio * Math.pow(0.9, Math.max(0, level - 1) * branchingExponent),
    );
    const tip = rings.at(-1);
    growBranchAxis({
      axisKind: 'leader-continuation',
      birthProgress: Math.min(0.48, birthProgress + 0.045 + level * 0.018),
      initialDirection: tip.direction,
      length: matureLength * generationLengthRatio * (0.9 + rng() * 0.18),
      level: nextLevel,
      origin: tip.position,
      parentAxisId: branchAxis.id,
      parentPartId: tip.parentPartId,
      radius: Math.max(tipRadius, tip.radius),
      terminalContinuation: true,
    });

    const lateralCap = level === 1 ? 3 : 2;
    const lateralChildTarget = Math.max(
      1,
      Number(traits.lateralChildTarget) || Number(traits.children) || 5,
    );
    const baseLateralCount = Math.max(
      1,
      Math.min(
        lateralCap,
        Math.round(lateralChildTarget * 0.42 * childDecay ** (level - 1)),
      ),
    );
    const additionalLateralChance = Math.max(
      0,
      Math.min(1, Number(traits.additionalLateralChanceByLevel?.[level]) || 0),
    );
    const additionalLateralSample = hashString(
      `${branchAxis.id}:${level}:additional-lateral`,
    ) / 4294967296;
    const lateralCount = Math.min(
      lateralCap,
      baseLateralCount + (
        additionalLateralChance > additionalLateralSample ? 1 : 0
      ),
    );
    const levelT = maxLevel <= 1 ? 0 : Math.min(1, (level - 1) / (maxLevel - 1));
    const earlySpawnStart = traits.lateralSpawnStart ?? 0.32;
    const lateSpawnStart = traits.lateralSpawnStartLate ?? 0.46;
    const earlySpawnEnd = traits.lateralSpawnEnd ?? 0.88;
    const lateSpawnEnd = traits.lateralSpawnEndLate ?? 0.78;
    const lateralSpawnStart = earlySpawnStart * (1 - levelT) + lateSpawnStart * levelT;
    const lateralSpawnEnd = earlySpawnEnd * (1 - levelT) + lateSpawnEnd * levelT;
    for (let childIndex = 0; childIndex < lateralCount; childIndex += 1) {
      const fraction = lateralSpawnStart
        + ((childIndex + 0.35 + rng() * 0.3) / lateralCount)
          * Math.max(0.12, lateralSpawnEnd - lateralSpawnStart);
      const ring = ringAt(fraction);
      const azimuth = childIndex * phyllotaxisAngle + level * 1.17 + rng() * 0.7;
      const childAngle = Math.min(
        Math.PI * 0.48,
        branchAngle * (level === 1 ? 0.86 : 0.68) * (0.88 + rng() * 0.22),
      );
      growBranchAxis({
        birthProgress: Math.min(
          0.48,
          birthProgress + 0.065 + level * 0.024 + childIndex * 0.006,
        ),
        initialDirection: childDirection(ring.direction, azimuth, childAngle),
        length: matureLength * generationLengthRatio * (0.8 + rng() * 0.22),
        level: nextLevel,
        origin: ring.position,
        parentAxisId: branchAxis.id,
        parentPartId: ring.parentPartId,
        radius: Math.max(tipRadius, ring.radius * radiusRatio),
      });
    }
  };

  const primaryCountScale = axisMode === 'sparse-excurrent' ? 0.75
    : axisMode === 'columnar' ? 0.9
      : axisMode === 'vase' ? 0.82
        : axisMode === 'colonized' ? 1.18
          : 1;
  const authoredPrimaryCount = Number.isFinite(traits.primaryBranchCount)
    ? Math.round(traits.primaryBranchCount)
    : null;
  const internodePrimaryCount = Number.isFinite(traits.branchInternodeSpacing)
    ? Math.max(
      1,
      Math.round(
        matureTrunkHeight * crownSpan / Math.max(0.08, traits.branchInternodeSpacing),
      ),
    )
    : null;
  const primaryCount = authoredPrimaryCount == null
    ? Math.max(
      axisMode === 'vase' ? 4 : 3,
      Math.min(
        24,
        internodePrimaryCount
          ?? Math.round(traits.children * primaryCountScale),
      ),
    )
    : Math.max(axisMode === 'vase' ? 4 : 3, authoredPrimaryCount);
  if (axisMode === 'colonized') {
    const radiusX = Math.max(0.45, traits.crownWidth * stageScale * 0.5);
    const radiusZ = Math.max(0.45, traits.crownDepth * stageScale * 0.5);
    const radiusY = Math.max(0.55, height * (1 - crownStart) * 0.46);
    const crownCenter = [
      trunkRings.at(-1).position[0],
      trunkHeight * crownStart + radiusY * 0.92,
      trunkRings.at(-1).position[2],
    ];
    const attractionCount = Math.max(
      24,
      Math.min(180, Math.round(traits.attractionCount ?? 92)),
    );
    let attractionPoints = [];
    while (attractionPoints.length < attractionCount) {
      const point = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
      if (point[0] ** 2 + point[1] ** 2 + point[2] ** 2 > 1) continue;
      // A mild top-light bias gives the attraction field more volume near the
      // photosynthetically productive crown surface without collapsing it
      // into a perfect dome.
      const vertical = Math.sign(point[1]) * Math.abs(point[1]) ** 0.78;
      attractionPoints.push([
        crownCenter[0] + point[0] * radiusX,
        crownCenter[1] + vertical * radiusY,
        crownCenter[2] + point[2] * radiusZ,
      ]);
    }

    const stepLength = Math.max(
      0.12,
      Math.min(0.9, traits.segmentLength ?? Math.max(radiusX, radiusZ) * 0.115),
    );
    const influenceRadius = Math.max(
      stepLength * 2,
      traits.influenceRadius ?? Math.max(radiusX, radiusZ) * 0.46,
    );
    const killDistance = Math.max(
      stepLength * 0.7,
      traits.killRadius ?? stepLength * 1.18,
    );
    const colonizedNodes = [];
    const seedCount = Math.max(4, Math.min(8, primaryCount));
    for (let seed = 0; seed < seedCount; seed += 1) {
      const attachFraction = crownStart
        + ((seed + 0.4 + rng() * 0.2) / seedCount) * crownSpan * 0.82;
      const ring = trunkRingAt(Math.min(0.9, attachFraction));
      const azimuth = seed / seedCount * Math.PI * 2 + rng() * 0.24;
      const seedDirection = childDirection(
        ring.direction,
        azimuth,
        branchAngle * (0.78 + rng() * 0.18),
      );
      colonizedNodes.push({
        children: [],
        direction: seedDirection,
        parentAxisId: trunkAxis.id,
        parentNode: null,
        parentPartId: ring.parentPartId,
        parentRadius: ring.radius,
        position: addScaled(ring.position, seedDirection, stepLength),
        start: ring.position,
      });
    }

    const iterations = Math.max(5, Math.round(7 + development * 10));
    for (let iteration = 0; iteration < iterations && attractionPoints.length; iteration += 1) {
      const assignments = new Map();
      const survivingAttractors = [];
      for (const attractor of attractionPoints) {
        let closestIndex = -1;
        let closestDistance = Infinity;
        for (let nodeIndex = 0; nodeIndex < colonizedNodes.length; nodeIndex += 1) {
          const node = colonizedNodes[nodeIndex];
          if (node.children.length >= 2) continue;
          const distance = vectorLength([
            attractor[0] - node.position[0],
            attractor[1] - node.position[1],
            attractor[2] - node.position[2],
          ]);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = nodeIndex;
          }
        }
        if (closestDistance <= killDistance) continue;
        survivingAttractors.push(attractor);
        if (closestIndex < 0 || closestDistance > influenceRadius) continue;
        const entries = assignments.get(closestIndex) ?? [];
        entries.push(normalizeVector([
          attractor[0] - colonizedNodes[closestIndex].position[0],
          attractor[1] - colonizedNodes[closestIndex].position[1],
          attractor[2] - colonizedNodes[closestIndex].position[2],
        ]));
        assignments.set(closestIndex, entries);
      }
      attractionPoints = survivingAttractors;
      if (!assignments.size) break;
      const newNodes = [];
      for (const [nodeIndex, attractionDirections] of assignments.entries()) {
        const source = colonizedNodes[nodeIndex];
        const average = attractionDirections.reduce(
          (sum, value) => [
            sum[0] + value[0],
            sum[1] + value[1],
            sum[2] + value[2],
          ],
          [0, 0, 0],
        );
        let growthDirection = normalizeVector(mixVector(
          normalizeVector(average),
          source.direction,
          0.24,
        ));
        growthDirection = wanderDirection(
          growthDirection,
          rng,
          gnarliness * 0.18,
          mode.upForce * 0.45,
        );
        growthDirection = applyAxisTropisms(growthDirection, {
          branchSag: branchSag * 0.45,
          development,
          gravitropism: gravitropism * 0.5,
          level: 2,
          lightDirection,
          phototropism,
          sectionProgress: iteration / Math.max(1, iterations - 1),
          slenderness: 1.5,
          tipUpturn,
          windBias,
          windDirection,
        });
        growthDirection = constrainDirectionToCrown(
          source.position,
          growthDirection,
          stepLength,
          crownEnvelope,
        );
        const newNode = {
          children: [],
          direction: growthDirection,
          parentAxisId: null,
          parentNode: nodeIndex,
          parentPartId: null,
          parentRadius: null,
          position: addScaled(source.position, growthDirection, stepLength),
          start: source.position,
        };
        source.children.push(colonizedNodes.length + newNodes.length);
        newNodes.push(newNode);
      }
      colonizedNodes.push(...newNodes);
      if (colonizedNodes.length >= Math.max(
        24,
        Math.min(180, Math.round(traits.maxNodes ?? 125)),
      )) break;
    }

    const terminalLoads = new Array(colonizedNodes.length).fill(1);
    for (let index = colonizedNodes.length - 1; index >= 0; index -= 1) {
      const node = colonizedNodes[index];
      terminalLoads[index] = node.children.length
        ? node.children.reduce((sum, childIndex) => sum + terminalLoads[childIndex], 0)
        : 1;
    }
    for (let nodeIndex = 0; nodeIndex < colonizedNodes.length; nodeIndex += 1) {
      const node = colonizedNodes[nodeIndex];
      const parentNode = node.parentNode == null ? null : colonizedNodes[node.parentNode];
      const parentPartId = parentNode?.partId ?? node.parentPartId;
      const parentAxisId = parentNode?.axisId ?? node.parentAxisId;
      const pipeRadius = Math.max(
        tipRadius * 0.52,
        tipRadius * 1.7 * Math.sqrt(terminalLoads[nodeIndex]),
      );
      const startRadius = node.parentNode == null
        ? Math.min(node.parentRadius * 0.72, pipeRadius * 1.32)
        : Math.max(pipeRadius, parentNode.radius);
      const colonizedAxis = axis('colonized-crown-axis', parentAxisId, {
        algorithm: 'space-colonization',
        axisMode,
        level: node.parentNode == null ? 1 : 2,
      });
      const branchSegment = segment(
        colonizedAxis,
        node.children.length ? 'branch' : 'twig',
        node.start,
        node.position,
        startRadius,
        pipeRadius,
        {
          algorithm: 'space-colonization',
          axisMode,
          openEnded: true,
          parentPartId,
          terminalLoad: terminalLoads[nodeIndex],
        },
      );
      node.axisId = colonizedAxis.id;
      node.partId = branchSegment.partId;
      node.radius = pipeRadius;
      if (!node.children.length) {
        attachment(
          profile.foliageOrgan,
          node.position,
          node.direction,
          Math.max(0.18, traits.crownWidth * stageScale * 0.052),
          branchSegment.partId,
          {
            algorithm: 'space-colonization',
            axisMode,
            terminal: true,
          },
        );
      }
    }
    return;
  }

  const totalRatio = 1 + lengthRatio + lengthRatio ** 2;
  const primaryWhorlSize = Math.max(
    1,
    Math.min(8, Math.round(traits.branchWhorlSize ?? 1)),
  );
  const primaryWhorlCount = Math.ceil(primaryCount / primaryWhorlSize);
  const primaryWhorlAttachmentFractions = new Map();
  for (let index = 0; index < primaryCount; index += 1) {
    const whorlIndex = Math.floor(index / primaryWhorlSize);
    const armInWhorl = index % primaryWhorlSize;
    let attachFraction = primaryWhorlAttachmentFractions.get(whorlIndex);
    if (attachFraction == null) {
      attachFraction = crownStart
        + ((whorlIndex + 0.35 + rng() * 0.2) / primaryWhorlCount) * crownSpan;
      primaryWhorlAttachmentFractions.set(whorlIndex, attachFraction);
    }
    if (axisMode === 'vase') {
      attachFraction = crownStart + (attachFraction - crownStart) * 0.22;
    }
    if (axisMode === 'umbrella') attachFraction = Math.max(0.7, attachFraction);
    if (axisMode === 'layered') {
      attachFraction = crownStart + Math.round(
        ((attachFraction - crownStart) / crownSpan) * 3,
      ) / 3 * crownSpan;
    }
    const ring = trunkRingAt(Math.min(0.94, attachFraction));
    const distributionJitter = traits.evenBranchDistribution === false ? 0.72 : 0.22;
    const azimuth = (
      primaryWhorlSize > 1
        ? armInWhorl / primaryWhorlSize * Math.PI * 2
          + whorlIndex * phyllotaxisAngle
        : index * phyllotaxisAngle
    )
      + attachFraction * twist
      + (rng() - 0.5) * distributionJitter;
    const angle = branchAngle * (0.9 + rng() * 0.2);
    let initialDirection = childDirection(ring.direction, azimuth, angle);
    if (axisMode === 'umbrella' || axisMode === 'spreading') {
      initialDirection = normalizeVector([initialDirection[0], initialDirection[1] * 0.4, initialDirection[2]]);
    } else if (axisMode === 'columnar') {
      initialDirection = normalizeVector([
        initialDirection[0] * 0.48,
        Math.max(0.28, initialDirection[1] * 1.45),
        initialDirection[2] * 0.48,
      ]);
    } else if (axisMode === 'weeping') {
      initialDirection = normalizeVector([
        initialDirection[0],
        initialDirection[1] - 0.34,
        initialDirection[2],
      ]);
    }
    const radiusX = Math.max(0.2, traits.crownWidth * stageScale * 0.5);
    const radiusZ = Math.max(0.2, traits.crownDepth * stageScale * 0.5);
    const ellipticalRadius = 1 / Math.sqrt(
      (Math.cos(azimuth) / radiusX) ** 2 + (Math.sin(azimuth) / radiusZ) ** 2,
    );
    const topTaper = [
      'monopodial',
      'excurrent',
      'sparse-excurrent',
      'columnar',
    ].includes(axisMode)
      ? (1 - attachFraction * mode.primaryTaper)
      : (0.82 + (1 - attachFraction) * (1 - mode.primaryTaper));
    const primaryLength = ellipticalRadius
      * Math.max(0.5, Math.min(1.8, traits.primaryReachScale ?? mode.primaryReach))
      * Math.max(0.42, topTaper) / totalRatio * (0.88 + rng() * 0.2);
    growBranchAxis({
      birthProgress: Math.min(
        0.2,
        0.04 + index / Math.max(1, primaryCount - 1) * 0.14,
      ),
      initialDirection,
      length: primaryLength,
      level: 1,
      origin: ring.position,
      parentAxisId: trunkAxis.id,
      parentPartId: ring.parentPartId,
      radius: Math.max(tipRadius * 2, ring.radius * radiusRatio * 0.82),
    });
  }

  const trunkTip = trunkRings.at(-1);
  if ([
    'monopodial',
    'excurrent',
    'sparse-excurrent',
    'layered',
    'columnar',
  ].includes(axisMode)) {
    attachment(
      profile.foliageOrgan,
      trunkTip.position,
      trunkTip.direction,
      Math.max(0.18, traits.crownWidth * stageScale * 0.05),
      trunkTip.parentPartId,
      { axisMode, leaderTip: true },
    );
  } else {
    const defaultCrownLeaders = axisMode === 'vase' || axisMode === 'sympodial'
      ? 2
      : ['decurrent', 'umbrella', 'spreading', 'weeping'].includes(axisMode)
        ? 3
        : 1;
    const crownLeaders = Math.max(
      1,
      Math.min(5, Math.round(traits.crownLeaderCount ?? defaultCrownLeaders)),
    );
    for (let leaderIndex = 0; leaderIndex < crownLeaders; leaderIndex += 1) {
      const azimuth = leaderIndex / crownLeaders * Math.PI * 2 + rng() * 0.5;
      const angle = axisMode === 'umbrella'
        ? Math.PI * 0.42
        : axisMode === 'spreading'
          ? Math.PI * 0.4
          : axisMode === 'weeping'
            ? Math.PI * 0.36
        : axisMode === 'vase'
          ? branchAngle * 0.92
          : axisMode === 'sympodial'
            ? branchAngle * 0.68
            : axisMode === 'decurrent'
              ? branchAngle * Math.max(
                0.5,
                Math.min(1.2, traits.crownLeaderAngleScale ?? 0.72),
              )
              : branchAngle * 0.42;
      const crownLeaderReach = Math.max(
        (height - trunkHeight)
          * Math.max(0.35, Math.min(1.2, traits.crownLeaderLengthScale ?? 1)),
        traits.crownWidth * stageScale * 0.18,
      );
      // Umbrella crowns deliberately spend more of the leader envelope on
      // horizontal reach. Dividing them by the full recursive-series sum
      // made the savanna architecture taller than wide; the reduced divisor
      // still accounts for its recursive continuation without collapsing the
      // defining flat canopy.
      const crownLeaderReachDivisor = axisMode === 'umbrella' || axisMode === 'spreading'
        ? 1
        : totalRatio;
      growBranchAxis({
        axisKind: 'crown-leader',
        birthProgress: Math.min(0.22, 0.08 + leaderIndex * 0.025),
        initialDirection: childDirection(trunkTip.direction, azimuth, angle),
        // `growBranchAxis` adds recursive continuation orders. Primaries
        // already divide their requested total reach across those orders;
        // crown leaders must do the same or they overshoot the crown envelope
        // by almost another full leader length.
        length: crownLeaderReach / crownLeaderReachDivisor,
        level: 1,
        origin: trunkTip.position,
        parentAxisId: trunkAxis.id,
        parentPartId: trunkTip.parentPartId,
        radius: Math.max(
          tipRadius * 2,
          trunkTip.radius * radiusRatio,
          trunkRadius * radiusRatio * (
            ['decurrent', 'umbrella', 'spreading', 'weeping'].includes(axisMode)
              ? 0.28
              : 0.2
          ),
        ),
      });
    }
  }
}

function growConifer(builder, profile, traits, rng, stageScale, stageSlot) {
  if (traits.ginkgoBranching) {
    growWoody(
      builder,
      { ...profile, axisMode: 'monopodial' },
      {
        ...traits,
        branchAngle: Math.min(58, traits.branchAngle),
        children: Math.max(4, Math.min(6, traits.children)),
      },
      rng,
      stageScale,
      stageSlot,
    );
    return;
  }
  const { axis, segment, attachment } = builder;
  const development = clamp01(
    builder.graph.developmentProgress ?? stageSlot / 4,
  );
  const height = traits.height * stageScale;
  const trunkRadius = traits.trunkRadius * Math.max(0.5, stageScale ** 0.72);
  const tipRadius = Math.max(0.007, trunkRadius * 0.016);
  const axisMode = profile.axisMode ?? 'dense';
  const modeRules = {
    deciduous: {
      reach: 1, sparsity: 0.82, sprayCount: 2, whorlExponent: 0.92, whorlScale: 0.82,
    },
    dense: {
      reach: 0.92, sparsity: 0.92, sprayCount: 3, whorlExponent: 0.86, whorlScale: 0.95,
    },
    giant: {
      reach: 1, sparsity: 0.92, sprayCount: 3, whorlExponent: 0.9, whorlScale: 1,
    },
    open: {
      reach: 1.12, sparsity: 0.82, sprayCount: 2, whorlExponent: 1, whorlScale: 0.82,
    },
    relict: {
      reach: 1.04, sparsity: 0.78, sprayCount: 2, whorlExponent: 0.94, whorlScale: 0.72,
    },
    'scale-spray': {
      reach: 0.82, sparsity: 0.95, sprayCount: 4, whorlExponent: 0.84, whorlScale: 1,
    },
    sparse: {
      reach: 1.04, sparsity: 0.64, sprayCount: 2, whorlExponent: 1.06, whorlScale: 0.64,
    },
  };
  const mode = modeRules[axisMode] ?? modeRules.dense;
  const trunkSections = Math.max(8, Math.round(traits.trunkSections ?? 12));
  const trunkAxis = axis('primary-trunk', null, { axisMode, level: 0 });
  const trunkRings = [{
    direction: [0, 1, 0],
    parentPartId: null,
    position: [0, 0, 0],
    radius: trunkRadius,
  }];
  const leanHeading = rng() * Math.PI * 2;
  const profileLean = traits.lean <= 0.25 ? traits.lean * height : traits.lean;
  const bend = Number(traits.bend) || traits.gnarl * 0.05;
  const trunkNoise = Math.max(0, traits.trunkNoise ?? (
    axisMode === 'open' || axisMode === 'sparse' ? 0.06 : 0.025
  ));
  const trunkNoisePhase = rng() * Math.PI * 2;
  let trunkPosition = [0, 0, 0];
  let trunkParentPartId = null;
  for (let sectionIndex = 0; sectionIndex < trunkSections; sectionIndex += 1) {
    const startT = sectionIndex / trunkSections;
    const endT = (sectionIndex + 1) / trunkSections;
    const startRadius = Math.max(tipRadius * 2, trunkRadius * (1 - startT * 0.9));
    const endRadius = sectionIndex === trunkSections - 1
      ? tipRadius * 1.4
      : Math.max(tipRadius * 2, trunkRadius * (1 - endT * 0.9));
    const bendOffset = bend * Math.sin(Math.PI * endT);
    const trunkNoiseOffset = trunkRadius * trunkNoise
      * Math.sin(endT * Math.PI * 5 + trunkNoisePhase);
    const end = [
      Math.cos(leanHeading) * profileLean * endT ** 1.4
        + Math.cos(leanHeading + Math.PI * 0.5) * bendOffset
        + Math.cos(leanHeading + Math.PI * 0.25) * trunkNoiseOffset,
      height * endT,
      Math.sin(leanHeading) * profileLean * endT ** 1.4
        + Math.sin(leanHeading + Math.PI * 0.5) * bendOffset
        + Math.sin(leanHeading + Math.PI * 0.25) * trunkNoiseOffset,
    ];
    const trunkSegment = segment(
      trunkAxis,
      'trunk',
      trunkPosition,
      end,
      startRadius,
      endRadius,
      {
        axisMode,
        level: 0,
        openEnded: true,
        parentPartId: trunkParentPartId,
        sectionIndex,
      },
    );
    const trunkDirection = normalizeVector([
      end[0] - trunkPosition[0],
      end[1] - trunkPosition[1],
      end[2] - trunkPosition[2],
    ]);
    trunkPosition = end;
    trunkParentPartId = trunkSegment.partId;
    trunkRings.push({
      direction: trunkDirection,
      parentPartId: trunkSegment.partId,
      position: end,
      radius: endRadius,
    });
  }

  const trunkRingAt = (fraction) => {
    const scaled = Math.max(0, Math.min(1, fraction)) * trunkSections;
    const index = Math.min(Math.floor(scaled), trunkSections - 1);
    const alpha = scaled - index;
    const start = trunkRings[index];
    const end = trunkRings[index + 1];
    return {
      direction: normalizeVector(mixVector(start.direction, end.direction, alpha)),
      parentPartId: end.parentPartId,
      position: mixVector(start.position, end.position, alpha),
      radius: start.radius * (1 - alpha) + end.radius * alpha,
    };
  };

  const whorlCount = Math.max(
    3,
    Math.min(
      Math.max(3, Math.round(traits.whorlCountMax ?? 24)),
      Math.round(
        (traits.whorlCount ?? 13)
          * mode.whorlScale
          * Math.max(0.5, Math.min(1.5, traits.whorlCountScale ?? 1)),
      ),
    ),
  );
  const crownStart = Math.max(0.06, Math.min(0.78, traits.branchStart));
  const branchSpawnEnd = Math.max(
    crownStart + 0.12,
    Math.min(0.99, traits.branchSpawnEnd ?? 0.92),
  );
  const branchAngle = Math.max(58, Math.min(122, traits.branchAngle)) * Math.PI / 180;
  const lengthRatio = Math.max(0.25, Math.min(0.62, traits.lengthRatio ?? 0.42));
  const radiusRatio = Math.max(0.35, Math.min(0.78, traits.radiusRatio ?? 0.62));
  const gnarliness = Math.max(0, traits.gnarliness ?? (0.04 + traits.gnarl * 0.12));
  const growthForce = Number.isFinite(traits.forceStrength) ? traits.forceStrength : -0.012;
  const branchDroop = Number.isFinite(traits.branchDroop)
    ? -Math.abs(traits.branchDroop)
    : growthForce;
  const branchTipLift = Math.max(0, traits.branchTipLift ?? 0);
  for (let whorl = 0; whorl < whorlCount; whorl += 1) {
    const birthProgress = 0.06
      + whorl / Math.max(1, whorlCount - 1) * 0.32;
    const growthScale = smoothstep(
      birthProgress,
      Math.min(0.5, birthProgress + 0.18),
      development,
    );
    if (growthScale < 0.001) continue;
    const uniformT = (whorl + 1) / (whorlCount + 1);
    const t = uniformT ** (traits.whorlExponent ?? mode.whorlExponent);
    const attachFraction = crownStart + t * (branchSpawnEnd - crownStart);
    const trunkRing = trunkRingAt(attachFraction);
    const arms = Number.isFinite(traits.whorlArmCount)
      ? Math.max(3, Math.min(8, Math.round(traits.whorlArmCount)))
      : Math.max(
        3,
        Math.round(traits.children * mode.sparsity * (0.54 + rng() * 0.12)),
      );
    const silhouette = axisMode === 'open'
      ? 0.52 + Math.sin(t * Math.PI) * 0.5
      : axisMode === 'sparse'
        ? 0.34 + Math.sin(t * Math.PI) * 0.55
        : Math.pow(1 - t, 0.72);
    const reach = traits.crownWidth * stageScale * 0.5
      * Math.max(0.16, silhouette) * mode.reach;
    for (let arm = 0; arm < arms; arm += 1) {
      const azimuth = arm / arms * Math.PI * 2 + whorl * 0.71 + rng() * 0.18;
      let branchDirection = childDirection(
        trunkRing.direction,
        azimuth,
        branchAngle * (0.92 + rng() * 0.14),
      );
      const branchAxis = axis('whorl-branch', trunkAxis.id, { axisMode, level: 1, whorl });
      const sectionCount = Math.max(
        3,
        Math.min(7, Math.round(traits.branchSections ?? 4)),
      );
      const branchLength = reach * (0.82 + rng() * 0.22)
        * Math.max(0.03, growthScale);
      let branchPosition = [...trunkRing.position];
      let branchParentPartId = trunkRing.parentPartId;
      let branchRadius = Math.max(
        tipRadius * 2,
        trunkRing.radius * radiusRatio * (0.72 + silhouette * 0.16),
      ) * Math.max(0.24, Math.sqrt(growthScale));
      const branchRings = [];
      for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
        const startT = sectionIndex / sectionCount;
        const endT = (sectionIndex + 1) / sectionCount;
        const startRadius = Math.max(tipRadius, branchRadius * (1 - startT * 0.82));
        const endRadius = Math.max(
          tipRadius * 0.55,
          branchRadius * (1 - endT * 0.82),
        );
        const end = addScaled(branchPosition, branchDirection, branchLength / sectionCount);
        const branchSegment = segment(
          branchAxis,
          'branch',
          branchPosition,
          end,
          startRadius,
          endRadius,
          {
            axisMode,
            birthProgress: Number(birthProgress.toFixed(4)),
            growthScale: Number(growthScale.toFixed(4)),
            level: 1,
            openEnded: true,
            parentPartId: branchParentPartId,
            sectionIndex,
            whorl,
          },
        );
        branchPosition = end;
        branchParentPartId = branchSegment.partId;
        branchRings.push({
          direction: branchDirection,
          parentPartId: branchSegment.partId,
          position: end,
          radius: endRadius,
        });
        const sectionT = (sectionIndex + 1) / sectionCount;
        const liftT = Math.max(0, Math.min(1, (sectionT - 0.52) / 0.48));
        const sectionGrowthForce = branchTipLift > 0
          ? branchDroop * (1 - liftT) + branchTipLift * liftT ** 2
          : growthForce;
        branchDirection = wanderDirection(
          branchDirection,
          rng,
          gnarliness * (0.22 + sectionIndex * 0.08),
          sectionGrowthForce * Math.min(3, trunkRadius / Math.max(endRadius, tipRadius)),
        );
        branchDirection = applyAxisTropisms(branchDirection, {
          branchSag: Math.max(0.012, Math.abs(branchDroop) * 1.6),
          development,
          gravitropism: Math.max(0, Number(traits.gravitropism) || 0.018),
          level: 1,
          lightDirection: traits.lightDirection,
          phototropism: Math.max(0, Number(traits.phototropism) || 0.02),
          sectionProgress: sectionT,
          slenderness: Math.min(3, trunkRadius / Math.max(endRadius, tipRadius)),
          tipUpturn: branchTipLift,
          windBias: Number(traits.windBias) || 0,
          windDirection: traits.windDirection,
        });
      }

      const sprayCount = Math.max(
        1,
        Math.min(5, Math.round(traits.sprayCount ?? mode.sprayCount)),
      );
      for (let spray = 0; spray < sprayCount; spray += 1) {
        const ringIndex = Math.min(branchRings.length - 1, Math.max(
          1,
          Math.round(
            1 + spray / Math.max(1, sprayCount - 1) * (branchRings.length - 2),
          ),
        ));
        const ring = branchRings[ringIndex];
        let sprayDirection = childDirection(
          ring.direction,
          azimuth + (spray % 2 === 0 ? 1 : -1) * (1.38 + spray * 0.47),
          Math.PI * (0.12 + rng() * 0.09),
        );
        const sprayDroop = Math.max(0, Math.min(0.5, traits.sprayDroop ?? 0));
        if (sprayDroop > 0) {
          sprayDirection = normalizeVector([
            sprayDirection[0],
            sprayDirection[1] - sprayDroop * (0.78 + spray * 0.12),
            sprayDirection[2],
          ]);
        }
        const along = (ringIndex + 1) / branchRings.length;
        const sprayEnvelope = Math.sin(Math.PI * Math.min(0.96, along));
        const sprayLength = branchLength * lengthRatio
          * (0.32 + sprayEnvelope * 0.28 + rng() * 0.16);
        const sprayEnd = addScaled(ring.position, sprayDirection, sprayLength);
        const sprayAxis = axis('needle-spray', branchAxis.id, {
          axisMode,
          level: 2,
          whorl,
        });
        const spraySegment = segment(
          sprayAxis,
          'twig',
          ring.position,
          sprayEnd,
          Math.max(tipRadius * 0.8, ring.radius * radiusRatio),
          tipRadius * 0.35,
          {
            axisMode,
            level: 2,
            openEnded: true,
            parentPartId: ring.parentPartId,
            whorl,
          },
        );
        attachment(
          profile.foliageOrgan,
          sprayEnd,
          sprayDirection,
          Math.max(0.14, sprayLength * 0.42),
          spraySegment.partId,
          { axisMode, level: 2, whorl },
        );
      }
    }
  }
  const leaderSprayCount = Math.max(
    1,
    Math.min(5, Math.round(traits.leaderSprayCount ?? 1)),
  );
  const leaderSprayStart = Math.max(
    0.72,
    Math.min(0.98, traits.leaderSprayStart ?? 1),
  );
  for (let leaderSpray = 0; leaderSpray < leaderSprayCount; leaderSpray += 1) {
    const fraction = leaderSprayCount === 1
      ? 1
      : leaderSprayStart
        + leaderSpray / (leaderSprayCount - 1) * (1 - leaderSprayStart);
    const leaderRing = trunkRingAt(fraction);
    attachment(
      profile.foliageOrgan,
      leaderRing.position,
      leaderRing.direction,
      Math.max(0.08, traits.leaderClusterRadius ?? traits.crownWidth * stageScale * 0.075),
      leaderRing.parentPartId,
      {
        axisMode,
        cardsPerCluster: traits.leaderCardsPerCluster,
        clusterRadius: traits.leaderClusterRadius,
        leaderTip: leaderSpray === leaderSprayCount - 1,
        organType: 'conifer-leader-tip',
        whorlRadius: traits.leaderWhorlRadius,
      },
    );
  }
}

function growBamboo(builder, profile, traits, rng, stageScale, stageSlot) {
  const { axis, segment, attachment } = builder;
  const axisMode = profile.axisMode ?? 'clumping';
  const culmStageScales = Array.isArray(traits.bambooCulmCountStageScales)
    ? traits.bambooCulmCountStageScales
    : [1, 1, 1, 0.72, 1];
  const culmCountByStage = [
    1,
    1,
    1,
    Math.max(4, Math.round(traits.stemCount * (culmStageScales[3] ?? 0.72))),
    Math.max(1, Math.round(traits.stemCount * (culmStageScales[4] ?? 1))),
  ];
  const culmCount = Math.max(1, culmCountByStage[stageSlot]);
  const branchCount = Math.max(1, Math.min(5, Math.round(traits.children ?? 2)));
  for (let culm = 0; culm < culmCount; culm += 1) {
    const angle = culm * 2.399963 + rng() * 0.5;
    const colonySpread = traits.culmColonySpread
      ?? (axisMode === 'running' ? 0.34 : 0.18);
    const spread = stageSlot < 2
      ? 0
      : traits.crownWidth * stageScale * colonySpread * Math.sqrt(culm / culmCount) * (0.65 + rng() * 0.5);
    const base = [Math.cos(angle) * spread, 0, Math.sin(angle) * spread];
    const stageHeight = (
      Array.isArray(traits.bambooHeightStages)
        ? traits.bambooHeightStages
        : [0.2, 0.46, 0.76, 0.94, 1]
    )[stageSlot];
    const ageBand = stageSlot === 4
      // A mixed grove is not fourteen evenly stepped Christmas-tree tiers:
      // most visible culms are full-height mature stems, with a small cohort
      // of genuinely younger culms below their canopy.
      ? culm < Math.ceil(culmCount * 0.2)
        ? 0.48 + rng() * 0.24
        : 0.82 + rng() * 0.18
      : stageSlot === 3
        ? 0.72 + rng() * 0.28
      : 0.86 + rng() * 0.14;
    const culmHeight = traits.height * stageHeight * ageBand;
    const radiusStage = (
      Array.isArray(traits.bambooRadiusStages)
        ? traits.bambooRadiusStages
        : [0.55, 0.65, 0.82, 0.94, 1]
    )[stageSlot];
    const radius = traits.trunkRadius * radiusStage * (0.82 + rng() * 0.25);
    const nodeStage = (
      Array.isArray(traits.bambooNodeStages)
        ? traits.bambooNodeStages
        : [0.36, 0.58, 0.78, 0.92, 1]
    )[stageSlot];
    const nodeCount = Math.max(
      4,
      Math.round(traits.nodeCount * nodeStage * (0.94 + rng() * 0.1)),
    );
    const culmAxis = axis('culm', null, { axisMode, culm });
    // Pachymorph clumps fan gently away from their shared rhizome mass.
    // Running bamboo keeps a looser, less coordinated heading.
    const swayHeading = axisMode === 'clumping'
      ? angle + (rng() - 0.5) * 0.34
      : angle + (rng() - 0.5) * 0.8;
    const outwardLean = axisMode === 'clumping'
      ? traits.lean * (0.72 + Math.sqrt(culm / Math.max(1, culmCount)) * 0.55)
      : traits.lean;
    const swayDistance = culmHeight * (outwardLean + rng() * 0.012);
    const sideBow = culmHeight * (0.004 + rng() * 0.008);
    const culmPoint = (t) => [
      base[0]
        + Math.cos(swayHeading) * swayDistance * t ** 2
        + Math.cos(swayHeading + Math.PI / 2) * sideBow * Math.sin(Math.PI * t),
      culmHeight * t,
      base[2]
        + Math.sin(swayHeading) * swayDistance * t ** 2
        + Math.sin(swayHeading + Math.PI / 2) * sideBow * Math.sin(Math.PI * t),
    ];
    let parentPartId = null;
    for (let node = 0; node < nodeCount; node += 1) {
      const startT = node / nodeCount;
      const endT = (node + 1) / nodeCount;
      const start = culmPoint(startT);
      const end = culmPoint(endT);
      const culmTaperAt = (t) => {
        if (stageSlot === 0) {
          const shootBase = Math.max(1, traits.shootBaseRadiusScale ?? 1.2);
          const shootTip = Math.max(0.04, Math.min(0.3, traits.shootTipRadiusScale ?? 0.1));
          return shootBase + (shootTip - shootBase) * t ** 0.72;
        }
        const taperStart = Math.max(0.45, Math.min(0.9, traits.culmTaperStart ?? 0.66));
        const tipTaper = Math.max(0.2, Math.min(0.7, traits.culmTipTaper ?? 0.48));
        const taperT = Math.max(0, Math.min(1, (t - taperStart) / (1 - taperStart)));
        return 1 - taperT * tipTaper;
      };
      const internode = segment(culmAxis, 'internode', start, end,
        radius * culmTaperAt(startT), radius * culmTaperAt(endT), {
          axisMode,
          culm,
          node,
          openEnded: true,
          parentPartId,
        });
      parentPartId = internode.partId;
      const nodeRadius = radius * culmTaperAt(endT);
      if (stageSlot === 0) {
        // A bamboo shoot is not a naked cone. Every young internode is
        // enclosed by an overlapping culm sheath whose triangular blade
        // reaches past the next node. The open wrap and alternating spiral
        // preserve the layered silhouette in front, side, and back views.
        const sheathEndT = startT + (endT - startT) * 0.92;
        const sheathEnd = culmPoint(sheathEndT);
        const sheathBodyScale = Math.max(1.02, traits.culmSheathBodyScale ?? 1.08);
        const sheathRadiusStart = radius * culmTaperAt(startT) * sheathBodyScale;
        const sheathRadiusEnd = radius * culmTaperAt(sheathEndT) * (
          sheathBodyScale * 0.98
        );
        segment(
          culmAxis,
          'culm-sheath',
          start,
          sheathEnd,
          sheathRadiusStart,
          sheathRadiusEnd,
          {
            axisMode,
            culm,
            geometryKind: 'culm-sheath',
            level: 0,
            node,
            parentPartId: internode.partId,
            sheathAzimuth: node * 2.399963 + culm * 0.47,
            sheathBladeLength: (endT - startT) * culmHeight
              * Math.max(0.25, traits.culmSheathBladeLength ?? 0.52),
            sheathBladeOutset: Math.max(1.05, traits.culmSheathBladeOutset ?? 1.3),
            sheathTwist: (node % 2 === 0 ? 1 : -1) * (0.08 + rng() * 0.08),
            sheathWrap: Math.PI * 1.72,
          },
        );
      }
      segment(culmAxis, 'node', [end[0], end[1] - nodeRadius * 0.32, end[2]],
        [end[0], end[1] + nodeRadius * 0.32, end[2]],
        nodeRadius * 1.16, nodeRadius * 1.16, {
          axisMode,
          culm,
          node,
          parentPartId: internode.partId,
      });
      const normalizedNode = node / Math.max(1, nodeCount - 1);
      const branchNodeInterval = Math.max(
        1,
        Math.round(traits.branchNodeInterval ?? (stageSlot < 2 ? 3 : 2)),
      );
      const branchStartStages = Array.isArray(traits.bambooBranchStartStages)
        ? traits.bambooBranchStartStages
        : [
          1,
          Math.max(traits.juvenileBranchStart ?? 0.68, traits.branchStart),
          Math.max(0.52, traits.branchStart),
          traits.branchStart,
          traits.branchStart,
        ];
      const configuredBranchStart = branchStartStages[stageSlot] ?? traits.branchStart;
      const stageBranchStart = stageSlot === 4
        // A mixed-age clump contains shorter culms whose leafy branch
        // complements begin lower in absolute height. The bounded age
        // adjustment preserves the documented mid-culm origin on its
        // full-height culms instead of branching them from the ground.
        ? Math.max(0.18, configuredBranchStart - (1 - ageBand) * 0.18)
        : configuredBranchStart;
      const branchEligible = stageSlot > 0
        && normalizedNode >= stageBranchStart
        && (node + culm) % branchNodeInterval === 0;
      if (branchEligible) {
        // Bambusa carries a true branch complement at each eligible node,
        // usually with one visibly dominant primary branch. Juvenile culms
        // begin with single axes before that complement develops.
        const branchesAtNode = stageSlot < 2
          ? Math.max(1, Math.min(2, Math.round(traits.juvenileBranchesPerNode ?? 1)))
          : Math.max(2, Math.min(branchCount, 3 + (node % 2)));
        const nodeHeading = swayHeading
          + node * 2.399963
          + Math.sin(culm * 1.7 + node * 0.63) * 0.18;
        for (let branchIndex = 0; branchIndex < branchesAtNode; branchIndex += 1) {
          const branchAzimuth = nodeHeading
            + (branchIndex - (branchesAtNode - 1) * 0.5) * 0.48
            + (rng() - 0.5) * 0.12;
          const branchElevation = branchIndex === 0
            ? (traits.dominantBranchElevation ?? 0.62)
              + normalizedNode * 0.1
              + (rng() - 0.5) * (traits.dominantBranchElevationJitter ?? 0.18)
            : (traits.secondaryBranchElevation ?? 0.76)
              + normalizedNode * 0.08
              + (rng() - 0.5) * (traits.secondaryBranchElevationJitter ?? 0.16);
          const branchDirection = direction(branchAzimuth, branchElevation);
          const branchScale = branchIndex === 0
            ? traits.dominantBranchScale ?? 1
            : traits.secondaryBranchScale ?? 0.58;
          // Real Bambusa crowns are broadest through the middle and upper
          // crown, then shorten again at the apex. A monotonic length ramp
          // made every culm read as a conifer. This bounded envelope keeps
          // the node-born complement while breaking that triangular outline.
          const crownT = Math.max(
            0,
            Math.min(1, (normalizedNode - stageBranchStart) / Math.max(0.01, 1 - stageBranchStart)),
          );
          const crownEnvelope = (traits.bambooCrownEnvelopeBase ?? 0.58)
            + (traits.bambooCrownEnvelopeAmplitude ?? 0.68)
              * Math.sin(Math.PI * crownT) ** 0.72;
          const nodeIrregularity = 0.82
            + 0.22 * Math.sin(node * 1.73 + culm * 0.91 + branchIndex * 1.27)
            + rng() * 0.14;
          const branchLength = traits.crownWidth * stageScale
            * (
              (traits.bambooBranchLengthBase ?? 0.16)
              + normalizedNode * (traits.bambooBranchLengthHeight ?? 0.05)
              + rng() * (traits.bambooBranchLengthJitter ?? 0.055)
            )
            * branchScale
            * crownEnvelope
            * nodeIrregularity
            * Math.max(0.75, traits.bambooBranchReachScale ?? 1);
          const branchMid = addScaled(end, branchDirection, branchLength * 0.58);
          const tipDirection = wanderDirection(
            branchDirection,
            rng,
            0.11,
            -(traits.bambooBranchTipDroop ?? 0.08)
              * (branchIndex === 0 ? 0.75 : 1),
          );
          const branchEnd = addScaled(branchMid, tipDirection, branchLength * 0.42);
          const branchAxis = axis('node-branch', culmAxis.id, {
            axisMode,
            branchIndex,
            dominant: branchIndex === 0,
            culm,
            node,
          });
          const lowerBranch = segment(
            branchAxis,
            'branch',
            end,
            branchMid,
            radius * 0.3,
            radius * 0.13,
            {
              axisMode,
              branchIndex,
              culm,
              dominant: branchIndex === 0,
              level: 2,
              node,
              openEnded: true,
              parentPartId: internode.partId,
            },
          );
          const upperBranch = segment(
            branchAxis,
            'twig',
            branchMid,
            branchEnd,
            radius * 0.13,
            Math.max(0.006, radius * 0.035),
            {
              axisMode,
              branchIndex,
              culm,
              dominant: branchIndex === 0,
              level: 3,
              node,
              parentPartId: lowerBranch.partId,
            },
          );
          // Bambusa branch complements are dendroid, not bare sticks with
          // terminal tufts. Every primary carries a leafy branchlet, while
          // the dominant primary carries three. This creates the documented
          // dense, irregular spray without faking a spherical foliage blob.
          if (stageSlot >= 1) {
            const branchletCount = stageSlot === 1
              ? branchIndex === 0
                ? Math.max(1, Math.round(traits.juvenileDominantBranchlets ?? 1))
                : Math.max(0, Math.round(traits.juvenileSecondaryBranchlets ?? 0))
              : branchIndex === 0
                ? Math.max(
                  1,
                  Math.round(traits.dominantBranchletCount ?? 3) - (stageSlot === 4 ? 2 : 0),
                )
                : Math.max(
                  1,
                  Math.round(traits.secondaryBranchletCount ?? 1) - (stageSlot === 4 ? 2 : 0),
                );
            for (let twigIndex = 0; twigIndex < branchletCount; twigIndex += 1) {
              const branchletStart = addScaled(
                branchMid,
                tipDirection,
                branchLength * (0.05 + twigIndex * 0.12),
              );
              const branchletSide = twigIndex % 2 === 0 ? -1 : 1;
              const branchletAzimuth = branchAzimuth
                + branchletSide * (0.36 + twigIndex * 0.14)
                + (rng() - 0.5) * 0.16;
              const branchletElevation = (traits.bambooBranchletElevation ?? 0.66)
                + normalizedNode * 0.1
                + twigIndex * (traits.bambooBranchletElevationStep ?? 0.06)
                + (rng() - 0.5) * (traits.bambooBranchletElevationJitter ?? 0.18);
              const branchletDirection = direction(branchletAzimuth, branchletElevation);
              const branchletLength = branchLength * (
                branchIndex === 0
                  ? (traits.bambooBranchletLengthScale ?? 0.32) + twigIndex * 0.025
                  : (traits.bambooBranchletLengthScale ?? 0.32) * 0.9
              );
              const branchletEnd = addScaled(
                branchletStart,
                branchletDirection,
                branchletLength,
              );
              const branchletAxis = axis('leafy-branchlet', branchAxis.id, {
                axisMode,
                branchIndex,
                culm,
                node,
                twigIndex,
              });
              const branchlet = segment(
                branchletAxis,
                'twig',
                branchletStart,
                branchletEnd,
                radius * 0.08,
                Math.max(0.004, radius * 0.025),
                {
                  axisMode,
                  branchIndex,
                  culm,
                  level: 4,
                  node,
                  parentPartId: upperBranch.partId,
                  twigIndex,
                },
              );
              if (stageSlot >= 2) {
                // Mature Bambusa foliage is ramified: the fine axes fork
                // again before carrying their alternating leaf rows. Two
                // smaller semantic sprays replace the old single terminal
                // tuft, preserving roughly the same card budget while
                // breaking the flat fern-frond silhouette.
                const sprayCount = Math.max(
                  2,
                  Math.min(3, Math.round(traits.bambooTertiarySprayCount ?? 2)),
                );
                for (let sprayIndex = 0; sprayIndex < sprayCount; sprayIndex += 1) {
                  const spraySide = sprayIndex % 2 === 0 ? -1 : 1;
                  const sprayStart = addScaled(
                    branchletStart,
                    branchletDirection,
                    branchletLength * (0.46 + sprayIndex * 0.12),
                  );
                  const sprayAzimuth = branchletAzimuth
                    + spraySide * (traits.bambooTertiaryAzimuth ?? 0.48)
                    + (rng() - 0.5) * 0.22;
                  const sprayElevation = branchletElevation
                    + spraySide * (traits.bambooTertiaryElevationSpread ?? 0.2)
                    + (rng() - 0.5) * (traits.bambooTertiaryElevationJitter ?? 0.24);
                  const sprayDirection = direction(sprayAzimuth, sprayElevation);
                  const sprayLength = branchletLength
                    * (traits.bambooTertiaryLengthScale ?? 0.54)
                    * (1 - sprayIndex * 0.08);
                  const sprayEnd = addScaled(sprayStart, sprayDirection, sprayLength);
                  const sprayAxis = axis('leafy-spray', branchletAxis.id, {
                    axisMode,
                    branchIndex,
                    culm,
                    node,
                    sprayIndex,
                    twigIndex,
                  });
                  const spray = segment(
                    sprayAxis,
                    'twig',
                    sprayStart,
                    sprayEnd,
                    Math.max(0.0035, radius * 0.022),
                    Math.max(0.0025, radius * 0.012),
                    {
                      axisMode,
                      branchIndex,
                      culm,
                      level: 5,
                      node,
                      parentPartId: branchlet.partId,
                      sprayIndex,
                      twigIndex,
                    },
                  );
                  attachment(
                    'bamboo-leaf',
                    sprayEnd,
                    sprayDirection,
                    Math.max(0.12, sprayLength * 0.42),
                    spray.partId,
                    {
                      axisMode,
                      branchIndex,
                      cardsPerCluster: Math.max(
                        3,
                        Math.round(traits.bambooTertiaryLeafCount ?? 4),
                      ),
                      culm,
                      bambooLeafLengthScale: traits.bambooLeafLengthScale ?? 1,
                      bambooSingleBladeCards: Boolean(traits.bambooSingleBladeCards),
                      bambooLeafWidthScale: traits.bambooLeafWidthScale ?? 1,
                      leafRunLength: sprayLength * (traits.bambooLeafRunScale ?? 0.68),
                      node,
                      sprayIndex,
                      twigIndex,
                    },
                  );
                }
              } else {
                attachment(
                  'bamboo-leaf',
                  branchletEnd,
                  branchletDirection,
                  Math.max(0.14, branchletLength * 0.34),
                  branchlet.partId,
                  {
                    axisMode,
                    branchIndex,
                    cardsPerCluster: Math.max(
                      3,
                      Math.round(traits.bambooJuvenileLeafCount ?? 7),
                    ),
                    culm,
                    bambooLeafLengthScale: traits.bambooLeafLengthScale ?? 1,
                    bambooSingleBladeCards: Boolean(traits.bambooSingleBladeCards),
                    bambooLeafWidthScale: traits.bambooLeafWidthScale ?? 1,
                    leafRunLength: branchletLength * (traits.bambooLeafRunScale ?? 0.68),
                    node,
                    twigIndex,
                  },
                );
              }
            }
          }
          attachment(
            'bamboo-leaf',
            branchEnd,
            tipDirection,
            Math.max(0.14, branchLength * 0.28),
            upperBranch.partId,
            {
              axisMode,
              branchIndex,
              cardsPerCluster: Math.max(
                3,
                Math.round(
                  stageSlot === 1
                    ? traits.bambooJuvenileLeafCount ?? 7
                    : traits.bambooPrimaryLeafCount ?? 5,
                ),
              ),
              culm,
              bambooLeafLengthScale: traits.bambooLeafLengthScale ?? 1,
              bambooSingleBladeCards: Boolean(traits.bambooSingleBladeCards),
              bambooLeafWidthScale: traits.bambooLeafWidthScale ?? 1,
              leafRunLength: branchLength * (traits.bambooLeafRunScale ?? 0.68),
              node,
            },
          );
        }
      }
    }
  }
}

function growTerminalCrown(builder, profile, traits, rng, stageScale, stageSlot) {
  const { axis, segment, attachment } = builder;
  const isClumping = profile.architectureId === 'branching-clustering-palm';
  const isCycad = profile.axisMode === 'cycad';
  const isTreeFern = profile.axisMode === 'tree-fern';
  const requestedStems = isClumping
    ? [
      1,
      Math.max(2, Math.round(traits.stemCount * 0.45)),
      Math.max(3, Math.round(traits.stemCount * 0.72)),
      Math.max(3, traits.stemCount),
      Math.max(4, traits.stemCount + 2),
    ][stageSlot]
    : 1;
  const heightStages = Array.isArray(traits.terminalHeightStages)
    ? traits.terminalHeightStages
    : traits.acaulescent
    ? [0.025, 0.04, 0.055, 0.07, 0.08]
    : isCycad
      ? [0.06, 0.2, 0.42, 0.72, 1]
      : [0.045, 0.22, 0.5, 0.78, 1];
  const addTerminalCrown = ({
    crownAxisId,
    crownDirection = [0, 1, 0],
    crownPartId,
    crownPosition,
    stem,
    terminalIndex = 0,
    sizeScale = 1,
  }) => {
    const stagedFrondCount = Array.isArray(traits.frondCountStages)
      ? traits.frondCountStages[stageSlot]
      : null;
    const frondCount = Math.max(5, Math.round(
      (stagedFrondCount ?? traits.frondCount * (0.42 + stageSlot * 0.145)) * sizeScale,
    ));
    const frondLength = traits.crownWidth * Math.max(0.22, stageScale) * 0.46 * sizeScale;
    const crownArch = traits.crownArch ?? (isTreeFern ? 0.15 : isCycad ? 0.18 : 0.2);
    const crownDroop = traits.crownDroop ?? (isTreeFern ? 0.78 : 0.48);
    const crownDropScale = traits.crownDropScale
      ?? (isTreeFern ? 0.34 : 0.25);
    const juvenileEntireLeaf = Boolean(
      traits.juvenileEntireLeaves
      && profile.foliageOrgan === 'pinnate-frond'
      && stageSlot === 0,
    );
    const stagedLeafletPairs = Array.isArray(traits.leafletPairsStages)
      ? traits.leafletPairsStages[stageSlot]
      : null;
    const leafletPairs = profile.foliageOrgan === 'pinnate-frond'
      ? juvenileEntireLeaf
        ? 0
        : Math.max(
          7,
          Math.round(stagedLeafletPairs ?? traits.leafletPairs ?? (8 + stageSlot * 1.5)),
        )
      : profile.foliageOrgan === 'fern-frond'
        ? Math.max(9, Math.round(traits.leafletPairs ?? (10 + stageSlot * 2)))
        : 0;
    const crownAttachment = attachment(
      profile.foliageOrgan,
      crownPosition,
      crownDirection,
      frondLength,
      crownPartId,
      {
        crownArch,
        crownDropScale,
        crownDroop,
        emergingLeafletScale: traits.emergingLeafletScale ?? 1,
        crownshaft: Boolean(traits.crownshaft),
        frondCount,
        juvenileEntireLeaf,
        leafletLengthScale: traits.leafletLengthScale ?? 1,
        leafletLengthRatio: traits.leafletLengthRatio ?? 0.16,
        leafletPairs,
        leafletWidthScale: traits.leafletWidthScale ?? 1,
        pinnaAlongJitter: traits.pinnaAlongJitter ?? 0,
        pinnaDownfold: traits.pinnaDownfold ?? 0.34,
        pinnaDownfoldJitter: traits.pinnaDownfoldJitter ?? 0,
        pinnaLengthJitter: traits.pinnaLengthJitter ?? 0,
        pinnaRoll: traits.pinnaRoll ?? 0.24,
        pinnaTipSweep: traits.pinnaTipSweep ?? 0.08,
        organType: profile.foliageOrgan,
        stem,
        terminalCrown: true,
        terminalIndex,
        uprightFrondFraction: traits.uprightFrondFraction ?? (isTreeFern ? 0.18 : 0.2),
      },
    );

    // Palms, cycads, and tree ferns do not carry detached leaf blobs at the
    // apex. Every crown leaf has a persistent, curved rachis radiating from
    // the terminal meristem; pinnate leaflets are placed around these axes by
    // the organ generator. Keeping the rachises in the semantic graph also
    // lets every LOD preserve the defining starburst silhouette.
    const crownVector = normalizeVector(crownDirection);
    const { tangent, bitangent } = radialFrame(crownVector);
    const frondSections = profile.foliageOrgan === 'fan-frond'
      ? 3
      : profile.foliageOrgan === 'fern-frond'
        ? 6
        : 7;
    for (let frond = 0; frond < frondCount; frond += 1) {
      const azimuth = frond / frondCount * Math.PI * 2
        + terminalIndex * 0.41
        + (rng() - 0.5) * 0.08;
      const radial = normalizeVector([
        tangent[0] * Math.cos(azimuth) + bitangent[0] * Math.sin(azimuth),
        tangent[1] * Math.cos(azimuth) + bitangent[1] * Math.sin(azimuth),
        tangent[2] * Math.cos(azimuth) + bitangent[2] * Math.sin(azimuth),
      ]);
      const uprightFraction = traits.uprightFrondFraction ?? (isTreeFern ? 0.18 : 0.2);
      // Leaf age is distributed around the crown instead of occupying one
      // contiguous azimuth sector. A golden-ratio phase makes emerging
      // upright leaves alternate with mature spreading leaves.
      const uprightT = (frond * 0.6180339887498949) % 1;
      const emergence = uprightT < uprightFraction
        ? 1 - uprightT / Math.max(uprightFraction, 1e-4)
        : 0;
      const radialReach = 1 - emergence * 0.48;
      const length = frondLength * (0.82 + rng() * 0.18);
      const frondAxis = axis('terminal-frond', crownAxisId, {
        frond,
        organType: profile.foliageOrgan,
        stem,
        terminalIndex,
      });
      let frondPosition = crownPosition;
      let frondParentPartId = crownPartId;
      const localFrondSections = juvenileEntireLeaf ? 1 : frondSections;
      for (let sectionIndex = 0; sectionIndex < localFrondSections; sectionIndex += 1) {
        const t = (sectionIndex + 1) / localFrondSections;
        const lift = Math.sin(t * Math.PI) * length * crownArch;
        const emergenceLift = length * emergence * t * (isCycad ? 0.58 : 0.72);
        const drop = length * crownDroop * (1 - emergence) * t ** 1.7
          * crownDropScale;
        const end = [
          crownPosition[0] + radial[0] * length * radialReach * t
            + crownVector[0] * (lift + emergenceLift - drop),
          crownPosition[1] + radial[1] * length * radialReach * t
            + crownVector[1] * (lift + emergenceLift - drop),
          crownPosition[2] + radial[2] * length * radialReach * t
            + crownVector[2] * (lift + emergenceLift - drop),
        ];
        const startT = sectionIndex / localFrondSections;
        const rachis = segment(
          frondAxis,
          'frond-rachis',
          frondPosition,
          end,
          Math.max(
            juvenileEntireLeaf ? 0.0035 : 0.006,
            traits.trunkRadius * (juvenileEntireLeaf ? 0.035 : 0.075) * (1 - startT * 0.66),
          ),
          Math.max(
            juvenileEntireLeaf ? 0.0015 : 0.0025,
            traits.trunkRadius * (juvenileEntireLeaf ? 0.035 : 0.075) * (1 - t * 0.8),
          ),
          {
            frond,
            organType: profile.foliageOrgan,
            parentPartId: frondParentPartId,
            sectionIndex,
            stem,
            terminalIndex,
          },
        );
        frondPosition = end;
        frondParentPartId = rachis.partId;
      }
    }
    return crownAttachment;
  };
  for (let stem = 0; stem < requestedStems; stem += 1) {
    const angle = stem * 2.399963 + rng() * 0.24;
    const normalizedStem = requestedStems <= 1 ? 0 : stem / (requestedStems - 1);
    const spread = requestedStems === 1
      ? 0
      : traits.crownWidth * Math.max(0.32, stageScale)
        * (0.035 + Math.sqrt(normalizedStem) * (traits.acaulescent ? 0.23 : 0.12));
    const base = [Math.cos(angle) * spread, 0, Math.sin(angle) * spread];
    const ageScale = stem === 0 ? 1 : 0.48 + rng() * 0.48;
    const height = traits.height * heightStages[stageSlot] * ageScale;
    const stemAxis = axis('terminal-stem', null, {
      axisMode: profile.axisMode,
      growthUnit: 'persistent-terminal-meristem',
      stem,
    });
    const sections = Math.max(
      3,
      Math.round((isCycad ? 4 : 5) + stageSlot * (isCycad ? 1.4 : 2.6)),
    );
    const stemLean = (traits.palmLean ?? traits.lean) * height * (0.55 + rng() * 0.55);
    const leanHeading = angle + (rng() - 0.5) * 1.1;
    const curveHeading = leanHeading + Math.PI * 0.5;
    const stemCurve = (traits.palmCurve ?? 0) * height * (0.7 + rng() * 0.6);
    const isEntireLeafJuvenile = Boolean(
      traits.juvenileEntireLeaves
      && profile.foliageOrgan === 'pinnate-frond'
      && stageSlot === 0,
    );
    const baseRadius = traits.trunkRadius * (
      isEntireLeafJuvenile
        ? 0.34
        : Math.max(isCycad ? 0.72 : 0.48, (0.45 + stageSlot * 0.14) * ageScale ** 0.35)
    );
    let position = base;
    let parentPartId = null;
    let tipDirection = [0, 1, 0];
    for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
      const startT = sectionIndex / sections;
      const endT = (sectionIndex + 1) / sections;
      const crownshaftBulge = traits.crownshaft
        ? 1 + Math.exp(-((endT - 0.88) ** 2) / 0.009) * 0.22
        : 1;
      const end = [
        base[0] + Math.cos(leanHeading) * stemLean * endT ** 1.55
          + Math.cos(curveHeading) * stemCurve * Math.sin(endT * Math.PI),
        height * endT,
        base[2] + Math.sin(leanHeading) * stemLean * endT ** 1.55
          + Math.sin(curveHeading) * stemCurve * Math.sin(endT * Math.PI),
      ];
      const baseFlare = !isCycad && !isTreeFern
        ? 1 + (traits.palmBaseFlare ?? 0) * Math.exp(-startT / 0.075)
        : 1;
      const endFlare = !isCycad && !isTreeFern
        ? 1 + (traits.palmBaseFlare ?? 0) * Math.exp(-endT / 0.075)
        : 1;
      const startRadius = baseRadius
        * (isCycad
          ? 1 - startT * 0.18
          : (1 - startT * 0.16) * crownshaftBulge * baseFlare);
      const endRadius = baseRadius
        * (isCycad
          ? 1 - endT * 0.18
          : (1 - endT * 0.16) * crownshaftBulge * endFlare);
      const stemSegment = segment(
        stemAxis,
        isCycad ? 'caudex' : isTreeFern ? 'fern-trunk' : 'palm-trunk',
        position,
        end,
        startRadius,
        endRadius,
        {
          axisMode: profile.axisMode,
          leafScarBands: traits.retainedLeafBases ? 5 : 2,
          parentPartId,
          sectionIndex,
          stem,
        },
      );
      tipDirection = normalizeVector([
        end[0] - position[0],
        end[1] - position[1],
        end[2] - position[2],
      ]);
      if (!isCycad && !isTreeFern && !traits.acaulescent && height > 0.5) {
        const bandHalfLength = Math.max(0.008, height / sections * 0.025);
        segment(
          stemAxis,
          'leaf-scar-ring',
          addScaled(end, tipDirection, -bandHalfLength),
          addScaled(end, tipDirection, bandHalfLength),
          endRadius * 1.055,
          endRadius * 1.055,
          {
            axisMode: profile.axisMode,
            parentPartId: stemSegment.partId,
            sectionIndex,
            stem,
          },
        );
      }
      position = end;
      parentPartId = stemSegment.partId;
    }

    if (traits.dichotomousBranching && stageSlot >= 2 && stem === 0) {
      const forkCount = stageSlot >= 4 ? 4 : 2;
      for (let fork = 0; fork < forkCount; fork += 1) {
        const forkAzimuth = fork / forkCount * Math.PI * 2 + angle;
        const forkDirection = childDirection(
          tipDirection,
          forkAzimuth,
          Math.PI * (stageSlot >= 4 ? 0.24 : 0.19),
        );
        const forkLength = height * (stageSlot >= 4 ? 0.2 : 0.14);
        const forkEnd = addScaled(position, forkDirection, forkLength);
        const forkAxis = axis('terminal-fork', stemAxis.id, {
          axisMode: profile.axisMode,
          fork,
          stem,
        });
        const forkSegment = segment(
          forkAxis,
          'palm-branch',
          position,
          forkEnd,
          baseRadius * 0.52,
          baseRadius * 0.34,
          {
            axisMode: profile.axisMode,
            fork,
            parentPartId,
            stem,
          },
        );
        addTerminalCrown({
          crownAxisId: forkAxis.id,
          crownDirection: forkDirection,
          crownPartId: forkSegment.partId,
          crownPosition: forkEnd,
          stem,
          terminalIndex: fork,
          sizeScale: 0.78,
        });
      }
    } else {
      addTerminalCrown({
        crownAxisId: stemAxis.id,
        crownDirection: tipDirection,
        crownPartId: parentPartId,
        crownPosition: position,
        stem,
      });
    }
  }
}

function growRosette(builder, profile, traits, rng, stageScale, stageSlot) {
  const { axis, segment, attachment } = builder;
  const heightRatios = traits.rosetteHeightStages ?? [0.035, 0.38, 0.62, 0.84, 1];
  const forkHeightRatios = traits.rosetteForkHeightStages ?? [1, 1, 0.62, 0.58, 0.54];
  const headTargets = traits.rosetteHeadCountStages ?? [1, 1, 3, 7, 12];
  const leafCountStages = traits.rosetteLeafCountStages ?? [10, 14, 18, 22, 26];
  const height = traits.height * heightRatios[stageSlot];
  const trunkHeight = stageSlot === 0
    ? Math.min(0.14, height * 0.24)
    : height * forkHeightRatios[stageSlot];
  const trunkAxis = axis('rosette-trunk', null, {
    growthUnit: 'terminal-rosette',
    level: 0,
  });
  const trunkSections = [1, 4, 5, 6, 7][stageSlot];
  const trunkLeanHeading = rng() * Math.PI * 2;
  const trunkLean = traits.lean * (0.6 + stageSlot * 0.1);
  const radiusStages = [0.24, 0.52, 0.72, 0.9, 1];
  const baseRadius = traits.trunkRadius * radiusStages[stageSlot];
  let trunkPosition = [0, 0, 0];
  let trunkParentPartId = null;
  const trunkNodes = [];
  let trunkDirection = normalizeVector([
    Math.cos(trunkLeanHeading) * trunkLean,
    1,
    Math.sin(trunkLeanHeading) * trunkLean,
  ]);
  for (let sectionIndex = 0; sectionIndex < trunkSections; sectionIndex += 1) {
    const startT = sectionIndex / trunkSections;
    const endT = (sectionIndex + 1) / trunkSections;
    const sectionStart = [...trunkPosition];
    trunkDirection = wanderDirection(
      trunkDirection,
      rng,
      traits.gnarl * (stageSlot >= 3 ? 0.055 : 0.032),
      0.035,
    );
    const end = addScaled(
      trunkPosition,
      trunkDirection,
      trunkHeight / trunkSections,
    );
    const trunkSegment = segment(
      trunkAxis,
      stageSlot === 0 ? 'caudex' : 'rosette-trunk',
      trunkPosition,
      end,
      baseRadius * (sectionIndex === 0 ? 1.16 : 1 - startT * 0.28),
      baseRadius * (1 - endT * 0.28),
      {
        level: 0,
        parentPartId: trunkParentPartId,
        sectionIndex,
      },
    );
    trunkPosition = end;
    trunkParentPartId = trunkSegment.partId;
    trunkNodes.push({
      direction: trunkDirection,
      parentAxisId: trunkAxis.id,
      parentPartId: trunkParentPartId,
      position: mixVector(sectionStart, trunkPosition, 0.52),
      radius: baseRadius * (1 - (startT * 0.48 + endT * 0.52) * 0.28),
    });
    trunkNodes.push({
      direction: trunkDirection,
      parentAxisId: trunkAxis.id,
      parentPartId: trunkParentPartId,
      position: [...trunkPosition],
      radius: baseRadius * (1 - endT * 0.28),
    });
  }
  const headScale = Math.sqrt(Math.max(1, traits.children ?? 3) / 3);
  const targetHeads = stageSlot < 2
    ? 1
    : Math.max(2, Math.round(headTargets[stageSlot] * headScale));
  const maxDepth = [0, 0, 1, 3, 4][stageSlot];
  const branchBaseLength = traits.crownWidth
    * (traits.rosetteBranchLengthScale ?? 0.34)
    * (0.72 + stageScale * 0.28)
    * (stageSlot === 2 ? 0.58 : stageSlot === 3 ? 0.85 : 1);
  const terminals = [{
    depth: 0,
    direction: trunkDirection,
    origin: trunkPosition,
    parentAxisId: trunkAxis.id,
    parentPartId: trunkParentPartId,
    radius: baseRadius * 0.72,
  }];

  // Joshua-tree branching is pseudo-dichotomous/sympodial and irregular.
  // Grow a requested number of terminal heads by repeatedly splitting one
  // live tip. This preserves the recognizable fork history without forcing
  // every axis through an identical, perfectly balanced binary recursion.
  while (terminals.length < targetHeads) {
    const eligible = terminals
      .map((terminal, index) => ({ index, terminal }))
      .filter(({ terminal }) => terminal.depth < maxDepth);
    if (!eligible.length) break;
    const shallowest = Math.min(...eligible.map(({ terminal }) => terminal.depth));
    const pool = eligible.filter(({ terminal }) =>
      terminal.depth <= shallowest + (rng() < 0.22 ? 1 : 0));
    const selected = pool[Math.floor(rng() * pool.length)];
    const [parentTip] = terminals.splice(selected.index, 1);
    const requiredGain = targetHeads - terminals.length;
    const childCount = Math.min(
      requiredGain,
      requiredGain >= 3 && parentTip.depth === 0 && rng() < 0.42 ? 3 : 2,
    );
    const splitPhase = rng() * Math.PI * 2;
    for (let child = 0; child < childCount; child += 1) {
      const azimuth = splitPhase + child / childCount * Math.PI * 2
        + (rng() - 0.5) * 0.34;
      const baseAngle = Math.PI / 180
        * traits.branchAngle
        * (0.9 + rng() * 0.3)
        * (1 + parentTip.depth * 0.045);
      const outward = childDirection(parentTip.direction, azimuth, baseAngle);
      const childVector = normalizeVector(mixVector(
        outward,
        [0, 1, 0],
        0.05 + parentTip.depth * 0.015,
      ));
      const branchAxis = axis('rosette-dichotomy', parentTip.parentAxisId, {
        child,
        level: parentTip.depth + 1,
        sympodial: true,
      });
      const branchLength = branchBaseLength
        * 0.7 ** parentTip.depth
        * (0.8 + rng() * 0.32);
      const mid = addScaled(parentTip.origin, childVector, branchLength * 0.48);
      const tipVector = wanderDirection(
        childVector,
        rng,
        0.055 + traits.gnarl * 0.12,
        0.045,
      );
      const end = addScaled(mid, tipVector, branchLength * 0.52);
      const childRadius = parentTip.radius
        * (childCount === 3 ? 0.52 : 0.61)
        * (0.94 + rng() * 0.1);
      const lower = segment(
        branchAxis,
        'rosette-branch',
        parentTip.origin,
        mid,
        parentTip.radius,
        childRadius * 1.2,
        {
          child,
          level: parentTip.depth + 1,
          parentPartId: parentTip.parentPartId,
          sympodial: true,
        },
      );
      const upper = segment(
        branchAxis,
        'rosette-branch',
        mid,
        end,
        childRadius * 1.2,
        childRadius,
        {
          child,
          level: parentTip.depth + 1,
          parentPartId: lower.partId,
          sympodial: true,
        },
      );
      terminals.push({
        depth: parentTip.depth + 1,
        direction: tipVector,
        origin: end,
        parentAxisId: branchAxis.id,
        parentPartId: upper.partId,
        radius: childRadius,
      });
    }
  }

  const addRetainedLeafSleeve = ({
    count,
    direction: sleeveDirection,
    length,
    origin,
    parentAxisId,
    parentPartId,
    radius,
    sleeveId,
    terminalIndex = null,
  }) => {
    const { tangent, bitangent } = radialFrame(sleeveDirection);
    for (let leafBaseIndex = 0; leafBaseIndex < count; leafBaseIndex += 1) {
      const ringT = leafBaseIndex / count;
      const azimuth = ringT * Math.PI * 2 + sleeveId * 1.17;
      const radial = normalizeVector([
        tangent[0] * Math.cos(azimuth) + bitangent[0] * Math.sin(azimuth),
        tangent[1] * Math.cos(azimuth) + bitangent[1] * Math.sin(azimuth),
        tangent[2] * Math.cos(azimuth) + bitangent[2] * Math.sin(azimuth),
      ]);
      const skirtAxis = axis('retained-leaf-skirt', parentAxisId, {
        leafBaseIndex,
        sleeveId,
        terminalIndex,
      });
      const axialStart = addScaled(
        origin,
        sleeveDirection,
        -0.035 - ringT * length * 1.08,
      );
      const start = addScaled(axialStart, radial, radius * 0.96);
      const radialStrength = 0.48 + rng() * 0.12;
      const retainedDirection = normalizeVector([
        radial[0] * radialStrength - sleeveDirection[0] * 0.82,
        radial[1] * radialStrength - sleeveDirection[1] * 0.82,
        radial[2] * radialStrength - sleeveDirection[2] * 0.82,
      ]);
      const end = addScaled(
        start,
        retainedDirection,
        length * (0.58 + rng() * 0.34),
      );
      segment(
        skirtAxis,
        'retained-leaf-base',
        start,
        end,
        Math.max(0.015, radius * 0.14),
        0.003,
        {
          parentPartId,
          retained: true,
          sleeveId,
          terminalIndex,
        },
      );
    }
  };

  // Young Joshua trees retain dead leaves around most of the column. The
  // sleeve recedes upward as bark develops, while mature axes keep shorter
  // skirts immediately below their living terminal heads.
  if (stageSlot === 1 || stageSlot === 2) {
    const firstSleevedNode = stageSlot === 1
      ? 0
      : Math.floor(trunkNodes.length * 0.34);
    trunkNodes.slice(firstSleevedNode).forEach((node, nodeIndex) => {
      addRetainedLeafSleeve({
        count: stageSlot === 1 ? 10 : 8,
        direction: node.direction,
        length: (traits.retainedLeafBaseLength ?? 0.3)
          * (stageSlot === 1 ? 1.35 : 1.12),
        origin: node.position,
        parentAxisId: node.parentAxisId,
        parentPartId: node.parentPartId,
        radius: node.radius,
        sleeveId: 100 + nodeIndex,
      });
    });
  }

  const leafCount = Math.max(8, Math.round(leafCountStages[stageSlot]));
  const leafLength = (traits.rosetteLeafLength ?? traits.crownWidth * 0.1)
    * (0.76 + stageScale * 0.24)
    * (stageSlot <= 1 ? 1.2 : stageSlot === 2 ? 1.1 : 1);
  const skirtCount = Math.max(
    4,
    Math.round((traits.retainedLeafBaseCount ?? 8) * (0.46 + stageSlot * 0.13)),
  );
  terminals.forEach((terminal, terminalIndex) => {
    if (stageSlot > 0) {
      addRetainedLeafSleeve({
        count: skirtCount,
        direction: terminal.direction,
        length: (traits.retainedLeafBaseLength ?? leafLength * 0.58)
          * (0.82 + rng() * 0.22),
        origin: terminal.origin,
        parentAxisId: terminal.parentAxisId,
        parentPartId: terminal.parentPartId,
        radius: terminal.radius,
        sleeveId: terminalIndex,
        terminalIndex,
      });
    }
    attachment(
      'rosette-leaf',
      terminal.origin,
      terminal.direction,
      leafLength,
      terminal.parentPartId,
      {
        cardsPerCluster: leafCount,
        clusterRadius: leafLength * 0.18,
        frondCount: leafCount,
        individualRosette: true,
        leafWidthScale: traits.rosetteLeafWidthScale ?? 0.065,
        rosetteHead: true,
        terminalIndex,
      },
    );
  });
}

function growPseudostem(builder, profile, traits, rng, stageScale, stageSlot) {
  const { axis, segment, attachment } = builder;
  const stems = [
    1,
    1,
    1,
    Math.max(3, traits.stemCount + 1),
    Math.max(4, traits.stemCount + 2),
  ][stageSlot];
  const heightStages = Array.isArray(traits.pseudostemHeightStages)
    && traits.pseudostemHeightStages.length === 5
    ? traits.pseudostemHeightStages
    : [0.16, 0.43, 0.72, 0.9, 1];
  for (let stem = 0; stem < stems; stem += 1) {
    const azimuth = stem * 2.399963 + rng() * 0.22;
    const normalizedStem = stems <= 1 ? 0 : stem / (stems - 1);
    const spread = stem === 0
      ? 0
      : traits.crownWidth * stageScale * (0.055 + Math.sqrt(normalizedStem) * 0.15);
    const base = [Math.cos(azimuth) * spread, 0, Math.sin(azimuth) * spread];
    const ageScale = stem === 0 ? 1 : 0.38 + rng() * 0.52;
    const height = traits.height * heightStages[stageSlot] * ageScale;
    const stemAxis = axis('pseudostem', null, {
      growthUnit: traits.woodyPseudostem ? 'branching-monocot' : 'leaf-sheath-pseudostem',
      stem,
    });
    const sections = Math.max(2, 3 + stageSlot);
    const leanHeading = azimuth + (rng() - 0.5) * 0.8;
    const leanDistance = height * traits.lean * (0.55 + rng() * 0.65);
    const stemRadius = traits.trunkRadius
      * Math.max(0.42, (0.46 + stageSlot * 0.12) * ageScale ** 0.35);
    let position = base;
    let parentPartId = null;
    let tipDirection = [0, 1, 0];
    for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
      const startT = sectionIndex / sections;
      const endT = (sectionIndex + 1) / sections;
      const end = [
        base[0] + Math.cos(leanHeading) * leanDistance * endT ** 1.45,
        height * endT,
        base[2] + Math.sin(leanHeading) * leanDistance * endT ** 1.45,
      ];
      const pseudostem = segment(
        stemAxis,
        traits.woodyPseudostem ? 'monocot-trunk' : 'pseudostem',
        position,
        end,
        stemRadius * (1 - startT * 0.18),
        stemRadius * (1 - endT * 0.18),
        {
          leafSheath: !traits.woodyPseudostem,
          parentPartId,
          sectionIndex,
          stem,
        },
      );
      tipDirection = normalizeVector([
        end[0] - position[0],
        end[1] - position[1],
        end[2] - position[2],
      ]);
      position = end;
      parentPartId = pseudostem.partId;
    }
    const crownPositions = [{ direction: tipDirection, parentPartId, position }];
    if (traits.woodyPseudostem && stageSlot >= 3 && stem === 0) {
      const crownCount = stageSlot === 3 ? 2 : 3;
      crownPositions.length = 0;
      for (let crown = 0; crown < crownCount; crown += 1) {
        const crownDirection = childDirection(
          tipDirection,
          crown / crownCount * Math.PI * 2 + rng() * 0.25,
          Math.PI * (0.17 + rng() * 0.05),
        );
        const crownEnd = addScaled(position, crownDirection, height * (0.1 + rng() * 0.04));
        const crownAxis = axis('monocot-branch', stemAxis.id, { crown, stem });
        const crownBranch = segment(
          crownAxis,
          'monocot-branch',
          position,
          crownEnd,
          stemRadius * 0.52,
          stemRadius * 0.32,
          { crown, parentPartId, stem },
        );
        crownPositions.push({
          direction: crownDirection,
          parentPartId: crownBranch.partId,
          position: crownEnd,
        });
      }
    }
    for (const [crown, crownEntry] of crownPositions.entries()) {
      if (traits.fanPlane) {
        const leafCount = Math.max(
          5,
          Math.round(traits.frondCount * (0.42 + stageSlot * 0.145) * ageScale ** 0.2),
        );
        const fanHeading = (traits.fanHeading ?? 0)
          + (stem === 0 ? 0 : azimuth * 0.22)
          + (rng() - 0.5) * 0.08;
        const fanRight = [Math.cos(fanHeading), 0, Math.sin(fanHeading)];
        const fanNormal = [-Math.sin(fanHeading), 0, Math.cos(fanHeading)];
        const maxFanAngle = Math.max(0.8, Math.min(1.42, traits.fanAngle ?? 1.18));
        const basePetioleLength = (traits.fanPetioleLength ?? traits.crownWidth * 0.43)
          * Math.max(0.34, stageScale)
          * ageScale ** 0.22;
        const baseLeafLength = (traits.giantLeafLength ?? traits.crownWidth * 0.32)
          * Math.max(0.38, stageScale)
          * ageScale ** 0.18;
        for (let leaf = 0; leaf < leafCount; leaf += 1) {
          const fanT = leafCount === 1 ? 0.5 : leaf / (leafCount - 1);
          const fanAngle = (fanT - 0.5) * maxFanAngle * 2
            + (rng() - 0.5) * 0.055;
          const outer = Math.abs(fanT - 0.5) * 2;
          const sideDepth = (leaf % 2 === 0 ? -1 : 1)
            * (traits.fanDepth ?? 0.14) * (0.35 + outer * 0.65);
          const petioleDirection = normalizeVector([
            fanRight[0] * Math.sin(fanAngle) + fanNormal[0] * sideDepth * 0.05,
            Math.cos(fanAngle),
            fanRight[2] * Math.sin(fanAngle) + fanNormal[2] * sideDepth * 0.05,
          ]);
          const petioleLength = basePetioleLength
            * (0.78 + Math.sin(Math.PI * fanT) * 0.16 + rng() * 0.12);
          const petioleStart = [
            crownEntry.position[0] + fanNormal[0] * sideDepth,
            crownEntry.position[1] - outer * stemRadius * 0.5,
            crownEntry.position[2] + fanNormal[2] * sideDepth,
          ];
          const petioleEnd = addScaled(petioleStart, petioleDirection, petioleLength);
          const petioleAxis = axis('giant-monocot-petiole', stemAxis.id, {
            crown,
            fanAngle,
            leaf,
            stem,
          });
          const petioleSegment = segment(
            petioleAxis,
            'petiole',
            petioleStart,
            petioleEnd,
            Math.max(
              0.022,
              (traits.fanPetioleRadius ?? stemRadius * 0.12)
                * Math.max(0.58, stageScale) * ageScale ** 0.2,
            ),
            Math.max(
              0.012,
              (traits.fanPetioleRadius ?? stemRadius * 0.12)
                * Math.max(0.58, stageScale) * 0.48,
            ),
            {
              crown,
              fanAngle,
              leaf,
              parentPartId: crownEntry.parentPartId,
              stem,
            },
          );
          const leafLength = baseLeafLength
            * (0.76 + Math.sin(Math.PI * fanT) * 0.17 + rng() * 0.13);
          const bladeCenter = addScaled(petioleEnd, petioleDirection, leafLength * 0.48);
          attachment(
            profile.foliageOrgan,
            bladeCenter,
            petioleDirection,
            leafLength,
            petioleSegment.partId,
            {
              cardsPerCluster: 1,
              crown,
              fanAngle,
              fanPlane: true,
              frondCount: 1,
              individualLeaf: true,
              leaf,
              leafDamage: Math.max(0, Math.min(0.35, 0.08 + outer * 0.18 + rng() * 0.06)),
              leafNormal: fanNormal,
              leafWidthScale: traits.giantLeafWidthScale ?? 0.4,
              organType: profile.foliageOrgan,
              rosetteHead: true,
              stem,
            },
          );
        }
      } else {
        attachment(profile.foliageOrgan, crownEntry.position, crownEntry.direction,
          traits.crownWidth * Math.max(0.24, stageScale) * 0.42,
          crownEntry.parentPartId, {
          fanPlane: false,
          frondCount: Math.max(5, Math.round(traits.frondCount * (0.44 + stageSlot * 0.14))),
          rosetteHead: true,
          crown,
          stem,
        });
      }
    }
  }
}

function growSucculent(builder, profile, traits, rng, stageScale, stageSlot) {
  const { axis, segment, attachment } = builder;
  const heightStages = traits.succulentHeightStages ?? [0.08, 0.32, 0.6, 0.84, 1];
  const height = traits.height * heightStages[stageSlot];
  const radiusStages = traits.succulentRadiusStages ?? [0.5, 0.64, 0.78, 0.9, 1];
  const baseRadius = traits.trunkRadius * radiusStages[stageSlot];
  if (traits.padForm) {
    const padCount = (traits.padCountStages ?? [1, 3, 7, 15, 24])[stageSlot];
    const padLengthStages = traits.padLengthStages ?? [0.72, 0.86, 0.94, 1, 1.06];
    const basePadLength = (traits.padLength ?? 0.62) * padLengthStages[stageSlot];
    const padWidthRatio = traits.padWidthRatio ?? 0.5;
    const padThicknessRatio = traits.padThicknessRatio ?? 0.055;
    const padEntries = [];
    let supportAxis = null;
    let supportPartId = null;
    let crownOrigin = [0, 0, 0];
    if (stageSlot >= 3) {
      const trunkHeight = height * [0, 0, 0, 0.24, 0.29][stageSlot];
      supportAxis = axis('succulent-cork-trunk', null, {
        growthUnit: 'woody-support',
        level: 0,
      });
      const cork = segment(
        supportAxis,
        'succulent-cork',
        [0, 0, 0],
        [0, trunkHeight, 0],
        baseRadius * (0.82 + stageSlot * 0.025),
        baseRadius * 0.56,
        {
          geometryKind: 'tube',
          level: 0,
          openEnded: true,
        },
      );
      supportPartId = cork.partId;
      crownOrigin = [0, trunkHeight, 0];
    }
    const baseAxis = axis('pad-primary', supportAxis?.id ?? null, {
      growthUnit: 'cladode',
      level: 0,
    });
    const baseDirection = stageSlot >= 3
      ? direction(rng() * Math.PI * 2, 1.02 + rng() * 0.16)
      : normalizeVector([
        (rng() - 0.5) * 0.08,
        1,
        (rng() - 0.5) * 0.08,
      ]);
    const baseEnd = addScaled(crownOrigin, baseDirection, basePadLength);
    const baseSupportLength = stageSlot >= 3 ? basePadLength * 0.32 : 0;
    let basePadStart = crownOrigin;
    if (baseSupportLength > 0) {
      basePadStart = addScaled(crownOrigin, baseDirection, baseSupportLength);
      const baseSupport = segment(
        baseAxis,
        'succulent-cork',
        crownOrigin,
        basePadStart,
        baseRadius * 0.58,
        baseRadius * 0.4,
        {
          geometryKind: 'tube',
          level: 0,
          openEnded: true,
          parentPartId: supportPartId,
        },
      );
      supportPartId = baseSupport.partId;
    }
    const baseVisualLength = basePadLength - baseSupportLength;
    const baseNormalAngle = Math.PI * 0.25 + (rng() - 0.5) * 0.16;
    const baseNormal = normalizeVector([
      Math.cos(baseNormalAngle),
      0.04,
      Math.sin(baseNormalAngle),
    ]);
    const basePad = segment(
      baseAxis,
      'pad',
      basePadStart,
      baseEnd,
      baseRadius,
      baseRadius * 0.86,
      {
        geometryKind: 'pad',
        level: 0,
        padNormal: baseNormal,
        padThickness: baseVisualLength * padThicknessRatio * 0.5,
        padWidth: baseVisualLength * padWidthRatio * 0.5,
        parentPartId: supportPartId,
      },
    );
    padEntries.push({
      axisId: baseAxis.id,
      childCount: 0,
      direction: baseDirection,
      end: baseEnd,
      level: 0,
      normal: baseNormal,
      padLength: baseVisualLength,
      partId: basePad.partId,
      radius: baseRadius,
    });
    for (let padIndex = 1; padIndex < padCount; padIndex += 1) {
      const candidates = padEntries.filter((entry) => (
        entry.childCount < (entry.level < 2 ? 3 : 2)
        && entry.level < 4
      ));
      const parent = candidates[Math.floor(rng() * Math.max(1, candidates.length))]
        ?? padEntries.at(-1);
      parent.childCount += 1;
      const parentAzimuth = Math.atan2(parent.direction[2], parent.direction[0]);
      const side = parent.childCount % 2 ? 1 : -1;
      const azimuth = parentAzimuth + side * (0.58 + rng() * 0.72) + (rng() - 0.5) * 0.3;
      const elevation = Math.min(1.25, 0.58 + rng() * 0.5 - parent.level * 0.02);
      const padDirection = direction(azimuth, elevation);
      const padLength = basePadLength * Math.max(
        0.62,
        0.92 - parent.level * 0.075 + (rng() - 0.5) * 0.16,
      );
      const padEnd = addScaled(parent.end, padDirection, padLength);
      const normalAngle = padIndex * 2.3999632297 + Math.PI * 0.25 + (rng() - 0.5) * 0.2;
      const padNormal = normalizeVector([
        Math.cos(normalAngle),
        Math.max(-0.1, Math.min(0.1, (rng() - 0.5) * 0.1)),
        Math.sin(normalAngle),
      ]);
      const padAxis = axis('pad-branch', parent.axisId, {
        growthUnit: 'cladode',
        level: parent.level + 1,
      });
      const supportLength = stageSlot >= 3 && parent.level < 2 ? padLength * 0.28 : 0;
      let padStart = parent.end;
      let padParentPartId = parent.partId;
      if (supportLength > 0) {
        padStart = addScaled(parent.end, padDirection, supportLength);
        const support = segment(
          padAxis,
          'succulent-cork',
          parent.end,
          padStart,
          Math.max(baseRadius * 0.2, parent.radius * 0.24),
          Math.max(baseRadius * 0.14, parent.radius * 0.16),
          {
            geometryKind: 'tube',
            level: parent.level + 1,
            openEnded: true,
            parentPartId: parent.partId,
          },
        );
        padParentPartId = support.partId;
      }
      const visualPadLength = padLength - supportLength;
      const pad = segment(
        padAxis,
        'pad',
        padStart,
        padEnd,
        parent.radius * 0.78,
        parent.radius * 0.62,
        {
          geometryKind: 'pad',
          level: parent.level + 1,
          padNormal,
          padThickness: visualPadLength * padThicknessRatio * 0.5,
          padWidth: visualPadLength * padWidthRatio * 0.5,
          parentPartId: padParentPartId,
        },
      );
      padEntries.push({
        axisId: padAxis.id,
        childCount: 0,
        direction: padDirection,
        end: padEnd,
        level: parent.level + 1,
        normal: padNormal,
        padLength: visualPadLength,
        partId: pad.partId,
        radius: Math.max(baseRadius * 0.58, parent.radius * 0.88),
      });
    }
    const areoleSites = [
      [0, -0.28], [-0.32, -0.04], [0.32, -0.04],
      [-0.24, 0.27], [0.24, 0.27], [0, 0.46],
    ];
    for (const [padIndex, pad] of padEntries.entries()) {
      const widthAxis = normalizeVector(crossVector(pad.direction, pad.normal), [1, 0, 0]);
      const center = addScaled(pad.end, pad.direction, -pad.padLength * 0.5);
      for (let site = 0; site < areoleSites.length; site += 1) {
        const [widthOffset, heightOffset] = areoleSites[site];
        const face = site % 2 ? 1 : -1;
        let position = addScaled(center, widthAxis, widthOffset * pad.padLength * padWidthRatio);
        position = addScaled(position, pad.direction, heightOffset * pad.padLength);
        position = addScaled(position, pad.normal, face * pad.padLength * padThicknessRatio * 0.52);
        attachment(
          'spine',
          position,
          pad.normal.map((component) => component * face),
          pad.padLength * 0.018,
          pad.partId,
          {
            areole: site,
            glochidOnly: true,
            padIndex,
          },
        );
      }
    }
    return;
  }

  const trunkAxis = axis('succulent-primary');
  const trunkSections = Math.max(3, 4 + stageSlot * 2);
  const ribCount = Math.max(10, Math.round(traits.ribCount ?? 16));
  const trunkSegments = [];
  let trunkPosition = [0, 0, 0];
  let trunkParentPartId = null;
  const leanAzimuth = rng() * Math.PI * 2;
  const leanAmount = (traits.succulentLean ?? 0.008) * height;
  for (let sectionIndex = 0; sectionIndex < trunkSections; sectionIndex += 1) {
    const startT = sectionIndex / trunkSections;
    const endT = (sectionIndex + 1) / trunkSections;
    const end = [
      Math.cos(leanAzimuth) * leanAmount * endT * endT,
      height * endT,
      Math.sin(leanAzimuth) * leanAmount * endT * endT,
    ];
    const trunk = segment(
      trunkAxis,
      'succulent-stem',
      trunkPosition,
      end,
      baseRadius * (1 - startT * 0.12),
      baseRadius * (1 - endT * 0.12),
      {
        geometryKind: 'ribbed',
        grooveDepth: traits.ribGrooveDepth ?? 0.16,
        openEnded: true,
        parentPartId: trunkParentPartId,
        ribCount,
        sectionIndex,
      },
    );
    trunkSegments.push(trunk);
    trunkPosition = end;
    trunkParentPartId = trunk.partId;
  }
  const apexRadius = baseRadius * 0.88;
  segment(
    trunkAxis,
    'succulent-apex',
    trunkPosition,
    addScaled(trunkPosition, [0, 1, 0], apexRadius * 1.06),
    apexRadius,
    apexRadius,
    {
      geometryKind: 'ribbed-apex',
      grooveDepth: traits.ribGrooveDepth ?? 0.16,
      parentPartId: trunkParentPartId,
      ribCount,
    },
  );
  const arms = (traits.armCountStages ?? [0, 0, 1, 3, 6])[stageSlot];
  const armSegments = [];
  for (let arm = 0; arm < arms; arm += 1) {
    const azimuth = arm * 2.3999632297 + rng() * 0.42;
    const originFraction = traits.basalColumns
      ? 0.015 + rng() * 0.04
      : Math.min(0.76, (traits.armOriginMin ?? 0.34) + arm * 0.055 + rng() * 0.18);
    const y = height * originFraction;
    const centerline = [
      Math.cos(leanAzimuth) * leanAmount * originFraction * originFraction,
      y,
      Math.sin(leanAzimuth) * leanAmount * originFraction * originFraction,
    ];
    const outward = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const armRadius = baseRadius * (0.62 + rng() * 0.12);
    const start = addScaled(centerline, outward, baseRadius * 0.78);
    const horizontalReach = traits.crownWidth * stageScale
      * (traits.basalColumns ? 0.08 + rng() * 0.05 : 0.11 + rng() * 0.08);
    const armHeight = traits.basalColumns
      ? height * (0.66 + rng() * 0.26)
      : Math.min(
        height * (0.2 + rng() * (stageSlot === 2 ? 0.07 : 0.26)),
        height * 0.9 - y,
      );
    const armAxis = axis('succulent-arm', trunkAxis.id);
    const parentTrunk = trunkSegments[Math.min(
      trunkSegments.length - 1,
      Math.floor(y / Math.max(height, 1e-6) * trunkSegments.length),
    )];
    const curveSections = 5;
    let curveStart = start;
    let curveParentPartId = parentTrunk.partId;
    for (let sectionIndex = 0; sectionIndex < curveSections; sectionIndex += 1) {
      const endT = (sectionIndex + 1) / curveSections;
      const angle = endT * Math.PI * 0.5;
      const curveEnd = addScaled(start, outward, horizontalReach * Math.sin(angle));
      curveEnd[1] += armHeight * (1 - Math.cos(angle));
      const radiusStart = armRadius * (1 - sectionIndex / curveSections * 0.14);
      const radiusEnd = armRadius * (1 - endT * 0.16);
      const section = segment(
        armAxis,
        'succulent-arm',
        curveStart,
        curveEnd,
        radiusStart,
        radiusEnd,
        {
          parentPartId: curveParentPartId,
          geometryKind: 'ribbed',
          grooveDepth: traits.ribGrooveDepth ?? 0.16,
          openEnded: true,
          ribCount: Math.max(9, ribCount - 2),
        },
      );
      armSegments.push(section);
      curveStart = curveEnd;
      curveParentPartId = section.partId;
    }
    const end = curveStart;
    segment(
      armAxis,
      'succulent-apex',
      end,
      addScaled(end, [0, 1, 0], armRadius * 0.88),
      armRadius * 0.84,
      armRadius * 0.84,
      {
        geometryKind: 'ribbed-apex',
        grooveDepth: traits.ribGrooveDepth ?? 0.16,
        parentPartId: curveParentPartId,
        ribCount: Math.max(9, ribCount - 2),
      },
    );
  }
  const spineBearingSegments = [...trunkSegments, ...armSegments];
  const spineStep = Math.max(1, Math.floor(spineBearingSegments.length / (8 + stageSlot * 3)));
  for (let segmentIndex = 0; segmentIndex < spineBearingSegments.length; segmentIndex += spineStep) {
    const host = spineBearingSegments[segmentIndex];
    const center = mixVector(host.start, host.end, 0.58);
    const hostDirection = normalizeVector([
      host.end[0] - host.start[0],
      host.end[1] - host.start[1],
      host.end[2] - host.start[2],
    ]);
    const { tangent, bitangent } = radialFrame(hostDirection);
    const ridgeCount = Math.min(8, Math.max(5, Math.round(ribCount * 0.42)));
    for (let ridge = 0; ridge < ridgeCount; ridge += 1) {
      const angle = ridge / ridgeCount * Math.PI * 2 + segmentIndex * 0.71;
      const spineDirection = normalizeVector([
        tangent[0] * Math.cos(angle) + bitangent[0] * Math.sin(angle),
        tangent[1] * Math.cos(angle) + bitangent[1] * Math.sin(angle),
        tangent[2] * Math.cos(angle) + bitangent[2] * Math.sin(angle),
      ]);
      const hostRadius = host.radiusStart * 0.38 + host.radiusEnd * 0.62;
      attachment(
        'spine',
        addScaled(center, spineDirection, hostRadius * 0.96),
        spineDirection,
        hostRadius * (0.2 + rng() * 0.08),
        host.partId,
        {
          bundleSize: 3,
          ridge,
          segmentIndex,
        },
      );
    }
  }
}

function applyPipeModel(graph, traits) {
  const supportedSemantics = new Set(['trunk', 'branch', 'twig']);
  const structural = graph.segments.filter(
    (entry) => supportedSemantics.has(entry.semantic),
  );
  if (!structural.length) return;

  const byPartId = new Map(structural.map((entry) => [entry.partId, entry]));
  const childrenByPartId = new Map();
  for (const entry of structural) {
    if (!byPartId.has(entry.parentPartId)) continue;
    const children = childrenByPartId.get(entry.parentPartId) ?? [];
    children.push(entry);
    childrenByPartId.set(entry.parentPartId, children);
  }
  const loadByPartId = new Map();
  const visiting = new Set();
  const loadFor = (entry) => {
    if (loadByPartId.has(entry.partId)) return loadByPartId.get(entry.partId);
    if (visiting.has(entry.partId)) return 1;
    visiting.add(entry.partId);
    const children = childrenByPartId.get(entry.partId) ?? [];
    const load = children.length
      ? children.reduce((sum, child) => sum + loadFor(child), 0)
      : 1;
    visiting.delete(entry.partId);
    loadByPartId.set(entry.partId, load);
    return load;
  };

  const roots = structural.filter((entry) => !byPartId.has(entry.parentPartId));
  const pipeExponent = Math.max(
    1.6,
    Math.min(3.2, Number(traits.pipeExponent) || 2.18),
  );
  // The grower has already scaled the base radius continuously for the
  // selected development progress. Reusing the unscaled species radius here
  // made young and mature trees share an old-tree trunk girth.
  const targetBaseRadius = Math.max(
    0.01,
    Number(traits.pipeBaseRadius)
      || Math.max(...roots.map((entry) => entry.radiusStart)),
  );
  const rootLoad = Math.max(1, ...roots.map(loadFor));
  const unitRadius = targetBaseRadius / rootLoad ** (1 / pipeExponent);
  const firstPartByAxis = new Map();
  for (const entry of structural) {
    if (!firstPartByAxis.has(entry.axisId)) firstPartByAxis.set(entry.axisId, entry.partId);
  }
  const axes = new Map(graph.axes.map((entry) => [entry.id, entry]));
  const parts = new Map(graph.parts.map((entry) => [entry.id, entry]));

  for (const entry of structural) {
    const children = childrenByPartId.get(entry.partId) ?? [];
    const startLoad = loadFor(entry);
    const endLoad = children.length
      ? children.reduce((sum, child) => sum + loadFor(child), 0)
      : 0;
    const targetStart = unitRadius * startLoad ** (1 / pipeExponent);
    const targetEnd = children.length
      ? unitRadius * endLoad ** (1 / pipeExponent)
      : unitRadius * 0.08;
    const isRoot = roots.includes(entry);
    entry.radiusStart = isRoot ? targetBaseRadius : Math.max(unitRadius * 0.52, targetStart);
    entry.radiusEnd = children.length
      ? Math.max(
        unitRadius * 0.38,
        Math.min(entry.radiusStart * 0.995, targetEnd),
      )
      : Math.max(
        unitRadius * 0.055,
        Math.min(entry.radiusStart * 0.2, targetEnd),
      );
    entry.pipeLoad = Number(startLoad.toFixed(4));
    entry.pipeExponent = pipeExponent;
    entry.openEnded = true;

    const axisEntry = axes.get(entry.axisId);
    const firstOnAxis = firstPartByAxis.get(entry.axisId) === entry.partId;
    if (firstOnAxis && axisEntry?.parentAxisId) {
      const parentSegment = byPartId.get(entry.parentPartId);
      entry.junctionBulge = Math.max(
        1,
        Math.min(1.24, Number(traits.junctionBulge) || 1.1),
      );
      entry.junctionTransition = Math.max(
        0.08,
        Math.min(0.42, Number(traits.junctionTransition) || 0.22),
      );
      entry.junctionInset = graph.engine === 'woody-axis'
        ? Math.max(
          0.35,
          Math.min(1.1, Number(traits.junctionInset) || 0.78),
        )
        : 0;
      entry.junctionParentRadius = parentSegment
        ? Math.max(parentSegment.radiusStart, parentSegment.radiusEnd)
        : entry.radiusStart * 1.8;
    }
    Object.assign(parts.get(entry.partId) ?? {}, {
      baseFlare: entry.baseFlare,
      baseFlareTransition: entry.baseFlareTransition,
      junctionBulge: entry.junctionBulge,
      junctionInset: entry.junctionInset,
      junctionParentRadius: entry.junctionParentRadius,
      junctionTransition: entry.junctionTransition,
      openEnded: true,
      pipeExponent,
      pipeLoad: entry.pipeLoad,
      radiusEnd: entry.radiusEnd,
      radiusStart: entry.radiusStart,
    });
  }

  graph.pipeModel = {
    exponent: pipeExponent,
    rootLoad: Number(rootLoad.toFixed(4)),
    unitRadius: Number(unitRadius.toFixed(6)),
  };
}

const ENGINE_GROWERS = Object.freeze({
  'woody-axis': growRecursiveWoody,
  'whorled-conifer': growRecursiveWoody,
  'culm-colony': growBamboo,
  'terminal-crown': growTerminalCrown,
  'branched-rosette': growRosette,
  'pseudostem-fan': growPseudostem,
  'succulent-axis': growSucculent,
});

export function createPlantGraph({
  speciesProfileId,
  lifeStage = 2,
  developmentProgress = null,
  geometrySeed = 1,
  traitOverrides = null,
} = {}) {
  const profile = getTreeSpeciesProfile(speciesProfileId);
  const stage = resolvedStage(profile, lifeStage);
  const resolvedProgress = developmentProgress == null
    ? stage.slot / Math.max(1, profile.supportedStages.length - 1)
    : clamp01(developmentProgress);
  const stagePosition = resolvedProgress * (profile.supportedStages.length - 1);
  const topologySlot = Math.round(stagePosition);
  const stageScale = stageScaleAt(stagePosition);
  const traits = resolveStructuralTraits(profile, traitOverrides);
  const builder = createBuilder(profile, stage.id, geometrySeed);
  builder.graph.developmentProgress = Number(resolvedProgress.toFixed(5));
  // Downstream mesh, foliage, LOD, and export consumers must use the exact
  // evaluated species/age/control baseline that produced this topology.
  builder.graph.resolvedTraits = { ...traits };
  const rng = mulberry32(hashString(`${profile.id}:${geometrySeed}`));
  const grow = ENGINE_GROWERS[profile.engine];
  if (!grow) throw new Error(`No plant graph engine registered for ${profile.engine}.`);
  addRootModules(builder, profile, traits, rng, stageScale);
  grow(builder, profile, traits, rng, stageScale, topologySlot);
  if (profile.engine === 'woody-axis' || profile.engine === 'whorled-conifer') {
    applyPipeModel(builder.graph, traits);
    builder.graph.growthModel = 'toonlab-recursive-woody-v3';
  }
  builder.graph.structuralHash = stableHash({
    species: profile.id,
    architecture: `${profile.architectureId}@${profile.architectureVersion}`,
    stage: stage.id,
    developmentProgress: builder.graph.developmentProgress,
    rootProfile: profile.rootProfile,
    foliageOrgan: profile.foliageOrgan,
    geometrySeed,
    growthModel: builder.graph.growthModel ?? profile.engine,
    traits,
  });
  return Object.freeze(builder.graph);
}

export function validatePlantGraph(graph) {
  const errors = [];
  if (graph?.schema !== PLANT_GRAPH_SCHEMA || graph?.version !== PLANT_GRAPH_VERSION) {
    errors.push('Unsupported plant graph schema or version.');
  }
  const partIds = new Set();
  for (const part of graph?.parts ?? []) {
    if (partIds.has(part.id)) errors.push(`Duplicate plant part id ${part.id}.`);
    partIds.add(part.id);
  }
  const axisIds = new Set();
  for (const axis of graph?.axes ?? []) {
    if (axisIds.has(axis.id)) errors.push(`Duplicate plant axis id ${axis.id}.`);
    axisIds.add(axis.id);
  }
  for (const axis of graph?.axes ?? []) {
    if (axis.parentAxisId != null && !axisIds.has(axis.parentAxisId)) {
      errors.push(`Axis ${axis.id} has missing parent axis ${axis.parentAxisId}.`);
    }
  }
  for (const segment of graph?.segments ?? []) {
    if (!partIds.has(segment.partId)) errors.push(`Segment ${segment.id} has no semantic part.`);
    if (!axisIds.has(segment.axisId)) errors.push(`Segment ${segment.id} has no structural axis.`);
    if (segment.parentPartId != null && !partIds.has(segment.parentPartId)) {
      errors.push(`Segment ${segment.id} has missing parent part ${segment.parentPartId}.`);
    }
    if (!(segment.radiusStart > 0) || !(segment.radiusEnd > 0)) {
      errors.push(`Segment ${segment.id} has an invalid radius.`);
    }
  }
  for (const attachment of graph?.attachments ?? []) {
    if (!partIds.has(attachment.partId)) errors.push(`Attachment ${attachment.id} has no semantic part.`);
    if (attachment.parentPartId != null && !partIds.has(attachment.parentPartId)) {
      errors.push(`Attachment ${attachment.id} has missing parent part ${attachment.parentPartId}.`);
    }
  }
  if (graph?.pipeModel) {
    const structuralSemantics = new Set(['trunk', 'branch', 'twig']);
    const structural = (graph.segments ?? []).filter(
      (segment) => structuralSemantics.has(segment.semantic),
    );
    const byPartId = new Map(structural.map((segment) => [segment.partId, segment]));
    const childrenByPartId = new Map();
    for (const segment of structural) {
      if (!byPartId.has(segment.parentPartId)) continue;
      const children = childrenByPartId.get(segment.parentPartId) ?? [];
      children.push(segment);
      childrenByPartId.set(segment.parentPartId, children);
    }
    const exponent = Number(graph.pipeModel.exponent);
    for (const segment of structural) {
      if (!segment.openEnded) {
        errors.push(`Pipe segment ${segment.id} must be open-ended at graph junctions.`);
      }
      if (!(segment.pipeLoad > 0) || segment.pipeExponent !== exponent) {
        errors.push(`Pipe segment ${segment.id} is missing pipe-model metadata.`);
      }
      const children = childrenByPartId.get(segment.partId) ?? [];
      if (!children.length) continue;
      const parentArea = segment.radiusEnd ** exponent;
      const childArea = children.reduce(
        (sum, child) => sum + child.radiusStart ** exponent,
        0,
      );
      const relativeError = Math.abs(parentArea - childArea)
        / Math.max(parentArea, childArea, 1e-8);
      if (relativeError > 0.04) {
        errors.push(`Pipe segment ${segment.id} violates area-preserving taper.`);
      }
    }
    const firstByAxis = new Map();
    for (const segment of structural) {
      if (!firstByAxis.has(segment.axisId)) firstByAxis.set(segment.axisId, segment);
    }
    const axes = new Map((graph.axes ?? []).map((axis) => [axis.id, axis]));
    for (const segment of firstByAxis.values()) {
      const axis = axes.get(segment.axisId);
      if (axis?.parentAxisId && !(segment.junctionBulge >= 1)) {
        errors.push(`Child axis ${axis.id} is missing a smooth junction transition.`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
