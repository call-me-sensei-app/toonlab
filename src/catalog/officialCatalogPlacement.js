import { Box3, Euler, Group, Vector3 } from 'three';

import {
  createCollisionMetadata,
  LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  registerCollisionTarget,
  validateCollisionMetadata,
} from '../collisionMetadata.js';
import { applyRockShader } from '../rock-shader/rockShaderRuntime.js';
import { withoutDegenerateDetailMaps } from '../rock-shader/rockTextureIntegrity.js';
import {
  applyStyleBundle,
} from '../styles/styleApplication.js';
import { createStyleTarget } from '../styles/styleAdapters.js';
import {
  createStyleTargetLabel,
} from '../styles/styleTargetLabels.js';
import { labelStyleTarget } from '../styles/styleTargetDiscovery.js';
import {
  resolveCatalogQualityOptions,
  resolveSceneQualityProfile,
} from '../styles/sceneQualityProfiles.js';
import { createDenseFieldRockLodRuntime } from '../rockgen/lod/rockDenseFieldPolicy.js';
import { collectCatalogLodBindings, createCatalogLodRuntime } from './officialCatalogLod.js';

function vector3(value, fallback = [0, 0, 0]) {
  if (Array.isArray(value)) {
    return [
      Number(value[0]) || fallback[0],
      Number(value[1]) || fallback[1],
      Number(value[2]) || fallback[2],
    ];
  }
  const number = Number(value);
  return Number.isFinite(number) ? [number, number, number] : [...fallback];
}

function rotation3(value) {
  if (Array.isArray(value)) return vector3(value);
  return [0, Number(value) || 0, 0];
}

function mergeSettings(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const output = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeSettings(output[key], value)
      : value;
  }
  return output;
}

/**
 * Validates caller-supplied style textures without reclassifying the asset's
 * own UV-space maps as triplanar detail maps. applyRockShader reads the full
 * original material directly (albedo, metallic/roughness, normal, occlusion,
 * specular, and emissive); harvesting its normal into `rockNormal` would apply
 * that same map twice and with the wrong coordinate system.
 */
function catalogRockTextures(overrides = {}) {
  const usable = withoutDegenerateDetailMaps(overrides);
  return {
    rejected: usable.rejected,
    textures: usable.textures,
  };
}

function styleAdapterFor(asset, root, { settings: assetSettings, textures: overrides, variation }) {
  if (asset.domain !== 'natural.rock') return null;
  const resolved = catalogRockTextures(overrides);
  const report = { rejectedTextures: resolved.rejected };
  return Object.freeze({
    apply(subject, settings) {
      const result = applyRockShader(subject, mergeSettings(settings, assetSettings), {
        name: `ToonLab · ${asset.label}`,
        textures: resolved.textures,
        variation,
      });
      report.rejectedTextures = [...resolved.rejected, ...(result.rejectedTextures ?? [])];
      return result;
    },
    id: 'toonlab-official-catalog-rock',
    report,
  });
}

function collisionMetadataFor(asset, collision, adapter) {
  if (collision === false || collision === 'none') return createCollisionMetadata('none');
  if (collision && typeof collision === 'object') {
    const validation = validateCollisionMetadata(collision);
    if (!validation.ok) throw new TypeError(validation.errors.join(' '));
    return validation.value;
  }
  if (collision !== 'auto' && collision !== true) {
    throw new TypeError('Catalog collision must be "auto", "none", true, false, or collision metadata.');
  }
  if (asset.collision) return asset.collision;
  if (adapter?.kinds?.includes('trimesh')) {
    return createCollisionMetadata('trimesh', { source: 'render-mesh' });
  }
  return createCollisionMetadata('bounds', { padding: 0 });
}

function normalizeAssetRoot(root) {
  const bounds = new Box3().setFromObject(root, true);
  if (bounds.isEmpty()) return Object.freeze({ center: [0, 0, 0], grounded: false });
  const center = bounds.getCenter(new Vector3());
  root.position.set(-center.x, -bounds.min.y, -center.z);
  root.updateWorldMatrix(true, true);
  return Object.freeze({ center: center.toArray(), grounded: true });
}

export function resolveCatalogLodDistancesForQuality(quality, fallback = [0, 45, 120]) {
  if (quality === null || quality === undefined) return [...fallback];
  return resolveCatalogQualityOptions(quality).lodDistances;
}

/**
 * One-call official catalog placement: acquire, normalize, label, style, LOD,
 * shadows, and collision. Layout remains consumer-owned through transform.
 */
