import * as THREE from 'three';

import {
  isFoliageMaterial,
  isUtilityTextureLabel,
  textureLabel,
  textureSourceUrl,
} from './environmentMaterialClassifier.js';

export const fallbackEnvironmentWhiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
fallbackEnvironmentWhiteTexture.colorSpace = THREE.SRGBColorSpace;
fallbackEnvironmentWhiteTexture.needsUpdate = true;

export const fallbackEnvironmentBlackTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
fallbackEnvironmentBlackTexture.colorSpace = THREE.NoColorSpace;
fallbackEnvironmentBlackTexture.needsUpdate = true;

// Flat +Z normal for materials compiled without a real normal map bound.
export const fallbackEnvironmentNormalTexture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
fallbackEnvironmentNormalTexture.colorSpace = THREE.NoColorSpace;
fallbackEnvironmentNormalTexture.needsUpdate = true;

const textureLoader = new THREE.TextureLoader();
const textureExistenceCache = new Map();
const textureLoadCache = new Map();

export function textureKindCandidateUrl(sourceUrl, kind) {
  if (!sourceUrl) return null;

  const candidate = sourceUrl.replace(
    /(^|[_\-/])(diffuse|lsab|smbe|normal|nrm|height|ao|mask|esa)(\.[a-z0-9]+)([?#].*)?$/i,
    `$1${kind}$3$4`,
  );
  return candidate === sourceUrl ? null : candidate;
}

export async function textureUrlExists(url) {
  if (!url) return false;
  if (!textureExistenceCache.has(url)) {
    textureExistenceCache.set(url, fetch(url, { method: 'HEAD' })
      .then((response) => response.ok)
      .catch(() => false));
  }
  return textureExistenceCache.get(url);
}

export function copyTextureTransform(target, source) {
  if (!source) return target;
  target.wrapS = source.wrapS;
  target.wrapT = source.wrapT;
  target.repeat.copy(source.repeat);
  target.offset.copy(source.offset);
  target.center.copy(source.center);
  target.rotation = source.rotation;
  target.flipY = source.flipY;
  target.channel = source.channel;
  return target;
}

export function loadEnvironmentTexture(url, referenceTexture, { colorSpace = THREE.SRGBColorSpace } = {}) {
  const cacheKey = `${url}|${colorSpace}`;
  if (!textureLoadCache.has(cacheKey)) {
    textureLoadCache.set(cacheKey, new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = colorSpace;
          copyTextureTransform(texture, referenceTexture);
          texture.needsUpdate = true;
          resolve(texture);
        },
        undefined,
        reject,
      );
    }));
  }

  return textureLoadCache.get(cacheKey);
}

// Loads a sibling texture by filename-suffix convention when the asset pack
// uses one (e.g. Liyue's *_Diffuse/_Normal/_SMBE files). Returns null when the
// convention does not resolve, so standard-map sources always win.
async function resolveConventionTexture(sourceUrl, referenceTexture, kind, options) {
  const candidateUrl = textureKindCandidateUrl(sourceUrl, kind);
  if (!candidateUrl || !await textureUrlExists(candidateUrl)) return null;
  return loadEnvironmentTexture(candidateUrl, referenceTexture, options).catch(() => null);
}

