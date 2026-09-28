import * as THREE from 'three';

import { updateToonStorageSkinning } from '../shaders-tsl/chunks/character-skinning.js';
import {
  applyCharacterParameters,
  createToonCharacterMaterial,
} from '../shaders-tsl/character/characterMaterial.js';
import { characterShadingStateFor, characterStateOfMaterial } from '../shaders-tsl/character/characterState.js';
import {
  CHARACTER_DEBUG_VIEW_IDS,
  CHARACTER_DEBUG_VIEW_LABELS,
} from '../shaders-tsl/character/debugViews.js';
import { syncToonSceneLights } from '../shaders-tsl/character/sceneLights.js';
import { measureAlphaCoverage } from './alphaCoverage.js';
import { inferAutoRoleWeights } from './autoRoles.js';
import { hasBakedDetail, hasBakedFaceUv, hasBakedOcclusion } from './bakeAttribute.js';
import {
  characterRoleKey,
  resolveCharacterParameters,
} from './characterParameters.js';
import { bakeFaceShadowMap } from './faceShadowBake.js';
import { bakeEyeWhiteLid, bakeSheerFabric } from './featureBakes.js';
import { characterForward, findHeadBone } from './headBone.js';
import { bakeLocalOcclusion } from './occlusionBake.js';
import { measureSkinEvidence } from './skinEvidence.js';
import { resolveSourceShading } from './sourceShading.js';
import {
  ALPHA_COVERAGE_MODES,
  createAlphaSettings,
  materialAlphaDrawOrder,
  resolveAlphaForMaterial,
} from './settings/alphaSettings.js';
import {
  getSourceMaterialColor,
  resolveBaseMapSaturation,
  resolveBaseMaterialColor,
} from './settings/baseTextureSettings.js';
import { materialUsesFur } from './settings/furSettings.js';
import { collectMaterialMapTextures, resolveMaterialMaps } from './settings/mapsSettings.js';
import { STICKER_BLEND_MODE_VALUES } from './settings/stickerSettings.js';
import { createToonSettings } from './toonSettings.js';
import {
  classifyMaterialRole,
  normalizeMaterialRoleOverrides,
  roleIsEyeHighlight,
  roleIsTransparentOverlay,
} from '../core/materialRoles.js';

// Converted meshes mirror the scene's lights into the shared uniforms right
// before they render (both renderers invoke Object3D.onBeforeRender); skinned
// meshes also refresh the storage-skinning bone buffer (WebGL2 backend path).
function toonNodeLightSync(renderer, scene, camera) {
  syncToonSceneLights(scene, camera, renderer);
  if (this.isSkinnedMesh) updateToonStorageSkinning(this);
}

export {
  alphaTestForMaterial,
  createAlphaSettings,
  DEFAULT_ALPHA_SETTINGS,
  resolveAlphaForMaterial,
  sourceOpacity,
  usesAlphaBlend,
  usesAlphaCutout,
} from './settings/alphaSettings.js';

export {
  BASE_TEXTURE_MATERIAL_COLOR_MODES,
  BASE_TEXTURE_SATURATION_MODES,
  createBaseTextureSettings,
  DEFAULT_BASE_TEXTURE_SETTINGS,
} from './settings/baseTextureSettings.js';

export { createFurSettings, DEFAULT_FUR_SETTINGS, materialUsesFur } from './settings/furSettings.js';

export {
  createStickerSettings,
  DEFAULT_STICKER_SETTINGS,
  resolveStickerForMaterial,
  STICKER_BLEND_MODES,
} from './settings/stickerSettings.js';

export { createLightSettings, DEFAULT_LIGHT_SETTINGS } from './settings/lightSettings.js';
export { createShadingSettings, DEFAULT_SHADING_SETTINGS } from './settings/shadingSettings.js';
export { createRampSettings, DEFAULT_RAMP_SETTINGS } from './settings/rampSettings.js';
export { createFaceSettings, DEFAULT_FACE_SETTINGS, FACE_HEAD_SPACE_MODES } from './settings/faceSettings.js';
export { CHARACTER_SHADOW_DIRECTIONS, createShadowSettings, DEFAULT_SHADOW_SETTINGS } from './settings/shadowSettings.js';
export { createRimSettings, DEFAULT_RIM_SETTINGS, RIM_MODES } from './settings/rimSettings.js';
export { createHighlightSettings, DEFAULT_HIGHLIGHT_SETTINGS } from './settings/highlightSettings.js';
export { createOutlineSettings, DEFAULT_OUTLINE_SETTINGS } from './settings/outlineSettings.js';
export { createMapsSettings, DEFAULT_MAPS_SETTINGS } from './settings/mapsSettings.js';

export {
  createToonPresetDocument,
  createToonSettings,
  getToonPresetDefinition,
  getToonPresetIds,
  getToonPresetMetadata,
  getToonPresetOptions,
  getToonSettingFieldSchema,
  getToonSettingGroupMetadata,
  normalizeToonPresetName,
  parseToonPresetDocument,
  registerSerializedToonPreset,
  registerToonPreset,
  sanitizeToonPresetSettings,
  serializeToonPreset,
  TOON_PRESET_DOCUMENT_TYPE,
  TOON_PRESET_IDS,
  TOON_PRESET_SCHEMA_VERSION,
  TOON_SETTING_DEFAULTS,
  TOON_SETTING_FIELD_SCHEMA,
  TOON_SETTING_GROUP_METADATA,
  TOON_SETTING_GROUPS,
  validateToonPresetDocument,
} from './toonSettings.js';

export {
  classifyMaterialRole,
  materialRoleName,
  materialRoleValue,
  MATERIAL_ROLE_LABELS,
  MATERIAL_ROLE_NAMES_BY_VALUE,
  MATERIAL_ROLES,
  normalizeMaterialRole,
  normalizeMaterialRoleOverrides,
  roleIsCatchlight,
  roleIsEye,
  roleIsEyeHighlight,
  roleIsIris,
  roleIsPupil,
  roleIsSclera,
} from '../core/materialRoles.js';

// ---------------------------------------------------------------------------
// Debug views (spec §5.12): a uniform write selects one.

/** Debug view name → value of the material's `debugMode` uniform. */
export const TOON_DEBUG_OUTPUT_MODES = CHARACTER_DEBUG_VIEW_IDS;

/** Debug view name → label. */
export const TOON_DEBUG_OUTPUT_LABELS = CHARACTER_DEBUG_VIEW_LABELS;

const TOON_DEBUG_MODE_ALIASES = Object.freeze({
  '': 'off',
  albedo: 'albedo',
  alpha: 'alpha',
  ao: 'ao',
  aomap: 'ao',
  base: 'albedo',
  basecolor: 'albedo',
  band: 'litAmount',
  cel: 'litAmount',
  celband: 'litAmount',
  charactershadow: 'characterShadow',
  contactshadow: 'screenSpaceShadow',
  depthrim: 'depthRim',
  direct: 'litAmount',
  directvisibility: 'litAmount',
  emissive: 'emissive',
  emissivemap: 'emissive',
  emission: 'emissive',
  face: 'faceMap',
  facemap: 'faceMap',
  faceshadow: 'faceMap',
  faceshadowmap: 'faceMap',
  final: 'off',
  grade: 'lightingMap',
  hair: 'hairHighlight',
  hairhighlight: 'hairHighlight',
  hairring: 'hairHighlight',
  hairshadow: 'screenSpaceShadow',
  highlight: 'specular',
  light: 'lightColor',
  lightcolor: 'lightColor',
  lighting: 'lightColor',
  lightingmap: 'lightingMap',
  lit: 'lightColor',
  litamount: 'litAmount',
  material: 'roles',
  materialrole: 'roles',
  matcap: 'matcap',
  matcapmap: 'matcap',
  none: 'off',
  normal: 'off',
  normalmap: 'normalMap',
  occlusion: 'ao',
  off: 'off',
  opacity: 'alpha',
  raw: 'sourceAlbedo',
  rawalbedo: 'sourceAlbedo',
  rim: 'rim',
  rimlight: 'rim',
  role: 'roles',
  roles: 'roles',
  scene: 'sceneShadow',
  sceneshadow: 'sceneShadow',
  screenshadow: 'screenSpaceShadow',
  screenspaceshadow: 'screenSpaceShadow',
  selfshadow: 'characterShadow',
  shadingmap: 'lightingMap',
  shadow: 'sceneShadow',
  shadowcolor: 'shadowColor',
  shadowtone: 'shadowColor',
  source: 'sourceAlbedo',
  sourcealbedo: 'sourceAlbedo',
  spec: 'specular',
  specular: 'specular',
  terminator: 'terminator',
  terminatoronly: 'terminator',
  tone: 'shadowColor',
});

