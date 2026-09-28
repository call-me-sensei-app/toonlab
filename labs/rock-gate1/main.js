// Gate 1 rock review — neutral and Call Me Sensei views of the §6.3 cliff set.
//
//   /rock-gate1/?view=trio&shader=call_me_sensei
//   /rock-gate1/?view=hero&asset=rock-0119&shader=neutral
//   /rock-gate1/?view=trio&normals=0        A/B the detail-normal fix
//   /rock-gate1/?view=trio&moss=0           A/B the moss authoring
//
// Automation contract (capture script asserts these, do not rename):
//   document.body.dataset.modelReady — 'true' once every rock is placed
//   document.body.dataset.rockReport — JSON summary of what was applied

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { applyRockShader } from '../../src/rock-shader/rockShaderRuntime.js';
import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import {
  AZURE_HEADLAND_ROCKS,
  FORMATION_NORMAL_FLATTEN,
  FORMATION_PROJECTION_SCALE,
  MOSS_ALBEDO_URL,
  resolveRockSurface,
} from '../shared/azureHeadlandRocks.js';

const params = new URLSearchParams(location.search);
const flag = (key, fallback) => (params.has(key) ? params.get(key) !== '0' : fallback);
const view = params.get('view') || 'trio';
const shader = params.get('shader') === 'neutral' ? 'neutral' : 'call_me_sensei';
const assetId = params.get('asset');
const useNormals = flag('normals', true);
const useMoss = flag('moss', true);
const harmonize = flag('harmonize', true);
const projectionScale = Number(params.get('pscale')) || FORMATION_PROJECTION_SCALE;
const normalFlatten = params.has('nflat') ? Number(params.get('nflat')) : FORMATION_NORMAL_FLATTEN;
const useDetail = flag('detail', true);
const detailSubdivisions = params.has('subdiv') ? Number(params.get('subdiv')) : 2;
const detailAmount = params.has('damp') ? Number(params.get('damp')) : undefined;
const detailScale = params.has('dscale') ? Number(params.get('dscale')) : undefined;
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
scene.background = new THREE.Color('#87b6d6');
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 2.2, 0);

// Deterministic key light. Fixed direction and intensity so neutral and
// styled captures differ only by the shader under review.
const sun = new THREE.DirectionalLight('#fff2d4', 2.7);
sun.position.set(-16, 21, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(new THREE.HemisphereLight('#dff1ff', '#6d7f66', 1.05));

// Ground-contact proof surface: a plain matte receiver, deliberately not a
// ToonLab ground shader, so the only thing under review is the rock.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: '#b9ac93', roughness: 1 }),
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

const selected = assetId
  ? AZURE_HEADLAND_ROCKS.filter((rock) => rock.id === assetId)
  : AZURE_HEADLAND_ROCKS;
if (selected.length === 0) throw new Error(`Unknown asset "${assetId}"`);

// Spread across the shoreline so world-space triplanar projection samples a
// different region per rock — the same decorrelation the real scene gets.
const LAYOUT = { 'rock-0111': -0.5, 'rock-0119': -9.5, 'rock-0281': 8.5 };

const mossTexture = useMoss ? await loadTexture(MOSS_ALBEDO_URL, { srgb: true }) : null;
const detailCache = new Map();
const report = { assets: [], moss: useMoss, normals: useNormals, shader, view };

for (const rock of selected) {
  const surface = resolveRockSurface(rock, { harmonize, moss: useMoss, normalFlatten, projectionScale });
  const gltf = await loadGltf(rock.url);
  const root = gltf.scene;

  // Show LOD0 only. The catalog packs all three levels as sibling nodes.
  const lodNodes = [];
  root.traverse((object) => { if (/_LOD\d$/.test(object.name)) lodNodes.push(object); });
  for (const node of lodNodes) node.visible = node.name.endsWith('_LOD0');

  // Only `rock` is colour data; normals and smoothness are linear.
  const SRGB_SLOTS = new Set(['rock']);
  const textures = {};
  for (const [slot, url] of Object.entries(surface.textureUrls)) {
    if (slot === 'rockNormal' && !useNormals) continue;
    if (!detailCache.has(url)) {
      detailCache.set(url, await loadTexture(url, { srgb: SRGB_SLOTS.has(slot) }));
    }
    textures[slot] = detailCache.get(url);
  }
  if (mossTexture) textures.moss = mossTexture;

  const settings = shader === 'neutral'
    ? { preset: 'neutral' }
    : { preset: 'call_me_sensei', ...surface.settings };
  const applied = applyRockShader(root, settings, {
    // Tessellation + displacement. Default on: S08's 85 mm framing is the bar
    // these assets have to clear, and 1.5k-4k triangles facet visibly there.
    detail: useDetail
      ? {
        subdivisions: detailSubdivisions,
        ...(detailAmount === undefined ? {} : { amount: detailAmount }),
        ...(detailScale === undefined ? {} : { scale: detailScale }),
      }
      : null,
    name: `ToonLab · ${rock.label}`,
    textures,
    variation: rock.variation,
  });

  // Seat the rock on the ground plane using its own measured bounds.
  const bounds = new THREE.Box3().setFromObject(root);
  const centre = bounds.getCenter(new THREE.Vector3());
  root.position.set(
    (selected.length > 1 ? LAYOUT[rock.id] ?? 0 : 0) - centre.x,
    -bounds.min.y,
    -centre.z,
  );
  scene.add(root);

  report.assets.push({
    geometryDetail: applied.geometryDetail
      ? {
        meshes: applied.geometryDetail.meshes,
        subdivisions: detailSubdivisions,
        triangles: applied.geometryDetail.triangles,
        trianglesBefore: applied.geometryDetail.trianglesBefore,
      }
      : null,
    id: rock.id,
    measured: rock.measured,
    mossEnabled: Boolean(settings.moss?.enabled),
    profileId: rock.profileId,
    rejectedTextures: applied.rejectedTextures.map((entry) => `${entry.slot} ${entry.texture.resolution}`),
    role: rock.role,
    suppliedNormal: Boolean(textures.rockNormal),
    tint: settings.material?.tint ?? null,
    triangles: rock.triangles,
    variation: rock.variation,
  });
}

const VIEWS = {
  // Three rocks, one frame — the distinctness question.
  trio: { position: [13.5, 7.4, 19], target: [-0.5, 2.4, 0] },
  // Single asset, three-quarter hero.
  hero: { position: [7.6, 4.6, 9.2], target: [0, 2.4, 0] },
  // Grazing light across the surface at S08's 85 mm read.
  detail: { position: [3.1, 2.5, 4.0], target: [0, 2.5, 0], fov: 21 },
  // Ground contact and shadow seat.
  contact: { position: [6.2, 1.15, 7.0], target: [0, 0.55, 0], fov: 30 },
};
const shot = VIEWS[view] ?? VIEWS.trio;
camera.fov = shot.fov ?? 38;
camera.position.set(...shot.position);
controls.target.set(...shot.target);
camera.updateProjectionMatrix();
controls.update();

const fields = document.getElementById('hudFields');
fields.innerHTML = [
  ['view', view], ['shader', shader],
  ['normals', useNormals ? 'authored 2048²' : 'artifact (4×4)'],
  ['moss', useMoss ? 'on' : 'off'],
  ['tint', harmonize ? 'harmonized (D-010)' : 'catalog'],
  ...report.assets.map((a) => [a.role, `${a.id} · ${a.triangles} tris · ${a.profileId}`]),
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

document.body.dataset.rockReport = JSON.stringify(report);
document.body.dataset.modelReady = 'true';
