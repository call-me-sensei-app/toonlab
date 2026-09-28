import { createStructuralField } from '../structure/field.node.js';
import {
  clamp,
  fractalNoise2D,
  hash01,
  worldToFrame,
} from '../structure/math.node.js';
import { fractureSignedDistance } from '../fractures/network.node.js';
import { querySpatialIndex, pointQueryBounds } from '../fractures/spatialIndex.node.js';

const EPSILON = 1e-9;

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, EPSILON), 0, 1);
  return t * t * (3 - 2 * t);
}

function noise3(seed, point, scale, channel = 0) {
  const s = Math.max(scale, EPSILON);
  const [x, y, z] = point.map((value) => value / s);
  return (
    fractalNoise2D(seed ^ (channel * 0x45d9f3b), x, y, { octaves: 4, lacunarity: 2.071, gain: 0.49 })
    + fractalNoise2D(seed ^ (channel * 0x119de1f3), y, z, { octaves: 4, lacunarity: 2.137, gain: 0.47 })
    + fractalNoise2D(seed ^ (channel * 0x3449f7), z, x, { octaves: 4, lacunarity: 2.113, gain: 0.48 })
  ) / 3;
}

function sphereDistance(point, center, radius) {
  return Math.hypot(point[0] - center[0], point[1] - center[1], point[2] - center[2]) - radius;
}

function finiteCylinderDistance(point, center, radius, halfHeight) {
  const radial = Math.hypot(point[0] - center[0], point[2] - center[2]) - radius;
  const axial = Math.abs(point[1] - center[1]) - halfHeight;
  return Math.max(radial, axial);
}

const ROUNDED_LANDFORMS = new Set([
  'pebble', 'cobble', 'boulder', 'corestone', 'tor', 'erratic', 'boulder-field',
]);

const ATTACHED_ANGULAR_LANDFORMS = new Set([
  'wall', 'cliff', 'sea-cliff', 'canyon-wall', 'escarpment', 'fault-scarp',
  'mesa', 'butte', 'ledge', 'bench', 'dyke', 'sill', 'vein', 'column-field',
]);

function processMorphology(context) {
  const { extents, local, program, seed, timeFraction } = context;
  const spheroidal = program.kernels.some((kernel) => kernel.kernelId === 'spheroidal');
  const exfoliating = program.kernels.some((kernel) => kernel.kernelId === 'exfoliation');
  const frostShattered = program.kernels.some((kernel) => kernel.kernelId === 'freeze-thaw');
  const rounded = !frostShattered && (spheroidal || exfoliating || ROUNDED_LANDFORMS.has(program.source.landform));
  const angular = ATTACHED_ANGULAR_LANDFORMS.has(program.source.landform);
  const exponent = rounded ? (spheroidal ? 2.25 : 2.7) : angular ? 5.1 : frostShattered ? 3.8 : 3.55;
  const axisScale = [
    (rounded ? 0.91 : 0.965) + hash01(seed, 1, 0, 0, 211) * (rounded ? 0.07 : 0.025),
    (rounded ? 0.9 : 0.96) + hash01(seed, 2, 0, 0, 212) * (rounded ? 0.08 : 0.03),
    (rounded ? 0.91 : 0.965) + hash01(seed, 3, 0, 0, 213) * (rounded ? 0.07 : 0.025),
  ];
  const center = [
    (hash01(seed, 4, 0, 0, 214) - 0.5) * extents[0] * (rounded ? 0.11 : 0.045),
    (hash01(seed, 5, 0, 0, 215) - 0.5) * extents[1] * (rounded ? 0.07 : 0.035),
    (hash01(seed, 6, 0, 0, 216) - 0.5) * extents[2] * (rounded ? 0.11 : 0.045),
  ];
  const normalized = local.map((value, axis) => (
    (value - center[axis]) / Math.max(extents[axis] * axisScale[axis], EPSILON)
  ));
  const lpNorm = normalized.reduce((sum, value) => sum + Math.abs(value) ** exponent, 0) ** (1 / exponent);
  const scale = Math.max(...extents);
  const direction = normalized.map((value) => value / Math.max(lpNorm, EPSILON));
  const macro = noise3(seed ^ 0x5f356495, direction, 0.43, 71);
  const meso = noise3(seed ^ 0x2c1b3c6d, local, scale * 0.31, 72);
  const finalRadius = (rounded ? 0.89 : angular ? 0.995 : frostShattered ? 0.975 : 0.985)
    + macro * (rounded ? 0.055 : 0.026) + meso * (rounded ? 0.025 : 0.014);
  // At t=0 the larger radius contains the complete C4 envelope. Reducing the
  // radius is an erosion-only superellipsoid intersection, so no time sample
  // can add material or grow beyond the approved parent formation.
  const radiusAtTime = finalRadius + (1 - timeFraction) * 1.08;
  return (lpNorm - radiusAtTime) * Math.min(...extents) * 0.92;
}

