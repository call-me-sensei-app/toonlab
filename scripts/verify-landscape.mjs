// Landscape system verification — the contracts Landscape Lab builds on:
// field construction + bilinear heightAt, brush commands that revert
// byte-identically, cross-tile seam integrity (positions AND normals),
// seeded determinism, splat weight-sum invariance, foliage paint rules, and
// project-document round-trips. Run: node scripts/verify-landscape.mjs

import process from 'node:process';
import { createHash } from 'node:crypto';

import {
  applyBrushSample,
  applyCommand,
  applyRamp,
  applySplatCommand,
  applySplatSample,
  beginSplatStroke,
  beginStroke,
  brushFalloff,
  commitSplatStroke,
  commitStroke,
  createLandscapeField,
  createLandscapeProjectDocument,
  createLandscapeSettings,
  DEFAULT_LANDSCAPE_SETTINGS,
  FOLIAGE_INSTANCE_STRIDE,
  LANDSCAPE_PROJECT_DOCUMENT_TYPE,
  LANDSCAPE_SETTING_FIELD_SCHEMA,
  LANDSCAPE_SETTING_FIELD_SCHEMA_BY_GROUP,
  LANDSCAPE_SETTING_GROUPS,
  mergeDirtyRects,
  parseLandscapeProjectDocument,
  buildTunnelGeometries,
  buildTunnelPath,
  createTunnel,
  deserializeTunnel,
  normalizeTunnelProfile,
  planTunnelBore,
  serializeTunnel,
  tunnelProfilePreset,
  revertCommand,
  revertSplatCommand,
  tilesForDirtyRect,
} from '../src/landscape/index.js';
import {
  buildTileGeometry,
  tileGridRange,
  updateTileGeometry,
} from '../src/landscape/landscapeTileGeometry.js';
import { planFoliagePaint } from '../src/landscape/landscapeFoliage.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function sha256(view) {
  return createHash('sha256')
    .update(Buffer.from(view.buffer, view.byteOffset, view.byteLength))
    .digest('hex');
}

// --- 1. Field construction + sampling ---------------------------------------

console.log('field');
const field = createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 32, spacing: 0.5 });
check('grid dims', field.gridW === 65 && field.gridD === 65);
check('splat dims', field.splatW === 64 && field.splatD === 64 && field.splat.length === 64 * 64 * 4);
check('splat starts on layer 0', field.splat[0] === 255 && field.splat[1] === 0);
check('centered origin', field.origin.x === -16 && field.origin.z === -16);

field.heights[field.indexOf(10, 12)] = 3;
const vertexWorld = field.gridToWorld(10, 12);
check('heightAt exact at vertex', field.heightAt(vertexWorld.x, vertexWorld.z) === 3);
const midX = field.origin.x + 10.5 * field.spacing;
const neighbors = [field.heights[field.indexOf(10, 12)], field.heights[field.indexOf(11, 12)]];
check(
  'heightAt bilinear at edge midpoint',
  Math.abs(field.heightAt(midX, vertexWorld.z) - (neighbors[0] + neighbors[1]) / 2) < 1e-6,
);
check('heightAt clamps out of bounds', Number.isFinite(field.heightAt(1e6, -1e6)));
check('falloff edges', brushFalloff(0, 5, 0.5) === 1 && brushFalloff(5, 5, 0.5) === 0);

const downRay = field.raycast({ x: vertexWorld.x, y: 50, z: vertexWorld.z }, { x: 0, y: -1, z: 0 });
check('raycast hits raised vertex', Boolean(downRay) && Math.abs(downRay.point.y - 3) < 0.01,
  `got ${downRay?.point?.y}`);

// --- 2. Brush commands revert byte-identically -------------------------------

console.log('brush commands');
const brushField = createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 32, spacing: 0.5 });
const baselineHash = sha256(brushField.heights);
const stroke = beginStroke(brushField);
applyBrushSample(brushField, stroke, { tool: 'raise', x: 0, z: 0, radius: 4, strength: 1.5 });
applyBrushSample(brushField, stroke, { tool: 'raise', x: 2, z: 1, radius: 4, strength: 1.5 });
applyBrushSample(brushField, stroke, { tool: 'smooth', x: 1, z: 0, radius: 5, strength: 0.8 });
const command = commitStroke(brushField, stroke);
check('stroke committed', Boolean(command) && command.indices.length > 0);
const editedHash = sha256(brushField.heights);
check('stroke changed the field', editedHash !== baselineHash);
revertCommand(brushField, command);
check('revert restores byte-identical heights', sha256(brushField.heights) === baselineHash);
applyCommand(brushField, command);
check('reapply restores the edit', sha256(brushField.heights) === editedHash);

