// Authors and measures the Stillwater Garden trees and low planting.
//
//   node scripts/stillwater-garden-trees.mjs            measure + write
//   GARDEN_TREES_DRY=1 node scripts/stillwater-garden-trees.mjs   measure only
//
// Recipes live in labs/shared/stillwaterGardenTrees.js — the same module the
// review lab imports, so what is measured here is exactly what was reviewed.
// This script builds every variant headlessly, measures the geometry off the
// built BufferGeometry, compiles the LOD chain, checks for silent clamping and
// round-trips each portable document, then writes them to
// assets-local/launch-world/trees/.
//
// Spec: launch-plan/20-stillwater-garden-scene-brief.md
// Notes: launch-plan/review/tree-replacement-authoring.md

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// The leaf sprite is an alpha texture painted on a 2D canvas and never
// participates in geometry, so a no-op canvas is sufficient — and is what
// makes the whole pipeline measurable without a browser.
const STYLE_PROPERTIES = new Set([
  'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
  'globalAlpha', 'globalCompositeOperation', 'font', 'filter', 'textAlign',
  'textBaseline', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
  'imageSmoothingEnabled', 'lineDashOffset', 'direction',
]);
const noopContext = new Proxy({}, {
  get(_target, property) {
    if (property === 'canvas') return { height: 1, width: 1 };
    // Only the handful of style ACCESSORS are strings; everything else on a
    // 2D context is a method, including lineTo/lineWidth-adjacent drawing
    // calls, so match the accessors exactly rather than by prefix.
    if (STYLE_PROPERTIES.has(property)) return '';
    return () => {};
  },
  set() { return true; },
});
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        addEventListener() {},
        getContext: () => noopContext,
        height: 1,
        removeEventListener() {},
        toDataURL: () => 'data:image/png;base64,',
        width: 1,
      };
    },
    createElementNS(_namespace, tag) { return globalThis.document.createElement(tag); },
  };
}

const THREE = await import('three');
const {
  createBranchTree,
  createBranchTreeDocument,
  createBranchTreeRecipe,
  createBranchTreeSettings,
  parseBranchTreeDocument,
} = await import('../src/vegetation/branchTree.js');
const { compileTreeLodLevels } = await import('../src/vegetation/treeLodCompiler.js');
const { StylizedBush } = await import('../src/vegetation/stylizedBush.js');
const garden = await import('../labs/shared/stillwaterGardenTrees.js');

const outDir = new URL('../assets-local/launch-world/trees/', import.meta.url).pathname;
const dryRun = process.env.GARDEN_TREES_DRY === '1';

function triangles(geometry) {
  if (!geometry) return 0;
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  return count / 3;
}

function digest(tree) {
  const hash = createHash('sha256');
  for (const mesh of [tree.trunkMesh, tree.canopyMesh]) {
    const geometry = mesh?.geometry;
    if (!geometry) continue;
    hash.update(Buffer.from(geometry.attributes.position.array.buffer.slice(0)));
    if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer.slice(0)));
  }
  return hash.digest('hex');
}

/** Every authored scalar, compared against what the validator resolved. */
function clampReport(authored, resolved, path = '') {
  const clamps = [];
  for (const [key, value] of Object.entries(authored ?? {})) {
    const here = path ? `${path}.${key}` : key;
    const target = resolved?.[key];
    if (Array.isArray(value)) {
      // Colors are authored as sRGB hex and stored as fractions; ranges are
      // compared elementwise.
      if (Array.isArray(target) && value.every((v) => typeof v === 'number')) {
        value.forEach((v, i) => {
          if (Math.abs(v - target[i]) > 1e-9) clamps.push({ authored: v, path: `${here}[${i}]`, resolved: target[i] });
        });
      }
      continue;
    }
    if (value && typeof value === 'object') { clamps.push(...clampReport(value, target, here)); continue; }
    if (typeof value === 'string') continue;
    if (value !== target) clamps.push({ authored: value, path: here, resolved: target });
  }
  return clamps;
}

