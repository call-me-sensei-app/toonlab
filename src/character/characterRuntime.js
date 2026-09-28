import * as THREE from 'three';

import {
  applyToonSettingsToMaterial,
  applyToonShader,
  findPrimarySkinnedMesh,
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '../toon/toonMaterialAdapter.js';
import {
  bakeSolidBaseColorTextures,
  fitModelForController,
  loadPackagedLocomotionClipsForTarget,
  prepareModelForRealtime,
  resolveNativeLocomotionClips,
} from './animationRetarget.js';
import { resolveCharacterRig } from './characterRig.js';
import { createFreestyleSwimClip } from './freestyleSwimClip.js';
import { createLocomotionActions, resetLocomotionActions } from './locomotionActions.js';
import { loadModelAsset } from './modelLoader.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';
import { PassBasicNodeMaterial } from '../shaders-tsl/chunks/pass-depth-color.js';
import { updateToonStorageSkinning } from '../shaders-tsl/chunks/character-skinning.js';

export const CHARACTER_RUNTIME_STAGE = Object.freeze({
  ANIMATION: 'animation',
  MODEL: 'model',
  READY: 'ready',
  STYLE: 'style',
  TEXTURES: 'textures',
});

export const DEFAULT_CHARACTER_ANIMATION_ROLES = Object.freeze([
  'idle',
  'walk',
  'run',
  'jump',
  'swim',
  'tread',
  'dive',
  'sit',
]);

function stage(callback, name, detail = {}) {
  return callback?.({ detail, stage: name });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function normalizeAnimationOptions(animation) {
  if (animation === false) return { enabled: false };
  const input = animation && typeof animation === 'object' ? animation : {};
  return {
    bodyModes: input.bodyModes ?? {},
    enabled: input.enabled !== false,
    fallbackSourceUrl: input.fallbackSourceUrl,
    freestyle: input.freestyle !== false,
    retargetMode: input.retargetMode ?? 'world',
    roles: Array.isArray(input.roles) && input.roles.length
      ? [...new Set(input.roles)]
      : [...DEFAULT_CHARACTER_ANIMATION_ROLES],
    rootMotion: Boolean(input.rootMotion),
  };
}

function keepRequestedRoles(roles, requested) {
  return Object.fromEntries(
    requested
      .filter((role) => roles?.[role])
      .map((role) => [role, roles[role]]),
  );
}

function clipFromResult(result) {
  return result?.clip ?? result ?? null;
}

function disposeLoadedRoot(root) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

function createNeutralCharacterMaterial(source) {
  const material = new PassBasicNodeMaterial();
  material.name = source?.name ?? '';
  material.color.copy(source?.color ?? new THREE.Color(0xffffff));
  material.map = source?.map ?? null;
  material.alphaMap = source?.alphaMap ?? null;
  material.alphaTest = source?.alphaTest ?? 0;
  material.blending = source?.blending ?? THREE.NormalBlending;
  material.depthTest = source?.depthTest !== false;
  material.depthWrite = source?.depthWrite !== false;
  material.opacity = source?.opacity ?? 1;
  material.side = source?.side ?? THREE.FrontSide;
  material.toneMapped = source?.toneMapped !== false;
  material.transparent = source?.transparent === true;
  material.visible = source?.visible !== false;
  material.userData = { ...(source?.userData ?? {}) };
  return material;
}

function prepareNeutralCharacterSource(root, renderer) {
  // WebGPURenderer's WebGL fallback maps classic skinned materials to a
  // uniform bone-matrix block. MMD-scale rigs exceed WebGL's guaranteed 16KB
  // UBO limit before a deferred style bundle can replace those materials.
  // A neutral NodeMaterial keeps the imported texture/color presentation but
  // uses ToonLab's shared storage/PBO skinning path. It is the exact prepared
  // pre-bundle state restored by the inspector.
  if (!renderer?.isWebGPURenderer) return 0;
  const replacements = new Map();
  root.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const replace = (source) => {
      if (!replacements.has(source)) replacements.set(source, createNeutralCharacterMaterial(source));
      return replacements.get(source);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(replace)
      : replace(object.material);
    if (object.isSkinnedMesh) {
      object.onBeforeRender = () => updateToonStorageSkinning(object);
    }
  });
  for (const source of replacements.keys()) source.dispose?.();
  return replacements.size;
}

export const CHARACTER_MATERIAL_MODES = Object.freeze({
  neutral: 'neutral',
  toon: 'toon',
});

function normalizeCharacterMaterialMode(mode) {
  return mode === CHARACTER_MATERIAL_MODES.neutral
    ? CHARACTER_MATERIAL_MODES.neutral
    : CHARACTER_MATERIAL_MODES.toon;
}

function isToonHelperMesh(object) {
  return object?.userData?.isToonOutline === true || object?.userData?.isToonFurShell === true;
}

function collectCharacterBodyMeshes(root) {
  const meshes = [];
  root.traverse((object) => {
    if (!object?.isMesh || !object.material || isToonHelperMesh(object)) return;
    meshes.push(object);
  });
  return meshes;
}

/**
 * Builds a second, neutral material set over an already-converted character so
 * a single load can present both looks.
 *
 * `prepareNeutralCharacterSource` mounts its neutral materials destructively and
 * disposes the imported ones, which is right for a one-look runtime and wrong for
 * a comparison: §11-style shader wipes must share one skeleton, one mixer and one
 * set of geometry buffers, so the two looks can only differ by which `mesh.material`
 * reference is bound at draw time. This builds the neutral set from the retained
 * imported materials without mounting or disposing anything, so both sets stay live
 * and swapping is a reference assignment rather than a rebuild.
 */
function createCharacterMaterialModeState({
  integration,
  originalsByMesh,
  renderer,
  root,
}) {
  const usesNodeMaterials = renderer?.isWebGPURenderer === true;
  const neutralReplacements = new Map();
  const neutralByMesh = new Map();
  const toonByMesh = new Map();
  const neutralBeforeRender = new Map();
  const toonBeforeRender = new Map();
  const helpers = [];

  root.traverse((object) => {
    if (isToonHelperMesh(object)) helpers.push(object);
  });

  for (const [mesh, originalMaterial] of originalsByMesh) {
    const replace = (source) => {
      if (!source) return source;
      if (!usesNodeMaterials) return source;
      if (!neutralReplacements.has(source)) {
        neutralReplacements.set(source, createNeutralCharacterMaterial(source));
      }
      return neutralReplacements.get(source);
    };
    neutralByMesh.set(mesh, Array.isArray(originalMaterial)
      ? originalMaterial.map(replace)
      : replace(originalMaterial));
    toonByMesh.set(mesh, mesh.material);
    toonBeforeRender.set(mesh, mesh.onBeforeRender);
    neutralBeforeRender.set(
      mesh,
      usesNodeMaterials && mesh.isSkinnedMesh
        ? () => updateToonStorageSkinning(mesh)
        : THREE.Object3D.prototype.onBeforeRender,
    );
  }

  let mode = CHARACTER_MATERIAL_MODES.toon;

  return {
    disposeNeutral() {
      for (const material of neutralReplacements.values()) material.dispose?.();
      neutralReplacements.clear();
    },
    get mode() {
      return mode;
    },
    neutralMaterialCount: usesNodeMaterials ? neutralReplacements.size : originalsByMesh.size,
    set(nextMode) {
      const resolved = normalizeCharacterMaterialMode(nextMode);
      if (resolved === mode) return mode;
      const neutral = resolved === CHARACTER_MATERIAL_MODES.neutral;
      const source = neutral ? neutralByMesh : toonByMesh;
      const beforeRender = neutral ? neutralBeforeRender : toonBeforeRender;
      for (const [mesh, material] of source) {
        mesh.material = material;
        mesh.onBeforeRender = beforeRender.get(mesh);
      }
      // Outline and fur shells are separate child meshes, never removed — the
      // toon look owns them and the neutral look must not draw them.
      for (const helper of helpers) helper.visible = !neutral;
      mode = resolved;
      // The depth prepass and self-shadow target bind concrete materials; they
      // must follow the swap or the neutral half shades against toon buffers.
      integration?.refresh?.();
      return mode;
    },
    usesNodeMaterials,
  };
}

function attachCharacterStyleMetadata(carrier, {
  managed,
  styleTarget,
} = {}) {
  const assignments = {};
  const seen = new Set();
  let materialIndex = 0;
  carrier.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      const materialId = `CharacterMaterial${String(materialIndex).padStart(3, '0')}`;
      materialIndex += 1;
      markFactoryStyleMaterial(material, materialId, { managed });
      assignments[materialId] = {
        roles: [typeof material.userData?.materialRole === 'string'
          ? material.userData.materialRole
          : 'default'],
      };
    }
  });
  attachFactoryStyleTarget(carrier, 'character', {
    targetId: 'toonlab/character',
    ...styleTarget,
    ...(Object.keys(assignments).length ? {
      materials: {
        assignments,
        ...(styleTarget.materials ?? {}),
      },
    } : {}),
  });
}