const rampStroke = beginStroke(brushField);
applyRamp(brushField, rampStroke, { fromX: -8, fromZ: -8, fromH: 0, toX: 8, toZ: 8, toH: 6, width: 3 });
const rampCommand = commitStroke(brushField, rampStroke);
check('ramp commits', Boolean(rampCommand));
check('ramp raises the midpoint', brushField.heightAt(0, 0) > 1);
revertCommand(brushField, rampCommand);

// Determinism: identical seed + samples produce identical commands.
const detA = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32 });
const detB = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32 });
for (const detField of [detA, detB]) {
  const detStroke = beginStroke(detField);
  applyBrushSample(detField, detStroke, { tool: 'noise', x: 1, z: 2, radius: 5, strength: 1, seed: 42 });
  applyBrushSample(detField, detStroke, { tool: 'terrace', x: 0, z: 0, radius: 6, strength: 0.7 });
  detField.command = commitStroke(detField, detStroke);
}
check('noise/terrace strokes deterministic',
  detA.command && detB.command
  && sha256(detA.command.after) === sha256(detB.command.after)
  && sha256(detA.command.indices) === sha256(detB.command.indices));

// --- 3. Cross-tile seams ------------------------------------------------------

console.log('tile seams');
const seamField = createLandscapeField({ tilesX: 2, tilesZ: 1, quadsPerTile: 16, spacing: 0.5 });
const seamStroke = beginStroke(seamField);
// Stroke centered exactly on the tile border (gx = 16 → world x = origin + 8).
const borderWorldX = seamField.origin.x + 16 * seamField.spacing;
applyBrushSample(seamField, seamStroke, { tool: 'raise', x: borderWorldX, z: 0, radius: 3, strength: 2 });
const seamCommand = commitStroke(seamField, seamStroke);
const leftGeometry = buildTileGeometry(seamField, 0, 0);
const rightGeometry = buildTileGeometry(seamField, 1, 0);
const leftRange = tileGridRange(seamField, 0, 0);
const rightRange = tileGridRange(seamField, 1, 0);

function borderVertex(geometry, range, side, gz) {
  const width = seamField.quadsPerTile + 1;
  const localX = side === 'max' ? seamField.quadsPerTile : 0;
  const vertex = (gz - range.minGz) * width + localX;
  const positions = geometry.getAttribute('position').array;
  const normals = geometry.getAttribute('normal').array;
  return {
    position: [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]],
    normal: [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]],
  };
}

let seamMatches = true;
for (let gz = 0; gz <= seamField.quadsPerTile; gz += 1) {
  const left = borderVertex(leftGeometry, leftRange, 'max', gz);
  const right = borderVertex(rightGeometry, rightRange, 'min', gz);
  for (let axis = 0; axis < 3; axis += 1) {
    if (left.position[axis] !== right.position[axis]) seamMatches = false;
    if (Math.abs(left.normal[axis] - right.normal[axis]) > 1e-6) seamMatches = false;
  }
}
check('border vertices identical across tiles (positions + normals)', seamMatches);
check('dirty rect maps to both tiles',
  tilesForDirtyRect(seamField, seamCommand.dirtyRect).length === 2);
const updatedLeft = updateTileGeometry(seamField, leftGeometry, seamCommand.dirtyRect);
const updatedRight = updateTileGeometry(seamField, rightGeometry, seamCommand.dirtyRect);
check('partial update touches both tile geometries', updatedLeft && updatedRight);
check('merge rects', (() => {
  const merged = mergeDirtyRects({ minX: 0, minZ: 0, maxX: 2, maxZ: 2 }, { minX: 1, minZ: 1, maxX: 5, maxZ: 4 });
  return merged.minX === 0 && merged.maxX === 5 && merged.maxZ === 4;
})());

// --- 4. Splat painting --------------------------------------------------------

