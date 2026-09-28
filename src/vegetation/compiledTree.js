import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';

export const COMPILED_TREE_MANIFEST_SCHEMA = 'toonlab/compiled-tree';
export const COMPILED_TREE_MANIFEST_VERSION = 1;

export const TREE_RUNTIME_QUALITY_PROFILES = Object.freeze({
  mobile: Object.freeze({
    detailedCount: 30,
    maxPlacements: 1500,
    variants: 3,
  }),
  balanced: Object.freeze({
    detailedCount: 72,
    maxPlacements: 2200,
    variants: 5,
  }),
  high: Object.freeze({
    detailedCount: 120,
    maxPlacements: 3000,
    variants: 8,
  }),
});

const REQUIRED_LOD_LEVELS = 4;

const COMPILED_TREE_SINGLE_ROLE_EXEMPTION = 'CompiledTreeSingleRoleLod';

function compiledTreeMaterialRole(material) {
  return material?.userData?.treeMaterialRole
    ?? (/bark|trunk/i.test(material?.name ?? '')
      ? 'bark'
      : /single|proxy|surface/i.test(material?.name ?? '')
        ? 'surface'
        : 'leaf');
}

function compiledTreeMaterialId(role) {
  if (role === 'bark') return 'CompiledTreeBark';
  if (role === 'surface') return 'CompiledTreeSurface';
  return 'CompiledTreeFoliage';
}

function attachCompiledTreeStyleTarget(root, styleTarget = {}) {
  const materialIds = new Set();
  root.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const role = compiledTreeMaterialRole(material);
      material.userData.treeMaterialRole = role;
      const materialId = compiledTreeMaterialId(role);
      markFactoryStyleMaterial(material, materialId);
      materialIds.add(materialId);
    }
  });
  const assignments = {};
  if (materialIds.has('CompiledTreeBark')) {
    assignments.CompiledTreeBark = { roles: ['woodySurface'] };
  }
  if (materialIds.has('CompiledTreeFoliage')) {
    assignments.CompiledTreeFoliage = { roles: ['foliageCard'] };
  }
  if (materialIds.has('CompiledTreeSurface')) {
    assignments.CompiledTreeSurface = {
      exemptionId: COMPILED_TREE_SINGLE_ROLE_EXEMPTION,
      roles: ['foliageCard', 'woodySurface'],
    };
  }
  attachFactoryStyleTarget(root, 'vegetation.tree', {
    assetId: root.userData?.compiledTreeManifest?.catalogId,
    targetId: 'toonlab/compiled-tree',
    ...styleTarget,
    materials: {
      assignments,
      ...(materialIds.has('CompiledTreeSurface') ? {
        exemptions: {
          [COMPILED_TREE_SINGLE_ROLE_EXEMPTION]: {
            approved: true,
            fallbackRole: 'foliageCard',
            reason: 'The far compiled LOD intentionally bakes bark and foliage into one bounded proxy surface.',
            strategy: 'single-role',
          },
        },
      } : {}),
      ...(styleTarget.materials ?? {}),
    },
  });
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanUrl(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function validateCompiledTreeManifest(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Compiled tree manifest must be an object.'] };
  }
  if (input.schema !== COMPILED_TREE_MANIFEST_SCHEMA) {
    errors.push(`schema must be "${COMPILED_TREE_MANIFEST_SCHEMA}".`);
  }
  if (input.version !== COMPILED_TREE_MANIFEST_VERSION) {
    errors.push(`version must be ${COMPILED_TREE_MANIFEST_VERSION}.`);
  }
  if (typeof input.catalogId !== 'string' || !input.catalogId.trim()) {
    errors.push('catalogId is required.');
  }
  if (typeof input.recipeHash !== 'string' || !/^[a-f0-9]{8,64}$/i.test(input.recipeHash)) {
    errors.push('recipeHash must be a hexadecimal content hash.');
  }
  if (!input.artifacts || typeof input.artifacts !== 'object'
    || !cleanUrl(input.artifacts.geometry)) {
    errors.push('artifacts.geometry URL is required.');
  } else if (input.artifacts.textures !== undefined && (
    !input.artifacts.textures || typeof input.artifacts.textures !== 'object'
    || Array.isArray(input.artifacts.textures)
    || Object.values(input.artifacts.textures).some((value) => !cleanUrl(value))
  )) {
    errors.push('artifacts.textures must map texture roles to non-empty KTX2 URLs.');
  }
  if (!Array.isArray(input.lods) || input.lods.length !== REQUIRED_LOD_LEVELS) {
    errors.push(`lods must contain exactly ${REQUIRED_LOD_LEVELS} levels.`);
  } else {
    let previousCoverage = Infinity;
    input.lods.forEach((lod, index) => {
      if (lod.level !== index) errors.push(`lods[${index}].level must be ${index}.`);
      if (typeof lod.node !== 'string' || !lod.node) errors.push(`lods[${index}].node is required.`);
      if (!Number.isFinite(Number(lod.triangles)) || Number(lod.triangles) < 0) {
        errors.push(`lods[${index}].triangles must be non-negative.`);
      }
      const coverage = finite(lod.minScreenCoverage, -1);
      if (coverage < 0 || coverage > 1 || coverage > previousCoverage) {
        errors.push('LOD minScreenCoverage values must descend from near to far.');
      }
      previousCoverage = coverage;
    });
  }
  if (!input.bounds || !Array.isArray(input.bounds.center)
    || input.bounds.center.length !== 3 || finite(input.bounds.radius, -1) <= 0) {
    errors.push('bounds must contain center[3] and a positive radius.');
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: input };
}

