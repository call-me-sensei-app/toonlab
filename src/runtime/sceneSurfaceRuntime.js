import * as THREE from 'three';

import { createCallMeSenseiGrassField } from '../vegetation/callMeSenseiGrass.js';
import {
  combineMasks,
  scatterInRect,
} from '../vegetation/scatter.js';
import { WaterSurface } from '../water/waterSurface.js';

const SOURCE_TEXTURE_KEYS = Object.freeze([
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
]);

const SOURCE_TEXTURE_UNIFORM_KEYS = Object.freeze([
  'base',
  'baseMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
]);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function normalizeBounds(bounds = {}) {
  const min = bounds.min ?? bounds;
  const max = bounds.max ?? bounds;
  const normalized = Object.freeze({
    maxX: finite(max.x ?? bounds.maxX, 'bounds.max.x'),
    maxZ: finite(max.z ?? bounds.maxZ, 'bounds.max.z'),
    minX: finite(min.x ?? bounds.minX, 'bounds.min.x'),
    minZ: finite(min.z ?? bounds.minZ, 'bounds.min.z'),
  });
  if (normalized.maxX <= normalized.minX || normalized.maxZ <= normalized.minZ) {
    throw new RangeError('Scene surface bounds must have positive width and depth.');
  }
  return normalized;
}

function collectSourceTextureIds(root) {
  const textureIds = new Set();
  const addTexture = (texture) => {
    if (texture?.isTexture && texture.uuid) textureIds.add(texture.uuid);
  };
  root?.traverse?.((object) => {
    if (!object?.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const key of SOURCE_TEXTURE_KEYS) addTexture(material?.[key]);
      for (const key of SOURCE_TEXTURE_UNIFORM_KEYS) {
        addTexture(material?.uniforms?.[key]?.value);
      }
      for (const textureId of material?.userData?.toonlabSourceTextureIds ?? []) {
        if (typeof textureId === 'string' && textureId) textureIds.add(textureId);
      }
    }
  });
  return textureIds;
}

function issue(code, message, details = {}) {
  return Object.freeze({ code, message, severity: 'error', ...details });
}

/**
 * One strict world-space surface contract shared by terrain-bound objects,
 * grass, shoreline water, character spawn, and review validation.
 *
 * The host still authors the terrain shape. ToonLab owns all derived y values
 * and refuses non-finite samples instead of silently placing content at y=0.
 */