console.log('splat');
const splatField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32 });
const splatBaseline = sha256(splatField.splat);
const splatStroke = beginSplatStroke(splatField);
applySplatSample(splatField, splatStroke, { layer: 2, x: 0, z: 0, radius: 4, strength: 0.8 });
applySplatSample(splatField, splatStroke, { layer: 1, x: 2, z: 2, radius: 3, strength: 0.5 });
const splatCommand = commitSplatStroke(splatField, splatStroke);
check('splat stroke commits', Boolean(splatCommand) && splatCommand.indices.length > 0);
let sumOk = true;
for (let texel = 0; texel < splatField.splatW * splatField.splatD; texel += 1) {
  const offset = texel * 4;
  const sum = splatField.splat[offset] + splatField.splat[offset + 1]
    + splatField.splat[offset + 2] + splatField.splat[offset + 3];
  if (sum !== 255) {
    sumOk = false;
    break;
  }
}
check('splat weights sum to exactly 255 everywhere', sumOk);
// Erase (negative strength) drains even a saturated channel without breaking
// the sum invariant — checked on its own field so the round-trip below stays
// a pure paint→revert→reapply sequence.
const eraseField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 16 });
const eraseStroke = beginSplatStroke(eraseField);
applySplatSample(eraseField, eraseStroke, { layer: 0, x: 0, z: 0, radius: 3, strength: -1 });
const eraseCommand = commitSplatStroke(eraseField, eraseStroke);
let eraseSumOk = Boolean(eraseCommand);
for (let texel = 0; texel < eraseField.splatW * eraseField.splatD; texel += 1) {
  const offset = texel * 4;
  const sum = eraseField.splat[offset] + eraseField.splat[offset + 1]
    + eraseField.splat[offset + 2] + eraseField.splat[offset + 3];
  if (sum !== 255) {
    eraseSumOk = false;
    break;
  }
}
check('splat erase from saturation keeps sums at 255', eraseSumOk);
const splatEdited = sha256(splatField.splat);
revertSplatCommand(splatField, splatCommand);
check('splat revert restores byte-identical weights', sha256(splatField.splat) === splatBaseline);
applySplatCommand(splatField, splatCommand);
check('splat reapply restores the paint', sha256(splatField.splat) === splatEdited);

// --- 4b. Holes ----------------------------------------------------------------

console.log('holes');
const {
  applyHoleCommand: applyHole,
  applyHoleSample: holeSample,
  beginHoleStroke: holeStrokeBegin,
  commitHoleStroke: holeStrokeCommit,
  revertHoleCommand: revertHole,
} = await import('../src/landscape/index.js');
const { buildTileIndices } = await import('../src/landscape/landscapeTileGeometry.js');
const holeField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32, spacing: 0.5 });
const solidIndexCount = buildTileIndices(holeField, 0, 0).length;
const holeStroke = holeStrokeBegin(holeField);
holeSample(holeField, holeStroke, { x: 0, z: 0, radius: 3 });
const holeCommand = holeStrokeCommit(holeField, holeStroke);
check('hole stroke commits', Boolean(holeCommand) && holeCommand.indices.length > 0);
check('isHole reports punched quads', holeField.isHole(0, 0) === true && holeField.isHole(7, 7) === false);
check('hole quads drop from the index buffer',
  buildTileIndices(holeField, 0, 0).length === solidIndexCount - holeCommand.indices.length * 6);
const holeRay = holeField.raycast({ x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 });
check('raycast passes through hole quads', holeRay === null, JSON.stringify(holeRay));
const solidRay = holeField.raycast({ x: 7, y: 20, z: 7 }, { x: 0, y: -1, z: 0 });
check('raycast still hits solid quads', Boolean(solidRay));
revertHole(holeField, holeCommand);
check('hole revert restores solid terrain',
  holeField.isHole(0, 0) === false && buildTileIndices(holeField, 0, 0).length === solidIndexCount);
applyHole(holeField, holeCommand);
check('hole reapply restores the punch', holeField.isHole(0, 0) === true);
check('foliage planning refuses hole quads', planFoliagePaint({
  field: holeField,
  layer: { rules: { minSpacing: 0 }, hasClearance: () => true },
  x: 0,
  z: 0,
  radius: 1.2,
  density: 3,
  seed: 3,
}).length === 0);

// --- 4b1. Brush shapes --------------------------------------------------------

console.log('brush shapes');
const shapeField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32, spacing: 0.5 });
// A square hole of radius 3 covers the (2.4, 2.4) corner quad (chebyshev
// 2.4 < 3) that a round brush of the same radius misses (euclid 3.39 > 3).
const squareHole = holeStrokeBegin(shapeField);
holeSample(shapeField, squareHole, { x: 0, z: 0, radius: 3, shape: 'square' });
holeStrokeCommit(shapeField, squareHole);
check('square hole reaches its corners', shapeField.isHole(2.4, 2.4) === true);
const roundField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32, spacing: 0.5 });
const roundHole = holeStrokeBegin(roundField);
holeSample(roundField, roundHole, { x: 0, z: 0, radius: 3, shape: 'round' });
holeStrokeCommit(roundField, roundHole);
check('round hole stays round (corner untouched)', roundField.isHole(2.4, 2.4) === false
  && roundField.isHole(0, 0) === true);
