#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { inflateSync } from 'node:zlib';

import { contentId } from '../src/rockgen/experimental/geology-v2/canonical.node.js';
import { loadGeologyCatalog } from '../src/rockgen/experimental/geology-v2/catalog.node.js';
import { compileC8BasisStages, meshC8BasisFixture } from '../src/rockgen/experimental/geology-v2/basis/compiler.node.js';
import {
  createC8BasisFixtures,
  scaleC8BasisFixture,
} from '../src/rockgen/experimental/geology-v2/basis/fixtures.node.js';
import {
  CLIFF_BEDDED_GRAND_CANYON_R1,
  CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256,
  CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID,
  compileCliffBeddedGrandCanyonMacro,
  evaluateReferenceVisualHull,
  signedDistanceReferencePolygon2D,
  validateReferencePolygon,
} from '../src/rockgen/experimental/geology-v2/basis/referenceProfile.node.js';
import { extractManifoldDualContouring } from '../src/rockgen/experimental/geology-v2/meshing/manifoldDualContouring.node.js';
import { sampleScalarField } from '../src/rockgen/experimental/geology-v2/meshing/scalarGrid.node.js';
import { auditMeshTopology } from '../src/rockgen/experimental/geology-v2/meshing/topologyAudit.node.js';
import { hash01 } from '../src/rockgen/experimental/geology-v2/structure/math.node.js';

const EXPECTED_PROFILE_BYTE_SHA256 = 'a0efc5023d78520a7c1bb888581d72f8b7117af54f309386c0110bd4dd9f6424';
const EXPECTED_PROFILE_CONTENT_ID = 'sha256:060fa27beb21e2d4232f6ec25c630fbb6bb8e47798c4d1b6eb33500bee2023b2';
const V9_HERO_FIELD_CONTENT_ID = 'sha256:08d4d66d0e04ebac50c4e84a554fb2ce527dd17ee80c28bb2e1b90498f57bd44';
const V9_HERO_MESH_CONTENT_ID = 'sha256:fd0b4d021effaf013be61154f4b5e70870d84460afd8a996e76f33106db3deb7';
const V10_HERO_FIELD_CONTENT_ID = 'sha256:f5deb16d2b9f0af52e3de32d6bf9ce89053e312bbfa9d3817de3682d9a0cf146';
const V10_HERO_MESH_CONTENT_ID = 'sha256:f01325448edcac0a0a330365aeea2a8b009a692d3db7db4e10411040be5142a8';
const V10_HERO_JOINT_CONTENT_ID = 'sha256:ae36ed38706da885b665fd518f286936a56742c7b1bfc1374290ec899a12ab0f';
// These witnesses were captured from v10 outside both joint support zones.
// V10 changed only joint geometry, so they are the inherited v9 macro values.
const V9_MACRO_PARITY = Object.freeze({
  benchAboveFrontMetres: 1.0570807781791314,
  benchBelowFrontMetres: 1.304621306645312,
  benchFrontMetres: 1.3122279838422315,
  centralCrestYMetres: 1.271710032118361,
  centralSupportYMetres: -3.8069999999838844,
  toeFrontMetres: 1.546265701934137,
  upperFrontMetres: -0.8715616550417615,
});
const V10_HERO_BOUNDS = Object.freeze({
  max: Object.freeze([3.994692902160757, 3.298211424781282, 4.463256261344486]),
  min: Object.freeze([-4.0820148262077165, -3.8070000000000124, -4.122041146052631]),
});
const PROFILE_PATH = path.resolve('src/rockgen/experimental/geology-v2/basis/reference-profiles/cliff-bedded-grand-canyon-r1.json');
const EVIDENCE_DIRECTORY = path.resolve('artifacts/research/rock-geology-v2/checkpoint-08-basis-families/morphology/reference-final/cliffs/cliff-bedded');

const failures = [];
let checks = 0;
function check(condition, code, details = {}) {
  checks += 1;
  if (!condition) failures.push({ code, details });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodeRgb8Png(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new TypeError('Expected a PNG evidence sheet.');
  let offset = 8;
  let width;
  let height;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 2 || data[12] !== 0) throw new TypeError('Evidence sheet must remain non-interlaced RGB8 PNG.');
    } else if (type === 'IDAT') idat.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const pixels = Buffer.alloc(width * height * 3);
  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[read++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[read++];
      const left = x >= 3 ? row[x - 3] : 0;
      const up = prior ? prior[x] : 0;
      const upperLeft = prior && x >= 3 ? prior[x - 3] : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 255;
      else if (filter === 2) row[x] = (raw + up) & 255;
      else if (filter === 3) row[x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (raw + paethPredictor(left, up, upperLeft)) & 255;
      else throw new RangeError(`Unsupported PNG row filter ${filter}.`);
    }
  }
  return { height, pixels, width };
}

function panelMask(sheet, panel, maskContract) {
  const [cropX, cropY, width, height] = panel.cropPixels;
  const border = maskContract.borderIgnorePixels;
  const mask = Buffer.alloc(width * height);
  let foregroundPixels = 0;
  let write = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const source = ((cropY + y) * sheet.width + cropX + x) * 3;
    const luminance = Math.floor((54 * sheet.pixels[source] + 183 * sheet.pixels[source + 1] + 19 * sheet.pixels[source + 2]) / 256);
    const foreground = x >= border && x < width - border && y >= border && y < height - border
      && luminance <= maskContract.lumaThreshold8Bit;
    mask[write++] = foreground ? 1 : 0;
    if (foreground) foregroundPixels += 1;
  }
  return { foregroundPixels, sha256: sha256(mask) };
}