function normalizeToonDebugKey(value) {
  return String(value ?? 'off')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

/** Resolves a debug view by name, alias or value: `{ name, label, value }`. */
export function resolveToonDebugOutputMode(value) {
  let name = 'off';
  if (Number.isFinite(value)) {
    const numeric = Math.round(value);
    name = Object.keys(TOON_DEBUG_OUTPUT_MODES).find((key) => TOON_DEBUG_OUTPUT_MODES[key] === numeric) ?? 'off';
  } else if (typeof value === 'string' && value in TOON_DEBUG_OUTPUT_MODES) {
    name = value;
  } else {
    name = TOON_DEBUG_MODE_ALIASES[normalizeToonDebugKey(value)] ?? 'off';
  }
  return {
    label: TOON_DEBUG_OUTPUT_LABELS[name] ?? TOON_DEBUG_OUTPUT_LABELS.off,
    name,
    value: TOON_DEBUG_OUTPUT_MODES[name] ?? 0,
  };
}

// A texture whose image never arrived (missing file, a dev server's HTML
// fallback, an undecodable format). Conversion runs after the runtime waits for
// textures, so an empty one at this point has failed; sampling it would render
// the mesh black or cut it away entirely, so it is treated as absent.
function usableTexture(texture) {
  return texture?.isTexture && textureHasImage(texture) ? texture : null;
}

const fallbackSkinTexture = new THREE.DataTexture(new Uint8Array([255, 222, 205, 255]), 1, 1);
fallbackSkinTexture.colorSpace = THREE.SRGBColorSpace;
fallbackSkinTexture.needsUpdate = true;

const COLOR_TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'matcap',
  'sheenColorMap',
  'specularColorMap',
];

const DATA_TEXTURE_KEYS = [
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
];

function toMaterialArray(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

// Data textures (TGA, DDS, EXR loaders) are created empty — a 1×1 image with
// no data — and filled when the file arrives, so size alone is not readiness.
function textureHasImage(texture) {
  const image = texture?.image;
  if (!image) return false;
  if (texture.isDataTexture || texture.isCompressedTexture) return Boolean(image.data || texture.mipmaps?.length);
  return Boolean(image.width || image.videoWidth || image.data);
}

const TEXTURE_WAIT_TIMEOUT_MS = 5000;
const TEXTURE_POLL_MS = 50;

export function waitForTexture(texture) {
  if (!texture) return Promise.resolve(texture);
  if (textureHasImage(texture)) {
    return Promise.resolve(texture);
  }

  if (Array.isArray(texture.readyCallbacks)) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(texture), TEXTURE_WAIT_TIMEOUT_MS);
      texture.readyCallbacks.push(() => {
        window.clearTimeout(timer);
        resolve(texture);
      });
    });
  }

  // Loaders that expose no callback (FBXLoader's texture handlers): poll.
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (textureHasImage(texture) || Date.now() - started > TEXTURE_WAIT_TIMEOUT_MS) resolve(texture);
      else window.setTimeout(poll, TEXTURE_POLL_MS);
    };
    poll();
  });
}

function collectTexturesFromMaterial(mat, textures) {
  for (const key of [...COLOR_TEXTURE_KEYS, ...DATA_TEXTURE_KEYS]) {
    if (mat?.[key]?.isTexture) textures.add(mat[key]);
  }
  for (const { texture } of collectMaterialMapTextures(mat)) {
    textures.add(texture);
  }
}

export function waitForObjectTextures(root) {
  const textures = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) collectTexturesFromMaterial(mat, textures);
  });
  return Promise.all([...textures].map(waitForTexture));
}

export function setObjectTextureColorSpaces(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) {
      for (const key of COLOR_TEXTURE_KEYS) {
        if (mat?.[key]?.isTexture) mat[key].colorSpace = THREE.SRGBColorSpace;
      }
      for (const key of DATA_TEXTURE_KEYS) {
        if (mat?.[key]?.isTexture) mat[key].colorSpace = THREE.NoColorSpace;
      }
      for (const { texture, colorSpace } of collectMaterialMapTextures(mat)) {
        texture.colorSpace = colorSpace;
      }
    }
  });
}

function ensureGeometryAttributes(geometry) {
  const position = geometry?.attributes?.position;
  if (!position) return;

  if (!geometry.attributes.normal) geometry.computeVertexNormals();

  if (!geometry.attributes.uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }

  if (!geometry.attributes.uv2) {
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());
  }
}

// Averages normals across position-duplicate vertices and stores the result as
// an outlineSmoothNormal attribute. The inverted-hull outline expands along
// these instead of the render normals, so hard-edged geometry (split vertices
// at creases — Rigify mannequin, arbitrary GLB props) keeps a closed hull
// instead of cracking open at every sharp edge. Smooth-shaded meshes (typical
// PMX characters) are detected and skipped, costing no extra memory.
function bakeSmoothedOutlineNormals(geometry) {
  const position = geometry?.attributes?.position;
  const normal = geometry?.attributes?.normal;
  if (!position || !normal || geometry.attributes.outlineSmoothNormal) {
    return Boolean(geometry?.attributes?.outlineSmoothNormal);
  }

  const groups = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const entry = groups.get(key);
    if (entry) entry.push(i);
    else groups.set(key, [i]);
  }

  let hasSplitNormals = false;
  const smoothed = new Float32Array(position.count * 3);
  for (const indices of groups.values()) {
    for (const index of indices) {
      const nx = normal.getX(index);
      const ny = normal.getY(index);
      const nz = normal.getZ(index);
      // Average only normals on the same side. Double-sided cloth and hair
      // cards often store the back layer as coincident vertices with flipped
      // normals; averaging across the two layers cancels to ~zero and leaves
      // the hull lying on the visible surface, where it paints it in ink.
      // Degenerate welds (dozens of vertices on one point) keep the plain sum.
      const sideAware = indices.length <= 32;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const other of indices) {
        const ox = normal.getX(other);
        const oy = normal.getY(other);
        const oz = normal.getZ(other);
        if (sideAware && nx * ox + ny * oy + nz * oz <= 0) continue;
        x += ox;
        y += oy;
        z += oz;
      }
      const length = Math.sqrt(x * x + y * y + z * z) || 1;
      x /= length;
      y /= length;
      z /= length;
      smoothed[index * 3] = x;
      smoothed[index * 3 + 1] = y;
      smoothed[index * 3 + 2] = z;
      if (!hasSplitNormals && x * nx + y * ny + z * nz < 0.999) hasSplitNormals = true;
    }
  }

  if (!hasSplitNormals) return false;
  geometry.setAttribute('outlineSmoothNormal', new THREE.BufferAttribute(smoothed, 3));
  return true;
}

function materialDrawOrder(mat, materialRoleOverrides = null, alphaSettings = createAlphaSettings()) {
  const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
  return materialAlphaDrawOrder(alphaSettings, mat, roleInfo);
}

function promoteOverlayGroups(geometry, materials, materialRoleOverrides = null, alphaSettings = createAlphaSettings()) {
  if (!geometry?.groups?.length || !Array.isArray(materials)) return;
  geometry.groups = geometry.groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const aOrder = materialDrawOrder(materials[a.group.materialIndex], materialRoleOverrides, alphaSettings);
      const bOrder = materialDrawOrder(materials[b.group.materialIndex], materialRoleOverrides, alphaSettings);
      return aOrder - bOrder || a.index - b.index;
    })
    .map(({ group }) => group);
}

function materialNumericSuffix(name) {
  const match = String(name ?? '').match(/^(.+?)[_\s-]*(\d{1,4})$/);
  if (!match) return null;

  const stem = match[1].replace(/[_\s-]+$/g, '').toLowerCase();
  const suffix = Number(match[2]);
  return stem && Number.isFinite(suffix) ? { stem, suffix } : null;
}

