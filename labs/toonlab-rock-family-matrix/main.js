import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
  createBakedRockMaterial,
  createBeforeRockMaterial,
  createChannelMaterial,
  createNeutralRockMaterial,
} from '../toonlab-realistic-boulder/bakedRockMaterial.js';

const query = new URLSearchParams(location.search);
const familyId = String(query.get('family') || 'jointed-granite-boulder');
const seed = Math.max(1, Math.round(Number(query.get('seed')) || 11));
const look = ['compare', 'before', 'after', 'stylized', 'wire', 'channels'].includes(query.get('look'))
  ? query.get('look')
  : 'compare';
const view = ['hero', 'close', 'ortho', 'top'].includes(query.get('view'))
  ? query.get('view')
  : 'hero';
document.body.dataset.compare = look === 'compare' ? '1' : '0';
document.body.dataset.hud = query.get('hud') === '0' ? '0' : '1';

function artifactUrl(file) {
  return `/assets-local/labs/toonlab-rock-family-matrix/${familyId}/seed-${String(seed).padStart(3, '0')}/${file}`;
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
    throw new Error(`Family artifact "${familyId}" seed ${seed} is missing.`);
  }
  const [manifest, mesh] = await Promise.all([manifestResponse.json(), meshResponse.json()]);
  return { geometry: geometryFromArtifact(mesh), manifest, normalAo, surface };
}

function makeRock(geometry, material, minY, x = 0) {
  const rock = new THREE.Mesh(geometry, material);
  rock.position.set(x, -minY, 0);
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.frustumCulled = false;
  return rock;
}

async function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9bfbc);
  scene.fog = new THREE.Fog(0xb9bfbc, 28, 90);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 240);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;

  const asset = await loadArtifact();
  const { geometry, manifest, normalAo, surface } = asset;
  const minY = geometry.boundingBox.min.y;
  const height = geometry.boundingBox.max.y - minY;
  const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
  const radius = geometry.boundingSphere.radius;
  const beforeMaterial = createBeforeRockMaterial({ geology: manifest.geology });
  const afterMaterial = createBakedRockMaterial({
    geology: manifest.geology,
    look: look === 'stylized' ? 'stylized' : 'realistic',
    normalAo,
    surface,
  });
  let extentRadius = radius;
  if (look === 'compare') {
    const separation = width * 0.64 + radius * 0.32;
    scene.add(makeRock(geometry, beforeMaterial, minY, -separation));
    scene.add(makeRock(geometry, afterMaterial, minY, separation));
    extentRadius = separation + radius;
  } else {
    let material = afterMaterial;
    if (look === 'before') material = beforeMaterial;
    else if (look === 'wire') material = createNeutralRockMaterial({ wireframe: true });
    else if (look === 'channels') material = createChannelMaterial(surface);
    scene.add(makeRock(geometry, material, minY));
  }

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(extentRadius * 3.6, 128),
    new THREE.MeshStandardMaterial({ color: 0x858b82, metalness: 0, roughness: 0.98 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.008;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.HemisphereLight(0xdce7ea, 0x3d3932, 0.88));
  const sun = new THREE.DirectionalLight(0xffedcf, 2.45);
  sun.position.set(extentRadius * 1.5, extentRadius * 2.3, extentRadius * 1.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowReach = extentRadius * 1.7;
  sun.shadow.camera.left = -shadowReach;
  sun.shadow.camera.right = shadowReach;
  sun.shadow.camera.top = shadowReach;
  sun.shadow.camera.bottom = -shadowReach;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const target = new THREE.Vector3(0, height * 0.46, 0);
  const cameraDistance = Math.max(extentRadius * 2.3, height * 2.25);
  const positions = {
    close: [cameraDistance * 0.72, height * 0.68, cameraDistance * 0.72],
    hero: [cameraDistance * 0.24, height * 0.72, cameraDistance],
    ortho: [0, height * 0.52, cameraDistance * 1.08],
    top: [0.05, cameraDistance * 1.18, 0.08],
  };
  camera.position.fromArray(positions[view]);
  controls.target.copy(target);
  controls.update();

  document.querySelector('#family-title').textContent = manifest.familyLabel || familyId;
  document.querySelector('#family-subtitle').textContent = `${manifest.geology} · seed ${seed} · ${manifest.compiler}`;
  document.querySelector('#hud').textContent = [
    `${manifest.familyLabel || familyId} / ${manifest.geology}`,
    `${look} · ${view}`,
    `${manifest.geometry.triangles.toLocaleString()} triangles · ${manifest.atlas.width}² bake`,
    `hit ${(manifest.atlas.stats.hitRate * 100).toFixed(1)}% · conflicts ${(manifest.atlas.stats.projectionConflictRate * 100).toFixed(2)}%`,
    `gate ${manifest.acceptance.accepted ? 'accepted' : 'NOT ACCEPTED'}`,
    `hash ${manifest.contentHash}`,
  ].join('\n');

  const report = {
    acceptance: manifest.acceptance,
    atlas: manifest.atlas,
    compiler: manifest.compiler,
    contentHash: manifest.contentHash,
    family: manifest.family,
    familyId,
    familyLabel: manifest.familyLabel,
    geology: manifest.geology,
    look,
    seed,
    triangles: manifest.geometry.triangles,
    view,
  };
  let renderedFrames = 0;
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    renderedFrames += 1;
    if (renderedFrames >= 4 && document.body.dataset.rockReady !== 'true') {
      document.body.dataset.rockReady = 'true';
      document.body.dataset.rockReport = JSON.stringify({ ...report, renderedFrames, settled: true });
    }
  });
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

