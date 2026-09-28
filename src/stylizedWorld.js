import * as THREE from 'three';

import {
  applyEnvironmentShader,
  advanceEnvironmentShaderTime,
  setEnvironmentCloudShadow,
} from './environment/environmentMaterialAdapter.js';
import { resolveEnvironmentPreset } from './environment/environmentPresets.js';
import { createEnvironmentSunRig } from './environment/environmentRigs.js';
import { createEnvironmentSunShadowPass } from './environment/environmentSunShadowPass.js';
import { createEnvironmentGroundFieldPass } from './environment/environmentGroundFieldPass.js';
import { WaterSurface } from './water/waterSurface.js';
import { StylizedSky } from './sky/stylizedSky.js';
import { AtmosphereSky } from './sky/atmosphereSky.js';
import { parseSkyParamsDocument } from './sky/skyParams.js';
import { SkySystem } from './sky/skySystem.js';
import { StylizedGrassClumpField } from './vegetation/grassClump.js';
import { createCallMeSenseiGrassField } from './vegetation/callMeSenseiGrass.js';
import { StylizedFlowerField } from './vegetation/stylizedFlowers.js';
import { StylizedForest } from './vegetation/stylizedForest.js';
import { StylizedUnderstory, scatterUnderstory } from './vegetation/stylizedUnderstory.js';
import { StylizedContactShadowField } from './vegetation/contactShadowField.js';
import {
  applyVegetationShader,
  createVegetationShaderSettings,
} from './vegetation/vegetationShaders.js';
import {
  combineMasks,
  createSlopeMask,
  createWaterMask,
  scatterForest,
  scatterGrassAround,
} from './vegetation/scatter.js';
import { resolveWorldPreset } from './worldPresets.js';
import { createWorldCollision } from './worldCollision.js';
import { createStylizedPaths } from './pathgen/stylizedPaths.js';
import { createFauna } from './fauna/index.js';
import { createAmbientFx } from './ambientfx/index.js';
import { createWeatherSystem } from './weather/index.js';

// The composed golden path: one call assembles a complete stylized outdoor
// world — environment-shaded terrain, sun rig, sky dome, interactive water,
// scattered trees/grass/flowers, shared cloud shadows — from a world preset,
// and returns a single update(delta) for the render loop. Import from
// '@call-me-sensei/toonlab'.
//
// The look of this library does not live in any single system; it emerges
// from the assembly (the sky feeds the water's reflections, the sun rig and
// fog set the palette, cloud shadows tie ground/canopy/water together). This
// function IS that assembly, so a host — human or coding agent — cannot
// accidentally ship the geometry without the look.
//
//   const world = await createStylizedWorld({
//     renderer, scene, camera,
//     terrain: { root: terrainMesh, heightAt, size: { width: 2000, depth: 2000 } },
//     water: { level: 8 },
//     followTarget: characterRoot,   // ripples, wakes, grass push-away
//   });
//
//   // render loop:
//   world.update(delta);
//   renderer.render(scene, camera); // or post.render(delta)
//
// Character/toon shading stays host-owned (applyToonShader +
// createCharacterRenderPasses), as does post-processing — both compose with
// this world untouched.

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sunColorArray(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    if (next.every(Number.isFinite)) return next;
  }
  return fallback.slice();
}

function collectRockContactPlacements(root, heightAt) {
  if (!root) return [];
  const placements = [];
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh) return;
    let ancestor = object;
    let rockLike = false;
    while (ancestor && ancestor !== root.parent) {
      if (/rock|boulder|spire|outcrop/i.test(ancestor.name ?? '')) {
        rockLike = true;
        break;
      }
      ancestor = ancestor.parent;
    }
    if (!rockLike) return;
    object.geometry.computeBoundingSphere?.();
    const localRadius = object.geometry.boundingSphere?.radius ?? 1;
    object.getWorldPosition(position);
    object.getWorldScale(scale);
    const radius = THREE.MathUtils.clamp(localRadius * Math.max(scale.x, scale.z) * 0.55, 0.5, 8);
    const y = typeof heightAt === 'function' ? heightAt(position.x, position.z) : position.y;
    placements.push({ aspect: 0.68, radius, rotation: object.rotation.y, x: position.x, y, z: position.z });
  });
  return placements;
}

/**
 * Assembles a stylized outdoor world from a world preset.
 *
 * @param {Object} options
 * @param {THREE.Renderer} options.renderer Host renderer (water passes need it).
 * @param {THREE.Scene} options.scene Host scene; systems are added to it.
 * @param {THREE.PerspectiveCamera} [options.camera] When given (and
 *   `applyCamera` isn't false), the preset's near/far/fov are applied.
 * @param {Object} options.terrain `{ root, heightAt, size }` — `root` is the
 *   Object3D converted by the environment shader (required); `heightAt(x, z)`
 *   drives water bed, scatter placement, and slope/water masks (strongly
 *   recommended); `size` is `{ width, depth }` in meters for water extent and
 *   scatter radius defaults.
 * @param {string} [options.preset] World preset name (default 'outdoorGameplay').
 * @param {Object|false} [options.water] `{ level, width, depth, settings }`,
 *   or `false` to skip water.
 * @param {Object|false} [options.paths] A network from `createStylizedPaths`
 *   OR options for one (`{ seed, auto, routes, settings }`). Wired fully:
 *   ribbons join the environment shading + fog, the on-path mask parts
 *   grass/flowers/trees, bridge rails register collision, and
 *   `collision.groundHeight` follows the flattened `paths.heightAt`.
 * @param {Object|false} [options.trees] `{ scatter, settings, center }`
 *   overrides over the world preset, or `false` to skip.
 * @param {Object|false} [options.understory] `{ scatter, settings, mask }`
 *   overrides for the bounded instanced shrub/ground-cover layer.
 * @param {Object|false} [options.contactShadows] Soft instanced tree/rock
 *   grounding options, or `false` to skip.
 * @param {Object|false} [options.grass] Same shape as trees, or `false`.
 * @param {Object|false} [options.flowers] `{ scatter, settings }`; off unless given.
 * @param {Object|string} [options.vegetationShader] Compatibility aggregate
 *   applied to tree, grass, and flower when `vegetationShaders` does not
 *   override that family member.
 * @param {Object} [options.vegetationShaders] Independent `{ tree, grass,
 *   flower }` shader profiles. These are rendering treatments only; albedo,
 *   construction, and live world values remain owned by the asset/runtime.
 * @param {Object3D} [options.followTarget] Character root: water ripple
 *   window + interactor splashes/wakes, grass push-away.
 * @param {Object|false} [options.cloudShadows] `{ strength, coverage, scale,
 *   velocity }` legacy override merged into the weather cloud field.
 * @param {Object} [options.documents] Separate durable `{ sky, volumetricSky }`
 *   documents. These are referenced runtime inputs and are never embedded into
 *   the world preset. `sky` is a v2 Sky Shader preset; `volumetricSky` is a
 *   `toonlab/sky-params` document, which builds the raymarched cloud deck and
 *   requires `camera`. The retired `cloudSource` / `cloudSources` /
 *   `cloudShader` / `cloudComposition` documents drove the 2.5D card field and
 *   are gone with it.
 * @param {Object|false} [options.weather] `{ preset, settings, seed }` builds
 *   the shared weather coordinator. `false` keeps the legacy static cloud
 *   shadow path. Defaults to the world preset's Call Me Sensei weather.
 * @param {boolean} [options.sun] Build the environment sun rig (default true).
 * @param {boolean} [options.applyCamera] Apply preset camera planes (default true).
 * @param {Object} [options.environment] Extra `applyEnvironmentShader`
 *   options merged last (features/parameters/roleOverrides/...).
 * @returns {Promise<Object>} `{ update, dispose, sky, water, sunRig, sunState,
 *   setSun, grass, flowerField, forest, understory, contactShadows, masks,
 *   worldPreset, classification }`.
 *   `setSun({ direction, color, sky })` is the transient scene-light adapter
 *   used by Lighting and Weather; it does not rewrite portable asset presets.
 */
