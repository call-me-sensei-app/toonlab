// D19-062 / D19-041 probe — the SAME catalog rock, in two lighting rigs.
//
// This exists because the two defects were bounded by elimination on a
// five-minute, twenty-system launch scene. Here one rock, one ground plane and
// two control spheres reproduce both in ~12 m of world and about 20 seconds,
// and every claim is a measured number rather than a look.
//
//   ?mode=plain            the labs/rock-gate1 rig: DirectionalLight + Hemisphere
//   ?mode=styled           createSceneStyleRuntime + CALL_ME_SENSEI_STYLE_BUNDLE
//   ?renderer=webgl        force the WebGL2 fallback backend (Gate 4 wants both)
//   ?fill=0.35             ToonLab surface lighting shadowFill (D19-062's fix)
//   ?spheres=1             add untextured stock-vs-ToonLab control spheres
//   ?view=hero|top|sphere  framing
//   ?subject=rock|sphere|slab|ground   which surface the depth audit measures
//   ?cast=0 / ?receive=0   drop caster / receiver flags
//   ?sunshadow=0           stop the package sun-shadow pass (sun.castShadow=false)
//   ?debug=shadow          paint the raw sun-shadow mask on every surface
//   ?bias= / ?nbias=       override the pass's published depth / normal bias
//   ?shadownear= / ?shadowfar=   override the shadow camera's depth range
//   ?flipy=1               cancel applyShadowClipAdjust's y flip (proved wrong)
//   ?ui=0                  hide the on-screen report (for captures)
//
// `shadowAudit` in the report compares, per fragment, the depth the receiver
// computes against the depth the pass actually wrote, and cross-checks both
// against CPU ray-traced ground truth (`groundTruth`).
//
// Automation contract: document.body.dataset.probeReady / probeReport.
// Driver: `node labs/d19062-probe/probe.mjs` (URLS=... SHOT_DIR=...).

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import { installToonLabSurfaceLighting } from '../../src/environment/toonLabSurfaceLighting.js';
import { applyRockShader } from '../../src/rock-shader/rockShaderRuntime.js';
import {
  environmentSunShadow,
  sampleEnvironmentSunShadow,
} from '../../src/shaders-tsl/chunks/environment-sun-shadow.js';
import { environmentCloudShadow } from '../../src/sky/cloudShadow.js';
import { CALL_ME_SENSEI_STYLE_BUNDLE, createSceneStyleRuntime } from '../../src/styles/index.js';
import {
  AZURE_HEADLAND_ROCKS,
  FORMATION_PROJECTION_SCALE,
  MOSS_ALBEDO_URL,
  resolveRockSurface,
} from '../shared/azureHeadlandRocks.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'styled' ? 'styled' : 'plain';
const forceWebGL = params.get('renderer') === 'webgl';
const timeOfDay = Number(params.get('hour') ?? 10);
const assetId = params.get('asset') ?? 'rock-0119';
const withSpheres = params.get('spheres') === '1';
const flag = (key, fallback) => (params.has(key) ? params.get(key) !== '0' : fallback);
const castShadow = flag('cast', true);
const receiveShadow = flag('receive', true);
const sunCastsShadow = flag('sunshadow', true);
const gate1Sun = params.get('sun') === 'gate1';
const shadowFill = params.has('fill') ? Number(params.get('fill')) : 0;

const W = 640;
const H = 400;

const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.querySelector('#stage').append(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87b6d6');
const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 600);
const VIEWS = {
  hero: { position: [7.6, 4.6, 9.2], target: [0, 2.4, 0] },
  // Looks straight down the sun's own azimuth band so a cast shadow's
  // direction is unambiguous in the frame.
  top: { position: [0.5, 26, 18], target: [0, 0, 0] },
  sphere: { position: [-2.0, 3.2, 6.0], target: [-5.5, 1.2, -1.5] },
};
const shot = VIEWS[params.get('view')] ?? VIEWS.hero;
camera.position.set(...shot.position);
camera.lookAt(...shot.target);

// --- the asset, exactly as rock-gate1 and the coast scene build it ----------
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

