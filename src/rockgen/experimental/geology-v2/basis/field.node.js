import { contentId } from '../canonical.node.js';
import { clamp, hash01, smootherstep01 } from '../structure/math.node.js';
import {
  CLIFF_BEDDED_GRAND_CANYON_R1,
  CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256,
  CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID,
  compileCliffBeddedGrandCanyonMacro,
  evaluateReferenceVisualHull,
  signedDistanceReferencePolygon2D,
} from './referenceProfile.node.js';

const FEATURE_ORDER = Object.freeze([
  'jointing', 'bedding', 'columns', 'karst', 'fissility', 'foliation', 'clasts', 'transport',
]);

const C8_BASIS_FIELD_VERSION = 5;
const C8_SANDSTONE_CLIFF_SURFACE_VERSION = 11;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothMinimum(a, b, radius) {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  if (!(radius > 0)) return Math.min(a, b);
  const h = clamp(0.5 + 0.5 * (b - a) / radius, 0, 1);
  return lerp(b, a, h) - radius * h * (1 - h);
}

function smoothMaximum(a, b, radius) {
  return -smoothMinimum(-a, -b, radius);
}

function rotateXZ(point, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [point[0] * cosine - point[2] * sine, point[1], point[0] * sine + point[2] * cosine];
}

function rotateZ(point, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine, point[2]];
}

function rotateX(point, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [point[0], point[1] * cosine - point[2] * sine, point[1] * sine + point[2] * cosine];
}

function translate(point, offset) {
  return point.map((value, axis) => value - offset[axis]);
}

function worldToMorphologyFrame(recipe, worldPoint) {
  const origin = recipe.geologyTransform.originMetres;
  const relative = worldPoint.map((value, axis) => value - origin[axis]);
  const strikeRadians = recipe.geologyTransform.strikeDegrees * Math.PI / 180;
  const strike = [Math.sin(strikeRadians), 0, Math.cos(strikeRadians)];
  const acrossStrike = [Math.cos(strikeRadians), 0, -Math.sin(strikeRadians)];
  return [
    relative[0] * strike[0] + relative[2] * strike[2],
    relative[1],
    relative[0] * acrossStrike[0] + relative[2] * acrossStrike[2],
  ];
}

function signedDistanceRoundedBox(point, halfExtents, radius) {
  const q = point.map((value, axis) => Math.abs(value) - halfExtents[axis] + radius);
  return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
    + Math.min(Math.max(q[0], q[1], q[2]), 0) - radius;
}

function signedDistanceEllipsoid(point, radii) {
  const k0 = Math.hypot(...point.map((value, axis) => value / radii[axis]));
  const k1 = Math.hypot(...point.map((value, axis) => value / (radii[axis] * radii[axis])));
  return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(...radii);
}

function facetedEllipsoid(point, radii, seed, facetCount = 5, minimumSupport = 0.86, maximumSupport = 0.97) {
  let result = signedDistanceEllipsoid(point, radii);
  for (let index = 0; index < facetCount; index += 1) {
    let normal = [
      hash01(seed, index, 301) * 2 - 1,
      hash01(seed, index, 302) * 1.5 - 0.75,
      hash01(seed, index, 303) * 2 - 1,
    ];
    const length = Math.hypot(...normal) || 1;
    normal = normal.map((value) => value / length);
    const support = Math.hypot(...normal.map((value, axis) => value * radii[axis]));
    const plane = point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2]
      - support * lerp(minimumSupport, maximumSupport, hash01(seed, index, 304));
    result = Math.max(result, plane);
  }
  return result;
}

function signedDistanceHexPrismY(point, radius, halfHeight) {
  const x = Math.abs(point[0]);
  const z = Math.abs(point[2]);
  const hex = Math.max(x * 0.866025403784 + z * 0.5, z) - radius;
  const vertical = Math.abs(point[1]) - halfHeight;
  return Math.hypot(Math.max(hex, 0), Math.max(vertical, 0)) + Math.min(Math.max(hex, vertical), 0);
}

function valueNoise3(seed, point, frequency, channel = 0) {
  const p = point.map((value) => value * frequency);
  const cell = p.map(Math.floor);
  const f = p.map((value, axis) => smootherstep01(value - cell[axis]));
  const sample = (x, y, z) => hash01(seed, cell[0] + x, cell[1] + y, cell[2] + z, channel) * 2 - 1;
  const x00 = lerp(sample(0, 0, 0), sample(1, 0, 0), f[0]);
  const x10 = lerp(sample(0, 1, 0), sample(1, 1, 0), f[0]);
  const x01 = lerp(sample(0, 0, 1), sample(1, 0, 1), f[0]);
  const x11 = lerp(sample(0, 1, 1), sample(1, 1, 1), f[0]);
  return lerp(lerp(x00, x10, f[1]), lerp(x01, x11, f[1]), f[2]);
}

function surfaceNoise(seed, point, scale, amplitude) {
  return (
    valueNoise3(seed, point, 1.7 / scale, 19) * 0.62
    + valueNoise3(seed ^ 0x6a09e667, point, 4.1 / scale, 31) * 0.28
    + valueNoise3(seed ^ 0xbb67ae85, point, 9.7 / scale, 47) * 0.1
  ) * amplitude;
}

function finiteGroove(value, spacing, width) {
  const phase = Math.abs((((value / spacing) % 1) + 1) % 1 - 0.5) * spacing;
  return Math.exp(-(phase * phase) / Math.max(width * width, 1e-12));
}

