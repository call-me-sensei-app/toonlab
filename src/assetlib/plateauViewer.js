// Browser viewer + thumbnail capture for Project PLATEAU 3D Tiles.
//
// This deliberately lives beside the PLATEAU catalog client so OSS and Pro
// render the same official payload. Metadata stays light; geometry and
// textures stream on demand from api.plateauview.mlit.go.jp.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer/three';
import {
  GLTFExtensionsPlugin,
  ReorientationPlugin,
} from '3d-tiles-renderer/three/plugins';

const PLATEAU_TILES_ORIGIN = 'https://api.plateauview.mlit.go.jp';
const THUMB_CACHE = 'toonlab-plateau-thumbnails-v3';
const thumbnailUrls = new Map();
const thumbnailQueue = [];
let activeThumbnailJobs = 0;

function safeTilesetUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' || url.origin !== PLATEAU_TILES_ORIGIN) {
    throw new Error('PLATEAU tilesets must use the official HTTPS API origin.');
  }
  return url.toString();
}

function messageFromError(event) {
  const error = event?.error ?? event;
  return error instanceof Error ? error.message : String(error ?? 'Unknown 3D Tiles error');
}

/**
 * Mount an interactive, georeference-aware PLATEAU city viewer.
 *
 * @param {HTMLElement} host
 * @param {{
 *   tilesetUrl: string,
 *   interactive?: boolean,
 *   thumbnail?: boolean,
 *   onError?: (error: Error) => void,
 *   onProgress?: (progress: number) => void,
 *   onReady?: (viewer: ReturnType<typeof mountPlateauViewer>) => void,
 * }} options
 */
export function mountPlateauViewer(host, {
  tilesetUrl,
  interactive = true,
  thumbnail = false,
  onError = () => {},
  onProgress = () => {},
  onReady = () => {},
} = {}) {
  if (!(host instanceof HTMLElement)) throw new TypeError('PLATEAU viewer host must be an element.');
  const url = safeTilesetUrl(tilesetUrl);

  const scene = new Scene();
  scene.background = new Color(0x9fc6d9);

  const camera = new PerspectiveCamera(46, 1, 0.5, 50_000);
  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: thumbnail,
  });
  renderer.domElement.className = 'plateau-viewer-canvas';
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, thumbnail ? 1 : 2));
  host.appendChild(renderer.domElement);

  scene.add(
    new HemisphereLight(0xe7f5ff, 0x4e5960, 2.15),
    new DirectionalLight(0xfff1d5, 2.4),
  );
  const sun = scene.children.at(-1);
  sun.position.set(-0.8, 1.5, 0.65);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = interactive;
  controls.enableDamping = interactive;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI * 0.495;

  const tiles = new TilesRenderer(url);
  tiles.errorTarget = thumbnail ? 18 : 8;
  tiles.maxDepth = thumbnail ? 12 : Infinity;
  tiles.loadSiblings = false;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/gltf/');
  dracoLoader.setDecoderConfig({ type: 'wasm' });
  tiles.registerPlugin(new ReorientationPlugin({ recenter: true }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ autoDispose: false, dracoLoader }));
  scene.add(tiles.group);

  const rootSphere = new Sphere();
  let animationFrame = 0;
  let disposed = false;
  let fitted = false;
  let modelCount = 0;
  let readyTimer = 0;

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    tiles.setResolutionFromRenderer(camera, renderer);
  }

  function fitRoot() {
    if (!tiles.getBoundingSphere(rootSphere)) return;
    tiles.group.updateMatrixWorld(true);
    rootSphere.applyMatrix4(tiles.group.matrixWorld);

    const radius = Math.max(120, rootSphere.radius);
    const target = rootSphere.center.clone();
    const distance = thumbnail
      ? Math.max(520, Math.min(radius * 0.52, 2_400))
      : Math.max(850, Math.min(radius * 0.72, 6_500));
    const view = new Vector3(0.9, 0.72, 1).normalize().multiplyScalar(distance);

    controls.target.copy(target);
    controls.minDistance = Math.max(18, distance * 0.015);
    controls.maxDistance = Math.max(distance * 5, radius * 3);
    camera.position.copy(target).add(view);
    camera.near = Math.max(0.25, distance / 20_000);
    camera.far = Math.max(50_000, radius * 8);
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    controls.update();
    fitted = true;
  }

  function signalReady() {
    if (readyTimer || disposed || !fitted || modelCount === 0) return;
    readyTimer = window.setTimeout(() => {
      readyTimer = 0;
      if (!disposed) onReady(api);
    }, thumbnail ? 900 : 250);
  }

  const handleRoot = () => {
    // ReorientationPlugin registered first and has already applied the ECEF
    // -> local east/north/up transform when this listener runs.
    fitRoot();
    signalReady();
  };
  const handleModel = () => {
    modelCount += 1;
    signalReady();
  };
  const handleError = (event) => onError(new Error(messageFromError(event)));
  tiles.addEventListener('load-root-tileset', handleRoot);
  tiles.addEventListener('load-model', handleModel);
  tiles.addEventListener('load-error', handleError);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  function frame() {
    if (disposed) return;
    animationFrame = requestAnimationFrame(frame);
    controls.update();
    camera.updateMatrixWorld();
    tiles.update();
    onProgress(tiles.loadProgress);
    renderer.render(scene, camera);
  }
  frame();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    clearTimeout(readyTimer);
    resizeObserver.disconnect();
    tiles.removeEventListener('load-root-tileset', handleRoot);
    tiles.removeEventListener('load-model', handleModel);
    tiles.removeEventListener('load-error', handleError);
    tiles.dispose();
    dracoLoader.dispose();
    controls.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  const api = Object.freeze({
    camera,
    canvas: renderer.domElement,
    controls,
    dispose,
    renderer,
    scene,
    tiles,
  });
  return api;
}