const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').setWorkerLimit(2).detectSupport(renderer);
const gltfLoader = new GLTFLoader().setKTX2Loader(ktx2);
const rock = AZURE_HEADLAND_ROCKS.find((entry) => entry.id === assetId) ?? AZURE_HEADLAND_ROCKS[0];
const surface = resolveRockSurface(rock, { projectionScale: FORMATION_PROJECTION_SCALE });
const gltf = await new Promise((resolve, reject) => gltfLoader.load(rock.url, resolve, undefined, reject));
const root = gltf.scene;
root.traverse((object) => {
  if (/_LOD\d$/.test(object.name)) object.visible = object.name.endsWith('_LOD0');
});
const textures = { moss: await loadTexture(MOSS_ALBEDO_URL, { srgb: true }) };
for (const [slot, url] of Object.entries(surface.textureUrls)) {
  textures[slot] = await loadTexture(url, { srgb: slot === 'rock' });
}
applyRockShader(root, { preset: 'call_me_sensei', ...surface.settings }, {
  detail: { subdivisions: 2 },
  name: `ToonLab · ${rock.label}`,
  textures,
  variation: rock.variation,
});
if (shadowFill > 0) {
  root.traverse((object) => {
    if (object.isMesh && object.material?.userData?.toonLabSurfaceLighting) {
      installToonLabSurfaceLighting(object.material, { shadowFill });
    }
  });
}
const bounds = new THREE.Box3().setFromObject(root);
const centre = bounds.getCenter(new THREE.Vector3());
root.position.set(-centre.x, -bounds.min.y, -centre.z);
root.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = castShadow;
  object.receiveShadow = receiveShadow;
});
scene.add(root);

// The ground is a ToonLab-lit receiver on purpose: a stock standard material
// does NOT sample the package sun-shadow map, so it can never show the pass's
// cast shadows (which is exactly why this defect went unseen).
const groundMaterial = new THREE.MeshPhysicalNodeMaterial({ metalness: 0, roughness: 1 });
groundMaterial.color.setRGB(0.53, 0.45, 0.33, THREE.SRGBColorSpace);
installToonLabSurfaceLighting(groundMaterial, { shadowFill, workflow: 'metallic' });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = receiveShadow;
ground.castShadow = params.get('groundcast') === '1';
ground.name = 'probe-ground';
scene.add(ground);

// ?subject=slab — one large double-sided caster, tilted so its light-space
// depth sweeps a wide range. A flat analytic caster tells apart a depth SCALE
// from a depth OFFSET, which a rough rock cannot.
let slab = null;
if (params.get('subject') === 'slab') {
  const slabMaterial = new THREE.MeshPhysicalNodeMaterial({ metalness: 0, roughness: 1, side: THREE.DoubleSide });
  slabMaterial.color.setRGB(0.6, 0.6, 0.6, THREE.SRGBColorSpace);
  installToonLabSurfaceLighting(slabMaterial, { workflow: 'metallic' });
  slab = new THREE.Mesh(new THREE.PlaneGeometry(40, 40, 4, 4), slabMaterial);
  slab.rotation.set(-Math.PI / 3, 0.4, 0);
  slab.position.set(0, 12, 0);
  slab.castShadow = true;
  slab.receiveShadow = true;
  slab.name = 'probe-slab';
  scene.add(slab);
  root.traverse((object) => { if (object.isMesh) object.castShadow = false; });
}

// Untextured controls: three's own lighting vs the ToonLab bridge.
const albedo = new THREE.Color().setRGB(0.55, 0.5, 0.44, THREE.SRGBColorSpace);
const CONTROL_KINDS = ['physical', 'toonlab'];
const controls = withSpheres
  ? CONTROL_KINDS.map((kind, index) => {
    const material = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.85, metalness: 0 });
    material.color.copy(albedo);
    if (kind === 'toonlab') installToonLabSurfaceLighting(material, { shadowFill, workflow: 'metallic' });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 40, 24), material);
    mesh.position.set(-5.5, 1.2, index * 3 - 1.5);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.name = `control-${kind}`;
    scene.add(mesh);
    return mesh;
  })
  : [];

if (params.get('subject') === 'sphere') {
  root.traverse((object) => { if (object.isMesh) object.castShadow = false; });
}