const squareSculpt = beginStroke(shapeField);
applyBrushSample(shapeField, squareSculpt, {
  tool: 'raise', x: 8, z: 8, radius: 3, strength: 2, hardness: 1, shape: 'square',
});
commitStroke(shapeField, squareSculpt);
check('square sculpt raises the full corner at hardness 1',
  Math.abs(shapeField.heightAt(10.5, 10.5) - 2) < 1e-4
  && Math.abs(shapeField.heightAt(8, 10.5) - 2) < 1e-4,
  `${shapeField.heightAt(10.5, 10.5)}`);

// --- 4b2. Dry zones -----------------------------------------------------------

console.log('dry zones');
const {
  applyWaterCommand: applyWater,
  applyWaterSample: waterSample,
  beginWaterStroke: waterStrokeBegin,
  commitWaterStroke: waterStrokeCommit,
  revertWaterCommand: revertWater,
} = await import('../src/landscape/index.js');
const dryField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32, spacing: 0.5 });
const dryStroke = waterStrokeBegin(dryField);
waterSample(dryField, dryStroke, { x: 0, z: 0, radius: 3 });
const dryCommand = waterStrokeCommit(dryField, dryStroke);
check('dry stroke commits', Boolean(dryCommand) && dryCommand.indices.length > 0);
check('isDry reports painted quads', dryField.isDry(0, 0) === true && dryField.isDry(6, 6) === false);
revertWater(dryField, dryCommand);
check('dry revert re-wets', dryField.isDry(0, 0) === false);
applyWater(dryField, dryCommand);
check('dry reapply restores', dryField.isDry(0, 0) === true);
check('foliage ignores stage water inside dry zones', planFoliagePaint({
  field: dryField,
  layer: { rules: { minSpacing: 0, avoidWater: true }, hasClearance: () => true },
  x: 0,
  z: 0,
  radius: 1.2,
  density: 3,
  waterLevel: 5, // stage water far above the (flat, y=0) terrain
  groundwaterLevel: -5,
  seed: 3,
}).length > 0);
check('foliage still respects groundwater in dry zones', planFoliagePaint({
  field: dryField,
  layer: { rules: { minSpacing: 0, avoidWater: true }, hasClearance: () => true },
  x: 0,
  z: 0,
  radius: 1.2,
  density: 3,
  waterLevel: 5,
  groundwaterLevel: 2, // groundwater above the terrain: dry zone floods too
  seed: 3,
}).length === 0);

// --- 4c. Resize ---------------------------------------------------------------

console.log('resize');
const { resizeLandscapeField } = await import('../src/landscape/index.js');
const resizeSource = createLandscapeField({ tilesX: 1, tilesZ: 2, quadsPerTile: 16, spacing: 0.5 });
const resizeStroke = beginStroke(resizeSource);
applyBrushSample(resizeSource, resizeStroke, { tool: 'raise', x: 1, z: 2, radius: 3, strength: 4 });
commitStroke(resizeSource, resizeStroke);
const resizeSplatStroke = beginSplatStroke(resizeSource);
applySplatSample(resizeSource, resizeSplatStroke, { layer: 1, x: 1, z: 2, radius: 2, strength: 1 });
commitSplatStroke(resizeSource, resizeSplatStroke);
const resizeHoleStroke = holeStrokeBegin(resizeSource);
holeSample(resizeSource, resizeHoleStroke, { x: -2, z: -3, radius: 1 });
holeStrokeCommit(resizeSource, resizeHoleStroke);
const probeHeight = resizeSource.heightAt(1, 2);
const expanded = resizeLandscapeField(resizeSource, {
  tilesX: 3, tilesZ: 4, offsetTilesX: 2, offsetTilesZ: 1,
});
check('resize dims + grid', expanded.tilesX === 3 && expanded.tilesZ === 4
  && expanded.gridW === 3 * 16 + 1 && expanded.gridD === 4 * 16 + 1);
check('resize keeps world positions (origin shifts)',
  Math.abs(expanded.origin.x - (resizeSource.origin.x - 2 * 16 * 0.5)) < 1e-9
  && Math.abs(expanded.origin.z - (resizeSource.origin.z - 1 * 16 * 0.5)) < 1e-9);
check('resize preserves heights at world coordinates',
  Math.abs(expanded.heightAt(1, 2) - probeHeight) < 1e-6,
  `${expanded.heightAt(1, 2)} vs ${probeHeight}`);