function minimumFractureDistance(fractureProgram, structuralProgram, fractureById, worldPoint, padding) {
  const ids = querySpatialIndex(fractureProgram.spatialIndex, pointQueryBounds(worldPoint, padding));
  if (ids.length === 0) return padding;
  let distance = padding;
  for (const id of ids) {
    distance = Math.min(distance, fractureSignedDistance(fractureProgram, structuralProgram, fractureById.get(id), worldPoint));
  }
  return distance;
}

function tafoniDistance(context, strength) {
  const { extents, local, seed } = context;
  let result = Infinity;
  const count = 18;
  for (let index = 0; index < count; index += 1) {
    const radius = Math.min(extents[0], extents[1], extents[2])
      * (0.15 + hash01(seed, index, 1, 0, 80) * 0.13) * (0.48 + strength * 0.82);
    const onXFace = index % 2 === 1;
    const center = onXFace ? [
      extents[0] * (0.84 + hash01(seed, index, 4, 0, 83) * 0.12),
      (hash01(seed, index, 3, 0, 82) * 1.45 - 0.68) * extents[1],
      (hash01(seed, index, 2, 0, 81) * 1.45 - 0.72) * extents[2],
    ] : [
      (hash01(seed, index, 2, 0, 81) * 1.45 - 0.72) * extents[0],
      (hash01(seed, index, 3, 0, 82) * 1.45 - 0.68) * extents[1],
      extents[2] * (0.84 + hash01(seed, index, 4, 0, 83) * 0.12),
    ];
    const ellipsoidPoint = onXFace
      ? [center[0] + (local[0] - center[0]) * 0.58, local[1], local[2]]
      : [local[0], local[1], center[2] + (local[2] - center[2]) * 0.58];
    result = Math.min(result, sphereDistance(ellipsoidPoint, center, radius));
  }
  return result;
}

function karstDistance(context, strength) {
  const { extents, local, seed } = context;
  let result = Infinity;
  for (let index = 0; index < 7; index += 1) {
    const phase = hash01(seed, index, 5, 0, 91) * Math.PI * 2;
    const onXFace = index % 3 === 2;
    const x = (onXFace ? 0.88 : hash01(seed, index, 6, 0, 92) * 1.45 - 0.72) * extents[0]
      + Math.sin(local[1] / Math.max(extents[1], EPSILON) * Math.PI * 1.6 + phase) * extents[0] * 0.07;
    const z = (onXFace ? hash01(seed, index, 7, 0, 93) * 1.45 - 0.72 : 0.88) * extents[2];
    const radius = Math.min(extents[0], extents[2]) * (0.055 + 0.085 * strength);
    result = Math.min(result, finiteCylinderDistance(local, [x, 0, z], radius, extents[1] * 1.05));
  }
  return result;
}

function marineDistance(context, strength) {
  const { extents, local, worldPoint } = context;
  const scale = Math.max(...extents);
  const seaLevel = -scale * 0.08;
  const verticalBand = Math.abs(worldPoint[1] - seaLevel) - scale * (0.05 + 0.065 * strength);
  const zFace = Math.max(
    verticalBand,
    extents[2] * (0.58 - 0.4 * strength) - local[2],
    Math.abs(local[0]) - extents[0] * 0.95,
  );
  const xFace = Math.max(
    verticalBand,
    extents[0] * (0.58 - 0.4 * strength) - local[0],
    Math.abs(local[2]) - extents[2] * 0.95,
  );
  return Math.min(zFace, xFace);
}

