// Gate 1 tree review — Stillwater Garden maple, pine and clipped azalea.
//
//   /tree-gate1/?view=family&family=GDN-MAPLE-HERO
//   /tree-gate1/?view=hero&asset=GDN-MAPLE-HERO-V1
//   /tree-gate1/?view=detail&asset=GDN-PINE-MASS-V1     85 mm close read
//   /tree-gate1/?view=trunk&asset=GDN-PINE-MASS-V1      bark at 85 mm
//   /tree-gate1/?view=contact&asset=GDN-MAPLE-HERO-V1   root collar / ground
//   /tree-gate1/?view=stand                             every variant, one frame
//   /tree-gate1/?view=swatch                            bark tiles + leaf sprites
//   ...&shader=neutral                                  A/B the vegetation shader
//
// Automation contract (the capture script asserts these, do not rename):
//   document.body.dataset.modelReady — 'true' once every plant is placed
//   document.body.dataset.treeReport — JSON summary of what was built

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createBranchTree } from '../../src/vegetation/branchTree.js';
import { StylizedBush } from '../../src/vegetation/stylizedBush.js';
import {
  createLeafSpriteTexture,
  traceLeafShapePath,
} from '../../src/vegetation/stylizedTreeFoliage.js';
import { createTreeSurfaceTexture } from '../../src/vegetation/treeSurfaceTextures.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import {
  GARDEN_SHRUBS,
  GARDEN_TREES,
  GARDEN_VEGETATION_SHADER,
} from '../shared/stillwaterGardenTrees.js';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'stand';
const shader = params.get('shader') === 'neutral' ? 'neutral' : 'call_me_sensei';
const assetId = params.get('asset');
const familyId = params.get('family');
// The garden's assembly profile, which overrides two shipped preset values —
// see GARDEN_VEGETATION_SHADER. `?scs=<n>` re-forces foliage.styleColorStrength
// for the A/B that established the value (1 = the shipped preset).
//
// `?fill=<n>` re-forces lighting.skyFillStrength, which is the vegetation
// family's actual shadow-lift. There is no `shadowFill` on this path:
// BranchTree's canopy and bark are bare NodeMaterials that light themselves
// from their own sun/sky uniforms and never install the ToonLab surface
// lighting model, so the installer's `shadowFill` option cannot reach a
// plant. See D19-142.
const vegetationProfile = (params.has('scs') || params.has('fill'))
  ? {
    ...GARDEN_VEGETATION_SHADER,
    settings: {
      ...GARDEN_VEGETATION_SHADER.settings,
      ...(params.has('scs')
        ? { foliage: { styleColorStrength: Number(params.get('scs')) } }
        : {}),
      ...(params.has('fill')
        ? {
          lighting: {
            ...GARDEN_VEGETATION_SHADER.settings.lighting,
            skyFillStrength: Number(params.get('fill')),
          },
        }
        : {}),
    },
  }
  : GARDEN_VEGETATION_SHADER;
document.body.dataset.hud = String(params.get('hud') !== '0');

