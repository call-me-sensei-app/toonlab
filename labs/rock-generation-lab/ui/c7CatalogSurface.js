import * as THREE from 'three';
import { float, normalMap, texture, uv } from 'three/tsl';

import {
  createC7GeologyMapData,
  resolveC7Projection,
} from '../../../src/rockgen/index.js';
import {
  createNaturalRockMapData as createC8First12GeologyMapData,
  createNaturalRockSurfaceSpecification,
  NATURAL_ROCK_SURFACE_PROFILES,
  resolveNaturalRockProjection as resolveC8First12Projection,
} from '../../../src/rockgen/index.js';
import {
  applyRockShader,
  restoreRockShader,
  setRockShaderSceneState,
} from '../../../src/rock-shader/rockShaderRuntime.js';

import { sha256Hex } from '../../../src/core/sha256.js';

const CACHE_LIMIT = 8;
const cache = new Map();
const C8_SURFACE_SCHEMAS = new Set([
  'toonlab/c8-first12-geology-surface',
  'toonlab/c8-first100-geology-surface',
]);

function isC8SurfacePackage(surfacePackage) {
  return C8_SURFACE_SCHEMAS.has(surfacePackage?.schema);
}

function textureFromBytes(bytes, size, { color = false, name }) {
  const texture = new THREE.DataTexture(
    bytes,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function disposeEntry(entry) {
  for (const texture of Object.values(entry.textures ?? {})) texture.dispose();
}

function trimCache() {
  const disposable = [...cache.entries()].filter(([, entry]) => entry.references === 0);
  while (cache.size > CACHE_LIMIT && disposable.length > 0) {
    const [key, entry] = disposable.shift();
    cache.delete(key);
    disposeEntry(entry);
  }
}

function acquireTextures(surfacePackage) {
  const c8 = isC8SurfacePackage(surfacePackage);
  const identity = c8 ? surfacePackage.assetId : surfacePackage.geology;
  const key = `generated:${sha256Hex(JSON.stringify(surfacePackage))}`;
  let entry = cache.get(key);
  if (!entry) {
    const result = c8
      ? createC8First12GeologyMapData({
        assetId: surfacePackage.assetId,
        geometrySha256: surfacePackage.geometrySha256,
        semanticRegions: surfacePackage.semanticRegions,
        profileId: surfacePackage.profileId,
        projectionScaleMetres: surfacePackage.projection?.scaleMetres,
        seed: surfacePackage.seed,
        size: surfacePackage.mapResolution,
      })
      : createC7GeologyMapData({
        geology: surfacePackage.geology,
        seed: surfacePackage.seed,
        size: surfacePackage.mapResolution,
      });
    const prefix = `RockSurface_${identity}_${surfacePackage.seed}`;
    entry = {
      audit: result.audit,
      references: 0,
      textures: {
        rock: textureFromBytes(result.maps.baseColor, result.audit.size, { color: true, name: `${prefix}_BaseColor` }),
        rockAo: textureFromBytes(result.maps.ao, result.audit.size, { name: `${prefix}_AO` }),
        rockNormal: textureFromBytes(result.maps.normalGL, result.audit.size, { name: `${prefix}_NormalGL` }),
        smoothness: textureFromBytes(result.maps.smoothness, result.audit.size, { name: `${prefix}_Smoothness` }),
        roughness: textureFromBytes(result.maps.roughness, result.audit.size, { name: `${prefix}_Roughness` }),
      },
    };
    cache.set(key, entry);
  } else {
    // Refresh insertion order so eviction behaves like an LRU.
    cache.delete(key);
    cache.set(key, entry);
  }
  entry.references += 1;
  return {
    ...entry,
    release() {
      entry.references = Math.max(0, entry.references - 1);
      trimCache();
    },
  };
}

async function acquirePublishedTextures(materialConfigUrl, {
  fetchImpl = globalThis.fetch?.bind(globalThis),
  textureLoader = new THREE.TextureLoader(),
} = {}) {
  const key = `published:${materialConfigUrl}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = { references: 0, textures: null };
    cache.set(key, entry);
    entry.loading = (async () => {
      if (typeof fetchImpl !== 'function') throw new TypeError('Rock material loading requires fetch().');
      const response = await fetchImpl(materialConfigUrl, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Rock material package returned HTTP ${response.status}.`);
      const materialConfig = await response.json();
      if (materialConfig?.schema !== 'toonlab.pro-rock-material'
        || materialConfig.version !== 2
        || materialConfig.shader?.preset !== 'call_me_sensei') {
        throw new Error('Rock material package has an unsupported schema or shader preset.');
      }
      const requiredRoles = ['rock', 'rockAo', 'rockNormal', 'smoothness'];
      if (requiredRoles.some((role) => !materialConfig.textures?.[role]?.url)) {
        throw new Error('Rock material package is missing a required texture binding.');
      }
      const textures = Object.fromEntries(await Promise.all(
        requiredRoles.map(async (role) => {
          const descriptor = materialConfig.textures[role];
          const texture = await textureLoader.loadAsync(descriptor.url);
          texture.name = `Rock Lab ${role} · ${materialConfig.assetId}`;
          texture.colorSpace = descriptor.srgb === true ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.flipY = false;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
          texture.needsUpdate = true;
          return [role, texture];
        }),
      ));
      entry.audit = Object.freeze({
        assetId: materialConfig.assetId,
        materialConfigUrl,
        source: 'immutable-published-material-package',
      });
      entry.materialConfig = materialConfig;
      entry.textures = textures;
      return entry;
    })();
  }
  try {
    await entry.loading;
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    disposeEntry(entry);
    throw error;
  }
  // Refresh insertion order so eviction behaves like an LRU.
  cache.delete(key);
  cache.set(key, entry);
  entry.references += 1;
  return {
    ...entry,
    release() {
      entry.references = Math.max(0, entry.references - 1);
      trimCache();
    },
  };
}

