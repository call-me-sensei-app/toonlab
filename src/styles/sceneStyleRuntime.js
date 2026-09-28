import { PCFSoftShadowMap } from 'three';
import { createLightingSystem } from '../lighting/lightingSystem.js';
import { createEnvironmentGroundFieldPass } from '../environment/environmentGroundFieldPass.js';
import { createEnvironmentSunShadowPass } from '../environment/environmentSunShadowPass.js';
import { configureToonLabRenderer } from '../renderer/rendererConfiguration.js';
import { createSceneUpdateScheduler } from '../runtime/sceneUpdateScheduler.js';
import {
  createSceneCollisionRuntime,
  sceneCollisionRuntimeFor,
} from '../runtime/sceneCollisionRuntime.js';
import { LIGHTWEIGHT_WORLD_COLLISION_ADAPTER } from '../collisionMetadata.js';
import { createSkyParams } from '../sky/skyParams.js';
import { environmentCloudShadow } from '../sky/cloudShadow.js';
import { PRESETS as SKY_PRESETS } from '../sky/skyPresets.js';
import { resolveSkySystemStyleSnapshot } from '../sky/skyStyleSnapshots.js';
import {
  azimuthOf,
  elevationOf,
  sunDirectionAt,
} from '../sky/sunDriver.js';
import { applyStyleBundle } from './styleApplication.js';
import { applySceneQualityProfile } from './sceneQualityApplication.js';
import { createStyleTarget } from './styleAdapters.js';
import { createToonLabInspector } from './styleInspector.js';
import { resolveSceneQualityProfile } from './sceneQualityProfiles.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  getFirstPartyStyleBundle,
  resolveStyleBundleSettings,
  validateStyleBundleDocument,
} from './styleBundle.js';
import {
  collectStyleTargets,
  StyleTargetDiscoveryError,
} from './styleTargetDiscovery.js';

function resolveBundle(input) {
  if (typeof input === 'string') {
    const builtIn = getFirstPartyStyleBundle(input);
    if (!builtIn) throw new Error(`Unknown first-party style bundle "${input}".`);
    return builtIn;
  }
  return input ?? CALL_ME_SENSEI_STYLE_BUNDLE;
}

function isSkySystem(subject) {
  return typeof subject?.toParams === 'function'
    && typeof subject?.applyPreset === 'function'
    && subject?.sun
    && subject?.clouds;
}