function cliffFrontDepthProbe(fixture, field) {
  const dimensionsMetres = fixture.recipe.targetDimensionsMetres;
  const halfExtents = dimensionsMetres.map((value) => value * 0.45);
  const seedValue = fixture.recipe.seed;
  function shapedToWorld(shaped) {
    const rotation = (hash01(seedValue, 5) - 0.5) * 0.12;
    const lateralWander = Math.sin(
      shaped[1] / halfExtents[1] * Math.PI * 1.4 + hash01(seedValue, 320) * 4,
    ) * halfExtents[0] * 0.045;
    const rotated = [shaped[0] + lateralWander, shaped[1], shaped[2]];
    const cosine = Math.cos(-rotation);
    const sine = Math.sin(-rotation);
    const morphology = [
      rotated[0] * cosine - rotated[2] * sine,
      rotated[1],
      rotated[0] * sine + rotated[2] * cosine,
    ];
    const strikeRadians = fixture.recipe.geologyTransform.strikeDegrees * Math.PI / 180;
    const strike = [Math.sin(strikeRadians), 0, Math.cos(strikeRadians)];
    const acrossStrike = [Math.cos(strikeRadians), 0, -Math.sin(strikeRadians)];
    const origin = fixture.recipe.geologyTransform.originMetres;
    return [
      origin[0] + morphology[0] * strike[0] + morphology[2] * acrossStrike[0],
      origin[1] + morphology[1],
      origin[2] + morphology[0] * strike[2] + morphology[2] * acrossStrike[2],
    ];
  }
  function frontDepth(normalizedX, normalizedY) {
    const shapedX = normalizedX * halfExtents[0];
    const shapedY = normalizedY * halfExtents[1];
    const minimumZ = -halfExtents[2] * 1.3;
    const maximumZ = halfExtents[2] * 1.3;
    const steps = 192;
    let outsideZ = maximumZ;
    let outsideValue = field.evaluate(...shapedToWorld([shapedX, shapedY, outsideZ]));
    for (let step = 1; step <= steps; step += 1) {
      const z = maximumZ - (maximumZ - minimumZ) * step / steps;
      const value = field.evaluate(...shapedToWorld([shapedX, shapedY, z]));
      if (outsideValue > 0 && value <= 0) {
        let insideZ = z;
        let bracketOutsideZ = outsideZ;
        for (let iteration = 0; iteration < 30; iteration += 1) {
          const midpoint = (insideZ + bracketOutsideZ) * 0.5;
          if (field.evaluate(...shapedToWorld([shapedX, shapedY, midpoint])) <= 0) insideZ = midpoint;
          else bracketOutsideZ = midpoint;
        }
        return (insideZ + bracketOutsideZ) * 0.5;
      }
      outsideZ = z;
      outsideValue = value;
    }
    return null;
  }
  function verticalBoundary(normalizedX, normalizedZ, fromTop) {
    const shapedX = normalizedX * halfExtents[0];
    const shapedZ = normalizedZ * halfExtents[2];
    const minimumY = -halfExtents[1] * 1.3;
    const maximumY = halfExtents[1] * 1.3;
    const steps = 220;
    let outsideY = fromTop ? maximumY : minimumY;
    let outsideValue = field.evaluate(...shapedToWorld([shapedX, outsideY, shapedZ]));
    for (let step = 1; step <= steps; step += 1) {
      const y = fromTop
        ? maximumY - (maximumY - minimumY) * step / steps
        : minimumY + (maximumY - minimumY) * step / steps;
      const value = field.evaluate(...shapedToWorld([shapedX, y, shapedZ]));
      if (outsideValue > 0 && value <= 0) {
        let insideY = y;
        let bracketOutsideY = outsideY;
        for (let iteration = 0; iteration < 30; iteration += 1) {
          const midpoint = (insideY + bracketOutsideY) * 0.5;
          if (field.evaluate(...shapedToWorld([shapedX, midpoint, shapedZ])) <= 0) insideY = midpoint;
          else bracketOutsideY = midpoint;
        }
        return (insideY + bracketOutsideY) * 0.5;
      }
      outsideY = y;
      outsideValue = value;
    }
    return null;
  }
  function segmentPoint(segment, t) {
    const firstHalf = t < 0.5;
    const localT = firstHalf ? t * 2 : (t - 0.5) * 2;
    return {
      normalizedX: firstHalf
        ? segment.centerStart + (segment.centerMiddle - segment.centerStart) * localT
        : segment.centerMiddle + (segment.centerEnd - segment.centerMiddle) * localT,
      normalizedY: segment.minimumY + (segment.maximumY - segment.minimumY) * t,
      widthNormalized: firstHalf
        ? segment.widthStart + (segment.widthMiddle - segment.widthStart) * localT
        : segment.widthMiddle + (segment.widthEnd - segment.widthMiddle) * localT,
    };
  }
  function measureRecession(normalizedX, normalizedY, widthNormalized, oneSided = false) {
    const left = frontDepth(normalizedX - widthNormalized * 3.5, normalizedY);
    const center = frontDepth(normalizedX, normalizedY);
    const right = frontDepth(normalizedX + widthNormalized * 3.5, normalizedY);
    if (![left, center, ...(oneSided ? [] : [right])].every(Number.isFinite)) return null;
    const baseline = oneSided ? left : (left + right) * 0.5;
    const recessionMetres = Math.max(0, baseline - center);
    const threshold = Math.max(recessionMetres * 0.28, 0.008);
    const activeX = [];
    const firstIndex = 0;
    const lastIndex = oneSided ? 16 : 32;
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      const sampleX = normalizedX + widthNormalized * (-4 + index * 0.25);
      const sampleDepth = frontDepth(sampleX, normalizedY);
      if (Number.isFinite(sampleDepth) && baseline - sampleDepth >= threshold) activeX.push(sampleX);
    }
    return {
      baselineDepthMetres: baseline,
      centerDepthMetres: center,
      recessionMetres,
      widthMetres: activeX.length >= 2
        ? (activeX.at(-1) - activeX[0]) * halfExtents[0] * (oneSided ? 2 : 1)
        : 0,
    };
  }

  const joints = field.descriptor.jointGeometry.joints.map((joint) => {
    const activeSegments = joint.segments.map((segment) => {
      const point = segmentPoint(segment, 0.5);
      return {
        ...point,
        ...measureRecession(point.normalizedX, point.normalizedY, point.widthNormalized, joint.index === 1),
      };
    });
    const gaps = [];
    for (let index = 0; index + 1 < joint.segments.length; index += 1) {
      const lower = joint.segments[index];
      const upper = joint.segments[index + 1];
      const normalizedX = (lower.centerEnd + upper.centerStart) * 0.5;
      const normalizedY = (lower.maximumY + upper.minimumY) * 0.5;
      const widthNormalized = (lower.widthEnd + upper.widthStart) * 0.5;
      gaps.push({
        normalizedX,
        normalizedY,
        ...measureRecession(normalizedX, normalizedY, widthNormalized, joint.index === 1),
      });
    }
    const chipDepth = frontDepth(joint.chip.centerX, joint.chip.centerY);
    const chipSemantics = Number.isFinite(chipDepth)
      ? field.surfaceSemantics(shapedToWorld([
        joint.chip.centerX * halfExtents[0],
        joint.chip.centerY * halfExtents[1],
        chipDepth,
      ]))
      : null;
    return {
      activeSegments,
      chipNearestBedContactMetres: chipSemantics?.nearestContactDistanceMetres ?? null,
      gaps,
      index: joint.index,
    };
  });

  const rightJoint = field.descriptor.jointGeometry.joints[1];
  const lossMinimumY = 0.21 + (0.29 - 0.21) * hash01(seedValue, 3231);
  const lossMaximumY = lossMinimumY + 0.2 + (0.29 - 0.2) * hash01(seedValue, 3233);
  const lossBedCoordinate = (lossMinimumY + lossMaximumY) * 0.5;
  const bedDip = -0.045 + (0.065 + 0.045) * hash01(seedValue, 3210);
  const lossInnerX = rightJoint.centerX + 0.035 + (0.09 - 0.035) * hash01(seedValue, 3230)
    + Math.sin(lossBedCoordinate * Math.PI * 2.3 + hash01(seedValue, 3232) * Math.PI) * 0.035;
  const lossDepthAt = (normalizedX) => frontDepth(normalizedX, lossBedCoordinate - normalizedX * bedDip);
  const inboardDepthMetres = lossDepthAt(lossInnerX - 0.16);
  const boundaryDepthMetres = lossDepthAt(lossInnerX);
  const outboardSamples = [0.05, 0.1, 0.15, 0.2, 0.24]
    .map((offset) => ({ depthMetres: lossDepthAt(lossInnerX + offset), offset }))
    .filter((sample) => Number.isFinite(sample.depthMetres));
  const benchCenterX = -0.24 + (-0.08 + 0.24) * hash01(seedValue, 3213);
  const benchLevel = -0.25 + (hash01(seedValue, 3211) - 0.5) * 0.055;
  const benchY = benchLevel - benchCenterX * bedDip;
  return {
    joints,
    loss: {
      boundaryDepthMetres,
      inboardDepthMetres,
      lossBedCoordinate,
      lossInnerX,
      outboardSamples,
      maximumRetreatMetres: outboardSamples.length && Number.isFinite(inboardDepthMetres)
        ? Math.max(...outboardSamples.map((sample) => inboardDepthMetres - sample.depthMetres))
        : null,
    },
    macroParity: {
      benchAboveFrontMetres: frontDepth(benchCenterX, benchY + 0.11),
      benchBelowFrontMetres: frontDepth(benchCenterX, benchY - 0.11),
      benchFrontMetres: frontDepth(benchCenterX, benchY),
      centralCrestYMetres: verticalBoundary(0, 0, true),
      centralSupportYMetres: verticalBoundary(0, 0, false),
      toeFrontMetres: frontDepth(-0.55, -0.58),
      upperFrontMetres: frontDepth(0, 0.7),
    },
  };
}