function buildSandstoneCliffSurfaceProgram(dimensions, seed) {
  const scale = Math.max(...dimensions);
  const halfExtents = dimensions.map((value) => value * 0.45);
  const jointSpecs = Object.freeze([
    Object.freeze({
      centerX: -0.39 + (hash01(seed, 0, 3217) - 0.5) * 0.09,
      maximumY: lerp(0.58, 0.76, hash01(seed, 0, 3219)),
      minimumY: lerp(-0.01, 0.08, hash01(seed, 0, 3220)),
      width: lerp(0.03, 0.05, hash01(seed, 0, 3218)),
    }),
    Object.freeze({
      centerX: 0.38 + (hash01(seed, 1, 3217) - 0.5) * 0.1,
      maximumY: lerp(0.47, 0.68, hash01(seed, 1, 3219)),
      minimumY: lerp(0.14, 0.24, hash01(seed, 1, 3220)),
      width: lerp(0.032, 0.052, hash01(seed, 1, 3218)),
    }),
  ]);
  const contacts = [];
  let level = -halfExtents[1] - scale * 0.055;
  for (let index = 0; level < halfExtents[1] + scale * 0.08; index += 1) {
    const thickness = scale * lerp(0.034, 0.094, hash01(seed, index, 890));
    level += thickness;
    contacts.push(Object.freeze({
      level,
      reachX: lerp(0.48, 1.18, hash01(seed, index, 894)),
      reachZ: lerp(0.78, 1.48, hash01(seed, index, 895)),
      centerX: lerp(-0.34, 0.34, hash01(seed, index, 892)),
      centerZ: lerp(-0.22, 0.22, hash01(seed, index, 893)),
      recess: lerp(0.3, 1, hash01(seed, index, 898)),
      width: scale * lerp(0.0034, 0.0088, hash01(seed, index, 891)),
    }));
  }
  const packageLenses = contacts.map((contact, index) => {
    const lower = index === 0 ? -halfExtents[1] - scale * 0.055 : contacts[index - 1].level;
    const upper = contact.level;
    return Object.freeze({
      angle: lerp(-Math.PI, Math.PI, hash01(seed, index, 930)),
      center: [
        lerp(-halfExtents[0] * 0.78, halfExtents[0] * 0.78, hash01(seed, index, 931)),
        lerp(lower, upper, hash01(seed, index, 932)),
        lerp(-halfExtents[2] * 0.76, halfExtents[2] * 0.76, hash01(seed, index, 933)),
      ],
      radii: [
        scale * lerp(0.09, 0.24, hash01(seed, index, 934)),
        Math.max((upper - lower) * lerp(0.18, 0.46, hash01(seed, index, 935)), scale * 0.012),
        scale * lerp(0.065, 0.19, hash01(seed, index, 936)),
      ],
      strength: lerp(-1, 1, hash01(seed, index, 937)),
    });
  });
  const packageTones = [];
  let packageGroup = 0;
  for (let index = 0; index <= contacts.length; index += 1) {
    if (index > 0 && hash01(seed, index, 938) > 0.62) packageGroup += 1;
    packageTones.push(hash01(seed, packageGroup, 939));
  }

  function sample(point) {
    // World-Y remains the declared stratigraphic axis. Gentle XZ-only warping
    // produces real bed/land-surface intersections on the crest without
    // rotating one pasted stripe direction across every exposed face.
    const regionalWarp = valueNoise3(
      seed ^ 0x6a09e667,
      [point[0], 0, point[2]],
      0.62 / scale,
      899,
    ) * scale * 0.021;
    const localWarp = valueNoise3(
      seed ^ 0xbb67ae85,
      [point[0], 0, point[2]],
      1.45 / scale,
      900,
    ) * scale * 0.0075;
    const stratigraphicCoordinateMetres = point[1] + regionalWarp + localWarp;
    const normalizedX = point[0] / Math.max(halfExtents[0], 1e-6);
    const normalizedY = point[1] / Math.max(halfExtents[1], 1e-6);
    const normalizedZ = point[2] / Math.max(halfExtents[2], 1e-6);
    let bedContact = 0;
    let contactRecession = 0;
    let nearestContactDistanceMetres = Infinity;
    let packageIndex = contacts.length;
    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index];
      const undulation = valueNoise3(
        seed ^ Math.imul(index + 1, 0x3c6ef372),
        [point[0], 0, point[2]],
        lerp(0.9, 2.1, hash01(seed, index, 901)) / scale,
        902 + index,
      ) * scale * lerp(0.004, 0.012, hash01(seed, index, 903));
      const distance = stratigraphicCoordinateMetres - contact.level - undulation;
      if (distance < 0 && packageIndex === contacts.length) packageIndex = index;
      nearestContactDistanceMetres = Math.min(nearestContactDistanceMetres, Math.abs(distance));
      const radial = Math.hypot(
        (normalizedX - contact.centerX) / contact.reachX,
        (normalizedZ - contact.centerZ) / contact.reachZ,
      );
      const finiteSupport = smootherstep01(clamp((1 - radial) / 0.24, 0, 1));
      const breakupNoise = valueNoise3(
        seed ^ 0x510e527f ^ Math.imul(index + 1, 0x9e3779b1),
        [point[0], 0, point[2]],
        lerp(1.8, 3.4, hash01(seed, index, 904)) / scale,
        905 + index,
      );
      const discontinuity = smootherstep01(clamp(breakupNoise * 1.1 + 0.68, 0, 1));
      const contactSignal = Math.exp(-((distance / contact.width) ** 2)) * finiteSupport * discontinuity;
      bedContact = Math.max(bedContact, contactSignal);
      contactRecession = Math.max(contactRecession, contactSignal * contact.recess);
    }

    let joint = 0;
    for (let index = 0; index < jointSpecs.length; index += 1) {
      const spec = jointSpecs[index];
      const enters = smootherstep01(clamp((normalizedY - spec.minimumY) / 0.1, 0, 1));
      const exits = smootherstep01(clamp((spec.maximumY - normalizedY) / 0.12, 0, 1));
      const irregularCenter = spec.centerX + valueNoise3(
        seed ^ Math.imul(index + 1, 0x243f6a88),
        [0, point[1], point[2]],
        2.7 / scale,
        920 + index,
      ) * spec.width * 0.42;
      const jointBreakup = smootherstep01(clamp(
        valueNoise3(seed ^ 0x71374491, point, 5.3 / scale, 923 + index) * 0.78 + 0.62,
        0,
        1,
      ));
      joint = Math.max(
        joint,
        Math.exp(-(((normalizedX - irregularCenter) / (spec.width * 1.18)) ** 2))
          * enters * exits * jointBreakup,
      );
    }

    const materialPointA = [point[0] + point[2] * 0.43, point[1] - point[0] * 0.17, point[2] + point[1] * 0.21];
    const materialPointB = [point[2] - point[0] * 0.31, point[1] + point[2] * 0.24, point[0] + point[1] * 0.13];
    let lensMineral = 0;
    for (const lens of packageLenses) {
      const dx = point[0] - lens.center[0];
      const dz = point[2] - lens.center[2];
      const cosine = Math.cos(lens.angle);
      const sine = Math.sin(lens.angle);
      const lx = dx * cosine - dz * sine;
      const lz = dx * sine + dz * cosine;
      const ly = point[1] - lens.center[1];
      const radiusSquared = (lx / lens.radii[0]) ** 2 + (ly / lens.radii[1]) ** 2 + (lz / lens.radii[2]) ** 2;
      lensMineral += Math.exp(-radiusSquared * 1.7) * lens.strength;
    }
    lensMineral = clamp(lensMineral, -1, 1);
    const packageTone = clamp(
      0.4 + (packageTones[packageIndex] - 0.5) * 0.16 + lensMineral * 0.13,
      0,
      1,
    );
    const cement = clamp(
      0.5 + lensMineral * 0.28
        + valueNoise3(seed ^ 0x428a2f98, materialPointA, 3.2 / scale, 918) * 0.055
        + (packageTone - 0.5) * 0.11,
      0,
      1,
    );
    const ironOxide = clamp(
      0.43 - lensMineral * 0.11
        + valueNoise3(seed ^ 0x1f83d9ab, materialPointB, 2.7 / scale, 919) * 0.07
        + (1 - cement) * 0.11,
      0,
      1,
    );
    const grain = clamp(
      valueNoise3(seed ^ 0xcbbb9d5d, materialPointA, 31 / scale, 915) * 0.34
        + valueNoise3(seed ^ 0x85a308d3, materialPointB, 53 / scale, 921) * 0.1
        + valueNoise3(seed ^ 0x71374491, [materialPointA[2], materialPointB[0], materialPointA[1]], 79 / scale, 922) * 0.06
        + 0.5,
      0,
      1,
    );
    const grainRelief = clamp(
      valueNoise3(seed ^ 0xb5c0fbcf, materialPointA, 157 / scale, 926) * 0.2
        + valueNoise3(seed ^ 0xe9b5dba5, materialPointB, 223 / scale, 927) * 0.17
        + valueNoise3(seed ^ 0x3956c25b, [materialPointB[1], materialPointA[2], materialPointA[0]], 191 / scale, 928) * 0.13
        + 0.5,
      0,
      1,
    );
    const cavity = clamp(
      contactRecession * 0.55
        + Math.max(valueNoise3(seed ^ 0x428a2f98, materialPointB, 8.7 / scale, 916) - 0.48, 0) * 0.85,
      0,
      1,
    );
    const roughnessBias = clamp(
      (cement - 0.5) * -0.22 + (grain - 0.5) * 0.18 + ironOxide * 0.09 + cavity * 0.12,
      -0.22,
      0.28,
    );
    return {
      bedding: bedContact,
      bedContact,
      cavity,
      cement,
      contactRecession,
      grain,
      grainRelief,
      ironOxide,
      joint,
      nearestContactDistanceMetres,
      packageIndex,
      packageTone,
      roughnessBias,
      stratigraphicCoordinateMetres,
    };
  }

  return Object.freeze({ contacts: Object.freeze(contacts), packageLenses: Object.freeze(packageLenses), sample });
}