function characteristicMetres(dimensionsMetres) {
  const values = [dimensionsMetres.width, dimensionsMetres.height, dimensionsMetres.depth]
    .map(Number);
  const sorted = [...values].sort((left, right) => left - right);
  const geometricMean = (values[0] * values[1] * values[2]) ** (1 / 3);
  return Math.sqrt(Math.max(geometricMean * sorted[1], 1e-9));
}

function resolvePublishedC8Projection(surfacePackage, dimensionsMetres) {
  const original = surfacePackage.projection ?? {};
  const originalCharacteristic = Number(original.characteristicMetres)
    || characteristicMetres(dimensionsMetres);
  const originalFormationScale = THREE.MathUtils.clamp(
    Math.sqrt(originalCharacteristic / 1.5),
    0.82,
    3.6,
  );
  const baseTileMetres = (Number(original.scaleMetres) || 1) / originalFormationScale;
  const nextCharacteristic = characteristicMetres(dimensionsMetres);
  const formationScale = THREE.MathUtils.clamp(Math.sqrt(nextCharacteristic / 1.5), 0.82, 3.6);
  const scaleMetres = baseTileMetres * formationScale;
  return {
    characteristicMetres: nextCharacteristic,
    mode: ['triplanar', 'directional-bedding'].includes(original.mode)
      ? original.mode
      : 'triplanar',
    nearDetailScaleMetres: scaleMetres * 0.33,
    scaleMetres,
    upAxis: original.upAxis ?? original.bounds?.upAxis ?? 'y',
  };
}