function anonymousMaterialIndex(name) {
  const normalized = String(name ?? '').trim().toLowerCase();
  if (normalized === 'material') return 0;

  const match = normalized.match(/^material[_\s-]+(\d{1,4})$/);
  if (!match) return null;

  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

function materialHasReadableGltfTextureName(mat) {
  const source = mat?.userData?.toonSource || {};
  const materialName = String(source.materialName || '').trim();
  const hasReadableMaterialName = materialName && anonymousMaterialIndex(materialName) === null;
  return Boolean(hasReadableMaterialName || source.textureName || source.imageName || source.imageUri);
}

function inferAnonymousGltfAtlasRoles(root, materialRoleOverrides, nextOverrides) {
  const groups = new Map();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    for (const mat of toMaterialArray(obj.material)) {
      if (!mat?.uuid || nextOverrides.byUuid.has(mat.uuid)) continue;

      const existingRole = classifyMaterialRole(mat, materialRoleOverrides);
      if (existingRole.role !== 'default') continue;

      const source = mat.userData?.toonSource || {};
      if (source.format !== 'gltf' || materialHasReadableGltfTextureName(mat)) continue;

      const materialIndex = anonymousMaterialIndex(mat.name);
      if (!Number.isInteger(materialIndex) || !Number.isInteger(source.imageIndex)) continue;

      const key = source.sourceUrl || 'anonymous-gltf';
      const group = groups.get(key) ?? {
        imageCount: source.imageCount ?? 0,
        materials: [],
        usedImages: new Set(),
      };
      group.imageCount = Math.max(group.imageCount, source.imageCount ?? 0);
      group.materials.push({ imageIndex: source.imageIndex, mat, materialIndex });
      group.usedImages.add(source.imageIndex);
      groups.set(key, group);
    }
  });

  for (const group of groups.values()) {
    if (group.imageCount < 3 || group.materials.length < 3) continue;
    if (!group.usedImages.has(0) || !group.usedImages.has(1) || !group.usedImages.has(2)) continue;

    for (const { imageIndex, mat } of group.materials) {
      let role = 'costume';
      if (imageIndex === 0) role = 'face';
      else if (imageIndex === 2) role = 'hair';

      if (mat.uuid && !nextOverrides.byUuid.has(mat.uuid)) {
        nextOverrides.byUuid.set(mat.uuid, role);
        nextOverrides.sourcesByUuid.set(mat.uuid, 'inferred:anonymous-gltf-atlas');
      }
    }
  }
}

// Skin/face roles that came only from a name are checked against the colour
// the mesh actually shows (skinEvidence.js); a robot `arm_mat` or `robo_face`
// is demoted to default. Explicit overrides and userData roles are trusted.
const SKIN_EVIDENCE_MIN_FRACTION = 0.3;
// Facial features legitimately carry the face role without being skin-coloured.
const FACIAL_FEATURE_PATTERN = /brow|lash|eyeline|eye_line|mouth|teeth|tooth|tongue|lip|眉|睫|まつ|まゆ|二重|口|舌|歯|齿|牙/i;
// Features that anime rendering draws over the bangs (alpha.featuresOverHairDepth).
const OVER_HAIR_FEATURE_PATTERN = /brow|lash|eyeline|eye_line|眉|睫|まつ|まゆ|二重/i;

function demoteNonSkinColoredRoles(root, materialRoleOverrides, nextOverrides) {
  const checked = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material || obj.userData?.isToonOutline) return;
    const materials = toMaterialArray(obj.material);
    materials.forEach((mat, slotIndex) => {
      if (!mat?.uuid || checked.has(mat) || nextOverrides.byUuid.has(mat.uuid)) return;
      if (mat.isMToonMaterial && mat.isOutline) return;
      checked.add(mat);
      const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
      if (roleInfo.source !== 'heuristic' || !(roleInfo.role === 'skin' || roleInfo.role === 'face')) return;
      if (roleInfo.role === 'face' && FACIAL_FEATURE_PATTERN.test(mat.name ?? '')) return;
      const evidence = measureSkinEvidence(mat, obj.geometry, { materialIndex: materials.length > 1 ? slotIndex : null });
      if (!evidence || evidence.fraction >= SKIN_EVIDENCE_MIN_FRACTION) return;
      nextOverrides.byUuid.set(mat.uuid, 'default');
      nextOverrides.sourcesByUuid.set(mat.uuid, 'inferred:not-skin-colored');
      nextOverrides.demotions.push({ from: roleInfo.role, material: mat.name || '(unnamed)', skinFraction: evidence.fraction });
    });
  });
}

function createInferredMaterialRoleOverrides(root, materialRoleOverrides, {
  inferAnonymousGltfAtlases = true,
  inferPackedTriplets = true,
  verifySkinColor = true,
} = {}) {
  const nextOverrides = {
    byName: new Map(materialRoleOverrides.byName),
    byUuid: new Map(materialRoleOverrides.byUuid),
    demotions: [],
    patterns: [...materialRoleOverrides.patterns],
    sourcesByUuid: new Map(materialRoleOverrides.sourcesByUuid ?? []),
  };

  const groups = new Map();

  if (inferPackedTriplets) {
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      for (const mat of toMaterialArray(obj.material)) {
        if (!mat?.uuid || nextOverrides.byUuid.has(mat.uuid)) continue;

        const existingRole = classifyMaterialRole(mat, materialRoleOverrides);
        if (existingRole.role !== 'default') continue;

        const suffixInfo = materialNumericSuffix(mat.name);
        if (!suffixInfo) continue;

        const group = groups.get(suffixInfo.stem) ?? new Map();
        group.set(suffixInfo.suffix, mat);
        groups.set(suffixInfo.stem, group);
      }
    });

    for (const group of groups.values()) {
      // Common packed game-model export pattern: body/face/hair materials lose
      // texture filenames in GLB but retain the source material numeric suffixes.
      const suffixRoles = [
        [81, 'skin'],
        [82, 'face'],
        [83, 'hair'],
      ];
      if (!suffixRoles.every(([suffix]) => group.has(suffix))) continue;

      for (const [suffix, role] of suffixRoles) {
        const mat = group.get(suffix);
        if (mat?.uuid && !nextOverrides.byUuid.has(mat.uuid)) {
          nextOverrides.byUuid.set(mat.uuid, role);
          nextOverrides.sourcesByUuid.set(mat.uuid, 'inferred:packed-triplet');
        }
      }
    }
  }

  if (inferAnonymousGltfAtlases) {
    inferAnonymousGltfAtlasRoles(root, materialRoleOverrides, nextOverrides);
  }

  if (verifySkinColor) {
    demoteNonSkinColoredRoles(root, materialRoleOverrides, nextOverrides);
  }

  return nextOverrides;
}

function addMaterialRoleSummaryEntry(summary, mat, roleInfo) {
  const role = roleInfo.role || 'default';
  summary.total += 1;
  summary.counts[role] = (summary.counts[role] ?? 0) + 1;
  if (summary.materials.length >= 120) return;

  const source = mat?.userData?.toonSource || {};
  summary.materials.push({
    imageIndex: Number.isInteger(source.imageIndex) ? source.imageIndex : null,
    materialIndex: Number.isInteger(source.materialIndex) ? source.materialIndex : null,
    name: mat?.name ?? '',
    role,
    source: roleInfo.source,
    texture: mat?.map?.name || source.imageName || source.imageUri || source.textureName || '',
  });
}

// ---------------------------------------------------------------------------
// Material inputs.

// WebGPU binds at most 8 vertex buffers per draw; past that, attributes are
// silently mis-bound and the mesh renders corrupted. Estimates the buffers a
// toon material on this geometry reads (interleaved attributes share one).
const VERTEX_BUFFER_LIMIT = 8;

function vertexBufferCount(geometry, { skinned, roleWeights, bake, uv2, color }) {
  const attributes = geometry?.attributes ?? {};
  const names = ['position', 'normal', 'uv'];
  if (skinned) names.push('skinIndex', 'skinWeight');
  if (roleWeights) names.push('toonRoleWeights');
  if (bake) names.push('toonBake');
  if (uv2) names.push('uv1');
  if (color) names.push('color');
  const buffers = new Set();
  for (const name of names) {
    const attribute = attributes[name] ?? (name === 'uv1' ? attributes.uv2 : undefined);
    // A missing attribute still costs a (default) buffer binding.
    buffers.add(attribute?.isInterleavedBufferAttribute ? attribute.data : (attribute ?? name));
  }
  return buffers.size;
}

function sourceSpecularMaskMap(mat, settings) {
  const mask = settings.highlights.specular.mask;
  if (mask.map?.isTexture) return mask.map;
  if (!mask.fromSource) return null;
  return usableTexture(
    mat?.userData?.toonSpecularMaskMap ??
    mat?.userData?.specularMaskMap ??
    mat?.specularIntensityMap ??
    mat?.specularMap ??
    null,
  );
}