function fluvialDistance(context, strength) {
  const { extents, local, seed } = context;
  let result = Infinity;
  for (let index = 0; index < 3; index += 1) {
    const center = [
      (hash01(seed, index, 11, 0, 101) * 1.1 - 0.55) * extents[0],
      extents[1] * (0.76 + hash01(seed, index, 12, 0, 102) * 0.18),
      (hash01(seed, index, 13, 0, 103) * 0.8 - 0.4) * extents[2],
    ];
    const radius = Math.min(extents[0], extents[2]) * (0.045 + 0.09 * strength);
    result = Math.min(result, sphereDistance(local, center, radius));
  }
  return result;
}

function aeolianDistance(context, strength) {
  const { extents, local, seed, worldPoint } = context;
  const scale = Math.max(...extents);
  const flute = Math.abs(Math.sin((local[0] / Math.max(extents[0], EPSILON) * 5.2)
    + noise3(seed, local, Math.max(...extents) * 0.28, 31) * 1.1));
  const verticalBand = Math.abs(worldPoint[1] + scale * 0.1) - scale * (0.07 + 0.035 * flute);
  const penetration = extents[2] * (0.62 - strength * (0.24 + 0.11 * flute)) - local[2];
  return Math.max(verticalBand, penetration);
}

function glacialDistance(context, strength) {
  const { extents, local, seed, worldPoint } = context;
  const scale = Math.max(...extents);
  const subduedStriation = Math.abs(Math.sin((local[0] + local[2] * 0.17) / Math.max(extents[0], EPSILON) * 23));
  const y = scale * (0.42 - 0.055 * strength) + subduedStriation * scale * 0.0035
    + noise3(seed, local, scale * 0.29, 41) * scale * 0.018;
  return Math.max(y - worldPoint[1], Math.abs(local[2]) - extents[2] * 0.96);
}

function evaluateEnvironment(context) {
  const { base, local, extents, program, fractureProgram, fractureById, structuralProgram, worldPoint, timeFraction } = context;
  const normalized = local.map((value, axis) => value / Math.max(extents[axis], EPSILON));
  const sortedFaces = normalized.map(Math.abs).sort((a, b) => b - a);
  const surfaceDepth = Math.max(0, -base.envelopeDistanceMetres);
  const scale = Math.max(...extents);
  const surfaceProximity = Math.exp(-surfaceDepth / Math.max(scale * 0.16, EPSILON));
  const cornerExposure = clamp((sortedFaces[1] - 0.26) / 0.7, 0, 1);
  const topExposure = smoothstep(-0.45, 0.82, normalized[1]);
  const windExposure = smoothstep(-0.5, 0.92, normalized[2]);
  const exposure = clamp(surfaceProximity * (0.34 + topExposure * 0.36 + windExposure * 0.18 + cornerExposure * 0.24), 0, 1);
  const drainageNoise = noise3(program.seeds.weathering, local, scale * 0.29, 3);
  const channel = 1 - smoothstep(0.04, 0.68, Math.abs(drainageNoise));
  const runoff = clamp((0.22 + channel * 0.58 + topExposure * 0.2) * program.fields.waterRoutingNormalized, 0, 1);
  const moisture = clamp(program.fields.moistureNormalized * (0.52 + runoff * 0.66 + (1 - topExposure) * 0.18), 0, 1);
  const salt = clamp(program.fields.saltExposureNormalized * (0.44 + windExposure * 0.34 + (1 - topExposure) * 0.22), 0, 1);
  const fractureSearch = scale * 0.13;
  const fractureDistance = minimumFractureDistance(fractureProgram, structuralProgram, fractureById, worldPoint, fractureSearch);
  const fractureInfluence = 1 - smoothstep(0, fractureSearch, Math.max(fractureDistance, 0));
  const material = base.materialFields;
  const logPermeability = clamp((Math.log10(material.permeabilitySquareMetres + 1e-24) + 17) / 6, 0, 1);
  const infiltration = clamp(
    Math.sqrt(timeFraction) * moisture
      * (0.24 + material.porosityFraction * 1.9 + logPermeability * 0.24 + fractureInfluence * 0.72),
    0,
    1,
  );
  const bondWeakening = clamp(infiltration
    * (0.2 + (1 - material.cementationNormalized) * 0.48 + (1 - material.hardnessNormalized) * 0.32), 0, 1);
  const materialWeakness = clamp(
    (1 - material.hardnessNormalized) * 0.42
      + material.porosityFraction * 0.28
      + (1 - material.cementationNormalized) * 0.24
      + material.weatheringSusceptibilityNormalized * 0.3,
    0.04,
    1,
  );
  const contactScale = Math.max(scale * 0.045, EPSILON);
  const fabricWeakness = Math.exp(-base.fabricFields.distanceToContactMetres / contactScale);
  return {
    bondWeakening,
    cornerExposure,
    drainage: runoff,
    exposure,
    fabricWeakness,
    fractureDistanceMetres: fractureDistance,
    fractureInfluence,
    freezeThaw: clamp(program.fields.freezeThawCyclesPerYear / 120 * moisture * timeFraction, 0, 1),
    infiltration,
    materialWeakness,
    moisture,
    runoff,
    salt,
    thermal: clamp(program.fields.thermalCyclesPerYear / 360 * exposure * timeFraction, 0, 1),
    timeNormalized: timeFraction,
    topExposure,
    windExposure,
  };
}