function buildSandstoneCliffJointGeometry(dimensions, seed, surfaceProgram) {
  if (!Array.isArray(dimensions) || dimensions.length !== 3
    || dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError('Sandstone cliff joint geometry requires three finite positive dimensions.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError('Sandstone cliff joint geometry seed must be a uint32.');
  }
  if (!surfaceProgram || !Array.isArray(surfaceProgram.contacts)) {
    throw new TypeError('Sandstone cliff joint geometry requires the compiled semantic bed contacts.');
  }
  const h = dimensions.map((value) => value * 0.45);
  const bedContacts = surfaceProgram.contacts.map((contact, index) => Object.freeze({
    index,
    levelMetres: contact.level,
    normalizedY: contact.level / h[1],
  }));
  const baseSpecs = [
    {
      centerX: -0.39 + (hash01(seed, 0, 3217) - 0.5) * 0.09,
      maximumY: lerp(0.58, 0.76, hash01(seed, 0, 3219)),
      minimumY: lerp(-0.01, 0.08, hash01(seed, 0, 3220)),
      width: lerp(0.03, 0.05, hash01(seed, 0, 3218)),
    },
    {
      centerX: 0.38 + (hash01(seed, 1, 3217) - 0.5) * 0.1,
      maximumY: lerp(0.47, 0.68, hash01(seed, 1, 3219)),
      minimumY: lerp(0.14, 0.24, hash01(seed, 1, 3220)),
      width: lerp(0.032, 0.052, hash01(seed, 1, 3218)),
    },
  ];
  let priorAnchorIndices = null;
  const joints = baseSpecs.map((base, jointIndex) => {
    const range = base.maximumY - base.minimumY;
    const preferredSegmentCount = hash01(seed, jointIndex, 3260) > 0.46 ? 3 : 2;
    const lowerContactMargin = 0.105;
    const upperContactMargin = 0.045;
    const distanceToRange = (contact) => Math.max(
      base.minimumY - contact.normalizedY,
      contact.normalizedY - base.maximumY,
      0,
    );
    let candidateContacts = bedContacts.filter((contact) => (
      contact.normalizedY >= base.minimumY - lowerContactMargin
      && contact.normalizedY <= base.maximumY + upperContactMargin
    ));
    const segmentCount = preferredSegmentCount === 3 && candidateContacts.length >= 6 ? 3 : 2;
    if (candidateContacts.length < segmentCount * 2) {
      candidateContacts = [...bedContacts]
        .sort((a, b) => distanceToRange(a) - distanceToRange(b) || a.index - b.index)
        .slice(0, segmentCount * 2)
        .sort((a, b) => a.normalizedY - b.normalizedY);
    }
    if (priorAnchorIndices && candidateContacts.length < segmentCount * 2 + 2) {
      const admitted = new Set(candidateContacts.map((contact) => contact.index));
      const alternates = bedContacts
        .filter((contact) => !admitted.has(contact.index))
        .sort((a, b) => distanceToRange(a) - distanceToRange(b) || a.index - b.index);
      for (const alternate of alternates) {
        candidateContacts.push(alternate);
        if (candidateContacts.length >= segmentCount * 2 + 2) break;
      }
      candidateContacts.sort((a, b) => a.normalizedY - b.normalizedY);
    }
    const intervals = [];
    if (segmentCount === 2) {
      const gapCenter = base.minimumY + range * lerp(0.43, 0.57, hash01(seed, jointIndex, 3261));
      const halfGap = range * lerp(0.045, 0.075, hash01(seed, jointIndex, 3262));
      intervals.push([base.minimumY, gapCenter - halfGap], [gapCenter + halfGap, base.maximumY]);
    } else {
      const firstGapCenter = base.minimumY + range * lerp(0.29, 0.36, hash01(seed, jointIndex, 3261));
      const secondGapCenter = base.minimumY + range * lerp(0.65, 0.74, hash01(seed, jointIndex, 3262));
      const firstHalfGap = range * lerp(0.035, 0.06, hash01(seed, jointIndex, 3263));
      const secondHalfGap = range * lerp(0.04, 0.065, hash01(seed, jointIndex, 3264));
      intervals.push(
        [base.minimumY, firstGapCenter - firstHalfGap],
        [firstGapCenter + firstHalfGap, secondGapCenter - secondHalfGap],
        [secondGapCenter + secondHalfGap, base.maximumY],
      );
    }
    const rawEndpoints = intervals.flat();
    let bestAnchors = null;
    let bestAnchorScore = Infinity;
    function chooseAnchors(startIndex, chosen, enforceRangeLimits) {
      if (chosen.length === rawEndpoints.length) {
        if (enforceRangeLimits && (
          chosen[0].normalizedY < base.minimumY - 0.12
          || chosen.at(-1).normalizedY > base.maximumY + 0.05
        )) return;
        for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
          const minimum = chosen[segmentIndex * 2].normalizedY;
          const maximum = chosen[segmentIndex * 2 + 1].normalizedY;
          if (maximum - minimum < 0.055) return;
          if (segmentIndex > 0) {
            const priorMaximum = chosen[segmentIndex * 2 - 1].normalizedY;
            if (minimum - priorMaximum < 0.035) return;
          }
        }
        const repeatsPriorTierSet = priorAnchorIndices?.length === chosen.length
          && chosen.every((contact, index) => priorAnchorIndices[index] === contact.index);
        const score = chosen.reduce((sum, contact, index) => (
          sum + (contact.normalizedY - rawEndpoints[index]) ** 2
            + (priorAnchorIndices?.[index] === contact.index ? 0.006 : 0)
            + Math.max(base.minimumY - contact.normalizedY, 0) * 0.04
            + Math.max(contact.normalizedY - base.maximumY, 0) * 0.24
        ), repeatsPriorTierSet ? 0.08 : 0)
          + hash01(seed, jointIndex, ...chosen.map((contact) => contact.index), 3289) * 1e-9;
        if (score < bestAnchorScore) {
          bestAnchorScore = score;
          bestAnchors = [...chosen];
        }
        return;
      }
      const remaining = rawEndpoints.length - chosen.length;
      for (let index = startIndex; index <= candidateContacts.length - remaining; index += 1) {
        chooseAnchors(index + 1, [...chosen, candidateContacts[index]], enforceRangeLimits);
      }
    }
    chooseAnchors(0, [], true);
    if (!bestAnchors) chooseAnchors(0, [], false);
    if (!bestAnchors) throw new RangeError(`Unable to bed-anchor sandstone cliff joint ${jointIndex}.`);
    const segments = intervals.map((unusedInterval, segmentIndex) => {
      const minimumContact = bestAnchors[segmentIndex * 2];
      const maximumContact = bestAnchors[segmentIndex * 2 + 1];
      const minimumY = minimumContact.normalizedY;
      const maximumY = maximumContact.normalizedY;
      const segmentRange = maximumY - minimumY;
      const centerStart = base.centerX + (hash01(seed, jointIndex, segmentIndex, 3270) - 0.5) * 0.045;
      const centerMiddle = centerStart + (hash01(seed, jointIndex, segmentIndex, 3271) - 0.5) * 0.052;
      const centerEnd = centerMiddle + (hash01(seed, jointIndex, segmentIndex, 3272) - 0.5) * 0.048;
      const widthLeftStart = base.width * lerp(1.05, 1.55, hash01(seed, jointIndex, segmentIndex, 3273));
      const widthLeftMiddle = base.width * lerp(1.2, 1.75, hash01(seed, jointIndex, segmentIndex, 3274));
      const widthLeftEnd = base.width * lerp(0.95, 1.6, hash01(seed, jointIndex, segmentIndex, 3275));
      const widthRightStart = base.width * lerp(0.85, 1.35, hash01(seed, jointIndex, segmentIndex, 3286));
      const widthRightMiddle = base.width * lerp(1, 1.55, hash01(seed, jointIndex, segmentIndex, 3287));
      const widthRightEnd = base.width * lerp(0.78, 1.42, hash01(seed, jointIndex, segmentIndex, 3288));
      const widthStart = (widthLeftStart + widthRightStart) * 0.5;
      const widthMiddle = (widthLeftMiddle + widthRightMiddle) * 0.5;
      const widthEnd = (widthLeftEnd + widthRightEnd) * 0.5;
      return Object.freeze({
        centerEnd,
        centerMiddle,
        centerStart,
        // The profile-following cut starts inside a positive safety offset, so
        // these authored depths include that inactive allowance. The exposed
        // recession remains shallow (verified by the front-depth probe), while
        // explicit gaps keep the fracture from reading as a routed slot.
        depthEndMetres: h[2] * lerp(0.065, 0.089, hash01(seed, jointIndex, segmentIndex, 3278)),
        depthMiddleMetres: h[2] * lerp(0.072, 0.096, hash01(seed, jointIndex, segmentIndex, 3277)),
        depthStartMetres: h[2] * lerp(0.062, 0.084, hash01(seed, jointIndex, segmentIndex, 3276)),
        maximumContactIndex: maximumContact.index,
        maximumContactLevelMetres: maximumContact.levelMetres,
        maximumY,
        minimumContactIndex: minimumContact.index,
        minimumContactLevelMetres: minimumContact.levelMetres,
        minimumY,
        taperEnd: segmentRange * lerp(0.07, 0.14, hash01(seed, jointIndex, segmentIndex, 3280)),
        taperStart: segmentRange * lerp(0.06, 0.13, hash01(seed, jointIndex, segmentIndex, 3279)),
        widthEnd,
        widthLeftEnd,
        widthLeftMiddle,
        widthLeftStart,
        widthMiddle,
        widthRightEnd,
        widthRightMiddle,
        widthRightStart,
        widthStart,
      });
    });
    const chipSegmentIndex = jointIndex === 0 ? Math.min(1, segments.length - 1) : 0;
    const chipSegment = segments[chipSegmentIndex];
    const targetY = lerp(chipSegment.minimumY, chipSegment.maximumY, lerp(0.24, 0.76, hash01(seed, jointIndex, 3281)));
    const chipCandidateContacts = surfaceProgram.contacts
      .map((contact) => contact.level / h[1])
      .filter((level) => level >= chipSegment.minimumY - 1e-12 && level <= chipSegment.maximumY + 1e-12);
    const chipY = chipCandidateContacts.length
      ? chipCandidateContacts.reduce((nearest, level) => (Math.abs(level - targetY) < Math.abs(nearest - targetY) ? level : nearest))
      : targetY;
    const chipT = clamp((chipY - chipSegment.minimumY) / Math.max(chipSegment.maximumY - chipSegment.minimumY, 1e-6), 0, 1);
    const chipCenter = chipT < 0.5
      ? lerp(chipSegment.centerStart, chipSegment.centerMiddle, chipT * 2)
      : lerp(chipSegment.centerMiddle, chipSegment.centerEnd, (chipT - 0.5) * 2);
    const chipWidth = chipT < 0.5
      ? lerp(chipSegment.widthStart, chipSegment.widthMiddle, chipT * 2)
      : lerp(chipSegment.widthMiddle, chipSegment.widthEnd, (chipT - 0.5) * 2);
    const chip = Object.freeze({
      centerX: chipCenter + (hash01(seed, jointIndex, 3282) - 0.5) * chipWidth * 0.65,
      centerY: chipY,
      depthMetres: h[2] * lerp(0.086, 0.112, hash01(seed, jointIndex, 3285)),
      halfHeight: lerp(0.018, 0.035, hash01(seed, jointIndex, 3284)),
      width: chipWidth * lerp(1.15, 1.55, hash01(seed, jointIndex, 3283)),
    });
    priorAnchorIndices = bestAnchors.map((contact) => contact.index);
    return Object.freeze({
      ...base,
      chip,
      index: jointIndex,
      segments: Object.freeze(segments),
    });
  });
  const program = {
    bedContacts: Object.freeze(bedContacts),
    joints: Object.freeze(joints),
    seed,
    targetDimensionsMetres: Object.freeze([...dimensions]),
    version: 2,
  };
  return Object.freeze({ ...program, contentId: contentId(program) });
}

function graniteField(point, dimensions, seed, form) {
  const h = dimensions.map((value) => value * 0.45);
  const rotated = rotateXZ(point, (hash01(seed, 1) - 0.5) * 0.24);
  if (form === 'granite-boulder') {
    const base = facetedEllipsoid(rotated, [h[0], h[1] * 0.94, h[2]], seed, 11, 0.78, 0.95);
    const maximumDimension = Math.max(...dimensions);
    return base + Math.abs(surfaceNoise(seed, rotated, maximumDimension, maximumDimension * 0.018));
  }
  // A tor is a joint-controlled residual, not a fixed stack of horizontal
  // courses. Use unequal upright joint blocks tied into one basal remnant; this
  // permits a spire-like tor without baking periodic rings into every seed.
  const crownLean = (hash01(seed, 701) - 0.5) * 0.13;
  const pillarSpecs = [
    {
      center: [-0.09 + crownLean, 0.1, -0.05],
      extents: [lerp(0.5, 0.58, hash01(seed, 702)), lerp(0.65, 0.75, hash01(seed, 703)), lerp(0.49, 0.57, hash01(seed, 704))],
    },
    {
      center: [-lerp(0.34, 0.43, hash01(seed, 705)), -lerp(0.12, 0.22, hash01(seed, 706)), lerp(0.06, 0.16, hash01(seed, 707))],
      extents: [lerp(0.32, 0.39, hash01(seed, 708)), lerp(0.39, 0.49, hash01(seed, 709)), lerp(0.41, 0.5, hash01(seed, 710))],
    },
    {
      center: [lerp(0.29, 0.39, hash01(seed, 711)), lerp(0.02, 0.2, hash01(seed, 712)), -lerp(0.06, 0.15, hash01(seed, 713))],
      extents: [lerp(0.31, 0.38, hash01(seed, 714)), lerp(0.39, 0.49, hash01(seed, 715)), lerp(0.38, 0.47, hash01(seed, 716))],
    },
  ];
  let result = Infinity;
  for (let index = 0; index < pillarSpecs.length; index += 1) {
    const spec = pillarSpecs[index];
    const center = [spec.center[0] * h[0], spec.center[1] * h[1], spec.center[2] * h[2]];
    const extents = [spec.extents[0] * h[0], spec.extents[1] * h[1], spec.extents[2] * h[2]];
    const local = rotateXZ(translate(rotated, center), (hash01(seed, index, 6) - 0.5) * 0.11);
    const block = signedDistanceRoundedBox(local, extents, Math.min(extents[0], extents[2]) * lerp(0.065, 0.105, hash01(seed, index, 717)));
    const shell = facetedEllipsoid(local, extents.map((value) => value * 1.08), seed ^ Math.imul(index + 1, 0x243f6a88), 9, 0.8, 0.95);
    result = Math.min(result, Math.max(block, shell));
  }
  const baseRemnant = facetedEllipsoid(
    translate(rotated, [h[0] * 0.03, -h[1] * 0.62, -h[2] * 0.03]),
    [h[0] * lerp(0.75, 0.84, hash01(seed, 718)), h[1] * 0.23, h[2] * lerp(0.76, 0.85, hash01(seed, 719))],
    seed ^ 0x85a308d3,
    7,
  );
  result = smoothMinimum(result, baseRemnant, Math.min(h[0], h[2]) * 0.04);
  const rootedCore = facetedEllipsoid(
    translate(rotated, [0, -h[1] * 0.29, 0]),
    [h[0] * 0.55, h[1] * 0.31, h[2] * 0.57],
    seed ^ 0xcbbb9d5d,
    8,
    0.8,
    0.96,
  );
  result = smoothMinimum(result, rootedCore, Math.min(h[0], h[2]) * 0.035);
  const maximumDimension = Math.max(...dimensions);
  return result + Math.abs(surfaceNoise(seed, rotated, maximumDimension, maximumDimension * 0.009));
}

