import { contentId } from '../canonical.node.js';
import { createStructuralField } from '../structure/field.node.js';
import { clamp, fractalNoise2D, hash01, signedDistanceBox, smootherstep01 } from '../structure/math.node.js';

function clean(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function ridgeProfile(value, exponent = 1.6) {
  return Math.max(0, 1 - Math.abs(value) ** exponent);
}

function towerCenters(program) {
  const count = program.profile.towerCount ?? 0;
  const centers = [];
  for (let index = 0; index < count; index += 1) {
    centers.push({
      radius: 0.075 + hash01(program.formationSeed, index, 0, 0, 72) * 0.07,
      strength: 0.48 + hash01(program.formationSeed, index, 0, 0, 73) * 0.52,
      x: hash01(program.formationSeed, index, 0, 0, 70) * 1.72 - 0.86,
      z: hash01(program.formationSeed, index, 0, 0, 71) * 1.72 - 0.86,
    });
  }
  return Object.freeze(centers);
}

export function createFormationField(program, structuralProgram) {
  if (program.parentStructuralProgramContentId !== structuralProgram.programContentId) {
    throw new RangeError('Formation field requires its declared parent structural program.');
  }
  const structural = createStructuralField(structuralProgram);
  const min = program.formationBounds.min;
  const max = program.formationBounds.max;
  const center = min.map((value, axis) => (value + max[axis]) * 0.5);
  const length = max[0] - min[0];
  const depth = max[2] - min[2];
  const nominalHeight = (max[1] - min[1]) / 1.06;
  const baseY = min[1] + nominalHeight * 0.075;
  const towers = towerCenters(program);

  function normalizedHorizontal(worldPoint) {
    return {
      u: (worldPoint[0] - center[0]) / (length * 0.5),
      v: (worldPoint[2] - center[2]) / (depth * 0.5),
    };
  }

  function rawHeight(worldPoint) {
    const { u, v } = normalizedHorizontal(worldPoint);
    const macroNoise = fractalNoise2D(program.formationSeed, u * 1.73 + 8.1, v * 1.73 - 3.7, { octaves: 4, gain: 0.51 });
    const detailNoise = fractalNoise2D(program.formationSeed ^ 0x74a22d19, u * 7.2, v * 7.2, { octaves: 3, gain: 0.46 });
    let shape = 0;
    switch (program.profile.kind) {
      case 'steep-stratified-ridge': {
        const shifted = v - Math.sin(u * Math.PI * 1.15) * 0.075;
        const ridge = shifted < 0
          ? clamp(1 + shifted * 2.55, 0, 1)
          : Math.max(0, 1 - shifted * 0.94) ** 1.46;
        shape = ridge * (0.84 + macroNoise * 0.12) * ridgeProfile(u * 0.91, 3.4);
        break;
      }
      case 'folded-ridge': {
        const foldedCenter = Math.sin(u * Math.PI * 2.4) * 0.19 + Math.sin(u * Math.PI * 0.72) * 0.08;
        shape = ridgeProfile((v - foldedCenter) * 1.17, 1.55) * ridgeProfile(u * 0.94, 2.8);
        shape *= 0.77 + 0.18 * Math.cos((u + v) * Math.PI * 3.2);
        break;
      }
      case 'fault-scarp': {
        const faultTrace = v + Math.sin(u * Math.PI * 1.8) * 0.06;
        const footwall = smootherstep01(clamp((0.12 - faultTrace) / 0.24, 0, 1));
        shape = (0.25 + footwall * (0.58 + program.profile.faultThrow)) * ridgeProfile(u * 0.95, 4.2);
        shape -= Math.max(faultTrace, 0) * 0.12;
        break;
      }
      case 'shattered-alpine-ridge': {
        const main = ridgeProfile((v - Math.sin(u * Math.PI * 1.55) * 0.08) * 1.2, 1.35);
        const peaks = 0.68 + 0.32 * Math.abs(Math.sin((u * 4.5 + macroNoise * 0.4) * Math.PI));
        shape = main * peaks * ridgeProfile(u * 0.94, 2.3);
        shape += detailNoise * program.profile.shatterStrength * main;
        break;
      }
      case 'exfoliation-massif': {
        const radial = Math.hypot(u * 0.91, v * 1.05);
        shape = Math.max(0, 1 - radial ** 1.72);
        shape = shape ** 0.62 * (0.93 + macroNoise * 0.065);
        break;
      }
      case 'volcanic-massif': {
        const warpedU = u + macroNoise * 0.055;
        const warpedV = v - macroNoise * 0.045;
        const radius = Math.hypot(warpedU, warpedV);
        const angle = Math.atan2(warpedV, warpedU);
        const radialRidges = Math.cos(angle * 7 + radius * 8) * program.profile.radialRidgeStrength * Math.max(0, 1 - radius);
        const cone = Math.max(0, 1 - radius) ** 1.08;
        const summit = Math.max(0, 1 - Math.hypot((u + 0.13) * 2.3, (v - 0.08) * 2.3)) * 0.17;
        shape = cone + radialRidges + summit;
        break;
      }
      case 'karst-tower-field': {
        shape = 0.09 + macroNoise * 0.025;
        for (const tower of towers) {
          const distance = Math.hypot(u - tower.x, v - tower.z);
          const cone = Math.max(0, 1 - distance / tower.radius);
          const towerHeight = cone ** 0.43 * tower.strength;
          shape = Math.max(shape, towerHeight);
        }
        shape *= ridgeProfile(u * 0.98, 8) * ridgeProfile(v * 0.98, 8);
        break;
      }
      default:
        throw new RangeError(`Unsupported formation profile: ${program.profile.kind}`);
    }
    const edgeFade = smootherstep01(clamp((1 - Math.max(Math.abs(u), Math.abs(v))) / 0.09, 0, 1));
    const relief = nominalHeight * program.profile.relief;
    return baseY + Math.max(0.025, shape * edgeFade) * relief + detailNoise * nominalHeight * 0.012;
  }

  function talusHeight(worldPoint) {
    const { u, v } = normalizedHorizontal(worldPoint);
    const slopeBand = smootherstep01(clamp((Math.max(Math.abs(v), Math.abs(u) * 0.58) - 0.43) / 0.43, 0, 1));
    const fragments = Math.max(0, fractalNoise2D(program.formationSeed ^ 0x229bc6f1, u * 9.1, v * 9.1, { octaves: 3, gain: 0.54 }));
    return nominalHeight * program.profile.talusStrength * slopeBand * (0.35 + fragments * 0.65);
  }

  function surfaceHeight(worldPoint) {
    const bedrock = rawHeight(worldPoint);
    return Math.max(bedrock, baseY + talusHeight(worldPoint));
  }

  function sample(worldPoint) {
    if (!Array.isArray(worldPoint) || worldPoint.length !== 3 || worldPoint.some((value) => !Number.isFinite(value))) {
      throw new TypeError('Formation samples require a finite [x,y,z] world point.');
    }
    const top = surfaceHeight(worldPoint);
    const structuralSample = structural.evaluate(worldPoint);
    // Geometry relief is anchored to the parent surface, not to the queried Y.
    // Query-space phase would create repeated zero crossings (detached shells)
    // through every bed. Surface anchoring yields one continuous terrain skin
    // while material lookup remains fully three-dimensional and global.
    const structuralSurfaceSample = structural.evaluate([worldPoint[0], top, worldPoint[2]]);
    const meanLayer = structuralProgram.layers.distribution?.meanMetres ?? nominalHeight * 0.12;
    const phase = ((structuralSurfaceSample.stratigraphicCoordinateMetres / Math.max(meanLayer, 1e-6)) % 1 + 1) % 1;
    const ledgeWindow = phase < 0.2 ? (1 - phase / 0.2) ** 1.65 : 0;
    const ledge = program.profile.ledgeStrength * nominalHeight * ledgeWindow;
    const scalar = worldPoint[1] - top + ledge;
    return Object.freeze({
      formationCoordinatesMetres: structuralSample.formationCoordinatesMetres,
      materialId: structuralSample.materialId,
      materialPhaseNormalized: clean(phase),
      scalarMetres: clean(scalar),
      sourceKind: top > rawHeight(worldPoint) + 1e-6 ? 'transported-talus' : 'in-situ-bedrock',
      stratigraphicCoordinateMetres: structuralSample.stratigraphicCoordinateMetres,
      surfaceHeightMetres: clean(top),
      worldPointMetres: [...worldPoint],
    });
  }

  function evaluate(...args) {
    const worldPoint = args.length === 1 ? args[0] : args;
    return sample(worldPoint).scalarMetres;
  }

  function createModuleField(module) {
    const cropCenter = module.cropBounds.min.map((value, axis) => (value + module.cropBounds.max[axis]) * 0.5);
    const cropHalf = module.cropBounds.min.map((value, axis) => (module.cropBounds.max[axis] - value) * 0.5);
    function moduleEvaluate(...args) {
      const worldPoint = args.length === 1 ? args[0] : args;
      const local = worldPoint.map((value, axis) => value - cropCenter[axis]);
      return Math.max(evaluate(worldPoint), signedDistanceBox(local, cropHalf, 0));
    }
    return Object.freeze({
      evaluate: moduleEvaluate,
      fieldContentId: contentId({ parent: program.programContentId, moduleId: module.id, cropBounds: module.cropBounds }),
      module,
      sample,
    });
  }

  return Object.freeze({
    createModuleField,
    evaluate,
    normalizedHorizontal,
    program,
    sample,
    structural,
    surfaceHeight,
  });
}