check('resize preserves splat at world coordinates', (() => {
  const oldTexel = (Math.floor((2 - resizeSource.origin.z) / 0.5) * resizeSource.splatW
    + Math.floor((1 - resizeSource.origin.x) / 0.5)) * 4 + 1;
  const newTexel = (Math.floor((2 - expanded.origin.z) / 0.5) * expanded.splatW
    + Math.floor((1 - expanded.origin.x) / 0.5)) * 4 + 1;
  return resizeSource.splat[oldTexel] > 0 && expanded.splat[newTexel] === resizeSource.splat[oldTexel];
})());
check('resize preserves holes at world coordinates',
  resizeSource.isHole(-2, -3) === true && expanded.isHole(-2, -3) === true
  && expanded.isHole(1, 2) === false);
check('resize new area is flat solid layer-0', (() => {
  // A corner far outside the old block in the expanded field.
  const cornerX = expanded.origin.x + expanded.extentX - 0.6;
  const cornerZ = expanded.origin.z + 0.6;
  return expanded.heightAt(cornerX, cornerZ) === 0 && expanded.isHole(cornerX, cornerZ) === false;
})());
// Crop: the 1×2 source down to 1×1, keeping the SECOND tile (offset −1) —
// the sculpted bump lives in that tile and must survive at world coords.
const croppedField = resizeLandscapeField(resizeSource, {
  tilesX: 1, tilesZ: 1, offsetTilesX: 0, offsetTilesZ: -1,
});
check('crop keeps the chosen slice at world coordinates',
  croppedField.tilesZ === 1 && Math.abs(croppedField.heightAt(1, 2) - probeHeight) < 1e-6,
  `${croppedField.heightAt(1, 2)} vs ${probeHeight}`);
check('crop shifts the origin to the kept slice',
  Math.abs(croppedField.origin.z - (resizeSource.origin.z + 16 * 0.5)) < 1e-9);
let resizeRejected = 0;
try {
  resizeLandscapeField(resizeSource, { tilesX: 0, tilesZ: 4 });
} catch { resizeRejected += 1; }
try {
  resizeLandscapeField(resizeSource, { tilesX: 3, tilesZ: 4, offsetTilesX: 3, offsetTilesZ: 0 });
} catch { resizeRejected += 1; }
try {
  resizeLandscapeField(resizeSource, { tilesX: 1, tilesZ: 1, offsetTilesX: 0, offsetTilesZ: -2 });
} catch { resizeRejected += 1; }
check('resize rejects zero-size + non-overlapping placements', resizeRejected === 3);

// --- 4d. Region generation ----------------------------------------------------

console.log('generate');
const { generateTerrainRegion } = await import('../src/landscape/index.js');
const genOptions = {
  tiles: [{ tx: 0, tz: 0 }],
  type: 'mountains',
  minElevation: 2,
  maxElevation: 20,
  roughness: 0.6,
  features: [],
  seed: 11,
  waterLevel: -0.6,
};
const genA = createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 32, spacing: 0.5 });
const genBaselineHeights = sha256(genA.heights);
const genBaselineSplat = sha256(genA.splat);
const genResult = generateTerrainRegion(genA, genOptions);
check('generate produces terrain + splat commands',
  Boolean(genResult.terrainCommand) && Boolean(genResult.splatCommand));
check('generate leaves other tiles untouched',
  genA.heights[genA.indexOf(50, 50)] === 0 && genA.splat[(50 * genA.splatW + 50) * 4] === 255);
check('generate leaves the region border seam-free',
  genA.heights[genA.indexOf(32, 10)] === 0 && genA.heights[genA.indexOf(10, 32)] === 0);
const genInterior = genA.heightAt(genA.origin.x + 8, genA.origin.z + 8);
check('generate interior lands inside the elevation range',
  genInterior >= 1.5 && genInterior <= 20.5, String(genInterior));
const genB = createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 32, spacing: 0.5 });
const genResultB = generateTerrainRegion(genB, genOptions);
check('generate is deterministic per seed',
  sha256(genResult.terrainCommand.after) === sha256(genResultB.terrainCommand.after)
  && sha256(genResult.splatCommand.after) === sha256(genResultB.splatCommand.after));
revertCommand(genA, genResult.terrainCommand);
revertSplatCommand(genA, genResult.splatCommand);
check('generate reverts byte-identically',
  sha256(genA.heights) === genBaselineHeights && sha256(genA.splat) === genBaselineSplat);