function worldToShaped(fixture, worldPoint) {
  const dimensionsMetres = fixture.recipe.targetDimensionsMetres;
  const halfExtents = dimensionsMetres.map((value) => value * 0.45);
  const origin = fixture.recipe.geologyTransform.originMetres;
  const relative = worldPoint.map((value, axis) => value - origin[axis]);
  const strikeRadians = fixture.recipe.geologyTransform.strikeDegrees * Math.PI / 180;
  const strike = [Math.sin(strikeRadians), 0, Math.cos(strikeRadians)];
  const acrossStrike = [Math.cos(strikeRadians), 0, -Math.sin(strikeRadians)];
  const morphology = [
    relative[0] * strike[0] + relative[2] * strike[2],
    relative[1],
    relative[0] * acrossStrike[0] + relative[2] * acrossStrike[2],
  ];
  const rotation = (hash01(fixture.recipe.seed, 5) - 0.5) * 0.12;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const rotated = [
    morphology[0] * cosine - morphology[2] * sine,
    morphology[1],
    morphology[0] * sine + morphology[2] * cosine,
  ];
  const lateralWander = Math.sin(
    rotated[1] / halfExtents[1] * Math.PI * 1.4 + hash01(fixture.recipe.seed, 320) * 4,
  ) * halfExtents[0] * 0.045;
  return [rotated[0] - lateralWander, rotated[1], rotated[2]];
}