/**
 * Loads and prepares one complete, foot-origin character runtime.
 *
 * The runtime owns the model asset, toon conversion, humanoid rig resolution,
 * native-or-packaged locomotion, mixer updates, VRM updates, and disposal.
 * Hosts keep ownership of input, physics, ground sampling, and camera behavior.
 */
export async function createCharacterRuntime({
  animation = true,
  carrier = null,
  materialModes = false,
  materialUrl = null,
  name = 'ToonLab Character',
  onStage = null,
  parent = null,
  renderer = null,
  renderPasses = null,
  signal = null,
  styleTarget = {},
  targetHeight = 1.7,
  toon = { preset: 'call_me_sensei' },
  url,
} = {}) {
  if (!url || typeof url !== 'string') {
    throw new TypeError('createCharacterRuntime requires a model url.');
  }

  const animationOptions = normalizeAnimationOptions(animation);
  const ownsCarrier = carrier == null;
  const characterCarrier = carrier ?? new THREE.Group();
  characterCarrier.name ||= name;
  let attached = false;

  await stage(onStage, CHARACTER_RUNTIME_STAGE.MODEL, { url });
  const asset = await loadModelAsset(url, { materialUrl, renderer });
  throwIfAborted(signal);

  try {
    await stage(onStage, CHARACTER_RUNTIME_STAGE.TEXTURES, { asset, url });
    await waitForObjectTextures(asset.root);
    throwIfAborted(signal);
    setObjectTextureColorSpaces(asset.root);

    const bounds = Number.isFinite(targetHeight) && targetHeight > 0
      ? fitModelForController(asset.root, targetHeight)
      : null;
    bakeSolidBaseColorTextures(asset.root);

    await stage(onStage, CHARACTER_RUNTIME_STAGE.STYLE, { asset, bounds, url });
    // A dual-mode runtime keeps the imported materials alive so the neutral set
    // can be rebuilt from them after conversion; the single-mode path stays
    // exactly as before, including the destructive neutral swap.
    const wantsMaterialModes = materialModes === true && toon !== false;
    const originalsByMesh = wantsMaterialModes
      ? new Map(collectCharacterBodyMeshes(asset.root).map((mesh) => [mesh, mesh.material]))
      : null;
    const neutralSourceMaterialCount = toon === false
      ? prepareNeutralCharacterSource(asset.root, renderer)
      : 0;
    const toonState = toon === false ? null : applyToonShader(asset.root, toon ?? {});
    prepareModelForRealtime(asset.root);

    const targetMesh = toonState?.primarySkinnedMesh ?? findPrimarySkinnedMesh(asset.root);
    const rig = targetMesh ? resolveCharacterRig(targetMesh, { vrm: asset.vrm }) : null;
    let clipRoles = {};
    let animationSource = 'none';

    if (animationOptions.enabled) {
      await stage(onStage, CHARACTER_RUNTIME_STAGE.ANIMATION, { asset, rig, targetMesh, url });
      const nativeRoles = resolveNativeLocomotionClips(asset.clips) ?? {};
      clipRoles = keepRequestedRoles(nativeRoles, animationOptions.roles);
      animationSource = Object.keys(clipRoles).length ? 'native' : 'none';

      const missingRoles = animationOptions.roles.filter((role) => !clipRoles[role]);
      if (missingRoles.length && targetMesh && rig) {
        const packaged = await loadPackagedLocomotionClipsForTarget(targetMesh, rig, {
          bodyModes: animationOptions.bodyModes,
          retargetMode: animationOptions.retargetMode,
          rootMotion: animationOptions.rootMotion,
          sourceUrl: animationOptions.fallbackSourceUrl,
          // This runtime owns one mixer rooted at the imported model scene,
          // so packaged clips must bind named bone nodes just like native
          // glTF clips. The lower-level loader keeps its skeleton-rooted
          // default for callers that mix directly on a SkinnedMesh.
          trackNameStyle: 'node',
        });
        throwIfAborted(signal);
        for (const role of missingRoles) {
          const clip = clipFromResult(packaged[role]);
          if (clip) clipRoles[role] = clip;
        }
        if (missingRoles.some((role) => clipRoles[role])) {
          animationSource = animationSource === 'native' ? 'native+toonlab' : 'toonlab';
        }
      }

      if (animationOptions.freestyle && targetMesh && rig) {
        try {
          clipRoles.freestyle = createFreestyleSwimClip(targetMesh, rig, {
            trackNameStyle: 'node',
          });
        } catch {
          // Freestyle is an optional enhancement; the normal swim role remains usable.
        }
      }
    }

    throwIfAborted(signal);
    characterCarrier.add(asset.root);
    attachCharacterStyleMetadata(characterCarrier, {
      // `toon: false` defers the final character look to a later style-bundle
      // application. On WebGPU we still replace imported materials with
      // PassBasicNodeMaterial so large skinned rigs use ToonLab's storage/PBO
      // skinning path. That neutral bridge is package-owned and therefore an
      // approved managed renderer, even though the final toon style has not
      // been applied yet. Marking it unmanaged makes strict bundle preflight
      // reject ToonLab's own CharacterMaterial slots as unsupported custom
      // renderers.
      managed: toon !== false || neutralSourceMaterialCount > 0,
      styleTarget,
    });
    parent?.add(characterCarrier);
    attached = true;
    renderPasses?.registerCharacterRoot?.(asset.root);
    const characterStyleIntegration = {
      refresh() {
        // Deferred bundle application can replace every character material
        // after the runtime first registered the imported root. Re-register
        // the same root so WebGL fallback storage skinning and package depth
        // passes bind the live ToonLab materials; exact inspector restore uses
        // the same hook to return to the imported-material path.
        renderPasses?.unregisterCharacterRoot?.(asset.root);
        renderPasses?.registerCharacterRoot?.(asset.root);
      },
    };
    characterCarrier.userData.toonlabCharacterStyleIntegration = characterStyleIntegration;

    const materialModeState = originalsByMesh
      ? createCharacterMaterialModeState({
        integration: characterStyleIntegration,
        originalsByMesh,
        renderer,
        root: asset.root,
      })
      : null;

    const mixer = Object.keys(clipRoles).length
      ? new THREE.AnimationMixer(asset.root)
      : null;
    const actions = mixer
      ? createLocomotionActions({ mixer, roles: clipRoles })
      : null;
    let animationEnabled = Boolean(mixer && actions);
    let disposed = false;

    const runtime = {
      actions,
      animationSource,
      asset,
      bounds,
      carrier: characterCarrier,
      clips: clipRoles,
      format: asset.format,
      mixer,
      modelRoot: asset.root,
      rig,
      targetMesh,
      toonState,
      neutralSourceMaterialCount: materialModeState
        ? materialModeState.neutralMaterialCount
        : neutralSourceMaterialCount,
      url,

      /**
       * `'neutral' | 'toon'` when the runtime was created with
       * `materialModes: true`, otherwise `null`. Reading it is cheap; it is the
       * authoritative record of which material set is currently bound.
       */
      get materialMode() {
        return materialModeState?.mode ?? null;
      },

      /**
       * Binds one of the two material sets over the same meshes, skeleton and
       * mixer. Returns the resolved mode, or `null` on a single-mode runtime.
       *
       * Cheap enough to call between two `renderer.render` calls in one frame,
       * which is what a §11-style scissor wipe needs.
       */
      setMaterialMode(mode) {
        if (disposed || !materialModeState) return null;
        return materialModeState.set(mode);
      },

      applyToonSettings(settings) {
        if (disposed || !toonState) return null;
        return applyToonSettingsToMaterial(asset.root, settings);
      },

      dispose({ disposeResources = true } = {}) {
        if (disposed) return;
        // Rebind the toon set so the unmounted half is the one this method
        // disposes explicitly and `disposeLoadedRoot` still sees a complete
        // mounted material set.
        materialModeState?.set(CHARACTER_MATERIAL_MODES.toon);
        if (disposeResources && materialModeState) {
          // The neutral bridge materials, then the imported ones they were built
          // from. When the renderer needs no bridge the two are the same objects
          // and the second pass is a no-op re-dispose.
          materialModeState.disposeNeutral();
          for (const material of originalsByMesh.values()) {
            for (const entry of Array.isArray(material) ? material : [material]) entry?.dispose?.();
          }
        }
        disposed = true;
        mixer?.stopAllAction();
        mixer?.uncacheRoot(asset.root);
        renderPasses?.unregisterCharacterRoot?.(asset.root);
        if (characterCarrier.userData.toonlabCharacterStyleIntegration === characterStyleIntegration) {
          delete characterCarrier.userData.toonlabCharacterStyleIntegration;
        }
        characterCarrier.remove(asset.root);
        if (ownsCarrier) characterCarrier.parent?.remove(characterCarrier);
        if (disposeResources) disposeLoadedRoot(asset.root);
      },

      setAnimationEnabled(enabled) {
        animationEnabled = Boolean(enabled && mixer && actions);
        if (!animationEnabled) {
          mixer?.stopAllAction();
          asset.root.traverse((object) => {
            if (object.isSkinnedMesh) object.skeleton?.pose();
          });
        } else {
          resetLocomotionActions(actions);
          for (const [role, action] of Object.entries(actions ?? {})) {
            if (role !== 'clips' && role !== 'jump') action?.play?.();
          }
        }
        return animationEnabled;
      },

      update(delta) {
        if (disposed) return;
        const frameDelta = Math.min(Math.max(Number(delta) || 0, 0), 0.1);
        if (animationEnabled) mixer?.update(frameDelta);
        asset.vrm?.update?.(frameDelta);
      },
    };

    await stage(onStage, CHARACTER_RUNTIME_STAGE.READY, { runtime, url });
    return runtime;
  } catch (error) {
    if (attached) {
      characterCarrier.remove(asset.root);
      if (ownsCarrier) characterCarrier.parent?.remove(characterCarrier);
    }
    disposeLoadedRoot(asset.root);
    throw error;
  }
}