// --- the two rigs ----------------------------------------------------------
let runtime = null;
if (mode === 'plain') {
  const sun = new THREE.DirectionalLight('#fff2d4', 2.7);
  sun.position.set(-16, 21, 13);
  sun.castShadow = true;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#dff1ff', '#6d7f66', 1.05));
} else {
  runtime = createSceneStyleRuntime({ collision: false, renderer, scene, timeOfDay });
  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, { discovery: 'manual', mode: 'advisory' });
  let styledSun = null;
  scene.traverse((object) => { if (object.isDirectionalLight) styledSun = object; });
  globalThis.__styledSun = styledSun;
  if (styledSun && !sunCastsShadow) styledSun.castShadow = false;
  if (styledSun && gate1Sun) {
    // Pin the styled sun to the rock-gate1 direction so azimuth cannot be a
    // confound. The lighting system re-poses it every frame, so re-pin it in
    // the loop as well.
    globalThis.__pinSun = () => {
      styledSun.position.set(-16, 21, 13);
      styledSun.target.position.set(0, 0, 0);
      styledSun.target.updateMatrixWorld(true);
      styledSun.updateMatrixWorld(true);
    };
  }
}

// ?debug=shadow paints the raw package sun-shadow mask on every surface.
if (params.get('debug') === 'shadow') {
  const { positionWorld, vec3 } = await import('three/tsl');
  const maskMaterial = new THREE.MeshBasicNodeMaterial();
  maskMaterial.colorNode = vec3(sampleEnvironmentSunShadow(positionWorld));
  scene.traverse((object) => {
    if (object.isMesh) object.material = maskMaterial;
  });
}

const FLIP_Y = new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

const target = new THREE.RenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });

function lightSummary() {
  const lights = [];
  scene.traverse((object) => {
    if (!object.isLight) return;
    lights.push({
      castShadow: Boolean(object.castShadow),
      color: object.color?.toArray?.().map((v) => Number(v.toFixed(3))) ?? null,
      contract: object.shadow?.toonLabLightingContract ?? null,
      intensity: Number((object.intensity ?? 0).toFixed(3)),
      name: object.name || object.type,
      position: object.position?.toArray?.().map((v) => Number(v.toFixed(2))) ?? null,
      target: object.target?.position?.toArray?.().map((v) => Number(v.toFixed(2))) ?? null,
      type: object.type,
      visible: object.visible,
    });
  });
  return lights;
}

async function sample() {
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  const buffer = await renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H);
  const read = (x, y) => {
    const i = ((H - 1 - y) * W + x) * 4;
    return [buffer[i], buffer[i + 1], buffer[i + 2]];
  };
  const patch = (cx, cy, radius) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    let brightest = [0, 0, 0];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const [pr, pg, pb] = read(x, y);
        r += pr; g += pg; b += pb; n += 1;
        if (pr + pg + pb > brightest[0] + brightest[1] + brightest[2]) brightest = [pr, pg, pb];
      }
    }
    return { brightest, mean: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null, samples: n };
  };
  const project = (worldPoint) => {
    const p = worldPoint.clone().project(camera);
    return [Math.round((p.x * 0.5 + 0.5) * W), Math.round((p.y * 0.5 + 0.5) * H)];
  };
  const rockBounds = new THREE.Box3().setFromObject(root);
  const rockCentre = rockBounds.getCenter(new THREE.Vector3());
  const [rx, ry] = project(rockCentre);
  const out = { rock: { ...patch(rx, ry, 26), pixel: [rx, ry] } };
  for (const mesh of controls) {
    const [cx, cy] = project(mesh.getWorldPosition(new THREE.Vector3()));
    out[mesh.name] = { ...patch(cx, cy, 12), pixel: [cx, cy] };
  }
  return out;
}

const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  runtime?.update(delta, camera);
  globalThis.__pinSun?.();
  // The pass republishes these every render; override AFTER it.
  if (params.has('bias')) environmentSunShadow.bias.value = Number(params.get('bias'));
  if (params.has('nbias')) environmentSunShadow.normalBias.value = Number(params.get('nbias'));
  if ((params.has('shadowfar') || params.has('shadownear')) && globalThis.__styledSun) {
    const shadowCamera = globalThis.__styledSun.shadow.camera;
    if (params.has('shadowfar')) shadowCamera.far = Number(params.get('shadowfar'));
    if (params.has('shadownear')) shadowCamera.near = Number(params.get('shadownear'));
    shadowCamera.updateProjectionMatrix();
  }
  if (params.get('flipy') === '1') {
    environmentSunShadow.matrix.value.premultiply(FLIP_Y);
    environmentSunShadow.farMatrix.value.premultiply(FLIP_Y);
  }
  renderer.render(scene, camera);
  frames += 1;
});