const genLake = createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 32, spacing: 0.5 });
generateTerrainRegion(genLake, { ...genOptions, type: 'hills', features: ['lake', 'river'], seed: 4 });
let genLakeMin = Infinity;
for (let i = 0; i < genLake.heights.length; i += 1) genLakeMin = Math.min(genLakeMin, genLake.heights[i]);
check('lake/river features dig below the water level', genLakeMin < -0.6, String(genLakeMin));

// --- 5. Settings schema -------------------------------------------------------

console.log('settings');
check('every default has a schema field',
  Object.keys(DEFAULT_LANDSCAPE_SETTINGS).every((key) => LANDSCAPE_SETTING_FIELD_SCHEMA[key]));
check('every schema field belongs to a declared group',
  Object.values(LANDSCAPE_SETTING_FIELD_SCHEMA)
    .every((schemaField) => LANDSCAPE_SETTING_GROUPS.some((group) => group.id === schemaField.group)));
check('grouped schema covers all fields',
  Object.values(LANDSCAPE_SETTING_FIELD_SCHEMA_BY_GROUP)
    .reduce((total, group) => total + Object.keys(group).length, 0)
  === Object.keys(LANDSCAPE_SETTING_FIELD_SCHEMA).length);
const clamped = createLandscapeSettings({ brushRadius: 9999, brushStrength: -5, showWater: 'true' });
check('settings clamp + coerce', clamped.brushRadius === 40 && clamped.brushStrength === 0.01
  && clamped.showWater === true);

// --- 6. Foliage paint planning -----------------------------------------------

console.log('foliage');
const foliageField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 64, spacing: 0.5 });
// Raise a steep cone in the middle: rules should reject its flanks.
const coneStroke = beginStroke(foliageField);
for (let i = 0; i < 6; i += 1) {
  applyBrushSample(foliageField, coneStroke, { tool: 'raise', x: 0, z: 0, radius: 4, strength: 2 });
}
commitStroke(foliageField, coneStroke);
const fakeLayer = {
  rules: { minSpacing: 1.5, maxSlope: 0.6, avoidWater: true, scaleRange: [0.8, 1.2], yawRandom: true },
  hasClearance: () => true,
};
const planned = planFoliagePaint({
  field: foliageField,
  layer: fakeLayer,
  x: 0,
  z: 0,
  radius: 10,
  density: 0.3,
  waterLevel: -0.5,
  seed: 7,
});
check('paint plans instances', planned.length > 0);
check('paint respects maxSlope', planned.every((p) => foliageField.slopeAt(p.x, p.z) <= 0.6));
check('paint respects spacing within batch', planned.every((a, i) => planned.every((b, j) => (
  i === j || (a.x - b.x) ** 2 + (a.z - b.z) ** 2 >= 1.5 * 1.5 - 1e-6
))));
const plannedAgain = planFoliagePaint({
  field: foliageField,
  layer: fakeLayer,
  x: 0,
  z: 0,
  radius: 10,
  density: 0.3,
  waterLevel: -0.5,
  seed: 7,
});
check('paint planning deterministic', JSON.stringify(planned) === JSON.stringify(plannedAgain));

// --- 7. Document round-trip ---------------------------------------------------

console.log('document');
const documentField = createLandscapeField({ tilesX: 2, tilesZ: 2, quadsPerTile: 32 });
const documentStroke = beginStroke(documentField);
applyBrushSample(documentField, documentStroke, { tool: 'raise', x: 0, z: 0, radius: 6, strength: 3 });
commitStroke(documentField, documentStroke);
const documentHoleStroke = holeStrokeBegin(documentField);
holeSample(documentField, documentHoleStroke, { x: 4, z: 4, radius: 2 });
holeStrokeCommit(documentField, documentHoleStroke);
const documentWaterStroke = waterStrokeBegin(documentField);
waterSample(documentField, documentWaterStroke, { x: -6, z: 6, radius: 2 });
waterStrokeCommit(documentField, documentWaterStroke);
const instances = new Float32Array(2 * FOLIAGE_INSTANCE_STRIDE);
instances.set([1, 0.5, 2, 0.3, 1.1, -3, 0.2, 4, 1.2, 0.9]);
// A v2 layer: one tilted instance (quaternion) at stride 9.
const tiltedInstances = new Float32Array([5, 2, 5, 0.1, 1, 0, 0, 1, 0]);
const documentObject = await createLandscapeProjectDocument({
  label: 'Verify project',
  settings: { brushRadius: 12 },
  materialLayers: [
    { textureRef: { kind: 'texgen', presetId: 'cliff-rock' }, repeat: 0.5 },
    null,
    { textureRef: { kind: 'data-url', dataUrl: 'data:image/png;base64,AAA=' }, repeat: 0.2 },
  ],
  field: documentField,
  foliage: {
    palette: [{
      id: 'builtin-tree-green',
      label: 'Leafy Tree',
      source: { kind: 'builtin', builtinId: 'tree-green' },
      rules: { minSpacing: 2 },
      density: 0.1,
    }],
    layers: [
      { paletteId: 'builtin-tree-green', instances },
      { paletteId: 'builtin-rock-granite', stride: 9, instances: tiltedInstances },
    ],
  },
});
check('document type/version', documentObject.type === LANDSCAPE_PROJECT_DOCUMENT_TYPE
  && documentObject.version === 1);