function sandstoneField(point, dimensions, seed, form, compiledMacro = null, jointGeometry = null) {
  const h = dimensions.map((value) => value * 0.45);
  const isCliff = form === 'sandstone-cliff';
  const rotated = rotateXZ(point, (hash01(seed, 5) - 0.5) * 0.12);
  const lateralWander = Math.sin(rotated[1] / Math.max(h[1], 1e-6) * Math.PI * 1.4 + hash01(seed, 320) * 4) * h[0] * 0.045;
  const shaped = [rotated[0] - lateralWander, rotated[1], rotated[2]];
  // A bounded cliff proof still needs a weathered rock perimeter. Assemble the
  // macro envelope from the admitted cliff-bedded front, side, and top profiles.
  // The intersection is a visual-hull set constraint in the deformed morphology
  // frame. A separate basal profile constrains the admitted support hypothesis.
  let result;
  if (isCliff) {
    if (!compiledMacro) throw new TypeError('sandstone-cliff requires its compiled source-bound macro.');
    if (!jointGeometry) throw new TypeError('sandstone-cliff requires its compiled joint geometry.');
    result = evaluateReferenceVisualHull(compiledMacro, shaped);
    const heightAboveSupport = clamp((shaped[1] / h[1] + 0.9) / 0.34, 0, 1);
    const supportRelaxation = smootherstep01(heightAboveSupport) * Math.max(h[0], h[2]) * 1.35;
    const bottomSupport = signedDistanceReferencePolygon2D(
      [shaped[0], shaped[2]],
      compiledMacro.bottomSupportXZ,
    ) - supportRelaxation;
    result = Math.max(result, bottomSupport);

    // Differential erosion is represented as recession of one continuous wall,
    // not unions of shelf primitives. Exactly one resistant package is allowed
    // to affect mesh-scale relief. Finer bedding belongs to the semantic/bake
    // channels so the macro cannot regress into a stack of construction shelves.
    const bedDip = lerp(-0.045, 0.065, hash01(seed, 3210));
    const bedCoordinate = shaped[1] / h[1] + shaped[0] / h[0] * bedDip;
    const normalizedX = shaped[0] / h[0];
    const jointSpecs = jointGeometry.joints;
    const resistantBench = {
      centerX: lerp(-0.24, -0.08, hash01(seed, 3213)),
      halfReach: lerp(0.49, 0.62, hash01(seed, 3214)),
      level: -0.25 + (hash01(seed, 3211) - 0.5) * 0.055,
      relief: h[2] * lerp(0.14, 0.19, hash01(seed, 3215)),
      width: lerp(0.043, 0.065, hash01(seed, 3212)),
    };
    const verticalBand = Math.exp(-(((bedCoordinate - resistantBench.level) / resistantBench.width) ** 2));
    const lateralDistance = Math.abs((normalizedX - resistantBench.centerX) / resistantBench.halfReach);
    const finiteContinuity = smootherstep01(clamp((1 - lateralDistance) / 0.21, 0, 1));
    let jointTermination = 1;
    for (const joint of jointSpecs) {
      const gapDistance = (normalizedX - joint.centerX) / (joint.width * 2.6);
      jointTermination *= 1 - Math.exp(-(gapDistance * gapDistance)) * 0.94;
    }
    const ledgeRelief = verticalBand * finiteContinuity * jointTermination * resistantBench.relief;

    // The basal apron is coherent bedrock support, not a clean lower course and
    // not loose talus. Its shoulder height and forward reach vary laterally,
    // yielding an asymmetric toe/root transition connected to the cliff mass.
    const toeShoulder = -0.09 + normalizedX * 0.21
      + valueNoise3(seed ^ 0x510e527f, [shaped[0], -h[1] * 0.38, 0], 0.48 / Math.max(...dimensions), 3227) * 0.14;
    const toeWeight = smootherstep01(clamp((toeShoulder - bedCoordinate) / 0.88, 0, 1));
    const toeIrregularity = clamp(
      0.84 + normalizedX * 0.15
        + valueNoise3(seed ^ 0x9b05688c, [shaped[0], -h[1] * 0.55, shaped[2]], 0.62 / Math.max(...dimensions), 3228) * 0.24,
      0.52,
      1.18,
    );
    const wallUndulation = valueNoise3(seed ^ 0x6a09e667, [shaped[0], shaped[1], 0], 0.32 / Math.max(...dimensions), 3216)
      * h[2] * 0.055;
    // One coherent joint/bed-bounded loss opens through the side perimeter. It
    // is never an enclosed socket: everything outboard of the irregular inner
    // step is recessed for one finite height interval.
    const lossMinimumY = lerp(0.21, 0.29, hash01(seed, 3231));
    const lossMaximumY = lossMinimumY + lerp(0.2, 0.29, hash01(seed, 3233));
    const lossInnerX = jointSpecs[1].centerX + lerp(0.035, 0.09, hash01(seed, 3230))
      + Math.sin(bedCoordinate * Math.PI * 2.3 + hash01(seed, 3232) * Math.PI) * 0.035;
    const lossAcross = smootherstep01(clamp((normalizedX - lossInnerX) / 0.13, 0, 1));
    const lossEnters = smootherstep01(clamp((bedCoordinate - lossMinimumY) / 0.1, 0, 1));
    const lossExits = smootherstep01(clamp((lossMaximumY - bedCoordinate) / 0.11, 0, 1));
    const lossMask = lossAcross * lossEnters * lossExits;
    const blockLoss = lossMask * h[2] * lerp(0.075, 0.12, hash01(seed, 3234));

    // Joints are finite bed-bounded fracture segments, not routed slots. Each
    // segment has its own piecewise drift, asymmetric width/depth, and short
    // tapers. Explicit gaps remain empty; the deeper chip is localized to a
    // real semantic bed contact. Contributions combine by max, never by sum.
    let jointRecession = 0;
    for (const joint of jointSpecs) {
      const blockLossMask = joint.index === 1 ? 1 - lossMask : 1;
      for (const segment of joint.segments) {
        if (bedCoordinate <= segment.minimumY || bedCoordinate >= segment.maximumY) continue;
        const t = (bedCoordinate - segment.minimumY) / (segment.maximumY - segment.minimumY);
        const firstHalf = t < 0.5;
        const localT = firstHalf ? t * 2 : (t - 0.5) * 2;
        const center = firstHalf
          ? lerp(segment.centerStart, segment.centerMiddle, localT)
          : lerp(segment.centerMiddle, segment.centerEnd, localT);
        const widthLeft = firstHalf
          ? lerp(segment.widthLeftStart, segment.widthLeftMiddle, localT)
          : lerp(segment.widthLeftMiddle, segment.widthLeftEnd, localT);
        const widthRight = firstHalf
          ? lerp(segment.widthRightStart, segment.widthRightMiddle, localT)
          : lerp(segment.widthRightMiddle, segment.widthRightEnd, localT);
        const width = normalizedX < center ? widthLeft : widthRight;
        const depth = firstHalf
          ? lerp(segment.depthStartMetres, segment.depthMiddleMetres, localT)
          : lerp(segment.depthMiddleMetres, segment.depthEndMetres, localT);
        const enters = smootherstep01(clamp((bedCoordinate - segment.minimumY) / segment.taperStart, 0, 1));
        const exits = smootherstep01(clamp((segment.maximumY - bedCoordinate) / segment.taperEnd, 0, 1));
        const jointDistance = (normalizedX - center) / width;
        const ordinaryRecession = Math.exp(-(jointDistance * jointDistance)) * enters * exits
          * depth * blockLossMask;
        jointRecession = Math.max(jointRecession, ordinaryRecession);
      }
      const chip = joint.chip;
      const chipDistance = ((normalizedX - chip.centerX) / chip.width) ** 4
        + ((bedCoordinate - chip.centerY) / chip.halfHeight) ** 4;
      const chipRecession = Math.exp(-chipDistance) * chip.depthMetres * blockLossMask;
      jointRecession = Math.max(jointRecession, chipRecession);
    }
    // The ordinary lower wall stays near the source sheet's broad 0.42-depth
    // face. The single bench and apron can project locally toward the admitted
    // side hull; the upper face is supplied by the hull itself rather than one
    // all-height sloped clip plane.
    const wallLimit = h[2] * (lerp(0.4, 0.44, hash01(seed, 3250)) - bedCoordinate * 0.03);
    const frontLimit = wallLimit
      + toeWeight * toeIrregularity * h[2] * 0.36
      + ledgeRelief + wallUndulation;
    // Jointing and block loss are subtractive upper-face events. A separate
    // profile-following cut limit makes them recede from the visible hull without
    // forcing the entire wall onto that limit. The positive offset keeps this
    // limit inactive away from the two joint sets and the one edge-open loss.
    const profileCutLimit = h[2] * (0.305 - bedCoordinate * 0.82) - jointRecession - blockLoss;
    result = Math.max(result, shaped[2] - frontLimit, shaped[2] - profileCutLimit);
  } else {
    let centralMass = facetedEllipsoid(
      translate(shaped, [-h[0] * 0.05, -h[1] * 0.03, -h[2] * 0.04]),
      [h[0] * 0.82, h[1] * 0.88, h[2] * 0.78],
      seed ^ 0x6a09e667,
      11,
      0.74,
      0.94,
    );
    centralMass = Math.max(centralMass, shaped[2] - h[2] * 0.61);
    const upperCap = facetedEllipsoid(
      translate(shaped, [h[0] * 0.1, h[1] * 0.54, -h[2] * 0.03]),
      [h[0] * 0.69, h[1] * 0.42, h[2] * 0.75],
      seed ^ 0xbb67ae85,
      8,
      0.77,
      0.95,
    );
    const basalButtress = facetedEllipsoid(
      translate(shaped, [
        h[0] * lerp(-0.06, 0.05, hash01(seed, 336)),
        -h[1] * 0.58,
        h[2] * lerp(-0.04, 0.04, hash01(seed, 337)),
      ]),
      [h[0] * 0.8, h[1] * 0.34, h[2] * 0.76],
      seed ^ 0x3c6ef372,
      9,
      0.76,
      0.94,
    );
    result = smoothMinimum(centralMass, upperCap, Math.min(...h) * 0.09);
    result = smoothMinimum(result, basalButtress, Math.min(...h) * 0.06);
  }
  result = Math.max(result, -rotated[1] - h[1] * 0.9);
  // Cross-bed traces remain a bake/semantic channel. The finite resistant
  // ledges above are the mesh-scale expression; a periodic volumetric groove
  // can sever tiny tips and falsely turn them into extra solid components.
  // Centimetre-scale granular relief belongs in the dense bake. Perturbing the
  // render-scale boolean throughout its volume creates closed sub-cell air
  // pockets at mass/ledge intersections, which are invalid extra components.
  if (form === 'sandstone-arch') {
    const openingCenterY = -h[1] * lerp(0.27, 0.33, hash01(seed, 333));
    for (const side of [-1, 1]) {
      const abutment = facetedEllipsoid(
        translate(rotated, [side * h[0] * 0.52, openingCenterY - h[1] * 0.03, -h[2] * 0.03]),
        [h[0] * 0.25, h[1] * 0.52, h[2] * 0.68],
        seed ^ (side < 0 ? 0xa54ff53a : 0x510e527f),
        7,
        0.78,
        0.95,
      );
      result = smoothMinimum(result, abutment, Math.min(...h) * 0.055);
    }
    const openingX = rotated[0] + (rotated[1] - openingCenterY) * 0.07
      + Math.sin((rotated[1] - openingCenterY) / Math.max(h[1], 1e-6) * Math.PI) * h[0] * 0.045;
    const openingA = signedDistanceEllipsoid(
      [openingX + h[0] * 0.07, rotated[1] - openingCenterY, rotated[2]],
      [h[0] * lerp(0.385, 0.415, hash01(seed, 334)), h[1] * lerp(0.39, 0.42, hash01(seed, 335)), h[2] * 1.2],
    );
    // A hard finite cutter preserves the exact through opening. Blending two
    // nearly coincident zero surfaces can leave a sub-cell solid crumb inside
    // the aperture for otherwise valid hero seeds.
    result = Math.max(result, -openingA);
  }
  return result;
}

