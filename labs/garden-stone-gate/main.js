// Stillwater Garden stone review — the garden set under the garden's own rig.
//
//   /garden-stone-gate/?view=group&shader=call_me_sensei
//   /garden-stone-gate/?view=hero&asset=rock-0222
//   /garden-stone-gate/?view=group&family=cliff        A/B against the old set
//   /garden-stone-gate/?view=group&detail=0            A/B the geometry detail
//   /garden-stone-gate/?view=group&moss=0              A/B the moss
//   /garden-stone-gate/?view=detail&mossmode=legacy    A/B moss-as-tint
//
// Dev-only review route, not a shipped lab.
//
// Lighting is the garden's, not a studio rig: sun at 42 deg elevation / 128 deg
// azimuth (south-east, over the camera's right shoulder) with a warm shadow
// fill, per labs/launch-world/garden/scene.js. Stone is judged under the light
// it will actually ship under.
//
// Automation contract (capture script asserts these, do not rename):
//   document.body.dataset.modelReady  — 'true' once every stone is placed
//   document.body.dataset.rockReport  — JSON summary of what was applied

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { applyRockShader } from '../../src/rock-shader/rockShaderRuntime.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import {
  GARDEN_STONE_VALUE_GRADE,
  MOSS_ALBEDO_URL,
  STILLWATER_GARDEN_STONES,
  resolveGardenStoneSurface,
} from '../shared/stillwaterGardenStones.js';
import {
  AZURE_HEADLAND_ROCKS,
  resolveRockSurface,
} from '../shared/azureHeadlandRocks.js';