export async function createStylizedWorld({
  renderer,
  scene,
  camera = null,
  terrain,
  preset = 'outdoorGameplay',
  water = {},
  paths = false,
  fauna = false,
  ambientfx = false,
  weather = {},
  sky: skyOptions = {},
  fog = {},
  shadows = {},
  trees = {},
  understory = {},
  contactShadows = {},
  grass = {},
  flowers = false,
  vegetationShader = {},
  vegetationShaders = null,
  followTarget = null,
  cloudShadows = null,
  sun = true,
  applyCamera = true,
  environment = {},
  groundField = {},
  documents = {},
} = {}) {
  if (!renderer || !scene) throw new Error('createStylizedWorld needs { renderer, scene }.');
  const terrainRoot = terrain?.root ?? null;
  if (!terrainRoot) throw new Error('createStylizedWorld needs terrain.root (the Object3D to shade).');
  const heightAt = typeof terrain?.heightAt === 'function' ? terrain.heightAt : null;
  // A direct mesh is unambiguously the supplied terrain. Group-based hosts
  // can tag writers themselves or pass terrain.groundWriters explicitly;
  // ToonLab terrain and path builders already carry the tag.
  if (terrainRoot.isMesh) terrainRoot.userData.groundFieldWrite = true;
  for (const writer of terrain?.groundWriters ?? []) {
    if (writer?.isMesh) writer.userData.groundFieldWrite = true;
  }

  const worldPreset = resolveWorldPreset(preset);
  if (!worldPreset) throw new Error(`Unknown world preset "${preset}".`);
  const vegetationShaderOptions = typeof vegetationShader === 'string'
    ? { style: vegetationShader }
    : cleanObject(vegetationShader);
  let vegetationShaderSettings = createVegetationShaderSettings({
    preset: vegetationShaderOptions.style
      ?? vegetationShaderOptions.preset
      ?? cleanObject(worldPreset.vegetationShader).style
      ?? cleanObject(worldPreset.vegetationShader).preset
      ?? 'default',
    ...vegetationShaderOptions,
  });
  const scopedVegetationShaderOptions = cleanObject(vegetationShaders);
  let vegetationShaderSettingsByFamily = {
    flower: createVegetationShaderSettings(
      scopedVegetationShaderOptions.flower ?? vegetationShaderSettings,
    ),
    grass: createVegetationShaderSettings(
      scopedVegetationShaderOptions.grass ?? vegetationShaderSettings,
    ),
    tree: createVegetationShaderSettings(
      scopedVegetationShaderOptions.tree ?? vegetationShaderSettings,
    ),
  };

  // terrain.size accepts a number (square), { width, depth }, or { x, z }
  // (the shape createStylizedTerrain returns as meshExtent) — silently
  // defaulting on an unrecognized shape mis-sizes the water plane.
  const sizeOption = terrain?.size;
  const width = Number(sizeOption?.width ?? sizeOption?.x ?? sizeOption) || 2000;
  const depth = Number(sizeOption?.depth ?? sizeOption?.z ?? sizeOption) || 2000;
  const halfExtent = Math.min(width, depth) / 2;

  // Camera planes and fov are part of the scale contract.
  if (camera && applyCamera !== false && worldPreset.camera) {
    if (Number.isFinite(worldPreset.camera.fov)) camera.fov = worldPreset.camera.fov;
    if (Number.isFinite(worldPreset.camera.near)) camera.near = worldPreset.camera.near;
    if (Number.isFinite(worldPreset.camera.far)) camera.far = worldPreset.camera.far;
    camera.updateProjectionMatrix();
  }

  // Paths are built before the environment conversion so they receive the
  // same environment treatment as the terrain.
  const earlyWaterLevel = water !== false ? Number(cleanObject(water).level) || 0 : 0;
  // Path network before the environment conversion, so ribbons and bridges
  // parented under the terrain root get shaded (and join the height fog)
  // exactly like the terrain itself. Accepts a prebuilt network or builds
  // one here from the terrain contract.
  let pathsSystem = null;
  let ownsPaths = false;
  if (paths) {
    if (paths && typeof paths.maskAt === 'function' && paths.root) {
      pathsSystem = paths;
    } else if (heightAt) {
      const pathOptions = cleanObject(paths);
      const userRoutes = Array.isArray(pathOptions.routes) ? pathOptions.routes : [];
      const hasExplicit = userRoutes.length > 0;
      pathsSystem = createStylizedPaths({
        auto: pathOptions.auto
          ?? (hasExplicit ? null : { count: pathOptions.count ?? 4, styles: pathOptions.styles ?? ['dirt'] }),
        heightAt,
        routes: userRoutes,
        seed: pathOptions.seed ?? 1,
        settings: pathOptions.settings ?? {},
        size: { x: width, z: depth },
        waterLevel: earlyWaterLevel,
      });
      ownsPaths = true;
    }
    if (pathsSystem?.root && !pathsSystem.root.parent) terrainRoot.add(pathsSystem.root);
  }

  // Environment shading over the terrain (and anything parented under it).
  const environmentBox = new THREE.Box3().setFromObject(terrainRoot);
  const environmentPreset = resolveEnvironmentPreset(
    worldPreset.environment?.style ?? worldPreset.environment?.preset ?? 'default',
    worldPreset.environment?.scenario,
  ) ?? {};
  const environmentOverrides = cleanObject(worldPreset.environment?.overrides);
  const classification = await applyEnvironmentShader(terrainRoot, {
    ...environmentPreset,
    ...environmentOverrides,
    ...cleanObject(environment),
    environmentBox,
    hasSun: sun !== false,
    parameters: {
      ...cleanObject(environmentPreset.parameters),
      ...cleanObject(environmentOverrides.parameters),
      ...cleanObject(cleanObject(environment).parameters),
    },
  });

  // Keep the light rig aligned with the sky's visible sun — a sky sun in one
  // place and light from another reads flat and wrong, and near-vertical
  // light hides every cast shadow under its caster.
  const skySunDirection = cleanObject(cleanObject(skyOptions).settings).sunDirection
    ?? cleanObject(worldPreset.sky?.settings).sunDirection;
  // Unified atmosphere: scene.fog reaches every material class — converted
  // environment surfaces, unlit forest far proxies, rock clones — so distant
  // geometry fades into haze silhouettes together. (The environment
  // shader's height fog layers altitude nuance on top; without scene.fog,
  // far trees float sharp and saturated at any distance.)
  let sceneFog = null;
  if (fog !== false) {
    const fogOptions = cleanObject(fog);
    const fogColor = fogOptions.color
      ?? cleanObject(environmentOverrides.parameters).heightFogColor
      ?? cleanObject(cleanObject(environment).parameters).heightFogColor
      ?? [0.72, 0.83, 0.94];
    const presetFar = Number(worldPreset.camera?.far) || 600;
    sceneFog = new THREE.Fog(
      new THREE.Color(...(Array.isArray(fogColor) ? fogColor : [fogColor])),
      Number(fogOptions.near) || presetFar * 0.3,
      Number(fogOptions.far) || presetFar * 1.4,
    );
    scene.fog = sceneFog;
  }

  // Resolved height-fog parameters (preset overrides, then host overrides).
  // Water and forest far proxies mirror this layer — any surface that skips it
  // stays sharp against hazed terrain and reads as pasted-on.
  const heightFogParams = {
    ...cleanObject(environmentOverrides.parameters),
    ...cleanObject(cleanObject(environment).parameters),
  };

  const sunRig = sun !== false
    ? createEnvironmentSunRig({
      environmentBox,
      scene,
      ...(Array.isArray(skySunDirection) ? {
        sourceRatios: {
          x: skySunDirection[0],
          y: Math.max(skySunDirection[1], 0.2),
          z: skySunDirection[2],
        },
      } : {}),
    })
    : null;
  const sunDirectionState = Array.isArray(skySunDirection)
    ? new THREE.Vector3(...skySunDirection)
    : (sunRig?.light
      ? sunRig.light.position.clone().sub(sunRig.light.target.position)
      : new THREE.Vector3(0.35, 0.8, 0.45));
  if (sunDirectionState.lengthSq() < 1e-8) sunDirectionState.set(0.35, 0.8, 0.45);
  sunDirectionState.normalize();
  const sunColorState = [1, 0.96, 0.84];
  const sunSkyColorState = [0.62, 0.78, 0.95];

  // Shadows are ON by default — a character that casts nothing on the grass
  // is the fastest way for a stylized world to read fake. The renderer's
  // shadow maps are enabled, everything under the terrain root casts and
  // receives, the follow target casts, and — critically — the sun's shadow
  // camera is shrunk to a window (default 140 m) that FOLLOWS the target:
  // one map stretched across a whole open world has no texel density left
  // for a character-sized shadow. Pass `shadows: false` to opt out, or
  // `shadows: { area }` to resize the window.
  const shadowOptions = cleanObject(shadows);
  const shadowArea = shadows === false ? 0 : Number(shadowOptions.area) || 140;
  let sunShadowOffset = null;
  if (shadowArea > 0) {
    if (renderer.shadowMap) renderer.shadowMap.enabled = true;
    terrainRoot.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    followTarget?.traverse?.((object) => {
      if (object.isMesh) object.castShadow = true;
    });
    if (sunRig?.light) {
      const light = sunRig.light;
      const shadowCamera = light.shadow.camera;
      shadowCamera.left = -shadowArea;
      shadowCamera.right = shadowArea;
      shadowCamera.top = shadowArea;
      shadowCamera.bottom = -shadowArea;
      shadowCamera.near = 0.5;
      shadowCamera.far = shadowArea * 6 + 400;
      shadowCamera.updateProjectionMatrix();
      // Tight window + high sun → self-shadow acne on flat ground without a
      // healthy normal bias.
      light.shadow.normalBias = Math.max(light.shadow.normalBias ?? 0, 0.5);
      // Derive the shadow sun's direction from the sky's actual sun vector.
      // (Deriving it from the rig light's box-relative position warps the
      // elevation by the terrain box's aspect ratio — a 2 km × 200 m box
      // squashes a 2 PM sun nearly horizontal, and shadows land tens of
      // meters away from their casters.)
      sunShadowOffset = sunDirectionState.clone().multiplyScalar(shadowArea * 3 + 120);
      scene.add(light.target);
    }
  }
  // On the TSL/WebGPU backends three's shadow system is bypassed by design;
  // this pass renders the sun's shadow map each frame and publishes it to
  // the environment and character shaders. Without it there are NO shadows,
  // regardless of castShadow flags — which is why the composed world owns it.
  const sunShadowPass = shadowArea > 0 && sunRig?.light
    ? createEnvironmentSunShadowPass({ renderer, scene })
    : null;
  const shadowInterval = Math.max(Math.trunc(shadowOptions.interval ?? 2), 1);
  let shadowFrame = 0;

  const followSunShadow = () => {
    if (!sunShadowOffset || !sunRig?.light) return;
    const focus = followTarget?.position ?? camera?.position;
    if (!focus) return;
    sunRig.light.position.copy(focus).add(sunShadowOffset);
    sunRig.light.target.position.copy(focus);
    sunRig.light.target.updateMatrixWorld();
  };
  followSunShadow();

  // One scene-input adapter keeps the actual DirectionalLight, shadow follow,
  // and every custom vegetation shader on the same sun/sky values. These are
  // transient scene values: authored Grass/Flower/Tree settings stay intact.
  const setSun = ({ direction, color, sky: skyColor } = {}) => {
    if (direction !== undefined) {
      const channels = direction?.isVector3
        ? [direction.x, direction.y, direction.z]
        : direction;
      if (Array.isArray(channels) && channels.length >= 3) {
        const next = channels.slice(0, 3).map(Number);
        if (next.every(Number.isFinite)) sunDirectionState.fromArray(next);
      }
      if (sunDirectionState.lengthSq() < 1e-8) sunDirectionState.set(0.35, 0.8, 0.45);
      sunDirectionState.normalize();
    }
    if (color !== undefined) sunColorState.splice(0, 3, ...sunColorArray(color, sunColorState));
    if (skyColor !== undefined) sunSkyColorState.splice(0, 3, ...sunColorArray(skyColor, sunSkyColorState));

    // A direction is not an environment-relative point. The rig owns a true
    // direction adapter so non-square worlds and shadows:false remain aligned.
    sunRig?.setDirection?.(sunDirectionState);
    sunRig?.setState?.({ color: new THREE.Color().setRGB(...sunColorState) });
    if (sunShadowOffset) {
      sunShadowOffset.copy(sunDirectionState).multiplyScalar(shadowArea * 3 + 120);
      followSunShadow();
    }

    const current = {
      color: sunColorState.slice(),
      direction: sunDirectionState.toArray(),
      sky: sunSkyColorState.slice(),
    };
    grassField?.setSun?.(current);
    flowerField?.setSun?.(current);
    forest?.setSun?.(current);
    ambientFx?.setSun?.({ direction: current.direction });
    // Nothing pushes a direction at the volumetric sky: its own day/night clock
    // owns sun.direction (autoAdvanceSecondsPerDay 0 is what frees it), so the
    // adoption runs the other way — see followVolumetricSun below.
    return current;
  };
  const setSunDirection = (value) => setSun({ direction: value }).direction;

  // Sky dome — the water's reflection fallback, so it comes before water.
  // Passing a v2 Sky Shader document opts into the Three.js Preetham base;
  // historical world presets retain StylizedSky byte-for-byte.
  const runtimeDocuments = cleanObject(documents);
  const skyOptionRecord = cleanObject(skyOptions);
  const skyDocument = cleanObject(runtimeDocuments.sky ?? skyOptionRecord.document);
  const usesAtmosphereDocument = skyDocument.type === 'toonlab/sky-shader-preset'
    || skyOptionRecord.atmosphere
    || skyOptionRecord.timeKeyframes;
  const sky = usesAtmosphereDocument
    ? new AtmosphereSky({
      atmosphere: skyDocument.atmosphere ?? skyOptionRecord.atmosphere,
      hour: skyOptionRecord.hour ?? 13,
      radius: skyOptionRecord.radius ?? 10_000,
      settings: skyDocument.settings ?? skyOptionRecord.settings,
      timeKeyframes: skyDocument.timeKeyframes ?? skyOptionRecord.timeKeyframes,
    })
    : new StylizedSky({
    preset: skyOptionRecord.style
      ?? skyOptionRecord.preset
      ?? worldPreset.sky?.style
      ?? worldPreset.sky?.preset,
    scenario: skyOptionRecord.scenario ?? worldPreset.sky?.scenario,
    ...cleanObject(worldPreset.sky?.settings),
    ...cleanObject(skyOptionRecord.settings),
  });
  scene.add(sky);
  // Volumetric clouds. The retired path here built a 2.5D card field from
  // { cloudSources, cloudShader, cloudComposition } documents; per
  // docs/sky-cloud-parameters.md defines the active treatment, and the
  // single document that replaces all three is a SkyParams one. It arrives as
  // documents.volumetricSky (or sky.volumetricSky), never as documents.sky —
  // that slot still selects between StylizedSky and AtmosphereSky above, and a
  // SkyParams document there would be ambiguous.
  //
  // The raymarcher is a sibling of the dome, exactly the slot the card field
  // occupied: Weather and the water reflections target `sky`, so the stylized
  // dome stays the backdrop and only the volumetric cloud deck draws over it.
  const volumetricDocument = runtimeDocuments.volumetricSky
    ?? skyOptionRecord.volumetricSky
    ?? null;
  let volumetricSky = null;
  if (volumetricDocument) {
    // Anything supplied here goes through the validator, including a document
    // with the wrong `type`. Type-testing first and skipping a mismatch would
    // make a typo indistinguishable from asking for no clouds at all.
    const parsed = parseSkyParamsDocument(volumetricDocument);
    if (!parsed.ok) {
      throw new Error(`createStylizedWorld volumetric sky document: ${parsed.errors.join(' ')}`);
    }
    if (!camera) {
      // The marcher reads the camera every frame to build its ray basis and to
      // reproject last frame's cloud image. Failing here beats rendering an
      // empty sky and leaving the host to guess why.
      throw new Error('createStylizedWorld needs a camera to render the volumetric sky.');
    }
    volumetricSky = await SkySystem.create({
      camera,
      quality: skyOptionRecord.quality,
      renderer,
      scene,
    });
    await volumetricSky.applyPreset(parsed.value.params);
    volumetricSky.groundLevel = environmentBox.min.y;
    // One backdrop, not two. The system's own atmosphere dome would z-fight the
    // world's for the same pixels; its scattering still lights the clouds,
    // which is the half this path is here for.
    volumetricSky.dome.group.visible = false;
    // Same suppression the card field used: the stylized dome paints its own
    // clouds, and two cloud treatments over one sky read as a double exposure.
    sky.setSceneOverrideLayer?.('volumetricSky', { cloudOpacity: 0 }, { priority: 80 });
  }

  // The volumetric clock is authoritative for its own sun, so the world adopts
  // that direction rather than pushing one in. Guarded by a real move: with the
  // clock paused this settles after one call, and with it running the terrain,
  // canopies and water track the sun the sky is actually drawing.
  //
  // Not called here. `setSun` writes to grassField, forest, flowerField and the
  // fauna/ambient systems, all declared below, so calling it this early is a
  // temporal-dead-zone throw rather than an early sun. The first adoption rides
  // with the existing "align all scene consumers" call further down.
  const volumetricSunDirection = new THREE.Vector3();
  const followVolumetricSun = () => {
    if (!volumetricSky) return;
    const next = volumetricSky.sun.direction.value;
    if (volumetricSunDirection.distanceToSquared(next) < 1e-8) return;
    volumetricSunDirection.copy(next);
    setSun({ direction: volumetricSunDirection });
  };
  if (usesAtmosphereDocument) {
    const initialTime = sky.setTime(skyOptionRecord.hour ?? 13);
    sunDirectionState.fromArray(initialTime.sunDirection).normalize();
    sunRig?.setDirection?.(sunDirectionState);
    if (sunShadowOffset) {
      sunShadowOffset.copy(sunDirectionState).multiplyScalar(shadowArea * 3 + 120);
      followSunShadow();
    }
  }

  // Water with the terrain as its bed: waves shoal and break on real shores.
  const waterLevel = Number(cleanObject(water).level) || 0;
  let waterSurface = null;
  if (water !== false) {
    const waterOptions = cleanObject(water);
    const {
      depth: configuredDepth,
      level: _waterLevel,
      settings: configuredWaterSettings,
      width: configuredWidth,
      ...waterRuntimeOptions
    } = waterOptions;
    waterSurface = new WaterSurface({
      preset: worldPreset.water?.preset,
      style: worldPreset.water?.style,
      width: Number(configuredWidth) || width,
      depth: Number(configuredDepth) || depth,
      ...(heightAt ? { bedHeight: heightAt } : {}),
      // Runtime stages (passes/simulation/splashes/currentField/etc.) are
      // valid composed-world options too; previously only material settings
      // made it through this wrapper.
      ...waterRuntimeOptions,
      ...cleanObject(configuredWaterSettings),
    });
    waterSurface.position.y = waterLevel;
    // Match the environment's height fog so far-shore water hazes exactly
    // like the terrain behind it (mismatch reads as water slicing into the
    // mountains).
    waterSurface.setDistanceFog?.({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      // Zero is a valid explicit opt-out. `Number(value) || fallback` used
      // to turn it back into dense fog on every non-environment material.
      density: finiteOr(heightFogParams.heightFogDensity, 0.00055),
    });
    scene.add(waterSurface);
    if (followTarget) {
      waterSurface.addInteractor(followTarget, { radius: 0.35 });
      waterSurface.setFollowTarget(followTarget);
    }
  }

  // Placement masks: no vegetation on cliffs, under water, or on paths.
  const masks = heightAt
    ? {
      slope: createSlopeMask({ heightAt, maxSlope: 0.55 }),
      water: createWaterMask({ heightAt, margin: 0.4, waterLevel }),
    }
    : null;
  if (masks && pathsSystem) {
    // Grass/flowers/trees part around the network instead of growing
    // through the road surface. The low threshold clears a shoulder wide
    // enough that meter-tall blades can't lean over the ribbon.
    masks.paths = (x, z) => pathsSystem.maskAt(x, z) <= 0.12;
  }
  const vegetationMask = masks
    ? combineMasks(masks.slope, masks.water, masks.paths)
    : (pathsSystem ? (x, z) => pathsSystem.maskAt(x, z) <= 0.12 : null);
  const defaultCenter = followTarget?.position ?? { x: 0, z: 0 };
  // Per-system custom masks (e.g. a createNoisePatchMask forest-cluster
  // mask) AND with the built-in slope/water masks.
  const withWorldMask = (custom) => {
    if (typeof custom !== 'function') return vegetationMask;
    return vegetationMask ? combineMasks(vegetationMask, custom) : custom;
  };

  // Trees: LOD forest. Far placements render as instanced volumetric proxies
  // (a couple of draw calls per variant); a budgeted pool of live detailed
  // trees swaps in around the camera. See StylizedForest.
  let forest = null;
  if (trees !== false) {
    const treeOptions = cleanObject(trees);
    const placements = scatterForest({
      ...cleanObject(worldPreset.trees?.scatter),
      center: treeOptions.center ?? defaultCenter,
      radius: Math.min(cleanObject(treeOptions.scatter).radius
        ?? cleanObject(worldPreset.trees?.scatter).radius ?? halfExtent, halfExtent),
      ...cleanObject(treeOptions.scatter),
      heightAt,
      mask: withWorldMask(treeOptions.mask),
    });
    forest = new StylizedForest({
      canopyColors: treeOptions.canopyColors ?? worldPreset.trees?.canopyColors ?? null,
      placements,
      preset: worldPreset.trees?.preset,
      // Volumetric far LOD: without the renderer the forest falls back to
      // merged high-detail geometry (~12k verts/tree) that gets redrawn by the
      // main, water, and shadow passes — the difference between 20 and 60 fps.
      renderer,
      vegetationShader: vegetationShaderSettingsByFamily.tree,
      settings: {
        ...cleanObject(worldPreset.trees?.settings),
        ...cleanObject(treeOptions.settings),
      },
      ...cleanObject(worldPreset.trees?.lod),
      ...cleanObject(treeOptions.lod),
    });
    // Same height-fog layer the terrain and water get: without it, far
    // far canopies only receive the linear scene.fog and float on the
    // fogged mountains as saturated green dots.
    forest.setDistanceFog({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      density: finiteOr(heightFogParams.heightFogDensity, 0.00055),
      falloff: finiteOr(heightFogParams.heightFogFalloff, 400),
      floorY: environmentBox.min.y,
    });
    scene.add(forest);
  }

  // Three explicit height layers are part of the outdoor preset contract:
  // canopy (forest), understory shrubs/rosettes, and the grass field below.
  // Both middle-layer meshes are instanced and hard-capped.
  let understoryLayer = null;
  let understoryPlacements = null;
  if (understory !== false && forest && worldPreset.understory?.enabled !== false) {
    const understoryOptions = cleanObject(understory);
    understoryPlacements = scatterUnderstory({
      ...cleanObject(worldPreset.understory?.scatter),
      ...cleanObject(understoryOptions.scatter),
      forestPlacements: forest.placements,
      heightAt,
      mask: withWorldMask(understoryOptions.mask ?? cleanObject(trees).mask),
    });
    understoryLayer = new StylizedUnderstory({
      ...understoryPlacements,
      ...cleanObject(worldPreset.understory?.settings),
      ...cleanObject(understoryOptions.settings),
    });
    scene.add(understoryLayer);
  }

  // Broad, luminous contact pools ground trees and rocks at one draw call.
  // They complement (not replace) the terrain's baked vertex AO and are
  // deliberately capped below 0.22 opacity so they cannot become black blobs.
  let contactShadowField = null;
  if (contactShadows !== false) {
    const contactOptions = {
      ...cleanObject(worldPreset.contactShadows),
      ...cleanObject(contactShadows),
    };
    const placements = [];
    if (forest) {
      const treeRadius = Number(contactOptions.treeRadius) || 1.25;
      for (const tree of forest.placements) placements.push({
        aspect: 0.72,
        radius: treeRadius,
        rotation: ((tree.seed >>> 4) % 628) / 100,
        x: tree.x,
        y: tree.y,
        z: tree.z,
      });
    }
    if (understoryPlacements) {
      for (const shrub of understoryPlacements.shrubs) placements.push({
        aspect: 0.78, radius: 0.55, x: shrub.x, y: shrub.y, z: shrub.z,
      });
    }
    placements.push(...collectRockContactPlacements(terrainRoot, heightAt));
    if (placements.length > 0) {
      contactShadowField = new StylizedContactShadowField({
        color: contactOptions.color,
        opacity: Math.min(Number(contactOptions.opacity) || 0.15, 0.22),
        placements,
      });
      scene.add(contactShadowField);
    }
  }

  // Grass: a density-based window that follows the target. Placements are
  // construction-only, so when the target strays past half the radius the
  // field is rebuilt at the new center and swapped; a distance fade hides
  // the window edge. Far grass simply doesn't exist — same as the anime
  // games this emulates.
  let grassField = null;
  let weatherSystem = null;
  const grassState = { center: null, options: cleanObject(grass), radius: 0 };
  const buildGrassAt = async (center) => {
    const grassOptions = grassState.options;
    const scatterSpec = {
      ...cleanObject(worldPreset.grass?.scatter),
      ...cleanObject(grassOptions.scatter),
    };
    grassState.radius = Number(scatterSpec.radius) || 45;
    const placements = scatterGrassAround({
      ...scatterSpec,
      center,
      heightAt,
      mask: withWorldMask(grassOptions.mask),
    });
    if (placements.length === 0) return null;
    const authoredGrass = grassOptions.mode !== 'procedural'
      && worldPreset.grass?.mode !== 'procedural';
    const field = authoredGrass
      ? await createCallMeSenseiGrassField({
          ...cleanObject(worldPreset.grass?.settings),
          ...cleanObject(grassOptions.settings),
          placements,
          variant: grassOptions.variant ?? worldPreset.grass?.variant ?? 'primary',
        })
      : new StylizedGrassClumpField({
          preset: worldPreset.grass?.preset,
          ...cleanObject(worldPreset.grass?.settings),
          ...cleanObject(grassOptions.settings),
          vegetationShader: vegetationShaderSettingsByFamily.grass,
          placements,
        });
    field.setDistanceFade?.({ end: grassState.radius * 0.98, start: grassState.radius * 0.62 });
    // 300k blades re-rendered into the water reflection, refraction grab,
    // and depth passes is pure cost — grass sits above the waterline, so
    // its contribution to all three is invisible at gameplay angles.
    // (waterExclude hides from every water scene pass.)
    field.userData.waterExclude = true;
    scene.add(field);
    if (followTarget) field.setPushTarget?.(followTarget);
    grassState.center = { x: Number(center.x) || 0, z: Number(center.z) || 0 };
    return field;
  };
  if (grass !== false) {
    grassField = await buildGrassAt(cleanObject(grass).center ?? defaultCenter);
  }
  let grassBuildPromise = null;
  const refreshGrassWindow = () => {
    if (grass === false || !followTarget || !grassState.center || grassBuildPromise) return;
    const dx = followTarget.position.x - grassState.center.x;
    const dz = followTarget.position.z - grassState.center.z;
    if (dx * dx + dz * dz < (grassState.radius * 0.5) ** 2) return;
    const nextCenter = followTarget.position.clone();
    grassBuildPromise = buildGrassAt(nextCenter)
      .then((next) => {
        if (!next || disposed) {
          if (next?.parent) next.parent.remove(next);
          next?.dispose();
          return;
        }
        const previous = grassField;
        grassField = next;
        if (previous && grassField !== previous) {
          scene.remove(previous);
          previous.dispose();
          weatherSystem?.refresh();
        }
      })
      .finally(() => {
        grassBuildPromise = null;
      });
  };

  let flowerField = null;
  if (flowers) {
    const flowerOptions = cleanObject(flowers);
    const placements = scatterGrassAround({
      center: flowerOptions.center ?? defaultCenter,
      density: 0.4,
      radius: 30,
      seed: 11,
      ...cleanObject(flowerOptions.scatter),
      heightAt,
      mask: withWorldMask(flowerOptions.mask),
    });
    if (placements.length > 0) {
      flowerField = new StylizedFlowerField({
        ...cleanObject(flowerOptions.settings),
        vegetationShader: vegetationShaderSettingsByFamily.flower,
        placements,
      });
      scene.add(flowerField);
    }
  }

  // The living layer: instanced GPU-animated ambient creatures, staggered
  // steering, budgets as populations. Off unless asked for.
  let faunaSystem = null;
  if (fauna && heightAt) {
    const faunaOptions = cleanObject(fauna);
    faunaSystem = createFauna({
      bounds: { x: width / 2 - 10, z: depth / 2 - 10 },
      followTarget,
      heightAt,
      masks: { flowers: faunaOptions.flowerMask ?? vegetationMask ?? null },
      preset: faunaOptions.preset ?? null,
      seed: faunaOptions.seed ?? 1,
      settings: faunaOptions.settings ?? {},
      species: faunaOptions.species ?? {},
      waterLevel,
    });
    // Same height-fog layer terrain/water/forest get — birds that skip it
    // stay sharp saturated specks on hazed mountains.
    faunaSystem.setDistanceFog({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      density: finiteOr(heightFogParams.heightFogDensity, 0.00055),
      falloff: finiteOr(heightFogParams.heightFogFalloff, 400),
      floorY: environmentBox.min.y,
    });
    scene.add(faunaSystem.root);
  }

  // Ambient atmosphere: petals/leaves/fireflies/pollen/mist over one GPU
  // particle backbone, in a follow window like the grass. One wind for the
  // whole world.
  let ambientFx = null;
  if (ambientfx) {
    const fxOptions = cleanObject(ambientfx);
    ambientFx = createAmbientFx({
      followTarget,
      heightAt,
      seed: Number(fxOptions.seed) || 1,
      waterLevel: waterSurface ? waterLevel : null,
      ...fxOptions,
    });
    const grassWind = grassField?.settings ?? {};
    ambientFx.setWind({
      windDirection: grassWind.windDirection,
      windSpeed: grassWind.windSpeed,
      windStrength: grassWind.windStrength,
    });
    ambientFx.setDistanceFog({
      color: heightFogParams.heightFogColor ?? [0.66, 0.8, 0.94],
      density: finiteOr(heightFogParams.heightFogDensity, 0.00055),
      falloff: finiteOr(heightFogParams.heightFogFalloff, 400),
      floorY: environmentBox.min.y,
    });
    if (Array.isArray(skySunDirection)) ambientFx.setSun({ direction: skySunDirection });
    scene.add(ambientFx.root);
  }

  // Align all scene consumers with the authored Sky before Weather or an
  // optional LightingSystem adds transient layers.
  setSun({
    color: sky.renderedSettings?.sunColor ?? sky.settings?.sunColor,
    direction: sunDirectionState,
    sky: sky.renderedSettings?.horizonColor ?? sky.settings?.horizonColor,
  });
  // Last word on direction when a volumetric sky is present: its clock solved
  // the pose the cloud deck is lit by, so the ground has to agree with it.
  followVolumetricSun();

  // Walkability: circle blockers on a spatial hash, tree trunks
  // pre-registered, so characters can't walk through the world ToonLab just
  // built. Hosts add their own blockers (rocks, props) via
  // `world.collision.addCircles(...)` and call
  // `world.collision.resolve(character.position, radius)` per frame.
  // Ground truth follows the flattened path profile where one exists, so
  // characters walk the road surface (and bridge decks) instead of the raw
  // terrain underneath.
  const collision = createWorldCollision({ heightAt: pathsSystem?.heightAt ?? heightAt });
  if (pathsSystem?.blockers?.length) collision.addCircles(pathsSystem.blockers);
  if (forest) {
    const trunkScale = [
      cleanObject(cleanObject(trees).settings).size,
      cleanObject(worldPreset.trees?.settings).size,
      3.2,
    ].map(Number).find(Number.isFinite);
    const trunkRadius = Math.max(0.13 * trunkScale, 0.2);
    collision.addCircles(forest.placements.map((p) => ({ radius: trunkRadius, x: p.x, z: p.z })));
  }

  // One cloud-shadow field across terrain shader, water, grass, and canopies.
  //
  // The card field used to override this with its own authored { coverage,
  // scale, softness, velocity }, so ground shadows matched the painted cards.
  // The volumetric system has no scalar equivalent — SkySystem.cloudShadow() is
  // a TSL node sampling the marcher's real density along the light — and the
  // top-down bake that would feed these uniforms is src/sky/cloudShadow.js,
  // which is not built. So the procedural weather-driven field stands on its
  // own here rather than being faked from cloud.shape.coverage: a made-up
  // mapping would look coordinated while shadowing nothing that is in the sky.
  const applyCloudShadow = (field) => {
    setEnvironmentCloudShadow(field);
    waterSurface?.setCloudShadow(field);
    grassField?.setCloudShadow(field);
    flowerField?.setCloudShadow(field);
    forest?.setCloudShadow(field);
    faunaSystem?.setCloudShadow?.(field);
  };
  if (weather === false) {
    if (cloudShadows !== false) applyCloudShadow(
      cloudShadows === null ? { strength: 0.35 } : cleanObject(cloudShadows),
    );
  } else {
    const weatherOptions = cleanObject(weather);
    const presetWeatherSettings = cleanObject(worldPreset.weather?.settings);
    const optionWeatherSettings = cleanObject(weatherOptions.settings);
    const weatherSettings = {
      ...presetWeatherSettings,
      ...optionWeatherSettings,
      atmosphere: {
        ...cleanObject(presetWeatherSettings.atmosphere),
        ...cleanObject(optionWeatherSettings.atmosphere),
      },
    };
    const legacyCloud = cloudShadows === false
      ? { strength: 0 }
      : (cloudShadows === null ? {} : cleanObject(cloudShadows));
    weatherSystem = createWeatherSystem({
      ambientFx,
      camera,
      environmentRoot: terrainRoot,
      fauna: faunaSystem,
      flowers: flowerField,
      followTarget,
      forest: () => forest,
      getSun: () => ({
        color: sunColorState.slice(),
        direction: sunDirectionState.toArray(),
        sky: sunSkyColorState.slice(),
      }),
      grass: () => grassField,
      groundHeightAt: heightAt,
      precipitationFloorY: environmentBox.min.y,
      preset: weatherOptions.preset ?? worldPreset.weather?.preset ?? 'clear',
      renderer,
      scene,
      seed: Number(weatherOptions.seed) || 1,
      setCloudShadow: applyCloudShadow,
      setSun,
      settings: {
        ...weatherSettings,
        atmosphere: {
          ...cleanObject(weatherSettings.atmosphere),
          ...(Number.isFinite(legacyCloud.strength) ? { cloudShadowStrength: legacyCloud.strength } : {}),
          ...(Number.isFinite(legacyCloud.coverage) ? { cloudShadowCoverage: legacyCloud.coverage } : {}),
          ...(Number.isFinite(legacyCloud.scale) ? { cloudShadowScale: legacyCloud.scale } : {}),
        },
      },
      sky,
      style: weatherOptions.style ?? worldPreset.weather?.style ?? 'call_me_sensei',
      sunRig,
      water: waterSurface,
    });
  }

  const groundFieldPass = groundField === false
    ? null
    : createEnvironmentGroundFieldPass({
      renderer,
      resolution: finiteOr(cleanObject(groundField).resolution, 2048),
      scene,
    });

  let disposed = false;
  return {
    classification,
    collision,
    dispose() {
      if (disposed) return;
      disposed = true;
      groundFieldPass?.dispose();
      sunShadowPass?.dispose();
      forest?.dispose();
      understoryLayer?.dispose();
      contactShadowField?.dispose();
      if (ownsPaths) pathsSystem?.dispose();
      faunaSystem?.dispose();
      ambientFx?.dispose();
      weatherSystem?.dispose();
      // Removes its own backdrops from the scene; the shared noise volumes and
      // weather maps are module-level caches it deliberately leaves alone.
      volumetricSky?.dispose();
      sky?.dispose?.();
      for (const object of [sky, waterSurface, forest, understoryLayer, contactShadowField, grassField, flowerField,
        faunaSystem?.root, ambientFx?.root, sunRig?.group ?? sunRig]) {
        if (object?.parent) object.parent.remove(object);
      }
    },
    flowerField,
    fog: sceneFog,
    forest,
    understory: understoryLayer,
    contactShadows: contactShadowField,
    /** The raymarched SkySystem, or null when no SkyParams document was given. */
    volumetricSky,
    documents: runtimeDocuments,
    environmentRoot: terrainRoot,
    groundField: groundFieldPass,
    get grass() { return grassField; },
    ambientFx,
    fauna: faunaSystem,
    masks,
    paths: pathsSystem,
    setCloudShadow: applyCloudShadow,
    setSun,
    setSunDirection,
    setTime(hour) {
      const timeState = sky?.setTime?.(hour);
      if (Array.isArray(timeState?.sunDirection)) {
        setSun({ direction: timeState.sunDirection });
      }
      return timeState ?? null;
    },
    setVegetationShader(profile) {
      vegetationShaderSettings = createVegetationShaderSettings(profile);
      vegetationShaderSettingsByFamily = {
        flower: createVegetationShaderSettings(vegetationShaderSettings),
        grass: createVegetationShaderSettings(vegetationShaderSettings),
        tree: createVegetationShaderSettings(vegetationShaderSettings),
      };
      const reports = [
        applyVegetationShader(grassField, vegetationShaderSettingsByFamily.grass),
        applyVegetationShader(flowerField, vegetationShaderSettingsByFamily.flower),
        forest?.setVegetationShader?.(vegetationShaderSettingsByFamily.tree)
          ?? applyVegetationShader(forest, vegetationShaderSettingsByFamily.tree),
      ];
      return {
        applied: reports.reduce((sum, report) => sum + (report?.applied ?? 0), 0),
        reports,
        requiresForestImpostorRebake: Boolean(reports[2]?.requiresImpostorRebake),
        settings: vegetationShaderSettings,
        settingsByFamily: vegetationShaderSettingsByFamily,
        unsupported: reports.flatMap((report) => report?.unsupported ?? []),
        writes: reports.reduce((sum, report) => sum + (report?.writes ?? 0), 0),
      };
    },
    setVegetationShaders(profiles = {}) {
      const source = cleanObject(profiles);
      vegetationShaderSettingsByFamily = {
        flower: createVegetationShaderSettings(
          source.flower ?? vegetationShaderSettingsByFamily.flower,
        ),
        grass: createVegetationShaderSettings(
          source.grass ?? vegetationShaderSettingsByFamily.grass,
        ),
        tree: createVegetationShaderSettings(
          source.tree ?? vegetationShaderSettingsByFamily.tree,
        ),
      };
      const reports = {
        flower: applyVegetationShader(
          flowerField,
          vegetationShaderSettingsByFamily.flower,
        ),
        grass: applyVegetationShader(
          grassField,
          vegetationShaderSettingsByFamily.grass,
        ),
        tree: forest?.setVegetationShader?.(vegetationShaderSettingsByFamily.tree)
          ?? applyVegetationShader(forest, vegetationShaderSettingsByFamily.tree),
      };
      return {
        applied: Object.values(reports)
          .reduce((sum, report) => sum + (report?.applied ?? 0), 0),
        reports,
        requiresForestImpostorRebake: Boolean(
          reports.tree?.requiresImpostorRebake,
        ),
        settings: vegetationShaderSettingsByFamily,
        unsupported: Object.values(reports)
          .flatMap((report) => report?.unsupported ?? []),
        writes: Object.values(reports)
          .reduce((sum, report) => sum + (report?.writes ?? 0), 0),
      };
    },
    setWeather(presetOrSettings, options) {
      return weatherSystem?.transitionTo(presetOrSettings, options) ?? null;
    },
    sky,
    get sunState() {
      return {
        color: sunColorState.slice(),
        direction: sunDirectionState.toArray(),
        sky: sunSkyColorState.slice(),
      };
    },
    get sunDirection() { return sunDirectionState.toArray(); },
    sunRig,
    weather: weatherSystem,
    /** Call once per frame before rendering. */
    update(delta = 0.016) {
      if (disposed) return;
      advanceEnvironmentShaderTime(delta);
      followSunShadow();
      // Rendering the shadow map is a full scene pass; alternate frames are
      // imperceptible for a sun that barely moves (shadows.interval: 1 to
      // force every frame).
      shadowFrame += 1;
      if (sunShadowPass && shadowFrame % shadowInterval === 0) sunShadowPass.update();
      groundFieldPass?.update();
      refreshGrassWindow();
      weatherSystem?.update(delta);
      faunaSystem?.update(delta);
      ambientFx?.update(delta, camera);
      waterSurface?.update(renderer, scene, camera, delta);
      sky.update(delta, camera);
      // Marches and reprojects the cloud image for this frame, so it runs
      // before the scene pass that composites the backdrop.
      volumetricSky?.update(delta);
      followVolumetricSun();
      grassField?.update(delta, camera);
      flowerField?.update(delta);
      forest?.update(delta, camera);
      understoryLayer?.update(camera);
      contactShadowField?.update(camera);
    },
    water: waterSurface,
    worldPreset,
  };
}