function basaltField(point, dimensions, seed, form) {
  const h = dimensions.map((value) => value * 0.45);
  const radius = Math.min(dimensions[0], dimensions[2]) * lerp(0.108, 0.121, hash01(seed, 900));
  const spacingX = radius * lerp(1.5, 1.67, hash01(seed, 901));
  const spacingZ = radius * lerp(1.3, 1.48, hash01(seed, 902));
  const basalFlow = signedDistanceEllipsoid(
    translate(point, [0, -h[1] * 0.84, 0]),
    [h[0] * 1.22, h[1] * 0.38, h[2] * 1.22],
  );
  const basalConnector = signedDistanceRoundedBox(
    translate(point, [0, -h[1] * 0.83, 0]),
    [h[0] * 0.84, h[1] * 0.13, h[2] * 0.84],
    radius * 0.22,
  );
  let result = Math.min(basalFlow, basalConnector);
  let columnIndex = 0;
  for (let row = -3; row <= 3; row += 1) for (let column = -3; column <= 3; column += 1) {
    const x = column * spacingX + (Math.abs(row) % 2) * spacingX * 0.5
      + (hash01(seed, row, column, 9) - 0.5) * radius * 0.28;
    const z = row * spacingZ + (hash01(seed, row, column, 10) - 0.5) * radius * 0.25;
    const footprintWarp = 1 + Math.sin(row * 1.17 + hash01(seed, 903) * Math.PI * 2) * 0.08;
    const footprint = (x / (h[0] * 0.96 * footprintWarp)) ** 2 + (z / (h[2] * 0.96)) ** 2;
    // The outermost one-cell columns are too narrow to meet the basal flow at
    // lower mesh tiers. Keep the bounded proof inside a connected cooling face;
    // formation-edge breakaway belongs to the later domain/chunking stage.
    if (footprint > lerp(0.79, 0.89, hash01(seed, row, column, 904))) continue;
    const height = form === 'basalt-entablature'
      ? h[1] * (0.39 + hash01(seed, columnIndex, 11) * 0.11)
      : h[1] * (0.54 + hash01(seed, columnIndex, 11) * 0.42);
    const centerY = -h[1] * 0.8 + height;
    const local = translate(point, [x, centerY, z]);
    const columnRadius = radius * lerp(0.84, 1.13, hash01(seed, columnIndex, 12));
    const columnSdf = signedDistanceHexPrismY(local, columnRadius, height);
    result = Math.min(result, columnSdf);
    columnIndex += 1;
  }
  if (form === 'basalt-entablature') {
    // This buried cooling collar joins the ordered lower columns below the
    // visible entablature transition. It eliminates sub-cell zero pockets at
    // exact prism junctions without filling the exposed column gaps.
    const interiorCollar = signedDistanceRoundedBox(
      translate(point, [0, -h[1] * 0.46, 0]),
      [h[0] * 0.6, h[1] * 0.14, h[2] * 0.58],
      radius * 0.08,
    );
    result = smoothMinimum(result, interiorCollar, radius * 0.05);
    const capPoint = translate(point, [h[0] * 0.03, h[1] * 0.15, -h[2] * 0.03]);
    let entablature = facetedEllipsoid(
      capPoint,
      [h[0] * 0.91, h[1] * 0.69, h[2] * 0.91],
      seed ^ 0xa54ff53a,
      15,
      0.7,
      0.93,
    );
    // Preserve the band-like cooling zone while allowing a broken skyline and
    // irregular retreat at the sides. These planes are seed-varying cooling
    // fronts, not stratigraphic beds.
    entablature = Math.max(
      entablature,
      point[1] + point[0] * lerp(-0.05, 0.08, hash01(seed, 901)) - h[1] * 0.84,
    );
    // A central transition band guarantees that every chaotic cap mass remains
    // mechanically connected to the ordered colonnade at render resolutions.
    // Unequal intersecting prisms create the entablature skyline and oblique
    // cooling faces; unlike the previous large subtractive sockets they cannot
    // strand cap islands for unlucky seeds.
    const transitionCore = facetedEllipsoid(
      translate(point, [h[0] * 0.01, -h[1] * 0.02, -h[2] * 0.02]),
      [h[0] * 0.77, h[1] * 0.31, h[2] * 0.76],
      seed ^ 0x1f83d9ab,
      11,
      0.74,
      0.94,
    );
    entablature = smoothMinimum(entablature, transitionCore, radius * 0.12);
    for (let index = 0; index < 6; index += 1) {
      let shardPoint = translate(point, [
        lerp(-0.45, 0.45, hash01(seed, index, 905)) * h[0],
        lerp(0.13, 0.42, hash01(seed, index, 906)) * h[1],
        lerp(-0.43, 0.43, hash01(seed, index, 907)) * h[2],
      ]);
      shardPoint = rotateX(rotateZ(shardPoint, (hash01(seed, index, 908) - 0.5) * 0.5), (hash01(seed, index, 909) - 0.5) * 0.34);
      const shard = facetedEllipsoid(
        shardPoint,
        [h[0] * lerp(0.22, 0.38, hash01(seed, index, 910)), h[1] * lerp(0.24, 0.38, hash01(seed, index, 911)), h[2] * lerp(0.2, 0.36, hash01(seed, index, 912))],
        seed ^ Math.imul(index + 1, 0x27d4eb2d),
        6,
        0.74,
        0.94,
      );
      entablature = smoothMinimum(entablature, shard, radius * 0.08);
    }
    // Entablature is a disordered cooling-fracture domain, not a second set of
    // horizontal beds. Its connected macro mass is faceted here; the dense
    // bake field carries the smaller chaotic fracture network so it cannot
    // alias into detached one-cell fragments in the render mesh.
    result = Math.min(result, entablature);
  }
  const maximumDimension = Math.max(...dimensions);
  return form === 'basalt-entablature'
    ? result
    : result + Math.abs(surfaceNoise(seed, point, maximumDimension, maximumDimension * 0.00035));
}