export function createSceneSurfaceRuntime({
  bounds,
  heightAt,
  waterLevel = 0,
} = {}) {
  if (typeof heightAt !== 'function') {
    throw new TypeError('createSceneSurfaceRuntime requires heightAt(x, z).');
  }
  const region = normalizeBounds(bounds);
  const resolvedWaterLevel = finite(waterLevel, 'waterLevel');
  const objectRecords = [];
  const grassRecords = [];
  const waterRecords = [];

  function sampleHeight(xInput, zInput) {
    const x = finite(xInput, 'x');
    const z = finite(zInput, 'z');
    const y = Number(heightAt(x, z));
    if (!Number.isFinite(y)) {
      throw new Error(`Scene surface returned a non-finite height at (${x}, ${z}).`);
    }
    return y;
  }

  function contains(x, z) {
    return x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ;
  }

  function waterBodyAt(x, z) {
    return waterRecords.find(({ footprint }) => (
      x >= footprint.minX && x <= footprint.maxX
      && z >= footprint.minZ && z <= footprint.maxZ
    )) ?? null;
  }

  function createRegisteredWaterMask(margin) {
    const lift = Math.max(finite(margin, 'waterMargin'), 0);
    return (x, z) => {
      const record = waterBodyAt(x, z);
      if (!record) return true;
      return sampleHeight(x, z) > record.y + lift;
    };
  }

  function groundPlacements(placements = [], { offset = 0 } = {}) {
    const lift = finite(offset, 'placement offset');
    return placements.map((placement, index) => {
      const x = finite(placement?.x, `placements[${index}].x`);
      const z = finite(placement?.z, `placements[${index}].z`);
      if (!contains(x, z)) {
        throw new RangeError(`Placement ${index} is outside the declared scene surface bounds.`);
      }
      return { ...placement, x, y: sampleHeight(x, z) + lift, z };
    });
  }

  async function createGrassField({
    count,
    density = 1.85,
    excludeWater = true,
    mask = null,
    max = { x: region.maxX, z: region.maxZ },
    min = { x: region.minX, z: region.minZ },
    minSpacing = 0,
    offset = 0,
    placements = null,
    seed = 1,
    waterMargin = 0.12,
    ...options
  } = {}) {
    const sourcePlacements = Array.isArray(placements)
      ? placements
      : scatterInRect({
        count: Number.isFinite(Number(count))
          ? Math.max(Math.trunc(Number(count)), 0)
          : Math.max(Math.round(
            Math.max(Number(max.x) - Number(min.x), 0)
              * Math.max(Number(max.z) - Number(min.z), 0)
              * Math.max(Number(density) || 0, 0),
          ), 0),
        heightAt: sampleHeight,
        mask: combineMasks(
          mask,
          excludeWater ? createRegisteredWaterMask(waterMargin) : null,
        ),
        max,
        min,
        minSpacing,
        seed,
      });
    const grounded = groundPlacements(sourcePlacements, { offset });
    const field = await createCallMeSenseiGrassField({
      ...options,
      placements: grounded,
      seed,
    });
    grassRecords.push({
      field,
      offset: finite(offset, 'placement offset'),
      waterMargin: Math.max(finite(waterMargin, 'waterMargin'), 0),
    });
    return field;
  }

  function createWaterSurface({
    position = {},
    shoreState = true,
    nearshorePhase = true,
    ...options
  } = {}) {
    const width = finite(options.width ?? 10, 'water.width');
    const depth = finite(options.depth ?? 10, 'water.depth');
    if (width <= 0 || depth <= 0) {
      throw new RangeError('Water width and depth must be positive.');
    }
    const water = new WaterSurface({
      ...options,
      depth,
      bedHeight: sampleHeight,
      nearshorePhase,
      shoreState,
      width,
    });
    const x = finite(position.x ?? 0, 'water.position.x');
    const z = finite(position.z ?? 0, 'water.position.z');
    const y = resolvedWaterLevel + finite(position.offset ?? 0, 'water.position.offset');
    water.position.set(x, y, z);
    waterRecords.push({
      footprint: Object.freeze({
        maxX: x + width * 0.5,
        maxZ: z + depth * 0.5,
        minX: x - width * 0.5,
        minZ: z - depth * 0.5,
      }),
      water,
      y,
    });
    return water;
  }

  function place(object, {
    anchor = 'origin',
    offset = 0,
    preserveTextures = true,
    x,
    z,
  } = {}) {
    if (!object?.isObject3D) throw new TypeError('place() requires a Three.js Object3D.');
    if (!['bounds', 'origin'].includes(anchor)) {
      throw new TypeError('place() anchor must be "origin" or "bounds".');
    }
    const worldX = finite(x, 'placement x');
    const worldZ = finite(z, 'placement z');
    if (!contains(worldX, worldZ)) {
      throw new RangeError('Object placement is outside the declared scene surface bounds.');
    }
    const targetY = sampleHeight(worldX, worldZ) + finite(offset, 'placement offset');
    object.position.x = worldX;
    object.position.z = worldZ;
    if (anchor === 'origin') {
      object.position.y = targetY;
    } else {
      object.position.y = 0;
      object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) throw new Error('Cannot bounds-ground an Object3D without renderable geometry.');
      object.position.y += targetY - box.min.y;
    }
    object.updateWorldMatrix(true, true);
    objectRecords.push({
      anchor,
      object,
      preserveTextures: Boolean(preserveTextures),
      sourceTextureIds: collectSourceTextureIds(object),
      targetY,
      x: worldX,
      z: worldZ,
    });
    return object;
  }

  function audit({
    camera = null,
    requireShadowDomains = [],
    styleRuntime = null,
    requireVisibleSky = Boolean(styleRuntime?.sky),
    tolerance = 0.035,
  } = {}) {
    const epsilon = Math.max(Number(tolerance) || 0, 0);
    const issues = [];
    let placementCount = 0;

    for (const { field, offset, waterMargin } of grassRecords) {
      for (const [index, placement] of field.placements.entries()) {
        placementCount += 1;
        const expected = sampleHeight(placement.x, placement.z) + offset;
        if (Math.abs(Number(placement.y) - expected) > epsilon) {
          issues.push(issue(
            'grass-off-surface',
            `Grass placement ${index} is ${Math.abs(Number(placement.y) - expected).toFixed(3)}m off the terrain surface.`,
          ));
          break;
        }
        const waterRecord = waterBodyAt(placement.x, placement.z);
        if (waterRecord && expected <= waterRecord.y + waterMargin) {
          issues.push(issue(
            'grass-in-water-footprint',
            `Grass placement ${index} occupies submerged terrain inside a registered water body.`,
          ));
          break;
        }
      }
    }

    for (const record of objectRecords) {
      record.object.updateWorldMatrix(true, true);
      const actual = record.anchor === 'origin'
        ? record.object.getWorldPosition(new THREE.Vector3()).y
        : new THREE.Box3().setFromObject(record.object).min.y;
      if (Math.abs(actual - record.targetY) > epsilon) {
        issues.push(issue(
          'object-off-surface',
          `Object "${record.object.name || record.object.uuid}" is not grounded to the shared scene surface.`,
        ));
      }
      if (record.preserveTextures && record.sourceTextureIds.size > 0) {
        const currentTextureIds = collectSourceTextureIds(record.object);
        const missingTextureIds = [...record.sourceTextureIds]
          .filter((textureId) => !currentTextureIds.has(textureId));
        if (missingTextureIds.length > 0) {
          issues.push(issue(
            'source-texture-lost',
            `Object "${record.object.name || record.object.uuid}" lost source texture inputs during styling.`,
            { missingTextureIds: Object.freeze(missingTextureIds) },
          ));
        }
      }
    }

    for (const { water, y } of waterRecords) {
      if (Math.abs(water.position.y - y) > epsilon) {
        issues.push(issue('water-level-mismatch', 'Water no longer matches the shared scene water level.'));
      }
      if (water.bedHeightSampler !== sampleHeight) {
        issues.push(issue('water-bed-disconnected', 'Water is not sampling the shared terrain bed.'));
      }
      if (!water.nearshorePhaseEnabled) {
        issues.push(issue('water-nearshore-disabled', 'Terrain-bound water must enable the nearshore phase.'));
      }
      if (!water.shoreState) {
        issues.push(issue('water-shore-state-missing', 'Terrain-bound water must own a persistent shore-state field.'));
      }
      if (!water.volumeSkirt) {
        issues.push(issue('water-volume-missing', 'Finite terrain-bound water must include a visible side volume.'));
      }
    }

    if (camera) {
      const x = Number(camera.position?.x);
      const z = Number(camera.position?.z);
      const ground = Number.isFinite(x) && Number.isFinite(z) && contains(x, z)
        ? sampleHeight(x, z)
        : null;
      if (!contains(x, z) || ground === null || Number(camera.position?.y) <= ground + 0.1) {
        issues.push(issue('camera-outside-review-surface', 'The review camera must start above and inside the declared scene surface.'));
      }
      if (requireVisibleSky && camera.isPerspectiveCamera) {
        camera.updateMatrixWorld?.();
        const forward = camera.getWorldDirection(new THREE.Vector3());
        const world = camera.matrixWorld.elements;
        const verticalReach = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        const topRayY = forward.y + world[5] * verticalReach;
        if (topRayY <= 0.02) {
          issues.push(issue(
            'sky-outside-review-frustum',
            'The styled sky is outside the default review framing; tilt the camera high enough to include sky above the horizon or explicitly disable this review requirement.',
          ));
        }
      }
    }

    const groundFieldPass = styleRuntime?.groundFieldPass;
    if (grassRecords.length > 0 && styleRuntime
      && groundFieldPass?.colorSemantics !== 'visible-ground-color') {
      issues.push(issue(
        'ground-field-visible-color-missing',
        'Grass adoption requires a ready ground field that publishes the visible lit and shadowed ground color.',
      ));
    }

    const shadowPass = styleRuntime?.shadowPass;
    const coverage = shadowPass?.casterCoverage;
    const requiredReceiverDomains = requireShadowDomains.length > 0
      ? ['terrain.ground']
      : [];
    if (requireShadowDomains.length > 0 && (
      shadowPass?.ready !== true
      || Number(shadowPass?.renderCount) < 1
      || !shadowPass?.shadowTexture
    )) {
      issues.push(issue(
        'shadow-pass-not-rendered',
        'The shared shadow pass has not produced a ready shadow texture.',
      ));
    }
    for (const domain of requireShadowDomains) {
      const domainCoverage = coverage?.byDomain?.[domain];
      const eligible = domainCoverage?.eligibleTargetIds?.length ?? 0;
      const covered = domainCoverage?.coveredTargetIds?.length ?? 0;
      if (eligible === 0 || covered !== eligible) {
        issues.push(issue(
          'incomplete-shadow-coverage',
          `Shadow domain "${domain}" covers ${covered}/${eligible} eligible labeled targets.`,
          { domain },
        ));
      }
    }
    const receiverCoverage = shadowPass?.receiverCoverage;
    for (const domain of requiredReceiverDomains) {
      const domainCoverage = receiverCoverage?.byDomain?.[domain];
      const eligible = domainCoverage?.eligibleTargetIds?.length ?? 0;
      const covered = domainCoverage?.coveredTargetIds?.length ?? 0;
      if (eligible === 0 || covered !== eligible) {
        issues.push(issue(
          'incomplete-shadow-receiver-coverage',
          `Shadow receiver domain "${domain}" covers ${covered}/${eligible} eligible labeled targets.`,
          { domain },
        ));
      }
    }

    return Object.freeze({
      issues: Object.freeze(issues),
      ok: issues.length === 0,
      stats: Object.freeze({
        grassFields: grassRecords.length,
        objectPlacements: objectRecords.length,
        placements: placementCount,
        waterBodies: waterRecords.length,
      }),
    });
  }

  function assertReady(options = {}) {
    const report = audit(options);
    if (!report.ok) {
      throw new AggregateError(
        report.issues.map(({ message }) => new Error(message)),
        'ToonLab scene surface readiness failed.',
      );
    }
    return report;
  }

  return Object.freeze({
    assertReady,
    audit,
    bounds: region,
    contains,
    createGrassField,
    createWaterSurface,
    groundPlacements,
    heightAt: sampleHeight,
    place,
    waterBodyAt,
    waterLevel: resolvedWaterLevel,
  });
}