function checkJointEndpointAnchors(fixture, descriptor, label) {
  const thresholdMetres = Math.max(...fixture.recipe.targetDimensionsMetres) * (0.11 / 10.5);
  const contacts = descriptor.jointGeometry.bedContacts;
  for (const joint of descriptor.jointGeometry.joints) for (const [segmentIndex, segment] of joint.segments.entries()) {
    for (const endpoint of ['minimum', 'maximum']) {
      const levelMetres = segment[`${endpoint}Y`] * fixture.recipe.targetDimensionsMetres[1] * 0.45;
      const nearest = contacts.reduce((best, contact) => (
        Math.abs(contact.levelMetres - levelMetres) < Math.abs(best.levelMetres - levelMetres) ? contact : best
      ));
      const distanceMetres = Math.abs(nearest.levelMetres - levelMetres);
      check(distanceMetres <= thresholdMetres, 'JOINT_ENDPOINT_MISSES_BED_CONTACT', {
        distanceMetres,
        endpoint,
        joint: joint.index,
        label,
        nearestContactIndex: nearest.index,
        segmentIndex,
        thresholdMetres,
      });
      check(nearest.index === segment[`${endpoint}ContactIndex`], 'JOINT_ENDPOINT_CONTACT_INDEX_DRIFT', {
        endpoint,
        joint: joint.index,
        label,
        nearestContactIndex: nearest.index,
        recordedContactIndex: segment[`${endpoint}ContactIndex`],
        segmentIndex,
      });
    }
  }
}

const profileBytes = await readFile(PROFILE_PATH);
check(sha256(profileBytes) === EXPECTED_PROFILE_BYTE_SHA256, 'PROFILE_BYTE_HASH_DRIFT', { actual: sha256(profileBytes), expected: EXPECTED_PROFILE_BYTE_SHA256 });
check(CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256 === EXPECTED_PROFILE_BYTE_SHA256, 'MODULE_BYTE_HASH_MISMATCH');
check(CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID === EXPECTED_PROFILE_CONTENT_ID, 'PROFILE_CONTENT_ID_DRIFT', { actual: CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID, expected: EXPECTED_PROFILE_CONTENT_ID });

const byteMutation = Buffer.from(profileBytes);
byteMutation[byteMutation.length - 2] ^= 1;
check(sha256(byteMutation) !== EXPECTED_PROFILE_BYTE_SHA256, 'BYTE_MUTATION_NOT_DETECTED');
const semanticMutation = structuredClone(CLIFF_BEDDED_GRAND_CANYON_R1);
semanticMutation.profiles.frontXY[1][0] += 0.001;
check(contentId(semanticMutation) !== CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID, 'SEMANTIC_MUTATION_NOT_DETECTED');
check(CLIFF_BEDDED_GRAND_CANYON_R1.evidence.generatedViewsAreGeologyEvidence === false, 'HIDDEN_VIEWS_MISREPRESENTED');
check(JSON.stringify(CLIFF_BEDDED_GRAND_CANYON_R1.evidence.viewOrder) === JSON.stringify(['front', 'rear', 'left', 'right', 'top', 'bottom-support']), 'VIEW_ORDER_DRIFT');
check(CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.calibrationMode === 'per-view-shape-normalized-authored-hypothesis', 'CALIBRATION_MODE_MISREPRESENTED');
check(CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.commonMetricCalibrationAvailable === false, 'FALSE_COMMON_METRIC_CLAIM');
check(CLIFF_BEDDED_GRAND_CANYON_R1.authorityContract.claimsExactSourceReconstruction === false, 'FALSE_EXACT_RECONSTRUCTION_CLAIM');

for (const [filename, expected] of [
  ['source-image.jpg', CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sourceImageSha256],
  ['source.json', CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sourceJsonSha256],
  ['six-view.png', CLIFF_BEDDED_GRAND_CANYON_R1.evidence.sixViewSha256],
  ['prompt.txt', CLIFF_BEDDED_GRAND_CANYON_R1.evidence.promptSha256],
  ['audit.json', CLIFF_BEDDED_GRAND_CANYON_R1.evidence.auditSha256],
]) {
  const actual = sha256(await readFile(path.join(EVIDENCE_DIRECTORY, filename)));
  check(actual === expected, 'EVIDENCE_HASH_MISMATCH', { actual, expected, filename });
}

const sheet = decodeRgb8Png(await readFile(path.join(EVIDENCE_DIRECTORY, 'six-view.png')));
check(JSON.stringify([sheet.width, sheet.height]) === JSON.stringify(CLIFF_BEDDED_GRAND_CANYON_R1.panelEvidence.sheetDimensionsPixels), 'SHEET_DIMENSIONS_DRIFT');
for (const panelId of CLIFF_BEDDED_GRAND_CANYON_R1.evidence.viewOrder) {
  const panel = CLIFF_BEDDED_GRAND_CANYON_R1.panelEvidence.panels[panelId];
  const measured = panelMask(sheet, panel, CLIFF_BEDDED_GRAND_CANYON_R1.panelEvidence.maskDerivation);
  check(measured.sha256 === panel.foregroundMaskSha256, 'PANEL_MASK_HASH_MISMATCH', { actual: measured.sha256, expected: panel.foregroundMaskSha256, panelId });
  check(measured.foregroundPixels === panel.foregroundPixels, 'PANEL_MASK_POPULATION_MISMATCH', { actual: measured.foregroundPixels, expected: panel.foregroundPixels, panelId });
}
for (const id of ['frontXY', 'sideZY', 'topXZ', 'bottomSupportXZ']) {
  const binding = CLIFF_BEDDED_GRAND_CANYON_R1.viewBindings[id];
  check(binding.pixelLandmarks.length === CLIFF_BEDDED_GRAND_CANYON_R1.profiles[id].length, 'PIXEL_LANDMARK_COUNT_MISMATCH', { id });
  check(Boolean(CLIFF_BEDDED_GRAND_CANYON_R1.panelEvidence.panels[binding.panelId]), 'PROFILE_PANEL_BINDING_MISSING', { id, panelId: binding.panelId });
}