function limestoneField(point, dimensions, seed, form) {
  const h = dimensions.map((value) => value * 0.45);
  let result;
  if (form === 'limestone-spire') {
    const mainPoint = translate(point, [
      h[0] * lerp(-0.14, -0.03, hash01(seed, 814)),
      -h[1] * 0.06,
      h[2] * lerp(-0.06, 0.06, hash01(seed, 815)),
    ]);
    const normalizedHeight = clamp((mainPoint[1] + h[1] * 0.84) / (h[1] * 1.68), 0, 1);
    const taperNoise = valueNoise3(seed, [0, mainPoint[1], 0], 2.1 / Math.max(dimensions[1], 1e-6), 811) * 0.07;
    const radiusX = h[0] * (lerp(0.51, 0.19, normalizedHeight) + taperNoise * 0.55);
    const radiusZ = h[2] * (lerp(0.54, 0.22, normalizedHeight) + taperNoise * 0.48);
    const radial = (Math.hypot(mainPoint[0] / radiusX, mainPoint[2] / radiusZ) - 1) * Math.min(radiusX, radiusZ);
    const vertical = Math.max(mainPoint[1] - h[1] * 0.84, -mainPoint[1] - h[1] * 0.84);
    let main = Math.max(radial, vertical);
    for (let index = 0; index < 7; index += 1) {
      const angle = hash01(seed, index, 812) * Math.PI * 2;
      const normal = [Math.cos(angle), Math.sin(angle)];
      const support = Math.hypot(normal[0] * radiusX, normal[1] * radiusZ);
      const plane = mainPoint[0] * normal[0] + mainPoint[2] * normal[1]
        - support * lerp(0.79, 0.94, hash01(seed, index, 813));
      main = Math.max(main, plane);
    }
    const baseLobe = facetedEllipsoid(
      translate(point, [h[0] * 0.03, -h[1] * 0.53, -h[2] * 0.04]),
      [h[0] * 0.49, h[1] * 0.19, h[2] * 0.52],
      seed ^ 0x510e527f,
      8,
      0.76,
      0.94,
    );
    const buttress = facetedEllipsoid(
      translate(point, [h[0] * lerp(0.26, 0.36, hash01(seed, 816)), -h[1] * lerp(0.27, 0.38, hash01(seed, 817)), -h[2] * lerp(0.1, 0.2, hash01(seed, 818))]),
      [h[0] * lerp(0.2, 0.28, hash01(seed, 819)), h[1] * lerp(0.37, 0.47, hash01(seed, 820)), h[2] * lerp(0.26, 0.34, hash01(seed, 821))],
      seed ^ 0x1f83d9ab,
      5,
    );
    result = smoothMinimum(main, baseLobe, Math.min(h[0], h[2]) * 0.045);
    result = smoothMinimum(result, buttress, Math.min(h[0], h[2]) * 0.038);
    result = Math.max(result, -point[1] - h[1] * 0.88);
    const angle = Math.atan2(point[2], point[0]);
    const runnels = Math.max(0, Math.cos(angle * 7 + Math.sin(point[1] * 0.38))) ** 8;
    result += runnels * dimensions[0] * 0.014;
  } else {
    let hostA = facetedEllipsoid(
      translate(point, [-h[0] * 0.1, -h[1] * 0.04, 0]),
      [h[0] * 0.88, h[1] * 0.86, h[2] * 0.88],
      seed ^ 0x6a09e667,
      12,
      0.72,
      0.94,
    );
    hostA = Math.max(hostA, point[2] - h[2] * 0.68);
    const hostB = facetedEllipsoid(
      translate(point, [h[0] * 0.38, -h[1] * 0.28, -h[2] * 0.11]),
      [h[0] * 0.5, h[1] * 0.59, h[2] * 0.64],
      seed ^ 0x510e527f,
      8,
      0.75,
      0.94,
    );
    result = smoothMinimum(hostA, hostB, Math.min(h[0], h[2]) * 0.08);
    result = Math.max(result, -point[1] - h[1] * 0.84);
    const openingCenterY = -h[1] * 0.27;
    // A karst cave is a finite dissolution void that breaches one face, not an
    // infinite arch/tunnel cutter. Keeping a back wall and a substantial roof
    // also avoids the detached ledges produced by the earlier through-cut.
    const openingPoint = translate(point, [-h[0] * 0.08, openingCenterY, h[2] * 0.82]);
    const opening = signedDistanceEllipsoid(openingPoint, [h[0] * 0.38, h[1] * 0.46, h[2] * 0.7]);
    result = Math.max(result, -opening);
  }
  const bed = point[1] + point[0] * 0.08;
  result += finiteGroove(bed, dimensions[1] * 0.31, dimensions[1] * 0.018) * dimensions[0] * 0.01;
  const maximumDimension = Math.max(...dimensions);
  return result + surfaceNoise(seed, point, maximumDimension, maximumDimension * 0.0038);
}

function fissileField(point, dimensions, seed, form) {
  const h = dimensions.map((value) => value * 0.45);
  const angle = form === 'slate-outcrop' ? -0.16 : 0.18;
  const local = rotateZ(point, angle + (hash01(seed, 17) - 0.5) * (form === 'slate-outcrop' ? 0.06 : 0.08));
  let result;
  if (form === 'shale-slope') {
    const mass = facetedEllipsoid(
      local,
      [h[0] * 0.96, h[1] * 0.86, h[2] * 0.92],
      seed ^ 0x6a09e667,
      11,
      0.74,
      0.95,
    );
    const slopePlane = local[1] + local[0] * 0.43 - h[1] * 0.22;
    result = Math.max(mass, slopePlane);
    result = Math.max(result, -local[1] - h[1] * 0.78);
    for (let index = 0; index < 13; index += 1) {
      const x = lerp(-h[0] * 0.72, h[0] * 0.68, hash01(seed, index, 170));
      const z = lerp(-h[2] * 0.72, h[2] * 0.72, hash01(seed, index, 171));
      const thickness = h[1] * lerp(0.018, 0.038, hash01(seed, index, 172));
      const y = h[1] * 0.2 - x * 0.43 - thickness * 0.42;
      let shardPoint = translate(local, [x, y, z]);
      shardPoint = rotateXZ(shardPoint, (hash01(seed, index, 173) - 0.5) * 0.55);
      const shard = signedDistanceRoundedBox(
        shardPoint,
        [h[0] * lerp(0.095, 0.18, hash01(seed, index, 174)), thickness, h[2] * lerp(0.09, 0.18, hash01(seed, index, 175))],
        thickness * 0.12,
      );
      result = Math.min(result, shard);
    }
    const basalApron = facetedEllipsoid(
      translate(point, [
        h[0] * lerp(-0.08, 0.06, hash01(seed, 176)),
        -h[1] * 0.74,
        h[2] * lerp(-0.04, 0.04, hash01(seed, 177)),
      ]),
      [h[0] * 0.91, h[1] * 0.18, h[2] * 0.88],
      seed ^ 0xa54ff53a,
      7,
      0.82,
      0.97,
    );
    result = smoothMinimum(result, basalApron, Math.min(...h) * 0.035);
  } else {
    result = Infinity;
    for (let index = 0; index < 4; index += 1) {
      let slabPoint = translate(local, [
        (index - 1.5) * h[0] * 0.27,
        (hash01(seed, index, 181) - 0.5) * h[1] * 0.2,
        (hash01(seed, index, 182) - 0.5) * h[2] * 0.16,
      ]);
      slabPoint = rotateZ(slabPoint, (index - 1.5) * lerp(0.035, 0.06, hash01(seed, index, 185)));
      const slab = signedDistanceRoundedBox(
        slabPoint,
        [h[0] * 0.28, h[1] * lerp(0.69, 0.86, hash01(seed, index, 183)), h[2] * lerp(0.68, 0.84, hash01(seed, index, 184))],
        Math.min(...h) * 0.028,
      );
      result = Math.min(result, slab);
    }
    const rootSlab = facetedEllipsoid(
      translate(local, [0, -h[1] * 0.67, 0]),
      [h[0] * 0.82, h[1] * 0.19, h[2] * 0.78],
      seed ^ 0xa54ff53a,
      7,
      0.78,
      0.96,
    );
    result = smoothMinimum(result, rootSlab, Math.min(...h) * 0.025);
    const interiorCore = facetedEllipsoid(
      local,
      [h[0] * 0.5, h[1] * 0.72, h[2] * 0.55],
      seed ^ 0x1f83d9ab,
      6,
      0.84,
      0.98,
    );
    result = smoothMinimum(result, interiorCore, Math.min(...h) * 0.022);
    result = Math.max(result, -local[1] - h[1] * 0.84);
  }
  // Both shale and slate are attached outcrops in this bounded proof. A world-
  // horizontal basal truncation preserves their inclined fabric while avoiding
  // the false cantilever produced when the rotated local frame defined contact.
  result = Math.max(result, -point[1] - h[1] * 0.86);
  // Dense cleavage and jagged chip relief are emitted by surface semantics and
  // the bake. Volumetric periodic perturbation here forms enclosed sub-cell
  // cavities inside intersecting slabs, so the macro field stays explicit.
  return Math.max(result, -point[1] - h[1] * 0.86);
}

function foliatedField(point, dimensions, seed, form) {
  const h = dimensions.map((value) => value * 0.45);
  const local = rotateZ(point, -0.21 + (hash01(seed, 23) - 0.5) * 0.14);
  let result;
  if (form === 'gneiss-outcrop') {
    // Gneiss remains a coherent joint-bounded mass, but broad folded domains
    // now affect its body and skyline rather than existing only as a semantic
    // band frequency. The three interlocking lobes share one warped fold frame.
    const foldPhase = hash01(seed, 251) * Math.PI * 2;
    const foldWarp = Math.sin(local[0] / Math.max(h[0], 1e-6) * Math.PI * lerp(0.8, 1.15, hash01(seed, 252)) + foldPhase) * h[1] * lerp(0.08, 0.15, hash01(seed, 253));
    const warped = [local[0], local[1] + foldWarp, local[2]];
    const core = signedDistanceRoundedBox(
      warped,
      [h[0] * 0.82, h[1] * lerp(0.72, 0.8, hash01(seed, 254)), h[2] * 0.8],
      Math.min(...h) * 0.105,
    );
    const shell = facetedEllipsoid(warped, [h[0], h[1] * 0.91, h[2]], seed, 10, 0.76, 0.95);
    result = Math.max(core, shell);
    for (let index = 0; index < 3; index += 1) {
      const lobe = facetedEllipsoid(
        translate(warped, [
          [-0.47, 0.04, 0.46][index] * h[0] + (hash01(seed, index, 255) - 0.5) * h[0] * 0.08,
          [-0.18, 0.28, -0.08][index] * h[1],
          (hash01(seed, index, 256) - 0.5) * h[2] * 0.18,
        ]),
        [h[0] * lerp(0.34, 0.48, hash01(seed, index, 257)), h[1] * lerp(0.32, 0.48, hash01(seed, index, 258)), h[2] * lerp(0.68, 0.84, hash01(seed, index, 259))],
        seed ^ Math.imul(index + 1, 0x9e3779b1),
        7,
        0.76,
        0.94,
      );
      result = smoothMinimum(result, lobe, Math.min(...h) * 0.045);
    }
    const attachedRoot = facetedEllipsoid(
      translate(point, [0, -h[1] * 0.69, 0]),
      [h[0] * 0.76, h[1] * 0.18, h[2] * 0.74],
      seed ^ 0xbb67ae85,
      7,
      0.78,
      0.96,
    );
    result = smoothMinimum(result, attachedRoot, Math.min(...h) * 0.035);
  } else {
    // Schist expresses mechanically weak foliation as an asymmetric fan of
    // overlapping platy masses. A basal root keeps the outcrop attached while
    // the broad planar breaks remain visible at C8 render resolution.
    result = Infinity;
    const fanDirection = hash01(seed, 260) < 0.5 ? -1 : 1;
    for (let index = 0; index < 5; index += 1) {
      let platePoint = translate(local, [
        fanDirection * (index - 2) * h[0] * 0.09,
        (index - 2) * h[1] * lerp(0.13, 0.17, hash01(seed, 261)),
        (hash01(seed, index, 262) - 0.5) * h[2] * 0.12,
      ]);
      platePoint = rotateZ(platePoint, fanDirection * (index - 2) * lerp(0.035, 0.065, hash01(seed, index, 263)));
      const plate = signedDistanceRoundedBox(
        platePoint,
        [h[0] * lerp(0.62, 0.78, hash01(seed, index, 264)), h[1] * lerp(0.14, 0.19, hash01(seed, index, 265)), h[2] * lerp(0.68, 0.84, hash01(seed, index, 266))],
        Math.min(...h) * 0.025,
      );
      result = smoothMinimum(result, plate, Math.min(...h) * 0.018);
    }
    const root = facetedEllipsoid(
      translate(local, [0, -h[1] * 0.61, 0]),
      [h[0] * 0.78, h[1] * 0.25, h[2] * 0.8],
      seed ^ 0x510e527f,
      7,
      0.78,
      0.95,
    );
    result = smoothMinimum(result, root, Math.min(...h) * 0.04);
  }
  result = Math.max(result, -local[1] - h[1] * 0.82);
  result = Math.max(result, -point[1] - h[1] * 0.84);
  const foldCoordinate = local[1] + Math.sin(local[0] / Math.max(dimensions[0], 1e-6) * Math.PI * 1.55) * dimensions[1] * 0.11;
  const frontWeight = smootherstep01(clamp((local[2] / Math.max(h[2], 1e-6) + 0.18) / 0.95, 0, 1));
  const bandLevels = form === 'gneiss-outcrop' ? [-0.42, 0.02, 0.47] : [-0.5, -0.16, 0.19, 0.52];
  for (let index = 0; index < bandLevels.length; index += 1) {
    const width = h[1] * lerp(0.025, 0.048, hash01(seed, index, 240));
    const groove = Math.exp(-((foldCoordinate - bandLevels[index] * h[1]) ** 2) / (width * width));
    result += groove * frontWeight * Math.min(...h) * (form === 'gneiss-outcrop' ? 0.014 : 0.011);
  }
  const maximumDimension = Math.max(...dimensions);
  const surfaced = result + surfaceNoise(seed, local, maximumDimension, maximumDimension * 0.008);
  return Math.max(surfaced, -point[1] - h[1] * 0.84);
}