function kernelEffect(kernelId, context, environment, priorDamage) {
  const scale = Math.max(...context.extents);
  const time = context.timeFraction;
  const causal = environment.exposure * environment.materialWeakness * (0.58 + environment.fabricWeakness * 0.42);
  const conditioned = 1 + priorDamage * 0.22;
  const micro = 0.5 + 0.5 * noise3(context.seed, context.local, scale * 0.14, kernelId.length + 7);
  let recession = 0;
  let cavityDistance = Infinity;
  let damage = 0;
  switch (kernelId) {
    case 'spheroidal': {
      const edge = 0.18 + environment.cornerExposure * 0.82;
      recession = scale * 0.105 * time * causal * edge * (0.68 + micro * 0.32) * conditioned;
      damage = edge * causal * time;
      break;
    }
    case 'exfoliation': {
      const shellPhase = Math.sin((-context.base.envelopeDistanceMetres / Math.max(scale * 0.055, EPSILON)) * Math.PI);
      const peeling = smoothstep(0.05, 0.88, shellPhase) * (0.3 + environment.topExposure * 0.7);
      recession = scale * 0.072 * time * causal * peeling * conditioned;
      damage = peeling * causal * time;
      break;
    }
    case 'freeze-thaw': {
      const strength = environment.freezeThaw * environment.infiltration;
      // Buried finite joints increase infiltration and damage, but C6 may only
      // open them through exposure-conditioned recession. Subtracting every
      // finite panel directly creates sealed internal void shells rather than a
      // surface-connected crack system.
      recession = scale * 0.046 * strength * environment.fractureInfluence * causal * conditioned;
      damage = strength * (0.35 + environment.fractureInfluence * 0.65);
      break;
    }
    case 'thermal-salt': {
      const strength = clamp(environment.thermal * 0.62 + environment.salt * environment.moisture * 0.72, 0, 1);
      recession = scale * 0.046 * time * causal * strength * (0.32 + micro * 0.68) * conditioned;
      damage = strength * causal * time;
      break;
    }
    case 'tafoni': {
      const strength = clamp(environment.salt * (0.45 + environment.moisture * 0.55) * time * (0.75 + priorDamage * 0.25), 0, 1);
      if (strength > 0) cavityDistance = tafoniDistance(context, strength);
      recession = scale * 0.014 * causal * strength * micro;
      damage = strength * 0.82;
      break;
    }
    case 'karst': {
      const strength = clamp(environment.runoff * environment.moisture * time * (0.58 + environment.infiltration * 0.42), 0, 1);
      if (strength > 0) cavityDistance = karstDistance(context, strength);
      recession = scale * 0.06 * strength * causal * (0.3 + environment.drainage * 0.7) * conditioned;
      damage = strength;
      break;
    }
    case 'marine': {
      const strength = clamp(time * (0.52 + environment.salt * 0.28 + environment.moisture * 0.2), 0, 1);
      if (strength > 0) cavityDistance = marineDistance(context, strength);
      recession = scale * 0.042 * strength * causal * (0.42 + environment.windExposure * 0.58);
      damage = strength * 0.78;
      break;
    }
    case 'fluvial': {
      const strength = clamp(time * (0.42 + environment.runoff * 0.58), 0, 1);
      if (strength > 0) cavityDistance = fluvialDistance(context, strength);
      recession = scale * 0.078 * strength * causal * (0.55 + environment.cornerExposure * 0.45);
      damage = strength * 0.7;
      break;
    }
    case 'aeolian': {
      const strength = clamp(time * environment.windExposure * (0.62 + environment.thermal * 0.38), 0, 1);
      if (strength > 0) cavityDistance = aeolianDistance(context, strength);
      recession = scale * 0.052 * strength * causal * (0.35 + micro * 0.65);
      damage = strength * 0.64;
      break;
    }
    case 'glacial': {
      const strength = clamp(time * (0.55 + environment.freezeThaw * 0.45), 0, 1);
      if (strength > 0) cavityDistance = glacialDistance(context, strength);
      recession = scale * 0.044 * strength * (0.52 + micro * 0.48) * (0.7 + environment.materialWeakness * 0.3);
      damage = strength * 0.76;
      break;
    }
    default:
      break;
  }
  return { cavityDistance, damage: clamp(damage, 0, 1), recessionMetres: Math.max(0, recession) };
}