export function parseCompiledTreeManifest(input) {
  const result = validateCompiledTreeManifest(input);
  if (!result.ok) throw new Error(`Invalid compiled tree manifest: ${result.errors.join(' ')}`);
  return result.value;
}

export function projectedTreeScreenCoverage(camera, worldCenter, radius, viewportHeight = null) {
  if (!camera?.projectionMatrix || !worldCenter) return 0;
  const cameraPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraPosition);
  const distance = Math.max(cameraPosition.distanceTo(worldCenter), 1e-4);
  const projectionScale = Math.abs(camera.projectionMatrix.elements[5]) || 1;
  const resolvedViewportHeight = Math.max(
    1,
    finite(viewportHeight ?? camera.userData?.viewportHeight ?? globalThis.innerHeight, 1),
  );
  const projectedRadiusPixels = finite(radius) * projectionScale / distance * resolvedViewportHeight;
  return Math.max(0, projectedRadiusPixels / resolvedViewportHeight);
}

function materialList(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => materials.add(material));
  });
  return [...materials];
}

export function resolveTreeDitherMode(renderer, temporalHistory = true) {
  return renderer?.isWebGPURenderer && temporalHistory ? 'temporal' : 'bayer';
}

function installDither(material, mode) {
  const fade = { value: 1 };
  const frame = { value: 0 };
  material.userData.treeLodFadeUniform = fade;
  material.userData.treeDitherFrameUniform = frame;
  material.userData.treeDitherMode = mode;
  material.alphaHash = true;
  material.transparent = false;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uTreeLodFade = fade;
    shader.uniforms.uTreeDitherFrame = frame;
    const threshold = mode === 'temporal'
      ? 'fract(dot(floor(gl_FragCoord.xy), vec2(0.754877666, 0.569840296)) + uTreeDitherFrame * 0.618033989)'
      : 'fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.754877666, 0.569840296)))';
    shader.fragmentShader = `uniform float uTreeLodFade;\nuniform float uTreeDitherFrame;\n${shader.fragmentShader}`
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>\nif (uTreeLodFade < ${threshold}) discard;`,
      );
  };
  material.customProgramCacheKey = () => `toonlab-tree-dither:${mode}`;
  material.needsUpdate = true;
  return material;
}

function cloneLevel(source, ditherMode) {
  const clone = source.clone(true);
  clone.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => {
      if (!Array.isArray(material.userData.treeBaseColor)) {
        material.userData.treeBaseColor = material.color.toArray();
      }
      material.depthWrite = true;
      installDither(material, ditherMode);
    });
    const shadowSource = entries[0];
    object.customDepthMaterial = installDither(new THREE.MeshDepthMaterial({
      alphaMap: shadowSource.alphaMap ?? null,
      alphaTest: shadowSource.alphaTest ?? 0,
      depthPacking: THREE.RGBADepthPacking,
      map: shadowSource.map ?? null,
      side: shadowSource.side,
    }), ditherMode);
    object.customDistanceMaterial = installDither(new THREE.MeshDistanceMaterial({
      alphaMap: shadowSource.alphaMap ?? null,
      alphaTest: shadowSource.alphaTest ?? 0,
      map: shadowSource.map ?? null,
      side: shadowSource.side,
    }), ditherMode);
  });
  return clone;
}

function setDitherFade(root, fade) {
  const value = THREE.MathUtils.clamp(finite(fade, 1), 0, 1);
  for (const material of materialList(root)) {
    material.opacity = value;
    const uniform = material.uniforms?.uLodFade ?? material.uniforms?.ditherOpacity;
    if (uniform) uniform.value = value;
    if (material.userData.treeLodFadeUniform) material.userData.treeLodFadeUniform.value = value;
    material.userData.treeLodFade = value;
  }
  root.traverse((object) => {
    for (const material of [object.customDepthMaterial, object.customDistanceMaterial]) {
      if (!material) continue;
      if (material.userData.treeLodFadeUniform) material.userData.treeLodFadeUniform.value = value;
      material.userData.treeLodFade = value;
    }
  });
}

function targetLod(lods, coverage) {
  for (const lod of lods) {
    if (coverage >= lod.minScreenCoverage) return lod.level;
  }
  return lods.length - 1;
}

export class CompiledTreeInstance extends THREE.Group {
  constructor(asset, {
    quality = 'balanced', transitionSeconds = 0.18, hysteresis = 0.1, surfaceLook = null,
    styleTarget = {},
  } = {}) {
    super();
    this.name = `${asset.manifest.catalogId}:instance`;
    this.manifest = asset.manifest;
    this.quality = TREE_RUNTIME_QUALITY_PROFILES[quality] ? quality : 'balanced';
    this.transitionSeconds = Math.max(finite(transitionSeconds, 0.18), 0.001);
    this.hysteresis = THREE.MathUtils.clamp(finite(hysteresis, 0.1), 0, 0.45);
    this.ditherMode = asset.ditherMode;
    this.ditherFrame = 0;
    this.levels = asset.levels.map((level) => cloneLevel(level, this.ditherMode));
    this.levels.forEach((level, index) => {
      level.name = `${this.manifest.catalogId}:LOD${index}`;
      level.visible = index === 0;
      this.add(level);
    });
    this.currentLevel = 0;
    this.nextLevel = 0;
    this.transition = 1;
    this._worldCenter = new THREE.Vector3();
    this._boundsCenter = new THREE.Vector3(...this.manifest.bounds.center);
    this.userData.compiledTreeManifest = this.manifest;
    this.setSurfaceLook(surfaceLook ?? this.manifest.surfaceLooks?.[0]?.id ?? null);
    attachCompiledTreeStyleTarget(this, styleTarget);
  }

  setSurfaceLook(id) {
    const look = this.manifest.surfaceLooks?.find((entry) => entry.id === id) ?? null;
    if (!look) return false;
    const snowCoverage = THREE.MathUtils.clamp(finite(look.snowCoverage, 0), 0, 1);
    const frostCoverage = THREE.MathUtils.clamp(finite(look.frostCoverage, 0), 0, 1);
    const snowColor = new THREE.Color(0.94, 0.97, 1);
    const frostColor = new THREE.Color(0.82, 0.91, 0.96);
    for (const level of this.levels) {
      for (const material of materialList(level)) {
        const role = material.userData?.treeMaterialRole;
        if ((role === 'leaf' || role === 'surface') && Array.isArray(look.canopyColor)) {
          material.color.setRGB(...look.canopyColor);
        } else if (Array.isArray(material.userData?.treeBaseColor)) {
          material.color.fromArray(material.userData.treeBaseColor);
        }
        if (role === 'bark' && Array.isArray(look.barkColor)) {
          material.color.setRGB(...look.barkColor);
        }
        const exposure = role === 'bark' ? 0.36 : 0.84;
        material.color.lerp(snowColor, snowCoverage * exposure);
        material.color.lerp(frostColor, frostCoverage * exposure * 0.72);
        material.userData.treeSurfaceLook = look.id;
        material.userData.treeSnowCoverage = snowCoverage;
        material.userData.treeFrostCoverage = frostCoverage;
        material.userData.treeBlossomCoverage = finite(look.blossomCoverage, 0);
        material.userData.treeSnowExposureTextureRole = 'snow-exposure';
        material.needsUpdate = true;
      }
    }
    this.userData.treeSurfaceLook = look.id;
    return true;
  }

  _resolveLevel(coverage) {
    const proposed = targetLod(this.manifest.lods, coverage);
    if (proposed === this.currentLevel) return proposed;
    if (proposed > this.currentLevel) {
      const threshold = this.manifest.lods[this.currentLevel].minScreenCoverage;
      return coverage <= threshold * (1 - this.hysteresis) ? proposed : this.currentLevel;
    }
    const threshold = this.manifest.lods[proposed].minScreenCoverage;
    return coverage >= threshold * (1 + this.hysteresis) ? proposed : this.currentLevel;
  }

  update(delta, camera) {
    this.ditherFrame += 1;
    if (this.ditherMode === 'temporal') {
      for (const level of this.levels) {
        level.traverse((object) => {
          const entries = object.material
            ? (Array.isArray(object.material) ? object.material : [object.material])
            : [];
          for (const material of [...entries, object.customDepthMaterial, object.customDistanceMaterial]) {
            if (material?.userData?.treeDitherFrameUniform) {
              material.userData.treeDitherFrameUniform.value = this.ditherFrame;
            }
          }
        });
      }
    }
    this.updateWorldMatrix(true, false);
    this._worldCenter.copy(this._boundsCenter).applyMatrix4(this.matrixWorld);
    const worldScale = new THREE.Vector3();
    this.getWorldScale(worldScale);
    const radius = this.manifest.bounds.radius * Math.max(worldScale.x, worldScale.y, worldScale.z);
    const coverage = projectedTreeScreenCoverage(camera, this._worldCenter, radius);
    const wanted = this._resolveLevel(coverage);
    if (wanted !== this.currentLevel && wanted !== this.nextLevel) {
      this.nextLevel = wanted;
      this.transition = 0;
      this.levels[wanted].visible = true;
      setDitherFade(this.levels[wanted], 0);
    }
    if (this.nextLevel !== this.currentLevel) {
      this.transition = Math.min(1, this.transition + Math.max(finite(delta, 0), 0) / this.transitionSeconds);
      setDitherFade(this.levels[this.currentLevel], 1 - this.transition);
      setDitherFade(this.levels[this.nextLevel], this.transition);
      if (this.transition >= 1) {
        this.levels[this.currentLevel].visible = false;
        setDitherFade(this.levels[this.currentLevel], 1);
        this.currentLevel = this.nextLevel;
      }
    }
    return { coverage, level: this.currentLevel, transitioningTo: this.nextLevel };
  }

  dispose() {
    for (const level of this.levels) {
      for (const material of materialList(level)) material.dispose();
      level.traverse((object) => {
        object.customDepthMaterial?.dispose();
        object.customDistanceMaterial?.dispose();
      });
    }
    this.clear();
  }
}

async function fetchManifest(input, fetchFn) {
  if (typeof input !== 'string') return { manifest: parseCompiledTreeManifest(input), base: null };
  const response = await fetchFn(input);
  if (!response.ok) throw new Error(`Compiled tree manifest request failed: ${response.status}`);
  return { manifest: parseCompiledTreeManifest(await response.json()), base: input };
}

export async function loadCompiledTreeAsset(manifestOrUrl, {
  decoderBasePath = null,
  fetch: fetchFn = globalThis.fetch,
  loadingManager = undefined,
  renderer = null,
  temporalHistory = true,
} = {}) {
  if (typeof fetchFn !== 'function') throw new Error('loadCompiledTreeAsset needs fetch support.');
  const { manifest, base } = await fetchManifest(manifestOrUrl, fetchFn);
  const geometryUrl = base
    ? new URL(manifest.artifacts.geometry, base).href
    : manifest.artifacts.geometry;
  const loader = new GLTFLoader(loadingManager);
  loader.setMeshoptDecoder(MeshoptDecoder);
  let ktx2Loader = null;
  const textureArtifacts = manifest.artifacts.textures ?? {};
  if (Object.keys(textureArtifacts).length && !renderer) {
    throw new Error('Compiled tree KTX2 textures require a renderer for capability detection.');
  }
  if (renderer && (decoderBasePath || Object.keys(textureArtifacts).length)) {
    ktx2Loader = new KTX2Loader(loadingManager);
    if (decoderBasePath) {
      const normalized = decoderBasePath.endsWith('/') ? decoderBasePath : `${decoderBasePath}/`;
      ktx2Loader.setTranscoderPath(`${normalized}basis/`);
    }
    ktx2Loader.detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);
  }
  const [gltf, textureEntries] = await Promise.all([
    loader.loadAsync(geometryUrl),
    Promise.all(Object.entries(textureArtifacts).map(async ([role, url]) => {
      const resolved = base ? new URL(url, base).href : url;
      return [role, await ktx2Loader.loadAsync(resolved)];
    })),
  ]);
  const textures = Object.fromEntries(textureEntries);
  const materialDescriptors = Object.fromEntries(
    (manifest.materials ?? []).map((entry) => [entry.id, entry]),
  );
  const levels = manifest.lods.map((lod) => gltf.scene.getObjectByName(lod.node));
  if (levels.some((level) => !level)) {
    ktx2Loader?.dispose();
    throw new Error('Compiled tree GLB does not contain every manifest LOD node.');
  }
  levels.forEach((level) => level.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => {
      const role = material.userData?.treeMaterialRole
        ?? (/bark|trunk/i.test(material.name) ? 'bark' : /single|proxy/i.test(material.name) ? 'surface' : 'leaf');
      const descriptor = materialDescriptors[role] ?? {};
      material.userData.treeMaterialRole = role;
      material.userData.treeBaseColor = material.color.toArray();
      if (role === 'bark' && textures.bark) {
        material.map = textures.bark;
        material.map.wrapS = THREE.RepeatWrapping;
        material.map.wrapT = THREE.RepeatWrapping;
        if (Array.isArray(descriptor.uvRepeat) && descriptor.uvRepeat.length >= 2) {
          material.map.repeat.set(
            Math.max(finite(descriptor.uvRepeat[0], 1), 0.01),
            Math.max(finite(descriptor.uvRepeat[1], 1), 0.01),
          );
        }
      }
      if (role === 'surface' && textures.surface) material.map = textures.surface;
      if (role === 'leaf') {
        if (textures.leaf) material.map = textures.leaf;
        if (textures.opacity) material.alphaMap = textures.opacity;
        material.alphaTest = Math.max(material.alphaTest ?? 0, 0.3);
        material.side = THREE.DoubleSide;
      }
      material.needsUpdate = true;
    });
  }));
  const asset = {
    manifest,
    levels,
    textures,
    ditherMode: resolveTreeDitherMode(renderer, temporalHistory),
    createInstance: (options) => new CompiledTreeInstance(asset, options),
    dispose() {
      const geometries = new Set();
      const materials = new Set();
      gltf.scene.traverse((object) => {
        if (!object.isMesh) return;
        if (object.geometry) geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.filter(Boolean).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      Object.values(textures).forEach((texture) => texture.dispose());
      ktx2Loader?.dispose();
    },
  };
  return asset;
}