function measureTree(entry) {
  const settings = createBranchTreeSettings(entry.settings);
  const tree = createBranchTree(settings);
  tree.updateMatrixWorld(true);

  const trunkGeometry = tree.trunkMesh?.geometry ?? null;
  const canopyGeometry = tree.canopyMesh?.geometry ?? null;
  const woodTriangles = triangles(trunkGeometry);
  const leafTriangles = triangles(canopyGeometry);
  const leafCards = canopyGeometry ? canopyGeometry.attributes.position.count / 4 : 0;

  const bounds = new THREE.Box3().setFromObject(tree);
  const recipeHeight = bounds.max.y;
  const instanceScale = entry.targetHeightMetres / recipeHeight;
  const buryDepth = Math.max(0, -bounds.min.y) * instanceScale;

  // Crown extent and lean are read off the leaf-card centres in world space.
  const crownBox = new THREE.Box3();
  const centroid = new THREE.Vector3();
  let cards = 0;
  const pads = new Set();
  if (canopyGeometry) {
    const position = canopyGeometry.attributes.position;
    const attachment = canopyGeometry.attributes.aAttachment;
    const world = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 4) {
      world.fromBufferAttribute(position, i).applyMatrix4(tree.canopyMesh.matrixWorld);
      crownBox.expandByPoint(world);
      centroid.add(world);
      cards += 1;
      if (attachment) pads.add(attachment.getX(i));
    }
    centroid.divideScalar(Math.max(cards, 1));
    pads.delete(-1);
  }
  const crownWidth = crownBox.isEmpty()
    ? 0
    : Math.max(crownBox.max.x - crownBox.min.x, crownBox.max.z - crownBox.min.z) * instanceScale;

  let cardEdge = 0;
  const info = canopyGeometry?.attributes?.aInfo;
  if (info) {
    let sum = 0;
    for (let i = 0; i < info.count; i += 4) sum += info.getX(i);
    cardEdge = (sum / Math.max(info.count / 4, 1)) * settings.size * instanceScale;
  }

  const lean = Math.hypot(centroid.x, centroid.z) * instanceScale;

  // Stand bearing is measured off the TRUNK APEX, not off the crown centroid.
  // The centroid is the obvious metric and it is the wrong one as soon as pad
  // pruning is in play: a sparse, farthest-point-sampled subset of tips moves
  // the crown's centre of mass around by tens of degrees for reasons that have
  // nothing to do with which way the trunk bows. The apex displacement is what
  // `trunk.bendDirection` and `trunk.lean` actually control, so it is what a
  // coherently shaped stand has to agree on.
  const apex = new THREE.Vector3();
  if (trunkGeometry) {
    const position = trunkGeometry.attributes.position;
    let top = -Infinity;
    for (let i = 0; i < position.count; i += 1) top = Math.max(top, position.getY(i));
    const band = top * 0.92;
    let counted = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (position.getY(i) < band) continue;
      apex.x += position.getX(i);
      apex.z += position.getZ(i);
      counted += 1;
    }
    if (counted) { apex.x /= counted; apex.z /= counted; }
  }
  const leanAzimuth = (THREE.MathUtils.radToDeg(Math.atan2(apex.x, apex.z)) + 360) % 360;
  const apexOffset = Math.hypot(apex.x, apex.z) * settings.size * instanceScale;

  const compiled = compileTreeLodLevels(createBranchTreeRecipe(settings, {
    id: entry.id,
    label: entry.label,
  }));
  const lod = compiled.report.levels.map((level) => ({
    cap: level.triangleCap,
    level: level.level,
    materials: level.materials,
    minScreenCoverage: level.minScreenCoverage,
    triangles: level.triangles,
  }));
  const lodValid = compiled.report.valid;
  compiled.dispose?.();

  // Round trip: serialize, re-parse, rebuild, compare geometry byte for byte.
  const document = createBranchTreeDocument(settings);
  const parsed = parseBranchTreeDocument(JSON.stringify(document));
  const roundTrip = parsed.ok
    && digest(createBranchTree(parsed.value.settings)) === digest(tree);

  return {
    clamps: clampReport(entry.settings, settings),
    document,
    measured: {
      branchAttachments: pads.size,
      buryDepthMetres: Number(buryDepth.toFixed(3)),
      cardsPerMetreOfPlacedHeight: Math.round(leafCards / entry.targetHeightMetres),
      crownLeanMetres: Number(lean.toFixed(3)),
      trunkApexOffsetMetres: Number(apexOffset.toFixed(3)),
      crownLeanPercentOfHeight: Number((lean / entry.targetHeightMetres * 100).toFixed(1)),
      crownWidthMetres: Number(crownWidth.toFixed(3)),
      leafCardEdgeMetres: Number(cardEdge.toFixed(3)),
      leafCards,
      leafTriangles,
      lod,
      lodReportValid: lodValid,
      measuredTrunkApexAzimuthDegrees: Number(leanAzimuth.toFixed(1)),
      placedHeightMetres: entry.targetHeightMetres,
      recipeHeightMetres: Number(recipeHeight.toFixed(3)),
      totalTriangles: woodTriangles + leafTriangles,
      woodTriangles,
    },
    castsShadow: Boolean(tree.trunkMesh?.castShadow && tree.canopyMesh?.castShadow),
    barkProfile: tree.trunkMesh?.material?.map?.userData?.profileId
      ?? tree.trunkMesh?.material?.map?.name
      ?? null,
    instanceScale: Number(instanceScale.toFixed(4)),
    roundTrip,
  };
}