function clastSet(dimensions, seed, angular) {
  const h = dimensions.map((value) => value * 0.45);
  const clasts = [];
  const clastCount = angular ? 48 : 42;
  for (let index = 0; index < clastCount; index += 1) {
    const face = index % 5;
    const pit = index % (angular ? 7 : 11) === 0;
    const supportFactor = pit ? 1.12 : lerp(0.64, 0.78, hash01(seed, index, 40));
    // These clasts are macro witnesses, not the dense pebble field reserved for
    // the bake. Their dimensions deliberately exceed a C8 production cell.
    const radius = Math.min(...dimensions) * (angular
      ? lerp(0.05, 0.105, hash01(seed, index, 41))
      : lerp(0.042, 0.086, hash01(seed, index, 41)));
    const center = [
      lerp(-h[0] * 0.54, h[0] * 0.54, hash01(seed, index, 42)),
      lerp(-h[1] * 0.54, h[1] * 0.54, hash01(seed, index, 43)),
      lerp(-h[2] * 0.54, h[2] * 0.54, hash01(seed, index, 44)),
    ];
    const semanticCenter = [...center];
    if (face === 0 || face === 2) {
      const support = h[2] * Math.sqrt(Math.max(0.05, 1 - (center[0] / h[0]) ** 2 - (center[1] / (h[1] * 0.9)) ** 2));
      center[2] = support * supportFactor * (face === 0 ? 1 : -1);
      semanticCenter[2] = support * (pit ? supportFactor : 0.91) * (face === 0 ? 1 : -1);
    } else if (face === 1 || face === 3) {
      const support = h[0] * Math.sqrt(Math.max(0.05, 1 - (center[2] / h[2]) ** 2 - (center[1] / (h[1] * 0.9)) ** 2));
      center[0] = support * supportFactor * (face === 1 ? 1 : -1);
      semanticCenter[0] = support * (pit ? supportFactor : 0.91) * (face === 1 ? 1 : -1);
    } else {
      const support = h[1] * 0.9 * Math.sqrt(Math.max(0.05, 1 - (center[0] / h[0]) ** 2 - (center[2] / h[2]) ** 2));
      center[1] = support * supportFactor;
      semanticCenter[1] = support * (pit ? supportFactor : 0.91);
    }
    clasts.push({ angular, center, radius, pit, rotation: (hash01(seed, index, 45) - 0.5) * Math.PI, semanticCenter });
  }
  return clasts;
}

function coarseClasticField(point, dimensions, seed, form, clasts) {
  const h = dimensions.map((value) => value * 0.45);
  const angular = form === 'volcanic-breccia-outcrop';
  const matrixMain = facetedEllipsoid(
    point,
    [h[0] * 0.92, h[1] * 0.83, h[2] * 0.9],
    seed,
    angular ? 17 : 9,
    angular ? 0.69 : 0.8,
    angular ? 0.91 : 0.96,
  );
  const matrixBlock = signedDistanceRoundedBox(
    translate(point, [h[0] * 0.02, -h[1] * 0.04, 0]),
    [h[0] * 0.82, h[1] * 0.72, h[2] * 0.8],
    Math.min(...h) * (angular ? 0.025 : 0.13),
  );
  let result = Math.max(matrixMain, matrixBlock);
  result = Math.max(result, -point[1] - h[1] * 0.84);
  for (const clast of clasts) {
    const local = translate(point, clast.center);
    let clastSdf;
    if (clast.angular) {
      let angularPoint = rotateXZ(local, clast.rotation);
      angularPoint = rotateZ(angularPoint, (hash01(seed, Math.round(clast.radius * 1000), 49) - 0.5) * 0.65);
      clastSdf = signedDistanceRoundedBox(
        angularPoint,
        [clast.radius * 1.3, clast.radius * 0.72, clast.radius * 0.94],
        clast.radius * 0.018,
      );
    } else {
      clastSdf = signedDistanceEllipsoid(local, [clast.radius * 1.24, clast.radius * 0.82, clast.radius]);
    }
    if (clast.pit) result = smoothMaximum(result, -clastSdf, clast.radius * 0.025);
    else if (clast.angular) result = Math.min(result, clastSdf);
    else result = smoothMinimum(result, clastSdf, clast.radius * 0.18);
  }
  const maximumDimension = Math.max(...dimensions);
  const matrixRetreat = surfaceNoise(seed, point, maximumDimension, maximumDimension * (form === 'conglomerate-outcrop' ? 0.0055 : 0.007));
  return result + matrixRetreat;
}

function transportedField(point, dimensions, seed, form, pieces) {
  const h = dimensions.map((value) => value * 0.45);
  if (form === 'river-boulder') {
    const local = rotateZ(rotateXZ(point, (hash01(seed, 47) - 0.5) * 0.28), (hash01(seed, 48) - 0.5) * 0.12);
    return facetedEllipsoid(local, [h[0], h[1], h[2]], seed, 7, 0.84, 0.96)
      + Math.abs(surfaceNoise(seed, local, Math.max(...dimensions), Math.max(...dimensions) * 0.011));
  }
  let result = Infinity;
  for (const piece of pieces) {
    let local = rotateXZ(translate(point, piece.center), piece.rotation);
    local = rotateZ(local, piece.tiltZ);
    local = rotateX(local, piece.tiltX);
    const pieceSdf = signedDistanceRoundedBox(local, piece.halfExtents, piece.radius);
    result = Math.min(result, pieceSdf);
  }
  return result + surfaceNoise(seed, point, Math.max(...dimensions), Math.max(...dimensions) * 0.003);
}

function talusPieces(dimensions, seed) {
  const h = dimensions.map((value) => value * 0.45);
  const pieces = [];
  const pieceCount = 17;
  const fanBias = lerp(-0.08, 0.08, hash01(seed, 70));
  for (let index = 0; index < pieceCount; index += 1) {
    const angle = index * 2.399963229728653 + hash01(seed, 0, 67) * Math.PI * 2;
    const radial = Math.sqrt((index + 0.45) / pieceCount);
    const width = dimensions[0] * lerp(0.038, 0.075, hash01(seed, index, 61));
    const depth = dimensions[2] * lerp(0.034, 0.068, hash01(seed, index, 62));
    const height = dimensions[1] * lerp(0.045, 0.095, hash01(seed, index, 63));
    const pileHeight = (1 - radial) * h[1] * 0.38;
    pieces.push({
      center: [
        Math.cos(angle) * h[0] * 0.84 * radial + fanBias * h[0] * radial,
        -h[1] + height + pileHeight,
        Math.sin(angle) * h[2] * 0.82 * radial,
      ],
      halfExtents: [width, height, depth],
      radius: Math.min(width, height, depth) * 0.13,
      rotation: angle + (hash01(seed, index, 66) - 0.5) * 0.5,
      tiltX: (hash01(seed, index, 68) - 0.5) * 0.38,
      tiltZ: (hash01(seed, index, 69) - 0.5) * 0.34,
    });
  }
  return pieces;
}

function featureVectorFor(familyId, variantId) {
  const vector = Object.fromEntries(FEATURE_ORDER.map((feature) => [feature, 0.08]));
  if (familyId === 'jointed-exfoliating-granite') vector.jointing = variantId === 'granite-tor' ? 0.96 : 0.86;
  else if (familyId === 'cross-bedded-sandstone') vector.bedding = 0.97;
  else if (familyId === 'columnar-entablature-basalt') vector.columns = 0.99;
  else if (familyId === 'bedded-karst-limestone') { vector.karst = 0.96; vector.bedding = 0.62; }
  else if (familyId === 'fissile-shale-slate') vector.fissility = 0.98;
  else if (familyId === 'folded-foliated-metamorphic') vector.foliation = 0.98;
  else if (familyId === 'coarse-clastic-conglomerate-breccia') vector.clasts = 0.99;
  else if (familyId === 'transported-river-talus') vector.transport = 0.98;
  return Object.freeze(vector);
}