// MMD sphere maps come through three's MMD loader as `matcap`; only additive
// ones (.spa) read as a matcap highlight — a multiplied one (.sph) would
// darken the albedo as a highlight.
function usableMatcap(mat, maps) {
  if (!maps.matcapMap) return null;
  if (mat?.matcapCombine === THREE.MultiplyOperation) return null;
  return maps.matcapMap;
}

// A light proxy of the source material for live retunes (base colour policy).
function sourceProxy(mat) {
  return {
    color: getSourceMaterialColor(mat).clone(),
    isMToonMaterial: Boolean(mat?.isMToonMaterial),
    map: mat?.map?.isTexture ? { isTexture: true } : null,
    userData: { toonSource: { ...(mat?.userData?.toonSource ?? {}) } },
  };
}

function stickerInputs(settings, mat) {
  const sticker = settings.sticker;
  const map = sticker.map ?? mat?.userData?.toonStickerMap ?? mat?.userData?.stickerMap ?? null;
  return {
    map: sticker.enabled && map?.isTexture ? map : null,
    params: {
      stickerBlend: STICKER_BLEND_MODE_VALUES[sticker.blendMode] ?? 0,
      stickerOffset: sticker.offset,
      stickerRepeat: sticker.repeat,
      stickerStrength: sticker.enabled ? sticker.strength : 0,
    },
    uvChannel: sticker.uvChannel,
  };
}

// Per-material inputs that depend on the source material rather than on the
// preset: base colour, source map factors, authored overrides' defaults.
function materialInputs(settings, { proxy, flags, maps, alpha, noseMark, shadeOverride, fur }) {
  const baseColor = resolveBaseMaterialColor(proxy, settings.baseTexture);
  return {
    baseAlphaStrength: alpha?.textureAlpha ?? 1,
    baseColor: [baseColor.r, baseColor.g, baseColor.b],
    baseSaturation: resolveBaseMapSaturation(flags, settings.baseTexture),
    emissiveColor: maps?.emissiveColor ? [maps.emissiveColor.r, maps.emissiveColor.g, maps.emissiveColor.b] : [0, 0, 0],
    shellDensity: fur.density,
    shellSag: fur.gravity,
    shellLength: fur.length,
    shellRootOffset: fur.rootOffset,
    shellRootShade: fur.rootShade,
    noseCenter: noseMark?.center ?? [0.5, 0.5],
    noseLeaf: noseMark?.size ?? [0.01, 0.01],
    outlineColorOverride: [0, 0, 0, 0],
    outlineOverrideLightingMix: 1,
    shadeColor: shadeOverride?.color ? [shadeOverride.color.r, shadeOverride.color.g, shadeOverride.color.b] : [1, 1, 1],
    shadeStrength: shadeOverride ? 1 : 0,
    sourceAoIntensity: maps?.aoMapIntensity ?? 1,
    sourceMetalness: maps?.metalness ?? 0,
    sourceNormalScale: maps?.normalScale ?? 1,
    toneOverride: [1, 1, 1, 0],
  };
}

function materialParameters(settings, material) {
  const data = material.userData;
  const context = data.toonParameterContext;
  const inputs = materialInputs(settings, {
    alpha: data.toonAlpha,
    flags: context,
    fur: settings.fur,
    maps: data.toonMaps,
    noseMark: data.toonNoseMark,
    proxy: data.toonSourceProxy,
    shadeOverride: data.toonShadeOverride,
  });
  const sticker = stickerInputs(settings, { userData: {} });
  return {
    ...resolveCharacterParameters(settings, context),
    ...inputs,
    ...sticker.params,
    ...(data.toonParameterOverrides ?? {}),
  };
}

function createCharacterMaterialFromSource(mat, {
  autoFaceShadowMap = null,
  materialRoleOverrides = null,
  settings,
  slot = null,
  state,
}) {
  const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
  const role = characterRoleKey(roleInfo);
  const isFace = role === 'face';
  const isSkin = role === 'skin';
  const alpha = resolveAlphaForMaterial(settings.alpha, mat, roleInfo, slot?.alphaCoverage);
  const maps = resolveMaterialMaps(settings.maps, mat);
  const source = resolveSourceShading(mat, { settings });
  const geometry = slot?.geometry;
  const geometryAttributes = geometry?.attributes ?? {};

  // Automatic roles on a low-poly head bake a per-texel mask; it replaces the
  // per-vertex weights, which smear across the face's large triangles.
  const autoRoleMask = geometry?.userData?.toonAutoRoleMask ?? null;
  const roleMaskMap = source.roleMaskMap ?? autoRoleMask;
  const roleWeightsAttribute = Boolean(geometryAttributes.toonRoleWeights) && !(autoRoleMask && roleMaskMap === autoRoleMask);
  const roleWeights = roleMaskMap ? 'mask' : roleWeightsAttribute ? 'attribute' : null;
  const hasRoleEvidence = Boolean(roleWeights);
  const hasHairEvidence = Boolean(roleMaskMap) || Boolean(geometry?.userData?.toonRoleWeightsHasHair);

  // A face with no authored map uses the automatic bake, sampled through the
  // planar face coordinates the bake wrote onto this geometry.
  const faceCandidate = settings.face.enabled && (isFace || hasRoleEvidence);
  let faceMap = faceCandidate ? source.faceShadowMap : null;
  let faceMapCoords = faceMap ? settings.face.map.uvChannel : null;
  const useAutoFaceMap = faceCandidate && !faceMap && Boolean(autoFaceShadowMap) && hasBakedFaceUv(geometry);

  // Per-material detail read from the bake's w channel (featureBakes.js).
  const detailKind = roleInfo.role === 'sclera' && mat?.userData?.toonLidShadeBaked && hasBakedDetail(geometry, 'lid')
    ? 'lid'
    : mat?.userData?.toonSheerBaked && hasBakedDetail(geometry, 'sheer') && role === 'cloth'
      ? 'sheer'
      : null;
  const sticker = stickerInputs(settings, mat);
  const budget = {
    detail: detailKind,
    faceUv: useAutoFaceMap,
    occlusion: hasBakedOcclusion(geometry) && role !== 'eye',
    trimmed: [],
  };
  const usesColor = Boolean(geometryAttributes.color) && (mat?.vertexColors === true || settings.outline.widthVertexColorChannel >= 0);
  const bufferCount = () => vertexBufferCount(geometry, {
    bake: budget.faceUv || budget.occlusion || Boolean(budget.detail),
    color: usesColor,
    roleWeights: roleWeights === 'attribute',
    skinned: Boolean(slot?.mesh?.isSkinnedMesh),
    uv2: Boolean(sticker.map) && sticker.uvChannel === 1,
  });
  // Keep within WebGPU's vertex buffer limit: drop details first, then the
  // occlusion bias, then the automatic face map.
  if (bufferCount() > VERTEX_BUFFER_LIMIT && budget.detail) {
    budget.trimmed.push(budget.detail === 'lid' ? 'eye-white lid shade' : 'sheer highlight');
    budget.detail = null;
  }
  if (bufferCount() > VERTEX_BUFFER_LIMIT && budget.occlusion) {
    budget.occlusion = false;
    budget.trimmed.push('lighting-map occlusion bias');
  }
  if (bufferCount() > VERTEX_BUFFER_LIMIT && budget.faceUv) {
    budget.faceUv = false;
    budget.trimmed.push('face map');
  }
  if (budget.faceUv) {
    faceMap = autoFaceShadowMap;
    faceMapCoords = 'bake';
  }
  const noseMark = budget.faceUv && settings.face.nose.auto && geometry?.userData?.toonNoseMark && !geometry.userData.toonNoseMark.drawn
    ? geometry.userData.toonNoseMark
    : null;

  const specularMask = sourceSpecularMaskMap(mat, settings);
  const matcapMap = usableMatcap(mat, maps) ?? source.matcapMap;
  const shadeOverride = source.shadeOverride;
  const rampMap = usableTexture(source.rampMap);
  const paintedEyeHighlights = role === 'eye' && !roleIsEyeHighlight(roleInfo) && Boolean(slot?.modelFacts?.hasPaintedEyeHighlights);
  const isTransparentOverlay = roleIsTransparentOverlay(roleInfo);

  const features = {
    bake: {
      any: budget.faceUv || budget.occlusion || Boolean(budget.detail),
      detail: budget.detail,
      faceUv: budget.faceUv,
      occlusion: budget.occlusion,
    },
    baseMap: usableTexture(mat?.map) ?? (isSkin ? fallbackSkinTexture : null),
    emissive: Boolean(maps.emissiveColor),
    faceMap: faceMap ?? null,
    faceMapCoords,
    lightingMap: usableTexture(source.lightingMap),
    lightingMapUv: 0,
    maps: {
      aoMap: maps.aoMap,
      detailMap: maps.detailMap,
      emissiveMap: maps.emissiveColor ? maps.emissiveMap : null,
      matcapMap,
      metalnessMap: maps.metalnessMap,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      specularColorMap: maps.specularColorMap,
    },
    materialRole: roleInfo.roleValue ?? 0,
    noseMark: Boolean(noseMark),
    outlineColorOverride: Boolean(source.parameterOverrides.outlineColorOverride),
    outlineWidthMap: usableTexture(source.outlineWidthMap),
    overHairFeature: (roleInfo.role === 'face' || roleInfo.role === 'eye') && OVER_HAIR_FEATURE_PATTERN.test(mat?.name ?? ''),
    rampMap,
    rampMapDecoded: rampMap?.colorSpace === THREE.SRGBColorSpace,
    role,
    roleMaskMap: roleWeights === 'mask' ? roleMaskMap : null,
    roleWeights,
    shadeMap: usableTexture(shadeOverride?.map),
    shadeOverride: Boolean(shadeOverride),
    specularMask,
    sticker: sticker.map ? { map: sticker.map, uvChannel: sticker.uvChannel } : null,
    toneOverride: Boolean(source.parameterOverrides.toneOverride),
    cutout: alpha.alphaTest > 0,
    dither: settings.alpha.ditherOpacity < 0.999,
    vertexColorAlpha: geometryAttributes.color?.itemSize === 4,
    vertexColorWidth: usesColor && settings.outline.widthVertexColorChannel >= 0,
    vertexColors: usesColor && mat?.vertexColors === true,
  };

  const context = {
    hasFaceMap: Boolean(features.faceMap),
    hasSpecularMask: Boolean(specularMask),
    isFace,
    isSkin,
    paintedEyeHighlights,
    role,
    roleWeights: Boolean(roleWeights),
  };
  const userData = {
    toonAlpha: alpha,
    toonMaps: { aoMapIntensity: maps.aoMapIntensity, emissiveColor: maps.emissiveColor, metalness: maps.metalness, normalScale: maps.normalScale },
    toonNoseMark: noseMark,
    toonParameterContext: context,
    toonParameterOverrides: source.parameterOverrides,
    toonShadeOverride: shadeOverride ? { color: shadeOverride.color } : null,
    toonSourceProxy: sourceProxy(mat),
  };
  const probe = { userData };
  const params = materialParameters(settings, probe);
  Object.assign(params, sticker.params);

  const material = createToonCharacterMaterial({ features, params, side: THREE.DoubleSide, state });
  Object.assign(material.userData, userData);
  material.name = mat?.name ?? '';
  material.visible = mat?.visible ?? true;
  material.alphaTest = alpha.alphaTest > 0 ? alpha.alphaTest : 0;
  material.transparent = Boolean(alpha.transparent || alpha.alphaBlend);
  material.depthWrite = alpha.depthWrite !== false;
  material.opacity = alpha.opacity;

  material.userData.toonFlags = {
    hasFaceShadowMap: Boolean(features.faceMap),
    hasFaceUv: budget.faceUv,
    hasRoleWeights: Boolean(roleWeights),
    isFurShell: false,
    isOutline: false,
  };
  material.userData.toonVertexBufferTrimmed = budget.trimmed;
  material.userData.toonSourceShading = {
    hasHairEvidence,
    isMToon: source.isMToon,
    isTransparentOverlay,
    mmdToonFile: source.mmdToonFile,
    outlineOff: source.outlineOff,
    roleWeights,
  };
  material.userData.alphaCoverage = alpha.coverage;
  material.userData.alphaCoverageDetail = slot?.alphaCoverage ?? null;
  material.userData.materialRole = roleInfo.role;
  material.userData.materialRoleLabel = roleInfo.roleLabel;
  material.userData.materialRoleSource = roleInfo.source;
  material.userData.toonRole = role;
  material.userData.sourceMaterialName = mat?.name ?? '';
  material.userData.sourceMaterialUuid = mat?.uuid ?? '';

  // Eye layers stay on top of the face they sit in.
  if (role === 'eye' || roleIsEyeHighlight(roleInfo)) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = roleIsEyeHighlight(roleInfo) ? -2 : -1;
    material.polygonOffsetUnits = roleIsEyeHighlight(roleInfo) ? -2 : -1;
  }
  return material;
}