const dimensions = [10.5, 9.4, 6.2];
const seed = 101000;
const macroA = compileCliffBeddedGrandCanyonMacro(dimensions, seed);
const macroB = compileCliffBeddedGrandCanyonMacro(dimensions, seed);
const macroOtherSeed = compileCliffBeddedGrandCanyonMacro(dimensions, seed + 2);
check(JSON.stringify(macroA) === JSON.stringify(macroB), 'COMPILED_MACRO_NONDETERMINISTIC');
check(JSON.stringify(macroA) !== JSON.stringify(macroOtherSeed), 'SEED_VARIATION_MISSING');
for (const id of ['frontXY', 'sideZY', 'topXZ', 'bottomSupportXZ']) {
  check(validateReferencePolygon(macroA[id], `${macroA.id}/${id}`), 'COMPILED_PROFILE_INVALID', { id });
}
for (const [invalidDimensions, label] of [
  [[Infinity, 9.4, 6.2], 'positive-infinity'],
  [[10.5, Number.NaN, 6.2], 'nan'],
  [[10.5, 9.4, 0], 'zero'],
  [[10.5, -9.4, 6.2], 'negative'],
]) {
  let rejected = false;
  try { compileCliffBeddedGrandCanyonMacro(invalidDimensions, seed); } catch { rejected = true; }
  check(rejected, 'INVALID_MACRO_DIMENSIONS_ACCEPTED', { label });
}
for (const invalidSeed of [-1, 0x100000000, 1.5, Number.NaN, Infinity]) {
  let rejected = false;
  try { compileCliffBeddedGrandCanyonMacro(dimensions, invalidSeed); } catch { rejected = true; }
  check(rejected, 'INVALID_MACRO_SEED_ACCEPTED', { invalidSeed: String(invalidSeed) });
}

const scaledMacro = compileCliffBeddedGrandCanyonMacro(dimensions.map((value) => value * 2), seed);
for (const id of ['frontXY', 'sideZY', 'topXZ', 'bottomSupportXZ']) {
  const scalesExactly = macroA[id].every((vertex, index) => vertex.every((value, axis) => Math.abs(scaledMacro[id][index][axis] - value * 2) <= 1e-12));
  check(scalesExactly, 'PROFILE_SCALE_NOT_LINEAR', { id });
}
const probes = [[0, 0, 0], [1.2, -0.7, 0.4], [-2.1, 1.3, -0.8]];
for (const probe of probes) {
  const original = evaluateReferenceVisualHull(macroA, probe);
  const scaled = evaluateReferenceVisualHull(scaledMacro, probe.map((value) => value * 2));
  check(Math.abs(scaled - original * 2) <= 1e-9, 'FIELD_SCALE_NOT_LINEAR', { original, probe, scaled });
}

const h = dimensions.map((value) => value * 0.45);
const bounds = { min: h.map((value) => -value * 1.16), max: h.map((value) => value * 1.16) };
const evaluateHull = (x, y, z) => evaluateReferenceVisualHull(macroA, [x, y, z]);
const grid = sampleScalarField({ bounds, evaluate: evaluateHull, resolution: 40, sourceId: 'c8/reference-profile/cliff-bedded-grand-canyon-r1' });
const mesh = extractManifoldDualContouring(grid, { evaluate: evaluateHull });
const topology = auditMeshTopology(mesh, { evaluate: evaluateHull, grid, includeSelfIntersections: true });
check(topology.components === 1, 'VISUAL_HULL_COMPONENT_COUNT', { components: topology.components });
check(topology.topologyFailures === 0, 'VISUAL_HULL_TOPOLOGY_FAILURE', { topologyFailures: topology.topologyFailures });
check(topology.selfIntersectionPairs === 0, 'VISUAL_HULL_SELF_INTERSECTION', { selfIntersectionPairs: topology.selfIntersectionPairs });

const tolerance = Math.max(...grid.spacing) * 0.55;
let worstFront = -Infinity;
let worstSide = -Infinity;
let worstTop = -Infinity;
for (let index = 0; index < mesh.positions.length; index += 3) {
  const point = [mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]];
  worstFront = Math.max(worstFront, signedDistanceReferencePolygon2D([point[0], point[1]], macroA.frontXY));
  worstSide = Math.max(worstSide, signedDistanceReferencePolygon2D([point[2], point[1]], macroA.sideZY));
  worstTop = Math.max(worstTop, signedDistanceReferencePolygon2D([point[0], point[2]], macroA.topXZ));
}
check(worstFront <= tolerance, 'FRONT_PROJECTION_ESCAPES_PROFILE', { tolerance, worstFront });
check(worstSide <= tolerance, 'SIDE_PROJECTION_ESCAPES_PROFILE', { tolerance, worstSide });
check(worstTop <= tolerance, 'TOP_PROJECTION_ESCAPES_PROFILE', { tolerance, worstTop });

const catalog = loadGeologyCatalog();
const sandstoneFixtures = createC8BasisFixtures({ catalog })['cross-bedded-sandstone'];
const cliffFixture = sandstoneFixtures.hero
  .find((fixture) => fixture.variant.id === 'sandstone-cliff');