export function createProcessField(program, structuralProgram, fractureStage, options = {}) {
  const structuralField = createStructuralField(structuralProgram);
  const fractureProgram = fractureStage.fractureNetwork;
  const fractureById = new Map(fractureProgram.fractures.map((fracture) => [fracture.id, fracture]));
  const extents = structuralProgram.bounds.halfExtentsMetres;
  const timeFraction = clamp(options.timeFraction ?? 1, 0, 1);

  function sample(worldPoint) {
    const base = structuralField.evaluate(worldPoint);
    const local = worldToFrame(structuralProgram.frames.formation, worldPoint);
    const context = {
      base,
      extents,
      local,
      program,
      seed: program.seeds.weathering,
      structuralProgram,
      fractureProgram,
      fractureById,
      timeFraction,
      worldPoint,
    };
    const environment = evaluateEnvironment(context);
    let priorDamage = environment.bondWeakening * 0.32;
    const morphologyDistanceMetres = processMorphology(context);
    let signedDistanceMetres = Math.max(base.envelopeDistanceMetres, morphologyDistanceMetres);
    const kernelSamples = [];
    for (const descriptor of program.kernels) {
      const descriptorSeed = Math.imul(descriptor.processIndex + 1, 0x45d9f3b)
        ^ Math.imul(descriptor.suborder + 1, 0x119de1f3);
      const effect = kernelEffect(descriptor.kernelId, { ...context, seed: context.seed ^ descriptorSeed }, environment, priorDamage);
      signedDistanceMetres += effect.recessionMetres;
      if (effect.cavityDistance < Infinity) signedDistanceMetres = Math.max(signedDistanceMetres, -effect.cavityDistance);
      priorDamage = clamp(priorDamage + effect.damage * (1 - priorDamage) * 0.48, 0, 1);
      kernelSamples.push({
        damageNormalized: effect.damage,
        id: descriptor.id,
        kernelId: descriptor.kernelId,
        recessionMetres: effect.recessionMetres,
        sourceProcessId: descriptor.sourceProcessId,
      });
    }
    // Differential erosion is universal and remains bounded, monotonic, and
    // explicitly controlled by material and fabric fields even for recipes
    // whose named process is transport rather than weathering.
    const differential = Math.max(...extents) * 0.052 * timeFraction
      * environment.exposure * environment.materialWeakness
      * (0.58 + environment.fabricWeakness * 0.42)
      * (0.72 + (noise3(program.seeds.weathering, local, Math.max(...extents) * 0.21, 61) + 1) * 0.14);
    signedDistanceMetres += differential;
    return {
      base,
      damageNormalized: clamp(priorDamage, 0, 1),
      differentialErosionMetres: differential,
      environment,
      kernelSamples,
      morphologyDistanceMetres,
      signedDistanceMetres,
      timeFraction,
      timeYears: program.exposureYears * timeFraction,
    };
  }

  return Object.freeze({
    evaluate: (x, y, z) => sample([x, y, z]).signedDistanceMetres,
    program,
    sample,
    timeFraction,
  });
}