function createDebugMaterial(mat, shaderMode, { alphaSettings = createAlphaSettings(), baseTextureSettings, materialRoleOverrides = null } = {}) {
  const roleInfo = classifyMaterialRole(mat, materialRoleOverrides);
  if (shaderMode === 'normal') return new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  const alpha = resolveAlphaForMaterial(alphaSettings, mat, roleInfo);
  const params = {
    alphaMap: mat?.alphaMap ?? null,
    alphaTest: alpha.alphaCutout ? alpha.alphaTest : mat?.alphaTest ?? 0,
    color: resolveBaseMaterialColor(mat, baseTextureSettings),
    depthWrite: alpha.depthWrite,
    map: usableTexture(mat?.map),
    opacity: alpha.opacity,
    side: THREE.DoubleSide,
    transparent: alpha.alphaBlend,
  };
  if (shaderMode === 'toon') return new THREE.MeshToonMaterial(params);
  return new THREE.MeshBasicMaterial(params);
}

// ---------------------------------------------------------------------------
// Outline hulls and fur shells.

function outlineRoleWidth(material) {
  const uniforms = material.uniforms ?? {};
  const widths = ['outlineWidth', 'outlineWidthSkin', 'outlineWidthFace', 'outlineWidthHair']
    .map((name) => uniforms[name]?.value)
    .filter((value) => Number.isFinite(value));
  return widths.length ? Math.max(...widths) : 0;
}

function outlineVisible(settings, bodyMaterial, hull) {
  const source = bodyMaterial.userData.toonSourceShading ?? {};
  if (!settings.outline.enabled) return false;
  if (settings.outline.honourSourceOff && source.outlineOff) return false;
  if (source.isTransparentOverlay || bodyMaterial.transparent) return false;
  return Boolean(bodyMaterial.visible) && outlineRoleWidth(hull) > 0;
}

function createOutlineMaterial(bodyMaterial, settings, state) {
  const features = { ...bodyMaterial.userData.toonFeatures, outline: true };
  const params = materialParameters(settings, bodyMaterial);
  const hull = createToonCharacterMaterial({ features, params, state });
  for (const key of ['toonAlpha', 'toonMaps', 'toonNoseMark', 'toonParameterContext', 'toonParameterOverrides', 'toonShadeOverride', 'toonSourceProxy', 'toonSourceShading', 'toonRole']) {
    hull.userData[key] = bodyMaterial.userData[key];
  }
  hull.name = bodyMaterial.name;
  hull.alphaTest = bodyMaterial.alphaTest;
  hull.userData.toonBodyMaterial = bodyMaterial;
  hull.userData.toonFlags = { ...bodyMaterial.userData.toonFlags, isOutline: true };
  hull.userData.materialRole = 'outline';
  hull.userData.materialRoleLabel = 'Outline';
  hull.userData.materialRoleSource = bodyMaterial.userData.materialRoleSource ?? 'outline';
  hull.visible = outlineVisible(settings, bodyMaterial, hull);
  return hull;
}

function hullGeometry(source) {
  // Share every buffer with the source but read the baked smooth normals.
  const geometry = new THREE.BufferGeometry();
  geometry.index = source.index;
  for (const name of Object.keys(source.attributes)) geometry.setAttribute(name, source.attributes[name]);
  geometry.setAttribute('normal', source.getAttribute('outlineSmoothNormal'));
  geometry.morphAttributes = source.morphAttributes;
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.groups = source.groups;
  geometry.drawRange = source.drawRange;
  geometry.boundingSphere = source.boundingSphere;
  geometry.boundingBox = source.boundingBox;
  return geometry;
}