const stage = document.getElementById('stage');
const renderer = createLabRenderer({ alpha: false, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fb9d4');
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Deterministic key light.
//
// `gate1` (the default) matches the rock Gate 1 rig so the two reviews stay
// directly comparable, and it is the rig every capture before this pass was
// judged under. It is NOT a hero rig: it sits at -X +Z while the hero and
// detail cameras sit at +X +Z, so the half of the crown facing the lens is
// the half in shadow. Roughly 60% of the visible canopy in a hero frame is
// the shade band, which is most of why "shadow sides are crushed" was read as
// an asset defect — it is at least as much a framing choice.
//
// `front` is the three-quarter front key a hero product shot actually uses:
// same elevation and the same warm/cool split, moved to the camera's side.
// Judge the shade treatment on this one, and the silhouette on either.
//
//   ?key=front
const KEYS = {
  front: [13, 20, 17],
  gate1: [-16, 21, 13],
};
const keyId = KEYS[params.get('key')] ? params.get('key') : 'gate1';
const sun = new THREE.DirectionalLight('#fff2d4', 2.7);
sun.position.set(...KEYS[keyId]);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -6;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(new THREE.HemisphereLight('#dff1ff', '#6d7f66', 1.05));

// A plain matte receiver, deliberately not the ToonLab ground shader, so the
// only thing under review is the plant.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: '#9aa07f', roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

await whenRendererReady(renderer);

// The vegetation shaders light themselves from their OWN sun uniforms — they
// do not read the scene's lights. Skipping setSun leaves every plant lit from
// the module default (0.35, 0.72, 0.42) while the scene is lit from the
// opposite side in X, so limbs the renderer lights are simultaneously in the
// shader's darkest band and render near black. Any review done without this
// call is judging the wrong picture.
const SUN_DIRECTION = sun.position.clone().normalize();
function lightPlant(plant) {
  plant.setSun?.({
    direction: [SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z],
    color: [1, 0.949, 0.831],
    intensity: 1,
    sky: [0.875, 0.945, 1],
    skyIntensity: 0.42,
  });
}

const report = { built: [], key: keyId, shader, view };

function buildTree(entry, x = 0) {
  const tree = createBranchTree(entry.settings);
  if (shader !== 'neutral') tree.setVegetationShader(vegetationProfile);
  lightPlant(tree);
  tree.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(tree);
  const scale = entry.targetHeightMetres / bounds.max.y;
  tree.scale.multiplyScalar(scale);
  tree.position.set(x, 0, 0);
  scene.add(tree);
  tree.updateMatrixWorld(true);
  const placed = new THREE.Box3().setFromObject(tree);
  report.built.push({
    id: entry.id,
    instanceScale: Number(scale.toFixed(4)),
    placedHeight: Number(placed.max.y.toFixed(3)),
    buryDepth: Number((-placed.min.y).toFixed(3)),
    bark: tree.trunkMesh?.material?.map?.name ?? null,
    leafShape: entry.settings.leaves.shape,
    leafMap: tree.canopyMesh?.material?.uniforms?.uLeafMap?.value?.name ?? tree.canopyMesh?.material?.map?.name ?? null,
    x,
  });
  return { object: tree, height: placed.max.y };
}

function buildShrub(entry, x = 0) {
  const { seed, size, canopyColor, width, depth, flatten, leafDensity, canopyLayout, canopy } = entry.settings;
  const bush = new StylizedBush({
    seed, size, canopyColor, width, depth, flatten, leafDensity, canopyLayout, canopy,
  });
  if (shader !== 'neutral') bush.setVegetationShader?.(vegetationProfile);
  lightPlant(bush);
  bush.position.set(x, 0, 0);
  scene.add(bush);
  bush.updateMatrixWorld(true);
  const placed = new THREE.Box3().setFromObject(bush);
  report.built.push({
    id: entry.id,
    instanceScale: 1,
    placedHeight: Number(placed.max.y.toFixed(3)),
    engine: 'stylized-bush',
    x,
  });
  return { object: bush, height: placed.max.y };
}

// Flat swatch board: the two new bark tiles at 1:1, beside the leaf sprites.
// A bark generator that only ever gets reviewed wrapped around a trunk hides
// its tiling seams and its value range.
function buildSwatches() {
  const barks = ['maple-striated-v1', 'pine-plated-v1', 'oak-fissured-v1', 'beech-smooth-v1'];
  barks.forEach((profileId, index) => {
    const map = createTreeSurfaceTexture({ profileId, seed: 2801 });
    map.repeat.set(1, 1);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 2.2),
      new THREE.MeshBasicMaterial({ map }),
    );
    panel.position.set(-2.6 + index * 1.35, 2.4, 0);
    scene.add(panel);
    report.built.push({ id: profileId, kind: 'bark-swatch' });
  });
  const shapes = ['palmate', 'needle-fascicle', 'maple', 'oak'];
  shapes.forEach((shape, index) => {
    const map = createLeafSpriteTexture({ shape, seed: 7, size: 512 });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ alphaMap: map, transparent: true, color: '#1e3a1a' }),
    );
    panel.position.set(-2.6 + index * 1.35, 0.75, 0);
    scene.add(panel);
    report.built.push({ id: shape, kind: 'leaf-sprite' });

    // The single organ outline at 1:1, so the silhouette itself is reviewable
    // and not only its packed cluster.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.translate(128, 128);
    ctx.fillStyle = '#ffffff';
    traceLeafShapePath(ctx, shape, 236, 236);
    ctx.fill();
    const outline = new THREE.CanvasTexture(canvas);
    const organ = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshBasicMaterial({ alphaMap: outline, transparent: true, color: '#1a2b16' }),
    );
    organ.position.set(-2.6 + index * 1.35, -0.55, 0);
    scene.add(organ);
  });
}

let focusHeight = 4;
if (view === 'swatch') {
  buildSwatches();
  ground.visible = false;
  scene.background = new THREE.Color('#cfd8de');
  focusHeight = 1.2;
} else {
  const pool = assetId
    ? [...GARDEN_TREES, ...GARDEN_SHRUBS].filter((entry) => entry.id === assetId)
    : familyId
      ? [...GARDEN_TREES, ...GARDEN_SHRUBS].filter((entry) => entry.family === familyId)
      : view === 'stand'
        ? [...GARDEN_TREES, ...GARDEN_SHRUBS]
        : GARDEN_TREES;
  if (!pool.length) throw new Error(`Nothing matches asset="${assetId}" family="${familyId}"`);

  // Space instances by their own crown width so nothing merges in frame.
  let cursor = 0;
  const placedHeights = [];
  pool.forEach((entry, index) => {
    const gap = entry.family === 'GDN-PINE-MASS' ? 11
      : entry.family === 'GDN-MAPLE-HERO' ? 7.5
        : 2.2;
    const x = pool.length === 1 ? 0 : cursor;
    cursor += gap;
    const built = entry.engine === 'stylized-bush' ? buildShrub(entry, x) : buildTree(entry, x);
    placedHeights.push(built.height);
    void index;
  });
  focusHeight = Math.max(...placedHeights);
  // Recentre the row on the origin.
  if (pool.length > 1) {
    const span = cursor - (pool[pool.length - 1].family === 'GDN-PINE-MASS' ? 11 : 2.2);
    scene.children.forEach((child) => {
      if (child === ground || child.isLight) return;
      child.position.x -= span / 2;
    });
  }
}