export function createC8BasisField(fixture, processField, structuralProgram) {
  if (!fixture?.definition || !fixture?.variant || !fixture?.recipe) throw new TypeError('C8 basis field requires a compiled fixture record.');
  if (!processField || typeof processField.sample !== 'function') throw new TypeError('C8 basis field requires the matching approved C6 process field.');
  if (!structuralProgram?.frames?.formation) throw new TypeError('C8 basis field requires the matching approved C4 structural program.');
  const { definition, recipe, variant } = fixture;
  const seed = recipe.seed;
  const dimensions = recipe.targetDimensionsMetres;
  const clasts = definition.id === 'coarse-clastic-conglomerate-breccia'
    ? clastSet(dimensions, seed, variant.id === 'volcanic-breccia-outcrop')
    : null;
  const pieces = variant.id === 'talus-assembly' ? talusPieces(dimensions, seed) : null;
  const compiledMacro = variant.id === 'sandstone-cliff'
    ? compileCliffBeddedGrandCanyonMacro(dimensions, seed)
    : null;
  const sandstoneCliffSurface = variant.id === 'sandstone-cliff'
    ? buildSandstoneCliffSurfaceProgram(dimensions, seed)
    : null;
  const sandstoneCliffJointGeometry = variant.id === 'sandstone-cliff'
    ? buildSandstoneCliffJointGeometry(dimensions, seed, sandstoneCliffSurface)
    : null;
  const macroProgramContentId = compiledMacro ? contentId({
    compilerVersion: 1,
    compiledMacro,
    seed,
    targetDimensionsMetres: dimensions,
    templateByteSha256: CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256,
    templateContentId: CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID,
  }) : null;
  const features = featureVectorFor(definition.id, variant.id);

  function evaluate(x, y, z) {
    const point = worldToMorphologyFrame(recipe, [x, y, z]);
    if (definition.id === 'jointed-exfoliating-granite') return graniteField(point, dimensions, seed, variant.id);
    if (definition.id === 'cross-bedded-sandstone') {
      return sandstoneField(point, dimensions, seed, variant.id, compiledMacro, sandstoneCliffJointGeometry);
    }
    if (definition.id === 'columnar-entablature-basalt') return basaltField(point, dimensions, seed, variant.id);
    if (definition.id === 'bedded-karst-limestone') return limestoneField(point, dimensions, seed, variant.id);
    if (definition.id === 'fissile-shale-slate') return fissileField(point, dimensions, seed, variant.id);
    if (definition.id === 'folded-foliated-metamorphic') return foliatedField(point, dimensions, seed, variant.id);
    if (definition.id === 'coarse-clastic-conglomerate-breccia') return coarseClasticField(point, dimensions, seed, variant.id, clasts);
    return transportedField(point, dimensions, seed, variant.id, pieces);
  }

  function sample(point) {
    const base = processField.sample(point);
    return {
      ...base,
      damageNormalized: clamp(base.damageNormalized * 0.58 + Math.max(...Object.values(features)) * 0.22, 0, 1),
      environment: {
        ...base.environment,
        fabricWeakness: clamp(Math.max(base.environment.fabricWeakness ?? 0, features.bedding, features.fissility, features.foliation) * 0.82, 0, 1),
        fractureInfluence: clamp(Math.max(base.environment.fractureInfluence ?? 0, features.jointing, features.columns, features.karst) * 0.78, 0, 1),
        materialWeakness: clamp(Math.max(base.environment.materialWeakness ?? 0, features.clasts * 0.68, features.transport * 0.22), 0, 1),
      },
      signedDistanceMetres: evaluate(...point),
    };
  }

  function surfaceSemantics(worldPoint) {
    const point = worldToMorphologyFrame(recipe, worldPoint);
    const scale = Math.max(...dimensions);
    const warpedY = point[1] + valueNoise3(seed, point, 1.8 / scale, 880) * scale * 0.035;
    const result = {
      bedding: 0,
      clast: 0,
      clastEdge: 0,
      cleavage: 0,
      coolingFracture: 0,
      foliation: 0,
      joint: 0,
    };
    if (definition.id === 'jointed-exfoliating-granite') {
      const jointX = finiteGroove(point[0] + point[2] * 0.12, scale * 0.31, scale * 0.014);
      const jointY = finiteGroove(point[1] - point[0] * 0.06, scale * 0.37, scale * 0.016);
      result.joint = Math.max(jointX, jointY) * 0.82;
    } else if (definition.id === 'cross-bedded-sandstone') {
      if (sandstoneCliffSurface) Object.assign(result, sandstoneCliffSurface.sample(point));
      else {
        const foreset = (warpedY + point[0] * 0.31 + point[2] * 0.07) / (scale * 0.055);
        result.bedding = Math.sin(foreset * Math.PI * 2) * 0.5 + 0.5;
      }
    } else if (definition.id === 'columnar-entablature-basalt') {
      const diagonalA = finiteGroove(point[0] + point[1] * 0.57, scale * 0.16, scale * 0.014);
      const diagonalB = finiteGroove(point[2] - point[1] * 0.41, scale * 0.19, scale * 0.015);
      const broken = clamp(valueNoise3(seed ^ 0x3c6ef372, point, 5.2 / scale, 881) * 0.5 + 0.5, 0, 1);
      result.coolingFracture = Math.max(diagonalA * broken, diagonalB * (1 - broken * 0.35));
    } else if (definition.id === 'bedded-karst-limestone') {
      result.bedding = Math.sin((warpedY + point[0] * 0.08) / (scale * 0.105) * Math.PI * 2) * 0.5 + 0.5;
    } else if (definition.id === 'fissile-shale-slate') {
      const direction = variant.id === 'slate-outcrop' ? point[1] + point[0] * 0.38 : point[1] + point[0] * 0.12;
      const warpedDirection = direction + valueNoise3(seed, point, 3.1 / scale, 882) * scale * 0.024;
      const intermittent = clamp(valueNoise3(seed ^ 0x510e527f, point, 1.7 / scale, 884) * 0.65 + 0.62, 0, 1);
      result.cleavage = finiteGroove(warpedDirection, scale * 0.047, scale * 0.0065) * intermittent;
    } else if (definition.id === 'folded-foliated-metamorphic') {
      const fold = point[1] + Math.sin(point[0] / scale * Math.PI * 2.2) * scale * 0.095
        + valueNoise3(seed, point, 2.3 / scale, 883) * scale * 0.02;
      const wave = Math.sin(fold / (scale * (variant.id === 'gneiss-outcrop' ? 0.095 : 0.058)) * Math.PI * 2);
      const continuity = clamp(valueNoise3(seed ^ 0x9b05688c, point, 1.35 / scale, 885) * 0.45 + 0.62, 0.12, 1);
      const contrast = variant.id === 'gneiss-outcrop' ? 0.32 : 0.13;
      result.foliation = clamp(0.5 + wave * contrast * continuity, 0, 1);
    } else if (definition.id === 'coarse-clastic-conglomerate-breccia') {
      for (const clast of clasts) {
        const local = translate(point, clast.semanticCenter);
        const sdf = clast.angular
          ? signedDistanceRoundedBox(rotateXZ(local, clast.rotation), [clast.radius * 1.18, clast.radius * 0.74, clast.radius], clast.radius * 0.06)
          : signedDistanceEllipsoid(local, [clast.radius * 1.24, clast.radius * 0.78, clast.radius]);
        const membership = smootherstep01(clamp(0.5 - sdf / Math.max(clast.radius * 0.45, 1e-6), 0, 1));
        const edge = Math.exp(-((sdf / Math.max(clast.radius * 0.16, 1e-6)) ** 2));
        result.clast = Math.max(result.clast, clast.pit ? 0 : membership);
        result.clastEdge = Math.max(result.clastEdge, edge);
      }
    }
    return result;
  }

  const descriptor = Object.freeze({
    expectedComponentRange: variant.id === 'talus-assembly' ? [6, 17] : [1, 1],
    familyId: definition.id,
    featureOrder: FEATURE_ORDER,
    features,
    fieldContentId: contentId({
      familyId: definition.id,
      jointGeometryContentId: sandstoneCliffJointGeometry?.contentId ?? null,
      macroProgramContentId,
      macroTemplateContentId: compiledMacro ? CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID : null,
      recipeId: recipe.id,
      seed,
      surfaceProgramVersion: compiledMacro ? C8_SANDSTONE_CLIFF_SURFACE_VERSION : null,
      variantId: variant.id,
      version: C8_BASIS_FIELD_VERSION,
    }),
    jointGeometry: sandstoneCliffJointGeometry,
    macroTemplate: variant.id === 'sandstone-cliff' ? Object.freeze({
      auditSha256: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.auditSha256,
      calibrationMode: CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.calibrationMode,
      byteSha256: CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256,
      claimsExactSourceReconstruction: CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.claimsExactSourceReconstruction,
      commonMetricCalibrationAvailable: CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.commonMetricCalibrationAvailable,
      contentId: CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID,
      credit: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.credit,
      generatedViewsAreGeologyEvidence: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.generatedViewsAreGeologyEvidence,
      id: CLIFF_BEDDED_GRAND_CANYON_R1.id,
      macroProgramContentId,
      profileVersion: CLIFF_BEDDED_GRAND_CANYON_R1.version,
      promptSha256: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.promptSha256,
      license: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.license,
      rights: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.rights,
      safeClaim: CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.safeClaim,
      selectedPhysicalDimensionsMetres: CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.selectedPhysicalDimensionsMetres,
      sourceImageSha256: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sourceImageSha256,
      sourceJsonSha256: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sourceJsonSha256,
      sourcePageUrl: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sourcePageUrl,
      surfaceProgramVersion: C8_SANDSTONE_CLIFF_SURFACE_VERSION,
      sixViewSha256: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sixViewSha256,
      viewOrder: CLIFF_BEDDED_GRAND_CANYON_R1.evidence.viewOrder,
    }) : null,
    variantId: variant.id,
    version: C8_BASIS_FIELD_VERSION,
  });
  return Object.freeze({ descriptor, evaluate, processField, sample, surfaceSemantics });
}

export function c8FeatureOrder() {
  return FEATURE_ORDER;
}