function attachDerivedMesh(mesh, derived) {
  derived.renderOrder = (mesh.renderOrder ?? 0) + 1;
  derived.frustumCulled = false;
  derived.castShadow = false;
  derived.receiveShadow = false;
  derived.position.set(0, 0, 0);
  derived.quaternion.identity();
  derived.scale.set(1, 1, 1);
  derived.updateMatrix();
  if (mesh.isSkinnedMesh && derived.isSkinnedMesh) {
    derived.bindMode = mesh.bindMode;
    derived.bindMatrix.copy(mesh.bindMatrix);
    derived.bindMatrixInverse.copy(mesh.bindMatrixInverse);
    derived.skeleton = mesh.skeleton;
  }
  derived.onBeforeRender = toonNodeLightSync;
  mesh.add(derived);
  derived.updateMatrixWorld(true);
}

function addOutlinePass(mesh, settings, state) {
  const outline = mesh.clone(false);
  outline.geometry = mesh.geometry;
  outline.material = Array.isArray(mesh.material)
    ? mesh.material.map((material) => createOutlineMaterial(material, settings, state))
    : createOutlineMaterial(mesh.material, settings, state);
  if (settings.outline.smoothNormals !== false && bakeSmoothedOutlineNormals(mesh.geometry)) {
    outline.geometry = hullGeometry(mesh.geometry);
  }
  outline.userData.isToonOutline = true;
  attachDerivedMesh(mesh, outline);
}

const hiddenFurSlotMaterial = new THREE.MeshBasicMaterial({ name: 'ToonFurHiddenSlot', visible: false });

// Shell fur: sibling meshes sharing the geometry and skeleton; each shell has
// its own material (its layer is a graph constant).
function addFurShells(mesh, furMatchesByIndex, settings, state) {
  const furSettings = settings.fur;
  const bodyMaterials = toMaterialArray(mesh.material);
  if (!furMatchesByIndex.some(Boolean)) return;
  for (let shellIndex = 0; shellIndex < furSettings.shellCount; shellIndex += 1) {
    const layer = (shellIndex + 1) / furSettings.shellCount;
    const shellMaterials = bodyMaterials.map((bodyMaterial, index) => {
      if (!furMatchesByIndex[index] || !bodyMaterial?.userData?.toonFeatures) return hiddenFurSlotMaterial;
      const features = { ...bodyMaterial.userData.toonFeatures, furLayer: layer };
      const shell = createToonCharacterMaterial({ features, params: materialParameters(settings, bodyMaterial), state });
      for (const key of ['toonAlpha', 'toonMaps', 'toonNoseMark', 'toonParameterContext', 'toonParameterOverrides', 'toonShadeOverride', 'toonSourceProxy', 'toonSourceShading', 'toonRole']) {
        shell.userData[key] = bodyMaterial.userData[key];
      }
      shell.name = `${bodyMaterial.name} (fur shell ${shellIndex + 1})`;
      shell.alphaTest = 0;
      shell.userData.toonFlags = { ...bodyMaterial.userData.toonFlags, isFurShell: true };
      return shell;
    });
    const shell = mesh.clone(false);
    shell.geometry = mesh.geometry;
    shell.material = Array.isArray(mesh.material) ? shellMaterials : shellMaterials[0];
    shell.userData.isToonFurShell = true;
    attachDerivedMesh(mesh, shell);
  }
}

export function findPrimarySkinnedMesh(root) {
  let bestMesh = null;
  let bestVertexCount = -1;
  root.traverse((obj) => {
    if (!obj.isSkinnedMesh || !obj.skeleton) return;
    const vertexCount = obj.geometry?.attributes?.position?.count ?? 0;
    if (vertexCount > bestVertexCount) {
      bestMesh = obj;
      bestVertexCount = vertexCount;
    }
  });
  return bestMesh;
}

// three-vrm realizes MToon outlines by appending a clone of the surface
// material (`isOutline`, BackSide) as a second slot drawing the whole mesh
// again. Converted as-is it becomes a second fully lit body under the toon
// outline hull; the toon pass owns outlines, so the importer slot is removed.
function stripImporterOutlineSlots(mesh) {
  if (!Array.isArray(mesh.material)) return 0;
  const keep = mesh.material.map((mat) => !(mat?.isMToonMaterial && mat.isOutline));
  const removed = keep.filter((kept) => !kept).length;
  if (removed === 0) return 0;
  const remap = [];
  let next = 0;
  for (const kept of keep) remap.push(kept ? next++ : -1);
  mesh.material = mesh.material.filter((_, index) => keep[index]);
  mesh.geometry.groups = mesh.geometry.groups
    .filter((group) => keep[group.materialIndex])
    .map((group) => ({ ...group, materialIndex: remap[group.materialIndex] }));
  return removed;
}

// Per-slot conversion context: the evidence measured on the surface this
// material actually draws.
function createMaterialSlot(mesh, mat, materialIndex, alphaSettings, modelFacts = {}) {
  const measureAlpha = alphaSettings.enabled &&
    alphaSettings.coverageMode === ALPHA_COVERAGE_MODES.auto &&
    usableTexture(mat?.map);
  return {
    alphaCoverage: measureAlpha ? measureAlphaCoverage(mat.map, mesh.geometry, { materialIndex }) : null,
    geometry: mesh.geometry,
    materialIndex,
    mesh,
    modelFacts,
  };
}

// Whole-model evidence gathered before any material is converted.
function collectModelFacts(root, materialRoleOverrides) {
  let hasPaintedEyeHighlights = false;
  let hasNamedFace = false;
  const materials = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material || obj.userData?.isToonOutline) return;
    for (const mat of toMaterialArray(obj.material)) {
      if (mat?.isMToonMaterial && mat.isOutline) continue;
      materials.add(mat);
      const role = classifyMaterialRole(mat, materialRoleOverrides).role;
      if (role === 'eyeHighlight' || role === 'catchlight') hasPaintedEyeHighlights = true;
      if (role === 'face') hasNamedFace = true;
    }
  });
  return { hasNamedFace, hasPaintedEyeHighlights, materialCount: materials.size };
}

