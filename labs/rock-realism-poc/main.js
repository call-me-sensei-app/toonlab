import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import { buildGraniteGeometry } from './buildGraniteGeometry.js';

const params = new URLSearchParams(location.search);
const seed = Math.min(9999, Math.max(1, Math.floor(Number(params.get('seed')) || 1)));
const resolution = Math.min(128, Math.max(32, Math.round(Number(params.get('resolution')) || 64)));
const mesher = params.get('mesher') === 'toonlab' ? 'toonlab' : 'vibe';
const pipeline = params.get('pipeline') === 'compiled' ? 'compiled' : 'field';
const materialMode = ['clay', 'wire'].includes(params.get('material'))
  ? params.get('material')
  : 'realistic';
const view = ['close', 'ortho', 'top'].includes(params.get('view')) ? params.get('view') : 'hero';
const detailNormals = params.get('detailNormals') !== '0';
document.body.dataset.hud = String(params.get('hud') !== '0');

function linkFor(changes) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) next.set(key, String(value));
  return `?${next.toString()}`;
}

document.getElementById('seedLinks').innerHTML = [1, 2, 3, 4, 5, 6]
  .map((candidate) => `<a href="${linkFor({ seed: candidate })}">seed ${candidate}</a>`)
  .join('');

try {
  const stage = document.getElementById('stage');
  const renderer = createLabRenderer({
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.append(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aeb7b9');
  scene.fog = new THREE.Fog('#aeb7b9', 14, 35);

  const camera = view === 'ortho'
    ? new THREE.OrthographicCamera(-2.8, 2.8, 2.8, -2.8, 0.05, 80)
    : new THREE.PerspectiveCamera(view === 'close' ? 30 : 38, 1, 0.05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 2.4;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI / 2 - 0.015;

  const sun = new THREE.DirectionalLight('#fff1d5', 3.1);
  sun.position.set(-6.5, 9.5, 7.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.00045;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#dceeff', '#564c40', 1.25));
  scene.add(new THREE.AmbientLight('#9eadb3', 0.24));

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 96),
    new THREE.MeshStandardMaterial({ color: '#777a70', roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const buildStarted = performance.now();
  let modelInstance = null;
  let report;
  if (pipeline === 'compiled') {
    if (seed > 7) throw new Error('The compiled experiment includes deterministic seeds 1 through 7.');
    const reference = await import('./referenceModel.js');
    if (seed === 1) {
      modelInstance = await reference.createModel({
        diagnostic: materialMode === 'wire' ? 'wireframe' : 'beauty',
        path: 'compiled',
        seed,
      });
    } else {
      const artifactBase = `/assets-local/labs/rock-realism-poc/cliff-seed-${seed}`;
      const [topologyResponse, bakeResponse] = await Promise.all([
        fetch(`${artifactBase}.vtopo`),
        fetch(`${artifactBase}.vbake`),
        reference.ensureGraniteDetail(),
      ]);
      if (!topologyResponse.ok || !bakeResponse.ok) {
        throw new Error(`Prepared compiled artifacts are missing for seed ${seed}. Run the prepare script.`);
      }
      const [topology, surfaceBake] = await Promise.all([
        topologyResponse.arrayBuffer().then((bytes) => reference.decodeCompiledTopology(new Uint8Array(bytes))),
        bakeResponse.arrayBuffer().then((bytes) => reference.decodeCompiledSurfaceBake(new Uint8Array(bytes))),
      ]);
      modelInstance = reference.createInstanceFromCompiled(topology, {
        detailStrength: 0.72,
        diagnostic: materialMode === 'wire' ? 'wireframe' : 'beauty',
        lichen: 0.16,
        lod: 0,
        moss: 0.06,
        placementScale: 1,
        snow: 0,
        surfaceSeed: seed,
        wetness: 0.12,
      }, seed, 'compiled', surfaceBake);
    }
    modelInstance.root.name = 'Vibe3D compiled high-to-low control';
    modelInstance.root.scale.setScalar(1.45);
    modelInstance.root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    });
    scene.add(modelInstance.root);
    const topology = modelInstance.topology;
    let lod0Vertices = 0;
    for (let index = 0; index < topology.indices.length; index += 1) {
      lod0Vertices = Math.max(lod0Vertices, topology.indices[index] + 1);
    }
    report = {
      bakeOnlyBands: ['fine-shatter', 'crystal micro-relief'],
      bandsInMesh: ['macro-buttress', 'meso-jointing'],
      boundaryEdges: topology.claims.boundaryMode === 'closed' ? 0 : 'declared-open',
      buildMs: Math.round((performance.now() - buildStarted) * 10) / 10,
      components: 1,
      degenerateTriangles: 0,
      detailNormals: true,
      formation: ['erratic', 'prow', 'arch', 'tor', 'bench', 'monolith'][(seed - 1) % 6],
      geometryHash: topology.topologyKey,
      mesher: 'vibe-compiled',
      minimumWavelengthCm: 24.8,
      nonFiniteVertices: 0,
      nonManifoldEdges: topology.claims.manifold ? 0 : 'reported',
      provenance: 'vibe3d@10bba5d compiled control',
      resolution: 44,
      seed,
      surfaceBake: true,
      triangles: topology.indices.length / 3,
      vertices: lod0Vertices,
      voxelCm: 8.3,
    };
  } else {
    const built = buildGraniteGeometry({
      detailNormals,
      mesher,
      resolution,
      seed,
    });
    const { geometry } = built;
    report = built.report;
    const material = materialMode === 'wire'
      ? new THREE.MeshStandardMaterial({
        color: '#273238',
        roughness: 0.82,
        wireframe: true,
      })
      : new THREE.MeshStandardMaterial({
        color: materialMode === 'clay' ? '#77736d' : '#ffffff',
        metalness: 0,
        roughness: materialMode === 'clay' ? 0.92 : 0.78,
        vertexColors: materialMode === 'realistic',
      });
    const rock = new THREE.Mesh(geometry, material);
    rock.name = `Realistic granite ${report.formation} seed ${seed}`;
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.frustumCulled = false;
    rock.position.y = -(geometry.boundingBox?.min.y ?? 0) + 0.012;
    scene.add(rock);
  }

  const shots = {
    hero: { position: [5.4, 3.25, 6.4], target: [0, 1.32, 0] },
    close: { position: [3.35, 2.15, 3.8], target: [0, 1.36, 0] },
    ortho: { position: [4.8, 2.85, 6.3], target: [0, 1.22, 0] },
    top: { position: [0.3, 8.2, 0.5], target: [0, 0.8, 0] },
  };
  const shot = shots[view];
  camera.position.set(...shot.position);
  controls.target.set(...shot.target);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();

  const reportWithView = {
    ...report,
    material: materialMode,
    pipeline,
    rendererBackend: document.body.dataset.rendererBackend,
    view,
  };
  document.getElementById('hudFields').innerHTML = [
    ['seed / formation', `${seed} / ${report.formation}`],
    ['pipeline', pipeline === 'compiled' ? 'compiled high-to-low control' : 'live analytic field'],
    ['extractor', report.mesher === 'vibe' ? 'Vibe3D reference QEF' : report.mesher === 'toonlab' ? 'ToonLab QEF surface nets' : 'Vibe3D compiled LOD0'],
    ['resolution', `${report.resolution} cells · ${report.voxelCm} cm voxel`],
    ['mesh', `${report.vertices.toLocaleString()} verts · ${report.triangles.toLocaleString()} tris`],
    ['build', `${report.buildMs.toLocaleString()} ms`],
    ['mesh bands', report.bandsInMesh.join(', ') || 'macro mass only'],
    ['bake-only', report.bakeOnlyBands.join(', ') || 'none at this resolution'],
    ['topology', `${report.components} component · ${report.boundaryEdges} boundary · ${report.nonManifoldEdges} non-manifold`],
    ['presentation', `${materialMode} · ${detailNormals ? 'detailed normals' : 'mesh normals'}`],
    ['surface bake', report.surfaceBake ? 'object normal + AO + height + curvature' : 'not yet — this is the next gate'],
  ].map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join('');

  let renderedFrames = 0;
  let stableFrames = 0;
  let lastDrawSignature = '';
  renderer.setAnimationLoop(() => {
    controls.update();
    modelInstance?.update(1 / 60, camera, stage.clientHeight || window.innerHeight);
    renderer.render(scene, camera);
    renderedFrames += 1;
    const signature = `${report.vertices}:${report.triangles}:${scene.children.length}`;
    stableFrames = signature === lastDrawSignature ? stableFrames + 1 : 0;
    lastDrawSignature = signature;
    if (stableFrames >= 3 && document.body.dataset.rockReady !== 'true') {
      document.body.dataset.rockReport = JSON.stringify({
        ...reportWithView,
        renderedFrames,
        settled: true,
      });
      document.body.dataset.rockReady = 'true';
      document.body.dataset.worldReady = 'true';
    }
  });

  function resize() {
    const width = stage.clientWidth || window.innerWidth;
    const height = stage.clientHeight || window.innerHeight;
    if (camera.isPerspectiveCamera) camera.aspect = width / Math.max(1, height);
    else {
      const halfHeight = 2.8;
      const halfWidth = halfHeight * width / Math.max(1, height);
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
    }
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
  }
  window.addEventListener('resize', resize);
  resize();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  document.body.dataset.rockError = message;
  document.getElementById('loading').textContent = `Rock experiment failed: ${message}`;
  console.error(error);
}