export async function loadOfficialCatalogAsset({
  assetId,
  assetRuntime,
  collision = 'auto',
  collisionAdapter = LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  collisionWorld = null,
  inspector = null,
  maxLodLevel = Number.POSITIVE_INFINITY,
  parent = null,
  position = [0, 0, 0],
  quality = 'balanced',
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  styleBundle,
  targetId = null,
  textures = {},
  usePublishedRockSurface = true,
  variation = 0,
} = {}) {
  if (!assetRuntime?.acquireAsset) {
    throw new TypeError('loadOfficialCatalogAsset requires an official catalog asset runtime.');
  }
  if (!styleBundle) throw new TypeError('loadOfficialCatalogAsset requires a style bundle.');
  const handle = await assetRuntime.acquireAsset(assetId);
  const asset = handle.asset;
  const id = targetId ?? `official-catalog/${asset.id}`;
  const root = handle.root;
  const container = new Group();
  container.name = `${asset.id}:${asset.label}`;
  const [px, py, pz] = vector3(position);
  const [rx, ry, rz] = rotation3(rotation);
  const [sx, sy, sz] = vector3(scale, [1, 1, 1]);
  container.position.set(px, py, pz);
  container.rotation.copy(new Euler(rx, ry, rz));
  container.scale.set(sx, sy, sz);
  container.add(root);
  const normalization = normalizeAssetRoot(root);
  const qualityProfile = quality === null ? null : resolveSceneQualityProfile(quality);
  container.updateWorldMatrix(true, true);

  let metadata;
  let adapter = null;
  let style = null;
  let lod = null;
  let collisionRegistration = null;
  let inspectorRegistration = null;
  let publishedRockSurface = null;
  try {
    metadata = collisionMetadataFor(asset, collision, collisionAdapter);
    labelStyleTarget(root, createStyleTargetLabel(asset.domain, {
      assetId: asset.id,
      collision: metadata,
      targetId: id,
    }));
    if (usePublishedRockSurface
      && asset.domain === 'natural.rock'
      && typeof assetRuntime.getRockShaderInput === 'function') {
      publishedRockSurface = await assetRuntime.getRockShaderInput(asset);
    }
    adapter = styleAdapterFor(asset, root, {
      settings: publishedRockSurface?.settings,
      textures: { ...(publishedRockSurface?.textures ?? {}), ...textures },
      variation,
    });
    style = await applyStyleBundle(styleBundle, {
      targets: [createStyleTarget(id, asset.domain, root, { adapter })],
    });
    const authoredLodLevels = [...new Set(
      collectCatalogLodBindings(root).map(({ level }) => level),
    )];
    const usesDenseFieldRockLods = asset.domain === 'natural.rock'
      && authoredLodLevels.includes(4);
    lod = usesDenseFieldRockLods
      ? createDenseFieldRockLodRuntime(root, { maxLevel: maxLodLevel })
      : createCatalogLodRuntime(root, {
        distances: resolveCatalogLodDistancesForQuality(
          qualityProfile,
          asset.lod?.distances,
        ),
        maxLevel: maxLodLevel,
      });
    if (metadata.kind !== 'none') {
      collisionRegistration = await registerCollisionTarget({
        adapter: collisionAdapter,
        collision: collisionWorld,
        metadata,
        subject: container,
        targetId: id,
      });
    }
    if (inspector) {
      inspectorRegistration = inspector.registerApplication(style, {
        participation: {
          [id]: {
            collision: {
              enabled: metadata.kind !== 'none',
              kind: metadata.kind,
            },
            lod: {
              availableLevels: lod.availableLevels,
              enabled: true,
              cullBelowPixels: lod.cullBelowPixels,
              pixelThresholds: lod.pixelThresholds,
              thresholds: lod.thresholds,
            },
          },
        },
      });
    }
  } catch (error) {
    inspectorRegistration?.();
    lod?.dispose();
    await style?.revert();
    handle.release();
    throw error;
  }
  if (parent?.add) parent.add(container);
  handle.addCleanup(() => {
    inspectorRegistration?.();
    collisionRegistration?.dispose?.();
    lod.dispose();
    container.removeFromParent();
  });

  let released = false;
  return Object.freeze({
    asset,
    collision: collisionRegistration,
    container,
    handle,
    lod,
    normalization,
    object: root,
    publishedRockSurface,
    quality: qualityProfile,
    /** Detail maps the artifact shipped that were too small to be usable. */
    get rejectedTextures() { return adapter?.report?.rejectedTextures ?? []; },
    async release() {
      if (released) return false;
      released = true;
      inspectorRegistration?.();
      collisionRegistration?.dispose?.();
      lod.dispose();
      await style.revert();
      container.removeFromParent();
      handle.release();
      return true;
    },
    get released() { return released; },
    style,
    targetId: id,
    updateLod(options = {}) {
      if (!lod.pixelThresholds || options.projectedPixels !== undefined) return lod.update(options);
      return lod.update({
        ...options,
        viewportHeight: options.viewportHeight
          ?? (typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 1080),
      });
    },
  });
}