function measureShrub(entry) {
  const bush = new StylizedBush({ ...entry.settings });
  bush.updateMatrixWorld(true);
  const canopyGeometry = bush.canopyMesh?.geometry ?? null;
  const leafTriangles = triangles(canopyGeometry);
  const leafCards = canopyGeometry ? canopyGeometry.attributes.position.count / 4 : 0;
  const bounds = new THREE.Box3().setFromObject(bush);
  const height = bounds.max.y;
  const width = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
  return {
    measured: {
      cardsPerMetreOfPlacedHeight: Math.round(leafCards / Math.max(height, 1e-6)),
      leafCards,
      placedHeightMetres: Number(height.toFixed(3)),
      totalTriangles: leafTriangles,
      widthMetres: Number(width.toFixed(3)),
    },
  };
}

const rows = [];
const written = [];

for (const entry of garden.GARDEN_TREES) {
  const result = measureTree(entry);
  const { measured } = result;
  rows.push([
    entry.id,
    `${measured.recipeHeightMetres.toFixed(2)}m`,
    `x${result.instanceScale}`,
    `${measured.placedHeightMetres}m`,
    `W${measured.crownWidthMetres.toFixed(2)}`,
    `pads ${measured.branchAttachments}`,
    `wood ${measured.woodTriangles}`,
    `cards ${measured.leafCards}`,
    `tris ${measured.totalTriangles}`,
    `c/m ${measured.cardsPerMetreOfPlacedHeight}`,
    `card ${measured.leafCardEdgeMetres}m`,
    `lean ${measured.crownLeanPercentOfHeight}%`,
    `apex ${measured.trunkApexOffsetMetres}m @ ${measured.measuredTrunkApexAzimuthDegrees}deg`,
    `lod ${measured.lodReportValid}`,
    `clamps ${result.clamps.length}`,
    `rt ${result.roundTrip}`,
  ].join('  '));

  const payload = {
    ...result.document,
    id: entry.id,
    label: entry.label,
    launchWorld: {
      spec: 'launch-plan/20-stillwater-garden-scene-brief.md',
      family: entry.family,
      species: entry.species,
      variant: entry.variant,
      silhouette: entry.silhouette,
      slot: entry.slot,
      slotLabel: entry.slotLabel,
      seedRule: entry.seedRule,
      architecture: { engine: 'branch-tree', id: 'branch-tree', version: 1 },
      assembly: {
        applyWith: 'tree.setVegetationShader(GARDEN_VEGETATION_SHADER)',
        barkProfile: result.barkProfile,
        buryDepthMetres: result.measured.buryDepthMetres,
        collision: 'scene-assembly obligation; not a recipe field',
        instanceScale: result.instanceScale,
        lodWith: 'compileTreeLodLevels(createBranchTreeRecipe(settings))',
        shadows: 'automatic: castShadow on trunk + canopy, customDepthMaterial for alpha-correct leaf shadows',
        shapingBearingDegrees: garden.GARDEN_SHAPING_BEARING_DEGREES,
        // Yaw this instance by `instanceYawDegrees` so the stand centres on
        // the scene's shaping bearing, then add a +/-12 deg per-instance
        // jitter for variety. The bow heading is shared and authored in the
        // recipe, but at this gnarl it does not map to a predictable apex
        // bearing (D19-131), so the correction is measured per build instead
        // of guessed at authoring time.
        instanceYawDegrees: Number((
          ((garden.GARDEN_SHAPING_BEARING_DEGREES
            - result.measured.measuredTrunkApexAzimuthDegrees) % 360 + 540) % 360 - 180
        ).toFixed(1)),
        instanceYawJitterDegrees: 12,
        // Not `{ preset: 'call_me_sensei' }`. See GARDEN_VEGETATION_SHADER and
        // D19-128 / D19-129: the shipped preset replaces the authored canopy
        // palette and crushes bare limb to black.
        sun: 'REQUIRED: call plant.setSun({ direction, color, intensity, sky, skyIntensity }) with the host sun. The vegetation shaders light from their own uniforms and do not read scene lights (D19-130).',
        targetHeightMetres: entry.targetHeightMetres,
        vegetationShader: garden.GARDEN_VEGETATION_SHADER,
        wind: 'host-driven: foliage uniforms uTime / uWindDirection / uWindSpeed / uWindStrength',
      },
      measured: result.measured,
      verification: {
        castsShadow: result.castsShadow,
        clamps: result.clamps,
        roundTripIdentical: result.roundTrip,
      },
    },
  };
  written.push([`${entry.id}.json`, payload]);
}