const stagesA = compileC8BasisStages(cliffFixture, { catalog });
const stagesB = compileC8BasisStages(cliffFixture, { catalog });
check(stagesA.basisField.descriptor.fieldContentId === stagesB.basisField.descriptor.fieldContentId, 'FIELD_LINEAGE_NONDETERMINISTIC');
check(stagesA.basisField.descriptor.macroTemplate.contentId === EXPECTED_PROFILE_CONTENT_ID, 'FIELD_TEMPLATE_LINEAGE_MISMATCH');
check(Boolean(stagesA.basisField.descriptor.macroTemplate.macroProgramContentId), 'MACRO_PROGRAM_LINEAGE_MISSING');
check(stagesA.basisField.descriptor.macroTemplate.surfaceProgramVersion === 11, 'SANDSTONE_SURFACE_VERSION_NOT_V11');
check(stagesA.basisField.descriptor.fieldContentId !== V9_HERO_FIELD_CONTENT_ID, 'V11_FIELD_MATCHES_V9');
check(stagesA.basisField.descriptor.fieldContentId !== V10_HERO_FIELD_CONTENT_ID, 'V11_FIELD_LINEAGE_DID_NOT_CHANGE');
check(Boolean(stagesA.basisField.descriptor.jointGeometry?.contentId), 'JOINT_GEOMETRY_LINEAGE_MISSING');
check(stagesA.basisField.descriptor.jointGeometry.contentId === stagesB.basisField.descriptor.jointGeometry.contentId, 'JOINT_GEOMETRY_NONDETERMINISTIC');
check(stagesA.basisField.descriptor.jointGeometry.contentId !== V10_HERO_JOINT_CONTENT_ID, 'V11_JOINT_LINEAGE_DID_NOT_CHANGE');
check(stagesA.basisField.descriptor.jointGeometry.version === 2, 'V11_JOINT_PROGRAM_VERSION_DRIFT');

const jointGeometry = stagesA.basisField.descriptor.jointGeometry;
check(jointGeometry.joints.length === 2, 'JOINT_SET_COUNT_DRIFT', { actual: jointGeometry.joints.length, expected: 2 });
checkJointEndpointAnchors(cliffFixture, stagesA.basisField.descriptor, 'hero/101000');
const jointAnchorSignatures = jointGeometry.joints.map((joint) => joint.segments
  .flatMap((segment) => [segment.minimumContactIndex, segment.maximumContactIndex]).join(':'));
check(new Set(jointAnchorSignatures).size === jointAnchorSignatures.length, 'JOINT_ENDPOINT_TIER_RHYTHM_REPEATS', {
  jointAnchorSignatures,
});
for (const joint of jointGeometry.joints) {
  check(joint.segments.length >= 2 && joint.segments.length <= 3, 'JOINT_SEGMENT_COUNT_INVALID', { joint: joint.index, segmentCount: joint.segments.length });
  let priorMaximumY = null;
  const declaredAsymmetryMetres = [];
  const declaredWidthsMetres = [];
  const declaredDepthsMetres = [];
  for (const segment of joint.segments) {
    check(segment.minimumY < segment.maximumY, 'JOINT_SEGMENT_RANGE_INVALID', { joint: joint.index, segment });
    if (priorMaximumY !== null) check(segment.minimumY - priorMaximumY >= 0.02, 'JOINT_GAP_TOO_SHORT', {
      gap: segment.minimumY - priorMaximumY,
      joint: joint.index,
    });
    priorMaximumY = segment.maximumY;
    declaredWidthsMetres.push(
      segment.widthStart * cliffFixture.recipe.targetDimensionsMetres[0] * 0.45,
      segment.widthMiddle * cliffFixture.recipe.targetDimensionsMetres[0] * 0.45,
      segment.widthEnd * cliffFixture.recipe.targetDimensionsMetres[0] * 0.45,
    );
    declaredAsymmetryMetres.push(
      Math.abs(segment.widthLeftStart - segment.widthRightStart) * cliffFixture.recipe.targetDimensionsMetres[0] * 0.45,
      Math.abs(segment.widthLeftMiddle - segment.widthRightMiddle) * cliffFixture.recipe.targetDimensionsMetres[0] * 0.45,
      Math.abs(segment.widthLeftEnd - segment.widthRightEnd) * cliffFixture.recipe.targetDimensionsMetres[0] * 0.45,
    );
    declaredDepthsMetres.push(segment.depthStartMetres, segment.depthMiddleMetres, segment.depthEndMetres);
  }
  check(Math.max(...declaredWidthsMetres) - Math.min(...declaredWidthsMetres) >= 0.025, 'JOINT_DECLARED_WIDTH_VARIATION_MISSING', {
    declaredWidthsMetres,
    joint: joint.index,
  });
  check(Math.max(...declaredAsymmetryMetres) >= 0.02, 'JOINT_DECLARED_ASYMMETRY_MISSING', {
    declaredAsymmetryMetres,
    joint: joint.index,
  });
  check(Math.max(...declaredDepthsMetres) - Math.min(...declaredDepthsMetres) >= 0.025, 'JOINT_DECLARED_DEPTH_VARIATION_MISSING', {
    declaredDepthsMetres,
    joint: joint.index,
  });
  check(Number.isFinite(joint.chip.depthMetres) && joint.chip.depthMetres > Math.min(...declaredDepthsMetres), 'JOINT_BED_CHIP_NOT_DEEPER', {
    chipDepthMetres: joint.chip.depthMetres,
    declaredDepthsMetres,
    joint: joint.index,
  });
}

