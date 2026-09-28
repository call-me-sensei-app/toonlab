import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  createBakedRockMaterial,
  createChannelMaterial,
  createNeutralRockMaterial,
} from './bakedRockMaterial.js';

const query = new URLSearchParams(location.search);
const seed = Math.max(1, Math.round(Number(query.get('seed')) || 11));
const look = ['realistic', 'stylized', 'clay', 'wire', 'channels'].includes(query.get('look'))
  ? query.get('look')
  : 'realistic';
const view = ['hero', 'close', 'ortho', 'top'].includes(query.get('view'))
  ? query.get('view')
  : 'hero';
const hudEnabled = query.get('hud') !== '0';
document.body.dataset.hud = hudEnabled ? '1' : '0';

function artifactUrl(file) {
  return `/assets-local/labs/toonlab-realistic-boulder/seed-${String(seed).padStart(3, '0')}/${file}`;
}

function geometryFromArtifact(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uv, 2));
  geometry.setIndex(mesh.index);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function loadTexture(url) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

async function loadArtifact() {
  const [manifestResponse, meshResponse, normalAo, surface] = await Promise.all([
    fetch(artifactUrl('manifest.json')),
    fetch(artifactUrl('mesh.json')),
    loadTexture(artifactUrl('normal-ao.png')),
    loadTexture(artifactUrl('surface.png')),
  ]);
  if (!manifestResponse.ok || !meshResponse.ok) {
    throw new Error(`Compiled seed ${seed} is missing. Run scripts/compile-realistic-boulder.mjs.`);
  }
  const [manifest, mesh] = await Promise.all([manifestResponse.json(), meshResponse.json()]);
  return { geometry: geometryFromArtifact(mesh), manifest, normalAo, surface };
}

function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.07;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);
  return renderer;
}

function configureCamera(camera, controls, center, radius) {
  const positions = {
    close: [radius * 1.35, radius * 0.54, radius * 1.18],
    hero: [radius * 2.35, radius * 1.12, radius * 2.45],
    ortho: [radius * 0.08, radius * 0.65, radius * 3.05],
    top: [radius * 0.08, radius * 3.3, radius * 0.1],
  };
  camera.position.fromArray(positions[view]);
  camera.position.add(center);
  controls.target.copy(center);
  if (view === 'top') controls.target.z += 0.08;
  controls.update();
}

async function boot() {
  const renderer = createRenderer();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcc3bf);
  scene.fog = new THREE.Fog(0xbcc3bf, 12, 30);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;

  const asset = await loadArtifact();
  const { geometry, manifest, normalAo, surface } = asset;
  const minY = geometry.boundingBox.min.y;
  const maxY = geometry.boundingBox.max.y;
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const radius = geometry.boundingSphere.radius;

  let material;
  if (look === 'realistic' || look === 'stylized') {
    material = createBakedRockMaterial({ geology: manifest.geology, look, normalAo, surface });
  } else if (look === 'channels') {
    material = createChannelMaterial(surface);
  } else {
    material = createNeutralRockMaterial({ wireframe: look === 'wire' });
  }
  const rock = new THREE.Mesh(geometry, material);
  rock.name = `ToonLab ${manifest.family} seed ${seed}`;
  rock.position.y = -minY;
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.frustumCulled = false;
  rock.userData.toonlab = {
    domain: 'natural.rock',
    materials: {
      [material.userData.toonlabMaterialId ?? 'granite-inspection']: { roles: ['primaryMass'] },
    },
    repositoryOnly: true,
    targetId: `research/${manifest.family}/seed-${seed}`,
  };
  scene.add(rock);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 4.6, 96),
    new THREE.MeshStandardMaterial({ color: 0x8f948b, metalness: 0, roughness: 0.96 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.008;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(new THREE.HemisphereLight(0xe2e9ed, 0x4c463d, 0.95));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.65);
  sun.position.set(5.5, 7.5, 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.bias = -0.00045;
  scene.add(sun);

  const worldCenter = center.clone();
  worldCenter.y += -minY - (maxY - minY) * 0.05;
  configureCamera(camera, controls, worldCenter, radius);

  const report = {
    acceptance: manifest.acceptance,
    atlasCoverage: manifest.atlas.stats.atlasCoverage,
    atlasResolution: manifest.atlas.width,
    bakeHitRate: manifest.atlas.stats.hitRate,
    compiler: manifest.compiler,
    contentHash: manifest.contentHash,
    family: manifest.family,
    geometryHash: manifest.geometry.hash,
    geology: manifest.geology,
    look,
    meshResolution: manifest.meshResolution,
    provenance: manifest.provenance,
    rendererBackend: 'webgl2-fallback',
    seed,
    triangles: manifest.geometry.triangles,
    view,
  };
  document.querySelector('#hud').textContent = [
    `${manifest.family} / seed ${seed}`,
    `${look} · ${view}`,
    `${manifest.geometry.triangles.toLocaleString()} triangles · ${manifest.atlas.width}² bake`,
    `hit ${(manifest.atlas.stats.hitRate * 100).toFixed(1)}% · atlas ${(manifest.atlas.stats.atlasCoverage * 100).toFixed(1)}%`,
    `hash ${manifest.contentHash}`,
  ].join('\n');

  let renderedFrames = 0;
  const render = () => {
    controls.update();
    renderer.render(scene, camera);
    renderedFrames += 1;
    if (renderedFrames >= 4 && document.body.dataset.rockReady !== 'true') {
      document.body.dataset.rockReady = 'true';
      document.body.dataset.rockReport = JSON.stringify({
        ...report,
        renderedFrames,
        settled: true,
      });
    }
  };
  renderer.setAnimationLoop(render);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

boot().catch((error) => {
  console.error(error);
  document.body.dataset.rockError = error instanceof Error ? error.message : String(error);
  document.querySelector('#loading').textContent = document.body.dataset.rockError;
});