const VIEWS = {
  // Every variant in one frame — the "do these read as distinct trees" test.
  stand: () => ({ position: [0, focusHeight * 0.8, 46], target: [0, focusHeight * 0.4, 0], fov: 40 }),
  // One family, one frame.
  family: () => ({ position: [1.5, focusHeight * 0.8, 22], target: [0, focusHeight * 0.45, 0], fov: 38 }),
  // Single plant, three-quarter hero at full height.
  hero: () => ({
    position: [focusHeight * 0.9, focusHeight * 0.66, focusHeight * 2.15],
    target: [0, focusHeight * 0.48, 0],
    fov: 36,
  }),
  // 85 mm on a full-frame sensor is a 24 deg horizontal field. This is the
  // shot the launch video actually uses on the maple, so it is the shot the
  // foliage has to survive.
  detail: () => ({
    position: [focusHeight * 0.5, focusHeight * 0.62, focusHeight * 1.5],
    target: [0, focusHeight * 0.55, 0],
    fov: 24,
  }),
  // Bark at 85 mm. These crowns skirt low — the pine's lowest pads sit about
  // a metre off the ground — so a trunk camera pulled back to a comfortable
  // distance ends up INSIDE the canopy and photographs leaves. It has to work
  // from under the skirt, close and low.
  trunk: () => ({
    // Framed from the SUN side, whichever key is active. The +X framing this
    // shot started on photographed the `gate1` key's shadow band and reported
    // a black cylinder for every bark profile in the library.
    position: [Math.sign(KEYS[keyId][0]) * 0.85, Math.min(1.4, focusHeight * 0.26), 1.35],
    target: [0, Math.min(1.15, focusHeight * 0.22), 0],
    fov: 26,
  }),
  // Ground contact: root collar seating into the surface, with its shadow.
  contact: () => ({
    position: [1.0, 0.42, 1.6],
    target: [0, 0.12, 0],
    fov: 30,
  }),
  // Looking up through the canopy — the foreground-occluder read of §2 band 1.
  under: () => ({
    position: [focusHeight * 0.22, focusHeight * 0.14, focusHeight * 0.5],
    target: [0, focusHeight * 0.8, 0],
    fov: 46,
  }),
  swatch: () => ({ position: [0, 0.9, 5.4], target: [0, 0.9, 0], fov: 40 }),
};
// The bark shot hides the canopy. These crowns skirt to within a metre of the
// ground and the pine's lowest pads sit directly over its trunk, so there is
// no camera position that frames bark at 85 mm from outside — every attempt
// photographs the inside of a foliage mass. Hiding the canopy is the honest
// bark review; the ground-contact shot below keeps the canopy on, so nothing
// about how the tree actually reads is being concealed.
// `?canopy=1` keeps it on. On the maple that is now a real shot rather than a
// wall of leaves: `cluster.crownBase` lifted the foliage skirt, so there is a
// camera that frames the trunk from OUTSIDE the crown. It is the honest proof
// of the crown-base lift and it belongs in the evidence beside the hidden-
// canopy bark read.
if (view === 'trunk' && params.get('canopy') !== '1') {
  scene.traverse((object) => {
    if (object.isMesh && object.material?.name === 'StylizedTreeFoliage') object.visible = false;
  });
}

const shot = (VIEWS[view] ?? VIEWS.stand)();
camera.fov = shot.fov ?? 38;
camera.position.set(...shot.position);
controls.target.set(...shot.target);
camera.updateProjectionMatrix();
controls.update();

const fields = document.getElementById('hudFields');
fields.innerHTML = [
  ['view', view], ['shader', shader], ['key', keyId],
  ...report.built.map((entry) => [
    entry.id,
    entry.kind ? entry.kind : `${entry.placedHeight} m · ×${entry.instanceScale} · ${entry.leafShape ?? entry.engine ?? ''}`,
  ]),
].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

function resize() {
  const width = stage.clientWidth || window.innerWidth;
  const height = stage.clientHeight || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  scene.traverse((object) => { if (object.isGroup && object.update) object.update(delta); });
  controls.update();
  renderer.render(scene, camera);
});

document.body.dataset.treeReport = JSON.stringify(report);
document.body.dataset.modelReady = 'true';