const jointProbe = cliffFrontDepthProbe(cliffFixture, stagesA.basisField);
for (const joint of jointProbe.joints) {
  const activeDepths = joint.activeSegments.map((sample) => sample.recessionMetres);
  const activeWidths = joint.activeSegments.map((sample) => sample.widthMetres);
  const gapDepths = joint.gaps.map((sample) => sample.recessionMetres);
  check(activeDepths.every((value) => Number.isFinite(value) && value >= 0.02), 'JOINT_SEGMENT_DISAPPEARS', {
    activeDepths,
    joint: joint.index,
  });
  check(activeDepths.every((value) => value <= 0.19), 'JOINT_SEGMENT_TOO_DEEP', { activeDepths, joint: joint.index });
  check(activeWidths.every((value) => Number.isFinite(value) && value >= 0.12 && value <= 0.55), 'JOINT_VISIBLE_WIDTH_INVALID', {
    activeWidths,
    joint: joint.index,
  });
  check(gapDepths.every((value) => Number.isFinite(value) && value <= 0.02), 'JOINT_BED_TERMINATION_GAP_FILLED', {
    gapDepths,
    joint: joint.index,
  });
  check(Math.max(...activeDepths) - Math.max(0, ...gapDepths) >= 0.025, 'JOINT_GAP_NOT_DISTINCT_FROM_SEGMENTS', {
    activeDepths,
    gapDepths,
    joint: joint.index,
  });
  check(Number.isFinite(joint.chipNearestBedContactMetres) && joint.chipNearestBedContactMetres <= 0.11, 'JOINT_CHIP_MISSES_BED_CONTACT', {
    chipNearestBedContactMetres: joint.chipNearestBedContactMetres,
    joint: joint.index,
  });
}
check(jointProbe.loss.outboardSamples.length >= 3, 'EDGE_OPEN_LOSS_HAS_NO_OUTBOARD_FACE', jointProbe.loss);
check(Number.isFinite(jointProbe.loss.maximumRetreatMetres) && jointProbe.loss.maximumRetreatMetres >= 0.08, 'EDGE_OPEN_LOSS_RETREAT_MISSING', jointProbe.loss);
check(jointProbe.loss.outboardSamples.every((sample) => sample.depthMetres <= jointProbe.loss.inboardDepthMetres + 0.025), 'EDGE_OPEN_LOSS_CLOSES_INTO_SOCKET', jointProbe.loss);
for (const [landmark, expected] of Object.entries(V9_MACRO_PARITY)) {
  const actual = jointProbe.macroParity[landmark];
  check(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7, 'V11_V9_MACRO_LANDMARK_PARITY_FAILED', {
    actual,
    expected,
    landmark,
  });
}

const compiledCliff = meshC8BasisFixture(cliffFixture, { catalog, includeSelfIntersections: true, resolution: 64, stages: stagesA });
check(compiledCliff.record.passed, 'CLIFF_EXEMPLAR_TOPOLOGY_FAILED', {
  components: compiledCliff.record.topology.components,
  selfIntersectionPairs: compiledCliff.record.topology.selfIntersectionPairs,
  topologyFailures: compiledCliff.record.topology.topologyFailures,
});
check(compiledCliff.record.topology.components === 1, 'CLIFF_HERO_COMPONENT_COUNT', { components: compiledCliff.record.topology.components });
check(compiledCliff.record.topology.closedOrientableGenus === 0, 'CLIFF_HERO_GENUS_NOT_ZERO', {
  genus: compiledCliff.record.topology.closedOrientableGenus,
});
check(compiledCliff.record.meshContentId !== V9_HERO_MESH_CONTENT_ID, 'V11_MESH_MATCHES_V9');
check(compiledCliff.record.meshContentId !== V10_HERO_MESH_CONTENT_ID, 'V11_MESH_LINEAGE_DID_NOT_CHANGE');
for (const bound of ['min', 'max']) for (let axis = 0; axis < 3; axis += 1) {
  const actual = compiledCliff.record.topology.bounds[bound][axis];
  const expected = V10_HERO_BOUNDS[bound][axis];
  check(Math.abs(actual - expected) <= 1e-7, 'V11_V9_MACRO_BOUNDS_PARITY_FAILED', {
    actual,
    axis,
    bound,
    expected,
  });
}

const finalProjectionTolerance = Math.max(...compiledCliff.grid.spacing) * 0.8;
let finalWorstFront = -Infinity;
let finalWorstSide = -Infinity;
let finalWorstTop = -Infinity;
let finalWorstBottomSupport = -Infinity;
const finalShapedPoints = [];
for (let index = 0; index < compiledCliff.mesh.positions.length; index += 3) {
  const shapedPoint = worldToShaped(cliffFixture, [
    compiledCliff.mesh.positions[index],
    compiledCliff.mesh.positions[index + 1],
    compiledCliff.mesh.positions[index + 2],
  ]);
  finalShapedPoints.push(shapedPoint);
  finalWorstFront = Math.max(finalWorstFront, signedDistanceReferencePolygon2D([shapedPoint[0], shapedPoint[1]], macroA.frontXY));
  finalWorstSide = Math.max(finalWorstSide, signedDistanceReferencePolygon2D([shapedPoint[2], shapedPoint[1]], macroA.sideZY));
  finalWorstTop = Math.max(finalWorstTop, signedDistanceReferencePolygon2D([shapedPoint[0], shapedPoint[2]], macroA.topXZ));
}
const finalMinimumY = Math.min(...finalShapedPoints.map((point) => point[1]));
for (const shapedPoint of finalShapedPoints) if (shapedPoint[1] <= finalMinimumY + compiledCliff.grid.spacing[1] * 0.25) {
  finalWorstBottomSupport = Math.max(
    finalWorstBottomSupport,
    signedDistanceReferencePolygon2D([shapedPoint[0], shapedPoint[2]], macroA.bottomSupportXZ),
  );
}
check(finalWorstFront <= finalProjectionTolerance, 'V11_FINAL_FRONT_PROJECTION_ESCAPES_PROFILE', { finalProjectionTolerance, finalWorstFront });
check(finalWorstSide <= finalProjectionTolerance, 'V11_FINAL_SIDE_PROJECTION_ESCAPES_PROFILE', { finalProjectionTolerance, finalWorstSide });
check(finalWorstTop <= finalProjectionTolerance, 'V11_FINAL_TOP_PROJECTION_ESCAPES_PROFILE', { finalProjectionTolerance, finalWorstTop });
check(finalWorstBottomSupport <= finalProjectionTolerance, 'V11_FINAL_SUPPORT_PROJECTION_ESCAPES_PROFILE', {
  finalProjectionTolerance,
  finalWorstBottomSupport,
});