function sunDirectionFromFrame(frame) {
  const { x, y, z } = frame.sunSourceRatios;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function alignSkyCloudShadowToLighting(sky, direction) {
  sky?.setCloudShadowDirection?.(direction);
}

function skySunPoseForFrame(skyParams, frame) {
  const direction = sunDirectionAt(
    frame.hour / 24,
    skyParams.time?.latitude,
    skyParams.time?.azimuth,
  );
  return {
    azimuth: azimuthOf(direction),
    elevation: elevationOf(direction),
  };
}

async function applySkySystemBundle(
  sky,
  settings,
  lightingFrame,
  { useBundlePhysicalDefault = false } = {},
) {
  if (useBundlePhysicalDefault) await sky.applyPreset(SKY_PRESETS.partlyCloudy);
  const current = sky.toParams();
  const coordinated = {
    sun: {
      ...current.sun,
      // The SkySystem's sun must follow its real celestial arc so its Dawn,
      // Day, Sunset, and Night palette weights can see the sun cross the
      // horizon. The gameplay lighting frame deliberately keeps a blue night
      // key above the ground; feeding that direction into the sky made every
      // visible dome render as daytime cyan.
      ...skySunPoseForFrame(current, lightingFrame),
    },
    time: {
      ...current.time,
      autoAdvanceSecondsPerDay: 0,
      time: lightingFrame.hour / 24,
    },
  };
  const namedSkyStyle = typeof settings.sky?.style === 'string' ? settings.sky.style : null;
  const namedCloudStyle = typeof settings.cloud?.style === 'string' ? settings.cloud.style : null;
  const snapshot = resolveSkySystemStyleSnapshot(namedSkyStyle)
    ?? resolveSkySystemStyleSnapshot(namedCloudStyle);
  const cloudSettings = namedCloudStyle ? null : settings.cloud;
  await sky.applyPreset(createSkyParams({
    ...current,
    ...coordinated,
    atmosphere: snapshot
      ? { ...current.atmosphere, style: snapshot.skyColor }
      : current.atmosphere,
    cloud: {
      ...current.cloud,
      ...cloudSettings,
      ...(snapshot ? { style: snapshot.cloudStyle } : {}),
    },
  }));
  alignSkyCloudShadowToLighting(sky, sunDirectionFromFrame(lightingFrame));
}

function lightingRequestsShadows(settings) {
  const policy = settings?.lighting?.shadowPolicy;
  return Boolean(
    policy
    && policy.mode !== 'disabled'
    && Number(policy.maxShadowedLights) > 0,
  );
}

/**
 * One package-owned coordinator for a styled scene. It installs the bundle's
 * lighting (including the canonical sky probe), coordinates sky/cloud/water/post,
 * and delegates labeled object targets to the public shader adapters.
 */
export function createSceneStyleRuntime({
  collision = 'auto',
  collisionAdapter = LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  collisionAdapters = [],
  collisionHeightAt = null,
  environmentRoot = null,
  fog = null,
  post = null,
  quality = 'balanced',
  renderer = null,
  rendererConfiguration = {},
  scene = null,
  sky = null,
  // Call Me Sensei's reviewed "Noon" frame is the 13:00 keyframe. Keep
  // the system default on that authored anchor so consumers do not receive an
  // unintended dawn/noon interpolation when they simply apply the bundle.
  timeOfDay = 13,
  water = null,
  world = null,
} = {}) {
  if (!scene && !world) {
    throw new TypeError('createSceneStyleRuntime needs a scene or StylizedWorld.');
  }
  const runtimeScene = scene ?? world?.scene ?? null;
  const existingCollisionRuntime = sceneCollisionRuntimeFor(runtimeScene);
  const collisionRuntime = collision === false
    ? null
    : existingCollisionRuntime ?? createSceneCollisionRuntime({
      adapter: collisionAdapter,
      adapters: collisionAdapters,
      collision: collision === 'auto'
        ? world?.collision ?? null
        : collision?.world ?? collision,
      heightAt: collisionHeightAt,
      scene: runtimeScene,
    });
  const ownsCollisionRuntime = Boolean(collisionRuntime && !existingCollisionRuntime);
  const qualityProfile = resolveSceneQualityProfile(quality);
  let rendererHandle = null;
  const lighting = createLightingSystem({
    renderer,
    scene: runtimeScene,
    timeOfDay,
  });
  let activePost = post;
  let activeSky = sky;
  let activeWater = water;
  let appliedBundle = null;
  let appliedSettings = null;
  const styleTransactions = [];
  const qualityTransactions = [];
  let groundFieldPass = null;
  let shadowsEnabled = false;
  const shadowPass = renderer && runtimeScene
    ? createEnvironmentSunShadowPass({ renderer, scene: runtimeScene })
    : null;
  const rendererShadowState = renderer?.shadowMap
    ? {
      autoUpdate: renderer.shadowMap.autoUpdate,
      enabled: renderer.shadowMap.enabled,
      needsUpdate: renderer.shadowMap.needsUpdate,
      type: renderer.shadowMap.type,
    }
    : null;

  function syncShadowDefaults(settings) {
    shadowsEnabled = lightingRequestsShadows(settings);
    if (!shadowsEnabled || !renderer?.shadowMap) return;
    // TSL materials consume the package shadow pass. Keep every
    // WebGPURenderer backend on that single path: enabling Three's native
    // shadow render at the same time makes the character/depth passes swap
    // materials while a second shadow submission still owns their bindings.
    // Classic WebGL materials keep their native shadow path.
    const supportsNativeShadow = !renderer.isWebGPURenderer;
    if (supportsNativeShadow) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
    }
  }

  function syncStylePasses(settings) {
    const needsGroundField = Number(settings?.grass?.groundAdoptStrength) > 0;
    if (needsGroundField && !groundFieldPass && renderer && runtimeScene) {
      groundFieldPass = createEnvironmentGroundFieldPass({
        renderer,
        resolution: 1024,
        scene: runtimeScene,
      });
    } else if (!needsGroundField && groundFieldPass) {
      groundFieldPass.dispose();
      groundFieldPass = null;
    }
  }

  function attachLightingTargets() {
    if (world) lighting.attachWorld(world);
    else {
      lighting.attach({
        environmentRoot,
        fog: fog ?? runtimeScene?.fog ?? null,
        sky: activeSky,
        water: activeWater,
      });
    }
  }

  function boundSystemTargets(settings, { includeLighting = true } = {}) {
    const targets = [];
    if (includeLighting && settings.lighting) {
      targets.push(createStyleTarget('toonlab:lighting', 'lighting', lighting));
    }
    if (activeWater && settings.water) {
      targets.push(createStyleTarget('toonlab:water', 'water', activeWater));
    }
    if (activePost && settings.post) {
      targets.push(createStyleTarget('toonlab:post', 'post', activePost));
    }
    if (activeSky && settings.sky) {
      if (isSkySystem(activeSky)) {
        targets.push(createStyleTarget('toonlab:sky', 'sky', activeSky, {
          adapter: {
            apply(subject, _skySettings, { resolvedSettings }) {
              return applySkySystemBundle(subject, resolvedSettings, lighting.frame, {
                useBundlePhysicalDefault: true,
              });
            },
            capture: (subject) => subject.toParams(),
            custom: false,
            id: 'toonlab-sky-system',
            restore: (subject, snapshot) => subject.applyPreset(snapshot),
          },
        }));
      } else {
        targets.push(createStyleTarget('toonlab:sky', 'sky', activeSky));
      }
    }
    return targets;
  }

  async function revertTransactions() {
    const errors = [];
    for (const transaction of [...qualityTransactions].reverse()) {
      try {
        await transaction.revert();
      } catch (error) {
        errors.push(error);
      }
    }
    qualityTransactions.length = 0;
    for (const transaction of [...styleTransactions].reverse()) {
      try {
        await transaction.revert();
      } catch (error) {
        errors.push(error);
      }
    }
    styleTransactions.length = 0;
    if (errors.length) throw new AggregateError(errors, 'Scene style runtime failed to revert cleanly.');
  }

  attachLightingTargets();
  const scheduler = createSceneUpdateScheduler({
    maxFrameMs: qualityProfile.quality.scheduler.maxFrameMs,
  });
  let shadowUpdateElapsed = Number.POSITIVE_INFINITY;
  scheduler.register({
    id: 'toonlab:ground-field',
    // Visible ground color depends on the current lighting and shared shadow
    // texture, so publish it only after those phases have completed.
    phase: 'render-passes',
    update: () => groundFieldPass?.update(),
  });
  scheduler.register({
    id: 'toonlab:lighting',
    phase: 'lighting',
    update: ({ camera, delta }) => lighting.update(delta, camera),
  });
  scheduler.register({
    id: 'toonlab:sun-shadows',
    phase: 'shadows',
    update: ({ camera, delta }) => {
      const updatesPerSecond = qualityProfile.quality.shadows.maxUpdatesPerSecond;
      if (!shadowsEnabled || updatesPerSecond <= 0) return;
      shadowUpdateElapsed += Math.max(Number(delta) || 0, 0);
      const interval = 1 / updatesPerSecond;
      if (shadowUpdateElapsed < interval) return;
      shadowUpdateElapsed %= interval;
      shadowPass?.update({ camera, dynamic: true });
      groundFieldPass?.invalidateColor();
      if (renderer?.shadowMap) renderer.shadowMap.needsUpdate = true;
    },
  });
  let disposed = false;
  let disposePromise = null;
  let sceneDiscoveryEnabled = false;
  let sceneDiscoveryElapsed = 0;
  let sceneDiscoveryError = null;
  let sceneDiscoveryMode = 'strict';
  let sceneDiscoveryPromise = null;
  let sceneDiscoveryReport = null;
  // Scene-discovered targets are deliberately owned one transaction at a
  // time. Async React/loader lifecycles can replace an object while keeping
  // its stable target id (character switching is the common case), so an id
  // alone is not enough to prove that the inspector still owns the live
  // subject.
  const sceneDiscoveredTargets = new Map();
  const inspector = createToonLabInspector({
    bundle: appliedBundle,
    diagnostics: () => ({
      cloudShadows: {
        enabled: environmentCloudShadow.enabled.value > 0,
        mapName: environmentCloudShadow.map.value?.name ?? null,
        ready: environmentCloudShadow.ready.value === true,
        source: environmentCloudShadow.ready.value === true
          ? 'sky-system-volumetric-transmittance'
          : null,
      },
      collision: collisionRuntime ? {
        ok: collisionRuntime.report.ok,
        registered: collisionRuntime.report.stats.registered,
        solid: collisionRuntime.report.stats.solid,
        targets: collisionRuntime.report.stats.targets,
        unresolved: collisionRuntime.report.stats.unresolved,
      } : null,
      groundField: {
        colorSemantics: groundFieldPass?.colorSemantics ?? null,
        ready: groundFieldPass?.ready === true,
        writerCount: groundFieldPass?.writerCount ?? 0,
      },
      renderer: {
        backend: rendererHandle?.backend ?? null,
        configured: Boolean(rendererHandle),
      },
      shadows: {
        enabled: shadowsEnabled,
        native: renderer?.shadowMap?.enabled === true,
        // `sharedPass` used to be `Boolean(shadowPass?.shadowTexture)`, which
        // is true as soon as the pass allocates a target — so a scene with no
        // shadow-casting sun, or no caster, reported healthy shadows and
        // shipped with none (D19-041). It now reflects whether the pass has
        // actually drawn casters into a published map, and `sharedPassHealth`
        // says why not.
        sharedPass: shadowPass?.health?.ok === true,
        sharedPassHealth: shadowPass?.health ?? null,
        updatesPerSecond: qualityProfile.quality.shadows.maxUpdatesPerSecond,
      },
      sky: activeSky ? {
        quality: activeSky.qualityLevel ?? null,
        ready: true,
      } : null,
      water: activeWater ? {
        passes: activeWater.passes?.stats?.lastFrame?.passes ?? [],
        quality: activeWater.passes?.stats?.quality ?? null,
        ready: true,
      } : null,
    }),
    quality: qualityProfile,
  });

  async function releaseSceneDiscoveredTarget(targetId) {
    const record = sceneDiscoveredTargets.get(targetId);
    if (!record) return false;
    sceneDiscoveredTargets.delete(targetId);
    const errors = [];
    try {
      await record.quality?.revert?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      await record.style.revert();
    } catch (error) {
      errors.push(error);
    }
    record.unregister?.();
    if (errors.length) {
      throw new AggregateError(
        errors,
        `Scene-discovered style target "${targetId}" failed to release cleanly.`,
      );
    }
    return true;
  }

  async function releaseSceneDiscoveredTargets(targetIds = [...sceneDiscoveredTargets.keys()]) {
    const errors = [];
    for (const targetId of [...targetIds].reverse()) {
      try {
        await releaseSceneDiscoveredTarget(targetId);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, 'Scene-discovered style targets failed to release cleanly.');
    }
  }

  async function refreshStyleTargets() {
    if (disposed || !sceneDiscoveryEnabled || !appliedBundle) {
      return { applied: 0, enabled: sceneDiscoveryEnabled, report: sceneDiscoveryReport };
    }
    if (sceneDiscoveryPromise) return sceneDiscoveryPromise;
    sceneDiscoveryPromise = (async () => {
      const report = collectStyleTargets(runtimeScene, { renderer });
      sceneDiscoveryReport = report;
      if (sceneDiscoveryMode === 'strict' && !report.ok) {
        throw new StyleTargetDiscoveryError(report);
      }
      const isBoundSystemTarget = (target) => (
        (target.domain === 'water' && target.subject === activeWater)
        || (target.domain === 'sky' && target.subject === activeSky)
        || (target.domain === 'post' && target.subject === activePost)
      );
      const discoverableTargets = report.targets.filter((target) => !isBoundSystemTarget(target));
      const reportedById = new Map(discoverableTargets.map((target) => [target.id, target]));
      const replacedOrRemoved = [...sceneDiscoveredTargets.entries()]
        .filter(([targetId, record]) => reportedById.get(targetId)?.subject !== record.subject)
        .map(([targetId]) => targetId);
      await releaseSceneDiscoveredTargets(replacedOrRemoved);

      const registeredIds = new Set(inspector.snapshot().targets.map(({ targetId }) => targetId));
      const targets = discoverableTargets.filter((target) => {
        const record = sceneDiscoveredTargets.get(target.id);
        if (record?.subject === target.subject) return false;
        return !registeredIds.has(target.id);
      });
      if (targets.length === 0) {
        await collisionRuntime?.refresh({ discoveryReport: report, mode: sceneDiscoveryMode });
        sceneDiscoveryError = null;
        inspector.updateTelemetry({
          styleDiscovery: {
            issueCount: report.issues.length,
            targetCount: report.targets.length,
          },
        });
        return { applied: 0, enabled: true, report };
      }
      const addedTargetIds = [];
      let applied = 0;
      const appliedEntries = [];
      try {
        for (const target of targets) {
          const style = await applyStyleBundle(appliedBundle, {
            mode: sceneDiscoveryMode,
            targets: [target],
          });
          if (disposed) {
            await style.revert();
            break;
          }
          const targetQuality = target.domain === 'vegetation.grass'
            ? await applySceneQualityProfile(qualityProfile, { vegetation: [target.subject] })
            : null;
          const unregister = inspector.registerApplication(style);
          sceneDiscoveredTargets.set(target.id, {
            quality: targetQuality,
            style,
            subject: target.subject,
            unregister,
          });
          addedTargetIds.push(target.id);
          applied += style.applied.length;
          appliedEntries.push(...style.applied);
        }
        await collisionRuntime?.refresh({ discoveryReport: report, mode: sceneDiscoveryMode });
      } catch (error) {
        try {
          await releaseSceneDiscoveredTargets(addedTargetIds);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            'Scene style discovery and rollback both failed.',
          );
        }
        throw error;
      }
      if (disposed) {
        await releaseSceneDiscoveredTargets(addedTargetIds);
        return { applied: 0, disposed: true, enabled: false, report };
      }
      sceneDiscoveryError = null;
      inspector.updateTelemetry({
        styleDiscovery: {
          issueCount: report.issues.length,
          targetCount: report.targets.length,
        },
      });
      return { applied, appliedEntries, enabled: true, report };
    })().catch((error) => {
      sceneDiscoveryError = error;
      inspector.updateTelemetry({
        styleDiscovery: {
          error: error.message,
          issueCount: sceneDiscoveryReport?.issues?.length ?? 0,
          targetCount: sceneDiscoveryReport?.targets?.length ?? 0,
        },
      });
      throw error;
    }).finally(() => {
      sceneDiscoveryPromise = null;
    });
    return sceneDiscoveryPromise;
  }

  scheduler.register({
    id: 'toonlab:style-discovery',
    phase: 'diagnostics',
    priority: 100,
    update: ({ delta }) => {
      if (!sceneDiscoveryEnabled || sceneDiscoveryPromise || disposed) return;
      sceneDiscoveryElapsed += Math.max(Number(delta) || 0, 0);
      if (sceneDiscoveryElapsed < 0.5) return;
      sceneDiscoveryElapsed %= 0.5;
      void refreshStyleTargets().catch((error) => {
        console.error('ToonLab scene style discovery failed:', error);
      });
    },
  });

  const api = {
    async apply(bundleInput = CALL_ME_SENSEI_STYLE_BUNDLE, {
      allowCustomAdapters = true,
      discovery = 'manual',
      mode = 'strict',
      targets = [],
      watch = discovery === 'scene-labels',
    } = {}) {
      if (disposed) throw new Error('Cannot apply a bundle with a disposed scene style runtime.');
      if (!['manual', 'scene-labels'].includes(discovery)) {
        throw new TypeError('Style target discovery must be "manual" or "scene-labels".');
      }
      if (!['strict', 'advisory'].includes(mode)) {
        throw new TypeError('Style bundle application mode must be "strict" or "advisory".');
      }
      const bundle = resolveBundle(bundleInput);
      const validation = validateStyleBundleDocument(bundle);
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      const document = validation.value;
      const settings = resolveStyleBundleSettings(document);

      const discoveryReport = discovery === 'scene-labels'
        ? collectStyleTargets(runtimeScene, { renderer })
        : { issues: [], ok: true, targets: [] };
      if (mode === 'strict' && !discoveryReport.ok) {
        throw new StyleTargetDiscoveryError(discoveryReport);
      }
      // Scene labels are applied as individually owned transactions below so
      // late loader mounts and same-id subject replacements can be released
      // without disturbing unrelated targets. Explicit targets remain part of
      // this caller-owned atomic application.
      const selectedTargets = [...targets];

      const objectTargets = selectedTargets.filter(({ domain }) => ![
        'cloud', 'lighting', 'post', 'sky', 'water',
      ].includes(domain));
      const previousShadowState = renderer?.shadowMap
        ? {
          autoUpdate: renderer.shadowMap.autoUpdate,
          enabled: renderer.shadowMap.enabled,
          needsUpdate: renderer.shadowMap.needsUpdate,
          type: renderer.shadowMap.type,
        }
        : null;
      const previousShadowsEnabled = shadowsEnabled;
      const previousGroundFieldPass = groundFieldPass;
      let configuredThisApply = false;
      let result = null;
      let qualityResult = null;
      const systemTargets = boundSystemTargets(settings);
      const systemTargetIds = new Set(systemTargets.map(({ id }) => id));
      try {
        result = await applyStyleBundle(document, {
          allowCustomAdapters,
          mode,
          targets: [...systemTargets, ...objectTargets],
        });
        if (renderer && !rendererHandle) {
          const runtimeRendererConfiguration = {
            ...qualityProfile.quality.renderer,
            ...rendererConfiguration,
          };
          if (renderer.isWebGPURenderer && rendererConfiguration.shadows === undefined) {
            runtimeRendererConfiguration.shadows = false;
          }
          rendererHandle = configureToonLabRenderer(renderer, runtimeRendererConfiguration);
          configuredThisApply = true;
        }
        qualityResult = await applySceneQualityProfile(qualityProfile, {
          lighting,
          post: activePost,
          sky: activeSky,
          vegetation: objectTargets
            .filter(({ domain }) => domain === 'vegetation.grass')
            .map(({ subject }) => subject),
          water: activeWater,
        });
        syncShadowDefaults(settings);
        syncStylePasses(settings);
      } catch (error) {
        const rollbackErrors = [];
        if (groundFieldPass && !previousGroundFieldPass) {
          groundFieldPass.dispose();
          groundFieldPass = null;
        }
        shadowsEnabled = previousShadowsEnabled;
        if (previousShadowState && renderer?.shadowMap) {
          renderer.shadowMap.autoUpdate = previousShadowState.autoUpdate;
          renderer.shadowMap.enabled = previousShadowState.enabled;
          renderer.shadowMap.needsUpdate = previousShadowState.needsUpdate;
          renderer.shadowMap.type = previousShadowState.type;
        }
        if (configuredThisApply) {
          rendererHandle?.dispose();
          rendererHandle = null;
        }
        if (qualityResult) {
          try {
            await qualityResult.revert();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (result) {
          try {
            await result.revert();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length) {
          throw new AggregateError(
            [error, ...rollbackErrors],
            'Scene style application rollback failed.',
          );
        }
        throw error;
      }
      const previousBundle = appliedBundle;
      const previousSettings = appliedSettings;
      const previousDiscoveryEnabled = sceneDiscoveryEnabled;
      const previousDiscoveryMode = sceneDiscoveryMode;
      let discoveryResult = null;
      if (discovery === 'scene-labels') {
        appliedBundle = document;
        appliedSettings = settings;
        sceneDiscoveryEnabled = true;
        sceneDiscoveryMode = mode;
        sceneDiscoveryElapsed = 0;
        try {
          discoveryResult = await refreshStyleTargets();
        } catch (error) {
          const rollbackErrors = [];
          try {
            await releaseSceneDiscoveredTargets();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
          try {
            await qualityResult.revert();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
          try {
            await result.revert();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
          appliedBundle = previousBundle;
          appliedSettings = previousSettings;
          sceneDiscoveryEnabled = previousDiscoveryEnabled;
          sceneDiscoveryMode = previousDiscoveryMode;
          if (rollbackErrors.length) {
            throw new AggregateError(
              [error, ...rollbackErrors],
              'Scene label application and rollback both failed.',
            );
          }
          throw error;
        }
        sceneDiscoveryEnabled = Boolean(watch);
      }
      styleTransactions.push(result);
      qualityTransactions.push(qualityResult);
      appliedBundle = document;
      appliedSettings = settings;
      inspector.registerApplication(result);
      inspector.setContext({ bundle: document, quality: qualityProfile });
      return {
        ...result,
        applied: [
          ...result.applied.filter(({ targetId }) => !systemTargetIds.has(targetId)),
          ...(discoveryResult?.appliedEntries ?? []),
        ],
        discovery: discoveryReport,
        lighting,
        quality: qualityResult,
        settings,
        systems: {
          applied: result.applied.filter(({ targetId }) => systemTargetIds.has(targetId)),
          skipped: result.skipped.filter(({ targetId }) => systemTargetIds.has(targetId)),
        },
      };
    },

    /**
     * Binds async-created scene systems without replacing the lighting rig.
     * The last applied bundle is immediately landed on the new systems.
     */
    async setSystems({
      post: nextPost = activePost,
      sky: nextSky = activeSky,
      water: nextWater = activeWater,
    } = {}) {
      if (disposed) throw new Error('Cannot bind systems to a disposed scene style runtime.');
      const previousSystems = {
        post: activePost,
        sky: activeSky,
        water: activeWater,
      };
      activePost = nextPost;
      activeSky = nextSky;
      activeWater = nextWater;
      attachLightingTargets();
      let result = null;
      let qualityResult = null;
      try {
        const systemSubjects = new Set([activePost, activeSky, activeWater].filter(Boolean));
        const supersededDiscoveries = [...sceneDiscoveredTargets.entries()]
          .filter(([, record]) => systemSubjects.has(record.subject))
          .map(([targetId]) => targetId);
        await releaseSceneDiscoveredTargets(supersededDiscoveries);
        if (appliedBundle && appliedSettings) {
          result = await applyStyleBundle(appliedBundle, {
            targets: boundSystemTargets(appliedSettings, { includeLighting: false }),
          });
          qualityResult = await applySceneQualityProfile(qualityProfile, {
            post: activePost,
            sky: activeSky,
            water: activeWater,
          });
        }
      } catch (error) {
        let rollbackError = null;
        if (result) {
          try {
            await result.revert();
          } catch (nextRollbackError) {
            rollbackError = nextRollbackError;
          }
        }
        activePost = previousSystems.post;
        activeSky = previousSystems.sky;
        activeWater = previousSystems.water;
        attachLightingTargets();
        if (rollbackError) {
          throw new AggregateError([error, rollbackError], 'Scene system binding and rollback both failed.');
        }
        throw error;
      }
      if (result) styleTransactions.push(result);
      if (qualityResult) qualityTransactions.push(qualityResult);
      if (result) inspector.registerApplication(result);
      return api;
    },

    dispose() {
      if (disposePromise) return disposePromise;
      scheduler.dispose();
      disposed = true;
      groundFieldPass?.dispose();
      groundFieldPass = null;
      shadowPass?.dispose();
      if (rendererShadowState && renderer?.shadowMap) {
        renderer.shadowMap.autoUpdate = rendererShadowState.autoUpdate;
        renderer.shadowMap.enabled = rendererShadowState.enabled;
        renderer.shadowMap.needsUpdate = rendererShadowState.needsUpdate;
        renderer.shadowMap.type = rendererShadowState.type;
      }
      rendererHandle?.dispose();
      rendererHandle = null;
      disposePromise = (async () => {
        let revertError = null;
        try {
          await sceneDiscoveryPromise;
        } catch (error) {
          revertError = error;
        }
        try {
          await releaseSceneDiscoveredTargets();
        } catch (error) {
          revertError = revertError
            ? new AggregateError([revertError, error], 'Scene discovery and target rollback failed.')
            : error;
        }
        try {
          await revertTransactions();
        } catch (error) {
          revertError = revertError
            ? new AggregateError([revertError, error], 'Scene discovery and style rollback failed.')
            : error;
        } finally {
          if (ownsCollisionRuntime) collisionRuntime?.dispose();
          inspector.dispose();
          lighting.dispose();
        }
        if (revertError) throw revertError;
        return true;
      })();
      return disposePromise;
    },

    setTimeOfDay(hour) {
      const frame = lighting.setTimeOfDay(hour);
      if (isSkySystem(activeSky)) {
        activeSky.setTimeOfDay(frame.hour, {
          autoAdvanceSecondsPerDay: 0,
        });
        alignSkyCloudShadowToLighting(activeSky, sunDirectionFromFrame(frame));
      }
      return frame;
    },

    setSunDirection(direction = null) {
      const resolved = lighting.setSunDirection(direction);
      if (isSkySystem(activeSky)) {
        activeSky.setTimeOfDay(lighting.frame.hour, {
          autoAdvanceSecondsPerDay: 0,
          sunDirection: resolved,
        });
        alignSkyCloudShadowToLighting(activeSky, resolved);
      }
      shadowPass?.invalidate?.();
      return resolved;
    },

    /**
     * Replaces the physical SkySystem condition while preserving the active
     * style bundle's sky/cloud presentation and coordinated lighting frame.
     * Hosts should use this instead of calling SkySystem.applyPreset directly
     * after a bundle has been applied, which would intentionally replace the
     * style snapshot along with the physical condition.
     */
    async setSkyPreset(preset, { timeOfDay = null } = {}) {
      if (typeof activeSky?.applyPreset !== 'function') {
        throw new TypeError('Scene style runtime has no preset-capable sky.');
      }
      const frame = Number.isFinite(Number(timeOfDay))
        ? lighting.setTimeOfDay(Number(timeOfDay))
        : lighting.frame;
      await activeSky.applyPreset(preset);
      if (isSkySystem(activeSky)) {
        if (appliedSettings) {
          await applySkySystemBundle(activeSky, appliedSettings, frame);
        } else {
          activeSky.setTimeOfDay(frame.hour, {
            autoAdvanceSecondsPerDay: 0,
          });
          alignSkyCloudShadowToLighting(activeSky, sunDirectionFromFrame(frame));
        }
      }
      return activeSky.toParams?.() ?? null;
    },

    update(delta, camera) {
      return scheduler.update({ camera, delta });
    },

    refreshStyleTargets,
    get sceneDiscovery() {
      return {
        enabled: sceneDiscoveryEnabled,
        error: sceneDiscoveryError,
        report: sceneDiscoveryReport,
      };
    },
    get groundFieldPass() { return groundFieldPass; },
    get collision() { return collisionRuntime; },
    inspector,
    get lighting() { return lighting; },
    get quality() { return qualityProfile; },
    get sky() { return activeSky; },
    get rendererConfiguration() { return rendererHandle; },
    get scheduler() { return scheduler; },
    get shadowPass() { return shadowPass; },
  };

  return api;
}