// Resolves everything the environment shader can consume for one source
// material. Standard Three.js/GLTF maps take priority; filename-convention
// siblings (Liyue-style packs) fill the gaps; author hooks in
// material.userData override both:
//   userData.envNormalMap / envAoMap / envLightMap / envEmissiveMap
export async function resolveEnvironmentTextureSet(mat) {
  const sourceMap = mat?.map ?? null;
  const sourceLabel = textureLabel(sourceMap);
  const sourceUrl = textureSourceUrl(sourceMap);
  const sourceMapIsUtility = isUtilityTextureLabel(sourceLabel || sourceUrl);
  const candidateUrl = sourceMapIsUtility ? textureKindCandidateUrl(sourceUrl, 'Diffuse') : null;
  const resolvedDiffuseMap = candidateUrl && await textureUrlExists(candidateUrl)
    ? await loadEnvironmentTexture(candidateUrl, sourceMap).catch(() => null)
    : null;
  const packedCandidateUrls = sourceMapIsUtility
    ? []
    : [
      ['SMBE', textureKindCandidateUrl(sourceUrl, 'SMBE')],
      ['LSAB', textureKindCandidateUrl(sourceUrl, 'LSAB')],
      ['ESA', textureKindCandidateUrl(sourceUrl, 'ESA')],
    ].filter(([, url]) => Boolean(url));
  let packedMap = null;
  let packedMapKind = null;

  for (const [kind, packedCandidateUrl] of packedCandidateUrls) {
    if (!await textureUrlExists(packedCandidateUrl)) continue;
    packedMap = await loadEnvironmentTexture(packedCandidateUrl, sourceMap).catch(() => null);
    if (packedMap) {
      packedMap.colorSpace = THREE.NoColorSpace;
      packedMap.needsUpdate = true;
      packedMapKind = kind;
      break;
    }
  }
  const foliageAlphaMap = isFoliageMaterial(mat) && ['LSAB', 'ESA'].includes(packedMapKind)
    ? packedMap
    : null;

  const userData = mat?.userData ?? {};
  const normalMap = userData.envNormalMap
    ?? mat?.normalMap
    ?? (sourceMapIsUtility ? null : await resolveConventionTexture(
      sourceUrl, sourceMap, 'Normal', { colorSpace: THREE.NoColorSpace }));
  const aoMap = userData.envAoMap ?? mat?.aoMap ?? null;
  const lightMap = userData.envLightMap ?? mat?.lightMap ?? null;
  const emissiveMap = userData.envEmissiveMap ?? mat?.emissiveMap ?? null;
  const baseMap = resolvedDiffuseMap
    ?? (sourceMapIsUtility ? fallbackEnvironmentWhiteTexture : sourceMap)
    ?? fallbackEnvironmentWhiteTexture;

  return {
    alphaFromLuminance: Boolean(foliageAlphaMap || sourceMapIsUtility),
    alphaMap: mat?.alphaMap ?? (sourceMapIsUtility ? sourceMap : foliageAlphaMap),
    aoMap,
    aoMapIntensity: Number.isFinite(mat?.aoMapIntensity) ? mat.aoMapIntensity : 1,
    baseMap,
    baseMapWasUtility: sourceMapIsUtility,
    emissiveColor: mat?.emissive?.isColor && (mat.emissive.r || mat.emissive.g || mat.emissive.b)
      ? mat.emissive.clone()
      : new THREE.Color(1, 1, 1),
    emissiveMap,
    lightMap,
    lightMapIntensity: Number.isFinite(mat?.lightMapIntensity) ? mat.lightMapIntensity : 1,
    normalMap,
    normalScale: mat?.normalScale?.isVector2 ? mat.normalScale.clone() : new THREE.Vector2(1, 1),
    packedMap,
    resolvedDiffuseMap: Boolean(resolvedDiffuseMap),
    // Opt-in world-XZ macro colormap (userData.envColormapMap): low-frequency
    // biome tint over flat ground, mapped by envColormapRegion
    // (offsetX, offsetZ, 1/sizeX, 1/sizeZ) where colormapStrength > 0.
    colormapMap: userData.envColormapMap ?? null,
    colormapRegion: userData.envColormapRegion?.isVector4
      ? userData.envColormapRegion.clone()
      : null,
    // Opt-in world-projected material for steep faces (cliffs, rock walls):
    // sampled triplanar and blended by slope where triplanarDetail > 0.
    triplanarMap: userData.envTriplanarMap ?? null,
    // True when the material arrived with no real color texture at all — the
    // untextured/flat-color input class that gets the designed gradient look.
    untextured: baseMap === fallbackEnvironmentWhiteTexture,
  };
}