/** Apply an accepted deterministic geology map set and current rock shader. */
export async function applyCatalogGeologySurface(root, surfacePackage, dimensionsMetres, {
  fetchImpl,
  materialConfigUrl = null,
  skyColor = '#b8cce0',
  textureLoader,
} = {}) {
  const c8 = isC8SurfacePackage(surfacePackage);
  if (!root || (!c8 && surfacePackage?.schema !== 'toonlab/c7-geology-surface')) return null;
  const composite = c8 && (surfacePackage.projection?.mode === 'semantic-regions-uv0-bake'
    || NATURAL_ROCK_SURFACE_PROFILES[surfacePackage.profileId]?.requiresSemanticRegions === true);
  if (composite && surfacePackage.semanticRegions) {
    const replay = createNaturalRockSurfaceSpecification({
      ...surfacePackage,
      editedBoundsMetres: [dimensionsMetres.width, dimensionsMetres.height, dimensionsMetres.depth],
    });
    if (surfacePackage.semanticRegionSurface?.contractSha256
      && replay.semanticRegionSurface.contractSha256 !== surfacePackage.semanticRegionSurface.contractSha256) {
      throw new Error('Saved semantic-region contract does not match its masks.');
    }
    surfacePackage = replay;
  }
  if (composite && !surfacePackage.semanticRegions && !materialConfigUrl) {
    throw new Error('Composite rock replay requires saved semantic masks or its published material artifact.');
  }
  const resolvedProjection = composite
    ? { ...surfacePackage.projection, mode: 'semantic-regions-uv0-bake', upAxis: 'y' }
    : surfacePackage.schema === 'toonlab/c8-first100-geology-surface'
      ? resolvePublishedC8Projection(surfacePackage, dimensionsMetres)
      : c8 ? resolveC8First12Projection({
        assetId: surfacePackage.assetId,
        editedBoundsMetres: [dimensionsMetres.width, dimensionsMetres.height, dimensionsMetres.depth],
        profileId: surfacePackage.profileId,
      })
      : resolveC7Projection({ dimensionsMetres, geology: surfacePackage.geology });
  const acquired = materialConfigUrl && !surfacePackage.semanticRegions
    ? await acquirePublishedTextures(materialConfigUrl, { fetchImpl, textureLoader })
    : acquireTextures(surfacePackage);
  const originals = [];
  const proxies = [];
  function restoreCompositeSources() {
    for (const [mesh, original] of originals) mesh.material = original;
    for (const material of proxies) material.dispose();
  }
  try {
    if (composite) {
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        if (!mesh.geometry?.attributes?.uv
          || mesh.geometry.attributes.uv.count !== mesh.geometry.attributes.position?.count) {
          throw new Error('Composite rock surfaces require complete authored UV0 coordinates.');
        }
        originals.push([mesh, mesh.material]);
      });
      for (const [mesh, original] of originals) {
        const materials = (Array.isArray(original) ? original : [original]).map(() => {
          const material = new THREE.MeshStandardMaterial({
            map: acquired.textures.rock,
            normalMap: acquired.textures.rockNormal,
            roughnessMap: acquired.textures.roughness ?? acquired.textures.rockRoughness,
            aoMap: acquired.textures.rockAo,
            metalness: 0,
          });
          proxies.push(material);
          return material;
        });
        mesh.material = Array.isArray(original) ? materials : materials[0];
      }
    }
  // Bounds and scale are re-derived after every edit, while the accepted C8
  // graph choice remains stable. This prevents a sculpt/rebake from silently
  // turning coherent bedding back into generic symmetric triplanar sampling.
  const projection = c8 ? {
    ...resolvedProjection,
    mode: surfacePackage.projection?.mode ?? resolvedProjection.mode,
    upAxis: surfacePackage.projection?.upAxis ?? resolvedProjection.upAxis,
  } : resolvedProjection;
  const publishedSettings = acquired.materialConfig?.shader?.settings ?? {};
  const publishedProjectionScale = Number(publishedSettings.projection?.scale);
  const publishedNearDetailScale = Number(publishedSettings.projection?.nearDetailScale);
  const nearDetailRatio = Number.isFinite(publishedProjectionScale)
    && publishedProjectionScale > 0
    && Number.isFinite(publishedNearDetailScale)
    ? publishedNearDetailScale / publishedProjectionScale
    : null;
  // C7 keeps its published isotropic projection contract for compatibility,
  // but sedimentary beds must not rotate through a top-axis sample on every
  // low-poly facet. The directional sampler shares world Y across its two
  // lateral projections, so strata remain continuous around the rock.
  const runtimeProjectionMode = !c8 && surfacePackage.geology === 'layered-sandstone'
    ? 'directional-bedding'
    : projection.mode;
  const runtimeProjectionContrast = !c8 && surfacePackage.geology === 'layered-sandstone'
    ? 0.05
    : publishedSettings.projection?.projectionContrast;
  const report = applyRockShader(root, {
    ...publishedSettings,
    preset: 'call_me_sensei',
    assetIntegration: {
      ...publishedSettings.assetIntegration,
      sourceAlbedoMode: composite ? 'retain' : 'replace',
      sourceAlbedoStrength: composite ? 1 : 0,
      sourceNormalStrength: composite ? 1 : 0,
      sourceAoStrength: composite ? 1 : 0,
      vertexColorStrength: 0,
      vertexAoStrength: 0,
    },
    material: { ...publishedSettings.material, useSmoothnessTexture: true },
    projection: {
      ...publishedSettings.projection,
      // Authored composite channels use the shader's source-UV path.
      mode: composite ? 'triplanar' : runtimeProjectionMode,
      upAxis: projection.upAxis,
      ...(Number.isFinite(runtimeProjectionContrast)
        ? { projectionContrast: runtimeProjectionContrast }
        : {}),
      scale: projection.scaleMetres,
      nearDetailScale: nearDetailRatio
        ? projection.scaleMetres * nearDetailRatio
        : projection.nearDetailScaleMetres,
      nearDetailStrength: 0.02,
    },
  }, {
    castShadow: true,
    detail: null,
    name: `Realistic Rock + Call Me Sensei · ${surfacePackage.geology ?? surfacePackage.profileId}`,
    receiveShadow: true,
    textures: acquired.textures,
    variation: surfacePackage.seed,
  });
  if (composite) {
    for (const [mesh] of originals) {
      for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
        // Every authored channel shares UV0. Do not project a second AO or
        // normal field across semantic boundaries through triplanar sampling.
        material.normalNode = normalMap(texture(acquired.textures.rockNormal).sample(uv()).rgb);
        material.aoNode = texture(acquired.textures.rockAo).sample(uv()).r;
        material.roughnessNode = float(1).sub(texture(acquired.textures.smoothness).sample(uv()).r);
        material.userData.toonlabRockProjectionContract.mode = 'semantic-regions-uv0-bake';
      }
    }
  }
  setRockShaderSceneState(root, { skyColor });
  root.userData.toonlabGeologySurface = {
    audit: acquired.audit,
    projection: { ...projection, runtimeMode: runtimeProjectionMode },
    report,
    surfacePackage: structuredClone(surfacePackage),
  };
  let disposed = false;
  return {
    audit: acquired.audit,
    dispose() {
      if (disposed) return;
      disposed = true;
      restoreRockShader(root);
      restoreCompositeSources();
      acquired.release();
    },
    projection: { ...projection, runtimeMode: runtimeProjectionMode },
    report,
  };
  } catch (error) {
    restoreRockShader(root);
    restoreCompositeSources();
    acquired.release();
    throw error;
  }
}

export function disposeCatalogC7SurfaceCache() {
  for (const entry of cache.values()) disposeEntry(entry);
  cache.clear();
}

// Compatibility export for older consumers and fixtures.
export const applyCatalogC7Surface = applyCatalogGeologySurface;