for (const entry of garden.GARDEN_SHRUBS) {
  const result = measureShrub(entry);
  rows.push([
    entry.id,
    `${result.measured.placedHeightMetres}m`,
    `W${result.measured.widthMetres}`,
    `cards ${result.measured.leafCards}`,
    `tris ${result.measured.totalTriangles}`,
    `c/m ${result.measured.cardsPerMetreOfPlacedHeight}`,
  ].join('  '));
  written.push([`${entry.id}.json`, {
    type: 'toonlab/stylized-bush',
    version: 1,
    settings: entry.settings,
    id: entry.id,
    label: entry.label,
    launchWorld: {
      spec: 'launch-plan/20-stillwater-garden-scene-brief.md',
      family: entry.family,
      species: entry.species,
      variant: entry.variant,
      slot: entry.slot,
      slotLabel: entry.slotLabel,
      seedRule: entry.seedRule,
      architecture: { engine: 'stylized-bush', id: 'stylized-bush', version: 1 },
      assembly: {
        applyWith: 'bush.setVegetationShader(GARDEN_VEGETATION_SHADER)',
        buildWith: "new StylizedBush(settings) from '@call-me-sensei/toonlab/vegetation'",
        sun: 'REQUIRED: bush.setSun(...) — see the tree documents (D19-130)',
        targetHeightMetres: entry.targetHeightMetres,
        vegetationShader: garden.GARDEN_VEGETATION_SHADER,
      },
      measured: result.measured,
      // Why this is not a BranchTree: a clipped azalea is a solid rounded leaf
      // mass with no visible woody structure, and BranchTree hard-sets
      // leafPlacement 'tips' with no shell fill — foliage only at branch ends,
      // wood deliberately on show between. That property is exactly what makes
      // its pine pads and maple tiers work and exactly what a sheared mass must
      // not have. StylizedBush is the same first-party canopy with the skeleton
      // removed: same seeding, same leaf cards, same shader and wind contract.
      engineRationale: 'StylizedBush, not BranchTree — see the note in labs/shared/stillwaterGardenTrees.js',
    },
  }]);
}

console.log(rows.join('\n'));

const bearings = garden.GARDEN_PINES.map((entry) => {
  const built = measureTree(entry);
  return built.measured.measuredTrunkApexAzimuthDegrees;
});
const meanBearing = bearings.reduce((sum, value) => sum + value, 0) / bearings.length;
console.log(
  `\npine stand bearing: authored ${garden.GARDEN_SHAPING_BEARING_DEGREES}deg, `
  + `measured mean ${meanBearing.toFixed(1)}deg (${bearings.map((b) => b.toFixed(1)).join(' / ')})`,
);

if (dryRun) {
  console.log('\ndry run — nothing written');
} else {
  await mkdir(outDir, { recursive: true });
  for (const [name, payload] of written) {
    await writeFile(`${outDir}${name}`, `${JSON.stringify(payload, null, 2)}\n`);
  }
  console.log(`\nwrote ${written.length} documents to ${outDir}`);
}