// Compare the depth the pass WROTE against the depth the receiver COMPUTES,
// at a point on the rock's sunward top face.
async function shadowDepthAudit() {
  const pass = runtime?.shadowPass;
  const nearTarget = pass?.nearShadowTarget;
  if (!nearTarget) return null;
  let sun = null;
  scene.traverse((object) => { if (object.isDirectionalLight) sun = object; });
  const shadowCamera = sun.shadow.camera;
  // A point that is definitely ON the rock: raycast through the frame centre.
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const subjects = { ground, slab, sphere: controls[0], rock: root };
  const subject = subjects[params.get('subject')] ?? slab ?? root;
  const hit = raycaster.intersectObject(subject, true)[0];
  if (!hit) return { error: 'no ray hit on rock' };
  const probePoint = hit.point.clone();
  const probeNormal = hit.face
    ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    : new THREE.Vector3(0, 1, 0);
  // The receiver biases along its geometric normal before projecting.
  probePoint.addScaledVector(probeNormal, environmentSunShadow.normalBias.value);
  // Receiver side: exactly what environment-sun-shadow.js computes.
  const clip = probePoint.clone().applyMatrix4(pass.shadowMatrix);
  const coord = new THREE.Vector3(clip.x * 0.5 + 0.5, clip.y * 0.5 + 0.5, clip.z * 0.5 + 0.5);
  // Writer side: viewZToOrthographicDepth(positionView.z, near, far).
  const view = probePoint.clone().applyMatrix4(shadowCamera.matrixWorldInverse);
  const writerDepth = (view.z + shadowCamera.near) / (shadowCamera.near - shadowCamera.far);
  const px = Math.min(nearTarget.width - 1, Math.max(0, Math.round(coord.x * (nearTarget.width - 1))));
  const py = Math.min(nearTarget.height - 1, Math.max(0, Math.round(coord.y * (nearTarget.height - 1))));
  const readAt = async (x, y) => {
    const pixels = await renderer.readRenderTargetPixelsAsync(nearTarget, x, y, 1, 1);
    return Number(pixels[0]);
  };
  // Whole-map scan: is anything written at all, and where?
  const all = await renderer.readRenderTargetPixelsAsync(
    nearTarget, 0, 0, nearTarget.width, nearTarget.height,
  );
  const texelAt = (x, y) => all[(y * nearTarget.width + x) * 4];
  let minDepth = Infinity;
  let minAt = null;
  let written = 0;
  for (let y = 0; y < nearTarget.height; y += 1) {
    for (let x = 0; x < nearTarget.width; x += 1) {
      const value = texelAt(x, y);
      if (value < 0.999) written += 1;
      if (value < minDepth) { minDepth = value; minAt = [x, y]; }
    }
  }

  // Statistical audit: for a grid of points ON the rock, how far apart are the
  // depth the receiver computes and the depth the pass wrote at that texel?
  const deltas = [];
  const deltasFlipped = [];
  const zValues = [];
  const mapValues = [];
  const pairs = [];
  for (let sy = -0.55; sy <= 0.55; sy += 0.1) {
    for (let sx = -0.35; sx <= 0.35; sx += 0.07) {
      raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);
      const gridHit = raycaster.intersectObject(subject, true)[0];
      if (!gridHit) continue;
      const point = gridHit.point.clone();
      const clipPoint = point.clone().applyMatrix4(pass.shadowMatrix);
      const u = clipPoint.x * 0.5 + 0.5;
      const v = clipPoint.y * 0.5 + 0.5;
      const z = clipPoint.z * 0.5 + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const gx = Math.round(u * (nearTarget.width - 1));
      const gy = Math.round(v * (nearTarget.height - 1));
      deltas.push(z - texelAt(gx, gy));
      deltasFlipped.push(z - texelAt(gx, nearTarget.height - 1 - gy));
      zValues.push(z);
      mapValues.push(texelAt(gx, gy));
      if (pairs.length < 12) pairs.push([Number(u.toFixed(4)), Number(v.toFixed(4)), Number(z.toFixed(5)), Number(texelAt(gx, gy).toFixed(5))]);
    }
  }
  // Exhaustive alignment search: which texel offset (and row convention) makes
  // the written map agree with the depth the receiver computes?
  const samplePoints = [];
  for (let sy = -0.55; sy <= 0.55; sy += 0.1) {
    for (let sx = -0.35; sx <= 0.35; sx += 0.07) {
      raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);
      const gridHit = raycaster.intersectObject(subject, true)[0];
      if (!gridHit) continue;
      const clipPoint = gridHit.point.clone().applyMatrix4(pass.shadowMatrix);
      samplePoints.push({
        u: clipPoint.x * 0.5 + 0.5,
        v: clipPoint.y * 0.5 + 0.5,
        z: clipPoint.z * 0.5 + 0.5,
      });
    }
  }
  // Ground truth: CPU-raytrace each sample toward the sun. Anything the map
  // calls shadowed that the ray says is lit (or vice versa) is a pass defect,
  // not scene composition.
  const toSun = sun.position.clone().sub(sun.target.position).normalize();
  const truthRay = new THREE.Raycaster();
  truthRay.far = 400;
  let agree = 0;
  let mapSaysShadowRaySaysLit = 0;
  let mapSaysLitRaySaysShadow = 0;
  const truthSamples = [];
  for (let sy = -0.55; sy <= 0.55; sy += 0.1) {
    for (let sx = -0.35; sx <= 0.35; sx += 0.07) {
      raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);
      const gridHit = raycaster.intersectObject(subject, true)[0];
      if (!gridHit) continue;
      const surfacePoint = gridHit.point.clone().addScaledVector(toSun, 0.02);
      truthRay.set(surfacePoint, toSun);
      const blocked = truthRay.intersectObject(root, true).length > 0;
      const clipPoint = gridHit.point.clone().applyMatrix4(pass.shadowMatrix);
      const u = clipPoint.x * 0.5 + 0.5;
      const v = clipPoint.y * 0.5 + 0.5;
      const z = clipPoint.z * 0.5 + 0.5;
      const gx = Math.round(u * (nearTarget.width - 1));
      const gy = Math.round(v * (nearTarget.height - 1));
      const mapShadowed = (z + environmentSunShadow.bias.value) > texelAt(gx, gy);
      truthSamples.push({ blocked, mapShadowed });
      if (blocked === mapShadowed) agree += 1;
      else if (mapShadowed) mapSaysShadowRaySaysLit += 1;
      else mapSaysLitRaySaysShadow += 1;
    }
  }
  const groundTruth = {
    agree,
    falseShadow: mapSaysShadowRaySaysLit,
    falseLight: mapSaysLitRaySaysShadow,
    rayShadowedShare: Number(
      (truthSamples.filter((entry) => entry.blocked).length / truthSamples.length).toFixed(3),
    ),
    total: truthSamples.length,
  };

  let best = null;
  for (const flipRow of [false, true]) {
    for (let dv = -70; dv <= 70; dv += 2) {
      for (let du = -70; du <= 70; du += 2) {
        let total = 0;
        let empty = 0;
        let n = 0;
        for (const point of samplePoints) {
          const gx = Math.round(point.u * (nearTarget.width - 1)) + du;
          let gy = Math.round(point.v * (nearTarget.height - 1));
          if (flipRow) gy = nearTarget.height - 1 - gy;
          gy += dv;
          if (gx < 0 || gx >= nearTarget.width || gy < 0 || gy >= nearTarget.height) continue;
          const value = texelAt(gx, gy);
          if (value > 0.999) { empty += 1; continue; }
          total += Math.abs(point.z - value);
          n += 1;
        }
        if (n < samplePoints.length * 0.9) continue;
        const score = total / n;
        if (!best || score < best.score) {
          best = { du, dv, empty, flipRow, n, score: Number(score.toFixed(5)) };
        }
      }
    }
  }

  // Coarse ASCII picture of the map around the rock, with the receiver's own
  // projected samples marked, so a misalignment is visible rather than inferred.
  const centreU = samplePoints.reduce((sum, point) => sum + point.u, 0) / samplePoints.length;
  const centreV = samplePoints.reduce((sum, point) => sum + point.v, 0) / samplePoints.length;
  const cx0 = Math.round(centreU * (nearTarget.width - 1));
  const cy0 = Math.round(centreV * (nearTarget.height - 1));
  const SPAN = 128;
  const STEP = 4;
  const marks = new Set(samplePoints.map((point) => {
    const gx = Math.round(point.u * (nearTarget.width - 1));
    const gy = Math.round(point.v * (nearTarget.height - 1));
    return `${Math.round((gx - cx0) / STEP)},${Math.round((gy - cy0) / STEP)}`;
  }));
  const picture = [];
  for (let row = SPAN / STEP; row >= -SPAN / STEP; row -= 1) {
    let line = '';
    for (let col = -SPAN / STEP; col <= SPAN / STEP; col += 1) {
      const gx = cx0 + col * STEP;
      const gy = cy0 + row * STEP;
      const inside = gx >= 0 && gx < nearTarget.width && gy >= 0 && gy < nearTarget.height;
      const value = inside ? texelAt(gx, gy) : 1;
      const marked = marks.has(`${col},${row}`);
      line += marked ? (value < 0.999 ? 'X' : 'O') : (value < 0.999 ? '#' : '.');
    }
    picture.push(line);
  }

  const stat = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      max: Number(sorted.at(-1).toFixed(5)),
      median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(5)),
      min: Number(sorted[0].toFixed(5)),
      occludedShare: Number(
        (values.filter((value) => value > 0.0004).length / values.length).toFixed(3),
      ),
    };
  };

  return {
    cameraFar: shadowCamera.far,
    cameraNear: shadowCamera.near,
    mapDepthAtCoord: await readAt(px, py),
    mapDepthAtFlippedRow: await readAt(px, nearTarget.height - 1 - py),
    mapSize: [nearTarget.width, nearTarget.height],
    probePoint: probePoint.toArray().map((v) => Number(v.toFixed(3))),
    receiverCoord: coord.toArray().map((v) => Number(v.toFixed(5))),
    texel: [px, py],
    viewZ: Number(view.z.toFixed(3)),
    writerDepth: Number(writerDepth.toFixed(5)),
    mapMinDepth: Number(minDepth.toFixed(5)),
    mapMinAt: minAt,
    mapWrittenTexels: written,
    deltaSameRow: stat(deltas),
    zStat: stat(zValues),
    mapStat: stat(mapValues),
    pairs,
    bestAlignment: best,
    groundTruth,
    picture,
    deltaFlippedRow: stat(deltasFlipped),
    probeNormal: probeNormal.toArray().map((v) => Number(v.toFixed(3))),
    // What the shader's step() would decide with the pass's own bias.
    shaderVisibility: (coord.z + environmentSunShadow.bias.value)
      <= (await readAt(px, nearTarget.height - 1 - py)) ? 1 : 0,
    bias: environmentSunShadow.bias.value,
    normalBias: environmentSunShadow.normalBias.value,
  };
}

