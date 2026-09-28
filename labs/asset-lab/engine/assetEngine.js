// Asset Browser stage: one fullscreen preview scene that shows any remote
// CC0 asset THROUGH the active style set — models and tiling texture sets are
// loaded once (cached), then re-shaded per style via applyEnvironmentShader,
// so what you see is exactly what a world using that preset would render.
//
// Compare mode keeps TWO copies of the subject — original materials and the
// styled conversion — and renders them in one frame with a scissor split at
// `split` (0..1 of the viewport): original on the left, styled on the right.
//
// Lighting is a three-light lookdev rig, individually toggleable:
//   sun  — directional key; drives the toon ramp and is the ONLY shadow caster
//   sky  — hemisphere fill; lifts the shade side (ambient bounce)
//   fill — soft camera-side directional, no shadows; silhouette/front fill
//
// Automation contract (lab-probe / MCP preview assert these):
//   document.body.dataset.modelReady   — 'loading' while a show is in flight,
//                                        'true' after a successful show,
//                                        'error' if boot or load fails
//   document.body.dataset.assetShown   — "<source>/<id>@<style>" of the last show

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  applyEnvironmentShader,
  createEnvironmentSunShadowPass,
  resolveEnvironmentPreset,
} from '@call-me-sensei/toonlab/environment';
import {
  fetchPolyhavenFiles,
  GALLERY_MATERIAL_FAMILY,
  loadAmbientcgTextureMaterial,
  loadImportedModel,
  loadImportedTextureMaterial,
  resolveGalleryMaterialFamily,
  resolveAmbientcgDownload,
  resolvePolyhavenModelDownload,
  resolvePolyhavenTextureDownload,
  rewriteAmbientcgDownloadUrl,
  rewritePolyPizzaDownloadUrl,
} from '@call-me-sensei/toonlab/assetlib';
import {
  applyRockShader,
  setRockShaderSceneState,
} from '@call-me-sensei/toonlab/rock-shader';
import {
  classifyUrbanPropSurface,
  createUrbanAnimePropNodeMaterial,
  createUrbanPropShaderControls,
} from '../../../examples/urban-prop-shader/urbanPropMaterial.js';

function cloneWithMaterials(object) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child.isMesh) {
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material.clone())
        : child.material.clone();
    }
  });
  return clone;
}

// Lookdev backdrops. 'studio' is the default: a NEUTRAL gray floor + backdrop
// so nothing bounces a color cast onto the asset while you judge it (the
// grass-green catalog stage tints everything warm-green). 'outdoor' shows the
// asset in world-ish context; 'dark' for emissive/silhouette checks.
const BACKDROPS = {
  dark: { background: 0x101318, floor: 0x2b2f34, sky: [0x5b6470, 0x23262b] },
  outdoor: { background: 0x141c26, floor: 0x55804b, sky: [0xbdd7f5, 0x3d5a3a] },
  studio: { background: 0x22262c, floor: 0x8d9298, sky: [0xcfd6de, 0x565c63] },
};

const LOOKDEV_LIGHTING = Object.freeze({
  imported: Object.freeze({ sunColor: 0xfff2dd, sunIntensity: 2.2, sunZ: -1 }),
  // The reviewed Call Me Sensei rock material is authored against the
  // package's white intensity-8 daylight key. Using the generic warm 2.2 key
  // makes the dedicated material read muddy even when its colors/layers are
  // otherwise correct.
  rock: Object.freeze({ sunColor: 0xffffff, sunIntensity: 8, sunZ: 1 }),
});

const geologyRockTextureCache = new Map();

async function loadGalleryRockTextures(config) {
  if (Number(config?.version) < 2
    || !['toonlab/c7-geology-surface', 'toonlab/c8-first12-geology-surface']
      .includes(config?.surfacePackage?.schema)) return null;
  const roles = ['rock', 'rockNormal', 'rockAo', 'smoothness'];
  const loaded = await Promise.all(roles.map(async (role) => {
    const source = config.textures?.[role];
    const url = String(source?.url ?? '').trim();
    if (!url) throw new Error(`Gallery rock material config is missing textures.${role}.url.`);
    if (!geologyRockTextureCache.has(url)) {
      const promise = new THREE.TextureLoader().loadAsync(url).then((texture) => {
        texture.colorSpace = source.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.flipY = false;
        texture.generateMipmaps = true;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.name = `Gallery geology ${role}`;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
      }).catch((error) => {
        geologyRockTextureCache.delete(url);
        throw error;
      });
      geologyRockTextureCache.set(url, promise);
    }
    return [role, await geologyRockTextureCache.get(url)];
  }));
  return Object.fromEntries(loaded);
}