async function readCachedThumbnail(id) {
  if (thumbnailUrls.has(id)) return thumbnailUrls.get(id);
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(THUMB_CACHE);
    const response = await cache.match(new Request(`/__plateau-thumb-cache/${encodeURIComponent(id)}.webp`));
    if (!response) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    thumbnailUrls.set(id, objectUrl);
    return objectUrl;
  } catch {
    return null;
  }
}

async function writeCachedThumbnail(id, blob) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(THUMB_CACHE);
    await cache.put(
      new Request(`/__plateau-thumb-cache/${encodeURIComponent(id)}.webp`),
      new Response(blob, {
        headers: {
          'cache-control': 'public, max-age=31536000, immutable',
          'content-type': blob.type || 'image/webp',
        },
      }),
    );
  } catch {
    // Private browsing and small storage quotas can reject CacheStorage.
  }
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not capture PLATEAU preview.'))),
      'image/webp',
      0.84,
    );
  });
}

function drainThumbnailQueue() {
  while (activeThumbnailJobs < 2 && thumbnailQueue.length > 0) {
    const job = thumbnailQueue.shift();
    if (job.cancelled || !job.host.isConnected) continue;
    activeThumbnailJobs += 1;
    job.run()
      .catch(() => {})
      .finally(() => {
        activeThumbnailJobs -= 1;
        drainThumbnailQueue();
      });
  }
}

async function renderThumbnail(job) {
  const { host, id, tilesetUrl } = job;
  const cached = await readCachedThumbnail(id);
  if (job.cancelled || !host.isConnected) return;
  if (cached) {
    host.style.backgroundImage = `url("${cached}")`;
    host.classList.add('plateau-thumb-ready');
    return;
  }

  const stage = document.createElement('div');
  stage.className = 'plateau-thumbnail-stage';
  host.appendChild(stage);

  let viewer = null;
  let timeout = 0;
  try {
    await new Promise((resolve, reject) => {
      timeout = window.setTimeout(() => reject(new Error('PLATEAU preview timed out.')), 25_000);
      viewer = mountPlateauViewer(stage, {
        tilesetUrl,
        interactive: false,
        thumbnail: true,
        onError: reject,
        onReady: resolve,
      });
    });
    if (job.cancelled || !host.isConnected) return;
    const blob = await canvasBlob(viewer.canvas);
    await writeCachedThumbnail(id, blob);
    const objectUrl = URL.createObjectURL(blob);
    thumbnailUrls.set(id, objectUrl);
    host.style.backgroundImage = `url("${objectUrl}")`;
    host.classList.add('plateau-thumb-ready');
  } finally {
    clearTimeout(timeout);
    viewer?.dispose();
    stage.remove();
  }
}

/**
 * Lazily replace a PLATEAU card placeholder with a real render of its tiles.
 * Captures are bounded to two WebGL jobs and cached as WebP in CacheStorage.
 *
 * @returns {() => void} cleanup
 */
export function hydratePlateauThumbnail(host, { id, tilesetUrl } = {}) {
  if (!(host instanceof HTMLElement)) throw new TypeError('PLATEAU thumbnail host must be an element.');
  const job = {
    cancelled: false,
    host,
    id: String(id),
    tilesetUrl: safeTilesetUrl(tilesetUrl),
    run() {
      return renderThumbnail(this);
    },
  };

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    thumbnailQueue.push(job);
    drainThumbnailQueue();
  }, { rootMargin: '280px' });
  observer.observe(host);

  return () => {
    job.cancelled = true;
    observer.disconnect();
  };
}