const parsed = await parseLandscapeProjectDocument(JSON.stringify(documentObject));
check('document parses', parsed.ok, parsed.errors?.join('; '));
if (parsed.ok) {
  check('heights round-trip byte-identical',
    sha256(parsed.value.field.heights) === sha256(documentField.heights));
  check('splat round-trips byte-identical',
    sha256(parsed.value.field.splat) === sha256(documentField.splat));
  check('settings round-trip', parsed.value.settings.brushRadius === 12);
  check('foliage instances round-trip',
    parsed.value.foliage.layers.length === 2
    && sha256(parsed.value.foliage.layers[0].instances) === sha256(instances));
  check('v2 stride + tilt round-trips',
    parsed.value.foliage.layers[1].stride === 9
    && sha256(parsed.value.foliage.layers[1].instances) === sha256(tiltedInstances));
  check('holes round-trip', parsed.value.field.isHole(4, 4) === true
    && parsed.value.field.isHole(-4, -4) === false
    && sha256(parsed.value.field.holes) === sha256(documentField.holes));
  check('dry zones round-trip', parsed.value.field.isDry(-6, 6) === true
    && parsed.value.field.isDry(4, -4) === false
    && sha256(parsed.value.field.water) === sha256(documentField.water));
  check('palette round-trips', parsed.value.foliage.palette[0]?.source?.builtinId === 'tree-green');
  check('material layers round-trip',
    parsed.value.materialLayers.length === 4
    && parsed.value.materialLayers[0].textureRef?.presetId === 'cliff-rock'
    && parsed.value.materialLayers[0].repeat === 0.5
    && parsed.value.materialLayers[1].textureRef === null
    && parsed.value.materialLayers[2].textureRef?.kind === 'data-url',
    JSON.stringify(parsed.value.materialLayers));
}
const badType = await parseLandscapeProjectDocument(JSON.stringify({ type: 'toonlab/water-preset' }));
check('wrong document type rejected', badType.ok === false);
const badJson = await parseLandscapeProjectDocument('{nope');
check('invalid JSON rejected', badJson.ok === false);

// --- 8. Material preset + package boundary -----------------------------------

console.log('material preset / package boundary');
const { createLandscapeMaterialPresetDocument, parseLandscapeMaterialPresetDocument } = await import('../src/landscape/landscapeMaterialPreset.js');
const materialPreset = createLandscapeMaterialPresetDocument('verify_material', {
  label: 'Verify material',
  settings: { grassTint: [0.1, 0.9, 0.2], macroNoiseAmount: 0.4, brushRadius: 33 },
  materialLayers: [{ textureRef: { kind: 'texgen', presetId: 'cliff-rock' }, repeat: 0.4 }],
});
check('material preset strips non-style settings',
  materialPreset.settings.grassTint[1] === 0.9 && materialPreset.settings.brushRadius === undefined);
const parsedMaterial = parseLandscapeMaterialPresetDocument(JSON.stringify(materialPreset));
check('material preset round-trips', parsedMaterial.ok
  && parsedMaterial.value.materialLayers[0].textureRef.presetId === 'cliff-rock');
const { STYLE_BUNDLE_SLOTS } = await import('../src/styles/styleBundle.js');
const slot = STYLE_BUNDLE_SLOTS.landscapeMaterial;
check('pre-beta landscape material is absent from the public style bundle', slot === undefined);

// --- swept tunnels -----------------------------------------------------------