const variationMatrix = [];
for (const qualityTier of ['draft', 'production', 'hero']) {
  for (const fixture of sandstoneFixtures[qualityTier].filter((candidate) => candidate.variant.id === 'sandstone-cliff')) {
    const compiled = meshC8BasisFixture(fixture, { catalog, includeSelfIntersections: true });
    checkJointEndpointAnchors(fixture, compiled.stages.basisField.descriptor, `${qualityTier}/${fixture.recipe.seed}`);
    const result = {
      components: compiled.record.topology.components,
      fieldContentId: compiled.record.fieldContentId,
      heroRole: fixture.heroRole,
      meshContentId: compiled.record.meshContentId,
      passed: compiled.record.passed,
      qualityTier,
      resolution: compiled.record.resolution,
      seed: fixture.recipe.seed,
      seedIndex: fixture.seedIndex,
      selfIntersectionPairs: compiled.record.topology.selfIntersectionPairs,
      topologyFailures: compiled.record.topology.topologyFailures,
      triangles: compiled.record.topology.triangles,
    };
    variationMatrix.push(result);
    check(result.passed, 'CLIFF_VARIATION_FIXTURE_FAILED', result);
  }
}
check(variationMatrix.length === 22, 'CLIFF_VARIATION_POPULATION_INCOMPLETE', { actual: variationMatrix.length, expected: 22 });
check(new Set(variationMatrix.map((result) => result.fieldContentId)).size === variationMatrix.length, 'CLIFF_VARIATION_FIELD_LINEAGE_COLLISION');
check(new Set(variationMatrix.map((result) => result.meshContentId)).size === variationMatrix.length, 'CLIFF_VARIATION_MESH_CLONE');

const scaleMatrix = [];
for (const scaleFactor of [0.25, 0.5, 1, 2, 4]) {
  try {
    const scaled = scaleC8BasisFixture(cliffFixture, scaleFactor, { catalog });
    const compiled = meshC8BasisFixture(scaled, { catalog, includeSelfIntersections: true, resolution: 36 });
    checkJointEndpointAnchors(scaled, compiled.stages.basisField.descriptor, `scale/${scaleFactor}`);
    const result = {
      disposition: 'compiled',
      maximumDimensionMetres: Math.max(...scaled.recipe.targetDimensionsMetres),
      passed: compiled.record.passed,
      scaleFactor,
      selfIntersectionPairs: compiled.record.topology.selfIntersectionPairs,
      topologyFailures: compiled.record.topology.topologyFailures,
    };
    scaleMatrix.push(result);
    check(result.passed, 'CLIFF_SCALE_FIXTURE_FAILED', result);
  } catch (error) {
    const expectedOntologyGuard = error?.code === 'ROCK_RECIPE_INVALID'
      && error?.details?.issues?.some((issue) => issue.code === 'GEOLOGY_COMBINATION_INVALID');
    const result = {
      code: error?.code ?? error?.name,
      disposition: expectedOntologyGuard ? 'rejected-invalid-landform-scale-pair' : 'unexpected-error',
      passed: expectedOntologyGuard,
      scaleFactor,
    };
    scaleMatrix.push(result);
    check(result.passed, 'CLIFF_SCALE_BOUNDARY_UNEXPECTED', result);
  }
}

const report = {
  checks,
  failures,
  lineage: {
    fieldContentId: stagesA.basisField.descriptor.fieldContentId,
    heroMeshContentId: compiledCliff.record.meshContentId,
    jointGeometryContentId: stagesA.basisField.descriptor.jointGeometry.contentId,
    macroProgramContentId: stagesA.basisField.descriptor.macroTemplate.macroProgramContentId,
    profileByteSha256: CLIFF_BEDDED_GRAND_CANYON_R1_BYTE_SHA256,
    profileContentId: CLIFF_BEDDED_GRAND_CANYON_R1_CONTENT_ID,
  },
  passed: failures.length === 0,
  finalProjectionContainment: {
    finalProjectionTolerance,
    finalWorstBottomSupport,
    finalWorstFront,
    finalWorstSide,
    finalWorstTop,
  },
  jointProbe,
  projectedContainment: { tolerance, worstFront, worstSide, worstTop },
  scaleMatrix,
  topology: {
    cliffComponents: compiledCliff.record.topology.components,
    cliffSelfIntersectionPairs: compiledCliff.record.topology.selfIntersectionPairs,
    cliffTopologyFailures: compiledCliff.record.topology.topologyFailures,
    visualHullComponents: topology.components,
    visualHullSelfIntersectionPairs: topology.selfIntersectionPairs,
    visualHullTopologyFailures: topology.topologyFailures,
  },
  variationMatrix,
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