const params = new URLSearchParams(location.search);
const flag = (key, fallback) => (params.has(key) ? params.get(key) !== '0' : fallback);
const view = params.get('view') || 'group';
const shader = params.get('shader') === 'neutral' ? 'neutral' : 'call_me_sensei';
const assetId = params.get('asset');
const group = params.get('group');
const useCliffSet = params.get('family') === 'cliff';
const useMoss = flag('moss', true);
const useDetail = flag('detail', true);
// Preview of the recommended scene-side value grade. Off by default: the
// recommendation is the scene owner's to accept, and this lab must keep showing
// what the stone looks like as it is actually delivered.
const useGrade = params.get('grade') === '1';
// `legacy` reproduces moss exactly as the package shipped it: a colour mix with
// no roughness, no relief and no fringe. It is the A/B for the hero-moss work.
const mossMode = params.get('mossmode') === 'legacy' ? 'legacy' : 'hero';
/** Moss fields any URL may override, for per-term calibration and A/B. */
const MOSS_OVERRIDE_KEYS = [
  'band', 'colorPower', 'contact', 'coverage', 'cushion', 'damp', 'exposure',
  'formDriven', 'fringe', 'fringeScale', 'offset', 'patchContrast',
  'patchOctaves', 'patchScale', 'patchStrength', 'patternCeiling',
  'patternFloor', 'relief', 'roughness', 'sharpness', 'size',
];
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
scene.background = new THREE.Color('#9ec8e2');
const camera = new THREE.PerspectiveCamera(38, 1, 0.02, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// The garden's sun. Azimuth is clockwise from north with north at -Z, so
// 128 deg resolves south-east; 42 deg elevation is the authored height.
const SUN_ELEVATION_DEGREES = 42;
const SUN_AZIMUTH_DEGREES = 128;
const elevation = THREE.MathUtils.degToRad(SUN_ELEVATION_DEGREES);
const azimuth = THREE.MathUtils.degToRad(SUN_AZIMUTH_DEGREES);
const sunDirection = new THREE.Vector3(
  Math.cos(elevation) * Math.sin(azimuth),
  Math.sin(elevation),
  Math.cos(elevation) * -Math.cos(azimuth),
);
const sun = new THREE.DirectionalLight('#fff1cf', 2.6);
sun.position.copy(sunDirection).multiplyScalar(26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0006;
scene.add(sun);

// Stand-in for `installToonLabSurfaceLighting({ shadowFill: 0.35 })`. The
// garden keeps 35% of the sun term alive inside the shadow mask, warmly
// tinted, because the bounce it represents is off a sunlit gravel floor. A
// plain hemisphere at that strength and tint is the closest honest equivalent
// in a lab that does not install the full style runtime.
const SHADOW_FILL = 0.35;
const SHADOW_FILL_TINT = [1.16, 1.0, 0.86];
const fill = new THREE.HemisphereLight(
  new THREE.Color('#e8f2ff'),
  new THREE.Color(SHADOW_FILL_TINT[0] * 0.42, SHADOW_FILL_TINT[1] * 0.4, SHADOW_FILL_TINT[2] * 0.34),
  SHADOW_FILL * 2.6,
);
scene.add(fill);

// Moss bed rather than bare dirt: a set stone's base is where moss-on-stone
// and moss-on-ground have to agree, so the receiver is painted from the same
// palette the stones read from.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: '#5b6b45', roughness: 0.97 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const textureLoader = new THREE.TextureLoader();
function loadTexture(url, { srgb = false } = {}) {
  return new Promise((resolve, reject) => {
    textureLoader.load(url, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.flipY = false;
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, reject);
  });
}

await whenRendererReady(renderer);

const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2);
const loadGltf = (url) => new Promise((resolve, reject) => gltfLoader.load(url, resolve, undefined, reject));

// The A/B against what the scene ships today: the same three cliff assets at
// the same downscale the garden applied to reach set-stone size.
const CLIFF_COMPARATOR_SCALE = 0.28;
const source = useCliffSet ? AZURE_HEADLAND_ROCKS : STILLWATER_GARDEN_STONES;
let selected = source;
if (assetId) selected = source.filter((stone) => stone.id === assetId);
else if (group) selected = source.filter((stone) => stone.group === group);
if (selected.length === 0) throw new Error(`Nothing selected for asset="${assetId}" group="${group}"`);

const mossTexture = useMoss ? await loadTexture(MOSS_ALBEDO_URL, { srgb: true }) : null;
const detailCache = new Map();
const report = {
  detail: useDetail, family: useCliffSet ? 'cliff-corner' : 'garden', moss: useMoss,
  mossMode, shader, stones: [], sun: { azimuth: SUN_AZIMUTH_DEGREES, elevation: SUN_ELEVATION_DEGREES }, view,
};

// Lay the group out along the camera's x so the world-space triplanar
// projection samples a different region per stone, as it does in the scene.
const spacing = 2.35;
const offset = ((selected.length - 1) * spacing) / 2;

for (const [index, stone] of selected.entries()) {
  const placementScale = useCliffSet ? CLIFF_COMPARATOR_SCALE : 1;
  const surface = useCliffSet
    ? resolveRockSurface(stone, { moss: useMoss })
    : resolveGardenStoneSurface(stone, { moss: useMoss, scale: placementScale });

  const gltf = await loadGltf(stone.url);
  const root = gltf.scene;
  root.scale.setScalar(placementScale);

  const lodNodes = [];
  root.traverse((object) => { if (/_LOD\d$/.test(object.name)) lodNodes.push(object); });
  for (const node of lodNodes) node.visible = node.name.endsWith('_LOD0');

  const SRGB_SLOTS = new Set(['rock']);
  const textures = {};
  for (const [slot, url] of Object.entries(surface.textureUrls)) {
    if (!detailCache.has(url)) {
      detailCache.set(url, await loadTexture(url, { srgb: SRGB_SLOTS.has(slot) }));
    }
    textures[slot] = detailCache.get(url);
  }
  if (mossTexture) textures.moss = mossTexture;

  const mossSettings = { ...(surface.settings.moss ?? {}) };
  // Any moss field can be overridden from the query string, so calibration and
  // per-field A/B happen against the real runtime instead of by editing the
  // shared consumer and reloading. `?cushion=0&damp=0` isolates one term.
  for (const key of MOSS_OVERRIDE_KEYS) {
    if (params.has(key)) mossSettings[key] = Number(params.get(key));
  }
  if (mossMode === 'legacy' && mossSettings.enabled) {
    // Strip the hero response back to a pure colour mix — every field the
    // package added, back to its inert default, so the A/B shows exactly what
    // the capability buys and nothing else.
    mossSettings.roughness = -1;
    mossSettings.relief = 0;
    mossSettings.fringe = 0;
    mossSettings.formDriven = 0;
    mossSettings.multiply = 1.94;
    mossSettings.patternFloor = -1;
    mossSettings.patternCeiling = 1;
    mossSettings.damp = 0;
    mossSettings.exposure = 0;
    mossSettings.cushion = 0;
    mossSettings.contact = 0;
    delete mossSettings.lowColor;
    delete mossSettings.highColor;
  }

  const settings = shader === 'neutral'
    ? { preset: 'neutral' }
    : { preset: 'call_me_sensei', ...surface.settings, moss: mossSettings };

  // `?grade=1` previews the SCENE-SIDE value grade recommended to the garden
  // owner in launch-plan/review/garden-stone-value-grade.md. It is not applied
  // by default and it is NOT a preset edit: `projection` and `material` are
  // ordinary settings fields, and this is the same override a scene passes
  // alongside `preset: 'call_me_sensei'`. It lives here so the recommendation
  // ships with evidence instead of arithmetic.
  if (useGrade && shader !== 'neutral') {
    settings.projection = { ...(settings.projection ?? {}), ...GARDEN_STONE_VALUE_GRADE.projection };
    settings.material = { ...(settings.material ?? {}), ...GARDEN_STONE_VALUE_GRADE.material };
  }

  const applied = applyRockShader(root, settings, {
    detail: useDetail ? (surface.geometryDetail ?? { subdivisions: 2 }) : null,
    name: `ToonLab · ${stone.label}`,
    textures,
    variation: surface.variation ?? stone.variation,
  });

  const bounds = new THREE.Box3().setFromObject(root);
  const centre = bounds.getCenter(new THREE.Vector3());
  root.position.set(
    (selected.length > 1 ? (index * spacing) - offset : 0) - centre.x,
    // Settle the stone slightly into its bed. A garden stone is buried, never
    // set on the surface — a boulder resting exactly on the ground plane reads
    // as dropped rather than placed.
    -bounds.min.y - (bounds.max.y - bounds.min.y) * 0.06,
    -centre.z,
  );
  scene.add(root);

  report.stones.push({
    geometryDetail: applied.geometryDetail
      ? {
        triangles: applied.geometryDetail.triangles,
        trianglesBefore: applied.geometryDetail.trianglesBefore,
      }
      : null,
    id: stone.id,
    measured: stone.measured,
    mossCoverage: settings.moss?.multiply ?? null,
    profileId: stone.profileId,
    rejectedTextures: applied.rejectedTextures.map((entry) => `${entry.slot} ${entry.texture.resolution}`),
    role: stone.role,
    tint: settings.material?.tint ?? null,
    triangles: stone.triangles,
    use: stone.use,
  });
}

const span = Math.max(selected.length * spacing, 3);
const VIEWS = {
  // The compositional question: does this read as a deliberate stone group?
  group: { position: [span * 0.62, span * 0.36, span * 0.92], target: [0, 0.5, 0] },
  // Single stone, three-quarter hero at garden eye height.
  hero: { fov: 34, position: [2.5, 1.5, 3.0], target: [0, 0.55, 0] },
  // Close read — the framing that decides whether moss is a plant or a paint.
  // Pulled back from 1.15/0.92/1.45: at that distance a 1.6 m stone fills the
  // frame past its own silhouette, so the shot showed the interior of a moss
  // patch and nothing else. The boundary is the thing under review.
  detail: { fov: 26, position: [1.85, 1.25, 2.25], target: [0, 0.5, 0] },
  // Ground contact: does the stone sit IN the moss bed or on top of it?
  contact: { fov: 28, position: [1.9, 0.42, 2.3], target: [0, 0.24, 0] },
  // The judging lens. 85 mm on full frame is a 16.1 deg VERTICAL field
  // (2·atan(12/85)), and it is the framing the launch video shoots stone at —
  // long enough to compress the form and hold the moss boundary at a size where
  // a ragged edge is either present or conspicuously absent. Every look call in
  // this pass was made here, not on the wider `detail` view.
  lens85: { fov: 16.1, position: [3.1, 1.75, 3.75], target: [0, 0.5, 0] },
};
const shot = VIEWS[view] ?? VIEWS.group;
camera.fov = shot.fov ?? 38;
camera.position.set(...shot.position);
controls.target.set(...shot.target);
camera.updateProjectionMatrix();
controls.update();

const totalBefore = report.stones.reduce((a, s) => a + (s.geometryDetail?.trianglesBefore ?? s.triangles), 0);
const totalAfter = report.stones.reduce((a, s) => a + (s.geometryDetail?.triangles ?? s.triangles), 0);
const fields = document.getElementById('hudFields');
fields.innerHTML = [
  ['view', view],
  ['family', report.family],
  ['sun', `${SUN_ELEVATION_DEGREES}° elev · ${SUN_AZIMUTH_DEGREES}° SE`],
  ['moss', useMoss ? `on · ${mossMode}` : 'off'],
  ['detail', useDetail ? `on · ${totalBefore} → ${totalAfter} tris` : `off · ${totalBefore} tris`],
  ...report.stones.map((s) => [s.role ?? s.id, `${s.id} · ${s.profileId}`]),
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

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

report.triangles = { after: totalAfter, before: totalBefore };
document.body.dataset.rockReport = JSON.stringify(report);
document.body.dataset.modelReady = 'true';