{
  const tunnelField = createLandscapeField({ tilesX: 1, tilesZ: 1, quadsPerTile: 32, spacing: 0.5 });
  // A ridge across the middle (along X), high enough to bore through.
  for (let gz = 0; gz < tunnelField.gridD; gz += 1) {
    for (let gx = 0; gx < tunnelField.gridW; gx += 1) {
      const wz = tunnelField.origin.z + gz * tunnelField.spacing;
      tunnelField.heights[gz * tunnelField.gridW + gx] = Math.max(0, 10 - Math.abs(wz) * 2.2);
    }
  }
  const profile = tunnelProfilePreset('arch', 5, 4);
  const bounds = profile.reduce((acc, [u, v]) => ({
    minU: Math.min(acc.minU, u), maxU: Math.max(acc.maxU, u),
    minV: Math.min(acc.minV, v), maxV: Math.max(acc.maxV, v),
  }), { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity });
  check('tunnel: arch preset spans width x height with floor at 0',
    Math.abs(bounds.maxU - bounds.minU - 5) < 0.01 && Math.abs(bounds.minV) < 0.01
    && Math.abs(bounds.maxV - 4) < 0.01);

  const doodled = normalizeTunnelProfile(
    [[0, 0], [4, 1], [5, 6], [0, 9], [-5, 6], [-4, 1]], 6, 4);
  const doodleBounds = doodled.reduce((acc, [u, v]) => ({
    minU: Math.min(acc.minU, u), maxU: Math.max(acc.maxU, u),
    minV: Math.min(acc.minV, v), maxV: Math.max(acc.maxV, v),
  }), { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity });
  check('tunnel: doodle normalizes to width x height, floor at 0',
    Math.abs(doodleBounds.maxU - doodleBounds.minU - 6) < 0.01
    && Math.abs(doodleBounds.minV) < 0.01 && Math.abs(doodleBounds.maxV - 4) < 0.01);

  const a = { x: 0, y: 0, z: -5.5 };
  const b = { x: 0, y: 0, z: 5.5 };
  const through = buildTunnelPath({ a, b });
  check('tunnel: through path is open at both ends (lips extend past clicks)',
    through.endOpen && through.path.length > 4
    && through.path[0][2] < -5.5 && through.path[through.path.length - 1][2] > 5.5);
  const deadEnd = buildTunnelPath({ a, b, stopAt: 0.5 });
  check('tunnel: stopAt truncates into a dead-end',
    !deadEnd.endOpen
    && deadEnd.path[deadEnd.path.length - 1][2] < 0.6);

  const tunnel = createTunnel({ profile, path: through.path, endOpen: through.endOpen });
  const plan = planTunnelBore(tunnelField, tunnel);
  check('tunnel: portals punched where the tube crosses the surface', plan.holeQuads.length > 0);
  // The crest sits ABOVE the tube (terrain 10 > ceiling 4) — it must stay solid.
  const crestQuad = Math.floor(tunnelField.splatD / 2) * tunnelField.splatW + Math.floor(tunnelField.splatW / 2);
  check('tunnel: terrain above the bore stays intact (no column punching)',
    !plan.holeQuads.includes(crestQuad));
  // Flat ground far from the hill is below the tube floor — untouched.
  const flatQuad = 2 * tunnelField.splatW + 2;
  check('tunnel: flat ground outside the hill is untouched',
    !plan.holeQuads.includes(flatQuad));

  const planAgain = planTunnelBore(tunnelField, tunnel);
  check('tunnel: planning is deterministic',
    Array.from(planAgain.holeQuads).join(',') === Array.from(plan.holeQuads).join(','));

  const roundTrip = deserializeTunnel(JSON.parse(JSON.stringify(serializeTunnel(tunnel))));
  check('tunnel: serialize round-trips',
    roundTrip.id === tunnel.id && roundTrip.endOpen === tunnel.endOpen
    && JSON.stringify(roundTrip.profile) === JSON.stringify(tunnel.profile)
    && JSON.stringify(roundTrip.path) === JSON.stringify(tunnel.path));
  check('tunnel: bad payloads rejected',
    deserializeTunnel({ profile: [[0, 0]], path: [] }) === null
    && deserializeTunnel({ profile: [[0, 0], [1, 0], [NaN, 1]], path: [[0, 0, 0], [1, 0, 0]] }) === null);

  const geometries = buildTunnelGeometries(tunnelField, tunnel);
  check('tunnel: sweep builds floor + wall geometry',
    geometries.floor.getAttribute('position').count > 0
    && geometries.walls.getAttribute('position').count > 0);
  const capped = createTunnel({ profile, path: deadEnd.path, endOpen: deadEnd.endOpen });
  const cappedGeometries = buildTunnelGeometries(tunnelField, capped);
  check('tunnel: dead-end gains a back wall',
    cappedGeometries.walls.getAttribute('position').count
    > buildTunnelGeometries(tunnelField, { ...capped, endOpen: true }).walls.getAttribute('position').count);
}

// -----------------------------------------------------------------------------

if (failures) {
  console.error(`\nverify-landscape: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nverify-landscape: all checks passed');