await new Promise((resolve) => setTimeout(resolve, 1500));
const shadowAudit = mode === 'styled' ? await shadowDepthAudit() : null;
const samples = await sample();
const report = {
  asset: rock.id,
  backend: renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2-fallback',
  cloudShadow: { enabled: environmentCloudShadow.enabled.value, ready: environmentCloudShadow.ready.value },
  frames,
  lights: lightSummary(),
  mode,
  rendererShadowMapEnabled: renderer.shadowMap?.enabled ?? null,
  rockTree: (() => {
    const nodes = [];
    root.traverse((object) => {
      const box = new THREE.Box3().setFromObject(object);
      nodes.push({
        castShadow: object.castShadow,
        isMesh: Boolean(object.isMesh),
        max: box.isEmpty() ? null : box.max.toArray().map((v) => Number(v.toFixed(2))),
        min: box.isEmpty() ? null : box.min.toArray().map((v) => Number(v.toFixed(2))),
        name: object.name,
        parentVisible: object.parent ? object.parent.visible : null,
        triangles: object.isMesh ? (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 : null,
        type: object.type,
        visible: object.visible,
      });
    });
    return nodes;
  })(),
  samples,
  shadowAudit,
  shadowFill,
  shadowPassHealth: runtime?.shadowPass?.health ?? null,
  shadowPassRenderCount: runtime?.shadowPass?.renderCount ?? null,
  sunShadow: { farReady: environmentSunShadow.farReady.value, ready: environmentSunShadow.ready.value },
  toneMappingExposure: Number(renderer.toneMappingExposure.toFixed(3)),
};
if (params.get('ui') !== '0') document.querySelector('#out').textContent = JSON.stringify(report, null, 1);
document.body.dataset.probeReport = JSON.stringify(report);
document.body.dataset.probeReady = 'true';