// Plain record of what conversion decided and why, so a host (or an agent)
// can see a silent degradation instead of discovering it on screen.
function createConversionReport() {
  const entries = [];
  const seen = new Set();
  return {
    add(level, code, message, detail = {}) {
      entries.push({ code, detail, level, message });
    },
    // One entry per material even when several meshes share it.
    addForMaterial(level, code, materialName, message, detail = {}) {
      const key = `${code}\u0000${materialName}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ code, detail, level, message });
    },
    entries,
  };
}

const AUTO_ROLE_ELIGIBLE = new Set(['default', 'costume', 'skin']);

function runAutoRoles(root, toonSettings, materialRoleOverrides, modelFacts, report) {
  if (modelFacts.hasNamedFace) return null;
  if (toonSettings.autoRoles.mode !== 'auto') {
    report.add('warn', 'no-face-role', 'No material is recognised as a face and automatic roles are off; the face is shaded with the body terminator.');
    return null;
  }
  const result = inferAutoRoleWeights(root, {
    headBone: findHeadBone(root),
    isEligible: (mat) => !(mat?.isMToonMaterial && mat.isOutline) &&
      AUTO_ROLE_ELIGIBLE.has(classifyMaterialRole(mat, materialRoleOverrides).role),
    skinTolerance: toonSettings.autoRoles.skinTolerance,
  });
  if (result.applied) {
    report.add('info', 'auto-roles-applied', `No material is named as a face; inferred face, skin and hair per vertex (${result.method}).`, result);
  } else {
    report.add('warn', 'auto-roles-skipped', `No material is named as a face and automatic roles found insufficient evidence (${result.reason}); the face is shaded with the body terminator.`, result);
  }
  return result;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function runAutoFaceShadow(root, settings, materialRoleOverrides, report) {
  const face = settings.face;
  if (!face.enabled || !face.map.auto || face.map.texture) return null;
  const started = now();
  // The face skin only: facial features (brows, lashes) sit just in front of
  // it and would take over the front-most surface; authored maps win.
  const result = bakeFaceShadowMap(root, {
    isFaceMaterial: (mat) => !(mat.isMToonMaterial && mat.isOutline) &&
      !mat.userData?.toonFaceShadowMap &&
      classifyMaterialRole(mat, materialRoleOverrides).role === 'face' &&
      !FACIAL_FEATURE_PATTERN.test(mat.name ?? ''),
    // Faces found by automatic roles: the face-weighted vertices.
    isWeightEligible: (mat) => !(mat.isMToonMaterial && mat.isOutline) && !mat.userData?.toonFaceShadowMap,
  });
  if (!result) return null;
  const ms = Math.round(now() - started);
  report.add('info', 'face-shadow-map-baked', `Baked a face map from the face geometry (${result.meshes.length} mesh(es), ${ms} ms); faces with no authored map use it.`, {
    coveredTexels: result.coveredTexels,
    meshes: result.meshes.map((mesh) => mesh.name),
    ms,
  });
  return result;
}

function runAutoOcclusion(root, settings, report) {
  if (!settings.shading.enabled || !settings.shading.lightingMap.auto) return null;
  const started = now();
  const result = bakeLocalOcclusion(root, {
    // Everything that will be drawn occludes; importer outline slots and fur
    // shells do not.
    isEligibleMesh: (mesh) => !mesh.userData?.isToonFurShell,
  });
  if (!result) return null;
  const ms = Math.round(now() - started);
  report.add('info', 'shading-grade-baked', `Baked local occlusion for the automatic lighting map (${result.surfels} surfels, ${ms} ms); creases reach the shadow tone earlier.`, {
    meshes: result.meshes.length,
    ms,
    occludedVertices: result.occludedVertices,
    radius: result.radius,
  });
  return result;
}

function runAutoDetails(root, settings, materialRoleOverrides, report) {
  const roleOf = (mat) => classifyMaterialRole(mat, materialRoleOverrides).role;
  if (settings.face.enabled && settings.face.eyeWhiteShade.strength > 0) {
    const lid = bakeEyeWhiteLid(root, { isScleraMaterial: (mat) => roleOf(mat) === 'sclera' });
    if (lid?.meshes) {
      report.add('info', 'eye-white-lid-baked', `Baked the lid shade on ${lid.eyes} eye white(s); the band under the upper lid takes the eye-white shade tint.`, lid);
    }
    for (const name of lid?.painted ?? []) {
      report.add('info', 'eye-white-lid-painted', `${name}: its texture already shades the top of the eye white; no lid shade added.`);
    }
  }
  if (settings.highlights.enabled && settings.highlights.sheer.auto) {
    const sheer = bakeSheerFabric(root, { isEligibleMaterial: (mat) => ['default', 'costume'].includes(roleOf(mat)) });
    for (const name of sheer?.materials ?? []) {
      report.add('info', 'sheer-fabric-detected', `${name}: dark cloth down the legs read as stockings; it takes the stocking streak.`);
    }
  }
}

function reportMaterialDecisions(report, sourceMaterial, converted) {
  const name = sourceMaterial?.name || converted?.name || '(unnamed)';
  if (sourceMaterial?.map?.isTexture && !usableTexture(sourceMaterial.map)) {
    const texture = sourceMaterial.map.name || sourceMaterial.map.userData?.mimeType || 'base texture';
    report.addForMaterial('warn', 'texture-unavailable', name, `${name}: its ${texture} could not be loaded or decoded; shaded with the material colour instead.`, { material: name });
  }
  const coverage = converted?.userData?.alphaCoverage;
  if (coverage === 'data') {
    report.addForMaterial('info', 'alpha-data-channel', name, `${name}: base-texture alpha measured as packed data, not coverage; it is neither cut nor blended.`, converted.userData.alphaCoverageDetail ?? {});
  } else if (coverage === 'soft') {
    report.addForMaterial('info', 'alpha-soft-blend', name, `${name}: soft base-texture alpha on a material declared as blended; blended as coverage.`, converted.userData.alphaCoverageDetail ?? {});
  } else if (coverage === 'opaque' && (sourceMaterial?.alphaTest > 0 || sourceMaterial?.transparent) && !converted?.transparent) {
    report.addForMaterial('info', 'alpha-cutout-skipped', name, `${name}: marked cutout/transparent but no texel on its surface is transparent; drawn opaque.`);
  }
  if (converted?.userData?.toonVertexBufferTrimmed?.length) {
    report.addForMaterial('warn', 'vertex-buffer-budget', name, `${name}: too many vertex attributes for WebGPU's 8 vertex buffers; dropped the automatic ${converted.userData.toonVertexBufferTrimmed.join(' and ')}.`);
  }
  if (converted?.userData?.toonSourceShading?.isMToon) {
    report.addForMaterial('info', 'mtoon-imported', name, `${name}: VRM MToon shading imported (shade colour, shading shift/toony, outline colour, rim).`);
  }
  if (converted?.userData?.toonSourceShading?.mmdToonFile) {
    report.addForMaterial('info', 'mmd-toon-imported', name, `${name}: MMD toon ramp ${converted.userData.toonSourceShading.mmdToonFile} imported as its shadow tone.`);
  }
}

// ---------------------------------------------------------------------------
// The character's head frame at conversion (the render passes track it from
// then on).

const FACE_FORWARD = new THREE.Vector3(0, 0, 1);

function initializeHeadFrame(root, state, faceBake) {
  root.updateMatrixWorld(true);
  const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
  const forward = characterForward(root).applyQuaternion(rootQuaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQuaternion).normalize();
  state.headRestForward.value.copy(forward);
  state.headRestUp.value.copy(up);
  state.headForward.value.copy(forward);
  state.headUp.value.copy(up);
  const bone = findHeadBone(root);
  const estimate = root.userData?.toonHeadEstimate?.center;
  const head = bone
    ? bone.getWorldPosition(new THREE.Vector3())
    : estimate ? new THREE.Vector3().fromArray(estimate).applyMatrix4(root.matrixWorld) : null;
  if (faceBake?.frame) {
    // Face frame (character frame, see faceShadowBake.js) → root space.
    const { center, extent } = faceBake.frame;
    const halfWidth = extent / 1.1;
    const sphere = new THREE.Vector3().fromArray(center).addScaledVector(FACE_FORWARD, -halfWidth);
    const toRoot = characterFrameToRootMatrix(root);
    state.faceFrame = { halfWidth, sphereCenterRoot: sphere.applyMatrix4(toRoot) };
    state.headSphereCenter.value.copy(state.faceFrame.sphereCenterRoot).applyMatrix4(root.matrixWorld);
  } else if (head) {
    state.faceFrame = null;
    state.headSphereCenter.value.copy(head).addScaledVector(up, 0.08);
  }
  if (head) state.headPosition.value.copy(head);
  state.headReady.value = head || faceBake?.frame ? 1 : 0;
}

function characterFrameToRootMatrix(root) {
  const turn = new THREE.Quaternion().setFromUnitVectors(characterForward(root), FACE_FORWARD);
  if (Math.abs(characterForward(root).dot(FACE_FORWARD) + 1) < 1e-6) turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  return new THREE.Matrix4().makeRotationFromQuaternion(turn.invert());
}

// ---------------------------------------------------------------------------
// Public entry points.

const RETIRED_GROUPS = Object.freeze([
  'averageShadow', 'celShade', 'contactShadow', 'eyeHighlight', 'faceLighting', 'glitter', 'hairHighlight',
  'indirectLight', 'lighting', 'localLights', 'materialMaps', 'rimLight', 'sceneShadow', 'selfShadow',
  'shadowColor', 'skinTone', 'specular',
]);
const SETTINGS_GROUP_OPTIONS = Object.freeze([
  'light', 'shading', 'ramp', 'face', 'shadows', 'rim', 'highlights', 'outline', 'maps',
  'baseTexture', 'alpha', 'autoRoles', 'sticker', 'fur', 'materialRoles',
]);

/**
 * Converts every mesh under `root` to the toon character material. Options:
 * `preset`, `settings` (settings object or preset id), per-group overrides
 * (`light`, `shading`, `ramp`, `face`, `shadows`, `rim`, `highlights`,
 * `outline`, `maps`, `baseTexture`, `alpha`, `autoRoles`, `sticker`, `fur`),
 * `materialRoles`, `debugOutputMode`, `shaderMode` ('anime' | 'basic' |
 * 'toon' | 'normal'). Returns the conversion report and resolved settings.
 */
export function applyToonShader(root, options = {}) {
  const { debugOutputMode = 'off', preset = null, settings = null, shaderMode = 'anime' } = options;
  const settingsInput = typeof settings === 'string' ? { preset: settings } : settings || {};
  const overrides = {};
  for (const key of SETTINGS_GROUP_OPTIONS) {
    if (options[key] !== undefined && options[key] !== null) overrides[key] = options[key];
  }
  const toonSettings = createToonSettings({
    ...settingsInput,
    ...overrides,
    ...(preset ? { preset } : {}),
  });
  const normalizedShaderMode = ['anime', 'basic', 'toon', 'normal'].includes(shaderMode) ? shaderMode : 'anime';
  const resolvedDebugOutputMode = resolveToonDebugOutputMode(debugOutputMode);
  const normalizedMaterialRoleOverrides = normalizeMaterialRoleOverrides(toonSettings.materialRoles);
  const materialRoleOverrides = createInferredMaterialRoleOverrides(
    root,
    normalizedMaterialRoleOverrides,
    { inferPackedTriplets: toonSettings.materialRoles?.inferPackedTriplets !== false },
  );
  let convertedMeshCount = 0;
  const materialRoleSummary = { counts: {}, materials: [], total: 0 };

  const report = createConversionReport();
  const retired = RETIRED_GROUPS.filter((key) => options[key] !== undefined || settingsInput[key] !== undefined);
  if (retired.length) {
    report.add('warn', 'retired-settings-group', `Ignored settings groups retired in 0.5: ${retired.join(', ')}. See docs/toon-shading.md for the current groups.`, { groups: retired });
  }
  for (const demotion of materialRoleOverrides.demotions ?? []) {
    report.add('info', 'role-demoted-not-skin', `${demotion.material}: named as ${demotion.from} but only ${Math.round(demotion.skinFraction * 100)}% of its surface is skin-coloured; treated as default.`, demotion);
  }
  const modelFacts = collectModelFacts(root, materialRoleOverrides);
  const autoRoleResult = runAutoRoles(root, toonSettings, materialRoleOverrides, modelFacts, report);
  const faceBake = runAutoFaceShadow(root, toonSettings, materialRoleOverrides, report);
  runAutoOcclusion(root, toonSettings, report);
  runAutoDetails(root, toonSettings, materialRoleOverrides, report);

  const state = characterShadingStateFor(root);
  state.shadowSettings = { ...toonSettings.shadows.character };
  initializeHeadFrame(root, state, faceBake);
  let importerOutlineSlots = 0;

  root.traverse((obj) => {
    if (obj.userData?.isToonOutline || obj.userData?.isToonFurShell || !obj.isMesh || !obj.geometry || !obj.material) return;

    importerOutlineSlots += stripImporterOutlineSlots(obj);
    const originalMaterials = toMaterialArray(obj.material);
    ensureGeometryAttributes(obj.geometry);
    promoteOverlayGroups(obj.geometry, originalMaterials, materialRoleOverrides, toonSettings.alpha);

    // Fur opt-in is decided against the source materials (names/userData).
    const furMatchesByIndex = originalMaterials.map((mat) => (
      materialUsesFur(toonSettings.fur, mat, classifyMaterialRole(mat, materialRoleOverrides))
    ));
    for (const mat of originalMaterials) {
      addMaterialRoleSummaryEntry(materialRoleSummary, mat, classifyMaterialRole(mat, materialRoleOverrides));
    }

    const isMultiMaterial = Array.isArray(obj.material);
    const convertedMaterials = originalMaterials.map((mat, index) => {
      const slot = createMaterialSlot(obj, mat, isMultiMaterial ? index : null, toonSettings.alpha, modelFacts);
      if (normalizedShaderMode !== 'anime') {
        return createDebugMaterial(mat, normalizedShaderMode, {
          alphaSettings: toonSettings.alpha,
          baseTextureSettings: toonSettings.baseTexture,
          materialRoleOverrides,
        });
      }
      return createCharacterMaterialFromSource(mat, {
        autoFaceShadowMap: faceBake?.texture ?? null,
        materialRoleOverrides,
        settings: toonSettings,
        slot,
        state,
      });
    });
    obj.material = isMultiMaterial ? convertedMaterials : convertedMaterials[0];
    originalMaterials.forEach((mat, index) => reportMaterialDecisions(report, mat, convertedMaterials[index]));

    // Eye layers split into separate meshes (VRoid/VRM) must draw sclera →
    // iris/pupil → highlight → overlays. Multi-material meshes are already
    // ordered by promoteOverlayGroups.
    const layerOrder = isMultiMaterial
      ? 0
      : materialDrawOrder(originalMaterials[0], materialRoleOverrides, toonSettings.alpha);
    obj.renderOrder = layerOrder !== 0 ? layerOrder : (obj.renderOrder ?? 0);
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.onBeforeRender = toonNodeLightSync;
    convertedMeshCount += 1;

    if (normalizedShaderMode === 'anime') {
      if (toonSettings.outline.enabled) addOutlinePass(obj, toonSettings, state);
      if (toonSettings.fur.enabled) addFurShells(obj, furMatchesByIndex, toonSettings, state);
    }
  });

  if (resolvedDebugOutputMode.value > 0) setToonDebugOutput(root, resolvedDebugOutputMode.name);
  if (importerOutlineSlots > 0) {
    report.add('info', 'importer-outline-slots-removed', `Removed ${importerOutlineSlots} importer outline slot(s) (MToon); the toon outline pass draws outlines.`);
  }
  if (modelFacts.hasPaintedEyeHighlights) {
    report.add('info', 'painted-eye-highlights', 'The model ships painted eye highlights; the dynamic eye glint is suppressed on the eyes.');
  }
  if (!findHeadBone(root) && !root.userData?.toonHeadEstimate) {
    report.add('warn', 'no-head-frame', 'No head bone was found; face lighting uses the character\'s static frame instead of following the head.');
  }

  return {
    autoRoles: autoRoleResult,
    convertedMeshCount,
    debugOutputMode: resolvedDebugOutputMode,
    materialRoleSummary,
    primarySkinnedMesh: findPrimarySkinnedMesh(root),
    report: report.entries,
    settings: toonSettings,
    shaderMode: normalizedShaderMode,
    toonPreset: toonSettings.preset,
  };
}

function isCharacterMaterial(mat) {
  return Boolean(mat?.isToonCharacterMaterial && mat.userData?.toonParameterContext);
}

function retuneMaterial(mat, settings) {
  if (!isCharacterMaterial(mat)) return false;
  if (settings.alpha.ditherOpacity < 0.999) mat.userData.enableDither?.();
  applyCharacterParameters(mat, materialParameters(settings, mat));
  const state = characterStateOfMaterial(mat);
  if (state) state.shadowSettings = { ...settings.shadows.character };
  if (mat.userData.toonFlags?.isOutline && mat.userData.toonBodyMaterial) {
    mat.visible = outlineVisible(settings, mat.userData.toonBodyMaterial, mat);
  }
  return true;
}

/**
 * Live retune: writes new settings into converted materials without
 * rebuilding them. Per-material authored values (MToon, MMD ramps, userData)
 * are re-applied on top. Maps and features that change the graph (a new
 * texture, turning the automatic face map on) need a new conversion.
 */
export function applyToonSettingsToMaterial(target, settingsInput = {}) {
  const settings = createToonSettings(settingsInput);
  let updatedMaterialCount = 0;
  const update = (material) => {
    for (const mat of toMaterialArray(material)) {
      if (retuneMaterial(mat, settings)) updatedMaterialCount += 1;
    }
  };
  if (target?.isMaterial || Array.isArray(target)) update(target);
  else target?.traverse?.((obj) => {
    if (obj.isMesh && obj.material) update(obj.material);
  });
  return { settings, updatedMaterialCount };
}

/** Selects a debug view on every converted material under `root` (a uniform write). */
export function setToonDebugOutput(root, debugOutputMode = 'off') {
  const resolved = resolveToonDebugOutputMode(debugOutputMode);
  const visit = (obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const mat of toMaterialArray(obj.material)) {
      if (mat?.uniforms?.debugMode) mat.uniforms.debugMode.value = resolved.value;
    }
  };
  if (root?.isMesh) visit(root);
  else root?.traverse?.(visit);
  return resolved;
}

// Screen-door fade for a whole character (1 = opaque, 0 = gone). Works with
// cutouts, outlines and depth writes; no sorting needed.
export function setToonDitherOpacity(target, opacity = 1) {
  const value = Math.min(1, Math.max(0, Number.isFinite(Number(opacity)) ? Number(opacity) : 1));
  let updatedMaterialCount = 0;
  const update = (material) => {
    for (const mat of toMaterialArray(material)) {
      if (!mat?.uniforms?.ditherOpacity) continue;
      if (value < 0.999) mat.userData?.enableDither?.();
      mat.uniforms.ditherOpacity.value = value;
      updatedMaterialCount += 1;
    }
  };
  if (target?.isMaterial || Array.isArray(target)) update(target);
  else target?.traverse?.((obj) => {
    if (obj.isMesh && obj.material) update(obj.material);
  });
  return updatedMaterialCount;
}