async function applyGalleryRockNeutralPbr(object, config) {
  if (config?.schema !== 'toonlab.pro-rock-material') return null;
  const textures = await loadGalleryRockTextures(config);
  if (!textures) return null;
  return applyRockShader(object, {
    preset: 'neutral',
    assetIntegration: {
      sourceAlbedoMode: 'replace',
      sourceAlbedoStrength: 0,
      sourceAoStrength: 0,
      sourceNormalStrength: 0,
      vertexAoStrength: 0,
      vertexColorStrength: 0,
    },
    distanceTint: { strength: 0 },
    material: { tint: [1, 1, 1], useSmoothnessTexture: true },
    projection: {
      ...(config.shader?.settings?.projection ?? {}),
      brightness: 0,
      contrast: 1,
      saturation: 1,
      nearDetailStrength: 0,
    },
  }, {
    name: `ToonLab neutral PBR · ${config.label ?? 'Official rock'}`,
    textures,
    variation: Number(config.surfacePackage?.seed ?? 0),
  });
}

export function createAssetEngine({ mount }) {
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // The shared factory does not opt into shadows (prop-lab enables its own);
  // without this the sun's castShadow is silently ignored.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKDROPS.studio.background);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  camera.position.set(4, 3, 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: BACKDROPS.studio.floor, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- lookdev light rig ---------------------------------------------------
  const lights = {
    fill: new THREE.DirectionalLight(0xdfe9ff, 0.6),
    sky: new THREE.HemisphereLight(BACKDROPS.studio.sky[0], BACKDROPS.studio.sky[1], 0.85),
    sun: new THREE.DirectionalLight(0xfff2dd, 2.2),
  };
  lights.sun.position.set(-6, 9, -4);
  lights.sun.castShadow = true;
  lights.sun.shadow.mapSize.set(2048, 2048);
  lights.sun.shadow.bias = -0.0002;
  lights.sun.shadow.normalBias = 0.02;
  lights.fill.position.set(6, 4, 7); // camera side, silhouettes/front — never shadows
  lights.fill.visible = false; // default matches the classic sun+sky stage
  scene.add(lights.sun, lights.sun.target, lights.sky, lights.fill);

  // Styled meshes carry TSL environment materials, which never read three's
  // native shadow maps — without this pass the toonified side renders fully
  // lit (no rail-on-deck self-shadowing) while the classic-material original
  // side and ground shadow correctly. Native shadowMap stays enabled above
  // for those classic receivers; this pass feeds only the TSL side.
  const sunShadowPass = createEnvironmentSunShadowPass({ renderer, scene });
  let subjectLightingProfile = 'imported';

  function setBackdrop(name) {
    const backdrop = BACKDROPS[name] ?? BACKDROPS.studio;
    scene.background.set(backdrop.background);
    ground.material.color.set(backdrop.floor);
    lights.sky.color.set(backdrop.sky[0]);
    lights.sky.groundColor.set(backdrop.sky[1]);
  }

  function setSubjectLighting(profile = 'imported') {
    const lighting = LOOKDEV_LIGHTING[profile] ?? LOOKDEV_LIGHTING.imported;
    subjectLightingProfile = profile in LOOKDEV_LIGHTING ? profile : 'imported';
    lights.sun.color.set(lighting.sunColor);
    lights.sun.intensity = lighting.sunIntensity;
  }

  // pristine load results, keyed by source/id/resolution — style switches
  // re-shade a fresh clone instead of re-downloading
  const modelCache = new Map();
  const materialCache = new Map();

  let current = null; // { styled, original }
  let token = 0;
  let compare = false;
  let split = 0.5;
  let textureShape = 'duo'; // 'duo' | 'sphere' | 'cube' | 'cylinder' | 'torus' | 'knot' | 'plane'
  let mapChannel = 'lit'; // 'lit' | albedo/height/normal/roughness/metalness/occlusion/emissive
  let channelMesh = null; // flat unlit quad showing the selected raw map
  let viewMode = '3d'; // '3d' orbit | '2d' straight-on, rotation locked
  let lastKind = null;
  let lastMaterialFamily = GALLERY_MATERIAL_FAMILY.environment;
  let lastRockMaterialConfig = null;
  let lastStylePreset = 'default';
  let viewWidth = 0;
  let viewHeight = 0;

  function disposeSubject(object) {
    if (!object) return;
    scene.remove(object);
    object.traverse((child) => {
      if (child.isMesh) child.geometry?.dispose();
    });
  }

  function clearCurrent() {
    if (!current) return;
    disposeSubject(current.styled);
    disposeSubject(current.original);
    current = null;
  }

  function frame(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const reach = Math.max(size.x, size.y, size.z, 0.8);
    controls.target.copy(center);
    camera.position.set(
      center.x + reach * 1.1,
      center.y + reach * 0.8,
      center.z + reach * 1.4,
    );
    camera.near = Math.max(reach / 100, 0.02);
    camera.far = Math.max(reach * 40, 50);
    camera.updateProjectionMatrix();
    // fit the sun's shadow frustum to the subject — the default ±5 box gives
    // blocky or missing shadows on anything much smaller/larger than 10 m
    const sun = lights.sun;
    sun.target.position.copy(center);
    const lighting = LOOKDEV_LIGHTING[subjectLightingProfile] ?? LOOKDEV_LIGHTING.imported;
    sun.position.set(
      center.x - reach * 1.5,
      center.y + reach * 2.2,
      center.z + reach * lighting.sunZ,
    );
    const span = reach * 1.8;
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = reach * 8;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function applyUrbanObjectShader(object) {
    const controls = createUrbanPropShaderControls('source');
    object.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materialWasArray = Array.isArray(child.material);
      const sourceMaterials = materialWasArray ? child.material : [child.material];
      const urbanMaterials = sourceMaterials.map((sourceMaterial) => {
        const isTranslucent = sourceMaterial.transparent
          || Number(sourceMaterial.opacity ?? 1) < 0.999
          || Number(sourceMaterial.transmission ?? 0) > 0;
        if (isTranslucent) {
          sourceMaterial.userData = {
            ...sourceMaterial.userData,
            galleryUrbanShaderExcluded: 'translucent-material-family',
          };
          return sourceMaterial;
        }
        return createUrbanAnimePropNodeMaterial(sourceMaterial, {
          controls,
          surface: classifyUrbanPropSurface(child, sourceMaterial),
        });
      });
      child.material = materialWasArray ? urbanMaterials : urbanMaterials[0];
    });
  }

  async function stylize(object, stylePreset, {
    materialFamily = GALLERY_MATERIAL_FAMILY.environment,
    rockMaterialConfig = null,
    scanStylize = true,
  } = {}) {
    if (rockMaterialConfig?.schema === 'toonlab.pro-rock-material') {
      const variationMatch = String(rockMaterialConfig.variationId ?? '').match(/_(\d+)$/);
      const variation = variationMatch ? Number.parseInt(variationMatch[1], 10) : 0;
      const settings = {
        preset: rockMaterialConfig.shader?.preset ?? 'call_me_sensei',
        ...(rockMaterialConfig.shader?.settings ?? {}),
      };
      const textures = await loadGalleryRockTextures(rockMaterialConfig);
      const report = applyRockShader(object, settings, {
        name: `ToonLab · ${rockMaterialConfig.label ?? 'Official rock'}`,
        ...(textures ? { textures } : {}),
        variation,
      });
      setRockShaderSceneState(object, { skyColor: `#${lights.sky.color.getHexString()}` });
      object.userData.toonLabRockMaterialConfig = {
        applied: report.applied,
        c7Maps: Boolean(textures),
        schema: rockMaterialConfig.schema,
        variationId: rockMaterialConfig.variationId ?? null,
        version: rockMaterialConfig.version ?? null,
      };
    } else if (materialFamily === GALLERY_MATERIAL_FAMILY.urban) {
      applyUrbanObjectShader(object);
    } else {
      const preset = resolveEnvironmentPreset(stylePreset);
      await applyEnvironmentShader(object, {
        bakeVertexAo: false,
        features: preset.features,
        hasSun: true,
        parameters: { saturation: 1.1, ...preset.parameters },
        // Everything browsed here is a photoscan/photo texture; the 'auto'
        // heuristic only recognizes photoscan/Fab naming, so force the
        // painterly simplify pass (photo grain → gradients, detail-map
        // compression) — without it imports read as posterized photos.
        scanStylize,
      });
    }
    // The sun-shadow pass flips FrontSide casters to BackSide (three's acne
    // guard), but converted materials default to DoubleSide — their own
    // front faces land in the depth map and the whole model self-shadows.
    // The TSL compare has no normalBias, so pin BackSide explicitly; imports
    // here are closed low-poly meshes where the far side is the right depth.
    object.traverse((child) => {
      if (!child.isMesh) return;
      for (const mat of Array.isArray(child.material) ? child.material : [child.material]) {
        if (mat) mat.shadowSide = THREE.BackSide;
      }
    });
  }

  function mountSubject(originalDisplay, styledDisplay) {
    clearCurrent();
    originalDisplay.visible = false; // tick() drives visibility per pass
    scene.add(originalDisplay);
    scene.add(styledDisplay);
    current = { original: originalDisplay, styled: styledDisplay };
    frame(styledDisplay);
    sunShadowPass.invalidate(); // new casters, possibly identical sun pose
  }

  function buildTextureStage(materialInput) {
    // Accepts one material (initial show clones for the second mesh) or an
    // array of salvaged materials (shape switches reuse, never re-shade).
    const mats = Array.isArray(materialInput)
      ? materialInput
      : [materialInput, materialInput.clone()];
    const group = new THREE.Group();
    if (textureShape === 'duo') {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mats[0]);
      sphere.position.set(-1.4, 1, 0);
      sphere.castShadow = true;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mats[1] ?? mats[0]);
      panel.position.set(1.4, 1.2, 0);
      group.add(sphere, panel);
    } else {
      const geometry = textureShape === 'cube'
        ? new THREE.BoxGeometry(1.28, 1.28, 1.28)
        : textureShape === 'cylinder'
          ? new THREE.CylinderGeometry(0.68, 0.68, 1.43, 48)
          : textureShape === 'torus'
            ? new THREE.TorusGeometry(0.62, 0.26, 24, 72)
            : textureShape === 'knot'
              ? new THREE.TorusKnotGeometry(0.55, 0.18, 160, 24)
              : textureShape === 'plane'
                ? new THREE.PlaneGeometry(2.6, 2.6)
                : new THREE.SphereGeometry(0.86, 48, 32);
      const mesh = new THREE.Mesh(geometry, mats[0]);
      const lift = textureShape === 'cube' ? 0.64
        : textureShape === 'cylinder' ? 0.72
          : textureShape === 'torus' ? 0.88
            : textureShape === 'knot' ? 0.78
              : textureShape === 'plane' ? 1.4 : 0.86;
      mesh.position.set(0, lift, 0);
      mesh.castShadow = textureShape !== 'plane';
      group.add(mesh);
    }
    group.traverse((child) => { if (child.isMesh) child.receiveShadow = true; });
    return group;
  }

  function subjectMaterials(group) {
    const mats = [];
    group?.traverse((child) => { if (child.isMesh && child.material) mats.push(child.material); });
    return mats;
  }

  function applyViewMode() {
    controls.enableRotate = viewMode === '3d';
    controls.enablePan = viewMode === '3d';
    if (viewMode === '2d' && current?.styled) {
      const box = new THREE.Box3().setFromObject(current.styled);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const reach = Math.max(size.x, size.y, size.z, 0.8);
      controls.target.copy(center);
      camera.position.set(center.x, center.y, center.z + reach * 1.9);
      camera.updateProjectionMatrix();
    } else if (viewMode === '3d' && current?.styled) {
      frame(current.styled);
    }
  }

  const CHANNEL_PROPS = {
    albedo: ['map'],
    emissive: ['emissiveMap'],
    height: ['displacementMap', 'bumpMap'],
    metalness: ['metalnessMap'],
    normal: ['normalMap'],
    occlusion: ['aoMap'],
    roughness: ['roughnessMap'],
  };

  function clearChannelMesh() {
    if (!channelMesh) return;
    scene.remove(channelMesh);
    channelMesh.geometry?.dispose();
    channelMesh.material?.dispose(); // basic material only — the texture stays cached
    channelMesh = null;
  }

  /** Raw-map inspector (2D): shows one PBR channel unlit. Returns true when
   *  the source material has that map. 'lit' restores normal rendering. */
  function setMapChannel(channel) {
    mapChannel = channel;
    clearChannelMesh();
    if (channel === 'lit') return true;
    const sourceMats = subjectMaterials(current?.original);
    const texture = (CHANNEL_PROPS[channel] ?? [])
      .map((prop) => sourceMats[0]?.[prop])
      .find(Boolean);
    if (!texture) return false;
    channelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    channelMesh.position.set(0, 1.4, 0);
    scene.add(channelMesh);
    return true;
  }

  function rebuildTextureStage() {
    if (!current || lastKind !== 'texture') return;
    const styledMats = subjectMaterials(current.styled);
    const originalMats = subjectMaterials(current.original);
    if (styledMats.length === 0) return;
    // Preserve the camera across shape switches — reframing would zoom to
    // fit and cancel out intentional size differences between shapes.
    const savedPos = camera.position.clone();
    const savedTarget = controls.target.clone();
    mountSubject(buildTextureStage(originalMats), buildTextureStage(styledMats));
    if (viewMode === '3d') {
      camera.position.copy(savedPos);
      controls.target.copy(savedTarget);
    } else {
      applyViewMode();
    }
  }

  function loadTextureMaterialCached(ref, resolution, repeat = 3) {
    const cacheKey = `${ref.source}/${ref.id}@${resolution}`;
    if (!materialCache.has(cacheKey)) {
      materialCache.set(cacheKey, (async () => {
        if (ref.source === 'ambientcg') {
          // zip download via the backend/dev proxy; recipe keeps the origin url
          const download = resolveAmbientcgDownload(ref, { resolution: resolution.toUpperCase() });
          const material = await loadAmbientcgTextureMaterial(download, {
            repeat,
            rewriteUrl: rewriteAmbientcgDownloadUrl,
          });
          return { download, material };
        }
        const files = await fetchPolyhavenFiles(ref.id);
        const textureSet = resolvePolyhavenTextureDownload(files, { resolution });
        return { material: await loadImportedTextureMaterial(textureSet, { repeat }), textureSet };
      })());
      materialCache.get(cacheKey).catch(() => materialCache.delete(cacheKey));
    }
    return materialCache.get(cacheKey);
  }

  /** Named parts (meshes) of the current model — retexture targets. */
  function listParts() {
    const parts = [];
    current?.styled?.traverse((child) => {
      if (child.isMesh) parts.push(child.name || `part_${parts.length + 1}`);
    });
    return parts;
  }

  /**
   * Rebind a texture set onto the current model (all parts, or one by
   * index). The swapped material is re-shaded through the last style set;
   * the compare wipe keeps showing the untouched original. Free + client-side.
   */
  async function applyTexture(ref, { resolution = '1k', partIndex = null } = {}) {
    if (!current?.styled || lastKind !== 'model') return { error: 'no model loaded', ok: false };
    try {
      const { material } = await loadTextureMaterialCached(ref, resolution);
      const meshes = [];
      current.styled.traverse((child) => { if (child.isMesh) meshes.push(child); });
      const targets = partIndex === null ? meshes : [meshes[partIndex]].filter(Boolean);
      if (targets.length === 0) return { error: 'part not found', ok: false };
      for (const mesh of targets) {
        mesh.material = material.clone();
        await stylize(mesh, lastStylePreset, {
          materialFamily: lastMaterialFamily,
          rockMaterialConfig: lastRockMaterialConfig,
        });
      }
      sunShadowPass.invalidate(); // cutout silhouettes may have changed
      return { ok: true };
    } catch (error) {
      return { error: error?.message ?? String(error), ok: false };
    }
  }

  /**
   * Shows a normalized ref in the given style set. Returns { ok, error? };
   * stale calls (superseded by a newer show) resolve ok:false without
   * touching the scene.
   */
  async function show(ref, {
    materialFamily = null,
    resolution = '1k',
    rockMaterialConfig = null,
    scanStylize = true,
    stylePreset = 'default',
    repeat = 3,
  } = {}) {
    const reportModelState = (state, error = '') => {
      document.body.dataset.modelReady = state;
      if (error) document.body.dataset.modelError = error.slice(0, 160);
      else delete document.body.dataset.modelError;
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'toonlab:asset-preview-state',
          state,
          error: error ? error.slice(0, 160) : '',
        }, window.location.origin);
      }
    };
    const myToken = ++token;
    // Downloads can take a while — flag the flight so hosts (e.g. the pro
    // asset page) can show a loader for every show, not just the first boot.
    reportModelState('loading');
    try {
      if (ref.kind === 'model') {
        lastKind = 'model';
        lastMaterialFamily = materialFamily ?? resolveGalleryMaterialFamily(ref);
        lastRockMaterialConfig = rockMaterialConfig;
        setSubjectLighting(
          rockMaterialConfig?.schema === 'toonlab.pro-rock-material' ? 'rock' : 'imported',
        );
        lastStylePreset = stylePreset;
        const cacheKey = `${ref.source}/${ref.id}@${resolution}`;
        if (!modelCache.has(cacheKey)) {
          modelCache.set(cacheKey, (async () => {
            if (ref.source === 'polypizza') {
              // single-file GLB, fetched through the backend/dev proxy;
              // the recipe keeps the origin url
              return {
                download: ref.download,
                pristine: await loadImportedModel({
                  renderer,
                  url: rewritePolyPizzaDownloadUrl(ref.download.url),
                }),
              };
            }
            if (ref.download?.url) {
              // sources whose refs carry the download directly (KayKit /
              // Open Source 3D raw GitHub urls send CORS `*`; manual imports
              // pass object-urls) — no proxy, no files-doc round trip
              return {
                download: ref.download,
                pristine: await loadImportedModel({ ...ref.download, renderer }),
              };
            }
            const files = await fetchPolyhavenFiles(ref.id);
            const download = resolvePolyhavenModelDownload(files, { resolution });
            return {
              download,
              pristine: await loadImportedModel({ ...download, renderer }),
            };
          })());
          modelCache.get(cacheKey).catch(() => modelCache.delete(cacheKey));
        }
        const { download, pristine } = await modelCache.get(cacheKey);
        if (myToken !== token) return { ok: false, stale: true };
        const styledDisplay = cloneWithMaterials(pristine);
        const originalDisplay = cloneWithMaterials(pristine);
        const box = new THREE.Box3().setFromObject(styledDisplay);
        styledDisplay.position.y -= box.min.y;
        originalDisplay.position.y -= box.min.y;
        await applyGalleryRockNeutralPbr(originalDisplay, rockMaterialConfig);
        await stylize(styledDisplay, stylePreset, {
          materialFamily: lastMaterialFamily,
          rockMaterialConfig,
          scanStylize,
        });
        if (myToken !== token) return { ok: false, stale: true };
        mountSubject(originalDisplay, styledDisplay);
        reportModelState('true');
        document.body.dataset.assetShown = `${ref.source}/${ref.id}@${stylePreset}`;
        document.body.dataset.assetMaterialFamily = lastMaterialFamily;
        return { download, ok: true };
      }

      if (ref.kind === 'texture') {
        setSubjectLighting('imported');
        lastKind = 'texture';
        lastMaterialFamily = GALLERY_MATERIAL_FAMILY.environment;
        lastStylePreset = stylePreset;
        const { material, textureSet, download } = await loadTextureMaterialCached(ref, resolution);
        if (myToken !== token) return { ok: false, stale: true };
        const styledDisplay = buildTextureStage(material.clone());
        const originalDisplay = buildTextureStage(material.clone());
        await stylize(styledDisplay, stylePreset);
        if (myToken !== token) return { ok: false, stale: true };
        mountSubject(originalDisplay, styledDisplay);
        reportModelState('true');
        document.body.dataset.assetShown = `${ref.source}/${ref.id}@${stylePreset}`;
        document.body.dataset.assetMaterialFamily = lastMaterialFamily;
        return { download, ok: true, textureSet };
      }

      return { error: `Unsupported asset kind "${ref.kind}".`, ok: false };
    } catch (error) {
      const message = error?.message ?? String(error);
      if (myToken === token) reportModelState('error', message);
      return { error: message, ok: false };
    }
  }

  let disposed = false;
  const tick = () => {
    if (disposed) return;
    controls.update();
    if (mapChannel !== 'lit' && channelMesh) {
      if (current) {
        current.styled.visible = false;
        if (current.original) current.original.visible = false;
      }
      renderer.render(scene, camera);
      return;
    }
    if (compare && current?.original) {
      // Refresh the TSL sun-shadow map before scissoring (a scissored render
      // would clip the shadow target). The two copies coincide in space, so
      // the styled casters serve both sides of the wipe.
      current.styled.visible = true;
      current.original.visible = false;
      sunShadowPass.update();
      const splitX = Math.round(viewWidth * split);
      renderer.setScissorTest(true);
      current.styled.visible = false;
      current.original.visible = true;
      renderer.setScissor(0, 0, splitX, viewHeight);
      renderer.render(scene, camera);
      current.original.visible = false;
      current.styled.visible = true;
      renderer.setScissor(splitX, 0, viewWidth - splitX, viewHeight);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
    } else {
      if (current) {
        current.styled.visible = true;
        if (current.original) current.original.visible = false;
      }
      sunShadowPass.update();
      renderer.render(scene, camera);
    }
  };

  async function start() {
    await whenRendererReady(renderer);
    renderer.setAnimationLoop(tick);
    resize();
  }

  const resize = () => {
    viewWidth = mount.clientWidth || window.innerWidth;
    viewHeight = mount.clientHeight || window.innerHeight;
    renderer.setSize(viewWidth, viewHeight);
    // With the HUD visible, the left ~720px is sidebar + results grid: render
    // as if the canvas extended that far left so the subject centers in the
    // free area. Headless (?hud=0) gets a plain centered frame.
    const hudPad = document.body.dataset.hideHud === 'true'
      ? 0
      : Math.min(720, Math.floor(viewWidth * 0.45));
    camera.aspect = (viewWidth + hudPad) / viewHeight;
    camera.setViewOffset(viewWidth + hudPad, viewHeight, 0, 0, viewWidth, viewHeight);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  return {
    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);
      sunShadowPass.dispose();
      for (const texturePromise of geologyRockTextureCache.values()) {
        void texturePromise.then((texture) => texture.dispose()).catch(() => {});
      }
      geologyRockTextureCache.clear();
      renderer.domElement.remove();
    },
    getCurrentObject: () => current?.styled ?? null,
    /** Compare wipe: show original materials left of the split. */
    setCompare(enabled) {
      compare = Boolean(enabled);
    },
    /** 'studio' (neutral, default) | 'outdoor' | 'dark' */
    setBackdrop,
    /** name: 'sun' | 'sky' | 'fill' */
    setLight(name, on) {
      if (lights[name]) lights[name].visible = Boolean(on);
    },
    setSplit(fraction) {
      split = Math.min(0.98, Math.max(0.02, Number(fraction) || 0.5));
    },
    /** Texture preview geometry: 'duo' (sphere+panel) | 'sphere' | 'cube' | 'cylinder' | 'plane'. */
    setTextureShape(shape) {
      if (!['duo', 'sphere', 'cube', 'cylinder', 'torus', 'knot', 'plane'].includes(shape)) return;
      textureShape = shape;
      rebuildTextureStage();
    },
    /** 2D raw-map inspector: 'lit' | 'albedo' | 'height' | 'normal' |
     *  'roughness' | 'metalness' | 'occlusion' | 'emissive'. */
    setMapChannel,
    /** '3d' orbit (default) | '2d' straight-on with rotation locked. */
    setViewMode(mode) {
      viewMode = mode === '2d' ? '2d' : '3d';
      if (viewMode === '3d') setMapChannel('lit');
      if (viewMode === '2d' && lastKind === 'texture' && textureShape !== 'plane') {
        textureShape = 'plane';
        rebuildTextureStage();
      } else {
        applyViewMode();
      }
    },
    show,
    /** Retexture support (model pages): part names + texture rebinding. */
    listParts,
    applyTexture,
    start,
  };
}
